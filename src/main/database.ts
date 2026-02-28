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
  // key is a hex string generated internally by getOrCreateDbKey() — safe to interpolate
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

/** Try to add a column; silently ignore if it already exists. */
function safeAddColumn(db: Database.Database, table: string, col: string, type: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
  } catch {
    // Column already exists
  }
}

/**
 * Versioned migration system.
 *
 * Each entry runs once, in order. The current schema version is tracked via
 * SQLite's built-in `PRAGMA user_version`. To add a migration, append a new
 * function to this array — existing databases will only run the new entries.
 *
 * v1 consolidates all legacy column/table additions and is fully idempotent
 * so it's safe for both fresh installs and existing databases upgrading to
 * the versioned system for the first time.
 */
const migrations: Array<(db: Database.Database) => void> = [
  // ── v1: consolidate all pre-existing schema additions ──
  (db) => {
    // Sites columns
    safeAddColumn(db, 'sites', 'last_post_pull_at', 'TEXT')
    safeAddColumn(db, 'sites', 'last_schema_pull_at', 'TEXT')
    safeAddColumn(db, 'sites', 'media_library_limit', 'INTEGER NOT NULL DEFAULT 100')
    safeAddColumn(db, 'sites', 'last_media_library_pull_at', 'TEXT')
    safeAddColumn(db, 'sites', 'wp_author_id', 'INTEGER')
    safeAddColumn(db, 'sites', 'site_icon_url', 'TEXT')

    // ACF schema columns
    safeAddColumn(db, 'acf_schema', 'location', 'TEXT DEFAULT NULL')

    // Posts columns
    safeAddColumn(db, 'posts', 'date', 'TEXT')
    safeAddColumn(db, 'posts', 'author_id', 'INTEGER')
    safeAddColumn(db, 'posts', 'author_name', 'TEXT')
    safeAddColumn(db, 'posts', 'featured_image', 'TEXT')
    safeAddColumn(db, 'posts', 'categories', 'TEXT')
    safeAddColumn(db, 'posts', 'tags', 'TEXT')
    safeAddColumn(db, 'posts', 'excerpt', "TEXT NOT NULL DEFAULT ''")
    safeAddColumn(db, 'posts', 'slug', "TEXT NOT NULL DEFAULT ''")
    safeAddColumn(db, 'posts', 'word_count', 'INTEGER NOT NULL DEFAULT 0')

    // Unique indexes
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_site_wp ON posts(site_id, wp_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_acf_schema_site_group ON acf_schema(site_id, group_id);
    `)

    // Media library table
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

    // Taxonomy terms table
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

    // Writing snapshots table
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

    // Templates table
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
  },

  // ── v2: scratchpads table + posts.scratchpad_id ──
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scratchpads (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        wp_id INTEGER,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        modified_local TEXT NOT NULL DEFAULT (datetime('now')),
        modified_remote TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_scratchpads_site_id ON scratchpads(site_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scratchpads_site_wp ON scratchpads(site_id, wp_id);
    `)
    safeAddColumn(db, 'posts', 'scratchpad_id', 'TEXT DEFAULT NULL')
  },

  // ── v3: revisions table + FTS5 virtual table ──
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        word_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_revisions_post_id ON revisions(post_id);
      CREATE INDEX IF NOT EXISTS idx_revisions_created_at ON revisions(post_id, created_at);
    `)

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        post_id UNINDEXED, site_id UNINDEXED,
        title, content, excerpt,
        tokenize='porter unicode61'
      );
    `)

    // Populate FTS from existing posts (strip HTML tags from content)
    const posts = db.prepare('SELECT id, site_id, title, content, excerpt FROM posts').all() as {
      id: string; site_id: string; title: string; content: string; excerpt: string
    }[]
    const insert = db.prepare('INSERT INTO posts_fts (post_id, site_id, title, content, excerpt) VALUES (?, ?, ?, ?, ?)')
    for (const p of posts) {
      const plainContent = p.content.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
      insert.run(p.id, p.site_id, p.title, plainContent, p.excerpt)
    }
  }
]

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  for (let i = currentVersion; i < migrations.length; i++) {
    migrations[i](db)
    db.pragma(`user_version = ${i + 1}`)
  }
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
