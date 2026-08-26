import { describe, it, expect } from 'vitest'
import { makeLocalFile, uniqueName, LOCAL_DIR } from '../src/lib/local-file.js'
import { isLocal, classifyFile, STATES } from '../src/lib/diff.js'

const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })

describe('makeLocalFile', () => {
  it('files it under the conversation, on a path unlike a sandbox one', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: 'shot.png', content: png() })
    expect(file.convId).toBe('c1')
    expect(file.path).toBe(`${LOCAL_DIR}/shot.png`)
    expect(file.path.startsWith('/mnt/')).toBe(false)
  })

  it('marks itself local, so nothing calls it orphaned', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: 'shot.png', content: png() })
    expect(isLocal(file)).toBe(true)
    expect(classifyFile(null, file)).toBe(STATES.LOCAL)
  })

  it('carries no upstream sizes, rather than pretending they are zero', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: 'shot.png', content: png() })
    expect(file.remoteSize).toBeNull()
    expect(file.remoteCreatedAt).toBeNull()
  })

  it('derives the extension and hashes the bytes', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: 'shot.png', content: png() })
    expect(file.ext).toBe('png')
    expect(file.kind).toBe('binary')
    expect(file.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('takes the mime from the blob when none is given', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: 'shot.png', content: png() })
    expect(file.mime).toBe('image/png')
  })

  it('refuses a name that would imply a location', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: '../../etc/x.png', content: png() })
    expect(file.name).not.toContain('/')
    expect(file.path).toBe(`${LOCAL_DIR}/${file.name}`)
  })

  it('names an empty name rather than storing a blank', async () => {
    const file = await makeLocalFile({ convId: 'c1', name: '   ', content: png() })
    expect(file.name).toBe('untitled')
  })
})

describe('uniqueName', () => {
  it('leaves a free name alone', () => {
    expect(uniqueName('shot.png', ['other.png'])).toBe('shot.png')
  })

  it('numbers a collision rather than overwriting it', () => {
    expect(uniqueName('shot.png', ['shot.png'])).toBe('shot-2.png')
  })

  it('keeps counting past the first collision', () => {
    expect(uniqueName('shot.png', ['shot.png', 'shot-2.png', 'shot-3.png'])).toBe('shot-4.png')
  })

  it('handles a name with no extension', () => {
    expect(uniqueName('shot', ['shot'])).toBe('shot-2')
  })

  it('handles a dotfile without treating it as an extension', () => {
    expect(uniqueName('.env', ['.env'])).toBe('.env-2')
  })

  it('copes with an empty taken list', () => {
    expect(uniqueName('shot.png')).toBe('shot.png')
  })
})
