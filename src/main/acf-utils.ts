/**
 * Normalize an ACF value from the WP REST API (or from rows it already polluted).
 *
 * WordPress serializes an empty PHP array as JSON `[]`, so posts with no ACF
 * field values arrive as `acf: []` rather than an object. Treat any array or
 * non-object as "no ACF data" so it never enters the database.
 */
export function normalizeAcf(acf: unknown): Record<string, unknown> | null {
  if (!acf || typeof acf !== 'object' || Array.isArray(acf)) return null
  if (Object.keys(acf).length === 0) return null
  return acf as Record<string, unknown>
}

/**
 * What a pulled post told us about its ACF values.
 *
 * The third case is the one that matters. "This post has no ACF values" and "this
 * response didn't tell us about ACF values" both arrive as an absent or empty
 * field, and treating the second as the first overwrites good local data with
 * nothing. A response withholds values for several ordinary reasons: a companion
 * plugin older than 1.2.0, a user without edit rights on that post, or a request
 * that didn't ask for the field.
 */
export type PulledAcf =
  | { known: true; values: Record<string, unknown> | null }
  | { known: false }

/**
 * Resolve ACF values from a pulled post, preferring the companion plugin's
 * field over ACF's own.
 *
 * `wpoe_acf` is the superset: ACF's `acf` field only ever carries groups that
 * opted into "Show in REST API", while the plugin reports every group applicable
 * to the post. The plugin sends null when it cannot answer — no permission, or
 * the value exposure was filtered off — which falls through to `acf` and then to
 * "unknown" rather than being mistaken for empty.
 */
export function resolvePulledAcf(post: { acf?: unknown; wpoe_acf?: unknown }): PulledAcf {
  if (post.wpoe_acf !== undefined && post.wpoe_acf !== null) {
    return { known: true, values: normalizeAcf(post.wpoe_acf) }
  }
  if (post.acf !== undefined && post.acf !== null) {
    return { known: true, values: normalizeAcf(post.acf) }
  }
  return { known: false }
}

/** Serialize resolved values for the `posts.acf` column. */
export function acfToJson(values: Record<string, unknown> | null): string | null {
  return values ? JSON.stringify(values) : null
}
