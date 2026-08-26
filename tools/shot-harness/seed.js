/**
 * Seed data for the screenshot harnesses.
 *
 * Builds markup with the real class names so the shots exercise the shipped
 * stylesheets. Nothing here is used by the extension itself.
 */

/* eslint-disable no-unused-vars */

const NS = 'http://www.w3.org/2000/svg'

const GLYPHS = {
  page: [
    ['rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6 }],
    ['path', { d: 'M2 6.2h12' }],
    ['circle', { cx: 4.2, cy: 4.6, r: 0.65, fill: 'currentColor', stroke: 'none' }],
  ],
  image: [
    ['rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6 }],
    ['path', { d: 'M2.6 11.2 6 8l2.2 2.1L10.4 8l3 3.2' }],
    ['circle', { cx: 10.6, cy: 5.9, r: 1.05 }],
  ],
  code: [
    ['path', { d: 'M5.6 5 2.6 8l3 3' }],
    ['path', { d: 'M10.4 5l3 3-3 3' }],
  ],
  data: [
    ['ellipse', { cx: 8, cy: 4.4, rx: 4.6, ry: 1.7 }],
    ['path', { d: 'M3.4 4.4v3.4c0 .94 2.06 1.7 4.6 1.7s4.6-.76 4.6-1.7V4.4' }],
    ['path', { d: 'M3.4 7.8v3.4c0 .94 2.06 1.7 4.6 1.7s4.6-.76 4.6-1.7V7.8' }],
  ],
  text: [
    ['path', { d: 'M3.4 4.2h9.2' }],
    ['path', { d: 'M3.4 7h9.2' }],
    ['path', { d: 'M3.4 9.8h6.2' }],
    ['path', { d: 'M3.4 12.6h3.4' }],
  ],
  config: [
    ['path', { d: 'M6.4 3.4c-1.6 0-1.6 3.4-2.9 4.6 1.3 1.2 1.3 4.6 2.9 4.6' }],
    ['path', { d: 'M9.6 3.4c1.6 0 1.6 3.4 2.9 4.6-1.3 1.2-1.3 4.6-2.9 4.6' }],
  ],
  other: [
    ['path', { d: 'M4 2.6h5l3.2 3.2v7.6H4z' }],
    ['path', { d: 'M9 2.6v3.2h3.2' }],
  ],
}

const BY_EXT = {
  html: 'page',
  png: 'image',
  svg: 'image',
  jpg: 'image',
  json: 'config',
  yaml: 'config',
  csv: 'data',
  md: 'text',
  txt: 'text',
  py: 'code',
  tsx: 'code',
  ts: 'code',
  js: 'code',
  css: 'code',
}

function glyph(ext, size = 16) {
  const name = BY_EXT[String(ext).toLowerCase()] ?? 'other'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.25')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const [tag, attrs] of GLYPHS[name]) {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    svg.appendChild(node)
  }
  return svg
}

function tether(state, label) {
  const wrap = document.createElement('div')
  wrap.className = 'tether'
  if (state === 'moved') wrap.dataset.state = 'moved'
  const node = document.createElement('span')
  node.className = 'node'
  const wire = document.createElement('span')
  wire.className = 'wire'
  const lbl = document.createElement('span')
  lbl.className = 'lbl'
  lbl.textContent = label
  wrap.append(node, wire, lbl)
  return wrap
}

function renderRail(items) {
  const rail = document.getElementById('rail')
  for (const item of items) {
    const el = document.createElement('button')
    el.className = 'rail-item'
    el.setAttribute('aria-selected', String(Boolean(item.on)))

    const text = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'rail-title'
    if (item.moved) {
      const dot = document.createElement('span')
      dot.className = 'moved-dot'
      title.appendChild(dot)
    }
    title.appendChild(document.createTextNode(item.title))
    const sub = document.createElement('div')
    sub.className = 'rail-sub mono'
    sub.textContent = `${item.files} files · ${item.when}`
    text.append(title, sub)
    el.append(text)
    rail.appendChild(el)
  }
}

function renderRows(files) {
  const body = document.getElementById('rows')
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const row = document.createElement('button')
    row.className = 'trow'
    row.setAttribute('aria-selected', String(Boolean(file.selected)))

    const cell = document.createElement('div')
    cell.className = 'col-file'
    const tile = document.createElement('div')
    tile.className = 'tile'
    tile.dataset.glyph = 'true'
    tile.appendChild(glyph(ext))
    const text = document.createElement('div')
    text.style.minWidth = '0'
    const name = document.createElement('div')
    name.className = 'file-name'
    name.textContent = file.name
    const conv = document.createElement('div')
    conv.className = 'file-conv'
    conv.textContent = file.conv
    text.append(name, conv)
    cell.append(tile, text)

    const size = document.createElement('div')
    size.className = 'col-size'
    size.textContent = file.size

    const when = document.createElement('div')
    when.className = 'col-when'
    when.textContent = file.when

    const src = document.createElement('div')
    src.className = 'col-src'
    if (file.state === 'moved') {
      src.appendChild(tether('moved', file.msg ?? 'newer version'))
      const chip = document.createElement('button')
      chip.className = 'repull-chip'
      chip.textContent = 'Re-pull'
      src.appendChild(chip)
    } else if (file.state === 'edited') {
      src.appendChild(tether('tethered', 'edited locally'))
    } else {
      src.appendChild(tether('tethered', 'tethered'))
    }

    row.append(cell, size, when, src)
    body.appendChild(row)
  }
}

/** A believable rendered document, on paper, for the preview stage. */
function renderPreview(frame) {
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:34px 30px;background:#F7F5F0;color:#14161B;
         font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    h1{margin:0 0 4px;font-size:21px;letter-spacing:-.2px}
    .sub{color:#6b6f78;font:400 11px/1.5 ui-monospace,Menlo,monospace;margin-bottom:22px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
    .card{border:1px solid #e2ded4;border-radius:6px;padding:12px}
    .n{font:600 17px/1 ui-monospace,Menlo,monospace}
    .l{margin-top:5px;font:400 9px/1 ui-monospace,Menlo,monospace;
       letter-spacing:.09em;text-transform:uppercase;color:#8a8e96}
    p{margin:14px 0 0;max-width:52ch;color:#3a3d44}
    .bar{height:6px;border-radius:3px;background:#e6e2da;margin-top:6px;overflow:hidden}
    .bar i{display:block;height:100%;background:#4a6b3f}
    table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}
    th{text-align:left;font:400 9px/1 ui-monospace,Menlo,monospace;letter-spacing:.09em;
       text-transform:uppercase;color:#8a8e96;padding-bottom:7px;border-bottom:1px solid #e2ded4}
    td{padding:7px 0;border-bottom:1px solid #efece4;font-family:ui-monospace,Menlo,monospace}
  </style>
  <h1>Fleet console</h1>
  <div class="sub">fbmp · 24 bots · last sweep 4 min ago</div>
  <div class="cards">
    <div class="card"><div class="n">1,284</div><div class="l">listings swept</div></div>
    <div class="card"><div class="n">71.4%</div><div class="l">hit rate</div></div>
    <div class="card"><div class="n">22/24</div><div class="l">bots healthy</div></div>
  </div>
  <p>Two bots are behind their rotation window. Catch-up reaches further back on
  the first pass, then returns to the normal cadence.</p>
  <div class="bar"><i style="width:71%"></i></div>
  <table>
    <tr><th>Host</th><th>Listings</th><th>State</th></tr>
    <tr><td>host-04</td><td>318</td><td>healthy</td></tr>
    <tr><td>host-07</td><td>291</td><td>healthy</td></tr>
    <tr><td>host-11</td><td>142</td><td>catching up</td></tr>
  </table>`
}
