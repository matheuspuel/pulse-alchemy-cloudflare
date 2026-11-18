import { Schema } from 'effect'

export class Monitor extends Schema.Class<Monitor>('Monitor')({
  id: Schema.String,
  url: Schema.String,
  updatedAt: Schema.DateTimeUtc,
}) {}
