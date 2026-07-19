import { v4 as uuidv4 } from 'uuid'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { getDb } from './database'
import { getSiteById, updateSiteIconUrl } from './site-service'
import { getCredential } from './credentials'
import { getPostById, deletePost, pullPostsForSite, downloadAndRewriteImages, rewriteAcfImageUrls, downloadFeaturedImage } from './post-service'
import { indexPost } from './search-service'
import { getMediaForPost, uploadMediaToWp, deleteMedia } from './media-service'
import { pushPost, deleteRemotePost, fetchSinglePost, fetchUserNames, fetchSiteIcon, fetchScratchpads, fetchSingleScratchpad, pushScratchpad as pushScratchpadToWp, updatePostScratchpadMeta, deleteRemoteScratchpad, fetchRemoteScratchpadExistence, fetchRemotePostMeta, fetchPluginVersion, createTerm } from './wp-client'
import { getPendingTermsForSite } from './taxonomy-service'
import { isPluginVersionMismatch, pluginMismatchMessage } from '@shared/version-utils'
import { decodeHtmlEntities } from './html-utils'
import { sanitizeHtml } from './sanitize'
import { normalizeAcf } from './acf-utils'
import { pullAcfSchemaForSite } from './acf-service'
import { pullMediaLibraryForSite, pushMediaLibraryPending } from './media-library-service'
import { pullTaxonomyTerms } from './taxonomy-service'
import { getScratchpadsForSite, getScratchpadById, getPendingDeleteScratchpads, hardDeleteScratchpad } from './scratchpad-service'
import { refreshSiteCss, getSiteCssAgeMs } from './site-css-service'
import type { PendingChanges, PushResult, SyncResult } from '@shared/types'

/** Re-fetch cached preview CSS at most once per day. */
const SITE_CSS_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Rewrite a JSON array of term ids, replacing any negative (pending) id with its
 * resolved real WP id, de-duplicating in the process. Returns the new JSON and
 * whether anything changed.
 */
export function rewriteTermIds(json: string | null, idMap: Map<number, number>): { json: string; changed: boolean } {
  let ids: number[]
  try {
    ids = json ? (JSON.parse(json) as number[]) : []
  } catch {
    ids = []
  }
  let changed = false
  const out: number[] = []
  for (const id of ids) {
    const mapped = idMap.has(id) ? idMap.get(id)! : id
    if (mapped !== id) changed = true
    if (!out.includes(mapped)) out.push(mapped)
    else if (mapped !== id) changed = true // collapsed a duplicate
  }
  return { json: JSON.stringify(out), changed }
}

/**
 * Create any offline-created (pending) terms for a site on WordPress, then swap
 * their temporary negative ids for the real WP ids across taxonomy_terms and
 * every post's categories/tags. Runs before the push loop so pushed payloads
 * contain real ids. Terms that fail to create are left pending and reported as
 * errors; posts still referencing negative ids are skipped by the caller.
 */
async function resolvePendingTerms(siteId: string): Promise<{ errors: string[] }> {
  const pending = getPendingTermsForSite(siteId)
  if (pending.length === 0) return { errors: [] }

  const site = getSiteById(siteId)
  if (!site) return { errors: [] }

  const password = getCredential(site.keychain_ref)
  if (!password) {
    return { errors: [`No credential to create ${pending.length} pending term(s) for ${site.label}`] }
  }

  const errors: string[] = []
  const resolved: { negId: number; realId: number; taxonomy: 'category' | 'post_tag' }[] = []

  for (const pt of pending) {
    const endpoint = pt.taxonomy === 'category' ? 'categories' : 'tags'
    try {
      const { id } = await createTerm(site.url, site.username, password, endpoint, pt.name)
      resolved.push({ negId: pt.id, realId: id, taxonomy: pt.taxonomy })
    } catch (err) {
      errors.push(`Create term "${pt.name}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (resolved.length === 0) return { errors }

  const db = getDb()
  const apply = db.transaction(() => {
    const catMap = new Map<number, number>()
    const tagMap = new Map<number, number>()

    for (const r of resolved) {
      // Update taxonomy_terms: reuse the real id row if it already exists
      // (e.g. pulled in a prior sync), otherwise re-key the negative row.
      const realExists = db
        .prepare('SELECT 1 FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? AND id = ?')
        .get(siteId, r.taxonomy, r.realId)
      if (realExists) {
        db.prepare('DELETE FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? AND id = ?')
          .run(siteId, r.taxonomy, r.negId)
      } else {
        db.prepare('UPDATE taxonomy_terms SET id = ? WHERE site_id = ? AND taxonomy = ? AND id = ?')
          .run(r.realId, siteId, r.taxonomy, r.negId)
      }
      db.prepare('DELETE FROM pending_terms WHERE id = ?').run(r.negId)
      ;(r.taxonomy === 'category' ? catMap : tagMap).set(r.negId, r.realId)
    }

    // Rewrite every post's categories/tags arrays for this site
    const posts = db
      .prepare('SELECT id, categories, tags FROM posts WHERE site_id = ?')
      .all(siteId) as { id: string; categories: string | null; tags: string | null }[]
    for (const p of posts) {
      const cats = rewriteTermIds(p.categories, catMap)
      const tgs = rewriteTermIds(p.tags, tagMap)
      if (cats.changed || tgs.changed) {
        db.prepare('UPDATE posts SET categories = ?, tags = ? WHERE id = ?')
          .run(cats.json, tgs.json, p.id)
      }
    }
  })
  apply()

  return { errors }
}

/** True if any of the post's category/tag ids are still negative (pending, unresolved). */
function postHasNegativeTerms(post: { categories: number[]; tags: number[] }): boolean {
  return post.categories.some((id) => id < 0) || post.tags.some((id) => id < 0)
}

/**
 * A push refused because the remote copy changed since the last pull. Not a
 * failure: the post is flagged conflict=1 and surfaced through the normal
 * conflict flow rather than the sync error list.
 */
export class PushConflictError extends Error {}

export async function pushPostToWp(
  postId: string,
  options?: { skipTermResolution?: boolean; skipConflictCheck?: boolean }
): Promise<PushResult> {
  const db = getDb()

  const pre = getPostById(postId)
  if (!pre) throw new Error(`Post not found: ${postId}`)

  // Resolve this site's pending terms first so the push payload carries real WP
  // ids (skipped when the caller — the sync loop — already resolved them).
  if (!options?.skipTermResolution) {
    await resolvePendingTerms(pre.site_id)
  }

  const post = getPostById(postId)
  if (!post) throw new Error(`Post not found: ${postId}`)
  if (!post.title.trim() && !post.content.trim()) {
    throw new Error('Cannot push a blank post — add a title or content first')
  }

  // If a pending term couldn't be created (e.g. offline / permissions), don't
  // send temporary negative ids to WordPress — they'd be silently dropped.
  if (postHasNegativeTerms(post)) {
    throw new Error('Post references a tag or category not yet created on WordPress — sync again when online')
  }

  const site = getSiteById(post.site_id)
  if (!site) throw new Error(`Site not found: ${post.site_id}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  // Pre-push safety check against the live remote copy. Pull-time conflict
  // detection alone can't catch a remote edit made after the last pull, or a
  // post outside the pull-published window — pushing blind would overwrite it.
  let recreated = false
  if (post.wp_id != null) {
    const remote = await fetchRemotePostMeta(site.url, site.username, password, post.wp_id)
    if (remote.state === 'gone') {
      // Deleted (or trashed) on WordPress while edited locally: the WP
      // identity is dead but the content lives here — push as a new post.
      db.prepare('UPDATE posts SET wp_id = NULL, modified_remote = NULL WHERE id = ?').run(post.id)
      post.wp_id = null
      post.modified_remote = null
      recreated = true
    } else if (
      !options?.skipConflictCheck &&
      remote.state === 'exists' &&
      post.modified_remote != null &&
      remote.modified !== post.modified_remote
    ) {
      db.prepare('UPDATE posts SET conflict = 1, modified_remote = ? WHERE id = ?').run(remote.modified, post.id)
      throw new PushConflictError(
        `"${post.title || 'Untitled'}" changed on WordPress since the last sync — resolve the conflict before pushing`
      )
    }
    // 'unknown' (network blip, auth hiccup) → push as before; the check is an
    // extra guard, not a gate that can wedge syncing.
  }

  // Upload only unsynced media the post actually references. A media row is
  // referenced when its media:// URL appears in the content or ACF JSON, its id
  // is the featured image, or its id appears as an ACF media-UUID reference
  // (the same UUID→wp_id form resolveMediaRefs swaps below). Never-synced rows
  // that nothing references are images the user inserted then removed before the
  // first sync — uploading them would clutter the WP media library (and leak a
  // discarded image). The renderer's post-editor cleanup already deletes such
  // orphans, but only while that post's editor is open and 30s after the last
  // edit — closing the editor sooner, or removing an ACF image (which that
  // cleanup ignores), can strand a row here. So drop it with the same primitive.
  const refContent = post.content
  const refFeatured = post.featured_image
  const acfJsonForRefs = post.acf ? JSON.stringify(post.acf) : ''
  function isMediaReferenced(media: { id: string; local_path: string }): boolean {
    if (media.id === refFeatured) return true
    const mediaUrl = `media://file${encodeURI(media.local_path)}`
    if (refContent.includes(mediaUrl)) return true
    // ACF may reference an image by its media:// URL or by its media-UUID id.
    if (acfJsonForRefs.includes(mediaUrl) || acfJsonForRefs.includes(`"${media.id}"`)) return true
    return false
  }

  const mediaItems = getMediaForPost(postId)
  for (const media of mediaItems) {
    if (media.synced) continue
    if (isMediaReferenced(media)) {
      await uploadMediaToWp(media.id)
    } else {
      deleteMedia(media.id)
    }
  }

  // Re-fetch media to get updated wp_url values
  const updatedMedia = getMediaForPost(postId)

  // Build URL swap map: media://file{encodedLocalPath} → wp_url
  const urlMap = new Map<string, string>()
  for (const media of updatedMedia) {
    if (media.wp_url) {
      const mediaUrl = `media://file${encodeURI(media.local_path)}`
      urlMap.set(mediaUrl, media.wp_url)
    }
  }

  // Swap media:// URLs in content
  let swappedContent = post.content
  for (const [localUrl, wpUrl] of urlMap) {
    swappedContent = swappedContent.split(localUrl).join(wpUrl)
  }

  // Swap media:// URLs in ACF JSON
  let swappedAcf = post.acf
  if (swappedAcf && urlMap.size > 0) {
    let acfStr = JSON.stringify(swappedAcf)
    for (const [localUrl, wpUrl] of urlMap) {
      acfStr = acfStr.split(localUrl).join(wpUrl)
    }
    swappedAcf = JSON.parse(acfStr)
  }

  // Resolve media UUID strings → wp_id integers in ACF data
  const mediaIdToWpId = new Map<string, number>()
  for (const media of updatedMedia) {
    if (media.wp_id) mediaIdToWpId.set(media.id, media.wp_id)
  }

  function resolveMediaRefs(val: unknown): unknown {
    if (typeof val === 'string' && mediaIdToWpId.has(val)) return mediaIdToWpId.get(val)!
    if (Array.isArray(val)) return val.map(resolveMediaRefs)
    if (val && typeof val === 'object') {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, resolveMediaRefs(v)])
      )
    }
    return val
  }

  if (swappedAcf && mediaIdToWpId.size > 0) {
    swappedAcf = resolveMediaRefs(swappedAcf) as Record<string, unknown>
  }

  // Resolve featured image to WP attachment ID
  let featuredMedia: number | undefined
  if (post.featured_image) {
    // Check the mediaIdToWpId map first (just uploaded), then look up directly from DB
    const wpId = mediaIdToWpId.get(post.featured_image)
    if (wpId) {
      featuredMedia = wpId
    } else {
      const mediaRow = db.prepare('SELECT wp_id FROM media WHERE id = ?').get(post.featured_image) as { wp_id: number | null } | undefined
      if (mediaRow?.wp_id) {
        featuredMedia = mediaRow.wp_id
      }
    }
  } else {
    // Explicitly clear featured image
    featuredMedia = 0
  }

  // Push to WordPress
  const result = await pushPost(site.url, site.username, password, post.wp_id, {
    title: post.title,
    content: swappedContent,
    status: post.status,
    date: post.date,
    acf: swappedAcf,
    featured_media: featuredMedia,
    excerpt: post.excerpt || undefined,
    slug: post.slug || undefined,
    categories: post.categories.length > 0 ? post.categories : undefined,
    tags: post.tags.length > 0 ? post.tags : undefined
  })

  // Rewrite any external (https://) image URLs in the response back to media://
  // so the local DB stays offline-displayable. Covers the case where WP applied
  // server-side filters that mutated content (shortcode normalization,
  // wp_kses, Gutenberg block comments, etc.) — we keep the post-filter version
  // but with images pointing at the local cache. Image dedupe keeps re-downloads cheap.
  const storedContent = await downloadAndRewriteImages(post.site_id, postId, result.content, site.url)
  // Prefer the server-echoed ACF (post-filter), fall back to what we sent if the
  // response omitted it (older companion plugin / non-ACF site / partial echo).
  const acfForStorage = normalizeAcf(result.acf ?? swappedAcf)
  const responseAcfJson: string | null = acfForStorage ? JSON.stringify(acfForStorage) : null
  const storedAcfJson = await rewriteAcfImageUrls(post.site_id, postId, responseAcfJson, site.url)

  // Update local DB
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE posts SET wp_id = ?, content = ?, acf = ?, modified_remote = ?, modified_local = ?, synced = 1, conflict = 0
    WHERE id = ?
  `).run(result.id, storedContent, storedAcfJson, result.modified, now, postId)

  return { wp_id: result.id, modified_remote: result.modified, recreated }
}

export async function pushPendingDeletions(siteId: string): Promise<{ deleted: number; errors: string[] }> {
  const db = getDb()

  // Stranded local-only deletions (no WP counterpart) have nothing to push —
  // hard-delete them now, or they'd sit invisible in every list forever while
  // still counting toward the pending-changes badge.
  const orphans = db
    .prepare('SELECT id FROM posts WHERE site_id = ? AND pending_delete = 1 AND wp_id IS NULL')
    .all(siteId) as { id: string }[]
  for (const orphan of orphans) {
    deletePost(orphan.id)
  }

  const rows = db
    .prepare('SELECT id, wp_id FROM posts WHERE site_id = ? AND pending_delete = 1 AND wp_id IS NOT NULL')
    .all(siteId) as { id: string; wp_id: number }[]

  const site = getSiteById(siteId)
  if (!site || rows.length === 0) return { deleted: 0, errors: [] }

  const password = getCredential(site.keychain_ref)
  if (!password) return { deleted: 0, errors: [] }

  let deleted = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      await deleteRemotePost(site.url, site.username, password, row.wp_id)
      deletePost(row.id) // hard-delete locally after successful remote delete
      deleted++
    } catch (err) {
      errors.push(`Delete wp_id=${row.wp_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { deleted, errors }
}

export async function resolveConflict(
  postId: string,
  strategy: 'keep-mine' | 'keep-theirs' | 'fork'
): Promise<void> {
  const db = getDb()

  if (strategy === 'keep-mine') {
    await pushPostToWp(postId, { skipConflictCheck: true })
    return
  }

  const post = getPostById(postId)
  if (!post) throw new Error(`Post not found: ${postId}`)
  if (!post.wp_id) throw new Error(`Post has no WP ID — cannot pull remote version`)

  const site = getSiteById(post.site_id)
  if (!site) throw new Error(`Site not found: ${post.site_id}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  if (strategy === 'fork') {
    // Create a copy of the current local post as a new draft
    const forkAcf = normalizeAcf(post.acf)
    const forkAcfJson = forkAcf ? JSON.stringify(forkAcf) : null
    const forkCategoriesJson = JSON.stringify(post.categories)
    const forkTagsJson = JSON.stringify(post.tags)
    db.prepare(`
      INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, excerpt, slug, date, author_id, author_name, featured_image, categories, tags, modified_local, modified_remote, synced, conflict)
      VALUES (?, ?, NULL, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0)
    `).run(
      uuidv4(),
      post.site_id,
      post.title + ' (copy)',
      post.content,
      forkAcfJson,
      post.excerpt,
      post.slug,
      post.date,
      post.author_id,
      post.author_name,
      post.featured_image,
      forkCategoriesJson,
      forkTagsJson,
      new Date().toISOString()
    )
  }

  // keep-theirs (or the second half of fork): overwrite local with remote
  const wpPost = await fetchSinglePost(site.url, site.username, password, post.wp_id)
  const authorNames = await fetchUserNames(site.url, site.username, password, [wpPost.author])
  const authorName = authorNames.get(wpPost.author) ?? post.author_name
  const now = new Date().toISOString()
  const title = decodeHtmlEntities(wpPost.title.rendered)
  let content = sanitizeHtml(wpPost.content.rendered)
  const theirAcf = normalizeAcf(wpPost.acf)
  let acfJson = theirAcf ? JSON.stringify(theirAcf) : null

  // Download external images and rewrite to media:// protocol
  content = await downloadAndRewriteImages(post.site_id, postId, content, site.url)
  acfJson = await rewriteAcfImageUrls(post.site_id, postId, acfJson, site.url)

  // Download featured image from remote
  let featuredImage: string | null = null
  if (wpPost.featured_media > 0) {
    featuredImage = await downloadFeaturedImage(post.site_id, postId, wpPost.featured_media, site.url)
  }

  const excerpt = wpPost.excerpt ? decodeHtmlEntities(wpPost.excerpt.rendered) : ''
  const remoteSlug = wpPost.slug ?? ''
  const categoriesJson = JSON.stringify(wpPost.categories ?? [])
  const tagsJson = JSON.stringify(wpPost.tags ?? [])

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, excerpt = ?, slug = ?, date = ?, author_id = ?, author_name = ?, featured_image = ?, categories = ?, tags = ?, modified_local = ?, modified_remote = ?, synced = 1, conflict = 0
    WHERE id = ?
  `).run(
    title,
    content,
    wpPost.status,
    acfJson,
    excerpt,
    remoteSlug,
    wpPost.date,
    wpPost.author,
    authorName,
    featuredImage,
    categoriesJson,
    tagsJson,
    now,
    wpPost.modified,
    postId
  )
  indexPost(postId, post.site_id, title, content, excerpt)
}

/**
 * Two-option resolution for a conflicted scratchpad (no fork — this is a notes
 * feature, not the post editor). Mirrors resolveConflict's shape.
 *
 * keep-mine works fully offline: it just clears the flag and marks the row
 * unsynced, so the next sync pushes local content over remote. keep-theirs
 * needs the network to fetch the remote copy and overwrites local with it.
 */
export async function resolveScratchpadConflict(
  scratchpadId: string,
  strategy: 'keep-mine' | 'keep-theirs'
): Promise<void> {
  const db = getDb()

  if (strategy === 'keep-mine') {
    db.prepare('UPDATE scratchpads SET conflict = 0, synced = 0 WHERE id = ?').run(scratchpadId)
    return
  }

  // keep-theirs — fetch and overwrite local with the remote version
  const sp = getScratchpadById(scratchpadId)
  if (!sp) throw new Error(`Scratchpad not found: ${scratchpadId}`)
  if (!sp.wp_id) throw new Error('Scratchpad has no WP ID — cannot pull remote version')

  const site = getSiteById(sp.site_id)
  if (!site) throw new Error(`Site not found: ${sp.site_id}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const wp = await fetchSingleScratchpad(site.url, site.username, password, sp.wp_id)
  const title = decodeHtmlEntities(wp.title.rendered)
  const content = stripBasicHtml(wp.content.rendered)
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE scratchpads SET title = ?, content = ?, modified_local = ?, modified_remote = ?, synced = 1, conflict = 0
    WHERE id = ?
  `).run(title, content, now, wp.modified, scratchpadId)
}

export async function pushScratchpadsForSite(siteId: string): Promise<{ errors: string[] }> {
  const db = getDb()
  const errors: string[] = []
  const site = getSiteById(siteId)
  if (!site) return { errors }

  const password = getCredential(site.keychain_ref)
  if (!password) return { errors }

  // Push scratchpad deletions first (delete on WP, then locally)
  for (const pd of getPendingDeleteScratchpads(siteId)) {
    try {
      if (pd.wp_id != null) {
        await deleteRemoteScratchpad(site.url, site.username, password, pd.wp_id)
      }
      hardDeleteScratchpad(pd.id)
    } catch (err) {
      errors.push(`Delete scratchpad: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Conflicted scratchpads are excluded — pushing would silently overwrite the
  // remote edit. They stay flagged until resolved (mirrors the post push loop).
  const unsynced = db
    .prepare('SELECT id FROM scratchpads WHERE site_id = ? AND synced = 0 AND conflict = 0 AND pending_delete = 0')
    .all(siteId) as { id: string }[]

  for (const row of unsynced) {
    const sp = getScratchpadById(row.id)
    if (!sp) continue

    try {
      const result = await pushScratchpadToWp(site.url, site.username, password, sp.wp_id, {
        title: sp.title,
        content: sp.content
      })

      db.prepare(`
        UPDATE scratchpads SET wp_id = ?, modified_remote = ?, synced = 1
        WHERE id = ?
      `).run(result.id, result.modified, sp.id)

      // Sync _scratchpad_id meta on linked posts (best-effort)
      const linkedPosts = db
        .prepare('SELECT wp_id FROM posts WHERE scratchpad_id = ? AND wp_id IS NOT NULL')
        .all(sp.id) as { wp_id: number }[]

      for (const lp of linkedPosts) {
        try {
          await updatePostScratchpadMeta(site.url, site.username, password, lp.wp_id, result.id)
        } catch (err) {
          // Metadata drift only — not worth failing the sync over
          console.warn('[sync] Failed to update scratchpad meta on post:', err instanceof Error ? err.message : err)
        }
      }
    } catch (err) {
      errors.push(
        `Scratchpad "${sp.title || 'Untitled'}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return { errors }
}

/**
 * Strip basic HTML tags to recover plain text/markdown from WP content.
 * WP wraps content in <p> tags; this reverses that for scratchpad markdown.
 */
function stripBasicHtml(html: string): string {
  return html
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
}

export async function pullScratchpadsForSite(siteId: string): Promise<void> {
  const db = getDb()
  const site = getSiteById(siteId)
  if (!site) return

  const password = getCredential(site.keychain_ref)
  if (!password) return

  let remote
  try {
    remote = await fetchScratchpads(site.url, site.username, password)
  } catch {
    return // Transient fetch failure — skip this round
  }
  if (remote === null) return // Old plugin without the scratchpad endpoint

  for (const wp of remote) {
    const title = decodeHtmlEntities(wp.title.rendered)
    const content = stripBasicHtml(wp.content.rendered)
    const modifiedRemote = wp.modified

    const existing = db
      .prepare('SELECT id, modified_remote, synced, pending_delete FROM scratchpads WHERE site_id = ? AND wp_id = ?')
      .get(siteId, wp.id) as { id: string; modified_remote: string | null; synced: number; pending_delete: number } | undefined

    // Deleted locally, awaiting remote delete — don't resurrect or overwrite
    if (existing?.pending_delete) continue

    if (!existing) {
      // New remote scratchpad — insert locally
      const id = uuidv4()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO scratchpads (id, site_id, wp_id, title, content, modified_local, modified_remote, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, siteId, wp.id, title, content, now, modifiedRemote)
      continue
    }

    // Same timestamp → skip
    if (existing.modified_remote === modifiedRemote) continue

    // Remote changed, local synced=1 → overwrite
    if (existing.synced === 1) {
      const now = new Date().toISOString()
      db.prepare(`
        UPDATE scratchpads SET title = ?, content = ?, modified_local = ?, modified_remote = ?, synced = 1
        WHERE id = ?
      `).run(title, content, now, modifiedRemote, existing.id)
      continue
    }

    // Remote changed AND local edits exist (synced=0) → conflict. Record the
    // remote timestamp so this same remote edit isn't re-flagged every pull
    // (matches upsertPost); local content is never overwritten. The user
    // resolves via keep-mine / keep-theirs.
    db.prepare('UPDATE scratchpads SET conflict = 1, modified_remote = ? WHERE id = ?')
      .run(modifiedRemote, existing.id)
  }

  // Ghost pruning: scratchpads deleted on WordPress otherwise linger locally
  // forever (the loop above only adds and updates). Same rules as posts —
  // list absence is only a trigger; each candidate is verified with a direct
  // GET and removed only on a confirmed 404/trash. Local edits always survive.
  const remoteIds = new Set(remote.map((wp) => wp.id))
  const candidates = (
    db
      .prepare(
        'SELECT id, wp_id FROM scratchpads WHERE site_id = ? AND wp_id IS NOT NULL AND synced = 1 AND conflict = 0 AND pending_delete = 0'
      )
      .all(siteId) as { id: string; wp_id: number }[]
  ).filter((row) => !remoteIds.has(row.wp_id))

  for (const row of candidates) {
    const existence = await fetchRemoteScratchpadExistence(site.url, site.username, password, row.wp_id)
    if (existence === 'gone') {
      db.prepare('UPDATE posts SET scratchpad_id = NULL WHERE scratchpad_id = ?').run(row.id)
      hardDeleteScratchpad(row.id)
    }
  }
}

const MASS_PUSH_THRESHOLD = 5

/** Per-site mutex: if a sync is already in flight, callers receive the same promise. */
const syncLocks = new Map<string, Promise<SyncResult>>()

export function syncSite(siteId: string, options?: { force?: boolean }): Promise<SyncResult> {
  const existing = syncLocks.get(siteId)
  if (existing) return existing

  const promise = doSyncSite(siteId, options).finally(() => syncLocks.delete(siteId))
  syncLocks.set(siteId, promise)
  return promise
}

async function doSyncSite(siteId: string, options?: { force?: boolean }): Promise<SyncResult> {
  const db = getDb()

  const pushErrors: string[] = []

  // Push scratchpads first (before posts, so wp_id is available for meta sync)
  try {
    const scratchpadResult = await pushScratchpadsForSite(siteId)
    pushErrors.push(...scratchpadResult.errors)
  } catch (err) {
    pushErrors.push(`Scratchpads: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Resolve offline-created (pending) terms before anything is pushed, so push
  // payloads carry real WP ids instead of temporary negative ones.
  try {
    const termResult = await resolvePendingTerms(siteId)
    pushErrors.push(...termResult.errors)
  } catch (err) {
    pushErrors.push(`Terms: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Push staged media library uploads + queued alt-text edits
  try {
    const mediaLibResult = await pushMediaLibraryPending(siteId)
    pushErrors.push(...mediaLibResult.errors)
  } catch (err) {
    pushErrors.push(`Media library: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Push pending deletions before the push loop (so deletions don't inflate mass push guard)
  let deletedCount = 0
  try {
    const deleteResult = await pushPendingDeletions(siteId)
    deletedCount = deleteResult.deleted
    pushErrors.push(...deleteResult.errors)
  } catch (err) {
    pushErrors.push(`Deletions: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Get all unsynced, non-conflict, non-pending-delete posts for this site
  const unsyncedPosts = db
    .prepare('SELECT id FROM posts WHERE site_id = ? AND synced = 0 AND conflict = 0 AND pending_delete = 0')
    .all(siteId) as { id: string }[]

  // Push each one, collecting errors
  let pushed = 0
  let recreated = 0
  let massPushPaused: { count: number } | undefined

  if (unsyncedPosts.length > MASS_PUSH_THRESHOLD && !options?.force) {
    massPushPaused = { count: unsyncedPosts.length }
    // Skip pushing — still proceed with pull (safe, read-only)
  } else {
    for (const row of unsyncedPosts) {
      // Skip posts still referencing unresolved (negative) term ids — a term
      // failed to create, so pushing would drop those ids silently.
      const p = getPostById(row.id)
      if (p && postHasNegativeTerms(p)) {
        pushErrors.push(`Skipped "${p.title || 'Untitled'}" — a tag/category isn't on WordPress yet`)
        continue
      }
      try {
        const pushResult = await pushPostToWp(row.id, { skipTermResolution: true })
        pushed++
        if (pushResult.recreated) recreated++
      } catch (err) {
        // Push-time conflicts are not failures — the post is now flagged and
        // reported through the conflicts count / conflict UI instead.
        if (err instanceof PushConflictError) continue
        pushErrors.push(err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Then pull posts + ACF schema + media library + taxonomy terms
  const pull = await pullPostsForSite(siteId)
  const schemaPull = await pullAcfSchemaForSite(siteId)
  const mediaLibraryPull = await pullMediaLibraryForSite(siteId)
  await pullTaxonomyTerms(siteId).catch((err) => {
    console.warn('[sync] Failed to pull taxonomy terms:', err instanceof Error ? err.message : err)
  })

  // Pull scratchpads after posts
  try {
    await pullScratchpadsForSite(siteId)
  } catch (err) {
    console.warn('[sync] Failed to pull scratchpads:', err instanceof Error ? err.message : err)
  }

  // Post-sync housekeeping (site icon + plugin version check)
  const site = getSiteById(siteId)
  const pw = site ? getCredential(site.keychain_ref) : null

  // Refresh site icon (non-critical)
  if (site && pw) {
    try {
      const result = await fetchSiteIcon(site.url, site.username, pw)
      if (result) {
        const iconDir = join(app.getPath('userData'), 'site-icons')
        mkdirSync(iconDir, { recursive: true })
        const iconPath = join(iconDir, `${siteId}${result.ext}`)
        writeFileSync(iconPath, result.imageBuffer)
        updateSiteIconUrl(siteId, iconPath)
      } else {
        updateSiteIconUrl(siteId, null)
      }
    } catch (err) {
      console.warn('[sync] Failed to refresh site icon:', err instanceof Error ? err.message : err)
    }
  }

  // Refresh cached preview CSS in the background if missing or stale (>24h).
  // Never fatal — offline sites, unreachable homepages, etc. must not fail sync.
  if (site && getSiteCssAgeMs(siteId) > SITE_CSS_MAX_AGE_MS) {
    refreshSiteCss(siteId, site.url).catch((err) => {
      console.warn('[sync] Failed to refresh site CSS:', err instanceof Error ? err.message : err)
    })
  }

  // Check companion plugin version
  let pluginVersionWarning: string | undefined
  if (site && pw) {
    try {
      const pluginVersion = await fetchPluginVersion(site.url, site.username, pw)
      if (pluginVersion && isPluginVersionMismatch(pluginVersion, app.getVersion())) {
        pluginVersionWarning = pluginMismatchMessage(app.getVersion())
      }
    } catch {
      // Non-critical
    }
  }

  // Conflicted posts + scratchpads are counted by the badge but never
  // auto-pushed — report them so the renderer can say so instead of
  // "Everything up to date". Folded into one count: the "needs review" signal
  // is identical for both; only the surface the user opens to resolve differs.
  const conflicts =
    (db.prepare('SELECT COUNT(*) as count FROM posts WHERE site_id = ? AND conflict = 1').get(siteId) as { count: number }).count +
    (db.prepare('SELECT COUNT(*) as count FROM scratchpads WHERE site_id = ? AND conflict = 1 AND pending_delete = 0').get(siteId) as { count: number }).count

  return { pushed, recreated, deleted: deletedCount, pushErrors, pull, schemaPull, mediaLibraryPull, pluginVersionWarning, massPushPaused, conflicts }
}

export function getPendingChanges(siteId: string): PendingChanges {
  const db = getDb()
  const count = (sql: string): number => (db.prepare(sql).get(siteId) as { count: number }).count

  const posts = count(
    'SELECT COUNT(*) as count FROM posts WHERE site_id = ? AND (synced = 0 OR pending_delete = 1)'
  )
  const scratchpads = count(
    'SELECT COUNT(*) as count FROM scratchpads WHERE site_id = ? AND (synced = 0 OR pending_delete = 1)'
  )
  const media =
    count('SELECT COUNT(*) as count FROM media WHERE site_id = ? AND synced = 0') +
    count('SELECT COUNT(*) as count FROM media_library_pending WHERE site_id = ?') +
    count('SELECT COUNT(*) as count FROM media_library WHERE site_id = ? AND pending_alt_text IS NOT NULL')

  return { posts, scratchpads, media, total: posts + scratchpads + media }
}
