import type { CSSProperties } from 'react'
import type { Site } from '@shared/types'

/**
 * Site colours. The selected site's colour becomes the app's accent (--primary):
 * primary buttons, links, focus rings, selection and the sidebar highlight.
 * Writing to the wrong blog should look wrong.
 *
 * Each entry has a light and a dark value (bare HSL triplets, like the rest of
 * the tokens in globals.css), tuned to keep white/ink text legible on them.
 * The order matches the avatar colours sites had before 2.0, so a site with no
 * colour chosen keeps the one it always had.
 */
export interface SiteColor {
  key: string
  label: string
  light: string
  dark: string
}

export const SITE_COLORS: SiteColor[] = [
  { key: 'indigo', label: 'Indigo', light: '234.3 61.7% 52.9%', dark: '233.1 100% 77.8%' },
  { key: 'green', label: 'Green', light: '152 55% 31%', dark: '150 45% 58%' },
  { key: 'violet', label: 'Violet', light: '262 52% 52%', dark: '262 85% 79%' },
  { key: 'amber', label: 'Amber', light: '30 85% 37%', dark: '38 80% 62%' },
  { key: 'rose', label: 'Rose', light: '346 64% 47%', dark: '346 85% 75%' },
  { key: 'cyan', label: 'Cyan', light: '194 80% 31%', dark: '190 65% 60%' },
  { key: 'pink', label: 'Pink', light: '322 58% 45%', dark: '322 75% 77%' },
  { key: 'teal', label: 'Teal', light: '174 80% 27%', dark: '172 55% 55%' }
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** The site's chosen colour, or the one derived from its id (the pre-2.0 avatar colour). */
export function siteColor(site: Pick<Site, 'id' | 'site_color'>): SiteColor {
  const chosen = site.site_color ? SITE_COLORS.find((c) => c.key === site.site_color) : undefined
  return chosen ?? SITE_COLORS[hashCode(site.id) % SITE_COLORS.length]
}

/**
 * Point the accent at a site's colour. globals.css reads --tint-light and
 * --tint-dark, so the theme switch keeps working without calling this again.
 * Pass null to fall back to the default indigo.
 */
export function applySiteTint(site: Pick<Site, 'id' | 'site_color'> | null): void {
  const root = document.documentElement.style
  if (!site) {
    root.removeProperty('--tint-light')
    root.removeProperty('--tint-dark')
    return
  }
  const c = siteColor(site)
  root.setProperty('--tint-light', c.light)
  root.setProperty('--tint-dark', c.dark)
}

/**
 * Props for anything painted in a site's colour (avatars, swatches). The two
 * theme values go in as custom properties so a theme switch repaints it
 * without a re-render.
 */
export function siteSwatch(color: SiteColor): { style: CSSProperties; className: string } {
  return {
    style: { '--sc-light': color.light, '--sc-dark': color.dark } as CSSProperties,
    className:
      'bg-[hsl(var(--sc-light))] text-white dark:bg-[hsl(var(--sc-dark))] dark:text-[hsl(222_25%_10%)]'
  }
}
