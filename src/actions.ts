import { S } from './store'
import { useFonts } from './fonts/registry'
import { aabb, layerPoly } from './engine/hit'
import type { TextLayer, WarpStyle } from './types'
import type { Draft } from 'immer'
import { effectiveWeight } from './engine/style'
import { defaultDistort, solid } from './defaults'

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export function align(op: AlignOp) {
  const s = S()
  const fv = useFonts.getState().version
  const ls = s.doc.layers.filter((l) => s.sel.includes(l.id) && !l.locked)
  if (!ls.length) return s.flash('Select layers to align')
  const boxes = Object.fromEntries(ls.map((l) => [l.id, aabb([layerPoly(l, fv)])]))
  const target = ls.length === 1 ? { x: 0, y: 0, w: s.doc.artboard.w, h: s.doc.artboard.h } : aabb(ls.map((l) => layerPoly(l, fv)))
  s.update((d) => {
    for (const l of d.layers) {
      const b = boxes[l.id]
      if (!b) continue
      if (op === 'left') l.x += target.x - b.x
      if (op === 'hcenter') l.x += target.x + target.w / 2 - (b.x + b.w / 2)
      if (op === 'right') l.x += target.x + target.w - (b.x + b.w)
      if (op === 'top') l.y += target.y - b.y
      if (op === 'vcenter') l.y += target.y + target.h / 2 - (b.y + b.h / 2)
      if (op === 'bottom') l.y += target.y + target.h - (b.y + b.h)
    }
  })
  s.flash(ls.length === 1 ? 'Aligned to artboard' : 'Aligned to selection')
}

export function distribute(axis: 'h' | 'v') {
  const s = S()
  const fv = useFonts.getState().version
  const ls = s.doc.layers.filter((l) => s.sel.includes(l.id) && !l.locked)
  if (ls.length < 3) return s.flash('Select three or more layers to distribute')
  const items = ls.map((l) => ({ id: l.id, b: aabb([layerPoly(l, fv)]) }))
  items.sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))
  const first = items[0].b, last = items[items.length - 1].b
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y
  const total = items.reduce((t, i) => t + (axis === 'h' ? i.b.w : i.b.h), 0)
  const gap = (span - total) / (items.length - 1)
  let pos = axis === 'h' ? first.x : first.y
  const delta: Record<string, number> = {}
  for (const it of items) {
    delta[it.id] = pos - (axis === 'h' ? it.b.x : it.b.y)
    pos += (axis === 'h' ? it.b.w : it.b.h) + gap
  }
  s.update((d) => {
    for (const l of d.layers) if (delta[l.id] !== undefined) axis === 'h' ? (l.x += delta[l.id]) : (l.y += delta[l.id])
  })
  s.flash('Distributed')
}

export function nudge(dx: number, dy: number) {
  const s = S()
  s.update((d) => {
    for (const l of d.layers) if (s.sel.includes(l.id) && !l.locked) { l.x += dx; l.y += dy }
  }, 'nudge')
}

export function reorder(dir: 1 | -1) {
  const s = S()
  if (!s.sel.length) return
  s.update((d) => {
    const idx = d.layers.map((l, i) => (s.sel.includes(l.id) ? i : -1)).filter((i) => i >= 0)
    const order = dir === 1 ? idx.reverse() : idx
    for (const i of order) {
      const j = i + dir
      if (j < 0 || j >= d.layers.length || s.sel.includes(d.layers[j].id)) continue
      const t = d.layers[i]
      d.layers[i] = d.layers[j]
      d.layers[j] = t
    }
  })
}

// ---------- GENERATE ----------
export type GenLevel = 'minimal' | 'moderate' | 'experimental'
export interface GenOpts { font: boolean; weight: boolean; width: boolean; tracking: boolean; leading: boolean; rotation: boolean; scale: boolean; position: boolean; color: boolean; distortion: boolean }
export const GEN_DEFAULT: GenOpts = { font: true, weight: true, width: true, tracking: true, leading: true, rotation: true, scale: false, position: false, color: true, distortion: true }
const PALETTE = ['#111111', '#2b2bff', '#ff3b1f', '#00a86b', '#ffcc00', '#ff2d6f', '#7a5cff', '#0b0b0b']

export function generate(level: GenLevel, o: GenOpts) {
  const s = S()
  const fonts = useFonts.getState().fonts
  const fv = useFonts.getState().version
  const ids = s.sel.length ? s.sel : s.doc.layers.filter((l) => l.type === 'text').map((l) => l.id)
  const R = Math.random
  const rr = (a: number, b: number) => a + R() * (b - a)
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)]
  const k = level === 'minimal' ? 0.25 : level === 'moderate' ? 0.6 : 1
  const A = s.doc.artboard
  s.update((d) => {
    for (const l0 of d.layers) {
      if (!ids.includes(l0.id) || l0.type !== 'text' || l0.locked) continue
      const l = l0 as Draft<TextLayer>
      const st = l.style
      if (o.font && level !== 'minimal') {
        const cur = fonts[st.fontId]
        const pool = Object.values(fonts).filter((f) => (level === 'experimental' ? true : f.category === cur?.category || f.category === 'sans' || f.category === 'serif' || f.category === 'display') && (level === 'experimental' || f.category !== 'experimental'))
        st.fontId = pick(pool).id
      }
      const f = fonts[st.fontId]
      const wAx = f.meta.axes.find((a) => a.tag === 'wght')
      if (o.weight) {
        if (wAx) {
          const span = (wAx.max - wAx.min) * k
          st.weight = Math.round(Math.min(wAx.max, Math.max(wAx.min, st.weight + rr(-span / 2, span / 2))))
          if (level !== 'minimal') st.weight = Math.round(rr(wAx.min + (wAx.max - wAx.min) * (1 - k) * 0.5, wAx.max))
        } else st.weight = effectiveWeight(f, pick(f.meta.weights))
      }
      if (o.width) {
        for (const a of f.meta.axes) {
          if (a.tag === 'wght' || a.tag === 'opsz') continue
          if (a.tag !== 'wdth' && level === 'minimal') continue
          if (a.tag !== 'wdth' && level === 'moderate' && R() < 0.5) continue
          const cur = st.axes[a.tag] ?? a.def
          const span = (a.max - a.min) * k
          st.axes[a.tag] = Math.round(Math.min(a.max, Math.max(a.min, cur + rr(-span / 2, span / 2))) * 10) / 10
        }
      }
      if (o.tracking) st.tracking = Math.round(level === 'minimal' ? st.tracking + rr(-15, 15) : level === 'moderate' ? rr(-60, 120) : rr(-90, 400))
      if (o.leading) st.lineHeight = Math.round((level === 'minimal' ? st.lineHeight + rr(-0.06, 0.06) : level === 'moderate' ? rr(0.82, 1.25) : rr(0.7, 1.6)) * 100) / 100
      if (o.rotation) l.rotation = Math.round(level === 'minimal' ? l.rotation + rr(-2, 2) : level === 'moderate' ? rr(-8, 8) : pick([0, 90, -90, rr(-35, 35)]))
      if (o.scale) {
        const sc = level === 'minimal' ? rr(0.95, 1.05) : level === 'moderate' ? rr(0.85, 1.2) : rr(0.6, 1.5)
        st.size = Math.round(st.size * sc)
      }
      if (o.position) {
        const m = level === 'minimal' ? 20 : level === 'moderate' ? 80 : 300
        l.x = Math.round(Math.min(A.w - 40, Math.max(-l.w * 0.5, l.x + rr(-m, m))))
        l.y = Math.round(Math.min(A.h - 40, Math.max(0, l.y + rr(-m, m))))
      }
      if (o.color) {
        if (level === 'experimental' && R() < 0.4) {
          l.fill = { ...solid(pick(PALETTE)), type: R() < 0.5 ? 'linear' : 'radial', stops: [{ offset: 0, color: pick(PALETTE) }, { offset: 1, color: pick(PALETTE) }], angle: Math.round(rr(0, 360)) }
        } else l.fill = solid(level === 'minimal' ? pick(['#111111', '#1a1a1a', '#2b2bff']) : pick(PALETTE))
      }
      if (o.distortion) {
        const dd = defaultDistort()
        if (level === 'minimal') {
          dd.rRotation = Math.round(rr(0, 3))
          dd.rY = Math.round(rr(0, 4))
        } else if (level === 'moderate') {
          dd.warp = pick<WarpStyle>(['none', 'arc', 'wave', 'flag', 'bulge', 'rise'])
          dd.bend = Math.round(rr(-35, 35))
          dd.rRotation = Math.round(rr(0, 6))
        } else {
          dd.warp = pick<WarpStyle>(['arc', 'arch', 'wave', 'flag', 'bulge', 'fisheye', 'rise', 'squeeze'])
          dd.bend = Math.round(rr(-75, 75))
          dd.perspX = Math.round(rr(-25, 25))
          dd.rRotation = Math.round(rr(0, 25))
          dd.rScale = Math.round(rr(0, 25))
          dd.rY = Math.round(rr(0, 20))
          dd.rWeight = wAx ? Math.round(rr(0, 300)) : 0
        }
        dd.seed = Math.floor(R() * 9999)
        l.distort = dd
      }
    }
  })
  void fv
  s.flash(`Generated · ${level}`)
}
