export type Unit = 'px' | 'pt' | 'mm' | 'in'
export type Tool = 'select' | 'type' | 'rotate' | 'scale' | 'warp' | 'path' | 'shape' | 'hand'
export type ShapeKind = 'rect' | 'ellipse' | 'line'
export type Mode = 'edit' | 'specimen' | 'compare' | 'make'
export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'color-dodge' | 'color-burn'

export interface Stop { offset: number; color: string }
export interface Paint {
  type: 'solid' | 'linear' | 'radial'
  color: string
  stops: Stop[]
  angle: number
  cx: number
  cy: number
}

export interface Stroke { enabled: boolean; color: string; width: number }

export interface Shadow { id: string; enabled: boolean; x: number; y: number; blur: number; spread: number; color: string; opacity: number }

export interface Effects {
  shadows: Shadow[]
  blur: number
  outline: { enabled: boolean; width: number; color: string }
  offsetOutline: { enabled: boolean; x: number; y: number; width: number; color: string }
  echo: { enabled: boolean; count: number; dx: number; dy: number; fade: number }
  longShadow: { enabled: boolean; length: number; angle: number; color: string }
  chromatic: { enabled: boolean; amount: number; angle: number; colorA: string; colorB: string }
  halftone: { enabled: boolean; size: number; spacing: number; angle: number }
  grain: number
  blend: BlendMode
}

export type WarpStyle = 'none' | 'arc' | 'arch' | 'wave' | 'flag' | 'bulge' | 'fisheye' | 'rise' | 'squeeze'
export interface Distort {
  warp: WarpStyle
  bend: number // -100..100
  hDist: number // -100..100
  vDist: number
  intensity: number // 0..200 (%)
  frequency: number // waves
  perspX: number // deg
  perspY: number
  skewX: number
  skewY: number
  rRotation: number
  rScale: number
  rX: number
  rY: number
  rTracking: number
  rWidth: number
  rWeight: number
  seed: number
}

export type PathType = 'circle' | 'arc' | 'wave' | 'spiral' | 'custom'
export interface PathOpts {
  enabled: boolean
  type: PathType
  radius: number
  sweep: number
  amplitude: number
  wavelength: number
  length: number
  turns: number
  growth: number
  custom: string
  offset: number
  start: number // %
  direction: 1 | -1
  side: 'outside' | 'inside'
  spacing: number
  reverse: boolean
  showPath: boolean
  exportPath: boolean
}

export type RepeatMode = 'none' | 'rows' | 'columns' | 'grid' | 'radial' | 'circular' | 'spiral'
export interface Repeat {
  mode: RepeatMode
  count: number
  cols: number
  dx: number
  dy: number
  rotation: number
  scale: number // % per copy
  opacity: number // % per copy
  radius: number
}

export interface CharStyle {
  fontId?: string
  size?: number
  weight?: number
  width?: number
  tracking?: number
  baseline?: number
  rotate?: number
  scaleX?: number
  scaleY?: number
  color?: string
  opacity?: number
  dx?: number
  dy?: number
  script?: 'sup' | 'sub' | 'none'
  underline?: boolean
  strike?: boolean
}

export interface TextStyle {
  fontId: string
  size: number
  weight: number
  italic: boolean
  axes: Record<string, number>
  autoOpsz: boolean
  lineHeight: number
  tracking: number // 1/1000 em
  wordSpacing: number // 1/1000 em
  paragraphSpacing: number
  align: 'left' | 'center' | 'right' | 'justify'
  vAlign: 'top' | 'middle' | 'bottom'
  direction: 'horizontal' | 'vertical'
  textCase: 'none' | 'upper' | 'lower' | 'title'
  smallCaps: boolean
  script: 'none' | 'sup' | 'sub'
  underline: boolean
  strike: boolean
  features: Record<string, boolean>
}

interface BaseLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  groupId: string | null
  x: number
  y: number
  w: number
  h: number
  rotation: number
  scaleX: number
  scaleY: number
  flipH: boolean
  flipV: boolean
  opacity: number
  fill: Paint
  stroke: Stroke
  effects: Effects
  repeat: Repeat
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  style: TextStyle
  chars: (CharStyle | null)[]
  autoWidth: boolean
  fixedHeight: boolean
  distort: Distort
  path: PathOpts
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  fillEnabled: boolean
  radius: number
}

export type Layer = TextLayer | ShapeLayer

export interface Guide { id: string; axis: 'x' | 'y'; pos: number }

export interface Doc {
  artboard: { w: number; h: number; preset: string; bg: 'white' | 'black' | 'custom' | 'transparent'; bgColor: string }
  unit: Unit
  layers: Layer[]
  groups: Record<string, { name: string }>
  guides: Guide[]
  guidesLocked: boolean
  showGuides: boolean
  grid: { show: boolean; type: 'columns' | 'uniform'; size: number; cols: number; rows: number; margin: number; gutter: number; color: string }
  baseline: { show: boolean; size: number; offset: number }
  snap: { grid: boolean; guides: boolean; objects: boolean; center: boolean }
  showRulers: boolean
}

export interface Preset {
  id: string
  name: string
  builtin?: boolean
  style: Partial<TextStyle>
  effects?: Effects
  distort?: Distort
  fill?: Paint
  stroke?: Stroke
}

export interface Axis { tag: string; name: string; min: number; max: number; def: number }
export interface FontMeta {
  family: string
  designer: string
  version: string
  license: string
  axes: Axis[]
  instances: { name: string; coords: Record<string, number> }[]
  features: string[]
  chars: number[]
  upm: number
  asc: number
  desc: number
  lineGap: number
  capH: number
  xH: number
  ulPos: number
  ulThick: number
  stPos: number
  stSize: number
  glyphs: number
  mono: boolean
  weightClass: number
  widthClass: number
  weights: number[]
}

export type FontCategory = 'sans' | 'serif' | 'display' | 'mono' | 'handwriting' | 'experimental'
export interface FontInfo {
  id: string
  name: string
  css: string
  category: FontCategory
  source: 'builtin' | 'upload'
  meta: FontMeta
  faces: { weight: number; data: ArrayBuffer; mime: string }[]
  loaded: boolean
}
