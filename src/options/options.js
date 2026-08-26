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
import { isLocal } from '../lib/diff.js'
import { MSG } from '../lib/messages.js'
import { confirmDeleteConversation, confirmDeleteFile } from '../ui/dialog.js'
import { exportConversation } from './export.js'
import { renderInSandbox } from './preview.js'
import { mark } from '../ui/mark.js'
import { fileIcon } from '../ui/file-icon.js'
import { displayName, displayTitle, isRenamed, normaliseName } from '../lib/naming.js'
import { getSettings, setSetting, resetSettings, DEFAULTS } from '../lib/settings.js'
import { putFile, getFile, deleteFile } from '../lib/db.js'

const el = (id) => document.getElementById(id)
const state = { convId: null, filter: 'all', query: '', selected: null }
let settings = { ...DEFAULTS }

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
  if (isLocal(file)) return false
  const live = liveByConv.get(file.convId)?.get(file.path)
  if (!live) return false
  return live.size !== file.remoteSize || live.created_at !== file.remoteCreatedAt
}

function isGone(file) {
  if (isLocal(file)) return false
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

  if (isLocal(file)) {
    // Made here, so there is no source to agree or disagree with.
    wrap.dataset.state = 'gone'
    label.textContent = 'made in Trove'
  } else if (isGone(file)) {
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
    // Not an image, so show what kind of file it is rather than a blank tile.
    box.appendChild(fileIcon({ ext: file.ext, mime: file.mime, category: fileCategory(file.ext) }, 16))
    box.dataset.glyph = 'true'
  }
  return box
}

/**
 * Rename in place.
 *
 * The label is the only thing a rename touches - a file is still identified by
 * its sandbox path and a conversation by its uuid - so editing the label where
 * it sits is the honest interaction. Blank restores the original.
 */
function editableLabel(node, { current, original, onCommit }) {
  if (node.isContentEditable) return
  const before = current

  node.contentEditable = 'plaintext-only'
  node.classList.add('editing')
  node.focus()
  getSelection()?.selectAllChildren(node)

  const finish = async (commit) => {
    node.contentEditable = 'false'
    node.classList.remove('editing')
    node.removeEventListener('keydown', onKey)
    node.removeEventListener('blur', onBlur)
    if (!commit) {
      node.textContent = before
      return
    }
    const typed = normaliseName(node.textContent, { fallback: '' })
    await onCommit(typed && typed !== original ? typed : '')
  }

  const onKey = (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  }
  const onBlur = () => finish(true)

  node.addEventListener('keydown', onKey)
  node.addEventListener('blur', onBlur)
}

async function renameConversation(conversation, renamedTo) {
  await putConversation({ ...conversation, renamedTo, updatedAt: conversation.updatedAt })
  await render()
}

async function renameFile(file, renamedTo) {
  const stored = await getFile(file.id)
  if (!stored) return
  await putFile({ ...stored, renamedTo, updatedAt: Date.now() })
  await render()
  if (state.selected?.id === file.id) el('detail-name').textContent = renamedTo || stored.name
}

const NS = 'http://www.w3.org/2000/svg'

const ACTION_ICONS = {
  // An eye: look at it.
  preview: ['M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z', 'M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z'],
  // A pencil: change what it is called.
  rename: ['M11.1 2.6l2.3 2.3-7.1 7.1-3 .7.7-3 7.1-7.1Z'],
  // A bin: remove it.
  delete: ['M3 5.2h10', 'M6.4 5.2V3.6h3.2v1.6', 'M4.4 5.2l.6 8h6l.6-8'],
}

function actionButton(kind, title, onClick) {
  const button = document.createElement('button')
  button.className = 'row-act'
  button.dataset.act = kind
  button.title = title
  button.setAttribute('aria-label', title)

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.3')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of ACTION_ICONS[kind]) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  button.appendChild(svg)

  button.addEventListener('click', (event) => {
    // The row is itself a button; without this the click selects as well.
    event.stopPropagation()
    onClick()
  })
  return button
}

/** Delete one file, and keep its conversation's counts honest. */
async function removeFile(file) {
  if (settings.confirmDelete && !(await confirmDeleteFile(displayName(file)))) return

  await deleteFile(file.id)
  const [conversation, remaining] = await Promise.all([
    getConversation(file.convId),
    listFiles(file.convId),
  ])
  if (conversation) {
    await putConversation({
      ...conversation,
      fileCount: remaining.length,
      bytes: remaining.reduce((n, f) => n + contentSize(f.content), 0),
    })
  }
  if (state.selected?.id === file.id) clearSelection()
  await render()
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
    title.appendChild(document.createTextNode(displayTitle(conversation)))

    const sub = document.createElement('div')
    sub.className = 'rail-sub mono'
    sub.textContent = `${conversation.fileCount ?? 0} files · ${ago(conversation.updatedAt)}`

    const text = document.createElement('div')
    text.style.minWidth = '0'
    text.append(title, sub)

    // Discoverable on hover or keyboard focus, rather than hidden behind a
    // right-click nobody would think to try.
    title.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      editableLabel(title, {
        current: displayTitle(conversation),
        original: conversation.title,
        onCommit: (renamedTo) => renameConversation(conversation, renamedTo),
      })
    })

    const rename = document.createElement('span')
    rename.className = 'rail-remove rail-rename'
    rename.setAttribute('role', 'button')
    rename.setAttribute('tabindex', '0')
    rename.title = 'Rename this conversation'
    rename.textContent = '✎'
    const onRename = (event) => {
      event.stopPropagation()
      editableLabel(title, {
        current: displayTitle(conversation),
        original: conversation.title,
        onCommit: (renamedTo) => renameConversation(conversation, renamedTo),
      })
    }
    rename.addEventListener('click', onRename)
    rename.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') onRename(event)
    })

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
    remove.title = `Delete ${displayTitle(conversation)}`
    remove.textContent = '×'
    const onRemove = (event) => {
      event.stopPropagation()
      removeConversation(conversation.id)
    }
    remove.addEventListener('click', onRemove)
    remove.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') onRemove(event)
    })

    item.append(text, rename, save, remove)
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
  const haystack = `${displayName(file)} ${file.name} ${file.ext} ${displayTitle(file.conversation)}`.toLowerCase()
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
    name.textContent = displayName(file)
    name.title = 'Double-click to rename'
    name.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      editableLabel(name, {
        current: displayName(file),
        original: file.name,
        onCommit: (renamedTo) => renameFile(file, renamedTo),
      })
    })
    if (isRenamed(file)) name.dataset.renamed = 'true'
    const conv = document.createElement('div')
    conv.className = 'file-conv'
    conv.textContent = displayTitle(file.conversation)
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

    const actions = document.createElement('div')
    actions.className = 'col-actions'
    actions.append(
      actionButton('preview', `Preview ${displayName(file)}`, () => select(file)),
      actionButton('rename', `Rename ${displayName(file)}`, () =>
        editableLabel(name, {
          current: displayName(file),
          original: file.name,
          onCommit: (renamedTo) => renameFile(file, renamedTo),
        }),
      ),
      actionButton('delete', `Delete ${displayName(file)}`, () => removeFile(file)),
    )

    row.append(fileCell, size, when, source, actions)
    row.setAttribute('aria-selected', String(file.id === state.selected?.id))
    row.addEventListener('click', () => {
      if (settings.openOnClick === 'reader') open(file)
      else select(file)
    })
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
  if (isLocal(file)) {
    wrap.dataset.state = 'gone'
    label.textContent = 'made in Trove'
  } else if (isGone(file)) {
    wrap.dataset.state = 'gone'
    label.textContent = 'no longer in the conversation'
  } else if (hasMoved(file)) {
    wrap.dataset.state = 'moved'
    label.textContent = 'newer version in the conversation'
  } else if (file.edited) {
    label.textContent = 'edited locally'
  } else {
    label.textContent = `tethered to ${displayTitle(file.conversation) || 'its conversation'}`
  }
}

async function select(file) {
  state.selected = file
  el('split').dataset.detail = 'on'
  el('detail-name').textContent = displayName(file)
  el('full-screen').disabled = false
  el('open-reader').disabled = false
  paintDetailTether(file)

  for (const row of el('rows').querySelectorAll('.trow')) {
    row.setAttribute('aria-selected', 'false')
  }
  const index = [...el('rows').querySelectorAll('.trow')].findIndex((r) =>
    r.querySelector('.file-name')?.textContent === displayName(file),
  )
  if (index >= 0) el('rows').querySelectorAll('.trow')[index].setAttribute('aria-selected', 'true')

  await renderInSandbox(el('preview'), file)
}

function clearSelection() {
  state.selected = null
  el('split').dataset.detail = 'off'
  el('detail-name').textContent = ''
  el('full-screen').disabled = true
  el('open-reader').disabled = true
  paintDetailTether(null)
  // Reset the frame even though it is hidden, so the next selection never
  // shows the previous file for a beat before its own render arrives.
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

  if (settings.confirmDelete) {
    const ok = await confirmDeleteConversation({
      title: displayTitle(conversation),
      fileCount: files.length,
      editedCount: files.filter((f) => f.edited).length,
    })
    if (!ok) return
  }

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

// ── Settings ──────────────────────────────────────────────────────────────

const SETTING_FIELDS = [
  {
    key: 'autoCapture',
    label: 'Catch files as Claude writes them',
    hint: 'Trove pulls new and changed files without being asked. Off by default, because writing to your library should be something you chose.',
  },
  {
    key: 'openOnClick',
    label: 'Clicking a file',
    hint: 'Preview keeps you in the list. Reader opens the file in its own tab.',
    options: [
      ['preview', 'Previews it here'],
      ['reader', 'Opens the Reader'],
    ],
  },
  {
    key: 'defaultView',
    label: 'The Reader opens on',
    hint: 'Files with nothing to render always open on Source regardless.',
    options: [
      ['render', 'Render'],
      ['source', 'Source'],
    ],
  },
  { key: 'wrapLines', label: 'Wrap long lines when editing' },
  {
    key: 'confirmDelete',
    label: 'Ask before deleting',
    hint: 'Trove keeps no version history, so deleting is final. Turning this off is for people who would rather not be asked twice.',
  },
  {
    key: 'captureUnchanged',
    label: 'Capture files that have not changed',
    hint: 'Off means a whole-conversation capture only fetches what is new or has moved on.',
  },
]

function buildSettings() {
  const body = el('settings-body')
  body.textContent = ''

  for (const field of SETTING_FIELDS) {
    const row = document.createElement('div')
    row.className = 'setting'

    const text = document.createElement('div')
    text.className = 'setting-text'
    const label = document.createElement('div')
    label.className = 'setting-label'
    label.textContent = field.label
    text.appendChild(label)
    if (field.hint) {
      const hint = document.createElement('div')
      hint.className = 'setting-hint'
      hint.textContent = field.hint
      text.appendChild(hint)
    }

    let control
    if (field.options) {
      control = document.createElement('div')
      control.className = 'seg'
      for (const [value, text_] of field.options) {
        const option = document.createElement('button')
        option.textContent = text_
        option.setAttribute('aria-selected', String(settings[field.key] === value))
        option.addEventListener('click', async () => {
          await setSetting(field.key, value)
          settings = await getSettings()
          buildSettings()
          await renderTable()
        })
        control.appendChild(option)
      }
    } else {
      control = document.createElement('input')
      control.type = 'checkbox'
      control.className = 'setting-toggle'
      control.checked = Boolean(settings[field.key])
      control.setAttribute('aria-label', field.label)
      control.addEventListener('change', async () => {
        await setSetting(field.key, control.checked)
        settings = await getSettings()
      })
    }

    row.append(text, control)
    body.appendChild(row)
  }
}

function toggleSettings(open) {
  const panel = el('settings-panel')
  const show = open ?? panel.classList.contains('hidden')
  panel.classList.toggle('hidden', !show)
  el('settings-button').setAttribute('aria-pressed', String(show))
  if (show) buildSettings()
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

el('settings-button').addEventListener('click', () => toggleSettings())
el('settings-close').addEventListener('click', () => toggleSettings(false))
el('settings-reset').addEventListener('click', async () => {
  await resetSettings()
  settings = await getSettings()
  buildSettings()
  await renderTable()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el('settings-panel').classList.contains('hidden')) {
    toggleSettings(false)
  }
})

getSettings()
  .then((loaded) => {
    settings = loaded
  })
  .then(render)
  .then(refreshRemoteState)
