/* Spec for the PostgreSQL system-design course: overview, problem, requirements, estimates, high-level design, and the per-feature specs.
 * Facts target PostgreSQL 17. Defaults come from postgresql.conf.sample and the 17 documentation; see spec.verify for what was and was not re-read. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  id: 'postgres', name: 'PostgreSQL', version: '17', root: '../../', brand: '#336791'
};
CourseData.spec = {
  version: '17',
  title: 'Design a relational database engine',
  navTitle: 'Relational database engine',
  lead: 'Start from an order system that must never lose a paid order, must let readers and writers work at the same time, and must keep answering after a crash. Work out what the engine has to do and how it is built, then walk each feature through the use cases that decide whether it behaves in production.',
  overview: [
    '<b>What it is.</b> PostgreSQL stores rows in 8 kB pages of a heap file, finds them through separate index files, and never changes a row in place: an update writes a new version and the old one stays until nobody can see it. Every change is written to a log (the WAL) before the data file, so the log, not the data file, is what makes a commit durable.',
    '<b>Who does what.</b> The postmaster forks one backend process per connection. A backend parses, plans and runs the query against shared buffers. The WAL writer, checkpointer, background writer and autovacuum workers run beside it, and WAL senders stream the log to replicas. Nothing here is a thread pool, so the cost of a connection is the cost of a process.'
  ],
  problem: [
    ['<b>Scenario</b>', 'An online shop keeps 200 million orders (about 30 GB of table data) and takes 3,000 writes/s and 20,000 reads/s at peak (example numbers). Checkout must read one order by id in a few milliseconds while a nightly report scans the whole table and a deploy renames a column.'],
    ['<b>Naive design</b>', 'One file of rows, one lock per table or row, updates in place, and a flush of the data file on every commit.'],
    ['<b>Fails when</b>', 'The report holds a read lock and checkout waits behind it. A crash in the middle of an in-place update leaves half a page. Every commit costs a random write to a 30 GB file, so throughput is bounded by the disk seek rate.'],
    ['<b>Principle</b>', 'Never update in place and never make readers wait: keep versions, and give each reader a snapshot of what was committed when it started. Make the commit a sequential append to a log, and apply that log to the data files later, in batches, in any order.']
  ],
  fr: [
    'Accept connections, parse SQL and check it against the catalog before reading any row.',
    'Store rows in pages, cache pages in memory, and move large values out of line.',
    'Find rows by key without reading the table (ordered indexes).',
    'Give each transaction a consistent snapshot, with readers and writers not blocking each other.',
    'Make a commit durable and recover to a consistent state after a crash.',
    'Reclaim the space of dead row versions and keep transaction ids from running out.',
    'Choose a cheap plan from statistics and run it as a tree of operators.',
    'Stream the log to replicas and choose how long a commit waits for them.'
  ],
  nfr: [
    '<b>Isolation:</b> a plain read never waits for a writer, and a writer never waits for a plain read.',
    '<b>Durability:</b> once COMMIT returns with <code>synchronous_commit = on</code>, the commit record is flushed to disk on the primary.',
    '<b>Atomic recovery:</b> after a crash, replay from the last checkpoint gives a state where every committed change is present and no uncommitted one is visible.',
    '<b>Bounded growth:</b> dead versions are reclaimed by VACUUM; table and index size follow the live data plus a bounded dead fraction.',
    '<b>Latency:</b> a primary key lookup reads about as many pages as the tree is tall (3 to 4), most of them already in memory (a target to test, not a promise).',
    '<b>Transaction id space:</b> a 32-bit counter must never wrap onto live data, so old rows are frozen before 2 billion transactions pass.'
  ],
  out: 'Installation, roles and row-level security, extensions (PostGIS, pgvector), partitioning and logical replication details, connection pooler internals, and managed cloud variants.',
  est: [
    ['How big is the heap?', '200M rows × (120 B data + 24 B tuple header + 4 B line pointer) ≈ 150 B → about 55 rows per 8 kB page (assumed row size)', '≈ 3.6M pages ≈ 29 GB of table before any dead versions (feature 2).'],
    ['How tall is the primary key index?', 'Entry ≈ 16 B + 4 B pointer = 20 B, leaf 90% full → ~360 per leaf. 200M ÷ 360 ≈ 555k leaves. Internal fan-out ≈ 300 (assumed)', '≈ 4.4 GB index and 4 levels: root, 2 internal, leaf. A lookup is 4 index pages plus 1 heap page, and the top levels stay in memory (feature 3).'],
    ['How many connections can it hold?', '500 app instances × 10 connections = 5,000 backends against <code>max_connections = 100</code> (assumed fleet)', 'Each backend is an OS process with its own memory, so put a pooler in front: the database wants tens of active sessions, not thousands (feature 1).'],
    ['How much WAL and how often a checkpoint?', '3,000 writes/s × ~200 B of WAL ≈ 0.6 MB/s ≈ 2 GB/h (assumed). Time trigger: 5 min × 0.6 MB/s ≈ 180 MB, well under <code>max_wal_size = 1GB</code>', 'Checkpoints are time-driven here. Right after each one, full-page images inflate the WAL for a while (feature 5).'],
    ['When does autovacuum start on the big table?', '<code>autovacuum_vacuum_scale_factor 0.2</code> × 200M + 50 ≈ 40M dead rows', 'About 20% of the table dead before the default trigger. For a table this size lower the scale factor per table (feature 6).'],
    ['How fast do transaction ids burn?', '3,000 write transactions/s × 86,400 s ≈ 259M ids/day against <code>autovacuum_freeze_max_age = 200M</code> (assumed one id per write)', 'An anti-wraparound pass roughly every 19 hours. Batching writes into fewer transactions slows the burn (feature 6).']
  ],
  hldNote: 'Select a box to open that feature. The query path runs left to right: connection → parser and planner → executor → buffers and indexes → WAL → data files and replicas. MVCC and VACUUM sit across the storage boxes.',
  decisions: [
    ['One process or one thread per connection?', 'One process per connection, shared memory between them', 'Crash isolation and simple code, at the price of a costly connection: use a pooler.'],
    ['Update in place?', 'No: write a new row version, keep the old until no snapshot needs it', 'Readers never block writers, at the price of dead versions and VACUUM.'],
    ['Flush data files on commit?', 'No: flush only the WAL record and write data pages later', 'A commit is one sequential flush, at the price of crash recovery by replay.'],
    ['Replicate synchronously?', 'Asynchronous by default, with <code>synchronous_commit</code> levels as an opt-in', 'Low commit latency, at the price that an acknowledged commit can be missing on a replica after a failover.']
  ],
  verify: [
    'Configuration defaults (<code>max_connections</code>, <code>shared_buffers</code>, <code>work_mem</code>, <code>checkpoint_timeout</code>, <code>max_wal_size</code>, autovacuum and freeze settings, <code>deadlock_timeout</code>, standby delays) are those of <code>postgresql.conf.sample</code> and the PostgreSQL 17 manual. They were written from those sources by knowledge and were not re-fetched in this build. Confirm any number with <code>SHOW</code> on your own server before you rely on it.',
    'Structural constants (page size 8 kB, 24-byte page header, 4-byte line pointer, 23-byte tuple header, TOAST threshold about 2 kB, ring buffer 256 kB, <code>usage_count</code> cap of 5, 5 custom plans before a generic one) come from <code>bufpage.h</code>, <code>htup_details.h</code>, <code>heaptoast.h</code>, <code>freelist.c</code> and <code>plancache.c</code>.',
    'The B+tree animation is a simplified nbtree: real pages hold hundreds of keys, keep a high key, and split at a space-balanced point, not exactly the middle. Page splits, separator promotion, root growth and right-sibling links are the real mechanism.',
    'Everything else (sizes, timings, row counts, durations, lag figures) is an <b>example or assumption</b> and is labelled that way. B-tree skip scan arrived in PostgreSQL 18, so this course says it is absent in 17.'
  ]
};

CourseData.features = [
  {
    id: 'conn', tag: 'query path', name: 'Connections, parser and plan cache',
    summary: 'A connection is a process. A statement is parsed, checked against the catalog and planned before any data page is read.',
    goal: 'Turn text into a checked, planned statement cheaply, and bound the number of backends.',
    scope: [['Backend per connection and <code>max_connections</code>', 'Parse, analyze, rewrite, plan, execute', 'Prepared statements and the plan cache'], ['Wire protocol details', 'Authentication', 'Pooler internals']],
    fr: ['Fork a backend for each client connection.', 'Reject a statement that names a missing object before reading rows.', 'Reuse a plan for a prepared statement when that is safe.'],
    nfr: ['A statement that cannot be resolved fails in analysis, before execution.', 'Backends are capped by <code>max_connections</code> (100 by default), with a few slots kept for superusers.', 'A prepared statement runs 5 custom plans before a generic one is considered.'],
    decisions: [['Concurrency model?', 'Process per connection', 'Isolation and simplicity; 5,000 connections means 5,000 processes.'], ['Reuse plans?', 'Only after 5 custom plans, and only if the generic plan is not costlier on average', 'Saves planning time; a generic plan can be wrong for skewed values.']]
  },
  {
    id: 'heap', tag: 'storage', name: 'Heap pages, buffer pool and TOAST',
    summary: 'Rows live in 8 kB slotted pages, pages are cached in shared buffers by a clock sweep, and large values are moved out of the row.',
    goal: 'Store variable-size rows in fixed-size pages and serve hot pages from memory.',
    scope: [['Slotted page layout and the ctid', 'Shared buffers and clock sweep', 'TOAST'], ['Free space map internals', 'Direct I/O', 'Partitioning']],
    fr: ['Address any row by block number and line pointer.', 'Keep recently used pages in memory and pick a victim when full.', 'Store values over about 2 kB out of line.'],
    nfr: ['A row never spans pages, so a page is the unit of I/O and of logging.', '<code>shared_buffers</code> defaults to 128 MB.', 'A large sequential scan must not flush the whole cache (ring of 256 kB).'],
    decisions: [['Page layout?', 'Line pointer array from the front, rows from the back', 'Rows can move inside a page without changing their ctid; a few bytes per row of overhead.'], ['Evict how?', 'Clock sweep with a usage count up to 5', 'No global LRU list to lock; approximate recency.']]
  },
  {
    id: 'index', tag: 'indexes', name: 'B+tree indexes',
    summary: 'A balanced tree of pages that finds a key in a few page reads, splits when a page fills, and chains the leaves for range scans.',
    goal: 'Find a row or a range of rows without reading the table.',
    scope: [['Lookup, insert and page split', 'Multi-column order', 'HOT updates and index entries'], ['GIN, GiST, BRIN, hash indexes', 'Index build internals']],
    fr: ['Descend from the root to a leaf in one page read per level.', 'Insert in order and split a full page without blocking readers for long.', 'Serve a range by walking right-sibling links.'],
    nfr: ['The tree stays balanced: all leaves at the same depth.', 'Leaf pages are filled to 90% by default (<code>fillfactor</code> 90), internal pages to 70%.', 'An update that changes no indexed column and fits in the page adds no index entries (HOT).'],
    decisions: [['Where do rows live?', 'Only in leaves, which are linked left to right', 'Range scans never climb back up; each key is stored once more in a separator, which is small.'], ['Merge pages on delete?', 'No: empty pages are recycled by VACUUM', 'No merge logic on the hot path; sparse pages can linger.']]
  },
  {
    id: 'mvcc', tag: 'transactions', name: 'Transactions and MVCC',
    summary: 'Row versions carry the ids of the transactions that created and removed them, and each snapshot decides which versions it sees.',
    goal: 'Let readers and writers run in parallel and give each transaction a consistent view.',
    scope: [['xmin, xmax and visibility', 'READ COMMITTED versus REPEATABLE READ', 'Row locks and deadlocks'], ['SERIALIZABLE details', 'Advisory locks']],
    fr: ['Stamp each version with the creating and deleting transaction id.', 'Build a snapshot per statement or per transaction.', 'Detect a deadlock and abort one transaction.'],
    nfr: ['A plain SELECT takes no row lock and never waits for a writer.', 'The default isolation level is READ COMMITTED.', 'A deadlock is detected after <code>deadlock_timeout</code> (1 s) and one session gets error 40P01.'],
    decisions: [['Undo log or versions in the heap?', 'Versions in the heap', 'Rollback is free, at the price of dead rows and VACUUM.'], ['When to take the snapshot?', 'Per statement by default', 'Fresher reads, at the price that two statements in one transaction can disagree.']]
  },
  {
    id: 'wal', tag: 'durability', name: 'WAL, checkpoints and crash recovery',
    summary: 'The log is flushed first and the data pages later; recovery replays the log from the last checkpoint.',
    goal: 'Make commits durable with one sequential flush and recover to a consistent state after a crash.',
    scope: [['Commit and the WAL flush', 'Redo from the checkpoint', 'Full-page writes'], ['Archiving and PITR', 'Logical decoding']],
    fr: ['Write a log record for every page change before the page is written.', 'Flush the log up to the commit record before acknowledging a commit.', 'Replay the log after a crash, skipping changes already on the page.'],
    nfr: ['Write-ahead rule: a data page is never written before the WAL up to its last change is flushed.', 'A checkpoint is due every 5 minutes or when WAL nears <code>max_wal_size</code> (1 GB).', 'Replay is idempotent: it compares each record to the page LSN.'],
    decisions: [['Flush data pages on commit?', 'No, flush only the WAL', 'One sequential flush per commit; recovery must replay.'], ['Torn pages?', 'Full-page image on first change after a checkpoint', 'Safe against partial 8 kB writes; WAL grows right after each checkpoint.']]
  },
  {
    id: 'vacuum', tag: 'cleanup', name: 'VACUUM, autovacuum and the horizon',
    summary: 'Dead versions are reclaimed only when no snapshot can still see them, and old rows are frozen before the id counter wraps.',
    goal: 'Keep tables and indexes from growing without bound and never let transaction ids wrap.',
    scope: [['Dead tuples and the horizon', 'Autovacuum trigger and cost limits', 'Freezing and wraparound'], ['VACUUM FULL and pg_repack', 'Index bloat repair']],
    fr: ['Find versions older than every snapshot and mark their space reusable.', 'Start vacuum automatically from table statistics.', 'Freeze old rows so ids can be reused.'],
    nfr: ['One long transaction holds back cleanup for every table.', 'Autovacuum runs when dead rows pass 50 + 20% of the table (defaults).', 'Wraparound protection is forced at <code>autovacuum_freeze_max_age</code> (200 million).'],
    decisions: [['Reclaim when?', 'In the background by threshold', 'Steady work and no pause, at the price of tuning for big tables.'], ['Shrink the file?', 'No, reuse the space (only trailing empty pages are returned)', 'No exclusive lock; the file rarely gets smaller.']]
  },
  {
    id: 'plan', tag: 'planning', name: 'Planner, statistics and executor',
    summary: 'Statistics give row estimates, estimates give costs, the cheapest plan runs as a tree of operators that pull one row at a time.',
    goal: 'Pick a good plan from sampled statistics and run it within a memory budget.',
    scope: [['Row estimates from ANALYZE', 'Hash join and <code>work_mem</code>', 'Iterator execution'], ['Parallel query', 'JIT', 'Extended statistics internals']],
    fr: ['Sample tables and store distributions per column.', 'Cost scans and joins and pick the cheapest tree.', 'Run the tree, spilling to disk when memory is short.'],
    nfr: ['A stale estimate can flip a plan, so ANALYZE must keep up.', '<code>work_mem</code> is per node, per query (4 MB default; hash nodes get 2×).', 'An operator returns one row per call, so a LIMIT can stop early.'],
    decisions: [['Costs from where?', 'Sampled statistics and fixed cost constants', 'Cheap to plan, at the price that estimates are wrong for correlated columns.'], ['Memory limit?', '<code>work_mem</code> per sort or hash node', 'Predictable per node; a query with many nodes can use many times the setting.']]
  },
  {
    id: 'repl', tag: 'replication', name: 'Streaming replication',
    summary: 'The WAL is streamed to replicas, a setting decides how far a commit waits for them, and replicas can hold back cleanup on the primary.',
    goal: 'Keep a near-current copy for failover and read scale, with an explicit durability trade-off.',
    scope: [['WAL streaming and <code>synchronous_commit</code>', 'Recovery conflicts on a hot standby', 'Replication slots'], ['Logical replication', 'Failover managers']],
    fr: ['Send WAL to each replica as it is flushed.', 'Let a commit wait for a chosen replica stage.', 'Keep WAL a replica still needs.'],
    nfr: ['A replica applies WAL in order and serves read-only queries.', 'Default <code>synchronous_commit</code> is <code>on</code>, which waits for the local flush only unless sync standbys are named.', 'A query on a standby is cancelled after <code>max_standby_streaming_delay</code> (30 s) when it blocks replay.'],
    decisions: [['How long does a commit wait?', 'Chosen per session or transaction by <code>synchronous_commit</code>', 'Pay latency only where loss is unacceptable.'], ['Keep WAL for a slow replica?', 'Replication slot keeps it until consumed', 'No full re-copy for a lagging replica; a dead replica can fill the primary disk.']]
  }
];
