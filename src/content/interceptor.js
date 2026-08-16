/**
 * Main-world network observer.
 *
 * Runs inside claude.ai's own JavaScript context so it can see the page's
 * requests. It exists to answer one question: might files in this conversation
 * have changed? It reads request URLs and nothing else.
 *
 * Deliberate non-goals:
 *  - It never reads a response body, so it can never consume a stream the page
 *    still needs.
 *  - It never extracts file content. Claude streams full text when a file is
 *    created but only a diff when one is edited, so anything reconstructed here
 *    would start correct and silently go stale. The API stays the source of
 *    truth; this is only a nudge to go and look.
 *
 * Every hook falls through to the original on any failure. A defect in capture
 * code must not be able to break someone's Claude session.
 */

import { isFileSignal, conversationIdFromUrl } from '../lib/signal.js'
import { BRIDGE_SOURCE } from '../lib/messages.js'

;(function installObserver() {
  const seenRecently = new Map()
  const QUIET_MS = 1000

  function announce(url) {
    try {
      if (!isFileSignal(url)) return
      const convId = conversationIdFromUrl(url) ?? conversationIdFromUrl(location.href)
      if (!convId) return

      // Coalesce here as well as in the service worker: a streaming response
      // can produce many requests in a burst.
      const last = seenRecently.get(convId) ?? 0
      const now = Date.now()
      if (now - last < QUIET_MS) return
      seenRecently.set(convId, now)

      window.postMessage({ source: BRIDGE_SOURCE, type: 'files-changed', convId }, location.origin)
    } catch {
      /* observation must never affect the page */
    }
  }

  try {
    const originalFetch = window.fetch
    if (typeof originalFetch === 'function') {
      window.fetch = function (...args) {
        try {
          const input = args[0]
          announce(typeof input === 'string' ? input : input?.url)
        } catch {
          /* ignore */
        }
        return originalFetch.apply(this, args)
      }
    }
  } catch {
    /* leave fetch untouched */
  }

  try {
    const originalOpen = XMLHttpRequest.prototype.open
    if (typeof originalOpen === 'function') {
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        try {
          announce(url)
        } catch {
          /* ignore */
        }
        return originalOpen.call(this, method, url, ...rest)
      }
    }
  } catch {
    /* leave XHR untouched */
  }
})()
