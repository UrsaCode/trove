/**
 * Library - the options page.
 *
 * Two panes: conversations on the rail, files in a table. Selecting a file
 * opens the Reader in its own tab, because a captured document deserves the
 * whole window rather than a third of one.
 */

import {
  listConversations,
  listFiles,
  getConversation,
  putConversation,
  deleteConversation,
  contentSize,
} from '../lib/db.js'
import { fileCategory } from '../lib/paths.js'
import { MSG } from '../lib/messages.js'
import { confirmDeleteConversation } from '../ui/dialog.js'
import { exportConversation } from './export.js'
import { renderInSandbox } from './preview.js'
import { mark } from '../ui/mark.js'

const el = (id) => document.getElementById(id)
const state = { convId: null, filter: 'all', query: '', selected: null }

/** Object URLs for row thumbnails, revoked whenever the table is rebuilt. */
let thumbUrls = []

/**
 * Last known live listing per conversation, keyed path -> entry. Populated by
 * a passive peek at open claude.ai tabs; empty means "we have no idea", which
 * is rendered as tethered rather than as a false divergence claim.
 */
const liveByConv = new Map()

/** Has the source moved on from what we hold? */
function hasMoved(file) {
  const live = liveByConv.get(file.convId)?.get(file.path)
  if (!live) return false
  return live.size !== file.remoteSize || live.created_at !== file.remoteCreatedAt
}

function isGone(file) {
  const live = liveByConv.get(file.convId)
  return Boolean(live) && !live.has(file.path)
}

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
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  const days = Math.floor(seconds / 86400)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 28) return `${Math.floor(days / 7)}w ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// ── The tether ────────────────────────────────────────────────────────────

/**
 * The Source column. This is the only place colour appears in the list, so
 * the state a row is in has to be readable from this element alone.
 */
function tetherFor(file) {
  const wrap = document.createElement('div')
  wrap.className = 'tether'

  const node = document.createElement('span')
  node.className = 'node'
  const wire = document.createElement('span')
  wire.className = 'wire'
  const label = document.createElement('span')
  label.className = 'lbl'

  if (isGone(file)) {
    wrap.dataset.state = 'gone'
    label.textContent = 'no longer there'
  } else if (hasMoved(file)) {
    wrap.dataset.state = 'moved'
    label.textContent = file.messageIndex ? `newer in msg ${file.messageIndex}` : 'newer version'
  } else if (file.edited) {
    label.textContent = 'edited locally'
  } else {
    label.textContent = 'tethered'
  }

  wrap.append(node, wire, label)
  return wrap
}

function tile(file) {
  const box = document.createElement('div')
  box.className = 'tile'

  if (file.kind === 'binary' && file.mime?.startsWith('image/')) {
    const url = URL.createObjectURL(file.content)
    thumbUrls.push(url)
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    box.appendChild(img)
  } else {
    const glyph = document.createElement('span')
    glyph.className = 'glyph'
    box.appendChild(glyph)
  }
  return box
}

// ── Rail ──────────────────────────────────────────────────────────────────

async function renderRail() {
  const conversations = await listConversations()
  const totalFiles = conversations.reduce((n, c) => n + (c.fileCount ?? 0), 0)
  const totalBytes = conversations.reduce((n, c) => n + (c.bytes ?? 0), 0)

  el('all-sub').textContent = `${totalFiles} files · ${conversations.length} conversations`
  el('kept').textContent = `${bytes(totalBytes)} kept locally`
  // Chrome grants unlimited storage; the meter is a sense of scale, not a cap.
  el('meter-fill').style.width = `${Math.min(100, (totalBytes / (50 * 1024 * 1024)) * 100)}%`

  el('all-files').setAttribute('aria-selected', String(state.convId === null))

  const list = el('conversations')
  list.textContent = ''

  for (const conversation of conversations) {
    const item = document.createElement('button')
    item.className = 'rail-item'
    item.setAttribute('aria-selected', String(conversation.id === state.convId))

    const title = document.createElement('div')
    title.className = 'rail-title'
    if (conversation.hasMoved) {
      const dot = document.createElement('span')
      dot.className = 'moved-dot'
      title.appendChild(dot)
    }
    title.appendChild(document.createTextNode(conversation.title))

    const sub = document.createElement('div')
    sub.className = 'rail-sub mono'
    sub.textContent = `${conversation.fileCount ?? 0} files · ${ago(conversation.updatedAt)}`

    const text = document.createElement('div')
    text.style.minWidth = '0'
    text.append(title, sub)

    // Discoverable on hover or keyboard focus, rather than hidden behind a
    // right-click nobody would think to try.
    const save = document.createElement('span')
    save.className = 'rail-remove rail-save'
    save.setAttribute('role', 'button')
    save.setAttribute('tabindex', '0')
    save.title = `Save all ${conversation.fileCount ?? 0} files as a zip`
    save.textContent = '⤓'
    const onSave = async (event) => {
      event.stopPropagation()
      const files = await listFiles(conversation.id)
      if (files.length) await exportConversation(conversation, files)
    }
    save.addEventListener('click', onSave)
    save.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') onSave(event)
    })

    const remove = document.createElement('span')
    remove.className = 'rail-remove'
    remove.setAttribute('role', 'button')
    remove.setAttribute('tabindex', '0')
    remove.title = `Delete ${conversation.title}`
    remove.textContent = '×'
    const onRemove = (event) => {
      event.stopPropagation()
      removeConversation(conversation.id)
    }
    remove.addEventListener('click', onRemove)
    remove.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') onRemove(event)
    })

    item.append(text, save, remove)
    item.addEventListener('click', () => {
      state.convId = conversation.id
      render()
    })
    list.appendChild(item)
  }
}

// ── Table ─────────────────────────────────────────────────────────────────

async function collectFiles() {
  const conversations = await listConversations()
  const byId = new Map(conversations.map((c) => [c.id, c]))
  const chosen = state.convId ? conversations.filter((c) => c.id === state.convId) : conversations

  const rows = []
  for (const conversation of chosen) {
    for (const file of await listFiles(conversation.id)) {
      rows.push({ ...file, conversation: byId.get(file.convId) })
    }
  }
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

function matches(file) {
  if (state.filter !== 'all' && fileCategory(file.ext) !== state.filter) return false
  if (!state.query) return true
  const haystack = `${file.name} ${file.ext} ${file.conversation?.title ?? ''}`.toLowerCase()
  return haystack.includes(state.query)
}

async function renderTable() {
  for (const url of thumbUrls) URL.revokeObjectURL(url)
  thumbUrls = []

  const rows = (await collectFiles()).filter(matches)
  const body = el('rows')
  body.textContent = ''

  if (!rows.length) {
    body.appendChild(emptyState())
    return
  }

  for (const file of rows) {
    const row = document.createElement('button')
    row.className = 'trow'

    const fileCell = document.createElement('div')
    fileCell.className = 'col-file'
    const text = document.createElement('div')
    text.style.minWidth = '0'
    const name = document.createElement('div')
    name.className = 'file-name'
    name.textContent = file.name
    const conv = document.createElement('div')
    conv.className = 'file-conv'
    conv.textContent = file.conversation?.title ?? ''
    text.append(name, conv)
    fileCell.append(tile(file), text)

    const size = document.createElement('div')
    size.className = 'col-size'
    size.textContent = bytes(contentSize(file.content))

    const when = document.createElement('div')
    when.className = 'col-when'
    when.textContent = ago(file.capturedAt)

    const source = document.createElement('div')
    source.className = 'col-src'
    source.appendChild(tetherFor(file))

    if (hasMoved(file)) {
      const chip = document.createElement('button')
      chip.className = 'repull-chip'
      chip.textContent = 'Re-pull'
      chip.title = 'Open this file to pull the newer version'
      chip.addEventListener('click', (event) => {
        event.stopPropagation()
        open(file)
      })
      source.appendChild(chip)
    }

    row.append(fileCell, size, when, source)
    row.setAttribute('aria-selected', String(file.id === state.selected?.id))
    row.addEventListener('click', () => select(file))
    row.addEventListener('dblclick', () => open(file))
    body.appendChild(row)
  }

  // Keep a selection alive across re-renders; otherwise the preview would
  // blank every time the table refreshes on window focus.
  const stillHere = rows.find((f) => f.id === state.selected?.id)
  if (stillHere) state.selected = stillHere
  else if (state.selected) clearSelection()
}

// ── Preview ───────────────────────────────────────────────────────────────

function paintDetailTether(file) {
  const wrap = el('detail-tether')
  const label = wrap.querySelector('.lbl')
  wrap.removeAttribute('data-state')

  if (!file) {
    label.textContent = ''
    return
  }
  if (isGone(file)) {
    wrap.dataset.state = 'gone'
    label.textContent = 'no longer in the conversation'
  } else if (hasMoved(file)) {
    wrap.dataset.state = 'moved'
    label.textContent = 'newer version in the conversation'
  } else if (file.edited) {
    label.textContent = 'edited locally'
  } else {
    label.textContent = `tethered to ${file.conversation?.title ?? 'its conversation'}`
  }
}

async function select(file) {
  state.selected = file
  el('detail-name').textContent = file.name
  el('full-screen').disabled = false
  el('open-reader').disabled = false
  paintDetailTether(file)

  for (const row of el('rows').querySelectorAll('.trow')) {
    row.setAttribute('aria-selected', 'false')
  }
  const index = [...el('rows').querySelectorAll('.trow')].findIndex((r) =>
    r.querySelector('.file-name')?.textContent === file.name,
  )
  if (index >= 0) el('rows').querySelectorAll('.trow')[index].setAttribute('aria-selected', 'true')

  await renderInSandbox(el('preview'), file)
}

function clearSelection() {
  state.selected = null
  el('detail-name').textContent = ''
  el('full-screen').disabled = true
  el('open-reader').disabled = true
  paintDetailTether(null)
  renderInSandbox(el('preview'), null)
}

function emptyState() {
  const wrap = document.createElement('div')
  wrap.className = 'empty'

  const heading = document.createElement('h2')
  const body = document.createElement('p')

  if (state.query || state.filter !== 'all') {
    heading.textContent = 'Nothing matches'
    body.textContent = 'Try a different search, or switch the filter back to All.'
  } else {
    heading.textContent = 'The tray is empty'
    body.textContent =
      'Next time Claude writes a file in a conversation, Trove catches it and it shows up here.'
  }

  wrap.append(mark(34), heading, body)
  return wrap
}

// ── Actions ───────────────────────────────────────────────────────────────

/** The Reader: the file with its bands, where editing and re-pulling live. */
function open(file) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`options/reader.html?f=${encodeURIComponent(file.id)}`),
  })
}

/** Full screen: the file alone, with nothing of the extension around it. */
function openFullScreen(file) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(
      `options/reader.html?f=${encodeURIComponent(file.id)}&full_screen=true`,
    ),
  })
}

async function removeConversation(convId) {
  const [conversation, files] = await Promise.all([getConversation(convId), listFiles(convId)])
  if (!conversation) return

  const ok = await confirmDeleteConversation({
    title: conversation.title,
    fileCount: files.length,
    editedCount: files.filter((f) => f.edited).length,
  })
  if (!ok) return

  await deleteConversation(convId)
  if (state.convId === convId) state.convId = null
  render()
}

/**
 * Ask each conversation's tab what its live files look like, so the rail and
 * the Source column can show divergence without the user opening anything.
 * Best effort: a conversation with no open tab simply stays as last known.
 */
async function refreshRemoteState() {
  const conversations = await listConversations()
  let changed = false

  for (const conversation of conversations) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.PEEK,
        convId: conversation.id,
      })
      if (!response?.ok) continue

      liveByConv.set(conversation.id, new Map((response.entries ?? []).map((e) => [e.path, e])))

      const stored = await listFiles(conversation.id)
      const moved = stored.some(hasMoved)
      if (conversation.hasMoved !== moved) {
        await putConversation({ ...conversation, hasMoved: moved })
      }
      changed = true
    } catch {
      /* no tab for this conversation; leave its last known state alone */
    }
  }
  if (changed) await render()
}

// ── Render ────────────────────────────────────────────────────────────────

async function render() {
  await renderRail()
  await renderTable()
}

// ── Wiring ────────────────────────────────────────────────────────────────

el('all-files').addEventListener('click', () => {
  state.convId = null
  render()
})

el('full-screen').addEventListener('click', () => {
  if (state.selected) openFullScreen(state.selected)
})

el('open-reader').addEventListener('click', () => {
  if (state.selected) open(state.selected)
})

el('search').addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase()
  renderTable()
})

el('filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip')
  if (!chip) return
  state.filter = chip.dataset.kind
  for (const other of el('filters').querySelectorAll('.chip')) {
    other.setAttribute('aria-selected', String(other === chip))
  }
  renderTable()
})

// Reader tabs write to the same database; refresh when focus comes back.
window.addEventListener('focus', render)

render().then(refreshRemoteState)
