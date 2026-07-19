import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { initTestDb, teardownTestDb, seedSite, insertPostRow } from '../helpers/db'
import { getDb } from '../../src/main/database'
import { saveMediaFromStagedLibrary, saveMediaFromLibrary } from '../../src/main/media-service'
import * as electron from 'electron'

vi.mock('../../src/main/wp-client')

beforeEach(() => {
  initTestDb()
  vi.clearAllMocks()
})
afterEach(() => teardownTestDb())

describe('saveMediaFromStagedLibrary', () => {
  it('transfers a staged upload into the post queue as an unsynced media row', () => {
    const site = seedSite()
    insertPostRow({ id: 'post', site_id: site.id })

    // Create the staged file on disk inside the temp userData dir.
    const userData = process.env.WPOE_TEST_USERDATA!
    const stagedPath = join(userData, 'staged-source.jpg')
    writeFileSync(stagedPath, Buffer.from('fake-image-bytes'))

    const db = getDb()
    db.prepare(
      'INSERT INTO media_library_pending (id, site_id, filename, local_path, mime_type) VALUES (?, ?, ?, ?, ?)'
    ).run(-3, site.id, 'photo.jpg', stagedPath, 'image/jpeg')

    const media = saveMediaFromStagedLibrary(site.id, 'post', -3)

    // New media row: unsynced, no WP identity yet, real file on disk.
    expect(media.synced).toBe(false)
    expect(media.wp_id).toBeNull()
    expect(existsSync(media.local_path)).toBe(true)

    // Staging row and its source file are gone (transfer, not copy).
    const stagedLeft = db
      .prepare('SELECT id FROM media_library_pending WHERE site_id = ? AND id = ?')
      .get(site.id, -3)
    expect(stagedLeft).toBeUndefined()
    expect(existsSync(stagedPath)).toBe(false)
  })

  it('throws when the staged row does not exist', () => {
    const site = seedSite()
    insertPostRow({ id: 'post', site_id: site.id })
    expect(() => saveMediaFromStagedLibrary(site.id, 'post', -999)).toThrow(/Staged library item not found/)
  })
})

describe('saveMediaFromLibrary', () => {
  it('reuses the existing media row when the post already adopted the attachment (no network)', async () => {
    const site = seedSite()
    insertPostRow({ id: 'post', site_id: site.id })

    const db = getDb()
    db.prepare(
      "INSERT INTO media_library (id, site_id, filename, source_url, thumbnail_path) VALUES (?, ?, ?, ?, ?)"
    ).run(77, site.id, 'lib.jpg', 'http://localhost:10017/lib.jpg', '/tmp/thumb.jpg')

    // Pre-existing media row keyed to the same WP attachment id.
    db.prepare(
      'INSERT INTO media (id, site_id, post_local_id, local_path, wp_id, wp_url, filename, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('existing', site.id, 'post', '/tmp/existing.jpg', 77, 'http://localhost:10017/lib.jpg', 'lib.jpg', 1)

    const media = await saveMediaFromLibrary(site.id, 'post', 77)

    // Dedupe branch returns the existing row and must never touch the network.
    expect(media.id).toBe('existing')
    expect(vi.mocked(electron.net.fetch)).not.toHaveBeenCalled()
    // No duplicate row was created.
    const count = (
      db.prepare('SELECT COUNT(*) as c FROM media WHERE post_local_id = ? AND wp_id = ?').get('post', 77) as {
        c: number
      }
    ).c
    expect(count).toBe(1)
  })
})
