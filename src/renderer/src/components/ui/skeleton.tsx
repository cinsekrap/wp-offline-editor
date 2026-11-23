import { cn } from '@renderer/lib/utils'

/** A placeholder block that holds layout while local data loads. */
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} />
}
