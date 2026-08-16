import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSettings, setSetting, DEFAULTS } from '../src/lib/settings.js'

let store

beforeEach(() => {
  store = {}
  globalThis.chrome = {
    storage: {
      sync: {
        get: vi.fn(async () => ({ ...store })),
        set: vi.fn(async (patch) => {
          Object.assign(store, patch)
        }),
      },
    },
  }
})

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    expect(await getSettings()).toEqual(DEFAULTS)
  })

  it('defaults autoCapture to off, so nothing is written unasked', async () => {
    expect((await getSettings()).autoCapture).toBe(false)
  })

  it('merges stored values over defaults', async () => {
    store.autoCapture = true
    const s = await getSettings()
    expect(s.autoCapture).toBe(true)
    expect(s.theme).toBe(DEFAULTS.theme)
  })

  it('falls back to defaults when the storage API is unavailable', async () => {
    globalThis.chrome = undefined
    expect(await getSettings()).toEqual(DEFAULTS)
  })
})

describe('setSetting', () => {
  it('writes a known key and reads it back', async () => {
    await setSetting('autoCapture', true)
    expect((await getSettings()).autoCapture).toBe(true)
  })

  it('rejects an unknown key rather than storing it', async () => {
    await expect(setSetting('nonsense', 1)).rejects.toThrow(/unknown setting/i)
    expect(store.nonsense).toBeUndefined()
  })
})
