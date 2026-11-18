import * as Cloudflare from '@alchemy.run/cloudflare'
import * as SQL from '@alchemy.run/cloudflare/D1/SQL'
import { Context, Effect, Layer, Schema } from 'effect'
import { NoSuchElementError } from 'effect/Cause'
import { SqlError } from 'effect/sql'
import { Database } from '../database'
import { Monitor } from '../types/Monitor'

export class MonitorRepository extends Context.Service<
  MonitorRepository,
  {
    list: () => Effect.Effect<
      readonly Monitor[],
      Schema.SchemaError | SqlError.SqlError
    >
    get: (args: {
      id: string
    }) => Effect.Effect<
      Monitor,
      NoSuchElementError | Schema.SchemaError | SqlError.SqlError
    >
    create: (args: {
      url: string
    }) => Effect.Effect<{ id: string }, SqlError.SqlError>
    delete: (args: { id: string }) => Effect.Effect<void, SqlError.SqlError>
  }
>()('MonitorRepository') {
  static Default = Layer.effect(
    MonitorRepository,
    Effect.gen(function* () {
      const db = yield* Cloudflare.D1.QueryDatabase(Database)
      const sql = yield* SQL.D1(db)
      return {
        list: () =>
          Effect.gen(function* () {
            const list = yield* Schema.decodeUnknownEffect(
              Schema.Array(Schema.toCodecJson(Monitor)),
            )(yield* sql`SELECT *, updated_at as "updatedAt" FROM monitors`)
            return list
          }),
        get: ({ id }) =>
          Effect.gen(function* () {
            const list = yield* Schema.decodeUnknownEffect(
              Schema.Array(Schema.toCodecJson(Monitor)),
            )(
              yield* sql`SELECT *, updated_at as "updatedAt" FROM monitors WHERE id = ${id}`,
            )
            if (!list[0]) return yield* new NoSuchElementError()
            return list[0]
          }),
        create: args =>
          Effect.gen(function* () {
            const id = crypto.randomUUID()
            const intervalSeconds = 60
            const now = new Date()
            yield* sql`INSERT INTO monitors (id, url, interval_seconds, created_at, updated_at)
VALUES (${id}, ${args.url}, ${intervalSeconds}, ${now.toISOString()}, ${now.toISOString()})`
            return { id }
          }),
        delete: ({ id }) =>
          Effect.gen(function* () {
            yield* sql`DELETE FROM monitors WHERE id = ${id}`
          }),
      }
    }),
  )
}
