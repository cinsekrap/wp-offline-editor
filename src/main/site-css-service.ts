import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, statSync, readFileSync, existsSync } from 'fs'

/**
 * Site CSS caching for offline post preview.
 *
 * We fetch the site's homepage HTML, collect every linked stylesheet plus any
 * inline <style> blocks (in document order), download the external ones, and
 * concatenate everything into a single cached file at
 * `userData/site-css/{siteId}.css`. The preview UI inlines this into a
 * sandboxed iframe so the post renders roughly the way it would on the live
 * theme — entirely offline.
 *
 * We deliberately store the CSS as a plain file (no DB migration): file mtime
 * doubles as the "fetched at" timestamp used for freshness checks and the UI
 * "styles from N ago" line.
 */

const DEFAULT_TIMEOUT_MS = 20_000
/** Cap the concatenated CSS so a pathological theme can't balloon the cache. */
const MAX_TOTAL_CSS_BYTES = 2_000_000
/** The homepage HTML fetch itself is capped too, just in case. */
const HTML_FETCH_TIMEOUT_MS = 15_000

function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function cssDir(): string {
  return join(app.getPath('userData'), 'site-css')
}

function cssPathFor(siteId: string): string {
  return join(cssDir(), `${siteId}.css`)
}

/**
 * An ordered list of the pieces that make up a page's styling: either an
 * external stylesheet (to download) or an inline block (already have the text).
 */
type CssPiece = { kind: 'link'; href: string } | { kind: 'inline'; css: string }

/**
 * Walk the <head>/<body> HTML in document order, pulling out stylesheet links
 * and inline <style> blocks. Order matters because later CSS overrides earlier,
 * so we scan with a single regex over both patterns and keep their positions.
 */
function extractCssPieces(html: string, baseUrl: string): CssPiece[] {
  const pieces: CssPiece[] = []

  // Match either a <link ... stylesheet ...> tag or a <style>...</style> block.
  const combined = /<link\b[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let match: RegExpExecArray | null
  while ((match = combined.exec(html)) !== null) {
    const tag = match[0]
    if (/^<style/i.test(tag)) {
      const inline = match[1] ?? ''
      if (inline.trim()) pieces.push({ kind: 'inline', css: inline })
      continue
    }

    // It's a <link>. Only care about stylesheet rels.
    const relMatch = tag.match(/\brel\s*=\s*["']?([^"'>]*)["']?/i)
    const rel = relMatch ? relMatch[1].toLowerCase() : ''
    if (!rel.split(/\s+/).includes('stylesheet')) continue

    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue

    const resolved = resolveUrl(hrefMatch[1], baseUrl)
    if (resolved) pieces.push({ kind: 'link', href: resolved })
  }

  return pieces
}

/** Resolve a possibly-relative URL against the page base; skip data: URIs. */
function resolveUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('data:')) return null
  try {
    return new URL(trimmed, baseUrl).toString()
  } catch {
    return null
  }
}

/** Pull the <body> tag's class attribute so the preview can reuse it. */
function extractBodyClasses(html: string): string {
  const bodyMatch = html.match(/<body\b([^>]*)>/i)
  if (!bodyMatch) return ''
  const classMatch = bodyMatch[1].match(/\bclass\s*=\s*["']([^"']*)["']/i)
  if (!classMatch) return ''
  // Collapse whitespace; strip characters that could break the comment header.
  return classMatch[1].replace(/\*\//g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Fetch and cache the site's CSS. Failures for individual stylesheets are
 * swallowed silently; the whole function throws only if the homepage itself
 * can't be fetched. Returns the number of stylesheets successfully cached.
 */
export async function refreshSiteCss(siteId: string, siteUrl: string): Promise<void> {
  const homepage = siteUrl.replace(/\/+$/, '') + '/'

  const res = await fetchWithTimeout(homepage, undefined, HTML_FETCH_TIMEOUT_MS)
  if (!res.ok) {
    throw new Error(`Homepage returned status ${res.status}`)
  }
  const html = await res.text()

  const bodyClasses = extractBodyClasses(html)
  const pieces = extractCssPieces(html, homepage)

  const parts: string[] = []
  let totalBytes = 0

  for (const piece of pieces) {
    if (totalBytes >= MAX_TOTAL_CSS_BYTES) break

    if (piece.kind === 'inline') {
      const chunk = piece.css
      if (totalBytes + Buffer.byteLength(chunk) > MAX_TOTAL_CSS_BYTES) break
      parts.push(`/* inline <style> */\n${chunk}`)
      totalBytes += Buffer.byteLength(chunk)
      continue
    }

    // External stylesheet — download, skip silently on any failure.
    try {
      const cssRes = await fetchWithTimeout(piece.href)
      if (!cssRes.ok) continue
      const cssText = await cssRes.text()
      if (totalBytes + Buffer.byteLength(cssText) > MAX_TOTAL_CSS_BYTES) {
        // Keep what fits; stop once we hit the cap.
        break
      }
      parts.push(`/* ${piece.href} */\n${cssText}`)
      totalBytes += Buffer.byteLength(cssText)
    } catch {
      // Individual stylesheet fetch failed (offline, 404, CORS, etc.) — skip.
    }
  }

  const header = `/* body-class: ${bodyClasses} */\n`
  const output = header + parts.join('\n\n')

  const dir = cssDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(cssPathFor(siteId), output, 'utf-8')
}

/**
 * Return the cached CSS and when it was fetched (file mtime), or null if we
 * have nothing cached for this site yet.
 */
export function getSiteCss(siteId: string): { css: string; fetchedAt: string } | null {
  const path = cssPathFor(siteId)
  if (!existsSync(path)) return null
  try {
    const css = readFileSync(path, 'utf-8')
    const fetchedAt = statSync(path).mtime.toISOString()
    return { css, fetchedAt }
  } catch {
    return null
  }
}

/** Age of the cached CSS in milliseconds, or Infinity if none exists. */
export function getSiteCssAgeMs(siteId: string): number {
  const path = cssPathFor(siteId)
  if (!existsSync(path)) return Infinity
  try {
    return Date.now() - statSync(path).mtime.getTime()
  } catch {
    return Infinity
  }
}
