// Turns grid glyphs + module parameters into vector outlines.
// The same contours drive the on-screen preview (SVG) and the exported .otf, so what you see is what you install.
import opentype from 'opentype.js'
import { ROWS, type GlyphRows } from './glyphs'

export type ModuleShape = 'square' | 'circle' | 'diamond' | 'rounded'

export interface MakerParams {
  shape: ModuleShape
  size: number // module size, % of cell
  roundness: number // rounded corners, % of module
  connect: boolean // bridge orthogonal neighbours
  diagonals: boolean // bridge diagonal neighbours (only where the corner is open)
  hBridge: number // thickness of horizontal bridges, % of module height
  vBridge: number // thickness of vertical bridges, % of module width
  width: number // cell width, % of cell height
  slant: number // degrees
  spacing: number // letter spacing, in cells
}

export const PARAM_DEFAULT: MakerParams = {
  shape: 'circle',
  size: 72,
  roundness: 30,
  connect: true,
  diagonals: true,
  hBridge: 100,
  vBridge: 100,
  width: 100,
  slant: 0,
  spacing: 1,
}

export const UPM = 1000
export const CELL_H = 100 // 7 rows → cap height 700
export const CAP = CELL_H * ROWS
export const ASC = 800
export const DESC = -200

type Pt = [number, number]
type Cmd = { t: 'M' | 'L'; p: Pt } | { t: 'C'; a: Pt; b: Pt; p: Pt } | { t: 'Z' }
type Contour = Cmd[]

const K = 0.5522847498

// All contours are built counter-clockwise in y-up font space, so overlaps union under the nonzero rule.
function ellipse(cx: number, cy: number, rx: number, ry: number): Contour {
  return [
    { t: 'M', p: [cx + rx, cy] },
    { t: 'C', a: [cx + rx, cy + ry * K], b: [cx + rx * K, cy + ry], p: [cx, cy + ry] },
    { t: 'C', a: [cx - rx * K, cy + ry], b: [cx - rx, cy + ry * K], p: [cx - rx, cy] },
    { t: 'C', a: [cx - rx, cy - ry * K], b: [cx - rx * K, cy - ry], p: [cx, cy - ry] },
    { t: 'C', a: [cx + rx * K, cy - ry], b: [cx + rx, cy - ry * K], p: [cx + rx, cy] },
    { t: 'Z' },
  ]
}

function polygon(pts: Pt[]): Contour {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
    area += x1 * y2 - x2 * y1
  }
  const ordered = area < 0 ? [...pts].reverse() : pts
  return [{ t: 'M', p: ordered[0] }, ...ordered.slice(1).map((p) => ({ t: 'L' as const, p })), { t: 'Z' }]
}

function rect(x0: number, y0: number, x1: number, y1: number): Contour {
  return polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
}

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Contour {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  if (r <= 0.5) return rect(x0, y0, x1, y1)
  const k = r * (1 - K)
  return [
    { t: 'M', p: [x0 + r, y0] },
    { t: 'L', p: [x1 - r, y0] },
    { t: 'C', a: [x1 - k, y0], b: [x1, y0 + k], p: [x1, y0 + r] },
    { t: 'L', p: [x1, y1 - r] },
    { t: 'C', a: [x1, y1 - k], b: [x1 - k, y1], p: [x1 - r, y1] },
    { t: 'L', p: [x0 + r, y1] },
    { t: 'C', a: [x0 + k, y1], b: [x0, y1 - k], p: [x0, y1 - r] },
    { t: 'L', p: [x0, y0 + r] },
    { t: 'C', a: [x0, y0 + k], b: [x0 + k, y0], p: [x0 + r, y0] },
    { t: 'Z' },
  ]
}

function bar(a: Pt, b: Pt, thick: number): Contour {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (thick / 2), ny = (dx / len) * (thick / 2)
  return polygon([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]])
}

export const cellW = (p: MakerParams) => (CELL_H * p.width) / 100

export function glyphMetrics(rows: GlyphRows, p: MakerParams) {
  const cols = rows[0]?.length ?? 0
  const cw = cellW(p)
  const lsb = (p.spacing * cw) / 2
  return { cols, cw, lsb, advance: Math.round(cols * cw + p.spacing * cw) }
}

export function buildContours(rows: GlyphRows, p: MakerParams): Contour[] {
  const { cols, cw, lsb } = glyphMetrics(rows, p)
  const on = (c: number, r: number) => r >= 0 && r < ROWS && c >= 0 && c < cols && rows[r][c] === '#'
  const mw = (cw * p.size) / 100
  const mh = (CELL_H * p.size) / 100
  const center = (c: number, r: number): Pt => [lsb + c * cw + cw / 2, (ROWS - 1 - r) * CELL_H + CELL_H / 2]
  const out: Contour[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      if (!on(c, r)) continue
      const [cx, cy] = center(c, r)
      if (p.shape === 'circle') out.push(ellipse(cx, cy, mw / 2, mh / 2))
      else if (p.shape === 'diamond') out.push(polygon([[cx + mw / 2, cy], [cx, cy + mh / 2], [cx - mw / 2, cy], [cx, cy - mh / 2]]))
      else if (p.shape === 'rounded') out.push(roundedRect(cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2, (Math.min(mw, mh) * p.roundness) / 100))
      else out.push(rect(cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2))
      if (p.connect) {
        if (on(c + 1, r)) {
          const t = (mh * p.hBridge) / 100
          const [bx] = center(c + 1, r)
          out.push(rect(cx, cy - t / 2, bx, cy + t / 2))
        }
        if (on(c, r + 1)) {
          const t = (mw * p.vBridge) / 100
          const [, by] = center(c, r + 1)
          out.push(rect(cx - t / 2, by, cx + t / 2, cy))
        }
      }
      if (p.diagonals) {
        const t = (Math.min(mw, mh) * (p.hBridge + p.vBridge)) / 200
        // down-right and down-left neighbours, only across an open corner
        if (on(c + 1, r + 1) && !on(c + 1, r) && !on(c, r + 1)) out.push(bar([cx, cy], center(c + 1, r + 1), t))
        if (on(c - 1, r + 1) && !on(c - 1, r) && !on(c, r + 1)) out.push(bar([cx, cy], center(c - 1, r + 1), t))
      }
    }
  }
  if (p.slant) {
    const s = Math.tan((p.slant * Math.PI) / 180)
    const sk = (q: Pt): Pt => [q[0] + q[1] * s, q[1]]
    return out.map((ct) => ct.map((cmd) => (cmd.t === 'Z' ? cmd : cmd.t === 'C' ? { t: 'C', a: sk(cmd.a), b: sk(cmd.b), p: sk(cmd.p) } : { t: cmd.t, p: sk(cmd.p) })))
  }
  return out
}

const f1 = (n: number) => Math.round(n * 10) / 10

/** SVG path data in a y-down box whose top is the ascender line. */
export function contoursToSvg(contours: Contour[], x = 0, y = 0, scale = 1): string {
  const X = (q: Pt) => f1(x + q[0] * scale)
  const Y = (q: Pt) => f1(y + (ASC - q[1]) * scale)
  let d = ''
  for (const ct of contours)
    for (const c of ct) {
      if (c.t === 'Z') d += 'Z'
      else if (c.t === 'C') d += `C${X(c.a)} ${Y(c.a)} ${X(c.b)} ${Y(c.b)} ${X(c.p)} ${Y(c.p)}`
      else d += `${c.t}${X(c.p)} ${Y(c.p)}`
    }
  return d
}

/** Lay out a string; returns path data plus total width in font units. */
export function layoutText(text: string, glyphs: Record<string, GlyphRows>, p: MakerParams) {
  let x = 0
  let d = ''
  for (const ch of text.toUpperCase()) {
    const rows = glyphs[ch] ?? glyphs['?']
    if (!rows) continue
    d += contoursToSvg(buildContours(rows, p), x, 0)
    x += glyphMetrics(rows, p).advance
  }
  return { d, width: x }
}

export function buildFont(name: string, glyphs: Record<string, GlyphRows>, p: MakerParams): ArrayBuffer {
  const family = name.trim() || 'Untitled'
  const notdef = new opentype.Path()
  const nd = (CELL_H * 5 * p.width) / 100
  for (const [a, b, c2, d2] of [[0, 0, nd, CAP], [40, 40, nd - 40, CAP - 40]] as const) {
    notdef.moveTo(a, b)
    if (a === 0) { notdef.lineTo(c2, b); notdef.lineTo(c2, d2); notdef.lineTo(a, d2) }
    else { notdef.lineTo(a, d2); notdef.lineTo(c2, d2); notdef.lineTo(c2, b) }
    notdef.close()
  }
  const list: opentype.Glyph[] = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: Math.round(nd + cellW(p)), path: notdef })]
  for (const [ch, rows] of Object.entries(glyphs)) {
    const path = new opentype.Path()
    for (const ct of buildContours(rows, p))
      for (const c of ct) {
        if (c.t === 'M') path.moveTo(f1(c.p[0]), f1(c.p[1]))
        else if (c.t === 'L') path.lineTo(f1(c.p[0]), f1(c.p[1]))
        else if (c.t === 'C') path.curveTo(f1(c.a[0]), f1(c.a[1]), f1(c.b[0]), f1(c.b[1]), f1(c.p[0]), f1(c.p[1]))
        else path.close()
      }
    const code = ch.codePointAt(0)!
    const lower = ch.toLowerCase().codePointAt(0)!
    const unicodes = lower !== code ? [code, lower] : [code]
    const glyph = new opentype.Glyph({
      name: ch === ' ' ? 'space' : /[A-Z0-9]/.test(ch) ? (/[0-9]/.test(ch) ? `uni${code.toString(16).toUpperCase().padStart(4, '0')}` : ch) : `uni${code.toString(16).toUpperCase().padStart(4, '0')}`,
      unicode: code,
      advanceWidth: glyphMetrics(rows, p).advance,
      path,
    })
    ;(glyph as unknown as { unicodes: number[] }).unicodes = unicodes
    list.push(glyph)
  }
  const font = new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASC,
    descender: DESC,
    glyphs: list,
  })
  return font.toArrayBuffer()
}
