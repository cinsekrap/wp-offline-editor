import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { getPostById, deletePost, pullPostsForSite, downloadAndRewriteImages, rewriteAcfImageUrls, downloadFeaturedImage } from './post-service'
import { getMediaForPost, uploadMediaToWp } from './media-service'
import { pushPost, deleteRemotePost, fetchSinglePost, fetchUserNames } from './wp-client'
import { decodeHtmlEntities } from './html-utils'
import { sanitizeHtml } from './sanitize'
import { pullAcfSchemaForSite } from './acf-service'
import { pullMediaLibraryForSite } from './media-library-service'
import type { PushResult, SyncResult } from '@shared/types'

export async function pushPostToWp(postId: string): Promise<PushResult> {
  const db = getDb()

  const post = getPostById(postId)
  if (!post) throw new Error(`Post not found: ${postId}`)
  if (!post.title.trim() && !post.content.trim()) {
    throw new Error('Cannot push a blank post — add a title or content first')
  }

  const site = getSiteById(post.site_id)
  if (!site) throw new Error(`Site not found: ${post.site_id}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  // Upload any unsynced media for this post
  const mediaItems = getMediaForPost(postId)
  for (const media of mediaItems) {
    if (!media.synced) {
      await uploadMediaToWp(media.id)
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
    featured_media: featuredMedia
  })

  // Update local DB
  const now = new Date().toISOString()
  const acfJson = swappedAcf ? JSON.stringify(swappedAcf) : null
  db.prepare(`
    UPDATE posts SET wp_id = ?, content = ?, acf = ?, modified_remote = ?, modified_local = ?, synced = 1, conflict = 0
    WHERE id = ?
  `).run(result.id, swappedContent, acfJson, result.modified, now, postId)

  return { wp_id: result.id, modified_remote: result.modified }
}

export async function deletePostFromWp(postId: string): Promise<void> {
  const post = getPostById(postId)
  if (!post) throw new Error(`Post not found: ${postId}`)

  // If the post exists on WordPress, delete it remotely first
  if (post.wp_id) {
    const site = getSiteById(post.site_id)
    if (!site) throw new Error(`Site not found: ${post.site_id}`)

    const password = getCredential(site.keychain_ref)
    if (!password) throw new Error(`No credential found for site: ${site.label}`)

    await deleteRemotePost(site.url, site.username, password, post.wp_id)
  }

  // Then delete locally
  deletePost(postId)
}

export async function resolveConflict(
  postId: string,
  strategy: 'keep-mine' | 'keep-theirs' | 'fork'
): Promise<void> {
  const db = getDb()

  if (strategy === 'keep-mine') {
    await pushPostToWp(postId)
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
    const forkAcfJson = post.acf ? JSON.stringify(post.acf) : null
    db.prepare(`
      INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, date, author_id, author_name, featured_image, modified_local, modified_remote, synced, conflict)
      VALUES (?, ?, NULL, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, 0, 0)
    `).run(
      uuidv4(),
      post.site_id,
      post.title + ' (copy)',
      post.content,
      forkAcfJson,
      post.date,
      post.author_id,
      post.author_name,
      post.featured_image,
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
  let acfJson = wpPost.acf ? JSON.stringify(wpPost.acf) : null

  // Download external images and rewrite to media:// protocol
  content = await downloadAndRewriteImages(post.site_id, postId, content, site.url)
  acfJson = await rewriteAcfImageUrls(post.site_id, postId, acfJson, site.url)

  // Download featured image from remote
  let featuredImage: string | null = null
  if (wpPost.featured_media > 0) {
    featuredImage = await downloadFeaturedImage(post.site_id, postId, wpPost.featured_media, site.url)
  }

  db.prepare(`
    UPDATE posts SET title = ?, content = ?, status = ?, acf = ?, date = ?, author_id = ?, author_name = ?, featured_image = ?, modified_local = ?, modified_remote = ?, synced = 1, conflict = 0
    WHERE id = ?
  `).run(
    title,
    content,
    wpPost.status,
    acfJson,
    wpPost.date,
    wpPost.author,
    authorName,
    featuredImage,
    now,
    wpPost.modified,
    postId
  )
}

export async function syncSite(siteId: string): Promise<SyncResult> {
  const db = getDb()

  // Get all unsynced, non-conflict posts for this site
  const unsyncedPosts = db
    .prepare('SELECT id FROM posts WHERE site_id = ? AND synced = 0 AND conflict = 0')
    .all(siteId) as { id: string }[]

  // Push each one, collecting errors
  let pushed = 0
  const pushErrors: string[] = []
  for (const row of unsyncedPosts) {
    try {
      await pushPostToWp(row.id)
      pushed++
    } catch (err) {
      pushErrors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // Then pull posts + ACF schema + media library
  const pull = await pullPostsForSite(siteId)
  const schemaPull = await pullAcfSchemaForSite(siteId)
  const mediaLibraryPull = await pullMediaLibraryForSite(siteId)

  return { pushed, pushErrors, pull, schemaPull, mediaLibraryPull }
}

export function getUnsyncedPostCount(siteId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM posts WHERE site_id = ? AND synced = 0')
    .get(siteId) as { count: number }
  return row.count
}
