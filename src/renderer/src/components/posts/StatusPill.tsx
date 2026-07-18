import { Check, ArrowUp } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { STATUS_COLORS, STATUS_LABELS } from '@renderer/lib/post-status'

interface StatusPillProps {
  status: string
  synced: boolean | number
  conflict?: boolean | number
  className?: string
}

/**
 * Merged status + sync pill: the pill carries the post status (colour +
 * label), the trailing dot carries sync state as a solid circle with a
 * white icon — legible on any pill colour.
 */
export function StatusPill({ status, synced, conflict, className }: StatusPillProps): JSX.Element {
  return (
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
        <span
          title="Sync conflict"
          className="h-3.5 w-3.5 rounded-full bg-orange-500 flex items-center justify-center shrink-0"
        >
          <span className="text-white text-[9px] font-bold leading-none">!</span>
        </span>
      ) : synced ? (
        <span
          title="Synced"
          className="h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center shrink-0"
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
        </span>
      ) : (
        <span
          title="Not synced"
          className="h-3.5 w-3.5 rounded-full bg-blue-500 flex items-center justify-center shrink-0"
        >
          <ArrowUp className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
        </span>
      )}
    </Badge>
  )
}
