import { describe, it, expect, beforeEach } from 'vitest'
import {
  fileId,
  putConversation,
  getConversation,
  listConversations,
  deleteConversation,
  putFile,
  getFile,
  listFiles,
  deleteFile,
  storageUsage,
  resetDbForTests,
} from '../src/lib/db.js'

const CONV = 'conv-1'
const OTHER = 'conv-2'

const conversation = (over = {}) => ({
  id: CONV,
  title: 'Design redesign request',
  orgId: 'org-1',
  url: `https://claude.ai/chat/${CONV}`,
  fileCount: 0,
  bytes: 0,
  capturedAt: 1,
  updatedAt: 1,
  ...over,
})

const file = (over = {}) => {
  const path = over.path ?? '/mnt/user-data/outputs/a.html'
  const convId = over.convId ?? CONV
  return {
    id: fileId(convId, path),
    convId,
    path,
    name: 'a.html',
    ext: 'html',
    mime: 'text/html',
    kind: 'text',
    content: '<h1>hi</h1>',
    hash: 'abc',
    remoteSize: 11,
    remoteCreatedAt: 't1',
    edited: false,
    capturedAt: 1,
    updatedAt: 1,
    ...over,
  }
}

beforeEach(async () => {
  await resetDbForTests()
})

describe('fileId', () => {
  it('is stable for the same inputs', () => {
    expect(fileId(CONV, '/o/a.html')).toBe(fileId(CONV, '/o/a.html'))
  })

  it('differs across conversations', () => {
    expect(fileId(CONV, '/o/a.html')).not.toBe(fileId(OTHER, '/o/a.html'))
  })
})

describe('conversations', () => {
  it('round-trips a record', async () => {
    await putConversation(conversation())
    expect((await getConversation(CONV)).title).toBe('Design redesign request')
  })

  it('returns undefined for an unknown id', async () => {
    expect(await getConversation('nope')).toBeUndefined()
  })

  it('lists most-recently-updated first', async () => {
    await putConversation(conversation({ id: 'a', updatedAt: 10 }))
    await putConversation(conversation({ id: 'b', updatedAt: 30 }))
    await putConversation(conversation({ id: 'c', updatedAt: 20 }))
    expect((await listConversations()).map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('files', () => {
  it('upserts on the same conversation and path', async () => {
    await putFile(file({ content: 'first' }))
    await putFile(file({ content: 'second' }))
    const all = await listFiles(CONV)
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('second')
  })

  it('lists only the requested conversation', async () => {
    await putFile(file())
    await putFile(file({ convId: OTHER }))
    expect(await listFiles(CONV)).toHaveLength(1)
    expect(await listFiles(OTHER)).toHaveLength(1)
  })

  it('reads a single file back by id', async () => {
    await putFile(file())
    expect((await getFile(fileId(CONV, '/mnt/user-data/outputs/a.html'))).name).toBe('a.html')
  })

  it('round-trips a Blob with its bytes and type intact', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    await putFile(file({ path: '/o/i.png', kind: 'binary', mime: 'image/png', content: blob }))
    const back = await getFile(fileId(CONV, '/o/i.png'))
    expect(back.content).toBeInstanceOf(Blob)
    expect(back.content.size).toBe(4)
    expect(back.content.type).toBe('image/png')
  })

  it('deletes one file leaving siblings intact', async () => {
    await putFile(file({ path: '/o/a.html' }))
    await putFile(file({ path: '/o/b.html' }))
    await deleteFile(fileId(CONV, '/o/a.html'))
    expect((await listFiles(CONV)).map((f) => f.path)).toEqual(['/o/b.html'])
  })
})

describe('deleteConversation', () => {
  it('cascades to its files', async () => {
    await putConversation(conversation())
    await putFile(file({ path: '/o/a.html' }))
    await putFile(file({ path: '/o/b.html' }))
    await deleteConversation(CONV)
    expect(await getConversation(CONV)).toBeUndefined()
    expect(await listFiles(CONV)).toHaveLength(0)
  })

  it('leaves other conversations untouched', async () => {
    await putConversation(conversation())
    await putConversation(conversation({ id: OTHER }))
    await putFile(file({ convId: OTHER }))
    await deleteConversation(CONV)
    expect(await getConversation(OTHER)).toBeDefined()
    expect(await listFiles(OTHER)).toHaveLength(1)
  })
})

describe('storageUsage', () => {
  it('sums text and binary sizes per conversation', async () => {
    await putFile(file({ path: '/o/a.html', content: '12345' }))
    await putFile(file({ path: '/o/i.png', kind: 'binary', content: new Blob([new Uint8Array(10)]) }))
    await putFile(file({ convId: OTHER, path: '/o/c.html', content: 'xy' }))
    const usage = await storageUsage()
    expect(usage[CONV]).toBe(15)
    expect(usage[OTHER]).toBe(2)
  })

  it('is empty when nothing is stored', async () => {
    expect(await storageUsage()).toEqual({})
  })
})
