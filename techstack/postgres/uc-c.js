/* Use cases for features 7 and 8: planner, statistics and executor; streaming replication.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.plan = [
    {
      title: 'Stale statistics flip the plan', short: 'row estimates', kind: 'estimate',
      intro: 'The planner never looks at the data while planning. It trusts sampled statistics. See what happens when they fall behind the data.',
      trigger: 'A flash sale adds 12 million <code>pending</code> orders to a 200 million row table within an hour. A join between pending orders and customers suddenly runs for hours (example numbers).',
      run: "EXPLAIN (ANALYZE) SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'pending';\n-- Index Scan ... (rows=1000000) (actual rows=13000000)\nANALYZE orders;",
      expect: 'The estimate is off by 13 times, so the planner picks a nested loop with an index probe per row. After ANALYZE it picks a hash join.',
      steps: [
        S('What the planner believes', 'The last ANALYZE recorded that <code>status = \'pending\'</code> was 0.5% of the table, about 1 million rows. The planner costs the plan with that number: a nested loop with an index probe into <code>customers</code> looks cheap for 1 million rows.', { est: 1000000, act: 1000000, plan: 'Nested Loop · Index Scan', stale: false }, 'estimate: 1,000,000 rows'),
        S('The data shifts', 'The flash sale adds 12 million pending orders. That is 6% of the table, below the autoanalyze trigger of 50 + 10% of the rows (20 million changes), so no new statistics are collected.', { est: 1000000, act: 13000000, plan: 'Nested Loop · Index Scan', stale: true }, 'reality: 13,000,000 rows'),
        S('The plan runs', '<code>EXPLAIN (ANALYZE)</code> shows <code>rows=1000000</code> next to <code>actual rows=13000000</code>. The nested loop makes 13 million random index probes where one sequential pass would do.', { est: 1000000, act: 13000000, plan: 'Nested Loop · Index Scan', stale: true, slow: true }, 'estimate off by 13×'),
        S('ANALYZE samples the table', '<code>ANALYZE</code> reads a random sample of 30,000 rows (300 times <code>default_statistics_target</code> of 100), then rebuilds the most common values list and the histogram. It sees that <code>pending</code> is now about 6.5%.', { est: 13000000, act: 13000000, plan: 'Nested Loop · Index Scan', stale: false, analyzed: true }, 'sample: 30,000 rows'),
        S('The planner replans', 'With 13 million rows expected, a hash join over a sequential scan costs less than 13 million probes. The next execution uses it and finishes in minutes instead of hours (example).', { est: 13000000, act: 13000000, plan: 'Hash Join · Seq Scan', stale: false, fixed: true }, 'plan: Hash Join'),
        S('Why not just analyze more often', 'Autoanalyze waits for <code>50 + 0.1 × rows</code> changes. For a big table that is a lot. Lowering <code>autovacuum_analyze_scale_factor</code> on this table, or running ANALYZE after bulk changes, keeps the estimates close.', { est: 13000000, act: 13000000, plan: 'Hash Join · Seq Scan', stale: false, fixed: true, tune: true }, 'trigger: 50 + 10% of rows')
      ],
      edges: [
        E('Correlated columns', 'Statistics are per column, so the planner multiplies selectivities as if columns were independent. <code>city = \'Paris\' AND country = \'FR\'</code> is estimated far too low.', 'Create extended statistics: <code>CREATE STATISTICS ... (dependencies) ON city, country FROM addresses</code>, then ANALYZE.'),
        E('A skewed column and a small sample', 'With 100 histogram buckets a rare but important value may be missed.', 'Raise the target per column: <code>ALTER TABLE ... ALTER COLUMN ... SET STATISTICS 1000</code>, then ANALYZE.')
      ],
      invariant: 'The planner picks the plan with the lowest estimated cost, and the estimate is only as good as the last ANALYZE.',
      src: '17 manual: Planner/Optimizer, Statistics Used by the Planner, <code>default_statistics_target</code> 100, autovacuum analyze settings (50 and 0.1). Row counts are examples.'
    },
    {
      title: 'A hash join that does not fit in work_mem', short: 'hash batches', kind: 'batches',
      intro: 'A hash join builds an in-memory table of the smaller input. When it does not fit, the join is split into batches that go through temporary files.',
      trigger: 'A query joins a 24 MB build side with a large probe side while memory for the hash is 8 MB: <code>work_mem</code> 4 MB times <code>hash_mem_multiplier</code> 2.0 (example sizes).',
      run: "SHOW work_mem;   -- 4MB\nEXPLAIN (ANALYZE) SELECT ... ;   -- Hash  (Buckets: 131072  Batches: 4  Memory Usage: 7500kB)",
      expect: 'The join runs in 4 batches. Only batch 0 stays in memory; the others go through temp files and are joined one at a time.',
      steps: [
        S('The build side is too big', 'The planner expects a 24 MB hash table but only 8 MB is allowed for it. A single in-memory hash table is impossible.', { n: 4, k: 0 }, 'needed: 24 MB · allowed: 8 MB'),
        S('Choose the number of batches', 'The number of batches is a power of two large enough that one batch fits: 24 ÷ 8 = 3, so 4 batches of about 6 MB. Each row\'s hash decides its batch.', { n: 4, k: 1 }, 'batches: 4 · about 6 MB each'),
        S('Partition both inputs', 'Batch 0 rows stay in memory. Rows of batches 1 to 3 are written to temp files, and the probe side rows are routed the same way, so matching keys always meet in the same batch.', { n: 4, k: 2 }, 'temp files: 3 build + 3 probe'),
        S('Join batch 0', 'While reading the probe side, rows for batch 0 are matched against the in-memory table at once. Batch 0 is finished without any extra I/O.', { n: 4, k: 3 }, 'batch 0 joined'),
        S('Join the other batches in turn', 'For batches 1 to 3, the build rows are read back into memory, a new hash table is built, and the matching probe file is streamed through it. The cost is one extra write and read of most of the data.', { n: 4, k: 4 }, 'batches 1 to 3 joined from disk'),
        S('The fix', 'Raise <code>work_mem</code> for this query to 16 MB (32 MB for the hash) and <code>Batches</code> becomes 1 with no temp I/O. But the limit applies per node and per query, so a global increase multiplies across all connections.', { n: 1, k: 5 }, 'batches: 1 · no temp files')
      ],
      edges: [
        E('A wrong estimate makes it worse', 'If the planner thinks the build side is small, it plans 1 batch, then the executor discovers more rows and doubles the batches at run time.', 'Fix the estimate first (the stale statistics case), then the memory. Check <code>EXPLAIN (ANALYZE)</code> for <code>Batches</code> greater than 1.'),
        E('work_mem multiplies', 'A single query can use <code>work_mem</code> several times (one per sort and hash node), and parallel workers each get their own.', 'Set a modest global value and raise it per session or per role for known heavy queries.')
      ],
      invariant: 'Rows with equal join keys always land in the same batch, so joining the batches one by one gives the same result as one big hash.',
      src: '<code>src/backend/executor/nodeHash.c</code>, <code>nodeHashjoin.c</code> (batches are powers of two), 17 manual: <code>work_mem</code> 4 MB, <code>hash_mem_multiplier</code> 2.0. Sizes are examples.'
    },
    {
      title: 'Each operator returns one row at a time', short: 'iterator execution', kind: 'pull',
      intro: 'The executor is a tree of operators. The top node asks for a row, and each node asks its child. See why LIMIT can stop early and why a sort cannot.',
      trigger: 'The home page runs <code>SELECT * FROM orders WHERE status = \'paid\' ORDER BY created_at DESC LIMIT 3</code> on 200 million rows (example query).',
      run: "EXPLAIN (ANALYZE) SELECT * FROM orders WHERE status = 'paid' ORDER BY created_at DESC LIMIT 3;\n-- Limit -> Index Scan Backward using orders_created_idx  (Filter: status = 'paid')",
      expect: 'With an index on created_at the scan reads only about six rows. Without one, the sort has to read all 200 million before returning the first.',
      steps: [
        S('The plan is a tree', 'The top operator is <code>Limit 3</code>. Its child is an index scan that walks <code>created_at</code> backwards and applies the filter <code>status = \'paid\'</code>. The executor calls the top node and each call returns one row.', { fetched: 0, emitted: 0 }, 'rows fetched: 0 · returned: 0'),
        S('Row 1', 'Limit asks the scan for a row. The scan reads the newest index entry and its heap row. It is <code>paid</code>, so the row passes the filter and goes up.', { fetched: 1, emitted: 1 }, 'fetched: 1 · returned: 1'),
        S('Row 2 skips one row', 'The next fetched row is <code>new</code> and fails the filter. The scan keeps reading inside the same call until a row passes: the third fetched row is <code>paid</code>.', { fetched: 3, emitted: 2 }, 'fetched: 3 · returned: 2'),
        S('Row 3 and stop', 'Two more rows fail the filter, the sixth passes. Limit has its 3 rows and never calls the scan again. Of 200 million rows, six were touched.', { fetched: 6, emitted: 3, done: true }, 'fetched: 6 · returned: 3 · scan stopped'),
        S('Without the index: a blocking node', 'If there were no index on <code>created_at</code>, a Sort node sits under Limit. A sort cannot return its first row until it has seen every input row, so it must pull all 200 million rows.', { fetched: 6, emitted: 3, sort: true }, 'sort must read all rows first'),
        S('EXPLAIN shows the difference', 'The indexed plan reports <code>rows=3</code> with a few rows removed by the filter. The sorted plan reports every row read, even though a top-N heapsort keeps only 3 in memory.', { fetched: 6, emitted: 3, sort: true, explain: true }, 'Index Scan: 6 rows · Sort: 200M rows')
      ],
      edges: [
        E('A filter that rejects almost everything', 'If only 1 row in a million is <code>paid</code>, the scan may read the whole index before finding three, so LIMIT does not help.', 'Create a partial or composite index that matches the filter, such as <code>(status, created_at DESC)</code>.'),
        E('Blocking operators', 'Sort, hash build and aggregate without an index must consume their whole input before returning the first row.', 'Look for them in the plan when time to first row matters; provide an index that returns rows in the needed order.')
      ],
      invariant: 'An operator produces one row per call and asks its children only when it needs more, so a node above can stop the work below.',
      src: '17 manual: Using EXPLAIN, <code>src/backend/executor/README</code> (demand-pull execution, <code>ExecProcNode</code>), <code>nodeLimit.c</code>. Row positions are an example.'
    }
  ];

  CourseData.uc.repl = [
    {
      title: 'How long does COMMIT wait for the standby', short: 'synchronous_commit', kind: 'syncwait',
      intro: 'WAL goes to the standby as it is flushed, but a commit waits for the standby only when told to, and only up to a chosen stage. See what each setting guarantees.',
      trigger: 'The payments service must not lose an acknowledged commit, while the audit-log service can accept some loss (example requirements).',
      run: "SET synchronous_commit = remote_apply;   -- per session or transaction\nSHOW synchronous_standby_names;           -- empty by default, so no sync standby",
      expect: 'Each level waits for one more stage: off, local flush, standby write, standby flush, standby apply.',
      steps: [
        S('off', 'COMMIT returns before the WAL is flushed locally. A crash can lose the last few commits, but the database stays consistent. The fastest setting, with no protection.', { level: 0 }, 'ack: immediately · risk: lose recent commits'),
        S('local', 'COMMIT waits for the local WAL flush only. The standby may not have the commit yet, so a failover right now can lose it.', { level: 1 }, 'ack: local flush · risk: standby behind'),
        S('remote_write', 'COMMIT waits until a synchronous standby has received the WAL and handed it to its operating system, not yet to disk. It survives a primary loss, not a simultaneous standby crash.', { level: 2 }, 'ack: standby wrote'),
        S('on (with a sync standby)', 'COMMIT waits until the standby has flushed the WAL to disk. The commit is on two machines. This only takes effect when <code>synchronous_standby_names</code> is set.', { level: 3 }, 'ack: standby flushed'),
        S('remote_apply', 'COMMIT waits until the standby has also replayed the commit, so a query on the standby immediately sees it. The highest latency, and read-your-writes on the replica.', { level: 4 }, 'ack: standby applied'),
        S('The standby is down', 'With a sync standby named and none reachable, commits that need it wait indefinitely. The service stalls until the standby returns or the setting is changed.', { level: 3, down: true }, 'commits wait for a standby that is gone')
      ],
      edges: [
        E('A single sync standby is a single point of stall', 'If it fails, writes that wait for it stop.', 'Name two or more standbys with <code>ANY 1 (a, b)</code> style quorum so one failure does not halt commits.'),
        E('Latency adds a round trip', 'Each synchronous wait adds the network round trip to the standby and its flush time to every commit.', 'Keep standbys close, and use the weaker level for data that can tolerate loss, per transaction.')
      ],
      invariant: 'A commit returns only after the stage named by synchronous_commit has been reached, and nothing stronger is promised.',
      src: '17 manual: <code>synchronous_commit</code> (off, local, remote_write, on, remote_apply), <code>synchronous_standby_names</code>, High Availability: Synchronous Replication.'
    },
    {
      title: 'A long query on a standby is cancelled', short: 'recovery conflict', kind: 'conflict',
      intro: 'A hot standby replays the primary\'s changes while answering queries. Sometimes a replayed change takes away rows a running query still needs.',
      trigger: 'A 60-second report runs on a read replica. Meanwhile the primary vacuums a table the report reads (example timing).',
      run: "SELECT * FROM pg_stat_database_conflicts;   -- on the standby\nSHOW max_standby_streaming_delay;   -- 30s\nSHOW hot_standby_feedback;          -- off",
      expect: 'Replay waits up to 30 seconds for the query, then the standby cancels it with a conflict error.',
      steps: [
        S('The report starts on the standby', 'At time 0 the report starts reading a table on the replica with its own snapshot.', { k: 1 }, 'report running · lag: 0'),
        S('The primary vacuums', 'At 10 s the primary removes dead rows and writes a WAL record for it. The standby receives the record. It cannot know the standby has a query that still needs those rows.', { k: 2 }, 'cleanup record received'),
        S('Replay waits', 'Applying the record would remove rows the report needs, so the startup process waits, up to <code>max_standby_streaming_delay</code> (30 s). While it waits, nothing after it in the WAL is applied and the replica falls behind.', { k: 3 }, 'replay paused · lag grows'),
        S('The query is cancelled', 'At 40 s the standby gives up waiting and cancels the report with <code>canceling statement due to conflict with recovery</code>. Replay resumes and catches up.', { k: 4 }, 'query cancelled at 40 s'),
        S('Option 1: wait longer', 'Raising <code>max_standby_streaming_delay</code> (or -1 for forever) lets reports finish but lets the replica lag for as long as they run.', { k: 5 }, 'trade-off: more lag'),
        S('Option 2: hot_standby_feedback', 'With <code>hot_standby_feedback = on</code> the standby reports its oldest snapshot to the primary, which then holds back cleanup. The report finishes, but the primary keeps dead rows (the horizon from the VACUUM feature) for the replica\'s sake.', { k: 6 }, 'primary holds cleanup for the replica')
      ],
      edges: [
        E('Locks also conflict', 'A DDL on the primary that takes an <code>ACCESS EXCLUSIVE</code> lock is replayed on the standby and can cancel queries that use the table.', 'Schedule migrations away from reports, and use a dedicated replica for long analytics.'),
        E('Feedback and a slot together', 'A replica with feedback that is stuck on a long query holds the primary horizon for hours.', 'Bound report time on the replica, and watch <code>backend_xmin</code> on the primary.')
      ],
      invariant: 'Replay never removes a row version a standby query can still see unless it cancels that query after the standby delay.',
      src: '17 manual: Hot Standby (Handling Query Conflicts), <code>max_standby_streaming_delay</code> 30s, <code>hot_standby_feedback</code> off, <code>pg_stat_database_conflicts</code>.'
    },
    {
      title: 'A replication slot fills the primary disk', short: 'replication slot', kind: 'slot',
      intro: 'A slot makes the primary keep every WAL file a replica has not yet consumed. A replica that never returns means WAL that is never removed.',
      trigger: 'A replica is decommissioned but its slot is left behind. The primary writes about 2 GB of WAL an hour onto a 100 GB disk (example sizes).',
      run: "SELECT slot_name, active, wal_status, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained FROM pg_replication_slots;\nSHOW max_slot_wal_keep_size;   -- -1 (unlimited)",
      expect: 'With the default of no limit, WAL piles up until the disk is full and the primary stops accepting writes.',
      steps: [
        S('A slot remembers the position', 'The replica connects through a slot. The primary records how far the replica has consumed and keeps all WAL from that point on, even after checkpoints.', { gb: 2, slot: 'active' }, 'pg_wal: 2 GB · slot active'),
        S('The replica goes away', 'The replica is shut down for good, but its slot remains. The primary cannot know the replica will not return, so it keeps every WAL file written since.', { gb: 14, slot: 'inactive' }, 'pg_wal: 14 GB after 6 h'),
        S('A day later', 'At 2 GB an hour the retained WAL is about 48 GB and still growing. Nothing is wrong on the primary except a disk that keeps filling.', { gb: 50, slot: 'inactive' }, 'pg_wal: 50 GB'),
        S('The disk fills', 'When the disk is full the primary cannot write WAL. It cannot commit, so every write fails and, in the worst case, the server PANICs and stops.', { gb: 100, slot: 'inactive' }, 'disk full · writes stopped'),
        S('Put a cap on it', '<code>max_slot_wal_keep_size</code> (default -1, unlimited) set to 20 GB lets the primary drop WAL beyond that. The slot becomes <code>lost</code>, the primary survives, and the replica must be rebuilt.', { gb: 20, slot: 'lost', cap: true }, 'slot lost at 20 GB · primary healthy'),
        S('Watch and clean up', 'Alert on <code>pg_replication_slots.wal_status</code> and retained bytes, and drop slots of replicas that are gone with <code>pg_drop_replication_slot</code>. The WAL is then recycled at the next checkpoint.', { gb: 2, slot: 'dropped' }, 'slot dropped · pg_wal back to 2 GB')
      ],
      edges: [
        E('Logical decoding slots', 'A stalled logical consumer (a CDC pipeline) holds WAL and also the catalog horizon, so it can bloat system tables.', 'Monitor logical slots separately and alert on their lag; drop them when the pipeline is retired.'),
        E('Without a slot', 'A replica that falls too far behind the retained WAL cannot catch up and needs a new base backup.', 'Use <code>wal_keep_size</code> or WAL archiving for a bounded safety margin without an unbounded slot.')
      ],
      invariant: 'A slot keeps WAL until its consumer has read it, so retained WAL grows without bound unless the consumer returns or a limit is set.',
      src: '17 manual: Replication Slots, <code>max_slot_wal_keep_size</code> default -1, <code>pg_replication_slots.wal_status</code>. Disk size and WAL rate are examples.'
    }
  ];
})();
