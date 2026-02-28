import type { MouseEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'

interface ImageContextMenuProps {
  x: number
  y: number
  mediaId: string
  alt: string
  altText: string
  onAltTextChange: (value: string) => void
  onAltSave: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function ImageContextMenu({
  x,
  y,
  altText,
  onAltTextChange,
  onAltSave,
  onEdit,
  onDelete,
  onClose
}: ImageContextMenuProps): JSX.Element {
  return (
    <div
      className="fixed z-50 bg-popover border rounded-lg shadow-lg p-3 w-[240px] animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <label className="text-xs font-medium text-muted-foreground">Alt text</label>
      <Input
        value={altText}
        onChange={(e) => onAltTextChange(e.target.value)}
        onBlur={onAltSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onAltSave()
            onClose()
          }
        }}
        placeholder="Describe this image..."
        className="mt-1 h-8 text-sm"
        autoFocus
      />
      <Separator className="my-2" />
      <div className="flex flex-col gap-0.5">
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground transition-colors"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Crop
        </button>
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded text-destructive hover:bg-destructive/10 transition-colors"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  )
}
