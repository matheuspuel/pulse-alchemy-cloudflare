import { Schema } from 'effect'

export class Incident extends Schema.Opaque<Incident>()(
  Schema.Struct({
    startedAt: Schema.DateTimeUtc,
    endedAt: Schema.NullOr(Schema.DateTimeUtc),
  }),
) {}
