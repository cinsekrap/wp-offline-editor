import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSettings, __resetSettingsStoreForTests } from '../../src/main/settings-service'

/**
 * electron-store resolves its directory when the Store is constructed, and the
 * service used to build one at import — before app.setPath('userData') ran. Every
 * write therefore landed in Electron's default directory. Correcting the path
 * alone would start reading whatever fossil sits in the right location, silently
 * reverting settings the user last chose months ago, so the fix has to migrate.
 */

let root: string
let userData: string
let appData: string

function legacyFile(): string {
  return join(appData, 'np-presspad', 'config.json')
}

function currentFile(): string {
  return join(userData, 'config.json')
}

function write(path: string, body: unknown, ageMinutes = 0): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(body))
  if (ageMinutes > 0) {
    const when = new Date(Date.now() - ageMinutes * 60_000)
    utimesSync(path, when, when)
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wpoe-settings-'))
  userData = join(root, 'wp-offline-editor')
  appData = root
  mkdirSync(userData, { recursive: true })
  process.env.WPOE_TEST_USERDATA = userData
  process.env.WPOE_TEST_APPDATA = appData
  __resetSettingsStoreForTests()
})

afterEach(() => {
  delete process.env.WPOE_TEST_USERDATA
  delete process.env.WPOE_TEST_APPDATA
  rmSync(root, { recursive: true, force: true })
  __resetSettingsStoreForTests()
})

describe('legacy settings migration', () => {
  it('adopts the misplaced settings when the correct location holds an older file', () => {
    // The situation on a real install: live values in the legacy directory, and
    // a stale pre-rename copy in the right one.
    write(currentFile(), { editorFontSize: 16, autoSyncInterval: 15 }, 60)
    write(legacyFile(), { editorFontSize: 18, autoSyncInterval: 5, autoDownloadUpdates: true })

    expect(getSettings().editorFontSize).toBe(18)
    expect(getSettings().autoDownloadUpdates).toBe(true)
  })

  it('adopts them when the correct location has nothing at all', () => {
    write(legacyFile(), { editorFontSize: 20 })

    expect(getSettings().editorFontSize).toBe(20)
  })

  it('renames the original so the migration cannot run twice', () => {
    write(legacyFile(), { editorFontSize: 20 })

    getSettings()

    expect(existsSync(legacyFile())).toBe(false)
    expect(existsSync(`${legacyFile()}.migrated`)).toBe(true)
  })

  it('leaves newer settings alone when an old build writes to the legacy path again', () => {
    // Newer-wins: running a pre-fix build after migrating must not roll the
    // user back to whatever that build happened to write.
    write(legacyFile(), { editorFontSize: 12 }, 60)
    write(currentFile(), { editorFontSize: 22 })

    expect(getSettings().editorFontSize).toBe(22)
    expect(existsSync(legacyFile())).toBe(true) // untouched
  })

  it('falls back to defaults when neither file exists', () => {
    expect(getSettings().editorFontSize).toBe(16)
    expect(getSettings().theme).toBe('system')
  })
})
