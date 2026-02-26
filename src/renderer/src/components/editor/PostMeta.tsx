import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Badge } from '@renderer/components/ui/badge'
import { CalendarIcon, ImageIcon, X, Upload, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import type { PostStatus, Media, TaxonomyTerm } from '@shared/types'

interface PostMetaProps {
  status: PostStatus
  scheduledDate: Date | undefined
  onStatusChange: (status: PostStatus) => void
  onDateChange: (date: Date | undefined) => void
  featuredImage: string | null
  onFeaturedImageChange: (mediaId: string | null) => void
  categories: number[]
  tags: number[]
  onCategoriesChange: (ids: number[]) => void
  onTagsChange: (ids: number[]) => void
  siteId: string
  postId: string
  mediaItems: Media[]
}

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'private', label: 'Private' },
  { value: 'publish', label: 'Published' },
  { value: 'future', label: 'Scheduled' }
]

export function PostMeta({
  status,
  scheduledDate,
  onStatusChange,
  onDateChange,
  featuredImage,
  onFeaturedImageChange,
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

  // Taxonomy term caches
  const [categoryTerms, setCategoryTerms] = useState<TaxonomyTerm[]>([])
  const [tagTerms, setTagTerms] = useState<TaxonomyTerm[]>([])
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    window.electronAPI.getTaxonomyTerms(siteId, 'category').then(setCategoryTerms).catch(() => {})
    window.electronAPI.getTaxonomyTerms(siteId, 'post_tag').then(setTagTerms).catch(() => {})
  }, [siteId])

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
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Status
        </Label>
        <Select value={status} onValueChange={(v) => onStatusChange(v as PostStatus)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === 'future' && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Publish Date
          </Label>
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
              <Calendar mode="single" selected={scheduledDate} onSelect={onDateChange} />
            </PopoverContent>
          </Popover>
          {scheduledDate && (
            <div className="flex gap-2">
              <Input
                type="time"
                className="h-8 text-sm"
                value={format(scheduledDate, 'HH:mm')}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':').map(Number)
                  const next = new Date(scheduledDate)
                  next.setHours(hours, minutes)
                  onDateChange(next)
                }}
              />
            </div>
          )}
        </div>
      )}

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
      {categoryTerms.length > 0 && (
        <CategoriesSection
          terms={categoryTerms}
          selected={categories}
          onChange={onCategoriesChange}
        />
      )}

      {/* Tags */}
      {tagTerms.length > 0 && (
        <TagsSection
          terms={tagTerms}
          selected={tags}
          onChange={onTagsChange}
          tagInput={tagInput}
          onTagInputChange={setTagInput}
        />
      )}
    </div>
  )
}

// ── Categories (hierarchical checkbox list) ──────────────────────────────

function CategoriesSection({
  terms,
  selected,
  onChange
}: {
  terms: TaxonomyTerm[]
  selected: number[]
  onChange: (ids: number[]) => void
}): JSX.Element {
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
        <span className="text-sm truncate">{term.name}</span>
      </label>
      {childrenMap.get(term.id)?.map((child) => renderTerm(child, depth + 1))}
    </div>
  )

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Categories
      </Label>
      <div className="max-h-48 overflow-y-auto border rounded-md p-1">
        {roots.map((t) => renderTerm(t, 0))}
      </div>
    </div>
  )
}

// ── Tags (badge chips + autocomplete input) ──────────────────────────────

function TagsSection({
  terms,
  selected,
  onChange,
  tagInput,
  onTagInputChange
}: {
  terms: TaxonomyTerm[]
  selected: number[]
  onChange: (ids: number[]) => void
  tagInput: string
  onTagInputChange: (v: string) => void
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

  const removeTag = useCallback(
    (id: number) => {
      onChange(selected.filter((x) => x !== id))
    },
    [selected, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        addTag(filtered[0].id)
      }
    },
    [filtered, addTag]
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
            return (
              <Badge key={id} variant="secondary" className="text-xs pl-2 pr-1 py-0 h-6 gap-1">
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
          placeholder="Search tags..."
          className="h-8 text-sm"
        />
        {showDropdown && filtered.length > 0 && (
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
          </div>
        )}
      </div>
    </div>
  )
}
