import { useState } from 'react'
import { Upload, Download, GitFork, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import type { Post } from '@shared/types'

type Strategy = 'keep-mine' | 'keep-theirs' | 'fork'

interface ConflictDialogProps {
  post: Post | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolve: (strategy: Strategy) => Promise<void>
}

export function ConflictDialog({
  post,
  open,
  onOpenChange,
  onResolve
}: ConflictDialogProps): JSX.Element {
  const [resolving, setResolving] = useState<Strategy | null>(null)

  async function handleResolve(strategy: Strategy): Promise<void> {
    setResolving(strategy)
    try {
      await onResolve(strategy)
      onOpenChange(false)
    } finally {
      setResolving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={resolving ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conflict Detected</DialogTitle>
          <DialogDescription>
            {post
              ? `"${post.title || 'Untitled'}" has been modified both locally and on WordPress. Choose how to resolve.`
              : 'This post has conflicting changes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-3 px-4"
            disabled={resolving !== null}
            onClick={() => handleResolve('keep-mine')}
          >
            {resolving === 'keep-mine' ? (
              <Loader2 className="h-5 w-5 mr-3 shrink-0 animate-spin" />
            ) : (
              <Upload className="h-5 w-5 mr-3 shrink-0" />
            )}
            <div className="text-left">
              <div className="font-medium">Keep mine</div>
              <div className="text-xs text-muted-foreground font-normal">
                Push local changes to WordPress, overwriting remote
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-3 px-4"
            disabled={resolving !== null}
            onClick={() => handleResolve('keep-theirs')}
          >
            {resolving === 'keep-theirs' ? (
              <Loader2 className="h-5 w-5 mr-3 shrink-0 animate-spin" />
            ) : (
              <Download className="h-5 w-5 mr-3 shrink-0" />
            )}
            <div className="text-left">
              <div className="font-medium">Keep theirs</div>
              <div className="text-xs text-muted-foreground font-normal">
                Discard local changes, pull remote version
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-3 px-4"
            disabled={resolving !== null}
            onClick={() => handleResolve('fork')}
          >
            {resolving === 'fork' ? (
              <Loader2 className="h-5 w-5 mr-3 shrink-0 animate-spin" />
            ) : (
              <GitFork className="h-5 w-5 mr-3 shrink-0" />
            )}
            <div className="text-left">
              <div className="font-medium">Fork</div>
              <div className="text-xs text-muted-foreground font-normal">
                Save local as a new draft, pull remote into original
              </div>
            </div>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={resolving !== null} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
