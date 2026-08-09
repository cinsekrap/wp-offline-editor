import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import type { ReleaseNotes } from '@shared/types'

interface WhatsNewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Shown unprompted after an update, as opposed to opened from Settings.
   * Only changes the wording — announcing "NP Presspad updated" to someone who
   * just clicked "View" would be a small lie.
   */
  afterUpdate?: boolean
}

/**
 * Notes titles are written as "NP Presspad X.Y.Z — Theme". The version is shown
 * separately here, so pull out just the theme and drop the repetition.
 */
function themeOf(title: string): string | null {
  const dash = title.indexOf('—')
  if (dash === -1) return null
  return title.slice(dash + 1).trim() || null
}

export function WhatsNewDialog({
  open,
  onOpenChange,
  afterUpdate = false
}: WhatsNewDialogProps): JSX.Element {
  const [notes, setNotes] = useState<ReleaseNotes | null>(null)

  useEffect(() => {
    if (!open) return
    window.electronAPI.getReleaseNotes().then(setNotes).catch(() => setNotes(null))
  }, [open])

  // Closing is the acknowledgement — however it happens. Recorded on every
  // close rather than only on the button, so dismissing with Escape or a click
  // outside doesn't bring the dialog back on the next launch.
  function handleOpenChange(next: boolean): void {
    if (!next) {
      window.electronAPI.markReleaseNotesSeen().catch(() => {
        // Nothing to tell the user — worst case they see this again next launch.
      })
    }
    onOpenChange(next)
  }

  // Bundled first-party markdown written by us at build time, not user content
  // and not fetched at runtime, so there is nothing here to sanitise against.
  const html = notes?.body ? (marked.parse(notes.body, { async: false }) as string) : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Layout is inline rather than in classes on purpose. DialogContent's own
          class list sets `display: grid`, so a `flex` utility here depends on
          tailwind-merge resolving that conflict the way we want; inline styles
          just win. overflow:hidden matters too — without it, content that fails
          to scroll spills out beyond the dialog instead of being clipped, which
          hides the fact that the scroll region is broken. */}
      <DialogContent
        className="sm:max-w-lg"
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          overflow: 'hidden'
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            {afterUpdate ? 'NP Presspad has been updated' : "What's new"}
          </DialogTitle>
          <DialogDescription>
            {notes
              ? [`Version ${notes.version}`, themeOf(notes.title)].filter(Boolean).join(' — ')
              : 'Loading release notes…'}
          </DialogDescription>
        </DialogHeader>

        {/* A plain scroller rather than ScrollArea: Radix's viewport is h-full,
            and a percentage height needs a definite parent height to resolve
            against, which makes it fragile here. minHeight:0 is load-bearing —
            a flex item defaults to min-height:auto and refuses to shrink below
            its content, which defeats the scroll on its own. */}
        <div className="pr-3" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {html ? (
            <div
              className="release-notes text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No release notes shipped with this version.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
