import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@renderer/components/layout/AppShell'
import { Sidebar, type SidebarView } from '@renderer/components/layout/Sidebar'
import { Button } from '@renderer/components/ui/button'
import { Plus } from 'lucide-react'
import { applySiteTint } from '@renderer/lib/site-colors'
import { SettingsView } from '@renderer/components/settings/SettingsView'
import { AddSiteDialog } from '@renderer/components/settings/AddSiteDialog'
import { WhatsNewDialog } from '@renderer/components/settings/WhatsNewDialog'
import { EditSiteDialog } from '@renderer/components/settings/EditSiteDialog'
import { DeleteSiteDialog } from '@renderer/components/settings/DeleteSiteDialog'
import { PostsView } from '@renderer/components/posts/PostsView'
import { SiteDashboard } from '@renderer/components/dashboard/SiteDashboard'
import { TemplateList } from '@renderer/components/templates/TemplateList'
import { TemplateEditor } from '@renderer/components/templates/TemplateEditor'
import { TemplatePickerDialog } from '@renderer/components/templates/TemplatePickerDialog'
import { MediaLibraryView } from '@renderer/components/media/MediaLibraryView'
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

  // ── Site tint ───────────────────────────────────────────────────────────
  // The selected site's colour is the app's accent, so each blog looks like itself.
  useEffect(() => {
    applySiteTint(selectedSite)
  }, [selectedSite?.id, selectedSite?.site_color]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Translucent sidebar (macOS vibrancy, set on the main window) ────────
  useEffect(() => {
    if (navigator.userAgent.includes('Macintosh')) document.documentElement.classList.add('vibrant')
  }, [])

  // ── File ▸ New Post (⌘N) ────────────────────────────────────────────────
  useEffect(() => {
    return window.electronAPI.onMenuNewPost(() => {
      if (selectedSiteId) tmpl.handleNewPost()
    })
  }, [selectedSiteId, tmpl])

  // ── Writing typeface ────────────────────────────────────────────────────
  // CSS picks --font-editor from this attribute (globals.css); serif is the default.
  useEffect(() => {
    document.documentElement.dataset.editorFont = settings.editorFontFamily ?? 'serif'
  }, [settings.editorFontFamily])

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
      // With auto-download on, the download is already underway — stay quiet
      // until it's ready
      if (status === 'available' && data?.auto && !data?.autoDownload) {
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

  // What's new — only after an update. shouldShowReleaseNotes() records a first
  // run silently and returns false, so a new install is never greeted with a
  // changelog for software it has not used yet.
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  useEffect(() => {
    window.electronAPI
      .shouldShowReleaseNotes()
      .then((show) => {
        if (show) setWhatsNewOpen(true)
      })
      .catch(() => {
        // Never block startup over a changelog.
      })
  }, [])

  // Auto-sync
  useAutoSync(selectedSite?.auto_sync ?? false, effectiveOnline, sync.handleAutoSync, settings.autoSyncInterval)

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
            onNewPost={tmpl.handleNewPost}
            onTemplates={() => {
              tmpl.setEditingTemplate(null)
              nav.goToTemplates()
            }}
          />
        )
      case 'media':
        if (!selectedSiteId) {
          return (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-1">Media Library</p>
              <p className="text-sm">Select a site to manage media.</p>
            </div>
          )
        }
        return <MediaLibraryView siteId={selectedSiteId} online={effectiveOnline} />
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
            onBack={nav.goToPosts}
          />
        )
      default:
        return <div />
    }
  }

  // The sidebar folds away while writing (editor, template editor) and in
  // Settings, which has its own navigation.
  const inEditor =
    (nav.currentView === 'posts' && nav.selectedPostId !== null) ||
    (nav.currentView === 'templates' && tmpl.editingTemplate !== null)
  const showSidebar = !!selectedSite && nav.currentView !== 'settings' && !inEditor

  const sidebarView: SidebarView | null =
    nav.currentView === 'settings' ? null : (nav.currentView as SidebarView)
  const navigate = (view: SidebarView): void => {
    if (view === 'dashboard') nav.goToDashboard()
    else if (view === 'posts') nav.goToPosts()
    else if (view === 'media') nav.goToMedia()
    else {
      tmpl.setEditingTemplate(null)
      nav.goToTemplates()
    }
  }

  const livePosts = posts.filter((p) => p.status !== 'trash')
  const sidebar =
    showSidebar && selectedSite ? (
      <Sidebar
        sites={sites}
        site={selectedSite}
        onSwitchSite={nav.handleSelectSite}
        onManageSites={nav.goToSettings}
        activeView={sidebarView}
        onNavigate={navigate}
        onSettings={nav.goToSettings}
        postCount={livePosts.length}
        templateCount={templates.length}
        syncing={sync.syncing}
        online={effectiveOnline}
        pending={sync.pendingChanges}
        conflicts={livePosts.filter((p) => p.conflict).length}
        unsyncedScheduled={livePosts.some((p) => p.status === 'future' && !p.synced)}
        lastSyncedAt={sync.lastSyncedAt ?? selectedSite.last_post_pull_at}
        onSync={sync.handleSync}
      />
    ) : null

  const newPostButton = (
    <Button size="sm" className="h-8 gap-1.5" onClick={tmpl.handleNewPost} title="New post (⌘N)">
      <Plus className="size-3.5" />
      New post
      <kbd className="ml-1 font-sans text-[10.5px] opacity-70">⌘N</kbd>
    </Button>
  )
  const header =
    nav.currentView === 'dashboard' && selectedSite
      ? { title: 'Home', actions: newPostButton }
      : nav.currentView === 'templates' && !tmpl.editingTemplate
        ? {
            title: 'Templates',
            actions: (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={tmpl.handleNewTemplate}>
                <Plus className="size-3.5" />
                New template
              </Button>
            )
          }
        : undefined

  return (
    <>
      <AppShell sidebar={sidebar} header={header}>
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

      <WhatsNewDialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen} afterUpdate />

      <Toaster />
    </>
  )
}

export default App
