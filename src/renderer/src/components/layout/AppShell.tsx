import { ReactNode } from 'react'
import { Toolbar } from './Toolbar'

interface AppShellProps {
  children: ReactNode
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

export function AppShell({
  children,
  onSettingsClick,
  onSyncClick,
  syncing,
  showSync,
  siteName,
  onSiteNameClick,
  pendingMediaCount,
  online,
  unsyncedPostCount
}: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onSettingsClick={onSettingsClick}
        onSyncClick={onSyncClick}
        syncing={syncing}
        showSync={showSync}
        siteName={siteName}
        onSiteNameClick={onSiteNameClick}
        pendingMediaCount={pendingMediaCount}
        online={online}
        unsyncedPostCount={unsyncedPostCount}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
