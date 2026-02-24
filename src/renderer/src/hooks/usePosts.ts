import { useState, useEffect, useCallback } from 'react'
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

  const refresh = useCallback(async () => {
    if (!siteId) {
      setPosts([])
      return
    }
    try {
      setLoading(true)
      setError(null)
      const result = await window.electronAPI.getPosts(siteId)
      setPosts(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pullPosts = useCallback(async (): Promise<PullResult> => {
    if (!siteId) throw new Error('No site selected')
    try {
      setPulling(true)
      setError(null)
      const result = await window.electronAPI.pullPosts(siteId)
      await refresh()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pull failed'
      setError(msg)
      throw err
    } finally {
      setPulling(false)
    }
  }, [siteId, refresh])

  const createPost = useCallback(async (input?: Partial<PostInput>): Promise<Post> => {
    if (!siteId) throw new Error('No site selected')
    const post = await window.electronAPI.createPost({ site_id: siteId, ...input })
    await refresh()
    return post
  }, [siteId, refresh])

  const deletePost = useCallback(async (id: string): Promise<void> => {
    await window.electronAPI.deletePost(id)
    await refresh()
  }, [refresh])

  return { posts, loading, pulling, error, refresh, pullPosts, createPost, deletePost }
}
