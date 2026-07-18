import { app } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readdirSync, readFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchMediaLibrary, fetchMediaItem, uploadMediaBuffer, updateMediaAltText } from './wp-client'
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

/**
 * Cache a single WP attachment into the `media_library` table for a site,
 * downloading its thumbnail if not already present. Shared by the sync pull
 * loop and the standalone uploader. Throws if the thumbnail can't be fetched.
 */
async function upsertMediaLibraryItem(
  siteId: string,
  item: WpMediaItemRaw,
  dir: string
): Promise<'created' | 'updated'> {
  const db = getDb()

  const title = decodeHtmlEntities(item.title.rendered)
  const filename = getFilenameFromUrl(item.source_url)
  const ext = extname(filename) || '.jpg'
  const thumbPath = join(dir, `${item.id}${ext}`)

  // Download thumbnail if not already cached
  if (!existsSync(thumbPath)) {
    await downloadThumbnail(getThumbnailUrl(item), thumbPath)
  }

  const width = item.media_details?.width ?? null
  const height = item.media_details?.height ?? null
  const uploadedAt = item.date || ''

  const existing = db
    .prepare('SELECT id FROM media_library WHERE site_id = ? AND id = ?')
    .get(siteId, item.id) as { id: number } | undefined

  if (existing) {
    // A queued local alt edit (pending_alt_text) wins over the remote value
    // until sync applies it — don't let a pull visually revert it
    db.prepare(`
      UPDATE media_library SET title = ?, filename = ?, mime_type = ?,
        alt_text = COALESCE(pending_alt_text, ?),
        source_url = ?, thumbnail_path = ?, width = ?, height = ?, uploaded_at = ?
      WHERE site_id = ? AND id = ?
    `).run(title, filename, item.mime_type, item.alt_text || '', item.source_url,
      thumbPath, width, height, uploadedAt, siteId, item.id)
    return 'updated'
  }

  db.prepare(`
    INSERT INTO media_library (id, site_id, title, filename, mime_type, alt_text, source_url, thumbnail_path, width, height, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, siteId, title, filename, item.mime_type, item.alt_text || '',
    item.source_url, thumbPath, width, height, uploadedAt)
  return 'created'
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
    try {
      const result = await upsertMediaLibraryItem(siteId, item, dir)
      if (result === 'created') created++
      else updated++
    } catch (err) {
      errors.push(`Item #${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Remove stale items not in fetched set (but never rows carrying a queued
  // offline alt-text edit — losing those would drop user data)
  const allLocal = db
    .prepare('SELECT id, thumbnail_path, pending_alt_text FROM media_library WHERE site_id = ?')
    .all(siteId) as { id: number; thumbnail_path: string; pending_alt_text: string | null }[]

  let removed = 0
  for (const local of allLocal) {
    if (local.pending_alt_text != null) continue
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

interface PendingRow {
  id: number
  site_id: string
  filename: string
  local_path: string
  mime_type: string
  alt_text: string
  created_at: string
}

/** Shape a staged (not-yet-uploaded) row as a MediaLibraryItem (negative id). */
function pendingToItem(row: PendingRow): MediaLibraryItem {
  return {
    id: row.id,
    site_id: row.site_id,
    title: row.filename,
    filename: row.filename,
    mime_type: row.mime_type,
    alt_text: row.alt_text,
    source_url: '',
    thumbnail_path: row.local_path,
    width: null,
    height: null,
    uploaded_at: row.created_at
  }
}

function getPendingRows(siteId: string): PendingRow[] {
  return getDb()
    .prepare('SELECT * FROM media_library_pending WHERE site_id = ? ORDER BY created_at DESC')
    .all(siteId) as PendingRow[]
}

/** Staged items first (they're the freshest), then the cached remote library. */
export function getMediaLibraryForSite(siteId: string): MediaLibraryItem[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM media_library WHERE site_id = ? ORDER BY uploaded_at DESC')
    .all(siteId) as MediaLibraryItem[]
  return [...getPendingRows(siteId).map(pendingToItem), ...rows]
}

export function getMediaLibraryItem(siteId: string, id: number): MediaLibraryItem | null {
  const db = getDb()
  if (id < 0) {
    const row = db
      .prepare('SELECT * FROM media_library_pending WHERE site_id = ? AND id = ?')
      .get(siteId, id) as PendingRow | undefined
    return row ? pendingToItem(row) : null
  }
  const row = db
    .prepare('SELECT * FROM media_library WHERE site_id = ? AND id = ?')
    .get(siteId, id) as MediaLibraryItem | undefined
  return row ?? null
}

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.pdf': 'application/pdf'
}

/**
 * Stage a file into the local library (works offline). It shows in the grid
 * immediately with a negative id and is uploaded on the next sync.
 */
export function stageMediaLibraryUpload(
  siteId: string,
  filename: string,
  buffer: Buffer,
): MediaLibraryItem {
  const db = getDb()
  const minRow = db
    .prepare('SELECT MIN(id) AS m FROM media_library_pending')
    .get() as { m: number | null }
  const negId = Math.min(minRow.m ?? 0, 0) - 1

  const dir = getLibraryDir(siteId)
  const safeName = filename.replace(/[^\w.\-]+/g, '_')
  const localPath = join(dir, `pending-${uuidv4()}-${safeName}`)
  writeFileSync(localPath, buffer)

  const ext = extname(filename).toLowerCase()
  db.prepare(`
    INSERT INTO media_library_pending (id, site_id, filename, local_path, mime_type, alt_text, created_at)
    VALUES (?, ?, ?, ?, ?, '', ?)
  `).run(negId, siteId, filename, localPath, EXT_MIME[ext] ?? 'application/octet-stream', new Date().toISOString())

  return getMediaLibraryItem(siteId, negId)!
}

/** Remove a staged (not yet uploaded) item and its local file. */
export function deletePendingMediaLibraryItem(siteId: string, id: number): void {
  if (id >= 0) throw new Error('Only staged (pending) items can be removed here')
  const db = getDb()
  const row = db
    .prepare('SELECT local_path FROM media_library_pending WHERE site_id = ? AND id = ?')
    .get(siteId, id) as { local_path: string } | undefined
  if (!row) return
  db.prepare('DELETE FROM media_library_pending WHERE site_id = ? AND id = ?').run(siteId, id)
  if (existsSync(row.local_path)) {
    try { unlinkSync(row.local_path) } catch { /* ignore */ }
  }
}

/**
 * Push everything the library is waiting to sync: staged uploads, then queued
 * alt-text edits. Called from syncSite; safe to call any time (no-op when
 * nothing is pending). Failures leave items pending and are reported.
 */
export async function pushMediaLibraryPending(
  siteId: string
): Promise<{ uploaded: number; altApplied: number; errors: string[]; idMap: Map<number, number> }> {
  const db = getDb()
  const errors: string[] = []
  const idMap = new Map<number, number>()
  let uploaded = 0
  let altApplied = 0

  const pending = getPendingRows(siteId)
  const altRows = db
    .prepare('SELECT id, pending_alt_text FROM media_library WHERE site_id = ? AND pending_alt_text IS NOT NULL')
    .all(siteId) as { id: number; pending_alt_text: string }[]
  if (pending.length === 0 && altRows.length === 0) {
    return { uploaded, altApplied, errors, idMap }
  }

  const site = getSiteById(siteId)
  if (!site) return { uploaded, altApplied, errors, idMap }
  const password = getCredential(site.keychain_ref)
  if (!password) {
    return { uploaded, altApplied, errors: [`No credential to sync media library for ${site.label}`], idMap }
  }

  const dir = getLibraryDir(siteId)

  for (const row of pending) {
    try {
      const buffer = readFileSync(row.local_path)
      const { id } = await uploadMediaBuffer(site.url, site.username, password, buffer, row.filename)
      if (row.alt_text) {
        try {
          await updateMediaAltText(site.url, site.username, password, id, row.alt_text)
        } catch { /* alt is best-effort on fresh uploads */ }
      }
      const item = await fetchMediaItem(site.url, site.username, password, id)
      await upsertMediaLibraryItem(siteId, item, dir)
      db.prepare('DELETE FROM media_library_pending WHERE id = ?').run(row.id)
      if (existsSync(row.local_path)) {
        try { unlinkSync(row.local_path) } catch { /* ignore */ }
      }
      idMap.set(row.id, id)
      uploaded++
    } catch (err) {
      errors.push(`Upload "${row.filename}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const row of altRows) {
    try {
      const outcome = await updateMediaAltText(site.url, site.username, password, row.id, row.pending_alt_text)
      if (outcome === 'gone') {
        // Attachment deleted on WordPress — drop the queued edit so the row
        // stops retrying forever and the next pull's prune can remove it.
        db.prepare('UPDATE media_library SET pending_alt_text = NULL WHERE site_id = ? AND id = ?')
          .run(siteId, row.id)
        continue
      }
      db.prepare('UPDATE media_library SET alt_text = ?, pending_alt_text = NULL WHERE site_id = ? AND id = ?')
        .run(row.pending_alt_text, siteId, row.id)
      altApplied++
    } catch (err) {
      errors.push(`Alt text for #${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { uploaded, altApplied, errors, idMap }
}

/**
 * Local-first upload: stage the file, then immediately try to push. Online this
 * feels like a direct upload (the returned item has its real WP id); offline
 * the staged item (negative id) is returned and syncs later.
 */
export async function uploadToMediaLibrary(
  siteId: string,
  filename: string,
  buffer: Buffer
): Promise<MediaLibraryItem> {
  const staged = stageMediaLibraryUpload(siteId, filename, buffer)
  try {
    const result = await pushMediaLibraryPending(siteId)
    const realId = result.idMap.get(staged.id)
    if (realId !== undefined) {
      return getMediaLibraryItem(siteId, realId) ?? staged
    }
  } catch {
    /* offline or WP unreachable — stays staged, syncs later */
  }
  return getMediaLibraryItem(siteId, staged.id) ?? staged
}

/**
 * Local-first alt text: staged items update their row directly; cached remote
 * items store the edit as pending and try to apply it immediately. Either way
 * the change is saved locally and survives offline.
 */
export async function updateMediaLibraryAltText(
  siteId: string,
  id: number,
  altText: string
): Promise<MediaLibraryItem> {
  const db = getDb()

  if (id < 0) {
    db.prepare('UPDATE media_library_pending SET alt_text = ? WHERE site_id = ? AND id = ?')
      .run(altText, siteId, id)
    const item = getMediaLibraryItem(siteId, id)
    if (!item) throw new Error(`Staged item not found: ${id}`)
    return item
  }

  const existing = getMediaLibraryItem(siteId, id)
  if (!existing) throw new Error(`Library item not found: ${id}`)

  // Save locally first (optimistic display + offline durability)…
  db.prepare('UPDATE media_library SET alt_text = ?, pending_alt_text = ? WHERE site_id = ? AND id = ?')
    .run(altText, altText, siteId, id)

  // …then try to apply remotely right away; failure just leaves it queued.
  try {
    const site = getSiteById(siteId)
    const password = site ? getCredential(site.keychain_ref) : null
    if (site && password) {
      await updateMediaAltText(site.url, site.username, password, id, altText)
      db.prepare('UPDATE media_library SET pending_alt_text = NULL WHERE site_id = ? AND id = ?')
        .run(siteId, id)
    }
  } catch {
    /* queued — applied on next sync */
  }

  return getMediaLibraryItem(siteId, id)!
}
