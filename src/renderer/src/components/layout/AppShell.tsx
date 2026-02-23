import { ReactNode } from 'react'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import type { Site } from '@shared/types'

type View = 'sites' | 'posts' | 'settings'

interface AppShellProps {
  children: ReactNode
  sites: Site[]
  selectedSiteId: string | null
  currentView: View
  onSelectSite: (id: string) => void
  onViewChange: (view: View) => void
}

export function AppShell({
  children,
  sites,
  selectedSiteId,
  currentView,
  onSelectSite,
  onViewChange
}: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar onSettingsClick={() => onViewChange('settings')} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sites={sites}
          selectedSiteId={selectedSiteId}
          currentView={currentView}
          onSelectSite={onSelectSite}
          onViewChange={onViewChange}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
