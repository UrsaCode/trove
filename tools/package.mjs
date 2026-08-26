/**
 * Builds the uploadable Chrome Web Store archive.
 *
 * The store wants a zip whose root *is* the extension - `manifest.json` at the
 * top level, not inside a `dist/` folder. Getting that wrong is the most common
 * reason a first upload is rejected before review even starts, so this asserts
 * it rather than trusting the zip tool's idea of a base directory.
 *
 * Uses fflate, already a dependency, so packaging needs nothing installed that
 * the extension does not already need.
 *
 * Run: npm run package
 */

import { zipSync } from 'fflate'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

const OUT_DIR = 'dist'

/** Anything that has no business in a published package. */
const EXCLUDE = new Set(['.DS_Store', 'Thumbs.db'])
const EXCLUDE_EXT = new Set(['.map', '.md'])

function collect(dir, base = '') {
  const files = {}
  for (const entry of readdirSync(path.join(dir, base))) {
    const rel = base ? `${base}/${entry}` : entry
    const full = path.join(dir, rel)

    if (statSync(full).isDirectory()) {
      Object.assign(files, collect(dir, rel))
      continue
    }
    if (EXCLUDE.has(entry) || EXCLUDE_EXT.has(path.extname(entry))) {
      console.warn(`  skipped ${rel}`)
      continue
    }
    files[rel] = new Uint8Array(readFileSync(full))
  }
  return files
}

if (!existsSync(OUT_DIR)) {
  console.error(`No ${OUT_DIR}/ - run "npm run build" first.`)
  process.exit(1)
}

const manifestPath = path.join(OUT_DIR, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`No ${manifestPath}. The build did not complete.`)
  process.exit(1)
}

// A manifest that does not parse takes the whole extension down, and it is the
// one file no unit test naturally covers.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { name, version } = manifest

const files = collect(OUT_DIR)

// The checks that matter, stated rather than assumed.
const problems = []
if (!files['manifest.json']) problems.push('manifest.json is not at the archive root')
if (!version) problems.push('manifest has no version')
if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3')
for (const size of ['16', '32', '48', '128']) {
  const icon = manifest.icons?.[size]
  if (icon && !files[icon]) problems.push(`icons.${size} points at a missing file: ${icon}`)
}
for (const page of manifest.sandbox?.pages ?? []) {
  if (!files[page]) problems.push(`sandbox page is missing from the package: ${page}`)
}
if (problems.length) {
  console.error('\nPackage is not uploadable:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const archive = `${slug}-${version}.zip`

// level 9: the upload has a size limit and this costs nothing at build time.
const zipped = zipSync(files, { level: 9 })
writeFileSync(archive, zipped)

const total = Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0)
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

console.log(`\n${archive}`)
console.log(`  ${Object.keys(files).length} files, ${kb(total)} raw, ${kb(zipped.length)} zipped`)
console.log(`  ${name} ${version}, manifest v${manifest.manifest_version}`)
console.log(`\nUpload this file. Contents:`)
for (const name of Object.keys(files).sort()) {
  console.log(`  ${name}`)
}
