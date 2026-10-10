/* Chapter 18 "Query Optimization and Plan Search" (index 17, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L15 Query Planning and Optimization (logical rewrites, cost-based search, System R, Volcano, nested subqueries, expression rewriting); CMU 15-721 L13 Optimizer Implementation I (search architectures), L14 II (Cascades, randomized search, unnesting), L15 III (adaptive optimization).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a bottom-up lattice of table subsets, join order bubbles, unnesting a correlated subquery, and a Cascades memo. Costs and counts illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. System R style search: the best plan for each subset of tables, built bottom-up ---- */
  const NODE = {
    C: { x: 30, y: 94, l: 'C', sub: 'cost 10' }, O: { x: 180, y: 94, l: 'O', sub: 'cost 100' }, I: { x: 330, y: 94, l: 'I', sub: 'cost 400' }, P: { x: 480, y: 94, l: 'P', sub: 'cost 5' },
    CO: { x: 105, y: 156, l: 'C ⋈ O', sub: 'cost 210' }, OI: { x: 255, y: 156, l: 'O ⋈ I', sub: 'cost 900' }, IP: { x: 405, y: 156, l: 'I ⋈ P', sub: 'cost 810' },
    COI: { x: 180, y: 218, l: 'C⋈O⋈I', sub: 'cost 1010' }, OIP: { x: 330, y: 218, l: 'O⋈I⋈P', sub: 'cost 1305' },
    ALL: { x: 255, y: 280, l: 'all four', sub: 'cost 1415' },
  };
  const LV = { 1: ['C', 'O', 'I', 'P'], 2: ['CO', 'OI', 'IP'], 3: ['COI', 'OIP'], 4: ['ALL'] };
  const KIDS = { CO: ['C', 'O'], OI: ['O', 'I'], IP: ['I', 'P'], COI: ['CO'], OIP: ['OI'], ALL: ['COI'] };
  const lattice = {
    id: 'join-lattice', label: 'Join-order search', desc: 'Four tables C, O, I and P joined along foreign keys. The optimizer keeps only the cheapest plan for each subset of tables and builds up from single tables (costs illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'FROM customers C JOIN orders O ON ... JOIN items I ON ... JOIN products P ON ...',
      'level 1: the best way to read each table alone',
      'level 2: only subsets joined by a predicate get a node (no cross products)',
      'a subset with two ways to build it keeps the cheaper one',
      'level 4: the cheapest plan for all four tables is the answer',
    ] },
    stage: DB.stage({
      footer: 'Simplified: left-deep and bushy plans, cost = rows read and produced. Illustrative.',
      header: s => ({ left: 'subsets costed ' + (s.n || 0), right: s.right || 'bottom-up' }),
      draw(P, s) {
        const lvl = s.lvl || 1;
        for (let l = 1; l <= lvl; l++) LV[l].forEach(id => {
          const n = NODE[id], on = (s.pick || []).includes(id);
          P.chip('n' + id, { x: n.x, y: n.y, w: 120, h: 44, label: n.l, sub: (s.sub && s.sub[id]) || n.sub, tone: on ? 'ok' : (s.hot && s.hot.includes(id) ? 'cursor' : 'info'), hl: on });
        });
        Object.keys(KIDS).forEach(id => {
          const n = NODE[id]; const lvOf = id.length === 2 ? 2 : id === 'ALL' ? 4 : 3;
          if (lvOf > lvl) return;
          const children = id === 'CO' || id === 'OI' || id === 'IP' ? KIDS[id] : KIDS[id].concat(id === 'COI' ? ['I'] : id === 'OIP' ? ['P'] : ['P']);
          children.forEach(k => {
            const c = NODE[k]; if (!c) return;
            const on = (s.pick || []).includes(id) && (s.pick || []).includes(k);
            P.line('e' + id + k, c.x + 60, c.y + 44, n.x + 60, n.y, { tone: on ? 'ok' : 'mut', sw: on ? 2.6 : 1 });
          });
        });
        if (s.note) P.chip('nt', { x: 400, y: 280, w: 214, h: 44, label: s.note, sub: s.noteSub || '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Level 1: the cheapest way to read each table by itself. C, O, I and P each get a cost, here the rows to scan (illustrative).', callout: 'Level 1: the best plan for each single table', code: 1,
        state: { lvl: 1, n: 4 }, stats: [{ l: 'subsets costed', v: '4' }] },
      { log: 'Level 2: pairs. Only tables linked by a join predicate become nodes, so C with I never appears. That avoids cross products.', callout: 'Level 2: only joinable pairs', code: 2,
        state: { lvl: 2, n: 7 }, stats: [{ l: 'subsets costed', v: '7' }, { l: 'cross products', v: '0', cls: 'ok' }] },
      { log: 'Level 3: C, O and I can be built as (C⋈O)⋈I at cost 1010 or as C⋈(O⋈I) at cost 1310. Only the cheaper one is kept.', callout: 'Two ways to build C⋈O⋈I: keep the cheaper', moment: true, code: 3,
        state: { lvl: 3, n: 9, hot: ['COI'], sub: { COI: 'keep 1010' }, note: 'drop 1310 (C ⋈ (O ⋈ I))', noteTone: 'bad' }, stats: [{ l: 'candidates', v: '2' }, { l: 'kept', v: '1010', cls: 'ok' }] },
      { log: 'The same for O, I and P: (O⋈I)⋈P costs 1305 and O⋈(I⋈P) costs 1310, so the first is kept. Pruning keeps the table small.', callout: 'Again keep the cheaper: 1305 beats 1310', code: 3,
        state: { lvl: 3, n: 9, hot: ['OIP'], sub: { OIP: 'keep 1305' }, note: 'drop 1310 (O ⋈ (I ⋈ P))', noteTone: 'bad' }, stats: [{ l: 'kept', v: '1305', cls: 'ok' }] },
      { log: 'Level 4: all four tables. Joining P to C⋈O⋈I costs 1415, joining the pair C⋈O to I⋈P costs 1420, and C with O⋈I⋈P costs 1715.', callout: 'Level 4: three candidates for the whole query', code: 4,
        state: { lvl: 4, n: 10, hot: ['ALL'], sub: { ALL: 'keep 1415' }, note: 'others: 1420 and 1715', noteTone: 'warn' }, stats: [{ l: 'candidates', v: '3' }, { l: 'kept', v: '1415', cls: 'ok' }] },
      { log: 'Walking back down the kept entries gives the plan: join C and O, then I, then P. The plan was found without ever running a query.', callout: 'Plan: ((C ⋈ O) ⋈ I) ⋈ P', code: 4,
        state: { lvl: 4, n: 10, pick: ['ALL', 'COI', 'CO', 'C', 'O', 'I', 'P'], sub: { ALL: 'cost 1415' }, note: 'chosen without running anything', noteTone: 'ok' }, stats: [{ l: 'plans compared', v: '10 nodes', cls: 'ok' }, { l: 'queries run', v: '0', cls: 'ok' }] },
      { log: 'The number of subsets doubles with every table. 4 tables need 10 nodes, but 20 tables need millions, so Postgres switches to a genetic search (GEQO) for big joins.', callout: 'Subsets double per table: search must be bounded', code: 4,
        state: { lvl: 4, n: 10, pick: ['ALL', 'COI', 'CO', 'C', 'O', 'I', 'P'], note: '20 tables: millions of subsets', noteTone: 'warn', right: 'bounded search' }, stats: [{ l: '4 tables', v: '10 nodes', cls: 'ok' }, { l: '20 tables', v: 'millions', cls: 'bad' }],
        takeaway: 'Dynamic programming keeps one best plan per subset. The cost of the search itself is why big joins get a bounded search.' },
    ],
  };

  /* ---- 4. Join order: the same three tables, and the size of the intermediate result decides the cost ---- */
  const radius = rows => 10 * Math.sqrt(rows / 1e6);
  const BC = { x: 330, y: 206 };
  const JOIN_ORD = {
    id: 'join-order', label: 'Join order bubbles', desc: 'Three tables of 1 million rows. The bubble is the intermediate result, drawn with area proportional to its rows. One order builds 100 million rows, the other 1 million (counts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT ... FROM a JOIN b ON a.k = b.k JOIN c ON b.j = c.j;',
      'order 1: (a JOIN b) first. Each a row matches 100 b rows: 100,000,000 rows',
      'then join c: only 1,000,000 survive, but 100,000,000 rows were stored',
      'order 2: (b JOIN c) first: 1,000,000 rows, then join a: 1,000,000 rows',
      'a multiway join works one variable at a time and never builds the big bubble',
    ] },
    stage: DB.stage({
      footer: 'Simplified: bubble radius ~ square root of rows. Illustrative.',
      header: s => ({ left: 'intermediate rows ' + (s.rowsTxt || '-'), right: s.order || 'three inputs' }),
      draw(P, s) {
        ['A', 'B', 'C'].forEach((t, i) => P.chip('in' + t, { x: 30, y: 100 + i * 64, w: 100, h: 44, label: t, sub: '1M rows', tone: s.used && s.used.includes(t) ? 'mut' : 'info' }));
        if (s.rows) {
          const r = radius(s.rows);
          P.box('bub', { x: BC.x - r, y: BC.y - r, w: 2 * r, h: 2 * r, rx: 200, tone: s.rows > 5e7 ? 'bad' : 'ok', label: s.bubLabel || '', cls: 'sm', sw: 2 });
        }
        if (s.res) P.chip('res', { x: 480, y: 180, w: 130, h: 52, label: 'result', sub: '1M rows', tone: 'ok' });
        if (s.mem) P.chip('mem', { x: 400, y: 306, w: 210, h: 34, label: s.mem, tone: s.memTone, small: true });
        if (s.stage) P.text('stg', { x: 200, y: 92, t: s.stage, cls: 'mut sm' });
      }
    }),
    bug: [
      { log: 'Three tables A, B and C, each with one million rows. They must be joined two at a time, and the order is the planner\'s choice.', callout: 'Three inputs of 1 million rows', code: 0,
        state: {}, stats: [{ l: 'tables', v: '3' }, { l: 'rows each', v: '1M' }] },
      { log: 'Order 1 joins A and B first. Each A row matches 100 B rows, so the intermediate result is 100 million rows.', callout: 'Order 1: A join B first', code: 1,
        state: { order: '(A join B) join C', stage: 'A join B', used: ['A', 'B'], rows: 1e8, rowsTxt: '100,000,000', bubLabel: '100M rows' }, stats: [{ l: 'intermediate', v: '100M rows', cls: 'bad' }] },
      { log: 'Joining C filters those down to 1 million, but all 100 million rows had to be produced and stored first. That is about 6 GB of temporary space (illustrative).', callout: '100M stored to produce 1M', moment: true, code: 2,
        state: { order: '(A join B) join C', stage: 'then join C', used: ['A', 'B', 'C'], rows: 1e8, rowsTxt: '100,000,000', bubLabel: '100M rows', res: 1, mem: 'temp space ~6 GB', memTone: 'bad' }, stats: [{ l: 'stored', v: '100M rows', cls: 'bad' }, { l: 'output', v: '1M rows', cls: 'ok' }] },
      { log: 'Order 2 joins B and C first. Each B row matches only one C row, so the intermediate result is 1 million rows.', callout: 'Order 2: B join C first', code: 3,
        state: { order: '(B join C) join A', stage: 'B join C', used: ['B', 'C'], rows: 1e6, rowsTxt: '1,000,000', bubLabel: '1M' }, stats: [{ l: 'intermediate', v: '1M rows', cls: 'ok' }] },
      { log: 'Then join A. The result is the same 1 million rows, but the biggest thing ever stored is 1 million rows, 100 times smaller.', callout: 'Same result, 100 times less stored', code: 3,
        state: { order: '(B join C) join A', stage: 'then join A', used: ['A', 'B', 'C'], rows: 1e6, rowsTxt: '1,000,000', bubLabel: '1M', res: 1, mem: 'temp space ~60 MB', memTone: 'ok' }, stats: [{ l: 'stored', v: '1M rows', cls: 'ok' }, { l: 'output', v: '1M rows', cls: 'ok' }] },
      { log: 'A multiway join, such as leapfrog trie join, handles one variable at a time across all three tables. It never builds the 100 million row bubble in either order.', callout: 'Multiway join: no big bubble in any order', code: 4,
        state: { order: 'multiway join', stage: 'one variable at a time', used: ['A', 'B', 'C'], res: 1, mem: 'bounded by the output', memTone: 'ok' }, stats: [{ l: 'worst intermediate', v: 'none', cls: 'ok' }, { l: 'needs', v: 'fixed variable order', cls: 'warn' }],
        takeaway: 'A binary join plan can store a huge intermediate result. The join order, not the inputs or the output, sets the cost.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A nightly bulk load grows the <code>products</code> table tenfold. The next morning the sales report, a four-table join of customers, orders, items and products, takes about three times longer than yesterday (illustrative). The SQL text did not change. <code>EXPLAIN ANALYZE</code> shows estimated rows=5000 and actual rows=50000 on the products scan.",
    "predict": {
      "q": "The query text is identical and the data grew only in one table. Why did the whole query slow down by much more than that table's share of the work?",
      "opts": [
        "More data makes every plan slower by the same factor",
        "The optimizer ranked plans with old row counts and chose a join order that builds a large intermediate result",
        "The hash join algorithm cannot handle tables above 5,000 rows",
        "The buffer pool is cold after the load, so every page comes from disk"
      ],
      "ans": 1,
      "why": "The optimizer does not run plans to compare them. It trusts its estimates, so a table it thinks is small looks like a cheap place to start, and the real plan carries far more rows than estimated."
    },
    "diagnose": [
      {
        "t": "Stale statistics",
        "sym": "The optimizer joins the wrong way: a table grew 10x since the last ANALYZE, so the plan starts from it as if it were small.",
        "ctx": "A query that did not change slows down after a large load into one of its tables.",
        "why": "The optimizer ranks plans with its estimates. When the statistics say a table has 5,000 rows, it looks cheap to start from, and the plan carries a large intermediate result that the estimate missed.",
        "log": "representative EXPLAIN ANALYZE, numbers illustrative\nHash Join  (estimated rows=20000)  (actual rows=200000)\n  -> Seq Scan on products  (estimated rows=5000)  (actual rows=50000)",
        "note": "A tenfold gap between estimated and actual rows on a base table points at its statistics.",
        "fix": [
          "Measure: compare estimated and actual rows on each node of the plan. A large gap is the signal.",
          "Run ANALYZE after large loads, or let autovacuum analyze the table once it changes by a set fraction.",
          "Use an incremental statistics refresh for tables that grow every day, so the estimate follows the table.",
          "Verify: after ANALYZE the picked plan should match the best plan, and the estimate should be close to the actual rows."
        ]
      },
      {
        "t": "Correlated predicates",
        "sym": "The customer filter is estimated 10x too small, because two predicates are treated as independent when they overlap.",
        "ctx": "A filter on two related columns returns far more rows than the plan expected, and the join order built on it is slow.",
        "why": "The optimizer multiplies the selectivities of the two predicates (independence). When one predicate implies the other, the real selectivity is the smaller one, so the product is far too low, and the optimizer starts from a table it thinks is tiny.",
        "log": "representative plan note, numbers illustrative\nSeq Scan on customers  Filter: region = HN AND segment = gold\n  estimated rows=1000  actual rows=10000",
        "note": "Each predicate alone is estimated well. Only the AND of the two is wrong.",
        "fix": [
          "Measure: compare the estimate with the actual rows in EXPLAIN ANALYZE for the combined filter.",
          "Create column-group statistics (or extended statistics) on the correlated columns, so the optimizer sees their joint distribution.",
          "Where the correlation is known, rewrite the predicate in a form that states the dependency directly, such as a single predicate on the key.",
          "Verify: the estimate on the filtered table should match the actual rows within a small factor."
        ]
      },
      {
        "t": "Cached plan for other parameters",
        "sym": "A plan built for one parameter value runs slowly for another: an index loop chosen for a rare value probes the index once per matching row of a common value.",
        "ctx": "A prepared statement is fast for most calls and very slow for a few popular values.",
        "why": "A prepared statement can reuse one plan for every parameter value. The plan was chosen for a rare value, where an index loop is cheap. For a common value the same loop does one probe per row, while a full scan with a hash join reads the table once.",
        "log": "representative plan-cache note, wording varies by engine\nprepared statement reused: plan built for region = $1 (rare value)\nNested Loop  (loops=10000)  Index Scan on orders",
        "note": "loops=10000 on the inner index scan shows one probe per matching row.",
        "fix": [
          "Measure: check the plan cache setting for prepared statements in your engine, and test the plan for both a rare and a common value.",
          "Let the engine re-plan for each parameter value (custom plans), or use a generic plan only when its cost is close to the custom one.",
          "Where the values are very skewed, split the query so that common and rare values take different paths.",
          "Verify: the page reads for the common value should match a scan-based plan, and the rare value should keep its index loop."
        ]
      },
      {
        "t": "Search budget exceeded",
        "sym": "A many-table query stalls in planning: the optimizer enumerates far more join orders than it can finish in its time budget.",
        "ctx": "A generated query with many joins spends seconds in planning before the first row is read.",
        "why": "The number of subset pairs grows like 3 to the power n for bushy plans. Exhaustive search is practical for a few tables, and hopeless for many. The optimizer hits its time budget and either returns a poor plan or fails.",
        "log": "representative planner message, wording varies by engine\nplanning took 42.7 s; join search exceeded the planning budget\nfallback: no plan within the time limit",
        "fix": [
          "Measure: compare planning time with execution time as the number of tables in the query grows.",
          "Set a budget: a maximum number of join candidates, or a time limit with a cheaper fallback.",
          "Above the threshold, switch from exhaustive DP to a greedy or randomized search, which keeps the plan complete. Split the query into blocks (for example, around a subquery), so each block has fewer tables.",
          "Verify: planning time should stay bounded as the table count grows, and the plan should still be complete."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L15 Query Planning and Optimization; CMU 15-721 L13-L15 Optimizer Implementation I-III (notes in output/pdf)', href: '../../output/pdf/cmu-15445-fall2024/notes/15-optimization.pdf' };

  /* ---- 3. Subquery unnesting: a correlated subquery runs once per outer row, a rewrite runs once ---- */
  const OUT = [['o1', 'A', 10], ['o2', 'A', 30], ['o3', 'B', 5], ['o4', 'B', 15], ['o5', 'B', 40], ['o6', 'C', 8]];
  const AVG = { A: 20, B: 20, C: 8 };
  const oy = i => 96 + i * 38;
  const unnest = {
    id: 'unnest', label: 'Unnesting a subquery', desc: 'Orders above the average of their own customer. As written the subquery depends on the outer row, so it runs once per row. Rewritten as a join with a grouped table it runs once (6 sample orders, values illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT * FROM orders o WHERE total >',
      '  (SELECT AVG(total) FROM orders i WHERE i.customer = o.customer);   -- correlated',
      '-- plan: SubPlan runs once per outer row: 6 runs here, 5,000,000 on the real table',
      'rewrite: WITH a AS (SELECT customer, AVG(total) avg FROM orders GROUP BY customer)',
      'SELECT o.* FROM orders o JOIN a USING (customer) WHERE o.total > a.avg;',
      '-- the aggregate runs once, then a join: set-based, parallel, plannable',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 6 outer rows, 3 customers. Illustrative.',
      header: s => ({ left: s.hl || 'as written: correlated subquery', right: 'subquery runs: ' + (s.runs || 0) }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 82, t: 'outer rows (orders)', cls: 'mut sm' });
        OUT.forEach(([n, c, t], i) => P.chip('o' + n, { x: 30, y: oy(i), w: 150, h: 32, label: n + ' · ' + c + ' · ' + t, sub: '', tone: s.hit && AVG[c] < t ? 'ok' : s.cur === i ? 'cursor' : 'info', small: true }));
        if (!s.fix) { P.text('h2', { x: 230, y: 82, t: 'subquery executions', cls: 'mut sm' });
          for (let k = 0; k < (s.runs || 0); k++) P.chip('r' + k, { x: 230, y: oy(k), w: 190, h: 32, label: 'run ' + (k + 1) + ': AVG for ' + OUT[k][1], sub: '', tone: k === s.runs - 1 ? 'cursor' : 'warn', small: true }); }
        if (s.fix) { P.text('h3', { x: 230, y: 82, t: 'grouped once', cls: 'mut sm' });
          ['A', 'B', 'C'].forEach((c, i) => P.chip('g' + c, { x: 230, y: 110 + i * 70, w: 150, h: 46, label: c + ' avg ' + AVG[c], sub: 'one pass over orders', tone: 'ok' }));
          if (s.join) OUT.forEach(([n, c], i) => P.line('j' + n, 180, oy(i) + 16, 230, 110 + ['A', 'B', 'C'].indexOf(c) * 70 + 23, { tone: 'mut', arrow: true })); }
        if (s.res) P.chip('res', { x: 440, y: 150, w: 170, h: 60, label: 'result: o2, o5', sub: 'total above own average', tone: 'ok' });
        if (s.note) P.chip('nt', { x: 230, y: 330, w: 380, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The query keeps orders whose total is above the average of the same customer. The inner query mentions the outer row, so it is correlated.', callout: 'The subquery depends on the outer row', code: 1, state: {}, stats: [{ l: 'outer rows', v: '6' }] },
      { log: 'For o1 the engine runs the subquery: scan orders for customer A and average them. Then it moves to o2 and runs it again for customer A.', callout: 'Row by row: a run per outer row', code: 2, state: { runs: 2, cur: 1 }, stats: [{ l: 'runs', v: '2', cls: 'warn' }] },
      { log: 'Six outer rows mean six runs, and A and B repeat the same average several times. On 5 million orders the subquery would run 5 million times, each scanning that customer’s rows.', callout: 'The same average, computed again and again', moment: true, code: 2, state: { runs: 6, cur: 5, note: '6 runs here, 5,000,000 runs on the real table', noteTone: 'bad' }, stats: [{ l: 'runs', v: '6 (5M)', cls: 'bad' }] },
      { log: 'The optimizer unnests it. The correlation says the average only depends on customer, so it can be computed once per customer with GROUP BY: three groups, one pass over the table.', callout: 'Rewrite: aggregate once, per customer', code: 3, state: { fix: 1, hl: 'after unnesting', runs: 0 }, stats: [{ l: 'passes over orders', v: '1', cls: 'ok' }] },
      { log: 'Then a plain join matches each order to the average of its customer. The planner can now choose a join algorithm and run it in parallel.', callout: 'Then an ordinary join', code: 4, state: { fix: 1, join: 1, hl: 'after unnesting' }, stats: [{ l: 'join', v: 'set-based', cls: 'ok' }] },
      { log: 'o2 (30 against an average of 20) and o5 (40 against 20) are the answer, found without running anything per row.', callout: 'Same answer: o2 and o5', code: 5, state: { fix: 1, join: 1, hit: 1, res: 1, hl: 'after unnesting' }, stats: [{ l: 'result rows', v: '2', cls: 'ok' }],
        takeaway: 'Unnesting turns a per-row subquery into a set operation. Engines do it automatically for common shapes, and a hand rewrite helps for the rest.' },
    ],
  };

  /* ---- 4. Memo: groups of equivalent expressions, rules add alternatives, costs prune ---- */
  const memo = {
    id: 'memo-search', label: 'Memo and rules', desc: 'A top-down optimizer keeps a memo: a group is the set of equivalent expressions for one set of tables. Rules add alternatives to a group, implementation rules choose algorithms, and a cost bound prunes alternatives that cannot win (costs illustrative).',
    codeLabel: 'Memo',
    code: { bug: [
      'query: A join B join C, predicates A-B and B-C',
      'group {A,B,C} starts with one logical expression: (A join B) join C',
      'transformation rules add alternatives: A join (B join C); (A join C) is a cross product, skipped',
      'implementation rules: each join becomes hash join or nested loop, with a cost',
      'cost bound: once a plan costs 95, any alternative already above 95 is cut off',
      'the cheapest physical plan of the top group is the answer',
    ] },
    stage: DB.stage({
      footer: 'Simplified: three tables, two join predicates. Costs illustrative.',
      header: s => ({ left: s.hl || 'memo with 3 tables', right: s.bound ? 'best cost so far: ' + s.bound : '' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 82, t: 'sub-groups', cls: 'mut sm' }); P.text('h2', { x: 230, y: 82, t: 'group {A, B, C}', cls: 'mut sm' });
        [['AB', 'best 40'], ['BC', 'best 30'], ['A', 'scan 10'], ['C', 'scan 12']].forEach(([g, c], i) => { if (i > (s.groups == null ? 3 : s.groups)) return; P.chip('g' + g, { x: 30, y: 96 + i * 64, w: 150, h: 48, label: '{' + g.split('').join(',') + '}', sub: c, tone: 'info' }); });
        P.box('big', { x: 220, y: 92, w: 390, h: 230, tone: 'mut', label: '', dash: true });
        (s.alts || []).forEach((a, i) => P.chip('a' + i, { x: 232, y: 104 + i * 54, w: 366, h: 46, label: a[0], sub: a[1], tone: a[2] }));
      }
    }),
    bug: [
      { log: 'The query joins A, B and C, with predicates between A and B and between B and C. The optimizer builds a group for every set of tables it may need.', callout: 'A group per set of tables', code: 0, state: { groups: 3 }, stats: [{ l: 'groups', v: '6' }] },
      { log: 'The top group {A,B,C} starts with the one expression that came from the parser: join {A,B} with C.', callout: 'The group starts with one expression', code: 1, state: { alts: [['{A,B} join C', 'from the parser, logical', 'info']] }, stats: [{ l: 'alternatives', v: '1' }] },
      { log: 'Transformation rules add equivalent alternatives to the same group, such as join A with {B,C}. A join of {A,C} would be a cross product because no predicate links them, so it is not added.', callout: 'Rules add equivalent alternatives', moment: true, code: 2, state: { alts: [['{A,B} join C', 'logical', 'info'], ['A join {B,C}', 'logical, added by associativity', 'info'], ['{A,C} join B', 'cross product: skipped', 'mut']] }, stats: [{ l: 'alternatives', v: '2 + 1 skipped' }] },
      { log: 'Implementation rules turn each logical join into physical ones. The first alternative can be a hash join at 120 or a nested loop at 400. The second as a hash join costs 95.', callout: 'Pick an algorithm for each join', code: 3, state: { alts: [['{A,B} join C: hash join', 'cost 120', 'warn'], ['{A,B} join C: nested loop', 'cost 400', 'bad'], ['A join {B,C}: hash join', 'cost 95', 'ok']], bound: 95 }, stats: [{ l: 'cheapest', v: '95', cls: 'ok' }] },
      { log: 'With a best cost of 95 known, any expression whose partial cost already exceeds 95 is dropped before its inputs are fully explored. Top-down search with a bound skips most of the space.', callout: 'The bound prunes the rest', code: 4, state: { alts: [['{A,B} join C: hash join', 'cut at 95: partial cost over bound', 'mut'], ['{A,B} join C: nested loop', 'cut at 95', 'mut'], ['A join {B,C}: hash join', 'cost 95', 'ok']], bound: 95 }, stats: [{ l: 'pruned', v: '2 of 3', cls: 'ok' }] },
      { log: 'The winner is the cheapest physical expression of the top group: A joined to the result of {B,C}, with its sub-plans chosen the same way.', callout: 'The plan is the winner of the top group', moment: true, code: 5, state: { alts: [['A join {B,C}: hash join', 'cost 95 = the plan', 'ok']], bound: 95, hl: 'chosen plan' }, stats: [{ l: 'plan cost', v: '95', cls: 'ok' }],
        takeaway: 'A memo stores each equivalent expression once. Rules grow it, costs prune it, and the top group holds the answer.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Many plans, one answer</h3>
<p>SQL says what to compute, not how. One query has many equivalent plans: different join orders, access paths and algorithms, and their costs can differ by orders of magnitude. The <b>optimizer</b> maps a <b>logical plan</b>, roughly a relational algebra expression, to the best <b>physical plan</b>, which names a concrete algorithm and access path for each step (and may depend on how the data is stored, such as sorted or compressed). There is not always a one-to-one mapping between them. The optimizer does not run the plans to compare them: it estimates their cost (next chapter).</p>
<figure class="mm" aria-label="Flowchart of the optimizer pipeline from SQL to a physical plan" style="--diagram-width:325px">
  <img src="diagrams/ch17-optimizer-pipeline.svg" alt="Flowchart: SQL is parsed and bound, becomes a logical plan, passes through rewrite rules such as pushdown, unnesting and expression simplification, then plan search over join order, access paths and algorithms, using a cost model with cardinality estimates, which yields the cheapest physical plan. A dotted edge returns to plan search when actual rows differ from the estimate.">
  <figcaption>Flowchart: the stages between SQL and a plan. The dotted edge is adaptive re-optimization.</figcaption>
</figure>

<h3>2. Rewrite first: logical optimization</h3>
<p>Static rules transform a logical plan into a better equivalent one. They need only the catalog, not the data, and nearly always help. <b>Predicate pushdown</b> applies a filter as early as possible, so fewer rows reach the join. <b>Reordering predicates</b> puts the most selective first, and <b>splitting conjunctions</b> lets each part be pushed down separately. <b>Projection pushdown</b> drops unused columns early. <b>Expression rewriting</b> matches patterns and simplifies: impossible predicates such as <code>1 = 0</code> are evaluated at optimization time, and redundant ranges are merged. Rewriting repeats until no rule matches.</p>

<h3>3. Nested subqueries</h3>
<p>A subquery that depends on the outer row runs once per outer row if executed literally. The optimizer <b>rewrites</b> it. A simple one is flattened into a join. A correlated aggregate is turned into a grouped table and a join, as in the scene. For complex nesting the optimizer <b>decomposes</b> the query into blocks, optimizes each and feeds the inner result to the outer. The general method from the 15-721 lecture, German-style unnesting, replaces a dependent join by a normal join with the set of distinct parameter values, so any correlated subquery can be unnested.</p>

<h3>4. Searching the plan space</h3>
<p>The lecture contrasts several architectures. <b>Heuristics</b> (Ingres) apply fixed rules with no cost model, which is fast and blind to data. <b>Bottom-up dynamic programming</b> (System R) finds the best plan for each table, then for each joinable pair, then for each larger subset, keeping only the cheapest plan per subset, so n tables need about 2<sup>n</sup> entries instead of n! orders. PostgreSQL works this way. <b>Top-down search</b> (Volcano, Cascades) starts from the whole query and expands. It uses a <b>memo</b> of groups of equivalent expressions, transformation rules that add alternatives, implementation rules that choose algorithms, and cost bounds that prune. SQL Server, Calcite, Orca and CockroachDB use Cascades-style optimizers. A <b>stratified</b> search (Starburst) separates rewrite from cost-based search. A <b>randomized</b> search, such as PostgreSQL’s genetic optimizer for queries with many tables, trades optimality for a bounded planning time, and every search needs a <b>termination</b> rule: a time budget, a cost threshold or a plan count.</p>
<figure class="mm" aria-label="Four styles of plan enumeration: heuristics, bottom-up, top-down with a memo, randomized" style="--diagram-width:744px">
  <img src="diagrams/ch17-search-styles.svg" alt="Tree: plan enumeration is either heuristics only as in Ingres, bottom-up dynamic programming as in System R keeping the best plan per subset of tables, top-down with a memo as in Volcano and Cascades using rules, groups and cost bounds, or randomized search such as a genetic optimizer for many tables.">
  <figcaption>Tree: four ways to enumerate plans.</figcaption>
</figure>

<h3>5. Adaptive optimization (15-721)</h3>
<p>Plans are chosen before the data is read, so estimates can be wrong. <b>Adaptive query optimization</b> corrects it at three timings. <b>Modify future invocations</b>: remember what happened and change the next run, for example reverting to a previous plan when a new one is slower. <b>Replan the current invocation</b>: stop partway, re-plan with real counts, and continue. <b>Plan pivot points</b>: choose a plan that has built-in switch points, deciding at run time which branch to take. These make a plan less dependent on the estimate, at the price of complexity.</p>

<h3>6. The trade-off</h3>
<p>A bigger search space finds better plans and takes longer to plan: for 15 or more tables exhaustive search is impossible, so budgets and heuristics take over. A plan is only as good as its row estimates (chapter 19), and a slow plan caused by a wrong estimate is not fixed by a better search. Rewrites are cheap and safe. Hints and forced orders fix one query and go stale.</p>

<h3>7. Syntax</h3>
<pre>-- see the chosen plan and its estimates against reality
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders o
WHERE total &gt; (SELECT avg(total) FROM orders i WHERE i.customer_id = o.customer_id);
--   SubPlan 1  (loops=5000000)                   -- correlated, runs per row

-- the manual unnesting
WITH a AS (SELECT customer_id, avg(total) AS avg_total FROM orders GROUP BY customer_id)
SELECT o.* FROM orders o JOIN a USING (customer_id) WHERE o.total &gt; a.avg_total;

-- planning effort for big joins (PostgreSQL)
SHOW join_collapse_limit;     -- default 8: more tables are joined in query order
SHOW geqo_threshold;          -- default 12: genetic search above this</pre>
<p>Look at <code>loops</code> on every node: a large number on an inner node means a per-row subplan or nested loop. Planning time appears at the end of <code>EXPLAIN ANALYZE</code>.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A report keeps orders whose total is above the average of the same customer, written as a correlated subquery, on a 5,000,000-row table. It runs for 40 minutes and <code>EXPLAIN</code> shows a SubPlan with 5,000,000 loops. A second report joins fourteen tables and spends four seconds in planning before it runs for 200 ms (illustrative).`,
    predict: {
      q: `A correlated subquery is evaluated exactly as written, on an outer table of 5,000,000 rows. How many times does the subquery run?`,
      opts: [
        `5,000,000: once for every outer row, since it depends on that row`,
        `Once, because the optimizer always caches the result`,
        `As many times as there are distinct customers`,
        `Twice: once to plan it and once to run it`
      ],
      ans: 0,
      why: `A correlated subquery refers to the outer row, so literally it must be evaluated once for each outer row. Unnesting, which turns it into one GROUP BY and a join, removes the per-row evaluation.`
    },
    diagnose: [
      {
        t: 'Correlated subquery runs per row',
        sym: '<b>A plan node</b> shows millions of loops, and the query is slow although every single run is fast.',
        ctx: 'A subquery in WHERE or SELECT refers to the outer row and the engine did not unnest it. Each outer row starts a separate run.',
        why: 'Run time is the cost of one run times the number of outer rows. Even a one-millisecond subquery takes 83 minutes when run five million times. A set-based rewrite does the work once.',
        log: `-- representative plan, counts illustrative
Seq Scan on orders o  (actual rows=5000000)
  Filter: (total > (SubPlan 1))
  SubPlan 1
    -> Aggregate  (actual time=0.008..0.008 rows=1 loops=5000000)`,
        note: 'Loops equal to the outer row count on an inner node is the fingerprint of a per-row subplan.',
        fix: [
          'Measure first: read <code>loops</code> on the inner nodes of <code>EXPLAIN ANALYZE</code>.',
          'Rewrite as a join with a grouped table (a CTE with GROUP BY), or as a window function: <code>avg(total) OVER (PARTITION BY customer_id)</code>.',
          'Make sure the correlated column is indexed if the subquery must stay.',
          'Verify: loops should be 1 on the aggregate and the run time should drop by orders of magnitude.'
        ]
      },
      OLD.diagnose[2],
      OLD.diagnose[3]
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[17] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [lattice, JOIN_ORD, unnest, memo] };
})();
