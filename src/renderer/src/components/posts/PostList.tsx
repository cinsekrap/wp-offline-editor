import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Loader2,
  Filter, ArrowUpDown, Search, X, CheckSquare
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { FILTER_STATUSES } from '@renderer/lib/post-status'
import { StatusPill } from './StatusPill'
import type { Post, PostStatus, SearchResult } from '@shared/types'

/** Strip all HTML tags except <mark> from FTS5 snippets to prevent XSS. */
function sanitizeSnippet(html: string): string {
  return html.replace(/<(?!\/?mark\b)[^>]*>/gi, '')
}

type SortOption = 'date' | 'modified_local' | 'title'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date', label: 'Date published' },
  { value: 'modified_local', label: 'Last edited' },
  { value: 'title', label: 'Title A\u2013Z' }
]

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Not published'

  const date = new Date(dateStr)
  const now = new Date()
  // Compare calendar dates in local timezone, not raw ms difference
  const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((toDay(now) - toDay(date)) / (1000 * 60 * 60 * 24))

  // Scheduled posts have future dates
  if (diffDays < 0) {
    const ahead = -diffDays
    if (ahead === 1) return 'Tomorrow'
    if (ahead < 30) return `In ${ahead} days`
    return date.toLocaleDateString()
  }

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return 'Last month'
  if (diffMonths < 12) return `${diffMonths} months ago`
  const diffYears = Math.floor(diffDays / 365)
  return diffYears <= 1 ? 'Last year' : `${diffYears} years ago`
}

export type PostListFilter = 'drafts' | 'published' | 'scheduled' | 'unsynced'

interface PostListProps {
  posts: Post[]
  loading: boolean
  siteId: string
  onSelectPost: (id: string) => void
  onNewPost: () => void
  initialFilter?: PostListFilter | null
  onBulkStatus?: (postIds: string[], status: PostStatus) => Promise<void>
  onBulkDelete?: (postIds: string[]) => Promise<void>
}

export function PostList({
  posts,
  loading,
  siteId,
  onSelectPost,
  onNewPost,
  initialFilter,
  onBulkStatus,
  onBulkDelete
}: PostListProps): JSX.Element {
  const [activeFilters, setActiveFilters] = useState<Set<PostStatus>>(new Set())
  const [activeAuthorFilters, setActiveAuthorFilters] = useState<Set<number>>(new Set())
  const [syncFilter, setSyncFilter] = useState<'all' | 'synced' | 'unsynced'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date')

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Closing the search bar clears the query so hidden results don't linger
  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) setSearchQuery('')
      return !prev
    })
  }, [])

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'publish' | 'delete' | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!searchQuery.trim()) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await window.electronAPI.searchPosts(searchQuery.trim(), siteId)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, siteId])

  // Exit select mode clears selection
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }, [])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Apply initial filter from dashboard navigation
  const appliedFilterRef = useRef<PostListFilter | null | undefined>(undefined)
  useEffect(() => {
    if (initialFilter && initialFilter !== appliedFilterRef.current) {
      appliedFilterRef.current = initialFilter
      if (initialFilter === 'drafts') {
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
      } else if (initialFilter === 'unsynced') {
        setActiveFilters(new Set<PostStatus>())
        setSyncFilter('unsynced')
        setSortBy('modified_local')
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
    if (initialFilter === 'drafts') {
      base = posts.filter((p) => p.status === 'draft' || p.status === 'pending')
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

  const allSelected = selectMode && filteredAndSorted.length > 0 && filteredAndSorted.every((p) => selectedIds.has(p.id))

  function toggleSelectAll(): void {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSorted.map((p) => p.id)))
    }
  }

  async function handleBulkDraft(): Promise<void> {
    if (!onBulkStatus || selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await onBulkStatus([...selectedIds], 'draft')
      setSelectedIds(new Set())
      setSelectMode(false)
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkConfirm(): Promise<void> {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      if (bulkAction === 'publish' && onBulkStatus) {
        await onBulkStatus([...selectedIds], 'publish')
      } else if (bulkAction === 'delete' && onBulkDelete) {
        await onBulkDelete([...selectedIds])
      }
      setSelectedIds(new Set())
      setSelectMode(false)
    } finally {
      setBulkLoading(false)
      setBulkAction(null)
    }
  }

  // Render search results
  const isSearching = searchQuery.trim().length > 0
  const showSearchResults = isSearching && searchResults !== null

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <h2 className="text-lg font-semibold">Posts</h2>
        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 relative', searchOpen && 'bg-accent')}
            onClick={toggleSearch}
            title={searchOpen ? 'Close search' : 'Search posts'}
          >
            <Search className="h-4 w-4" />
            {searchQuery.trim() && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
            )}
          </Button>

          {/* Select mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', selectMode && 'bg-accent')}
            onClick={toggleSelectMode}
            title={selectMode ? 'Exit select mode' : 'Select posts'}
          >
            <CheckSquare className="h-4 w-4" />
          </Button>

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

      {/* Search bar (toggled from the header icon) */}
      {searchOpen && (
        <div className="px-6 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') toggleSearch()
              }}
              placeholder="Search posts..."
              className="pl-8 pr-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Select-all bar */}
      {selectMode && !isSearching && (
        <div className="flex items-center gap-2 px-6 py-1.5 border-b shrink-0 bg-accent/30">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <div className={cn(
              'h-4 w-4 rounded border flex items-center justify-center',
              allSelected ? 'bg-foreground border-foreground' : 'border-border'
            )}>
              {allSelected && <CheckSquare className="h-3 w-3 text-background" />}
            </div>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          )}
        </div>
      )}

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : showSearchResults ? (
          // Search results
          searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults!.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No results for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          ) : (
            <div className="py-2">
              {searchResults!.map((result) => (
                <button
                  key={result.post_id}
                  onClick={() => onSelectPost(result.post_id)}
                  className="w-full text-left px-6 py-3 transition-colors hover:bg-accent/50"
                >
                  <p
                    className="text-sm font-medium truncate [&_mark]:bg-yellow-200 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-800"
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.title) }}
                  />
                  <p
                    className="text-xs text-muted-foreground mt-1 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-800"
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                  />
                </button>
              ))}
            </div>
          )
        ) : isSearching && searching ? (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 px-6 py-4">
            {filteredAndSorted.map((post) => {
              // Drafts and pending posts read as tentative; published/scheduled/private are "definite"
              const definite = post.status !== 'draft' && post.status !== 'pending'
              return (
                <button
                  key={post.id}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelected(post.id)
                    } else {
                      onSelectPost(post.id)
                    }
                  }}
                  className={cn(
                    'border rounded-lg p-4 text-left transition-colors flex flex-col',
                    definite
                      ? 'bg-card hover:bg-accent/30'
                      : 'bg-muted/40 border-border/70 hover:bg-muted/70',
                    selectMode && selectedIds.has(post.id) && 'ring-2 ring-foreground/40 bg-accent/40'
                  )}
                >
                  {/* Eyebrow: date (+ checkbox in select mode) */}
                  <div className="flex items-center gap-2 min-w-0">
                    {selectMode && (
                      <div
                        className={cn(
                          'h-4 w-4 rounded border shrink-0 flex items-center justify-center',
                          selectedIds.has(post.id)
                            ? 'bg-foreground border-foreground'
                            : 'border-border'
                        )}
                        onClick={(e) => { e.stopPropagation(); toggleSelected(post.id) }}
                      >
                        {selectedIds.has(post.id) && (
                          <svg className="h-3 w-3 text-background" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    )}
                    <span className="text-[11px] text-muted-foreground flex-1 truncate">
                      {getDisplayDate(post)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'text-sm line-clamp-2 min-h-10 mt-1.5',
                      definite ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                    )}
                  >
                    {post.title || '(Untitled)'}
                  </p>
                  <div className="mt-2">
                    <StatusPill
                      status={post.status}
                      synced={post.synced}
                      conflict={post.conflict}
                      hasRemote={post.wp_id != null}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && !bulkAction && (
        <div className="absolute bottom-4 left-4 right-4 rounded-lg shadow-lg bg-background border p-3 flex items-center gap-2 z-10">
          <span className="text-sm font-medium flex-1">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={handleBulkDraft} disabled={bulkLoading}>
            Draft
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkAction('publish')} disabled={bulkLoading}>
            Publish
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkAction('delete')} disabled={bulkLoading}>
            Delete
          </Button>
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectMode(false) }}
            className="text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk confirmation bar */}
      {bulkAction && (
        <div className="absolute bottom-4 left-4 right-4 rounded-lg shadow-lg bg-background border p-3 z-10">
          <p className="text-sm mb-2">
            {bulkAction === 'publish'
              ? `Publish ${selectedIds.size} post${selectedIds.size > 1 ? 's' : ''}? They will be pushed to WordPress on next sync.`
              : `Delete ${selectedIds.size} post${selectedIds.size > 1 ? 's' : ''}? They will be removed locally and deleted from WordPress on the next sync.`}
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setBulkAction(null)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={bulkAction === 'delete' ? 'destructive' : 'default'}
              onClick={handleBulkConfirm}
              disabled={bulkLoading}
            >
              {bulkLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {bulkAction === 'publish' ? 'Publish' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
