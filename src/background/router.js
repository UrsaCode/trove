/**
 * Message routing and the sole write path into storage.
 *
 * Kept separate from sw.js and given its dependencies by injection, so the
 * routing rules - especially the auto-capture gate and the debounce - can be
 * tested without a browser.
 */

import { MSG } from '../lib/messages.js'
import { putFile, putConversation, listFiles, getFile, getConversation, contentSize } from '../lib/db.js'
import { preserveUserFields } from '../lib/naming.js'

export function createRouter({
  getSettings,
  requestSync,
  debounceMs = 2000,
  now = () => Date.now(),
} = {}) {
  /** convId -> pending timer, so a burst of signals costs one sync. */
  const pending = new Map()

  async function saveFiles({ conversation, files = [] }) {
    for (const file of files) {
      // A capture replaces content and upstream metadata by design, but the
      // name and note belong to the user - re-pulling must not undo a rename.
      const existing = await getFile(file.id)
      await putFile(preserveUserFields(existing, file))
    }

    // Recompute from storage rather than trusting the message: a partial
    // capture must not leave the conversation claiming files it lacks.
    const stored = await listFiles(conversation.id)
    const existingConversation = await getConversation(conversation.id)
    await putConversation(
      preserveUserFields(existingConversation, {
        ...conversation,
        fileCount: stored.length,
        bytes: stored.reduce((sum, f) => sum + contentSize(f.content), 0),
        capturedAt: existingConversation?.capturedAt ?? conversation.capturedAt ?? now(),
        updatedAt: now(),
      }),
    )

    return { ok: true, saved: files.length }
  }

  async function filesChanged({ convId }, sender) {
    if (!convId) return { ok: false, error: 'files-changed without a conversation id' }

    const { autoCapture } = await getSettings()
    if (!autoCapture) return { ok: true, skipped: 'auto-capture-off' }

    const tabId = sender?.tab?.id
    if (tabId == null) return { ok: false, error: 'files-changed without a tab' }

    clearTimeout(pending.get(convId))
    pending.set(
      convId,
      setTimeout(() => {
        pending.delete(convId)
        // A sync failure is not worth surfacing: the tab may simply have gone
        // away, and the user never asked for this particular sync.
        Promise.resolve(requestSync(tabId, convId)).catch(() => {})
      }, debounceMs),
    )

    return { ok: true, scheduled: true }
  }

  async function handleMessage(message, sender) {
    try {
      switch (message?.type) {
        case MSG.SAVE_FILES:
          return await saveFiles(message)
        case MSG.FILES_CHANGED:
          return await filesChanged(message, sender)
        case MSG.GET_STATUS:
          return { ok: true, files: await listFiles(message.convId) }
        default:
          return { ok: false, error: `Unknown message type: ${message?.type ?? '(none)'}` }
      }
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) }
    }
  }

  return { handleMessage }
}
