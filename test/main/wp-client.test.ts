import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchPosts, fetchSinglePost } from '../../src/main/wp-client'

/**
 * wp-client is mocked everywhere else in the suite, so its request construction
 * has never been asserted. These tests stub global fetch and check the URLs that
 * actually go out.
 *
 * The site URL is loopback so the transport policy allows it without a database
 * to read consent from.
 */

const SITE = 'http://127.0.0.1:9999'
const requested: string[] = []

beforeEach(() => {
  requested.length = 0
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url)
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'x-wp-totalpages': '1', 'content-type': 'application/json' }
      })
    )
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('post pull requests', () => {
  it('pins acf_format=light on the list pull', async () => {
    // ACF reads this before falling back to the site's rest_api_format setting.
    // A site set to 'standard' would return each field's display formatting —
    // a date_picker as "21/02/2019" rather than the stored "20190221" — which the
    // editor cannot parse and cannot write back.
    await fetchPosts(SITE, 'admin', 'pw', ['draft'], 10)

    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      expect(url).toContain('acf_format=light')
    }
  })

  it('requests the companion plugin field alongside ACF\'s own', async () => {
    await fetchPosts(SITE, 'admin', 'pw', ['draft'], 10)

    for (const url of requested) {
      expect(decodeURIComponent(url)).toContain('wpoe_acf')
    }
  })

  it('asks for content.raw via context=edit so shortcodes survive', async () => {
    await fetchPosts(SITE, 'admin', 'pw', ['draft'], 10)

    expect(requested.some((u) => u.includes('context=edit'))).toBe(true)
  })

  it('pins acf_format=light on a single-post fetch too', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      requested.push(url)
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    })

    await fetchSinglePost(SITE, 'admin', 'pw', 1)

    expect(requested.length).toBeGreaterThan(0)
    expect(requested[0]).toContain('acf_format=light')
  })
})
