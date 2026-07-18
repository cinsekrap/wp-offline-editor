import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@renderer/components/layout/AppShell'
import { SettingsView } from '@renderer/components/settings/SettingsView'
import { AddSiteDialog } from '@renderer/components/settings/AddSiteDialog'
import { EditSiteDialog } from '@renderer/components/settings/EditSiteDialog'
import { DeleteSiteDialog } from '@renderer/components/settings/DeleteSiteDialog'
import { PostsView } from '@renderer/components/posts/PostsView'
import { SiteDashboard } from '@renderer/components/dashboard/SiteDashboard'
import { TemplateList } from '@renderer/components/templates/TemplateList'
import { TemplateEditor } from '@renderer/components/templates/TemplateEditor'
import { TemplatePickerDialog } from '@renderer/components/templates/TemplatePickerDialog'
import { MassPushDialog } from '@renderer/components/sync/MassPushDialog'
import { Toaster } from '@renderer/components/ui/toaster'
import { ToastAction } from '@renderer/components/ui/toast'
import { useToast } from '@renderer/components/ui/use-toast'
import { useSites } from '@renderer/hooks/useSites'
import { usePosts } from '@renderer/hooks/usePosts'
import { useOnlineStatus } from '@renderer/hooks/useOnlineStatus'
import { useAutoSync } from '@renderer/hooks/useAutoSync'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTemplates } from '@renderer/hooks/useTemplates'
import { useNavigation } from '@renderer/hooks/useNavigation'
import { useSyncStatus } from '@renderer/hooks/useSyncStatus'
import { useSiteDialogs } from '@renderer/hooks/useSiteDialogs'
import { useTemplateActions } from '@renderer/hooks/useTemplateActions'
import type { Site } from '@shared/types'
import '@renderer/styles/globals.css'

function App(): JSX.Element {
  const { sites, loading: sitesLoading, addSite, updateSite, deleteSite, testConnection } = useSites()
  const { toast } = useToast()
  const { online, justReconnected, clearReconnected } = useOnlineStatus()
  const { settings, updateSettings } = useSettings()
  const {
    templates,
    loading: templatesLoading,
    create: createTemplate,
    update: updateTemplate,
    remove: removeTemplate,
    refresh: refreshTemplates
  } = useTemplates()

  // Selected site stays here — usePosts depends on it as a parameter
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null
  const effectiveOnline = online && !settings.forceOffline

  // Posts — shared between dashboard and posts view
  const { posts, loading: postsLoading, refresh: refreshPosts, createPost, deletePost } = usePosts(selectedSiteId)

  // ── Extracted hooks ─────────────────────────────────────────────────────

  const nav = useNavigation({ sites, sitesLoading, onSelectSiteId: setSelectedSiteId })

  const sync = useSyncStatus({ selectedSiteId, toast, refreshPosts })

  const handleSiteAdded = useCallback(
    async (site: Site) => {
      setSelectedSiteId(site.id)
      nav.goToDashboard()
      try {
        sync.setSyncing(true)
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
        toast({
          title: 'Initial sync failed',
          description: 'Could not sync with WordPress.',
          variant: 'destructive'
        })
      } finally {
        sync.setSyncing(false)
        await refreshPosts()
      }
    },
    [nav, sync, toast, refreshPosts]
  )

  const dialogs = useSiteDialogs({
    sites,
    addSite,
    updateSite,
    deleteSite,
    testConnection,
    selectedSiteId,
    toast,
    onSiteAdded: handleSiteAdded,
    // Fall back to another site so settings keeps its Close button; null only when none remain
    onSiteDeleted: useCallback(
      (id: string) => setSelectedSiteId(sites.find((s) => s.id !== id)?.id ?? null),
      [sites]
    )
  })

  const tmpl = useTemplateActions({
    templates,
    createTemplate,
    updateTemplate,
    removeTemplate,
    refreshTemplates,
    selectedSiteId,
    createPost,
    toast,
    onPostCreated: useCallback(
      (postId: string) => {
        refreshPosts()
        nav.navigateToNewPost(postId)
      },
      [refreshPosts, nav]
    )
  })

  // ── Theme ───────────────────────────────────────────────────────────────
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

  // ── Post-import warning ────────────────────────────────────────────────
  useEffect(() => {
    const flag = localStorage.getItem('npp-post-import')
    if (flag) {
      localStorage.removeItem('npp-post-import')
      toast({
        title: 'Import successful',
        description: 'Re-enter your site passwords in Settings > Sites to resume syncing.',
        variant: 'warning'
      })
      nav.goToSettings()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update toasts (background checks piggyback on sync) ────────────────
  const updateNotifiedRef = useRef<{ availableVersion?: string; ready?: boolean }>({})
  useEffect(() => {
    return window.electronAPI.onUpdaterEvent((status, data) => {
      const notified = updateNotifiedRef.current
      if (status === 'available' && data?.auto) {
        const version = (data?.version as string) ?? ''
        if (notified.availableVersion === version) return
        notified.availableVersion = version
        toast({
          title: 'Update available',
          description: `NP Presspad ${version} is ready to download.`,
          action: (
            <ToastAction altText="Download" onClick={() => window.electronAPI.downloadUpdate()}>
              Download
            </ToastAction>
          )
        })
      } else if (status === 'ready' && !notified.ready) {
        notified.ready = true
        toast({
          title: 'Update downloaded',
          description: 'Restart to finish installing. (Quitting the app also installs it.)',
          action: (
            <ToastAction altText="Restart now" onClick={() => window.electronAPI.installUpdate()}>
              Restart now
            </ToastAction>
          )
        })
      }
    })
  }, [toast])

  // ── Reconnect toast ─────────────────────────────────────────────────────
  useEffect(() => {
    if (justReconnected && selectedSiteId) {
      toast({
        title: 'Back online',
        description: 'Your internet connection has been restored.',
        action: (
          <ToastAction altText="Sync now" onClick={sync.handleSync}>
            Sync now
          </ToastAction>
        )
      })
      clearReconnected()
    }
  }, [justReconnected, selectedSiteId, toast, sync.handleSync, clearReconnected])

  // Auto-sync
  useAutoSync(selectedSite?.auto_sync ?? false, effectiveOnline, sync.handleSync, settings.autoSyncInterval)

  // ── View rendering ──────────────────────────────────────────────────────

  function renderContent(): JSX.Element {
    switch (nav.currentView) {
      case 'settings':
        return (
          <SettingsView
            sites={sites}
            onAddSite={() => dialogs.setAddDialogOpen(true)}
            onEditSite={(site) => dialogs.setEditSite(site)}
            onDeleteSite={(site) => dialogs.setDeletingSite(site)}
            onSelectSite={nav.handleSelectSite}
            settings={settings}
            onUpdateSettings={updateSettings}
            onClose={selectedSiteId ? nav.goToDashboard : undefined}
            initialSection={sites.length === 0 ? 'sites' : undefined}
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
            siteId={selectedSiteId}
            posts={posts}
            loading={(postsLoading || sync.syncing) && posts.length === 0}
            onSelectPost={nav.selectPostFromDashboard}
            onNewPost={tmpl.handleNewPost}
            onSeeAllPosts={nav.seeAllFromDashboard}
            writingChartMode={settings.writingChartMode}
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
            pulling={sync.syncing}
            online={effectiveOnline}
            editorFontSize={settings.editorFontSize}
            selectedPostId={nav.selectedPostId}
            onSelectPost={nav.selectPostFromList}
            onBack={nav.backFromPost}
            initialFilter={nav.initialPostFilter}
            posts={posts}
            postsLoading={postsLoading}
            refreshPosts={refreshPosts}
            createPost={createPost}
            deletePost={deletePost}
          />
        )
      case 'templates':
        if (tmpl.editingTemplate) {
          return (
            <TemplateEditor
              template={tmpl.editingTemplate}
              onBack={tmpl.handleTemplateBack}
              onSave={tmpl.handleSaveTemplate}
            />
          )
        }
        return (
          <TemplateList
            templates={templates}
            loading={templatesLoading}
            onNew={tmpl.handleNewTemplate}
            onSelect={(t) => tmpl.setEditingTemplate(t)}
            onDelete={tmpl.handleDeleteTemplate}
          />
        )
      default:
        return <div />
    }
  }

  const notSettings = nav.currentView !== 'settings'

  return (
    <>
      <AppShell
        onSettingsClick={nav.goToSettings}
        onPostsClick={selectedSiteId && notSettings ? nav.goToPosts : undefined}
        onTemplatesClick={
          selectedSiteId && notSettings
            ? () => {
                tmpl.setEditingTemplate(null)
                nav.goToTemplates()
              }
            : undefined
        }
        onSyncClick={sync.handleSync}
        syncing={sync.syncing}
        showSync={notSettings && !!selectedSiteId}
        siteName={notSettings ? selectedSite?.label : undefined}
        onSiteNameClick={
          notSettings && nav.currentView !== 'dashboard' ? nav.backToDashboard : undefined
        }
        activeView={notSettings ? nav.currentView : undefined}
        pendingMediaCount={notSettings ? sync.pendingMediaCount : 0}
        online={effectiveOnline}
        unsyncedPostCount={notSettings ? sync.unsyncedPostCount : 0}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSwitchSite={notSettings ? nav.handleSelectSite : undefined}
      >
        {renderContent()}
      </AppShell>

      <AddSiteDialog
        open={dialogs.addDialogOpen}
        onOpenChange={dialogs.setAddDialogOpen}
        onSave={dialogs.handleAddSite}
        onTestConnection={dialogs.testConnection}
      />

      <EditSiteDialog
        site={dialogs.editSite}
        open={dialogs.editSite !== null}
        onOpenChange={(open) => {
          if (!open) dialogs.setEditSite(null)
        }}
        onSave={dialogs.handleUpdateSite}
      />

      <DeleteSiteDialog
        site={dialogs.deletingSite}
        open={dialogs.deletingSite !== null}
        onOpenChange={(open) => {
          if (!open) dialogs.setDeletingSite(null)
        }}
        onConfirm={dialogs.handleDeleteSite}
      />

      <TemplatePickerDialog
        open={tmpl.templatePickerOpen}
        onOpenChange={tmpl.setTemplatePickerOpen}
        templates={templates}
        onBlank={tmpl.handleBlankPost}
        onSelect={tmpl.handleNewPostFromTemplate}
      />

      <MassPushDialog
        count={sync.massPushPaused?.count ?? 0}
        open={sync.massPushPaused !== null}
        onOpenChange={(open) => {
          if (!open) sync.clearMassPushPaused()
        }}
        onConfirm={sync.handleForceSync}
      />

      <Toaster />
    </>
  )
}

export default App
