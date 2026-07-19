import { v4 as uuidv4 } from 'uuid'
import { app, net } from 'electron'
import { join, basename } from 'path'
import { mkdirSync, writeFileSync, existsSync, unlinkSync, copyFileSync } from 'fs'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { uploadMedia } from './wp-client'
import type { Media, MediaLibraryItem } from '@shared/types'

function getMediaDir(siteId: string): string {
  const dir = join(app.getPath('userData'), 'media', siteId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Raw shape from SQLite — synced is stored as INTEGER */
interface MediaRow extends Omit<Media, 'synced'> {
  synced: number
}

function normalizeMediaRow(row: MediaRow): Media {
  return {
    ...row,
    synced: Boolean(row.synced)
  }
}

export function saveMediaFromWp(
  siteId: string,
  postLocalId: string,
  filename: string,
  buffer: Buffer,
  wpUrl: string
): Media {
  const db = getDb()

  // Dedup: if we already have this wp_url for this post, return existing
  const existing = db
    .prepare('SELECT * FROM media WHERE post_local_id = ? AND wp_url = ?')
    .get(postLocalId, wpUrl) as MediaRow | undefined
  if (existing) return normalizeMediaRow(existing)

  const id = uuidv4()
  const safeFilename = `${id}-${basename(filename)}`
  const dir = getMediaDir(siteId)
  const localPath = join(dir, safeFilename)

  writeFileSync(localPath, buffer)

  db.prepare(`
    INSERT INTO media (id, site_id, post_local_id, local_path, wp_url, filename, synced)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, siteId, postLocalId, localPath, wpUrl, filename)

  return getMediaById(id)!
}

export function saveMediaLocally(
  siteId: string,
  postLocalId: string,
  filename: string,
  buffer: Buffer
): Media {
  const db = getDb()
  const id = uuidv4()
  const safeFilename = `${id}-${basename(filename)}`
  const dir = getMediaDir(siteId)
  const localPath = join(dir, safeFilename)

  writeFileSync(localPath, buffer)

  db.prepare(`
    INSERT INTO media (id, site_id, post_local_id, local_path, filename, synced)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, siteId, postLocalId, localPath, filename)

  return getMediaById(id)!
}

export function getMediaById(id: string): Media | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow | undefined
  return row ? normalizeMediaRow(row) : null
}

export function getMediaForPost(postLocalId: string): Media[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM media WHERE post_local_id = ?').all(postLocalId) as MediaRow[]
  return rows.map(normalizeMediaRow)
}

export function getMediaQueue(siteId: string): Media[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM media WHERE site_id = ? AND synced = 0')
    .all(siteId) as MediaRow[]
  return rows.map(normalizeMediaRow)
}

export async function uploadMediaToWp(mediaId: string): Promise<Media> {
  const media = getMediaById(mediaId)
  if (!media) throw new Error(`Media not found: ${mediaId}`)
  if (media.synced) return media

  const site = getSiteById(media.site_id)
  if (!site) throw new Error(`Site not found: ${media.site_id}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const result = await uploadMedia(site.url, site.username, password, media.local_path, media.filename)

  const db = getDb()
  db.prepare('UPDATE media SET wp_id = ?, wp_url = ?, synced = 1 WHERE id = ?').run(
    result.id,
    result.source_url,
    mediaId
  )

  return getMediaById(mediaId)!
}

export function replaceMediaFile(mediaId: string, buffer: Buffer): Media {
  const media = getMediaById(mediaId)
  if (!media) throw new Error(`Media not found: ${mediaId}`)

  writeFileSync(media.local_path, buffer)

  const db = getDb()
  db.prepare('UPDATE media SET synced = 0, wp_id = NULL, wp_url = NULL WHERE id = ?').run(mediaId)

  return getMediaById(mediaId)!
}

/**
 * Adopt a media-library item into this post's media queue as a synced row.
 * Reuses the locally-cached library thumbnail for offline display, but stores
 * the full WP source_url so push correctly swaps `media://...` → wp source.
 *
 * Dedupes: if this post already references the same library item (by wp_id),
 * the existing media row is returned.
 */
export async function saveMediaFromLibrary(
  siteId: string,
  postLocalId: string,
  libraryItemId: number
): Promise<Media> {
  const db = getDb()

  const libraryItem = db
    .prepare('SELECT * FROM media_library WHERE site_id = ? AND id = ?')
    .get(siteId, libraryItemId) as MediaLibraryItem | undefined
  if (!libraryItem) throw new Error(`Library item not found: ${libraryItemId}`)

  // Dedupe — if this post already adopted this WP attachment, reuse it
  const existing = db
    .prepare('SELECT * FROM media WHERE post_local_id = ? AND wp_id = ?')
    .get(postLocalId, libraryItemId) as MediaRow | undefined
  if (existing) return normalizeMediaRow(existing)

  const id = uuidv4()
  const filename = libraryItem.filename || `library-${libraryItemId}`
  const safeFilename = `${id}-${basename(filename)}`
  const dir = getMediaDir(siteId)
  const localPath = join(dir, safeFilename)

  // Prefer the full-size remote image if we can reach it, so the editor
  // and any subsequent push send the full image, not the thumbnail.
  // Fall back to the cached thumbnail if offline or fetch fails.
  let copied = false
  try {
    const resp = await net.fetch(libraryItem.source_url)
    if (resp.ok) {
      const buffer = Buffer.from(await resp.arrayBuffer())
      writeFileSync(localPath, buffer)
      copied = true
    }
  } catch {
    // network unavailable — fall through to local thumbnail copy
  }
  if (!copied) {
    if (!existsSync(libraryItem.thumbnail_path)) {
      throw new Error('Library thumbnail file is missing')
    }
    copyFileSync(libraryItem.thumbnail_path, localPath)
  }

  db.prepare(`
    INSERT INTO media (id, site_id, post_local_id, local_path, wp_id, wp_url, filename, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, siteId, postLocalId, localPath, libraryItemId, libraryItem.source_url, filename)

  return getMediaById(id)!
}

/**
 * Adopt a STAGED media-library upload (negative id, not yet on WordPress)
 * into a post. This is a transfer of ownership, not a copy: the post's push
 * uploads the image, so the staged row is removed — leaving it queued would
 * upload the same file twice and create a duplicate attachment. The image
 * reappears in the media library on the pull after the post pushes.
 */
export function saveMediaFromStagedLibrary(
  siteId: string,
  postLocalId: string,
  stagedId: number
): Media {
  const db = getDb()

  const staged = db
    .prepare('SELECT * FROM media_library_pending WHERE site_id = ? AND id = ?')
    .get(siteId, stagedId) as
    | { id: number; filename: string; local_path: string; mime_type: string; alt_text: string }
    | undefined
  if (!staged) throw new Error(`Staged library item not found: ${stagedId}`)
  if (!existsSync(staged.local_path)) throw new Error('Staged file is missing from disk')

  const id = uuidv4()
  const filename = staged.filename || `staged${stagedId}`
  const localPath = join(getMediaDir(siteId), `${id}-${basename(filename)}`)
  copyFileSync(staged.local_path, localPath)

  db.prepare('DELETE FROM media_library_pending WHERE site_id = ? AND id = ?').run(siteId, stagedId)
  try {
    unlinkSync(staged.local_path)
  } catch {
    // already copied — a leftover staging file is harmless
  }

  db.prepare(`
    INSERT INTO media (id, site_id, post_local_id, local_path, wp_id, wp_url, filename, synced)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, 0)
  `).run(id, siteId, postLocalId, localPath, filename)

  return getMediaById(id)!
}

export function deleteMedia(id: string): void {
  const media = getMediaById(id)
  if (!media) return

  // Delete the local file
  if (existsSync(media.local_path)) {
    unlinkSync(media.local_path)
  }

  const db = getDb()
  db.prepare('DELETE FROM media WHERE id = ?').run(id)
}
