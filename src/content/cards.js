/**
 * Injects Save / Update buttons into the file cards Claude renders in the
 * transcript.
 *
 * All injected markup is namespaced under `cfv-` so it cannot collide with
 * Claude's own styles, and every element is tagged with a data attribute so
 * injection stays idempotent under a mutation observer that fires constantly
 * on a streaming page.
 */

import { matchCard } from '../lib/match-card.js'
import { STATES } from '../lib/diff.js'

const CARD_SELECTOR = '.artifact-block-cell'
const MARK = 'data-cfv-mounted'

const LABELS = {
  [STATES.NEW]: { text: 'Save', title: 'Save this file to your vault' },
  [STATES.UNCHANGED]: { text: 'Saved', title: 'Already saved and up to date' },
  [STATES.CHANGED]: { text: 'Update', title: 'This file changed since you saved it' },
  [STATES.CONFLICT]: { text: 'Update', title: 'You have local edits that updating would replace' },
}

let styleInjected = false

function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.id = 'cfv-styles'
  style.textContent = `
    .cfv-btn {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      padding: 5px 11px;
      border-radius: 7px;
      font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
      letter-spacing: 0.01em;
      cursor: pointer;
      color: #f5f3ee;
      background: rgba(200, 106, 70, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.14);
      transition: background 140ms ease-out, opacity 140ms ease-out;
      vertical-align: middle;
    }
    .cfv-btn:hover { background: rgba(214, 118, 82, 1); }
    .cfv-btn:focus-visible { outline: 2px solid #d69a5a; outline-offset: 2px; }
    .cfv-btn[data-state="unchanged"] {
      background: rgba(120, 130, 118, 0.22);
      color: #cfd6cd;
    }
    .cfv-btn[data-state="changed"] { background: rgba(190, 140, 48, 0.95); }
    .cfv-btn[data-state="conflict"] { background: rgba(170, 90, 130, 0.95); }
    .cfv-btn[disabled] { opacity: 0.55; cursor: default; }
    .cfv-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: currentColor; opacity: 0.9;
    }
    .cfv-picker {
      position: absolute;
      z-index: 2147483000;
      min-width: 240px;
      max-height: 280px;
      overflow-y: auto;
      padding: 6px;
      border-radius: 10px;
      background: #1f1e1c;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      font: 400 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      color: #e9e5dd;
    }
    .cfv-picker-title {
      padding: 6px 8px 8px;
      color: #a8a29a;
      font-size: 11px;
    }
    .cfv-picker button {
      all: unset;
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 7px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .cfv-picker button:hover,
    .cfv-picker button:focus-visible { background: rgba(200, 106, 70, 0.28); }
  `
  document.documentElement.appendChild(style)
}

function readCard(cardEl) {
  const text = cardEl.innerText || ''
  const [first = '', second = ''] = text.split('\n').map((s) => s.trim()).filter(Boolean)
  return { title: first, typeLabel: second }
}

/**
 * Ambiguity fallback: an inline menu of the conversation's files.
 *
 * Deliberately not window.prompt - a modal dialog blocks the whole page, and
 * on a streaming conversation that is a genuinely disruptive thing to do.
 */
function pickFile(anchorEl, entries) {
  return new Promise((resolve) => {
    const menu = document.createElement('div')
    menu.className = 'cfv-picker'

    const heading = document.createElement('div')
    heading.className = 'cfv-picker-title'
    heading.textContent = entries.length ? 'Which file is this?' : 'No files found in this conversation'
    menu.appendChild(heading)

    for (const entry of entries) {
      const option = document.createElement('button')
      option.type = 'button'
      option.textContent = entry.name
      option.addEventListener('click', () => close(entry.path))
      menu.appendChild(option)
    }

    const rect = anchorEl.getBoundingClientRect()
    menu.style.top = `${window.scrollY + rect.bottom + 6}px`
    menu.style.left = `${window.scrollX + Math.max(8, rect.right - 260)}px`
    document.body.appendChild(menu)

    function onDocClick(event) {
      if (!menu.contains(event.target)) close(null)
    }
    function onKey(event) {
      if (event.key === 'Escape') close(null)
    }
    function close(value) {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('keydown', onKey, true)
      menu.remove()
      resolve(value)
    }
    setTimeout(() => {
      document.addEventListener('mousedown', onDocClick, true)
      document.addEventListener('keydown', onKey, true)
      menu.querySelector('button')?.focus()
    }, 0)
  })
}

/**
 * @param {object} options
 * @param {() => Promise<Array>} options.getEntries   live listing entries
 * @param {() => Promise<Map>} options.getStates      path -> state
 * @param {(path: string) => Promise<void>} options.onCapture
 */
export function mountCards({ getEntries, getStates, onCapture }) {
  injectStyles()

  async function decorate(cardEl) {
    if (cardEl.hasAttribute(MARK)) return
    cardEl.setAttribute(MARK, '1')

    const button = document.createElement('button')
    button.className = 'cfv-btn'
    button.type = 'button'

    const dot = document.createElement('span')
    dot.className = 'cfv-dot'
    const label = document.createElement('span')
    button.append(dot, label)

    const card = readCard(cardEl)
    let boundPath = null

    async function refresh() {
      const entries = await getEntries()
      const match = matchCard(card, entries.map((e) => e.path))
      boundPath = match.path

      if (!boundPath) {
        label.textContent = 'Save…'
        button.title = 'Choose which file this card refers to'
        button.dataset.state = 'new'
        return
      }

      const states = await getStates()
      const state = states.get(boundPath) ?? STATES.NEW
      const { text, title } = LABELS[state] ?? LABELS[STATES.NEW]
      label.textContent = text
      button.title = title
      button.dataset.state = state
      button.disabled = state === STATES.UNCHANGED
    }

    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const previous = label.textContent
      button.disabled = true
      label.textContent = 'Saving…'
      try {
        const path = boundPath ?? (await pickFile(button, await getEntries()))
        if (!path) {
          label.textContent = previous
          button.disabled = false
          return
        }
        await onCapture(path)
        // Success is a state change on the row, not a toast.
        label.textContent = 'Saved'
        button.dataset.state = 'unchanged'
      } catch (error) {
        label.textContent = 'Failed'
        button.title = error?.message ?? 'Capture failed'
        button.disabled = false
      }
    })

    // The card's action row is its last flex child; fall back to the card.
    const host = cardEl.querySelector('div:last-child') ?? cardEl
    host.appendChild(button)

    refresh().catch(() => {})
  }

  function scan() {
    for (const cardEl of document.querySelectorAll(CARD_SELECTOR)) {
      decorate(cardEl).catch(() => {})
    }
  }

  let queued = null
  const observer = new MutationObserver(() => {
    // The transcript mutates constantly while streaming; coalesce hard.
    clearTimeout(queued)
    queued = setTimeout(scan, 250)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  scan()

  return () => observer.disconnect()
}
