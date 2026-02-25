import { useState, useCallback, useRef } from 'react'
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
import { CalendarIcon, ImageIcon, X, Upload, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import type { PostStatus, Media } from '@shared/types'

interface PostMetaProps {
  status: PostStatus
  scheduledDate: Date | undefined
  onStatusChange: (status: PostStatus) => void
  onDateChange: (date: Date | undefined) => void
  featuredImage: string | null
  onFeaturedImageChange: (mediaId: string | null) => void
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
  siteId,
  postId,
  mediaItems
}: PostMetaProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    </div>
  )
}
