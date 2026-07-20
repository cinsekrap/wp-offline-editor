import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

interface LinkDialogProps {
  editor: Editor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps): JSX.Element {
  const [url, setUrl] = useState('')
  const [newWindow, setNewWindow] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!open || !editor) return
    const attrs = editor.getAttributes('link')
    const isEditing = editor.isActive('link')
    setEditing(isEditing)
    setUrl((attrs.href as string | undefined) ?? '')
    setNewWindow(isEditing && attrs.target === '_blank')
  }, [open, editor])

  function apply(): void {
    if (!editor) return
    const href = url.trim()
    if (!href) {
      onOpenChange(false)
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href, target: newWindow ? '_blank' : null })
      .run()
    onOpenChange(false)
  }

  function removeLink(): void {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit link' : 'Insert link'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  apply()
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="link-new-window"
              checked={newWindow}
              onCheckedChange={(checked) => setNewWindow(checked === true)}
            />
            <Label htmlFor="link-new-window" className="font-normal cursor-pointer">
              Open in a new window
            </Label>
          </div>
        </div>
        <DialogFooter>
          {editing && (
            <Button variant="destructive" className="mr-auto" onClick={removeLink}>
              Remove link
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>{editing ? 'Save' : 'Insert'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
