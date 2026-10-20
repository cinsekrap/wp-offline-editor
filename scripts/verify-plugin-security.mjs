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
 * it does not touch existing content. It also creates one published scratchpad,
 * because published is the state the scratchpad check has to prove is closed,
 * and deletes that too. Scratchpads have no front end, feed or pings.
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
  // Build a name → type map of every text-ish field on the site.
  const groups = await req('/wp-json/wpoe/v1/field-groups', { cred: editor })
  const textFields = new Set()
  if (Array.isArray(groups.json)) {
    for (const group of groups.json) {
      const fields = await req(`/wp-json/wpoe/v1/field-groups/${group.key}/fields`, { cred: editor })
      for (const f of Array.isArray(fields.json) ? fields.json : []) {
        if (f.type === 'text' || f.type === 'textarea') textFields.add(f.name)
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

  // Pick a field that actually applies to THIS post. Choosing from all groups
  // would pick one whose location rules don't match, which the plugin then
  // correctly drops — leaving the positive path untested and looking like a bug.
  let fieldName = null
  if (postId) {
    const probeFields = await req(`/wp-json/wp/v2/posts/${postId}?context=edit&_fields=wpoe_acf`, {
      cred: writer
    })
    const applicable = Object.keys(probeFields.json?.wpoe_acf ?? {})
    fieldName = applicable.find((name) => textFields.has(name)) ?? null
  }

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
      } else {
        record(
          'write: a legitimate field value was actually stored',
          null,
          'no text field applies to a plain post on this site'
        )
      }
    } finally {
      await req(`/wp-json/wp/v2/posts/${postId}?force=true`, { cred: writer, method: 'DELETE' })
      console.log(`      (probe post ${postId} deleted)`)
    }
  }
}

// ── F. Scratchpad read boundary ────────────────────────────────────────────
// `public => false` does not protect a show_in_rest post type: core lets anyone
// read a published post of it. So the probe is published on purpose, and every
// read is checked against it rather than against an empty list.
{
  const created = await req('/wp-json/wp/v2/scratchpads', {
    cred: editor,
    method: 'POST',
    body: { title: 'wpoe security probe', content: 'probe', status: 'publish' }
  })
  const spId = created.json?.id

  if (!spId) {
    record('scratchpads: read boundary', false, `could not create a probe scratchpad (HTTP ${created.status})`)
  } else {
    try {
      const anonList = await req('/wp-json/wp/v2/scratchpads')
      record(
        'scratchpads: anonymous list refused',
        anonList.status === 401 || anonList.status === 403,
        `HTTP ${anonList.status}`
      )

      const anonOne = await req(`/wp-json/wp/v2/scratchpads/${spId}`)
      record(
        'scratchpads: anonymous read of a published one refused',
        anonOne.status === 401 || anonOne.status === 403,
        `HTTP ${anonOne.status}`
      )

      if (subscriber) {
        const subList = await req('/wp-json/wp/v2/scratchpads', { cred: subscriber })
        const subOne = await req(`/wp-json/wp/v2/scratchpads/${spId}`, { cred: subscriber })
        record(
          'scratchpads: subscriber refused, list and single',
          subList.status === 403 && subOne.status === 403,
          `HTTP ${subList.status} / ${subOne.status}`
        )
      } else {
        record('scratchpads: subscriber refused, list and single', null, 'set WPOE_SUBSCRIBER')
      }

      // The app's own requests: the same query fetchScratchpads sends.
      const edList = await req(
        '/wp-json/wp/v2/scratchpads?per_page=100&status=private,publish,draft&_fields=id,title,content,modified,status',
        { cred: editor }
      )
      const edOne = await req(`/wp-json/wp/v2/scratchpads/${spId}?_fields=id,title,content,modified,status`, {
        cred: editor
      })
      record(
        'scratchpads: editor still lists and reads them',
        edList.status === 200 &&
          Array.isArray(edList.json) &&
          edList.json.some((s) => s.id === spId) &&
          edOne.status === 200 &&
          edOne.json?.id === spId,
        `HTTP ${edList.status} / ${edOne.status}`
      )
    } finally {
      await req(`/wp-json/wp/v2/scratchpads/${spId}?force=true`, { cred: editor, method: 'DELETE' })
      console.log(`      (probe scratchpad ${spId} deleted)`)
    }
  }
}

// ── G. _scratchpad_id is edit-context only ─────────────────────────────────
// Registered meta appears on every post, set or not, so any public post shows
// whether the key leaks.
{
  const anon = await req('/wp-json/wp/v2/posts?per_page=5&_fields=id,meta')
  const posts = Array.isArray(anon.json) ? anon.json : []
  record(
    'meta: anonymous responses carry no _scratchpad_id',
    posts.length > 0 && posts.every((p) => !p.meta || !('_scratchpad_id' in p.meta)),
    posts.length === 0 ? `HTTP ${anon.status} — no public posts to test against` : `${posts.length} post(s) checked`
  )

  // The app's write, on a throwaway draft, read back the way an editor can.
  const writer = author ?? editor
  const created = await req('/wp-json/wp/v2/posts', {
    cred: writer,
    method: 'POST',
    body: { title: 'wpoe security probe', status: 'draft', content: 'probe' }
  })
  const postId = created.json?.id
  if (!postId) {
    record('meta: _scratchpad_id writable, readable in edit context', false, `could not create a probe post (HTTP ${created.status})`)
  } else {
    try {
      const written = await req(`/wp-json/wp/v2/posts/${postId}`, {
        cred: writer,
        method: 'POST',
        body: { meta: { _scratchpad_id: 424242 } }
      })
      const read = await req(`/wp-json/wp/v2/posts/${postId}?context=edit&_fields=meta`, { cred: writer })
      record(
        'meta: _scratchpad_id writable, readable in edit context',
        written.status === 200 && read.json?.meta?._scratchpad_id === 424242,
        `HTTP ${written.status}, read back ${read.json?.meta?._scratchpad_id}`
      )
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
