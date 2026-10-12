import { useMemo, useState } from 'react'
import { useFonts, CATEGORY_LABEL, getFont } from '../fonts/registry'
import { useStore } from '../store'
import type { FontInfo } from '../types'
import { weightName } from '../panels/TypePanels'

const BODY =
  'Typography is the craft of giving language a visible, durable form. Every decision — the proportion of a counter, the angle of the stress, the space between two letters — changes how quickly a sentence is read and what it seems to say. A typeface is a system: a small set of rules applied with consistency across hundreds of glyphs, so that any word you set holds together as if it had always existed.'
const BODY2 =
  'Good spacing is invisible. Readers notice only its absence: a word that falls apart, a line that feels crowded, a paragraph that refuses to settle into an even grey. Tracking, leading and measure are the quiet instruments that turn letters into texture.'

function vs(f: FontInfo, over: Record<string, number>) {
  return f.meta.axes.map((a) => `"${a.tag}" ${over[a.tag] ?? a.def}`).join(', ') || undefined
}

export function SpecimenView() {
  const { fonts, order } = useFonts()
  const layerFont = useStore((s) => {
    const l = s.doc.layers.find((x) => x.id === s.sel[0]) ?? s.doc.layers.find((x) => x.type === 'text')
    return l && l.type === 'text' ? l.style.fontId : 'inter'
  })
  const [fontId, setFontId] = useState(layerFont)
  const [word, setWord] = useState('Hamburgefonstiv')
  const [dark, setDark] = useState(false)
  const f = getFont(fontId)
  const m = f.meta
  const [live, setLive] = useState<Record<string, number>>({})
  const wAx = m.axes.find((a) => a.tag === 'wght')
  const weights = wAx ? [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].filter((w) => w >= wAx.min && w <= wAx.max) : m.weights
  const idx = order.indexOf(fontId) + 1
  const chars = useMemo(() => new Set(m.chars), [m])
  const has = (s: string) => [...s].filter((c) => chars.has(c.codePointAt(0)!)).join('')
  const ink = dark ? '#f2f1ec' : '#111111'
  const paper = dark ? '#0f0f0f' : '#fbfaf7'
  const mute = dark ? '#8c8b86' : '#76756f'
  const line = dark ? '#2b2b29' : '#dcdbd5'
  const fam = `"${f.css}"`
  const nameSize = f.name.length > 16 ? 'clamp(48px,8vw,128px)' : 'clamp(64px,12vw,184px)'
  const feats = m.features.filter((x) => !['ccmp', 'locl', 'mark', 'mkmk', 'rvrn', 'aalt', 'rlig', 'kern'].includes(x))
  const demos: [string, string, string][] = [
    ['frac', 'Fractions', '1/2 3/4 7/8'],
    ['onum', 'Oldstyle figures', '1234567890'],
    ['tnum', 'Tabular figures', '1111 / 8888'],
    ['zero', 'Slashed zero', '0 O 0 O'],
    ['smcp', 'Small caps', 'Small Capitals'],
    ['dlig', 'Discretionary ligatures', 'ct st Th sp'],
    ['swsh', 'Swashes', 'Quixotic Rhythm'],
    ['ss01', 'Stylistic set 01', 'agt 1 Gy'],
    ['ss02', 'Stylistic set 02', 'agt 1 Gy'],
    ['salt', 'Stylistic alternates', 'agt 1 Gy'],
    ['case', 'Case-sensitive', '(H-O-[N])'],
    ['ordn', 'Ordinals', '1a 2o No'],
  ]
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="specimen">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Specimen</span>
        <select aria-label="Specimen font" className="h-7 border border-line bg-paper px-2 text-xs" value={fontId} onChange={(e) => { setFontId(e.target.value); setLive({}) }}>
          {order.map((id) => <option key={id} value={id}>{fonts[id].name}</option>)}
        </select>
        <input aria-label="Display word" className="h-7 w-[200px] border border-line bg-paper px-2 text-xs outline-none focus:border-accent" value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button className={`h-7 border px-2 text-2xs ${dark ? 'border-ink bg-ink text-paper' : 'border-line'}`} onClick={() => setDark(!dark)}>{dark ? 'Dark' : 'Light'} sheet</button>
        <span className="ml-auto font-mono text-[10px] text-mute">Generated live from the font file’s own tables</span>
      </div>
      <div className="tl-scroll min-h-0 flex-1 overflow-y-auto" style={{ background: paper, color: ink }}>
        <article className="mx-auto max-w-[1180px] px-6 py-10 sm:px-12">
          {/* masthead */}
          <header className="grid grid-cols-12 gap-4 border-b pb-3 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: ink }}>
            <span className="col-span-6">Type Lab Specimen — Nº {String(idx).padStart(2, '0')}</span>
            <span className="col-span-3">{CATEGORY_LABEL[f.category]}</span>
            <span className="col-span-3 text-right">{m.axes.length ? `Variable · ${m.axes.length} axes` : 'Static'}</span>
          </header>
          <h1 className="mt-8 break-words leading-[0.86]" style={{ fontFamily: fam, fontSize: nameSize, fontVariationSettings: vs(f, { wght: wAx ? Math.min(wAx.max, 800) : 400 }), fontWeight: wAx ? Math.min(wAx.max, 800) : undefined, letterSpacing: '-0.02em' }}>
            {f.name}
          </h1>
          <dl className="mt-8 grid grid-cols-2 gap-y-4 border-t pt-4 sm:grid-cols-6" style={{ borderColor: line }}>
            {[
              ['Designer', m.designer || '—'],
              ['Version', (m.version || '—').replace(/^Version\s*/i, '').split(';')[0]],
              ['Glyphs', String(m.glyphs)],
              ['Styles', m.instances.length ? `${m.instances.length} named` : `${m.weights.length} weight${m.weights.length > 1 ? 's' : ''}`],
              ['Features', String(feats.length)],
              ['x / cap', `${((m.xH / m.capH) * 100).toFixed(0)}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: mute }}>{k}</dt>
                <dd className="mt-1 truncate text-sm">{v}</dd>
              </div>
            ))}
          </dl>

          {/* display */}
          <section className="mt-16">
            <Lbl c={mute}>Display — 160 pt</Lbl>
            <div className="mt-2 overflow-hidden whitespace-nowrap leading-[0.9]" style={{ fontFamily: fam, fontSize: `clamp(40px, ${Math.round(138 / Math.max(4, (word || 'Specimen').length) * 10) / 10}vw, 190px)`, fontVariationSettings: vs(f, live), letterSpacing: '-0.03em' }}>
              {word || 'Specimen'}
            </div>
          </section>

          {/* character set */}
          <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
            <div className="col-span-12 sm:col-span-3"><Lbl c={mute}>Character set</Lbl></div>
            <div className="col-span-12 flex flex-col gap-5 sm:col-span-9" style={{ fontFamily: fam, fontVariationSettings: vs(f, live) }}>
              {[
                ['Uppercase', has('ABCDEFGHIJKLMNOPQRSTUVWXYZ')],
                ['Lowercase', has('abcdefghijklmnopqrstuvwxyz')],
                ['Figures', has('0123456789')],
                ['Punctuation', has('.,:;…!?¡¿·•*#/\\()[]{}-–—_‚„“”‘’«»‹›"\'')],
                ['Symbols & currency', has('&@©®™§¶†‡°%‰+−±×÷=<>≠≈~^|$€£¥¢₩₽')],
                ['Accented', has('ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒÙÚÛÜÝßàáâãäåæçèéêëñöøœüÿ')],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] items-baseline gap-4">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: mute, fontFamily: 'var(--mono)' }}>{k}</span>
                  <span className="break-all text-[clamp(26px,3.4vw,44px)] leading-[1.15] tracking-[0.02em]">{v || '—'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* weights */}
          <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
            <div className="col-span-12 sm:col-span-3"><Lbl c={mute}>Weights</Lbl></div>
            <div className="col-span-12 sm:col-span-9">
              {weights.map((w) => (
                <div key={w} className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b py-2" style={{ borderColor: line }}>
                  <span className="truncate text-[clamp(24px,3vw,40px)] leading-tight" style={{ fontFamily: fam, fontWeight: w, fontVariationSettings: vs(f, { ...live, wght: w }) }}>
                    {weightName(w)} — The quick brown fox
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: mute }}>{w}</span>
                </div>
              ))}
            </div>
          </section>

          {/* waterfall */}
          <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
            <div className="col-span-12 sm:col-span-3"><Lbl c={mute}>Waterfall</Lbl></div>
            <div className="col-span-12 flex flex-col gap-3 sm:col-span-9" style={{ fontFamily: fam, fontVariationSettings: vs(f, live) }}>
              {[12, 16, 24, 36, 56, 84].map((s) => (
                <div key={s} className="grid grid-cols-[40px_1fr] items-baseline gap-3">
                  <span className="font-mono text-[9.5px]" style={{ color: mute, fontFamily: 'var(--mono)' }}>{s}</span>
                  <span className="truncate leading-[1.15]" style={{ fontSize: s }}>Sphinx of black quartz, judge my vow — 1/2 & 24°</span>
                </div>
              ))}
            </div>
          </section>

          {/* variable */}
          {m.axes.length > 0 && (
            <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
              <div className="col-span-12 sm:col-span-3">
                <Lbl c={mute}>Variable axes</Lbl>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: mute }}>Drag a slider: the display word above and every sample on this sheet follow.</p>
              </div>
              <div className="col-span-12 flex flex-col gap-6 sm:col-span-9">
                {m.axes.map((a) => {
                  const steps = [a.min, a.min + (a.max - a.min) * 0.25, a.def, a.min + (a.max - a.min) * 0.75, a.max]
                  return (
                    <div key={a.tag} className="border-b pb-4" style={{ borderColor: line }}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm">{a.name} <span className="font-mono text-[10px]" style={{ color: mute }}>“{a.tag}” {a.min} → {a.max}</span></span>
                        <input aria-label={`${a.name} axis`} type="range" min={a.min} max={a.max} step={(a.max - a.min) / 200} value={live[a.tag] ?? a.def} onChange={(e) => setLive({ ...live, [a.tag]: Number(e.target.value) })} className="w-[180px] accent-[#2b2bff]" />
                      </div>
                      <div className="mt-2 grid grid-cols-5 gap-2">
                        {steps.map((v, i) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[clamp(32px,5vw,64px)] leading-none" style={{ fontFamily: fam, fontVariationSettings: vs(f, { ...live, [a.tag]: v }) }}>Rag</span>
                            <span className="mt-1 font-mono text-[9px]" style={{ color: mute }}>{Math.round(v * 10) / 10}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* text */}
          <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
            <div className="col-span-12 sm:col-span-3"><Lbl c={mute}>Text setting</Lbl></div>
            <div className="col-span-12 grid gap-8 sm:col-span-9 md:grid-cols-2" style={{ fontFamily: fam, fontVariationSettings: vs(f, live) }}>
              <p className="text-[19px] leading-[1.42]">{BODY}</p>
              <div>
                <p className="text-[14px] leading-[1.55]">{BODY2}</p>
                <p className="mt-3 text-[11px] leading-[1.55]" style={{ color: mute }}>{BODY}</p>
              </div>
            </div>
          </section>

          {/* opentype */}
          {feats.length > 0 && (
            <section className="mt-16 grid grid-cols-12 gap-6 border-t pt-4" style={{ borderColor: ink }}>
              <div className="col-span-12 sm:col-span-3">
                <Lbl c={mute}>OpenType</Lbl>
                <p className="mt-2 font-mono text-[10px] leading-relaxed" style={{ color: mute }}>{feats.join(' ')}</p>
              </div>
              <div className="col-span-12 grid gap-x-6 sm:col-span-9 sm:grid-cols-2">
                {demos.filter(([t]) => feats.includes(t)).map(([t, label, s]) => (
                  <div key={t} className="grid grid-cols-[1fr_1fr] items-baseline gap-3 border-b py-2" style={{ borderColor: line, fontFamily: fam }}>
                    <span className="col-span-2 font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: mute, fontFamily: 'var(--mono)' }}>{label} · {t}</span>
                    <span className="text-[26px]" style={{ fontVariationSettings: vs(f, live) }}>{s}</span>
                    <span className="text-[26px]" style={{ fontFeatureSettings: `"${t}" 1`, fontVariationSettings: vs(f, live) }}>{s}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="mt-16 flex flex-wrap justify-between gap-2 border-t pt-3 font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ borderColor: ink, color: mute }}>
            <span>{f.name} · {m.upm} units per em · x-height {m.xH} · cap height {m.capH}</span>
            <span>{f.source === 'upload' ? 'Uploaded font' : 'SIL Open Font License · via Google Fonts'}</span>
          </footer>
        </article>
      </div>
    </div>
  )
}

function Lbl({ children, c }: { children: React.ReactNode; c: string }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: c }}>{children}</span>
}
