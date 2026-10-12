import type { Distort, Layer, TextLayer } from '../types'
import type { Layout } from './layout'
import { chain, mulberry, R, Sc, Sk, T, type Mat, type Pt } from './geom'
import { variationSettings } from './style'

export function warpActive(d: Distort) {
  return (d.warp !== 'none' && d.bend !== 0 && d.intensity !== 0) || d.hDist !== 0 || d.vDist !== 0
}
export function randomActive(d: Distort) {
  return !!(d.rRotation || d.rScale || d.rX || d.rY || d.rTracking || d.rWidth || d.rWeight)
}
export function needsGlyphMode(l: TextLayer) {
  if (l.path.enabled) return false
  const d = l.distort
  if (l.style.direction === 'vertical' || warpActive(d) || d.perspX || d.perspY || randomActive(d)) return true
  return l.chars.some((c) => c && (c.rotate || (c.scaleX ?? 1) !== 1 || (c.scaleY ?? 1) !== 1 || c.dx || c.dy))
}

/** layer-local box → artboard */
export function layerMatrix(l: Layer, W: number, H: number): Mat {
  const skx = l.type === 'text' ? l.distort.skewX : 0
  const sky = l.type === 'text' ? l.distort.skewY : 0
  return chain(
    T(l.x + W / 2, l.y + H / 2),
    R(l.rotation),
    Sc(l.scaleX * (l.flipH ? -1 : 1), l.scaleY * (l.flipV ? -1 : 1)),
    Sk(skx, sky),
    T(-W / 2, -H / 2),
  )
}

export function makeWarp(d: Distort, W: number, H: number): (p: Pt) => Pt {
  const cx = W / 2, cy = H / 2
  const s = (d.bend / 100) * (d.intensity / 100)
  const h = (d.hDist / 100) * (d.intensity / 100)
  const vd = (d.vDist / 100) * (d.intensity / 100)
  const freq = Math.max(0.25, d.frequency)
  const fx = (d.perspX * Math.PI) / 180, fy = (d.perspY * Math.PI) / 180
  const focal = Math.max(W, H) * 1.6
  const style = d.warp
  return ({ x, y }) => {
    const u = x / W, v = y / H
    let X = x, Y = y
    if (style !== 'none' && Math.abs(s) > 1e-4) {
      switch (style) {
        case 'arc': {
          const Rr = W / (Math.abs(s) * Math.PI)
          const th = (x - cx) / Rr
          if (s > 0) {
            const r = Rr + (cy - y)
            X = cx + r * Math.sin(th); Y = cy + Rr - r * Math.cos(th)
          } else {
            const r = Rr + (y - cy)
            X = cx + r * Math.sin(th); Y = cy - Rr + r * Math.cos(th)
          }
          break
        }
        case 'arch':
          Y = y - s * H * 0.9 * (1 - (2 * u - 1) ** 2) * (1 - v * 0.5)
          break
        case 'wave':
          Y = y + s * H * 0.35 * Math.sin(2 * Math.PI * u * freq)
          break
        case 'flag': {
          const ph = 2 * Math.PI * u * freq
          Y = y + s * H * 0.28 * Math.sin(ph) * (0.25 + 0.75 * u)
          X = x + s * W * 0.015 * Math.cos(ph)
          Y = cy + (Y - cy) * (1 + s * 0.12 * Math.cos(ph))
          break
        }
        case 'bulge':
          Y = cy + (y - cy) * (1 + s * 0.9 * (1 - (2 * u - 1) ** 2))
          break
        case 'squeeze':
          Y = cy + (y - cy) * (1 - s * 0.6 * (1 - (2 * u - 1) ** 2))
          X = cx + (x - cx) * (1 - s * 0.12 * (1 - (2 * v - 1) ** 2))
          break
        case 'fisheye': {
          const nx = (x - cx) / (W / 2), ny = (y - cy) / (H / 2)
          const r2 = nx * nx + ny * ny
          const f = 1 + s * 0.85 * Math.max(0, 1 - r2 * 0.6)
          X = cx + (x - cx) * f; Y = cy + (y - cy) * f
          break
        }
        case 'rise': {
          const t = u * u * (3 - 2 * u)
          Y = y - s * H * 0.9 * (t - 0.5)
          break
        }
      }
    }
    if (h) Y = cy + (Y - cy) * (1 + h * (X / W - 0.5) * 1.6)
    if (vd) X = cx + (X - cx) * (1 + vd * (0.5 - Y / H) * 1.6)
    if (fx || fy) {
      const px = X - cx, py = Y - cy
      const x1 = px * Math.cos(fx)
      const z1 = -px * Math.sin(fx)
      const y2 = py * Math.cos(fy)
      const z2 = z1 + py * Math.sin(fy)
      const k = focal / Math.max(focal * 0.15, focal + z2)
      X = cx + x1 * k; Y = cy + y2 * k
    }
    return { x: X, y: Y }
  }
}

export interface GlyphT {
  m: Mat // glyph-local → box-local
  tx: number // text x in glyph-local
  ty: number // text baseline y in glyph-local
  vs?: string // per-glyph variation override (random weight/width)
  weight?: number
}

const gcache = new WeakMap<Layout, Map<string, (GlyphT | null)[]>>()

export function glyphTransforms(l: TextLayer, lay: Layout): (GlyphT | null)[] {
  const key = JSON.stringify(l.distort)
  let m = gcache.get(lay)
  if (!m) gcache.set(lay, (m = new Map()))
  const hit = m.get(key)
  if (hit) return hit
  const d = l.distort
  const F = makeWarp(d, lay.W, lay.H)
  const rnd = mulberry(d.seed * 7919 + 13)
  let trackShift = 0
  let lastLine = -1
  const out = lay.glyphs.map((g) => {
    const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()].map((v) => v * 2 - 1)
    if (g.line !== lastLine) {
      trackShift = 0
      lastLine = g.line
    }
    if (g.space || g.nl) {
      trackShift += (r[4] * d.rTracking * g.rs.size) / 1000
      return null
    }
    const ay0 = lay.vertical ? g.lineY - g.rs.capH / 2 : g.lineY - g.rs.capH / 2
    const ax = g.x + g.w / 2 + g.rs.dx + r[2] * d.rX + trackShift
    const ay = ay0 + g.rs.dy + r[3] * d.rY
    trackShift += (r[4] * d.rTracking * g.rs.size) / 1000
    const P = F({ x: ax, y: ay })
    const e = 0.5
    const px = F({ x: ax + e, y: ay }), py = F({ x: ax, y: ay + e })
    const J: Mat = [(px.x - P.x) / e, (px.y - P.y) / e, (py.x - P.x) / e, (py.y - P.y) / e, P.x, P.y]
    const sc = 1 + (r[1] * d.rScale) / 100
    const mat = chain(J, R(g.rs.rotate + r[0] * d.rRotation), Sc(g.rs.scaleX * sc, g.rs.scaleY * sc))
    const gt: GlyphT = { m: mat, tx: -g.w / 2, ty: g.y - ay0 }
    if (d.rWeight || d.rWidth) {
      const f = g.rs.font
      const wAx = f.meta.axes.find((a) => a.tag === 'wght')
      const weight = wAx ? Math.min(wAx.max, Math.max(wAx.min, g.rs.weight + r[5] * d.rWeight)) : g.rs.weight
      const wdAx = f.meta.axes.find((a) => a.tag === 'wdth')
      const width = wdAx ? Math.min(wdAx.max, Math.max(wdAx.min, (l.style.axes.wdth ?? wdAx.def) + r[6] * d.rWidth)) : undefined
      gt.weight = weight
      gt.vs = variationSettings(f, l.style, weight, width)
      if (!wdAx && d.rWidth) gt.m = chain(gt.m, Sc(1 + (r[6] * d.rWidth) / 100, 1))
    }
    return gt
  })
  m.set(key, out)
  return out
}
