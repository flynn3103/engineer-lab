# Course framework

One look, one data contract and one set of checks for every system-design course page on this site. The Redis course
(`techstack/redis/`) is the reference for a course written on the framework from scratch; the Spark course (`techstack/spark/`) uses the same data-file layout and adds reusable animation forms to the framework.

```
assets/course/
  course.css     the style: shell, page head, numbered sections, cards, tables, diagrams, edge cards, pager, player, pictures
  kit.js         picture helpers and reusable forms          -> Course.kit
  animations.js  optional renderer registry and narrated animation player
  animations/    reusable scene painters and computed simulation renderers (btree.js: B+tree insert, split, lookup, range scan; ring.js, quorum.js, lsm.js, raft.js: token ring, quorum reads and writes, LSM write/read/compaction/tombstones, Raft election and replication)
  animations.css, scenes.css, stages.css, btree.css, cluster.css  optional styles for these animation forms
  contract.js    data contract and validator                  -> Course.validate(CourseData)
  course.js      shell, router, page templates, Mermaid, player -> Course.mount(CourseData)
tools/course/
  scaffold.js    start a new course page that already passes the checks
  check.js       validate a page in Node (no browser)
  browse.js      browser pass: every page, both themes, desktop and phone, every step, every diagram
```

## What a course page looks like

A page is a thin `course.html` plus course data files. It loads `lab.css`, `curriculum.css` and `course.css`, then the
scripts in this order, and ends with `Course.mount(CourseData)`:

```html
<script src="../../assets/course/kit.js"></script>
<script src="../../assets/course/contract.js"></script>
<script src="spec.js"></script>  <script src="uc-1.js"></script>  <script src="diagrams.js"></script>  <script src="paint.js"></script>
<script src="../../assets/course/course.js"></script>
<script>Course.mount(CourseData);</script>
```

Pages and routes (hash based, so the site stays static): `#/` overview, `#/f/N` feature, `#/f/N/u/M` use case.

| Page | Sections |
| --- | --- |
| Overview | 01 Overview · 02 Problem statement · 03 Spec · 04 Estimation · 05 High-level design · 06 Features · 07 How the facts were checked |
| Feature | 01 Goal and scope · 02 Spec · 03 High-level design (Mermaid flowchart + decisions) · 04 Use cases |
| Use case | 01 Trigger (+ Run, Expect) · 02 Diagrams (Mermaid) · 03 Step by step (picture + step panel) · 04 Edge cases · 05 Invariant |

## The data contract

One global, `CourseData`, assembled from the files. `Course.validate` enforces it (`node tools/course/check.js <page>`).

| Key | Shape |
| --- | --- |
| `config` | `{ id, name, version, root, brand?, footer?, related?: [{href, title, sub}] }`. `root` is the relative path to the site root (`'../../'`). `brand` is a CSS colour, default red. |
| `spec` | `{ title, navTitle, lead, overview[2], problem[4], fr[], nfr[], out, est[][3], hldNote, decisions[][3], verify[] }`. `problem` rows are scenario, naive design, fails when, principle. |
| `hldOverall` | Mermaid source for the whole system. |
| `features` | `[{ id, tag, name, summary, goal, scope:[[in],[out]], fr[], nfr[], decisions[][3] }]` |
| `hld` | `{ <featureId>: Mermaid source }` |
| `uc` | `{ <featureId>: [ useCase ] }` where `useCase = { title, short, intro, trigger, run, expect, kind, steps, edges, invariant, src }` |
| `diagrams` | `{ '<featureId>:<n>': [ { kind: 'Sequence'\|'State'\|'Flow', title, src } ] }`, `n` starts at 1 |
| `PAINT` | `{ <kind>: (state, step) => html }`, one painter per use case `kind` |

Optional parts, used when a course has them (Spark does): `spec.problemLead`, `spec.inherited`, `spec.goal`, `spec.scope` (a flat list), `spec.contracts`
(a component table), `spec.estAssume`, `spec.estNote`; per feature `problem`, `inherited`, `contracts`, `hldCaption`; per use case `blurb` (card text), and
edges with a `short` line. Without `spec.overview` the Overview section is skipped; without `spec.verify`, so is "How the facts were checked" (the validator warns).

**Hosting things the kit does not draw.** (1) A painter may return `{ html, stat, bare }` instead of a string: `stat` fills the stat line and `bare` drops the
stage frame when the painter draws its own. (2) A use case may set `custom` (an HTML string for the Step by step section) instead of `kind` and `steps`; the engine
renders it as is and `config.afterRender(pageEl)` runs after every page render so the course can mount its own interactive code. Spark uses the native animation contract described below.
(3) Old links of the form `#c=<featureId>&uc=<n>` are rewritten to the new routes, so published URLs keep working.

`steps` is 5 to 7 entries of `{ t, x, s, stat }`: title, one-move text, the **whole scene state** for the picture, and a stat line.
`edges` is 2 entries of `{ t, ctx, fix }`. Text fields may carry `<code>` and `<b>`; everything else is escaped.

## Shared animations and scene forms

Spark has the same course files as Redis: `spec.js`, `uc-a.js`, `uc-b.js`, `uc-c.js`, `diagrams.js`, and `paint.js`. Course files contain the lesson text, complete scene state, fixtures, and presets. Rendering code and controls live in `assets/course/animations/`; no Spark globals or adapter are needed.

For an interactive use case, set `animation: { kind, ...sceneData }` instead of `kind` and `steps`. Load `animations.js`, the required renderer modules, and their optional styles before the course data. A renderer registers with `Course.registerAnimation(kind, { mount(host, scene), validate?(scene) })`. The framework validates it and mounts a fresh host for each route; Back, Next, and Restart stay within that host. `validate` returns an array of errors. Without it, the definition must have non-empty `steps` containing `title` and `text`.

Narrated animation families share `Course.animationPlayer(host, scene, painter, className)`. The painter receives `(stage, scene, stepIndex)`, draws the complete scene, and returns its stat text. Computed forms such as the CSV split reader can implement their own controls and validation while receiving fixtures and presets from the course.

For ordinary step pictures, reusable forms register with `Course.registerScene(kind, painter)`. A course's `paint.js` binds its scene to `Course.renderScene(kind, scene, stepIndex)`, which returns `{ html, stat, bare }` for the standard course player. Add new forms to the shared assets when the existing picture kit or animation library cannot express a course's mechanism.

`animations/btree.js` is a computed animation: scene data is `{ kind: 'btree', cap, base, presets: [{ label, ops }], try? }` with ops `insert`, `search` or `range`; the pure model is exposed as `Course.btree` and tested in `tools/course/btree.test.js`. The PostgreSQL course uses it.

The ScyllaDB animations follow the same pattern (pure model on `Course.ring`, `Course.quorum`, `Course.lsm`, `Course.raft`, tested in `tools/course/cluster.test.js`, styled by `cluster.css`). Scene data: `ring` `{ nodes, start, rf, tokenChoices, key, keys }`; `quorum` `{ rf, field, values, presets }` with ops `down`, `up`, `write`, `read`, `repair`; `lsm` `{ memCap, threshold, presets }` with ops `put`, `del`, `get`, `flush`, `compact`; `raft` `{ n, split, cmd, presets }` with ops `timeout`, `client`, `partition`, `heal`, `crash`, `restart`.

Run `node --test tools/course/*.test.js` for the animation registration, mounting, B+tree model, and validation checks.

## Pictures

A painter returns HTML for one step and draws the **full scene**, so Back, Restart and jumping need no replay logic. Build it
from `Course.kit` instead of writing markup:

| Helper | Draws |
| --- | --- |
| `cap(text)`, `strip(html)`, `note(...chips)` | caption, wrapping row, row of chips |
| `chip(text, cls)`, `cell(text, cls, title)` | pill, boxed value. `cls`: `ok` `bad` `warn` `acc` `hot` `dim` `ring` |
| `cells(items)` | a row of boxes (bytes, buckets, pages, keys) |
| `meter(v, max, cls, label)`, `limitMeter(label, v, scale, limit)` | a bar, and a bar with a limit mark |
| `timeline({max, points, marks, bands, ticks})` | positioned dots, vertical marks, bands and tick labels on an axis |
| `lanes(heads, rows)` | sequence lanes with arrows, lost messages dashed |
| `columns(cols)`, `panels(items)` | items grouped in titled columns; boxes side by side |
| `table(head, rows)`, `stages(list, at)` | a table; a pipeline with the active stage highlighted |

Rules: one form per use case and never repeat a form in a course (the validator fails on a repeat); draw labels in a gutter, not
on top of data; set axis ranges from the data; use theme tokens only (the classes above), never fixed colours.

## Diagrams

Mermaid 10.9.1, loaded on demand from the CDN, themed from the page's colour tokens, with the source shown when it cannot load.
Every feature has one flowchart (`hld`), every use case has one or two diagrams (sequence for a protocol, state for a lifecycle,
flow for a decision). Keep labels free of semicolons and hash signs (the validator lints this). Wrap long diamond labels with `<br/>`.

## Checks

```
node tools/course/check.js techstack/<id>/course.html     # contract, painting, Mermaid lint
node tools/course/browse.js techstack/<id>/course.html    # every page, both themes, phone width, every diagram drawn
```

`browse.js` needs Playwright and Chromium (pre-installed in the cloud session). Where the CDN is blocked it installs
`mermaid@10.9.1` from npm once into a temp folder and serves that instead (set `MERMAID_JS` to point at a copy).

## Pitfalls this framework already avoids

- Short class names such as `.lab`, `.row`, `.chip`, `.bar`, `.box` collide with `assets/lab.css`. Picture classes are `cap`, `strip`,
  `tag`, `meter`, `panel`, `hero`, `faint`, `cell` and are only styled under `.pv`.
- Chip text inherited a pale colour from the shared stylesheet; `.pv .tag` sets its own.
- A wide `pre` or table pushed the page sideways at phone width; grid children shrink (`min-width:0`) and wide content scrolls inside its card.
- `tools/` is gitignored except `tools/course/`.
