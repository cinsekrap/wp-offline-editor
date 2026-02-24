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
  syncSite: (siteId) => ipcRenderer.invoke('site:sync', siteId),

  // ACF Schema
  pullAcfSchema: (siteId) => ipcRenderer.invoke('acf:pull-schema', siteId),
  getAcfSchemas: (siteId) => ipcRenderer.invoke('acf:get-schemas', siteId),

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

  // Shortcodes
  getShortcodes: (siteId) => ipcRenderer.invoke('shortcodes:get', siteId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // Plugin
  saveCompanionPlugin: () => ipcRenderer.invoke('plugin:save-companion'),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getArch: () => ipcRenderer.invoke('app:arch'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (callback: (status: string, data?: Record<string, unknown>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, data?: Record<string, unknown>): void => {
      callback(status, data)
    }
    ipcRenderer.on('updater:status', handler)
    return (): void => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
