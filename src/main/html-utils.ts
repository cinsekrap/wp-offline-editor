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
