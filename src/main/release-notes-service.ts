import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import ElectronStore from 'electron-store'
// electron-store v11 is ESM; when bundled as CJS the default export lands on .default
const Store = (ElectronStore as unknown as { default: typeof ElectronStore }).default ?? ElectronStore

import type { ReleaseNotes } from '@shared/types'

/**
 * Kept out of AppSettings deliberately — this is a record of what the user has
 * been shown, not a preference they can set, and exposing it in the settings
 * payload would invite the UI to treat it as one.
 *
 * Constructed on first use, not at import. electron-store resolves its
 * directory when the Store is built, and this module is imported through
 * ipc-handlers before index.ts calls app.setPath('userData', …) — so building
 * it eagerly writes to Electron's default location instead of the app's data
 * directory, stranding the file away from the database, media and credentials.
 */
let store: ElectronStore<{ lastSeenVersion: string | null }> | null = null

function getStore(): ElectronStore<{ lastSeenVersion: string | null }> {
  if (store === null) {
    store = new Store<{ lastSeenVersion: string | null }>({
      name: 'app-state',
      defaults: { lastSeenVersion: null }
    })
  }
  return store
}

/** Bundled by scripts/bundle-release-notes.mjs; same resolution as the plugin zip. */
function notesPath(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'release-notes.md')
    : join(process.resourcesPath!, 'release-notes.md')
}

/**
 * The notes for the running version. First line is the title, the rest is body —
 * the format the release pipeline publishes from.
 */
export function getReleaseNotes(): ReleaseNotes {
  const version = app.getVersion()
  const path = notesPath()

  if (!existsSync(path)) {
    return { version, title: `NP Presspad ${version}`, body: '' }
  }

  const raw = readFileSync(path, 'utf8')
  const newline = raw.indexOf('\n')
  const title = (newline === -1 ? raw : raw.slice(0, newline)).trim()
  const body = newline === -1 ? '' : raw.slice(newline + 1).trim()

  return { version, title: title || `NP Presspad ${version}`, body }
}

/**
 * Whether to show What's New unprompted.
 *
 * Only after an update — never on a first run. Someone opening the app for the
 * first time has nothing to catch up on, and a changelog is a poor greeting, so
 * a null record is taken as "new install" and silently recorded.
 */
export function shouldShowReleaseNotes(): boolean {
  const lastSeen = getStore().get('lastSeenVersion')

  if (lastSeen === null) {
    getStore().set('lastSeenVersion', app.getVersion())
    return false
  }

  return lastSeen !== app.getVersion()
}

/** Dismissal: don't show this version again. Opening it from Settings also lands here. */
export function markReleaseNotesSeen(): void {
  getStore().set('lastSeenVersion', app.getVersion())
}
