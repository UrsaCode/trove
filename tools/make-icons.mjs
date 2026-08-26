/**
 * Rasterises the Trove mark to PNG icons.
 *
 * The mark is an open tray with a file dropping into it: two shapes with one
 * gap between them, which is why it survives the 16px toolbar slot. Only the
 * aqua square has to read at that size.
 *
 * Written by hand rather than pulled in as a dependency: the artwork is two
 * primitives, and a signed-distance pass with supersampling renders them more
 * predictably than shelling out to a rasteriser would.
 *
 * Run: node tools/make-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const VIEW = 32 // the mark's design grid
const SS = 4 // supersampling factor per axis

const STROKE = { r: 0xe9, g: 0xe7, b: 0xe2 } // bone
const ACCENT = { r: 0x5f, g: 0xd3, b: 0xbc } // tether aqua
const HALF_STROKE = 1.4 // stroke-width 2.8

// ── Geometry ──────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Distance to a circular arc, falling back to its endpoints outside the sweep. */
function distToArc(px, py, cx, cy, r, fromDeg, toDeg) {
  const angle = ((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 360) % 360
  const lo = Math.min(fromDeg, toDeg)
  const hi = Math.max(fromDeg, toDeg)
  if (angle >= lo && angle <= hi) return Math.abs(Math.hypot(px - cx, py - cy) - r)

  const end = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)]
  const [ax, ay] = end(lo)
  const [bx, by] = end(hi)
  return Math.min(Math.hypot(px - ax, py - ay), Math.hypot(px - bx, py - by))
}

/**
 * The tray: M6 13 v6.5 A6.5 6.5 0 0 0 12.5 26 h7 A6.5 6.5 0 0 0 26 19.5 V13
 * A U with two 6.5-radius corners. Round caps come free from the distance
 * field, since an unclosed segment's distance already rounds off its ends.
 */
function trayDistance(x, y) {
  return Math.min(
    distToSegment(x, y, 6, 13, 6, 19.5),
    distToArc(x, y, 12.5, 19.5, 6.5, 90, 180),
    distToSegment(x, y, 12.5, 26, 19.5, 26),
    distToArc(x, y, 19.5, 19.5, 6.5, 0, 90),
    distToSegment(x, y, 26, 19.5, 26, 13),
  )
}

/** The file: rect x=12.5 y=4 w=7 h=7 rx=1.6, filled. Negative inside. */
function fileDistance(x, y) {
  const hw = 3.5
  const hh = 3.5
  const rx = 1.6
  const qx = Math.abs(x - 16) - (hw - rx)
  const qy = Math.abs(y - 7.5) - (hh - rx)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - rx
}

// ── Rasteriser ────────────────────────────────────────────────────────────

function render(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = VIEW / size
  const samples = SS * SS

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let trayHits = 0
      let fileHits = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale
          const y = (py + (sy + 0.5) / SS) * scale
          if (trayDistance(x, y) <= HALF_STROKE) trayHits++
          if (fileDistance(x, y) <= 0) fileHits++
        }
      }

      const trayAlpha = trayHits / samples
      const fileAlpha = fileHits / samples

      // The file sits on top; the shapes do not overlap, but compositing in
      // this order keeps the accent square crisp if they ever did.
      const a = trayAlpha + fileAlpha * (1 - trayAlpha)
      const offset = (py * size + px) * 4

      if (a > 0) {
        const mix = (channel) =>
          Math.round(
            (ACCENT[channel] * fileAlpha + STROKE[channel] * trayAlpha * (1 - fileAlpha)) /
              (fileAlpha + trayAlpha * (1 - fileAlpha)),
          )
        pixels[offset] = mix('r')
        pixels[offset + 1] = mix('g')
        pixels[offset + 2] = mix('b')
        pixels[offset + 3] = Math.round(a * 255)
      }
    }
  }
  return pixels
}

// ── PNG encoding ──────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with its filter type; 0 means none.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Run ───────────────────────────────────────────────────────────────────

mkdirSync('src/icons', { recursive: true })

for (const size of [16, 32, 48, 128]) {
  const png = encodePng(render(size), size)
  writeFileSync(`src/icons/icon-${size}.png`, png)
  console.log(`src/icons/icon-${size}.png  ${png.length} bytes`)
}

writeFileSync(
  'docs/assets/mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <path d="M6 13v6.5A6.5 6.5 0 0 0 12.5 26h7A6.5 6.5 0 0 0 26 19.5V13" stroke="#E9E7E2" stroke-width="2.8" stroke-linecap="round"/>
  <rect x="12.5" y="4" width="7" height="7" rx="1.6" fill="#5FD3BC"/>
</svg>
`,
)
console.log('docs/assets/mark.svg')
