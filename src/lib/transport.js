/**
 * Encoding file records for the message channel.
 *
 * chrome.runtime.sendMessage serialises with JSON, not structured clone. A Blob
 * survives that as `{}` - no error, no warning, just an empty object arriving at
 * the other end. Every binary file captured this way was written to storage with
 * nothing in it while the capture reported success.
 *
 * So binary content crosses the channel as base64 and is turned back into bytes
 * on arrival. Text needs no encoding: JSON carries strings faithfully.
 */

import { toBytes } from './bytes.js'

/** Marker so the receiving side can tell an encoded payload from real content. */
const ENCODED = '__troveBase64'

/** Chunked so a large file cannot blow the argument limit on String.fromCharCode. */
function bytesToBase64(bytes) {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** True for a payload this module produced. */
export function isEncoded(content) {
  return Boolean(content) && typeof content === 'object' && typeof content[ENCODED] === 'string'
}

/**
 * @param {object} record a file record, possibly holding a Blob
 * @returns {Promise<object>} the same record, safe to send over the channel
 */
export async function encodeRecord(record) {
  if (!record || record.kind !== 'binary' || record.content == null) return record
  if (isEncoded(record.content)) return record

  const bytes = await toBytes(record.content)
  return { ...record, content: { [ENCODED]: bytesToBase64(bytes) } }
}

/**
 * @param {object} record a record that arrived over the channel
 * @returns {object} the record with real bytes restored
 */
export function decodeRecord(record) {
  if (!record || !isEncoded(record.content)) return record
  return { ...record, content: base64ToBytes(record.content[ENCODED]) }
}

export function encodeRecords(records = []) {
  return Promise.all(records.map(encodeRecord))
}

export function decodeRecords(records = []) {
  return records.map(decodeRecord)
}
