import { Globe, FileText, Settings } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { Site } from '@shared/types'

type View = 'sites' | 'posts' | 'settings'

interface SidebarProps {
  sites: Site[]
  selectedSiteId: string | null
  currentView: View
  onSelectSite: (id: string) => void
  onViewChange: (view: View) => void
}

export function Sidebar({
  sites,
  selectedSiteId,
  currentView,
  onSelectSite,
  onViewChange
}: SidebarProps): JSX.Element {
  return (
    <div className="w-56 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 flex-1 overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
            Sites
          </h2>
          {sites.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">No sites added yet</p>
          ) : (
            <ul className="space-y-0.5">
              {sites.map((site) => (
                <li key={site.id}>
                  <button
                    onClick={() => {
                      onSelectSite(site.id)
                      onViewChange('posts')
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors',
                      selectedSiteId === site.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    )}
                  >
                    <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{site.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t p-2 space-y-0.5">
        <button
          onClick={() => onViewChange('posts')}
          className={cn(
            'w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors',
            currentView === 'posts' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Posts
        </button>
        <button
          onClick={() => onViewChange('settings')}
          className={cn(
            'w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors',
            currentView === 'settings' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>
    </div>
  )
}
