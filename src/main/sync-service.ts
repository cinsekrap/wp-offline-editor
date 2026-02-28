import { v4 as uuidv4 } from 'uuid'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { getDb } from './database'
import { getSiteById, updateSiteIconUrl } from './site-service'
import { getCredential } from './credentials'
import { getPostById, deletePost, pullPostsForSite, downloadAndRewriteImages, rewriteAcfImageUrls, downloadFeaturedImage } from './post-service'
import { getMediaForPost, uploadMediaToWp } from './media-service'
import { pushPost, deleteRemotePost, fetchSinglePost, fetchUserNames, fetchSiteIcon, fetchScratchpads, pushScratchpad as pushScratchpadToWp, updatePostScratchpadMeta, fetchPluginVersion } from './wp-client'
import { isPluginVersionMismatch, pluginMismatchMessage } from '@shared/version-utils'
import { decodeHtmlEntities } from './html-utils'
import { sanitizeHtml } from './sanitize'
import { pullAcfSchemaForSite } from './acf-service'
import { pullMediaLibraryForSite } from './media-library-service'
import { pullTaxonomyTerms } from './taxonomy-service'
import { getScratchpadsForSite, getScratchpadById } from './scratchpad-service'
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
    featured_media: featuredMedia,
    excerpt: post.excerpt || undefined,
    slug: post.slug || undefined,
    categories: post.categories.length > 0 ? post.categories : undefined,
    tags: post.tags.length > 0 ? post.tags : undefined
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
  let acfJson = wpPost.acf ? JSON.stringify(wpPost.acf) : null

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
}

async function pushScratchpadsForSite(siteId: string): Promise<void> {
  const db = getDb()
  const site = getSiteById(siteId)
  if (!site) return

  const password = getCredential(site.keychain_ref)
  if (!password) return

  const unsynced = db
    .prepare('SELECT id FROM scratchpads WHERE site_id = ? AND synced = 0')
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
          console.warn('[sync] Failed to update scratchpad meta on post:', err instanceof Error ? err.message : err)
        }
      }
    } catch (err) {
      console.warn('[sync] Failed to push scratchpad:', err instanceof Error ? err.message : err)
    }
  }
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

async function pullScratchpadsForSite(siteId: string): Promise<void> {
  const db = getDb()
  const site = getSiteById(siteId)
  if (!site) return

  const password = getCredential(site.keychain_ref)
  if (!password) return

  let remote
  try {
    remote = await fetchScratchpads(site.url, site.username, password)
  } catch {
    return // Old plugin — gracefully skip
  }

  if (remote.length === 0) return

  for (const wp of remote) {
    const title = decodeHtmlEntities(wp.title.rendered)
    const content = stripBasicHtml(wp.content.rendered)
    const modifiedRemote = wp.modified

    const existing = db
      .prepare('SELECT id, modified_remote, synced FROM scratchpads WHERE site_id = ? AND wp_id = ?')
      .get(siteId, wp.id) as { id: string; modified_remote: string | null; synced: number } | undefined

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
    }
    // synced=0 → local wins, skip (no conflict UI in Part 1)
  }
}

export async function syncSite(siteId: string): Promise<SyncResult> {
  const db = getDb()

  // Push scratchpads first (before posts, so wp_id is available for meta sync)
  try {
    await pushScratchpadsForSite(siteId)
  } catch (err) {
    console.warn('[sync] Failed to push scratchpads:', err instanceof Error ? err.message : err)
  }

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

  return { pushed, pushErrors, pull, schemaPull, mediaLibraryPull, pluginVersionWarning }
}

export function getUnsyncedPostCount(siteId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM posts WHERE site_id = ? AND synced = 0')
    .get(siteId) as { count: number }
  return row.count
}

export function getTotalUnsyncedCount(): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM posts WHERE synced = 0')
    .get() as { count: number }
  return row.count
}
