import { v4 as uuidv4 } from 'uuid'
import { basename } from 'path'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchPosts, fetchUserNames, fetchAttachmentUrl, fetchAllPostIds, fetchRemotePostExistence } from './wp-client'
import { decodeHtmlEntities } from './html-utils'
import { sanitizeHtml } from './sanitize'
import { normalizeAcf } from './acf-utils'
import { saveMediaFromWp } from './media-service'
import { net } from 'electron'
import { existsSync } from 'fs'
import { indexPost, removePostFromIndex } from './search-service'
import { captureRevision } from './revision-service'
import type { Post, PostInput, PostUpdate, PullResult, WpPostRaw } from '@shared/types'

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const resp = await net.fetch(url)
    if (!resp.ok) {
      console.warn(`[media] Download failed (${resp.status}): ${url}`)
      return null
    }
    return Buffer.from(await resp.arrayBuffer())
  } catch (err) {
    console.warn(`[media] Download error for ${url}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * WordPress may store image URLs with a different origin than the actual
 * accessible site URL (e.g. missing port in Local WP setups).
 * This rewrites image URLs whose hostname matches the site to use the site's origin.
 */
function normalizeImageUrl(imageUrl: string, siteUrl: string): string {
  try {
    const img = new URL(imageUrl)
    const site = new URL(siteUrl)
    if (img.hostname === site.hostname && img.origin !== site.origin) {
      img.protocol = site.protocol
      img.host = site.host // includes port
      return img.toString()
    }
  } catch {
    // invalid URL, return as-is
  }
  return imageUrl
}

export async function downloadFeaturedImage(
  siteId: string,
  postLocalId: string,
  attachmentId: number,
  siteUrl: string
): Promise<string | null> {
  const site = getSiteById(siteId)
  if (!site) return null

  const password = getCredential(site.keychain_ref)
  if (!password) return null

  const sourceUrl = await fetchAttachmentUrl(siteUrl, site.username, password, attachmentId)
  if (!sourceUrl) return null

  const fetchUrl = normalizeImageUrl(sourceUrl, siteUrl)
  const buffer = await downloadBuffer(fetchUrl)
  if (!buffer) return null

  const urlPath = new URL(sourceUrl).pathname
  const filename = basename(urlPath) || 'featured.jpg'
  const media = saveMediaFromWp(siteId, postLocalId, filename, buffer, sourceUrl)
  return media.id
}

export async function downloadAndRewriteImages(
  siteId: string,
  postLocalId: string,
  html: string,
  siteUrl?: string
): Promise<string> {
  // Match <img ... src="https://..." ...> tags
  const imgRegex = /<img\s[^>]*\bsrc\s*=\s*"(https?:\/\/[^"]+)"[^>]*>/gi
  const matches: { fullMatch: string; url: string }[] = []
  let m: RegExpExecArray | null
  while ((m = imgRegex.exec(html)) !== null) {
    matches.push({ fullMatch: m[0], url: m[1] })
  }

  if (matches.length === 0) return html

  let result = html
  for (const { fullMatch, url } of matches) {
    const fetchUrl = siteUrl ? normalizeImageUrl(url, siteUrl) : url
    const buffer = await downloadBuffer(fetchUrl)
    if (!buffer) continue // leave original URL on failure

    const urlPath = new URL(url).pathname
    const filename = basename(urlPath) || 'image.jpg'
    const media = saveMediaFromWp(siteId, postLocalId, filename, buffer, url)
    const mediaUrl = `media://file${encodeURI(media.local_path)}`

    // Build replacement tag: swap src and add data-media-id
    let newTag = fullMatch.replace(`src="${url}"`, `src="${mediaUrl}"`)
    if (!newTag.includes('data-media-id')) {
      newTag = newTag.replace('<img ', `<img data-media-id="${media.id}" `)
    }

    result = result.split(fullMatch).join(newTag)
  }

  return result
}

export async function rewriteAcfImageUrls(
  siteId: string,
  postLocalId: string,
  acfJson: string | null,
  siteUrl?: string
): Promise<string | null> {
  if (!acfJson) return null

  // Find all external image URLs in the ACF JSON string
  const urlRegex = /https?:\/\/[^"\\]+\.(?:jpe?g|png|gif|webp|svg|avif)(?:\?[^"\\]*)?/gi
  const urls = [...new Set(acfJson.match(urlRegex) || [])]

  if (urls.length === 0) return acfJson

  let result = acfJson
  for (const url of urls) {
    const fetchUrl = siteUrl ? normalizeImageUrl(url, siteUrl) : url
    const buffer = await downloadBuffer(fetchUrl)
    if (!buffer) continue

    const urlPath = new URL(url).pathname
    const filename = basename(urlPath) || 'image.jpg'
    const media = saveMediaFromWp(siteId, postLocalId, filename, buffer, url)
    const mediaUrl = `media://file${encodeURI(media.local_path)}`

    result = result.split(url).join(mediaUrl)
  }

  return result
}

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

  const result: PullResult = { total: posts.length, created: 0, updated: 0, unchanged: 0, removed: 0, errors: [] }

  for (const wpPost of posts) {
    try {
      const authorName = authorNames.get(wpPost.author) ?? null
      const outcome = await upsertPost(siteId, wpPost, authorName, site.url)
      result[outcome]++
    } catch (err) {
      result.errors.push(`Post ${wpPost.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Only update pull timestamp when all posts processed without errors,
  // so a partial failure triggers a full re-pull next time
  if (result.errors.length === 0) {
    const db = getDb()
    db.prepare('UPDATE sites SET last_post_pull_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      siteId
    )

    // Ghost detection: posts deleted (or trashed) on WordPress otherwise linger
    // locally forever, since the pull above only adds and updates. Absence from
    // the ID sweep is only a trigger — theme/plugin REST filtering can hide
    // live posts from list queries — so each candidate is verified with a
    // direct GET and removed only on a confirmed answer. Fully-synced copies
    // only: local edits always survive.
    result.removed = await removeGhostPosts(siteId, site.url, site.username, password, statuses)
  }

  return result
}

async function removeGhostPosts(
  siteId: string,
  siteUrl: string,
  username: string,
  password: string,
  statuses: string[]
): Promise<number> {
  const db = getDb()
  let remoteIds: Set<number> | null = null
  try {
    remoteIds = await fetchAllPostIds(siteUrl, username, password, statuses)
  } catch {
    return 0
  }
  if (!remoteIds) return 0 // partial sweep — can't trust absence

  const candidates = (
    db
      .prepare(
        'SELECT id, wp_id FROM posts WHERE site_id = ? AND wp_id IS NOT NULL AND synced = 1 AND conflict = 0 AND pending_delete = 0'
      )
      .all(siteId) as { id: string; wp_id: number }[]
  ).filter((row) => !remoteIds.has(row.wp_id))

  let removed = 0
  for (const row of candidates) {
    const existence = await fetchRemotePostExistence(siteUrl, username, password, row.wp_id)
    if (existence === 'gone') {
      deletePost(row.id)
      removed++
    }
  }
  return removed
}

async function upsertPost(
  siteId: string,
  wpPost: WpPostRaw,
  authorName: string | null,
  siteUrl: string
): Promise<'created' | 'updated' | 'unchanged'> {
  const db = getDb()

  const existing = db
    .prepare('SELECT id, modified_remote, synced, pending_delete FROM posts WHERE site_id = ? AND wp_id = ?')
    .get(siteId, wpPost.id) as { id: string; modified_remote: string | null; synced: number; pending_delete: number } | undefined

  // Local delete intent takes precedence — don't recreate the post from a pull
  if (existing?.pending_delete) return 'unchanged'

  const title = decodeHtmlEntities(wpPost.title.rendered)
  let content = sanitizeHtml(wpPost.content.rendered)
  const excerpt = wpPost.excerpt ? decodeHtmlEntities(wpPost.excerpt.rendered).replace(/<[^>]+>/g, '').trim() : ''
  const slug = wpPost.slug ?? ''
  const status = wpPost.status
  const modifiedRemote = wpPost.modified
  const wpDate = wpPost.date || null
  const authorId = wpPost.author || null
  const normalizedAcf = normalizeAcf(wpPost.acf)
  let acfJson = normalizedAcf ? JSON.stringify(normalizedAcf) : null
  const categoriesJson = wpPost.categories ? JSON.stringify(wpPost.categories) : '[]'
  const tagsJson = wpPost.tags ? JSON.stringify(wpPost.tags) : '[]'
  const now = new Date().toISOString()

  if (!existing) {
    // INSERT a minimal post row first so media FK references are satisfied
    const postLocalId = uuidv4()
    db.prepare(`
      INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, excerpt, slug, date, author_id, author_name, featured_image, categories, tags, modified_local, modified_remote, synced, conflict)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, 0)
    `).run(postLocalId, siteId, wpPost.id, title, '', status, null, excerpt, slug, wpDate, authorId, authorName, categoriesJson, tagsJson, now, modifiedRemote)

    // Now download images (media inserts can reference the post row)
    content = await downloadAndRewriteImages(siteId, postLocalId, content, siteUrl)
    acfJson = await rewriteAcfImageUrls(siteId, postLocalId, acfJson, siteUrl)

    // Download featured image if present
    let featuredImage: string | null = null
    if (wpPost.featured_media > 0) {
      featuredImage = await downloadFeaturedImage(siteId, postLocalId, wpPost.featured_media, siteUrl)
    }

    // Update with full content now that images are downloaded
    db.prepare(`
      UPDATE posts SET content = ?, acf = ?, featured_image = ?
      WHERE id = ?
    `).run(content, acfJson, featuredImage, postLocalId)
    indexPost(postLocalId, siteId, title, content, excerpt)
    return 'created'
  }

  // Same modified timestamp → unchanged, but fix stale encoded titles and backfill date/author
  if (existing.modified_remote === modifiedRemote) {
    // Check if stored content still has un-downloaded images (previous download failure)
    const stored = db.prepare('SELECT content, acf FROM posts WHERE id = ?').get(existing.id) as
      { content: string; acf: string | null } | undefined
    const hasHttp = stored ? /src="https?:\/\//.test(stored.content) : false
    const hasMedia = stored ? /src="media:\/\//.test(stored.content) : false

    // Check for broken media:// URLs (files deleted from disk)
    let hasBrokenMedia = false
    if (stored && hasMedia) {
      const mediaPathRegex = /src="media:\/\/file([^"?]+)/g
      let mp: RegExpExecArray | null
      while ((mp = mediaPathRegex.exec(stored.content)) !== null) {
        const filePath = decodeURIComponent(mp[1])
        if (!existsSync(filePath)) {
          hasBrokenMedia = true
          break
        }
      }
    }

    // If images have broken media:// URLs, re-download from remote content
    if (stored && hasBrokenMedia) {
      let freshContent = sanitizeHtml(wpPost.content.rendered)
      freshContent = await downloadAndRewriteImages(siteId, existing.id, freshContent, siteUrl)
      const freshAcf = await rewriteAcfImageUrls(siteId, existing.id, acfJson, siteUrl)
      db.prepare(
        'UPDATE posts SET content = ?, acf = ?, title = ?, excerpt = COALESCE(NULLIF(excerpt, \'\'), ?), slug = COALESCE(NULLIF(slug, \'\'), ?), date = COALESCE(date, ?), author_id = COALESCE(author_id, ?), author_name = COALESCE(author_name, ?) WHERE id = ?'
      ).run(freshContent, freshAcf, title, excerpt, slug, wpDate, authorId, authorName, existing.id)
      return 'updated'
    }

    if (stored && hasHttp) {
      const fixedContent = await downloadAndRewriteImages(siteId, existing.id, stored.content, siteUrl)
      const fixedAcf = await rewriteAcfImageUrls(siteId, existing.id, stored.acf, siteUrl)
      if (fixedContent !== stored.content || fixedAcf !== stored.acf) {
        db.prepare(
          'UPDATE posts SET content = ?, acf = ?, title = ?, excerpt = COALESCE(NULLIF(excerpt, \'\'), ?), slug = COALESCE(NULLIF(slug, \'\'), ?), date = COALESCE(date, ?), author_id = COALESCE(author_id, ?), author_name = COALESCE(author_name, ?) WHERE id = ?'
        ).run(fixedContent, fixedAcf, title, excerpt, slug, wpDate, authorId, authorName, existing.id)
        return 'updated'
      }
    }

    db.prepare(
      'UPDATE posts SET title = ?, excerpt = COALESCE(NULLIF(excerpt, \'\'), ?), slug = COALESCE(NULLIF(slug, \'\'), ?), date = COALESCE(date, ?), author_id = COALESCE(author_id, ?), author_name = COALESCE(author_name, ?) WHERE id = ? AND (title != ? OR date IS NULL OR author_id IS NULL OR excerpt = \'\' OR slug = \'\')'
    ).run(title, excerpt, slug, wpDate, authorId, authorName, existing.id, title)
    return 'unchanged'
  }

  // Different modified_remote
  if (existing.synced === 1) {
    // No local edits → safe to update — download images
    content = await downloadAndRewriteImages(siteId, existing.id, content, siteUrl)
    acfJson = await rewriteAcfImageUrls(siteId, existing.id, acfJson, siteUrl)

    // Download featured image
    let featuredImage: string | null = null
    if (wpPost.featured_media > 0) {
      featuredImage = await downloadFeaturedImage(siteId, existing.id, wpPost.featured_media, siteUrl)
    }

    db.prepare(`
      UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, excerpt = ?, slug = ?, date = ?, author_id = ?, author_name = ?, featured_image = ?, categories = ?, tags = ?, modified_local = ?, modified_remote = ?, synced = 1, conflict = 0
      WHERE id = ?
    `).run(title, content, status, acfJson, excerpt, slug, wpDate, authorId, authorName, featuredImage, categoriesJson, tagsJson, now, modifiedRemote, existing.id)
    indexPost(existing.id, siteId, title, content, excerpt)
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
  const rows = db.prepare('SELECT * FROM posts WHERE site_id = ? AND pending_delete = 0 ORDER BY modified_local DESC').all(siteId) as PostRow[]
  return rows.map(normalizePostRow)
}

export function getPostById(id: string): Post | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined
  return row ? normalizePostRow(row) : null
}

export function createPost(input: PostInput): Post {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  const acfJson = input.acf ? JSON.stringify(input.acf) : null

  db.prepare(`
    INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, excerpt, slug, modified_local, modified_remote, synced, conflict)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0)
  `).run(id, input.site_id, input.title ?? '', input.content ?? '', input.status ?? 'draft', acfJson, input.excerpt ?? '', input.slug ?? '', now)

  indexPost(id, input.site_id, input.title ?? '', input.content ?? '', input.excerpt ?? '')
  return getPostById(id)!
}

function computeWordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return 0
  return text.split(' ').length
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
  const featuredImage = update.featured_image !== undefined ? update.featured_image : existing.featured_image
  const excerpt = update.excerpt !== undefined ? update.excerpt : existing.excerpt
  const slug = update.slug !== undefined ? update.slug : existing.slug
  const categories = update.categories !== undefined ? update.categories : existing.categories
  const tags = update.tags !== undefined ? update.tags : existing.tags
  const categoriesJson = JSON.stringify(categories)
  const tagsJson = JSON.stringify(tags)
  const wordCount = computeWordCount(content)
  const today = now.slice(0, 10) // YYYY-MM-DD

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, date = ?, featured_image = ?, excerpt = ?, slug = ?, categories = ?, tags = ?, word_count = ?, modified_local = ?, synced = 0
    WHERE id = ?
  `).run(title, content, status, acfJson, date, featuredImage, excerpt, slug, categoriesJson, tagsJson, wordCount, now, update.id)

  // Upsert daily writing snapshot
  db.prepare(`
    INSERT INTO writing_snapshots (site_id, post_id, date, word_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(site_id, post_id, date) DO UPDATE SET word_count = excluded.word_count
  `).run(existing.site_id, update.id, today, wordCount)

  indexPost(update.id, existing.site_id, title, content, excerpt)
  captureRevision(update.id, title, content, excerpt, wordCount)

  return getPostById(update.id)!
}

export function deletePost(id: string): void {
  const db = getDb()
  removePostFromIndex(id)
  db.prepare('DELETE FROM posts WHERE id = ?').run(id)
}

export function bulkUpdateStatus(postIds: string[], status: string): number {
  const db = getDb()
  const now = new Date().toISOString()
  const update = db.prepare('UPDATE posts SET status = ?, modified_local = ?, synced = 0 WHERE id = ?')
  const tx = db.transaction(() => {
    let count = 0
    for (const id of postIds) {
      const result = update.run(status, now, id)
      count += result.changes
    }
    return count
  })
  return tx()
}

export function softDeletePost(id: string): void {
  const db = getDb()
  const row = db.prepare('SELECT wp_id FROM posts WHERE id = ?').get(id) as { wp_id: number | null } | undefined
  if (!row) return

  removePostFromIndex(id)

  if (row.wp_id == null) {
    // No WordPress counterpart — hard-delete immediately
    db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  } else {
    // Mark for deletion on next sync
    db.prepare('UPDATE posts SET pending_delete = 1, synced = 0 WHERE id = ?').run(id)
  }
}

export function bulkSoftDeletePosts(postIds: string[]): void {
  const db = getDb()
  const select = db.prepare('SELECT id, wp_id FROM posts WHERE id = ?')
  const hardDel = db.prepare('DELETE FROM posts WHERE id = ?')
  const softDel = db.prepare('UPDATE posts SET pending_delete = 1, synced = 0 WHERE id = ?')

  const tx = db.transaction(() => {
    for (const id of postIds) {
      const row = select.get(id) as { id: string; wp_id: number | null } | undefined
      if (!row) continue
      removePostFromIndex(id)
      if (row.wp_id == null) {
        hardDel.run(id)
      } else {
        softDel.run(id)
      }
    }
  })
  tx()
}

/** Raw shape from SQLite — booleans are integers, JSON columns are strings */
interface PostRow {
  id: string
  site_id: string
  wp_id: number | null
  title: string
  content: string
  status: string
  acf: string | Record<string, unknown> | null
  date: string | null
  author_id: number | null
  author_name: string | null
  featured_image: string | null
  excerpt: string | null
  slug: string | null
  categories: string | number[] | null
  tags: string | number[] | null
  word_count: number | null
  scratchpad_id: string | null
  pending_delete: number
  modified_local: string
  modified_remote: string | null
  synced: number
  conflict: number
}

function normalizePostRow(row: PostRow): Post {
  return {
    id: row.id,
    site_id: row.site_id,
    wp_id: row.wp_id,
    title: row.title,
    content: row.content,
    status: row.status as Post['status'],
    acf: typeof row.acf === 'string' ? JSON.parse(row.acf) : row.acf ?? null,
    date: row.date ?? null,
    author_id: row.author_id ?? null,
    author_name: row.author_name ?? null,
    featured_image: row.featured_image ?? null,
    excerpt: row.excerpt ?? '',
    slug: row.slug ?? '',
    categories: typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories ?? [],
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags ?? [],
    word_count: row.word_count ?? 0,
    scratchpad_id: row.scratchpad_id ?? null,
    pending_delete: Boolean(row.pending_delete),
    modified_local: row.modified_local,
    modified_remote: row.modified_remote,
    synced: Boolean(row.synced),
    conflict: Boolean(row.conflict)
  }
}
