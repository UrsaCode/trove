import { describe, it, expect } from 'vitest'
import { encodeRecord, decodeRecord, encodeRecords, decodeRecords, isEncoded } from '../src/lib/transport.js'

const text = (over = {}) => ({ kind: 'text', content: 'hello <b>world</b>', ...over })
const binary = (bytes, over = {}) => ({
  kind: 'binary',
  mime: 'image/png',
  content: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
  ...over,
})

describe('text records', () => {
  it('are left alone, since JSON carries strings faithfully', async () => {
    const record = text()
    expect(await encodeRecord(record)).toBe(record)
  })

  it('decode to themselves', () => {
    const record = text()
    expect(decodeRecord(record)).toBe(record)
  })
})

describe('binary records', () => {
  it('survive a round trip byte for byte', async () => {
    const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 128]
    const encoded = await encodeRecord(binary(bytes))
    const decoded = decodeRecord(encoded)
    expect([...decoded.content]).toEqual(bytes)
  })

  /**
   * The bug this module exists for: a Blob JSON-serialises to {} with no error,
   * so the capture reported success while storing nothing.
   */
  it('encode to something JSON can actually carry', async () => {
    const encoded = await encodeRecord(binary([1, 2, 3, 4]))
    const throughJson = JSON.parse(JSON.stringify(encoded))
    expect([...decodeRecord(throughJson).content]).toEqual([1, 2, 3, 4])
  })

  it('would have been lost without encoding', () => {
    const raw = binary([1, 2, 3])
    const throughJson = JSON.parse(JSON.stringify(raw))
    // Proof of the failure mode, so a future change cannot quietly reintroduce it.
    expect(throughJson.content).toEqual({})
  })

  it('are recognisable as encoded', async () => {
    expect(isEncoded((await encodeRecord(binary([1]))).content)).toBe(true)
    expect(isEncoded('a string')).toBe(false)
    expect(isEncoded(null)).toBe(false)
  })

  it('are not double-encoded', async () => {
    const once = await encodeRecord(binary([9, 9]))
    expect(await encodeRecord(once)).toBe(once)
  })

  it('handle an empty file', async () => {
    const decoded = decodeRecord(await encodeRecord(binary([])))
    expect(decoded.content.length).toBe(0)
  })

  it('handle a payload larger than one chunk', async () => {
    const bytes = Array.from({ length: 70000 }, (_, i) => i % 256)
    const decoded = decodeRecord(await encodeRecord(binary(bytes)))
    expect(decoded.content.length).toBe(70000)
    expect(decoded.content[69999]).toBe(69999 % 256)
  })

  it('leave a null content alone', async () => {
    const record = { kind: 'binary', content: null }
    expect(await encodeRecord(record)).toBe(record)
  })

  it('preserve the rest of the record', async () => {
    const encoded = await encodeRecord(binary([1], { name: 'a.png', remoteSize: 12 }))
    expect(encoded).toMatchObject({ name: 'a.png', remoteSize: 12, mime: 'image/png' })
  })
})

describe('batches', () => {
  it('encode and decode a mixed list', async () => {
    const encoded = await encodeRecords([text(), binary([7, 8])])
    const decoded = decodeRecords(JSON.parse(JSON.stringify(encoded)))
    expect(decoded[0].content).toBe('hello <b>world</b>')
    expect([...decoded[1].content]).toEqual([7, 8])
  })

  it('cope with an empty list', async () => {
    expect(await encodeRecords()).toEqual([])
    expect(decodeRecords()).toEqual([])
  })
})
