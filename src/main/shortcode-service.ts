import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchShortcodes } from './wp-client'

const WP_CORE_SHORTCODES = new Set([
  'embed',
  'caption',
  'wp_caption',
  'gallery',
  'audio',
  'video',
  'playlist'
])

export async function getShortcodesForSite(siteId: string): Promise<string[]> {
  const site = getSiteById(siteId)
  if (!site) throw new Error(`Site not found: ${siteId}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const raw = await fetchShortcodes(site.url, site.username, password)

  return raw
    .map((s) => s.tag)
    .filter((tag) => !WP_CORE_SHORTCODES.has(tag))
    .sort((a, b) => a.localeCompare(b))
}
