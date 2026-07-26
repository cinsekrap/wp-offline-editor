import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { guardedFetch, TransportRefusedError, requestRefusal } from '../../src/main/transport-policy'

/**
 * These tests exercise the guard against real loopback servers. Loopback needs
 * no stored consent, so they run without a database — which also means a stray
 * request to a public host would be refused rather than sent.
 */

const servers: http.Server[] = []

afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

async function serve(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return `http://127.0.0.1:${port}`
}

describe('guardedFetch — policy enforcement', () => {
  it('refuses a plaintext public URL before sending anything', async () => {
    await expect(guardedFetch('http://example.com/wp-json')).rejects.toThrow(TransportRefusedError)
  })

  it('allows a loopback plaintext request', async () => {
    const origin = await serve((_req, res) => res.end('ok'))
    const res = await guardedFetch(`${origin}/wp-json`)
    expect(await res.text()).toBe('ok')
  })
})

describe('guardedFetch — redirects', () => {
  it('follows a same-origin redirect to the final response', async () => {
    const origin = await serve((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/end' })
        res.end()
        return
      }
      res.end('arrived')
    })

    const res = await guardedFetch(`${origin}/start`)
    expect(await res.text()).toBe('arrived')
  })

  it('refuses a redirect that downgrades to plaintext on a public host', async () => {
    // The downgrade is the reason redirects are followed manually: fetch would
    // have followed this silently and put the request on the open network.
    const origin = await serve((_req, res) => {
      res.writeHead(302, { Location: 'http://example.com/downgraded' })
      res.end()
    })

    await expect(guardedFetch(`${origin}/start`)).rejects.toThrow(TransportRefusedError)
  })

  it('strips credentials when a redirect crosses an origin', async () => {
    let receivedAuth: string | undefined = 'unset'
    const target = await serve((req, res) => {
      receivedAuth = req.headers.authorization
      res.end('final')
    })
    const origin = await serve((_req, res) => {
      res.writeHead(302, { Location: `${target}/target` })
      res.end()
    })

    const res = await guardedFetch(`${origin}/start`, {
      headers: { Authorization: 'Basic c2VjcmV0' }
    })

    expect(await res.text()).toBe('final')
    expect(receivedAuth).toBeUndefined()
  })

  it('keeps credentials on a same-origin redirect', async () => {
    let receivedAuth: string | undefined
    const origin = await serve((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/end' })
        res.end()
        return
      }
      receivedAuth = req.headers.authorization
      res.end('final')
    })

    await guardedFetch(`${origin}/start`, { headers: { Authorization: 'Basic c2VjcmV0' } })

    expect(receivedAuth).toBe('Basic c2VjcmV0')
  })

  it('rewrites a POST to GET on a 303 and drops the body', async () => {
    const seen: { method?: string }[] = []
    const origin = await serve((req, res) => {
      seen.push({ method: req.method })
      if (req.url === '/start') {
        res.writeHead(303, { Location: '/end' })
        res.end()
        return
      }
      res.end('done')
    })

    await guardedFetch(`${origin}/start`, { method: 'POST', body: 'payload' })

    expect(seen.map((s) => s.method)).toEqual(['POST', 'GET'])
  })

  it('gives up after too many redirects', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(302, { Location: '/loop' })
      res.end()
    })

    await expect(guardedFetch(`${origin}/loop`)).rejects.toThrow(/Too many redirects/)
  })
})

describe('requestRefusal', () => {
  it('honours an explicit consent override for a LAN host', () => {
    // The add-site dialog holds consent before the site row exists.
    expect(requestRefusal('http://mysite.local/wp-json')).not.toBeNull()
    expect(requestRefusal('http://mysite.local/wp-json', true)).toBeNull()
  })

  it('never lets consent override a public plaintext host', () => {
    expect(requestRefusal('http://example.com/wp-json', true)).not.toBeNull()
  })
})

describe('asset downloads', () => {
  it('refuses a plaintext public asset URL before fetching', async () => {
    // Asset URLs arrive from remote API data — an attachment source_url, an img
    // src in post content, an image URL inside ACF JSON — so they get the same
    // policy as an API call.
    await expect(
      guardedFetch('http://cdn.example.com/photo.jpg', undefined, { timeoutMs: 1000 })
    ).rejects.toThrow(TransportRefusedError)
  })

  it('refuses an asset whose redirect downgrades to plaintext', async () => {
    // Electron's net.fetch could not do this: it throws on redirect: 'manual'
    // and leaves response.url empty, so a downgrade was neither preventable nor
    // detectable after the fact.
    const origin = await serve((_req, res) => {
      res.writeHead(302, { Location: 'http://cdn.example.com/photo.jpg' })
      res.end()
    })

    await expect(guardedFetch(`${origin}/photo.jpg`)).rejects.toThrow(TransportRefusedError)
  })
})
