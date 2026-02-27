import { ipcMain, app, dialog } from 'electron'
import { join } from 'path'
import { copyFileSync, readFileSync, writeFileSync } from 'fs'
import { z } from 'zod'
import { is } from '@electron-toolkit/utils'
import { getAllSites, getSiteById, addSite, updateSite, deleteSite } from './site-service'
import { testWpConnection } from './wp-client'
import { pullPostsForSite, getAllPostsForSite, getPostById, createPost, updatePost } from './post-service'
import { pushPostToWp, deletePostFromWp, resolveConflict, getUnsyncedPostCount, syncSite } from './sync-service'
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
import { getTaxonomyTerms } from './taxonomy-service'
import { getShortcodesForSite } from './shortcode-service'
import { getSettings, updateSettings } from './settings-service'
import { htmlToMarkdown, markdownToHtml } from './markdown-service'
import { getAllTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate } from './template-service'
import { checkForUpdates, downloadUpdate, installUpdate } from './updater'
import {
  uuidSchema,
  SiteInputSchema,
  SiteUpdateSchema,
  PostInputSchema,
  PostUpdateSchema,
  ConflictStrategySchema,
  TaxonomySchema,
  AppSettingsSchema,
  TemplateInputSchema,
  TemplateUpdateSchema
} from './ipc-schemas'

export function registerIpcHandlers(): void {
  // ── Sites ────────────────────────────────────────────────────────────────

  ipcMain.handle('sites:get-all', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:get', (_event, id: unknown) => {
    return getSiteById(uuidSchema.parse(id))
  })

  ipcMain.handle('sites:add', (_event, input: unknown) => {
    return addSite(SiteInputSchema.parse(input))
  })

  ipcMain.handle('sites:update', (_event, update: unknown) => {
    return updateSite(SiteUpdateSchema.parse(update))
  })

  ipcMain.handle('sites:delete', (_event, id: unknown) => {
    deleteSite(uuidSchema.parse(id))
  })

  ipcMain.handle(
    'sites:test-connection',
    (_event, url: unknown, username: unknown, password: unknown) => {
      return testWpConnection(
        z.string().url().parse(url),
        z.string().min(1).parse(username),
        z.string().min(1).parse(password)
      )
    }
  )

  // ── Posts ────────────────────────────────────────────────────────────────

  ipcMain.handle('posts:pull', (_event, siteId: unknown) => {
    return pullPostsForSite(uuidSchema.parse(siteId))
  })

  ipcMain.handle('posts:get-all', (_event, siteId: unknown) => {
    return getAllPostsForSite(uuidSchema.parse(siteId))
  })

  ipcMain.handle('posts:get', (_event, id: unknown) => {
    return getPostById(uuidSchema.parse(id))
  })

  ipcMain.handle('posts:create', (_event, input: unknown) => {
    return createPost(PostInputSchema.parse(input))
  })

  ipcMain.handle('posts:update', (_event, update: unknown) => {
    return updatePost(PostUpdateSchema.parse(update))
  })

  ipcMain.handle('posts:delete', (_event, id: unknown) => {
    return deletePostFromWp(uuidSchema.parse(id))
  })

  ipcMain.handle('posts:push', (_event, postId: unknown) => {
    return pushPostToWp(uuidSchema.parse(postId))
  })

  ipcMain.handle(
    'posts:resolve-conflict',
    (_event, postId: unknown, strategy: unknown) => {
      return resolveConflict(uuidSchema.parse(postId), ConflictStrategySchema.parse(strategy))
    }
  )

  ipcMain.handle('posts:unsynced-count', (_event, siteId: unknown) => {
    return getUnsyncedPostCount(uuidSchema.parse(siteId))
  })

  ipcMain.handle('site:sync', (_event, siteId: unknown) => {
    return syncSite(uuidSchema.parse(siteId))
  })

  // ── ACF Schema ──────────────────────────────────────────────────────────

  ipcMain.handle('acf:pull-schema', (_event, siteId: unknown) => {
    return pullAcfSchemaForSite(uuidSchema.parse(siteId))
  })

  ipcMain.handle('acf:get-schemas', (_event, siteId: unknown) => {
    return getAcfSchemasForSite(uuidSchema.parse(siteId))
  })

  // ── Taxonomy ───────────────────────────────────────────────────────────────

  ipcMain.handle('taxonomy:get-terms', (_event, siteId: unknown, taxonomy: unknown) => {
    return getTaxonomyTerms(uuidSchema.parse(siteId), TaxonomySchema.parse(taxonomy))
  })

  // ── Media Library ──────────────────────────────────────────────────────────

  ipcMain.handle('media-library:get', (_event, siteId: unknown) => {
    return getMediaLibraryForSite(uuidSchema.parse(siteId))
  })

  // ── Media ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'media:save-local',
    (_event, siteId: unknown, postLocalId: unknown, filename: unknown, buffer: unknown) => {
      if (!(buffer instanceof ArrayBuffer)) throw new Error('Expected ArrayBuffer for media buffer')
      return saveMediaLocally(
        uuidSchema.parse(siteId),
        uuidSchema.parse(postLocalId),
        z.string().min(1).parse(filename),
        Buffer.from(buffer)
      )
    }
  )

  ipcMain.handle('media:get-for-post', (_event, postLocalId: unknown) => {
    return getMediaForPost(uuidSchema.parse(postLocalId))
  })

  ipcMain.handle('media:get-queue', (_event, siteId: unknown) => {
    return getMediaQueue(uuidSchema.parse(siteId))
  })

  ipcMain.handle('media:upload', (_event, mediaId: unknown) => {
    return uploadMediaToWp(uuidSchema.parse(mediaId))
  })

  ipcMain.handle('media:delete', (_event, id: unknown) => {
    deleteMedia(uuidSchema.parse(id))
  })

  ipcMain.handle('media:replace-file', (_event, mediaId: unknown, buffer: unknown) => {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Expected ArrayBuffer for media buffer')
    return replaceMediaFile(uuidSchema.parse(mediaId), Buffer.from(buffer))
  })

  // ── Shortcodes ──────────────────────────────────────────────────────────

  ipcMain.handle('shortcodes:get', (_event, siteId: unknown) => {
    return getShortcodesForSite(uuidSchema.parse(siteId))
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

  // ── Markdown ──────────────────────────────────────────────────────────

  ipcMain.handle('markdown:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Markdown',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const md = readFileSync(filePaths[0], 'utf-8')
    return markdownToHtml(md)
  })

  ipcMain.handle('markdown:export', async (_event, html: unknown, name: unknown) => {
    const htmlStr = z.string().parse(html)
    const nameStr = z.string().optional().parse(name) || 'post'
    const md = htmlToMarkdown(htmlStr)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export as Markdown',
      defaultPath: join(app.getPath('downloads'), `${nameStr}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return false
    writeFileSync(filePath, md, 'utf-8')
    return true
  })

  // ── Templates ──────────────────────────────────────────────────────────

  ipcMain.handle('templates:get-all', () => {
    return getAllTemplates()
  })

  ipcMain.handle('templates:get', (_event, id: unknown) => {
    return getTemplateById(z.string().parse(id))
  })

  ipcMain.handle('templates:create', (_event, input: unknown) => {
    return createTemplate(TemplateInputSchema.parse(input))
  })

  ipcMain.handle('templates:update', (_event, update: unknown) => {
    return updateTemplate(TemplateUpdateSchema.parse(update))
  })

  ipcMain.handle('templates:delete', (_event, id: unknown) => {
    deleteTemplate(z.string().parse(id))
  })

  // ── Settings ────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:update', (_event, patch: unknown) => {
    return updateSettings(AppSettingsSchema.parse(patch))
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
