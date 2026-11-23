import { useMemo } from 'react'
import { ChevronRight, AlertTriangle, PenLine } from 'lucide-react'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Button } from '@renderer/components/ui/button'
import { PostCard } from '@renderer/components/posts/PostCard'
import { StatusGlyph } from '@renderer/components/posts/StatusMark'
import { useCategoryNames, categoryLabel } from '@renderer/hooks/useCategoryNames'
import { useFeaturedImages } from '@renderer/hooks/useFeaturedImages'
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
  writingChartMode?: 'daily' | 'weekly'
}

const toDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY_MS = 86_400_000

function relativeDay(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const diff = Math.round((toDay(new Date()) - toDay(date)) / DAY_MS)
  if (diff === 0) {
    const mins = Math.round((Date.now() - date.getTime()) / 60000)
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
    return `${Math.round(mins / 60)} h ago`
  }
  if (diff === 1) return 'yesterday'
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const asWord = (n: number): string => NUMBER_WORDS[n] ?? String(n)

/** One sentence that says what's going on: drafts in hand and what's going out next. */
function summarySentence(drafts: number, next: Post | null): { lead: string; accent?: string } {
  const lead =
    drafts === 0
      ? 'Nothing in draft'
      : `${asWord(drafts)} draft${drafts === 1 ? '' : 's'} in progress`
  if (!next?.date) {
    return { lead: drafts === 0 ? 'A clean slate. Nothing in draft, nothing scheduled.' : `${lead}.` }
  }
  const when = new Date(next.date)
  const days = Math.round((toDay(when) - toDay(new Date())) / DAY_MS)
  const day =
    days === 0
      ? 'later today'
      : days === 1
        ? 'tomorrow'
        : days < 7
          ? `on ${when.toLocaleDateString(undefined, { weekday: 'long' })}`
          : `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
  return { lead: `${lead}, and `, accent: `the next post goes out ${day}.` }
}

function SectionHeader({
  title,
  count,
  onSeeAll
}: {
  title: string
  count?: number
  onSeeAll?: () => void
}): JSX.Element {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold">
        {title}
        {count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground">{count}</span>}
      </h2>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/** A dated row for the Coming up / Recently published lists. */
function DatedRow({
  post,
  categoryNames,
  onClick,
  future
}: {
  post: Post
  categoryNames: Map<number, string>
  onClick: () => void
  future?: boolean
}): JSX.Element {
  const date = post.date ? new Date(post.date) : null
  const category = categoryLabel(post.categories, categoryNames)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/15"
    >
      <span className="w-11 shrink-0 rounded-lg bg-canvas py-1 text-center">
        <span
          className={`block text-[9.5px] font-bold uppercase tracking-wider ${future ? 'text-status-scheduled' : 'text-muted-foreground'}`}
        >
          {date ? date.toLocaleDateString(undefined, { weekday: 'short' }) : '—'}
        </span>
        <span className="block text-[17px] font-semibold leading-tight tabular-nums">
          {date ? date.getDate() : ''}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-editor text-[14.5px] font-semibold leading-snug">
          {post.title || 'Untitled'}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
          <StatusGlyph status={post.status} />
          {future && date
            ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
            : date?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          {category && <> · {category}</>}
          {!post.synced && <span className="font-semibold text-primary"> · Not synced</span>}
        </span>
      </span>
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
  const { drafts, scheduled, published, waiting, hasUnsyncedScheduled } = useMemo(() => {
    const drafts: Post[] = []
    const scheduled: Post[] = []
    const published: Post[] = []
    const waiting: Post[] = []
    for (const post of posts) {
      if (post.status === 'trash') continue
      if (post.status === 'future') scheduled.push(post)
      else if (post.status === 'draft' || post.status === 'pending') drafts.push(post)
      else {
        if (post.status === 'publish') published.push(post)
        // Live posts with unpushed local changes or conflicts
        if (!post.synced || post.conflict) waiting.push(post)
      }
    }
    const byModified = (a: Post, b: Post): number =>
      new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime()
    drafts.sort(byModified)
    waiting.sort(byModified)
    scheduled.sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime())
    published.sort((a, b) => new Date(b.date ?? '').getTime() - new Date(a.date ?? '').getTime())
    return {
      drafts,
      scheduled,
      published,
      waiting,
      hasUnsyncedScheduled: scheduled.some((p) => !p.synced)
    }
  }, [posts])

  const categoryNames = useCategoryNames(siteId)
  const images = useFeaturedImages(siteId, posts)
  const { height } = useWindowSize()
  // On shorter windows, one row of cards instead of two
  const compact = height < 760
  const cardCount = compact ? 3 : 6

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-7 space-y-7" aria-label="Loading">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-3/5" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const sentence = summarySentence(drafts.length, scheduled[0] ?? null)
  const meta = (p: Post): string => {
    const category = categoryLabel(p.categories, categoryNames)
    return [relativeDay(p.modified_local), category].filter(Boolean).join(' · ')
  }

  if (posts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <PenLine className="size-5" />
        </div>
        <div>
          <p className="font-editor text-2xl font-semibold">A blank page</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a post here, or sync to bring in what&rsquo;s already on WordPress.
          </p>
        </div>
        <Button onClick={onNewPost}>New post</Button>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className={`mx-auto max-w-5xl px-8 ${compact ? 'py-5 space-y-5' : 'py-7 space-y-7'}`}>
        {/* What's going on, in a sentence */}
        <header>
          <p className="text-xs font-medium text-muted-foreground">{today}</p>
          <p className="mt-1 max-w-[34ch] font-editor text-[26px] font-semibold leading-tight tracking-[-0.01em] text-balance">
            {sentence.lead}
            {sentence.accent && <span className="text-primary">{sentence.accent}</span>}
          </p>
        </header>

        <WritingStats siteId={siteId} compact={compact} chartMode={writingChartMode} />

        {drafts.length > 0 && (
          <section>
            <SectionHeader
              title="Pick back up"
              count={drafts.length}
              onSeeAll={drafts.length > cardCount ? () => onSeeAllPosts('drafts') : undefined}
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.slice(0, cardCount).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  imageUrl={images[post.id]}
                  meta={meta(post)}
                  onClick={() => onSelectPost(post.id)}
                />
              ))}
            </div>
          </section>
        )}

        {waiting.length > 0 && (
          <section>
            <SectionHeader
              title="Changed, not yet on WordPress"
              count={waiting.length}
              onSeeAll={waiting.length > 3 ? () => onSeeAllPosts('unsynced') : undefined}
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {waiting.slice(0, 3).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  imageUrl={images[post.id]}
                  meta={meta(post)}
                  onClick={() => onSelectPost(post.id)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <SectionHeader
              title="Coming up"
              count={scheduled.length || undefined}
              onSeeAll={scheduled.length > 3 ? () => onSeeAllPosts('scheduled') : undefined}
            />
            {hasUnsyncedScheduled && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <p className="text-xs text-foreground/85">
                  A scheduled post isn&rsquo;t on WordPress yet. It won&rsquo;t go out on time unless you sync first.
                </p>
              </div>
            )}
            {scheduled.length > 0 ? (
              <div className="space-y-2">
                {scheduled.slice(0, 3).map((post) => (
                  <DatedRow
                    key={post.id}
                    post={post}
                    future
                    categoryNames={categoryNames}
                    onClick={() => onSelectPost(post.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                Nothing scheduled. Set a publish date in a post&rsquo;s details to plan ahead.
              </p>
            )}
          </section>

          <section>
            <SectionHeader
              title="Recently published"
              onSeeAll={published.length > 3 ? () => onSeeAllPosts('published') : undefined}
            />
            {published.length > 0 ? (
              <div className="space-y-2">
                {published.slice(0, 3).map((post) => (
                  <DatedRow
                    key={post.id}
                    post={post}
                    categoryNames={categoryNames}
                    onClick={() => onSelectPost(post.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                Nothing published yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </ScrollArea>
  )
}
