import { describe, it, expect } from 'vitest'
import { hashContent } from '../src/lib/hash.js'

// Well-known SHA-256 of the ASCII string "abc".
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('hashContent', () => {
  it('matches the known SHA-256 of a string', async () => {
    expect(await hashContent('abc')).toBe(ABC)
  })

  it('is stable across calls', async () => {
    expect(await hashContent('abc')).toBe(await hashContent('abc'))
  })

  it('differs for different input', async () => {
    expect(await hashContent('abc')).not.toBe(await hashContent('abd'))
  })

  it('hashes a Blob identically to the equivalent string', async () => {
    expect(await hashContent(new Blob(['abc']))).toBe(ABC)
  })

  it('handles empty content', async () => {
    expect(await hashContent('')).toHaveLength(64)
  })
})
