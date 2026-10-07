// usage: node sim-dump.mjs page.html  -> prints, for every capstone scenario, the result card + event count (sanity check of the model)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const file = path.resolve(process.argv[2]);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + file); await new Promise(r => setTimeout(r, 400));
const n = await p.evaluate(() => document.querySelector('#simScn').options.length);
for (let i = 0; i < n; i++) {
  const r = await p.evaluate(i => { const s = document.querySelector('#simScn'); s.value = i; s.dispatchEvent(new Event('change')); return { scn: s.options[i].text, n: document.querySelector('#simN').value, res: (document.querySelector('#simRes') || {}).innerText, ev: SIM.run.events.length, end: SIM.end, err: SIM.run.err }; }, i);
  console.log(`\n[${i}] ${r.scn} · nodes=${r.n} · events=${r.ev} · end=${(r.end / 1000).toFixed(1)}s ${r.err ? 'ERR ' + r.err : ''}\n    ${(r.res || '').replace(/\n/g, ' | ')}`);
}
if (errs.length) console.log('ERRORS', errs);
await b.close();
