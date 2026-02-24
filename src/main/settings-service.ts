import ElectronStore from 'electron-store'
// electron-store v11 is ESM; when bundled as CJS the default export lands on .default
const Store = (ElectronStore as unknown as { default: typeof ElectronStore }).default ?? ElectronStore
import type { AppSettings } from '@shared/types'

const defaults: AppSettings = {
  theme: 'system',
  editorFontSize: 16,
  forceOffline: false,
  autoSyncInterval: 5
}

const store = new Store<AppSettings>({ defaults })

export function getSettings(): AppSettings {
  return {
    theme: store.get('theme'),
    editorFontSize: store.get('editorFontSize'),
    forceOffline: store.get('forceOffline'),
    autoSyncInterval: store.get('autoSyncInterval')
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.theme !== undefined) store.set('theme', patch.theme)
  if (patch.editorFontSize !== undefined) store.set('editorFontSize', patch.editorFontSize)
  if (patch.forceOffline !== undefined) store.set('forceOffline', patch.forceOffline)
  if (patch.autoSyncInterval !== undefined) store.set('autoSyncInterval', patch.autoSyncInterval)
  return getSettings()
}
