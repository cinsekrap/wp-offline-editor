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
  last_post_pull_at: string | null
  last_schema_pull_at: string | null
  media_library_limit: number
  last_media_library_pull_at: string | null
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
  media_library_limit?: number
}

export interface SiteUpdate {
  id: string
  label?: string
  url?: string
  username?: string
  password?: string
  auto_sync?: boolean
  pull_published?: number
  media_library_limit?: number
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
  date: string | null
  author_id: number | null
  author_name: string | null
  featured_image: string | null
  modified_local: string
  modified_remote: string | null
  synced: boolean
  conflict: boolean
}

export interface PostInput {
  site_id: string
  title?: string
  content?: string
  status?: PostStatus
  acf?: Record<string, unknown> | null
}

export interface PostUpdate {
  id: string
  title?: string
  content?: string
  status?: PostStatus
  acf?: Record<string, unknown> | null
  date?: string | null
  featured_image?: string | null
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

// ── Media Library ────────────────────────────────────────────────────────

export interface MediaLibraryItem {
  id: number // WP attachment ID
  site_id: string
  title: string
  filename: string
  mime_type: string
  alt_text: string
  source_url: string // full-size WP URL (reference only)
  thumbnail_path: string // local disk path to cached thumbnail
  width: number | null
  height: number | null
  uploaded_at: string
}

export interface MediaLibraryPullResult {
  total: number
  created: number
  updated: number
  removed: number
  errors: string[]
}

// ── ACF Schema ───────────────────────────────────────────────────────────

export interface AcfLocationRule {
  param: string
  operator: string
  value: string
}

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
  location: AcfLocationRule[][] | null
}

export interface WpMediaUploadResult {
  id: number
  source_url: string
}

// ── WP REST API Raw Types ────────────────────────────────────────────────

export interface WpPostRaw {
  id: number
  title: { rendered: string }
  content: { rendered: string }
  status: string
  modified: string
  date: string
  author: number
  featured_media: number
  acf?: Record<string, unknown>
}

export interface WpAcfFieldGroupRaw {
  id: number
  title: string
  key: string
  modified: number
  active: boolean
  location?: AcfLocationRule[][]
}

export interface WpAcfLayoutRaw {
  key: string
  name: string
  label: string
  sub_fields?: WpAcfFieldRaw[]
}

export interface WpAcfFieldRaw {
  key: string
  label: string
  name: string
  type: string
  required: number | boolean
  sub_fields?: WpAcfFieldRaw[]
  layouts?: WpAcfLayoutRaw[] | Record<string, WpAcfLayoutRaw>
  choices?: Record<string, string> | string[]
  [k: string]: unknown
}

// ── Push Results ────────────────────────────────────────────────────────

export interface PushResult {
  wp_id: number
  modified_remote: string
}

// ── Pull Results ────────────────────────────────────────────────────────

export interface PullResult {
  total: number
  created: number
  updated: number
  unchanged: number
  errors: string[]
}

export interface AcfPullResult {
  groupsFound: number
  groupsUpdated: number
  groupsUnchanged: number
  errors: string[]
}

// ── Sync Result ─────────────────────────────────────────────────────────

export interface SyncResult {
  pushed: number
  pushErrors: string[]
  pull: PullResult
  schemaPull: AcfPullResult
  mediaLibraryPull: MediaLibraryPullResult
}

// ── WP Connection ────────────────────────────────────────────────────────

export interface WpConnectionResult {
  success: boolean
  siteName?: string
  wpVersion?: string
  acfActive?: boolean
  wpoePluginActive?: boolean
  error?: string
}

// ── App Settings ─────────────────────────────────────────────────────────

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  forceOffline: boolean
  autoSyncInterval: number // minutes — 0 means disabled
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

  // Posts
  pullPosts(siteId: string): Promise<PullResult>
  getPosts(siteId: string): Promise<Post[]>
  getPost(id: string): Promise<Post | null>
  createPost(input: PostInput): Promise<Post>
  updatePost(update: PostUpdate): Promise<Post>
  deletePost(id: string): Promise<void>
  pushPost(postId: string): Promise<PushResult>
  resolveConflict(postId: string, strategy: 'keep-mine' | 'keep-theirs' | 'fork'): Promise<void>
  getUnsyncedPostCount(siteId: string): Promise<number>
  syncSite(siteId: string): Promise<SyncResult>

  // ACF Schema
  pullAcfSchema(siteId: string): Promise<AcfPullResult>
  getAcfSchemas(siteId: string): Promise<AcfSchema[]>

  // Media Library
  getMediaLibrary(siteId: string): Promise<MediaLibraryItem[]>

  // Media
  saveMediaLocal(
    siteId: string,
    postLocalId: string,
    filename: string,
    buffer: ArrayBuffer
  ): Promise<Media>
  getMediaForPost(postLocalId: string): Promise<Media[]>
  getMediaQueue(siteId: string): Promise<Media[]>
  uploadMedia(mediaId: string): Promise<Media>
  deleteMedia(id: string): Promise<void>
  replaceMediaFile(mediaId: string, buffer: ArrayBuffer): Promise<Media>

  // Shortcodes
  getShortcodes(siteId: string): Promise<string[]>

  // Plugin
  saveCompanionPlugin(): Promise<boolean>

  // Settings
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>

  // App
  getVersion(): Promise<string>
  getArch(): Promise<string>

  // Updater
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdaterEvent(callback: (status: string, data?: Record<string, unknown>) => void): () => void
}
