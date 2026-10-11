/* Use cases for features 1 to 3: partitioning and the token ring, coordinator and consistency levels, drivers and retries.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.ring = [
    {
      title: 'The token ring: who owns a key', short: 'token ring', animation: {
        kind: 'ring', nodes: ['A', 'B', 'C', 'D', 'E', 'F'], start: 4, rf: 3, tokenChoices: [1, 4, 16], key: 'seller-17', keys: ['seller-17', 'seller-42', 'order-9001']
      },
      intro: 'Hash a partition key, find the owner clockwise, then see how many tokens per node and a new node change who owns what. Try your own key, switch between 1, 4 and 16 tokens per node, and add a node.',
      trigger: 'The platform has 4 nodes and adds a fifth at peak. Orders are keyed by <code>seller_id</code> and every node must agree where seller 17 lives without asking anyone (toy token space 0 to 359; real tokens are 64-bit).',
      run: "SELECT token(seller_id), seller_id FROM orders WHERE seller_id = 'seller-17';\nnodetool getendpoints shop orders seller-17   -- the replica set\nDESCRIBE KEYSPACE shop;   -- replication factor, and whether tablets are on",
      expect: 'The same key always gives the same token and the same replicas. A new node takes only the arcs it claims, and many tokens per node make the arcs average out.',
      edges: [
        E('Few tokens, uneven ranges', 'With one token per node the arcs are random lengths, so one node can own several times more than another.', 'Use many vnodes per node, or tablets (the default for new keyspaces in current releases), so the balancer evens the load.'),
        E('Adding a node does not split a key', 'A new node takes over whole ranges. One partition key still lives together on its replicas.', 'If one key is the problem, change the key (next use case), not the node count.')
      ],
      invariant: 'Every node computes the same owner and replicas for a key from the token alone; one partition is never split between owners.',
      src: 'ScyllaDB docs: Ring Architecture, Murmur3 partitioner, vnodes, <code>nodetool getendpoints</code>. The animation uses a toy hash and token space.'
    },
    {
      title: 'A hot partition and bucketing', short: 'hot key', kind: 'hotkey',
      intro: 'Replication adds copies, not independent pieces of one key. See why one celebrity seller melts one core while the rest idle, and what a bucketed key changes.',
      trigger: 'During a flash sale, seller 17 receives 40,000 writes a second. Each core can take about 10,000 operations a second for this workload (example numbers). The partition key is <code>seller_id</code>.',
      run: "-- hot: every order of a seller is one partition\nPRIMARY KEY ((seller_id), order_id)\n-- bucketed: a hash bucket spreads one seller over 8 partitions\nPRIMARY KEY ((seller_id, bucket), order_id)",
      expect: 'The hot key saturates the single core that owns it. With 8 buckets the same traffic is 5,000 a second on each of 8 cores.',
      steps: [
        S('Evenly spread keys', 'With many different sellers the hash spreads the partitions evenly. Each of the 8 cores receives about 3,000 writes a second.', { rows: [3, 3, 3, 3, 3, 3, 3, 3], cap: 10, fan: 1 }, 'busiest core: 3,000/s'),
        S('The flash sale starts', 'Seller 17 now sends 40,000 writes a second. They all share one partition key, so they all hash to the same token and land on the same core of each of the 3 replicas.', { rows: [3, 3, 3, 3, 3, 3, 3, 43], cap: 10, fan: 1 }, 'busiest core: 43,000/s · over the limit'),
        S('More nodes do not help', 'Adding nodes moves other partitions around, but seller 17 is one partition. It stays on one core per replica, so the hot core is just as hot.', { rows: [2, 2, 2, 2, 2, 2, 2, 43], cap: 10, fan: 1, ghost: true }, 'busiest core: 43,000/s with more nodes'),
        S('Bucket the key', 'Put a bucket (a hash of the order id modulo 8) into the partition key: <code>(seller_id, bucket)</code>. Seller 17 now has 8 partitions, which hash to different cores.', { rows: [8, 8, 8, 8, 8, 8, 8, 8], cap: 10, fan: 8 }, 'busiest core: 8,000/s'),
        S('Reads pay for it', 'Reading all of a seller\'s orders now takes 8 partition reads, one per bucket. You trade a concentrated write load for a wider read.', { rows: [8, 8, 8, 8, 8, 8, 8, 8], cap: 10, fan: 8, cost: true }, 'one logical read = 8 partition reads'),
        S('Bound growth with time', 'A partition that grows for ever becomes a large partition, slow to repair and compact. Add a time bucket, such as the day, so each partition has a size you can predict.', { rows: [8, 8, 8, 8, 8, 8, 8, 8], cap: 10, fan: 8, time: true }, 'partition size bounded by day and bucket')
      ],
      edges: [
        E('A random bucket needs all buckets to read', 'If the bucket is random, a point lookup for one order must try every bucket.', 'Derive the bucket from a value the reader knows (for example the order id), so a point read goes to one bucket.'),
        E('A small partition can still be hot', 'Heat is about request rate, not size. A tiny key hit 40,000 times a second is a hot spot.', 'Watch per-shard CPU and per-partition request rates, not only <code>large_partitions</code>.')
      ],
      invariant: 'All rows with the same partition key share one token, so they share one core on each replica.',
      src: 'ScyllaDB docs: Ring Architecture, large partitions troubleshooting (<code>system.large_partitions</code>), data modelling guidance. Rates are examples.'
    },
    {
      title: 'From token to node to core', short: 'shard per core', kind: 'shardpath',
      intro: 'Inside a node, each CPU core owns its own slice of the tokens and shares nothing with the others. See how a key finds its core, and what a driver that knows this saves.',
      trigger: 'A client sends a write for <code>seller-17</code>. The node has 16 cores, each running one shard (example).',
      run: "nodetool describering shop    -- ring layout\n-- shard-aware drivers use the shard-aware port (19042 by default) to reach the owning shard\nSELECT shard_id FROM system.runtime_info LIMIT 1;   -- name varies, check your version",
      expect: 'The write reaches the owning core directly when the driver is shard-aware, and with one extra hop inside the node when it is not.',
      steps: [
        S('The key', 'The client has the partition key <code>seller-17</code>. Nothing has been placed yet.', { at: 0 }, 'key: seller-17'),
        S('Hash to a token', 'The Murmur3 partitioner turns the key into a 64-bit token. It is deterministic: every node and every driver gets the same number.', { at: 1 }, 'token: one 64-bit number'),
        S('Token to replicas', 'The token is looked up in the token ring (or the tablet map) to get the replica nodes, here 3 of them.', { at: 2 }, 'replicas: 3 nodes'),
        S('Token to one core', 'On each replica a fixed function maps the token to one shard. That core owns the data in memory and on disk and runs without locks, so no other core touches it.', { at: 3 }, 'one core per replica owns it'),
        S('A shard-unaware client', 'A client that connects to a random shard sends the request to the wrong core. That core must forward the request to the owner. It works, at the price of an extra hand-off and some CPU.', { at: 3, hop: true }, 'cross-shard hop on every miss'),
        S('A shard-aware client', 'A shard-aware driver connects to every shard of a node (using the shard-aware port), computes the token itself and sends the request on the connection that reaches the owning core. No hand-off.', { at: 4 }, 'direct to the owning core')
      ],
      edges: [
        E('Connections behind a proxy', 'A load balancer or proxy that hides the node breaks shard awareness: the driver cannot pick the connection.', 'Connect drivers straight to the nodes, or use a proxy that understands the shard-aware port.'),
        E('Uneven shards on one node', 'Even with a good key distribution one shard can run hotter because of a large or hot partition.', 'Compare per-shard CPU and per-shard request rates; a single hot shard points at the key, not the node.')
      ],
      invariant: 'A token maps to exactly one shard on each replica, and only that shard reads or writes its data.',
      src: 'ScyllaDB docs: shard-per-core architecture, shard-aware drivers (python-driver <code>scylla-specific</code> page), performance tips. Core count and port are the documented defaults to confirm for your version.'
    }
  ];

  CourseData.uc.coord = [
    {
      title: 'Quorum: when a read sees the latest write', short: 'quorum', animation: {
        kind: 'quorum', rf: 3, field: 'price', values: ['$100', '$90', '$80', '$70', '$60', '$50', '$40'],
        presets: [
          { label: 'QUORUM + QUORUM: always the latest', ops: [{ op: 'down', r: 2 }, { op: 'write', cl: 'QUORUM' }, { op: 'up', r: 2 }, { op: 'read', cl: 'QUORUM', from: 2 }] },
          { label: 'ONE + ONE: a stale read', ops: [{ op: 'down', r: 2 }, { op: 'write', cl: 'ONE' }, { op: 'up', r: 2 }, { op: 'read', cl: 'ONE', from: 2 }] },
          { label: 'ALL write with a replica down', ops: [{ op: 'down', r: 1 }, { op: 'write', cl: 'ALL' }, { op: 'write', cl: 'QUORUM' }] },
          { label: 'Repair closes the gap', ops: [{ op: 'down', r: 2 }, { op: 'write', cl: 'QUORUM' }, { op: 'up', r: 2 }, { op: 'read', cl: 'ONE', from: 2 }, { op: 'repair' }, { op: 'read', cl: 'ONE', from: 2 }] }
        ]
      },
      intro: 'Take replicas down, write and read at different levels, and watch which version each read returns. The rule is simple: if the replicas written plus the replicas read are more than RF, they must overlap.',
      trigger: 'An order\'s <code>price</code> is updated while one of its three replicas restarts. The write returns OK, the replica comes back, and support still sees two prices (illustrative).',
      run: "CONSISTENCY QUORUM;                       -- cqlsh\nUPDATE orders SET price = 90 WHERE id = 42;\nSELECT price FROM orders WHERE id = 42;   -- QUORUM read after a QUORUM write",
      expect: 'At QUORUM for both, the read always overlaps the write on at least one replica and returns the newest value. At ONE and ONE it can return a stale one.',
      edges: [
        E('Success does not mean every replica has it', 'A write that returns OK reached at least the level\'s number of replicas, not all of them.', 'Pick the level from the staleness you can accept, and run repair so lagging replicas converge.'),
        E('QUORUM is not linearizable', 'Concurrent writers are ordered by timestamp, and a read in the middle of a write can see either side.', 'For compare-and-set use lightweight transactions (SERIAL), which cost more round trips.')
      ],
      invariant: 'If the replicas written (W) plus the replicas read (R) exceed the replication factor, every read overlaps the newest acknowledged write.',
      src: 'ScyllaDB docs: Consistency levels (<code>cql/consistency</code>), Fault tolerance. The three-replica model is simplified; the overlap rule is exact.'
    },
    {
      title: 'The coordinator fans out and waits for a level', short: 'coordinator', kind: 'fanout',
      intro: 'The node that receives a request sends it to every replica at once and answers as soon as enough replies arrive. See what a slow or dead replica does to latency.',
      trigger: 'A client sends a write at <code>QUORUM</code> with RF=3. Replica C is slow, and later one run has C down (example timings).',
      run: "CONSISTENCY QUORUM;\nINSERT INTO orders (id, price) VALUES (42, 90);\nTRACING ON;   -- shows which replicas replied and when",
      expect: 'The client gets OK after the second acknowledgement, without waiting for the slowest replica.',
      steps: [
        S('A write at QUORUM', 'The client sends the write to a coordinator, any node. It needs 2 of 3 acknowledgements.', { k: 1 }, 'need 2 of 3'),
        S('Fan out to all replicas', 'The coordinator computes the replica set from the token and sends the mutation to all three in parallel. It does not send to two and hope.', { k: 2 }, 'sent to A, B and C'),
        S('Acknowledgements arrive', 'Replicas A and B apply the write and reply quickly. C is slow.', { k: 3 }, 'acks: A, B'),
        S('Reply at the second ack', 'Two acknowledgements are enough for QUORUM, so the coordinator answers the client now. The slowest replica does not set the latency.', { k: 4 }, 'client has OK · C still working'),
        S('The late ack', 'C finishes later and its acknowledgement arrives after the reply. All three replicas now have the write.', { k: 5 }, 'all 3 replicas applied'),
        S('If C is down', 'When C does not answer, the coordinator stores a hint for it (up to the hint window) and still answers at QUORUM. C catches up later from the hint or from repair.', { k: 6, down: true }, 'OK at QUORUM · hint stored for C')
      ],
      edges: [
        E('Two replicas slow', 'If two of three are slow, QUORUM waits for one of them, and the request times out if neither answers in time.', 'Watch per-replica latency and fix the slow nodes; do not raise timeouts to hide it.'),
        E('A coordinator is also a replica', 'The coordinator CPU is spent on both roles, so a poorly routed request costs extra work on the coordinator.', 'Use token-aware drivers (feature 3) so the coordinator is usually a replica.')
      ],
      invariant: 'The coordinator sends to every replica and answers when the number of acknowledgements equals the level, no earlier and no later.',
      src: 'ScyllaDB docs: Consistency levels, Hinted handoff (hints for down replicas), tracing.'
    },
    {
      title: 'Two datacenters: QUORUM against LOCAL_QUORUM', short: 'datacenters', kind: 'dcs',
      intro: 'With two datacenters a global quorum has to cross the WAN, and it fails when a whole datacenter is lost. See why most traffic uses a local level.',
      trigger: 'Two datacenters hold RF=3 each, six replicas in total. DC2 loses its network (example).',
      run: "CREATE KEYSPACE shop WITH replication = {'class': 'NetworkTopologyStrategy', 'dc1': 3, 'dc2': 3};\nCONSISTENCY LOCAL_QUORUM;",
      expect: 'LOCAL_QUORUM in DC1 keeps working with DC2 gone. A global QUORUM needs 4 of 6 replicas and fails with only 3 left.',
      steps: [
        S('Six replicas', 'Each datacenter holds three replicas of every partition. A global QUORUM is ⌊6/2⌋ + 1 = 4 replicas.', { dc1: ['up', 'up', 'up'], dc2: ['up', 'up', 'up'], cl: 'QUORUM needs 4 of 6', out: 'waits for replicas in both datacenters', cls: 'warn' }, 'QUORUM = 4 of 6'),
        S('QUORUM crosses the WAN', 'To reach 4 acknowledgements at least one must come from the other datacenter. Every write pays the inter-datacenter round trip.', { dc1: ['ack', 'ack', 'ack'], dc2: ['up', 'up', 'up'], cl: 'QUORUM needs 4 of 6', out: 'waits for the WAN: 4th ack from DC2', cls: 'warn' }, 'latency includes the WAN'),
        S('LOCAL_QUORUM stays local', 'LOCAL_QUORUM needs 2 of the 3 replicas in the coordinator\'s datacenter. Two local acknowledgements are enough, so no WAN wait.', { dc1: ['ack', 'ack', 'up'], dc2: ['up', 'up', 'up'], cl: 'LOCAL_QUORUM needs 2 of 3 in DC1', out: 'OK after 2 local acks', cls: 'ok' }, 'no WAN wait'),
        S('DC2 is lost', 'DC2 is unreachable. LOCAL_QUORUM in DC1 is unaffected: it never needed DC2.', { dc1: ['ack', 'ack', 'up'], dc2: ['down', 'down', 'down'], cl: 'LOCAL_QUORUM needs 2 of 3 in DC1', out: 'OK: DC1 alone is enough', cls: 'ok' }, 'DC1 serves on'),
        S('A global QUORUM now fails', 'Only 3 replicas are up and QUORUM needs 4. The coordinator sees this and answers unavailable without sending the write.', { dc1: ['up', 'up', 'up'], dc2: ['down', 'down', 'down'], cl: 'QUORUM needs 4 of 6', out: 'UNAVAILABLE: 3 live, 4 needed', cls: 'bad' }, 'QUORUM unavailable'),
        S('DC2 catches up later', 'DC2 missed the writes. Hints cover short outages; after a longer one repair brings DC2 back in line. Reads in DC2 meanwhile can be stale unless they use a stronger level.', { dc1: ['up', 'up', 'up'], dc2: ['up', 'up', 'up'], cl: 'LOCAL_QUORUM in each datacenter', out: 'DC2 converges by hints and repair', cls: 'ok' }, 'convergence by hints and repair')
      ],
      edges: [
        E('LOCAL levels hide cross-datacenter staleness', 'A write at LOCAL_QUORUM in DC1 is asynchronously applied in DC2, so a read in DC2 right after it may be stale.', 'If both datacenters must agree, use EACH_QUORUM for writes (it waits for a quorum in every datacenter) and accept the latency.'),
        E('Wrong datacenter name', 'LOCAL levels use the coordinator\'s datacenter name. A driver configured with the wrong local datacenter sends traffic across the WAN.', 'Set the driver\'s local datacenter explicitly and check it against <code>nodetool status</code>.')
      ],
      invariant: 'A LOCAL level counts only replicas in the coordinator\'s datacenter, so it never waits on another datacenter.',
      src: 'ScyllaDB docs: Consistency levels (<code>LOCAL_QUORUM</code>, <code>EACH_QUORUM</code>), Multi-datacenter replication (<code>NetworkTopologyStrategy</code>).'
    }
  ];

  CourseData.uc.route = [
    {
      title: 'Token-aware routing skips a hop', short: 'token-aware', kind: 'routing',
      intro: 'A request sent to a random node must be forwarded to a replica. A driver that computes the token sends it to a replica directly.',
      trigger: 'A service issues 20,000 reads a second against a 12-node cluster. The driver is a plain round-robin policy, then a token-aware one (example).',
      run: "# Python driver, token-aware policy wrapped around the DC-aware policy\nfrom cassandra.policies import TokenAwarePolicy, DCAwareRoundRobinPolicy\nprofile = ExecutionProfile(load_balancing_policy=TokenAwarePolicy(DCAwareRoundRobinPolicy(local_dc='dc1')))",
      expect: 'About 3 out of 4 round-robin requests need an extra forward with RF=3 on 12 nodes. With token awareness the first node is a replica.',
      steps: [
        S('A request without routing', 'The client picks any node, X, as coordinator. With RF=3 on 12 nodes X is a replica for only a quarter of the keys.', { mode: 'blind', n: 1 }, 'coordinator chosen at random'),
        S('The coordinator forwards', 'X is not a replica for this key, so it sends the request to one that is. That is a second network hop and CPU spent on X for nothing.', { mode: 'blind', n: 2 }, '2 hops out'),
        S('The reply returns the same way', 'The replica answers X, and X answers the client: four messages for one read.', { mode: 'blind', n: 4 }, '4 messages'),
        S('A token-aware driver', 'The driver knows the ring (or the tablet map) and gets the partition key from the prepared statement. It computes the token and picks a replica as coordinator.', { mode: 'aware', n: 1 }, 'coordinator is a replica'),
        S('One hop each way', 'The coordinator is also a replica, so it serves the read locally. Two messages, less CPU on the cluster.', { mode: 'aware', n: 2 }, '2 messages'),
        S('Why prepared statements matter', 'The driver only knows which parameter is the partition key from a prepared statement. A statement built as a string cannot be routed, and falls back to a random coordinator.', { mode: 'aware', n: 2, prepared: true }, 'prepare, then bind')
      ],
      edges: [
        E('Stale topology in the driver', 'The driver caches the ring. After a node is added it may still route to the old owner until it refreshes.', 'Keep topology events enabled, and let the cluster forward the request when the guess is wrong; it still works, only slower.'),
        E('Batches across partitions', 'A multi-partition batch has no single replica set, so it goes to one coordinator which fans out.', 'Keep batches to one partition, or send separate async requests per partition.')
      ],
      invariant: 'The driver chooses a coordinator that is a replica of the partition when it can compute the token; otherwise the cluster forwards.',
      src: 'ScyllaDB docs: Shard-aware drivers, Performance tips (use prepared statements and token-aware policies), python-driver <code>scylla-specific</code> page.'
    },
    {
      title: 'A timeout storm: retries multiply load', short: 'retry storm', kind: 'amp',
      intro: 'A slow cluster makes clients time out, and each retry adds load to a cluster that is already slow. See how fast it feeds itself.',
      trigger: 'Clients send 10,000 requests a second and retry a timed-out request up to 3 times. The replicas can take 15,000 a second (example numbers).',
      run: "SELECT * FROM system_traces.sessions LIMIT 5;   -- which requests are retried\n# driver: bounded retries, exponential backoff, only for idempotent statements",
      expect: 'Load on the replicas is 10,000 × (1 + p + p² + p³), where p is the share of attempts that time out. It crosses capacity near p = 0.35 and then keeps growing.',
      steps: [
        S('Healthy', 'Almost nothing times out, so p is close to 0 and each user request is one attempt. Load is 10,000 a second.', { p: 0, amp: 1, load: 10000 }, 'p = 0 · 1.00× · 10,000/s'),
        S('A few timeouts', 'A brief slowdown makes 20% of attempts time out. Each of those is retried, and some of the retries time out too: 1 + 0.2 + 0.04 + 0.008 = 1.25× the load.', { p: 0.2, amp: 1.248, load: 12480 }, 'p = 0.2 · 1.25× · 12,480/s'),
        S('Over capacity', 'At 40% timeouts the factor is about 1.62 and the load is 16,200 a second, past the 15,000 capacity. The cluster slows further.', { p: 0.4, amp: 1.624, load: 16240 }, 'p = 0.4 · 1.62× · 16,240/s'),
        S('The feedback', 'More load means more timeouts, which means more retries. At 50% the factor is 1.875 and at 90% it is 3.44: 34,400 requests a second against a cluster that handles 15,000.', { p: 0.9, amp: 3.439, load: 34390 }, 'p = 0.9 · 3.44× · 34,390/s'),
        S('The server also works on timed-out requests', 'A request the client has given up on may still be running on the replicas. The cluster does work nobody waits for, so useful throughput falls while load rises.', { p: 0.9, amp: 3.439, load: 34390, waste: true }, 'work done for abandoned requests'),
        S('Break the loop', 'Retry only idempotent statements, at most 1 or 2 times, with exponential backoff and jitter, and add a client-side limit on concurrent requests. Shed load early instead of retrying it.', { p: 0.2, amp: 1.248, load: 12480, fixed: true }, 'bounded retries with backoff')
      ],
      edges: [
        E('Server-side and client-side timeouts nest', 'If the client timeout is shorter than the server one, the client retries while the first attempt still runs.', 'Keep the client timeout longer than the server request timeout, so the server answers first.'),
        E('Speculative execution doubles reads on purpose', 'A speculative retry sends a second copy of a read after a delay to a different replica.', 'Use it only for idempotent reads, with a delay near the 99th percentile, and watch the extra load.')
      ],
      invariant: 'With r retries and a timeout share p, the load factor is the sum of p to the power i for i from 0 to r.',
      src: 'ScyllaDB docs: Troubleshooting timeouts, driver retry and speculative execution policies. The formula is arithmetic; the capacity numbers are examples.'
    },
    {
      title: 'A timeout means unknown, not failed', short: 'idempotent retries', kind: 'idem',
      intro: 'When a write times out the client does not know if it was applied. A retry is only safe when applying the same statement twice gives the same state.',
      trigger: 'A write at QUORUM times out after the coordinator sent it to three replicas. The client retries (example).',
      run: "INSERT INTO orders (id, status) VALUES (42, 'paid');          -- safe to retry\nUPDATE counters SET hits = hits + 1 WHERE id = 42;          -- not safe",
      expect: 'A timed-out write may already be applied on some replicas, so retry only statements that are idempotent.',
      steps: [
        S('A timeout is ambiguous', 'The coordinator sent the mutation to three replicas and did not hear back from enough in time. Some replicas may have applied it. The client sees only a timeout.', { upto: 0 }, 'outcome: unknown'),
        S('An INSERT or UPDATE by key', 'Writing the same values to the same primary key again overwrites the same cell. The retry carries a newer timestamp but the same data, so the final state is the same.', { upto: 1 }, 'safe to retry'),
        S('SET to a fixed value', '<code>UPDATE ... SET status = \'shipped\'</code> is also the same cell with the same value. Safe.', { upto: 2 }, 'safe to retry'),
        S('A counter update', '<code>hits = hits + 1</code> adds on every replica that gets it. If the first attempt landed and the retry lands too, the counter is off by one.', { upto: 3 }, 'NOT safe: counted twice'),
        S('A list append', 'Appending to a list adds an element each time, so a retry can add it twice.', { upto: 4 }, 'NOT safe: duplicate element'),
        S('A conditional insert', '<code>INSERT ... IF NOT EXISTS</code> is a lightweight transaction. A retry after an unknown outcome can return "not applied" because the first attempt did apply, so the client has to read to find out.', { upto: 5 }, 'safe, but read the result')
      ],
      edges: [
        E('Mark statements idempotent in the driver', 'Many drivers only retry statements they are told are idempotent, and refuse otherwise.', 'Set the idempotent flag per statement, only where it is true, so the retry policy can act.'),
        E('Client-provided timestamps', 'Retrying with the same client timestamp makes the retry an exact duplicate cell, not a newer one.', 'Use a fixed timestamp for the retried write when order against other writers matters.')
      ],
      invariant: 'A retry after a timeout is safe only if applying the statement once or twice leaves the same state.',
      src: 'ScyllaDB docs: Timeouts troubleshooting, CQL INSERT and UPDATE, driver idempotence flags (python-driver docs).'
    }
  ];
})();
