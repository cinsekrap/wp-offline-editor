import { useState } from 'react'
import { AppShell } from '@renderer/components/layout/AppShell'
import { SiteList } from '@renderer/components/settings/SiteList'
import { AddSiteDialog } from '@renderer/components/settings/AddSiteDialog'
import { EditSiteDialog } from '@renderer/components/settings/EditSiteDialog'
import { DeleteSiteDialog } from '@renderer/components/settings/DeleteSiteDialog'
import { Toaster } from '@renderer/components/ui/toaster'
import { useToast } from '@renderer/components/ui/use-toast'
import { useSites } from '@renderer/hooks/useSites'
import type { Site } from '@shared/types'
import '@renderer/styles/globals.css'

type View = 'sites' | 'posts' | 'settings'

function App(): JSX.Element {
  const { sites, addSite, updateSite, deleteSite, testConnection } = useSites()
  const { toast } = useToast()

  const [currentView, setCurrentView] = useState<View>('settings')
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState<Site | null>(null)

  async function handleAddSite(input: Parameters<typeof addSite>[0]): Promise<void> {
    await addSite(input)
    toast({ title: 'Site added', description: `${input.label || 'Site'} has been added.` })
  }

  async function handleUpdateSite(update: Parameters<typeof updateSite>[0]): Promise<void> {
    await updateSite(update)
    toast({ title: 'Site updated', description: 'Site settings have been saved.' })
  }

  async function handleDeleteSite(id: string): Promise<void> {
    const site = sites.find((s) => s.id === id)
    await deleteSite(id)
    if (selectedSiteId === id) setSelectedSiteId(null)
    toast({
      title: 'Site deleted',
      description: `${site?.label || 'Site'} has been removed.`
    })
  }

  function renderContent(): JSX.Element {
    switch (currentView) {
      case 'settings':
        return (
          <SiteList
            sites={sites}
            onAdd={() => setAddDialogOpen(true)}
            onEdit={(site) => setEditSite(site)}
            onDelete={(site) => setDeletingSite(site)}
          />
        )
      case 'posts':
        return (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-1">Posts</p>
            <p className="text-sm">
              {selectedSiteId
                ? 'Post editing will be available in Phase 2.'
                : 'Select a site from the sidebar to view posts.'}
            </p>
          </div>
        )
      default:
        return <div />
    }
  }

  return (
    <>
      <AppShell
        sites={sites}
        selectedSiteId={selectedSiteId}
        currentView={currentView}
        onSelectSite={setSelectedSiteId}
        onViewChange={setCurrentView}
      >
        {renderContent()}
      </AppShell>

      <AddSiteDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleAddSite}
        onTestConnection={testConnection}
      />

      <EditSiteDialog
        site={editSite}
        open={editSite !== null}
        onOpenChange={(open) => {
          if (!open) setEditSite(null)
        }}
        onSave={handleUpdateSite}
      />

      <DeleteSiteDialog
        site={deletingSite}
        open={deletingSite !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingSite(null)
        }}
        onConfirm={handleDeleteSite}
      />

      <Toaster />
    </>
  )
}

export default App
