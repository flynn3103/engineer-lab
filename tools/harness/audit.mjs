// Deeper audit: draw() purity (playing/scrubbing must not change the final state), scrub sensitivity, dangling #ids.
// usage: node audit.mjs page.html...
import puppeteer from 'puppeteer-core'; import path from 'node:path'; import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let bad = 0;
for (const f of process.argv.slice(2)) {
  console.log('== ' + f);
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(f)); await sleep(500);
  const n = await p.evaluate(() => Lab.cfg.phases.length);
  await p.select('#speed', '4');
  for (let k = 0; k < n; k++) {
    await p.evaluate(k => jumpPhase(k, false), k); await sleep(100);
    const a = await p.evaluate(k => Lab.cfg.phases[k].draw(1), k);
    const lo = await p.evaluate(k => Lab.cfg.phases[k].draw(0.15), k);
    const hi = await p.evaluate(k => Lab.cfg.phases[k].draw(0.85), k);
    const live = await p.evaluate(k => !!Lab.cfg.phases[k].live, k);
    await p.evaluate(() => scrollTo(0, document.querySelector('#chLab').offsetTop - 80));
    await p.evaluate(() => document.querySelector('#anim').click()); await sleep(1600);
    await p.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 300; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(100);
    const c = await p.evaluate(k => Lab.cfg.phases[k].draw(1), k);
    const title = await p.evaluate(k => Lab.cfg.phases[k].t, k);
    if (a !== c) { bad++; console.log(`   FAIL ch${k + 1} ${title}: draw(1) differs after play+scrub (engine state was mutated)`); }
    if (lo === hi && !live) console.log(`   note ch${k + 1} ${title}: scrubbing has no visible effect (draw(.15)==draw(.85)) -> consider live:true`);
  }
  // dangling ids referenced by the script
  const html = fs.readFileSync(f, 'utf8');
  const ids = new Set([...html.matchAll(/(?:\$\('#([A-Za-z][\w-]*)'\)|getElementById\('([A-Za-z][\w-]*)'\))/g)].map(m => m[1] || m[2]));
  const missing = await p.evaluate(ids => ids.filter(i => !document.getElementById(i)), [...ids]);
  if (missing.length) console.log('   note ids referenced but absent from the DOM (may be created later): ' + missing.join(', '));
  if (errs.length) { bad++; console.log('   FAIL page errors: ' + errs.slice(0, 3).join(' | ')); }
  await p.close();
}
await b.close(); console.log(bad ? `\n${bad} PROBLEMS` : '\nAUDIT OK'); process.exit(bad ? 1 : 0);
