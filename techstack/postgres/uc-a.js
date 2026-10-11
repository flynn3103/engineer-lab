/* Use cases for features 1 to 3: query path, heap and buffers, B+tree indexes.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.conn = [
    {
      title: 'A renamed column fails before any row is read', short: 'parse and analyze', kind: 'pipeline',
      intro: 'A deploy renamed one column. Some app servers fail at once with a name error. See which stage of the query path rejects the statement, and why no data page is touched.',
      trigger: 'The column <code>orders.customer_name</code> was renamed to <code>buyer_name</code>. An old app server still sends <code>SELECT customer_name FROM orders WHERE id = 42</code>.',
      run: "ALTER TABLE orders RENAME COLUMN customer_name TO buyer_name;\nSELECT customer_name FROM orders WHERE id = 42;\n-- ERROR:  column \"customer_name\" does not exist   (SQLSTATE 42703)",
      expect: 'The error comes from the analyze stage. The planner and executor never run, so zero heap or index pages are read.',
      steps: [
        S('The text arrives', 'The backend receives the SQL text. Nothing about the table is known yet; it is only a string.', { at: -1, cols: ['id', 'buyer_name', 'amount'], pages: 0 }, 'stage: none · pages read: 0'),
        S('Parse', 'The parser checks grammar only, using the fixed SQL grammar. <code>customer_name</code> is a legal identifier, so the statement is valid SQL. The result is a raw parse tree of names, not of columns.', { at: 0, cols: ['id', 'buyer_name', 'amount'], pages: 0 }, 'stage: parse · grammar ok · pages read: 0'),
        S('Analyze looks in the catalog', 'Analysis resolves each name against the system catalogs: <code>orders</code> in <code>pg_class</code>, its columns in <code>pg_attribute</code>. The column list is <code>id, buyer_name, amount</code>.', { at: 1, cols: ['id', 'buyer_name', 'amount'], pages: 0, look: 'customer_name' }, 'stage: analyze · looking up customer_name'),
        S('Analyze fails', 'There is no column named <code>customer_name</code>. Analysis raises error 42703 and the statement stops here.', { at: 1, fail: true, cols: ['id', 'buyer_name', 'amount'], pages: 0, look: 'customer_name' }, 'ERROR 42703 · pages read: 0'),
        S('The fixed query passes', 'With <code>buyer_name</code> the lookup succeeds. Rewrite, plan and execute follow, and now the executor reads index and heap pages.', { at: 4, cols: ['id', 'buyer_name', 'amount'], pages: 5, look: 'buyer_name' }, 'all stages ran · pages read: 5'),
        S('Why other servers fail later', 'A server that had already prepared the statement holds a cached plan. The rename sends an invalidation message, so the cached plan is rebuilt from the saved parse tree on the next execute and fails the same way, later and with a different timing.', { at: 1, fail: true, cols: ['id', 'buyer_name', 'amount'], pages: 0, look: 'customer_name', cached: true }, 'cached plan invalidated · re-analyze fails')
      ],
      edges: [
        E('A view or function body uses the old name', 'A view stores its query as a parse tree after analysis, so a column rename updates it. A SQL function body written as text is only analyzed when it runs.', 'Run the application test suite after a rename, and prefer expand-and-contract migrations: add the new column, move writers, then drop the old one.'),
        E('The ALTER waits behind a long query', 'The rename needs an <code>ACCESS EXCLUSIVE</code> lock on <code>orders</code>. Queued behind a long transaction it blocks every later query on the table.', 'Set <code>lock_timeout</code> (for example 2 s) for migrations and retry, so a blocked ALTER fails fast instead of stalling checkout.')
      ],
      invariant: 'A statement that names a missing object is rejected in analysis, before the planner or any data page is involved.',
      src: 'PostgreSQL 17 docs: Overview of PostgreSQL Internals (the path of a query), <code>src/backend/parser/parse_target.c</code> (column lookup, error 42703), <code>src/backend/utils/cache/plancache.c</code> (revalidation after invalidation).'
    },
    {
      title: 'One process per connection', short: 'backends', kind: 'backends',
      intro: 'Every client connection is an operating-system process. See how the connection limit is spent, and what a pooler changes.',
      trigger: '500 application instances each open 10 connections (5,000 in total) to a server with <code>max_connections = 100</code> (example fleet).',
      run: 'SHOW max_connections;               -- 100\nSHOW superuser_reserved_connections; -- 3\nSELECT count(*) FROM pg_stat_activity WHERE backend_type = \'client backend\';',
      expect: 'The first 97 ordinary connections succeed. After that, ordinary roles are refused while 3 slots stay open for superusers.',
      steps: [
        S('The postmaster waits', 'One long-lived process, the postmaster, listens on the port. It does not run queries.', { used: 0 }, 'backends: 0 of 100'),
        S('Each connection forks a backend', 'For every accepted connection the postmaster forks a new backend process. The backend has its own memory and shares the buffer pool with the others through shared memory.', { used: 40 }, 'backends: 40 of 100'),
        S('The ordinary limit', '<code>max_connections</code> is 100, but <code>superuser_reserved_connections</code> keeps 3 slots free for administrators. Ordinary roles can use 97.', { used: 97, reserved: true }, 'backends: 97 of 100 · 3 reserved'),
        S('The next connection is refused', 'The 98th ordinary connection gets a FATAL error saying the remaining slots are reserved. The application sees connection errors while the database is mostly idle.', { used: 97, reserved: true, refused: true }, 'new ordinary connection refused'),
        S('A pooler in front', 'A transaction-pooling proxy keeps 20 server connections and lends one to a client only for the length of a transaction. 5,000 clients share 20 backends.', { used: 20, clients: 5000, pool: true }, 'clients: 5,000 · backends: 20'),
        S('Why fewer is faster', 'Active queries compete for a few CPU cores. Many more active backends than cores adds context switches and lock contention, not throughput. Idle backends still cost memory.', { used: 20, clients: 5000, pool: true, note: true }, 'target: active sessions near the core count')
      ],
      edges: [
        E('Raising max_connections is not free', 'Each slot reserves shared memory and enlarges internal arrays; a thousand backends make snapshot building and lock tables slower.', 'Keep <code>max_connections</code> modest and add a pooler. Size the pool to the CPU, not to the number of clients.'),
        E('Session state with transaction pooling', 'Session-level features (temporary tables, <code>SET</code>, advisory locks, session-level prepared statements) assume the same backend between statements.', 'Use <code>SET LOCAL</code> inside transactions, avoid session state, or use session pooling for those clients.')
      ],
      invariant: 'The number of backends never exceeds max_connections, and each one is a separate process.',
      src: 'postgresql.conf.sample and the 17 manual (<code>max_connections</code>, <code>superuser_reserved_connections</code>), <code>src/backend/postmaster/postmaster.c</code> (fork per connection).'
    },
    {
      title: 'A prepared statement switches to a generic plan', short: 'plan cache', kind: 'plancache',
      intro: 'A prepared statement is planned with the real value five times, then the server may keep one plan for any value. See the switch, and when it hurts.',
      trigger: 'The app runs <code>PREPARE by_customer (int) AS SELECT * FROM orders WHERE customer_id = $1</code> and executes it for different customers. Customer 1 owns 2 million orders; most customers own a dozen (example data).',
      run: "PREPARE by_customer (int) AS SELECT * FROM orders WHERE customer_id = $1;\nEXECUTE by_customer(7);\nSHOW plan_cache_mode;   -- auto",
      expect: 'Executions 1 to 5 use a custom plan. From the 6th, the server uses a generic plan if it is not costlier than the average custom plan.',
      steps: [
        S('Prepare', '<code>PREPARE</code> parses and analyzes the statement once. No plan exists yet, because the value of <code>$1</code> is unknown.', { n: 0 }, 'executions: 0 · plan: none'),
        S('Executions 1 to 5: custom plans', 'Each execution plans with the actual value. The planner sees the real value, so it can use statistics for that value. Planning costs a little time each run.', { n: 5, mode: 'custom' }, 'executions: 5 · custom plans: 5'),
        S('Execution 6: compare', 'The server builds a generic plan (value unknown, average selectivity) and compares its estimated cost with the average of the custom plans. If the generic plan is not worse, it is kept.', { n: 6, mode: 'compare' }, 'comparing generic with average custom cost'),
        S('Generic plan wins', 'From now on every execution reuses the same plan and skips planning. <code>EXPLAIN EXECUTE</code> shows <code>$1</code> in the filter instead of a literal.', { n: 8, mode: 'generic' }, 'executions: 8 · generic plan in use'),
        S('A skewed value', 'For customer 1 (2 million rows) the generic plan still uses an index scan, which is right for a dozen rows and very slow for 2 million. The plan was chosen for the average customer.', { n: 9, mode: 'generic', skew: true }, 'customer 1: index scan over 2M rows'),
        S('Force custom plans', '<code>SET plan_cache_mode = force_custom_plan</code> for this statement or session makes every execution plan with its value, at the price of planning each time.', { n: 10, mode: 'custom', skew: false, fixed: true }, 'plan_cache_mode = force_custom_plan')
      ],
      edges: [
        E('A schema change invalidates the plan', 'DDL on a table used by the plan sends an invalidation, and the next execute re-plans from the stored parse tree.', 'Expect a one-time replan after a migration; if the statement no longer analyzes, it fails then (use case 1).'),
        E('A pooler hides the preparation', 'In transaction pooling each transaction may land on a different backend, which has not prepared the statement or has an older plan.', 'Use a pooler that tracks protocol-level prepared statements, or turn server-side preparation off in the driver.')
      ],
      invariant: 'A prepared statement is planned with real values for its first 5 executions, and a generic plan is used only if its estimated cost is not above the custom average.',
      src: '17 manual: <code>PREPARE</code>, <code>plan_cache_mode</code>; <code>src/backend/utils/cache/plancache.c</code> (<code>choose_custom_plan</code>, 5 custom plans before a generic one).'
    }
  ];

  CourseData.uc.heap = [
    {
      title: 'A slotted page: line pointers and the ctid', short: 'slotted page', kind: 'page',
      intro: 'Rows are placed in an 8 kB page by two arrays growing towards each other. See why a row keeps its address when other rows move.',
      trigger: 'An <code>orders</code> page receives three 150-byte rows, then one is deleted and the page is cleaned (row size is an example).',
      run: "SELECT ctid, id FROM orders ORDER BY ctid LIMIT 3;   -- (0,1) (0,2) (0,3)\nSELECT * FROM heap_page_items(get_raw_page('orders', 0));  -- needs pageinspect",
      expect: 'The row stays at the same ctid (block 0, line pointer number) while the space behind it is reorganized.',
      steps: [
        S('An empty page', 'An 8,192-byte page starts with a 24-byte header. Everything else is free space. Line pointers will grow from the front and rows from the back.', { rows: [] }, 'header 24 B · free 8,168 B'),
        S('First insert', 'The row (about 150 bytes with its header) is written at the end of the page. A 4-byte line pointer at the front records where it starts. Its address is ctid <code>(0,1)</code>: block 0, pointer 1.', { rows: [['normal', 'live']] }, 'rows: 1 · free 8,014 B'),
        S('Two more inserts', 'Pointers 2 and 3 are added at the front, rows at the back. The line pointer array grows downward and the rows grow upward, so no row ever has to move on insert.', { rows: [['normal', 'live'], ['normal', 'live'], ['normal', 'live']] }, 'rows: 3 · free 7,706 B'),
        S('Delete row 2', 'A delete does not remove the bytes. It stamps the row version with the deleting transaction id. The space is still taken, and other transactions may still need to see the row.', { rows: [['normal', 'live'], ['normal', 'dead'], ['normal', 'live']] }, 'row 2 dead · free 7,706 B'),
        S('Prune or VACUUM', 'When no snapshot can see it, the dead row is removed and the rows after it slide together. Pointer 2 becomes unused, and rows 1 and 3 keep their pointers, so their ctid does not change. Indexes stay valid.', { rows: [['normal', 'live'], ['unused', null], ['normal', 'live']] }, 'free 7,856 B · ctids unchanged'),
        S('The slot is reused', 'The next insert takes the unused pointer 2 and the freed space. A table never shrinks just because rows were deleted: its pages are refilled.', { rows: [['normal', 'live'], ['normal', 'live'], ['normal', 'live']] }, 'rows: 3 · pointer 2 reused')
      ],
      edges: [
        E('A row larger than a page', 'A row cannot span pages. Long values are compressed or moved out of line to TOAST first (use case 3).', 'Keep wide columns in TOAST-able types and avoid more than a few hundred narrow columns in one table.'),
        E('Unused space inside pages', 'Space freed by a delete or update is reusable only after prune or VACUUM, and only by rows that fit.', 'Watch table size against live data; set <code>fillfactor</code> below 100 on update-heavy tables to leave room for same-page updates (use case 6).')
      ],
      invariant: 'A row version is addressed by (block, line pointer); moving its bytes inside the page never changes its ctid.',
      src: '<code>src/include/storage/bufpage.h</code> (24-byte header, 4-byte <code>ItemIdData</code>), <code>src/include/access/htup_details.h</code> (23-byte tuple header), <code>pageinspect</code> docs. Row size 150 B is an example.'
    },
    {
      title: 'The buffer pool and the clock sweep', short: 'clock sweep', kind: 'clock',
      intro: 'Shared buffers hold copies of 8 kB pages. When the pool is full, a clock hand decides which page to drop. See how often-used pages survive.',
      trigger: 'A tiny 8-buffer pool is full and a query needs page <b>X</b>, which is not cached (the real default is 128 MB, 16,384 buffers).',
      run: "SHOW shared_buffers;   -- 128MB by default\nSELECT usagecount, count(*) FROM pg_buffercache GROUP BY 1 ORDER BY 1;   -- needs pg_buffercache",
      expect: 'The hand lowers usage counts as it passes, and evicts the first unpinned buffer whose count reaches 0.',
      steps: [
        S('Full pool, a miss', 'Every buffer holds a page. Each has a usage count from 0 to 5, raised by one on every access. The clock hand sits at buffer 0. Page X is not in the pool.', { bufs: [['A', 3], ['B', 1], ['C', 0, 1], ['D', 2], ['E', 5], ['F', 1], ['G', 2], ['H', 0]], hand: 0, x: 'miss' }, 'miss on X · hand at 0'),
        S('The hand passes buffer 0', 'Buffer A has usage 3. It is not a victim, so the hand lowers it to 2 and moves on. Recently used pages get several passes of protection.', { bufs: [['A', 2], ['B', 1], ['C', 0, 1], ['D', 2], ['E', 5], ['F', 1], ['G', 2], ['H', 0]], hand: 1, x: 'miss' }, 'A: 3 to 2'),
        S('The hand passes buffer 1', 'Buffer B has usage 1. It drops to 0 and the hand moves on. B is now a candidate for the next pass.', { bufs: [['A', 2], ['B', 0], ['C', 0, 1], ['D', 2], ['E', 5], ['F', 1], ['G', 2], ['H', 0]], hand: 2, x: 'miss' }, 'B: 1 to 0'),
        S('Buffer 2 is pinned', 'Buffer C has usage 0 but is pinned: another backend is using it right now. A pinned buffer is never evicted, so the hand skips it.', { bufs: [['A', 2], ['B', 0], ['C', 0, 1], ['D', 2], ['E', 5], ['F', 1], ['G', 2], ['H', 0]], hand: 2, x: 'miss', pinned: 2 }, 'C pinned · skipped'),
        S('Victim found', 'The hand reaches buffer 3 and keeps going: D has usage 2 and drops to 1, E has 5 and drops to 4, F drops to 0, G drops to 1, H has usage 0 and is not pinned. H is the victim.', { bufs: [['A', 2], ['B', 0], ['C', 0, 1], ['D', 1], ['E', 4], ['F', 0], ['G', 1], ['H', 0]], hand: 7, x: 'miss', victim: 7 }, 'victim: H'),
        S('X is loaded', 'If H were dirty, its WAL would be flushed and the page written first. H is clean, so X simply overwrites it with usage 1. E, used many times, will survive several more passes.', { bufs: [['A', 2], ['B', 0], ['C', 0, 1], ['D', 1], ['E', 4], ['F', 0], ['G', 1], ['X', 1]], hand: 0, x: 'loaded' }, 'X in buffer 7 · usage 1')
      ],
      edges: [
        E('A big sequential scan', 'A scan of a table larger than a quarter of <code>shared_buffers</code> would push out every useful page.', 'The scan uses a small ring of 256 kB (32 pages) and recycles its own buffers, so the main cache keeps its hot pages.'),
        E('Double caching', 'The operating system also caches the same files, so a page may be in both.', 'Keep <code>shared_buffers</code> a moderate part of RAM (a common starting point is about a quarter) and let the OS cache hold the rest.')
      ],
      invariant: 'A buffer is evicted only when its usage count is 0 and nobody has it pinned; every pass of the hand lowers the count by one.',
      src: '<code>src/backend/storage/buffer/freelist.c</code> (<code>StrategyGetBuffer</code>, clock sweep), <code>buf_internals.h</code> (<code>BM_MAX_USAGE_COUNT</code> = 5), <code>README</code> in the same directory (ring buffers for large scans).'
    },
    {
      title: 'TOAST: values too large for a row', short: 'TOAST', kind: 'toast',
      intro: 'A row has to fit in one page, so large values are compressed and then moved to a side table. See when that happens and what it costs.',
      trigger: 'The <code>orders</code> table gains a <code>notes text</code> column. Some values are 500 bytes, some 3 kB of JSON, and some 40 kB of text that does not compress (example sizes).',
      run: "SELECT reltoastrelid::regclass FROM pg_class WHERE relname = 'orders';\nSELECT pg_column_size(notes), octet_length(notes) FROM orders LIMIT 5;",
      expect: 'Small values stay inline. Large ones are compressed, and when that is not enough they move to a TOAST table, leaving a pointer of about 18 bytes in the row.',
      steps: [
        S('A small value', 'A 500-byte note makes a row of about 650 bytes, well below the threshold of about 2 kB. It is stored inline, as is.', { row: 650, stage: 'inline' }, 'row in heap: 650 B · inline'),
        S('A 3 kB value: compress first', 'The row would be about 3.2 kB, over the threshold. The server first tries compression (pglz by default, lz4 if chosen). JSON-like text shrinks to about 1.1 kB, so the row fits inline again.', { row: 1250, stage: 'compressed' }, 'row in heap: 1,250 B · compressed inline'),
        S('A 40 kB value: out of line', 'Text that does not compress is cut into chunks of about 2 kB and stored as rows in the table\'s TOAST table. The heap row keeps a pointer of about 18 bytes.', { row: 170, stage: 'toasted', chunks: 20 }, 'row in heap: 170 B · 20 chunks'),
        S('SELECT id does not read the chunks', 'A query that does not return the large column never fetches the chunks. The heap row is short, so many rows fit on a page and scans stay fast.', { row: 170, stage: 'toasted', chunks: 20, read: 'none' }, 'chunks read: 0'),
        S('SELECT * reads them all', 'Returning the column fetches the chunks through the TOAST index and stitches them back together: 20 extra page lookups for this one value.', { row: 170, stage: 'toasted', chunks: 20, read: 'all' }, 'chunks read: 20'),
        S('An update to another column', 'Changing <code>status</code> writes a new row version, but copies only the 18-byte pointer. The unchanged 40 kB value is not rewritten, so the update stays cheap.', { row: 170, stage: 'toasted', chunks: 20, read: 'none', update: true }, 'chunks rewritten: 0')
      ],
      edges: [
        E('SELECT * on a wide table', 'Each row needs its TOAST chunks, and the result set is large.', 'Select only the columns you need. Move rarely read large values to a table of their own if they are always needed together.'),
        E('The value is already compressed', 'Images, ZIP files and encrypted data do not shrink, so compression only costs CPU.', 'Set <code>ALTER TABLE ... ALTER COLUMN ... SET STORAGE EXTERNAL</code> for such columns to skip compression.')
      ],
      invariant: 'A heap row always fits in one page: large values are compressed or replaced by a pointer to chunks in the TOAST table.',
      src: '<code>src/include/access/heaptoast.h</code> (<code>TOAST_TUPLE_THRESHOLD</code> about 2 kB, chunk size about 2 kB), 17 manual: TOAST, <code>default_toast_compression</code>. Sizes are examples.'
    }
  ];

  CourseData.uc.index = [
    {
      title: 'Insert, page split and lookup in a B+tree', short: 'B+tree', animation: {
        kind: 'btree', cap: 3, base: [10, 20, 30, 40, 50, 60, 70], try: 35,
        presets: [
          { label: 'Insert 35 and 38: a leaf splits', ops: [{ op: 'insert', key: 35 }, { op: 'insert', key: 38 }] },
          { label: 'Insert 75, 80, 85: the root splits', ops: [{ op: 'insert', key: 75 }, { op: 'insert', key: 80 }, { op: 'insert', key: 85 }] },
          { label: 'Look up 40', ops: [{ op: 'search', key: 40 }] },
          { label: 'Range 20 to 60', ops: [{ op: 'range', from: 20, to: 60 }] }
        ]
      },
      intro: 'Press the scenario buttons, or type your own key. Watch the path from the root to a leaf, the moment a full page splits, how a separator moves up, and why a range scan follows the right-sibling links.',
      trigger: 'Checkout looks up <code>WHERE id = 40</code> on a 200-million row table, and the loader keeps inserting new ids into the same index. Here a page holds 3 keys; a real 8 kB page holds hundreds.',
      run: "CREATE INDEX orders_id_idx ON orders (id);\nSELECT * FROM bt_metap('orders_id_idx');   -- level = tree height, needs pageinspect\nEXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE id = 40;",
      expect: 'A lookup reads one index page per level, then one heap page. Inserts split the full leaf, push a separator up, and grow the tree by one level only when the root itself splits.',
      edges: [
        E('Keys that always increase', 'A sequence-like key sends every insert to the rightmost leaf, so the rightmost page splits again and again and the left pages stay full (that is fine) while the right edge is a point of contention.', 'This is the normal, efficient pattern for ids. Random keys (UUID v4) touch every leaf, cause more cache misses and more full-page images in the WAL.'),
        E('Deleted keys do not merge pages', 'PostgreSQL does not merge half-empty pages on delete. Empty pages are recycled by VACUUM, and sparse pages stay.', 'If an index is much larger than its live keys suggest, rebuild it with <code>REINDEX INDEX CONCURRENTLY</code>.')
      ],
      invariant: 'All leaves are at the same depth, every page stays within capacity, and the tree grows only at the root.',
      src: '<code>src/backend/access/nbtree/README</code> (Lehman-Yao B-tree with right-links), <code>nbtinsert.c</code> (page split), 17 manual: B-Tree Indexes (fillfactor 90 for leaves). The animation is a simplified model: split points and capacity are illustrative.'
    },
    {
      title: 'Column order in a multi-column index', short: 'index prefix', kind: 'prefix',
      intro: 'An index on two columns is sorted by the first column, then by the second inside each first value. See which queries can use it.',
      trigger: 'The team creates <code>CREATE INDEX ON orders (customer_id, created_at)</code> and then writes five different queries (example workload).',
      run: "CREATE INDEX orders_cust_created_idx ON orders (customer_id, created_at);\nEXPLAIN SELECT * FROM orders WHERE created_at > now() - interval '1 day';",
      expect: 'Queries that fix the leading column (or ask for its order) use the index well. A query on the second column alone cannot seek into it.',
      steps: [
        S('The index is sorted by the leading column', 'Entries are ordered by <code>customer_id</code>, and inside each customer by <code>created_at</code>. Everything for one customer sits together in a short run of leaf pages.', { upto: 0 }, 'order: (customer_id, created_at)'),
        S('Equality on the leading column', '<code>WHERE customer_id = 7</code> descends to the first entry for customer 7 and reads that run. Good.', { upto: 1 }, 'usable: seek on customer_id'),
        S('Equality, then a range', '<code>WHERE customer_id = 7 AND created_at &gt; ...</code> seeks to customer 7, and from there to the start of the time range inside it. Best case: both columns narrow the scan.', { upto: 2 }, 'usable: seek on both columns'),
        S('Order for free', '<code>WHERE customer_id = 7 ORDER BY created_at DESC LIMIT 20</code> reads the end of customer 7\'s run backwards and stops after 20 entries. No sort node.', { upto: 3 }, 'usable: ordered, stops early'),
        S('Only the second column', '<code>WHERE created_at &gt; ...</code> has no leading column to seek on. The entries for the range are scattered across all customers. In 17 there is no skip scan, so the planner usually scans the table or the whole index.', { upto: 4 }, 'not usable for a seek (17)'),
        S('The fix', 'If that query matters, add an index on <code>(created_at)</code> or reverse the column order if the other queries allow it. Skip scan arrives only in PostgreSQL 18.', { upto: 5 }, 'choose the order from the queries')
      ],
      edges: [
        E('Low-selectivity leading column', 'A leading column with 3 distinct values makes the first level of the index almost useless for narrowing.', 'Put the column your queries filter by equality first and the range or ordering column after it.'),
        E('Extra indexes cost writes', 'Every index is updated on each insert, and on each update that changes its columns or is not HOT.', 'Drop indexes that <code>pg_stat_user_indexes.idx_scan</code> shows are never used.')
      ],
      invariant: 'A B-tree index can seek only on a leading prefix of its columns, in order.',
      src: '17 manual: Multicolumn Indexes, Indexes and ORDER BY. Skip scan for B-tree is a PostgreSQL 18 feature, so it is described as absent in 17.'
    },
    {
      title: 'HOT updates leave the indexes alone', short: 'HOT update', kind: 'hot',
      intro: 'An update writes a new row version. If no indexed column changed and the page has room, the new version stays on the same page and no index entry is added.',
      trigger: 'The order status moves from <code>new</code> to <code>shipped</code> 3,000 times a second. <code>orders</code> is indexed on <code>id</code> and <code>customer_id</code>, but not on <code>status</code>.',
      run: "UPDATE orders SET status = 'shipped' WHERE id = 42;\nSELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'orders';",
      expect: 'The update is HOT: both indexes still point at the old pointer, and a chain inside the page leads to the new version.',
      steps: [
        S('Before the update', 'Pointer 1 holds the only version of order 42. Each of the two indexes has one entry, and both point at pointer 1.', { lps: [['v1', 'live']], pk: [1], cu: [1], note: 'one version, one index entry' }, 'versions: 1 · index entries: 2'),
        S('A HOT update', 'Status is not indexed and page 0 has free space. The new version is written to pointer 2 on the same page, marked heap-only, and linked from the old one. No index entry is added.', { lps: [['v1', 'old'], ['v2', 'live']], pk: [1], cu: [1], chain: true, note: 'same page, no new index entry' }, 'versions: 2 · index entries: 2'),
        S('A lookup follows the chain', 'The index leads to pointer 1. The scan sees the old version is dead for this snapshot and follows the chain to pointer 2, still on the same page, with no extra I/O.', { lps: [['v1', 'old'], ['v2', 'live']], pk: [1], cu: [1], chain: true, follow: true, note: 'pointer 1 then pointer 2' }, 'extra page reads: 0'),
        S('Pruning shortens the chain', 'Later, any access to the page can prune: the old row\'s bytes are freed and pointer 1 becomes a redirect to pointer 2. The index entry is unchanged and still valid.', { lps: [['redirect', 'redirect'], ['v2', 'live']], pk: [1], cu: [1], chain: true, note: 'pointer 1 redirects to 2' }, 'old version freed, redirect kept'),
        S('If status were indexed', 'Now suppose <code>status</code> is in an index. The change touches an indexed column, so the update is not HOT: a new entry is inserted in every index of the table, including the unchanged ones.', { lps: [['v1', 'old'], ['v2', 'live']], pk: [1, 2], cu: [1, 2], status: [1, 2], note: 'every index gets a new entry' }, 'new index entries: 3'),
        S('If the page is full', 'Even with no indexed column changed, a full page forces the new version onto another page, so every index gets an entry again. A <code>fillfactor</code> below 100 leaves room for HOT.', { lps: [['v1', 'old'], ['v2', 'live']], pk: [1, 2], cu: [1, 2], other: true, note: 'new version on page 1' }, 'new index entries: 2')
      ],
      edges: [
        E('Indexing a hot column', 'An index on a column that changes every few seconds turns each update into a non-HOT update and grows every index.', 'Index stable columns. Consider a partial index (<code>WHERE status = \'new\'</code>) if only a small part of the rows matters.'),
        E('A long transaction blocks pruning', 'Old versions cannot be pruned while a snapshot may still see them, so chains grow and the page fills.', 'Keep transactions short (the VACUUM feature shows how one old snapshot holds cleanup back), and set <code>fillfactor</code> to 90 or so on update-heavy tables.')
      ],
      invariant: 'A HOT update adds no index entry; indexes always reach the right version through the chain that starts at the old pointer.',
      src: '<code>src/backend/access/heap/README.HOT</code>, <code>pruneheap.c</code>, 17 manual: <code>pg_stat_user_tables.n_tup_hot_upd</code>, storage parameter <code>fillfactor</code>.'
    }
  ];
})();
