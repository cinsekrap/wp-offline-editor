import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initTestDb, teardownTestDb, seedSite, insertPostRow } from '../helpers/db'
import { getDb } from '../../src/main/database'
import { pullPostsForSite } from '../../src/main/post-service'
import * as wpClient from '../../src/main/wp-client'
import { wpPost } from '../helpers/wp'

vi.mock('../../src/main/wp-client')

beforeEach(() => {
  initTestDb()
  vi.clearAllMocks()
  vi.mocked(wpClient.fetchUserNames).mockResolvedValue(new Map())
  // Default: no ghost sweep unless a test opts in (null = untrusted partial sweep).
  vi.mocked(wpClient.fetchAllPostIds).mockResolvedValue(null)
})
afterEach(() => teardownTestDb())

function stagePull(posts: ReturnType<typeof wpPost>[]): void {
  vi.mocked(wpClient.fetchPosts).mockResolvedValue({ posts } as never)
}

describe('upsertPost (via pullPostsForSite)', () => {
  it('creates a new local post from a remote one', async () => {
    const site = seedSite()
    stagePull([wpPost({ id: 10, modified: '2026-01-01T00:00:00', title: { rendered: 'Hello' } })])

    const result = await pullPostsForSite(site.id)

    expect(result.created).toBe(1)
    const db = getDb()
    const row = db.prepare('SELECT title, synced, wp_id FROM posts WHERE site_id = ? AND wp_id = 10').get(site.id) as {
      title: string
      synced: number
      wp_id: number
    }
    expect(row.title).toBe('Hello')
    expect(row.synced).toBe(1)
  })

  it('leaves a post unchanged when the remote modified timestamp matches', async () => {
    const site = seedSite()
    insertPostRow({
      id: 'local',
      site_id: site.id,
      wp_id: 20,
      title: 'Same',
      content: '<p>body</p>',
      modified_remote: '2026-02-02T00:00:00',
      synced: 1
    })
    stagePull([wpPost({ id: 20, modified: '2026-02-02T00:00:00', title: { rendered: 'Same' } })])

    const result = await pullPostsForSite(site.id)

    expect(result.unchanged).toBe(1)
    expect(result.updated).toBe(0)
  })

  it('overwrites a synced post when the remote changed and there are no local edits', async () => {
    const site = seedSite()
    insertPostRow({
      id: 'local',
      site_id: site.id,
      wp_id: 30,
      title: 'Old',
      content: '<p>old</p>',
      modified_remote: '2026-01-01T00:00:00',
      synced: 1
    })
    stagePull([wpPost({ id: 30, modified: '2026-03-03T00:00:00', title: { rendered: 'New' } })])

    const result = await pullPostsForSite(site.id)

    expect(result.updated).toBe(1)
    const db = getDb()
    const row = db.prepare('SELECT title, conflict, synced FROM posts WHERE wp_id = 30').get() as {
      title: string
      conflict: number
      synced: number
    }
    expect(row.title).toBe('New')
    expect(row.conflict).toBe(0)
    expect(row.synced).toBe(1)
  })

  it('marks a conflict when the remote changed but local edits exist (synced=0)', async () => {
    const site = seedSite()
    insertPostRow({
      id: 'local',
      site_id: site.id,
      wp_id: 40,
      title: 'My local draft',
      content: '<p>mine</p>',
      modified_remote: '2026-01-01T00:00:00',
      synced: 0
    })
    stagePull([wpPost({ id: 40, modified: '2026-04-04T00:00:00', title: { rendered: 'Theirs' } })])

    await pullPostsForSite(site.id)

    const db = getDb()
    const row = db.prepare('SELECT title, conflict, modified_remote FROM posts WHERE wp_id = 40').get() as {
      title: string
      conflict: number
      modified_remote: string
    }
    // Local content is preserved; only the conflict flag + remote stamp change.
    expect(row.title).toBe('My local draft')
    expect(row.conflict).toBe(1)
    expect(row.modified_remote).toBe('2026-04-04T00:00:00')
  })

  it('never resurrects a pending_delete post from a pull', async () => {
    const site = seedSite()
    insertPostRow({
      id: 'doomed',
      site_id: site.id,
      wp_id: 50,
      title: 'Deleting',
      content: '<p>bye</p>',
      modified_remote: '2026-01-01T00:00:00',
      synced: 0,
      pending_delete: 1
    })
    stagePull([wpPost({ id: 50, modified: '2026-09-09T00:00:00', title: { rendered: 'Resurrected?' } })])

    const result = await pullPostsForSite(site.id)

    expect(result.unchanged).toBe(1)
    const db = getDb()
    const row = db.prepare('SELECT title, pending_delete, conflict FROM posts WHERE id = ?').get('doomed') as {
      title: string
      pending_delete: number
      conflict: number
    }
    expect(row.title).toBe('Deleting')
    expect(row.pending_delete).toBe(1)
    expect(row.conflict).toBe(0)
  })
})

describe('removeGhostPosts (via pullPostsForSite)', () => {
  it('removes only synced/clean posts confirmed gone, sparing edited/conflicted/deleting rows', async () => {
    const site = seedSite()
    // Candidate that should be removed: synced, clean, absent from remote, GET says gone
    insertPostRow({ id: 'ghost', site_id: site.id, wp_id: 100, synced: 1, conflict: 0, pending_delete: 0 })
    // Absent from remote but GET says it still exists (REST filtering) — must survive
    insertPostRow({ id: 'hidden', site_id: site.id, wp_id: 101, synced: 1, conflict: 0, pending_delete: 0 })
    // Not eligible: has local edits
    insertPostRow({ id: 'edited', site_id: site.id, wp_id: 102, synced: 0, conflict: 0, pending_delete: 0 })
    // Not eligible: in conflict
    insertPostRow({ id: 'conflicted', site_id: site.id, wp_id: 103, synced: 1, conflict: 1, pending_delete: 0 })
    // Not eligible: pending delete
    insertPostRow({ id: 'deleting', site_id: site.id, wp_id: 104, synced: 1, conflict: 0, pending_delete: 1 })

    stagePull([]) // nothing pulled, so the sweep drives the whole test
    vi.mocked(wpClient.fetchAllPostIds).mockResolvedValue(new Set<number>()) // none present in list
    vi.mocked(wpClient.fetchRemotePostExistence).mockImplementation(async (_u, _n, _p, wpId) =>
      wpId === 100 ? 'gone' : wpId === 101 ? 'exists' : 'gone'
    )

    const result = await pullPostsForSite(site.id)

    const db = getDb()
    const ids = (db.prepare('SELECT id FROM posts WHERE site_id = ?').all(site.id) as { id: string }[]).map(
      (r) => r.id
    )
    expect(result.removed).toBe(1)
    expect(ids).not.toContain('ghost')
    expect(ids).toEqual(expect.arrayContaining(['hidden', 'edited', 'conflicted', 'deleting']))
    // Only the two eligible synced/clean candidates were ever GET-verified.
    const verified = vi.mocked(wpClient.fetchRemotePostExistence).mock.calls.map((c) => c[3]).sort()
    expect(verified).toEqual([100, 101])
  })

  it('does not sweep when the id fetch is untrusted (returns null)', async () => {
    const site = seedSite()
    insertPostRow({ id: 'keep', site_id: site.id, wp_id: 200, synced: 1, conflict: 0, pending_delete: 0 })
    stagePull([])
    vi.mocked(wpClient.fetchAllPostIds).mockResolvedValue(null)

    const result = await pullPostsForSite(site.id)

    expect(result.removed).toBe(0)
    expect(vi.mocked(wpClient.fetchRemotePostExistence)).not.toHaveBeenCalled()
  })
})
