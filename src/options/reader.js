/**
 * Reader / Editor.
 *
 * A full-screen surface for one file, opened in its own tab. Render and
 * Source are the same room with the lights moved; the file never changes
 * place, and no control is ever drawn over it.
 */

import { getFile, putFile, deleteFile, getConversation, listFiles, putConversation, contentSize } from '../lib/db.js'
import { hashContent } from '../lib/hash.js'
import { MSG } from '../lib/messages.js'
import { renderInSandbox, decideRender } from './preview.js'
import { createEditor } from './editor.js'
import { confirmReplaceEdits, confirmDeleteFile, confirmDiscardEdits } from '../ui/dialog.js'
import { exportFile } from './export.js'

const el = (id) => document.getElementById(id)
const params = new URLSearchParams(location.search)
const fileKey = params.get('f')

const state = { file: null, mode: 'render', dirty: false, wrap: true }
let editor = null

// ── Formatting ────────────────────────────────────────────────────────────

function bytes(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function captured(ms) {
  if (!ms) return ''
  return new Date(ms)
    .toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace(',', '')
}

// ── Painting ──────────────────────────────────────────────────────────────

function paintTether(file, conversationTitle) {
  const tether = el('tether')
  const label = tether.querySelector('.lbl')

  if (file.orphaned) {
    tether.dataset.state = 'gone'
    label.textContent = 'no longer in the conversation'
    return
  }
  if (state.dirty) {
    tether.dataset.state = 'unsaved'
    label.textContent = 'unsaved changes'
    return
  }
  if (file.edited) {
    tether.dataset.state = 'moved'
    label.textContent = 'edited locally'
    return
  }
  tether.removeAttribute('data-state')
  label.textContent = `tethered to ${conversationTitle}`
}

function paintLineage(file, conversation) {
  const line = el('lineage')
  line.textContent = ''

  const parts = [conversation?.title ?? 'Unknown conversation']
  if (file.messageIndex != null) parts.push(`msg ${file.messageIndex}`)

  for (const part of parts) {
    line.append(document.createTextNode(part), sep())
  }

  const path = document.createElement('span')
  path.className = 'path'
  path.textContent = file.path
  line.append(path, dot(), document.createTextNode(bytes(contentSize(file.content))))
  if (file.capturedAt) line.append(dot(), document.createTextNode(`captured ${captured(file.capturedAt)}`))

  const link = el('open-conv')
  if (conversation?.url) {
    link.href = conversation.url
    link.classList.remove('hidden')
  } else {
    link.classList.add('hidden')
  }

  function sep() {
    const s = document.createElement('span')
    s.className = 'sep'
    s.textContent = '›'
    return s
  }
  function dot() {
    const s = document.createElement('span')
    s.className = 'sep'
    s.textContent = '·'
    return s
  }
}

function paintMode() {
  const isSource = state.mode === 'source'
  el('mode-render').setAttribute('aria-selected', String(!isSource))
  el('mode-source').setAttribute('aria-selected', String(isSource))
  el('paper').classList.toggle('hidden', isSource)
  el('source').classList.toggle('hidden', !isSource)
  el('wrap').classList.toggle('hidden', !isSource)
}

function paintDirty() {
  el('dirty-dot').classList.toggle('hidden', !state.dirty)
  el('savebar').classList.toggle('hidden', !state.dirty)
  if (state.dirty && state.file) {
    const now = new Blob([editor.value() ?? '']).size
    el('save-delta').textContent = `${bytes(contentSize(state.file.content))} → ${bytes(now)}`
  }
  if (state.file) paintTether(state.file, el('tether').dataset.conv ?? '')
}

// ── Loading ───────────────────────────────────────────────────────────────

async function load() {
  const file = await getFile(fileKey)
  if (!file) {
    el('name-text').textContent = 'File not found'
    el('stage').textContent = ''
    const note = document.createElement('p')
    note.className = 'stage-note'
    note.textContent = 'This file is no longer in your library. It may have been deleted.'
    el('stage').appendChild(note)
    el('mode').classList.add('hidden')
    return
  }

  state.file = file
  const conversation = await getConversation(file.convId)
  el('tether').dataset.conv = conversation?.title ?? 'its conversation'

  el('name-text').textContent = file.name
  document.title = `${file.name} — Trove`
  paintTether(file, conversation?.title ?? 'its conversation')
  paintLineage(file, conversation)

  // A file with no renderer opens on Source, and the toggle disappears
  // rather than showing a disabled state.
  const renderable = decideRender(file).render !== 'unsupported'
  el('mode').classList.toggle('hidden', !renderable)
  state.mode = renderable ? 'render' : 'source'
  paintMode()

  if (renderable) await renderInSandbox(el('paper'), file)
  if (state.mode === 'source') mountEditor()
}

function mountEditor() {
  if (!editor) {
    editor = createEditor(el('source'), {
      onDirtyChange: (dirty) => {
        state.dirty = dirty
        paintDirty()
      },
      wrap: state.wrap,
    })
  }
  const editable = editor.load(state.file)
  if (!editable) {
    el('source').textContent = ''
    const note = document.createElement('p')
    note.className = 'stage-note'
    note.textContent = 'This file is binary. Use Render to view it.'
    el('source').appendChild(note)
  }
}

// ── Actions ───────────────────────────────────────────────────────────────

async function setMode(mode) {
  if (mode === state.mode) return
  if (state.mode === 'source' && state.dirty && mode === 'render') {
    // Leaving the text is not destructive; the edit stays in the buffer.
  }
  state.mode = mode
  paintMode()
  if (mode === 'source') mountEditor()
  else await renderInSandbox(el('paper'), state.file)
}

async function save() {
  const value = editor.value()
  if (value == null) return
  const updated = {
    ...state.file,
    content: value,
    hash: await hashContent(value),
    edited: true,
    updatedAt: Date.now(),
  }
  await putFile(updated)
  await recount(updated.convId)
  state.file = updated
  editor.markSaved()
  state.dirty = false
  paintDirty()
  paintTether(updated, el('tether').dataset.conv)
}

async function discard() {
  if (!(await confirmDiscardEdits())) return
  editor.load(state.file)
  state.dirty = false
  paintDirty()
}

async function repull() {
  if (state.file.edited && !(await confirmReplaceEdits(state.file.name))) return

  el('repull').disabled = true
  el('repull').textContent = 'Re-pulling…'
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.CAPTURE_FILE,
      convId: state.file.convId,
      path: state.file.path,
    })
    if (response?.ok === false) throw new Error(response.error)
    state.dirty = false
    await load()
    if (state.mode === 'source') mountEditor()
  } catch (error) {
    el('repull').textContent = 'Re-pull failed'
    el('repull').title = error.message
    return
  } finally {
    el('repull').disabled = false
  }
  el('repull').textContent = 'Re-pull'
}

async function remove() {
  if (!(await confirmDeleteFile(state.file.name))) return
  const convId = state.file.convId
  await deleteFile(state.file.id)
  await recount(convId)
  close()
}

/** Keep the conversation's counts honest after any write. */
async function recount(convId) {
  const [conversation, files] = await Promise.all([getConversation(convId), listFiles(convId)])
  if (!conversation) return
  await putConversation({
    ...conversation,
    fileCount: files.length,
    bytes: files.reduce((n, f) => n + contentSize(f.content), 0),
  })
}

function close() {
  window.close()
}

// ── Wiring ────────────────────────────────────────────────────────────────

el('back').addEventListener('click', close)
el('mode-render').addEventListener('click', () => setMode('render'))
el('mode-source').addEventListener('click', () => setMode('source'))
el('save').addEventListener('click', save)
el('discard').addEventListener('click', discard)
el('repull').addEventListener('click', repull)
el('export').addEventListener('click', () => {
  // "Save a copy", not "Export" - it writes a file to disk, and that is the
  // only direction anything ever travels out of Trove.
  if (state.file) exportFile(state.file)
})
el('delete').addEventListener('click', remove)
el('wrap').addEventListener('click', () => {
  state.wrap = !state.wrap
  el('wrap').textContent = state.wrap ? 'Wrap lines' : 'No wrap'
  editor?.setWrap(state.wrap)
})

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    if (state.dirty) save()
  }
  if (event.key === 'Escape' && !state.dirty) close()
})

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return
  event.preventDefault()
  event.returnValue = ''
})

load()
