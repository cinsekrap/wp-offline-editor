import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Check, ImageIcon, Search } from 'lucide-react'
import type { MediaLibraryItem } from '@shared/types'

interface MediaLibraryPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  multiple?: boolean
  onSelect: (ids: number[]) => void
}

export function MediaLibraryPicker({
  open,
  onOpenChange,
  siteId,
  multiple = false,
  onSelect
}: MediaLibraryPickerProps): JSX.Element {
  const [items, setItems] = useState<MediaLibraryItem[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      setSearch('')
      setSelected(new Set())
      window.electronAPI.getMediaLibrary(siteId).then((data) => {
        setItems(data)
        setLoading(false)
      })
    }
  }, [open, siteId])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.filename.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleClick = (id: number): void => {
    if (multiple) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      onSelect([id])
      onOpenChange(false)
    }
  }

  const handleConfirm = (): void => {
    onSelect(Array.from(selected))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[360px]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              {items.length === 0
                ? 'No media synced yet. Sync your site to cache the media library.'
                : 'No results match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 p-1">
              {filtered.map((item) => {
                const isSelected = selected.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`relative aspect-square rounded overflow-hidden bg-muted border-2 transition-colors ${
                      isSelected
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    onClick={() => handleClick(item.id)}
                    title={item.title || item.filename}
                  >
                    <img
                      src={`media://file${encodeURI(item.thumbnail_path)}`}
                      alt={item.alt_text || item.title}
                      className="w-full h-full object-cover"
                    />
                    {multiple && isSelected && (
                      <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {multiple && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              Add {selected.size} Selected
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
