import * as Axiom from '@alchemy.run/axiom'
import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { Effect, Layer } from 'effect'
import { Database } from './src/database'
import Worker from './src/worker'

export default Alchemy.Stack(
  'Pulse',
  {
    state: Cloudflare.state(),
    providers: Layer.mergeAll(Cloudflare.providers(), Axiom.providers()),
  },
  Effect.gen(function* () {
    const stack = yield* Alchemy.Stack
    const worker = yield* Worker
    const web = yield* Cloudflare.Website.Vite('Website', {
      name: stack.stage === 'prod' ? 'pulse' : undefined,
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
