import { useMemo } from 'react'
import { Plus, CloudUpload, CheckCircle, ChevronRight } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { STATUS_LABELS } from '@renderer/components/posts/PostList'
import type { Post } from '@shared/types'
import type { PostListFilter } from '@renderer/components/posts/PostList'

interface SiteDashboardProps {
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
      className="border rounded-lg p-6 hover:bg-accent/30 transition-colors cursor-pointer text-left w-full"
    >
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-base font-medium truncate flex-1">
          {post.title || '(Untitled)'}
        </p>
        {!post.synced ? (
          <CloudUpload className="h-4 w-4 text-blue-500 shrink-0" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Badge
          className={cn('text-[11px] px-2 py-0.5', pillColor)}
          variant="outline"
        >
          {pillLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(post.date ?? post.modified_local)}
        </span>
      </div>
      {post.author_name && (
        <p className="text-xs text-muted-foreground mt-1.5">{post.author_name}</p>
      )}
    </button>
  )
}

export function SiteDashboard({
  posts,
  loading,
  onSelectPost,
  onNewPost,
  onSeeAllPosts
}: SiteDashboardProps): JSX.Element {
  const { pickBackUp, existingPosts, pickBackUpTotal, existingTotal } = useMemo(() => {
    const pick: Post[] = []
    const existing: Post[] = []

    for (const post of posts) {
      if (post.status === 'trash') continue
      if (post.status === 'draft' || !post.synced) {
        pick.push(post)
      } else {
        existing.push(post)
      }
    }

    // Sort pick-back-up by modified_local desc
    pick.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())
    // Sort existing by date desc
    existing.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    return {
      pickBackUp: pick.slice(0, 6),
      existingPosts: existing.slice(0, 6),
      pickBackUpTotal: pick.length,
      existingTotal: existing.length
    }
  }, [posts])

  function getPickBackUpPill(post: Post): { label: string; color: string } {
    if (post.status === 'draft') {
      return { label: 'Draft', color: STATUS_COLORS.draft }
    }
    return { label: 'Unsynced', color: 'bg-blue-100 text-blue-800 border-blue-200' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Loading posts...</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Posts</h1>
        </div>

        {/* Quick actions */}
        <section className="mb-8">
          <div className="flex gap-3">
            <button
              onClick={onNewPost}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 hover:border-muted-foreground/50 hover:bg-accent/30 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 flex-1"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">New post</span>
            </button>
            {posts.length > 0 && (
              <button
                onClick={() => onSeeAllPosts()}
                className="border rounded-lg p-6 hover:bg-accent/30 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 flex-1"
              >
                <ChevronRight className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">See all posts</span>
              </button>
            )}
          </div>
        </section>

        {/* Pick back up */}
        {pickBackUp.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Pick back up</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pickBackUp.map((post) => {
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
            {pickBackUpTotal > 6 && (
              <button
                onClick={() => onSeeAllPosts('drafts-unsynced')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-3 transition-colors"
              >
                See more
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </section>
        )}

        {/* Edit an existing post */}
        {existingPosts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Edit an existing post</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {existingPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  pillLabel={STATUS_LABELS[post.status] || post.status}
                  pillColor={STATUS_COLORS[post.status] || ''}
                  onClick={() => onSelectPost(post.id)}
                />
              ))}
            </div>
            {existingTotal > 6 && (
              <button
                onClick={() => onSeeAllPosts('published')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-3 transition-colors"
              >
                See more
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </section>
        )}

        {/* Empty state */}
        {posts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No posts yet</p>
            <p className="text-xs mt-1">Create a new post or pull from WordPress.</p>
          </div>
        )}

      </div>
    </ScrollArea>
  )
}
