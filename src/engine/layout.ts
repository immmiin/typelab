import type { TextLayer } from '../types'
import { caseTransform, resolveStyle, runCss, type RStyle } from './style'
import { pathGeometry, type PathGeom } from './path'

const NS = 'http://www.w3.org/2000/svg'

export interface G {
  i: number // source UTF-16 index
  n: number // code units
  disp: string
  x: number // box-local left
  y: number // baseline (incl. baseline shift)
  lineY: number // line baseline
  adv: number // advance incl. tracking (+ justify)
  w: number // advance excl. tracking
  rs: RStyle
  line: number
  space: boolean
  nl: boolean
}
export interface LineInfo { a: number; b: number; x: number; y: number; width: number; top: number; height: number }
export interface Layout {
  glyphs: G[]
  lines: LineInfo[]
  W: number
  H: number
  vertical: boolean
  path: PathGeom | null
  base: RStyle
}

let measureSvg: SVGSVGElement | null = null
function host() {
  if (!measureSvg) {
    measureSvg = document.createElementNS(NS, 'svg') as SVGSVGElement
    measureSvg.setAttribute('aria-hidden', 'true')
    measureSvg.setAttribute('style', 'position:absolute;left:-100000px;top:0;width:4000px;height:100px;visibility:hidden;pointer-events:none')
    document.body.appendChild(measureSvg)
  }
  return measureSvg
}

interface Unit { i: number; n: number; disp: string; rs: RStyle; nl: boolean; space: boolean }

/** Measure x start of each unit in a paragraph (single line). Returns starts plus total width. */
function measure(units: Unit[]): { xs: number[]; end: number } {
  if (!units.length) return { xs: [], end: 0 }
  const svg = host()
  const text = document.createElementNS(NS, 'text')
  text.setAttribute('x', '0')
  text.setAttribute('y', '50')
  text.setAttribute('xml:space', 'preserve')
  const domIdx: number[] = []
  let cursor = 0
  let run: SVGTSpanElement | null = null
  let runKey = ''
  let buf = ''
  const flush = () => {
    if (run) {
      run.textContent = buf
      text.appendChild(run)
    }
  }
  for (const u of units) {
    if (!run || u.rs.key !== runKey) {
      flush()
      run = document.createElementNS(NS, 'tspan')
      run.setAttribute('style', runCss(u.rs))
      runKey = u.rs.key
      buf = ''
    }
    domIdx.push(cursor)
    buf += u.disp
    cursor += u.disp.length
  }
  buf += '​'
  flush()
  svg.appendChild(text)
  const xs: number[] = []
  let end = 0
  try {
    for (let k = 0; k < units.length; k++) {
      xs.push(units[k].disp.length ? text.getStartPositionOfChar(domIdx[k]).x : k ? xs[k - 1] : 0)
    }
    end = text.getStartPositionOfChar(cursor).x
  } catch {
    // fallback: rough estimate
    let x = 0
    units.forEach((u) => {
      xs.push(x)
      x += u.rs.size * 0.55 * u.disp.length + u.rs.tracking
    })
    end = x
  }
  svg.removeChild(text)
  return { xs, end }
}

const cache = new Map<string, Layout>()

export function layoutKey(l: TextLayer, fontsVersion: number) {
  return JSON.stringify([l.text, l.style, l.chars, l.autoWidth, l.autoWidth ? 0 : l.w, l.fixedHeight ? l.h : 0, l.fixedHeight, l.path.enabled ? l.path : 0, fontsVersion])
}

export function getLayout(l: TextLayer, fontsVersion: number): Layout {
  const key = layoutKey(l, fontsVersion)
  const hit = cache.get(key)
  if (hit) return hit
  const lay = compute(l)
  if (cache.size > 400) cache.clear()
  cache.set(key, lay)
  return lay
}

function compute(l: TextLayer): Layout {
  const st = l.style
  const base = resolveStyle(l, null)
  const disp = caseTransform(l.text, st.textCase)
  const paras: Unit[][] = [[]]
  for (let i = 0; i < l.text.length; i++) {
    if (disp[i] === '') continue
    const code = l.text.charCodeAt(i)
    const n = code >= 0xd800 && code <= 0xdbff ? 2 : 1
    const ch = l.text[i]
    const rs = n === 1 && ch === '\n' ? resolveStyle(l, l.chars[i - 1] ?? null) : resolveStyle(l, l.chars[i])
    const u: Unit = { i, n, disp: ch === '\n' ? '' : disp[i], rs, nl: ch === '\n', space: /\s/.test(ch) }
    paras[paras.length - 1].push(u)
    if (u.nl) paras.push([])
  }

  const glyphs: G[] = []
  const lines: LineInfo[] = []
  const vertical = st.direction === 'vertical'

  if (vertical) {
    const colW = st.size * st.lineHeight
    let maxH = 0
    const cols: Unit[][] = paras
    cols.forEach((col, c) => {
      const units = col.filter((u) => !u.nl)
      const { xs, end } = measure(units)
      let y = 0
      const a = glyphs.length
      units.forEach((u, k) => {
        const w = (k + 1 < units.length ? xs[k + 1] : end) - xs[k] - u.rs.tracking
        const step = u.rs.size * 0.92 + u.rs.tracking
        glyphs.push({ i: u.i, n: u.n, disp: u.disp, x: 0, y: y + u.rs.asc * 0.86, lineY: 0, adv: step, w, rs: u.rs, line: c, space: u.space, nl: false })
        y += step
      })
      const nl = col.find((u) => u.nl)
      if (nl) glyphs.push({ i: nl.i, n: 1, disp: '', x: 0, y: y + base.asc * 0.86, lineY: 0, adv: 0, w: 0, rs: nl.rs, line: c, space: true, nl: true })
      maxH = Math.max(maxH, y)
      lines.push({ a, b: glyphs.length, x: 0, y: 0, width: colW, top: 0, height: y })
    })
    const W = cols.length * colW
    lines.forEach((ln, c) => {
      const cx = W - (c + 0.5) * colW
      ln.x = cx - colW / 2
      for (let k = ln.a; k < ln.b; k++) {
        const g = glyphs[k]
        g.x = cx - g.w / 2
        g.lineY = g.y
        g.y -= g.rs.baseline
      }
    })
    const H = l.fixedHeight ? l.h : Math.max(maxH, base.size)
    return { glyphs, lines, W, H, vertical: true, path: null, base }
  }

  const maxW = l.autoWidth || l.path.enabled ? Infinity : Math.max(1, l.w)
  type RawLine = { units: Unit[]; xs: number[]; x0: number; xEnd: number; width: number; para: number; last: boolean }
  const raw: RawLine[] = []
  paras.forEach((p, pi) => {
    const { xs, end } = measure(p)
    const pos = (k: number) => (k < p.length ? xs[k] : end)
    let start = 0
    const push = (a: number, b: number, last: boolean) => {
      // width excludes trailing spaces / newline
      let e = b
      while (e > a && (p[e - 1].space || p[e - 1].nl)) e--
      raw.push({ units: p.slice(a, b), xs: xs.slice(a, b), x0: pos(a), xEnd: pos(b), width: pos(e) - pos(a), para: pi, last })
    }
    if (maxW !== Infinity) {
      let k = 0
      while (k < p.length) {
        // next word [k, wEnd) and following spaces up to sEnd
        let wEnd = k
        while (wEnd < p.length && !p[wEnd].space) wEnd++
        let sEnd = wEnd
        while (sEnd < p.length && p[sEnd].space && !p[sEnd].nl) sEnd++
        if (sEnd < p.length && p[sEnd].nl) sEnd++
        if (pos(wEnd) - pos(start) > maxW && k > start) {
          push(start, k, false)
          start = k
        }
        // word longer than a line: break by character
        while (pos(wEnd) - pos(start) > maxW && wEnd - start > 1) {
          let c = start + 1
          while (c < wEnd && pos(c + 1) - pos(start) <= maxW) c++
          push(start, c, false)
          start = c
        }
        k = sEnd
      }
    }
    push(start, p.length, true)
  })

  const W = l.autoWidth || l.path.enabled ? Math.max(1, ...raw.map((r) => r.width)) : Math.max(1, l.w)
  let top = 0
  raw.forEach((r, li) => {
    const units = r.units.length ? r.units : []
    let A = base.asc, D = base.desc, L = base.size * st.lineHeight
    if (units.some((u) => !u.nl)) {
      A = 0; D = 0; L = 0
      for (const u of units) {
        A = Math.max(A, u.rs.asc + Math.max(0, u.rs.baseline))
        D = Math.max(D, u.rs.desc + Math.max(0, -u.rs.baseline))
        L = Math.max(L, u.rs.baseSize * st.lineHeight)
      }
    }
    if (li > 0 && raw[li - 1].para !== r.para) top += st.paragraphSpacing
    const baseline = top + (L - (A + D)) / 2 + A
    let x = 0
    let extra = 0
    if (st.align === 'center') x = (W - r.width) / 2
    else if (st.align === 'right') x = W - r.width
    else if (st.align === 'justify' && !r.last) {
      let e = units.length
      while (e > 0 && (units[e - 1].space || units[e - 1].nl)) e--
      const spaces = units.slice(0, e).filter((u) => u.space).length
      if (spaces) extra = (W - r.width) / spaces
    }
    const a = glyphs.length
    let shift = 0
    units.forEach((u, k) => {
      let adv = (k + 1 < units.length ? r.xs[k + 1] : r.xEnd) - r.xs[k]
      if (u.nl) adv = 0
      const gx = x + (r.xs[k] - r.x0) + shift
      const isJustSpace = extra && u.space && !u.nl
      glyphs.push({
        i: u.i, n: u.n, disp: u.disp, x: gx, y: baseline - u.rs.baseline, lineY: baseline,
        adv: adv + (isJustSpace ? extra : 0), w: Math.max(0, adv - u.rs.tracking), rs: u.rs, line: li, space: u.space, nl: u.nl,
      })
      if (isJustSpace) shift += extra
    })
    lines.push({ a, b: glyphs.length, x, y: baseline, width: r.width + (extra ? W - r.width : 0), top, height: L })
    top += L
  })
  let H = top
  let path: PathGeom | null = null
  if (l.path.enabled) {
    path = pathGeometry(l.path, st.size)
    return { glyphs, lines, W: path.W, H: path.H, vertical: false, path, base }
  }
  if (l.fixedHeight) {
    const dy = (l.h - top) * (st.vAlign === 'middle' ? 0.5 : st.vAlign === 'bottom' ? 1 : 0)
    if (dy) {
      glyphs.forEach((g) => { g.y += dy; g.lineY += dy })
      lines.forEach((ln) => { ln.y += dy; ln.top += dy })
    }
    H = l.h
  }
  return { glyphs, lines, W, H: Math.max(H, 1), vertical: false, path, base }
}

export function invalidateLayouts() {
  cache.clear()
}
