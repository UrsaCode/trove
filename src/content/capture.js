/**
 * Turns listing entries into stored file records.
 *
 * Separated from the DOM and from chrome APIs so the capture rules - which
 * files get fetched, what a record carries - are testable in isolation.
 */

import { downloadFile } from './api.js'
import { hashContent } from '../lib/hash.js'
import { fileId } from '../lib/db.js'
import { diffConversation, STATES } from '../lib/diff.js'

/**
 * @param {object} options
 * @param {string} options.orgId
 * @param {string} options.convId
 * @param {Array} options.entries   listing entries from listOutputFiles
 * @returns {Promise<{records: Array, errors: Array}>}
 */
export async function captureEntries({ orgId, convId, entries, deps = {} }) {
  const { download = downloadFile, hash = hashContent, now = () => Date.now() } = deps
  const records = []
  const errors = []

  for (const entry of entries) {
    try {
      const file = await download(orgId, convId, entry.path)
      records.push({
        id: fileId(convId, entry.path),
        convId,
        path: entry.path,
        name: file.name,
        ext: file.ext,
        mime: file.mime,
        kind: file.kind,
        content: file.content,
        hash: await hash(file.content),
        remoteSize: entry.size ?? 0,
        remoteCreatedAt: entry.created_at ?? null,
        // A freshly captured file matches its source by definition.
        edited: false,
        capturedAt: now(),
        updatedAt: now(),
      })
    } catch (error) {
      // One unreadable file must not abandon the rest of the capture.
      errors.push({ path: entry.path, error: error?.message ?? String(error) })
    }
  }

  return { records, errors }
}

/**
 * Which entries a capture should actually fetch.
 *
 * `onlyChanged` is what auto-capture uses: re-downloading unchanged files on
 * every signal would turn a background convenience into constant traffic.
 * Conflicts are always excluded here - overwriting local edits requires an
 * explicit confirmation, which lives in the UI, not in a background sync.
 */
export function selectForCapture(remoteEntries, storedFiles, { onlyChanged = false } = {}) {
  const diff = diffConversation(remoteEntries, storedFiles)
  const wanted = onlyChanged ? [...diff.new, ...diff.changed] : [...diff.new, ...diff.changed, ...diff.unchanged]

  const byPath = new Map(remoteEntries.map((e) => [e.path, e]))
  return {
    entries: wanted.map((f) => byPath.get(f.path)).filter(Boolean),
    conflicts: diff.conflict.map((f) => byPath.get(f.path)).filter(Boolean),
    diff,
  }
}

export { STATES }
