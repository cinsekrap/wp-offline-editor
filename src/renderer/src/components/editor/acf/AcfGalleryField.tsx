import { useRef, useState, useEffect } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { ImageIcon, Plus, X, Library } from 'lucide-react'
import { useAcfMedia } from './AcfMediaContext'
import { MediaLibraryPicker } from './MediaLibraryPicker'
import type { AcfField, MediaLibraryItem } from '@shared/types'

interface AcfGalleryFieldProps {
  field: AcfField
  value: unknown
  onChange: (name: string, value: unknown) => void
}

function isUuid(val: unknown): val is string {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export function AcfGalleryField({ field, value, onChange }: AcfGalleryFieldProps): JSX.Element {
  const { siteId, postId, mediaItems, refreshMedia } = useAcfMedia()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<Map<number, MediaLibraryItem>>(new Map())

  const items: Array<string | number> = Array.isArray(value) ? (value as Array<string | number>) : []

  // Load library items for WP ID thumbnail display
  const wpIds = items.filter((i): i is number => typeof i === 'number' && i > 0)
  useEffect(() => {
    if (wpIds.length > 0) {
      window.electronAPI.getMediaLibrary(siteId).then((all) => {
        const map = new Map<number, MediaLibraryItem>()
        for (const item of all) {
          if (wpIds.includes(item.id)) map.set(item.id, item)
        }
        setLibraryItems(map)
      })
    }
  }, [wpIds.join(','), siteId])

  const handleAddFiles = async (files: FileList): Promise<void> => {
    const newIds: string[] = []
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer()
      const saved = await window.electronAPI.saveMediaLocal(siteId, postId, file.name, buffer)
      newIds.push(saved.id)
    }
    onChange(field.name, [...items, ...newIds])
    await refreshMedia()
  }

  const handleRemove = (index: number): void => {
    onChange(field.name, items.filter((_, i) => i !== index))
  }

  const handleLibrarySelect = (ids: number[]): void => {
    if (ids.length > 0) {
      onChange(field.name, [...items, ...ids])
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
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleAddFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <MediaLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        siteId={siteId}
        multiple
        onSelect={handleLibrarySelect}
      />

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {items.map((item, index) => {
            const media = isUuid(item) ? mediaItems.find((m) => m.id === item) : undefined
            const isWpId = typeof item === 'number' && item > 0
            const libItem = isWpId ? libraryItems.get(item) : undefined

            return (
              <div key={index} className="relative group aspect-square rounded overflow-hidden bg-muted">
                {media ? (
                  <img
                    src={`media://file${encodeURI(media.local_path)}`}
                    alt={media.filename}
                    className="w-full h-full object-cover"
                  />
                ) : libItem ? (
                  <img
                    src={`media://file${encodeURI(libItem.thumbnail_path)}`}
                    alt={libItem.alt_text || libItem.title}
                    className="w-full h-full object-cover"
                  />
                ) : isWpId ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">#{item}</span>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemove(index)}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add from Disk
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={() => setPickerOpen(true)}
        >
          <Library className="h-3 w-3 mr-1" />
          Browse Library
        </Button>
      </div>
    </div>
  )
}
