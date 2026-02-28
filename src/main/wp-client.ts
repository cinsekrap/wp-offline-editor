import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import { decodeHtmlEntities } from './html-utils'
import { isLocalUrl } from './url-utils'
import type {
  WpConnectionResult,
  WpPostRaw,
  WpAcfFieldGroupRaw,
  WpAcfFieldRaw,
  WpMediaUploadResult
} from '@shared/types'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
}

function makeAuthHeaders(username: string, password: string): Record<string, string> {
  return {
    Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  }
}

/** Strip trailing slashes once so callers don't repeat this */
function apiBase(url: string): string {
  return `${url.replace(/\/+$/, '')}/wp-json`
}

export async function testWpConnection(
  url: string,
  username: string,
  password: string
): Promise<WpConnectionResult> {
  const cleanUrl = url.replace(/\/+$/, '')

  if (cleanUrl.startsWith('http://') && !isLocalUrl(cleanUrl)) {
    return { success: false, error: 'Non-local sites must use HTTPS. Change the URL to https://.' }
  }

  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  try {
    // Test basic WP REST API availability
    const rootRes = await fetch(base, { headers })

    if (!rootRes.ok) {
      if (rootRes.status === 401 || rootRes.status === 403) {
        return { success: false, error: 'Authentication failed. Check username and application password.' }
      }
      return { success: false, error: `WordPress REST API returned status ${rootRes.status}` }
    }

    const root = (await rootRes.json()) as {
      name?: string
      namespaces?: string[]
    }

    // Get WP version from the wp/v2 users/me endpoint (requires auth)
    let wpVersion = 'Unknown'
    try {
      const meRes = await fetch(`${base}/wp/v2/users/me?context=edit`, { headers })
      if (meRes.ok) {
        wpVersion = meRes.headers.get('x-wp-version') || 'Unknown'
      }
    } catch {
      // Version check is non-critical
    }

    // If x-wp-version wasn't in headers, try root response headers
    if (wpVersion === 'Unknown') {
      wpVersion = rootRes.headers.get('x-wp-version') || 'Unknown'
    }

    const namespaces = root.namespaces || []

    // Check if companion plugin is active
    const wpoePluginActive = namespaces.includes('wpoe/v1')

    // Detect ACF: check namespace first, then companion plugin status, then post schema
    let acfActive = namespaces.some((ns: string) => ns.startsWith('acf/'))

    if (!acfActive && wpoePluginActive) {
      try {
        const statusRes = await fetch(`${base}/wpoe/v1/status`)
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { acf?: boolean }
          acfActive = !!status.acf
        }
      } catch {
        // Non-critical
      }
    }

    if (!acfActive) {
      try {
        const schemaRes = await fetch(`${base}/wp/v2/posts?per_page=1&_fields=acf`, { headers })
        if (schemaRes.ok) {
          const posts = (await schemaRes.json()) as Record<string, unknown>[]
          acfActive = posts.length > 0 && 'acf' in posts[0]
        }
      } catch {
        // Non-critical
      }
    }

    return {
      success: true,
      siteName: decodeHtmlEntities(root.name || cleanUrl),
      wpVersion,
      acfActive,
      wpoePluginActive
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return { success: false, error: 'Could not resolve hostname. Check the URL.' }
    }
    if (message.includes('ECONNREFUSED')) {
      return { success: false, error: 'Connection refused. Is the site running?' }
    }
    if (message.includes('certificate') || message.includes('SSL')) {
      return { success: false, error: 'SSL/TLS error. Check if the site uses a valid certificate.' }
    }

    return { success: false, error: `Connection failed: ${message}` }
  }
}

// ── Site icon fetching ──────────────────────────────────────────────────

export async function fetchSiteIcon(
  url: string,
  username: string,
  password: string
): Promise<{ imageBuffer: Buffer; ext: string } | null> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  try {
    // WP REST API returns site_icon as a media attachment ID (0 = no icon)
    const res = await fetch(`${base}/wp/v2/settings`, { headers })
    if (!res.ok) return null

    const settings = (await res.json()) as { site_icon?: number }
    if (!settings.site_icon) return null

    // Fetch the actual image URL from the media endpoint
    const mediaRes = await fetch(
      `${base}/wp/v2/media/${settings.site_icon}?_fields=source_url,media_details`,
      { headers }
    )
    if (!mediaRes.ok) return null

    const media = (await mediaRes.json()) as {
      source_url: string
      media_details?: { sizes?: Record<string, { source_url: string }> }
    }

    // Prefer a small size if available
    const sizes = media.media_details?.sizes
    const imageUrl = sizes?.thumbnail?.source_url || sizes?.medium?.source_url || media.source_url
    if (!imageUrl) return null

    // Download the image
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return null

    const arrayBuf = await imgRes.arrayBuffer()
    const ext = extname(new URL(imageUrl).pathname) || '.png'
    return { imageBuffer: Buffer.from(arrayBuf), ext }
  } catch {
    return null
  }
}

// ── Post fetching ───────────────────────────────────────────────────────

export async function fetchPosts(
  url: string,
  username: string,
  password: string,
  statuses: string[],
  maxPublished: number
): Promise<{ posts: WpPostRaw[]; total: number }> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)
  const fields = 'id,title,content,excerpt,slug,status,modified,date,author,featured_media,categories,tags,acf'
  const allPosts: WpPostRaw[] = []

  for (const status of statuses) {
    const perPage = 100
    let page = 1
    let totalPages = 1
    const limit = status === 'publish' ? maxPublished : Infinity

    while (page <= totalPages && allPosts.filter((p) => p.status === status).length < limit) {
      const params = new URLSearchParams({
        status,
        per_page: String(Math.min(perPage, 100)),
        page: String(page),
        _fields: fields
      })

      const res = await fetch(`${base}/wp/v2/posts?${params}`, { headers })

      if (!res.ok) {
        // 400 often means "no posts with this status" — skip silently
        if (res.status === 400) break
        throw new Error(`Failed to fetch ${status} posts: HTTP ${res.status}`)
      }

      totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10)
      const batch = (await res.json()) as WpPostRaw[]
      allPosts.push(...batch)
      page++
    }

    // Trim published posts to maxPublished limit
    if (status === 'publish') {
      const publishedPosts = allPosts.filter((p) => p.status === 'publish')
      if (publishedPosts.length > maxPublished) {
        const excess = publishedPosts.slice(maxPublished)
        for (const p of excess) {
          const idx = allPosts.indexOf(p)
          if (idx !== -1) allPosts.splice(idx, 1)
        }
      }
    }
  }

  return { posts: allPosts, total: allPosts.length }
}

// ── User name resolution ────────────────────────────────────────────────

export async function fetchUserNames(
  url: string,
  username: string,
  password: string,
  userIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (userIds.length === 0) return map

  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const params = new URLSearchParams({
    include: userIds.join(','),
    _fields: 'id,name',
    per_page: '100'
  })

  const res = await fetch(`${base}/wp/v2/users?${params}`, { headers })
  if (!res.ok) return map

  const users = (await res.json()) as { id: number; name: string }[]
  for (const u of users) {
    map.set(u.id, u.name)
  }
  return map
}

// ── Author fetching ─────────────────────────────────────────────────────

export async function fetchAuthors(
  url: string,
  username: string,
  password: string
): Promise<{ id: number; name: string }[]> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(`${base}/wp/v2/users?per_page=100&_fields=id,name`, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch authors: HTTP ${res.status}`)
  }

  return (await res.json()) as { id: number; name: string }[]
}

// ── Taxonomy term fetching ───────────────────────────────────────────────

export interface WpTaxonomyTermRaw {
  id: number
  name: string
  slug: string
  parent?: number
}

export async function fetchTaxonomyTerms(
  url: string,
  username: string,
  password: string,
  taxonomy: 'categories' | 'tags'
): Promise<WpTaxonomyTermRaw[]> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)
  const allTerms: WpTaxonomyTermRaw[] = []

  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams({
      per_page: '100',
      page: String(page),
      _fields: 'id,name,slug,parent'
    })

    const res = await fetch(`${base}/wp/v2/${taxonomy}?${params}`, { headers })

    if (!res.ok) {
      if (res.status === 400) break
      throw new Error(`Failed to fetch ${taxonomy}: HTTP ${res.status}`)
    }

    totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10)
    const batch = (await res.json()) as WpTaxonomyTermRaw[]
    allTerms.push(...batch)
    page++
  }

  return allTerms
}

// ── ACF field group fetching (via companion plugin wpoe/v1) ─────────────

export async function fetchAcfFieldGroups(
  url: string,
  username: string,
  password: string
): Promise<WpAcfFieldGroupRaw[]> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(`${base}/wpoe/v1/field-groups`, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch ACF field groups: HTTP ${res.status}`)
  }

  const groups = (await res.json()) as WpAcfFieldGroupRaw[]
  return groups.filter((g) => g.active)
}

export async function fetchAcfFieldGroupFields(
  url: string,
  username: string,
  password: string,
  groupKey: string
): Promise<WpAcfFieldRaw[]> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(`${base}/wpoe/v1/field-groups/${groupKey}/fields`, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch fields for group ${groupKey}: HTTP ${res.status}`)
  }

  return (await res.json()) as WpAcfFieldRaw[]
}

// ── Shortcodes ──────────────────────────────────────────────────────────

export async function fetchShortcodes(
  url: string,
  username: string,
  password: string
): Promise<{ tag: string }[]> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(`${base}/wpoe/v1/shortcodes`, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch shortcodes: HTTP ${res.status}`)
  }

  return (await res.json()) as { tag: string }[]
}

// ── Attachment URL fetch ─────────────────────────────────────────────────

export async function fetchAttachmentUrl(
  url: string,
  username: string,
  password: string,
  attachmentId: number
): Promise<string | null> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  try {
    const res = await fetch(
      `${base}/wp/v2/media/${attachmentId}?_fields=source_url`,
      { headers }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { source_url: string }
    return data.source_url || null
  } catch {
    return null
  }
}

// ── Post push (create / update) ─────────────────────────────────────────

export async function pushPost(
  url: string,
  username: string,
  password: string,
  wpId: number | null,
  data: { title: string; content: string; status: string; date?: string | null; acf?: Record<string, unknown> | null; featured_media?: number; excerpt?: string; slug?: string; categories?: number[]; tags?: number[] }
): Promise<{ id: number; modified: string }> {
  const base = apiBase(url)
  const headers = {
    ...makeAuthHeaders(username, password),
    'Content-Type': 'application/json'
  }

  const body: Record<string, unknown> = {
    title: data.title,
    content: data.content,
    status: data.status
  }
  if (data.date) body.date = data.date
  if (data.acf) body.acf = data.acf
  if (data.featured_media !== undefined) body.featured_media = data.featured_media
  if (data.excerpt) body.excerpt = data.excerpt
  if (data.slug) body.slug = data.slug
  if (data.categories) body.categories = data.categories
  if (data.tags) body.tags = data.tags

  const endpoint = wpId
    ? `${base}/wp/v2/posts/${wpId}`
    : `${base}/wp/v2/posts`

  const res = await fetch(endpoint, {
    method: wpId ? 'PUT' : 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Push failed: HTTP ${res.status} ${text}`)
  }

  const result = (await res.json()) as { id: number; modified: string }
  return { id: result.id, modified: result.modified }
}

// ── Post delete ─────────────────────────────────────────────────────────

export async function deleteRemotePost(
  url: string,
  username: string,
  password: string,
  wpId: number
): Promise<void> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(`${base}/wp/v2/posts/${wpId}?force=true`, {
    method: 'DELETE',
    headers
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Delete failed: HTTP ${res.status} ${text}`)
  }
}

// ── Single post fetch ───────────────────────────────────────────────────

export async function fetchSinglePost(
  url: string,
  username: string,
  password: string,
  wpId: number
): Promise<WpPostRaw> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const res = await fetch(
    `${base}/wp/v2/posts/${wpId}?_fields=id,title,content,excerpt,slug,status,modified,date,author,featured_media,categories,tags,acf`,
    { headers }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch post ${wpId}: HTTP ${res.status}`)
  }

  return (await res.json()) as WpPostRaw
}

// ── Media library fetching ──────────────────────────────────────────────

export interface WpMediaItemRaw {
  id: number
  title: { rendered: string }
  mime_type: string
  alt_text: string
  source_url: string
  date: string
  media_details?: {
    width?: number
    height?: number
    file?: string
    sizes?: Record<string, { source_url: string; width: number; height: number }>
  }
}

export async function fetchMediaLibrary(
  url: string,
  username: string,
  password: string,
  limit: number
): Promise<{ items: WpMediaItemRaw[]; total: number }> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)
  const allItems: WpMediaItemRaw[] = []

  const perPage = Math.min(limit, 100)
  let page = 1
  let totalPages = 1

  while (page <= totalPages && allItems.length < limit) {
    const params = new URLSearchParams({
      media_type: 'image',
      per_page: String(perPage),
      page: String(page),
      orderby: 'date',
      order: 'desc',
      _fields: 'id,title,mime_type,alt_text,source_url,media_details,date'
    })

    const res = await fetch(`${base}/wp/v2/media?${params}`, { headers })

    if (!res.ok) {
      if (res.status === 400) break
      throw new Error(`Failed to fetch media library: HTTP ${res.status}`)
    }

    totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10)
    const batch = (await res.json()) as WpMediaItemRaw[]
    allItems.push(...batch)
    page++
  }

  // Trim to limit
  if (allItems.length > limit) {
    allItems.length = limit
  }

  return { items: allItems, total: allItems.length }
}

// ── Media upload ────────────────────────────────────────────────────────

export async function uploadMedia(
  url: string,
  username: string,
  password: string,
  filePath: string,
  filename: string
): Promise<WpMediaUploadResult> {
  const base = apiBase(url)
  const headers = makeAuthHeaders(username, password)

  const fileBuffer = readFileSync(filePath)
  const ext = extname(filename).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
  const blob = new Blob([fileBuffer], { type: mimeType })

  const form = new FormData()
  form.append('file', blob, basename(filename))

  const res = await fetch(`${base}/wp/v2/media`, {
    method: 'POST',
    headers,
    body: form
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Media upload failed: HTTP ${res.status} ${text}`)
  }

  const data = (await res.json()) as { id: number; source_url: string }
  return { id: data.id, source_url: data.source_url }
}
