/**
 * Derives display metadata from a Claude sandbox file path.
 *
 * Capture is limited to the outputs directory: those are the files Claude
 * generated. The sibling uploads directory holds what the user pasted in and
 * is deliberately out of scope.
 */

export const OUTPUTS_DIR = '/mnt/user-data/outputs'
export const UPLOADS_DIR = '/mnt/user-data/uploads'

/** Extensions we can meaningfully show in a text editor, with their MIME types. */
const TEXT_TYPES = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  json: 'application/json',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  txt: 'text/plain',
  xml: 'application/xml',
  csv: 'text/csv',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  py: 'text/x-python',
  sh: 'application/x-sh',
}

const BINARY_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  zip: 'application/zip',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
}

const FALLBACK_MIME = 'application/octet-stream'

/**
 * A MIME type is renderable as text when we can put it in a code editor
 * without mangling it. SVG counts: it is an image, but it is also markup.
 */
function kindForMime(mime) {
  if (!mime) return 'binary'
  return mime.startsWith('text/') ||
    mime === 'image/svg+xml' ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/yaml' ||
    mime === 'application/x-sh'
    ? 'text'
    : 'binary'
}

/**
 * @param {string} absolutePath  Absolute sandbox path.
 * @param {string} [contentType] Optional MIME from the listing metadata, which
 *   is authoritative when present because the server actually sniffed the file.
 * @returns {{name: string, ext: string, mime: string, kind: 'text'|'binary'}}
 */
export function parsePath(absolutePath, contentType) {
  const name = String(absolutePath ?? '').split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''

  const mime =
    normaliseMime(contentType) ?? TEXT_TYPES[ext] ?? BINARY_TYPES[ext] ?? FALLBACK_MIME

  return { name, ext, mime, kind: kindForMime(mime) }
}

function normaliseMime(contentType) {
  if (!contentType || typeof contentType !== 'string') return undefined
  const mime = contentType.split(';')[0].trim().toLowerCase()
  // The download endpoint labels everything octet-stream, so it tells us nothing.
  if (!mime || mime === FALLBACK_MIME) return undefined
  return mime
}

/**
 * Coarse buckets for the library's filter chips.
 *
 * These are reader-facing categories, not technical ones: someone looking for
 * "the page Claude made" thinks pages, not text/html. SVG lands in images
 * because that is what a person sees, even though it is editable as text.
 */
const CATEGORIES = {
  pages: ['html', 'htm'],
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'],
  code: ['js', 'mjs', 'jsx', 'ts', 'tsx', 'css', 'py', 'sh', 'rb', 'go', 'rs', 'java', 'php'],
  data: ['json', 'csv', 'yaml', 'yml', 'xml', 'md', 'txt', 'sql'],
}

/** @returns {'pages'|'images'|'code'|'data'|'other'} */
export function fileCategory(ext) {
  const key = String(ext ?? '').toLowerCase()
  for (const [category, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(key)) return category
  }
  return 'other'
}

/** True only for files Claude generated into the outputs directory. */
export function isOutput(absolutePath) {
  return typeof absolutePath === 'string' && absolutePath.startsWith(`${OUTPUTS_DIR}/`)
}
