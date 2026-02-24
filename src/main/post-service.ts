import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchPosts, fetchUserNames } from './wp-client'
import { decodeHtmlEntities } from './html-utils'
import type { Post, PostInput, PostUpdate, PullResult, WpPostRaw } from '@shared/types'

export async function pullPostsForSite(siteId: string): Promise<PullResult> {
  const site = getSiteById(siteId)
  if (!site) throw new Error(`Site not found: ${siteId}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const statuses = ['draft', 'pending', 'private', 'future', 'publish']
  const { posts } = await fetchPosts(site.url, site.username, password, statuses, site.pull_published)

  // Resolve author IDs to display names
  const uniqueAuthorIds = [...new Set(posts.map((p) => p.author).filter(Boolean))]
  const authorNames = await fetchUserNames(site.url, site.username, password, uniqueAuthorIds)

  const result: PullResult = { total: posts.length, created: 0, updated: 0, unchanged: 0, errors: [] }

  for (const wpPost of posts) {
    try {
      const authorName = authorNames.get(wpPost.author) ?? null
      const outcome = upsertPost(siteId, wpPost, authorName)
      result[outcome]++
    } catch (err) {
      result.errors.push(`Post ${wpPost.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Update last_post_pull_at
  const db = getDb()
  db.prepare('UPDATE sites SET last_post_pull_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    siteId
  )

  return result
}

function upsertPost(
  siteId: string,
  wpPost: WpPostRaw,
  authorName: string | null
): 'created' | 'updated' | 'unchanged' {
  const db = getDb()

  const existing = db
    .prepare('SELECT id, modified_remote, synced FROM posts WHERE site_id = ? AND wp_id = ?')
    .get(siteId, wpPost.id) as { id: string; modified_remote: string | null; synced: number } | undefined

  const title = decodeHtmlEntities(wpPost.title.rendered)
  const content = wpPost.content.rendered
  const status = wpPost.status
  const modifiedRemote = wpPost.modified
  const wpDate = wpPost.date || null
  const authorId = wpPost.author || null
  const acfJson = wpPost.acf ? JSON.stringify(wpPost.acf) : null
  const now = new Date().toISOString()

  if (!existing) {
    // INSERT new post
    db.prepare(`
      INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, date, author_id, author_name, modified_local, modified_remote, synced, conflict)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).run(uuidv4(), siteId, wpPost.id, title, content, status, acfJson, wpDate, authorId, authorName, now, modifiedRemote)
    return 'created'
  }

  // Same modified timestamp → unchanged, but fix stale encoded titles and backfill date/author
  if (existing.modified_remote === modifiedRemote) {
    db.prepare(
      'UPDATE posts SET title = ?, date = COALESCE(date, ?), author_id = COALESCE(author_id, ?), author_name = COALESCE(author_name, ?) WHERE id = ? AND (title != ? OR date IS NULL OR author_id IS NULL)'
    ).run(title, wpDate, authorId, authorName, existing.id, title)
    return 'unchanged'
  }

  // Different modified_remote
  if (existing.synced === 1) {
    // No local edits → safe to update
    db.prepare(`
      UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, date = ?, author_id = ?, author_name = ?, modified_local = ?, modified_remote = ?, synced = 1, conflict = 0
      WHERE id = ?
    `).run(title, content, status, acfJson, wpDate, authorId, authorName, now, modifiedRemote, existing.id)
    return 'updated'
  }

  // Local edits exist (synced=0) → mark conflict
  db.prepare(`
    UPDATE posts SET conflict = 1, modified_remote = ?
    WHERE id = ?
  `).run(modifiedRemote, existing.id)
  return 'updated'
}

export function getAllPostsForSite(siteId: string): Post[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM posts WHERE site_id = ? ORDER BY modified_local DESC').all(siteId) as Post[]
  return rows.map(normalizePostRow)
}

export function getPostById(id: string): Post | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined
  return row ? normalizePostRow(row) : null
}

export function createPost(input: PostInput): Post {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  const acfJson = input.acf ? JSON.stringify(input.acf) : null

  db.prepare(`
    INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, modified_local, modified_remote, synced, conflict)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, 0, 0)
  `).run(id, input.site_id, input.title ?? '', input.content ?? '', input.status ?? 'draft', acfJson, now)

  return getPostById(id)!
}

export function updatePost(update: PostUpdate): Post {
  const existing = getPostById(update.id)
  if (!existing) throw new Error(`Post not found: ${update.id}`)

  const db = getDb()
  const now = new Date().toISOString()

  const title = update.title ?? existing.title
  const content = update.content ?? existing.content
  const status = update.status ?? existing.status
  const acf = update.acf !== undefined ? update.acf : existing.acf
  const acfJson = acf ? JSON.stringify(acf) : null
  const date = update.date !== undefined ? update.date : existing.date

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, date = ?, modified_local = ?, synced = 0
    WHERE id = ?
  `).run(title, content, status, acfJson, date, now, update.id)

  return getPostById(update.id)!
}

export function deletePost(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM posts WHERE id = ?').run(id)
}

function normalizePostRow(row: Post): Post {
  return {
    ...row,
    synced: Boolean(row.synced),
    conflict: Boolean(row.conflict),
    acf: typeof row.acf === 'string' ? JSON.parse(row.acf) : row.acf,
    date: row.date ?? null,
    author_id: row.author_id ?? null,
    author_name: row.author_name ?? null
  }
}
