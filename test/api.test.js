import { describe, it, expect, vi } from 'vitest'
import {
  resolveOrgId,
  listOutputFiles,
  downloadFile,
  AuthError,
  FileMissingError,
  ApiShapeError,
} from '../src/content/api.js'

const ORG = '00000000-0000-4000-8000-000000000001'
const API_ORG = '00000000-0000-4000-8000-000000000002'
const CONV = '11111111-1111-4111-8111-111111111111'
const OUT = '/mnt/user-data/outputs'

/** Minimal stand-in for a fetch Response. */
function res(body, { status = 200, type = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => type },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    blob: async () => new Blob([typeof body === 'string' ? body : 'bin']),
  }
}

const ORGS = [
  { uuid: ORG, name: 'Personal', capabilities: ['chat', 'claude_max'] },
  { uuid: API_ORG, name: 'Individual', capabilities: ['api', 'api_individual'] },
]

const LISTING = {
  success: true,
  files: [
    `${OUT}/fbmp-fleet-console.html`,
    '/mnt/user-data/uploads/1786784679585_image.png',
    `${OUT}/logo.svg`,
  ],
  files_metadata: [
    { path: `${OUT}/fbmp-fleet-console.html`, size: 30646, content_type: 'text/html', created_at: 't1' },
    { path: '/mnt/user-data/uploads/1786784679585_image.png', size: 156659, content_type: 'image/png', created_at: 't2' },
    { path: `${OUT}/logo.svg`, size: 512, content_type: 'image/svg+xml', created_at: 't3' },
  ],
}

describe('resolveOrgId', () => {
  it('picks the organisation with the chat capability, not the API-only one', async () => {
    const fetchImpl = vi.fn(async () => res(ORGS))
    expect(await resolveOrgId({ fetchImpl })).toBe(ORG)
  })

  it('raises AuthError on 401', async () => {
    const fetchImpl = vi.fn(async () => res({}, { status: 401 }))
    await expect(resolveOrgId({ fetchImpl })).rejects.toBeInstanceOf(AuthError)
  })

  it('raises AuthError on 403', async () => {
    const fetchImpl = vi.fn(async () => res({}, { status: 403 }))
    await expect(resolveOrgId({ fetchImpl })).rejects.toBeInstanceOf(AuthError)
  })

  it('raises ApiShapeError when no chat organisation exists', async () => {
    const fetchImpl = vi.fn(async () => res([ORGS[1]]))
    await expect(resolveOrgId({ fetchImpl })).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('sends credentials', async () => {
    const fetchImpl = vi.fn(async () => res(ORGS))
    await resolveOrgId({ fetchImpl })
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })
})

describe('listOutputFiles', () => {
  it('returns only outputs, excluding uploads', async () => {
    const fetchImpl = vi.fn(async () => res(LISTING))
    const files = await listOutputFiles(ORG, CONV, { fetchImpl })
    expect(files.map((f) => f.path)).toEqual([
      `${OUT}/fbmp-fleet-console.html`,
      `${OUT}/logo.svg`,
    ])
  })

  it('decorates each file with derived name, mime and kind', async () => {
    const fetchImpl = vi.fn(async () => res(LISTING))
    const [html, svg] = await listOutputFiles(ORG, CONV, { fetchImpl })
    expect(html).toMatchObject({ name: 'fbmp-fleet-console.html', kind: 'text', mime: 'text/html', size: 30646 })
    expect(svg).toMatchObject({ name: 'logo.svg', kind: 'text', mime: 'image/svg+xml' })
  })

  it('preserves the remote created timestamp used for change detection', async () => {
    const fetchImpl = vi.fn(async () => res(LISTING))
    const [html] = await listOutputFiles(ORG, CONV, { fetchImpl })
    expect(html.created_at).toBe('t1')
  })

  it('raises ApiShapeError when the response shape is unrecognised', async () => {
    const fetchImpl = vi.fn(async () => res({ unexpected: true }))
    await expect(listOutputFiles(ORG, CONV, { fetchImpl })).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('raises AuthError on 403', async () => {
    const fetchImpl = vi.fn(async () => res({}, { status: 403 }))
    await expect(listOutputFiles(ORG, CONV, { fetchImpl })).rejects.toBeInstanceOf(AuthError)
  })

  it('tolerates a listing with no metadata array', async () => {
    const fetchImpl = vi.fn(async () => res({ success: true, files: [`${OUT}/a.html`] }))
    const files = await listOutputFiles(ORG, CONV, { fetchImpl })
    expect(files).toHaveLength(1)
    expect(files[0].size).toBe(0)
  })
})

describe('downloadFile', () => {
  it('returns a string for a text file', async () => {
    const fetchImpl = vi.fn(async () => res('<!DOCTYPE html><h1>hi</h1>'))
    const out = await downloadFile(ORG, CONV, `${OUT}/a.html`, { fetchImpl })
    expect(out.content).toBe('<!DOCTYPE html><h1>hi</h1>')
    expect(out.kind).toBe('text')
  })

  it('returns a Blob for a binary file', async () => {
    const fetchImpl = vi.fn(async () => res('bin'))
    const out = await downloadFile(ORG, CONV, `${OUT}/i.png`, { fetchImpl })
    expect(out.content).toBeInstanceOf(Blob)
    expect(out.kind).toBe('binary')
  })

  it('raises FileMissingError on 404', async () => {
    const fetchImpl = vi.fn(async () => res({ error: 'nope' }, { status: 404 }))
    await expect(downloadFile(ORG, CONV, `${OUT}/gone.html`, { fetchImpl })).rejects.toBeInstanceOf(
      FileMissingError,
    )
  })

  it('raises AuthError on 401', async () => {
    const fetchImpl = vi.fn(async () => res({}, { status: 401 }))
    await expect(downloadFile(ORG, CONV, `${OUT}/a.html`, { fetchImpl })).rejects.toBeInstanceOf(
      AuthError,
    )
  })

  it('encodes the path as a query parameter', async () => {
    const fetchImpl = vi.fn(async () => res('x'))
    await downloadFile(ORG, CONV, `${OUT}/a b.html`, { fetchImpl })
    const url = fetchImpl.mock.calls[0][0]
    expect(url).toContain(encodeURIComponent(`${OUT}/a b.html`))
    expect(url).toContain(CONV)
  })
})
