/**
 * Popup.
 *
 * Copy rule: never says "artifact", "sandbox", or "output directory". It says
 * file, and it says where the file came from. The mechanism is the
 * extension's problem, not the reader's.
 */

import { MSG } from '../lib/messages.js'
import { listFiles, listConversations, contentSize } from '../lib/db.js'
import { diffConversation, STATES } from '../lib/diff.js'
import { getSettings, setSetting } from '../lib/settings.js'
import { conversationIdFromUrl } from '../lib/signal.js'
import { mark } from '../ui/mark.js'

const el = (id) => document.getElementById(id)
const FRESH_MS = 5 * 60 * 1000

let tabId = null
let convId = null
let thumbUrls = []

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

function message(heading, body, action) {
  el('list').textContent = ''
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

function tile(file) {
  const box = document.createElement('div')
  box.className = 'tile'
  if (file.kind === 'binary' && file.mime?.startsWith('image/') && file.content instanceof Blob) {
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

function paintTether({ counts, capturing }) {
  const tether = el('tether')
  const label = tether.querySelector('.lbl')
  const moved = counts.changed + counts.conflict

  if (moved > 0) {
    tether.dataset.state = 'moved'
    label.textContent = `${moved} of ${counts.total} moved on`
    el('repull-chip').classList.remove('hidden')
  } else {
    tether.removeAttribute('data-state')
    label.textContent = capturing
      ? `${counts.total} files · this tab`
      : `${counts.total} files`
    el('repull-chip').classList.add('hidden')
  }
}

function paintStatus({ counts }) {
  const status = el('status')
  const moved = counts.changed + counts.conflict
  status.classList.remove('hidden')

  if (moved > 0) {
    status.dataset.state = 'moved'
    el('status-text').textContent = `${moved} newer`
  } else {
    status.dataset.state = 'live'
    el('status-text').textContent = 'Capturing'
  }
}

function renderList(diff, storedByPath) {
  for (const url of thumbUrls) URL.revokeObjectURL(url)
  thumbUrls = []
  el('list').textContent = ''

  const ordered = [...diff.changed, ...diff.conflict, ...diff.new, ...diff.unchanged]
  if (!ordered.length) {
    message('No files yet', 'This conversation hasn’t produced any files. Trove picks them up as Claude writes them.')
    return
  }

  for (const entry of ordered) {
    const stored = storedByPath.get(entry.path)
    const item = document.createElement('div')
    item.className = 'item'
    item.dataset.fresh = String(Boolean(stored && Date.now() - stored.capturedAt < FRESH_MS))

    const body = document.createElement('div')
    body.className = 'item-body'

    const name = document.createElement('div')
    name.className = 'item-name'
    name.textContent = entry.path.split('/').pop()

    const sub = document.createElement('div')
    sub.className = 'item-sub'
    if (entry.state === STATES.CHANGED || entry.state === STATES.CONFLICT) {
      sub.dataset.state = 'moved'
      sub.textContent = 'newer version in the conversation'
    } else if (entry.state === STATES.NEW) {
      sub.textContent = `${bytes(entry.size)} · not kept yet`
    } else {
      sub.textContent = `${bytes(contentSize(stored?.content))} · ${ago(stored?.capturedAt)}`
    }

    body.append(name, sub)

    const ext = document.createElement('span')
    ext.className = 'ext'
    ext.textContent = entry.name?.split('.').pop() ?? ''

    item.append(tile(stored ?? entry), body, ext)
    el('list').appendChild(item)
  }
}

async function paintKept() {
  const conversations = await listConversations()
  const files = conversations.reduce((n, c) => n + (c.fileCount ?? 0), 0)
  el('kept').textContent = files
    ? `${files} files kept · ${conversations.length} conversations`
    : 'Nothing kept yet'
}

async function load() {
  await paintKept()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab?.id ?? null
  convId = conversationIdFromUrl(tab?.url ?? '')

  if (!convId) {
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
    response = await chrome.tabs.sendMessage(tabId, { type: MSG.LIST_STATUS })
  } catch {
    message('Reload the conversation', 'Trove couldn’t reach this tab. Reload the page and open this panel again.')
    return
  }

  if (response?.ok === false) {
    message('Couldn’t read this conversation', response.error ?? 'Something went wrong.')
    return
  }

  el('conv').classList.remove('hidden')
  el('conv-title').textContent = response.conversation?.title ?? 'This conversation'

  const stored = await listFiles(convId)
  const storedByPath = new Map(stored.map((f) => [f.path, f]))
  const diff = diffConversation(response.entries ?? [], stored)

  paintStatus(diff)
  paintTether({ counts: diff.counts, capturing: true })
  renderList(diff, storedByPath)

  const pending = diff.counts.new + diff.counts.changed
  const capture = el('capture')
  capture.classList.toggle('hidden', pending === 0)
  capture.textContent = diff.counts.new && !diff.counts.changed ? `Keep ${pending}` : `Re-pull ${pending}`
}

async function capture() {
  el('capture').disabled = true
  el('capture').textContent = 'Working…'
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.CAPTURE_ALL })
    await load()
  } catch (error) {
    el('capture').textContent = 'Failed'
    el('capture').title = error?.message ?? ''
  } finally {
    el('capture').disabled = false
  }
}

el('capture').addEventListener('click', capture)
el('repull-chip').addEventListener('click', capture)
el('open-library').addEventListener('click', () => chrome.runtime.openOptionsPage())
el('auto').addEventListener('change', (event) => setSetting('autoCapture', event.target.checked))

getSettings().then((settings) => {
  el('auto').checked = settings.autoCapture
})

load()
