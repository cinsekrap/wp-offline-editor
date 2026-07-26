/**
 * Transport policy for site URLs.
 *
 * The distinction that matters is loopback vs LAN, not "local" vs remote. A
 * loopback request never leaves the machine, so plaintext HTTP to it carries no
 * transport risk. A `*.local` host — which is what Local WP serves — resolves to
 * a LAN address, so plaintext HTTP to it puts the application password and the
 * post content on the network in the clear. That is a real exposure, but a
 * reasonable one to accept knowingly on your own network, so it is offered as an
 * explicit per-site choice rather than allowed silently.
 *
 * Public hosts are never allowed over plaintext, with or without consent.
 */

function hostnameOf(url: string): string | null {
  try {
    // IPv6 hostnames arrive bracketed from the URL parser ("[::1]").
    return new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

/** Loopback — the request never reaches a network interface. */
export function isLoopbackUrl(url: string): boolean {
  const host = hostnameOf(url)
  if (host === null) return false
  return (
    host === 'localhost' ||
    host === '::1' ||
    // The whole 127.0.0.0/8 range is loopback, not just 127.0.0.1.
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    // RFC 6761 reserves .localhost to loopback.
    host.endsWith('.localhost')
  )
}

/**
 * mDNS and dev TLDs — resolves to a LAN address, so plaintext traffic crosses
 * the local network. Local WP uses `*.local`.
 */
export function isLanDevUrl(url: string): boolean {
  const host = hostnameOf(url)
  if (host === null) return false
  return host.endsWith('.local') || host.endsWith('.test')
}

export const PLAINTEXT_LAN_REFUSAL =
  'This site uses http:// on a local network address, so its password and content would cross the network unencrypted. Allow unencrypted connections for this site to continue, or change the URL to https://.'

export const PLAINTEXT_PUBLIC_REFUSAL = 'Non-local sites must use HTTPS. Change the URL to https://.'

/**
 * Returns null when a request to this URL may proceed, or a user-facing reason
 * when it may not. Callers decide whether to throw or surface the message.
 *
 * Only http and https are requestable. Anything else is refused by default
 * rather than by omission, because some URLs reaching here are scraped from
 * remote pages (stylesheet hrefs, image srcs) and could name any scheme.
 */
export function transportRefusal(url: string, allowPlaintext = false): string | null {
  let protocol: string
  try {
    protocol = new URL(url).protocol
  } catch {
    return `Not a valid URL: ${url}`
  }

  if (protocol === 'https:') return null
  if (protocol !== 'http:') return `Refusing to request a ${protocol} URL.`
  if (isLoopbackUrl(url)) return null
  if (isLanDevUrl(url)) return allowPlaintext ? null : PLAINTEXT_LAN_REFUSAL
  return PLAINTEXT_PUBLIC_REFUSAL
}
