import { describe, it, expect, vi } from 'vitest'
import { captureEntries, selectForCapture } from '../src/content/capture.js'

const ORG = 'org'
const CONV = 'conv'
const entry = (path, over = {}) => ({ path, size: 10, created_at: 't', ...over })

const downloadOk = vi.fn(async (_o, _c, path) => ({
  path,
  name: path.split('/').pop(),
  ext: 'html',
  mime: 'text/html',
  kind: 'text',
  content: `content of ${path}`,
}))

describe('captureEntries', () => {
  it('builds a record per entry', async () => {
    const { records, errors } = await captureEntries({
      orgId: ORG,
      convId: CONV,
      entries: [entry('/o/a.html'), entry('/o/b.html')],
      deps: { download: downloadOk, now: () => 5 },
    })
    expect(errors).toEqual([])
    expect(records.map((r) => r.path)).toEqual(['/o/a.html', '/o/b.html'])
  })

  it('records remote size and timestamp so later diffs work', async () => {
    const { records } = await captureEntries({
      orgId: ORG,
      convId: CONV,
      entries: [entry('/o/a.html', { size: 99, created_at: 'ts' })],
      deps: { download: downloadOk, now: () => 5 },
    })
    expect(records[0]).toMatchObject({ remoteSize: 99, remoteCreatedAt: 'ts', edited: false })
  })

  it('hashes the captured content', async () => {
    const { records } = await captureEntries({
      orgId: ORG,
      convId: CONV,
      entries: [entry('/o/a.html')],
      deps: { download: downloadOk, now: () => 5 },
    })
    expect(records[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('keeps going when one file fails, reporting it', async () => {
    const download = vi.fn(async (_o, _c, path) => {
      if (path === '/o/bad.html') throw new Error('gone')
      return downloadOk(_o, _c, path)
    })
    const { records, errors } = await captureEntries({
      orgId: ORG,
      convId: CONV,
      entries: [entry('/o/a.html'), entry('/o/bad.html'), entry('/o/c.html')],
      deps: { download, now: () => 5 },
    })
    expect(records.map((r) => r.path)).toEqual(['/o/a.html', '/o/c.html'])
    expect(errors).toEqual([{ path: '/o/bad.html', error: 'gone' }])
  })

  it('returns nothing for an empty entry list', async () => {
    const { records } = await captureEntries({
      orgId: ORG,
      convId: CONV,
      entries: [],
      deps: { download: downloadOk },
    })
    expect(records).toEqual([])
  })
})

describe('selectForCapture', () => {
  const remote = [
    entry('/o/new.html'),
    entry('/o/same.html', { size: 20 }),
    entry('/o/changed.html', { size: 99 }),
    entry('/o/conflict.html', { size: 99 }),
  ]
  const stored = [
    { path: '/o/same.html', remoteSize: 20, remoteCreatedAt: 't', edited: false },
    { path: '/o/changed.html', remoteSize: 30, remoteCreatedAt: 't', edited: false },
    { path: '/o/conflict.html', remoteSize: 30, remoteCreatedAt: 't', edited: true },
  ]

  it('includes unchanged files on a full capture', () => {
    const { entries } = selectForCapture(remote, stored)
    expect(entries.map((e) => e.path).sort()).toEqual([
      '/o/changed.html',
      '/o/new.html',
      '/o/same.html',
    ])
  })

  it('skips unchanged files when only changed is requested', () => {
    const { entries } = selectForCapture(remote, stored, { onlyChanged: true })
    expect(entries.map((e) => e.path).sort()).toEqual(['/o/changed.html', '/o/new.html'])
  })

  it('never includes a conflict, in either mode', () => {
    expect(selectForCapture(remote, stored).entries.map((e) => e.path)).not.toContain(
      '/o/conflict.html',
    )
    expect(
      selectForCapture(remote, stored, { onlyChanged: true }).entries.map((e) => e.path),
    ).not.toContain('/o/conflict.html')
  })

  it('reports conflicts separately so the UI can ask', () => {
    const { conflicts } = selectForCapture(remote, stored)
    expect(conflicts.map((c) => c.path)).toEqual(['/o/conflict.html'])
  })

  it('treats everything as capturable when nothing is stored', () => {
    const { entries } = selectForCapture(remote, [])
    expect(entries).toHaveLength(4)
  })
})
