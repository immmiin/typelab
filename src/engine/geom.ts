export type Mat = [number, number, number, number, number, number]
export type Pt = { x: number; y: number }

export const I: Mat = [1, 0, 0, 1, 0, 0]
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
export const apply = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
export const inv = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}
export const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
export const R = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}
export const Sc = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0]
export const Sk = (ax: number, ay: number): Mat => [1, Math.tan((ay * Math.PI) / 180), Math.tan((ax * Math.PI) / 180), 1, 0, 0]
export const chain = (...ms: Mat[]) => ms.reduce((a, b) => mul(a, b), I)
export const matStr = (m: Mat) => `matrix(${m.map((v) => +v.toFixed(5)).join(' ')})`

export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pointInPoly = (p: Pt, poly: Pt[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside
  }
  return inside
}
