// usage: node os-check.mjs [page.html] [shotDir]
// Exercises every phase of an internals tour: each option of every control is fired, the view is painted at p = 0, .5, 1,
// and any page error or "Render error" box is reported. Then every capstone scenario and the overview trace run.
import puppeteer from 'puppeteer-core'; import path from 'node:path';
const file = process.argv[2] || '../../techstack/os/01-os-internals-end-to-end.html', shots = process.argv[3];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open(w, scheme) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900, isMobile: w < 600, hasTouch: w < 600 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  p.errs = []; p.on('pageerror', e => p.errs.push('pageerror: ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|Failed to load/.test(m.text()) && p.errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(file)); await wait(800); return p;
}
let fails = 0; const bad = m => { fails++; console.log('FAIL', m); };
const p = await open(1200, 'light');
const meta = await p.evaluate(() => ({ ph: Lab.cfg.phases.length, ch: Lab.story.chapters.length, dt: Lab.cfg.detail.length,
  predict: Lab.story.chapters.map((c, i) => c.predict && (c.predict.ans >= 0 && c.predict.ans < c.predict.opts.length) ? 'ok' : 'bad:' + i) }));
console.log('phases', meta.ph, 'chapters', meta.ch, 'detail', meta.dt, 'predict', meta.predict.join(','));
if (meta.ph !== meta.ch || meta.ph !== meta.dt) bad('phase/chapter/detail count mismatch');
meta.predict.filter(x => x !== 'ok').forEach(x => bad('predict ' + x));
const render = async (tag) => {
  for (const pr of [0, 0.5, 1]) {
    await p.evaluate(x => paintView(x), pr);
    const t = await p.$eval('#phView', e => (e.querySelector('.box.bad') || {}).textContent || '');
    if (t) bad(`${tag} p=${pr}: ${t.slice(0, 120)}`);
  }
};
let combos = 0;
for (let k = 0; k < meta.ph; k++) {
  await p.evaluate(x => jumpPhase(x, false), k); await wait(80);
  await render(`ph${k} default`);
  // explore every control; controls can appear or disappear as other controls change, so work through whatever is currently untested
  const done = new Set();
  for (let round = 0; round < 30; round++) {
    const keys = [...new Set(await p.$$eval('#phCtl [data-opt]', els => els.map(e => e.dataset.opt)))].filter(x => !done.has(x));
    if (!keys.length) break;
    const key = keys[keys.length - 1]; done.add(key);
    const vals = await p.$eval(`#phCtl [data-opt="${key}"]`, e => e.tagName === 'SELECT' ? [...e.options].map(o => o.value) : [e.min, String(Math.round((+e.min + +e.max) / 2)), e.max]);
    for (const v of vals) {
      if (!(await p.$(`#phCtl [data-opt="${key}"]`))) break;
      await p.$eval(`#phCtl [data-opt="${key}"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
      await wait(30); combos++;
      await render(`ph${k} ${key}=${v}`);
    }
  }
}
console.log('control combinations painted:', combos);
// predict widgets and trade-off tabs
for (let k = 0; k < meta.ph; k++) { await p.evaluate(x => jumpPhase(x, false), k); await wait(40);
  await p.click('#chPredict .opt'); const fb = await p.$eval('#chPredict .fb', e => e.textContent.length); if (!fb) bad('predict feedback empty ph' + k);
  for (const t of ['pc', 'fm', 'w']) await p.click(`#chTrade [data-t="${t}"]`); }
// capstone scenarios
const scn = await p.$$eval('#simScn option', o => o.map(x => x.value));
for (const s of scn) {
  await p.select('#simScn', s); await p.evaluate(() => document.getElementById('simScn').dispatchEvent(new Event('change'))); await wait(60);
  for (const n of await p.$$eval('#simN option', o => o.map(x => x.value))) { await p.select('#simN', n); await p.evaluate(() => document.getElementById('simN').dispatchEvent(new Event('change'))); await wait(30);
    const r = await p.evaluate(() => ({ err: SIM.run.err, ev: SIM.run.events.length, end: SIM.end }));
    if (r.err || !r.ev) bad(`scenario ${s} n=${n}: err=${r.err} events=${r.ev}`);
    await p.evaluate(e => { const t = document.getElementById('simT'); t.value = e; t.dispatchEvent(new Event('input')); }, r.end); }
  console.log('scenario', s, 'ok');
}
for (const sv of await p.$$eval('#simSet [data-set]', e => e.map(x => [x.dataset.set, [...x.options].map(o => o.value)])))
  for (const v of sv[1]) { await p.evaluate((k, v) => { const el = document.querySelector(`#simSet [data-set="${k}"]`); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, sv[0], v); await wait(30);
    const e = await p.evaluate(() => SIM.run.err); if (e) bad(`setting ${sv[0]}=${v}: ${e}`); }
// overview trace
await p.click('#ovTrace'); await wait(1500); await p.click('#ovClear');
const nodes = await p.$$eval('#ovView [data-node]', n => n.map(x => x.dataset.node));
for (const nd of nodes) await p.evaluate(id => document.querySelector(`#ovView [data-node="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })), nd);
console.log('overview nodes', nodes.length);
if (p.errs.length) { fails += p.errs.length; p.errs.slice(0, 8).forEach(e => console.log('FAIL', e)); }
// layout: no horizontal scroll at 375 px, both themes
for (const sc of ['light', 'dark']) {
  const m = await open(375, sc);
  for (const k of [0, 4, 6, 7, 8, 9, 12]) { await m.evaluate(x => jumpPhase(x, false), k); await wait(150);
    const w = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (w > 1) bad(`375px ${sc} ph${k} overflows by ${w}px`); }
  if (shots) { await m.evaluate(() => jumpPhase(1, false)); await wait(200); await (await m.$('#chapter')).screenshot({ path: `${shots}/os-375-${sc}.png` }); }
  await m.close();
}
if (shots) { await p.evaluate(() => jumpPhase(4, false)); await wait(200); await p.evaluate(() => paintView(1)); await (await p.$('#chapter')).screenshot({ path: `${shots}/os-ch5.png` }); }
console.log(fails ? `${fails} problem(s)` : 'ALL OK');
await b.close(); process.exit(fails ? 1 : 0);
