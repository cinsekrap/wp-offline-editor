import { ReactNode } from 'react'
import { Toolbar } from './Toolbar'
import type { PendingChanges, Site } from '@shared/types'

interface AppShellProps {
  children: ReactNode
  onSettingsClick: () => void
  onPostsClick?: () => void
  onMediaClick?: () => void
  onSyncClick?: () => void
  syncing?: boolean
  showSync?: boolean
  siteName?: string
  onSiteNameClick?: () => void
  activeView?: string
  online?: boolean
  pendingChanges?: PendingChanges
  sites?: Site[]
  selectedSiteId?: string | null
  onSwitchSite?: (site: Site) => void
}

export function AppShell({
  children,
  onSettingsClick,
  onPostsClick,
  onMediaClick,
  onSyncClick,
  syncing,
  showSync,
  siteName,
  onSiteNameClick,
  activeView,
  online,
  pendingChanges,
  sites,
  selectedSiteId,
  onSwitchSite
}: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onSettingsClick={onSettingsClick}
        onPostsClick={onPostsClick}
        onMediaClick={onMediaClick}
        onSyncClick={onSyncClick}
        syncing={syncing}
        showSync={showSync}
        siteName={siteName}
        onSiteNameClick={onSiteNameClick}
        activeView={activeView}
        online={online}
        pendingChanges={pendingChanges}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSwitchSite={onSwitchSite}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
