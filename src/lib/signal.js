/**
 * Decides whether a request URL suggests that files in a conversation may have
 * changed.
 *
 * This is deliberately URL-only. The interceptor never reads a response body,
 * so it can never consume a stream the page still needs, and it can never
 * reconstruct stale content — the API remains the source of truth. A signal
 * only says "look again", never "here is the file".
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Path fragments that indicate Claude may have written to the sandbox. */
const SIGNALS = ['/completion', '/wiggle/download-file']

/** Listing is how we respond to a signal; treating it as one would recurse. */
const NEVER = ['/wiggle/list-files']

export function isFileSignal(url) {
  let pathname
  try {
    pathname = new URL(String(url), 'https://claude.ai').pathname
  } catch {
    return false
  }
  if (typeof url !== 'string' || !url.includes('/')) return false
  if (NEVER.some((f) => pathname.includes(f))) return false
  return SIGNALS.some((f) => pathname.includes(f))
}

/**
 * Pulls the conversation UUID out of a chat page or API URL.
 *
 * Organisation ids are UUIDs too, so we anchor on the path segment that
 * precedes the id rather than taking the first UUID we see.
 */
export function conversationIdFromUrl(url) {
  let pathname
  try {
    pathname = new URL(String(url), 'https://claude.ai').pathname
  } catch {
    return null
  }

  const segments = pathname.split('/').filter(Boolean)
  const anchors = new Set(['chat', 'chat_conversations', 'conversations'])

  for (let i = 0; i < segments.length - 1; i++) {
    if (anchors.has(segments[i]) && UUID.test(segments[i + 1])) return segments[i + 1]
  }
  return null
}
