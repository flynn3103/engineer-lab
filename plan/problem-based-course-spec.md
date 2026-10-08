# Problem-Based Course Spec: shared build contract for six tech pages

## Scope
Six pages get new content at their existing paths. Do not rename them.
- `techstack/spark/01-spark-internals-end-to-end.html`
- `techstack/scylla/01-scylla-internals-end-to-end.html`
- `techstack/redis/01-redis-internals-end-to-end.html`
- `techstack/kafka/01-kafka-internals-end-to-end.html`
- `techstack/postgres/01-postgres-internals-end-to-end.html`
- `techstack/k8s/01-k8s-internals-end-to-end.html` ("kubenet" in the request means this page)

Format reference: `techstack/database-systems/01-database-systems-end-to-end.html`. Course content is per tech, in `plan/<tech>-course-chapter-plan.md`.

## 0. Reference snapshot (the reference changes under us)
Someone else is editing the reference while this work runs. Do not copy from the live file.

Before the writers start, the lead copies it once:
`cp techstack/database-systems/01-database-systems-end-to-end.html "$SCRATCH/pbl-reference.html"`
and records `shasum -a 256` of the copy in the work split.

As of 2026-10-08 the file was 1674 lines (sha256 094d35ad…518d). The line numbers below are from that version. The **marker lines are authoritative**; the numbers are only a guide.

## 1. Page skeleton: framework versus per-tech content

The page has three inline `<script>` blocks, no `<script src>`, and only one stylesheet link (`../../assets/lab.css`). Drop `lab.js`, `Lab.mount(STORY)` and the STORY engine entirely. Never edit `assets/lab.css` or `assets/lab.js`.

| Part | Copy rule | Snapshot marker lines (≈ line numbers) |
|---|---|---|
| F1 head | Verbatim, except the `<title>` line, which becomes `<COURSE.title> · course` | lines 1–5 and 7 (`<!doctype html>` … `<link rel="stylesheet" href="../../assets/lab.css">`) |
| F2 core CSS | Verbatim | from `<style>` to the line starting `.course-custom{` (≈8–124) |
| (omit) | Omit: `sqlcs-*`, used only by the database chapter 1 | ≈125–181 |
| F3 animation CSS | Verbatim | from `/* chapter 2 · buffer pool playground and architecture animation */` to the line before `.lay{` (≈182–236) |
| (omit) | Omit: `lay/pq/st/wk-*` | ≈237–299 |
| F4 card CSS | Verbatim | the 3 lines starting `.ar-card` (≈300–302) |
| (omit) | Omit: `sx-*` | ≈303–390 |
| T1 tech CSS | Per tech, placed after F4 and before `</style>` | — |
| F5 body open | Verbatim | `</style>`, `</head>`, `<body>`, `<div id="app"></div>` (≈391–394) |
| Block 1 | `<script>`; F6 helpers verbatim, from `/* ---- tiny helpers shared…` to `API.diagram = diagram;` (≈396–481); then per-tech `COURSE`, `PHASES`, `CHAPTERS`; then `</script>` | — |
| Block 2 | `<script>`; F7 `archAnim` verbatim, from `/* architecture: one request walks through the boxes…` to the line before `/* one simulator for every common problem` (≈1150–1235); then per-tech helpers and every `PG.<key>`; then `</script>` | — |
| Block 3 | `<script>`; F8 router verbatim, from `/* ---- router + chapter renderer…` to `route();`, **plus the problem-based amendment (§1.1)**; then `</script></body></html>` | ≈1579–1674 |

**Do not copy:** `walkAnim`, `poolSim`, `simView`, `SQL_*`/`sql*` helpers, `PG.relational`, `PG.storage`, the `previewProblems` helper, the placeholder `for (const k of [...]) if (!PG[k]) …` loop, or any `<script src="chapters/...">`.

The router still mentions `walkAnim`/`simView`, but only when `c.walk` or `x.sim` exists. Those fields are forbidden (§2), so the missing functions are never called.

**Rule:** F1–F8 and the amendment must be byte-identical on all six pages. A writer never "improves" the framework. A framework bug is reported to the lead and fixed on all six pages together.

### 1.1 Problem-based amendment to F8 (deliberate, identical on all six pages)

(a) Insert this function immediately before `function chapter(i) {`:
```js
/* ---- problem-based amendment: predict before the mechanism. Keep byte-identical on all six pages ---- */
function predictBlock(c, numEl) {
  const P = c.predict;
  const why = h('p', { class: 'note why', html: '<b>Why:</b> ' + P.why });
  why.hidden = true;
  const opts = h('div', { class: 'opts', role: 'group', 'aria-label': 'Choose a prediction' });
  P.opts.forEach((o, k) => opts.append(h('button', { html: o, onclick() {
    [...opts.children].forEach((b, j) => { b.disabled = true; b.classList.toggle('right', j === P.ans); b.classList.toggle('wrong', j === k && k !== P.ans); });
    why.hidden = false;
  } })));
  return h('section', { class: 'blk quiz' }, h('h3', {}, numEl, 'Predict before you read on'), h('p', { class: 'q', html: P.q }), opts, why);
}
```
(b) In `chapter(i)`, insert this one line directly after the line containing `'The problem'`:
```js
    c.predict ? predictBlock(c, num()) : null,
```
It uses the reference's existing `.quiz` CSS (in F2). The result is this rendered order:
1. the problem
2. predict
3. the idea, or an `archSteps` animation
4. the architecture and playground
5. common problems
6. navigation

## 2. Chapter template (the problem-based flow)

Every chapter follows this flow:
**problem → predict → mechanism → playground → diagnose.**

Each item of `CHAPTERS[i]` has the fields below. Fields marked "index" are not rendered; they feed `data/tech-index.js`.

| Field | Req. | Content rule |
|---|---|---|
| `ask` | yes | One question, at most about 25 words, plain text. It renders as the bold question in the problem box and becomes the index `summary`. |
| `scene` | yes | 2–4 HTML paragraphs telling a concrete production incident: who, what load, what broke, and what the on-call engineer sees. Numbers carry "(illustrative)" unless sourced. The problem must not be explained here. |
| `predict` | yes | `{q, opts:[3 or 4 HTML strings], ans:<index>, why:<HTML>}`. The question must be answerable by reasoning from earlier chapters plus the scene. The wrong options are plausible misconceptions. |
| `idea` | yes* | 3–5 HTML bullets naming the mechanism's real components (`<b>` the component, `<code>` real config keys). *Not rendered when `archSteps` is used; it is still required for review. |
| `arch` | yes | A `diagram()` spec `{w≤640, h, boxes:[[id,x,y,w,h,'Title\nsub',tone 0–7]], arrows:[[from,to,label,dashed]], cap}`. With `archSteps`, it also needs `comp:{<every box id>:{n,d}}` and the chapter needs `archTitle`. |
| `archSteps` | optional | At most 2 chapters per page, only where the mechanism is a request path. Format: `{modes:[{v,l}], intro:{mode:text}, <mode>:[{t, box:[ids], arrows:[idx], dot:[[from,to]]|null}]}`, as in the reference's `archAnim`. |
| `archNote` | optional | HTML shown under the diagram. |
| `pg` | yes | A unique key; `PG[pg]` must be defined in block 2. |
| `common` | yes | 3–4 rich failure scenarios (§2.2). |
| `why`, `principle`, `design` | yes (index) | One sentence each, plain text: why the mechanism exists, the general principle, and the design choice. |

Forbidden: `layout:'custom'`, `walk`, `walks`, `sim`, `previewProblems`, and placeholder text ("coming", "being written", "TBD").

`PHASES[i] = {t:'Title Case Short Name', s:'three · short · tags'}`. `PHASES.length === CHAPTERS.length`. The words in `s` become the index tags.

`COURSE = {title:'<display name>', kick:'<N> chapters · problem-based · <tech> <pinned version>', h1:'… <span>…</span>', lead:'<2–3 sentences: the course-wide production problem>', flat:true, parts:[{name:'<title>', from:0, to:N}]}`. Display names: Apache Spark, ScyllaDB, Redis, Apache Kafka, PostgreSQL, Kubernetes. Leave out `other`.

### 2.1 Playground contract (`PG.<key> = function (root, A) {…}`)

- Append exactly one `h('div',{class:'pgbox'}, …)` to `root`.
- The first child is `h('p',{class:'pgwhy'},'Hypothesis to test: …')`. It restates the chapter's predict question as something the learner can test.
- **Controls:** at least 2 interactive inputs (`A.seg`, `A.slider`, `A.btn`). One of them must be a preset pair: **"Reproduce the incident"** (it loads the scene's failing configuration) and **"Apply the fix"**.
- **Outputs:** at least 2 measurable numbers in `A.stat([...])`, using `cls:'bad'|'ok'`. These are numbers, not prose. Optional: `A.logbox()` with real-format log lines; an SVG or `vizPane`-style visual.
- **Deterministic:** randomness only via `A.rng(seed)` with a fixed seed. No `Math.random`, `Date.now`, `new Date()`, `fetch`, `XMLHttpRequest`, `WebSocket` or `localStorage`, and no network.
- **Animation:** use `A.player({step, reset, speed})`. Any raw `setInterval`/`setTimeout` must be pushed to `A.timers`, so that `route()` stops it.
- **Footer:** a `A.note('Illustrative model: …')` stating what is simplified.
- **No duplicates:** each playground models its own chapter's mechanism. No two playgrounds on the same page share a model or controls set. Shared engine code is fine only if it is parameterised differently and teaches a different variable.
- **No top-level DOM access in blocks 1–2.** Touch the DOM only inside functions; the check script evaluates blocks 1–2 headless.

### 2.2 Common-problem entry (diagnose-and-fix)

```js
{tab:'Short tab', t:'Title (HTML)', sym:'<b>Symptom</b> the on-call sees', ctx:'Scenario context (HTML)',
 seen:'optional: where publicly documented', why:'Root cause (HTML)',
 log:{text:'plain text: real-format log, metric or CLI output; first line "-- representative output, values illustrative" if not verbatim',
      note:'How to read it (HTML). End with: Source: <a href="URL" target="_blank" rel="noopener">Doc title</a>'},
 viz:{bad:{rows:[{l:'label',cells:[['text','ok|bad|warn|off',flex]]}], bars:[['label',pct,'ok|bad|warn','text']], cap:'…'},
      good:{…same shape, after the fix…}},
 fix:['Measure first: …','Fix: …','Fix: …','Verify: … (observable signal)']}
```

Rules:
- `fix` has at least 3 steps; the first step measures and the last step verifies.
- Scenarios must not overlap: each failure title appears once per page.
- A failure belongs to the chapter whose mechanism causes it. The per-tech plans assign them.

### 2.3 Worked example (shape only; Redis ch4)
```js
{ask:'The memory budget is full and a new key arrives. What do you throw away?',
 why:'A byte budget forces a choice between rejecting writes and evicting live data.',
 principle:'Approximate a global policy by sampling instead of keeping a global order.',
 design:'Sample maxmemory-samples keys and evict the worst by idle time (LRU) or decayed frequency (LFU).',
 scene:['A session cache runs with <code>maxmemory 2gb</code> (illustrative). At 21:00 the marketing push doubles logins.','Checkout starts failing with errors from Redis; nothing in the app changed.'],
 predict:{q:'Policy is <code>noeviction</code> and memory is full. What happens to a <code>GET</code> and a <code>SET</code>?',
  opts:['Both fail','GET works, SET fails with OOM','Redis evicts the oldest key and both work'],ans:1,
  why:'noeviction rejects commands that may grow memory; reads still run.'},
 idea:['<b>maxmemory</b> is the byte budget…','<b>Sampled LRU</b>…','<b>LFU</b> counter…'],
 arch:{w:600,h:260,cap:'…',boxes:[['cmd',10,100,120,60,'Command\nSET k v',0],['mem',220,100,160,60,'Memory check\nused vs maxmemory',1],['pool',440,30,150,60,'Eviction pool\nsampled keys',2],['ks',440,170,150,60,'Keyspace',3]],arrows:[['cmd','mem','1 needs bytes'],['mem','pool','2 over budget'],['pool','ks','3 evict worst']]},
 pg:'eviction',
 common:[ /* 3–4 entries per §2.2 */ ]}
```
Playground skeleton:
```js
PG.eviction = function (root, A) {
  const { h, seg, slider, stat, btn, bar, note, rng } = A;
  let policy = 'noeviction', budget = 60;
  const out = stat([]);
  function run() { const r = rng(42); /* deterministic workload → counters */ out.update([{l:'writes rejected',v:0,cls:'ok'},{l:'hit rate',v:'0%'}]); }
  root.append(h('div', { class: 'pgbox' },
    h('p', { class: 'pgwhy' }, 'Hypothesis to test: under noeviction, reads keep working and writes fail.'),
    bar(seg(['noeviction','allkeys-lru','allkeys-lfu','volatile-lru'], policy, v => { policy = v; run(); }),
        slider('maxmemory (keys)', 20, 100, budget, 10, v => { budget = v; run(); })),
    bar(btn('Reproduce the incident', () => { /* set failing config */ run(); }), btn('Apply the fix', () => { run(); })),
    out, note('Illustrative model: memory counted in keys, not bytes.')));
  run();
};
```

## 3. Anchors and the site index
- The router produces `#ch0 … #ch{N-1}` automatically from `CHAPTERS`. They are zero-based; `#chN` is shown as "chapter N+1".
- **ch0 is a real problem-based chapter**, not a cheat sheet. The hash-less page is the overview (hero, `COURSE.lead`, chapter tiles) and serves as the intro.
- Old anchors still resolve, because every new count is at least the old count. The index text is rewritten anyway.
- `tools/build_site_index.py` is deleted. **The lead alone** updates `data/tech-index.js` and `data/systems.js` after review passes. Writers never touch `data/`.

**Manual rule for `data/tech-index.js`:**
1. For each of the six systems, delete that system's `Tour` entry and all its `Chapter` entries.
2. Insert new entries in the same position:
   - Tour: `{type:'Tour', system:'<id>', title:'<Display> internals, end to end', summary:<COURSE.lead, plain text>, body:<comma list of PHASES[].t>, url:'techstack/<id>/01-<id>-internals-end-to-end.html', tags:['tour','interactive']}`.
   - Per chapter i: `{type:'Chapter', system:'<id>', title:'<COURSE.title> · <i+1>. <PHASES[i].t>', summary:<ask, HTML stripped>, body:<PHASES[i].s + ' ' + why + '  ' + principle + ' ' + design, HTML stripped>, url:'…html#ch<i>', tags:<lowercased words of PHASES[i].s, split on non-alphanumerics, de-duplicated>}`.
3. Renumber `id` from 0 in file order, because `tech.html` sorts by `id`.
4. Replace the header comment with `/* maintained by hand (tools/build_site_index.py was removed); rules in plan/problem-based-course-spec.md §3 */`.
5. Keep the JSON-like formatting (double quotes, one key per line).
6. In `data/systems.js`, set `chapters:` to the new N and update `topics:` to 4–6 words from the new chapters.

## 4. Language, accessibility, responsive design
- Everything is in English (content, labels, buttons, logs). Use a plain, direct register like the reference.
- In single-quoted JS strings, never use a raw ASCII apostrophe in prose. Use `’` or `&rsquo;`, or a template literal.
- Use only theme tokens: `--ink --mut --bg --card --soft --line --acc --acc2 --ok --bad --warn --shadow --p0…--p7`. Hard-coded hex colours are allowed only inside dark code panes. This gives light and dark mode for free.
- **Phone width 360 px.** No fixed widths over 340 px outside an `.svgw` horizontal-scroll wrapper. Use `.cols.two` and `.split` for side-by-side layouts, because they collapse below 760 px. Add `@media(max-width:620px)` rules for every tech grid.
- Add `@media(prefers-reduced-motion:reduce)` to disable tech CSS transitions and animations.
- Interactive elements are `<button>` or `<input>`. SVGs carry `role="img"` and an `aria-label`. Live outputs use `aria-live="polite"` (the logbox already does).
- Tech CSS classes use a per-page prefix: `spk-`, `scy-`, `rds-`, `kfk-`, `pgx-`, `k8s-`. Never `pg-`, which collides with `.pg`.

## 5. Honesty rules
- Any invented number (sizes, latencies, counts) is labelled "illustrative", either in the sentence or in the `log.text` first line. No benchmarks, no "X% faster" claims without a source.
- **Config keys, defaults, API names, CLI commands, metric names and error strings** must exist in the pinned version: Spark 3.5, Kafka 3.9 (KRaft), ScyllaDB 2025.x, Redis 7.2+, PostgreSQL 16/17, Kubernetes 1.30+. Put the version in `COURSE.kick`.
  - If a string is paraphrased, say "representative output, wording varies by version".
  - If you cannot verify an item, leave it out. Do not guess.
- **Source-code paths** named in a page must be verified at the pinned tag (WebFetch of the GitHub tree). Otherwise cite the official docs page instead.
- Every `common` entry ends `log.note` with one source link to official docs, a KIP, or a source file.
- **Kafka and Scylla:** migrate the existing incident objects. Field map:
  - `title→t`
  - `context→ctx`
  - `symptom→sym`
  - `signal→log.text`
  - `signalNote + INCIDENT_SOURCES[source]→log.note`
  - `cause→why`
  - `fix + trade + verify→fix` (the trade-off becomes a step starting "Trade-off:"; verify becomes the last step)
  - `view→viz{bad,good}`

## 6. Validation (writer runs before handing off; reviewer re-runs)
The lead saves this as `$SCRATCH/check-course.js`. Run:
`node check-course.js techstack/<tech>/01-<tech>-internals-end-to-end.html "$SCRATCH/pbl-reference.html" <N>`
It must print `OK`.
```js
'use strict';
const fs = require('fs'), vm = require('vm');
const [pagePath, refPath, wantStr] = process.argv.slice(2);
const src = fs.readFileSync(pagePath, 'utf8'), ref = fs.readFileSync(refPath, 'utf8').split('\n');
const errs = [], fail = m => errs.push(m), want = Number(wantStr);
const find = (pred, from = 0) => { for (let i = from; i < ref.length; i++) if (pred(ref[i])) return i; throw new Error('reference marker not found'); };
const sw = s => l => l.startsWith(s), cut = (a, b) => ref.slice(a, b + 1).join('\n').trim();
const iStyle = find(sw('<style>')), iCustom = find(sw('.course-custom{'));
const iArchCss = find(sw('/* chapter 2 · buffer pool playground')), iLay = find(sw('.lay{'), iArchCss), iCard = find(sw('.ar-card{'));
const iHelp = find(sw('/* ---- tiny helpers')), iDiag = find(sw('API.diagram = diagram;'), iHelp);
const iArch = find(sw('/* architecture: one request walks')), iSim = find(sw('/* one simulator for every common problem'), iArch);
const iRouter = find(sw('/* ---- router + chapter renderer')), iChap = find(sw('function chapter(i) {'), iRouter);
const iProb = find(l => l.includes("'The problem'"), iChap), iRoute = find(sw('route();'), iProb);
const CH = { head: cut(0, 4), lab: ref[6].trim(), css: cut(iStyle, iCustom), archCss: cut(iArchCss, iLay - 1), card: cut(iCard, iCard + 2),
  helpers: cut(iHelp, iDiag), archAnim: cut(iArch, iSim - 1), router1: cut(iRouter, iChap - 1), router2: cut(iChap, iProb), router3: cut(iProb + 1, iRoute) };
for (const [k, v] of Object.entries(CH)) if (!src.includes(v)) fail('framework chunk differs from reference: ' + k);
if (!src.includes('function predictBlock(c, numEl) {')) fail('missing predictBlock amendment');
if (!src.includes(CH.router2 + '\n    c.predict ? predictBlock(c, num()) : null,')) fail('predict line not inserted right after The problem');
if (/<script[^>]*\bsrc=/.test(src)) fail('external <script src> is not allowed');
if (/incidents\.(js|css)/.test(src)) fail('incident file still referenced');
for (const bad of ['previewProblems', 'is coming', 'being written', 'Lab.mount', 'lab.js', 'Math.random', 'Date.now', 'new Date(', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', "layout:'custom'", 'walkAnim(w)', 'function simView', 'function poolSim'])
  if (src.includes(bad)) fail('forbidden text: ' + bad);
for (const name of ['h', 'svg', 'rng', 'seg', 'slider', 'player', 'logbox', 'stat', 'diagram', 'archAnim', 'topbar', 'overview', 'vizPane', 'commonSection', 'predictBlock', 'chapter', 'route']) {
  const n = src.split('function ' + name + '(').length - 1; if (n !== 1) fail('function ' + name + ' defined ' + n + ' times'); }
const B = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (B.length !== 3) fail('expected 3 inline <script> blocks, found ' + B.length);
B.forEach((b, i) => { try { new vm.Script(b, { filename: 'block' + i }); } catch (e) { fail('syntax error in block ' + i + ': ' + e.message); } });
try { new vm.Script(B.join('\n;\n'), { filename: 'all' }); } catch (e) { fail('blocks clash when combined: ' + e.message); }
let R; try { R = vm.runInNewContext(B.slice(0, 2).join('\n;\n') + '\n;({PHASES, CHAPTERS, COURSE, PG})', { console }); } catch (e) { fail('blocks 1-2 throw at load: ' + e.message); }
if (R) {
  const { PHASES, CHAPTERS, COURSE, PG } = R, n = CHAPTERS.length;
  if (n !== want) fail('chapter count ' + n + ' != plan ' + want);
  if (PHASES.length !== n) fail('PHASES ' + PHASES.length + ' != CHAPTERS ' + n);
  if (!COURSE.flat || COURSE.parts.length !== 1 || COURSE.parts[0].to !== n) fail('COURSE.flat/parts wrong');
  if (!String(COURSE.kick).startsWith(n + ' chapters')) fail('COURSE.kick must start with "' + n + ' chapters"');
  const keys = new Set(), titles = new Set();
  PHASES.forEach((p, i) => { if (!p.t || !p.s) fail('PHASES[' + i + '] needs t and s'); });
  CHAPTERS.forEach((c, i) => {
    const e = m => fail('ch' + i + ': ' + m);
    for (const k of ['ask', 'why', 'principle', 'design', 'pg']) if (typeof c[k] !== 'string' || !c[k].trim()) e('missing ' + k);
    if (!Array.isArray(c.scene) || c.scene.length < 2) e('scene needs 2-4 paragraphs');
    const p = c.predict; if (!p || !p.q || !Array.isArray(p.opts) || p.opts.length < 3 || !(p.ans >= 0 && p.ans < p.opts.length) || !p.why) e('bad predict');
    if (c.layout || c.walk || c.walks) e('layout/walk is forbidden');
    if (!Array.isArray(c.idea) || c.idea.length < 3) e('idea needs >= 3 bullets');
    if (!c.arch || !Array.isArray(c.arch.boxes)) e('missing arch diagram');
    else if (c.archSteps && (!c.archTitle || !c.arch.comp || c.arch.boxes.some(b => !c.arch.comp[b[0]]))) e('archSteps needs archTitle and arch.comp for every box');
    if (typeof PG[c.pg] !== 'function') e('PG.' + c.pg + ' is not defined');
    if (keys.has(c.pg)) e('duplicate pg key ' + c.pg); keys.add(c.pg);
    if (!Array.isArray(c.common) || c.common.length < 3 || c.common.length > 4) e('common needs 3-4 entries');
    (c.common || []).forEach((x, j) => {
      const q = m => e('common[' + j + ']: ' + m);
      for (const k of ['tab', 't', 'sym', 'ctx', 'why']) if (!x[k]) q('missing ' + k);
      if (x.sim) q('sim is forbidden; use viz');
      if (!x.log || !x.log.text || !x.log.note) q('log.text and log.note required');
      else if (!/href=/.test(x.log.note)) q('log.note must end with a source link');
      if (!x.viz || !x.viz.bad || !x.viz.good) q('viz.bad and viz.good required');
      if (!Array.isArray(x.fix) || x.fix.length < 3) q('fix needs >= 3 steps');
      const t = String(x.t).replace(/<[^>]+>/g, '').toLowerCase(); if (titles.has(t)) q('duplicate failure title on page: ' + t); titles.add(t);
    });
  });
}
console.log(errs.length ? errs.join('\n') : 'OK'); process.exitCode = errs.length ? 1 : 0;
```

Also required:
- **Tag balance.** `node -e` with the `parse5` or `htmlparser2` package if available; otherwise open the page in a browser and confirm that the DOM inspector shows no stray text after `</html>`.
- **Browser smoke test** (built-in browser or Chrome tools if available, otherwise the reviewer does it by hand), at 1280 px and 360 px:
  - the overview, then every `#ch0…#ch{N-1}`;
  - there is no `.callout.warn` ("Playground failed to load");
  - there are no console errors;
  - Play, Reset and both presets work in each playground;
  - every common-problem tab and the Failure/After-fix toggle render;
  - there is no horizontal page scroll at 360 px except inside `.svgw`;
  - in dark mode, nothing is unreadable.

## 7. File ownership
- Each writer writes **only** its own `techstack/<tech>/01-<tech>-internals-end-to-end.html`.
- The **Kafka writer** owns `techstack/kafka/kafka-incidents.js` and `kafka-incidents.css`. It migrates their content into `CHAPTERS[].common`, then deletes both files.
- The **Scylla writer** owns `techstack/scylla/scylla-incidents.js` and does the same with it.
- Nobody else touches `data/`, `assets/`, `plan/`, `tech.html`, `index.html`, or the concurrency, distributed, database-systems or os folders.
- `data/*` belongs to the lead (§3).
- No commits or pushes by writers.
