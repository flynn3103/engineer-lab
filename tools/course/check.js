#!/usr/bin/env node
/* Validate a course page without a browser.
 *   node tools/course/check.js techstack/redis/design/design.html
 * Loads the page's <script src> files in order inside a sandbox (no DOM), then runs Course.validate(CourseData):
 * required fields, 5 to 7 steps, 2 edge cases, unique picture forms, a painter for every form, every step painted
 * without "undefined", "NaN" or "[object", Mermaid sources linted. Exit code 1 when there are errors. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const page = process.argv[2];
if (!page) { console.error('usage: node check.js <course page .html>'); process.exit(2); }
const html = fs.readFileSync(page, 'utf8'), dir = path.dirname(page);
const ctx = { console, TextEncoder, TextDecoder }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
for (const s of srcs) {
  const f = path.resolve(dir, s);
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: s }).runInContext(ctx); } catch (e) { console.log('FAIL loading ' + s + ': ' + e.message); process.exit(1); }
}
if (!ctx.Course || !ctx.Course.validate) { console.log('FAIL: assets/course/contract.js was not loaded by the page'); process.exit(1); }
const r = ctx.Course.validate(ctx.CourseData);
r.errors.forEach(m => console.log('ERROR  ' + m));
r.warnings.forEach(m => console.log('warn   ' + m));
console.log(`features ${r.stats.features} · use cases ${r.stats.useCases} · steps ${r.stats.steps} · picture forms ${r.stats.forms} · custom simulations ${r.stats.custom || 0} · diagrams ${r.stats.diagrams} · errors ${r.errors.length} · warnings ${r.warnings.length}`);
process.exit(r.errors.length ? 1 : 0);
