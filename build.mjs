import * as esbuild from 'esbuild'
import { cp, mkdir, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const watch = process.argv.includes('--watch')
const SRC = 'src'
const OUT = 'dist'

// The service worker is declared "type": "module", so it ships as ESM.
const MODULE_ENTRIES = ['background/sw.js']

// Everything else is loaded as a classic script - content scripts cannot be
// modules at all, and IIFE keeps the page globals untouched.
const SCRIPT_ENTRIES = [
  'content/main.js',
  'content/interceptor.js',
  'popup/popup.js',
  'options/options.js',
  'options/reader.js',
  'options/sandbox.js',
]

const common = {
  outdir: OUT,
  outbase: SRC,
  bundle: true,
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'warning',
}

const configs = [
  { ...common, entryPoints: MODULE_ENTRIES.map((e) => path.join(SRC, e)), format: 'esm' },
  { ...common, entryPoints: SCRIPT_ENTRIES.map((e) => path.join(SRC, e)), format: 'iife' },
]

/** Copy every non-JS asset (manifest, HTML, CSS) preserving its layout. */
async function copyAssets() {
  const copyExt = new Set(['.json', '.html', '.css', '.png', '.svg', '.woff2'])
  async function walk(dir) {
    for (const entry of await readdir(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(rel)
      } else if (copyExt.has(path.extname(entry.name))) {
        await mkdir(path.join(OUT, dir), { recursive: true })
        await cp(path.join(SRC, rel), path.join(OUT, rel))
      }
    }
  }
  await walk('')
}

if (existsSync(OUT)) await rm(OUT, { recursive: true })
await mkdir(OUT, { recursive: true })

if (watch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config)
    await ctx.watch()
  }
  await copyAssets()
  console.log('watching...')
} else {
  await Promise.all(configs.map((config) => esbuild.build(config)))
  await copyAssets()
  console.log(`built -> ${OUT}/`)
}
