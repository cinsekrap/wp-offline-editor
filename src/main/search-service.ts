import { getDb } from './database'
import type { SearchResult } from '@shared/types'

/** Strip HTML tags + entities + collapse whitespace for FTS indexing. */
export function stripHtmlForFts(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Index (or re-index) a post in the FTS5 table. */
export function indexPost(postId: string, siteId: string, title: string, content: string, excerpt: string): void {
  const db = getDb()
  const plain = stripHtmlForFts(content)
  db.prepare('DELETE FROM posts_fts WHERE post_id = ?').run(postId)
  db.prepare('INSERT INTO posts_fts (post_id, site_id, title, content, excerpt) VALUES (?, ?, ?, ?, ?)').run(
    postId, siteId, title, plain, excerpt
  )
}

/** Remove a post from the FTS5 index. */
export function removePostFromIndex(postId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM posts_fts WHERE post_id = ?').run(postId)
}

/**
 * Search posts within a site using FTS5.
 * Each query word is double-quoted for FTS5 safety (prevents syntax errors from special chars).
 */
export function searchPosts(query: string, siteId: string): SearchResult[] {
  const db = getDb()

  // Sanitize: split into words, quote each for FTS5 safety
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const ftsQuery = words.map((w) => `"${w.replace(/"/g, '""')}"`).join(' ')

  const rows = db.prepare(`
    SELECT
      post_id,
      site_id,
      snippet(posts_fts, 2, '<mark>', '</mark>', '...', 32) AS title_snippet,
      snippet(posts_fts, 3, '<mark>', '</mark>', '...', 64) AS snippet,
      rank
    FROM posts_fts
    WHERE posts_fts MATCH ? AND site_id = ?
    ORDER BY rank
    LIMIT 50
  `).all(ftsQuery, siteId) as Array<{
    post_id: string
    site_id: string
    title_snippet: string
    snippet: string
    rank: number
  }>

  return rows.map((r) => ({
    post_id: r.post_id,
    site_id: r.site_id,
    title: r.title_snippet,
    snippet: r.snippet,
    rank: r.rank
  }))
}
