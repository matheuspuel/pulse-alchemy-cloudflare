import * as Axiom from '@alchemy.run/axiom'
import * as AdoptPolicy from 'alchemy/AdoptPolicy'
import * as RemovalPolicy from 'alchemy/RemovalPolicy'

export const Traces = Axiom.Dataset('Traces', {
  name: 'pulse-traces',
  kind: 'otel:traces:v1',
}).pipe(AdoptPolicy.adopt(), RemovalPolicy.retain())

export const Logs = Axiom.Dataset('Logs', {
  name: 'pulse-logs',
  kind: 'otel:logs:v1',
}).pipe(AdoptPolicy.adopt(), RemovalPolicy.retain())

export const Ingest = Axiom.ApiToken('Ingest', {
  name: 'pulse-ingest',
  datasetCapabilities: {
    'pulse-traces': { ingest: ['create'] },
    'pulse-logs': { ingest: ['create'] },
  },
})
