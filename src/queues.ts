import * as Cloudflare from '@alchemy.run/cloudflare'
import { Schema } from 'effect'
import { Monitor } from './types/Monitor'

export const ChecksMessage = Schema.Struct({
  scheduledTime: Schema.DateTimeUtc,
  monitor: Monitor,
})

export const Checks = Cloudflare.Queues.Queue('Checks')

export const ChecksDead = Cloudflare.Queues.Queue('ChecksDead')
