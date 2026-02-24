import { useState, useEffect, useCallback } from 'react'
import type { Media } from '@shared/types'

interface UseMediaQueueReturn {
  queue: Media[]
  pending: number
  loading: boolean
  refresh: () => Promise<void>
  uploadItem: (mediaId: string) => Promise<Media>
  uploadAll: () => Promise<Media[]>
}

export function useMediaQueue(siteId: string, postId?: string): UseMediaQueueReturn {
  const [queue, setQueue] = useState<Media[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      let items: Media[]
      if (postId) {
        items = await window.electronAPI.getMediaForPost(postId)
      } else {
        items = await window.electronAPI.getMediaQueue(siteId)
      }
      setQueue(items)
    } finally {
      setLoading(false)
    }
  }, [siteId, postId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pending = queue.filter((m) => !m.synced).length

  const uploadItem = useCallback(
    async (mediaId: string): Promise<Media> => {
      const updated = await window.electronAPI.uploadMedia(mediaId)
      await refresh()
      return updated
    },
    [refresh]
  )

  const uploadAll = useCallback(async (): Promise<Media[]> => {
    const pendingItems = queue.filter((m) => !m.synced)
    const results: Media[] = []
    for (const item of pendingItems) {
      const updated = await window.electronAPI.uploadMedia(item.id)
      results.push(updated)
    }
    await refresh()
    return results
  }, [queue, refresh])

  return { queue, pending, loading, refresh, uploadItem, uploadAll }
}
