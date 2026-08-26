import { describe, it, expect } from 'vitest'
import {
  displayName,
  displayTitle,
  isRenamed,
  normaliseName,
  preserveUserFields,
} from '../src/lib/naming.js'

describe('displayName', () => {
  it('uses the original name when nothing was renamed', () => {
    expect(displayName({ name: 'a.html' })).toBe('a.html')
  })

  it('prefers the user name', () => {
    expect(displayName({ name: 'a.html', renamedTo: 'Landing page' })).toBe('Landing page')
  })

  it('treats a blank rename as no rename', () => {
    expect(displayName({ name: 'a.html', renamedTo: '   ' })).toBe('a.html')
  })

  it('is safe on nothing', () => {
    expect(displayName(null)).toBe('')
  })
})

describe('displayTitle', () => {
  it('prefers the user title', () => {
    expect(displayTitle({ title: 'Chat 1', renamedTo: 'Fleet console' })).toBe('Fleet console')
  })

  it('names an untitled conversation rather than showing nothing', () => {
    expect(displayTitle({})).toBe('Untitled conversation')
  })
})

describe('isRenamed', () => {
  it('is false without a rename', () => {
    expect(isRenamed({ name: 'a.html' })).toBe(false)
  })

  it('is true when the label differs', () => {
    expect(isRenamed({ name: 'a.html', renamedTo: 'Page' })).toBe(true)
  })

  it('is false when the rename matches the original', () => {
    expect(isRenamed({ name: 'a.html', renamedTo: 'a.html' })).toBe(false)
  })
})

describe('normaliseName', () => {
  it('keeps ordinary names, spaces and hyphens intact', () => {
    expect(normaliseName('Fleet console - v2')).toBe('Fleet console - v2')
  })

  it('flattens path separators, so a label cannot imply a location', () => {
    expect(normaliseName('a/b\\c')).toBe('a-b-c')
  })

  it('strips control characters', () => {
    expect(normaliseName('a\u0000b\u001fc')).toBe('abc')
  })

  it('collapses runs of whitespace', () => {
    expect(normaliseName('a    b')).toBe('a b')
  })

  it('falls back when the result is empty, which is how a rename is undone', () => {
    expect(normaliseName('   ', { fallback: 'a.html' })).toBe('a.html')
    expect(normaliseName('', { fallback: 'a.html' })).toBe('a.html')
  })

  it('caps the length', () => {
    expect(normaliseName('x'.repeat(400))).toHaveLength(120)
  })
})

describe('preserveUserFields', () => {
  it('carries a rename across a re-capture', () => {
    const kept = preserveUserFields({ renamedTo: 'Page' }, { name: 'a.html', content: 'new' })
    expect(kept).toMatchObject({ name: 'a.html', content: 'new', renamedTo: 'Page' })
  })

  it('carries a note across a re-capture', () => {
    expect(preserveUserFields({ note: 'why' }, {}).note).toBe('why')
  })

  it('does not invent fields that were never set', () => {
    expect(preserveUserFields({}, { name: 'a.html' })).toEqual({ name: 'a.html' })
  })

  it('returns the incoming record when nothing existed', () => {
    expect(preserveUserFields(null, { name: 'a.html' })).toEqual({ name: 'a.html' })
  })

  it('never lets the incoming record win over a rename', () => {
    const kept = preserveUserFields({ renamedTo: 'Mine' }, { renamedTo: undefined })
    expect(kept.renamedTo).toBe('Mine')
  })
})
