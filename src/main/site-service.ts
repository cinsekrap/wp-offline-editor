import { v4 as uuidv4 } from 'uuid'
import { join } from 'path'
import { rmSync } from 'fs'
import { app } from 'electron'
import { getDb } from './database'
import { storeCredential, deleteCredential } from './credentials'
import type { Site, SiteInput, SiteUpdate } from '@shared/types'

export function getAllSites(): Site[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM sites ORDER BY label ASC').all() as Site[]
  return rows.map(normalizeSiteRow)
}

export function getSiteById(id: string): Site | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as Site | undefined
  return row ? normalizeSiteRow(row) : null
}

export function addSite(input: SiteInput): Site {
  const db = getDb()
  const id = uuidv4()
  const keychainRef = `site-${id}`
  const now = new Date().toISOString()

  // Normalize URL: strip trailing slash
  const url = input.url.replace(/\/+$/, '')
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
  const url = update.url ? update.url.replace(/\/+$/, '') : existing.url
  const label = update.label ?? existing.label
  const username = update.username ?? existing.username
  const autoSync = update.auto_sync !== undefined ? (update.auto_sync ? 1 : 0) : (existing.auto_sync ? 1 : 0)
  const pullPublished = update.pull_published ?? existing.pull_published
  const mediaLibraryLimit = update.media_library_limit ?? existing.media_library_limit

  if (update.password) {
    storeCredential(existing.keychain_ref, update.password)
  }

  db.prepare(`
    UPDATE sites SET label = ?, url = ?, username = ?, auto_sync = ?, pull_published = ?, media_library_limit = ?, updated_at = ?
    WHERE id = ?
  `).run(label, url, username, autoSync, pullPublished, mediaLibraryLimit, now, update.id)

  return getSiteById(update.id)!
}

export function deleteSite(id: string): void {
  const db = getDb()
  const existing = getSiteById(id)
  if (!existing) return

  deleteCredential(existing.keychain_ref)
  db.prepare('DELETE FROM sites WHERE id = ?').run(id)

  // Clean up cached media library thumbnails
  try {
    rmSync(join(app.getPath('userData'), 'media-library', id), { recursive: true, force: true })
  } catch { /* ignore */ }
}

function normalizeSiteRow(row: Site): Site {
  return {
    ...row,
    auto_sync: Boolean(row.auto_sync),
    pull_published: Number(row.pull_published),
    media_library_limit: Number(row.media_library_limit)
  }
}
