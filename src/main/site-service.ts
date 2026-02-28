import { v4 as uuidv4 } from 'uuid'
import { join } from 'path'
import { rmSync, readdirSync, unlinkSync } from 'fs'
import { app } from 'electron'
import { getDb } from './database'
import { storeCredential, deleteCredential } from './credentials'
import { isLocalUrl } from './url-utils'
import type { Site, SiteInput, SiteUpdate } from '@shared/types'

function enforceHttps(url: string): string {
  if (isLocalUrl(url)) return url
  if (url.startsWith('http://')) {
    throw new Error('Non-local sites must use HTTPS. Change the URL to https://.')
  }
  return url
}

export function getAllSites(): Site[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM sites ORDER BY label ASC').all() as SiteRow[]
  return rows.map(normalizeSiteRow)
}

export function getSiteById(id: string): Site | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
  return row ? normalizeSiteRow(row) : null
}

export function addSite(input: SiteInput): Site {
  const db = getDb()
  const id = uuidv4()
  const keychainRef = `site-${id}`
  const now = new Date().toISOString()

  // Normalize URL: strip trailing slash
  const url = enforceHttps(input.url.replace(/\/+$/, ''))
  const label = input.label || new URL(url).hostname

  storeCredential(keychainRef, input.password)

  db.prepare(`
    INSERT INTO sites (id, label, url, username, keychain_ref, auto_sync, pull_published, media_library_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, label, url, input.username, keychainRef, input.auto_sync ? 1 : 0, input.pull_published ?? 50, input.media_library_limit ?? 100, now, now)

  return getSiteById(id)!
}

export function updateSite(update: SiteUpdate): Site {
  const db = getDb()
  const existing = getSiteById(update.id)
  if (!existing) throw new Error(`Site not found: ${update.id}`)

  const now = new Date().toISOString()
  const url = update.url ? enforceHttps(update.url.replace(/\/+$/, '')) : existing.url
  const label = update.label ?? existing.label
  const username = update.username ?? existing.username
  const autoSync = update.auto_sync !== undefined ? (update.auto_sync ? 1 : 0) : (existing.auto_sync ? 1 : 0)
  const pullPublished = update.pull_published ?? existing.pull_published
  const mediaLibraryLimit = update.media_library_limit ?? existing.media_library_limit
  const wpAuthorId = update.wp_author_id !== undefined ? update.wp_author_id : existing.wp_author_id

  if (update.password) {
    storeCredential(existing.keychain_ref, update.password)
  }

  db.prepare(`
    UPDATE sites SET label = ?, url = ?, username = ?, auto_sync = ?, pull_published = ?, media_library_limit = ?, wp_author_id = ?, updated_at = ?
    WHERE id = ?
  `).run(label, url, username, autoSync, pullPublished, mediaLibraryLimit, wpAuthorId, now, update.id)

  return getSiteById(update.id)!
}

/** Shared cleanup: remove credential, DB row, and on-disk assets for a site */
function removeSiteAndAssets(siteId: string): void {
  const db = getDb()
  const existing = getSiteById(siteId)
  if (!existing) return

  deleteCredential(existing.keychain_ref)
  db.prepare('DELETE FROM sites WHERE id = ?').run(siteId)

  const userData = app.getPath('userData')

  // Clean up local media files
  try {
    rmSync(join(userData, 'media', siteId), { recursive: true, force: true })
  } catch { /* ignore */ }

  // Clean up cached media library thumbnails
  try {
    rmSync(join(userData, 'media-library', siteId), { recursive: true, force: true })
  } catch { /* ignore */ }

  // Clean up site icon
  try {
    const iconDir = join(userData, 'site-icons')
    for (const f of readdirSync(iconDir)) {
      if (f.startsWith(siteId)) unlinkSync(join(iconDir, f))
    }
  } catch { /* ignore */ }
}

export function deleteSite(id: string): void {
  removeSiteAndAssets(id)
}

export function clearSiteData(siteId: string): void {
  removeSiteAndAssets(siteId)
}

export function updateSiteIconUrl(siteId: string, iconUrl: string | null): void {
  const db = getDb()
  db.prepare('UPDATE sites SET site_icon_url = ?, updated_at = ? WHERE id = ?')
    .run(iconUrl, new Date().toISOString(), siteId)
}

/** Raw shape from SQLite — booleans are integers, nullable columns may be undefined */
interface SiteRow {
  id: string
  label: string
  url: string
  username: string
  keychain_ref: string
  auto_sync: number
  pull_published: number
  last_post_pull_at: string | null
  last_schema_pull_at: string | null
  media_library_limit: number
  last_media_library_pull_at: string | null
  wp_author_id: number | null
  site_icon_url: string | null
  created_at: string
  updated_at: string
}

function normalizeSiteRow(row: SiteRow): Site {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    username: row.username,
    keychain_ref: row.keychain_ref,
    auto_sync: Boolean(row.auto_sync),
    pull_published: Number(row.pull_published),
    last_post_pull_at: row.last_post_pull_at ?? null,
    last_schema_pull_at: row.last_schema_pull_at ?? null,
    media_library_limit: Number(row.media_library_limit),
    last_media_library_pull_at: row.last_media_library_pull_at ?? null,
    wp_author_id: row.wp_author_id ?? null,
    site_icon_url: row.site_icon_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}
