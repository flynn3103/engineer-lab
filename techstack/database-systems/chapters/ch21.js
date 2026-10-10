/* Chapter 22 "Timestamp Ordering and Optimistic Control" (index 21, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L18 Timestamp Ordering Concurrency Control (timestamps, optimistic concurrency control, validation, the phantom problem).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: private workspaces with commit-time validation, ten clients retrying on a hot row, and a phantom row with two fixes. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 3. OCC on a hot row: every round one writer commits and the rest abort and retry ---- */
  const TX = k => 130 + k * 44, TY = r => 92 + r * 24;
  const attempts = (rounds, extra) => {
    const out = [];
    for (let r = 0; r < rounds; r++) for (let k = 0; k < 10 - r; k++) out.push([r, k, k === 0 ? 'ok' : 'bad']);
    return out;
  };
  const hot = {
    id: 'hot-row', label: 'Hot row retries', desc: 'Ten clients each read the counter, add 1 and write it back only if the version is unchanged. Per round one write matches and the rest retry (illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'read:  SELECT n, version FROM counter WHERE id = 1;',
      "write: UPDATE counter SET n = n_read + 1, version = version + 1 WHERE id = 1 AND version = version_read;",
      '-- 0 rows updated means someone else wrote first: abort and retry',
      '10 clients: 10 + 9 + 8 + ... + 1 = 55 attempts, 45 aborts',
      'fix: UPDATE counter SET n = n + 1 WHERE id = 1;   -- or spread the counter over several rows',
    ] },
    stage: DB.stage({
      footer: 'Simplified: all remaining clients retry together each round. Illustrative.',
      header: s => ({ left: 'attempts ' + (s.att || 0) + ' · commits ' + (s.com || 0), right: s.right || 'optimistic' }),
      draw(P, s) {
        (s.cells || []).forEach(([r, k, tone], i) => P.box('c' + r + '_' + k, { x: TX(k), y: TY(r), w: 40, h: 20, tone, label: tone === 'ok' ? 'win' : 'retry', cls: 'xs' }));
        const rounds = s.rounds || 0;
        for (let r = 0; r < rounds; r++) P.text('rl' + r, { x: 30, y: TY(r) + 15, t: 'round ' + (r + 1), cls: 'mut xs' });
        if (s.alt) {
          for (let k = 0; k < 10; k++) P.box('s' + k, { x: TX(k), y: 124, w: 40, h: 28, tone: 'ok', label: 'c' + (k + 1), cls: 'xs' });
          P.text('al', { x: 30, y: 142, t: s.alt, cls: 'sm' });
        }
        if (s.note) P.chip('nt', { x: 130, y: 312, w: 440, h: 28, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Ten clients read the counter at the same version and each prepare to write version + 1. Only one of those writes can match.', callout: 'Ten clients, one row, one version', code: 0,
        state: { att: 0, com: 0 }, stats: [{ l: 'clients', v: '10' }] },
      { log: 'Round 1: all ten try to write. One matches the version and commits. The other nine updated zero rows, so they abort and retry.', callout: 'Round 1: 10 attempts, 1 commit', code: 2,
        state: { cells: attempts(1), rounds: 1, att: 10, com: 1 }, stats: [{ l: 'attempts', v: '10' }, { l: 'commits', v: '1', cls: 'ok' }, { l: 'aborts', v: '9', cls: 'bad' }] },
      { log: 'Round 2: the nine that lost re-read the new version and try again. Again only one matches, and eight retry.', callout: 'Round 2: 9 attempts, 1 commit', code: 2,
        state: { cells: attempts(2), rounds: 2, att: 19, com: 2 }, stats: [{ l: 'attempts', v: '19' }, { l: 'commits', v: '2', cls: 'ok' }, { l: 'aborts', v: '17', cls: 'bad' }] },
      { log: 'Each round has one fewer client but still only one winner. The attempts form a triangle.', callout: 'The attempts form a triangle', code: 3,
        state: { cells: attempts(5), rounds: 5, att: 40, com: 5 }, stats: [{ l: 'attempts', v: '40', cls: 'warn' }, { l: 'commits', v: '5', cls: 'ok' }] },
      { log: 'After 10 rounds all increments are in, but it took 10 + 9 + ... + 1 = 55 attempts and 45 aborts. The dashboard shows high attempts and few commits.', callout: '55 attempts, 45 aborts, 10 commits', moment: true, code: 3,
        state: { cells: attempts(10), rounds: 10, att: 55, com: 10 }, stats: [{ l: 'attempts', v: '55', cls: 'bad' }, { l: 'commits', v: '10', cls: 'ok' }, { l: 'aborts', v: '45', cls: 'bad' }] },
      { log: 'A hot row serializes the work under any protocol. An atomic UPDATE counter = counter + 1 lets the row lock queue the clients: 10 attempts and no aborts.', callout: 'Atomic UPDATE: 10 attempts, 0 aborts', code: 4,
        state: { cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [0, k, 'ok']), rounds: 1, att: 10, com: 10, right: 'row lock queue', note: 'still one at a time, but nothing is wasted', noteTone: 'ok' }, stats: [{ l: 'attempts', v: '10', cls: 'ok' }, { l: 'aborts', v: '0', cls: 'ok' }] },
      { log: 'To go faster than one row allows, spread the counter over several rows and sum them when read. Ten clients write ten different rows at the same time.', callout: 'Shard the counter: ten rows, no contention', code: 4,
        state: { alt: 'sharded', att: 10, com: 10, right: 'sharded counter', note: 'read = SUM over 10 rows', noteTone: 'ok' }, stats: [{ l: 'attempts', v: '10', cls: 'ok' }, { l: 'rounds', v: '1', cls: 'ok' }],
        takeaway: 'Optimistic control wastes work under contention. For one hot row, queue the writers with a lock or split the row.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "During a flash sale, ten checkout workers update one stock counter row. The dashboard shows 412 attempts per second but only 10 commits per second, and the transfer service starts logging <code>ERROR:  deadlock detected</code> (illustrative). By evening, the <code>orders</code> table has bloated, although VACUUM ran the night before.",
    "predict": {
      "q": "Ten clients each read the counter, add 1 in the app, and write it back only if the version has not changed (optimistic control). How many write attempts does it take to commit all 10 increments?",
      "opts": [
        "10, one per client",
        "55: in each round only one of the remaining clients wins, and the rest retry",
        "20: each client fails once and then succeeds",
        "It never finishes, because optimistic writers deadlock"
      ],
      "ans": 1,
      "why": "All remaining clients read the same version, and only one write can match it. So rounds of 10, 9, 8 ... 1 attempts add up to 55, with 45 aborts. A hot row serializes the work under any protocol."
    },
    "diagnose": [
      {
        "t": "Serialization errors not retried",
        "sym": "Some transfers vanish. The logs show SQLSTATE 40001 on a few requests, and nothing is retried.",
        "ctx": "Transfers run at REPEATABLE READ or SERIALIZABLE, and the API returns HTTP 500 for a few of them.",
        "why": "Under snapshot isolation or serializable, the database aborts one of two conflicting transactions so the result stays correct. That abort is a normal outcome, and the application must run the transaction again. Treated as a failure, it loses the work.",
        "log": "-- representative PostgreSQL error at REPEATABLE READ or SERIALIZABLE\nERROR:  could not serialize access due to concurrent update\nSQLSTATE: 40001\n-- representative application log\nPOST /transfer  status=500  account=1842  amount=50  sqlstate=40001",
        "fix": [
          "Measure first: count requests that ended with sqlstate=40001 in the application log, and check whether any of them was retried.",
          "Fix: wrap the whole transaction, not one statement, in a retry loop for SQLSTATE 40001 and 40P01.",
          "Fix: use a bounded number of retries with jittered backoff, then return a clear error to the caller.",
          "Fix: make the transfer idempotent: store a request id in the same transaction, so a retry cannot apply the transfer twice.",
          "Verify: force a conflict in a test. Every request must end in a commit or a bounded error, and the balances must sum to the expected total."
        ]
      },
      {
        "t": "Hot row",
        "sym": "Throughput stalls at a few commits per second on one counter, while attempts keep climbing.",
        "ctx": "Many clients increment the same counter row with a read-modify-write and a version check.",
        "why": "Every client writes the same row. With optimistic checks, all but one attempt fail and retry. With locking, the rest queue behind one lock. Either way the hot row serializes the work.",
        "log": "-- representative application metrics, 10 clients on one counter row\nattempts/s    412\ncommits/s      10\nretries/s     402   (UPDATE ... WHERE version = $1 affected 0 rows)",
        "fix": [
          "Measure first: compare attempts/s with commits/s for the counter, and count UPDATEs that affected 0 rows.",
          "Fix: replace read-modify-write with one atomic statement: UPDATE counters SET n = n + 1 WHERE id = $1. The row lock serializes it without retries.",
          "Fix: shard a hot counter into N rows and sum them on read, so writers rarely share a row.",
          "Fix: batch increments in the application and write them every few hundred milliseconds.",
          "Verify: attempts per commit should approach 1, and the retry or abort count should be near 0."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L18 Timestamp Ordering Concurrency Control, Optimistic Control (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/18-timestampordering.pdf' };

  /* ---- 1. OCC: private workspaces, validation at commit, one writer wins ---- */
  const occ = {
    id: 'occ-validation', label: 'OCC validation', desc: 'Two transactions read the same item A. Each works in a private workspace. At commit the first to validate wins, and the second finds that the item it read has changed and restarts (values illustrative).',
    codeLabel: 'Phases',
    code: { bug: [
      'T1 and T2 BEGIN: both read A = 10 into private workspaces',
      'T1 sets A = 15 in its workspace; the database still holds 10',
      'T1 validates: no committed transaction wrote what T1 read -> write phase: A = 15',
      'T2 sets A = 20 in its workspace, computed from the old 10',
      'T2 validates: WriteSet(T1) = {A} and ReadSet(T2) = {A} intersect -> abort',
      'T2 restarts and reads A = 15',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one item, two transactions. Illustrative.',
      header: s => ({ left: s.hl || 'database, workspaces and phases', right: '' }),
      draw(P, s) {
        P.text('hd', { x: 250, y: 82, t: 'database', cls: 'mut sm' });
        P.chip('db', { x: 250, y: 92, w: 140, h: 50, label: 'A = ' + s.db, sub: 'global value', tone: s.dbHot ? 'ok' : 'info' });
        [['T1', 30, s.t1], ['T2', 450, s.t2]].forEach(([n, x, t], i) => { if (!t) return;
          P.text('h' + n, { x, y: 176, t: n + ' private workspace', cls: 'mut sm' });
          P.chip('ws' + n, { x, y: 186, w: 160, h: 50, label: 'A = ' + t.val, sub: t.sub || 'copy of A', tone: t.tone || 'info' });
          P.chip('ph' + n, { x, y: 254, w: 160, h: 34, label: t.phase, sub: '', tone: t.ptone || 'info', small: true });
          if (t.arrow) P.line('ar' + n, i ? 450 : 190, 214, i ? 390 : 250, 124, { tone: t.arrow === 'bad' ? 'bad' : t.arrow, arrow: true, label: t.al || '', dy: -6 }); });
        if (s.note) P.chip('nt', { x: 150, y: 314, w: 340, h: 30, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The database holds A = 10. T1 and T2 both begin and read A. Each gets a private copy in its own workspace, and neither takes a lock.', callout: 'Both copy A into private workspaces', code: 0, state: { db: 10, t1: { val: 10, phase: 'read phase' }, t2: { val: 10, phase: 'read phase' } }, stats: [{ l: 'locks taken', v: '0', cls: 'ok' }] },
      { log: 'T1 changes A to 15, but only in its own workspace. The database still shows 10, and T2 cannot see the change.', callout: 'T1 writes only to its workspace', code: 1, state: { db: 10, t1: { val: 15, phase: 'read phase', tone: 'cursor', sub: 'modified copy' }, t2: { val: 10, phase: 'read phase' } }, stats: [{ l: 'database A', v: '10' }] },
      { log: 'T1 commits and enters validation. No transaction has committed a write to anything T1 read, so it passes. In the write phase its workspace is installed, and A becomes 15.', callout: 'T1 validates and writes: A = 15', moment: true, code: 2, state: { db: 15, dbHot: 1, t1: { val: 15, phase: 'validation ok, write phase', ptone: 'ok', tone: 'ok', arrow: 'ok', al: 'install' }, t2: { val: 10, phase: 'read phase' } }, stats: [{ l: 'database A', v: '15', cls: 'ok' }] },
      { log: 'Meanwhile T2 computed its own change from the copy of 10 it read earlier, and set A to 20 in its workspace.', callout: 'T2 worked from a stale copy', code: 3, state: { db: 15, t1: { val: 15, phase: 'committed', ptone: 'ok' }, t2: { val: 20, phase: 'read phase', tone: 'cursor', sub: 'based on A = 10' } }, stats: [{ l: 'T2 read', v: 'A = 10 (old)', cls: 'warn' }] },
      { log: 'T2 validates. T1 committed a write to A, and T2 read A, so WriteSet(T1) and ReadSet(T2) overlap and the conflict does not go one way. T2 aborts. Nothing was ever locked and nothing was wrongly installed.', callout: 'T2 fails validation and aborts', moment: true, code: 4, state: { db: 15, t1: { val: 15, phase: 'committed', ptone: 'ok' }, t2: { val: 20, phase: 'validation fails: abort', tone: 'bad', ptone: 'bad', arrow: 'bad', al: 'rejected' }, note: 'WriteSet(T1) intersects ReadSet(T2)', noteTone: 'bad' }, stats: [{ l: 'T2', v: 'aborted', cls: 'bad' }] },
      { log: 'T2 restarts and now reads A = 15, so its result is built on the committed value. The cost of an abort is the whole transaction, because validation comes at the end.', callout: 'T2 restarts from A = 15', code: 5, state: { db: 15, t1: { val: 15, phase: 'committed', ptone: 'ok' }, t2: { val: 15, phase: 'restart: read phase', tone: 'info', sub: 'fresh copy' }, note: 'work done before the abort is wasted', noteTone: 'warn' }, stats: [{ l: 'wasted work', v: 'all of T2', cls: 'warn' }],
        takeaway: 'OCC takes no locks while running and checks at the end. It is cheap when conflicts are rare and wasteful when they are not.' },
    ],
  };

  /* ---- 3. Phantoms: a range read can change, until the range itself is protected ---- */
  const PHROWS = [['Mon', 'Ana'], ['Mon', 'Ben'], ['Tue', 'Cy'], ['Wed', 'Dee']];
  const phantom = {
    id: 'phantom', label: 'Phantom problem', desc: 'T1 counts the shifts on Monday twice. Between the reads T2 inserts a Monday shift. Locking only existing rows cannot stop it. Re-running the scan at commit detects it, and locking the key range prevents it (rows illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "T1: SELECT count(*) FROM shifts WHERE day = 'Mon';        -- 2",
      "T2: INSERT INTO shifts VALUES ('Mon', 'Eve'); COMMIT;",
      "T1: SELECT count(*) FROM shifts WHERE day = 'Mon';        -- 3, a phantom",
      '-- fix 1: re-run the scans at commit and compare with the first results',
      '-- fix 2: lock the range (index or predicate lock) so the insert has to wait',
    ] },
    stage: DB.stage({
      footer: 'Simplified: four rows, one new row. Illustrative.',
      header: s => ({ left: s.hl || "WHERE day = 'Mon'", right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 40, y: 82, t: 'index on day (sorted)', cls: 'mut sm' });
        const rows = s.ins ? [...PHROWS.slice(0, 2), ['Mon', 'Eve'], ...PHROWS.slice(2)] : PHROWS;
        if (s.range) P.box('range', { x: 34, y: 100, w: s.ins && !s.blocked ? 340 : 228, h: 66, tone: s.locked ? 'ok' : 'cursor', label: '', dash: !s.locked, sw: 2.6, op: s.locked ? 0.45 : 1 });
        rows.forEach(([d, n], i) => P.chip('r' + n, { x: 40 + i * 112, y: 110, w: 104, h: 46, label: d + ' · ' + n, sub: n === 'Eve' ? 'new row by T2' : '', tone: n === 'Eve' ? 'bad' : (d === 'Mon' && s.seen ? 'ok' : 'info') }));
        if (s.range) P.text('rt', { x: 40, y: 94, t: s.locked ? 'range locked by T1' : 'T1 range', cls: 'xs' });
        if (s.c1 != null) P.chip('c1', { x: 40, y: 200, w: 180, h: 40, label: 'T1 first count: ' + s.c1, sub: '', tone: 'info' });
        if (s.c2 != null) P.chip('c2', { x: 250, y: 200, w: 180, h: 40, label: 'T1 second count: ' + s.c2, sub: '', tone: s.c2 !== s.c1 ? 'bad' : 'ok' });
        if (s.blocked) P.chip('bl', { x: 40, y: 250, w: 330, h: 40, label: 'T2 insert waits for the range lock', sub: '', tone: 'warn' });
        if (s.note) P.chip('nt', { x: 40, y: 292, w: 440, h: 30, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The index on day holds four shifts, two of them on Monday. T1 counts the Monday shifts and gets 2. It locked the two rows it found.', callout: 'T1 counts Monday: 2', code: 0, state: { range: 1, seen: 1, c1: 2 }, stats: [{ l: 'first count', v: '2' }] },
      { log: 'T2 inserts a new Monday shift and commits. There is no lock on a row that did not exist, so nothing stops it.', callout: 'T2 inserts a new Monday row', code: 1, state: { range: 1, seen: 1, c1: 2, ins: 1 }, stats: [{ l: 'T2', v: 'committed', cls: 'warn' }] },
      { log: 'T1 counts again and gets 3. The new row is a phantom: it appeared in a range that T1 had already read. The schedule is not serializable, because T1 saw two different states of the same range.', callout: 'Second count: 3, a phantom', moment: true, code: 2, state: { range: 1, seen: 1, c1: 2, c2: 3, ins: 1, note: 'same query, different answer in one transaction', noteTone: 'bad' }, stats: [{ l: 'counts', v: '2 then 3', cls: 'bad' }] },
      { log: 'Fix 1: the DBMS remembers the WHERE clause of every scan, and at commit it re-runs them and compares. A different result means a conflict, so T1 aborts. It is detection, and the work is already done.', callout: 'Re-run the scan at commit and compare', code: 3, state: { range: 1, seen: 1, c1: 2, c2: 3, ins: 1, note: 'commit: re-execute scan -> 3 differs from 2 -> abort', noteTone: 'warn' }, stats: [{ l: 'result', v: 'abort at commit', cls: 'warn' }] },
      { log: 'Fix 2: T1 locks the key range instead of only the rows. The lock covers the gaps between index keys as well, so a new Monday key cannot be inserted. T2 waits, and T1 reads 2 again.', callout: 'Lock the range, gaps included', moment: true, code: 4, state: { range: 1, locked: 1, seen: 1, c1: 2, c2: 2, blocked: 1, note: 'index locking: key plus gap, or predicate locking', noteTone: 'ok' }, stats: [{ l: 'second count', v: '2', cls: 'ok' }],
        takeaway: 'Locking rows is not enough when queries read ranges. Protect the range or re-check it at commit.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Timestamp-based and optimistic protocols</h3>
<p>Locking assumes conflicts are common and pays for every access. <b>Timestamp ordering</b> (T/O) takes the opposite bet: conflicts are rare, so skip locks and use <b>timestamps</b> to decide the serial order. Each transaction Ti gets a unique, fixed, increasing timestamp TS(Ti). If TS(Ti) &lt; TS(Tj), the DBMS must produce a schedule equivalent to Ti running before Tj. Timestamps come from the system clock (which has edge cases such as daylight saving), from a logical counter (which overflows and is hard to keep across machines), or from a mix. Some schemes assign several timestamps per transaction.</p>

<h3>2. Optimistic concurrency control (OCC)</h3>
<p>OCC works best when transactions are mostly read-only or touch disjoint data: a large database and a workload that is not skewed. It gives each transaction a <b>private workspace</b>. Everything the transaction reads is copied there, which also gives repeatable reads, and every write goes there too. No one else can see the workspace. There are three phases. In the <b>read phase</b> the DBMS tracks the read set and write set and keeps writes private. In the <b>validation phase</b>, at commit, it checks the transaction against others for read-write and write-write conflicts and makes sure they all go one way. In the <b>write phase</b>, if validation passed, the workspace is installed in the database. Otherwise the transaction aborts and restarts.</p>
<figure class="mm" aria-label="Flowchart of the three phases of optimistic concurrency control" style="--diagram-width:360px">
  <img src="diagrams/ch21-occ-phases.svg" alt="Flowchart: BEGIN, then the read phase where reads are copied into a private workspace and writes go only to the workspace. At COMMIT the validation phase asks whether the transaction conflicts with others. If not, the write phase installs the workspace and the transaction commits. If so, it aborts and restarts.">
  <figcaption>Flowchart: OCC takes no locks until the commit-time check.</figcaption>
</figure>

<h3>3. Validation</h3>
<p>The DBMS assigns a timestamp when a transaction enters validation. <b>Forward validation</b> compares the committing transaction with all other running ones, which have not validated and count as timestamp infinity. <b>Backward validation</b> compares it with transactions that have already committed. For TS(Ti) &lt; TS(Tj) one of three conditions must hold: Ti finishes all three phases before Tj starts; or Ti finishes its write phase before Tj starts its write phase, and Ti did not write anything Tj read; or Ti finishes its read phase before Tj does, and Ti wrote nothing that Tj read or wrote. Costs: copying data into workspaces, a bottleneck in validation and write phases, a timestamp allocation bottleneck, and aborts that are wasteful because they come after the work is done. Under heavy conflict on a hot row, only one transaction per round can win, so OCC degrades.</p>

<h3>4. Dynamic databases and the phantom problem</h3>
<p>So far transactions touched a fixed set of objects. Inserts and deletes break that. The <b>phantom problem</b> arises when transactions lock or track only the rows that exist, and miss rows that are being created: a range scan run twice gives different rows, and the schedule is not serializable. There are three remedies from the lecture. <b>Re-execute scans</b>: record each WHERE clause, and at commit run the scans again and compare. <b>Predicate locking</b>: lock the predicate itself so no row satisfying it can be created or changed. Proposed in System R, it is hard to implement, although HyPer uses a form called precision locking. <b>Index locking</b>: lock ranges of index keys. A <b>key-value lock</b> covers existing keys, a <b>gap lock</b> covers the space between keys, and a <b>next-key lock</b> covers a key and the gap before it, so a new key cannot appear in the range.</p>
<figure class="mm" aria-label="Tree of ways to prevent phantoms: re-execute scans, predicate locking, index locking with key, gap and next-key locks" style="--diagram-width:664px">
  <img src="diagrams/ch21-phantom-fixes.svg" alt="Tree: a phantom is a new row entering a range a transaction already read. Remedies are re-executing scans at commit and comparing, predicate locking that locks the WHERE condition, and index locking that locks key ranges, with key-value locks on existing keys, gap locks on the space between keys, and next-key locks on a key plus the gap before it.">
  <figcaption>Tree: three ways to stop phantoms.</figcaption>
</figure>

<h3>5. The trade-off</h3>
<p>Optimistic control removes lock overhead and waiting, which pays off on read-heavy and low-conflict workloads, and replaces waiting with aborts, which hurt on hot rows. Pessimistic control waits, and never wastes work on a doomed transaction. In both, the application must retry a failed transaction. Phantom protection costs range locks or re-scans, and is what separates repeatable read from serializable in many engines.</p>

<h3>6. Syntax</h3>
<pre>-- optimistic update by version: the write only succeeds if nothing changed
UPDATE products SET stock = 9, version = version + 1
WHERE id = 42 AND version = 7;
-- 0 rows updated means someone else committed first: reread and retry

-- serializable in PostgreSQL uses conflict detection; failures must be retried
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM shifts WHERE day = 'Mon';
INSERT INTO shifts VALUES ('Mon', 'Eve');
COMMIT;   -- ERROR 40001: could not serialize access: retry the transaction

-- MySQL InnoDB: next-key locks prevent phantoms for locking reads
SELECT * FROM shifts WHERE day = 'Mon' FOR UPDATE;</pre>
<p>Count serialization failures (SQLSTATE 40001) per minute. A high rate on one table means a hot row or range, not a bug in the engine.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A ticketing service uses optimistic concurrency. In normal traffic it works. During a flash sale ten workers update one stock counter row, the dashboard shows 412 attempts per second and only 10 commits per second, and some orders vanish with SQLSTATE 40001 in the logs. Elsewhere in the app, a report counts the shifts of Monday twice in one transaction and gets 2, then 3 (illustrative).`,
    predict: OLD.predict,
    diagnose: [
      OLD.diagnose[1],
      OLD.diagnose[0],
      {
        t: 'Phantom rows invalidate a repeated range query',
        sym: '<b>The same Monday count</b> changes from 2 to 3 inside one transaction.',
        ctx: 'A transaction counts rows in a range twice, and another session inserts a matching row in between.',
        why: 'A range query returns rows that match a condition. Another transaction can insert a new matching row between two reads. Under Read Committed each read sees the latest data, so the new row appears in the second read.',
        log: `-- representative, illustrative
T1: SELECT count(*) FROM shifts WHERE day = 'Mon'
first read: 2, second read after T2 commits: 3`,
        note: 'The same query returning different results inside one transaction is a phantom.',
        fix: [
          'Measure first: run the range count twice inside one transaction while another session inserts a matching row.',
          'Run the transaction at snapshot isolation, so both reads come from one snapshot. In PostgreSQL, REPEATABLE READ is snapshot isolation, and it prevents phantom reads.',
          'Use Serializable when the rule depends on a range, and let the database detect the conflict.',
          'In a lock-based engine, use locking reads that take next-key or gap locks.',
          'Verify: count the rows in two reads inside one transaction, while another session inserts.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[21] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [occ, hot, phantom] };
})();
