import { ipcMain, app, dialog } from 'electron'
import { join } from 'path'
import { copyFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { getAllSites, getSiteById, addSite, updateSite, deleteSite } from './site-service'
import { testWpConnection } from './wp-client'
import { pullPostsForSite, getAllPostsForSite, getPostById, createPost, updatePost, deletePost } from './post-service'
import { pushPostToWp, resolveConflict, getUnsyncedPostCount, syncSite } from './sync-service'
import { pullAcfSchemaForSite, getAcfSchemasForSite } from './acf-service'
import {
  saveMediaLocally,
  getMediaForPost,
  getMediaQueue,
  uploadMediaToWp,
  deleteMedia,
  replaceMediaFile
} from './media-service'
import { getMediaLibraryForSite } from './media-library-service'
import { getShortcodesForSite } from './shortcode-service'
import { getSettings, updateSettings } from './settings-service'
import { checkForUpdates, downloadUpdate, installUpdate } from './updater'
import type { SiteInput, SiteUpdate, PostInput, PostUpdate, AppSettings } from '@shared/types'

export function registerIpcHandlers(): void {
  // ── Sites ────────────────────────────────────────────────────────────────

  ipcMain.handle('sites:get-all', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:get', (_event, id: string) => {
    return getSiteById(id)
  })

  ipcMain.handle('sites:add', (_event, input: SiteInput) => {
    return addSite(input)
  })

  ipcMain.handle('sites:update', (_event, update: SiteUpdate) => {
    return updateSite(update)
  })

  ipcMain.handle('sites:delete', (_event, id: string) => {
    deleteSite(id)
  })

  ipcMain.handle(
    'sites:test-connection',
    (_event, url: string, username: string, password: string) => {
      return testWpConnection(url, username, password)
    }
  )

  // ── Posts ────────────────────────────────────────────────────────────────

  ipcMain.handle('posts:pull', (_event, siteId: string) => {
    return pullPostsForSite(siteId)
  })

  ipcMain.handle('posts:get-all', (_event, siteId: string) => {
    return getAllPostsForSite(siteId)
  })

  ipcMain.handle('posts:get', (_event, id: string) => {
    return getPostById(id)
  })

  ipcMain.handle('posts:create', (_event, input: PostInput) => {
    return createPost(input)
  })

  ipcMain.handle('posts:update', (_event, update: PostUpdate) => {
    return updatePost(update)
  })

  ipcMain.handle('posts:delete', (_event, id: string) => {
    deletePost(id)
  })

  ipcMain.handle('posts:push', (_event, postId: string) => {
    return pushPostToWp(postId)
  })

  ipcMain.handle(
    'posts:resolve-conflict',
    (_event, postId: string, strategy: 'keep-mine' | 'keep-theirs' | 'fork') => {
      return resolveConflict(postId, strategy)
    }
  )

  ipcMain.handle('posts:unsynced-count', (_event, siteId: string) => {
    return getUnsyncedPostCount(siteId)
  })

  ipcMain.handle('site:sync', (_event, siteId: string) => {
    return syncSite(siteId)
  })

  // ── ACF Schema ──────────────────────────────────────────────────────────

  ipcMain.handle('acf:pull-schema', (_event, siteId: string) => {
    return pullAcfSchemaForSite(siteId)
  })

  ipcMain.handle('acf:get-schemas', (_event, siteId: string) => {
    return getAcfSchemasForSite(siteId)
  })

  // ── Media Library ──────────────────────────────────────────────────────────

  ipcMain.handle('media-library:get', (_event, siteId: string) => {
    return getMediaLibraryForSite(siteId)
  })

  // ── Media ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'media:save-local',
    (_event, siteId: string, postLocalId: string, filename: string, buffer: ArrayBuffer) => {
      return saveMediaLocally(siteId, postLocalId, filename, Buffer.from(buffer))
    }
  )

  ipcMain.handle('media:get-for-post', (_event, postLocalId: string) => {
    return getMediaForPost(postLocalId)
  })

  ipcMain.handle('media:get-queue', (_event, siteId: string) => {
    return getMediaQueue(siteId)
  })

  ipcMain.handle('media:upload', (_event, mediaId: string) => {
    return uploadMediaToWp(mediaId)
  })

  ipcMain.handle('media:delete', (_event, id: string) => {
    deleteMedia(id)
  })

  ipcMain.handle('media:replace-file', (_event, mediaId: string, buffer: ArrayBuffer) => {
    return replaceMediaFile(mediaId, Buffer.from(buffer))
  })

  // ── Shortcodes ──────────────────────────────────────────────────────────

  ipcMain.handle('shortcodes:get', (_event, siteId: string) => {
    return getShortcodesForSite(siteId)
  })

  // ── Plugin ────────────────────────────────────────────────────────────────

  ipcMain.handle('plugin:save-companion', async () => {
    const zipDir = is.dev ? join(app.getAppPath(), 'resources') : process.resourcesPath!
    const zipPath = join(zipDir, 'wp-offline-editor-companion.zip')

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Companion Plugin',
      defaultPath: join(app.getPath('downloads'), 'wp-offline-editor-companion.zip'),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })

    if (canceled || !filePath) return false

    copyFileSync(zipPath, filePath)
    return true
  })

  // ── Settings ────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    return updateSettings(patch)
  })

  // ── App ──────────────────────────────────────────────────────────────────

  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:arch', () => {
    return process.arch
  })

  // ── Updater ─────────────────────────────────────────────────────────────

  ipcMain.handle('updater:check', () => {
    checkForUpdates()
  })

  ipcMain.handle('updater:download', () => {
    downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    installUpdate()
  })
}
