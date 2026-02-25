import sanitize from 'sanitize-html'

const allowedTags = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'img', 'a',
  'strong', 'em', 'u', 'br', 'hr',
  'div', 'span',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption'
]

const options: sanitize.IOptions = {
  allowedTags,
  allowedAttributes: {
    img: ['src', 'alt', 'width', 'height', 'data-media-id'],
    a: ['href', 'target', 'rel'],
    '*': ['class', 'id']
  },
  allowedSchemes: ['http', 'https', 'media'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['http', 'https', 'media']
  }
}

export function sanitizeHtml(html: string): string {
  return sanitize(html, options)
}
