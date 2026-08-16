/**
 * User settings, held in extension sync storage.
 *
 * autoCapture defaults to false: the extension must never write to storage
 * because it happened to observe activity, only because the user asked it to.
 */

export const DEFAULTS = Object.freeze({
  autoCapture: false,
  theme: 'system',
})

function area() {
  return globalThis.chrome?.storage?.sync ?? null
}

export async function getSettings() {
  const storage = area()
  if (!storage) return { ...DEFAULTS }
  try {
    const stored = (await storage.get(Object.keys(DEFAULTS))) ?? {}
    return { ...DEFAULTS, ...stored }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setSetting(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
    throw new Error(`Unknown setting: ${key}`)
  }
  const storage = area()
  if (!storage) return
  await storage.set({ [key]: value })
}
