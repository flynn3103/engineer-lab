/* Chapter 23 "Multi-Version Concurrency Control" (index 22, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L19 Multi-Version Concurrency Control (snapshot isolation, version storage, garbage collection, index management, deletes).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a version chain with xmin and xmax, three version-storage layouts, and a garbage-collection horizon pinned by an old snapshot. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. MVCC: each UPDATE adds a version, and a snapshot sees the version that was current for it ---- */
  const VX = i => 30 + i * 150;
  const mvcc = {
    id: 'version-chain', label: 'Version chain', desc: 'An UPDATE writes a new row version and stamps the old one with xmax. Two readers with different snapshots see different versions, and VACUUM may remove only versions no snapshot can see (ids illustrative).',
    codeLabel: 'Heap',
    code: { bug: [
      'v1: balance 100, xmin = 100, xmax = none       -- created by transaction 100',
      'UPDATE (txn 105): v1.xmax = 105, new v2: balance 150, xmin = 105',
      'a snapshot sees a version if xmin committed before it and xmax did not',
      'reader A keeps its snapshot open (idle in transaction): v1 must be kept',
      'VACUUM removes only versions that no open snapshot can see',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one row, PostgreSQL-style xmin and xmax. Illustrative.',
      header: s => ({ left: 'versions in the heap ' + (s.vers || []).filter(v => !v[3]).length, right: s.right || '' }),
      draw(P, s) {
        (s.vers || []).forEach(([id, bal, xs, gone], i) => {
          P.chip('v' + i, { x: VX(i), y: 100, w: 138, h: 66, label: id + ' = ' + bal, sub: xs, tone: gone ? 'delete' : (s.see && Object.values(s.see).includes(i) ? 'live' : 'info'), hl: !!(s.see && Object.values(s.see).includes(i)) });
          if (i > 0 && !(s.vers[i - 1][3])) P.line('ch' + i, VX(i - 1) + 138, 133, VX(i), 133, { tone: 'mut', arrow: true });
        });
        if (s.rA) { P.chip('rA', { x: 30, y: 230, w: 230, h: 40, label: 'reader A', sub: 'snapshot taken at txn 104', tone: 'acc' }); if (s.see && s.see.A != null) P.line('lA', 145, 230, VX(s.see.A) + 69, 168, { tone: 'cursor', arrow: true, sw: 2 }); }
        if (s.rB) { P.chip('rB', { x: 340, y: 230, w: 230, h: 40, label: 'reader B', sub: 'snapshot taken at txn 106', tone: 'cursor' }); if (s.see && s.see.B != null) P.line('lB', 455, 230, VX(s.see.B) + 69, 168, { tone: 'ok', arrow: true, sw: 2 }); }
        if (s.vac) P.chip('vac', { x: 30, y: 292, w: 540, h: 38, label: s.vac, tone: s.vacTone || 'warn', small: true });
        if (s.writer) P.chip('wr', { x: 30, y: 68, w: 300, h: 26, label: s.writer, tone: 'cursor', small: true });
      }
    }),
    bug: [
      { log: 'The row exists as one version, v1, created by transaction 100. Reader A starts and takes a snapshot at transaction 104.', callout: 'One version, one reader', code: 0,
        state: { vers: [['v1', 100, 'xmin 100 xmax none']], rA: 1, see: { A: 0 } }, stats: [{ l: 'versions', v: '1' }, { l: 'A sees', v: 'v1', cls: 'ok' }] },
      { log: 'Transaction 105 updates the row. It does not overwrite v1. It stamps v1 with xmax 105 and writes a new version v2 with xmin 105.', callout: 'UPDATE: stamp v1, write v2', code: 1,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105'], ['v2', 150, 'xmin 105 xmax none']], rA: 1, see: { A: 0 }, writer: 'txn 105 UPDATE balance = 150' }, stats: [{ l: 'versions', v: '2' }, { l: 'A still sees', v: 'v1', cls: 'ok' }] },
      { log: 'Transaction 105 commits and reader B takes a new snapshot at 106. B sees v2, because 105 committed before its snapshot. A is not blocked.', callout: 'Readers never wait for the writer', moment: true, code: 2,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105'], ['v2', 150, 'xmin 105 xmax none']], rA: 1, rB: 1, see: { A: 0, B: 1 } }, stats: [{ l: 'A sees', v: 'v1 (100)' }, { l: 'B sees', v: 'v2 (150)' }, { l: 'reader waits', v: '0', cls: 'ok' }] },
      { log: 'v1 is no longer the newest, but reader A\'s snapshot can still see it. If A stays open, VACUUM must keep v1.', callout: 'v1 is dead for B but live for A', code: 3,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105'], ['v2', 150, 'xmin 105 xmax none']], rA: 1, rB: 1, see: { A: 0, B: 1 }, vac: 'VACUUM: v1 not removable, snapshot 104 is still open', vacTone: 'warn' }, stats: [{ l: 'removable versions', v: '0', cls: 'warn' }] },
      { log: 'Reader A is a report left idle in transaction for hours. Meanwhile more updates add v3 and v4. Every old version stays, and the table grows.', callout: 'An old snapshot makes dead versions pile up', code: 3,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105'], ['v2', 150, 'xmin 105 xmax 112'], ['v3', 180, 'xmin 112 xmax 120'], ['v4', 210, 'xmin 120 xmax none']], rA: 1, see: { A: 0, B: 3 }, vac: 'VACUUM runs every night but keeps v1 to v3', vacTone: 'bad' }, stats: [{ l: 'dead versions kept', v: '3', cls: 'bad' }, { l: 'bloat', v: 'growing', cls: 'bad' }] },
      { log: 'Reader A finally commits and its snapshot closes. No open snapshot can see v1, v2 or v3 any more.', callout: 'The old snapshot closes', code: 4,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105'], ['v2', 150, 'xmin 105 xmax 112'], ['v3', 180, 'xmin 112 xmax 120'], ['v4', 210, 'xmin 120 xmax none']], see: { B: 3 }, vac: 'oldest open snapshot is now newer than all dead versions', vacTone: 'ok' }, stats: [{ l: 'open snapshots', v: 'none old', cls: 'ok' }] },
      { log: 'VACUUM removes v1, v2 and v3 and marks their space reusable. Only the live version v4 remains.', callout: 'VACUUM removes the dead versions', code: 4,
        state: { vers: [['v1', 100, 'xmin 100 xmax 105', 1], ['v2', 150, 'xmin 105 xmax 112', 1], ['v3', 180, 'xmin 112 xmax 120', 1], ['v4', 210, 'xmin 120 xmax none']], see: { B: 3 }, vac: 'removed 3 dead versions, space reusable', vacTone: 'ok' }, stats: [{ l: 'versions kept', v: '1', cls: 'ok' }, { l: 'dead removed', v: '3', cls: 'ok' }],
        takeaway: 'MVCC keeps readers fast. A snapshot left open for hours is what stops VACUUM and makes the table bloat.' },
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
        "t": "Long-lived snapshots",
        "sym": "Table bloat grows during the day, even though VACUUM runs every night.",
        "ctx": "A reporting session sits idle in transaction for hours while the table keeps getting updates.",
        "why": "VACUUM may remove a dead version only when no open snapshot can still see it. One idle transaction keeps an old snapshot alive, so every version created after it is retained.",
        "log": "-- representative PostgreSQL output, counts illustrative\nVACUUM VERBOSE orders;\nINFO:  \"orders\": found 0 removable, 1843920 nonremovable row versions\nDETAIL:  1843912 dead row versions cannot be removed yet, oldest xmin: 2947103\n-- representative pg_stat_activity columns for the session that holds the old snapshot\nstate: idle in transaction   backend_xmin: 2947103   xact_start: 06:12",
        "fix": [
          "Measure first: find the blocker. Sort pg_stat_activity by the oldest xact_start and the oldest backend_xmin, and match it to the oldest xmin that VACUUM VERBOSE reports.",
          "Fix: end idle transactions. Set idle_in_transaction_session_timeout so a session that sits in a transaction cannot pin the horizon.",
          "Fix: split long reads into short batches, each in its own transaction, so no single snapshot lasts for hours.",
          "Verify: after the session ends, VACUUM VERBOSE reports 0 dead row versions that cannot be removed."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L19 Multi-Version Concurrency Control (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/19-multiversioning.pdf' };

  /* ---- 2. Version storage: where the old versions live decides write cost and read cost ---- */
  const COLX = [20, 230, 440];
  const NAMES = ['Append-only', 'Time-travel', 'Delta'];
  const vc = (P, id, x, y, w, label, sub, tone) => P.chip(id, { x, y, w, h: 40, label, sub, tone, small: true });
  const vstore = {
    id: 'version-storage', label: 'Version storage', desc: 'The same tuple is updated twice, giving versions v1, v2, v3. Three layouts keep the old versions in different places: in the same table, in a separate table, or as small deltas (byte counts illustrative).',
    codeLabel: 'Layouts',
    code: { bug: [
      'tuple t: v1 -> UPDATE -> v2 -> UPDATE -> v3',
      'append-only: every version is a new tuple in the table, linked by a chain',
      'time-travel: the table keeps the newest, the old copies move to a side table',
      'delta: the table keeps the newest, a side segment keeps only the changed columns',
      'read an old version: follow the chain / one hop into the side table / apply deltas backwards',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one tuple, three versions. Byte counts illustrative.',
      header: s => ({ left: s.hl || 'where old versions live', right: '' }),
      draw(P, s) {
        const n = s.n || 1;
        NAMES.forEach((nm, c) => { const x = COLX[c]; P.text('t' + c, { x, y: 84, t: nm, cls: 'sm' });
          P.box('m' + c, { x, y: 94, w: 190, h: c === 0 ? 150 : 70, tone: 'mut', label: '', dash: true }); P.text('mt' + c, { x: x + 6, y: 108, t: c === 0 ? 'table' : 'main table', cls: 'xs mut' });
          if (c > 0) { P.box('s' + c, { x, y: 176, w: 190, h: 68, tone: 'mut', label: '', dash: true }); P.text('st' + c, { x: x + 6, y: 190, t: c === 1 ? 'time-travel table' : 'delta segment', cls: 'xs mut' }); }
        });
        // append-only: all in one table, chain newest to oldest
        for (let v = 1; v <= n; v++) vc(P, 'a' + v, COLX[0] + 8, 112 + (n - v) * 44 - (n === 1 ? 0 : 0), 174, 'v' + v + (v === n ? ' newest' : ''), v === n ? 'head of chain' : 'older, in the table', v === n ? 'ok' : 'info');
        // time travel
        vc(P, 'b' + n, COLX[1] + 8, 116, 174, 'v' + n + ' newest', 'overwritten in place', 'ok');
        for (let v = 1; v < n; v++) vc(P, 'bo' + v, COLX[1] + 8 + (v - 1) * 90, 194, 84, 'v' + v, 'full copy', 'info');
        // delta
        vc(P, 'c' + n, COLX[2] + 8, 116, 174, 'v' + n + ' newest', 'overwritten in place', 'ok');
        for (let v = 1; v < n; v++) vc(P, 'co' + v, COLX[2] + 8 + (v - 1) * 90, 194, 84, 'Δ' + v + '→' + (v + 1), 'delta', 'cursor');
        if (s.cost) ['100 B', '200 B', '~24 B'].forEach((t, c) => P.chip('w' + c, { x: COLX[c], y: 254, w: 190, h: 36, label: 'write per update: ' + t, sub: '', tone: c === 1 ? 'warn' : 'ok', small: true }));
        if (s.read) ['2 hops down chain', '2 hops, side table', 'apply 2 deltas'].forEach((t, c) => P.chip('rd' + c, { x: COLX[c], y: 294, w: 190, h: 30, label: 'v1: ' + t, sub: '', tone: c === 2 ? 'warn' : 'info', small: true }));
      }
    }),
    bug: [
      { log: 'A tuple exists as version v1. All three layouts store it the same way for now.', callout: 'One version', code: 0, state: { n: 1 }, stats: [{ l: 'versions', v: '1' }] },
      { log: 'The first update creates v2. Append-only adds a new tuple to the table. Time-travel copies v1 into a side table and overwrites the main tuple. Delta stores only what changed in a small side record.', callout: 'The first update: three different moves', code: 1, state: { n: 2 }, stats: [{ l: 'versions', v: '2' }] },
      { log: 'The second update creates v3. Append-only now has a chain of three tuples in the table, newest first. The other two keep one copy of the newest in the main table and move the history aside.', callout: 'Three versions, three layouts', moment: true, code: 2, state: { n: 3 }, stats: [{ l: 'versions', v: '3' }] },
      { log: 'The cost of an update differs. Append-only writes one full tuple. Time-travel writes two: the copy and the overwrite. Delta writes the new tuple and a tiny delta, so it writes least.', callout: 'Write cost per update', code: 3, state: { n: 3, cost: 1 }, stats: [{ l: 'cheapest write', v: 'delta', cls: 'ok' }] },
      { log: 'Reading an old version has the opposite ranking. A chain or a side table takes one hop per version. Delta storage must apply deltas backwards one by one, so old versions are the slowest to rebuild.', callout: 'Read cost of an old version', code: 4, state: { n: 3, cost: 1, read: 1 }, stats: [{ l: 'slowest old read', v: 'delta', cls: 'warn' }],
        takeaway: 'Where old versions live is a trade between write cost, read cost and cleanup. Most transactions read the newest version, so newest-first is the common choice.' },
    ],
  };

  /* ---- 3. Garbage collection: the oldest active snapshot decides which versions can go ---- */
  const GX = ts => 60 + (ts - 90) * 10;
  const VERS = [['v0', 90, 110], ['v1', 110, 120], ['v2', 120, 130], ['v3', 130, 141]];
  const gc = {
    id: 'garbage-collection', label: 'Garbage collection', desc: 'One tuple has four versions with begin and end timestamps. A version can be removed only when no running transaction can need it. A single old snapshot holds back every version that ended after it (timestamps illustrative).',
    codeLabel: 'Rule',
    code: { bug: [
      'versions of tuple t: v0 [..110), v1 [110,120), v2 [120,130), v3 [130,..)',
      'active: a report with snapshot 100, and new transactions at 135',
      'horizon = the oldest active snapshot = 100: a version is reclaimable only if it ended at or before 100',
      'every version ended after 100: nothing is reclaimable, the chain grows',
      'the report ends: horizon = 135, so v0, v1 and v2 (ended before 135) are reclaimable',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one tuple. Timestamps illustrative.',
      header: s => ({ left: s.hl || 'versions on a timeline', right: s.hz ? 'horizon: ' + s.hz : '' }),
      draw(P, s) {
        for (let t = 90; t <= 140; t += 10) { P.line('g' + t, GX(t), 98, GX(t), 296, { tone: 'mut', sw: 0.6, dash: true }); P.text('gt' + t, { x: GX(t), y: 312, t: String(t), cls: 'mut xs', anchor: 'middle' }); }
        VERS.forEach(([n, a, b], i) => { const gone = s.gone && b <= s.gone, pinned = s.pinned && i < 3 && b > s.hz && !gone, free = s.free && b <= s.hz;
          if (gone) return;
          P.box('v' + n, { x: GX(a) + 1, y: 122 + i * 38, w: GX(b) - GX(a) - 2, h: 30, tone: free ? 'ok' : pinned ? 'bad' : (i === 3 ? 'live' : 'info'), label: n + (free ? ' reclaimable' : pinned ? ' pinned' : ''), cls: 'xs' }); });
        if (s.snaps) s.snaps.forEach(([ts, lbl, tone], k) => { P.line('s' + k, GX(ts), 98, GX(ts), 296, { tone, sw: 2.4 }); P.chip('sc' + k, { x: Math.min(GX(ts) - 40, 520), y: 88 - 0, w: 130, h: 24, label: lbl, sub: '', tone, small: true }); });
        if (s.hz) P.line('hz', GX(s.hz), 98, GX(s.hz), 296, { tone: 'cursor', dash: true, sw: 2.4 });
        if (s.note) P.chip('nt', { x: 60, y: 326, w: 440, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'One tuple has been updated three times. Each version is valid from its begin timestamp until the next version begins. The newest, v3, has no end.', callout: 'Four versions of one tuple', code: 0, state: {}, stats: [{ l: 'versions', v: '4' }] },
      { log: 'Two kinds of transaction are active. A long report took its snapshot at 100. New transactions start at 135 and see the newest version.', callout: 'An old reader and new transactions', code: 1, state: { snaps: [[100, 'report: 100', 'warn'], [135, 'new txns: 135', 'ok']] }, stats: [{ l: 'oldest snapshot', v: '100' }] },
      { log: 'The garbage collector can only remove a version that no active transaction can see, and it uses the oldest active snapshot as a safe horizon. The horizon is 100.', callout: 'The horizon is the oldest snapshot', code: 2, state: { snaps: [[100, 'report: 100', 'warn'], [135, 'new txns: 135', 'ok']], hz: 100 }, stats: [{ l: 'horizon', v: '100' }] },
      { log: 'Every version ended after 100, so any of them might still be needed by the report. Nothing can be removed, even though v1 and v2 are invisible to new transactions. The chain keeps growing.', callout: 'One old snapshot pins every version', moment: true, code: 3, state: { snaps: [[100, 'report: 100', 'warn'], [135, 'new txns: 135', 'ok']], hz: 100, pinned: 1, note: 'bloat: VACUUM runs and reclaims nothing', noteTone: 'bad' }, stats: [{ l: 'reclaimable', v: '0 of 4', cls: 'bad' }] },
      { log: 'The report finishes. The oldest snapshot is now 135, so v0, v1 and v2 all ended before it and are reclaimable. v3 stays, because it is current.', callout: 'The report ends: the horizon jumps to 135', code: 4, state: { snaps: [[135, 'new txns: 135', 'ok']], hz: 135, free: 1, note: 'three versions can now be removed', noteTone: 'ok' }, stats: [{ l: 'reclaimable', v: '3 of 4', cls: 'ok' }],
        takeaway: 'Cleanup is limited by the oldest running snapshot. Keep transactions short, or old versions pile up and every scan reads them.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Readers and writers that do not block each other</h3>
<p><b>Multi-version concurrency control</b> (MVCC) keeps several physical versions of each logical tuple. A write does not overwrite: it creates a new version. A reader takes a <b>snapshot</b>, a timestamp, and reads for each tuple the version that was current at that time. So <b>writers do not block readers and readers do not block writers</b>. A read-only transaction can run with no locks, reading its snapshot even while the data changes under it, and it sees a consistent state: the foundation of the lecture&rsquo;s <b>snapshot isolation</b>. Each version carries a begin and an end timestamp. A version is visible to a snapshot if it began at or before the snapshot, was committed, and had not ended by then.</p>
<figure class="mm" aria-label="Flowchart for deciding whether a version is visible to a snapshot" style="--diagram-width:360px">
  <img src="diagrams/ch22-visibility.svg" alt="Flowchart: for a version with begin timestamp b and end timestamp e, if b is not committed or is after my snapshot the version is not visible and I look at the older version. Otherwise, if e is empty, uncommitted or after my snapshot, the version is visible. If e is committed and at or before my snapshot, it is not visible.">
  <figcaption>Flowchart: the visibility test a reader applies, version by version.</figcaption>
</figure>
<p>Write conflicts are still possible. Under snapshot isolation two transactions that write the same tuple cannot both commit: the first writer wins, and the other aborts or waits. Transactions that read overlapping data and write different tuples can both commit, the write skew of chapter 20. MVCC is a layer on top of a concurrency protocol (multi-version two-phase locking, timestamp ordering or optimistic control). It is not itself one.</p>

<h3>2. Design decisions</h3>
<figure class="mm" aria-label="Five MVCC design decisions" style="--diagram-width:936px">
  <img src="diagrams/ch22-mvcc-design.svg" alt="Tree: MVCC design decisions are the concurrency protocol, which can be multi-version 2PL, timestamp ordering or optimistic control; version storage, which can be append-only, time-travel or delta; garbage collection, tuple-level or transaction-level; index management, with logical or physical pointers; and deletes, with a deleted flag or a tombstone.">
  <figcaption>Tree: every MVCC system chooses along these five axes.</figcaption>
</figure>

<h3>3. Version storage</h3>
<p>The DBMS links the versions of a tuple in a <b>version chain</b>, a list sorted by timestamp. Indexes point to the <b>head</b> of the chain, and a reader walks the chain until it finds the version visible to it. Three schemes. <b>Append-only</b>: all versions live in the same table. Each update appends a new tuple, and the chain runs oldest-to-newest (O2N, readers traverse) or newest-to-oldest (N2O, which needs index pointers updated on each update, but most transactions only want the newest). PostgreSQL works this way. <b>Time-travel</b>: the main table keeps the newest version and every update copies the old version into a separate time-travel table. <b>Delta</b>: like time-travel, but only the changed columns are saved, in a delta segment. Writes are cheaper than time-travel, and rebuilding an old version means applying deltas in reverse, so old reads are slower. MySQL InnoDB and Oracle use deltas in an undo log.</p>

<h3>4. Garbage collection</h3>
<p>Old versions must go eventually, or storage and scans grow without bound. A version is <b>reclaimable</b> when no active transaction can see it. <b>Tuple-level</b> collection looks at tuples: a background vacuum walks the table, or a cooperative cleanup removes dead versions when a transaction passes them. <b>Transaction-level</b> collection tracks the versions each transaction created and frees them when the transaction can no longer be needed. The safe horizon is the oldest active snapshot, so one long-running transaction stops cleanup for everything that ended after it, which is how an idle open transaction bloats a table.</p>

<h3>5. Index management and deletes</h3>
<p>The primary key index points to the head of the chain. Secondary indexes can use <b>logical pointers</b> (the primary key or a tuple ID that is mapped to the head), so an update only changes the main index, or <b>physical pointers</b> (the address of the version), so every update of the tuple touches every secondary index. PostgreSQL&rsquo;s heap-only tuple (HOT) trick avoids index changes when no indexed column changes and the new version fits on the same page. A <b>delete</b> must not remove the tuple while someone may still read it. The DBMS marks it with a <b>deleted flag</b> or an end timestamp, or writes a <b>tombstone</b> version, and garbage collection removes it later.</p>

<h3>6. The trade-off</h3>
<p>MVCC buys concurrency: readers never wait. It pays with extra storage, version chains to traverse, cleanup work, and a write cost per update. The cost lands in different places by design: append-only needs vacuum and bloats tables, delta storage keeps tables compact and makes old reads slower, time-travel moves history to a separate table. In every design, long transactions hurt.</p>

<h3>7. Syntax</h3>
<pre>-- PostgreSQL: each row version carries hidden transaction ids
SELECT xmin, xmax, ctid, * FROM orders WHERE id = 42;
--   xmin = creating transaction, xmax = deleting or updating transaction

-- what is holding back cleanup: the oldest open snapshot
SELECT pid, state, xact_start, backend_xmin FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL ORDER BY age(backend_xmin) DESC LIMIT 5;

-- dead versions waiting for vacuum
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 5;

-- stop a stuck snapshot from pinning old versions
SET idle_in_transaction_session_timeout = '5min';
VACUUM (VERBOSE) orders;
--   dead row versions cannot be removed yet, oldest xmin: 71230044</pre>
<p><code>dead row versions cannot be removed yet</code> in a vacuum report means an old snapshot is pinning them. Find its owner before you tune vacuum.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `An <code>orders</code> table that is updated all day has grown from 200 GB to 340 GB (illustrative). Autovacuum runs every few minutes and reclaims almost nothing, queries on the table get slower every day, and a report session that started yesterday is still open and idle in a transaction. Updates that change an indexed column also take twice as long as before.`,
    predict: {
      q: `A report holds a snapshot taken at time 100 and stays open. Short transactions then update one tuple at 110, 120 and 130. Cleanup uses the oldest active snapshot as its horizon. How many of the old versions can it remove while the report is open?`,
      opts: [
        `None: each old version ended after time 100, so the report might still need it`,
        `All three: only the newest version is ever needed`,
        `One: the version the report reads, and the other two are removed`,
        `All of them, because a vacuum can interrupt the report`
      ],
      ans: 0,
      why: `The cleanup horizon is the oldest snapshot, 100. A version is removable only if it ended at or before that horizon. Every old version ended after 100, so none is removable until the report ends.`
    },
    diagnose: [
      OLD.diagnose[0],
      {
        t: 'Updates rewrite every index',
        sym: '<b>Updates</b> on a table with many indexes are slow, and the indexes grow as fast as the table.',
        ctx: 'Each update writes a new tuple version in a new place. With physical pointers in the secondary indexes, every index needs a new entry for the new version.',
        why: 'The location of the tuple changes with every version, and indexes point at locations. Each update therefore touches the table and all of its indexes, even if the changed column is not indexed.',
        log: `-- representative PostgreSQL statistics, counts illustrative
 n_tup_upd | n_tup_hot_upd
 41,200,000 |        3,120   (0.01% HOT)
indexes on orders: 7   index size: 118 GB   table size: 200 GB`,
        note: 'A tiny HOT share on an update-heavy table means every update writes to every index.',
        fix: [
          'Measure first: compare <code>n_tup_hot_upd</code> with <code>n_tup_upd</code> in <code>pg_stat_user_tables</code>.',
          'Lower <code>fillfactor</code> on the table, for example to 80, so new versions fit on the same page and updates can be heap-only.',
          'Do not index columns that change often, and drop unused indexes (chapter 7).',
          'Verify: the HOT share and the update latency should both improve.'
        ]
      },
      {
        t: 'Long delta chains slow reads',
        sym: '<b>A read of an old snapshot</b> takes many times longer than a read of the newest data.',
        ctx: 'The engine stores old versions as deltas in an undo log. A long-running read needs a version that is many updates old, so it replays a long run of deltas.',
        why: 'With delta storage the newest tuple is in the table and the history is a chain of changes. Rebuilding an old version applies deltas one by one, so the cost grows with the number of updates since the snapshot.',
        log: `-- representative InnoDB status, illustrative
History list length 48,300,210
-- a consistent read of an hour-old snapshot applies on average 380 undo records per row`,
        note: 'A very large history list length means a read view is holding back purge of the undo log.',
        fix: [
          'Measure first: read the history list length, for example <code>SHOW ENGINE INNODB STATUS</code>.',
          'Find and end the long transaction or read view that holds back the purge.',
          'Run long reports on a replica, so they do not pin undo records on the primary.',
          'Verify: history list length should fall, and old-snapshot reads should speed up.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[22] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [mvcc, vstore, gc] };
})();
