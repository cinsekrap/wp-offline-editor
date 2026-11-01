import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initTestDb, teardownTestDb } from '../helpers/db'
import { addSite, updateSite } from '../../src/main/site-service'

beforeEach(() => initTestDb())
afterEach(() => teardownTestDb())

const base = { username: 'admin', password: 'app-password' }

describe('site transport policy', () => {
  it('accepts an https site', async () => {
    const site = await addSite({ ...base, url: 'https://example.com' })
    expect(site.url).toBe('https://example.com')
    expect(site.allow_plaintext).toBe(false)
  })

  it('accepts plaintext to loopback without consent', async () => {
    const site = await addSite({ ...base, url: 'http://localhost:10017' })
    expect(site.allow_plaintext).toBe(false)
  })

  it('refuses plaintext to a LAN dev host without consent', async () => {
    await expect(addSite({ ...base, url: 'http://mysite.local' })).rejects.toThrow(/unencrypted/i)
  })

  it('accepts plaintext to a LAN dev host with consent, and stores it', async () => {
    const site = await addSite({ ...base, url: 'http://mysite.local', allow_plaintext: true })
    expect(site.allow_plaintext).toBe(true)
  })

  it('refuses plaintext to a public host even with consent', async () => {
    await expect(addSite({ ...base, url: 'http://example.com', allow_plaintext: true })).rejects.toThrow(
      /HTTPS/i
    )
  })

  it('re-checks the stored URL when consent is revoked', async () => {
    // The old code only validated when the URL itself changed, so a stored
    // http:// row could outlive the consent that permitted it.
    const site = await addSite({ ...base, url: 'http://mysite.local', allow_plaintext: true })

    await expect(updateSite({ id: site.id, allow_plaintext: false })).rejects.toThrow(/unencrypted/i)
  })

  it('still refuses when a saved https site is edited down to http', async () => {
    const site = await addSite({ ...base, url: 'https://example.com' })

    await expect(updateSite({ id: site.id, url: 'http://example.com' })).rejects.toThrow(/HTTPS/i)
  })
})
