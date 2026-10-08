/* Chapter 0 "SQL, Parser and Catalog": three bespoke scenes plus the Explain text (index 0, zero-based).
   Loads after course.js and scene-kit.js. All counts are illustrative; the order of the stages is PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: stage costs and counts are illustrative. The stage order is real.';
  const STAGES = [['Parser', 'grammar only'], ['Analyzer', 'binds names'], ['Rewriter', 'views, rules'], ['Planner', 'cheapest plan'], ['Executor', 'reads pages']];

  /* The pipeline row, shared by the first two scenes: 5 stage chips, a catalog ledger, a work meter and a result line. */
  function pipelineSetup(kit, catRows) {
    const chips = STAGES.map(([t, s], i) => kit.chip(null, { x: 16 + i * 120, y: 76, w: 108, h: 48, label: t, sub: s, tone: 'info' }));
    const led = kit.ledger(null, { x: 16, y: 146, w: 300, title: 'pg_attribute · orders', cols: [{ label: 'attnum', w: 54 }, { label: 'attname', w: 130 }, { label: 'type', w: 100 }], rows: 4, rowH: 16 });
    catRows.forEach((r, i) => led.setRow(i, r));
    const bars = kit.bars(null, { x: 340, y: 188, w: 284, labelW: 80, max: 10, items: [{ id: 'cat', label: 'catalog' }, { id: 'pages', label: 'data pages' }], title: 'Work done so far' });
    const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
    return { chips, led, bars, res };
  }
  function pipelineFrame(s, R) {
    const at = s.at == null ? -1 : s.at, fail = s.fail == null ? -1 : s.fail;
    R.chips.forEach((c, i) => c.set({ tone: i < at ? 'ok' : i === at ? (fail === at ? 'bad' : 'cursor') : fail >= 0 ? 'dim' : 'info' }));
    R.bars.set('cat', s.lookups || 0, s.lookups ? 'warn' : 'ok', String(s.lookups || 0));
    R.bars.set('pages', s.pages || 0, s.pages ? 'warn' : 'ok', String(s.pages || 0));
    R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
  }

  const CAT = [['1', 'id', 'bigint'], ['2', 'customer_id', 'bigint'], ['3', 'status', 'text'], ['4', 'amount', 'numeric']];
  const CAT2 = [['1', 'id', 'bigint'], ['2', 'user_id', 'bigint'], ['3', 'status', 'text'], ['4', 'amount', 'numeric']];

  /* ---------- 1. A valid query goes through every stage ---------- */
  const valid = {
    id: 'valid', label: 'A valid query', desc: 'One SELECT with a correct name. Watch the five stages in order, and see where the first data page is read.',
    codeLabel: 'SQL', code: { bug: ['SELECT id, amount FROM orders WHERE id = 42;', '-- 1 parse · 2 analyze · 3 rewrite · 4 plan · 5 execute'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'query path · PostgreSQL 16 and 17', right: s.r || '' }),
      setup(kit) { return pipelineSetup(kit, CAT); },
      frame(s, kit, R) { pipelineFrame(s, R); R.led.hl(0, s.row === 0); R.led.hl(3, s.row === 3); R.led.hl(1, false); }
    },
    bug: [
      { log: 'The client sends one SELECT as plain text. The server has not checked anything yet.', callout: 'Text arrives; nothing is checked yet', code: 0, state: { at: -1, r: 'text received' }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The parser checks the grammar and builds a raw parse tree. It never looks at a table.', callout: 'Parser: grammar only', code: 0, state: { at: 0, r: 'parse' }, stats: [{ l: 'catalog lookups', v: '0', cls: 'ok' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The analyzer binds every name through the catalogs: orders in pg_class, then id and amount in pg_attribute.', callout: 'Analyzer: names are bound through the catalogs', code: 0, state: { at: 1, row: 3, lookups: 3, r: 'analyze' }, stats: [{ l: 'catalog lookups', v: '3', cls: 'warn' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The rewriter expands views and rules. orders is a plain table, so nothing changes.', callout: 'Rewriter: views and rules expand here', code: 0, state: { at: 2, lookups: 3, r: 'rewrite' }, stats: [{ l: 'catalog lookups', v: '3', cls: 'warn' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The planner picks the cheapest plan from statistics. Still no data page has been touched.', callout: 'Planner: choose a plan, still no data read', code: 0, state: { at: 3, lookups: 3, r: 'plan' }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The executor is the first stage that reads data pages. Here an index lookup reads a few pages (illustrative).', callout: 'Executor: the first data page is read here', moment: true, code: 0, state: { at: 4, lookups: 3, pages: 4, res: 'rows returned', resTone: 'ok', r: 'execute' }, stats: [{ l: 'data pages read', v: '4', cls: 'warn' }],
        takeaway: 'Cheap checks come first. Only the executor reads data pages.' },
    ],
  };

  /* ---------- 2. An unknown column stops in the analyzer ---------- */
  const unknown = {
    id: 'unknown-col', label: 'Unknown column', desc: 'The deploy renamed customer_id to user_id. A server that still sends the old name fails before any page is read.',
    codeLabel: 'SQL', code: { bug: ['-- migration at 14:05 (illustrative)', 'ALTER TABLE orders RENAME COLUMN customer_id TO user_id;', '-- old app server still sends the old name', 'SELECT customer_id FROM orders;', 'ERROR 42703: column "customer_id" does not exist'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'old SQL against a renamed column', right: s.r || '' }),
      setup(kit) { const R = pipelineSetup(kit, CAT); return R; },
      frame(s, kit, R) {
        pipelineFrame(s, R);
        const renamed = s.renamed;
        R.led.setRow(1, renamed ? ['2', 'user_id', 'bigint'] : ['2', 'customer_id', 'bigint'], { hl: s.row === 1, tones: [null, renamed ? 'ok' : null, null] });
      }
    },
    bug: [
      { log: 'The orders table has a column called customer_id. Old and new app servers both run against it.', callout: 'Before the deploy: customer_id exists', code: 0, state: { r: 'before deploy' }, stats: [{ l: 'column', v: 'customer_id' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The 14:05 migration renames the column. Only the system catalog changes; the pg_attribute row now says user_id.', callout: 'The migration rewrites one catalog row', code: 1, state: { renamed: true, row: 1, r: 'renamed' }, stats: [{ l: 'column', v: 'user_id', cls: 'warn' }] },
      { log: 'An old server sends SELECT customer_id FROM orders. The parser accepts it, because the grammar is valid.', callout: 'Parser accepts it: the grammar is fine', code: 3, state: { renamed: true, at: 0, r: 'old SQL arrives' }, stats: [{ l: 'catalog lookups', v: '0', cls: 'ok' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The analyzer looks up customer_id in pg_attribute for orders. There is no such row any more.', callout: 'Analyzer: no row named customer_id', code: 3, state: { renamed: true, at: 1, row: 1, lookups: 2, r: 'bind name', fail: -1 }, stats: [{ l: 'catalog lookups', v: '2', cls: 'warn' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The analyzer raises SQLSTATE 42703. The rewriter, planner and executor never run, so no page is read.', callout: 'ERROR 42703, zero pages read', moment: true, code: 4, state: { renamed: true, at: 1, fail: 1, lookups: 2, res: 'ERROR 42703: column "customer_id" does not exist', resTone: 'bad', r: 'rejected' }, stats: [{ l: 'SQLSTATE', v: '42703', cls: 'bad' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'That is why CPU and disk graphs stay flat while the error rate climbs: failing early is cheap, and nothing is wrong with the load.', callout: 'Flat graphs, rising errors', code: 4, state: { renamed: true, at: 1, fail: 1, lookups: 2, res: 'errors rise, CPU and disk stay flat', resTone: 'warn', r: 'rejected' }, stats: [{ l: 'CPU', v: 'flat', cls: 'ok' }, { l: 'errors', v: 'rising', cls: 'bad' }],
        takeaway: 'A wrong name fails in the analyzer, at the price of a few catalog lookups.' },
    ],
  };

  /* ---------- 3. A prepared statement keeps the row shape it was analyzed with ---------- */
  const prep = {
    id: 'prepared', label: 'Prepared plan after ALTER', desc: 'A prepared statement stores the row shape it was analyzed with. After a column is added, EXECUTE fails until the connection re-prepares.',
    codeLabel: 'SQL', code: { bug: ['PREPARE q AS SELECT * FROM orders WHERE id = $1;', 'ALTER TABLE orders ADD COLUMN coupon text;', 'EXECUTE q(42);', 'ERROR: cached plan must not change result type', '-- fix: PREPARE q AS SELECT id, status, amount FROM orders WHERE id = $1;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'plan cache vs catalog', right: s.r || '' }),
      setup(kit) {
        const cache = kit.panel(null, { x: 16, y: 76, w: 296, h: 120, title: 'Plan cache · this connection', tone: 'info' });
        const cat = kit.panel(null, { x: 328, y: 76, w: 296, h: 120, title: 'Catalog · orders', tone: 'info' });
        const c1 = kit.chip(null, { x: 32, y: 112, w: 264, h: 36, label: 'q: SELECT *', sub: 'result row type: 4 columns', tone: 'info', show: false });
        const c2 = kit.chip(null, { x: 344, y: 112, w: 264, h: 36, label: 'orders: 4 columns', sub: 'id, user_id, status, amount', tone: 'info' });
        const check = kit.chip(null, { x: 16, y: 218, w: 608, h: 36, label: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 266, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { cache, cat, c1, c2, check, res };
      },
      frame(s, kit, R) {
        R.c1.set({ show: !!s.prepared, label: s.cols ? 'q: SELECT id, status, amount' : 'q: SELECT *', sub: 'result row type: ' + (s.cols ? '3' : '4') + ' columns', tone: s.c1 || 'info' });
        R.c2.set({ label: 'orders: ' + (s.added ? '5' : '4') + ' columns', sub: s.added ? 'id, user_id, status, amount, coupon' : 'id, user_id, status, amount', tone: s.added ? 'warn' : 'info' });
        R.check.set({ show: !!s.check, label: s.check || '', tone: s.checkTone || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The app prepares the statement once per pooled connection. PostgreSQL analyzes it and stores the result row type: 4 columns.', callout: 'PREPARE stores the analyzed statement', code: 0, state: { prepared: true, r: 'PREPARE' }, stats: [{ l: 'columns in cached result', v: '4' }] },
      { log: 'A migration adds the column coupon. The catalog now says 5 columns, but this connection still holds the old statement.', callout: 'The catalog changes; the cache does not', code: 1, state: { prepared: true, added: true, r: 'ALTER TABLE' }, stats: [{ l: 'columns in cached result', v: '4' }, { l: 'columns in table', v: '5', cls: 'warn' }] },
      { log: 'The next request runs EXECUTE. PostgreSQL first checks whether the objects the statement depends on have changed.', callout: 'EXECUTE: revalidate against the catalog', code: 2, state: { prepared: true, added: true, check: 'revalidate: the table changed, re-analyze', checkTone: 'cursor', c1: 'cursor', r: 'EXECUTE' }, stats: [{ l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'Re-analysis of SELECT * now returns 5 columns, but the client was told 4. PostgreSQL cannot change the row shape it already described.', callout: 'New shape: 5 columns; the client expects 4', moment: true, code: 2, state: { prepared: true, added: true, check: '5 columns now, 4 expected', checkTone: 'bad', c1: 'bad', r: 'shape mismatch' }, stats: [{ l: 'expected', v: '4', cls: 'warn' }, { l: 'got', v: '5', cls: 'bad' }] },
      { log: 'SQLSTATE 0A000 is raised before execution. A fresh connection prepares again and works, which is why a restart seems to cure it.', callout: 'ERROR 0A000: cached plan must not change result type', code: 3, state: { prepared: true, added: true, check: '5 columns now, 4 expected', checkTone: 'bad', c1: 'bad', res: 'ERROR 0A000: cached plan must not change result type', resTone: 'bad', r: 'rejected' }, stats: [{ l: 'SQLSTATE', v: '0A000', cls: 'bad' }, { l: 'data pages read', v: '0', cls: 'ok' }] },
      { log: 'The fix is to list the columns. The row shape is then fixed by the query text, so ADD COLUMN cannot change it.', callout: 'Fix: name the columns', code: 4, state: { prepared: true, added: true, cols: true, check: 'revalidate: same 3 columns', checkTone: 'ok', c1: 'ok', res: 'rows returned, no error', resTone: 'ok', r: 'explicit columns' }, stats: [{ l: 'columns in cached result', v: '3', cls: 'ok' }, { l: 'errors', v: '0', cls: 'ok' }],
        takeaway: 'Name the columns in prepared statements, so additive migrations cannot change the result type.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[0] = { explain: `
<h3>1. A query is checked before it is run</h3>
<p>Every query goes through a fixed pipeline before any row is read. The cheap steps come first. Parsing checks the grammar. Analysis checks every name against the system catalogs. Only after both succeed does the planner choose a plan and the executor read data pages. A wrong name therefore fails early, at the cost of a few catalog lookups, and never reaches a table scan. That is why the incident shows errors without any load.</p>
<figure class="hd" aria-label="Flowchart: the stages of the query path">
  <div class="hd-flow"><div class="hd-node">Client sends SQL text</div><div class="hd-down">↓</div><div class="hd-node">Parser: grammar only (42601)</div><div class="hd-down">↓</div><div class="hd-node warn">Analyzer: binds names through the catalogs (42P01, 42703)</div><div class="hd-down">↓</div><div class="hd-node">Rewriter: views and rules</div><div class="hd-down">↓</div><div class="hd-node">Planner: picks the cheapest plan</div><div class="hd-down">↓</div><div class="hd-node ok">Executor: the first data page is read here</div></div>
  <figcaption>Cheap checks come first, so a wrong name never reaches a table scan.</figcaption>
</figure>

<h3>2. The parser and the analyzer</h3>
<p>The <b>parser</b> turns the SQL text into a raw parse tree. It checks grammar only, so a typo such as <code>SELEC</code> fails with SQLSTATE <code>42601</code>. It never looks at a table.</p>
<p>The <b>analyzer</b> binds every table and column name through the catalogs (<code>pg_class</code>, <code>pg_attribute</code>, <code>pg_namespace</code>). Unqualified names are looked up through <code>search_path</code>, and the first match wins. An unknown table gives <code>42P01</code>, and an unknown column gives <code>42703</code>. Unquoted identifiers are folded to lower case first, which is why <code>userId</code> and <code>"userId"</code> are different names.</p>

<h3>3. The rewriter, the planner and the executor</h3>
<p>The <b>rewriter</b> expands views and rules into the query tree. The <b>planner</b> picks the cheapest plan from statistics. The <b>executor</b> is the first component that reads data pages. In the first scene the three catalog lookups cost almost nothing, and the page reads begin only in the last step.</p>

<h3>4. Prepared statements keep a row shape</h3>
<p><code>PREPARE</code> stores the analyzed query. On every <code>EXECUTE</code> PostgreSQL checks that the objects it depends on have not changed, and it re-analyzes if they did. If the result row type changed, it cannot silently change what the client was told, so it raises <code>cached plan must not change result type</code> (SQLSTATE <code>0A000</code>). The check runs before execution, so this error also reads zero pages.</p>

<h3>5. The trade-off: early checks tie a query to a shape</h3>
<p>Early checks make bad queries cheap to reject, but they tie each query to a fixed row shape. A renamed column breaks old clients that still send old SQL. An added column breaks old connections that hold a <code>SELECT *</code> prepared statement. Name columns explicitly, and change schemas in expand and contract steps: add the new column, deploy code that uses it, then drop the old one, so old and new code both work during a deploy.</p>
<p>To find which binding is wrong, ask the catalog directly. <code>to_regclass('orders')</code> shows which schema an unqualified name binds to, and <code>pg_attribute</code> lists the real column names.</p>

<h3>6. Syntax</h3>
<pre>-- which relation does an unqualified name bind to in this session?
SHOW search_path;
SELECT to_regclass('orders');

-- the real column names, as the analyzer sees them
SELECT attname FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attnum &gt; 0 AND NOT attisdropped;

-- prepared statements: list the columns instead of SELECT *
PREPARE q AS SELECT id, status, amount FROM orders WHERE id = $1;
EXECUTE q(42);

-- the cheap way to rename without breaking old servers: expand, deploy, contract
ALTER TABLE orders ADD COLUMN user_id bigint;
-- ... backfill and deploy code that uses user_id ...
ALTER TABLE orders DROP COLUMN customer_id;</pre>
<p>In PostgreSQL 16 and 17 the SQLSTATE codes above are stable: <code>42601</code> syntax error, <code>42P01</code> undefined table, <code>42703</code> undefined column, <code>0A000</code> feature not supported.</p>`, scenarios: [valid, unknown, prep] };
})();
