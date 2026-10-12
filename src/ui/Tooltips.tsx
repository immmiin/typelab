import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** One floating tooltip for every [data-tip] element; positioned in viewport space so panels never clip it. */
export function Tooltips() {
  const [t, setT] = useState<{ text: string; x: number; y: number; side: 'below' | 'right' } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  useEffect(() => {
    let timer: number | undefined
    let cur: Element | null = null
    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (el === cur) return
      cur = el
      window.clearTimeout(timer)
      setT(null)
      if (!el) return
      const text = el.getAttribute('data-tip')
      if (!text) return
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        const right = el.getAttribute('data-tip-side') === 'right'
        setT({ text, x: right ? r.right + 8 : r.left + r.width / 2, y: right ? r.top + r.height / 2 : r.bottom + 6, side: right ? 'right' : 'below' })
      }, 420)
    }
    const hide = () => {
      window.clearTimeout(timer)
      setT(null)
    }
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', hide)
    window.addEventListener('wheel', hide, { passive: true })
    return () => {
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', hide)
      window.removeEventListener('wheel', hide)
    }
  }, [])
  useLayoutEffect(() => {
    if (!t || !ref.current) return setDx(0)
    const r = ref.current.getBoundingClientRect()
    let d = 0
    if (r.right > window.innerWidth - 6) d = window.innerWidth - 6 - r.right
    if (r.left + d < 6) d = 6 - r.left
    setDx(d)
  }, [t])
  if (!t) return null
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[1000] max-w-[280px] bg-ink px-1.5 py-[3px] font-mono text-[10px] leading-[1.3] text-paper"
      style={{
        left: t.x + dx,
        top: t.y,
        transform: t.side === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
      }}
    >
      {t.text}
    </div>
  )
}
