import { chromium } from 'playwright'
export async function open({ clear = true, w = 1440, h = 900 } = {}) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()) })
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
  await p.goto('http://localhost:4173/')
  if (clear) { await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('typelab') }); await p.reload() }
  await p.waitForFunction(() => window.__typelab && window.__typelab.useFonts.getState().ready)
  await p.waitForTimeout(400)
  return { b, ctx, p, errs }
}
export const S = (p) => p.evaluate(() => { const s = window.__typelab.useStore.getState(); return { doc: s.doc, sel: s.sel, editing: s.editing, textSel: s.textSel, view: s.view, tool: s.tool, past: s.past.length, charMode: s.charMode } })
export const L = async (p, name) => (await S(p)).doc.layers.find(l => l.name === name)
export function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1 }
