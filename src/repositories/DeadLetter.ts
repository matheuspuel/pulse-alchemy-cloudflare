import * as Cloudflare from '@alchemy.run/cloudflare'
import * as SQL from '@alchemy.run/cloudflare/D1/SQL'
import { Context, Effect, Layer, Schema } from 'effect'
import { SqlError } from 'effect/sql'
import { Database } from '../database'

export class DeadLetterRepository extends Context.Service<
  DeadLetterRepository,
  {
    list: () => Effect.Effect<
      readonly { id: string; body: unknown }[],
      Schema.SchemaError | SqlError.SqlError
    >
    create: (args: { body: unknown }) => Effect.Effect<void, SqlError.SqlError>
  }
>()('DeadLetterRepository') {
  static Default = Layer.effect(
    DeadLetterRepository,
    Effect.gen(function* () {
      const db = yield* Cloudflare.D1.QueryDatabase(Database)
      const sql = yield* SQL.D1(db)
      return {
        list: () =>
          Effect.gen(function* () {
            const list = yield* Schema.decodeUnknownEffect(
              Schema.Array(FromDatabase),
            )(yield* sql`SELECT * FROM dead_letters`)
            return list
          }),
        create: args =>
          Effect.gen(function* () {
            yield* sql`INSERT INTO dead_letters (body)
VALUES (${JSON.stringify(args.body)})`
          }),
      }
    }),
  )
}

const FromDatabase = Schema.toCodecJson(
  Schema.Struct({
    id: Schema.String,
    body: Schema.Unknown,
  }),
)
