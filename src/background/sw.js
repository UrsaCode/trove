/**
 * Service worker: wires the router to real browser APIs.
 *
 * All Claude network traffic is performed by the content script, which is
 * same-origin with claude.ai. When an extension page needs a capture, this
 * worker finds or opens a claude.ai tab and asks its content script to do the
 * work, rather than fetching cross-origin and risking a dropped session cookie.
 */

import { createRouter } from './router.js'
import { MSG } from '../lib/messages.js'
import { getSettings } from '../lib/settings.js'

const CHAT_URL = (convId) => `https://claude.ai/chat/${convId}`

/** Ask a specific tab's content script to capture everything changed. */
function requestSync(tabId, convId) {
  return chrome.tabs.sendMessage(tabId, { type: MSG.CAPTURE_ALL, convId, onlyChanged: true })
}

const router = createRouter({ getSettings, requestSync })

/**
 * Run `send` against a content script for this conversation. Prefers a tab the
 * user already has open; otherwise opens one in the background and closes it
 * again, so an update from the options page still works with no claude.ai tab.
 */
async function withConversationTab(convId, send) {
  const open = await chrome.tabs.query({ url: 'https://claude.ai/*' })
  const onConversation = open.find((t) => t.url?.includes(convId))
  if (onConversation) return send(onConversation.id)

  const temporary = await chrome.tabs.create({ url: CHAT_URL(convId), active: false })
  try {
    await waitForTabReady(temporary.id)
    return await send(temporary.id)
  } finally {
    try {
      await chrome.tabs.remove(temporary.id)
    } catch {
      /* already gone */
    }
  }
}

function waitForTabReady(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Timed out opening the conversation.'))
    }, timeoutMs)

    function listener(id, info) {
      if (id !== tabId || info.status !== 'complete') return
      chrome.tabs.onUpdated.removeListener(listener)
      clearTimeout(timer)
      // The content script mounts at document_idle; give it a moment to listen.
      setTimeout(resolve, 500)
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /*
   * captureVisibleTab is only available to the worker, and only for the window
   * the caller lives in. The sandboxed render frame has an opaque origin, so
   * compositing the tab is the one way to get its pixels.
   */
  if (message?.type === MSG.SCREENSHOT) {
    const windowId = sender.tab?.windowId
    chrome.tabs
      .captureVisibleTab(windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  /*
   * PEEK is deliberately not allowed to open a tab. It runs on every library
   * load to show which copies have fallen behind; opening background tabs for
   * that would be a surprising amount of activity for a passive check.
   */
  if (message?.type === MSG.PEEK) {
    chrome.tabs
      .query({ url: 'https://claude.ai/*' })
      .then((tabs) => {
        const tab = tabs.find((t) => t.url?.includes(message.convId))
        if (!tab) return { ok: false, error: 'no open tab for this conversation' }
        return chrome.tabs.sendMessage(tab.id, { type: MSG.LIST_STATUS })
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  // Messages an extension page sends that need a claude.ai tab to service them.
  if (message?.type === MSG.SYNC_CHECK || message?.type === MSG.CAPTURE_FILE) {
    withConversationTab(message.convId, (tabId) => chrome.tabs.sendMessage(tabId, message))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  router.handleMessage(message, sender).then(sendResponse)
  return true // keep the channel open for the async reply
})
