import { getDb } from './database'
import { isLoopbackUrl, transportRefusal } from './url-utils'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Refused before any bytes left the machine — distinct from a network failure. */
export class TransportRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransportRefusedError'
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Whether plaintext is consented for this URL's origin.
 *
 * Consent is stored per site, so an asset on a third-party host (a CDN) is never
 * covered by it. That is deliberate: a site's own LAN address is a risk the user
 * accepted knowingly, an arbitrary host is not.
 *
 * Fails closed — an unreadable URL or unavailable database means no consent.
 */
function plaintextConsented(url: string): boolean {
  if (isLoopbackUrl(url)) return true
  const origin = originOf(url)
  if (origin === null) return false
  try {
    const rows = getDb().prepare('SELECT url FROM sites WHERE allow_plaintext = 1').all() as {
      url: string
    }[]
    return rows.some((row) => originOf(row.url) === origin)
  } catch {
    return false
  }
}

/**
 * Reason this URL may not be requested, or null when it may.
 *
 * `allowPlaintext` is for callers holding consent that isn't in the database yet
 * — testing a connection from the add-site dialog, before the site exists.
 */
export function requestRefusal(url: string, allowPlaintext = false): string | null {
  return transportRefusal(url, allowPlaintext || plaintextConsented(url))
}

export function assertRequestAllowed(url: string, allowPlaintext = false): void {
  const refusal = requestRefusal(url, allowPlaintext)
  if (refusal !== null) throw new TransportRefusedError(refusal)
}

function fetchWithAbort(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * Drop credentials when a redirect crosses an origin.
 *
 * fetch does this itself when it follows redirects, but we follow them by hand
 * (see guardedFetch), so the responsibility moves to us — otherwise manual
 * following would hand the application password to whatever host the redirect
 * names, which is strictly worse than the behaviour it replaced.
 */
function withoutCredentialHeaders(headers: RequestInit['headers']): RequestInit['headers'] {
  if (headers === undefined) return undefined
  const stripped = new Headers(headers)
  stripped.delete('authorization')
  stripped.delete('cookie')
  return stripped
}

/**
 * fetch with the transport policy enforced on the initial URL *and on every
 * redirect hop*. An https site that redirects to http would otherwise move the
 * request onto the network in the clear — which is the whole reason redirects
 * are followed manually here rather than by fetch.
 */
export async function guardedFetch(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; allowPlaintext?: boolean } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, allowPlaintext = false } = opts
  let current = url
  let request: RequestInit = { ...init }

  for (let hop = 0; ; hop++) {
    assertRequestAllowed(current, allowPlaintext)

    const res = await fetchWithAbort(current, { ...request, redirect: 'manual' }, timeoutMs)
    if (!REDIRECT_STATUSES.has(res.status)) return res

    const location = res.headers.get('location')
    if (location === null) return res
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects: ${url}`)

    let next: string
    try {
      next = new URL(location, current).toString()
    } catch {
      return res
    }

    // Mirror fetch's method rewriting: 303 always becomes GET, and a 301/302 on
    // a POST historically does too. 307/308 preserve both method and body.
    const method = (request.method ?? 'GET').toUpperCase()
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      request = { ...request, method: 'GET', body: undefined }
    }
    if (originOf(next) !== originOf(current)) {
      request = { ...request, headers: withoutCredentialHeaders(request.headers) }
    }

    current = next
  }
}
