import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { getFont, useFonts } from '../fonts/registry'
import { usePrimaryText } from './hooks'
import { insertAtCaret } from '../canvas/Workspace'
import { Icon } from '../ui/icons'

const CATS: { id: string; label: string; test: (c: string) => boolean }[] = [
  { id: 'upper', label: 'Uppercase', test: (c) => /\p{Lu}/u.test(c) },
  { id: 'lower', label: 'Lowercase', test: (c) => /\p{Ll}/u.test(c) },
  { id: 'num', label: 'Numbers', test: (c) => /\p{N}/u.test(c) },
  { id: 'punct', label: 'Punctuation', test: (c) => /\p{P}/u.test(c) },
  { id: 'currency', label: 'Currency', test: (c) => /\p{Sc}/u.test(c) },
  { id: 'symbol', label: 'Symbols', test: (c) => /[\p{Sm}\p{So}\p{Sk}]/u.test(c) },
  { id: 'special', label: 'Special', test: () => true },
]

export function GlyphPanel() {
  const show = useStore((s) => s.showGlyphs)
  const set = useStore((s) => s.set)
  const l = usePrimaryText()
  const fonts = useFonts((s) => s.fonts)
  const [fontId, setFontId] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [cat, setCat] = useState('all')
  const font = getFont(fontId ?? l?.style.fontId ?? 'inter')
  const groups = useMemo(() => {
    const out: Record<string, number[]> = {}
    CATS.forEach((c) => (out[c.id] = []))
    for (const cp of font.meta.chars) {
      if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || cp === 0xad || cp === 0xfeff || (cp >= 0x2000 && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029) continue
      const c = String.fromCodePoint(cp)
      if (/\s/.test(c)) continue
      const g = CATS.find((x) => x.test(c))!
      out[g.id].push(cp)
    }
    return out
  }, [font])
  if (!show) return null
  const total = Object.values(groups).reduce((a, b) => a + b.length, 0)
  return (
    <div className="absolute bottom-3 left-3 z-30 flex max-h-[min(520px,70%)] w-[min(520px,calc(100%-24px))] flex-col border border-ink bg-paper shadow-[6px_6px_0_rgba(0,0,0,0.06)]" data-testid="glyph-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Glyphs</span>
        <select aria-label="Glyph font" className="h-6 min-w-0 flex-1 border border-line bg-paper px-1 text-2xs" value={font.id} onChange={(e) => setFontId(e.target.value)}>
          {Object.values(fonts).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <span className="font-mono text-[9px] text-mute">{total} chars</span>
        <button aria-label="Close glyphs" className="grid h-6 w-6 place-items-center hover:bg-hover" onClick={() => set({ showGlyphs: false })}><Icon name="close" size={12} /></button>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-line px-3 py-1.5">
        {[{ id: 'all', label: 'All' }, ...CATS].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={`h-[18px] border px-1.5 text-[9.5px] ${cat === c.id ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}>
            {c.label} {c.id !== 'all' && <span className="opacity-50">{groups[c.id]?.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="tl-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {CATS.filter((c) => (cat === 'all' || cat === c.id) && groups[c.id].length).map((c) => (
            <div key={c.id} className="mb-2">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-faint">{c.label}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(34px,1fr))] border-l border-t border-hair">
                {groups[c.id].map((cp) => (
                  <button
                    key={cp}
                    data-glyph={cp}
                    onMouseEnter={() => setHover(cp)}
                    onClick={() => insertAtCaret(String.fromCodePoint(cp))}
                    className="grid aspect-square place-items-center border-b border-r border-hair text-[19px] leading-none hover:bg-ink hover:text-paper"
                    style={{ fontFamily: `"${font.css}"` }}
                    title={`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`}
                  >
                    {String.fromCodePoint(cp)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden w-[130px] shrink-0 flex-col items-center justify-center border-l border-line p-2 sm:flex">
          <div className="text-[72px] leading-none" style={{ fontFamily: `"${font.css}"` }}>{hover ? String.fromCodePoint(hover) : 'g'}</div>
          <div className="mt-2 font-mono text-[10px] text-mute">{hover ? `U+${hover.toString(16).toUpperCase().padStart(4, '0')}` : 'Hover a glyph'}</div>
          <div className="mt-1 text-center text-[9.5px] text-faint">Click to insert at the caret</div>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select / move'], ['T', 'Type'], ['R', 'Rotate'], ['S', 'Scale'], ['W', 'Warp'], ['P', 'Text on path'], ['U', 'Shape'], ['G', 'Toggle grid'], ['H / Space', 'Pan'], ['C', 'Glyph (character) mode'],
  ['⌘ Z', 'Undo'], ['⇧ ⌘ Z', 'Redo'], ['⌘ D', 'Duplicate'], ['⌫ / Delete', 'Delete object'], ['⌘ G', 'Group'], ['⇧ ⌘ G', 'Ungroup'], ['⌘ A', 'Select all'],
  ['Arrows', 'Move 1 pt'], ['⇧ Arrows', 'Move 10 pt'], ['Esc', 'Deselect / stop editing'], ['Enter', 'Edit selected text'], ['⌘ [ / ⌘ ]', 'Send backward / bring forward'],
  ['⌘ 0', 'Fit artboard'], ['⌘ 1', 'Zoom 100%'], ['⌘ + / ⌘ −', 'Zoom in / out'], ['?', 'This reference'],
]

export function ShortcutsModal() {
  const show = useStore((s) => s.showShortcuts)
  const set = useStore((s) => s.set)
  if (!show) return null
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/20 p-4" onClick={() => set({ showShortcuts: false })} data-testid="shortcuts">
      <div className="max-h-full w-full max-w-[620px] overflow-auto border border-ink bg-paper p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="mb-4 flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="font-mark text-[28px] font-black leading-none tracking-[-0.02em]" style={{ fontVariationSettings: '"wdth" 70, "wght" 900' }}>KEYBOARD</h2>
          <button aria-label="Close" className="font-mono text-2xs text-mute hover:text-ink" onClick={() => set({ showShortcuts: false })}>ESC ✕</button>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-hair py-1.5">
              <dt className="text-xs">{v}</dt>
              <dd><kbd className="tl-kbd">{k}</kbd></dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[10px] text-mute">On Windows and Linux use Ctrl instead of ⌘. Number fields: ↑ ↓ change by 1, Shift ×10, Alt ×0.1; drag a field label to scrub.</p>
      </div>
    </div>
  )
}
