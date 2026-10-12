import { useEffect, useMemo, useRef, useState } from 'react'
import { useMaker } from '../maker/store'
import { CHARSET, DEFAULT_GLYPHS, ROWS, emptyRows, type GlyphRows } from '../maker/glyphs'
import { ASC, CAP, CELL_H, buildContours, buildFont, contoursToSvg, glyphMetrics, layoutText, type MakerParams, type ModuleShape } from '../maker/outline'
import { Check, NumField, Seg, Btn, Section } from '../ui/controls'
import { saveFile } from '../export'
import { uploadFontFiles } from '../fonts/registry'
import { S } from '../store'

const TOP = ASC - CAP // y of cap line in y-down space

function glyphD(rows: GlyphRows, p: MakerParams) {
  return contoursToSvg(buildContours(rows, p))
}

export function MakerView() {
  const glyphs = useMaker((s) => s.glyphs)
  const params = useMaker((s) => s.params)
  const current = useMaker((s) => s.current)
  const set = useMaker((s) => s.set)

  // keyboard: type a character to jump to it, ⌘Z / ⇧⌘Z, Shift+arrows to move the drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable]')) return
      const m = useMaker.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? m.redo() : m.undo() }
      if (mod) return
      if (e.shiftKey && e.key.startsWith('Arrow')) {
        e.preventDefault()
        return m.shift(m.current, e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0)
      }
      if (e.key.length === 1) {
        const ch = e.key.toUpperCase()
        if (m.glyphs[ch]) { e.preventDefault(); m.set({ current: ch }) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const chars = useMemo(() => [...CHARSET, ...Object.keys(glyphs).filter((c) => !CHARSET.includes(c))], [glyphs])

  return (
    <div className="flex h-full min-h-0" data-testid="maker">
      {/* glyph set */}
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Glyph set</span>
          <span className="font-mono text-[10px] text-mute">{chars.length}</span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-px overflow-y-auto bg-line p-px">
          {chars.map((ch) => (
            <button
              key={ch}
              onClick={() => set({ current: ch })}
              data-glyph={ch}
              className={`flex aspect-[3/4] flex-col items-center justify-between pb-0.5 pt-1.5 ${current === ch ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-hover'}`}
            >
              <Thumb rows={glyphs[ch]} params={params} />
              <span className={`font-mono text-[9px] ${current === ch ? 'text-paper/70' : 'text-mute'}`}>{ch === ' ' ? 'SP' : ch}</span>
            </button>
          ))}
        </div>
        <AddGlyph />
      </aside>

      {/* editor + preview */}
      <main className="flex min-w-0 flex-1 flex-col">
        <GlyphEditor ch={current} />
        <Preview />
      </main>

      {/* parameters */}
      <aside className="flex w-[296px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
        <ParamPanel />
      </aside>
    </div>
  )
}

function Thumb({ rows, params }: { rows: GlyphRows; params: MakerParams }) {
  const d = useMemo(() => glyphD(rows, params), [rows, params])
  const { advance } = glyphMetrics(rows, params)
  return (
    <svg viewBox={`0 ${TOP - 60} ${Math.max(advance, 300)} ${CAP + 120}`} className="h-[34px] w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={d} fill="currentColor" transform={`translate(${(Math.max(advance, 300) - advance) / 2} 0)`} />
    </svg>
  )
}

function AddGlyph() {
  const [v, setV] = useState('')
  const add = () => {
    const ch = [...v.trim()][0]?.toUpperCase()
    if (!ch) return
    const m = useMaker.getState()
    if (!m.glyphs[ch]) {
      m.checkpoint()
      m.set({ glyphs: { ...m.glyphs, [ch]: emptyRows(5) } })
    }
    m.set({ current: ch })
    setV('')
  }
  return (
    <div className="flex items-center gap-1.5 border-t border-line p-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        maxLength={2}
        placeholder="Add a character…"
        className="h-6 min-w-0 flex-1 border border-line bg-paper px-2 text-2xs outline-none focus:border-ink"
        aria-label="Add a character"
      />
      <Btn onClick={add}>Add</Btn>
    </div>
  )
}

function GlyphEditor({ ch }: { ch: string }) {
  const rows = useMaker((s) => s.glyphs[ch])
  const params = useMaker((s) => s.params)
  const canUndo = useMaker((s) => s.past.length > 0)
  const canRedo = useMaker((s) => s.future.length > 0)
  const m = useMaker.getState()
  const svgRef = useRef<SVGSVGElement>(null)
  const paint = useRef<boolean | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  if (!rows) return null
  const { cols, cw, lsb, advance } = glyphMetrics(rows, params)
  const pad = 60
  const vbW = advance + pad * 2
  const d = glyphD(rows, params)
  const isDefault = JSON.stringify(rows) === JSON.stringify(DEFAULT_GLYPHS[ch])

  const cellAt = (e: React.PointerEvent) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const c = Math.floor((pt.x - lsb) / cw)
    const r = Math.floor((pt.y - TOP) / CELL_H)
    return c >= 0 && c < cols && r >= 0 && r < ROWS ? { c, r } : null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="font-mono text-[11px]">
          <span className="text-mute">Glyph</span> <b className="text-ink">{ch === ' ' ? 'space' : ch}</b>
          <span className="text-mute"> · U+{ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} · {cols} × {ROWS}</span>
        </span>
        <div className="flex-1" />
        <span className="text-2xs text-mute">Width</span>
        <Btn tip="Narrower" onClick={() => m.setWidth(ch, cols - 1)} disabled={cols <= 1}>−</Btn>
        <Btn tip="Wider" onClick={() => m.setWidth(ch, cols + 1)} disabled={cols >= 9}>+</Btn>
        <div className="mx-1 h-5 w-px bg-line" />
        <Btn tip="Undo · ⌘Z" onClick={m.undo} disabled={!canUndo}>Undo</Btn>
        <Btn tip="Redo · ⇧⌘Z" onClick={m.redo} disabled={!canRedo}>Redo</Btn>
        <Btn tip="Empty every cell" onClick={() => m.clearGlyph(ch)}>Clear</Btn>
        <Btn tip="Back to the starter drawing" onClick={() => m.revertGlyph(ch)} disabled={isDefault || !DEFAULT_GLYPHS[ch]}>Revert</Btn>
        <Btn active={showGrid} onClick={() => setShowGrid(!showGrid)} tip="Show cells">Grid</Btn>
      </div>
      <div className="relative grid min-h-0 flex-1 place-items-center bg-paper p-6">
        <svg
          ref={svgRef}
          viewBox={`${-pad} ${TOP - pad} ${vbW} ${CAP + pad * 2}`}
          className="h-full max-h-[560px] w-auto max-w-full touch-none select-none"
          style={{ aspectRatio: `${vbW} / ${CAP + pad * 2}` }}
          onPointerDown={(e) => {
            const hit = cellAt(e)
            if (!hit) return
            e.currentTarget.setPointerCapture(e.pointerId)
            m.checkpoint()
            paint.current = rows[hit.r][hit.c] !== '#'
            m.setCell(ch, hit.c, hit.r, paint.current)
          }}
          onPointerMove={(e) => {
            if (paint.current === null) return
            const hit = cellAt(e)
            if (hit) useMaker.getState().setCell(ch, hit.c, hit.r, paint.current)
          }}
          onPointerUp={() => (paint.current = null)}
          onPointerCancel={() => (paint.current = null)}
          data-testid="glyph-editor"
        >
          {/* sidebearings */}
          <rect x={0} y={TOP - pad} width={advance} height={CAP + pad * 2} fill="var(--panel)" />
          {showGrid &&
            rows.map((row, r) =>
              [...row].map((v, c) => (
                <rect key={`${r}-${c}`} x={lsb + c * cw} y={TOP + r * CELL_H} width={cw} height={CELL_H} fill={v === '#' ? 'var(--hover)' : 'transparent'} stroke="var(--line)" strokeWidth={2} className="cursor-crosshair" />
              )),
            )}
          {!showGrid && <rect x={lsb} y={TOP} width={cols * cw} height={CAP} fill="transparent" className="cursor-crosshair" />}
          <path d={d} fill="var(--ink)" pointerEvents="none" />
          <line x1={-pad} x2={advance + pad} y1={ASC} y2={ASC} stroke="var(--accent)" strokeWidth={2} pointerEvents="none" />
          <line x1={-pad} x2={advance + pad} y1={TOP} y2={TOP} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="8 6" pointerEvents="none" />
          <line x1={0} x2={0} y1={TOP - pad} y2={ASC + pad} stroke="var(--mute)" strokeWidth={1} pointerEvents="none" />
          <line x1={advance} x2={advance} y1={TOP - pad} y2={ASC + pad} stroke="var(--mute)" strokeWidth={1} pointerEvents="none" />
        </svg>
        <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-mute">Click or drag to draw · drag over filled cells to erase · Shift + arrows to move · type a letter to jump</div>
      </div>
    </div>
  )
}

function Preview() {
  const glyphs = useMaker((s) => s.glyphs)
  const params = useMaker((s) => s.params)
  const text = useMaker((s) => s.preview)
  const set = useMaker((s) => s.set)
  const [size, setSize] = useState(56)
  const [dark, setDark] = useState(false)
  const lines = useMemo(() => text.split('\n').map((l) => layoutText(l, glyphs, params)), [text, glyphs, params])
  const lineH = ASC - TOP + 160
  return (
    <div className="flex h-[38%] min-h-[180px] shrink-0 flex-col border-t border-line">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Preview</span>
        <textarea
          value={text}
          onChange={(e) => set({ preview: e.target.value })}
          rows={1}
          className="h-6 min-w-0 flex-1 resize-none border border-line bg-paper px-2 py-[3px] font-mono text-[11px] leading-[16px] outline-none focus:border-ink"
          aria-label="Preview text"
        />
        <input type="range" min={16} max={160} value={size} onChange={(e) => setSize(+e.target.value)} className="w-24" aria-label="Preview size" />
        <span className="w-9 font-mono text-[10px] text-mute">{size}px</span>
        <Btn active={dark} onClick={() => setDark(!dark)}>Dark</Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5" style={{ background: dark ? '#0f0f0f' : 'var(--paper)', color: dark ? '#f2f1ec' : 'var(--ink)' }}>
        {lines.map((l, i) => (
          <svg key={i} viewBox={`0 ${TOP - 80} ${Math.max(l.width, 1)} ${lineH}`} height={(size * lineH) / 1000} width={(size * Math.max(l.width, 1)) / 1000} className="block" aria-label={text.split('\n')[i]}>
            <path d={l.d} fill="currentColor" />
          </svg>
        ))}
      </div>
    </div>
  )
}

function ParamPanel() {
  const p = useMaker((s) => s.params)
  const name = useMaker((s) => s.name)
  const setParams = useMaker((s) => s.setParams)
  const set = useMaker((s) => s.set)
  const [busy, setBusy] = useState(false)

  const fileName = `${(name.trim() || 'Untitled').replace(/[^\w-]+/g, '')}-Regular.otf`
  const make = () => buildFont(name, useMaker.getState().glyphs, useMaker.getState().params)

  const download = async () => {
    try {
      const r = await saveFile(fileName, new Blob([make()], { type: 'font/otf' }))
      S().flash(r === 'declined' ? 'Download cancelled' : `Saved ${fileName}`)
    } catch (e) {
      S().flash(`Couldn't build the font: ${(e as Error).message}`)
    }
  }
  const useInEditor = async () => {
    setBusy(true)
    try {
      const ids = await uploadFontFiles([new File([make()], fileName, { type: 'font/otf' })])
      S().flash(ids.length ? `“${name}” added — Font Browser › Uploaded` : 'Could not add the font')
    } catch (e) {
      S().flash(`Couldn't build the font: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <>
      <Section id="mk-font" title="Font">
        <div className="flex items-center gap-2">
          <span className="w-[70px] shrink-0 text-2xs text-mute">Name</span>
          <input value={name} onChange={(e) => set({ name: e.target.value })} className="h-6 min-w-0 flex-1 border border-line bg-paper px-2 text-2xs outline-none focus:border-ink" aria-label="Font name" />
        </div>
      </Section>
      <Section id="mk-module" title="Module">
        <Seg<ModuleShape>
          value={p.shape}
          onChange={(v) => setParams({ shape: v })}
          options={[{ v: 'circle', label: 'Circle' }, { v: 'square', label: 'Square' }, { v: 'rounded', label: 'Round' }, { v: 'diamond', label: 'Diamond' }]}
        />
        <NumField label="Size" value={p.size} onChange={(v) => setParams({ size: v })} min={10} max={100} suffix="%" tip="Module size inside each cell" />
        <NumField label="Roundness" value={p.roundness} onChange={(v) => setParams({ roundness: v })} min={0} max={50} suffix="%" disabled={p.shape !== 'rounded'} />
      </Section>
      <Section id="mk-structure" title="Structure">
        <Check on={p.connect} onChange={(v) => setParams({ connect: v })} label="Connect neighbours" tip="Bridge cells that touch side-by-side or above/below" />
        <Check on={p.diagonals} onChange={(v) => setParams({ diagonals: v })} label="Connect diagonals" tip="Bridge cells that only touch at a corner" />
        <NumField label="H bridge" value={p.hBridge} onChange={(v) => setParams({ hBridge: v })} min={10} max={100} suffix="%" tip="Thickness of horizontal strokes — lower it for contrast" disabled={!p.connect && !p.diagonals} />
        <NumField label="V bridge" value={p.vBridge} onChange={(v) => setParams({ vBridge: v })} min={10} max={100} suffix="%" tip="Thickness of vertical strokes" disabled={!p.connect && !p.diagonals} />
      </Section>
      <Section id="mk-proportion" title="Proportion">
        <NumField label="Width" value={p.width} onChange={(v) => setParams({ width: v })} min={40} max={220} suffix="%" tip="Cell width relative to its height" />
        <NumField label="Slant" value={p.slant} onChange={(v) => setParams({ slant: v })} min={-25} max={25} suffix="°" />
        <NumField label="Spacing" value={p.spacing} onChange={(v) => setParams({ spacing: v })} min={0} max={3} step={0.1} suffix="c" tip="Letter spacing, in cells" />
      </Section>
      <Section id="mk-export" title="Export">
        <button className="h-7 bg-ink text-2xs font-semibold uppercase tracking-[0.14em] text-paper hover:bg-accent" onClick={download} data-testid="download-otf">
          Download .otf
        </button>
        <Btn onClick={useInEditor} disabled={busy} tip="Install into TYPE LAB's own font list">Use in TYPE LAB editor</Btn>
        <p className="text-[10px] leading-[14px] text-mute">Lowercase keys map to the same capitals. Install the .otf on your Mac to use it in Illustrator or InDesign.</p>
      </Section>
      <Section id="mk-reset" title="Reset" defaultOpen={false}>
        <Btn onClick={() => { if (confirm('Reset every glyph and parameter to the starter set?')) useMaker.getState().resetAll() }}>Reset all glyphs & parameters</Btn>
      </Section>
    </>
  )
}
