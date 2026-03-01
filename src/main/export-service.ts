import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import { join } from 'path'
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync
} from 'fs'
import { randomBytes, pbkdf2Sync } from 'crypto'
import { execFileSync } from 'child_process'
import { getOrCreateDbKey } from './credentials'
import { getDb, closeDatabase, initDatabase } from './database'

const DB_FILENAME = 'wp-offline-editor.db'
const METADATA_FILENAME = 'metadata.json'

export interface ExportMetadata {
  version: string
  exportedAt: string
  salt: string
  sites: { label: string; url: string }[]
}

function deriveKey(password: string, salt: Buffer): string {
  return pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')
}

export async function exportData(password: string, destPath: string): Promise<void> {
  const userData = app.getPath('userData')
  const localKey = getOrCreateDbKey()

  // Create temp directory for export assembly
  const tempDir = join(app.getPath('temp'), `nppexport-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  try {
    // 1. Create a clean copy of the database using VACUUM INTO (works with encrypted DBs)
    const backupPath = join(tempDir, DB_FILENAME)
    const db = getDb()
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)

    // 2. Re-encrypt backup with password-derived key
    const salt = randomBytes(16)
    const derivedKey = deriveKey(password, salt)

    const backupDb = new Database(backupPath)
    backupDb.pragma(`key='${localKey}'`)
    backupDb.pragma(`rekey='${derivedKey}'`)

    // Read sites for metadata while we have it open
    const sites = backupDb.prepare('SELECT label, url FROM sites').all() as { label: string; url: string }[]
    backupDb.close()

    // 3. Copy media directories
    for (const dir of ['media', 'media-library', 'site-icons']) {
      const srcDir = join(userData, dir)
      if (existsSync(srcDir)) {
        cpSync(srcDir, join(tempDir, dir), { recursive: true })
      }
    }

    const metadata: ExportMetadata = {
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      salt: salt.toString('hex'),
      sites
    }
    writeFileSync(join(tempDir, METADATA_FILENAME), JSON.stringify(metadata, null, 2))

    // 5. Create zip archive using macOS built-in zip
    if (existsSync(destPath)) rmSync(destPath)
    execFileSync('zip', ['-r', destPath, '.'], { cwd: tempDir })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function readExportMetadata(archivePath: string): ExportMetadata {
  const tempDir = join(app.getPath('temp'), `nppimport-meta-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  try {
    execFileSync('unzip', ['-o', archivePath, METADATA_FILENAME, '-d', tempDir])
    const raw = readFileSync(join(tempDir, METADATA_FILENAME), 'utf-8')
    return JSON.parse(raw) as ExportMetadata
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function importData(password: string, archivePath: string): Promise<void> {
  const userData = app.getPath('userData')
  const localKey = getOrCreateDbKey()

  // Extract archive to temp dir
  const tempDir = join(app.getPath('temp'), `nppimport-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  try {
    execFileSync('unzip', ['-o', archivePath, '-d', tempDir])

    // Read metadata and derive key
    const raw = readFileSync(join(tempDir, METADATA_FILENAME), 'utf-8')
    const metadata = JSON.parse(raw) as ExportMetadata
    const salt = Buffer.from(metadata.salt, 'hex')
    const derivedKey = deriveKey(password, salt)

    // Validate: try opening the DB with the derived key
    const importedDbPath = join(tempDir, DB_FILENAME)
    const testDb = new Database(importedDbPath)
    testDb.pragma(`key='${derivedKey}'`)
    try {
      testDb.prepare('SELECT count(*) FROM sites').get()
    } catch {
      testDb.close()
      throw new Error('Incorrect password or corrupted export file')
    }

    // Re-encrypt with local machine's key
    testDb.pragma(`rekey='${localKey}'`)
    testDb.close()

    // Close current database
    closeDatabase()

    // Replace: DB file
    copyFileSync(importedDbPath, join(userData, DB_FILENAME))

    // Replace: media directories
    for (const dir of ['media', 'media-library', 'site-icons']) {
      const destDir = join(userData, dir)
      rmSync(destDir, { recursive: true, force: true })
      const srcDir = join(tempDir, dir)
      if (existsSync(srcDir)) {
        cpSync(srcDir, destDir, { recursive: true })
      }
    }

    // Delete credentials — imported sites need re-authentication
    try {
      rmSync(join(userData, 'credentials.enc.json'), { force: true })
    } catch { /* ignore */ }

    // Re-initialize database (runs migrations if schema version differs)
    initDatabase()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
