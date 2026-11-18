import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    sequence: { concurrent: true },
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
