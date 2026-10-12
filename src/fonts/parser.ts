// Minimal OpenType / WOFF / WOFF2 reader for the tables TYPE LAB needs:
// name, fvar, GSUB/GPOS feature lists, cmap, head, hhea, OS/2, post, maxp.
import type { FontCategory, FontMeta } from '../types'
// @ts-ignore - CommonJS module without types
import brotliDecompress from 'brotli/decompress'

type Tables = Map<string, DataView>

const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

const tagAt = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function readSfnt(buf: ArrayBuffer): Tables {
  const v = new DataView(buf)
  const n = v.getUint16(4)
  const t: Tables = new Map()
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16
    const tag = tagAt(v, r)
    const off = v.getUint32(r + 8)
    const len = v.getUint32(r + 12)
    t.set(tag, new DataView(buf, off, len))
  }
  return t
}

async function readWoff(buf: ArrayBuffer): Promise<Tables> {
  const v = new DataView(buf)
  const n = v.getUint16(12)
  const t: Tables = new Map()
  for (let i = 0; i < n; i++) {
    const r = 44 + i * 20
    const tag = tagAt(v, r)
    const off = v.getUint32(r + 4)
    const comp = v.getUint32(r + 8)
    const orig = v.getUint32(r + 12)
    let bytes: Uint8Array = new Uint8Array(buf, off, comp)
    if (comp < orig) bytes = await inflate(bytes)
    const copy = bytes.slice()
    t.set(tag, new DataView(copy.buffer))
  }
  return t
}

function readWoff2(buf: ArrayBuffer): Tables {
  const v = new DataView(buf)
  const n = v.getUint16(12)
  const totalCompressed = v.getUint32(20)
  let p = 48
  const base128 = () => {
    let acc = 0
    for (let i = 0; i < 5; i++) {
      const b = v.getUint8(p++)
      acc = acc * 128 + (b & 0x7f)
      if (!(b & 0x80)) return acc
    }
    return acc
  }
  const entries: { tag: string; len: number; transformed: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const flags = v.getUint8(p++)
    const idx = flags & 0x3f
    let tag: string
    if (idx === 63) { tag = tagAt(v, p); p += 4 } else tag = WOFF2_TAGS[idx]
    const ver = (flags >> 6) & 3
    const orig = base128()
    let transformed = false
    let len = orig
    if (tag === 'glyf' || tag === 'loca') { if (ver === 0) transformed = true } else if (ver !== 0) transformed = true
    if (transformed) len = base128()
    entries.push({ tag, len, transformed })
  }
  const comp = new Uint8Array(buf, p, totalCompressed)
  const data: Uint8Array = brotliDecompress(comp)
  const t: Tables = new Map()
  let off = 0
  for (const e of entries) {
    if (!e.transformed) t.set(e.tag, new DataView(data.buffer, data.byteOffset + off, e.len))
    off += e.len
  }
  return t
}

function readName(t: Tables): (id: number) => string {
  const v = t.get('name')
  const map = new Map<number, string>()
  if (v) {
    const count = v.getUint16(2)
    const strOff = v.getUint16(4)
    const pri = (pl: number, lang: number) => (pl === 3 ? (lang === 0x409 ? 3 : 2) : pl === 0 ? 2 : 1)
    const best = new Map<number, number>()
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12
      const pl = v.getUint16(r), enc = v.getUint16(r + 2), lang = v.getUint16(r + 4), id = v.getUint16(r + 6)
      const len = v.getUint16(r + 8), off = v.getUint16(r + 10)
      const score = pri(pl, lang)
      if ((best.get(id) ?? 0) >= score) continue
      let s = ''
      if (pl === 3 || pl === 0) {
        for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(v.getUint16(strOff + off + k))
      } else if (pl === 1 && enc === 0) {
        for (let k = 0; k < len; k++) s += String.fromCharCode(v.getUint8(strOff + off + k))
      } else continue
      best.set(id, score)
      map.set(id, s)
    }
  }
  return (id) => map.get(id) ?? ''
}

const fixed = (v: DataView, o: number) => v.getInt32(o) / 65536

function readCmap(t: Tables): number[] {
  const v = t.get('cmap')
  if (!v) return []
  const n = v.getUint16(2)
  let off4 = -1, off12 = -1
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 8
    const pl = v.getUint16(r), enc = v.getUint16(r + 2), off = v.getUint32(r + 4)
    const fmt = v.getUint16(off)
    if (fmt === 12 && (pl === 3 || pl === 0)) off12 = off
    if (fmt === 4 && (pl === 3 || pl === 0) && (enc === 1 || enc === 0 || enc === 3)) off4 = off
  }
  const set = new Set<number>()
  if (off12 >= 0) {
    const ng = v.getUint32(off12 + 12)
    for (let g = 0; g < ng && g < 20000; g++) {
      const r = off12 + 16 + g * 12
      const s = v.getUint32(r), e = v.getUint32(r + 4)
      for (let c = s; c <= e && c - s < 70000; c++) set.add(c)
    }
  } else if (off4 >= 0) {
    const segX2 = v.getUint16(off4 + 6)
    const seg = segX2 / 2
    const endO = off4 + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2
    for (let i = 0; i < seg; i++) {
      const end = v.getUint16(endO + i * 2), start = v.getUint16(startO + i * 2)
      const delta = v.getInt16(deltaO + i * 2), ro = v.getUint16(rangeO + i * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid: number
        if (ro === 0) gid = (c + delta) & 0xffff
        else {
          const addr = rangeO + i * 2 + ro + (c - start) * 2
          gid = addr + 1 < v.byteLength ? v.getUint16(addr) : 0
          if (gid) gid = (gid + delta) & 0xffff
        }
        if (gid) set.add(c)
      }
    }
  }
  return [...set].sort((a, b) => a - b)
}

function readFeatures(t: Tables): string[] {
  const out = new Set<string>()
  for (const name of ['GSUB', 'GPOS']) {
    const v = t.get(name)
    if (!v) continue
    const fl = v.getUint16(6)
    const cnt = v.getUint16(fl)
    for (let i = 0; i < cnt; i++) out.add(tagAt(v, fl + 2 + i * 6))
  }
  return [...out].sort()
}

export interface ParsedFont { meta: FontMeta; category: FontCategory }

export async function parseFont(buf: ArrayBuffer): Promise<ParsedFont> {
  const v = new DataView(buf)
  const sig = tagAt(v, 0)
  let t: Tables
  if (sig === 'wOFF') t = await readWoff(buf)
  else if (sig === 'wOF2') t = readWoff2(buf)
  else if (sig === 'OTTO' || sig === 'true' || v.getUint32(0) === 0x00010000) t = readSfnt(buf)
  else throw new Error('Unrecognised font format. Use .ttf, .otf, .woff or .woff2.')

  const name = readName(t)
  const axes: FontMeta['axes'] = []
  const instances: FontMeta['instances'] = []
  const fv = t.get('fvar')
  if (fv) {
    const axOff = fv.getUint16(4), axCount = fv.getUint16(8), axSize = fv.getUint16(10)
    const inCount = fv.getUint16(12), inSize = fv.getUint16(14)
    for (let i = 0; i < axCount; i++) {
      const o = axOff + i * axSize
      axes.push({ tag: tagAt(fv, o), min: fixed(fv, o + 4), def: fixed(fv, o + 8), max: fixed(fv, o + 12), name: name(fv.getUint16(o + 18)) || tagAt(fv, o) })
    }
    for (let i = 0; i < inCount; i++) {
      const o = axOff + axCount * axSize + i * inSize
      const coords: Record<string, number> = {}
      axes.forEach((a, k) => (coords[a.tag] = Math.round(fixed(fv, o + 4 + k * 4) * 100) / 100))
      instances.push({ name: name(fv.getUint16(o)) || `Instance ${i + 1}`, coords })
    }
  }
  const head = t.get('head'), hhea = t.get('hhea'), os2 = t.get('OS/2'), post = t.get('post'), maxp = t.get('maxp')
  const upm = head ? head.getUint16(18) : 1000
  const os2v = os2 ? os2.getUint16(0) : 0
  const meta: FontMeta = {
    family: name(16) || name(1) || 'Untitled',
    designer: name(9),
    version: name(5),
    license: name(13).slice(0, 160),
    axes,
    instances,
    features: readFeatures(t),
    chars: readCmap(t),
    upm,
    asc: hhea ? hhea.getInt16(4) : upm * 0.8,
    desc: hhea ? hhea.getInt16(6) : -upm * 0.2,
    lineGap: hhea ? hhea.getInt16(8) : 0,
    capH: os2 && os2v >= 2 && os2.byteLength > 90 ? os2.getInt16(88) : Math.round(upm * 0.7),
    xH: os2 && os2v >= 2 && os2.byteLength > 90 ? os2.getInt16(86) : Math.round(upm * 0.5),
    ulPos: post ? post.getInt16(8) : -upm * 0.1,
    ulThick: post ? post.getInt16(10) : upm * 0.05,
    stPos: os2 ? os2.getInt16(28) : upm * 0.25,
    stSize: os2 ? os2.getInt16(26) : upm * 0.05,
    glyphs: maxp ? maxp.getUint16(4) : 0,
    mono: post ? post.getUint32(12) !== 0 : false,
    weightClass: os2 ? os2.getUint16(4) : 400,
    widthClass: os2 ? os2.getUint16(6) : 5,
    weights: [os2 ? os2.getUint16(4) : 400],
  }
  // Classification from OS/2 + names
  let category: FontCategory = 'sans'
  const fam = meta.family.toLowerCase()
  const cls = os2 ? os2.getInt16(30) >> 8 : 0
  const panoseFamily = os2 ? os2.getUint8(32) : 0
  const panoseProp = os2 ? os2.getUint8(35) : 0
  if (meta.mono || (panoseFamily === 2 && panoseProp === 9) || /mono|code|courier/.test(fam)) category = 'mono'
  else if (panoseFamily === 3 || cls === 10 || /script|hand|brush/.test(fam)) category = 'handwriting'
  else if (panoseFamily === 4 || cls === 9 || /display|poster|decor/.test(fam)) category = 'display'
  else if ((cls >= 1 && cls <= 7) || (/serif/.test(fam) && !/sans/.test(fam))) category = 'serif'
  else if (panoseFamily === 2 && os2 && os2.getUint8(33) >= 2 && os2.getUint8(33) <= 10) category = 'serif'
  else if (cls === 8 || /sans|grotesk|grotesque/.test(fam)) category = 'sans'
  if (axes.some((a) => !/^[a-z]{4}$/.test(a.tag)) && category === 'sans' && cls === 0 && !(panoseFamily === 2) && !/sans|grotesk/.test(fam)) category = 'experimental'
  return { meta, category }
}
