#!/usr/bin/env node
/**
 * Verifies the companion plugin's authorization boundary against a real site.
 *
 * The plugin deliberately exposes ACF values that ACF's own REST integration
 * withholds, so two controls carry the whole weight: the read handler's
 * capability check and the write handler's field scoping. Both fail silently and
 * wide open, so they are demonstrated here rather than asserted in a comment.
 *
 * This script creates its own draft post, writes to it, and deletes it again —
 * it does not touch existing content.
 *
 * Usage:
 *
 *   WPOE_SITE=https://example.test \
 *   WPOE_EDITOR=editor:xxxx-xxxx-xxxx-xxxx \
 *   WPOE_SUBSCRIBER=sub:xxxx-xxxx-xxxx-xxxx \
 *   WPOE_AUTHOR=author:xxxx-xxxx-xxxx-xxxx \
 *   node scripts/verify-plugin-security.mjs
 *
 * Credentials are `username:application-password`. WPOE_EDITOR is required;
 * the other two are optional and their checks are reported as skipped.
 * An editor or admin holds `unfiltered_html`, so the sanitisation check is only
 * meaningful with WPOE_AUTHOR — that is the whole point of asking for it.
 */

const site = (process.env.WPOE_SITE ?? '').replace(/\/+$/, '')
const editor = process.env.WPOE_EDITOR
const subscriber = process.env.WPOE_SUBSCRIBER
const author = process.env.WPOE_AUTHOR

if (!site || !editor) {
  console.error('WPOE_SITE and WPOE_EDITOR are required. See the header of this file.')
  process.exit(2)
}

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  const mark = ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'
  console.log(`${mark.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`)
}

function authHeader(cred) {
  return cred ? { Authorization: `Basic ${Buffer.from(cred).toString('base64')}` } : {}
}

async function req(path, { cred, method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${site}${path}`, {
      method,
      headers: {
        ...authHeader(cred),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch (err) {
    // Status 0 marks "never reached the site", which must never be mistaken for
    // a passing check — a refusal and an unreachable host look alike otherwise.
    return { status: 0, json: null, error: err instanceof Error ? err.message : String(err) }
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json }
}

// Fail fast and legibly if the site isn't reachable at all.
{
  const probe = await req('/wp-json/')
  if (probe.status === 0) {
    console.error(`Cannot reach ${site} — ${probe.error}`)
    process.exit(2)
  }
  if (probe.status >= 400) {
    console.error(`${site}/wp-json/ returned HTTP ${probe.status} — is the REST API available?`)
    process.exit(2)
  }
}

/** True when the field is absent or explicitly null — i.e. no values disclosed. */
function withheld(post) {
  return post === undefined || !('wpoe_acf' in post) || post.wpoe_acf === null
}

// ── A. Read boundary ───────────────────────────────────────────────────────
{
  const anon = await req('/wp-json/wp/v2/posts?per_page=5&_fields=id,wpoe_acf')
  const posts = Array.isArray(anon.json) ? anon.json : []
  record(
    'read: anonymous request discloses no ACF values',
    posts.length === 0 || posts.every(withheld),
    posts.length === 0 ? 'no public posts to test against' : `${posts.length} post(s) checked`
  )

  if (subscriber) {
    const sub = await req('/wp-json/wp/v2/posts?per_page=5&_fields=id,wpoe_acf', {
      cred: subscriber
    })
    const subPosts = Array.isArray(sub.json) ? sub.json : []
    record(
      'read: subscriber discloses no ACF values',
      subPosts.length === 0 || subPosts.every(withheld),
      `${subPosts.length} post(s) checked`
    )
  } else {
    record('read: subscriber discloses no ACF values', null, 'set WPOE_SUBSCRIBER')
  }

  const ed = await req('/wp-json/wp/v2/posts?per_page=5&context=edit&_fields=id,wpoe_acf', {
    cred: editor
  })
  const edPosts = Array.isArray(ed.json) ? ed.json : []
  record(
    'read: editor receives the wpoe_acf field',
    edPosts.length > 0 && edPosts.some((p) => p.wpoe_acf !== null && p.wpoe_acf !== undefined),
    edPosts.length === 0 ? `HTTP ${ed.status} — no posts returned` : `${edPosts.length} post(s)`
  )
}

// ── B. /shortcodes gate ────────────────────────────────────────────────────
{
  const anon = await req('/wp-json/wpoe/v1/shortcodes')
  record('shortcodes: anonymous refused', anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`)

  if (subscriber) {
    const sub = await req('/wp-json/wpoe/v1/shortcodes', { cred: subscriber })
    record('shortcodes: subscriber refused', sub.status === 401 || sub.status === 403, `HTTP ${sub.status}`)
  } else {
    record('shortcodes: subscriber refused', null, 'set WPOE_SUBSCRIBER')
  }

  const ed = await req('/wp-json/wpoe/v1/shortcodes', { cred: editor })
  const tags = Array.isArray(ed.json) ? ed.json : []
  record(
    'shortcodes: editor receives tag names only',
    ed.status === 200 && tags.every((t) => Object.keys(t).length === 1 && typeof t.tag === 'string'),
    `HTTP ${ed.status}, ${tags.length} tag(s)`
  )
}

// ── C. /status disclosure ──────────────────────────────────────────────────
{
  const anon = await req('/wp-json/wpoe/v1/status')
  record(
    'status: anonymous sees active but not the version',
    anon.status === 200 && anon.json?.active === true && anon.json?.version === undefined,
    anon.json?.version ? `leaked version ${anon.json.version}` : 'version withheld'
  )

  const ed = await req('/wp-json/wpoe/v1/status', { cred: editor })
  record(
    'status: editor sees the version',
    ed.status === 200 && typeof ed.json?.version === 'string',
    ed.json?.version ? `v${ed.json.version}` : `HTTP ${ed.status}`
  )
}

// ── D & E. Write scoping and sanitisation, on a throwaway post ─────────────
{
  // Discover a real field name so the write actually resolves to something.
  const groups = await req('/wp-json/wpoe/v1/field-groups', { cred: editor })
  let fieldName = null
  if (Array.isArray(groups.json)) {
    for (const group of groups.json) {
      const fields = await req(`/wp-json/wpoe/v1/field-groups/${group.key}/fields`, { cred: editor })
      const text = (Array.isArray(fields.json) ? fields.json : []).find(
        (f) => f.type === 'text' || f.type === 'textarea'
      )
      if (text) {
        fieldName = text.name
        break
      }
    }
  }

  const writer = author ?? editor
  const created = await req('/wp-json/wp/v2/posts', {
    cred: writer,
    method: 'POST',
    body: { title: 'wpoe security probe', status: 'draft', content: 'probe' }
  })
  const postId = created.json?.id

  if (!postId) {
    record('write: scoping and sanitisation', false, `could not create a probe post (HTTP ${created.status})`)
  } else {
    try {
      const before = await req(`/wp-json/wp/v2/posts/${postId}?context=edit&_fields=template`, {
        cred: writer
      })

      const payload = {
        _wp_page_template: 'evil-template.php',
        wpoe_unknown_key: 'should not be written'
      }
      if (fieldName) payload[fieldName] = 'probe<script>alert(1)</script>value'

      const written = await req(`/wp-json/wp/v2/posts/${postId}?context=edit`, {
        cred: writer,
        method: 'POST',
        body: { wpoe_acf: payload }
      })

      const echoed = written.json?.wpoe_acf ?? {}
      record(
        'write: protected meta key dropped, not written',
        !('_wp_page_template' in echoed),
        '_wp_page_template absent from the stored values'
      )
      record('write: unknown key dropped', !('wpoe_unknown_key' in echoed), 'unknown_key absent')

      const after = await req(`/wp-json/wp/v2/posts/${postId}?context=edit&_fields=template`, {
        cred: writer
      })
      record(
        'write: post template unchanged by the injection attempt',
        (before.json?.template ?? '') === (after.json?.template ?? ''),
        `template "${after.json?.template ?? ''}"`
      )

      if (fieldName && author) {
        const stored = String(echoed[fieldName] ?? '')
        record(
          'write: script tag stripped for a user without unfiltered_html',
          stored !== '' && !stored.includes('<script'),
          `stored as "${stored}"`
        )
      } else {
        record(
          'write: script tag stripped for a user without unfiltered_html',
          null,
          author ? 'no text field found to write into' : 'set WPOE_AUTHOR (editors hold unfiltered_html)'
        )
      }

      if (fieldName) {
        record(
          'write: a legitimate field value was actually stored',
          String(echoed[fieldName] ?? '').includes('probe'),
          `field "${fieldName}"`
        )
      }
    } finally {
      await req(`/wp-json/wp/v2/posts/${postId}?force=true`, { cred: writer, method: 'DELETE' })
      console.log(`      (probe post ${postId} deleted)`)
    }
  }
}

const failed = results.filter((r) => r.ok === false).length
const skipped = results.filter((r) => r.ok === null).length
console.log(
  `\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`
)
process.exit(failed === 0 ? 0 : 1)
