/**
 * Reader / Editor.
 *
 * A full-screen surface for one file. Render and Source are the same room with
 * the lights moved; the file never changes place, and no control is ever drawn
 * over it.
 */

import {
  getFile,
  putFile,
  deleteFile,
  getConversation,
  listFiles,
  putConversation,
  contentSize,
} from '../lib/db.js'
import { hashContent } from '../lib/hash.js'
import { MSG } from '../lib/messages.js'
import { fileCategory } from '../lib/paths.js'
import { isLocal } from '../lib/diff.js'
import { displayName, displayTitle, isRenamed, normaliseName } from '../lib/naming.js'
import { getSettings, setSetting } from '../lib/settings.js'
import { renderInSandbox, decideRender } from './preview.js'
import { createEditor } from './editor.js'
import { confirmReplaceEdits, confirmDeleteFile, confirmDiscardEdits } from '../ui/dialog.js'
import { exportFile } from './export.js'
import { fileIcon } from '../ui/file-icon.js'
import { openScreenshotModal } from './screenshot-modal.js'
import { makeLocalFile, uniqueName } from '../lib/local-file.js'

const el = (id) => document.getElementById(id)
const params = new URLSearchParams(location.search)
const fileKey = params.get('f')

/**
 * Full screen is the file and nothing else. The only affordance kept is a
 * hatch that fades in when the pointer approaches the top of the window -
 * without it there is no way back and no way to capture what you are looking
 * at, which would make the mode a trap rather than a view.
 */
const fullScreen = params.get('full_screen') === 'true'

const state = { file: null, conversation: null, mode: 'render', dirty: false, wrap: true }
let editor = null
let settings = null

// ── Formatting ────────────────────────────────────────────────────────────

function bytes(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function stamp(ms) {
  if (!ms) return '—'
  return new Date(ms)
    .toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '')
}

// ── Painting ──────────────────────────────────────────────────────────────

function paintTether() {
  const tether = el('tether')
  const label = tether.querySelector('.lbl')
  const conversation = displayTitle(state.conversation)

  if (isLocal(state.file)) {
    tether.dataset.state = 'gone'
    label.textContent = `made in Trove · ${conversation}`
  } else if (state.dirty) {
    tether.dataset.state = 'unsaved'
    label.textContent = 'unsaved changes'
  } else if (state.file?.edited) {
    tether.dataset.state = 'moved'
    label.textContent = 'edited locally'
  } else {
    tether.removeAttribute('data-state')
    label.textContent = `tethered to ${conversation}`
  }
}

function paintName() {
  el('name-text').textContent = displayName(state.file)
  el('renamed-flag').classList.toggle('hidden', !isRenamed(state.file))
  document.title = `${displayName(state.file)} — Trove`
}

function paintLineage() {
  const line = el('lineage')
  line.textContent = ''

  const sep = (glyph) => {
    const s = document.createElement('span')
    s.className = 'sep'
    s.textContent = glyph
    return s
  }

  line.append(document.createTextNode(displayTitle(state.conversation)), sep('›'))
  if (state.file.messageIndex != null) {
    line.append(document.createTextNode(`msg ${state.file.messageIndex}`), sep('›'))
  }

  const path = document.createElement('span')
  path.className = 'path'
  path.textContent = state.file.path
  line.append(path, sep('·'), document.createTextNode(bytes(contentSize(state.file.content))))
  if (state.file.capturedAt) {
    line.append(sep('·'), document.createTextNode(`captured ${stamp(state.file.capturedAt)}`))
  }

  const link = el('open-conv')
  if (state.conversation?.url) {
    link.href = state.conversation.url
    link.classList.remove('hidden')
  } else {
    link.classList.add('hidden')
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
  paintTether()
}

/** Everything we know about this file, stated plainly. */
function paintDetails() {
  const list = el('details-list')
  list.textContent = ''

  const file = state.file
  const rows = [
    ['Name', displayName(file)],
    ...(isRenamed(file) ? [['Original name', file.name]] : []),
    ['Path', file.path],
    ['Type', file.mime || '—'],
    ['Kind', file.kind === 'text' ? 'text' : 'binary'],
    ['Category', fileCategory(file.ext)],
    ['Size held', bytes(contentSize(file.content))],
    ['Origin', isLocal(file) ? 'made in Trove' : 'captured from the conversation'],
    ...(file.note ? [['Note', file.note]] : []),
    ['Size at source', file.remoteSize ? bytes(file.remoteSize) : '—'],
    ['Captured', stamp(file.capturedAt)],
    ['Updated', stamp(file.updatedAt)],
    ['Edited here', file.edited ? 'yes' : 'no'],
    ['Conversation', displayTitle(state.conversation)],
    ['Content hash', file.hash ? `${file.hash.slice(0, 16)}…` : '—'],
  ]

  for (const [label, value] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.className = 'mono'
    dd.textContent = value
    list.append(dt, dd)
  }
}

// ── Loading ───────────────────────────────────────────────────────────────

async function load() {
  settings = await getSettings()
  state.wrap = settings.wrapLines

  const file = await getFile(fileKey)

  if (fullScreen) {
    document.body.classList.add('full-screen')
    if (!file) {
      document.title = 'File not found — Trove'
      return
    }
    state.file = file
    document.title = displayName(file)
    await renderInSandbox(el('paper'), file)
    mountHatch()
    return
  }

  if (!file) {
    el('name-text').textContent = 'File not found'
    el('stage').textContent = ''
    const note = document.createElement('p')
    note.className = 'stage-note'
    note.textContent = 'This file is no longer in your library. It may have been deleted.'
    el('stage').appendChild(note)
    el('mode').classList.add('hidden')
    document.querySelector('.controls')?.classList.add('hidden')
    return
  }

  state.file = file
  state.conversation = await getConversation(file.convId)

  el('glyph').textContent = ''
  el('glyph').appendChild(fileIcon({ ext: file.ext, mime: file.mime, category: fileCategory(file.ext) }, 15))

  paintName()
  paintTether()
  paintLineage()
  paintDetails()

  // A file with no renderer opens on Source, and the toggle disappears rather
  // than showing a disabled state.
  const renderable = decideRender(file).render !== 'unsupported'
  // Nothing to re-pull: this file was never in the conversation.
  el('repull').classList.toggle('hidden', isLocal(file))
  el('mode').classList.toggle('hidden', !renderable)
  el('shot').classList.toggle('hidden', !renderable)
  state.mode = renderable ? settings.defaultView : 'source'
  el('wrap').textContent = state.wrap ? 'Wrap lines' : 'No wrap'
  paintMode()

  if (state.mode === 'render') await renderInSandbox(el('paper'), file)
  else mountEditor()
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
  paintDetails()
  paintLineage()
}

async function discard() {
  if (!(await confirmDiscardEdits())) return
  editor.load(state.file)
  state.dirty = false
  paintDirty()
}

async function repull() {
  if (state.file.edited && !(await confirmReplaceEdits(displayName(state.file)))) return

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
  const name = displayName(state.file)
  if (settings.confirmDelete && !(await confirmDeleteFile(name))) return
  const convId = state.file.convId
  await deleteFile(state.file.id)
  await recount(convId)
  window.close()
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

/** Rename is an inline edit on the label, because the label is the thing. */
function beginRename() {
  const node = el('name-text')
  if (node.isContentEditable) return

  const before = displayName(state.file)
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
    // An empty name means "use the original again" - that is how a rename is
    // undone without a second control for it.
    const typed = normaliseName(node.textContent, { fallback: '' })
    const renamedTo = typed && typed !== state.file.name ? typed : ''
    state.file = { ...state.file, renamedTo, updatedAt: Date.now() }
    await putFile(state.file)
    paintName()
    paintDetails()
    paintLineage()
  }

  const onKey = (event) => {
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

/**
 * Opens the screenshot modal over whatever is on screen - including in full
 * screen, where it is the only piece of Trove that ever appears.
 */
async function screenshot() {
  const base = displayName(state.file).replace(/\.[^.]+$/, '') || 'file'
  await openScreenshotModal({
    suggestedName: `${base}-screenshot`,
    // The frame is what full-page capture scrolls, so it has to be handed over.
    frame: el('paper'),
    onKeep: keepScreenshot,
  })
}

/**
 * File a screenshot in the library, beside the file it was taken of.
 *
 * Numbered rather than overwritten on a name clash: screenshots of the same
 * file get taken repeatedly, and quietly replacing one would be the wrong
 * default for something with no way back.
 */
async function keepScreenshot(blob, name) {
  const convId = state.file.convId
  const existing = await listFiles(convId)
  const taken = existing.map((f) => f.name)

  const record = await makeLocalFile({
    convId,
    name: uniqueName(name, taken),
    content: blob,
    mime: 'image/png',
    note: `Screenshot of ${displayName(state.file)}`,
  })

  await putFile(record)
  await recount(convId)
  return record
}

function goFullScreen() {
  const url = new URL(location.href)
  url.searchParams.set('full_screen', 'true')
  location.href = url.toString()
}

function exitFullScreen() {
  const url = new URL(location.href)
  url.searchParams.delete('full_screen')
  location.href = url.toString()
}

/**
 * Full screen's only affordance.
 *
 * It used to fade in on approach and hide itself again after a couple of
 * seconds, which made it unreliable: it was gone after taking a screenshot,
 * gone after a reload, and gone again a moment after being found. A control you
 * cannot count on being there is worse than one that is always visible.
 *
 * So it stays, dimmed to keep out of the document's way, and comes up to full
 * strength on hover or keyboard focus.
 */
function mountHatch() {
  const hatch = el('hatch')
  hatch.classList.remove('hidden')

  el('hatch-shot').addEventListener('click', screenshot)
  el('hatch-exit').addEventListener('click', exitFullScreen)

  // Say the shortcuts once, here, rather than leaving them undiscoverable.
  el('hatch-shot').title = 'Screenshot (S)'
  el('hatch-exit').title = 'Exit full screen (Esc)'
}

// ── Wiring ────────────────────────────────────────────────────────────────

el('back').addEventListener('click', () => window.close())
el('mode-render').addEventListener('click', () => setMode('render'))
el('mode-source').addEventListener('click', () => setMode('source'))
el('save').addEventListener('click', save)
el('discard').addEventListener('click', discard)
el('repull').addEventListener('click', repull)
el('delete').addEventListener('click', remove)
el('full').addEventListener('click', goFullScreen)
el('shot').addEventListener('click', screenshot)
el('export').addEventListener('click', () => {
  if (state.file) exportFile({ ...state.file, name: displayName(state.file) })
})

el('details').addEventListener('click', () => {
  const open = el('details-panel').classList.toggle('hidden') === false
  el('details').setAttribute('aria-pressed', String(open))
})

el('name-text').addEventListener('click', beginRename)
el('name-text').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !el('name-text').isContentEditable) {
    event.preventDefault()
    beginRename()
  }
})

el('wrap').addEventListener('click', async () => {
  state.wrap = !state.wrap
  el('wrap').textContent = state.wrap ? 'Wrap lines' : 'No wrap'
  editor?.setWrap(state.wrap)
  await setSetting('wrapLines', state.wrap)
})

document.addEventListener('keydown', (event) => {
  // A modal owns the keyboard while it is open.
  if (document.querySelector('.shot-scrim, .tv-scrim')) return

  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    if (state.dirty) save()
    return
  }

  // Bare S takes a screenshot. In full screen there is no toolbar to reach
  // for, and a shortcut leaves the document uncovered until it is wanted.
  if (event.key === 's' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const typing = /^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? '')
    if (!typing && !event.target?.isContentEditable && state.mode !== 'source') {
      event.preventDefault()
      screenshot()
      return
    }
  }

  if (event.key === 'Escape') {
    if (fullScreen) exitFullScreen()
    else if (!state.dirty) window.close()
  }
})

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return
  event.preventDefault()
  event.returnValue = ''
})

load()
