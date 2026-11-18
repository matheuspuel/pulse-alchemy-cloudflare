import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { Effect } from 'effect'
import { Database } from './src/database'
import Worker from './src/worker'

export default Alchemy.Stack(
  'Pulse',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const worker = yield* Worker
    const database = yield* Database
    return {
      workerUrl: worker.url,
      database: database.databaseName,
    }
  }),
)
