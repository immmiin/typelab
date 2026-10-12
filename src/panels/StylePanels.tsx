import { useRef, useState } from 'react'
import type { BlendMode, Effects, Paint } from '../types'
import { Btn, ColorField, Hint, Label, NumField, Row, Section, Seg, Select, Toggle } from '../ui/controls'
import { usePrimary, useUpd } from './hooks'
import { Icon } from '../ui/icons'
import { uid } from '../defaults'

function GradientBar({ p, onChange }: { p: Paint; onChange: (fn: (p: Paint) => void, key?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const stops = p.stops
  const css = `linear-gradient(90deg, ${stops.slice().sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }
  const cur = stops[Math.min(active, stops.length - 1)]
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={ref}
        className="relative h-5 cursor-copy border border-line"
        style={{ background: css }}
        data-tip="Click to add a stop · drag markers to move"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.stop) return
          const o = at(e.clientX)
          onChange((x) => { x.stops.push({ offset: Math.round(o * 100) / 100, color: cur?.color ?? '#000000' }) })
          setActive(stops.length)
        }}
      >
        {stops.map((s, i) => (
          <div
            key={i}
            data-stop="1"
            className={`absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 cursor-ew-resize border ${i === active ? 'border-accent ring-1 ring-accent' : 'border-ink'}`}
            style={{ left: `${s.offset * 100}%`, background: s.color }}
            onPointerDown={(e) => {
              e.stopPropagation()
              setActive(i)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return
              const o = at(e.clientX)
              onChange((x) => { x.stops[i].offset = Math.round(o * 100) / 100 }, 'stop-pos')
            }}
          />
        ))}
      </div>
      {cur && (
        <Row>
          <ColorField label={`Stop ${Math.min(active, stops.length - 1) + 1}`} value={cur.color} onChange={(c) => onChange((x) => { x.stops[Math.min(active, x.stops.length - 1)].color = c }, 'stop-color')} />
          <Btn tip="Remove stop" disabled={stops.length <= 2} onClick={() => { onChange((x) => { x.stops.splice(Math.min(active, x.stops.length - 1), 1) }); setActive(0) }}>
            <Icon name="trash" size={12} />
          </Btn>
        </Row>
      )}
      {cur && <NumField label="Position" suffix="%" value={Math.round(cur.offset * 100)} min={0} max={100} onChange={(v) => onChange((x) => { x.stops[Math.min(active, x.stops.length - 1)].offset = v / 100 }, 'stop-pos')} />}
    </div>
  )
}

export function ColorSection() {
  const l = usePrimary()
  const upd = useUpd()
  if (!l) return <Section id="color" title="Colour"><Hint>Select a layer.</Hint></Section>
  const p = l.fill
  const setPaint = (fn: (p: Paint) => void, key?: string) => upd.any((x) => fn(x.fill as Paint), key)
  return (
    <Section id="color" title="Colour">
      {l.type === 'shape' && (
        <Row>
          <Label>Fill</Label>
          <Seg value={l.fillEnabled ? 'on' : 'off'} onChange={(v) => upd.any((x) => { if (x.type === 'shape') x.fillEnabled = v === 'on' })} options={[{ v: 'on', label: 'Fill' }, { v: 'off', label: 'No fill' }]} />
        </Row>
      )}
      <Row>
        <Label>Fill type</Label>
        <Seg value={p.type} onChange={(v) => setPaint((x) => { x.type = v; if (v !== 'solid' && x.stops.length < 2) x.stops = [{ offset: 0, color: x.color }, { offset: 1, color: '#2b2bff' }] })} options={[{ v: 'solid', label: 'Solid' }, { v: 'linear', label: 'Linear' }, { v: 'radial', label: 'Radial' }]} />
      </Row>
      {p.type === 'solid' ? (
        <ColorField label="Text fill" value={p.color} onChange={(c) => setPaint((x) => { x.color = c }, 'fill')} />
      ) : (
        <>
          <GradientBar p={p} onChange={setPaint} />
          {p.type === 'linear' ? (
            <NumField label="Angle" suffix="°" value={p.angle} min={0} max={360} onChange={(v) => setPaint((x) => { x.angle = v }, 'g-angle')} />
          ) : (
            <>
              <NumField label="Centre X" suffix="%" value={p.cx} min={0} max={100} onChange={(v) => setPaint((x) => { x.cx = v }, 'g-cx')} />
              <NumField label="Centre Y" suffix="%" value={p.cy} min={0} max={100} onChange={(v) => setPaint((x) => { x.cy = v }, 'g-cy')} />
            </>
          )}
        </>
      )}
      <div className="mt-1 flex items-center gap-2">
        <Label>Stroke</Label>
        <Seg value={l.stroke.enabled ? 'on' : 'off'} onChange={(v) => upd.any((x) => { x.stroke.enabled = v === 'on' })} options={[{ v: 'off', label: 'None' }, { v: 'on', label: 'Stroke' }]} />
      </div>
      {l.stroke.enabled && (
        <>
          <ColorField label="Stroke" value={l.stroke.color} onChange={(c) => upd.any((x) => { x.stroke.color = c }, 'stroke-c')} />
          <NumField label="Stroke width" suffix="pt" value={l.stroke.width} min={0} max={200} smax={30} step={0.5} onChange={(v) => upd.any((x) => { x.stroke.width = v }, 'stroke-w')} />
        </>
      )}
      <NumField label="Opacity" suffix="%" value={Math.round(l.opacity * 100)} min={0} max={100} onChange={(v) => upd.any((x) => { x.opacity = v / 100 }, 'opacity')} />
      {l.type === 'shape' && l.shape === 'rect' && <NumField label="Corner" suffix="pt" value={l.radius} min={0} max={1000} smax={200} onChange={(v) => upd.any((x) => { if (x.type === 'shape') x.radius = v }, 'radius')} />}
    </Section>
  )
}

const BLENDS: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'difference', 'exclusion', 'color-dodge', 'color-burn']

function Block({ title, on, onToggle, children, tip }: { title: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode; tip?: string }) {
  return (
    <div className={`border ${on ? 'border-ink' : 'border-line'}`}>
      <button className="flex h-[26px] w-full items-center justify-between px-2 text-left" onClick={() => onToggle(!on)} aria-pressed={on} data-tip={tip}>
        <span className="text-2xs">{title}</span>
        <span className={`h-2.5 w-5 border ${on ? 'border-accent bg-accent' : 'border-mute'} relative`}>
          <span className={`absolute top-0 h-full w-2 bg-paper transition-all ${on ? 'left-[10px]' : 'left-0 bg-mute'}`} />
        </span>
      </button>
      {on && <div className="flex flex-col gap-1.5 border-t border-hair p-2">{children}</div>}
    </div>
  )
}

export function EffectsSection() {
  const l = usePrimary()
  const upd = useUpd()
  if (!l) return null
  const fx = l.effects
  const isText = l.type === 'text'
  const set = (fn: (e: Effects) => void, key?: string) => upd.any((x) => fn(x.effects as Effects), key)
  const active = [fx.shadows.some((s) => s.enabled), fx.blur > 0, fx.outline.enabled, fx.offsetOutline.enabled, fx.echo.enabled, fx.longShadow.enabled, fx.chromatic.enabled, fx.halftone.enabled, fx.grain > 0, fx.blend !== 'normal'].filter(Boolean).length
  return (
    <Section id="effects" title="Effects" badge={active ? <span className="bg-accent px-1 font-mono text-[8.5px] font-normal text-white">{active}</span> : null}
      right={active ? <Btn variant="ghost" tip="Remove all effects" onClick={() => set((e) => { e.shadows = []; e.blur = 0; e.outline.enabled = false; e.offsetOutline.enabled = false; e.echo.enabled = false; e.longShadow.enabled = false; e.chromatic.enabled = false; e.halftone.enabled = false; e.grain = 0; e.blend = 'normal' })}><Icon name="reset" size={12} /> Clear</Btn> : undefined}>
      <Row>
        <Label>Blend</Label>
        <Select ariaLabel="Blend mode" className="flex-1" value={fx.blend} options={BLENDS.map((b) => ({ v: b, label: b.replace('-', ' ').replace(/^\w/, (c) => c.toUpperCase()) }))} onChange={(v) => set((e) => { e.blend = v })} />
      </Row>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Shadows · {fx.shadows.length}</span>
        <Btn variant="ghost" onClick={() => set((e) => { e.shadows.push({ id: uid(), enabled: true, x: 6, y: 6, blur: 0, spread: 0, color: '#111111', opacity: 0.9 }) })}>
          <Icon name="plus" size={12} /> Add shadow
        </Btn>
      </div>
      {fx.shadows.map((s, i) => (
        <div key={s.id} className={`flex flex-col gap-1.5 border p-2 ${s.enabled ? 'border-ink' : 'border-line opacity-60'}`}>
          <Row>
            <span className="flex-1 text-2xs">Shadow {i + 1}</span>
            <Toggle on={s.enabled} onChange={(v) => set((e) => { e.shadows[i].enabled = v })}>{s.enabled ? 'On' : 'Off'}</Toggle>
            <Btn tip="Delete shadow" onClick={() => set((e) => { e.shadows.splice(i, 1) })}><Icon name="trash" size={12} /></Btn>
          </Row>
          <NumField label="X offset" value={s.x} min={-500} max={500} smin={-80} smax={80} onChange={(v) => set((e) => { e.shadows[i].x = v }, 'sh-x' + i)} />
          <NumField label="Y offset" value={s.y} min={-500} max={500} smin={-80} smax={80} onChange={(v) => set((e) => { e.shadows[i].y = v }, 'sh-y' + i)} />
          <NumField label="Blur" value={s.blur} min={0} max={300} smax={80} onChange={(v) => set((e) => { e.shadows[i].blur = v }, 'sh-b' + i)} />
          <NumField label="Spread" value={s.spread} min={0} max={100} smax={30} onChange={(v) => set((e) => { e.shadows[i].spread = v }, 'sh-s' + i)} />
          <ColorField label="Colour" value={s.color} onChange={(c) => set((e) => { e.shadows[i].color = c }, 'sh-c' + i)} />
          <NumField label="Opacity" suffix="%" value={Math.round(s.opacity * 100)} min={0} max={100} onChange={(v) => set((e) => { e.shadows[i].opacity = v / 100 }, 'sh-o' + i)} />
        </div>
      ))}
      <NumField label="Layer blur" value={fx.blur} min={0} max={100} smax={30} step={0.5} onChange={(v) => set((e) => { e.blur = v }, 'blur')} />
      <NumField label="Grain" suffix="%" value={Math.round(fx.grain * 100)} min={0} max={100} onChange={(v) => set((e) => { e.grain = v / 100 }, 'grain')} tip="Film-grain noise inside the letterforms" />
      {isText && (
        <>
          <Block title="Outline" on={fx.outline.enabled} onToggle={(v) => set((e) => { e.outline.enabled = v })} tip="Outer contour behind the fill">
            <NumField label="Width" suffix="pt" value={fx.outline.width} min={0} max={100} smax={30} step={0.5} onChange={(v) => set((e) => { e.outline.width = v }, 'ol-w')} />
            <ColorField label="Colour" value={fx.outline.color} onChange={(c) => set((e) => { e.outline.color = c }, 'ol-c')} />
          </Block>
          <Block title="Offset outline" on={fx.offsetOutline.enabled} onToggle={(v) => set((e) => { e.offsetOutline.enabled = v })} tip="Hollow copy offset from the text">
            <NumField label="X" value={fx.offsetOutline.x} min={-300} max={300} smin={-60} smax={60} onChange={(v) => set((e) => { e.offsetOutline.x = v }, 'oo-x')} />
            <NumField label="Y" value={fx.offsetOutline.y} min={-300} max={300} smin={-60} smax={60} onChange={(v) => set((e) => { e.offsetOutline.y = v }, 'oo-y')} />
            <NumField label="Width" suffix="pt" value={fx.offsetOutline.width} min={0.25} max={40} step={0.25} onChange={(v) => set((e) => { e.offsetOutline.width = v }, 'oo-w')} />
            <ColorField label="Colour" value={fx.offsetOutline.color} onChange={(c) => set((e) => { e.offsetOutline.color = c }, 'oo-c')} />
          </Block>
          <Block title="Echo" on={fx.echo.enabled} onToggle={(v) => set((e) => { e.echo.enabled = v })} tip="Repeated fading copies behind the text">
            <NumField label="Copies" value={fx.echo.count} min={1} max={40} onChange={(v) => set((e) => { e.echo.count = v }, 'ec-n')} />
            <NumField label="Step X" value={fx.echo.dx} min={-200} max={200} smin={-60} smax={60} onChange={(v) => set((e) => { e.echo.dx = v }, 'ec-x')} />
            <NumField label="Step Y" value={fx.echo.dy} min={-200} max={200} smin={-60} smax={60} onChange={(v) => set((e) => { e.echo.dy = v }, 'ec-y')} />
            <NumField label="Fade" suffix="%" value={fx.echo.fade} min={0} max={100} onChange={(v) => set((e) => { e.echo.fade = v }, 'ec-f')} />
          </Block>
          <Block title="Long shadow" on={fx.longShadow.enabled} onToggle={(v) => set((e) => { e.longShadow.enabled = v })} tip="Solid extruded shadow">
            <NumField label="Length" value={fx.longShadow.length} min={1} max={600} smax={200} onChange={(v) => set((e) => { e.longShadow.length = v }, 'ls-l')} />
            <NumField label="Angle" suffix="°" value={fx.longShadow.angle} min={0} max={360} onChange={(v) => set((e) => { e.longShadow.angle = v }, 'ls-a')} />
            <ColorField label="Colour" value={fx.longShadow.color} onChange={(c) => set((e) => { e.longShadow.color = c }, 'ls-c')} />
          </Block>
          <Block title="Chromatic offset" on={fx.chromatic.enabled} onToggle={(v) => set((e) => { e.chromatic.enabled = v })} tip="Two colour plates slightly out of register">
            <NumField label="Amount" value={fx.chromatic.amount} min={0} max={60} step={0.5} onChange={(v) => set((e) => { e.chromatic.amount = v }, 'ch-a')} />
            <NumField label="Angle" suffix="°" value={fx.chromatic.angle} min={0} max={360} onChange={(v) => set((e) => { e.chromatic.angle = v }, 'ch-g')} />
            <ColorField label="Plate A" value={fx.chromatic.colorA} onChange={(c) => set((e) => { e.chromatic.colorA = c }, 'ch-ca')} />
            <ColorField label="Plate B" value={fx.chromatic.colorB} onChange={(c) => set((e) => { e.chromatic.colorB = c }, 'ch-cb')} />
          </Block>
          <Block title="Halftone" on={fx.halftone.enabled} onToggle={(v) => set((e) => { e.halftone.enabled = v })} tip="Fill the letters with a dot screen">
            <NumField label="Dot size" value={fx.halftone.size} min={0.5} max={40} step={0.5} onChange={(v) => set((e) => { e.halftone.size = v }, 'ht-s')} />
            <NumField label="Spacing" value={fx.halftone.spacing} min={2} max={60} step={0.5} onChange={(v) => set((e) => { e.halftone.spacing = v }, 'ht-p')} />
            <NumField label="Screen angle" suffix="°" value={fx.halftone.angle} min={0} max={90} onChange={(v) => set((e) => { e.halftone.angle = v }, 'ht-a')} />
          </Block>
        </>
      )}
    </Section>
  )
}
