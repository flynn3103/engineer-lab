/* Chapter 9 · Query optimization and cost models.
   Owns: plan selection (rewrite rules, search strategies, cardinality estimation, cost models, adaptive re-planning).
   Points away: join algorithms (ch6), execution of the chosen plan (ch5, ch10), column statistics layout (ch3). */
PG.optimizer = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, chip = SX.chip, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch09-css', `
.ch09-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}
.ch09-bars .ch09-row{display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:center;margin:6px 0;font-size:13px}
.ch09-track{height:12px;border-radius:6px;background:var(--soft);overflow:hidden}
.ch09-track i{display:block;height:100%;background:var(--acc)}
.ch09-track i.bad{background:var(--bad)}
.ch09-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.ch09-txt{font-size:14px;margin:8px 0}
.ch09-list li{margin:4px 0}
.ch09-arch{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.ch09-arch button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.ch09-arch button.on{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}
.ch09-arch span.ch09-arr{color:var(--mut)}
.ch09-def{border-left:3px solid var(--acc);padding:6px 10px;margin:8px 0;background:var(--soft);border-radius:6px;font-size:14px}
.ch09-count{font-family:ui-monospace,monospace;font-size:14px;color:var(--ink)}
.ch09-count b{color:var(--acc)}
.ch09-count b.bad{color:var(--bad)}
.ch09-table{border-collapse:collapse;font-size:13px;margin:8px 0;width:100%}
.ch09-table td,.ch09-table th{border:1px solid var(--line);padding:4px 8px;text-align:right}
.ch09-table td:first-child,.ch09-table th:first-child{text-align:left}
.ch09-table th{background:var(--soft)}
.ch09-code{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font-size:13px;white-space:pre;margin:8px 0}
`);

  const fmt = n => Math.round(n).toLocaleString('en-US');

  /* ---------- THE MODEL ----------
     Four tables in a chain: C (customers) - O (orders) - I (items) - P (products).
     Each join is an equi-join on a key. Its selectivity is 1 / (number of distinct key values), so an FK join keeps one row per child row.
     Cost of a plan = sum of the sizes of its intermediate results (C_out), the simplest cost model that still ranks plans.
     The optimizer ranks plans with estimated numbers. The actual cost of its choice uses the true numbers. */
  const NAMES = ['C', 'O', 'I', 'P'];
  const TRUE_ROWS = { C: 100000, O: 2000000, I: 8000000, P: 50000 };
  const EDGES = [[0, 1, 100000], [1, 2, 2000000], [2, 3, 50000]];
  const LABEL = { C: 'customers', O: 'orders', I: 'items', P: 'products' };

  function connected(mask) {
    const bits = [0, 1, 2, 3].filter(i => mask & (1 << i));
    if (bits.length <= 1) return true;
    const seen = new Set([bits[0]]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of EDGES) {
        if (!(mask & (1 << a)) || !(mask & (1 << b))) continue;
        if (seen.has(a) !== seen.has(b)) { seen.add(a); seen.add(b); grew = true; }
      }
    }
    return bits.every(i => seen.has(i));
  }

  /* rows produced by joining the relations in mask, given row counts and filter selectivities */
  function rowsOf(mask, rows, filt) {
    let c = 1;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) c *= rows[NAMES[i]] * (filt[NAMES[i]] === undefined ? 1 : filt[NAMES[i]]);
    for (const [a, b, ndv] of EDGES) if ((mask & (1 << a)) && (mask & (1 << b))) c /= ndv;
    return c;
  }

  /* dynamic programming over subsets: best plan for each connected subset, no cross products */
  function enumerate(cardOf) {
    const memo = {};
    const best = mask => {
      if (memo[mask]) return memo[mask];
      if (!(mask & (mask - 1))) return (memo[mask] = { cost: 0, tree: NAMES[Math.log2(mask)] });
      let cand = null;
      for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
        const other = mask ^ sub;
        if (sub > other) continue;
        if (!connected(sub) || !connected(other)) continue;
        const L = best(sub), R = best(other);
        const c = L.cost + R.cost + cardOf(mask);
        if (!cand || c < cand.cost) cand = { cost: c, tree: [L.tree, R.tree] };
      }
      return (memo[mask] = cand);
    };
    return best(15);
  }

  const maskOf = t => (typeof t === 'string' ? 1 << NAMES.indexOf(t) : maskOf(t[0]) | maskOf(t[1]));
  const showTree = t => (typeof t === 'string' ? t : '(' + showTree(t[0]) + ' ⋈ ' + showTree(t[1]) + ')');

  /* cost of a fixed tree under a cardinality function; also returns each join node for the stepper */
  function walk(t, cardOf, out) {
    if (typeof t === 'string') return 0;
    const m = maskOf(t);
    const c = walk(t[0], cardOf, out) + walk(t[1], cardOf, out) + cardOf(m);
    out.push({ label: showTree(t), mask: m });
    return c;
  }

  /* solve one setting: stale = products grew 10x since the last ANALYZE; corr = the two customer predicates are correlated;
     share = true share of products in category X (the optimizer assumes 2%) */
  function solve({ stale, corr, share, colStats }) {
    const trueRows = TRUE_ROWS;
    const estRows = Object.assign({}, TRUE_ROWS, stale ? { P: 5000 } : {});
    // customer predicates: region = HN (10%) and segment = gold (10%); the optimizer multiplies them
    const estFilt = { C: colStats ? (corr ? 0.1 : 0.01) : 0.1 * 0.1, P: 0.02 };
    const trueFilt = { C: corr ? 0.1 : 0.1 * 0.1, P: share };
    const estCard = m => rowsOf(m, estRows, estFilt);
    const trueCard = m => rowsOf(m, trueRows, trueFilt);
    const chosen = enumerate(estCard);
    const best = enumerate(trueCard);
    const nodes = [];
    const actualOfChosen = walk(chosen.tree, trueCard, []);
    walk(chosen.tree, trueCard, nodes);
    const detail = nodes.map((n, i) => ({ label: n.label, est: estCard(n.mask), act: trueCard(n.mask) }));
    return {
      chosen: showTree(chosen.tree), chosenEst: chosen.cost, chosenActual: actualOfChosen,
      best: showTree(best.tree), bestCost: best.cost,
      ratio: actualOfChosen / best.cost, same: showTree(chosen.tree) === showTree(best.tree),
      detail, chosenTree: chosen.tree
    };
  }

  /* ---------- PLAYGROUND ----------
     The optimizer picks a plan from estimates. Compare its real cost with the best plan under the true numbers. */
  function playground() {
    let stale = true, corr = false, share = 0.02;
    const grid = h('div', { class: 'ch09-grid' });
    const bars = h('div', { class: 'ch09-bars' });
    const txt = h('p', { class: 'ch09-txt' });
    const detailBox = h('div', {});

    const paint = () => {
      const r = solve({ stale, corr, share });
      grid.replaceChildren(
        stat('Plan the optimizer picked', r.chosen),
        stat('Its estimated cost', fmt(r.chosenEst)),
        stat('Its actual cost', fmt(r.chosenActual)),
        stat('Best plan (true numbers)', r.best),
        stat('Actual cost of the best plan', fmt(r.bestCost)),
        stat('Actual / best', r.ratio.toFixed(2) + ' ×'));
      const top = Math.max(r.chosenActual, r.bestCost);
      bars.replaceChildren(
        h('div', { class: 'ch09-row' }, h('span', {}, 'Picked plan'), h('div', { class: 'ch09-track' }, h('i', { class: 'bad', style: 'width:' + Math.max(2, r.chosenActual / top * 100) + '%' })), h('b', {}, fmt(r.chosenActual))),
        h('div', { class: 'ch09-row' }, h('span', {}, 'Best plan'), h('div', { class: 'ch09-track' }, h('i', { style: 'width:' + Math.max(2, r.bestCost / top * 100) + '%' })), h('b', {}, fmt(r.bestCost))));
      txt.textContent = r.same
        ? 'The optimizer chose the best plan. Its estimates are close enough to the truth here, even though the numbers may still differ.'
        : 'The optimizer chose a different plan. Its real cost is ' + r.ratio.toFixed(1) + ' times the best plan. The wrong estimate sends it down the wrong join order.';
      detailBox.replaceChildren(
        h('table', { class: 'ch09-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Join in the picked plan'), h('th', {}, 'Estimated rows'), h('th', {}, 'Actual rows'))),
          h('tbody', {}, r.detail.map(d => h('tr', {}, h('td', {}, d.label), h('td', {}, fmt(d.est)), h('td', {}, fmt(d.act)))))));
    };

    const staleSeg = seg([{ v: true, l: 'Stale: products grew 10x since ANALYZE' }, { v: false, l: 'Fresh statistics' }], stale, v => { stale = v; paint(); });
    const corrSeg = seg([{ v: false, l: 'Independent predicates' }, { v: true, l: 'Correlated predicates' }], corr, v => { corr = v; paint(); });
    const shareSeg = seg([{ v: 0.02, l: 'Category X: 2% (as estimated)' }, { v: 0.2, l: 'Category X: 20% (drifted)' }], share, v => { share = v; paint(); });
    paint();
    return h('div', {},
      para('Four tables: customers (100,000 rows), orders (2,000,000), items (8,000,000), and products (50,000). Customers are filtered by two predicates, and products by a category. Choose the statistics situation below. The optimizer ranks plans with its estimates; the best plan uses the true numbers.'),
      h('div', { class: 'ch09-ctl' }, h('small', {}, 'Statistics'), staleSeg),
      h('div', { class: 'ch09-ctl' }, h('small', {}, 'Customer predicates'), corrSeg),
      h('div', { class: 'ch09-ctl' }, h('small', {}, 'Product filter'), shareSeg),
      grid, bars, txt, detailBox,
      h('p', { class: 'sx-p' }, h('small', {}, 'Cost is the sum of intermediate result sizes (rows). Estimates use 1 / distinct keys for each join and multiply filter selectivities (independence). The numbers are illustrative; the search and the plan choice are computed exactly for this model.')));
  }

  /* ---------- CASE STUDY: a Cascades memo ----------
     The vocabulary (groups, multi-expressions, transformation and implementation rules, memo) follows the Cascades description in the course notes.
     The memo below is illustrative for three relations. It does not show the internals of SQL Server, Orca, or CockroachDB. */
  function memoCounts(k) {
    // groups added so far, in order: three base groups (size 1), then the three pairs, then the top group (size 3)
    const sizes = [1, 1, 1, 2, 2, 2, 3];
    let groups = 0, exprs = 0, joinExprs = 0;
    for (let i = 0; i < k; i++) {
      const s = sizes[i];
      groups++;
      // a base group holds one expression; a join group holds one logical expression per ordered split
      if (s === 1) exprs += 1;
      else { const e = 2 ** s - 2; exprs += e; joinExprs += e; }
    }
    return { groups, exprs, phys: joinExprs * 2 };
  }
  function memoCase() {
    const defBox = h('div', { class: 'ch09-def' }, 'Memo: the table of every group explored so far. A group holds logically equivalent expressions for one set of relations.');
    const PARTS = [
      { l: 'Logical plan', d: 'The binder output: the query as relational algebra, with no physical choices yet.' },
      { l: 'Memo', d: 'Groups of equivalent expressions. A group for A and B holds both A ⋈ B and B ⋈ A, and each one is stored once.' },
      { l: 'Transformation rules', d: 'Logical to logical: rewrite one expression into an equivalent one, such as commuting a join. Each rule has a pattern and a substitute.' },
      { l: 'Implementation rules', d: 'Logical to physical: turn a logical join into an algorithm, such as a hash join or a nested loop join.' },
      { l: 'Cost model', d: 'Estimates the cost of each physical alternative. The best cost per group is kept in the memo.' },
      { l: 'Best plan', d: 'Extracted from the memo by following the cheapest alternative in each group.' }
    ];
    const buttons = PARTS.map((p, i) => {
      const b = h('button', { onclick: () => { buttons.forEach(x => x.classList.remove('on')); b.classList.add('on'); defBox.textContent = p.d; } }, p.l);
      if (i === 1) b.classList.add('on');
      return b;
    });
    buttons[1].classList.add('on');
    defBox.textContent = PARTS[1].d;
    const arch = h('div', { class: 'ch09-arch' });
    buttons.forEach((b, i) => { arch.append(b); if (i < buttons.length - 1) arch.append(h('span', { class: 'ch09-arr' }, '→')); });

    const steps = [
      { t: 'Start: three base groups, one for each table, each with one expression.', k: 3 },
      { t: 'Explore pairs: the optimizer adds the groups for A ⋈ B, B ⋈ C and A ⋈ C, each with its two orders.', k: 6 },
      { t: 'Explore the top group, A ⋈ B ⋈ C, with its splits. A transformation rule adds the commuted and reassociated forms.', k: 7 },
      { t: 'Implementation rules add the physical alternatives to every logical join. The cost model prices each one.', k: 7, phys: true },
      { t: 'Done: the best plan is read back from the memo by taking the cheapest alternative in each group.', k: 7, phys: true, final: true }
    ];
    const states = steps.map(s => Object.assign({}, s, memoCounts(s.k)));
    const draw = s => [
      h('p', { class: 'ch09-count' }, 'Groups: ', h('b', {}, String(s.groups)), '   Logical expressions: ', h('b', {}, String(s.exprs)), s.phys ? '   Physical alternatives (2 per join): ' : '', s.phys ? h('b', {}, String(s.phys)) : null)
    ];
    return h('div', {},
      para('The optimizer’s memo is shown for three relations, A, B and C. Click a part to read its role. The counts follow from the group rules and are illustrative.'),
      arch, defBox,
      stepper(states, draw),
      para('Memoization is why this scales better than enumerating plans one by one: a group is explored once and reused by every plan that contains it. The search strategies in the next section decide how much of the memo is explored before the optimizer stops.'));
  }

  /* ---------- COMMON PROBLEMS ---------- */
  const problems = [
    {
      tab: 'Stale statistics',
      sym: '<b>The optimizer joins the wrong way</b>: a table grew 10x since the last ANALYZE, so the plan starts from it as if it were small.',
      why: 'The optimizer ranks plans with its estimates. When the statistics say a table has 5,000 rows, it looks cheap to start from, and the plan carries a large intermediate result that the estimate missed.',
      log: 'representative EXPLAIN ANALYZE, numbers illustrative\nHash Join  (estimated rows=20000)  (actual rows=200000)\n  -> Seq Scan on products  (estimated rows=5000)  (actual rows=50000)',
      demo(mode) {
        const r = solve({ stale: mode === 'bad', corr: false, share: 0.02 });
        const states = [{ t: mode === 'bad' ? 'Start. The stats say products has 5,000 rows. The optimizer picks the plan below.' : 'Start. ANALYZE refreshed the stats: products has 50,000 rows. The optimizer sees the real size.', est: 0, act: 0, label: '' }];
        r.detail.forEach((d, i) => states.push({ t: 'Join ' + (i + 1) + ' of ' + r.detail.length + ': ' + d.label + '. Estimated ' + fmt(d.est) + ' rows, actual ' + fmt(d.act) + '.', est: d.est, act: d.act, label: d.label, n: i + 1 }));
        states.push({ t: 'Done: the plan’s actual cost is ' + fmt(r.chosenActual) + ' rows of work. The best plan costs ' + fmt(r.bestCost) + ' (' + r.ratio.toFixed(2) + ' times).', est: r.chosenEst, act: r.chosenActual, final: true });
        return stepper(states, s => [h('p', { class: 'ch09-count' }, 'Estimated: ', h('b', {}, fmt(s.est)), '   Actual: ', h('b', { class: mode === 'bad' && s.act > s.est ? 'bad' : '' }, fmt(s.act)))]);
      },
      fix: [
        'Run ANALYZE after large loads, or let autovacuum analyze the table once it changes by a set fraction.',
        'Check the plan: compare estimated and actual rows on each node. A large gap is the signal.',
        'Use an incremental statistics refresh for tables that grow every day, so the estimate follows the table.',
        'Verify: after ANALYZE the picked plan should match the best plan, and the estimate should be close to the actual rows.'
      ]
    },
    {
      tab: 'Correlated predicates',
      sym: '<b>The customer filter is estimated 10x too small</b>, because two predicates are treated as independent when they overlap.',
      why: 'The optimizer multiplies the selectivities of the two predicates (independence). When one predicate implies the other, the real selectivity is the smaller one, so the product is far too low, and the optimizer starts from a table it thinks is tiny.',
      log: 'representative plan note, numbers illustrative\nSeq Scan on customers  Filter: region = HN AND segment = gold\n  estimated rows=1000  actual rows=10000',
      demo(mode) {
        const bad = mode === 'bad';
        const r = solve({ stale: false, corr: true, share: 0.02, colStats: !bad });
        const act = 10000, est = bad ? 1000 : 10000;
        const states = [
          { t: 'Start. The table has 100,000 customers. Each of the two predicates is 10% selective.', est: 100000, act: 100000 },
          { t: bad ? 'The optimizer multiplies 10% by 10% and estimates 1% of the table.' : 'Column-group statistics record that the two predicates overlap, so the estimate is 10%.', est: est, act: act },
          { t: bad ? 'The real rows are 10,000. The estimate is 1,000, ten times too small.' : 'The estimate and the truth agree at 10,000 rows, so the join order is chosen from the right number.', est: est, act: act },
          { t: 'Done: the picked plan costs ' + fmt(r.chosenActual) + ' rows of work, against ' + fmt(r.bestCost) + ' for the best plan (' + r.ratio.toFixed(2) + ' times).', est: est, act: act, final: true }
        ];
        return stepper(states, s => [h('p', { class: 'ch09-count' }, 'Estimated rows: ', h('b', { class: bad && s.act !== s.est ? 'bad' : '' }, fmt(s.est)), '   Actual rows: ', h('b', {}, fmt(s.act)))]);
      },
      fix: [
        'Create column-group statistics (or extended statistics) on the correlated columns, so the optimizer sees their joint distribution.',
        'Where the correlation is known, rewrite the predicate in a form that states the dependency directly, such as a single predicate on the key.',
        'Compare the estimate with the actual rows in EXPLAIN ANALYZE, and add statistics where they differ.',
        'Verify: the estimate on the filtered table should match the actual rows within a small factor.'
      ]
    },
    {
      tab: 'Cached plan for other parameters',
      sym: '<b>A plan built for one parameter value runs slowly for another</b>: an index loop chosen for a rare value probes the index once per matching row of a common value.',
      why: 'A prepared statement can reuse one plan for every parameter value. The plan was chosen for a rare value, where an index loop is cheap. For a common value the same loop does one probe per row, while a full scan with a hash join reads the table once.',
      log: 'representative plan-cache note, wording varies by engine\nprepared statement reused: plan built for region = $1 (rare value)\nNested Loop  (loops=10000)  Index Scan on orders',
      demo(mode) {
        const PAGES_PER_PROBE = 4, SCAN_PAGES = 3000, HN_ROWS = 10000;
        const states = [{ t: 'Start. The statement runs with the common value HN, which matches 10,000 customers.', reads: 0 }];
        if (mode === 'bad') {
          for (let k = 1; k <= 4; k++) states.push({ t: 'The cached index loop probes the index once per row. Probe ' + k + ' of ' + fmt(HN_ROWS) + ' costs ' + PAGES_PER_PROBE + ' page reads.', reads: k * PAGES_PER_PROBE });
          states.push({ t: 'Done: ' + fmt(HN_ROWS) + ' probes read ' + fmt(HN_ROWS * PAGES_PER_PROBE) + ' pages, about 13 times the table scan.', reads: HN_ROWS * PAGES_PER_PROBE, final: true });
        } else {
          states.push({ t: 'The planner builds a custom plan for HN: a hash join with one scan of orders.', reads: 0 });
          states.push({ t: 'The scan reads the table once: ' + fmt(SCAN_PAGES) + ' pages.', reads: SCAN_PAGES });
          states.push({ t: 'Done: the custom plan reads ' + fmt(SCAN_PAGES) + ' pages for HN. For the rare value it still uses the index loop, at about 200 page reads.', reads: SCAN_PAGES, final: true });
        }
        return stepper(states, s => [h('p', { class: 'ch09-count' }, 'Page reads: ', h('b', { class: mode === 'bad' && s.reads > SCAN_PAGES ? 'bad' : '' }, fmt(s.reads)))]);
      },
      fix: [
        'Let the engine re-plan for each parameter value (custom plans), or use a generic plan only when its cost is close to the custom one.',
        'Check the plan cache setting for prepared statements in your engine, and test the plan for both a rare and a common value.',
        'Where the values are very skewed, split the query so that common and rare values take different paths.',
        'Verify: the page reads for the common value should match a scan-based plan, and the rare value should keep its index loop.'
      ]
    },
    {
      tab: 'Search budget exceeded',
      sym: '<b>A many-table query stalls in planning</b>: the optimizer enumerates far more join orders than it can finish in its time budget.',
      why: 'The number of subset pairs grows like 3 to the power n for bushy plans. Exhaustive search is practical for a few tables, and hopeless for many. The optimizer hits its time budget and either returns a poor plan or fails.',
      log: 'representative planner message, wording varies by engine\nplanning took 42.7 s; join search exceeded the planning budget\nfallback: no plan within the time limit',
      demo(mode) {
        const n = 16;
        const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return Math.round(r); };
        let subsets = 0, pairs = 0;
        const levels = [];
        for (let k = 2; k <= n; k++) {
          subsets += C(n, k);
          pairs += C(n, k) * (2 ** (k - 1) - 1);
          levels.push({ k, subsets, pairs });
        }
        const greedyPairs = C(n + 1, 3);
        const states = [{ t: 'Start. ' + n + ' tables. Exhaustive search considers every subset and every split of it.', count: 0 }];
        if (mode === 'bad') {
          levels.forEach(L => states.push({ t: 'Subsets of size ' + L.k + ' examined. Running total of subset pairs: ' + fmt(L.pairs) + '.', count: L.pairs }));
          states.push({ t: 'Done: ' + fmt(pairs) + ' subset pairs. The time budget ends the search long before this finishes.', count: pairs, final: true });
        } else {
          for (let m = 2; m <= n; m += 4) states.push({ t: 'Greedy step ' + (m - 1) + ': join the cheapest pair among the remaining tables, and keep only the best candidate.', count: C(m + 1, 3) });
          states.push({ t: 'Done: ' + fmt(greedyPairs) + ' candidate pairs in total. The planner stops within budget with a complete plan.', count: greedyPairs, final: true });
        }
        return stepper(states, s => [h('p', { class: 'ch09-count' }, 'Candidate pairs considered: ', h('b', { class: mode === 'bad' && s.count > 1000000 ? 'bad' : '' }, fmt(s.count)), '   Tables: ' + n)]);
      },
      fix: [
        'Set a budget: a maximum number of join candidates, or a time limit with a cheaper fallback.',
        'Above the threshold, switch from exhaustive DP to a greedy or randomized search, which keeps the plan complete.',
        'Split the query into blocks (for example, around a subquery), so each block has fewer tables.',
        'Verify: planning time should stay bounded as the table count grows, and the plan should still be complete.'
      ]
    }
  ];

  root.append(
    sec('1 · The problem',
      para('Two equivalent plans can differ by a large factor when one joins selective tables first and the other creates a massive intermediate result. In this chapter’s model the worst setting in the playground is about 28 times, and the gap grows with how wrong the estimates are. SQL says what to compute, not how, so the optimizer must pick among many legal plans.'),
      para('The optimizer does not run the plans to compare them. It estimates how many rows each step will produce, and it trusts those estimates. Wrong estimates lead to wrong plans.'),
      para('<b>How can two equivalent query plans differ in runtime by a factor of 1,000?</b>')),

    sec('2 · Core idea and mechanisms',
      para('Search equivalent plans and estimate which one will consume the least resources.'),
      h('ul', { class: 'ch09-list' },
        h('li', {}, h('b', {}, 'Overview. '), 'The DBMS turns SQL into a logical plan that matches relational algebra. The optimizer maps it to the cheapest equivalent physical plan. Logical and physical operators do not map one to one: a logical join and a logical sort can become a sort-merge join. System R, in the 1970s, was the first optimizer; the notes say no major DBMS yet ships a machine-learning optimizer.'),
        h('li', {}, h('b', {}, 'Two strategies. '), 'Heuristics: static rules that match patterns and never read the data (the catalog is enough). Cost-based search: enumerate equivalent plans, estimate each one, and pick the lowest cost.'),
        h('li', {}, h('b', {}, 'Logical rewrites. '), 'Predicate pushdown (filter as early as possible), reordering predicates so the most selective runs first, splitting conjunctions, and projection pushdown (drop unused columns before joins).'),
        h('li', {}, h('b', {}, 'Cost components. '), 'CPU (small, hard to estimate), disk I/O (block transfers), memory (DRAM used), and network (messages sent). The model compares plans; the number means nothing on its own, and it often underestimates cost by a large margin.'),
        h('li', {}, h('b', {}, 'Why search must be bounded. '), 'Join orders grow exponentially with the number of tables, so the optimizer must limit the search space (this is the search-budget problem below).'),
        h('li', {}, h('b', {}, 'Statistics. '), 'The catalog keeps the number of tuples in each relation (N_R) and the number of distinct values of each attribute (V(A,R)). Under a uniform-data assumption, the selection cardinality of an equality predicate is N_R / V(A,R).'),
        h('li', {}, h('b', {}, 'Selectivity and cardinality. '), 'Selectivity is the fraction of tuples that qualify. Cardinality is the number of tuples an operator produces, its selectivity times its input size. Selectivity of a negation is 1 minus the positive selectivity. For a conjunction the product is used, which assumes independence.'),
        h('li', {}, h('b', {}, 'Assumptions. '), 'Uniform data (except heavy hitters), independent predicates, and the inclusion principle (join keys of the inner relation exist in the outer relation). Real data breaks all three. Correlated attributes break independence.'),
        h('li', {}, h('b', {}, 'Histograms. '), 'Equi-width buckets have the same range; equi-depth buckets have about the same count. Sketches store approximate statistics with bounded error.'),
        h('li', {}, h('b', {}, 'Sampling. '), 'Apply predicates to a sample with a similar distribution. Refresh the sample when changes exceed a threshold (for example, 10% of tuples).'),
        h('li', {}, h('b', {}, 'Single-relation plans. '), 'The hard choice is the access method: sequential scan, index scan, or binary search. Most new systems use heuristics. OLTP queries are sargable, so a best index usually exists.'),
        h('li', {}, h('b', {}, 'Search direction. '), 'Generative (bottom-up): start from nothing and build the plan (System R, DB2, MySQL, Postgres). Transformation (top-down): start from the goal and work down (SQL Server, Greenplum, CockroachDB, Volcano).'),
        h('li', {}, h('b', {}, 'System R. '), 'Static rules first, then dynamic programming over join orders, built bottom-up: the best plan for one relation, then for two, and so on. The notes say only left-deep trees are considered, so the right input of every join is a base table. Subplans also carry physical properties such as sorted order, so later operators can use them. [15-721 #13 §3.1]'),
        h('li', {}, h('b', {}, 'Volcano. '), 'Top-down branch-and-bound from the logical plan. Physical properties are first-class entities, enforced by rules that constrain child operators. The best cost per subplan is memoized, and a branch is cut if it exceeds the memoized cost.'),
        h('li', {}, h('b', {}, 'Nested subqueries. '), 'A subquery in WHERE acts like a function of its outer row. Rewrite it to decorrelate or flatten it into a join, or decompose it into its own query whose result feeds the outer one. In the course notes, German-style unnesting converts a dependent join into a plain join and reaches hash-join cost rather than nested-loop cost in the best case.'),
        h('li', {}, h('b', {}, 'Expression rewriting. '), 'Match a pattern in a WHERE or ON predicate and rewrite it: evaluate impossible predicates at planning time, and merge redundant ranges (for example, two bounds into one BETWEEN).'),
        h('li', {}, h('b', {}, 'Enumeration architectures. '), 'Heuristics only (Ingres, early Oracle, MongoDB); heuristics plus cost-based search (System R, Postgres); stratified search; and unified search (Volcano, Cascades, SQL Server). Stratified search runs several stages, each with a subset of the transformation rules, usually logical-to-logical rewrites first and logical-to-physical search second (Starburst, CockroachDB). Unified search runs both kinds of transformation in one search phase, with heavy memoization (Volcano, Cascades). Ingres handled joins by decomposing them into single-table queries and substituting values. [15-721 #13 §1.4–6; #14 §1]'),
        h('li', {}, h('b', {}, 'Starburst. '), 'An implementation of System R as an optimizer generator: a heuristic phase, then a cost-based search performed bottom-up, the same way as System R. [15-721 #13 §5.1]'),
        h('li', {}, h('b', {}, 'Optimizer generators. '), 'Separate the search algorithm from the transformation rules, and write the rules in a declarative language. This makes it easier to add rules as a DBMS gains features.'),
        h('li', {}, h('b', {}, 'Cascades. '), 'Top-down search with a memo of groups. A group holds logically equivalent expressions and is stored once. Multi-expressions represent alternatives without materializing them. Transformation rules rewrite logical expressions, implementation rules produce physical ones, and rules are prioritized. The principle of optimality lets the search keep only the best subplan per group. Case study below.'),
        h('li', {}, h('b', {}, 'Randomized search. '), 'Simulated annealing accepts a worse change with some probability. Postgres’ genetic optimizer (GEQO) evolves join orders for complex queries. It can escape local minima; the notes say it is hard to explain why a plan was chosen, and that the optimizer must do extra work to make plans deterministic. [15-721 #14 §3]'),
        h('li', {}, h('b', {}, 'Dynamic programming over a hypergraph. '), 'Iterate over connected subgraphs of the query and add edges incrementally, using rules to limit which nodes a traversal may expand.'),
        h('li', {}, h('b', {}, 'Real optimizers. '), 'SQL Server (a Cascades framework since 1995) runs four stages: simplification and normalization, pre-exploration, exploration within a time budget, and post-optimization. It pre-fills the memo with heuristic join orders. Apache Calcite is a standalone framework that does not separate logical and physical operators. Greenplum Orca is a standalone Cascades implementation that can dump its state for debugging and can check its cost estimates by running two plans. CockroachDB is a Cascades implementation whose rules are written in a custom DSL. [15-721 #14 §4]'),
        h('li', {}, h('b', {}, 'Stopping the search. '), 'Stop at a wall-clock time, at a cost threshold, when the subplan is exhausted, or after a count of transformations. Timeouts based on the transformation count give the same plan under any system load.'),
        h('li', {}, h('b', {}, 'Decorrelation rules. '), 'Heuristic rewriting moves a subquery up a level so it runs once as a join. It is hard to write rules for every correlation pattern, and a small change to a query can make a rule stop applying. Decorrelation can also be a cost-based decision. The notes’ conclusion: only HyPer, Umbra, and DuckDB unnest correlated subqueries correctly in all cases, and every strategy above assumes the optimizer chooses the plan once.'),
        h('li', {}, h('b', {}, 'Adaptive optimization. '), 'Plans go stale when indexes change, data changes, parameters change, or ANALYZE runs. Static optimization fixes the plan before execution; dynamic optimization picks plans on the fly; adaptive optimization compiles a plan and re-optimizes if estimates are wrong beyond a threshold. Approaches: (1) modify future invocations by feeding observed selectivities back to the optimizer. Reversion-based plan correction keeps the history of each query (estimates, plan, measured metrics); if a new plan regresses after, say, new indexes were added, the DBMS switches back to the earlier plan. IBM DB2’s LEO (learning optimizer) updates table statistics as a normal scan runs; the notes call it one of the earliest commercial adaptive systems. (2) Replan the current invocation: start over, or keep intermediate results that were already expensive to compute. (3) Plan pivot points: a CHOOSE node picks nested loop or hash join at run time, without going back to the optimizer. Plan stitching combines equivalent sub-plans from several plans: equivalence is the same logical expression and physical properties, the search space is a graph with OR nodes, and a bottom-up search picks the cheapest branch at each OR node. Redshift caches the generated code for stitched sub-plans. [15-721 #15]'),
        h('li', {}, h('b', {}, 'Quickstep lookahead information passing. '), 'Do some work at the start of the query, then pass the information forward. Compute Bloom filters on the dimension tables, probe them with fact-table tuples to estimate selectivity, and use that estimate to change the join order. The notes say this approach is limited to left-deep trees and star schemas. [15-721 #15 §5.1]'),
        h('li', {}, h('b', {}, 'Proactive reoptimization. '), 'Attach bounding boxes to the estimates. If the real data falls outside the box, the optimizer runs again.'),
        h('li', {}, h('b', {}, 'Cost model components. '), 'Physical costs (CPU cycles, I/O, cache misses, memory, prefetching; hardware-dependent), logical costs (result sizes, independent of the algorithm), and algorithmic costs (complexity of the operator). Per operator, the tuple count depends on the access methods, the value distributions, and the predicates.'),
        h('li', {}, h('b', {}, 'Selectivity sources. '), 'Domain constraints, precomputed statistics (zone maps), histograms or sketches, sampling (a read-only copy refreshed periodically, or sampling real tables under READ UNCOMMITTED, which can see several versions of a tuple), and ML models that are still in the early phase.'),
        h('li', {}, h('b', {}, 'Correlated attributes. '), 'Brand and model: with independence, the selectivity of brand = Tesla AND model = Model X is the product of the two. In reality only Tesla makes Model X, so the true value is the smaller one. Column-group statistics track groups of attributes together. MSSQL builds some automatically; other systems need the groups named.'),
        h('li', {}, h('b', {}, 'Estimator quality. '), 'The German study on the JOB workload (IMDB) found serious underestimation for all systems as joins grew. The lessons in the notes: cost-based join ordering matters more than a fast engine; estimates are routinely wrong, so prefer operators that do not depend on them; hash joins with sequential scans are a robust default; and better cardinality estimates help more than a more accurate cost model.'),
        h('li', {}, h('b', {}, 'Cost model implementations. '), 'Postgres weights CPU and I/O by magic constants: a tuple in memory is taken as 400 times faster than a tuple from disk, and sequential I/O 4 times faster than random I/O, by default. IBM DB2 stores hardware and memory characteristics in its catalog. Smallbase profiles primitive operations at start-up with microbenchmarks. DuckDB, with no statistics, estimates the worst-case join cardinality from distinct counts, and uses a 20% magic selectivity when HyperLogLog is not available.')
      ),
      para('The playground ranks plans with the same kind of estimates and compares the choice with the best plan under the true numbers. The case study shows the memo used by a Cascades-style optimizer. The four problems show what breaks in production.')),

    sec('3 · Playground',
      para('Pick the statistics situation, then compare the plan the optimizer chooses with the best one. The three controls are independent: a stale table, correlated customer predicates, and a drifted product category.'),
      playground()),

    sec('4 · Case study: the Cascades memo',
      para('A Cascades-style optimizer keeps its search in a memo of groups. The three-table memo below is illustrative. The vocabulary follows the Cascades description in the course notes. The internals of SQL Server, Orca, or CockroachDB are not shown.'),
      memoCase()),

    sec('5 · Common problems',
      para('Four ways the optimizer picks a bad plan or runs out of time. Each card shows the failure first; switch to After fix to see the same query planned correctly.'),
      SX.problems(problems))
  );
};
