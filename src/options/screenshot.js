/**
 * Screenshots of a rendered file.
 *
 * The rendered document lives in a sandboxed iframe with an opaque origin, so
 * nothing on this page can read its pixels - which rules out the usual
 * canvas-rasterising approach and is the point of the sandbox.
 *
 * Capturing the visible tab sidesteps that entirely: the browser composites
 * what is actually on screen. In full screen that is exactly the document, and
 * in the Reader we hide our own bands for the duration, so either way the
 * picture is the file rather than the file inside our furniture.
 */

import { MSG } from '../lib/messages.js'

/** Give the browser a frame to paint the hidden chrome before capturing. */
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/**
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function captureScreenshot(filename) {
  await nextPaint()

  const response = await chrome.runtime.sendMessage({ type: MSG.SCREENSHOT })
  if (!response?.ok) throw new Error(response?.error ?? 'Could not capture the tab')

  const blob = await (await fetch(response.dataUrl)).blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
