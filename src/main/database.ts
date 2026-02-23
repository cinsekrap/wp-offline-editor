import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import { join } from 'path'
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

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
