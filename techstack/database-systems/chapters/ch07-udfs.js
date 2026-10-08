/* Chapter 7 · Server-side logic and UDFs.
   Owns: server-side computation (UDF forms, why they are slow, inlining, batching).
   Points away: operator pipeline (ch5), compilation and parallel execution (ch10), unnesting rules (ch9). */
PG.udfs = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, chip = SX.chip, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch07-css', `
.ch07-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}
.ch07-bars .ch07-row{display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:center;margin:6px 0;font-size:13px}
.ch07-track{height:12px;border-radius:6px;background:var(--soft);overflow:hidden}
.ch07-track i{display:block;height:100%;background:var(--acc)}
.ch07-track i.bad{background:var(--bad)}
.ch07-arch{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.ch07-arch button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.ch07-arch button.on{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}
.ch07-arch span.ch07-arr{color:var(--mut)}
.ch07-def{border-left:3px solid var(--acc);padding:6px 10px;margin:8px 0;background:var(--soft);border-radius:6px;font-size:14px}
.ch07-code{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font-size:13px;white-space:pre;margin:8px 0}
.ch07-count{font-family:ui-monospace,monospace;font-size:14px;color:var(--ink)}
.ch07-count b{color:var(--acc)}
.ch07-count b.bad{color:var(--bad)}
.ch07-list li{margin:4px 0}
.ch07-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.ch07-txt{font-size:14px;margin:8px 0}
`);

  /* ---------- the cost model used by the playground ----------
     Illustrative per-operation costs, in milliseconds. The counts (calls, statements, rows) are exact for the model. */
  const CALL_MS = 0.05;   // one UDF call: enter and leave the function runtime
  const STMT_MS = 0.2;    // one SQL statement issued from inside the UDF: parse, plan, run
  const ROW_MS = 0.0005;  // one row of set-oriented work in the main plan

  const fmt = n => n.toLocaleString('en-US');
  const ms = x => (x >= 1000 ? (x / 1000).toFixed(1) + ' s' : x.toFixed(1) + ' ms');

  function model(mode, N, B) {
    if (mode === 'scalar') return { calls: N, stmts: N, rows: N, time: N * (CALL_MS + STMT_MS) };
    if (mode === 'inline') return { calls: 0, stmts: 1, rows: N, time: STMT_MS + N * ROW_MS };
    const batches = Math.ceil(N / B);
    return { calls: batches, stmts: batches, rows: N, time: batches * (CALL_MS + STMT_MS) + N * ROW_MS };
  }

  /* ---------- PLAYGROUND ----------
     One lookup per row: the tier rate is read from a 5-row table. Same result, three ways. */
  function playground() {
    let N = 1000000, mode = 'scalar', B = 1000;
    const stats = h('div', { class: 'ch07-grid' });
    const bars = h('div', { class: 'ch07-bars' });
    const txt = h('p', { class: 'ch07-txt' });
    const batchSeg = seg([{ v: 100, l: '100 per call' }, { v: 1000, l: '1,000 per call' }, { v: 10000, l: '10,000 per call' }], B, v => { B = v; paint(); });
    const batchRow = h('div', { class: 'ch07-ctl' }, h('small', {}, 'Batch size (batched mode only)'), batchSeg);

    const paint = () => {
      const cur = model(mode, N, B);
      stats.replaceChildren(
        stat('UDF calls', fmt(cur.calls)),
        stat('SQL statements issued', fmt(cur.stmts)),
        stat('Rows of work', fmt(cur.rows)),
        stat('Illustrative time', ms(cur.time)));
      batchRow.style.display = mode === 'batched' ? '' : 'none';
      const all = ['scalar', 'batched', 'inline'].map(m => [m, model(m, N, B).time]);
      const maxT = Math.max(...all.map(x => x[1]));
      const label = { scalar: 'Scalar UDF', batched: 'Batched UDF', inline: 'Inlined expression' };
      bars.replaceChildren(...all.map(([m, t]) => h('div', { class: 'ch07-row' },
        h('span', {}, label[m] + (m === 'batched' ? ' (' + fmt(B) + ' per call)' : '')),
        h('div', { class: 'ch07-track' }, h('i', { class: m === 'scalar' ? 'bad' : '', style: 'width:' + Math.max(2, (t / maxT) * 100) + '%' })),
        h('b', {}, ms(t)))));
      const sc = model('scalar', N, B).time, inl = model('inline', N, B).time;
      txt.textContent = 'At ' + fmt(N) + ' rows the scalar UDF makes ' + fmt(N) + ' calls and ' + fmt(N) + ' statements. The inlined expression makes 0 calls and 1 statement. The scalar form is about ' + Math.round(sc / inl) + ' times slower in this model.';
    };

    const rowsSeg = seg([{ v: 10000, l: '10,000 rows' }, { v: 100000, l: '100,000 rows' }, { v: 1000000, l: '1,000,000 rows' }], N, v => { N = v; paint(); });
    const modeSeg = seg([{ v: 'scalar', l: 'Scalar UDF' }, { v: 'inline', l: 'Inlined expression' }, { v: 'batched', l: 'Batched UDF' }], mode, v => { mode = v; paint(); });
    paint();
    return h('div', {},
      h('div', { class: 'ch07-ctl' }, h('small', {}, 'Input size'), rowsSeg),
      h('div', { class: 'ch07-ctl' }, h('small', {}, 'Execution form'), modeSeg),
      batchRow,
      stats, bars, txt,
      h('p', { class: 'sx-p' }, h('small', {}, 'Time is an illustrative model: 0.05 ms per UDF call, 0.2 ms per statement issued from the UDF, 0.0005 ms per row of set work. The counts are exact for this model; the times are not measurements.')));
  }

  /* ---------- CASE STUDY: Froid ----------
     Architecture with clickable parts, and the rewrite path as a stepper on one illustrative UDF. */
  const ORDERS = 1000000;
  const PARTS = [
    { k: 'udf', l: 'UDF source', d: 'The imperative function exactly as the developer wrote it. Froid rewrites it during the rewrite phase; the developer does not change it (course notes, 15-721 #11 §7).' },
    { k: 'tr', l: 'Transform statements', d: 'Step 1. Each procedural statement becomes a SQL expression over the variables it reads and writes.' },
    { k: 'rg', l: 'Regions', d: 'Step 2. The body is split into regions, so the dependencies between blocks of code are visible.' },
    { k: 'lj', l: 'Lateral joins', d: 'Step 3. Regions are linked by lateral joins. A lateral subquery can refer to columns of the table before it, so the region order is kept.' },
    { k: 'in', l: 'Inlined query', d: 'Step 4. The expression is embedded in the calling query. No function call remains.' },
    { k: 'opt', l: 'Query optimizer', d: 'Step 5. The whole query is optimized together. Constant folding and dead-code elimination shrink the expression.' }
  ];
  function froidCase() {
    const defBox = h('div', { class: 'ch07-def' }, PARTS[0].d);
    const buttons = PARTS.map((p, i) => {
      const b = h('button', { onclick: () => { buttons.forEach(x => x.classList.remove('on')); b.classList.add('on'); defBox.textContent = p.d; } }, p.l);
      if (i === 0) b.classList.add('on');
      return b;
    });
    const arch = h('div', { class: 'ch07-arch' });
    buttons.forEach((b, i) => { arch.append(b); if (i < buttons.length - 1) arch.append(h('span', { class: 'ch07-arr' }, '→')); });

    const udf = 'create function line_total(qty int, price money) returns money as\n  declare disc float = 0;\n  if qty >= 10 set disc = 0.10;\n  return qty * price * (1 - disc);';
    const states = [
      { t: 'Start: the UDF runs once per order row, so the query makes one call for each row.', code: 'select id, line_total(qty, price) from orders', calls: ORDERS, step: 'UDF calls: one per row' },
      { t: 'Step 1: the statements become expressions. The variable disc becomes a CASE expression.', code: 'disc  = case when qty >= 10 then 0.10 else 0 end\ntotal = qty * price * (1 - disc)', calls: ORDERS, step: 'still a call per row' },
      { t: 'Step 2: the body is split into two regions. Region 2 depends on disc from region 1.', code: 'region 1: disc = case when qty >= 10 then 0.10 else 0 end\nregion 2: total = qty * price * (1 - disc)', calls: ORDERS, step: 'still a call per row' },
      { t: 'Step 3: the regions are merged with a lateral join, so they become one relational expression.', code: 'select o.id, r2.total\nfrom orders o\ncross join lateral (select case when o.qty >= 10 then 0.10 else 0 end as disc) r1\ncross join lateral (select o.qty * o.price * (1 - r1.disc) as total) r2', calls: ORDERS, step: 'still a call per row' },
      { t: 'Step 4: the expression is inlined into the calling query. The function call is gone.', code: 'select o.id, o.qty * o.price * (1 - case when o.qty >= 10 then 0.10 else 0 end) as total\nfrom orders o', calls: 0, step: 'no function call' },
      { t: 'Step 5: the optimizer sees the whole query and can plan it as one set-oriented operation. Dead code and constants are removed.', code: 'select o.id, o.qty * o.price * case when o.qty >= 10 then 0.9 else 1 end as total\nfrom orders o', calls: 0, step: 'one set-oriented plan, parallel-capable' }
    ];
    const draw = s => [
      h('pre', { class: 'ch07-code' }, h('code', {}, s.code)),
      h('p', { class: 'ch07-count' }, 'UDF calls: ', h('b', { class: s.calls ? 'bad' : '' }, fmt(s.calls)), ' of ' + fmt(ORDERS) + ' order rows · ' + s.step)
    ];
    const path = stepper(states.map(s => Object.assign({}, s)), draw);
    return h('div', {},
      para('The source is a function written in a procedural language, and the rewrite is the work of the database, not the developer. The example below is illustrative, not a dump of a real plan. The UDF is:'),
      h('pre', { class: 'ch07-code' }, h('code', {}, udf)),
      h('p', { class: 'sx-p' }, h('b', {}, 'Architecture. '), 'Click a part to read its role.'),
      arch, defBox,
      h('p', { class: 'sx-p' }, h('b', {}, 'Rewrite path. '), 'Play or step through the five Froid steps.'),
      path,
      para('Froid runs during the rewrite phase, so the cost-based optimizer itself does not change. It also applies normal code optimizations along the way: dynamic slicing, constant propagation and folding, and dead-code elimination. Inlining is not always faster, so the result still goes through the cost model.'));
  }

  /* ---------- COMMON PROBLEMS ---------- */
  const N_SAMPLE = 8;
  const problems = [
    {
      tab: 'Scalar UDF per row',
      sym: '<b>UDF calls</b> equal the row count. The query runs for minutes on a table that a set-oriented plan scans in seconds.',
      why: 'A scalar UDF is a black box to the optimizer, so it is planned as one call per row. Each call pays the cost of entering the function runtime and, if the function queries, a statement of its own.',
      log: 'representative plan note, wording varies by engine\nFunction Scan on line_total  (calls=1000000)\n  -> SQL statements issued from function: 1000000',
      demo(mode) {
        const bad = mode === 'bad';
        const states = [{ t: 'Start. ' + (bad ? 'The query reads its first row and calls the UDF on it.' : 'The expression is inlined, so no call is made.'), done: 0, calls: 0, rows: 0 }];
        for (let r = 1; r <= N_SAMPLE; r++) {
          states.push({ t: bad ? 'Row ' + r + ' of ' + N_SAMPLE + ': one more UDF call and one more statement.' : 'Row ' + r + ' of ' + N_SAMPLE + ': the same arithmetic runs inside the scan, with no call.', rows: r, calls: bad ? r : 0 });
        }
        states.push({ t: bad ? 'Done: ' + N_SAMPLE + ' rows gave ' + N_SAMPLE + ' calls. At ' + fmt(1000000) + ' rows that is ' + fmt(1000000) + ' calls.' : 'Done: ' + N_SAMPLE + ' rows, 0 calls. The same plan at ' + fmt(1000000) + ' rows still makes 0 calls.', rows: N_SAMPLE, calls: bad ? N_SAMPLE : 0, final: true });
        return stepper(states, s => [
          h('p', { class: 'ch07-count' }, 'Rows processed: ', h('b', {}, String(s.rows)), '   UDF calls: ', h('b', { class: bad && s.calls ? 'bad' : '' }, String(s.calls))),
          h('p', { class: 'sx-p' }, bad ? 'Each row enters the function runtime separately.' : 'The scan evaluates the expression directly.')]);
      },
      fix: [
        'Rewrite the function as a plain SQL expression, or as a view, so the optimizer can inline it.',
        'If the logic must stay procedural, check whether the engine can inline it (for example Froid in SQL Server) and whether that inlining happens in your version.',
        'Check the plan: a Function Scan with a large call count is the signal.',
        'Verify: the call count in the plan should drop to 0 after inlining, and the elapsed time should fall in step.'
      ]
    },
    {
      tab: 'Cursor loop instead of one set',
      sym: '<b>Round trips</b> grow with rows. A loop that fetches and updates one order at a time sends two statements for each.',
      why: 'A cursor loop processes rows one at a time (row by agonizing row). Each FETCH and each UPDATE is a separate statement, and the optimizer cannot combine them into one plan.',
      log: 'representative client log, wording varies\n-- loop body runs once per row\nFETCH NEXT FROM order_cur\nUPDATE orders SET total = ... WHERE id = $1',
      demo(mode) {
        const bad = mode === 'bad';
        const ORDERS4 = ['o1', 'o2', 'o3', 'o4'];
        const states = [{ t: bad ? 'Start. The cursor is opened over the orders.' : 'Start. One UPDATE will cover all the orders.', stmts: 0, rows: 0 }];
        if (bad) {
          ORDERS4.forEach((o, i) => {
            states.push({ t: 'Fetch ' + o + ': one statement to read the row.', stmts: i * 2 + 1, rows: i });
            states.push({ t: 'Update ' + o + ': one statement to write it back.', stmts: i * 2 + 2, rows: i + 1 });
          });
          states.push({ t: 'Done: 4 orders took 8 statements. At ' + fmt(2000) + ' orders that is ' + fmt(4000) + ' statements.', stmts: 8, rows: 4, final: true });
        } else {
          states.push({ t: 'One set-oriented UPDATE with a join covers all the orders at once.', stmts: 1, rows: 4 });
          states.push({ t: 'Done: 4 orders took 1 statement. At ' + fmt(2000) + ' orders it is still 1 statement.', stmts: 1, rows: 4, final: true });
        }
        return stepper(states, s => [
          h('p', { class: 'ch07-count' }, 'Statements sent: ', h('b', { class: bad && s.stmts ? 'bad' : '' }, String(s.stmts)), '   Rows handled: ', h('b', {}, String(s.rows)))]);
      },
      fix: [
        'Write one set-oriented UPDATE (or INSERT ... SELECT) that joins the source to the target.',
        'If the loop has real branching, express each branch as a CASE expression inside the set statement.',
        'Keep the cursor only for the rare case that a set statement cannot express, and batch its work.',
        'Verify: count the statements in the server log; a set-oriented version sends one statement per batch, not per row.'
      ]
    },
    {
      tab: 'Side effect blocks inlining',
      sym: '<b>The UDF runs as a black box</b> on every row, and it writes an audit row each time, so the row count of writes equals the row count of calls.',
      why: 'General reasoning, not from the notes: the optimizer may inline or reorder only what it can prove has no side effects. A function that writes a log row is a barrier: it stays as a call, and each call performs its own write.',
      log: 'representative plan note\nFunction Scan on audit_price (calls=8, side effects: 8 inserts into audit_log)\nInlining: not applied, function writes to a table',
      demo(mode) {
        const bad = mode === 'bad';
        const states = [{ t: bad ? 'Start. The UDF cannot be inlined because it writes an audit row.' : 'Start. The price logic is pure, so it is inlined. The audit write moves to one batch step.', calls: 0, writes: 0 }];
        for (let r = 1; r <= N_SAMPLE; r++) {
          states.push({ t: bad ? 'Row ' + r + ': call the UDF, which inserts one audit row.' : 'Row ' + r + ': the price is computed inline, with no call and no write.', calls: bad ? r : 0, writes: bad ? r : 0 });
        }
        states.push({ t: bad ? 'Done: 8 calls and 8 audit writes. At ' + fmt(1000000) + ' rows that is ' + fmt(1000000) + ' writes.' : 'Done: 0 calls and 1 batched audit insert for all 8 rows.', calls: bad ? N_SAMPLE : 0, writes: bad ? N_SAMPLE : 1, final: true });
        return stepper(states, s => [
          h('p', { class: 'ch07-count' }, 'UDF calls: ', h('b', { class: bad && s.calls ? 'bad' : '' }, String(s.calls)), '   Audit writes: ', h('b', { class: bad && s.writes ? 'bad' : '' }, String(s.writes)))]);
      },
      fix: [
        'Move the audit write out of the function and into the caller, as one batched INSERT ... SELECT after the main query.',
        'Keep the UDF pure (no writes, no reads of changing state) so the optimizer can inline it and push cheap predicates ahead of it.',
        'Mark functions with the correct volatility, so the planner does not assume they are pure when they are not.',
        'Verify: the function should show as inlined, and the write count should match the number of batches, not the number of rows.'
      ]
    },
    {
      tab: 'Unsafe extension crashes the server',
      sym: '<b>One bad native function</b> kills its server process, and every other session on the server is reset with it.',
      why: 'General knowledge, not from the notes: a compiled extension runs inside the database process, with the process memory and privileges. A fault in it is a fault in the server. The server then resets the other sessions to protect shared memory.',
      log: 'representative server log, wording varies by version\nLOG: server process (PID 4121) was terminated by signal 11: Segmentation fault\nWARNING: terminating connection because of crash of another server process',
      demo(mode) {
        const bad = mode === 'bad';
        const SESSIONS = 200;
        const states = [{ t: 'Start. ' + SESSIONS + ' sessions are connected to the server.', alive: SESSIONS }];
        if (bad) {
          states.push({ t: 'One session calls the native function, which faults on row 3.', alive: SESSIONS });
          states.push({ t: 'The server process crashes. The server resets shared memory.', alive: 0 });
          states.push({ t: 'Every session is dropped. ' + SESSIONS + ' sessions are lost, and all of them must reconnect.', alive: 0, final: true });
        } else {
          states.push({ t: 'The same function runs in a separate sandboxed worker, with a time limit.', alive: SESSIONS });
          states.push({ t: 'The worker faults on row 3. Only the call that used it fails.', alive: SESSIONS - 1 });
          states.push({ t: 'Done: the failed query returns an error. ' + (SESSIONS - 1) + ' sessions stay connected.', alive: SESSIONS - 1, final: true });
        }
        return stepper(states, s => [
          h('p', { class: 'ch07-count' }, 'Sessions still connected: ', h('b', { class: bad && s.alive === 0 ? 'bad' : '' }, String(s.alive)), ' of ' + SESSIONS)]);
      },
      fix: [
        'Run untrusted or experimental logic in a separate worker process, with a timeout and memory limit, rather than in the server process.',
        'Prefer the engine interpreted or sandboxed language for UDFs over native code that can crash the process.',
        'Set statement timeouts, so a runaway function fails one query instead of holding a session.',
        'Verify: kill the worker in a test and confirm that only the one query fails and other sessions stay connected.'
      ]
    }
  ];

  root.append(
    sec('1 · The problem',
      para('(Illustrative numbers.) A scalar UDF called once per row can turn a two-second analytical query into several minutes. Each call crosses into the function runtime, and often issues a query of its own. The optimizer cannot see inside the call, so it cannot plan around it.'),
      para('<b>When does moving logic into a UDF make a query slower instead of faster?</b>')),

    sec('2 · Core idea and mechanisms',
      para('Database logic performs well when the optimizer can inspect, inline, and batch it.'),
      h('ul', { class: 'ch07-list' },
        h('li', {}, h('b', {}, 'Why put logic in the database. '), 'Fewer network round trips between the application and the DBMS, reuse by many queries, and some logic is easier to read as a function than as SQL. Logic runs on the latest data, not on a stale snapshot.'),
        h('li', {}, h('b', {}, 'Forms. '), 'User-defined functions (UDFs), stored procedures, triggers, user-defined types, and user-defined aggregates. A UDF takes scalar arguments and returns a scalar or a table. The procedural languages are SQL/PSM, PL/SQL, PL/pgSQL, SQL PL, and Transact-SQL.'),
        h('li', {}, h('b', {}, 'Cursor loops (row by agonizing row). '), 'Logic that processes one tuple at a time and issues queries as it goes. Implicit queries inside the loop are invisible to the optimizer.'),
        h('li', {}, h('b', {}, 'Why UDFs are slow. '), 'The optimizer treats a UDF as a black box, so it cannot cost it. Correlated queries inside the UDF can prevent parallel execution, and some DBMSs run them on a single thread. Statements run one at a time, so there are no cross-statement optimizations.'),
        h('li', {}, h('b', {}, 'Nested subqueries. '), 'In a WHERE clause, the DBMS treats a nested subquery as a function of its outer row. It can rewrite the subquery to de-correlate or flatten it, or decompose it into a temporary table joined afterward. The unnesting rules are in chapter 9.'),
        h('li', {}, h('b', {}, 'Lateral join. '), 'An inner subquery in the FROM clause can refer to columns of the row it joins with. The DBMS evaluates it once per outer row. Froid uses lateral joins to chain its regions.'),
        h('li', {}, h('b', {}, 'Inlining (Froid). '), 'Rewrite the imperative UDF into a relational expression during the rewrite phase, then inline it into the calling query. Five steps: transform statements to SQL, break the UDF into regions, merge the regions with lateral joins, inline the expression, and run the whole query through the optimizer. Normal code optimizations (dynamic slicing, constant propagation and folding, dead-code elimination) apply along the way. The cost-based optimizer does not need to change. Case study below.'),
        h('li', {}, h('b', {}, 'Recursive CTEs (APFEL). '), 'Rewrite the UDF into plain SQL that any DBMS with common table expressions can run. The steps are: static single assignment form (each variable defined once, with labels and jumps), administrative normal form (each function ends by calling another), mutual recursion turned into direct recursion, tail recursion turned into WITH RECURSIVE, then the normal optimizer. Being a middleware layer, it works on any DBMS with CTEs, and it covers loops that Froid does not handle.'),
        h('li', {}, h('b', {}, 'Batching. '), 'Turn the UDF into UPDATE statements over a temporary table that holds the state of each variable, one row per input tuple. The statements then run over a batch of tuples at once. The course notes cite the CIDR 2024 paper (Franz et al.) as showing that batching beats inlining for the cases it measured.'),
        h('li', {}, h('b', {}, 'Vectorized UDFs. '), 'The same idea seen from the function side: one call receives a batch of values, not one value, so the call overhead is paid once per batch.'),
        h('li', {}, h('b', {}, 'Side effects. '), 'A function that writes, or reads state that changes, is not a pure expression. The notes do not cover this case; as general reasoning, an optimizer that cannot prove the function safe to move keeps it as a call, and each row triggers the write.'),
        h('li', {}, h('b', {}, 'Unsafe extensions. '), 'General knowledge, not from the notes: native code loaded into the server process can fault and take the server process down, not just one query.'),
        h('li', {}, h('b', {}, 'Other ways to speed up UDFs. '), 'Compile the interpreted UDF to native code, or annotate which parts can run in parallel. Both are covered in chapter 10.')
      ),
      para('Next: the playground runs the same work three ways and counts calls, statements, and rows. The case study shows how Froid turns the function into a plan, and the four problems show what breaks in practice.')),

    sec('3 · Playground',
      para('Same work, three execution forms. Change the input size and the batch size to see how calls, statements, and time move.'),
      playground()),

    sec('4 · Case study: Froid in SQL Server',
      para('Froid (Ramachandra et al., PVLDB 2017, cited in the course notes as reference [4]) is Microsoft Research work. It ships as scalar UDF inlining in SQL Server 2019 (Microsoft Research, BlackMagic: Automatic Inlining of Scalar UDFs into SQL Queries with Froid, PVLDB 2019; checked by web search). The architecture below shows the parts that the rewrite uses. Each part is a step in the Froid pipeline.'),
      froidCase()),

    sec('5 · Common problems',
      para('Four ways a UDF costs far more than its arithmetic. Each card shows the failure first; switch to After fix to see the same work done the set-oriented way.'),
      SX.problems(problems))
  );
};
