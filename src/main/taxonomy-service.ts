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
