import { Effect, Fiber, Schedule, Schema } from 'effect'
import { Socket } from 'effect/socket'
import React from 'react'
import {
  MonitorEvent,
  MonitorListView,
  applyEvent,
} from '../../../src/types/Monitor'

const apiUrl = import.meta.env.VITE_API_URL as string

export const useLiveMonitors = () => {
  const [state, setState] = React.useState(MonitorListView.initial)
  const [connected, setConnected] = React.useState(false)

  React.useEffect(() => {
    const fiber = Effect.gen(function* () {
      const socket = yield* Socket.makeWebSocket(`${apiUrl}/ws`)
      yield* Effect.acquireRelease(
        Effect.sync(() => setConnected(true)),
        () => Effect.sync(() => setConnected(false)),
      )
      const reader = yield* socket.reader
      yield* Effect.gen(function* () {
        const events = yield* reader.pull
        for (const rawEvent of events) {
          const event = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.toCodecJson(MonitorEvent)),
          )(rawEvent)
          setState(prev => applyEvent({ view: prev, event }))
        }
      }).pipe(Effect.forever)
    }).pipe(
      Effect.scoped,
      Effect.retry(retrySchedule),
      Effect.provide(Socket.layerWebSocketConstructorGlobal),
      Effect.runFork,
    )
    return () => void Effect.runPromise(Fiber.interrupt(fiber))
  }, [])

  return { state, connected }
}

const retrySchedule = Schedule.jittered(
  Schedule.min([
    Schedule.exponential('1 second'),
    Schedule.spaced('30 seconds'),
  ]),
)
