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

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getArch: () => ipcRenderer.invoke('app:arch')
}

contextBridge.exposeInMainWorld('electronAPI', api)
