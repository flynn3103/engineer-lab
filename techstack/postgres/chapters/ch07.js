/* Chapter 7 "Planner and Statistics": three bespoke scenes plus the Explain text (index 7, zero-based).
   Loads after course.js and scene-kit.js. Row counts, costs and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: costs, rows and timings are illustrative. The logic is real.';

  /* ---------- 1. Stale statistics pick a nested loop ---------- */
  const stale = {
    id: 'stale-stats', label: 'Stale stats after a load', desc: 'The statistics describe the table before the load. The planner expects 10 rows, picks a nested loop, and the loop runs 2 million times.',
    codeLabel: 'SQL', code: { bug: ['-- 02:00 the loader appends 2,000,000 rows for tenant 9', 'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id', 'EXPLAIN (ANALYZE) ...   -- rows=10 estimated, rows=2000000 actual', '-- fix', 'ANALYZE orders;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'pg_stats for tenant_id 9 · join choice', right: s.r || '' }),
      setup(kit) {
        const st = kit.chip(null, { x: 16, y: 76, w: 290, h: 48, label: 'Statistics', sub: '', tone: 'info' });
        const last = kit.chip(null, { x: 334, y: 76, w: 290, h: 48, label: 'last ANALYZE', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 164, w: 400, labelW: 130, max: 100, items: [{ id: 'est', label: 'estimated rows' }, { id: 'act', label: 'actual rows' }, { id: 'nl', label: 'Nested Loop cost' }, { id: 'hj', label: 'Hash Join cost' }], title: 'What the planner believes' });
        const pick = kit.chip(null, { x: 440, y: 190, w: 184, h: 56, label: 'Chosen plan', sub: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { st, last, bars, pick, res };
      },
      frame(s, kit, R) {
        R.st.set({ sub: s.st || '', tone: s.stT || 'info' }); R.last.set({ sub: s.last || '', tone: s.lT || 'info' });
        const b = s.b || {};
        R.bars.set('est', b.est || 0, 'ok', b.estL || '0'); R.bars.set('act', b.act || 0, b.act ? 'warn' : 'ok', b.actL || '0');
        R.bars.set('nl', b.nl || 0, b.nlBad ? 'bad' : 'ok', b.nlL || '0'); R.bars.set('hj', b.hj || 0, 'ok', b.hjL || '0');
        R.pick.set({ show: !!s.pick, sub: s.pick || '', tone: s.pT || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'Before the load, tenant 9 has about 10 orders. The statistics say so, and the planner picks a nested loop, which is the cheapest way to join 10 rows to the customers.', callout: 'Before the load: 10 rows, nested loop is right', state: { st: 'tenant 9: ~10 rows', stT: 'ok', last: 'yesterday', b: { est: 1, estL: '10', act: 1, actL: '10', nl: 3, nlL: '25', hj: 55, hjL: '1,200' }, pick: 'Nested Loop', pT: 'ok', r: 'before' }, stats: [{ l: 'estimated', v: '10', cls: 'ok' }, { l: 'actual', v: '10', cls: 'ok' }] },
      { log: 'At 02:00 a loader appends 2 million rows for tenant 9. Nothing tells the planner. ANALYZE has not run since yesterday.', callout: 'The table changed; the statistics did not', code: 0, state: { st: 'still says ~10 rows', stT: 'warn', last: 'yesterday · stale', lT: 'warn', b: { est: 1, estL: '10', act: 100, actL: '2 M', nl: 3, nlL: '25', hj: 55, hjL: '1,200' }, r: 'after the load' }, stats: [{ l: 'estimated', v: '10', cls: 'warn' }, { l: 'actual', v: '2,000,000', cls: 'bad' }] },
      { log: 'The planner still believes there are 10 rows. At that size a nested loop costs 25 and a hash join 1,200, so it keeps the nested loop.', callout: 'With 10 rows expected, the nested loop wins', moment: true, code: 1, state: { st: 'still says ~10 rows', stT: 'warn', last: 'yesterday · stale', lT: 'warn', b: { est: 1, estL: '10', act: 100, actL: '2 M', nl: 3, nlL: '25', hj: 55, hjL: '1,200' }, pick: 'Nested Loop', pT: 'warn', r: 'plan chosen' }, stats: [{ l: 'chosen', v: 'Nested Loop', cls: 'warn' }] },
      { log: 'The executor runs the plan. The index probe on customers runs once per outer row, so 2 million times instead of 10.', callout: 'The probe runs 2,000,000 times', code: 2, state: { st: 'still says ~10 rows', stT: 'warn', last: 'yesterday · stale', lT: 'warn', b: { est: 1, estL: '10', act: 100, actL: '2 M', nl: 100, nlL: '2.5 M', nlBad: true, hj: 55, hjL: '1,200' }, pick: 'Nested Loop', pT: 'bad', res: 'rows=10 estimated, rows=2000000 actual · about 5 minutes (illustrative)', resTone: 'bad', r: 'executing' }, stats: [{ l: 'loops', v: '2,000,000', cls: 'bad' }, { l: 'time', v: '~5 min', cls: 'bad' }] },
      { log: 'ANALYZE samples the table again and learns that tenant 9 has 2 million rows. This takes seconds.', callout: 'Fix: ANALYZE orders', code: 4, state: { st: 'tenant 9: ~2,000,000 rows', stT: 'ok', last: 'just now', lT: 'ok', b: { est: 100, estL: '2 M', act: 100, actL: '2 M', nl: 100, nlL: '2.5 M', nlBad: true, hj: 55, hjL: '1,200' }, r: 'ANALYZE' }, stats: [{ l: 'estimated', v: '2,000,000', cls: 'ok' }, { l: 'actual', v: '2,000,000', cls: 'ok' }] },
      { log: 'With 2 million rows expected, the nested loop now costs millions and the hash join stays cheap. The planner switches, and the query takes milliseconds to seconds.', callout: 'The planner switches to a hash join', code: 4, state: { st: 'tenant 9: ~2,000,000 rows', stT: 'ok', last: 'just now', lT: 'ok', b: { est: 100, estL: '2 M', act: 100, actL: '2 M', nl: 100, nlL: '2.5 M', nlBad: true, hj: 40, hjL: '60,000' }, pick: 'Hash Join', pT: 'ok', res: 'estimate ≈ actual · plan is a hash join', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'chosen', v: 'Hash Join', cls: 'ok' }, { l: 'time', v: 'seconds', cls: 'ok' }],
        takeaway: 'Wrong row estimates choose the wrong plan. Compare estimated and actual rows first.' },
    ],
  };

  /* ---------- 2. Correlated columns ---------- */
  const corr = {
    id: 'correlated', label: 'Correlated filters', desc: 'Two predicates on related columns are multiplied as if independent, so the estimate is about 3x too low. Extended statistics teach the planner the dependency.',
    codeLabel: 'SQL', code: { bug: ['SELECT * FROM orders WHERE country = \'VN\' AND currency = \'VND\';', '-- table: 4,000 rows (illustrative)', '-- country = \'VN\' alone: 30%   currency = \'VND\' alone: 30%', '-- both: the planner multiplies 0.3 * 0.3', 'CREATE STATISTICS orders_cc (dependencies) ON country, currency FROM orders;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'orders · 4,000 rows', right: s.r || '' }),
      setup(kit) {
        const p1 = kit.chip(null, { x: 16, y: 76, w: 190, h: 50, label: 'country = VN', sub: '', tone: 'info' });
        const p2 = kit.chip(null, { x: 224, y: 76, w: 190, h: 50, label: 'currency = VND', sub: '', tone: 'info' });
        const cmb = kit.chip(null, { x: 432, y: 76, w: 192, h: 50, label: 'both', sub: '', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 16, y: 164, w: 400, labelW: 130, max: 100, items: [{ id: 'est', label: 'estimated rows' }, { id: 'act', label: 'actual rows' }], title: 'Rows matching both predicates' });
        const pick = kit.chip(null, { x: 440, y: 176, w: 184, h: 50, label: 'Plan', sub: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 262, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { p1, p2, cmb, bars, pick, res };
      },
      frame(s, kit, R) {
        R.p1.set({ sub: s.p1 || '', tone: s.p1 ? 'ok' : 'info' }); R.p2.set({ sub: s.p2 || '', tone: s.p2 ? 'ok' : 'info' });
        R.cmb.set({ show: !!s.cmb, sub: s.cmb || '', tone: s.cT || 'info' });
        R.bars.set('est', s.est || 0, s.estBad ? 'bad' : 'ok', s.estL || '0'); R.bars.set('act', s.act || 0, 'ok', s.actL || '0');
        R.pick.set({ show: !!s.pick, sub: s.pick || '', tone: s.pT || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'Each predicate on its own is estimated well from its statistics: about 30% of the rows have country VN, and about 30% have currency VND.', callout: 'Each predicate alone is estimated well', code: 2, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', r: 'single columns' }, stats: [{ l: 'country', v: '30%', cls: 'ok' }, { l: 'currency', v: '30%', cls: 'ok' }] },
      { log: 'For both together, the planner multiplies the two fractions as if the columns were independent: 0.3 × 0.3 = 9%, so it expects 360 rows.', callout: 'The planner multiplies: 0.3 × 0.3 = 9%', moment: true, code: 3, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', cmb: '9% → 360 rows', cT: 'warn', est: 30, estL: '360', estBad: true, r: 'multiplied' }, stats: [{ l: 'estimated', v: '360', cls: 'warn' }] },
      { log: 'Almost every VN row also has VND, so the real share is about 30%, or 1,200 rows. The estimate is about 3 times too low.', callout: 'In reality the columns move together', code: 3, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', cmb: '9% → 360 rows', cT: 'warn', est: 30, estL: '360', estBad: true, act: 100, actL: '1,200', r: 'real data' }, stats: [{ l: 'estimated', v: '360', cls: 'warn' }, { l: 'actual', v: '1,200', cls: 'bad' }] },
      { log: 'With 360 rows expected, the planner picks an Index Scan on country, then reads far more rows than it planned for, and every later join node inherits the wrong estimate.', callout: 'A 3x error spreads to every later node', code: 3, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', cmb: '9% → 360 rows', cT: 'warn', est: 30, estL: '360', estBad: true, act: 100, actL: '1,200', pick: 'Index Scan', pT: 'warn', r: 'plan chosen' }, stats: [{ l: 'error', v: '~3x low', cls: 'bad' }] },
      { log: 'CREATE STATISTICS with dependencies records that one column determines the other. After ANALYZE, the planner stops multiplying.', callout: 'Fix: CREATE STATISTICS ... (dependencies)', code: 4, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', cmb: 'dependency: ~30%', cT: 'ok', est: 100, estL: '1,200', act: 100, actL: '1,200', r: 'extended stats' }, stats: [{ l: 'estimated', v: '1,200', cls: 'ok' }, { l: 'actual', v: '1,200', cls: 'ok' }] },
      { log: 'The estimate now matches the actual rows, so the planner prices the plans correctly and picks one that suits 1,200 rows.', callout: 'The estimate matches the actual rows', code: 4, state: { p1: '30% → 1,200 rows', p2: '30% → 1,200 rows', cmb: 'dependency: ~30%', cT: 'ok', est: 100, estL: '1,200', act: 100, actL: '1,200', pick: 'Seq Scan or Bitmap', pT: 'ok', res: 'estimate ≈ actual, plan suits the real size', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'error', v: 'small', cls: 'ok' }],
        takeaway: 'The planner assumes columns are independent. Extended statistics tell it when they are not.' },
    ],
  };

  /* ---------- 3. Custom plans, then a generic plan ---------- */
  const EX = 8;
  const generic = {
    id: 'generic-plan', label: 'Generic plan after five runs', desc: 'A prepared statement is planned per parameter for its first five runs. After that PostgreSQL may switch to one generic plan that ignores the value.',
    codeLabel: 'SQL', code: { bug: ['PREPARE q AS SELECT * FROM orders WHERE customer_id = $1;', '-- customer 7 has 3 orders; customer 99 has 2,000,000', 'EXECUTE q(7);   -- runs 1 to 5: a custom plan each time', 'EXECUTE q(99);  -- run 6 and later: maybe a generic plan', '-- fix', 'SET plan_cache_mode = force_custom_plan;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'one prepared statement · executions 1 to 8', right: s.r || '' }),
      setup(kit) {
        const ex = Object.values(kit.strip(null, { x: 16, y: 80, items: Array.from({ length: EX }, (_, i) => ({ id: 'e' + i, label: '#' + (i + 1) })), w: 68, h: 40, gap: 8, tone: 'info' }));
        const dec = kit.chip(null, { x: 16, y: 146, w: 608, h: 40, label: '', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 218, w: 400, labelW: 150, max: 100, items: [{ id: 'small', label: 'customer 7 (small)' }, { id: 'big', label: 'customer 99 (big)' }], title: 'Latency (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { ex, dec, bars, res };
      },
      frame(s, kit, R) {
        const n = s.n || 0;
        R.ex.forEach((c, i) => c.set({ tone: i >= n ? 'info' : (s.gen && i >= 5) ? 'warn' : 'live', sub: i >= n ? '' : (s.gen && i >= 5) ? 'generic' : 'custom' }));
        R.dec.set({ label: s.dec || 'no decision yet', sub: s.decSub || '', tone: s.dT || 'info' });
        R.bars.set('small', s.sm || 0, 'ok', s.smL || '0'); R.bars.set('big', s.bg || 0, s.bgBad ? 'bad' : 'ok', s.bgL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The app prepares one statement and runs it for different customers. For the first five executions PostgreSQL plans each one with the actual parameter value.', callout: 'Runs 1 to 5: a custom plan for each value', code: 2, state: { n: 5, dec: 'custom plans', decSub: 'each plan sees the real value', dT: 'ok', sm: 4, smL: '2 ms', bg: 30, bgL: '400 ms', r: 'runs 1 to 5' }, stats: [{ l: 'plans', v: 'custom', cls: 'ok' }] },
      { log: 'Customer 7 gets an Index Scan, because it has 3 rows. Customer 99 gets a sequential scan, because it has 2 million. Each plan suits its value.', callout: 'Small customer: index. Big customer: scan', code: 2, state: { n: 5, dec: 'custom plans', decSub: 'index for customer 7, scan for customer 99', dT: 'ok', sm: 4, smL: '2 ms', bg: 30, bgL: '400 ms', r: 'right plan each time' }, stats: [{ l: 'customer 7', v: '2 ms', cls: 'ok' }, { l: 'customer 99', v: '400 ms', cls: 'ok' }] },
      { log: 'From the sixth run, the planner builds a generic plan with $1 left open and compares its estimated cost with the average of the custom plans.', callout: 'Run 6: compare the generic plan to the average', code: 3, state: { n: 6, dec: 'generic cost ≈ average custom cost', decSub: 'under the default plan_cache_mode = auto', dT: 'cursor', sm: 4, smL: '2 ms', bg: 30, bgL: '400 ms', r: 'run 6' }, stats: [{ l: 'decision', v: 'generic is not worse' }] },
      { log: 'The generic plan looks about as cheap, because it assumes an average customer. PostgreSQL keeps it and reuses it for every later value.', callout: 'The generic plan is kept for every value', moment: true, code: 3, state: { n: 8, gen: true, dec: 'using the generic plan', decSub: 'it ignores the parameter value', dT: 'warn', sm: 4, smL: '2 ms', bg: 30, bgL: '400 ms', r: 'runs 6 to 8' }, stats: [{ l: 'plan', v: 'generic', cls: 'warn' }] },
      { log: 'The generic plan is the index plan, tuned for the average. For customer 99 it fetches 2 million rows through the index, one random read at a time. The big customer is now slow.', callout: 'Customer 99 now takes 15 s', code: 3, state: { n: 8, gen: true, dec: 'using the generic plan', decSub: 'index plan for every value', dT: 'bad', sm: 4, smL: '2 ms', bg: 100, bgL: '15 s', bgBad: true, res: 'latency jumps for big customers after the fifth execution', resTone: 'bad', r: 'regression' }, stats: [{ l: 'customer 99', v: '15 s', cls: 'bad' }, { l: 'customer 7', v: '2 ms', cls: 'ok' }] },
      { log: 'The fix is plan_cache_mode = force_custom_plan for this role. Every run is planned with the real value, and the latency is back.', callout: 'Fix: force_custom_plan', code: 5, state: { n: 8, dec: 'custom plan for every run', decSub: 'plan_cache_mode = force_custom_plan', dT: 'ok', sm: 4, smL: '2 ms', bg: 30, bgL: '400 ms', res: 'every value gets a plan that suits it', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'customer 99', v: '400 ms', cls: 'ok' }],
        takeaway: 'A generic plan ignores the parameter value, so skewed data needs custom plans.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[7] = { explain: `
<h3>1. The planner guesses, then prices</h3>
<p>The planner does not run a query to decide how to run it. It estimates how many rows each step will return, prices each candidate plan, and picks the cheapest one. Every decision depends on those row estimates, which come from statistics collected by <code>ANALYZE</code>.</p>
<figure class="hd" aria-label="Flowchart: from statistics to a plan">
  <div class="hd-flow"><div class="hd-node">ANALYZE samples the table into pg_statistic</div><div class="hd-down">↓</div><div class="hd-node warn">Estimate selectivity and row counts</div><div class="hd-down">↓</div><div class="hd-node">Price each plan and join method</div><div class="hd-down">↓</div><div class="hd-node">Keep the cheapest plan</div><div class="hd-down">↓</div><div class="hd-node ok">Executor runs it: the actual rows may differ</div></div>
  <figcaption>Every later step depends on the row estimates.</figcaption>
</figure>

<h3>2. Statistics and selectivity</h3>
<p><code>ANALYZE</code> samples each table and stores per-column statistics in <code>pg_statistic</code> (shown in the <code>pg_stats</code> view). They include the null fraction, <code>n_distinct</code>, the most common values and a histogram. The sample size is set by <code>default_statistics_target</code>, which defaults to 100. <b>Selectivity</b> is the fraction of rows a predicate keeps. The planner estimates it from those statistics and multiplies the selectivities of several predicates, as if the columns were independent.</p>

<h3>3. Cost and the join method</h3>
<p><b>Cost</b> is a sum of sequential and random page costs plus CPU costs per row. The planner prices each join method (nested loop, hash, merge) and keeps the cheapest. A nested loop is cheapest for very few outer rows and ruinous for millions, because it probes the inner side once per outer row. That is why one wrong estimate can turn milliseconds into minutes.</p>

<h3>4. Extended statistics</h3>
<p>Extended statistics (<code>CREATE STATISTICS</code>) record dependencies between columns, so the planner stops multiplying correlated predicates. The kinds are <code>dependencies</code>, <code>ndistinct</code> and <code>mcv</code>. Create one only for column groups that appear together in filters or <code>GROUP BY</code> and that are misestimated.</p>

<h3>5. The plan cache, and the trade-off</h3>
<p>A prepared statement first runs custom plans, one per parameter value. Under the default rules it may then switch to a generic plan that ignores the parameter value, after at least five executions, when the generic plan's cost is not worse than the average custom plan. <code>plan_cache_mode</code> controls this. Statistics are cheap, but they are sampled and they go stale after a large change. Autovacuum re-analyzes a table only after <code>autovacuum_analyze_scale_factor</code> (default 0.1) of it has changed, so a bulk load of one tenant can slip past it. Independence and averages are simplifications. When an estimate is far off, the planner confidently picks a plan that does not scale. Check estimated against actual rows first.</p>

<h3>6. Syntax</h3>
<pre>-- estimated against actual rows, per node
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;

-- what does the planner know about a column?
SELECT n_distinct, null_frac, most_common_vals, histogram_bounds FROM pg_stats
WHERE tablename = 'orders' AND attname = 'tenant_id';

-- when did statistics last refresh?
SELECT relname, last_analyze, last_autoanalyze, n_mod_since_analyze FROM pg_stat_user_tables WHERE relname = 'orders';

-- after a bulk load, and for big tables
ANALYZE orders;
ALTER TABLE orders SET (autovacuum_analyze_scale_factor = 0.01);

-- correlated columns
CREATE STATISTICS orders_cc (dependencies, mcv) ON country, currency FROM orders;
ANALYZE orders;

-- a skewed column needs a finer histogram
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 500;

-- generic plans
ALTER ROLE api SET plan_cache_mode = force_custom_plan;</pre>`, scenarios: [stale, corr, generic] };
})();
