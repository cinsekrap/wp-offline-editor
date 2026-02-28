import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import type { Scratchpad, ScratchpadInput, ScratchpadUpdate } from '@shared/types'

interface ScratchpadRow {
  id: string
  site_id: string
  wp_id: number | null
  title: string
  content: string
  modified_local: string
  modified_remote: string | null
  synced: number
}

function normalizeRow(row: ScratchpadRow): Scratchpad {
  return {
    id: row.id,
    site_id: row.site_id,
    wp_id: row.wp_id,
    title: row.title,
    content: row.content,
    modified_local: row.modified_local,
    modified_remote: row.modified_remote,
    synced: Boolean(row.synced)
  }
}

export function getScratchpadsForSite(siteId: string): Scratchpad[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM scratchpads WHERE site_id = ? ORDER BY modified_local DESC')
    .all(siteId) as ScratchpadRow[]
  return rows.map(normalizeRow)
}

export function getScratchpadById(id: string): Scratchpad | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM scratchpads WHERE id = ?').get(id) as
    | ScratchpadRow
    | undefined
  return row ? normalizeRow(row) : null
}

export function createScratchpad(input: ScratchpadInput): Scratchpad {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO scratchpads (id, site_id, title, content, modified_local, synced)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, input.site_id, input.title, input.content ?? '', now)

  return getScratchpadById(id)!
}

export function updateScratchpad(update: ScratchpadUpdate): Scratchpad {
  const existing = getScratchpadById(update.id)
  if (!existing) throw new Error(`Scratchpad not found: ${update.id}`)

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE scratchpads SET title = ?, content = ?, modified_local = ?, synced = 0
    WHERE id = ?
  `).run(
    update.title ?? existing.title,
    update.content ?? existing.content,
    now,
    update.id
  )

  return getScratchpadById(update.id)!
}

export function deleteScratchpad(id: string): void {
  const db = getDb()
  // Unlink any posts referencing this scratchpad
  db.prepare('UPDATE posts SET scratchpad_id = NULL WHERE scratchpad_id = ?').run(id)
  db.prepare('DELETE FROM scratchpads WHERE id = ?').run(id)
}

export function linkScratchpadToPost(postId: string, scratchpadId: string): void {
  const db = getDb()
  db.prepare('UPDATE posts SET scratchpad_id = ? WHERE id = ?').run(scratchpadId, postId)
}

export function unlinkScratchpadFromPost(postId: string): void {
  const db = getDb()
  db.prepare('UPDATE posts SET scratchpad_id = NULL WHERE id = ?').run(postId)
}

export function getLinkedScratchpad(postId: string): Scratchpad | null {
  const db = getDb()
  const row = db
    .prepare(`
      SELECT s.* FROM scratchpads s
      JOIN posts p ON p.scratchpad_id = s.id
      WHERE p.id = ?
    `)
    .get(postId) as ScratchpadRow | undefined
  return row ? normalizeRow(row) : null
}
