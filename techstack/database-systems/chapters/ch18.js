/* Chapter 19 "Cost Models and Cardinality Estimation" (index 18, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L15 Query Planning and Optimization (cost estimation, histograms, sampling); CMU 15-721 L16 Cost Models (selectivity, cardinality, correlated attributes, estimator quality, cost model implementations).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: the independence assumption on overlapping predicates, a plan cost crossover chart, histograms on a skewed column, and error compounding across joins. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 2. Independence: two predicates multiplied, when the real overlap is much larger ---- */
  const TX = 90, TY = 100, TW = 240, TH = 200;
  const overlap = {
    id: 'estimate-overlap', label: 'Independence assumption', desc: 'A table of 100,000 rows. Each predicate alone keeps 10%. If they were independent, both together would keep 1%. The real overlap is far larger (counts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "SELECT * FROM customers WHERE city = 'Ho Chi Minh' AND district = 'District 1';",
      'city = ...      selectivity 0.10  ->  10,000 rows',
      'district = ...  selectivity 0.10  ->  10,000 rows',
      'optimizer: 0.10 x 0.10 = 0.01  ->  estimates 1,000 rows (assumes independence)',
      'CREATE STATISTICS cust_geo (dependencies) ON city, district FROM customers;',
    ] },
    stage: DB.stage({
      footer: 'Simplified: the square is the whole table, areas are row counts. Illustrative.',
      header: s => ({ left: 'estimate ' + (s.est || '-') + ' · actual ' + (s.act || '-'), right: s.right || '' }),
      draw(P, s) {
        P.box('tbl', { x: TX, y: TY, w: TW, h: TH, tone: 'info', label: '', sw: 2 });
        P.text('tt', { x: TX + TW / 2, y: TY - 8, t: 'customers: 100,000 rows', cls: 'mut sm', anchor: 'middle' });
        if (s.a) P.box('a', { x: TX, y: TY, w: TW * 0.1, h: TH, tone: 'cursor', label: '', op: 0.55, stroke: 'cursor' });
        if (s.a) P.text('al', { x: TX + TW * 0.05, y: TY + TH + 16, t: 'city', cls: 'xs', anchor: 'middle' });
        const bx = s.corr ? TX : TX + TW * 0.35;
        if (s.b) P.box('b', { x: s.corr ? TX : TX, y: s.corr ? TY : TY + TH * 0.45, w: s.corr ? TW * 0.1 : TW, h: s.corr ? TH : TH * 0.1, tone: 'acc', label: '', op: 0.55, stroke: 'acc' });
        if (s.b && !s.corr) P.text('bl', { x: TX - 6, y: TY + TH * 0.45 + 16, t: 'district', cls: 'xs', anchor: 'end' });
        if (s.indep) P.box('ix', { x: TX, y: TY + TH * 0.45, w: TW * 0.1, h: TH * 0.1, tone: 'ok', label: '', stroke: 'ok', sw: 2.6 });
        if (s.corrBox) P.box('cx', { x: TX, y: TY, w: TW * 0.1, h: TH, tone: 'bad', label: '', op: 0.55, stroke: 'bad', sw: 2.6 });
        P.chip('e1', { x: 380, y: 100, w: 230, h: 44, label: s.est ? 'estimate ' + s.est : 'estimate', sub: s.estSub || 'from the statistics', tone: s.est ? 'warn' : 'mut' });
        P.chip('e2', { x: 380, y: 156, w: 230, h: 44, label: s.act ? 'actual ' + s.act : 'actual', sub: s.actSub || 'from executing', tone: s.act ? (s.act === '1,000' ? 'ok' : 'bad') : 'mut' });
        if (s.err) P.chip('e3', { x: 380, y: 212, w: 230, h: 44, label: s.err, sub: s.errSub || '', tone: s.errTone || 'bad' });
        if (s.fix) P.chip('e4', { x: 380, y: 268, w: 230, h: 34, label: s.fix, tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'The customers table has 100,000 rows. The query filters on city and on district.', callout: 'Two filters on one table', code: 0,
        state: {}, stats: [{ l: 'rows', v: '100,000' }] },
      { log: 'Filter 1, the city, keeps 10% of the table: a vertical band of 10,000 rows. The statistics know this selectivity well.', callout: 'City alone keeps 10%: 10,000 rows', code: 1,
        state: { a: 1, est: '10,000', act: '10,000', estSub: 'city only', actSub: 'matches' }, stats: [{ l: 'estimate', v: '10,000', cls: 'ok' }, { l: 'actual', v: '10,000', cls: 'ok' }] },
      { log: 'Filter 2, the district, also keeps 10% on its own. Drawn as a horizontal band, it crosses the city band in a small square.', callout: 'District alone also keeps 10%', code: 2,
        state: { a: 1, b: 1, est: '10,000', estSub: 'district only' }, stats: [{ l: 'estimate', v: '10,000', cls: 'ok' }] },
      { log: 'The optimizer multiplies: 0.10 × 0.10 = 0.01. It assumes the predicates are independent, so it expects the small square, 1,000 rows.', callout: 'Independence: 0.10 × 0.10 = 1,000 rows', moment: true, code: 3,
        state: { a: 1, b: 1, indep: 1, est: '1,000', estSub: 'assumes independence' }, stats: [{ l: 'estimate', v: '1,000', cls: 'warn' }] },
      { log: 'But a district belongs to one city. Almost every row of District 1 is in Ho Chi Minh, so the district band lies inside the city band.', callout: 'A district lives inside its city', code: 3,
        state: { a: 1, b: 1, corr: 1, corrBox: 1, est: '1,000', act: '10,000', estSub: 'assumes independence', actSub: 'real overlap', err: 'estimate 10x too small', errSub: '1,000 vs 10,000' }, stats: [{ l: 'estimate', v: '1,000', cls: 'warn' }, { l: 'actual', v: '10,000', cls: 'bad' }] },
      { log: 'The error does not stay here. The next join is planned for 1,000 rows, so it picks an index loop that probes once per row, and now has 10 times more probes.', callout: 'The error flows into the join order', code: 3,
        state: { a: 1, b: 1, corr: 1, corrBox: 1, est: '1,000', act: '10,000', err: 'next join: 10x more probes', errSub: 'plan built on 1,000 rows', right: 'error compounds' }, stats: [{ l: 'error', v: '10x', cls: 'bad' }, { l: 'per extra join', v: 'multiplies', cls: 'bad' }] },
      { log: 'Extended statistics record that the two columns depend on each other. The estimate becomes the real overlap, and the plan changes with it.', callout: 'Tell the optimizer the columns are related', code: 4,
        state: { a: 1, b: 1, corr: 1, corrBox: 1, est: '10,000', act: '10,000', estSub: 'with dependencies', actSub: 'matches', fix: 'CREATE STATISTICS ... dependencies', errTone: 'ok' }, stats: [{ l: 'estimate', v: '10,000', cls: 'ok' }, { l: 'actual', v: '10,000', cls: 'ok' }],
        takeaway: 'Estimates multiply assumptions. When columns are correlated, the optimizer needs to be told, or every later join inherits the error.' },
    ],
  };

  /* ---- 3. Cost crossover: a plan is best only for the row count the optimizer believes ---- */
  const CX = r => 80 + (r / 60000) * 490, CY = c => 316 - c * 0.7;
  const NL = r => 20 + r * 0.005, HJ = r => 120 + r * 0.0008;
  const curve = (f, tag, tone, P) => { for (let r = 0; r < 60000; r += 6000) P.line(tag + r, CX(r), CY(f(r)), CX(r + 6000), CY(f(r + 6000)), { tone, sw: 2.4 }); };
  const cross = {
    id: 'cost-crossover', label: 'Cost crossover', desc: 'Two plans for the same join: an index nested loop and a hash join. Their costs cross at about 24,000 rows. After a big load the optimizer still believes 5,000 (illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'EXPLAIN ANALYZE SELECT ... FROM items i JOIN products p ON p.id = i.product_id ...;',
      "-> Seq Scan on products  (rows=5000)  (actual rows=50000)   -- statistics are stale",
      'index nested loop: cost 20 + 0.005 x rows;  hash join: cost 120 + 0.0008 x rows',
      'at 5,000 rows the nested loop looks cheaper (45 vs 124): chosen',
      'ANALYZE products;   -- refresh the row count and histograms',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two linear cost curves, one join. Illustrative.',
      header: s => ({ left: s.hdr || 'cost vs rows from products', right: s.right || '' }),
      draw(P, s) {
        P.line('ax', 80, 316, 580, 316, { tone: 'mut' }); P.line('ay', 80, 316, 80, 90, { tone: 'mut' });
        P.text('xl', { x: 580, y: 334, t: 'rows from products', cls: 'mut xs', anchor: 'end' });
        P.text('yl', { x: 76, y: 98, t: 'cost', cls: 'mut xs', anchor: 'end' });
        curve(NL, 'nl', 'warn', P); curve(HJ, 'hj', 'ok', P);
        P.text('ln', { x: CX(40000) + 10, y: CY(NL(40000)) + 16, t: 'index nested loop', cls: 'xs tone-warn' });
        P.text('lh', { x: CX(52000), y: CY(HJ(52000)) + 16, t: 'hash join', cls: 'xs tone-ok', anchor: 'end' });
        P.line('cx', CX(23800), 316, CX(23800), CY(NL(23800)), { tone: 'mut', dash: true, sw: 1 });
        P.text('cl', { x: CX(23800), y: 330, t: '~24k', cls: 'mut xs', anchor: 'middle' });
        if (s.est != null) { P.line('me', CX(s.est), 316, CX(s.est), CY(Math.max(NL(s.est), HJ(s.est))) - 4, { tone: 'cursor', sw: 2.6 }); P.chip('mel', { x: CX(s.est) - 40, y: 96, w: 100, h: 28, label: 'believed ' + (s.est >= 1000 ? (s.est / 1000) + 'k' : s.est), tone: 'cursor', small: true }); }
        if (s.act != null) { P.line('ma', CX(s.act), 316, CX(s.act), CY(Math.max(NL(s.act), HJ(s.act))) - 4, { tone: 'bad', sw: 2.6 }); P.chip('mal', { x: CX(s.act) - 40, y: 96, w: 100, h: 28, label: 'actual ' + (s.act / 1000) + 'k', tone: 'bad', small: true }); }
        if (s.pick) P.chip('pk', { x: 96, y: 126, w: 232, h: 44, label: s.pick, sub: s.pickSub || '', tone: s.pickTone || 'warn' });
      }
    }),
    bug: [
      { log: 'Two physical plans give the same answer. Their costs depend on how many rows come out of products, and the curves cross at about 24,000 rows.', callout: 'Two plans, one crossover point', code: 2,
        state: {}, stats: [{ l: 'crossover', v: '~24,000 rows' }] },
      { log: 'The statistics say products has 5,000 rows, from before the bulk load. The optimizer reads its cost off the curves at 5,000.', callout: 'The optimizer believes 5,000 rows', code: 1,
        state: { est: 5000 }, stats: [{ l: 'believed rows', v: '5,000', cls: 'warn' }] },
      { log: 'At 5,000 rows the nested loop costs 45 and the hash join costs 124. The nested loop is cheaper on paper, so it is chosen.', callout: 'At 5,000: nested loop 45, hash join 124', code: 3,
        state: { est: 5000, pick: 'chosen: index nested loop', pickSub: 'cost 45 vs 124', pickTone: 'warn' }, stats: [{ l: 'nested loop', v: '45', cls: 'ok' }, { l: 'hash join', v: '124' }] },
      { log: 'At run time the scan returns 50,000 rows. The real position on the curves is far to the right of the crossover.', callout: 'The real row count is 50,000', moment: true, code: 1,
        state: { est: 5000, act: 50000, pick: 'chosen: index nested loop', pickSub: 'now at the wrong curve', pickTone: 'bad' }, stats: [{ l: 'estimated rows', v: '5,000', cls: 'warn' }, { l: 'actual rows', v: '50,000', cls: 'bad' }] },
      { log: 'There the nested loop really costs 270 and a hash join would have cost 160. The plan is about 1.7 times slower, and more wrong on every table that grew.', callout: 'Nested loop 270 vs hash join 160', code: 3,
        state: { est: 5000, act: 50000, pick: 'chosen: index nested loop', pickSub: 'real cost 270, hash join 160', pickTone: 'bad' }, stats: [{ l: 'chosen plan', v: '270', cls: 'bad' }, { l: 'best plan', v: '160', cls: 'ok' }] },
      { log: 'ANALYZE refreshes the row count and histograms. The believed row count moves to 50,000.', callout: 'ANALYZE moves the estimate to 50,000', code: 4,
        state: { est: 50000, act: 50000, hdr: 'after ANALYZE products' }, stats: [{ l: 'believed rows', v: '50,000', cls: 'ok' }] },
      { log: 'At 50,000 the hash join is cheaper, so the planner flips to it. The SQL text never changed. Only the statistics did.', callout: 'The plan flips to the hash join', code: 4,
        state: { est: 50000, act: 50000, hdr: 'after ANALYZE products', pick: 'chosen: hash join', pickSub: 'cost 160 vs 270', pickTone: 'ok' }, stats: [{ l: 'chosen plan', v: '160', cls: 'ok' }, { l: 'query time', v: 'back to normal', cls: 'ok' }],
        takeaway: 'The best plan depends on the row count. Stale statistics move the optimizer to the wrong side of the crossover.' },
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
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L15 (cost estimation, histograms, sampling) and CMU 15-721 L16 Cost Models (selectivity, cardinality, implementations; notes in output/pdf)', href: '../../output/pdf/database-system/notes/16-costmodels.pdf' };

  /* ---- 3. Histograms: what the optimizer believes about a skewed column ---- */
  const FREQ = [50, 20, 10, 6, 4, 3, 3, 2, 1, 1];
  const hx = i => 70 + i * 52, HY = 296, HS = 3.2;
  const EST = { uniform: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], width: [35, 35, 8, 8, 3.5, 3.5, 2.5, 2.5, 1, 1], depth: [50, 50, 10, 6, 4, 3, 3, 2, 1, 1] };
  const hist = {
    id: 'histogram', label: 'Histograms', desc: 'A column with a skewed distribution, and what each kind of statistic lets the optimizer believe about v = 1. Bars are the real share of rows per value, the line is the estimate (shares illustrative).',
    codeLabel: 'Statistics',
    code: { bug: [
      'column v: value 1 holds 50% of the rows, value 2 holds 20%, ... value 10 holds 1%',
      "WHERE v = 1   -- real selectivity 50%",
      'only the number of distinct values (10): uniform guess 1/10 = 10%',
      'equi-width histogram, 5 buckets of 2 values: bucket 1 has 70%, so 35% per value',
      'equi-depth histogram: every bucket holds the same share, so v = 1 gets its own two buckets: 50%',
      'most common values list: v = 1 stored exactly with its share',
    ] },
    stage: DB.stage({
      footer: 'Illustrative shares of rows. The estimate for v = 1 is the number to watch.',
      header: s => ({ left: s.hl || 'real distribution of v', right: s.est != null ? 'estimate for v = 1: ' + s.est + '%  (real 50%)' : '' }),
      draw(P, s) {
        P.line('ax', 60, HY + 2, 600, HY + 2, { tone: 'mut' });
        FREQ.forEach((f, i) => { P.box('b' + i, { x: hx(i), y: HY - f * HS, w: 40, h: f * HS, tone: i === 0 && s.est != null ? 'cursor' : 'info', label: i === 0 ? '50%' : '' }); P.text('v' + i, { x: hx(i) + 20, y: HY + 18, t: 'v' + (i + 1), cls: 'mut xs', anchor: 'middle' }); });
        const e = EST[s.mode];
        if (e) e.forEach((v, i) => P.line('e' + i, hx(i), HY - v * HS, hx(i) + 40, HY - v * HS, { tone: Math.abs(v - FREQ[i]) > FREQ[i] * 0.3 && i === 0 ? 'bad' : 'ok', sw: 3.4 }));
        if (s.bracket) s.bracket.forEach(([a, b], k) => P.box('br' + k, { x: hx(a) - 2, y: 98, w: hx(b) - hx(a) + 44, h: 24, tone: 'mut', label: s.bl || '', dash: true, cls: 'xs' }));
        if (s.mcv) P.chip('mcv', { x: 300, y: 140, w: 280, h: 40, label: 'most common values', sub: 'v1 50%  v2 20%  v3 10%  rest uniform', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'The column is heavily skewed: half of the rows hold the value 1, and the tail values hold about 1% each. A query asks for v = 1.', callout: 'A skewed column', code: 0, state: { hl: 'real distribution of v' }, stats: [{ l: 'real v = 1', v: '50%' }] },
      { log: 'With only the number of distinct values, the optimizer assumes every value has the same share, 1/10. It expects 10% of the rows where 50% will arrive, five times too few.', callout: 'Uniform guess: 10%, real 50%', moment: true, code: 2, state: { mode: 'uniform', est: 10, hl: 'only distinct count' }, stats: [{ l: 'estimate', v: '10%', cls: 'bad' }, { l: 'error', v: '5x under', cls: 'bad' }] },
      { log: 'An equi-width histogram groups adjacent values into buckets of the same width. Bucket 1 holds 70% for two values, so each is estimated at 35%. Better, but the skew inside the bucket is lost.', callout: 'Equi-width buckets: 35%', code: 3, state: { mode: 'width', est: 35, hl: 'equi-width histogram', bracket: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]], bl: '' }, stats: [{ l: 'estimate', v: '35%', cls: 'warn' }, { l: 'error', v: '1.4x under', cls: 'warn' }] },
      { log: 'An equi-depth histogram makes every bucket hold the same share of rows, so the buckets are narrow where the data is dense. Value 1 fills two buckets alone, and the estimate matches.', callout: 'Equi-depth: dense values get their own buckets', code: 4, state: { mode: 'depth', est: 50, hl: 'equi-depth histogram', bracket: [[0, 0]], bl: 'v1 fills two buckets' }, stats: [{ l: 'estimate', v: '50%', cls: 'ok' }] },
      { log: 'Many systems also keep a list of the most common values with exact shares, and use a histogram only for the rest. The heavy hitters are exact, and the tail is cheap to approximate.', callout: 'Most common values list: exact heavy hitters', code: 5, state: { mode: 'depth', est: 50, mcv: 1, hl: 'most common values + histogram' }, stats: [{ l: 'estimate', v: '50%', cls: 'ok' }],
        takeaway: 'Statistics decide the plan. A histogram or an MCV list protects against skew, and the uniform guess does not.' },
    ],
  };

  /* ---- 4. Error compounding: an error per join multiplies, so deep joins are badly misjudged ---- */
  const EX0 = 80, EX1 = 590, EY0 = 288, EY1 = 108;
  const exk = k => EX0 + k / 5 * (EX1 - EX0);
  const eyr = r => EY0 - (Math.log10(r) - 3) / 4 * (EY0 - EY1);
  const ACT = k => 10000 * Math.pow(3, k), ESTR = k => 10000 * Math.pow(1.5, k);
  const compound = {
    id: 'error-compounding', label: 'Error per join', desc: 'Each join estimate is off by a factor of two. The error of the whole plan is the product, so it doubles with every table joined. The chart shows actual and estimated rows after 0 to 5 joins (values illustrative).',
    codeLabel: 'Reading',
    code: { bug: [
      'x: number of joins already applied, y: rows after them (log scale)',
      'actual rows triple at each join: 10,000, 30,000, 90,000 ...',
      'estimated rows grow by 1.5x per join: each step is 2x too low',
      'after 5 joins the error is 2^5 = 32x: 76,000 estimated against 2,430,000 real',
      'at that size a plan built for 76,000 rows (nested loop) is the wrong plan',
    ] },
    stage: DB.stage({
      footer: 'Illustrative numbers, following published findings that errors grow with the join count.',
      header: s => ({ left: s.hl || 'rows after k joins', right: '' }),
      draw(P, s) {
        P.line('ax', EX0, EY0 + 4, EX1, EY0 + 4, { tone: 'mut' }); P.line('ay', EX0, EY0 + 4, EX0, EY1 - 10, { tone: 'mut' });
        for (let k = 0; k <= 5; k++) P.text('tx' + k, { x: exk(k), y: EY0 + 22, t: String(k), cls: 'mut xs', anchor: 'middle' });
        [1e3, 1e4, 1e5, 1e6, 1e7].forEach((r, i) => P.text('ty' + i, { x: EX0 - 8, y: eyr(r) + 4, t: r >= 1e6 ? r / 1e6 + 'M' : r / 1e3 + 'K', cls: 'mut xs', anchor: 'end' }));
        P.text('xl', { x: EX1, y: EY0 + 40, t: 'joins applied', cls: 'mut xs', anchor: 'end' }); P.text('yl', { x: EX0 + 6, y: EY1 - 14, t: 'rows (log)', cls: 'mut xs' });
        for (let k = 1; k <= 5; k++) { if (s.act) P.line('a' + k, exk(k - 1), eyr(ACT(k - 1)), exk(k), eyr(ACT(k)), { tone: 'bad', sw: 3 }); if (s.est) P.line('e' + k, exk(k - 1), eyr(ESTR(k - 1)), exk(k), eyr(ESTR(k)), { tone: 'ok', sw: 3 }); }
        if (s.act) P.text('la', { x: exk(4) - 40, y: eyr(ACT(4)) - 12, t: 'actual', cls: 'xs tone-bad' });
        if (s.est) P.text('le', { x: exk(4) - 40, y: eyr(ESTR(4)) + 20, t: 'estimated', cls: 'xs tone-ok' });
        (s.gap || []).forEach(k => { P.line('g' + k, exk(k), eyr(ESTR(k)), exk(k), eyr(ACT(k)), { tone: 'cursor', dash: true, sw: 2 }); P.chip('gc' + k, { x: exk(k) + (k === 5 ? -70 : 6), y: (eyr(ESTR(k)) + eyr(ACT(k))) / 2 - 12, w: 62, h: 24, label: Math.pow(2, k) + 'x', sub: '', tone: 'warn', small: true }); });
      }
    }),
    bug: [
      { log: 'Real row counts after each join: the first join triples the rows, and so does every later one. After 5 joins there are about 2.4 million rows.', callout: 'The real row counts', code: 1, state: { act: 1 }, stats: [{ l: 'actual after 5', v: '2,430,000' }] },
      { log: 'The optimizer estimates each join with a small error: it expects 1.5 times more rows, not 3. Each step is a factor of two low, and the next step starts from the already wrong number.', callout: 'Each join is 2x low', code: 2, state: { act: 1, est: 1 }, stats: [{ l: 'estimate after 5', v: '76,000' }] },
      { log: 'Because every join builds on the previous estimate, the errors multiply. The gap is 2x after one join, 8x after three and 32x after five.', callout: 'The gap widens with each join', moment: true, code: 3, state: { act: 1, est: 1, gap: [1, 3, 5] }, stats: [{ l: 'error after 5 joins', v: '32x', cls: 'bad' }] },
      { log: 'At 76,000 expected rows a nested loop looks fine. At 2.4 million real rows it is far worse than a hash join, and the plan cannot recover. Published studies found every major system underestimating more as joins are added.', callout: 'A plan for 76,000 meets 2,400,000', code: 4, state: { act: 1, est: 1, gap: [1, 3, 5], hl: 'plan built on the estimate' }, stats: [{ l: 'wrong plan', v: 'likely', cls: 'bad' }],
        takeaway: 'Estimates degrade with every join. Prefer plans that do not depend on them, and invest in cardinality estimates before cost model details.' },
    ],
  };

  const EXPLAIN = `
<h3>1. What a cost model is for</h3>
<p>The optimizer ranks plans by an estimated <b>cost</b>, a number that is meaningful only inside the system and only for comparing plans. The estimate depends on how many tuples each operator handles, which depends on three things: the access methods available, the distribution of values in the columns, and the predicates of the query. The lecture names three kinds of components. <b>Physical costs</b> predict CPU cycles, I/O, cache misses and memory, and depend on the hardware. <b>Logical costs</b> estimate the result size of each operator, independent of the algorithm. <b>Algorithmic costs</b> capture the complexity of the operator implementation. Cost classes: CPU is small and hard to estimate, disk I/O counts block transfers, memory counts DRAM used, and in a distributed system network counts messages.</p>
<figure class="mm" aria-label="Three cost components feeding the total cost of a plan" style="--diagram-width:360px">
  <img src="diagrams/ch18-cost-parts.svg" alt="Diagram: logical cost, the rows per operator, algorithmic cost, the hash join sort or scan algorithm, and physical cost, CPU I/O and cache misses from hardware constants, all feed the total plan cost.">
  <figcaption>Diagram: the three parts of a cost model.</figcaption>
</figure>

<h3>2. Selectivity and cardinality</h3>
<p>The <b>selectivity</b> of a predicate is the fraction of tuples that qualify, which is also its probability. The <b>cardinality</b> of an operator is its selectivity times the number of input tuples. For each table the catalog keeps the number of tuples N<sub>R</sub> and the number of distinct values V(A, R) of each column, so an equality on a column keeps N<sub>R</sub> / V(A, R) tuples: the <b>selection cardinality</b>. A negation is 1 minus the selectivity, and two predicates that are independent multiply. Three simplifying assumptions drive these formulas: <b>uniform data</b> (all values equally common, except heavy hitters), <b>independent predicates</b> (the product rule) and the <b>inclusion principle</b> (every join key of the inner table exists in the outer). Real data breaks all three.</p>
<figure class="mm" aria-label="Flowchart from a predicate to a cost: statistics, combine, cardinality, join size, cost" style="--diagram-width:560px">
  <img src="diagrams/ch18-estimate-flow.svg" alt="Flowchart: a predicate looks up statistics. With most common values or a histogram, selectivity comes from the bucket. With only a distinct count it is one over the distinct values. With nothing it is a default guess such as 20 percent. Predicates are combined by multiplying, assuming independence. Cardinality is selectivity times input rows. Join size is rows of R times rows of S over the larger distinct count of the join key. The cost model turns rows into a cost and the plan search compares costs.">
  <figcaption>Flowchart: how a row estimate is built, and where each assumption enters.</figcaption>
</figure>

<h3>3. Where the numbers come from</h3>
<p><b>Histograms</b> are the most common statistic. Storing every value is too costly, so values are grouped: <b>equi-width</b> buckets share a value range, <b>equi-depth</b> buckets hold roughly the same number of rows, so dense regions get narrow buckets. A list of <b>most common values</b> stores heavy hitters exactly. <b>Sketches</b> such as HyperLogLog keep approximate counts, for instance distinct values, with bounded error and tiny memory. <b>Sampling</b> runs the predicate on a random sample of the table, either a read-only copy refreshed periodically or a sample of the live table. An <b>ML model</b> trained on the data can capture correlations that humans miss, and is still early. Statistics are collected in the background, so they go stale after a big load.</p>

<h3>4. Correlation and column groups</h3>
<p>The product rule fails when columns are related. In a table of cars, <code>brand = 'Tesla' AND model = 'Model X'</code> multiplies two small selectivities, but only Tesla makes a Model X, so the real selectivity equals the smaller one, not their product. The fix is <b>column group statistics</b>, which track combinations of columns together: SQL Server can build them automatically, others need to be told which groups matter.</p>

<h3>5. How good are real estimators?</h3>
<p>A well-known study evaluated cardinality estimates on the Join Order Benchmark (IMDB data) as the number of joins grows. Every system produced serious <b>underestimates</b>, and the error grows with each join. Lessons from the lecture: a good join order matters more than a fast engine, so cost-based ordering is needed; estimates are routinely wrong, so prefer operators that do not rely on them; hash joins with sequential scans are a robust combination, while more indexes make plans faster on average and more brittle; and improving cardinality estimation is worth more than refining the cost model.</p>

<h3>6. Real cost models</h3>
<p><b>PostgreSQL</b> adds CPU and I/O costs weighted by constants such as <code>seq_page_cost</code>, <code>random_page_cost</code>, <code>cpu_tuple_cost</code>. The defaults suit a disk-resident database with little memory: processing a tuple in memory is about 400 times cheaper than reading it from disk, and sequential I/O is 4 times cheaper than random. <b>IBM DB2</b> stores hardware, storage, bandwidth, memory and concurrency settings in the catalog, measured by micro-benchmarks. <b>Smallbase</b> generates hardware costs automatically: list the execution primitives, then micro-benchmark them at start-up. <b>DuckDB</b> cannot assume statistics exist for a new file, so it uses distinct counts for a worst-case join estimate, and a magic 20% selectivity when it has no distinct-count sketch.</p>

<h3>7. The trade-off</h3>
<p>More precise statistics give better plans and cost more to build, store and keep fresh. Richer models find correlations and cost planning time. Because estimates degrade with the join count, robust execution (hash joins, adaptive operators) can matter as much as better numbers.</p>

<h3>8. Syntax</h3>
<pre>-- compare estimated and actual rows at every node
EXPLAIN (ANALYZE, BUFFERS)
SELECT ... FROM customers c JOIN orders o ON ... JOIN items i ON ... JOIN products p ON ...;
--   Seq Scan on products  (cost=0.00..1200.00 rows=5000) (actual rows=50000)

-- refresh statistics, and see when they were last refreshed
ANALYZE products;
SELECT relname, last_analyze, n_live_tup FROM pg_stat_user_tables WHERE relname = 'products';

-- the histogram and most common values the planner uses
SELECT most_common_vals, most_common_freqs, histogram_bounds FROM pg_stats
WHERE tablename = 'products' AND attname = 'category';

-- tell the optimizer that two columns are related
CREATE STATISTICS cust_geo (dependencies) ON city, district FROM customers;
ANALYZE customers;

-- more detail for a skewed column
ALTER TABLE products ALTER COLUMN category SET STATISTICS 500;</pre>
<p>When estimated rows and actual rows differ by 10 times or more at one node, fix the statistics for that node before you touch the SQL.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: [
      OLD.diagnose[0],
      OLD.diagnose[1],
      {
        t: 'Skew hidden by a uniform assumption',
        sym: '<b>One value of a column</b> takes most of the rows, and the planner expects a tiny share.',
        ctx: 'A status column has one value on 60% of the rows. Statistics were collected with a tiny target, so the most common values list is empty.',
        why: 'Without a most-common-values list or enough histogram buckets, the planner falls back to 1 over the distinct count. That is right for the rare values and badly wrong for the heavy one, so the plan for the common value is built on an estimate that is much too small.',
        log: `-- representative plan, counts illustrative
Index Scan using orders_status_idx on orders  (rows=2000) (actual rows=6000000)
  Index Cond: (status = 'paid')`,
        note: 'A huge gap between estimated and actual rows on an equality filter points to skew the statistics do not capture.',
        fix: [
          'Measure first: compare estimated and actual rows for the heavy value, and read <code>pg_stats</code> for the column.',
          'Raise the statistics target for the column, <code>ALTER TABLE ... SET STATISTICS 500</code>, and run <code>ANALYZE</code>.',
          'For a value that must always be fast, use a partial index or a query that names the column group.',
          'Verify: estimated and actual rows should be within a small factor.'
        ]
      },
      {
        t: 'Estimate error grows with the join count',
        sym: '<b>A many-table query</b> picks a plan that is fine for the first joins and collapses at the last.',
        ctx: 'Each join carries an error of about 2 and the next join starts from the wrong number. At five joins the estimate is 32 times too small, so a nested loop is chosen where a hash join is needed.',
        why: 'Estimates are built from previous estimates, so errors multiply. The last operators of a deep plan are the least reliable and often the most expensive.',
        log: `-- representative, counts illustrative
Nested Loop  (rows=76000) (actual rows=2430000)  <- 5th join
  -> Nested Loop  (rows=50600) (actual rows=810000)
  -> ...`,
        note: 'The first node with a big error is the root cause; later nodes only inherit it.',
        fix: [
          'Measure first: find the first node from the bottom where estimated and actual rows differ by 10x or more.',
          'Fix statistics for the tables and columns at that node: <code>ANALYZE</code>, column groups, higher targets.',
          'Break the query: materialize an intermediate result with a CTE or a temporary table, so the next step starts from a real count.',
          'Enable or prefer adaptive execution where the engine has it.',
          'Verify: the plan at the deep joins should switch to hash joins, and the run time should fall.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[18] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [overlap, cross, hist, compound] };
})();
