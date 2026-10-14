# Migrating an existing course onto the framework

Worked example: the Spark course (14 features, 67 use cases, 19 interactive simulations, 48 painter-style pictures) moved onto the framework
without rewriting its content. Do it in this order and keep the old page working until the new one is checked.

1. **Inventory before touching anything.** List what the old engine renders and what is dead. Spark's animated "lab" on feature pages was already switched off in the code
   (`animated = false`), so the model, traces and scenes behind it could be deleted. Count use cases by kind (painter-style, own simulation) with a short Node script.
2. **Take baseline screenshots** of the old pages (overview, a feature, one of each use-case kind) at one viewport. You compare against these at the end.
3. **Write a converter, not a rewrite.** `spark-data.js` builds `CourseData` at load from the data files that already exist (`engine-curriculum.js`, `engine-sysdesign.js`, `engine-stories.js`,
   `engine-visuals.js`). It maps shapes, strips the "UC-NN · " title prefix, and escapes plain-text fields (the framework treats text fields as trusted markup).
4. **Adapt painters, do not port them.** A painter that writes into a stage element and returns a stat line becomes a framework painter that creates a throw-away `{ innerHTML }`
   object, calls the old painter and returns `{ html, stat, bare: true }`. The state for a step is just `{ key, k }`, the lookup key and step index.
5. **Host interactive code with `custom` and `afterRender`.** A use case that has its own simulation sets `custom` to the host element the old page rendered (`<div data-sim=...>`), and
   `config.afterRender(page)` calls each module's `mount(page)`. No change to those modules.
6. **Split the stylesheet.** The shell, cards, tables, diagrams and edge-card rules are already in `course.css`; the simulation rules go to a small `<course>-sims.css` (replace the old root class with `.course`).
   Keep painter and stage CSS files unchanged.
7. **Keep published URLs working.** The engine rewrites `#c=<featureId>&uc=<n>` to the new routes. Test every link the site's search index uses.
8. **Validate and browse.** `check.js` (0 errors; warnings are real content gaps such as missing "sources" lines) and `browse.js` (it presses the Next buttons of custom simulations too).
   Fix what the browser finds: Spark's painters had absolutely positioned labels that fit the old layout but overflowed inside the player card at 390 px; the fix was `overflow-x:auto` on the stage, not editing painters.
9. **Compare screenshots** old against new at the same viewport. Differences you accept should be deliberate (here: the use-case intro moved under the Diagrams heading; painter-style pictures use the framework's step panel).
10. **Only then delete dead code**, after a repo-wide grep for the old file and global names (Spark: page engine, lab model, traces, scenes, old stylesheet). Update README and comments that pointed at them.

Data that the old course lacked is a warning, not an error: Spark has no "sources" lines and a few use cases lack run, expect or invariant. Say so in the report, and add a
`spec.verify` note that is honest about what was and was not checked against source.
