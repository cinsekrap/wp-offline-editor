/**
 * Normalize an ACF value from the WP REST API (or from rows it already polluted).
 *
 * WordPress serializes an empty PHP array as JSON `[]`, so posts with no ACF
 * field values arrive as `acf: []` rather than an object. Treat any array or
 * non-object as "no ACF data" so it never enters the database.
 */
export function normalizeAcf(acf: unknown): Record<string, unknown> | null {
  if (!acf || typeof acf !== 'object' || Array.isArray(acf)) return null
  return acf as Record<string, unknown>
}
