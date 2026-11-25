import * as Cloudflare from '@alchemy.run/cloudflare'
import { Layer, Option, Ref, Schema } from 'effect'
import * as Effect from 'effect/Effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import MonitorDO from './monitorDO'
import { MonitorRepository } from './repositories/Monitor'
import { applyEvent, MonitorEvent, MonitorListView } from './types/Monitor'

export class HubDORpc extends RpcGroup.make(
  Rpc.make('broadcast', { payload: MonitorEvent }),
) {}

export default class HubDO extends Cloudflare.DurableObject<HubDO>()(
  'HubDO',
  Effect.gen(function* () {
    const durableState = yield* Cloudflare.DurableObjectState
    const monitorListViewStore = yield* MonitorListViewStore
    return Effect.gen(function* () {
      return {
        fetch: Effect.gen(function* () {
          const [response, socket] = yield* Cloudflare.upgrade()
          const string = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.toCodecJson(MonitorEvent)),
          )({ _tag: 'snapshot', snapshot: yield* monitorListViewStore.get })
          yield* socket.send(string)
          return response
        }),
        webSocketClose: Effect.fn(function* (
          ws: Cloudflare.WebSocket,
          code: number,
          reason: string,
        ) {
          yield* ws.close(code, reason)
        }),
        // needed to get around the built-in cloudflare rpc to make it require the correct type while using `Schema` for encoding/decoding JSON-incompatible values, like classes
        broadcast: (monitorEventJson: MonitorEvent.JsonEncoded) =>
          Effect.gen(function* () {
            const event = yield* MonitorEvent.fromJsonEncoded(monitorEventJson)
            yield* monitorListViewStore.applyEvent(event)
            for (const socket of yield* durableState.getWebSockets()) {
              yield* socket.send(
                yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.toCodecJson(MonitorEvent)),
                )(event),
              )
            }
          }),
      }
    })
  }).pipe(
    Effect.provide(
      Layer.mergeAll(MonitorRepository.Default).pipe(
        Layer.provide(Cloudflare.D1.QueryDatabaseBinding),
      ),
    ),
  ),
) {}

const MonitorListViewStore = Effect.gen(function* () {
  const ref = yield* Ref.make<Option.Option<MonitorListView>>(Option.none())
  const monitorRepository = yield* MonitorRepository
  const monitorDO = yield* MonitorDO
  const fetchData = Effect.gen(function* () {
    const data: MonitorListView = {
      list: yield* Effect.forEach(yield* monitorRepository.list(), monitor =>
        Effect.gen(function* () {
          const stub = yield* monitorDO.getByName(monitor.id)
          const state = yield* stub.getState()
          return { monitor, state }
        }),
      ),
    }
    return data
  })
  const get = Effect.gen(function* () {
    const value = yield* Ref.get(ref)
    if (Option.isSome(value)) return value.value
    const data = yield* fetchData
    yield* Ref.set(ref, Option.some(data))
    return data
  })
  const set = (value: MonitorListView) => Ref.set(ref, Option.some(value))
  const update = (f: (value: MonitorListView) => MonitorListView) =>
    Ref.update(ref, Option.map(f))
  const applyEvent_ = Effect.fn(function* (event: MonitorEvent) {
    yield* update(view => applyEvent({ view, event }))
  })
  return { get, set, update, applyEvent: applyEvent_ }
})
