import { create } from 'zustand'
import type { FontCategory, FontInfo, FontMeta } from '../types'
import { EMBEDDED_FONTS } from './embedded'
import builtinMeta from './builtinMeta.json'
import { parseFont } from './parser'

export const CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: 'Sans Serif',
  serif: 'Serif',
  display: 'Display',
  mono: 'Monospace',
  handwriting: 'Handwriting',
  experimental: 'Experimental',
}

interface FontState {
  fonts: Record<string, FontInfo>
  order: string[]
  version: number
  ready: boolean
  favorites: string[]
  recents: string[]
  error: string | null
  toggleFavorite: (id: string) => void
  touchRecent: (id: string) => void
}

const LS_FAV = 'typelab.favorites'
const LS_REC = 'typelab.recents'
const readLS = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const writeLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

export const useFonts = create<FontState>((set, get) => ({
  fonts: {},
  order: [],
  version: 0,
  ready: false,
  favorites: readLS<string[]>(LS_FAV, ['inter', 'fraunces', 'robotoflex']),
  recents: readLS<string[]>(LS_REC, []),
  error: null,
  toggleFavorite: (id) => {
    const f = get().favorites
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
    writeLS(LS_FAV, next)
    set({ favorites: next })
  },
  touchRecent: (id) => {
    const next = [id, ...get().recents.filter((x) => x !== id)].slice(0, 8)
    writeLS(LS_REC, next)
    set({ recents: next })
  },
}))

export const getFont = (id: string | undefined): FontInfo => {
  const s = useFonts.getState()
  return (id && s.fonts[id]) || s.fonts['inter'] || Object.values(s.fonts)[0]
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u.buffer
}

export function bufToB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf)
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + CH)))
  return btoa(s)
}

function descriptors(meta: FontMeta, weight?: number): FontFaceDescriptors {
  const d: FontFaceDescriptors = { display: 'block' }
  const w = meta.axes.find((a) => a.tag === 'wght')
  const wd = meta.axes.find((a) => a.tag === 'wdth')
  if (w) d.weight = `${w.min} ${w.max}`
  else if (weight) d.weight = String(weight)
  if (wd) d.stretch = `${wd.min}% ${wd.max}%`
  return d
}

function mimeFor(buf: ArrayBuffer) {
  const sig = String.fromCharCode(...new Uint8Array(buf, 0, 4))
  if (sig === 'wOF2') return 'font/woff2'
  if (sig === 'wOFF') return 'font/woff'
  if (sig === 'OTTO') return 'font/otf'
  return 'font/ttf'
}

async function register(info: FontInfo) {
  for (const face of info.faces) {
    const ff = new FontFace(info.css, face.data.slice(0), descriptors(info.meta, face.weight))
    await ff.load()
    document.fonts.add(ff)
  }
  info.loaded = true
}

/** @font-face CSS with embedded data, for SVG/PNG export */
export function fontFaceCss(ids: Iterable<string>): string {
  const out: string[] = []
  for (const id of new Set(ids)) {
    const f = useFonts.getState().fonts[id]
    if (!f) continue
    for (const face of f.faces) {
      const d = descriptors(f.meta, face.weight)
      out.push(
        `@font-face{font-family:"${f.css}";src:url(data:${face.mime};base64,${bufToB64(face.data)});` +
          (d.weight ? `font-weight:${d.weight};` : '') +
          (d.stretch ? `font-stretch:${d.stretch};` : '') +
          `}`,
      )
    }
  }
  return out.join('\n')
}

// ---------- IndexedDB for uploaded fonts ----------
const DB = 'typelab'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idbAll(): Promise<{ id: string; name: string; data: ArrayBuffer }[]> {
  try {
    const db = await idb()
    return await new Promise((res, rej) => {
      const r = db.transaction('fonts').objectStore('fonts').getAll()
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  } catch {
    return []
  }
}
async function idbPut(rec: { id: string; name: string; data: ArrayBuffer }) {
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('fonts', 'readwrite')
      tx.objectStore('fonts').put(rec)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* ignore */
  }
}
async function idbDelete(id: string) {
  try {
    const db = await idb()
    db.transaction('fonts', 'readwrite').objectStore('fonts').delete(id)
  } catch {
    /* ignore */
  }
}

async function addUploaded(id: string, fileName: string, data: ArrayBuffer): Promise<FontInfo> {
  const { meta, category } = await parseFont(data)
  const info: FontInfo = {
    id,
    name: meta.family || fileName,
    css: `tl-${id}`,
    category,
    source: 'upload',
    meta,
    faces: [{ weight: meta.weightClass || 400, data, mime: mimeFor(data) }],
    loaded: false,
  }
  await register(info)
  return info
}

export async function uploadFontFiles(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = []
  const errors: string[] = []
  for (const file of Array.from(files)) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      errors.push(`${file.name}: not a font file`)
      continue
    }
    try {
      const data = await file.arrayBuffer()
      const id = 'u' + Math.random().toString(36).slice(2, 9)
      const info = await addUploaded(id, file.name.replace(/\.\w+$/, ''), data.slice(0))
      await idbPut({ id, name: file.name, data })
      useFonts.setState((s) => ({
        fonts: { ...s.fonts, [id]: info },
        order: [...s.order, id],
        version: s.version + 1,
      }))
      ids.push(id)
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`)
    }
  }
  useFonts.setState({ error: errors.length ? errors.join(' · ') : null })
  return ids
}

export async function removeUploadedFont(id: string) {
  await idbDelete(id)
  useFonts.setState((s) => {
    const fonts = { ...s.fonts }
    delete fonts[id]
    return { fonts, order: s.order.filter((x) => x !== id), version: s.version + 1 }
  })
}

let initPromise: Promise<void> | null = null
export function initFonts(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const fonts: Record<string, FontInfo> = {}
    const order: string[] = []
    const metas = builtinMeta as unknown as Record<string, FontMeta>
    await Promise.all(
      EMBEDDED_FONTS.map(async (e) => {
        const meta = metas[e.id]
        const info: FontInfo = {
          id: e.id,
          name: e.name,
          css: `tl-${e.id}`,
          category: e.category as FontCategory,
          source: 'builtin',
          meta,
          faces: e.files.map((f) => {
            const data = b64ToBuf(f.data)
            return { weight: f.weight ?? meta.weightClass, data, mime: 'font/woff2' }
          }),
          loaded: false,
        }
        fonts[e.id] = info
        await register(info)
      }),
    )
    EMBEDDED_FONTS.forEach((e) => order.push(e.id))
    useFonts.setState({ fonts, order, version: 1, ready: true })
    // uploaded fonts from previous sessions
    const saved = await idbAll()
    for (const rec of saved) {
      try {
        const info = await addUploaded(rec.id, rec.name, rec.data)
        useFonts.setState((s) => ({ fonts: { ...s.fonts, [rec.id]: info }, order: [...s.order, rec.id], version: s.version + 1 }))
      } catch {
        /* skip unreadable */
      }
    }
  })()
  return initPromise
}
