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
    // one process would clobber each other's connection. One worker at a time
    // keeps the global DB state serialized per file.
    // Vitest 4 note: v3's poolOptions.forks.singleFork is gone. Its literal
    // replacement (maxWorkers: 1 + isolate: false) shares one module registry
    // across ALL files, which breaks vi.mock state between files (post-service
    // mocks saw a stale wp-client instance). Default isolation (fresh fork per
    // file) restores v3 behavior; with a handful of files the overhead is
    // negligible.
    pool: 'forks',
    maxWorkers: 1
  }
})
