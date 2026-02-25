import { useCallback } from 'react'
import { PostList } from './PostList'
import type { PostListFilter } from './PostList'
import { PostEditor } from '@renderer/components/editor/PostEditor'
import type { Post, PostInput } from '@shared/types'

interface PostsViewProps {
  siteId: string
  pulling?: boolean
  online?: boolean
  editorFontSize?: number
  selectedPostId: string | null
  onSelectPost: (id: string | null) => void
  initialFilter?: PostListFilter | null
  posts: Post[]
  postsLoading: boolean
  refreshPosts: () => Promise<void>
  createPost: (input?: Partial<PostInput>) => Promise<Post>
  deletePost: (id: string) => Promise<void>
}

export function PostsView({
  siteId,
  pulling,
  online,
  editorFontSize,
  selectedPostId,
  onSelectPost,
  initialFilter,
  posts,
  postsLoading,
  refreshPosts,
  createPost,
  deletePost
}: PostsViewProps): JSX.Element {
  const handleSelectPost = useCallback((id: string) => {
    onSelectPost(id)
  }, [onSelectPost])

  const handleNewPost = useCallback(async () => {
    const post = await createPost()
    onSelectPost(post.id)
  }, [createPost, onSelectPost])

  const handleDeletePost = useCallback(async () => {
    if (!selectedPostId) return
    await deletePost(selectedPostId)
    onSelectPost(null)
    refreshPosts()
  }, [selectedPostId, deletePost, onSelectPost, refreshPosts])

  const handlePostUpdated = useCallback(() => {
    refreshPosts()
  }, [refreshPosts])

  if (selectedPostId) {
    return (
      <PostEditor
        key={selectedPostId}
        postId={selectedPostId}
        siteId={siteId}
        onBack={() => onSelectPost(null)}
        onDelete={handleDeletePost}
        onPostUpdated={handlePostUpdated}
        online={online}
        editorFontSize={editorFontSize}
      />
    )
  }

  return (
    <PostList
      posts={posts}
      loading={postsLoading || !!pulling}
      onSelectPost={handleSelectPost}
      onNewPost={handleNewPost}
      initialFilter={initialFilter}
    />
  )
}
