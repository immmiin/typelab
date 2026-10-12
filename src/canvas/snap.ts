import type { Doc } from '../types'
import { aabb, layerPoly } from '../engine/hit'

export interface SnapLine { axis: 'x' | 'y'; pos: number }
type Box = { x: number; y: number; w: number; h: number }

export function gridLines(d: Doc) {
  const { w: W, h: H } = d.artboard
  const g = d.grid
  const xs: number[] = []
  const ys: number[] = []
  if (g.type === 'uniform') {
    const sz = Math.max(1, g.size)
    for (let x = 0; x <= W + 0.01; x += sz) xs.push(x)
    for (let y = 0; y <= H + 0.01; y += sz) ys.push(y)
    return { xs, ys }
  }
  if (g.cols > 0) {
    const cw = (W - 2 * g.margin - (g.cols - 1) * g.gutter) / g.cols
    for (let i = 0; i < g.cols; i++) {
      const x = g.margin + i * (cw + g.gutter)
      xs.push(x, x + cw)
    }
  }
  if (g.rows > 0) {
    const rh = (H - 2 * g.margin - (g.rows - 1) * g.gutter) / g.rows
    for (let i = 0; i < g.rows; i++) {
      const y = g.margin + i * (rh + g.gutter)
      ys.push(y, y + rh)
    }
  }
  return { xs, ys }
}

export function snapCandidates(d: Doc, exclude: Set<string>, fv: number) {
  const X: number[] = []
  const Y: number[] = []
  const { w: W, h: H } = d.artboard
  if (d.snap.center) {
    X.push(0, W / 2, W)
    Y.push(0, H / 2, H)
  }
  if (d.snap.guides && d.showGuides) d.guides.forEach((g) => (g.axis === 'x' ? X : Y).push(g.pos))
  if (d.snap.grid) {
    if (d.grid.show) {
      const { xs, ys } = gridLines(d)
      X.push(...xs)
      Y.push(...ys)
    }
    if (d.baseline.show && d.baseline.size > 2) for (let y = d.baseline.offset; y <= H; y += d.baseline.size) Y.push(y)
  }
  if (d.snap.objects)
    for (const l of d.layers) {
      if (exclude.has(l.id) || !l.visible) continue
      const b = aabb([layerPoly(l, fv)])
      X.push(b.x, b.x + b.w / 2, b.x + b.w)
      Y.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
  return { X, Y }
}

export function snapBox(box: Box, dx: number, dy: number, cand: { X: number[]; Y: number[] }, thr: number) {
  const lines: SnapLine[] = []
  const best = (edges: number[], list: number[]) => {
    let bd = thr, delta = 0, pos: number | null = null
    for (const e of edges)
      for (const c of list) {
        const dd = Math.abs(c - e)
        if (dd < bd) { bd = dd; delta = c - e; pos = c }
      }
    return { delta, pos }
  }
  const bx = best([box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx], cand.X)
  const by = best([box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy], cand.Y)
  if (bx.pos !== null) lines.push({ axis: 'x', pos: bx.pos })
  if (by.pos !== null) lines.push({ axis: 'y', pos: by.pos })
  return { dx: dx + bx.delta, dy: dy + by.delta, lines }
}

export function snapPoint(v: number, list: number[], thr: number) {
  let bd = thr, out = v, hit: number | null = null
  for (const c of list) {
    const d = Math.abs(c - v)
    if (d < bd) { bd = d; out = c; hit = c }
  }
  return { v: out, hit }
}
