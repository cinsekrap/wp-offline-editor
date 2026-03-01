import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Loader2 } from 'lucide-react'
import type { Site } from '@shared/types'

interface ClearSiteContentDialogProps {
  site: Site | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (siteId: string) => Promise<void>
}

export function ClearSiteContentDialog({
  site,
  open,
  onOpenChange,
  onConfirm
}: ClearSiteContentDialogProps): JSX.Element {
  const [clearing, setClearing] = useState(false)

  async function handleClear(): Promise<void> {
    if (!site) return
    setClearing(true)
    try {
      await onConfirm(site.id)
      onOpenChange(false)
    } finally {
      setClearing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Clear Site Content</DialogTitle>
          <DialogDescription>
            Clear all content for <strong>{site?.label}</strong>? This removes all posts, media,
            scratchpads, and cached data. The site connection and credentials will be kept. You can
            re-pull from WordPress after clearing.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={clearing}>
            {clearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
