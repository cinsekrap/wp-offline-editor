import { describe, it, expect } from 'vitest'
import {
  isLanDevUrl,
  isLoopbackUrl,
  transportRefusal,
  PLAINTEXT_LAN_REFUSAL,
  PLAINTEXT_PUBLIC_REFUSAL
} from '../../src/main/url-utils'

describe('isLoopbackUrl', () => {
  it.each([
    'http://localhost:10017',
    'http://127.0.0.1/wp-json',
    'http://127.0.0.2/wp-json', // the whole 127.0.0.0/8 range is loopback
    'http://[::1]:8080',
    'http://mysite.localhost'
  ])('treats %s as loopback', (url) => {
    expect(isLoopbackUrl(url)).toBe(true)
  })

  it.each([
    'http://mysite.local',
    'http://192.168.1.10',
    'https://example.com',
    'http://localhost.evil.com', // suffix confusion must not pass
    'not-a-url'
  ])('does not treat %s as loopback', (url) => {
    expect(isLoopbackUrl(url)).toBe(false)
  })
})

describe('isLanDevUrl', () => {
  it.each(['http://mysite.local', 'http://mysite.test', 'https://sub.mysite.local'])(
    'treats %s as a LAN dev host',
    (url) => {
      expect(isLanDevUrl(url)).toBe(true)
    }
  )

  it.each(['http://localhost', 'https://example.com', 'http://example.localdomain'])(
    'does not treat %s as a LAN dev host',
    (url) => {
      expect(isLanDevUrl(url)).toBe(false)
    }
  )
})

describe('transportRefusal', () => {
  it('allows https anywhere, with or without consent', () => {
    expect(transportRefusal('https://example.com/wp-json')).toBeNull()
    expect(transportRefusal('https://mysite.local/wp-json')).toBeNull()
  })

  it('allows plaintext to loopback without consent — it never reaches a network', () => {
    expect(transportRefusal('http://localhost:10017/wp-json')).toBeNull()
    expect(transportRefusal('http://127.0.0.1/wp-json')).toBeNull()
  })

  it('refuses plaintext to a LAN dev host until consent is given', () => {
    expect(transportRefusal('http://mysite.local/wp-json')).toBe(PLAINTEXT_LAN_REFUSAL)
    expect(transportRefusal('http://mysite.local/wp-json', true)).toBeNull()
  })

  it('refuses plaintext to a public host even with consent', () => {
    expect(transportRefusal('http://example.com/wp-json', true)).toBe(PLAINTEXT_PUBLIC_REFUSAL)
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/css,body{}', 'ftp://example.com'])(
    'refuses the non-HTTP(S) scheme in %s',
    (url) => {
      // These can arrive from scraped stylesheet hrefs and image srcs.
      expect(transportRefusal(url, true)).not.toBeNull()
    }
  )

  it('refuses an unparseable URL rather than passing it through', () => {
    expect(transportRefusal('http://')).not.toBeNull()
  })
})
