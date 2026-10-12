import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { hexToRgb, hslToRgb, hsvToRgb, isHex, normHex, rgbToHex, rgbToHsl, rgbToHsv } from './color'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const roundTo = (v: number, step: number) => {
  const d = step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0
  return Number((Math.round(v / step) * step).toFixed(d))
}

export function Section({ id, title, children, right, defaultOpen = true, badge }: { id: string; title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const open = useStore((s) => s.openSection[id] ?? defaultOpen)
  const set = useStore((s) => s.set)
  const os = useStore((s) => s.openSection)
  return (
    <section className="border-b border-line" data-section={id}>
      <div className="flex h-8 items-center gap-2 px-3">
        <button
          className="flex flex-1 items-center gap-2 text-left text-2xs font-semibold uppercase tracking-[0.14em] text-ink"
          onClick={() => set({ openSection: { ...os, [id]: !open } })}
          aria-expanded={open}
        >
          <span className={`inline-block w-2 text-mute transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          {title}
          {badge}
        </button>
        {right}
      </div>
      {open && <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>}
    </section>
  )
}

export function Label({ children, tip, w = 'w-[70px]' }: { children: ReactNode; tip?: string; w?: string }) {
  return (
    <span className={`${w} shrink-0 truncate text-2xs text-mute`} data-tip={tip}>
      {children}
    </span>
  )
}

export function Slider({ value, min, max, step, onChange, disabled, ariaLabel }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const frac = clamp((value - min) / (max - min || 1), 0, 1)
  const zeroFrac = min < 0 && max > 0 ? -min / (max - min) : 0
  const setFrom = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const f = clamp((clientX - r.left) / r.width, 0, 1)
    onChange(roundTo(min + f * (max - min), step))
  }
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={disabled ? -1 : 0}
      className={`tl-slider relative h-5 min-w-0 flex-1 ${disabled ? 'pointer-events-none opacity-30' : 'cursor-ew-resize'}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setFrom(e.clientX)
      }}
      onPointerMove={(e) => e.buttons === 1 && setFrom(e.clientX)}
      onKeyDown={(e) => {
        const k = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onChange(clamp(roundTo(value + step * k, step), min, max)); e.preventDefault() }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onChange(clamp(roundTo(value - step * k, step), min, max)); e.preventDefault() }
      }}
    >
      <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
      <div className="absolute top-1/2 h-[2px] -translate-y-[0.5px] bg-ink" style={{ left: `${Math.min(frac, zeroFrac) * 100}%`, width: `${Math.abs(frac - zeroFrac) * 100}%` }} />
      <div className="tl-thumb absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 border border-ink bg-paper" style={{ left: `${frac * 100}%` }} />
    </div>
  )
}

export function NumInput({ value, onChange, step = 1, min = -Infinity, max = Infinity, suffix, w = 'w-[54px]', disabled, ariaLabel }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; w?: string; disabled?: boolean; ariaLabel?: string }) {
  const [txt, setTxt] = useState<string | null>(null)
  const shown = txt ?? String(roundTo(value, step < 1 ? step : step >= 1 ? 1 : step))
  const commit = (s: string) => {
    // allow simple math: 12*2, 100/3
    let v = Number(s)
    if (isNaN(v) && /^[\d.+\-*/() ]+$/.test(s)) {
      try {
        v = Function(`"use strict";return (${s})`)() as number
      } catch {
        v = NaN
      }
    }
    if (!isNaN(v)) onChange(clamp(v, min, max))
    setTxt(null)
  }
  return (
    <label className={`tl-num relative flex h-[22px] ${w} shrink-0 items-center border border-transparent bg-hover px-1 focus-within:border-accent ${disabled ? 'opacity-40' : ''}`}>
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        className="w-full min-w-0 bg-transparent text-right font-mono text-2xs tabular-nums text-ink outline-none"
        value={shown}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setTxt(null); (e.target as HTMLInputElement).blur() }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const k = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1)
            onChange(clamp(roundTo(value + k, Math.min(step, e.altKey ? step / 10 : step)), min, max))
            setTxt(null)
          }
          e.stopPropagation()
        }}
      />
      {suffix && <span className="pointer-events-none pl-0.5 font-mono text-[9px] text-faint">{suffix}</span>}
    </label>
  )
}

/** Label (scrubbable) + slider + number input */
export function NumField({ label, value, onChange, min = 0, max = 100, step = 1, smin, smax, suffix, tip, disabled, slider = true, compact = false }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; smin?: number; smax?: number; suffix?: string; tip?: string; disabled?: boolean; slider?: boolean; compact?: boolean
}) {
  const scrub = useRef<{ x: number; v: number } | null>(null)
  const lo = smin ?? min, hi = smax ?? max
  const scrubProps = {
    onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => {
      if (disabled) return
      e.currentTarget.setPointerCapture(e.pointerId)
      scrub.current = { x: e.clientX, v: value }
    },
    onPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!scrub.current) return
      const dx = e.clientX - scrub.current.x
      const per = (hi - lo) / 240
      onChange(clamp(roundTo(scrub.current.v + dx * Math.max(step, per) * (e.shiftKey ? 10 : 1), step), min, max))
    },
    onPointerUp: () => (scrub.current = null),
  }
  if (compact)
    return (
      <div className={`flex min-w-0 flex-col ${disabled ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 cursor-ew-resize truncate text-2xs text-mute hover:text-ink" data-tip={tip ?? 'Drag to scrub · Shift ×10'} {...scrubProps}>{label}</span>
          <NumInput value={value} onChange={onChange} step={step} min={min} max={max} suffix={suffix} disabled={disabled} ariaLabel={label} w="w-[64px]" />
        </div>
        {slider && <div className="-mt-0.5 flex"><Slider value={value} min={lo} max={hi} step={step} onChange={onChange} disabled={disabled} ariaLabel={label} /></div>}
      </div>
    )
  return (
    <div className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <span
        className="w-[70px] shrink-0 cursor-ew-resize truncate text-2xs text-mute hover:text-ink"
        data-tip={tip ?? 'Drag to scrub · Shift ×10'}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          scrub.current = { x: e.clientX, v: value }
        }}
        onPointerMove={(e) => {
          if (!scrub.current) return
          const dx = e.clientX - scrub.current.x
          const k = e.shiftKey ? 10 : 1
          const per = (hi - lo) / 240
          const nv = clamp(roundTo(scrub.current.v + dx * Math.max(step, per) * k * (step < 1 && per < step ? 1 : 1), step), min, max)
          onChange(nv)
        }}
        onPointerUp={() => (scrub.current = null)}
      >
        {label}
      </span>
      {slider ? <Slider value={value} min={lo} max={hi} step={step} onChange={onChange} disabled={disabled} ariaLabel={label} /> : <div className="flex-1" />}
      <NumInput value={value} onChange={onChange} step={step} min={min} max={max} suffix={suffix} disabled={disabled} ariaLabel={label} />
    </div>
  )
}

export function Seg<T extends string | number>({ value, options, onChange, full = true, size = 'md' }: { value: T; options: { v: T; label: ReactNode; tip?: string }[]; onChange: (v: T) => void; full?: boolean; size?: 'sm' | 'md' }) {
  return (
    <div className={`flex ${full ? 'w-full' : ''} border border-line`} role="radiogroup">
      {options.map((o, i) => (
        <button
          key={String(o.v)}
          role="radio"
          aria-checked={value === o.v}
          data-tip={o.tip}
          className={`${size === 'sm' ? 'h-[20px] text-[9.5px]' : 'h-[24px] text-2xs'} flex-1 px-1.5 ${i ? 'border-l border-line' : ''} ${value === o.v ? 'bg-ink text-paper' : 'text-ink hover:bg-hover'}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, children, tip, disabled, className = '' }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; tip?: string; disabled?: boolean; className?: string }) {
  return (
    <button
      data-tip={tip}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex h-[24px] items-center justify-center border px-2 text-2xs ${on ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:border-ink'} ${disabled ? 'cursor-not-allowed opacity-30 hover:border-line' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function Check({ on, onChange, label, tip, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; tip?: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-2xs ${disabled ? 'opacity-40' : ''}`} data-tip={tip}>
      <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`grid h-3 w-3 place-items-center border ${on ? 'border-accent bg-accent' : 'border-mute bg-paper'}`}>
        {on && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.4" fill="none" /></svg>}
      </span>
      <span className="text-ink">{label}</span>
    </label>
  )
}

export function Select<T extends string>({ value, options, onChange, className = '', ariaLabel }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; className?: string; ariaLabel?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-[24px] w-full appearance-none border border-line bg-paper pl-2 pr-6 text-2xs text-ink outline-none hover:border-ink focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-mute">▾</span>
    </div>
  )
}

export function Btn({ children, onClick, tip, active, className = '', disabled, variant = 'line' }: { children: ReactNode; onClick?: () => void; tip?: string; active?: boolean; className?: string; disabled?: boolean; variant?: 'line' | 'solid' | 'ghost' }) {
  const base = 'inline-flex h-[24px] items-center justify-center gap-1.5 px-2 text-2xs transition-colors disabled:opacity-30'
  const v =
    variant === 'solid' ? 'bg-ink text-paper hover:bg-accent'
      : variant === 'ghost' ? `${active ? 'text-accent' : 'text-ink'} hover:bg-hover`
      : `border ${active ? 'border-accent text-accent' : 'border-line text-ink hover:border-ink'}`
  return (
    <button data-tip={tip} disabled={disabled} onClick={onClick} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  )
}

// ---------- color ----------
type CMode = 'HEX' | 'RGB' | 'HSL'
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { r, g, b } = hexToRgb(value)
  const hsv0 = rgbToHsv(r, g, b)
  const [hue, setHue] = useState(hsv0.h)
  const [mode, setMode] = useState<CMode>('HEX')
  useEffect(() => {
    if (hsv0.s > 0.02 && hsv0.v > 0.02) setHue(hsv0.h)
  }, [value])
  const sv = useRef<HTMLDivElement>(null)
  const setSV = (e: React.PointerEvent) => {
    const rc = sv.current!.getBoundingClientRect()
    const s = clamp((e.clientX - rc.left) / rc.width, 0, 1)
    const v = 1 - clamp((e.clientY - rc.top) / rc.height, 0, 1)
    const c = hsvToRgb(hue, s, v)
    onChange(rgbToHex(c.r, c.g, c.b))
  }
  const hueRef = useRef<HTMLDivElement>(null)
  const setH = (e: React.PointerEvent) => {
    const rc = hueRef.current!.getBoundingClientRect()
    const h = clamp((e.clientX - rc.left) / rc.width, 0, 1) * 359.9
    setHue(h)
    const c = hsvToRgb(h, hsv0.s, hsv0.v)
    onChange(rgbToHex(c.r, c.g, c.b))
  }
  const hsl = rgbToHsl(r, g, b)
  const SWATCHES = ['#111111', '#ffffff', '#6b6b66', '#2b2bff', '#ff3b1f', '#ffd400', '#00b37a', '#ff2d6f', '#f2efe8', '#7a5cff']
  return (
    <div className="flex w-[232px] flex-col gap-2 border border-ink bg-paper p-2 shadow-[4px_4px_0_rgba(0,0,0,0.08)]">
      <div
        ref={sv}
        className="relative h-[120px] cursor-crosshair"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSV(e) }}
        onPointerMove={(e) => e.buttons === 1 && setSV(e)}
      >
        <div className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#000]" style={{ left: `${hsv0.s * 100}%`, top: `${(1 - hsv0.v) * 100}%` }} />
      </div>
      <div
        ref={hueRef}
        className="relative h-2.5 cursor-ew-resize"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setH(e) }}
        onPointerMove={(e) => e.buttons === 1 && setH(e)}
      >
        <div className="pointer-events-none absolute top-0 h-full w-1 -translate-x-1/2 border border-white shadow-[0_0_0_1px_#000]" style={{ left: `${(hue / 360) * 100}%` }} />
      </div>
      <div className="flex items-center gap-1">
        <Seg size="sm" value={mode} onChange={setMode} options={[{ v: 'HEX', label: 'HEX' }, { v: 'RGB', label: 'RGB' }, { v: 'HSL', label: 'HSL' }]} />
      </div>
      {mode === 'HEX' && <HexInput value={value} onChange={onChange} />}
      {mode === 'RGB' && (
        <div className="flex gap-1">
          {(['r', 'g', 'b'] as const).map((k) => (
            <NumInput key={k} w="flex-1" suffix={k.toUpperCase()} min={0} max={255} value={{ r, g, b }[k]} onChange={(v) => { const c = { r, g, b, [k]: v }; onChange(rgbToHex(c.r, c.g, c.b)) }} />
          ))}
        </div>
      )}
      {mode === 'HSL' && (
        <div className="flex gap-1">
          {(['h', 's', 'l'] as const).map((k) => (
            <NumInput key={k} w="flex-1" suffix={k.toUpperCase()} min={0} max={k === 'h' ? 360 : 100} value={Math.round(hsl[k])} onChange={(v) => { const c = { ...hsl, [k]: v }; const o = hslToRgb(c.h % 360, c.s, c.l); onChange(rgbToHex(o.r, o.g, o.b)) }} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((s) => (
          <button key={s} aria-label={s} className="h-4 w-4 border border-line" style={{ background: s }} onClick={() => onChange(s)} />
        ))}
      </div>
    </div>
  )
}

function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [t, setT] = useState<string | null>(null)
  return (
    <input
      aria-label="Hex colour"
      className="h-[22px] w-full border border-transparent bg-hover px-1.5 font-mono text-2xs uppercase text-ink outline-none focus:border-accent"
      value={t ?? value}
      onChange={(e) => { setT(e.target.value); if (isHex(e.target.value)) onChange(normHex(e.target.value)) }}
      onBlur={() => setT(null)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  )
}

export function ColorField({ value, onChange, label, tip }: { value: string; onChange: (hex: string) => void; label?: string; tip?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  return (
    <div ref={ref} className="relative flex min-w-0 flex-1 items-center gap-2">
      {label && <Label tip={tip}>{label}</Label>}
      <button aria-label={`${label ?? 'Colour'} ${value}`} className="h-[22px] w-[22px] shrink-0 border border-line" style={{ background: value }} onClick={() => setOpen(!open)} />
      <div className="min-w-0 flex-1"><HexInput value={value} onChange={onChange} /></div>
      {open && (
        <div className="absolute right-0 top-[26px] z-50">
          <ColorPicker value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center gap-2 ${className}`}>{children}</div>
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-snug text-mute">{children}</p>
}
