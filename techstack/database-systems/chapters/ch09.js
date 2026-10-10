/* Chapter 10 "Query Execution Models" (index 9, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L13 Query Execution I (plans, processing models, access methods, modification queries, expressions); CMU 15-721 L04 and L05 Query Execution and Processing I and II (iterator, materialization and vectorized models, push against pull, selection vectors, Arrow, adaptive execution).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a Volcano pull with LIMIT, a calls-and-memory comparison of three processing models, a filter pushed down to storage, and the Halloween problem. Counts and sizes illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. Volcano: the root pulls one tuple at a time, and LIMIT simply stops pulling ---- */
  const OPS = [['Limit', '100'], ['Project', 'name, total'], ['Filter', "VN and total > 900"], ['Scan', 'orders']];
  const OY = i => 84 + i * 62, OX = 200;
  const volcano = {
    id: 'volcano-pull', label: 'Volcano pull', desc: 'Each operator offers next(), which returns one tuple. The root pulls, the scan reads one row, and each tuple climbs as far as it can before the next one is read (counts illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      "SELECT customer_name, total FROM orders WHERE country = 'VN' AND total > 900 LIMIT 100;",
      'Limit -> Project -> Filter -> Seq Scan on orders',
      'Limit calls next() on Project, Project on Filter, Filter on Scan',
      'Filter: a failing row is dropped, then Filter calls Scan again',
      'after 100 rows Limit stops calling next(): the scan never reads the rest',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one tuple at a time. About 3% of rows match. Illustrative.',
      header: s => ({ left: 'rows read ' + (s.read || 0) + ' · returned ' + (s.out || 0), right: s.note || '' }),
      draw(P, s) {
        OPS.forEach(([n, sub], i) => P.chip('op' + i, { x: OX, y: OY(i), w: 190, h: 44, label: n, sub, tone: s.stopped ? (i === 3 ? 'ok' : 'info') : (s.active === i ? 'cursor' : 'info'), hl: s.active === i }));
        if (s.calls != null) for (let i = 0; i < 3; i++) if (i >= s.calls[0] && i <= s.calls[1]) P.line('c' + i, OX + 30, OY(i) + 44, OX + 30, OY(i + 1), { tone: 'cursor', arrow: true, label: i === 0 ? 'next()' : '', dx: -26 });
        if (s.t) P.chip('tup', { x: 420, y: OY(s.t.lvl) + 7, w: 110, h: 30, label: s.t.label, tone: s.t.tone, small: false });
        if (s.t && s.t.why) P.text('why', { x: 540, y: OY(s.t.lvl) + 26, t: s.t.why, cls: 'xs tone-' + (s.t.tone === 'bad' ? 'bad' : 'ok') });
        P.text('hh', { x: 30, y: 270, t: 'heap pages', cls: 'mut sm' });
        P.box('heap', { x: 30, y: 278, w: 120, h: 40, tone: s.stopped ? 'ok' : 'mut', label: s.stopped ? 'read 3,334' : 'orders', cls: 'sm' });
        if (s.mem) P.chip('mem', { x: 420, y: 300, w: 190, h: 34, label: s.mem, tone: s.memTone || 'ok', small: true });
      }
    }),
    bug: [
      { log: 'The plan is a tree of operators. Limit sits on top and Seq Scan at the bottom. No operator stores a full result.', callout: 'A plan is a tree of operators', code: 1,
        state: {}, stats: [{ l: 'operators', v: '4' }, { l: 'rows stored', v: '0', cls: 'ok' }] },
      { log: 'The client wants rows. Limit calls next() on Project, which calls Filter, which calls Scan. The call travels down the tree.', callout: 'The root pulls: next() goes down', code: 2,
        state: { calls: [0, 2], active: 3 }, stats: [{ l: 'next() calls', v: '3' }] },
      { log: 'The scan reads the first row, order r1 from Singapore, and hands it up to Filter. One row, nothing else is read yet.', callout: 'Scan reads one row: r1, country SG', code: 2,
        state: { active: 3, t: { lvl: 3, label: 'r1 SG 120', tone: 'info' }, read: 1 }, stats: [{ l: 'rows read', v: '1' }] },
      { log: 'Filter tests r1. The country is not VN, so the row is dropped, and Filter calls next() on Scan again.', callout: 'Filter drops r1 and asks again', code: 3,
        state: { active: 2, t: { lvl: 2, label: 'r1 SG 120', tone: 'bad', why: 'not VN' }, read: 1, calls: [2, 2] }, stats: [{ l: 'rows read', v: '1' }, { l: 'rows passed', v: '0', cls: 'warn' }] },
      { log: 'The scan reads r2. It is from Vietnam but its total is 450, which is not above 900. Dropped again.', callout: 'r2 is VN but total 450: dropped', code: 3,
        state: { active: 2, t: { lvl: 2, label: 'r2 VN 450', tone: 'bad', why: 'total too low' }, read: 2, calls: [2, 2] }, stats: [{ l: 'rows read', v: '2' }, { l: 'rows passed', v: '0', cls: 'warn' }] },
      { log: 'r3 is VN with total 950. It passes the filter, climbs through Project, and arrives at Limit, which counts one row.', callout: 'r3 passes and climbs to the top', moment: true, code: 2,
        state: { active: 0, t: { lvl: 0, label: 'r3 VN 950', tone: 'ok', why: 'row 1 of 100' }, read: 3, out: 1 }, stats: [{ l: 'rows read', v: '3' }, { l: 'rows returned', v: '1', cls: 'ok' }] },
      { log: 'At a 3% match rate, 100 matches take about 100 / 0.03 = 3,334 rows read. Limit then stops calling next().', callout: 'Limit stops after 100 rows', code: 4,
        state: { stopped: 1, read: 3334, out: 100, mem: 'one 8 KB page held', note: 'LIMIT reached' }, stats: [{ l: 'rows read', v: '3,334', cls: 'ok' }, { l: 'rows returned', v: '100' }] },
      { log: 'A materializing plan would run each operator to completion first. It would read all 10,000,000 rows and hold about 2 GB before Limit saw one.', callout: 'Materialize-all would read 10,000,000 rows', code: 4,
        state: { stopped: 1, read: 3334, out: 100, mem: 'materialized: ~2 GB', memTone: 'bad', note: 'compare' }, stats: [{ l: 'pipelined', v: '3,334 rows', cls: 'ok' }, { l: 'materialized', v: '10,000,000 rows', cls: 'bad' }],
        takeaway: 'A pipeline lets LIMIT end the work early. Each row travels only as far as it needs to, and nothing is stored.' },
    ],
  };

  /* ---- 2. Pushdown: how many rows and bytes cross from storage into the engine ---- */
  const SX = i => 42 + (i % 6) * 40, SY = i => 112 + Math.floor(i / 6) * 32;
  const EX = i => 372 + (i % 6) * 40, EY = i => 112 + Math.floor(i / 6) * 32;
  const MATCH = 13;
  const push = {
    id: 'pushdown', label: 'Pushdown', desc: 'Thirty sample rows stand for 10 million. One matches the filter. Where the filter runs decides how many rows cross from storage into the engine (counts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "SELECT * FROM orders WHERE country = 'VN' AND total > 900;",
      'filter in the engine: every row is copied out of storage first',
      "predicate pushdown: the scan tests country and total itself",
      'SELECT customer_name, total ...  -- projection pushdown: 2 of 20 columns',
      '-- SELECT * says every column is needed, so none can be skipped',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 30 sample rows for 10,000,000, one match. Illustrative.',
      header: s => ({ left: 'rows crossed ' + (s.crossed || 0) + ' of 30', right: s.right || 'storage and engine' }),
      draw(P, s) {
        P.text('hs', { x: 30, y: 84, t: 'storage', cls: 'mut sm' });
        P.box('sp', { x: 30, y: 92, w: 256, h: 176, tone: 'mut', label: '', dash: true });
        P.text('he', { x: 360, y: 84, t: 'engine', cls: 'mut sm' });
        P.box('ep', { x: 360, y: 92, w: 256, h: 176, tone: 'mut', label: '', dash: true });
        P.line('bd', 323, 96, 323, 264, { tone: 'mut', dash: true });
        const pushed = s.mode === 'push' || s.mode === 'proj';
        for (let i = 0; i < 30; i++) {
          const match = i === MATCH;
          const cross = s.mode ? (pushed ? match : true) : false;
          const dropped = s.drop && !match && cross;
          const p = cross ? { x: EX(i), y: EY(i) } : { x: SX(i), y: SY(i) };
          const w = cross && s.mode === 'proj' ? 14 : 34;
          P.box('r' + i, { x: p.x, y: p.y, w, h: 24, tone: dropped ? 'bad' : (s.mark && match ? 'ok' : (cross && match ? 'ok' : 'info')), label: '', op: dropped ? 0.35 : 1, sw: match && s.mark ? 2.6 : 1.2 });
        }
        if (s.filterAt === 'engine') P.chip('flt', { x: 372, y: 286, w: 232, h: 38, label: 'Filter in the engine', sub: '', tone: 'warn' });
        if (s.filterAt === 'scan') P.chip('flt', { x: 42, y: 286, w: 232, h: 38, label: 'Filter inside the scan', sub: '', tone: 'ok' });
        if (s.bytes) P.chip('byt', { x: 372, y: 330, w: 232, h: 12, label: s.bytes, tone: s.bytesTone, small: true });
      }
    }),
    bug: [
      { log: 'Thirty sample rows sit in storage. Only one of them, the highlighted one, matches country = VN and total > 900.', callout: 'In storage: 1 match among 30 rows', code: 0,
        state: { mark: 1 }, stats: [{ l: 'rows', v: '30' }, { l: 'matches', v: '1', cls: 'ok' }] },
      { log: 'The filter runs in the engine, so the scan has to hand over every row first. All thirty rows cross the boundary.', callout: 'Filter in the engine: all rows cross', code: 1,
        state: { mode: 'engine', filterAt: 'engine', crossed: 30, mark: 1, right: 'filter in the engine' }, stats: [{ l: 'rows crossed', v: '30 of 30', cls: 'bad' }] },
      { log: 'The engine tests each row and throws away twenty-nine. Almost all of the copying was wasted.', callout: 'The engine drops 29 of the 30', moment: true, code: 1,
        state: { mode: 'engine', filterAt: 'engine', crossed: 30, drop: 1, mark: 1, right: 'filter in the engine' }, stats: [{ l: 'rows kept', v: '1', cls: 'ok' }, { l: 'rows wasted', v: '29', cls: 'bad' }] },
      { log: 'Predicate pushdown moves the test into the scan. The scan checks country and total on the page and sends up only the match.', callout: 'Pushdown: the scan tests the rows', code: 2,
        state: { mode: 'push', filterAt: 'scan', crossed: 1, mark: 1, right: 'predicate pushdown' }, stats: [{ l: 'rows crossed', v: '1 of 30', cls: 'ok' }, { l: 'at 10M rows', v: '300,000', cls: 'ok' }] },
      { log: 'With SELECT * the matching row crosses with all 20 columns. For 300,000 matches the engine buffers about 60 MB.', callout: 'SELECT *: all 20 columns cross', code: 4,
        state: { mode: 'push', filterAt: 'scan', crossed: 1, mark: 1, right: 'SELECT *', bytes: '60 MB for 300,000 rows', bytesTone: 'warn' }, stats: [{ l: 'columns', v: '20', cls: 'warn' }, { l: 'buffer', v: '60 MB', cls: 'warn' }] },
      { log: 'Projection pushdown tells the scan to return only the two columns the query names. The row is narrow, and the buffer shrinks to 9.6 MB.', callout: 'Projection: only 2 columns cross', code: 3,
        state: { mode: 'proj', filterAt: 'scan', crossed: 1, mark: 1, right: 'projection pushdown', bytes: '9.6 MB for 300,000 rows', bytesTone: 'ok' }, stats: [{ l: 'columns', v: '2', cls: 'ok' }, { l: 'buffer', v: '9.6 MB', cls: 'ok' }],
        takeaway: 'Move filters and column lists to the scan. Rows and columns that never cross are the cheapest ones.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A sales dashboard runs <code>SELECT customer_name, total FROM orders WHERE country = 'VN' AND total &gt; 900 LIMIT 100</code> on a 10,000,000-row orders table with no index (illustrative). It returns 100 rows, yet memory on the database node jumps by about 2 GB while the query runs. On-call sees the engine profile report 10,000,000 rows read from storage for a result that fits on one screen.",
    "predict": {
      "q": "About 3 percent of rows match the filter (illustrative). If each row flows up the plan as soon as the scan reads it, how many rows must the scan read before <code>LIMIT 100</code> is satisfied?",
      "opts": [
        "All 10,000,000, because the scan always finishes before the filter starts",
        "About 3,334, because the limit can stop the scan once 100 rows have matched",
        "Exactly 100, because the limit is passed down to storage",
        "300,000, because every matching row must be found first"
      ],
      "ans": 1,
      "why": "In a pipeline the limit stops asking for rows after 100 matches. At a 3 percent match rate that happens after about 100 / 0.03 = 3,334 rows read, not 10,000,000."
    },
    "diagnose": [
      {
        "t": "Filter after the scan",
        "sym": "The filter keeps 300,000 rows, but 10,000,000 rows cross from storage to the engine first.",
        "ctx": "A query with no LIMIT returns 300,000 matches, yet the profile shows the full table crossing from storage and 9,700,000 rows removed above the scan.",
        "why": "When the scan does not know the predicate, it must send every row up, and the filter drops most of them. The bytes and calls for the dropped rows are wasted. (With LIMIT 100, a pipeline would stop after about 3,334 rows.)",
        "log": "representative plan summary, counts illustrative\nSeq Scan on orders (rows out: 10,000,000)\n  -> Filter: (country = VN AND total > 900) (rows removed by filter: 9,700,000)",
        "fix": [
          "Measure first: check that the predicate is pushed into the scan. In the plan, the Filter node should sit inside the scan, not above it.",
          "Write predicates in a form the scan understands: plain comparisons on a column, not a function of the column, so the engine can use them.",
          "Keep the storage format that supports predicate evaluation at the scan, such as file statistics (chapter 3).",
          "Verify: rows crossing from storage, in the engine profile, before and after the change."
        ]
      },
      {
        "t": "SELECT * blocks column pruning",
        "sym": "Every query copies all 20 columns, so the buffer for 300,000 matches is 60 MB instead of 9.6 MB.",
        "ctx": "The client reads only two columns, but the plan output lists all 20 and the buffer for matches is 60 MB.",
        "why": "The plan can only skip a column when no operator above the scan needs it. SELECT * says that every column is needed, so the scan copies all of them, even the ones the client never reads.",
        "log": "representative plan summary, counts illustrative\nSeq Scan on orders, output: order_id, customer_id, customer_name, country, ... (20 columns)\nbytes per row: 200\nbuffer for matches: 60 MB",
        "fix": [
          "Measure first: read bytes per row and the output column list in the plan for the query.",
          "List the columns the query needs. Do not use SELECT * in a query that feeds a join, a sort or a buffer.",
          "Let the views and the application code name columns. A wide view used by many queries can hide the cost.",
          "In a columnar store, pruning also saves I/O, because the unread column chunks are not fetched at all.",
          "Verify: bytes per row in the plan, and the buffer size for the same query, before and after the change."
        ]
      },
      {
        "t": "Pipeline breaker holds an oversized intermediate",
        "sym": "A CTE with a LIMIT outside it reads 10,000,000 rows and holds 60 MB in a temp buffer, although only 100 rows are returned.",
        "ctx": "The query returns 100 rows, but the plan shows a materialized CTE Scan and a 60 MB temp buffer.",
        "why": "A materialized CTE is a pipeline breaker: it must finish before its parent starts. The outer LIMIT cannot stop it early, so every match is written to a temp buffer first.",
        "log": "representative plan summary, counts illustrative\nCTE Scan on recent (materialized)\n  Rows Removed by Filter: 9,700,000\nTemp buffer: 60 MB\nLimit (rows out: 100)",
        "fix": [
          "Measure first: read rows read from storage and the temp buffer size for the CTE in the plan.",
          "Remove the MATERIALIZED keyword, so that the CTE is inlined and the LIMIT can stop the scan. (PostgreSQL 12 and later; the source notes this was written from memory, not checked against a live version.)",
          "Refer to the CTE only once. A CTE used several times may still be materialized by design, so keep it when reuse saves more than it costs.",
          "Filter and project inside the CTE, so the buffer holds narrow rows instead of full ones.",
          "Verify: rows read from storage and temp buffer size, in the plan, before and after the change."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L13 Query Execution I and CMU 15-721 L04-L05 Query Execution and Processing I and II (notes in output/pdf)', href: '../../output/pdf/cmu-15445-fall2024/notes/13-queryexecution1.pdf' };

  /* ---- 2. Processing models: how many calls, and how many rows buffered, per model ---- */
  const MD = [
    { id: 'it', name: 'Iterator', calls: 36, mem: 1, best: 'simple, LIMIT stops early' },
    { id: 'mat', name: 'Materialization', calls: 3, mem: 18, best: 'tiny results, OLTP' },
    { id: 'vec', name: 'Vectorized', calls: 9, mem: 4, best: 'scans, SIMD, OLAP' },
  ];
  const models = {
    id: 'processing-models', label: 'Processing models', desc: 'The same plan, Scan then Filter then Project, over 12 rows, 6 of which pass. Each model passes data between operators differently: one row, all rows, or a batch of four (counts follow from the model, rows illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'Project -> Filter -> Scan    12 rows, the filter keeps 6',
      'iterator: every row crosses every operator through its own next() call',
      '  12 rows x 3 operators = 36 calls, one row in flight',
      'materialization: each operator processes all its input, returns all its output',
      '  3 calls, but 12 rows and then 6 rows are held between operators',
      'vectorized: next() returns a batch of 4 rows',
      '  3 batches x 3 operators = 9 calls, one batch of 4 in flight',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 12 rows, batch of 4, 3 operators. Counts follow from the model.',
      header: s => ({ left: s.hl || 'same plan, three ways to pass rows', right: '' }),
      draw(P, s) {
        const shown = s.show || [];
        P.text('h1', { x: 40, y: 86, t: 'operator calls', cls: 'mut sm' });
        P.text('h2', { x: 40, y: 206, t: 'rows buffered between operators', cls: 'mut sm' });
        MD.forEach((m, i) => {
          const on = shown.includes(m.id), tone = m.id === 'it' ? 't0' : m.id === 'mat' ? 't1' : 't2';
          P.text('n1' + i, { x: 40, y: 118 + i * 28, t: m.name, cls: 'sm' });
          P.text('n2' + i, { x: 40, y: 238 + i * 28, t: m.name, cls: 'sm' });
          if (on) {
            P.box('c' + i, { x: 170, y: 102 + i * 28, w: Math.max(6, m.calls / 36 * 340), h: 22, tone, label: '' });
            P.text('cv' + i, { x: 170 + Math.max(6, m.calls / 36 * 340) + 8, y: 118 + i * 28, t: String(m.calls), cls: 'sm' });
            P.box('m' + i, { x: 170, y: 222 + i * 28, w: Math.max(6, m.mem / 18 * 340), h: 22, tone, label: '' });
            P.text('mv' + i, { x: 170 + Math.max(6, m.mem / 18 * 340) + 8, y: 238 + i * 28, t: String(m.mem), cls: 'sm' });
          }
          if (s.verdict && on) P.text('b' + i, { x: 430, y: 118 + i * 28, t: m.best, cls: 'xs mut' });
        });
      }
    }),
    bug: [
      { log: 'The plan has three operators over 12 rows. The filter keeps 6 of them. The question is how rows move from one operator to the next.', callout: 'One plan, three ways to move rows', code: 0, state: {}, stats: [{ l: 'operators', v: '3' }, { l: 'rows', v: '12' }] },
      { log: 'Iterator model: each operator offers next() and returns one row. Every row crosses three operators, so 36 calls. Memory is tiny, one row in flight, but each call is a function call per row per operator.', callout: 'Iterator: 36 calls, one row in flight', code: 2, state: { show: ['it'], hl: 'iterator model' }, stats: [{ l: 'calls', v: '36', cls: 'bad' }, { l: 'rows buffered', v: '1', cls: 'ok' }] },
      { log: 'Materialization model: each operator takes all its input, produces all its output and returns it once. Only 3 calls, but the scan output of 12 rows and the filter output of 6 rows are both held in memory.', callout: 'Materialization: 3 calls, 18 rows held', code: 4, state: { show: ['it', 'mat'], hl: 'materialization model' }, stats: [{ l: 'calls', v: '3', cls: 'ok' }, { l: 'rows buffered', v: '18', cls: 'bad' }] },
      { log: 'Vectorized model: next() returns a batch of rows, here four. 3 batches times 3 operators is 9 calls, and only one small batch is in flight. A batch is a tight loop over an array.', callout: 'Vectorized: 9 calls, batch of 4', moment: true, code: 6, state: { show: ['it', 'mat', 'vec'], hl: 'vectorized model' }, stats: [{ l: 'calls', v: '9', cls: 'ok' }, { l: 'rows buffered', v: '4', cls: 'ok' }] },
      { log: 'The batch is the compromise. Calls fall by the batch size, memory stays small, and the inner loop over a batch suits caches and SIMD. Each model has a job where it wins.', callout: 'Each model wins somewhere', code: 6, state: { show: ['it', 'mat', 'vec'], verdict: 1, hl: 'where each model fits' }, stats: [{ l: 'analytics', v: 'vectorized', cls: 'ok' }],
        takeaway: 'Per-row calls cost more than the work they carry. Passing batches keeps memory small and makes the inner loop fast.' },
    ],
  };

  /* ---- 4. Halloween problem: an update through an index can move a row ahead of the scan and be updated twice ---- */
  const HX = i => 40 + i * 140;
  const hall = {
    id: 'halloween', label: 'Halloween problem', desc: 'UPDATE emp SET salary = salary + 20 WHERE salary < 110, run by scanning an index on salary in order. An update moves the row to a later place in the index, where the same scan finds it again (values illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'CREATE INDEX emp_salary ON emp (salary);',
      'UPDATE emp SET salary = salary + 20 WHERE salary < 110;   -- scan the index in salary order',
      '-- visit A (80): becomes 100, which sorts after B (90), still ahead of the scan',
      '-- visit B (90): becomes 110, A (100) is next in the index',
      '-- the scan reaches A again: 100 < 110 passes, A becomes 120. A got two raises',
      '-- fix: collect the matching record IDs first, then update them (a pipeline breaker)',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 4 rows, an index on salary, ties broken by name. Illustrative.',
      header: s => ({ left: s.hl || 'index on salary, scanned in order', right: s.rt || '' }),
      draw(P, s) {
        P.text('hh', { x: 40, y: 86, t: 'index entries in key order (smallest first)', cls: 'mut sm' });
        (s.keys || []).forEach(([n, sal], i) => {
          const u = (s.upd || {})[n] || 0;
          P.chip('r' + n, { x: HX(i), y: 100, w: 120, h: 52, label: n + ' · ' + sal, sub: u ? 'raised x' + u : 'not raised', tone: u > 1 ? 'bad' : s.cur === n ? 'cursor' : u ? 'ok' : 'info' });
        });
        if (s.curIdx != null) P.line('cur', HX(s.curIdx) + 60, 182, HX(s.curIdx) + 60, 156, { tone: 'cursor', arrow: true, sw: 2.2 });
        if (s.curIdx != null) P.text('ct', { x: HX(s.curIdx) + 60, y: 198, t: 'scan is here', cls: 'xs', anchor: 'middle' });
        (s.order || []).forEach((n, i) => P.chip('v' + i, { x: 40 + i * 78, y: 260, w: 70, h: 34, label: n, sub: '', tone: (s.order.indexOf(n) !== i) ? 'bad' : 'info', small: true }));
        if (s.order) P.text('vo', { x: 40, y: 250, t: 'rows visited, in order', cls: 'mut xs' });
        if (s.note) P.chip('nt', { x: 40, y: 304, w: 400, h: 30, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Four rows are in the salary index. The update raises every salary below 110 by 20, so each employee should get exactly one raise.', callout: 'Everyone below 110 gets one raise', code: 1,
        state: { keys: [['A', 80], ['B', 90], ['C', 100], ['D', 120]] }, stats: [{ l: 'expected raises', v: 'A, B, C once' }] },
      { log: 'The scan visits A at 80 and writes 100. The index entry for A has to move to the new key.', callout: 'Visit A: 80 becomes 100', code: 2,
        state: { keys: [['A', 100], ['B', 90], ['C', 100], ['D', 120]], cur: 'A', curIdx: 0, upd: { A: 1 }, order: ['A'] }, stats: [{ l: 'A raised', v: '1' }] },
      { log: 'The entry for A is now sorted after B, in front of the scan position. The scan moves on to B at 90 and writes 110, which moves B further right.', callout: 'A moved ahead of the scan; B becomes 110', code: 3,
        state: { keys: [['A', 100], ['C', 100], ['B', 110], ['D', 120]], cur: 'B', curIdx: 2, upd: { A: 1, B: 1 }, order: ['A', 'B'], note: 'A (100) is again in front of the scan' }, stats: [{ l: 'raises', v: 'A 1, B 1' }] },
      { log: 'The scan finds A at 100, which is still below 110, so the predicate passes and A is updated again to 120. A has now received two raises.', callout: 'A is found again: second raise', moment: true, code: 4,
        state: { keys: [['C', 100], ['B', 110], ['A', 120], ['D', 120]], cur: 'A', curIdx: 2, upd: { A: 2, B: 1 }, order: ['A', 'B', 'A'], note: 'A raised twice: 80 -> 120 instead of 100', noteTone: 'bad' }, stats: [{ l: 'A raised', v: '2', cls: 'bad' }] },
      { log: 'C at 100 is updated once to 120. The next key, B at 110, no longer passes salary < 110, and the scan stops. The result is wrong although every step was legal.', callout: 'Result: A has two raises', code: 4,
        state: { keys: [['B', 110], ['A', 120], ['C', 120], ['D', 120]], cur: 'C', curIdx: 2, upd: { A: 2, B: 1, C: 1 }, order: ['A', 'B', 'A', 'C'], note: 'wrong: A ended at 120, expected 100', noteTone: 'bad' }, stats: [{ l: 'A salary', v: '120 (should be 100)', cls: 'bad' }] },
      { log: 'The fix is to separate finding from changing. First collect the record IDs of all matching rows, which is a pipeline breaker, then update exactly those rows. Each row is visited once.', callout: 'Collect the record IDs first, then update', code: 5,
        state: { keys: [['B', 110], ['C', 120], ['A', 100], ['D', 120]], upd: { A: 1, B: 1, C: 1 }, order: ['A', 'B', 'C'], note: 'IDs collected up front: each row updated once', noteTone: 'ok' }, stats: [{ l: 'raises', v: 'A 1, B 1, C 1', cls: 'ok' }],
        takeaway: 'A scan that feeds updates must not see its own changes. Databases materialize the target rows, or avoid the index on the updated column.' },
    ],
  };

  const EXPLAIN = `
<h3>1. A plan is a tree of operators</h3>
<p>The optimizer turns SQL into a <b>query plan</b>: a tree of operators. Data flows from the leaves, the scans, up to the root, which returns the result. An operator such as a scan, filter, projection, join or aggregation takes input rows and produces output rows. Some operators can pass each row along as it arrives. Others, the <b>pipeline breakers</b>, must see all of their input before they can produce any output: a hash join build, a sort, an aggregate. The breakers cut the plan into <b>pipelines</b>, and the pipelines are the units that later chapters run in parallel.</p>
<figure class="mm" aria-label="Flowchart: two pipelines of a hash join plan separated by pipeline breakers" style="--diagram-width:304px">
  <img src="diagrams/ch09-pipelines.svg" alt="Flowchart: pipeline 1 scans customers and builds a hash table, which is a pipeline breaker. Pipeline 2 scans orders, filters, probes the hash table and computes a partial aggregate, which is another pipeline breaker, then outputs. A dotted edge says the hash table must be finished before probing starts.">
  <figcaption>Flowchart: a hash join plan is two pipelines. The build must finish before the probe begins.</figcaption>
</figure>

<h3>2. Processing models</h3>
<p>The <b>iterator model</b>, also called Volcano or pipeline, gives each operator a <code>next()</code> method that returns one row. The root calls <code>next()</code> on its child, which calls its own child, down to the scan. It is simple, it needs little memory, and a <code>LIMIT</code> can stop the whole tree by simply not calling <code>next()</code> again. The cost is one function call per row per operator. The <b>materialization model</b> lets each operator process all its input and return all its output as one result. It has almost no call overhead and is a good fit for OLTP queries with tiny results, but a big intermediate result must sit in memory. The <b>vectorized model</b> returns a <b>batch</b> of rows per call. It keeps the pipeline and the small memory footprint, cuts the calls by the batch size, and runs a tight loop on an array: this is why analytical engines use it.</p>
<figure class="mm" aria-label="Flowchart: pull model calls next from the root downward, push model sends tuples upward from the scan" style="--diagram-width:216px">
  <img src="diagrams/ch09-pull-push.svg" alt="Flowchart: in the pull model the root calls next on the filter, which calls next on the scan, and tuples return upward. In the push model the scan loop sends each tuple to the filter, which sends the survivors to the root.">
  <figcaption>Flowchart: pull and push move the same rows in opposite control directions.</figcaption>
</figure>
<p>The direction is a separate choice. <b>Pull</b> (top to bottom) is the iterator style: the consumer asks. <b>Push</b> (bottom to top) lets the scan drive and send rows to its parents, which gives tighter control of caches and registers, and is the basis of compiled and some vectorized engines (chapter 15).</p>

<h3>3. Access methods: how a scan reads the table</h3>
<p>A <b>sequential scan</b> reads every page. Optimizations: prefetching the next pages, a bypass of the buffer pool for large scans, <b>late materialization</b> in column stores (delay stitching columns into rows), <b>heap clustering</b> (store rows in index order), and <b>zone maps</b> that skip pages whose min and max cannot match the filter. An <b>index scan</b> uses an index to pick the pages. The optimizer chooses by selectivity: an index wins when the filter keeps few rows and loses when it keeps many, because each match is a random read. A <b>multi-index scan</b> computes the matching record IDs from each index, combines them with a bitmap union or intersection, and fetches the rows once. A filter that is cheap and selective is best <b>pushed down</b> into the scan, so fewer rows cross into the engine.</p>

<h3>4. Modification queries and the Halloween problem</h3>
<p><code>INSERT</code>, <code>UPDATE</code> and <code>DELETE</code> are operators too. They take rows from a child operator and change the table. An update fed by an index scan on the very column it changes can move a row ahead of the scan, so the scan visits the row again. This is the <b>Halloween problem</b>, found at IBM on 31 October while building System R. Engines avoid it by collecting the record IDs of the target rows before changing any, or by tracking which rows were already updated.</p>

<h3>5. Expressions, filters and intermediate data</h3>
<p>A predicate such as <code>total &gt; 900 AND country = 'VN'</code> is an <b>expression tree</b>. The simple method walks the tree for every row, which is slow. Faster engines evaluate it with batch kernels, or compile it (chapter 15). In vectorized engines the result of a filter is a <b>selection vector</b>, a list of the positions that passed, or a <b>bitmap</b>, one bit per row. The rows themselves do not move, so the next operator works only on the selected positions. Between operators and across systems, a columnar in-memory format such as <b>Apache Arrow</b> avoids a conversion at every boundary. <b>Adaptive query processing</b> goes further: the engine watches real row counts while it runs and changes the plan, such as the join order or an operator, when the estimate was wrong.</p>

<h3>6. The trade-off</h3>
<p>One row at a time is simple and flexible and pays a call per row. All rows at a time pays memory. A batch is the compromise and needs operators written for arrays. Pushing a filter to the scan saves crossing rows and needs the storage layer to understand the predicate. Every optimization that moves work earlier (zone maps, selection vectors, late materialization) is the same idea: do not touch data you can rule out.</p>

<h3>7. Syntax</h3>
<pre>-- read the plan: operators, estimated and actual rows, loops
EXPLAIN (ANALYZE, BUFFERS)
SELECT customer_name, total FROM orders WHERE country = 'VN' AND total &gt; 900 LIMIT 100;
--   Limit  (actual rows=100 loops=1)
--     -&gt; Seq Scan on orders  (actual rows=100 ...) Rows Removed by Filter: 3234
--   the scan stopped early: LIMIT did not wait for the whole table

-- a multi-index plan appears as a bitmap
--   BitmapAnd
--     -&gt; Bitmap Index Scan on orders_country
--     -&gt; Bitmap Index Scan on orders_total

-- select only the columns you need
SELECT customer_name, total FROM orders ...;   -- not SELECT *</pre>
<p>Compare <code>Rows Removed by Filter</code> with the rows returned. A large number means the filter runs after the rows were read: look for a pushdown or an index.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: [
      OLD.diagnose[0],
      OLD.diagnose[1],
      OLD.diagnose[2],
      {
        t: 'Update through an index touches rows twice',
        sym: '<b>An UPDATE</b> gives some rows two increments, or a row count exceeds the matching rows.',
        ctx: 'An UPDATE of the indexed column is executed by scanning that index in key order. Each update moves the row to a later place in the same index.',
        why: 'The scan reads the index as it changes. A row moved ahead of the scan position is found again and matches the predicate a second time, so it is updated twice.',
        log: `-- representative, illustrative
UPDATE emp SET salary = salary + 20 WHERE salary < 110;
UPDATE 4   (expected 3 rows)
SELECT name, salary FROM emp WHERE name = 'A';   ->  120  (expected 100)`,
        note: 'A row count above the number of matching rows, or a double increment, is a sign the scan saw its own updates. Mature engines prevent it; custom code and simple engines may not.',
        fix: [
          'Measure first: count rows changed against rows matching the predicate on a copy of the table.',
          'Collect the matching row IDs or primary keys in a first step, then update by those IDs.',
          'Avoid driving an update by an index on the column it changes.',
          'Prefer one set-based statement the engine plans correctly over a hand-written scan loop.',
          'Verify: run the update on a test table and compare every row with the expected value.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[9] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [volcano, models, push, hall] };
})();
