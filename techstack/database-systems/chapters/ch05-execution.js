/* Chapter 5 · query execution engine: operators, processing models, access methods, expressions and pipelines. Owns the operator pipeline. Vectorized and compiled execution, scheduling and CPU effects are chapter 10; adaptive optimization is chapter 9; pages and the buffer pool are chapter 2; index structures are chapter 4; Arrow layout is chapter 3 and transfer is chapter 8. */
PG.execution = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch05-css', `
.c05-flow{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;margin:10px 0}
.c05-op{flex:1 1 120px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card);font-size:12px;color:var(--mut);line-height:1.35}
.c05-op b{display:block;font-size:14px;color:var(--ink);margin-bottom:2px}
.c05-op.fused{border-style:dashed;opacity:.7}
.c05-op.hot{border:2px solid var(--bad)}
.c05-num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}
.c05-cols{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0}
.c05-col{border:1px solid var(--line);border-radius:4px;background:var(--soft);font-size:11px;padding:4px 2px;text-align:center;color:var(--mut);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;white-space:nowrap}
.c05-col.on{background:var(--acc);border-color:var(--acc);color:#fff}
.c05-col.keep{background:var(--ok);border-color:var(--ok);color:#fff}
.c05-bar{height:14px;border-radius:7px;background:var(--soft);overflow:hidden;margin:6px 0}
.c05-bar i{display:block;height:100%;background:var(--acc2);border-radius:7px}
.c05-wrap{overflow-x:auto;max-width:100%}
.c05-note{color:var(--mut);font-size:13px}
@media (max-width:560px){.c05-cols{grid-template-columns:repeat(4,1fr)}.c05-op{flex-basis:100%}}
`);

  /* ---- model constants: every number on this page is computed from these ---- */
  const ROWS = 10000000;           // rows in orders
  const ROW_B = 200;               // bytes per full row (20 columns, illustrative)
  const PROJ_B = 32;               // bytes per row for the two columns the query returns
  const SEL = 0.3 * 0.1;           // country = 'VN' (30%) and total > 900 (10%), assumed independent
  const LIMIT = 100;
  const PAGE_B = 8192;             // one 8 KB page of working memory
  const MATCH = Math.round(ROWS * SEL);             // 300,000 rows match the filter
  const TO_LIMIT = Math.ceil(LIMIT / SEL);          // a pipeline stops after about 3,334 rows read

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const bytes = b => b >= 1e6 ? (b / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(1) + ' KB' : b + ' B';

  /* the physical plan for one choice of model and pushdown: per-operator rows in and out, rows crossing operators, memory */
  function plan(model, push) {
    if (model === 'pipe') {
      if (!push) return { ops: [
        { n: 'Scan', i: TO_LIMIT, o: TO_LIMIT, note: 'reads full rows, one at a time' },
        { n: 'Filter', i: TO_LIMIT, o: LIMIT, note: 'drops most rows' },
        { n: 'Limit', i: LIMIT, o: LIMIT, note: 'stops the pipeline' }],
        read: TO_LIMIT, sent: TO_LIMIT, sentB: TO_LIMIT * ROW_B, mat: 0, mem: PAGE_B, ret: LIMIT };
      return { ops: [
        { n: 'Scan + filter + project', i: TO_LIMIT, o: LIMIT, note: 'predicate and columns pushed into the scan' },
        { n: 'Filter', i: 0, o: 0, note: 'fused into the scan', fused: true },
        { n: 'Limit', i: LIMIT, o: LIMIT, note: 'stops the pipeline' }],
        read: TO_LIMIT, sent: LIMIT, sentB: LIMIT * PROJ_B, mat: 0, mem: PAGE_B, ret: LIMIT };
    }
    if (!push) return { ops: [
      { n: 'Scan', i: ROWS, o: ROWS, note: 'materializes every full row' },
      { n: 'Filter', i: ROWS, o: MATCH, note: 'runs after the scan is done' },
      { n: 'Limit', i: MATCH, o: LIMIT, note: 'cannot stop the scan early' }],
      read: ROWS, sent: ROWS + MATCH, sentB: (ROWS + MATCH) * ROW_B, mat: ROWS + MATCH, mem: ROWS * ROW_B + MATCH * ROW_B, ret: LIMIT };
    return { ops: [
      { n: 'Scan + filter + project', i: ROWS, o: MATCH, note: 'materializes only matches, with 2 columns' },
      { n: 'Filter', i: 0, o: 0, note: 'fused into the scan', fused: true },
      { n: 'Limit', i: MATCH, o: LIMIT, note: 'picks 100 from the buffer' }],
      read: ROWS, sent: MATCH, sentB: MATCH * PROJ_B, mat: MATCH, mem: MATCH * PROJ_B, ret: LIMIT };
  }

  /* PLAYGROUND: one query, four plans. Rows read, rows that cross an operator, and peak memory */
  function playground() {
    let model = 'pipe', push = false;
    const flow = h('div', { class: 'c05-flow' }), statBox = h('div', { class: 'sx-stats' }), txt = h('p', { class: 'sx-txt' });
    const paint = () => {
      const p = plan(model, push);
      flow.replaceChildren(...p.ops.flatMap((o, k) => [
        k ? h('div', { class: 'c05-op', style: 'flex:0 0 auto;align-self:center;border:none;background:none' }, '→') : null,
        h('div', { class: 'c05-op' + (o.fused ? ' fused' : '') + (!o.fused && o.i === ROWS ? ' hot' : '') },
          h('b', {}, o.n),
          h('span', { class: 'c05-num' }, o.fused ? 'no rows: fused' : 'in ' + fmt(o.i) + ' · out ' + fmt(o.o)),
          h('div', {}, o.note))]).filter(Boolean));
      statBox.replaceChildren(
        stat('rows read from storage', fmt(p.read)),
        stat('rows that cross an operator', fmt(p.sent)),
        stat('bytes passed between operators', bytes(p.sentB)),
        stat('rows materialized', fmt(p.mat)),
        stat('peak memory', bytes(p.mem)),
        stat('rows returned', fmt(p.ret)));
      const what = model === 'pipe'
        ? 'Pipelined: each row flows up the plan as soon as it is read, so the LIMIT can stop the scan after about ' + fmt(TO_LIMIT) + ' rows.'
        : 'Materialized: each operator finishes its whole input before its parent starts, so the LIMIT cannot stop the scan early.';
      txt.textContent = what + (push ? ' Pushdown is on: the filter and the 2 needed columns go into the scan.' : ' Pushdown is off: the scan sends every column, and the filter runs above it.');
    };
    const modelSeg = seg([{ v: 'pipe', l: 'Pipelined (iterator)' }, { v: 'mat', l: 'Materialized' }], model, v => { model = v; paint(); });
    const pushSeg = seg([{ v: false, l: 'Pushdown off' }, { v: true, l: 'Pushdown on' }], push, v => { push = v; paint(); });
    paint();
    return h('div', { class: 'c05-wrap' },
      h('p', { class: 'c05-note', html: 'Query: SELECT customer_name, total FROM orders WHERE country = \'VN\' AND total &gt; 900 LIMIT 100. Table: ' + fmt(ROWS) + ' rows, ' + ROW_B + ' bytes each, no index (illustrative).' }),
      h('div', { class: 'sx-play' },
        h('div', { class: 'sx-controls' }, modelSeg, pushSeg),
        flow, statBox, txt),
      h('p', { class: 'c05-note' }, 'Numbers are illustrative. The 3 percent match rate is assumed, and the expected scan stop is ' + fmt(TO_LIMIT) + ' rows for LIMIT 100.'));
  }

  /* ---- COMMON PROBLEMS: each demo is a stepper whose final numbers differ between Failure and After fix ---- */
  const CHUNK = 1000000;
  function filterDemo(mode) {
    const good = mode === 'good', states = [];
    states.push({ t: 'Start: the query scans orders with no index. ' + (good ? 'The predicate is pushed into the scan, so only matches cross to the engine.' : 'The scan sends every row to the engine, and the filter runs above it.'), k: 0 });
    for (let k = 1; k <= 10; k++) {
      states.push({ t: 'Chunk ' + k + ' of 10 (1,000,000 rows). ' + (good ? 'The scan keeps ' + fmt(CHUNK * SEL) + ' matches and sends only those.' : 'All ' + fmt(CHUNK) + ' rows are sent, and the filter drops ' + fmt(CHUNK * (1 - SEL)) + ' of them.'), k });
    }
    states[states.length - 1].t = good ? 'Finished: ' + fmt(MATCH) + ' rows crossed from storage, and no row was dropped above the scan.' : 'Finished: ' + fmt(ROWS) + ' rows crossed from storage, and ' + fmt(ROWS - MATCH) + ' were dropped by the filter.';
    return stepper(states, s => [
      h('div', { class: 'c05-bar' }, h('i', { style: 'width:' + (s.k * 10) + '%' })),
      h('div', { class: 'sx-stats' },
        stat('rows crossing from storage', fmt(good ? s.k * CHUNK * SEL : s.k * CHUNK)),
        stat('dropped above the scan', fmt(good ? 0 : s.k * CHUNK * (1 - SEL))))]);
  }

  const COLS = ['order_id', 'customer_id', 'customer_name', 'country', 'city', 'total', 'status', 'created_at', 'updated_at', 'shipping', 'billing', 'phone', 'email', 'coupon', 'tax', 'discount', 'currency', 'channel', 'notes', 'version'];
  function starDemo(mode) {
    const good = mode === 'good', keep = ['customer_name', 'total'];
    const widthB = good ? PROJ_B : ROW_B;
    const states = [
      { t: good ? 'Start: the query names 2 columns, customer_name and total. The other 18 columns stay in storage.' : 'Start: SELECT * asks for all 20 columns, so every column of each row is copied.', on: [], bytes: 0 },
      { t: 'Each of the ' + fmt(MATCH) + ' matching rows is copied into the result buffer, ' + widthB + ' bytes per row.', on: good ? keep : COLS, bytes: MATCH * widthB },
      { t: 'The buffer holds ' + bytes(MATCH * widthB) + ' for the 300,000 matches. The client then reads only 100 rows, but the copy has already been made.', on: good ? keep : COLS, bytes: MATCH * widthB }];
    return stepper(states, s => [
      h('div', { class: 'c05-cols' }, COLS.map(c => h('div', { class: 'c05-col' + (s.on.includes(c) ? (good ? ' keep' : ' on') : '') }, c))),
      h('div', { class: 'sx-stats' }, stat('bytes copied per row', widthB), stat('buffer for matches', s.bytes ? bytes(s.bytes) : '0 B'))]);
  }

  function cteDemo(mode) {
    const good = mode === 'good';
    const states = [{ t: good ? 'Start: the CTE is inlined, so the outer LIMIT 100 drives the scan.' : 'Start: the CTE is materialized (MATERIALIZED), so it must finish before the outer query starts.', rows: 0, temp: 0 }];
    if (good) {
      states.push({ t: 'Read rows one at a time. The filter runs in the scan, and the outer LIMIT counts matches.', rows: TO_LIMIT, temp: 0 });
      states.push({ t: 'After ' + fmt(TO_LIMIT) + ' rows, 100 matches have been returned. The scan stops, and the temporary buffer was never used.', rows: TO_LIMIT, temp: 0 });
    } else {
      for (let k = 1; k <= 10; k++) states.push({ t: 'The CTE scans chunk ' + k + ' of 10 and writes its matches to a temp buffer (' + fmt(k * CHUNK) + ' rows read so far).', rows: k * CHUNK, temp: Math.round(k * CHUNK * SEL) * 200 });
      states.push({ t: 'The CTE is complete: ' + fmt(MATCH) + ' full rows in a temp buffer of ' + bytes(MATCH * ROW_B) + '. The outer query now reads 100 rows.', rows: ROWS, temp: MATCH * ROW_B });
    }
    return stepper(states, s => [
      h('div', { class: 'c05-bar' }, h('i', { style: 'width:' + Math.min(100, s.rows / ROWS * 100) + '%' })),
      h('div', { class: 'sx-stats' }, stat('rows read from storage', fmt(s.rows)), stat('temp buffer', bytes(s.temp)))]);
  }

  function cancelDemo(mode) {
    const good = mode === 'good', CANCEL = 1000000, BATCH = 1024;
    const states = [{ t: 'Start: the query runs over 10,000,000 rows. The client will cancel after 1,000,000 rows.', rows: 0, after: 0, stopped: false }];
    states.push({ t: 'Chunk 1 of 10 runs. The client has not cancelled yet.', rows: CANCEL, after: 0, stopped: false });
    if (good) {
      states.push({ t: 'The client cancels. The operator checks the flag once per batch of 1,024 rows, so it stops at the end of the batch in progress.', rows: CANCEL + BATCH, after: BATCH, stopped: true });
    } else {
      for (let k = 2; k <= 10; k++) states.push({ t: 'The client cancelled, but the flag is only checked at the end of the whole stage. Chunk ' + k + ' of 10 keeps running.', rows: k * CHUNK, after: (k - 1) * CHUNK, stopped: false });
      states[states.length - 1].t = 'Finished: the query ran to the end after the client cancelled. ' + fmt(ROWS - CANCEL) + ' rows of work were wasted.';
    }
    if (good) states[states.length - 1].t = 'Finished: the query stopped after ' + fmt(BATCH) + ' rows past the cancel. ' + fmt(BATCH) + ' rows of work were wasted.'; states[states.length - 1].done = true;
    return stepper(states, s => [
      h('div', { class: 'c05-bar' }, h('i', { style: 'width:' + Math.min(100, s.rows / ROWS * 100) + '%' })),
      h('div', { class: 'sx-stats' }, stat('rows processed', fmt(s.rows)), stat('rows after the cancel', fmt(s.after)), stat('state', s.stopped ? 'stopped' : s.done ? 'ran to the end' : s.after ? 'still running' : 'running'))]);
  }

  const PROBLEMS = [
    { tab: 'Filter after the scan',
      sym: 'the filter keeps ' + fmt(MATCH) + ' rows, but ' + fmt(ROWS) + ' rows cross from storage to the engine first.',
      why: 'This tab\'s query has no LIMIT, so all ' + fmt(MATCH) + ' matches are returned. When the scan does not know the predicate, it must send every row up, and the filter drops most of them. The bytes and calls for the dropped rows are wasted. (With LIMIT 100, a pipeline would stop after about ' + fmt(TO_LIMIT) + ' rows; see the playground.)',
      log: 'representative plan summary, counts illustrative\nSeq Scan on orders (rows out: ' + fmt(ROWS) + ')\n  -> Filter: (country = VN AND total > 900) (rows removed by filter: ' + fmt(ROWS - MATCH) + ')',
      demo: v => filterDemo(v),
      fix: ['Check that the predicate is pushed into the scan. In the plan, the Filter node should sit inside the scan, not above it.', 'Write predicates in a form the scan understands: plain comparisons on a column, not a function of the column, so the engine can use them.', 'Keep the storage format that supports predicate evaluation at the scan, such as file statistics (chapter 3).', 'Verify: rows crossing from storage, in the engine profile, before and after the change.'] },
    { tab: 'SELECT * blocks column pruning',
      sym: 'every query copies all 20 columns, so the buffer for ' + fmt(MATCH) + ' matches is ' + bytes(MATCH * ROW_B) + ' instead of ' + bytes(MATCH * PROJ_B) + '.',
      why: 'The plan can only skip a column when no operator above the scan needs it. SELECT * says that every column is needed, so the scan copies all of them, even the ones the client never reads.',
      log: 'representative plan summary, counts illustrative\nSeq Scan on orders, output: order_id, customer_id, customer_name, country, ... (20 columns)\nbytes per row: ' + ROW_B + '\nbuffer for matches: ' + bytes(MATCH * ROW_B),
      demo: v => starDemo(v),
      fix: ['List the columns the query needs. Do not use SELECT * in a query that feeds a join, a sort or a buffer.', 'Let the views and the application code name columns. A wide view used by many queries can hide the cost.', 'In a columnar store, pruning also saves I/O, because the unread column chunks are not fetched at all.', 'Verify: bytes per row in the plan, and the buffer size for the same query, before and after the change.'] },
    { tab: 'Pipeline breaker holds an oversized intermediate',
      sym: 'a CTE with a LIMIT outside it reads ' + fmt(ROWS) + ' rows and holds ' + bytes(MATCH * ROW_B) + ' in a temp buffer, although only 100 rows are returned.',
      why: 'A materialized CTE is a pipeline breaker: it must finish before its parent starts. The outer LIMIT cannot stop it early, so every match is written to a temp buffer first.',
      log: 'representative plan summary, counts illustrative\nCTE Scan on recent (materialized)\n  Rows Removed by Filter: ' + fmt(ROWS - MATCH) + '\nTemp buffer: ' + bytes(MATCH * ROW_B) + '\nLimit (rows out: 100)',
      demo: v => cteDemo(v),
      fix: ['Remove the MATERIALIZED keyword, so that the CTE is inlined and the LIMIT can stop the scan. (PostgreSQL 12 and later; written from memory, not checked against a live version.)', 'Refer to the CTE only once. A CTE used several times may still be materialized by design, so keep it when reuse saves more than it costs.', 'Filter and project inside the CTE, so the buffer holds narrow rows instead of full ones.', 'Verify: rows read from storage and temp buffer size, in the plan, before and after the change.'] },
    { tab: 'Cancellation ignored inside the engine',
      sym: 'after the client cancels at 1,000,000 rows, the query runs on for ' + fmt(ROWS - 1000000) + ' more rows.',
      why: 'A cancel flag that is only checked between large stages lets the operators run to the end of the stage. The cost of a cancel depends on how often the operators look at the flag.',
      log: 'representative engine log, counts illustrative\nquery 4711: cancel requested at row 1000000\nquery 4711: stage finished at row 10000000\nquery 4711: cancelled after 9000000 rows past the request',
      demo: v => cancelDemo(v),
      fix: ['Check the cancel flag once per batch of rows (for example every 1,024 rows) and once per page, not once per stage.', 'Make the check cheap: a single atomic flag read per batch, so the cost is small compared with the batch.', 'Propagate the cancel to every operator and to the scan threads, so that no fragment keeps running.', 'Verify: rows processed after the cancel request, before and after the change.'] }
  ];

  root.append(
    sec('1 · The problem',
      para('A query returns only 100 rows, but the engine builds a multi-gigabyte intermediate result on the way.'),
      para('Each operator in the plan can copy rows, hold them in memory, or stop early. A bad choice makes every later step pay for rows that the query will never return.'),
      h('p', { class: 'sx-q', html: 'How can an engine return 100 rows without moving or materializing the millions of rows that the query does not need?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> run operators as a pipeline, and avoid moving or materializing data that the query does not need.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Query plan:</b> a tree (a DAG in general) of operators. Data flows from the leaves to the root, and the root output is the query result. The same logical plan can run in many physical ways.',
        '<b>Pipeline:</b> a chain of operators where tuples flow without an intermediate store. A <b>pipeline breaker</b> must see all of its input before it emits: the build side of a join, a subquery, or ORDER BY (sorting is chapter 6).',
        '<b>Processing model, iterator (Volcano):</b> each operator implements Next, which returns one tuple or an end marker. Each row is pushed up as far as it can go before the next is read. LIMIT works because a parent can stop calling Next. Almost every row-based DBMS uses this model.',
        '<b>Processing model, materialization:</b> each operator processes all of its input and returns all of its output at once. Fewer calls suit OLTP, where queries touch few rows. Large intermediate results must spill to disk, and a LIMIT cannot stop the child early.',
        '<b>Processing model, vectorized (batch):</b> the iterator model, but Next returns a batch of tuples. Fewer calls and SIMD-friendly loops suit OLAP. The details, the CPU effects and the selection and bitmap internals are in chapter 10.',
        '<b>Operator output, early and late materialization:</b> early materialization builds the full output tuples inside the operator, which is simple for row stores. Late materialization passes only record ids or column offsets, and stitches the columns together later. The 15-721 notes say it is generally the better choice for column stores in OLAP.',
        '<b>Operator state:</b> an operator keeps state between Next calls: a scan cursor, a hash table, a running sum or buffered rows. A pipeline breaker holds its state until its input ends, and a cancelled query must release it.',
        '<b>Projection pushdown:</b> tell the scan which columns the operators above need. SELECT * says every column is needed, so the scan copies all of them (problem 2 in section 4).',
        '<b>Predicate pushdown:</b> evaluate the WHERE conditions inside the scan, so rows that fail never cross to the engine (problem 1 in section 4).',
        '<b>Query cancellation:</b> the engine checks a cancel flag. How often the operators check it decides how much work runs after a cancel (problem 4 in section 4).',
        '<b>MonetDB/X100:</b> the analysis by Boncz et al. (CIDR 2005), cited in the course notes, showed that row-at-a-time execution wastes CPU on per-tuple calls, branch misprediction and cache misses. That work motivated batch (vectorized) execution, which chapter 10 covers in detail.',
        '<b>Adaptive query processing:</b> the engine changes the plan or expression tree while it runs, using statistics gathered during execution. The 15-721 notes cite Velox as an example, which reorders predicates by selectivity and cost, and say only a few systems do this.',
        '<b>Control flow and data flow:</b> control flow is how the engine calls operators. Data flow is what each operator sends: whole rows (NSM) or subsets of columns (DSM).',
        '<b>Processing direction:</b> pull (top-to-bottom) starts at the root and calls its children, so tuples pass by function call and LIMIT is easy. Push (bottom-to-top) starts at the leaves, and operators can be fused into one loop for tighter control of caches and registers.',
        '<b>Filter representation (one line):</b> a selection vector lists the indexes of valid rows in a batch, and a bitmap marks them with one bit per row. Chapter 10 covers both in the vectorized context.',
        '<b>Sequential scan:</b> visits every page through the buffer pool (chapter 2) with a cursor. It is usually the least efficient way to read, so it has many optimizations: compression, prefetching, buffer pool bypass for large scans, parallel scans, late materialization in column stores, heap clustering, result caching, sampling for approximate answers, and code specialization.',
        '<b>Zone maps:</b> see chapter 3 (per-page minimum and maximum statistics).',
        '<b>Index scan and multi-index scan:</b> the planner picks an index from the columns, the predicate shape, the value domains, and uniqueness. A multi-index scan computes sets of record ids from several indexes with bitmaps, hash tables or Bloom filters, intersects them, then fetches the rows. Index structures are chapter 4.',
        '<b>Modification queries:</b> INSERT, UPDATE and DELETE check constraints and update indexes. UPDATE and DELETE get record ids from their child and must track the rows they have changed. The Halloween problem happens when an update moves a row so that the scan visits it again. The fix is to keep the set of changed record ids.',
        '<b>Expression evaluation:</b> a WHERE clause is an expression tree. Walking the tree for each row is slow. The alternatives are to compile the expression, or to evaluate it on a batch. Constant folding and common sub-expression elimination shrink the tree first.',
        '<b>Parallel execution:</b> inter-query parallelism runs queries side by side. Intra-query parallelism splits one query into fragments: intra-operator (horizontal) parallelism with exchange operators (gather, distribute, repartition), inter-operator (pipelined) parallelism, and bushy plans. Scheduling of those tasks, and the process models (process per worker, thread per worker, embedded), are chapter 10.',
        '<b>Parallel and distributed, and I/O parallelism:</b> a parallel DBMS has nodes on a fast interconnect. A distributed DBMS has slow links and failures to handle (chapter 14). I/O parallelism spreads files over disks with RAID, or partitions the database over devices.',
        '<b>Engine internals (one line each):</b> Apache Arrow is the columnar intermediate format that operators can share without copying (layout in chapter 3, transfer in chapter 8). Velox is a single-node C++ execution library with an expression engine (course notes; adaptive optimization is chapter 9).'
      ].map(x => '<li>' + x + '</li>').join('') }),
      para('<b>Owned elsewhere:</b> vectorized and compiled execution, CPU effects and scheduling are chapter 10; choosing a plan and adaptive optimization are chapter 9; pages and the buffer pool are chapter 2; index structures are chapter 4.')),
    sec('3 · Playground: one query, four physical plans', playground()),
    sec('4 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
