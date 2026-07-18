import { useMemo, useState, useEffect, useCallback } from 'react'
import { Plus, ChevronRight, AlertTriangle, StickyNote, Trash2, Loader2 } from 'lucide-react'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { StatusPill } from '@renderer/components/posts/StatusPill'
import { useCategoryNames, categoryLabel } from '@renderer/hooks/useCategoryNames'
import { WritingStats } from './WritingStats'
import { useWindowSize } from '@renderer/hooks/useWindowSize'
import type { Post, Scratchpad } from '@shared/types'
import type { PostListFilter } from '@renderer/components/posts/PostList'

interface SiteDashboardProps {
  siteId: string
  posts: Post[]
  loading: boolean
  onSelectPost: (id: string) => void
  onNewPost: () => void
  onSeeAllPosts: (filter?: PostListFilter) => void
  writingChartMode?: 'daily' | 'weekly'
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const now = new Date()

  // Compare calendar dates in local timezone, not raw ms difference
  const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((toDay(now) - toDay(date)) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks}w ago`
  }
  return date.toLocaleDateString()
}

function formatFutureDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()

  // Compare calendar dates in local timezone, not raw ms difference
  const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((toDay(date) - toDay(now)) / (1000 * 60 * 60 * 24))

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  if (diffDays === 0) return `Today at ${time}`
  if (diffDays === 1) return `Tomorrow at ${time}`
  if (diffDays < 7) return `${date.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`
  return `${date.toLocaleDateString()} at ${time}`
}

function PostCard({
  post,
  onClick,
  subtitle,
  categoryNames
}: {
  post: Post
  onClick: () => void
  subtitle?: string
  categoryNames: Map<number, string>
}): JSX.Element {
  const categories = categoryLabel(post.categories, categoryNames)
  return (
    <button
      onClick={onClick}
      className="border rounded-lg p-4 hover:bg-accent/30 transition-colors cursor-pointer text-left w-full"
    >
      <p className="text-sm font-medium truncate">
        {post.title || '(Untitled)'}
      </p>
      <div className="flex items-center gap-2 mt-1.5 min-w-0">
        <StatusPill
          status={post.status}
          synced={post.synced}
          conflict={post.conflict}
          hasRemote={post.wp_id != null}
        />
        <span className="text-xs text-muted-foreground truncate">
          {subtitle ?? formatRelativeDate(post.date ?? post.modified_local)}
          {categories && <> &middot; {categories}</>}
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
  onSeeAllPosts,
  writingChartMode
}: SiteDashboardProps): JSX.Element {
  const {
    pickBackUp,
    pickBackUpTotal,
    scheduledPosts,
    scheduledCount,
    hasUnsyncedScheduled,
    waitingToSync,
    waitingToSyncCount
  } = useMemo(() => {
    const pick: Post[] = []
    const scheduled: Post[] = []
    const waiting: Post[] = []

    for (const post of posts) {
      if (post.status === 'trash') continue
      if (post.status === 'future') {
        scheduled.push(post)
      } else if (post.status === 'draft' || post.status === 'pending') {
        // Unfinished writing only — published posts are done, whatever their
        // sync state (the card pill carries that)
        pick.push(post)
      } else if (!post.synced || post.conflict) {
        // Live posts with unpushed local changes (or conflicts). Drafts and
        // scheduled posts are already shown above, so no duplicate cards.
        waiting.push(post)
      }
    }

    // Sort pick-back-up + waiting-to-sync by modified_local desc
    pick.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())
    waiting.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())

    // Sort scheduled by date asc (soonest first)
    scheduled.sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime())

    return {
      pickBackUp: pick.slice(0, 6),
      pickBackUpTotal: pick.length,
      scheduledPosts: scheduled.slice(0, 3),
      scheduledCount: scheduled.length,
      hasUnsyncedScheduled: scheduled.some((p) => !p.synced),
      waitingToSync: waiting.slice(0, 3),
      waitingToSyncCount: waiting.length
    }
  }, [posts])

  // Scratchpads — direct access from home; open in the pop-out window
  const [scratchpads, setScratchpads] = useState<Scratchpad[]>([])
  const loadScratchpads = useCallback(async () => {
    try {
      const all = await window.electronAPI.getScratchpads(siteId)
      all.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())
      setScratchpads(all)
    } catch {
      setScratchpads([])
    }
  }, [siteId])

  useEffect(() => {
    loadScratchpads()
  }, [loadScratchpads])

  // Keep titles/dates fresh while a pop-out is being edited
  useEffect(() => {
    return window.electronAPI.onScratchpadChanged(() => loadScratchpads())
  }, [loadScratchpads])

  const [deletingScratchpad, setDeletingScratchpad] = useState<Scratchpad | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const handleDeleteScratchpad = useCallback(async () => {
    if (!deletingScratchpad) return
    setDeletingBusy(true)
    try {
      await window.electronAPI.deleteScratchpad(deletingScratchpad.id)
      await loadScratchpads()
    } finally {
      setDeletingBusy(false)
      setDeletingScratchpad(null)
    }
  }, [deletingScratchpad, loadScratchpads])

  const handleNewScratchpad = useCallback(async () => {
    const sp = await window.electronAPI.createScratchpad({ site_id: siteId, title: 'Untitled' })
    await window.electronAPI.openScratchpadWindow(sp.id)
    loadScratchpads()
  }, [siteId, loadScratchpads])

  const categoryNames = useCategoryNames(siteId)
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
        {/* Writing Stats */}
        <WritingStats siteId={siteId} compact={compact} chartMode={writingChartMode} />

        {/* Quick actions */}
        <section className={compact ? 'mb-3' : 'mb-5'}>
          <div className="flex gap-2.5">
            <button
              onClick={onNewPost}
              className="border-2 border-dashed border-green-400/50 rounded-lg p-4 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors cursor-pointer flex items-center justify-center gap-2 flex-1"
            >
              <Plus className="h-5 w-5 text-green-600 dark:text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-500">New post</span>
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

        {/* Pick back up */}
        {visibleCards.length > 0 && (
          <section className={compact ? 'mb-3' : 'mb-5'}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-muted-foreground">Pick back up</h2>
              {hasMoreCards && (
                <button
                  onClick={() => onSeeAllPosts('drafts')}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  See all
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleCards.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  categoryNames={categoryNames}
                  onClick={() => onSelectPost(post.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Waiting to sync — only when live posts have unpushed changes */}
        {waitingToSync.length > 0 && (
          <section className={compact ? 'mb-3' : 'mb-5'}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-muted-foreground">Waiting to sync</h2>
              {waitingToSyncCount > waitingToSync.length && (
                <button
                  onClick={() => onSeeAllPosts('unsynced')}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  See all
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {waitingToSync.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  categoryNames={categoryNames}
                  onClick={() => onSelectPost(post.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Publishing soon */}
        <section className={compact ? 'mb-3' : 'mb-5'}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">Publishing soon</h2>
            {scheduledCount > 0 ? (
              <button
                onClick={() => onSeeAllPosts('scheduled')}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                See all
                <ChevronRight className="h-3 w-3" />
              </button>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground/50">
                See all
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
          {scheduledPosts.length > 0 ? (
            <>
              {hasUnsyncedScheduled && (
                <div className="flex items-start gap-2 mb-2 rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    There are unsynchronized scheduled posts. They may not go live as scheduled.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {scheduledPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    categoryNames={categoryNames}
                    onClick={() => onSelectPost(post.id)}
                    subtitle={post.date ? formatFutureDate(post.date) : undefined}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="border border-dashed rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">No scheduled posts</p>
            </div>
          )}
        </section>

        {/* Scratchpads */}
        <section className={compact ? 'mb-3' : 'mb-5'}>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Scratchpads</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Dummy "new scratchpad" tile — mirrors the New post pattern */}
            <button
              onClick={handleNewScratchpad}
              className="border-2 border-dashed border-green-400/50 rounded-lg p-3 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors cursor-pointer flex items-center justify-center gap-2 min-h-[60px]"
            >
              <Plus className="h-4 w-4 text-green-600 dark:text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-500">
                New scratchpad
              </span>
            </button>
            {scratchpads.slice(0, compact ? 2 : 5).map((sp) => (
              <div
                key={sp.id}
                role="button"
                tabIndex={0}
                onClick={() => window.electronAPI.openScratchpadWindow(sp.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') window.electronAPI.openScratchpadWindow(sp.id)
                }}
                className="group relative border rounded-lg p-3 hover:bg-accent/30 transition-colors cursor-pointer text-left w-full"
                title="Open in scratchpad window"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate flex-1">
                    {sp.title || '(Untitled)'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-[22px]">
                  {formatRelativeDate(sp.modified_local)}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingScratchpad(sp)
                  }}
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  title="Delete scratchpad"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <Dialog
          open={deletingScratchpad !== null}
          onOpenChange={(open) => { if (!open) setDeletingScratchpad(null) }}
        >
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Delete scratchpad</DialogTitle>
              <DialogDescription>
                Delete &ldquo;{deletingScratchpad?.title || 'Untitled'}&rdquo;?
                {deletingScratchpad?.wp_id != null
                  ? ' It will also be removed from WordPress on the next sync.'
                  : ' It has never been synced, so it will be removed immediately.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingScratchpad(null)} disabled={deletingBusy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteScratchpad} disabled={deletingBusy}>
                {deletingBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
