import { vi } from 'vitest'

// The main process is written against Electron's `electron` module, which has no
// Node build. Stub the two seams the code under test actually touches:
//   • app.getPath('userData') → the per-test temp dir in WPOE_TEST_USERDATA
//   • safeStorage             → an identity codec, bypassing OS keychain so the
//     real credentials + db-key flow (getOrCreateDbKey, storeCredential) runs
//     unchanged and produces a valid hex key for SQLCipher.
// net.fetch throws by default; tests that need it override it explicitly.
vi.mock('electron', () => {
  const userData = (): string => {
    const dir = process.env.WPOE_TEST_USERDATA
    if (!dir) throw new Error('WPOE_TEST_USERDATA not set — call initTestDb() first')
    return dir
  }
  return {
    app: {
      getPath: () => userData(),
      getVersion: () => process.env.WPOE_TEST_APP_VERSION ?? '1.1.5',
      getName: () => 'NP Presspad',
      setName: () => {}
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s, 'utf-8'),
      decryptString: (b: Buffer) => Buffer.from(b).toString('utf-8')
    },
    net: {
      fetch: vi.fn(async () => {
        throw new Error('net.fetch is not mocked in this test')
      })
    }
  }
})
