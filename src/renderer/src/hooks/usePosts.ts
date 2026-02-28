import { useState, useEffect, useCallback, useRef } from 'react'
import type { Post, PostInput, PullResult } from '@shared/types'

interface UsePostsReturn {
  posts: Post[]
  loading: boolean
  pulling: boolean
  error: string | null
  refresh: () => Promise<void>
  pullPosts: () => Promise<PullResult>
  createPost: (input?: Partial<PostInput>) => Promise<Post>
  deletePost: (id: string) => Promise<void>
}

export function usePosts(siteId: string | null): UsePostsReturn {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref always holds the current siteId so refresh never uses a stale value
  const siteIdRef = useRef(siteId)
  siteIdRef.current = siteId

  const refresh = useCallback(async (showLoading = false) => {
    const currentSiteId = siteIdRef.current
    if (!currentSiteId) {
      setPosts([])
      return
    }
    try {
      if (showLoading) setLoading(true)
      setError(null)
      const result = await window.electronAPI.getPosts(currentSiteId)
      // Only apply if siteId hasn't changed during the fetch
      if (siteIdRef.current === currentSiteId) {
        setPosts(result)
      }
    } catch (err) {
      if (siteIdRef.current === currentSiteId) {
        setError(err instanceof Error ? err.message : 'Failed to load posts')
      }
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  // Clear stale posts immediately on site change, then fetch new ones
  useEffect(() => {
    setPosts([])
    refresh(true)
  }, [siteId, refresh])

  const pullPosts = useCallback(async (): Promise<PullResult> => {
    const currentSiteId = siteIdRef.current
    if (!currentSiteId) throw new Error('No site selected')
    try {
      setPulling(true)
      setError(null)
      const result = await window.electronAPI.pullPosts(currentSiteId)
      await refresh()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pull failed'
      setError(msg)
      throw err
    } finally {
      setPulling(false)
    }
  }, [refresh])

  const createPost = useCallback(async (input?: Partial<PostInput>): Promise<Post> => {
    const currentSiteId = siteIdRef.current
    if (!currentSiteId) throw new Error('No site selected')
    const post = await window.electronAPI.createPost({ site_id: currentSiteId, ...input })
    await refresh()
    return post
  }, [refresh])

  const deletePost = useCallback(async (id: string): Promise<void> => {
    await window.electronAPI.deletePost(id)
    await refresh()
  }, [refresh])

  return { posts, loading, pulling, error, refresh, pullPosts, createPost, deletePost }
}
