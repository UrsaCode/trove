/**
 * Host side of the sandbox bridge.
 *
 * Decides how a file should be rendered and hands it to the sandboxed page.
 * Object URLs are created here (the sandbox has an opaque origin and cannot
 * read our storage) and revoked once the sandbox acknowledges.
 *
 * The sandbox announces itself with a ready message rather than the host
 * assuming it is listening. Posting into an iframe that has not finished
 * loading drops the message silently, which showed up as a preview stuck on
 * its placeholder whenever the page was reopened from cache and the render
 * request beat the frame's script.
 */

const CHANNEL = 'cfv-preview'
const MARKUP_MIMES = new Set(['text/html', 'image/svg+xml'])

/** Frames that have told us they are listening. */
const ready = new WeakSet()
/** Resolvers waiting on a frame's ready message. */
const waiting = new WeakMap()

window.addEventListener('message', (event) => {
  if (event.data?.channel !== CHANNEL || !event.data.ready) return
  for (const frame of document.querySelectorAll('iframe')) {
    if (frame.contentWindow === event.source) {
      ready.add(frame)
      waiting.get(frame)?.forEach((resolve) => resolve())
      waiting.delete(frame)
    }
  }
})

function whenReady(frame) {
  if (ready.has(frame)) return Promise.resolve()
  return new Promise((resolve) => {
    const queue = waiting.get(frame) ?? []
    queue.push(resolve)
    waiting.set(frame, queue)

    // Belt and braces: a frame that loaded before this module ran will never
    // send another ready message, so treat load as readiness too.
    frame.addEventListener('load', () => resolve(), { once: true })
    setTimeout(resolve, 3000)
  })
}

async function post(frame, message) {
  await whenReady(frame)

  return new Promise((resolve) => {
    function onAck(event) {
      if (event.data?.channel !== CHANNEL || !event.data.ack) return
      window.removeEventListener('message', onAck)
      resolve(event.data)
    }
    window.addEventListener('message', onAck)
    frame.contentWindow?.postMessage({ channel: CHANNEL, ...message }, '*')
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
