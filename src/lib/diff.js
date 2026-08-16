/**
 * Decides what has changed between a conversation's live files and what we
 * already hold.
 *
 * The listing metadata carries size and creation timestamp, so this comparison
 * costs one request and zero downloads — we only fetch bytes for files that
 * actually moved.
 */

export const STATES = {
  NEW: 'new',
  UNCHANGED: 'unchanged',
  CHANGED: 'changed',
  CONFLICT: 'conflict',
  ORPHANED: 'orphaned',
}

/**
 * @param {?{size: number, created_at: string}} remoteMeta  null when the file is gone upstream
 * @param {?{remoteSize: number, remoteCreatedAt: string, edited: boolean}} storedFile
 * @returns {string} one of STATES
 */
export function classifyFile(remoteMeta, storedFile) {
  if (!storedFile) return STATES.NEW
  if (!remoteMeta) return STATES.ORPHANED

  const moved =
    remoteMeta.size !== storedFile.remoteSize ||
    remoteMeta.created_at !== storedFile.remoteCreatedAt

  if (!moved) return STATES.UNCHANGED

  // Conflict is checked before changed because it is the protective case: the
  // user has local work here and updating would destroy it. There is no version
  // history to fall back on, so this distinction is the only guard rail.
  return storedFile.edited ? STATES.CONFLICT : STATES.CHANGED
}

/**
 * @param {Array<{path: string, size: number, created_at: string}>} remoteMetaList
 * @param {Array<{path: string, remoteSize: number, remoteCreatedAt: string, edited: boolean}>} storedFiles
 */
export function diffConversation(remoteMetaList = [], storedFiles = []) {
  const storedByPath = new Map(storedFiles.map((f) => [f.path, f]))
  const result = { new: [], unchanged: [], changed: [], conflict: [], orphaned: [] }

  for (const remote of remoteMetaList) {
    const stored = storedByPath.get(remote.path) ?? null
    result[classifyFile(remote, stored)].push({ ...remote, stored, state: classifyFile(remote, stored) })
  }

  const remotePaths = new Set(remoteMetaList.map((f) => f.path))
  for (const stored of storedFiles) {
    if (!remotePaths.has(stored.path)) {
      result.orphaned.push({ path: stored.path, stored, state: STATES.ORPHANED })
    }
  }

  const counts = {
    new: result.new.length,
    unchanged: result.unchanged.length,
    changed: result.changed.length,
    conflict: result.conflict.length,
    orphaned: result.orphaned.length,
  }
  counts.total = counts.new + counts.unchanged + counts.changed + counts.conflict + counts.orphaned

  return { ...result, counts }
}
