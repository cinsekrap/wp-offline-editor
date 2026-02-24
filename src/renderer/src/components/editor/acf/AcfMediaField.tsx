import { useRef, useState, useEffect } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { ImageIcon, FileIcon, X, RefreshCw, Library } from 'lucide-react'
import { useAcfMedia } from './AcfMediaContext'
import { MediaLibraryPicker } from './MediaLibraryPicker'
import type { AcfField, MediaLibraryItem } from '@shared/types'

interface AcfMediaFieldProps {
  field: AcfField
  value: unknown
  onChange: (name: string, value: unknown) => void
  accept?: string
}

function isUuid(val: unknown): val is string {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export function AcfMediaField({ field, value, onChange, accept }: AcfMediaFieldProps): JSX.Element {
  const { siteId, postId, mediaItems, refreshMedia } = useAcfMedia()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [libraryItem, setLibraryItem] = useState<MediaLibraryItem | null>(null)

  const isImage = accept === 'image/*'
  const media = isUuid(value) ? mediaItems.find((m) => m.id === value) : undefined
  const isWpId = typeof value === 'number' && value > 0

  // Look up library item for WP ID thumbnail display
  useEffect(() => {
    if (isWpId) {
      window.electronAPI.getMediaLibrary(siteId).then((items) => {
        const found = items.find((i) => i.id === (value as number))
        setLibraryItem(found || null)
      })
    } else {
      setLibraryItem(null)
    }
  }, [isWpId, value, siteId])

  const handlePick = async (file: File): Promise<void> => {
    const buffer = await file.arrayBuffer()
    const saved = await window.electronAPI.saveMediaLocal(siteId, postId, file.name, buffer)
    onChange(field.name, saved.id)
    await refreshMedia()
  }

  const handleClear = (): void => {
    onChange(field.name, '')
  }

  const openFilePicker = (): void => {
    inputRef.current?.click()
  }

  const handleLibrarySelect = (ids: number[]): void => {
    if (ids.length > 0) {
      onChange(field.name, ids[0])
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {field.label}
        {field.required && ' *'}
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handlePick(file)
          e.target.value = ''
        }}
      />

      <MediaLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        siteId={siteId}
        onSelect={handleLibrarySelect}
      />

      {media ? (
        <div className="space-y-2">
          {isImage ? (
            <img
              src={`media://file${encodeURI(media.local_path)}`}
              alt={media.filename}
              className="h-20 rounded object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{media.filename}</span>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openFilePicker}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Replace
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
              <Library className="h-3 w-3 mr-1" />
              Library
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleClear}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      ) : isWpId ? (
        <div className="space-y-2">
          {libraryItem ? (
            <img
              src={`media://file${encodeURI(libraryItem.thumbnail_path)}`}
              alt={libraryItem.alt_text || libraryItem.title}
              className="h-20 rounded object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span>Attachment #{value as number}</span>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openFilePicker}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Replace
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
              <Library className="h-3 w-3 mr-1" />
              Library
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleClear}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={openFilePicker}>
            {isImage ? <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> : <FileIcon className="h-3.5 w-3.5 mr-1.5" />}
            Choose File
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => setPickerOpen(true)}>
            <Library className="h-3.5 w-3.5 mr-1.5" />
            Browse Library
          </Button>
        </div>
      )}
    </div>
  )
}
