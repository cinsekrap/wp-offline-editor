import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchTaxonomyTerms } from './wp-client'
import { decodeHtmlEntities } from './html-utils'
import type { TaxonomyTerm } from '@shared/types'

export async function pullTaxonomyTerms(siteId: string): Promise<void> {
  const site = getSiteById(siteId)
  if (!site) throw new Error(`Site not found: ${siteId}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  const db = getDb()

  for (const endpoint of ['categories', 'tags'] as const) {
    const taxonomy = endpoint === 'categories' ? 'category' : 'post_tag'

    let terms
    try {
      terms = await fetchTaxonomyTerms(site.url, site.username, password, endpoint)
    } catch {
      // Non-critical — skip silently if taxonomy endpoint unavailable
      continue
    }

    const upsert = db.prepare(`
      INSERT INTO taxonomy_terms (id, site_id, taxonomy, name, slug, parent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (site_id, taxonomy, id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        parent = excluded.parent
    `)

    const remoteIds = new Set<number>()

    const transaction = db.transaction(() => {
      for (const term of terms) {
        remoteIds.add(term.id)
        upsert.run(term.id, siteId, taxonomy, decodeHtmlEntities(term.name), term.slug, term.parent ?? 0)
      }

      // Prune stale terms no longer on the remote
      if (remoteIds.size > 0) {
        const existing = db
          .prepare('SELECT id FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ?')
          .all(siteId, taxonomy) as { id: number }[]

        for (const row of existing) {
          // Negative ids are provisional local terms awaiting creation on WP
          // (pending_terms) — never prune them against the remote set
          if (row.id < 0) continue
          if (!remoteIds.has(row.id)) {
            db.prepare('DELETE FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? AND id = ?')
              .run(siteId, taxonomy, row.id)
          }
        }
      }
    })

    transaction()
  }
}

export function getTaxonomyTerms(siteId: string, taxonomy: 'category' | 'post_tag'): TaxonomyTerm[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? ORDER BY name ASC')
    .all(siteId, taxonomy) as TaxonomyTerm[]
}

/**
 * Create a term locally while offline. Allocates a NEGATIVE id (guaranteed not
 * to collide with real WP ids, which are positive) and inserts a matching
 * taxonomy_terms row so every display path works unchanged. The term is created
 * on WordPress at the next sync (see resolvePendingTerms in sync-service), at
 * which point the negative id is swapped for the real WP id everywhere.
 *
 * Guard: if a term with the same name (case-insensitive) already exists for the
 * site+taxonomy, the existing term is returned instead of creating a duplicate.
 */
export function createPendingTerm(
  siteId: string,
  taxonomy: 'category' | 'post_tag',
  name: string
): TaxonomyTerm {
  const db = getDb()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Term name cannot be empty')

  // Dedupe against existing terms (case-insensitive) for this site+taxonomy
  const existing = db
    .prepare(
      'SELECT * FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? AND lower(name) = lower(?) LIMIT 1'
    )
    .get(siteId, taxonomy, trimmed) as TaxonomyTerm | undefined
  if (existing) return existing

  // Allocate the next negative id: one below the smallest id currently in use
  // (across this site's taxonomy_terms and the global pending_terms table) so
  // it's unique both globally in pending_terms and per-site in taxonomy_terms.
  const minRow = db
    .prepare(
      `SELECT MIN(id) as minId FROM (
         SELECT id FROM taxonomy_terms WHERE site_id = ?
         UNION ALL
         SELECT id FROM pending_terms
       )`
    )
    .get(siteId) as { minId: number | null }
  const nextId = Math.min(minRow.minId ?? 0, 0) - 1

  // Derive a placeholder slug (WP assigns the real one on creation)
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const insert = db.transaction(() => {
    db.prepare(
      'INSERT INTO pending_terms (id, site_id, taxonomy, name) VALUES (?, ?, ?, ?)'
    ).run(nextId, siteId, taxonomy, trimmed)
    db.prepare(
      'INSERT INTO taxonomy_terms (id, site_id, taxonomy, name, slug, parent) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(nextId, siteId, taxonomy, trimmed, slug)
  })
  insert()

  return db
    .prepare('SELECT * FROM taxonomy_terms WHERE site_id = ? AND taxonomy = ? AND id = ?')
    .get(siteId, taxonomy, nextId) as TaxonomyTerm
}

export interface PendingTermRow {
  id: number
  site_id: string
  taxonomy: 'category' | 'post_tag'
  name: string
  created_at: string
}

export function getPendingTermsForSite(siteId: string): PendingTermRow[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM pending_terms WHERE site_id = ?')
    .all(siteId) as PendingTermRow[]
}
