import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '@shared/types'

const api: ElectronAPI = {
  // Sites
  getSites: () => ipcRenderer.invoke('sites:get-all'),
  getSite: (id) => ipcRenderer.invoke('sites:get', id),
  addSite: (input) => ipcRenderer.invoke('sites:add', input),
  updateSite: (update) => ipcRenderer.invoke('sites:update', update),
  deleteSite: (id) => ipcRenderer.invoke('sites:delete', id),
  testConnection: (url, username, password) =>
    ipcRenderer.invoke('sites:test-connection', url, username, password),

  // Posts
  pullPosts: (siteId) => ipcRenderer.invoke('posts:pull', siteId),
  getPosts: (siteId) => ipcRenderer.invoke('posts:get-all', siteId),
  getPost: (id) => ipcRenderer.invoke('posts:get', id),
  createPost: (input) => ipcRenderer.invoke('posts:create', input),
  updatePost: (update) => ipcRenderer.invoke('posts:update', update),
  deletePost: (id) => ipcRenderer.invoke('posts:delete', id),
  pushPost: (postId) => ipcRenderer.invoke('posts:push', postId),
  resolveConflict: (postId, strategy) =>
    ipcRenderer.invoke('posts:resolve-conflict', postId, strategy),
  getUnsyncedPostCount: (siteId) => ipcRenderer.invoke('posts:unsynced-count', siteId),
  getTotalUnsyncedCount: () => ipcRenderer.invoke('posts:total-unsynced-count'),
  syncSite: (siteId, options) => ipcRenderer.invoke('site:sync', siteId, options),

  // ACF Schema
  pullAcfSchema: (siteId) => ipcRenderer.invoke('acf:pull-schema', siteId),
  getAcfSchemas: (siteId) => ipcRenderer.invoke('acf:get-schemas', siteId),

  // Taxonomy
  getTaxonomyTerms: (siteId, taxonomy) => ipcRenderer.invoke('taxonomy:get-terms', siteId, taxonomy),

  // Media Library
  getMediaLibrary: (siteId) => ipcRenderer.invoke('media-library:get', siteId),

  // Media
  saveMediaLocal: (siteId, postLocalId, filename, buffer) =>
    ipcRenderer.invoke('media:save-local', siteId, postLocalId, filename, buffer),
  getMediaForPost: (postLocalId) => ipcRenderer.invoke('media:get-for-post', postLocalId),
  getMediaQueue: (siteId) => ipcRenderer.invoke('media:get-queue', siteId),
  uploadMedia: (mediaId) => ipcRenderer.invoke('media:upload', mediaId),
  deleteMedia: (id) => ipcRenderer.invoke('media:delete', id),
  replaceMediaFile: (mediaId, buffer) => ipcRenderer.invoke('media:replace-file', mediaId, buffer),
  saveMediaFromLibrary: (siteId, postLocalId, libraryItemId) =>
    ipcRenderer.invoke('media:save-from-library', siteId, postLocalId, libraryItemId),

  // Markdown
  importMarkdown: () => ipcRenderer.invoke('markdown:import'),
  exportMarkdown: (html, name) => ipcRenderer.invoke('markdown:export', html, name),

  // Templates
  getTemplates: () => ipcRenderer.invoke('templates:get-all'),
  getTemplate: (id) => ipcRenderer.invoke('templates:get', id),
  createTemplate: (input) => ipcRenderer.invoke('templates:create', input),
  updateTemplate: (update) => ipcRenderer.invoke('templates:update', update),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),

  // Scratchpads
  getScratchpads: (siteId) => ipcRenderer.invoke('scratchpads:get-all', siteId),
  getScratchpad: (id) => ipcRenderer.invoke('scratchpads:get', id),
  createScratchpad: (input) => ipcRenderer.invoke('scratchpads:create', input),
  updateScratchpad: (update) => ipcRenderer.invoke('scratchpads:update', update),
  deleteScratchpad: (id) => ipcRenderer.invoke('scratchpads:delete', id),
  linkScratchpad: (postId, scratchpadId) => ipcRenderer.invoke('scratchpads:link', postId, scratchpadId),
  unlinkScratchpad: (postId) => ipcRenderer.invoke('scratchpads:unlink', postId),

  // Writing Stats
  getWritingStats: (siteId) => ipcRenderer.invoke('stats:get-writing', siteId),
  getWpAuthors: (siteId) => ipcRenderer.invoke('stats:get-authors', siteId),

  // Search
  searchPosts: (query, siteId) => ipcRenderer.invoke('posts:search', query, siteId),

  // Preview
  getPreviewCss: (siteId) => ipcRenderer.invoke('preview:get-css', siteId),

  // Revisions
  getRevisions: (postId) => ipcRenderer.invoke('revisions:get-all', postId),
  captureRevision: (postId) => ipcRenderer.invoke('revisions:capture', postId),
  restoreRevision: (revisionId) => ipcRenderer.invoke('revisions:restore', revisionId),

  // Bulk operations
  bulkUpdateStatus: (postIds, status) => ipcRenderer.invoke('posts:bulk-status', { postIds, status }),
  bulkDeletePosts: (postIds) => ipcRenderer.invoke('posts:bulk-delete', { postIds }),

  // Shortcodes
  getShortcodes: (siteId) => ipcRenderer.invoke('shortcodes:get', siteId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // Plugin
  saveCompanionPlugin: () => ipcRenderer.invoke('plugin:save-companion'),

  // Data management
  clearSiteData: (siteId) => ipcRenderer.invoke('app:clear-site-data', siteId),
  clearSiteContent: (siteId) => ipcRenderer.invoke('app:clear-site-content', siteId),
  clearAllData: () => ipcRenderer.invoke('app:clear-all-data'),

  // Export/Import
  exportData: (password, destPath) => ipcRenderer.invoke('app:export-data', password, destPath),
  importReadMetadata: (archivePath) => ipcRenderer.invoke('app:import-metadata', archivePath),
  importData: (password, archivePath) => ipcRenderer.invoke('app:import-data', password, archivePath),
  showSaveExportDialog: () => ipcRenderer.invoke('dialog:save-export'),
  showOpenImportDialog: () => ipcRenderer.invoke('dialog:open-import'),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getArch: () => ipcRenderer.invoke('app:arch'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onCountsChanged: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('counts-changed', handler)
    return (): void => {
      ipcRenderer.removeListener('counts-changed', handler)
    }
  },

  onUpdaterEvent: (callback: (status: string, data?: Record<string, unknown>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, data?: Record<string, unknown>): void => {
      callback(status, data)
    }
    ipcRenderer.on('updater:status', handler)
    return (): void => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  },

  openScratchpadWindow: (scratchpadId: string) => ipcRenderer.invoke('scratchpad-window:open', scratchpadId),
  isScratchpadWindowOpen: (scratchpadId: string) => ipcRenderer.invoke('scratchpad-window:is-open', scratchpadId),

  onScratchpadChanged: (callback: (id: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string): void => callback(id)
    ipcRenderer.on('scratchpad-changed', handler)
    return (): void => {
      ipcRenderer.removeListener('scratchpad-changed', handler)
    }
  },

  onScratchpadWindowStatus: (callback: (id: string, open: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, open: boolean): void => callback(id, open)
    ipcRenderer.on('scratchpad-window-status', handler)
    return (): void => {
      ipcRenderer.removeListener('scratchpad-window-status', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
