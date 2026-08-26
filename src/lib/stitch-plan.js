/**
 * Planning a full-page capture.
 *
 * A document rarely divides evenly into viewports, so the last scroll position
 * overlaps the one before it. Painting each slice at its own offset would draw
 * that overlap twice - a visibly duplicated band across the seam.
 *
 * Both steps are pure so the arithmetic can be checked without a browser: what
 * matters is that every row of the finished image is painted exactly once.
 */

/**
 * Where to scroll for each capture.
 *
 * @param {number} total    full document height, in CSS pixels
 * @param {number} viewport visible height, in CSS pixels
 * @returns {number[]} scroll offsets, in order
 */
export function planSlices(total, viewport) {
  if (!(viewport > 0) || !(total > 0)) return [0]
  const steps = Math.ceil(total / viewport)
  const offsets = []
  for (let step = 0; step < steps; step++) {
    // Clamped: the last scroll cannot go past the end of the document, which
    // is exactly why the final slice overlaps its predecessor.
    offsets.push(Math.max(0, Math.min(step * viewport, total - viewport)))
  }
  return offsets
}

/**
 * Turn captured slices into draw instructions with the overlap removed.
 *
 * @param {number[]} offsets      scroll offset of each slice, in CSS pixels
 * @param {number} sliceHeight    height of one captured slice, in device pixels
 * @param {number} canvasHeight   height of the finished image, in device pixels
 * @param {number} scale          device pixels per CSS pixel
 * @returns {{index: number, sourceY: number, destY: number, height: number}[]}
 */
export function planDraws(offsets, sliceHeight, canvasHeight, scale = 1) {
  const draws = []
  let painted = 0

  offsets.forEach((offset, index) => {
    const top = Math.round(offset * scale)
    const destY = Math.max(top, painted)
    // Skip whatever an earlier slice already covered.
    const sourceY = Math.max(0, painted - top)
    const height = Math.min(sliceHeight - sourceY, canvasHeight - destY)
    if (height <= 0) return

    draws.push({ index, sourceY, destY, height })
    painted = destY + height
  })

  return draws
}
