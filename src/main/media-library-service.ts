import { app } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchMediaLibrary } from './wp-client'
import { decodeHtmlEntities } from './html-utils'
import type { MediaLibraryItem, MediaLibraryPullResult } from '@shared/types'
import type { WpMediaItemRaw } from './wp-client'

function getLibraryDir(siteId: string): string {
  const dir = join(app.getPath('userData'), 'media-library', siteId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getThumbnailUrl(item: WpMediaItemRaw): string {
  const thumbSize = item.media_details?.sizes?.thumbnail
  if (thumbSize?.source_url) return thumbSize.source_url
  return item.source_url
}

function getFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    return pathname.split('/').pop() || 'image'
  } catch {
    return 'image'
  }
}

async function downloadThumbnail(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download thumbnail: HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(destPath, buffer)
}

export async function pullMediaLibraryForSite(siteId: string): Promise<MediaLibraryPullResult> {
  const site = getSiteById(siteId)
  if (!site) throw new Error(`Site not found: ${siteId}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const limit = site.media_library_limit
  if (limit <= 0) {
    return { total: 0, created: 0, updated: 0, removed: 0, errors: [] }
  }

  const { items } = await fetchMediaLibrary(site.url, site.username, password, limit)
  const db = getDb()
  const dir = getLibraryDir(siteId)
  const errors: string[] = []
  let created = 0
  let updated = 0

  const fetchedIds = new Set<number>()

  for (const item of items) {
    fetchedIds.add(item.id)

    const title = decodeHtmlEntities(item.title.rendered)
    const filename = getFilenameFromUrl(item.source_url)
    const ext = extname(filename) || '.jpg'
    const thumbFilename = `${item.id}${ext}`
    const thumbPath = join(dir, thumbFilename)

    // Download thumbnail if not already cached
    if (!existsSync(thumbPath)) {
      try {
        const thumbUrl = getThumbnailUrl(item)
        await downloadThumbnail(thumbUrl, thumbPath)
      } catch (err) {
        errors.push(`Thumbnail for #${item.id}: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
    }

    const width = item.media_details?.width ?? null
    const height = item.media_details?.height ?? null
    const uploadedAt = item.date || ''

    // Upsert
    const existing = db
      .prepare('SELECT id FROM media_library WHERE site_id = ? AND id = ?')
      .get(siteId, item.id) as { id: number } | undefined

    if (existing) {
      db.prepare(`
        UPDATE media_library SET title = ?, filename = ?, mime_type = ?, alt_text = ?,
          source_url = ?, thumbnail_path = ?, width = ?, height = ?, uploaded_at = ?
        WHERE site_id = ? AND id = ?
      `).run(title, filename, item.mime_type, item.alt_text || '', item.source_url,
        thumbPath, width, height, uploadedAt, siteId, item.id)
      updated++
    } else {
      db.prepare(`
        INSERT INTO media_library (id, site_id, title, filename, mime_type, alt_text, source_url, thumbnail_path, width, height, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, siteId, title, filename, item.mime_type, item.alt_text || '',
        item.source_url, thumbPath, width, height, uploadedAt)
      created++
    }
  }

  // Remove stale items not in fetched set
  const allLocal = db
    .prepare('SELECT id, thumbnail_path FROM media_library WHERE site_id = ?')
    .all(siteId) as { id: number; thumbnail_path: string }[]

  let removed = 0
  for (const local of allLocal) {
    if (!fetchedIds.has(local.id)) {
      db.prepare('DELETE FROM media_library WHERE site_id = ? AND id = ?').run(siteId, local.id)
      if (existsSync(local.thumbnail_path)) {
        try { unlinkSync(local.thumbnail_path) } catch { /* ignore */ }
      }
      removed++
    }
  }

  // Update last pull timestamp
  db.prepare('UPDATE sites SET last_media_library_pull_at = ? WHERE id = ?')
    .run(new Date().toISOString(), siteId)

  return { total: items.length, created, updated, removed, errors }
}

export function getMediaLibraryForSite(siteId: string): MediaLibraryItem[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM media_library WHERE site_id = ? ORDER BY uploaded_at DESC')
    .all(siteId) as MediaLibraryItem[]
  return rows
}
