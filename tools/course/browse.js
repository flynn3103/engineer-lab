#!/usr/bin/env node
/* Browser pass over a whole course page with Playwright and the pre-installed Chromium.
 *   node tools/course/browse.js techstack/redis/design/design.html [--shots dir] [--no-diagrams]
 * Visits the overview, every feature and every use case in light and dark themes (desktop and phone width), presses Next to the
 * end of each player, and fails on page errors, empty pictures, horizontal overflow, or a Mermaid diagram that did not draw.
 * Mermaid: uses MERMAID_JS if set, else installs mermaid@10.9.1 once into a temp cache (the CDN may be blocked in a sandbox). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const args = process.argv.slice(2), si = args.indexOf('--shots');
const shots = si >= 0 ? args[si + 1] : null, wantDiagrams = !args.includes('--no-diagrams');
const page = args.find((a, i) => !a.startsWith('--') && (si < 0 || i !== si + 1));
if (!page) { console.error('usage: node browse.js <course page .html> [--shots dir] [--no-diagrams]'); process.exit(2); }
function playwright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', path.join(cp.execSync('npm root -g').toString().trim(), 'playwright')]) { try { return require(p); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed');
}
function mermaidFile() {
  if (process.env.MERMAID_JS && fs.existsSync(process.env.MERMAID_JS)) return process.env.MERMAID_JS;
  const dir = path.join(os.tmpdir(), 'course-mermaid'), f = path.join(dir, 'node_modules/mermaid/dist/mermaid.min.js');
  if (fs.existsSync(f)) return f;
  try { fs.mkdirSync(dir, { recursive: true }); cp.execSync('npm init -y && npm install mermaid@10.9.1 --no-audit --no-fund', { cwd: dir, stdio: 'ignore', timeout: 240000 }); } catch (e) { return null; }
  return fs.existsSync(f) ? f : null;
}
(async () => {
  const { chromium } = playwright(), url = 'file://' + path.resolve(page), mm = wantDiagrams ? mermaidFile() : null, errs = [];
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const b = await chromium.launch();
  const runs = [['light', 1100], ['dark', 390]];
  for (const [scheme, width] of runs) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
    if (mm) await ctx.route('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/**', r => r.fulfill({ path: mm, contentType: 'application/javascript' }));
    else if (!wantDiagrams) await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${scheme} pageerror ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !(!wantDiagrams && /ERR_FAILED|net::/.test(m.text()))) errs.push(`${scheme} console ${m.text()}`); });
    await p.goto(url);
    const shape = await p.evaluate(() => CourseData.features.map(f => (CourseData.uc[f.id] || []).length));
    const routes = ['#/']; shape.forEach((n, i) => { routes.push('#/f/' + (i + 1)); for (let u = 1; u <= n; u++) routes.push('#/f/' + (i + 1) + '/u/' + u); });
    let pages = 0, diagrams = 0, stepsShown = 0;
    for (const h of routes) {
      await p.goto(url + h); await p.reload(); pages++;
      if (/\/u\//.test(h)) {
        await p.waitForSelector('#c-pic');
        for (let k = 0; k < 9; k++) {
          const len = await p.$eval('#c-pic', e => e.innerHTML.length); if (len < 30) errs.push(`${scheme} ${h} step ${k + 1}: empty picture`);
          stepsShown++;
          if (await p.$eval('#c-next', e => e.disabled)) break;
          await p.click('#c-next');
        }
      }
      if (wantDiagrams) {
        await p.waitForFunction(() => [...document.querySelectorAll('[data-mermaid]')].every(x => x.getAttribute('data-drawn')), null, { timeout: 30000 }).catch(() => errs.push(`${scheme} ${h}: diagrams did not settle`));
        const st = await p.$$eval('[data-mermaid]', ns => ns.map(n => n.getAttribute('data-drawn')));
        diagrams += st.filter(x => x === '1').length;
        if (st.some(x => x !== '1')) errs.push(`${scheme} ${h}: diagram states ${st.join(',')}`);
        if (h !== '#/' && st.length === 0) errs.push(`${scheme} ${h}: no diagram on the page`);
      }
      const ow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ow > 1) errs.push(`${scheme} ${h}: horizontal overflow ${ow}px`);
      if (shots && scheme === 'light') await p.screenshot({ path: path.join(shots, h.replace(/[#\/]+/g, '_') + '.png'), fullPage: true });
    }
    console.log(`${scheme} ${width}px: ${pages} pages, ${stepsShown} steps shown, ${diagrams} diagrams drawn`);
    await ctx.close();
  }
  await b.close();
  console.log(errs.length ? errs.join('\n') : 'no errors'); process.exit(errs.length ? 1 : 0);
})();
