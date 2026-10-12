import { open, S, L, check } from './lib.mjs'
const { b, p, errs } = await open()
await p.mouse.click(600, 420)
await p.locator('[data-tab="form"]').click()
for (const w of ['arc', 'wave', 'flag', 'bulge', 'fisheye', 'rise', 'squeeze', 'arch']) {
  await p.locator(`[data-testid="warp-${w}"]`).click()
  await p.waitForTimeout(80)
  await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/w-${w}.png` })
}
let h = await L(p, 'Headline')
check(h.distort.warp === 'arch', 'warp style set')
const nG = await p.evaluate((id) => document.querySelectorAll(`#gl-${id} g text`).length, h.id)
check(nG >= 14, 'glyph mode renders per-glyph text elements: ' + nG)
// perspective + random
const set = async (label, v) => { const i = p.locator(`[data-section="distort"] input[aria-label="${label}"]`).first(); await i.fill(String(v)); await i.press('Enter') }
await set('Persp. X', 35)
await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/w-persp.png` })
await p.locator('[data-section="distort"] button:has-text("RESET DISTORTION")').click()
h = await L(p, 'Headline')
check(h.distort.warp === 'none' && h.distort.perspX === 0, 'reset distortion')
await set('Rotation', 20); await set('Y position', 30); await set('Scale', 30)
await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/w-random.png` })
await p.locator('[data-section="distort"] button:has-text("RESET DISTORTION")').click()
// path
await p.locator('[data-section="path"] button[aria-pressed]').first().click()
h = await L(p, 'Headline')
check(h.path.enabled, 'path enabled')
await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/p-circle.png` })
for (const t of ['Arc', 'Wave', 'Spiral', 'SVG']) {
  await p.locator(`[data-section="path"] [role="radio"]:has-text("${t}")`).click()
  await p.waitForTimeout(80)
  await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/p-${t}.png` })
}
await p.locator(`[data-section="path"] [role="radio"]:has-text("Circle")`).click()
await p.locator(`[data-section="path"] [role="radio"]:has-text("Inside")`).click()
await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/p-inside.png` })
await p.locator('[data-section="path"] button[aria-pressed]').first().click()
// repeat
for (const m of ['rows', 'grid', 'radial', 'circular', 'spiral']) {
  await p.locator(`[data-testid="repeat-${m}"]`).click()
  await p.waitForTimeout(80)
  await p.locator('#tl-artboard').screenshot({ path: `/tmp/shots/r-${m}.png` })
}
const uses = await p.evaluate(() => document.querySelectorAll('#tl-artboard [data-layer] > use').length)
check(uses > 5, 'repeat copies rendered: ' + uses)
await p.locator(`[data-testid="repeat-none"]`).click()
console.log('errors:', errs.join('\n'))
await b.close()
