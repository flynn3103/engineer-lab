/* Chapter 20 "Transactions and Isolation" (index 19, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L16 Concurrency Control Theory (transactions, ACID, schedules, conflict serializability) and the isolation levels section of L18.
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a lost update on a time axis, write skew under snapshots, a precedence graph with a cycle, and a levels-against-anomalies matrix. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. Lost update: two read-modify-write transactions on one balance ---- */
  const SX = k => 112 + k * 82, LY1 = 112, LY2 = 176, LYD = 262;
  const timeline = {
    id: 'lost-update', label: 'Lost update', desc: 'Two requests each add 50 to the same balance of 100. Their reads and writes interleave on a time axis, and one addition disappears (amounts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'T1: SELECT balance FROM accounts WHERE id = 7;        -- 100',
      'T2: SELECT balance FROM accounts WHERE id = 7;        -- 100 (T1 has not written yet)',
      'T1: UPDATE accounts SET balance = 150 WHERE id = 7;   -- 100 + 50, computed in the app',
      'T2: UPDATE accounts SET balance = 150 WHERE id = 7;   -- overwrites with its own 100 + 50',
      'fix: UPDATE accounts SET balance = balance + 50 WHERE id = 7;   -- or SELECT ... FOR UPDATE',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one row, two transactions, time left to right. Illustrative.',
      header: s => ({ left: 'balance in the database: ' + (s.bal == null ? 100 : s.bal), right: s.right || 'interleaved' }),
      draw(P, s) {
        P.text('t1', { x: 30, y: LY1 + 20, t: 'T1', cls: 'b' }); P.text('t2', { x: 30, y: LY2 + 20, t: 'T2', cls: 'b' }); P.text('td', { x: 30, y: LYD + 18, t: 'row', cls: 'b' });
        P.line('g1', 100, LY1 + 36, 604, LY1 + 36, { tone: 'mut', sw: 0.8 }); P.line('g2', 100, LY2 + 36, 604, LY2 + 36, { tone: 'mut', sw: 0.8 }); P.line('g3', 100, LYD + 36, 604, LYD + 36, { tone: 'mut', sw: 0.8 });
        (s.ops || []).forEach(([lane, k, label, tone, sub], i) => P.chip('o' + i, { x: SX(k), y: lane === 1 ? LY1 : LY2, w: 76, h: 36, label, sub: sub || '', tone: tone || 'info' }));
        (s.vals || []).forEach(([k, label, tone], i) => P.chip('v' + i, { x: SX(k), y: LYD, w: 76, h: 36, label, tone: tone || 'info' }));
        if (s.wait) P.box('wt', { x: SX(s.wait[0]), y: LY2, w: (s.wait[1] - s.wait[0]) * 82 - 6, h: 36, tone: 'warn', label: 'waits for the row lock', cls: 'xs', dash: true });
        if (s.note) P.chip('nt', { x: 100, y: 318, w: 500, h: 26, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'An account row holds a balance of 100. Two requests are about to each add 50, so the correct final balance is 200.', callout: 'Balance 100, two +50 requests: expect 200', code: 0,
        state: { vals: [[0, '100', 'ok']], bal: 100 }, stats: [{ l: 'balance', v: '100' }, { l: 'expected', v: '200', cls: 'ok' }] },
      { log: 'T1 reads the balance and sees 100. Its application will compute 100 + 50 itself.', callout: 'T1 reads 100', code: 0,
        state: { ops: [[1, 0, 'read', 'cursor', '= 100']], vals: [[0, '100', 'ok']], bal: 100 }, stats: [{ l: 'T1 saw', v: '100' }] },
      { log: 'Before T1 writes anything, T2 reads the same row. It also sees 100, because nothing has changed yet.', callout: 'T2 reads 100 too', code: 1,
        state: { ops: [[1, 0, 'read', 'cursor', '= 100'], [2, 1, 'read', 'cursor', '= 100']], vals: [[0, '100', 'ok']], bal: 100 }, stats: [{ l: 'T2 saw', v: '100' }] },
      { log: 'T1 writes 150, which is the 100 it read plus 50, and commits. The row now holds 150.', callout: 'T1 writes 150', code: 2,
        state: { ops: [[1, 0, 'read', 'cursor', '= 100'], [2, 1, 'read', 'cursor', '= 100'], [1, 2, 'write', 'ok', '= 150']], vals: [[0, '100', 'info'], [2, '150', 'ok']], bal: 150 }, stats: [{ l: 'balance', v: '150' }] },
      { log: 'T2 writes 150 too. It computed 100 + 50 from the value it read earlier, so it overwrites T1 without ever seeing it.', callout: 'T2 overwrites T1: one +50 is lost', moment: true, code: 3,
        state: { ops: [[1, 0, 'read', 'cursor', '= 100'], [2, 1, 'read', 'cursor', '= 100'], [1, 2, 'write', 'ok', '= 150'], [2, 3, 'write', 'bad', '= 150']], vals: [[0, '100', 'info'], [2, '150', 'info'], [3, '150', 'bad']], bal: 150, note: 'two successful commits, no error, balance 150 instead of 200', noteTone: 'bad' }, stats: [{ l: 'balance', v: '150', cls: 'bad' }, { l: 'expected', v: '200', cls: 'ok' }] },
      { log: 'The fix is to make the read and the write one atomic step: UPDATE ... SET balance = balance + 50. T1 takes the row lock and writes first.', callout: 'Fix: one atomic UPDATE takes a row lock', code: 4,
        state: { ops: [[1, 0, 'update', 'ok', '+50 -> 150'], [2, 0, 'update', 'warn', '+50']], wait: [0, 2], vals: [[0, '100', 'info'], [1, '150', 'ok']], bal: 150, right: 'row lock' }, stats: [{ l: 'T2', v: 'waits', cls: 'warn' }] },
      { log: 'T1 commits and releases the lock. T2 then applies +50 to the committed 150 and writes 200. Both additions survive.', callout: 'T2 adds 50 to the committed 150', code: 4,
        state: { ops: [[1, 0, 'update', 'ok', '+50 -> 150'], [2, 2, 'update', 'ok', '+50 -> 200']], wait: [0, 2], vals: [[1, '150', 'info'], [3, '200', 'ok']], bal: 200, right: 'row lock', note: 'balance 200, as expected', noteTone: 'ok' }, stats: [{ l: 'balance', v: '200', cls: 'ok' }, { l: 'lost updates', v: '0', cls: 'ok' }],
        takeaway: 'A value read in one statement and written in the next can be stale. Do the change in one statement, or lock the row first.' },
    ],
  };

  /* ---- 2. Write skew: two snapshots, two different rows, one broken rule ---- */
  const wskew = {
    id: 'write-skew', label: 'Write skew', desc: 'At least one doctor must stay on call. Each transaction reads a snapshot, checks the other doctor and updates only its own row. Snapshot isolation sees no conflict (illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'invariant: at least one doctor is on call',
      "T1 (Alice): SELECT count(*) FROM doctors WHERE on_call;   -- 2, so Bob is covering",
      "T2 (Bob):   SELECT count(*) FROM doctors WHERE on_call;   -- 2, so Alice is covering",
      "T1: UPDATE doctors SET on_call = false WHERE name = 'Alice';",
      "T2: UPDATE doctors SET on_call = false WHERE name = 'Bob';   -- a different row: no conflict",
    ] },
    stage: DB.stage({
      footer: 'Simplified: two doctors, snapshot isolation. Illustrative.',
      header: s => ({ left: 'on call now: ' + (s.on == null ? 2 : s.on), right: s.right || '' }),
      draw(P, s) {
        P.text('hc', { x: 232, y: 84, t: 'doctors (the database)', cls: 'mut sm' });
        P.box('db', { x: 224, y: 92, w: 182, h: 128, tone: s.on === 0 ? 'bad' : 'mut', label: '', sw: 2 });
        P.chip('al', { x: 236, y: 104, w: 158, h: 44, label: 'Alice', sub: s.alice ? 'on call' : 'off call', tone: s.alice ? 'ok' : 'warn' });
        P.chip('bo', { x: 236, y: 160, w: 158, h: 44, label: 'Bob', sub: s.bob ? 'on call' : 'off call', tone: s.bob ? 'ok' : 'warn' });
        if (s.s1) { P.text('h1', { x: 30, y: 84, t: 'T1 snapshot (Alice)', cls: 'mut sm' }); P.box('s1', { x: 26, y: 92, w: 172, h: 128, tone: 'acc', label: '', op: 0.35, stroke: 'acc', dash: true }); P.chip('s1a', { x: 36, y: 104, w: 152, h: 44, label: 'Alice', sub: 'on call', tone: 'info' }); P.chip('s1b', { x: 36, y: 160, w: 152, h: 44, label: 'Bob', sub: 'on call', tone: 'info' }); }
        if (s.s2) { P.text('h2', { x: 430, y: 84, t: 'T2 snapshot (Bob)', cls: 'mut sm' }); P.box('s2', { x: 436, y: 92, w: 172, h: 128, tone: 'cursor', label: '', op: 0.35, stroke: 'cursor', dash: true }); P.chip('s2a', { x: 446, y: 104, w: 152, h: 44, label: 'Alice', sub: 'on call', tone: 'info' }); P.chip('s2b', { x: 446, y: 160, w: 152, h: 44, label: 'Bob', sub: 'on call', tone: 'info' }); }
        if (s.w1) P.line('w1', 198, 126, 234, 126, { tone: 'ok', arrow: true, label: 'writes Alice' , dy: -10 });
        if (s.w2) P.line('w2', 434, 182, 396, 182, { tone: 'ok', arrow: true, label: 'writes Bob', dy: -10 });
        if (s.msg) P.chip('m', { x: 30, y: 240, w: 580, h: 44, label: s.msg, sub: s.msgSub || '', tone: s.msgTone || 'info' });
        if (s.fix) P.chip('f', { x: 30, y: 294, w: 580, h: 44, label: s.fix, sub: s.fixSub || '', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'Two doctors, Alice and Bob, are on call. The rule is that at least one of them must stay on call.', callout: 'Rule: at least one doctor on call', code: 0,
        state: { alice: 1, bob: 1, on: 2 }, stats: [{ l: 'on call', v: '2', cls: 'ok' }] },
      { log: 'Alice asks to go off call. T1 starts and reads its snapshot: both doctors are on call, so it is safe for Alice to leave.', callout: 'T1 sees Bob on call: safe to leave', code: 1,
        state: { alice: 1, bob: 1, on: 2, s1: 1, msg: 'T1: count = 2, Bob covers, go ahead', msgTone: 'info' }, stats: [{ l: 'T1 count', v: '2' }] },
      { log: 'At the same moment Bob asks too. T2 reads its own snapshot, taken before T1 changes anything, and sees Alice on call.', callout: 'T2 sees Alice on call: safe to leave', code: 2,
        state: { alice: 1, bob: 1, on: 2, s1: 1, s2: 1, msg: 'T2: count = 2, Alice covers, go ahead', msgTone: 'info' }, stats: [{ l: 'T2 count', v: '2' }] },
      { log: 'T1 sets Alice off call. It writes only Alice\'s row.', callout: 'T1 writes only Alice\'s row', code: 3,
        state: { alice: 0, bob: 1, on: 1, s1: 1, s2: 1, w1: 1 }, stats: [{ l: 'on call', v: '1', cls: 'warn' }] },
      { log: 'T2 sets Bob off call. It writes a different row, so the first-writer-wins check never sees two writers of the same row.', callout: 'T2 writes a different row: no conflict', code: 4,
        state: { alice: 0, bob: 0, on: 0, s1: 1, s2: 1, w1: 1, w2: 1, msg: 'no write-write conflict was detected', msgTone: 'warn' }, stats: [{ l: 'conflicts found', v: '0', cls: 'warn' }] },
      { log: 'Both commit. Nobody is on call, the rule is broken, and the database logged no error. Each transaction was correct on its own.', callout: 'Both commit: nobody is on call', moment: true, code: 4,
        state: { alice: 0, bob: 0, on: 0, msg: 'invariant broken: 0 doctors on call', msgSub: 'both transactions committed', msgTone: 'bad' }, stats: [{ l: 'on call', v: '0', cls: 'bad' }, { l: 'errors', v: '0', cls: 'warn' }] },
      { log: 'Run both at SERIALIZABLE. The database tracks that each transaction read what the other wrote, and aborts one of them with a serialization failure. The retry sees Alice off call and refuses.', callout: 'SERIALIZABLE aborts one; the retry refuses', code: 4,
        state: { alice: 0, bob: 1, on: 1, msg: 'T2 aborted: could not serialize access', msgSub: 'SQLSTATE 40001, retry', msgTone: 'warn', fix: 'retry sees count = 1: Bob stays on call', fixSub: 'the rule holds', right: 'SERIALIZABLE' }, stats: [{ l: 'on call', v: '1', cls: 'ok' }, { l: 'retries', v: '1', cls: 'warn' }],
        takeaway: 'Snapshot isolation stops two writers of one row, not two readers who write different rows. Serializable closes that gap and needs a retry.' },
    ],
  };

  /* ---- 3. Precedence graph: a cycle between transactions means the schedule is not serializable ---- */
  const OPX = i => 40 + i * 140;
  const NODE1 = { x: 130, y: 196 }, NODE2 = { x: 420, y: 196 };
  const graph = {
    id: 'precedence-graph', label: 'Precedence graph', desc: 'Draw one node per transaction and an edge for every conflicting pair of operations in schedule order. A cycle means no serial order gives the same result (schedules illustrative).',
    codeLabel: 'Schedule',
    code: { bug: [
      'conflict: same object, different transactions, at least one is a write',
      'schedule A: R1(x) W1(x) R2(x) W2(x)      -- T1 runs, then T2',
      'edges: W1(x) before R2(x) and W2(x): T1 -> T2 only',
      'schedule B: R1(x) R2(x) W1(x) W2(x)      -- interleaved',
      'edges: R1(x) before W2(x): T1 -> T2, and R2(x) before W1(x): T2 -> T1: a cycle',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one object x, two transactions. Illustrative.',
      header: s => ({ left: 'edges ' + (s.edges || []).length, right: s.right || '' }),
      draw(P, s) {
        const ops = s.ops || [];
        P.text('ho', { x: 30, y: 84, t: 'schedule, left to right in time', cls: 'mut sm' });
        ops.forEach(([label, tone], i) => P.chip('op' + i, { x: OPX(i) - 8, y: 94, w: 120, h: 40, label, tone: tone || 'info' }));
        P.chip('n1', { x: NODE1.x, y: NODE1.y, w: 90, h: 50, label: 'T1', tone: s.cycle ? 'bad' : 'cursor' });
        P.chip('n2', { x: NODE2.x, y: NODE2.y, w: 90, h: 50, label: 'T2', tone: s.cycle ? 'bad' : 'acc' });
        (s.edges || []).forEach(([a, why], i) => {
          const fwd = a === '12';
          const y = fwd ? 206 : 232;
          P.line('e' + i, fwd ? NODE1.x + 90 : NODE2.x, y, fwd ? NODE2.x : NODE1.x + 90, y, { tone: s.cycle ? 'bad' : 'ok', arrow: true, sw: 2.6, label: why, dy: fwd ? -8 : 16 });
        });
        if (s.verdict) P.chip('vd', { x: 170, y: 292, w: 300, h: 38, label: s.verdict, tone: s.vtone || 'ok' });
      }
    }),
    bug: [
      { log: 'Schedule A: T1 reads and writes x, then T2 reads and writes x. The operations of the two transactions do not overlap.', callout: 'Schedule A: T1, then T2', code: 1,
        state: { ops: [['R1(x)', 'cursor'], ['W1(x)', 'cursor'], ['R2(x)', 'acc'], ['W2(x)', 'acc']] }, stats: [{ l: 'transactions', v: '2' }] },
      { log: 'W1(x) comes before R2(x) and both touch x, and one is a write. That conflict gives an edge from T1 to T2.', callout: 'W1(x) before R2(x): edge T1 to T2', code: 2,
        state: { ops: [['R1(x)', 'cursor'], ['W1(x)', 'warn'], ['R2(x)', 'warn'], ['W2(x)', 'acc']], edges: [['12', 'W1 < R2']] }, stats: [{ l: 'edges', v: '1' }] },
      { log: 'W1 before W2 and R1 before W2 add the same direction. Every edge goes from T1 to T2, so there is no cycle.', callout: 'All edges point the same way: no cycle', code: 2,
        state: { ops: [['R1(x)', 'cursor'], ['W1(x)', 'cursor'], ['R2(x)', 'acc'], ['W2(x)', 'acc']], edges: [['12', 'W1 < R2, W2']], verdict: 'serializable: equals T1 then T2', vtone: 'ok' }, stats: [{ l: 'cycles', v: '0', cls: 'ok' }] },
      { log: 'Schedule B interleaves them: both read x before either writes. This is the lost update from the first scene.', callout: 'Schedule B: both read, then both write', code: 3,
        state: { ops: [['R1(x)', 'cursor'], ['R2(x)', 'acc'], ['W1(x)', 'cursor'], ['W2(x)', 'acc']] }, stats: [{ l: 'transactions', v: '2' }] },
      { log: 'R1(x) comes before W2(x): the first conflict gives the edge T1 to T2.', callout: 'R1(x) before W2(x): edge T1 to T2', code: 4,
        state: { ops: [['R1(x)', 'warn'], ['R2(x)', 'acc'], ['W1(x)', 'cursor'], ['W2(x)', 'warn']], edges: [['12', 'R1 < W2']] }, stats: [{ l: 'edges', v: '1' }] },
      { log: 'But R2(x) also comes before W1(x). That gives an edge from T2 back to T1.', callout: 'R2(x) before W1(x): edge T2 to T1', code: 4,
        state: { ops: [['R1(x)', 'cursor'], ['R2(x)', 'warn'], ['W1(x)', 'warn'], ['W2(x)', 'acc']], edges: [['12', 'R1 < W2'], ['21', 'R2 < W1']] }, stats: [{ l: 'edges', v: '2', cls: 'warn' }] },
      { log: 'T1 must come before T2 and T2 before T1. No serial order can satisfy both, so schedule B is not serializable.', callout: 'A cycle: not serializable', moment: true, code: 4,
        state: { ops: [['R1(x)', 'bad'], ['R2(x)', 'bad'], ['W1(x)', 'bad'], ['W2(x)', 'bad']], edges: [['12', 'R1 < W2'], ['21', 'R2 < W1']], cycle: 1, verdict: 'cycle: no equal serial order', vtone: 'bad' }, stats: [{ l: 'cycles', v: '1', cls: 'bad' }, { l: 'serializable', v: 'no', cls: 'bad' }],
        takeaway: 'No cycle means serializable. Isolation levels differ in which cycles they allow.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A hospital rota service lets a doctor go off call only if another doctor is still on call. Alice and Bob are the two doctors on call, and they both tap \"go off call\" within the same second. Each request checks the other doctor, sees them on call, and succeeds. The night shift ends with nobody on call, and the database logged no error (illustrative).",
    "predict": {
      "q": "Both requests run at Snapshot Isolation. Both read before either commits, and each one updates only its own row. What happens?",
      "opts": [
        "Both commit, and nobody is on call",
        "The second commit is aborted, because first-writer-wins sees a conflict",
        "The second request blocks until the first commits, then sees the change",
        "The database rejects the second update with a constraint error"
      ],
      "ans": 0,
      "why": "Each transaction reads its own snapshot, and they write different rows, so the first-writer-wins rule never fires. This anomaly is called write skew, and Snapshot Isolation allows it."
    },
    "diagnose": [
      {
        "t": "Concurrent updates overwrite each other",
        "sym": "The balance is 150, but two +50 updates should give 200.",
        "ctx": "Two requests add to the same account at the same moment. Both succeed, and no error is logged.",
        "why": "Each transaction reads the balance, adds 50 in the application, and writes the result. Under Read Committed, the second write uses an old value and silently overwrites the first.",
        "log": "representative, illustrative\nstart balance: 100, two transactions add 50 each\nfinal balance: 150 (expected 200)",
        "fix": [
          "Measure first: run the two transactions together in a test and compare the final balance with the expected 200.",
          "Fix: let the database do the update: UPDATE accounts SET balance = balance + 50 WHERE id = 1. The row lock makes it atomic.",
          "Fix: or use Snapshot Isolation, where the second committer aborts, and retry the transaction.",
          "Fix: or lock the row first with SELECT ... FOR UPDATE, then update it.",
          "Verify: run the two transactions together, and check that the final balance is 200."
        ]
      },
      {
        "t": "Snapshot Isolation permits write skew",
        "sym": "Both doctors go off call, and nobody is on call.",
        "ctx": "Two requests that each check the other doctor commit at the same time. Each request is correct on its own.",
        "why": "Under Snapshot Isolation, each transaction reads a consistent snapshot. The two transactions write different rows, so the first-writer-wins rule never fires. Neither transaction sees the other’s write.",
        "log": "representative, from the interleaving in the playground\nlevel: Snapshot Isolation, schedule: both read before either commits\nDoctors on call at the end: 0",
        "fix": [
          "Measure first: write the rule down as an invariant (at least one doctor on call) and replay the interleaving where both read before either commits.",
          "Fix: use Serializable. It checks what each transaction read, aborts one of them, and the application retries it.",
          "Fix: or turn the rule into a write conflict: both transactions update one shared row, such as an on-call counter.",
          "Fix: or enforce the rule in the database, with a constraint or a trigger.",
          "Verify: run the same interleaving, and check the invariant after both commits."
        ]
      },
      {
        "t": "Check-then-insert double-books a resource",
        "sym": "Two bookings exist for room 101 at 10:00.",
        "ctx": "Two booking requests for the same room and time arrive together. Both pass the availability check.",
        "why": "The check and the insert are two steps. Both transactions run the check before either one inserts, so both see the room as free. Isolation levels do not help here, because there is no existing row to conflict on.",
        "log": "representative, illustrative\nSELECT count(*) FROM bookings WHERE room = 101 AND slot = '10:00'  -> 0 (in both transactions)\nbookings after both commits: 2",
        "fix": [
          "Measure first: count bookings per room and slot, and list any slot with more than one booking.",
          "Fix: add a unique index on (room, slot). The second insert fails, whatever the isolation level.",
          "Fix: handle the duplicate-key error in the application, and show the room as taken.",
          "Fix: or use Serializable with range or predicate protection, which a plain row check cannot give you.",
          "Verify: run two inserts for the same room and time, and count the bookings."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L16 Concurrency Control Theory; L18 Isolation Levels section (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/16-concurrencycontrol.pdf' };

  /* ---- 4. Isolation levels against anomalies ---- */
  const LEVELS = ['Read uncommitted', 'Read committed', 'Repeatable read', 'Snapshot isolation', 'Serializable'];
  const ANOM = ['dirty read', 'unrepeatable', 'lost update', 'phantom', 'write skew'];
  // 1 = possible, 0 = prevented
  const GRID = [[1, 1, 1, 1, 1], [0, 1, 1, 1, 1], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1], [0, 0, 0, 0, 0]];
  const matrix = {
    id: 'isolation-matrix', label: 'Isolation levels', desc: 'Which anomalies each isolation level lets through. Red means the anomaly can happen, green means the level prevents it. The first four levels follow the lecture; snapshot isolation is the multi-version level used by many engines (as implemented in common engines, simplified).',
    codeLabel: 'SQL',
    code: { bug: [
      'BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;   -- everything is possible',
      'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;     -- no dirty reads, the usual default',
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;    -- phantoms may happen (with strict 2PL)',
      'snapshot isolation: no phantom in reads, but write skew can happen',
      'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;       -- as if run one at a time',
    ] },
    stage: DB.stage({
      footer: 'Lock-based levels as in the lecture, plus snapshot isolation.',
      header: s => ({ left: s.hl || 'weakest to strongest', right: '' }),
      draw(P, s) {
        ANOM.forEach((a, c) => P.text('c' + c, { x: 212 + c * 80 + 38, y: 96, t: a, cls: 'xs mut', anchor: 'middle' }));
        LEVELS.forEach((l, r) => {
          if (r >= (s.rows || 0)) return;
          P.text('l' + r, { x: 24, y: 144 + r * 48, t: l, cls: 'sm' });
          GRID[r].forEach((v, c) => P.chip('x' + r + c, { x: 212 + c * 80, y: 124 + r * 48, w: 76, h: 36, label: v ? 'possible' : 'prevented', sub: '', tone: v ? 'bad' : 'ok', small: true, hl: s.hit && s.hit[0] === r && s.hit[1] === c }));
        });
        if (s.note) P.chip('nt', { x: 24, y: 354, w: 580, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Read uncommitted lets a transaction read data another transaction has not committed. Every anomaly is possible, so it is rarely used for anything that matters.', callout: 'Read uncommitted: all anomalies', code: 0, state: { rows: 1, hit: [0, 0], note: 'a rolled-back value can be read' }, stats: [{ l: 'anomalies possible', v: '5 of 5', cls: 'bad' }] },
      { log: 'Read committed stops dirty reads: a reader sees only committed values. But a second read in the same transaction can see a different value, and two read-modify-write transactions can overwrite each other.', callout: 'Read committed: no dirty reads', code: 1, state: { rows: 2, hit: [1, 2], note: 'lost updates and phantoms still happen' }, stats: [{ l: 'anomalies possible', v: '4 of 5', cls: 'warn' }] },
      { log: 'Repeatable read holds read locks until the end, so re-reading a row gives the same value and lost updates are prevented. A new row that matches a range can still appear: a phantom.', callout: 'Repeatable read: only phantoms remain', moment: true, code: 2, state: { rows: 3, hit: [2, 3], note: 'phantoms: the same range query returns a new row' }, stats: [{ l: 'anomalies possible', v: '1 of 5', cls: 'warn' }] },
      { log: 'Snapshot isolation, used by multi-version engines, reads one consistent snapshot, so reads and ranges are stable. It allows write skew: two transactions each read both rows and update a different one.', callout: 'Snapshot: stable reads, write skew possible', code: 3, state: { rows: 4, hit: [3, 4], note: 'two doctors go off call: write skew' }, stats: [{ l: 'anomalies possible', v: '1 of 5', cls: 'warn' }] },
      { log: 'Serializable prevents all of them: the result is the same as some serial order. It does that with strict 2PL plus phantom protection such as index locks, or with conflict detection that aborts a transaction, so it costs waits or retries.', callout: 'Serializable: none, at a price', code: 4, state: { rows: 5, note: 'cost: locks and waiting, or aborts and retries', noteTone: 'ok' }, stats: [{ l: 'anomalies possible', v: '0 of 5', cls: 'ok' }],
        takeaway: 'Each stronger level removes anomalies and costs concurrency. Choose the weakest level whose remaining anomalies your application can tolerate.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why transactions exist</h3>
<p>The lecture starts from the flat file again (chapter 1) and asks two questions. What if two users update the same record at the same time, and what if the machine crashes in the middle of an update? Without help, two increments of a balance can produce one, and a transfer can leave money withdrawn and never deposited. A <b>transaction</b> is the unit that makes this safe: a sequence of reads and writes executed as one logical operation, started by <code>BEGIN</code> and ended by <code>COMMIT</code> or <code>ABORT</code>. A commit makes all its changes visible and durable. An abort undoes them all.</p>
<figure class="mm" aria-label="State diagram of a transaction from begin to committed or aborted" style="--diagram-width:460px">
  <img src="diagrams/ch19-txn-states.svg" alt="State diagram: a transaction begins Active. When commit is requested it becomes Partially committed and then Committed once the log is flushed. An error or conflict makes it Failed, then Aborted after its changes are undone. A rollback goes from Active directly to Aborted.">
  <figcaption>State diagram: the life of a transaction. Only the Committed state is permanent.</figcaption>
</figure>

<h3>2. ACID</h3>
<p><b>Atomicity</b>: all of the transaction&rsquo;s actions happen or none do. Two ways to achieve it: <b>logging</b> records the changes so they can be undone (the approach of nearly every system, chapters 24 and 25), or <b>shadow paging</b> copies pages and swaps a pointer at commit. <b>Consistency</b>: the database satisfies its constraints before and after, and the application&rsquo;s own rules hold. Database consistency means the data is correct and later reads see earlier committed writes. <b>Isolation</b>: each transaction behaves as if it ran alone, the subject of the rest of this part of the course. <b>Durability</b>: once committed, the changes survive a crash, ensured by a log flushed to stable storage and by checkpoints.</p>

<h3>3. Isolation: schedules and serializability</h3>
<p>A <b>schedule</b> is the order in which operations of concurrent transactions run. A <b>serial</b> schedule runs transactions one after another and is trivially correct. Two schedules are <b>equivalent</b> if they leave the same final state. A schedule is <b>serializable</b> if it is equivalent to some serial one, so it gives the benefit of concurrency without the risk. Conflicts decide. Two operations <b>conflict</b> if they touch the same object in different transactions and at least one is a write: <b>read-write</b> (unrepeatable read), <b>write-read</b> (dirty read) and <b>write-write</b> (lost update). <b>Conflict serializability</b>, the notion databases enforce, is tested with a <b>precedence graph</b>: one node per transaction and an edge Ti to Tj when an operation of Ti conflicts with a later operation of Tj. If the graph has a cycle the schedule is not serializable. A more general <b>view serializability</b> exists but is too costly to check.</p>
<figure class="mm" aria-label="Flowchart for testing conflict serializability with a precedence graph" style="--diagram-width:360px">
  <img src="diagrams/ch19-serializable-test.svg" alt="Flowchart: take a schedule, find conflicting operation pairs on the same object from different transactions with at least one write, draw an edge from Ti to Tj when the operation of Ti came first, and test for a cycle. No cycle means conflict serializable and a topological order is the equivalent serial order. A cycle means no serial order gives the same result.">
  <figcaption>Flowchart: the precedence-graph test.</figcaption>
</figure>

<h3>4. Isolation levels and anomalies</h3>
<p>Full serializability limits concurrency, so systems offer weaker levels. The anomalies: a <b>dirty read</b> reads uncommitted data; an <b>unrepeatable read</b> gets a different value on a second read; a <b>lost update</b> overwrites another transaction&rsquo;s write; a <b>phantom</b> makes a range query return different rows. The SQL-92 levels from strongest to weakest: <b>SERIALIZABLE</b> (no anomalies), <b>REPEATABLE READ</b> (phantoms may happen), <b>READ COMMITTED</b> (also unrepeatable reads and lost updates may happen), <b>READ UNCOMMITTED</b> (everything may happen). SQL-92 defined them by anomalies that appear in a lock-based system, so multi-version engines add <b>snapshot isolation</b>, which prevents these four but permits <b>write skew</b>, seen in the first scene. An application chooses a level per transaction.</p>

<h3>5. The trade-off</h3>
<p>Strong isolation removes a class of bugs that are hard to find, and costs lock waits or aborted transactions. Weak isolation raises throughput and moves the correctness burden to the application, which must use explicit locks or constraints where it matters. The next three chapters show the mechanisms that implement the levels: locking, timestamps and versions.</p>

<h3>6. Syntax</h3>
<pre>-- set the level for one transaction (PostgreSQL syntax)
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE accounts SET balance = balance - 30 WHERE id = 'A';
UPDATE accounts SET balance = balance + 30 WHERE id = 'B';
COMMIT;                -- may fail with SQLSTATE 40001: retry the whole transaction

-- see the default and the current setting
SHOW default_transaction_isolation;
SHOW transaction_isolation;

-- a lost update guard under read committed
SELECT balance FROM accounts WHERE id = 'A' FOR UPDATE;   -- takes the row lock first

-- a constraint that stops the anomaly in the data
ALTER TABLE bookings ADD CONSTRAINT one_booking EXCLUDE USING gist (room WITH =, during WITH &amp;&amp;);</pre>
<p>Under serializable and repeatable read, code must be ready to <b>retry</b> on a serialization failure. A transaction that fails and is not retried is lost work.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: OLD.diagnose,
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[19] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [timeline, wskew, graph, matrix] };
})();
