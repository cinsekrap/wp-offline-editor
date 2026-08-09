import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchPosts, fetchSinglePost, pushPost } from '../../src/main/wp-client'

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

describe('ACF on push', () => {
  let sent: Record<string, unknown>

  beforeEach(() => {
    sent = {}
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      requested.push(url)
      sent = JSON.parse(String(init.body))
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, modified: '2026-01-01T00:00:00' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    })
  })

  const acf = { post_galleries: null, post_series: 'a-series', show_toc: false }

  it("omits null values from ACF's own field", async () => {
    // ACF's repeater and flexible-content REST validators read
    // `! is_array( $value ) && is_null( $value )` — inverted, so they reject
    // exactly the null their error message calls valid. One empty repeater
    // 400s the entire push, losing the content along with it.
    await pushPost(SITE, 'admin', 'pw', 5, {
      title: 'T',
      content: 'C',
      status: 'draft',
      acf
    })

    expect(sent.acf).toEqual({ post_series: 'a-series', show_toc: false })
  })

  it('still sends the complete object to the companion plugin', async () => {
    // The plugin registers its field with no schema and writes every applicable
    // group, so it is the path that can genuinely clear a repeater. Stripping
    // nulls here too would make emptying a field impossible.
    await pushPost(SITE, 'admin', 'pw', 5, {
      title: 'T',
      content: 'C',
      status: 'draft',
      acf
    })

    expect(sent.wpoe_acf).toEqual(acf)
  })

  it('leaves an unpublished post\'s date to WordPress', async () => {
    // wp_update_post moves a draft's post_date to "now" on each save, but only
    // while post_date_gmt is 0000-00-00. Sending `date` makes REST write a real
    // post_date_gmt and set edit_date, freezing the date permanently — so the
    // draft stops moving up the list and later publishes with a stale date.
    for (const status of ['draft', 'pending']) {
      await pushPost(SITE, 'admin', 'pw', 5, {
        title: 'T',
        content: 'C',
        status,
        date: '2026-02-28T09:47:42.000Z'
      })

      expect(sent).not.toHaveProperty('date')
    }
  })

  it('still sends the date once a post is published or scheduled', async () => {
    // There the date is the publish date — user-chosen, and ours to preserve.
    for (const status of ['publish', 'future', 'private']) {
      await pushPost(SITE, 'admin', 'pw', 5, {
        title: 'T',
        content: 'C',
        status,
        date: '2026-02-28T09:47:42.000Z'
      })

      expect(sent.date).toBe('2026-02-28T09:47:42.000Z')
    }
  })

  it('keeps false and empty string, which are real values', async () => {
    await pushPost(SITE, 'admin', 'pw', 5, {
      title: 'T',
      content: 'C',
      status: 'draft',
      acf: { a: false, b: '', c: 0, d: null }
    })

    expect(sent.acf).toEqual({ a: false, b: '', c: 0 })
  })
})
