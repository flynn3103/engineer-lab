/* Chapter 2 "Timeouts, Retries and Routing": scenes and Explain override (index 2, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Timeout values (1 s, 2 s, 1.5 s), attempt times and node numbers are illustrative. Client timeouts are driver settings, not scylla.yaml keys. */
(function () {
  const FOOT_A = 'Illustrative: 3 nodes, a shard-aware driver, one owner for seller 77.';
  const FOOT_B = 'Illustrative: client timeout 1 s, server timeout 2 s, attempts take 1.5 s.';
  const FOOT_C = 'Illustrative: one counter, one increment. The retry is what changes the count.';

  /* ---- 1. Extra hop without routing: a random node forwards, an aware driver goes straight to the owner ---- */
  const H_PANELS = [
    { id: 'app', x: 16, y: 58, w: 150, h: 290, title: 'Client driver', tone: 'info' },
    { id: 'n2', x: 180, y: 58, w: 200, h: 290, title: 'Node 2 · not owner', tone: 'info' },
    { id: 'own', x: 394, y: 58, w: 230, h: 290, title: 'Node 3 · owner shard 1', tone: 'info' },
  ];
  const H_TOK = {
    q: { label: 'SELECT order', sub: 'seller 77', tone: 'cursor', w: 118 },
    n2t: { label: 'Node 2', sub: 'random pick', tone: 'warn', w: 150 },
    ownT: { label: 'Node 3 · shard 1', sub: 'owns seller 77', tone: 'ok', w: 170 },
  };
  const randomHop = {
    id: 'hop-no-routing', label: 'Extra hop, no routing', desc: 'A query sent to a random node is forwarded to the owner, while a token-aware driver sends it straight there.',
    codeLabel: 'CQL', code: { bug: [
      'SELECT price FROM orders WHERE seller_id = 77 AND order_id = 9001;',
      '-- random node: it does not own seller 77, so it forwards',
      '-- token-aware driver: sends the query to a replica of seller 77',
      '-- shard-aware: the owning core of that replica takes the query'] },
    scene: { w: 640, h: 420, footer: FOOT_A, panels: H_PANELS, tokens: H_TOK },
    bug: [
      { log: 'The driver picks a random node, Node 2, for this query. Node 2 does not hold seller 77, so it cannot answer alone.',
        callout: 'The driver picks a random node', code: 1,
        at: { q: { x: 24, y: 120 }, n2t: { x: 206, y: 120 }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        arrows: [['q', 'n2t', 'random']], stats: [{ l: 'hops', v: '1' }] },
      { log: 'Node 2 hashes the key, finds that Node 3, shard 1 owns it, and forwards the query. That is one extra hop and extra CPU on Node 2.',
        callout: 'Node 2 forwards: one extra hop', moment: true, code: 1,
        at: { q: { x: 206, y: 200, sub: 'forwarded' }, n2t: { x: 206, y: 120 }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        arrows: [['n2t', 'ownT', 'forward']], stats: [{ l: 'hops', v: '2', cls: 'warn' }, { l: 'coordinator work', v: 'Node 2', cls: 'warn' }] },
      { log: 'Node 3 answers Node 2, and Node 2 relays the row to the application. The client waited for two hops.',
        callout: 'The reply travels back through Node 2', code: 1,
        at: { q: { x: 206, y: 200, sub: 'waiting', tone: 'cursor' }, n2t: { x: 206, y: 120 }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        arrows: [['ownT', 'n2t', 'reply']], stats: [{ l: 'hops', v: '2', cls: 'warn' }, { l: 'coordinator work', v: 'Node 2', cls: 'warn' }] },
      { log: 'With a token-aware, shard-aware driver, the client hashes the bound key itself and sends the query straight to Node 3, shard 1.',
        callout: 'Aware driver: the owner gets it directly', code: 2,
        at: { q: { x: 24, y: 120, sub: 'token-aware' }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        arrows: [['q', 'ownT', 'direct']], stats: [{ l: 'hops', v: '1', cls: 'ok' }, { l: 'coordinator work', v: 'owner', cls: 'ok' }] },
      { log: 'The owner answers the client directly. Node 2 is not involved, and the extra hop is gone.',
        callout: 'One hop: the owner answers directly', moment: true, code: 3,
        at: { q: { x: 24, y: 120, sub: 'answered' }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        arrows: [['ownT', 'q', 'reply']], stats: [{ l: 'hops', v: '1', cls: 'ok' }, { l: 'coordinator work', v: 'owner', cls: 'ok' }] },
      { log: 'Routing is cheap only when the driver has the key and the topology. Otherwise every request pays for a second node’s CPU.',
        callout: 'Each forward costs a second node work', code: 0,
        at: { q: { x: 24, y: 120, sub: 'answered' }, ownT: { x: 410, y: 120, sub: 'holds the key', tone: 'info' } },
        stats: [{ l: 'hops', v: '1', cls: 'ok' }, { l: 'forwards', v: '0', cls: 'ok' }],
        takeaway: 'A random node adds a forward to every request. Token and shard awareness need a supported driver that tracks topology.' },
    ],
  };

  /* ---- 2. Retries pile up: each client timeout starts a new attempt while the server finishes the old one ---- */
  const R_PANELS = [
    { id: 'att', x: 16, y: 58, w: 608, h: 140, title: 'Client · 1 s timeout', tone: 'info' },
    { id: 'srv', x: 16, y: 214, w: 608, h: 134, title: 'Server queue · 2 s', tone: 'info' },
  ];
  const AT = { a1: 30, a2: 180, a3: 330, a4: 480 };
  const R_TOK = {
    a1: { label: 'attempt 1', sub: 'sent at 0 s', tone: 'cursor', w: 130 },
    a2: { label: 'attempt 2', sub: 'sent at 1 s', tone: 'cursor', w: 130 },
    a3: { label: 'attempt 3', sub: 'sent at 2 s', tone: 'cursor', w: 130 },
    a4: { label: 'attempt 4', sub: 'sent at 3 s', tone: 'cursor', w: 130 },
    w1: { label: 'work 1', sub: 'running', tone: 'live', w: 130 },
    w2: { label: 'work 2', sub: 'running', tone: 'live', w: 130 },
    w3: { label: 'work 3', sub: 'running', tone: 'live', w: 130 },
    w4: { label: 'work 4', sub: 'running', tone: 'live', w: 130 },
  };
  const retryStorm = {
    id: 'retry-storm', label: 'Retries pile up', desc: 'The client times out at 1 s and retries, while the server still works on each earlier attempt, so one request becomes up to four.',
    codeLabel: 'Config', code: { bug: [
      '# server (scylla.yaml), illustrative values',
      'read_request_timeout_in_ms: 2000',
      'write_request_timeout_in_ms: 2000',
      '# client driver, not scylla.yaml: timeout 1 s, 3 retries'] },
    scene: { w: 640, h: 420, footer: FOOT_B, panels: R_PANELS, tokens: R_TOK },
    bug: [
      { log: 'Attempt 1 is sent at 0 s. Under overload the server needs 1.5 s (illustrative) for it, which is inside its own 2 s timeout.',
        callout: 'Attempt 1 is sent; the server starts work', code: 1,
        at: { a1: { x: AT.a1, y: 100 }, w1: { x: AT.a1, y: 262 } }, arrows: [['a1', 'w1', 'sent']],
        stats: [{ l: 'attempts', v: '1' }, { l: 'work in flight', v: '1' }] },
      { log: 'At 1 s the client gives up on attempt 1 and sends attempt 2. The server is still busy with attempt 1, so both run now.',
        callout: 'The client gives up; the server keeps going', moment: true, code: 1,
        at: { a1: { x: AT.a1, y: 100, sub: 'gave up at 1 s', tone: 'warn' }, a2: { x: AT.a2, y: 100 }, w1: { x: AT.a1, y: 262, sub: 'still running', tone: 'warn' }, w2: { x: AT.a2, y: 262 } },
        arrows: [['a2', 'w2', 'sent']], stats: [{ l: 'attempts', v: '2' }, { l: 'work in flight', v: '2', cls: 'warn' }] },
      { log: 'At 2 s attempt 3 is sent. Attempt 1 has finished, but its result is thrown away, and attempt 2 is still running.',
        callout: 'Finished work whose answer nobody reads', code: 2,
        at: { a1: { x: AT.a1, y: 100, sub: 'gave up at 1 s', tone: 'warn' }, a2: { x: AT.a2, y: 100, sub: 'gave up at 2 s', tone: 'warn' }, a3: { x: AT.a3, y: 100 },
          w1: { x: AT.a1, y: 262, sub: 'done, unused', tone: 'delete' }, w2: { x: AT.a2, y: 262, sub: 'still running', tone: 'warn' }, w3: { x: AT.a3, y: 262 } },
        arrows: [['a3', 'w3', 'sent']], stats: [{ l: 'attempts', v: '3' }, { l: 'work in flight', v: '2', cls: 'warn' }, { l: 'results used', v: '0', cls: 'bad' }] },
      { log: 'At 3 s attempt 4 is sent. One user request has now produced four copies of the work, and each copy costs replica time.',
        callout: 'One request, up to four copies of work', moment: true, code: 2,
        at: { a2: { x: AT.a2, y: 100, sub: 'gave up at 2 s', tone: 'warn' }, a3: { x: AT.a3, y: 100, sub: 'gave up at 3 s', tone: 'warn' }, a4: { x: AT.a4, y: 100 },
          w2: { x: AT.a2, y: 262, sub: 'done, unused', tone: 'delete' }, w3: { x: AT.a3, y: 262, sub: 'still running', tone: 'warn' }, w4: { x: AT.a4, y: 262 } },
        arrows: [['a4', 'w4', 'sent']], stats: [{ l: 'copies of work', v: '4', cls: 'bad' }, { l: 'results used', v: '0', cls: 'bad' }] },
      { log: 'After the last retry the driver reports a timeout to the application. Four copies of the work ran, and no result was used.',
        callout: 'Timeout reported; four copies ran', code: 3,
        at: { a3: { x: AT.a3, y: 100, sub: 'gave up at 3 s', tone: 'warn' }, a4: { x: AT.a4, y: 100, sub: 'gave up at 4 s', tone: 'warn' },
          w3: { x: AT.a3, y: 262, sub: 'done, unused', tone: 'delete' }, w4: { x: AT.a4, y: 262, sub: 'done, unused', tone: 'delete' } },
        stats: [{ l: 'copies of work', v: '4', cls: 'bad' }, { l: 'results used', v: '0', cls: 'bad' }] },
      { log: 'Each copy stays on the replicas until it finishes or times out on the server. Work in flight reaches zero only after that.',
        callout: 'The queue drains only after the work ends', code: 0,
        at: { a3: { x: AT.a3, y: 100, sub: 'gave up at 3 s', tone: 'warn' }, a4: { x: AT.a4, y: 100, sub: 'gave up at 4 s', tone: 'warn' } },
        stats: [{ l: 'copies of work', v: '4', cls: 'bad' }, { l: 'work in flight', v: '0', cls: 'ok' }, { l: 'results used', v: '0', cls: 'bad' }] },
      { log: 'Bounded retries with backoff give the queue room to drain between attempts, and they stop after a fixed count.',
        callout: 'Bounded, backed-off retries let it drain', code: 3,
        at: { a3: { x: AT.a3, y: 100, sub: 'gave up at 3 s', tone: 'warn' }, a4: { x: AT.a4, y: 100, sub: 'gave up at 4 s', tone: 'warn' } },
        stats: [{ l: 'copies of work', v: '2', cls: 'ok' }, { l: 'work in flight', v: '0', cls: 'ok' }, { l: 'results used', v: '1', cls: 'ok' }],
        takeaway: 'A client timeout shorter than the server timeout turns each timeout into new work. Keep it larger and bound the retries.' },
    ],
  };

  /* ---- 3. Retry a counter write: the first attempt is applied, the ack is lost, the retry applies it again ---- */
  const C_PANELS = [
    { id: 'pol', x: 16, y: 58, w: 190, h: 290, title: 'Driver retries', tone: 'info' },
    { id: 'cnt', x: 224, y: 58, w: 240, h: 290, title: 'Replica · counter cell', tone: 'info' },
    { id: 'res', x: 482, y: 58, w: 142, h: 290, title: 'Client result', tone: 'info' },
  ];
  const C_TOK = {
    u1: { label: 'UPDATE +1', sub: 'attempt 1', tone: 'cursor', w: 150 },
    u2: { label: 'UPDATE +1', sub: 'attempt 2 (retry)', tone: 'bad', w: 160 },
    cell: { label: 'views = 1', sub: 'after attempt 1', tone: 'ok', w: 200 },
    ack: { label: 'WriteTimeout', sub: 'received 1 of 2', tone: 'warn', w: 150 },
    resT: { label: 'OK after retry', sub: 'views = 2', tone: 'bad', w: 130 },
    pol: { label: 'no retry', sub: 'counter update', tone: 'ok', w: 150 },
    evA: { label: 'event 9001', sub: 'one row', tone: 'ok', w: 200 },
  };
  const counterRetry = {
    id: 'counter-retry', label: 'Retry a counter write', desc: 'A counter increment is applied on one replica, its ack is lost, and the driver retries it, so the event is counted twice.',
    codeLabel: 'CQL', code: { bug: [
      'UPDATE orders_stats SET views = views + 1 WHERE id = 42;',
      '-- attempt 1: applied on one replica, ack lost (illustrative)',
      '-- attempt 2: the driver retries the same statement',
      'SELECT views FROM orders_stats WHERE id = 42;   -- 2, expected 1'] },
    scene: { w: 640, h: 420, footer: FOOT_C, panels: C_PANELS, tokens: C_TOK },
    bug: [
      { log: 'The counter for id 42 starts at 0. The application increments it once with a plain UPDATE, and that statement is not idempotent.',
        callout: 'One increment should count once', code: 0,
        at: { u1: { x: 28, y: 120 }, cell: { x: 240, y: 120, label: 'views = 0', sub: 'before', tone: 'info' } },
        stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '0' }] },
      { log: 'Attempt 1 reaches one replica and is applied there. Its acknowledgement is lost on the way back to the coordinator.',
        callout: 'Attempt 1 is applied on one replica', code: 1,
        at: { u1: { x: 240, y: 120, sub: 'applied', tone: 'live' }, cell: { x: 240, y: 200 } },
        stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '1', cls: 'warn' }] },
      { log: 'The coordinator reports WriteTimeout after 1 of the 2 required answers. The client cannot tell whether the write was applied.',
        callout: 'Timeout: the client does not know if it applied', code: 2,
        at: { ack: { x: 240, y: 280 }, u1: { x: 28, y: 120, sub: 'timed out', tone: 'warn' }, cell: { x: 240, y: 200 } },
        arrows: [['ack', 'u1', 'timeout']], stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '1', cls: 'warn' }, { l: 'client knows', v: 'no', cls: 'warn' }] },
      { log: 'The driver retries the statement as new work. Attempt 2 adds 1 again, so the stored counter becomes 2, one more than the real number of events.',
        callout: 'The retry is a second increment', moment: true, code: 2,
        at: { u2: { x: 28, y: 220 }, cell: { x: 240, y: 120, label: 'views = 2', sub: 'expected 1', tone: 'bad' }, ack: { x: 240, y: 280 } },
        arrows: [['u2', 'cell', 'applied again']], stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '2', cls: 'bad' }] },
      { log: 'The second attempt returns OK. The client believes the increment happened once, but the counter has counted it twice.',
        callout: 'The client sees OK; the counter is off by one', code: 3,
        at: { u2: { x: 28, y: 220, sub: 'returned OK', tone: 'ok' }, cell: { x: 240, y: 120, label: 'views = 2', sub: 'expected 1', tone: 'bad' }, resT: { x: 490, y: 120 } },
        arrows: [['cell', 'resT', 'OK']], stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '2', cls: 'bad' }, { l: 'client result', v: 'OK', cls: 'warn' }] },
      { log: 'Idempotent means running the statement twice has the same effect as once. A counter increment is not idempotent, so the driver must not retry it.',
        callout: 'Counters and list appends are not retried', code: 2,
        at: { pol: { x: 28, y: 220 }, cell: { x: 240, y: 120, label: 'views = 2', sub: 'expected 1', tone: 'bad' }, resT: { x: 490, y: 120 } },
        stats: [{ l: 'expected views', v: '1' }, { l: 'stored views', v: '2', cls: 'bad' }, { l: 'retries allowed', v: 'no', cls: 'ok' }] },
      { log: 'For counts that must be exact, insert one row per event, keyed by a unique id. A retried insert writes the same row, so it cannot add a second one.',
        callout: 'One row per event: a retry cannot add', moment: true, code: 3,
        at: { u2: { x: 28, y: 220, sub: 'same row key', tone: 'cursor' }, evA: { x: 240, y: 120 } },
        arrows: [['u2', 'evA', 'same key']], stats: [{ l: 'expected views', v: '1' }, { l: 'rows for event 9001', v: '1', cls: 'ok' }, { l: 'retries allowed', v: 'yes', cls: 'ok' }] },
      { log: 'Aggregating the rows gives the count. Each event appears once, however many times its insert was retried.',
        callout: 'Count the rows, not the retries', code: 3,
        at: { evA: { x: 240, y: 120 }, resT: { x: 490, y: 120, label: 'count = 1', sub: 'expected 1', tone: 'ok' } },
        arrows: [['evA', 'resT', 'aggregate']],
        stats: [{ l: 'expected views', v: '1' }, { l: 'rows for event 9001', v: '1', cls: 'ok' }, { l: 'stored views', v: '1', cls: 'ok' }],
        takeaway: 'A retried write can apply twice. Counters need one row per event, or a statement that is safe to repeat.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { explain: EXPLAIN(), scenarios: [randomHop, retryStorm, counterRetry] };

  function EXPLAIN() {
    return `
<h3>1. Two costs: an extra hop and a duplicate attempt</h3>
<p>A request should reach the replica that owns its data in one hop, and the client should wait longer than the server. When either rule breaks, the cluster does the same work twice while it is already behind. The first cost is a hop: a random coordinator that does not own the key forwards the request, which adds a network round trip and CPU on a node that holds none of the data. The second cost is a duplicate: a client that gives up early starts a new attempt while the server is still finishing the first one. Under overload the two costs feed each other, because every extra attempt slows the queue that the next attempt must wait in.</p>

<h3>2. Shard-per-core routing</h3>
<p>Scylla runs one shard per CPU core, and each shard owns a slice of the data. A driver that is token-aware computes the token from the prepared statement and sends the request to a replica that holds the key. A shard-aware driver also picks the shard on that replica, so the query lands on the owning core with no forward. Without that awareness, the node that receives the query can be the wrong one, and it must forward. The source keeps this in one line: the driver must expose the routing key of a prepared statement, and its routing table must follow topology changes.</p>

<h3>3. Timeouts on both sides</h3>
<p>The server bounds how long it works on a request with <code>read_request_timeout_in_ms</code> and <code>write_request_timeout_in_ms</code>. The client timeout is a driver setting, not a scylla.yaml key, and it should be larger than the server timeout. Then the server finishes or drops each attempt before the client sends the next one. If the client gives up first, every timeout leaves behind work that still runs on the replicas. The retry flow below shows the decision the driver makes after a timeout.</p>
<figure class="mm" aria-label="Flowchart: what the driver does after a client timeout" style="--diagram-width:401.55px">
  <img src="diagrams/ch02-timeout-retry.svg" alt="Flowchart: what the driver does after a client timeout">
  <figcaption>Flowchart: a retry is new work for the cluster, so it is allowed only for idempotent statements, with a cap and backoff.</figcaption>
</figure>

<h3>4. Retries and idempotent statements</h3>
<p>A write timeout does not say whether the mutation was applied. The first attempt may have reached one replica, and only its acknowledgement was lost. A retry of a non-idempotent statement, such as a counter increment or a list append, then applies the change a second time. Mark a statement idempotent only when running it twice has the same effect as running it once. Leave counters and appends unmarked, so the driver never retries them. Speculative execution follows the same rule: it sends extra copies of work, so it is only safe for statements that tolerate repeats.</p>

<h3>5. The trade-off</h3>
<p>A longer timeout hides short spikes, but it does not add capacity, and it keeps clients waiting. A retry helps when one packet is lost and hurts when the cluster is saturated, because each retry is new work for a queue that is already long. Routing awareness removes a hop for every request, but only with a driver that supports it and keeps its topology current. In an overload, the right first step is to find the overloaded shard or disk and reduce the traffic, not to raise the timeouts. A queue that grows while business traffic stays flat is the signature of this loop, and it is visible on the servers before the application reports errors.</p>

<h3>6. The syntax, in one place</h3>
<pre># scylla.yaml, server side: bound how long a request may run (illustrative values)
read_request_timeout_in_ms: 2000
write_request_timeout_in_ms: 2000

-- cqlsh: trace one statement to see which replicas and shards handled it
TRACING ON;
SELECT price FROM orders WHERE seller_id = 77 AND order_id = 9001;

-- a counter update: not idempotent, so do not mark it for retry
UPDATE orders_stats SET views = views + 1 WHERE id = 42;</pre>
<p>The client timeout and the retry count belong to the driver configuration of the application. Set them there, and keep them above the server values, so each attempt ends on the server before the client sends another.</p>`;
  }
})();
