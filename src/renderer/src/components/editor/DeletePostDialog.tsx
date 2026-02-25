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

interface DeletePostDialogProps {
  postTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function DeletePostDialog({
  postTitle,
  open,
  onOpenChange,
  onConfirm
}: DeletePostDialogProps): JSX.Element {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Post</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{postTitle || 'Untitled'}</strong>? This will
            remove the post and its associated media from your local database. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
