import { useState, useEffect, useCallback } from 'react'
import { AppShell } from '@renderer/components/layout/AppShell'
import { SettingsView } from '@renderer/components/settings/SettingsView'
import { AddSiteDialog } from '@renderer/components/settings/AddSiteDialog'
import { EditSiteDialog } from '@renderer/components/settings/EditSiteDialog'
import { DeleteSiteDialog } from '@renderer/components/settings/DeleteSiteDialog'
import { PostsView } from '@renderer/components/posts/PostsView'
import { SiteDashboard } from '@renderer/components/dashboard/SiteDashboard'
import { Toaster } from '@renderer/components/ui/toaster'
import { ToastAction } from '@renderer/components/ui/toast'
import { useToast } from '@renderer/components/ui/use-toast'
import { useSites } from '@renderer/hooks/useSites'
import { usePosts } from '@renderer/hooks/usePosts'
import { useOnlineStatus } from '@renderer/hooks/useOnlineStatus'
import { useAutoSync } from '@renderer/hooks/useAutoSync'
import { useSettings } from '@renderer/hooks/useSettings'
import type { Site } from '@shared/types'
import type { PostListFilter } from '@renderer/components/posts/PostList'
import '@renderer/styles/globals.css'

type View = 'dashboard' | 'posts' | 'settings'

function App(): JSX.Element {
  const { sites, addSite, updateSite, deleteSite, testConnection } = useSites()
  const { toast } = useToast()
  const { online, justReconnected, clearReconnected } = useOnlineStatus()
  const { settings, updateSettings } = useSettings()

  const [currentView, setCurrentView] = useState<View>('settings')
  const [previousView, setPreviousView] = useState<View>('dashboard')
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [pendingMediaCount, setPendingMediaCount] = useState(0)
  const [unsyncedPostCount, setUnsyncedPostCount] = useState(0)

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [initialPostFilter, setInitialPostFilter] = useState<PostListFilter | null>(null)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState<Site | null>(null)

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null

  // Posts data — shared between dashboard and posts view
  const { posts, loading: postsLoading, refresh: refreshPosts, createPost, deletePost } = usePosts(selectedSiteId)

  // Effective online: real network AND not force-offline
  const effectiveOnline = online && !settings.forceOffline

  // ── Theme application ──────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement

    function applyTheme(dark: boolean): void {
      if (dark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    if (settings.theme === 'dark') {
      applyTheme(true)
      return
    }
    if (settings.theme === 'light') {
      applyTheme(false)
      return
    }

    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches)
    const handler = (e: MediaQueryListEvent): void => applyTheme(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  // ── Pending media / unsynced counts ────────────────────────────────────
  const refreshPendingMedia = useCallback(async () => {
    if (!selectedSiteId) {
      setPendingMediaCount(0)
      return
    }
    try {
      const queue = await window.electronAPI.getMediaQueue(selectedSiteId)
      setPendingMediaCount(queue.length)
    } catch {
      setPendingMediaCount(0)
    }
  }, [selectedSiteId])

  const refreshUnsyncedCount = useCallback(async () => {
    if (!selectedSiteId) {
      setUnsyncedPostCount(0)
      return
    }
    try {
      const count = await window.electronAPI.getUnsyncedPostCount(selectedSiteId)
      setUnsyncedPostCount(count)
    } catch {
      setUnsyncedPostCount(0)
    }
  }, [selectedSiteId])

  useEffect(() => {
    refreshPendingMedia()
    refreshUnsyncedCount()
    const interval = setInterval(() => {
      refreshPendingMedia()
      refreshUnsyncedCount()
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshPendingMedia, refreshUnsyncedCount])

  // ── Site handlers ──────────────────────────────────────────────────────
  async function handleAddSite(input: Parameters<typeof addSite>[0]): Promise<void> {
    const site = await addSite(input)
    toast({ title: 'Site added', description: `${input.label || 'Site'} has been added.` })

    // Auto-pull posts + schema for the new site
    setSelectedSiteId(site.id)
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('dashboard')
    try {
      setSyncing(true)
      const [postResult, schemaResult] = await Promise.all([
        window.electronAPI.pullPosts(site.id),
        window.electronAPI.pullAcfSchema(site.id)
      ])
      if (schemaResult.errors.length > 0) {
        toast({
          title: 'Initial sync complete with warnings',
          description: schemaResult.errors[0],
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Initial sync complete',
          description: `Posts: ${postResult.created} new, ${postResult.updated} updated. Schema: ${schemaResult.groupsUpdated} updated.`
        })
      }
    } catch {
      toast({ title: 'Initial sync failed', description: 'Could not sync with WordPress.', variant: 'destructive' })
    } finally {
      setSyncing(false)
      await refreshPosts()
    }
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

  const handleToolbarSync = useCallback(async (): Promise<void> => {
    if (!selectedSiteId) return
    try {
      setSyncing(true)
      const result = await window.electronAPI.syncSite(selectedSiteId)

      const parts: string[] = []
      if (result.pushed > 0) parts.push(`pushed ${result.pushed}`)
      if (result.pull.created > 0) parts.push(`pulled ${result.pull.created} new`)
      if (result.pull.updated > 0) parts.push(`${result.pull.updated} updated`)
      if (result.schemaPull.groupsUpdated > 0) parts.push(`${result.schemaPull.groupsUpdated} schema updated`)

      const allErrors = [...result.pushErrors, ...result.pull.errors, ...result.schemaPull.errors]

      if (allErrors.length > 0) {
        toast({
          title: 'Sync complete with warnings',
          description: allErrors[0],
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Sync complete',
          description: parts.length > 0 ? parts.join(', ') : 'Everything up to date'
        })
      }
    } catch {
      toast({ title: 'Sync failed', description: 'Could not sync with WordPress.', variant: 'destructive' })
    } finally {
      setSyncing(false)
      refreshUnsyncedCount()
      refreshPosts()
    }
  }, [selectedSiteId, toast, refreshUnsyncedCount, refreshPosts])

  // Reconnect toast
  useEffect(() => {
    if (justReconnected && selectedSiteId) {
      toast({
        title: 'Back online',
        description: 'Your internet connection has been restored.',
        action: (
          <ToastAction altText="Sync now" onClick={handleToolbarSync}>
            Sync now
          </ToastAction>
        )
      })
      clearReconnected()
    }
  }, [justReconnected, selectedSiteId, toast, handleToolbarSync, clearReconnected])

  // ── Cmd+, keyboard shortcut for settings ────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setCurrentView('settings')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-sync
  useAutoSync(selectedSite?.auto_sync ?? false, effectiveOnline, handleToolbarSync, settings.autoSyncInterval)

  function handleSelectSite(site: Site): void {
    setSelectedSiteId(site.id)
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('dashboard')
  }

  const handleDashboardSelectPost = useCallback((id: string) => {
    setPreviousView('dashboard')
    setSelectedPostId(id)
    setInitialPostFilter(null)
    setCurrentView('posts')
  }, [])

  const handleDashboardNewPost = useCallback(async () => {
    setPreviousView('dashboard')
    const post = await createPost()
    setSelectedPostId(post.id)
    setInitialPostFilter(null)
    setCurrentView('posts')
  }, [createPost])

  const handleDashboardSeeAll = useCallback((filter?: PostListFilter) => {
    setPreviousView('dashboard')
    setSelectedPostId(null)
    setInitialPostFilter(filter ?? null)
    setCurrentView('posts')
  }, [])

  const handleBackToDashboard = useCallback(() => {
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('dashboard')
  }, [])

  const handlePostListSelectPost = useCallback((id: string | null) => {
    if (id !== null) setPreviousView('posts')
    setSelectedPostId(id)
  }, [])

  const handlePostBack = useCallback(() => {
    setSelectedPostId(null)
    if (previousView === 'dashboard') {
      setCurrentView('dashboard')
    }
  }, [previousView])

  function renderContent(): JSX.Element {
    switch (currentView) {
      case 'settings':
        return (
          <SettingsView
            sites={sites}
            onAddSite={() => setAddDialogOpen(true)}
            onEditSite={(site) => setEditSite(site)}
            onDeleteSite={(site) => setDeletingSite(site)}
            onSelectSite={handleSelectSite}
            settings={settings}
            onUpdateSettings={updateSettings}
            onClose={selectedSiteId ? () => setCurrentView('dashboard') : undefined}
          />
        )
      case 'dashboard':
        if (!selectedSiteId) {
          return (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-1">Posts</p>
              <p className="text-sm">Select a site to view posts.</p>
            </div>
          )
        }
        return (
          <SiteDashboard
            posts={posts}
            loading={(postsLoading || syncing) && posts.length === 0}
            onSelectPost={handleDashboardSelectPost}
            onNewPost={handleDashboardNewPost}
            onSeeAllPosts={handleDashboardSeeAll}
          />
        )
      case 'posts':
        if (!selectedSiteId) {
          return (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-1">Posts</p>
              <p className="text-sm">Select a site to view posts.</p>
            </div>
          )
        }
        return (
          <PostsView
            siteId={selectedSiteId}
            pulling={syncing}
            online={effectiveOnline}
            editorFontSize={settings.editorFontSize}
            selectedPostId={selectedPostId}
            onSelectPost={handlePostListSelectPost}
            onBack={handlePostBack}
            initialFilter={initialPostFilter}
            posts={posts}
            postsLoading={postsLoading}
            refreshPosts={refreshPosts}
            createPost={createPost}
            deletePost={deletePost}
          />
        )
      default:
        return <div />
    }
  }

  return (
    <>
      <AppShell
        onSettingsClick={() => setCurrentView('settings')}
        onSyncClick={handleToolbarSync}
        syncing={syncing}
        showSync={(currentView === 'posts' || currentView === 'dashboard') && !!selectedSiteId}
        siteName={currentView !== 'settings' ? selectedSite?.label : undefined}
        onSiteNameClick={currentView === 'posts' ? handleBackToDashboard : undefined}
        pendingMediaCount={currentView !== 'settings' ? pendingMediaCount : 0}
        online={effectiveOnline}
        unsyncedPostCount={currentView !== 'settings' ? unsyncedPostCount : 0}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSwitchSite={currentView !== 'settings' ? handleSelectSite : undefined}
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
