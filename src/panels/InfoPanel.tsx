import { useStore } from '../store'
import { useFonts, CATEGORY_LABEL, getFont } from '../fonts/registry'
import { usePrimaryText } from './hooks'
import { getLayout } from '../engine/layout'
import { styleName } from './TypePanels'
import { effectiveWeight } from '../engine/style'

export function InfoPanel() {
  const l = usePrimaryText()
  const fv = useFonts((s) => s.version)
  const textSel = useStore((s) => s.textSel)
  const editing = useStore((s) => s.editing)
  if (!l)
    return (
      <div className="border-t border-line p-3" data-testid="info">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em]">Type Info</div>
        <p className="text-[10px] leading-snug text-mute">Select a text layer to read its font, metrics and spacing here.</p>
      </div>
    )
  const font = getFont(l.style.fontId)
  const m = font.meta
  const st = l.style
  const lay = getLayout(l, fv)
  const words = l.text.trim() ? l.text.trim().split(/\s+/).length : 0
  const chars = [...l.text.replace(/\n/g, '')].length
  const xh = m.xH / m.upm, ch = m.capH / m.upm
  const sel = editing === l.id ? Math.abs(textSel[1] - textSel[0]) : 0
  const rows: [string, string, string?][] = [
    ['Font', font.name],
    ['Style', styleName(font, st)],
    ['Size', `${round(st.size)} pt`],
    ['Leading', `${round(st.size * st.lineHeight)} pt`, `${st.lineHeight.toFixed(2)}×`],
    ['Tracking', `${st.tracking > 0 ? '+' : ''}${st.tracking}`, `${(st.tracking / 1000).toFixed(3)} em`],
    ['Weight', `${Math.round(effectiveWeight(font, st.weight))}`],
    ['Characters', `${chars}`, sel ? `${sel} selected` : undefined],
    ['Words', `${words}`],
    ['Lines', `${lay.lines.length}`],
    ['Variable Font', m.axes.length ? 'Yes' : 'No', m.axes.length ? m.axes.map((a) => a.tag).join(' ') : undefined],
    ['Classification', CATEGORY_LABEL[font.category]],
    ['x-height', `${round(xh * st.size)} pt`, `${(xh * 100).toFixed(1)}% em`],
    ['Cap height', `${round(ch * st.size)} pt`, `${(ch * 100).toFixed(1)}% em`],
    ['Units / em', `${m.upm}`],
    ['Glyphs', `${m.glyphs}`, `${m.chars.length} mapped`],
    ['Features', `${m.features.filter((f) => !['ccmp', 'locl', 'mark', 'mkmk', 'rvrn', 'aalt'].includes(f)).length}`],
  ]
  return (
    <div className="tl-scroll max-h-[46%] shrink-0 overflow-y-auto border-t border-line px-3 py-2.5" data-testid="info">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Type Info</span>
        <span className="font-mono text-[9px] text-faint">{font.source === 'upload' ? 'uploaded' : 'Google Fonts · OFL'}</span>
      </div>
      <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-[3px]">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="contents">
            <dt className="text-[10px] text-mute">{k}</dt>
            <dd className="truncate font-mono text-[10px] tabular-nums text-ink">
              {v}
              {sub && <span className="ml-1.5 text-faint">{sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {m.designer && <p className="mt-2 truncate text-[9.5px] text-faint">Design: {m.designer}</p>}
    </div>
  )
}
const round = (v: number) => Math.round(v * 10) / 10
