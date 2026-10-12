import { open, S, L, check } from './lib.mjs'
const { b, p, errs } = await open()
await p.mouse.click(600, 420)
await p.locator('[data-tab="style"]').click()
for (const g of [20, 50, 80]) {
const grain = p.locator('[data-section="effects"] input[aria-label="Grain"]'); await grain.fill(String(g)); await grain.press('Enter')
await p.screenshot({ path: `/tmp/shots/g-${g}.png`, clip: { x: 430, y: 330, width: 580, height: 230 } })
}
await b.close()
