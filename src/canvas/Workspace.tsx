import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Draft } from 'immer'
import { useStore, S, groupExpand, addLayer, setText } from '../store'
import { useFonts } from '../fonts/registry'
import { LayerView } from '../render/LayerView'
import type { Layer, TextLayer } from '../types'
import { aabb, caretAt, getLay, glyphPolys, hitLayer, indexAt, layerM, layerPoly, lineStep, localBounds, toLocal } from '../engine/hit'
import { apply, inv, pointInPoly, type Mat, type Pt } from '../engine/geom'
import { makeShape, makeText, uid } from '../defaults'
import { gridLines, snapBox, snapCandidates, snapPoint, type SnapLine } from './snap'
import { Rulers, RULER } from './Rulers'

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: { zoom: number; panX: number; panY: number } }
  | { kind: 'move'; start: Pt; orig: Record<string, { x: number; y: number }>; box: { x: number; y: number; w: number; h: number }; cand: ReturnType<typeof snapCandidates>; moved: boolean }
  | { kind: 'marquee'; start: Pt; cur: Pt; add: string[] }
  | { kind: 'handle'; h: string; id: string; mode: 'resize' | 'scale'; orig: Layer; b: { x: number; y: number; w: number; h: number; W: number; H: number }; M: Mat }
  | { kind: 'rotate'; ids: string[]; pivot: Pt; a0: number; orig: Record<string, { x: number; y: number; r: number; W: number; H: number }> }
  | { kind: 'scaleDrag'; ids: string[]; pivot: Pt; d0: number; orig: Record<string, { sx: number; sy: number }> }
  | { kind: 'warp'; id: string; start: Pt; bend: number; intensity: number }
  | { kind: 'pathR'; id: string; start: Pt; v0: number; field: 'radius' | 'amplitude' | 'growth' }
  | { kind: 'shape'; start: Pt; id: string }
  | { kind: 'textbox'; start: Pt; cur: Pt }
  | { kind: 'textsel'; id: string; anchor: number }
  | { kind: 'guide'; id: string; axis: 'x' | 'y'; fromRuler: boolean }
  | { kind: 'glyph'; id: string; start: Pt; range: [number, number]; orig: Record<number, { dx: number; dy: number }>; Minv: Mat }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
const HCURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

export function fitView() {
  const s = S()
  const { w, h } = s.viewport
  const A = s.doc.artboard
  const zoom = Math.max(0.05, Math.min(4, Math.min((w - 2 * RULER - 80) / A.w, (h - 2 * RULER - 80) / A.h)))
  s.set({ view: { zoom, panX: (w - A.w * zoom) / 2 + RULER / 2, panY: (h - A.h * zoom) / 2 + RULER / 2 } })
}

export function zoomBy(f: number, cx?: number, cy?: number) {
  const s = S()
  const v = s.view
  const z = Math.max(0.05, Math.min(16, v.zoom * f))
  const px = cx ?? s.viewport.w / 2
  const py = cy ?? s.viewport.h / 2
  s.set({ view: { zoom: z, panX: px - ((px - v.panX) * z) / v.zoom, panY: py - ((py - v.panY) * z) / v.zoom } })
}

let editorEl: HTMLTextAreaElement | null = null
export function focusEditor() {
  editorEl?.focus({ preventScroll: true })
}
export function startEditing(id: string, sel?: [number, number]) {
  const s = S()
  const l = s.doc.layers.find((x) => x.id === id)
  if (!l || l.type !== 'text' || l.locked) return
  const range = sel ?? [l.text.length, l.text.length]
  s.set({ editing: id, sel: [id], textSel: range, tool: s.tool === 'type' ? 'type' : s.tool })
  requestAnimationFrame(() => {
    if (!editorEl) return
    editorEl.value = l.text
    editorEl.focus({ preventScroll: true })
    editorEl.setSelectionRange(range[0], range[1])
  })
}
export function insertAtCaret(str: string) {
  const s = S()
  const id = s.editing ?? s.sel[0]
  const l = s.doc.layers.find((x) => x.id === id) as TextLayer | undefined
  if (!l || l.type !== 'text') return s.flash('Select a text layer first')
  const [a, b] = s.editing ? [Math.min(...s.textSel), Math.max(...s.textSel)] : [l.text.length, l.text.length]
  const next = l.text.slice(0, a) + str + l.text.slice(b)
  setText(l.id, next)
  startEditing(l.id, [a + str.length, a + str.length])
}

export function Workspace() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const doc = useStore((s) => s.doc)
  const view = useStore((s) => s.view)
  const sel = useStore((s) => s.sel)
  const tool = useStore((s) => s.tool)
  const editing = useStore((s) => s.editing)
  const textSel = useStore((s) => s.textSel)
  const charMode = useStore((s) => s.charMode)
  const viewport = useStore((s) => s.viewport)
  const fv = useFonts((s) => s.version)
  const ready = useFonts((s) => s.ready)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [snaps, setSnaps] = useState<SnapLine[]>([])
  const [hud, setHud] = useState<{ x: number; y: number; t: string } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [space, setSpace] = useState(false)
  const [cursorPt, setCursorPt] = useState<Pt | null>(null)

  editorEl = taRef.current
  useEffect(() => {
    editorEl = taRef.current
  })

  const A = doc.artboard
  const { zoom, panX, panY } = view
  const toArt = (sx: number, sy: number): Pt => ({ x: (sx - panX) / zoom, y: (sy - panY) / zoom })
  const toScr = (p: Pt): Pt => ({ x: p.x * zoom + panX, y: p.y * zoom + panY })

  // viewport size
  useLayoutEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const first = S().viewport.w === 800 && S().viewport.h === 600
      S().set({ viewport: { w: r.width, h: r.height } })
      if (first && !localStorage.getItem('typelab.ui.v1')) fitView()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // space for panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        setSpace(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // wheel zoom/pan (non-passive)
  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      if (S().mode !== 'edit') return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else {
        const v = S().view
        S().set({ view: { ...v, panX: v.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) } })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // keep hidden textarea in sync
  const editLayer = editing ? (doc.layers.find((l) => l.id === editing) as TextLayer | undefined) : undefined
  useEffect(() => {
    const ta = taRef.current
    if (!ta || !editLayer) return
    if (ta.value !== editLayer.text) {
      ta.value = editLayer.text
      ta.setSelectionRange(textSel[0], textSel[1])
    }
  }, [editLayer?.text])

  const selLayers = doc.layers.filter((l) => sel.includes(l.id))
  const single = selLayers.length === 1 ? selLayers[0] : null

  function local(e: React.PointerEvent | PointerEvent | React.MouseEvent): Pt {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function begin(d: Drag, e: React.PointerEvent) {
    dragRef.current = d
    setDrag(d)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (S().mode !== 'edit') return
    const sp = local(e)
    const p = toArt(sp.x, sp.y)
    const target = e.target as Element
    const hAttr = target.getAttribute('data-h')
    const gAttr = target.getAttribute('data-guide')
    const rAttr = target.getAttribute('data-ruler')
    const st = S()

    if (e.button === 1 || space || tool === 'hand') {
      return begin({ kind: 'pan', sx: sp.x, sy: sp.y, view: { ...st.view } }, e)
    }
    if (e.button !== 0) return

    if (rAttr) {
      const axis = rAttr === 'top' ? 'y' : 'x'
      const id = uid()
      st.update((d) => {
        d.guides.push({ id, axis, pos: axis === 'x' ? p.x : p.y })
        d.showGuides = true
      })
      return begin({ kind: 'guide', id, axis, fromRuler: true }, e)
    }
    if (gAttr && !st.doc.guidesLocked) {
      const g = st.doc.guides.find((x) => x.id === gAttr)
      if (g) return begin({ kind: 'guide', id: g.id, axis: g.axis, fromRuler: false }, e)
    }

    // handles
    if (hAttr && single) {
      if (hAttr === 'rot') return startRotate([single.id], p, e)
      const b = localBounds(single, fv)
      const mode = tool === 'scale' ? 'scale' : 'resize'
      return begin({ kind: 'handle', h: hAttr, id: single.id, mode, orig: JSON.parse(JSON.stringify(single)), b, M: layerM(single, fv) }, e)
    }

    // text editing interactions
    if (editing && editLayer) {
      const lay = getLay(editLayer, fv)
      const lp = toLocal(editLayer, fv, p)
      const inside = pointInPoly(p, layerPoly(editLayer, fv))
      if (inside) {
        const idx = indexAt(editLayer, lay, lp)
        const anchor = e.shiftKey ? st.textSel[0] : idx
        setTextSel([anchor, idx])
        return begin({ kind: 'textsel', id: editLayer.id, anchor }, e)
      }
      st.set({ editing: null })
    }

    // character mode glyph picking
    if (charMode && tool === 'select' && single && single.type === 'text' && !single.locked && !single.path.enabled) {
      const lay = getLay(single, fv)
      const lp = toLocal(single, fv, p)
      const polys = glyphPolys(single, lay)
      const k = polys.findIndex((poly, i) => poly && !lay.glyphs[i].nl && pointInPoly(lp, poly))
      if (k >= 0) {
        const g = lay.glyphs[k]
        let range: [number, number] = [g.i, g.i + g.n]
        const cur = st.textSel
        const curRange: [number, number] = [Math.min(...cur), Math.max(...cur)]
        const within = g.i >= curRange[0] && g.i < curRange[1]
        if (e.shiftKey) range = [Math.min(curRange[0], g.i), Math.max(curRange[1], g.i + g.n)]
        else if (within && curRange[1] - curRange[0] > 1) range = curRange
        st.set({ textSel: range })
        const orig: Record<number, { dx: number; dy: number }> = {}
        for (let i = range[0]; i < range[1]; i++) orig[i] = { dx: single.chars[i]?.dx ?? 0, dy: single.chars[i]?.dy ?? 0 }
        const M = layerM(single, fv)
        const lin: Mat = [M[0], M[1], M[2], M[3], 0, 0]
        return begin({ kind: 'glyph', id: single.id, start: p, range, orig, Minv: inv(lin) }, e)
      }
    }

    const hit = hitLayer(st.doc.layers, p, fv)

    switch (tool) {
      case 'type': {
        if (hit && hit.type === 'text') {
          const lay = getLay(hit, fv)
          const idx = indexAt(hit, lay, toLocal(hit, fv, p))
          startEditing(hit.id, [idx, idx])
          return begin({ kind: 'textsel', id: hit.id, anchor: idx }, e)
        }
        return begin({ kind: 'textbox', start: p, cur: p }, e)
      }
      case 'shape': {
        const l = makeShape(st.shapeKind, p.x, p.y, 1, st.shapeKind === 'line' ? 0 : 1)
        addLayer(l)
        return begin({ kind: 'shape', start: p, id: l.id }, e)
      }
      case 'rotate': {
        const ids = hit && !st.sel.includes(hit.id) ? groupExpand(hit.id) : st.sel
        if (!ids.length) return
        if (hit && !st.sel.includes(hit.id)) st.setSel(ids)
        return startRotate(ids, p, e)
      }
      case 'scale': {
        const ids = hit && !st.sel.includes(hit.id) ? groupExpand(hit.id) : st.sel
        if (!ids.length) return
        if (hit && !st.sel.includes(hit.id)) st.setSel(ids)
        const ls = st.doc.layers.filter((l) => ids.includes(l.id))
        const box = aabb(ls.map((l) => layerPoly(l, fv)))
        const pivot = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
        const orig: Record<string, { sx: number; sy: number }> = {}
        ls.forEach((l) => (orig[l.id] = { sx: l.scaleX, sy: l.scaleY }))
        return begin({ kind: 'scaleDrag', ids, pivot, d0: Math.max(4, Math.hypot(p.x - pivot.x, p.y - pivot.y)), orig }, e)
      }
      case 'warp': {
        const target = (hit?.type === 'text' ? hit : null) ?? (single?.type === 'text' ? single : null)
        if (!target || target.type !== 'text') return st.flash('Warp: drag on a text layer')
        st.setSel([target.id])
        st.set({ tab: 'form' })
        if (target.distort.warp === 'none') st.updateLayer(target.id, (l) => { (l as Draft<TextLayer>).distort.warp = 'arc' })
        return begin({ kind: 'warp', id: target.id, start: p, bend: target.distort.warp === 'none' ? 0 : target.distort.bend, intensity: target.distort.intensity }, e)
      }
      case 'path': {
        if (hit && hit.type === 'text') {
          st.setSel([hit.id])
          st.set({ tab: 'form' })
          if (!hit.path.enabled) st.updateLayer(hit.id, (l) => { (l as Draft<TextLayer>).path.enabled = true }, 'path-enable')
          const field = hit.path.type === 'wave' ? 'amplitude' : hit.path.type === 'spiral' ? 'growth' : 'radius'
          return begin({ kind: 'pathR', id: hit.id, start: p, v0: hit.path[field], field }, e)
        }
        const l = makeText('TEXT ON A PATH · TYPE LAB · ', 0, 0, { fontId: 'inter', size: 40, weight: 600, tracking: 80 })
        l.path.enabled = true
        l.path.radius = 200
        l.name = 'Circle text'
        addLayer(l)
        // centre it on the click
        const W = getLay(l, fv).W, H = getLay(l, fv).H
        st.updateLayer(l.id, (d) => { d.x = p.x - W / 2; d.y = p.y - H / 2 })
        st.set({ tab: 'form' })
        return
      }
      default: {
        // select
        if (hit) {
          const ids = groupExpand(hit.id)
          let next = st.sel
          if (e.shiftKey) next = ids.every((i) => st.sel.includes(i)) ? st.sel.filter((i) => !ids.includes(i)) : [...new Set([...st.sel, ...ids])]
          else if (!st.sel.includes(hit.id)) next = ids
          st.setSel(next)
          if (st.charMode && hit.type === 'text') st.set({ textSel: [0, 0] })
          const moving = st.doc.layers.filter((l) => next.includes(l.id) && !l.locked)
          const orig: Record<string, { x: number; y: number }> = {}
          moving.forEach((l) => (orig[l.id] = { x: l.x, y: l.y }))
          const box = aabb(moving.map((l) => layerPoly(l, fv)))
          return begin({ kind: 'move', start: p, orig, box, cand: snapCandidates(st.doc, new Set(next), fv), moved: false }, e)
        }
        if (!e.shiftKey) st.setSel([])
        return begin({ kind: 'marquee', start: p, cur: p, add: e.shiftKey ? st.sel : [] }, e)
      }
    }
  }

  function startRotate(ids: string[], p: Pt, e: React.PointerEvent) {
    const st = S()
    const ls = st.doc.layers.filter((l) => ids.includes(l.id) && !l.locked)
    const box = aabb(ls.map((l) => layerPoly(l, fv)))
    const pivot = ls.length === 1 ? apply(layerM(ls[0], fv), { x: localBounds(ls[0], fv).W / 2, y: localBounds(ls[0], fv).H / 2 }) : { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const orig: Record<string, { x: number; y: number; r: number; W: number; H: number }> = {}
    ls.forEach((l) => {
      const b = localBounds(l, fv)
      orig[l.id] = { x: l.x, y: l.y, r: l.rotation, W: b.W, H: b.H }
    })
    begin({ kind: 'rotate', ids: ls.map((l) => l.id), pivot, a0: Math.atan2(p.y - pivot.y, p.x - pivot.x), orig }, e)
  }

  function setTextSel(r: [number, number]) {
    S().set({ textSel: r })
    const ta = taRef.current
    if (ta) {
      ta.focus({ preventScroll: true })
      const a = Math.min(r[0], r[1]), b = Math.max(r[0], r[1])
      ta.setSelectionRange(a, b, r[1] < r[0] ? 'backward' : 'forward')
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const sp = local(e)
    const p = toArt(sp.x, sp.y)
    setCursorPt(p)
    const d = dragRef.current
    const st = S()
    if (!d) {
      if (st.mode === 'edit') {
        const h = hitLayer(st.doc.layers, p, fv)
        setHover(h?.id ?? null)
      }
      return
    }
    const thr = 6 / zoom
    switch (d.kind) {
      case 'pan':
        st.set({ view: { ...d.view, panX: d.view.panX + sp.x - d.sx, panY: d.view.panY + sp.y - d.sy } })
        break
      case 'move': {
        let dx = p.x - d.start.x, dy = p.y - d.start.y
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        const sn = e.altKey ? { dx, dy, lines: [] } : snapBox(d.box, dx, dy, d.cand, thr)
        setSnaps(sn.lines)
        d.moved = true
        st.update((doc) => {
          for (const l of doc.layers) {
            const o = d.orig[l.id]
            if (o) {
              l.x = o.x + sn.dx
              l.y = o.y + sn.dy
            }
          }
        }, 'move')
        setHud({ x: sp.x, y: sp.y, t: `X ${Math.round(d.box.x + sn.dx)}  Y ${Math.round(d.box.y + sn.dy)}` })
        break
      }
      case 'marquee': {
        const nd = { ...d, cur: p }
        dragRef.current = nd
        setDrag(nd)
        const r = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) }
        const ids = st.doc.layers
          .filter((l) => l.visible && !l.locked)
          .filter((l) => {
            const b = aabb([layerPoly(l, fv)])
            return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y
          })
          .flatMap((l) => groupExpand(l.id))
        st.set({ sel: [...new Set([...d.add, ...ids])] })
        break
      }
      case 'handle':
        handleDrag(d, p, e.shiftKey, sp)
        break
      case 'rotate': {
        let da = ((Math.atan2(p.y - d.pivot.y, p.x - d.pivot.x) - d.a0) * 180) / Math.PI
        const first = d.orig[d.ids[0]]
        if (e.shiftKey) da = Math.round((first.r + da) / 15) * 15 - first.r
        const rad = (da * Math.PI) / 180
        st.update((doc) => {
          for (const l of doc.layers) {
            const o = d.orig[l.id]
            if (!o) continue
            const c = { x: o.x + o.W / 2, y: o.y + o.H / 2 }
            const vx = c.x - d.pivot.x, vy = c.y - d.pivot.y
            const nc = { x: d.pivot.x + vx * Math.cos(rad) - vy * Math.sin(rad), y: d.pivot.y + vx * Math.sin(rad) + vy * Math.cos(rad) }
            l.x = nc.x - o.W / 2
            l.y = nc.y - o.H / 2
            l.rotation = norm(o.r + da)
          }
        }, 'rotate')
        setHud({ x: sp.x, y: sp.y, t: `${Math.round(norm(first.r + da))}°` })
        break
      }
      case 'scaleDrag': {
        const f = Math.max(0.02, Math.hypot(p.x - d.pivot.x, p.y - d.pivot.y) / d.d0)
        st.update((doc) => {
          for (const l of doc.layers) {
            const o = d.orig[l.id]
            if (!o) continue
            l.scaleX = round3(o.sx * f)
            l.scaleY = round3(o.sy * f)
          }
        }, 'scale')
        setHud({ x: sp.x, y: sp.y, t: `${Math.round(f * 100)}%` })
        break
      }
      case 'warp': {
        const bend = clamp(Math.round(d.bend + (p.x - d.start.x) / 3), -100, 100)
        const inten = clamp(Math.round(d.intensity - (p.y - d.start.y) / 3), 0, 200)
        st.updateLayer(d.id, (l) => {
          const t = l as Draft<TextLayer>
          t.distort.bend = bend
          t.distort.intensity = inten
        }, 'warp')
        setHud({ x: sp.x, y: sp.y, t: `Bend ${bend}  ·  Intensity ${inten}%` })
        break
      }
      case 'pathR': {
        const v = Math.max(10, Math.round(d.v0 + (p.x - d.start.x)))
        st.updateLayer(d.id, (l) => { ((l as Draft<TextLayer>).path as unknown as Record<string, number>)[d.field] = v }, 'pathR')
        setHud({ x: sp.x, y: sp.y, t: `${d.field[0].toUpperCase() + d.field.slice(1)} ${v}` })
        break
      }
      case 'shape': {
        let w = p.x - d.start.x, h = p.y - d.start.y
        const kind = st.shapeKind
        if (e.shiftKey && kind !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
        st.updateLayer(d.id, (l) => {
          if (kind === 'line') {
            const len = Math.hypot(w, h)
            l.w = len
            l.h = 0
            l.rotation = e.shiftKey ? Math.round((Math.atan2(h, w) * 180) / Math.PI / 45) * 45 : (Math.atan2(h, w) * 180) / Math.PI
            const ang = (l.rotation * Math.PI) / 180
            const cx = d.start.x + (Math.cos(ang) * len) / 2, cy = d.start.y + (Math.sin(ang) * len) / 2
            l.x = cx - len / 2
            l.y = cy
          } else {
            l.x = Math.min(d.start.x, d.start.x + w)
            l.y = Math.min(d.start.y, d.start.y + h)
            l.w = Math.abs(w)
            l.h = Math.abs(h)
          }
        }, 'shape-draw')
        setHud({ x: sp.x, y: sp.y, t: `${Math.round(Math.abs(w))} × ${Math.round(Math.abs(h))}` })
        break
      }
      case 'textbox': {
        const nd = { ...d, cur: p }
        dragRef.current = nd
        setDrag(nd)
        break
      }
      case 'textsel': {
        const l = st.doc.layers.find((x) => x.id === d.id) as TextLayer
        if (!l) break
        const idx = indexAt(l, getLay(l, fv), toLocal(l, fv, p))
        setTextSel([d.anchor, idx])
        break
      }
      case 'guide': {
        let pos = d.axis === 'x' ? p.x : p.y
        const sn = snapPoint(pos, d.axis === 'x' ? [0, A.w / 2, A.w] : [0, A.h / 2, A.h], thr)
        pos = sn.v
        st.update((doc) => {
          const g = doc.guides.find((x) => x.id === d.id)
          if (g) g.pos = Math.round(pos * 10) / 10
        }, 'guide-' + d.id)
        setHud({ x: sp.x, y: sp.y, t: `${d.axis === 'x' ? 'X' : 'Y'} ${Math.round(pos)}` })
        break
      }
      case 'glyph': {
        const dl = apply(d.Minv, { x: p.x - d.start.x, y: p.y - d.start.y })
        st.updateLayer(d.id, (l) => {
          const t = l as Draft<TextLayer>
          while (t.chars.length < t.text.length) t.chars.push(null)
          for (let i = d.range[0]; i < d.range[1]; i++) {
            const o = d.orig[i]
            t.chars[i] = { ...(t.chars[i] ?? {}), dx: Math.round(o.dx + dl.x), dy: Math.round(o.dy + dl.y) }
          }
        }, 'glyph-move')
        setHud({ x: sp.x, y: sp.y, t: `Δ ${Math.round(dl.x)}, ${Math.round(dl.y)}` })
        break
      }
    }
  }

  function handleDrag(d: Extract<Drag, { kind: 'handle' }>, p: Pt, shift: boolean, sp: Pt) {
    const st = S()
    const lp = apply(inv(d.M), p)
    const b = d.b
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h
    const h = d.h
    if (h.includes('w')) x0 = Math.min(lp.x, x1 - 1)
    if (h.includes('e')) x1 = Math.max(lp.x, x0 + 1)
    if (h.includes('n')) y0 = Math.min(lp.y, y1 - 1)
    if (h.includes('s')) y1 = Math.max(lp.y, y0 + 1)
    const corner = h.length === 2
    const o = d.orig
    const isLine = o.type === 'shape' && o.shape === 'line'
    let fx = (x1 - x0) / Math.max(1, b.w), fy = (y1 - y0) / Math.max(1, b.h)
    if (isLine) fy = 1
    if (shift && (corner || d.mode === 'scale')) {
      const f = corner ? Math.max(fx, fy) : h === 'e' || h === 'w' ? fx : fy
      fx = fy = f
      const nw = b.w * f, nh = b.h * f
      if (h.includes('w')) x0 = x1 - nw; else if (h.includes('e')) x1 = x0 + nw; else { const c = (x0 + x1) / 2; x0 = c - nw / 2; x1 = c + nw / 2 }
      if (h.includes('n')) y0 = y1 - nh; else if (h.includes('s')) y1 = y0 + nh; else { const c = (y0 + y1) / 2; y0 = c - nh / 2; y1 = c + nh / 2 }
    }
    const ncLocal = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
    const C = apply(d.M, ncLocal)
    st.updateLayer(d.id, (l) => {
      if (d.mode === 'scale') {
        l.scaleX = round3(o.scaleX * fx)
        l.scaleY = round3(o.scaleY * fy)
        l.x = C.x - b.W / 2 - (b.x + b.w / 2 - b.W / 2)
        l.y = C.y - b.H / 2 - (b.y + b.h / 2 - b.H / 2)
        return
      }
      if (l.type === 'shape') {
        l.w = Math.max(1, x1 - x0)
        if (!isLine) l.h = Math.max(1, y1 - y0)
        l.x = C.x - l.w / 2
        l.y = C.y - l.h / 2
        return
      }
      const t = l as Draft<TextLayer>
      const ot = o as TextLayer
      if (shift && corner) {
        const f = fx
        t.style.size = Math.max(1, Math.round(ot.style.size * f * 10) / 10)
        t.chars = ot.chars.map((c) => (c && c.size ? { ...c, size: c.size * f } : c)) as Draft<TextLayer>['chars']
        if (!ot.autoWidth) t.w = ot.w * f
        if (ot.fixedHeight) t.h = ot.h * f
        t.x = C.x - (b.W * f) / 2
        t.y = C.y - (b.H * f) / 2
        return
      }
      if (h.includes('e') || h.includes('w')) {
        t.autoWidth = false
        t.w = Math.max(8, x1 - x0)
      }
      if (h.includes('n') || h.includes('s')) {
        t.fixedHeight = true
        t.h = Math.max(8, y1 - y0)
      }
      const nW = h.includes('e') || h.includes('w') ? t.w : b.W
      const nH = h.includes('n') || h.includes('s') ? t.h : b.H
      t.x = C.x - nW / 2 - (h.includes('e') || h.includes('w') ? 0 : ncLocal.x - b.W / 2)
      t.y = C.y - nH / 2 - (h.includes('n') || h.includes('s') ? 0 : ncLocal.y - b.H / 2)
    }, 'handle')
    setHud({ x: sp.x, y: sp.y, t: d.mode === 'scale' ? `${Math.round(o.scaleX * fx * 100)}% × ${Math.round(o.scaleY * fy * 100)}%` : `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}` })
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    setSnaps([])
    setHud(null)
    const st = S()
    if (!d) return
    const sp = local(e)
    if (d.kind === 'guide') {
      const outside = d.axis === 'x' ? sp.x < RULER : sp.y < RULER
      if (outside) {
        st.update((doc) => { doc.guides = doc.guides.filter((g) => g.id !== d.id) })
        if (!d.fromRuler) st.flash('Guide removed')
      }
    }
    if (d.kind === 'textbox') {
      const w = Math.abs(d.cur.x - d.start.x), h = Math.abs(d.cur.y - d.start.y)
      const l = makeText('Type something', Math.min(d.start.x, d.cur.x), Math.min(d.start.y, d.cur.y), { size: 64, weight: 600 })
      if (w > 20) {
        l.autoWidth = false
        l.w = w
        if (h > 20) {
          l.fixedHeight = true
          l.h = h
        }
      } else {
        l.y -= 40
      }
      l.name = 'Text'
      addLayer(l)
      startEditing(l.id, [0, l.text.length])
    }
    if (d.kind === 'shape') {
      const l = st.doc.layers.find((x) => x.id === d.id)
      if (l && l.w < 3 && (l.type !== 'shape' || l.shape !== 'line' || l.w < 3)) {
        st.updateLayer(d.id, (x) => {
          x.w = 200
          if (!(x.type === 'shape' && x.shape === 'line')) x.h = 200
        }, 'shape-draw')
      }
      st.set({ tool: 'select' })
    }
    if (d.kind === 'textsel') focusEditor()
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (S().mode !== 'edit') return
    const sp = local(e)
    const p = toArt(sp.x, sp.y)
    const st = S()
    const hit = (editLayer && pointInPoly(p, layerPoly(editLayer, fv)) ? editLayer : null) ?? hitLayer(st.doc.layers, p, fv)
    if (!hit || hit.type !== 'text') return
    const lay = getLay(hit, fv)
    const idx = indexAt(hit, lay, toLocal(hit, fv, p))
    // select the word
    const t = hit.text
    let a = idx, b = idx
    while (a > 0 && /\S/.test(t[a - 1])) a--
    while (b < t.length && /\S/.test(t[b])) b++
    startEditing(hit.id, [a, b])
  }

  // textarea handlers
  function onTaInput() {
    const ta = taRef.current!
    const st = S()
    if (!st.editing) return
    setText(st.editing, ta.value)
    st.set({ textSel: dirSel(ta) })
  }
  function onTaSelect() {
    const ta = taRef.current!
    if (S().editing) S().set({ textSel: dirSel(ta) })
  }
  function onTaKey(e: React.KeyboardEvent) {
    const st = S()
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Escape') {
      e.preventDefault()
      st.set({ editing: null })
      taRef.current?.blur()
      return
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      e.shiftKey ? st.redo() : st.undo()
      const id = st.editing
      if (id && S().doc.layers.some((l) => l.id === id)) startEditing(id)
      return
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && editLayer) {
      const lay = getLay(editLayer, fv)
      if (lay.path || lay.vertical) return
      e.preventDefault()
      const ta = taRef.current!
      const focus = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd
      const next = lineStep(editLayer, lay, focus, e.key === 'ArrowUp' ? -1 : 1)
      const anchor = e.shiftKey ? (ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart) : next
      setTextSel([anchor, next])
    }
    e.stopPropagation()
  }

  // ---------- render ----------
  const visible = doc.layers.filter((l) => l.visible)
  const cursor =
    drag?.kind === 'pan' || space || tool === 'hand' ? (drag ? 'grabbing' : 'grab')
      : tool === 'type' ? 'text'
      : tool === 'shape' ? 'crosshair'
      : tool === 'rotate' ? 'alias'
      : tool === 'scale' ? 'nwse-resize'
      : tool === 'warp' ? 'ew-resize'
      : tool === 'path' ? 'cell'
      : 'default'

  const bg = A.bg === 'white' ? '#ffffff' : A.bg === 'black' ? '#000000' : A.bg === 'custom' ? A.bgColor : null

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden select-none"
      style={{ cursor, background: 'var(--desk)', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setCursorPt(null)}
      onDoubleClick={onDoubleClick}
      data-testid="workspace"
    >
      <svg className="absolute inset-0" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#ffffff" />
            <rect width="8" height="8" fill="#e6e6e3" />
            <rect x="8" y="8" width="8" height="8" fill="#e6e6e3" />
          </pattern>
        </defs>
        <rect x={panX} y={panY} width={A.w * zoom} height={A.h * zoom} fill={bg ?? 'url(#checker)'} />
        <svg
          id="tl-artboard"
          x={panX}
          y={panY}
          width={A.w * zoom}
          height={A.h * zoom}
          viewBox={`0 0 ${A.w} ${A.h}`}
          overflow="hidden"
          style={{ isolation: 'isolate' }}
        >
          {bg && <rect data-bg="1" width={A.w} height={A.h} fill={bg} />}
          {ready && visible.map((l) => <LayerView key={l.id} l={l} fv={fv} />)}
        </svg>
        <rect x={panX - 0.5} y={panY - 0.5} width={A.w * zoom + 1} height={A.h * zoom + 1} fill="none" stroke="var(--line)" />
        <GridOverlay />
      </svg>
      <Overlay
        drag={drag}
        snaps={snaps}
        hover={hover}
        toScr={toScr}
      />
      {doc.showRulers && <Rulers cursor={cursorPt} />}
      {hud && (
        <div className="pointer-events-none absolute z-20 bg-ink px-1.5 py-0.5 font-mono text-2xs text-paper" style={{ left: hud.x + 14, top: hud.y + 14 }}>
          {hud.t}
        </div>
      )}
      {!ready && <div className="absolute inset-0 grid place-items-center font-mono text-xs text-mute">Loading typefaces…</div>}
      <textarea
        ref={taRef}
        aria-label="Edit text"
        className="fixed left-0 top-0 h-px w-px opacity-0"
        style={{ pointerEvents: 'none', whiteSpace: 'pre', overflow: 'hidden' }}
        wrap="off"
        onInput={onTaInput}
        onSelect={onTaSelect}
        onKeyUp={onTaSelect}
        onKeyDown={onTaKey}
        onBlur={() => {
          setTimeout(() => {
            const st = S()
            if (st.editing && document.activeElement !== taRef.current && !(document.activeElement as HTMLElement)?.closest?.('[data-keep-edit]')) {
              /* keep editing state; inspector may be focused */
            }
          }, 0)
        }}
        spellCheck={false}
      />
    </div>
  )

  function GridOverlay() {
    const g = doc.grid
    const bl = doc.baseline
    if (!g.show && !bl.show) return null
    const { xs, ys } = gridLines(doc)
    const cols: React.ReactNode[] = []
    if (g.show && g.type === 'uniform') {
      // square grid; fade out when cells get too small on screen, every 8th line stronger
      const cellPx = g.size * zoom
      const step = cellPx < 4 ? Math.ceil(4 / cellPx) : 1
      const path = (major: boolean) => {
        let d = ''
        xs.forEach((x, i) => { if (i % step === 0 && ((i % 8 === 0) === major)) d += `M${x} 0V${A.h}` })
        ys.forEach((y, i) => { if (i % step === 0 && ((i % 8 === 0) === major)) d += `M0 ${y}H${A.w}` })
        return d
      }
      cols.push(<path key="minor" d={path(false)} stroke={g.color} strokeOpacity={0.13} vectorEffect="non-scaling-stroke" fill="none" />)
      cols.push(<path key="major" d={path(true)} stroke={g.color} strokeOpacity={0.32} vectorEffect="non-scaling-stroke" fill="none" />)
    } else if (g.show) {
      for (let i = 0; i < xs.length; i += 2) cols.push(<rect key={'c' + i} x={xs[i]} y={0} width={xs[i + 1] - xs[i]} height={A.h} fill={g.color} opacity={0.07} />)
      for (let i = 0; i < ys.length; i += 2) cols.push(<rect key={'r' + i} x={0} y={ys[i]} width={A.w} height={ys[i + 1] - ys[i]} fill={g.color} opacity={0.05} />)
      cols.push(<rect key="m" x={g.margin} y={g.margin} width={Math.max(0, A.w - 2 * g.margin)} height={Math.max(0, A.h - 2 * g.margin)} fill="none" stroke={g.color} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />)
    }
    const lines: React.ReactNode[] = []
    if (bl.show && bl.size >= 2) for (let y = bl.offset, k = 0; y <= A.h && k < 2000; y += bl.size, k++) lines.push(<line key={k} x1={0} x2={A.w} y1={y} y2={y} stroke="#00a2ff" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />)
    return (
      <g transform={`translate(${panX} ${panY}) scale(${zoom})`} pointerEvents="none">
        {cols}
        {lines}
      </g>
    )
  }
}

function Overlay({ drag, snaps, hover, toScr }: { drag: Drag | null; snaps: SnapLine[]; hover: string | null; toScr: (p: Pt) => Pt }) {
  const doc = useStore((s) => s.doc)
  const sel = useStore((s) => s.sel)
  const tool = useStore((s) => s.tool)
  const editing = useStore((s) => s.editing)
  const textSel = useStore((s) => s.textSel)
  const charMode = useStore((s) => s.charMode)
  const view = useStore((s) => s.view)
  const fv = useFonts((s) => s.version)
  const A = doc.artboard
  const selLayers = doc.layers.filter((l) => sel.includes(l.id) && l.visible)
  const polyStr = (poly: Pt[]) => poly.map((p) => { const s = toScr(p); return `${s.x},${s.y}` }).join(' ')
  const nodes: React.ReactNode[] = []

  // guides
  if (doc.showGuides)
    doc.guides.forEach((g) => {
      const a = toScr({ x: g.axis === 'x' ? g.pos : 0, y: g.axis === 'y' ? g.pos : 0 })
      const line = g.axis === 'x' ? { x1: a.x, x2: a.x, y1: -10000, y2: 10000 } : { x1: -10000, x2: 10000, y1: a.y, y2: a.y }
      nodes.push(
        <g key={'g' + g.id}>
          <line {...line} stroke="#00b3ff" strokeWidth={1} />
          {!doc.guidesLocked && (
            <line {...line} stroke="transparent" strokeWidth={7} data-guide={g.id} style={{ cursor: g.axis === 'x' ? 'ew-resize' : 'ns-resize', pointerEvents: 'stroke' }} />
          )}
        </g>,
      )
    })

  // hover outline
  if (hover && !sel.includes(hover) && !drag) {
    const l = doc.layers.find((x) => x.id === hover)
    if (l) nodes.push(<polygon key="hov" points={polyStr(layerPoly(l, fv))} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.6} />)
  }

  // selection
  selLayers.forEach((l) => {
    nodes.push(<polygon key={'s' + l.id} points={polyStr(layerPoly(l, fv))} fill="none" stroke="var(--accent)" strokeWidth={1} />)
  })
  if (selLayers.length > 1) {
    const b = aabb(selLayers.map((l) => layerPoly(l, fv)))
    nodes.push(
      <rect key="multi" x={toScr(b).x} y={toScr(b).y} width={b.w * view.zoom} height={b.h * view.zoom} fill="none" stroke="var(--accent)" strokeDasharray="3 3" />,
    )
  }

  // text edit caret / selection, char mode boxes
  const tl = (editing ? doc.layers.find((l) => l.id === editing) : charMode && selLayers.length === 1 ? selLayers[0] : null) as TextLayer | null
  if (tl && tl.type === 'text') {
    const lay = getLay(tl, fv)
    const M = layerM(tl, fv)
    const polys = glyphPolys(tl, lay)
    const [a, b] = [Math.min(...textSel), Math.max(...textSel)]
    const art = (poly: Pt[]) => poly.map((p) => apply(M, p))
    if (charMode && !editing)
      polys.forEach((p, k) => {
        if (!p || lay.glyphs[k].space) return
        const g = lay.glyphs[k]
        const on = g.i >= a && g.i < b
        nodes.push(<polygon key={'cg' + k} points={polyStr(art(p))} fill={on ? 'rgba(43,43,255,0.14)' : 'none'} stroke="var(--accent)" strokeWidth={on ? 1.25 : 0.6} strokeOpacity={on ? 1 : 0.35} />)
      })
    if (editing) {
      if (a !== b)
        polys.forEach((p, k) => {
          const g = lay.glyphs[k]
          if (p && g.i >= a && g.i < b) nodes.push(<polygon key={'ts' + k} points={polyStr(art(p))} fill="rgba(43,43,255,0.22)" />)
        })
      else {
        const [p1, p2] = caretAt(tl, lay, textSel[1])
        const s1 = toScr(apply(M, p1)), s2 = toScr(apply(M, p2))
        nodes.push(<line key="caret" className="tl-caret" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="var(--accent)" strokeWidth={2} />)
      }
    }
  }

  // handles
  if (selLayers.length === 1 && !editing && !selLayers[0].locked && (tool === 'select' || tool === 'scale' || tool === 'type' || tool === 'rotate')) {
    const l = selLayers[0]
    const b = localBounds(l, fv)
    const M = layerM(l, fv)
    const pts: Record<string, Pt> = {
      nw: { x: b.x, y: b.y }, n: { x: b.x + b.w / 2, y: b.y }, ne: { x: b.x + b.w, y: b.y }, e: { x: b.x + b.w, y: b.y + b.h / 2 },
      se: { x: b.x + b.w, y: b.y + b.h }, s: { x: b.x + b.w / 2, y: b.y + b.h }, sw: { x: b.x, y: b.y + b.h }, w: { x: b.x, y: b.y + b.h / 2 },
    }
    const isLine = l.type === 'shape' && l.shape === 'line'
    const rotDeg = l.rotation
    ;(['nw', 'ne', 'se', 'sw'] as const).forEach((h) => {
      const s = toScr(apply(M, pts[h]))
      nodes.push(<circle key={'r' + h} cx={s.x} cy={s.y} r={16} fill="transparent" data-h="rot" style={{ cursor: 'grab' }} />)
    })
    HANDLES.forEach((h) => {
      if (isLine && h !== 'e' && h !== 'w') return
      const s = toScr(apply(M, pts[h]))
      const sq = tool === 'scale'
      nodes.push(
        <rect key={h} x={s.x - 4} y={s.y - 4} width={8} height={8} fill={sq ? 'var(--accent)' : '#fff'} stroke="var(--accent)" strokeWidth={1} data-h={h}
          style={{ cursor: rotCursor(HCURSOR[h], rotDeg) }} transform={`rotate(${rotDeg} ${s.x} ${s.y})`} />,
      )
    })
  }

  // marquee / textbox preview
  if (drag?.kind === 'marquee' || drag?.kind === 'textbox') {
    const a = toScr(drag.start), c = toScr(drag.cur)
    nodes.push(<rect key="mq" x={Math.min(a.x, c.x)} y={Math.min(a.y, c.y)} width={Math.abs(c.x - a.x)} height={Math.abs(c.y - a.y)} fill="rgba(43,43,255,0.06)" stroke="var(--accent)" strokeDasharray={drag.kind === 'textbox' ? '4 3' : undefined} />)
  }

  // snap lines
  snaps.forEach((s, i) => {
    const p = toScr({ x: s.axis === 'x' ? s.pos : 0, y: s.axis === 'y' ? s.pos : 0 })
    const q = toScr({ x: s.axis === 'x' ? s.pos : A.w, y: s.axis === 'y' ? s.pos : A.h })
    nodes.push(<line key={'sn' + i} x1={s.axis === 'x' ? p.x : p.x - 20} x2={s.axis === 'x' ? p.x : q.x + 20} y1={s.axis === 'y' ? p.y : p.y - 20} y2={s.axis === 'y' ? p.y : q.y + 20} stroke="#ff2d6f" strokeWidth={1} />)
  })

  return (
    <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <g style={{ pointerEvents: 'auto' }}>{nodes}</g>
    </svg>
  )
}

const rotCursor = (c: string, deg: number) => {
  const order = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
  const i = order.indexOf(c)
  if (i < 0) return c
  const step = Math.round((((deg % 180) + 180) % 180) / 45)
  return order[(i + step) % 4]
}
const norm = (a: number) => {
  let r = a % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return Math.round(r * 10) / 10
}
const round3 = (v: number) => Math.round(v * 1000) / 1000
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const dirSel = (ta: HTMLTextAreaElement): [number, number] =>
  ta.selectionDirection === 'backward' ? [ta.selectionEnd, ta.selectionStart] : [ta.selectionStart, ta.selectionEnd]
export function isTyping(e: Event) {
  const t = e.target as HTMLElement
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
