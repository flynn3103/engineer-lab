/* Use cases for features 7 to 9: Cluster, transactions/streams/messaging, end to end. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const own = (a, b) => Array.from({ length: 32 }, (_, i) => (i < a ? 0 : i < b ? 1 : 2));
  const O3 = own(11, 22);               // 32 cells of 512 slots, split roughly in thirds (schematic)
  const hole = O3.map((v, i) => (v === 2 ? -1 : v));

  CourseData.uc.cluster = [
    {
      title: 'Key to slot, and hash tags', short: 'key to slot', kind: 'hash',
      intro: 'A key\'s slot is a pure function of its bytes: CRC16 modulo 16384. A hash tag lets related keys share a slot.',
      trigger: 'A shop keeps <code>user:1000</code>, its cart and its profile. They should live on one node so a single command can touch them.',
      run: 'redis-cli -c CLUSTER KEYSLOT user:1000\nredis-cli -c CLUSTER KEYSLOT {user:1000}.cart',
      expect: 'Plain keys scatter across slots. Keys sharing the same <code>{tag}</code> land in one slot.',
      steps: [
        S('The rule', 'slot = CRC16(key) mod 16384. Three primaries own 0–5460, 5461–10922 and 10923–16383. The numbers below are computed live in this page.', { keys: ['foo', 'bar', 'hello'] }, 'three plain keys'),
        S('Related keys scatter', 'Keys that belong to one user hash separately, so they land on different slots and, here, on three different nodes.', { keys: ['profile:1000', 'cart:1000', 'orders:1000'] }, 'three slots · three nodes'),
        S('A hash tag pins them together', 'When a key has <code>{...}</code>, only the text inside is hashed. Both keys below hash <code>user:1000</code>, so they share a slot (and with the plain key <code>user:1000</code>).', { keys: ['{user:1000}.profile', '{user:1000}.cart', 'user:1000'] }, 'same slot · one node'),
        S('A tag that is too wide', 'Using one tag such as <code>{app}</code> for everything puts every key in one slot, on one node. That node becomes the hot spot.', { keys: ['{app}.a', '{app}.b', '{app}.c'] }, 'all keys on one node'),
        S('Empty braces are ignored', 'If the text between the braces is empty, the whole key is hashed as usual.', { keys: ['{}.x', '{}.y', 'x'] }, 'whole key hashed')
      ],
      edges: [
        E('Hot tag', 'A tag shared by many keys concentrates load.', 'Tag by an entity that is small enough (one user, one order), not by the application.'),
        E('Resharding', 'Moving data between nodes does not change any key\'s slot, only which node owns the slot.', 'Clients cache the slot map and refresh it from redirections (next use case).')
      ],
      invariant: 'The slot of a key depends only on the key\'s bytes, so every node and client computes the same slot.',
      src: 'Slot count 16384 and CRC16 by the Cluster specification; <code>src/cluster.c</code> 7.2 contains the <code>CROSSSLOT</code> check. CRC16 is the XMODEM variant; this page\'s result for "foo" was checked against the well-known slot 12182.'
    },
    {
      title: 'MOVED versus ASK during resharding', short: 'MOVED and ASK', kind: 'redirect',
      intro: 'A permanent change of owner is MOVED. A slot that is half moved is ASK, for one request.',
      trigger: 'Slot 7638 is moved from node A to node B while clients keep reading keys in it.',
      run: 'redis-cli -c -h A GET k2   # -c follows redirections\n# -MOVED 7638 B:6379   or   -ASK 7638 B:6379',
      expect: 'MOVED updates the client\'s map. ASK sends one request to the importing node with <code>ASKING</code> and changes nothing else.',
      steps: [
        S('Stable', 'Node A owns slot 7638 and holds keys k1 and k2. Node B owns other slots. The client\'s map says 7638 → A.', { a: ['owns 7638', ['k1', 'k2']], b: ['other slots', []], lines: [['GET k1 → A', 'value', 1]] }, 'client map: 7638 → A'),
        S('A stale map', 'If the client had asked B instead, B would reply <code>-MOVED 7638 A:6379</code>. The client updates its map and retries; the change is permanent.', { a: ['owns 7638', ['k1', 'k2']], b: ['other slots', []], lines: [['GET k1 → B', '-MOVED 7638 A:6379', 0], ['GET k1 → A', 'value', 1]] }, 'map corrected'),
        S('Resharding starts', 'A is set MIGRATING for 7638 and B IMPORTING. Keys move one at a time with <code>MIGRATE</code>. A still owns the slot for now.', { a: ['MIGRATING 7638 → B', ['k1', 'k2']], b: ['IMPORTING 7638 ← A', []], lines: [] }, 'slot half moved'),
        S('k2 moved, k1 not yet', 'k2 now lives on B. Asking A for k1 still works from A.', { a: ['MIGRATING 7638 → B', ['k1']], b: ['IMPORTING 7638 ← A', ['k2']], lines: [['GET k1 → A', 'value', 1]] }, 'k1 on A · k2 on B'),
        S('ASK', 'Asking A for k2 finds it missing but the slot is migrating, so A answers <code>-ASK 7638 B:6379</code>. The client sends <code>ASKING</code> then <code>GET k2</code> to B. Its map still says A.', { a: ['MIGRATING 7638 → B', ['k1']], b: ['IMPORTING 7638 ← A', ['k2']], lines: [['GET k1 → A', 'value', 1], ['GET k2 → A', '-ASK 7638 B:6379', 0], ['ASKING; GET k2 → B', 'value', 1]] }, 'one-off redirect'),
        S('Migration done', 'All keys are on B and ownership is assigned to B. From now on A answers MOVED for this slot, and clients update their maps.', { a: ['owns other slots', []], b: ['owns 7638', ['k1', 'k2']], lines: [['GET k1 → A', '-MOVED 7638 B:6379', 0], ['GET k1 → B', 'value', 1]] }, 'client map: 7638 → B')
      ],
      edges: [
        E('Multi-key command mid-migration', 'A command with keys k1 and k2 where only one has moved cannot be served from either node.', 'The node replies <code>-TRYAGAIN</code>; retry shortly or avoid multi-key commands on slots being moved.'),
        E('A large key', '<code>MIGRATE</code> moves one key at a time and blocks the node while that key is serialised.', 'Split very large values before resharding.')
      ],
      invariant: 'At any moment exactly one node answers a slot as owner; a client reading the wrong side is always redirected.',
      src: '<code>src/cluster.c</code> 7.2 (CLUSTER_REDIR_ASK, TRYAGAIN when only some keys are present). The key placement is an example.'
    },
    {
      title: 'CROSSSLOT and slot coverage', short: 'CROSSSLOT', kind: 'grid',
      intro: 'A multi-key command only works inside one slot, and by default the whole cluster stops if any slot has no owner.',
      trigger: 'Checkout runs <code>MSET a 1 b 2</code>, and later a primary with no replica fails.',
      run: 'redis-cli -c MSET a 1 b 2\n# (error) CROSSSLOT Keys in request don\'t hash to the same slot\nredis-cli CONFIG GET cluster-require-full-coverage',
      expect: 'The first command fails; with a tag it works. A lost shard makes the cluster refuse queries unless coverage is relaxed.',
      steps: [
        S('Two keys, two slots', '<code>a</code> and <code>b</code> hash to different slots, so no single node can run the command. Redis returns <code>-CROSSSLOT</code>.', { own: O3, keys: ['a', 'b'], err: 'MSET a 1 b 2 → -CROSSSLOT' }, 'keys in two slots'),
        S('Tag them', '<code>MSET {a}.x 1 {a}.y 2</code> puts both in one slot, so it runs.', { own: O3, keys: ['{a}.x', '{a}.y'], err: 'MSET {a}.x 1 {a}.y 2 → OK' }, 'both in one slot'),
        S('A primary fails with no replica', 'Node C owned the last third of the slots. After <code>cluster-node-timeout</code> (15000 ms) it is flagged failed, and with no replica those slots have no owner.', { own: hole, keys: [], err: '' }, 'uncovered slots'),
        S('Full coverage required', 'With <code>cluster-require-full-coverage yes</code> (the default) the cluster answers <code>-CLUSTERDOWN</code> to queries, including slots that still have an owner.', { own: hole, keys: ['b'], err: 'GET b → -CLUSTERDOWN (b\'s slot has an owner)', down: true }, 'whole cluster refuses'),
        S('Relax it, knowingly', 'Setting it to <code>no</code> keeps the other slots serving. Reads and writes for the lost slots fail until a node takes them over.', { own: hole, keys: ['a', 'b'], err: 'GET b → value · GET a → error (its slot is lost)' }, 'partial service'),
        S('A replica heals it', 'With a replica, the failed primary\'s replica is promoted and the slots are covered again.', { own: O3, keys: ['a', 'b'], err: 'cluster state ok' }, 'full coverage')
      ],
      edges: [
        E('Transactions and scripts', '<code>MULTI</code> and Lua scripts touching several keys have the same one-slot rule.', 'Tag the keys, or restructure so each operation touches one entity.'),
        E('Planning for failure', 'Every primary needs at least one replica, or a single failure halts the cluster by default.', 'Run one replica per primary in a different failure domain.')
      ],
      invariant: 'A command is served only if all its keys are in one slot that a reachable node owns.',
      src: '<code>src/cluster.c</code> 7.2 (CROSSSLOT error text); redis.conf (cluster-node-timeout 15000, cluster-require-full-coverage yes, both commented defaults). Slots are drawn as 32 blocks of 512; ownership blocks here are schematic.'
    }
  ];

  CourseData.uc.msg = [
    {
      title: 'MULTI has no rollback; WATCH is optimistic', short: 'MULTI and WATCH', kind: 'diff',
      intro: 'A transaction runs its queued commands back to back, but a failing command does not undo the others.',
      trigger: 'A stock counter is decremented in a transaction while another client changes it.',
      run: 'WATCH stock\nMULTI\nDECR stock\nEXEC   # (nil) if stock changed after WATCH',
      expect: 'A runtime error leaves earlier commands applied. A change to a watched key makes <code>EXEC</code> return nil and run nothing.',
      steps: [
        S('Two cases side by side', 'Left: one transaction with a bad command. Right: a transaction guarded by <code>WATCH</code>.', { a: [], b: [] }, 'queued commands run at EXEC'),
        S('Queue the commands', 'Left: three commands are queued. Right: the client watches <code>stock</code> and reads 1.', { a: [['MULTI', 'OK'], ['SET a 1', 'QUEUED'], ['LPUSH a x', 'QUEUED'], ['SET b 2', 'QUEUED']], b: [['WATCH stock', 'OK'], ['GET stock', '1'], ['MULTI', 'OK'], ['DECR stock', 'QUEUED']] }, 'nothing has run yet'),
        S('EXEC on the left', 'The three commands run in order. <code>LPUSH</code> on a string key fails with WRONGTYPE, but <code>SET a</code> and <code>SET b</code> stay applied.', { a: [['MULTI', 'OK'], ['SET a 1', 'QUEUED'], ['LPUSH a x', 'QUEUED'], ['SET b 2', 'QUEUED'], ['EXEC', '1) OK  2) WRONGTYPE  3) OK']], b: [['WATCH stock', 'OK'], ['GET stock', '1'], ['MULTI', 'OK'], ['DECR stock', 'QUEUED']] }, 'no rollback'),
        S('Another client changes stock', 'On the right, a different client runs <code>DECR stock</code> between the WATCH and the EXEC. The watched key is now dirty for the first client.', { a: [['MULTI', 'OK'], ['SET a 1', 'QUEUED'], ['LPUSH a x', 'QUEUED'], ['SET b 2', 'QUEUED'], ['EXEC', '1) OK  2) WRONGTYPE  3) OK']], b: [['WATCH stock', 'OK'], ['GET stock', '1'], ['MULTI', 'OK'], ['DECR stock', 'QUEUED'], ['(other client) DECR stock', '0']] }, 'stock changed under the watch'),
        S('EXEC returns nil', 'The right transaction is aborted as a whole: nothing runs. The client re-reads and retries.', { a: [['MULTI', 'OK'], ['SET a 1', 'QUEUED'], ['LPUSH a x', 'QUEUED'], ['SET b 2', 'QUEUED'], ['EXEC', '1) OK  2) WRONGTYPE  3) OK']], b: [['WATCH stock', 'OK'], ['GET stock', '1'], ['MULTI', 'OK'], ['DECR stock', 'QUEUED'], ['(other client) DECR stock', '0'], ['EXEC', '(nil) — retry']] }, 'retry loop'),
        S('A queue-time error is different', 'If a command is malformed when queued (wrong arguments), the whole transaction is discarded at EXEC with <code>-EXECABORT</code>.', { a: [['MULTI', 'OK'], ['SET a 1', 'QUEUED'], ['SET b', '-ERR wrong number of arguments'], ['EXEC', '-EXECABORT Transaction discarded']], b: [] }, 'syntax error aborts all')
      ],
      edges: [
        E('No reads inside', 'Commands inside MULTI return <code>QUEUED</code>, so you cannot branch on a value mid-transaction.', 'Use WATCH with a retry loop, or a Lua script / Function when a read-modify-write must be atomic.'),
        E('Long transactions', 'A big MULTI holds the executor for its whole run, like any slow command.', 'Keep them to a handful of commands.')
      ],
      invariant: 'No other client\'s command runs between the first and last command of one EXEC.',
      src: '<code>src/multi.c</code> 7.2 (EXECABORT, dirty-CAS flag set by WATCH).'
    },
    {
      title: 'Streams and consumer groups', short: 'stream PEL', kind: 'pel',
      intro: 'A stream keeps entries. A consumer group tracks which are delivered but not acknowledged, so a crashed worker\'s tasks can be taken over.',
      trigger: 'Orders are queued for a shipping group of workers. One worker crashes with an order in hand.',
      run: 'XADD orders * id 1\nXGROUP CREATE orders shipping $\nXREADGROUP GROUP shipping c1 COUNT 2 STREAMS orders >\nXACK orders shipping 1-0',
      expect: 'An entry is pending for exactly one consumer until acknowledged; <code>XAUTOCLAIM</code> moves stale ones to a live consumer.',
      steps: [
        S('Entries added', 'Three entries are in the stream (simplified ids 1-0, 2-0, 3-0). The group has delivered none.', { e: [['1-0', 'new', ''], ['2-0', 'new', ''], ['3-0', 'new', '']], ldi: '0-0' }, 'delivered: 0 · pending: 0'),
        S('c1 reads two', '<code>XREADGROUP ... ></code> asks for new entries. 1-0 and 2-0 go to c1 and are recorded in its pending entries list (PEL). The group\'s last-delivered id moves to 2-0.', { e: [['1-0', 'pending', 'c1'], ['2-0', 'pending', 'c1'], ['3-0', 'new', '']], ldi: '2-0' }, 'pending: 2 (c1)'),
        S('c1 acknowledges one', '<code>XACK</code> removes 1-0 from the PEL. 2-0 is still pending.', { e: [['1-0', 'done', ''], ['2-0', 'pending', 'c1'], ['3-0', 'new', '']], ldi: '2-0' }, 'pending: 1 (c1)'),
        S('c1 crashes', 'c1 dies with 2-0 unacknowledged. Another consumer, c2, reads new entries and gets 3-0 only. 2-0 stays in c1\'s PEL.', { e: [['1-0', 'done', ''], ['2-0', 'pending', 'c1 (crashed)'], ['3-0', 'pending', 'c2']], ldi: '3-0' }, 'pending: 2'),
        S('Claim the stale entry', '<code>XAUTOCLAIM orders shipping c2 60000 0-0</code> moves entries idle for at least 60 s to c2 and increments their delivery count.', { e: [['1-0', 'done', ''], ['2-0', 'pending', 'c2 · delivered 2×'], ['3-0', 'pending', 'c2']], ldi: '3-0' }, 'pending: 2 (both c2)'),
        S('Everything acknowledged', 'c2 finishes and acknowledges both. The PEL is empty. The entries stay in the stream until trimmed.', { e: [['1-0', 'done', ''], ['2-0', 'done', ''], ['3-0', 'done', '']], ldi: '3-0' }, 'pending: 0')
      ],
      edges: [
        E('Poison message', 'An entry that always fails is claimed again and again.', 'Check the delivery count in <code>XPENDING</code> and move entries over a limit to a dead-letter stream.'),
        E('Trimming pending entries', '<code>XADD ... MAXLEN</code> or <code>XTRIM</code> can delete an entry that is still pending.', 'Size the trim threshold so entries are acknowledged before they are trimmed.')
      ],
      invariant: 'Each entry is undelivered, pending for exactly one consumer, or acknowledged.',
      src: 'Stream and consumer-group semantics from knowledge (XAUTOCLAIM since 6.2); not re-read in docs for this build. Ids simplified.'
    },
    {
      title: 'Pub/Sub versus a stream for fan-out', short: 'Pub/Sub loss', kind: 'fan',
      intro: 'Pub/Sub delivers only to who is connected right now. A stream keeps the message until it is trimmed.',
      trigger: 'A notification service publishes events. Subscriber B restarts for a few seconds.',
      run: 'SUBSCRIBE news          # subscriber\nPUBLISH news m2         # returns the receiver count\nXADD news * m m2        # the stream equivalent',
      expect: '<code>PUBLISH</code> returns 1 while B is away and B never sees m2. With a stream, B reads m2 after it returns.',
      steps: [
        S('Both subscribed', 'A and B subscribe. <code>PUBLISH news m1</code> returns 2: both receive it. The same event is also appended to a stream.', { pub: ['m1'], A: ['m1'], B: ['m1'], aUp: true, bUp: true, stream: ['m1'], res: 'PUBLISH → 2' }, 'delivered to 2'),
        S('B disconnects', 'B restarts. Pub/Sub keeps no state for it.', { pub: ['m1'], A: ['m1'], B: ['m1'], aUp: true, bUp: false, stream: ['m1'], res: '' }, 'B offline'),
        S('Publish while B is away', '<code>PUBLISH news m2</code> returns 1. Only A receives it. The stream stores m2.', { pub: ['m1', 'm2'], A: ['m1', 'm2'], B: ['m1'], aUp: true, bUp: false, stream: ['m1', 'm2'], res: 'PUBLISH → 1' }, 'B missed m2'),
        S('B returns', 'B subscribes again. Pub/Sub does not replay m2. It is gone for B.', { pub: ['m1', 'm2'], A: ['m1', 'm2'], B: ['m1'], aUp: true, bUp: true, stream: ['m1', 'm2'], res: '' }, 'at-most-once'),
        S('B reads the stream', 'B asks <code>XREAD STREAMS news 1-0</code> (its last seen id) and gets m2. Nothing was lost.', { pub: ['m1', 'm2'], A: ['m1', 'm2'], B: ['m1', 'm2'], aUp: true, bUp: true, stream: ['m1', 'm2'], res: '', fromStream: true }, 'at-least-once with ack'),
        S('The cost', 'The stream holds data until trimmed (<code>XTRIM</code> / <code>MAXLEN</code>), so it uses memory; Pub/Sub holds nothing.', { pub: ['m1', 'm2'], A: ['m1', 'm2'], B: ['m1', 'm2'], aUp: true, bUp: true, stream: ['m1', 'm2'], res: '', cost: true }, 'memory grows with the backlog')
      ],
      edges: [
        E('A slow subscriber', 'Messages for a slow subscriber pile up in its output buffer. The <code>pubsub</code> class limit is hard 32mb, or 8mb for 60 s, then the connection is closed.', 'Make the consumer faster or use a stream, which lets a slow reader lag instead of being dropped.'),
        E('In a cluster', '<code>PUBLISH</code> is sent to every node, which costs bandwidth as the cluster grows.', 'Use sharded Pub/Sub (<code>SPUBLISH</code>, 7.0) so messages stay within one slot\'s shard.')
      ],
      invariant: 'Pub/Sub delivers only to subscribers connected at the moment of the publish.',
      src: 'redis.conf 7.2 (client-output-buffer-limit pubsub 32mb 8mb 60). Sharded Pub/Sub (7.0) and the cluster broadcast from knowledge.'
    }
  ];

  CourseData.uc.e2e = [
    {
      title: 'One write, end to end', short: 'SET cart:42', kind: 'flow',
      intro: 'Follow one command through every earlier feature and mark where it can be lost.',
      trigger: 'A cart service sends <code>SET cart:42 {...}</code> to a cluster with <code>appendfsync everysec</code> and one replica per primary.',
      run: 'redis-cli -c SET cart:42 \'{"items":3}\'\nredis-cli INFO persistence replication',
      expect: '<code>+OK</code> returns after the command runs and the AOF is written to the OS, not after fsync or replica apply.',
      steps: [
        S('Route', 'The client computes CRC16("cart:42") mod 16384 and sends the command to the node that owns the slot (feature 7).', { at: 0 }, 'slot owner chosen'),
        S('Read and parse', 'The event loop reads the bytes, buffers until the RESP frame is complete, and builds the command (feature 1).', { at: 1 }, 'frame complete'),
        S('Check memory, then run', 'Redis checks <code>maxmemory</code> (feature 3). The executor then applies the write; the value gets its encoding (feature 2).', { at: 2 }, 'applied in memory'),
        S('Append and propagate', 'The command is appended to the AOF buffer and to the replication stream and backlog (features 4 and 5). Both happen on the same executor before the reply.', { at: 3 }, 'AOF buffer + repl stream'),
        S('Write to disk cache, reply', 'In <code>beforeSleep</code> the AOF buffer is <code>write()</code>-n to the file, then client replies are written. The client sees <code>+OK</code>.', { at: 4 }, 'client sees +OK'),
        S('Later, asynchronously', 'A background thread fsyncs within about a second, and the replica applies the stream. Two loss windows remain open until then.', { at: 5 }, 'fsync + replica apply'),
        S('If the primary dies now', 'Before the fsync, the OS cache is lost with a power failure. Before replica apply, a promoted replica lacks the write. Sentinel or Cluster failover (features 5 to 7) chooses a new primary.', { at: 6 }, 'two windows: fsync and replica lag')
      ],
      edges: [
        E('Which window is bigger?', 'Local fsync loss is about 1 s. Replica lag is whatever the offsets show, and a failover only needs the replica to be behind.', 'Check the replica offset gap, not only the AOF setting.'),
        E('Close the windows', 'Use <code>appendfsync always</code> for the first and <code>WAIT</code>/<code>WAITAOF</code> plus <code>min-replicas-to-write</code> for the second, each at a cost in latency.', 'Choose per key class: sessions can use defaults, payments should not live only here.')
      ],
      invariant: 'The reply is sent after the command ran and the AOF was written, never after fsync or replica apply by default.',
      src: '<code>beforeSleep</code> in <code>src/server.c</code> 7.2 calls <code>flushAppendOnlyFile</code> before <code>handleClientsWithPendingWrites</code>; the rest ties together the previous features.'
    }
  ];
})();
