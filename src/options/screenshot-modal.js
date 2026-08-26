/**
 * The screenshot modal, injected into the page it is capturing.
 *
 * The capture happens first and the modal shows the result, so what you are
 * looking at is exactly what you would save. Offering options before a capture
 * would mean describing the picture in words when we could simply show it.
 *
 * PAPER IS SACRED says nothing of ours is ever drawn over a rendered file. A
 * modal over the document is a deliberate, momentary exception: it is opened by
 * the user, it takes itself off screen for the capture, and it leaves nothing
 * behind. Everything else in this file exists to keep that promise.
 */

import {
  captureTab,
  dataUrlToBlob,
  saveBlob,
  copyBlob,
  hasCapturePermission,
  requestCapturePermission,
} from './screenshot.js'

let styled = false

function ensureStyles() {
  if (styled) return
  styled = true
  const style = document.createElement('style')
  style.textContent = `
    .shot-scrim {
      position: fixed; inset: 0; z-index: 80;
      display: grid; place-items: center;
      padding: var(--s5);
      background: rgba(6, 8, 11, 0.78);
      backdrop-filter: blur(3px);
    }
    .shot-modal {
      width: min(760px, 100%);
      max-height: min(86vh, 760px);
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: var(--panel);
      border: 1px solid var(--rule);
      border-radius: var(--r);
      box-shadow: 0 34px 80px rgba(0,0,0,.62);
      overflow: hidden;
    }
    .shot-head {
      display: flex; align-items: center; gap: var(--s3);
      padding: var(--s4);
      border-bottom: 1px solid var(--rule);
    }
    .shot-head .eyebrow { flex: 1 }
    .shot-body {
      min-height: 0;
      padding: var(--s4);
      background: var(--void);
      display: grid;
      place-items: center;
    }
    /* The captured image sits on the same paper the file renders on. */
    .shot-preview {
      max-width: 100%;
      max-height: 100%;
      display: block;
      border-radius: 3px;
      border: 1px solid var(--rule);
      background: var(--paper);
    }
    .shot-pending {
      color: var(--dim);
      font: 400 var(--t-12)/1.6 var(--mono);
    }
    .shot-foot {
      display: flex; align-items: center; gap: var(--s2);
      padding: var(--s3) var(--s4);
      border-top: 1px solid var(--rule);
    }
    .shot-name {
      flex: 1; min-width: 0;
      padding: 8px 11px;
      border-radius: var(--r-sm);
      border: 1px solid var(--rule);
      background: var(--raise);
      color: var(--bone);
      font: 400 var(--t-12)/1 var(--mono);
      outline: none;
    }
    .shot-name:focus { border-color: var(--dim) }
    .shot-note {
      padding: 0 var(--s4) var(--s3);
      color: var(--dimmer);
      font: 400 var(--t-10)/1.5 var(--mono);
    }
    .shot-error {
      color: var(--sever);
      font: 400 var(--t-12)/1.6 var(--ui);
      text-align: center;
      max-width: 44ch;
    }
    /* Asking for a permission is a screen, not an error. */
    .shot-ask {
      display: grid; gap: var(--s4); justify-items: center;
      max-width: 46ch; text-align: center;
    }
    .shot-ask h3 {
      margin: 0;
      font: 600 var(--t-15)/1.35 var(--ui);
      color: var(--bone);
    }
    .shot-ask p {
      margin: 0;
      color: var(--dim);
      font: 400 var(--t-12)/1.6 var(--ui);
    }
    /* Taken off screen for the capture, along with the rest of our furniture. */
    body.shooting .shot-scrim { display: none !important }
  `
  document.head.appendChild(style)
}

/**
 * @param {object} options
 * @param {string} options.suggestedName  filename without extension
 * @returns {Promise<void>} resolves when the modal closes
 */
export function openScreenshotModal({ suggestedName = 'screenshot' } = {}) {
  ensureStyles()

  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'shot-scrim'

    const modal = document.createElement('div')
    modal.className = 'shot-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Screenshot')

    // Head
    const head = document.createElement('div')
    head.className = 'shot-head'
    const eyebrow = document.createElement('span')
    eyebrow.className = 'eyebrow'
    eyebrow.textContent = 'Screenshot'
    const retake = document.createElement('button')
    retake.className = 'btn'
    retake.textContent = 'Retake'
    const close = document.createElement('button')
    close.className = 'btn btn-ghost'
    close.textContent = '×'
    close.setAttribute('aria-label', 'Close')
    head.append(eyebrow, retake, close)

    // Body
    const body = document.createElement('div')
    body.className = 'shot-body'

    // Foot
    const foot = document.createElement('div')
    foot.className = 'shot-foot'
    const name = document.createElement('input')
    name.className = 'shot-name'
    name.value = `${suggestedName}.png`
    name.setAttribute('aria-label', 'File name')
    const copy = document.createElement('button')
    copy.className = 'btn'
    copy.textContent = 'Copy'
    const save = document.createElement('button')
    save.className = 'btn btn-tether'
    save.textContent = 'Save PNG'
    foot.append(name, copy, save)

    const note = document.createElement('div')
    note.className = 'shot-note'
    note.textContent = 'Captures the document as shown, without any of Trove’s own controls.'

    modal.append(head, body, foot, note)
    scrim.appendChild(modal)
    document.body.appendChild(scrim)

    let blob = null

    function setBusy(busy) {
      for (const button of [retake, copy, save]) button.disabled = busy
    }

    /**
     * Chrome will not composite the tab without capture access, and the Reader
     * is a tab the extension opened, so activeTab never applies. Explain what
     * is being asked for and why, rather than surfacing the raw refusal.
     */
    function askForPermission() {
      body.textContent = ''
      setBusy(true)
      copy.disabled = true
      save.disabled = true

      const ask = document.createElement('div')
      ask.className = 'shot-ask'

      const heading = document.createElement('h3')
      heading.textContent = 'Allow Trove to capture this tab'

      const why = document.createElement('p')
      why.textContent =
        'Screenshots work by photographing what is on screen, which Chrome treats as a permission. Trove only ever captures its own Reader tab, and the image never leaves your machine.'

      const grant = document.createElement('button')
      grant.className = 'btn btn-tether'
      grant.textContent = 'Allow and capture'
      grant.addEventListener('click', async () => {
        grant.disabled = true
        grant.textContent = 'Waiting for Chrome…'
        const granted = await requestCapturePermission()
        if (granted) {
          take()
          return
        }
        grant.disabled = false
        grant.textContent = 'Allow and capture'
        const refused = document.createElement('p')
        refused.textContent = 'Chrome did not grant it. Screenshots stay unavailable until it does.'
        ask.appendChild(refused)
      })

      ask.append(heading, why, grant)
      body.appendChild(ask)
    }

    async function take() {
      if (!(await hasCapturePermission())) {
        askForPermission()
        return
      }

      body.textContent = ''
      const pending = document.createElement('div')
      pending.className = 'shot-pending'
      pending.textContent = 'Capturing…'
      body.appendChild(pending)
      setBusy(true)

      try {
        const dataUrl = await captureTab()
        blob = await dataUrlToBlob(dataUrl)

        body.textContent = ''
        const image = document.createElement('img')
        image.className = 'shot-preview'
        image.src = dataUrl
        image.alt = 'The captured screenshot'
        body.appendChild(image)
        setBusy(false)
      } catch (error) {
        blob = null
        body.textContent = ''
        const failed = document.createElement('div')
        failed.className = 'shot-error'
        failed.textContent = `Couldn’t capture this tab. ${error.message}`
        body.appendChild(failed)
        setBusy(false)
        copy.disabled = true
        save.disabled = true
      }
    }

    function finish() {
      document.removeEventListener('keydown', onKey, true)
      scrim.remove()
      resolve()
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }

    close.addEventListener('click', finish)
    scrim.addEventListener('mousedown', (event) => {
      if (event.target === scrim) finish()
    })
    document.addEventListener('keydown', onKey, true)

    retake.addEventListener('click', take)

    save.addEventListener('click', () => {
      if (!blob) return
      const filename = name.value.trim() || `${suggestedName}.png`
      saveBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`)
      finish()
    })

    copy.addEventListener('click', async () => {
      if (!blob) return
      const previous = copy.textContent
      try {
        await copyBlob(blob)
        copy.textContent = 'Copied'
        setTimeout(finish, 700)
      } catch (error) {
        copy.textContent = 'Copy failed'
        copy.title = error.message
        setTimeout(() => {
          copy.textContent = previous
        }, 2000)
      }
    })

    take()
  })
}
