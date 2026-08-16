import { describe, it, expect } from 'vitest'
import { slugifyTitle, extFromTypeLabel, matchCard } from '../src/lib/match-card.js'

const DIR = '/mnt/user-data/outputs'
// Real paths taken from the reference conversation.
const CANDIDATES = [
  `${DIR}/fbmp-fleet-console.html`,
  `${DIR}/fbmp-fleet-thresholds.html`,
  `${DIR}/fbmp-fleet-hosts.html`,
  `${DIR}/fbmp-fleet-listings.html`,
]

describe('slugifyTitle', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyTitle('Fbmp fleet thresholds')).toBe('fbmp-fleet-thresholds')
  })

  it('collapses repeated whitespace', () => {
    expect(slugifyTitle('Fbmp   fleet  thresholds')).toBe('fbmp-fleet-thresholds')
  })

  it('trims surrounding whitespace', () => {
    expect(slugifyTitle('  Fbmp fleet  ')).toBe('fbmp-fleet')
  })

  it('drops punctuation', () => {
    expect(slugifyTitle("Claude's fleet: console!")).toBe('claudes-fleet-console')
  })

  it('preserves existing hyphens without doubling them', () => {
    expect(slugifyTitle('fbmp-fleet - console')).toBe('fbmp-fleet-console')
  })

  it('handles a non-string safely', () => {
    expect(slugifyTitle(null)).toBe('')
  })
})

describe('extFromTypeLabel', () => {
  it('reads the extension from a code label', () => {
    expect(extFromTypeLabel('Code · HTML')).toBe('html')
  })

  it('reads CSS', () => {
    expect(extFromTypeLabel('Code · CSS')).toBe('css')
  })

  it('reads an image label', () => {
    expect(extFromTypeLabel('Image · PNG')).toBe('png')
  })

  it('returns null for an unrecognised label', () => {
    expect(extFromTypeLabel('Document')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extFromTypeLabel('')).toBeNull()
  })
})

describe('matchCard', () => {
  it('matches a real card to its path exactly', () => {
    const r = matchCard({ title: 'Fbmp fleet thresholds', typeLabel: 'Code · HTML' }, CANDIDATES)
    expect(r).toEqual({ path: `${DIR}/fbmp-fleet-thresholds.html`, confidence: 'exact' })
  })

  it('is case-insensitive', () => {
    const r = matchCard({ title: 'FBMP FLEET HOSTS', typeLabel: 'Code · HTML' }, CANDIDATES)
    expect(r.path).toBe(`${DIR}/fbmp-fleet-hosts.html`)
  })

  it('tolerates extra whitespace and punctuation', () => {
    const r = matchCard({ title: ' Fbmp  fleet, console ', typeLabel: 'Code · HTML' }, CANDIDATES)
    expect(r.path).toBe(`${DIR}/fbmp-fleet-console.html`)
  })

  it('matches without a type label when the basename is unambiguous', () => {
    const r = matchCard({ title: 'Fbmp fleet hosts', typeLabel: '' }, CANDIDATES)
    expect(r.path).toBe(`${DIR}/fbmp-fleet-hosts.html`)
  })

  it('returns none when nothing matches', () => {
    const r = matchCard({ title: 'Totally unrelated', typeLabel: 'Code · HTML' }, CANDIDATES)
    expect(r).toEqual({ path: null, confidence: 'none' })
  })

  it('refuses to guess when two candidates match', () => {
    const ambiguous = [`${DIR}/report.html`, `${DIR}/report.css`]
    const r = matchCard({ title: 'Report', typeLabel: '' }, ambiguous)
    expect(r).toEqual({ path: null, confidence: 'none' })
  })

  it('disambiguates same-basename candidates using the type label', () => {
    const ambiguous = [`${DIR}/report.html`, `${DIR}/report.css`]
    const r = matchCard({ title: 'Report', typeLabel: 'Code · CSS' }, ambiguous)
    expect(r).toEqual({ path: `${DIR}/report.css`, confidence: 'exact' })
  })

  it('returns none for an empty candidate list', () => {
    expect(matchCard({ title: 'Anything', typeLabel: '' }, [])).toEqual({
      path: null,
      confidence: 'none',
    })
  })
})
