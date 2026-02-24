import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { uploadMedia } from './wp-client'
import type { Media } from '@shared/types'

function getMediaDir(siteId: string): string {
  const dir = join(app.getPath('userData'), 'media', siteId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function normalizeMediaRow(row: Media): Media {
  return {
    ...row,
    synced: Boolean(row.synced)
  }
}

export function saveMediaLocally(
  siteId: string,
  postLocalId: string,
  filename: string,
  buffer: Buffer
): Media {
  const db = getDb()
  const id = uuidv4()
  const safeFilename = `${id}-${filename}`
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
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as Media | undefined
  return row ? normalizeMediaRow(row) : null
}

export function getMediaForPost(postLocalId: string): Media[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM media WHERE post_local_id = ?').all(postLocalId) as Media[]
  return rows.map(normalizeMediaRow)
}

export function getMediaQueue(siteId: string): Media[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM media WHERE site_id = ? AND synced = 0')
    .all(siteId) as Media[]
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
