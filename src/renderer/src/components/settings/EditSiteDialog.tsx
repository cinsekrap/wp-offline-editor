import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Loader2, XCircle } from 'lucide-react'
import type { Site, SiteUpdate } from '@shared/types'

interface EditSiteDialogProps {
  site: Site | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (update: SiteUpdate) => Promise<void>
}

export function EditSiteDialog({
  site,
  open,
  onOpenChange,
  onSave
}: EditSiteDialogProps): JSX.Element {
  const [label, setLabel] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [pullPublished, setPullPublished] = useState(50)
  const [mediaLibraryLimit, setMediaLibraryLimit] = useState(100)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (site) {
      setLabel(site.label)
      setAutoSync(site.auto_sync)
      setPullPublished(site.pull_published)
      setMediaLibraryLimit(site.media_library_limit)
      setPassword('')
      setError(null)
    }
  }, [site])

  async function handleSave(): Promise<void> {
    if (!site) return
    setSaving(true)
    setError(null)
    try {
      const update: SiteUpdate = {
        id: site.id,
        label,
        auto_sync: autoSync,
        pull_published: pullPublished,
        media_library_limit: mediaLibraryLimit
      }
      if (password.trim()) {
        update.password = password
      }
      await onSave(update)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update site')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Edit Site</DialogTitle>
          <DialogDescription>
            Update settings for {site?.label || 'this site'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>URL</Label>
            <p className="text-sm text-muted-foreground">{site?.url}</p>
          </div>

          <div className="space-y-2">
            <Label>Username</Label>
            <p className="text-sm text-muted-foreground">{site?.username}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-password">Application Password</Label>
            <Input
              id="edit-password"
              type="password"
              placeholder="Leave empty to keep current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-auto-sync">Auto-sync</Label>
              <p className="text-xs text-muted-foreground">
                Automatically sync changes when online
              </p>
            </div>
            <Switch
              id="edit-auto-sync"
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-pull-published">Published posts to pull</Label>
            <Input
              id="edit-pull-published"
              type="number"
              min={1}
              max={500}
              value={pullPublished}
              onChange={(e) => setPullPublished(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-media-library-limit">Media library images to sync</Label>
            <Input
              id="edit-media-library-limit"
              type="number"
              min={0}
              max={500}
              value={mediaLibraryLimit}
              onChange={(e) => setMediaLibraryLimit(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Thumbnails of recent images cached for offline browsing (0 to disable)
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!label.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
