import * as Axiom from '@alchemy.run/axiom'
import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Output from 'alchemy/Output'
import { Stage } from 'alchemy/Stage'
import {
  Array,
  Config,
  DateTime,
  Effect,
  Layer,
  Redacted,
  Result,
  Schema,
  Stream,
} from 'effect'
import {
  HttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from 'effect/http-api'
import HubDO from './hubDO'
import MonitorDO from './monitorDO'
import { Ingest, Logs, Traces } from './observability'
import { Checks, ChecksDead, ChecksMessage } from './queues'
import { CheckRepository } from './repositories/Check'
import { DeadLetterRepository } from './repositories/DeadLetter'
import { MonitorRepository } from './repositories/Monitor'
import { Check, type CheckResult } from './types/Check'
import { Incident } from './types/Incident'
import { Monitor, MonitorEvent } from './types/Monitor'
import { PlatformServices } from './utils/PlatformServices'
import { isDue } from './utils/due'

class BearerTokenAuthentication extends HttpApiMiddleware.Service<
  BearerTokenAuthentication,
  { provides: never }
>()('BearerTokenAuthentication', {
  error: [HttpApiError.Unauthorized],
  security: { bearer: HttpApiSecurity.bearer },
}) {}

export const WorkerApi = HttpApi.make('WorkerApi')
  .add(
    HttpApiGroup.make('App').add(
      HttpApiEndpoint.get('health', '/health', {
        success: Schema.Literal('ok').pipe(HttpApiSchema.asText()),
      }),
    ),
    HttpApiGroup.make('Monitors').add(
      HttpApiEndpoint.get('list', '/monitors', {
        success: Schema.Array(Monitor),
      }),
      HttpApiEndpoint.get('get', '/monitors/:id', {
        params: Schema.Struct({ id: Schema.String }),
        success: Monitor,
        error: HttpApiError.NotFound,
      }),
      HttpApiEndpoint.post('create', '/monitors', {
        payload: Schema.Struct({
          url: Schema.String,
          interval: Schema.optional(Schema.DurationFromString),
        }),
        success: Schema.Struct({ id: Schema.String }),
      }),
      HttpApiEndpoint.delete('delete', '/monitors/:id', {
        params: Schema.Struct({ id: Schema.String }),
        success: Schema.Void,
      }),
      HttpApiEndpoint.get('status', '/monitors/:id/status', {
        params: Schema.Struct({ id: Schema.String }),
        success: Schema.Literals(['up', 'down', 'unknown']),
        error: HttpApiError.NotFound,
      }),
      HttpApiEndpoint.get('incidents', '/monitors/:id/incidents', {
        params: Schema.Struct({ id: Schema.String }),
        success: Schema.Array(Incident),
        error: HttpApiError.NotFound,
      }),
      HttpApiEndpoint.get('checks', '/monitors/:id/checks', {
        params: Schema.Struct({ id: Schema.String }),
        success: Schema.Array(Check),
        error: HttpApiError.NotFound,
      }),
    ),
  )
  .middleware(BearerTokenAuthentication)

const BearerTokenAuthenticationDefault = Layer.effect(
  BearerTokenAuthentication,
  Effect.gen(function* () {
    const authToken = yield* Config.Redacted('AUTH_TOKEN')
    return {
      bearer: (effect, { credential }) =>
        Effect.gen(function* () {
          const bearerToken = Redacted.value(credential)
          if (bearerToken !== Redacted.value(authToken))
            return yield* new HttpApiError.Unauthorized()
        }).pipe(Effect.flatMap(() => effect)),
    }
  }),
)

export default Cloudflare.Worker(
  'Worker',
  {
    main: import.meta.url,
    name: Stage.useSync(stage =>
      stage === 'prod' ? 'pulse-api' : undefined,
    ).pipe(Output.fromEffect),
  },
  Effect.gen(function* () {
    const monitorHttpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.timeout('10 seconds'),
    )
    const monitorRepository = yield* MonitorRepository
    const monitorDO = yield* MonitorDO
    const hubDO = yield* HubDO
    const checkRepository = yield* CheckRepository
    const deadLetterRepository = yield* DeadLetterRepository
    const checksWrite = yield* Cloudflare.Queues.WriteQueue(Checks)
    const checks = yield* Checks
    const checksDead = yield* ChecksDead

    yield* Cloudflare.Workers.cron(
      '* * * * *',
      Effect.fn('Worker.cron')(
        function* (controller) {
          const scheduledTime = DateTime.startOf(
            DateTime.makeUnsafe(controller.scheduledTime),
            'minute',
          )
          const monitors = yield* monitorRepository.list()
          const dueMonitors = monitors.filter(monitor =>
            isDue(DateTime.makeUnsafe(scheduledTime), monitor.interval),
          )
          const encodedList = yield* Schema.encodeEffect(
            Schema.Array(Schema.toCodecJson(ChecksMessage)),
          )(
            dueMonitors.map(monitor => ({
              monitor,
              scheduledTime: DateTime.makeUnsafe(scheduledTime),
            })),
          )
          const batches = Array.chunksOf(encodedList, 100)
          yield* Effect.forEach(batches, batch =>
            checksWrite.sendBatch(batch.map(body => ({ body }))),
          )
        },
        Effect.tapCause(e => Effect.logError(e)),
      ),
    )

    yield* Cloudflare.Queues.consumeQueueMessages(
      checks,
      { batchSize: 5, maxRetries: 3, deadLetterQueue: checksDead },
      messages =>
        Stream.runForEach(
          messages,
          Effect.fn('Worker.checks.consumeQueueMessages')(
            function* (message) {
              const data = yield* Schema.decodeUnknownEffect(
                Schema.toCodecJson(ChecksMessage),
              )(message.body)
              const startedAt = yield* DateTime.now
              const [duration, result] = yield* monitorHttpClient
                .get(data.monitor.url)
                .pipe(Effect.result, Effect.timed)
              const monitorStub = yield* monitorDO.getByName(data.monitor.id)
              const checkResult: CheckResult = {
                ok: Result.isSuccess(result),
                scheduledTime: data.scheduledTime,
                checkedAt: startedAt,
                latency: duration,
                interval: data.monitor.interval,
              }
              yield* checkRepository.create({
                ...checkResult,
                monitorId: data.monitor.id,
              })
              yield* monitorStub.recordResult(checkResult)
              const state = yield* monitorStub.getState()
              yield* hubDO.getByName('default').broadcast(
                yield* MonitorEvent.toJsonEncoded({
                  _tag: 'changeMonitorState',
                  monitorId: data.monitor.id,
                  state: state,
                }),
              )
              message.ack()
            },
            (effect, message) =>
              Effect.catchCause(effect, e =>
                Effect.gen(function* () {
                  message.retry()
                  yield* Effect.logError(e)
                }),
              ),
          ),
        ),
    )

    yield* Cloudflare.Queues.consumeQueueMessages(checksDead, messages =>
      Stream.runForEach(
        messages,
        Effect.fn('Worker.checksDead.consumeQueueMessages')(
          function* (message) {
            yield* deadLetterRepository.create({ body: message.body })
          },
        ),
      ).pipe(Effect.tapCause(e => Effect.logError(e))),
    )

    const HttpApiLayer = HttpApiBuilder.layer(WorkerApi).pipe(
      Layer.provide(
        HttpApiBuilder.group(WorkerApi, 'App', _ =>
          _.handleAll({ health: () => Effect.succeed('ok') }),
        ),
      ),
      Layer.provide(
        HttpApiBuilder.group(WorkerApi, 'Monitors', _ =>
          _.handleAll({
            list: () =>
              monitorRepository.list().pipe(
                Effect.catchTags({
                  SchemaError: Effect.die,
                  SqlError: Effect.die,
                }),
              ),
            get: ({ params: { id } }) =>
              monitorRepository.get({ id }).pipe(
                Effect.catchTags({
                  NoSuchElementError: () => new HttpApiError.NotFound(),
                  SchemaError: Effect.die,
                  SqlError: Effect.die,
                }),
              ),
            create: ({ payload }) =>
              monitorRepository.create(payload).pipe(
                Effect.catchTags({
                  SqlError: Effect.die,
                }),
              ),
            delete: ({ params: { id } }) =>
              monitorRepository.delete({ id }).pipe(
                Effect.catchTags({
                  SqlError: Effect.die,
                }),
              ),
            incidents: ({ params: { id } }) =>
              Effect.gen(function* () {
                yield* monitorRepository.get({ id })
                return yield* (yield* monitorDO.getByName(id)).getIncidents()
              }).pipe(
                Effect.catchTags({
                  NoSuchElementError: () => new HttpApiError.NotFound(),
                  RpcClientError: Effect.die,
                  SchemaError: Effect.die,
                  SqlError: Effect.die,
                }),
              ),
            status: ({ params: { id } }) =>
              Effect.gen(function* () {
                yield* monitorRepository.get({ id })
                const state = yield* (yield* monitorDO.getByName(id)).getState()
                return state.status
              }).pipe(
                Effect.catchTags({
                  NoSuchElementError: () => new HttpApiError.NotFound(),
                  RpcClientError: Effect.die,
                  SchemaError: Effect.die,
                  SqlError: Effect.die,
                }),
              ),
            checks: ({ params: { id } }) =>
              Effect.gen(function* () {
                yield* monitorRepository.get({ id })
                return yield* checkRepository.list({ monitorId: id, size: 50 })
              }).pipe(
                Effect.catchTags({
                  NoSuchElementError: () => new HttpApiError.NotFound(),
                  SchemaError: Effect.die,
                  SqlError: Effect.die,
                }),
              ),
          }),
        ),
      ),
    )
    const apiHandler = yield* HttpRouter.toHttpEffect(HttpApiLayer)
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (request.url === '/ws') {
          if (request.headers.upgrade !== 'websocket') {
            return HttpServerResponse.text('Expected Upgrade: websocket', {
              status: 426,
            })
          }
          return yield* hubDO.getByName('default').fetch(request)
        }
        return yield* apiHandler
      }),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.Workers.CronEventSourceLive,
        Cloudflare.Queues.WriteQueueBinding,
        Cloudflare.Queues.EventSourceLive,
        BearerTokenAuthenticationDefault,
        Layer.mergeAll(
          CheckRepository.Default,
          MonitorRepository.Default,
          DeadLetterRepository.Default,
        ).pipe(Layer.provide(Cloudflare.D1.QueryDatabaseBinding)),
        PlatformServices,
      ).pipe(
        Layer.provideMerge(
          Axiom.Telemetry({ token: Ingest, traces: Traces, logs: Logs }),
        ),
      ),
    ),
  ),
)
