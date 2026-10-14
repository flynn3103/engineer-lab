# The course framework

The framework lives in `../framework/` (a copy of `engineer-lab/assets/course` and `engineer-lab/tools/course`). Full contract, picture kit
and checks are in `../framework/assets/course/README.md`; read it before writing data files. This note covers how to use and extend it.

## Use it
```
node <skill>/scripts/install.js <repo>                 # copy assets/course and tools/course if the repo lacks them (--check, --force)
node tools/course/scaffold.js redis "Redis" 7.2        # techstack/redis/design/ with design.html + 4 data files, already valid
node tools/course/check.js techstack/redis/design/design.html
node tools/course/browse.js techstack/redis/design/design.html --shots /tmp/shots
```
A course page is `design.html` (loads `lab.css`, `curriculum.css`, `course.css`, then the framework and data scripts, then `Course.mount(CourseData)`)
plus `spec.js` (config, spec, features), `uc-*.js` (use cases per feature id), `diagrams.js` (Mermaid) and `paint.js` (painters).
Split `uc-*.js` by feature group when it grows (the Redis course uses three files for nine features).

## Why a framework
The first two courses were hand-styled and drifted: the Redis page first had its own look, then lacked the Mermaid diagram layer Spark has.
Both faults are now errors. The framework fixes the look (Spark's), the page templates, the diagram layer, the player and the data contract, so a
new course is data and painters only.

## Extend it without forking the look
- A new picture form that other courses could use goes into `kit.js` as a function returning HTML (keep it DOM-free, tokens only), documented in the README table.
- A form that is specific to one technology stays in that course's `paint.js`, built from kit helpers (Redis keeps its CRC16 slot table and skip list there).
- New CSS goes in `course.css` under `.course` or `.pv`. Never add short generic class names (`.lab`, `.row`, `.chip`, `.bar`, `.box`, `.big`, `.mut`
  collide with `assets/lab.css`); picture classes are `cap strip tag meter panel hero faint cell`.
- If you change the framework in a repo, copy the change back to `framework/` here, run `install.js --check`, and re-run `browse.js` on every existing course.

## Migrating an older course
See `migrating-a-course.md` (converter, painter adapter, `custom` + `afterRender` for interactive code, legacy routes, screenshot comparison).

## Known limits
- The Spark course runs on the framework through a converter (`techstack/spark/spark-data.js`); its 19 interactive simulations keep their own modules (see `migrating-a-course.md`). Its layout was the style source.
- Mermaid loads from jsdelivr at view time; offline readers see the diagram source.
- Pictures are static HTML per step, not animation. If a mechanism needs motion, add a form to the kit rather than a one-off script.
