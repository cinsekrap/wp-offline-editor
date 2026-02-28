import { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, Loader2, AlertTriangle, CheckCircle, CloudUpload, Filter, ArrowUpDown } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import type { Post, PostStatus } from '@shared/types'

const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800 border-green-200',
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-orange-100 text-orange-800 border-orange-200',
  private: 'bg-purple-100 text-purple-800 border-purple-200',
  future: 'bg-blue-100 text-blue-800 border-blue-200',
  trash: 'bg-red-100 text-red-800 border-red-200'
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  publish: 'Published',
  pending: 'Pending',
  private: 'Private',
  future: 'Scheduled',
  trash: 'Trash'
}

type SortOption = 'date' | 'modified_local' | 'title'

const FILTER_STATUSES: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'publish', label: 'Published' },
  { value: 'private', label: 'Private' }
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date', label: 'Date published' },
  { value: 'modified_local', label: 'Last edited' },
  { value: 'title', label: 'Title A\u2013Z' }
]

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Not published'

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

export type PostListFilter = 'drafts-unsynced' | 'published' | 'scheduled'

interface PostListProps {
  posts: Post[]
  loading: boolean
  onSelectPost: (id: string) => void
  onNewPost: () => void
  initialFilter?: PostListFilter | null
}

export function PostList({
  posts,
  loading,
  onSelectPost,
  onNewPost,
  initialFilter
}: PostListProps): JSX.Element {
  const [activeFilters, setActiveFilters] = useState<Set<PostStatus>>(new Set())
  const [activeAuthorFilters, setActiveAuthorFilters] = useState<Set<number>>(new Set())
  const [syncFilter, setSyncFilter] = useState<'all' | 'synced' | 'unsynced'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date')

  // Apply initial filter from dashboard navigation
  const appliedFilterRef = useRef<PostListFilter | null | undefined>(undefined)
  useEffect(() => {
    if (initialFilter && initialFilter !== appliedFilterRef.current) {
      appliedFilterRef.current = initialFilter
      if (initialFilter === 'drafts-unsynced') {
        setActiveFilters(new Set<PostStatus>())
        setSyncFilter('all')
        setSortBy('modified_local')
      } else if (initialFilter === 'published') {
        setActiveFilters(new Set<PostStatus>(['publish', 'pending', 'private', 'future']))
        setSyncFilter('all')
        setSortBy('date')
      } else if (initialFilter === 'scheduled') {
        setActiveFilters(new Set<PostStatus>(['future']))
        setSyncFilter('all')
        setSortBy('date')
      }
    }
  }, [initialFilter])

  const uniqueAuthors = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of posts) {
      if (p.author_id != null && p.author_name) {
        map.set(p.author_id, p.author_name)
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [posts])

  function toggleFilter(status: PostStatus): void {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  function toggleAuthorFilter(authorId: number): void {
    setActiveAuthorFilters((prev) => {
      const next = new Set(prev)
      if (next.has(authorId)) {
        next.delete(authorId)
      } else {
        next.add(authorId)
      }
      return next
    })
  }

  const filteredAndSorted = useMemo(() => {
    let base = posts
    if (initialFilter === 'drafts-unsynced') {
      base = posts.filter((p) => p.status === 'draft' || !p.synced)
    }

    let result = activeFilters.size === 0 ? base : base.filter((p) => activeFilters.has(p.status))
    if (activeAuthorFilters.size > 0) {
      result = result.filter((p) => p.author_id != null && activeAuthorFilters.has(p.author_id))
    }
    if (syncFilter === 'synced') {
      result = result.filter((p) => p.synced)
    } else if (syncFilter === 'unsynced') {
      result = result.filter((p) => !p.synced)
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'date': {
          if (!a.date && !b.date) return 0
          if (!a.date) return 1
          if (!b.date) return -1
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        }
        case 'modified_local':
          return new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime()
        case 'title':
          return (a.title || '').localeCompare(b.title || '')
      }
    })

    return result
  }, [posts, activeFilters, activeAuthorFilters, syncFilter, sortBy, initialFilter])

  function getDisplayDate(post: Post): string {
    switch (sortBy) {
      case 'date':
        return formatRelativeDate(post.date)
      case 'modified_local':
        return formatRelativeDate(post.modified_local)
      case 'title':
        return formatRelativeDate(post.date ?? post.modified_local)
    }
  }

  const hasActiveFilters = activeFilters.size > 0 || activeAuthorFilters.size > 0 || syncFilter !== 'all'

  function clearAllFilters(): void {
    setActiveFilters(new Set())
    setActiveAuthorFilters(new Set())
    setSyncFilter('all')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <h2 className="text-lg font-semibold">Posts</h2>
        <div className="flex items-center gap-1">
          {/* Filter popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Filter by status">
                <Filter className="h-4 w-4" />
                {hasActiveFilters && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Filter by status</p>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_STATUSES.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => toggleFilter(f.value)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors',
                      activeFilters.has(f.value)
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {uniqueAuthors.length > 1 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground mb-2 mt-3">Author</p>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueAuthors.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => toggleAuthorFilter(a.id)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded-full border transition-colors',
                          activeAuthorFilters.has(a.id)
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                        )}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="text-xs font-medium text-muted-foreground mb-2 mt-3">Sync status</p>
              <div className="flex flex-wrap gap-1.5">
                {(['synced', 'unsynced'] as const).map((val) => (
                  <button
                    key={val}
                    onClick={() => setSyncFilter((prev) => (prev === val ? 'all' : val))}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors',
                      syncFilter === val
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                    )}
                  >
                    {val === 'synced' ? 'Synced' : 'Not synced'}
                  </button>
                ))}
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-[11px] text-muted-foreground hover:text-foreground mt-2"
                >
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Sort popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Sort posts">
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 px-2">Sort by</p>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors',
                    sortBy === opt.value
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={onNewPost}>
            <Plus className="h-4 w-4 mr-1.5" />
            New post
          </Button>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">
              {hasActiveFilters ? 'No matching posts' : 'No posts yet'}
            </p>
            {!hasActiveFilters && (
              <p className="text-xs mt-1">Create a new post or pull from WordPress.</p>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs mt-1 underline hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-2">
            {filteredAndSorted.map((post) => (
              <button
                key={post.id}
                onClick={() => onSelectPost(post.id)}
                className="w-full text-left px-6 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium truncate flex-1">
                    {post.title || '(Untitled)'}
                  </p>
                  {post.conflict && (
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  )}
                  {!post.synced && !post.conflict && (
                    <CloudUpload className="h-3.5 w-3.5 text-blue-500 shrink-0" title="Not synced" />
                  )}
                  {post.synced && !post.conflict && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_COLORS[post.status] || '')} variant="outline">
                    {STATUS_LABELS[post.status] || post.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {getDisplayDate(post)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
