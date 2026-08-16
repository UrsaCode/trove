import { describe, it, expect } from 'vitest'
import { classifyFile, diffConversation, STATES } from '../src/lib/diff.js'

const PATH = '/mnt/user-data/outputs/a.html'
const remote = (over = {}) => ({ path: PATH, size: 100, created_at: '2026-08-01T00:00:00Z', ...over })
const stored = (over = {}) => ({
  path: PATH,
  remoteSize: 100,
  remoteCreatedAt: '2026-08-01T00:00:00Z',
  edited: false,
  ...over,
})

describe('classifyFile', () => {
  it('reports new when nothing is stored', () => {
    expect(classifyFile(remote(), null)).toBe(STATES.NEW)
  })

  it('reports unchanged when size and timestamp match', () => {
    expect(classifyFile(remote(), stored())).toBe(STATES.UNCHANGED)
  })

  it('reports changed when size differs', () => {
    expect(classifyFile(remote({ size: 200 }), stored())).toBe(STATES.CHANGED)
  })

  it('reports changed when only the created timestamp differs', () => {
    expect(classifyFile(remote({ created_at: '2026-08-02T00:00:00Z' }), stored())).toBe(STATES.CHANGED)
  })

  it('reports conflict, not changed, when a locally edited file also changed remotely', () => {
    expect(classifyFile(remote({ size: 200 }), stored({ edited: true }))).toBe(STATES.CONFLICT)
  })

  it('reports unchanged for a locally edited file whose remote is identical', () => {
    expect(classifyFile(remote(), stored({ edited: true }))).toBe(STATES.UNCHANGED)
  })

  it('reports orphaned when the remote file is gone', () => {
    expect(classifyFile(null, stored())).toBe(STATES.ORPHANED)
  })
})

describe('diffConversation', () => {
  it('buckets a mixed list and counts consistently', () => {
    const remotes = [
      { path: '/o/new.html', size: 10, created_at: 't1' },
      { path: '/o/same.html', size: 20, created_at: 't2' },
      { path: '/o/changed.html', size: 99, created_at: 't3' },
      { path: '/o/conflict.html', size: 99, created_at: 't4' },
    ]
    const storeds = [
      { path: '/o/same.html', remoteSize: 20, remoteCreatedAt: 't2', edited: false },
      { path: '/o/changed.html', remoteSize: 30, remoteCreatedAt: 't3', edited: false },
      { path: '/o/conflict.html', remoteSize: 40, remoteCreatedAt: 't4', edited: true },
      { path: '/o/gone.html', remoteSize: 50, remoteCreatedAt: 't5', edited: false },
    ]

    const d = diffConversation(remotes, storeds)

    expect(d.new.map((f) => f.path)).toEqual(['/o/new.html'])
    expect(d.unchanged.map((f) => f.path)).toEqual(['/o/same.html'])
    expect(d.changed.map((f) => f.path)).toEqual(['/o/changed.html'])
    expect(d.conflict.map((f) => f.path)).toEqual(['/o/conflict.html'])
    expect(d.orphaned.map((f) => f.path)).toEqual(['/o/gone.html'])

    const { counts } = d
    expect(counts.new + counts.unchanged + counts.changed + counts.conflict + counts.orphaned).toBe(5)
    expect(counts.total).toBe(5)
  })

  it('handles empty input on both sides', () => {
    const d = diffConversation([], [])
    expect(d.counts.total).toBe(0)
    expect(d.new).toEqual([])
  })

  it('treats every remote file as new when nothing is stored', () => {
    const d = diffConversation([{ path: '/o/a.html', size: 1, created_at: 't' }], [])
    expect(d.counts.new).toBe(1)
  })
})
