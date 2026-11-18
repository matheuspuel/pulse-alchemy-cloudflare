import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.integration.?(c|m)[jt]s?(x)'],
    fakeTimers: { toFake: undefined },
    testTimeout: 30000,
    pool: 'forks',
    isolate: false,
  },
})
