/* Chapter 14 · Distributed OLTP databases. Cross-node coordination: partitioning, replication, atomic commit.
   Everything lives inside PG.distributed so this file adds no global names. */
PG.distributed = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;
  const kids = arr => arr.filter(Boolean);
  const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);

  SX.css('ch14-css', `
.c14-cards{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}
.c14-card{flex:1 1 150px;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;overflow-wrap:anywhere}
.c14-card small{color:var(--mut);display:block}
.c14-card b{display:block;font-size:20px;color:var(--ink)}
.c14-card.lock{border-color:var(--warn)}
.c14-card.bad{border-color:var(--bad)}
.c14-pend{display:inline-block;font:12px ui-monospace,monospace;padding:2px 6px;margin:4px 4px 0 0;border-radius:6px;background:var(--soft);color:var(--ink)}
.c14-log{font:12px ui-monospace,monospace;color:var(--mut);overflow-wrap:anywhere;margin-top:6px}
.c14-out{margin:8px 0 0;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.c14-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.c14-bars{margin:8px 0}
.c14-row{display:flex;align-items:center;gap:8px;margin:4px 0;font:12px ui-monospace,monospace;color:var(--ink)}
.c14-row span:first-child{flex:0 0 96px}
.c14-track{flex:1;min-width:0;height:14px;background:var(--soft);border-radius:4px;overflow:hidden}
.c14-track i{display:block;height:100%;background:var(--acc)}
.c14-track i.hot{background:var(--bad)}
.c14-row em{flex:0 0 52px;font-style:normal;text-align:right}
.c14-tags{margin-top:6px}
.c14-tag{display:inline-block;font:12px ui-monospace,monospace;padding:2px 6px;margin:2px 4px 0 0;border-radius:6px;background:var(--soft);color:var(--ink)}
.c14-tag.lost{background:var(--bad);color:var(--card)}
.c14-tag.retry{background:var(--warn);color:var(--ink)}
`);

  /* ---------- PLAYGROUND: a transfer of 30 from alice (shard A) to bob (shard B) ---------- */
  const AMOUNT = 30, ALICE0 = 100, BOB0 = 50, TOTAL0 = ALICE0 + BOB0;
  const DA = ALICE0 - AMOUNT, DB = BOB0 + AMOUNT;

  function st(t, o) {
    return Object.assign({ t, alice: ALICE0, bob: BOB0, pa: 0, pb: 0, locks: 0, log: '', outcome: '' }, o || {});
  }

  /* each protocol and failure becomes a list of states; draw() turns one state into cards and totals */
  function transferStates(proto, fail) {
    const S = [st('Start: alice has ' + ALICE0 + ' on shard A and bob has ' + BOB0 + ' on shard B. The transfer moves ' + AMOUNT + ' from alice to bob.')];
    if (proto === 'dual') {
      S.push(st('Write 1: the coordinator commits the debit on shard A. Alice now has ' + DA + '.', { alice: DA }));
      if (fail === 'b') {
        S.push(st('Write 2 cannot reach shard B, which is down. Write 1 is already committed, and nothing undoes it.', { alice: DA, outcome: 'Money lost: ' + AMOUNT + ' vanished. The total is ' + (DA + BOB0) + ', not ' + TOTAL0 + '.' }));
      } else if (fail === 'coord') {
        S.push(st('The coordinator crashes after write 1 and before write 2. Nothing retries it, so bob never receives ' + AMOUNT + '.', { alice: DA, outcome: 'Money lost: ' + AMOUNT + ' vanished. The total is ' + (DA + BOB0) + ', not ' + TOTAL0 + '.' }));
      } else {
        S.push(st('Write 2: the coordinator commits the credit on shard B. Bob now has ' + DB + '.', { alice: DA, bob: DB, outcome: 'Both writes committed. The total is ' + TOTAL0 + '.' }));
      }
      return S;
    }
    /* two-phase commit */
    S.push(st('Prepare on A: shard A checks the debit, writes it to its log, and holds alice\'s row lock. Vote: OK.', { pa: -AMOUNT, locks: 1, log: 'A: prepared' }));
    if (fail === 'b') {
      S.push(st('Prepare on B fails: shard B is down, so it cannot vote OK.', { pa: -AMOUNT, locks: 1, log: 'A: prepared' }));
      S.push(st('The coordinator decides ABORT and sends abort to A. A drops the pending debit and releases its lock.', { log: 'decision: ABORT', outcome: 'Aborted. Alice still has ' + ALICE0 + ' and the total is ' + TOTAL0 + '. The client can retry safely.' }));
      return S;
    }
    S.push(st('Prepare on B: shard B holds bob\'s lock and records the credit. Vote: OK.', { pa: -AMOUNT, pb: AMOUNT, locks: 2, log: 'A: prepared, B: prepared' }));
    S.push(st('The coordinator writes its decision, COMMIT, to its own durable log.', { pa: -AMOUNT, pb: AMOUNT, locks: 2, log: 'decision: COMMIT' }));
    if (fail === 'coord') {
      S.push(st('The coordinator crashes before it sends COMMIT. Shards A and B hold their locks and cannot decide alone. They are in doubt.', { pa: -AMOUNT, pb: AMOUNT, locks: 2, log: 'decision: COMMIT (on disk, not sent)' }));
      S.push(st('Still down. The two rows stay locked, and any other transfer on alice or bob must wait. The applied total is still ' + TOTAL0 + '.', { pa: -AMOUNT, pb: AMOUNT, locks: 2, log: 'coordinator down' }));
      S.push(st('The coordinator restarts, reads COMMIT from its log, and sends COMMIT to A and B.', { pa: -AMOUNT, pb: AMOUNT, locks: 2, log: 'decision: COMMIT (resent)' }));
    }
    S.push(st('Commit on A and B: each shard applies its pending change. Alice has ' + DA + ' and bob has ' + DB + '.', { alice: DA, bob: DB, locks: 0, log: 'done' }));
    S.push(st('The coordinator tells the client the transfer committed. Both shards agree, so the total is ' + TOTAL0 + '.', { alice: DA, bob: DB, locks: 0, log: 'done', outcome: 'Committed on both shards. The total is ' + TOTAL0 + '.' }));
    return S;
  }

  function transferCards(s) {
    const total = s.alice + s.bob, missing = TOTAL0 - total;
    const pend = v => v === 0 ? 'no pending change' : 'pending ' + (v > 0 ? '+' : '') + v;
    const shardCard = (name, bal, p) => h('div', { class: 'c14-card' + (s.locks && p ? ' lock' : '') },
      h('small', {}, name), h('b', {}, String(bal)),
      h('span', { class: 'c14-pend' }, pend(p)),
      s.locks && p ? h('span', { class: 'c14-pend' }, 'row locked') : null);
    return kids([
      h('div', { class: 'c14-cards' },
        shardCard('Shard A · alice', s.alice, s.pa),
        shardCard('Shard B · bob', s.bob, s.pb),
        h('div', { class: 'c14-card' },
          h('small', {}, 'Coordinator log (durable)'),
          h('div', { class: 'c14-log' }, s.log || 'empty'))),
      h('div', { class: 'c14-stats' },
        stat('applied total', total),
        stat('missing', missing),
        stat('rows locked', s.locks)),
      s.outcome ? h('p', { class: 'c14-out' }, s.outcome) : null
    ]);
  }

  function playground() {
    let proto = 'dual', fail = 'none';
    const holder = h('div', {});
    const paint = () => { stopTimers(); holder.replaceChildren(stepper(transferStates(proto, fail), transferCards)); };
    const protoSeg = seg([{ v: 'dual', l: 'Dual writes (no coordinator)' }, { v: '2pc', l: 'Two-phase commit' }], proto, v => { proto = v; paint(); });
    const failSeg = seg([{ v: 'none', l: 'No failure' }, { v: 'b', l: 'Shard B is down' }, { v: 'coord', l: 'Coordinator crashes' }], fail, v => { fail = v; paint(); });
    paint();
    return h('div', { class: 'sx-play' }, h('div', { class: 'sx-controls' }, protoSeg, failSeg), holder);
  }

  /* ---------- PROBLEM DEMOS ---------- */

  /* 1 · hot shard: a tenant that gets 70% of requests */
  const hashStr = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
  const SHARDS = 4, PER_STEP = 40, STEPS = 5;
  function hotRequest(i) {
    const big = i % 10 < 7;
    return { tenant: big ? 'acme' : 'small' + (i % 3), bucket: i % 4 };
  }
  function hotShard(r, mode) {
    if (mode === 'bad') return hashStr(r.tenant) % SHARDS;
    return r.tenant === 'acme' ? r.bucket : hashStr(r.tenant) % SHARDS;
  }
  function hotDemo(mode) {
    const states = [];
    for (let k = 0; k <= STEPS; k++) {
      const loads = Array(SHARDS).fill(0);
      for (let i = 0; i < k * PER_STEP; i++) loads[hotShard(hotRequest(i), mode)]++;
      const n = k * PER_STEP;
      states.push({ t: mode === 'bad' ? 'Requests are routed by hash(tenant_id). Every request for acme goes to the same shard.' : 'Requests are routed by hash(tenant_id) plus a bucket for acme (acme spread over 4 buckets). The load spreads out.', loads, n, k });
    }
    return stepper(states, s => {
      const top = Math.max(...s.loads);
      return kids([
        h('div', { class: 'c14-bars' }, s.loads.map((x, j) => h('div', { class: 'c14-row' },
          h('span', {}, 'shard ' + j),
          h('div', { class: 'c14-track' }, h('i', { class: x === top && top > 0 ? 'hot' : '', style: 'width:' + pct(x, s.n) + '%' })),
          h('em', {}, pct(x, s.n) + '%')))),
        h('div', { class: 'c14-stats' }, stat('requests', s.n), stat('busiest shard', pct(top, s.n) + '%'))
      ]);
    });
  }

  /* 2 · coordinator failure: locks held while the coordinator is down (illustrative timings) */
  const CRASH_AT = 2, ARRIVALS = 5, RESTART_AFTER = 40, TAKEOVER_AFTER = 2;
  function inDoubtDemo(mode) {
    const resolve = mode === 'bad' ? CRASH_AT + RESTART_AFTER : CRASH_AT + TAKEOVER_AFTER;
    const held = resolve - CRASH_AT, queued = ARRIVALS * held;
    const S = [
      { t: 'Time 0 s: transfers on the same hot row arrive at ' + ARRIVALS + ' per second. Nothing is blocked yet.', now: 0, held: 0, queued: 0, locked: false },
      { t: 'Time ' + CRASH_AT + ' s: the coordinator crashes after prepare. The row is locked, and new transfers queue behind it.', now: CRASH_AT, held: 0, queued: 0, locked: true }
    ];
    if (mode === 'bad') {
      S.push({ t: 'Time ' + (CRASH_AT + 20) + ' s: the coordinator is still down. Participants cannot commit or abort alone, because the decision exists only in the dead coordinator\'s log.', now: CRASH_AT + 20, held: 20, queued: ARRIVALS * 20, locked: true });
      S.push({ t: 'Time ' + resolve + ' s: the coordinator restarts, reads its log, sends the decision, and the locks are released.', now: resolve, held, queued, locked: false });
    } else {
      S.push({ t: 'Time ' + resolve + ' s: a standby reads the decision from the replicated log after a short takeover. It finishes the transaction and releases the locks.', now: resolve, held, queued, locked: false });
    }
    return stepper(S, s => kids([
      h('div', { class: 'c14-cards' },
        h('div', { class: 'c14-card' + (s.locked ? ' lock' : '') }, h('small', {}, 'time'), h('b', {}, s.now + ' s')),
        h('div', { class: 'c14-card' + (s.locked ? ' bad' : '') }, h('small', {}, 'row locked for'), h('b', {}, s.held + ' s')),
        h('div', { class: 'c14-card' }, h('small', {}, 'transfers queued'), h('b', {}, String(s.queued)))),
      h('p', { class: 'c14-out' }, mode === 'bad' ? 'One coordinator, no standby: wait for it to restart.' : 'Decision in a replicated log: a standby finishes the transaction.')
    ]));
  }

  /* 3 · replica lag: a write is visible on the primary at once, on the replica after LAG ms (illustrative) */
  const LAG = 300, READS = [100, 200, 400, 600, 800];
  function lagDemo(mode) {
    const S = [{ t: 'Time 0 ms: the user saves a new balance of ' + DB + '. The primary commits it and acknowledges at once.', ms: 0, primary: DB, replica: BOB0, read: null, stale: 0 }];
    let stale = 0;
    READS.forEach(ms => {
      const fromReplica = mode === 'bad';
      const value = fromReplica && ms < LAG ? BOB0 : DB;
      if (value !== DB) stale++;
      S.push({ t: 'Time ' + ms + ' ms: the user reads the balance. ' + (fromReplica ? 'The read goes to a replica' + (ms < LAG ? ', which has not replayed the write yet.' : ', which has replayed it.') : 'The read goes to the primary, because it is inside the 1 s window after the user\'s own write.'), ms, primary: DB, replica: ms >= LAG ? DB : BOB0, read: value, stale });
    });
    return stepper(S, s => kids([
      h('div', { class: 'c14-cards' },
        h('div', { class: 'c14-card' }, h('small', {}, 'primary'), h('b', {}, String(s.primary))),
        h('div', { class: 'c14-card' + (s.replica !== s.primary ? ' lock' : '') }, h('small', {}, 'replica (lag ' + LAG + ' ms)'), h('b', {}, String(s.replica)))),
      h('div', { class: 'c14-stats' },
        stat('last read', s.read === null ? 'none yet' : String(s.read)),
        stat('stale reads', s.stale + ' of ' + READS.length))
    ]));
  }

  /* 4 · rebalancing: shard 7 moves from node 1 to node 2. The cut-over happens after write w3. */
  function moveDemo(mode) {
    const S = [];
    let n1 = [], n2 = [], lost = [], retried = [];
    const snap = (t, extra) => Object.assign({ t, n1: n1.slice(), n2: n2.slice(), lost: lost.slice(), retried: retried.slice() }, extra || {});
    S.push(snap('Start: shard 7 lives on node 1. A copy to node 2 starts from the snapshot at log position 100.'));
    ['w1', 'w2', 'w3'].forEach(w => {
      n1.push(w); n2.push(w);
      S.push(snap(w + ' arrives before the cut-over. Node 1 applies it, and the copy follows the log to node 2.'));
    });
    S.push(snap('Cut-over: the routing table now says shard 7 is on node 2. The copy stops at log position 103.'));
    if (mode === 'good') {
      S.push(snap('Fence: node 1 gets a new epoch for shard 7 and rejects any write that carries the old one.'));
    }
    ['w4', 'w5'].forEach(w => {
      if (mode === 'bad') {
        n1.push(w); lost.push(w);
        S.push(snap(w + ' comes from a client with a stale cache. Node 1 still accepts it, but the copy has stopped, so node 2 never gets it.'));
      } else {
        retried.push(w); n2.push(w);
        S.push(snap(w + ' comes from the stale client. Node 1 rejects it. The client refreshes its routing and retries on node 2 with the same request id.'));
      }
    });
    n2.push('w6');
    S.push(snap('w6 arrives after the refresh and goes to node 2.'));
    const last = S[S.length - 1];
    return stepper(S, s => kids([
      h('div', { class: 'c14-cards' },
        h('div', { class: 'c14-card' }, h('small', {}, 'node 1 holds'), h('div', { class: 'c14-log' }, s.n1.join(', ') || 'nothing')),
        h('div', { class: 'c14-card' }, h('small', {}, 'node 2 holds'), h('div', { class: 'c14-log' }, s.n2.join(', ') || 'nothing'))),
      h('div', { class: 'c14-stats' },
        stat('lost', s.lost.length),
        stat('retried', s.retried.length),
        stat('on node 2', s.n2.length + ' of ' + MOVE_WRITES)),
      s.lost.length ? h('div', { class: 'c14-tags' }, s.lost.map(w => h('span', { class: 'c14-tag lost' }, w + ' lost'))) : null,
      s.retried.length ? h('div', { class: 'c14-tags' }, s.retried.map(w => h('span', { class: 'c14-tag retry' }, w + ' retried'))) : null
    ]));
  }

  /* ---------- NUMBERS for the problem tabs, computed once from the demos above ---------- */
  const hotBad = (() => { const L = Array(SHARDS).fill(0); for (let i = 0; i < STEPS * PER_STEP; i++) L[hotShard(hotRequest(i), 'bad')]++; return pct(Math.max(...L), STEPS * PER_STEP); })();
  const hotGood = (() => { const L = Array(SHARDS).fill(0); for (let i = 0; i < STEPS * PER_STEP; i++) L[hotShard(hotRequest(i), 'good')]++; return pct(Math.max(...L), STEPS * PER_STEP); })();
  const lockBad = CRASH_AT + RESTART_AFTER - CRASH_AT, lockGood = TAKEOVER_AFTER;
  const staleOf = mode => READS.filter(ms => mode === 'bad' && ms < LAG).length;
  const staleBad = staleOf('bad'), staleGood = staleOf('good');
  const MOVE_WRITES = 6;
  /* lost writes: the late writes the old owner accepts after the cut-over (bad) or rejects and retries (good) */
  const moveRun = mode => { const late = ['w4', 'w5']; return { lost: mode === 'bad' ? late.length : 0, retried: mode === 'good' ? late.length : 0 }; };
  const moveLostBad = moveRun('bad').lost, moveLostGood = moveRun('good').lost;

  const PROBLEMS = [
    { tab: 'Hot shard',
      sym: 'one shard takes most of the requests while the others sit idle. The other shards show low load.',
      why: 'Hash partitioning spreads different keys evenly, but it cannot spread one key. A single busy tenant sends all of its requests to one shard, however many shards there are.',
      log: 'representative shard metrics, one 5-minute window\nshard-2  requests=high  p99 latency rising\nshard-0  requests=low   cpu idle\nbusiest shard share: ' + hotBad + '% of requests',
      demo: hotDemo,
      fix: ['Check the key distribution before you pick a partition key. A key with a few very heavy values is a poor choice.',
        'Split the hot key into buckets (acme plus a bucket suffix from 0 to 3). Reads for that tenant then fan out to the buckets.',
        'Move the hot tenant to a dedicated shard when it is large enough to justify the cost.',
        'Verify: compare the busiest shard\'s share of requests before and after the change. Here it moves from ' + hotBad + '% to ' + hotGood + '%.'] },
    { tab: 'Coordinator failure in doubt',
      sym: 'the rows of a transfer stay locked while the coordinator is down, and every new transfer on those rows waits.',
      why: 'In two-phase commit, a prepared participant cannot commit or abort on its own, because the coordinator may already have decided COMMIT. The decision is stored only in the coordinator\'s log, so the participant blocks until the coordinator returns.',
      log: 'representative PostgreSQL view after a coordinator crash\nSELECT gid, prepared FROM pg_prepared_xacts;\n xfer-42 | 2026-10-08 09:14:02   (still prepared, locks held)',
      demo: inDoubtDemo,
      fix: ['Write the decision to a replicated log (Raft or Paxos) before sending COMMIT, so a standby coordinator can read it.',
        'Let a standby take over after a short timeout, read the decision, and finish the transaction.',
        'Set a lock timeout on the participants, so queued transfers fail fast and the client retries them.',
        'Verify: force a coordinator restart in a test and measure how long the rows stay locked. Here it moves from ' + lockBad + ' s to ' + lockGood + ' s (illustrative).'] },
    { tab: 'Replica lag',
      sym: 'a user saves a new balance and reads the old value a moment later.',
      why: 'Asynchronous replication acknowledges the write before the replica applies it. A read routed to that replica can return the state from before the write, which breaks read-your-writes.',
      log: 'representative replica status, PostgreSQL pg_stat_replication\nclient_addr  state      replay_lag\n10.0.2.14    streaming  00:00:00.3\n(representative. replay_lag as an interval column is from the PostgreSQL documentation, not the course notes; check your version)',
      demo: lagDemo,
      fix: ['After a user writes, send that user\'s reads to the primary for a short window, such as 1 s.',
        'Return the commit position from the write, and read from a replica only once it has replayed past that position (for example with pg_last_wal_replay_lsn(), a PostgreSQL function, not in the course notes; check the docs).',
        'Use synchronous replication for the data that must be read back at once.',
        'Verify: run the same write-then-read test and count stale reads. Here it moves from ' + staleBad + ' of ' + READS.length + ' to ' + staleGood + '.'] },
    { tab: 'Rebalancing without fencing',
      sym: 'a write that the old owner accepted after the copy stopped never reaches the new owner.',
      why: 'A routing change is not instant. A client with a stale cache keeps sending writes to the old owner, which still accepts them. Nothing copies those writes after the copy stops, so they are lost.',
      log: 'representative node log during a shard move\nnode-1 shard=7 epoch=1 accepted write w4 (routing stale)\nnode-2 shard=7 epoch=2 copy stopped at log position 103',
      demo: moveDemo,
      fix: ['Give each shard owner an epoch number, and bump it at the cut-over.',
        'The old owner rejects any request that carries an old epoch. The client refreshes its routing and retries.',
        'Each retry carries a request id, so the new owner applies a retried write only once (idempotency).',
        'Verify: count the writes that clients saw acknowledged, and check each one on the new owner. Here lost writes move from ' + moveLostBad + ' to ' + moveLostGood + '.'] }
  ];

  root.append(
    sec('1 · The problem',
      para('A transfer moves money from alice on shard A to bob on shard B. Shard A commits the debit, then the coordinator crashes before shard B commits the credit.'),
      para('Each shard is correct on its own. But the two shards now disagree, and money has disappeared. (Illustrative: 30 units out of 150.)'),
      para('A distributed transaction needs one agreed outcome, even when a node or the coordinator fails.'),
      h('p', { class: 'sx-q', html: 'How can two shards commit a transfer so that either both apply it or neither does, even after a crash?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> partition the transactional state, and coordinate only the operations that cross a partition boundary.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Architectures:</b> a single node is shared everything. A shared-nothing cluster gives each node its own CPU, memory and disk, and nodes talk over the network only. Shared disk puts one disk behind stateless nodes with private buffer pools, which is more common in cloud-based DBMSs (notes 22, §2). Shared memory exposes one address space across processors, but it is rare in practice because the kernel provides it.',
        '<b>Transparency:</b> the application should not need to know where data lives. The same SQL should work on one node or many. Four design questions follow: how the application finds data, whether a query moves to the data or the data moves to the query, how the database is divided, and how correctness is kept.',
        '<b>Partitioning:</b> naive table partitioning puts each table on its own node, which is simple but does not scale and cannot help joins. Vertical partitioning splits columns, and each part keeps the record id. Horizontal partitioning splits rows by a partitioning key, using hash, range or predicate.',
        '<b>Logical or physical:</b> logical partitioning means a node is responsible for keys that it does not store (shared disk). Physical partitioning means the node stores its keys (shared nothing).',
        '<b>Consistent hashing:</b> nodes and keys sit on one ring, and a key belongs to the next node clockwise. Adding or removing a node moves only about 1/n of the keys. A replication factor of k stores each key on the k closest nodes.',
        '<b>Single-partition or distributed transactions:</b> the aim of partitioning is to keep most transactions on one partition. A transaction that touches several partitions needs coordination.',
        '<b>Routing:</b> the query is first analyzed for the data it needs. Its partitioning key, or the plan, decides which partition gets each fragment. The fragments run in parallel, and the results are combined into one answer. A key that lands on one partition makes a single-partition transaction; a key on several makes a distributed one.',
        '<b>Coordination:</b> a centralized coordinator (middleware or a traffic cop) holds one view of the locks and decides commit. Distributed two-phase locking (2PL) works well with it, because deadlocks are found quickly, but the coordinator becomes a bottleneck when many clients contend for the same partitions. A decentralized design, where the home partition coordinates, removes that bottleneck, but a global view of locks and deadlock handling is then hard. Inside each node, 2PL, MVCC or optimistic concurrency control decide commit (chapters 11 and 12). Federated databases join several separate DBMSs behind middleware, which is hard because of different data models, query languages and no single optimizer.',
        '<b>Replication:</b> in primary-replica, all updates go to one primary per object, and an election picks a new primary on failure. In multi-primary, any replica takes updates, and replicas must run an atomic commit. K-safety is the number of replicas that must be up; below it, the system halts itself.',
        '<b>Propagation:</b> synchronous propagation waits for replicas to log the change before the client is acknowledged (strong consistency). Asynchronous propagation acknowledges first, which can give stale reads. Continuous propagation sends each log record as it is made. On-commit propagation sends a transaction\'s records only after it commits.',
        '<b>Active or passive:</b> in active-active, each replica runs the transaction itself and the results must match. In active-passive, the transaction runs once and its changes go to the replicas, as bytes or as logical SQL. Most systems are active-passive.',
        '<b>Atomic commit:</b> two-phase commit (2PC), three-phase commit, Viewstamped Replication, Paxos, ZAB and Raft. Each has resource managers (RMs) that must agree on commit or abort, with three properties: stability (a decision never changes), consistency (all RMs end in the same state, even after failure) and liveness (the protocol keeps progressing while enough nodes are up).',
        '<b>Two-phase commit:</b> phase 1 sends prepare, and each participant votes OK or ABORT. Phase 2 sends COMMIT only if every vote was OK, and ABORT otherwise. A participant that has voted OK must wait for the coordinator if the coordinator crashes, so 2PC blocks. Early prepare voting lets the last query return its vote with its result. Early acknowledgement lets the client hear "committed" before phase 2 ends.',
        '<b>Paxos and Raft:</b> Paxos uses 2F+1 nodes and progresses while F+1 are working, so 2PC is the F=0 case. The proposer sends a proposal, the acceptors agree or reject, and a majority of agreements lets the proposer commit. Multi-Paxos keeps one stable leader and skips the propose step. Retries use exponential backoff, so two proposers do not keep blocking each other. Within one data center, 2PC is often preferred because it needs fewer round trips.',
        '<b>Idempotency:</b> a retried commit or write that carries the same request id must apply once. This is needed for any retry, not only for 2PC.',
        '<b>Online rebalancing:</b> moving a shard while it serves traffic needs fencing, usually an epoch or lease, so the old owner stops accepting writes before the copy is finished.',
        '<b>CAP and PACELC:</b> during a network partition, a system must choose between consistency and availability (CAP). Without a partition, it still chooses between latency and consistency (PACELC).',
        '<b>OLTP and OLAP:</b> OLTP transactions are short, touch a few rows and repeat often. OLAP queries are long, read-only and join many tables. This chapter is about OLTP. Analytical distributed systems are in chapters 15 and 16.',
        '<b>Node durability:</b> each node keeps its own log of prepare and commit outcomes. Single-node recovery is chapter 13, and the per-node locking or MVCC is chapters 11 and 12.'].map(x => '<li>' + x + '</li>').join('') })),
    sec('3 · Playground: a transfer across two shards',
      para('Pick a protocol and a failure. The steps run one message at a time. "Missing" counts money that left alice and never reached bob.'),
      playground()),
    sec('4 · Two-phase commit in PostgreSQL commands',
      para('PostgreSQL exposes the two phases directly. A session on each shard prepares its change, and a coordinator commits or rolls back the named transaction later. The example uses one transfer named xfer-42. (Representative sequence.)'),
      h('pre', { class: 'sx-log' }, h('code', {}, [
        '-- shard A',
        "BEGIN;",
        "UPDATE accounts SET balance = balance - 30 WHERE id = 'alice';",
        "PREPARE TRANSACTION 'xfer-42';   -- durable, lock held, vote OK",
        '-- shard B',
        "BEGIN;",
        "UPDATE accounts SET balance = balance + 30 WHERE id = 'bob';",
        "PREPARE TRANSACTION 'xfer-42';",
        '-- coordinator, after both votes and its own durable decision',
        "COMMIT PREPARED 'xfer-42';        -- run on A and on B",
        '-- an operator looking for in-doubt transactions',
        'SELECT gid, prepared FROM pg_prepared_xacts;'
      ].join('\n'))),
      para('PREPARE TRANSACTION needs max_prepared_transactions above zero, which is 0 by default (PostgreSQL documentation, not in the course notes; check the docs for your version). A forgotten prepared transaction holds its locks until someone runs COMMIT PREPARED or ROLLBACK PREPARED.')),
    sec('5 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
