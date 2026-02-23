// ── Site ─────────────────────────────────────────────────────────────────

export interface Site {
  id: string
  label: string
  url: string
  username: string
  /** Reference key for credential lookup (never the raw password) */
  keychain_ref: string
  auto_sync: boolean
  pull_published: number
  created_at: string
  updated_at: string
}

export interface SiteInput {
  url: string
  username: string
  password: string
  label?: string
  auto_sync?: boolean
  pull_published?: number
}

export interface SiteUpdate {
  id: string
  label?: string
  url?: string
  username?: string
  password?: string
  auto_sync?: boolean
  pull_published?: number
}

// ── Post ─────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'publish' | 'pending' | 'private' | 'future' | 'trash'

export interface Post {
  id: string
  site_id: string
  wp_id: number | null
  title: string
  content: string
  status: PostStatus
  acf: Record<string, unknown> | null
  modified_local: string
  modified_remote: string | null
  synced: boolean
  conflict: boolean
}

// ── Media ────────────────────────────────────────────────────────────────

export interface Media {
  id: string
  site_id: string
  post_local_id: string
  local_path: string
  wp_id: number | null
  wp_url: string | null
  filename: string
  synced: boolean
}

// ── ACF Schema ───────────────────────────────────────────────────────────

export interface AcfField {
  key: string
  label: string
  name: string
  type: string
  required: boolean
  sub_fields?: AcfField[]
  choices?: Record<string, string>
  [key: string]: unknown
}

export interface AcfSchema {
  id: string
  site_id: string
  group_id: string
  group_title: string
  version: number
  fields: AcfField[]
}

// ── WP Connection ────────────────────────────────────────────────────────

export interface WpConnectionResult {
  success: boolean
  siteName?: string
  wpVersion?: string
  acfActive?: boolean
  error?: string
}

// ── IPC API surface exposed via contextBridge ────────────────────────────

export interface ElectronAPI {
  // Sites
  getSites(): Promise<Site[]>
  getSite(id: string): Promise<Site | null>
  addSite(input: SiteInput): Promise<Site>
  updateSite(update: SiteUpdate): Promise<Site>
  deleteSite(id: string): Promise<void>
  testConnection(url: string, username: string, password: string): Promise<WpConnectionResult>

  // App
  getVersion(): Promise<string>
  getArch(): Promise<string>
}
