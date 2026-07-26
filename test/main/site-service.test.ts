import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initTestDb, teardownTestDb } from '../helpers/db'
import { addSite, updateSite } from '../../src/main/site-service'

beforeEach(() => initTestDb())
afterEach(() => teardownTestDb())

const base = { username: 'admin', password: 'app-password' }

describe('site transport policy', () => {
  it('accepts an https site', () => {
    const site = addSite({ ...base, url: 'https://example.com' })
    expect(site.url).toBe('https://example.com')
    expect(site.allow_plaintext).toBe(false)
  })

  it('accepts plaintext to loopback without consent', () => {
    const site = addSite({ ...base, url: 'http://localhost:10017' })
    expect(site.allow_plaintext).toBe(false)
  })

  it('refuses plaintext to a LAN dev host without consent', () => {
    expect(() => addSite({ ...base, url: 'http://mysite.local' })).toThrow(/unencrypted/i)
  })

  it('accepts plaintext to a LAN dev host with consent, and stores it', () => {
    const site = addSite({ ...base, url: 'http://mysite.local', allow_plaintext: true })
    expect(site.allow_plaintext).toBe(true)
  })

  it('refuses plaintext to a public host even with consent', () => {
    expect(() => addSite({ ...base, url: 'http://example.com', allow_plaintext: true })).toThrow(
      /HTTPS/i
    )
  })

  it('re-checks the stored URL when consent is revoked', () => {
    // The old code only validated when the URL itself changed, so a stored
    // http:// row could outlive the consent that permitted it.
    const site = addSite({ ...base, url: 'http://mysite.local', allow_plaintext: true })

    expect(() => updateSite({ id: site.id, allow_plaintext: false })).toThrow(/unencrypted/i)
  })

  it('still refuses when a saved https site is edited down to http', () => {
    const site = addSite({ ...base, url: 'https://example.com' })

    expect(() => updateSite({ id: site.id, url: 'http://example.com' })).toThrow(/HTTPS/i)
  })
})
