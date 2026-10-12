import { open, S, L, check } from './lib.mjs'
import fs from 'fs'
const { b, ctx, p, errs } = await open()
await p.mouse.click(600, 420)
// ---- upload fonts
await p.locator('[data-testid="family-field"]').click(); await p.locator('[data-testid="font-upload"]').first().setInputFiles(['/tmp/upl/InstrumentSerif.ttf', '/tmp/upl/FrauncesTest.woff2', '/tmp/upl/TiltWarp.woff'])
await p.waitForFunction(() => Object.values(window.__typelab.useFonts.getState().fonts).filter(f => f.source === 'upload').length === 3, null, { timeout: 15000 })
const up = await p.evaluate(() => Object.values(window.__typelab.useFonts.getState().fonts).filter(f => f.source === 'upload').map(f => ({ name: f.name, cat: f.category, axes: f.meta.axes.map(a => `${a.tag}:${a.min}-${a.max}`).join(','), feats: f.meta.features.length, chars: f.meta.chars.length, inst: f.meta.instances.length })))
console.log(JSON.stringify(up))
check(up.find(f => f.name === 'Fraunces')?.axes.includes('SOFT:0-100'), 'woff2 parse: Fraunces axes')
check(up.find(f => f.name === 'Tilt Warp')?.axes.includes('XROT'), 'woff parse: Tilt Warp axes')
check(up.find(f => f.name === 'Instrument Serif')?.cat === 'serif', 'ttf parse: Instrument Serif serif')
let h = await L(p, 'Headline')
const fid = h.style.fontId
check(fid.startsWith('u'), 'uploaded font applied to layer: ' + fid)
await p.screenshot({ path: '/tmp/shots/x-upload.png' })
// ---- exports
await p.locator('[data-tab="doc"]').click()
const sizes = {}
for (const fmt of ['PNG', 'JPG', 'SVG', 'PDF']) {
  await p.locator(`[data-section="export"] [role="radio"]:has-text("${fmt}")`).click()
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.getByRole('button', { name: /^EXPORT (PNG|JPG|SVG|PDF)$/ }).click()])
  const path = `/tmp/shots/export.${fmt.toLowerCase()}`
  await dl.saveAs(path)
  sizes[fmt] = fs.statSync(path).size
  check(sizes[fmt] > 2000, `export ${fmt} -> ${dl.suggestedFilename()} ${sizes[fmt]} bytes`)
}
const svg = fs.readFileSync('/tmp/shots/export.svg', 'utf8')
check(svg.includes('@font-face') && svg.includes('<text') && !svg.includes('data-noexport'), 'SVG has embedded fonts + live text')
// transparent PNG at 1x
await p.locator(`[data-section="export"] [role="radio"]:has-text("PNG")`).click()
await p.locator(`[data-section="export"] [role="radio"]:has-text("1×")`).click()
await p.locator(`[data-section="export"] label:has-text("Transparent background")`).click()
const [dl2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /^EXPORT (PNG|JPG|SVG|PDF)$/ }).click()])
await dl2.saveAs('/tmp/shots/export-t.png')
// CSS
const css = await p.locator('[data-testid="css-out"]').textContent()
check(css.includes('font-size: 178px') && css.includes('letter-spacing: -0.048em'), 'CSS generated')
console.log(css)
// ---- persistence: reload
await p.reload()
await p.waitForFunction(() => window.__typelab && window.__typelab.useFonts.getState().ready)
await p.waitForFunction(() => Object.values(window.__typelab.useFonts.getState().fonts).filter(f => f.source === 'upload').length === 3, null, { timeout: 15000 })
h = await L(p, 'Headline')
check(h.style.fontId === fid, 'after reload: layer keeps uploaded font ' + h.style.fontId)
await p.waitForTimeout(300)
await p.screenshot({ path: '/tmp/shots/x-reload.png' })
console.log('errors:', errs.join('\n'))
await b.close()
