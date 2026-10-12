import type { CharStyle, FontInfo, TextLayer, TextStyle } from '../types'
import { getFont } from '../fonts/registry'

export const DEFAULT_ON = ['liga', 'calt', 'kern', 'clig']

export interface RStyle {
  font: FontInfo
  family: string
  size: number // effective (after sup/sub)
  baseSize: number
  weight: number
  italicSynth: boolean
  vs: string
  ff: string
  caps: 'normal' | 'small-caps' | 'petite-caps'
  tracking: number // px
  wordSpacing: number // px
  baseline: number // px (positive = up)
  color?: string
  opacity?: number
  rotate: number
  scaleX: number
  scaleY: number
  dx: number
  dy: number
  underline: boolean
  strike: boolean
  asc: number // px
  desc: number // px (positive)
  capH: number // px
  key: string
}

export function clampAxis(font: FontInfo, tag: string, v: number) {
  const a = font.meta.axes.find((x) => x.tag === tag)
  if (!a) return v
  return Math.min(a.max, Math.max(a.min, v))
}

export function variationSettings(font: FontInfo, st: TextStyle, weight: number, width?: number, autoOpsz = st.autoOpsz): string {
  const parts: string[] = []
  for (const a of font.meta.axes) {
    let v: number | undefined
    if (a.tag === 'wght') v = weight
    else if (a.tag === 'opsz') {
      if (autoOpsz) continue
      v = st.axes.opsz ?? a.def
    } else if (a.tag === 'wdth') v = width ?? st.axes.wdth ?? a.def
    else if (a.tag === 'ital') v = st.italic ? 1 : (st.axes.ital ?? a.def)
    else if (a.tag === 'slnt') v = st.italic && !font.meta.axes.some((x) => x.tag === 'ital') ? a.min : (st.axes.slnt ?? a.def)
    else v = st.axes[a.tag] ?? a.def
    v = Math.min(a.max, Math.max(a.min, v))
    parts.push(`"${a.tag}" ${Math.round(v * 100) / 100}`)
  }
  return parts.join(', ')
}

export function featureSettings(st: TextStyle): string {
  const parts: string[] = []
  for (const [tag, on] of Object.entries(st.features)) {
    if (on && !DEFAULT_ON.includes(tag)) parts.push(`"${tag}" 1`)
    if (!on && DEFAULT_ON.includes(tag)) parts.push(`"${tag}" 0`)
  }
  return parts.join(', ')
}

export function effectiveWeight(font: FontInfo, w: number) {
  const ax = font.meta.axes.find((a) => a.tag === 'wght')
  if (ax) return Math.min(ax.max, Math.max(ax.min, w))
  const ws = font.meta.weights
  return ws.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), ws[0] ?? 400)
}

export function resolveStyle(layer: TextLayer, c: CharStyle | null | undefined): RStyle {
  const st = layer.style
  const font = getFont(c?.fontId ?? st.fontId)
  const baseSize = c?.size ?? st.size
  const script = c?.script && c.script !== 'none' ? c.script : st.script
  const size = script === 'none' ? baseSize : baseSize * 0.62
  const scriptShift = script === 'sup' ? baseSize * 0.36 : script === 'sub' ? -baseSize * 0.14 : 0
  const weight = effectiveWeight(font, c?.weight ?? st.weight)
  const hasSlant = font.meta.axes.some((a) => a.tag === 'ital' || a.tag === 'slnt')
  const vs = variationSettings(font, st, weight, c?.width)
  const ff = featureSettings(st)
  const caps = st.smallCaps ? 'small-caps' : st.features['pcap'] ? 'normal' : 'normal'
  const m = font.meta
  const r: RStyle = {
    font,
    family: font.css,
    size,
    baseSize,
    weight,
    italicSynth: st.italic && !hasSlant,
    vs,
    ff,
    caps,
    tracking: ((c?.tracking ?? st.tracking) / 1000) * size,
    wordSpacing: (st.wordSpacing / 1000) * size,
    baseline: (c?.baseline ?? 0) + scriptShift,
    color: c?.color,
    opacity: c?.opacity,
    rotate: c?.rotate ?? 0,
    scaleX: c?.scaleX ?? 1,
    scaleY: c?.scaleY ?? 1,
    dx: c?.dx ?? 0,
    dy: c?.dy ?? 0,
    underline: c?.underline ?? st.underline,
    strike: c?.strike ?? st.strike,
    asc: (m.asc / m.upm) * size,
    desc: (-m.desc / m.upm) * size,
    capH: (m.capH / m.upm) * size,
    key: '',
  }
  r.key = [r.family, size, weight, vs, ff, caps, r.tracking, r.wordSpacing, r.italicSynth, r.color, r.opacity, st.autoOpsz].join('|')
  return r
}

/** CSS style string shared by measurement and rendering */
export function runCss(r: RStyle): string {
  let s = `font-family:"${r.family}";font-size:${r.size}px;font-weight:${r.weight};letter-spacing:${r.tracking}px;word-spacing:${r.wordSpacing}px;white-space:pre;`
  if (r.vs) s += `font-variation-settings:${r.vs};`
  if (r.ff) s += `font-feature-settings:${r.ff};`
  if (r.caps !== 'normal') s += `font-variant-caps:${r.caps};`
  if (r.italicSynth) s += 'font-style:italic;'
  return s
}

export function caseTransform(text: string, mode: TextStyle['textCase']): string[] {
  // returns display string per UTF-16 index (low surrogates get '')
  const out: string[] = []
  let wordStart = true
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xdc00 && code <= 0xdfff && i > 0) {
      out.push('')
      continue
    }
    const hi = code >= 0xd800 && code <= 0xdbff
    const ch = hi ? text.slice(i, i + 2) : text[i]
    let d = ch
    if (mode === 'upper') d = ch.toUpperCase()
    else if (mode === 'lower') d = ch.toLowerCase()
    else if (mode === 'title') d = wordStart ? ch.toUpperCase() : ch.toLowerCase()
    wordStart = /[\s\-—–/(“"']/.test(ch)
    out.push(d)
  }
  return out
}

export function cssForLayer(layer: TextLayer): string {
  const st = layer.style
  const font = getFont(st.fontId)
  const r = resolveStyle(layer, null)
  const lines = [
    `font-family: "${font.name}", ${font.category === 'serif' ? 'serif' : font.category === 'mono' ? 'monospace' : 'sans-serif'};`,
    `font-size: ${round(st.size)}px;`,
    `font-weight: ${r.weight};`,
    `line-height: ${round(st.lineHeight)};`,
    `letter-spacing: ${round(st.tracking / 1000, 3)}em;`,
  ]
  if (st.wordSpacing) lines.push(`word-spacing: ${round(st.wordSpacing / 1000, 3)}em;`)
  if (r.vs) lines.push(`font-variation-settings: ${r.vs};`)
  if (st.autoOpsz && font.meta.axes.some((a) => a.tag === 'opsz')) lines.push('font-optical-sizing: auto;')
  if (r.ff) lines.push(`font-feature-settings: ${r.ff};`)
  if (st.smallCaps) lines.push('font-variant-caps: small-caps;')
  if (r.italicSynth) lines.push('font-style: italic;')
  if (st.textCase !== 'none') lines.push(`text-transform: ${st.textCase === 'title' ? 'capitalize' : st.textCase === 'upper' ? 'uppercase' : 'lowercase'};`)
  lines.push(`text-align: ${st.align};`)
  if (st.underline || st.strike) lines.push(`text-decoration: ${[st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ')};`)
  if (st.direction === 'vertical') lines.push('writing-mode: vertical-rl;', 'text-orientation: upright;')
  if (layer.fill.type === 'solid') lines.push(`color: ${layer.fill.color};`)
  else {
    const stops = layer.fill.stops.map((s) => `${s.color} ${round(s.offset * 100)}%`).join(', ')
    lines.push(
      layer.fill.type === 'linear'
        ? `background: linear-gradient(${layer.fill.angle}deg, ${stops});`
        : `background: radial-gradient(circle at ${layer.fill.cx}% ${layer.fill.cy}%, ${stops});`,
      '-webkit-background-clip: text;',
      'background-clip: text;',
      'color: transparent;',
    )
  }
  if (layer.stroke.enabled) lines.push(`-webkit-text-stroke: ${layer.stroke.width}px ${layer.stroke.color};`)
  if (layer.opacity < 1) lines.push(`opacity: ${round(layer.opacity)};`)
  const sh = layer.effects.shadows.filter((s) => s.enabled)
  if (sh.length) lines.push(`text-shadow: ${sh.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${hexA(s.color, s.opacity)}`).join(', ')};`)
  if (layer.effects.blend !== 'normal') lines.push(`mix-blend-mode: ${layer.effects.blend};`)
  const t: string[] = []
  if (layer.rotation) t.push(`rotate(${round(layer.rotation)}deg)`)
  if (layer.scaleX !== 1 || layer.scaleY !== 1 || layer.flipH || layer.flipV)
    t.push(`scale(${round(layer.scaleX * (layer.flipH ? -1 : 1))}, ${round(layer.scaleY * (layer.flipV ? -1 : 1))})`)
  if (layer.distort.skewX || layer.distort.skewY) t.push(`skew(${layer.distort.skewX}deg, ${layer.distort.skewY}deg)`)
  if (t.length) lines.push(`transform: ${t.join(' ')};`)
  return `.${slug(layer.name)} {\n  ${lines.join('\n  ')}\n}`
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type'
export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

export function hexA(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex)
  return a >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${round(a)})`
}
export function hexToRgb(hex: string) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
