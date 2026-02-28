import { app, BrowserWindow, Menu, shell, protocol, net, ipcMain } from 'electron'
import { join, resolve, normalize } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './updater'

// Keep userData path stable (based on package name), but show friendly name in macOS menu bar
app.setPath('userData', join(app.getPath('appData'), 'wp-offline-editor'))
app.name = 'Offline Post Editor'

// ── Scratchpad pop-out windows ───────────────────────────────────────────
const scratchpadWindows = new Map<string, BrowserWindow>()

export function createScratchpadWindow(scratchpadId: string): void {
  const existing = scratchpadWindows.get(scratchpadId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  const win = new BrowserWindow({
    width: 500,
    height: 650,
    minWidth: 350,
    minHeight: 400,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  scratchpadWindows.set(scratchpadId, win)

  // Notify all windows that this scratchpad is now popped out
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('scratchpad-window-status', scratchpadId, true)
  }

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    scratchpadWindows.delete(scratchpadId)
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('scratchpad-window-status', scratchpadId, false)
    }
  })

  // External links → system browser
  win.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  const query = `?mode=scratchpad&scratchpadId=${encodeURIComponent(scratchpadId)}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      search: query.slice(1) // loadFile takes search without leading ?
    })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // External links → system browser (restrict to http/https)
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url)
      }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: (): void => createWindow()
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Register media:// protocol for serving local media files in the renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    // media://file/absolute/path/to/file?t=123 (strip query params for cache-busting)
    const filePath = decodeURIComponent(request.url.split('?')[0].replace('media://file', ''))
    const resolved = normalize(resolve(filePath))
    const userDataDir = app.getPath('userData')
    const allowedPrefixes = [
      join(userDataDir, 'media') + '/',
      join(userDataDir, 'media-library') + '/',
      join(userDataDir, 'site-icons') + '/'
    ]

    if (!allowedPrefixes.some((prefix) => resolved.startsWith(prefix))) {
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(`file://${resolved}`)
  })

  initDatabase()
  registerIpcHandlers()

  // Scratchpad pop-out window (registered here to avoid circular imports with ipc-handlers)
  ipcMain.handle('scratchpad-window:open', (_event, scratchpadId: unknown) => {
    if (typeof scratchpadId !== 'string' || !scratchpadId) throw new Error('Invalid scratchpad ID')
    createScratchpadWindow(scratchpadId)
  })

  ipcMain.handle('scratchpad-window:is-open', (_event, scratchpadId: unknown) => {
    if (typeof scratchpadId !== 'string') return false
    const win = scratchpadWindows.get(scratchpadId)
    return !!win && !win.isDestroyed()
  })

  buildMenu()
  if (!is.dev) initAutoUpdater()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
