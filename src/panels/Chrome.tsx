import { useEffect, useRef, useState } from 'react'
import { useStore, S } from '../store'
import type { ShapeKind, Tool } from '../types'
import { Icon } from '../ui/icons'
import { fitView, zoomBy } from '../canvas/Workspace'
import { generate, GEN_DEFAULT, type GenLevel, type GenOpts } from '../actions'
import { Check, Seg } from '../ui/controls'
import { GridPresets } from './DocPanels'
import { useFonts } from '../fonts/registry'

const TOOLS: { id: Tool | 'grid'; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select / Move', key: 'V' },
  { id: 'type', icon: 'type', label: 'Type', key: 'T' },
  { id: 'rotate', icon: 'rotate', label: 'Rotate', key: 'R' },
  { id: 'scale', icon: 'scale', label: 'Scale', key: 'S' },
  { id: 'warp', icon: 'warp', label: 'Warp / Distort — drag on text', key: 'W' },
  { id: 'path', icon: 'path', label: 'Text on Path — click text or empty canvas', key: 'P' },
  { id: 'shape', icon: 'shape', label: 'Shape', key: 'U' },
  { id: 'grid', icon: 'grid', label: 'Grid — toggle layout grid', key: 'G' },
  { id: 'hand', icon: 'hand', label: 'Hand / Pan (or hold Space)', key: 'H' },
]

export function toolSelect(id: Tool | 'grid') {
  const s = S()
  if (id === 'grid') {
    s.update((d) => { d.grid.show = !d.grid.show })
    s.flash(S().doc.grid.show ? 'Grid on' : 'Grid off')
    return
  }
  s.set({ tool: id, editing: id === 'type' ? s.editing : null })
  if (id === 'warp' || id === 'path') s.set({ tab: 'form', openSection: { ...s.openSection, [id === 'warp' ? 'distort' : 'path']: true } })
}

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const gridOn = useStore((s) => s.doc.grid.show)
  const charMode = useStore((s) => s.charMode)
  const shapeKind = useStore((s) => s.shapeKind)
  const set = useStore((s) => s.set)
  const [shapeMenu, setShapeMenu] = useState(false)
  const [gridMenu, setGridMenu] = useState(false)
  const menuRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!gridMenu && !shapeMenu) return
    const h = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) { setGridMenu(false); setShapeMenu(false) }
    }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [gridMenu, shapeMenu])
  return (
    <nav ref={menuRef} className="relative z-40 flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-panel py-2" aria-label="Tools" data-testid="toolbar">
      {TOOLS.map((t) => {
        const active = t.id === 'grid' ? gridOn : tool === t.id
        return (
          <div key={t.id} className="relative">
            <button
              aria-label={t.label}
              data-tool={t.id}
              data-tip={`${t.label} · ${t.key}`}
              data-tip-side="right"
              onClick={() => (t.id === 'grid' ? setGridMenu(!gridMenu) : t.id === 'shape' && tool === 'shape' ? setShapeMenu(!shapeMenu) : toolSelect(t.id))}
              className={`relative grid h-8 w-8 place-items-center ${active ? 'bg-ink text-paper' : 'text-ink hover:bg-hover'}`}
            >
              <Icon name={t.id === 'shape' ? (shapeKind === 'ellipse' ? 'ellipse' : shapeKind === 'line' ? 'line' : 'shape') : t.icon} size={16} />
              {t.id === 'grid' && gridOn && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 bg-accent" />}
              {t.id === 'shape' && <span className="absolute bottom-0.5 right-0.5 border-b-[3px] border-l-[3px] border-b-current border-l-transparent" />}
            </button>
            {t.id === 'grid' && gridMenu && (
              <div className="absolute left-10 top-0 z-50 flex w-[260px] flex-col gap-2 border border-ink bg-paper p-2.5 shadow-[4px_4px_0_rgba(0,0,0,0.08)]" data-testid="grid-menu">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Grid</span>
                  <Check on={gridOn} onChange={() => toolSelect('grid')} label="Show · G" />
                </div>
                <GridPresets />
                <button className="h-6 border border-line text-2xs hover:border-ink" onClick={() => { const s = S(); s.set({ tab: 'doc', rightOpen: true, openSection: { ...s.openSection, grid: true } }); setGridMenu(false) }}>
                  Grid settings, baseline grid & guides…
                </button>
              </div>
            )}
            {t.id === 'shape' && shapeMenu && (
              <div className="absolute left-10 top-0 z-50 flex flex-col border border-ink bg-paper">
                {(['rect', 'ellipse', 'line'] as ShapeKind[]).map((k) => (
                  <button key={k} className={`flex h-7 items-center gap-2 px-2 text-2xs ${shapeKind === k ? 'bg-ink text-paper' : 'hover:bg-hover'}`} onClick={() => { set({ shapeKind: k, tool: 'shape' }); setShapeMenu(false) }}>
                    <Icon name={k} size={12} /> {k === 'rect' ? 'Rectangle' : k === 'ellipse' ? 'Ellipse' : 'Line'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="my-1.5 h-px w-6 bg-line" />
      <button
        aria-label="Character mode"
        data-tip="Glyph mode — edit letters as objects · C"
        data-tip-side="right"
        onClick={() => set({ charMode: !charMode, tool: 'select', editing: null, tab: 'type', openSection: { ...S().openSection, character: true } })}
        className={`grid h-8 w-8 place-items-center ${charMode ? 'bg-accent text-white' : 'text-ink hover:bg-hover'}`}
      >
        <Icon name="glyph" size={16} />
      </button>
      <button aria-label="Glyphs" data-tip="Glyph viewer — insert characters" data-tip-side="right" onClick={() => set({ showGlyphs: !S().showGlyphs })} className={`grid h-8 w-8 place-items-center font-mono text-[11px] ${useStore.getState().showGlyphs ? 'bg-ink text-paper' : 'text-ink hover:bg-hover'}`}>
        Æ
      </button>
    </nav>
  )
}

export function TopBar() {
  const mode = useStore((s) => s.mode)
  const set = useStore((s) => s.set)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const showGlyphs = useStore((s) => s.showGlyphs)
  const leftOpen = useStore((s) => s.leftOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  return (
    <header className="relative z-40 flex h-11 shrink-0 items-center overflow-visible whitespace-nowrap border-b border-line bg-panel" data-testid="topbar">
      <div className="flex h-full shrink-0 items-center gap-2 border-r border-line pl-2 pr-2 sm:gap-3 sm:pl-3 sm:pr-4">
        <button aria-label="Toggle left panel" data-tip="Layers panel" className="grid h-6 w-6 place-items-center text-mute hover:text-ink xl:hidden" onClick={() => set({ leftOpen: !leftOpen })}><Icon name="panelL" /></button>
        <div className="flex flex-col justify-center leading-none">
          <span className="font-mark text-[15px] font-black tracking-[-0.02em]" style={{ fontVariationSettings: '"wdth" 62, "wght" 900' }}>TYPE LAB</span>
          <span className="mt-0.5 hidden font-mono text-[8.5px] uppercase tracking-[0.12em] text-mute lg:block">Interactive Typography Playground</span>
        </div>
      </div>
      <div className="flex h-full items-center gap-0 px-1 sm:px-2" role="tablist" aria-label="Mode">
        {(['edit', 'make', 'specimen', 'compare'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} data-mode={m} onClick={() => set({ mode: m, editing: null })} className={`relative h-full px-2 text-2xs font-semibold uppercase tracking-[0.14em] sm:px-3 ${mode === m ? 'text-ink' : 'text-mute hover:text-ink'}`}>
            {m === 'edit' ? 'Editor' : m === 'make' ? 'Font Maker' : m}
            {mode === m && <span className="absolute inset-x-2 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      {mode === 'edit' && (
        <div className="flex h-full items-center gap-1 px-2">
          <span className="hidden sm:contents">
            <TBtn tip="Undo · ⌘Z" disabled={!canUndo} onClick={() => S().undo()}><Icon name="undo" /></TBtn>
            <TBtn tip="Redo · ⇧⌘Z" disabled={!canRedo} onClick={() => S().redo()}><Icon name="redo" /></TBtn>
            <div className="mx-1 h-5 w-px bg-line" />
          </span>
          <span className="hidden lg:contents"><TBtn tip="Glyph viewer" active={showGlyphs} onClick={() => set({ showGlyphs: !showGlyphs })}><span className="text-2xs font-semibold uppercase tracking-[0.12em]">Glyphs</span></TBtn></span>
          <Generate />
        </div>
      )}
      <div className="flex h-full items-center gap-1 border-l border-line px-2">
        <span className="hidden sm:contents"><TBtn tip="Keyboard shortcuts · ?" onClick={() => set({ showShortcuts: true })}><Icon name="keyboard" /></TBtn></span>
        <button className="hidden h-7 items-center gap-1.5 bg-ink px-3 text-2xs font-semibold uppercase tracking-[0.12em] text-paper hover:bg-accent md:flex" onClick={() => set({ mode: 'edit', tab: 'doc', rightOpen: true, openSection: { ...S().openSection, export: true } })}>
          <Icon name="export" size={12} /> Export
        </button>
        <button aria-label="Toggle inspector" data-tip="Inspector" className="grid h-6 w-6 place-items-center text-mute hover:text-ink lg:hidden" onClick={() => set({ rightOpen: !rightOpen })}><Icon name="panel" /></button>
      </div>
    </header>
  )
}

function TBtn({ children, tip, onClick, disabled, active }: { children: React.ReactNode; tip: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button aria-label={tip} data-tip={tip} disabled={disabled} onClick={onClick} className={`flex h-7 min-w-7 items-center justify-center px-1.5 disabled:opacity-25 ${active ? 'bg-ink text-paper' : 'text-ink hover:bg-hover'}`}>
      {children}
    </button>
  )
}

function Generate() {
  const [level, setLevel] = useState<GenLevel>('moderate')
  const [opts, setOpts] = useState<GenOpts>(GEN_DEFAULT)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  return (
    <div ref={ref} className="relative flex items-center">
      <button data-testid="generate" className="flex h-7 items-center gap-1.5 border border-ink px-2.5 text-2xs font-semibold tracking-[0.16em] hover:bg-ink hover:text-paper" onClick={() => generate(level, opts)} data-tip={`Randomise the selected text (${level})`}>
        <Icon name="spark" size={12} /> <span className="hidden sm:inline">GENERATE</span>
      </button>
      <button aria-label="Generate settings" className="hidden h-7 w-6 sm:flex items-center justify-center border border-l-0 border-ink text-[10px] hover:bg-ink hover:text-paper" onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <div className="absolute right-0 top-9 z-50 flex w-[250px] flex-col gap-2 border border-ink bg-paper p-3 shadow-[4px_4px_0_rgba(0,0,0,0.08)]">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Range</span>
          <Seg value={level} onChange={setLevel} options={[{ v: 'minimal', label: 'Minimal' }, { v: 'moderate', label: 'Moderate' }, { v: 'experimental', label: 'Experimental' }]} />
          <span className="mt-1 text-2xs font-semibold uppercase tracking-[0.14em]">Randomise</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(GEN_DEFAULT) as (keyof GenOpts)[]).map((k) => (
              <Check key={k} on={opts[k]} onChange={(v) => setOpts({ ...opts, [k]: v })} label={k[0].toUpperCase() + k.slice(1)} />
            ))}
          </div>
          <p className="text-[10px] text-mute">Applies to selected text layers, or all text layers when nothing is selected. Undo with ⌘Z.</p>
          <button className="h-7 bg-ink text-2xs font-semibold tracking-[0.16em] text-paper hover:bg-accent" onClick={() => generate(level, opts)}>GENERATE</button>
        </div>
      )}
    </div>
  )
}

export function StatusBar() {
  const zoom = useStore((s) => s.view.zoom)
  const sel = useStore((s) => s.sel.length)
  const layers = useStore((s) => s.doc.layers.length)
  const tool = useStore((s) => s.tool)
  const editing = useStore((s) => s.editing)
  const charMode = useStore((s) => s.charMode)
  const fonts = useFonts((s) => s.order.length)
  const A = useStore((s) => s.doc.artboard)
  const set = useStore((s) => s.set)
  const mode = useStore((s) => s.mode)
  if (mode !== 'edit')
    return (
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 font-mono text-[10px] text-mute" data-testid="statusbar">
        <span>{mode === 'specimen' ? 'Specimen sheet · generated from the font’s own tables' : mode === 'make' ? 'Font Maker · draw on the grid, shape the modules, export .otf · saved in this browser' : 'Compare 2–4 typefaces · columns or overlay'}</span>
        <span className="ml-auto">{fonts} typefaces</span>
      </footer>
    )
  const hint = editing ? 'Editing text · Esc to finish · select letters to style them' : charMode ? 'Glyph mode · click a letter, drag to move, Shift-click to extend' : tool === 'type' ? 'Click to add text · drag to draw a text box' : tool === 'warp' ? 'Drag on text: ← → bend · ↑ ↓ intensity' : tool === 'rotate' ? 'Drag to rotate · Shift snaps to 15°' : tool === 'scale' ? 'Drag to scale · handles stretch · Shift keeps proportions' : tool === 'path' ? 'Click text to put it on a circle · drag to change radius' : tool === 'shape' ? 'Drag to draw · Shift for square / circle' : 'Double-click text to edit · Space-drag to pan · ⌘-scroll to zoom'
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 font-mono text-[10px] text-mute" data-testid="statusbar">
      <div className="flex items-center">
        <button aria-label="Zoom out" className="grid h-5 w-5 place-items-center hover:bg-hover hover:text-ink" onClick={() => zoomBy(1 / 1.25)}><Icon name="minus" size={11} /></button>
        <button className="w-12 text-center tabular-nums text-ink hover:bg-hover" data-tip="Reset to 100% · ⌘1" onClick={() => { const s = S(); const v = s.view; const f = 1 / v.zoom; zoomBy(f) ; void set }}>{Math.round(zoom * 100)}%</button>
        <button aria-label="Zoom in" className="grid h-5 w-5 place-items-center hover:bg-hover hover:text-ink" onClick={() => zoomBy(1.25)}><Icon name="plus" size={11} /></button>
        <button className="ml-1 px-1.5 hover:bg-hover hover:text-ink" onClick={fitView} data-tip="Fit · ⌘0">Fit</button>
      </div>
      <span className="hidden sm:inline">{Math.round(A.w)} × {Math.round(A.h)}</span>
      <span>{sel ? `${sel} of ${layers} selected` : `${layers} layers`}</span>
      <span className="hidden min-w-0 flex-1 truncate text-center text-ink/70 md:block">{hint}</span>
      <span className="ml-auto hidden lg:inline">{fonts} typefaces · saved in this browser</span>
    </footer>
  )
}
