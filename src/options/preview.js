/**
 * Host side of the sandbox bridge.
 *
 * Decides how a file should be rendered and hands it to the sandboxed page.
 * Object URLs are created here (the sandbox has an opaque origin and cannot
 * read our storage) and revoked once the sandbox acknowledges.
 */

const CHANNEL = 'cfv-preview'
const MARKUP_MIMES = new Set(['text/html', 'image/svg+xml'])

function post(frame, message) {
  return new Promise((resolve) => {
    function onAck(event) {
      if (event.data?.channel !== CHANNEL || !event.data.ack) return
      window.removeEventListener('message', onAck)
      resolve(event.data)
    }
    window.addEventListener('message', onAck)
    frame.contentWindow.postMessage({ channel: CHANNEL, ...message }, '*')
    // Never hang the UI on a sandbox that failed to load.
    setTimeout(() => {
      window.removeEventListener('message', onAck)
      resolve({ timedOut: true })
    }, 4000)
  })
}

export function decideRender(file) {
  if (!file) return { render: 'empty' }
  if (file.kind === 'binary' && file.mime?.startsWith('image/')) return { render: 'image' }
  if (MARKUP_MIMES.has(file.mime)) return { render: 'markup' }
  if (file.kind === 'text') return { render: 'text' }
  return { render: 'unsupported' }
}

export async function renderInSandbox(frame, file) {
  const { render } = decideRender(file)

  if (render === 'image') {
    const url = URL.createObjectURL(file.content)
    const result = await post(frame, { render: 'image', url })
    // Give the image a moment to decode before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return result
  }

  if (render === 'markup' || render === 'text') {
    return post(frame, { render, content: file.content })
  }

  if (render === 'empty') {
    return post(frame, { render: 'empty' })
  }

  return post(frame, { render: 'unsupported' })
}
