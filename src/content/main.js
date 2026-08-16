/**
 * Content script entry, isolated world.
 *
 * This is the only component that talks to Claude's API: it is same-origin
 * with claude.ai, so the session cookie attaches with no token handling and no
 * cross-site cookie risk. Extension pages reach the API by messaging here.
 */

import { resolveOrgId, listOutputFiles, conversationTitle } from './api.js'
import { captureEntries, selectForCapture } from './capture.js'
import { mountCards } from './cards.js'
import { MSG, BRIDGE_SOURCE } from '../lib/messages.js'
import { conversationIdFromUrl } from '../lib/signal.js'
import { classifyFile } from '../lib/diff.js'

const ORG_CACHE_KEY = 'cfv:orgId'

let orgIdPromise = null
let entriesCache = { convId: null, at: 0, entries: null }

function currentConvId() {
  return conversationIdFromUrl(location.href)
}

async function orgId() {
  if (orgIdPromise) return orgIdPromise
  orgIdPromise = (async () => {
    const cached = sessionStorage.getItem(ORG_CACHE_KEY)
    if (cached) return cached
    const id = await resolveOrgId()
    sessionStorage.setItem(ORG_CACHE_KEY, id)
    return id
  })()
  return orgIdPromise
}

/** Listing is cheap but not free; a short cache keeps card refreshes snappy. */
async function entries({ force = false } = {}) {
  const convId = currentConvId()
  if (!convId) return []
  const fresh = entriesCache.convId === convId && Date.now() - entriesCache.at < 5000
  if (fresh && !force) return entriesCache.entries

  const list = await listOutputFiles(await orgId(), convId)
  entriesCache = { convId, at: Date.now(), entries: list }
  return list
}

async function storedFiles(convId) {
  const response = await chrome.runtime.sendMessage({ type: MSG.GET_STATUS, convId })
  return response?.files ?? []
}

async function stateByPath(convId) {
  const [remote, stored] = await Promise.all([entries(), storedFiles(convId)])
  const storedByPath = new Map(stored.map((f) => [f.path, f]))
  return new Map(remote.map((r) => [r.path, classifyFile(r, storedByPath.get(r.path) ?? null)]))
}

/** Fetch the named paths and hand them to the service worker to persist. */
async function capture(paths, { onlyChanged = false } = {}) {
  const convId = currentConvId()
  if (!convId) return { ok: false, error: 'Not a conversation page.' }

  const remote = await entries({ force: true })
  const wanted = paths
    ? remote.filter((e) => paths.includes(e.path))
    : selectForCapture(remote, await storedFiles(convId), { onlyChanged }).entries

  const { records, errors } = await captureEntries({
    orgId: await orgId(),
    convId,
    entries: wanted,
  })

  if (records.length) {
    await chrome.runtime.sendMessage({
      type: MSG.SAVE_FILES,
      conversation: {
        id: convId,
        title: conversationTitle(),
        orgId: await orgId(),
        url: `https://claude.ai/chat/${convId}`,
      },
      files: records,
    })
  }

  return { ok: true, saved: records.length, errors }
}

// -- Messages from extension pages -----------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    try {
      switch (message?.type) {
        case MSG.CAPTURE_ALL:
          return await capture(null, { onlyChanged: message.onlyChanged })
        case MSG.CAPTURE_FILE:
          return await capture([message.path])
        case MSG.LIST_STATUS: {
          const convId = currentConvId()
          if (!convId) return { ok: true, conversation: null, entries: [] }
          return {
            ok: true,
            conversation: { id: convId, title: conversationTitle() },
            entries: await entries({ force: true }),
          }
        }
        default:
          return undefined // not ours; let another listener answer
      }
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) }
    }
  })().then((result) => {
    if (result !== undefined) sendResponse(result)
  })
  return true
})

// -- Signals from the main-world interceptor -------------------------------

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (data?.source !== BRIDGE_SOURCE || data.type !== 'files-changed') return
  chrome.runtime.sendMessage({ type: MSG.FILES_CHANGED, convId: data.convId }).catch(() => {})
})

// -- Card buttons ----------------------------------------------------------

if (currentConvId()) {
  mountCards({
    getEntries: () => entries(),
    getStates: () => stateByPath(currentConvId()),
    onCapture: (path) => capture([path]),
  })
}
