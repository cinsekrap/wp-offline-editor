import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initTestDb, teardownTestDb, seedSite, insertPostRow } from '../helpers/db'
import { getDb } from '../../src/main/database'
import {
  getPendingChanges,
  rewriteTermIds,
  pushPendingDeletions,
  pushPostToWp,
  PushConflictError,
  pullScratchpadsForSite,
  pushScratchpadsForSite,
  resolveScratchpadConflict
} from '../../src/main/sync-service'
import * as wpClient from '../../src/main/wp-client'

vi.mock('../../src/main/wp-client')

beforeEach(() => {
  initTestDb()
  vi.clearAllMocks()
})
afterEach(() => teardownTestDb())

describe('rewriteTermIds', () => {
  it('remaps negative pending ids to their resolved real ids', () => {
    const map = new Map([[-1, 42]])
    const { json, changed } = rewriteTermIds('[-1, 7]', map)
    expect(JSON.parse(json)).toEqual([42, 7])
    expect(changed).toBe(true)
  })

  it('reports no change when nothing is remapped', () => {
    const { json, changed } = rewriteTermIds('[3, 4]', new Map())
    expect(JSON.parse(json)).toEqual([3, 4])
    expect(changed).toBe(false)
  })

  it('collapses duplicates created by the remap', () => {
    const map = new Map([[-1, 5]])
    const { json, changed } = rewriteTermIds('[-1, 5]', map)
    expect(JSON.parse(json)).toEqual([5])
    expect(changed).toBe(true)
  })

  it('treats null / malformed json as an empty list', () => {
    expect(JSON.parse(rewriteTermIds(null, new Map()).json)).toEqual([])
    expect(JSON.parse(rewriteTermIds('not json', new Map()).json)).toEqual([])
  })
})

describe('getPendingChanges', () => {
  it('counts unsynced and pending_delete posts, scratchpads, and media sources', () => {
    const site = seedSite()
    const db = getDb()

    // Posts: 1 unsynced, 1 pending_delete, 1 fully synced (ignored)
    insertPostRow({ id: 'p-unsynced', site_id: site.id, synced: 0 })
    insertPostRow({ id: 'p-delete', site_id: site.id, wp_id: 1, synced: 1, pending_delete: 1 })
    insertPostRow({ id: 'p-clean', site_id: site.id, wp_id: 2, synced: 1 })

    // Scratchpads: 1 unsynced, 1 pending_delete, 1 synced (ignored)
    const sp = db.prepare(
      'INSERT INTO scratchpads (id, site_id, wp_id, synced, pending_delete) VALUES (?, ?, ?, ?, ?)'
    )
    sp.run('s-unsynced', site.id, null, 0, 0)
    sp.run('s-delete', site.id, 9, 1, 1)
    sp.run('s-clean', site.id, 10, 1, 0)

    // Media sources: attached media (unsynced), staged library upload, queued alt-text
    db.prepare(
      'INSERT INTO media (id, site_id, post_local_id, local_path, filename, synced) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('m1', site.id, 'p-unsynced', '/tmp/a.jpg', 'a.jpg', 0)
    db.prepare(
      'INSERT INTO media (id, site_id, post_local_id, local_path, filename, synced) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('m2', site.id, 'p-unsynced', '/tmp/b.jpg', 'b.jpg', 1) // synced, ignored
    db.prepare(
      "INSERT INTO media_library_pending (id, site_id, filename, local_path) VALUES (?, ?, ?, ?)"
    ).run(-1, site.id, 'staged.jpg', '/tmp/staged.jpg')
    db.prepare(
      "INSERT INTO media_library (id, site_id, filename, source_url, pending_alt_text) VALUES (?, ?, ?, ?, ?)"
    ).run(5, site.id, 'lib.jpg', 'http://x/lib.jpg', 'new alt')

    const pending = getPendingChanges(site.id)
    expect(pending.posts).toBe(2)
    expect(pending.scratchpads).toBe(2)
    expect(pending.media).toBe(3) // 1 attached + 1 staged + 1 alt-text edit
    expect(pending.total).toBe(7)
  })

  it('is scoped to the requested site', () => {
    const a = seedSite({ label: 'A' })
    const b = seedSite({ label: 'B' })
    insertPostRow({ id: 'a1', site_id: a.id, synced: 0 })
    insertPostRow({ id: 'b1', site_id: b.id, synced: 0 })
    expect(getPendingChanges(a.id).posts).toBe(1)
    expect(getPendingChanges(b.id).total).toBe(1)
  })
})

describe('pushPendingDeletions', () => {
  it('hard-deletes orphaned pending_delete rows that never reached WordPress', async () => {
    const site = seedSite()
    insertPostRow({ id: 'orphan', site_id: site.id, wp_id: null, pending_delete: 1, synced: 0 })

    const result = await pushPendingDeletions(site.id)

    const db = getDb()
    const row = db.prepare('SELECT id FROM posts WHERE id = ?').get('orphan')
    expect(row).toBeUndefined()
    expect(result.deleted).toBe(0) // orphans are not "deleted on WP", just swept
    expect(vi.mocked(wpClient.deleteRemotePost)).not.toHaveBeenCalled()
  })

  it('deletes remotely then locally for pending_delete rows with a wp_id', async () => {
    const site = seedSite()
    insertPostRow({ id: 'linked', site_id: site.id, wp_id: 555, pending_delete: 1, synced: 0 })
    vi.mocked(wpClient.deleteRemotePost).mockResolvedValue(undefined as never)

    const result = await pushPendingDeletions(site.id)

    expect(vi.mocked(wpClient.deleteRemotePost)).toHaveBeenCalledWith(
      site.url,
      site.username,
      'app-password',
      555
    )
    expect(result.deleted).toBe(1)
    const db = getDb()
    expect(db.prepare('SELECT id FROM posts WHERE id = ?').get('linked')).toBeUndefined()
  })

  it('keeps the local row and records an error when the remote delete fails', async () => {
    const site = seedSite()
    insertPostRow({ id: 'linked', site_id: site.id, wp_id: 777, pending_delete: 1, synced: 0 })
    vi.mocked(wpClient.deleteRemotePost).mockRejectedValue(new Error('network down'))

    const result = await pushPendingDeletions(site.id)

    expect(result.deleted).toBe(0)
    expect(result.errors).toHaveLength(1)
    const db = getDb()
    expect(db.prepare('SELECT id FROM posts WHERE id = ?').get('linked')).toBeTruthy()
  })
})

describe('pushPostToWp conflict handling', () => {
  const REMOTE_META = '2026-05-05T00:00:00'

  function seedPost(site: string): void {
    insertPostRow({
      id: 'post',
      site_id: site,
      wp_id: 100,
      title: 'Local title',
      content: '<p>Local body</p>',
      modified_remote: '2026-01-01T00:00:00',
      synced: 0
    })
  }

  it('flags a conflict and refuses to push when the remote changed since last sync', async () => {
    const site = seedSite()
    seedPost(site.id)
    vi.mocked(wpClient.fetchRemotePostMeta).mockResolvedValue({
      state: 'exists',
      modified: REMOTE_META
    })

    await expect(pushPostToWp('post')).rejects.toBeInstanceOf(PushConflictError)

    expect(vi.mocked(wpClient.pushPost)).not.toHaveBeenCalled()
    const db = getDb()
    const row = db.prepare('SELECT conflict, modified_remote FROM posts WHERE id = ?').get('post') as {
      conflict: number
      modified_remote: string
    }
    expect(row.conflict).toBe(1)
    expect(row.modified_remote).toBe(REMOTE_META)
  })

  it('bypasses the conflict check with skipConflictCheck and pushes', async () => {
    const site = seedSite()
    seedPost(site.id)
    vi.mocked(wpClient.fetchRemotePostMeta).mockResolvedValue({
      state: 'exists',
      modified: REMOTE_META
    })
    vi.mocked(wpClient.pushPost).mockResolvedValue({
      id: 100,
      modified: '2026-06-06T00:00:00',
      content: '<p>Local body</p>',
      acf: null
    })

    const result = await pushPostToWp('post', { skipConflictCheck: true })

    expect(result.recreated).toBe(false)
    expect(vi.mocked(wpClient.pushPost)).toHaveBeenCalledOnce()
    const db = getDb()
    const row = db.prepare('SELECT synced, conflict FROM posts WHERE id = ?').get('post') as {
      synced: number
      conflict: number
    }
    expect(row.synced).toBe(1)
    expect(row.conflict).toBe(0)
  })

  it('re-creates the post as new when the remote copy is gone', async () => {
    const site = seedSite()
    seedPost(site.id)
    vi.mocked(wpClient.fetchRemotePostMeta).mockResolvedValue({ state: 'gone' })
    vi.mocked(wpClient.pushPost).mockResolvedValue({
      id: 900,
      modified: '2026-07-07T00:00:00',
      content: '<p>Local body</p>',
      acf: null
    })

    const result = await pushPostToWp('post')

    expect(result.recreated).toBe(true)
    expect(result.wp_id).toBe(900)
    // pushPost must be called with wp_id = null (create, not update)
    expect(vi.mocked(wpClient.pushPost).mock.calls[0][3]).toBeNull()
    const db = getDb()
    const row = db.prepare('SELECT wp_id, synced FROM posts WHERE id = ?').get('post') as {
      wp_id: number
      synced: number
    }
    expect(row.wp_id).toBe(900)
    expect(row.synced).toBe(1)
  })
})

describe('pushPostToWp media hygiene', () => {
  it('deletes unreferenced never-synced media instead of uploading it', async () => {
    const site = seedSite()
    const db = getDb()
    const referencedPath = '/tmp/np-test-media/kept.png'
    insertPostRow({
      id: 'post',
      site_id: site.id,
      wp_id: 100,
      title: 'Post',
      content: `<p><img src="media://file${encodeURI(referencedPath)}"></p>`,
      synced: 0
    })
    const insertMedia = db.prepare(
      'INSERT INTO media (id, site_id, post_local_id, local_path, wp_id, wp_url, filename, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    insertMedia.run('m-kept', site.id, 'post', referencedPath, 10, 'https://x/kept.png', 'kept.png', 1)
    insertMedia.run('m-orphan', site.id, 'post', '/tmp/np-test-media/orphan.png', null, null, 'orphan.png', 0)

    vi.mocked(wpClient.fetchRemotePostMeta).mockResolvedValue({
      state: 'exists',
      modified: '2026-01-01T00:00:00'
    })
    vi.mocked(wpClient.pushPost).mockResolvedValue({
      id: 100,
      modified: '2026-06-06T00:00:00',
      content: '<p>ok</p>',
      acf: null
    })

    await pushPostToWp('post')

    const rows = db.prepare('SELECT id FROM media WHERE post_local_id = ? ORDER BY id').all('post') as { id: string }[]
    expect(rows.map((r) => r.id)).toEqual(['m-kept'])
  })
})

describe('scratchpad conflicts', () => {
  function insertScratchpad(siteId: string, overrides?: Record<string, unknown>): void {
    const row = {
      id: 'sp',
      site_id: siteId,
      wp_id: 7,
      title: 'Local title',
      content: 'local body',
      modified_local: '2026-01-02T00:00:00',
      modified_remote: '2026-01-01T00:00:00',
      synced: 0,
      pending_delete: 0,
      conflict: 0,
      ...overrides
    }
    getDb()
      .prepare(
        'INSERT INTO scratchpads (id, site_id, wp_id, title, content, modified_local, modified_remote, synced, pending_delete, conflict) VALUES (@id, @site_id, @wp_id, @title, @content, @modified_local, @modified_remote, @synced, @pending_delete, @conflict)'
      )
      .run(row)
  }

  it('pull flags a conflict when both sides changed, keeping local content', async () => {
    const site = seedSite()
    insertScratchpad(site.id)
    vi.mocked(wpClient.fetchScratchpads).mockResolvedValue([
      {
        id: 7,
        title: { rendered: 'Remote title' },
        content: { rendered: '<p>remote body</p>' },
        modified: '2026-02-02T00:00:00',
        status: 'private'
      }
    ])

    await pullScratchpadsForSite(site.id)

    const row = getDb()
      .prepare('SELECT conflict, content, modified_remote FROM scratchpads WHERE id = ?')
      .get('sp') as { conflict: number; content: string; modified_remote: string }
    expect(row.conflict).toBe(1)
    expect(row.content).toBe('local body')
    expect(row.modified_remote).toBe('2026-02-02T00:00:00')
  })

  it('push skips conflicted scratchpads without reporting an error', async () => {
    const site = seedSite()
    insertScratchpad(site.id, { conflict: 1 })

    const { errors } = await pushScratchpadsForSite(site.id)

    expect(errors).toEqual([])
    expect(vi.mocked(wpClient.pushScratchpad)).not.toHaveBeenCalled()
  })

  it('keep-mine clears the conflict and queues a push', async () => {
    const site = seedSite()
    insertScratchpad(site.id, { conflict: 1 })

    await resolveScratchpadConflict('sp', 'keep-mine')

    const row = getDb()
      .prepare('SELECT conflict, synced FROM scratchpads WHERE id = ?')
      .get('sp') as { conflict: number; synced: number }
    expect(row.conflict).toBe(0)
    expect(row.synced).toBe(0)
  })
})
