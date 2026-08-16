/**
 * Content hashing, used to tell whether a stored file has drifted from what
 * was captured — which is how a local edit is detected independently of the
 * `edited` flag.
 */

/**
 * @param {string|Blob|ArrayBuffer} content
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function hashContent(content) {
  const buffer = await toArrayBuffer(content)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function toArrayBuffer(content) {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  if (content instanceof ArrayBuffer) return content
  if (content && typeof content.arrayBuffer === 'function') return content.arrayBuffer()
  // Older Blob implementations (notably jsdom's) predate Blob.arrayBuffer().
  if (typeof Blob !== 'undefined' && content instanceof Blob) return readViaFileReader(content)
  throw new TypeError('hashContent expects a string, Blob or ArrayBuffer')
}

function readViaFileReader(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // Copy into this realm's Uint8Array: FileReader may hand back an
    // ArrayBuffer from another realm, which SubtleCrypto rejects.
    reader.onload = () => resolve(Uint8Array.from(new Uint8Array(reader.result)))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
