import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type { CharStyle, Doc, Layer, Mode, Preset, ShapeKind, TextLayer, Tool } from './types'
import { BUILTIN_PRESETS, defaultDoc, uid } from './defaults'

export type InspectorTab = 'type' | 'style' | 'form' | 'doc'

export interface View { zoom: number; panX: number; panY: number }

interface State {
  doc: Doc
  past: Doc[]
  future: Doc[]
  lastKey: string | null
  lastTime: number
  sel: string[]
  tool: Tool
  shapeKind: ShapeKind
  editing: string | null
  textSel: [number, number]
  charMode: boolean
  view: View
  viewport: { w: number; h: number }
  mode: Mode
  tab: InspectorTab
  openSection: Record<string, boolean>
  showShortcuts: boolean
  showGlyphs: boolean
  leftOpen: boolean
  rightOpen: boolean
  userPresets: Preset[]
  toast: string | null
  hud: string | null

  update: (fn: (d: Draft<Doc>) => void, key?: string) => void
  updateLayer: (id: string, fn: (l: Draft<Layer>) => void, key?: string) => void
  updateText: (fn: (l: Draft<TextLayer>) => void, key?: string, ids?: string[]) => void
  setSel: (ids: string[]) => void
  undo: () => void
  redo: () => void
  set: (p: Partial<State>) => void
  flash: (msg: string) => void
}

const LS_DOC = 'typelab.doc.v1'
const LS_UI = 'typelab.ui.v1'
const LS_PRESETS = 'typelab.presets.v1'

function load<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

const savedDoc = load<Doc>(LS_DOC)
const savedUi = load<{ view: View; tab: InspectorTab; openSection: Record<string, boolean> }>(LS_UI)

let toastTimer: number | undefined

export const useStore = create<State>((set, get) => ({
  doc: savedDoc && Array.isArray(savedDoc.layers) ? { ...savedDoc, grid: { ...defaultDoc().grid, ...savedDoc.grid } } : defaultDoc(),
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,
  sel: [],
  tool: 'select',
  shapeKind: 'rect',
  editing: null,
  textSel: [0, 0],
  charMode: false,
  view: savedUi?.view ?? { zoom: 0.5, panX: 0, panY: 0 },
  viewport: { w: 800, h: 600 },
  mode: 'edit',
  tab: savedUi?.tab ?? 'type',
  openSection: savedUi?.openSection ?? {},
  showShortcuts: false,
  showGlyphs: false,
  leftOpen: true,
  rightOpen: true,
  userPresets: load<Preset[]>(LS_PRESETS) ?? [],
  toast: null,
  hud: null,

  update: (fn, key) => {
    const s = get()
    const next = produce(s.doc, fn)
    if (next === s.doc) return
    const now = Date.now()
    const merge = !!key && key === s.lastKey && now - s.lastTime < 1200
    set({
      doc: next,
      past: merge ? s.past : [...s.past, s.doc].slice(-200),
      future: [],
      lastKey: key ?? null,
      lastTime: now,
    })
  },
  updateLayer: (id, fn, key) =>
    get().update((d) => {
      const l = d.layers.find((x) => x.id === id)
      if (l) fn(l)
    }, key),
  updateText: (fn, key, ids) => {
    const s = get()
    const targets = ids ?? (s.editing ? [s.editing] : s.sel)
    s.update((d) => {
      for (const l of d.layers) if (targets.includes(l.id) && l.type === 'text') fn(l as Draft<TextLayer>)
    }, key)
  },
  setSel: (ids) => {
    const s = get()
    set({ sel: ids, editing: s.editing && ids.includes(s.editing) ? s.editing : null })
  },
  undo: () => {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    const ids = new Set(prev.layers.map((l) => l.id))
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], lastKey: null, sel: s.sel.filter((i) => ids.has(i)), editing: s.editing && ids.has(s.editing) ? s.editing : null })
    s.flash('Undo')
  },
  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    const ids = new Set(next.layers.map((l) => l.id))
    set({ doc: next, future: s.future.slice(1), past: [...s.past, s.doc], lastKey: null, sel: s.sel.filter((i) => ids.has(i)), editing: s.editing && ids.has(s.editing) ? s.editing : null })
    s.flash('Redo')
  },
  set: (p) => set(p),
  flash: (msg) => {
    window.clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = window.setTimeout(() => set({ toast: null }), 1600)
  },
}))

// ---------- persistence ----------
let saveTimer: number | undefined
useStore.subscribe((s, p) => {
  if (s.doc === p.doc && s.view === p.view && s.tab === p.tab && s.openSection === p.openSection && s.userPresets === p.userPresets) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(LS_DOC, JSON.stringify(s.doc))
      localStorage.setItem(LS_UI, JSON.stringify({ view: s.view, tab: s.tab, openSection: s.openSection }))
      localStorage.setItem(LS_PRESETS, JSON.stringify(s.userPresets))
    } catch {
      /* storage full or unavailable */
    }
  }, 300)
})

// ---------- helpers & actions ----------
export const S = () => useStore.getState()

export const allPresets = () => [...BUILTIN_PRESETS, ...S().userPresets]

export function selectedLayers(): Layer[] {
  const s = S()
  return s.doc.layers.filter((l) => s.sel.includes(l.id))
}

export function primaryText(): TextLayer | null {
  const s = S()
  const id = s.editing ?? s.sel[s.sel.length - 1]
  const l = s.doc.layers.find((x) => x.id === id)
  return l && l.type === 'text' ? l : null
}

/** Expand a clicked layer to its whole group */
export function groupExpand(id: string): string[] {
  const d = S().doc
  const l = d.layers.find((x) => x.id === id)
  if (!l || !l.groupId) return [id]
  return d.layers.filter((x) => x.groupId === l.groupId).map((x) => x.id)
}

export function addLayer(l: Layer, select = true) {
  S().update((d) => {
    d.layers.push(l)
  })
  if (select) S().setSel([l.id])
}

export function deleteSelected() {
  const s = S()
  if (!s.sel.length) return
  const ids = new Set(s.sel)
  s.update((d) => {
    d.layers = d.layers.filter((l) => !ids.has(l.id) || l.locked)
  })
  s.set({ sel: [], editing: null })
}

export function duplicateSelected() {
  const s = S()
  if (!s.sel.length) return
  const newIds: string[] = []
  const groupMap: Record<string, string> = {}
  s.update((d) => {
    const copies: Layer[] = []
    for (const l of d.layers) {
      if (!s.sel.includes(l.id)) continue
      const c = JSON.parse(JSON.stringify(l)) as Layer
      c.id = uid()
      c.name = l.name + ' copy'
      c.x += 24
      c.y += 24
      if (c.groupId) {
        groupMap[c.groupId] ??= uid()
        c.groupId = groupMap[c.groupId]
        d.groups[c.groupId] = { name: (d.groups[l.groupId!]?.name ?? 'Group') + ' copy' }
      }
      newIds.push(c.id)
      copies.push(c)
    }
    d.layers.push(...(copies as Draft<Layer>[]))
  })
  s.setSel(newIds)
  s.flash(`Duplicated ${newIds.length} layer${newIds.length > 1 ? 's' : ''}`)
}

export function groupSelected() {
  const s = S()
  if (s.sel.length < 2) return s.flash('Select two or more layers to group')
  const gid = uid()
  s.update((d) => {
    const n = Object.keys(d.groups).length + 1
    d.groups[gid] = { name: `Group ${n}` }
    // move members together at the topmost member's position
    const members = d.layers.filter((l) => s.sel.includes(l.id))
    const topIdx = Math.max(...members.map((m) => d.layers.indexOf(m)))
    const rest = d.layers.filter((l) => !s.sel.includes(l.id))
    const insertAt = rest.indexOf(d.layers[topIdx + 1] as Draft<Layer>)
    members.forEach((m) => (m.groupId = gid))
    if (insertAt < 0) rest.push(...members)
    else rest.splice(insertAt, 0, ...members)
    d.layers = rest
  })
  s.flash('Grouped')
}

export function ungroupSelected() {
  const s = S()
  const gids = new Set(s.doc.layers.filter((l) => s.sel.includes(l.id) && l.groupId).map((l) => l.groupId!))
  if (!gids.size) return s.flash('Selection is not grouped')
  s.update((d) => {
    d.layers.forEach((l) => {
      if (l.groupId && gids.has(l.groupId)) l.groupId = null
    })
    gids.forEach((g) => delete d.groups[g])
  })
  s.flash('Ungrouped')
}

export function setText(id: string, text: string) {
  const s = S()
  const l = s.doc.layers.find((x) => x.id === id) as TextLayer | undefined
  if (!l) return
  const old = l.text
  if (old === text) return
  let pre = 0
  while (pre < old.length && pre < text.length && old[pre] === text[pre]) pre++
  let suf = 0
  while (suf < old.length - pre && suf < text.length - pre && old[old.length - 1 - suf] === text[text.length - 1 - suf]) suf++
  const removed = old.length - pre - suf
  const inserted = text.length - pre - suf
  const chars = [...l.chars]
  while (chars.length < old.length) chars.push(null)
  const inherit = pre > 0 ? chars[pre - 1] : chars[pre] ?? null
  const fill: (CharStyle | null)[] = Array.from({ length: inserted }, () => (inherit ? { ...inherit, dx: undefined, dy: undefined } : null))
  chars.splice(pre, removed, ...fill)
  s.update((d) => {
    const t = d.layers.find((x) => x.id === id) as Draft<TextLayer>
    t.text = text
    t.chars = chars as Draft<CharStyle | null>[]
  }, 'text:' + id)
}

export function applyCharStyle(id: string, range: [number, number], patch: Partial<CharStyle>, key?: string) {
  const [a, b] = range[0] <= range[1] ? range : [range[1], range[0]]
  if (a === b) return
  S().update((d) => {
    const t = d.layers.find((x) => x.id === id) as Draft<TextLayer>
    if (!t) return
    while (t.chars.length < t.text.length) t.chars.push(null)
    for (let i = a; i < b; i++) {
      const c: CharStyle = { ...(t.chars[i] ?? {}) }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (c as Record<string, unknown>)[k]
        else (c as Record<string, unknown>)[k] = v
      }
      t.chars[i] = Object.keys(c).length ? c : null
    }
  }, key)
}

export function clearCharStyles(id: string, range?: [number, number]) {
  S().update((d) => {
    const t = d.layers.find((x) => x.id === id) as Draft<TextLayer>
    if (!t) return
    if (!range) t.chars = []
    else for (let i = Math.min(...range); i < Math.max(...range); i++) t.chars[i] = null
  })
}

/** Make sure a text layer is the target of typography edits. Selects the topmost text layer if needed. */
export function ensureTextTarget(): string | null {
  const s = S()
  if (s.editing) return s.editing
  const selText = s.doc.layers.filter((l) => s.sel.includes(l.id) && l.type === 'text')
  if (selText.length) return selText[selText.length - 1].id
  const texts = s.doc.layers.filter((l) => l.type === 'text' && l.visible && !l.locked)
  const t = texts[texts.length - 1]
  if (!t) return null
  s.setSel([t.id])
  s.flash(`Editing “${t.name}”`)
  return t.id
}
