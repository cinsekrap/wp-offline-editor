import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToAllWindows('updater:status', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendToAllWindows('updater:status', 'available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    sendToAllWindows('updater:status', 'up-to-date')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToAllWindows('updater:status', 'downloading', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    sendToAllWindows('updater:status', 'ready')
  })

  autoUpdater.on('error', (err) => {
    sendToAllWindows('updater:status', 'error', { message: err.message })
  })
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates()
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

function sendToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}
