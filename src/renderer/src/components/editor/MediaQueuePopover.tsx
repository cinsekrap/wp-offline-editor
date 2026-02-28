import { ImageIcon, Upload, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { Media } from '@shared/types'

interface MediaQueuePopoverProps {
  queue: Media[]
  pending: number
  uploading: string | null
  onUploadItem: (mediaId: string) => void
  onUploadAll: () => void
}

export function MediaQueuePopover({
  queue,
  pending,
  uploading,
  onUploadItem,
  onUploadAll
}: MediaQueuePopoverProps): JSX.Element | null {
  if (queue.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Media queue">
          <ImageIcon className="h-4 w-4" />
          {pending > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none">
              {pending}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="text-sm font-medium">Media ({queue.length})</span>
          {pending > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onUploadAll}
              disabled={uploading !== null}
            >
              {uploading === 'all' ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Upload className="h-3 w-3 mr-1" />
              )}
              Upload all
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-60">
          <div className="p-2 space-y-1">
            {queue.map((media) => (
              <div
                key={media.id}
                className="flex items-center gap-2 p-2 rounded-md text-sm hover:bg-muted/50"
              >
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{media.filename}</span>
                {media.synced ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => onUploadItem(media.id)}
                    disabled={uploading !== null}
                    title="Upload to WordPress"
                  >
                    {uploading === media.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
