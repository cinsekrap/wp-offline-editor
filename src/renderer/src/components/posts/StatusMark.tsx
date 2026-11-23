import { AlertTriangle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { STATUS_GLYPH, STATUS_LABELS } from '@renderer/lib/post-status'

/** The status shape on its own, for places that already say the word. */
export function StatusGlyph({
  status,
  className
}: {
  status: string
  className?: string
}): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0', STATUS_GLYPH[status] ?? STATUS_GLYPH.draft, className)}
    />
  )
}

interface StatusMarkProps {
  status: string
  synced: boolean | number
  conflict?: boolean | number
  /** Whether the post exists on WordPress (has a wp_id). Default true. */
  hasRemote?: boolean
  /** Override the status word, e.g. a scheduled time. */
  label?: string
  className?: string
}

function localStatusText(synced: boolean | number, conflict?: boolean | number): string {
  if (conflict) return 'Conflict — changed both here and on WordPress'
  if (synced) return 'In sync with WordPress'
  return 'Changes made, not synchronized'
}

/**
 * Post status as a shape and a word, plus a sync mark only when there is
 * something to say: "Not synced" in the site tint, or a conflict in amber.
 * A post that is in sync carries no sync mark at all.
 */
export function StatusMark({
  status,
  synced,
  conflict,
  hasRemote = true,
  label,
  className
}: StatusMarkProps): JSX.Element {
  return (
    <span className={cn('relative inline-flex items-center gap-2 shrink-0 group/mark', className)}>
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/75 whitespace-nowrap">
        <StatusGlyph status={status} />
        {label ?? STATUS_LABELS[status] ?? status}
      </span>
      {conflict ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning whitespace-nowrap">
          <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
          Conflict
        </span>
      ) : !synced ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Not synced
        </span>
      ) : null}

      {/* Hover explainer */}
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-20 whitespace-nowrap rounded-md border bg-popover text-popover-foreground shadow-md px-2.5 py-1.5 opacity-0 invisible group-hover/mark:opacity-100 group-hover/mark:visible transition-opacity duration-100 delay-300">
        <span className="block text-[11px]">
          <span className="text-muted-foreground">On WordPress:</span>{' '}
          {hasRemote ? STATUS_LABELS[status] || status : 'Not yet on WordPress'}
        </span>
        <span className="block text-[11px] mt-0.5">
          <span className="text-muted-foreground">On this Mac:</span>{' '}
          {localStatusText(synced, conflict)}
        </span>
      </span>
    </span>
  )
}
