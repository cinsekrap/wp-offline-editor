import { useState, useEffect } from 'react'
import type { TaxonomyTerm } from '@shared/types'

/** Map of WP category term id → name for a site, for labelling post cards. */
export function useCategoryNames(siteId: string | null): Map<number, string> {
  const [names, setNames] = useState<Map<number, string>>(() => new Map())

  useEffect(() => {
    if (!siteId) {
      setNames(new Map())
      return
    }
    let cancelled = false
    window.electronAPI
      .getTaxonomyTerms(siteId, 'category')
      .then((terms) => {
        if (!cancelled) {
          setNames(new Map((terms as TaxonomyTerm[]).map((t) => [t.id, t.name])))
        }
      })
      .catch(() => {
        /* offline or terms not yet pulled — cards just omit categories */
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  return names
}

export function categoryLabel(ids: number[] | undefined, names: Map<number, string>): string {
  if (!ids || ids.length === 0) return ''
  return ids
    .map((id) => names.get(id))
    .filter(Boolean)
    .join(', ')
}
