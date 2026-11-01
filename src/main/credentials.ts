import { safeStorage, app } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
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
  writeFileSync(path, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 })
  chmodSync(path, 0o600)
}

async function ensureEncryptionAvailable(): Promise<void> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('OS encryption is not available — cannot safely store credentials')
  }
}

async function encrypt(plainText: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(plainText)).toString('base64')
}

/**
 * Set one entry in an encrypted store. Encryption is awaited BEFORE the store is
 * read, so the read-modify-write below runs without yielding — a concurrent
 * write to another entry can't be overwritten with a stale copy of the file.
 */
async function writeEntry(filename: string, key: string, plainText: string): Promise<void> {
  const encrypted = await encrypt(plainText)
  const store = readStore(filename)
  store[key] = encrypted
  writeStore(filename, store)
}

/**
 * Decrypt one stored value. Data written by the old synchronous safeStorage API
 * decrypts here unchanged; if Electron says the OS key has since rotated, the
 * value is re-encrypted under the current key and written back.
 */
async function decryptEntry(filename: string, key: string, entry: string): Promise<string> {
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(entry, 'base64'))
  if (shouldReEncrypt) await writeEntry(filename, key, result)
  return result
}

// ── Database encryption key ──────────────────────────────────────────────

export async function getOrCreateDbKey(): Promise<string> {
  await ensureEncryptionAvailable()
  const existing = readStore(DB_KEY_FILE).dbKey
  if (existing) return decryptEntry(DB_KEY_FILE, 'dbKey', existing)

  // Generate a new 32-byte hex key
  const key = randomBytes(32).toString('hex')
  const encrypted = await encrypt(key)

  // Re-check after the await: if another caller created a key meanwhile, use
  // theirs — two keys would leave the database unreadable under one of them.
  const raced = readStore(DB_KEY_FILE).dbKey
  if (raced) return decryptEntry(DB_KEY_FILE, 'dbKey', raced)

  writeStore(DB_KEY_FILE, { dbKey: encrypted })
  return key
}

// ── Site credential storage ──────────────────────────────────────────────

export async function storeCredential(keychainRef: string, password: string): Promise<void> {
  await ensureEncryptionAvailable()
  await writeEntry(CRED_FILE, keychainRef, password)
}

export async function getCredential(keychainRef: string): Promise<string | null> {
  await ensureEncryptionAvailable()
  const entry = readStore(CRED_FILE)[keychainRef]
  if (!entry) return null
  return decryptEntry(CRED_FILE, keychainRef, entry)
}

export function deleteCredential(keychainRef: string): void {
  const store = readStore(CRED_FILE)
  delete store[keychainRef]
  writeStore(CRED_FILE, store)
}
