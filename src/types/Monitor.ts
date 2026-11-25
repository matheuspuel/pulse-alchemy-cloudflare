import { Brand, Effect, Schema } from 'effect'

export class Monitor extends Schema.Class<Monitor>('Monitor')({
  id: Schema.String,
  url: Schema.String,
  interval: Schema.Duration,
}) {}

export class MonitorState extends Schema.Opaque<MonitorState>()(
  Schema.Struct({
    status: Schema.Literals(['unknown', 'up', 'down']),
    failures: Schema.Number,
    lastSchedule: Schema.NullOr(Schema.DateTimeUtc),
    lastCheckedAt: Schema.NullOr(Schema.DateTimeUtc),
    lastLatency: Schema.NullOr(Schema.Duration),
    stale: Schema.Boolean,
  }),
) {
  static initial: MonitorState = MonitorState.make({
    status: 'unknown',
    failures: 0,
    lastSchedule: null,
    lastCheckedAt: null,
    lastLatency: null,
    stale: false,
  })
}

export class MonitorListView extends Schema.Opaque<MonitorListView>()(
  Schema.Struct({
    list: Schema.Array(
      Schema.Struct({ monitor: Monitor, state: MonitorState }),
    ),
  }),
) {
  static initial = MonitorListView.make({ list: [] })
}

export namespace MonitorEvent {
  export type JsonEncoded = Brand.Branded<
    Schema.Json,
    'MonitorEvent.JsonEncoded'
  >
}
export type MonitorEvent = Schema.Schema.Type<typeof MonitorEvent>
export const MonitorEvent = class extends Schema.TaggedUnion({
  snapshot: { snapshot: MonitorListView },
  changeMonitorState: { monitorId: Schema.String, state: MonitorState },
}) {
  static toJsonEncoded = Effect.fn(function* (value: MonitorEvent) {
    return (yield* Schema.encodeEffect(Schema.toCodecJson(MonitorEvent))(
      value,
    )) as MonitorEvent.JsonEncoded
  })
  static fromJsonEncoded = Effect.fn(function* (
    encoded: MonitorEvent.JsonEncoded,
  ) {
    return yield* Schema.decodeEffect(Schema.toCodecJson(MonitorEvent))(encoded)
  })
}

export const applyEvent = ({
  view,
  event,
}: {
  view: MonitorListView
  event: MonitorEvent
}): MonitorListView =>
  MonitorEvent.match(event, {
    snapshot: event => event.snapshot,
    changeMonitorState: event => ({
      list: view.list.map(item =>
        item.monitor.id === event.monitorId
          ? { monitor: item.monitor, state: event.state }
          : item,
      ),
    }),
  })
