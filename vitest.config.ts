import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Services keep a single module-level `db` handle; parallel files sharing
    // one process would clobber each other's connection. One fork keeps the
    // global DB state serialized per file without the overhead of isolation.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
})
