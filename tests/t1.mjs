import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
await p.goto('http://localhost:4173/')
await p.waitForTimeout(1500)
// click headline
await p.mouse.click(600, 420)
await p.waitForTimeout(200)
await p.screenshot({ path: '/tmp/shots/02.png' })
// scroll inspector
await p.locator('[data-section="variable"]').scrollIntoViewIfNeeded()
await p.screenshot({ path: '/tmp/shots/03.png' })
await p.locator('[data-section="opentype"]').scrollIntoViewIfNeeded()
await p.screenshot({ path: '/tmp/shots/04.png' })
console.log(errs.join('\n'))
await b.close()
