import { ipcMain, app } from 'electron'
import { getAllSites, getSiteById, addSite, updateSite, deleteSite } from './site-service'
import { testWpConnection } from './wp-client'
import type { SiteInput, SiteUpdate } from '@shared/types'

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

  // ── App ──────────────────────────────────────────────────────────────────

  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:arch', () => {
    return process.arch
  })
}
