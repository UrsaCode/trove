/**
 * Popup: what is in this conversation, and what is new.
 *
 * Answers "what's here and what's new" without scrolling in the common case.
 * Network work happens in the content script; the popup only asks.
 */

import { MSG } from '../lib/messages.js'
import { listFiles } from '../lib/db.js'
import { diffConversation, STATES } from '../lib/diff.js'
import { getSettings, setSetting } from '../lib/settings.js'
import { conversationIdFromUrl } from '../lib/signal.js'

const el = (id) => document.getElementById(id)

const LABEL = {
  [STATES.NEW]: 'new',
  [STATES.CHANGED]: 'changed',
  [STATES.UNCHANGED]: 'saved',
  [STATES.CONFLICT]: 'edited',
}

let tabId = null
let convId = null

function message(heading, body) {
  el('list').textContent = ''
  const wrap = document.createElement('div')
  wrap.className = 'message'
  const strong = document.createElement('strong')
  strong.textContent = heading
  wrap.append(strong, document.createTextNode(body))
  el('list').appendChild(wrap)
}

function renderList(diff) {
  el('list').textContent = ''
  const ordered = [...diff.new, ...diff.changed, ...diff.conflict, ...diff.unchanged]

  if (!ordered.length) {
    message('No files here', 'This conversation has not produced any files yet.')
    return
  }

  for (const entry of ordered) {
    const item = document.createElement('div')
    item.className = 'item'
    item.dataset.state = entry.state

    const name = document.createElement('span')
    name.className = 'item-name'
    name.textContent = entry.path.split('/').pop()

    const tag = document.createElement('span')
    tag.className = 'item-tag'
    tag.textContent = LABEL[entry.state] ?? entry.state

    item.append(name, tag)
    el('list').appendChild(item)
  }
}

function renderSummary(counts) {
  const parts = []
  if (counts.new) parts.push(`${counts.new} new`)
  if (counts.changed) parts.push(`${counts.changed} changed`)
  if (counts.conflict) parts.push(`${counts.conflict} edited`)
  if (counts.unchanged) parts.push(`${counts.unchanged} saved`)
  el('summary').textContent = parts.join(' · ') || 'Nothing to capture'
  el('capture').disabled = !(counts.new || counts.changed)
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab?.id ?? null
  convId = conversationIdFromUrl(tab?.url ?? '')

  if (!convId) {
    el('conv-title').textContent = 'Not a conversation'
    el('summary').textContent = ''
    el('capture').disabled = true
    message('Open a Claude conversation', 'This panel shows the files in whichever claude.ai conversation you are viewing.')
    return
  }

  let response
  try {
    response = await chrome.tabs.sendMessage(tabId, { type: MSG.LIST_STATUS })
  } catch {
    el('conv-title').textContent = 'Cannot reach the page'
    el('capture').disabled = true
    message('Reload the conversation', 'The extension could not talk to this tab. Reload the page and open this panel again.')
    return
  }

  if (response?.ok === false) {
    el('conv-title').textContent = 'Something went wrong'
    el('capture').disabled = true
    message('Could not list files', response.error ?? 'Unknown error.')
    return
  }

  el('conv-title').textContent = response.conversation?.title ?? 'Conversation'

  const stored = await listFiles(convId)
  const diff = diffConversation(response.entries ?? [], stored)
  renderSummary(diff.counts)
  renderList(diff)
}

el('capture').addEventListener('click', async () => {
  el('capture').disabled = true
  el('capture').textContent = 'Capturing…'
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: MSG.CAPTURE_ALL })
    el('capture').textContent = result?.saved ? `Captured ${result.saved}` : 'Nothing to capture'
    await load()
  } catch (error) {
    el('capture').textContent = 'Capture failed'
    el('capture').title = error?.message ?? ''
  }
})

el('open-library').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

el('auto').addEventListener('change', (event) => {
  setSetting('autoCapture', event.target.checked)
})

getSettings().then((settings) => {
  el('auto').checked = settings.autoCapture
})

load()
