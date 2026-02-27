import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import type { Site } from '@shared/types'

interface DuplicateToDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Site[]
  currentSiteId: string
  onSelect: (targetSiteId: string) => void
  duplicating: boolean
}

export function DuplicateToDialog({
  open,
  onOpenChange,
  sites,
  currentSiteId,
  onSelect,
  duplicating
}: DuplicateToDialogProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const otherSites = sites.filter((s) => s.id !== currentSiteId)

  function handleSelect(siteId: string): void {
    setSelectedId(siteId)
    onSelect(siteId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Duplicate to site</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-2">
          {otherSites.map((site) => (
            <button
              key={site.id}
              className="flex items-center gap-2 w-full text-left text-sm px-3 py-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
              onClick={() => handleSelect(site.id)}
              disabled={duplicating}
            >
              {duplicating && selectedId === site.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{site.label}</span>
              <span className="text-xs text-muted-foreground ml-auto truncate max-w-[140px]">
                {new URL(site.url).hostname}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
