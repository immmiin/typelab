import { useState } from 'react'
import { useStore, S, addLayer, deleteSelected, duplicateSelected, groupSelected, ungroupSelected } from '../store'
import { makeText } from '../defaults'
import type { Layer } from '../types'
import { Icon } from '../ui/icons'
import { getFont } from '../fonts/registry'
import { startEditing } from '../canvas/Workspace'

function RenameInput({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value)
  return (
    <input
      autoFocus
      aria-label="Layer name"
      className="h-5 min-w-0 flex-1 border border-accent bg-paper px-1 text-2xs outline-none"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onDone(v)
        if (e.key === 'Escape') onDone(null)
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

export function LayersPanel() {
  const layers = useStore((s) => s.doc.layers)
  const groups = useStore((s) => s.doc.groups)
  const sel = useStore((s) => s.sel)
  const update = useStore((s) => s.update)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const top = [...layers].reverse()
  const click = (l: Layer, e: React.MouseEvent) => {
    const s = S()
    if (e.shiftKey || e.metaKey || e.ctrlKey) s.setSel(s.sel.includes(l.id) ? s.sel.filter((x) => x !== l.id) : [...s.sel, l.id])
    else s.setSel([l.id])
  }
  const drop = (targetTopIdx: number) => {
    if (!dragId) return
    update((d) => {
      const from = d.layers.findIndex((x) => x.id === dragId)
      if (from < 0) return
      // row i (top-first) = index N-1-i; dropping on a row inserts above it
      let idx = d.layers.length - targetTopIdx
      const [item] = d.layers.splice(from, 1)
      if (from < idx) idx -= 1
      idx = Math.max(0, Math.min(d.layers.length, idx))
      d.layers.splice(idx, 0, item)
      const above = d.layers[idx + 1], below = d.layers[idx - 1]
      if (item.groupId && above?.groupId !== item.groupId && below?.groupId !== item.groupId) item.groupId = null
      else if (!item.groupId && above?.groupId && above.groupId === below?.groupId) item.groupId = above.groupId
    })
    setDragId(null)
    setOverIdx(null)
  }

  const rows: React.ReactNode[] = []
  let lastGroup: string | null = null
  top.forEach((l, i) => {
    if (l.groupId && l.groupId !== lastGroup && groups[l.groupId]) {
      const gid = l.groupId
      const members = layers.filter((x) => x.groupId === gid)
      const allSel = members.every((m) => sel.includes(m.id))
      const anyVisible = members.some((m) => m.visible)
      const allLocked = members.every((m) => m.locked)
      rows.push(
        <div key={'g' + gid + i} className={`group flex h-7 items-center gap-1 border-b border-hair pl-1 pr-1.5 ${allSel ? 'bg-ink text-paper' : 'hover:bg-hover'}`} onClick={() => S().setSel(members.map((m) => m.id))} onDoubleClick={() => setRenaming('g:' + gid)}>
          <button className="w-4 text-[10px]" aria-label="Collapse group" onClick={(e) => { e.stopPropagation(); setCollapsed({ ...collapsed, [gid]: !collapsed[gid] }) }}>{collapsed[gid] ? '▸' : '▾'}</button>
          <Icon name="group" size={12} />
          {renaming === 'g:' + gid ? (
            <RenameInput value={groups[gid].name} onDone={(v) => { if (v) update((d) => { d.groups[gid].name = v }); setRenaming(null) }} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-2xs font-semibold">{groups[gid].name}</span>
          )}
          <button aria-label="Toggle group visibility" className="opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); update((d) => d.layers.forEach((x) => { if (x.groupId === gid) x.visible = !anyVisible })) }}>
            <Icon name={anyVisible ? 'eye' : 'eyeOff'} size={12} />
          </button>
          <button aria-label="Toggle group lock" className="opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); update((d) => d.layers.forEach((x) => { if (x.groupId === gid) x.locked = !allLocked })) }}>
            <Icon name={allLocked ? 'lock' : 'unlock'} size={12} />
          </button>
        </div>,
      )
    }
    lastGroup = l.groupId
    if (l.groupId && collapsed[l.groupId]) return
    const isSel = sel.includes(l.id)
    const font = l.type === 'text' ? getFont(l.style.fontId) : null
    rows.push(
      <div
        key={l.id}
        draggable={renaming !== l.id}
        onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id) }}
        onDragOver={(e) => { e.preventDefault(); setOverIdx(i) }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(i) }}
        onDragEnd={() => { setDragId(null); setOverIdx(null) }}
        onClick={(e) => click(l, e)}
        onDoubleClick={() => setRenaming(l.id)}
        data-testid={`layer-row-${l.name}`}
        className={`group relative flex h-7 cursor-default items-center gap-1.5 border-b border-hair pr-1.5 ${l.groupId ? 'pl-6' : 'pl-2'} ${isSel ? 'bg-ink text-paper' : 'hover:bg-hover'} ${!l.visible ? 'opacity-50' : ''}`}
      >
        {overIdx === i && dragId && dragId !== l.id && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
        <span className="grid w-4 place-items-center">
          {l.type === 'text' ? (
            <span className="text-[11px] leading-none" style={{ fontFamily: `"${font!.css}"`, fontWeight: 700 }}>T</span>
          ) : (
            <Icon name={l.shape === 'ellipse' ? 'ellipse' : l.shape === 'line' ? 'line' : 'rect'} size={12} />
          )}
        </span>
        {renaming === l.id ? (
          <RenameInput value={l.name} onDone={(v) => { if (v) update((d) => { const x = d.layers.find((q) => q.id === l.id); if (x) x.name = v }); setRenaming(null) }} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-2xs">{l.name}</span>
        )}
        {l.type === 'text' && (l.repeat.mode !== 'none' || l.path.enabled) && (
          <span className={`font-mono text-[8px] ${isSel ? 'text-paper/70' : 'text-accent'}`}>{l.path.enabled ? 'PATH' : 'RPT'}</span>
        )}
        <button aria-label={l.visible ? 'Hide layer' : 'Show layer'} data-tip={l.visible ? 'Hide' : 'Show'} className={`${l.visible ? 'opacity-0 group-hover:opacity-70' : 'opacity-100'} hover:!opacity-100`} onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.layers.find((q) => q.id === l.id); if (x) x.visible = !x.visible }) }}>
          <Icon name={l.visible ? 'eye' : 'eyeOff'} size={12} />
        </button>
        <button aria-label={l.locked ? 'Unlock layer' : 'Lock layer'} data-tip={l.locked ? 'Unlock' : 'Lock'} className={`${l.locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'} hover:!opacity-100`} onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.layers.find((q) => q.id === l.id); if (x) x.locked = !x.locked }) }}>
          <Icon name={l.locked ? 'lock' : 'unlock'} size={12} />
        </button>
      </div>,
    )
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="layers">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em]">Layers <span className="font-mono font-normal text-faint">{layers.length}</span></span>
        <div className="flex items-center gap-0.5">
          <IconBtn name="plus" tip="New text layer" onClick={() => {
            const A = S().doc.artboard
            const l = makeText('New text', A.w / 2 - 150, A.h / 2 - 40, { size: 72, weight: 600 })
            l.name = 'Text'
            addLayer(l)
            startEditing(l.id, [0, l.text.length])
          }} />
          <IconBtn name="copy" tip="Duplicate (⌘D)" onClick={duplicateSelected} disabled={!sel.length} />
          <IconBtn name="group" tip="Group (⌘G)" onClick={groupSelected} disabled={sel.length < 2} />
          <IconBtn name="ungroup" tip="Ungroup (⇧⌘G)" onClick={ungroupSelected} disabled={!sel.length} />
          <IconBtn name="trash" tip="Delete (⌫)" onClick={deleteSelected} disabled={!sel.length} />
        </div>
      </div>
      <div className="tl-scroll min-h-0 flex-1 overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(top.length)}>
        {rows}
        {!layers.length && <p className="p-3 text-[10px] text-mute">No layers. Press T and click the artboard.</p>}
      </div>
    </div>
  )
}

function IconBtn({ name, tip, onClick, disabled }: { name: string; tip: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={tip} data-tip={tip} disabled={disabled} onClick={onClick} className="grid h-6 w-6 place-items-center text-ink hover:bg-hover disabled:opacity-25">
      <Icon name={name} size={13} />
    </button>
  )
}
