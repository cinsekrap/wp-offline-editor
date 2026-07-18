import { useState, useEffect, useMemo } from 'react'
import { Loader2, Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { PreviewCss } from '@shared/types'

interface PreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  title: string
  /** Live TipTap HTML from the editor, so unsaved edits preview correctly. */
  contentHtml: string
}

/** Minimal, clean typography used when the site's CSS hasn't been cached yet. */
const FALLBACK_CSS = `
  :root { color-scheme: light; }
  html, body { margin: 0; background: #ffffff; color: #1a1a1a; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.65;
    font-size: 18px;
  }
  #page { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }
  .entry-title { font-size: 2.2em; line-height: 1.15; margin: 0 0 0.6em; font-weight: 700; }
  .entry-content > *:first-child { margin-top: 0; }
  .entry-content p { margin: 0 0 1.2em; }
  .entry-content h1, .entry-content h2, .entry-content h3,
  .entry-content h4, .entry-content h5, .entry-content h6 {
    line-height: 1.25; margin: 1.6em 0 0.6em; font-weight: 700;
  }
  .entry-content img { max-width: 100%; height: auto; border-radius: 4px; }
  .entry-content a { color: #2563eb; }
  .entry-content blockquote {
    margin: 1.4em 0; padding: 0.2em 1.2em; border-left: 4px solid #d1d5db; color: #4b5563;
  }
  .entry-content pre {
    background: #f3f4f6; padding: 1em; border-radius: 6px; overflow: auto; font-size: 0.9em;
  }
  .entry-content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .entry-content table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
  .entry-content th, .entry-content td { border: 1px solid #d1d5db; padding: 0.5em 0.75em; }
`

/**
 * Strip anything that could execute inside the preview iframe. We render with
 * `sandbox="allow-same-origin"` (and deliberately NOT `allow-scripts`, which
 * would be unsafe combined with same-origin), but we still remove <script> tags
 * and inline event handlers defensively so nothing can run even if the sandbox
 * attribute were ever changed.
 *
 * We need `allow-same-origin` so the iframe inherits this page's origin — that
 * is what lets the custom `media://` protocol (registered privileged in the
 * main process) resolve for offline images. A srcDoc iframe with no sandbox, or
 * with `allow-same-origin`, keeps the parent origin; a fully sandboxed iframe
 * would get an opaque origin and media:// would fail to load.
 */
function sanitizeContent(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Remove script/style/iframe/object/embed elements entirely.
  doc.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove())

  // Strip inline event handlers (on*) and javascript: URLs.
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  return doc.body.innerHTML
}

/** Pull the `body-class:` header comment out of the cached CSS, if present. */
function extractBodyClasses(css: string): string {
  const match = css.match(/\/\*\s*body-class:\s*([^*]*?)\s*\*\//)
  return match ? match[1].trim() : ''
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function PreviewDialog({
  open,
  onOpenChange,
  siteId,
  title,
  contentHtml
}: PreviewDialogProps): JSX.Element {
  const [previewCss, setPreviewCss] = useState<PreviewCss | null>(null)
  const [loading, setLoading] = useState(false)

  // Load cached CSS whenever the dialog opens (or the site changes).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    window.electronAPI
      .getPreviewCss(siteId)
      .then((result) => {
        if (!cancelled) setPreviewCss(result)
      })
      .catch(() => {
        if (!cancelled) setPreviewCss(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, siteId])

  const hasCachedCss = !!previewCss

  const srcDoc = useMemo(() => {
    const css = previewCss?.css ?? FALLBACK_CSS
    const cachedBodyClasses = previewCss ? extractBodyClasses(previewCss.css) : ''
    // Standard WP <body> classes plus whatever the live theme emits, so
    // theme selectors like `.home`, `.blog`, `.single` land correctly.
    const bodyClasses = [
      'wordpress',
      'single',
      'single-post',
      'post-template-default',
      cachedBodyClasses
    ]
      .filter(Boolean)
      .join(' ')

    const safeContent = sanitizeContent(contentHtml)
    const safeTitle = escapeHtml(title || 'Untitled')

    // Wrap in typical WP theme markup so theme selectors hit as they would live.
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>${css}</style>
</head>
<body class="${escapeHtml(bodyClasses)}">
<div id="page" class="site">
<main id="main" class="site-main">
<article class="post type-post status-publish format-standard hentry">
<header class="entry-header"><h1 class="entry-title">${safeTitle}</h1></header>
<div class="entry-content">${safeContent}</div>
</article>
</main>
</div>
</body>
</html>`
  }, [previewCss, contentHtml, title])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm font-medium">Preview</DialogTitle>
        </DialogHeader>

        {/* Notice / status bar */}
        {!loading && !hasCachedCss && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-200 shrink-0 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Site styles not cached yet — sync while online to fetch them.
          </div>
        )}
        {!loading && hasCachedCss && previewCss && (
          <div className="px-4 py-1.5 text-xs text-muted-foreground border-b shrink-0">
            Approximate preview using site styles from {formatRelative(previewCss.fetchedAt)}
          </div>
        )}

        {/* Preview surface */}
        <div className="flex-1 min-h-0 bg-white">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            // sandbox="allow-same-origin" (NOT allow-scripts) keeps the parent
            // origin so media:// images resolve, while blocking script execution.
            <iframe
              title="Post preview"
              sandbox="allow-same-origin"
              srcDoc={srcDoc}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
