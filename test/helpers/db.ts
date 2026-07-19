import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDatabase, initDatabase, getDb } from '../../src/main/database'
import { addSite } from '../../src/main/site-service'
import type { Site } from '@shared/types'

let currentDir: string | null = null

/**
 * Point Electron's userData at a fresh temp dir and run the REAL schema +
 * migrations against a new encrypted SQLite file. Returns nothing; use getDb()
 * from the service modules for direct row seeding.
 */
export function initTestDb(): void {
  currentDir = mkdtempSync(join(tmpdir(), 'wpoe-test-'))
  process.env.WPOE_TEST_USERDATA = currentDir
  initDatabase()
}

export function teardownTestDb(): void {
  closeDatabase()
  if (currentDir) {
    rmSync(currentDir, { recursive: true, force: true })
    currentDir = null
  }
  delete process.env.WPOE_TEST_USERDATA
}

/** Create a site via the real path so its credential is stored and retrievable. */
export function seedSite(overrides?: { url?: string; username?: string; label?: string }): Site {
  return addSite({
    url: overrides?.url ?? 'http://localhost:10017',
    username: overrides?.username ?? 'admin',
    password: 'app-password',
    label: overrides?.label ?? 'Test Site'
  })
}

/** Insert a posts row directly, filling required columns with sane defaults. */
export function insertPostRow(row: {
  id: string
  site_id: string
  wp_id?: number | null
  title?: string
  content?: string
  status?: string
  acf?: string | null
  modified_remote?: string | null
  categories?: string | null
  tags?: string | null
  synced?: number
  conflict?: number
  pending_delete?: number
}): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO posts (id, site_id, wp_id, title, content, status, acf, modified_local, modified_remote, categories, tags, synced, conflict, pending_delete)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.site_id,
    row.wp_id ?? null,
    row.title ?? '',
    row.content ?? '',
    row.status ?? 'draft',
    row.acf ?? null,
    row.modified_remote ?? null,
    row.categories ?? null,
    row.tags ?? null,
    row.synced ?? 0,
    row.conflict ?? 0,
    row.pending_delete ?? 0
  )
}
