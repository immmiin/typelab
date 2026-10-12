import type { Unit } from './types'

// Internal unit: 1 px = 1 pt (72 dpi document space, like print layout tools)
export const PER_UNIT: Record<Unit, number> = { px: 1, pt: 1, mm: 72 / 25.4, in: 72 }
export const toUnit = (v: number, u: Unit) => v / PER_UNIT[u]
export const fromUnit = (v: number, u: Unit) => v * PER_UNIT[u]
export const fmt = (v: number, u: Unit) => {
  const x = toUnit(v, u)
  const d = u === 'in' ? 2 : u === 'mm' ? 1 : 0
  return x.toFixed(d).replace(/\.0+$/, '')
}
