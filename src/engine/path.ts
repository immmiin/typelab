import type { PathOpts } from '../types'

export interface PathGeom {
  d: string
  W: number
  H: number
  anchor: 'middle' | 'start'
  startPct: number
}

const NS = 'http://www.w3.org/2000/svg'
let probe: SVGPathElement | null = null
function samplePath(d: string): [number, number][] {
  if (!probe) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('style', 'position:absolute;left:-100000px;top:0;width:10px;height:10px;visibility:hidden')
    probe = document.createElementNS(NS, 'path') as SVGPathElement
    svg.appendChild(probe)
    document.body.appendChild(svg)
  }
  try {
    probe.setAttribute('d', d)
    const len = probe.getTotalLength()
    if (!isFinite(len) || len <= 0) throw new Error('empty')
    const n = Math.min(1200, Math.max(40, Math.ceil(len / 3)))
    const pts: [number, number][] = []
    for (let k = 0; k <= n; k++) {
      const p = probe.getPointAtLength((len * k) / n)
      pts.push([p.x, p.y])
    }
    return pts
  } catch {
    return [
      [0, 0],
      [400, 0],
    ]
  }
}

const cache = new Map<string, PathGeom>()

export function pathGeometry(o: PathOpts, size: number): PathGeom {
  const key = JSON.stringify([o.type, o.radius, o.sweep, o.amplitude, o.wavelength, o.length, o.turns, o.growth, o.custom, o.direction, o.reverse, o.start, size])
  const hit = cache.get(key)
  if (hit) return hit
  let pts: [number, number][] = []
  let anchor: 'middle' | 'start' = 'middle'
  const dir = o.direction
  if (o.type === 'circle') {
    // starts at 6 o'clock so the text centre (50%) lands at 12 o'clock (CW) or 6 o'clock (CCW start at top)
    const r = Math.max(10, o.radius)
    const n = 360
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * Math.PI * 2
      const a = dir === 1 ? Math.PI / 2 + t : -Math.PI / 2 - t
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  } else if (o.type === 'arc') {
    const r = Math.max(10, o.radius)
    const sw = (Math.max(5, Math.min(359, o.sweep)) * Math.PI) / 180
    const n = 240
    for (let k = 0; k <= n; k++) {
      const t = -sw / 2 + (sw * k) / n
      const a = dir === 1 ? -Math.PI / 2 + t : Math.PI / 2 - t
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  } else if (o.type === 'wave') {
    const L = Math.max(50, o.length)
    const n = Math.ceil(L / 4)
    for (let k = 0; k <= n; k++) {
      const x = -L / 2 + (L * k) / n
      pts.push([x, dir * o.amplitude * Math.sin((2 * Math.PI * x) / Math.max(20, o.wavelength))])
    }
  } else if (o.type === 'spiral') {
    anchor = 'start'
    const turns = Math.max(0.25, o.turns)
    const r0 = Math.max(4, o.radius * 0.25)
    const n = Math.ceil(turns * 180)
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * turns * Math.PI * 2
      const r = r0 + (o.growth * t) / (Math.PI * 2)
      const a = -Math.PI / 2 + dir * t
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  } else {
    anchor = 'start'
    pts = samplePath(o.custom)
  }
  if (o.reverse) pts.reverse()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  const m = size * 1.1
  const ox = -minX + m, oy = -minY + m
  const d = 'M' + pts.map(([x, y]) => `${(x + ox).toFixed(2)} ${(y + oy).toFixed(2)}`).join(' L')
  const g: PathGeom = {
    d,
    W: maxX - minX + 2 * m,
    H: maxY - minY + 2 * m,
    anchor,
    startPct: (anchor === 'middle' ? 50 : 0) + o.start,
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, g)
  return g
}

let probe2: SVGPathElement | null = null
let probeD = ''
let probeLen = 0
/** Point + tangent angle at distance s along d */
export function pathAt(d: string, s: number): { x: number; y: number; a: number; len: number } {
  if (!probe2) {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('style', 'position:absolute;left:-100000px;top:0;width:10px;height:10px;visibility:hidden')
    probe2 = document.createElementNS(NS, 'path') as SVGPathElement
    svg.appendChild(probe2)
    document.body.appendChild(svg)
  }
  if (probeD !== d) {
    probe2.setAttribute('d', d)
    probeD = d
    try { probeLen = probe2.getTotalLength() } catch { probeLen = 0 }
  }
  const L = probeLen
  const c = Math.max(0, Math.min(L, s))
  try {
    const p = probe2.getPointAtLength(c)
    const q = probe2.getPointAtLength(Math.min(L, c + 0.5))
    const p0 = c + 0.5 > L ? probe2.getPointAtLength(Math.max(0, c - 0.5)) : p
    const a = c + 0.5 > L ? Math.atan2(p.y - p0.y, p.x - p0.x) : Math.atan2(q.y - p.y, q.x - p.x)
    return { x: p.x, y: p.y, a, len: L }
  } catch {
    return { x: 0, y: 0, a: 0, len: L }
  }
}
