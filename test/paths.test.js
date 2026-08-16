import { describe, it, expect } from 'vitest'
import { parsePath, isOutput, OUTPUTS_DIR } from '../src/lib/paths.js'

const out = (n) => `${OUTPUTS_DIR}/${n}`

describe('parsePath', () => {
  it('derives name, ext, mime and kind for an HTML output', () => {
    expect(parsePath(out('fbmp-fleet-console.html'))).toEqual({
      name: 'fbmp-fleet-console.html',
      ext: 'html',
      mime: 'text/html',
      kind: 'text',
    })
  })

  it('treats PNG as binary', () => {
    const r = parsePath(out('shot.png'))
    expect(r.mime).toBe('image/png')
    expect(r.kind).toBe('binary')
  })

  it('treats SVG as text but an image mime', () => {
    const r = parsePath(out('logo.svg'))
    expect(r.mime).toBe('image/svg+xml')
    expect(r.kind).toBe('text')
  })

  it('falls back to octet-stream and binary for unknown extensions', () => {
    const r = parsePath(out('archive.xyz'))
    expect(r.mime).toBe('application/octet-stream')
    expect(r.kind).toBe('binary')
  })

  it('lets listing metadata override extension inference', () => {
    const r = parsePath(out('data.bin'), 'text/css')
    expect(r.mime).toBe('text/css')
    expect(r.kind).toBe('text')
  })

  it('handles a path with no extension without throwing', () => {
    const r = parsePath(out('README'))
    expect(r.name).toBe('README')
    expect(r.ext).toBe('')
  })

  it('is case-insensitive about the extension', () => {
    expect(parsePath(out('Page.HTML')).mime).toBe('text/html')
    expect(parsePath(out('Page.HTML')).ext).toBe('html')
  })
})

describe('isOutput', () => {
  it('accepts the outputs directory', () => {
    expect(isOutput(out('a.html'))).toBe(true)
  })

  it('rejects the uploads directory', () => {
    expect(isOutput('/mnt/user-data/uploads/1786784679585_image.png')).toBe(false)
  })

  it('rejects an unrelated path', () => {
    expect(isOutput('/tmp/a.html')).toBe(false)
  })

  it('rejects a non-string safely', () => {
    expect(isOutput(null)).toBe(false)
  })
})
