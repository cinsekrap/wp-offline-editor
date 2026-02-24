import { Settings, RefreshCw, Loader2, LayoutGrid, ImageIcon, WifiOff, CloudUpload } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'

interface ToolbarProps {
  onSettingsClick: () => void
  onSyncClick?: () => void
  syncing?: boolean
  showSync?: boolean
  siteName?: string
  onSiteNameClick?: () => void
  pendingMediaCount?: number
  online?: boolean
  unsyncedPostCount?: number
}

export function Toolbar({
  onSettingsClick,
  onSyncClick,
  syncing,
  showSync,
  siteName,
  onSiteNameClick,
  pendingMediaCount,
  online = true,
  unsyncedPostCount
}: ToolbarProps): JSX.Element {
  return (
    <div className="h-12 border-b flex items-center px-4 drag-region bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left: traffic light spacing + menu button */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-20 shrink-0" />
        {siteName ? (
          <button
            onClick={onSiteNameClick}
            className="p-2 rounded-md hover:bg-accent transition-colors no-drag"
            title="Back to settings"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
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
