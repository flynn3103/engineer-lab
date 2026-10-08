/* Chapter 4 "Transactions and MVCC": three bespoke scenes plus the Explain text (index 4, zero-based).
   Loads after course.js and scene-kit.js. Transaction ids, counts and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: one row, a few versions. All numbers are illustrative.';

  /* ---------- 1. A reader sees the old version and does not wait ---------- */
  const reader = {
    id: 'reader', label: 'Reader sees the old version', desc: 'Session A updates a row and has not committed. Session B reads it. B sees the old version and never waits.',
    codeLabel: 'Two sessions', code: { bug: ['-- session A', 'BEGIN; UPDATE orders SET status = \'paid\' WHERE id = 1;  -- txid 205, not committed', '-- session B', 'SELECT status FROM orders WHERE id = 1;', '-- returns \'pending\', and does not wait', '-- session A', 'COMMIT;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'order id 1 · tuple versions in the heap', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 392, title: 'Row versions · xmin and xmax', cols: [{ label: 'version', w: 66 }, { label: 'xmin', w: 52 }, { label: 'xmax', w: 52 }, { label: 'status', w: 80 }, { label: 'note', w: 130 }], rows: 3, rowH: 18 });
        const a = kit.chip(null, { x: 424, y: 80, w: 200, h: 44, label: 'Session A', sub: 'idle', tone: 'info' });
        const b = kit.chip(null, { x: 424, y: 134, w: 200, h: 44, label: 'Session B', sub: 'idle', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 232, w: 392, labelW: 100, max: 100, items: [{ id: 'wait', label: 'B waited' }], title: 'Reader wait (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 280, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { led, a, b, bars, res };
      },
      frame(s, kit, R) {
        const rows = s.rows || [['v1', '100', '0', 'pending', 'live']];
        R.led.clear(); rows.forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i, tones: [null, null, null, null, null] }));
        R.a.set({ sub: s.a || 'idle', tone: s.aT || 'info' });
        R.b.set({ sub: s.b || 'idle', tone: s.bT || 'info' });
        R.bars.set('wait', s.waited || 0, 'ok', s.waited ? 'long' : '0 ms');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The order row has one version. xmin = 100 is the transaction that created it, and xmax = 0 means nobody has deleted or replaced it.', callout: 'One version: xmin 100, xmax 0', state: { r: 'before' }, stats: [{ l: 'versions', v: '1' }, { l: 'status', v: 'pending' }] },
      { log: 'Session A starts transaction 205 and updates the row. PostgreSQL does not overwrite: it stamps v1 with xmax = 205 and writes a new version v2 with xmin = 205.', callout: 'UPDATE writes a new version, it does not overwrite', code: 1, state: { rows: [['v1', '100', '205', 'pending', 'replaced by 205'], ['v2', '205', '0', 'paid', 'new, uncommitted']], a: 'txid 205 · in progress', aT: 'cursor', hl: 1, r: 'A updates' }, stats: [{ l: 'versions', v: '2', cls: 'warn' }, { l: 'A', v: 'not committed' }] },
      { log: 'Session B starts a SELECT. Its snapshot lists transaction 205 as still in progress, so nothing that 205 did counts yet.', callout: 'B takes a snapshot: 205 is in progress', code: 3, state: { rows: [['v1', '100', '205', 'pending', 'replaced by 205'], ['v2', '205', '0', 'paid', 'new, uncommitted']], a: 'txid 205 · in progress', aT: 'cursor', b: 'snapshot: 205 in progress', bT: 'cursor', r: 'B starts' }, stats: [{ l: 'B snapshot', v: '205 not visible' }] },
      { log: 'B checks v1. Its deleter, 205, is in progress for B, so the replacement does not count and v1 is still visible. B checks v2: its creator, 205, has not committed, so v2 is skipped.', callout: 'v1 visible, v2 skipped', moment: true, code: 3, state: { rows: [['v1', '100', '205', 'pending', 'visible to B'], ['v2', '205', '0', 'paid', 'not visible to B']], a: 'txid 205 · in progress', aT: 'cursor', b: 'reads v1', bT: 'ok', hl: 0, r: 'visibility' }, stats: [{ l: 'v1', v: 'visible', cls: 'ok' }, { l: 'v2', v: 'skipped' }] },
      { log: 'B returns pending right away. A plain SELECT takes no row lock, so there is nothing to wait for.', callout: 'B returns immediately: readers never wait', code: 4, state: { rows: [['v1', '100', '205', 'pending', 'visible to B'], ['v2', '205', '0', 'paid', 'not visible to B']], a: 'txid 205 · in progress', aT: 'cursor', b: 'got pending', bT: 'ok', hl: 0, res: 'status = pending · waited 0 ms', resTone: 'ok', r: 'result' }, stats: [{ l: 'B waited', v: '0 ms', cls: 'ok' }, { l: 'row lock taken', v: 'none', cls: 'ok' }] },
      { log: 'A commits. New snapshots see v2. v1 stays on the page until no snapshot can still need it, and then VACUUM removes it.', callout: 'After COMMIT: v2 is live, v1 waits for VACUUM', code: 6, state: { rows: [['v1', '100', '205', 'pending', 'dead soon'], ['v2', '205', '0', 'paid', 'live']], a: 'committed', aT: 'ok', b: 'finished', hl: 1, r: 'commit' }, stats: [{ l: 'dead versions', v: '1', cls: 'warn' }, { l: 'removed by', v: 'VACUUM' }],
        takeaway: 'Readers use snapshots, not locks. The cost is dead versions that VACUUM removes later.' },
    ],
  };

  /* ---------- 2. HOT updates avoid index work ---------- */
  const hot = {
    id: 'hot', label: 'HOT update vs indexed column', desc: 'An update to a non-indexed column can stay on the page without touching any index. Update an indexed column and every index gets a new entry.',
    codeLabel: 'SQL', code: { bug: ['-- index exists on status only', 'CREATE INDEX orders_status_idx ON orders (status);', '-- A: amount is not indexed, the page has room: HOT', 'UPDATE orders SET amount = 12 WHERE id = 1;', '-- B: status is indexed: a new index entry is needed', 'UPDATE orders SET status = \'paid\' WHERE id = 1;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.mode === 'idx' ? 'UPDATE of an indexed column' : 'UPDATE of a non-indexed column', right: s.r || '' }),
      setup(kit) {
        kit.panel(null, { x: 16, y: 76, w: 280, h: 118, title: 'Index on status', tone: 'info' });
        const e1 = kit.chip(null, { x: 32, y: 108, w: 248, h: 32, label: 'pending → lp1', tone: 'info', small: true });
        const e2 = kit.chip(null, { x: 32, y: 148, w: 248, h: 32, label: 'paid → lp2', tone: 'info', small: true, show: false });
        kit.panel(null, { x: 328, y: 76, w: 296, h: 160, title: 'Heap page', tone: 'info' });
        const l1 = kit.chip(null, { x: 344, y: 108, w: 264, h: 36, label: 'lp1 · v1', sub: '', tone: 'info' });
        const l2 = kit.chip(null, { x: 344, y: 152, w: 264, h: 36, label: 'lp2 · v2', sub: '', tone: 'info', show: false });
        const l3 = kit.chip(null, { x: 344, y: 196, w: 264, h: 30, label: 'free space', tone: 'info', small: true });
        const bars = kit.bars(null, { x: 16, y: 262, w: 400, labelW: 120, max: 100, items: [{ id: 'ie', label: 'index entries' }, { id: 'wal', label: 'WAL written' }], title: 'Cost of this UPDATE (illustrative)' });
        return { e1, e2, l1, l2, l3, bars };
      },
      frame(s, kit, R) {
        R.e1.set({ tone: s.e1 || 'info' }); R.e2.set({ show: !!s.e2, tone: s.e2T || 'info' });
        R.l1.set({ sub: s.l1 || 'live', tone: s.l1T || 'info', label: s.l1L || 'lp1 · v1' }); R.l2.set({ show: !!s.l2, sub: s.l2s || '', tone: s.l2T || 'info' });
        R.l3.set({ tone: s.l3 || 'info' });
        R.bars.set('ie', s.ie || 0, s.ie ? 'warn' : 'ok', String(s.ie || 0)); R.bars.set('wal', s.wal || 0, s.wal > 50 ? 'warn' : 'ok', s.walL || '0');
      }
    },
    bug: [
      { log: 'The orders page holds one version of row 1 at lp1. One index, on status, has an entry that points at lp1.', callout: 'One index entry points at lp1', state: { r: 'start' }, stats: [{ l: 'versions', v: '1' }, { l: 'index entries', v: '1' }] },
      { log: 'An UPDATE changes only amount, which no index covers, and the page has free space. The new version goes on the same page.', callout: 'Same page, no indexed column changed', code: 3, state: { mode: 'hot', l2: true, l2T: 'cursor', l2s: 'new version, same page', l3: 'cursor', r: 'HOT update' }, stats: [{ l: 'indexed column changed', v: 'no', cls: 'ok' }] },
      { log: 'lp1 now redirects to lp2 inside the page. The index entry still points at lp1 and is not touched. This is a heap-only tuple (HOT) update.', callout: 'HOT: lp1 → lp2, the index is not touched', moment: true, code: 3, state: { mode: 'hot', l1T: 'dim', l1L: 'lp1 → lp2', l1: 'redirect', l2: true, l2T: 'ok', l2s: 'live (HOT)', ie: 0, wal: 20, walL: 'small', r: 'HOT done' }, stats: [{ l: 'index entries written', v: '0', cls: 'ok' }, { l: 'WAL', v: 'small', cls: 'ok' }] },
      { log: 'Now an UPDATE changes status, which is indexed. The index must be able to find the new version by its new value.', callout: 'Now status changes, and status is indexed', code: 5, state: { mode: 'idx', l2: true, l2T: 'cursor', l2s: 'new version', r: 'indexed update' }, stats: [{ l: 'indexed column changed', v: 'yes', cls: 'warn' }] },
      { log: 'A new entry, paid → lp2, is added to the index. The old entry stays until VACUUM cleans it. Every index on the table gets a new entry for each such update.', callout: 'Every index gets a new entry', moment: true, code: 5, state: { mode: 'idx', e1: 'warn', e2: true, e2T: 'cursor', l1T: 'dim', l1: 'dead soon', l2: true, l2T: 'ok', l2s: 'live', ie: 70, wal: 80, walL: 'more', r: 'not HOT' }, stats: [{ l: 'index entries written', v: '1 per index', cls: 'warn' }, { l: 'HOT', v: 'no', cls: 'bad' }] },
      { log: 'Indexing a column that changes all the time blocks HOT updates on that table. Index size and WAL grow, and VACUUM has more to clean.', callout: 'Volatile indexed columns defeat HOT', code: 5, state: { mode: 'idx', e1: 'warn', e2: true, e2T: 'cursor', l1T: 'dim', l1: 'dead soon', l2: true, l2T: 'ok', l2s: 'live', ie: 70, wal: 80, walL: 'more', r: 'not HOT' }, stats: [{ l: 'watch', v: 'HOT ratio', cls: 'warn' }],
        takeaway: 'Do not index volatile columns, and leave free space on the page (fillfactor) for HOT.' },
    ],
  };

  /* ---------- 3. A long transaction holds its row locks ---------- */
  const lock = {
    id: 'batch-lock', label: 'Long transaction blocks checkout', desc: 'A batch updates many rows, then waits on an outside call before it commits. Checkout needs one of the locked rows and waits too.',
    codeLabel: 'SQL', code: { bug: ['-- batch job (illustrative)', 'BEGIN; UPDATE orders SET exported = true WHERE day = \'2026-10-01\';  -- 5,000 rows', '-- ... calls an external API for 30 s, then COMMIT', '-- checkout, meanwhile', 'UPDATE orders SET status = \'paid\' WHERE id = 7;  -- waits', '-- fix: commit every 500 rows'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'pg_stat_activity and the row locks', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 608, title: 'pg_stat_activity (illustrative)', cols: [{ label: 'who', w: 156 }, { label: 'state', w: 170 }, { label: 'wait event', w: 150 }, { label: 'holds', w: 132 }], rows: 3, rowH: 18 });
        const bars = kit.bars(null, { x: 16, y: 218, w: 420, labelW: 130, max: 20, items: [{ id: 'pool', label: 'pool in use' }, { id: 'wait', label: 'waiting on lock' }], title: 'Connection pool, 20 slots (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { led, bars, res };
      },
      frame(s, kit, R) {
        R.led.clear();
        (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i }));
        R.bars.set('pool', s.pool || 0, s.pool >= 20 ? 'bad' : s.pool > 10 ? 'warn' : 'ok', String(s.pool || 0));
        R.bars.set('wait', s.wait || 0, s.wait ? 'bad' : 'ok', String(s.wait || 0));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The batch opens a transaction and updates 5,000 order rows. Every updated row is locked until COMMIT.', callout: 'Updated rows stay locked until COMMIT', code: 1, state: { rows: [['batch · pid 411', 'active', '', '5,000 row locks']], pool: 3, r: 'batch runs' }, stats: [{ l: 'row locks held', v: '5,000', cls: 'warn' }] },
      { log: 'The batch now calls an external API for 30 seconds before it commits. The transaction is open and idle, and its locks stay in place.', callout: 'The batch waits on an outside call', code: 2, state: { rows: [['batch · pid 411', 'idle in transaction', 'ClientRead', '5,000 row locks']], hl: 0, pool: 3, r: 'batch idle in txn' }, stats: [{ l: 'batch state', v: 'idle in transaction', cls: 'warn' }] },
      { log: 'Checkout updates order 7, which the batch has already locked. An UPDATE of a locked row waits until the other transaction ends.', callout: 'Checkout needs row 7, locked by the batch', moment: true, code: 4, state: { rows: [['batch · pid 411', 'idle in transaction', 'ClientRead', '5,000 row locks'], ['checkout · pid 530', 'active', 'Lock: transactionid', 'waits for 411']], hl: 1, pool: 4, wait: 1, r: 'checkout waits' }, stats: [{ l: 'checkout', v: 'waiting', cls: 'bad' }, { l: 'blocked by', v: 'pid 411' }] },
      { log: 'The waiting request keeps its pool connection. More checkouts arrive and also wait on rows the batch locked, so the pool fills up.', callout: 'Waiters hold pool connections: the pool fills', code: 4, state: { rows: [['batch · pid 411', 'idle in transaction', 'ClientRead', '5,000 row locks'], ['checkout · 12 sessions', 'active', 'Lock: transactionid', 'wait for 411']], hl: 1, pool: 20, wait: 12, res: 'pool 20 / 20 · new requests queue', resTone: 'bad', r: 'pool exhausted' }, stats: [{ l: 'pool in use', v: '20 / 20', cls: 'bad' }, { l: 'waiting', v: '12', cls: 'bad' }] },
      { log: 'The fix is to commit in small batches and never hold a transaction open across an outside call. Each batch locks 500 rows for a few milliseconds.', callout: 'Fix: commit every 500 rows', code: 5, state: { rows: [['batch · pid 411', 'active', '', '500 row locks, for ms'], ['checkout · pid 530', 'active', '', 'row 7 is free']], hl: 0, pool: 4, wait: 0, res: 'locks held for milliseconds, no queue', resTone: 'ok', r: 'small batches' }, stats: [{ l: 'row locks held', v: '500', cls: 'ok' }, { l: 'waiting', v: '0', cls: 'ok' }],
        takeaway: 'A transaction holds its row locks for its whole life, so keep transactions short.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[4] = { explain: `
<h3>1. Rows are versions, not slots</h3>
<p>PostgreSQL does not overwrite a row in place. An <code>UPDATE</code> writes a new version of the row and marks the old version as replaced. Each reader sees the version its snapshot allows. Readers therefore never wait for writers. Only two writers of the same row wait for each other.</p>
<figure class="hd" aria-label="Flowchart: how a reader decides which version it sees">
  <div class="hd-flow"><div class="hd-node">UPDATE: old version gets xmax, new version gets xmin</div><div class="hd-down">↓</div><div class="hd-node">Reader takes a snapshot</div><div class="hd-down">↓</div><div class="hd-node dec">Was the creator (xmin) committed before the snapshot?</div><div class="hd-down">↓</div><div class="hd-node dec">Was the deleter (xmax) absent, or not yet committed?</div><div class="hd-down">↓</div><div class="hd-node ok">This version is visible to the reader</div></div>
  <figcaption>Visibility is decided from the stamps and the snapshot. No row lock is taken.</figcaption>
</figure>

<h3>2. xmin, xmax and the snapshot</h3>
<p>Every row version (tuple) carries two stamps. <code>xmin</code> is the transaction that created it. <code>xmax</code> is the transaction that deleted or replaced it. An <code>UPDATE</code> sets <code>xmax</code> on the old version and writes a new version with its own <code>xmin</code>. A <b>snapshot</b> records the oldest running transaction, the next transaction ID to assign, and the list of transactions still in progress. A version is visible if its creator committed before the snapshot was taken and its deleter did not.</p>

<h3>3. Where commit status lives</h3>
<p>Commit status lives in the commit log, <code>pg_xact</code>. Hint bits on the tuple cache that answer, so later readers do not have to look it up again. This is why the first read after a big load can write to pages: it sets hint bits.</p>

<h3>4. HOT updates</h3>
<p>A heap-only tuple (HOT) update avoids index work. If no indexed column changes and the new version fits on the same page, PostgreSQL writes no new index entries: the old line pointer redirects to the new one inside the page. Indexing a column that changes often turns every update into a full update that adds an entry to each index. A lower <code>fillfactor</code> leaves room on the page for the new version.</p>

<h3>5. Row locks, and what they cost</h3>
<p>Row locks are recorded in the tuple. A second <code>UPDATE</code> of the same row waits for the first transaction to end, and a plain <code>SELECT</code> takes no row lock. A long transaction holds its row locks for its whole life, so every writer that needs those rows waits, and each waiter holds a pool connection while it waits. Versions let readers and writers run together, but old versions take space until VACUUM removes them (chapter 7), and <code>count(*)</code> must check each tuple's visibility.</p>
<p>To find a blocker, read <code>pg_blocking_pids(pid)</code> and the blocker's <code>xact_start</code> and <code>state</code>. A blocker that is <code>idle in transaction</code> is almost always a client that forgot to commit or is waiting on something outside the database.</p>

<h3>6. Syntax</h3>
<pre>-- the stamps on a real row
SELECT xmin, xmax, ctid, * FROM orders WHERE id = 1;

-- who blocks whom
SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by, xact_start
FROM pg_stat_activity WHERE wait_event_type = 'Lock';

-- HOT ratio for a table
SELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'orders';

-- leave room on each page for HOT updates
ALTER TABLE orders SET (fillfactor = 85);

-- cut off stuck sessions
ALTER ROLE app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app SET lock_timeout = '5s';</pre>`, scenarios: [reader, hot, lock] };
})();
