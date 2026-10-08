/* Chapter 10 "Isolation and Deadlocks": four bespoke scenes plus the Explain text (index 10, zero-based).
   Loads after course.js and scene-kit.js. Balances, ids and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: balances, ids and timings are illustrative. The rules are real.';

  /* ---------- 1. Opposite lock order ---------- */
  const dead = {
    id: 'deadlock', label: 'Opposite lock order', desc: 'Two transfers lock the same two accounts in opposite order. Each waits for the lock the other holds, until deadlock_timeout lets the detector abort one.',
    codeLabel: 'SQL', code: { bug: ['-- transfer A', 'BEGIN; UPDATE accounts SET balance = balance - 50 WHERE id = 1;', '        UPDATE accounts SET balance = balance + 50 WHERE id = 2;  -- waits', '-- transfer B, at the same time', 'BEGIN; UPDATE accounts SET balance = balance - 20 WHERE id = 2;', '        UPDATE accounts SET balance = balance + 20 WHERE id = 1;  -- waits', '-- fix: lock in a consistent order'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'two transactions, two accounts', right: s.r || '' }),
      setup(kit) {
        const a = kit.chip(null, { x: 16, y: 82, w: 170, h: 54, label: 'Transfer A', sub: '', tone: 'info' });
        const b = kit.chip(null, { x: 454, y: 82, w: 170, h: 54, label: 'Transfer B', sub: '', tone: 'info' });
        const a1 = kit.chip(null, { x: 232, y: 74, w: 176, h: 38, label: 'account 1', sub: '', tone: 'info' });
        const a2 = kit.chip(null, { x: 232, y: 118, w: 176, h: 38, label: 'account 2', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 190, w: 400, labelW: 150, max: 100, items: [{ id: 'wait', label: 'A and B waiting' }], title: 'Wait (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 244, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { a, b, a1, a2, bars, res };
      },
      frame(s, kit, R) {
        R.a.set({ sub: s.a || '', tone: s.aT || 'info' }); R.b.set({ sub: s.b || '', tone: s.bT || 'info' });
        R.a1.set({ sub: s.a1 || 'free', tone: s.a1T || 'info' }); R.a2.set({ sub: s.a2 || 'free', tone: s.a2T || 'info' });
        R.bars.set('wait', s.w || 0, s.w >= 100 ? 'bad' : 'warn', s.wL || '0 s');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'Transfer A debits account 1, so it locks that row. Transfer B debits account 2 at the same moment, so it locks the other row.', callout: 'Each transfer holds one lock', code: 1, state: { a: 'holds account 1', aT: 'ok', b: 'holds account 2', bT: 'ok', a1: 'locked by A', a1T: 'ok', a2: 'locked by B', a2T: 'ok', r: 'first locks' }, stats: [{ l: 'A holds', v: 'account 1' }, { l: 'B holds', v: 'account 2' }] },
      { log: 'A now credits account 2, which B holds, so A waits. B credits account 1, which A holds, so B waits. Each waits for the other.', callout: 'A waits for B, and B waits for A', moment: true, code: 2, state: { a: 'waits for account 2', aT: 'warn', b: 'waits for account 1', bT: 'warn', a1: 'locked by A', a1T: 'ok', a2: 'locked by B', a2T: 'ok', w: 30, wL: '0.3 s', r: 'cycle' }, stats: [{ l: 'wait-for cycle', v: 'A → B → A', cls: 'bad' }] },
      { log: 'The cycle never ends by itself. Both keep their locks and wait. Other transfers that need these two accounts queue up behind them.', callout: 'Nothing can move on its own', code: 2, state: { a: 'waits for account 2', aT: 'warn', b: 'waits for account 1', bT: 'warn', a1: 'locked by A', a1T: 'ok', a2: 'locked by B', a2T: 'ok', w: 90, wL: '0.9 s', r: 'stuck' }, stats: [{ l: 'waiting', v: 'forever', cls: 'bad' }] },
      { log: 'After deadlock_timeout (1 s by default) one waiter checks the wait-for graph. It finds the cycle.', callout: 'deadlock_timeout: run the detector', code: 2, state: { a: 'detector runs', aT: 'cursor', b: 'waits for account 1', bT: 'warn', a1: 'locked by A', a1T: 'ok', a2: 'locked by B', a2T: 'ok', w: 100, wL: '1 s', r: 'detect' }, stats: [{ l: 'deadlock_timeout', v: '1 s' }] },
      { log: 'One transaction in the cycle is aborted with SQLSTATE 40P01, ERROR: deadlock detected. The other gets its lock and proceeds.', callout: 'One is aborted, the other proceeds', code: 4, state: { a: 'aborted · 40P01', aT: 'warn', b: 'proceeds', bT: 'ok', a1: 'free', a2: 'locked by B', a2T: 'ok', w: 0, wL: '0 s', res: 'ERROR: deadlock detected (SQLSTATE 40P01), the app must retry', resTone: 'bad', r: 'broken' }, stats: [{ l: 'failed', v: '1 transfer', cls: 'bad' }] },
      { log: 'The fix is a consistent order: both transfers lock the lower account id first, so one of them always waits for the other and no cycle can form.', callout: 'Fix: lock in a consistent order', code: 6, state: { a: 'locks 1, then 2', aT: 'ok', b: 'waits, then locks 1, 2', bT: 'cursor', a1: 'locked by A', a1T: 'ok', a2: 'locked by A', a2T: 'ok', res: 'SELECT ... WHERE id IN (1, 2) ORDER BY id FOR UPDATE', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'cycle', v: 'impossible', cls: 'ok' }],
        takeaway: 'A deadlock needs a cycle. A consistent lock order makes a cycle impossible.' },
    ],
  };

  /* ---------- 2. A lost update from read-modify-write ---------- */
  const lost = {
    id: 'lost-update', label: 'Read-modify-write lost update', desc: 'Two transactions read the same balance, then each writes a value computed from that stale read. Read Committed does not stop the second write.',
    codeLabel: 'SQL', code: { bug: ['-- both deposits: read, compute in the app, write', 'SELECT balance FROM accounts WHERE id = 1;          -- 100', 'UPDATE accounts SET balance = 150 WHERE id = 1;       -- T1 (+50)', 'UPDATE accounts SET balance = 130 WHERE id = 1;       -- T2 (+30)', '-- fix: one atomic statement', 'UPDATE accounts SET balance = balance + 30 WHERE id = 1;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'account 1 · two deposits (+50 and +30)', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 608, title: 'Timeline', cols: [{ label: 'step', w: 60 }, { label: 'T1 (+50)', w: 200 }, { label: 'T2 (+30)', w: 200 }, { label: 'balance in the table', w: 130 }], rows: 5, rowH: 18 });
        const exp = kit.chip(null, { x: 16, y: 218, w: 290, h: 40, label: 'Expected', sub: '100 + 50 + 30 = 180', tone: 'info' });
        const got = kit.chip(null, { x: 334, y: 218, w: 290, h: 40, label: 'Final balance', sub: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 274, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { led, exp, got, res };
      },
      frame(s, kit, R) {
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i }));
        R.got.set({ show: !!s.fin, sub: s.fin || '', tone: s.fT || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'Both transactions read the balance, 100, into application memory. Under Read Committed neither takes a lock by reading.', callout: 'Both read 100', code: 1, state: { rows: [['1', 'read → 100', 'read → 100', '100']], hl: 0, r: 'read' }, stats: [{ l: 'balance', v: '100' }] },
      { log: 'T1 computes 100 + 50 = 150, writes it and commits.', callout: 'T1 writes 150 and commits', code: 2, state: { rows: [['1', 'read → 100', 'read → 100', '100'], ['2', 'UPDATE = 150, commit', '', '150']], hl: 1, r: 'T1' }, stats: [{ l: 'balance', v: '150' }] },
      { log: 'T2 computes 100 + 30 = 130 from its stale read and writes it. Read Committed lets the UPDATE go ahead: it does not compare with the value T2 read.', callout: 'T2 writes 130 from a stale read', moment: true, code: 3, state: { rows: [['1', 'read → 100', 'read → 100', '100'], ['2', 'UPDATE = 150, commit', '', '150'], ['3', '', 'UPDATE = 130, commit', '130']], hl: 2, r: 'T2' }, stats: [{ l: 'balance', v: '130', cls: 'bad' }] },
      { log: 'Two deposits ran, one of them vanished, and no error was reported. 50 of the 80 credited are gone from the account.', callout: 'The +50 is lost, silently', code: 3, state: { rows: [['1', 'read → 100', 'read → 100', '100'], ['2', 'UPDATE = 150, commit', '', '150'], ['3', '', 'UPDATE = 130, commit', '130']], fin: '130 (should be 180)', fT: 'warn', res: 'lost update: no error, wrong total', resTone: 'bad', r: 'lost' }, stats: [{ l: 'final', v: '130', cls: 'bad' }, { l: 'expected', v: '180' }] },
      { log: 'The fix is one atomic statement. The UPDATE reads and writes in one step, and the second one waits for the first row lock, then re-reads the new value.', callout: 'Fix: UPDATE ... SET balance = balance + n', code: 5, state: { rows: [['1', 'balance = balance + 50', 'balance = balance + 30', '100'], ['2', 'row locked, writes 150', 'waits for the row lock', '150'], ['3', 'commit', 're-reads 150, writes 180', '180']], hl: 2, fin: '180', fT: 'ok', res: 'both deposits survive', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'final', v: '180', cls: 'ok' }],
        takeaway: 'Do the arithmetic in the UPDATE, or lock the row first with FOR UPDATE.' },
    ],
  };

  /* ---------- 3. Repeatable Read and a concurrent update ---------- */
  const rr = {
    id: 'repeatable-read', label: 'Repeatable Read: concurrent update', desc: 'Under Repeatable Read T2 keeps one snapshot. If T1 changed and committed the row after that snapshot, T2 cannot update it and gets 40001.',
    codeLabel: 'SQL', code: { bug: ['-- T2', 'BEGIN ISOLATION LEVEL REPEATABLE READ;  SELECT balance FROM accounts;  -- 100', '-- T1, in another session', 'UPDATE accounts SET balance = 150 WHERE id = 1; COMMIT;', '-- T2 again', 'UPDATE accounts SET balance = balance + 30 WHERE id = 1;', '-- ERROR: could not serialize access due to concurrent update'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.lvl || 'REPEATABLE READ', right: s.r || '' }),
      setup(kit) {
        const t1 = kit.chip(null, { x: 16, y: 80, w: 190, h: 52, label: 'T1', sub: '', tone: 'info' });
        const t2 = kit.chip(null, { x: 224, y: 80, w: 190, h: 52, label: 'T2', sub: '', tone: 'info' });
        const row = kit.chip(null, { x: 432, y: 80, w: 192, h: 52, label: 'row · account 1', sub: '', tone: 'info' });
        const snap = kit.chip(null, { x: 224, y: 148, w: 190, h: 40, label: 'T2 snapshot', sub: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 214, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { t1, t2, row, snap, res };
      },
      frame(s, kit, R) {
        R.t1.set({ sub: s.t1 || '', tone: s.t1T || 'info' }); R.t2.set({ sub: s.t2 || '', tone: s.t2T || 'info' });
        R.row.set({ sub: s.row || 'balance 100', tone: s.rowT || 'info' });
        R.snap.set({ show: !!s.snap, sub: s.snap || '', tone: 'cursor' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'T2 begins at Repeatable Read and reads the balance. This fixes one snapshot for T2 for the rest of its life.', callout: 'T2 takes one snapshot and keeps it', code: 1, state: { t2: 'balance 100', t2T: 'cursor', snap: 'sees balance 100', r: 'T2 starts' }, stats: [{ l: 'T2 sees', v: '100' }] },
      { log: 'T1, in another session, updates the same row to 150 and commits. T2 is unaffected, because its snapshot predates this commit.', callout: 'T1 commits a change after the snapshot', code: 3, state: { t1: 'balance = 150 · committed', t1T: 'ok', t2: 'still sees 100', t2T: 'info', snap: 'sees balance 100', row: 'balance 150', rowT: 'warn', r: 'T1 commits' }, stats: [{ l: 'row now', v: '150', cls: 'warn' }, { l: 'T2 sees', v: '100' }] },
      { log: 'T2 now tries to update the row. Its snapshot says the row is 100, but the newest committed version is 150, so applying T2\'s change would overwrite a change it never saw.', callout: 'T2 would overwrite a change it cannot see', moment: true, code: 5, state: { t1: 'balance = 150 · committed', t1T: 'ok', t2: 'UPDATE … + 30', t2T: 'cursor', snap: 'sees balance 100', row: 'balance 150', rowT: 'warn', r: 'conflict' }, stats: [{ l: 'snapshot', v: '100' }, { l: 'newest committed', v: '150', cls: 'warn' }] },
      { log: 'PostgreSQL aborts T2 with SQLSTATE 40001, could not serialize access due to concurrent update. This is not a bug: it is the price of one stable snapshot.', callout: 'ERROR 40001: could not serialize access', code: 6, state: { t1: 'committed', t1T: 'ok', t2: 'aborted · 40001', t2T: 'warn', snap: 'sees balance 100', row: 'balance 150', rowT: 'warn', res: 'ERROR: could not serialize access due to concurrent update', resTone: 'bad', r: 'aborted' }, stats: [{ l: 'SQLSTATE', v: '40001', cls: 'bad' }] },
      { log: 'The application retries the whole transaction with a new snapshot, which sees 150 and succeeds. Under Read Committed, T2 would have waited, re-read the row and proceeded, with no error.', callout: 'Retry the whole transaction', code: 5, state: { t1: 'committed', t1T: 'ok', t2: 'retry · new snapshot', t2T: 'ok', snap: 'sees balance 150', row: 'balance 180', rowT: 'ok', res: 'bounded retry loop: 3 to 5 attempts, jittered backoff', resTone: 'ok', r: 'retry' }, stats: [{ l: 'retry', v: 'succeeds', cls: 'ok' }],
        takeaway: 'Stronger isolation aborts more transactions. The application must retry on 40001.' },
    ],
  };

  /* ---------- 4. A DDL waiting for ACCESS EXCLUSIVE blocks the queue ---------- */
  const ddl = {
    id: 'ddl-queue', label: 'ALTER TABLE blocks the queue', desc: 'An ALTER TABLE waits for ACCESS EXCLUSIVE behind a long report. Every later query now waits behind the ALTER, even plain reads.',
    codeLabel: 'SQL', code: { bug: ['-- a report that runs for an hour', 'SELECT count(*) FROM orders;   -- holds ACCESS SHARE', '-- the migration', 'ALTER TABLE orders ADD COLUMN coupon text;   -- wants ACCESS EXCLUSIVE', '-- every new query on orders queues behind it', '-- fix', 'SET lock_timeout = \'2s\';'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'lock queue of table orders', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 608, title: 'pg_locks on orders (illustrative)', cols: [{ label: 'session', w: 150 }, { label: 'lock mode', w: 180 }, { label: 'state', w: 250 }], rows: 5, rowH: 18 });
        const bars = kit.bars(null, { x: 16, y: 226, w: 420, labelW: 130, max: 20, items: [{ id: 'q', label: 'queued queries' }, { id: 'pool', label: 'pool in use' }], title: 'Effect on the service (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { led, bars, res };
      },
      frame(s, kit, R) {
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i, tones: [null, null, r[2].startsWith('waits') ? 'warn' : r[2].startsWith('granted') ? 'ok' : r[2].startsWith('aborted') ? 'bad' : null] }));
        R.bars.set('q', s.q || 0, s.q > 5 ? 'bad' : 'ok', String(s.q || 0)); R.bars.set('pool', s.p || 0, s.p >= 20 ? 'bad' : 'ok', String(s.p || 0));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A long report is running on orders. It holds ACCESS SHARE, the lightest lock, and it will keep it for an hour.', callout: 'A report holds ACCESS SHARE for an hour', code: 1, state: { rows: [['report · pid 311', 'AccessShareLock', 'granted · running 1 h']], p: 3, r: 'report' }, stats: [{ l: 'held by report', v: 'ACCESS SHARE' }] },
      { log: 'The migration runs ALTER TABLE, which needs ACCESS EXCLUSIVE. That lock conflicts with the report\'s, so the ALTER has to wait.', callout: 'ALTER TABLE waits for ACCESS EXCLUSIVE', code: 3, state: { rows: [['report · pid 311', 'AccessShareLock', 'granted · running 1 h'], ['migration · pid 402', 'AccessExclusiveLock', 'waits for pid 311']], hl: 1, p: 4, r: 'ALTER waits' }, stats: [{ l: 'waiting', v: 'the ALTER', cls: 'warn' }] },
      { log: 'Now a plain SELECT arrives. Its ACCESS SHARE does not conflict with the report, but it would jump ahead of the waiting ALTER, so it queues behind the ALTER instead.', callout: 'New queries queue behind the ALTER', moment: true, code: 4, state: { rows: [['report · pid 311', 'AccessShareLock', 'granted · running 1 h'], ['migration · pid 402', 'AccessExclusiveLock', 'waits for pid 311'], ['checkout · 8 sessions', 'AccessShareLock', 'waits for pid 402']], hl: 2, q: 8, p: 12, r: 'queue forms' }, stats: [{ l: 'queued', v: '8', cls: 'bad' }] },
      { log: 'Every request on the table now waits, holding a pool connection. The pool fills and the service stops, although the ALTER itself would take a millisecond.', callout: 'The whole table is stuck behind one DDL', code: 4, state: { rows: [['report · pid 311', 'AccessShareLock', 'granted · running 1 h'], ['migration · pid 402', 'AccessExclusiveLock', 'waits for pid 311'], ['checkout · 20 sessions', 'AccessShareLock', 'waits for pid 402']], hl: 2, q: 20, p: 20, res: 'pool 20 / 20 · requests on orders time out', resTone: 'bad', r: 'outage' }, stats: [{ l: 'pool in use', v: '20 / 20', cls: 'bad' }] },
      { log: 'The fix is a lock_timeout on the migration. After 2 seconds the ALTER gives up, aborts, and the queue behind it drains at once. A retry loop tries again later.', callout: 'Fix: lock_timeout = 2 s on the migration', code: 6, state: { rows: [['report · pid 311', 'AccessShareLock', 'granted · running 1 h'], ['migration · pid 402', 'AccessExclusiveLock', 'aborted · 55P03 after 2 s'], ['checkout · 20 sessions', 'AccessShareLock', 'granted']], hl: 1, q: 0, p: 4, res: 'migration retries in a loop, the queue never forms', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'queued', v: '0', cls: 'ok' }],
        takeaway: 'A waiting DDL blocks everyone behind it. Give migrations a short lock_timeout.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[10] = { explain: `
<h3>1. Anomalies, locks and cycles</h3>
<p>Concurrent transactions can produce results that no one-at-a-time order would produce. Isolation levels decide which of these anomalies are allowed. Locks stop writers from stepping on each other, but two transactions that wait for each other form a cycle that never ends by itself. PostgreSQL must then break the cycle by aborting one of them.</p>
<figure class="hd" aria-label="Flowchart: how a deadlock forms and ends">
  <div class="hd-flow"><div class="hd-node">A locks account 1, B locks account 2</div><div class="hd-down">↓</div><div class="hd-node warn">A waits for account 2, B waits for account 1</div><div class="hd-down">↓</div><div class="hd-node">Wait for deadlock_timeout (1 s)</div><div class="hd-down">↓</div><div class="hd-node dec">The detector finds a cycle in the wait-for graph</div><div class="hd-down">↓</div><div class="hd-node ok">One transaction aborts with 40P01, the other proceeds</div></div>
  <figcaption>A consistent lock order makes the cycle impossible.</figcaption>
</figure>

<h3>2. Isolation levels</h3>
<p>Isolation levels differ in when the snapshot is taken. Read Committed takes a new snapshot for each statement. Repeatable Read uses one snapshot for the whole transaction, and a write to a row that another transaction changed and committed after that snapshot fails with <code>40001</code>. Serializable adds SSI (serializable snapshot isolation) conflict detection on top of that. Under SSI, a transaction that could cause an anomaly is aborted with SQLSTATE <code>40001</code>. Every one of these aborts is safe to retry, as long as the retry re-runs the whole transaction, including its reads.</p>

<h3>3. Anomalies</h3>
<p>Anomalies include lost updates (one write overwrites a concurrent change, as in the second scene), write skew (two transactions each read what the other writes) and unrepeatable reads at the weakest levels. A read-modify-write cycle done in the application is the usual source of a lost update. The fix is an atomic <code>UPDATE ... SET x = x + n</code>, or <code>SELECT ... FOR UPDATE</code> before the write.</p>

<h3>4. Lock modes</h3>
<p>Row locks conflict only with other writers of the same row. Table locks such as <code>ACCESS EXCLUSIVE</code>, which most <code>ALTER TABLE</code> statements take, conflict with everything, including plain reads. Locks are granted in queue order, so a waiting <code>ACCESS EXCLUSIVE</code> request blocks every later request on the table, even compatible ones, until it is granted or gives up.</p>

<h3>5. Deadlock detection and timeouts</h3>
<p>A session that waits longer than <code>deadlock_timeout</code> (default 1 s) checks the wait-for graph. If it finds a cycle, one transaction in the cycle is aborted with <code>40P01</code>. <code>lock_timeout</code> limits how long any lock wait may last, and the statement then fails with <code>55P03</code>. Stronger isolation prevents more anomalies, but the database aborts more transactions, and the application must retry them. Keep transactions short, lock rows in a consistent order, and set timeouts so that a stuck lock fails fast instead of queuing the whole service.</p>

<h3>6. Syntax</h3>
<pre>-- lock in a consistent order
BEGIN;
SELECT id FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
UPDATE accounts SET balance = balance - 50 WHERE id = 1;
UPDATE accounts SET balance = balance + 50 WHERE id = 2;
COMMIT;

-- an atomic increment instead of read-modify-write
UPDATE accounts SET balance = balance + 30 WHERE id = 1;

-- pick the level for one transaction
BEGIN ISOLATION LEVEL REPEATABLE READ;  -- or SERIALIZABLE

-- migrations that never queue the service
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN coupon text;
CREATE INDEX CONCURRENTLY orders_coupon_idx ON orders (coupon);

-- who waits for whom, and how many deadlocks so far?
SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, state FROM pg_stat_activity WHERE wait_event_type = 'Lock';
SELECT datname, deadlocks FROM pg_stat_database;</pre>`, scenarios: [dead, lost, rr, ddl] };
})();
