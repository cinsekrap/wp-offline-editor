import { useEffect, useState } from 'react'
import type { Post } from '@shared/types'

/**
 * Post id → media:// URL of its featured image, from the local copy, so cards
 * show thumbnails offline. Re-reads when the post list changes.
 */
export function useFeaturedImages(siteId: string | null, posts: Post[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  // A cheap signature so a re-render with the same posts doesn't refetch
  const signature = posts.map((p) => `${p.id}:${p.featured_image ?? ''}`).join('|')

  useEffect(() => {
    if (!siteId) {
      setUrls({})
      return
    }
    let cancelled = false
    window.electronAPI
      .getFeaturedImagePaths(siteId)
      .then((paths) => {
        if (cancelled) return
        const out: Record<string, string> = {}
        for (const [postId, path] of Object.entries(paths)) out[postId] = `media://file${encodeURI(path)}`
        setUrls(out)
      })
      .catch(() => {
        if (!cancelled) setUrls({})
      })
    return () => {
      cancelled = true
    }
  }, [siteId, signature])

  return urls
}
