/**
 * Staying out of the page's way.
 *
 * Trove runs inside someone else's application. Checking which files are
 * already kept means a listing request and a round trip to the worker, and
 * doing that while claude.ai is still loading competes with the page for the
 * connection and the main thread - which is what made a reload sit there.
 *
 * So nothing here is on the critical path: the work waits for the page to
 * finish loading, and then for a genuinely idle moment.
 */

/** Resolves once the page has finished loading. Immediate if it already has. */
export function whenLoaded() {
  if (document.readyState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    window.addEventListener('load', () => resolve(), { once: true })
    // A page that never fires load must not strand the work forever.
    setTimeout(resolve, 8000)
  })
}

/**
 * Resolves at the next idle moment, or after `timeout` at the latest.
 *
 * requestIdleCallback is unavailable in some contexts and never fires in a
 * hidden tab, so the timeout is the guarantee rather than the fallback.
 */
export function whenIdle({ timeout = 2000 } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(done, { timeout })
    setTimeout(done, timeout)
  })
}

/** After the page has loaded, and then once it is quiet. */
export async function whenSettled(options) {
  await whenLoaded()
  await whenIdle(options)
}
