import { describe, it, expect } from 'vitest'
import { glyphNameFor, fileIcon } from '../src/ui/file-icon.js'

describe('glyphNameFor', () => {
  it('gives HTML the page silhouette', () => {
    expect(glyphNameFor({ ext: 'html' })).toBe('page')
  })

  it('groups every raster and vector image together', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']) {
      expect(glyphNameFor({ ext })).toBe('image')
    }
  })

  it('gives config formats braces rather than the data discs', () => {
    expect(glyphNameFor({ ext: 'json' })).toBe('config')
    expect(glyphNameFor({ ext: 'yaml' })).toBe('config')
  })

  it('gives tabular formats the data discs', () => {
    expect(glyphNameFor({ ext: 'csv' })).toBe('data')
    expect(glyphNameFor({ ext: 'sql' })).toBe('data')
  })

  it('gives prose the paragraph rules', () => {
    expect(glyphNameFor({ ext: 'md' })).toBe('text')
  })

  it('gives source the angle brackets via its category', () => {
    expect(glyphNameFor({ ext: 'js', category: 'code' })).toBe('code')
  })

  it('is case-insensitive about the extension', () => {
    expect(glyphNameFor({ ext: 'PNG' })).toBe('image')
  })

  it('falls back to the mime type when the extension says nothing', () => {
    expect(glyphNameFor({ ext: '', mime: 'image/heic' })).toBe('image')
    expect(glyphNameFor({ ext: '', mime: 'text/x-custom' })).toBe('text')
  })

  it('prefers the extension over the category', () => {
    expect(glyphNameFor({ ext: 'svg', category: 'code' })).toBe('image')
  })

  it('falls back to the sheet for anything unrecognised', () => {
    expect(glyphNameFor({ ext: 'xyz' })).toBe('other')
    expect(glyphNameFor({})).toBe('other')
  })
})

describe('fileIcon', () => {
  it('builds an SVG carrying the chosen glyph', () => {
    const svg = fileIcon({ ext: 'html' })
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.dataset.glyph).toBe('page')
    expect(svg.childElementCount).toBeGreaterThan(0)
  })

  it('honours the requested size', () => {
    const svg = fileIcon({ ext: 'png' }, 24)
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('inherits colour so it can never introduce its own', () => {
    expect(fileIcon({ ext: 'js' }).getAttribute('stroke')).toBe('currentColor')
  })

  it('is hidden from assistive technology, since the name carries the meaning', () => {
    expect(fileIcon({ ext: 'js' }).getAttribute('aria-hidden')).toBe('true')
  })
})
