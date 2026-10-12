import { open, S, L, check } from './lib.mjs'
const { b, p, errs } = await open()
await p.mouse.click(600, 420)
await p.locator('[data-tab="style"]').click()
// gradient
await p.locator('[data-section="color"] [role="radio"]:has-text("Linear")').click()
let h = await L(p, 'Headline')
check(h.fill.type === 'linear', 'linear gradient')
await p.screenshot({ path: '/tmp/shots/e-gradient.png', clip: { x: 430, y: 330, width: 580, height: 230 } })
await p.locator('[data-section="color"] [role="radio"]:has-text("Radial")').click()
await p.screenshot({ path: '/tmp/shots/e-radial.png', clip: { x: 430, y: 330, width: 580, height: 230 } })
await p.locator('[data-section="color"] [role="radio"]:has-text("Solid")').click()
// stroke
await p.locator('[data-section="color"] [role="radio"]:has-text("Stroke")').click()
await p.locator('[data-section="color"] [role="radio"]:has-text("Linear")').click()
// effects
await p.locator('[data-section="effects"] button:has-text("Add shadow")').click()
await p.screenshot({ path: '/tmp/shots/e-shadow.png', clip: { x: 430, y: 330, width: 580, height: 230 } })
const blocks = ['Outline', 'Offset outline', 'Echo', 'Long shadow', 'Chromatic offset', 'Halftone']
for (const bl of blocks) {
  await p.locator(`[data-section="effects"] button:has-text("${bl}")`).first().click()
  await p.waitForTimeout(80)
  await p.screenshot({ path: `/tmp/shots/e-${bl.replace(' ', '_')}.png`, clip: { x: 430, y: 330, width: 580, height: 230 } })
  await p.locator(`[data-section="effects"] button:has-text("${bl}")`).first().click()
}
const grain = p.locator('[data-section="effects"] input[aria-label="Grain"]'); await grain.fill('60'); await grain.press('Enter')
await p.screenshot({ path: `/tmp/shots/e-grain.png`, clip: { x: 430, y: 330, width: 580, height: 230 } })
await grain.fill('0'); await grain.press('Enter')
await p.locator('[data-section="effects"] select').selectOption('difference')
h = await L(p, 'Headline')
check(h.effects.blend === 'difference' && h.effects.shadows.length === 1, 'blend + shadow stored')
const blend = await p.evaluate((id) => getComputedStyle(document.querySelector(`[data-layer="${id}"]`)).mixBlendMode, h.id)
check(blend === 'difference', 'mix-blend-mode applied: ' + blend)
await p.screenshot({ path: `/tmp/shots/e-final.png`, clip: { x: 430, y: 330, width: 580, height: 230 } })
console.log('errors:', errs.join('\n'))
await b.close()
