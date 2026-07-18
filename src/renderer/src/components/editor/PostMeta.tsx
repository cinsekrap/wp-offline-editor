import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Label } from '@renderer/components/ui/label'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Badge } from '@renderer/components/ui/badge'
import { CalendarIcon, ImageIcon, X, Upload, Loader2, Lock, Globe, KeyRound, AlertTriangle, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import { STATUS_COLORS, STATUS_LABELS } from '@renderer/lib/post-status'
import type { PostStatus, Media, TaxonomyTerm } from '@shared/types'

type Visibility = 'public' | 'private' | 'password'

interface PostMetaProps {
  status: PostStatus
  scheduledDate: Date | undefined
  onStatusChange: (status: PostStatus) => void
  onDateChange: (date: Date | undefined) => void
  featuredImage: string | null
  onFeaturedImageChange: (mediaId: string | null) => void
  excerpt: string
  slug: string
  onExcerptChange: (value: string) => void
  onSlugChange: (value: string) => void
  categories: number[]
  tags: number[]
  onCategoriesChange: (ids: number[]) => void
  onTagsChange: (ids: number[]) => void
  siteId: string
  postId: string
  mediaItems: Media[]
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', icon: Globe },
  { value: 'private', label: 'Private', icon: Lock },
  { value: 'password', label: 'Password Protected', icon: KeyRound }
]

/** Derive visibility from internal PostStatus */
function toVisibility(status: PostStatus): Visibility {
  if (status === 'private') return 'private'
  return 'public'
}

/** Is this a "published" family status? */
function isPublished(status: PostStatus): boolean {
  return status === 'publish' || status === 'future' || status === 'private'
}

/** Resolve internal PostStatus from visibility + date (for published posts) */
function resolvePublishedStatus(visibility: Visibility, date: Date | undefined): PostStatus {
  if (visibility === 'private') return 'private'
  if (date && date.getTime() > Date.now()) return 'future'
  return 'publish'
}

export function PostMeta({
  status,
  scheduledDate,
  onStatusChange,
  onDateChange,
  featuredImage,
  onFeaturedImageChange,
  excerpt,
  slug,
  onExcerptChange,
  onSlugChange,
  categories,
  tags,
  onCategoriesChange,
  onTagsChange,
  siteId,
  postId,
  mediaItems
}: PostMetaProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Derived state
  const [visibility, setVisibility] = useState<Visibility>(() => toVisibility(status))
  const [dateExpanded, setDateExpanded] = useState(!!scheduledDate)
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)

  // "Publish later" staging: pick a date before committing to scheduled status
  const [scheduling, setScheduling] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date | undefined>(undefined)

  const published = isPublished(status)

  // Sync from parent when post loads
  useEffect(() => {
    setVisibility(toVisibility(status))
    setDateExpanded(!!scheduledDate)
    setScheduling(false)
  }, [status, scheduledDate])

  const handlePublishImmediately = useCallback(() => {
    setPublishConfirmOpen(false)
    onDateChange(undefined)
    onStatusChange(resolvePublishedStatus(visibility, undefined))
  }, [visibility, onDateChange, onStatusChange])

  const handlePublishLater = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    setPendingDate(tomorrow)
    setScheduling(true)
  }, [])

  const handleConfirmSchedule = useCallback(() => {
    if (!pendingDate) return
    onDateChange(pendingDate)
    onStatusChange(resolvePublishedStatus(visibility, pendingDate))
    setScheduling(false)
  }, [pendingDate, visibility, onDateChange, onStatusChange])

  const handleCancelSchedule = useCallback(() => {
    setScheduling(false)
    setPendingDate(undefined)
  }, [])

  const handleVisibilityChange = useCallback((newVisibility: Visibility) => {
    setVisibility(newVisibility)
    setVisibilityOpen(false)
    if (published) {
      onStatusChange(resolvePublishedStatus(newVisibility, scheduledDate))
    }
  }, [published, scheduledDate, onStatusChange])

  const handleDateChange = useCallback((date: Date | undefined) => {
    onDateChange(date)
    if (published) {
      onStatusChange(resolvePublishedStatus(visibility, date))
    }
  }, [published, visibility, onDateChange, onStatusChange])

  const handleRevertToDraft = useCallback(() => {
    setDateExpanded(false)
    onDateChange(undefined)
    onStatusChange('draft')
  }, [onDateChange, onStatusChange])

  // Taxonomy term caches
  const [categoryTerms, setCategoryTerms] = useState<TaxonomyTerm[]>([])
  const [tagTerms, setTagTerms] = useState<TaxonomyTerm[]>([])
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    window.electronAPI.getTaxonomyTerms(siteId, 'category').then(setCategoryTerms).catch(() => {})
    window.electronAPI.getTaxonomyTerms(siteId, 'post_tag').then(setTagTerms).catch(() => {})
  }, [siteId])

  // Add a newly-created (pending) term to the local cache so its chip renders
  const handleTermCreated = useCallback((term: TaxonomyTerm) => {
    const setter = term.taxonomy === 'category' ? setCategoryTerms : setTagTerms
    setter((prev) => (prev.some((t) => t.id === term.id) ? prev : [...prev, term]))
  }, [])

  // Find the media item for the current featured image
  const featuredMedia = featuredImage
    ? mediaItems.find((m) => m.id === featuredImage) ?? null
    : null

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setUploading(true)
      try {
        const buffer = await file.arrayBuffer()
        const media = await window.electronAPI.saveMediaLocal(siteId, postId, file.name, buffer)
        onFeaturedImageChange(media.id)
        setPickerOpen(false)
      } finally {
        setUploading(false)
        // Reset file input so re-selecting same file triggers change event
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [siteId, postId, onFeaturedImageChange]
  )

  const handlePickFromLibrary = useCallback(
    (mediaId: string) => {
      onFeaturedImageChange(mediaId)
      setPickerOpen(false)
    },
    [onFeaturedImageChange]
  )

  return (
    <ScrollArea className="flex-1">
    <div className="space-y-4 p-4">
      {/* Status */}
      <div className="space-y-1.5">
        {!published ? (
          <>
            <div className="w-full h-8 flex items-center justify-center rounded-md border text-sm">
              <Badge
                variant="outline"
                className={cn('text-xs border-0', STATUS_COLORS[status] ?? STATUS_COLORS.draft)}
              >
                {STATUS_LABELS[status] ?? 'Draft'}
              </Badge>
            </div>

            {/* Publish actions */}
            <div className="space-y-1.5">
              {!scheduling && (
                <Popover open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="default" size="sm" className="w-full h-8 text-sm">
                      Publish immediately
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-3">
                    <div className="flex gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        This post will go <strong>live on your site</strong> at the next sync. Are you sure?
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => setPublishConfirmOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={handlePublishImmediately}
                      >
                        Publish
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {!scheduling && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-sm"
                  onClick={handlePublishLater}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  Publish later
                </Button>
              )}
            </div>

            {/* Schedule date picker (shown before committing) */}
            {scheduling && pendingDate && (
              <div className="space-y-2 border rounded-md p-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Schedule for
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 w-full justify-start text-left text-sm font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(pendingDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={pendingDate}
                      onSelect={(d) => d && setPendingDate(prev => {
                        const next = new Date(d)
                        if (prev) {
                          next.setHours(prev.getHours(), prev.getMinutes())
                        }
                        return next
                      })}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="h-8 text-sm"
                  value={format(pendingDate, 'HH:mm')}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':').map(Number)
                    const next = new Date(pendingDate)
                    next.setHours(hours, minutes)
                    setPendingDate(next)
                  }}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={handleCancelSchedule}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={handleConfirmSchedule}
                  >
                    Schedule
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="w-full h-8 flex items-center justify-center rounded-md border text-sm">
              <Badge
                variant="outline"
                className={cn('text-xs border-0', STATUS_COLORS[status] ?? STATUS_COLORS.publish)}
              >
                {STATUS_LABELS[status] ?? 'Published'}
              </Badge>
            </div>
            {status === 'future' && scheduledDate && (
              <p className="text-xs text-muted-foreground text-center">
                {format(scheduledDate, 'PPP')} at {format(scheduledDate, 'p')}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-sm"
              onClick={handleRevertToDraft}
            >
              Revert to draft
            </Button>
          </div>
        )}
      </div>

      {/* Publish date (only when published with a date or scheduling) */}
      {published && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Publish Date
          </Label>
          {!dateExpanded && !scheduledDate ? (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setDateExpanded(true)
                handleDateChange(new Date())
              }}
            >
              Immediately
              <span className="ml-1.5 text-xs text-primary hover:underline">(change)</span>
            </button>
          ) : (
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'h-8 w-full justify-start text-left text-sm font-normal',
                      !scheduledDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={scheduledDate} onSelect={handleDateChange} />
                </PopoverContent>
              </Popover>
              {scheduledDate && (
                <Input
                  type="time"
                  className="h-8 text-sm"
                  value={format(scheduledDate, 'HH:mm')}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':').map(Number)
                    const next = new Date(scheduledDate)
                    next.setHours(hours, minutes)
                    handleDateChange(next)
                  }}
                />
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-sm"
                onClick={() => {
                  setDateExpanded(false)
                  handleDateChange(undefined)
                }}
              >
                Reset to immediately
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Visibility */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Visibility
        </Label>
        <Popover open={visibilityOpen} onOpenChange={setVisibilityOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-8 w-full justify-start text-left text-sm font-normal"
            >
              {(() => {
                const opt = VISIBILITY_OPTIONS.find((v) => v.value === visibility)!
                const Icon = opt.icon
                return (
                  <>
                    <Icon className="mr-2 h-3.5 w-3.5" />
                    {opt.label}
                  </>
                )
              })()}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-1">
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground',
                    visibility === opt.value && 'bg-accent'
                  )}
                  onClick={() => handleVisibilityChange(opt.value)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Slug
        </Label>
        <Input
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="post-url-slug"
          className="h-8 text-sm font-mono"
        />
      </div>

      {/* Excerpt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Excerpt
        </Label>
        <Textarea
          value={excerpt}
          onChange={(e) => onExcerptChange(e.target.value)}
          placeholder="Brief description..."
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      {/* Featured Image */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Featured Image
        </Label>
        {featuredMedia ? (
          <div className="space-y-2">
            <div className="relative rounded-md overflow-hidden border">
              <img
                src={`media://file${encodeURI(featuredMedia.local_path)}`}
                alt="Featured"
                className="w-full h-auto max-h-40 object-cover"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive w-full"
              onClick={() => onFeaturedImageChange(null)}
            >
              <X className="h-3 w-3 mr-1" />
              Remove featured image
            </Button>
          </div>
        ) : (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-8 w-full justify-start text-left text-sm font-normal text-muted-foreground"
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                Set featured image
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="p-3 border-b">
                <span className="text-sm font-medium">Choose featured image</span>
              </div>
              {/* Upload from disk */}
              <div className="p-3 border-b">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Upload from disk
                </Button>
              </div>
              {/* Pick from post media */}
              {mediaItems.length > 0 && (
                <ScrollArea className="max-h-48">
                  <div className="p-2 space-y-1">
                    {mediaItems.map((media) => (
                      <button
                        key={media.id}
                        className="flex items-center gap-2 w-full p-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                        onClick={() => handlePickFromLibrary(media.id)}
                      >
                        <img
                          src={`media://file${encodeURI(media.local_path)}`}
                          alt={media.filename}
                          className="h-8 w-8 rounded object-cover shrink-0"
                        />
                        <span className="truncate flex-1 text-left">{media.filename}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {mediaItems.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No images in this post yet
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Categories */}
      <CategoriesSection
        terms={categoryTerms}
        selected={categories}
        onChange={onCategoriesChange}
        siteId={siteId}
        onTermCreated={handleTermCreated}
      />

      {/* Tags */}
      <TagsSection
        terms={tagTerms}
        selected={tags}
        onChange={onTagsChange}
        tagInput={tagInput}
        onTagInputChange={setTagInput}
        siteId={siteId}
        onTermCreated={handleTermCreated}
      />
    </div>
    </ScrollArea>
  )
}

// ── Categories (hierarchical checkbox list) ──────────────────────────────

function CategoriesSection({
  terms,
  selected,
  onChange,
  siteId,
  onTermCreated
}: {
  terms: TaxonomyTerm[]
  selected: number[]
  onChange: (ids: number[]) => void
  siteId: string
  onTermCreated: (term: TaxonomyTerm) => void
}): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const createCategory = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const term = await window.electronAPI.createPendingTerm(siteId, 'category', name)
      onTermCreated(term)
      onChange(selected.includes(term.id) ? selected : [...selected, term.id])
    } catch {
      // Ignore — creation guards against duplicates server-side
    }
    setNewName('')
    setAdding(false)
  }, [newName, siteId, selected, onChange, onTermCreated])

  // Build parent→children map for hierarchy
  const { roots, childrenMap } = useMemo(() => {
    const cMap = new Map<number, TaxonomyTerm[]>()
    const rts: TaxonomyTerm[] = []
    for (const t of terms) {
      if (t.parent === 0) {
        rts.push(t)
      } else {
        const siblings = cMap.get(t.parent) || []
        siblings.push(t)
        cMap.set(t.parent, siblings)
      }
    }
    return { roots: rts, childrenMap: cMap }
  }, [terms])

  const toggle = useCallback(
    (id: number) => {
      onChange(
        selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
      )
    },
    [selected, onChange]
  )

  const renderTerm = (term: TaxonomyTerm, depth: number): JSX.Element => (
    <div key={term.id}>
      <label
        className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-muted/50 rounded px-1"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <Checkbox
          checked={selected.includes(term.id)}
          onCheckedChange={() => toggle(term.id)}
          className="h-3.5 w-3.5"
        />
        <span
          className={cn('text-sm truncate', term.id < 0 && 'italic text-muted-foreground')}
          title={term.id < 0 ? 'Will be created on next sync' : undefined}
        >
          {term.name}
        </span>
      </label>
      {childrenMap.get(term.id)?.map((child) => renderTerm(child, depth + 1))}
    </div>
  )

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Categories
      </Label>
      {terms.length > 0 && (
        <div className="max-h-48 overflow-y-auto border rounded-md p-1">
          {roots.map((t) => renderTerm(t, 0))}
        </div>
      )}
      {adding ? (
        <div className="flex gap-1">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void createCategory()
              } else if (e.key === 'Escape') {
                setAdding(false)
                setNewName('')
              }
            }}
            placeholder="New category name"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 px-2 text-xs" onClick={() => void createCategory()}>
            Add
          </Button>
        </div>
      ) : (
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add category
        </button>
      )}
    </div>
  )
}

// ── Tags (badge chips + autocomplete input) ──────────────────────────────

function TagsSection({
  terms,
  selected,
  onChange,
  tagInput,
  onTagInputChange,
  siteId,
  onTermCreated
}: {
  terms: TaxonomyTerm[]
  selected: number[]
  onChange: (ids: number[]) => void
  tagInput: string
  onTagInputChange: (v: string) => void
  siteId: string
  onTermCreated: (term: TaxonomyTerm) => void
}): JSX.Element {
  const [showDropdown, setShowDropdown] = useState(false)

  const termMap = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms])

  const filtered = useMemo(() => {
    if (!tagInput.trim()) return []
    const q = tagInput.toLowerCase()
    return terms
      .filter((t) => !selected.includes(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [tagInput, terms, selected])

  // Whether the typed text exactly matches an existing term (case-insensitive)
  const hasExactMatch = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    return q.length > 0 && terms.some((t) => t.name.toLowerCase() === q)
  }, [tagInput, terms])

  const addTag = useCallback(
    (id: number) => {
      if (!selected.includes(id)) {
        onChange([...selected, id])
      }
      onTagInputChange('')
      setShowDropdown(false)
    },
    [selected, onChange, onTagInputChange]
  )

  const createTag = useCallback(async () => {
    const name = tagInput.trim()
    if (!name) return
    try {
      const term = await window.electronAPI.createPendingTerm(siteId, 'post_tag', name)
      onTermCreated(term)
      if (!selected.includes(term.id)) onChange([...selected, term.id])
    } catch {
      // Ignore — creation guards against duplicates server-side
    }
    onTagInputChange('')
    setShowDropdown(false)
  }, [tagInput, siteId, selected, onChange, onTermCreated, onTagInputChange])

  const removeTag = useCallback(
    (id: number) => {
      onChange(selected.filter((x) => x !== id))
    },
    [selected, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (filtered.length > 0) {
        addTag(filtered[0].id)
      } else if (tagInput.trim() && !hasExactMatch) {
        void createTag()
      }
    },
    [filtered, addTag, tagInput, hasExactMatch, createTag]
  )

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Tags
      </Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const term = termMap.get(id)
            if (!term) return null
            const pending = term.id < 0
            return (
              <Badge
                key={id}
                variant="secondary"
                className={cn(
                  'text-xs pl-2 pr-1 py-0 h-6 gap-1',
                  pending && 'border border-dashed border-muted-foreground/50 bg-transparent italic'
                )}
                title={pending ? 'Will be created on next sync' : undefined}
              >
                {term.name}
                <button
                  className="ml-0.5 hover:text-destructive"
                  onClick={() => removeTag(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
      <div className="relative">
        <Input
          value={tagInput}
          onChange={(e) => {
            onTagInputChange(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search or add tags..."
          className="h-8 text-sm"
        />
        {showDropdown && (filtered.length > 0 || (tagInput.trim() && !hasExactMatch)) && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
            {filtered.map((t) => (
              <button
                key={t.id}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(t.id)}
              >
                {t.name}
              </button>
            ))}
            {tagInput.trim() && !hasExactMatch && (
              <button
                className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground border-t"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void createTag()}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Create &ldquo;{tagInput.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
