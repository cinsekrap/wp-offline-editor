import { useCallback } from 'react'
import { PostList } from './PostList'
import type { PostListFilter } from './PostList'
import { PostEditor } from '@renderer/components/editor/PostEditor'
import type { Post, PostInput, Site } from '@shared/types'

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
  onDuplicate
}: PostsViewProps): JSX.Element {
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
      loading={postsLoading || !!pulling}
      onSelectPost={onSelectPost}
      onNewPost={handleNewPost}
      initialFilter={initialFilter}
    />
  )
}
