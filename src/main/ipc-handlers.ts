import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { copyFileSync, readFileSync, writeFileSync } from 'fs'
import { z } from 'zod'
import { is } from '@electron-toolkit/utils'
import { getAllSites, getSiteById, addSite, updateSite, deleteSite, clearSiteData, clearSiteContent } from './site-service'
import { testWpConnection, fetchAuthors } from './wp-client'
import { getCredential } from './credentials'
import { pullPostsForSite, getAllPostsForSite, getPostById, createPost, updatePost, bulkUpdateStatus, softDeletePost, bulkSoftDeletePosts } from './post-service'
import { pushPostToWp, resolveConflict, getUnsyncedPostCount, getTotalUnsyncedCount, syncSite } from './sync-service'
import { pullAcfSchemaForSite, getAcfSchemasForSite } from './acf-service'
import {
  saveMediaLocally,
  saveMediaFromLibrary,
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
import {
  getScratchpadsForSite,
  getScratchpadById,
  createScratchpad,
  updateScratchpad,
  deleteScratchpad,
  linkScratchpadToPost,
  unlinkScratchpadFromPost
} from './scratchpad-service'
import { searchPosts, indexPost } from './search-service'
import { getRevisionsForPost, restoreRevision, captureRevisionForPost } from './revision-service'
import { getWritingStats } from './stats-service'
import { clearAllData } from './database'
import { exportData, readExportMetadata, importData } from './export-service'
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
  TemplateUpdateSchema,
  ScratchpadInputSchema,
  ScratchpadUpdateSchema,
  BulkStatusSchema,
  BulkDeleteSchema,
  SearchQuerySchema,
  SyncOptionsSchema
} from './ipc-schemas'

/** Notify all renderer windows to refresh badge counts (unsynced posts, pending media). */
function notifyCountsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('counts-changed')
  }
}

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
    const post = createPost(PostInputSchema.parse(input))
    notifyCountsChanged()
    return post
  })

  ipcMain.handle('posts:update', (_event, update: unknown) => {
    const post = updatePost(PostUpdateSchema.parse(update))
    notifyCountsChanged()
    return post
  })

  ipcMain.handle('posts:delete', (_event, id: unknown) => {
    softDeletePost(uuidSchema.parse(id))
    notifyCountsChanged()
  })

  ipcMain.handle('posts:push', async (_event, postId: unknown) => {
    const result = await pushPostToWp(uuidSchema.parse(postId))
    notifyCountsChanged()
    return result
  })

  ipcMain.handle(
    'posts:resolve-conflict',
    async (_event, postId: unknown, strategy: unknown) => {
      await resolveConflict(uuidSchema.parse(postId), ConflictStrategySchema.parse(strategy))
      notifyCountsChanged()
    }
  )

  ipcMain.handle('posts:unsynced-count', (_event, siteId: unknown) => {
    return getUnsyncedPostCount(uuidSchema.parse(siteId))
  })

  ipcMain.handle('posts:total-unsynced-count', () => {
    return getTotalUnsyncedCount()
  })

  ipcMain.handle('site:sync', async (_event, siteId: unknown, options?: unknown) => {
    const result = await syncSite(uuidSchema.parse(siteId), SyncOptionsSchema.parse(options))
    notifyCountsChanged()
    return result
  })

  // ── Search ──────────────────────────────────────────────────────────────

  ipcMain.handle('posts:search', (_event, query: unknown, siteId: unknown) => {
    return searchPosts(
      z.string().min(1).parse(query),
      uuidSchema.parse(siteId)
    )
  })

  // ── Revisions ───────────────────────────────────────────────────────────

  ipcMain.handle('revisions:get-all', (_event, postId: unknown) => {
    return getRevisionsForPost(uuidSchema.parse(postId))
  })

  ipcMain.handle('revisions:capture', (_event, postId: unknown) => {
    captureRevisionForPost(uuidSchema.parse(postId))
  })

  ipcMain.handle('revisions:restore', (_event, revisionId: unknown) => {
    const postId = restoreRevision(uuidSchema.parse(revisionId))
    const post = getPostById(postId)
    if (post) {
      indexPost(post.id, post.site_id, post.title, post.content, post.excerpt)
    }
    notifyCountsChanged()
    return post
  })

  // ── Bulk Operations ─────────────────────────────────────────────────────

  ipcMain.handle('posts:bulk-status', (_event, input: unknown) => {
    const { postIds, status } = BulkStatusSchema.parse(input)
    const count = bulkUpdateStatus(postIds, status)
    notifyCountsChanged()
    return count
  })

  ipcMain.handle('posts:bulk-delete', (_event, input: unknown) => {
    const { postIds } = BulkDeleteSchema.parse(input)
    bulkSoftDeletePosts(postIds)
    notifyCountsChanged()
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
      const MAX_MEDIA_SIZE = 50 * 1024 * 1024 // 50 MB
      if (buffer.byteLength > MAX_MEDIA_SIZE) {
        throw new Error(`File too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB). Maximum is 50MB.`)
      }
      const media = saveMediaLocally(
        uuidSchema.parse(siteId),
        uuidSchema.parse(postLocalId),
        z.string().min(1).parse(filename),
        Buffer.from(buffer)
      )
      notifyCountsChanged()
      return media
    }
  )

  ipcMain.handle('media:get-for-post', (_event, postLocalId: unknown) => {
    return getMediaForPost(uuidSchema.parse(postLocalId))
  })

  ipcMain.handle('media:get-queue', (_event, siteId: unknown) => {
    return getMediaQueue(uuidSchema.parse(siteId))
  })

  ipcMain.handle('media:upload', async (_event, mediaId: unknown) => {
    const result = await uploadMediaToWp(uuidSchema.parse(mediaId))
    notifyCountsChanged()
    return result
  })

  ipcMain.handle('media:delete', (_event, id: unknown) => {
    deleteMedia(uuidSchema.parse(id))
    notifyCountsChanged()
  })

  ipcMain.handle('media:replace-file', (_event, mediaId: unknown, buffer: unknown) => {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('Expected ArrayBuffer for media buffer')
    return replaceMediaFile(uuidSchema.parse(mediaId), Buffer.from(buffer))
  })

  ipcMain.handle(
    'media:save-from-library',
    async (_event, siteId: unknown, postLocalId: unknown, libraryItemId: unknown) => {
      const media = await saveMediaFromLibrary(
        uuidSchema.parse(siteId),
        uuidSchema.parse(postLocalId),
        z.number().int().positive().parse(libraryItemId)
      )
      notifyCountsChanged()
      return media
    }
  )

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
      defaultPath: join(app.getPath('downloads'), 'np-presspad-companion.zip'),
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

  // ── Scratchpads ──────────────────────────────────────────────────────

  ipcMain.handle('scratchpads:get-all', (_event, siteId: unknown) => {
    return getScratchpadsForSite(uuidSchema.parse(siteId))
  })

  ipcMain.handle('scratchpads:get', (_event, id: unknown) => {
    return getScratchpadById(uuidSchema.parse(id))
  })

  ipcMain.handle('scratchpads:create', (_event, input: unknown) => {
    return createScratchpad(ScratchpadInputSchema.parse(input))
  })

  ipcMain.handle('scratchpads:update', (_event, update: unknown) => {
    const parsed = ScratchpadUpdateSchema.parse(update)
    const result = updateScratchpad(parsed)
    // Broadcast to all windows for cross-window sync
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('scratchpad-changed', parsed.id)
    }
    return result
  })

  ipcMain.handle('scratchpads:delete', (_event, id: unknown) => {
    deleteScratchpad(uuidSchema.parse(id))
  })

  ipcMain.handle('scratchpads:link', (_event, postId: unknown, scratchpadId: unknown) => {
    linkScratchpadToPost(uuidSchema.parse(postId), uuidSchema.parse(scratchpadId))
  })

  ipcMain.handle('scratchpads:unlink', (_event, postId: unknown) => {
    unlinkScratchpadFromPost(uuidSchema.parse(postId))
  })

  // ── Writing Stats ──────────────────────────────────────────────────────

  ipcMain.handle('stats:get-writing', (_event, siteId: unknown) => {
    return getWritingStats(uuidSchema.parse(siteId))
  })

  ipcMain.handle('stats:get-authors', async (_event, siteId: unknown) => {
    const id = uuidSchema.parse(siteId)
    const site = getSiteById(id)
    if (!site) throw new Error(`Site not found: ${id}`)
    const password = getCredential(site.keychain_ref)
    if (!password) throw new Error('Missing credentials for site')
    return fetchAuthors(site.url, site.username, password)
  })

  // ── Data management ──────────────────────────────────────────────────────

  ipcMain.handle('app:clear-site-data', (_event, siteId: unknown) => {
    clearSiteData(uuidSchema.parse(siteId))
  })

  ipcMain.handle('app:clear-site-content', (_event, siteId: unknown) => {
    clearSiteContent(uuidSchema.parse(siteId))
    notifyCountsChanged()
  })

  ipcMain.handle('app:clear-all-data', () => {
    clearAllData()
  })

  // ── Export/Import ──────────────────────────────────────────────────────

  ipcMain.handle('app:export-data', async (_event, password: unknown, destPath: unknown) => {
    await exportData(z.string().min(1).parse(password), z.string().min(1).parse(destPath))
  })

  ipcMain.handle('app:import-metadata', (_event, archivePath: unknown) => {
    return readExportMetadata(z.string().min(1).parse(archivePath))
  })

  ipcMain.handle('app:import-data', async (_event, password: unknown, archivePath: unknown) => {
    await importData(z.string().min(1).parse(password), z.string().min(1).parse(archivePath))
  })

  ipcMain.handle('dialog:save-export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Data',
      defaultPath: join(app.getPath('downloads'), 'np-presspad-backup.nppexport'),
      filters: [{ name: 'NP Presspad Export', extensions: ['nppexport'] }]
    })
    return canceled || !filePath ? null : filePath
  })

  ipcMain.handle('dialog:open-import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Data',
      filters: [{ name: 'NP Presspad Export', extensions: ['nppexport'] }],
      properties: ['openFile']
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
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
