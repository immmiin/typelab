import type { Draft } from 'immer'
import { useStore } from '../store'
import type { Layer, TextLayer } from '../types'

export function usePrimary(): Layer | null {
  return useStore((s) => {
    const id = s.editing ?? s.sel[s.sel.length - 1]
    return s.doc.layers.find((l) => l.id === id) ?? null
  })
}
export function usePrimaryText(): TextLayer | null {
  const l = usePrimary()
  return l && l.type === 'text' ? l : null
}

/** update every selected layer of the right kind */
export function useUpd() {
  const update = useStore((s) => s.update)
  return {
    text: (fn: (l: Draft<TextLayer>) => void, key?: string) => {
      const s = useStore.getState()
      const ids = s.editing ? [s.editing] : s.sel
      update((d) => {
        for (const l of d.layers) if (ids.includes(l.id) && l.type === 'text') fn(l as Draft<TextLayer>)
      }, key)
    },
    any: (fn: (l: Draft<Layer>) => void, key?: string) => {
      const s = useStore.getState()
      const ids = s.editing ? [s.editing] : s.sel
      update((d) => {
        for (const l of d.layers) if (ids.includes(l.id)) fn(l)
      }, key)
    },
  }
}
