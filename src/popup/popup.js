/**
 * Popup.
 *
 * Copy rule: never says "artifact", "sandbox", or "output directory". It says
 * file, and it says where the file came from. The mechanism is the
 * extension's problem, not the reader's.
 *
 * Every row carries its own action and its own progress. Capturing runs one
 * file at a time so that progress is real rather than a spinner standing in
 * for a batch whose state nobody can see.
 */

import { MSG } from '../lib/messages.js'
import { listFiles, listConversations, contentSize } from '../lib/db.js'
import { diffConversation, STATES } from '../lib/diff.js'
import { getSettings, setSetting } from '../lib/settings.js'
import { conversationIdFromUrl } from '../lib/signal.js'
import { fileCategory } from '../lib/paths.js'
import { mark } from '../ui/mark.js'
import { fileIcon } from '../ui/file-icon.js'

const el = (id) => document.getElementById(id)
const FRESH_MS = 5 * 60 * 1000

let tabId = null
let convId = null

/** Paths the user has ticked. Actionable rows start ticked. */
let selected = new Set()
/** Rows by path, so a capture can repaint exactly the row it finished. */
const rows = new Map()
let lastDiff = null
let storedByPath = new Map()

// ── Formatting ────────────────────────────────────────────────────────────

function bytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function ago(ms) {
  if (!ms) return ''
  const seconds = Math.max(0, (Date.now() - ms) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** A path is actionable when keeping it would actually change something. */
const isActionable = (state) => state === STATES.NEW || state === STATES.CHANGED

function message(heading, body, action) {
  el('list').textContent = ''
  el('selectbar').classList.add('hidden')
  const wrap = document.createElement('div')
  wrap.className = 'message'

  const strong = document.createElement('strong')
  strong.textContent = heading
  const span = document.createElement('span')
  span.textContent = body

  wrap.append(mark(30), strong, span)
  if (action) wrap.appendChild(action)
  el('list').appendChild(wrap)
}

// ── Status ────────────────────────────────────────────────────────────────

/**
 * The pill reports the outcome, not the mode.
 *
 * It used to read "Capturing" for any conversation with nothing pending, which
 * said the same thing whether every file was already kept or none were. What a
 * reader wants from this slot is whether anything needs doing.
 */
function paintStatus(diff) {
  const status = el('status')
  const { counts } = diff
  const moved = counts.changed + counts.conflict

  status.classList.remove('hidden')

  if (moved > 0) {
    status.dataset.state = 'moved'
    el('status-text').textContent = `${moved} newer`
  } else if (counts.new > 0) {
    status.dataset.state = 'live'
    el('status-text').textContent = `${counts.new} to keep`
  } else if (counts.total > 0) {
    status.dataset.state = 'kept'
    el('status-text').textContent = 'All kept'
  } else {
    status.classList.add('hidden')
  }
}

function paintTether({ counts }) {
  const tether = el('tether')
  const label = tether.querySelector('.lbl')
  const moved = counts.changed + counts.conflict

  if (moved > 0) {
    tether.dataset.state = 'moved'
    label.textContent = `${moved} of ${counts.total} moved on`
    return
  }
  tether.removeAttribute('data-state')
  label.textContent =
    counts.new > 0
      ? `${counts.unchanged} of ${counts.total} kept`
      : `${counts.total} ${counts.total === 1 ? 'file' : 'files'} · this tab`
}

// ── Rows ──────────────────────────────────────────────────────────────────

function subtitleFor(entry, stored) {
  if (entry.state === STATES.CHANGED || entry.state === STATES.CONFLICT) {
    return { text: 'newer version', state: 'moved' }
  }
  if (entry.state === STATES.NEW) return { text: `${bytes(entry.size)} · not kept yet`, state: null }
  return { text: `${bytes(contentSize(stored?.content))} · ${ago(stored?.capturedAt)}`, state: null }
}

function buildRow(entry) {
  const stored = storedByPath.get(entry.path)
  const actionable = isActionable(entry.state)
  const name = entry.name ?? entry.path.split('/').pop()
  const ext = name.split('.').pop() ?? ''

  const item = document.createElement('div')
  item.className = 'item'
  item.dataset.state = entry.state
  item.dataset.fresh = String(Boolean(stored && Date.now() - stored.capturedAt < FRESH_MS))

  // Tick box, only where ticking it would do something.
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.className = 'row-check'
  box.checked = selected.has(entry.path)
  box.disabled = !actionable
  box.setAttribute('aria-label', `Select ${name}`)
  box.addEventListener('change', () => {
    if (box.checked) selected.add(entry.path)
    else selected.delete(entry.path)
    paintSelection()
  })

  const icon = document.createElement('span')
  icon.className = 'item-icon'
  icon.appendChild(fileIcon({ ext, mime: entry.mime, category: fileCategory(ext) }, 16))

  const body = document.createElement('div')
  body.className = 'item-body'

  const title = document.createElement('div')
  title.className = 'item-name'
  title.textContent = name

  const sub = document.createElement('div')
  sub.className = 'item-sub'
  const subtitle = subtitleFor(entry, stored)
  sub.textContent = subtitle.text
  if (subtitle.state) sub.dataset.state = subtitle.state

  body.append(title, sub)

  const action = document.createElement('button')
  action.className = 'row-action'
  if (actionable) {
    action.textContent = entry.state === STATES.NEW ? 'Keep' : 'Re-pull'
    action.addEventListener('click', () => captureOne(entry.path))
  } else if (entry.state === STATES.CONFLICT) {
    action.textContent = 'Edited'
    action.disabled = true
    action.title = 'You edited this copy. Re-pull it from the library, where the warning lives.'
  } else {
    action.textContent = 'Kept'
    action.disabled = true
  }

  const ext_chip = document.createElement('span')
  ext_chip.className = 'ext'
  ext_chip.textContent = ext

  item.append(box, icon, body, ext_chip, action)

  rows.set(entry.path, { item, action, sub, box })
  return item
}

function renderList(diff) {
  rows.clear()
  el('list').textContent = ''

  const ordered = [...diff.changed, ...diff.conflict, ...diff.new, ...diff.unchanged]
  if (!ordered.length) {
    message(
      'No files yet',
      'This conversation hasn’t produced any files. Trove picks them up as Claude writes them.',
    )
    return
  }

  for (const entry of ordered) el('list').appendChild(buildRow(entry))

  const actionable = ordered.filter((e) => isActionable(e.state))
  el('selectbar').classList.toggle('hidden', actionable.length === 0)
  paintSelection()
}

/** Keeps the select-all box, the count and the footer button in agreement. */
function paintSelection() {
  const actionable = (lastDiff ? [...lastDiff.new, ...lastDiff.changed] : []).map((e) => e.path)
  const chosen = actionable.filter((path) => selected.has(path))

  const all = el('select-all')
  all.checked = chosen.length > 0 && chosen.length === actionable.length
  all.indeterminate = chosen.length > 0 && chosen.length < actionable.length
  el('select-all-label').textContent = all.checked ? 'Select none' : 'Select all'
  el('selected-count').textContent = `${chosen.length} of ${actionable.length} selected`

  const capture = el('capture')
  capture.classList.toggle('hidden', chosen.length === 0)
  const newCount = (lastDiff?.new ?? []).filter((e) => selected.has(e.path)).length
  capture.textContent = newCount === chosen.length ? `Keep ${chosen.length}` : `Update ${chosen.length}`
}

// ── Capturing ─────────────────────────────────────────────────────────────

/** One file. Its own row shows its own progress, and its own outcome. */
async function captureOne(path) {
  const row = rows.get(path)
  if (row) {
    row.item.dataset.busy = 'true'
    row.action.disabled = true
    row.action.textContent = 'Keeping'
  }

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: MSG.CAPTURE_FILE, path })
    if (result?.ok === false) throw new Error(result.error)

    // A capture can report ok while saving nothing - that was the Blob bug - so
    // the row only claims success if a file actually came back.
    if (result?.saved === 0) throw new Error('nothing was saved')

    selected.delete(path)
    if (row) {
      row.item.dataset.busy = 'false'
      row.item.dataset.state = STATES.UNCHANGED
      row.action.textContent = 'Kept'
      row.action.disabled = true
      row.box.checked = false
      row.box.disabled = true
      delete row.sub.dataset.state
      row.sub.textContent = 'just now'
    }
    return true
  } catch (error) {
    if (row) {
      row.item.dataset.busy = 'false'
      row.action.disabled = false
      row.action.textContent = 'Retry'
      row.action.title = error?.message ?? 'Keeping failed'
      row.sub.dataset.state = 'moved'
      row.sub.textContent = `not kept - ${error?.message ?? 'failed'}`
    }
    return false
  }
}

/** The selected files, in order, repainting as each one lands. */
async function captureSelected() {
  const paths = [...selected]
  const button = el('capture')
  button.disabled = true
  setCapturing(true)

  let done = 0
  let failed = 0
  for (const [index, path] of paths.entries()) {
    button.textContent = `Keeping ${index + 1} of ${paths.length}`
    setCapturingProgress(index + 1, paths.length)
    if (await captureOne(path)) done++
    else failed++
  }

  /*
   * Settle the panel before doing anything asynchronous.
   *
   * The reload that follows takes about a second, and leaving the old text up
   * for that second meant the panel still read "Capturing", "keeping 11 of 11"
   * and "11 of 11 selected" while every row already said Kept. Everything shown
   * here is known locally, so none of it has to wait for a round trip.
   */
  setCapturing(false)
  button.disabled = false
  settleAfterCapture({ done, failed, total: paths.length })

  // The conversation's cards were decided before this ran, so tell them to
  // repaint rather than leaving them offering to keep what is already kept.
  await refreshCards()
  // No force: this just listed every one of these files, so re-listing would
  // only add latency to a state we already know.
  await load({ force: false })

  // A partial failure has to survive the reload, which would otherwise paint
  // over it with a tidy summary.
  if (failed > 0) {
    el('status').classList.remove('hidden')
    el('status').dataset.state = 'moved'
    el('status-text').textContent = `${failed} failed`
  }
}

/** The immediate, local truth: what just happened, in the panel's own words. */
function settleAfterCapture({ done, failed, total }) {
  const button = el('capture')
  const label = el('tether').querySelector('.lbl')

  if (failed > 0) {
    el('tether').dataset.state = 'moved'
    label.textContent = `${failed} of ${total} could not be kept`
    button.textContent = `Retry ${failed}`
    button.classList.remove('hidden')
  } else {
    el('tether').removeAttribute('data-state')
    label.textContent = done === 1 ? 'kept 1 file' : `kept ${done} files`
    button.classList.add('hidden')
  }

  // Rows cleared their own ticks as they landed; the bar has to agree.
  paintSelection()
}

/**
 * The capturing state.
 *
 * Amber, because a capture in flight is a moment when your copy and the
 * conversation disagree - the same meaning the colour carries everywhere else.
 * The tether animates while it runs so the panel reads as working rather than
 * frozen.
 */
function setCapturing(on) {
  document.body.classList.toggle('capturing', on)
  const status = el('status')

  if (on) {
    status.classList.remove('hidden')
    status.dataset.state = 'capturing'
    el('status-text').textContent = 'Capturing'
    el('tether').dataset.state = 'capturing'
    return
  }

  // Both of these were left behind before, so the panel went on saying
  // "Capturing" with a finished list underneath it.
  el('tether').removeAttribute('data-state')
  status.classList.add('hidden')
  status.removeAttribute('data-state')
}

function setCapturingProgress(done, total) {
  el('tether').querySelector('.lbl').textContent = `keeping ${done} of ${total}`
}

async function refreshCards() {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.REFRESH_CARDS })
  } catch {
    /* the tab may have gone; nothing to repaint */
  }
}

// ── Loading ───────────────────────────────────────────────────────────────

async function paintKept() {
  const conversations = await listConversations()
  const files = conversations.reduce((n, c) => n + (c.fileCount ?? 0), 0)
  el('kept').textContent = files
    ? `${files} kept · ${conversations.length} ${conversations.length === 1 ? 'conversation' : 'conversations'}`
    : 'Nothing kept yet'
}

async function load({ force = true } = {}) {
  await paintKept()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab?.id ?? null
  convId = conversationIdFromUrl(tab?.url ?? '')

  if (!convId) {
    el('status').classList.add('hidden')
    const action = document.createElement('button')
    action.className = 'btn'
    action.textContent = 'Open claude.ai'
    action.addEventListener('click', () => chrome.tabs.create({ url: 'https://claude.ai/' }))
    message(
      'Nothing to catch here',
      'Open a Claude conversation and Trove picks up files as they’re written.',
      action,
    )
    return
  }

  let response
  try {
    response = await chrome.tabs.sendMessage(tabId, { type: MSG.LIST_STATUS, force })
  } catch {
    message(
      'Reload the conversation',
      'Trove couldn’t reach this tab. Reload the page and open this panel again.',
    )
    return
  }

  if (response?.ok === false) {
    message('Couldn’t read this conversation', response.error ?? 'Something went wrong.')
    return
  }

  el('conv').classList.remove('hidden')
  el('conv-title').textContent = response.conversation?.title ?? 'This conversation'

  const stored = await listFiles(convId)
  storedByPath = new Map(stored.map((f) => [f.path, f]))
  lastDiff = diffConversation(response.entries ?? [], stored)

  // Anything worth doing starts ticked, so the common case is one click.
  selected = new Set([...lastDiff.new, ...lastDiff.changed].map((e) => e.path))

  paintStatus(lastDiff)
  paintTether({ counts: lastDiff.counts })
  renderList(lastDiff)
}

// ── Wiring ────────────────────────────────────────────────────────────────

el('capture').addEventListener('click', captureSelected)

el('select-all').addEventListener('change', (event) => {
  const actionable = (lastDiff ? [...lastDiff.new, ...lastDiff.changed] : []).map((e) => e.path)
  selected = event.target.checked ? new Set(actionable) : new Set()
  for (const path of actionable) {
    const row = rows.get(path)
    if (row) row.box.checked = selected.has(path)
  }
  paintSelection()
})

el('open-library').addEventListener('click', () => chrome.runtime.openOptionsPage())

el('auto').addEventListener('change', async (event) => {
  await setSetting('autoCapture', event.target.checked)
})

getSettings().then((settings) => {
  el('auto').checked = settings.autoCapture
})

load()
