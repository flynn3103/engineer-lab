# PostgreSQL Course Chapter Plan (12 chapters)

## Objective
Rewrite `techstack/postgres/01-postgres-internals-end-to-end.html` in the problem-based format. The course problem: an orders database under checkout traffic and finance reports, followed from one query's parse to crash safety, cleanup, planning and replication. Pin PostgreSQL 16 and 17, and note any differences between them.

## Source coverage
- **Docs:** postgresql.org/docs/current/
  - query-path.html, parser-stage.html, catalogs.html, ddl-schemas.html, sql-prepare.html
  - storage-page-layout.html, storage-toast.html, runtime-config-resource.html
  - executor.html, using-explain.html
  - btree.html, indexes-index-only-scans.html, indexes-expressional.html
  - mvcc.html, storage-hot.html
  - wal-intro.html, wal-reliability.html, wal-async-commit.html, wal-configuration.html, runtime-config-wal.html
  - routine-vacuuming.html
  - planner-stats.html, sql-createstatistics.html
  - warm-standby.html, hot-standby.html, runtime-config-replication.html
  - transaction-iso.html, explicit-locking.html
  - monitoring-stats.html
- **Source code** (postgres/postgres, verify at REL_16/17):
  - src/backend/parser/ (gram.y, analyze.c)
  - src/backend/storage/buffer/ (bufmgr.c, freelist.c)
  - src/backend/storage/page/bufpage.c
  - src/backend/executor/ (execProcnode.c, nodeSort.c, nodeHashjoin.c, nodeLimit.c)
  - src/backend/access/nbtree/ (README, nbtinsert.c)
  - src/backend/access/heap/ (heapam.c, heapam_visibility.c, vacuumlazy.c)
  - src/backend/storage/ipc/procarray.c
  - src/backend/access/transam/ (xlog.c, xlogrecovery.c)
  - src/backend/optimizer/path/costsize.c
  - src/backend/utils/adt/selfuncs.c
  - src/backend/utils/sort/tuplesort.c
  - src/backend/postmaster/checkpointer.c
  - src/backend/replication/ (walsender.c, syncrep.c)
  - src/backend/storage/lmgr/ (deadlock.c, README)

## Design constraints
- The count of 12 comes from the 11 old chapters plus "Streaming replication and synchronous_commit". The old page already teaches this in its scenario "primary crash (synchronous_commit)", which mentions standby 29 times.
- The order follows the old page; replication goes last because it needs WAL (ch5) and checkpoints (ch9).
- `archSteps` only in ch0.

## Chapters

### ch0 · SQL, Parser and Catalog (`s:'parse · analyze · rewrite · plan'`, pg `querypath`, archSteps)
- **Source:** query-path, parser-stage, catalogs; gram.y and analyze.c.
- **Problem:** A deploy renames a column. Some app servers start failing with errors before any row is read, and others fail later with a different error.
- **Predict:** "`SELECT t.nope FROM t`: how many data pages are read before the error?"
  - Answer: 0.
- **Core idea:** Resolve every name against the catalog before spending I/O: parse → analyze (bind) → rewrite → plan → execute.
- **Mechanism:**
  - raw parse tree;
  - catalog lookup (pg_class, pg_attribute);
  - search_path;
  - rewriter (views);
  - plan cache for prepared statements.
- **archSteps modes:** "valid query" and "unknown column".
- **Playground:**
  - Controls: input SQL from 4 presets, editable column and table names; seg for search_path; toggle "schema changed since PREPARE".
  - Stats: stage reached, SQLSTATE, pages read (0 for every pre-execution failure).
- **Common:**
  1. `cached plan must not change result type` after an ALTER under prepared statements.
  2. search_path resolves to the wrong schema's table.
  3. Quoted mixed-case identifiers: `column "userid" does not exist` (case folding).

### ch1 · Heap Pages and the Buffer Pool (`s:'pages · shared_buffers · clock sweep'`, pg `buffers`)
- **Source:** storage-page-layout, storage-toast, runtime-config-resource (`shared_buffers`, `huge_pages`); bufmgr.c and freelist.c; `pg_buffercache`; EXPLAIN (BUFFERS).
- **Problem:** The orders lookup takes 2 ms when warm and 300 ms after the morning batch (illustrative).
- **Predict:** "A large sequential scan in PostgreSQL uses how much of shared_buffers?"
  - Answer: a small ring, not the whole pool.
- **Core idea:** The 8 kB page is the unit of storage and caching. Rows are addressed as (page, line pointer), and pages are cached in shared_buffers with clock-sweep replacement on top of the OS cache.
- **Mechanism:**
  - slotted page (header, line pointers, tuples);
  - TOAST for large values;
  - buffer descriptors, pin and usage count;
  - clock sweep;
  - ring buffers;
  - double caching.
- **Playground:**
  - Controls: slider for shared_buffers (pages); seg for workload (hot set / hot set + bulk scan / wide rows); toggle ring buffer; toggle "SELECT * with a large TOASTed column".
  - Stats: hit ratio, `shared read` blocks, TOAST chunks fetched, evictions.
- **Common:**
  1. The working set exceeds shared_buffers: `shared read` dominates in EXPLAIN (ANALYZE, BUFFERS).
  2. `SELECT *` fetches and detoasts big columns that are not needed.
  3. The server fails to start: `could not map anonymous shared memory` when shared_buffers or huge_pages exceed what the OS allows.

### ch2 · Iterator Execution (`s:'Volcano · pull · blocking nodes'`, pg `executor`)
- **Source:** executor.html, using-explain; execProcnode.c, nodeLimit.c and nodeSort.c.
- **Problem:** `ORDER BY amount LIMIT 5` over 10M rows reads everything; `LIMIT 5` without ORDER BY returns instantly.
- **Predict:** "Which of `Seq Scan → Limit` and `Seq Scan → Sort → Limit` stops reading early?"
  - Answer: the first.
- **Core idea:** Each plan node pulls one row at a time from its child, so memory follows the blocking nodes and LIMIT stops the pulling.
- **Mechanism:**
  - ExecProcNode;
  - streaming versus blocking nodes (Sort, Hash, Agg);
  - top-N heapsort;
  - EXPLAIN ANALYZE `rows` and `loops`.
- **Playground:**
  - Controls: plan builder (Scan, Filter, Sort, Limit, Agg); slider for table rows; slider for LIMIT; Step.
  - Stats: rows pulled per node, peak rows held, pages read.
- **Common:**
  1. Deep `OFFSET` pagination reads and discards N rows. Fix: keyset pagination.
  2. A client fetches the whole result set (JDBC default) and the app OOMs. Fix: a cursor with `fetchSize` and autocommit off.
  3. ORDER BY on an unindexed column forces a full Sort before LIMIT.

### ch3 · B-tree Index (`s:'descend · split · index-only'`, pg `btree`)
- **Source:** btree.html, nbtree README, indexes-index-only-scans, indexes-expressional.
- **Problem:** Finding `amount = 99` in 10M rows scans every page, and after adding an index, inserts slow down.
- **Predict:** "Inserting monotonically increasing keys versus random UUIDv4: which causes more page splits across the tree?"
  - Answer: random.
- **Core idea:** A tree of sorted pages. A lookup or insert touches one root-to-leaf path; a range walks the leaf chain.
- **Mechanism:**
  - root, internal and leaf pages;
  - page split;
  - deduplication;
  - index-only scan and the visibility map;
  - multicolumn prefix rule.
- **Playground:**
  - Controls: seg for key pattern (sequential / random / duplicates); slider for inserts; slider for fanout; input for a lookup range.
  - Stats: tree height, splits, pages read for the lookup, leaf fill %.
- **Common:**
  1. `WHERE lower(email) = …` ignores the index. Fix: an expression index.
  2. A composite index with the wrong column order cannot serve the filter.
  3. Random UUIDv4 keys cause splits, bloat and extra WAL.
  4. An implicit cast or type mismatch prevents index use.

### ch4 · Transactions and MVCC (`s:'xmin/xmax · snapshots · HOT'`, pg `mvcc`)
- **Source:** mvcc.html, storage-hot; heapam_visibility.c and procarray.c (GetSnapshotData).
- **Problem:** The finance report reads an order while checkout updates it. Who waits?
- **Predict:** "Transaction A updates row R, uncommitted. Does reader B block?"
  - Answer: no, it sees the old version.
- **Core idea:** Updates write new row versions stamped xmin/xmax, and a snapshot decides which version each transaction sees. Readers never block writers.
- **Mechanism:**
  - tuple header;
  - snapshot (xmin, xmax, xip);
  - commit log;
  - HOT updates within a page;
  - row locks for writer-writer conflicts.
- **Playground** (the old 4 MVCC cases plus the scenario "insert → update → delete"):
  - Controls: interleaving of two sessions with steps BEGIN, UPDATE, SELECT, COMMIT, ROLLBACK.
  - Stats: versions on page, version visible to each session, waits.
- **Common:**
  1. `count(*)` is slow because every tuple's visibility is checked and no count is stored.
  2. Indexing a frequently updated column prevents HOT, so index bloat and write amplification grow.
  3. Writers queue behind a row lock held by a long transaction: the `Lock` wait event in pg_stat_activity.

### ch5 · WAL and Crash Recovery (`s:'log before page · fsync · redo'`, pg `wal`)
- **Source:** wal-intro, wal-reliability, wal-async-commit, runtime-config-wal (`fsync`, `synchronous_commit`, `full_page_writes`, `wal_writer_delay`); xlog.c and xlogrecovery.c.
- **Problem:** Power fails right after COMMIT returned. Is the paid order there?
- **Predict:** "`synchronous_commit=off`, crash 100 ms after COMMIT. Can that commit be lost?"
  - Answer: yes (up to 3 × wal_writer_delay).
- **Core idea:** The log is the source of truth. A COMMIT is durable once its WAL is flushed; data pages are a lazily written cache of the log.
- **Mechanism:**
  - WAL records and LSN;
  - WAL buffers and flush at commit;
  - page LSN rule;
  - redo from the checkpoint;
  - full-page images against torn pages.
- **Playground:**
  - Controls: seg for synchronous_commit (on / off); toggle fsync; toggle full_page_writes; button "crash at t" over a timeline of commits and page writes.
  - Stats: committed transactions lost, pages torn, redo records replayed.
- **Common:**
  1. `fsync=off` leads to corruption after an OS crash.
  2. The asynchronous-commit window loses the last commits.
  3. `full_page_writes=off` on storage without atomic 8 kB writes gives torn pages.

### ch6 · VACUUM and the Horizon (`s:'dead tuples · horizon · freeze'`, pg `vacuum`)
- **Source:** routine-vacuuming; vacuumlazy.c; `autovacuum_vacuum_scale_factor`, `idle_in_transaction_session_timeout`; pg_stat_user_tables (`n_dead_tup`).
- **Problem:** The orders table doubles in size every week while its row count stays flat.
- **Predict:** "A transaction stays idle-in-transaction for 6 hours. Can VACUUM remove rows deleted 5 hours ago?"
  - Answer: no.
- **Core idea:** The oldest snapshot, not the commit time, decides when a version becomes garbage. Freezing keeps transaction IDs from wrapping around.
- **Mechanism:**
  - dead tuples;
  - the xmin horizon (sessions, replication slots, prepared transactions);
  - lazy vacuum, visibility map, free space map;
  - autovacuum thresholds;
  - freeze and wraparound.
- **Playground:**
  - Controls: slider for update rate; seg for long-transaction age; slider for autovacuum scale factor; toggle abandoned replication slot.
  - Stats: dead tuples, table size, horizon age, reclaimable tuples.
- **Common:**
  1. Idle-in-transaction blocks vacuum and causes bloat.
  2. Autovacuum cannot keep up on a large table with the default 0.2 scale factor. Fix: per-table settings.
  3. The wraparound guard stops writes ("database is not accepting commands to avoid wraparound data loss…", wording varies by version).
  4. An abandoned replication slot or prepared transaction holds the horizon.

### ch7 · Planner and Statistics (`s:'selectivity · cost · ANALYZE'`, pg `planner`)
- **Source:** planner-stats, sql-createstatistics, using-explain; costsize.c and selfuncs.c; `default_statistics_target`, `plan_cache_mode`.
- **Problem:** After the nightly bulk load, a 5 ms query takes 5 minutes; nothing changed but the data.
- **Predict:** "Statistics say 10 rows match, reality is 2M. Which join does the planner likely choose?"
  - Answer: a nested loop.
- **Core idea:** Estimate rows per node from statistics, price each equivalent plan, and pick the cheapest. Bad estimates make bad plans.
- **Mechanism:**
  - pg_statistic (MCV, histogram, n_distinct);
  - selectivity;
  - cost parameters;
  - join methods;
  - extended statistics;
  - generic versus custom plans.
- **Playground:**
  - Controls: slider for actual selectivity; seg for stats freshness (fresh / stale); toggle correlated predicates and extended stats; seg for plan_cache_mode.
  - Stats: estimated vs actual rows, chosen plan, cost, runtime (illustrative).
- **Common:**
  1. Stale statistics after a bulk load. Fix: `ANALYZE`.
  2. Correlated columns are misestimated. Fix: `CREATE STATISTICS`.
  3. A generic plan is chosen for a skewed parameter after 5 executions. Fix: `plan_cache_mode`.

### ch8 · Sort and Hash Join under work_mem (`s:'work_mem · spill · batches'`, pg `spill`)
- **Source:** runtime-config-resource (`work_mem`, `hash_mem_multiplier`, `temp_file_limit`); tuplesort.c and nodeHash.c; EXPLAIN output.
- **Problem:** ORDER BY over 50 GB with 64 MB of memory. Does the query crash?
- **Predict:** "work_mem = 4 MB, sort input 400 MB. What does EXPLAIN ANALYZE show?"
  - Answer: `Sort Method: external merge  Disk: …kB`.
- **Core idea:** Decompose: sort runs that fit in memory and merge them from disk; partition hash joins into batches. A fixed budget handles any size.
- **Mechanism:**
  - quicksort versus external merge;
  - hash join batches;
  - work_mem per node per process;
  - temp files.
- **Playground:**
  - Controls: slider for work_mem; slider for input size; seg for operation (sort / hash join); slider for concurrent sessions.
  - Stats: runs/batches, temp bytes, peak memory across sessions, runtime (illustrative).
- **Common:**
  1. A sort spills to disk (`external merge`).
  2. A hash join with many batches (`Batches: 16`).
  3. work_mem × nodes × connections leads to the OOM killer.
  4. `temporary file size exceeds temp_file_limit`.

### ch9 · Checkpoints (`s:'checkpoint · max_wal_size · recovery time'`, pg `checkpoint`)
- **Source:** wal-configuration (`checkpoint_timeout`, `max_wal_size`, `checkpoint_completion_target`, `checkpoint_warning`); checkpointer.c; pg_stat_bgwriter / pg_stat_checkpointer (17).
- **Problem:** The WAL grows forever, and every 5 minutes write latency spikes.
- **Predict:** "Halving checkpoint_timeout makes crash recovery __ and WAL volume __."
  - Answer: faster; larger (more full-page images).
- **Core idea:** Recovery only needs WAL since the last point when all dirty pages were on disk, so create such points on purpose and spread their I/O.
- **Mechanism:**
  - checkpoint record and REDO point;
  - spread writes;
  - WAL recycling;
  - full-page images after each checkpoint.
- **Playground:**
  - Controls: sliders for checkpoint_timeout, max_wal_size, completion target, write rate; button "crash".
  - Stats: checkpoints/hour, WAL generated, I/O spike height, recovery time (illustrative).
- **Common:**
  1. `LOG: checkpoints are occurring too frequently (N seconds apart)` with `HINT: Consider increasing the configuration parameter "max_wal_size".`
  2. A checkpoint I/O spike. Fix: `checkpoint_completion_target`.
  3. A huge max_wal_size makes crash recovery take far too long.

### ch10 · Isolation and Deadlocks (`s:'anomalies · SSI · wait-for graph'`, pg `isolation`)
- **Source:** transaction-iso, explicit-locking; deadlock.c and lmgr README; `deadlock_timeout`, `lock_timeout`.
- **Problem:** Two transactions update the same two accounts in opposite order, and one gets an error.
- **Predict:** "Under REPEATABLE READ, T2 updates a row T1 already updated and committed. T2 gets…"
  - Answer: `could not serialize access due to concurrent update`.
- **Core idea:** Name the anomalies each isolation level allows. Treat waiting as something that can fail, because a cycle of waiters never ends by itself.
- **Mechanism:**
  - Read Committed, Repeatable Read, Serializable (SSI);
  - lost update;
  - write skew;
  - lock modes;
  - wait-for graph check after deadlock_timeout.
- **Playground:**
  - Controls: seg for isolation level; seg for scenario (lost update / write skew / opposite lock order / ALTER behind a long query); Step through two sessions.
  - Stats: anomaly yes/no, error SQLSTATE, waits, queue length.
- **Common:**
  1. `ERROR: deadlock detected` with DETAIL `Process … waits for ShareLock on transaction …`.
  2. Serialization failure 40001 is not retried by the application.
  3. A lost update under Read Committed from read-modify-write. Fix: `SELECT … FOR UPDATE` or an atomic UPDATE.
  4. An `ALTER TABLE` waiting for ACCESS EXCLUSIVE blocks every later query. Fix: `lock_timeout`.

### ch11 · Streaming Replication and synchronous_commit (`s:'WAL sender · slots · sync standby'`, pg `replication`)
- **Source:** warm-standby, hot-standby, runtime-config-replication (`synchronous_standby_names`, `synchronous_commit` levels, `max_slot_wal_keep_size`, `hot_standby_feedback`, `max_standby_streaming_delay`); walsender.c and syncrep.c.
- **Problem:** The primary crashes and the team fails over. Two minutes of paid orders are missing (old scenario).
- **Predict:** "With `synchronous_commit=remote_apply` and one sync standby down, what happens to new commits?"
  - Answer: they hang.
- **Core idea:** Ship WAL to standbys. Which level of standby acknowledgement COMMIT waits for decides what a failover can lose.
- **Mechanism:**
  - WAL sender and receiver;
  - replication slots;
  - async versus sync (`on`, `remote_write`, `remote_apply`);
  - hot standby conflicts.
- **Playground:**
  - Controls: seg for synchronous_commit level; slider for standby lag; button "crash primary at t"; toggle standby down; toggle inactive slot.
  - Stats: commits lost on failover, commit latency, pg_wal size, standby queries cancelled.
- **Common:**
  1. An inactive replication slot fills pg_wal and the disk. Fix: `max_slot_wal_keep_size`.
  2. The sync standby is down and every commit hangs.
  3. `canceling statement due to conflict with recovery` on a standby.
  4. An asynchronous failover loses acknowledged commits.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 SQL & catalog | ch0 |
| ch1 Heap & buffer pool | ch1 |
| ch2 Iterator execution | ch2 |
| ch3 B-tree index | ch3 |
| ch4 Transactions & MVCC + 4 MVCC cases | ch4 |
| ch5 WAL & recovery | ch5 |
| ch6 VACUUM | ch6 |
| ch7 Planner & statistics | ch7 |
| ch8 Sort & hash join | ch8 |
| ch9 Checkpoint & WAL | ch9 |
| ch10 Isolation & deadlocks | ch10 |
| scenario "insert → update → delete (MVCC)" | ch4 playground |
| scenario "primary crash (synchronous_commit)" | ch11 |

## Dropped or merged, and why
- **"Use your own data (CSV/JSONL)" panel:** dropped for determinism.
- **Milestones:** dropped as a section; their assertions appear as the playgrounds' fix outcomes.
