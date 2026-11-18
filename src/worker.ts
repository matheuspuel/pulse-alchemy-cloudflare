import * as Cloudflare from '@alchemy.run/cloudflare'
import { Config, Effect, Layer, Redacted, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from 'effect/http-api'
import { MonitorRepository } from './repositories/Monitor'
import { Monitor } from './types/Monitor'
import { PlatformServices } from './utils/PlatformServices'

class BearerTokenAuthentication extends HttpApiMiddleware.Service<
  BearerTokenAuthentication,
  { provides: never }
>()('BearerTokenAuthentication', {
  error: [HttpApiError.Unauthorized],
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const Api = HttpApi.make('WorkerApi')
  .add(
    HttpApiGroup.make('App').add(
      HttpApiEndpoint.get('health', '/health', {
        success: Schema.Literal('ok'),
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
        payload: Schema.Struct({ url: Schema.String }),
        success: Schema.Struct({ id: Schema.String }),
      }),
      HttpApiEndpoint.delete('delete', '/monitors/:id', {
        params: Schema.Struct({ id: Schema.String }),
        success: Schema.Void,
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
  { main: import.meta.url },
  Effect.gen(function* () {
    const monitorRepository = yield* MonitorRepository
    const HttpApiLayer = HttpApiBuilder.layer(Api).pipe(
      Layer.provide(
        HttpApiBuilder.group(Api, 'App', _ =>
          _.handleAll({ health: () => Effect.succeed('ok') }),
        ),
      ),
      Layer.provide(
        HttpApiBuilder.group(Api, 'Monitors', _ =>
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
              monitorRepository.create({ url: payload.url }).pipe(
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
          }),
        ),
      ),
    )
    return { fetch: yield* HttpRouter.toHttpEffect(HttpApiLayer) }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        BearerTokenAuthenticationDefault,
        MonitorRepository.Default.pipe(
          Layer.provide(Cloudflare.D1.QueryDatabaseBinding),
        ),
        PlatformServices,
      ),
    ),
  ),
)
