import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

interface MassPushDialogProps {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function MassPushDialog({
  count,
  open,
  onOpenChange,
  onConfirm
}: MassPushDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Sync Paused</DialogTitle>
          <DialogDescription>
            {count} posts have unsynced changes that would be pushed to WordPress. This will update
            the live copies on your site.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Push All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
