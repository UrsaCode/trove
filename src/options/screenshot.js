/**
 * Screenshots of a rendered file.
 *
 * The rendered document lives in a sandboxed iframe with an opaque origin, so
 * nothing on this page can read its pixels - which rules out the usual
 * canvas-rasterising approach and is the point of the sandbox.
 *
 * Capturing the visible tab sidesteps that entirely: the browser composites
 * what is actually on screen. Trove's own bands are hidden for the duration, so
 * the picture is the document rather than the document inside our furniture.
 */

import { MSG } from '../lib/messages.js'

/**
 * Give the browser a frame to paint the hidden chrome before capturing.
 *
 * Raced against a timer on purpose: requestAnimationFrame does not fire at all
 * in a hidden tab, so waiting on it alone would hang here forever and leave the
 * page with all its furniture hidden. A capture from a backgrounded tab will
 * fail on its own terms further down, with an error the caller can show.
 */
function nextPaint(timeoutMs = 250) {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    requestAnimationFrame(() => requestAnimationFrame(done))
    setTimeout(done, timeoutMs)
  })
}

/**
 * Whether Chrome will let us composite this tab.
 *
 * captureVisibleTab needs activeTab or a matching host permission. activeTab is
 * only granted when the user invokes the extension's action on a tab, and the
 * Reader is a tab the extension opened for them - so it never has it. Capture
 * access is therefore an optional permission, asked for the first time someone
 * takes a screenshot rather than at install.
 */
export async function hasCapturePermission() {
  if (!chrome.permissions?.contains) return true
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] })
  } catch {
    return false
  }
}

/** Must be called from a user gesture, or Chrome refuses to show the prompt. */
export async function requestCapturePermission() {
  if (!chrome.permissions?.request) return false
  try {
    return await chrome.permissions.request({ origins: ['<all_urls>'] })
  } catch {
    return false
  }
}

/**
 * Capture the tab with everything of ours taken off screen.
 *
 * `shooting` hides the bands, the save bar, the details panel and the modal
 * itself. The class is removed before this resolves, so a caller never has to
 * remember to put the furniture back.
 *
 * @returns {Promise<string>} a PNG data URL
 */
export async function captureTab() {
  document.body.classList.add('shooting')
  try {
    await nextPaint()
    const response = await chrome.runtime.sendMessage({ type: MSG.SCREENSHOT })
    if (!response?.ok) throw new Error(response?.error ?? 'Could not capture the tab')
    return response.dataUrl
  } finally {
    document.body.classList.remove('shooting')
  }
}

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob()
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Put the image on the clipboard.
 *
 * Only PNG is writable as an image, which is what we capture anyway. Requires
 * the document to be focused, so this must run from a real user gesture.
 */
export async function copyBlob(blob) {
  if (!navigator.clipboard?.write) throw new Error('This browser cannot copy images')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
