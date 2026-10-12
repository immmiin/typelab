import { open } from './lib.mjs'
for (const [w, hgt] of [[1100, 800], [820, 700], [420, 800]]) {
  const r = await open({ w, h: hgt })
  await r.p.screenshot({ path: `/tmp/shots/resp-${w}.png` })
  console.log('resp', w, 'errors:', r.errs.join(' '), await r.p.evaluate(() => document.documentElement.scrollWidth))
  await r.b.close()
}
