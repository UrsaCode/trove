/**
 * Export: one file, or a whole conversation as a zip.
 */

import { zipSync, strToU8 } from 'fflate'
import { toBytes } from '../lib/bytes.js'

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFile(file) {
  const blob =
    file.kind === 'text'
      ? new Blob([file.content], { type: `${file.mime};charset=utf-8` })
      : file.content
  download(blob, file.name)
}

/** Safe-ish archive name from a conversation title. */
export function archiveName(title) {
  const slug = String(title || 'conversation')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'conversation'}.zip`
}

export async function exportConversation(conversation, files) {
  const entries = {}
  for (const file of files) {
    entries[file.name] =
      file.kind === 'text' ? strToU8(file.content) : await toBytes(file.content)
  }
  const zipped = zipSync(entries, { level: 6 })
  download(new Blob([zipped], { type: 'application/zip' }), archiveName(conversation?.title))
}
