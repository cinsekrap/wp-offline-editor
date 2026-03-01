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
  wp_author_id: number | null
  site_icon_url: string | null
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
  wp_author_id?: number | null
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
  excerpt: string
  slug: string
  categories: number[]
  tags: number[]
  word_count: number
  scratchpad_id: string | null
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
  excerpt?: string
  slug?: string
}

export interface PostUpdate {
  id: string
  title?: string
  content?: string
  status?: PostStatus
  acf?: Record<string, unknown> | null
  date?: string | null
  featured_image?: string | null
  excerpt?: string
  slug?: string
  categories?: number[]
  tags?: number[]
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

// ── Taxonomy Terms ───────────────────────────────────────────────────────

export interface TaxonomyTerm {
  id: number
  site_id: string
  taxonomy: 'category' | 'post_tag'
  name: string
  slug: string
  parent: number
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
  excerpt: { rendered: string }
  slug: string
  status: string
  modified: string
  date: string
  author: number
  featured_media: number
  categories?: number[]
  tags?: number[]
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

// ── Templates ────────────────────────────────────────────────────────────

export interface Template {
  id: string
  name: string
  description: string
  title_template: string
  content: string
  excerpt: string
  status: PostStatus | string
  category_names: string[]
  tag_names: string[]
  created_at: string
  updated_at: string
}

export interface TemplateInput {
  name: string
  description?: string
  title_template?: string
  content?: string
  excerpt?: string
  status?: string
  category_names?: string[]
  tag_names?: string[]
}

export interface TemplateUpdate {
  id: string
  name?: string
  description?: string
  title_template?: string
  content?: string
  excerpt?: string
  status?: string
  category_names?: string[]
  tag_names?: string[]
}

// ── Scratchpads ─────────────────────────────────────────────────────────

export interface Scratchpad {
  id: string
  site_id: string
  wp_id: number | null
  title: string
  content: string // markdown
  modified_local: string
  modified_remote: string | null
  synced: boolean
}

export interface ScratchpadInput {
  site_id: string
  title: string
  content?: string
}

export interface ScratchpadUpdate {
  id: string
  title?: string
  content?: string
}

export interface WpScratchpadRaw {
  id: number
  title: { rendered: string }
  content: { rendered: string }
  modified: string
  status: string
}

// ── Writing Stats ───────────────────────────────────────────────────────

export interface DailyWordCount {
  date: string
  wordCount: number
}

export interface WritingStats {
  todayWords: number
  weekWords: number
  streak: number
  dailyCounts: DailyWordCount[] // 30 entries, one per day
}

export interface WpAuthor {
  id: number
  name: string
}

// ── Search ──────────────────────────────────────────────────────────────

export interface SearchResult {
  post_id: string
  site_id: string
  title: string
  snippet: string
  rank: number
}

// ── Revisions ───────────────────────────────────────────────────────────

export interface Revision {
  id: string
  post_id: string
  title: string
  content: string
  excerpt: string
  word_count: number
  created_at: string
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
  pluginVersionWarning?: string
  massPushPaused?: { count: number }
}

// ── WP Connection ────────────────────────────────────────────────────────

export interface WpConnectionResult {
  success: boolean
  siteName?: string
  wpVersion?: string
  acfActive?: boolean
  wpoePluginActive?: boolean
  wpoePluginVersion?: string
  error?: string
}

// ── Export/Import ────────────────────────────────────────────────────

export interface ExportMetadata {
  version: string
  exportedAt: string
  salt: string
  sites: { label: string; url: string }[]
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
  getTotalUnsyncedCount(): Promise<number>
  syncSite(siteId: string, options?: { force?: boolean }): Promise<SyncResult>

  // ACF Schema
  pullAcfSchema(siteId: string): Promise<AcfPullResult>
  getAcfSchemas(siteId: string): Promise<AcfSchema[]>

  // Taxonomy
  getTaxonomyTerms(siteId: string, taxonomy: 'category' | 'post_tag'): Promise<TaxonomyTerm[]>

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

  // Markdown
  importMarkdown(): Promise<string | null>
  exportMarkdown(html: string, name?: string): Promise<boolean>

  // Templates
  getTemplates(): Promise<Template[]>
  getTemplate(id: string): Promise<Template | null>
  createTemplate(input: TemplateInput): Promise<Template>
  updateTemplate(update: TemplateUpdate): Promise<Template>
  deleteTemplate(id: string): Promise<void>

  // Scratchpads
  getScratchpads(siteId: string): Promise<Scratchpad[]>
  getScratchpad(id: string): Promise<Scratchpad | null>
  createScratchpad(input: ScratchpadInput): Promise<Scratchpad>
  updateScratchpad(update: ScratchpadUpdate): Promise<Scratchpad>
  deleteScratchpad(id: string): Promise<void>
  linkScratchpad(postId: string, scratchpadId: string): Promise<void>
  unlinkScratchpad(postId: string): Promise<void>

  // Writing Stats
  getWritingStats(siteId: string): Promise<WritingStats>
  getWpAuthors(siteId: string): Promise<WpAuthor[]>

  // Search
  searchPosts(query: string, siteId: string): Promise<SearchResult[]>

  // Revisions
  getRevisions(postId: string): Promise<Revision[]>
  captureRevision(postId: string): Promise<void>
  restoreRevision(revisionId: string): Promise<Post>

  // Bulk operations
  bulkUpdateStatus(postIds: string[], status: PostStatus): Promise<number>
  bulkDeletePosts(postIds: string[]): Promise<void>

  // Shortcodes
  getShortcodes(siteId: string): Promise<string[]>

  // Plugin
  saveCompanionPlugin(): Promise<boolean>

  // Settings
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>

  // Data management
  clearSiteData(siteId: string): Promise<void>
  clearSiteContent(siteId: string): Promise<void>
  clearAllData(): Promise<void>

  // Export/Import
  exportData(password: string, destPath: string): Promise<void>
  importReadMetadata(archivePath: string): Promise<ExportMetadata>
  importData(password: string, archivePath: string): Promise<void>
  showSaveExportDialog(): Promise<string | null>
  showOpenImportDialog(): Promise<string | null>

  // App
  getVersion(): Promise<string>
  getArch(): Promise<string>

  // Updater
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onCountsChanged(callback: () => void): () => void
  onUpdaterEvent(callback: (status: string, data?: Record<string, unknown>) => void): () => void

  // Scratchpad window
  openScratchpadWindow(scratchpadId: string): Promise<void>
  isScratchpadWindowOpen(scratchpadId: string): Promise<boolean>
  onScratchpadChanged(callback: (id: string) => void): () => void
  onScratchpadWindowStatus(callback: (id: string, open: boolean) => void): () => void
}
