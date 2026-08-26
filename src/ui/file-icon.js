/**
 * Per-type file glyphs.
 *
 * Drawn rather than lettered: an extension chip already spells the type out,
 * so the glyph's job is to make the list scannable at a glance, by silhouette.
 * Each is a 16-unit square on the same optical weight so a column of mixed
 * types reads evenly.
 *
 * Colour comes from `currentColor` everywhere except where a type genuinely
 * carries meaning in the design's vocabulary - it does not, so these stay
 * monochrome. Aqua and amber are reserved for the tether.
 */

const NS = 'http://www.w3.org/2000/svg'

/**
 * Paths per category, keyed by the buckets fileCategory() produces plus a few
 * finer distinctions worth telling apart by shape.
 */
const GLYPHS = {
  // A browser window: a page you can open.
  page: [
    { el: 'rect', a: { x: 2, y: 3, width: 12, height: 10, rx: 1.6 } },
    { el: 'path', a: { d: 'M2 6.2h12' } },
    { el: 'circle', a: { cx: 4.2, cy: 4.6, r: 0.65, fill: 'currentColor', stroke: 'none' } },
  ],
  // A picture: frame, horizon, sun.
  image: [
    { el: 'rect', a: { x: 2, y: 3, width: 12, height: 10, rx: 1.6 } },
    { el: 'path', a: { d: 'M2.6 11.2 6 8l2.2 2.1L10.4 8l3 3.2' } },
    { el: 'circle', a: { cx: 10.6, cy: 5.9, r: 1.05 } },
  ],
  // Angle brackets: source you would read.
  code: [
    { el: 'path', a: { d: 'M5.6 5 2.6 8l3 3' } },
    { el: 'path', a: { d: 'M10.4 5l3 3-3 3' } },
  ],
  // Stacked discs: structured records.
  data: [
    { el: 'ellipse', a: { cx: 8, cy: 4.4, rx: 4.6, ry: 1.7 } },
    { el: 'path', a: { d: 'M3.4 4.4v3.4c0 .94 2.06 1.7 4.6 1.7s4.6-.76 4.6-1.7V4.4' } },
    { el: 'path', a: { d: 'M3.4 7.8v3.4c0 .94 2.06 1.7 4.6 1.7s4.6-.76 4.6-1.7V7.8' } },
  ],
  // Paragraph rules: prose.
  text: [
    { el: 'path', a: { d: 'M3.4 4.2h9.2' } },
    { el: 'path', a: { d: 'M3.4 7h9.2' } },
    { el: 'path', a: { d: 'M3.4 9.8h6.2' } },
    { el: 'path', a: { d: 'M3.4 12.6h3.4' } },
  ],
  // Curly braces: a config or payload.
  config: [
    { el: 'path', a: { d: 'M6.4 3.4c-1.6 0-1.6 3.4-2.9 4.6 1.3 1.2 1.3 4.6 2.9 4.6' } },
    { el: 'path', a: { d: 'M9.6 3.4c1.6 0 1.6 3.4 2.9 4.6-1.3 1.2-1.3 4.6-2.9 4.6' } },
  ],
  // A sheet with a folded corner: the fallback, and honest about being one.
  other: [
    { el: 'path', a: { d: 'M4 2.6h5l3.2 3.2v7.6H4z' } },
    { el: 'path', a: { d: 'M9 2.6v3.2h3.2' } },
  ],
}

/** Extensions that deserve a silhouette of their own, ahead of the bucket. */
const BY_EXTENSION = {
  html: 'page',
  htm: 'page',
  json: 'config',
  yaml: 'config',
  yml: 'config',
  toml: 'config',
  xml: 'config',
  csv: 'data',
  tsv: 'data',
  sql: 'data',
  md: 'text',
  txt: 'text',
  rst: 'text',
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  ico: 'image',
  pdf: 'text',
}

/** Fallback mapping from the library's filter buckets. */
const BY_CATEGORY = {
  pages: 'page',
  images: 'image',
  code: 'code',
  data: 'data',
  other: 'other',
}

/**
 * @param {{ext?: string, mime?: string, category?: string}} file
 * @returns {keyof GLYPHS}
 */
export function glyphNameFor({ ext, mime, category } = {}) {
  const key = String(ext ?? '').toLowerCase()
  if (BY_EXTENSION[key]) return BY_EXTENSION[key]
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('text/')) return 'text'
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category]
  return 'other'
}

/**
 * @param {{ext?: string, mime?: string, category?: string}} file
 * @param {number} size
 * @returns {SVGElement}
 */
export function fileIcon(file, size = 16) {
  const name = glyphNameFor(file)
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.25')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('file-icon')
  svg.dataset.glyph = name

  for (const { el, a } of GLYPHS[name]) {
    const node = document.createElementNS(NS, el)
    for (const [key, value] of Object.entries(a)) node.setAttribute(key, String(value))
    svg.appendChild(node)
  }
  return svg
}
