import { useState } from 'react'
import { AlertTriangle, Upload, Download, Loader2 } from 'lucide-react'

type Strategy = 'keep-mine' | 'keep-theirs'

interface ScratchpadConflictBannerProps {
  scratchpadId: string
  /** Called after a successful resolution so the parent can reload the row. */
  onResolved: () => void
}

/**
 * Lightweight inline conflict banner for scratchpads — two choices only, no
 * fork (this is a notes feature, not the post editor). "Keep mine" works
 * offline; "Keep theirs" needs the network and surfaces an inline error if the
 * fetch fails.
 */
export function ScratchpadConflictBanner({
  scratchpadId,
  onResolved
}: ScratchpadConflictBannerProps): JSX.Element {
  const [resolving, setResolving] = useState<Strategy | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resolve(strategy: Strategy): Promise<void> {
    setResolving(strategy)
    setError(null)
    try {
      await window.electronAPI.resolveScratchpadConflict(scratchpadId, strategy)
      onResolved()
    } catch {
      setError(
        strategy === 'keep-theirs'
          ? "Couldn't reach WordPress — you may be offline. “Keep mine” works offline."
          : 'Could not resolve the conflict.'
      )
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="mx-3 my-2 rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Changed here and on WordPress
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
            Choose which version to keep. Your local copy is shown below.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-sm border border-amber-400/60 bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              disabled={resolving !== null}
              onClick={() => resolve('keep-mine')}
            >
              {resolving === 'keep-mine' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Keep mine
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-sm border border-amber-400/60 bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              disabled={resolving !== null}
              onClick={() => resolve('keep-theirs')}
            >
              {resolving === 'keep-theirs' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Keep theirs
            </button>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
