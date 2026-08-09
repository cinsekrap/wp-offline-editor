import { app } from 'electron'
import { join } from 'path'
import { existsSync, statSync, copyFileSync, renameSync } from 'fs'
import ElectronStore from 'electron-store'
// electron-store v11 is ESM; when bundled as CJS the default export lands on .default
const Store = (ElectronStore as unknown as { default: typeof ElectronStore }).default ?? ElectronStore
import type { AppSettings } from '@shared/types'

const defaults: AppSettings = {
  theme: 'system',
  editorFontSize: 16,
  forceOffline: false,
  autoSyncInterval: 5,
  writingChartMode: 'daily',
  autoDownloadUpdates: false
}

/**
 * Where settings were written while the store was constructed at import time.
 *
 * electron-store resolves its directory when the Store is built, and this module
 * is imported through ipc-handlers before index.ts calls app.setPath('userData').
 * So every build until now landed in Electron's default directory — named after
 * the package, not the data directory the rest of the app uses.
 */
function legacyConfigPath(): string {
  return join(app.getPath('appData'), 'np-presspad', 'config.json')
}

/**
 * Move settings to the app's real data directory, once.
 *
 * The legacy file is the authoritative one: it is where the app has actually
 * been writing. The file already sitting in the correct location is typically a
 * fossil from before the rename, and reading it would silently revert the user's
 * theme, font size and sync interval to values they last chose months ago —
 * which is why this cannot be a bare path correction.
 *
 * Newer-wins rather than unconditional, so a legacy file left behind by running
 * an older build after migrating cannot overwrite newer settings. The original
 * is renamed rather than deleted: nothing here is worth destroying to save a
 * few hundred bytes, and it makes the migration reversible by hand.
 */
function migrateLegacySettings(): void {
  try {
    const legacy = legacyConfigPath()
    const current = join(app.getPath('userData'), 'config.json')
    if (legacy === current || !existsSync(legacy)) return

    if (existsSync(current) && statSync(current).mtimeMs >= statSync(legacy).mtimeMs) return

    copyFileSync(legacy, current)
    renameSync(legacy, `${legacy}.migrated`)
    console.log('[settings] migrated settings from the legacy directory')
  } catch (err) {
    // Never block startup over this — the defaults are usable, and the user's
    // settings stay where they are for a later attempt.
    console.warn('[settings] Could not migrate legacy settings:', err instanceof Error ? err.message : err)
  }
}

/**
 * Built on first use, not at import — see migrateLegacySettings. Constructing it
 * eagerly is what put the file in the wrong place to begin with.
 */
let store: ElectronStore<AppSettings> | null = null

function getStore(): ElectronStore<AppSettings> {
  if (store === null) {
    migrateLegacySettings()
    // cwd is explicit rather than left to electron-store's default. The default
    // is the userData path as it stands when the Store is built, which is the
    // implicit dependency that misplaced this file in the first place.
    store = new Store<AppSettings>({ defaults, cwd: app.getPath('userData') })
  }
  return store
}

export function getSettings(): AppSettings {
  const s = getStore()
  return {
    theme: s.get('theme'),
    editorFontSize: s.get('editorFontSize'),
    forceOffline: s.get('forceOffline'),
    autoSyncInterval: s.get('autoSyncInterval'),
    writingChartMode: s.get('writingChartMode'),
    autoDownloadUpdates: s.get('autoDownloadUpdates')
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const s = getStore()
  if (patch.theme !== undefined) s.set('theme', patch.theme)
  if (patch.editorFontSize !== undefined) s.set('editorFontSize', patch.editorFontSize)
  if (patch.forceOffline !== undefined) s.set('forceOffline', patch.forceOffline)
  if (patch.autoSyncInterval !== undefined) s.set('autoSyncInterval', patch.autoSyncInterval)
  if (patch.writingChartMode !== undefined) s.set('writingChartMode', patch.writingChartMode)
  if (patch.autoDownloadUpdates !== undefined) s.set('autoDownloadUpdates', patch.autoDownloadUpdates)
  return getSettings()
}

/** Exposed for tests — resets the memoised store so a fresh directory is picked up. */
export function __resetSettingsStoreForTests(): void {
  store = null
}
