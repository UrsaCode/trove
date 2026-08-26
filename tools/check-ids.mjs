/**
 * Checks that every element id a page script reaches for exists in its markup.
 *
 * This is not a stylistic check. Each of these pages is a script and a
 * template maintained separately, and a rename on one side fails silently at
 * runtime: `el('thing')` returns null, the listener is never attached, and the
 * button simply does nothing. It has caught real breakage twice, so it runs in
 * CI rather than living in someone's memory.
 *
 * Run: node tools/check-ids.mjs
 */

import { readFileSync } from 'node:fs'

const PAGES = [
  ['src/options/options.html', 'src/options/options.js'],
  ['src/options/reader.html', 'src/options/reader.js'],
  ['src/popup/popup.html', 'src/popup/popup.js'],
]

let failures = 0

for (const [htmlPath, scriptPath] of PAGES) {
  const html = readFileSync(htmlPath, 'utf8')
  const script = readFileSync(scriptPath, 'utf8')

  const declared = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
  const used = new Set([...script.matchAll(/\bel\((['"])([^'"]+)\1\)/g)].map((m) => m[2]))

  const missing = [...used].filter((id) => !declared.has(id))
  const unused = [...declared].filter((id) => !used.has(id))

  const name = htmlPath.split('/').pop()
  if (missing.length) {
    failures += missing.length
    console.error(`${name}: script reaches for ids that do not exist -> ${missing.join(', ')}`)
  } else {
    console.log(`${name}: ok${unused.length ? ` (${unused.length} unused in markup)` : ''}`)
  }
}

if (failures) {
  console.error(`\n${failures} missing id${failures === 1 ? '' : 's'}.`)
  process.exit(1)
}
