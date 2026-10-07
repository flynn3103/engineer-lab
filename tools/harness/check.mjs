// Engineer Lab page harness. usage: node check.mjs [--shots DIR] [--quick] page1.html page2.html ...
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
const args = process.argv.slice(2);
let shots = null, quick = false; const pages = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--shots') shots = args[++i]; else if (args[i] === '--quick') quick = true; else pages.push(args[i]); }
if (shots) fs.mkdirSync(shots, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
let failures = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = (msg) => { failures++; console.log('   FAIL ' + msg); };

for (const rel of pages) {
  const file = path.resolve(rel);
  const name = path.basename(path.dirname(path.dirname(file))) + '-' + path.basename(file).slice(0, 2);
  for (const [w, h, scheme] of (quick ? [[390, 800, 'light'], [1280, 900, 'light']] : [[390, 800, 'light'], [390, 800, 'dark'], [1280, 900, 'light'], [1280, 900, 'dark']])) {
    const tag = `${rel} @${w} ${scheme}`;
    console.log('== ' + tag);
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await sleep(400);
    const ok = await page.evaluate(() => !!(window.Lab && Lab.cfg && document.querySelector('#chapter')));
    if (!ok) { fail('Lab did not start'); errors.forEach(e => console.log('   ' + e)); await page.close(); continue; }
    // horizontal overflow
    const ov = await page.evaluate((W) => {
      const iw = W, doc = document.documentElement;
      const bad = [];
      const clipped = el => { for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(); if (r.width === 0) continue;
        if (r.right > iw + 1 && !clipped(el) && getComputedStyle(el).position !== 'fixed') bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(' ')[0] + ' right=' + Math.round(r.right));
      }
      return { sw: doc.scrollWidth, iw, bad: bad.slice(0, 6) };
    }, w);
    if (ov.sw > ov.iw + 1) fail(`horizontal overflow: scrollWidth ${ov.sw} > ${ov.iw}`);
    if (ov.bad.length) fail('unclipped overflow past ' + w + 'px: ' + ov.bad.join(', '));
    const n = await page.evaluate(() => Lab.cfg.phases.length);
    await page.select('#speed', '4');
    // overview trace + selecting a node
    await page.evaluate(() => scrollTo(0, 0)); await page.click('#ovTrace'); await sleep(900);
    const tr = await page.evaluate(() => document.querySelector('#ovCap').textContent);
    if (!/Step [2-9]|Step 1\d/.test(tr)) fail('overview trace did not progress: ' + tr);
    const ovOk = await page.evaluate(() => !!document.querySelector('#ovView svg .ovn'));
    if (!ovOk) fail('overview map empty');
    await page.evaluate(() => document.querySelector('#ovChips button')?.click()); await sleep(100);
    for (let k = 0; k < n; k++) {
      await page.evaluate(k => jumpPhase(k, false), k); await sleep(120);
      const info = await page.evaluate(() => {
        const v = document.querySelector('#phView');
        return { len: v.innerText.length, err: /Render error/.test(document.body.innerText), title: document.querySelector('#chTitle').textContent, svg: !!v.querySelector('svg'), hasProblem: document.querySelector('#chProblem').innerText.length > 5, hasNaive: document.querySelector('#chNaive').innerText.length > 20, hasBuild: document.querySelector('#chBuild').innerText.length > 20 };
      });
      if (info.err) fail(`ch${k + 1} Render error`);
      if (info.len < 5) fail(`ch${k + 1} empty view`);
      if (!info.hasProblem || !info.hasNaive || !info.hasBuild) fail(`ch${k + 1} missing story blocks (${JSON.stringify(info)})`);
      // ops panel: tune-at-scale model must render without errors, move when a slider moves; cases and params present
      const ops = await page.evaluate(() => {
        const box = document.querySelector('#chOpsBox'); if (box.hidden) return { hidden: true };
        const tabs = [...document.querySelectorAll('#chOps [data-ot]')].map(b => b.dataset.ot);
        const r = { tabs, scale: null, cases: 0, params: 0, err: /Model error/.test(box.innerText) };
        if (tabs.includes('scale')) { document.querySelector('#chOps [data-ot=scale]').click(); const before = document.querySelector('#chOps').innerText; const sl = document.querySelector('#chOps input[type=range]'); if (sl) { sl.value = sl.max; sl.dispatchEvent(new Event('input', { bubbles: true })); } r.scale = { cards: document.querySelectorAll('#chOps .oc').length, bars: document.querySelectorAll('#chOps .ob').length, moved: before !== document.querySelector('#chOps').innerText, err: /Model error/.test(document.querySelector('#chOps').innerText) }; }
        if (tabs.includes('cases')) { document.querySelector('#chOps [data-ot=cases]').click(); r.cases = document.querySelectorAll('#chOps details.case').length; const rp = document.querySelector('#chOps [data-repro]'); if (rp) { rp.click(); r.repro = document.querySelector('#chOps [data-ot=scale].act') ? 'ok' : 'no-switch'; } }
        if (tabs.includes('params')) { document.querySelector('#chOps [data-ot=params]').click(); r.params = document.querySelectorAll('#chOps table.pt tr:not(.pg)').length - 1; }
        document.querySelector('#chOps [data-ot]') && document.querySelector('#chOps [data-ot]').click();
        return r;
      });
      if (ops.hidden) fail(`ch${k + 1} has no ops panel (cases / tune / params)`);
      else {
        if (ops.err || (ops.scale && ops.scale.err)) fail(`ch${k + 1} ops model error`);
        if (!ops.tabs.includes('scale') || !ops.scale || ops.scale.cards + ops.scale.bars < 2) fail(`ch${k + 1} tune-at-scale lab is empty (${JSON.stringify(ops.scale)})`);
        else if (!ops.scale.moved) fail(`ch${k + 1} tune-at-scale: moving a slider changed nothing`);
        if (ops.cases < 1) fail(`ch${k + 1} has no case studies`);
        if (ops.params < 2) fail(`ch${k + 1} has no prod parameters table (${ops.params})`);
        if (ops.repro && ops.repro !== 'ok') fail(`ch${k + 1} "Reproduce at scale" did not switch to the lab`);
      }
      // deep dives live inside their chapter, never in a separate section
      const deep = await page.evaluate(() => ({ sep: !!document.querySelector('#extras'), inCh: document.querySelectorAll('#chDeep details.dd').length, visibleOutside: [...document.querySelectorAll('details.dd')].filter(d => !d.closest('#chDeep') && !d.closest('#deepStore')).length }));
      if (deep.sep || deep.visibleOutside) fail(`ch${k + 1} deep dives are outside the chapter (${JSON.stringify(deep)})`);
      // play: measure jank + node identity
      await page.evaluate(() => { window.__gaps = []; window.__last = performance.now(); window.__ref = document.querySelector('#phView svg *'); const f = t => { window.__gaps.push(t - window.__last); window.__last = t; if (window.__run) requestAnimationFrame(f); }; window.__run = true; requestAnimationFrame(f); });
      await page.click('#anim');
      await sleep(900);
      const mid = await page.evaluate(() => ({ ref: window.__ref ? window.__ref.isConnected : null, y: scrollY }));
      await sleep(quick ? 600 : 1500);
      const res = await page.evaluate(() => { window.__run = false; const g = window.__gaps.slice(2); return { max: Math.max(0, ...g), over50: g.filter(x => x > 50).length, n: g.length, state: document.querySelector('#anim').textContent }; });
      if (res.n > 10 && res.over50 > res.n * 0.25) fail(`ch${k + 1} jank: ${res.over50}/${res.n} frames >50ms (max ${Math.round(res.max)}ms)`);
      if (mid.ref === false) console.log(`   note ch${k + 1}: svg node replaced during animation (not morphed)`);
      await page.evaluate(() => document.querySelector('#anim').textContent.includes('Pause') && document.querySelector('#anim').click());
      // scrubber
      await page.evaluate(() => { const s = document.querySelector('#scrub'); if (s.offsetParent) { s.value = 400; s.dispatchEvent(new Event('input', { bubbles: true })); } });
      await sleep(60);
      const after = await page.evaluate(() => /Render error/.test(document.body.innerText));
      if (after) fail(`ch${k + 1} Render error after scrub`);
      if (shots && !quick) { const el = await page.$('#chapter'); if (el) await el.screenshot({ path: path.join(shots, `${name}-${w}-${scheme}-ch${k + 1}.png`) }); }
    }
    // capstone sim
    const hasSim = await page.evaluate(() => !!document.querySelector('#simPlay') && !document.querySelector('#capstone').hidden);
    if (hasSim) {
      await page.evaluate(() => document.querySelector('#capstone').scrollIntoView({behavior:'instant'}));
      await sleep(300);
      const y0 = await page.evaluate(() => scrollY);
      const cap = await page.evaluate(() => { document.querySelector('#simScn').dispatchEvent(new Event('change')); return { res: (document.querySelector('#simRes') || {}).innerText || '', n: document.querySelectorAll('#simScn option').length, gauges: document.querySelectorAll('#simGauge .gz').length, sets: document.querySelectorAll('#simSet [data-set]').length }; });
      if (cap.res.length < 20) fail('capstone has no result card'); if (cap.n < 4) fail('capstone needs >= 4 incident scenarios (has ' + cap.n + ')'); if (cap.sets < 3) fail('capstone needs >= 3 real parameters (has ' + cap.sets + ')'); if (cap.gauges < 3) fail('capstone has no live gauges');
      await page.select('#simSpeed', '4'); await page.evaluate(() => document.querySelector('#simPlay').click()); await sleep(300); const y00 = await page.evaluate(() => scrollY); await sleep(1500);
      const y1 = await page.evaluate(() => scrollY);
      if (Math.abs(y1 - y00) > 5) fail(`simulation scrolled the page (${y0} -> ${y1})`);
      await page.evaluate(() => document.querySelector('.simn')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await sleep(100);
      if (shots) { const el = await page.$('#capstone'); if (el) await el.screenshot({ path: path.join(shots, `${name}-${w}-${scheme}-capstone.png`) }); }
    } else console.log('   note: no capstone sim');
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w}-${scheme}-full.png`), fullPage: true });
    if (errors.length) { fail(errors.length + ' console errors'); errors.slice(0, 5).forEach(e => console.log('   ' + e)); }
    await page.close();
  }
}
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
