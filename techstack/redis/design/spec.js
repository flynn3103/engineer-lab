/* Spec for the Redis system-design course: overview, problem, requirements, estimates, high-level design, and the per-feature specs.
 * Facts target Redis 7.2. Defaults were read from redis.conf, sentinel.conf and src/config.c on the 7.2 branch. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  id: 'redis', name: 'Redis', version: '7.2', root: '../../../',
  related: [{ href: '../course.html', title: 'Problem-based course', sub: '11 chapters that start from incidents' }]
};
CourseData.spec = {
  version: '7.2',
  title: 'Design an in-memory data server',
  navTitle: 'In-memory data server',
  lead: 'Start from a marketplace that needs sessions, carts and a leaderboard answered in under a millisecond. Work out what the server must do, how it is built, then walk each feature through the use cases that decide whether it behaves in production.',
  overview: [
    '<b>What it is.</b> Redis is a server that keeps typed values (strings, hashes, lists, sets, sorted sets, streams) in RAM and runs commands against them. Disk, replicas and shards exist to survive loss and to grow past one machine, not to serve the common read.',
    '<b>Who does what.</b> One event loop reads sockets and parses commands. One executor runs them, one at a time. Background work (fork for snapshots, fsync, lazy free, replica sync) is pushed off that path. Sentinel or Cluster decide who is primary; they do not move data per request.'
  ],
  problem: [
    ['<b>Scenario</b>', 'A marketplace has 20 million live sessions, 5 million carts and a 2 million member leaderboard. Product wants a session lookup in under 1 ms at the 99th percentile at 150,000 reads/s and 20,000 writes/s (example numbers).'],
    ['<b>Naive design</b>', 'Keep it all in the relational database and cache nothing. Every request is a disk-backed query behind a connection pool.'],
    ['<b>Fails when</b>', 'Peak traffic uses all pooled connections; queries queue; p99 climbs from a few ms to hundreds, and one slow report starves the checkout path.'],
    ['<b>Principle</b>', 'Hold the working set in RAM and run commands on one thread, in order, so each is atomic and cheap. Then make every loss window (disk, replica lag, failover) explicit and tunable instead of hiding it.']
  ],
  fr: [
    'Accept commands over a socket and reply in order.',
    'Store and update typed values; give each key an optional expiry.',
    'Bound memory by evicting or refusing writes.',
    'Persist to disk and recover after a restart.',
    'Copy writes to replicas and let reads use them.',
    'Detect a dead primary and promote a replica.',
    'Split keys across primaries and redirect clients.',
    'Offer atomic multi-step updates, durable queues and fan-out messages.'
  ],
  nfr: [
    '<b>Latency:</b> O(1) commands answered in under 1 ms at p99 (a target to test, not a promise).',
    '<b>Bounded memory:</b> used memory stays at or under <code>maxmemory</code>, or writes are refused with an error.',
    '<b>Correctness:</b> each command is atomic; commands from one connection are applied and answered in order.',
    '<b>Durability:</b> with <code>appendfsync everysec</code>, loss is limited to about the last second of acknowledged writes.',
    '<b>Availability:</b> a primary failure is repaired by a promotion; with defaults the detection delay alone is 30 s.',
    '<b>Scalability:</b> capacity grows by adding primaries, not by raising one machine.'
  ],
  out: 'Installation, ACLs and TLS, modules (search, JSON, bloom), client library internals, and cloud-managed variants.',
  est: [
    ['How much RAM for the working set?', '20M sessions × 1 KB + 5M carts × 2 KB + 2M leaderboard members × ~100 B', '≈ 20 GB + 10 GB + 0.2 GB ≈ 30 GB of values, plus per-key overhead (assumed 50 to 100 B × 27M keys ≈ 1.4 to 2.7 GB).'],
    ['Can one thread keep up?', '170k commands/s ÷ ~100k simple commands/s per core (assumed, unpipelined, same-AZ)', 'About two primaries at minimum; pipelining and client batching raise the ceiling (feature 1).'],
    ['What does a snapshot cost?', 'fork copies page tables; time grows with resident memory (measure <code>latest_fork_usec</code>)', 'A 30 GB primary can pause for tens to hundreds of ms at fork on some hosts; write-heavy load then copies pages (feature 4).'],
    ['Is the replication backlog big enough?', 'write rate 5 MB/s × outage 60 s = 300 MB, against the default 1 MB', 'Default covers 0.2 s. Size the backlog from the longest outage you want to survive without a full resync (feature 5).'],
    ['How long to resync a replica?', '30 GB ÷ 1 Gbit/s (~125 MB/s) ≈ 240 s, before loading', 'A full resync is minutes of network and a load; avoid it with a bigger backlog.'],
    ['How many shards?', '30 GB ÷ 10 GB target per primary = 3 primaries (+ 1 replica each)', 'Slots split 0–5460 / 5461–10922 / 10923–16383 (feature 7).']
  ],
  hldNote: 'Select a box to open that feature. The data path runs left to right: client → event loop → data → memory policy → disk and replicas; Sentinel or Cluster sit beside it and decide who the primary is.',
  decisions: [
    ['One thread runs commands?', 'Yes: one executor, I/O threads optional (<code>io-threads</code>)', 'Atomicity and simplicity, at the price that one slow command blocks everyone.'],
    ['Replicate synchronously?', 'No: asynchronous, with <code>WAIT</code> as an opt-in', 'Low latency, at the price that an acknowledged write can be lost on failover.'],
    ['Evict by exact LRU?', 'No: sample a few keys (<code>maxmemory-samples 5</code>)', 'No per-key list to maintain, at the price of approximate victims.'],
    ['Snapshot by pausing?', 'No: <code>fork</code> and let the kernel copy-on-write', 'No long pause, at the price of extra memory while writes continue.']
  ],
  verify: [
    'Config defaults were read from <code>redis.conf</code>, <code>sentinel.conf</code> and <code>src/config.c</code> on the Redis 7.2 branch (raw files from github.com/redis/redis).',
    'Mechanisms named in a use case (expiry cycle constants, eviction pool size, dict resize ratio, flush order in <code>beforeSleep</code>, hash conversion direction, <code>WAITAOF</code> since 7.2.0, <code>CROSSSLOT</code>, <code>EXECABORT</code>) were located in the 7.2 source.',
    'Anything else (sizes, timings, throughput, durations such as an 80 ms <code>KEYS</code>) is an <b>example or assumption</b> and is labelled that way. Redis docs pages were not re-read for this build.',
    'Corrections to older notes: the hash listpack limit is <b>512</b> entries in 7.2 (older text says 128); active expiry repeats when more than <b>10%</b> of the sampled keys were stale (older text says 25%; 25% is the CPU cap).'
  ]
};

CourseData.features = [
  {
    id: 'proto', tag: 'event loop', name: 'Protocol and event loop',
    summary: 'How bytes become commands, why one executor makes every command atomic, and what one slow command costs everyone.',
    goal: 'Turn a TCP byte stream into complete commands and run them in order with low latency.',
    scope: [['RESP framing and the client query buffer', 'Pipelining', 'The single executor and what blocks it'], ['TLS, ACLs', 'Client library behaviour']],
    fr: ['Parse length-prefixed RESP frames from partial reads.', 'Run commands from all clients one at a time.', 'Queue replies per client and write when the socket is ready.'],
    nfr: ['A command runs at most once, and only when its frame is complete.', 'Per-client buffers are bounded (<code>client-query-buffer-limit</code> 1gb by default).', 'Latency of a command = queue wait + its own run time.'],
    hld: 'socket ──read──▶ query buffer ──parse──▶ command ──▶ EXECUTOR (1 thread) ──▶ output buffer ──write──▶ socket',
    decisions: [['Threads?', 'One executor', 'No locks, easy reasoning; CPU-bound commands cannot use more cores.'], ['Framing?', 'Length-prefixed RESP', 'Partial data is detectable; binary-safe; costs a few bytes per argument.']]
  },
  {
    id: 'data', tag: 'encodings', name: 'Data structures and encodings',
    summary: 'Typed values with compact encodings that switch to bigger ones at set thresholds, and a hash table that grows without a pause.',
    goal: 'Give O(1) or O(log N) operations per type while keeping small values cheap in memory.',
    scope: [['Hash, sorted set, and the main dict', 'Encoding thresholds', 'Incremental rehash'], ['Every type in detail', 'Module types']],
    fr: ['Pick an encoding per value from its size.', 'Look up a key in O(1).', 'Rank and range a sorted set in O(log N).'],
    nfr: ['Encoding is invisible to commands.', 'Resizing the key table adds no long pause.', 'Small collections use less memory than the large form.'],
    hld: 'keyspace dict ──▶ redisObject(type, encoding) ──▶ listpack | hashtable | skiplist+dict | intset | ...',
    decisions: [['Compact form?', 'listpack up to a limit', 'Less memory and good cache use; O(N) scan, so the limit stays small.'], ['Resize?', 'Two tables, move one bucket per operation', 'No long pause; briefly holds two tables.']]
  },
  {
    id: 'mem', tag: 'eviction', name: 'Expiry, eviction and the memory bound',
    summary: 'How keys leave: by TTL, by eviction under pressure, or by the server refusing writes.',
    goal: 'Keep memory at or under a limit without a global scan or a per-key list.',
    scope: [['TTL expiry (lazy and active)', '<code>maxmemory</code> and policies', 'Sampled LRU'], ['LFU tuning', 'Memory fragmentation']],
    fr: ['Hide and delete keys past their TTL.', 'Evict keys when over <code>maxmemory</code> if a policy allows.', 'Refuse growing commands when it does not.'],
    nfr: ['An expired key is never returned.', 'Expiry work is capped per cycle (about 25% of CPU).', 'Default policy is <code>noeviction</code>.'],
    hld: 'access ──▶ expireIfNeeded (lazy)     cron 10×/s ──▶ sample TTL keys (active)     before each command ──▶ over maxmemory? evict : OOM',
    decisions: [['Find expired keys?', 'Lazy on access plus sampled active sweep', 'No timer per key; a few expired keys linger in memory.'], ['Choose victims?', 'Sample 5 keys, keep a pool of 16', 'Cheap and good enough; not the exact oldest.']]
  },
  {
    id: 'persist', tag: 'persistence', name: 'Persistence: RDB and AOF',
    summary: 'Snapshots by fork and an append-only log, and the exact loss window each leaves.',
    goal: 'Recover the dataset after a restart with a bounded, known loss.',
    scope: [['RDB snapshot by fork', 'AOF append and fsync policy', 'AOF rewrite (7.0 multi-part)'], ['Backup tooling', 'Cloud snapshots']],
    fr: ['Write a point-in-time snapshot without stopping service.', 'Append every write to a log and fsync on a policy.', 'Compact the log without losing writes.'],
    nfr: ['Snapshot is consistent as of the fork.', 'Loss on crash is bounded by the fsync policy.', 'A crash during rewrite leaves a loadable AOF.'],
    hld: 'write ──▶ AOF buffer ──write()──▶ file ──fsync (always | everysec | no)       BGSAVE ──fork──▶ child ──▶ dump.rdb',
    decisions: [['Snapshot how?', 'fork + copy-on-write', 'No pause beyond the fork; memory can double under heavy writes.'], ['fsync when?', '<code>everysec</code> (default)', 'About a second of loss for most of the throughput.']]
  },
  {
    id: 'repl', tag: 'replication', name: 'Replication',
    summary: 'A replica applies the primary write stream; a backlog lets it catch up after a gap, and acknowledged writes can still be lost.',
    goal: 'Keep copies for failover and read scale with a cheap catch-up path.',
    scope: [['PSYNC and the backlog', 'Async acknowledgement', 'Offsets and WAIT'], ['Diskless internals', 'Chained replicas']],
    fr: ['Stream every write to replicas.', 'Resume after a gap without a full copy when possible.', 'Report replica progress as offsets.'],
    nfr: ['Replica lag is observable.', 'The primary never waits for replicas unless asked.', 'A full resync is rare and costly.'],
    hld: 'primary ──▶ replication stream + backlog(1 MB) ──▶ replica       replica ──REPLCONF ACK offset──▶ primary',
    decisions: [['Acknowledge writes?', 'Before replicas confirm', 'Low latency; failover can drop acknowledged writes.'], ['Catch up how?', 'Partial resync from backlog, else full RDB', 'Cheap when the backlog is large enough.']]
  },
  {
    id: 'ha', tag: 'sentinel', name: 'High availability with Sentinel',
    summary: 'Several Sentinels agree a primary is down, elect a leader, and promote a replica.',
    goal: 'Replace a failed primary without a human, and avoid two primaries.',
    scope: [['SDOWN, ODOWN, quorum', 'Election and replica choice', 'Split brain limits'], ['Cluster failover', 'Client library discovery details']],
    fr: ['Monitor a primary and its replicas.', 'Decide failure by quorum.', 'Elect one leader and promote the best replica.'],
    nfr: ['One leader per epoch.', 'Failover needs a majority of Sentinels.', 'Detection delay = <code>down-after-milliseconds</code> (30 s default).'],
    hld: 'Sentinel×3 ──PING──▶ primary, replicas     SDOWN ─quorum─▶ ODOWN ─majority vote─▶ leader ─▶ REPLICAOF NO ONE',
    decisions: [['Who decides?', 'An odd number of Sentinels', 'Tolerates a minority loss; needs three machines in separate failure domains.'], ['Data safety?', 'Not guaranteed', 'Async replication means writes after the last replicated offset are lost.']]
  },
  {
    id: 'cluster', tag: 'cluster', name: 'Sharding with Redis Cluster',
    summary: 'Every key maps to one of 16384 slots; nodes own slot ranges and redirect clients that ask the wrong one.',
    goal: 'Scale writes and memory by splitting the keyspace, with online resharding.',
    scope: [['Key to slot', 'MOVED and ASK', 'Multi-key rules and coverage'], ['Gossip internals', 'Cluster bus protocol']],
    fr: ['Map a key to a slot by a pure function.', 'Redirect a client that asks the wrong node.', 'Move slots between nodes while serving.'],
    nfr: ['Exactly one owner per slot.', 'Multi-key commands work only inside one slot.', 'By default the cluster stops if a slot has no owner.'],
    hld: 'key ──CRC16 mod 16384──▶ slot ──▶ owner node (client keeps a slot map; -MOVED corrects it)',
    decisions: [['Placement?', 'Fixed 16384 hash slots', 'Resharding moves whole slots; no consistent-hash ring to recompute.'], ['Coverage?', '<code>cluster-require-full-coverage yes</code>', 'Safe by default; one lost shard halts all queries.']]
  },
  {
    id: 'msg', tag: 'messaging', name: 'Transactions, streams and messaging',
    summary: 'What MULTI really guarantees, how a stream keeps a durable work queue, and why Pub/Sub can lose messages.',
    goal: 'Give clients atomic grouping and two ways to move messages between processes.',
    scope: [['MULTI/EXEC/WATCH', 'Streams with consumer groups', 'Pub/Sub'], ['Lua and Functions internals', 'Modules']],
    fr: ['Run a group of commands without interleaving.', 'Detect a concurrent change (WATCH).', 'Track delivered but unacknowledged messages.', 'Fan out a message to current subscribers.'],
    nfr: ['No rollback on a runtime error.', 'Stream entries survive until trimmed.', 'Pub/Sub is at-most-once.'],
    hld: 'MULTI queue ──EXEC──▶ run back to back       XADD ─▶ stream ─XREADGROUP─▶ PEL ─XACK       PUBLISH ─▶ connected subscribers',
    decisions: [['Transactions?', 'Queue then run, no rollback', 'Simple and fast; the client must handle partial failure.'], ['Messaging?', 'Two tools: log (stream) and broadcast (Pub/Sub)', 'Pick durability or simplicity per use.']]
  },
  {
    id: 'e2e', tag: 'end to end', name: 'End to end',
    summary: 'One write, followed through every layer, with the places it can be lost marked.',
    goal: 'Prove the parts fit by following a single <code>SET cart:42</code> from client to replica and disk.',
    scope: [['One write path', 'Where each loss window sits'], ['Failure injection']],
    fr: ['Route, parse, run, log, replicate and reply to one write.'],
    nfr: ['Each step is one of the earlier features; none is new.'],
    hld: 'client ▶ slot ▶ parse ▶ run ▶ AOF write() ▶ reply ▶ (async) fsync + replica',
    decisions: [['Reply when?', 'After execute and the AOF write(), not after fsync or replica ack', 'Fast; defines the two loss windows.']]
  }
];
