import { useCallback, useEffect, useState, type ComponentType } from 'react'
import {
  Check,
  ChevronsUpDown,
  FileText,
  Home,
  Images,
  LayoutTemplate,
  Plus,
  Settings,
  StickyNote,
  AlertTriangle
} from 'lucide-react'
import type { PendingChanges, Scratchpad, Site } from '@shared/types'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { SiteAvatar } from './SiteAvatar'
import { SyncStatus } from './SyncStatus'

export type SidebarView = 'dashboard' | 'posts' | 'media' | 'templates'

interface SidebarProps {
  sites: Site[]
  site: Site
  onSwitchSite: (site: Site) => void
  onManageSites: () => void
  activeView: SidebarView | null
  onNavigate: (view: SidebarView) => void
  onSettings: () => void
  postCount: number
  templateCount: number
  // sync
  syncing: boolean
  online: boolean
  pending: PendingChanges
  conflicts: number
  unsyncedScheduled: boolean
  lastSyncedAt: string | null
  onSync: () => void
}

const NAV: { view: SidebarView; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { view: 'dashboard', label: 'Home', icon: Home },
  { view: 'posts', label: 'Posts', icon: FileText },
  { view: 'media', label: 'Media', icon: Images },
  { view: 'templates', label: 'Templates', icon: LayoutTemplate }
]

function shortAge(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60000
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d`
  return `${Math.round(mins / 10080)}w`
}

function NavItem({
  active,
  onClick,
  icon: Icon,
  label,
  count
}: {
  active: boolean
  onClick: () => void
  icon: ComponentType<{ className?: string }>
  label: string
  count?: number
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-foreground/[0.07] font-semibold text-foreground'
          : 'text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground'
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] font-normal tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  )
}

/**
 * The app's navigation: which site you're in (always visible), where you are,
 * your recent scratchpads, and whether your work has reached WordPress.
 */
export function Sidebar({
  sites,
  site,
  onSwitchSite,
  onManageSites,
  activeView,
  onNavigate,
  onSettings,
  postCount,
  templateCount,
  syncing,
  online,
  pending,
  conflicts,
  unsyncedScheduled,
  lastSyncedAt,
  onSync
}: SidebarProps): JSX.Element {
  const [switcherOpen, setSwitcherOpen] = useState(false)

  // Recent scratchpads, kept fresh while a pop-out window edits one
  const [scratchpads, setScratchpads] = useState<Scratchpad[]>([])
  const loadScratchpads = useCallback(async () => {
    try {
      const all = await window.electronAPI.getScratchpads(site.id)
      all.sort((a, b) => new Date(b.modified_local).getTime() - new Date(a.modified_local).getTime())
      setScratchpads(all)
    } catch {
      setScratchpads([])
    }
  }, [site.id])
  useEffect(() => {
    loadScratchpads()
    return window.electronAPI.onScratchpadChanged(() => loadScratchpads())
  }, [loadScratchpads])

  const newScratchpad = async (): Promise<void> => {
    const sp = await window.electronAPI.createScratchpad({ site_id: site.id, title: 'Untitled' })
    await window.electronAPI.openScratchpadWindow(sp.id)
    loadScratchpads()
  }

  return (
    <aside className="w-[232px] shrink-0 flex flex-col border-r bg-sidebar vibrant:bg-sidebar/55 min-h-0">
      {/* Title-bar strip: room for the traffic lights, and a handle to drag the window */}
      <div className="h-11 shrink-0 drag-region" />

      <div className="px-2.5 pb-2.5 flex flex-col gap-0.5 min-h-0 flex-1">
        {/* Site switcher */}
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            <button
              className="mb-3 flex items-center gap-2.5 rounded-lg bg-foreground/[0.05] px-2 py-1.5 text-left hover:bg-foreground/[0.08] transition-colors"
              title="Switch site"
            >
              <SiteAvatar site={site} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  {site.label || site.url}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground leading-tight">
                  {site.url.replace(/^https?:\/\//, '')}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[232px] p-1.5">
            <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold text-muted-foreground">Sites</p>
            {sites.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSwitcherOpen(false)
                  if (s.id !== site.id) onSwitchSite(s)
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  s.id === site.id ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <SiteAvatar site={s} className="size-5 text-[10px]" />
                <span className="flex-1 truncate">{s.label || s.url}</span>
                {s.id === site.id && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => {
                setSwitcherOpen(false)
                onManageSites()
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              Add or manage sites…
            </button>
          </PopoverContent>
        </Popover>

        {NAV.map((item) => (
          <NavItem
            key={item.view}
            active={activeView === item.view}
            onClick={() => onNavigate(item.view)}
            icon={item.icon}
            label={item.label}
            count={item.view === 'posts' ? postCount : item.view === 'templates' ? templateCount : undefined}
          />
        ))}

        {/* Scratchpads */}
        <div className="mt-4 mb-1 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold text-muted-foreground">Scratchpads</span>
          <button
            onClick={newScratchpad}
            className="rounded p-0.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            title="New scratchpad"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 min-h-0 overflow-y-auto">
          {scratchpads.length === 0 ? (
            <button
              onClick={newScratchpad}
              className="px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              Jot something down…
            </button>
          ) : (
            scratchpads.slice(0, 6).map((sp) => (
              <button
                key={sp.id}
                onClick={() => window.electronAPI.openScratchpadWindow(sp.id)}
                className="flex items-center gap-2.5 rounded-md px-2 py-1 text-left text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground"
                title="Open in scratchpad window"
              >
                {sp.conflict ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label="Has a conflict" />
                ) : (
                  <StickyNote className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{sp.title || 'Untitled'}</span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">
                  {shortAge(sp.modified_local)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex-1" />

        <NavItem active={false} onClick={onSettings} icon={Settings} label="Settings" />
        <div className="mt-2">
          <SyncStatus
            syncing={syncing}
            online={online}
            pending={pending}
            conflicts={conflicts}
            unsyncedScheduled={unsyncedScheduled}
            lastSyncedAt={lastSyncedAt}
            onSync={onSync}
          />
        </div>
      </div>
    </aside>
  )
}
