import type { Post } from '@shared/types'

/** Plain text from post HTML: tags stripped, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * A short preview of a post for cards and rows: its excerpt when it has one,
 * otherwise the opening of the body. Shortcodes are dropped so a post that
 * opens with [callout] doesn't preview as markup.
 */
export function postSnippet(post: Pick<Post, 'excerpt' | 'content'>, max = 220): string {
  const source = htmlToText(post.excerpt) || htmlToText(post.content)
  const text = source.replace(/\[\/?[a-z][\w-]*[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text
}
