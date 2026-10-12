import { useMemo, useState } from 'react'
import { useFonts, CATEGORY_LABEL, getFont } from '../fonts/registry'
import type { FontInfo } from '../types'
import { Btn, NumField, Seg } from '../ui/controls'
import { effectiveWeight } from '../engine/style'

const COLORS = ['#111111', '#2b2bff', '#ff3b1f', '#00a86b']

function vs(f: FontInfo, weight: number) {
  return f.meta.axes.map((a) => `"${a.tag}" ${a.tag === 'wght' ? Math.min(a.max, Math.max(a.min, weight)) : a.def}`).join(', ') || undefined
}

function avgWidth(f: FontInfo, weight: number) {
  const c = document.createElement('canvas').getContext('2d')!
  c.font = `${effectiveWeight(f, weight)} 100px "${f.css}"`
  const s = 'abcdefghijklmnopqrstuvwxyz'
  return c.measureText(s).width / s.length / 100
}

export function CompareView() {
  const { fonts, order } = useFonts()
  const [ids, setIds] = useState<string[]>(['inter', 'archivo', 'fraunces'])
  const [text, setText] = useState('Hamburgefonstiv\nThe quick brown fox jumps over the lazy dog.')
  const [size, setSize] = useState(64)
  const [tracking, setTracking] = useState(0)
  const [leading, setLeading] = useState(1.1)
  const [weight, setWeight] = useState(500)
  const [view, setView] = useState<'columns' | 'overlay'>('columns')
  const [opacity, setOpacity] = useState(55)
  const [overlayWord, setOverlayWord] = useState('Rhxag')
  const list = ids.map((id) => getFont(id))
  const metrics = useMemo(
    () => list.map((f) => ({ xh: f.meta.xH / f.meta.upm, ch: f.meta.capH / f.meta.upm, asc: f.meta.asc / f.meta.upm, desc: -f.meta.desc / f.meta.upm, w: avgWidth(f, weight) })),
    [ids.join(), weight, fonts],
  )
  const maxW = Math.max(...metrics.map((m) => m.w))
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="compare">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Compare</span>
        {ids.map((id, i) => (
          <div key={i} className="flex items-center">
            <span className="h-7 w-1.5" style={{ background: COLORS[i] }} />
            <select aria-label={`Font ${i + 1}`} className="h-7 border border-l-0 border-line bg-paper px-1.5 text-xs" value={id} onChange={(e) => setIds(ids.map((x, k) => (k === i ? e.target.value : x)))}>
              {order.map((o) => <option key={o} value={o}>{fonts[o].name}</option>)}
            </select>
            {ids.length > 2 && <button aria-label="Remove font" className="h-7 border border-l-0 border-line px-1.5 text-xs hover:bg-hover" onClick={() => setIds(ids.filter((_, k) => k !== i))}>×</button>}
          </div>
        ))}
        {ids.length < 4 && <Btn onClick={() => setIds([...ids, order.find((o) => !ids.includes(o)) ?? 'inter'])}>+ Add font</Btn>}
        <div className="ml-auto w-[220px]"><Seg value={view} onChange={setView} options={[{ v: 'columns', label: 'Columns' }, { v: 'overlay', label: 'Overlay' }]} /></div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="tl-scroll w-[260px] shrink-0 overflow-y-auto border-r border-line bg-panel p-3">
          <div className="flex flex-col gap-2">
            {view === 'columns' ? (
              <textarea aria-label="Sample text" className="h-24 w-full resize-y border border-line bg-paper p-2 text-xs outline-none focus:border-accent" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            ) : (
              <input aria-label="Overlay word" className="h-7 w-full border border-line bg-paper px-2 text-xs outline-none focus:border-accent" value={overlayWord} onChange={(e) => setOverlayWord(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            )}
            <NumField label="Size" suffix="pt" value={size} min={8} max={400} smax={200} onChange={setSize} />
            <NumField label="Weight" value={weight} min={100} max={1000} step={10} onChange={setWeight} tip="Clamped to each font’s range" />
            <NumField label="Tracking" value={tracking} min={-200} max={600} onChange={setTracking} />
            <NumField label="Leading" value={leading} min={0.6} max={2.5} step={0.01} onChange={setLeading} />
            {view === 'overlay' && <NumField label="Opacity" suffix="%" value={opacity} min={5} max={100} onChange={setOpacity} />}
          </div>
          <table className="mt-4 w-full border-collapse font-mono text-[10px]">
            <thead>
              <tr className="border-b border-ink text-left text-mute">
                <th className="py-1 font-normal">Metric</th>
                {list.map((f, i) => <th key={i} className="py-1 text-right font-normal" style={{ color: COLORS[i] }}>{i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ['x-height', (i: number) => `${(metrics[i].xh * 100).toFixed(1)}`],
                ['cap height', (i: number) => `${(metrics[i].ch * 100).toFixed(1)}`],
                ['x / cap', (i: number) => `${((metrics[i].xh / metrics[i].ch) * 100).toFixed(0)}%`],
                ['avg width', (i: number) => `${(metrics[i].w * 100).toFixed(1)}`],
                ['ascender', (i: number) => `${(metrics[i].asc * 100).toFixed(0)}`],
                ['descender', (i: number) => `${(metrics[i].desc * 100).toFixed(0)}`],
                ['weight', (i: number) => `${effectiveWeight(list[i], weight)}`],
                ['axes', (i: number) => `${list[i].meta.axes.length}`],
                ['glyphs', (i: number) => `${list[i].meta.glyphs}`],
              ].map(([k, fn]) => (
                <tr key={k as string} className="border-b border-hair">
                  <td className="py-1 text-mute">{k as string}</td>
                  {list.map((_, i) => <td key={i} className="py-1 text-right tabular-nums">{(fn as (i: number) => string)(i)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[9.5px] leading-snug text-mute">Heights and widths in % of the em. Average width is measured from a–z at the chosen weight.</p>
        </div>
        <div className="tl-scroll min-h-0 flex-1 overflow-auto bg-paper">
          {view === 'columns' ? (
            <div className="grid min-h-full" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(240px, 1fr))` }}>
              {list.map((f, i) => (
                <div key={i} className="flex min-w-0 flex-col border-r border-line p-6 last:border-r-0">
                  <div className="mb-4 flex items-baseline justify-between border-b pb-2" style={{ borderColor: COLORS[i] }}>
                    <span className="text-sm font-semibold">{f.name}</span>
                    <span className="font-mono text-[9.5px] uppercase text-mute">{CATEGORY_LABEL[f.category]}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words" style={{ fontFamily: `"${f.css}"`, fontSize: size, lineHeight: leading, letterSpacing: `${tracking / 1000}em`, fontWeight: effectiveWeight(f, weight), fontVariationSettings: vs(f, weight) }}>
                    {text}
                  </div>
                  <div className="mt-auto pt-6">
                    <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-mute">Width a–z</div>
                    <div className="h-1.5 bg-hover"><div className="h-full" style={{ width: `${(metrics[i].w / maxW) * 100}%`, background: COLORS[i] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Overlay list={list} metrics={metrics} word={overlayWord} size={Math.max(size * 3, 160)} weight={weight} tracking={tracking} opacity={opacity / 100} />
          )}
        </div>
      </div>
    </div>
  )
}

function Overlay({ list, metrics, word, size, weight, tracking, opacity }: { list: FontInfo[]; metrics: { xh: number; ch: number; asc: number; desc: number }[]; word: string; size: number; weight: number; tracking: number; opacity: number }) {
  const H = size * 1.6
  const base = size * 1.15
  return (
    <div className="flex min-h-full flex-col justify-center p-8">
      <svg width="100%" height={H} className="overflow-visible">
        <line x1="0" x2="100%" y1={base} y2={base} stroke="#111" strokeWidth="1" />
        <text x="4" y={base + 14} className="font-mono" fontSize="10" fill="#76756f">baseline</text>
        {list.map((f, i) => (
          <g key={i}>
            <line x1="0" x2="100%" y1={base - metrics[i].xh * size} y2={base - metrics[i].xh * size} stroke={COLORS[i]} strokeDasharray="4 4" strokeOpacity={0.8} />
            <line x1="0" x2="100%" y1={base - metrics[i].ch * size} y2={base - metrics[i].ch * size} stroke={COLORS[i]} strokeDasharray="1 3" strokeOpacity={0.8} />
          </g>
        ))}
        {list.map((f, i) => (
          <text key={'t' + i} x="40" y={base} fill={COLORS[i]} fillOpacity={opacity} style={{ fontFamily: `"${f.css}"`, fontSize: size, fontWeight: effectiveWeight(f, weight), fontVariationSettings: vs(f, weight), letterSpacing: `${tracking / 1000}em`, mixBlendMode: 'multiply' }}>
            {word}
          </text>
        ))}
      </svg>
      <div className="mt-6 flex flex-wrap gap-4 font-mono text-[10px]">
        {list.map((f, i) => (
          <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: COLORS[i] }} />{f.name} — x {(metrics[i].xh * 100).toFixed(1)} · cap {(metrics[i].ch * 100).toFixed(1)}</span>
        ))}
        <span className="text-mute">dashed = x-height · dotted = cap height</span>
      </div>
    </div>
  )
}
