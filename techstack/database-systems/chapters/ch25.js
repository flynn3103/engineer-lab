/* Chapter 26 "Distributed OLTP Databases" (index 25, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L22 Distributed Databases (architectures, partitioning, distributed concurrency control), L23 Distributed OLTP Databases (replication, atomic commit with 2PC and Paxos, CAP).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: two-phase commit with a failing coordinator, replica lag, fencing a shard move, key placement when a node is added, and a majority quorum. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. Two shards, one transfer: without a commit protocol, with 2PC, and when the coordinator dies ---- */
  const tpc = {
    id: 'two-phase-commit', label: 'Two-phase commit', desc: 'Alice is on shard A, Bob on shard B. Messages fly between a coordinator and the shards. Plain commits can lose half a transfer, 2PC cannot, but it can block (balances illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      '-- no commit protocol: COMMIT on shard A, crash, the credit on shard B never runs',
      'phase 1: coordinator sends PREPARE; each shard runs PREPARE TRANSACTION \'xfer-42\'',
      'a shard writes its log, keeps its locks and votes OK or ABORT',
      'phase 2: all OK -> coordinator logs COMMIT, then sends COMMIT PREPARED \'xfer-42\'',
      'coordinator dies after the votes: shards are in doubt (pg_prepared_xacts), locks held',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one coordinator, two shards, one transfer. Illustrative.',
      header: s => ({ left: 'sum of balances ' + (s.sum || 150), right: s.right || '' }),
      draw(P, s) {
        P.chip('co', { x: 232, y: 90, w: 176, h: 56, label: 'coordinator', sub: s.co || 'idle', tone: s.coTone || 'info' });
        P.chip('sa', { x: 30, y: 246, w: 176, h: 62, label: 'shard A: alice', sub: s.sa || '100', tone: s.saTone || 'info' });
        P.chip('sb', { x: 434, y: 246, w: 176, h: 62, label: 'shard B: bob', sub: s.sb || '50', tone: s.sbTone || 'info' });
        P.line('la', 280, 146, 150, 244, { tone: 'mut', sw: 1, dash: true }); P.line('lb', 360, 146, 490, 244, { tone: 'mut', sw: 1, dash: true });
        (s.msgs || []).forEach(([id, x, y, label, tone], i) => P.chip('m' + id, { x, y, w: 92, h: 30, label, tone: tone || 'cursor', small: true }));
        if (s.locksA) P.chip('lkA', { x: 30, y: 316, w: 176, h: 26, label: 'row locked', tone: s.locksA === 2 ? 'bad' : 'warn', small: true, r: 4 });
        if (s.locksB) P.chip('lkB', { x: 434, y: 316, w: 176, h: 26, label: 'row locked', tone: s.locksB === 2 ? 'bad' : 'warn', small: true, r: 4 });
        if (s.log) P.chip('lg', { x: 232, y: 160, w: 176, h: 30, label: s.log, tone: s.logTone || 'ok', small: true, r: 4 });
        if (s.standby) P.chip('sbc', { x: 232, y: 206, w: 176, h: 30, label: s.standby, tone: 'ok', small: true, r: 4 });
      }
    }),
    bug: [
      { log: 'The service moves 30 from alice on shard A to bob on shard B. Each shard has its own database and its own commit. Together they hold 150.', callout: 'Two shards, 150 in total', code: 0,
        state: { sum: 150 }, stats: [{ l: 'total', v: '150', cls: 'ok' }] },
      { log: 'With no commit protocol the service commits the debit on shard A first. Shard A is durable: alice has 70.', callout: 'Plain commit on A: alice 70', code: 0,
        state: { sa: '70 (committed)', saTone: 'ok', sum: 120, co: 'none (app commits)', msgs: [['c1', 150, 180, 'COMMIT', 'ok']] }, stats: [{ l: 'total', v: '120', cls: 'warn' }] },
      { log: 'The service crashes before it sends the credit. Shard B never hears of the transfer, and neither shard\'s recovery can know a credit was due.', callout: 'Crash: the credit never reaches B', moment: true, code: 0,
        state: { sa: '70 (committed)', saTone: 'ok', sum: 120, co: 'crashed', coTone: 'bad', sb: '50 (no credit)', sbTone: 'bad' }, stats: [{ l: 'total', v: '120', cls: 'bad' }, { l: 'missing', v: '30', cls: 'bad' }] },
      { log: 'With 2PC, phase 1: the coordinator sends PREPARE to both shards. Nobody has committed anything yet.', callout: 'Phase 1: PREPARE to both shards', code: 1,
        state: { co: 'sends PREPARE', coTone: 'cursor', msgs: [['p1', 120, 176, 'PREPARE'], ['p2', 428, 176, 'PREPARE']] }, stats: [{ l: 'messages', v: '2' }] },
      { log: 'Each shard writes its change to its log, keeps its row locks and votes OK. A prepared shard has promised it can commit but may not decide alone.', callout: 'Each shard prepares, locks, votes OK', code: 2,
        state: { co: 'collecting votes', sa: 'prepared (70)', saTone: 'warn', sb: 'prepared (80)', sbTone: 'warn', locksA: 1, locksB: 1, msgs: [['v1', 150, 196, 'vote OK', 'ok'], ['v2', 398, 196, 'vote OK', 'ok']] }, stats: [{ l: 'votes', v: '2 of 2 OK', cls: 'ok' }] },
      { log: 'The coordinator writes COMMIT to its own durable log. This is the decision point. From now on the outcome is commit, whatever fails.', callout: 'The decision is logged: COMMIT', code: 3,
        state: { co: 'COMMIT logged', coTone: 'ok', log: 'log: xfer-42 COMMIT', sa: 'prepared (70)', saTone: 'warn', sb: 'prepared (80)', sbTone: 'warn', locksA: 1, locksB: 1 }, stats: [{ l: 'decision', v: 'COMMIT', cls: 'ok' }] },
      { log: 'Phase 2: COMMIT PREPARED goes to both shards. They commit, release their locks, and the total is 150 again.', callout: 'Phase 2: both shards commit', code: 3,
        state: { co: 'done', coTone: 'ok', sa: '70 (committed)', saTone: 'ok', sb: '80 (committed)', sbTone: 'ok', log: 'log: xfer-42 COMMIT', msgs: [['c1', 120, 176, 'COMMIT', 'ok'], ['c2', 428, 176, 'COMMIT', 'ok']], sum: 150 }, stats: [{ l: 'total', v: '150', cls: 'ok' }, { l: 'locks held', v: '0', cls: 'ok' }] },
      { log: 'The risk: the coordinator dies after the votes but before logging a decision. Both shards are in doubt. They cannot abort or commit alone, so their rows stay locked.', callout: 'Coordinator dies: both shards are in doubt', code: 4,
        state: { co: 'crashed', coTone: 'bad', sa: 'in doubt (70)', saTone: 'bad', sb: 'in doubt (80)', sbTone: 'bad', locksA: 2, locksB: 2, sum: 150, right: 'blocked' }, stats: [{ l: 'locks held', v: 'until recovery', cls: 'bad' }, { l: 'new transfers', v: 'wait', cls: 'bad' }] },
      { log: 'The fix is to store the decision in a replicated log (Raft or Paxos). A standby coordinator reads the decision, or aborts if there is none, and finishes the transaction.', callout: 'A replicated decision log lets a standby finish', code: 4,
        state: { co: 'standby took over', coTone: 'ok', standby: 'replicated log: COMMIT', sa: '70 (committed)', saTone: 'ok', sb: '80 (committed)', sbTone: 'ok', msgs: [['c1', 120, 176, 'COMMIT', 'ok'], ['c2', 428, 176, 'COMMIT', 'ok']], sum: 150, right: 'recovered' }, stats: [{ l: 'locks held', v: '0', cls: 'ok' }, { l: 'total', v: '150', cls: 'ok' }],
        takeaway: '2PC gives one outcome on every shard, at the price of blocking. A replicated decision log removes the single point of failure.' },
    ],
  };

  /* ---- 2. Replica lag: a log record in flight, and a read that overtakes it ---- */
  const lag = {
    id: 'replica-lag', label: 'Replica lag', desc: 'Writes go to the primary and are shipped to a replica. A read sent to the replica right after a write can still see the old balance (timings illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      'write: UPDATE accounts SET balance = 70 WHERE id = 7;   -- on the primary, acknowledged',
      'async replication: the primary acknowledges first and ships the log record afterwards',
      'read: SELECT balance FROM accounts WHERE id = 7;        -- routed to the replica: 100',
      'read your writes: pin the session to the primary, or wait until the replica passes the write LSN',
      'synchronous_standby_names = \'replica1\'   -- the primary waits for the replica before it acknowledges',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one primary, one replica, one write. Illustrative.',
      header: s => ({ left: 'replica lag ' + (s.lag || '0 ms'), right: s.right || 'asynchronous' }),
      draw(P, s) {
        P.box('pm', { x: 30, y: 110, w: 170, h: 112, tone: 'mut', label: '', sw: 2 }); P.text('pt', { x: 115, y: 102, t: 'primary', cls: 'mut sm', anchor: 'middle' });
        P.box('rp', { x: 440, y: 110, w: 170, h: 112, tone: 'mut', label: '', sw: 2 }); P.text('rt', { x: 525, y: 102, t: 'replica', cls: 'mut sm', anchor: 'middle' });
        P.chip('pb', { x: 44, y: 130, w: 142, h: 62, label: 'balance ' + (s.p == null ? 100 : s.p), sub: s.pSub || 'LSN ' + (s.pl || 10), tone: s.p === 70 ? 'ok' : 'info' });
        P.chip('rb', { x: 454, y: 130, w: 142, h: 62, label: 'balance ' + (s.r == null ? 100 : s.r), sub: s.rSub || 'LSN ' + (s.rl || 10), tone: s.r === 70 ? 'ok' : (s.stale ? 'bad' : 'info') });
        P.line('wire', 202, 166, 438, 166, { tone: 'mut', dash: true, arrow: true });
        if (s.rec != null) P.chip('rec', { x: s.rec, y: 140, w: 64, h: 40, label: 'L11', sub: 'bal 70', tone: 'cursor', small: false });
        if (s.writer) P.chip('wr', { x: 30, y: 246, w: 190, h: 38, label: s.writer, tone: s.writerTone || 'cursor', small: true });
        if (s.ack) P.chip('ak', { x: 30, y: 290, w: 190, h: 30, label: s.ack, tone: 'ok', small: true });
        if (s.reader) P.chip('rd', { x: 420, y: 246, w: 190, h: 38, label: s.reader, tone: s.readerTone || 'cursor', small: true });
        if (s.readLine) P.line('rl', 515, 246, 515, 224, { tone: s.readerTone === 'bad' ? 'bad' : 'ok', arrow: true });
        if (s.note) P.chip('nt', { x: 240, y: 290, w: 370, h: 40, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The primary and the replica both hold a balance of 100, at LSN 10. The replica follows the primary by replaying shipped log records.', callout: 'Both nodes hold 100', code: 0,
        state: {}, stats: [{ l: 'lag', v: '0 ms', cls: 'ok' }] },
      { log: 'A user saves a new balance of 70. The primary commits at LSN 11 and acknowledges at once, without waiting for the replica.', callout: 'The primary commits and acknowledges', code: 1,
        state: { p: 70, pl: 11, writer: 'save balance = 70', ack: 'client told: saved', rec: 210 }, stats: [{ l: 'primary', v: '70 (LSN 11)', cls: 'ok' }] },
      { log: 'The log record is still on the wire. The replica has not applied it, so it still holds 100 at LSN 10. The gap is the replica lag.', callout: 'The record is in flight, the replica is behind', code: 1,
        state: { p: 70, pl: 11, writer: 'save balance = 70', ack: 'client told: saved', rec: 320, lag: '40 ms', stale: 1 }, stats: [{ l: 'replica lag', v: '40 ms', cls: 'warn' }, { l: 'replica', v: '100 (LSN 10)', cls: 'warn' }] },
      { log: 'The page reloads and the read is routed to the replica. It returns 100. The user concludes that the save did not work and presses save again.', callout: 'The read sees the old value: 100', moment: true, code: 2,
        state: { p: 70, pl: 11, rec: 380, lag: '40 ms', stale: 1, reader: 'read balance -> 100', readerTone: 'bad', readLine: 1, note: 'user: "my save did not work"', noteTone: 'bad' }, stats: [{ l: 'user sees', v: '100', cls: 'bad' }, { l: 'actual', v: '70', cls: 'ok' }] },
      { log: 'A moment later the record arrives and the replica applies it. A refresh now shows 70. Nothing was lost, but the user saw a past state.', callout: 'The record arrives: the replica catches up', code: 2,
        state: { p: 70, pl: 11, r: 70, rl: 11, lag: '0 ms', reader: 'read balance -> 70', readerTone: 'ok', readLine: 1 }, stats: [{ l: 'lag', v: '0 ms', cls: 'ok' }, { l: 'user sees', v: '70', cls: 'ok' }] },
      { log: 'To read your own writes, send a session\'s reads to the primary for a short time after it writes, or have the replica wait until it has replayed the write\'s LSN.', callout: 'Read your writes: pin to the primary or wait for the LSN', code: 3,
        state: { p: 70, pl: 11, rec: 330, lag: '40 ms', stale: 1, reader: 'read -> primary: 70', readerTone: 'ok', note: 'or: wait until replica LSN >= 11', noteTone: 'ok' }, stats: [{ l: 'user sees', v: '70', cls: 'ok' }, { l: 'replica lag', v: 'hidden', cls: 'ok' }] },
      { log: 'Synchronous replication makes the primary wait for the replica before acknowledging. No stale reads, but every write now pays the network round trip, and a down replica can stall writes.', callout: 'Synchronous: wait for the replica, pay the latency', code: 4,
        state: { p: 70, pl: 11, r: 70, rl: 11, writer: 'save balance = 70', ack: 'told after the replica has it', right: 'synchronous', note: 'write latency + one round trip', noteTone: 'warn' }, stats: [{ l: 'stale reads', v: '0', cls: 'ok' }, { l: 'write latency', v: '+1 round trip', cls: 'warn' }],
        takeaway: 'Asynchronous replicas are fast but behind. Decide per read whether it may see the past, and route it accordingly.' },
    ],
  };

  /* ---- 3. Rebalancing: a slice of keys moves between nodes, and a stale owner must be fenced off ---- */
  const KX = (i, base) => base + (i % 3) * 52, KY = i => 134 + Math.floor(i / 3) * 40;
  const fence = {
    id: 'fencing', label: 'Moving a shard', desc: 'A slice of keys moves from node N1 to node N2 while clients keep writing. Without a fence, a write that reaches the old owner after the copy is lost (keys and epochs illustrative).',
    codeLabel: 'Router',
    code: { bug: [
      'slice s7: owner N1, epoch 4      -- the router map clients cache',
      'rebalance: copy slice s7 to N2 while N1 keeps serving writes',
      'cutover: the router map says owner N2, epoch 5; N1 is told to stop',
      'a client with the old map writes key k5 to N1 after the copy ended',
      'fencing: every write carries its epoch, and a node refuses epochs older than the current one',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one slice, two nodes, one router map. Illustrative.',
      header: s => ({ left: 'owner N' + (s.owner || 1) + ' · epoch ' + (s.epoch || 4), right: s.right || '' }),
      draw(P, s) {
        P.box('n1', { x: 30, y: 100, w: 190, h: 150, tone: 'mut', label: '', sw: 2, dash: s.n1gone }); P.text('t1', { x: 125, y: 92, t: 'N1 (old owner)', cls: 'mut sm', anchor: 'middle' });
        P.box('n2', { x: 420, y: 100, w: 190, h: 150, tone: 'mut', label: '', sw: 2 }); P.text('t2', { x: 515, y: 92, t: 'N2 (new owner)', cls: 'mut sm', anchor: 'middle' });
        (s.k1 || []).forEach((k, i) => P.chip('a' + k, { x: KX(i, 44), y: KY(i), w: 48, h: 32, label: k, tone: k === 'k5' ? (s.lost ? 'bad' : 'cursor') : 'info', small: true }));
        (s.k2 || []).forEach((k, i) => P.chip('b' + k, { x: KX(i, 434), y: KY(i), w: 48, h: 32, label: k, tone: k === 'k5' ? 'ok' : 'live', small: true }));
        P.chip('rt', { x: 232, y: 100, w: 176, h: 50, label: 'router map', sub: 's7 -> N' + (s.owner || 1) + ', epoch ' + (s.epoch || 4), tone: s.epoch === 5 ? 'ok' : 'info' });
        if (s.copy) P.line('cp', 222, 190, 418, 190, { tone: 'cursor', arrow: true, dash: true, label: 'copy s7', dy: -8 });
        if (s.write) P.chip('wr', { x: 232, y: 214, w: 176, h: 40, label: 'write k5', sub: s.write, tone: s.writeTone || 'cursor' });
        if (s.writeLine) P.line('wl', 232, 234, 222, 234, { tone: s.writeTone === 'bad' ? 'bad' : (s.writeTone === 'warn' ? 'warn' : 'cursor'), arrow: true, sw: 2.2 });
        if (s.retry) P.line('wl2', 408, 234, 420, 234, { tone: 'ok', arrow: true, sw: 2.2 });
        if (s.note) P.chip('nt', { x: 30, y: 270, w: 580, h: 36, label: s.note, tone: s.noteTone || 'warn' });
        if (s.fenced) P.chip('fn', { x: 30, y: 258, w: 190, h: 22, label: 'fenced: epoch 4 < 5', tone: 'ok', small: true, r: 4 });
      }
    }),
    bug: [
      { log: 'Slice s7 holds keys k1 to k4 and lives on N1. Every client caches a router map: slice s7 belongs to N1 at epoch 4.', callout: 'Slice s7 lives on N1, epoch 4', code: 0,
        state: { k1: ['k1', 'k2', 'k3', 'k4'], owner: 1, epoch: 4 }, stats: [{ l: 'keys on N1', v: '4' }] },
      { log: 'The balancer copies the slice to N2 while N1 keeps serving. The keys appear on N2 one by one.', callout: 'The slice is copied to N2', code: 1,
        state: { k1: ['k1', 'k2', 'k3', 'k4'], k2: ['k1', 'k2', 'k3', 'k4'], owner: 1, epoch: 4, copy: 1, right: 'copying' }, stats: [{ l: 'copied', v: '4 of 4' }] },
      { log: 'The copy is done. The router map is updated: s7 now belongs to N2 at epoch 5. N1 is told to stop serving it, but N1 and some clients have not heard yet.', callout: 'Cutover: owner N2, epoch 5', code: 2,
        state: { k1: ['k1', 'k2', 'k3', 'k4'], k2: ['k1', 'k2', 'k3', 'k4'], owner: 2, epoch: 5, right: 'cutover' }, stats: [{ l: 'router map', v: 'N2, epoch 5', cls: 'ok' }] },
      { log: 'A client still holds the old map and writes key k5 to N1. With no fence, N1 believes it is still the owner and accepts and acknowledges the write.', callout: 'A stale client writes k5 to N1', code: 3,
        state: { k1: ['k1', 'k2', 'k3', 'k4', 'k5'], k2: ['k1', 'k2', 'k3', 'k4'], owner: 2, epoch: 5, write: 'to N1, epoch 4', writeLine: 1, right: 'no fence', lost: 1 }, stats: [{ l: 'k5 acknowledged', v: 'yes', cls: 'warn' }] },
      { log: 'The new owner N2 never received k5. A read routed by the new map does not find it. An acknowledged write has disappeared, and no one was told.', callout: 'k5 is acknowledged but missing on N2', moment: true, code: 3,
        state: { k1: ['k1', 'k2', 'k3', 'k4', 'k5'], k2: ['k1', 'k2', 'k3', 'k4'], owner: 2, epoch: 5, lost: 1, right: 'no fence', note: 'read k5 from N2: not found', noteTone: 'bad' }, stats: [{ l: 'lost writes', v: '1', cls: 'bad' }, { l: 'errors', v: '0', cls: 'warn' }] },
      { log: 'With fencing every write carries the epoch it was routed with. N1 has learned epoch 5, so it rejects the epoch 4 write with a redirect.', callout: 'Fencing: N1 rejects epoch 4', code: 4,
        state: { k1: ['k1', 'k2', 'k3', 'k4'], k2: ['k1', 'k2', 'k3', 'k4'], owner: 2, epoch: 5, write: 'epoch 4: rejected', writeTone: 'warn', writeLine: 1, fenced: 1, right: 'fenced' }, stats: [{ l: 'k5 on N1', v: 'rejected', cls: 'ok' }] },
      { log: 'The client refreshes its map and resends k5 to N2 at epoch 5. The write lands on the owner. A request id makes the retry safe to apply twice.', callout: 'The client retries on N2 and it lands', code: 4,
        state: { k1: ['k1', 'k2', 'k3', 'k4'], k2: ['k1', 'k2', 'k3', 'k4', 'k5'], owner: 2, epoch: 5, write: 'to N2, epoch 5', writeTone: 'ok', retry: 1, right: 'fenced' }, stats: [{ l: 'lost writes', v: '0', cls: 'ok' }, { l: 'k5', v: 'on N2', cls: 'ok' }],
        takeaway: 'A moving shard needs an epoch or lease so the old owner stops. A rejected write is a retry. A lost write is data loss.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A payments service keeps accounts on two PostgreSQL shards: alice on shard A, bob on shard B. During a deploy, the transfer service commits a debit of 30 on shard A, then crashes before it sends the credit to shard B (illustrative). Both shards report healthy, but the nightly ledger check finds 120 where it expects 150, and support has a ticket for money that left one account and never arrived.",
    "predict": {
      "q": "The transfer uses two plain commits, one per shard, with no commit protocol. Shard A has committed the debit and the coordinator is gone. What happens next?",
      "opts": [
        "Shard A's crash recovery rolls the debit back, because the whole transfer did not finish",
        "The debit stays and the credit never happens, so 30 is missing until someone repairs it",
        "Shard B applies the credit later, when the coordinator comes back",
        "The database notices that the totals differ and aborts the transfer on both shards"
      ],
      "ans": 1,
      "why": "Each shard's recovery (chapter 13) protects only its own committed work, and the debit is committed and durable. Nothing on shard B knows a credit was due, and nothing retries it."
    },
    "diagnose": [
      {
        "t": "Hot shard",
        "sym": "One shard takes most of the requests while the others sit idle. The other shards show low load.",
        "ctx": "p99 latency rises on one shard only. Adding more shards does not move the load, because the same tenant keeps landing on the same one.",
        "why": "Hash partitioning spreads different keys evenly, but it cannot spread one key. A single busy tenant sends all of its requests to one shard, however many shards there are.",
        "log": "representative shard metrics, one 5-minute window\nshard-2  requests=high  p99 latency rising\nshard-0  requests=low   cpu idle\nbusiest shard share: 80% of requests",
        "fix": [
          "Measure first: check the key distribution before you pick a partition key. A key with a few very heavy values is a poor choice.",
          "Split the hot key into buckets (acme plus a bucket suffix from 0 to 3). Reads for that tenant then fan out to the buckets.",
          "Move the hot tenant to a dedicated shard when it is large enough to justify the cost.",
          "Verify: compare the busiest shard's share of requests before and after the change. Here it moves from 80% to 30%."
        ]
      },
      {
        "t": "Coordinator failure in doubt",
        "sym": "The rows of a transfer stay locked while the coordinator is down, and every new transfer on those rows waits.",
        "ctx": "Transfers on a few accounts hang and time out together, right after the coordinator restarts or crashes. Other accounts work.",
        "why": "In two-phase commit, a prepared participant cannot commit or abort on its own, because the coordinator may already have decided COMMIT. The decision is stored only in the coordinator's log, so the participant blocks until the coordinator returns.",
        "log": "representative PostgreSQL view after a coordinator crash\nSELECT gid, prepared FROM pg_prepared_xacts;\n xfer-42 | 2026-10-08 09:14:02   (still prepared, locks held)",
        "fix": [
          "Measure first: run SELECT gid, prepared FROM pg_prepared_xacts; on each participant to list prepared transactions and how long they have waited.",
          "Write the decision to a replicated log (Raft or Paxos) before sending COMMIT, so a standby coordinator can read it.",
          "Let a standby take over after a short timeout, read the decision, and finish the transaction.",
          "Set a lock timeout on the participants, so queued transfers fail fast and the client retries them.",
          "Verify: force a coordinator restart in a test and measure how long the rows stay locked. Here it moves from 40 s to 2 s (illustrative)."
        ]
      },
      {
        "t": "Replica lag",
        "sym": "A user saves a new balance and reads the old value a moment later.",
        "ctx": "Users report that a save \"did not work\", then the value appears after a refresh. Writes go to the primary, reads to replicas.",
        "why": "Asynchronous replication acknowledges the write before the replica applies it. A read routed to that replica can return the state from before the write, which breaks read-your-writes.",
        "log": "representative replica status, PostgreSQL pg_stat_replication\nclient_addr  state      replay_lag\n10.0.2.14    streaming  00:00:00.3\n(representative. replay_lag as an interval column is from the PostgreSQL documentation, not the course notes; check your version)",
        "fix": [
          "Measure first: read replay_lag in pg_stat_replication on the primary and compare it with the time between a user's write and the next read.",
          "After a user writes, send that user's reads to the primary for a short window, such as 1 s.",
          "Return the commit position from the write, and read from a replica only once it has replayed past that position (for example with pg_last_wal_replay_lsn(), a PostgreSQL function, not in the course notes; check the docs).",
          "Use synchronous replication for the data that must be read back at once.",
          "Verify: run the same write-then-read test and count stale reads. Here it moves from 2 of 5 to 0."
        ]
      },
      {
        "t": "Rebalancing without fencing",
        "sym": "A write that the old owner accepted after the copy stopped never reaches the new owner.",
        "ctx": "After a shard move, a few writes that clients saw acknowledged are missing on the new node. No error was returned to anyone.",
        "why": "A routing change is not instant. A client with a stale cache keeps sending writes to the old owner, which still accepts them. Nothing copies those writes after the copy stops, so they are lost.",
        "log": "representative node log during a shard move\nnode-1 shard=7 epoch=1 accepted write w4 (routing stale)\nnode-2 shard=7 epoch=2 copy stopped at log position 103",
        "fix": [
          "Measure first: search the old owner's log for writes it accepted after the cut-over, such as \"accepted write w4 (routing stale)\".",
          "Give each shard owner an epoch number, and bump it at the cut-over.",
          "The old owner rejects any request that carries an old epoch. The client refreshes its routing and retries.",
          "Each retry carries a request id, so the new owner applies a retried write only once (idempotency).",
          "Verify: count the writes that clients saw acknowledged, and check each one on the new owner. Here lost writes move from 2 to 0."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L22 Distributed Databases, L23 Distributed OLTP Databases (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/23-distributedoltp.pdf' };

  /* ---- 4. Partitioning: where a key lives, and how much moves when a node is added ---- */
  const KEYS12 = Array.from({ length: 12 }, (_, i) => i);
  const NT = ['t0', 't1', 't2', 't3'];
  const modOwner = (k, n) => k % n;
  const RING3 = k => (k === 0 || k >= 9 ? 0 : k <= 4 ? 1 : 2);    // N1 owns 9..0, N2 owns 1..4, N3 owns 5..8
  const RING4 = k => (k === 5 || k === 6 ? 3 : RING3(k));         // N4 at position 6 takes keys 5 and 6 from N3
  const part = {
    id: 'partition-rebalance', label: 'Adding a node', desc: 'Twelve keys on a cluster that grows from three nodes to four. Placing a key by hash mod N reshuffles most keys when N changes. Placing it on a hash ring moves only the keys next to the new node (key positions illustrative).',
    codeLabel: 'Placement',
    code: { bug: [
      'node = hash(key) mod N   with N = 3: keys 0..11 spread over 3 nodes',
      'add a node: N = 4, node = hash(key) mod 4 -> most keys change owner',
      'consistent hashing: nodes and keys sit on a ring; a key belongs to the next node clockwise',
      'add node 4 at one point on the ring: it only takes over the keys just before it',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 12 keys, hash value equal to the key. Illustrative.',
      header: s => ({ left: s.hl || 'owner of each key', right: s.moved == null ? '' : 'keys moved: ' + s.moved + ' of 12' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 86, t: s.mode === 'ring' ? 'ring order: key, owner (clockwise)' : 'keys, coloured by owner node', cls: 'mut sm' });
        KEYS12.forEach(k => { const own = s.after ? s.after(k) : s.before(k), was = s.before(k), mv = s.after && own !== was;
          P.chip('k' + k, { x: 30 + k * 50, y: 100, w: 44, h: 44, label: String(k), sub: mv ? 'moved' : '', tone: NT[own], hl: mv }); });
        [0, 1, 2, 3].forEach(n => { if (n === 3 && !s.n4) return; const cnt = KEYS12.filter(k => (s.after ? s.after(k) : s.before(k)) === n).length;
          P.chip('n' + n, { x: 30 + n * 150, y: 190, w: 130, h: 54, label: 'node ' + (n + 1), sub: cnt + ' keys', tone: NT[n] }); });
        if (s.note) P.chip('nt', { x: 30, y: 270, w: 560, h: 34, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'With hash mod 3, every key has a fixed owner: node 1 takes keys with remainder 0, node 2 remainder 1, node 3 remainder 2. Each node holds four keys.', callout: 'mod 3: four keys per node', code: 0, state: { before: k => modOwner(k, 3), hl: 'hash mod 3' }, stats: [{ l: 'nodes', v: '3' }] },
      { log: 'The cluster adds a fourth node and the formula becomes hash mod 4. Keys 0, 1 and 2 stay. The other nine change owner, so nine keys must be copied to different nodes.', callout: 'mod 4: nine of twelve keys move', moment: true, code: 1, state: { before: k => modOwner(k, 3), after: k => modOwner(k, 4), n4: 1, moved: 9, hl: 'hash mod 4', note: 'most of the data moves: a huge rebalance', noteTone: 'bad' }, stats: [{ l: 'moved', v: '9 of 12', cls: 'bad' }] },
      { log: 'Consistent hashing puts nodes and keys on a ring. A key is owned by the first node clockwise from it. Node 1 owns keys 9 to 0, node 2 owns 1 to 4, and node 3 owns 5 to 8.', callout: 'A ring: a key belongs to the next node', code: 2, state: { before: RING3, mode: 'ring', hl: 'consistent hashing, 3 nodes' }, stats: [{ l: 'nodes', v: '3' }] },
      { log: 'Node 4 joins at a point on the ring, between keys 6 and 7. It takes over only the keys that were owned by the node after it, here keys 5 and 6. Everything else stays where it was.', callout: 'The new node takes only a slice', moment: true, code: 3, state: { before: RING3, after: RING4, n4: 1, moved: 2, mode: 'ring', hl: 'consistent hashing, node 4 added', note: 'only the keys next to the new node move', noteTone: 'ok' }, stats: [{ l: 'moved', v: '2 of 12', cls: 'ok' }],
        takeaway: 'A placement rule that depends on the node count reshuffles everything when it changes. Consistent hashing moves about 1/N of the keys.' },
    ],
  };

  /* ---- 5. Quorum: a majority can decide, even when some nodes are down ---- */
  const QX = i => 40 + i * 114;
  const quorum = {
    id: 'majority-quorum', label: 'Majority consensus', desc: 'Five nodes run Paxos or Raft. A proposal commits when a majority, three of five, agree. The system keeps going with two nodes down and stops, safely, with three down. Two-phase commit needs every participant (states illustrative).',
    codeLabel: 'Rule',
    code: { bug: [
      '2F + 1 nodes tolerate F failures: 5 nodes, F = 2, majority = 3',
      'proposer sends Propose(commit) to all acceptors',
      'an acceptor answers Agree unless it already agreed to a higher proposal',
      'majority agrees (3 of 5): the proposer sends Commit and the client gets an answer',
      '3 nodes down: only 2 can answer, no majority, no progress, but never a wrong answer',
      '2PC needs all participants to vote OK, and blocks if the coordinator fails',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one proposer and five acceptors. Qualitative.',
      header: s => ({ left: s.hl || 'proposal and votes', right: 'agree: ' + (s.agree || 0) + ' of 5 · need 3' }),
      draw(P, s) {
        P.chip('pr', { x: 250, y: 92, w: 140, h: 44, label: 'proposer', sub: s.prop || '', tone: 'cursor' });
        for (let i = 0; i < 5; i++) { const st = (s.state || [])[i] || 'idle';
          P.chip('a' + i, { x: QX(i), y: 196, w: 104, h: 56, label: 'node ' + (i + 1), sub: st === 'down' ? 'DOWN' : st === 'agree' ? 'Agree' : 'waiting', tone: st === 'down' ? 'bad' : st === 'agree' ? 'ok' : 'info' });
          if (s.send) P.line('s' + i, 320, 136, QX(i) + 52, 196, { tone: st === 'down' ? 'bad' : 'cursor', arrow: true, dash: st === 'down' }); }
        if (s.res) P.chip('rs', { x: 150, y: 280, w: 340, h: 40, label: s.res[0], sub: '', tone: s.res[1] });
      }
    }),
    bug: [
      { log: 'Five nodes hold the replicated state. To commit a change, a proposer asks them to agree on it. A majority is three nodes, so two failures are tolerated: 2F + 1 nodes survive F failures.', callout: 'Five nodes, a majority is three', code: 0, state: { state: [], agree: 0 }, stats: [{ l: 'F tolerated', v: '2' }] },
      { log: 'The proposer sends its proposal to every node. Each node that has not promised a higher proposal answers Agree.', callout: 'Propose: all five agree', code: 1, state: { send: 1, state: ['agree', 'agree', 'agree', 'agree', 'agree'], agree: 5, prop: 'commit tx 77' }, stats: [{ l: 'agree', v: '5 of 5', cls: 'ok' }] },
      { log: 'Now two nodes are down. Three answer Agree. That is a majority, so the proposer can commit and tell the client. The down nodes catch up when they return.', callout: 'Two nodes down: three agree, still commits', moment: true, code: 3, state: { send: 1, state: ['agree', 'agree', 'agree', 'down', 'down'], agree: 3, prop: 'commit tx 77', res: ['majority reached: committed', 'ok'] }, stats: [{ l: 'agree', v: '3 of 5', cls: 'ok' }] },
      { log: 'With three nodes down only two can answer. There is no majority, so nothing commits. The system stops making progress, but it can never accept two different answers.', callout: 'Three nodes down: no majority, no progress', code: 4, state: { send: 1, state: ['agree', 'agree', 'down', 'down', 'down'], agree: 2, prop: 'commit tx 78', res: ['no majority: waits, never decides wrongly', 'warn'] }, stats: [{ l: 'agree', v: '2 of 5', cls: 'bad' }] },
      { log: 'Two-phase commit is the case F = 0: every participant must vote OK, and if the coordinator fails after the prepare messages, participants block until it returns. Paxos does not depend on one coordinator.', callout: '2PC is the special case with no failures allowed', code: 5, state: { state: ['agree', 'agree', 'agree', 'agree', 'agree'], agree: 5, hl: '2PC: all must agree', res: ['2PC blocks if the coordinator fails after prepare', 'warn'] }, stats: [{ l: 'blocking', v: '2PC yes, Paxos no', cls: 'warn' }],
        takeaway: 'A majority quorum survives failures without a single point of failure. 2PC needs everyone and a live coordinator.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why spread a database over machines</h3>
<p>One machine has limits of storage, memory, throughput and availability. A <b>distributed</b> DBMS spreads data and queries over many nodes while presenting one logical database. The lecture separates two workloads. <b>OLTP</b>: short read-write transactions, small footprint, repetitive operations. <b>OLAP</b>: long read-only queries with complex joins, exploratory (next chapter). The hard part of distributed OLTP is keeping transactions correct when nodes fail, messages are late, and data lives in several places.</p>

<h3>2. System architectures and design issues</h3>
<p>The architectures differ in what nodes share. <b>Shared everything</b> is one machine. <b>Shared memory</b> nodes share memory over a fast fabric. <b>Shared disk</b> nodes have their own memory and CPU and a common storage layer, so compute can be added without moving data and a node failure loses no data. <b>Shared nothing</b> nodes each own their data and disk, scale out the farthest, and moving data means moving ownership.</p>
<figure class="mm" aria-label="Tree of system architectures: shared everything, shared memory, shared disk, shared nothing" style="--diagram-width:744px">
  <img src="diagrams/ch25-architectures.svg" alt="Tree: system architectures are shared everything, one machine; shared memory, nodes sharing memory over a fast fabric; shared disk, nodes with own memory and one storage layer, which makes it easy to add compute; and shared nothing, each node owning its data and disk, which scales out but means moving data moves ownership.">
  <figcaption>Tree: what the nodes share decides how the system scales.</figcaption>
</figure>
<p>Design issues: are nodes homogeneous or different, and does the application see where data is (<b>data transparency</b>), and how is a transaction executed across nodes (<b>distributed concurrency control</b>).</p>

<h3>3. Partitioning</h3>
<p><b>Partitioning</b> splits a table into disjoint pieces across nodes. <b>Logical</b> partitioning says which node owns which keys while storage is shared. <b>Physical</b> partitioning also stores the data on that node (shared nothing). <b>Hash partitioning</b> sends a key to hash(key) mod N and balances load, with no range scans. <b>Range partitioning</b> keeps key ranges together for range scans and risks hot ranges. When N changes, mod N reshuffles most keys. <b>Consistent hashing</b> places nodes and keys on a ring, a key belongs to the next node clockwise, and adding a node moves only the neighbouring slice. A query that touches one partition is cheap. One that spans many is a distributed transaction, so the partition key should match how data is accessed, to avoid both hot shards and cross-shard transactions.</p>

<h3>4. Concurrency control across nodes</h3>
<p>Two designs coordinate transactions. With a <b>centralized</b> coordinator one component grants locks or commit decisions, which is simple and a bottleneck and a single point of failure. In a <b>decentralized</b> setup one partition is elected primary for the transaction. It receives the begin and commit requests, and the other nodes execute queries and take part in the commit. Two-phase locking, MVCC and OCC run on each node for local safety. Everything then depends on how the nodes agree to commit.</p>

<h3>5. Atomic commit</h3>
<p>When a multi-node transaction ends, all nodes must decide together: commit or abort. A commit protocol must give <b>stability</b> (a decision never changes), <b>consistency</b> (all nodes end in the same state, even after failures) and <b>liveness</b> (it makes progress while enough nodes are alive). In <b>two-phase commit</b> (2PC) the client asks the coordinator to commit. Phase 1: the coordinator sends Prepare, and each participant that can commit logs a prepared record and answers OK. Phase 2: if all said OK, the coordinator logs the decision and sends Commit, participants commit and answer OK, and the client is told. Any abort vote aborts everyone. Every node logs each step durably. If the coordinator fails after Prepare, participants are <b>in doubt</b> and hold their locks until they learn the outcome, which is why 2PC blocks. Optimizations: <b>early prepare voting</b> (the last query returns the vote) and <b>early acknowledgment after prepare</b>.</p>
<figure class="mm" aria-label="Sequence diagram of two-phase commit with a coordinator and two shards" style="--diagram-width:686px">
  <img src="diagrams/ch25-2pc-seq.svg" alt="Sequence diagram: the coordinator sends Prepare to shard A and shard B. Each logs prepared and answers OK. The coordinator logs the commit decision and sends Commit to both. Each commits and answers OK.">
  <figcaption>Sequence: two-phase commit. The decision is durable at the coordinator before phase 2.</figcaption>
</figure>
<p><b>Paxos</b> (and Raft, ZAB, Viewstamped Replication) are consensus protocols. A proposer proposes an outcome and acceptors vote. An acceptor answers Agree unless it already agreed to a higher-numbered proposal. When a majority agrees the proposer commits. With 2F + 1 nodes it tolerates F failures, and 2PC is the degenerate case F = 0. It does not block while a majority is alive. If nodes are in one data centre, rarely fail and are trusted, 2PC is often chosen for its fewer round trips. <b>Multi-Paxos</b> elects a stable leader and skips the proposal phase. The lecture assumes well-behaved nodes in one administrative domain; untrusted nodes need Byzantine fault tolerance.</p>

<h3>6. Replication</h3>
<p>Copies of data increase availability. Decisions: <b>replica configuration</b>, <b>propagation scheme</b>, <b>propagation timing</b> and <b>update method</b>. In <b>primary-replica</b> all writes go to the primary, which ships them to replicas without an atomic commit, replicas may serve reads that tolerate staleness, and an election chooses a new primary if it fails. In <b>multi-primary</b> any replica accepts writes and replicas must coordinate. <b>K-safety</b> is the number of replicas that must stay available: below it the DBMS goes offline rather than risk data. <b>Synchronous</b> propagation waits for replicas to log the change before acknowledging, so a failure loses nothing, and costs a round trip. <b>Asynchronous</b> propagation acknowledges at once, so a read on a replica can be stale and a failure can lose the last writes. Timing can be continuous or at commit.</p>

<h3>7. The CAP theorem</h3>
<p>CAP says that a distributed system cannot always provide <b>consistency</b> (linearizability: once a write completes, every later read sees it or a later write), <b>availability</b> (every live node answers every request) and <b>partition tolerance</b> (it works despite lost messages): pick two, and since partitions happen, the real choice is between consistency and availability during one. A system that chooses consistency stops accepting updates until a majority is connected, as traditional and NewSQL systems do. NoSQL systems often choose availability and give up strong consistency. <b>PACELC</b> adds that even without a partition there is a trade between latency and consistency.</p>

<h3>8. The trade-off</h3>
<p>Distribution buys scale and availability and pays with latency (round trips and commit protocols), complexity (failure handling) and weaker guarantees when you relax consistency. A transaction on one shard is as cheap as before. One across shards pays 2PC. Replication that waits for replicas is safe and slower. Choose the partition key and the replication mode from the access pattern and from how much loss you can accept.</p>

<h3>9. Syntax</h3>
<pre>-- PostgreSQL: a prepared transaction (the participant side of two-phase commit)
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 'alice';
PREPARE TRANSACTION 'transfer-77';        -- durable, locks held, waiting for the coordinator
COMMIT PREPARED 'transfer-77';            -- or ROLLBACK PREPARED 'transfer-77';

-- find transactions stuck in doubt
SELECT gid, prepared, owner FROM pg_prepared_xacts ORDER BY prepared;

-- replication: synchronous or asynchronous, and how far behind
SHOW synchronous_standby_names;           -- empty means asynchronous
SELECT client_addr, state, sync_state, replay_lag FROM pg_stat_replication;

-- read your own writes: send the read to the primary, or wait for the replica LSN
SELECT pg_current_wal_lsn();</pre>
<p>A row in <code>pg_prepared_xacts</code> that is hours old is a transaction in doubt. It holds locks until someone commits or rolls it back.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict, diagnose: OLD.diagnose,
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[25] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [tpc, lag, fence, part, quorum] };
})();
