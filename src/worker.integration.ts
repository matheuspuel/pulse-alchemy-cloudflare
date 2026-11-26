import * as Cloudflare from '@alchemy.run/cloudflare'
import { expect } from '@alchemy.run/test'
import * as Test from '@alchemy.run/test/Vitest'
import { Config, Duration, Effect, Layer, Redacted } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { HttpApiClient, HttpApiError } from 'effect/http-api'
import Stack from '../alchemy.run'
import { Monitor } from './types/Monitor'
import { WorkerApi } from './worker'

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
  dev: !process.env.CI,
})

const getStack = beforeAll(deploy(Stack))
afterAll.skipIf(!process.env.CI)(destroy(Stack))

const AuthenticatedHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const authToken = yield* Config.Redacted('AUTH_TOKEN')
    const httpClient = yield* HttpClient.HttpClient
    return HttpClient.mapRequest(
      httpClient,
      HttpClientRequest.setHeaders({
        authorization: `Bearer ${Redacted.value(authToken)}`,
      }),
    )
  }),
)

const getApiClient = Effect.gen(function* () {
  const { workerUrl } = yield* getStack
  return yield* HttpApiClient.make(WorkerApi, { baseUrl: workerUrl }).pipe(
    Effect.provide(AuthenticatedHttpClient),
  )
})

test(
  'health',
  Effect.gen(function* () {
    const { workerUrl } = yield* getStack

    const response = yield* HttpClient.get(`${workerUrl}/health`)
    expect(yield* response.text).toBe('ok')
  }).pipe(Effect.provide(AuthenticatedHttpClient)),
)

test(
  'Monitors CRUD',
  Effect.gen(function* () {
    const api = yield* getApiClient
    yield* Effect.gen(function* () {
      yield* Effect.forEach(yield* api.Monitors.list(), monitor =>
        api.Monitors.delete({ params: { id: monitor.id } }),
      )
    }).pipe(Effect.orDie)

    expect(yield* api.Monitors.list()).toStrictEqual([])
    const created = yield* api.Monitors.create({
      payload: { url: 'https://example.com', interval: Duration.seconds(120) },
    })
    expect(
      yield* api.Monitors.get({ params: { id: created.id } }),
    ).toStrictEqual(
      Monitor.make({
        id: created.id,
        url: 'https://example.com',
        interval: Duration.seconds(120),
      }),
    )
    expect(yield* api.Monitors.list()).toStrictEqual([
      Monitor.make({
        id: created.id,
        url: 'https://example.com',
        interval: Duration.seconds(120),
      }),
    ])
    yield* api.Monitors.delete({ params: { id: created.id } })
    expect(
      yield* api.Monitors.get({ params: { id: created.id } }).pipe(Effect.flip),
    ).toStrictEqual(new HttpApiError.NotFound())
    expect(yield* api.Monitors.list()).toStrictEqual([])
  }).pipe(Effect.provide(AuthenticatedHttpClient)),
)
