import * as esbuild from 'esbuild'
import { cp, mkdir, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const watch = process.argv.includes('--watch')
const SRC = 'src'
const OUT = 'dist'

const ENTRIES = [
  'background/sw.js',
  'content/main.js',
  'content/interceptor.js',
  'popup/popup.js',
  'options/options.js',
  'options/sandbox.js',
]

/** Copy every non-JS asset (manifest, HTML, CSS) preserving its relative layout. */
async function copyAssets() {
  const copyExt = new Set(['.json', '.html', '.css', '.png', '.svg'])
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

const options = {
  entryPoints: ENTRIES.map((e) => path.join(SRC, e)),
  outdir: OUT,
  outbase: SRC,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
}

if (existsSync(OUT)) await rm(OUT, { recursive: true })
await mkdir(OUT, { recursive: true })

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: 'copy-assets',
        setup(build) {
          build.onEnd(() => copyAssets())
        },
      },
    ],
  })
  await ctx.watch()
  console.log('watching…')
} else {
  await esbuild.build(options)
  await copyAssets()
  console.log(`built -> ${OUT}/`)
}
