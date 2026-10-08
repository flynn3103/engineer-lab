/* PostgreSQL problem-based course data. Source: 01-postgres-internals-end-to-end.html (CHAPTERS). */
window.COURSE = {
  name: 'PostgreSQL',
  kick: '12 chapters · problem-based · PostgreSQL 16 and 17',
  lead: `An orders database serves checkout and finance reports at the same time, and every slow query, lock wait or failed failover shows up on the same few tables. Each chapter starts with a production incident, asks you to predict what PostgreSQL does, then shows the mechanism that decides it. The mechanisms are the same ones behind parsing, caching, cleanup, planning and replication.`,
  chapters: [
{
  title: 'SQL, Parser and Catalog',
  problem: `A deploy at 14:05 renames <code>orders.customer_id</code> to <code>orders.user_id</code> (illustrative). New app servers work, but old servers still draining traffic fail at once with <code>column "customer_id" does not exist</code>, while servers that hold a prepared statement fail later with a different error. CPU and disk graphs stay flat the whole time, so the on-call engineer sees errors without any load.`,
  predict: { q: `<code>SELECT t.nope FROM orders t</code> hits a table with 2 million pages (illustrative). How many data pages does PostgreSQL read before it reports the error?`,
    opts: [`About half of them, until it finds a row that lacks the column`, `Exactly one, the first page of the heap`, `Zero: the error is raised before execution starts`, `All of them, because the error is only detected at the end of the scan`], ans: 2,
    why: `Column names are bound during parse analysis against <code>pg_attribute</code>. The executor never starts, so no heap page is touched. That is also why the CPU and disk graphs stayed flat.` },
  explain: `
<h3>The idea</h3>
<p>Every query goes through a fixed pipeline before any row is read. The cheap steps come first. Parsing checks the grammar. Analysis checks every name against the system catalogs. Only after both succeed does the planner choose a plan and the executor read data pages. A wrong name therefore fails in the analyzer, at the cost of a few catalog lookups, and never reaches a table scan.</p>
<h3>How it works, step by step</h3>
<p>The <b>parser</b> turns the SQL text into a raw parse tree. It checks grammar only, so a typo such as <code>SELEC</code> fails with SQLSTATE <code>42601</code>. It never looks at a table.</p>
<p>The <b>analyzer</b> binds every table and column name through the catalogs (<code>pg_class</code>, <code>pg_attribute</code>, <code>pg_namespace</code>). Unqualified names are looked up through <code>search_path</code>. An unknown table gives <code>42P01</code>, and an unknown column gives <code>42703</code>.</p>
<p>The <b>rewriter</b> expands views and rules into the query tree. The <b>planner</b> picks the cheapest plan. The <b>executor</b> is the first component that reads data pages.</p>
<p>Prepared statements add one step. <code>PREPARE</code> stores the analyzed query. On every <code>EXECUTE</code> PostgreSQL checks that the objects it depends on have not changed, and it re-analyzes if they did. If the result row type changed, it raises <code>cached plan must not change result type</code>.</p>
<h3>The trade-off</h3>
<p>Early checks make bad queries cheap to reject, but they tie each query to a fixed row shape. A renamed or added column can break old clients that still send old SQL, or that hold a prepared statement. Name columns explicitly, and change schemas in expand and contract steps, so old and new code both work during a deploy.</p>`,
  diagnose: [
    { t: `Cached plan must not change result type after an ALTER`, sym: `<b>Symptom:</b> after a migration, app servers that hold prepared statements throw <code>cached plan must not change result type</code> until they reconnect.`,
      ctx: `A service prepares <code>SELECT * FROM orders WHERE id = $1</code> once per connection (illustrative: 200 pooled connections). A migration then runs <code>ALTER TABLE orders ADD COLUMN coupon text</code>.`,
      why: `The prepared statement stored a result row type of N columns. After the ALTER, PostgreSQL re-analyzes the statement on EXECUTE and finds N+1 columns. It cannot change the row shape the client already described, so it raises SQLSTATE <code>0A000</code>.`,
      log: `-- representative output, values illustrative\nERROR:  cached plan must not change result type\nSTATEMENT:  SELECT * FROM orders WHERE id = $1\n-- SQLSTATE 0A000 (feature_not_supported)\n-- pages read by this statement: 0`,
      note: `The error comes from the plan cache revalidation, before execution. Wording is stable across 16 and 17. Source: PREPARE (postgresql.org/docs/current/sql-prepare.html).`,
      fix: [`Measure first: grep the logs for <code>cached plan must not change result type</code> and note which statements and which connections repeat it.`, `Fix: replace <code>SELECT *</code> and <code>RETURNING *</code> in prepared statements with explicit column lists, so additive migrations do not change the result type.`, `Fix: ship column changes as expand then contract: add the new column, deploy code that tolerates both, and only then drop or rename the old one.`, `Fix: for a one-off, reconnect or run <code>DEALLOCATE ALL</code> on affected pooled connections.`, `Verify: after the next additive migration, the error count stays at zero while connections stay open.`] },
    { t: `search_path resolves to the wrong schema's table`, sym: `<b>Symptom:</b> a report reads empty or stale rows, while <code>psql</code> as another user shows the right data. Nothing errors.`,
      ctx: `A schema <code>app</code> holds the live <code>orders</code>. A leftover <code>public.orders</code> from an old import still exists (illustrative). The reporting role has the default <code>search_path</code> of <code>"$user", public</code>.`,
      why: `An unqualified name is looked up in each schema of <code>search_path</code> in order, and the first match wins during analysis. The role finds <code>public.orders</code> first, never reaches <code>app.orders</code>, and PostgreSQL has no reason to warn.`,
      log: `-- representative output, values illustrative\napp=> SHOW search_path;\n   search_path\n-----------------\n "$user", public\n\napp=> SELECT to_regclass('orders');\n to_regclass\n-------------\n public.orders`,
      note: `to_regclass shows which relation an unqualified name binds to for this session. Source: Schemas (postgresql.org/docs/current/ddl-schemas.html).`,
      fix: [`Measure first: run <code>SELECT to_regclass('orders')</code> and <code>SHOW search_path</code> in the same role and session as the failing query.`, `Fix: schema-qualify names in application SQL, for example <code>app.orders</code>.`, `Fix: set the path once per role with <code>ALTER ROLE reporting SET search_path = app, public</code>.`, `Fix: drop or rename the stale <code>public.orders</code> after checking nothing uses it.`, `Verify: <code>to_regclass('orders')</code> returns <code>app.orders</code> for every application role.`] },
    { t: `Quoted mixed-case identifier: column "userid" does not exist`, sym: `<b>Symptom:</b> an ORM-generated migration works, but hand-written SQL fails with <code>column "userid" does not exist</code> although the column is visibly there.`,
      ctx: `The ORM created <code>"userId"</code> with quotes (illustrative). An analyst writes <code>SELECT userId FROM orders</code> without quotes.`,
      why: `Unquoted identifiers are folded to lower case, so <code>userId</code> becomes <code>userid</code>. The catalog stores <code>userId</code>, because creation was quoted. The analyzer compares exactly and finds no match.`,
      log: `-- representative output, values illustrative\nERROR:  column "userid" does not exist\nLINE 1: SELECT userId FROM orders;\n               ^\nHINT:  Perhaps you meant to reference the column "orders.userId".`,
      note: `The HINT is the analyzer's near-miss suggestion. The caret is the cursor position carried by analysis errors. Source: Identifiers and key words (postgresql.org/docs/current/sql-syntax-lexical.html).`,
      fix: [`Measure first: list real names with <code>SELECT attname FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attnum &gt; 0</code>.`, `Fix: quote the name exactly, <code>"userId"</code>, as a short-term unblock.`, `Fix: rename to lower-case snake case, <code>ALTER TABLE orders RENAME COLUMN "userId" TO user_id</code>, using the expand then contract path from the first scenario.`, `Fix: configure the ORM naming strategy to emit lower-case unquoted names.`, `Verify: new tables created by the ORM contain no upper-case attribute names.`] }
  ],
  source: { label: 'Original: SQL, Parser and Catalog', href: '01-postgres-internals-end-to-end.html#ch0' },
  scenarios: [
    { id: 'unknown-col', label: 'Unknown column', desc: 'A query names a column that does not exist. The analyzer rejects it, and no data page is read.', codeLabel: 'Query',
      code: { bug: [`-- old app server, plain SQL (illustrative)`, `SELECT t.nope FROM orders t;`, `-- analyzer: find "orders", then "nope" in pg_attribute`, `ERROR 42703: column t.nope does not exist`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'sql', x: 10, y: 20, w: 130, h: 56, t: 'Client SQL', s: 'text sent' },
        { id: 'parse', x: 170, y: 20, w: 130, h: 56, t: 'Parser', s: 'grammar only' },
        { id: 'analyze', x: 330, y: 20, w: 130, h: 56, t: 'Analyzer', s: 'binds names' },
        { id: 'rewrite', x: 490, y: 20, w: 130, h: 56, t: 'Rewriter', s: 'views, rules' },
        { id: 'cat', x: 170, y: 120, w: 150, h: 50, t: 'Catalog', s: 'pg_attribute' },
        { id: 'plan', x: 490, y: 200, w: 130, h: 56, t: 'Planner', s: 'cheapest plan' },
        { id: 'exec', x: 330, y: 200, w: 130, h: 56, t: 'Executor', s: 'reads pages' },
        { id: 'res', x: 170, y: 200, w: 150, h: 56, t: 'Result or error', s: 'rows or SQLSTATE' }],
        edges: [ { id: 'e1', a: 'sql', b: 'parse', label: 'text' }, { id: 'e2', a: 'parse', b: 'analyze', label: 'raw tree' }, { id: 'e3', a: 'analyze', b: 'rewrite', label: 'names bound' }, { id: 'e4', a: 'analyze', b: 'cat', label: 'lookup' }, { id: 'e5', a: 'rewrite', b: 'plan', label: 'query tree' }, { id: 'e6', a: 'plan', b: 'exec', label: 'plan tree' }, { id: 'e7', a: 'exec', b: 'res', label: 'rows' }, { id: 'e8', a: 'analyze', b: 'res', label: 'error' }] },
      bug: [
        { log: 'The client sends SELECT t.nope FROM orders t. The server has checked nothing yet.', code: 1, hl: { nodes: { sql: 'on' } }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }] },
        { log: 'The parser accepts it. The grammar is valid, and the parser never looks at a table.', code: 1, hl: { nodes: { parse: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'catalog lookups', v: '0', cls: 'ok' }] },
        { log: 'The analyzer finds orders, then asks pg_attribute for a column named nope. There is none (illustrative count below).', code: 2, hl: { nodes: { analyze: 'on', cat: 'warn', rewrite: 'dim', plan: 'dim', exec: 'dim' }, edges: { e2: 'on', e4: 'on' } }, stats: [{ l: 'catalog lookups', v: '2', cls: 'warn' }] },
        { log: 'ERROR 42703: column t.nope does not exist. The rewriter, planner and executor never run.', code: 3, hl: { nodes: { res: 'bad', rewrite: 'dim', plan: 'dim', exec: 'dim' }, edges: { e8: 'bad' } }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }, { l: 'SQLSTATE', v: '42703', cls: 'bad' }] }
      ] },
    { id: 'prepared', label: 'Prepared plan after ALTER', desc: 'A prepared statement keeps the row shape it was analyzed with. After a column is added, EXECUTE fails until the connection re-prepares.', codeLabel: 'SQL',
      code: { bug: [`-- app server, once per pooled connection (illustrative)`, `PREPARE q AS SELECT * FROM orders WHERE id = $1;`, `-- migration runs later`, `ALTER TABLE orders ADD COLUMN coupon text;`, `-- next request on an old connection`, `EXECUTE q(42);`, `ERROR:  cached plan must not change result type`],
        fix: [`-- app server, once per pooled connection (illustrative)`, `PREPARE q AS SELECT id, status, amount FROM orders WHERE id = $1;`, `-- migration runs later`, `ALTER TABLE orders ADD COLUMN coupon text;`, `-- next request on the same connection`, `EXECUTE q(42);`, `-- result type unchanged, so the cached plan stays valid`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'app', x: 10, y: 105, w: 150, h: 80, t: 'App server (old)', s: '5 columns prepared' },
        { id: 'cache', x: 230, y: 105, w: 150, h: 80, t: 'Plan cache', s: 'stored result shape' },
        { id: 'cat', x: 450, y: 25, w: 150, h: 70, t: 'Catalog', s: 'orders: 6 columns' },
        { id: 'out', x: 450, y: 195, w: 150, h: 70, t: 'Result', s: 'rows or 0A000' }],
        edges: [ { id: 'e1', a: 'app', b: 'cache', label: 'EXECUTE' }, { id: 'e2', a: 'cache', b: 'cat', label: 'revalidate' }, { id: 'e3', a: 'cache', b: 'out', label: 'shape differs' }] },
      bug: [
        { log: 'An app server prepared the query when the table had 5 columns. The prepared statement keeps that row shape.', code: 1, hl: { nodes: { app: 'on' } }, stats: [{ l: 'columns in prepared result', v: '5', cls: 'warn' }] },
        { log: 'The migration adds coupon. The table now has 6 columns, but the old connection still holds the old statement.', code: 3, hl: { nodes: { cat: 'warn' } }, stats: [{ l: 'columns in table', v: '6', cls: 'warn' }] },
        { log: 'The next request calls EXECUTE on the old connection. The plan cache revalidates the stored statement against the catalog.', code: 5, hl: { nodes: { app: 'on', cache: 'on', cat: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }] },
        { log: 'The new row shape differs from the one the client described, so PostgreSQL refuses before execution with SQLSTATE 0A000.', code: 6, hl: { nodes: { cache: 'bad', out: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'SQLSTATE', v: '0A000', cls: 'bad' }, { l: 'data pages read', v: '0', cls: 'ok' }] }
      ],
      fix: [
        { log: 'The statement lists its columns. The row shape is now fixed by the query text, not by the table definition.', code: 1, hl: { nodes: { app: 'ok' } }, stats: [{ l: 'columns in prepared result', v: '3', cls: 'ok' }] },
        { log: 'The migration adds coupon. The table has a new column, but the prepared result does not include it.', code: 3, hl: { nodes: { cat: 'ok' } }, stats: [{ l: 'columns in table', v: '6', cls: 'ok' }] },
        { log: 'EXECUTE on the same connection. Revalidation still runs, but the result shape still matches.', code: 5, hl: { nodes: { app: 'ok', cache: 'ok' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'errors', v: '0', cls: 'ok' }] },
        { log: 'The request returns rows, and the migration causes no error on any connection.', code: 6, hl: { nodes: { out: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'errors', v: '0', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Heap Pages and the Buffer Pool',
  problem: `The same orders lookup takes 2 ms in the morning and 300 ms after a nightly batch (illustrative). Nothing in the query changed. On a 16 GB host with <code>shared_buffers = 4GB</code> (illustrative), checkout latency stays high all day, and <code>shared read</code> climbs in <code>EXPLAIN (ANALYZE, BUFFERS)</code> for a query that used to show only hits.`,
  predict: { q: `A large sequential scan on a table bigger than a quarter of <code>shared_buffers</code> runs. How much of the shared buffer pool can it fill?`,
    opts: [`All of it: every page it reads is cached`, `A small ring of buffers that it reuses, not the whole pool`, `None: sequential scans bypass shared_buffers and use only the OS cache`, `Half of it, a fixed share`], ans: 1,
    why: `Large sequential scans, VACUUM and bulk writes use a small ring buffer strategy (256 kB for a sequential scan), so they recycle their own pages instead of evicting the hot set. A scan that is not big enough, or a different access path, can still pollute the pool.` },
  explain: `
<h3>The idea</h3>
<p>Disk is thousands of times slower than memory, so what stays cached decides latency. PostgreSQL stores tables as fixed 8 kB pages and keeps a pool of page slots in shared memory. Hot pages stay in the pool. A one-off scan should not push them out.</p>
<h3>How it works, step by step</h3>
<p>A table is a set of 8 kB <b>pages</b>. Each page has a header, an array of line pointers that grows down, and tuples that grow up. A row is addressed as (page, line pointer).</p>
<p>The <b>buffer pool</b> is the <code>shared_buffers</code> area. Each slot has a descriptor with a pin count and a usage count, capped at 5. When a backend needs a page, the buffer manager looks it up first. A hit costs nothing extra.</p>
<p>On a miss, the <b>clock sweep</b> moves a hand around the pool. Each pass lowers usage counts by one. It evicts the first unpinned page whose count is zero. Every hit raises the count, so hot pages survive several passes.</p>
<p>Big scans use a small private <b>ring buffer</b>, so a sequential scan recycles its own pages. Most pages also sit in the OS page cache, so a miss in <code>shared_buffers</code> is not always a disk read.</p>
<p><b>TOAST</b> handles values too wide for a page. Large values are compressed or moved to a side table in chunks, and they are read only when the column is named.</p>
<h3>The trade-off</h3>
<p>A bigger pool holds more of the hot set, but it also means more dirty pages to write at each checkpoint. When the hot set is bigger than the pool, the clock sweep keeps the best pages and misses the rest. The fix is to shrink the hot set, not to hope the sweep will cope.</p>`,
  diagnose: [
    { t: `Working set larger than shared_buffers`, sym: `<b>Symptom:</b> query time tracks disk speed; <code>EXPLAIN (ANALYZE, BUFFERS)</code> shows <code>shared read</code> far above <code>shared hit</code>.`,
      ctx: `The hot orders and indexes grow past the pool as the business grows (illustrative: 9 GB hot data, 4 GB pool). Every request now evicts something the next request needs.`,
      why: `With the hot set larger than the pool, the hit ratio collapses and every miss costs an OS-cache or disk read. The clock sweep keeps the best pages, but it cannot keep pages that do not fit.`,
      log: `-- representative output, values illustrative\n Index Scan using orders_pkey on orders (actual time=0.9..0.9 rows=1 loops=1)\n   Index Cond: (id = 42)\n   Buffers: shared hit=1 read=3\n I/O Timings: shared read=2.410\n Planning Time: 0.07 ms\n Execution Time: 3.1 ms`,
      note: `read=3 are blocks that were not in shared_buffers. The I/O Timings line appears only with track_io_timing = on. Source: Resource consumption: shared_buffers (postgresql.org/docs/current/runtime-config-resource.html).`,
      fix: [`Measure first: install <code>pg_buffercache</code> and group by relation to see what occupies the pool, and compare <code>blks_hit</code> to <code>blks_read</code> in <code>pg_stat_database</code>.`, `Fix: shrink the hot set with better indexes, partial indexes or archiving cold rows.`, `Fix: raise <code>shared_buffers</code> (a common starting point is about 25% of RAM) and leave memory for the OS cache. Trade-off: a very large pool makes checkpoints write more dirty data.`, `Verify: the hit ratio recovers and <code>shared read</code> disappears from the hot queries.`] },
    { t: `SELECT * fetches and detoasts columns you do not need`, sym: `<b>Symptom:</b> a list page that shows three fields is slow and moves a lot of data, even though the table has few rows.`,
      ctx: `The orders table has a <code>raw_payload jsonb</code> column of about 40 kB per row (illustrative). The list endpoint runs <code>SELECT * FROM orders WHERE user_id = $1 LIMIT 50</code>.`,
      why: `Large values live in the TOAST table. A query that names the column reads every chunk of it, decompresses it and sends it to the client. A query that does not name it never touches the TOAST pages.`,
      log: `app=> SELECT pg_size_pretty(pg_relation_size('orders')) AS heap,\n            pg_size_pretty(pg_total_relation_size(reltoastrelid)) AS toast\n       FROM pg_class WHERE oid = 'orders'::regclass;\n  heap  | toast\n--------+--------\n 310 MB | 9800 MB`,
      note: `A small heap with a very large TOAST relation means that wide values dominate. The planner's width estimate also shows in EXPLAIN as width=. Source: TOAST (postgresql.org/docs/current/storage-toast.html).`,
      fix: [`Measure first: compare <code>pg_relation_size</code> of the table to its TOAST relation, and run <code>EXPLAIN (ANALYZE, BUFFERS)</code> for the list query.`, `Fix: name the columns the endpoint needs instead of <code>SELECT *</code>.`, `Fix: if a wide column is rarely read, keep it in a separate table joined by key.`, `Verify: <code>Buffers</code> and <code>width</code> drop in <code>EXPLAIN</code>, and the response size shrinks.`] },
    { t: `Server fails to start: could not map anonymous shared memory`, sym: `<b>Symptom:</b> after a config change and restart, PostgreSQL does not come up and the log shows <code>FATAL: could not map anonymous shared memory</code>.`,
      ctx: `A tuning change raises <code>shared_buffers</code> to 14 GB (illustrative) and sets <code>huge_pages = on</code> on a host that reserved no huge pages. Another cause is a container memory limit smaller than the request.`,
      why: `The postmaster reserves one shared memory segment at startup, sized from shared_buffers, WAL buffers, connection slots and more. With huge_pages = on it must get huge pages or fail, and with a normal mapping it fails when the request exceeds what the OS or cgroup allows.`,
      log: `-- representative output, values illustrative\nFATAL:  could not map anonymous shared memory: Cannot allocate memory\nHINT:  This error usually means that PostgreSQL's request for a shared memory segment exceeded available memory, swap space, or huge pages. To reduce the request size (currently 15481118720 bytes), reduce PostgreSQL's shared memory usage, perhaps by reducing "shared_buffers" or "max_connections".`,
      note: `The request size in bytes is printed, which tells you what to reduce. Wording varies slightly by version. Source: Managing kernel resources (postgresql.org/docs/current/kernel-resources.html).`,
      fix: [`Measure first: read the request size in the FATAL line and compare it with host memory, the cgroup limit and <code>vm.nr_hugepages</code>.`, `Fix: reduce <code>shared_buffers</code> or <code>max_connections</code> until the request fits.`, `Fix: either reserve enough huge pages (<code>vm.nr_hugepages</code>) or set <code>huge_pages = try</code> so the server falls back.`, `Verify: the server starts, and <code>SHOW shared_buffers</code> returns the intended value.`] }
  ],
  source: { label: 'Original: Heap Pages and the Buffer Pool', href: '01-postgres-internals-end-to-end.html#ch1' },
  scenarios: [
    { id: 'hot-set', label: 'Hot set vs pool', desc: 'The hot set is bigger than shared_buffers. Each request evicts a page the next one needs, so most lookups fall through to the OS cache or disk.', codeLabel: 'Query',
      code: { bug: [`-- checkout reads one order by primary key`, `SELECT * FROM orders WHERE id = 42;`, `-- buffer manager: is page in shared_buffers?`, `-- miss: clock sweep picks a victim, OS cache or disk read`, `Buffers: shared hit=1 read=3`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'be', x: 10, y: 110, w: 130, h: 60, t: 'Backend', s: 'reads page 17' },
        { id: 'bm', x: 180, y: 110, w: 150, h: 60, t: 'Buffer manager', s: 'lookup + pin' },
        { id: 'sb', x: 370, y: 20, w: 150, h: 56, t: 'shared_buffers', s: '4 GB pool (illustr.)' },
        { id: 'clock', x: 370, y: 200, w: 150, h: 56, t: 'Clock sweep', s: 'usage count' },
        { id: 'os', x: 370, y: 110, w: 150, h: 56, t: 'OS cache + disk', s: 'slow path' }],
        edges: [ { id: 'e1', a: 'be', b: 'bm', label: 'page id' }, { id: 'e2', a: 'bm', b: 'sb', label: 'hit' }, { id: 'e3', a: 'bm', b: 'clock', label: 'miss' }, { id: 'e4', a: 'clock', b: 'os', label: 'read' }] },
      bug: [
        { log: 'The backend asks for page 17 of orders. Checkout needs one row, so it needs one page.', code: 1, hl: { nodes: { be: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'hit ratio', v: '44% (illustrative)', cls: 'bad' }] },
        { log: 'The buffer manager looks in shared_buffers. Nine GB of hot data does not fit in 4 GB, so the page is often gone.', code: 2, hl: { nodes: { bm: 'on', sb: 'warn' }, edges: { e2: 'dim' } }, stats: [{ l: 'hot set', v: '9 GB (illustrative)', cls: 'bad' }, { l: 'pool', v: '4 GB', cls: 'warn' }] },
        { log: 'On a miss the clock sweep lowers usage counts and evicts a page whose count is zero. A page another request needs can be the victim.', code: 3, hl: { nodes: { clock: 'bad', sb: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'evictions per request', v: '3 (illustrative)', cls: 'bad' }] },
        { log: 'The page is read from the OS cache or disk. The plan shows read=3, and each read adds latency.', code: 4, hl: { nodes: { os: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'shared read', v: '3 blocks', cls: 'bad' }, { l: 'latency', v: '300 ms (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The hot set is cut to 5 GB with better indexes and cold rows archived. It now fits in the pool.', code: 0, hl: { nodes: { sb: 'ok' } }, stats: [{ l: 'hot set', v: '5 GB (illustrative)', cls: 'ok' }] },
        { log: 'The buffer manager finds page 17 in shared_buffers. A hit does not need a victim.', code: 1, hl: { nodes: { bm: 'ok', sb: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'hit ratio', v: '99% (illustrative)', cls: 'ok' }] },
        { log: 'Misses are rare, so the clock sweep rarely runs. Hot pages keep their usage counts.', code: 2, hl: { nodes: { clock: 'dim' } }, stats: [{ l: 'shared read', v: '0 blocks', cls: 'ok' }] }
      ] },
    { id: 'big-scan', label: 'Big scan, small ring', desc: 'A large sequential scan reuses a small ring of buffers, so it does not evict the hot pages that checkout needs.', codeLabel: 'Query',
      code: { bug: [`-- nightly batch scans the whole events table`, `SELECT count(*) FROM events;`, `-- every page is read once, and each new page evicts an older one`, `-- checkout reads orders afterwards and finds its pages gone`, `SELECT * FROM orders WHERE id = 42;`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'scan', x: 10, y: 110, w: 150, h: 60, t: 'Seq Scan events', s: 'all pages once' },
        { id: 'pool', x: 240, y: 20, w: 170, h: 56, t: 'shared_buffers', s: 'hot orders pages' },
        { id: 'ring', x: 240, y: 200, w: 170, h: 56, t: 'Ring buffer', s: '256 kB, reused' },
        { id: 'chk', x: 470, y: 110, w: 150, h: 60, t: 'Checkout read', s: 'orders id = 42' }],
        edges: [ { id: 'e1', a: 'scan', b: 'pool', label: 'unsafe (old)' }, { id: 'e2', a: 'scan', b: 'ring', label: 'big scan' }, { id: 'e3', a: 'chk', b: 'pool', label: 'hit?' }] },
      bug: [
        { log: 'The nightly batch starts a sequential scan of events. It is much bigger than a quarter of shared_buffers.', code: 1, hl: { nodes: { scan: 'on' } }, stats: [{ l: 'table size', v: 'far above pool (illustrative)', cls: 'warn' }] },
        { log: 'If every page went into the main pool, each new page would evict a hot orders page. That is the pollution case, shown as a dashed path.', code: 2, hl: { nodes: { pool: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'hot pages evicted', v: 'many (illustrative)', cls: 'bad' }] },
        { log: 'Checkout reads one order a moment later. Its page is gone, so the read goes to the OS cache or disk.', code: 4, hl: { nodes: { chk: 'bad', pool: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'checkout latency', v: '300 ms (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The large scan uses a ring of about 256 kB. Each new page reuses the same few slots.', code: 1, hl: { nodes: { scan: 'ok', ring: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'ring size', v: '256 kB', cls: 'ok' }] },
        { log: 'The hot orders pages stay in the main pool. The scan never evicts them.', code: 2, hl: { nodes: { pool: 'ok' }, edges: { e1: 'dim' } }, stats: [{ l: 'hot pages evicted', v: '0', cls: 'ok' }] },
        { log: 'Checkout finds page 17 in shared_buffers and answers at its normal latency.', code: 4, hl: { nodes: { chk: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'checkout latency', v: '2 ms (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Iterator Execution',
  problem: `The admin page shows the five largest orders with <code>ORDER BY amount DESC LIMIT 5</code> over 10 million rows (illustrative). It takes 4 seconds (illustrative). A developer tests <code>SELECT * FROM orders LIMIT 5</code> and gets an answer in 1 ms (illustrative). Both end in <code>LIMIT 5</code>, so the on-call engineer cannot see why one is so much slower.`,
  predict: { q: `Two plans: <b>A</b> is <code>Seq Scan → Limit</code>, <b>B</b> is <code>Seq Scan → Sort → Limit</code>. Which plan can stop reading the table early?`,
    opts: [`Both, because LIMIT always stops the scan`, `Only A: Sort needs all input before it can emit its first row`, `Only B: sorting first makes the scan cheaper`, `Neither: PostgreSQL always reads the full table`], ans: 1,
    why: `LIMIT stops pulling after N rows. In plan A the scan is one pull away, so it stops after N. In plan B the Sort must consume every input row before returning the first one, so the scan finishes anyway.` },
  explain: `
<h3>The idea</h3>
<p>A query plan is a tree of nodes. Rows flow up the tree one at a time. Each node asks its child for the next row, and a node that must see all its input before it can return anything blocks the whole chain. Whether a query can stop early depends on whether the nodes between the scan and the client stream or block.</p>
<h3>How it works, step by step</h3>
<p>The executor uses the Volcano, or iterator, model. Each plan node implements a next-row call (<code>ExecProcNode</code>). The client asks the top node for a row. That node pulls from its child, and so on down to the scan. Each call returns one row.</p>
<p><b>Streaming nodes</b> such as scan, filter, limit and nested loop pass a row up as soon as they have it. They hold almost nothing in memory.</p>
<p><b>Blocking nodes</b> such as Sort, Hash and HashAggregate must read their whole input before they return the first row. Their memory is what <code>work_mem</code> limits. Chapter 9 covers what happens when the input is larger than that limit.</p>
<p>With a <code>LIMIT</code> above a Sort, PostgreSQL uses a top-N heapsort. It keeps only N rows in a heap, so memory stays tiny. It still has to read every input row to know which N rows are the top ones.</p>
<p><code>EXPLAIN ANALYZE</code> prints the actual <code>rows</code> and <code>loops</code> for each node. The scan's <code>rows</code> is the number of pulls the plan needed.</p>
<h3>The trade-off</h3>
<p>Streaming keeps memory small and lets a consumer stop the work early. Blocking nodes are required for sorting and for some joins, but they force a full read before any row goes out. The useful check is simple: find the blocking node in the plan, and ask whether an index can deliver rows in the order the query needs.</p>`,
  diagnose: [
    { t: `Deep OFFSET pagination reads and discards rows`, sym: `<b>Symptom:</b> page 1 of a listing is fast, page 5,000 takes seconds, and the cost grows with the page number.`,
      ctx: `The orders list uses <code>ORDER BY created_at DESC LIMIT 50 OFFSET $n</code> (illustrative). Crawlers walk to the last pages.`,
      why: `OFFSET is implemented by pulling and throwing away the first n rows. A plan that has to produce 250,050 rows to return 50 does that work on every request, even with an index.`,
      log: `-- representative output, values illustrative\n Limit (actual time=612.1..612.2 rows=50 loops=1)\n   ->  Index Scan Backward using orders_created_at_idx on orders (actual time=0.03..590.4 rows=250050 loops=1)`,
      note: `The scan node reports rows=250050: that is how many pulls were needed for 50 returned rows. Source: LIMIT and OFFSET (postgresql.org/docs/current/queries-limit.html).`,
      fix: [`Measure first: run <code>EXPLAIN (ANALYZE)</code> on a deep page and read the scan node's <code>rows</code>.`, `Fix: use keyset pagination: <code>WHERE (created_at, id) &lt; ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 50</code>.`, `Fix: back it with an index on <code>(created_at, id)</code>.`, `Verify: <code>rows</code> on the scan node equals the page size, for any page.`] },
    { t: `The client fetches the whole result set and the app runs out of memory`, sym: `<b>Symptom:</b> an export job dies with <code>java.lang.OutOfMemoryError: Java heap space</code> while the database looks calm.`,
      ctx: `A nightly export runs <code>SELECT * FROM orders</code> through a JDBC driver with default settings (illustrative: 30 million rows).`,
      why: `By default the PostgreSQL JDBC driver reads the entire result into client memory. The server streams rows happily, but the client buffers all of them first.`,
      log: `-- representative output, values illustrative\nException in thread "export" java.lang.OutOfMemoryError: Java heap space\n  at org.postgresql.jdbc.PgResultSet.<init>\n-- server side: pg_stat_activity shows the backend idle after sending the data`,
      note: `Cursor mode needs autocommit off and a positive fetch size. Source: pgJDBC, getting results based on a cursor (jdbc.postgresql.org/documentation/query/).`,
      fix: [`Measure first: check client heap use during the export and confirm the driver fetch size is unset.`, `Fix: turn off autocommit on the connection and call <code>setFetchSize(5000)</code> (or the equivalent in your driver).`, `Fix: for command-line exports, use <code>psql</code> with <code>\\set FETCH_COUNT 5000</code> or <code>COPY ... TO STDOUT</code>.`, `Verify: client memory stays flat while rows stream.`] },
    { t: `ORDER BY on an unindexed column forces a full sort before LIMIT`, sym: `<b>Symptom:</b> a top-N query is slow, and <code>EXPLAIN</code> shows a Sort above a Seq Scan that reads the whole table.`,
      ctx: `The admin page runs <code>ORDER BY amount DESC LIMIT 5</code> and no index on <code>amount</code> exists (illustrative).`,
      why: `With no index to deliver rows already ordered, the Sort node must see every row to know the top 5. Top-N heapsort keeps memory small, but the scan still reads everything.`,
      log: `-- representative output, values illustrative\n Limit (actual time=3820.4..3820.4 rows=5 loops=1)\n   ->  Sort (actual time=3820.4..3820.4 rows=5 loops=1)\n         Sort Key: amount DESC\n         Sort Method: top-N heapsort  Memory: 25kB\n         ->  Seq Scan on orders (actual time=0.02..2910.7 rows=10000000 loops=1)`,
      note: `Memory is tiny (top-N heapsort) but the scan node still shows all ten million rows. Source: Using EXPLAIN (postgresql.org/docs/current/using-explain.html).`,
      fix: [`Measure first: run <code>EXPLAIN (ANALYZE)</code> and note the scan node's actual <code>rows</code>.`, `Fix: <code>CREATE INDEX CONCURRENTLY orders_amount_idx ON orders (amount DESC)</code>.`, `Fix: if filters are always present, make the index match them, for example a partial index.`, `Verify: the plan shows an Index Scan feeding Limit directly and the scan <code>rows</code> equals the LIMIT.`] }
  ],
  source: { label: 'Original: Iterator Execution', href: '01-postgres-internals-end-to-end.html#ch2' },
  scenarios: [
    { id: 'top-n', label: 'ORDER BY ... LIMIT 5', desc: 'Sort must read every row before it returns the first one. The scan cannot stop early, even with LIMIT on top.', codeLabel: 'Plan',
      code: { bug: [` Limit (actual time=3820.4..3820.4 rows=5 loops=1)`, `   ->  Sort (actual time=3820.4..3820.4 rows=5 loops=1)`, `         Sort Key: amount DESC`, `         Sort Method: top-N heapsort  Memory: 25kB`, `         ->  Seq Scan on orders (actual time=0.02..2910.7 rows=10000000 loops=1)`],
        fix: [`-- CREATE INDEX CONCURRENTLY orders_amount_idx ON orders (amount DESC);`, ` Limit (actual rows=5 loops=1)`, `   ->  Index Scan using orders_amount_idx on orders (actual rows=5 loops=1)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'cl', x: 10, y: 110, w: 120, h: 60, t: 'Client', s: 'fetches rows' },
        { id: 'lim', x: 165, y: 110, w: 120, h: 60, t: 'Limit', s: 'N = 5' },
        { id: 'sort', x: 320, y: 110, w: 130, h: 60, t: 'Sort', s: 'blocking' },
        { id: 'scan', x: 485, y: 20, w: 145, h: 60, t: 'Seq Scan', s: 'reads 10M rows' },
        { id: 'idx', x: 485, y: 200, w: 145, h: 60, t: 'Index Scan', s: 'amount DESC order' }],
        edges: [ { id: 'e1', a: 'cl', b: 'lim', label: 'next row' }, { id: 'e2', a: 'lim', b: 'sort', label: 'next row' }, { id: 'e3', a: 'sort', b: 'scan', label: 'pulls ALL' }, { id: 'e4', a: 'scan', b: 'sort', label: 'rows' }, { id: 'e5', a: 'idx', b: 'lim', label: 'ordered rows' }] },
      bug: [
        { log: 'The client asks Limit for a row. Limit asks Sort for a row, and Sort has nothing yet to return.', code: 0, hl: { nodes: { cl: 'on', lim: 'on', sort: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'rows returned', v: '0 so far', cls: 'warn' }] },
        { log: 'Sort must read every input row to know the top 5. It keeps a small heap and asks the scan for the next row, again and again.', code: 1, hl: { nodes: { sort: 'bad', scan: 'dim' }, edges: { e3: 'on' } }, stats: [{ l: 'rows read by sort', v: '10,000,000 (illustrative)', cls: 'bad' }] },
        { log: 'The sequential scan returns one row per pull, and each pull reads the next page of the table.', code: 4, hl: { nodes: { scan: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'pulls from scan', v: '10,000,000 (illustrative)', cls: 'bad' }] },
        { log: 'Only after the last row does Sort return the top 5. Limit stops there, but the scan has already finished.', code: 3, hl: { nodes: { sort: 'on', lim: 'ok' }, edges: { e2: 'dim' } }, stats: [{ l: 'memory for top 5', v: '25kB', cls: 'ok' }, { l: 'time', v: '3.8 s (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'An index on amount in descending order is created. The index is already sorted, so no Sort node is needed.', code: 0, hl: { nodes: { idx: 'ok', sort: 'dim' } }, stats: [{ l: 'sort node', v: 'not needed', cls: 'ok' }] },
        { log: 'Limit pulls from an Index Scan. The scan starts at the largest amount and returns rows in the order the query needs.', code: 2, hl: { nodes: { idx: 'ok', lim: 'ok' }, edges: { e5: 'ok' }, } , stats: [{ l: 'rows pulled', v: '5', cls: 'ok' }] },
        { log: 'After five rows Limit stops asking. The rest of the table is never read.', code: 1, hl: { nodes: { lim: 'ok', scan: 'dim' } }, stats: [{ l: 'rows pulled', v: '5', cls: 'ok' }, { l: 'pages read', v: 'few (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'streams', label: 'LIMIT with no sort', desc: 'Without a blocking node, LIMIT stops the scan after five pulls. The rest of the table is never read.', codeLabel: 'Plan',
      code: { bug: [`EXPLAIN (ANALYZE) SELECT * FROM orders LIMIT 5;`, ` Limit (actual time=0.01..0.03 rows=5 loops=1)`, `   ->  Seq Scan on orders (actual time=0.01..0.02 rows=5 loops=1)`, `Execution Time: 0.05 ms (illustrative)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'cl', x: 10, y: 110, w: 120, h: 60, t: 'Client', s: 'fetches rows' },
        { id: 'lim', x: 165, y: 110, w: 120, h: 60, t: 'Limit', s: 'N = 5' },
        { id: 'scan', x: 320, y: 110, w: 150, h: 60, t: 'Seq Scan', s: 'one row per pull' },
        { id: 'rest', x: 500, y: 200, w: 130, h: 60, t: 'Rest of table', s: 'never read' }],
        edges: [ { id: 'e1', a: 'cl', b: 'lim', label: 'next row' }, { id: 'e2', a: 'lim', b: 'scan', label: 'next row' }, { id: 'e3', a: 'scan', b: 'lim', label: 'row 1..5' }, { id: 'e4', a: 'scan', b: 'rest', label: 'not reached' }] },
      bug: [
        { log: 'The client asks for the first row. Limit asks the Seq Scan for one row.', code: 1, hl: { nodes: { cl: 'on', lim: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'rows pulled', v: '0', cls: 'ok' }] },
        { log: 'The scan returns one row, and Limit passes it to the client without waiting for more.', code: 2, hl: { nodes: { scan: 'on' }, edges: { e3: 'on' } }, stats: [{ l: 'rows pulled', v: '1', cls: 'ok' }] },
        { log: 'Five pulls later Limit has what it needs. It stops asking for rows.', code: 1, hl: { nodes: { lim: 'ok', scan: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'rows pulled', v: '5', cls: 'ok' }] },
        { log: 'The rest of the table is never read. The query finishes in a fraction of a millisecond (illustrative).', code: 3, hl: { nodes: { rest: 'dim' }, edges: { e4: 'dim' } }, stats: [{ l: 'pages read', v: 'one page (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'B-tree Index',
  problem: `The support tool searches orders by <code>amount</code>. With no index, each lookup scans all 10 million rows (illustrative, 1.2 GB). The team adds an index and lookups drop from seconds to milliseconds. A week later, an import job that inserts orders with random UUID keys is slower, WAL volume has grown, and the index is larger than expected.`,
  predict: { q: `Inserting monotonically increasing keys versus random UUIDv4 keys into a B-tree. Which causes more page splits spread across the tree?`,
    opts: [`Increasing keys: they all pile up on one side`, `Random keys: every insert lands in a random leaf, so many leaves fill and split`, `Both cause the same number of splits`, `Neither: B-trees never split`], ans: 1,
    why: `Increasing keys always go to the rightmost leaf, which splits in a cheap and tightly packed way. Random keys hit random leaves, so leaves split everywhere, run about half full on average, and touch many more pages.` },
  explain: `
<h3>The idea</h3>
<p>An index keeps keys in sorted order in a tree of 8 kB pages. A lookup starts at the root and walks down a few levels to one leaf, so it reads a handful of pages instead of the whole table. The price is that every insert must also find its place in that sorted order.</p>
<h3>How it works, step by step</h3>
<p><b>Search</b>: each page holds keys and downlinks to child pages. PostgreSQL binary-searches the page to choose a child, and repeats until it reaches a leaf. The number of page reads equals the tree height.</p>
<p><b>Page split</b>: when a leaf is full, PostgreSQL allocates a new page, moves about half of the entries to it, and adds a downlink in the parent. A split can cascade up the tree.</p>
<p><b>Leaf chain</b>: leaves link to their neighbours, so a range scan finds the first key and then walks sideways.</p>
<p><b>Index-only scan</b>: if every needed column is in the index and the visibility map says the heap page is all-visible, PostgreSQL does not read the heap.</p>
<p><b>Multicolumn rule</b>: entries are ordered by the first column, then the second. The index helps a query that constrains a leading prefix of those columns.</p>
<h3>The trade-off</h3>
<p>An index buys short lookups and costs space and write time. Each insert also changes the index, and random keys make that work scattered: many leaves are touched, pages split often and end up half full. Sequential keys keep the rightmost leaf hot and dense. Choose keys and column order with the query pattern in mind.</p>`,
  diagnose: [
    { t: `WHERE lower(email) = ... ignores the index on email`, sym: `<b>Symptom:</b> a login lookup stays slow after adding an index on <code>email</code>, and <code>EXPLAIN</code> shows a Seq Scan.`,
      ctx: `The index is <code>CREATE INDEX ON users (email)</code>, but the query is <code>WHERE lower(email) = lower($1)</code> (illustrative: 20 million users).`,
      why: `The index is sorted by the stored value email, not by lower(email). The planner can only use an index when the query's expression matches an indexed expression.`,
      log: `-- representative output, values illustrative\n Seq Scan on users (actual time=0.02..1811.5 rows=1 loops=1)\n   Filter: (lower(email) = 'ann@example.com'::text)\n   Rows Removed by Filter: 19999999`,
      note: `Rows Removed by Filter is the cost of not having a usable index. Source: Indexes on expressions (postgresql.org/docs/current/indexes-expressional.html).`,
      fix: [`Measure first: run <code>EXPLAIN (ANALYZE)</code> on the login query and read the scan type and <code>Rows Removed by Filter</code>.`, `Fix: <code>CREATE INDEX CONCURRENTLY users_lower_email_idx ON users (lower(email))</code>.`, `Fix: or store a normalized column or use the <code>citext</code> type, and index that.`, `Verify: the plan shows an Index Scan on the new index.`] },
    { t: `Composite index with the wrong column order cannot serve the filter`, sym: `<b>Symptom:</b> a query that filters only on <code>status</code> ignores an index that includes <code>status</code>.`,
      ctx: `The index is <code>(created_at, status)</code>, while the dashboard filters by <code>status = 'pending'</code> only (illustrative).`,
      why: `Entries are ordered by created_at first. Rows with the same status are scattered all over the index, so there is no contiguous range to descend to. A leading-column constraint is what makes the index efficient.`,
      log: `-- representative output, values illustrative\n Index Scan using orders_created_at_status_idx on orders (actual time=0.08..941.2 rows=1200 loops=1)\n   Index Cond: (status = 'pending'::text)\n -- or, more commonly, the planner prefers:\n Seq Scan on orders ... Filter: (status = 'pending'::text)`,
      note: `An index scan that must walk the entire index and filter by a non-leading column is barely better than a table scan. Source: Multicolumn indexes (postgresql.org/docs/current/indexes-multicolumn.html).`,
      fix: [`Measure first: list the real filters from <code>pg_stat_statements</code> and check each index with <code>EXPLAIN</code>.`, `Fix: put equality columns first and range or sort columns last, for example <code>(status, created_at)</code>.`, `Fix: drop the old index once the new one is used, to save write cost.`, `Verify: the plan shows <code>Index Cond</code> on the leading column and <code>idx_scan</code> grows on the new index in <code>pg_stat_user_indexes</code>.`] },
    { t: `Random UUIDv4 keys cause page splits, bloat and extra WAL`, sym: `<b>Symptom:</b> bulk inserts get slower as the table grows, the primary key index becomes much larger than the data justifies, and WAL volume rises.`,
      ctx: `The orders primary key is a random UUIDv4 generated by clients (illustrative: 200 million rows).`,
      why: `Each new key lands in a random leaf. That leaf is likely not cached, may be full and split, and the first change to a page after a checkpoint logs a full-page image. Leaves also end up about half full, wasting space.`,
      log: `-- representative output, values illustrative\n relname            | pg_size_pretty\n--------------------+----------------\n orders_pkey_uuid   | 11 GB\n orders_pkey_bigint | 4300 MB`,
      note: `Same row count, different key pattern. Sizes here are illustrative. You can measure index density with the pgstattuple extension (pgstatindex). Source: B-Tree indexes (postgresql.org/docs/current/btree.html).`,
      fix: [`Measure first: compare index size and leaf density to a sequential-key control, and check WAL volume per insert.`, `Fix: use a time-ordered key: a bigint identity column, or UUIDv7 generated by the application (UUIDv7 generation is not built into PostgreSQL 16 or 17).`, `Fix: if the key must stay random, give the index a lower fillfactor and rebuild it with <code>REINDEX CONCURRENTLY</code> during quiet periods.`, `Verify: <code>pgstatindex</code> reports higher <code>avg_leaf_density</code> and WAL per insert falls.`] },
    { t: `An implicit cast on the column prevents index use`, sym: `<b>Symptom:</b> a lookup by <code>user_id</code> is a Seq Scan only when called from one service, although the SQL looks identical.`,
      ctx: `<code>user_id</code> is <code>bigint</code> with an index. That service binds the parameter as <code>numeric</code> (illustrative: a decimal type in the client library).`,
      why: `There is no bigint = numeric operator. The analyzer picks numeric = numeric and casts the column, so the indexed value user_id is no longer what the condition compares: the expression is user_id::numeric.`,
      log: `-- representative output, values illustrative\n Seq Scan on orders (actual time=0.03..2204.8 rows=14 loops=1)\n   Filter: ((user_id)::numeric = '42'::numeric)\n   Rows Removed by Filter: 9999986`,
      note: `The tell is the cast on the column side, (user_id)::numeric. Source: Type conversion: operators (postgresql.org/docs/current/typeconv-oper.html).`,
      fix: [`Measure first: find the <code>(col)::type</code> pattern in the <code>Filter</code> line of <code>EXPLAIN</code>.`, `Fix: bind parameters with the column's type, or cast the parameter explicitly: <code>WHERE user_id = $1::bigint</code>.`, `Fix: correct the client mapping, for example use long or bigint for identifiers, not decimal types.`, `Verify: the filter shows no cast on the column and the plan uses an Index Scan.`] }
  ],
  source: { label: 'Original: B-tree Index', href: '01-postgres-internals-end-to-end.html#ch3' },
  scenarios: [
    { id: 'leading-col', label: 'Wrong leading column', desc: 'A filter on status cannot descend a (created_at, status) index, so it walks every leaf. Reordering the columns gives the planner one range to read.', codeLabel: 'SQL',
      code: { bug: [`CREATE INDEX orders_created_at_status_idx ON orders (created_at, status);`, `SELECT * FROM orders WHERE status = 'pending';`, `-- leading column is created_at, so status is not a prefix`, `-- planner walks the leaf level and filters each entry`, `Seq Scan on orders  Filter: (status = 'pending'::text)`],
        fix: [`CREATE INDEX orders_status_created_at_idx ON orders (status, created_at);`, `SELECT * FROM orders WHERE status = 'pending';`, `-- equality column leads, so the index can descend to one range`, `-- descent: root, then one internal page, then the first leaf`, `Index Cond: (status = 'pending'::text)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'root', x: 235, y: 10, w: 150, h: 50, t: 'Root page', s: 'keys + downlinks' },
        { id: 'i1', x: 60, y: 90, w: 150, h: 50, t: 'Internal page', s: 'keys + downlinks' },
        { id: 'i2', x: 410, y: 90, w: 150, h: 50, t: 'Internal page', s: 'keys + downlinks' },
        { id: 'l1', x: 10, y: 200, w: 130, h: 50, t: 'Leaf 1', s: 'keys + TIDs' },
        { id: 'l2', x: 165, y: 200, w: 130, h: 50, t: 'Leaf 2', s: 'keys + TIDs' },
        { id: 'l3', x: 320, y: 200, w: 130, h: 50, t: 'Leaf 3', s: 'keys + TIDs' },
        { id: 'l4', x: 480, y: 200, w: 130, h: 50, t: 'Leaf 4', s: 'keys + TIDs' }],
        edges: [ { id: 'e1', a: 'root', b: 'i1', label: 'child' }, { id: 'e2', a: 'root', b: 'i2', label: 'child' }, { id: 'e3', a: 'i1', b: 'l1', label: '' }, { id: 'e4', a: 'i1', b: 'l2', label: '' }, { id: 'e5', a: 'i2', b: 'l3', label: '' }, { id: 'e6', a: 'i2', b: 'l4', label: '' }, { id: 'e7', a: 'l1', b: 'l2', label: 'next leaf' }, { id: 'e8', a: 'l2', b: 'l3', label: 'next leaf' }, { id: 'e9', a: 'l3', b: 'l4', label: 'next leaf' }] },
      bug: [
        { log: 'The query filters on status. The index is ordered by created_at first, so status is not a prefix and the planner cannot descend by it.', code: 1, hl: { nodes: { root: 'warn' } }, stats: [{ l: 'leading column match', v: 'no', cls: 'bad' }] },
        { log: 'Pending orders are spread across every leaf, because created_at varies inside each one.', code: 2, hl: { nodes: { l1: 'warn', l2: 'warn', l3: 'warn', l4: 'warn' } }, stats: [{ l: 'leaves to check', v: 'all 4 (illustrative)', cls: 'bad' }] },
        { log: 'Each leaf is read, and each entry is checked against status = pending. Walking the leaf chain costs close to a full index scan.', code: 3, hl: { nodes: { l1: 'bad', l2: 'bad', l3: 'bad', l4: 'bad' }, edges: { e7: 'bad', e8: 'bad', e9: 'bad' } }, stats: [{ l: 'index pages read', v: 'most of the index (illustrative)', cls: 'bad' }] },
        { log: 'The planner may prefer a Seq Scan on orders with a filter, which reads every heap page.', code: 4, hl: { nodes: { root: 'dim', i1: 'dim', i2: 'dim' } }, stats: [{ l: 'rows removed by filter', v: 'most rows (illustrative)', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The index now starts with status. An equality on the leading column gives the planner one contiguous range.', code: 0, hl: { nodes: { root: 'ok', i1: 'ok' }, edges: { e1: 'ok', e3: 'ok' } }, stats: [{ l: 'leading column match', v: 'yes', cls: 'ok' }] },
        { log: 'The descent goes root, then one internal page, then the first leaf that holds a pending entry.', code: 3, hl: { nodes: { root: 'ok', i1: 'ok', l1: 'ok' }, edges: { e1: 'ok', e3: 'ok' } }, stats: [{ l: 'pages read to start', v: '3 (illustrative)', cls: 'ok' }] },
        { log: 'The scan follows the leaf chain only while status is still pending. The other leaves are not read.', code: 4, hl: { nodes: { l1: 'ok', l2: 'ok', l3: 'dim', l4: 'dim' }, edges: { e7: 'ok', e8: 'dim', e9: 'dim' } }, stats: [{ l: 'index pages read', v: 'a few (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'uuid-insert', label: 'Random key inserts', desc: 'Random UUIDv4 keys land on random leaves. Each leaf splits often and stays half full. Time-ordered keys always go to the rightmost leaf.', codeLabel: 'SQL',
      code: { bug: [`-- orders primary key is a random UUIDv4 (illustrative: 200 million rows)`, `INSERT INTO orders (id, amount) VALUES (gen_random_uuid(), 10);`, `-- random key: lands in a random leaf, which splits often`, `-- pg_relation_size(orders_pkey_uuid) = 11 GB (illustrative)`],
        fix: [`-- time-ordered key, so every new key is larger than the last`, `INSERT INTO orders (id, amount) VALUES (DEFAULT, 10);  -- bigint identity`, `-- inserts go to the rightmost leaf, which stays hot in cache`, `-- avg_leaf_density = 90 (illustrative)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'ins', x: 10, y: 110, w: 150, h: 70, t: 'Insert batch', s: 'random UUIDv4 keys' },
        { id: 'la', x: 300, y: 20, w: 170, h: 60, t: 'Leaf 17', s: 'full, must split' },
        { id: 'lb', x: 300, y: 120, w: 170, h: 60, t: 'Leaf 902', s: 'about half full' },
        { id: 'lc', x: 300, y: 220, w: 170, h: 60, t: 'Leaf 311', s: 'full-page image' },
        { id: 'rm', x: 500, y: 20, w: 130, h: 60, t: 'Rightmost leaf', s: 'ordered keys' }],
        edges: [ { id: 'e1', a: 'ins', b: 'la', label: 'random' }, { id: 'e2', a: 'ins', b: 'lb', label: 'random' }, { id: 'e3', a: 'ins', b: 'lc', label: 'random' }, { id: 'e4', a: 'ins', b: 'rm', label: 'increasing' }] },
      bug: [
        { log: 'Each new key is random, so it lands on a random leaf. The batch touches many leaves across the index.', code: 1, hl: { nodes: { ins: 'on', la: 'warn', lb: 'warn', lc: 'warn', rm: 'dim' }, edges: { e1: 'on', e2: 'on', e3: 'on', e4: 'dim' } }, stats: [{ l: 'leaves touched', v: 'many (illustrative)', cls: 'bad' }] },
        { log: 'A full leaf splits. A new page is allocated, about half the entries move to it, and a downlink is added to the parent.', code: 2, hl: { nodes: { la: 'bad' } }, stats: [{ l: 'page splits', v: 'many (illustrative)', cls: 'bad' }] },
        { log: 'Leaves stay about half full, so the index grows larger than the data needs.', code: 3, hl: { nodes: { lb: 'bad' } }, stats: [{ l: 'leaf fill', v: 'about 55% (illustrative)', cls: 'bad' }] },
        { log: 'After each checkpoint, the first change to a page writes a full-page image to WAL. WAL volume rises with every insert.', code: 3, hl: { nodes: { lc: 'bad' } }, stats: [{ l: 'WAL per insert', v: 'rising', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The key is now a bigint identity or a time-ordered value. Each new key is larger than the last one.', code: 0, hl: { nodes: { ins: 'ok', rm: 'ok' }, edges: { e4: 'ok', e1: 'dim', e2: 'dim', e3: 'dim' } }, stats: [{ l: 'key order', v: 'increasing', cls: 'ok' }] },
        { log: 'Every insert lands in the rightmost leaf, which is hot in cache and rarely splits.', code: 2, hl: { nodes: { rm: 'ok', la: 'dim', lb: 'dim', lc: 'dim' } }, stats: [{ l: 'page splits', v: 'few (illustrative)', cls: 'ok' }] },
        { log: 'Leaves are packed dense, so the index is smaller and each insert writes less WAL.', code: 3, hl: { nodes: { rm: 'ok' } }, stats: [{ l: 'leaf fill', v: 'about 90% (illustrative)', cls: 'ok' }, { l: 'WAL per insert', v: 'lower (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Transactions and MVCC',
  problem: `A 20-minute finance report reads the whole <code>orders</code> table at month end (illustrative), while checkout keeps moving orders from <code>pending</code> to <code>paid</code>. A manager asks to move the report to a replica because it must be blocking checkout. The on-call engineer sees checkout waiting on a different job, one that updates the same rows.`,
  predict: { q: `Transaction A has updated row R and has not committed. Transaction B now runs <code>SELECT</code> on row R. What happens?`,
    opts: [`B waits until A commits`, `B sees the old version of R and does not wait`, `B sees A's uncommitted new version`, `B fails with a serialization error`], ans: 1,
    why: `Plain reads never take row locks. B's snapshot predates A's commit, so the new version, stamped with A's transaction ID in <code>xmin</code>, is invisible to B and the old version is returned. Only another writer to the same row would wait.` },
  explain: `
<h3>The idea</h3>
<p>PostgreSQL does not overwrite a row in place. An <code>UPDATE</code> writes a new version of the row and marks the old version as replaced. Each reader sees the version its snapshot allows. Readers therefore never wait for writers. Only two writers of the same row wait for each other.</p>
<h3>How it works, step by step</h3>
<p>Every row version (tuple) carries two stamps. <code>xmin</code> is the transaction that created it. <code>xmax</code> is the transaction that deleted or replaced it. An <code>UPDATE</code> sets <code>xmax</code> on the old version and writes a new version with its own <code>xmin</code>.</p>
<p>A <b>snapshot</b> records the oldest running transaction, the next transaction ID to assign, and the list of transactions still in progress. A version is visible if its creator committed before the snapshot was taken and its deleter did not.</p>
<p>Commit status lives in the commit log, <code>pg_xact</code>. Hint bits on the tuple cache that answer, so later readers do not have to look it up again.</p>
<p><b>HOT</b> (heap-only tuple) updates avoid index work. If no indexed column changes and the new version fits on the same page, PostgreSQL writes no new index entries.</p>
<p><b>Row locks</b> are recorded in the tuple. A second <code>UPDATE</code> of the same row waits for the first transaction to end. A plain <code>SELECT</code> takes no row lock.</p>
<h3>The trade-off</h3>
<p>Versions let readers and writers run together, but old versions take space until VACUUM removes them, and <code>count(*)</code> must check each tuple's visibility. Indexing a column that changes often blocks HOT updates and bloats every index. A long transaction holds its row locks for its whole life, so the work it does affects every writer that needs those rows.</p>`,
  diagnose: [
    { t: `count(*) is slow because every tuple's visibility is checked`, sym: `<b>Symptom:</b> <code>SELECT count(*) FROM orders</code> takes seconds, grows linearly with the table and looks CPU and I/O bound.`,
      ctx: `The dashboard counts all orders on a table with 80 million rows (illustrative).`,
      why: `No row count is stored, because the right answer depends on the caller's snapshot. PostgreSQL must visit each tuple, or use an index-only scan where the visibility map allows skipping the heap.`,
      log: `-- representative output, values illustrative\n Aggregate (actual time=2210.4..2210.4 rows=1 loops=1)\n   ->  Index Only Scan using orders_pkey on orders (actual time=0.04..1480.1 rows=80000000 loops=1)\n         Heap Fetches: 4120377`,
      note: `Heap Fetches counts pages that still had to be checked in the heap, because the visibility map did not mark them all-visible. Source: PostgreSQL wiki, Slow Counting.`,
      fix: [`Measure first: <code>EXPLAIN (ANALYZE, BUFFERS)</code> on the count and check <code>Heap Fetches</code>.`, `Fix: if an estimate is fine, read <code>pg_class.reltuples</code> or use <code>EXPLAIN</code>'s row estimate.`, `Fix: if it must be exact and fast, maintain a small counter table updated by the writers or batch job.`, `Fix: keep the visibility map fresh with timely vacuum so index-only scans skip the heap.`, `Verify: the dashboard call stays in milliseconds as the table grows.`] },
    { t: `Indexing a frequently updated column blocks HOT updates`, sym: `<b>Symptom:</b> update throughput drops after adding an index, indexes bloat and WAL volume rises.`,
      ctx: `A developer indexes <code>orders.status</code> for a dashboard, and checkout updates <code>status</code> on every order several times (illustrative).`,
      why: `A HOT update needs that no indexed column changes. Once status is indexed, every status change writes a new version and a new entry in every index, which needs more pages, more WAL and more vacuum work.`,
      log: `-- representative output, values illustrative\napp=> SELECT relname, n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'orders';\n relname | n_tup_upd | n_tup_hot_upd\n---------+-----------+---------------\n orders  |  91234001 |       1204110`,
      note: `A low ratio of n_tup_hot_upd to n_tup_upd on an update-heavy table is the signal. Source: Heap-only tuples (postgresql.org/docs/current/storage-hot.html).`,
      fix: [`Measure first: compute <code>n_tup_hot_upd / n_tup_upd</code> from <code>pg_stat_user_tables</code> for the table.`, `Fix: do not index volatile columns. Use a partial index such as <code>WHERE status = 'pending'</code> or query a replica or summary table.`, `Fix: lower the table <code>fillfactor</code> (for example 80 to 90) so a page has room for the new version.`, `Verify: the HOT ratio rises and index size and WAL growth flatten.`] },
    { t: `Writers queue behind a row lock held by a long transaction`, sym: `<b>Symptom:</b> checkout latency spikes, the connection pool saturates and <code>pg_stat_activity</code> shows many sessions in wait event <code>Lock</code>.`,
      ctx: `A batch job begins a transaction, updates 5 million orders, then waits on an external API before committing (illustrative: 4 minutes).`,
      why: `Row locks are held until the transaction ends. A checkout that updates one of those rows must wait for the batch to commit, and each waiting session holds a connection.`,
      log: `-- representative output, values illustrative\napp=> SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by, left(query, 40)\n       FROM pg_stat_activity WHERE wait_event_type = 'Lock';\n  pid  | wait_event_type | wait_event    | blocked_by | left\n-------+-----------------+---------------+------------+--------------------\n  8812 | Lock            | transactionid | {7001}     | UPDATE orders SET ...`,
      note: `pg_blocking_pids names the holder. The wait is on the holder's transaction ID because a row lock is recorded in the tuple. Source: Explicit locking, row-level locks (postgresql.org/docs/current/explicit-locking.html).`,
      fix: [`Measure first: list blockers with <code>pg_blocking_pids</code> and read each blocker's <code>xact_start</code> and state.`, `Fix: process the batch in small transactions and commit between batches, and never wait on external calls inside a transaction.`, `Fix: set <code>idle_in_transaction_session_timeout</code> and <code>lock_timeout</code> so stuck sessions are cut off.`, `Verify: the count of sessions in wait event <code>Lock</code> returns to near zero during the batch.`] }
  ],
  source: { label: 'Original: Transactions and MVCC', href: '01-postgres-internals-end-to-end.html#ch4' },
  scenarios: [
    { id: 'reader', label: 'Reader sees old version', desc: 'A plain SELECT takes no row lock. It reads the version its snapshot allows, so it does not wait for the uncommitted UPDATE.', codeLabel: 'SQL',
      code: { bug: [`-- Session A (checkout)`, `BEGIN;`, `UPDATE orders SET status = 'paid' WHERE id = 42;`, `-- Session B (finance report), starts while A is open`, `SELECT status FROM orders WHERE id = 42;`, `-- returns 'pending': the old version, no wait`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'sa', x: 10, y: 40, w: 150, h: 60, t: 'Session A', s: 'UPDATE, uncommitted' },
        { id: 'sb', x: 10, y: 190, w: 150, h: 60, t: 'Session B', s: 'SELECT, snapshot' },
        { id: 'v1', x: 250, y: 40, w: 170, h: 60, t: 'Version 1', s: 'xmin=100 xmax=205' },
        { id: 'v2', x: 250, y: 190, w: 170, h: 60, t: 'Version 2', s: 'xmin=205 xmax=0' },
        { id: 'clog', x: 480, y: 115, w: 150, h: 60, t: 'pg_xact', s: 'commit status' }],
        edges: [ { id: 'e1', a: 'sa', b: 'v1', label: 'set xmax' }, { id: 'e2', a: 'sa', b: 'v2', label: 'insert new' }, { id: 'e3', a: 'sb', b: 'v1', label: 'visible' }, { id: 'e4', a: 'sb', b: 'v2', label: 'skipped' }, { id: 'e5', a: 'v2', b: 'clog', label: 'check commit' }] },
      bug: [
        { log: 'Session A changes the row. Version 1 gets xmax=205, and a new Version 2 with xmin=205 is written. Nothing is committed yet.', code: 2, hl: { nodes: { sa: 'on', v1: 'warn', v2: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'committed', v: 'no', cls: 'warn' }] },
        { log: 'Session B starts with its snapshot. Transaction 205 is still in progress for B, so its change is not yet committed as far as B is concerned.', code: 3, hl: { nodes: { sb: 'on', clog: 'warn' } }, stats: [{ l: 'in-progress xid seen by B', v: '205', cls: 'warn' }] },
        { log: 'B reads Version 1. Its xmax belongs to an in-progress transaction, so the replacement is not visible and the old row is returned.', code: 4, hl: { nodes: { sb: 'ok', v1: 'ok' }, edges: { e3: 'ok', e4: 'dim' }, }, stats: [{ l: 'row lock wait', v: 'none', cls: 'ok' }] },
        { log: 'Version 2 is skipped because its creator has not committed. B returns pending and never waits, because plain reads take no row lock.', code: 5, hl: { nodes: { v2: 'dim', clog: 'dim' }, edges: { e4: 'ok', e5: 'dim' } }, stats: [{ l: 'B sees status', v: 'pending', cls: 'ok' }] }
      ] },
    { id: 'batch-lock', label: 'Long transaction blocks checkout', desc: 'A batch holds row locks until it commits. Checkout updates one of those rows, waits, and keeps its pool connection the whole time.', codeLabel: 'SQL',
      code: { bug: [`-- batch job (illustrative: 5 million rows, 4 minutes)`, `BEGIN;`, `UPDATE orders SET status = 'refunded' WHERE created_at < '2026-01-01';`, `-- waits on an external API before COMMIT (illustrative)`, `UPDATE orders SET status = 'paid' WHERE id = 42;  -- checkout, blocked`, `-- wait_event_type = 'Lock', wait_event = 'transactionid'`],
        fix: [`-- batch job: commit every 1,000 rows (illustrative)`, `BEGIN;`, `UPDATE orders SET status = 'refunded' WHERE id BETWEEN $1 AND $2;`, `COMMIT;`, `UPDATE orders SET status = 'paid' WHERE id = 42;  -- checkout, no wait`, `-- the external API is called outside any open transaction`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'batch', x: 10, y: 30, w: 160, h: 70, t: 'Batch txn', s: 'holds row locks' },
        { id: 'api', x: 10, y: 200, w: 160, h: 60, t: 'External API', s: 'slow, 4 minutes' },
        { id: 'row', x: 300, y: 30, w: 170, h: 60, t: 'Order row 42', s: 'locked by batch' },
        { id: 'checkout', x: 300, y: 200, w: 170, h: 60, t: 'Checkout', s: 'waiting on lock' },
        { id: 'pool', x: 500, y: 115, w: 130, h: 70, t: 'Pool slot', s: 'held, waiting' }],
        edges: [ { id: 'e1', a: 'batch', b: 'row', label: 'UPDATE locks' }, { id: 'e2', a: 'batch', b: 'api', label: 'waits for API' }, { id: 'e3', a: 'checkout', b: 'row', label: 'needs lock' }, { id: 'e4', a: 'checkout', b: 'pool', label: 'holds slot' }] },
      bug: [
        { log: 'The batch opens a transaction and updates many order rows. Each updated row stays locked until COMMIT.', code: 2, hl: { nodes: { batch: 'on', row: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'rows locked', v: '5,000,000 (illustrative)', cls: 'warn' }] },
        { log: 'The batch waits for an external API before it commits. Its locks stay in place for the whole wait.', code: 3, hl: { nodes: { api: 'bad', batch: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'lock held for', v: '4 minutes (illustrative)', cls: 'bad' }] },
        { log: 'Checkout updates an order the batch has already locked. It must wait for the batch transaction to end.', code: 4, hl: { nodes: { checkout: 'bad', row: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'wait event', v: 'Lock', cls: 'bad' }] },
        { log: 'Checkout keeps its pool connection while it waits. Other requests queue behind it.', code: 5, hl: { nodes: { pool: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'pool slots waiting', v: '90 of 100 (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The batch updates 1,000 rows and commits. Each COMMIT releases its locks, so each batch holds them only briefly.', code: 3, hl: { nodes: { batch: 'ok', row: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'rows locked per transaction', v: '1,000 (illustrative)', cls: 'ok' }] },
        { log: 'The external API is called outside any open transaction, so no row lock waits on it.', code: 5, hl: { nodes: { api: 'ok' }, edges: { e2: 'dim' } }, stats: [{ l: 'lock held for', v: 'milliseconds (illustrative)', cls: 'ok' }] },
        { log: 'Checkout updates row 42. The lock is free, so it does not wait.', code: 4, hl: { nodes: { checkout: 'ok', row: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'wait event', v: 'none', cls: 'ok' }] },
        { log: 'Checkout returns and its connection goes back to the pool at once.', code: 4, hl: { nodes: { pool: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'pool slots waiting', v: '2 of 100 (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'WAL and Crash Recovery',
  problem: `A payment service writes an order as <code>paid</code> and returns success to the customer. A moment later (illustrative) the host loses power. After restart the database opens within seconds, but support receives complaints that two confirmed orders are missing. The team had set <code>synchronous_commit = off</code> months earlier to speed up writes.`,
  predict: { q: `With <code>synchronous_commit = off</code>, the host crashes 100 ms after a COMMIT returned. Can that committed transaction be lost?`,
    opts: [`No: COMMIT always means durable`, `Yes: its WAL may not be flushed yet, for up to about three times wal_writer_delay`, `Yes, and the database will also be corrupted`, `No: the checkpointer writes the page first`], ans: 1,
    why: `Asynchronous commit returns before the WAL is flushed. The WAL writer flushes every wal_writer_delay (default 200 ms), and the docs bound the risk window at up to three times that. The database stays consistent, but the last commits can vanish.` },
  explain: `
<h3>The idea</h3>
<p>Data pages are written lazily, in the background. What must survive a crash is a small, sequential log. PostgreSQL writes the intent of each change to the write-ahead log (WAL) first. A commit is safe once its log record is on disk, even if the data page itself was never written.</p>
<h3>How it works, step by step</h3>
<p>Each change produces a <b>WAL record</b>, identified by an increasing <b>LSN</b> (log sequence number). Records are appended to <b>WAL buffers</b> in memory and written to files in <code>pg_wal</code>.</p>
<p>With <code>synchronous_commit = on</code>, a <code>COMMIT</code> waits until WAL up to its commit record has been flushed to disk with <code>fsync</code>. After that the commit is durable, even if no data page was written.</p>
<p>The <b>page LSN rule</b> keeps the log ahead of the data. A dirty data page may be written only after WAL up to that page's LSN has been flushed.</p>
<p>After a crash, <b>redo</b> replays WAL from the last checkpoint's redo point. A page whose LSN is already at or above the record is skipped.</p>
<p><b>Full-page images</b> (<code>full_page_writes</code>): the first change to a page after a checkpoint writes the whole page to WAL. If a crash tears an 8 kB write, redo can rebuild the page from that image.</p>
<h3>The trade-off</h3>
<p>Waiting for the flush makes each commit slower, so <code>synchronous_commit = off</code> returns early. The cost is that the last commits can be lost after a crash. The database stays consistent, but acknowledged work can vanish. Turning <code>fsync</code> or <code>full_page_writes</code> off is different: it breaks the ordering the recovery depends on, and it can corrupt data. Use those settings only for data you can recreate.</p>`,
  diagnose: [
    { t: `fsync = off corrupts the database after an OS crash`, sym: `<b>Symptom:</b> after a power loss or kernel panic, PostgreSQL starts and later throws <code>invalid page</code> errors or reads wrong data.`,
      ctx: `A team disabled <code>fsync</code> on a production host to speed up a data load and never turned it back on (illustrative).`,
      why: `With fsync = off PostgreSQL never forces data to stable storage, so the OS may write a data page to disk before the WAL that describes it. After a crash the log cannot repair or even explain the state, and the result can be unrecoverable corruption.`,
      log: `-- representative output, values illustrative\nERROR:  invalid page in block 1432 of relation base/16384/16397\nERROR:  could not read block 1432 in file "base/16384/16397": read only 0 of 8192 bytes`,
      note: `The docs call turning off fsync a risk of unrecoverable corruption after a crash. Use it only for data you can recreate. Source: Reliability (postgresql.org/docs/current/wal-reliability.html).`,
      fix: [`Measure first: <code>SHOW fsync</code>, <code>SHOW synchronous_commit</code> and <code>SHOW full_page_writes</code> on every production node.`, `Fix: set <code>fsync = on</code>. For disposable data loads use an unlogged table or a temporary database instead.`, `Fix: if the node already crashed with fsync off, restore from a backup rather than trusting the data files.`, `Verify: the settings are on, and configuration management alerts on any drift.`] },
    { t: `The asynchronous-commit window loses the last commits`, sym: `<b>Symptom:</b> after a crash, a handful of confirmed orders are missing while the database is otherwise consistent.`,
      ctx: `A service sets <code>synchronous_commit = off</code> globally to cut commit latency (illustrative: from 4 ms to under 1 ms).`,
      why: `Commits return before their WAL is flushed. The WAL writer flushes every wal_writer_delay. The docs note the real risk window can be up to three times that, because of how the writer paces its flushing.`,
      log: `-- representative output, values illustrative\nLOG:  database system was interrupted; last known up at 2026-10-08 14:21:07 UTC\nLOG:  database system was not properly shut down; automatic recovery in progress\nLOG:  redo starts at 4C/9A000028\nLOG:  redo done at 4C/9A8F31E8\nLOG:  database system is ready to accept connections`,
      note: `Recovery is clean, but WAL after the last flush point never existed on disk. Wording varies by version. Source: Asynchronous commit (postgresql.org/docs/current/wal-async-commit.html).`,
      fix: [`Measure first: compare <code>SHOW synchronous_commit</code> in the global config, the role and the session, and note which transactions need durability.`, `Fix: keep <code>synchronous_commit = on</code> by default, and use <code>SET LOCAL synchronous_commit = off</code> only inside transactions that can safely lose their last moments, such as logging.`, `Fix: for faster durable commits, batch work in fewer transactions, or put <code>pg_wal</code> on low-latency storage.`, `Verify: critical transactions show commit latency that includes the flush, and the lost-commit count after a crash test is zero.`] },
    { t: `full_page_writes = off on storage without atomic 8 kB writes tears pages`, sym: `<b>Symptom:</b> after a crash, queries fail with checksum or invalid page errors on a few blocks, although fsync was on.`,
      ctx: `A team turned <code>full_page_writes</code> off to reduce WAL volume (illustrative: 40% less), on a filesystem that does not guarantee atomic 8 kB page writes.`,
      why: `A crash during a page write can leave half old and half new data. The first change to a page after a checkpoint logs a full-page image to repair that. Without it redo applies deltas to a broken base page.`,
      log: `-- representative output, values illustrative\nWARNING:  page verification failed, calculated checksum 51234 but expected 9876\nERROR:  invalid page in block 3318 of relation base/16384/16410\n-- data checksums were enabled at initdb, so the torn page was detected`,
      note: `Checksums turn silent corruption into a loud error. They are chosen at initdb time (or with pg_checksums while offline). Source: WAL settings, full_page_writes (postgresql.org/docs/current/runtime-config-wal.html).`,
      fix: [`Measure first: <code>SHOW full_page_writes</code>, and check whether data checksums are on with <code>SHOW data_checksums</code>.`, `Fix: set <code>full_page_writes = on</code> unless the storage is certified to write 8 kB atomically.`, `Fix: reduce WAL volume with compression (<code>wal_compression</code>) and longer checkpoint intervals instead.`, `Verify: <code>full_page_writes</code> is on, WAL volume is acceptable, and crash tests produce no page errors.`] }
  ],
  source: { label: 'Original: WAL and Crash Recovery', href: '01-postgres-internals-end-to-end.html#ch5' },
  scenarios: [
    { id: 'async-commit', label: 'Commit lost in async window', desc: 'With synchronous_commit off, COMMIT returns before its WAL is flushed. A crash in that window loses a commit the customer was told succeeded.', codeLabel: 'SQL',
      code: { bug: [`-- payment service (illustrative)`, `SET synchronous_commit = off;  -- set globally in the incident`, `UPDATE orders SET status = 'paid' WHERE id = 42;`, `COMMIT;  -- returns to the client before WAL is flushed`, `-- host loses power 100 ms later (illustrative)`, `LOG:  database system was not properly shut down; automatic recovery in progress`],
        fix: [`-- payment service (illustrative)`, `SET synchronous_commit = on;  -- default, COMMIT waits for the WAL flush`, `UPDATE orders SET status = 'paid' WHERE id = 42;`, `COMMIT;  -- returns only after WAL up to this commit is on disk`, `-- host loses power 100 ms later (illustrative)`, `-- redo replays the commit record, the paid order is kept`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'bk', x: 10, y: 110, w: 120, h: 60, t: 'Backend', s: 'COMMIT' },
        { id: 'wb', x: 180, y: 110, w: 140, h: 60, t: 'WAL buffers', s: 'records + LSN' },
        { id: 'wal', x: 380, y: 30, w: 140, h: 60, t: 'pg_wal', s: 'flushed log' },
        { id: 'bp', x: 380, y: 200, w: 140, h: 60, t: 'Shared buffers', s: 'dirty page' },
        { id: 'df', x: 520, y: 200, w: 110, h: 60, t: 'Data files', s: 'written later' }],
        edges: [ { id: 'e1', a: 'bk', b: 'wb', label: 'append' }, { id: 'e2', a: 'wb', b: 'wal', label: 'flush at commit' }, { id: 'e3', a: 'bk', b: 'bp', label: 'modify page' }, { id: 'e4', a: 'bp', b: 'df', label: 'later' }] },
      bug: [
        { log: 'The payment service updates the order and calls COMMIT. With synchronous_commit off, COMMIT returns before the WAL flush.', code: 3, hl: { nodes: { bk: 'on', wb: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'WAL flushed at COMMIT', v: 'no', cls: 'bad' }] },
        { log: 'The customer is told the payment succeeded. The commit record sits in WAL buffers in RAM, not yet in pg_wal.', code: 4, hl: { nodes: { wb: 'warn', wal: 'dim' }, edges: { e2: 'dim' } }, stats: [{ l: 'time since COMMIT', v: '100 ms (illustrative)', cls: 'warn' }] },
        { log: 'The power fails. The WAL buffers in RAM are gone, and the commit record was never written to pg_wal.', code: 4, hl: { nodes: { wb: 'bad' } }, stats: [{ l: 'commit in pg_wal', v: 'no', cls: 'bad' }] },
        { log: 'Restart: redo replays only the WAL that reached pg_wal. The paid update never happened, although the customer was told it did.', code: 5, hl: { nodes: { wal: 'warn', bp: 'dim' } }, stats: [{ l: 'acknowledged commits lost', v: '1 (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With synchronous_commit on, COMMIT does not return until the commit record is flushed to pg_wal.', code: 3, hl: { nodes: { bk: 'ok', wb: 'ok', wal: 'ok' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'WAL flushed at COMMIT', v: 'yes', cls: 'ok' }] },
        { log: 'The customer sees success only after the flush. The commit record is already in pg_wal when the power fails.', code: 4, hl: { nodes: { wal: 'ok' } }, stats: [{ l: 'commit in pg_wal', v: 'yes', cls: 'ok' }] },
        { log: 'Restart: redo replays the commit from pg_wal, so the paid order is kept.', code: 5, hl: { nodes: { wal: 'ok', bp: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'acknowledged commits lost', v: '0', cls: 'ok' }] }
      ] },
    { id: 'fsync-off', label: 'Data page before its WAL', desc: 'With fsync off, the OS can write a data page before the WAL that describes it. After a crash, redo has nothing to repair the page with.', codeLabel: 'Config',
      code: { bug: [`# postgresql.conf (illustrative, data load host)`, `fsync = off`, `-- OS writes data page 1432 to disk first (no ordering guarantee)`, `-- WAL describing that change is still in the OS cache`, `-- power cut`, `ERROR:  invalid page in block 1432 of relation base/16384/16397`],
        fix: [`# postgresql.conf (fixed)`, `fsync = on`, `-- WAL is flushed before any dirty page for it can be written`, `-- power cut after the WAL flush`, `-- redo applies the logged change and rebuilds page 1432`, `-- no invalid page error after restart`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'wal', x: 10, y: 110, w: 150, h: 60, t: 'WAL record', s: 'in OS cache' },
        { id: 'page', x: 240, y: 30, w: 170, h: 60, t: 'Data page 1432', s: 'written to disk' },
        { id: 'crash', x: 240, y: 200, w: 170, h: 60, t: 'Power cut', s: 'nothing in the log' },
        { id: 'redo', x: 470, y: 110, w: 160, h: 60, t: 'Redo', s: 'cannot repair page' }],
        edges: [ { id: 'e1', a: 'wal', b: 'page', label: 'should come first' }, { id: 'e2', a: 'page', b: 'crash', label: 'written first' }, { id: 'e3', a: 'crash', b: 'redo', label: 'after restart' }] },
      bug: [
        { log: 'A change is made to block 1432. Its WAL record is in the OS cache, not forced to disk, because fsync is off.', code: 1, hl: { nodes: { wal: 'warn' } }, stats: [{ l: 'WAL forced to disk', v: 'no', cls: 'bad' }] },
        { log: 'The OS writes the dirty data page first. The log that describes the change is still only in memory.', code: 2, hl: { nodes: { page: 'bad', wal: 'dim' }, edges: { e1: 'dim', e2: 'bad' } }, stats: [{ l: 'page on disk before its WAL', v: 'yes', cls: 'bad' }] },
        { log: 'Power is cut. The disk holds a page whose change is in no log that reached disk.', code: 4, hl: { nodes: { crash: 'bad' } }, stats: [{ l: 'redo source', v: 'missing record', cls: 'bad' }] },
        { log: 'After restart, redo cannot repair the page. The next read fails with invalid page.', code: 5, hl: { nodes: { redo: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'result', v: 'invalid page', cls: 'bad' }] }
      ],
      fix: [
        { log: 'fsync is on. The WAL record is forced to disk before the dirty page can be written.', code: 1, hl: { nodes: { wal: 'ok' } }, stats: [{ l: 'WAL forced to disk', v: 'yes', cls: 'ok' }] },
        { log: 'The data page is written only after its WAL. The log always leads the data.', code: 2, hl: { nodes: { page: 'ok' }, edges: { e1: 'ok', e2: 'dim' } }, stats: [{ l: 'page on disk before its WAL', v: 'no', cls: 'ok' }] },
        { log: 'Power is cut after the WAL flush. The log holds the change, so redo has what it needs.', code: 4, hl: { nodes: { crash: 'ok' } }, stats: [{ l: 'redo source', v: 'present', cls: 'ok' }] },
        { log: 'Redo rebuilds block 1432 from the log. The restart finishes with no invalid page error.', code: 5, hl: { nodes: { redo: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'result', v: 'consistent', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'VACUUM and the Horizon',
  problem: `The <code>orders</code> table has 20 million live rows (illustrative) and gets heavy updates. Its size on disk doubles every week while <code>count(*)</code> stays the same. Autovacuum shows up in the logs and finishes quickly each time. A reporting session has been <code>idle in transaction</code> since the morning, and the on-call engineer cannot see how that connects to table size.`,
  predict: { q: `A transaction has been idle in transaction for 6 hours. Can VACUUM remove rows that were deleted and committed 5 hours ago?`,
    opts: [`Yes: they are committed and old, so they are dead`, `No: that transaction's snapshot might still see them, so they are not removable yet`, `Yes, but only if autovacuum runs, not manual VACUUM`, `No, but only for the table it touched`], ans: 1,
    why: `A row version can be removed only when it is dead to every snapshot. The old transaction holds the xmin horizon back, so VACUUM must keep the rows. They show up as "dead but not yet removable". It is not limited to the tables the session touched.` },
  explain: `
<h3>The idea</h3>
<p>MVCC leaves old row versions behind after every update and delete. A version can be removed only when no running transaction could still need it. So garbage is defined by the oldest reader, not by the clock. VACUUM is the process that finds and reclaims these versions.</p>
<h3>How it works, step by step</h3>
<p>A <b>dead tuple</b> is a version whose deleter has committed. It stays on its page until VACUUM reclaims the space for reuse.</p>
<p>The <b>xmin horizon</b> is the oldest transaction ID that any snapshot may still need. Long transactions hold it back. So do replication slots, prepared transactions and standbys that send <code>hot_standby_feedback</code>.</p>
<p>A <b>lazy VACUUM</b> scans the heap, using the visibility map to skip pages that are all-visible. It removes dead tuples, cleans their index entries, and records free space in the free space map. Space returns to the table for reuse, but usually not to the operating system.</p>
<p><b>Autovacuum</b> starts when dead tuples exceed <code>autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * rows</code>, with defaults of 50 and 0.2.</p>
<p><b>Freezing</b> marks very old tuples so that 32-bit transaction IDs can wrap around safely. If freezing falls too far behind, the database stops accepting commands that assign new transaction IDs.</p>
<h3>The trade-off</h3>
<p>Keeping old versions makes reads and writes independent, but it costs space and vacuum work. A single old transaction, slot or prepared transaction pins the horizon for every table in the database. Autovacuum's percentage trigger is also coarse on very large tables: it waits for millions of dead rows, then has a big backlog to clear.</p>`,
  diagnose: [
    { t: `An idle-in-transaction session blocks vacuum and causes bloat`, sym: `<b>Symptom:</b> table and index size keep growing, VACUUM VERBOSE reports dead tuples that cannot be removed, and one session has an old <code>xact_start</code>.`,
      ctx: `A reporting tool opens a transaction and the user walks away (illustrative: 9 hours).`,
      why: `The session's snapshot pins the oldest xmin. Every version deleted after that point must be kept, for every table in the database, so size grows until the session ends.`,
      log: `-- representative output, values illustrative\nINFO:  finished vacuuming "public.orders"\ntuples: 0 removed, 41200000 remain, 38100000 are dead but not yet removable\nremovable cutoff: 91234001, which was 0 XIDs old when operation ended\n\napp=> SELECT pid, state, now() - xact_start AS age FROM pg_stat_activity WHERE state = 'idle in transaction';\n  pid  |        state        |   age\n-------+---------------------+----------\n  5120 | idle in transaction | 09:12:44`,
      note: `oldest xmin in the vacuum output points at the holder, and backend_xmin in pg_stat_activity shows it. Wording of the INFO line varies by version. Source: Routine vacuuming (postgresql.org/docs/current/routine-vacuuming.html).`,
      fix: [`Measure first: query <code>pg_stat_activity</code> for sessions with an old <code>xact_start</code> or <code>backend_xmin</code>.`, `Fix: set <code>idle_in_transaction_session_timeout</code> (for example a few minutes) for application roles, and fix the tool to commit or roll back.`, `Fix: terminate the holder with <code>pg_terminate_backend(pid)</code> to unblock cleanup now.`, `Verify: the next vacuum reports dead rows removed, and the table stops growing.`] },
    { t: `Autovacuum cannot keep up on a large table with the default scale factor`, sym: `<b>Symptom:</b> a big hot table bloats between rare long vacuums, and each vacuum takes hours.`,
      ctx: `The orders table has 500 million rows (illustrative) with default <code>autovacuum_vacuum_scale_factor = 0.2</code>.`,
      why: `The trigger is a fraction of the table, so for a huge table it waits for tens of millions of dead rows. The vacuum that follows has a huge backlog and is also paced by the cost-based delay.`,
      log: `-- representative output, values illustrative\napp=> SELECT relname, n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables WHERE relname = 'orders';\n relname | n_live_tup | n_dead_tup | last_autovacuum\n---------+------------+------------+---------------------\n orders  |  500000000 |   96000000 | 2026-10-05 03:12:09\n\n-- trigger = 50 + 0.2 * 500000000 = about 100 million dead rows`,
      note: `Compare n_dead_tup against the trigger formula. Defaults are in the docs. Source: The autovacuum daemon (postgresql.org/docs/current/routine-vacuuming.html).`,
      fix: [`Measure first: track <code>n_dead_tup</code> and <code>last_autovacuum</code> for the biggest tables.`, `Fix: set per-table options, for example <code>ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01)</code>.`, `Fix: if vacuum is too slow, raise <code>autovacuum_vacuum_cost_limit</code> (or lower <code>autovacuum_vacuum_cost_delay</code>) and make sure <code>autovacuum_max_workers</code> is sufficient. Trade-off: more I/O.`, `Verify: dead tuples stay near the new threshold and each run finishes in minutes.`] },
    { t: `The wraparound guard stops writes`, sym: `<b>Symptom:</b> first warnings about vacuuming within N transactions, then writes fail with <code>database is not accepting commands</code>.`,
      ctx: `A large table was excluded from autovacuum by a per-table setting, and a blocked autovacuum never advanced the frozen horizon (illustrative).`,
      why: `Transaction IDs are 32 bits and compared in a circle. Tuples must be frozen before they are about 2 billion transactions old, or old rows would appear to be in the future. Near the limit PostgreSQL refuses new transaction IDs to protect the data.`,
      log: `-- representative output, values illustrative\nWARNING:  database "app" must be vacuumed within 9985967 transactions\nHINT:  To avoid a database shutdown, execute a database-wide VACUUM in that database.\n...\nERROR:  database is not accepting commands that assign new transaction IDs to avoid wraparound data loss in database "app"`,
      note: `Wording varies by version (older releases omit "that assign new transaction IDs"). Track age(datfrozenxid) per database to see it coming. Source: Preventing transaction ID wraparound failures (postgresql.org/docs/current/routine-vacuuming.html).`,
      fix: [`Measure first: <code>SELECT datname, age(datfrozenxid) FROM pg_database</code> and the same for <code>relfrozenxid</code> per table.`, `Fix: remove the holders (old transactions, slots, prepared transactions), then run <code>VACUUM (FREEZE)</code> on the oldest tables, in single-user mode if the server already refuses writes.`, `Fix: re-enable autovacuum on the excluded table and keep <code>autovacuum_freeze_max_age</code> at a sensible value.`, `Verify: <code>age(datfrozenxid)</code> falls well below <code>autovacuum_freeze_max_age</code> and an alert watches it.`] },
    { t: `An abandoned replication slot or prepared transaction holds the horizon`, sym: `<b>Symptom:</b> bloat and a stuck horizon with no visible long session in <code>pg_stat_activity</code>.`,
      ctx: `A decommissioned analytics consumer left a replication slot behind, and an old <code>PREPARE TRANSACTION</code> from a failed coordinator was never resolved (illustrative).`,
      why: `A slot keeps xmin or catalog_xmin back so the consumer can still read old rows, and a prepared transaction keeps its snapshot until committed or rolled back. Both hold the horizon like a long session, and neither shows up as a normal backend.`,
      log: `-- representative output, values illustrative\napp=> SELECT slot_name, active, xmin, catalog_xmin FROM pg_replication_slots;\n slot_name | active |  xmin   | catalog_xmin\n-----------+--------+---------+--------------\n analytics | f      |         | 88123456\n\napp=> SELECT gid, prepared, owner FROM pg_prepared_xacts;\n  gid  |           prepared            | owner\n-------+-------------------------------+-------\n tx-77 | 2026-09-30 11:04:12+00        | app`,
      note: `Check both views whenever the horizon is stuck and no session explains it. Source: pg_replication_slots (postgresql.org/docs/current/view-pg-replication-slots.html).`,
      fix: [`Measure first: check <code>pg_replication_slots</code>, <code>pg_prepared_xacts</code> and <code>backend_xmin</code> in <code>pg_stat_activity</code>.`, `Fix: drop unused slots with <code>pg_drop_replication_slot('name')</code> after confirming the consumer is gone.`, `Fix: resolve prepared transactions with <code>COMMIT PREPARED 'gid'</code> or <code>ROLLBACK PREPARED 'gid'</code>.`, `Verify: the horizon moves and the next vacuum reports removable rows.`] }
  ],
  source: { label: 'Original: VACUUM and the Horizon', href: '01-postgres-internals-end-to-end.html#ch6' },
  scenarios: [
    { id: 'horizon', label: 'Idle session pins horizon', desc: 'An idle-in-transaction session holds an old snapshot. VACUUM runs, but it cannot remove any row deleted after that snapshot.', codeLabel: 'SQL',
      code: { bug: [`-- reporting tool (illustrative): transaction opened at 05:00, user left`, `BEGIN;`, `SELECT count(*) FROM orders WHERE status = 'paid';`, `-- state: idle in transaction, snapshot still held`, `VACUUM VERBOSE orders;`, `-- 38100000 are dead but not yet removable`],
        fix: [`SET idle_in_transaction_session_timeout = '5min';  -- illustrative value`, `BEGIN;`, `SELECT count(*) FROM orders WHERE status = 'paid';`, `COMMIT;  -- snapshot released, horizon can move`, `VACUUM VERBOSE orders;`, `-- dead rows behind the horizon are removed`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'holder', x: 10, y: 110, w: 160, h: 60, t: 'Idle session', s: 'idle in transaction' },
        { id: 'horizon', x: 250, y: 110, w: 170, h: 60, t: 'xmin horizon', s: 'held back 9 h' },
        { id: 'vac', x: 480, y: 30, w: 140, h: 60, t: 'VACUUM', s: 'removes dead rows' },
        { id: 'dead', x: 480, y: 200, w: 140, h: 60, t: 'Dead tuples', s: '38 M kept' }],
        edges: [ { id: 'e1', a: 'holder', b: 'horizon', label: 'pins xmin' }, { id: 'e2', a: 'horizon', b: 'vac', label: 'limit' }, { id: 'e3', a: 'vac', b: 'dead', label: 'newer: kept' }, { id: 'e4', a: 'horizon', b: 'dead', label: 'keeps' }] },
      bug: [
        { log: 'A reporting session opened a transaction at 05:00 and the user left. The session is idle in transaction, but its snapshot is still open.', code: 1, hl: { nodes: { holder: 'bad' } }, stats: [{ l: 'session age', v: '9 h 12 min (illustrative)', cls: 'bad' }] },
        { log: 'The snapshot pins the xmin horizon at the point where it started. The horizon cannot move past that point.', code: 3, hl: { nodes: { horizon: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'horizon', v: 'stuck 9 h ago', cls: 'bad' }] },
        { log: 'VACUUM runs, but it may remove only versions older than the horizon. Every row deleted after that point is kept.', code: 4, hl: { nodes: { vac: 'warn', dead: 'bad' }, edges: { e2: 'on', e3: 'bad' } }, stats: [{ l: 'dead but not removable', v: '38,100,000 (illustrative)', cls: 'bad' }] },
        { log: 'The table keeps growing, even though autovacuum runs and finishes quickly each time.', code: 5, hl: { nodes: { dead: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'table size vs live data', v: '2.1x (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The idle session is ended by its timeout, or it commits. Either way its snapshot is released.', code: 0, hl: { nodes: { holder: 'ok' }, edges: { e1: 'dim' } }, stats: [{ l: 'session age', v: '0 (ended)', cls: 'ok' }] },
        { log: 'The xmin horizon advances with the clock, so older dead versions fall behind it.', code: 3, hl: { nodes: { horizon: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'horizon', v: 'advances', cls: 'ok' }] },
        { log: 'VACUUM removes every dead row behind the new horizon, and it records the free space for reuse.', code: 4, hl: { nodes: { vac: 'ok', dead: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'dead rows removed', v: 'most (illustrative)', cls: 'ok' }] },
        { log: 'The table stops growing and stays close to the size of its live data.', code: 5, hl: { nodes: { dead: 'dim' }, edges: { e4: 'dim' } }, stats: [{ l: 'table size vs live data', v: '1.1x (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'trigger', label: 'Autovacuum trigger math', desc: 'The autovacuum trigger is a fraction of the table. On a huge table it waits for about 100 million dead rows, then has a big backlog to clear.', codeLabel: 'Formula',
      code: { bug: [`-- trigger = 50 + 0.2 * 500000000 = about 100 million dead rows`, `SELECT relname, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'orders';`, ` orders  |  500000000 |   96000000`, `-- 96 M dead: still below the trigger, so no autovacuum yet`, `-- the next run starts only after the trigger, with a large backlog`],
        fix: [`ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);`, `-- trigger = 50 + 0.01 * 500000000 = about 5 million dead rows`, `-- n_dead_tup now stays near the trigger`, `-- each vacuum run is short and frequent`, `-- backlog stays small, table size stays close to live data`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'rows', x: 10, y: 110, w: 150, h: 60, t: 'Live rows', s: '500 M (illustrative)' },
        { id: 'dead', x: 230, y: 30, w: 170, h: 60, t: 'Dead rows', s: 'grow with updates' },
        { id: 'trig', x: 230, y: 200, w: 170, h: 60, t: 'Trigger', s: 'threshold + factor' },
        { id: 'av', x: 460, y: 110, w: 160, h: 60, t: 'Autovacuum', s: 'runs at trigger' }],
        edges: [ { id: 'e1', a: 'rows', b: 'dead', label: 'updates add dead' }, { id: 'e2', a: 'dead', b: 'trig', label: 'compare' }, { id: 'e3', a: 'trig', b: 'av', label: 'fires late' }] },
      bug: [
        { log: 'Autovacuum waits for a trigger that is a fraction of the table. With 500 million rows, the trigger is about 100 million dead rows.', code: 0, hl: { nodes: { rows: 'on', trig: 'warn' } }, stats: [{ l: 'trigger (illustrative)', v: 'about 100 M dead rows', cls: 'warn' }] },
        { log: 'Updates keep adding dead row versions. The count reaches 96 M and still sits below the trigger, so nothing runs.', code: 2, hl: { nodes: { dead: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'dead rows', v: '96 M (illustrative)', cls: 'warn' }] },
        { log: 'When the trigger finally fires, the backlog is huge, and the cost-based delay paces the work slowly.', code: 4, hl: { nodes: { av: 'bad', dead: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'vacuum run', v: 'rare and long (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A per-table scale factor of 0.01 lowers the trigger for this table only.', code: 0, hl: { nodes: { trig: 'ok' } }, stats: [{ l: 'trigger (illustrative)', v: 'about 5 M dead rows', cls: 'ok' }] },
        { log: 'Dead rows never grow far past the new trigger, so vacuum starts while its backlog is still small.', code: 3, hl: { nodes: { dead: 'ok' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'dead rows', v: 'about 5 M (illustrative)', cls: 'ok' }] },
        { log: 'Each run is short and frequent. The table size stays close to its live data.', code: 4, hl: { nodes: { av: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'table size vs live data', v: '1.1x (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Planner and Statistics',
  problem: `At 02:00 a loader appends 2 million rows to <code>orders</code> for a new tenant (illustrative). By 08:00 the dashboard query that joins <code>orders</code> to <code>customers</code> takes 5 minutes (illustrative), where it took 5 ms before. Nothing changed in the query, the indexes or the config. <code>EXPLAIN ANALYZE</code> shows <code>rows=10</code> estimated and <code>rows=2000000</code> actual on the first node.`,
  predict: { q: `Statistics say 10 rows match, but 2 million really do. Which join method is the planner likely to choose?`,
    opts: [`Hash join, because it is always fastest`, `Nested loop, because it is cheapest for very few outer rows`, `Merge join, because the inputs are large`, `It will refuse and ask for fresh statistics`], ans: 1,
    why: `A nested loop repeats an index probe per outer row, which is ideal for 10 rows and disastrous for 2 million. A hash join costs more up front but scales. The planner picks the cheapest plan for the estimate it believes.` },
  explain: `
<h3>The idea</h3>
<p>The planner does not run a query to decide how to run it. It estimates how many rows each step will return, prices each candidate plan, and picks the cheapest one. Every decision depends on those row estimates, which come from statistics collected by <code>ANALYZE</code>.</p>
<h3>How it works, step by step</h3>
<p><code>ANALYZE</code> samples each table and stores per-column statistics in <code>pg_statistic</code> (shown in the <code>pg_stats</code> view). They include the null fraction, <code>n_distinct</code>, the most common values and a histogram. The sample size is set by <code>default_statistics_target</code>, which defaults to 100.</p>
<p><b>Selectivity</b> is the fraction of rows a predicate keeps. The planner estimates it from those statistics and multiplies the selectivities of several predicates, as if the columns were independent.</p>
<p><b>Cost</b> is a sum of sequential and random page costs plus CPU costs per row. The planner prices each join method (nested loop, hash, merge) and keeps the cheapest.</p>
<p><b>Extended statistics</b> (<code>CREATE STATISTICS</code>) record dependencies between columns, so the planner stops multiplying correlated predicates.</p>
<p><b>Plan cache</b>: a prepared statement first runs custom plans, one per parameter value. Under the default rules it may then switch to a generic plan that ignores the parameter value. <code>plan_cache_mode</code> controls this.</p>
<h3>The trade-off</h3>
<p>Statistics are cheap, but they are sampled and they go stale after a large change. Autovacuum re-analyzes a table only after <code>autovacuum_analyze_scale_factor</code> (default 0.1) of it has changed. Independence and averages are simplifications. When an estimate is far off, the planner confidently picks a plan that does not scale. Check estimated against actual rows first.</p>`,
  diagnose: [
    { t: `Stale statistics after a bulk load`, sym: `<b>Symptom:</b> a query becomes slow right after a big load, with estimated rows far below actual rows on the first node.`,
      ctx: `A loader inserts 20% more rows into a table, or a skewed tenant, and autoanalyze has not run yet (illustrative).`,
      why: `Estimates come from the last ANALYZE. Autovacuum analyzes after autovacuum_analyze_scale_factor (default 0.1) of the table changed, which on a big table can lag behind a load.`,
      log: `-- representative output, values illustrative\n Nested Loop (cost=0.86..45.10 rows=10 width=64) (actual time=0.05..296000.1 rows=2000000 loops=1)\n   ->  Index Scan using orders_tenant_idx on orders (rows=10) (actual rows=2000000)\napp=> SELECT relname, last_analyze, last_autoanalyze FROM pg_stat_user_tables WHERE relname='orders';\n  -- last_autoanalyze is older than the load`,
      note: `Compare rows= estimated against actual rows= on the same node. Source: Updating planner statistics (postgresql.org/docs/current/routine-vacuuming.html).`,
      fix: [`Measure first: read estimated and actual <code>rows</code> in <code>EXPLAIN (ANALYZE)</code> and <code>last_autoanalyze</code> in <code>pg_stat_user_tables</code>.`, `Fix: run <code>ANALYZE orders</code> now, and run it at the end of the load job.`, `Fix: lower <code>autovacuum_analyze_scale_factor</code> for big tables, per table.`, `Verify: estimated and actual rows are within a small factor and the plan switches to a hash join.`] },
    { t: `Correlated columns are misestimated`, sym: `<b>Symptom:</b> estimates are off by 10x to 1000x for a filter on two related columns, while each column alone is estimated well.`,
      ctx: `A query filters <code>country = 'VN' AND currency = 'VND'</code> (illustrative). Almost every VN row has currency VND.`,
      why: `The planner multiplies the two selectivities as if the columns were independent. When one column determines the other, the product is far smaller than the truth, so the estimate is too low.`,
      log: `-- representative output, values illustrative\n Index Scan using orders_country_idx on orders (cost=0.43..812.0 rows=1200 width=64) (actual rows=3400000 loops=1)\n   Index Cond: (country = 'VN'::text)\n   Filter: (currency = 'VND'::text)`,
      note: `Each predicate alone is estimated accurately. Together they are not. Source: CREATE STATISTICS (postgresql.org/docs/current/sql-createstatistics.html).`,
      fix: [`Measure first: run <code>EXPLAIN (ANALYZE)</code> with each predicate alone and with both, and compare estimates.`, `Fix: <code>CREATE STATISTICS orders_cc (dependencies, mcv) ON country, currency FROM orders;</code> then <code>ANALYZE orders</code>.`, `Fix: if one value is an outlier, raise the statistics target for that column with <code>ALTER TABLE ... ALTER COLUMN ... SET STATISTICS</code>.`, `Verify: the combined estimate matches the actual rows within a small factor.`] },
    { t: `A generic plan is chosen for a skewed parameter after five executions`, sym: `<b>Symptom:</b> a prepared query is fast at first and becomes slow for large customers from the sixth execution onward.`,
      ctx: `The API runs <code>SELECT * FROM orders WHERE customer_id = $1</code> through a driver that prepares statements. Customer sizes are heavily skewed (illustrative).`,
      why: `A generic plan is built without knowing the parameter, so it uses an average estimate. PostgreSQL uses custom plans for the first five executions and may then switch to the generic plan if it does not look worse on average, which can be a poor plan for a huge customer.`,
      log: `-- representative output, values illustrative\napp=> EXPLAIN (ANALYZE) EXECUTE q(1042);\n Index Scan using orders_customer_idx on orders (cost=0.43..120.5 rows=200 width=64) (actual rows=2400000 loops=1)\n   Index Cond: (customer_id = $1)\n-- "$1" in the Index Cond is the sign of a generic plan`,
      note: `A parameter shown as $1 in a plan means a generic plan. Since PostgreSQL 16 you can also inspect it with EXPLAIN (GENERIC_PLAN). Source: PREPARE, generic and custom plans (postgresql.org/docs/current/sql-prepare.html).`,
      fix: [`Measure first: look for <code>$1</code> in <code>EXPLAIN</code> output and compare latency before and after the fifth call.`, `Fix: <code>SET plan_cache_mode = force_custom_plan</code> for the role or session (<code>ALTER ROLE api SET plan_cache_mode = force_custom_plan</code>).`, `Fix: or disable server-side prepared statements in the driver for this query.`, `Verify: latency for large customers no longer jumps after the fifth execution.`] }
  ],
  source: { label: 'Original: Planner and Statistics', href: '01-postgres-internals-end-to-end.html#ch7' },
  scenarios: [
    { id: 'stale-stats', label: 'Stale stats after load', desc: 'The statistics describe the table before the load. The planner expects 10 rows, picks a nested loop, and the loop runs 2 million times.', codeLabel: 'Plan',
      code: { bug: [`-- loader added 2,000,000 rows for one tenant at 02:00 (illustrative)`, `SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.tenant_id = 77;`, ` Nested Loop (cost=0.86..45.10 rows=10 width=64) (actual time=0.05..296000.1 rows=2000000 loops=1)`, `   ->  Index Scan using orders_tenant_idx on orders (rows=10) (actual rows=2000000)`, `-- last_autoanalyze is older than the load`],
        fix: [`-- loader: run ANALYZE at the end of the job (illustrative)`, `ANALYZE orders;`, ` Hash Join (actual rows=2000000 loops=1)`, `-- estimate and actual now agree, so the join method scales`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'loader', x: 10, y: 140, w: 150, h: 60, t: 'Bulk load', s: '2 M rows at 02:00' },
        { id: 'an', x: 10, y: 30, w: 150, h: 60, t: 'ANALYZE', s: 'samples the table' },
        { id: 'stats', x: 240, y: 30, w: 170, h: 60, t: 'pg_statistic', s: 'rows = 10 (old)' },
        { id: 'planner', x: 240, y: 200, w: 170, h: 60, t: 'Planner', s: 'picks join method' },
        { id: 'plan', x: 470, y: 115, w: 160, h: 70, t: 'Chosen plan', s: 'join method' }],
        edges: [ { id: 'e1', a: 'loader', b: 'an', label: 'run ANALYZE' }, { id: 'e2', a: 'an', b: 'stats', label: 'writes stats' }, { id: 'e3', a: 'stats', b: 'planner', label: 'reads estimate' }, { id: 'e4', a: 'planner', b: 'plan', label: 'cheapest' }, { id: 'e5', a: 'loader', b: 'stats', label: 'no ANALYZE yet' }] },
      bug: [
        { log: 'The loader adds 2 million rows for one tenant. Nothing tells the planner that the table changed.', code: 0, hl: { nodes: { loader: 'warn' }, edges: { e5: 'bad' } }, stats: [{ l: 'rows added', v: '2,000,000 (illustrative)', cls: 'warn' }] },
        { log: 'The statistics still describe the old table. For this tenant the planner reads an estimate of 10 rows.', code: 3, hl: { nodes: { stats: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'estimated rows', v: '10', cls: 'bad' }, { l: 'actual rows', v: '2,000,000', cls: 'warn' }] },
        { log: 'With 10 rows expected, the planner picks a Nested Loop that probes the index once per outer row.', code: 2, hl: { nodes: { planner: 'bad', plan: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'join method', v: 'nested loop', cls: 'bad' }] },
        { log: 'The index probe runs 2 million times instead of 10. The query takes minutes instead of milliseconds (illustrative).', code: 2, hl: { nodes: { plan: 'bad' } }, stats: [{ l: 'runtime', v: '5 min (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'ANALYZE reads a fresh sample of the table and writes new statistics into pg_statistic.', code: 1, hl: { nodes: { an: 'ok' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'statistics age', v: '0 (just ran)', cls: 'ok' }] },
        { log: 'The planner now reads the real row count for this tenant.', code: 3, hl: { nodes: { stats: 'ok', planner: 'ok' }, edges: { e3: 'ok', e5: 'dim' } }, stats: [{ l: 'estimated rows', v: '2,000,000', cls: 'ok' }] },
        { log: 'Estimated and actual rows agree, so the planner chooses a hash join. Its cost grows with the data, not with the number of probes.', code: 2, hl: { nodes: { plan: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'join method', v: 'hash join', cls: 'ok' }] }
      ] },
    { id: 'correlated', label: 'Correlated filters', desc: 'Two predicates on related columns are multiplied as if independent. The estimate is about 3x too low. Extended statistics teach the planner the dependency.', codeLabel: 'SQL',
      code: { bug: [`-- country = 'VN' almost always has currency = 'VND' (illustrative)`, `SELECT * FROM orders WHERE country = 'VN' AND currency = 'VND';`, ` Index Scan using orders_country_idx on orders (rows=1200) (actual rows=3400000 loops=1)`, `   Index Cond: (country = 'VN'::text)`, `   Filter: (currency = 'VND'::text)`],
        fix: [`CREATE STATISTICS orders_cc (dependencies, mcv) ON country, currency FROM orders;`, `ANALYZE orders;`, `SELECT * FROM orders WHERE country = 'VN' AND currency = 'VND';`, `-- estimate now close to actual rows (illustrative)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'sc', x: 10, y: 40, w: 150, h: 60, t: 'country = VN', s: 'sel 30% (illustr.)' },
        { id: 'scy', x: 10, y: 200, w: 150, h: 60, t: 'currency = VND', s: 'sel 30% (illustr.)' },
        { id: 'mult', x: 240, y: 120, w: 170, h: 60, t: 'Planner', s: '0.3 x 0.3 = 9%' },
        { id: 'truth', x: 480, y: 40, w: 150, h: 60, t: 'Actual rows', s: '30% (illustrative)' },
        { id: 'ext', x: 480, y: 200, w: 150, h: 60, t: 'Extended stats', s: 'dependencies, mcv' }],
        edges: [ { id: 'e1', a: 'sc', b: 'mult', label: 'independent' }, { id: 'e2', a: 'scy', b: 'mult', label: 'independent' }, { id: 'e3', a: 'mult', b: 'truth', label: 'estimate 9%' }, { id: 'e4', a: 'ext', b: 'mult', label: 'refines' }] },
      bug: [
        { log: 'Each predicate on its own is estimated well: about 30% of rows for country, and about 30% for currency.', code: 1, hl: { nodes: { sc: 'ok', scy: 'ok' } }, stats: [{ l: 'sel(country)', v: '30%', cls: 'ok' }, { l: 'sel(currency)', v: '30%', cls: 'ok' }] },
        { log: 'The planner multiplies them as if they were independent: 0.3 x 0.3 = 9%, and it estimates 1200 rows.', code: 2, hl: { nodes: { mult: 'bad' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'estimated share', v: '9%', cls: 'bad' }] },
        { log: 'Almost every VN row also has VND, so the real share is about 30%. The estimate is too low by about 3x.', code: 2, hl: { nodes: { truth: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'estimate / actual', v: '0.3x (illustrative)', cls: 'bad' }] },
        { log: 'The planner picks an Index Scan on country for the few rows it expects, then reads far more rows than that.', code: 4, hl: { nodes: { mult: 'warn' } }, stats: [{ l: 'rows read by scan', v: '3.4 M (illustrative)', cls: 'warn' }] }
      ],
      fix: [
        { log: 'CREATE STATISTICS records that currency depends on country, and it stores common value pairs.', code: 0, hl: { nodes: { ext: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'extended stats', v: 'dependencies, mcv', cls: 'ok' }] },
        { log: 'ANALYZE samples the table again, so the new statistics are filled in.', code: 1, hl: { nodes: { ext: 'ok' } }, stats: [{ l: 'statistics age', v: '0 (just ran)', cls: 'ok' }] },
        { log: 'The planner uses the dependency instead of multiplying, so its estimate is close to the actual share.', code: 3, hl: { nodes: { mult: 'ok', truth: 'ok' }, edges: { e1: 'dim', e2: 'dim', e3: 'ok' } }, stats: [{ l: 'estimate / actual', v: '1.0x (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Sort and Hash Join under work_mem',
  problem: `A nightly report sorts about 400 MB of intermediate rows (illustrative) and joins them to a large table. The server runs with <code>work_mem = 4MB</code>, the default. The report is slow, and the temporary file volume in <code>pgsql_tmp</code> is large. A teammate suggests raising <code>work_mem</code> to 2 GB for the whole server, and another warns that the last time someone did, the kernel killed the database.`,
  predict: { q: `<code>work_mem = 4MB</code> and the sort input is 400 MB. What does <code>EXPLAIN (ANALYZE)</code> show for the Sort node?`,
    opts: [`An error: out of memory`, `<code>Sort Method: quicksort  Memory: 4096kB</code>`, `<code>Sort Method: external merge  Disk: ...kB</code>`, `Nothing: sorts never use disk`], ans: 2,
    why: `When the input exceeds work_mem, PostgreSQL sorts memory-sized runs, writes them to temporary files and merges them. The plan shows external merge with the disk size used. The query succeeds, only slower.` },
  explain: `
<h3>The idea</h3>
<p>Data is often larger than memory, but a query must still return a correct answer. PostgreSQL gives each sort or hash operation a fixed memory budget, <code>work_mem</code>. When the input is larger than the budget, the operation breaks the work into pieces, writes the pieces to disk, and combines them.</p>
<h3>How it works, step by step</h3>
<p><code>work_mem</code> is the budget for each sort or hash operation. It is not a budget per query or per server. One query can have several such nodes, and each parallel worker gets its own budget.</p>
<p><b>External merge sort</b>: the sort fills memory and writes a sorted run to a temporary file. It repeats until the input is read, then merges the runs. A merge reads a bounded number of runs at once, so a very large sort may need extra passes.</p>
<p><b>Hash join batches</b>: if the build side is larger than the hash budget (<code>work_mem * hash_mem_multiplier</code>), both inputs are split into batches on disk. The join then runs one batch at a time.</p>
<p><b>Temp files</b> count against <code>temp_file_limit</code> if it is set. They are logged when <code>log_temp_files</code> is enabled.</p>
<p>Total memory is roughly <code>work_mem</code> times the number of memory-hungry nodes times the number of concurrent sessions. That product is why the safe server-wide value is small.</p>
<h3>The trade-off</h3>
<p>A large <code>work_mem</code> keeps sorts and hashes in memory and removes disk I/O. A small one protects the host from memory overcommit, at the cost of spilling. Raise it per role or per transaction for the few queries that need it, and fix the estimate or the index that causes the large sort.</p>`,
  diagnose: [
    { t: `A sort spills to disk (external merge)`, sym: `<b>Symptom:</b> a report is slow, disk write bursts appear, and <code>EXPLAIN (ANALYZE)</code> prints <code>Sort Method: external merge</code>.`,
      ctx: `A report sorts about 400 MB with <code>work_mem = 4MB</code> (illustrative).`,
      why: `The input does not fit in the per-node memory budget, so PostgreSQL writes sorted runs to temp files and merges them. Disk I/O dominates the runtime.`,
      log: `-- representative output, values illustrative\n Sort (actual time=9120.3..10440.8 rows=4000000 loops=1)\n   Sort Key: customer_id, created_at\n   Sort Method: external merge  Disk: 409600kB\n   ->  Seq Scan on staging_orders (actual rows=4000000)`,
      note: `Disk: 409600kB is temporary file space used by this sort. Source: Resource consumption, work_mem (postgresql.org/docs/current/runtime-config-resource.html).`,
      fix: [`Measure first: enable <code>log_temp_files = 0</code> or read <code>Sort Method</code> in <code>EXPLAIN (ANALYZE)</code>.`, `Fix: for just this report, <code>SET LOCAL work_mem = '512MB'</code> inside its transaction.`, `Fix: remove the sort with an index that matches the ORDER BY, or reduce rows before sorting.`, `Verify: <code>Sort Method</code> becomes <code>quicksort</code> and temp file volume falls.`] },
    { t: `A hash join runs with many batches`, sym: `<b>Symptom:</b> a join that used to take seconds takes minutes, and the Hash node shows <code>Batches: 16</code> or more.`,
      ctx: `The planner expected a small build side but 6 GB arrived (illustrative).`,
      why: `The number of batches is chosen from the estimated size of the build side. If the real size is much larger, the join spills batches to disk. A bad estimate and too little memory combine.`,
      log: `-- representative output, values illustrative\n Hash Join (actual time=3105.2..14870.0 rows=52000000 loops=1)\n   ->  Hash (actual time=3090.0..3090.0 rows=60000000 loops=1)\n         Buckets: 1048576  Batches: 64  Memory Usage: 4096kB`,
      note: `Batches: 64 means 63 of 64 parts of both inputs went to temp files. Default hash_mem_multiplier is 2.0 from PostgreSQL 15 (1.0 before). Source: Resource consumption, hash_mem_multiplier (postgresql.org/docs/current/runtime-config-resource.html).`,
      fix: [`Measure first: read <code>Batches</code> and <code>Memory Usage</code> on the Hash node, and compare estimated and actual rows.`, `Fix: correct the estimate first with <code>ANALYZE</code> or extended statistics, so the planner picks a sensible join and size.`, `Fix: raise <code>work_mem</code> or <code>hash_mem_multiplier</code> for this query only.`, `Verify: <code>Batches: 1</code> or a much smaller count, and shorter runtime.`] },
    { t: `work_mem times nodes times connections triggers the OOM killer`, sym: `<b>Symptom:</b> at peak traffic a backend dies with <code>terminated by signal 9: Killed</code> and PostgreSQL restarts every connection.`,
      ctx: `Someone raised <code>work_mem</code> to 256 MB for the whole server, with 300 connections and queries that have 3 sort or hash nodes (illustrative: potential 225 GB on a 64 GB host).`,
      why: `Each memory-hungry node in each session may use up to work_mem, so total memory is the product, not the parameter. When the host runs out the kernel OOM killer picks a backend, and the postmaster restarts all of them for safety.`,
      log: `-- representative output, values illustrative\nLOG:  server process (PID 2481) was terminated by signal 9: Killed\nDETAIL:  Failed process was running: SELECT ... ORDER BY ...\nLOG:  terminating any other active server processes\n\n-- kernel log (dmesg):\nOut of memory: Killed process 2481 (postgres)`,
      note: `Check the kernel log to confirm it was the OOM killer. The docs recommend disabling memory overcommit on dedicated database hosts. Source: Linux memory overcommit (postgresql.org/docs/current/kernel-resources.html).`,
      fix: [`Measure first: compute connections times plan nodes times <code>work_mem</code>, and read <code>dmesg</code> for OOM entries.`, `Fix: keep global <code>work_mem</code> modest and raise it with <code>SET LOCAL</code> or <code>ALTER ROLE</code> for reporting roles only.`, `Fix: cap concurrency with a connection pooler so connection count is bounded.`, `Fix: on dedicated hosts consider <code>vm.overcommit_memory = 2</code> with a suitable ratio, as the docs describe.`, `Verify: no OOM kills under a peak-load test, and memory stays under the host limit.`] },
    { t: `temporary file size exceeds temp_file_limit`, sym: `<b>Symptom:</b> a large report fails mid-way with <code>temporary file size exceeds temp_file_limit</code> although the data is correct.`,
      ctx: `An operator set <code>temp_file_limit = 1GB</code> to protect the disk (illustrative), and a report legitimately needs more.`,
      why: `The limit is a hard cap per process on the disk space of temporary files. A sort or hash that spills beyond it is cancelled, so the limit protects the disk but turns large spills into errors.`,
      log: `-- representative output, values illustrative\nERROR:  temporary file size exceeds temp_file_limit (1048576kB)\nSTATEMENT:  SELECT ... ORDER BY ...`,
      note: `The value in parentheses is the configured limit in kB. Source: Resource consumption, temp_file_limit (postgresql.org/docs/current/runtime-config-resource.html).`,
      fix: [`Measure first: set <code>log_temp_files = 0</code> and find the largest temp files per query.`, `Fix: raise <code>temp_file_limit</code> for the reporting role only (superuser-set, per role or per session).`, `Fix: shrink the spill itself by adding an index, filtering earlier or giving the query more <code>work_mem</code>.`, `Verify: the report finishes and total <code>pgsql_tmp</code> use stays below disk capacity.`] }
  ],
  source: { label: 'Original: Sort and Hash Join under work_mem', href: '01-postgres-internals-end-to-end.html#ch8' },
  scenarios: [
    { id: 'spill', label: 'Sort spills to disk', desc: 'The sort input is about 400 MB, but work_mem allows 4 MB. The sort writes sorted runs to temp files and merges them. The query succeeds, only slower.', codeLabel: 'Plan',
      code: { bug: [` Sort (actual time=9120.3..10440.8 rows=4000000 loops=1)`, `   Sort Key: customer_id, created_at`, `   Sort Method: external merge  Disk: 409600kB`, `   ->  Seq Scan on staging_orders (actual rows=4000000)`, `-- work_mem = 4MB per sort node (input about 400 MB, illustrative)`],
        fix: [`SET LOCAL work_mem = '512MB';  -- inside this report's transaction`, ` Sort (actual rows=4000000 loops=1)`, `   Sort Method: quicksort  Memory: 409600kB`, `   ->  Seq Scan on staging_orders (actual rows=4000000)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'in', x: 10, y: 110, w: 130, h: 60, t: 'Input rows', s: 'about 400 MB' },
        { id: 'mem', x: 190, y: 110, w: 130, h: 60, t: 'work_mem', s: 'sort one run' },
        { id: 'tmp', x: 370, y: 30, w: 140, h: 60, t: 'Temp files', s: 'sorted runs' },
        { id: 'mg', x: 370, y: 200, w: 140, h: 60, t: 'Merge', s: 'reads runs back' },
        { id: 'out', x: 530, y: 110, w: 100, h: 60, t: 'Output', s: 'sorted rows' }],
        edges: [ { id: 'e1', a: 'in', b: 'mem', label: 'fill' }, { id: 'e2', a: 'mem', b: 'tmp', label: 'spill run' }, { id: 'e3', a: 'tmp', b: 'mg', label: 'read back' }, { id: 'e4', a: 'mg', b: 'out', label: 'merge' }, { id: 'e5', a: 'mem', b: 'out', label: 'fits in memory' }] },
      bug: [
        { log: 'The sort receives about 400 MB of rows, but work_mem gives this node 4 MB.', code: 4, hl: { nodes: { in: 'warn', mem: 'warn' } }, stats: [{ l: 'work_mem', v: '4 MB', cls: 'warn' }, { l: 'input', v: 'about 400 MB (illustrative)', cls: 'bad' }] },
        { log: 'When memory is full, the sort writes a sorted run to a temp file and starts again with the next rows.', code: 2, hl: { nodes: { mem: 'bad', tmp: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'runs written', v: 'about 100 (illustrative)', cls: 'bad' }] },
        { log: 'After the input is read, the runs are merged back from disk. Every row is written once and read back.', code: 2, hl: { nodes: { tmp: 'bad', mg: 'bad' }, edges: { e3: 'bad', e4: 'warn' } }, stats: [{ l: 'Disk used by sort', v: '409600 kB', cls: 'bad' }] },
        { log: 'The sort finishes after most of its time went to disk I/O. The report is correct, but it is slow.', code: 0, hl: { nodes: { out: 'warn' } }, stats: [{ l: 'sort time', v: '10.4 s (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'SET LOCAL applies only to this transaction. The rest of the server keeps its small default.', code: 0, hl: { nodes: { mem: 'ok' } }, stats: [{ l: 'work_mem for this report', v: '512 MB (illustrative)', cls: 'ok' }] },
        { log: 'The input fits in one memory-sized run. No temp file is written.', code: 2, hl: { nodes: { mem: 'ok' }, edges: { e5: 'ok', e2: 'dim', e3: 'dim' } }, stats: [{ l: 'temp bytes written', v: '0', cls: 'ok' }] },
        { log: 'The sort returns sorted rows straight from memory.', code: 1, hl: { nodes: { out: 'ok', tmp: 'dim', mg: 'dim' }, edges: { e4: 'dim', e5: 'ok' } }, stats: [{ l: 'sort method', v: 'quicksort in memory', cls: 'ok' }] }
      ] },
    { id: 'oom', label: 'Budget multiplies', desc: 'work_mem is a budget per sort or hash node, per session. Raised for the whole server, the total can exceed the host memory.', codeLabel: 'Config',
      code: { bug: [`# postgresql.conf (illustrative: raised for the whole server)`, `work_mem = 256MB`, `-- 300 connections x 3 sort or hash nodes x 256 MB = 225 GB (illustrative)`, `LOG:  server process (PID 2481) was terminated by signal 9: Killed`, `Out of memory: Killed process 2481 (postgres)`],
        fix: [`# postgresql.conf: keep the default small`, `work_mem = 8MB`, `ALTER ROLE reporting SET work_mem = '256MB';  -- reporting role only`, `-- 300 sessions x 3 nodes x 8 MB is a small share of 64 GB (illustrative)`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'conn', x: 10, y: 110, w: 130, h: 60, t: '300 sessions', s: 'OLTP + reports' },
        { id: 'nodes', x: 200, y: 110, w: 130, h: 60, t: '3 sort nodes', s: 'per session' },
        { id: 'mem', x: 200, y: 200, w: 130, h: 50, t: 'work_mem each', s: '256 MB per node' },
        { id: 'host', x: 430, y: 30, w: 180, h: 60, t: 'Host memory', s: '64 GB, shared' },
        { id: 'kill', x: 430, y: 200, w: 180, h: 60, t: 'OOM killer', s: 'signal 9 on a backend' }],
        edges: [ { id: 'e1', a: 'conn', b: 'nodes', label: 'per session' }, { id: 'e2', a: 'nodes', b: 'mem', label: 'each uses' }, { id: 'e3', a: 'mem', b: 'host', label: 'demand adds up' }, { id: 'e4', a: 'host', b: 'kill', label: 'RAM runs out' }] },
      bug: [
        { log: 'work_mem is set to 256 MB for the whole server. It is a budget for each sort or hash node, not for the server.', code: 1, hl: { nodes: { conn: 'warn' } }, stats: [{ l: 'work_mem', v: '256 MB', cls: 'warn' }] },
        { log: 'Each of 300 sessions can run queries with 3 memory-hungry nodes. Each node may use up to 256 MB.', code: 2, hl: { nodes: { nodes: 'bad', mem: 'bad' }, edges: { e1: 'on', e2: 'bad' } }, stats: [{ l: 'potential use', v: '225 GB (illustrative)', cls: 'bad' }] },
        { log: 'The demand is far larger than the 64 GB host. The kernel runs out of memory and picks a process to kill.', code: 4, hl: { nodes: { host: 'bad', kill: 'bad' }, edges: { e3: 'bad', e4: 'bad' } }, stats: [{ l: 'host RAM', v: '64 GB', cls: 'warn' }] },
        { log: 'The postmaster restarts all backends for safety, so every connection drops.', code: 3, hl: { nodes: { kill: 'bad', conn: 'dim' } }, stats: [{ l: 'connections', v: 'all reset', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The global default stays at 8 MB, which is small enough for hundreds of sessions.', code: 1, hl: { nodes: { conn: 'ok' } }, stats: [{ l: 'work_mem default', v: '8 MB', cls: 'ok' }] },
        { log: 'Only the reporting role gets 256 MB. Few sessions run those reports at the same time.', code: 2, hl: { nodes: { nodes: 'ok', mem: 'ok' } }, stats: [{ l: 'work_mem for reports', v: '256 MB', cls: 'ok' }] },
        { log: 'Total demand stays well under RAM, so the kernel never has to kill a backend.', code: 3, hl: { nodes: { host: 'ok', kill: 'dim' }, edges: { e3: 'ok', e4: 'dim' } }, stats: [{ l: 'memory demand vs RAM', v: 'under RAM (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Checkpoints',
  problem: `A write-heavy orders cluster produces about 20 MB/s of WAL (illustrative). <code>pg_wal</code> has grown to many gigabytes, and every few minutes commit latency doubles for about a minute (illustrative). The log warns that <code>checkpoints are occurring too frequently</code> at peaks. A teammate wants a longer <code>checkpoint_timeout</code> and a larger <code>max_wal_size</code>, and another asks what that does to recovery after a crash.`,
  predict: { q: `Halving <code>checkpoint_timeout</code> makes crash recovery __ and total WAL volume __.`,
    opts: [`faster; smaller`, `faster; larger, because more full-page images are written`, `slower; smaller`, `slower; larger`], ans: 1,
    why: `More frequent checkpoints leave less WAL to replay, so recovery is faster. But after each checkpoint the first change to every page logs a full-page image again, so WAL volume and write amplification rise.` },
  explain: `
<h3>The idea</h3>
<p>Crash recovery replays WAL from a known good point. Without checkpoints it would have to replay the log from the beginning. A <b>checkpoint</b> flushes every dirty buffer to disk and records a <b>redo point</b> in WAL. Recovery starts there, so the checkpoint interval sets how much work a crash can cost.</p>
<h3>How it works, step by step</h3>
<p>A checkpoint starts when either <code>checkpoint_timeout</code> (default 5 min) passes or WAL growth approaches <code>max_wal_size</code>, whichever comes first.</p>
<p>The checkpointer writes every dirty buffer and calls fsync. <code>checkpoint_completion_target</code> spreads those writes over that fraction of the interval (default 0.9), so the disk does not see one large burst.</p>
<p>When the flush is done, the redo point moves forward. WAL segments older than the redo point, and not needed by replication slots or archiving, can be removed or reused.</p>
<p>After each checkpoint, the first change to every page writes a full-page image to WAL again. Shorter intervals therefore mean more WAL and more total writes.</p>
<h3>The trade-off</h3>
<p>Short intervals keep recovery fast but write more WAL and flush more often. Long intervals save write work and smooth the load, but a crash must replay more WAL. A large <code>max_wal_size</code> lets PostgreSQL wait longer, so it also raises recovery time and the disk space needed by <code>pg_wal</code>. Set both from a recovery-time target, and then check that the disk can absorb the flushes.</p>`,
  diagnose: [
    { t: `Checkpoints are occurring too frequently`, sym: `<b>Symptom:</b> the log repeatedly warns about frequent checkpoints, and most checkpoints are requested rather than timed.`,
      ctx: `A bulk load writes 20 MB/s of WAL with <code>max_wal_size = 1GB</code> (illustrative).`,
      why: `The size trigger fires well before checkpoint_timeout. The server checkpoints every few dozen seconds, flushing data and re-logging full-page images again and again.`,
      log: `-- representative output, values illustrative\nLOG:  checkpoints are occurring too frequently (24 seconds apart)\nHINT:  Consider increasing the configuration parameter "max_wal_size".\n\napp=> SELECT num_timed, num_requested FROM pg_stat_checkpointer;   -- PostgreSQL 17\n-- PostgreSQL 16: SELECT checkpoints_timed, checkpoints_req FROM pg_stat_bgwriter;`,
      note: `pg_stat_checkpointer is new in PostgreSQL 17; in 16 the counters are in pg_stat_bgwriter. Source: WAL configuration (postgresql.org/docs/current/wal-configuration.html).`,
      fix: [`Measure first: compare timed and requested checkpoint counters, and read <code>log_checkpoints</code> output (on by default from PostgreSQL 15).`, `Fix: raise <code>max_wal_size</code> so that it comfortably covers a <code>checkpoint_timeout</code> of WAL at peak rate.`, `Fix: size disk for the larger <code>pg_wal</code>. Trade-off: recovery may replay more WAL.`, `Verify: most checkpoints are timed and the warning disappears.`] },
    { t: `A checkpoint I/O spike hurts latency`, sym: `<b>Symptom:</b> every checkpoint interval, disk write throughput and commit latency spike together.`,
      ctx: `An old tuning guide had set <code>checkpoint_completion_target = 0.1</code> (illustrative), so flushes happen in the first 10% of the interval.`,
      why: `A low completion target squeezes the same amount of dirty-page writes into a short window. The disk saturates, fsync calls stall and foreground commits wait behind them.`,
      log: `-- representative output, values illustrative\nLOG:  checkpoint starting: time\nLOG:  checkpoint complete: wrote 412300 buffers (39.3%); 0 WAL file(s) added, 3 removed, 18 recycled; write=29.912 s, sync=2.140 s, total=32.3 s; sync files=98, longest=1.20 s, average=0.02 s; distance=1043000 kB, estimate=1043000 kB`,
      note: `Needs log_checkpoints = on. Compare write= time with the interval: a write phase of 30 s in a 5-minute interval is a spike. Source: WAL settings, checkpoint_completion_target (postgresql.org/docs/current/runtime-config-wal.html).`,
      fix: [`Measure first: read the <code>write=</code> and <code>sync=</code> times and <code>total=</code> in <code>checkpoint complete</code> lines and line them up with latency graphs.`, `Fix: set <code>checkpoint_completion_target = 0.9</code> (the default since PostgreSQL 14).`, `Fix: leave <code>checkpoint_flush_after</code> at its default so the kernel writes back dirty data in small pieces instead of one large flush.`, `Verify: write throughput and commit latency stay flat over the interval.`] },
    { t: `A huge max_wal_size makes crash recovery take far too long`, sym: `<b>Symptom:</b> after a crash the database spends many minutes in recovery before it accepts connections.`,
      ctx: `To avoid frequent checkpoints, the team set <code>max_wal_size = 200GB</code> and <code>checkpoint_timeout = 1h</code> (illustrative).`,
      why: `Crash recovery replays all WAL since the last checkpoint's redo point. With far-apart checkpoints there can be hundreds of gigabytes to replay, and replay speed is limited, often by random I/O on data pages.`,
      log: `-- representative output, values illustrative\nLOG:  database system was not properly shut down; automatic recovery in progress\nLOG:  redo starts at 7B/3C000028\nLOG:  redo in progress, elapsed time: 120.00 s, current LSN: 7B/B4A1F0E8\nLOG:  redo in progress, elapsed time: 240.00 s, current LSN: 7C/12008A50`,
      note: `Periodic redo in progress lines (PostgreSQL 15 and later) show how long replay has taken. Source: WAL configuration (postgresql.org/docs/current/wal-configuration.html).`,
      fix: [`Measure first: run a crash test in staging and time recovery, or estimate from WAL rate times <code>checkpoint_timeout</code>.`, `Fix: choose <code>checkpoint_timeout</code> and <code>max_wal_size</code> to meet a recovery-time objective, not just to silence the warning.`, `Fix: if you also run a standby, remember a failover to a replaying standby may be faster than waiting for recovery.`, `Verify: the staged crash test recovers inside the objective.`] }
  ],
  source: { label: 'Original: Checkpoints', href: '01-postgres-internals-end-to-end.html#ch9' },
  scenarios: [
    { id: 'size-trigger', label: 'Size trigger every 24 s', desc: 'A small max_wal_size makes the size trigger fire again and again. Each checkpoint re-logs full-page images, so WAL volume and I/O keep rising.', codeLabel: 'Config',
      code: { bug: [`# postgresql.conf (illustrative: bulk load at about 20 MB/s of WAL)`, `max_wal_size = 1GB`, `LOG:  checkpoints are occurring too frequently (24 seconds apart)`, `HINT:  Consider increasing the configuration parameter "max_wal_size".`, `-- most checkpoints are requested by size, not timed`],
        fix: [`# postgresql.conf (fixed, sized for the peak WAL rate)`, `max_wal_size = 8GB  # illustrative: covers 5 min at 20 MB/s`, `checkpoint_timeout = 5min  # default`, `LOG:  checkpoint starting: time`, `-- most checkpoints are now timed, and the warning is gone`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'trg', x: 10, y: 110, w: 130, h: 60, t: 'Trigger', s: 'size or timeout' },
        { id: 'cp', x: 190, y: 110, w: 130, h: 60, t: 'Checkpointer', s: 'paced writes' },
        { id: 'dirty', x: 370, y: 30, w: 160, h: 60, t: 'Dirty buffers', s: 'flushed to disk' },
        { id: 'rec', x: 370, y: 200, w: 160, h: 60, t: 'Redo point', s: 'recorded in WAL' },
        { id: 'old', x: 555, y: 110, w: 80, h: 60, t: 'Old WAL', s: 'recycled' }],
        edges: [ { id: 'e1', a: 'trg', b: 'cp', label: 'start' }, { id: 'e2', a: 'cp', b: 'dirty', label: 'write + fsync' }, { id: 'e3', a: 'cp', b: 'rec', label: 'record' }, { id: 'e4', a: 'rec', b: 'old', label: 'frees WAL' }] },
      bug: [
        { log: 'WAL arrives at about 20 MB/s (illustrative). With max_wal_size = 1GB, the size trigger fires long before checkpoint_timeout.', code: 1, hl: { nodes: { trg: 'bad' } }, stats: [{ l: 'checkpoint interval', v: '24 s (from log)', cls: 'bad' }] },
        { log: 'The checkpointer starts a checkpoint on size, not on the clock. It flushes dirty buffers again and again.', code: 2, hl: { nodes: { cp: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'checkpoints per minute', v: 'about 2.5 (illustrative)', cls: 'bad' }] },
        { log: 'Each checkpoint restarts full-page images, so the WAL written after each one is larger than the data changed.', code: 4, hl: { nodes: { rec: 'warn' }, edges: { e3: 'warn' } }, stats: [{ l: 'requested share', v: '95% (illustrative)', cls: 'bad' }] },
        { log: 'Commit latency doubles during each burst, because the disk is busy with flushes.', code: 3, hl: { nodes: { dirty: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'commit latency', v: '2x during bursts (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'max_wal_size is raised to cover a full checkpoint_timeout of WAL at the peak rate.', code: 1, hl: { nodes: { trg: 'ok' } }, stats: [{ l: 'max_wal_size', v: '8 GB (illustrative)', cls: 'ok' }] },
        { log: 'The clock now starts the checkpoint, and checkpoint_timeout sets the pace.', code: 2, hl: { nodes: { cp: 'ok', trg: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'checkpoint interval', v: '5 min (default)', cls: 'ok' }] },
        { log: 'Each checkpoint is timed, so fewer full-page images are written and the WAL volume falls.', code: 3, hl: { nodes: { dirty: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'requested share', v: '5% (illustrative)', cls: 'ok' }] },
        { log: 'Most checkpoints are now timed, and the frequent-checkpoint warning no longer appears.', code: 4, hl: { nodes: { rec: 'ok' }, edges: { e3: 'ok', e4: 'ok' } }, stats: [{ l: 'commit latency', v: 'flat (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'io-spike', label: 'Flush burst vs spread', desc: 'A low checkpoint_completion_target squeezes the dirty-page writes into the start of the interval. The disk saturates, and commits queue behind fsync.', codeLabel: 'Log',
      code: { bug: [`# postgresql.conf (illustrative: from an outdated tuning guide)`, `checkpoint_completion_target = 0.1`, `LOG:  checkpoint starting: time`, `LOG:  checkpoint complete: wrote 412300 buffers (39.3%); write=29.912 s, sync=2.140 s, total=32.3 s`, `-- 30 s of writes in a 5-minute interval: a spike`],
        fix: [`# postgresql.conf (fixed)`, `checkpoint_completion_target = 0.9  # default since PostgreSQL 14`, `LOG:  checkpoint starting: time`, `-- same buffers, now written across about 270 s of the interval (illustrative)`, `-- write throughput and commit latency stay flat over the interval`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'tgt', x: 10, y: 110, w: 140, h: 60, t: 'Trigger', s: 'time: 5 min' },
        { id: 'cp', x: 200, y: 110, w: 150, h: 60, t: 'Checkpointer', s: 'paced by target' },
        { id: 'disk', x: 400, y: 30, w: 200, h: 60, t: 'Disk writes', s: 'dirty pages' },
        { id: 'commit', x: 400, y: 200, w: 200, h: 60, t: 'Commits', s: 'wait behind fsync' }],
        edges: [ { id: 'e1', a: 'tgt', b: 'cp', label: 'start' }, { id: 'e2', a: 'cp', b: 'disk', label: 'writes' }, { id: 'e3', a: 'disk', b: 'commit', label: 'fsync stalls' }] },
      bug: [
        { log: 'The checkpoint starts on the timer. With completion target 0.1, all its writes are squeezed into the first 10% of the interval.', code: 2, hl: { nodes: { tgt: 'on', cp: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'write window', v: '10% of interval (illustrative)', cls: 'bad' }] },
        { log: 'About 412,300 dirty buffers are written in about 30 seconds, which saturates the disk.', code: 3, hl: { nodes: { disk: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'write=', v: '29.912 s (from log)', cls: 'bad' }] },
        { log: 'fsync calls stall. Foreground commits that need the disk now wait behind the flush.', code: 4, hl: { nodes: { commit: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'sync=', v: '2.140 s (from log)', cls: 'warn' }, { l: 'commit latency', v: 'spikes (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The completion target is 0.9, so the same writes are spread over most of the interval.', code: 1, hl: { nodes: { cp: 'ok', tgt: 'ok' } }, stats: [{ l: 'write window', v: '90% of interval (illustrative)', cls: 'ok' }] },
        { log: 'The same buffers are written in small steps. The disk is never saturated for long.', code: 3, hl: { nodes: { disk: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'peak write rate', v: '12% of the burst (illustrative)', cls: 'ok' }] },
        { log: 'fsync finishes quickly, so foreground commits do not queue behind a flush.', code: 4, hl: { nodes: { commit: 'ok' }, edges: { e3: 'dim' } }, stats: [{ l: 'commit latency', v: 'flat (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Isolation and Deadlocks',
  problem: `A payments service moves money between accounts. Transfer A debits account 1 and then credits account 2. Transfer B, running at the same time, does the opposite (illustrative: 40 such pairs per hour). Some transfers fail with <code>ERROR: deadlock detected</code> after about one second. Separately, a nightly schema migration waits for a lock, and every new query on that table queues behind it.`,
  predict: { q: `Under <code>REPEATABLE READ</code>, T1 updates a row and commits after T2's snapshot was taken. T2 then tries to update the same row. What does T2 get?`,
    opts: [`It silently overwrites T1's change`, `It waits, then sees the new value and proceeds`, `ERROR: could not serialize access due to concurrent update`, `A deadlock error`], ans: 2,
    why: `Repeatable Read uses one snapshot for the whole transaction. T2 cannot update a row version it could not see, and cannot silently follow it to a newer one, so it fails with SQLSTATE 40001. The application is expected to retry.` },
  explain: `
<h3>The idea</h3>
<p>Concurrent transactions can produce results that no one-at-a-time order would produce. Isolation levels decide which of these anomalies are allowed. Locks stop writers from stepping on each other, but two transactions that wait for each other form a cycle that never ends by itself. PostgreSQL must then break the cycle by aborting one of them.</p>
<h3>How it works, step by step</h3>
<p><b>Isolation levels</b> differ in when the snapshot is taken. Read Committed takes a new snapshot for each statement. Repeatable Read uses one snapshot for the whole transaction. Serializable adds SSI (serializable snapshot isolation) conflict detection on top of that. Under SSI, a transaction that could cause an anomaly is aborted with SQLSTATE <code>40001</code>.</p>
<p><b>Anomalies</b> include lost updates (one write overwrites a concurrent change), write skew (two transactions each read what the other writes), and unrepeatable reads at the weakest levels.</p>
<p><b>Lock modes</b>: row locks conflict only with other writers of the same row. Table locks such as <code>ACCESS EXCLUSIVE</code>, which most <code>ALTER TABLE</code> statements take, conflict with everything, including plain reads.</p>
<p><b>Deadlock detection</b>: a session that waits longer than <code>deadlock_timeout</code> (default 1 s) checks the wait-for graph. If it finds a cycle, one transaction in the cycle is aborted with <code>40P01</code>.</p>
<p><b>lock_timeout</b> limits how long any lock wait may last. The statement then fails with <code>55P03</code>.</p>
<h3>The trade-off</h3>
<p>Stronger isolation prevents more anomalies, but the database aborts more transactions, and the application must retry them. Locks prevent conflicts, but they make waiting possible, and waiting can form cycles. Keep transactions short, lock rows in a consistent order, and set timeouts so that a stuck lock fails fast instead of queuing the whole service.</p>`,
  diagnose: [
    { t: `ERROR: deadlock detected`, sym: `<b>Symptom:</b> some transfers fail with <code>deadlock detected</code> roughly one second after they began waiting.`,
      ctx: `Transfers lock accounts in the order they are debited, so opposite transfers lock in opposite order (illustrative).`,
      why: `Each transaction holds a lock the other needs. No one can proceed. After deadlock_timeout a waiter runs the detector, finds the cycle and aborts one transaction with SQLSTATE 40P01.`,
      log: `-- representative output, values illustrative\nERROR:  deadlock detected\nDETAIL:  Process 8123 waits for ShareLock on transaction 4412; blocked by process 8140.\n         Process 8140 waits for ShareLock on transaction 4410; blocked by process 8123.\nHINT:  See server log for query details.\nCONTEXT:  while updating tuple (0,7) in relation "accounts"`,
      note: `The DETAIL lines spell out the cycle. The full queries are in the server log. Source: Explicit locking, deadlocks (postgresql.org/docs/current/explicit-locking.html).`,
      fix: [`Measure first: read the DETAIL and CONTEXT lines and the statements in the server log to find which two code paths collide.`, `Fix: lock rows in a consistent order, for example by ascending account id, <code>SELECT ... FROM accounts WHERE id IN (...) ORDER BY id FOR UPDATE</code>.`, `Fix: keep transactions short and retry on <code>40P01</code>.`, `Verify: deadlock counts in <code>pg_stat_database.deadlocks</code> stay flat.`] },
    { t: `Serialization failure 40001 is not retried by the application`, sym: `<b>Symptom:</b> under Repeatable Read or Serializable a small share of requests fail with <code>could not serialize access</code> and the user sees an error.`,
      ctx: `The service moved to <code>SERIALIZABLE</code> to prevent write skew and did not add a retry loop (illustrative).`,
      why: `At these levels PostgreSQL aborts a transaction that could produce an anomaly, with SQLSTATE 40001. This is not a bug: the docs state that applications must be ready to retry the whole transaction.`,
      log: `-- representative output, values illustrative\nERROR:  could not serialize access due to read/write dependencies among transactions\nDETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.\nHINT:  The transaction might succeed if retried.`,
      note: `Under Repeatable Read the message is could not serialize access due to concurrent update instead. Both are 40001. Source: Transaction isolation (postgresql.org/docs/current/transaction-iso.html).`,
      fix: [`Measure first: count <code>40001</code> errors per endpoint in application logs.`, `Fix: wrap each transaction in a bounded retry loop (for example 3 to 5 attempts with jittered backoff) that re-runs the whole transaction, including its reads.`, `Fix: keep serializable transactions short and touch fewer rows to reduce conflicts.`, `Verify: user-visible errors drop to near zero, with retries visible in metrics.`] },
    { t: `Lost update under Read Committed from read-modify-write`, sym: `<b>Symptom:</b> two concurrent changes to a balance or stock count lead to one of them disappearing, with no error.`,
      ctx: `The app reads <code>balance</code> into memory, adds 50, and writes the result back with <code>UPDATE accounts SET balance = $1</code> (illustrative).`,
      why: `Both transactions read 100. One writes 150 and commits, the other writes 130 computed from its stale read. Read Committed lets the second UPDATE proceed after the first commits, and it simply stores the stale-based value.`,
      log: `-- representative output, values illustrative\nT1: SELECT balance FROM accounts WHERE id = 1;   -- 100\nT2: SELECT balance FROM accounts WHERE id = 1;   -- 100\nT1: UPDATE accounts SET balance = 150 WHERE id = 1; COMMIT;\nT2: UPDATE accounts SET balance = 130 WHERE id = 1; COMMIT;  -- T1's +50 is gone`,
      note: `No error is raised, which is why this is dangerous. Source: Explicit locking, row-level locks (postgresql.org/docs/current/explicit-locking.html).`,
      fix: [`Measure first: look for read-then-write patterns in the code, and test with two concurrent sessions.`, `Fix: use an atomic update, <code>UPDATE accounts SET balance = balance + 50 WHERE id = 1</code>.`, `Fix: if logic needs the value, lock the row first: <code>SELECT ... FOR UPDATE</code>.`, `Verify: a concurrency test ends with the expected total.`] },
    { t: `An ALTER TABLE waiting for ACCESS EXCLUSIVE blocks every later query`, sym: `<b>Symptom:</b> a migration hangs, and soon all queries on the table, including plain SELECTs, wait.`,
      ctx: `A report runs a 10-minute SELECT while a deploy runs <code>ALTER TABLE orders ADD COLUMN ...</code> (illustrative).`,
      why: `The ALTER needs ACCESS EXCLUSIVE, so it waits for the running SELECT. While it waits in the lock queue, new queries that need any lock on the table queue behind it, so one slow reader becomes a full outage.`,
      log: `-- representative output, values illustrative\napp=> SELECT pid, wait_event_type, wait_event, left(query, 36) FROM pg_stat_activity WHERE wait_event_type = 'Lock';\n  pid  | wait_event_type | wait_event | left\n-------+-----------------+------------+--------------------------------\n  9001 | Lock            | relation   | ALTER TABLE orders ADD COLUMN ...\n  9014 | Lock            | relation   | SELECT * FROM orders WHERE id = 7\n  9015 | Lock            | relation   | SELECT * FROM orders WHERE id = 8`,
      note: `Many sessions waiting on relation behind one DDL is the signature. Source: Explicit locking, table-level locks (postgresql.org/docs/current/explicit-locking.html).`,
      fix: [`Measure first: list waiting sessions and run <code>pg_blocking_pids</code> to find the head of the queue.`, `Fix: run DDL with <code>SET lock_timeout = '2s'</code> and retry in a loop, so it never waits long.`, `Fix: also set <code>statement_timeout</code> on reports so they cannot run for hours.`, `Fix: prefer lock-light forms (for example adding a nullable column without a volatile default) and <code>CREATE INDEX CONCURRENTLY</code>.`, `Verify: migrations either finish or fail fast, and no queue forms.`] }
  ],
  source: { label: 'Original: Isolation and Deadlocks', href: '01-postgres-internals-end-to-end.html#ch10' },
  scenarios: [
    { id: 'deadlock', label: 'Opposite lock order', desc: 'Two transfers lock the same two accounts in opposite order. Each waits for the lock the other holds, until deadlock_timeout lets the detector abort one.', codeLabel: 'SQL',
      code: { bug: [`-- Transfer A: lock account 1, then account 2`, `BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 1;`, `-- Transfer B: lock account 2, then account 1 (opposite order)`, `BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 2;`, `-- A and B now each wait for the lock the other holds`, `ERROR:  deadlock detected`],
        fix: [`-- both transfers lock the lower account id first`, `BEGIN;`, `SELECT id FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;`, `UPDATE accounts SET balance = balance - 10 WHERE id = 1;`, `UPDATE accounts SET balance = balance + 10 WHERE id = 2;`, `COMMIT;   -- the second transfer waits, then proceeds, with no cycle`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 't1', x: 10, y: 30, w: 150, h: 60, t: 'Transfer A', s: 'holds account 1' },
        { id: 't2', x: 10, y: 190, w: 150, h: 60, t: 'Transfer B', s: 'holds account 2' },
        { id: 'a1', x: 260, y: 30, w: 150, h: 60, t: 'Account 1 row', s: 'locked by A' },
        { id: 'a2', x: 260, y: 190, w: 150, h: 60, t: 'Account 2 row', s: 'locked by B' },
        { id: 'dd', x: 450, y: 110, w: 170, h: 60, t: 'Deadlock check', s: 'after deadlock_timeout' }],
        edges: [ { id: 'e1', a: 't1', b: 'a1', label: 'holds' }, { id: 'e2', a: 't2', b: 'a2', label: 'holds' }, { id: 'e3', a: 't1', b: 'a2', label: 'waits' }, { id: 'e4', a: 't2', b: 'a1', label: 'waits' }, { id: 'e5', a: 'a1', b: 'dd', label: 'timeout, check cycle' }] },
      bug: [
        { log: 'Transfer A locks account 1. Transfer B locks account 2. Each holds one lock.', code: 1, hl: { nodes: { t1: 'on', a1: 'on', t2: 'on', a2: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'locks held', v: '1 each', cls: 'warn' }] },
        { log: 'Transfer A now asks for account 2, which B holds. Transfer B asks for account 1, which A holds. Neither can move.', code: 4, hl: { nodes: { t1: 'bad', t2: 'bad' }, edges: { e3: 'bad', e4: 'bad' } }, stats: [{ l: 'waiting sessions', v: '2', cls: 'bad' }] },
        { log: 'The cycle never ends by itself. After deadlock_timeout, one waiter runs the detector and finds the cycle.', code: 4, hl: { nodes: { dd: 'warn' }, edges: { e5: 'warn' } }, stats: [{ l: 'deadlock_timeout', v: '1 s (default)', cls: 'warn' }] },
        { log: 'One transaction is aborted with ERROR: deadlock detected (SQLSTATE 40P01). The other one proceeds.', code: 5, hl: { nodes: { dd: 'bad', t2: 'dim' } }, stats: [{ l: 'SQLSTATE', v: '40P01', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Both transfers agree on one lock order: the lower account id first.', code: 0, hl: { nodes: { t1: 'ok', t2: 'ok' } }, stats: [{ l: 'lock order', v: 'ascending id', cls: 'ok' }] },
        { log: 'Transfer A takes account 1 first. Transfer B waits on account 1, not on account 2, so no cycle can form.', code: 2, hl: { nodes: { t2: 'warn', a1: 'ok' }, edges: { e4: 'dim', e2: 'dim' } }, stats: [{ l: 'waiting sessions', v: '1', cls: 'ok' }] },
        { log: 'A commits and releases account 1. B gets the lock and proceeds.', code: 5, hl: { nodes: { a1: 'ok', t2: 'ok', dd: 'dim' }, edges: { e4: 'ok', e5: 'dim' } }, stats: [{ l: 'deadlock errors', v: '0', cls: 'ok' }] }
      ] },
    { id: 'lost-update', label: 'Read-modify-write lost update', desc: 'Two transactions read the same balance, then each writes a value computed from that stale read. The second write silently overwrites the first.', codeLabel: 'SQL',
      code: { bug: [`-- T1 and T2 both read balance = 100`, `T1: SELECT balance FROM accounts WHERE id = 1;   -- 100`, `T2: SELECT balance FROM accounts WHERE id = 1;   -- 100`, `T1: UPDATE accounts SET balance = 150 WHERE id = 1; COMMIT;`, `T2: UPDATE accounts SET balance = 130 WHERE id = 1; COMMIT;  -- T1's +50 is gone`],
        fix: [`-- T1 and T2 each apply a delta to the current row`, `T1: UPDATE accounts SET balance = balance + 50 WHERE id = 1; COMMIT;`, `T2: UPDATE accounts SET balance = balance + 30 WHERE id = 1;  -- waits, then applies to 150`, `T2: COMMIT;`, `-- final balance 180, no update lost`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 't1', x: 10, y: 40, w: 150, h: 60, t: 'T1', s: 'reads 100, adds 50' },
        { id: 't2', x: 10, y: 190, w: 150, h: 60, t: 'T2', s: 'reads 100, adds 30' },
        { id: 'row', x: 260, y: 110, w: 170, h: 60, t: 'accounts id = 1', s: 'one balance row' },
        { id: 'res', x: 480, y: 110, w: 150, h: 60, t: 'Final balance', s: 'last writer wins' }],
        edges: [ { id: 'e1', a: 't1', b: 'row', label: 'writes 150' }, { id: 'e2', a: 't2', b: 'row', label: 'writes 130' }, { id: 'e3', a: 'row', b: 'res', label: 'stored' }] },
      bug: [
        { log: 'T1 and T2 both read balance = 100 into their own memory.', code: 1, hl: { nodes: { t1: 'on', t2: 'on', row: 'on' } }, stats: [{ l: 'balance read by each', v: '100', cls: 'ok' }] },
        { log: 'T1 computes 150 and writes it. The write is committed.', code: 3, hl: { nodes: { t1: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'T1 writes', v: '150', cls: 'ok' }] },
        { log: 'T2 writes 130, computed from its stale read. Read Committed lets the UPDATE go ahead and does not compare with the value T2 read.', code: 4, hl: { nodes: { t2: 'bad', row: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'T1 +50', v: 'lost', cls: 'bad' }, { l: 'error raised', v: 'none', cls: 'bad' }] },
        { log: 'The final balance is 130. Two deposits ran, but only one of them survives, and no error was reported.', code: 4, hl: { nodes: { res: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'final balance', v: '130', cls: 'bad' }, { l: 'expected', v: '180', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Each transaction applies its change to the current value of the row, not to a value it read earlier.', code: 1, hl: { nodes: { t1: 'ok', t2: 'ok' } }, stats: [{ l: 'write style', v: 'balance + delta', cls: 'ok' }] },
        { log: 'T2 finds the row locked by T1. It waits for T1 to commit, then applies +30 to the new value of 150.', code: 2, hl: { nodes: { t2: 'warn', row: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'T2 waits', v: 'until T1 commits', cls: 'warn' }] },
        { log: 'Both changes are kept. The final balance matches the expected total.', code: 4, hl: { nodes: { res: 'ok' }, edges: { e1: 'ok', e3: 'ok' } }, stats: [{ l: 'final balance', v: '180', cls: 'ok' }, { l: 'updates lost', v: '0', cls: 'ok' }] }
      ] }
  ]
},
{
  title: 'Streaming Replication and synchronous_commit',
  problem: `An orders primary streams WAL to one standby in another zone (illustrative). <code>synchronous_commit = on</code> is set, but <code>synchronous_standby_names</code> is empty, so replication is asynchronous. The primary's host dies, the team promotes the standby, and support finds that the last two minutes of paid orders are missing, although customers saw confirmation pages.`,
  predict: { q: `With <code>synchronous_commit = remote_apply</code> and the only synchronous standby down, what happens to new COMMITs on the primary?`,
    opts: [`They succeed: replication falls back to async automatically`, `They hang until a synchronous standby returns or the wait is cancelled`, `They fail immediately with an error`, `They succeed but are not durable`], ans: 1,
    why: `Once a synchronous standby is configured, commits wait for its acknowledgement, and PostgreSQL does not silently downgrade. Sessions sit in wait event SyncRep until a standby comes back or the setting changes. A quorum list such as ANY 1 (s1, s2) avoids a single point of stall.` },
  explain: `
<h3>The idea</h3>
<p>A replica can protect a commit only if the commit's WAL reached it before the primary failed. So the commit rule decides what a failover can lose. Durability against a node failure means the log must exist on a second node before the client is told the commit succeeded.</p>
<h3>How it works, step by step</h3>
<p>A <b>WAL sender</b> on the primary streams WAL records to each standby. The standby's <b>WAL receiver</b> writes, flushes and replays them in order.</p>
<p>The <code>synchronous_commit</code> level sets how far a commit waits. <code>local</code> waits for the primary's flush only. <code>remote_write</code> waits for the standby's OS write. <code>on</code> waits for the standby's flush. <code>remote_apply</code> waits until the standby has replayed the commit, so reads on the standby see it. <code>off</code> does not wait for any flush.</p>
<p><code>synchronous_standby_names</code> chooses which standbys count. It can be a priority list (<code>FIRST n</code>) or a quorum (<code>ANY n</code>). If it is empty, replication is asynchronous, and <code>synchronous_commit = on</code> waits only for the primary's own flush.</p>
<p><b>Replication slots</b> make the primary keep WAL that a consumer has not received yet. That protects the consumer, but an inactive slot can fill <code>pg_wal</code>. <code>max_slot_wal_keep_size</code> caps the retained WAL.</p>
<p><b>Hot standby conflicts</b>: replay may need to remove rows that a standby query still reads. The query is cancelled after <code>max_standby_streaming_delay</code> unless <code>hot_standby_feedback</code> holds cleanup back on the primary.</p>
<h3>The trade-off</h3>
<p>Waiting for a standby gives stronger protection, but every commit gets slower, and a standby outage can stall writes. A quorum survives one failure. Asynchronous replication keeps writes fast, but a failover can lose the newest commits. Write down the data-loss window you accept, and test failover under load.</p>`,
  diagnose: [
    { t: `An inactive replication slot fills pg_wal and the disk`, sym: `<b>Symptom:</b> the WAL directory grows by gigabytes per hour until the disk is full and the primary stops.`,
      ctx: `A standby was shut down for maintenance and its slot stayed on the primary (illustrative: 25 MB/s of WAL).`,
      why: `A slot guarantees the primary keeps every WAL file the consumer has not confirmed. An inactive slot never confirms, so WAL accumulates without bound until the disk is full.`,
      log: `-- representative output, values illustrative\napp=> SELECT slot_name, active, wal_status, safe_wal_size FROM pg_replication_slots;\n slot_name | active | wal_status | safe_wal_size\n-----------+--------+------------+---------------\n standby_b | f      | extended   |\n\nPANIC:  could not write to file "pg_wal/xlogtemp.31415": No space left on device`,
      note: `wal_status moves from reserved to extended, then unreserved and lost when max_slot_wal_keep_size is set and exceeded. Source: Replication, max_slot_wal_keep_size (postgresql.org/docs/current/runtime-config-replication.html).`,
      fix: [`Measure first: check <code>active</code>, <code>wal_status</code> and the retained size of every slot, and the size of <code>pg_wal</code>.`, `Fix: drop slots you no longer need with <code>pg_drop_replication_slot('name')</code>.`, `Fix: set <code>max_slot_wal_keep_size</code>. Trade-off: a consumer that falls behind that limit loses its slot and must be rebuilt.`, `Fix: alert on slot lag and on <code>pg_wal</code> size.`, `Verify: <code>pg_wal</code> stays within budget during an intentional standby outage.`] },
    { t: `The synchronous standby is down and every commit hangs`, sym: `<b>Symptom:</b> all writes stall at once. <code>pg_stat_activity</code> shows sessions waiting on <code>SyncRep</code>.`,
      ctx: `The cluster has <code>synchronous_standby_names = 's1'</code> with a single standby, and that standby's host fails (illustrative).`,
      why: `With a synchronous standby configured, commit waits for its acknowledgement. With only one candidate there is nothing to fall back to, so the primary stalls rather than lose the guarantee.`,
      log: `-- representative output, values illustrative\napp=> SELECT pid, wait_event_type, wait_event, state FROM pg_stat_activity WHERE wait_event = 'SyncRep';\n  pid  | wait_event_type | wait_event | state\n-------+-----------------+------------+--------\n  7001 | IPC             | SyncRep    | active\n  7002 | IPC             | SyncRep    | active`,
      note: `A cancelled wait logs canceling the wait for synchronous replication and the commit is not rolled back. Source: Synchronous replication (postgresql.org/docs/current/warm-standby.html).`,
      fix: [`Measure first: count sessions with wait event <code>SyncRep</code> and check <code>pg_stat_replication</code> for connected standbys.`, `Fix: configure a quorum such as <code>synchronous_standby_names = 'ANY 1 (s1, s2)'</code> with at least one spare standby.`, `Fix: in an emergency, clear <code>synchronous_standby_names</code> and reload, accepting the loss of the guarantee knowingly.`, `Verify: stop one standby in a test and confirm commits keep flowing.`] },
    { t: `canceling statement due to conflict with recovery on a standby`, sym: `<b>Symptom:</b> long reports on a hot standby randomly fail with a conflict error.`,
      ctx: `Reports run for 10 minutes on a standby, while the primary vacuums an updated table (illustrative).`,
      why: `Vacuum on the primary removes old row versions, and the standby must replay that. If the report still needs those rows, replay waits until max_standby_streaming_delay (default 30 s) and then cancels the query.`,
      log: `-- representative output, values illustrative\nERROR:  canceling statement due to conflict with recovery\nDETAIL:  User query might have needed to see row versions that must be removed.`,
      note: `pg_stat_database_conflicts counts these per cause. Source: Hot standby, handling query conflicts (postgresql.org/docs/current/hot-standby.html).`,
      fix: [`Measure first: read <code>pg_stat_database_conflicts</code> on the standby to see which conflict type dominates.`, `Fix: set <code>hot_standby_feedback = on</code> so the primary keeps rows the standby needs. Trade-off: bloat on the primary from long standby queries.`, `Fix: or raise <code>max_standby_streaming_delay</code> on a dedicated reporting standby. Trade-off: replay lag grows.`, `Verify: conflict counts fall and replay lag stays acceptable.`] },
    { t: `An asynchronous failover loses acknowledged commits`, sym: `<b>Symptom:</b> after promoting a standby, the newest committed transactions are missing and clients saw success for them.`,
      ctx: `Streaming replication is asynchronous with a few seconds of lag at peak (illustrative).`,
      why: `With async replication the commit returns after the primary's own flush. WAL not yet received by the standby when the primary dies never reaches the new primary, so those commits vanish.`,
      log: `-- representative output, values illustrative\napp=> SELECT application_name, state, sync_state, write_lag, flush_lag, replay_lag FROM pg_stat_replication;\n application_name | state     | sync_state | write_lag | flush_lag | replay_lag\n------------------+-----------+------------+-----------+-----------+------------\n standby_a        | streaming | async      | 00:00:00.9| 00:00:01.4| 00:00:02.1`,
      note: `Lag columns estimate how far behind the standby is. In async mode that gap is the data at risk. Source: Synchronous replication (postgresql.org/docs/current/warm-standby.html).`,
      fix: [`Measure first: record <code>flush_lag</code> and <code>sent_lsn - write_lsn</code> in <code>pg_stat_replication</code> over time to know the data at risk.`, `Fix: for critical writes use synchronous replication, with <code>synchronous_commit = on</code> (or <code>remote_write</code>) and a quorum of standbys.`, `Fix: or keep async and accept an explicit recovery point objective, writing it down.`, `Verify: a failover test with a write load shows no acknowledged commit missing.`] }
  ],
  source: { label: 'Original: Streaming Replication and synchronous_commit', href: '01-postgres-internals-end-to-end.html#ch11' },
  scenarios: [
    { id: 'commit-wait', label: 'Where COMMIT waits', desc: 'With no synchronous standby, COMMIT waits only for the primary flush. Commits the standby has not yet received are lost when the primary fails.', codeLabel: 'SQL',
      code: { bug: [`-- primary (illustrative): synchronous_standby_names is empty`, `SHOW synchronous_standby_names;   -- (empty): replication is asynchronous`, `SET synchronous_commit = on;  -- default, but no standby to wait for`, `COMMIT;  -- returns after the primary flushes its own WAL`, `-- standby is about 2 s behind (illustrative); primary host dies`, `-- promote standby: the last commits are not on it`],
        fix: [`synchronous_standby_names = 'ANY 1 (s1, s2)'`, `SET synchronous_commit = on;`, `-- waits until one standby has flushed this commit`, `COMMIT;  -- returns after ANY 1 standby acknowledges the flush`, `-- primary host dies`, `-- promote a standby: the commit is already there`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'pr', x: 10, y: 110, w: 120, h: 60, t: 'Primary', s: 'COMMIT' },
        { id: 'ws', x: 180, y: 110, w: 130, h: 60, t: 'WAL sender', s: 'streams WAL' },
        { id: 'wr', x: 370, y: 20, w: 220, h: 60, t: 'Standby write', s: 'remote_write' },
        { id: 'fl', x: 370, y: 110, w: 220, h: 60, t: 'Standby flush', s: 'on' },
        { id: 'ap', x: 370, y: 200, w: 220, h: 60, t: 'Standby replay', s: 'remote_apply' }],
        edges: [ { id: 'e1', a: 'pr', b: 'ws', label: 'WAL' }, { id: 'e2', a: 'ws', b: 'wr', label: 'stage 1' }, { id: 'e3', a: 'ws', b: 'fl', label: 'stage 2' }, { id: 'e4', a: 'ws', b: 'ap', label: 'stage 3' }] },
      bug: [
        { log: 'The primary has no synchronous standby, so COMMIT waits only for the primary own flush.', code: 3, hl: { nodes: { pr: 'on' }, edges: { e1: 'dim' } }, stats: [{ l: 'standby acknowledgements required', v: '0', cls: 'bad' }] },
        { log: 'WAL is streamed to the standby in the background. At peak it can be seconds behind.', code: 4, hl: { nodes: { ws: 'warn', wr: 'warn', fl: 'warn', ap: 'warn' }, edges: { e2: 'dim', e3: 'dim', e4: 'dim' } }, stats: [{ l: 'standby lag', v: '2 s (illustrative)', cls: 'warn' }] },
        { log: 'The primary host dies. Commits from the last 2 s exist only on the dead primary.', code: 4, hl: { nodes: { pr: 'bad' } }, stats: [{ l: 'commits not on standby', v: 'about 10 (illustrative)', cls: 'bad' }] },
        { log: 'The standby is promoted. Those commits are not on it, so they are lost even though clients saw success.', code: 5, hl: { nodes: { fl: 'bad', ap: 'bad', wr: 'bad' } }, stats: [{ l: 'acknowledged commits lost', v: '10 (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A quorum is configured. The primary now waits for ANY 1 standby to acknowledge the flush.', code: 0, hl: { nodes: { ws: 'ok', fl: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'standby acks required', v: '1 of 2', cls: 'ok' }] },
        { log: 'Each COMMIT waits until one standby has flushed its WAL. The commit is on two nodes before the client is told.', code: 3, hl: { nodes: { pr: 'ok', fl: 'ok' }, edges: { e1: 'ok', e3: 'ok' } }, stats: [{ l: 'WAL on 2 nodes at acknowledgement', v: 'yes', cls: 'ok' }] },
        { log: 'When the primary dies, the promoted standby already has every acknowledged commit.', code: 4, hl: { nodes: { ap: 'dim', pr: 'dim' } }, stats: [{ l: 'acknowledged commits lost', v: '0', cls: 'ok' }] }
      ] },
    { id: 'sync-down', label: 'Sync standby stalls commits', desc: 'With one synchronous standby and no spare, the primary holds every COMMIT until that standby returns. A quorum keeps writes flowing when one standby fails.', codeLabel: 'Config',
      code: { bug: [`synchronous_standby_names = 's1'`, `-- s1 host fails (illustrative)`, `COMMIT;  -- waits for s1 to acknowledge the flush`, `wait event: SyncRep (state active)`, `-- new COMMITs queue; writes stall for every session`],
        fix: [`synchronous_standby_names = 'ANY 1 (s1, s2)'`, `-- s1 host fails (illustrative); s2 still streams`, `COMMIT;  -- waits for ANY 1 acknowledgement, s2 answers`, `-- commits complete at normal latency`, `-- one standby failure does not stall writes`] },
      diagram: { w: 640, h: 300, nodes: [
        { id: 'pr', x: 10, y: 110, w: 130, h: 60, t: 'Primary', s: 'COMMIT waits' },
        { id: 's1', x: 250, y: 30, w: 160, h: 60, t: 'Standby s1', s: 'down' },
        { id: 's2', x: 250, y: 200, w: 160, h: 60, t: 'Standby s2', s: 'up, in quorum' },
        { id: 'qr', x: 470, y: 110, w: 150, h: 60, t: 'Commit ack', s: 'from the quorum' }],
        edges: [ { id: 'e1', a: 'pr', b: 's1', label: 'waits for s1' }, { id: 'e2', a: 'pr', b: 's2', label: 'quorum' }, { id: 'e3', a: 's1', b: 'qr', label: 'ack' }, { id: 'e4', a: 's2', b: 'qr', label: 'ack' }] },
      bug: [
        { log: 'The primary has one synchronous standby. A COMMIT must wait for its acknowledgement.', code: 0, hl: { nodes: { pr: 'on', s1: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'synchronous standbys', v: '1 (s1)', cls: 'warn' }] },
        { log: 'Standby s1 fails. There is no other candidate, so the commit cannot be acknowledged.', code: 1, hl: { nodes: { s1: 'bad', s2: 'dim' }, edges: { e1: 'bad', e2: 'dim' } }, stats: [{ l: 's1', v: 'down', cls: 'bad' }] },
        { log: 'The COMMIT waits, and the wait is not rolled back. Sessions show wait event SyncRep.', code: 3, hl: { nodes: { pr: 'bad' }, edges: { e3: 'dim', e4: 'dim' } }, stats: [{ l: 'wait event', v: 'SyncRep', cls: 'bad' }] },
        { log: 'Every new write queues behind a waiting commit, so the whole service stalls.', code: 4, hl: { nodes: { pr: 'bad', qr: 'dim' } }, stats: [{ l: 'writes served', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The list is now a quorum: ANY 1 of s1 or s2 must acknowledge each commit.', code: 0, hl: { nodes: { pr: 'ok', s2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'acks needed', v: '1 of 2', cls: 'ok' }] },
        { log: 'Standby s1 fails, but s2 still streams and can acknowledge.', code: 1, hl: { nodes: { s1: 'warn', s2: 'ok' }, edges: { e1: 'dim', e4: 'ok' } }, stats: [{ l: 'standby s2', v: 'up', cls: 'ok' }] },
        { log: 'The COMMIT is acknowledged by s2 and returns at normal latency.', code: 2, hl: { nodes: { pr: 'ok', qr: 'ok' }, edges: { e4: 'ok', e3: 'dim' } }, stats: [{ l: 'writes served', v: 'normal', cls: 'ok' }] },
        { log: 'Writes keep flowing through the failure. Nothing stalls.', code: 4, hl: { nodes: { qr: 'ok' } }, stats: [{ l: 'writes served', v: '100% (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
  ]
};
