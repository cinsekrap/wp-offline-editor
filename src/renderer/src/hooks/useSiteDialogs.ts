import { useState, useCallback } from 'react'
import type { Site, SiteInput, SiteUpdate, WpConnectionResult } from '@shared/types'

type ToastFn = (opts: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}) => void

interface UseSiteDialogsParams {
  sites: Site[]
  addSite: (input: SiteInput) => Promise<Site>
  updateSite: (update: SiteUpdate) => Promise<Site>
  deleteSite: (id: string) => Promise<void>
  testConnection: (url: string, username: string, password: string) => Promise<WpConnectionResult>
  selectedSiteId: string | null
  toast: ToastFn
  onSiteAdded: (site: Site) => Promise<void> | void
  onSiteDeleted: (id: string) => void
}

interface UseSiteDialogsReturn {
  addDialogOpen: boolean
  setAddDialogOpen: (open: boolean) => void
  editSite: Site | null
  setEditSite: (site: Site | null) => void
  deletingSite: Site | null
  setDeletingSite: (site: Site | null) => void
  handleAddSite: (input: SiteInput) => Promise<void>
  handleUpdateSite: (update: SiteUpdate) => Promise<void>
  handleDeleteSite: (id: string) => Promise<void>
  testConnection: (url: string, username: string, password: string) => Promise<WpConnectionResult>
}

export function useSiteDialogs({
  sites,
  addSite,
  updateSite,
  deleteSite,
  testConnection,
  selectedSiteId,
  toast,
  onSiteAdded,
  onSiteDeleted
}: UseSiteDialogsParams): UseSiteDialogsReturn {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState<Site | null>(null)

  const handleAddSite = useCallback(
    async (input: SiteInput): Promise<void> => {
      const site = await addSite(input)
      toast({ title: 'Site added', description: `${input.label || 'Site'} has been added.` })
      await onSiteAdded(site)
    },
    [addSite, toast, onSiteAdded]
  )

  const handleUpdateSite = useCallback(
    async (update: SiteUpdate): Promise<void> => {
      await updateSite(update)
      toast({ title: 'Site updated', description: 'Site settings have been saved.' })
    },
    [updateSite, toast]
  )

  const handleDeleteSite = useCallback(
    async (id: string): Promise<void> => {
      const site = sites.find((s) => s.id === id)
      await deleteSite(id)
      if (selectedSiteId === id) onSiteDeleted(id)
      toast({
        title: 'Site deleted',
        description: `${site?.label || 'Site'} has been removed.`
      })
    },
    [sites, deleteSite, selectedSiteId, onSiteDeleted, toast]
  )

  return {
    addDialogOpen,
    setAddDialogOpen,
    editSite,
    setEditSite,
    deletingSite,
    setDeletingSite,
    handleAddSite,
    handleUpdateSite,
    handleDeleteSite,
    testConnection
  }
}
