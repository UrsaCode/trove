/**
 * IndexedDB storage for captured conversations and files.
 *
 * Files are keyed by conversation plus sandbox path. The path is stable across
 * edits upstream, which makes an update a plain upsert rather than a
 * match-and-merge, and makes re-capturing a conversation idempotent.
 *
 * Binary content is persisted as a Uint8Array and handed back as a Blob. See
 * bytes.js for why the stored form is a typed array rather than a Blob.
 */

import { toBytes, blobFrom, byteLength } from './bytes.js'

export const DB_NAME = 'claude-vault'
export const DB_VERSION = 1
export const STORE_CONVERSATIONS = 'conversations'
export const STORE_FILES = 'files'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const files = db.createObjectStore(STORE_FILES, { keyPath: 'id' })
        files.createIndex('by_conv', 'convId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Stable composite key. The path already encodes the filename. */
export function fileId(convId, path) {
  return `${convId}|${path}`
}

// -- Conversations ---------------------------------------------------------

export async function putConversation(record) {
  const db = await openDb()
  const transaction = db.transaction(STORE_CONVERSATIONS, 'readwrite')
  await request(transaction.objectStore(STORE_CONVERSATIONS).put(record))
  return record
}

export async function getConversation(id) {
  const db = await openDb()
  return request(db.transaction(STORE_CONVERSATIONS).objectStore(STORE_CONVERSATIONS).get(id))
}

/** Most recently updated first - the list is a work queue, not an archive. */
export async function listConversations() {
  const db = await openDb()
  const all = await request(
    db.transaction(STORE_CONVERSATIONS).objectStore(STORE_CONVERSATIONS).getAll(),
  )
  return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function deleteConversation(id) {
  const db = await openDb()
  const transaction = db.transaction([STORE_CONVERSATIONS, STORE_FILES], 'readwrite')
  transaction.objectStore(STORE_CONVERSATIONS).delete(id)

  // Cascade: an orphaned file row would be invisible in the UI but still
  // consume quota, so deletion has to reach the index.
  const index = transaction.objectStore(STORE_FILES).index('by_conv')
  const keys = await request(index.getAllKeys(IDBKeyRange.only(id)))
  for (const key of keys) transaction.objectStore(STORE_FILES).delete(key)

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// -- Files -----------------------------------------------------------------

/** Binary arrives as a Blob but is persisted as a typed array - see bytes.js. */
async function forStorage(record) {
  if (record.kind !== 'binary' || record.content == null) return record
  return { ...record, content: await toBytes(record.content) }
}

/** The inverse: callers want a Blob they can render or download. */
function fromStorage(record) {
  if (!record || record.kind !== 'binary' || record.content == null) return record
  if (typeof Blob !== 'undefined' && record.content instanceof Blob) return record
  return { ...record, content: blobFrom(record.content, record.mime) }
}

export async function putFile(record) {
  // Convert before opening the transaction: an IndexedDB transaction closes as
  // soon as the microtask queue drains without a pending request, so awaiting
  // inside one would abort it.
  const stored = await forStorage(record)
  const db = await openDb()
  const transaction = db.transaction(STORE_FILES, 'readwrite')
  await request(transaction.objectStore(STORE_FILES).put(stored))
  return record
}

export async function getFile(id) {
  const db = await openDb()
  return fromStorage(await request(db.transaction(STORE_FILES).objectStore(STORE_FILES).get(id)))
}

export async function listFiles(convId) {
  const db = await openDb()
  const index = db.transaction(STORE_FILES).objectStore(STORE_FILES).index('by_conv')
  const all = await request(index.getAll(IDBKeyRange.only(convId)))
  return all.map(fromStorage).sort((a, b) => a.name.localeCompare(b.name))
}

export async function deleteFile(id) {
  const db = await openDb()
  const transaction = db.transaction(STORE_FILES, 'readwrite')
  await request(transaction.objectStore(STORE_FILES).delete(id))
}

// -- Reporting -------------------------------------------------------------

export const contentSize = byteLength

/** Bytes held per conversation, for the quota-exceeded path and the UI. */
export async function storageUsage() {
  const db = await openDb()
  const all = await request(db.transaction(STORE_FILES).objectStore(STORE_FILES).getAll())
  const usage = {}
  for (const file of all) {
    usage[file.convId] = (usage[file.convId] ?? 0) + contentSize(file.content)
  }
  return usage
}

/** Test-only: drop the database and forget the cached connection. */
export async function resetDbForTests() {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}
