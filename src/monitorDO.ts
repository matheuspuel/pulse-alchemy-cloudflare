import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { Array, DateTime, Duration, Effect, Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import { CheckResult } from './types/Check'
import { Incident } from './types/Incident'

class State extends Schema.Opaque<State>()(
  Schema.Struct({
    status: Schema.Literals(['unknown', 'up', 'down']),
    failures: Schema.Number,
    lastSchedule: Schema.NullOr(Schema.DateTimeUtc),
    stale: Schema.Boolean,
  }),
) {
  static initial: State = State.make({
    status: 'unknown',
    failures: 0,
    lastSchedule: null,
    stale: false,
  })
}

export class MonitorDORpc extends RpcGroup.make(
  Rpc.make('getState', { success: State }),
  Rpc.make('getIncidents', { success: Schema.Array(Incident) }),
  Rpc.make('recordResult', { payload: CheckResult }),
) {}

export default class MonitorDO extends Cloudflare.RpcDurableObject<MonitorDO>()(
  'MonitorDO',
  { schema: MonitorDORpc },
  Effect.gen(function* () {
    const durableState = yield* Cloudflare.DurableObjectState
    const stateStore = yield* StateStore
    const incidentStore = yield* IncidentStore
    return Effect.gen(function* () {
      const onNotification = yield* Alchemy.makeCallback(
        'notification',
        Effect.fn(function* (status: string) {
          yield* Effect.log(`Status changed: ${status}`)
        }),
      )
      const onStale = yield* Alchemy.makeCallback(
        'stale',
        Effect.fn(function* () {
          yield* Effect.log(`Monitor stale`)
          yield* stateStore.update(_ => ({ ..._, stale: true }))
        }),
      )
      return MonitorDORpc.toLayer({
        getState: () =>
          stateStore.get.pipe(Effect.catchTags({ SchemaError: Effect.die })),
        getIncidents: () =>
          incidentStore.get.pipe(Effect.catchTags({ SchemaError: Effect.die })),
        recordResult: result =>
          Effect.gen(function* () {
            const state = yield* stateStore.get
            const outcome = step({
              state,
              check: result,
              options: { failuresToDown: 3 },
            })
            if (!outcome.applied) return
            yield* stateStore.set(outcome.state)
            if (outcome.transition === 'down') {
              yield* incidentStore.openIncident(result)
            } else if (outcome.transition === 'up') {
              yield* incidentStore.closeIncident(result)
            }
            if (outcome.transition) {
              yield* onNotification.schedule(
                DateTime.formatIso(result.scheduledTime),
                { payload: outcome.transition, after: 0 },
              )
            }
            yield* onStale.schedule('stale', {
              payload: null,
              after: Duration.times(result.interval, 3),
            })
          }).pipe(
            _ => durableState.storage.transaction(_),
            Effect.catchTags({
              DurableObjectStorageError: Effect.die,
              CallbackError: Effect.die,
              SchemaError: Effect.die,
            }),
          ),
      })
    })
  }),
) {}

export const step = (args: {
  state: State
  check: CheckResult
  options: { failuresToDown: number }
}): {
  applied: boolean
  transition: 'down' | 'up' | null
  state: State
} => {
  if (
    args.state.lastSchedule &&
    args.check.scheduledTime <= args.state.lastSchedule
  ) {
    return {
      applied: false,
      transition: null,
      state: args.state,
    }
  }
  const failures = args.check.ok ? 0 : args.state.failures + 1
  const status =
    failures >= args.options.failuresToDown
      ? 'down'
      : args.state.status === 'unknown' && !args.check.ok
        ? 'unknown'
        : 'up'
  return {
    applied: true,
    transition:
      status !== args.state.status && status !== 'unknown' ? status : null,
    state: {
      status,
      failures,
      lastSchedule: DateTime.toUtc(args.check.scheduledTime),
      stale: false,
    },
  }
}

const StateStore = Effect.gen(function* () {
  const durableState = yield* Cloudflare.DurableObjectState
  const get = Effect.gen(function* () {
    const data = yield* durableState.storage.get('state')
    if (!data) return State.initial
    return yield* Schema.decodeUnknownEffect(Schema.toCodecJson(State))(data)
  })
  const set = Effect.fn(function* (state: State) {
    const data = yield* Schema.encodeEffect(Schema.toCodecJson(State))(state)
    yield* durableState.storage.put('state', data)
  })
  const update = Effect.fn(function* (fn: (state: State) => State) {
    yield* set(fn(yield* get))
  })
  return { get, set, update }
})

const IncidentStore = Effect.gen(function* () {
  const durableState = yield* Cloudflare.DurableObjectState
  const get = Effect.gen(function* () {
    const data = yield* durableState.storage.get('incidents')
    if (!data) return []
    return yield* Schema.decodeUnknownEffect(
      Schema.toCodecJson(Schema.Array(Incident)),
    )(data)
  })
  const set = Effect.fn(function* (incidents: readonly Incident[]) {
    const data = yield* Schema.encodeEffect(
      Schema.toCodecJson(Schema.Array(Incident)),
    )(incidents)
    yield* durableState.storage.put('incidents', data)
  })
  const update = Effect.fn(function* (
    fn: (incidents: readonly Incident[]) => readonly Incident[],
  ) {
    yield* set(fn(yield* get))
  })
  const openIncident = Effect.fn(function* (result: CheckResult) {
    yield* update(_ => [
      ..._,
      { startedAt: result.scheduledTime, endedAt: null },
    ])
  })
  const closeIncident = Effect.fn(function* (result: CheckResult) {
    const incidents = yield* get
    if (Array.isReadonlyArrayNonEmpty(incidents)) {
      yield* set(
        Array.modifyLastNonEmpty(incidents, _ => ({
          ..._,
          endedAt: result.scheduledTime,
        })),
      )
    }
  })
  return { get, set, update, openIncident, closeIncident }
})
