import { useCallback } from 'react'
import { PostList } from './PostList'
import type { PostListFilter } from './PostList'
import { PostEditor } from '@renderer/components/editor/PostEditor'
import type { Post, PostInput, PostStatus, Site } from '@shared/types'

interface PostsViewProps {
  siteId: string
  pulling?: boolean
  online?: boolean
  editorFontSize?: number
  selectedPostId: string | null
  onSelectPost: (id: string | null) => void
  onBack?: () => void
  initialFilter?: PostListFilter | null
  posts: Post[]
  postsLoading: boolean
  refreshPosts: () => Promise<void>
  createPost: (input?: Partial<PostInput>) => Promise<Post>
  deletePost: (id: string) => Promise<void>
  sites?: Site[]
  onDuplicate?: (newPostId: string, targetSiteId: string) => void
  /** Template-aware new-post flow (opens the template picker when templates exist). */
  onNewPost?: () => void
  /** Opens the template manager (lives inside the posts screen). */
  onTemplates?: () => void
}

export function PostsView({
  siteId,
  pulling,
  editorFontSize,
  selectedPostId,
  onSelectPost,
  onBack,
  initialFilter,
  posts,
  postsLoading,
  refreshPosts,
  createPost,
  deletePost,
  sites,
  onDuplicate,
  onNewPost,
  onTemplates
}: PostsViewProps): JSX.Element {
  const handleBlankNewPost = useCallback(async () => {
    const post = await createPost()
    onSelectPost(post.id)
  }, [createPost, onSelectPost])

  // Prefer the template-aware flow so both New post buttons (dashboard and
  // posts screen) behave the same; fall back to a blank post if not wired.
  const handleNewPost = onNewPost ?? handleBlankNewPost

  const handleDeletePost = useCallback(async () => {
    if (!selectedPostId) return
    await deletePost(selectedPostId)
    onSelectPost(null)
    refreshPosts()
  }, [selectedPostId, deletePost, onSelectPost, refreshPosts])

  const handleBulkStatus = useCallback(async (postIds: string[], status: PostStatus) => {
    await window.electronAPI.bulkUpdateStatus(postIds, status)
    await refreshPosts()
  }, [refreshPosts])

  const handleBulkDelete = useCallback(async (postIds: string[]) => {
    await window.electronAPI.bulkDeletePosts(postIds)
    await refreshPosts()
  }, [refreshPosts])

  if (selectedPostId) {
    return (
      <PostEditor
        key={selectedPostId}
        postId={selectedPostId}
        siteId={siteId}
        onBack={onBack ?? (() => onSelectPost(null))}
        onDelete={handleDeletePost}
        onPostUpdated={refreshPosts}
        editorFontSize={editorFontSize}
        sites={sites}
        onDuplicate={onDuplicate}
      />
    )
  }

  return (
    <PostList
      posts={posts}
      // Keep showing the current list during a sync — only spin when there is
      // nothing to show yet (first pull on an empty site), like the dashboard
      loading={(postsLoading || !!pulling) && posts.length === 0}
      siteId={siteId}
      onSelectPost={onSelectPost}
      onNewPost={handleNewPost}
      onTemplates={onTemplates}
      initialFilter={initialFilter}
      onBulkStatus={handleBulkStatus}
      onBulkDelete={handleBulkDelete}
    />
  )
}
