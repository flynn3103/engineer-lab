/* Use cases for features 4 to 6: transactions and MVCC, WAL and recovery, VACUUM and the horizon.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const V = (c, xmin, xmax, amt, v, tag) => ({ c, xmin, xmax, amt, v, tag });
  CourseData.uc.mvcc = [
    {
      title: 'An update writes a new row version', short: 'xmin and xmax', kind: 'versions',
      intro: 'PostgreSQL never changes a row in place. Each version is stamped with the transaction that created it and the one that removed it. See which version a reader gets at each moment.',
      trigger: 'Transaction 100 inserts order 42 with amount 50. Transaction 105 later changes the amount to 60 while a report keeps reading (example ids).',
      run: "SELECT ctid, xmin, xmax, amount FROM orders WHERE id = 42;\nUPDATE orders SET amount = 60 WHERE id = 42;\nSELECT ctid, xmin, xmax, amount FROM orders WHERE id = 42;   -- new ctid, new xmin",
      expect: 'The reader sees amount 50 until transaction 105 commits, then 60. The old version is kept until no snapshot needs it.',
      steps: [
        S('Insert by transaction 100', 'The new row version gets <code>xmin = 100</code> and <code>xmax = 0</code> (nobody removed it). Transaction 100 has not committed, so no other snapshot sees the row.', { rows: [V('(0,1)', 100, 0, 50, 'no', 'creator not committed')], reader: 'sees: no row' }, 'tx 100 in progress'),
        S('Commit', 'The commit marks transaction 100 as committed in the commit log (<code>pg_xact</code>). Snapshots taken from now on see the version.', { rows: [V('(0,1)', 100, 0, 50, 'ok', 'visible')], reader: 'sees: amount 50' }, 'tx 100 committed'),
        S('Update by transaction 105', 'The old version gets <code>xmax = 105</code>. A new version <code>(0,2)</code> with amount 60 is written with <code>xmin = 105</code>. Transaction 105 is still open, so readers still use the old one.', { rows: [V('(0,1)', 100, 105, 50, 'ok', 'visible: 105 not committed'), V('(0,2)', 105, 0, 60, 'no', 'creator not committed')], reader: 'sees: amount 50' }, 'two versions · tx 105 open'),
        S('Commit of 105', 'Once 105 commits, the old version is deleted for every new snapshot and the new one is visible. A reader that began earlier may still need the old version, so it stays on the page.', { rows: [V('(0,1)', 100, 105, 50, 'old', 'deleted by committed 105'), V('(0,2)', 105, 0, 60, 'ok', 'visible')], reader: 'sees: amount 60' }, 'new snapshots see (0,2)'),
        S('If 105 had rolled back', 'Rollback writes nothing to the heap. The <code>xmax = 105</code> on the old version is ignored because 105 aborted, so it is visible again; the new version is never visible. Rollback is instant.', { rows: [V('(0,1)', 100, 105, 50, 'ok', 'visible: 105 aborted'), V('(0,2)', 105, 0, 60, 'no', 'creator aborted')], reader: 'sees: amount 50' }, 'rollback cost: 0 page writes'),
        S('Hint bits save lookups', 'Looking up a transaction in <code>pg_xact</code> costs a read. The first reader that learns the answer sets a hint bit on the row, so later readers skip the lookup. This is why a plain SELECT can dirty pages.', { rows: [V('(0,1)', 100, 105, 50, 'old', 'hint: xmax committed'), V('(0,2)', 105, 0, 60, 'ok', 'hint: xmin committed')], reader: 'sees: amount 60' }, 'hint bits set on both')
      ],
      edges: [
        E('A hot row updated many times', 'Every update adds a version and a pointer, so a row updated 100 times a second leaves 100 dead versions a second.', 'Reclaimed by pruning and VACUUM. For counters, batch increments or use a design that inserts rows and aggregates later.'),
        E('Reading dirties pages', 'Hint bits are written into the page by readers, which makes the page dirty and may cause writes (and WAL when checksums are on) after a bulk load.', 'Run <code>VACUUM</code> after a big load so the hint bits and the visibility map are set once, in the background.')
      ],
      invariant: 'A version is visible to a snapshot only if its xmin is committed before the snapshot and its xmax is not.',
      src: '<code>src/include/access/htup_details.h</code> (<code>t_xmin</code>, <code>t_xmax</code>, hint bits), <code>heapam_visibility.c</code>, 17 manual: Concurrency Control, MVCC.'
    },
    {
      title: 'Snapshots at READ COMMITTED and REPEATABLE READ', short: 'snapshots', kind: 'snaps',
      intro: 'Both levels use snapshots, but they take them at different moments. See what the same two sessions observe at each level.',
      trigger: 'Session A runs a report with two queries. Session B inserts a 50-unit order between them and commits (example timing).',
      run: "-- Session A\nBEGIN ISOLATION LEVEL REPEATABLE READ;   -- default is READ COMMITTED\nSELECT sum(amount) FROM orders WHERE customer_id = 7;",
      expect: 'At READ COMMITTED the second query sees B\'s order. At REPEATABLE READ both queries use one snapshot and agree.',
      steps: [
        S('Session A begins', 'A opens a transaction. No snapshot is taken for a plain <code>BEGIN</code>. The snapshot is built by the first statement.', { k: 0 }, 'A: transaction open'),
        S('First query', 'A\'s first <code>SELECT sum(amount)</code> returns 100. At READ COMMITTED this snapshot lasts for this statement only. At REPEATABLE READ it lasts until the transaction ends.', { k: 1 }, 'both levels: 100'),
        S('Session B commits', 'B inserts an order of 50 and commits. The row is now committed, but A\'s REPEATABLE READ snapshot predates it.', { k: 2 }, 'B committed +50'),
        S('Second query', 'READ COMMITTED takes a fresh snapshot for the new statement and sees 150. REPEATABLE READ reuses its snapshot and still sees 100, so a report with two queries stays consistent.', { k: 3 }, 'READ COMMITTED 150 · REPEATABLE READ 100'),
        S('A writes a row B changed', 'A updates an order that B also updated and committed. READ COMMITTED waits if needed, re-reads the newest version and applies the change. REPEATABLE READ cannot silently skip B\'s change.', { k: 4 }, 'REPEATABLE READ: error 40001'),
        S('Retry on 40001', 'REPEATABLE READ raises <code>could not serialize access due to concurrent update</code>. The application must roll back and run the whole transaction again with a new snapshot.', { k: 5 }, 'application retries the transaction')
      ],
      edges: [
        E('Read skew between statements', 'At READ COMMITTED, a report of two queries can add up to numbers that never existed together.', 'Use <code>REPEATABLE READ</code> (or <code>SERIALIZABLE</code>) for multi-query reports, and write the retry loop.'),
        E('A long repeatable-read transaction holds the horizon', 'Its snapshot keeps old row versions alive for every table until it ends.', 'Keep such transactions short, or run reports on a replica (see the replication feature for the conflict it can cause).')
      ],
      invariant: 'READ COMMITTED takes a snapshot per statement; REPEATABLE READ takes one per transaction at its first statement.',
      src: '17 manual: Transaction Isolation (READ COMMITTED, REPEATABLE READ, error 40001, SQLSTATE <code>serialization_failure</code>).'
    },
    {
      title: 'Two sessions, one deadlock', short: 'deadlock', kind: 'deadlock',
      intro: 'Row locks last until the transaction ends, so two transactions that take them in opposite order can wait for each other forever. See how PostgreSQL breaks the cycle.',
      trigger: 'A transfer updates two accounts. Session A moves money from account 1 to 2 while session B moves from 2 to 1 (example transfers).',
      run: "-- A: UPDATE accounts SET bal = bal - 10 WHERE id = 1;  then id = 2\n-- B: UPDATE accounts SET bal = bal - 10 WHERE id = 2;  then id = 1\nSHOW deadlock_timeout;   -- 1s",
      expect: 'After 1 second one session is aborted with error 40P01 and the other finishes.',
      steps: [
        S('A locks account 1', 'A\'s update takes a row lock on account 1. It keeps the lock until A commits or rolls back.', { k: 1 }, 'A holds row 1'),
        S('B locks account 2', 'B\'s update takes a row lock on account 2. So far nobody waits.', { k: 2 }, 'A holds row 1 · B holds row 2'),
        S('A wants account 2', 'A\'s second update needs row 2, which B holds. A sleeps until B\'s transaction ends.', { k: 3 }, 'A waits for B'),
        S('B wants account 1', 'B\'s second update needs row 1, which A holds. Now A waits for B and B waits for A: a cycle. Neither can ever proceed.', { k: 4 }, 'A waits for B · B waits for A'),
        S('The detector runs', 'A waiter does not check at once. After <code>deadlock_timeout</code> (1 s) it walks the waits-for graph, finds the cycle and aborts its own transaction with error 40P01.', { k: 5 }, 'cycle found after 1 s · B aborted'),
        S('A finishes, B retries', 'B\'s locks are released, A gets row 2 and commits. The application must catch 40P01 and re-run B. The fix is to lock in a consistent order, for example always the lower id first.', { k: 6 }, 'A committed · B retries')
      ],
      edges: [
        E('The 1 second wait is not free', 'Both sessions sit blocked for <code>deadlock_timeout</code> before the cycle is detected, and everything queued behind them waits too.', 'Do not lower it blindly: checking costs CPU. Instead remove the cycle by ordering the locks, and keep transactions short.'),
        E('Foreign keys add hidden locks', 'Inserting a child row takes a shared lock on the parent row, so unrelated-looking transactions can form a cycle.', 'Order writes the same way everywhere, and use <code>lock_timeout</code> for statements that must not wait long.')
      ],
      invariant: 'A deadlock is a cycle in the waits-for graph; PostgreSQL breaks it by aborting one participant after deadlock_timeout.',
      src: '17 manual: Explicit Locking, Deadlocks; <code>deadlock_timeout</code> in the lock management settings; <code>src/backend/storage/lmgr/deadlock.c</code>.'
    }
  ];

  CourseData.uc.wal = [
    {
      title: 'A commit is a log flush', short: 'commit and WAL', kind: 'commit',
      intro: 'When COMMIT returns, the data file may not have changed at all. See which write makes the commit durable.',
      trigger: 'A customer pays for an order. The server crashes one millisecond after COMMIT returned (example).',
      run: "SHOW synchronous_commit;   -- on\nSHOW wal_level;            -- replica\nBEGIN; UPDATE orders SET status = 'paid' WHERE id = 42; COMMIT;",
      expect: 'The paid order survives, because the WAL up to the commit record was flushed to disk before COMMIT returned.',
      steps: [
        S('Change the page in memory', 'The backend updates the page in shared buffers and marks it dirty. Nothing is written to the data file now.', { k: 1 }, 'page dirty in memory'),
        S('Describe the change in WAL', 'Before it can be written anywhere, the change is described as a WAL record in the WAL buffer. The record gets a position, its LSN.', { k: 2 }, 'WAL record in memory'),
        S('COMMIT adds a commit record', 'COMMIT appends a record that says "transaction committed" after the change records.', { k: 3 }, 'commit record in memory'),
        S('Flush the WAL', 'The WAL buffer is written to the WAL file and flushed (fsync) up to the commit record. This is one sequential write. Concurrent commits can share one flush.', { k: 4 }, 'WAL on disk up to the commit LSN'),
        S('Acknowledge', 'Only now does COMMIT return. The order is durable even though the data file is unchanged.', { k: 5 }, 'COMMIT returned'),
        S('Data pages are written later', 'The checkpointer and background writer write the dirty page to the data file in the background, in large sorted batches. Before writing a page they make sure the WAL for its last change is already flushed.', { k: 6 }, 'dirty page written later')
      ],
      edges: [
        E('synchronous_commit = off', 'COMMIT returns before the flush. A crash can lose the last few commits (up to about three times <code>wal_writer_delay</code>, 200 ms by default), but never corrupts data.', 'Use it only for data you can afford to lose, such as clickstream rows, and per transaction rather than globally.'),
        E('A slow WAL disk', 'Every commit waits for an fsync, so commit latency equals the flush latency of the device.', 'Put WAL on fast, low-latency storage, and batch several writes into one transaction.')
      ],
      invariant: 'Write-ahead rule: a data page is written only after the WAL up to its last change is on disk, and a commit returns only after its commit record is.',
      src: '<code>src/backend/access/transam/xlog.c</code> (<code>XLogFlush</code>), 17 manual: WAL Configuration, Asynchronous Commit (<code>wal_writer_delay</code> 200 ms).'
    },
    {
      title: 'Crash recovery replays from the redo point', short: 'redo', kind: 'replay',
      intro: 'After a crash the data files are a mix of old and new pages. See how replaying the log makes them consistent without redoing work twice.',
      trigger: 'The server is killed with power loss. Two pages were written before the crash, one was not (example LSNs).',
      run: "pg_controldata $PGDATA | grep -i 'redo location'\n-- on restart the log shows: redo starts at 0/1000, redo done at 0/10C0",
      expect: 'Records whose LSN is newer than the page LSN are applied; the others are skipped. Transactions without a commit record stay invisible.',
      steps: [
        S('The crash', 'The control file records the last completed checkpoint and its redo point, here LSN 0/1000. All WAL from that point on may describe changes that never reached the data files.', { upto: 0, phase: 'crashed' }, 'redo point: 0/1000'),
        S('Start from the redo point', 'On restart the startup process begins reading WAL at 0/1000. Anything before it is already on disk, because the checkpoint made sure of that.', { upto: 0, phase: 'start' }, 'replay starts at 0/1000'),
        S('Record 0/1010: apply', 'The record changes page 5. That page on disk has LSN 0/0F00, older than the record, so the change is missing and is applied. The page LSN becomes 0/1010.', { upto: 1, phase: 'replay' }, 'applied 1'),
        S('Record 0/1040: skip', 'Page 9 on disk has LSN 0/1100, newer than the record. The page was written before the crash and already has this change. Replay skips it, so replay is safe to repeat.', { upto: 2, phase: 'replay' }, 'applied 1 · skipped 1'),
        S('Commit records decide visibility', 'Record 0/1080 commits transaction 71, so its changes become visible. Transaction 72 wrote changes but has no commit record in the log, so it counts as aborted. Its rows stay invisible.', { upto: 4, phase: 'replay' }, 'tx 71 committed · tx 72 aborted'),
        S('End of WAL', 'At the end of the WAL the data is consistent. The server writes an end-of-recovery checkpoint and starts accepting connections.', { upto: 4, phase: 'done' }, 'consistent · accepting connections')
      ],
      edges: [
        E('Recovery takes as long as the WAL to replay', 'A crash a minute before a checkpoint replays up to a checkpoint interval of WAL, and a larger <code>max_wal_size</code> or <code>checkpoint_timeout</code> means a longer replay.', 'Pick the checkpoint settings from your recovery time target and watch the startup log for the replay progress.'),
        E('A torn page', 'An 8 kB page can be half written when power fails, and a record cannot repair a page whose old contents are mixed.', 'That is what the full-page image after each checkpoint is for (next use case).')
      ],
      invariant: 'Replay compares each record LSN to the page LSN, so applying the log twice gives the same result as applying it once.',
      src: '<code>src/backend/access/transam/xlogrecovery.c</code>, <code>pg_control</code> (checkpoint location and redo location), 17 manual: Write-Ahead Logging, Reliability and the Write-Ahead Log. LSNs are examples.'
    },
    {
      title: 'Full-page writes and the post-checkpoint spike', short: 'full-page writes', kind: 'fpw',
      intro: 'The first change to a page after a checkpoint logs the whole 8 kB page. See what that does to the WAL volume and why it exists.',
      trigger: 'The loader writes about 15 MB of WAL per 30 seconds. After every checkpoint the WAL rate jumps for a short while (example rates).',
      run: "SHOW full_page_writes;     -- on\nSELECT wal_fpi, wal_records FROM pg_stat_wal;   -- fpi = full-page images",
      expect: 'WAL volume spikes right after a checkpoint, then decays, because each page is imaged only once per checkpoint cycle.',
      steps: [
        S('Steady state', 'In the middle of a checkpoint cycle most pages have already been imaged. Each change logs only a small record.', { bars: [15, 15, 15], note: 'small records' }, 'WAL: about 15 MB per 30 s'),
        S('A checkpoint completes', 'The checkpoint wrote every dirty page to the data files and moved the redo point forward. Every page is now clean relative to the new redo point.', { bars: [15, 15, 15], ck: true }, 'redo point moved'),
        S('The spike', 'The first change to each page after the redo point writes the full 8 kB image into the WAL, plus the small record. A burst of first touches means a burst of WAL.', { bars: [15, 15, 15, 120], ck: true }, 'WAL: 120 MB per 30 s'),
        S('The decay', 'As hot pages get their image, only the cold ones still need one. The rate falls back towards normal, within a few intervals.', { bars: [15, 15, 15, 120, 80, 45, 28, 20, 16], ck: true }, 'WAL back near 16 MB per 30 s'),
        S('Why the image exists', 'A page write of 8 kB is not atomic on every device. A crash can leave a page half old, half new, and a small record cannot be applied to a mixed page. The image in the WAL restores the page whole first.', { bars: [15, 15, 15, 120, 80, 45, 28, 20, 16], torn: true }, 'torn page repaired from the image'),
        S('The trade-off', 'A longer <code>checkpoint_timeout</code> means fewer spikes and less WAL, but a longer replay after a crash. A shorter one means the opposite.', { bars: [15, 15, 15, 60, 30, 18, 15, 15, 15], long: true }, 'fewer checkpoints · more replay on a crash')
      ],
      edges: [
        E('Random keys make it worse', 'A random index key (UUID v4) touches a different leaf each time, so many pages get imaged after every checkpoint.', 'Prefer ordered keys for large indexes, or time-ordered ids such as UUID v7.'),
        E('Turning full_page_writes off', 'It cuts WAL volume but a crash can leave torn pages that recovery cannot repair.', 'Leave it on unless the storage guarantees atomic 8 kB writes and you have tested that claim.')
      ],
      invariant: 'The first modification of a page after a checkpoint writes the whole page to the WAL, so recovery never applies a record to a torn page.',
      src: '17 manual: <code>full_page_writes</code>, WAL Configuration (checkpoints), <code>pg_stat_wal</code> (<code>wal_fpi</code>). WAL rates are examples.'
    }
  ];

  CourseData.uc.vacuum = [
    {
      title: 'One idle transaction holds back cleanup', short: 'the horizon', kind: 'horizon',
      intro: 'VACUUM removes a dead version only when no snapshot can still see it. One forgotten transaction can stop that for the whole database.',
      trigger: 'An engineer opens a transaction in a SQL client to look at data and leaves for lunch. Orders keep being updated (example).',
      run: "SELECT pid, state, xact_start, backend_xmin FROM pg_stat_activity WHERE state = 'idle in transaction';\nSHOW idle_in_transaction_session_timeout;   -- 0 (off) by default",
      expect: 'Dead versions deleted after the idle session\'s snapshot cannot be removed, so tables and indexes grow until it ends.',
      steps: [
        S('Updates leave dead versions', 'Each update leaves the old version behind. Here six old versions were deleted by transactions 101 to 106. No old snapshot exists, so the horizon is the current id.', { dels: [101, 102, 103, 104, 105, 106], horizon: 200, size: 40 }, 'dead: 6 · removable: 6'),
        S('VACUUM removes them', 'The horizon is the oldest snapshot any session still holds. Every version deleted before it is unreachable, so VACUUM marks its space reusable.', { dels: [], horizon: 200, size: 40 }, 'dead: 0 · table 40 MB'),
        S('A session starts a transaction and idles', 'A session takes a snapshot at id 210 and does nothing. Its snapshot may still need any version that was live at 210, so the horizon is pinned at 210.', { dels: [], horizon: 210, size: 40, idle: true }, 'horizon pinned at 210'),
        S('Updates continue, VACUUM cannot reclaim', 'New updates delete versions with ids 211 and higher. These deletions came after the pinned snapshot, so VACUUM must keep the old versions: they may still be visible to the idle session.', { dels: [211, 212, 213, 214, 215, 216], horizon: 210, size: 40, idle: true }, 'dead: 6 · removable: 0'),
        S('The table grows', 'Autovacuum runs again and again and removes nothing. New versions go to new pages, so the table and its indexes grow while live data stays the same size.', { dels: [211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222], horizon: 210, size: 95, idle: true }, 'dead: 12 · table 95 MB'),
        S('The session ends', 'When the transaction ends, the horizon jumps forward and the next VACUUM reclaims the space. The file does not shrink, but it stops growing and the space is reused.', { dels: [], horizon: 230, size: 95 }, 'dead: 0 · table stays 95 MB, reused')
      ],
      edges: [
        E('Other things hold the horizon', 'Besides sessions, a replication slot, a prepared transaction, or a replica using <code>hot_standby_feedback</code> can pin the oldest id.', 'Check <code>pg_replication_slots</code>, <code>pg_prepared_xacts</code> and <code>backend_xmin</code> in <code>pg_stat_activity</code> when vacuum reclaims nothing.'),
        E('The default is no timeout', '<code>idle_in_transaction_session_timeout</code> is 0, so an abandoned transaction lives until someone notices.', 'Set a timeout (for example 5 minutes) for application roles, and alert on old <code>xact_start</code>.')
      ],
      invariant: 'A dead version is removable only when it was deleted before the oldest snapshot of any session, slot or prepared transaction.',
      src: '17 manual: Routine Vacuuming, <code>pg_stat_activity.backend_xmin</code>, <code>idle_in_transaction_session_timeout</code> (default 0). Transaction ids and sizes are examples.'
    },
    {
      title: 'When autovacuum decides to run', short: 'autovacuum trigger', kind: 'trigger',
      intro: 'Autovacuum starts a table when its dead rows pass a threshold that grows with the table. See why the default is too lazy for a big table.',
      trigger: 'The 200 million row <code>orders</code> table takes many updates. The team asks why autovacuum starts so rarely (example sizes).',
      run: "SELECT relname, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'orders';\nALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);",
      expect: 'The default trigger is 50 + 20% of the rows, which is 40 million dead rows for this table. A per-table setting lowers it to 2 million.',
      steps: [
        S('The rule', 'A table is vacuumed when its dead rows exceed <code>autovacuum_vacuum_threshold</code> (50) plus <code>autovacuum_vacuum_scale_factor</code> (0.2) times the number of rows.', { rows: 1000, dead: 100, sf: 0.2 }, 'threshold = 50 + 0.2 × rows'),
        S('A small table', 'For 1,000 rows the threshold is 250 dead rows. A small table is cleaned often and cheaply.', { rows: 1000, dead: 100, sf: 0.2 }, 'threshold: 250'),
        S('A big table', 'For 200 million rows the threshold is 40,000,050. With 30 million dead rows, autovacuum has not started and the table is already about 15% bloat. The scan, when it comes, is huge.', { rows: 200000000, dead: 30000000, sf: 0.2 }, 'threshold: 40,000,050 · dead: 30M'),
        S('Lower it for this table', '<code>ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01)</code> makes the threshold 2,000,050. With 3 million dead rows, vacuum starts, and each run is smaller.', { rows: 200000000, dead: 3000000, sf: 0.01 }, 'threshold: 2,000,050 · starts'),
        S('Vacuum is throttled on purpose', 'To protect foreground work, vacuum pauses 2 ms (<code>autovacuum_vacuum_cost_delay</code>) after each cost budget of 200 (<code>autovacuum_vacuum_cost_limit</code>). A big table can take hours, and the 3 workers share one budget.', { rows: 200000000, dead: 3000000, sf: 0.01, throttle: true }, 'cost limit 200 · delay 2 ms · 3 workers'),
        S('It only checks once a minute', 'The launcher wakes every <code>autovacuum_naptime</code> (1 minute) and starts workers for tables over the threshold, up to <code>autovacuum_max_workers</code> (3). Work arrives in steady small amounts instead of one huge cleanup.', { rows: 200000000, dead: 3000000, sf: 0.01, nap: true }, 'checked every 1 min')
      ],
      edges: [
        E('Too few workers for many tables', 'With 3 workers sharing one budget, a large table can occupy a worker for hours while smaller ones wait.', 'Raise <code>autovacuum_vacuum_cost_limit</code> on fast storage, add workers, and set per-table scale factors where it matters.'),
        E('Insert-only tables', 'Pure inserts leave no dead rows, but rows still need freezing and the visibility map set for index-only scans.', 'From version 13, <code>autovacuum_vacuum_insert_threshold</code> (1000) and its scale factor start vacuum for insert-heavy tables too.')
      ],
      invariant: 'Autovacuum starts a table when dead rows exceed threshold + scale_factor × rows, so the larger the table, the later it starts unless the factor is lowered.',
      src: 'postgresql.conf.sample and 17 manual: Routine Vacuuming, Automatic Vacuuming (<code>autovacuum_vacuum_threshold</code> 50, <code>autovacuum_vacuum_scale_factor</code> 0.2, <code>autovacuum_naptime</code> 1min, <code>autovacuum_max_workers</code> 3, <code>autovacuum_vacuum_cost_delay</code> 2 ms).'
    },
    {
      title: 'Freezing keeps transaction ids from wrapping', short: 'wraparound', kind: 'xidring',
      intro: 'Transaction ids are 32-bit numbers compared in a circle. Old rows must be frozen before the counter laps them, or they would appear to be in the future.',
      trigger: 'The shop burns about 259 million transaction ids a day (3,000 write transactions per second). The age of the oldest unfrozen row keeps growing (example).',
      run: "SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;\nSHOW autovacuum_freeze_max_age;   -- 200000000",
      expect: 'At age 200 million autovacuum is forced to freeze old rows, so the age falls back and the 2.1 billion limit is never reached.',
      steps: [
        S('Ids are a circle', 'A transaction id is 32 bits. An id is "in the past" if it is less than about 2.1 billion behind the current one. So any row older than that would flip into the future. The age is the distance from the current id.', { age: 20 }, 'oldest unfrozen age: 20M'),
        S('Age 150 million', 'At <code>vacuum_freeze_table_age</code> (150 million) the next VACUUM scans every page that is not known to be all-frozen, to freeze old rows, instead of skipping pages.', { age: 150, mark: 'table age' }, 'age: 150M · next vacuum scans all'),
        S('Age 200 million', 'At <code>autovacuum_freeze_max_age</code> (200 million) autovacuum starts an anti-wraparound vacuum on the table even if autovacuum is off.', { age: 200, mark: 'forced' }, 'age: 200M · forced vacuum'),
        S('Freezing resets the age', 'Rows older than <code>vacuum_freeze_min_age</code> (50 million) are marked frozen: they count as visible to everyone, whatever the counter says. The oldest unfrozen age falls back to about 50 million.', { age: 50, mark: 'frozen' }, 'age: 50M after freeze'),
        S('If vacuum is blocked', 'A long transaction, an unused replication slot or a vacuum that keeps failing prevents freezing. The age keeps rising, and past about 2.06 billion the server warns on every commit.', { age: 2070, mark: 'warning' }, 'warning: 40M ids left'),
        S('The hard stop', 'About 3 million ids before the limit the server refuses commands that need a new transaction id, to protect data. Recovery then needs a manual VACUUM, and the database is down for writes meanwhile.', { age: 2145, mark: 'stop' }, 'writes refused: 3M ids left')
      ],
      edges: [
        E('A giant table freezes in one burst', 'Anti-wraparound vacuum of a huge table reads and rewrites most of it, causing a spike of I/O and WAL, often at a bad time.', 'Freeze earlier and steadily by letting normal vacuums do it, and watch <code>age(relfrozenxid)</code> per table before it reaches 150 million.'),
        E('Burning ids too fast', 'One id is used per write transaction, so very many tiny transactions shorten the interval between forced freezes.', 'Batch writes into fewer transactions where you can; reads in a read-only transaction use no id.')
      ],
      invariant: 'Every row is frozen before its age reaches about 2 billion transaction ids, enforced by forced vacuum at autovacuum_freeze_max_age.',
      src: '17 manual: Routine Vacuuming, Preventing Transaction ID Wraparound Failures (<code>vacuum_freeze_min_age</code> 50M, <code>vacuum_freeze_table_age</code> 150M, <code>autovacuum_freeze_max_age</code> 200M, warning at 40M and stop at 3M ids left).'
    }
  ];
})();
