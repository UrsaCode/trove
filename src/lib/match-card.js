/**
 * Binds a rendered file card in the transcript to a real sandbox path.
 *
 * A card shows a humanised title ("Fbmp fleet thresholds") and a type label
 * ("Code · HTML"); the file behind it is "fbmp-fleet-thresholds.html". Matching
 * is a heuristic, but a well-constrained one: we always match against the known
 * file list for this conversation, so the answer set is small and finite.
 *
 * The important rule is that ambiguity never guesses. Two candidates matching
 * is reported as no match, which sends the caller to an explicit picker. A
 * wrong binding would silently capture or overwrite the wrong file.
 */

const LABEL_EXTENSIONS = {
  html: 'html',
  htm: 'html',
  css: 'css',
  javascript: 'js',
  js: 'js',
  json: 'json',
  svg: 'svg',
  markdown: 'md',
  md: 'md',
  text: 'txt',
  xml: 'xml',
  csv: 'csv',
  yaml: 'yaml',
  python: 'py',
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  pdf: 'pdf',
}

/** "Fbmp fleet thresholds" -> "fbmp-fleet-thresholds" */
export function slugifyTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    // Apostrophes are elided rather than separated: "Claude's" is one word,
    // and filenames slugify it as "claudes".
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "Code · HTML" -> "html". Returns null when the label says nothing useful. */
export function extFromTypeLabel(label) {
  if (!label || typeof label !== 'string') return null
  // Take the last segment: the leading word is a category ("Code", "Image").
  const tail = label.split(/[·|•·]/).pop().trim().toLowerCase()
  return LABEL_EXTENSIONS[tail] ?? null
}

function basenameWithoutExt(path) {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase()
}

function extOf(path) {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * @param {{title: string, typeLabel: string}} card
 * @param {string[]} candidatePaths
 * @returns {{path: string|null, confidence: 'exact'|'none'}}
 */
export function matchCard(card, candidatePaths = []) {
  const NONE = { path: null, confidence: 'none' }
  const slug = slugifyTitle(card?.title)
  if (!slug || candidatePaths.length === 0) return NONE

  let matches = candidatePaths.filter((p) => basenameWithoutExt(p) === slug)

  // Only narrow by extension when the basename alone was ambiguous — a card
  // label is less trustworthy than the filename itself.
  if (matches.length > 1) {
    const ext = extFromTypeLabel(card?.typeLabel)
    if (ext) matches = matches.filter((p) => extOf(p) === ext)
  }

  return matches.length === 1 ? { path: matches[0], confidence: 'exact' } : NONE
}
