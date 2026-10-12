import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { PER_UNIT } from '../units'
import type { Pt } from '../engine/geom'

export const RULER = 20
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]

function draw(cv: HTMLCanvasElement, axis: 'x' | 'y', zoom: number, pan: number, unit: keyof typeof PER_UNIT, len: number, cursor: number | null, artLen: number) {
  const dpr = window.devicePixelRatio || 1
  const w = axis === 'x' ? len : RULER
  const h = axis === 'x' ? RULER : len
  cv.width = w * dpr
  cv.height = h * dpr
  cv.style.width = w + 'px'
  cv.style.height = h + 'px'
  const c = cv.getContext('2d')!
  c.scale(dpr, dpr)
  c.fillStyle = '#f4f4f1'
  c.fillRect(0, 0, w, h)
  const per = PER_UNIT[unit] * zoom // screen px per unit
  const step = NICE.find((n) => n * per >= 56) ?? 5000
  const minor = step / (step % 5 === 0 ? 5 : step % 2 === 0 ? 2 : 1)
  // artboard extent highlight
  c.fillStyle = '#ffffff'
  const a0 = pan, a1 = pan + artLen * zoom
  if (axis === 'x') c.fillRect(a0, 0, a1 - a0, RULER)
  else c.fillRect(0, a0, RULER, a1 - a0)
  c.strokeStyle = '#9a9a94'
  c.fillStyle = '#6b6b66'
  c.font = '9px "tl-jetbrains", ui-monospace, monospace'
  c.lineWidth = 1
  const startU = Math.floor(-pan / per / minor) * minor
  const endU = (len - pan) / per
  c.beginPath()
  for (let u = startU; u <= endU; u += minor) {
    const s = Math.round(pan + u * per) + 0.5
    const major = Math.abs(u / step - Math.round(u / step)) < 1e-6
    const tick = major ? RULER : RULER * 0.3
    if (axis === 'x') {
      c.moveTo(s, RULER)
      c.lineTo(s, RULER - tick)
    } else {
      c.moveTo(RULER, s)
      c.lineTo(RULER - tick, s)
    }
    if (major) {
      const label = String(Math.round(u * 100) / 100)
      if (axis === 'x') c.fillText(label, s + 3, 9)
      else {
        c.save()
        c.translate(9, s + 3)
        c.rotate(-Math.PI / 2)
        c.textAlign = 'right'
        c.fillText(label, 0, 0)
        c.restore()
      }
    }
  }
  c.stroke()
  c.strokeStyle = '#d6d6d0'
  c.beginPath()
  if (axis === 'x') { c.moveTo(0, RULER - 0.5); c.lineTo(w, RULER - 0.5) } else { c.moveTo(RULER - 0.5, 0); c.lineTo(RULER - 0.5, h) }
  c.stroke()
  if (cursor !== null) {
    c.strokeStyle = '#2b2bff'
    c.beginPath()
    const s = Math.round(pan + cursor * zoom) + 0.5
    if (axis === 'x') { c.moveTo(s, 0); c.lineTo(s, RULER) } else { c.moveTo(0, s); c.lineTo(RULER, s) }
    c.stroke()
  }
}

export function Rulers({ cursor }: { cursor: Pt | null }) {
  const top = useRef<HTMLCanvasElement>(null)
  const left = useRef<HTMLCanvasElement>(null)
  const view = useStore((s) => s.view)
  const vp = useStore((s) => s.viewport)
  const unit = useStore((s) => s.doc.unit)
  const art = useStore((s) => s.doc.artboard)
  useEffect(() => {
    if (top.current) draw(top.current, 'x', view.zoom, view.panX, unit, vp.w, cursor?.x ?? null, art.w)
    if (left.current) draw(left.current, 'y', view.zoom, view.panY, unit, vp.h, cursor?.y ?? null, art.h)
  }, [view, vp, unit, cursor, art.w, art.h])
  return (
    <>
      <canvas ref={top} data-ruler="top" className="absolute left-0 top-0 z-10" style={{ cursor: 'ns-resize' }} title="Drag down to add a horizontal guide" />
      <canvas ref={left} data-ruler="left" className="absolute left-0 top-0 z-10" style={{ cursor: 'ew-resize' }} title="Drag right to add a vertical guide" />
      <div className="absolute left-0 top-0 z-10 grid place-items-center border-b border-r border-line bg-[#f4f4f1] font-mono text-[8px] uppercase text-mute" style={{ width: RULER, height: RULER }}>
        {unit}
      </div>
    </>
  )
}
