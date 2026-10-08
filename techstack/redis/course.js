/* Problem-based course data for Redis. Written from the original CHAPTERS in techstack/redis/01-redis-internals-end-to-end.html. */
window.COURSE = {
  name: 'Redis',
  kick: '11 chapters · problem-based · Redis 7.2+',
  lead: `A marketplace keeps sessions, carts, a leaderboard and an order-event queue in Redis. Its production failures come from one executor that a slow command can block, memory limits that refuse writes, persistence and replication windows that can lose acknowledged data, and a cluster that splits keys into slots. Each chapter starts from one of these incidents, asks you to predict the outcome, then shows the mechanism step by step.`,
  chapters: [
{
  title: 'RESP and the Event Loop',
  problem: `A metrics proxy sits in front of the marketplace Redis and forwards 20,000 <code>INCR hits</code> commands from two services. The counter ends at 17,412 instead of 20,000 (illustrative). No client reports an error, and <code>INFO commandstats</code> shows nothing that explains the gap.`,
  predict: {
    q: `The proxy forwards one <code>INCR hits</code> command as three TCP reads of 12, 12 and 9 bytes. When does Redis execute it?`,
    opts: [
      `After the first read, because it already contains the command name`,
      `Only after all 33 bytes are in the client query buffer and the frame is complete`,
      `Never, split commands are rejected with a protocol error`
    ],
    ans: 1,
    why: `RESP frames say how many elements and bytes follow, so the parser keeps partial bytes in the client query buffer and waits. Redis never runs half a command. The undercount came from the proxy or the client, not from Redis.`
  },
  explain: `<h3>The idea</h3>
<p>Redis reads bytes from a socket, not whole messages. A TCP read can end halfway through a command. RESP is a length-prefixed format: <code>*2</code> says two elements follow, and <code>$4</code> says the next bulk string has 4 bytes. Redis knows how many bytes a command needs before it runs it.</p>
<h3>How it works, step by step</h3>
<p>Each client has its own <b>query buffer</b>. Bytes from the socket are appended there. <code>processInputBuffer</code> consumes only complete frames and leaves any partial frame for the next read.</p>
<p>The <b>event loop</b> (<code>ae.c</code>, epoll or kqueue) is one thread. It reads sockets, parses frames and dispatches complete commands. Replies go to a per-client <b>output buffer</b> and are written when the socket can accept them.</p>
<p>Commands from all clients run on <b>one executor</b>, one at a time. So <code>INCR hits</code> is atomic without a lock. <code>io-threads</code> only help with socket reads and writes; they never execute commands.</p>
<h3>The trade-off</h3>
<p>One executor makes every command atomic and the model easy to reason about. The price is that every command's cost is paid by all clients. Input buffers also grow with partial data, which is why <code>client-query-buffer-limit</code> (1 GB by default) exists. A counter that comes up short, as in this incident, usually means the sender or a proxy lost or rewrote bytes.</p>`,
  diagnose: [
    {
      t: 'Slow subscriber',
      sym: 'A slow Pub/Sub subscriber is disconnected by the output buffer limit',
      ctx: 'Subscribers drop and reconnect in a loop; the primary memory graph climbs and then falls.',
      why: 'Pub/Sub replies sit in that client output buffer. For the pubsub class the default limit is hard 32 MB or soft 8 MB held for 60 s. When the buffer crosses it, Redis closes the connection instead of letting one slow reader consume the server memory.',
      log: `# representative output, wording varies by version
# redis.conf defaults
client-output-buffer-limit pubsub 32mb 8mb 60

# server log
Client id=412 addr=10.0.3.8:51022 name= age=730 idle=0 flags=P ... omem=33554688 scheduled to be closed ASAP for overcoming of output buffer limits.`,
      note: 'Read omem in CLIENT LIST: it is the bytes waiting in that client output buffer. A value near the hard limit explains the close.',
      fix: [
        'Measure first: run CLIENT LIST TYPE pubsub and watch omem; compare with INFO clients.',
        'Fix: speed up or shard the slow consumer, or move durable fan-out to Streams (chapter 11) so slow readers lag instead of dropping.',
        'Fix: raise the pubsub limit only if you have measured headroom; each raise is memory the server can no longer use for data.',
        'Verify: the subscriber stays connected for a full peak hour and omem stays well below the soft limit.'
      ]
    },
    {
      t: 'maxclients',
      sym: 'The server refuses new connections with max number of clients reached',
      ctx: 'New connections fail with an error while existing ones work. Every pod reports connection errors at once.',
      why: 'Every connection has a socket and a query buffer. maxclients (10000 by default, lowered if the file descriptor limit is lower) bounds this. Over the limit the server answers the error and closes the new connection.',
      log: `127.0.0.1:6379> PING
(error) ERR max number of clients reached

127.0.0.1:6379> INFO clients
# Clients
connected_clients:10000
maxclients:10000

127.0.0.1:6379> INFO stats
rejected_connections:48213   # illustrative value`,
      note: 'rejected_connections counts refusals. connected_clients equal to maxclients confirms the cause.',
      fix: [
        'Measure first: compare connected_clients, maxclients and rejected_connections in INFO; list owners with CLIENT LIST.',
        'Fix: size client pools as pods times pool size and keep that total well below maxclients; one multiplexed connection per pod is often enough because commands are fast.',
        'Fix: set timeout to close idle connections and check the OS ulimit -n before raising maxclients.',
        'Verify: rejected_connections stops increasing during the next scale-out.'
      ]
    },
    {
      t: 'Protocol error',
      sym: 'A buggy client sends a malformed frame and the connection is closed',
      ctx: 'One client keeps reconnecting; the log shows protocol errors, other clients are fine.',
      why: 'The parser trusts the declared length. When the next bytes are not the expected $ or CRLF framing it cannot resynchronise safely, so it replies with a protocol error and closes the connection.',
      log: `# representative output, wording varies by version
-ERR Protocol error: invalid multibulk length
-ERR Protocol error: expected '$', got 'x'

# server log
Protocol error (invalid bulk length) from client: id=77 addr=10.2.4.9:40122 ...`,
      note: 'The reply names the framing rule that failed. The client id in the log lets you map it to a service with CLIENT LIST.',
      fix: [
        'Measure first: find the failing client with CLIENT LIST using the address from the log and capture its bytes with a packet dump.',
        'Fix: use a maintained client library, or compute bulk lengths in bytes, never in characters.',
        'Fix: if a proxy sits in the path, make sure it forwards bytes unchanged and does not rewrite or truncate frames.',
        'Verify: the protocol error log lines stop and the client no longer reconnects.'
      ]
    }
  ],
  source: { label: 'Original: RESP and the Event Loop', href: '01-redis-internals-end-to-end.html#ch0' },
  scenarios: [
    {
      id: 'frag',
      label: 'Lost bytes in proxy',
      desc: 'A proxy cuts a write short; Redis waits for a frame that never completes, so INCR never runs.',
      codeLabel: 'Command',
      code: {
        bug: [
          '# 33-byte command: *2 $4 INCR $4 hits',
          '# client writes all 33 bytes',
          '# proxy forwards 24 bytes, then cuts the last 9',
          '# redis: frame needs 33 bytes, has 24',
          '# INCR hits never runs'
        ],
        fix: [
          '# proxy forwards every byte unchanged',
          '# 33 bytes arrive in order',
          '# frame complete: *2, $4, INCR, $4, hits',
          '# executor runs INCR hits once'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cl', x: 10, y: 115, w: 130, h: 60, t: 'Client', s: 'INCR hits' },
          { id: 'px', x: 190, y: 115, w: 130, h: 60, t: 'Proxy', s: 'cuts a write' },
          { id: 'qb', x: 360, y: 25, w: 160, h: 60, t: 'Query buffer', s: 'waits for 33 bytes' },
          { id: 'ps', x: 360, y: 115, w: 160, h: 60, t: 'RESP parser', s: 'frame complete?' },
          { id: 'ex', x: 360, y: 215, w: 160, h: 60, t: 'Executor', s: 'runs INCR' }
        ],
        edges: [
          { id: 'e1', a: 'cl', b: 'px', label: 'bytes' },
          { id: 'e2', a: 'px', b: 'qb', label: 'reads' },
          { id: 'e3', a: 'qb', b: 'ps', label: 'parse' },
          { id: 'e4', a: 'ps', b: 'ex', label: 'full frame' }
        ]
      },
      bug: [
        { log: 'The client sends 33 bytes. The proxy is supposed to pass them on as they come.', code: 1, hl: { nodes: { cl: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'bytes sent', v: '33', cls: 'ok' }] },
        { log: 'The proxy forwards 24 bytes and cuts the last 9 (illustrative). Those 9 bytes are never sent.', code: 2, hl: { nodes: { px: 'bad', qb: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'bytes received', v: '24 of 33', cls: 'bad' }] },
        { log: 'The query buffer holds 24 bytes. The parser needs 33, so the frame is incomplete and waits.', code: 3, hl: { nodes: { qb: 'warn', ps: 'warn' }, edges: { e3: 'dim' } }, stats: [{ l: 'frame', v: 'incomplete', cls: 'warn' }] },
        { log: 'Redis keeps this client waiting and serves others. The executor never sees INCR hits.', code: 4, hl: { nodes: { ps: 'dim', ex: 'bad' }, edges: { e4: 'dim' } }, stats: [{ l: 'INCR runs', v: '0', cls: 'bad' }] },
        { log: 'Repeat for every lost write: each one is a missing increment, so the total comes up short.', code: 4, stats: [{ l: 'counter', v: '17,412 of 20,000', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The proxy forwards every byte as it receives it.', code: 0, hl: { nodes: { px: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'bytes received', v: '33 of 33', cls: 'ok' }] },
        { log: 'The query buffer holds 33 bytes, so the frame is complete.', code: 1, hl: { nodes: { qb: 'ok', ps: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'frame', v: 'complete', cls: 'ok' }] },
        { log: 'The executor runs INCR hits once. Each command is applied exactly once.', code: 3, hl: { nodes: { ex: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'INCR runs', v: '1', cls: 'ok' }, { l: 'counter', v: '20,000 of 20,000', cls: 'ok' }] }
      ]
    },
    {
      id: 'len',
      label: 'Wrong length in bytes',
      desc: 'A client declares a bulk length in characters, so Redis stops inside a multi-byte character.',
      codeLabel: 'Command',
      code: {
        bug: [
          '$5 CRLF héllo CRLF   # declared 5, actual 6 bytes',
          '# Redis reads 5 bytes: h, é (2 bytes), l, l',
          '# next byte is "o", but CRLF was expected',
          '# protocol error, connection closed'
        ],
        fix: [
          '$6 CRLF héllo CRLF   # declared 6 bytes, correct',
          '# Redis reads h, é, l, l, o',
          '# CRLF found, frame accepted'
        ]
      },
      diagram: {
        w: 640, h: 270,
        nodes: [
          { id: 'cl', x: 10, y: 100, w: 150, h: 60, t: 'Batch job', s: 'counts characters' },
          { id: 'qb', x: 240, y: 25, w: 160, h: 60, t: 'Query buffer', s: '6 bytes arrive' },
          { id: 'ps', x: 240, y: 170, w: 160, h: 60, t: 'RESP parser', s: 'reads 5 bytes' },
          { id: 'err', x: 470, y: 170, w: 150, h: 60, t: 'Error reply', s: 'closes socket' },
          { id: 'ex', x: 470, y: 25, w: 150, h: 60, t: 'Executor', s: 'SET runs' }
        ],
        edges: [
          { id: 'a', a: 'cl', b: 'qb', label: 'send' },
          { id: 'b', a: 'qb', b: 'ps', label: 'read' },
          { id: 'c', a: 'ps', b: 'err', label: 'bad frame' },
          { id: 'd', a: 'ps', b: 'ex', label: 'frame ok' }
        ]
      },
      bug: [
        { log: 'The client sends 6 bytes of "héllo" but declares a length of 5.', code: 0, hl: { nodes: { cl: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'declared', v: '5 bytes', cls: 'bad' }, { l: 'actual', v: '6 bytes', cls: 'warn' }] },
        { log: 'Redis reads exactly 5 bytes, which stops inside the é character.', code: 1, hl: { nodes: { qb: 'warn', ps: 'warn' }, edges: { b: 'on' } }, stats: [{ l: 'bytes read', v: '5', cls: 'warn' }] },
        { log: 'Redis expects CRLF after 5 bytes, finds "o" instead, and cannot resynchronise.', code: 2, hl: { nodes: { ps: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'framing', v: 'broken', cls: 'bad' }] },
        { log: 'Redis replies with a protocol error and closes the connection. The client reconnects.', code: 3, hl: { nodes: { err: 'bad' } }, stats: [{ l: 'connection', v: 'closed', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The client declares 6 bytes, the true byte length of the value.', code: 0, hl: { nodes: { cl: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'declared', v: '6 bytes', cls: 'ok' }] },
        { log: 'Redis reads 6 bytes: h, é, l, l, o.', code: 1, hl: { nodes: { qb: 'ok', ps: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'bytes read', v: '6', cls: 'ok' }] },
        { log: 'CRLF follows, the frame is accepted and SET runs.', code: 2, hl: { nodes: { ex: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'reply', v: '+OK', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Command Cost and the Single Thread',
  problem: `At 03:00 every client of the marketplace Redis times out for about 2 seconds (illustrative). Carts, sessions and the leaderboard fail together, then recover by themselves. CPU is pinned on one core, and a cleanup cron was running <code>KEYS session:*</code> at that moment.`,
  predict: {
    q: `One client runs <code>KEYS *</code> over 5 million keys. A second client sends <code>GET cart:42</code> a millisecond later. What happens to the GET?`,
    opts: [
      `It waits in the queue until KEYS has finished`,
      `It runs in parallel on another core and returns immediately`,
      `Redis aborts KEYS after the slowlog threshold so the GET is not delayed`
    ],
    ans: 0,
    why: `One thread executes commands one at a time. A GET queued behind KEYS cannot start until KEYS returns. SLOWLOG only records slow commands; it does not interrupt them.`
  },
  explain: `<h3>The idea</h3>
<p>Redis executes commands on one thread. That makes each command atomic, but it also means the cost of one command is paid by every other client. The useful question is not "is Redis fast?" but "how long does this one command hold the thread?"</p>
<h3>How it works, step by step</h3>
<p>The docs list a time complexity for every command. <code>KEYS</code> is O(N): it walks every key in one call, and nothing else runs until it returns. The cost follows total keys, not the number of matches.</p>
<p>For big collections, use cursor commands. <code>SCAN</code>, <code>HSCAN</code>, <code>SSCAN</code> and <code>ZSCAN</code> walk the data in small steps. <code>COUNT</code> is a hint for how much work each step does, so other commands run between steps.</p>
<p>Freeing a big key is also work. <code>UNLINK</code> detaches the key at once and frees the memory in a background lazyfree thread. <code>lazyfree-lazy-user-del</code> makes a plain <code>DEL</code> behave the same way.</p>
<p>To find the slow commands, use <code>SLOWLOG GET</code>. Its threshold is <code>slowlog-log-slower-than</code> (10000 microseconds by default). Long Lua scripts also block the thread; <code>busy-reply-threshold</code> controls when Redis starts answering other clients with BUSY.</p>
<h3>The trade-off</h3>
<p>A single executor is simple and safe, but it has no way to pause a long command. Redis cannot interrupt a running KEYS or a long script. The fix is always the same: keep each command's work bounded, and check SLOWLOG before blaming the network or the deploy.</p>`,
  diagnose: [
    {
      t: 'KEYS in production',
      sym: 'KEYS * blocks the server for the whole keyspace',
      ctx: 'All clients time out together for as long as the scan takes; recovery is instant.',
      why: 'KEYS is O(N): it walks every key in one command, and nothing else runs until it returns. The cost grows with total keys, not with the number of matches.',
      log: `127.0.0.1:6379> SLOWLOG GET 1
1) 1) (integer) 14
   2) (integer) 1696723200
   3) (integer) 1204331
   4) 1) "KEYS"
      2) "session:*"
# representative output, the duration is in microseconds (illustrative value)`,
      note: 'Field 3 is the execution time in microseconds. About 1.2 seconds on one command, with every other client queued behind it.',
      fix: [
        'Measure first: SLOWLOG GET 10 and LATENCY LATEST to confirm the offending command and duration.',
        'Fix: replace KEYS with SCAN 0 MATCH session:* COUNT 100 in a loop, or keep an index set of session ids.',
        'Fix: block KEYS for application users with ACLs (-@dangerous) so a cron cannot reintroduce it.',
        'Verify: p99 latency stays flat while the cleanup runs, and SLOWLOG shows no entry above the threshold.'
      ]
    },
    {
      t: 'Big key delete',
      sym: 'DEL of a multi-million-element key freezes the server',
      ctx: 'A latency spike of hundreds of milliseconds right after a delete or an expiry of one large key.',
      why: 'Freeing a collection touches every element. With plain DEL that happens on the executor thread, so it is an O(N) pause. UNLINK detaches the key immediately and frees the memory in the lazyfree thread.',
      log: `127.0.0.1:6379> SLOWLOG GET 1
1) 1) (integer) 22
   2) (integer) 1696726800
   3) (integer) 480211
   4) 1) "DEL"
      2) "lb:old"
# representative output (illustrative duration)

redis-cli --bigkeys   # finds the largest key per type`,
      note: 'A single DEL costing hundreds of milliseconds points to a big collection. MEMORY USAGE lb:old and ZCARD confirm it.',
      fix: [
        'Measure first: find the key with redis-cli --bigkeys or MEMORY USAGE, and read SLOWLOG.',
        'Fix: use UNLINK instead of DEL; set lazyfree-lazy-user-del yes (and lazyfree-lazy-expire) so existing code benefits.',
        'Fix: avoid creating giant keys: shard a board by day or by bucket.',
        'Verify: LATENCY LATEST shows no spike when the old board is removed.'
      ]
    },
    {
      t: 'Blocking script',
      sym: 'A long Lua script makes the server answer BUSY',
      ctx: 'Every command except a few fails with BUSY; the CPU is pinned on one core.',
      why: 'A script runs on the executor thread and cannot be interleaved. After busy-reply-threshold (default 5000 ms, older name lua-time-limit) Redis starts answering other clients with BUSY, but it cannot stop the script unless you kill it.',
      log: `127.0.0.1:6379> GET cart:42
(error) BUSY Redis is busy running a script. You can only call SCRIPT KILL or SHUTDOWN NOSAVE.

127.0.0.1:6379> SCRIPT KILL
OK`,
      note: 'SCRIPT KILL works only if the script has not written yet; otherwise the only way out is SHUTDOWN NOSAVE, which loses unsaved data.',
      fix: [
        'Measure first: SLOWLOG GET for the script entry and INFO commandstats for eval or evalsha cost.',
        'Fix: keep scripts O(1) or small and bounded; move reports to a replica or to a batch job that uses HSCAN.',
        'Fix: keep busy-reply-threshold at its default so a runaway script is visible quickly, and document the SCRIPT KILL runbook.',
        'Verify: no BUSY replies during the report and the script duration is in milliseconds.'
      ]
    },
    {
      t: 'Big collection read',
      sym: 'HGETALL on a huge hash blocks readers and floods the network',
      ctx: 'Latency spikes and a bandwidth jump whenever one particular key is read.',
      why: 'HGETALL, SMEMBERS and LRANGE 0 -1 are O(N) and build a reply as large as the collection. The executor builds it while others wait, and the output buffer then holds all of it.',
      log: `127.0.0.1:6379> SLOWLOG GET 1
1) 1) (integer) 31
   2) (integer) 1696730400
   3) (integer) 310442
   4) 1) "HGETALL"
      2) "cart:bot"
# representative output (illustrative duration)`,
      note: 'The command name and key in the slowlog identify the exact access; HLEN tells you how large the hash is.',
      fix: [
        'Measure first: HLEN or redis-cli --bigkeys on the key, then SLOWLOG GET.',
        'Fix: read with HSCAN pages, or store only what you read together; cap hash size by trimming old fields.',
        'Fix: split one unbounded key into bounded buckets (for example per day).',
        'Verify: the key no longer appears in SLOWLOG and the reply size per call is bounded.'
      ]
    }
  ],
  source: { label: 'Original: Command Cost and the Single Thread', href: '01-redis-internals-end-to-end.html#ch1' },
  scenarios: [
    {
      id: 'keys',
      label: 'KEYS holds the thread',
      desc: 'One KEYS call owns the single executor, so a GET waits behind it. SCAN steps let traffic interleave.',
      codeLabel: 'Command',
      code: {
        bug: [
          'cron: KEYS session:*        # about 5M keys, O(N)',
          'redis: executor walks every key',
          'client 2: GET cart:42 waits in the queue',
          'redis: KEYS returns after about 1.2 s (illustrative)',
          'client 2: GET runs, now about 1.2 s late'
        ],
        fix: [
          'cron: SCAN 0 MATCH session:* COUNT 100',
          'redis: executor runs one small step',
          'client 2: GET runs between steps',
          'redis: next cursor, repeat until cursor is 0'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'cron', x: 10, y: 30, w: 160, h: 60, t: 'Cron job', s: 'KEYS session:*' },
          { id: 'c2', x: 10, y: 170, w: 160, h: 60, t: 'Client 2', s: 'GET cart:42' },
          { id: 'q', x: 230, y: 100, w: 150, h: 60, t: 'Command queue', s: 'FIFO' },
          { id: 'ex', x: 430, y: 100, w: 160, h: 60, t: 'Executor', s: 'one thread' },
          { id: 'ks', x: 430, y: 220, w: 160, h: 60, t: 'Keyspace', s: 'about 5M keys' }
        ],
        edges: [
          { id: 'e1', a: 'cron', b: 'q', label: 'KEYS' },
          { id: 'e2', a: 'c2', b: 'q', label: 'GET' },
          { id: 'e3', a: 'q', b: 'ex', label: 'one at a time' },
          { id: 'e4', a: 'ex', b: 'ks', label: 'walks keys' }
        ]
      },
      bug: [
        { log: 'The cron job sends KEYS session:*. The command enters the queue.', code: 0, hl: { nodes: { cron: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'KEYS time', v: 'about 1.2 s', cls: 'bad' }] },
        { log: 'The executor walks all 5 million keys (illustrative) in one call.', code: 1, hl: { nodes: { ex: 'bad', ks: 'warn' }, edges: { e3: 'on', e4: 'on' } } },
        { log: 'Client 2 sends GET cart:42. It waits in the queue behind KEYS.', code: 2, hl: { nodes: { c2: 'warn', q: 'warn' }, edges: { e2: 'dim' } }, stats: [{ l: 'GET wait', v: 'about 1.2 s', cls: 'bad' }] },
        { log: 'KEYS returns. Only now does GET run, so every queued client is delayed the same way.', code: 3, hl: { nodes: { ex: 'dim' } }, stats: [{ l: 'p99 GET', v: '1200 ms', cls: 'bad' }] },
        { log: 'SLOWLOG records the 1.2 s KEYS call, but it did not interrupt it.', code: 4, stats: [{ l: 'SLOWLOG entries', v: '1', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The cron job sends SCAN 0 MATCH session:* COUNT 100.', code: 0, hl: { nodes: { cron: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'step size', v: '100 keys', cls: 'ok' }] },
        { log: 'The executor scans one small step and returns the next cursor.', code: 1, hl: { nodes: { ex: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'step time', v: 'under 1 ms', cls: 'ok' }] },
        { log: 'GET cart:42 is queued between steps and runs at once.', code: 2, hl: { nodes: { c2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'GET wait', v: 'under 1 ms', cls: 'ok' }] },
        { log: 'The cursor reaches 0 after many steps. Traffic was never blocked for long.', code: 3, hl: { nodes: { ks: 'ok' } }, stats: [{ l: 'p99 GET', v: '3 ms', cls: 'ok' }] }
      ]
    },
    {
      id: 'del',
      label: 'DEL vs UNLINK',
      desc: 'DEL frees a 4-million-member sorted set on the executor; UNLINK detaches the key and frees it in the background.',
      codeLabel: 'Command',
      code: {
        bug: [
          'DEL lb:old      # sorted set, 4M members',
          '# executor frees every member inline',
          '# all clients wait for the free',
          '# SLOWLOG: DEL lb:old, about 480 ms (illustrative)'
        ],
        fix: [
          'UNLINK lb:old   # detach now, free in background',
          '# executor only detaches the key',
          '# lazyfree thread frees the members'
        ]
      },
      diagram: {
        w: 640, h: 270,
        nodes: [
          { id: 'cl', x: 10, y: 100, w: 150, h: 60, t: 'Cleanup job', s: 'DEL / UNLINK' },
          { id: 'ex', x: 230, y: 100, w: 160, h: 60, t: 'Executor', s: 'one thread' },
          { id: 'ks', x: 450, y: 30, w: 160, h: 60, t: 'Keyspace', s: 'key removed' },
          { id: 'bg', x: 450, y: 170, w: 160, h: 60, t: 'Lazyfree thread', s: 'frees memory' }
        ],
        edges: [
          { id: 'e1', a: 'cl', b: 'ex', label: 'command' },
          { id: 'e2', a: 'ex', b: 'ks', label: 'detach' },
          { id: 'e3', a: 'ex', b: 'bg', label: 'free later' }
        ]
      },
      bug: [
        { log: 'The cleanup job sends DEL lb:old for a sorted set of 4 million members (illustrative).', code: 0, hl: { nodes: { cl: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'members', v: '4M', cls: 'bad' }] },
        { log: 'The executor frees every member before it returns.', code: 1, hl: { nodes: { ex: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'blocked', v: '480 ms', cls: 'bad' }] },
        { log: 'No other command runs during the free. Every client waits.', code: 2, hl: { nodes: { ex: 'bad' } }, stats: [{ l: 'clients', v: 'all waiting', cls: 'bad' }] },
        { log: 'The spike appears in SLOWLOG as a DEL call of about 480 ms.', code: 3, stats: [{ l: 'SLOWLOG', v: 'DEL lb:old', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The job sends UNLINK lb:old instead.', code: 0, hl: { nodes: { cl: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'command', v: 'UNLINK', cls: 'ok' }] },
        { log: 'The key is detached from the keyspace at once.', code: 1, hl: { nodes: { ex: 'ok', ks: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'blocked', v: 'microseconds', cls: 'ok' }] },
        { log: 'The memory is freed later by the lazyfree thread, off the executor.', code: 2, hl: { nodes: { bg: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'blocked', v: 'microseconds', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Typed Keyspace and Encodings',
  problem: `After a deploy the cart service fails for some users, and Redis memory climbs to about three times its usual level (illustrative). The release mixed two cart layouts on the same key names, and a bulk import filled many carts with hundreds of fields.`,
  predict: {
    q: `A hash grows from 100 to 200 fields with default configuration. What changes inside Redis?`,
    opts: [
      `Nothing, a hash is always a hashtable`,
      `The extra fields are dropped once the hash passes 128 fields`,
      `The encoding converts from listpack to hashtable and memory per field rises`
    ],
    ans: 2,
    why: `The defaults hash-max-listpack-entries 128 and hash-max-listpack-value 64 keep small hashes in a compact listpack. Crossing either limit converts the hash to a hashtable, which uses more memory per field. Data is never dropped.`
  },
  explain: `<h3>The idea</h3>
<p>Every key holds a typed value. The type decides which commands are allowed, and the encoding decides how the bytes are laid out in memory. Redis keeps small values in compact encodings and switches to larger ones when a size limit is crossed.</p>
<h3>How it works, step by step</h3>
<p>Each value is a <code>redisObject</code> with a <code>type</code> (string, list, hash, set, zset, stream) and an <code>encoding</code>. A command checks the type first. If the type does not match, the reply is <code>WRONGTYPE</code> and nothing changes.</p>
<p>Small hashes and sorted sets use a <b>listpack</b>, a flat, contiguous array. Sets of small integers use <code>intset</code>. Lists are a <code>quicklist</code> of listpacks.</p>
<p>The thresholds <code>hash-max-listpack-entries</code>, <code>hash-max-listpack-value</code> and <code>zset-max-listpack-entries</code> decide when to convert. The conversion happens at once, and it does not shrink back automatically.</p>
<p>Inspect with <code>TYPE</code>, <code>OBJECT ENCODING</code> and <code>MEMORY USAGE</code> before guessing.</p>
<h3>The trade-off</h3>
<p>Compact encodings save memory but cost CPU, because listpack operations scan linearly. Raising a threshold can look like a free fix, but it moves the cost from memory to CPU. Splitting large values into bounded keys keeps both in check.</p>`,
  diagnose: [
    {
      t: 'WRONGTYPE',
      sym: 'WRONGTYPE after a deploy changes the type of a key',
      ctx: 'Reads or writes fail for one key family while the rest of Redis is healthy.',
      why: 'Types are checked before any command touches the value. Running a hash command on a string key (or the reverse) is rejected, and Redis never converts a value between types.',
      log: `127.0.0.1:6379> SET cart:42 "json blob"
OK
127.0.0.1:6379> HGETALL cart:42
(error) WRONGTYPE Operation against a key holding the wrong kind of value
127.0.0.1:6379> TYPE cart:42
string`,
      note: 'TYPE key shows what is really stored. The error text is fixed by the server.',
      fix: [
        'Measure first: TYPE on a failing key and redis-cli --scan --pattern cart:* sampled by type.',
        'Fix: version key names (cart:v2:) when the value type or layout changes, and migrate lazily.',
        'Fix: finish the rolling deploy or pin writers to one layout; add a type check in the client wrapper.',
        'Verify: no WRONGTYPE replies in application logs after the cut-over.'
      ]
    },
    {
      t: 'Listpack threshold',
      sym: 'Crossing hash-max-listpack-entries makes memory jump',
      ctx: 'Memory per key rises sharply after an import, with the same number of keys.',
      why: 'At 129 fields (default 128) the hash converts from a listpack to a hashtable. The hashtable needs a bucket entry and object headers per field, so each field costs more bytes.',
      log: `127.0.0.1:6379> OBJECT ENCODING cart:42
"listpack"
127.0.0.1:6379> MEMORY USAGE cart:42
(integer) 1980      # illustrative
127.0.0.1:6379> HSET cart:42 f129 v
127.0.0.1:6379> OBJECT ENCODING cart:42
"hashtable"
127.0.0.1:6379> MEMORY USAGE cart:42
(integer) 9420      # illustrative`,
      note: 'Compare MEMORY USAGE before and after the encoding changes. The byte counts here are illustrative.',
      fix: [
        'Measure first: OBJECT ENCODING and MEMORY USAGE on a sample of keys.',
        'Fix: bucket large hashes so each stays at or below the limit (for example cart:{id}:{n}).',
        'Fix: raising hash-max-listpack-entries trades CPU for memory because listpack operations are linear; test before changing.',
        'Verify: MEMORY USAGE per key stays flat and used_memory returns to the expected level.'
      ]
    },
    {
      t: 'Long value',
      sym: 'One long value converts the whole hash',
      ctx: 'Memory is higher than field counts predict for hashes that hold a few large values.',
      why: 'The listpack stays only while every value is at most hash-max-listpack-value bytes (default 64). One longer value converts the whole hash even with only a few fields.',
      log: `127.0.0.1:6379> HSET cart:7 note "<200 bytes of text>"
127.0.0.1:6379> OBJECT ENCODING cart:7
"hashtable"
# representative output`,
      note: 'A small hash with hashtable encoding usually means a long value tripped the value limit.',
      fix: [
        'Measure first: sample OBJECT ENCODING on small hashes to find which ones are hashtables.',
        'Fix: keep long values in separate string keys and store only a short reference in the hash.',
        'Fix: or raise hash-max-listpack-value modestly if all values are bounded.',
        'Verify: those hashes report listpack again after being rewritten.'
      ]
    },
    {
      t: 'INCR on text',
      sym: 'INCR fails with value is not an integer or out of range',
      ctx: 'One counter key errors while other counters work.',
      why: 'INCR requires the value to parse as a 64-bit signed integer. Anything else, including "3.5" or a value that would overflow, is rejected. Floats need INCRBYFLOAT.',
      log: `127.0.0.1:6379> SET hits "3.5"
OK
127.0.0.1:6379> INCR hits
(error) ERR value is not an integer or out of range
127.0.0.1:6379> INCRBYFLOAT hits 1
"4.5"`,
      note: 'The server rejects the command before any change, so the value is left as it was.',
      fix: [
        'Measure first: GET key and TYPE key; find which writer produced the bad value.',
        'Fix: give counters their own key namespace and a single owning service.',
        'Fix: use INCRBYFLOAT only where fractional values are intended.',
        'Verify: the error rate for that command drops to zero.'
      ]
    }
  ],
  source: { label: 'Original: Typed Keyspace and Encodings', href: '01-redis-internals-end-to-end.html#ch2' },
  scenarios: [
    {
      id: 'type',
      label: 'Two layouts, one key',
      desc: 'An old pod writes a hash and a new pod writes a string to the same key; the type check rejects the mismatch.',
      codeLabel: 'Command',
      code: {
        bug: [
          'old pod: HSET cart:42 items 3          # hash layout',
          'new pod: SET cart:42 "json blob"      # string layout',
          'old pod: HGETALL cart:42',
          '(error) WRONGTYPE Operation against a key holding the wrong kind of value'
        ],
        fix: [
          'new pod: HSET cart:v2:42 items 3      # new key name',
          'old pod keeps cart:42 as a hash',
          'HGETALL cart:v2:42 returns the cart'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'oldp', x: 10, y: 40, w: 160, h: 60, t: 'Old pod', s: 'writes a hash' },
          { id: 'newp', x: 10, y: 190, w: 160, h: 60, t: 'New pod', s: 'writes a string' },
          { id: 'key', x: 240, y: 40, w: 170, h: 60, t: 'cart:42', s: 'one key, two types' },
          { id: 'key2', x: 240, y: 190, w: 170, h: 60, t: 'cart:v2:42', s: 'hash, new layout' },
          { id: 'err', x: 470, y: 40, w: 150, h: 60, t: 'WRONGTYPE', s: 'reply rejected' },
          { id: 'ok', x: 470, y: 190, w: 150, h: 60, t: 'Reply OK', s: 'no type clash' }
        ],
        edges: [
          { id: 'a', a: 'oldp', b: 'key', label: 'HSET / HGETALL' },
          { id: 'b', a: 'newp', b: 'key', label: 'SET' },
          { id: 'c', a: 'key', b: 'err', label: 'type check' },
          { id: 'd', a: 'newp', b: 'key2', label: 'new key' },
          { id: 'e', a: 'key2', b: 'ok', label: 'HGETALL' }
        ]
      },
      bug: [
        { log: 'The old pod stores cart:42 as a hash.', code: 0, hl: { nodes: { oldp: 'on', key: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'type', v: 'hash', cls: 'warn' }] },
        { log: 'During the rolling deploy the new pod writes a string to the same key.', code: 1, hl: { nodes: { newp: 'warn' }, edges: { b: 'warn' } }, stats: [{ l: 'type', v: 'string', cls: 'warn' }] },
        { log: 'The old pod runs HGETALL on the key. Redis checks the type first.', code: 2, hl: { nodes: { key: 'warn' }, edges: { c: 'bad' } } },
        { log: 'Redis rejects the command with WRONGTYPE and never converts the value. Requests fail (illustrative: 40%).', code: 3, hl: { nodes: { err: 'bad' } }, stats: [{ l: 'requests failing', v: '40%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'New code writes cart:v2:42, a separate key name for the new layout.', code: 0, hl: { nodes: { newp: 'ok', key2: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'key', v: 'cart:v2:42', cls: 'ok' }] },
        { log: 'Old pods keep their own key, so no two writers share one key with two types.', code: 1, hl: { nodes: { oldp: 'ok', key: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'type clash', v: 'none', cls: 'ok' }] },
        { log: 'HGETALL on the new key succeeds.', code: 2, hl: { nodes: { key2: 'ok', ok: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'requests failing', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'listpack',
      label: 'Hash over the limit',
      desc: 'Adding a 129th field converts the hash from a listpack to a hashtable, and each field costs more memory.',
      codeLabel: 'Command',
      code: {
        bug: [
          'HSET cart:42 f129 v        # 129th field crosses the limit',
          'OBJECT ENCODING cart:42    -> "hashtable"',
          'MEMORY USAGE cart:42       -> 9420 (illustrative)',
          '# same 200 fields now cost about 3x the bytes'
        ],
        fix: [
          'HSET cart:42:2 f129 v      # second bucket, 128 max',
          'OBJECT ENCODING cart:42:2  -> "listpack"',
          '# each bucket stays a compact listpack'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cmd', x: 10, y: 110, w: 150, h: 60, t: 'HSET', s: 'field 129' },
          { id: 'check', x: 220, y: 110, w: 170, h: 60, t: 'Entry check', s: 'over 128 entries' },
          { id: 'lp', x: 430, y: 25, w: 180, h: 60, t: 'Listpack', s: 'compact, small' },
          { id: 'ht', x: 430, y: 110, w: 180, h: 60, t: 'Hashtable', s: 'more bytes per field' },
          { id: 'bk', x: 430, y: 205, w: 180, h: 60, t: 'Second bucket', s: 'cart:42:2 listpack' }
        ],
        edges: [
          { id: 'a', a: 'cmd', b: 'check', label: 'write' },
          { id: 'b', a: 'check', b: 'lp', label: 'at most 128' },
          { id: 'c', a: 'check', b: 'ht', label: 'over limit' },
          { id: 'd', a: 'check', b: 'bk', label: 'new bucket' }
        ]
      },
      bug: [
        { log: 'HSET adds field 129 to cart:42. Until now the hash was a listpack.', code: 0, hl: { nodes: { cmd: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'fields', v: '129', cls: 'warn' }] },
        { log: 'Redis checks the entry count against hash-max-listpack-entries (128 by default).', code: 1, hl: { nodes: { check: 'warn' }, edges: { b: 'dim' } } },
        { log: 'The hash converts to a hashtable. Data is kept; nothing is dropped.', code: 1, hl: { nodes: { ht: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'encoding', v: 'hashtable', cls: 'bad' }] },
        { log: 'Each field now costs more bytes. The same 200 fields take about 3x the memory (illustrative).', code: 2, stats: [{ l: 'bytes per cart', v: 'about 3x', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The writer puts field 129 into a second bucket, cart:42:2.', code: 0, hl: { nodes: { cmd: 'ok', bk: 'ok' }, edges: { d: 'ok' } } },
        { log: 'Each bucket holds at most 128 entries, so each stays a listpack.', code: 1, hl: { nodes: { lp: 'ok', bk: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'encoding', v: 'listpack', cls: 'ok' }] },
        { log: 'Memory per field stays low and flat. Verify with MEMORY USAGE per key.', code: 2, stats: [{ l: 'bytes per cart', v: 'compact', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Key Expiration',
  problem: `A marketing campaign created about a million sessions within a few minutes, each with a 30-minute TTL (illustrative). Thirty minutes later latency spikes at the top of the minute. After the campaign ends, memory stays high for a long time even though no traffic is left.`,
  predict: {
    q: `A key expired 10 minutes ago and nobody has read it since. Is it still using memory?`,
    opts: [
      `No, Redis frees a key at the exact second its TTL ends`,
      `Possibly yes, until a lookup touches it or the active cycle samples it`,
      `Yes, always, until you restart the server`
    ],
    ans: 1,
    why: `An expired key is logically gone: any access finds the deadline passed and deletes it. But Redis does not scan all keys. A random-sampling cycle reclaims untouched ones over time, so some can stay in memory for a while.`
  },
  explain: `<h3>The idea</h3>
<p>Redis does not scan every key to find expired ones; that would block the executor. Instead it stores an absolute deadline and removes keys in two ways: when they are touched, and by a small periodic sample.</p>
<h3>How it works, step by step</h3>
<p><code>EXPIRE</code> stores a unix time in the separate <code>expires</code> dictionary, so checking a deadline is a cheap lookup.</p>
<p><b>Lazy expiry</b>: every access calls <code>expireIfNeeded</code>. If the deadline has passed, the key is deleted and treated as missing.</p>
<p><b>Active cycle</b> (<code>expire.c</code>): about 10 times per second, Redis samples 20 keys that have a TTL and deletes the expired ones. If more than 10% of the sample was expired, it repeats, within a time budget. <code>active-expire-effort</code> (1 to 10) raises that effort.</p>
<p><b>Replicas</b> do not expire keys on their own. They apply the <code>DEL</code> the primary sends.</p>
<h3>The trade-off</h3>
<p>Sampling keeps the work small and bounded, but it is probabilistic. Keys that nobody reads can stay in memory for a while. Many keys sharing one deadline make the sampler work hard at one moment, and a spike follows. Spread the TTLs, and raise the effort only after measuring.</p>`,
  diagnose: [
    {
      t: 'Synchronised TTL',
      sym: 'Synchronised TTLs expire at once and cause a latency spike',
      ctx: 'A latency spike repeats at a regular interval, matching the TTL.',
      why: 'All keys share nearly one deadline, so the active cycle finds almost every sample expired and keeps repeating until its time budget runs out. That budget is spent on the executor thread, so clients see added latency.',
      log: `# representative output, values illustrative
127.0.0.1:6379> INFO stats
expired_keys:512340
expired_stale_perc:0.62
expire_cycle_cpu_milliseconds:18400

127.0.0.1:6379> LATENCY LATEST
1) 1) "expire-cycle"
   2) (integer) 1696733400
   3) (integer) 25
   4) (integer) 31`,
      note: 'expired_keys jumping and an expire-cycle latency event (milliseconds) show the cycle running long.',
      fix: [
        'Measure first: INFO stats (expired_keys, expire_cycle_cpu_milliseconds) and LATENCY LATEST.',
        'Fix: add random jitter to TTLs, for example 1800 + random(0, 300) seconds.',
        'Fix: spread bulk writes over time instead of one burst.',
        'Verify: the periodic spike disappears from the latency graph.'
      ]
    },
    {
      t: 'Stale keys',
      sym: 'Expired keys pile up in memory when traffic is low',
      ctx: 'Memory stays high long after keys should be gone; DBSIZE still counts them.',
      why: 'The active cycle stops when fewer than about 10% of a sample is expired, so a fraction of expired keys can remain. Low read traffic means the lazy path does not help either.',
      log: `127.0.0.1:6379> INFO keyspace
db0:keys=980000,expires=980000,avg_ttl=0   # illustrative
127.0.0.1:6379> INFO stats
expired_stale_perc:8.4                     # illustrative`,
      note: 'expired_stale_perc estimates the share of keys that are expired but not yet deleted.',
      fix: [
        'Measure first: INFO stats expired_stale_perc and INFO memory used_memory over time.',
        'Fix: raise active-expire-effort (default 1, maximum 10) in steps; it costs more CPU and latency per cycle.',
        'Fix: for one-off cleanup, run a bounded SCAN that touches keys so the lazy path deletes them.',
        'Verify: expired_stale_perc falls and memory follows within a few cycles.'
      ]
    },
    {
      t: 'Lost TTL',
      sym: 'A plain SET overwrite drops the TTL and keys live forever',
      ctx: 'Memory grows slowly without bound; TTL on affected keys returns -1.',
      why: 'SET replaces the value and, unless told otherwise, clears any existing TTL. The key is now persistent.',
      log: `127.0.0.1:6379> SET sess:abc v1 EX 1800
OK
127.0.0.1:6379> SET sess:abc v2
OK
127.0.0.1:6379> TTL sess:abc
(integer) -1`,
      note: 'A TTL of -1 means the key exists but has no expiry; -2 would mean it does not exist.',
      fix: [
        'Measure first: sample keys with SCAN and TTL to count persistent ones in the session namespace.',
        'Fix: use SET key value KEEPTTL to keep the deadline, or set EX on every write.',
        'Fix: add a monitor that alerts when keys under a TTL-only prefix have TTL -1.',
        'Verify: new keys in the namespace always report a positive TTL.'
      ]
    }
  ],
  source: { label: 'Original: Key Expiration', href: '01-redis-internals-end-to-end.html#ch3' },
  scenarios: [
    {
      id: 'sync',
      label: 'Same-second deadlines',
      desc: 'Keys written with one TTL expire together. The expire cycle then runs long, and clients see a spike.',
      codeLabel: 'Command',
      code: {
        bug: [
          'for i in 1..500000: SET cache:i v EX 1800   # one burst',
          '# all deadlines fall in about the same second',
          '# expire cycle samples keys, finds nearly all expired',
          '# cycle repeats until its time budget ends',
          'LATENCY LATEST shows expire-cycle (illustrative)'
        ],
        fix: [
          'for i in 1..500000: SET cache:i v EX (1800 + random(0, 300))',
          '# deadlines now spread over about 5 minutes',
          '# each cycle finds only a few expired keys',
          '# cycle stays within a small budget'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'burst', x: 10, y: 110, w: 170, h: 60, t: 'Bulk writer', s: 'EX 1800, 500k keys' },
          { id: 'dl', x: 240, y: 110, w: 160, h: 60, t: 'Deadlines', s: 'one second' },
          { id: 'cyc', x: 440, y: 30, w: 180, h: 60, t: 'Expire cycle', s: 'samples 20 keys' },
          { id: 'lat', x: 440, y: 190, w: 180, h: 60, t: 'Client latency', s: 'spikes' }
        ],
        edges: [
          { id: 'a', a: 'burst', b: 'dl', label: 'same deadline' },
          { id: 'b', a: 'dl', b: 'cyc', label: 'sampled' },
          { id: 'c', a: 'cyc', b: 'lat', label: 'time budget' }
        ]
      },
      bug: [
        { log: 'The job writes 500,000 keys in one burst, each with EX 1800 (illustrative).', code: 0, hl: { nodes: { burst: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'keys written', v: '500,000', cls: 'warn' }] },
        { log: 'All the deadlines fall within about the same second.', code: 1, hl: { nodes: { dl: 'bad' } }, stats: [{ l: 'deadline spread', v: 'about 1 s', cls: 'bad' }] },
        { log: 'Thirty minutes later the expire cycle samples keys and finds nearly all of them expired.', code: 2, hl: { nodes: { cyc: 'warn' }, edges: { b: 'on' } }, stats: [{ l: 'expired in sample', v: 'nearly all', cls: 'warn' }] },
        { log: 'The cycle keeps repeating while expired keys stay common, spending its time budget on the executor thread.', code: 3, hl: { nodes: { cyc: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'expire cycle time', v: 'high', cls: 'bad' }] },
        { log: 'Clients see a latency spike at the same interval as the TTL.', code: 4, hl: { nodes: { lat: 'bad' } }, stats: [{ l: 'p99', v: 'spiky', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The writer adds random jitter, so each TTL falls between 1800 and 2100 seconds.', code: 0, hl: { nodes: { burst: 'ok', dl: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'deadline spread', v: 'about 5 min', cls: 'ok' }] },
        { log: 'Deadlines are now spread over about 5 minutes.', code: 1, hl: { nodes: { dl: 'ok' } }, stats: [{ l: 'expired per second', v: 'about 1,700', cls: 'ok' }] },
        { log: 'Each cycle samples keys, finds few expired, and stops early.', code: 2, hl: { nodes: { cyc: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'expire cycle time', v: 'small', cls: 'ok' }] },
        { log: 'Latency stays flat. The spike no longer repeats at the TTL interval.', code: 3, hl: { nodes: { lat: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'p99', v: 'flat', cls: 'ok' }] }
      ]
    },
    {
      id: 'stale',
      label: 'Expired, not deleted',
      desc: 'Expired keys stay in memory when nobody reads them. Raising active-expire-effort reclaims them faster.',
      codeLabel: 'Config',
      code: {
        bug: [
          'SET sess:x v EX 1800      # written during the campaign',
          '# 30 min later: nobody reads sess:x',
          '# lazy path never runs for it',
          '# active cycle samples 20 keys, stops at about 10% stale',
          'INFO stats: expired_stale_perc:8.4   # illustrative'
        ],
        fix: [
          'active-expire-effort 5    # redis.conf, raised in steps',
          '# active cycle does more work per cycle',
          '# expired keys are sampled and deleted more often',
          '# expired_stale_perc falls over a few minutes'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'sess', x: 10, y: 110, w: 160, h: 60, t: 'Expired key', s: 'sess:x, no reads' },
          { id: 'lazy', x: 240, y: 30, w: 160, h: 60, t: 'Lazy path', s: 'runs on access' },
          { id: 'act', x: 240, y: 190, w: 160, h: 60, t: 'Active cycle', s: 'samples 20 keys' },
          { id: 'mem', x: 450, y: 110, w: 170, h: 60, t: 'Memory', s: 'expired keys held' }
        ],
        edges: [
          { id: 'a', a: 'sess', b: 'lazy', label: 'read' },
          { id: 'b', a: 'sess', b: 'act', label: 'sample' },
          { id: 'c', a: 'act', b: 'mem', label: 'stale stays' },
          { id: 'd', a: 'lazy', b: 'mem', label: 'on access' }
        ]
      },
      bug: [
        { log: 'The campaign ends. Its sessions were written with EX 1800, and their deadlines have passed.', code: 0, hl: { nodes: { sess: 'warn' } }, stats: [{ l: 'keys', v: '980,000', cls: 'warn' }] },
        { log: 'Nobody reads them, so the lazy path never runs on them.', code: 1, hl: { nodes: { lazy: 'dim' }, edges: { a: 'dim', d: 'dim' } } },
        { log: 'The active cycle samples a few keys and stops once fewer than about 10% of the sample are expired.', code: 3, hl: { nodes: { act: 'warn' }, edges: { b: 'on' } } },
        { log: 'The remaining expired keys stay in memory. Memory stays high long after traffic ends.', code: 4, hl: { nodes: { mem: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'expired_stale_perc', v: '8.4', cls: 'warn' }, { l: 'used_memory', v: 'high', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The team raises active-expire-effort in steps (default 1, maximum 10).', code: 0, hl: { nodes: { act: 'ok' } }, stats: [{ l: 'active-expire-effort', v: '5', cls: 'ok' }] },
        { log: 'Each cycle now does more work, so expired keys are sampled and deleted more often.', code: 1, hl: { nodes: { act: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'CPU per cycle', v: 'higher', cls: 'warn' }] },
        { log: 'Memory held by expired keys falls within a few cycles. Watch the CPU cost.', code: 2, hl: { nodes: { mem: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'expired memory', v: 'low', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Memory and Eviction',
  problem: `The session cache has <code>maxmemory 2gb</code> (illustrative). At 21:00 a marketing push doubles logins and the dataset reaches the budget. Checkout then fails on every <code>SET</code> with errors from Redis, while product pages that only read keep working. Nothing in the application changed.`,
  predict: {
    q: `The policy is <code>noeviction</code> and memory is full. What happens to a <code>GET</code> and to a <code>SET</code> of a new key?`,
    opts: [
      `Both fail`,
      `Redis evicts the oldest key and both work`,
      `GET works, SET fails with an OOM error`
    ],
    ans: 2,
    why: `<code>noeviction</code> rejects commands that could grow memory (most writes) but still serves reads and deletes.`
  },
  explain: `<h3>The idea</h3>
<p><code>maxmemory</code> is a byte budget. When used memory goes over it, the next command that may add data triggers the eviction policy. Redis has to choose between refusing writes and throwing away live data. The policy is that choice.</p>
<h3>How it works, step by step</h3>
<p>Before a write, Redis compares used memory with <code>maxmemory</code>. If it is over, the policy decides what happens. With <code>noeviction</code> the server refuses commands that could grow memory and replies with an OOM error. Reads still work.</p>
<p>The other policies evict keys. <code>allkeys-lru</code>, <code>allkeys-lfu</code> and <code>allkeys-random</code> consider every key. The <code>volatile-*</code> variants only consider keys that have a TTL.</p>
<p>Redis does not keep a global list of keys ordered by use. It uses <b>sampling</b>. It samples <code>maxmemory-samples</code> keys (default 5) into an eviction pool and removes the one idle longest. LFU keeps a small decaying counter per key (<code>lfu-log-factor</code>, <code>lfu-decay-time</code>), so a one-time scan does not push out hot keys.</p>
<h3>The trade-off</h3>
<p><code>noeviction</code> protects data but makes the cache a hard failure at the cap. An eviction policy keeps writes working but may drop a key you still needed. Choose by what the data is: a cache can evict, a store of record should not. Sampling is cheap, but it is an approximation, so the victim is not always the globally oldest key.</p>`,
  diagnose: [
    {
      t: 'OOM under noeviction',
      sym: 'OOM command not allowed under noeviction',
      ctx: 'Writes fail, reads succeed; the error text names maxmemory.',
      why: 'With noeviction the server refuses commands flagged as able to increase memory once the limit is reached, rather than discarding data it was told to keep.',
      log: `127.0.0.1:6379> SET sess:new v
(error) OOM command not allowed when used memory > 'maxmemory'.
127.0.0.1:6379> GET sess:old
"v"
127.0.0.1:6379> INFO memory
used_memory_human:2.00G
maxmemory_human:2.00G
maxmemory_policy:noeviction`,
      note: 'The OOM error comes from the policy, not from the operating system. used_memory equal to maxmemory confirms it.',
      fix: [
        'Measure first: INFO memory (used_memory, maxmemory) and INFO stats (evicted_keys).',
        'Fix: for a cache, choose allkeys-lru or allkeys-lfu; keep noeviction only where data must never be dropped.',
        'Fix: right-size maxmemory and add TTLs so the working set fits.',
        'Verify: writes succeed at peak and evicted_keys reflects the expected churn, with an acceptable hit rate.'
      ]
    },
    {
      t: 'volatile without TTL',
      sym: 'A volatile-* policy with no TTL keys behaves like noeviction',
      ctx: 'OOM errors appear although an eviction policy is configured.',
      why: 'volatile-* policies only consider keys that have an expiry. If none do, there is nothing to evict and the server returns the same OOM error as noeviction.',
      log: `127.0.0.1:6379> CONFIG GET maxmemory-policy
1) "maxmemory-policy"
2) "volatile-lru"
127.0.0.1:6379> INFO keyspace
db0:keys=3200000,expires=0,avg_ttl=0   # illustrative
127.0.0.1:6379> SET sess:new v
(error) OOM command not allowed when used memory > 'maxmemory'.`,
      note: 'expires=0 in INFO keyspace means no key is eligible for a volatile policy.',
      fix: [
        'Measure first: INFO keyspace and compare keys and expires.',
        'Fix: set a TTL on every key that may be evicted, or use an allkeys-* policy.',
        'Fix: keep permanent data in a separate instance from cache data.',
        'Verify: evicted_keys increases at the cap and OOM replies stop.'
      ]
    },
    {
      t: 'Fragmentation',
      sym: 'High mem_fragmentation_ratio: RSS far above used memory',
      ctx: 'The host runs out of RAM while Redis reports less used memory than the process footprint.',
      why: 'The allocator (jemalloc) cannot return freed pages that are partly in use. Resident memory stays above the logical used_memory, which is also what maxmemory counts.',
      log: `127.0.0.1:6379> INFO memory
used_memory:2147483648
used_memory_rss:3865470566       # illustrative
mem_fragmentation_ratio:1.80     # illustrative
allocator_frag_ratio:1.62        # illustrative`,
      note: 'A ratio well above 1 means wasted resident pages. A ratio below 1 would instead hint at swapping.',
      fix: [
        'Measure first: INFO memory fields mem_fragmentation_ratio and allocator_frag_ratio.',
        'Fix: enable activedefrag yes (it runs in the main thread, so tune its CPU limits and watch latency).',
        'Fix: or fail over to a fresh replica and restart the old primary to reset the allocator state.',
        'Verify: RSS falls toward used_memory and the ratio returns to about 1.0 to 1.2.'
      ]
    }
  ],
  source: { label: 'Original: Memory and Eviction', href: '01-redis-internals-end-to-end.html#ch4' },
  scenarios: [
    {
      id: 'oom',
      label: 'noeviction vs LRU',
      desc: 'The same full cache either refuses the SET (noeviction) or evicts a cold key to make room (allkeys-lru).',
      codeLabel: 'Config',
      code: {
        bug: [
          'maxmemory 2gb',
          'maxmemory-policy noeviction',
          'SET sess:new v     # needs new bytes',
          '(error) OOM command not allowed when used memory > \'maxmemory\'.'
        ],
        fix: [
          'maxmemory-policy allkeys-lru',
          '# sampled LRU picks a cold key',
          '# that key is evicted to make room',
          'SET sess:new v     # now stored'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cmd', x: 10, y: 110, w: 150, h: 60, t: 'SET sess:new', s: 'needs new bytes' },
          { id: 'check', x: 200, y: 110, w: 160, h: 60, t: 'Memory check', s: 'used vs maxmemory' },
          { id: 'err', x: 410, y: 15, w: 200, h: 60, t: 'OOM error', s: 'noeviction: refused' },
          { id: 'ok', x: 410, y: 110, w: 200, h: 60, t: 'SET stored', s: 'after one eviction' },
          { id: 'ev', x: 410, y: 210, w: 200, h: 60, t: 'Evict cold key', s: 'allkeys-lru sample' }
        ],
        edges: [
          { id: 'a', a: 'cmd', b: 'check', label: 'needs bytes' },
          { id: 'b', a: 'check', b: 'err', label: 'noeviction' },
          { id: 'c', a: 'check', b: 'ev', label: 'allkeys-lru' },
          { id: 'd', a: 'ev', b: 'ok', label: 'room made' }
        ]
      },
      bug: [
        { log: 'The budget is 2 GB and the policy is noeviction. The dataset has reached the budget.', code: 1, hl: { nodes: { check: 'warn' } }, stats: [{ l: 'used_memory', v: '2.00G of 2.00G', cls: 'bad' }] },
        { log: 'A new SET needs bytes, so the memory check runs before the write.', code: 2, hl: { nodes: { cmd: 'on' }, edges: { a: 'on' } } },
        { log: 'noeviction evicts nothing. It refuses the write with an OOM error.', code: 3, hl: { nodes: { err: 'bad' }, edges: { b: 'bad' } }, stats: [{ l: 'SET', v: 'refused', cls: 'bad' }] },
        { log: 'GET keys still work, because reads do not add memory.', code: 1, stats: [{ l: 'GET', v: 'served', cls: 'ok' }] }
      ],
      fix: [
        { log: 'With allkeys-lru the same check finds the budget full, but the policy is allowed to evict.', code: 0, hl: { nodes: { check: 'ok' }, edges: { a: 'ok' } } },
        { log: 'Redis samples keys and evicts the one idle longest (sampled LRU).', code: 1, hl: { nodes: { ev: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'evicted_keys', v: '+1', cls: 'warn' }] },
        { log: 'The SET is stored. Writes succeed at the cap, and the cache keeps churning.', code: 3, hl: { nodes: { ok: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'SET', v: 'stored', cls: 'ok' }] }
      ]
    },
    {
      id: 'volatile',
      label: 'volatile-lru, no TTL',
      desc: 'A volatile policy can only evict keys with a TTL. With no TTLs there are no candidates, so writes fail.',
      codeLabel: 'Command',
      code: {
        bug: [
          'CONFIG GET maxmemory-policy   # volatile-lru',
          'INFO keyspace  db0:keys=3200000,expires=0',
          'SET sess:new v     # no EX, no TTL',
          '(error) OOM command not allowed when used memory > \'maxmemory\'.'
        ],
        fix: [
          'SET sess:new v EX 1800   # every cache write gets a TTL',
          'INFO keyspace  db0:keys=3200000,expires=3200000',
          '# all sessions are eviction candidates',
          '# the next SET is stored after one eviction'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'keys', x: 10, y: 110, w: 150, h: 60, t: 'Session writes', s: 'no TTL on sess:new' },
          { id: 'pol', x: 200, y: 110, w: 160, h: 60, t: 'volatile-lru', s: 'only keys with TTL' },
          { id: 'cand', x: 400, y: 110, w: 200, h: 60, t: 'Eviction set', s: 'empty or all sessions' },
          { id: 'err', x: 400, y: 220, w: 200, h: 60, t: 'OOM error', s: 'same as noeviction' },
          { id: 'ok', x: 400, y: 10, w: 200, h: 60, t: 'SET stored', s: 'after one eviction' }
        ],
        edges: [
          { id: 'a', a: 'keys', b: 'pol', label: 'SET' },
          { id: 'b', a: 'pol', b: 'cand', label: 'candidates' },
          { id: 'c', a: 'cand', b: 'err', label: 'nothing to evict' },
          { id: 'd', a: 'cand', b: 'ok', label: 'all sessions' }
        ]
      },
      bug: [
        { log: 'The policy is volatile-lru. It may evict only keys that have a TTL.', code: 0, hl: { nodes: { pol: 'warn' } }, stats: [{ l: 'policy', v: 'volatile-lru', cls: 'warn' }] },
        { log: 'The session writer never sets a TTL, so expires=0 for every key.', code: 1, hl: { nodes: { keys: 'bad' }, edges: { a: 'on' } }, stats: [{ l: 'keys with TTL', v: '0 of 3.2M', cls: 'bad' }] },
        { log: 'The eviction candidate set is empty. There is nothing to evict.', code: 2, hl: { nodes: { cand: 'bad' }, edges: { b: 'on', c: 'bad' } }, stats: [{ l: 'candidates', v: '0', cls: 'bad' }] },
        { log: 'The write is refused with OOM, the same as noeviction.', code: 3, hl: { nodes: { err: 'bad' } }, stats: [{ l: 'SET', v: 'refused', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The writer sets EX 1800 on every session key.', code: 0, hl: { nodes: { keys: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'keys with TTL', v: '3.2M of 3.2M', cls: 'ok' }] },
        { log: 'Every key now has an expiry, so every session is an eviction candidate.', code: 2, hl: { nodes: { cand: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'candidates', v: 'all sessions', cls: 'ok' }] },
        { log: 'Under memory pressure the policy evicts one candidate and the write succeeds.', code: 3, hl: { nodes: { ok: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'SET', v: 'stored', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Persistence: AOF and RDB',
  problem: `The order-event queue shares the cache Redis. A rack loses power at 10:03 (illustrative). After restart the last seconds of orders are missing, although the team assumed everything acknowledged was safe. A later fix attempt with a snapshot on a big instance caused a visible stall and a memory scare.`,
  predict: {
    q: `With <code>appendfsync everysec</code>, power fails. What is the worst-case loss of acknowledged writes?`,
    opts: [
      `Nothing, the AOF is written before every reply`,
      `Everything since the last RDB snapshot`,
      `About one to two seconds of writes`
    ],
    ans: 2,
    why: `With everysec the AOF is fsynced once per second by a background thread, so you lose roughly the last second of writes, up to about two if an fsync was still in flight. always shrinks the window but costs throughput.`
  },
  explain: `<h3>The idea</h3>
<p>Memory is volatile, so durability needs a copy on disk. Redis offers two mechanisms with different loss windows and costs: an append-only file (AOF) that logs each write, and RDB snapshots that save the whole dataset at a point in time.</p>
<h3>How it works, step by step</h3>
<p><b>AOF</b>: every write command is appended to a log. <code>appendfsync</code> sets how often the log is forced to disk: <code>always</code>, <code>everysec</code> (the default) or <code>no</code> (the OS decides). In Redis 7 the AOF is multi-part: a base file plus incremental files in <code>appendonlydir</code>. A background rewrite compacts it.</p>
<p><b>RDB snapshot</b>: Redis calls <code>fork</code> and the child writes the dataset to a temp file, then renames it. Copy-on-write shares memory pages until the parent changes them. Snapshots run on <code>save</code> rules or on <code>BGSAVE</code>.</p>
<p><b>Restart</b>: with the AOF enabled, Redis loads the AOF, which is more complete than the RDB. A cut-off last command is handled by <code>aof-load-truncated</code>, or fixed by <code>redis-check-aof --fix</code>.</p>
<h3>The trade-off</h3>
<p><code>everysec</code> is the usual balance: a loss of about a second, with little cost. <code>always</code> narrows the window but adds a disk sync to each write. A fork for a snapshot is cheap to start but, on a large dataset under heavy writes, copy-on-write can use a lot of extra memory. Choose the window the business can accept, then measure the cost.</p>`,
  diagnose: [
    {
      t: 'MISCONF',
      sym: 'MISCONF: Redis is unable to persist and rejects writes',
      ctx: 'All writes fail with MISCONF while reads still work.',
      why: 'If the last RDB save failed, Redis refuses writes so the operator notices that persistence is broken, rather than silently accepting data it cannot save.',
      log: `127.0.0.1:6379> SET a 1
(error) MISCONF Redis is configured to save RDB snapshots, but it's currently unable to persist to disk. Commands that may modify the data set are disabled, because this instance is configured to report errors during writes if RDB snapshotting fails (stop-writes-on-bgsave-error option). Please check the Redis logs for details about the RDB error.

127.0.0.1:6379> INFO persistence
rdb_last_bgsave_status:err`,
      note: 'rdb_last_bgsave_status:err confirms the cause; the Redis log names the failing system call (for example a write error or no space).',
      fix: [
        'Measure first: INFO persistence and the server log, plus df -h on the data directory.',
        'Fix: free or add disk space, then run BGSAVE; the error clears after a successful save.',
        'Fix: alert on rdb_last_bgsave_status and free-space thresholds; size the disk for the dataset plus a rewrite.',
        'Verify: rdb_last_bgsave_status:ok and writes succeed.'
      ]
    },
    {
      t: 'Fork stall',
      sym: 'A fork on a large dataset stalls Redis and copy-on-write doubles memory',
      ctx: 'A latency spike at snapshot time, and sometimes the kernel OOM killer ends the process.',
      why: 'fork copies the page tables, which takes time proportional to the dataset. While the child runs, each page the parent modifies is copied (copy-on-write). A write-heavy workload can make the copies approach the dataset size.',
      log: `127.0.0.1:6379> INFO stats
latest_fork_usec:480000        # illustrative, microseconds
127.0.0.1:6379> INFO persistence
rdb_last_cow_size:9663676416   # illustrative

# server log (representative)
Background saving started by pid 18211
DB saved on disk`,
      note: 'latest_fork_usec is the pause caused by the fork itself; rdb_last_cow_size shows the extra memory used during the last save.',
      fix: [
        'Measure first: latest_fork_usec, rdb_last_cow_size and host memory during a save.',
        'Fix: leave memory headroom for copy-on-write, schedule snapshots off-peak, or snapshot on a replica instead of the primary.',
        'Fix: use a hypervisor with fast fork, and disable transparent huge pages as the Redis docs advise.',
        'Verify: the fork pause is within the latency budget and memory stays below the host limit during a save.'
      ]
    },
    {
      t: 'Truncated AOF',
      sym: 'A truncated AOF after a crash blocks startup',
      ctx: 'Redis refuses to start or starts with a warning about an unexpected end of the AOF.',
      why: 'On startup Redis replays the AOF. A cut-off last command is detected. With aof-load-truncated yes (default) it loads what it can and logs a warning; otherwise it exits so the operator decides.',
      log: `# server log (representative, wording varies by version)
* Reading RDB base file on AOF loading...
! Bad file format reading the append only file appendonly.aof.1.incr.aof: make a backup of your AOF file, then use ./redis-check-aof --fix <filename.manifest>

$ redis-check-aof --fix appendonlydir/appendonly.aof.manifest`,
      note: 'In Redis 7 the check tool takes the manifest file. Always back up the directory before using --fix.',
      fix: [
        'Measure first: read the startup log and run redis-check-aof without --fix to see the damaged offset.',
        'Fix: back up appendonlydir, then run redis-check-aof --fix on the manifest; keep aof-load-truncated yes for automatic recovery.',
        'Fix: use appendfsync everysec or always to narrow the window, and keep a replica as a second copy.',
        'Verify: Redis starts, DBSIZE is plausible, and the last acknowledged order is checked against the source of truth.'
      ]
    },
    {
      t: 'Slow fsync',
      sym: 'AOF fsync is taking too long and writes slow down',
      ctx: 'Intermittent latency spikes with a warning in the log, worse during a rewrite.',
      why: 'The fsync runs in a background thread, but if the previous fsync is still running after about two seconds the main thread writes anyway, which can block on a busy disk.',
      log: `# server log (representative)
Asynchronous AOF fsync is taking too long (disk is busy?). Writing the AOF buffer without waiting for fsync to complete, this may slow down Redis.

127.0.0.1:6379> INFO persistence
aof_delayed_fsync:42`,
      note: 'aof_delayed_fsync counts how many times this happened.',
      fix: [
        'Measure first: aof_delayed_fsync in INFO persistence and disk latency with iostat.',
        'Fix: move the AOF to a dedicated or faster volume; avoid sharing it with other heavy writers.',
        'Fix: consider no-appendfsync-on-rewrite yes only if you accept a larger loss window during rewrites.',
        'Verify: aof_delayed_fsync stops increasing and the warning disappears.'
      ]
    }
  ],
  source: { label: 'Original: Persistence: AOF and RDB', href: '01-redis-internals-end-to-end.html#ch5' },
  scenarios: [
    {
      id: 'misconf',
      label: 'Disk full, writes stop',
      desc: 'A failed background save sets the last save status to err, and the write gate refuses new writes until a save succeeds.',
      codeLabel: 'Command',
      code: {
        bug: [
          'disk: 100% full',
          'BGSAVE: write error, rdb_last_bgsave_status:err',
          'SET a 1',
          '(error) MISCONF Redis is configured to save RDB snapshots, but it\'s currently unable to persist to disk. ...'
        ],
        fix: [
          'df -h /data      # free space restored',
          'BGSAVE           # succeeds',
          'rdb_last_bgsave_status:ok',
          'SET a 1          -> OK'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'disk', x: 10, y: 30, w: 150, h: 60, t: 'Disk', s: 'no free space' },
          { id: 'bgs', x: 230, y: 30, w: 170, h: 60, t: 'BGSAVE', s: 'write fails' },
          { id: 'cl', x: 10, y: 190, w: 150, h: 60, t: 'Client', s: 'SET a 1' },
          { id: 'gate', x: 230, y: 190, w: 170, h: 60, t: 'Write gate', s: 'last save failed?' },
          { id: 'err', x: 450, y: 190, w: 170, h: 60, t: 'MISCONF', s: 'writes refused' },
          { id: 'ok', x: 450, y: 30, w: 170, h: 60, t: 'SET OK', s: 'save succeeded' }
        ],
        edges: [
          { id: 'a', a: 'disk', b: 'bgs', label: 'writes to' },
          { id: 'b', a: 'bgs', b: 'gate', label: 'status' },
          { id: 'c', a: 'cl', b: 'gate', label: 'SET' },
          { id: 'd', a: 'gate', b: 'err', label: 'refuse' },
          { id: 'e', a: 'gate', b: 'ok', label: 'allow' }
        ]
      },
      bug: [
        { log: 'The disk fills up. Redis cannot write the RDB file.', code: 0, hl: { nodes: { disk: 'bad' }, edges: { a: 'on' } }, stats: [{ l: 'disk', v: '100% full', cls: 'bad' }] },
        { log: 'The background save fails, and the last save status becomes err.', code: 1, hl: { nodes: { bgs: 'bad' }, edges: { b: 'bad' } }, stats: [{ l: 'rdb_last_bgsave_status', v: 'err', cls: 'bad' }] },
        { log: 'A client sends SET a 1. Redis checks the last save status before it accepts the write.', code: 2, hl: { nodes: { cl: 'on', gate: 'warn' }, edges: { c: 'on' } } },
        { log: 'Because stop-writes-on-bgsave-error is on, the write is refused with MISCONF.', code: 3, hl: { nodes: { err: 'bad' }, edges: { d: 'bad' } }, stats: [{ l: 'writes', v: 'refused', cls: 'bad' }] }
      ],
      fix: [
        { log: 'An operator frees disk space, so the save path is writable again.', code: 0, hl: { nodes: { disk: 'ok' } }, stats: [{ l: 'disk', v: '40% used', cls: 'ok' }] },
        { log: 'BGSAVE succeeds and the last save status returns to ok.', code: 2, hl: { nodes: { bgs: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'rdb_last_bgsave_status', v: 'ok', cls: 'ok' }] },
        { log: 'The write gate sees a good save status and accepts the write.', code: 2, hl: { nodes: { gate: 'ok', cl: 'ok' }, edges: { c: 'ok', e: 'ok' } }, stats: [{ l: 'writes', v: 'accepted', cls: 'ok' }] },
        { log: 'SET returns OK, and the writes continue.', code: 3, hl: { nodes: { ok: 'ok' }, edges: { e: 'ok' } } }
      ]
    },
    {
      id: 'fork',
      label: 'Fork and copy-on-write',
      desc: 'A snapshot forks a 24 GB primary under write load. The fork pauses it, and copy-on-write grows memory. A replica snapshot avoids both.',
      codeLabel: 'Command',
      code: {
        bug: [
          'BGSAVE           # 24 GB primary, peak writes (illustrative)',
          '# fork copies page tables: latest_fork_usec:480000',
          '# parent writes: shared pages are copied (copy-on-write)',
          '# rdb_last_cow_size:9663676416   # illustrative'
        ],
        fix: [
          'replica: BGSAVE  # snapshot runs on the replica',
          '# the primary keeps serving and never forks',
          '# fewer pages copied during peak traffic'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'primary', x: 10, y: 110, w: 150, h: 60, t: 'Primary', s: '24 GB dataset' },
          { id: 'fork', x: 230, y: 30, w: 170, h: 60, t: 'fork()', s: 'copies page tables' },
          { id: 'child', x: 230, y: 190, w: 170, h: 60, t: 'Child', s: 'writes RDB' },
          { id: 'cow', x: 450, y: 30, w: 170, h: 60, t: 'Copy-on-write', s: 'pages copied' },
          { id: 'mem', x: 450, y: 190, w: 170, h: 60, t: 'Host memory', s: 'near OOM' },
          { id: 'rep', x: 10, y: 215, w: 150, h: 60, t: 'Replica', s: 'snapshot here' }
        ],
        edges: [
          { id: 'a', a: 'primary', b: 'fork', label: 'fork' },
          { id: 'b', a: 'fork', b: 'child', label: 'child saves' },
          { id: 'c', a: 'primary', b: 'cow', label: 'writes hit' },
          { id: 'd', a: 'cow', b: 'mem', label: 'extra RAM' },
          { id: 'e', a: 'rep', b: 'child', label: 'replica snapshot' }
        ]
      },
      bug: [
        { log: 'BGSAVE forks the primary. The fork copies page tables for the whole dataset, a pause of about 480 ms (illustrative).', code: 0, hl: { nodes: { primary: 'on', fork: 'bad' }, edges: { a: 'on' } }, stats: [{ l: 'fork pause', v: '480 ms', cls: 'bad' }] },
        { log: 'The child writes the snapshot while the parent keeps serving writes.', code: 1, hl: { nodes: { child: 'warn' }, edges: { b: 'on' } } },
        { log: 'Each write to a shared page copies that page for the parent (copy-on-write).', code: 2, hl: { nodes: { cow: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'COW', v: '+9 GB (illustrative)', cls: 'bad' }] },
        { log: 'Memory use approaches the host limit, and the kernel OOM killer may end the process.', code: 3, hl: { nodes: { mem: 'bad' }, edges: { d: 'bad' } }, stats: [{ l: 'host memory', v: 'near OOM', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The snapshot runs on a replica instead of the primary.', code: 0, hl: { nodes: { rep: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'fork on', v: 'replica', cls: 'ok' }] },
        { log: 'The primary does not fork, so it does not pause for the snapshot.', code: 1, hl: { nodes: { primary: 'ok' } }, stats: [{ l: 'fork pause on primary', v: 'none', cls: 'ok' }] },
        { log: 'The replica copies fewer pages during peak traffic (illustrative: about +1 GB).', code: 2, hl: { nodes: { child: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'COW', v: '+1 GB', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Replication',
  problem: `A read replica sits in another availability zone behind a flaky link. It drops for about 30 seconds (illustrative) every few minutes and reconnects. Each reconnect makes the primary fork and push a full RDB across the network, the primary saturates, replica lag grows, and some syncs never finish.`,
  predict: {
    q: `The replica is disconnected for 30 s while the primary takes 10 MB/s of writes. The replication backlog is 1 MB. Partial or full resync?`,
    opts: [
      `Full, because the 300 MB gap does not fit in the 1 MB backlog`,
      `Partial, the replica asks for the missing commands`,
      `Neither, the replica stays out of sync until restarted`
    ],
    ans: 0,
    why: `A partial resync (PSYNC) is possible only if the backlog still holds every byte after the replica offset. 300 MB of writes overwrote the 1 MB ring, so the primary must send a full RDB.`
  },
  explain: `<h3>The idea</h3>
<p>A replica is useful only if it can catch up cheaply after a disconnect. The primary numbers its write stream by bytes. A replica remembers the last offset it applied, and asks to resume from there. If the primary still has those bytes, the transfer is small. If not, the replica needs a full copy.</p>
<h3>How it works, step by step</h3>
<p>Each primary has a <b>replication ID and offset</b>. <code>INFO replication</code> shows <code>master_repl_offset</code> and each replica's offset.</p>
<p>The <b>backlog</b> is a ring buffer of recent writes, sized by <code>repl-backlog-size</code> (1 MB by default). When a replica returns, it sends <code>PSYNC</code>. If its offset is still inside the ring, the primary sends only the missing commands.</p>
<p>Otherwise the primary does a <b>full sync</b>: it forks, writes an RDB, ships it, and buffers new writes in the replica client output buffer, limited by <code>client-output-buffer-limit replica</code>.</p>
<p>Replication is <b>asynchronous</b>. The primary does not wait for replicas before replying, so replica reads can be stale.</p>
<h3>The trade-off</h3>
<p>A bigger backlog costs memory but turns short blips into cheap partial syncs. Asynchronous replication keeps writes fast, at the price of replicas that may be behind. Choose the backlog from your write rate times the longest disconnect you want to survive.</p>`,
  diagnose: [
    {
      t: 'Backlog too small',
      sym: 'A backlog that is too small turns every blip into a full resync',
      ctx: 'Network spikes and primary forks after each short disconnect.',
      why: 'If the replica offset falls out of the backlog, PSYNC cannot continue and the primary must do a full sync. A bigger ring turns the same blip into a short partial transfer.',
      log: `# primary log (representative, wording varies by version)
Partial resynchronization request from 10.0.2.7:6379 rejected: Unable to partial resync with replica 10.0.2.7:6379 for lack of backlog (Slave request was: 884400121).
Starting BGSAVE for SYNC with target: disk

127.0.0.1:6379> INFO stats
sync_full:37
sync_partial_ok:2
sync_partial_err:35`,
      note: 'sync_full and sync_partial_err rising together point to a backlog that is too small for the disconnect length.',
      fix: [
        'Measure first: sync_full, sync_partial_ok and sync_partial_err in INFO stats.',
        'Fix: set repl-backlog-size to at least write rate times the longest disconnect you want to survive, plus headroom.',
        'Fix: improve the link, or place replicas where disconnects are shorter.',
        'Verify: after a blip the replica log shows partial resynchronization and no new RDB is created.'
      ]
    },
    {
      t: 'Sync loop',
      sym: 'A full sync exceeds the replica output-buffer limit and loops forever',
      ctx: 'The replica never becomes healthy; the primary logs a closed replica client and starts again.',
      why: 'During a full sync, new writes are buffered in the replica client output buffer. For the replica class the default limit is hard 256 MB or soft 64 MB for 60 s. If it is exceeded, the primary closes the connection and the replica starts the sync again.',
      log: `# representative output, wording varies by version
client-output-buffer-limit replica 256mb 64mb 60

# primary log
Client id=9 addr=10.0.2.7:51412 name= ... flags=S ... scheduled to be closed ASAP for overcoming of output buffer limits.
Connection with replica 10.0.2.7:6379 lost.`,
      note: 'A repeated pattern of sync start then client closed for output buffer is the signature of this loop.',
      fix: [
        'Measure first: the primary log and INFO replication (replica state and offsets); estimate write rate times sync duration.',
        'Fix: raise client-output-buffer-limit replica above the expected buffer, and check memory headroom for it.',
        'Fix: shorten the sync by speeding up disk and network, or reduce write bursts during the sync.',
        'Verify: the replica reaches state=online and the sync completes in one attempt.'
      ]
    },
    {
      t: 'Stale replica reads',
      sym: 'Reads from a replica are stale under asynchronous lag',
      ctx: 'Users do not see their own update for a moment after writing it.',
      why: 'Replication is asynchronous: the primary replies before the replica applies the write. A read that lands on the replica in that window returns the old value, so read-your-writes breaks.',
      log: `127.0.0.1:6379> HSET cart:42 item:9 2     # primary
(integer) 1

127.0.0.1:6380> HGET cart:42 item:9      # replica, 5 ms later (illustrative)
(nil)

127.0.0.1:6379> INFO replication
connected_slaves:1
slave0:ip=10.0.2.7,port=6380,state=online,offset=884400100,lag=0`,
      note: 'Compare master_repl_offset with the replica offset to see how far behind it is. lag is in seconds, so short windows are invisible there.',
      fix: [
        'Measure first: compare master_repl_offset with each replica offset in INFO replication.',
        'Fix: read your own writes from the primary (for example for a short time after a write), and use replicas for tolerant reads.',
        'Fix: use WAIT numreplicas timeout after a critical write; it narrows but does not remove the risk of loss on failover.',
        'Verify: no user-visible stale reads in the flows that need read-your-writes.'
      ]
    },
    {
      t: 'READONLY replica',
      sym: 'The application writes to a replica and gets READONLY',
      ctx: 'Writes fail with a READONLY error after a failover or a config change.',
      why: 'Replicas default to replica-read-only yes, so they reject writes to keep data consistent with the primary.',
      log: `127.0.0.1:6380> SET a 1
(error) READONLY You can't write against a read only replica.
127.0.0.1:6380> INFO replication
role:slave
master_host:10.0.2.5`,
      note: 'role:slave in INFO replication confirms the node is a replica; its master_host shows where the writes should go.',
      fix: [
        'Measure first: ROLE or INFO replication on the node the client uses.',
        'Fix: point writes at the primary, ideally through a client that discovers it (Sentinel or Cluster aware).',
        'Fix: do not disable replica-read-only as a workaround; writes to a replica are lost on resync.',
        'Verify: write errors drop to zero and the client logs show the primary address.'
      ]
    }
  ],
  source: { label: 'Original: Replication', href: '01-redis-internals-end-to-end.html#ch6' },
  scenarios: [
    {
      id: 'backlog',
      label: 'Gap larger than backlog',
      desc: 'A 30-second disconnect writes more than the 1 MB backlog holds, so the returning replica needs a full RDB.',
      codeLabel: 'Config',
      code: {
        bug: [
          '# primary writes ~10 MB/s; replica offline 30 s',
          '# backlog: repl-backlog-size 1mb (default)',
          'Partial resynchronization request rejected: lack of backlog',
          'Starting BGSAVE for SYNC with target: disk'
        ],
        fix: [
          'repl-backlog-size 512mb   # above the 300 MB gap',
          '# the ring keeps the last 512 MB of writes',
          '# replica returns with PSYNC, offset still inside',
          '# no new RDB is created'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'pr', x: 10, y: 110, w: 140, h: 60, t: 'Primary', s: 'writes 10 MB/s' },
          { id: 'bl', x: 220, y: 30, w: 170, h: 60, t: 'Backlog ring', s: '1 MB default' },
          { id: 'full', x: 220, y: 190, w: 170, h: 60, t: 'Full sync', s: 'fork + RDB' },
          { id: 'rp', x: 450, y: 110, w: 170, h: 60, t: 'Replica', s: 'returns after 30 s' }
        ],
        edges: [
          { id: 'a', a: 'pr', b: 'bl', label: 'every write' },
          { id: 'b', a: 'bl', b: 'rp', label: 'PSYNC partial' },
          { id: 'c', a: 'pr', b: 'full', label: 'gap too old' },
          { id: 'd', a: 'full', b: 'rp', label: 'RDB stream' }
        ]
      },
      bug: [
        { log: 'The replica drops for 30 seconds. The primary keeps writing, so about 300 MB is written (illustrative).', code: 0, hl: { nodes: { pr: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'gap', v: '300 MB', cls: 'bad' }] },
        { log: 'The 1 MB backlog keeps only the newest bytes. The replica offset is now outside it.', code: 1, hl: { nodes: { bl: 'bad' }, edges: { b: 'dim' } }, stats: [{ l: 'backlog', v: '1 MB', cls: 'bad' }] },
        { log: 'PSYNC cannot continue, so the primary must send a full RDB.', code: 2, hl: { nodes: { full: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'sync', v: 'full', cls: 'bad' }] },
        { log: 'Every blip repeats the same cycle, so sync_full keeps rising.', code: 3, hl: { nodes: { rp: 'warn' }, edges: { d: 'bad' } }, stats: [{ l: 'sync_full', v: 'rising', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Operators raise repl-backlog-size to 512mb, more than the 300 MB gap.', code: 0, hl: { nodes: { bl: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'backlog', v: '512 MB', cls: 'ok' }] },
        { log: 'The ring keeps the bytes the replica has not seen yet.', code: 1, hl: { nodes: { bl: 'ok' } }, stats: [{ l: 'replica offset', v: 'inside backlog', cls: 'ok' }] },
        { log: 'The replica returns and sends PSYNC. The primary sends only the missing commands.', code: 2, hl: { nodes: { rp: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'sync', v: 'partial', cls: 'ok' }] },
        { log: 'No new RDB is made, so the primary does not fork during the blip.', code: 3, hl: { nodes: { full: 'dim' }, edges: { c: 'dim', d: 'dim' } }, stats: [{ l: 'sync_full', v: 'flat', cls: 'ok' }] }
      ]
    },
    {
      id: 'loop',
      label: 'Buffer over the limit',
      desc: 'Writes made during a full sync pile up in the replica buffer. Past the hard limit the primary closes the link and the sync restarts.',
      codeLabel: 'Config',
      code: {
        bug: [
          '# dataset: several GB, the transfer takes minutes',
          'client-output-buffer-limit replica 256mb 64mb 60',
          '# 600 MB of writes buffered for the replica',
          '# primary: flags=S ... scheduled to be closed ASAP for overcoming of output buffer limits.',
          '# replica starts a new full sync'
        ],
        fix: [
          'client-output-buffer-limit replica 1gb 256mb 60   # illustrative',
          '# hard limit now above the buffered writes',
          '# full sync completes in one attempt'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'pr', x: 10, y: 110, w: 140, h: 60, t: 'Primary', s: 'takes the writes' },
          { id: 'rdbN', x: 220, y: 30, w: 170, h: 60, t: 'Full sync', s: 'RDB transfer' },
          { id: 'buf', x: 220, y: 190, w: 170, h: 60, t: 'Replica buffer', s: 'grows during sync' },
          { id: 'lim', x: 450, y: 190, w: 170, h: 60, t: 'Output limit', s: '256mb hard' },
          { id: 'rp', x: 450, y: 30, w: 170, h: 60, t: 'Replica', s: 'sync state' }
        ],
        edges: [
          { id: 'a', a: 'pr', b: 'rdbN', label: 'RDB' },
          { id: 'b', a: 'pr', b: 'buf', label: 'writes' },
          { id: 'c', a: 'buf', b: 'lim', label: 'checked' },
          { id: 'd', a: 'lim', b: 'rp', label: 'closed, retry' },
          { id: 'e', a: 'rdbN', b: 'rp', label: 'transfer done' }
        ]
      },
      bug: [
        { log: 'The primary starts a full sync and sends the RDB to the replica.', code: 0, hl: { nodes: { rdbN: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'sync', v: 'in progress', cls: 'warn' }] },
        { log: 'Writes made during the transfer are buffered for the replica.', code: 2, hl: { nodes: { buf: 'warn' }, edges: { b: 'on', c: 'on' } }, stats: [{ l: 'buffered', v: '600 MB', cls: 'warn' }] },
        { log: 'The buffer passes the replica hard limit of 256 MB. The primary closes the connection.', code: 3, hl: { nodes: { lim: 'bad' }, edges: { d: 'bad' } }, stats: [{ l: 'limit', v: '256 MB hard', cls: 'bad' }] },
        { log: 'The replica reconnects and the full sync starts again from the beginning.', code: 4, hl: { nodes: { rp: 'bad' } }, stats: [{ l: 'sync result', v: 'restarts', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The hard limit is raised above the expected buffer, to 1 GB (illustrative).', code: 0, hl: { nodes: { lim: 'ok' } }, stats: [{ l: 'hard limit', v: '1 GB', cls: 'ok' }] },
        { log: 'The 600 MB of buffered writes fit under the limit, so the primary keeps the connection.', code: 1, hl: { nodes: { buf: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'buffered', v: '600 MB', cls: 'ok' }] },
        { log: 'The RDB transfer finishes and the replica goes online.', code: 2, hl: { nodes: { rp: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'state', v: 'online', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Pipelining and Transactions',
  problem: `A loyalty feature moves 10 credits from balance A to balance B with two commands. During a promotion another service spends from A at the same moment (illustrative). Finance finds negative balances, and an audit that sums A and B sometimes sees 140 instead of 150. The calls were wrapped in a pipeline, and the team assumed that was safe.`,
  predict: {
    q: `Client A pipelines three <code>INCR</code> commands in one write. Can client B's <code>GET</code> run between them?`,
    opts: [
      `No, a pipeline is atomic`,
      `Yes, the server may run B's command between pipelined ones`,
      `Only if the pipeline has more than 100 commands`
    ],
    ans: 1,
    why: `A pipeline only batches the network round trips. The server still handles each command separately, so commands from other clients can interleave. Atomic grouping needs MULTI/EXEC or a script.`
  },
  explain: `<h3>The idea</h3>
<p>Several commands sent by one client are not one unit to Redis. A <b>pipeline</b> saves round trips, but the server still runs each command on its own. Other clients can run in between. To get a group that runs without interruption, use <code>MULTI</code>/<code>EXEC</code>, <code>WATCH</code>, or a script.</p>
<h3>How it works, step by step</h3>
<p><b>Pipelining</b> sends many commands without waiting for each reply. It saves round trips but gives no atomicity or isolation.</p>
<p><b>MULTI/EXEC</b> queues commands and runs them back to back, with nothing in between. A command that fails while queueing (for example a wrong number of arguments) makes EXEC fail with <code>EXECABORT</code>, and nothing runs. A command that fails at execution time does not roll back the others.</p>
<p><b>WATCH</b> adds optimistic locking. If a watched key changes before EXEC, EXEC returns nil and nothing runs, so the client retries.</p>
<p><b>Scripts and Functions</b> (<code>EVAL</code>, <code>FCALL</code>) run read-decide-write logic as one atomic step. That avoids WATCH retry loops when many clients compete for one key.</p>
<h3>The trade-off</h3>
<p>Pipelines are fast for independent commands. Dependent steps need a transaction or a script. MULTI runs without retries but cannot read values mid-way, and WATCH can starve under contention. A script is often the simplest safe choice.</p>`,
  diagnose: [
    {
      t: 'Pipeline not atomic',
      sym: 'Pipelining is not atomic: an intermediate state is visible',
      ctx: 'Totals do not add up for a short time; audits see missing credit.',
      why: 'Each pipelined command is its own unit of execution. Other clients run between them, so they can read the state after the first command and before the second.',
      log: `# client A (pipeline)        # client B (audit)
DECRBY a 10                   GET a  -> 90
                              GET b  -> 50   (sum 140)
INCRBY b 10
# representative sequence, values illustrative`,
      note: 'The sum of 140 appears only between the two commands; it is a real, visible intermediate state.',
      fix: [
        'Measure first: reproduce with two clients and a trace of the command order; check whether the code uses a pipeline.',
        'Fix: wrap dependent commands in MULTI / EXEC, or use a Lua script or a Function.',
        'Fix: keep pipelines for throughput of independent commands only.',
        'Verify: the audit never sees a partial sum under load.'
      ]
    },
    {
      t: 'EXEC runtime error',
      sym: 'A runtime error inside EXEC leaves the other commands applied',
      ctx: 'A transaction half applied without any rollback.',
      why: 'Redis does not roll back. Commands that pass queue-time checks all run; one that fails at execution time returns its error while the others still apply.',
      log: `127.0.0.1:6379> SET name "bob"
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> SET total 10
QUEUED
127.0.0.1:6379(TX)> INCR name
QUEUED
127.0.0.1:6379(TX)> EXEC
1) OK
2) (error) ERR value is not an integer or out of range`,
      note: 'The first command applied even though the second failed.',
      fix: [
        'Measure first: inspect each reply in the EXEC array; the error is in its own element.',
        'Fix: check types and preconditions before queueing, or use a script that validates then writes.',
        'Fix: design commands so partial application is safe to repeat (idempotent).',
        'Verify: tests that inject a bad key type show a consistent final state.'
      ]
    },
    {
      t: 'WATCH starvation',
      sym: 'A WATCH retry loop starves under contention',
      ctx: 'Latency and CPU rise for one hot key as retries pile up.',
      why: 'EXEC aborts whenever any other client changes the key after WATCH. With heavy contention most attempts abort and retry, wasting round trips; some clients may keep losing.',
      log: `127.0.0.1:6379> WATCH stock:9
OK
127.0.0.1:6379> GET stock:9
"4"
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> DECR stock:9
QUEUED
127.0.0.1:6379(TX)> EXEC
(nil)      # another client changed stock:9, retry`,
      note: 'A nil reply from EXEC means it was aborted by WATCH; the application must retry.',
      fix: [
        'Measure first: count nil EXEC replies and retries per request in the application metrics.',
        'Fix: move the read-check-write into a Lua script or a Function so it runs atomically with no retry.',
        'Fix: otherwise cap retries and add backoff with jitter.',
        'Verify: retries per request fall toward zero while stock never goes negative.'
      ]
    },
    {
      t: 'EXECABORT',
      sym: 'EXECABORT discards the whole transaction after a queue-time error',
      ctx: 'Nothing in the transaction ran, and the client sees EXECABORT.',
      why: 'Errors detected while queueing, such as a syntax error or wrong arity, mark the transaction dirty. EXEC then refuses to run any of it.',
      log: `127.0.0.1:6379> MULTI
OK
127.0.0.1:6379(TX)> SET a
(error) ERR wrong number of arguments for 'set' command
127.0.0.1:6379(TX)> SET b 2
QUEUED
127.0.0.1:6379(TX)> EXEC
(error) EXECABORT Transaction discarded because of previous errors.`,
      note: 'The second command was queued, but EXEC ran nothing because of the earlier error.',
      fix: [
        'Measure first: log every error returned while queueing, not just the EXEC result.',
        'Fix: correct the command or argument handling; check the library version change that altered the call.',
        'Fix: treat EXECABORT as a bug in the call site, not as a retriable condition.',
        'Verify: EXEC returns an array of replies in integration tests.'
      ]
    }
  ],
  source: { label: 'Original: Pipelining and Transactions', href: '01-redis-internals-end-to-end.html#ch7' },
  scenarios: [
    {
      id: 'interleave',
      label: 'Pipeline vs MULTI',
      desc: 'Client A pipelines two writes. Client B reads between them and sees 140. With MULTI/EXEC the audit sees 150 only.',
      codeLabel: 'Command',
      code: {
        bug: [
          'pipeline (client A): DECRBY a 10 ; INCRBY b 10',
          'client B: GET a -> 90',
          'client B: GET b -> 50   (sum 140)',
          '# A\'s INCRBY b 10 runs after the audit'
        ],
        fix: [
          'MULTI',
          'DECRBY a 10',
          'INCRBY b 10',
          'EXEC    # both run back to back'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'A', x: 10, y: 40, w: 150, h: 60, t: 'Client A', s: 'pipeline 2 writes' },
          { id: 'B', x: 10, y: 190, w: 150, h: 60, t: 'Client B', s: 'GET a, GET b' },
          { id: 'srv', x: 250, y: 110, w: 160, h: 60, t: 'Executor', s: 'one command at a time' },
          { id: 'keys', x: 460, y: 110, w: 160, h: 60, t: 'Balances', s: 'a and b' }
        ],
        edges: [
          { id: 'e1', a: 'A', b: 'srv', label: 'DECRBY a 10' },
          { id: 'e2', a: 'A', b: 'srv', label: 'INCRBY b 10' },
          { id: 'e3', a: 'B', b: 'srv', label: 'GET a, GET b' },
          { id: 'e4', a: 'srv', b: 'keys', label: 'apply' }
        ]
      },
      bug: [
        { log: 'Client A pipelines DECRBY a 10 and INCRBY b 10 in one write. This saves a round trip.', code: 0, hl: { nodes: { A: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'total', v: '150', cls: 'ok' }] },
        { log: 'The executor runs DECRBY a 10. Balance a is now 90, and b is still 50.', code: 0, hl: { nodes: { srv: 'warn', keys: 'warn' }, edges: { e4: 'on' } }, stats: [{ l: 'sum a+b', v: '140', cls: 'bad' }] },
        { log: 'Client B runs GET a and GET b before A\'s INCRBY runs.', code: 1, hl: { nodes: { B: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'audit sum', v: '140', cls: 'bad' }] },
        { log: 'A\'s INCRBY b 10 then runs. The sum is 150 again, but the audit already saw 140.', code: 3, hl: { nodes: { A: 'dim' }, edges: { e2: 'on' } }, stats: [{ l: 'sum a+b', v: '150 again', cls: 'ok' }] }
      ],
      fix: [
        { log: 'Client A sends MULTI, then both commands, then EXEC. The commands are queued.', code: 0, hl: { nodes: { A: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'queued', v: '2 commands', cls: 'ok' }] },
        { log: 'Client B\'s GET commands run before EXEC or after it, never in between.', code: 1, hl: { nodes: { B: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'audit sum', v: '150 always', cls: 'ok' }] },
        { log: 'EXEC runs both commands back to back.', code: 3, hl: { nodes: { srv: 'ok' }, edges: { e2: 'ok', e4: 'ok' } }, stats: [{ l: 'sum a+b', v: '150', cls: 'ok' }] }
      ]
    },
    {
      id: 'watch',
      label: 'WATCH retry storm',
      desc: 'Many checkouts watch one hot key. Each change aborts EXEC, and retries pile up. A Lua script does the check and decrement in one step.',
      codeLabel: 'Command',
      code: {
        bug: [
          'WATCH stock:9',
          'GET stock:9   -> "4"',
          'MULTI / DECR stock:9 / QUEUED',
          '# another client changed stock:9 after WATCH',
          'EXEC   -> (nil)   # aborted, the client must retry'
        ],
        fix: [
          '# Lua script: read stock:9, check > 0, DECR',
          '# runs as one atomic step on the server',
          'EVALSHA <sha> 1 stock:9   # no WATCH, no retry'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'cl', x: 10, y: 110, w: 150, h: 60, t: 'Checkout', s: 'WATCH stock:9' },
          { id: 'key', x: 240, y: 110, w: 160, h: 60, t: 'stock:9', s: 'hot key' },
          { id: 'exec', x: 450, y: 30, w: 170, h: 60, t: 'Reply', s: 'EXEC or nil' },
          { id: 'retry', x: 450, y: 190, w: 170, h: 60, t: 'Retry loop', s: 'back to GET' },
          { id: 'script', x: 240, y: 225, w: 160, h: 55, t: 'Lua script', s: 'one atomic step' }
        ],
        edges: [
          { id: 'a', a: 'cl', b: 'key', label: 'WATCH, GET' },
          { id: 'b', a: 'cl', b: 'exec', label: 'EXEC' },
          { id: 'c', a: 'key', b: 'exec', label: 'changed?' },
          { id: 'd', a: 'exec', b: 'retry', label: 'nil' },
          { id: 'e', a: 'cl', b: 'script', label: 'EVALSHA' },
          { id: 'f', a: 'script', b: 'key', label: 'DECR' }
        ]
      },
      bug: [
        { log: 'Checkout watches stock:9 and reads it. Hundreds of clients do the same during a flash sale.', code: 0, hl: { nodes: { cl: 'on', key: 'warn' }, edges: { a: 'on' } }, stats: [{ l: 'clients on one key', v: 'hundreds', cls: 'warn' }] },
        { log: 'Another client decrements the key first, so the watched key has changed.', code: 3, hl: { nodes: { key: 'bad' } }, stats: [{ l: 'stock:9', v: 'changed', cls: 'bad' }] },
        { log: 'EXEC checks the watch, finds a change, and aborts. It returns nil and runs nothing.', code: 4, hl: { nodes: { exec: 'bad' }, edges: { b: 'on', c: 'bad' } }, stats: [{ l: 'EXEC', v: 'nil', cls: 'bad' }] },
        { log: 'Most attempts abort under contention, so clients retry and round trips pile up.', code: 4, hl: { nodes: { retry: 'bad' }, edges: { d: 'bad' } }, stats: [{ l: 'successful per attempt', v: '15%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Checkout calls a Lua script with EVALSHA instead of WATCH and MULTI.', code: 2, hl: { nodes: { cl: 'ok', script: 'ok' }, edges: { e: 'ok' } } },
        { log: 'The script reads, checks and decrements inside one atomic step.', code: 0, hl: { nodes: { script: 'ok', key: 'ok' }, edges: { f: 'ok' } }, stats: [{ l: 'retries', v: '0', cls: 'ok' }] },
        { log: 'No other client can change the key in between, so no nil reply and no retry is needed.', code: 1, hl: { nodes: { exec: 'ok' } }, stats: [{ l: 'stock never negative', v: 'yes', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Sentinel Failover',
  problem: `At 03:00 a network partition cuts the order primary off together with one application server, away from the replicas and the Sentinels (illustrative). Sentinel promotes a replica within seconds and traffic recovers. In the morning support finds a few hundred orders that customers saw confirmed but that do not exist (illustrative).`,
  predict: {
    q: `The primary is partitioned with one client and keeps accepting writes. After the partition heals, what happens to those writes?`,
    opts: [
      `They are lost when the old primary is demoted and resynced from the new one`,
      `They are merged into the new primary`,
      `They are kept because the old primary has the newer data`
    ],
    ans: 0,
    why: `Redis has no merge. When the old primary rejoins it is turned into a replica of the new primary and does a full resync, discarding what it accepted alone. min-replicas-to-write limits how long it keeps accepting writes while cut off.`
  },
  explain: `<h3>The idea</h3>
<p>A single primary is a single point of failure, but promoting a replica by mistake can split the data in two. Sentinel is a set of separate processes that watch the primary, agree that it is down, and promote a replica. The rule that makes this safe is agreement: no single Sentinel decides alone.</p>
<h3>How it works, step by step</h3>
<p>One Sentinel that cannot reach the primary for <code>down-after-milliseconds</code> marks it <b>SDOWN</b> (subjectively down). When at least <code>quorum</code> Sentinels agree, the primary is <b>ODOWN</b> (objectively down).</p>
<p>The Sentinels then elect a leader for that failover epoch. The leader needs a majority of all known Sentinels, not just the quorum. It picks a replica by <code>replica-priority</code>, then by replication offset, then by run ID, and promotes it. The others are reconfigured to follow the new primary. A <b>config epoch</b> makes the newest configuration win.</p>
<p>Two settings limit the damage. <code>min-replicas-to-write</code> and <code>min-replicas-max-lag</code> make a primary that has lost its replicas refuse writes with <code>NOREPLICAS</code>. Clients should ask Sentinel for the current primary rather than hard-code it.</p>
<h3>The trade-off</h3>
<p>Failover is asynchronous replication underneath. A write acknowledged by the old primary may not have reached the replica that was promoted. Redis does not merge histories: when the old primary rejoins, its extra writes are discarded. Bounding the window with <code>min-replicas-to-write</code> trades availability during a partition for fewer lost writes.</p>`,
  diagnose: [
    {
      t: 'Split brain',
      sym: 'Split brain loses writes accepted by the isolated primary',
      ctx: 'Confirmed writes are missing after a partition heals.',
      why: 'Sentinel promoted another replica. When the old primary rejoined it became a replica and resynced from the new primary, which did not have those writes.',
      log: `# representative output, wording varies by version
# sentinel log
+sdown master mymaster 10.0.1.5 6379
+odown master mymaster 10.0.1.5 6379 #quorum 2/2
+failover-state-send-slaveof-noone slave 10.0.1.6:6379
+switch-master mymaster 10.0.1.5 6379 10.0.1.6 6379
# old primary after heal
10.0.1.5:6379> INFO replication
role:slave`,
      note: '+switch-master marks the promotion; the old primary reporting role:slave shows it was demoted.',
      fix: [
        'Measure first: compare timestamps in the Sentinel log (+sdown, +switch-master) with client write logs.',
        'Fix: set min-replicas-to-write 1 and a small min-replicas-max-lag so an isolated primary refuses writes (NOREPLICAS).',
        'Fix: make critical writes idempotent and reconcile them against a source of truth.',
        'Verify: in a partition drill the number of lost writes stays within the configured window.'
      ]
    },
    {
      t: 'Sentinels co-located',
      sym: 'Sentinels on one host fail together and there is no quorum',
      ctx: 'No failover happens although the primary is down.',
      why: 'ODOWN needs quorum Sentinels to agree, and failover needs a majority of all Sentinels. If they share a failure domain with the primary, they die together and nobody can act.',
      log: `# sentinel log from the surviving node (representative)
+sdown master mymaster 10.0.1.5 6379
# no +odown line: only 1 of 3 sentinels is alive, quorum is 2

127.0.0.1:26379> SENTINEL ckquorum mymaster
-NOQUORUM 1 usable Sentinels. Not enough available Sentinels to reach the specified quorum for this master.`,
      note: 'SENTINEL ckquorum tells you whether the current Sentinels could authorise a failover.',
      fix: [
        'Measure first: SENTINEL ckquorum mymaster and the placement of every Sentinel.',
        'Fix: run at least three Sentinels in separate failure domains from each other and from the primary.',
        'Fix: keep quorum at a majority of the Sentinels you run.',
        'Verify: a drill that kills the primary host still produces +switch-master.'
      ]
    },
    {
      t: 'Hard-coded primary',
      sym: 'Clients keep a hard-coded primary address and write to the demoted node',
      ctx: 'READONLY or lost writes after a failover because clients never learned the new primary.',
      why: 'After failover the old address is a replica (or down). Sentinel announces the new primary, but a client that does not ask Sentinel keeps using the old address.',
      log: `10.0.1.5:6379> SET order:9 paid
(error) READONLY You can't write against a read only replica.

127.0.0.1:26379> SENTINEL get-master-addr-by-name mymaster
1) "10.0.1.6"
2) "6379"`,
      note: 'SENTINEL get-master-addr-by-name returns the current primary; clients should call it on connect and after errors.',
      fix: [
        'Measure first: SENTINEL get-master-addr-by-name versus the address in the client config.',
        'Fix: use a client with Sentinel support, or put discovery behind a stable endpoint that follows the primary.',
        'Fix: on a READONLY error, re-resolve the primary and retry.',
        'Verify: during a failover drill writes resume within the expected window without a client restart.'
      ]
    },
    {
      t: 'Failover flapping',
      sym: 'A down-after-milliseconds that is too low causes failover flapping',
      ctx: 'Repeated failovers during GC pauses or short network blips, each causing a resync.',
      why: 'Sentinel treats any silence longer than that threshold as SDOWN. A short pause on a healthy node can reach ODOWN and trigger a promotion, which is more disruptive than the blip.',
      log: `# sentinel log (representative)
+sdown master mymaster 10.0.1.5 6379
+odown master mymaster 10.0.1.5 6379 #quorum 2/2
+switch-master mymaster 10.0.1.5 6379 10.0.1.6 6379
... 4 minutes later ...
+switch-master mymaster 10.0.1.6 6379 10.0.1.5 6379`,
      note: 'Two +switch-master events a few minutes apart suggest flapping; the node was healthy.',
      fix: [
        'Measure first: Sentinel logs for repeated +sdown without a real outage, and Redis latency events.',
        'Fix: set down-after-milliseconds above the longest normal stall (the sample config uses 30000); fix the cause of stalls.',
        'Fix: keep failover-timeout and parallel-syncs sensible to avoid piling resyncs.',
        'Verify: no failovers during peak-load tests with injected short pauses.'
      ]
    }
  ],
  source: { label: 'Original: Sentinel Failover', href: '01-redis-internals-end-to-end.html#ch8' },
  scenarios: [
    {
      id: 'split',
      label: 'Writes on the old primary',
      desc: 'A partitioned primary keeps accepting writes. After the failover and the heal, those writes are dropped.',
      codeLabel: 'Log',
      code: {
        bug: [
          'SET order:9 paid      # client writes to the isolated primary',
          '+sdown master mymaster 10.0.1.5 6379',
          '+odown master mymaster 10.0.1.5 6379 #quorum 2/2',
          '+switch-master mymaster 10.0.1.5 6379 10.0.1.6 6379',
          '# old primary after heal: role:slave, its writes are dropped'
        ],
        fix: [
          'min-replicas-to-write 1',
          'min-replicas-max-lag 10   # illustrative, seconds',
          '# isolated primary refuses writes after the lag window',
          '# client gets NOREPLICAS and retries on the new primary'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'client', x: 10, y: 40, w: 150, h: 60, t: 'Client', s: 'SET order:9 paid' },
          { id: 'old', x: 10, y: 190, w: 150, h: 60, t: 'Old primary', s: 'isolated, accepts' },
          { id: 'sent', x: 240, y: 40, w: 160, h: 60, t: 'Sentinels', s: 'SDOWN, then ODOWN' },
          { id: 'rep', x: 460, y: 110, w: 170, h: 60, t: 'New primary', s: 'promoted replica' }
        ],
        edges: [
          { id: 'a', a: 'client', b: 'old', label: 'SET' },
          { id: 'b', a: 'sent', b: 'old', label: 'PING, no reply' },
          { id: 'c', a: 'sent', b: 'rep', label: 'promote' },
          { id: 'd', a: 'old', b: 'rep', label: 'heal: resync' },
          { id: 'e', a: 'client', b: 'rep', label: 'after failover' }
        ]
      },
      bug: [
        { log: 'A partition cuts the primary off from the Sentinels. A client keeps writing to it.', code: 0, hl: { nodes: { client: 'on', old: 'warn' }, edges: { a: 'on' } }, stats: [{ l: 'writes accepted alone', v: 'about 28 s', cls: 'bad' }] },
        { log: 'Sentinels mark the primary SDOWN, then ODOWN with a quorum of 2. One replica is promoted.', code: 2, hl: { nodes: { sent: 'warn', rep: 'ok' }, edges: { b: 'bad', c: 'on' } }, stats: [{ l: 'new primary', v: '10.0.1.6', cls: 'ok' }] },
        { log: 'The writes the old primary accepted in that window exist only on that node (illustrative: a few hundred).', code: 0, hl: { nodes: { old: 'bad' } }, stats: [{ l: 'writes on old node only', v: 'a few hundred', cls: 'bad' }] },
        { log: 'After the partition heals, the old primary becomes a replica and resyncs. Its unreplicated writes are dropped.', code: 4, hl: { nodes: { old: 'bad' }, edges: { d: 'bad' } }, stats: [{ l: 'writes lost', v: 'yes', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The primary is configured to need at least one replica before it accepts writes.', code: 0, hl: { nodes: { old: 'ok' } }, stats: [{ l: 'min-replicas-to-write', v: '1', cls: 'ok' }] },
        { log: 'Once it loses its replicas, it stops accepting writes after the lag window.', code: 2, hl: { nodes: { old: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'window', v: 'bounded', cls: 'ok' }] },
        { log: 'The client gets an error for those writes and retries on the new primary, instead of a silent loss.', code: 3, hl: { nodes: { client: 'ok', rep: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'silent loss', v: 'none', cls: 'ok' }] }
      ]
    },
    {
      id: 'discover',
      label: 'Fixed IP vs Sentinel',
      desc: 'A client with a fixed primary address keeps writing to a demoted node. A client that asks Sentinel follows the failover.',
      codeLabel: 'Command',
      code: {
        bug: [
          '10.0.1.5:6379> SET order:9 paid   # fixed IP from config',
          '(error) READONLY You can\'t write against a read only replica.',
          '# client never asks Sentinel where the primary is',
          '# SENTINEL get-master-addr-by-name mymaster -> "10.0.1.6" "6379"'
        ],
        fix: [
          '# on connect: SENTINEL get-master-addr-by-name mymaster',
          '-> "10.0.1.6" "6379"      # current primary',
          'SET order:9 paid          -> OK on 10.0.1.6'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cl', x: 10, y: 110, w: 150, h: 60, t: 'Client', s: 'fixed 10.0.1.5' },
          { id: 'old', x: 250, y: 30, w: 170, h: 60, t: 'Old primary', s: '10.0.1.5, now replica' },
          { id: 'new', x: 250, y: 190, w: 170, h: 60, t: 'New primary', s: '10.0.1.6' },
          { id: 'sent', x: 470, y: 110, w: 160, h: 60, t: 'Sentinel', s: 'knows the primary' }
        ],
        edges: [
          { id: 'a', a: 'cl', b: 'old', label: 'SET' },
          { id: 'b', a: 'sent', b: 'new', label: 'current' },
          { id: 'c', a: 'cl', b: 'sent', label: 'ask' },
          { id: 'd', a: 'cl', b: 'new', label: 'writes' }
        ]
      },
      bug: [
        { log: 'After failover, the old address 10.0.1.5 is a replica. The client still sends SET to it.', code: 0, hl: { nodes: { cl: 'on', old: 'bad' }, edges: { a: 'bad' } }, stats: [{ l: 'writes accepted', v: '0', cls: 'bad' }] },
        { log: 'The old node answers READONLY, so the write fails.', code: 1, hl: { nodes: { old: 'bad' } }, stats: [{ l: 'error', v: 'READONLY', cls: 'bad' }] },
        { log: 'The client never asks Sentinel where the primary is now.', code: 2, hl: { nodes: { sent: 'dim' }, edges: { c: 'dim' } } },
        { log: 'Every write keeps failing until someone restarts the client with the new address.', code: 3, stats: [{ l: 'writes', v: 'failing', cls: 'bad' }] }
      ],
      fix: [
        { log: 'On connect, the client asks Sentinel for the current primary.', code: 0, hl: { nodes: { cl: 'ok', sent: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'primary', v: '10.0.1.6', cls: 'ok' }] },
        { log: 'Sentinel answers with the new primary address.', code: 1, hl: { nodes: { sent: 'ok' }, edges: { b: 'ok' } } },
        { log: 'Writes go to the new primary and succeed.', code: 2, hl: { nodes: { new: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'writes accepted', v: '100%', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Cluster Slots',
  problem: `The marketplace dataset has outgrown one machine, so it moves to a Redis Cluster of three primaries (illustrative). The next day checkout fails on its multi-key <code>MULTI</code>, which worked before the move, and one node runs much hotter than the others.`,
  predict: {
    q: `Do the keys <code>{user:42}:cart</code> and <code>{user:42}:orders</code> land in the same slot?`,
    opts: [
      `No, different suffixes hash to different slots`,
      `It depends on how many nodes the cluster has`,
      `Yes, only the text inside the braces is hashed`
    ],
    ans: 2,
    why: `When a key contains {...} with a non-empty tag, only the tag is hashed. Both keys hash user:42 and share a slot, so multi-key commands on them work. The slot does not depend on the number of nodes; only the owner does.`
  },
  explain: `<h3>The idea</h3>
<p>One node has a memory and throughput ceiling, so keys are spread across several primaries. Redis Cluster needs no central lookup: every key maps to a fixed slot by a formula, and each primary owns a range of slots. Any node can tell a client where a key lives.</p>
<h3>How it works, step by step</h3>
<p>Each key maps to a slot with <code>CRC16(key) mod 16384</code>. If the key contains a <b>hash tag</b> <code>{...}</code>, only the tag is hashed. <code>CLUSTER KEYSLOT key</code> shows the slot for any key.</p>
<p>Every primary owns slot ranges, and every node knows the whole slot map. A multi-key command must have all its keys in one slot, or the node refuses it with <code>CROSSSLOT</code>.</p>
<p>A node that does not own a slot answers <code>MOVED slot host:port</code>. That redirect is permanent, so the client should update its map. During a migration the answer is <code>ASK</code>, a one-time redirect after which the client sends <code>ASKING</code> first.</p>
<p>Resharding marks a slot as <code>MIGRATING</code> on the source and <code>IMPORTING</code> on the target. Keys move with <code>MIGRATE</code>, then ownership flips.</p>
<h3>The trade-off</h3>
<p>Hash tags let related keys share a slot, so multi-key commands work. But a tag that is too broad puts a lot of keys on one slot, and a slot cannot be split across nodes. Use the narrowest unit that really needs atomicity, such as the user id.</p>`,
  diagnose: [
    {
      t: 'CROSSSLOT',
      sym: 'CROSSSLOT: a multi-key command spans slots',
      ctx: 'MULTI, MGET or a script fails only after moving to a cluster.',
      why: 'A transaction or multi-key command is executed by one node, so every key must be in the same slot. Without a shared hash tag the keys land on different slots and the node refuses.',
      log: `127.0.0.1:7000> MGET cart:42 orders:42
(error) CROSSSLOT Keys in request don't hash to the same slot
127.0.0.1:7000> CLUSTER KEYSLOT cart:42
(integer) 4721       # illustrative
127.0.0.1:7000> CLUSTER KEYSLOT orders:42
(integer) 13005      # illustrative`,
      note: 'CLUSTER KEYSLOT prints the slot for any key; different numbers explain the error.',
      fix: [
        'Measure first: CLUSTER KEYSLOT for each key in the failing command.',
        'Fix: put a shared hash tag in keys that must be used together, for example {user:42}:cart and {user:42}:orders.',
        'Fix: or split the logic into single-slot steps and make each step idempotent.',
        'Verify: the transaction succeeds and CROSSSLOT errors drop to zero.'
      ]
    },
    {
      t: 'Hot slot',
      sym: 'Over-broad hash tags make one hot slot',
      ctx: 'One node is saturated while the others are idle, even though the key count looks balanced.',
      why: 'All keys with the same tag share one slot, hence one node. The cluster no longer spreads load, and that slot cannot be split by moving it.',
      log: `127.0.0.1:7000> CLUSTER KEYSLOT {cart}:1
(integer) 5390
127.0.0.1:7000> CLUSTER KEYSLOT {cart}:2
(integer) 5390
# every key lands in slot 5390 (illustrative number)
redis-cli --cluster info 127.0.0.1:7000
10.0.0.1:7000 (a1b2...) -> 3200000 keys | 5461 slots | 1 replicas.   # illustrative`,
      note: 'One node holding nearly all keys while owning one third of the slots is the signature.',
      fix: [
        'Measure first: per-node key counts and CPU, and CLUSTER COUNTKEYSINSLOT for suspicious slots.',
        'Fix: make the tag as narrow as the unit that needs atomicity (the user id, not a global constant).',
        'Fix: migrate keys to the new naming with a dual-read period.',
        'Verify: key counts and CPU are balanced across primaries.'
      ]
    },
    {
      t: 'MOVED storm',
      sym: 'Clients without a slot-map cache cause a MOVED storm',
      ctx: 'Request latency doubles and every node shows many redirects after a resharding.',
      why: 'A redirect costs an extra round trip. A cluster-aware client caches the slot map and updates it on MOVED, so redirects are rare. A client that ignores it pays a redirect on most requests.',
      log: `127.0.0.1:7000> GET {user:42}:cart
(error) MOVED 8211 10.0.2.2:7000
# representative sequence: the client then repeats the request on 10.0.2.2`,
      note: 'MOVED is permanent: the client should store the new owner for that slot.',
      fix: [
        'Measure first: count MOVED replies in client metrics and compare with request volume.',
        'Fix: use a cluster-aware client that caches the slot map and refreshes it on MOVED (or via CLUSTER SLOTS or CLUSTER SHARDS).',
        'Fix: do not route through a load balancer that hides node addresses unless the client supports it.',
        'Verify: the redirect rate returns to near zero between reshards.'
      ]
    },
    {
      t: 'MIGRATE timeout',
      sym: 'Migrating a slot with big keys blocks and MIGRATE times out',
      ctx: 'Resharding stalls; the tool reports an error and the slot stays in migrating state.',
      why: 'MIGRATE serialises the key, sends it, and waits for the target, blocking the source while it works. A huge key takes long enough to exceed the timeout and it also stalls other commands on that node.',
      log: `$ redis-cli --cluster reshard 127.0.0.1:7000
...
Moving slot 8211 from a1b2... to c3d4...
>>> Migrating 8211 ...
I/O error or timeout   # representative
(error) IOERR error or timeout reading to target instance`,
      note: 'The IOERR text comes from the MIGRATE command. A leftover migrating state may need redis-cli --cluster fix.',
      fix: [
        'Measure first: find big keys in the slot (redis-cli --bigkeys, CLUSTER GETKEYSINSLOT, MEMORY USAGE).',
        'Fix: split or trim big keys before resharding; raise the migrate timeout only as a last resort.',
        'Fix: if a slot is left half-moved run redis-cli --cluster fix and verify with CLUSTER NODES.',
        'Verify: the reshard completes and no slot stays in migrating or importing state.'
      ]
    }
  ],
  source: { label: 'Original: Cluster Slots', href: '01-redis-internals-end-to-end.html#ch9' },
  scenarios: [
    {
      id: 'crossslot',
      label: 'Keys in two slots',
      desc: 'Two keys with different hashes cannot share one MULTI. A shared hash tag puts both in one slot.',
      codeLabel: 'Command',
      code: {
        bug: [
          'MULTI / MGET cart:42 orders:42',
          '(error) CROSSSLOT Keys in request don\'t hash to the same slot',
          'CLUSTER KEYSLOT cart:42     -> 4721   # illustrative',
          'CLUSTER KEYSLOT orders:42   -> 13005  # illustrative'
        ],
        fix: [
          'MULTI / MGET {user:42}:cart {user:42}:orders',
          '# only "user:42" is hashed, so both keys share a slot',
          'CLUSTER KEYSLOT {user:42}:cart   -> 8211   # same slot, illustrative'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cart', x: 10, y: 40, w: 190, h: 60, t: 'Cart key', s: 'cart:42 or {user:42}:cart' },
          { id: 'orders', x: 10, y: 190, w: 210, h: 60, t: 'Orders key', s: 'orders:42 or {user:42}:orders' },
          { id: 'multi', x: 270, y: 110, w: 170, h: 60, t: 'MULTI', s: 'one node runs it' },
          { id: 'err', x: 480, y: 110, w: 150, h: 60, t: 'CROSSSLOT', s: 'refused' }
        ],
        edges: [
          { id: 'a', a: 'cart', b: 'multi', label: 'key 1' },
          { id: 'b', a: 'orders', b: 'multi', label: 'key 2' },
          { id: 'c', a: 'multi', b: 'err', label: 'keys differ' }
        ]
      },
      bug: [
        { log: 'Checkout runs MULTI over cart:42 and orders:42. They hash to different slots (illustrative).', code: 0, hl: { nodes: { cart: 'warn', orders: 'warn' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'slot cart:42', v: '4721', cls: 'warn' }, { l: 'slot orders:42', v: '13005', cls: 'warn' }] },
        { log: 'The node that runs the transaction needs both keys in one slot. It cannot have both.', code: 1, hl: { nodes: { multi: 'bad' }, edges: { c: 'bad' } } },
        { log: 'CLUSTER KEYSLOT prints a different slot for each key, which explains the refusal.', code: 2, stats: [{ l: 'slots', v: 'different', cls: 'bad' }] },
        { log: 'The checkout fails with CROSSSLOT. Nothing in the code changed, only the topology did.', code: 3, hl: { nodes: { err: 'bad' } }, stats: [{ l: 'checkout', v: 'fails', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Both keys now carry the hash tag {user:42}, so only user:42 is hashed.', code: 0, hl: { nodes: { cart: 'ok', orders: 'ok' }, edges: { a: 'ok', b: 'ok' } }, stats: [{ l: 'hashed part', v: 'user:42', cls: 'ok' }] },
        { log: 'Both keys land in the same slot, so one node owns the whole transaction.', code: 1, hl: { nodes: { multi: 'ok' }, edges: { a: 'ok', b: 'ok' } }, stats: [{ l: 'slot', v: 'same (illustrative 8211)', cls: 'ok' }] },
        { log: 'MULTI runs and the checkout succeeds.', code: 2, hl: { nodes: { multi: 'ok' }, edges: { c: 'dim' } }, stats: [{ l: 'CROSSSLOT', v: 'none', cls: 'ok' }] }
      ]
    },
    {
      id: 'hot',
      label: 'One hot slot',
      desc: 'A constant tag on every key puts all of them in one slot, so one node does all the work.',
      codeLabel: 'Command',
      code: {
        bug: [
          'CLUSTER KEYSLOT {cart}:1   -> 5390',
          'CLUSTER KEYSLOT {cart}:2   -> 5390',
          '# every key lands in slot 5390 (illustrative)',
          'redis-cli --cluster info   # one node holds nearly all keys'
        ],
        fix: [
          '# tag only the user id: {user:42}:cart',
          '# {user:43}:cart hashes to another slot, another node',
          'redis-cli --cluster info   # keys and CPU balanced'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'keys', x: 10, y: 110, w: 170, h: 60, t: 'Session keys', s: 'tag {cart} on all' },
          { id: 'slot', x: 250, y: 110, w: 160, h: 60, t: 'Slot 5390', s: 'one slot, one owner' },
          { id: 'n1', x: 460, y: 30, w: 170, h: 60, t: 'Node 1', s: 'all the keys' },
          { id: 'n2', x: 460, y: 190, w: 170, h: 60, t: 'Nodes 2 and 3', s: 'idle' }
        ],
        edges: [
          { id: 'a', a: 'keys', b: 'slot', label: 'CRC16 of tag' },
          { id: 'b', a: 'slot', b: 'n1', label: 'owner' },
          { id: 'c', a: 'slot', b: 'n2', label: 'keys by user' }
        ]
      },
      bug: [
        { log: 'Every cart key uses the same constant tag {cart}, so every key hashes to one slot.', code: 0, hl: { nodes: { keys: 'bad' }, edges: { a: 'on' } }, stats: [{ l: 'slot', v: '5390 for all', cls: 'bad' }] },
        { log: 'That slot has one owner, so one node stores and serves all of its keys.', code: 1, hl: { nodes: { slot: 'bad', n1: 'bad' }, edges: { b: 'on' } }, stats: [{ l: 'node 1 load', v: '100%', cls: 'bad' }] },
        { log: 'Nodes 2 and 3 hold none of these keys, so they sit idle.', code: 2, hl: { nodes: { n2: 'dim' }, edges: { c: 'dim' } }, stats: [{ l: 'node 2 load', v: '2%', cls: 'warn' }] },
        { log: 'The cluster cannot spread this slot, because moving it moves all of its keys together.', code: 3, hl: { nodes: { n1: 'bad' } }, stats: [{ l: 'slot split', v: 'not possible', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The tag is narrowed to the user id, so keys for different users hash differently.', code: 0, hl: { nodes: { keys: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'hashed part', v: 'user id', cls: 'ok' }] },
        { log: 'Keys spread over many slots, and the slots spread over the three primaries.', code: 1, hl: { nodes: { slot: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'node 1 load', v: '34%', cls: 'ok' }] },
        { log: 'Nodes 2 and 3 now take their share of the keys.', code: 2, hl: { nodes: { n2: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'node 2 load', v: '33%', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Streams and Consumer Groups',
  problem: `The order service publishes events into a Redis Stream, and three workers read them as a consumer group (illustrative). At 14:10 a deploy kills one worker while it holds an order event. That event is never processed, and a paid order is never fulfilled. The stream length keeps growing week after week.`,
  predict: {
    q: `A consumer reads entry 5 with <code>XREADGROUP</code> and crashes before <code>XACK</code>. Where is entry 5?`,
    opts: [
      `Deleted, because it was delivered`,
      `Back at the head of the stream for any consumer`,
      `In the group pending entries list (PEL), owned by the dead consumer`
    ],
    ans: 2,
    why: `Delivery moves the entry into the PEL of that consumer, with a delivery time and count, and it stays until XACK. Nobody else gets it unless you claim it (XAUTOCLAIM or XCLAIM).`
  },
  explain: `<h3>The idea</h3>
<p>A stream is an append-only log. Entries get IDs that grow over time. A consumer group lets several workers share the log, and it remembers what was handed out. Redis keeps delivered-but-unacknowledged entries on record, so a crashed worker does not silently lose work.</p>
<h3>How it works, step by step</h3>
<p>Entry IDs look like <code>ms-seq</code>. <code>XADD</code> appends an entry. The consumer group stores a <code>last-delivered-id</code>. <code>XREADGROUP</code> with <code>&gt;</code> delivers only entries that were never delivered to the group.</p>
<p>Each consumer has a <b>pending entries list (PEL)</b>. It holds entries delivered to that consumer but not yet acknowledged, with idle time and a delivery count (see <code>XPENDING</code>). <code>XACK</code> removes an entry from the PEL.</p>
<p>When a consumer dies, its entries stay in its PEL. <code>XAUTOCLAIM key group consumer min-idle-time start</code> lets a live worker take over entries that have been idle long enough. <code>XADD ... MAXLEN ~ n</code> or <code>XTRIM</code> bounds the stream length; acknowledged entries are not removed on their own.</p>
<h3>The trade-off</h3>
<p>The PEL gives at-least-once delivery: a claimed entry can be processed twice, so handlers must be idempotent. Capping the stream protects memory but drops old history, so a consumer that falls behind the cap can lose entries. Choose the cap and the claim delay from your processing time.</p>`,
  diagnose: [
    {
      t: 'Stuck pending',
      sym: 'Entries stuck pending after a consumer crash',
      ctx: 'Orders never complete; XPENDING shows entries with a large idle time.',
      why: 'XREADGROUP &gt; only returns never-delivered entries. Entries owned by a dead consumer stay in its PEL until someone claims them.',
      log: `127.0.0.1:6379> XPENDING orders workers - + 10
1) 1) "1696747800000-0"
   2) "worker-2"
   3) (integer) 5400000
   4) (integer) 1
# id, consumer, idle ms, delivery count (illustrative values)

127.0.0.1:6379> XAUTOCLAIM orders workers worker-1 60000 0-0 COUNT 10`,
      note: 'A high idle time with the consumer of a dead worker is the sign; XAUTOCLAIM returns the claimed entries.',
      fix: [
        'Measure first: XPENDING key group summary, then the extended form to see idle time and delivery counts.',
        'Fix: run XAUTOCLAIM from a live consumer on a schedule with a min-idle-time longer than normal processing.',
        'Fix: make handlers idempotent, because a claim means a second delivery.',
        'Verify: pending entries stay near zero after a worker is killed.'
      ]
    },
    {
      t: 'Unbounded stream',
      sym: 'Unbounded stream growth fills memory',
      ctx: 'Memory climbs steadily with no traffic change; one key is the culprit.',
      why: 'A stream keeps entries after XACK. Only XTRIM or MAXLEN / MINID options bound its size.',
      log: `127.0.0.1:6379> XLEN orders
(integer) 48211394      # illustrative
127.0.0.1:6379> MEMORY USAGE orders
(integer) 9810346112   # illustrative
127.0.0.1:6379> XADD orders MAXLEN ~ 1000000 * order 9 status paid`,
      note: 'MAXLEN ~ trims approximately, in whole internal nodes, which is cheaper than an exact cap.',
      fix: [
        'Measure first: XLEN and MEMORY USAGE on the stream over time.',
        'Fix: add MAXLEN ~ n (or MINID) on XADD, sized so a slow consumer cannot fall off the end.',
        'Fix: archive old entries to durable storage if you need history.',
        'Verify: stream length and memory flatten at the cap.'
      ]
    },
    {
      t: 'Poison message',
      sym: 'A poison message is redelivered forever',
      ctx: 'The same entry keeps coming back and the delivery count climbs.',
      why: 'Redis only counts deliveries; it never gives up on an entry. Without a limit in your code, a message that always fails is retried indefinitely and wastes capacity.',
      log: `127.0.0.1:6379> XPENDING orders workers - + 10
1) 1) "1696750000000-0"
   2) "worker-1"
   3) (integer) 61000
   4) (integer) 87        # delivery count, illustrative`,
      note: 'The fourth field is the delivery count; one entry with a very high count is a poison message.',
      fix: [
        'Measure first: XPENDING extended form sorted by delivery count.',
        'Fix: when the delivery count passes a threshold, copy the entry to a dead-letter stream with XADD and XACK the original.',
        'Fix: log the failure reason and alert on the dead-letter stream length.',
        'Verify: no entry exceeds the threshold in the PEL and the dead-letter stream holds the bad events.'
      ]
    }
  ],
  source: { label: 'Original: Streams and Consumer Groups', href: '01-redis-internals-end-to-end.html#ch10' },
  scenarios: [
    {
      id: 'pel',
      label: 'Crashed worker, stuck entry',
      desc: 'A killed worker leaves its entry in its PEL. Only a claim by a live worker, with XACK afterwards, moves it on.',
      codeLabel: 'Command',
      code: {
        bug: [
          'XREADGROUP GROUP workers worker-2 ... >   # delivers entry',
          '# worker-2 killed by a deploy before XACK',
          'XPENDING orders workers - + 10   -> idle 5400000 ms',
          '# XREADGROUP > returns only new entries, so no one takes it'
        ],
        fix: [
          'XAUTOCLAIM orders workers worker-1 60000 0-0 COUNT 10',
          '# claims entries idle longer than 60000 ms (60 s)',
          '# entries move from the worker-2 PEL to worker-1',
          'XACK orders workers <id>   # worker-1 acknowledges after the work'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'prod', x: 10, y: 110, w: 130, h: 60, t: 'Producer', s: 'XADD orders' },
          { id: 'stream', x: 190, y: 110, w: 160, h: 60, t: 'Orders stream', s: 'ms-seq IDs' },
          { id: 'pel', x: 380, y: 30, w: 220, h: 60, t: 'PEL of worker-2', s: 'entry 1696747800000-0' },
          { id: 'w1', x: 380, y: 190, w: 220, h: 60, t: 'worker-1', s: 'XAUTOCLAIM takes idle entries' }
        ],
        edges: [
          { id: 'a', a: 'prod', b: 'stream', label: 'XADD' },
          { id: 'b', a: 'stream', b: 'pel', label: 'XREADGROUP' },
          { id: 'c', a: 'pel', b: 'w1', label: 'XAUTOCLAIM' },
          { id: 'd', a: 'w1', b: 'pel', label: 'XACK' }
        ]
      },
      bug: [
        { log: 'worker-2 reads an order event with XREADGROUP. The entry moves into its pending list.', code: 0, hl: { nodes: { stream: 'on', pel: 'warn' }, edges: { b: 'on' } }, stats: [{ l: 'pending', v: '1', cls: 'warn' }] },
        { log: 'The deploy kills worker-2 before it sends XACK. The entry stays in its PEL.', code: 1, hl: { nodes: { pel: 'bad' } }, stats: [{ l: 'idle', v: '90 min (illustrative)', cls: 'bad' }] },
        { log: 'Workers read only new entries with >, so no other worker takes it.', code: 2, hl: { nodes: { w1: 'dim' }, edges: { c: 'dim' } } },
        { log: 'The entry waits forever. Pending entries grow, and the order is never fulfilled.', code: 3, hl: { nodes: { pel: 'bad' } }, stats: [{ l: 'pending entries', v: 'stuck', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A reaper on a live worker runs XAUTOCLAIM with min-idle-time 60000 ms.', code: 0, hl: { nodes: { w1: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'min-idle-time', v: '60000 ms', cls: 'ok' }] },
        { log: 'Idle entries move from the worker-2 PEL to worker-1.', code: 1, hl: { nodes: { pel: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'claimed by', v: 'worker-1', cls: 'ok' }] },
        { log: 'worker-1 processes the order and sends XACK, so the entry leaves the pending list.', code: 3, hl: { nodes: { w1: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'pending entries', v: 'near zero', cls: 'ok' }] }
      ]
    },
    {
      id: 'maxlen',
      label: 'Capped with MAXLEN',
      desc: 'Without a cap the stream keeps every entry, even after XACK, and memory grows. MAXLEN ~ trims old entries as new ones arrive.',
      codeLabel: 'Command',
      code: {
        bug: [
          'XADD orders * order 9 status paid     # every event, forever',
          'XACK orders workers <id>              # acked, but still stored',
          'XLEN orders   -> 48211394             # illustrative',
          'MEMORY USAGE orders -> 9810346112     # illustrative'
        ],
        fix: [
          'XADD orders MAXLEN ~ 1000000 * order 9 status paid',
          '# approximate cap: trims whole internal nodes',
          '# old entries are removed as new ones arrive',
          'XLEN orders   -> about 1,000,000      # illustrative'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'prod', x: 10, y: 110, w: 130, h: 60, t: 'Producer', s: 'XADD orders' },
          { id: 'stream', x: 210, y: 110, w: 170, h: 60, t: 'Orders stream', s: 'entries never removed' },
          { id: 'mem', x: 430, y: 30, w: 180, h: 60, t: 'Memory', s: 'grows, no trim' },
          { id: 'trim', x: 430, y: 190, w: 180, h: 60, t: 'MAXLEN ~ n', s: 'trims old entries' }
        ],
        edges: [
          { id: 'a', a: 'prod', b: 'stream', label: 'append' },
          { id: 'b', a: 'stream', b: 'mem', label: 'bytes kept' },
          { id: 'c', a: 'trim', b: 'stream', label: 'trim old' }
        ]
      },
      bug: [
        { log: 'The producer appends an entry for every order event with XADD.', code: 0, hl: { nodes: { prod: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'entries', v: '48M (illustrative)', cls: 'bad' }] },
        { log: 'Consumers XACK the entries, but the stream keeps them. Acknowledged entries stay.', code: 1, hl: { nodes: { stream: 'bad' }, edges: { b: 'on' } }, stats: [{ l: 'XLEN', v: '48,211,394', cls: 'bad' }] },
        { log: 'Nothing trims the stream, so its size only grows over time.', code: 2, hl: { nodes: { mem: 'bad' }, edges: { b: 'on' } }, stats: [{ l: 'memory', v: '9.8 GB (illustrative)', cls: 'bad' }] },
        { log: 'Memory climbs with no change in traffic, until the host runs short.', code: 3, hl: { nodes: { mem: 'bad' } }, stats: [{ l: 'trend', v: 'rising', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Each XADD carries MAXLEN ~ 1000000, so the stream is capped.', code: 0, hl: { nodes: { prod: 'ok' }, edges: { a: 'ok' } }, stats: [{ l: 'cap', v: 'MAXLEN ~ 1000000', cls: 'ok' }] },
        { log: 'Old entries are trimmed as new ones arrive, so the length stays near the cap.', code: 2, hl: { nodes: { trim: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'XLEN', v: 'about 1M', cls: 'ok' }] },
        { log: 'Memory stays bounded and flat. Slow consumers must keep up within the window.', code: 3, hl: { nodes: { mem: 'ok', stream: 'ok' }, edges: { b: 'ok' } }, stats: [{ l: 'stream memory', v: 'bounded', cls: 'ok' }] }
      ]
    }
  ]
}
  ]
};
