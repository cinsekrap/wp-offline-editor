import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import { initTestDb, teardownTestDb } from '../helpers/db'
import { storeCredential, getCredential, getOrCreateDbKey } from '../../src/main/credentials'

beforeEach(() => initTestDb())
afterEach(() => {
  vi.restoreAllMocks()
  teardownTestDb()
})

function storedEntries(): Record<string, string> {
  const path = join(process.env.WPOE_TEST_USERDATA!, 'credentials.enc.json')
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('credentials', () => {
  it('round-trips a stored credential, and returns null for an unknown ref', async () => {
    await storeCredential('site-a', 'secret')
    expect(await getCredential('site-a')).toBe('secret')
    expect(await getCredential('site-missing')).toBeNull()
  })

  it('returns the same database key on every call', async () => {
    // initTestDb already created it; a second key would orphan the database.
    expect(await getOrCreateDbKey()).toBe(await getOrCreateDbKey())
  })

  it('writes a value back when Electron says the OS key has rotated', async () => {
    await storeCredential('site-a', 'secret')
    vi.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValueOnce({
      result: 'secret',
      shouldReEncrypt: true
    })
    vi.spyOn(safeStorage, 'encryptStringAsync').mockResolvedValueOnce(Buffer.from('rotated'))

    expect(await getCredential('site-a')).toBe('secret')
    expect(storedEntries()['site-a']).toBe(Buffer.from('rotated').toString('base64'))
  })

  it('keeps a credential saved while another is mid re-encryption', async () => {
    // A re-encrypt that read the file before awaiting encryption would write
    // back a stale copy and silently drop site-b's new password.
    await storeCredential('site-a', 'secret-a')
    let release!: (b: Buffer) => void
    vi.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValueOnce({
      result: 'secret-a',
      shouldReEncrypt: true
    })
    vi.spyOn(safeStorage, 'encryptStringAsync').mockImplementationOnce(
      () => new Promise<Buffer>((resolve) => (release = resolve))
    )

    const reading = getCredential('site-a')
    await vi.waitFor(() => expect(release).toBeDefined())
    await storeCredential('site-b', 'secret-b')
    release(Buffer.from('secret-a'))
    await reading

    expect(await getCredential('site-a')).toBe('secret-a')
    expect(await getCredential('site-b')).toBe('secret-b')
  })
})
