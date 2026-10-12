import type { Layer, TextLayer } from '../types'
import { getLayout, type Layout } from './layout'
import { glyphTransforms, layerMatrix, needsGlyphMode } from './distort'
import { apply, inv, pointInPoly, type Mat, type Pt } from './geom'
import { pathAt } from './path'

export type Poly = Pt[]

/** glyph polygons in layer-local coords (null for newline) */
export function glyphPolys(l: TextLayer, lay: Layout): (Poly | null)[] {
  if (lay.path) {
    const p = l.path
    const extra = (p.spacing / 1000) * l.style.size
    const gl = lay.glyphs
    const total = gl.reduce((s, g) => s + (g.nl ? 0 : g.adv) + extra, 0)
    const len = pathAt(lay.path.d, 0).len
    let s = (lay.path.startPct / 100) * len - (lay.path.anchor === 'middle' ? total / 2 : 0)
    const dy = p.side === 'inside' ? lay.base.capH + p.offset : -p.offset
    return gl.map((g) => {
      const adv = g.nl ? 0 : g.adv
      const mid = pathAt(lay.path!.d, s + adv / 2)
      s += adv + extra
      const c = Math.cos(mid.a), sn = Math.sin(mid.a)
      const pt = (lx: number, ly: number): Pt => ({ x: mid.x + lx * c - (ly + dy) * sn, y: mid.y + lx * sn + (ly + dy) * c })
      const a = g.rs.asc, d = g.rs.desc
      return [pt(-adv / 2, -a), pt(adv / 2, -a), pt(adv / 2, d), pt(-adv / 2, d)]
    })
  }
  if (needsGlyphMode(l)) {
    const gts = glyphTransforms(l, lay)
    return lay.glyphs.map((g, k) => {
      const t = gts[k]
      if (g.nl) return null
      const top = g.y - g.rs.asc, bot = g.y + g.rs.desc
      if (!t) {
        // space: keep it in flow position (with warp it's approximate)
        return [
          { x: g.x, y: top },
          { x: g.x + g.adv, y: top },
          { x: g.x + g.adv, y: bot },
          { x: g.x, y: bot },
        ]
      }
      const ty0 = t.ty - g.rs.asc, ty1 = t.ty + g.rs.desc
      return [
        apply(t.m, { x: t.tx, y: ty0 }),
        apply(t.m, { x: t.tx + g.w, y: ty0 }),
        apply(t.m, { x: t.tx + g.w, y: ty1 }),
        apply(t.m, { x: t.tx, y: ty1 }),
      ]
    })
  }
  return lay.glyphs.map((g) => {
    if (g.nl) return null
    const top = g.y - g.rs.asc, bot = g.y + g.rs.desc
    return [
      { x: g.x, y: top },
      { x: g.x + g.adv, y: top },
      { x: g.x + g.adv, y: bot },
      { x: g.x, y: bot },
    ]
  })
}

export function localBounds(l: Layer, fv: number): { x: number; y: number; w: number; h: number; W: number; H: number } {
  if (l.type !== 'text') return { x: 0, y: 0, w: l.w, h: l.h, W: l.w, H: l.h }
  const lay = getLayout(l, fv)
  if (needsGlyphMode(l)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of glyphPolys(l, lay)) {
      if (!p) continue
      for (const q of p) {
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y)
      }
    }
    if (x0 === Infinity) return { x: 0, y: 0, w: lay.W, h: lay.H, W: lay.W, H: lay.H }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, W: lay.W, H: lay.H }
  }
  return { x: 0, y: 0, w: lay.W, h: lay.H, W: lay.W, H: lay.H }
}

export function layerM(l: Layer, fv: number): Mat {
  if (l.type === 'text') {
    const lay = getLayout(l, fv)
    return layerMatrix(l, lay.W, lay.H)
  }
  return layerMatrix(l, l.w, l.h)
}

/** artboard-space polygon of the layer's visual bounds */
export function layerPoly(l: Layer, fv: number): Poly {
  const b = localBounds(l, fv)
  const M = layerM(l, fv)
  const pad = l.type === 'shape' && l.shape === 'line' ? Math.max(4, l.stroke.width) : 0
  return [
    apply(M, { x: b.x, y: b.y - pad }),
    apply(M, { x: b.x + b.w, y: b.y - pad }),
    apply(M, { x: b.x + b.w, y: b.y + b.h + pad }),
    apply(M, { x: b.x, y: b.y + b.h + pad }),
  ]
}

export function aabb(polys: Poly[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of polys)
    for (const q of p) {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y)
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function hitLayer(layers: Layer[], p: Pt, fv: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (!l.visible || l.locked) continue
    if (pointInPoly(p, layerPoly(l, fv))) return l
  }
  return null
}

export function toLocal(l: Layer, fv: number, p: Pt): Pt {
  return apply(inv(layerM(l, fv)), p)
}

/** caret index (UTF-16) nearest to a local point */
export function indexAt(l: TextLayer, lay: Layout, p: Pt): number {
  const polys = glyphPolys(l, lay)
  // direct hit on a glyph polygon
  for (let k = 0; k < polys.length; k++) {
    const poly = polys[k]
    if (poly && pointInPoly(p, poly)) {
      const g = lay.glyphs[k]
      const mid = { x: (poly[0].x + poly[2].x) / 2, y: (poly[0].y + poly[2].y) / 2 }
      const dir = { x: poly[1].x - poly[0].x, y: poly[1].y - poly[0].y }
      const after = (p.x - mid.x) * dir.x + (p.y - mid.y) * dir.y > 0
      return after ? g.i + g.n : g.i
    }
  }
  if (!lay.glyphs.length) return 0
  if (lay.path || needsGlyphMode(l)) {
    let best = 0, bd = Infinity
    polys.forEach((poly, k) => {
      if (!poly) return
      const c = { x: (poly[0].x + poly[2].x) / 2, y: (poly[0].y + poly[2].y) / 2 }
      const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
      if (d < bd) { bd = d; best = k }
    })
    return lay.glyphs[best].i
  }
  // flow: pick line by y, then x
  let li = 0
  lay.lines.forEach((ln, k) => {
    if (p.y >= ln.top) li = k
  })
  const ln = lay.lines[li]
  for (let k = ln.a; k < ln.b; k++) {
    const g = lay.glyphs[k]
    if (g.nl) return g.i
    if (p.x < g.x + g.adv / 2) return g.i
  }
  const last = lay.glyphs[ln.b - 1]
  if (!last) return 0
  if (li < lay.lines.length - 1 && last.space) return last.i
  return last.i + last.n
}

/** caret top & bottom points in local coords */
export function caretAt(l: TextLayer, lay: Layout, index: number): [Pt, Pt] {
  const polys = glyphPolys(l, lay)
  const gl = lay.glyphs
  let k = gl.findIndex((g) => g.i >= index)
  if (k >= 0 && gl[k].i === index && polys[k]) {
    const p = polys[k]!
    return [p[0], p[3]]
  }
  if (k === -1) k = gl.length
  // end of text or after newline
  const prev = gl[k - 1]
  if (!prev) {
    const a = lay.base.asc, d = lay.base.desc
    const y = lay.lines[0]?.y ?? a
    const x = lay.lines[0]?.x ?? 0
    return [{ x, y: y - a }, { x, y: y + d }]
  }
  if (prev.nl) {
    const ln = lay.lines[prev.line + 1]
    const a = lay.base.asc, d = lay.base.desc
    if (lay.vertical) {
      const x = (ln?.x ?? 0) + (ln?.width ?? 0) / 2
      return [{ x: x - lay.base.size / 2, y: 0 }, { x: x + lay.base.size / 2, y: 0 }]
    }
    const y = ln ? ln.y : prev.lineY + lay.base.size * l.style.lineHeight
    const x = ln ? ln.x : 0
    return [{ x, y: y - a }, { x, y: y + d }]
  }
  const p = polys[k - 1]
  if (!p) return [{ x: 0, y: 0 }, { x: 0, y: 10 }]
  return [p[1], p[2]]
}

/** Move caret one visual line up/down */
export function lineStep(l: TextLayer, lay: Layout, index: number, dir: -1 | 1): number {
  if (lay.path || lay.vertical) return index
  const [top] = caretAt(l, lay, index)
  const k = lay.glyphs.findIndex((g) => g.i >= index)
  const line = k >= 0 ? lay.glyphs[k].line : lay.lines.length - 1
  const target = line + dir
  if (target < 0) return 0
  if (target >= lay.lines.length) return l.text.length
  const ln = lay.lines[target]
  return indexAt(l, lay, { x: top.x, y: ln.y - 1 })
}

export { needsGlyphMode }
export function getLay(l: TextLayer, fv: number) {
  return getLayout(l, fv)
}
