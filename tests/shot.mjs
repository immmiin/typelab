import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.text()) })
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
await p.goto('http://localhost:4173/')
await p.waitForTimeout(2500)
await p.screenshot({ path: '/tmp/shots/01.png' })
console.log(errs.slice(0,20).join('\n'))
await b.close()
