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

/**
 * The height of the rendered document, as it reported itself.
 *
 * Sandbox flags propagate to descendants, and a sandboxed document without
 * allow-same-origin gets its own opaque origin - so this page and the frame it
 * created are cross-origin, and contentDocument is null. Measuring the rendered
 * document from out here is simply not possible.
 *
 * So the document is asked. A few lines appended to the markup post its
 * scrollHeight back, which is the only channel across that boundary. It is
 * additive, changes nothing about how the file draws, and never touches the
 * copy Trove stores - Source always shows the file as captured.
 */
let reportedHeight = 0

const HEIGHT_REPORTER = [
  '<script>(function(){',
  'function h(){try{parent.postMessage({__troveHeight:Math.max(',
  'document.documentElement.scrollHeight,',
  'document.body?document.body.scrollHeight:0)},"*")}catch(e){}}',
  // Height settles at different moments depending on fonts, images and script.
  'addEventListener("load",h);addEventListener("resize",h);',
  'setTimeout(h,60);setTimeout(h,500);',
  'try{new ResizeObserver(h).observe(document.documentElement)}catch(e){}',
  '})()</scr' + 'ipt>',
].join('')

function showMarkup(html) {
  clear()
  reportedHeight = 0

  const stage = document.createElement('div')
  stage.id = 'stage'

  const frame = document.createElement('iframe')
  frame.id = 'frame'
  // The nested frame keeps the captured document's own <html>/<head> intact
  // rather than splicing its markup into this page.
  frame.srcdoc = html + HEIGHT_REPORTER
  stage.appendChild(frame)
  root.appendChild(stage)
}

/**
 * Grow the frame to the whole document and let the stage scroll instead.
 *
 * With the frame at its full height there is no inner scrollbar to reach
 * across the origin boundary for: the scroll belongs to this page, which can
 * both measure and move it.
 */
window.addEventListener('message', (event) => {
  const height = Number(event.data?.__troveHeight)
  if (!Number.isFinite(height) || height <= 0) return

  const frame = document.getElementById('frame')
  const stage = document.getElementById('stage')
  if (!frame || !stage || frame.contentWindow !== event.source) return

  reportedHeight = Math.ceil(height)
  frame.style.height = `${reportedHeight}px`
})

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
  reportedHeight = 0

  const stage = document.createElement('div')
  stage.id = 'stage'

  const frame = document.createElement('iframe')
  frame.id = 'frame'
  const pre = document.createElement('pre')
  pre.textContent = text
  frame.srcdoc = `<!doctype html><meta charset="utf-8">${HEIGHT_REPORTER}<style>
    body { margin:0; padding:20px; background:#fbf9f5; color:#23211c;
           font:400 12.5px/1.6 ui-monospace, Menlo, Consolas, monospace; }
    pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
  </style>${pre.outerHTML}`
  stage.appendChild(frame)
  root.appendChild(stage)
}

/**
 * The scroll geometry a full-page capture works from.
 *
 * Reported by the stage, which this page owns, rather than by the frame - the
 * frame is behind an opaque-origin boundary and cannot be measured from here at
 * all. See the note on reportedHeight.
 */
function scrollMetrics() {
  const stage = document.getElementById('stage')

  // The stage belongs to this page, so its geometry is always readable - unlike
  // the frame's, which sits behind an opaque-origin boundary.
  if (stage) {
    return {
      scrollHeight: Math.max(stage.scrollHeight, reportedHeight),
      clientHeight: stage.clientHeight,
      scrollTop: stage.scrollTop,
      // Without a reported height the frame is still only a viewport tall, and
      // a full-page capture would be a viewport repeated.
      scrollable: reportedHeight > stage.clientHeight + 4,
    }
  }

  const image = document.getElementById('image')
  if (image) {
    // A bare image never scrolls; one capture is the whole thing.
    return {
      scrollHeight: image.clientHeight,
      clientHeight: image.clientHeight,
      scrollTop: 0,
      scrollable: false,
    }
  }
  return { scrollHeight: 0, clientHeight: 0, scrollTop: 0, scrollable: false }
}

function scrollTo(y) {
  const stage = document.getElementById('stage')
  if (!stage) return { scrollTop: 0 }
  stage.scrollTop = y
  return { scrollTop: stage.scrollTop }
}

window.addEventListener('message', (event) => {
  const data = event.data
  // Only ever act on the message shape we defined. Nothing here trusts the
  // parent beyond that, and nothing is executed as code.
  if (!data || data.channel !== 'cfv-preview') return

  const reply = (extra = {}) =>
    event.source?.postMessage({ channel: 'cfv-preview', ack: true, id: data.id, ...extra }, '*')

  try {
    // Measurement and scrolling answer with data rather than repainting.
    if (data.render === 'metrics') {
      reply({ metrics: scrollMetrics() })
      return
    }
    if (data.render === 'scroll') {
      reply({ scrolled: scrollTo(Number(data.y) || 0) })
      return
    }

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
    reply()
  } catch (error) {
    showMessage(`Preview failed: ${error.message}`)
    reply({ error: error.message })
  }
})

showMessage('Select a file to preview it.')

/*
 * Announce readiness. The host queues render requests until this arrives -
 * without it, a request that beats this script's execution is dropped and the
 * preview stays on the placeholder above.
 */
function announceReady() {
  parent?.postMessage({ channel: 'cfv-preview', ready: true }, '*')
}

announceReady()
// A bfcache restore re-runs no script, but pageshow still fires.
window.addEventListener('pageshow', announceReady)
