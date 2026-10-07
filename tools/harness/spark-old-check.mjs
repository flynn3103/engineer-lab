// Quick check for the older Spark pages (01-03): console errors, horizontal overflow at 390/1280, light/dark,
// a short interaction per page, and screenshots.  usage: node spark-old-check.mjs OUTDIR page.html...
import puppeteer from 'puppeteer-core'; import path from 'node:path'; import fs from 'node:fs';
const [out, ...pages] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0;
for (const f of pages) for (const [w, sch] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900, isMobile: w < 600, hasTouch: w < 600 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: sch }]);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
  await p.goto('file://' + path.resolve(f)); await sleep(400);
  const n = path.basename(f).slice(0, 2);
  // interact
  if (n === '01') { await p.evaluate(() => { for (const op of ['Map', 'Filter', 'FlatMap', 'KeyBy']) document.querySelector(`#s1 button[data-op="${op}"]`).click(); document.querySelector('#fP').value = 5; document.querySelector('#fP').dispatchEvent(new Event('input')); }); }
  if (n === '02') { await p.evaluate(() => document.querySelector('#run').click()); await sleep(2500); }
  if (n === '03') { await p.evaluate(() => document.querySelector('#auto').click()); await sleep(1700);
    const keep = await p.evaluate(() => { window.__c = document.querySelector('#stages .st'); window.__r = document.querySelector('#dag rect'); return true; }); await sleep(3200);
    const same = await p.evaluate(() => ({ st: !window.__c || window.__c.isConnected, r: window.__r.isConnected }));
    if (!same.st || !same.r) { fails++; console.log(`FAIL ${f} @${w}: nodes replaced during auto-play`, same); } }
  // compare with the requested width: on a mobile viewport Chrome widens innerWidth to fit overflowing content
  const ov = await p.evaluate(W => ({ sw: Math.max(document.documentElement.scrollWidth, innerWidth), bad: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); if (r.right <= W + 1 || !r.width) return false; const pr = e.parentElement.getBoundingClientRect(); return pr.right <= W + 1 || e.parentElement === document.body; }).slice(0, 6).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className.baseVal ?? e.className).split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().right)) }), w);
  if (ov.sw > w + 1) { fails++; console.log(`FAIL ${f} @${w} ${sch}: horizontal overflow ${ov.sw} > ${w}: ${ov.bad.join(', ')}`); }
  if (errs.length) { fails++; console.log(`FAIL ${f} @${w} ${sch}: errors`, errs); }
  await p.screenshot({ path: path.join(out, `old-${n}-${w}-${sch}.png`), fullPage: true });
  await p.close();
}
await b.close(); console.log(fails ? `${fails} failure(s)` : 'ALL OK');
