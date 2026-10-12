import { useStore, S } from '../store'
import { useFonts } from '../fonts/registry'
import type { PathType, RepeatMode, WarpStyle } from '../types'
import { Btn, Check, Hint, Label, NumField, Row, Section, Seg, Toggle } from '../ui/controls'
import { usePrimary, usePrimaryText, useUpd } from './hooks'
import { Icon } from '../ui/icons'
import { aabb, layerPoly, localBounds } from '../engine/hit'
import { fromUnit, toUnit } from '../units'
import { align, distribute } from '../actions'
import { defaultDistort } from '../defaults'
import { randomActive, warpActive } from '../engine/distort'

export function AlignRow() {
  const n = useStore((s) => s.sel.length)
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-8 gap-1">
        {([['left', 'aL', 'Align left'], ['hcenter', 'aCH', 'Align centre horizontally'], ['right', 'aR', 'Align right'], ['top', 'aT', 'Align top'], ['vcenter', 'aCV', 'Align centre vertically'], ['bottom', 'aB', 'Align bottom']] as const).map(([op, ic, tip]) => (
          <Btn key={op} tip={`${tip}${n === 1 ? ' (to artboard)' : ''}`} onClick={() => align(op)} disabled={!n}>
            <Icon name={ic} />
          </Btn>
        ))}
        <Btn tip="Distribute horizontally (3+ layers)" onClick={() => distribute('h')} disabled={n < 3}><Icon name="dH" /></Btn>
        <Btn tip="Distribute vertically (3+ layers)" onClick={() => distribute('v')} disabled={n < 3}><Icon name="dV" /></Btn>
      </div>
    </div>
  )
}

export function TransformSection() {
  const l = usePrimary()
  const upd = useUpd()
  const unit = useStore((s) => s.doc.unit)
  const fv = useFonts((s) => s.version)
  if (!l) return <Section id="transform" title="Transform"><Hint>Select a layer.</Hint></Section>
  const b = localBounds(l, fv)
  const box = aabb([layerPoly(l, fv)])
  const u = (v: number) => Math.round(toUnit(v, unit) * 100) / 100
  const step = unit === 'in' ? 0.01 : unit === 'mm' ? 0.1 : 1
  return (
    <Section id="transform" title="Transform" badge={<span className="font-mono text-[9px] font-normal text-faint">{unit}</span>}>
      <AlignRow />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Row><Label w="w-4">X</Label><NumFieldMini value={u(l.x)} step={step} onChange={(v) => upd.any((x) => { x.x = fromUnit(v, unit) }, 'tx')} /></Row>
        <Row><Label w="w-4">Y</Label><NumFieldMini value={u(l.y)} step={step} onChange={(v) => upd.any((x) => { x.y = fromUnit(v, unit) }, 'ty')} /></Row>
        <Row><Label w="w-4">W</Label><NumFieldMini value={u(b.W)} step={step} onChange={(v) => upd.any((x) => { x.w = Math.max(1, fromUnit(v, unit)); if (x.type === 'text') x.autoWidth = false }, 'tw')} /></Row>
        <Row><Label w="w-4">H</Label><NumFieldMini value={u(b.H)} step={step} onChange={(v) => upd.any((x) => { x.h = Math.max(1, fromUnit(v, unit)); if (x.type === 'text') x.fixedHeight = true }, 'th')} /></Row>
      </div>
      <NumField label="Rotation" suffix="°" value={l.rotation} min={-180} max={180} step={0.5} onChange={(v) => upd.any((x) => { x.rotation = v }, 'rot')} />
      <NumField label="Scale X" suffix="%" value={Math.round(l.scaleX * 100)} min={1} max={1000} smin={10} smax={300} onChange={(v) => upd.any((x) => { x.scaleX = v / 100 }, 'sx')} />
      <NumField label="Scale Y" suffix="%" value={Math.round(l.scaleY * 100)} min={1} max={1000} smin={10} smax={300} onChange={(v) => upd.any((x) => { x.scaleY = v / 100 }, 'sy')} />
      <Row>
        <Toggle className="flex-1 gap-1.5" on={l.flipH} onChange={(v) => upd.any((x) => { x.flipH = v })} tip="Flip horizontal"><Icon name="flipH" /> Flip H</Toggle>
        <Toggle className="flex-1 gap-1.5" on={l.flipV} onChange={(v) => upd.any((x) => { x.flipV = v })} tip="Flip vertical"><Icon name="flipV" /> Flip V</Toggle>
        <Btn tip="Reset rotation, scale and flips" onClick={() => upd.any((x) => { x.rotation = 0; x.scaleX = 1; x.scaleY = 1; x.flipH = false; x.flipV = false })}><Icon name="reset" /></Btn>
      </Row>
      <Hint>
        Bounds {Math.round(box.w)} × {Math.round(box.h)} pt on the artboard. Drag handles on the canvas; hold Shift to keep proportions.
      </Hint>
    </Section>
  )
}

function NumFieldMini({ value, onChange, step }: { value: number; onChange: (v: number) => void; step: number }) {
  return (
    <div className="flex-1">
      <MiniInput value={value} onChange={onChange} step={step} />
    </div>
  )
}
import { NumInput } from '../ui/controls'
const MiniInput = ({ value, onChange, step }: { value: number; onChange: (v: number) => void; step: number }) => <NumInput value={value} onChange={onChange} step={step} w="w-full" />

const WARPS: { v: WarpStyle; label: string }[] = [
  { v: 'none', label: 'None' }, { v: 'arc', label: 'Arc' }, { v: 'arch', label: 'Arch' }, { v: 'wave', label: 'Wave' }, { v: 'flag', label: 'Flag' },
  { v: 'bulge', label: 'Bulge' }, { v: 'fisheye', label: 'Fisheye' }, { v: 'rise', label: 'Rise' }, { v: 'squeeze', label: 'Squeeze' },
]

function WarpGlyph({ w }: { w: WarpStyle }) {
  const d: Record<WarpStyle, string> = {
    none: 'M2 5h20M2 11h20',
    arc: 'M2 8q10-8 20 0M2 13q10-8 20 0',
    arch: 'M2 7q10-7 20 0M2 13q10-3 20 0',
    wave: 'M2 6q5-4 10 0t10 0M2 12q5-4 10 0t10 0',
    flag: 'M2 5q5-3 10 0t10 1M2 12q5-3 10 0t10 2',
    bulge: 'M2 6q10-5 20 0M2 11q10 5 20 0',
    fisheye: 'M4 8a8 4 0 1 0 16 0a8 4 0 1 0-16 0',
    rise: 'M2 11q10 0 20-7M2 15q10 0 20-7',
    squeeze: 'M2 4q10 5 20 0M2 13q10-5 20 0',
  }
  return <svg width="24" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d={d[w]} /></svg>
}

export function DistortSection() {
  const l = usePrimaryText()
  const upd = useUpd()
  if (!l) return null
  const d = l.distort
  const on = warpActive(d) || d.perspX || d.perspY || d.skewX || d.skewY || randomActive(d)
  return (
    <Section id="distort" title="Distort" badge={on ? <span className="bg-accent px-1 font-mono text-[8.5px] font-normal text-white">ON</span> : null}>
      {l.path.enabled && <Hint>Warp and glyph randomness are paused while the text follows a path. Skew still applies.</Hint>}
      <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Warp</span>
      <div className="grid grid-cols-3 gap-1">
        {WARPS.map((w) => (
          <button key={w.v} data-testid={`warp-${w.v}`} onClick={() => upd.text((t) => { t.distort.warp = w.v; if (w.v !== 'none' && !t.distort.bend) t.distort.bend = 50 })} className={`flex h-[38px] flex-col items-center justify-center gap-0.5 border text-[9.5px] ${d.warp === w.v ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}>
            <WarpGlyph w={w.v} />
            {w.label}
          </button>
        ))}
      </div>
      <NumField label="Bend" suffix="%" value={d.bend} min={-100} max={100} disabled={d.warp === 'none'} onChange={(v) => upd.text((t) => { t.distort.bend = v }, 'bend')} />
      <NumField label="Horiz. dist." suffix="%" value={d.hDist} min={-100} max={100} onChange={(v) => upd.text((t) => { t.distort.hDist = v }, 'hdist')} tip="Glyphs grow from left to right" />
      <NumField label="Vert. dist." suffix="%" value={d.vDist} min={-100} max={100} onChange={(v) => upd.text((t) => { t.distort.vDist = v }, 'vdist')} tip="Top wider than bottom (keystone)" />
      <NumField label="Intensity" suffix="%" value={d.intensity} min={0} max={200} onChange={(v) => upd.text((t) => { t.distort.intensity = v }, 'intensity')} tip="Master amount for warp and distortion" />
      {(d.warp === 'wave' || d.warp === 'flag') && <NumField label="Frequency" value={d.frequency} min={0.25} max={8} step={0.25} onChange={(v) => upd.text((t) => { t.distort.frequency = v }, 'freq')} />}
      <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-faint">Perspective</span>
      <NumField label="Persp. X" suffix="°" value={d.perspX} min={-70} max={70} onChange={(v) => upd.text((t) => { t.distort.perspX = v }, 'px')} tip="Turn the text plane around its vertical axis" />
      <NumField label="Persp. Y" suffix="°" value={d.perspY} min={-70} max={70} onChange={(v) => upd.text((t) => { t.distort.perspY = v }, 'py')} tip="Tilt the text plane around its horizontal axis" />
      <NumField label="Skew X" suffix="°" value={d.skewX} min={-70} max={70} onChange={(v) => upd.text((t) => { t.distort.skewX = v }, 'skx')} />
      <NumField label="Skew Y" suffix="°" value={d.skewY} min={-70} max={70} onChange={(v) => upd.text((t) => { t.distort.skewY = v }, 'sky')} />
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Individual glyphs · random</span>
        <Btn variant="ghost" tip="New random seed" onClick={() => upd.text((t) => { t.distort.seed = Math.floor(Math.random() * 99999) })}><Icon name="dice" size={12} /> Reseed</Btn>
      </div>
      <NumField label="Rotation" suffix="±°" value={d.rRotation} min={0} max={180} smax={60} onChange={(v) => upd.text((t) => { t.distort.rRotation = v }, 'rr')} />
      <NumField label="Scale" suffix="±%" value={d.rScale} min={0} max={100} smax={60} onChange={(v) => upd.text((t) => { t.distort.rScale = v }, 'rs')} />
      <NumField label="X position" suffix="±" value={d.rX} min={0} max={300} smax={80} onChange={(v) => upd.text((t) => { t.distort.rX = v }, 'rx')} />
      <NumField label="Y position" suffix="±" value={d.rY} min={0} max={300} smax={80} onChange={(v) => upd.text((t) => { t.distort.rY = v }, 'ry')} />
      <NumField label="Tracking" suffix="±" value={d.rTracking} min={0} max={1000} smax={400} onChange={(v) => upd.text((t) => { t.distort.rTracking = v }, 'rt')} tip="Random extra spacing, 1/1000 em" />
      <NumField label="Width" suffix="±" value={d.rWidth} min={0} max={100} onChange={(v) => upd.text((t) => { t.distort.rWidth = v }, 'rwd')} tip="Uses the wdth axis when available, otherwise horizontal scale (%)" />
      <NumField label="Weight" suffix="±" value={d.rWeight} min={0} max={800} smax={500} onChange={(v) => upd.text((t) => { t.distort.rWeight = v }, 'rwg')} tip="Needs a variable weight axis" />
      <Btn variant="solid" className="mt-1 tracking-[0.14em]" onClick={() => { upd.text((t) => { t.distort = defaultDistort() }); S().flash('Distortion reset') }}>RESET DISTORTION</Btn>
    </Section>
  )
}

const PATHS: { v: PathType; label: string }[] = [{ v: 'circle', label: 'Circle' }, { v: 'arc', label: 'Arc' }, { v: 'wave', label: 'Wave' }, { v: 'spiral', label: 'Spiral' }, { v: 'custom', label: 'SVG' }]

export function PathSection() {
  const l = usePrimaryText()
  const upd = useUpd()
  if (!l) return null
  const p = l.path
  const set = (fn: (x: typeof p) => void, key?: string) => upd.text((t) => fn(t.path), key)
  return (
    <Section id="path" title="Text on Path" badge={p.enabled ? <span className="bg-accent px-1 font-mono text-[8.5px] font-normal text-white">ON</span> : null}
      right={<Toggle on={p.enabled} onChange={(v) => set((x) => { x.enabled = v })} tip="Run the text along a path">{p.enabled ? 'On' : 'Off'}</Toggle>}>
      <Seg value={p.type} onChange={(v) => set((x) => { x.type = v; x.enabled = true })} options={PATHS} />
      {p.type === 'circle' && <NumField label="Radius" value={p.radius} min={10} max={3000} smax={800} onChange={(v) => set((x) => { x.radius = v }, 'p-r')} />}
      {p.type === 'arc' && (
        <>
          <NumField label="Radius" value={p.radius} min={10} max={3000} smax={1000} onChange={(v) => set((x) => { x.radius = v }, 'p-r')} />
          <NumField label="Sweep" suffix="°" value={p.sweep} min={5} max={359} onChange={(v) => set((x) => { x.sweep = v }, 'p-sw')} />
        </>
      )}
      {p.type === 'wave' && (
        <>
          <NumField label="Amplitude" value={p.amplitude} min={0} max={1000} smax={300} onChange={(v) => set((x) => { x.amplitude = v }, 'p-a')} />
          <NumField label="Wavelength" value={p.wavelength} min={20} max={3000} smax={1200} onChange={(v) => set((x) => { x.wavelength = v }, 'p-wl')} />
          <NumField label="Length" value={p.length} min={50} max={5000} smax={2400} onChange={(v) => set((x) => { x.length = v }, 'p-l')} />
        </>
      )}
      {p.type === 'spiral' && (
        <>
          <NumField label="Inner radius" value={p.radius} min={10} max={3000} smax={1000} onChange={(v) => set((x) => { x.radius = v }, 'p-r')} />
          <NumField label="Turns" value={p.turns} min={0.25} max={12} step={0.25} onChange={(v) => set((x) => { x.turns = v }, 'p-t')} />
          <NumField label="Growth" value={p.growth} min={5} max={600} smax={240} onChange={(v) => set((x) => { x.growth = v }, 'p-g')} tip="Radius added per turn" />
        </>
      )}
      {p.type === 'custom' && (
        <>
          <textarea aria-label="Custom SVG path" className="h-16 w-full resize-y border border-line bg-paper p-1.5 font-mono text-[10px] outline-none focus:border-accent" value={p.custom} onChange={(e) => set((x) => { x.custom = e.target.value }, 'p-c')} onKeyDown={(e) => e.stopPropagation()} />
          <Hint>Paste any SVG path “d” attribute. It is centred in the layer box.</Hint>
        </>
      )}
      <NumField label="Path offset" value={p.offset} min={-500} max={500} smin={-150} smax={150} onChange={(v) => set((x) => { x.offset = v }, 'p-off')} tip="Distance of the baseline from the path" />
      <NumField label="Start" suffix="%" value={p.start} min={-100} max={100} onChange={(v) => set((x) => { x.start = v }, 'p-st')} tip="Slide the text along the path" />
      <NumField label="Spacing" value={p.spacing} min={-200} max={2000} smax={600} onChange={(v) => set((x) => { x.spacing = v }, 'p-sp')} tip="Extra letter spacing along the path, 1/1000 em" />
      <Row>
        <Label>Direction</Label>
        <Seg value={p.direction} onChange={(v) => set((x) => { x.direction = v })} options={[{ v: 1, label: p.type === 'wave' ? 'Crest first' : 'Clockwise' }, { v: -1, label: p.type === 'wave' ? 'Trough first' : 'Counter-cw' }]} />
      </Row>
      <Row>
        <Label>Side</Label>
        <Seg value={p.side} onChange={(v) => set((x) => { x.side = v })} options={[{ v: 'outside', label: 'On / outside' }, { v: 'inside', label: 'Inside' }]} />
      </Row>
      <div className="flex flex-col gap-1.5">
        <Check on={p.reverse} onChange={(v) => set((x) => { x.reverse = v })} label="Reverse path direction" />
        <Check on={p.showPath} onChange={(v) => set((x) => { x.showPath = v })} label="Show path on canvas" />
        <Check on={p.exportPath} onChange={(v) => set((x) => { x.exportPath = v })} label="Include path in export" tip="Off: the guide path is hidden in PNG, JPG, SVG and PDF" />
      </div>
    </Section>
  )
}

const REPEATS: { v: RepeatMode; label: string }[] = [
  { v: 'none', label: 'Off' }, { v: 'rows', label: 'Rows' }, { v: 'columns', label: 'Columns' }, { v: 'grid', label: 'Grid' },
  { v: 'radial', label: 'Radial' }, { v: 'circular', label: 'Circular' }, { v: 'spiral', label: 'Spiral' },
]

export function RepeatSection() {
  const l = usePrimary()
  const upd = useUpd()
  if (!l) return null
  const r = l.repeat
  const set = (fn: (x: typeof r) => void, key?: string) => upd.any((t) => fn(t.repeat), key)
  return (
    <Section id="repeat" title="Repeat" badge={r.mode !== 'none' ? <span className="bg-accent px-1 font-mono text-[8.5px] font-normal text-white">{r.count}×</span> : null}>
      <div className="grid grid-cols-4 gap-1">
        {REPEATS.map((m) => (
          <button key={m.v} data-testid={`repeat-${m.v}`} onClick={() => set((x) => {
            x.mode = m.v
            if (m.v === 'rows' && !x.dy) x.dy = 120
            if (m.v === 'columns' && !x.dx) x.dx = 300
            if (m.v === 'grid') { x.dx = x.dx || 300; x.dy = x.dy || 120 }
            if (m.v === 'radial' || m.v === 'circular') x.count = Math.max(x.count, 8)
            if (m.v === 'spiral') x.count = Math.max(x.count, 18)
          })} className={`h-[24px] border text-[10px] ${r.mode === m.v ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}>
            {m.label}
          </button>
        ))}
      </div>
      {r.mode !== 'none' && (
        <>
          <NumField label="Copies" value={r.count} min={2} max={400} smax={60} onChange={(v) => set((x) => { x.count = v }, 'r-n')} />
          {r.mode === 'grid' && <NumField label="Columns" value={r.cols} min={1} max={60} smax={20} onChange={(v) => set((x) => { x.cols = v }, 'r-c')} />}
          {(r.mode === 'columns' || r.mode === 'grid') && <NumField label="H spacing" value={r.dx} min={-3000} max={3000} smin={-600} smax={600} onChange={(v) => set((x) => { x.dx = v }, 'r-dx')} />}
          {(r.mode === 'rows' || r.mode === 'grid') && <NumField label="V spacing" value={r.dy} min={-3000} max={3000} smin={-600} smax={600} onChange={(v) => set((x) => { x.dy = v }, 'r-dy')} />}
          {(r.mode === 'circular' || r.mode === 'spiral') && <NumField label="Radius" value={r.radius} min={0} max={3000} smax={1000} onChange={(v) => set((x) => { x.radius = v }, 'r-r')} tip="Distance from the layer centre to the pivot" />}
          <NumField label="Rotation +" suffix="°" value={r.rotation} min={-180} max={180} onChange={(v) => set((x) => { x.rotation = v }, 'r-rot')} tip={r.mode === 'radial' ? '0 = spread evenly over 360°' : 'Rotation added per copy'} />
          <NumField label="Scale +" suffix="%" value={r.scale} min={-50} max={50} step={0.5} onChange={(v) => set((x) => { x.scale = v }, 'r-sc')} tip="Scale change per copy" />
          <NumField label="Opacity −" suffix="%" value={r.opacity} min={0} max={100} onChange={(v) => set((x) => { x.opacity = v }, 'r-op')} tip="Opacity lost per copy" />
        </>
      )}
    </Section>
  )
}
