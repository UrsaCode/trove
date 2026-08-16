/**
 * The Trove mark: an open tray with a file dropping into it.
 *
 * Two shapes with one gap between them, which is what lets it survive the
 * 16px toolbar slot - at that size only the aqua square has to read.
 */

const NS = 'http://www.w3.org/2000/svg'

export function mark(size = 18) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 32 32')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('mark')

  const tray = document.createElementNS(NS, 'path')
  tray.setAttribute('d', 'M6 13v6.5A6.5 6.5 0 0 0 12.5 26h7A6.5 6.5 0 0 0 26 19.5V13')
  tray.setAttribute('stroke', 'currentColor')
  tray.setAttribute('stroke-width', '2.8')
  tray.setAttribute('stroke-linecap', 'round')

  const file = document.createElementNS(NS, 'rect')
  file.setAttribute('x', '12.5')
  file.setAttribute('y', '4')
  file.setAttribute('width', '7')
  file.setAttribute('height', '7')
  file.setAttribute('rx', '1.6')
  file.setAttribute('fill', 'var(--tether)')

  svg.append(tray, file)
  return svg
}
