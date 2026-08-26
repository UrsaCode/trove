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
import { encodeRecords } from '../lib/transport.js'
import { whenSettled } from './idle.js'

const ORG_CACHE_KEY = 'cfv:orgId'

let orgIdPromise = null
let entriesCache = { convId: null, at: 0, entries: null }
let cards = null

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

/**
 * One in-flight state lookup, shared by every card.
 *
 * Each card used to ask independently, so a conversation with thirteen file
 * cards made thirteen listings and thirteen round trips to the worker on every
 * page load. They all want the same answer at the same moment, so they now
 * share one promise, and it is dropped as soon as a capture changes anything.
 */
let statesPromise = null

/**
 * The last state map we worked out, kept per tab.
 *
 * A reload previously had to wait on a listing and a round trip before any card
 * could say whether its file was kept. Remembering the answer lets the buttons
 * paint from the last known state at once and be corrected in the background,
 * which is the difference between a page that loads and a page that hangs.
 */
const STATE_CACHE_KEY = 'trove:states'

function cachedStates() {
  try {
    const raw = sessionStorage.getItem(`${STATE_CACHE_KEY}:${currentConvId()}`)
    if (!raw) return null
    return new Map(JSON.parse(raw))
  } catch {
    return null
  }
}

function rememberStates(map) {
  try {
    sessionStorage.setItem(`${STATE_CACHE_KEY}:${currentConvId()}`, JSON.stringify([...map]))
  } catch {
    /* a full or blocked sessionStorage costs us nothing but the shortcut */
  }
}

function invalidateStates() {
  statesPromise = null
}

async function stateByPath(convId) {
  if (statesPromise) return statesPromise

  statesPromise = (async () => {
    const [remote, stored] = await Promise.all([entries(), storedFiles(convId)])
    const storedByPath = new Map(stored.map((f) => [f.path, f]))
    const map = new Map(
      remote.map((r) => [r.path, classifyFile(r, storedByPath.get(r.path) ?? null)]),
    )
    rememberStates(map)
    return map
  })()

  try {
    return await statesPromise
  } catch (error) {
    statesPromise = null
    throw error
  }
}

/** Fetch the named paths and hand them to the service worker to persist. */
async function capture(paths, { onlyChanged = false } = {}) {
  const convId = currentConvId()
  if (!convId) return { ok: false, error: 'Not a conversation page.' }

  const remote = await entries({ force: !paths })
  const wanted = paths
    ? remote.filter((e) => paths.includes(e.path))
    : selectForCapture(remote, await storedFiles(convId), { onlyChanged }).entries

  const { records, errors } = await captureEntries({
    orgId: await orgId(),
    convId,
    entries: wanted,
  })

  invalidateStates()

  if (records.length) {
    await chrome.runtime.sendMessage({
      type: MSG.SAVE_FILES,
      conversation: {
        id: convId,
        title: conversationTitle(),
        orgId: await orgId(),
        url: `https://claude.ai/chat/${convId}`,
      },
      // Binary cannot survive the message channel as a Blob - see transport.js.
      files: await encodeRecords(records),
    })
  }

  // Dropped again after the write, so the next read sees what was just saved.
  invalidateStates()
  return { ok: true, saved: records.length, errors }
}

// -- Messages from extension pages -----------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    try {
      switch (message?.type) {
        case MSG.CAPTURE_ALL: {
          const result = await capture(null, { onlyChanged: message.onlyChanged })
          await cards?.refreshAll()
          return result
        }
        case MSG.CAPTURE_FILE: {
          const result = await capture([message.path])
          await cards?.refreshAll()
          return result
        }
        case MSG.REFRESH_CARDS:
          // The listing itself may have moved on, so drop both caches first.
          entriesCache = { convId: null, at: 0, entries: null }
          invalidateStates()
          await cards?.refreshAll()
          return { ok: true }
        case MSG.LIST_STATUS: {
          const convId = currentConvId()
          if (!convId) return { ok: true, conversation: null, entries: [] }
          // The caller decides whether a fresh listing is worth the latency.
          // Straight after a capture it is not: we just listed these files.
          return {
            ok: true,
            conversation: { id: convId, title: conversationTitle() },
            entries: await entries({ force: message.force !== false }),
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
  cards = mountCards({
    getEntries: () => entries(),
    getStates: () => stateByPath(currentConvId()),
    // Synchronous, so a button can be labelled without waiting for anything.
    getCachedStates: cachedStates,
    onCapture: (path) => capture([path]),
  })

  /*
   * The first real check waits for the page.
   *
   * Buttons mount immediately from the cached state, but nothing touches the
   * network until claude.ai has finished loading and gone quiet - competing
   * with the page for the connection is what made a reload sit there.
   */
  whenSettled().then(() => cards?.refreshAll())
}
