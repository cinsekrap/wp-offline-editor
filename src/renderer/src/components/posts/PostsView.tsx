import { useState, useCallback, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { usePosts } from '@renderer/hooks/usePosts'
import { PostListSidebar } from './PostListSidebar'
import { PostEditor } from '@renderer/components/editor/PostEditor'

interface PostsViewProps {
  siteId: string
  pulling?: boolean
  online?: boolean
  editorFontSize?: number
}

export function PostsView({ siteId, pulling, online, editorFontSize }: PostsViewProps): JSX.Element {
  const { posts, loading, refresh, createPost } = usePosts(siteId)
  const prevPullingRef = useRef(pulling)

  // Refresh post list when an external pull finishes
  useEffect(() => {
    if (prevPullingRef.current && !pulling) {
      refresh()
    }
    prevPullingRef.current = pulling
  }, [pulling, refresh])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Auto-collapse sidebar when a post is selected
  const handleSelectPost = useCallback((id: string) => {
    setSelectedPostId(id)
    setSidebarOpen(false)
  }, [])

  const handleNewPost = useCallback(async () => {
    const post = await createPost()
    setSelectedPostId(post.id)
    setSidebarOpen(false)
  }, [createPost])

  const handlePostUpdated = useCallback(() => {
    refresh()
  }, [refresh])

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  // Cmd+\ keyboard shortcut to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <PostListSidebar
          posts={posts}
          loading={loading || !!pulling}
          selectedPostId={selectedPostId}
          onSelectPost={handleSelectPost}
          onNewPost={handleNewPost}
        />
      )}

      <div className="flex-1 min-w-0">
        {selectedPostId ? (
          <PostEditor
            key={selectedPostId}
            postId={selectedPostId}
            siteId={siteId}
            onBack={() => {
              setSelectedPostId(null)
              setSidebarOpen(true)
            }}
            onPostUpdated={handlePostUpdated}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={handleToggleSidebar}
            online={online}
            editorFontSize={editorFontSize}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            {pulling ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Pulling posts from WordPress...</p>
              </>
            ) : (
              <p className="text-sm">Select a post to edit</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
