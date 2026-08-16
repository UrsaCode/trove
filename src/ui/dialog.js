/**
 * Modal confirmations.
 *
 * NO HISTORY, SAY SO: Trove keeps no versions, so every screen that can
 * destroy something names what is lost, in plain words, before it happens.
 * These replace window.confirm precisely because the native dialog cannot say
 * what it is about to cost.
 *
 * The one action that genuinely cannot be undone is a re-pull over a local
 * edit - not a delete, because a deleted file is still in the conversation.
 */

let mounted = false

function ensureStyles() {
  if (mounted) return
  mounted = true
  const style = document.createElement('style')
  style.textContent = `
    .tv-scrim {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      padding: var(--s5);
      background: rgba(6, 8, 11, 0.72);
    }
    .tv-dialog {
      width: 100%; max-width: 420px;
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: var(--r);
      box-shadow: 0 30px 70px rgba(0,0,0,.6);
      padding: var(--s5);
    }
    .tv-dialog h2 {
      margin: 0 0 var(--s3);
      font: 600 var(--t-15)/1.35 var(--ui);
      color: var(--bone);
    }
    .tv-dialog p {
      margin: 0;
      color: var(--dim);
      font-size: var(--t-13);
      line-height: 1.6;
    }
    .tv-dialog .tv-file { font-family: var(--mono); color: var(--bone); }
    .tv-actions {
      display: flex; justify-content: flex-end; gap: var(--s2);
      margin-top: var(--s5);
    }
  `
  document.head.appendChild(style)
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {(HTMLElement|string)[]} options.body
 * @param {string} options.cancel   label for the safe choice
 * @param {string} options.confirm  label for the destructive choice
 * @param {'sever'|'moved'} [options.tone]
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, body, cancel, confirm, tone = 'sever' }) {
  ensureStyles()

  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'tv-scrim'

    const dialog = document.createElement('div')
    dialog.className = 'tv-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')

    const heading = document.createElement('h2')
    heading.textContent = title

    const paragraph = document.createElement('p')
    paragraph.append(...body)

    const actions = document.createElement('div')
    actions.className = 'tv-actions'

    const cancelButton = document.createElement('button')
    cancelButton.className = 'btn'
    cancelButton.textContent = cancel

    const confirmButton = document.createElement('button')
    confirmButton.className = tone === 'sever' ? 'btn btn-sever' : 'btn'
    if (tone === 'moved') confirmButton.style.color = 'var(--moved)'
    confirmButton.textContent = confirm

    actions.append(cancelButton, confirmButton)
    dialog.append(heading, paragraph, actions)
    scrim.appendChild(dialog)
    document.body.appendChild(scrim)

    // The safe choice takes focus, so Enter never destroys anything.
    cancelButton.focus()

    function close(value) {
      document.removeEventListener('keydown', onKey, true)
      scrim.remove()
      resolve(value)
    }
    function onKey(event) {
      if (event.key === 'Escape') close(false)
      if (event.key === 'Tab') {
        // Trap focus inside the dialog.
        const focusables = [cancelButton, confirmButton]
        const index = focusables.indexOf(document.activeElement)
        if (index !== -1) {
          event.preventDefault()
          focusables[(index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus()
        }
      }
    }

    cancelButton.addEventListener('click', () => close(false))
    confirmButton.addEventListener('click', () => close(true))
    scrim.addEventListener('mousedown', (event) => {
      if (event.target === scrim) close(false)
    })
    document.addEventListener('keydown', onKey, true)
  })
}

const filename = (name) => {
  const span = document.createElement('span')
  span.className = 'tv-file'
  span.textContent = name
  return span
}

/** The one that cannot be undone. */
export function confirmReplaceEdits(name) {
  return confirmDialog({
    title: 'Replace your edits?',
    body: [
      'Your copy of ',
      filename(name),
      ' has changes you made here. Pulling the newer version from the conversation writes over them. Trove doesn’t keep old versions.',
    ],
    cancel: 'Keep my copy',
    confirm: 'Replace with newer',
    tone: 'moved',
  })
}

export function confirmDeleteFile(name) {
  return confirmDialog({
    title: `Delete ${name}?`,
    body: [
      'This removes the local copy only. The file is still in the conversation, and you can capture it again from there.',
    ],
    cancel: 'Cancel',
    confirm: 'Delete file',
  })
}

export function confirmDeleteConversation({ title, fileCount, editedCount }) {
  const body = [`Delete ${fileCount} files from ${title}?`]
  const detail =
    editedCount > 0
      ? `Includes ${editedCount} ${editedCount === 1 ? 'file' : 'files'} you edited here. Those edits only exist in Trove and won’t come back with a re-capture.`
      : 'The files are still in the conversation, and you can capture them again from there.'

  return confirmDialog({
    title: `Delete ${fileCount} files from ${title}?`,
    body: [detail],
    cancel: 'Cancel',
    confirm: `Delete ${fileCount} files`,
  })
}

export function confirmDiscardEdits() {
  return confirmDialog({
    title: 'Discard your changes?',
    body: ['The edits you made here have not been saved to Trove. Leaving now loses them.'],
    cancel: 'Keep editing',
    confirm: 'Discard changes',
  })
}
