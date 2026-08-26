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

/*
 * Copy follows the popup's rule: say file, say where it came from, never say
 * artifact or sandbox. "Kept" rather than "Saved", because the point is that
 * Trove is holding onto it, not that a save happened.
 */
const LABELS = {
  [STATES.NEW]: { text: 'Keep', title: 'Keep this file in Trove' },
  [STATES.UNCHANGED]: { text: 'Kept', title: 'Kept, and matching the conversation' },
  [STATES.CHANGED]: { text: 'Re-pull', title: 'The conversation has a newer version' },
  [STATES.CONFLICT]: { text: 'Re-pull', title: 'You edited this in Trove; re-pulling replaces your copy' },
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
      color: #14161b;
      background: #5fd3bc;
      border: 1px solid transparent;
      transition: background 140ms ease-out, opacity 140ms ease-out;
      vertical-align: middle;
    }
    .cfv-btn:hover { background: #74dcc7; }
    .cfv-btn:focus-visible { outline: 2px solid #5fd3bc; outline-offset: 2px; }
    /* Kept and matching: no colour, because nothing needs attention. */
    .cfv-btn[data-state="unchanged"] {
      background: rgba(124, 132, 146, 0.16);
      color: #b9bec7;
    }
    /* Amber is divergence, wherever it appears. */
    .cfv-btn[data-state="changed"],
    .cfv-btn[data-state="conflict"] { background: #e5a93c; color: #14161b; }
    .cfv-btn[disabled] { opacity: 0.55; cursor: default; }
    .cfv-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: currentColor; opacity: 0.9;
      flex: 0 0 auto;
      transition: width 120ms ease-out, height 120ms ease-out;
    }
    /*
     * Working state. An ellipsis read as punctuation rather than as progress,
     * so the marker becomes a turning ring and the button dims.
     */
    .cfv-btn[data-busy="true"] { opacity: .8; cursor: progress }
    .cfv-btn[data-busy="true"] .cfv-dot {
      width: 10px; height: 10px;
      background: none;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-right-color: transparent;
      animation: cfv-spin .6s linear infinite;
    }
    @keyframes cfv-spin { to { transform: rotate(360deg) } }
    @media (prefers-reduced-motion: reduce) {
      .cfv-btn[data-busy="true"] .cfv-dot { animation: none }
    }
    .cfv-picker {
      position: absolute;
      z-index: 2147483000;
      min-width: 240px;
      max-height: 280px;
      overflow-y: auto;
      padding: 6px;
      border-radius: 10px;
      background: #171a20;
      border: 1px solid #2a303a;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      font: 400 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      color: #e9e7e2;
    }
    .cfv-picker-title {
      padding: 6px 8px 8px;
      color: #7c8492;
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
    .cfv-picker button:focus-visible { background: rgba(95, 211, 188, 0.18); }
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
export function mountCards({ getEntries, getStates, getCachedStates = () => null, onCapture }) {
  injectStyles()

  /**
   * Every mounted card's repaint function.
   *
   * A capture started anywhere - another card, the popup, the library -
   * changes what every card should say. Each card used to decide its label
   * once at mount and never revisit it, which is why buttons stayed on "Keep"
   * until the page was reloaded.
   */
  const painters = new Set()

  async function refreshAll() {
    await Promise.all([...painters].map((paint) => paint().catch(() => {})))
  }

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

    function paint(state) {
      const { text, title } = LABELS[state] ?? LABELS[STATES.NEW]
      label.textContent = text
      button.title = title
      button.dataset.state = state
      button.disabled = state === STATES.UNCHANGED
    }

    /**
     * Label from what is already known, without waiting for anything.
     *
     * Matching needs the file list, so a cold cache can only offer a neutral
     * label - but a warm one lets a reload paint the right word immediately.
     */
    function paintFromCache() {
      const cached = getCachedStates()
      if (!cached) return false

      const match = matchCard(card, [...cached.keys()])
      if (!match.path) return false

      boundPath = match.path
      paint(cached.get(match.path) ?? STATES.NEW)
      return true
    }

    async function refresh() {
      const entries = await getEntries()
      const match = matchCard(card, entries.map((e) => e.path))
      boundPath = match.path

      if (!boundPath) {
        label.textContent = 'Pick file'
        button.title = 'Trove could not tell which file this card is - choose it'
        button.dataset.state = 'new'
        return
      }

      paint((await getStates()).get(boundPath) ?? STATES.NEW)
    }

    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const previous = label.textContent
      button.disabled = true
      button.dataset.busy = 'true'
      label.textContent = 'Keeping'
      try {
        const path = boundPath ?? (await pickFile(button, await getEntries()))
        if (!path) {
          delete button.dataset.busy
          label.textContent = previous
          button.disabled = false
          return
        }
        await onCapture(path)
        delete button.dataset.busy
        // Success is a state change on the row, not a toast. Repaint every
        // card, not just this one: keeping one file can change what the
        // conversation's other cards should offer.
        await refreshAll()
      } catch (error) {
        delete button.dataset.busy
        label.textContent = 'Failed'
        button.title = error?.message ?? 'Capture failed'
        button.disabled = false
      }
    })

    painters.add(refresh)

    // Something sensible on the button before any request is made.
    if (!paintFromCache()) paint(STATES.NEW)

    // The cell is a `justify-between` flex row: content first, actions last.
    // Use lastElementChild, not a `:last-child` selector - the latter matches
    // the first *descendant* that happens to be a last child, which is a
    // deeply nested div, not the action area.
    const host = cardEl.lastElementChild ?? cardEl
    host.appendChild(button)
  }

  /**
   * Resolve state soon, but never urgently.
   *
   * Mounting no longer fetches anything, so a card that appears mid-conversation
   * needs something to come back for it. This coalesces those into one check at
   * the next quiet moment rather than one per card as they stream in.
   */
  let pendingRefresh = null

  function scheduleRefresh() {
    if (pendingRefresh) return
    const run = () => {
      pendingRefresh = null
      refreshAll()
    }
    pendingRefresh =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 1500 })
        : setTimeout(run, 1500)
  }

  function scan() {
    let mounted = 0
    for (const cardEl of document.querySelectorAll(CARD_SELECTOR)) {
      if (cardEl.hasAttribute(MARK)) continue
      decorate(cardEl).catch(() => {})
      mounted++
    }
    if (mounted > 0) scheduleRefresh()
  }

  let queued = null
  const observer = new MutationObserver(() => {
    // The transcript mutates constantly while streaming; coalesce hard.
    clearTimeout(queued)
    queued = setTimeout(scan, 250)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  scan()

  return {
    refreshAll,
    stop: () => observer.disconnect(),
  }
}
