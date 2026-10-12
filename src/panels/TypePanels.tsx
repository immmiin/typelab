import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, setText, applyCharStyle, clearCharStyles, allPresets, S, ensureTextTarget } from '../store'
import { useFonts, CATEGORY_LABEL, uploadFontFiles, removeUploadedFont, getFont } from '../fonts/registry'
import type { CharStyle, FontCategory, FontInfo, Preset, TextLayer, TextStyle } from '../types'
import { Btn, Check, ColorField, Hint, Label, NumField, Row, Section, Seg, Select, Toggle } from '../ui/controls'
import { usePrimaryText, useUpd } from './hooks'
import { featureSettings, resolveStyle, variationSettings, effectiveWeight } from '../engine/style'
import { defaultEffects, defaultDistort, uid } from '../defaults'
import { Icon } from '../ui/icons'

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black', 1000: 'ExtraBlack' }
export const weightName = (w: number) => WEIGHT_NAMES[Math.round(w / 100) * 100] ?? String(Math.round(w))

export function styleName(font: FontInfo, st: TextStyle): string {
  const w = effectiveWeight(font, st.weight)
  const inst = font.meta.instances.find((i) => Object.entries(i.coords).every(([k, v]) => (k === 'wght' ? Math.abs(v - w) < 1 : Math.abs((st.axes[k] ?? font.meta.axes.find((a) => a.tag === k)?.def ?? v) - v) < 0.6)))
  const base = inst?.name ?? weightName(w)
  return st.italic ? `${base} Italic`.replace('Regular Italic', 'Italic') : base
}

function NoText() {
  return (
    <div className="px-3 py-6">
      <Hint>Select a text layer to edit its typography. Press <kbd className="tl-kbd">T</kbd> and click the artboard to add one.</Hint>
    </div>
  )
}

// ---------------- Presets ----------------
export function PresetsStrip() {
  const l = usePrimaryText()
  const upd = useUpd()
  const userPresets = useStore((s) => s.userPresets)
  const set = useStore((s) => s.set)
  const [naming, setNaming] = useState<string | null>(null)
  const presets = allPresets()
  const apply = (p: Preset) => {
    if (!ensureTextTarget()) return S().flash('Add a text layer first (T)')
    upd.text((t) => {
      Object.assign(t.style, JSON.parse(JSON.stringify(p.style)))
      if (p.effects) t.effects = JSON.parse(JSON.stringify(p.effects))
      if (p.distort) t.distort = JSON.parse(JSON.stringify(p.distort))
      if (p.fill) t.fill = JSON.parse(JSON.stringify(p.fill))
      if (p.stroke) t.stroke = JSON.parse(JSON.stringify(p.stroke))
      t.chars = []
    })
    S().flash(`Preset ${p.name} applied`)
  }
  const save = () => {
    if (!l || !naming?.trim()) return setNaming(null)
    const p: Preset = {
      id: 'u-' + uid(),
      name: naming.trim().toUpperCase().slice(0, 18),
      style: JSON.parse(JSON.stringify(l.style)),
      effects: JSON.parse(JSON.stringify(l.effects)),
      distort: JSON.parse(JSON.stringify(l.distort)),
      fill: JSON.parse(JSON.stringify(l.fill)),
      stroke: JSON.parse(JSON.stringify(l.stroke)),
    }
    set({ userPresets: [...userPresets, p] })
    setNaming(null)
    S().flash(`Saved preset ${p.name}`)
  }
  return (
    <Section id="presets" title="Presets" badge={<span className="font-mono text-[9px] font-normal text-faint">{presets.length}</span>}>
      <div className="grid grid-cols-4 gap-1">
        {presets.map((p) => {
          const f = getFont(p.style.fontId)
          return (
            <div key={p.id} className="group relative">
              <button
                data-testid={`preset-${p.name}`}
                onClick={() => apply(p)}
                className="flex h-[46px] w-full flex-col items-start justify-between border border-line px-1.5 py-1 text-left hover:border-ink disabled:opacity-40"
                data-tip={`${f.name} ${p.style.weight ?? ''}`}
              >
                <span className="text-[17px] leading-none" style={{ fontFamily: `"${f.css}"`, fontWeight: p.style.weight, fontVariationSettings: variationSettings(f, { ...l?.style, ...(p.style as TextStyle), axes: p.style.axes ?? {} } as TextStyle, effectiveWeight(f, p.style.weight ?? 400), undefined, true) || undefined, color: p.fill?.type === 'solid' ? p.fill.color : undefined }}>
                  Aa
                </span>
                <span className="font-mono text-[8.5px] tracking-wider text-mute">{p.name}</span>
              </button>
              {!p.builtin && (
                <button aria-label={`Delete preset ${p.name}`} className="absolute right-0.5 top-0.5 hidden h-3.5 w-3.5 place-items-center bg-ink text-[9px] text-paper group-hover:grid" onClick={() => set({ userPresets: userPresets.filter((x) => x.id !== p.id) })}>
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      {naming === null ? (
        <Btn disabled={!l} onClick={() => setNaming('')} tip="Save the selected layer's font, size, spacing, OpenType, effects and distortion">
          <Icon name="plus" /> Save current style as preset
        </Btn>
      ) : (
        <Row>
          <input autoFocus aria-label="Preset name" placeholder="Preset name" className="h-[24px] min-w-0 flex-1 border border-accent bg-paper px-2 text-2xs outline-none" value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(null) }} />
          <Btn variant="solid" onClick={save}>Save</Btn>
        </Row>
      )}
    </Section>
  )
}

// ---------------- Text ----------------
/** Apply a family (and optionally one of its named styles) to the current text target. */
export function applyFont(id: string, instance?: number) {
  const f = useFonts.getState().fonts[id]
  if (!f) return
  useFonts.getState().touchRecent(id)
  const target = ensureTextTarget()
  if (!target) return S().flash('Add a text layer first (T)')
  const s = S()
  const ids = s.editing ? [s.editing] : s.sel
  s.update((d) => {
    for (const l of d.layers) {
      if (!ids.includes(l.id) || l.type !== 'text') continue
      const t = l as unknown as TextLayer
      t.style.fontId = id
      if (instance !== undefined && f.meta.instances[instance]) {
        const inst = f.meta.instances[instance]
        for (const [tag, val] of Object.entries(inst.coords)) {
          if (tag === 'wght') t.style.weight = val
          else if (tag === 'opsz') t.style.autoOpsz = true
          else t.style.axes[tag] = val
        }
      } else if (instance !== undefined && !f.meta.instances.length) {
        t.style.weight = f.meta.weights[instance] ?? t.style.weight
      } else t.style.weight = effectiveWeight(f, t.style.weight)
    }
  })
}

function styleOptions(f: FontInfo): string[] {
  return f.meta.instances.length ? f.meta.instances.map((i) => i.name) : f.meta.weights.map(weightName)
}

// ---------------- Font list (used by the family picker and the Font Browser section) ----------------
type Filter = 'all' | 'fav' | 'recent' | FontCategory | 'upload'
export function FontList({ onPicked, maxH = 'max-h-[300px]', autoFocus }: { onPicked?: () => void; maxH?: string; autoFocus?: boolean }) {
  const l = usePrimaryText()
  const { fonts, order, favorites, recents, toggleFavorite } = useFonts()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(l?.style.fontId ?? null)
  const sample = l?.text.split('\n')[0].slice(0, 18) || 'Hamburgefonstiv'
  const list = useMemo(() => {
    let ids = filter === 'recent' ? recents.filter((id) => fonts[id]) : order
    if (filter === 'fav') ids = ids.filter((id) => favorites.includes(id))
    else if (filter === 'upload') ids = ids.filter((id) => fonts[id]?.source === 'upload')
    else if (filter !== 'all' && filter !== 'recent') ids = ids.filter((id) => fonts[id]?.category === filter)
    if (q.trim()) ids = ids.filter((id) => (fonts[id].name + ' ' + fonts[id].category + ' ' + fonts[id].meta.axes.map((a) => a.tag).join(' ')).toLowerCase().includes(q.toLowerCase()))
    return ids
  }, [q, filter, fonts, order, favorites, recents])
  const chips: { v: Filter; label: string }[] = [
    { v: 'all', label: 'All' }, { v: 'fav', label: '★' }, { v: 'recent', label: 'Recent' }, { v: 'sans', label: 'Sans' }, { v: 'serif', label: 'Serif' },
    { v: 'display', label: 'Display' }, { v: 'mono', label: 'Mono' }, { v: 'handwriting', label: 'Hand' }, { v: 'experimental', label: 'Exp.' }, { v: 'upload', label: 'Uploaded' },
  ]
  const curStyle = l ? styleName(getFont(l.style.fontId), l.style).replace(/ Italic$/, '') : ''
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const error = useFonts((x) => x.error)
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const ids = await uploadFontFiles(files)
    setBusy(false)
    if (ids.length) {
      setFilter('upload')
      setOpen(ids[0])
      applyFont(ids[0])
      S().flash(`Added ${ids.length} font${ids.length > 1 ? 's' : ''}`)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus={autoFocus}
        aria-label="Search fonts"
        placeholder="Search fonts, categories, axes…"
        className="h-[26px] w-full border border-line bg-paper px-2 text-2xs outline-none focus:border-accent"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && list[0]) { applyFont(list[0]); onPicked?.() }
          if (e.key === 'Escape') onPicked?.()
        }}
      />
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <button key={c.v} onClick={() => setFilter(c.v)} className={`h-[18px] border px-1.5 text-[9.5px] ${filter === c.v ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:border-ink'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className={`tl-scroll ${maxH} overflow-y-auto border border-line bg-paper`} data-testid="font-list">
        {list.length === 0 && <div className="p-3 text-2xs text-mute">{filter === 'upload' ? 'No uploaded fonts yet.' : filter === 'fav' ? 'Star fonts to collect them here.' : filter === 'recent' ? 'Fonts you apply show up here.' : 'No fonts match.'}</div>}
        {list.map((id) => {
          const f = fonts[id]
          const active = l?.style.fontId === id
          const styles = styleOptions(f)
          const expanded = open === id
          return (
            <div key={id} className={`border-b border-hair last:border-b-0 ${active ? 'bg-ink text-paper' : ''}`}>
              <div className={`group flex items-center gap-1.5 px-2 py-1.5 ${active ? '' : 'hover:bg-hover'}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => { applyFont(id); setOpen(id); onPicked?.() }} data-testid={`font-${id}`}>
                  <div className="truncate text-[17px] leading-tight" style={{ fontFamily: `"${f.css}"` }}>{f.name}</div>
                  <div className={`flex gap-1.5 font-mono text-[8.5px] uppercase tracking-wider ${active ? 'text-paper/70' : 'text-mute'}`}>
                    <span>{CATEGORY_LABEL[f.category]}</span>
                    {f.meta.axes.length > 0 && <span className={active ? '' : 'text-accent'}>VAR · {f.meta.axes.length} axes</span>}
                    {f.source === 'upload' && <span>· uploaded</span>}
                  </div>
                  <div className={`truncate text-[11px] ${active ? 'text-paper/80' : 'text-mute'}`} style={{ fontFamily: `"${f.css}"` }}>{sample}</div>
                </button>
                <button aria-label={`Favourite ${f.name}`} className={`text-xs ${favorites.includes(id) ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100'}`} onClick={() => toggleFavorite(id)}>★</button>
                {f.source === 'upload' && <button aria-label={`Remove ${f.name}`} className="text-xs text-faint opacity-0 hover:text-ink group-hover:opacity-100" onClick={() => removeUploadedFont(id)}>×</button>}
                <button
                  aria-label={`${expanded ? 'Hide' : 'Show'} styles of ${f.name}`}
                  data-tip={`${styles.length} style${styles.length > 1 ? 's' : ''}`}
                  onClick={() => setOpen(expanded ? null : id)}
                  className={`flex h-6 shrink-0 items-center gap-1 px-1 font-mono text-[9px] ${active ? 'text-paper/80 hover:text-paper' : 'text-mute hover:text-ink'}`}
                >
                  {styles.length}
                  <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
                </button>
              </div>
              {expanded && (
                <div className="flex flex-wrap gap-1 px-2 pb-2" data-testid={`styles-${id}`}>
                  {styles.map((name, k) => {
                    const inst = f.meta.instances[k]
                    const on = active && curStyle === name
                    return (
                      <button
                        key={name + k}
                        onClick={() => { applyFont(id, k); onPicked?.() }}
                        className={`h-[22px] border px-1.5 text-[11px] ${on ? 'border-accent bg-accent text-white' : active ? 'border-paper/30 hover:border-paper' : 'border-line bg-paper hover:border-ink'}`}
                        style={{ fontFamily: `"${f.css}"`, fontVariationSettings: inst ? Object.entries(inst.coords).map(([t, v]) => `"${t}" ${v}`).join(', ') : undefined, fontWeight: inst ? inst.coords.wght : f.meta.weights[k] }}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" multiple className="hidden" data-testid="font-upload" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      <Btn onClick={() => fileRef.current?.click()} tip="TTF, OTF, WOFF, WOFF2 — kept in this browser only">
        <Icon name="upload" /> {busy ? 'Reading font…' : 'Upload font file'}
      </Btn>
      {error && <p className="text-[10px] text-[#d0021b]">{error}</p>}
    </div>
  )
}

/** Family field: shows the current family in its own face and opens the font picker. */
function FamilyField({ font }: { font: FontInfo }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        data-testid="family-field"
        onClick={() => setOpen(!open)}
        className={`flex h-[38px] w-full items-center gap-2 border px-2 text-left ${open ? 'border-accent' : 'border-ink hover:border-accent'}`}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate text-[19px] leading-none" style={{ fontFamily: `"${font.css}"` }}>{font.name}</span>
        <span className="font-mono text-[8.5px] uppercase tracking-wider text-mute">{font.meta.axes.length ? 'VAR' : CATEGORY_LABEL[font.category]}</span>
        <span className={`text-[10px] text-mute transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[42px] z-50 border border-ink bg-panel p-2 shadow-[6px_6px_0_rgba(0,0,0,0.08)]" data-testid="font-picker">
          <FontList onPicked={() => setOpen(false)} maxH="max-h-[380px]" autoFocus />
          <p className="mt-1.5 text-[10px] text-mute">Click a family to apply · › shows its styles · Enter picks the first result</p>
        </div>
      )}
    </div>
  )
}

export function TextSection() {
  const l = usePrimaryText()
  const upd = useUpd()
  const hasText = useStore((s) => s.doc.layers.some((x) => x.type === 'text'))
  if (!l)
    return (
      <Section id="text" title="Typography">
        <Hint>No text layer selected.</Hint>
        <div className="grid grid-cols-2 gap-1">
          <Btn disabled={!hasText} onClick={() => ensureTextTarget()}>Select text</Btn>
          <Btn onClick={() => S().set({ tool: 'type' })}>Type tool (T)</Btn>
        </div>
      </Section>
    )
  const st = l.style
  const font = getFont(st.fontId)
  const wAx = font.meta.axes.find((a) => a.tag === 'wght')
  const statics = font.meta.weights
  const names = styleOptions(font)
  const curStyle = styleName(font, st)
  const curIdx = names.indexOf(curStyle.replace(/ Italic$/, ''))
  return (
    <Section id="text" title="Typography">
      <FamilyField font={font} />
      <Row>
        <Select
          ariaLabel="Font style"
          className="flex-1"
          value={String(curIdx)}
          options={[...(curIdx < 0 ? [{ v: '-1', label: `${curStyle} (custom)` }] : []), ...names.map((n, k) => ({ v: String(k), label: n }))]}
          onChange={(v) => Number(v) >= 0 && applyFont(font.id, Number(v))}
        />
        <Toggle on={st.italic} onChange={(v) => upd.text((t) => { t.style.italic = v })} tip={font.meta.axes.some((a) => a.tag === 'ital' || a.tag === 'slnt') ? 'Italic (uses the font’s slant axis)' : 'Italic (synthesised oblique — no italic in this font)'}>
          <i className="font-serif">I</i>
        </Toggle>
      </Row>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <NumField compact label="Size" suffix="pt" value={st.size} min={1} max={2000} smin={4} smax={400} onChange={(v) => upd.text((t) => { t.style.size = v }, 'size')} />
        <NumField compact label="Weight" value={effectiveWeight(font, st.weight)} min={wAx?.min ?? Math.min(...statics)} max={wAx?.max ?? Math.max(...statics)} step={wAx ? 1 : 100} disabled={!wAx && statics.length < 2} tip={wAx ? `wght ${wAx.min}–${wAx.max}` : `Static weights: ${statics.join(', ')}`}
          onChange={(v) => upd.text((t) => { t.style.weight = wAx ? v : effectiveWeight(font, v) }, 'weight')} />
        <NumField compact label="Leading" value={st.lineHeight} min={0.3} max={4} smin={0.5} smax={2.5} step={0.01} tip={`Line height × size = ${Math.round(st.lineHeight * st.size)} pt`} onChange={(v) => upd.text((t) => { t.style.lineHeight = v }, 'leading')} />
        <NumField compact label="Tracking" value={st.tracking} min={-500} max={2000} smin={-200} smax={600} tip="1/1000 em, as in InDesign" onChange={(v) => upd.text((t) => { t.style.tracking = v }, 'tracking')} />
        <NumField compact label="Word space" value={st.wordSpacing} min={-500} max={2000} smin={-250} smax={1000} step={5} tip="Extra word spacing, 1/1000 em" onChange={(v) => upd.text((t) => { t.style.wordSpacing = v }, 'wordsp')} />
        <NumField compact label="Para space" suffix="pt" value={st.paragraphSpacing} min={0} max={1000} smax={300} tip="Space after each paragraph (line breaks)" onChange={(v) => upd.text((t) => { t.style.paragraphSpacing = v }, 'parasp')} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1">
        <Seg value={st.align} onChange={(v) => upd.text((t) => { t.style.align = v; if (v === 'justify' && t.autoWidth) S().flash('Justify needs a fixed width — drag a side handle') })} options={[
          { v: 'left', label: <Icon name="alignL" />, tip: 'Align left' },
          { v: 'center', label: <Icon name="alignC" />, tip: 'Align centre' },
          { v: 'right', label: <Icon name="alignR" />, tip: 'Align right' },
          { v: 'justify', label: <Icon name="alignJ" />, tip: 'Justify (fixed-width box)' },
        ]} />
        <Seg full={false} value={st.vAlign} onChange={(v) => upd.text((t) => { t.style.vAlign = v; if (!t.fixedHeight) { t.fixedHeight = true; t.h = Math.round(t.style.size * t.style.lineHeight * 4) } })} options={[
          { v: 'top', label: <Icon name="vTop" />, tip: 'Vertical align: top (fixed-height box)' },
          { v: 'middle', label: <Icon name="vMid" />, tip: 'Vertical align: middle' },
          { v: 'bottom', label: <Icon name="vBot" />, tip: 'Vertical align: bottom' },
        ]} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1">
        <Seg value={st.textCase} onChange={(v) => upd.text((t) => { t.style.textCase = v })} options={[
          { v: 'none', label: '—', tip: 'Case as typed' },
          { v: 'upper', label: 'AB', tip: 'Uppercase' },
          { v: 'lower', label: 'ab', tip: 'Lowercase' },
          { v: 'title', label: 'Ab', tip: 'Capitalize' },
        ]} />
        <Toggle on={st.smallCaps} onChange={(v) => upd.text((t) => { t.style.smallCaps = v })} tip={font.meta.features.includes('smcp') ? 'Small caps (font’s smcp)' : 'Small caps (synthesised)'}>
          <span className="text-[10px]">Sᴄ</span>
        </Toggle>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Toggle on={st.script === 'sup'} onChange={(v) => upd.text((t) => { t.style.script = v ? 'sup' : 'none' })} tip="Superscript">x²</Toggle>
        <Toggle on={st.script === 'sub'} onChange={(v) => upd.text((t) => { t.style.script = v ? 'sub' : 'none' })} tip="Subscript">x₂</Toggle>
        <Toggle on={st.underline} onChange={(v) => upd.text((t) => { t.style.underline = v })} tip="Underline (uses the font’s underline metrics)"><span className="underline">U</span></Toggle>
        <Toggle on={st.strike} onChange={(v) => upd.text((t) => { t.style.strike = v })} tip="Strikethrough"><span className="line-through">S</span></Toggle>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Seg value={st.direction} onChange={(v) => upd.text((t) => { t.style.direction = v })} options={[{ v: 'horizontal', label: 'Horizontal', tip: 'Text direction' }, { v: 'vertical', label: 'Vertical', tip: 'Stacked vertical text' }]} />
        <Seg value={l.autoWidth ? 'auto' : 'fixed'} onChange={(v) => upd.text((t) => { if (v === 'fixed' && t.autoWidth) t.w = Math.max(100, t.w); t.autoWidth = v === 'auto'; if (v === 'auto') t.fixedHeight = false })} options={[{ v: 'auto', label: 'Auto W', tip: 'Box grows with the text' }, { v: 'fixed', label: 'Wrap', tip: 'Fixed width — lines wrap' }]} />
      </div>
      <details className="group">
        <summary className="cursor-default list-none text-2xs text-mute hover:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> Text content
        </summary>
        <textarea
          aria-label="Text content"
          data-testid="text-content"
          className="mt-1 min-h-[56px] w-full resize-y border border-line bg-paper p-2 text-xs leading-snug text-ink outline-none focus:border-accent"
          style={{ fontFamily: `"${font.css}"` }}
          value={l.text}
          onChange={(e) => setText(l.id, e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </details>
    </Section>
  )
}

// ---------------- Font browser ----------------
export function FontSection() {
  const { order } = useFonts()
  return (
    <Section id="font" title="Font Browser" defaultOpen={false} badge={<span className="font-mono text-[9px] font-normal text-faint">{order.length}</span>}>
      <FontList />
      <Hint>Drop font files anywhere on the window to add them. Uploaded fonts stay in this browser.</Hint>
    </Section>
  )
}

// ---------------- Variable ----------------
export function VariableSection() {
  const l = usePrimaryText()
  const upd = useUpd()
  if (!l) return null
  const font = getFont(l.style.fontId)
  const axes = font.meta.axes
  const st = l.style
  const vs = variationSettings(font, st, effectiveWeight(font, st.weight))
  const randomize = () =>
    upd.text((t) => {
      for (const a of axes) {
        const v = a.min + Math.random() * (a.max - a.min)
        if (a.tag === 'wght') t.style.weight = Math.round(v)
        else if (a.tag === 'ital' || a.tag === 'WONK') t.style.axes[a.tag] = Math.round(Math.random())
        else t.style.axes[a.tag] = Math.round(v * 10) / 10
        if (a.tag === 'opsz') t.style.autoOpsz = false
      }
    })
  return (
    <Section id="variable" title="Variable Axes" badge={axes.length ? <span className="bg-accent px-1 font-mono text-[8.5px] font-normal text-white">{axes.length}</span> : null}
      right={axes.length ? <Btn variant="ghost" onClick={randomize} tip="Random value on every axis"><Icon name="dice" /> Randomize</Btn> : undefined}>
      {!axes.length && <Hint>{font.name} is a static font, so it has no variation axes. Try Roboto Flex, Fraunces, Archivo, Climate Crisis or Tilt Warp.</Hint>}
      {axes.map((a) => {
        const isW = a.tag === 'wght'
        const isOpsz = a.tag === 'opsz'
        const val = isW ? effectiveWeight(font, st.weight) : isOpsz && st.autoOpsz ? Math.min(a.max, Math.max(a.min, st.size)) : (st.axes[a.tag] ?? a.def)
        return (
          <div key={a.tag} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-2xs text-ink">{a.name}</span>
              <span className="font-mono text-[9px] text-mute">
                "{a.tag}" {a.min}–{a.max}
                {isOpsz && (
                  <button className={`ml-2 border px-1 ${st.autoOpsz ? 'border-accent text-accent' : 'border-line'}`} onClick={() => upd.text((t) => { t.style.autoOpsz = !t.style.autoOpsz; if (t.style.autoOpsz) delete t.style.axes.opsz; else t.style.axes.opsz = Math.min(a.max, Math.max(a.min, t.style.size)) })} data-tip="Auto: optical size follows the font size">
                    AUTO
                  </button>
                )}
              </span>
            </div>
            <NumField label={a.tag} value={Math.round(val * 100) / 100} min={a.min} max={a.max} step={a.max - a.min <= 2 ? 0.01 : a.max - a.min <= 20 ? 0.1 : 1} disabled={isOpsz && st.autoOpsz}
              onChange={(v) => upd.text((t) => { if (isW) t.style.weight = v; else t.style.axes[a.tag] = v; if (isOpsz) t.style.autoOpsz = false }, 'axis-' + a.tag)} />
          </div>
        )
      })}
      {font.meta.instances.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {font.meta.instances.slice(0, 20).map((i) => (
            <button key={i.name} className="h-[18px] border border-line px-1.5 text-[9.5px] hover:border-ink" onClick={() => upd.text((t) => { for (const [k, v] of Object.entries(i.coords)) k === 'wght' ? (t.style.weight = v) : (t.style.axes[k] = v) })}>
              {i.name}
            </button>
          ))}
        </div>
      )}
      {axes.length > 0 && (
        <>
          <code className="block break-all bg-hover p-2 font-mono text-[9.5px] leading-relaxed text-ink" data-testid="fvs">
            font-variation-settings: {vs || 'normal'};
          </code>
          <Btn onClick={() => upd.text((t) => { t.style.axes = {}; t.style.autoOpsz = true; const w = axes.find((a) => a.tag === 'wght'); if (w) t.style.weight = w.def })}>Reset axes to defaults</Btn>
        </>
      )}
    </Section>
  )
}

// ---------------- OpenType ----------------
const OT_GROUPS: { title: string; items: { tag: string; label: string; excl?: string }[] }[] = [
  { title: 'Ligatures', items: [{ tag: 'liga', label: 'Standard' }, { tag: 'dlig', label: 'Discretionary' }, { tag: 'hlig', label: 'Historical' }, { tag: 'calt', label: 'Contextual alt.' }] },
  { title: 'Alternates', items: [{ tag: 'salt', label: 'Stylistic alt.' }, { tag: 'swsh', label: 'Swashes' }, { tag: 'hist', label: 'Historical forms' }] },
  { title: 'Numerals', items: [{ tag: 'lnum', label: 'Lining', excl: 'onum' }, { tag: 'onum', label: 'Oldstyle', excl: 'lnum' }, { tag: 'pnum', label: 'Proportional', excl: 'tnum' }, { tag: 'tnum', label: 'Tabular', excl: 'pnum' }, { tag: 'frac', label: 'Fractions' }, { tag: 'ordn', label: 'Ordinals' }, { tag: 'zero', label: 'Slashed zero' }, { tag: 'sups', label: 'Superiors' }] },
  { title: 'Capitals & spacing', items: [{ tag: 'smcp', label: 'Small caps' }, { tag: 'c2sc', label: 'Caps → small caps' }, { tag: 'pcap', label: 'Petite caps' }, { tag: 'case', label: 'Case-sensitive' }, { tag: 'cpsp', label: 'Capital spacing' }, { tag: 'kern', label: 'Kerning' }] },
]
const DEFAULT_ON = ['liga', 'calt', 'kern']

export function OpenTypeSection() {
  const l = usePrimaryText()
  const upd = useUpd()
  if (!l) return null
  const font = getFont(l.style.fontId)
  const has = new Set(font.meta.features)
  const st = l.style
  const isOn = (tag: string) => st.features[tag] ?? DEFAULT_ON.includes(tag)
  const setF = (tag: string, on: boolean, excl?: string) =>
    upd.text((t) => {
      t.style.features[tag] = on
      if (on && excl) t.style.features[excl] = false
    })
  const ss = Array.from({ length: 20 }, (_, i) => `ss${String(i + 1).padStart(2, '0')}`)
  const cv = Array.from({ length: 20 }, (_, i) => `cv${String(i + 1).padStart(2, '0')}`).filter((t) => has.has(t))
  const shown = [...OT_GROUPS.flatMap((g) => g.items.map((i) => i.tag)), ...ss, ...cv]
  const avail = shown.filter((t) => has.has(t)).length
  const ff = featureSettings(st)
  return (
    <Section id="opentype" title="OpenType" badge={<span className="font-mono text-[9px] font-normal text-faint">{avail} in font</span>}>
      {OT_GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">{g.title}</span>
          <div className="grid grid-cols-2 gap-1">
            {g.items.map((it) => {
              const supported = has.has(it.tag)
              return (
                <Toggle key={it.tag} className="justify-between" on={isOn(it.tag) && supported} disabled={!supported} onChange={(v) => setF(it.tag, v, it.excl)} tip={supported ? `"${it.tag}"` : `"${it.tag}" is not in ${font.name}`}>
                  <span>{it.label}</span>
                  <span className="font-mono text-[8.5px] opacity-60">{it.tag}</span>
                </Toggle>
              )
            })}
          </div>
        </div>
      ))}
      <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Stylistic sets</span>
      <div className="grid grid-cols-5 gap-1">
        {ss.map((t) => (
          <Toggle key={t} on={!!st.features[t] && has.has(t)} disabled={!has.has(t)} onChange={(v) => setF(t, v)} tip={has.has(t) ? `Stylistic set ${t}` : `${t} not in ${font.name}`}>
            <span className="font-mono text-[9px]">{t.toUpperCase()}</span>
          </Toggle>
        ))}
      </div>
      {cv.length > 0 && (
        <>
          <span className="font-mono text-[9px] uppercase tracking-wider text-faint">Character variants</span>
          <div className="grid grid-cols-5 gap-1">
            {cv.map((t) => (
              <Toggle key={t} on={!!st.features[t]} onChange={(v) => setF(t, v)} tip={`Character variant ${t}`}>
                <span className="font-mono text-[9px]">{t.toUpperCase()}</span>
              </Toggle>
            ))}
          </div>
        </>
      )}
      <code className="block break-all bg-hover p-2 font-mono text-[9.5px] text-ink" data-testid="ffs">font-feature-settings: {ff || 'normal'};</code>
      <Hint>Greyed-out features are not present in {font.name}. The font reports: {font.meta.features.filter((f) => !['ccmp', 'locl', 'mark', 'mkmk', 'rvrn', 'aalt', 'rlig'].includes(f)).join(' ') || 'none'}.</Hint>
    </Section>
  )
}

// ---------------- Character ----------------
export function CharacterSection() {
  const l = usePrimaryText()
  const textSel = useStore((s) => s.textSel)
  const charMode = useStore((s) => s.charMode)
  const editing = useStore((s) => s.editing)
  const set = useStore((s) => s.set)
  const { fonts, order } = useFonts()
  if (!l) return null
  const a = Math.min(...textSel), b = Math.max(...textSel)
  const has = (editing === l.id || charMode) && b > a && b <= l.text.length
  const first: CharStyle = (has && l.chars[a]) || {}
  const rs = resolveStyle(l, has ? l.chars[a] : null)
  const font = rs.font
  const wd = font.meta.axes.find((x) => x.tag === 'wdth')
  const wAx = font.meta.axes.find((x) => x.tag === 'wght')
  const ap = (patch: Partial<CharStyle>, key?: string) => has && applyCharStyle(l.id, [a, b], patch, key)
  const styled = l.chars.filter(Boolean).length
  return (
    <Section id="character" title="Character" badge={styled ? <span className="font-mono text-[9px] font-normal text-accent">{styled} styled</span> : null}
      right={<Toggle on={charMode} onChange={(v) => set({ charMode: v, tool: 'select', editing: null, textSel: v ? [0, 0] : textSel })} tip="Character Mode: glyphs become objects you can click, drag and style (C)"><Icon name="glyph" /> Glyph mode</Toggle>}>
      {!has ? (
        <Hint>
          {charMode ? 'Click a glyph on the canvas (Shift-click to extend). Drag glyphs to move them.' : 'Double-click text on the canvas and select letters, or switch on Glyph mode to pick glyphs as objects.'} Styles below apply to the selected characters only.
        </Hint>
      ) : (
        <div className="flex items-center justify-between bg-hover px-2 py-1">
          <span className="truncate text-xs" style={{ fontFamily: `"${font.css}"` }}>“{l.text.slice(a, b).replace(/\n/g, '↵').slice(0, 24)}”</span>
          <span className="font-mono text-[9px] text-mute">{b - a} char{b - a > 1 ? 's' : ''} · {a}–{b}</span>
        </div>
      )}
      <div className={has ? 'flex flex-col gap-1.5' : 'pointer-events-none flex flex-col gap-1.5 opacity-40'}>
        <Row>
          <Label>Font</Label>
          <Select ariaLabel="Character font" className="flex-1" value={first.fontId ?? ''} options={[{ v: '', label: `Layer (${getFont(l.style.fontId).name})` }, ...order.map((id) => ({ v: id, label: fonts[id].name }))]} onChange={(v) => ap({ fontId: v || undefined })} />
        </Row>
        <NumField label="Size" suffix="pt" value={first.size ?? l.style.size} min={1} max={2000} smin={4} smax={400} onChange={(v) => ap({ size: v }, 'c-size')} />
        <NumField label="Weight" value={first.weight ?? rs.weight} min={wAx?.min ?? 100} max={wAx?.max ?? 900} disabled={!wAx} tip={wAx ? '' : 'Static font — use a variable font for per-glyph weight'} onChange={(v) => ap({ weight: v }, 'c-weight')} />
        <NumField label="Width" value={first.width ?? l.style.axes.wdth ?? wd?.def ?? 100} min={wd?.min ?? 50} max={wd?.max ?? 200} disabled={!wd} tip={wd ? `wdth ${wd.min}–${wd.max}` : 'This font has no width axis — use Scale X'} onChange={(v) => ap({ width: v }, 'c-width')} />
        <NumField label="Tracking" value={first.tracking ?? l.style.tracking} min={-500} max={2000} smin={-200} smax={600} onChange={(v) => ap({ tracking: v }, 'c-track')} />
        <NumField label="Baseline" suffix="pt" value={first.baseline ?? 0} min={-1000} max={1000} smin={-100} smax={100} onChange={(v) => ap({ baseline: v }, 'c-base')} />
        <NumField label="Rotation" suffix="°" value={first.rotate ?? 0} min={-180} max={180} onChange={(v) => ap({ rotate: v }, 'c-rot')} />
        <NumField label="Scale X" suffix="%" value={Math.round((first.scaleX ?? 1) * 100)} min={5} max={500} smin={10} smax={300} onChange={(v) => ap({ scaleX: v / 100 }, 'c-sx')} />
        <NumField label="Scale Y" suffix="%" value={Math.round((first.scaleY ?? 1) * 100)} min={5} max={500} smin={10} smax={300} onChange={(v) => ap({ scaleY: v / 100 }, 'c-sy')} />
        <ColorField label="Colour" value={first.color ?? (l.fill.type === 'solid' ? l.fill.color : '#111111')} onChange={(c) => ap({ color: c }, 'c-color')} />
        <NumField label="Opacity" suffix="%" value={Math.round((first.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => ap({ opacity: v / 100 }, 'c-op')} />
        <div className="grid grid-cols-4 gap-1">
          <Toggle on={first.script === 'sup'} onChange={(v) => ap({ script: v ? 'sup' : undefined })} tip="Superscript">x²</Toggle>
          <Toggle on={first.script === 'sub'} onChange={(v) => ap({ script: v ? 'sub' : undefined })} tip="Subscript">x₂</Toggle>
          <Toggle on={!!first.underline} onChange={(v) => ap({ underline: v || undefined })} tip="Underline"><span className="underline">U</span></Toggle>
          <Toggle on={!!first.strike} onChange={(v) => ap({ strike: v || undefined })} tip="Strikethrough"><span className="line-through">S</span></Toggle>
        </div>
        <Btn onClick={() => clearCharStyles(l.id, [a, b])}>Clear selection styles</Btn>
      </div>
      <Btn onClick={() => set({ textSel: [0, l.text.length], charMode: editing === l.id ? charMode : true })} tip="Select every character of this layer">Select all characters</Btn>
      {styled > 0 && <Btn variant="ghost" onClick={() => clearCharStyles(l.id)}>Clear all character styles ({styled})</Btn>}
      {l.path.enabled && <Hint>Glyph moves, rotation and scale are not applied while the text follows a path.</Hint>}
    </Section>
  )
}

export function useFontsCheck() {
  return Check
}
