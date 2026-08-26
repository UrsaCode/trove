/**
 * Display names.
 *
 * A file's identity is its sandbox path and a conversation's is its uuid, so a
 * rename is only ever a label. Keeping the rename in a separate field means a
 * re-pull can replace the content and the upstream name without touching what
 * the user chose to call it.
 */

/** What to show for a file: the user's name if they set one, else its own. */
export function displayName(file) {
  if (!file) return ''
  const renamed = typeof file.renamedTo === 'string' ? file.renamedTo.trim() : ''
  return renamed || file.name || ''
}

/** What to show for a conversation. */
export function displayTitle(conversation) {
  if (!conversation) return ''
  const renamed =
    typeof conversation.renamedTo === 'string' ? conversation.renamedTo.trim() : ''
  return renamed || conversation.title || 'Untitled conversation'
}

/** True when the label differs from what the source calls it. */
export function isRenamed(record) {
  const renamed = typeof record?.renamedTo === 'string' ? record.renamedTo.trim() : ''
  const original = record?.name ?? record?.title ?? ''
  return Boolean(renamed) && renamed !== original
}

/**
 * Normalise a name the user typed.
 *
 * Empty means "go back to the original", which is how a rename is undone
 * without needing a separate control.
 */
export function normaliseName(input, { fallback = '' } = {}) {
  const cleaned = String(input ?? '')
    // A label is not a location: a name that traversed directories would lie
    // about where the file actually lives.
    .replace(/[\\/]+/g, '-')
    // Control characters render as nothing while still counting as text.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

/**
 * Fields the user owns, which a re-capture must never clobber.
 *
 * Re-pulling replaces content and upstream metadata by design. It must not
 * also discard the name someone chose, or a rename would silently undo itself
 * the next time the source moved on.
 */
export function preserveUserFields(existing, incoming) {
  if (!existing) return incoming
  const preserved = { ...incoming }
  if (existing.renamedTo) preserved.renamedTo = existing.renamedTo
  if (existing.note) preserved.note = existing.note
  return preserved
}
