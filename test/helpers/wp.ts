import type { WpPostRaw } from '@shared/types'

/** Build a WpPostRaw with plain (image-free) content so pulls never hit net.fetch. */
export function wpPost(overrides: Partial<WpPostRaw> & { id: number; modified: string }): WpPostRaw {
  return {
    id: overrides.id,
    title: overrides.title ?? { rendered: 'Remote title' },
    content: overrides.content ?? { rendered: '<p>Remote body</p>' },
    excerpt: overrides.excerpt ?? { rendered: '' },
    slug: overrides.slug ?? 'remote-post',
    status: overrides.status ?? 'publish',
    modified: overrides.modified,
    date: overrides.date ?? '2026-01-01T00:00:00',
    author: overrides.author ?? 1,
    featured_media: overrides.featured_media ?? 0,
    categories: overrides.categories,
    tags: overrides.tags,
    acf: overrides.acf
  }
}
