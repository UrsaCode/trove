/**
 * Options page controller: the library.
 *
 * Reads IndexedDB directly (same extension origin as the service worker) and
 * routes anything needing claude.ai through the worker, which finds or opens a
 * tab whose content script is same-origin with Claude.
 */

import {
  listConversations,
  listFiles,
  getFile,
  putFile,
  deleteFile,
  deleteConversation,
  getConversation,
  putConversation,
  contentSize,
} from '../lib/db.js'
import { hashContent } from '../lib/hash.js'
import { MSG } from '../lib/messages.js'
import { STATES } from '../lib/diff.js'
import { renderInSandbox } from './preview.js'
import { createEditor } from './editor.js'
import { exportFile, exportConversation } from './export.js'

const el = (id) => document.getElementById(id)
const panes = {
  conversations: el('conversations'),
  files: el('files'),
  totals: el('totals'),
  filesEyebrow: el('files-eyebrow'),
  conflict: el('conflict'),
}

const state = { convId: null, fileId: null, tab: 'preview', dirty: false }

let editor = null

// ── Formatting ────────────────────────────────────────────────────────────

const bytes = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const when = (ms) => {
  if (!ms) return ''
  const days = Math.floor((Date.now() - ms) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

const STATE_LABEL = {
  [STATES.NEW]: 'new',
  [STATES.UNCHANGED]: 'current',
  [STATES.CHANGED]: 'changed',
  [STATES.CONFLICT]: 'edited',
  [STATES.ORPHANED]: 'gone',
}

/** A file's state from what we hold alone - no network. */
function localState(file) {
  if (file.orphaned) return STATES.ORPHANED
  if (file.edited) return STATES.CONFLICT
  return STATES.UNCHANGED
}

// ── Rendering ─────────────────────────────────────────────────────────────

function row({ selected, stateName, name, meta }) {
  const button = document.createElement('button')
  button.className = 'row'
  button.type = 'button'
  button.setAttribute('role', 'option')
  button.setAttribute('aria-selected', String(Boolean(selected)))
  if (stateName) button.dataset.state = stateName

  const title = document.createElement('div')
  title.className = 'row-name'
  title.textContent = name

  const sub = document.createElement('div')
  sub.className = 'row-meta'
  sub.append(...meta)

  button.append(title, sub)
  return button
}

function tag(stateName) {
  const span = document.createElement('span')
  span.className = 'tag'
  span.dataset.state = stateName
  span.textContent = STATE_LABEL[stateName] ?? stateName
  return span
}

function text(value) {
  return document.createTextNode(value)
}

async function renderConversations() {
  const conversations = await listConversations()
  panes.conversations.textContent = ''

  const totalFiles = conversations.reduce((n, c) => n + (c.fileCount ?? 0), 0)
  const totalBytes = conversations.reduce((n, c) => n + (c.bytes ?? 0), 0)
  panes.totals.textContent = conversations.length
    ? `${conversations.length} conversations · ${totalFiles} files · ${bytes(totalBytes)}`
    : ''

  if (!conversations.length) {
    renderFirstRun()
    return
  }

  for (const conversation of conversations) {
    const item = row({
      selected: conversation.id === state.convId,
      name: conversation.title,
      meta: [
        text(`${conversation.fileCount ?? 0} files · ${bytes(conversation.bytes ?? 0)} · `),
        text(when(conversation.updatedAt)),
      ],
    })
    item.addEventListener('click', () => selectConversation(conversation.id))
    panes.conversations.appendChild(item)
  }

  if (!state.convId) await selectConversation(conversations[0].id)
}

function renderFirstRun() {
  panes.files.textContent = ''
  const empty = document.createElement('div')
  empty.className = 'empty'
  empty.innerHTML = `
    <h2>Nothing captured yet</h2>
    <p>Files Claude generates in a conversation live only inside that conversation. Capture them here and they are yours.</p>
    <ol>
      <li>Open a conversation on <code>claude.ai</code> and click <strong>Save</strong> on any file card.</li>
      <li>Or click the extension icon in the toolbar and choose <strong>Capture all</strong>.</li>
    </ol>
  `
  panes.conversations.appendChild(empty)
}

async function renderFiles() {
  panes.files.textContent = ''
  if (!state.convId) return

  const [conversation, files] = await Promise.all([
    getConversation(state.convId),
    listFiles(state.convId),
  ])
  panes.filesEyebrow.textContent = conversation ? `${files.length} files` : 'Files'

  if (!files.length) {
    const note = document.createElement('p')
    note.className = 'note'
    note.textContent = 'This conversation has no captured files.'
    panes.files.appendChild(note)
    return
  }

  for (const file of files) {
    const stateName = localState(file)
    const meta = [text(`${bytes(contentSize(file.content))} · `), tag(stateName)]

    // The signature: when the remote moved, show the byte delta - the actual
    // number the diff compares.
    if (file.remoteSize && contentSize(file.content) !== file.remoteSize) {
      const delta = document.createElement('span')
      delta.className = 'delta'
      delta.textContent = `${file.remoteSize.toLocaleString()} B`
      meta.push(delta)
    }

    const item = row({ selected: file.id === state.fileId, stateName, name: file.name, meta })
    item.addEventListener('click', () => selectFile(file.id))
    panes.files.appendChild(item)
  }
}

async function renderDetail() {
  const file = state.fileId ? await getFile(state.fileId) : null

  panes.conflict.classList.toggle('hidden', !file?.edited)
  if (file?.edited) {
    panes.conflict.textContent =
      'You have edited this file here. Updating it from claude.ai will replace your changes.'
  }

  el('save-edit').classList.toggle('hidden', state.tab !== 'code')
  el('save-edit').disabled = !state.dirty

  for (const id of ['update-file', 'export-file', 'delete-file']) el(id).disabled = !file

  if (state.tab === 'preview') {
    el('preview').classList.remove('hidden')
    el('editor').classList.add('hidden')
    await renderInSandbox(el('preview'), file)
  } else {
    el('preview').classList.add('hidden')
    el('editor').classList.remove('hidden')
    const editable = editor.load(file)
    if (!editable) {
      el('editor').textContent = ''
      const note = document.createElement('p')
      note.className = 'note'
      note.textContent = file
        ? 'This file is binary. Use the Preview tab to view it.'
        : 'Select a file.'
      el('editor').appendChild(note)
    }
  }
}

// ── Selection ─────────────────────────────────────────────────────────────

async function selectConversation(convId) {
  if (state.dirty && !confirmDiscard()) return
  state.convId = convId
  state.fileId = null
  await renderFiles()
  await renderDetail()
  markSelection(panes.conversations, convId, (c) => c)
}

async function selectFile(fileId) {
  if (state.dirty && !confirmDiscard()) return
  state.fileId = fileId
  await renderFiles()
  await renderDetail()
}

function markSelection(container) {
  // Re-render is cheap here; conversations re-render on demand.
  renderConversations()
}

function confirmDiscard() {
  const ok = window.confirm('You have unsaved changes in the editor. Discard them?')
  if (ok) state.dirty = false
  return ok
}

// ── Actions ───────────────────────────────────────────────────────────────

async function updateFile(fileId) {
  const file = await getFile(fileId)
  if (!file) return

  // Overwrite has no history behind it, so a locally edited file must be an
  // explicit decision, never a side effect of clicking Update.
  if (file.edited) {
    const proceed = window.confirm(
      `"${file.name}" has local edits.\n\nUpdating replaces them with the current version from claude.ai. This cannot be undone.\n\nUpdate anyway?`,
    )
    if (!proceed) return
  }

  const response = await chrome.runtime.sendMessage({
    type: MSG.CAPTURE_FILE,
    convId: file.convId,
    path: file.path,
  })
  if (response?.ok === false) {
    window.alert(`Update failed: ${response.error}`)
    return
  }
  await refresh()
}

async function updateAll() {
  if (!state.convId) return
  const response = await chrome.runtime.sendMessage({
    type: MSG.SYNC_CHECK,
    convId: state.convId,
    onlyChanged: true,
  })
  if (response?.ok === false) window.alert(`Update failed: ${response.error}`)
  await refresh()
}

async function saveEdit() {
  const value = editor.value()
  if (value == null || !state.fileId) return
  const file = await getFile(state.fileId)
  await putFile({
    ...file,
    content: value,
    hash: await hashContent(value),
    edited: true,
    updatedAt: Date.now(),
  })
  editor.markSaved()
  await refresh()
}

async function removeFile() {
  const file = await getFile(state.fileId)
  if (!file) return
  if (!window.confirm(`Delete "${file.name}" from your vault? This cannot be undone.`)) return
  await deleteFile(file.id)

  const remaining = await listFiles(file.convId)
  const conversation = await getConversation(file.convId)
  if (conversation) {
    await putConversation({
      ...conversation,
      fileCount: remaining.length,
      bytes: remaining.reduce((n, f) => n + contentSize(f.content), 0),
    })
  }
  state.fileId = null
  await refresh()
}

async function removeConversation() {
  if (!state.convId) return
  const conversation = await getConversation(state.convId)
  if (
    !window.confirm(
      `Delete "${conversation?.title}" and all ${conversation?.fileCount ?? 0} of its files? This cannot be undone.`,
    )
  )
    return
  await deleteConversation(state.convId)
  state.convId = null
  state.fileId = null
  await refresh()
}

async function refresh() {
  await renderConversations()
  await renderFiles()
  await renderDetail()
}

// ── Wiring ────────────────────────────────────────────────────────────────

function setTab(tab) {
  state.tab = tab
  el('tab-preview').setAttribute('aria-selected', String(tab === 'preview'))
  el('tab-code').setAttribute('aria-selected', String(tab === 'code'))
  renderDetail()
}

editor = createEditor(el('editor'), {
  onDirtyChange: (dirty) => {
    state.dirty = dirty
    el('save-edit').disabled = !dirty
  },
})

el('tab-preview').addEventListener('click', () => setTab('preview'))
el('tab-code').addEventListener('click', () => setTab('code'))
el('save-edit').addEventListener('click', saveEdit)
el('update-file').addEventListener('click', () => updateFile(state.fileId))
el('update-all').addEventListener('click', updateAll)
el('delete-file').addEventListener('click', removeFile)
el('delete-conv').addEventListener('click', removeConversation)
el('export-file').addEventListener('click', async () => {
  const file = await getFile(state.fileId)
  if (file) exportFile(file)
})
el('export-all').addEventListener('click', async () => {
  if (!state.convId) return
  const [conversation, files] = await Promise.all([
    getConversation(state.convId),
    listFiles(state.convId),
  ])
  if (files.length) await exportConversation(conversation, files)
})

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return
  event.preventDefault()
  event.returnValue = ''
})

refresh()
