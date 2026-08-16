/**
 * Content hashing, used to tell whether a stored file has drifted from what
 * was captured - which is how a local edit is detected independently of the
 * `edited` flag.
 */

import { toBytes } from './bytes.js'

/**
 * @param {string|Blob|ArrayBuffer|ArrayBufferView} content
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function hashContent(content) {
  const digest = await crypto.subtle.digest('SHA-256', await toBytes(content))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
