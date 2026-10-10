/* Chapter 16 "User-Defined Functions" (index 15, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-721 L11 Server-side Logic Execution (UDFs, why they are slow, compilation, parallelization, Froid inlining, APFEL conversion to recursive CTEs, batching).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: one trip per row, inlining a UDF into the query, and where the time goes with and without the fixes. Timings illustrative. */
(function () {
  const DB = window.DB;
  const SOURCE = { label: 'CMU 15-721 L11 Server-side Logic Execution (notes in output/pdf/database-system)', href: '../../output/pdf/database-system/notes/11-udfs.pdf' };

  /* ---- 1. One row, one trip: every call crosses the boundary and runs its own statement ---- */
  const trip = {
    id: 'udf-per-row', label: 'One trip per row', desc: 'tier_rate() looks up a rate in a 5-row table. The optimizer plans one call per row, and every call runs its own SQL statement (timings illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'CREATE FUNCTION tier_rate(t int) RETURNS numeric AS $$',
      '  SELECT rate FROM tiers WHERE tier = t;   -- runs once per call',
      '$$ LANGUAGE sql;',
      'SELECT order_id, amount * tier_rate(tier) FROM orders;   -- 1,000,000 rows',
      '-- plan: Seq Scan on orders only. The function body is invisible to the planner.',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 0.05 ms per call, 0.2 ms per inner statement. Illustrative.',
      header: s => ({ left: 'calls ' + (s.calls || 0) + ' · elapsed ' + (s.ms || '0 ms'), right: s.right || 'scalar UDF' }),
      draw(P, s) {
        P.text('he', { x: 30, y: 84, t: 'query engine', cls: 'mut sm' });
        P.box('eng', { x: 30, y: 92, w: 250, h: 214, tone: 'mut', label: '', dash: true });
        P.text('hu', { x: 360, y: 84, t: 'function runtime', cls: 'mut sm' });
        P.box('rt', { x: 360, y: 92, w: 250, h: 214, tone: 'mut', label: '', dash: true });
        P.chip('scan', { x: 50, y: 108, w: 210, h: 42, label: 'Seq Scan orders', sub: 'the only node in the plan', tone: 'info' });
        const at = s.at || 'engine';
        const rowX = at === 'engine' ? 60 : 392;
        P.chip('row', { x: rowX, y: at === 'engine' ? 190 : 108, w: 190, h: 44, label: s.rowLabel || 'order 1, tier 2', sub: s.rowSub || '', tone: s.rowTone || 'cursor' });
        P.chip('fn', { x: 380, y: 170, w: 210, h: 36, label: 'tier_rate(2)', sub: '', tone: s.stmt ? 'cursor' : 'mut', small: true });
        if (s.stmt) P.chip('sel', { x: 380, y: 214, w: 210, h: 36, label: 'SELECT rate ...', tone: 'warn', small: true });
        P.box('tiers', { x: 380, y: 258, w: 210, h: 34, tone: s.stmt ? 'ok' : 'info', label: 'tiers (5 rows)', cls: 'sm' });
        if (s.arrow) P.line('cross', 262, 168 + (s.arrow === 'back' ? 22 : 0), 358, 168 + (s.arrow === 'back' ? 22 : 0), { tone: s.arrow === 'back' ? 'ok' : 'cursor', arrow: true, label: s.arrow === 'back' ? 'rate 0.12' : 'call', dy: -8 });
        if (s.note) P.chip('nt', { x: 50, y: 252, w: 210, h: 40, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The planner sees a scan of orders and a call to tier_rate(). It cannot look inside the function, so it plans one call per row.', callout: 'The function is a black box to the planner', code: 4,
        state: { right: 'planning' }, stats: [{ l: 'plan nodes', v: '1' }, { l: 'calls planned', v: 'one per row', cls: 'warn' }] },
      { log: 'The scan produces order 1. The engine calls tier_rate(2), which means leaving the query engine and entering the function runtime.', callout: 'Row 1 crosses into the function runtime', code: 3,
        state: { calls: 1, at: 'rt', arrow: 'go', ms: '0.05 ms' }, stats: [{ l: 'calls', v: '1' }, { l: 'entry cost', v: '0.05 ms', cls: 'warn' }] },
      { log: 'Inside, the function runs its own statement: SELECT rate FROM tiers. It is parsed, planned and executed on its own, for this one row.', callout: 'The function runs its own SELECT', moment: true, code: 1,
        state: { calls: 1, at: 'rt', stmt: 1, ms: '0.25 ms' }, stats: [{ l: 'statement cost', v: '0.2 ms', cls: 'bad' }, { l: 'rows worked', v: '1' }] },
      { log: 'The rate comes back to the engine, which multiplies it into the amount. That was one row. The whole trip cost 0.25 ms.', callout: 'The rate returns, one row is done', code: 3,
        state: { calls: 1, at: 'engine', arrow: 'back', ms: '0.25 ms', rowLabel: 'order 1 done', rowTone: 'ok' }, stats: [{ l: 'per row', v: '0.25 ms', cls: 'warn' }] },
      { log: 'Order 2 starts the same trip: cross the boundary, parse and plan a statement, run it, return. Nothing is reused between rows.', callout: 'Row 2 repeats the whole trip', code: 3,
        state: { calls: 2, at: 'rt', stmt: 1, ms: '0.5 ms', rowLabel: 'order 2, tier 1' }, stats: [{ l: 'calls', v: '2' }, { l: 'elapsed', v: '0.5 ms' }] },
      { log: 'Over 1,000,000 rows that is 1,000,000 calls and 1,000,000 statements. At 0.25 ms each, the report takes about 250 seconds.', callout: '1,000,000 rows: about 250 seconds', moment: true, code: 3,
        state: { calls: 1000000, at: 'engine', ms: '250 s', rowLabel: 'row 1,000,000', rowTone: 'bad', right: 'scalar UDF', note: 'CPU busy, scan looks fine', noteTone: 'bad' }, stats: [{ l: 'calls', v: '1,000,000', cls: 'bad' }, { l: 'elapsed', v: '250 s', cls: 'bad' }, { l: 'before', v: '2 s', cls: 'ok' }],
        takeaway: 'Procedural UDFs are black boxes. The planner pays a call and a statement for every row, and the plan hides it.' },
    ],
  };

  /* ---- 2. Inlining: the black box is rewritten into a join the optimizer can see ---- */
  const inline = {
    id: 'udf-inline', label: 'Inlining a UDF', desc: 'Froid-style inlining rewrites the function body into a relational expression and puts it inside the calling query (steps as in SQL Server 2019 scalar UDF inlining).',
    codeLabel: 'Plan',
    code: { bug: [
      'Project: amount * tier_rate(tier)     -- opaque call per row',
      'step 1: turn each statement of the body into a SQL expression',
      'step 2: split the body into regions, chain them with lateral joins',
      'step 3: embed the expression in the query in place of the call',
      'step 4: optimize the whole query: hash join on tiers, parallel scan',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one function, one lookup table. Illustrative.',
      header: s => ({ left: s.hdr || 'plan with a UDF call', right: s.right || '' }),
      draw(P, s) {
        const st = s.st || 0;
        P.text('hp', { x: 30, y: 84, t: 'function body', cls: 'mut sm' });
        const body = [['SELECT rate FROM tiers', 'statement 1'], ['x := amount * rate', 'statement 2'], ['RETURN x', 'statement 3']];
        body.forEach(([l, sub], i) => P.chip('b' + i, { x: st >= 3 ? 30 : 30, y: 96 + i * 52, w: 200, h: 44, label: l, sub: st >= 1 ? sub : '', tone: st === 0 ? 'info' : (st === 1 ? 'cursor' : (st === 2 ? 'acc' : 'mut')), hl: st === 1 || st === 2 }));
        if (st >= 2) P.chip('e0', { x: 260, y: 130, w: 150, h: 44, label: 'expression', sub: st >= 2 ? 'LATERAL (rate)' : '', tone: 'acc' });
        P.text('hq', { x: 440, y: 84, t: 'calling query plan', cls: 'mut sm' });
        if (st < 3) {
          P.chip('pj', { x: 440, y: 96, w: 170, h: 44, label: 'Project', sub: 'tier_rate(tier)', tone: 'bad' });
          P.chip('bx', { x: 440, y: 150, w: 170, h: 40, label: 'UDF call', sub: 'black box', tone: 'mut' });
          P.chip('sc', { x: 440, y: 204, w: 170, h: 44, label: 'Seq Scan', sub: 'orders', tone: 'info' });
          P.line('l0', 525, 140, 525, 150, { arrow: false, tone: 'mut' }); P.line('l1', 525, 190, 525, 204, { arrow: false, tone: 'mut' });
        } else {
          P.chip('pj', { x: 440, y: 96, w: 170, h: 44, label: 'Project', sub: 'amount * rate', tone: 'ok' });
          P.chip('jn', { x: 440, y: 150, w: 170, h: 40, label: st >= 4 ? 'Hash Join' : 'Join (lateral)', sub: 'tier = tiers.tier', tone: st >= 4 ? 'ok' : 'acc' });
          P.chip('sc', { x: 440, y: 204, w: 80, h: 44, label: 'Scan', sub: 'orders', tone: 'info' });
          P.chip('tr', { x: 530, y: 204, w: 80, h: 44, label: 'Scan', sub: 'tiers', tone: 'info' });
          P.line('l0', 525, 140, 525, 150, { arrow: false, tone: 'mut' }); P.line('l1', 480, 190, 480, 204, { arrow: false, tone: 'mut' }); P.line('l2', 570, 190, 570, 204, { arrow: false, tone: 'mut' });
        }
        if (st >= 2 && st < 3) P.line('mv', 410, 152, 438, 160, { tone: 'cursor', arrow: true });
        if (s.big) P.chip('big', { x: 30, y: 270, w: 580, h: 54, label: s.big, sub: s.bigSub || '', tone: s.bigTone || 'ok' });
      }
    }),
    bug: [
      { log: 'On the left is the function body: a lookup, a multiplication and a return. On the right is the calling plan, with the function as one opaque node.', callout: 'The call is an opaque node in the plan', code: 0,
        state: { st: 0, hdr: 'plan with a UDF call', big: 'estimated cost of the UDF node: unknown (default guess)', bigSub: 'one call per row, no parallel scan', bigTone: 'bad' }, stats: [{ l: 'optimizer sees', v: 'a black box', cls: 'bad' }] },
      { log: 'Step 1: each statement of the body is turned into a relational expression. The lookup becomes a subquery on tiers, and the arithmetic stays an expression.', callout: 'Statements become expressions', code: 1,
        state: { st: 1, hdr: 'analysing the body' }, stats: [{ l: 'statements', v: '3' }] },
      { log: 'Step 2: the body is split into regions and chained with lateral joins. A lateral join lets one subquery use columns of the row it joins with.', callout: 'Regions are chained with lateral joins', moment: true, code: 2,
        state: { st: 2, hdr: 'building one expression' }, stats: [{ l: 'regions', v: '1' }, { l: 'joined by', v: 'LATERAL', cls: 'ok' }] },
      { log: 'Step 3: the expression replaces the call node. The plan now has a join with tiers instead of a function call.', callout: 'The expression replaces the call node', code: 3,
        state: { st: 3, hdr: 'plan after inlining' }, stats: [{ l: 'UDF call nodes', v: '0', cls: 'ok' }] },
      { log: 'Step 4: the optimizer plans the whole query. A 5-row tiers table is built into a hash table once, and orders is scanned and probed once, possibly in parallel.', callout: 'The optimizer costs it as one query', code: 4,
        state: { st: 4, hdr: 'optimized plan', right: 'hash join', big: 'tiers built once, orders scanned once: about 0.5 s for 1,000,000 rows', bigSub: 'was 250 s as a scalar call per row', bigTone: 'ok' }, stats: [{ l: 'elapsed', v: '~0.5 s', cls: 'ok' }, { l: 'was', v: '250 s', cls: 'bad' }] },
      { log: 'Inlining is not always a win, so the rewritten query goes through the normal cost model. A function with side effects or loops may not be inlinable at all.', callout: 'Not every UDF can be inlined', code: 4,
        state: { st: 4, hdr: 'optimized plan', right: 'hash join', big: 'side effects, loops or unsupported constructs stay as calls', bigSub: 'check the plan for a UDF node', bigTone: 'warn' }, stats: [{ l: 'inlinable', v: 'pure expressions', cls: 'ok' }, { l: 'not inlinable', v: 'side effects', cls: 'warn' }],
        takeaway: 'Inlining lets the optimizer see the function. A pure lookup becomes a join, and the plan drops the per-row call.' },
    ],
  };

  /* ---- 3. Overhead strips: where the time goes for scalar, batched, inlined and side-effect functions ---- */
  const SEG = { call: 14, stmt: 22, work: 6 };
  const strips = {
    id: 'call-overhead', label: 'Where the time goes', desc: 'Each strip is 12 sample rows. Orange is the call, red is the statement the function runs, green is the real work. Batching and inlining remove the repeated parts (timings illustrative).',
    codeLabel: 'Model',
    code: { bug: [
      'scalar UDF:    1,000,000 x (0.05 call + 0.2 statement + 0.0005 work) = 250 s',
      'batched, 1,000 rows per call: 1,000 x (0.05 + 0.2) + 1,000,000 x 0.0005 = 750 ms',
      'inlined:       1,000,000 x 0.0005 = about 500 ms',
      'UDF with a side effect (INSERT audit row): cannot inline, stays 250 s',
      'vectorized UDF: the call overhead is paid once per batch of values',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 12 sample rows per strip. Segment widths are not to scale. Illustrative.',
      header: s => ({ left: s.hdr || '', right: s.total || '' }),
      draw(P, s) {
        const rows = s.rows || [];
        const names = { scalar: 'scalar UDF', batch: 'batched (6 rows per call)', inline: 'inlined', side: 'UDF with an audit INSERT' };
        rows.forEach((kind, r) => {
          const y = 100 + r * 60;
          P.text('t' + r, { x: 30, y: y - 6, t: names[kind], cls: 'mut sm' });
          let x = 30;
          for (let i = 0; i < 12; i++) {
            const startCall = kind === 'scalar' || kind === 'side' || (kind === 'batch' && i % 6 === 0);
            if (startCall) { P.box('c' + r + '_' + i, { x, y, w: SEG.call, h: 28, tone: 'warn', label: '', rx: 2 }); x += SEG.call; }
            if (kind === 'scalar' || (kind === 'batch' && i % 6 === 0)) { P.box('s' + r + '_' + i, { x, y, w: SEG.stmt, h: 28, tone: 'bad', label: '', rx: 2 }); x += SEG.stmt; }
            if (kind === 'side') { P.box('s' + r + '_' + i, { x, y, w: SEG.stmt, h: 28, tone: 'bad', label: '', rx: 2, dash: true }); x += SEG.stmt; }
            P.box('w' + r + '_' + i, { x, y, w: SEG.work, h: 28, tone: 'ok', label: '', rx: 2 }); x += SEG.work;
          }
          P.text('r' + r, { x: 612, y: y + 18, t: ({ scalar: '250 s', batch: '750 ms', inline: '~500 ms', side: '250 s' })[kind], cls: 'sm b', anchor: 'end' });
        });
        P.chip('lg', { x: 30, y: 316, w: 360, h: 26, label: 'orange = call   red = inner statement   green = work', tone: 'mut', small: true });
      }
    }),
    bug: [
      { log: 'A scalar UDF pays a call and a statement before every row\'s work. In this strip the green work is a small part of each block.', callout: 'Scalar: overhead before every row', code: 0,
        state: { rows: ['scalar'], hdr: 'scalar UDF', total: '250 s for 1,000,000 rows' }, stats: [{ l: 'calls', v: '1 per row', cls: 'bad' }, { l: 'elapsed', v: '250 s', cls: 'bad' }] },
      { log: 'Almost all of the time is the orange and red parts. The actual work is 0.0005 ms of 0.2505 ms per row, about 0.2%.', callout: 'Real work is 0.2% of each row', moment: true, code: 0,
        state: { rows: ['scalar'], hdr: 'scalar UDF', total: 'work = 0.2% of time' }, stats: [{ l: 'work per row', v: '0.0005 ms', cls: 'ok' }, { l: 'overhead per row', v: '0.25 ms', cls: 'bad' }] },
      { log: 'Batching passes 1,000 rows per call. The call and the statement happen once per batch, and the work is done set-wise on all the rows.', callout: 'Batched: one call and one statement per batch', code: 1,
        state: { rows: ['scalar', 'batch'], hdr: 'batched', total: '750 ms' }, stats: [{ l: 'calls', v: '1,000', cls: 'ok' }, { l: 'elapsed', v: '750 ms', cls: 'ok' }] },
      { log: 'Inlined, there are no calls and no statements at all. Only the work remains, done inside the one plan the optimizer built.', callout: 'Inlined: only the work remains', code: 2,
        state: { rows: ['scalar', 'batch', 'inline'], hdr: 'inlined', total: '~500 ms' }, stats: [{ l: 'calls', v: '0', cls: 'ok' }, { l: 'elapsed', v: '~500 ms', cls: 'ok' }] },
      { log: 'Now a function that also writes an audit row. The write is a side effect, so it must happen once per row, in order. It cannot be inlined or batched away.', callout: 'A side effect keeps one call per row', code: 3,
        state: { rows: ['scalar', 'side'], hdr: 'side effect', total: '250 s' }, stats: [{ l: 'audit writes', v: '1,000,000', cls: 'bad' }, { l: 'elapsed', v: '250 s', cls: 'bad' }] },
      { log: 'Move the audit write out of the function, or write the audit rows in one INSERT ... SELECT after the query. The function becomes pure and can be inlined.', callout: 'Separate the side effect from the computation', code: 3,
        state: { rows: ['side', 'inline'], hdr: 'fix', total: 'inline + one set-wise audit INSERT' }, stats: [{ l: 'audit writes', v: '1 statement', cls: 'ok' }, { l: 'calls', v: '0', cls: 'ok' }] },
      { log: 'When a function cannot be inlined, a vectorized UDF takes a batch of values per call, so the call overhead is paid once per batch instead of once per row.', callout: 'Vectorized UDFs pay the call once per batch', code: 4,
        state: { rows: ['scalar', 'batch'], hdr: 'vectorized', total: 'overhead per batch' }, stats: [{ l: 'overhead', v: 'per batch', cls: 'ok' }],
        takeaway: 'The cost of a UDF is the repeated call and statement, not the work. Remove the repetition: inline, batch or vectorize.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Logic next to the data</h3>
<p>A <b>UDF</b>, a user-defined function, packages a computation that queries can call. A <b>scalar UDF</b> takes values from one row and returns one value. Putting logic in the database avoids network round trips and lets many queries share it. The catch is that a function performs well only when the optimizer can inspect it, fold it into the plan and run it over many rows at once.</p>

<h3>2. Why a procedural function is slow</h3>
<p>The optimizer treats a procedural UDF, written in PL/pgSQL, PL/SQL or Transact-SQL, as a black box. It cannot cost it, so it plans one call per row. Each call pays to enter and leave the function runtime. If the body contains a query, every call also parses, plans and runs its own statement. Statements inside a function run one at a time, with no optimization across them, and a correlated query inside a function can block parallel execution of the whole query.</p>
<p>The plan makes it worse by hiding the cost: the plan above shows only a scan of orders, while the CPU is busy running a million small statements. A <b>cursor loop</b> in a procedure has the same shape: one FETCH and one UPDATE per row, each a separate round trip.</p>

<h3>3. Inlining</h3>
<p><b>Inlining</b> rewrites the function body into a relational expression and puts it into the calling query. Froid, which ships as scalar UDF inlining in SQL Server 2019, does this in steps. It turns statements into SQL expressions, splits the body into regions, chains the regions with lateral joins, substitutes the expression for the call, and then lets the optimizer plan the whole query. A <b>lateral join</b> lets a subquery in the FROM clause refer to columns of the row it joins with. After inlining, a lookup in a 5-row table becomes a hash join, and the scan of orders can run in parallel.</p>

<figure class="mm" aria-label="Flowchart of the five Froid steps that turn a UDF into a subquery" style="--diagram-width:168px">
  <img src="diagrams/ch15-froid-steps.svg" alt="Flowchart: a UDF body is turned statement by statement into SQL expressions, broken into regions by control flow, merged with lateral joins, inlined as a subquery in the calling query, and then planned as one query by the optimizer.">
  <figcaption>Flowchart: Froid rewrites a UDF into the query during the rewrite phase, before cost-based optimization.</figcaption>
</figure>
<p>Froid works at rewrite time, so the cost-based optimizer stays unchanged, and commercial engines already have strong rules for subqueries. Its limit is control flow: straight-line code and IF branches convert well, loops do not. <b>APFEL</b> extends the idea by converting UDFs, including loops, into <b>recursive CTEs</b>, so the optimizer sees a set-based query for those too. Other fixes from the lecture are <b>compiling</b> the UDF body to native code, <b>parallelizing</b> it with annotations that say which parts are safe, and <b>batching</b>: rewriting the UDF as SQL that works on many rows per call.</p>
<figure class="mm" aria-label="Flowchart of five ways to speed up a slow UDF" style="--diagram-width:936px">
  <img src="diagrams/ch15-udf-fixes.svg" alt="Flowchart: a UDF called per row is slow. Fixes are to compile it to native code, parallelize it with annotations, inline it with Froid so straight-line logic becomes a subquery, convert it to CTEs with APFEL so loops become recursive CTEs, or batch it so one call handles many rows.">
  <figcaption>Flowchart: five routes, from cheapest to change to most invasive.</figcaption>
</figure>

<h3>4. Batching and vectorized UDFs</h3>
<p>When inlining is not possible, <b>batching</b> rewrites the function to run over many input rows at once, for example as statements over a temporary table with one row per input tuple. A <b>vectorized UDF</b> receives a batch of values per call, so the call overhead is paid once per batch. In the course model, with 0.05 ms per call, 0.2 ms per statement and 0.0005 ms per row of set work, 1,000,000 rows take 250 s as a scalar UDF, 750 ms batched in groups of 1,000 and about 500 ms inlined.</p>

<h3>5. What blocks inlining</h3>
<p>A function with a side effect, such as writing an audit row, must run once per row in order, so it cannot be safely inlined, reordered or batched. Loops, certain dynamic SQL and some non-deterministic calls also prevent it. Even when inlining is possible, it is not always faster, so the rewritten query goes through the normal cost model. A function loaded from a native extension runs inside the server process, so one bug can crash the server and reset every session.</p>

<h3>6. The trade-off</h3>
<p>Logic in the database means fewer round trips and one copy of a rule, but it also means that a slow function slows the shared server and hides in plans. Keep functions pure and small, so that they can be inlined. Move side effects out of the computation. Check the plan for a function node and compare the call count with the row count.</p>

<h3>7. Syntax</h3>
<pre>-- a pure SQL function can be inlined by PostgreSQL's planner
CREATE FUNCTION tier_rate(t int) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT rate FROM tiers WHERE tier = t $$;

-- the set-based form: a join the optimizer can plan
SELECT o.order_id, o.amount * t.rate
FROM orders o JOIN tiers t ON t.tier = o.tier;

-- how many times was a function called (needs track_functions)
SET track_functions = 'all';
SELECT funcname, calls, total_time FROM pg_stat_user_functions;

-- SQL Server: see whether a UDF was inlined, and opt out per function
SELECT name, is_inlineable FROM sys.sql_modules m JOIN sys.objects o ON m.object_id = o.object_id;
-- CREATE FUNCTION ... WITH INLINE = OFF</pre>
<p>If <code>calls</code> equals the number of rows scanned, the function runs once per row. Rewrite it as a join or make it inlinable.</p>`;

  /* problem, predict and diagnose (kept from the first version of this course) */
  const FIELDS = {
    "problem": "An analytics team moved a pricing rule into a scalar function, <code>tier_rate()</code>, which looks up a rate in a 5-row table, and called it from a report over 1,000,000 orders (illustrative). The report used to take two seconds; now it runs for several minutes. CPU is busy, and the plan shows only a plain scan of orders.",
    "predict": {
      "q": "<code>tier_rate()</code> is a procedural function that runs <code>SELECT rate FROM tiers WHERE tier = $1</code>. The report calls it on 1,000,000 rows. How many times does that inner SELECT run?",
      "opts": [
        "Once, because the result is cached for the whole query",
        "5 times, once per distinct tier",
        "1,000,000 times, once per row",
        "0 times, because the optimizer rewrites it into a join"
      ],
      "ans": 2,
      "why": "The optimizer treats a procedural UDF as a black box and plans it as one call per row. Each call issues its own statement, so 1,000,000 rows mean 1,000,000 lookups."
    },
    "diagnose": [
      {
        "t": "Scalar UDF per row",
        "sym": "UDF calls equal the row count. The query runs for minutes on a table that a set-oriented plan scans in seconds.",
        "ctx": "A report slows from seconds to minutes after logic moved into a function; the plan shows a call count equal to the rows scanned.",
        "why": "A scalar UDF is a black box to the optimizer, so it is planned as one call per row. Each call pays the cost of entering the function runtime and, if the function queries, a statement of its own.",
        "log": "representative plan note, wording varies by engine\nFunction Scan on line_total  (calls=1000000)\n  -> SQL statements issued from function: 1000000",
        "fix": [
          "Measure first: check the plan; a Function Scan with a large call count is the signal.",
          "Rewrite the function as a plain SQL expression, or as a view, so the optimizer can inline it.",
          "If the logic must stay procedural, check whether the engine can inline it (for example Froid in SQL Server) and whether that inlining happens in your version.",
          "Verify: the call count in the plan should drop to 0 after inlining, and the elapsed time should fall in step."
        ]
      },
      {
        "t": "Cursor loop instead of one set",
        "sym": "Round trips grow with rows. A loop that fetches and updates one order at a time sends two statements for each.",
        "ctx": "A batch job that touches 2,000 orders sends 4,000 statements; the server log is a long run of FETCH and UPDATE pairs.",
        "why": "A cursor loop processes rows one at a time (row by agonizing row). Each FETCH and each UPDATE is a separate statement, and the optimizer cannot combine them into one plan.",
        "log": "representative client log, wording varies\n-- loop body runs once per row\nFETCH NEXT FROM order_cur\nUPDATE orders SET total = ... WHERE id = $1",
        "fix": [
          "Measure first: count the statements in the server log for one run of the job.",
          "Write one set-oriented UPDATE (or INSERT ... SELECT) that joins the source to the target.",
          "If the loop has real branching, express each branch as a CASE expression inside the set statement.",
          "Keep the cursor only for the rare case that a set statement cannot express, and batch its work.",
          "Verify: count the statements in the server log; a set-oriented version sends one statement per batch, not per row."
        ]
      },
      {
        "t": "Side effect blocks inlining",
        "sym": "The UDF runs as a black box on every row, and it writes an audit row each time, so the row count of writes equals the row count of calls.",
        "ctx": "The audit_log table grows by one row per scanned row, and the plan shows the function was not inlined.",
        "why": "General reasoning, not from the course notes: the optimizer may inline or reorder only what it can prove has no side effects. A function that writes a log row is a barrier: it stays as a call, and each call performs its own write.",
        "log": "representative plan note\nFunction Scan on audit_price (calls=8, side effects: 8 inserts into audit_log)\nInlining: not applied, function writes to a table",
        "fix": [
          "Measure first: compare the function call count in the plan with the number of rows written to the audit table.",
          "Move the audit write out of the function and into the caller, as one batched INSERT ... SELECT after the main query.",
          "Keep the UDF pure (no writes, no reads of changing state) so the optimizer can inline it and push cheap predicates ahead of it.",
          "Mark functions with the correct volatility, so the planner does not assume they are pure when they are not.",
          "Verify: the function should show as inlined, and the write count should match the number of batches, not the number of rows."
        ]
      },
      {
        "t": "Unsafe extension crashes the server",
        "sym": "One bad native function kills its server process, and every other session on the server is reset with it.",
        "ctx": "All 200 sessions drop at once and reconnect; the server log shows a segmentation fault in one server process.",
        "why": "General knowledge, not from the course notes: a compiled extension runs inside the database process, with the process memory and privileges. A fault in it is a fault in the server. The server then resets the other sessions to protect shared memory.",
        "log": "representative server log, wording varies by version\nLOG: server process (PID 4121) was terminated by signal 11: Segmentation fault\nWARNING: terminating connection because of crash of another server process",
        "fix": [
          "Measure first: find the crashing call from the terminated process in the server log and the query it was running.",
          "Run untrusted or experimental logic in a separate worker process, with a timeout and memory limit, rather than in the server process.",
          "Prefer the engine interpreted or sandboxed language for UDFs over native code that can crash the process.",
          "Set statement timeouts, so a runaway function fails one query instead of holding a session.",
          "Verify: kill the worker in a test and confirm that only the one query fails and other sessions stay connected."
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[15] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [trip, inline, strips] };
})();
