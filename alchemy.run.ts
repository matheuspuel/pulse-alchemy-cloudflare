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
    const web = yield* Cloudflare.Website.Vite('Website', {
      rootDir: './web',
      assets: { notFoundHandling: 'single-page-application' },
      env: {
        VITE_PUBLIC_URL: Cloudflare.Worker.URL,
        VITE_API_URL: worker.url.as<string>(),
      },
    })
    const database = yield* Database
    return {
      workerUrl: worker.url,
      webUrl: web.url,
      database: database.databaseName,
    }
  }),
)
