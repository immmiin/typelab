import { useState } from 'react'
import { useStore, S } from '../store'
import { ARTBOARD_PRESETS, GRID_PRESETS, uid } from '../defaults'
import type { Unit } from '../types'
import { Btn, Check, ColorField, Hint, Label, NumField, NumInput, Row, Section, Seg, Select } from '../ui/controls'
import { fromUnit, toUnit } from '../units'
import { AlignRow } from './FormPanels'
import { Icon } from '../ui/icons'
import { exportFile, type ExportFormat } from '../export'
import { cssForLayer } from '../engine/style'
import { usePrimaryText } from './hooks'
import { fitView } from '../canvas/Workspace'

export function CanvasSection() {
  const doc = useStore((s) => s.doc)
  const update = useStore((s) => s.update)
  const A = doc.artboard
  const u = doc.unit
  const step = u === 'in' ? 0.01 : u === 'mm' ? 0.1 : 1
  return (
    <Section id="canvas" title="Canvas / Artboard">
      <Row>
        <Label>Format</Label>
        <Select ariaLabel="Artboard preset" className="flex-1" value={A.preset} options={ARTBOARD_PRESETS.map((p) => ({ v: p.id, label: p.label }))}
          onChange={(v) => {
            const p = ARTBOARD_PRESETS.find((x) => x.id === v)!
            update((d) => {
              d.artboard.preset = v
              if (p.w) { d.artboard.w = p.w; d.artboard.h = p.h }
              if (['a4', 'a3', 'letter', 'tabloid', '6x9'].includes(v) && d.unit === 'px') d.unit = v === 'a4' || v === 'a3' ? 'mm' : 'in'
            })
            requestAnimationFrame(fitView)
          }} />
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <Row><Label w="w-4">W</Label><NumInput w="flex-1" step={step} value={Math.round(toUnit(A.w, u) * 100) / 100} min={0.01} onChange={(v) => update((d) => { d.artboard.w = Math.max(10, fromUnit(v, u)); d.artboard.preset = 'custom' }, 'ab-w')} /></Row>
        <Row><Label w="w-4">H</Label><NumInput w="flex-1" step={step} value={Math.round(toUnit(A.h, u) * 100) / 100} min={0.01} onChange={(v) => update((d) => { d.artboard.h = Math.max(10, fromUnit(v, u)); d.artboard.preset = 'custom' }, 'ab-h')} /></Row>
      </div>
      <Row>
        <Label>Units</Label>
        <Seg value={u} onChange={(v: Unit) => update((d) => { d.unit = v })} options={[{ v: 'px', label: 'px' }, { v: 'pt', label: 'pt' }, { v: 'mm', label: 'mm' }, { v: 'in', label: 'in' }]} />
      </Row>
      <Row>
        <Label>Background</Label>
        <Seg value={A.bg} onChange={(v) => update((d) => { d.artboard.bg = v })} options={[{ v: 'white', label: 'White' }, { v: 'black', label: 'Black' }, { v: 'custom', label: 'Colour' }, { v: 'transparent', label: 'None' }]} />
      </Row>
      {A.bg === 'custom' && <ColorField label="Colour" value={A.bgColor} onChange={(c) => update((d) => { d.artboard.bgColor = c }, 'bg')} />}
      <Row>
        <Btn className="flex-1" onClick={() => { const v = S().doc.artboard.w; update((d) => { d.artboard.w = d.artboard.h; d.artboard.h = v; d.artboard.preset = 'custom' }) }}>Swap orientation</Btn>
        <Btn className="flex-1" onClick={fitView}><Icon name="fit" /> Fit to screen</Btn>
      </Row>
      <Check on={doc.showRulers} onChange={(v) => update((d) => { d.showRulers = v })} label="Show rulers" />
      <Hint>Document space is 72 units per inch: 1 pt = 1 px. A4 is 595 × 842 pt.</Hint>
    </Section>
  )
}

export function LayoutSection() {
  const doc = useStore((s) => s.doc)
  const update = useStore((s) => s.update)
  const g = doc.grid
  const bl = doc.baseline
  const u = doc.unit
  return (
    <>
      <Section id="grid" title="Layout Grid" right={<Check on={g.show} onChange={(v) => update((d) => { d.grid.show = v })} label="Show" />}>
        <GridPresets />
        <Row>
          <Label>Type</Label>
          <Seg value={g.type} onChange={(v) => update((d) => { d.grid.type = v; d.grid.show = true })} options={[{ v: 'columns', label: 'Columns / rows' }, { v: 'uniform', label: 'Square' }]} />
        </Row>
        {g.type === 'uniform' ? (
          <NumField label="Cell size" suffix="pt" value={g.size} min={2} max={400} smax={96} onChange={(v) => update((d) => { d.grid.size = v; d.grid.show = true }, 'g-s')} />
        ) : (<>
        <NumField label="Columns" value={g.cols} min={0} max={48} smax={24} onChange={(v) => update((d) => { d.grid.cols = v; d.grid.show = true }, 'g-c')} />
        <NumField label="Rows" value={g.rows} min={0} max={48} smax={24} onChange={(v) => update((d) => { d.grid.rows = v; d.grid.show = true }, 'g-r')} />
        <NumField label="Margin" suffix="pt" value={g.margin} min={0} max={1000} smax={300} onChange={(v) => update((d) => { d.grid.margin = v; d.grid.show = true }, 'g-m')} />
        <NumField label="Gutter" suffix="pt" value={g.gutter} min={0} max={500} smax={120} onChange={(v) => update((d) => { d.grid.gutter = v; d.grid.show = true }, 'g-g')} />
        </>)}
        <ColorField label="Colour" value={g.color} onChange={(c) => update((d) => { d.grid.color = c }, 'g-col')} />
      </Section>
      <Section id="baseline" title="Baseline Grid" right={<Check on={bl.show} onChange={(v) => update((d) => { d.baseline.show = v })} label="Show" />}>
        <NumField label="Increment" suffix="pt" value={bl.size} min={2} max={400} smax={96} step={0.5} onChange={(v) => update((d) => { d.baseline.size = v; d.baseline.show = true }, 'b-s')} />
        <NumField label="Offset" suffix="pt" value={bl.offset} min={0} max={400} smax={96} step={0.5} onChange={(v) => update((d) => { d.baseline.offset = v }, 'b-o')} />
        <Btn onClick={() => { const l = S().doc.layers.find((x) => S().sel.includes(x.id) && x.type === 'text'); if (l && l.type === 'text') update((d) => { d.baseline.size = Math.round(l.style.size * l.style.lineHeight * 10) / 10; d.baseline.show = true }); else S().flash('Select a text layer to match its leading') }}>
          Match selected text leading
        </Btn>
      </Section>
      <Section id="guides" title="Guides" right={<Check on={doc.showGuides} onChange={(v) => update((d) => { d.showGuides = v })} label="Show" />}>
        <Row>
          <Btn className="flex-1" onClick={() => update((d) => { d.guides.push({ id: uid(), axis: 'y', pos: Math.round(d.artboard.h / 2) }); d.showGuides = true })}>+ Horizontal</Btn>
          <Btn className="flex-1" onClick={() => update((d) => { d.guides.push({ id: uid(), axis: 'x', pos: Math.round(d.artboard.w / 2) }); d.showGuides = true })}>+ Vertical</Btn>
        </Row>
        <Check on={doc.guidesLocked} onChange={(v) => update((d) => { d.guidesLocked = v })} label="Lock guides" />
        {doc.guides.length > 0 && (
          <div className="flex flex-col gap-1">
            {doc.guides.map((gd, i) => (
              <Row key={gd.id}>
                <span className="w-[70px] font-mono text-[10px] text-mute">{gd.axis === 'x' ? 'Vertical' : 'Horizontal'} {i + 1}</span>
                <NumInput w="flex-1" value={Math.round(toUnit(gd.pos, u) * 100) / 100} step={u === 'in' ? 0.01 : 1} suffix={u} onChange={(v) => update((d) => { const x = d.guides.find((q) => q.id === gd.id); if (x) x.pos = fromUnit(v, u) }, 'guide-' + gd.id)} />
                <Btn tip="Delete guide" onClick={() => update((d) => { d.guides = d.guides.filter((q) => q.id !== gd.id) })}><Icon name="trash" size={12} /></Btn>
              </Row>
            ))}
            <Btn variant="ghost" onClick={() => update((d) => { d.guides = [] })}>Clear all guides</Btn>
          </div>
        )}
        <Hint>Drag from a ruler to add a guide. Drag a guide back onto the ruler to delete it.</Hint>
      </Section>
      <Section id="snap" title="Snapping & Align">
        <div className="grid grid-cols-2 gap-1.5">
          <Check on={doc.snap.grid} onChange={(v) => update((d) => { d.snap.grid = v })} label="Snap to grid" />
          <Check on={doc.snap.guides} onChange={(v) => update((d) => { d.snap.guides = v })} label="Snap to guides" />
          <Check on={doc.snap.objects} onChange={(v) => update((d) => { d.snap.objects = v })} label="Snap to objects" />
          <Check on={doc.snap.center} onChange={(v) => update((d) => { d.snap.center = v })} label="Snap to canvas" />
        </div>
        <AlignRow />
        <Hint>Hold Alt while dragging to move without snapping. One layer aligns to the artboard; several align to each other.</Hint>
      </Section>
    </>
  )
}

export function ExportSection() {
  const [fmt, setFmt] = useState<ExportFormat>('png')
  const [scale, setScale] = useState(2)
  const [transparent, setTransparent] = useState(false)
  const [guides, setGuides] = useState(false)
  const [name, setName] = useState('typelab')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const A = useStore((s) => s.doc.artboard)
  const run = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const r = await exportFile(fmt, scale, transparent && fmt !== 'jpg', guides, name)
      setStatus(r.result === 'declined' ? 'Download cancelled.' : `${r.file} · ${(r.size / 1024).toFixed(0)} KB`)
    } catch (e) {
      setStatus('Export failed: ' + (e as Error).message)
    }
    setBusy(false)
  }
  return (
    <Section id="export" title="Export">
      <Seg value={fmt} onChange={setFmt} options={[{ v: 'png', label: 'PNG' }, { v: 'jpg', label: 'JPG' }, { v: 'svg', label: 'SVG' }, { v: 'pdf', label: 'PDF' }]} />
      {fmt !== 'svg' && (
        <Row>
          <Label>Scale</Label>
          <Seg value={scale} onChange={setScale} options={[{ v: 1, label: '1×' }, { v: 2, label: '2×' }, { v: 3, label: '3×' }]} />
        </Row>
      )}
      <div className="flex flex-col gap-1.5">
        <Check on={transparent && fmt !== 'jpg'} disabled={fmt === 'jpg'} onChange={setTransparent} label="Transparent background" />
        <Check on={guides} onChange={setGuides} label="Include text-on-path guides" />
      </div>
      <Row>
        <Label>File name</Label>
        <input aria-label="File name" className="h-[24px] min-w-0 flex-1 border border-line bg-paper px-2 font-mono text-2xs outline-none focus:border-accent" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </Row>
      <Btn variant="solid" className="h-[30px] tracking-[0.12em]" onClick={run} disabled={busy}>
        <Icon name="export" /> {busy ? 'EXPORTING…' : `EXPORT ${fmt.toUpperCase()}`}
      </Btn>
      <Hint>
        {fmt === 'svg' && 'SVG keeps live, editable text with the fonts embedded as @font-face.'}
        {fmt === 'pdf' && `PDF page is ${Math.round(A.w)} × ${Math.round(A.h)} pt with the composition as a ${scale}× high-resolution image.`}
        {(fmt === 'png' || fmt === 'jpg') && `${Math.round(A.w * scale)} × ${Math.round(A.h * scale)} px.`}
      </Hint>
      {status && <p className="font-mono text-[10px] text-ink" data-testid="export-status">{status}</p>}
      <CopyCss />
    </Section>
  )
}

function CopyCss() {
  const l = usePrimaryText()
  const [copied, setCopied] = useState(false)
  if (!l) return <Hint>Select a text layer to generate its CSS.</Hint>
  const css = cssForLayer(l)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(css)
      setCopied(true)
      S().flash('CSS copied')
    } catch {
      const pre = document.getElementById('tl-css')
      if (pre) {
        const r = document.createRange()
        r.selectNodeContents(pre)
        const s = window.getSelection()
        s?.removeAllRanges()
        s?.addRange(r)
      }
      S().flash('Selected — press ⌘C to copy')
    }
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">CSS</span>
        <Btn onClick={copy} tip="Copy CSS for the selected text layer"><Icon name="copy" size={12} /> {copied ? 'Copied' : 'COPY CSS'}</Btn>
      </div>
      <pre id="tl-css" data-testid="css-out" className="tl-scroll max-h-[220px] overflow-auto bg-ink p-2 font-mono text-[10px] leading-relaxed text-paper">{css}</pre>
    </div>
  )
}

export function GridPresets({ onPick }: { onPick?: () => void }) {
  const g = useStore((s) => s.doc.grid)
  const update = useStore((s) => s.update)
  const isOn = (p: (typeof GRID_PRESETS)[number]) => g.show && Object.entries(p.grid).every(([k, v]) => (g as Record<string, unknown>)[k] === v)
  return (
    <div className="grid grid-cols-2 gap-1" data-testid="grid-presets">
      {GRID_PRESETS.map((p) => (
        <button
          key={p.id}
          data-tip={p.hint}
          data-grid-preset={p.id}
          onClick={() => {
            update((d) => { Object.assign(d.grid, p.grid); d.grid.show = true })
            onPick?.()
          }}
          className={`flex h-[26px] items-center gap-1.5 border px-1.5 text-left text-2xs ${isOn(p) ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
        >
          <GridGlyph p={p.grid} on={isOn(p)} />
          {p.label}
        </button>
      ))}
    </div>
  )
}

function GridGlyph({ p, on }: { p: Partial<{ type: string; size: number; cols: number; rows: number }>; on: boolean }) {
  const lines: string[] = []
  if (p.type === 'uniform') {
    const n = p.size && p.size <= 4 ? 6 : p.size && p.size >= 24 ? 3 : 4
    for (let i = 1; i < n; i++) lines.push(`M${(i * 14) / n} 0V14`, `M0 ${(i * 14) / n}H14`)
  } else {
    const c = p.cols || 1, r = p.rows || 1
    for (let i = 1; i < c; i++) lines.push(`M${(i * 14) / c} 0V14`)
    for (let i = 1; i < r; i++) lines.push(`M0 ${(i * 14) / r}H14`)
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" fill="none" stroke={on ? '#fff' : 'currentColor'} strokeWidth="0.8">
      <rect x="0.5" y="0.5" width="13" height="13" />
      <path d={lines.join('')} opacity="0.7" />
    </svg>
  )
}
