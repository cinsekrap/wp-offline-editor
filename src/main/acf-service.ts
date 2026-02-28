import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import { getSiteById } from './site-service'
import { getCredential } from './credentials'
import { fetchAcfFieldGroups, fetchAcfFieldGroupFields } from './wp-client'
import type { AcfField, AcfSchema, AcfPullResult, WpAcfFieldRaw, WpAcfLayoutRaw } from '@shared/types'

export async function pullAcfSchemaForSite(siteId: string): Promise<AcfPullResult> {
  const site = getSiteById(siteId)
  if (!site) throw new Error(`Site not found: ${siteId}`)

  const password = getCredential(site.keychain_ref)
  if (!password) throw new Error(`No credential found for site: ${site.label}`)

  let groups
  try {
    groups = await fetchAcfFieldGroups(site.url, site.username, password)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('404')) {
      return {
        groupsFound: 0,
        groupsUpdated: 0,
        groupsUnchanged: 0,
        errors: ['ACF REST API not available. Install the NP Presspad Companion plugin.']
      }
    }
    throw err
  }

  const result: AcfPullResult = {
    groupsFound: groups.length,
    groupsUpdated: 0,
    groupsUnchanged: 0,
    errors: []
  }

  for (const group of groups) {
    try {
      const rawFields = await fetchAcfFieldGroupFields(site.url, site.username, password, group.key)
      const fields = normalizeAcfFields(rawFields)
      const fieldsJson = JSON.stringify(fields)
      const locationJson = group.location ? JSON.stringify(group.location) : null

      const db = getDb()
      const groupIdentifier = group.key || String(group.id)
      const existing = db
        .prepare('SELECT id, fields, location FROM acf_schema WHERE site_id = ? AND group_id = ?')
        .get(siteId, groupIdentifier) as { id: string; fields: string; location: string | null } | undefined

      if (!existing) {
        db.prepare(`
          INSERT INTO acf_schema (id, site_id, group_id, group_title, version, fields, location)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).run(uuidv4(), siteId, groupIdentifier, group.title, fieldsJson, locationJson)
        result.groupsUpdated++
      } else if (existing.fields !== fieldsJson || existing.location !== locationJson) {
        db.prepare(`
          UPDATE acf_schema SET group_title = ?, fields = ?, location = ?, version = version + 1
          WHERE id = ?
        `).run(group.title, fieldsJson, locationJson, existing.id)
        result.groupsUpdated++
      } else {
        result.groupsUnchanged++
      }
    } catch (err) {
      result.errors.push(
        `Group "${group.title}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // Update last_schema_pull_at
  const db = getDb()
  db.prepare('UPDATE sites SET last_schema_pull_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    siteId
  )

  return result
}

export function normalizeAcfFields(rawFields: WpAcfFieldRaw[]): AcfField[] {
  return rawFields.map((raw) => {
    // Spread all raw properties, then override specific keys
    const field: AcfField = {
      ...raw,
      key: raw.key,
      label: raw.label,
      name: raw.name,
      type: raw.type,
      required: Boolean(raw.required)
    }

    // Repeater / group → recurse sub_fields
    if ((raw.type === 'repeater' || raw.type === 'group') && raw.sub_fields) {
      field.sub_fields = normalizeAcfFields(raw.sub_fields)
    }

    // Flexible content → map layouts to synthetic entries, preserving layout properties
    if (raw.type === 'flexible_content' && raw.layouts) {
      const layouts = Array.isArray(raw.layouts) ? raw.layouts : Object.values(raw.layouts)

      field.sub_fields = layouts.map((layout: WpAcfLayoutRaw) => ({
        ...layout,
        key: layout.key,
        label: layout.label,
        name: layout.name,
        type: 'layout' as const,
        required: false,
        sub_fields: layout.sub_fields ? normalizeAcfFields(layout.sub_fields) : []
      }))
    }

    // Select / radio / checkbox / button_group → normalize choices
    if (
      (raw.type === 'select' || raw.type === 'radio' || raw.type === 'checkbox' || raw.type === 'button_group') &&
      raw.choices
    ) {
      if (Array.isArray(raw.choices)) {
        const choicesRecord: Record<string, string> = {}
        for (const c of raw.choices) {
          choicesRecord[c] = c
        }
        field.choices = choicesRecord
      } else {
        field.choices = raw.choices as Record<string, string>
      }
    }

    return field
  })
}

export function getAcfSchemasForSite(siteId: string): AcfSchema[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM acf_schema WHERE site_id = ? ORDER BY group_title ASC')
    .all(siteId) as AcfSchema[]

  return rows.map((row) => ({
    ...row,
    fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location ?? null
  }))
}
