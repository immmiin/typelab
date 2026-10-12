import type { Distort, Doc, Effects, Paint, PathOpts, Preset, Repeat, ShapeLayer, Stroke, TextLayer, TextStyle } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10)

export const solid = (color: string): Paint => ({
  type: 'solid',
  color,
  stops: [
    { offset: 0, color: '#111111' },
    { offset: 1, color: '#2b2bff' },
  ],
  angle: 90,
  cx: 50,
  cy: 50,
})

export const defaultStroke = (): Stroke => ({ enabled: false, color: '#111111', width: 2 })

export const defaultEffects = (): Effects => ({
  shadows: [],
  blur: 0,
  outline: { enabled: false, width: 4, color: '#2b2bff' },
  offsetOutline: { enabled: false, x: 8, y: 8, width: 1.5, color: '#111111' },
  echo: { enabled: false, count: 5, dx: 0, dy: 18, fade: 70 },
  longShadow: { enabled: false, length: 40, angle: 45, color: '#2b2bff' },
  chromatic: { enabled: false, amount: 4, angle: 0, colorA: '#ff2d55', colorB: '#00c8ff' },
  halftone: { enabled: false, size: 3, spacing: 7, angle: 45 },
  grain: 0,
  blend: 'normal',
})

export const defaultDistort = (): Distort => ({
  warp: 'none',
  bend: 50,
  hDist: 0,
  vDist: 0,
  intensity: 100,
  frequency: 1,
  perspX: 0,
  perspY: 0,
  skewX: 0,
  skewY: 0,
  rRotation: 0,
  rScale: 0,
  rX: 0,
  rY: 0,
  rTracking: 0,
  rWidth: 0,
  rWeight: 0,
  seed: 7,
})

export const defaultPath = (): PathOpts => ({
  enabled: false,
  type: 'circle',
  radius: 260,
  sweep: 180,
  amplitude: 60,
  wavelength: 360,
  length: 900,
  turns: 2.5,
  growth: 60,
  custom: 'M 0 200 C 150 0 350 0 500 200 S 850 400 1000 200',
  offset: 0,
  start: 0,
  direction: 1,
  side: 'outside',
  spacing: 0,
  reverse: false,
  showPath: true,
  exportPath: false,
})

export const defaultRepeat = (): Repeat => ({
  mode: 'none',
  count: 6,
  cols: 3,
  dx: 0,
  dy: 120,
  rotation: 0,
  scale: 0,
  opacity: 12,
  radius: 300,
})

export const defaultTextStyle = (over: Partial<TextStyle> = {}): TextStyle => ({
  fontId: 'inter',
  size: 96,
  weight: 700,
  italic: false,
  axes: {},
  autoOpsz: true,
  lineHeight: 1,
  tracking: 0,
  wordSpacing: 0,
  paragraphSpacing: 0,
  align: 'left',
  vAlign: 'top',
  direction: 'horizontal',
  textCase: 'none',
  smallCaps: false,
  script: 'none',
  underline: false,
  strike: false,
  features: {},
  ...over,
})

export function makeText(text: string, x: number, y: number, style: Partial<TextStyle> = {}, over: Partial<TextLayer> = {}): TextLayer {
  return {
    id: uid(),
    type: 'text',
    name: text.split('\n')[0].slice(0, 24) || 'Text',
    visible: true,
    locked: false,
    groupId: null,
    x,
    y,
    w: 600,
    h: 200,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipH: false,
    flipV: false,
    opacity: 1,
    fill: solid('#111111'),
    stroke: defaultStroke(),
    effects: defaultEffects(),
    repeat: defaultRepeat(),
    text,
    style: defaultTextStyle(style),
    chars: [],
    autoWidth: true,
    fixedHeight: false,
    distort: defaultDistort(),
    path: defaultPath(),
    ...over,
  }
}

export function makeShape(shape: ShapeLayer['shape'], x: number, y: number, w: number, h: number): ShapeLayer {
  return {
    id: uid(),
    type: 'shape',
    shape,
    name: shape === 'rect' ? 'Rectangle' : shape === 'ellipse' ? 'Ellipse' : 'Line',
    visible: true,
    locked: false,
    groupId: null,
    x,
    y,
    w,
    h,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipH: false,
    flipV: false,
    opacity: 1,
    fill: solid(shape === 'line' ? '#111111' : '#2b2bff'),
    fillEnabled: shape !== 'line',
    stroke: { enabled: shape === 'line', color: '#111111', width: 2 },
    effects: defaultEffects(),
    repeat: defaultRepeat(),
    radius: 0,
  }
}

export const ARTBOARD_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'ig-post', label: 'Instagram Post · 1080×1350', w: 1080, h: 1350 },
  { id: 'ig-story', label: 'Instagram Story · 1080×1920', w: 1080, h: 1920 },
  { id: 'a4', label: 'A4 · 210×297 mm', w: 595.28, h: 841.89 },
  { id: 'a3', label: 'A3 · 297×420 mm', w: 841.89, h: 1190.55 },
  { id: 'letter', label: 'Letter · 8.5×11 in', w: 612, h: 792 },
  { id: 'tabloid', label: 'Tabloid · 11×17 in', w: 792, h: 1224 },
  { id: '6x9', label: '6 × 9 in', w: 432, h: 648 },
  { id: 'square', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'hd', label: '1920 × 1080', w: 1920, h: 1080 },
  { id: 'custom', label: 'Custom size', w: 0, h: 0 },
]

export function defaultDoc(): Doc {
  const big = makeText('TYPE IS\nA SYSTEM.', 64, 470, {
    fontId: 'inter',
    size: 178,
    weight: 800,
    lineHeight: 0.86,
    tracking: -48,
  })
  big.name = 'Headline'
  const label = makeText('TYPE LAB', 64, 64, { fontId: 'jetbrains', size: 22, weight: 700, tracking: 40, lineHeight: 1.2 })
  label.name = 'Label'
  const sub = makeText('Interactive Typography Playground', 64, 96, { fontId: 'jetbrains', size: 22, weight: 400, tracking: 0, lineHeight: 1.2 })
  sub.name = 'Subtitle'
  sub.fill = solid('#6b6b66')
  const spec = makeText('Inter Variable — wght 800 — opsz auto\nTracking −48 · Leading 0.86', 64, 1222, {
    fontId: 'jetbrains',
    size: 16,
    weight: 400,
    lineHeight: 1.45,
  })
  spec.name = 'Caption'
  spec.fill = solid('#6b6b66')
  const rule = makeShape('line', 64, 1200, 952, 0)
  rule.name = 'Rule'
  rule.stroke = { enabled: true, color: '#111111', width: 1.5 }
  const dot = makeShape('ellipse', 976, 64, 40, 40)
  dot.name = 'Dot'
  return {
    artboard: { w: 1080, h: 1350, preset: 'ig-post', bg: 'white', bgColor: '#ffffff' },
    unit: 'px',
    layers: [rule, dot, label, sub, spec, big],
    groups: {},
    guides: [
      { id: uid(), axis: 'x', pos: 64 },
      { id: uid(), axis: 'x', pos: 1016 },
    ],
    guidesLocked: false,
    showGuides: true,
    grid: { show: false, type: 'columns', size: 8, cols: 6, rows: 8, margin: 64, gutter: 24, color: '#2b2bff' },
    baseline: { show: false, size: 24, offset: 0 },
    snap: { grid: true, guides: true, objects: true, center: true },
    showRulers: true,
  }
}

const fx = (over: Partial<Effects>): Effects => ({ ...defaultEffects(), ...over })

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'p-swiss', name: 'SWISS', builtin: true, style: { fontId: 'inter', weight: 700, size: 140, lineHeight: 0.92, tracking: -35, textCase: 'none', axes: {}, autoOpsz: true, italic: false }, fill: solid('#111111'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-editorial', name: 'EDITORIAL', builtin: true, style: { fontId: 'fraunces', weight: 300, size: 132, lineHeight: 0.98, tracking: -20, textCase: 'none', axes: { SOFT: 60, WONK: 1 }, autoOpsz: true, italic: false, features: { liga: true, dlig: true } }, fill: solid('#1a1a1a'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-condensed', name: 'CONDENSED', builtin: true, style: { fontId: 'archivo', weight: 800, size: 170, lineHeight: 0.84, tracking: 0, textCase: 'upper', axes: { wdth: 62 }, autoOpsz: true, italic: false }, fill: solid('#111111'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-brutal', name: 'BRUTAL', builtin: true, style: { fontId: 'unbounded', weight: 900, size: 120, lineHeight: 0.86, tracking: -50, textCase: 'upper', axes: {}, autoOpsz: true, italic: false }, fill: solid('#111111'), effects: fx({ shadows: [{ id: 'b1', enabled: true, x: 10, y: 10, blur: 0, spread: 0, color: '#2b2bff', opacity: 1 }] }), distort: defaultDistort() },
  { id: 'p-display', name: 'DISPLAY', builtin: true, style: { fontId: 'bodoni', weight: 500, size: 160, lineHeight: 0.9, tracking: -25, textCase: 'none', axes: { opsz: 96 }, autoOpsz: false, italic: false }, fill: solid('#111111'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-mono', name: 'MONO', builtin: true, style: { fontId: 'jetbrains', weight: 400, size: 72, lineHeight: 1.15, tracking: 0, textCase: 'none', axes: {}, autoOpsz: true, italic: false, features: { zero: true } }, fill: solid('#111111'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-variable', name: 'VARIABLE', builtin: true, style: { fontId: 'robotoflex', weight: 1000, size: 150, lineHeight: 0.85, tracking: -10, textCase: 'upper', axes: { wdth: 25, GRAD: 150, YTUC: 760 }, autoOpsz: true, italic: false }, fill: solid('#111111'), effects: defaultEffects(), distort: defaultDistort() },
  { id: 'p-poster', name: 'POSTER', builtin: true, style: { fontId: 'archivo', weight: 900, size: 190, lineHeight: 0.8, tracking: -40, textCase: 'upper', axes: { wdth: 125 }, autoOpsz: true, italic: false }, fill: solid('#ff3b1f'), effects: defaultEffects(), distort: defaultDistort() },
]

export const GRID_PRESETS: { id: string; label: string; hint: string; grid: Partial<Doc['grid']> }[] = [
  { id: '8pt', label: '8 pt grid', hint: 'Square 8 × 8 units — the UI / spacing standard', grid: { type: 'uniform', size: 8 } },
  { id: '4pt', label: '4 pt grid', hint: 'Fine 4 × 4 units for detailed spacing', grid: { type: 'uniform', size: 4 } },
  { id: 'sq24', label: '24 pt grid', hint: 'Coarse square grid for posters', grid: { type: 'uniform', size: 24 } },
  { id: 'c12', label: '12 columns', hint: '12 columns, 24 gutter, 64 margin', grid: { type: 'columns', cols: 12, rows: 0, margin: 64, gutter: 24 } },
  { id: 'c6', label: '6 columns', hint: '6 columns, 24 gutter, 64 margin', grid: { type: 'columns', cols: 6, rows: 0, margin: 64, gutter: 24 } },
  { id: 'm8', label: 'Modular 8 × 8', hint: 'Swiss modular grid: 8 columns × 8 rows', grid: { type: 'columns', cols: 8, rows: 8, margin: 48, gutter: 16 } },
  { id: 'm4', label: 'Modular 4 × 6', hint: 'Poster grid: 4 columns × 6 rows', grid: { type: 'columns', cols: 4, rows: 6, margin: 64, gutter: 24 } },
  { id: 'm3', label: 'Thirds 3 × 3', hint: 'Rule of thirds / Instagram grid, no margins', grid: { type: 'columns', cols: 3, rows: 3, margin: 0, gutter: 0 } },
]
