import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Image as ImageIcon, Loader2, StickyNote } from 'lucide-react'
import type { PendingChanges } from '@shared/types'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface SyncStatusProps {
  syncing: boolean
  online: boolean
  pending: PendingChanges
  /** Posts changed both here and on WordPress */
  conflicts: number
  /** A scheduled post that hasn't reached WordPress yet won't go out on time */
  unsyncedScheduled: boolean
  lastSyncedAt: string | null
  onSync: () => void
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'Not synced yet'
  const mins = Math.round((now - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${plural(mins, 'minute')} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Synced ${plural(hours, 'hour')} ago`
  return `Synced ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

function breakdown(p: PendingChanges): string {
  const parts: string[] = []
  if (p.posts) parts.push(plural(p.posts, 'post'))
  if (p.scratchpads) parts.push(plural(p.scratchpads, 'scratchpad'))
  if (p.media) parts.push(plural(p.media, 'image'))
  return parts.join(', ')
}

/**
 * The one place that answers "is my work on WordPress yet?". Quiet when
 * everything is synced; names what's waiting otherwise. Click for the detail.
 */
export function SyncStatus({
  syncing,
  online,
  pending,
  conflicts,
  unsyncedScheduled,
  lastSyncedAt,
  onSync
}: SyncStatusProps): JSX.Element {
  // Re-render once a minute so "5 minutes ago" stays true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const waiting = pending.total
  let tone: 'ok' | 'wait' | 'off' | 'warn' | 'busy'
  let title: string
  let detail: string
  if (syncing) {
    tone = 'busy'
    title = 'Syncing…'
    detail = 'Sending and fetching changes'
  } else if (conflicts > 0) {
    tone = 'warn'
    title = plural(conflicts, 'conflict')
    detail = 'Changed here and on WordPress'
  } else if (!online) {
    tone = 'off'
    title = 'Offline'
    detail = waiting > 0 ? `${plural(waiting, 'change')} saved on this Mac` : 'Everything is saved on this Mac'
  } else if (waiting > 0) {
    tone = 'wait'
    title = `${plural(waiting, 'change')} waiting`
    detail = breakdown(pending)
  } else {
    tone = 'ok'
    title = 'All synced'
    detail = relativeTime(lastSyncedAt, now)
  }

  return (
    <Popover>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-background/80 pl-2.5 pr-1.5 py-1.5 no-drag',
          tone === 'warn' && 'border-warning/40 bg-warning-soft'
        )}
      >
        <PopoverTrigger asChild>
          <button className="flex flex-1 items-center gap-2.5 min-w-0 text-left" title="Sync details">
            {tone === 'busy' ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  tone === 'ok' && 'bg-success',
                  tone === 'wait' && 'bg-primary ring-[3px] ring-primary/20',
                  tone === 'off' && 'bg-muted-foreground',
                  tone === 'warn' && 'bg-warning'
                )}
              />
            )}
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold leading-tight">{title}</span>
              <span className="block truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
                {detail}
              </span>
            </span>
          </button>
        </PopoverTrigger>
        {online && !syncing && (tone === 'wait' || tone === 'ok') && (
          <button
            onClick={onSync}
            className={cn(
              'shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
              tone === 'wait'
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            title="Sync with WordPress"
          >
            Sync
          </button>
        )}
      </div>

      <PopoverContent side="top" align="start" className="w-72 p-3 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">{waiting > 0 ? 'Waiting to sync' : 'Sync'}</p>
          <p className="text-[11px] text-muted-foreground">{relativeTime(lastSyncedAt, now)}</p>
        </div>

        {waiting > 0 ? (
          <ul className="space-y-1.5 text-xs">
            {pending.posts > 0 && (
              <li className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                {plural(pending.posts, 'post')}
              </li>
            )}
            {pending.scratchpads > 0 && (
              <li className="flex items-center gap-2">
                <StickyNote className="size-3.5 text-muted-foreground" />
                {plural(pending.scratchpads, 'scratchpad')}
              </li>
            )}
            {pending.media > 0 && (
              <li className="flex items-center gap-2">
                <ImageIcon className="size-3.5 text-muted-foreground" />
                {plural(pending.media, 'image')}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Everything on this Mac is on WordPress too.
          </p>
        )}

        {conflicts > 0 && (
          <div className="flex gap-2 rounded-md bg-warning-soft p-2 text-xs">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-warning" />
            <span>
              {conflicts === 1 ? 'A post was' : `${conflicts} posts were`} changed here and on WordPress.
              Sync leaves {conflicts === 1 ? 'it' : 'them'} alone until you open{' '}
              {conflicts === 1 ? 'it' : 'each one'} and choose a version.
            </span>
          </div>
        )}

        {unsyncedScheduled && (
          <div className="flex gap-2 rounded-md bg-warning-soft p-2 text-xs">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-warning" />
            <span>A scheduled post isn&rsquo;t on WordPress yet. It won&rsquo;t go out on time unless you sync first.</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-[11px] text-muted-foreground">
            {online ? 'Connected' : 'Offline — changes stay on this Mac'}
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={onSync} disabled={!online || syncing}>
            {syncing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Sync now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
