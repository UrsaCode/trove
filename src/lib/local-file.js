/**
 * Files Trove makes itself, rather than captures.
 *
 * A screenshot belongs in the library next to the file it was taken of, but it
 * has no upstream and never will. Marking it `origin: 'local'` is what stops
 * the rest of the system treating a file with no source as a file whose source
 * vanished - see isLocal in diff.js.
 */

import { hashContent } from './hash.js'
import { fileId } from './db.js'
import { normaliseName } from './naming.js'

/** Where local files live. Not a sandbox path, and deliberately unlike one. */
export const LOCAL_DIR = '/trove/local'

/**
 * Build a stored record for something made here.
 *
 * @param {object} options
 * @param {string} options.convId    the conversation to file it under
 * @param {string} options.name      filename, including extension
 * @param {Blob} options.content
 * @param {string} [options.mime]
 * @param {string} [options.note]    why it exists, shown in details
 * @returns {Promise<object>} a file record ready for the database
 */
export async function makeLocalFile({ convId, name, content, mime, note }) {
  const safeName = normaliseName(name, { fallback: 'untitled' })
  const ext = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : ''
  const path = `${LOCAL_DIR}/${safeName}`
  const now = Date.now()

  return {
    id: fileId(convId, path),
    convId,
    path,
    name: safeName,
    ext,
    mime: mime || content?.type || 'application/octet-stream',
    kind: 'binary',
    content,
    hash: await hashContent(content),
    // No upstream, so nothing to compare against. Leaving these null rather
    // than zero keeps "size at source" honest in the details panel.
    remoteSize: null,
    remoteCreatedAt: null,
    origin: 'local',
    note: note ?? '',
    edited: false,
    capturedAt: now,
    updatedAt: now,
  }
}

/**
 * A filename that will not collide with one already in the conversation.
 *
 * Screenshots of the same file are taken repeatedly, and silently overwriting
 * the previous one would be the wrong default for something there is no way to
 * recover.
 */
export function uniqueName(desired, taken = []) {
  const used = new Set(taken)
  if (!used.has(desired)) return desired

  const dot = desired.lastIndexOf('.')
  const stem = dot > 0 ? desired.slice(0, dot) : desired
  const suffix = dot > 0 ? desired.slice(dot) : ''

  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${suffix}`
}
