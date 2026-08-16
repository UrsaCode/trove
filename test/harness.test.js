import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs tests', () => {
    expect(true).toBe(true)
  })

  it('provides a fake IndexedDB', () => {
    expect(typeof indexedDB.open).toBe('function')
  })

  it('provides crypto.subtle for hashing', () => {
    expect(typeof crypto.subtle.digest).toBe('function')
  })
})
