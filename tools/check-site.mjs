/**
 * Sanity checks for the published site.
 *
 * The landing page makes claims about where Trove can be installed from, and a
 * stale claim there is a small lie that outlives the release it described. This
 * checks the page says what is currently true, and that its markup still
 * balances after an edit.
 *
 * Run: node tools/check-site.mjs
 */

import { readFileSync } from 'node:fs'

const ITEM_ID = 'mikpichonjdjbnhjafkjiofacepfpffc'

const html = readFileSync('docs/index.html', 'utf8')
const privacy = readFileSync('docs/privacy.html', 'utf8')
const css = readFileSync('docs/styles/site.css', 'utf8')

const checks = [
  ['live badge shown', html.includes('class="live">Live')],
  ['badge has styling', /\.live\s*\{/.test(css)],
  ['store item linked', html.includes(ITEM_ID)],
  ['hero installs rather than scrolling to a build', html.includes('>Add to Chrome<')],
  ['no stale "not on the store" claim', !html.includes('not on the Chrome Web Store')],
  // The listing is live, so any of these would now be untrue.
  ['no stale review claim', !/waiting on review|awaiting review|In review/.test(html)],
  ['privacy page reachable from site', privacy.includes('Trove')],
  ['privacy states no transmission', /makes no network requests|Nothing/i.test(privacy)],
]

/** Rough balance check - enough to catch an unclosed tag from a bad edit. */
for (const tag of ['p', 'a', 'section', 'div', 'figure', 'main']) {
  const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
  // The formatter wraps closing tags across lines, so a strict `</a>` count
  // reported a perfectly balanced document as broken.
  const close = (html.match(new RegExp(`</${tag}\\s*>`, 'g')) || []).length
  checks.push([`<${tag}> balanced (${open}/${close})`, open === close])
}

let failures = 0
for (const [label, ok] of checks) {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}

if (failures) {
  console.error(`\n${failures} problem(s) on the site.`)
  process.exit(1)
}
console.log('\nsite says what is currently true')
