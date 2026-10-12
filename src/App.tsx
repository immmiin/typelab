import { useEffect, useState } from 'react'
import { useStore, S, deleteSelected, duplicateSelected, groupSelected, ungroupSelected } from './store'
import { initFonts, uploadFontFiles, useFonts } from './fonts/registry'
import { Workspace, fitView, startEditing, zoomBy, isTyping } from './canvas/Workspace'
import { Inspector } from './panels/Inspector'
import { LayersPanel } from './panels/LayersPanel'
import { InfoPanel } from './panels/InfoPanel'
import { StatusBar, Toolbar, TopBar, toolSelect } from './panels/Chrome'
import { GlyphPanel, ShortcutsModal } from './panels/Modals'
import { SpecimenView } from './modes/SpecimenView'
import { CompareView } from './modes/CompareView'
import { nudge, reorder } from './actions'
import { invalidateLayouts } from './engine/layout'
import { Tooltips } from './ui/Tooltips'

export default function App() {
  const mode = useStore((s) => s.mode)
  const leftOpen = useStore((s) => s.leftOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const toast = useStore((s) => s.toast)
  const [dropping, setDropping] = useState(false)
  const ready = useFonts((s) => s.ready)

  useEffect(() => {
    initFonts().then(() => {
      invalidateLayouts()
      // open on a useful state: the topmost text layer is ready to edit
      const st = S()
      if (!st.sel.length) {
        const t = [...st.doc.layers].reverse().find((l) => l.type === 'text' && l.visible && !l.locked && l.name === 'Headline') ?? [...st.doc.layers].reverse().find((l) => l.type === 'text' && l.visible && !l.locked)
        if (t) st.set({ sel: [t.id] })
      }
    })
    // responsive defaults
    const w = window.innerWidth
    S().set({ leftOpen: w >= 1280, rightOpen: w >= 1024 })
    // re-layout when the font set changes
    let v = useFonts.getState().version
    return useFonts.subscribe((s) => {
      if (s.version !== v) {
        v = s.version
        invalidateLayouts()
      }
    })
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = S()
      if (isTyping(e)) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (e.key === '?' || (mod && k === '/')) {
        e.preventDefault()
        return s.set({ showShortcuts: !s.showShortcuts })
      }
      if (e.key === 'Escape') {
        if (s.showShortcuts) return s.set({ showShortcuts: false })
        if (s.showGlyphs) return s.set({ showGlyphs: false })
        if (s.charMode && s.textSel[0] !== s.textSel[1]) return s.set({ textSel: [0, 0] })
        return s.set({ sel: [], editing: null })
      }
      if (s.mode !== 'edit') return
      if (mod && k === 'z') {
        e.preventDefault()
        return e.shiftKey ? s.redo() : s.undo()
      }
      if (mod && k === 'y') { e.preventDefault(); return s.redo() }
      if (mod && k === 'd') { e.preventDefault(); return duplicateSelected() }
      if (mod && k === 'g') { e.preventDefault(); return e.shiftKey ? ungroupSelected() : groupSelected() }
      if (mod && k === 'a') {
        e.preventDefault()
        return s.setSel(s.doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id))
      }
      if (mod && k === '0') { e.preventDefault(); return fitView() }
      if (mod && k === '1') { e.preventDefault(); return zoomBy(1 / s.view.zoom) }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); return zoomBy(1.25) }
      if (mod && k === '-') { e.preventDefault(); return zoomBy(0.8) }
      if (mod && e.key === ']') { e.preventDefault(); return reorder(1) }
      if (mod && e.key === '[') { e.preventDefault(); return reorder(-1) }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSelected() }
      if (e.key === 'Enter') {
        const l = s.doc.layers.find((x) => x.id === s.sel[0])
        if (l?.type === 'text') { e.preventDefault(); return startEditing(l.id, [0, l.text.length]) }
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        return nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)
      }
      if (mod || e.altKey) return
      const map: Record<string, Parameters<typeof toolSelect>[0]> = { v: 'select', t: 'type', r: 'rotate', s: 'scale', w: 'warp', p: 'path', u: 'shape', g: 'grid', h: 'hand' }
      if (map[k]) return toolSelect(map[k])
      if (k === 'c') return s.set({ charMode: !s.charMode, tool: 'select', editing: null, tab: 'type', openSection: { ...s.openSection, character: true } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // drag & drop font files
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDropping(true)
      }
    }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDropping(false) }
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      setDropping(false)
      const ids = await uploadFontFiles(e.dataTransfer.files)
      if (ids.length) S().flash(`Added ${ids.length} font${ids.length > 1 ? 's' : ''} — see Font Browser › Uploaded`)
      else S().flash(useFonts.getState().error ?? 'No font files found')
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  if (!ready)
    return (
      <div className="grid h-full place-items-center bg-paper">
        <div className="text-center">
          <div className="text-[44px] font-black tracking-[-0.03em]">TYPE LAB</div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">Loading 23 typefaces…</div>
        </div>
      </div>
    )
  return (
    <div className="flex h-full flex-col bg-paper font-ui text-ink">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        {mode === 'edit' ? (
          <>
            <Toolbar />
            <div className={`${leftOpen ? 'flex' : 'hidden'} absolute bottom-0 left-11 top-0 z-30 w-[236px] shrink-0 flex-col border-r border-line bg-panel shadow-[8px_0_24px_rgba(0,0,0,0.06)] xl:relative xl:left-0 xl:flex xl:shadow-none`}>
              <LayersPanel />
              <InfoPanel />
            </div>
            <main className="relative min-w-0 flex-1">
              <Workspace />
              <GlyphPanel />
            </main>
            <div className={`${rightOpen ? 'flex' : 'hidden'} absolute bottom-0 right-0 top-0 z-30 w-[304px] max-w-[calc(100vw-44px)] shrink-0 border-l border-line bg-panel shadow-[-8px_0_24px_rgba(0,0,0,0.06)] lg:relative lg:flex lg:shadow-none`}>
              <Inspector />
            </div>
          </>
        ) : mode === 'specimen' ? (
          <main className="min-w-0 flex-1"><SpecimenView /></main>
        ) : (
          <main className="min-w-0 flex-1"><CompareView /></main>
        )}
      </div>
      <StatusBar />
      <ShortcutsModal />
      <Tooltips />
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-[200] -translate-x-1/2 bg-ink px-3 py-1.5 font-mono text-[11px] text-paper" role="status">
          {toast}
        </div>
      )}
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-[300] grid place-items-center bg-accent/10">
          <div className="border-2 border-dashed border-accent bg-paper px-8 py-6 text-center">
            <div className="font-mark text-3xl font-black" style={{ fontVariationSettings: '"wdth" 62, "wght" 900' }}>DROP FONT FILES</div>
            <div className="mt-1 font-mono text-[11px] text-mute">TTF · OTF · WOFF · WOFF2</div>
          </div>
        </div>
      )}
    </div>
  )
}
