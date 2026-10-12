import { S } from './store'
import { fontFaceCss } from './fonts/registry'

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf'

function usedFonts(): string[] {
  const ids = new Set<string>()
  for (const l of S().doc.layers) {
    if (l.type !== 'text' || !l.visible) continue
    ids.add(l.style.fontId)
    l.chars.forEach((c) => c?.fontId && ids.add(c.fontId))
  }
  return [...ids]
}

export function buildSvg(opts: { transparent: boolean; includeGuides: boolean }): string {
  const src = document.getElementById('tl-artboard') as SVGSVGElement | null
  if (!src) throw new Error('Artboard not found')
  const A = S().doc.artboard
  const svg = src.cloneNode(true) as SVGSVGElement
  svg.removeAttribute('x')
  svg.removeAttribute('y')
  svg.removeAttribute('style')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  svg.setAttribute('width', String(A.w))
  svg.setAttribute('height', String(A.h))
  svg.setAttribute('viewBox', `0 0 ${A.w} ${A.h}`)
  if (!opts.includeGuides) svg.querySelectorAll('[data-noexport]').forEach((n) => n.remove())
  if (opts.transparent) svg.querySelectorAll('[data-bg]').forEach((n) => n.remove())
  // xlink:href for older renderers alongside href
  svg.querySelectorAll('use, textPath').forEach((u) => {
    const h = u.getAttribute('href')
    if (h) u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', h)
  })
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = fontFaceCss(usedFonts())
  svg.insertBefore(style, svg.firstChild)
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
  title.textContent = 'TYPE LAB composition'
  svg.insertBefore(title, svg.firstChild)
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg)
}

export async function rasterize(scale: number, opts: { transparent: boolean; includeGuides: boolean; jpg?: boolean }): Promise<HTMLCanvasElement> {
  const A = S().doc.artboard
  const svgText = buildSvg({ transparent: opts.transparent || !!opts.jpg, includeGuides: opts.includeGuides })
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'sync'
    img.src = url
    await img.decode()
    // give embedded fonts a frame to settle
    await new Promise((r) => setTimeout(r, 60))
    const c = document.createElement('canvas')
    c.width = Math.round(A.w * scale)
    c.height = Math.round(A.h * scale)
    const ctx = c.getContext('2d')!
    if (opts.jpg) {
      const bg = A.bg === 'black' ? '#000' : A.bg === 'custom' ? A.bgColor : '#fff'
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, c.width, c.height)
      // draw original background if not transparent
    }
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed'))), type, q))

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Minimal PDF 1.4 with one page holding the raster image (RGB + alpha soft mask). */
export async function canvasToPdf(c: HTMLCanvasElement, pageW: number, pageH: number, transparent: boolean): Promise<Blob> {
  const { width: w, height: h } = c
  const px = c.getContext('2d')!.getImageData(0, 0, w, h).data
  const rgb = new Uint8Array(w * h * 3)
  const alpha = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    rgb[j * 3] = px[i]
    rgb[j * 3 + 1] = px[i + 1]
    rgb[j * 3 + 2] = px[i + 2]
    alpha[j] = px[i + 3]
  }
  const rgbZ = await deflate(rgb)
  const aZ = transparent ? await deflate(alpha) : null
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x
    parts.push(b)
    len += b.length
  }
  const obj = (n: number, body: (string | Uint8Array)[]) => {
    offsets[n] = len
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'])
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`])
  obj(4, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
  obj(5, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${rgbZ.length}${aZ ? ' /SMask 6 0 R' : ''} >>\nstream\n`, rgbZ, '\nendstream'])
  if (aZ) obj(6, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${aZ.length} >>\nstream\n`, aZ, '\nendstream'])
  obj(7, [`<< /Producer (TYPE LAB) /Title (TYPE LAB composition) >>`])
  const n = aZ ? 8 : 8
  const xref = len
  let x = `xref\n0 ${n}\n0000000000 65535 f \n`
  for (let i = 1; i < n; i++) x += String(offsets[i] ?? 0).padStart(10, '0') + (offsets[i] !== undefined ? ' 00000 n \n' : ' 65535 f \n')
  push(x)
  push(`trailer\n<< /Size ${n} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> }
  }
}

/** Hand a file to the viewer: platform download capability when available, else a normal browser download. */
export async function saveFile(filename: string, data: Blob): Promise<'saved' | 'declined' | 'downloaded'> {
  try {
    const dl = (await window.claude?.use?.('downloads')) as { save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null | undefined
    if (dl) {
      try {
        await dl.save({ filename, data })
        return 'saved'
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === 'declined') return 'declined'
        if (code !== 'unavailable' && code !== 'not_granted') throw e
      }
    }
  } catch {
    /* fall through */
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}

export async function exportFile(fmt: ExportFormat, scale: number, transparent: boolean, includeGuides: boolean, name: string) {
  const A = S().doc.artboard
  const base = (name || 'typelab').replace(/[^\w\-]+/g, '-')
  let blob: Blob
  if (fmt === 'svg') blob = new Blob([buildSvg({ transparent, includeGuides })], { type: 'image/svg+xml' })
  else {
    const c = await rasterize(scale, { transparent, includeGuides, jpg: fmt === 'jpg' })
    if (fmt === 'png') blob = await toBlob(c, 'image/png')
    else if (fmt === 'jpg') blob = await toBlob(c, 'image/jpeg', 0.95)
    else blob = await canvasToPdf(c, A.w, A.h, transparent)
  }
  const file = `${base}${fmt === 'svg' || fmt === 'pdf' ? '' : `@${scale}x`}.${fmt}`
  const r = await saveFile(file, blob)
  return { file, size: blob.size, result: r, blob }
}
