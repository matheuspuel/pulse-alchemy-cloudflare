import * as Cloudflare from '@alchemy.run/cloudflare'
import * as SQL from '@alchemy.run/cloudflare/D1/SQL'
import {
  Context,
  DateTime,
  Effect,
  Layer,
  Schema,
  SchemaTransformation,
} from 'effect'
import { SqlError } from 'effect/sql'
import { Database } from '../database'
import { Check } from '../types/Check'

export class CheckRepository extends Context.Service<
  CheckRepository,
  {
    list: (args: {
      monitorId: string
      size: number
    }) => Effect.Effect<
      readonly Check[],
      Schema.SchemaError | SqlError.SqlError
    >
    create: (args: {
      monitorId: string
      scheduledTime: DateTime.DateTime
      ok: boolean
      checkedAt: DateTime.DateTime
    }) => Effect.Effect<void, SqlError.SqlError>
  }
>()('CheckRepository') {
  static Default = Layer.effect(
    CheckRepository,
    Effect.gen(function* () {
      const db = yield* Cloudflare.D1.QueryDatabase(Database)
      const sql = yield* SQL.D1(db)
      return {
        list: args =>
          Effect.gen(function* () {
            const list = yield* Schema.decodeUnknownEffect(
              Schema.Array(FromDatabase),
            )(
              yield* sql`SELECT * FROM checks
WHERE monitor_id = ${args.monitorId}
ORDER BY scheduled_minute DESC
LIMIT ${args.size}`,
            )
            return list
          }),
        create: args =>
          Effect.gen(function* () {
            yield* sql`INSERT INTO checks (monitor_id, scheduled_minute, ok, checked_at)
VALUES (${args.monitorId}, ${DateTime.formatIso(args.scheduledTime)}, ${args.ok ? 1 : 0}, ${DateTime.formatIso(args.checkedAt)})
ON CONFLICT DO NOTHING`
          }),
      }
    }),
  )
}

const FromDatabase = Schema.toCodecJson(
  Schema.Struct({
    monitorId: Schema.String,
    scheduledTime: Schema.DateTimeUtc,
    ok: Schema.BooleanFromBit,
    checkedAt: Schema.DateTimeUtc,
  }).pipe(
    Schema.encodeKeys({
      monitorId: 'monitor_id',
      scheduledTime: 'scheduled_minute',
      checkedAt: 'checked_at',
    }),
    Schema.decodeTo(Check, SchemaTransformation.passthrough()),
  ),
)
