# Course framework

One look, one data contract and one set of checks for every system-design course page on this site. The Redis course
(`techstack/redis/design/`) is the reference implementation. The visual style is the Spark course's (`techstack/spark/`).

```
assets/course/
  course.css     the style: shell, page head, numbered sections, cards, tables, diagrams, edge cards, pager, player, pictures
  kit.js         picture helpers and reusable forms          -> Course.kit
  contract.js    data contract and validator                  -> Course.validate(CourseData)
  course.js      shell, router, page templates, Mermaid, player -> Course.mount(CourseData)
tools/course/
  scaffold.js    start a new course page that already passes the checks
  check.js       validate a page in Node (no browser)
  browse.js      browser pass: every page, both themes, desktop and phone, every step, every diagram
```

## What a course page looks like

A page is a thin `design.html` plus five small data files. It loads `lab.css`, `curriculum.css` and `course.css`, then the
scripts in this order, and ends with `Course.mount(CourseData)`:

```html
<script src="../../../assets/course/kit.js"></script>
<script src="../../../assets/course/contract.js"></script>
<script src="spec.js"></script>  <script src="uc-1.js"></script>  <script src="diagrams.js"></script>  <script src="paint.js"></script>
<script src="../../../assets/course/course.js"></script>
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
| `config` | `{ id, name, version, root, brand?, footer?, related?: [{href, title, sub}] }`. `root` is the relative path to the site root (`'../../../'`). `brand` is a CSS colour, default red. |
| `spec` | `{ title, navTitle, lead, overview[2], problem[4], fr[], nfr[], out, est[][3], hldNote, decisions[][3], verify[] }`. `problem` rows are scenario, naive design, fails when, principle. |
| `hldOverall` | Mermaid source for the whole system. |
| `features` | `[{ id, tag, name, summary, goal, scope:[[in],[out]], fr[], nfr[], decisions[][3] }]` |
| `hld` | `{ <featureId>: Mermaid source }` |
| `uc` | `{ <featureId>: [ useCase ] }` where `useCase = { title, short, intro, trigger, run, expect, kind, steps, edges, invariant, src }` |
| `diagrams` | `{ '<featureId>:<n>': [ { kind: 'Sequence'\|'State'\|'Flow', title, src } ] }`, `n` starts at 1 |
| `PAINT` | `{ <kind>: (state, step) => html }`, one painter per use case `kind` |

`steps` is 5 to 7 entries of `{ t, x, s, stat }`: title, one-move text, the **whole scene state** for the picture, and a stat line.
`edges` is 2 entries of `{ t, ctx, fix }`. Text fields may carry `<code>` and `<b>`; everything else is escaped.

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
node tools/course/check.js techstack/<id>/design/design.html     # contract, painting, Mermaid lint
node tools/course/browse.js techstack/<id>/design/design.html    # every page, both themes, phone width, every diagram drawn
```

`browse.js` needs Playwright and Chromium (pre-installed in the cloud session). Where the CDN is blocked it installs
`mermaid@10.9.1` from npm once into a temp folder and serves that instead (set `MERMAID_JS` to point at a copy).

## Pitfalls this framework already avoids

- Short class names such as `.lab`, `.row`, `.chip`, `.bar`, `.box` collide with `assets/lab.css`. Picture classes are `cap`, `strip`,
  `tag`, `meter`, `panel`, `hero`, `faint`, `cell` and are only styled under `.pv`.
- Chip text inherited a pale colour from the shared stylesheet; `.pv .tag` sets its own.
- A wide `pre` or table pushed the page sideways at phone width; grid children shrink (`min-width:0`) and wide content scrolls inside its card.
- `tools/` is gitignored except `tools/course/`.
