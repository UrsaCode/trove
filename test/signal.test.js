import { describe, it, expect } from 'vitest'
import { isFileSignal, conversationIdFromUrl } from '../src/lib/signal.js'

const ORG = '00000000-0000-4000-8000-000000000001'
const CONV = '11111111-1111-4111-8111-111111111111'
const API = `https://claude.ai/api/organizations/${ORG}`

describe('isFileSignal', () => {
  it('flags a completion request, which is where file writes happen', () => {
    expect(isFileSignal(`${API}/chat_conversations/${CONV}/completion`)).toBe(true)
  })

  it('flags a file download', () => {
    expect(isFileSignal(`https://claude.ai/api/organizations/${ORG}/conversations/${CONV}/wiggle/download-file?path=%2Fa`)).toBe(true)
  })

  it('does NOT flag the file listing, which would recurse', () => {
    expect(isFileSignal(`https://claude.ai/api/organizations/${ORG}/conversations/${CONV}/wiggle/list-files`)).toBe(false)
  })

  it('ignores telemetry', () => {
    expect(isFileSignal('https://claude.ai/api/v2/rum')).toBe(false)
    expect(isFileSignal('https://statsig.anthropic.com/v1/initialize')).toBe(false)
  })

  it('ignores static assets', () => {
    expect(isFileSignal('https://claude.ai/_next/static/chunks/main.js')).toBe(false)
    expect(isFileSignal('https://claude.ai/logo.png')).toBe(false)
  })

  it('ignores unrelated API calls', () => {
    expect(isFileSignal(`${API}/memory/settings`)).toBe(false)
  })

  it('returns false rather than throwing on a malformed URL', () => {
    expect(isFileSignal('not a url')).toBe(false)
    expect(isFileSignal(null)).toBe(false)
    expect(isFileSignal(undefined)).toBe(false)
  })
})

describe('conversationIdFromUrl', () => {
  it('extracts the id from a chat page URL', () => {
    expect(conversationIdFromUrl(`https://claude.ai/chat/${CONV}`)).toBe(CONV)
  })

  it('extracts the id from an API URL', () => {
    expect(conversationIdFromUrl(`${API}/chat_conversations/${CONV}/completion`)).toBe(CONV)
  })

  it('extracts the id from a wiggle URL', () => {
    expect(conversationIdFromUrl(`${API}/conversations/${CONV}/wiggle/list-files`)).toBe(CONV)
  })

  it('returns null when there is no conversation id', () => {
    expect(conversationIdFromUrl('https://claude.ai/new')).toBeNull()
  })

  it('does not mistake the organisation id for a conversation id', () => {
    expect(conversationIdFromUrl(`${API}/memory/settings`)).toBeNull()
  })

  it('returns null safely for rubbish input', () => {
    expect(conversationIdFromUrl(null)).toBeNull()
  })
})
