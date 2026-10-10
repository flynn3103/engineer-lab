/* Chapter 21 "Two-Phase Locking" (index 20, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L17 Two-Phase Locking (lock modes, growing and shrinking phases, strict 2PL, deadlock detection and prevention, lock granularity and intention locks).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: plain against strict 2PL on a lock timeline, a deadlock cycle in a lock table, intention locks on a hierarchy, and wait-die against wound-wait. Times illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 2. 2PL: a lock table where opposite lock order closes a cycle ---- */
  const lockTable = {
    id: 'lock-deadlock', label: 'Deadlock', desc: 'Two transfers lock the same two accounts in opposite order. Each holds one lock and waits for the other, which no commit can resolve until the detector aborts one (accounts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'T1 (A -> B):  UPDATE accounts SET balance = balance - 10 WHERE id = A;   -- X lock on A',
      'T2 (B -> A):  UPDATE accounts SET balance = balance - 10 WHERE id = B;   -- X lock on B',
      'T1: UPDATE ... WHERE id = B;   -- waits for T2',
      'T2: UPDATE ... WHERE id = A;   -- waits for T1: a cycle',
      'ERROR:  deadlock detected -- fix: every code path locks accounts in id order',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two rows, exclusive locks held until commit (strict 2PL). Illustrative.',
      header: s => ({ left: 'waiting transactions ' + (s.waiting || 0), right: s.right || 'lock manager' }),
      draw(P, s) {
        P.text('ha', { x: 250, y: 84, t: 'lock table', cls: 'mut sm' });
        P.box('rowA', { x: 230, y: 96, w: 180, h: 76, tone: 'mut', label: '', sw: 2 }); P.text('la', { x: 240, y: 114, t: 'row A', cls: 'sm b' });
        P.box('rowB', { x: 230, y: 188, w: 180, h: 76, tone: 'mut', label: '', sw: 2 }); P.text('lb', { x: 240, y: 206, t: 'row B', cls: 'sm b' });
        if (s.holdA) P.chip('ha1', { x: 244, y: 122, w: 152, h: 38, label: s.holdA + ' holds X', tone: 'ok', small: true });
        if (s.holdB) P.chip('hb1', { x: 244, y: 214, w: 152, h: 38, label: s.holdB + ' holds X', tone: 'ok', small: true });
        if (s.t1) P.chip('t1', { x: 30, y: 130, w: 150, h: 54, label: 'T1', sub: s.t1, tone: s.t1Tone || 'cursor' });
        if (s.t2) P.chip('t2', { x: 460, y: 130, w: 150, h: 54, label: 'T2', sub: s.t2, tone: s.t2Tone || 'acc' });
        (s.edges || []).forEach(([from, to, kind], i) => {
          const y1 = from === 'T1' ? 157 : 157;
          const bad = kind === 'wait';
          const x1 = from === 'T1' ? 180 : 460, x2 = from === 'T1' ? 230 : 410;
          const yy = to === 'A' ? 134 : 226;
          P.line('e' + i, x1, 157 + (to === 'A' ? -6 : 14), x2, yy, { tone: bad ? 'bad' : 'ok', dash: bad, arrow: true, sw: 2.2, label: bad ? 'waits' : '', dy: bad ? 14 : -5 });
        });
        if (s.wf) {
          P.text('hw', { x: 30, y: 292, t: 'waits-for graph', cls: 'mut sm' });
          P.chip('w1', { x: 150, y: 280, w: 80, h: 34, label: 'T1', tone: s.wf === 2 ? 'bad' : 'info', small: true }); P.chip('w2', { x: 300, y: 280, w: 80, h: 34, label: 'T2', tone: s.wf === 2 ? 'bad' : 'info', small: true });
          P.line('wf1', 232, 292, 298, 292, { tone: s.wf === 2 ? 'bad' : 'warn', arrow: true }); P.line('wf2', 298, 304, 232, 304, { tone: s.wf === 2 ? 'bad' : 'warn', arrow: true });
          if (s.wf === 2) P.chip('cy', { x: 410, y: 280, w: 200, h: 34, label: 'cycle: deadlock', tone: 'bad', small: true });
        }
        if (s.note) P.chip('nt', { x: 30, y: 326, w: 580, h: 18, label: s.note, tone: s.noteTone || 'warn', small: true, r: 4 });
      }
    }),
    bug: [
      { log: 'Two transfers start. T1 moves money from A to B, so it will lock A first. T2 moves money from B to A, so it will lock B first.', callout: 'Two transfers, opposite directions', code: 0,
        state: { t1: 'A then B', t2: 'B then A' }, stats: [{ l: 'transactions', v: '2' }] },
      { log: 'T1 takes an exclusive lock on A. T2 takes an exclusive lock on B. Neither conflicts yet, so both succeed at once.', callout: 'Each takes its first lock', code: 1,
        state: { t1: 'holds A', t2: 'holds B', holdA: 'T1', holdB: 'T2', edges: [['T1', 'A', 'hold'], ['T2', 'B', 'hold']] }, stats: [{ l: 'locks held', v: '2', cls: 'ok' }] },
      { log: 'T1 now needs B. B is locked by T2, so T1 waits. Under strict 2PL, T2 will not release B until it commits.', callout: 'T1 requests B and waits', code: 2,
        state: { t1: 'waits for B', t2: 'holds B', t1Tone: 'warn', holdA: 'T1', holdB: 'T2', edges: [['T1', 'A', 'hold'], ['T1', 'B', 'wait']], waiting: 1 }, stats: [{ l: 'waiting', v: '1', cls: 'warn' }] },
      { log: 'T2 now needs A, which T1 holds. T2 waits too. Each waits for a lock the other will release only at commit.', callout: 'T2 requests A: a cycle forms', moment: true, code: 3,
        state: { t1: 'waits for B', t2: 'waits for A', t1Tone: 'bad', t2Tone: 'bad', holdA: 'T1', holdB: 'T2', edges: [['T1', 'B', 'wait'], ['T2', 'A', 'wait']], waiting: 2, wf: 1 }, stats: [{ l: 'waiting', v: '2', cls: 'bad' }, { l: 'commits', v: '0', cls: 'bad' }] },
      { log: 'The deadlock detector builds the waits-for graph. T1 waits for T2 and T2 waits for T1, which is a cycle, so no waiting can ever end.', callout: 'The waits-for graph has a cycle', code: 3,
        state: { t1: 'waits for B', t2: 'waits for A', t1Tone: 'bad', t2Tone: 'bad', holdA: 'T1', holdB: 'T2', edges: [['T1', 'B', 'wait'], ['T2', 'A', 'wait']], waiting: 2, wf: 2, right: 'deadlock detector' }, stats: [{ l: 'cycle', v: 'T1, T2', cls: 'bad' }] },
      { log: 'The detector aborts a victim, usually the youngest, here T2. Its locks are released, T1 gets B and finishes. T2 gets ERROR: deadlock detected.', callout: 'The victim aborts, the other commits', code: 4,
        state: { t1: 'holds A, B', t2: 'aborted 40P01', t1Tone: 'ok', t2Tone: 'bad', holdA: 'T1', holdB: 'T1', edges: [['T1', 'A', 'hold'], ['T1', 'B', 'hold']], note: 'the app must retry T2 (SQLSTATE 40P01)', noteTone: 'warn' }, stats: [{ l: 'commits', v: '1', cls: 'ok' }, { l: 'aborts', v: '1', cls: 'warn' }] },
      { log: 'The fix is a global lock order. If both transfers lock the lower id first, T2 asks for A before B, waits behind T1, and no cycle can form.', callout: 'Fix: lock accounts in id order', code: 4,
        state: { t1: 'holds A, wants B', t2: 'waits for A', t2Tone: 'warn', holdA: 'T1', edges: [['T1', 'A', 'hold'], ['T2', 'A', 'wait']], waiting: 1, note: 'T2 waits, T1 finishes, T2 runs: no deadlock', noteTone: 'ok' }, stats: [{ l: 'deadlocks', v: '0', cls: 'ok' }, { l: 'aborts', v: '0', cls: 'ok' }],
        takeaway: 'Two-phase locking can deadlock when transactions lock in different orders. A fixed lock order removes the cycle.' },
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
        "t": "Opposite lock order",
        "sym": "Deadlock errors appear under load, and the same two transfers fail again on each retry.",
        "ctx": "Two code paths update the same pair of accounts, but lock them in a different order.",
        "why": "Each transaction holds one lock and waits for the lock the other holds. Neither can move first, so the database must abort one victim.",
        "log": "-- representative PostgreSQL log, wording varies by version\nERROR:  deadlock detected\nDETAIL:  Process 4412 waits for ShareLock on transaction 918; blocked by process 4417.\n         Process 4417 waits for ShareLock on transaction 917; blocked by process 4412.\nHINT:  See server log for query details.",
        "fix": [
          "Measure first: count the deadlock detected errors in the server log, and read the DETAIL lines to find the two processes and statements in the cycle.",
          "Fix: take locks in one global order, such as ascending account id, in every code path that touches both rows.",
          "Fix: lock all the rows in one statement with ORDER BY id and FOR UPDATE, so the order is fixed in one place.",
          "Fix: keep transactions short. Do not call a remote service while row locks are held.",
          "Fix: retry on SQLSTATE 40P01 (deadlock detected) with a small random backoff, and log the victim statement.",
          "Verify: run the two transfers in both orders with 20 concurrent sessions. The deadlock count should be 0."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L17 Two-Phase Locking (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/17-twophaselocking.pdf' };

  /* ---- 1. Strict 2PL: holding locks to the end prevents cascading aborts ---- */
  const TX0 = 110, TU = 56;
  const lb = (row, a, b, tone, label) => ({ row, a, b, tone, label });
  const strict = {
    id: 'strict-2pl', label: 'Plain vs strict 2PL', desc: 'T1 writes A and B and aborts at time 6. T2 reads A. With plain two-phase locking T1 gives A up early and T2 reads a value that is then rolled back. With strict 2PL T1 holds every lock until it ends, so T2 waits and reads a committed value (time units illustrative).',
    codeLabel: 'Protocol',
    code: { bug: [
      '2PL: a growing phase takes locks, a shrinking phase releases them, never both interleaved',
      'plain 2PL: T1 takes X(A), X(B), then releases A at time 3 (shrinking), then aborts at 6',
      'T2 reads A at time 3 and sees T1\'s uncommitted write: a dirty read',
      'T1 aborts, so T2 read data that never existed: T2 must abort too (cascading abort)',
      'strict 2PL: T1 keeps every lock until commit or abort',
      'T2 waits on A, and reads the committed value at time 6',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two transactions, two items. Illustrative times.',
      header: s => ({ left: s.hl || 'locks over time', right: s.rt || '' }),
      draw(P, s) {
        for (let t = 0; t <= 8; t += 2) { P.line('g' + t, TX0 + t * TU, 100, TX0 + t * TU, 300, { tone: 'mut', sw: 0.6, dash: true }); P.text('gt' + t, { x: TX0 + t * TU, y: 316, t: String(t), cls: 'mut xs', anchor: 'middle' }); }
        ['T1 holds A', 'T1 holds B', 'T2 on A'].forEach((n, i) => P.text('r' + i, { x: 10, y: 134 + i * 56, t: n, cls: 'mut sm' }));
        (s.bars || []).forEach((b, i) => P.box('b' + i, { x: TX0 + b.a * TU, y: 116 + b.row * 56, w: (b.b - b.a) * TU - 2, h: 30, tone: b.tone, label: b.label, cls: 'xs', dash: b.tone === 'mut' }));
        if (s.abortAt != null) { P.line('ab', TX0 + s.abortAt * TU, 100, TX0 + s.abortAt * TU, 300, { tone: 'bad', sw: 2.6 }); P.text('abt', { x: TX0 + s.abortAt * TU + 6, y: 108, t: 'T1 aborts', cls: 'xs tone-bad' }); }
        if (s.phase) P.text('ph', { x: TX0, y: 92, t: s.phase, cls: 'xs mut' });
        if (s.note) P.chip('nt', { x: 110, y: 330, w: 420, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Two-phase locking has a growing phase, where a transaction only takes locks, and a shrinking phase, where it only releases them. Once it releases one lock it may not take another. That rule gives serializable schedules.', callout: 'Grow, then shrink', code: 0, state: { phase: 'growing phase, then shrinking phase' }, stats: [{ l: 'rule', v: 'no lock after the first unlock' }] },
      { log: 'Plain 2PL: T1 takes an exclusive lock on A, then on B. At time 3 it has all it needs, so it releases A. T1 is now shrinking.', callout: 'T1 releases A early, at time 3', code: 1, state: { bars: [lb(0, 0, 3, 't0', 'X(A)'), lb(1, 2, 6, 't0', 'X(B)')], phase: 'T1 shrinks from time 3' }, stats: [{ l: 'T1 holds A', v: 'until 3' }] },
      { log: 'T2 now takes a shared lock on A and reads the value T1 wrote. That value is not committed: T1 is still running.', callout: 'T2 reads T1\'s uncommitted write', moment: true, code: 2, state: { bars: [lb(0, 0, 3, 't0', 'X(A)'), lb(1, 2, 6, 't0', 'X(B)'), lb(2, 3, 7, 't1', 'S(A): dirty read')], note: 'T2 saw data that is not committed', noteTone: 'bad' }, stats: [{ l: 'dirty reads', v: '1', cls: 'bad' }] },
      { log: 'At time 6 T1 fails and aborts, and its writes are undone. T2 has read a value that now never existed, so T2 must abort as well, and so must anyone who read T2\'s writes. This is a cascading abort.', callout: 'T1 aborts, and T2 must abort too', code: 3, state: { bars: [lb(0, 0, 3, 't0', 'X(A)'), lb(1, 2, 6, 't0', 'X(B)'), lb(2, 3, 6, 'bad', 'T2 aborted')], abortAt: 6, note: 'cascading abort', noteTone: 'bad' }, stats: [{ l: 'aborted', v: 'T1, T2', cls: 'bad' }] },
      { log: 'Strict 2PL changes one thing: T1 releases no lock until it commits or aborts. A is held from 0 to 6, together with B.', callout: 'Strict 2PL: hold everything to the end', code: 4, state: { bars: [lb(0, 0, 6, 't0', 'X(A) held to the end'), lb(1, 2, 6, 't0', 'X(B)')], phase: 'all locks released together at the end' }, stats: [{ l: 'shrinking phase', v: 'one instant', cls: 'ok' }] },
      { log: 'T2 asks for A at time 3 and waits. At time 6 T1 aborts and releases its locks, and T2 then reads A, the old committed value. Nothing is dirty and nothing cascades. Waiting is the price.', callout: 'T2 waits and reads a committed value', moment: true, code: 5, state: { bars: [lb(0, 0, 6, 't0', 'X(A) held to the end'), lb(1, 2, 6, 't0', 'X(B)'), lb(2, 3, 6, 'mut', 'T2 waits'), lb(2, 6, 8, 'ok', 'S(A): clean')], abortAt: 6, note: 'T2 continues after T1 ends', noteTone: 'ok' }, stats: [{ l: 'cascading aborts', v: '0', cls: 'ok' }, { l: 'T2 wait', v: '3 units', cls: 'warn' }],
        takeaway: 'Strict 2PL holds locks to commit or abort. It prevents dirty reads and cascading aborts, and makes other transactions wait.' },
    ],
  };

  /* ---- 3. Intention locks: a table lock is decided by one check, not by looking at every row ---- */
  const RW = i => ({ x: 120 + i * 120, y: 224 });
  const intent = {
    id: 'intention-locks', label: 'Intention locks', desc: 'T2 and T3 update single rows, so they hold X on a row and an intention lock IX on the table above it. T1 wants to read the whole table with S. One look at the table lock shows the conflict, without checking each row (4 rows and 3 transactions, illustrative).',
    codeLabel: 'Locks',
    code: { bug: [
      'T2: UPDATE ... WHERE id = 3   -> IX on table orders, X on row 3',
      'T3: UPDATE ... WHERE id = 1   -> IX on table orders (IX is compatible with IX), X on row 1',
      'T1: SELECT * FROM orders       -> wants S on table orders',
      'S conflicts with IX: T1 waits, found at the table, one check',
      'without intention locks: T1 would have to look for X locks on every row',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one table, four rows. Illustrative.',
      header: s => ({ left: s.hl || 'lock hierarchy', right: s.rt || '' }),
      draw(P, s) {
        P.chip('tbl', { x: 250, y: 92, w: 140, h: 44, label: 'table orders', sub: (s.tl || []).join(' ') || 'no locks', tone: s.block ? 'bad' : 'info' });
        for (let i = 0; i < 4; i++) { P.line('e' + i, 320, 136, RW(i).x + 50, RW(i).y, { tone: 'mut' });
          P.chip('r' + i, { x: RW(i).x, y: RW(i).y, w: 100, h: 44, label: 'row ' + (i + 1), sub: (s.rl || {})[i] || '', tone: (s.rl || {})[i] ? 'cursor' : 'info' }); }
        if (s.ask) P.chip('ask', { x: 20, y: 96, w: 190, h: 40, label: 'T1 wants S on the table', sub: s.block ? 'waits: S conflicts with IX' : '', tone: s.block ? 'bad' : 'cursor', small: true });
        if (s.chk) P.chip('chk', { x: 20, y: 160, w: 190, h: 40, label: 'one check at the table', sub: '', tone: 'ok', small: true });
        if (s.naive) P.chip('nv', { x: 120, y: 290, w: 400, h: 34, label: 'without intention locks: scan the locks of every row (millions)', sub: '', tone: 'warn', small: true });
      }
    }),
    bug: [
      { log: 'A table holds rows. Locks can be taken at the table or at a row, so there are two levels of granularity. A fine lock allows more concurrency, a coarse lock is cheaper to take.', callout: 'Locks at the table and at the row', code: 0, state: { tl: [] }, stats: [{ l: 'levels', v: '2' }] },
      { log: 'T2 updates row 3. It takes an intention lock IX on the table, which says "I hold or will hold exclusive locks below", and then X on the row.', callout: 'T2: IX on the table, X on row 3', code: 0, state: { tl: ['IX(T2)'], rl: { 2: 'X(T2)' } }, stats: [{ l: 'T2 holds', v: 'IX table, X row 3' }] },
      { log: 'T3 updates row 1. IX is compatible with IX, because they touch different rows, so T3 takes IX on the table and X on row 1 immediately. Row-level concurrency is kept.', callout: 'T3: IX is compatible with IX', code: 1, state: { tl: ['IX(T2)', 'IX(T3)'], rl: { 2: 'X(T2)', 0: 'X(T3)' } }, stats: [{ l: 'writers running', v: '2', cls: 'ok' }] },
      { log: 'T1 wants to read the whole table and asks for S on the table. S is not compatible with IX, so the conflict is visible at the table level.', callout: 'T1 asks for S on the table', moment: true, code: 2, state: { tl: ['IX(T2)', 'IX(T3)'], rl: { 2: 'X(T2)', 0: 'X(T3)' }, ask: 1, block: 1 }, stats: [{ l: 'T1', v: 'waits', cls: 'warn' }] },
      { log: 'The engine only looked at one lock, the table lock. Without intention locks T1 would have had to inspect the locks of every row to find out that someone holds X on one of them.', callout: 'One check instead of one per row', code: 4, state: { tl: ['IX(T2)', 'IX(T3)'], rl: { 2: 'X(T2)', 0: 'X(T3)' }, ask: 1, block: 1, chk: 1, naive: 1 }, stats: [{ l: 'checks', v: '1', cls: 'ok' }],
        takeaway: 'Intention locks announce row-level locks at the levels above, so a coarse lock can be checked with one comparison.' },
    ],
  };

  /* ---- 4. Deadlock prevention: priorities decide who waits and who dies ---- */
  const PREV = [
    { name: 'Wait-Die', rows: [['older asks for a lock a younger holds', 'older WAITS', 't0', 'ok'], ['younger asks for a lock an older holds', 'younger DIES (aborts, restarts with same timestamp)', 't1', 'bad']] },
    { name: 'Wound-Wait', rows: [['older asks for a lock a younger holds', 'older WOUNDS the younger (it aborts)', 't0', 'warn'], ['younger asks for a lock an older holds', 'younger WAITS', 't1', 'ok']] },
  ];
  const prevent = {
    id: 'deadlock-prevention', label: 'Wait-die, wound-wait', desc: 'Prevention gives every transaction a priority, usually its start timestamp with older meaning higher priority, so waits only go one way and no cycle can form. The two schemes differ in who is killed (rules as in the lecture).',
    codeLabel: 'Rules',
    code: { bug: [
      'priority = timestamp; older = higher priority; a restart keeps its old timestamp',
      'Wait-Die: requester has higher priority -> waits; lower priority -> aborts (dies)',
      'waits go only from old to young: no cycle',
      'Wound-Wait: requester has higher priority -> the holder aborts (wounded); lower -> waits',
      'waits go only from young to old: no cycle',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two transactions, one lock. Rules as in the lecture.',
      header: s => ({ left: s.hl || 'who waits and who aborts', right: '' }),
      draw(P, s) {
        PREV.forEach((p, pi) => { if (pi >= (s.schemes || 0)) return;
          P.text('n' + pi, { x: 30, y: 108 + pi * 124, t: p.name, cls: 'sm' });
          p.rows.forEach(([ask, res, , tone], ri) => { P.chip('a' + pi + ri, { x: 30, y: 116 + pi * 124 + ri * 48, w: 270, h: 40, label: ask, sub: '', tone: 'info', small: true });
            P.chip('r' + pi + ri, { x: 316, y: 116 + pi * 124 + ri * 48, w: 300, h: 40, label: res, sub: '', tone, small: true }); }); });
        if (s.note) P.chip('nt', { x: 30, y: 350, w: 580, h: 28, label: s.note, sub: '', tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'A deadlock is a cycle of transactions waiting for each other. Prevention forbids cycles by giving every transaction a priority, its timestamp, so that waiting only goes in one direction.', callout: 'Order the waits by age', code: 0, state: {}, stats: [{ l: 'idea', v: 'one-way waits' }] },
      { log: 'Wait-Die: an older transaction that needs a lock held by a younger one waits. A younger transaction that needs a lock held by an older one dies: it aborts and restarts with its old timestamp.', callout: 'Wait-Die: old waits, young dies', code: 1, state: { schemes: 1 }, stats: [{ l: 'waits go', v: 'old to young' }] },
      { log: 'Wound-Wait is the mirror image. An older transaction that needs a lock held by a younger one wounds it: the younger aborts and releases the lock. A younger one that needs an older one\'s lock waits.', callout: 'Wound-Wait: old wounds young, young waits', moment: true, code: 3, state: { schemes: 2 }, stats: [{ l: 'waits go', v: 'young to old' }] },
      { log: 'Both guarantee no deadlock and both abort transactions, even in cases that would never have deadlocked. A restart keeps the original timestamp, so a transaction cannot starve forever. The alternative, detection, aborts only when a real cycle is found.', callout: 'No deadlocks, some needless aborts', code: 4, state: { schemes: 2, note: 'restart with the same timestamp: no starvation' }, stats: [{ l: 'cost', v: 'extra aborts', cls: 'warn' }],
        takeaway: 'Detection lets deadlocks happen and breaks them. Prevention avoids them and aborts more. Real systems mostly detect.' },
    ],
  };

  const EXPLAIN = `
<h3>1. From theory to a mechanism</h3>
<p>Chapter 20 defined what a correct schedule is. Two-phase locking (2PL) is the pessimistic way to guarantee one: a transaction gets a lock before it touches an object, and a <b>lock manager</b> grants or blocks the request. This is a <em>logical</em> lock held by the transaction, unlike the physical latches of chapter 9. There are two lock modes. A <b>shared</b> lock (S) allows reading and is compatible with other S locks. An <b>exclusive</b> lock (X) allows writing and is compatible with nothing. The lock manager keeps a <b>lock table</b> of who holds and who waits for what.</p>

<h3>2. Two-phase locking</h3>
<p>The protocol has two phases. In the <b>growing phase</b> a transaction acquires locks and never releases one. In the <b>shrinking phase</b> it only releases locks and never acquires another. Following this rule makes every schedule conflict serializable, because the order in which transactions reach their <b>lock point</b>, the end of the growing phase, is an equivalent serial order. Plain 2PL has a weakness. If T1 releases a lock early and then aborts, a transaction that read the unlocked value must abort too, which can chain: a <b>cascading abort</b>. <b>Strict 2PL</b> prevents it by releasing every lock only when the transaction commits or aborts, so uncommitted data is never readable. Strict 2PL is what most lock-based systems use, and <b>rigorous</b> 2PL (hold read locks to the end as well) is a variant.</p>

<h3>3. Deadlock handling</h3>
<p>Locking can produce a <b>deadlock</b>: a cycle of transactions each waiting for a lock held by the next. There are two answers. <b>Detection</b> builds a <b>waits-for graph</b>, with an edge Ti to Tj when Ti waits for a lock Tj holds, and a background thread looks for cycles periodically. No latches are needed, since a missed cycle is found at the next pass, and the check frequency trades CPU against wait time. When it finds a cycle it picks a <b>victim</b> to abort, by age, progress, locks held, the number of transactions that would roll back with it, or how often it was restarted, and rolls back the whole transaction or only enough statements. <b>Prevention</b> avoids deadlocks by priorities. <b>Wait-Die</b>: a higher-priority requester waits and a lower-priority one aborts. <b>Wound-Wait</b>: a higher-priority requester aborts the holder, a lower-priority one waits. A restart keeps its timestamp so it cannot starve.</p>
<figure class="mm" aria-label="Tree of deadlock handling: detection with a waits-for graph and prevention with wait-die and wound-wait" style="--diagram-width:552px">
  <img src="diagrams/ch20-deadlock-handling.svg" alt="Tree: a deadlock is handled by detection or prevention. Detection builds a waits-for graph, checks for cycles periodically, picks a victim by age, progress, locks held or restarts, and aborts it with full or partial rollback. Prevention is Wait-Die, where the old transaction waits and the young one dies, or Wound-Wait, where the old transaction wounds the young one and the young one waits.">
  <figcaption>Tree: two families of deadlock handling.</figcaption>
</figure>

<h3>4. Lock granularity and intention locks</h3>
<p>Locking a whole table is cheap to manage and blocks everyone. Locking each row allows concurrency and costs memory and calls. A database picks a level per operation, and a lock at one level must be visible at the others. <b>Intention locks</b> solve that: before locking a row in X mode, a transaction takes an <b>intention exclusive</b> lock (IX) on every ancestor, the table and the database; for reading rows it takes an <b>intention shared</b> lock (IS). A third mode, <b>SIX</b>, means a shared lock on the whole table plus intention to take exclusive locks on some rows. Compatibility is simple: IS and IX are compatible with each other, S conflicts with IX and X, and X conflicts with all. A transaction that wants S or X on a table checks one lock instead of every row. When a transaction holds too many row locks, the engine may <b>escalate</b> them to one table lock, which saves memory and blocks others.</p>
<figure class="mm" aria-label="Flowchart of taking a row lock: intention locks on the way down, then the row lock" style="--diagram-width:360px">
  <img src="diagrams/ch20-lock-modes.svg" alt="Flowchart: a transaction that wants to lock a row walks from the root of the hierarchy down, taking an intention exclusive lock on the database and on the table, then an exclusive lock on the row. If any held lock conflicts at one of these levels it waits or goes to deadlock handling, otherwise it proceeds.">
  <figcaption>Flowchart: intention locks on the path to the row.</figcaption>
</figure>

<h3>5. The trade-off</h3>
<p>2PL is simple and correct, and it blocks. Readers wait for writers, and long transactions hold locks and make others queue, so a transaction that stays open idle can stall a table. Deadlocks are a normal event, and the application must be ready to retry. Fine locks raise concurrency and cost memory. Phantoms, rows that appear in a range, need locks on the index range or on the table (the next chapter shows the same issue under timestamps).</p>

<h3>6. Syntax</h3>
<pre>-- take a row lock early, in the same order every time
BEGIN;
SELECT * FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;   -- ordered: avoids opposite-order deadlocks
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
UPDATE accounts SET balance = balance + 10 WHERE id = 2;
COMMIT;

-- who is blocked by whom (PostgreSQL)
SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, query
FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) &gt; 0;

-- table-level lock modes, including intention locks
SELECT locktype, relation::regclass, mode, granted FROM pg_locks WHERE relation = 'orders'::regclass;
--   RowExclusiveLock (the table-level mode taken by UPDATE: the intention lock)

-- bound the wait, and let the deadlock detector wake sooner
SET lock_timeout = '3s';
SET deadlock_timeout = '500ms';</pre>
<p>A transaction in <code>idle in transaction</code> state is holding locks and doing nothing. Find it with <code>pg_stat_activity</code> before you blame the query that waits.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A payments service runs transfers between accounts under strict two-phase locking. Under load it logs <code>ERROR: deadlock detected</code>, the same two transfers fail again on each retry, and a nightly reconciliation job that locks the whole table makes every checkout wait for minutes (illustrative). A developer also leaves a debugging session open in a transaction over lunch.`,
    predict: {
      q: `Under strict 2PL, T1 has written account A and is still running. T2 wants to read A. What happens?`,
      opts: [
        `T2 waits until T1 commits or aborts, then reads a committed value`,
        `T2 reads T1's uncommitted value immediately, since it only reads`,
        `T2 fails immediately with an error`,
        `T2 reads the old value from a snapshot without waiting`
      ],
      ans: 0,
      why: `T1 holds an exclusive lock on A until it ends. A shared lock conflicts with an exclusive lock, so T2 waits. This is what stops dirty reads and cascading aborts. Reading an old version without waiting is multi-version concurrency control, not 2PL.`
    },
    diagnose: [
      OLD.diagnose[0],
      {
        t: 'A table lock blocks row-level work',
        sym: '<b>Every checkout</b> waits while one maintenance job runs.',
        ctx: 'A reconciliation job locks the whole table in a mode that conflicts with the intention locks every row update takes. All writers queue behind it.',
        why: 'A table-level S or X lock conflicts with the IX that each row update holds on the table. The conflict is found at the table, so all row updates wait even if they touch different rows.',
        log: `-- representative lock view, illustrative
 pid  | mode                | granted | query
 4411 | ShareLock           | t       | LOCK TABLE orders IN SHARE MODE
 5120 | RowExclusiveLock    | f       | UPDATE orders SET status = ...   (waiting)`,
        note: 'Waiting RowExclusiveLock requests behind one table-level lock are the intention-lock conflict.',
        fix: [
          'Measure first: list waiting locks and the blocking pid with <code>pg_locks</code> and <code>pg_blocking_pids</code>.',
          'Do not lock the table for a read-only job. Read from a snapshot or a replica instead.',
          'If the table must be locked, do it in a short window, with <code>lock_timeout</code> set so the job gives up instead of making everyone wait.',
          'Verify: checkout waits should disappear during the job.'
        ]
      },
      {
        t: 'Idle transaction holds locks',
        sym: '<b>Updates wait</b> for a lock held by a session that is doing nothing.',
        ctx: 'A client opened a transaction, updated a row, and stopped. Under strict 2PL its locks stay until it commits or rolls back.',
        why: 'Locks are held to the end of the transaction, not to the end of the statement. An idle open transaction keeps them, and every transaction that needs those rows queues behind it.',
        log: `-- representative pg_stat_activity, illustrative
 pid  | state                | xact_start       | wait
 3012 | idle in transaction  | 12:01 (3 h ago)  | -
 5120 | active               | 14:58            | Lock:transactionid`,
        note: 'An <code>idle in transaction</code> session with an old <code>xact_start</code> is the usual culprit.',
        fix: [
          'Measure first: find <code>idle in transaction</code> sessions and their age in <code>pg_stat_activity</code>.',
          'Set <code>idle_in_transaction_session_timeout</code> so the server ends them.',
          'Keep transactions short: commit as soon as the unit of work is done, and do no user interaction inside one.',
          'Verify: the blocked updates should proceed, and no session should stay idle in a transaction beyond the limit.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[20] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [strict, lockTable, intent, prevent] };
})();
