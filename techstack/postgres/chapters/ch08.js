/* Chapter 8 "Sort and Hash Join under work_mem": three bespoke scenes plus the Explain text (index 8, zero-based).
   Loads after course.js and scene-kit.js. Sizes, counts and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: sizes, counts and timings are illustrative. The mechanisms are real.';

  /* ---------- 1. An external merge sort ---------- */
  const IN = 8, RUNS = 6;
  const sort = {
    id: 'spill', label: 'Sort spills to disk', desc: 'The sort input is about 400 MB, but work_mem allows 4 MB. The sort writes sorted runs to temp files, then merges them. The query succeeds, only slower.',
    codeLabel: 'SQL', code: { bug: ['SET work_mem = \'4MB\';   -- the default', 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM events ORDER BY created_at;', '-- Sort Method: external merge  Disk: 409600kB', '-- fix, for this report only', 'SET LOCAL work_mem = \'512MB\';  -- Sort Method: quicksort  Memory: ...'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Sort node · work_mem = ' + (s.big ? '512 MB' : '4 MB'), right: s.r || '' }),
      setup(kit) {
        const inp = Object.values(kit.strip(null, { x: 16, y: 78, items: Array.from({ length: IN }, (_, i) => ({ id: 'i' + i, label: 'in ' + (i + 1) })), w: 68, h: 30, gap: 8, tone: 'info' }));
        const mem = kit.chip(null, { x: 16, y: 126, w: 180, h: 46, label: 'sort memory', sub: '', tone: 'info' });
        const runs = Object.values(kit.strip(null, { x: 216, y: 126, items: Array.from({ length: RUNS }, (_, i) => ({ id: 'r' + i, label: 'run ' + (i + 1) })), w: 62, h: 46, gap: 6, tone: 'info' }));
        const merge = kit.chip(null, { x: 16, y: 190, w: 608, h: 34, label: '', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 16, y: 262, w: 420, labelW: 120, max: 100, items: [{ id: 'mem', label: 'memory used' }, { id: 'tmp', label: 'temp file' }], title: 'This sort (illustrative)' });
        return { inp, mem, runs, merge, bars };
      },
      frame(s, kit, R) {
        R.inp.forEach((c, i) => c.set({ tone: i < (s.read || 0) ? 'dim' : i === (s.read || 0) && s.reading ? 'cursor' : 'info' }));
        R.mem.set({ sub: s.mem || 'empty', tone: s.mT || 'info' });
        R.runs.forEach((c, i) => c.set({ show: i < (s.runs || 0), sub: s.merging ? 'read back' : 'on disk', tone: s.merging ? 'cursor' : 'warn' }));
        R.merge.set({ show: !!s.mg, label: s.mg || '', tone: s.mgT || 'info' });
        R.bars.set('mem', s.mb || 0, 'ok', s.mbL || '0'); R.bars.set('tmp', s.tb || 0, s.tb > 30 ? 'warn' : 'ok', s.tbL || '0');
      }
    },
    bug: [
      { log: 'The sort receives about 400 MB of rows, in eight chunks of 50 MB (illustrative). The default work_mem gives this node 4 MB.', callout: '400 MB of input, a 4 MB budget', code: 0, state: { r: 'start' }, stats: [{ l: 'input', v: '~400 MB' }, { l: 'work_mem', v: '4 MB', cls: 'warn' }] },
      { log: 'The sort fills its memory with rows and sorts them in place. When the 4 MB are full, it must make room.', callout: 'Memory fills up', code: 1, state: { read: 0, reading: true, mem: '4 MB · full', mT: 'warn', mb: 100, mbL: '4 MB', r: 'memory full' }, stats: [{ l: 'memory used', v: '4 MB', cls: 'warn' }] },
      { log: 'It writes the sorted batch to a temp file as one sorted run, empties its memory and reads the next rows. This repeats until the input is finished.', callout: 'Write a sorted run, start again', moment: true, code: 1, state: { read: 3, reading: true, mem: 'refilling', mT: 'cursor', runs: 3, mb: 100, mbL: '4 MB', tb: 38, tbL: '150 MB', r: 'spilling' }, stats: [{ l: 'runs on disk', v: '3', cls: 'warn' }] },
      { log: 'All the input is read. The memory held at most 4 MB the whole time, and the rest sits on disk in sorted runs.', callout: 'The input is done; the data is on disk', code: 1, state: { read: 8, mem: 'last run', mT: 'info', runs: 6, mb: 100, mbL: '4 MB', tb: 100, tbL: '400 MB', r: 'runs written' }, stats: [{ l: 'temp file', v: '~400 MB', cls: 'bad' }] },
      { log: 'The runs are merged. Each run is read back, a few at a time, and the smallest row of each is emitted. A very large sort may need extra merge passes.', callout: 'Merge: every row is read back from disk', code: 2, state: { read: 8, runs: 6, merging: true, mg: 'merge: smallest row of each run first', mgT: 'cursor', mb: 100, mbL: '4 MB', tb: 100, tbL: '400 MB', r: 'merge' }, stats: [{ l: 'rows', v: 'written once, read once', cls: 'warn' }] },
      { log: 'The sort finishes, correct but slow: most of its time went to disk I/O. For this report only, SET LOCAL work_mem = 512MB keeps the whole sort in memory with quicksort.', callout: 'Fix: a bigger budget for this report only', code: 4, state: { read: 8, big: true, mem: '400 MB · quicksort', mT: 'ok', mb: 80, mbL: '400 MB', tb: 0, tbL: '0', mg: 'Sort Method: quicksort  Memory: 400 MB', mgT: 'ok', r: 'in memory' }, stats: [{ l: 'temp file', v: '0', cls: 'ok' }, { l: 'Sort Method', v: 'quicksort', cls: 'ok' }],
        takeaway: 'work_mem decides whether a sort stays in memory. A spill is slower but never wrong.' },
    ],
  };

  /* ---------- 2. Hash join batches ---------- */
  const NB = 16;
  const hash = {
    id: 'batches', label: 'Hash join batches', desc: 'If the build side is bigger than the hash budget, both inputs are split into batches on disk, and the join runs one batch at a time.',
    codeLabel: 'SQL', code: { bug: ['EXPLAIN (ANALYZE) SELECT * FROM events e JOIN customers c ON c.id = e.customer_id;', '-- Hash  Buckets: 131072  Batches: 16  Memory Usage: 8192kB', '-- fix the estimate, then if needed raise the budget for this query', 'ANALYZE customers;', 'SET LOCAL work_mem = \'128MB\';   -- Batches: 1'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Hash Join · build side 100 MB · budget 8 MB', right: s.r || '' }),
      setup(kit) {
        const bld = kit.chip(null, { x: 16, y: 78, w: 290, h: 46, label: 'Build side: customers', sub: '', tone: 'info' });
        const bud = kit.chip(null, { x: 334, y: 78, w: 290, h: 46, label: 'Hash budget', sub: 'work_mem 4 MB × multiplier 2 = 8 MB', tone: 'info' });
        const bt = Object.values(kit.strip(null, { x: 16, y: 150, items: Array.from({ length: NB }, (_, i) => ({ id: 'b' + i, label: 'b' + i })), w: 32, h: 34, gap: 6, tone: 'info' }));
        const bars = kit.bars(null, { x: 16, y: 216, w: 420, labelW: 120, max: 16, items: [{ id: 'bat', label: 'Batches' }, { id: 'tmp', label: 'temp written' }], title: 'EXPLAIN (ANALYZE) on the Hash node' });
        const res = kit.chip(null, { x: 16, y: 286, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { bld, bud, bt, bars, res };
      },
      frame(s, kit, R) {
        const nb = s.nb || 1;
        R.bld.set({ sub: s.bld || '', tone: s.bT || 'info' }); R.bud.set({ tone: s.bdT || 'info' });
        R.bt.forEach((c, i) => c.set({ show: i < nb, sub: '', tone: s.cur === i ? 'cursor' : s.done != null && i < s.done ? 'ok' : i === 0 ? 'live' : 'warn' }));
        R.bars.set('bat', nb, nb > 1 ? 'warn' : 'ok', String(nb)); R.bars.set('tmp', s.tmp || 0, s.tmp ? 'warn' : 'ok', s.tmpL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A hash join first builds an in-memory hash table from its smaller input, then probes it with each row of the other. Here the build side is 100 MB, but the hash budget is 8 MB.', callout: 'Build side 100 MB, budget 8 MB', code: 0, state: { nb: 1, bld: '100 MB (the estimate said less)', bT: 'warn', r: 'plan' }, stats: [{ l: 'build side', v: '100 MB', cls: 'warn' }, { l: 'budget', v: '8 MB', cls: 'warn' }] },
      { log: 'The table cannot fit, so the executor splits both inputs into 16 batches by hash value. A row can only match rows in its own batch.', callout: 'Both inputs are split into 16 batches', moment: true, code: 1, state: { nb: 16, bld: '100 MB · 16 batches', bT: 'warn', bdT: 'warn', r: 'batching' }, stats: [{ l: 'Batches', v: '16', cls: 'warn' }] },
      { log: 'Batch 0 stays in memory. Rows of the other 15 batches are written to temp files, from both the build side and the probe side.', callout: 'Batch 0 in memory, 15 batches on disk', code: 1, state: { nb: 16, tmp: 80, tmpL: '~200 MB', bT: 'warn', bdT: 'warn', r: 'spill' }, stats: [{ l: 'temp written', v: '~200 MB', cls: 'bad' }] },
      { log: 'The join then runs one batch at a time: read its build rows into the hash table, read its probe rows, emit matches, move on.', callout: 'One batch at a time', code: 1, state: { nb: 16, cur: 5, done: 5, tmp: 80, tmpL: '~200 MB', bT: 'warn', bdT: 'warn', r: 'batch 5 of 16' }, stats: [{ l: 'current batch', v: '5 / 16', cls: 'warn' }] },
      { log: 'The Hash node reports Batches: 16 and the time is mostly temp I/O. The deeper cause is often the estimate: the planner thought the build side was small.', callout: 'Batches: 16 in EXPLAIN (ANALYZE)', code: 1, state: { nb: 16, done: 16, tmp: 80, tmpL: '~200 MB', res: 'Hash  Batches: 16  Memory Usage: 8192kB  (the estimate said 1 batch)', resTone: 'bad', r: 'done' }, stats: [{ l: 'Batches', v: '16', cls: 'bad' }] },
      { log: 'Fix the estimate first with ANALYZE. If the data really is that big, raise work_mem for this query only. One batch fits in memory and the temp files disappear.', callout: 'Fix: ANALYZE, then a bigger budget for this query', code: 4, state: { nb: 1, bld: '100 MB', bT: 'ok', bdT: 'ok', res: 'Hash  Batches: 1  Memory Usage: 105000kB', resTone: 'ok', r: 'one batch' }, stats: [{ l: 'Batches', v: '1', cls: 'ok' }, { l: 'temp written', v: '0', cls: 'ok' }],
        takeaway: 'Batches mean the hash table did not fit. Check the row estimate before raising the budget.' },
    ],
  };

  /* ---------- 3. work_mem multiplies ---------- */
  const mult = {
    id: 'oom', label: 'The budget multiplies', desc: 'work_mem is a budget per sort or hash node, per session. Raised for the whole server, the total can exceed the host memory.',
    codeLabel: 'postgresql.conf', code: { bug: ['work_mem = 256MB          # looks harmless', '# 256 MB × 3 nodes × 300 sessions = 225 GB (illustrative)', '# host memory: 64 GB', '# fix: keep the global value small', 'work_mem = 4MB', '-- and raise it for one report only', 'SET LOCAL work_mem = \'512MB\';'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'host memory 64 GB (illustrative)', right: s.r || '' }),
      setup(kit) {
        const f1 = kit.chip(null, { x: 16, y: 78, w: 190, h: 46, label: 'work_mem', sub: '', tone: 'info' });
        const f2 = kit.chip(null, { x: 224, y: 78, w: 190, h: 46, label: 'nodes per query', sub: '', tone: 'info' });
        const f3 = kit.chip(null, { x: 432, y: 78, w: 192, h: 46, label: 'sessions', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 164, w: 608, labelW: 130, max: 240, items: [{ id: 'node', label: 'one node' }, { id: 'sess', label: 'one session' }, { id: 'all', label: 'all sessions' }, { id: 'host', label: 'host memory' }], title: 'Worst case memory demand (GB)', rowH: 28 });
        const res = kit.chip(null, { x: 16, y: 306, w: 608, h: 32, label: '', tone: 'info', show: false });
        return { f1, f2, f3, bars, res };
      },
      frame(s, kit, R) {
        R.f1.set({ sub: s.w || '', tone: s.wT || 'info' }); R.f2.set({ sub: s.n || '', tone: s.nT || 'info' }); R.f3.set({ sub: s.c || '', tone: s.cT || 'info' });
        const b = s.b || {};
        R.bars.set('node', b.node || 0, 'ok', b.nodeL || '0'); R.bars.set('sess', b.sess || 0, 'ok', b.sessL || '0');
        R.bars.set('all', b.all || 0, b.all > 64 ? 'bad' : 'ok', b.allL || '0'); R.bars.set('host', 64, 'warn', '64 GB');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The team raises work_mem to 256 MB for the whole server, because one report was slow. It looks like a single setting.', callout: 'work_mem = 256 MB, server wide', code: 0, state: { w: '256 MB', wT: 'warn', b: { node: 1, nodeL: '0.25' }, r: 'the setting' }, stats: [{ l: 'work_mem', v: '256 MB', cls: 'warn' }] },
      { log: 'The budget is for each sort or hash node, not for the query. A query with three memory-hungry nodes may use three times as much.', callout: 'The budget is per node', code: 1, state: { w: '256 MB', n: '3', nT: 'warn', b: { node: 1, nodeL: '0.25', sess: 3, sessL: '0.75' }, r: 'per query' }, stats: [{ l: 'per session', v: '768 MB', cls: 'warn' }] },
      { log: 'The server has 300 busy sessions. Each may run such a query at the same time, and parallel workers get their own budget as well.', callout: '300 sessions run at the same time', code: 1, state: { w: '256 MB', n: '3', c: '300', cT: 'warn', b: { node: 1, nodeL: '0.25', sess: 3, sessL: '0.75', all: 100, allL: '225 GB' }, r: 'all sessions' }, stats: [{ l: 'worst case', v: '225 GB', cls: 'bad' }, { l: 'host', v: '64 GB' }] },
      { log: 'The demand is more than three times the host memory. The kernel runs out of memory and its OOM killer picks a process to kill.', callout: 'Demand is far above the host memory', moment: true, code: 2, state: { w: '256 MB', n: '3', c: '300', cT: 'warn', wT: 'warn', nT: 'warn', b: { node: 1, nodeL: '0.25', sess: 3, sessL: '0.75', all: 100, allL: '225 GB' }, res: 'the kernel OOM killer ends a backend', resTone: 'bad', r: 'OOM' }, stats: [{ l: 'result', v: 'backend killed', cls: 'bad' }] },
      { log: 'When any backend dies abnormally, the postmaster restarts every backend to protect shared memory. All 300 connections drop at once.', callout: 'One killed backend drops every connection', code: 2, state: { w: '256 MB', n: '3', c: '300', b: { node: 1, nodeL: '0.25', sess: 3, sessL: '0.75', all: 100, allL: '225 GB' }, res: 'crash recovery · all connections reset', resTone: 'bad', r: 'restart' }, stats: [{ l: 'connections', v: 'all reset', cls: 'bad' }] },
      { log: 'The fix is to keep the global value small, cap the sessions with a pooler, and raise work_mem for the one report that needs it, with SET LOCAL or ALTER ROLE.', callout: 'Fix: small globally, big for one report', code: 4, state: { w: '4 MB', wT: 'ok', n: '3', c: '100 (pooled)', cT: 'ok', b: { node: 1, nodeL: '4 MB', sess: 1, sessL: '12 MB', all: 8, allL: '1.2 GB' }, res: 'worst case 1.2 GB; the report asks for 512 MB with SET LOCAL', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'worst case', v: '1.2 GB', cls: 'ok' }],
        takeaway: 'Total memory is roughly work_mem × nodes × sessions. Keep the global value small.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[8] = { explain: `
<h3>1. A memory budget for each operation</h3>
<p>Data is often larger than memory, but a query must still return a correct answer. PostgreSQL gives each sort or hash operation a fixed memory budget, <code>work_mem</code>. When the input is larger than the budget, the operation breaks the work into pieces, writes the pieces to disk, and combines them. The query is slower, not wrong.</p>
<figure class="hd" aria-label="Flowchart: what a sort does with its budget">
  <div class="hd-flow"><div class="hd-node">Sort input arrives</div><div class="hd-down">↓</div><div class="hd-node dec">Does it fit in work_mem?</div><div class="hd-down">↓</div><div class="hd-row"><div class="hd-node ok">Yes: quicksort in memory</div><span class="hd-arr">→</span><div class="hd-node warn">No: write sorted runs to temp files</div></div><div class="hd-down">↓</div><div class="hd-node">Merge the runs (external merge)</div></div>
  <figcaption>The budget is per node. A spill is slower, never wrong.</figcaption>
</figure>

<h3>2. What the budget covers</h3>
<p><code>work_mem</code> is the budget for each sort or hash operation. It is not a budget per query or per server. One query can have several such nodes, and each parallel worker gets its own budget. Hash-based operations may use up to <code>work_mem * hash_mem_multiplier</code>, and the multiplier defaults to 2.0 in PostgreSQL 16 and 17.</p>

<h3>3. External merge sort</h3>
<p>The sort fills memory and writes a sorted run to a temporary file. It repeats until the input is read, then merges the runs. A merge reads a bounded number of runs at once, so a very large sort may need extra passes. <code>EXPLAIN (ANALYZE)</code> shows <code>Sort Method: external merge  Disk: …kB</code> instead of <code>quicksort  Memory: …kB</code>. A <code>LIMIT</code> over the sort switches to a top-N heapsort, which needs only N rows of memory.</p>

<h3>4. Hash join batches</h3>
<p>If the build side is larger than the hash budget, both inputs are split into batches on disk. Rows can only match rows in their own batch, so the join runs one batch at a time. The Hash node shows <code>Batches: n</code>. A count above 1 means the table did not fit. Because the planner chose the build side from its estimate, a stale estimate (chapter 8) is often the real cause of a spill.</p>

<h3>5. The multiplication, and the trade-off</h3>
<p>Total memory is roughly <code>work_mem</code> times the number of memory-hungry nodes times the number of concurrent sessions. That product is why the safe server-wide value is small. A large <code>work_mem</code> keeps sorts and hashes in memory and removes disk I/O. A small one protects the host from memory overcommit, at the cost of spilling. Raise it per role or per transaction for the few queries that need it, and fix the estimate or the index that causes the large sort. Temp files count against <code>temp_file_limit</code> if it is set, and they are logged when <code>log_temp_files</code> is enabled.</p>

<h3>6. Syntax</h3>
<pre>-- is this sort spilling? read the Sort Method and Batches lines
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM events ORDER BY created_at;

-- log every temp file (0 = all sizes), to find the guilty queries
ALTER SYSTEM SET log_temp_files = 0;
SELECT pg_reload_conf();

-- raise the budget for one transaction only
BEGIN;
SET LOCAL work_mem = '512MB';
-- ... the report ...
COMMIT;

-- or for one role
ALTER ROLE reporting SET work_mem = '256MB';

-- cap the damage of a runaway query
ALTER ROLE reporting SET temp_file_limit = '20GB';

-- cheaper than memory: let an index deliver the order
CREATE INDEX CONCURRENTLY events_created_idx ON events (created_at);</pre>`, scenarios: [sort, hash, mult] };
})();
