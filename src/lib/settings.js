/**
 * User settings, held in extension sync storage.
 *
 * autoCapture defaults to false: the extension must never write to storage
 * because it happened to observe activity, only because the user asked it to.
 */

export const DEFAULTS = Object.freeze({
  /** Catch files as Claude writes them, without being asked. */
  autoCapture: false,

  /** What a single click on a file in the library does. */
  openOnClick: 'preview', // 'preview' | 'reader'

  /** Which view the Reader opens on, when the file can be rendered. */
  defaultView: 'render', // 'render' | 'source'

  /** Soft-wrap long lines in the editor. */
  wrapLines: true,

  /** Ask before deleting. Off is for people who know what they are doing. */
  confirmDelete: true,

  /** Include unchanged files when capturing a whole conversation. */
  captureUnchanged: false,
})

/** Values a setting is allowed to take, where it is not a boolean. */
const ALLOWED = {
  openOnClick: ['preview', 'reader'],
  defaultView: ['render', 'source'],
}

function area() {
  return globalThis.chrome?.storage?.sync ?? null
}

export async function getSettings() {
  const storage = area()
  if (!storage) return { ...DEFAULTS }
  try {
    const stored = (await storage.get(Object.keys(DEFAULTS))) ?? {}
    const merged = { ...DEFAULTS }
    // Take only keys we know, and only values we allow. A stored value from an
    // older version must never put the UI into a state it cannot render.
    for (const [key, value] of Object.entries(stored)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue
      if (ALLOWED[key] && !ALLOWED[key].includes(value)) continue
      if (typeof DEFAULTS[key] === 'boolean' && typeof value !== 'boolean') continue
      merged[key] = value
    }
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export async function setSetting(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
    throw new Error(`Unknown setting: ${key}`)
  }
  if (ALLOWED[key] && !ALLOWED[key].includes(value)) {
    throw new Error(`Invalid value for ${key}: ${value}`)
  }
  const storage = area()
  if (!storage) return
  await storage.set({ [key]: value })
}

export async function resetSettings() {
  const storage = area()
  if (!storage) return
  await storage.set({ ...DEFAULTS })
}
