/**
 * Byte conversions shared by hashing and storage.
 *
 * Binary content travels as a Blob at the edges (that is what fetch hands us
 * and what an object URL wants) but is persisted as a Uint8Array. Structured
 * cloning of Blobs is uneven across IndexedDB implementations, whereas typed
 * arrays are universally supported — and they cost the same bytes, unlike
 * base64.
 *
 * Everything is normalised to a Uint8Array rather than a bare ArrayBuffer.
 * Some SubtleCrypto implementations reject an ArrayBuffer that originated in
 * another realm while accepting the typed array view over it, so the view is
 * the portable currency.
 */

/**
 * @param {string|Blob|ArrayBuffer|ArrayBufferView} content
 * @returns {Promise<Uint8Array>}
 */
export async function toBytes(content) {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  if (content instanceof Uint8Array) return content
  if (ArrayBuffer.isView(content)) return copy(new Uint8Array(content.buffer, content.byteOffset, content.byteLength))
  if (content instanceof ArrayBuffer) return copy(new Uint8Array(content))
  if (content && typeof content.arrayBuffer === 'function') {
    return copy(new Uint8Array(await content.arrayBuffer()))
  }
  // Older Blob implementations (notably jsdom's) predate Blob.arrayBuffer().
  if (typeof Blob !== 'undefined' && content instanceof Blob) return readViaFileReader(content)
  throw new TypeError('Expected a string, Blob, ArrayBuffer or TypedArray')
}

/** Wrap stored bytes back into a Blob for rendering and download. */
export function blobFrom(bytes, mime) {
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

export function byteLength(content) {
  if (content == null) return 0
  if (typeof content === 'string') return new TextEncoder().encode(content).byteLength
  if (typeof content.byteLength === 'number') return content.byteLength
  if (typeof content.size === 'number') return content.size
  return 0
}

/** Re-materialise in this realm, so cross-realm buffers are never handed on. */
function copy(view) {
  return Uint8Array.from(view)
}

function readViaFileReader(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(copy(new Uint8Array(reader.result)))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
