import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter } from '../src/background/router.js'
import { MSG } from '../src/lib/messages.js'
import { fileId, resetDbForTests, getConversation, listFiles } from '../src/lib/db.js'

const CONV = 'conv-1'
const SENDER = { tab: { id: 42 } }

const fileMsg = (path, content) => ({
  id: fileId(CONV, path),
  convId: CONV,
  path,
  name: path.split('/').pop(),
  ext: 'html',
  mime: 'text/html',
  kind: 'text',
  content,
  hash: 'h',
  remoteSize: content.length,
  remoteCreatedAt: 't',
  edited: false,
  capturedAt: 1,
  updatedAt: 1,
})

let requestSync
let autoCapture

function router({ debounceMs = 2000 } = {}) {
  return createRouter({
    getSettings: async () => ({ autoCapture }),
    requestSync,
    debounceMs,
    now: () => 1000,
  })
}

beforeEach(async () => {
  await resetDbForTests()
  requestSync = vi.fn(async () => ({ ok: true }))
  autoCapture = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SAVE_FILES', () => {
  it('writes every file', async () => {
    const { handleMessage } = router()
    await handleMessage(
      {
        type: MSG.SAVE_FILES,
        conversation: { id: CONV, title: 'T', orgId: 'o', url: 'u' },
        files: [fileMsg('/o/a.html', 'aaa'), fileMsg('/o/b.html', 'bb')],
      },
      SENDER,
    )
    expect((await listFiles(CONV)).map((f) => f.path)).toEqual(['/o/a.html', '/o/b.html'])
  })

  it('recomputes the conversation file count and byte total', async () => {
    const { handleMessage } = router()
    await handleMessage(
      {
        type: MSG.SAVE_FILES,
        conversation: { id: CONV, title: 'T', orgId: 'o', url: 'u' },
        files: [fileMsg('/o/a.html', 'aaa'), fileMsg('/o/b.html', 'bb')],
      },
      SENDER,
    )
    const conv = await getConversation(CONV)
    expect(conv.fileCount).toBe(2)
    expect(conv.bytes).toBe(5)
    expect(conv.title).toBe('T')
  })

  it('is idempotent across repeated captures', async () => {
    const { handleMessage } = router()
    const msg = {
      type: MSG.SAVE_FILES,
      conversation: { id: CONV, title: 'T', orgId: 'o', url: 'u' },
      files: [fileMsg('/o/a.html', 'aaa')],
    }
    await handleMessage(msg, SENDER)
    await handleMessage(msg, SENDER)
    expect(await listFiles(CONV)).toHaveLength(1)
    expect((await getConversation(CONV)).fileCount).toBe(1)
  })

  it('reports how many files it saved', async () => {
    const { handleMessage } = router()
    const result = await handleMessage(
      {
        type: MSG.SAVE_FILES,
        conversation: { id: CONV, title: 'T', orgId: 'o', url: 'u' },
        files: [fileMsg('/o/a.html', 'aaa')],
      },
      SENDER,
    )
    expect(result).toMatchObject({ ok: true, saved: 1 })
  })
})

describe('FILES_CHANGED', () => {
  it('is ignored when auto-capture is off', async () => {
    vi.useFakeTimers()
    const { handleMessage } = router()
    const result = await handleMessage({ type: MSG.FILES_CHANGED, convId: CONV }, SENDER)
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestSync).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, skipped: 'auto-capture-off' })
  })

  it('requests a sync from the sending tab when auto-capture is on', async () => {
    vi.useFakeTimers()
    autoCapture = true
    const { handleMessage } = router()
    await handleMessage({ type: MSG.FILES_CHANGED, convId: CONV }, SENDER)
    expect(requestSync).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(requestSync).toHaveBeenCalledWith(42, CONV)
  })

  it('collapses a burst of signals into a single sync', async () => {
    vi.useFakeTimers()
    autoCapture = true
    const { handleMessage } = router()
    for (let i = 0; i < 5; i++) {
      await handleMessage({ type: MSG.FILES_CHANGED, convId: CONV }, SENDER)
      await vi.advanceTimersByTimeAsync(100)
    }
    await vi.advanceTimersByTimeAsync(2000)
    expect(requestSync).toHaveBeenCalledTimes(1)
  })

  it('keeps separate conversations on separate debounces', async () => {
    vi.useFakeTimers()
    autoCapture = true
    const { handleMessage } = router()
    await handleMessage({ type: MSG.FILES_CHANGED, convId: 'a' }, SENDER)
    await handleMessage({ type: MSG.FILES_CHANGED, convId: 'b' }, SENDER)
    await vi.advanceTimersByTimeAsync(2000)
    expect(requestSync).toHaveBeenCalledTimes(2)
  })

  it('ignores a signal with no conversation id', async () => {
    autoCapture = true
    const { handleMessage } = router()
    const result = await handleMessage({ type: MSG.FILES_CHANGED }, SENDER)
    expect(result.ok).toBe(false)
  })

  it('survives a sync that throws', async () => {
    vi.useFakeTimers()
    autoCapture = true
    requestSync = vi.fn(async () => {
      throw new Error('tab closed')
    })
    const { handleMessage } = router()
    await handleMessage({ type: MSG.FILES_CHANGED, convId: CONV }, SENDER)
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow()
  })
})

describe('GET_STATUS', () => {
  it('returns the stored files for a conversation', async () => {
    const { handleMessage } = router()
    await handleMessage(
      {
        type: MSG.SAVE_FILES,
        conversation: { id: CONV, title: 'T', orgId: 'o', url: 'u' },
        files: [fileMsg('/o/a.html', 'aaa')],
      },
      SENDER,
    )
    const result = await handleMessage({ type: MSG.GET_STATUS, convId: CONV }, SENDER)
    expect(result.ok).toBe(true)
    expect(result.files.map((f) => f.path)).toEqual(['/o/a.html'])
  })

  it('returns an empty list for an unknown conversation', async () => {
    const { handleMessage } = router()
    const result = await handleMessage({ type: MSG.GET_STATUS, convId: 'nope' }, SENDER)
    expect(result.files).toEqual([])
  })
})

describe('unknown messages', () => {
  it('returns an error result rather than throwing', async () => {
    const { handleMessage } = router()
    const result = await handleMessage({ type: 'nonsense' }, SENDER)
    expect(result).toMatchObject({ ok: false })
    expect(result.error).toMatch(/unknown message/i)
  })

  it('tolerates a message with no type', async () => {
    const { handleMessage } = router()
    expect((await handleMessage({}, SENDER)).ok).toBe(false)
  })
})
