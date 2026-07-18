import { Check, ArrowUp } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { STATUS_COLORS, STATUS_LABELS } from '@renderer/lib/post-status'

interface StatusPillProps {
  status: string
  synced: boolean | number
  conflict?: boolean | number
  /** Whether the post exists on WordPress (has a wp_id). Default true. */
  hasRemote?: boolean
  className?: string
}

function localStatusText(synced: boolean | number, conflict?: boolean | number): string {
  if (conflict) return 'Conflict — changed both here and on WordPress'
  if (synced) return 'In sync with WordPress'
  return 'Changes made, not synchronized'
}

/**
 * Merged status + sync pill: the pill carries the post status (colour +
 * label), the trailing dot carries sync state as a solid circle with a
 * white icon — legible on any pill colour.
 */
export function StatusPill({
  status,
  synced,
  conflict,
  hasRemote = true,
  className
}: StatusPillProps): JSX.Element {
  return (
    <span className="relative inline-flex group/pill">
      <Badge
        variant="outline"
        className={cn(
          'inline-flex items-center gap-1 text-[10px] pl-1.5 pr-[3px] py-0',
          STATUS_COLORS[status] || '',
          className
        )}
      >
        {STATUS_LABELS[status] || status}
        {conflict ? (
          <span className="h-3.5 w-3.5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-white text-[9px] font-bold leading-none">!</span>
          </span>
        ) : synced ? (
          <span className="h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
          </span>
        ) : (
          <span className="h-3.5 w-3.5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <ArrowUp className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
          </span>
        )}
      </Badge>

      {/* Hover explainer */}
      <span
        className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-20 whitespace-nowrap rounded-md border bg-popover text-popover-foreground shadow-md px-2.5 py-1.5 opacity-0 invisible group-hover/pill:opacity-100 group-hover/pill:visible transition-opacity duration-100 delay-300"
      >
        <span className="block text-[11px]">
          <span className="text-muted-foreground">Remote status:</span>{' '}
          {hasRemote ? STATUS_LABELS[status] || status : 'Not yet on WordPress'}
        </span>
        <span className="block text-[11px] mt-0.5">
          <span className="text-muted-foreground">Local status:</span>{' '}
          {localStatusText(synced, conflict)}
        </span>
      </span>
    </span>
  )
}
