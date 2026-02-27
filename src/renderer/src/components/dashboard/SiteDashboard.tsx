import { useMemo } from 'react'
import { Plus, CloudUpload, CheckCircle, ChevronRight } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { WritingStats } from './WritingStats'
import { useWindowSize } from '@renderer/hooks/useWindowSize'
import type { Post } from '@shared/types'
import type { PostListFilter } from '@renderer/components/posts/PostList'

interface SiteDashboardProps {
  siteId: string
  posts: Post[]
  loading: boolean
  onSelectPost: (id: string) => void
  onNewPost: () => void
  onSeeAllPosts: (filter?: PostListFilter) => void
}

const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800 border-green-200',
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-orange-100 text-orange-800 border-orange-200',
  private: 'bg-purple-100 text-purple-800 border-purple-200',
  future: 'bg-blue-100 text-blue-800 border-blue-200',
  trash: 'bg-red-100 text-red-800 border-red-200'
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks}w ago`
  }
  return date.toLocaleDateString()
}

function PostCard({
  post,
  pillLabel,
  pillColor,
  onClick
}: {
  post: Post
  pillLabel: string
  pillColor: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="border rounded-lg p-4 hover:bg-accent/30 transition-colors cursor-pointer text-left w-full"
    >
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm font-medium truncate flex-1">
          {post.title || '(Untitled)'}
        </p>
        {!post.synced ? (
          <CloudUpload className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <Badge
          className={cn('text-[11px] px-2 py-0', pillColor)}
          variant="outline"
        >
          {pillLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(post.date ?? post.modified_local)}
        </span>
      </div>
    </button>
  )
}

export function SiteDashboard({
  siteId,
  posts,
  loading,
  onSelectPost,
  onNewPost,
  onSeeAllPosts
}: SiteDashboardProps): JSX.Element {
  const { pickBackUp, pickBackUpTotal } = useMemo(() => {
    const pick: Post[] = []

    for (const post of posts) {
      if (post.status === 'trash') continue
      if (post.status === 'draft' || !post.synced) {
        pick.push(post)
      }
    }

    // Sort pick-back-up by modified_local desc
    pick.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())

    return {
      pickBackUp: pick.slice(0, 6),
      pickBackUpTotal: pick.length
    }
  }, [posts])

  function getPickBackUpPill(post: Post): { label: string; color: string } {
    if (post.status === 'draft') {
      return { label: 'Draft', color: STATUS_COLORS.draft }
    }
    return { label: 'Unsynced', color: 'bg-blue-100 text-blue-800 border-blue-200' }
  }

  const { height } = useWindowSize()
  // On shorter windows, show 1 row (3 cards) instead of 2 rows (6 cards)
  const compact = height < 700
  const maxCards = compact ? 3 : 6

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Loading posts...</p>
      </div>
    )
  }

  const visibleCards = pickBackUp.slice(0, maxCards)
  const hasMoreCards = pickBackUpTotal > maxCards

  return (
    <ScrollArea className="h-full">
      <div className={`max-w-4xl mx-auto px-6 ${compact ? 'py-3' : 'py-4'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>

        {/* Writing Stats */}
        <WritingStats siteId={siteId} compact={compact} />

        {/* Pick back up */}
        {visibleCards.length > 0 && (
          <section className={compact ? 'mb-3' : 'mb-5'}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-muted-foreground">Pick back up</h2>
              {hasMoreCards && (
                <button
                  onClick={() => onSeeAllPosts('drafts-unsynced')}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  See all
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleCards.map((post) => {
                const pill = getPickBackUpPill(post)
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    pillLabel={pill.label}
                    pillColor={pill.color}
                    onClick={() => onSelectPost(post.id)}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section className={compact ? 'mb-3' : 'mb-5'}>
          <div className="flex gap-2.5">
            <button
              onClick={onNewPost}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 hover:border-muted-foreground/50 hover:bg-accent/30 transition-colors cursor-pointer flex items-center justify-center gap-2 flex-1"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">New post</span>
            </button>
            {posts.length > 0 && (
              <button
                onClick={() => onSeeAllPosts()}
                className="border rounded-lg p-4 hover:bg-accent/30 transition-colors cursor-pointer flex items-center justify-center gap-2 flex-1"
              >
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">See all posts</span>
              </button>
            )}
          </div>
        </section>

        {/* Empty state */}
        {posts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No posts yet</p>
            <p className="text-xs mt-1">Create a new post or pull from WordPress.</p>
          </div>
        )}

      </div>
    </ScrollArea>
  )
}
