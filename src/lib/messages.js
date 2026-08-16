/**
 * Message types exchanged between the content script, service worker and
 * extension pages. Shared constants so a typo cannot silently create a
 * message nobody listens for.
 */

export const MSG = Object.freeze({
  // Extension page or popup -> content script
  CAPTURE_ALL: 'capture-all',
  CAPTURE_FILE: 'capture-file',
  LIST_STATUS: 'list-status',

  // Content script -> service worker
  SAVE_FILES: 'save-files',
  FILES_CHANGED: 'files-changed',

  // Extension page -> service worker
  SYNC_CHECK: 'sync-check',
  GET_STATUS: 'get-status',
  // Non-intrusive: answers only from a tab the user already has open.
  PEEK: 'peek',
})

/** Namespaced marker for window.postMessage traffic from the main world. */
export const BRIDGE_SOURCE = 'claude-file-vault'
