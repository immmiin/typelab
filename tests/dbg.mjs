import { open, S, L, check } from './lib.mjs'
const { b, p, errs } = await open()
await p.mouse.click(600, 420)
console.log((await S(p)).sel)
await p.mouse.click(500, 155, { modifiers: ['Shift'] })
console.log((await S(p)).sel)
await p.keyboard.down('Shift'); await p.mouse.click(500, 155); await p.keyboard.up('Shift')
console.log((await S(p)).sel)
await b.close()
