import { Schema } from 'effect'

export class Check extends Schema.Class<Check>('Check')({
  monitorId: Schema.String,
  scheduledTime: Schema.DateTimeUtc,
  ok: Schema.Boolean,
  checkedAt: Schema.DateTimeUtc,
}) {}
