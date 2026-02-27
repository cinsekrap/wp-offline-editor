import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import type { Template, TemplateInput, TemplateUpdate } from '@shared/types'

interface TemplateRow {
  id: string
  name: string
  description: string
  title_template: string
  content: string
  excerpt: string
  status: string
  category_names: string
  tag_names: string
  created_at: string
  updated_at: string
}

function normalizeRow(row: TemplateRow): Template {
  return {
    ...row,
    category_names: JSON.parse(row.category_names || '[]'),
    tag_names: JSON.parse(row.tag_names || '[]')
  }
}

export function getAllTemplates(): Template[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as TemplateRow[]
  return rows.map(normalizeRow)
}

export function getTemplateById(id: string): Template | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
  return row ? normalizeRow(row) : null
}

export function createTemplate(input: TemplateInput): Template {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO templates (id, name, description, title_template, content, excerpt, status, category_names, tag_names, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description ?? '',
    input.title_template ?? '',
    input.content ?? '',
    input.excerpt ?? '',
    input.status ?? 'draft',
    JSON.stringify(input.category_names ?? []),
    JSON.stringify(input.tag_names ?? []),
    now,
    now
  )

  return getTemplateById(id)!
}

export function updateTemplate(update: TemplateUpdate): Template {
  const existing = getTemplateById(update.id)
  if (!existing) throw new Error(`Template not found: ${update.id}`)

  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE templates SET name = ?, description = ?, title_template = ?, content = ?, excerpt = ?, status = ?, category_names = ?, tag_names = ?, updated_at = ?
    WHERE id = ?
  `).run(
    update.name ?? existing.name,
    update.description ?? existing.description,
    update.title_template ?? existing.title_template,
    update.content ?? existing.content,
    update.excerpt ?? existing.excerpt,
    update.status ?? existing.status,
    JSON.stringify(update.category_names ?? existing.category_names),
    JSON.stringify(update.tag_names ?? existing.tag_names),
    now,
    update.id
  )

  return getTemplateById(update.id)!
}

export function deleteTemplate(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
}
