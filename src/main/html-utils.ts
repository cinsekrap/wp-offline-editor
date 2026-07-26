const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'"
}

const ENTITY_RE = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g

export function decodeHtmlEntities(str: string): string {
  return str.replace(ENTITY_RE, (match, dec, hex, named) => {
    if (dec) return String.fromCharCode(parseInt(dec, 10))
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    if (named) return ENTITIES[`&${named};`] ?? match
    return match
  })
}

// Gutenberg block delimiters, including the self-closing `<!-- wp:image /-->` form.
const BLOCK_DELIMITER_RE = /<!--\s*\/?wp:[\s\S]*?-->/g

const BLOCK_LEVEL_RE =
  /^<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|td|th|figure|figcaption|hr|section|article|aside|header|footer|nav|main|dl|dt|dd)\b/i

/**
 * Stand-in for WP's wpautop: raw post content stores paragraphs as blank-line
 * separated text and relies on the render filter to add the tags. The editor
 * holds HTML, so we have to add them here.
 */
function autop(html: string): string {
  return html
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) =>
      BLOCK_LEVEL_RE.test(chunk) ? chunk : `<p>${chunk.replace(/\n/g, '<br />')}</p>`
    )
    .join('\n')
}

/**
 * Pick the editable source of a post's content.
 *
 * WordPress serves content two ways: `rendered` has run through the render
 * filters, so shortcodes are already expanded into markup, while `raw` (only
 * available under context=edit) is what WP actually stores. We have to edit
 * `raw` — pushing back an edited `rendered` copy replaces `[my_shortcode]` with
 * a frozen snapshot of its output, permanently losing the shortcode.
 *
 * Raw content needs two fix-ups before a WYSIWYG editor can hold it: block
 * delimiters are comments the editor would drop anyway, and classic content
 * needs its paragraphs restored.
 */
export function wpContentToHtml(content: { raw?: string; rendered: string }): string {
  if (content.raw === undefined) return content.rendered
  return autop(content.raw.replace(BLOCK_DELIMITER_RE, '\n\n'))
}
