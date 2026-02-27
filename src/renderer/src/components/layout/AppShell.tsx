import { ReactNode } from 'react'
import { Toolbar } from './Toolbar'
import type { Site } from '@shared/types'

interface AppShellProps {
  children: ReactNode
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

export function AppShell({
  children,
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
  online,
  unsyncedPostCount,
  sites,
  selectedSiteId,
  onSwitchSite
}: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onSettingsClick={onSettingsClick}
        onPostsClick={onPostsClick}
        onTemplatesClick={onTemplatesClick}
        onSyncClick={onSyncClick}
        syncing={syncing}
        showSync={showSync}
        siteName={siteName}
        onSiteNameClick={onSiteNameClick}
        activeView={activeView}
        pendingMediaCount={pendingMediaCount}
        online={online}
        unsyncedPostCount={unsyncedPostCount}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSwitchSite={onSwitchSite}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
