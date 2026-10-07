// usage: node sim-try.mjs page.html scenarioIndex '{"setting":"value",...}' [nodes]
import puppeteer from 'puppeteer-core'; import path from 'node:path';
const [, , f, i, js, nn] = process.argv;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto('file://' + path.resolve(f)); await new Promise(r => setTimeout(r, 300));
const out = await p.evaluate((i, set, nn) => {
  const s = document.querySelector('#simScn'); s.value = i; s.dispatchEvent(new Event('change'));
  if (nn) { const n = document.querySelector('#simN'); n.value = nn; n.dispatchEvent(new Event('change')); }
  for (const [k, v] of Object.entries(JSON.parse(set || '{}'))) { const el = document.querySelector(`#simSet [data-set="${k}"]`); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
  return document.querySelector('#simRes').innerText.replace(/\n/g, ' | ');
}, i, js, nn);
console.log(out); await b.close();
