import * as Cloudflare from '@alchemy.run/cloudflare'
import * as GitHub from '@alchemy.run/github'
import * as Alchemy from 'alchemy'
import { Config, Redacted } from 'effect'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export default Alchemy.Stack(
  'github',
  {
    state: Cloudflare.state(),
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const apiToken = yield* Cloudflare.ApiToken.AccountApiToken('CIToken', {
      accountId,
      policies: [
        {
          effect: 'allow',
          permissionGroups: [
            'Secrets Store Write',
            'Workers Scripts Write',
            'Workers KV Storage Write',
            'Workers R2 Storage Write',
            'D1 Write',
            'Queues Write',
            'Pages Write',
            'Account Settings Write',
            'Workers Tail Read',
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: '*',
          },
        },
      ],
    })
    const githubRepository = {
      owner: 'matheuspuel',
      repository: 'pulse-alchemy-cloudflare',
    }
    yield* GitHub.Secret('cf-api-token', {
      ...githubRepository,
      name: 'CLOUDFLARE_API_TOKEN',
      value: apiToken.value,
    })
    yield* GitHub.Secret('cf-account-id', {
      ...githubRepository,
      name: 'CLOUDFLARE_ACCOUNT_ID',
      value: Redacted.make(accountId),
    })
    yield* GitHub.Secret('axiom-token', {
      ...githubRepository,
      name: 'AXIOM_TOKEN',
      value: yield* Config.Redacted('CI_AXIOM_TOKEN'),
    })
    yield* GitHub.Secret('axiom-org-id', {
      ...githubRepository,
      name: 'AXIOM_ORG_ID',
      value: yield* Config.Redacted('CI_AXIOM_ORG_ID'),
    })
    yield* GitHub.Secret('auth-token', {
      ...githubRepository,
      name: 'AUTH_TOKEN',
      value: yield* Config.Redacted('AUTH_TOKEN'),
    })
  }),
)
