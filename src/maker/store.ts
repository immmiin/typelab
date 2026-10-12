import { create } from 'zustand'
import { DEFAULT_GLYPHS, ROWS, type GlyphRows } from './glyphs'
import { PARAM_DEFAULT, type MakerParams } from './outline'

const LS_KEY = 'typelab.maker.v1'

interface Saved {
  name: string
  params: MakerParams
  glyphs: Record<string, GlyphRows>
}

interface MakerState extends Saved {
  current: string
  preview: string
  past: Record<string, GlyphRows>[]
  future: Record<string, GlyphRows>[]
  set: (p: Partial<MakerState>) => void
  setParams: (p: Partial<MakerParams>) => void
  /** begin a stroke of edits (one undo step) */
  checkpoint: () => void
  setCell: (ch: string, c: number, r: number, on: boolean) => void
  setWidth: (ch: string, w: number) => void
  shift: (ch: string, dx: number, dy: number) => void
  clearGlyph: (ch: string) => void
  revertGlyph: (ch: string) => void
  undo: () => void
  redo: () => void
  resetAll: () => void
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    return { name: s.name, params: { ...PARAM_DEFAULT, ...s.params }, glyphs: { ...DEFAULT_GLYPHS, ...s.glyphs } }
  } catch {
    return null
  }
}

const saved = load()

export const useMaker = create<MakerState>((set, get) => ({
  name: saved?.name ?? 'Untitled Mono',
  params: saved?.params ?? PARAM_DEFAULT,
  glyphs: saved?.glyphs ?? DEFAULT_GLYPHS,
  current: 'A',
  preview: 'HAMBURGEFONSTIV\n0123456789 &?!',
  past: [],
  future: [],
  set: (p) => set(p),
  setParams: (p) => set({ params: { ...get().params, ...p } }),
  checkpoint: () => set({ past: [...get().past.slice(-60), get().glyphs], future: [] }),
  setCell: (ch, c, r, on) => {
    const rows = get().glyphs[ch]
    if (!rows || (rows[r][c] === '#') === on) return
    const next = rows.map((row, i) => (i === r ? row.slice(0, c) + (on ? '#' : '.') + row.slice(c + 1) : row))
    set({ glyphs: { ...get().glyphs, [ch]: next } })
  },
  setWidth: (ch, w) => {
    const rows = get().glyphs[ch]
    if (!rows || w < 1 || w > 9) return
    get().checkpoint()
    const next = rows.map((row) => (row.length >= w ? row.slice(0, w) : row + '.'.repeat(w - row.length)))
    set({ glyphs: { ...get().glyphs, [ch]: next } })
  },
  shift: (ch, dx, dy) => {
    const rows = get().glyphs[ch]
    if (!rows) return
    get().checkpoint()
    const w = rows[0].length
    const at = (c: number, r: number) => (r >= 0 && r < ROWS && c >= 0 && c < w ? rows[r][c] : '.')
    const next = rows.map((_, r) => Array.from({ length: w }, (_, c) => at(c - dx, r - dy)).join(''))
    set({ glyphs: { ...get().glyphs, [ch]: next } })
  },
  clearGlyph: (ch) => {
    const rows = get().glyphs[ch]
    if (!rows) return
    get().checkpoint()
    set({ glyphs: { ...get().glyphs, [ch]: rows.map((row) => '.'.repeat(row.length)) } })
  },
  revertGlyph: (ch) => {
    if (!DEFAULT_GLYPHS[ch]) return
    get().checkpoint()
    set({ glyphs: { ...get().glyphs, [ch]: DEFAULT_GLYPHS[ch] } })
  },
  undo: () => {
    const { past, glyphs, future } = get()
    if (!past.length) return
    set({ glyphs: past[past.length - 1], past: past.slice(0, -1), future: [glyphs, ...future] })
  },
  redo: () => {
    const { past, glyphs, future } = get()
    if (!future.length) return
    set({ glyphs: future[0], future: future.slice(1), past: [...past, glyphs] })
  },
  resetAll: () => {
    get().checkpoint()
    set({ glyphs: DEFAULT_GLYPHS, params: PARAM_DEFAULT })
  },
}))

// persist the project in this browser
let t: number | undefined
useMaker.subscribe((s) => {
  window.clearTimeout(t)
  t = window.setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ name: s.name, params: s.params, glyphs: s.glyphs }))
    } catch {
      /* storage unavailable */
    }
  }, 250)
})
