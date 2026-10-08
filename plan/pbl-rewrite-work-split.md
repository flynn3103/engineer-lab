# Problem-Based Rewrite: Work Split

## Phase 0: lead (before the writers start)
1. Snapshot the reference: `cp techstack/database-systems/01-database-systems-end-to-end.html "$SCRATCH/pbl-reference.html"`. Record the sha256 here. The reference is being edited concurrently, so all copying and checking uses this snapshot.
2. Save the `check-course.js` script from spec §6 as `$SCRATCH/check-course.js`, and give its path to every writer.
3. Confirm that the old pages are backed up at `…/scratchpad/backup/<tech>/`. They are the source for old-page content and incidents.

## Phase 1: six writers in parallel
Each writer owns exactly one file, plus the incident files noted below. Each reads `plan/problem-based-course-spec.md`, its own `plan/<tech>-course-chapter-plan.md`, and its old page backup.

| Writer | Owns | Chapters |
|---|---|---|
| spark | techstack/spark/01-spark-internals-end-to-end.html | 11 |
| scylla | techstack/scylla/01-scylla-internals-end-to-end.html, deletes scylla-incidents.js | 10 |
| redis | techstack/redis/01-redis-internals-end-to-end.html | 11 |
| kafka | techstack/kafka/01-kafka-internals-end-to-end.html, deletes kafka-incidents.js and kafka-incidents.css | 12 |
| postgres | techstack/postgres/01-postgres-internals-end-to-end.html | 12 |
| k8s | techstack/k8s/01-k8s-internals-end-to-end.html | 11 |

A writer is done when:
- `node check-course.js <page> <snapshot> <N>` prints `OK`;
- it has done the browser smoke test in spec §6, or listed it as not done;
- it has listed every fact it could not verify and therefore left out.

Writers do not touch `data/`, `assets/`, `plan/` or other techstack folders, and do not commit.

## Phase 2: reviewer checklist (per page; record pass or fail with evidence)
1. `check-course.js` prints `OK`. This covers:
   - the framework chunks are verbatim;
   - the amendment is present;
   - 3 inline scripts, no `<script src>`;
   - per-block and combined syntax;
   - PHASES length = CHAPTERS length = the plan's count;
   - every chapter has ask, scene, predict, idea, arch, pg, and 3–4 rich common entries with log and viz;
   - every `pg` key is unique and defined;
   - no duplicate failure titles;
   - no forbidden tokens.
2. The `predictBlock` function has the same hash on all six pages: `sed -n '/^function predictBlock/,/^}/p' <page> | shasum` gives identical output six times.
3. **Plan conformance.** For each chapter:
   - the title and order match the plan;
   - the problem → predict → mechanism → playground → diagnose sections all render in the browser;
   - the playground's controls and stats match the plan's list;
   - the common problems are the plan's scenarios.
   - Every row of the plan's "Old-page → new mapping" table is visibly covered.
4. **Playground quality.**
   - It shows a hypothesis line, at least 2 controls, the "Reproduce the incident" and "Apply the fix" presets, at least 2 numeric stats, and an illustrative-model note.
   - It is deterministic: two reloads give identical outputs.
   - No two playgrounds on the page model the same variable.
5. **Anchors.** `#ch0…#ch{N-1}` open the right chapters, and every existing `data/tech-index.js` URL for the system still resolves (all old N ≤ new N).
6. **Responsive design and theme.**
   - At 360 px there is no page-level horizontal scroll.
   - Dark mode is readable.
   - There are no hard-coded colours outside code panes.
   - Reduced motion is respected.
7. **Honesty.**
   - Each invented number is labelled illustrative.
   - Each `common` entry has a source link.
   - Spot-check at least 5 facts per page against their primary sources (table below). Any unverifiable config key, default or error string fails the review.
8. **Kafka and Scylla.** Every incident title in the backup's incidents file appears in some chapter's `common`. The incident files are deleted and no tag references them.

### What to re-check against which source

| Page | Re-check | Source |
|---|---|---|
| Spark | config keys and defaults (AQE, broadcast threshold, memory fraction, overhead, maxResultSize) | spark.apache.org/docs/3.5.x/configuration.html, sql-performance-tuning.html, tuning.html |
| Spark | error strings (FetchFailed, maxResultSize, broadcast timeout) | apache/spark v3.5 source grep |
| Scylla | CL semantics, commitlog sync, tombstone_gc, tablets, Raft recovery | docs.scylladb.com URLs in the old incidents file |
| Scylla | config names | configuration-parameters page for 2025.x |
| Redis | config names (listpack, client-output-buffer-limit, lazyfree, active-expire-effort) | redis.conf at the pinned tag |
| Redis | error strings (WRONGTYPE, OOM, BUSY, MISCONF, CROSSSLOT) | src/server.c shared error objects at the tag |
| Kafka | producer, consumer and broker configs and defaults | kafka.apache.org/39/documentation |
| Kafka | KIP numbers | cwiki KIP index |
| Kafka | exception names | apache/kafka 3.9 source |
| Postgres | GUCs and defaults | postgresql.org/docs/16 and /17 runtime-config pages |
| Postgres | log and error strings (checkpoint warning, deadlock, serialization, wraparound, recovery conflict) | src/backend grep at REL_16/17 |
| k8s | defaults (tolerationSeconds 300, node-monitor-grace-period, CrashLoopBackOff cap) | kubernetes.io docs for the pinned version |
| k8s | message formats (Forbidden, 409, 410, scheduler FailedScheduling, PDB eviction) | kubernetes/kubernetes source grep |

## Phase 3: lead integration (after all six pass review)
1. Update `data/tech-index.js` by the manual rule in spec §3: replace the six systems' Tour and Chapter entries, renumber `id`, and fix the header comment.
2. Update `data/systems.js` `chapters:`: spark 11, scylla 10, redis 11, kafka 12, postgres 12, k8s 11. Refresh `topics:`.
3. Open `tech.html`, search for one chapter title per system, and confirm the link lands on the right `#chN`.
4. Only the user decides on committing. Note that `data/systems.js`, `data/tech-index.js` and `tech.html` already have uncommitted changes from earlier work.
