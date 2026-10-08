/* Chapter 10 · cpu · Vectorized, compiled and parallel execution.
   Owns: SIMD and vectorized operators, compiled pipelines, scheduling, morsels, NUMA placement, flow control.
   Points elsewhere: the Volcano iterator (chapter 5), join algorithms (chapter 6), hash-table layout (chapter 4). */
PG.cpu = function (root, A) {
  const { h, seg, player } = A;
  const sec = SX.sec, para = SX.para, chip = SX.chip, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch10-css', `
.ch10-vec{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:4px 0}
.ch10-vec>small{width:100px;color:var(--mut);font-size:12px}
.ch10-lane{width:26px;height:26px;border-radius:6px;border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font:12px ui-monospace,monospace;background:var(--soft);color:var(--ink)}
.ch10-lane.on{background:var(--ok);border-color:var(--ok);color:var(--card)}
.ch10-lane.dead{opacity:.3;text-decoration:line-through}
.ch10-lane.idle{background:transparent;border-style:dashed;color:var(--mut)}
.ch10-grid{display:flex;flex-wrap:wrap;gap:6px}
.ch10-box{border:1px solid var(--line);border-radius:10px;padding:6px 8px;background:var(--card);min-width:110px;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--ink)}
.ch10-box b{font-size:13px}
.ch10-box.run{border-color:var(--acc)}
.ch10-box.remote{border-color:var(--warn)}
.ch10-box.wait{border-style:dashed;color:var(--mut)}
.ch10-box.done{background:var(--soft);color:var(--mut)}
.ch10-m{width:70px;padding:6px 4px;border-radius:8px;border:1px solid var(--line);font-size:12px;text-align:center;background:var(--card);color:var(--ink);display:flex;flex-direction:column;gap:2px}
.ch10-m.todo{border-style:dashed;color:var(--mut)}
.ch10-m.run{border-color:var(--acc);color:var(--acc)}
.ch10-m.done{background:var(--soft);color:var(--mut)}
.ch10-row{display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;font-size:13px;margin:6px 0}
.ch10-row small{color:var(--mut)}
.ch10-track{background:var(--soft);border-radius:6px;height:16px;overflow:hidden}
.ch10-fill{height:100%;background:var(--acc);border-radius:6px;min-width:2px}
.ch10-fill.bad{background:var(--bad)}
.ch10-arch{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.ch10-arch button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;cursor:pointer}
.ch10-arch button.on{border-color:var(--acc);color:var(--acc)}
.ch10-def{min-height:3em;color:var(--ink);font-size:14px}
@media (max-width:480px){.ch10-row{grid-template-columns:1fr}.ch10-vec>small{width:100%}}
`);

  /* ---------- cost model: illustrative cycles per row, not a measurement ---------- */
  const M = { GHZ: 3, SCAN: 6, OPS: 3, CALL: 10, MISS: 15, BATCH: 200, L1: 1024, PAR: 0.03 };
  /* rates for one batch size, selectivity, placement and core count */
  function rates(B, s, placement, C) {
    const mis = Math.min(s, 1 - s);                              // share of rows that flip a branch (random data)
    const far = placement === 'socket0' && C > 1 ? 0.5 : 0;      // half the workers read from the far socket
    const mem = M.SCAN * (1 + 0.6 * far);                        // memory cost per row
    const pen = B > M.L1 ? 1 + 0.25 * Math.log2(B / M.L1) : 1;   // batch no longer fits in L1
    const overhead = (M.OPS * M.BATCH) / B;                      // per-call cost, shared by the rows of one batch
    const eff = 1 / (1 + M.PAR * (C - 1));                       // parallel efficiency
    const scalar = 2 + M.OPS * M.CALL + mis * M.MISS + mem;      // a call per operator per row, plus branch misses
    const vector = overhead + (4 + 1.5 * s) * pen + mem;         // branch-free selection vectors
    const compiled = (3 + 1.5 * s) + mis * M.MISS + mem;         // one fused loop, but branches stay
    return { mis, eff, mem, pen, overhead, scalar, vector, compiled };
  }
  const mrows = cyc => M.GHZ * 1000 / cyc;                       // million rows per second, one core

  /* ---------- morsel-style scheduler simulation (illustrative: one queue pop per tick per queue) ---------- */
  function simulate(o) {
    const queues = o.perSocket ? [[], []] : [[]];
    o.morsels.forEach((sk, i) => queues[o.perSocket ? sk : 0].push(i));
    const status = o.morsels.map(() => 'todo');
    const W = o.workers.map((sk, id) => ({ id, sk, m: -1, end: 0, remote: false, lost: false }));
    const log = [];
    let t = 0, done = 0, waits = 0, remote = 0, last = 0;
    while (done < o.morsels.length && t < 200) {
      W.forEach(w => { if (w.m >= 0 && w.end <= t) { status[w.m] = 'done'; w.m = -1; done++; } });
      const req = {};
      W.forEach(w => {
        w.lost = false;
        if (w.m >= 0) return;
        let q = -1;
        if (o.perSocket) q = queues[w.sk].length ? w.sk : queues.findIndex((x, i) => i !== w.sk && x.length);
        else if (queues[0].length) q = 0;
        if (q >= 0) (req[q] = req[q] || []).push(w);
      });
      const events = [];
      Object.keys(req).forEach(q => {
        const pick = t % req[q].length;                          // the lock grants in turn, not always to the lowest id
        const win = req[q][pick];
        req[q].forEach((w, i) => { if (i !== pick) { waits++; w.lost = true; } });
        const mi = queues[q].shift();
        const far = o.morsels[mi] !== win.sk;
        win.m = mi; win.remote = far; win.end = t + (far ? o.cost[1] : o.cost[0]);
        status[mi] = 'run';
        if (far) remote++;
        last = Math.max(last, win.end);
        events.push('W' + win.id + (far ? ' steals' : ' takes') + ' morsel ' + mi + (far ? ' from the other socket' : ''));
      });
      const waiting = W.filter(w => w.lost).length;
      log.push({
        t: 'Tick ' + t + ': ' + (events.length ? events.join('; ') : 'nothing new is granted') + '. ' + waiting + ' worker(s) wait for a queue lock.',
        w: W.map(x => ({ id: x.id, sk: x.sk, m: x.m, remote: x.remote, lost: x.lost })),
        status: status.slice()
      });
      t++;
    }
    return { ticks: last, waits, remote, log, morsels: o.morsels, workers: o.workers };
  }
  /* a stepper over a simulation: one state per tick, plus the start state */
  function simStepper(sim) {
    const start = { t: 'Start: ' + sim.morsels.length + ' morsels are queued. Each morsel lives on one socket (shown under its name).', w: sim.workers.map((sk, id) => ({ id, sk, m: -1, remote: false, lost: false })), status: sim.morsels.map(() => 'todo') };
    const states = [start, ...sim.log];
    return stepper(states, s => [
      h('div', { class: 'ch10-grid' }, s.w.map(x => h('div', { class: 'ch10-box ' + (x.m >= 0 ? (x.remote ? 'remote' : 'run') : x.lost ? 'wait' : 'done') },
        h('b', {}, 'W' + x.id + ' · socket ' + x.sk),
        h('small', {}, x.m >= 0 ? 'morsel ' + x.m + (x.remote ? ' (far socket)' : ' (local)') : x.lost ? 'waiting for the queue lock' : 'no work now')))),
      h('div', { class: 'ch10-grid' }, s.status.map((st, i) => h('div', { class: 'ch10-m ' + st },
        h('b', {}, 'M' + i), h('small', {}, 'socket ' + sim.morsels[i]), h('small', {}, st === 'todo' ? 'queued' : st === 'run' ? 'running' : 'done'))))
    ]);
  }

  /* ---------- 1 · The problem ---------- */
  const problemSec = sec('1 · The problem',
    para('All data is in memory, so the disk no longer sets the pace. But the CPU spends most of its time on function calls, branches, and scheduling overhead.'),
    para('Chapter 5 showed the Volcano iterator, where each operator calls its child once for each row. That design is simple, and its cost is paid on every row.'),
    para('This chapter asks how to make each row cost fewer cycles, and how to spread the rows across cores.'),
    h('p', { class: 'sx-q', html: 'Once the data is in memory, why is a simple filter still slow, and which change should the engine make first?' }));

  /* ---------- 2 · Core idea and mechanisms ---------- */
  const mechSec = sec('2 · Core idea and mechanisms',
    para('<b>Core idea:</b> process batches in tight CPU loops, and distribute small units of work across cores.'),
    h('ul', { class: 'sx-list', html: [
      '<b>SIMD:</b> one instruction works on several values in a register. Most engines use <b>vertical</b> vectorization, one lane per row. Horizontal vectorization, which reduces across lanes, is rarer and needs AVX2 or later.',
      '<b>Getting SIMD code:</b> the compiler auto-vectorizes only simple loops. Hints such as C99 <code>restrict</code> tell it that pointers do not overlap. Explicit intrinsics are fastest but less portable. A common mix is hints first, then hand-written code for the rest.',
      '<b>AVX-512 tools:</b> masking, permute, selective load and store, compress and expand, and gather and scatter. They let a loop keep only the lanes that matter. The extension is split into groups, and some chips lower the clock when they run it.',
      '<b>Selection vectors:</b> a list of the row positions that passed a predicate. Later operators read only those positions, so the surviving rows are not copied. A bitmask does the same job lane by lane (general definition; the notes describe the bitmask and compress steps).',
      '<b>Branch handling:</b> a branch that mispredicts stalls the pipeline (the playground uses 15 cycles, illustrative). Vectorized code avoids the branch: it computes a bitmask for the whole vector and compresses the survivors. Compiled code keeps the branch unless the compiler predicates it, which is why the playground shows compiled code losing at 50 percent selectivity.',
      '<b>Vectorized algorithms:</b> a selection scan builds a bitmask and keeps the matching rows. A hash probe gathers one key per lane. A histogram keeps one counter per lane so that lanes do not overwrite each other. Vector refill keeps lanes full after a filter removes rows.',
      '<b>Relaxed operator fusion:</b> split a pipeline into stages joined by cache-sized buffers. Each stage fills its vectors before the next stage runs, and a prefetch can fetch the next batch while the current one is processed.',
      '<b>Code specialization:</b> generate code for one query. Types are known, so casts become inline pointer reads. Predicates become plain comparisons, and the loop makes no function calls.',
      '<b>Code generation:</b> transpilation writes C or C++ and calls a compiler, which is slow to start. JIT compilation emits LLVM IR, which compiles quickly. HyPer fuses each pipeline so a tuple stays in registers. Its adaptive mode starts with an interpreter, compiles in the background, and switches per morsel when the code is ready.',
      '<b>Scale of the gain:</b> to go 10 times faster, the DBMS must execute 90 percent fewer instructions. To go 100 times faster, it must execute 99 percent fewer.',
      '<b>Vectorization vs compilation:</b> Tectorwise (vectorized primitives that write their outputs to vectors) and Typer (compiled, one tuple through the whole pipeline) perform about the same overall. Compilation does better on calculation-heavy work with few cache misses. Vectorization hides cache-miss latency better. Many newer systems chose vectorization.',
      '<b>Scheduling:</b> an operator instance runs on a segment of data, a task is a sequence of instances, and a task set holds the tasks of one pipeline. The scheduler decides how many workers run, where each one runs, and which task it takes next.',
      '<b>Process models and placement:</b> one process per worker, a process pool, or one thread per worker. <b>Worker allocation:</b> the course prefers pinning one worker to one core with sched_setaffinity, because the DBMS is assumed to be compute bound. Pinning gives one hardware thread per core, so hyperthreading is off. The alternative puts several workers on one core, and a stalled worker then stalls the others (course notes 08, section 3). On a NUMA machine, place each partition on the socket that will read it. The first-touch rule gives a page to the socket of the thread that first writes it.',
      '<b>Task assignment:</b> a push dispatcher hands tasks to workers, or a pull queue lets idle workers take the next task. Pull keeps the decision local, and workers prefer tasks on their own socket.',
      '<b>Static scheduling:</b> the plan fixes the thread count when it is built, often one per core. It assumes uniform data, so a skewed socket leaves other workers idle.',
      '<b>SQLOS:</b> SQL Server\'s user-mode layer runs coroutines, which switch only when the code yields. Its 4 ms quantum is a target, not something it can enforce, so developers place the yields.',
      '<b>Morsel-driven scheduling:</b> cut the input into morsels of about 100,000 tuples. One worker per core pulls morsels, takes local ones first, and steals from other sockets only when it is idle. Umbra sizes morsels to about 1 ms of work (course notes 08, section 6) and uses stride scheduling to lower the priority of long queries.',
      '<b>Flow control:</b> admission control rejects new work when resources are short. Throttling delays responses to clients that wait for each answer before they send the next request. Without either, the system runs out of memory or its queue grows without limit.'
    ].map(x => '<li>' + x + '</li>').join('') }),
    para('Sources for this section: AVX2 for horizontal reduction (course notes 06, section 2.2); the system list (course notes 07, section 5, including PostgreSQL v11 in 2018, Hekaton generating C, and Spark Tungsten generating JVM bytecode). The scheduler details are from course notes 08.'),
    para('Chapter 5 is the baseline here, not a topic to repeat. Chapter 6 covers join algorithms, and chapter 4 covers hash-table layout.'),
    para('<b>Where the systems in the course sit:</b>'),
    h('table', { class: 'sx-table sx-cmp' },
      h('thead', {}, h('tr', {}, h('th', {}, 'System'), h('th', {}, 'Approach, as the course describes it'))),
      h('tbody', {}, [
        ['IBM System R (1970s)', 'Assembly from one template per operator. Dropped later because of call cost and portability.'],
        ['Vectorwise', 'Pre-compiled vectorized primitives. Function calls are amortized over many tuples.'],
        ['Amazon Redshift', 'Query fragments become templated C++. Compiled fragments are cached locally, then in a fleet-wide cache.'],
        ['Microsoft Hekaton', 'C code generated from an imperative syntax tree, compiled and linked at run time.'],
        ['HyPer, Umbra', 'LLVM IR (HyPer). Umbra emits x86 directly, in one pass, through its FlyingStart framework.'],
        ['Spark Tungsten (2015)', 'Expression trees compiled to JVM bytecode. The course notes Databricks later moved to Photon, a vectorized engine.'],
        ['SingleStore', 'Until 2016, generated C and called gcc. From 2016, a DSL compiled to opcodes, then LLVM.'],
        ['PostgreSQL (v11, 2018)', 'LLVM JIT for expressions and tuple decoding. Optimizer cost estimates decide when to compile.']
      ].map(r => h('tr', {}, r.map((c, i) => h('td', { class: i === 0 ? 'sx-cmp-k' : '', style: i === 1 ? 'text-align:left' : '' }, c)))))));

  /* ---------- 3 · Playground ---------- */
  function playground() {
    const st = { B: '1024', s: '0.5', C: '16', pl: 'local' };
    const view = h('div', { class: 'sx-vis' }), stats = h('div', { class: 'sx-stats' }), note2 = h('p', { class: 'sx-txt' });
    const paint = () => {
      const B = Number(st.B), s = Number(st.s), C = Number(st.C);
      const one = rates(B, s, st.pl, 1), par = rates(B, s, st.pl, C);
      const data = [
        { n: 'Scalar, one tuple at a time', cyc: one.scalar, k: 1 },
        { n: 'Vectorized, batch of ' + B, cyc: one.vector, k: 1 },
        { n: 'Compiled, one fused loop', cyc: one.compiled, k: 1 },
        { n: 'Parallel vectorized, ' + C + ' cores', cyc: par.vector, k: C * par.eff }
      ];
      const base = mrows(one.scalar);
      const tbl = h('table', { class: 'sx-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Engine'), h('th', {}, 'Cycles per row'), h('th', {}, 'M rows per second'), h('th', {}, 'x scalar'))),
        h('tbody', {}, data.map(d => {
          const rate = mrows(d.cyc) * d.k;
          return h('tr', {}, h('td', { style: 'text-align:left' }, d.n), h('td', {}, d.cyc.toFixed(1)), h('td', {}, Math.round(rate).toLocaleString('en-US')), h('td', {}, (rate / base).toFixed(1) + 'x'));
        })));
      const singles = [['scalar', one.scalar], ['vectorized', one.vector], ['compiled', one.compiled]].sort((a, b) => a[1] - b[1]);
      note2.textContent = 'Fastest single-core engine: ' + singles[0][0] + '.' +
        (B === 1 && one.vector > one.scalar ? ' At batch size 1, vectorized code pays the call overhead on every row, so it is slower than scalar code.' : '') +
        (s === 0.5 && one.vector < one.compiled ? ' At 50 percent selectivity, branch misses make the compiled loop slower than the branch-free vectorized one.' : '');
      stats.replaceChildren(
        stat('batch overhead per row', one.overhead.toFixed(1) + ' cycles'),
        stat('branch-miss cost per row', (one.mis * M.MISS).toFixed(1) + ' cycles'),
        stat('parallel efficiency', Math.round(par.eff * 100) + '%'));
      view.replaceChildren(tbl, stats, note2);
    };
    const opt = (label, key, opts) => h('div', {}, h('small', {}, label), seg(opts, st[key], v => { st[key] = v; paint(); }));
    paint();
    return h('div', { class: 'sx-play' },
      h('div', { class: 'sx-controls' },
        opt('Batch size (rows per call)', 'B', [{ v: '1', l: '1' }, { v: '64', l: '64' }, { v: '1024', l: '1,024' }, { v: '16384', l: '16,384' }]),
        opt('Branch selectivity', 's', [{ v: '0.05', l: '5%' }, { v: '0.5', l: '50%' }, { v: '0.95', l: '95%' }]),
        opt('Cores', 'C', [{ v: '1', l: '1' }, { v: '4', l: '4' }, { v: '8', l: '8' }, { v: '16', l: '16' }]),
        opt('Data placement', 'pl', [{ v: 'local', l: 'Each worker reads its own socket' }, { v: 'socket0', l: 'All data on socket 0' }])),
      view);
  }

  /* ---------- 4 · Case study: HyPer morsel-driven scheduling ---------- */
  const ARCH = [
    { n: 'Pipeline', d: 'A chain of operators, such as scan, filter and aggregate, with no pipeline breaker inside. A tuple can flow through the whole chain before the next one is read.' },
    { n: 'Morsel', d: 'A horizontal slice of the input, about 100,000 tuples in HyPer. It is the unit of work, and each morsel lives on one socket.' },
    { n: 'Socket queue', d: 'Holds the morsels placed on one socket. A worker takes from its own socket queue first.' },
    { n: 'Worker', d: 'One thread per core. It pulls a local morsel when one is left, and otherwise steals one from the other socket.' },
    { n: 'Local buffer', d: 'Each worker writes its partial results to its own buffer, so workers do not share a write buffer.' },
    { n: 'Pipeline breaker', d: 'Once every morsel of a pipeline is done, the buffers are merged, for example into a hash table, before the next pipeline starts.' }
  ];
  function caseStudy() {
    const sim = simulate({ workers: [0, 0, 1, 1], morsels: [0, 0, 0, 0, 0, 1, 1, 1], perSocket: true, cost: [2, 3] });
    const def = h('p', { class: 'ch10-def' }, h('span', { class: 'sx-hint' }, 'Click a component above to see what it does.'));
    const btns = ARCH.map((a, i) => h('button', { onclick() { [...btnBox.children].forEach((b, j) => b.classList.toggle('on', j === i)); def.replaceChildren(h('b', {}, a.n + '. '), a.d); } }, a.n));
    const btnBox = h('div', { class: 'ch10-arch' }, btns);
    const sum = h('p', { class: 'sx-p' }, 'Result for this run: ' + sim.ticks + ' ticks, ' + sim.remote + ' reads from the far socket, ' + sim.waits + ' lock waits. Four workers and eight morsels, five on socket 0 and three on socket 1 (skewed placement). Illustrative cost: 2 ticks local, 3 ticks remote.');
    return h('div', { class: 'sx-cs' },
      h('p', { class: 'sx-p' }, 'Architecture: click a component.'), btnBox, def,
      h('p', { class: 'sx-p' }, 'Read path: workers 0 and 1 sit on socket 0, workers 2 and 3 on socket 1. The data is skewed: five morsels sit on socket 0 and three on socket 1. Each worker takes local morsels first, so the socket 1 workers run out first and steal from socket 0.'),
      simStepper(sim), sum);
  }

  /* ---------- 5 · Common problems ---------- */
  function batchDemo(B) {
    const N = 4096, OPS = 3, rowsPer = k => Math.min(N, k * B);
    const states = [{ t: 'Start: ' + N + ' rows, one operator chain of ' + OPS + ' operators. Batch size ' + B + '.', k: 0 }];
    for (let k = 1; k <= 8; k++) states.push({ t: 'Call ' + k + ': one batch of ' + B + ' rows goes through the chain. Each operator pays its call overhead once for the batch.', k });
    const perRow = OPS * M.BATCH / B;
    states.push({ t: 'Whole table: ' + (N / B * OPS).toLocaleString('en-US') + ' operator calls for ' + N.toLocaleString('en-US') + ' rows, so the overhead is ' + perRow.toFixed(1) + ' cycles per row.', k: -1 });
    return stepper(states, s => {
      const calls = s.k < 0 ? N / B * OPS : s.k * OPS;
      const rows = s.k < 0 ? N : rowsPer(s.k);
      return [
        h('div', { class: 'ch10-row' }, h('small', {}, 'rows done'), h('div', { class: 'ch10-track' }, h('div', { class: 'ch10-fill', style: 'width:' + (rows / N * 100).toFixed(2) + '%' }))),
        h('div', { class: 'sx-stats' },
          stat('operator calls', calls.toLocaleString('en-US')),
          stat('rows done', rows.toLocaleString('en-US')),
          stat('overhead per row', s.k < 0 ? perRow.toFixed(1) + ' cycles' : rows ? (s.k * OPS * M.BATCH / rows).toFixed(1) + ' cycles' : '0.0 cycles'))];
    });
  }

  function laneDemo(mode) {
    const N = 32, LANES = 8;
    const pass1 = r => r % 4 === 0;                    // predicate 1 keeps 8 of 32 rows (25 percent)
    const survivors = [...Array(N).keys()].filter(pass1);
    const vecs = (n) => Array.from({ length: n }, (_, i) => i);
    const laneRow = (name, rowsIn, cls) => h('div', { class: 'ch10-vec' }, h('small', {}, name),
      rowsIn.map(r => h('span', { class: 'ch10-lane ' + (cls ? cls(r) : '') }, String(r))));
    const block = (label, rowsList, cls) => {
      const groups = [];
      for (let i = 0; i < rowsList.length; i += LANES) groups.push(rowsList.slice(i, i + LANES));
      return groups.map((g, i) => laneRow(label + ' ' + (i + 1), g, cls));
    };
    const all = vecs(N);
    const plain = () => 'idle';
    const passCls = r => (pass1(r) ? 'on' : 'dead');
    const states = [{ t: N + ' rows in ' + N / LANES + ' vectors of ' + LANES + ' lanes. Predicate 1 keeps ' + survivors.length + ' rows (shown green).', kind: 'start' }];
    if (mode === 'bad') {
      states.push({ t: 'Predicate 1 runs on all lanes. Rows that fail (grey) are still in their vectors.', kind: 'p1' });
      states.push({ t: 'Predicate 2 runs on all ' + N + ' lanes. Only the ' + survivors.length + ' green lanes hold a row that is still needed. The rest compute and discard.', kind: 'bad' });
    } else {
      states.push({ t: 'Compress: pack the ' + survivors.length + ' surviving rows into full vectors, using a selection vector.', kind: 'compress' });
      states.push({ t: 'Predicate 2 runs on ' + Math.ceil(survivors.length / LANES) + ' vector of ' + LANES + ' lanes. Every lane holds a row that is still needed.', kind: 'good' });
    }
    const lanesRun = mode === 'bad' ? N : Math.ceil(survivors.length / LANES) * LANES;
    const util = Math.round(survivors.length / lanesRun * 100);
    states.push({ t: 'Predicate 2: ' + lanesRun + ' lane operations, ' + survivors.length + ' useful, lane utilization ' + util + ' percent.', kind: 'end' });
    return stepper(states, s => {
      let groups;
      if (s.kind === 'start') groups = block('Vector', all, () => '');
      else if (s.kind === 'compress') groups = [...block('Vector', all, passCls), laneRow('Packed', survivors, () => 'on')];
      else if (s.kind === 'good' || s.kind === 'end' && mode === 'good') groups = [laneRow('Packed', survivors, () => 'on')];
      else groups = block('Vector', all, passCls);   // p1, bad and end: rows that failed are still in their lanes
      return [h('div', { class: 'ch10-lanes' }, groups), h('div', { class: 'sx-stats' }, stat('lane operations', lanesRun), stat('useful lanes', survivors.length), stat('utilization', util + '%'))];
    });
  }

  function schedDemo(mode) {
    const morsels = Array.from({ length: 32 }, (_, i) => i % 2);
    const sim = mode === 'bad'
      ? simulate({ workers: Array.from({ length: 16 }, (_, i) => i % 2), morsels, perSocket: false, cost: [2, 3] })
      : simulate({ workers: [0, 0, 0, 0, 1, 1, 1, 1], morsels, perSocket: true, cost: [2, 3] });
    const head = mode === 'bad'
      ? '16 workers pull from one global queue, in arrival order.'
      : '8 workers, 4 per socket. Each socket has its own queue; a worker steals from the other socket only when its own queue is empty.';
    const start ={ t: 'Start: ' + head, w: sim.workers.map((sk, id) => ({ id, sk, m: -1, remote: false, lost: false })), status: morsels.map(() => 'todo') };
    const all = [start, ...sim.log];
    const outcome = 'Result: ' + sim.ticks + ' ticks, ' + sim.waits + ' lock waits, ' + sim.remote + ' reads from the far socket.';
    all.push({ t: outcome, w: sim.log[sim.log.length - 1].w, status: sim.log[sim.log.length - 1].status, end: true });
    return stepper(all, s => {
      const cls = x => (x.m >= 0 ? (x.remote ? 'remote' : 'run') : x.lost ? 'wait' : 'done');
      return [h('div', { class: 'ch10-grid' }, s.w.map(x => h('div', { class: 'ch10-box ' + cls(x) },
          h('b', {}, 'W' + x.id + ' · socket ' + x.sk),
          h('small', {}, x.m >= 0 ? 'morsel ' + x.m + (x.remote ? ' (far)' : '') : x.lost ? 'waiting for lock' : 'no work'))))
        , h('div', { class: 'ch10-grid' }, s.status.map((st, i) => h('div', { class: 'ch10-m ' + st }, h('b', {}, 'M' + i), h('small', {}, st))))];
    });
  }

  function jitDemo(mode) {
    const ROWS = 10000, S = 0.05, COMPILE_MS = 40, PLAN_MS = 1;
    const vec = rates(1024, S, 'local', 1).vector, comp = rates(1024, S, 'local', 1).compiled;
    const runMs = ROWS * vec / (M.GHZ * 1e6);
    const breakEven = COMPILE_MS * M.GHZ * 1e6 / (vec - comp);
    const MAXMS = COMPILE_MS + PLAN_MS;
    const bars = (list) => list.map(b => h('div', { class: 'ch10-row' }, h('small', {}, b.l), h('div', { class: 'ch10-track' }, h('div', { class: 'ch10-fill ' + (b.bad ? 'bad' : ''), style: 'width:' + Math.max(0.5, b.ms / MAXMS * 100).toFixed(2) + '%' })), h('small', {}, b.ms.toFixed(2) + ' ms')));
    const tot = (list) => list.reduce((a, b) => a + b.ms, 0);
    let states;
    if (mode === 'bad') {
      const a = [{ l: 'Plan', ms: PLAN_MS }], b2 = [...a, { l: 'Compile', ms: COMPILE_MS, bad: true }], c = [...b2, { l: 'Run', ms: runMs }];
      states = [
        { t: 'A short query: ' + ROWS.toLocaleString('en-US') + ' rows at ' + (S * 100) + ' percent selectivity. The engine compiles every query before it runs.', list: [] },
        { t: 'Planning takes ' + PLAN_MS + ' ms (illustrative).', list: a },
        { t: 'Compiling to machine code takes about ' + COMPILE_MS + ' ms. This happens before the first row is read.', list: b2 },
        { t: 'Running the compiled code takes ' + runMs.toFixed(2) + ' ms. The total is ' + tot(c).toFixed(2) + ' ms, and compiling is ' + Math.round(COMPILE_MS / tot(c) * 100) + ' percent of it.', list: c }
      ];
    } else {
      const a = [{ l: 'Plan', ms: PLAN_MS }], c = [...a, { l: 'Run', ms: runMs }];
      states = [
        { t: 'The same query. The engine estimates the rows first.', list: [] },
        { t: 'Planning takes ' + PLAN_MS + ' ms (illustrative).', list: a },
        { t: 'Estimate: running vectorized takes ' + runMs.toFixed(2) + ' ms, and compiling costs ' + COMPILE_MS + ' ms. Skip compiling.', list: a },
        { t: 'Run the vectorized code. The total is ' + tot(c).toFixed(2) + ' ms. Compilation would pay off only above about ' + Math.round(breakEven / 1e6) + ' million rows at this selectivity.', list: c }
      ];
    }
    return stepper(states, s => [h('div', {}, bars(s.list.length ? s.list : [{ l: 'Start', ms: 0 }]))]);
  }

  const PROBLEMS = [
    { tab: 'Batches too small', sym: 'the overhead per row is about 600 cycles at batch size 1, far more than the work itself.',
      why: 'Each operator call has a fixed cost: the call, the loop setup and the type checks. A batch spreads that cost over its rows. With one row per batch, the fixed cost is the whole cost.',
      log: 'representative, illustrative\n4,096 rows, batch size 1: 12,288 operator calls\noverhead: ' + (M.OPS * M.BATCH).toFixed(0) + ' cycles per row',
      demo: v => batchDemo(v === 'bad' ? 1 : 1024),
      fix: ['Use batches of about 1,000 rows, which keep the working vectors in L1 or L2 cache.', 'Make the batch size a setting, and test it on your own hardware.', 'Do not go to very large batches. When the vectors overflow the cache, the cost per row rises again.', 'Verify: count operator calls and cycles per row in the engine profile.'] },
    { tab: 'Divergent predicates', sym: 'lanes that already failed a predicate still run the next one.',
      why: 'A SIMD instruction runs on every lane, even when a lane holds a row that an earlier predicate removed. When most rows fail early, most lanes do wasted work.',
      log: 'representative, illustrative\npredicate 2 over 4 vectors: 32 lane operations, 8 useful\nlane utilization: 25 percent',
      demo: v => laneDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Keep a selection vector, and compress the survivors into full vectors before the next predicate.', 'Refill partly empty vectors from the next batch (buffered or partial refill).', 'Run the most selective predicate first, so that fewer lanes reach the others.', 'Verify: lane utilization in the profile should rise toward 100 percent.'] },
    { tab: 'Too many workers', sym: 'workers queue for one lock, and many morsels are read from the far socket.',
      why: 'Every worker needs the queue. With one global queue, only one request is granted per tick, so extra workers mostly wait. The queue also ignores where data lives, so reads cross the socket interconnect.',
      log: 'representative, from the scheduler simulation (illustrative cost model)\nglobal queue, 16 workers: ' + schedDemoNumbers('bad'),
      demo: v => schedDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Set the worker count to the core count, and pin each worker to a core.', 'Use one queue per socket. A worker steals from another socket only when its own queue is empty.', 'Place each partition on the socket that reads it (first touch).', 'Verify: count lock waits and remote morsels before and after the change.'] },
    { tab: 'JIT costs more than it saves', sym: 'a 10,000-row query spends about 40 ms compiling and about 0.04 ms running.',
      why: 'Compilation is a fixed cost paid before the first row. For a short query it is larger than the run itself. It pays off only when the time saved over all rows is larger than the compile time.',
      log: 'representative, illustrative\ncompile: ' + 40 + ' ms (fixed)\nrun, ' + '10,000 rows vectorized: ' + (10000 * rates(1024, 0.05, 'local', 1).vector / (M.GHZ * 1e6)).toFixed(2) + ' ms',
      demo: v => jitDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Interpret or vectorize short queries. Compile only when the estimated run time is larger than the compile time.', 'Use adaptive execution: start with the interpreter, compile in the background, and switch per morsel when the code is ready (HyPer).', 'Cache compiled code for queries that run often.', 'Verify: compare total time, including compile time, for a short query and a long one.'] }
  ];

  /* the scheduler numbers reused by the common-problem log line */
  function schedDemoNumbers(mode) {
    const morsels = Array.from({ length: 32 }, (_, i) => i % 2);
    const sim = simulate({ workers: Array.from({ length: 16 }, (_, i) => i % 2), morsels, perSocket: false, cost: [2, 3] });
    return sim.ticks + ' ticks, ' + sim.waits + ' lock waits, ' + sim.remote + ' remote morsels';
  }

  root.append(
    problemSec,
    mechSec,
    sec('3 · Playground: batch size, selectivity, cores and placement', playground()),
    sec('4 · Case study · HyPer morsel-driven scheduling', caseStudy()),
    sec('5 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
