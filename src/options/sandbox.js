/**
 * The sandboxed renderer.
 *
 * MV3 extension pages run under a strict content security policy that forbids
 * inline script, and an iframe inherits its parent's policy - so a captured
 * HTML file with inline <script> would render blank in an ordinary extension
 * page. A page declared under manifest "sandbox" gets a relaxed policy and a
 * unique opaque origin instead.
 *
 * That solves correctness and security together: the captured file's scripts
 * run exactly as written, while the opaque origin denies them access to
 * extension storage, extension APIs, and the user's Claude session. Captured
 * content is generated code the user has not necessarily read, so it is
 * treated as untrusted throughout.
 */

const root = document.getElementById('root')

function clear() {
  root.textContent = ''
}

function showMessage(text) {
  clear()
  const p = document.createElement('p')
  p.id = 'message'
  p.textContent = text
  root.appendChild(p)
}

function showMarkup(html) {
  clear()
  const frame = document.createElement('iframe')
  frame.id = 'frame'
  // The nested frame keeps the captured document's own <html>/<head> intact
  // rather than splicing its markup into this page.
  frame.srcdoc = html
  root.appendChild(frame)
}

function showImage(url) {
  clear()
  const stage = document.createElement('div')
  stage.className = 'stage'
  const img = document.createElement('img')
  img.id = 'image'
  img.src = url
  img.alt = ''
  stage.appendChild(img)
  root.appendChild(stage)
}

function showText(text) {
  clear()
  const frame = document.createElement('iframe')
  frame.id = 'frame'
  const pre = document.createElement('pre')
  pre.textContent = text
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>
    body { margin:0; padding:20px; background:#fbf9f5; color:#23211c;
           font:400 12.5px/1.6 ui-monospace, Menlo, Consolas, monospace; }
    pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
  </style>${pre.outerHTML}`
  root.appendChild(frame)
}

window.addEventListener('message', (event) => {
  const data = event.data
  // Only ever act on the message shape we defined. Nothing here trusts the
  // parent beyond that, and nothing is executed as code.
  if (!data || data.channel !== 'cfv-preview') return

  try {
    switch (data.render) {
      case 'markup':
        showMarkup(String(data.content ?? ''))
        break
      case 'image':
        showImage(String(data.url ?? ''))
        break
      case 'text':
        showText(String(data.content ?? ''))
        break
      case 'empty':
        showMessage(data.message ?? 'Select a file to preview it.')
        break
      default:
        showMessage('This file type cannot be previewed. Open the Code tab to read it.')
    }
    event.source?.postMessage({ channel: 'cfv-preview', ack: true }, '*')
  } catch (error) {
    showMessage(`Preview failed: ${error.message}`)
    event.source?.postMessage({ channel: 'cfv-preview', ack: true, error: error.message }, '*')
  }
})

showMessage('Select a file to preview it.')
