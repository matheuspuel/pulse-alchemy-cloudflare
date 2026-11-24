import { Schema } from 'effect'

export class Check extends Schema.Class<Check>('Check')({
  monitorId: Schema.String,
  scheduledTime: Schema.DateTimeUtc,
  ok: Schema.Boolean,
  checkedAt: Schema.DateTimeUtc,
}) {}

export class CheckResult extends Schema.Opaque<CheckResult>()(
  Schema.Struct({
    ok: Schema.Boolean,
    scheduledTime: Schema.DateTimeUtc,
    checkedAt: Schema.DateTimeUtc,
    interval: Schema.Duration,
  }),
) {}
