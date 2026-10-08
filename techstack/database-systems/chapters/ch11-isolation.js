/* Chapter 11 · isolation · Transactions and isolation.
   Owns: ACID, schedules, conflicts, serializability, isolation levels and anomalies, write skew.
   Points elsewhere: 2PL and MVCC protocols (chapter 12), logging and recovery (chapter 13). */
PG.isolation = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch11-css', `
.ch11-board{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}
.ch11-card{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card);min-width:120px;display:flex;flex-direction:column;gap:2px;color:var(--ink)}
.ch11-card small{color:var(--mut);font-size:12px}
.ch11-card b{font-size:15px}
.ch11-card.off{background:var(--soft)}
.ch11-card.bad{border-color:var(--bad)}
.ch11-card.ok{border-color:var(--ok)}
.ch11-tl{width:100%;border-collapse:collapse;font-size:13px}
.ch11-tl td{border-bottom:1px solid var(--line);padding:6px 8px;color:var(--ink);text-align:left;vertical-align:top}
.ch11-tl td.n{color:var(--mut);width:52px;font-variant-numeric:tabular-nums}
.ch11-tl td.tx{width:56px;font-weight:600}
.ch11-verdict{font-weight:700;margin:8px 0 0;color:var(--ink)}
.ch11-verdict.bad{color:var(--bad)}
.ch11-verdict.ok{color:var(--ok)}
.ch11-row{display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;font-size:13px;margin:6px 0}
.ch11-row small{color:var(--mut)}
@media (max-width:480px){.ch11-row{grid-template-columns:1fr}}
`);

  /* ---------- the engine: two on-call transactions, run under a level and a schedule ---------- */
  const LEVEL_NAME = { rc: 'Read Committed', rr: 'Repeatable Read (locking)', si: 'Snapshot Isolation', ser: 'Serializable' };
  const TX = { T1: { self: 'alice', other: 'bob', who: 'Alice\u2019s transaction' }, T2: { self: 'bob', other: 'alice', who: 'Bob\u2019s transaction' } };
  const SCHEDS = {
    interleaved: { name: 'Interleaved: both read before either commits', ops: [['T1', 'begin'], ['T2', 'begin'], ['T1', 'read'], ['T2', 'read'], ['T1', 'write'], ['T2', 'write'], ['T1', 'commit'], ['T2', 'commit']] },
    serial: { name: 'Serial: one transaction finishes first', ops: [['T1', 'begin'], ['T1', 'read'], ['T1', 'write'], ['T1', 'commit'], ['T2', 'begin'], ['T2', 'read'], ['T2', 'write'], ['T2', 'commit']] }
  };
  const onOff = v => (v ? 'on' : 'off');
  /* one run of the two on-call transactions. Each step: {t: sentence, text: same sentence, tx, committed} */
  function runOnCall(level, sched) {
    const committed = { alice: true, bob: true };
    const log = [];                       // commits that wrote something: { tx, keys }
    const st = {};
    const steps = [];
    const snap = () => ({ alice: committed.alice, bob: committed.bob });
    const push = (text, tx) => steps.push({ t: text, text, tx, committed: snap() });
    const locks = level === 'rr';         // read locks are held until commit, so reads see committed data
    for (const [tn, op] of sched.ops) {
      const T = TX[tn], O = st[tn === 'T1' ? 'T2' : 'T1'];
      const S = st[tn] || (st[tn] = { snap: null, startLog: 0, readVal: null, wrote: false, reads: [], aborted: false, done: false, waiting: false, pendingWrite: false });
      if (S.aborted) continue;
      if (op === 'begin') {
        S.snap = snap(); S.startLog = log.length;
        push(T.who + ' starts. ' + (level === 'rc' || locks ? 'Each read sees the latest committed data.' : 'Reads see the data as it was at this start.'), tn);
      } else if (op === 'read') {
        S.readVal = (level === 'rc' || locks ? committed : S.snap)[T.other]; S.reads.push(T.other);
        push(T.who + ' reads ' + T.other + ': ' + onOff(S.readVal) + (locks ? ' (shared lock held until commit).' : '.'), tn);
      } else if (op === 'write') {
        // under locking, a write needs an exclusive lock on its row; the other transaction may hold a read lock on it
        const blocked = locks && O && !O.aborted && !O.done && O.reads.includes(T.self);
        if (blocked && O.waiting) {
          S.aborted = true; S.done = true;
          push('Deadlock: each transaction waits for a lock the other holds. ' + T.who + ' is the one aborted.', tn);
          O.waiting = false; O.wrote = O.pendingWrite;
          push(TX[tn === 'T1' ? 'T2' : 'T1'].who + ' gets its lock and ' + (O.wrote ? 'sets ' + TX[tn === 'T1' ? 'T2' : 'T1'].self + ' off.' : 'makes no change.'), tn === 'T1' ? 'T2' : 'T1');
        } else if (blocked) {
          S.waiting = true; S.pendingWrite = !!S.readVal;
          push(T.who + ' wants to set ' + T.self + ' off, but ' + (tn === 'T1' ? 'Bob\u2019s' : 'Alice\u2019s') + ' transaction holds a read lock on ' + T.self + '. It waits.', tn);
        } else {
          S.wrote = !!S.readVal;
          push(S.readVal ? T.who + ' sees ' + T.other + ' on call, so it will set ' + T.self + ' off (held until commit).' : T.who + ' sees ' + T.other + ' off, so it makes no change.', tn);
        }
      } else if (op === 'commit') {
        let reason = null;
        if (level !== 'rc' && S.wrote && log.slice(S.startLog).some(c => c.keys.includes(T.self))) reason = T.self + ' was changed by a commit made after this transaction started';
        if (!reason && level === 'ser') {
          const hit = log.slice(S.startLog).find(c => c.keys.some(k => S.reads.includes(k)));
          if (hit) reason = 'a value this transaction read was changed by ' + hit.tx + ' after it started';
        }
        S.done = true;
        if (reason) { S.aborted = true; push(T.who + ' cannot commit: ' + reason + '. It is aborted.', tn); }
        else {
          if (S.wrote) { committed[T.self] = false; log.push({ tx: tn, keys: [T.self] }); }
          push(T.who + ' commits' + (S.wrote ? ', and ' + T.self + ' is now off.' : ', with no change.'), tn);
        }
      }
    }
    // the application retries each aborted transaction against the current committed data
    for (const tn of ['T1', 'T2']) {
      if (!st[tn] || !st[tn].aborted) continue;
      const T = TX[tn], readVal = committed[T.other];
      if (readVal && committed[T.self]) { committed[T.self] = false; push(T.who + ' retries: it reads ' + T.other + ' on call and sets ' + T.self + ' off.', tn); }
      else push(T.who + ' retries: it reads ' + T.other + ' ' + onOff(readVal) + ' and makes no change.', tn);
    }
    const final = snap();
    return { steps, final, ok: final.alice || final.bob };
  }
  const countOn = s => (s.alice ? 1 : 0) + (s.bob ? 1 : 0);

  /* ---------- 1 · The problem ---------- */
  const problemSec = sec('1 · The problem',
    para('Two doctors are on call. A rule says at least one must stay on call. Each doctor’s request checks that the other is on call, and then goes off call.'),
    para('Each request is correct when it runs alone. But if both read before either one writes, both can go off call.'),
    para('Concurrent transactions must not expose each other’s half-finished work. The question is how much of it each one may see.'),
    h('p', { class: 'sx-q', html: 'Which intermediate states may one transaction observe from another, and how much does that cost?' }));

  /* ---------- 2 · Core idea and mechanisms ---------- */
  const serEx = (() => {
    // schedule R1(A) W2(A) R2(B) W1(B): build the precedence graph in code
    const ops = [['T1', 'R', 'A'], ['T2', 'W', 'A'], ['T2', 'R', 'B'], ['T1', 'W', 'B']];
    const edges = [];
    ops.forEach((a, i) => ops.forEach((b, j) => {
      if (i < j && a[0] !== b[0] && a[2] === b[2] && (a[1] === 'W' || b[1] === 'W')) {
        const e = a[0] + ' to ' + b[0];
        if (!edges.includes(e)) edges.push(e);
      }
    }));
    const cyclic = edges.includes('T1 to T2') && edges.includes('T2 to T1');
    return { edges, cyclic };
  })();

  const mechSec = sec('2 · Core idea and mechanisms',
    para('<b>Core idea:</b> an isolation level defines which intermediate transaction states other transactions may observe.'),
    h('ul', { class: 'sx-list', html: [
      '<b>Why transactions:</b> a transaction is a group of reads and writes that succeeds or fails as one unit. It starts with BEGIN and ends with COMMIT or ABORT. Its effects outside the database, such as an email, cannot be rolled back.',
      '<b>Atomicity:</b> all actions happen, or none does. The DBMS does this with a log of undo records (chapter 13), or with shadow pages that become visible only at commit.',
      '<b>Consistency:</b> the database satisfies its rules before and after each transaction. The database enforces constraints, but the application decides which states are valid for its business rules.',
      '<b>Isolation:</b> a concurrent run must end in a state that some serial run could produce. Pessimistic protocols block conflicting work. Optimistic protocols let it run and check at commit. Both are chapter 12.',
      '<b>Durability:</b> committed changes survive a crash. This is the job of the log and of recovery (chapter 13).',
      '<b>Schedule:</b> the order in which the operations of several transactions run. A serial schedule runs one transaction at a time. A serializable schedule gives the same result as some serial schedule.',
      '<b>Conflicts:</b> two operations conflict when they touch the same object, come from different transactions, and at least one writes. Three kinds: read-write (unrepeatable read), write-read (dirty read), and write-write (lost update).',
      '<b>Conflict serializability:</b> a schedule is serializable when its precedence graph has no cycle. Each transaction is a node, and an edge Ti to Tj means an operation of Ti conflicts with a later operation of Tj. DBMSs check this rule because it is efficient to enforce.',
      '<b>View serializability:</b> allows more schedules, including blind writes. It is hard to enforce, because the DBMS does not know how the application reads the values, so it is rarely used. The course orders the sets as: serial inside conflict serializable, inside view serializable, inside all schedules.'
    ].map(x => '<li>' + x + '</li>').join('') }),
    para('<b>Example, computed in code:</b> the schedule R1(A), W2(A), R2(B), W1(B). Edges: ' + serEx.edges.map(e => '<b>' + e + '</b>').join(', ') + '. ' +
      (serEx.cyclic ? 'The graph has a cycle, so the schedule is not conflict serializable.' : 'The graph has no cycle, so the schedule is conflict serializable.')),
    para('<b>Isolation levels.</b> Each level allows a set of anomalies. Weaker levels allow more concurrency, and the price is paid in anomalies.'),
    h('div', { style: 'overflow-x:auto;max-width:100%' }, h('table', { class: 'sx-table sx-cmp' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Level'), h('th', {}, 'Dirty read'), h('th', {}, 'Unrepeatable read'), h('th', {}, 'Phantom'), h('th', {}, 'Lost update'), h('th', {}, 'Write skew'))),
      h('tbody', {}, [
        ['Read Uncommitted', 'may', 'may', 'may', 'may', 'may (inferred)'],
        ['Read Committed', 'no', 'may', 'may', 'may', 'may (inferred)'],
        ['Repeatable Read (locking)', 'no', 'no', 'may', 'not stated', 'no (inferred: read locks)'],
        ['Snapshot Isolation', 'no', 'no', 'no', 'no (first writer wins)', 'may'],
        ['Serializable', 'no', 'no', 'no', 'no', 'no']
      ].map(r => h('tr', {}, r.map((c, i) => h('td', { class: i === 0 ? 'sx-cmp-k' : '' }, c))))))),
    para('Sources: the course notes, 15-445 timestamp ordering notes, section 4. Items 1 to 4 list the levels: Serializable (no phantoms, repeatable reads, no dirty reads), Repeatable Reads (phantoms may happen), Read Committed (phantoms, unrepeatable reads and lost updates may happen), and Read Uncommitted (all anomalies may happen). Entries marked inferred are not stated in the notes: write skew at the lower levels follows from "all anomalies may happen", and the read-lock entry for Repeatable Read follows from strict 2PL. Snapshot Isolation comes from the multiversioning notes, which name write skew. How each level is enforced is chapter 12.'));

  /* ---------- 3 · Playground ---------- */
  function playground() {
    const st = { level: 'si', sched: 'interleaved' };
    const view = h('div', { class: 'sx-vis' });
    const paint = () => {
      const r = runOnCall(st.level, SCHEDS[st.sched]);
      const rows = r.steps.map((s, i) => h('tr', {}, h('td', { class: 'n' }, String(i + 1)), h('td', { class: 'tx' }, s.tx), h('td', {}, s.text)));
      const board = h('div', { class: 'ch11-board' },
        h('div', { class: 'ch11-card ' + (r.final.alice ? '' : 'off') }, h('small', {}, 'Alice'), h('b', {}, onOff(r.final.alice))),
        h('div', { class: 'ch11-card ' + (r.final.bob ? '' : 'off') }, h('small', {}, 'Bob'), h('b', {}, onOff(r.final.bob))),
        stat('doctors on call', countOn(r.final)));
      view.replaceChildren(
        h('p', { class: 'sx-txt' }, 'Schedule: ' + SCHEDS[st.sched].name + '. Isolation: ' + LEVEL_NAME[st.level] + '.'),
        h('table', { class: 'ch11-tl' }, rows),
        h('div', { class: 'ch11-verdict ' + (r.ok ? 'ok' : 'bad') }, r.ok ? 'Invariant holds: at least one doctor is on call.' : 'Invariant broken: nobody is on call.'),
        board);
    };
    paint();
    const opt = (label, key, opts) => h('div', { style: 'max-width:100%;overflow-x:auto' }, h('small', {}, label), seg(opts, st[key], v => { st[key] = v; paint(); }));
    return h('div', { class: 'sx-play' },
      h('div', { class: 'sx-controls' },
        opt('Isolation level', 'level', [{ v: 'rc', l: 'Read Committed' }, { v: 'rr', l: 'Repeatable Read' }, { v: 'si', l: 'Snapshot Isolation' }, { v: 'ser', l: 'Serializable' }]),
        opt('Schedule', 'sched', [{ v: 'interleaved', l: 'Interleaved' }, { v: 'serial', l: 'Serial' }])),
      view);
  }

  /* ---------- 5 · Common problems ---------- */
  function boardDraw(c) {
    return h('div', { class: 'ch11-board' },
      h('div', { class: 'ch11-card ' + (c.alice ? '' : 'off') }, h('small', {}, 'Alice'), h('b', {}, onOff(c.alice))),
      h('div', { class: 'ch11-card ' + (c.bob ? '' : 'off') }, h('small', {}, 'Bob'), h('b', {}, onOff(c.bob))));
  }
  function writeSkewDemo(mode) {
    const r = runOnCall(mode === 'bad' ? 'si' : 'ser', SCHEDS.interleaved);
    const states = [{ t: 'Start: Alice and Bob are both on call. The rule is that at least one stays on call.', committed: { alice: true, bob: true } }, ...r.steps];
    states.push({ t: r.ok ? 'Final: at least one doctor is on call. The invariant holds.' : 'Final: nobody is on call. The invariant is broken.', committed: r.final, end: true });
    return stepper(states, s => [boardDraw(s.committed), h('div', { class: 'sx-stats' }, stat('doctors on call', countOn(s.committed)))]);
  }
  function lostUpdateDemo(mode) {
    const BAL = 100, ADD = 50, EXPECT = BAL + ADD + ADD;
    const bad = mode === 'bad';
    const states = [
      { t: 'Start: the balance is ' + BAL + '. Two transactions each add ' + ADD + ', so the correct result is ' + EXPECT + '.', v: BAL },
      { t: 'T1 reads ' + BAL + ' and plans to write ' + (BAL + ADD) + '.', v: BAL },
      { t: 'T2 reads ' + BAL + ' and plans to write ' + (BAL + ADD) + '.', v: BAL },
      { t: 'T1 writes ' + (BAL + ADD) + ' and commits.', v: BAL + ADD }
    ];
    if (bad) states.push({ t: 'T2 writes ' + (BAL + ADD) + ' from its old read and commits. T1’s +' + ADD + ' is lost. Expected ' + EXPECT + ', got ' + (BAL + ADD) + '.', v: BAL + ADD, end: true });
    else {
      states.push({ t: 'T2 tries to commit. The row changed after its snapshot, so the first committer wins and T2 is aborted.', v: BAL + ADD, abort: true });
      states.push({ t: 'The application retries T2: it reads ' + (BAL + ADD) + ' and writes ' + (BAL + 2 * ADD) + '.', v: BAL + 2 * ADD });
      states.push({ t: 'Final balance: ' + (BAL + 2 * ADD) + '. Expected ' + EXPECT + '. No update was lost.', v: BAL + 2 * ADD, end: true });
    }
    return stepper(states, s => [h('div', { class: 'sx-stats' }, stat('committed balance', s.v), stat('expected', EXPECT), stat('status', s.abort ? 'T2 aborted' : s.end ? (s.v === EXPECT ? 'correct' : 'lost update') : 'running'))]);
  }
  function doubleBookDemo(mode) {
    const bad = mode === 'bad';
    const COUNT = bad ? 2 : 1;
    const states = [
      { t: 'Start: room 101 at 10:00 has no booking. Two requests arrive at the same time.', n: 0 },
      { t: 'T1 checks the room: 0 bookings. T2 checks the room: 0 bookings. Both see it as free.', n: 0 },
      bad ? { t: 'T1 inserts its booking. T2 inserts its booking. No rule stops the second insert.', n: 1 }
        : { t: 'T1 inserts its booking. T2 inserts the same room and time, and the unique index rejects it.', n: 1, err: 'representative: ERROR: duplicate key value violates unique constraint "bookings_room_slot_key"' },
      { t: bad ? 'Both commit. Bookings for room 101 at 10:00: ' + COUNT + '. The room is double-booked.' : 'T2 shows the room as taken. Bookings for room 101 at 10:00: ' + COUNT + '.', n: COUNT, end: true }
    ];
    return stepper(states, s => [h('div', { class: 'sx-stats' }, stat('bookings', s.n), stat('room', s.n > 1 ? 'double-booked' : s.n === 1 ? 'booked once' : 'free')),
      s.err ? h('p', { class: 'sx-p' }, h('code', {}, s.err)) : h('p', { class: 'sx-p' }, '')]);
  }
  function phantomDemo(mode) {
    const BEFORE = 2, AFTER = BEFORE + 1;
    const bad = mode === 'bad';
    const states = [
      { t: 'Start: the rota has ' + BEFORE + ' Monday shifts. T1 will count them twice.', c1: null, c2: null },
      { t: 'T1 counts Monday shifts: ' + BEFORE + '.', c1: BEFORE, c2: null },
      { t: 'T2 inserts a third Monday shift and commits.', c1: BEFORE, c2: null, ins: true },
      { t: bad ? 'T1 counts again: ' + AFTER + '. The same range query returns a new row, which is a phantom.' : 'T1 counts again from its snapshot: ' + BEFORE + '. The new row is not visible to T1.', c1: BEFORE, c2: bad ? AFTER : BEFORE, end: true }
    ];
    return stepper(states, s => [h('div', { class: 'sx-stats' }, stat('first count', s.c1 ?? '-'), stat('second count', s.c2 ?? '-'), stat('changed', s.c2 == null ? '-' : s.c2 !== s.c1 ? 'yes' : 'no'))]);
  }

  const PROBLEMS = [
    { tab: 'Concurrent updates overwrite each other', sym: 'the balance is 150, but two +50 updates should give 200.',
      why: 'Each transaction reads the balance, adds 50 in the application, and writes the result. Under Read Committed, the second write uses an old value and silently overwrites the first.',
      log: 'representative, illustrative\nstart balance: 100, two transactions add 50 each\nfinal balance: 150 (expected 200)',
      demo: v => lostUpdateDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Let the database do the update: UPDATE accounts SET balance = balance + 50 WHERE id = 1. The row lock makes it atomic.', 'Or use Snapshot Isolation, where the second committer aborts, and retry the transaction.', 'Or lock the row first with SELECT ... FOR UPDATE, then update it.', 'Verify: run the two transactions together, and check that the final balance is 200.'] },
    { tab: 'Snapshot Isolation permits write skew', sym: 'both doctors go off call, and nobody is on call.',
      why: 'Under Snapshot Isolation, each transaction reads a consistent snapshot. The two transactions write different rows, so the first-writer-wins rule never fires. Neither transaction sees the other’s write.',
      log: 'representative, from the interleaving in the playground\nlevel: Snapshot Isolation, schedule: both read before either commits\nDoctors on call at the end: ' + countOn(runOnCall('si', SCHEDS.interleaved).final),
      demo: v => writeSkewDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Use Serializable. It checks what each transaction read, aborts one of them, and the application retries it.', 'Or turn the rule into a write conflict: both transactions update one shared row, such as an on-call counter.', 'Or enforce the rule in the database, with a constraint or a trigger.', 'Verify: run the same interleaving, and check the invariant after both commits.'] },
    { tab: 'Check-then-insert double-books a resource', sym: 'two bookings exist for room 101 at 10:00.',
      why: 'The check and the insert are two steps. Both transactions run the check before either one inserts, so both see the room as free. Isolation levels do not help here, because there is no existing row to conflict on.',
      log: 'representative, illustrative\nSELECT count(*) FROM bookings WHERE room = 101 AND slot = \'10:00\'  -> 0 (in both transactions)\nbookings after both commits: 2',
      demo: v => doubleBookDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Add a unique index on (room, slot). The second insert fails, whatever the isolation level.', 'Handle the duplicate-key error in the application, and show the room as taken.', 'Or use Serializable with range or predicate protection, which a plain row check cannot give you.', 'Verify: run two inserts for the same room and time, and count the bookings.'] },
    { tab: 'Phantom rows invalidate a repeated range query', sym: 'the same Monday count changes from 2 to 3 inside one transaction.',
      why: 'A range query returns rows that match a condition. Another transaction can insert a new matching row between two reads. Under Read Committed each read sees the latest data, so the new row appears in the second read.',
      log: 'representative, illustrative\nT1: SELECT count(*) FROM shifts WHERE day = \'Mon\'\nfirst read: 2, second read after T2 commits: 3',
      demo: v => phantomDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['Run the transaction at Snapshot Isolation, so both reads come from one snapshot. In PostgreSQL, REPEATABLE READ is snapshot isolation, and it prevents phantom reads (PostgreSQL documentation, not in the course text).', 'Use Serializable when the rule depends on a range, and let the database detect the conflict.', 'Keep the transaction short, so there is less time for other commits.', 'Verify: count the rows in two reads inside one transaction, while another session inserts.'] }
  ];

  root.append(
    problemSec,
    mechSec,
    sec('3 · Playground: two on-call transactions, three isolation levels', playground()),
    sec('4 · Common problems · what breaks in production?', SX.problems(PROBLEMS)),
    sec('5 · Next', para('Chapter 12 shows the protocols that enforce these levels: two-phase locking, timestamp ordering, optimistic validation and MVCC. Chapter 13 covers the log that makes commits durable.'))
  );
};
