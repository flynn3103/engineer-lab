> **Legacy data layout.** This course was built before the framework in `../framework/` and later migrated onto it (see `migrating-a-course.md`). Its content still lives in the original data files (`engine-sysdesign.js`, `engine-stories.js`, `engine-visuals.js`), mapped onto the framework by `techstack/spark/spark-data.js`; the page engine described under "File layout" below was removed. The splice scripts in `../scripts/legacy/` still add use cases to those data files. New courses use the framework (see `framework.md`). The table below is still the best example of use-case selection.

# Worked example: the Spark course

Live course: https://flynn3103.github.io/engineer-lab/techstack/spark/course.html
Source: https://github.com/flynn3103/engineer-lab/tree/main/techstack/spark

"Design a distributed batch engine": an overview page, then one page per feature, then one page per use case. 14 features, 67 use cases, every use case with its own picture.

## Features and use cases
| Feature | Use cases |
| --- | --- |
| Input and partitions | cut a CSV without losing a row · plan splits for mixed files · Parquet row groups · skip folders · bad-row modes |
| Pull pipeline | consumer asks for the next pair · resource lifetime · fuse narrow steps · stop early |
| Lineage and cache | cache hit or recompute · block lifecycle · rebuild from lineage · checkpoint |
| Stage planning | plan from an action · readiness · shared parent planned once · skip a finished shuffle · join with no exchange · tasks follow partitions |
| Task scheduling | launch cycle · attempt states · locality wait · retry until the limit · cores per task |
| Shuffle exchange | map write and index · reducer fetch · bypass the sort · local reads · blocks = maps x reducers |
| Memory and spill | grant and spill · pressure outcomes · shared pool · per-task share · off-heap and GC |
| Failure recovery | executor lost mid-reduce · speculation · retry a fetch · exclude a flaky executor · external shuffle service |
| Output commit | attempt protocol · readiness marker · commit algorithm v1 vs v2 · overwrite |
| SQL planner | query to tasks · count by city · simplify conditions · two distinct counts · default 200 partitions |
| Join strategies | broadcast · shuffled · sort-merge · no equal key · outer and anti |
| Adaptive execution | re-plan at the barrier · skewed join · switch to broadcast · local shuffle reader · re-plan per stage |
| Execution evidence | event bus · history replay · full queue drops events · live window vs log · task-duration spread |
| End-to-end build | one run · same answer under any options · abort publishes nothing · cost of each option |

## How it was built, in rounds
1. Features 01 to 03 redesigned as interactive use cases (trigger, run, expect, diagrams, edge cards).
2. Stages: 4 new use cases, each with a dedicated picture.
3. All remaining use cases given their own picture; the old generic story player was removed.
4. Per feature, in order: research, correct, add 3 use cases, add pictures, verify, commit.

## File layout
```
techstack/spark/engine-sysdesign.js   D.<feature>: goal, scope, FR, NFR, HLD, use cases (title, intro, diagrams)
techstack/spark/engine-stories.js     ST['feature:n']: trigger, command, expect, steps (title, text), edges
techstack/spark/engine-visuals.js     DATA['feature:n']: kind + per-step state; painters; PAINT map
techstack/spark/engine-visuals.css    styles for the pictures
techstack/spark/engine-stagesim.js    the Stages pictures (same pattern)
techstack/spark/spark-data.js         maps the files above onto the course framework (replaced engine-pages.js and engine-course.js)
```

## Adding a feature or use cases with the scripts
1. Write five files in a folder: `uc.js` (use-case entries), `st.js` (narration), `data.js` (per-step state), `painters.js` (functions), `css.txt`, plus `paint.txt` (`kind: paintFn, ...`).
2. From `techstack/spark`: `node <skill>/scripts/legacy/apply.js <feature> <folder>` splices them in.
3. `node <skill>/scripts/legacy/check.js` verifies kinds are unique and every step paints.
4. Browser pass, screenshots, commit, push.

The scripts are specific to this layout. Adapt the anchors if your course differs.

## What was not verified
Facts were written from knowledge of Spark; web searches in the build environment returned mostly secondary sources. Defaults to check against the Spark configuration page for your version: `spark.locality.wait` (3s), `spark.task.maxFailures` (4), `spark.shuffle.sort.bypassMergeThreshold` (200), `spark.shuffle.readHostLocalDisk` (true), `spark.shuffle.io.maxRetries` (3) and `retryWait` (5s), `spark.sql.shuffle.partitions` (200), `spark.sql.autoBroadcastJoinThreshold` (10 MB), `spark.scheduler.listenerbus.eventqueue.capacity` (10000), `spark.ui.retainedStages` (1000), `spark.excludeOnFailure.enabled` (off).
