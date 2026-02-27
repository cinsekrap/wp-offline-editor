import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import { join } from 'path'
import { rmSync } from 'fs'
import { getOrCreateDbKey } from './credentials'

let db: Database.Database | null = null

const DB_FILENAME = 'wp-offline-editor.db'

export function getDb(): Database.Database {
  if (db) return db
  throw new Error('Database not initialized. Call initDatabase() first.')
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), DB_FILENAME)
  const key = getOrCreateDbKey()

  db = new Database(dbPath)
  db.pragma(`key='${key}'`)
  db.pragma('journal_mode=WAL')
  db.pragma('foreign_keys=ON')

  createSchema(db)
  runMigrations(db)
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      username TEXT NOT NULL,
      keychain_ref TEXT NOT NULL,
      auto_sync INTEGER NOT NULL DEFAULT 0,
      pull_published INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      wp_id INTEGER,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      acf TEXT,
      modified_local TEXT NOT NULL DEFAULT (datetime('now')),
      modified_remote TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      conflict INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      post_local_id TEXT NOT NULL,
      local_path TEXT NOT NULL,
      wp_id INTEGER,
      wp_url TEXT,
      filename TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (post_local_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS acf_schema (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      group_title TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      fields TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_posts_site_id ON posts(site_id);
    CREATE INDEX IF NOT EXISTS idx_posts_wp_id ON posts(wp_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_media_site_id ON media(site_id);
    CREATE INDEX IF NOT EXISTS idx_media_post_local_id ON media(post_local_id);
    CREATE INDEX IF NOT EXISTS idx_acf_schema_site_id ON acf_schema(site_id);
  `)
}

function runMigrations(db: Database.Database): void {
  // Add last_post_pull_at and last_schema_pull_at to sites if missing
  const cols = db.prepare('PRAGMA table_info(sites)').all() as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))

  if (!colNames.has('last_post_pull_at')) {
    db.exec('ALTER TABLE sites ADD COLUMN last_post_pull_at TEXT')
  }
  if (!colNames.has('last_schema_pull_at')) {
    db.exec('ALTER TABLE sites ADD COLUMN last_schema_pull_at TEXT')
  }

  // Add location column to acf_schema if missing
  const acfCols = db.prepare('PRAGMA table_info(acf_schema)').all() as { name: string }[]
  const acfColNames = new Set(acfCols.map((c) => c.name))

  if (!acfColNames.has('location')) {
    db.exec('ALTER TABLE acf_schema ADD COLUMN location TEXT DEFAULT NULL')
  }

  // Add date column to posts if missing
  const postCols = db.prepare('PRAGMA table_info(posts)').all() as { name: string }[]
  const postColNames = new Set(postCols.map((c) => c.name))

  if (!postColNames.has('date')) {
    db.exec('ALTER TABLE posts ADD COLUMN date TEXT')
  }

  if (!postColNames.has('author_id')) {
    db.exec('ALTER TABLE posts ADD COLUMN author_id INTEGER')
  }
  if (!postColNames.has('author_name')) {
    db.exec('ALTER TABLE posts ADD COLUMN author_name TEXT')
  }

  if (!postColNames.has('featured_image')) {
    db.exec('ALTER TABLE posts ADD COLUMN featured_image TEXT')
  }

  // Unique indexes to prevent duplicate posts/schema per site
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_site_wp ON posts(site_id, wp_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_acf_schema_site_group ON acf_schema(site_id, group_id);
  `)

  // Media library table for cached WP attachment thumbnails
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER NOT NULL,
      site_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      alt_text TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      thumbnail_path TEXT NOT NULL DEFAULT '',
      width INTEGER,
      height INTEGER,
      uploaded_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (site_id, id),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_media_library_site_id ON media_library(site_id);
  `)

  if (!colNames.has('media_library_limit')) {
    db.exec('ALTER TABLE sites ADD COLUMN media_library_limit INTEGER NOT NULL DEFAULT 100')
  }
  if (!colNames.has('last_media_library_pull_at')) {
    db.exec('ALTER TABLE sites ADD COLUMN last_media_library_pull_at TEXT')
  }

  // Taxonomy terms cache (site-level)
  db.exec(`
    CREATE TABLE IF NOT EXISTS taxonomy_terms (
      id INTEGER NOT NULL,
      site_id TEXT NOT NULL,
      taxonomy TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      parent INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, taxonomy, id),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `)

  // Per-post categories and tags (JSON arrays of term IDs)
  if (!postColNames.has('categories')) {
    db.exec('ALTER TABLE posts ADD COLUMN categories TEXT')
  }
  if (!postColNames.has('tags')) {
    db.exec('ALTER TABLE posts ADD COLUMN tags TEXT')
  }

  if (!postColNames.has('excerpt')) {
    db.exec("ALTER TABLE posts ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''")
  }
  if (!postColNames.has('slug')) {
    db.exec("ALTER TABLE posts ADD COLUMN slug TEXT NOT NULL DEFAULT ''")
  }
  // word_count column on posts
  if (!postColNames.has('word_count')) {
    db.exec('ALTER TABLE posts ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0')
  }

  // wp_author_id column on sites
  if (!colNames.has('wp_author_id')) {
    db.exec('ALTER TABLE sites ADD COLUMN wp_author_id INTEGER')
  }

  // site_icon_url column on sites
  if (!colNames.has('site_icon_url')) {
    db.exec('ALTER TABLE sites ADD COLUMN site_icon_url TEXT')
  }

  // Writing snapshots table (daily word count per post)
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_snapshots (
      site_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      date TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, post_id, date),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_writing_snapshots_site_date ON writing_snapshots(site_id, date);
  `)

  // Templates table (global, not per-site)
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      title_template TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      category_names TEXT NOT NULL DEFAULT '[]',
      tag_names TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

export function clearAllData(): void {
  closeDatabase()

  const userData = app.getPath('userData')

  // Delete the database file
  try {
    rmSync(join(userData, DB_FILENAME), { force: true })
  } catch { /* ignore */ }

  // Delete media, media-library, site-icons directories
  for (const dir of ['media', 'media-library', 'site-icons']) {
    try {
      rmSync(join(userData, dir), { recursive: true, force: true })
    } catch { /* ignore */ }
  }

  // Delete credentials file (keep db-key.enc.json and settings.json)
  try {
    rmSync(join(userData, 'credentials.enc.json'), { force: true })
  } catch { /* ignore */ }

  // Re-create empty database
  initDatabase()
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
