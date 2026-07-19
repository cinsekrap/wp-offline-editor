import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { getSettings } from './settings-service'

// Whether the current check was triggered automatically (piggybacked on a
// sync) rather than by the user. Auto checks stay silent unless there's news.
let currentCheckIsAuto = false
let lastAutoCheck = 0
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // at most every 6 hours

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = getSettings().autoDownloadUpdates
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToAllWindows('updater:status', 'checking', { auto: currentCheckIsAuto })
  })

  autoUpdater.on('update-available', (info) => {
    sendToAllWindows('updater:status', 'available', {
      version: info.version,
      auto: currentCheckIsAuto,
      // When auto-download is on, the download is already starting — the
      // renderer skips the "Download?" toast and waits for 'ready'
      autoDownload: autoUpdater.autoDownload
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendToAllWindows('updater:status', 'up-to-date', { auto: currentCheckIsAuto })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToAllWindows('updater:status', 'downloading', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    sendToAllWindows('updater:status', 'ready')
  })

  autoUpdater.on('error', (err) => {
    sendToAllWindows('updater:status', 'error', { message: err.message, auto: currentCheckIsAuto })
  })
}

export function checkForUpdates(): void {
  currentCheckIsAuto = false
  autoUpdater.checkForUpdates()
}

export function setAutoDownloadUpdates(enabled: boolean): void {
  autoUpdater.autoDownload = enabled
}

/**
 * Throttled background check, called after a successful sync (which proves
 * we're online). Silent unless an update is actually found. A user-initiated
 * sync passes bypassThrottle to skip the interval gate while staying silent.
 */
export function maybeAutoCheckForUpdates(options?: { bypassThrottle?: boolean }): void {
  const now = Date.now()
  if (!options?.bypassThrottle && now - lastAutoCheck < AUTO_CHECK_INTERVAL_MS) return
  lastAutoCheck = now
  currentCheckIsAuto = true
  autoUpdater.checkForUpdates().catch(() => {
    /* background check — network hiccups are not user-facing errors */
  })
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
