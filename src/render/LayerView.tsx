import { memo, type ReactNode } from 'react'
import type { Effects, Layer, Paint, Repeat, ShapeLayer, TextLayer } from '../types'
import { getLayout, type G, type Layout } from '../engine/layout'
import { glyphTransforms, layerMatrix, needsGlyphMode } from '../engine/distort'
import { apply, chain, matStr, R, Sc, T, type Mat } from '../engine/geom'
import { runCss, type RStyle } from '../engine/style'

export function layerSize(l: Layer, fv: number): { W: number; H: number; lay?: Layout } {
  if (l.type === 'text') {
    const lay = getLayout(l, fv)
    return { W: lay.W, H: lay.H, lay }
  }
  return { W: l.w, H: l.h }
}

function paintDefs(id: string, p: Paint, W: number, H: number): ReactNode {
  if (p.type === 'linear') {
    const a = (p.angle * Math.PI) / 180
    const dx = Math.sin(a), dy = -Math.cos(a)
    const hl = Math.abs((W / 2) * dx) + Math.abs((H / 2) * dy)
    return (
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={W / 2 - dx * hl} y1={H / 2 - dy * hl} x2={W / 2 + dx * hl} y2={H / 2 + dy * hl}>
        {p.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
      </linearGradient>
    )
  }
  if (p.type === 'radial')
    return (
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={(W * p.cx) / 100} cy={(H * p.cy) / 100} r={Math.max(W, H) * 0.6}>
        {p.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
      </radialGradient>
    )
  return null
}

const mainColor = (p: Paint) => (p.type === 'solid' ? p.color : p.stops[0]?.color ?? '#000')

function filterDef(id: string, fx: Effects, W: number, H: number): ReactNode | null {
  const shadows = fx.shadows.filter((s) => s.enabled)
  if (!shadows.length && !fx.blur && !fx.grain) return null
  const nodes: ReactNode[] = []
  let base = 'SourceGraphic'
  if (fx.blur) {
    nodes.push(<feGaussianBlur key="b" in="SourceGraphic" stdDeviation={fx.blur} result="base" />)
    base = 'base'
  }
  const merge: string[] = []
  shadows.forEach((s, i) => {
    let src = 'SourceAlpha'
    if (s.spread > 0) {
      nodes.push(<feMorphology key={`m${i}`} in="SourceAlpha" operator="dilate" radius={s.spread} result={`sp${i}`} />)
      src = `sp${i}`
    }
    nodes.push(<feGaussianBlur key={`g${i}`} in={src} stdDeviation={s.blur / 2} result={`bl${i}`} />)
    nodes.push(<feOffset key={`o${i}`} in={`bl${i}`} dx={s.x} dy={s.y} result={`of${i}`} />)
    nodes.push(<feFlood key={`f${i}`} floodColor={s.color} floodOpacity={s.opacity} result={`fl${i}`} />)
    nodes.push(<feComposite key={`c${i}`} in={`fl${i}`} in2={`of${i}`} operator="in" result={`sh${i}`} />)
    merge.unshift(`sh${i}`)
  })
  nodes.push(
    <feMerge key="mg" result="merged">
      {merge.map((m) => <feMergeNode key={m} in={m} />)}
      <feMergeNode in={base} />
    </feMerge>,
  )
  if (fx.grain > 0) {
    // stochastic grain: punch noise-shaped holes into the letterforms (riso / photocopy texture)
    const n = 24
    const thr = 0.12 + fx.grain * 0.46
    const table = Array.from({ length: n }, (_, i) => (i / n < thr ? 0 : 1)).join(' ')
    nodes.push(<feTurbulence key="t" type="fractalNoise" baseFrequency={0.55} numOctaves={2} seed={7} result="noise" />)
    nodes.push(<feColorMatrix key="cm" in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.3" result="nA" />)
    nodes.push(
      <feComponentTransfer key="ct" in="nA" result="mask">
        <feFuncA type="discrete" tableValues={table} />
      </feComponentTransfer>,
    )
    nodes.push(<feComposite key="gin" in="merged" in2="mask" operator="in" />)
  }
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x={-W - 400} y={-H - 400} width={W * 3 + 800} height={H * 3 + 800} colorInterpolationFilters="sRGB">
      {nodes}
    </filter>
  )
}

const ovStyle = (c: string) => ({ ['--ov' as string]: c }) as React.CSSProperties

function runStyle(rs: RStyle, extraTracking = 0, vsOverride?: string, weight?: number): React.CSSProperties {
  const css = runCss(extraTracking ? { ...rs, tracking: rs.tracking + extraTracking } : rs)
  const out: Record<string, string> = {}
  css.split(';').forEach((d) => {
    const i = d.indexOf(':')
    if (i > 0) {
      const k = d.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      out[k] = d.slice(i + 1).trim()
    }
  })
  if (vsOverride) out.fontVariationSettings = vsOverride
  if (weight) out.fontWeight = String(weight)
  if (rs.color) out.fill = `var(--ov, ${rs.color})`
  if (rs.opacity !== undefined && rs.opacity < 1) {
    out.fillOpacity = String(rs.opacity)
    out.strokeOpacity = String(rs.opacity)
  }
  return out as React.CSSProperties
}

function decoRects(g: G, x: number, y: number, w: number, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const m = g.rs.font.meta
  const k = g.rs.size / m.upm
  const fill = g.rs.color ? `var(--ov, ${g.rs.color})` : undefined
  if (g.rs.underline) out.push(<rect key={key + 'u'} x={x} y={y - m.ulPos * k} width={w} height={Math.max(1, m.ulThick * k)} style={fill ? { fill } : undefined} />)
  if (g.rs.strike) out.push(<rect key={key + 's'} x={x} y={y - m.stPos * k - (m.stSize * k) / 2} width={w} height={Math.max(1, m.stSize * k)} style={fill ? { fill } : undefined} />)
  return out
}

/** Unpainted glyph geometry; paint is inherited from <use> */
function Glyphs({ l, lay }: { l: TextLayer; lay: Layout }) {
  if (lay.path) {
    const p = l.path
    const runs: { rs: RStyle; text: string }[] = []
    for (const g of lay.glyphs) {
      const t = g.nl ? ' ' : g.disp
      const last = runs[runs.length - 1]
      if (last && last.rs.key === g.rs.key) last.text += t
      else runs.push({ rs: g.rs, text: t })
    }
    const dy = p.side === 'inside' ? lay.base.capH + p.offset : -p.offset
    const extra = (p.spacing / 1000) * l.style.size
    return (
      <text xmlSpace="preserve" data-path-text={l.id}>
        <textPath href={`#tp-${l.id}`} startOffset={`${lay.path.startPct}%`} textAnchor={lay.path.anchor}>
          {runs.map((r, i) => (
            <tspan key={i} dy={i === 0 ? dy : undefined} style={runStyle(r.rs, extra)}>
              {r.text}
            </tspan>
          ))}
        </textPath>
      </text>
    )
  }
  if (needsGlyphMode(l)) {
    const gts = glyphTransforms(l, lay)
    return (
      <>
        {lay.glyphs.map((g, k) => {
          const t = gts[k]
          if (!t) return null
          return (
            <g key={k} transform={matStr(t.m)}>
              <text x={t.tx} y={t.ty} style={runStyle(g.rs, 0, t.vs, t.weight)} xmlSpace="preserve">
                {g.disp}
              </text>
              {decoRects(g, t.tx, t.ty, g.w + g.rs.tracking, 'd')}
            </g>
          )
        })}
      </>
    )
  }
  // flow mode: one <text> per line, runs with explicit x/y
  const justify = l.style.align === 'justify'
  return (
    <>
      {lay.lines.map((ln, li) => {
        const runs: { x: number; y: number; rs: RStyle; text: string }[] = []
        let prev: G | null = null
        for (let k = ln.a; k < ln.b; k++) {
          const g = lay.glyphs[k]
          if (g.nl) continue
          const last = runs[runs.length - 1]
          const brk = !last || !prev || last.rs.key !== g.rs.key || last.y !== g.y || (justify && prev.space && !g.space)
          if (brk) runs.push({ x: g.x, y: g.y, rs: g.rs, text: g.disp })
          else last.text += g.disp
          prev = g
        }
        if (!runs.length) return null
        const decos: ReactNode[] = []
        for (let k = ln.a; k < ln.b; k++) {
          const g = lay.glyphs[k]
          if ((g.rs.underline || g.rs.strike) && !g.nl) {
            const isLast = k === ln.b - 1 || lay.glyphs.slice(k + 1, ln.b).every((x) => x.space || x.nl)
            if (isLast && g.space) continue
            decos.push(...decoRects(g, g.x, g.lineY, isLast ? g.w : g.adv, `${li}-${k}`))
          }
        }
        return (
          <g key={li}>
            <text xmlSpace="preserve">
              {runs.map((r, i) => (
                <tspan key={i} x={r.x} y={r.y} style={runStyle(r.rs)}>
                  {r.text}
                </tspan>
              ))}
            </text>
            {decos}
          </g>
        )
      })}
    </>
  )
}

function Painted({ id, W, H, fill, stroke, fx, geom, uid }: { id: string; W: number; H: number; fill: Paint; stroke: TextLayer['stroke']; fx: Effects; geom: string; uid: string }) {
  const href = `#${geom}`
  const color = mainColor(fill)
  const nodes: ReactNode[] = []
  if (fx.longShadow.enabled && fx.longShadow.length > 0) {
    const a = (fx.longShadow.angle * Math.PI) / 180
    const L = fx.longShadow.length
    const step = Math.max(1, L / 90)
    for (let k = L; k > 0; k -= step)
      nodes.push(<use key={`ls${k}`} href={href} fill={fx.longShadow.color} style={ovStyle(fx.longShadow.color)} transform={`translate(${(Math.cos(a) * k).toFixed(2)} ${(Math.sin(a) * k).toFixed(2)})`} />)
  }
  if (fx.echo.enabled) {
    for (let k = fx.echo.count; k >= 1; k--) {
      const op = Math.max(0, 1 - (k * fx.echo.fade) / 100 / Math.max(1, fx.echo.count) - 0.05 * k)
      nodes.push(<use key={`e${k}`} href={href} fill={color} opacity={op.toFixed(3)} transform={`translate(${k * fx.echo.dx} ${k * fx.echo.dy})`} />)
    }
  }
  if (fx.offsetOutline.enabled)
    nodes.push(<use key="oo" href={href} fill="none" style={ovStyle('none')} stroke={fx.offsetOutline.color} strokeWidth={fx.offsetOutline.width} strokeLinejoin="round" transform={`translate(${fx.offsetOutline.x} ${fx.offsetOutline.y})`} />)
  if (fx.chromatic.enabled && fx.chromatic.amount) {
    const a = (fx.chromatic.angle * Math.PI) / 180
    const dx = Math.cos(a) * fx.chromatic.amount, dy = Math.sin(a) * fx.chromatic.amount
    nodes.push(<use key="ca" href={href} fill={fx.chromatic.colorA} style={{ ...ovStyle(fx.chromatic.colorA), mixBlendMode: 'multiply' }} transform={`translate(${-dx} ${-dy})`} />)
    nodes.push(<use key="cb" href={href} fill={fx.chromatic.colorB} style={{ ...ovStyle(fx.chromatic.colorB), mixBlendMode: 'multiply' }} transform={`translate(${dx} ${dy})`} />)
  }
  if (fx.outline.enabled && fx.outline.width > 0)
    nodes.push(<use key="ol" href={href} fill={fx.outline.color} style={ovStyle(fx.outline.color)} stroke={fx.outline.color} strokeWidth={fx.outline.width * 2} strokeLinejoin="round" />)
  const masked = fill.type !== 'solid' || fx.halftone.enabled
  const defs: ReactNode[] = []
  if (masked) {
    defs.push(
      <mask key="m" id={`mk-${uid}`} maskUnits="userSpaceOnUse" x={-W * 2} y={-H * 2} width={W * 5} height={H * 5}>
        <use href={href} fill="#fff" style={ovStyle('#fff')} />
      </mask>,
    )
    if (fill.type !== 'solid') defs.push(<g key="p">{paintDefs(`pt-${uid}`, fill, W, H)}</g>)
    let paint = fill.type !== 'solid' ? `url(#pt-${uid})` : color
    if (fx.halftone.enabled) {
      const sp = Math.max(2, fx.halftone.spacing)
      defs.push(
        <pattern key="h" id={`ht-${uid}`} patternUnits="userSpaceOnUse" width={sp} height={sp} patternTransform={`rotate(${fx.halftone.angle})`}>
          <circle cx={sp / 2} cy={sp / 2} r={Math.min(sp * 0.75, fx.halftone.size / 2)} fill={fill.type === 'solid' ? color : fill.stops[0]?.color} />
        </pattern>,
      )
      paint = `url(#ht-${uid})`
    }
    nodes.push(<rect key="fillrect" x={-W} y={-H} width={W * 3} height={H * 3} fill={paint} mask={`url(#mk-${uid})`} />)
  } else nodes.push(<use key="main" href={href} fill={color} />)
  if (stroke.enabled && stroke.width > 0)
    nodes.push(<use key="st" href={href} fill="none" style={ovStyle('none')} stroke={stroke.color} strokeWidth={stroke.width} strokeLinejoin="round" />)
  return (
    <>
      <defs>{defs}</defs>
      {nodes}
    </>
  )
}

function repeatTransforms(r: Repeat, C: { x: number; y: number }): { t: string; op: number }[] {
  if (r.mode === 'none') return []
  const out: { t: string; op: number }[] = []
  const n = Math.max(0, Math.min(400, Math.round(r.count)))
  for (let i = 1; i < n; i++) {
    let m: Mat
    const sc = r.scale ? Math.max(0.01, 1 + (i * r.scale) / 100) : 1
    const about = (p: { x: number; y: number }, inner: Mat) => chain(T(p.x, p.y), inner, T(-p.x, -p.y))
    const local = about(C, chain(R(i * r.rotation), Sc(sc, sc)))
    if (r.mode === 'rows') m = chain(T(0, i * r.dy), local)
    else if (r.mode === 'columns') m = chain(T(i * r.dx, 0), local)
    else if (r.mode === 'grid') {
      const cols = Math.max(1, Math.round(r.cols))
      m = chain(T((i % cols) * r.dx, Math.floor(i / cols) * r.dy), local)
    } else if (r.mode === 'radial') m = about(C, chain(R(i * (r.rotation || 360 / n)), Sc(sc, sc)))
    else if (r.mode === 'circular') {
      const P = { x: C.x, y: C.y + r.radius }
      m = chain(about(P, R((i * 360) / n)), about(C, Sc(sc, sc)))
    } else {
      const P = { x: C.x, y: C.y + r.radius }
      const s2 = r.scale ? sc : Math.pow(0.9, i)
      m = chain(about(P, chain(R(i * (r.rotation || 24)), Sc(s2, s2))))
    }
    out.push({ t: matStr(m), op: Math.max(0, 1 - (i * r.opacity) / 100) })
  }
  return out
}

function ShapeGeom({ l }: { l: ShapeLayer }) {
  if (l.shape === 'ellipse') return <ellipse cx={l.w / 2} cy={l.h / 2} rx={Math.max(0, l.w / 2)} ry={Math.max(0, l.h / 2)} />
  if (l.shape === 'line') return <line x1={0} y1={l.h / 2} x2={l.w} y2={l.h / 2} />
  return <rect x={0} y={0} width={Math.max(0, l.w)} height={Math.max(0, l.h)} rx={l.radius} />
}

export const LayerView = memo(function LayerView({ l, fv }: { l: Layer; fv: number }) {
  const uid = l.id
  const { W, H, lay } = layerSize(l, fv)
  const M = layerMatrix(l, W, H)
  const C = apply(M, { x: W / 2, y: H / 2 })
  const fx = l.effects
  const filt = filterDef(`fx-${uid}`, fx, W, H)
  let body: ReactNode
  if (l.type === 'text' && lay) {
    body = (
      <>
        <defs>
          {lay.path && <path id={`tp-${uid}`} d={lay.path.d} />}
          <g id={`gl-${uid}`}>
            <Glyphs l={l} lay={lay} />
          </g>
        </defs>
        {lay.path && l.path.showPath && (
          <path d={lay.path.d} fill="none" stroke="#2b2bff" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" data-noexport={l.path.exportPath ? undefined : '1'} />
        )}
        <g filter={filt ? `url(#fx-${uid})` : undefined}>
          <Painted id={uid} uid={uid} W={W} H={H} fill={l.fill} stroke={l.stroke} fx={fx} geom={`gl-${uid}`} />
        </g>
      </>
    )
  } else if (l.type === 'shape') {
    const pd = l.fill.type !== 'solid' ? paintDefs(`pt-${uid}`, l.fill, W, H) : null
    body = (
      <g filter={filt ? `url(#fx-${uid})` : undefined}>
        {pd && <defs>{pd}</defs>}
        <g
          fill={l.fillEnabled ? (l.fill.type === 'solid' ? l.fill.color : `url(#pt-${uid})`) : 'none'}
          stroke={l.stroke.enabled ? l.stroke.color : 'none'}
          strokeWidth={l.stroke.width}
        >
          <ShapeGeom l={l} />
        </g>
      </g>
    )
  }
  const reps = repeatTransforms(l.repeat, C)
  return (
    <g data-layer={uid} style={{ mixBlendMode: fx.blend === 'normal' ? undefined : fx.blend }}>
      {filt && <defs>{filt}</defs>}
      {reps
        .slice()
        .reverse()
        .map((r, i) => <use key={i} href={`#rp-${uid}`} transform={r.t} opacity={r.op} />)}
      <g id={`rp-${uid}`} transform={matStr(M)} opacity={l.opacity}>
        {body}
      </g>
    </g>
  )
})
