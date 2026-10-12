import { open, S, L, check } from './lib.mjs'
const { b, p, errs } = await open()
await p.mouse.click(600, 420)
const shot = (n) => p.screenshot({ path: `/tmp/shots/z-${n}.png`, clip: { x: 430, y: 280, width: 580, height: 330 } })
// box fixed width for alignment tests
await p.locator('[data-section="text"] [role="radio"]:has-text("Wrap")').click()
await p.evaluate(()=>document.querySelector('[data-section="text"] details').open=true); await p.locator('[data-section="text"] textarea').fill('Type is a system of rules applied with care and consistency.')
for (const a of ['Align centre', 'Align right', 'Justify (fixed-width box)']) {
  await p.locator(`[data-section="text"] [data-tip="${a}"]`).click(); await shot(a.split(' ')[1].replace('(', ''))
}
await p.locator(`[data-section="text"] [data-tip="Align left"]`).click()
await p.evaluate(()=>document.querySelector('[data-section="text"] details').open=true); await p.locator('[data-section="text"] textarea').fill('H2O x2 Office')
for (const t of ['Small caps', 'Superscript', 'Underline (uses the font’s underline metrics)', 'Strikethrough']) {
  const btn = p.locator(`[data-section="text"] button[data-tip^="${t.split(' ')[0]}"]`).first()
  await btn.click(); await shot(t.split(' ')[0]); await btn.click()
}
await p.locator('[data-section="text"] [role="radio"]:has-text("Vertical")').click()
await p.evaluate(()=>document.querySelector('[data-section="text"] details').open=true); await p.locator('[data-section="text"] textarea').fill('TYPE\nLAB')
await p.screenshot({ path: `/tmp/shots/z-vertical.png` })
let h = await L(p, 'Headline'); check(h.style.direction === 'vertical', 'vertical')
await p.locator('[data-section="text"] [role="radio"]:has-text("Horizontal")').click()
// V-align middle
await p.locator('[data-section="text"] [data-tip="Vertical align: middle"]').click()
h = await L(p, 'Headline'); check(h.fixedHeight && h.style.vAlign === 'middle', 'v-align sets fixed height box')
await shot('valign')
// hand tool pan
const v0 = (await S(p)).view
await p.keyboard.press('h'); await p.mouse.move(700, 600); await p.mouse.down(); await p.mouse.move(760, 640, { steps: 4 }); await p.mouse.up()
const v1 = (await S(p)).view
check(Math.round(v1.panX - v0.panX) === 60, 'hand tool pans')
await p.keyboard.press('v')
// zoom buttons
await p.locator('[aria-label="Zoom in"]').click()
check((await S(p)).view.zoom > v1.zoom, 'zoom in button')
await p.keyboard.press('Control+0')
console.log('errors:', errs.join('\n'))
await b.close()
for (const [w, hgt] of [[1100, 800], [820, 700], [420, 800]]) {
  const r = await open({ w, h: hgt, clear: false })
  await r.p.screenshot({ path: `/tmp/shots/resp-${w}.png` })
  console.log('resp', w, 'errors:', r.errs.join(' '))
  await r.b.close()
}
