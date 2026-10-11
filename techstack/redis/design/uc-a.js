/* Use cases for features 1 to 3: protocol and event loop, data structures, expiry and eviction.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  RD.uc.proto = [
    {
      title: 'A command split across TCP reads', short: 'split frame', kind: 'tape',
      intro: 'A TCP read can end halfway through a command. See when Redis actually runs it.',
      trigger: 'A metrics proxy forwards <code>INCR hits</code>. The 24-byte RESP frame reaches Redis as three reads of 10, 10 and 4 bytes.',
      run: "printf '*2\\r\\n$4\\r\\nINCR\\r\\n$4\\r\\nhits\\r\\n' | nc localhost 6379\n# client-query-buffer-limit is 1gb by default",
      expect: 'Redis runs <code>INCR</code> once, after the 24th byte arrives, and replies <code>:1</code>.',
      steps: [
        S('Empty buffer', 'The client has an empty query buffer. The event loop waits for the socket to be readable.', { got: 0 }, 'buffer: 0 of 24 bytes'),
        S('First read: 10 bytes', 'Redis appends 10 bytes. The parser reads <code>*2</code> (two elements) and <code>$4</code> (a 4-byte string), but only 2 of the 4 bytes are here. The frame is incomplete, so nothing runs.', { got: 10 }, 'buffer: 10 of 24 bytes · waiting'),
        S('Second read: 10 more', 'The first element, <code>INCR</code>, is now complete. The second header <code>$4</code> is known, but only <code>hi</code> of <code>hits</code> has arrived. Still waiting.', { got: 20 }, 'buffer: 20 of 24 bytes · waiting'),
        S('Third read: last 4 bytes', 'The final <code>ts\\r\\n</code> arrives. Now every declared length is satisfied, so the frame is complete.', { got: 24 }, 'buffer: 24 of 24 bytes · complete'),
        S('Execute and reply', 'The executor runs <code>INCR hits</code>. The reply <code>:1</code> goes to the client output buffer and is written when the socket accepts it.', { got: 24, exec: true }, 'executed once'),
        S('Why a counter can still be short', 'Redis never runs half a command, and never twice for one frame. If a total comes up short, bytes or commands were lost before Redis (a proxy, a client retry policy).', { got: 24, exec: true }, 'the gap is upstream')
      ],
      edges: [
        E('Inline commands', 'Plain text like <code>INCR hits\\r\\n</code> is accepted without RESP framing, up to 64 KB for the line (<code>PROTO_INLINE_MAX_SIZE</code>).', 'Use a client library, which sends RESP. Inline is for debugging with <code>nc</code>.'),
        E('A huge partial argument', 'A client declares a very large bulk string and sends it slowly; the query buffer grows with the partial data.', 'The cap <code>client-query-buffer-limit</code> (1gb default) closes such a connection. Lower it if clients are untrusted.')
      ],
      invariant: 'A command runs at most once, and only when its whole frame has arrived.',
      src: 'redis.conf and <code>src/config.c</code> (client-query-buffer-limit), <code>src/server.h</code> (PROTO_INLINE_MAX_SIZE), RESP framing by knowledge.'
    },
    {
      title: 'Pipelining removes round trips', short: 'pipelining', kind: 'lanes',
      intro: 'Sending five commands back to back costs one network round trip, not five.',
      trigger: 'A product page needs 5 lookups. The round trip to Redis is 0.5 ms (assumption: same availability zone); each command runs in microseconds.',
      run: 'redis-benchmark -q -n 100000 -t set -P 1   # one at a time\nredis-benchmark -q -n 100000 -t set -P 16  # 16 per round trip',
      expect: 'About 0.5 ms for five pipelined commands, against about 2.5 ms one by one (example numbers).',
      steps: [
        S('Start', 'Two clients each need five replies. Lane A waits for each reply before sending the next. Lane B sends all five at once.', { t: 0 }, 't = 0 ms'),
        S('0.5 ms', 'Lane A has its first reply and sends command 2. Lane B has all five replies, because the five commands crossed the network together.', { t: 0.5 }, 'A: 1 of 5 · B: 5 of 5'),
        S('1.0 ms', 'Lane A has two replies. Lane B is done and free.', { t: 1.0 }, 'A: 2 of 5'),
        S('1.5 ms', 'Lane A has three.', { t: 1.5 }, 'A: 3 of 5'),
        S('2.0 ms', 'Lane A has four.', { t: 2.0 }, 'A: 4 of 5'),
        S('2.5 ms', 'Lane A finally finishes. The work done by Redis was the same; the difference was waiting on the network.', { t: 2.5 }, 'A: 5 of 5 · 5× slower')
      ],
      edges: [
        E('Too deep a pipeline', 'Replies are queued in the client output buffer on the server. The default <code>client-output-buffer-limit normal 0 0 0</code> means no limit, so a huge pipeline can use much memory.', 'Send batches of a few hundred commands and read their replies before the next batch.'),
        E('A pipeline is not a transaction', 'Commands from other clients can run between yours; one failing command does not stop the rest.', 'Use <code>MULTI</code>/<code>EXEC</code> or a script when the group must not interleave (feature 8).')
      ],
      invariant: 'Replies on one connection come back in the order the requests were sent.',
      src: 'redis.conf (client-output-buffer-limit normal 0 0 0). Round trip and timings are assumptions.'
    },
    {
      title: 'One slow command stalls every client', short: 'slow command', kind: 'swim',
      intro: 'Commands run one at a time, so a long one adds its whole duration to every request waiting behind it.',
      trigger: 'An operator runs <code>KEYS cart:*</code> on a database with millions of keys. Suppose it takes 80 ms (example) while checkout reads arrive.',
      run: 'redis-cli SLOWLOG GET 5\n# slowlog-log-slower-than 10000 (10 ms) and slowlog-max-len 128 are the defaults',
      expect: 'Two <code>GET</code>s sent during the scan answer after about 80 ms; <code>SLOWLOG</code> lists the <code>KEYS</code>.',
      steps: [
        S('Normal load', 'Short commands finish in microseconds. The wait queue is empty, so each request sees almost only its own run time.', { run: 'idle', queue: [], done: [] }, 'queue: 0'),
        S('KEYS arrives', 'The executor starts <code>KEYS cart:*</code>. It cannot be interrupted partway by another client.', { run: 'KEYS cart:* · 80 ms', queue: [], done: [] }, 'executor busy'),
        S('Reads pile up', 'Two <code>GET</code>s from checkout arrive. Their bytes sit in socket buffers; Redis does not read them as commands yet.', { run: 'KEYS cart:* · 40 ms left', queue: ['GET sess:7 (client B)', 'GET cart:9 (client C)'], done: [] }, 'queue: 2 waiting'),
        S('KEYS finishes', 'After 80 ms the executor is free and runs the waiting commands one by one.', { run: 'GET sess:7', queue: ['GET cart:9 (client C)'], done: [['KEYS cart:*', 'ran 80 ms']] }, 'B waited about 80 ms'),
        S('What was recorded', 'Because 80 ms is over 10 ms, the <code>KEYS</code> is logged by SLOWLOG with its duration in microseconds. The two GETs are fast; they only waited.', { run: 'idle', queue: [], done: [['KEYS cart:*', 'ran 80 ms'], ['GET sess:7', 'waited ~80 ms'], ['GET cart:9', 'waited ~80 ms']] }, 'SLOWLOG: KEYS · 80000 µs'),
        S('The fix', 'Replace it with <code>SCAN 0 MATCH cart:* COUNT 100</code>. Each call visits a small slice, so other clients run between calls.', { run: 'SCAN slice · 1 ms', queue: ['GET sess:7'], done: [] }, 'wait per request ≈ 1 ms')
      ],
      edges: [
        E('Scripts block too', 'A long Lua script also holds the executor. After <code>busy-reply-threshold</code> (5000 ms by default) other clients get <code>-BUSY</code>.', 'Keep scripts short; use <code>SCRIPT KILL</code> for a script that has not written yet.'),
        E('Deleting a huge key', '<code>DEL</code> on a key with millions of elements frees memory on the executor.', 'Use <code>UNLINK</code> (frees in a background thread), or set <code>lazyfree-lazy-user-del yes</code> (default no).')
      ],
      invariant: 'A request\'s latency is its time in the queue plus its own run time.',
      src: 'redis.conf (slowlog-log-slower-than, slowlog-max-len, lazyfree-lazy-user-del). The 80 ms figure is an example.'
    }
  ];

  RD.uc.data = [
    {
      title: 'A hash outgrows its compact encoding', short: 'listpack to hashtable', kind: 'gauge',
      intro: 'Small hashes are stored as a flat listpack. Cross a limit and Redis converts to a real hash table.',
      trigger: 'A profile hash grows as users add fields. You want to know when memory use per field jumps.',
      run: 'redis-cli OBJECT ENCODING user:1\n# hash-max-listpack-entries 512 and hash-max-listpack-value 64 (7.2 defaults)',
      expect: '<code>listpack</code> at 512 fields or fewer with values up to 64 bytes; <code>hashtable</code> above either limit.',
      steps: [
        S('100 small fields', 'The hash is one contiguous listpack: fields and values side by side. Lookups scan it, which is fast for a few hundred short items.', { n: 100, len: 12, enc: 'listpack' }, 'listpack · 100 fields'),
        S('Exactly 512 fields', 'The limit is "more than 512", so 512 is still a listpack.', { n: 512, len: 12, enc: 'listpack' }, 'listpack · at the limit'),
        S('The 513th field', 'Adding it pushes the count over <code>hash-max-listpack-entries</code>. Redis converts the whole value to a hash table.', { n: 513, len: 12, enc: 'hashtable' }, 'hashtable · converted'),
        S('Or a single long value', 'A fresh hash with 3 fields but one 65-byte value also converts, because of <code>hash-max-listpack-value</code>.', { n: 3, len: 65, enc: 'hashtable' }, 'hashtable · value too long'),
        S('Delete down to 10 fields', 'Conversion goes one way. Deleting fields does not shrink the encoding back.', { n: 10, len: 12, enc: 'hashtable', stuck: true }, 'still hashtable · 10 fields'),
        S('Copy to a new key', 'Writing the 10 fields into a new key starts as a listpack again and picks the encoding by size.', { n: 10, len: 12, enc: 'listpack' }, 'new key: listpack')
      ],
      edges: [
        E('Many small objects', 'One hash per user with 20 fields usually costs less memory than 20 top-level keys, since each key carries overhead.', 'Group small related values into a hash. Measure with <code>MEMORY USAGE key</code> before and after.'),
        E('Raising the limits', 'Larger limits save memory but make each lookup scan longer, so CPU per command rises.', 'Change one threshold at a time and watch latency; keep the limit where scans stay short.')
      ],
      invariant: 'Encoding never changes what a command returns, only memory and CPU.',
      src: 'redis.conf 7.2 (hash-max-listpack-entries 512, -value 64) and <code>src/t_hash.c</code> (conversion only toward hashtable).'
    },
    {
      title: 'A leaderboard in a sorted set', short: 'skiplist + dict', kind: 'skiplist',
      intro: 'A sorted set keeps a skip list for order and a dict for member lookup. See how a range query finds its start.',
      trigger: 'The marketplace asks "who has a score of at least 250?" and also "what is cho\'s score?".',
      run: 'redis-cli ZADD board 120 ann 180 bob 250 cho 310 dan 400 eve\nredis-cli ZRANGEBYSCORE board 250 +inf\nredis-cli ZSCORE board cho',
      expect: '<code>cho dan eve</code> in O(log N + M) time; <code>250</code> in O(1).',
      steps: [
        S('The two structures', 'Members sit in a skip list ordered by score, and in a dict mapping member to score. Higher levels skip over many nodes. (Above 128 members or values over 64 bytes; smaller sets use a listpack.)', { vis: [], dict: false }, 'skiplist + dict'),
        S('ZSCORE cho', 'The dict answers directly: member to score, no walk.', { vis: [], dict: true }, 'O(1) via the dict'),
        S('Start at the top level', 'A range search starts at the head on the highest level.', { vis: ['3:head'] }, 'level 3 · head'),
        S('Skip along level 3', 'bob (180) is below 250, so move to bob. There is nothing after bob at level 3, so drop a level.', { vis: ['3:head', '3:bob'] }, 'level 3 · at bob'),
        S('Level 2', 'bob\'s next node at level 2 is cho (250), not below 250. Drop another level.', { vis: ['3:head', '3:bob', '2:bob'] }, 'level 2 · at bob'),
        S('Level 1', 'At level 1 the next node is also cho (250). The search stops: cho is the first node with score at least 250.', { vis: ['3:head', '3:bob', '2:bob', '1:bob'], found: 'cho' }, 'first match: cho'),
        S('Walk forward', 'Redis follows level 1 from cho, collecting cho, dan and eve until the end of the range.', { vis: ['3:head', '3:bob', '2:bob', '1:bob'], found: 'cho', out: ['cho', 'dan', 'eve'] }, 'returned: 3 members')
      ],
      edges: [
        E('Equal scores', 'Two members with the same score need a tie-break.', 'They are ordered by the member string, so order is stable.'),
        E('A huge range reply', '<code>ZRANGE board 0 -1</code> on millions of members builds one giant reply on the executor.', 'Page with <code>LIMIT offset count</code> or <code>ZRANGE ... BYSCORE ... LIMIT</code>, as in the slow-command use case.')
      ],
      invariant: 'The skip list and the dict always contain exactly the same members.',
      src: '<code>zset-max-listpack-entries 128</code> and <code>-value 64</code> in redis.conf 7.2. Skip-list walk drawn from the standard algorithm.'
    },
    {
      title: 'Incremental rehash keeps latency flat', short: 'incremental rehash', kind: 'rehash',
      intro: 'When the key table is full Redis grows it, but moves one bucket per command instead of everything at once.',
      trigger: 'The keyspace dict has 4 buckets and 4 keys. A fifth key is added.',
      run: 'redis-cli INFO keyspace\nredis-cli DEBUG HTSTATS 0   # shows the tables and whether it is rehashing',
      expect: 'A second table of 8 buckets appears; each following command moves one bucket; then the old table is freed.',
      steps: [
        S('Full table', 'Four keys sit in four buckets. The table is as full as its size.', { t0: [1, 1, 1, 1], t1: null, idx: -1 }, 'used 4 · size 4'),
        S('Add the fifth key', 'used is not below size, so Redis allocates a second table with 8 buckets and sets <code>rehashidx = 0</code>. New keys go to the new table only.', { t0: [1, 1, 1, 1], t1: [0, 0, 0, 0, 1, 0, 0, 0], idx: 0 }, 'rehashing started'),
        S('The next command moves bucket 0', 'Any lookup or write on the table also moves one old bucket into the new one. Bucket 0\'s key lands in new bucket 0.', { t0: [0, 1, 1, 1], t1: [1, 0, 0, 0, 1, 0, 0, 0], idx: 1 }, 'moved 1 of 4 buckets'),
        S('Two more commands', 'Buckets 1 and 2 move. Lookups check both tables until the move is done.', { t0: [0, 0, 0, 1], t1: [1, 0, 1, 0, 1, 1, 0, 0], idx: 3 }, 'moved 3 of 4 buckets'),
        S('Last bucket', 'Bucket 3 moves, the old table is empty and freed, and the new table becomes the only one.', { t0: null, t1: [1, 0, 1, 0, 1, 1, 0, 1], idx: -1 }, 'used 5 · size 8')
      ],
      edges: [
        E('Idle server', 'If no commands arrive the table would stay half-moved.', 'With <code>activerehashing yes</code> (default) the cron also rehashes for about 1 ms per 100 ms tick.'),
        E('During a fork', 'While a snapshot or AOF rewrite child exists, copying more pages hurts, so growth is postponed until the load factor passes a higher limit (<code>dict_force_resize_ratio</code>, 5 in the 7.2 source).', 'Avoid starting resizes during rewrites if you can; accept longer bucket chains meanwhile.')
      ],
      invariant: 'Every key is in exactly one of the two tables, and a lookup checks both while rehashing.',
      src: '<code>src/dict.c</code> 7.2 (dict_force_resize_ratio = 5), redis.conf (activerehashing yes). Bucket layout is an example.'
    }
  ];

  const IDLE = [5, 410, 33, 900, 120, 15, 700, 60, 250, 8, 1200, 45, 330, 18, 95, 540, 70, 160, 22, 380];
  const ex = (n, expired) => Array.from({ length: 40 }, (_, i) => (expired.includes(i) ? 1 : 0));
  const E0 = [1, 3, 6, 8, 11, 14, 17, 21, 25, 28, 33, 37];
  const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const K1 = ex(40, E0);
  const K2 = K1.map((v, i) => (v === 1 && i < 20 ? 2 : v));
  const K3 = K2.map((v, i) => (v === 1 ? 2 : v));
  const K4 = K3.map((v, i) => (i === 30 ? 1 : v));
  const K5 = K4.map((v, i) => (i === 30 ? 2 : v));
  RD.uc.mem = [
    {
      title: 'Lazy and active expiry together', short: 'expiry', kind: 'sweep',
      intro: 'A key past its TTL is hidden at once, but is deleted by two different paths: when touched, and by a sampling sweep.',
      trigger: 'Sessions expire after 30 minutes. Many keys expired in the same minute; memory still looks high.',
      run: 'redis-cli SET sess:7 v EX 1800\nredis-cli INFO stats | grep expired_keys\n# hz 10: the active cycle runs about 10 times a second',
      expect: 'Reads never return an expired key; <code>expired_keys</code> rises as the sweep and lazy deletes remove them.',
      steps: [
        S('12 expired keys still in memory', 'Of 40 keys with a TTL, 12 are past their expiry time (amber). They have not been deleted yet. Reads would hide them.', { keys: K1, samp: [] }, 'expired but stored: 12'),
        S('Cycle 1: sample 20 keys', 'The cron samples about 20 keys from the TTL table (<code>ACTIVE_EXPIRE_CYCLE_KEYS_PER_LOOP</code>). 7 of the 20 are expired: 35%.', { keys: K2, samp: rng(0, 19) }, '7 deleted · 35% stale'),
        S('More than 10% stale: go again', 'Above 10% (<code>ACTIVE_EXPIRE_CYCLE_ACCEPTABLE_STALE</code>) the cycle repeats at once. This sample finds 5 expired in 20: 25%.', { keys: K3, samp: rng(20, 39) }, '5 deleted · 25% stale'),
        S('Stop when the sample is clean', 'Another key (30) just expired. The next sample finds no expired keys, so the sweep stops. Key 30 stays until something reads it.', { keys: K4, samp: rng(0, 19) }, '0% stale · 1 lingering'),
        S('A read cleans up', '<code>GET</code> on key 30 checks its TTL first (lazy expiry), deletes it and replies nil.', { keys: K5, samp: [30] }, 'read returned nil')
      ],
      edges: [
        E('Everything expires at one second', 'Setting the same TTL for a whole batch makes them all due together, and the sweep (capped at about 25% of CPU) runs long.', 'Add random jitter to TTLs so expiry spreads out.'),
        E('Replicas', 'A replica does not expire keys by itself; it waits for the primary to send a <code>DEL</code>. It hides logically expired keys from reads.', 'Do not rely on replica memory dropping on its own; watch the primary\'s <code>expired_keys</code>.')
      ],
      invariant: 'A key past its TTL is never returned to a client, even if its bytes are still in memory.',
      src: '<code>src/expire.c</code> 7.2: KEYS_PER_LOOP 20, ACCEPTABLE_STALE 10, SLOW_TIME_PERC 25; redis.conf (hz 10). Which keys fall in each sample is an example.'
    },
    {
      title: 'Eviction by sampled LRU', short: 'sampled LRU', kind: 'scatter',
      intro: 'Redis does not track exact recency. It samples a few keys and evicts the oldest of those.',
      trigger: 'Memory reaches <code>maxmemory</code> with policy <code>allkeys-lru</code>. The next write needs space.',
      run: 'redis-cli CONFIG SET maxmemory-policy allkeys-lru\nredis-cli CONFIG GET maxmemory-samples   # 5 is the default',
      expect: 'The victim is the most idle key among 5 sampled, not necessarily the globally oldest.',
      steps: [
        S('Twenty keys by idle time', 'Each dot is a key placed by seconds since last use. The oldest overall is the star at 1200 s. Idle time is measured with about 1 s resolution.', { idle: IDLE, samp: [], victim: null, oldest: 10 }, 'true oldest: 1200 s'),
        S('Sample 5 keys', 'Redis picks 5 keys at random (<code>maxmemory-samples 5</code>): idle 410, 700, 8, 18, 160.', { idle: IDLE, samp: [1, 6, 9, 13, 17], victim: null, oldest: 10 }, 'sample idle: 410 · 700 · 8 · 18 · 160'),
        S('Evict the most idle of the sample', 'The sample\'s highest idle time is 700 s. That key is evicted, though 1200 s existed. The other candidates go in a pool of 16 for later rounds.', { idle: IDLE, samp: [1, 6, 9, 13, 17], victim: 6, oldest: 10 }, 'evicted: idle 700 s'),
        S('Still over the limit: sample again', 'Another sample: 900, 1200, 330, 95, 33. This one contains the oldest key.', { idle: IDLE, samp: [3, 10, 12, 14, 2], victim: 10, oldest: 10 }, 'evicted: idle 1200 s'),
        S('Trade-off', 'Raising <code>maxmemory-samples</code> (10 is close to true LRU) picks better victims but costs more CPU per eviction.', { idle: IDLE, samp: [3, 10, 12, 14, 2, 1, 6, 7, 8, 4], victim: 10, oldest: 10 }, 'samples 10 · more accurate')
      ],
      edges: [
        E('Policy that finds nothing', 'With <code>volatile-lru</code> only keys that have a TTL are candidates. If none do, eviction frees nothing and writes get OOM errors.', 'Use an <code>allkeys-*</code> policy for a pure cache, or give every cache key a TTL.'),
        E('Replica and AOF buffers', 'Replica output buffers and the AOF buffer are not counted when deciding what to evict.', 'Leave memory headroom beyond <code>maxmemory</code> for buffers and fork copy-on-write.')
      ],
      invariant: 'Evictions continue until used memory is back at or under maxmemory, or no candidate exists.',
      src: '<code>src/evict.c</code> 7.2 (EVPOOL_SIZE 16), <code>src/config.c</code> (maxmemory-samples 5), <code>LRU_CLOCK_RESOLUTION 1000</code> ms. Idle values are an example.'
    },
    {
      title: 'noeviction: the server says no', short: 'OOM refusal', kind: 'bullet',
      intro: 'With the default policy nothing is evicted. Once full, commands that would grow memory are refused.',
      trigger: 'A cart service writes to a Redis whose <code>maxmemory</code> is 4 GB and policy is the default <code>noeviction</code>.',
      run: 'redis-cli CONFIG SET maxmemory 4gb\nredis-cli SET k v\n# (error) OOM command not allowed when used memory > \'maxmemory\'.',
      expect: 'Writes return <code>-OOM</code> once over the limit; reads and <code>DEL</code> still work.',
      steps: [
        S('Room left', 'Used memory is 3.0 GB of 4 GB. Writes succeed.', { used: 3.0, max: 4, out: [['SET cart:1', 'OK', 1]] }, 'used 3.0 / 4.0 GB'),
        S('Near the limit', 'At 3.9 GB, writes still succeed. The check happens before each command.', { used: 3.9, max: 4, out: [['SET cart:2', 'OK', 1]] }, 'used 3.9 / 4.0 GB'),
        S('Over the limit', 'The last write took usage to 4.1 GB (a command can overshoot). The next growing command is refused. Reads are fine.', { used: 4.1, max: 4, out: [['SET cart:3', '-OOM command not allowed', 0], ['GET cart:1', 'value', 1]] }, 'used 4.1 / 4.0 GB · writes refused'),
        S('Free space', '<code>DEL</code> is allowed because it cannot grow memory. Deleting a 0.6 GB key brings usage to 3.5 GB.', { used: 3.5, max: 4, out: [['DEL cart:big', '1', 1]] }, 'used 3.5 / 4.0 GB'),
        S('Writes resume', 'Under the limit, <code>SET</code> works again. No data was dropped by the server; the caller chose what to delete.', { used: 3.5, max: 4, out: [['SET cart:3', 'OK', 1]] }, 'used 3.5 / 4.0 GB'),
        S('The alternative', 'A cache would use <code>allkeys-lru</code> and never refuse. A store of record keeps <code>noeviction</code> so nothing disappears silently.', { used: 3.9, max: 4, out: [['policy', 'allkeys-lru evicts instead', 1]] }, 'choose per workload')
      ],
      edges: [
        E('One big command', 'The limit is checked before a command, so a single large <code>SADD</code> can push usage past <code>maxmemory</code>.', 'Keep headroom and break large writes into batches.'),
        E('Which commands are blocked', 'Only commands flagged as able to grow memory (SET, LPUSH, SADD, ...) are refused; <code>DEL</code>, <code>EXPIRE</code> and reads are not.', 'Build alerts on <code>used_memory</code> / <code>maxmemory</code> so you act before the first refusal.')
      ],
      invariant: 'Under noeviction, no existing key is removed by memory pressure; only new growth is refused.',
      src: 'redis.conf 7.2 (maxmemory-policy noeviction is the default). Sizes are examples.'
    }
  ];
})();
