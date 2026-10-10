/* Chapter 15 "Query Compilation" (index 14, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-721 L07 Code Generation and Compilation (code specialization, transpilation, JIT with LLVM, adaptive execution, real-world systems, vectorization against compilation).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: an operator tree fused into one loop, a break-even chart of compile cost, and an adaptive timeline that interprets while it compiles. Times illustrative. */
(function () {
  const DB = window.DB;
  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "An analytics team keeps a large fact table fully in memory on a 16-core server, and a simple filter-and-sum dashboard query still runs at about 5 million rows per second (illustrative). Disk reads are zero. Adding cores barely helps, and a CPU profile shows most time in function calls, branch mispredictions and scheduler overhead rather than in the comparison itself.",
    "predict": {
      "q": "The engine passes one row per operator call. What change should it make first?",
      "opts": [
        "Buy faster disks",
        "Add more cores and more worker threads",
        "Pass batches of about 1,000 rows per call and process each batch in a tight loop",
        "Pass batches as large as possible, such as one million rows per call"
      ],
      "ans": 2,
      "why": "Each call has a fixed cost, and a batch spreads it over its rows. About 1,000 rows keeps the vectors in cache; much larger batches overflow it and the cost per row rises again."
    },
    "diagnose": [
      {
        "t": "JIT costs more than it saves",
        "sym": "A 10,000-row query spends about 40 ms compiling and about 0.04 ms running.",
        "ctx": "Short queries got slower after query compilation was turned on.",
        "why": "Compilation is a fixed cost paid before the first row. For a short query it is larger than the run itself. It pays off only when the time saved over all rows is larger than the compile time.",
        "log": "representative, illustrative\ncompile: 40 ms (fixed)\nrun, 10,000 rows vectorized: 0.04 ms",
        "note": "When compile time is many times the run time, the query is too short to compile.",
        "fix": [
          "Measure: compare total time, including compile time, for a short query and a long one.",
          "Interpret or vectorize short queries. Compile only when the estimated run time is larger than the compile time.",
          "Use adaptive execution: start with the interpreter, compile in the background, and switch per morsel when the code is ready (HyPer). Cache compiled code for queries that run often.",
          "Verify: short queries return to their run time without the compile cost, and long queries keep the compiled speed-up."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-721 L07 Code Generation and Compilation (notes in output/pdf/database-system)', href: '../../output/pdf/database-system/notes/07-compilation.pdf' };

  /* ---- 1. From operator tree to one loop: the tuple stays in a register and no call is made ---- */
  const COPS = [['Scan', 'orders'], ['Filter', "country = 'VN'"], ['Filter', 'total > 900'], ['Sum', 'total']];
  const LINES = ["for t in orders:", "  if t.country == 'VN':", "    if t.total > 900:", "      sum += t.total"];
  const fused = {
    id: 'fused-loop', label: 'Tree to one loop', desc: 'The same pipeline run two ways. Interpreted, each tuple crosses four operators through four calls. Compiled, the pipeline becomes one loop that knows the types and predicates, and the tuple stays in a register (call counts illustrative).',
    codeLabel: 'Generated',
    code: { bug: [
      'Sum(total) <- Filter(total > 900) <- Filter(country = \'VN\') <- Scan(orders)',
      '-- interpreted: root calls next() down the tree, one virtual call per operator per tuple',
      '-- compiled: the whole pipeline is a single function, no operator boundary',
      "for t in orders: if t.country == 'VN': if t.total > 900: sum += t.total",
      '-- types are known, so access is a pointer cast; predicates are integer compares',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one pipeline, four operators. Call counts illustrative.',
      header: s => ({ left: s.hl || 'interpreted (left) and compiled (right)', right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 40, y: 82, t: 'interpreted operators', cls: 'mut sm' }); P.text('h2', { x: 330, y: 82, t: 'compiled pipeline', cls: 'mut sm' });
        COPS.forEach(([n, sub], i) => P.chip('o' + i, { x: 40, y: 96 + i * 58, w: 200, h: 44, label: n, sub, tone: s.at === i ? 'cursor' : 'info' }));
        for (let i = 0; i < 3; i++) P.line('c' + i, 140, 140 + i * 58, 140, 154 + i * 58, { tone: s.calls > i ? 'bad' : 'mut', arrow: true, label: s.calls > i ? 'call' : '', dx: 22 });
        P.box('loop', { x: 330, y: 96, w: 280, h: 214, tone: s.cmp ? 'ok' : 'mut', label: '', dash: !s.cmp, sw: 2 });
        if (s.cmp && s.line != null) P.box('hl', { x: 338, y: 112 + s.line * 44, w: 264, h: 28, tone: 'cursor', label: '' });
        if (s.cmp) LINES.forEach((l, i) => P.text('L' + i, { x: 344, y: 132 + i * 44, t: l, cls: 'sm' }));
        if (s.cmp && s.line != null) P.chip('rt', { x: 560, y: 114 + s.line * 44, w: 40, h: 24, label: 't', sub: '', tone: 'cursor', small: true });
        if (s.cmp) P.text('nr', { x: 344, y: 292, t: 'tuple lives in registers, no calls', cls: 'xs mut' });
        if (s.cnt) P.chip('cn', { x: 40, y: 340, w: 280, h: 28, label: s.cnt, sub: '', tone: s.cntTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'One pipeline: scan orders, two filters, and a sum. A volcano engine runs it as four operator objects. A compiling engine will turn the pipeline into code for this one query.', callout: 'The same four-step pipeline', code: 0, state: {}, stats: [{ l: 'operators', v: '4' }] },
      { log: 'Interpreted, the root asks for a tuple. The call goes down the tree, and the scan returns one tuple. Each hop is a virtual call through a function pointer.', callout: 'Interpreted: a call per operator', code: 1, state: { at: 0, calls: 0 }, stats: [{ l: 'calls so far', v: '1' }] },
      { log: 'The tuple climbs through both filters to the sum. That is four calls for one tuple, each one an indirect jump the CPU cannot predict well and a copy of the tuple into the next operator.', callout: 'Four calls for one tuple', moment: true, code: 1, state: { at: 3, calls: 3, cnt: 'per tuple: 4 virtual calls', cntTone: 'bad' }, stats: [{ l: 'calls per tuple', v: '4', cls: 'bad' }, { l: 'per million tuples', v: '4,000,000', cls: 'bad' }] },
      { log: 'Compiled, the engine generates code after the plan is chosen. The pipeline is fused into a single loop: scan, test, test, add, with nothing in between.', callout: 'The pipeline becomes one loop', code: 3, state: { cmp: 1, line: 0, hl: 'compiled loop' }, stats: [{ l: 'loops', v: '1' }] },
      { log: 'Types are known, so reading a column is a pointer cast, and predicates are plain integer comparisons. The tuple moves down the lines inside registers.', callout: 'Types and predicates baked in', code: 4, state: { cmp: 1, line: 2, hl: 'compiled loop' }, stats: [{ l: 'calls per tuple', v: '0', cls: 'ok' }] },
      { log: 'The difference is instructions. To go 10 times faster a system must execute 90% fewer instructions, and removing calls, copies and type dispatch is how compilation gets there.', callout: 'Fewer instructions per tuple', code: 4, state: { cmp: 1, line: 3, hl: 'compiled loop', cnt: 'per tuple: 0 calls, one loop', cntTone: 'ok' }, stats: [{ l: 'instructions', v: 'far fewer', cls: 'ok' }],
        takeaway: 'Compilation specializes the code to one query. Operators disappear, types are fixed, and the tuple stays in a register.' },
    ],
  };

  /* ---- 2. Break-even chart: compile time is fixed, so it only pays when enough tuples run ---- */
  const BX0 = 80, BX1 = 590, BY0 = 288, BY1 = 108;
  const bxr = r => BX0 + (Math.log10(r) - 3) / 5 * (BX1 - BX0);
  const byt = t => BY0 - (Math.log10(t) + 1) / 5 * (BY0 - BY1);
  const tInt = r => r * 0.0004, tComp = r => 40 + r * 0.00004;
  const tAda = r => Math.min(tInt(r), 40 + (r - 40 / 0.0004) * 0.00004 + 40 > 0 ? tComp(r) + 2 : tInt(r), tInt(r));
  const XS = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
  const breakeven = {
    id: 'break-even', label: 'Compile break-even', desc: 'Total time against rows processed. The interpreter starts at once and is slow per row. Compiled code pays a fixed compile time and then runs ten times faster per row. Adaptive execution follows the lower of the two (milliseconds illustrative).',
    codeLabel: 'Model',
    code: { bug: [
      'interpreter: 0.4 microseconds per row, no start-up cost',
      'compiled: 40 ms to compile, then 0.04 microseconds per row',
      'break-even = 40 ms / (0.4 - 0.04) us = about 111,000 rows',
      '10,000 rows: interpreter 4 ms, compiled 40.4 ms -> interpret',
      '100 million rows: interpreter 40 s, compiled 44 ms of work + 4 s -> compile',
      'adaptive: start interpreting, compile in the background, switch when ready',
    ] },
    stage: DB.stage({
      footer: 'Illustrative constants. Compile time also grows with query size.',
      header: s => ({ left: s.hl || 'total time against rows (log, log)', right: '' }),
      draw(P, s) {
        P.line('ax', BX0, BY0 + 4, BX1, BY0 + 4, { tone: 'mut' }); P.line('ay', BX0, BY0 + 4, BX0, BY1 - 10, { tone: 'mut' });
        [1e3, 1e4, 1e5, 1e6, 1e7, 1e8].forEach((r, i) => P.text('tx' + i, { x: bxr(r), y: BY0 + 22, t: r >= 1e6 ? r / 1e6 + 'M' : r / 1e3 + 'K', cls: 'mut xs', anchor: 'middle' }));
        [0.1, 1, 10, 100, 1000, 10000].forEach((t, i) => P.text('ty' + i, { x: BX0 - 8, y: byt(t) + 4, t: t >= 1000 ? t / 1000 + ' s' : t + ' ms', cls: 'mut xs', anchor: 'end' }));
        P.text('xl', { x: BX1, y: BY0 + 40, t: 'rows processed (log)', cls: 'mut xs', anchor: 'end' });
        const curve = (id, f, tone, from) => XS.forEach((r, k) => { if (!k || r > (s.upto || 1e8) || r < from) return; const p = XS[k - 1]; P.line(id + k, bxr(p), byt(f(p)), bxr(r), byt(f(r)), { tone, sw: 2.8 }); });
        if (s.int) curve('i', tInt, 'bad', 0);
        if (s.comp) curve('c', tComp, 'ok', 0);
        if (s.ada) curve('a', r => Math.min(tInt(r), tComp(r) * 1.05), 'cursor', 0);
        if (s.be) { P.line('be', bxr(1.11e5), BY0 + 4, bxr(1.11e5), BY1 - 6, { tone: 'cursor', dash: true, sw: 2 }); P.chip('bc', { x: bxr(1.11e5) + 6, y: BY1 - 4, w: 140, h: 26, label: 'break-even ~111K rows', sub: '', tone: 'cursor', small: true }); }
        if (s.int) P.text('li', { x: bxr(1e7) + 6, y: byt(tInt(1e7)) - 8, t: 'interpret', cls: 'xs tone-bad' });
        if (s.comp) P.text('lc', { x: bxr(1e7) + 6, y: byt(tComp(1e7)) + 18, t: 'compile', cls: 'xs tone-ok' });
      }
    }),
    bug: [
      { log: 'The interpreter needs no preparation. Its cost grows in a straight line with the number of rows, at about 0.4 microseconds each.', callout: 'Interpreter: no start-up, slow per row', code: 0, state: { int: 1 }, stats: [{ l: 'per row', v: '0.4 us' }] },
      { log: 'Compiled code costs 40 ms before the first row, then runs 10 times faster per row. For small inputs the flat 40 ms dominates and the curve stays high.', callout: 'Compiled: 40 ms first, then fast', code: 1, state: { int: 1, comp: 1 }, stats: [{ l: 'compile', v: '40 ms' }, { l: 'per row', v: '0.04 us' }] },
      { log: 'The lines cross at about 111,000 rows. Below that, the interpreter finishes first. A 10,000-row dashboard query takes 4 ms interpreted and 40 ms compiled.', callout: 'Break-even near 111,000 rows', moment: true, code: 2, state: { int: 1, comp: 1, be: 1 }, stats: [{ l: '10,000 rows', v: 'interpret wins', cls: 'warn' }] },
      { log: 'At 100 million rows the interpreter needs 40 seconds and the compiled query about 4 seconds. Compilation pays back many times over on big scans.', callout: 'Large scans: compile wins by 10x', code: 4, state: { int: 1, comp: 1, be: 1 }, stats: [{ l: '100M rows', v: 'compile wins', cls: 'ok' }] },
      { log: 'The planner often cannot know the row count. Adaptive execution starts interpreting immediately, compiles in the background, and switches, so the curve follows the lower of the two.', callout: 'Adaptive follows the lower curve', code: 5, state: { int: 1, comp: 1, be: 1, ada: 1 }, stats: [{ l: 'cost', v: 'min of both', cls: 'ok' }],
        takeaway: 'Compilation has a fixed cost. It pays on long runs and loses on short ones, so adaptive execution hedges.' },
    ],
  };

  /* ---- 3. Adaptive execution: start on bytecode, compile in the background, switch at a morsel boundary ---- */
  const AX0 = 130, AU = 0.45;
  const ay = i => 120 + i * 62;
  const bar2 = (i, a, b, tone, label) => ({ i, a, b, tone, label });
  const adaptive = {
    id: 'adaptive-exec', label: 'Adaptive execution', desc: 'One query of 1,000 ms of interpreted work. Compile first and the first result waits for the compiler. Interpret only and the whole query is slow. Adaptive execution interprets while it compiles, then switches at a morsel boundary (times illustrative).',
    codeLabel: 'Timeline',
    code: { bug: [
      'interpret only: 1,000 ms of work at the slow speed',
      'compile first: 200 ms compile, then 100 ms of work, first row at 200 ms',
      'adaptive: interpret from time 0 and compile in the background',
      'at 200 ms the native code is ready: later morsels use it',
      'each morsel asks: is the compiled version available yet?',
    ] },
    stage: DB.stage({
      footer: 'Illustrative times. The rows of bars are three strategies for the same query.',
      header: s => ({ left: s.hl || 'time in ms', right: s.rt || '' }),
      draw(P, s) {
        for (let t = 0; t <= 1000; t += 250) { P.line('g' + t, AX0 + t * AU, 96, AX0 + t * AU, 320, { tone: 'mut', sw: 0.6, dash: true }); P.text('gt' + t, { x: AX0 + t * AU, y: 336, t: String(t), cls: 'mut xs', anchor: 'middle' }); }
        ['interpret only', 'compile first', 'adaptive'].forEach((n, i) => P.text('r' + i, { x: 10, y: ay(i) + 20, t: n, cls: 'mut sm' }));
        (s.bars || []).forEach(b => P.box('b' + b.i + '_' + b.a, { x: AX0 + b.a * AU, y: ay(b.i), w: Math.max(4, (b.b - b.a) * AU - 1), h: 30, tone: b.tone, label: b.label || '', cls: 'xs' }));
        if (s.sw) { P.line('sw', AX0 + 200 * AU, 96, AX0 + 200 * AU, 320, { tone: 'cursor', sw: 2.2 }); P.text('swt', { x: AX0 + 200 * AU + 6, y: 100, t: 'native code ready', cls: 'xs' }); }
      }
    }),
    bug: [
      { log: 'The query has about 1,000 ms of work if it is interpreted from start to finish.', callout: 'A query of 1,000 ms interpreted', code: 0, state: { bars: [bar2(0, 0, 1000, 'bad', 'interpret 1,000 ms')] }, stats: [{ l: 'finish', v: '1,000 ms', cls: 'bad' }] },
      { log: 'Compiling first costs 200 ms during which nothing returns. Then the compiled code runs the same work in 100 ms. It finishes at 300 ms, but the first result waits 200 ms.', callout: 'Compile first: nothing for 200 ms', code: 1, state: { bars: [bar2(0, 0, 1000, 'mut', ''), bar2(1, 0, 200, 'warn', 'compile 200'), bar2(1, 200, 300, 'ok', 'run 100')] }, stats: [{ l: 'first row', v: '200 ms', cls: 'warn' }, { l: 'finish', v: '300 ms', cls: 'ok' }] },
      { log: 'Adaptive execution starts immediately on a bytecode interpreter. In the background a compiler works on the same pipeline.', callout: 'Adaptive: interpret and compile at once', code: 2, state: { bars: [bar2(1, 0, 200, 'mut', ''), bar2(2, 0, 200, 'info', 'interpret'), bar2(2, 0, 200, 'info', ''), ], sw: 1 }, stats: [{ l: 'first row', v: '~0 ms', cls: 'ok' }] },
      { log: 'At 200 ms the native code is ready. Every worker checks for it before each morsel, so the next morsels already run compiled, and no query has to be restarted.', callout: 'Switch at the next morsel', moment: true, code: 3, state: { bars: [bar2(1, 0, 200, 'warn', 'compile 200'), bar2(1, 200, 300, 'ok', 'run 100'), bar2(2, 0, 200, 'info', 'interpret'), bar2(2, 200, 280, 'ok', 'native')], sw: 1 }, stats: [{ l: 'finish', v: '~280 ms', cls: 'ok' }] },
      { log: 'For a small query the compile never finishes in time and the work ends first, so it costs nothing extra. For a huge one it behaves like compile-first. The query chooses by itself.', callout: 'Short queries finish interpreted', code: 4, state: { bars: [bar2(0, 0, 1000, 'bad', 'interpret only 1,000 ms'), bar2(1, 0, 200, 'warn', 'compile 200'), bar2(1, 200, 300, 'ok', 'run 100'), bar2(2, 0, 200, 'info', 'interpret'), bar2(2, 200, 280, 'ok', 'native')], sw: 1 }, stats: [{ l: 'first row', v: 'immediate', cls: 'ok' }, { l: 'finish', v: '~280 ms', cls: 'ok' }],
        takeaway: 'Adaptive execution hides compile latency: start answering at once and speed up when the compiled code arrives.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Fewer instructions, not faster disks</h3>
<p>Once I/O is minimized, the only way to make a query faster is to execute fewer instructions. To go 10 times faster a DBMS must execute 90% fewer; to go 100 times faster, 99% fewer. Most engine code favours readability and generality, so it pays for that generality on every row. The lecture names two culprits. <b>Query interpretation</b>: in a volcano model each tuple passes through virtual function calls from operator to operator, and the CPU predicts those indirect jumps badly. <b>Expression evaluation</b>: a predicate is a tree, and walking the tree for every row is expensive when a query touches millions of rows.</p>

<h3>2. Code specialization</h3>
<p>The remedy is to generate code specific to one task, on the fly. Candidates: access methods, stored procedures, operator execution, logging, and above all <b>predicate evaluation</b>. A relational database has a schema, so three things are known in advance: attribute types, so reading a column becomes a pointer cast; the predicates, so evaluation becomes primitive comparisons; and the whole pipeline, so there are no function calls inside the loop, and the compiler can keep values in registers and reuse cache lines.</p>

<h3>3. Two ways to generate code</h3>
<p><b>Transpilation</b> (source-to-source) turns the plan into C or C++ source and runs a normal compiler such as gcc, then links the shared object into the DBMS. It integrates easily with the rest of the system and is easy to debug, but compiling can take 100 to 600 ms. <b>JIT compilation</b> emits an intermediate representation such as <b>LLVM IR</b>, which compiles to machine code much faster. HyPer does this. It fuses all operators of a pipeline into one loop, <b>push-based</b> and <b>data-centric</b>: the scan pushes a tuple through filters, probes and aggregation while it stays in registers. A pipeline ends at a pipeline breaker, such as a hash build, where the loop ends and the next one begins (chapter 10).</p>
<figure class="mm" aria-label="Flowchart from SQL to running code with three code-generation routes" style="--diagram-width:560px">
  <img src="diagrams/ch14-codegen-pipeline.svg" alt="Flowchart: SQL text is parsed into a syntax tree, bound to catalog types, optimized into a physical plan, and a code generator produces one function per pipeline. It can transpile to C++ and compile with gcc in 100 to 600 ms, emit LLVM IR and JIT it to machine code in tens of ms, or emit a bytecode run in a small VM. All three then run the query.">
  <figcaption>Flowchart: the code generator sits after the optimizer, and has three possible back ends.</figcaption>
</figure>

<h3>4. Compile time is the catch</h3>
<p>Compilation has a fixed cost that grows faster than linearly with the size of the query: HyPer&rsquo;s compile time rises with the number of joins, predicates and aggregations. For a short OLTP query or a tiny OLAP one the compile can exceed the whole run. <b>Adaptive execution</b> hides it. The engine emits the IR and starts executing at once in an interpreter, compiles in the background, and after each morsel checks if the compiled code is ready, switching without a restart. Umbra goes further with a fast single-pass translator to machine code, so the compile itself is cheap.</p>
<figure class="mm" aria-label="Sequence diagram: workers interpret morsels while a background compiler works, then switch to native code" style="--diagram-width:560px">
  <img src="diagrams/ch14-adaptive-seq.svg" alt="Sequence diagram: workers start the first morsel on bytecode without waiting and ask a background compiler to compile the pipeline. They run morsels 2, 3 and 4 on bytecode. The compiler reports native code is ready, and from morsel 5 on the workers use native code. Each morsel checks whether native code exists.">
  <figcaption>Sequence: the query never waits for the compiler.</figcaption>
</figure>

<h3>5. How real systems do it</h3>
<p>The lecture surveys the field. <b>Transpilers</b>: Amazon Redshift generates templated C++ and caches the compiled fragments per customer and across the fleet; Oracle compiles PL/SQL to C. <b>Custom</b>: IBM System R used code templates in the 1970s and gave them up; Microsoft Hekaton compiles stored procedures and SQL to C; SQLite compiles to opcodes for its own virtual machine, which guarantees the same behaviour everywhere. <b>JVM-based</b> engines such as Spark (Tungsten), Presto and Trino emit JVM bytecode. <b>LLVM-based</b>: SingleStore, PostgreSQL (since 2018, for expressions and tuple deforming), NoisePage. <b>Vectorwise</b> takes a different route: it precompiles thousands of small typed primitives, each easy for the compiler to vectorize, and the engine calls them on batches, which spreads the call cost over many rows.</p>

<h3>6. Vectorization or compilation?</h3>
<p>They are not exclusive. A compiled loop removes calls and keeps tuples in registers, and it is not automatically SIMD. A vectorized interpreter amortizes calls over a batch and uses SIMD but writes intermediate vectors to cache. Both land near the same speed on many queries, with different strengths: compilation wins on complex expressions and many fused operators, and vectorization wins on simple scans, needs no compiler at run time and is easier to debug and profile. Several modern systems combine them: vectorized primitives with compiled expressions, or compiled pipelines over batches.</p>

<h3>7. The trade-off</h3>
<p>Compilation removes interpretation overhead and adds start-up latency, code that is harder to debug, and a compiler in the engine. It pays when a query processes many tuples through a complex pipeline, and costs when it does not. Adaptive execution, caching of compiled fragments and fast translators all try to make the cost disappear.</p>

<h3>8. Syntax</h3>
<pre>-- PostgreSQL: JIT of expressions and tuple deforming (LLVM)
SHOW jit;
SET jit_above_cost = 100000;   -- only for costly queries

EXPLAIN (ANALYZE) SELECT sum(total) FROM orders WHERE country = 'VN' AND total &gt; 900;
--   JIT:
--     Functions: 6
--     Timing: Generation 1.2 ms, Inlining 9.8 ms, Optimization 41 ms, Emission 28 ms, Total 80 ms

-- turn it off when compile time exceeds the run time
SET jit = off;</pre>
<p>If the JIT <code>Total</code> is a large share of the execution time on short queries, raise <code>jit_above_cost</code> or turn JIT off for that workload.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A BI tool sends thousands of small queries a minute, each over about 10,000 rows (illustrative). After the DBA turns on JIT compilation, every query spends about 40 ms compiling and 0.04 ms running, and the dashboard gets slower. A monthly report with a twelve-table join also spends 1.8 seconds compiling before it reads a row.`,
    predict: {
      q: `A query scans 10,000 rows. Interpreted, it takes 4 ms. Compiled, it takes 40 ms to compile and 0.4 ms to run. Which path finishes first, and why?`,
      opts: [
        `The interpreter, because the compile time is larger than all of its work`,
        `The compiled path, because its run time is ten times smaller`,
        `They tie, because both do the same work`,
        `The compiled path, because compile time does not count as query time`
      ],
      ans: 0,
      why: `Compiled code finishes at 40 + 0.4 = 40.4 ms, interpreted code at 4 ms. Compiling pays only when the saved time per row, times the number of rows, exceeds the compile time: here that needs about 111,000 rows.`
    },
    diagnose: [
      OLD.diagnose[0],
      {
        t: 'Compile time grows with the query',
        sym: '<b>A large report</b> spends seconds compiling before it reads a row.',
        ctx: 'A twelve-table join with many predicates and aggregates generates a very large function. Optimizing that function takes far longer than for a small query.',
        why: 'Compile cost grows faster than linearly with the number of operators and expressions, because inlining and optimization passes look at the whole function. The benefit grows only with the rows processed.',
        log: `-- representative PostgreSQL JIT summary, illustrative
JIT:  Functions: 148
  Timing: Generation 31 ms, Inlining 420 ms, Optimization 1105 ms, Emission 260 ms, Total 1816 ms
Execution Time: 2240 ms`,
        note: 'A JIT total of most of the execution time says the compile is the cost, not the query.',
        fix: [
          'Measure first: read the JIT timing in the plan and compare it with the total execution time.',
          'Raise the cost thresholds, such as <code>jit_above_cost</code> and <code>jit_optimize_above_cost</code>, so only heavy queries are optimized.',
          'Disable inlining or optimization for the workload, or turn JIT off, when the queries are short.',
          'Prefer an engine with adaptive execution or a fast translator for large generated plans.',
          'Verify: compare execution time with and without JIT on the same report.'
        ]
      },
      {
        t: 'Compiled code is not reused',
        sym: '<b>Every query</b> pays the compile cost again, although the query shape repeats.',
        ctx: 'The application builds SQL with literal values inside the text, so each statement is new. The engine cannot reuse compiled code from a previous one.',
        why: 'Compiled code is keyed by the query text or plan shape. A different literal makes a different key, so the work of the previous compile is lost. Parameters keep the text the same.',
        log: `-- representative, illustrative
statement cache hit rate: 2%
compile time per query: 38 ms (avg)   queries per minute: 41,000`,
        note: 'A low cache hit rate on repeated queries means their text keeps changing.',
        fix: [
          'Measure first: read the statement or plan cache hit rate and the count of distinct statement texts.',
          'Use bind parameters or prepared statements, so one compiled form serves all values.',
          'Cache compiled fragments, as some engines do per customer, when the system supports it.',
          'Verify: the hit rate should climb and the compile time per query should fall toward zero.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[14] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [fused, breakeven, adaptive] };
})();
