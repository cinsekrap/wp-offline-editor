import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import type { Revision } from '@shared/types'

const MAX_REVISIONS = 50
const MIN_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Capture a revision snapshot of a post.
 * With force=false (default, used by auto-save): skips if <5 min since last revision.
 * With force=true (used when leaving a post): always captures, but skips if content identical.
 * Prunes oldest revisions beyond the cap.
 */
export function captureRevision(
  postId: string,
  title: string,
  content: string,
  excerpt: string,
  wordCount: number,
  force = false
): void {
  const db = getDb()

  // Check last revision
  const last = db.prepare(
    'SELECT created_at, title, content, excerpt FROM revisions WHERE post_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(postId) as { created_at: string; title: string; content: string; excerpt: string } | undefined

  if (last) {
    // Skip if content is identical to last revision (nothing changed)
    if (last.title === title && last.content === content && last.excerpt === excerpt) return

    // For non-forced captures, apply the time gate
    if (!force) {
      const elapsed = Date.now() - new Date(last.created_at + 'Z').getTime()
      if (elapsed < MIN_INTERVAL_MS) return
    }
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO revisions (id, post_id, title, content, excerpt, word_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, postId, title, content, excerpt, wordCount)

  // Prune beyond cap
  const count = (db.prepare('SELECT COUNT(*) as c FROM revisions WHERE post_id = ?').get(postId) as { c: number }).c
  if (count > MAX_REVISIONS) {
    db.prepare(`
      DELETE FROM revisions WHERE id IN (
        SELECT id FROM revisions WHERE post_id = ? ORDER BY created_at ASC LIMIT ?
      )
    `).run(postId, count - MAX_REVISIONS)
  }
}

/** Force-capture a revision for a post by reading its current state from DB. */
export function captureRevisionForPost(postId: string): void {
  const db = getDb()
  const post = db.prepare('SELECT title, content, excerpt, word_count FROM posts WHERE id = ?').get(postId) as
    { title: string; content: string; excerpt: string; word_count: number } | undefined
  if (!post) return
  captureRevision(postId, post.title, post.content, post.excerpt, post.word_count, true)
}

export function getRevisionsForPost(postId: string): Revision[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM revisions WHERE post_id = ? ORDER BY created_at DESC'
  ).all(postId) as Revision[]
}

/** Restore a revision's content into its post. Returns the post_id. */
export function restoreRevision(revisionId: string): string {
  const db = getDb()
  const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(revisionId) as Revision | undefined
  if (!rev) throw new Error(`Revision not found: ${revisionId}`)

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE posts SET title = ?, content = ?, excerpt = ?, word_count = ?, modified_local = ?, synced = 0
    WHERE id = ?
  `).run(rev.title, rev.content, rev.excerpt, rev.word_count, now, rev.post_id)

  return rev.post_id
}
