import { useState } from 'react'
import { Settings, RefreshCw, Loader2, LayoutGrid, ImageIcon, WifiOff, CloudUpload, ArrowLeftRight, Check, FileText, AlignLeft } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import type { Site } from '@shared/types'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500'
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function SiteIcon({ site }: { site: Site }): JSX.Element {
  const [error, setError] = useState(false)
  const letter = (site.label || site.url)[0]?.toUpperCase() || '?'
  const colorClass = AVATAR_COLORS[hashCode(site.id) % AVATAR_COLORS.length]

  if (!site.site_icon_url || error) {
    return (
      <div className={`h-5 w-5 rounded ${colorClass} flex items-center justify-center text-white text-[10px] font-semibold shrink-0`}>
        {letter}
      </div>
    )
  }

  return (
    <img
      src={`media://file${site.site_icon_url}`}
      alt=""
      className="h-5 w-5 rounded object-contain shrink-0 bg-muted"
      onError={() => setError(true)}
    />
  )
}

interface ToolbarProps {
  onSettingsClick: () => void
  onPostsClick?: () => void
  onTemplatesClick?: () => void
  onSyncClick?: () => void
  syncing?: boolean
  showSync?: boolean
  siteName?: string
  onSiteNameClick?: () => void
  activeView?: string
  pendingMediaCount?: number
  online?: boolean
  unsyncedPostCount?: number
  sites?: Site[]
  selectedSiteId?: string | null
  onSwitchSite?: (site: Site) => void
}

export function Toolbar({
  onSettingsClick,
  onPostsClick,
  onTemplatesClick,
  onSyncClick,
  syncing,
  showSync,
  siteName,
  onSiteNameClick,
  activeView,
  pendingMediaCount,
  online = true,
  unsyncedPostCount,
  sites,
  selectedSiteId,
  onSwitchSite
}: ToolbarProps): JSX.Element {
  const showSwitchSite = sites && sites.length > 1 && onSwitchSite && siteName

  return (
    <div className="h-12 border-b flex items-center px-4 drag-region bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left: traffic light spacing + view buttons */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <div className="w-20 shrink-0" />
        {siteName ? (
          <>
            <button
              onClick={onSiteNameClick}
              className={cn(
                'p-2 rounded-md transition-colors no-drag',
                activeView === 'dashboard' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
              )}
              title="Dashboard"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            {onPostsClick && (
              <button
                onClick={onPostsClick}
                className={cn(
                  'p-2 rounded-md transition-colors no-drag',
                  activeView === 'posts' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                )}
                title="Posts"
              >
                <AlignLeft className="h-4 w-4" />
              </button>
            )}
            {onTemplatesClick && (
              <button
                onClick={onTemplatesClick}
                className={cn(
                  'p-2 rounded-md transition-colors no-drag',
                  activeView === 'templates' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
                )}
                title="Templates"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <span className="text-sm font-semibold select-none">Settings</span>
        )}
      </div>

      {/* Centre: site name */}
      {siteName && (
        <span className="text-sm font-medium select-none truncate max-w-[200px]">
          {siteName}
        </span>
      )}

      {/* Right: status badges + actions */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {!online && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground no-drag" title="No internet connection">
            <WifiOff className="h-4 w-4" />
            <span>Offline</span>
          </div>
        )}
        {!!unsyncedPostCount && unsyncedPostCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground no-drag" title={`${unsyncedPostCount} post${unsyncedPostCount > 1 ? 's' : ''} not pushed`}>
            <CloudUpload className="h-4 w-4" />
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {unsyncedPostCount}
            </Badge>
          </div>
        )}
        {!!pendingMediaCount && pendingMediaCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground no-drag" title={`${pendingMediaCount} image${pendingMediaCount > 1 ? 's' : ''} pending upload`}>
            <ImageIcon className="h-4 w-4" />
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {pendingMediaCount}
            </Badge>
          </div>
        )}
        {showSync && (
          <button
            onClick={onSyncClick}
            disabled={syncing || !online}
            className="p-2 rounded-md hover:bg-accent transition-colors disabled:opacity-50 no-drag"
            title={online ? 'Sync with WordPress' : 'Offline — cannot sync'}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        )}
        {showSwitchSite && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-2 rounded-md hover:bg-accent transition-colors no-drag"
                title="Switch site"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 px-2">Switch site</p>
              {sites!.map((site) => (
                <button
                  key={site.id}
                  onClick={() => onSwitchSite!(site)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-sm rounded-sm transition-colors flex items-center gap-2',
                    site.id === selectedSiteId
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <SiteIcon site={site} />
                  <span className="truncate flex-1">{site.label || site.url}</span>
                  {site.id === selectedSiteId && (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
        <button
          onClick={onSettingsClick}
          className="p-2 rounded-md hover:bg-accent transition-colors no-drag"
          title="Settings (⌘,)"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
