import { safeStorage, app } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const DB_KEY_FILE = 'db-key.enc.json'
const CRED_FILE = 'credentials.enc.json'

interface EncryptedStore {
  [key: string]: string // base64-encoded encrypted buffer
}

function getStorePath(filename: string): string {
  return join(app.getPath('userData'), filename)
}

function readStore(filename: string): EncryptedStore {
  const path = getStorePath(filename)
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as EncryptedStore
}

function writeStore(filename: string, store: EncryptedStore): void {
  const path = getStorePath(filename)
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
}

// ── Database encryption key ──────────────────────────────────────────────

export function getOrCreateDbKey(): string {
  const store = readStore(DB_KEY_FILE)

  if (store.dbKey) {
    const encrypted = Buffer.from(store.dbKey, 'base64')
    return safeStorage.decryptString(encrypted)
  }

  // Generate a new 32-byte hex key
  const key = randomBytes(32).toString('hex')
  const encrypted = safeStorage.encryptString(key)
  writeStore(DB_KEY_FILE, { dbKey: encrypted.toString('base64') })
  return key
}

// ── Site credential storage ──────────────────────────────────────────────

export function storeCredential(keychainRef: string, password: string): void {
  const store = readStore(CRED_FILE)
  const encrypted = safeStorage.encryptString(password)
  store[keychainRef] = encrypted.toString('base64')
  writeStore(CRED_FILE, store)
}

export function getCredential(keychainRef: string): string | null {
  const store = readStore(CRED_FILE)
  const entry = store[keychainRef]
  if (!entry) return null
  const encrypted = Buffer.from(entry, 'base64')
  return safeStorage.decryptString(encrypted)
}

export function deleteCredential(keychainRef: string): void {
  const store = readStore(CRED_FILE)
  delete store[keychainRef]
  writeStore(CRED_FILE, store)
}
