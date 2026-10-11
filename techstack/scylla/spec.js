/* Spec for the ScyllaDB system-design course: overview, problem, requirements, estimates, high-level design, and the per-feature specs.
 * Facts target ScyllaDB 2025.x (the docs branch stable / 2025.2). See spec.verify for what was and was not re-read. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  id: 'scylla', name: 'ScyllaDB', version: '2025.x', root: '../../', brand: '#2f6fed'
};
CourseData.spec = {
  version: '2025.x',
  title: 'Design a leaderless wide-column store',
  navTitle: 'Leaderless wide-column store',
  lead: 'Start from an order platform that takes 30,000 writes a second, keeps three copies of every row, and must stay up while machines die and new ones join. Work out what the system has to do and how it is built, then walk each feature through the use cases that decide whether it behaves in production.',
  overview: [
    '<b>What it is.</b> ScyllaDB stores rows grouped by a partition key. A hash of that key (a token) decides which nodes own the row, and every node can compute that alone, so there is no master for data. Each node writes to an append-only commitlog and a sorted in-memory table, then to immutable files that background compaction merges. It speaks CQL and is shard-per-core: each CPU core owns its own slice of the data and runs without locks.',
    '<b>Who does what.</b> Any node can be the coordinator for a request: it finds the replicas from the token, sends the operation to all of them, and answers when enough have replied (the consistency level). Replicas apply writes locally and merge versions by timestamp. Repair and hints bring lagging replicas back. Cluster metadata (schema, topology, the tablet map) is the one thing that needs agreement, and it is kept by a Raft group.'
  ],
  problem: [
    ['<b>Scenario</b>', 'A marketplace takes 30,000 orders a second, keeps each order for 7 days, and a flash sale makes one seller account receive 40,000 writes a second on its own (example numbers). Machines fail weekly and capacity must grow at peak without a maintenance window.'],
    ['<b>Naive design</b>', 'One primary database per shard of customers, with a failover pair, a lock per row, and a rebalance job run by an operator when a node is added.'],
    ['<b>Fails when</b>', 'The primary dies and writes stop until a failover completes. A hot seller sits on one primary whatever you add. Moving data pauses traffic, and a replica that missed a delete later brings the row back.'],
    ['<b>Principle</b>', 'No node is special for data: hash the key to find its owners, accept writes on any copy, and let the client choose how many copies must answer. Never edit data in place: append, merge by timestamp, and treat a delete as data that must be spread before it can be forgotten.']
  ],
  fr: [
    'Map each partition key to a set of replica nodes without asking a directory.',
    'Accept a request on any node and answer after a chosen number of replicas reply.',
    'Route requests from the client straight to a replica, and to the right core.',
    'Make a write durable and visible quickly without editing files in place.',
    'Answer a read by merging memory and files, skipping files that cannot hold the key.',
    'Merge files in the background so reads stay cheap and disk space is reclaimed.',
    'Delete data so that every replica agrees, and never bring a deleted row back.',
    'Add and remove capacity while serving, and keep cluster metadata consistent.'
  ],
  nfr: [
    '<b>Availability:</b> with RF=3, reads and writes at <code>QUORUM</code> keep working with one replica down.',
    '<b>Consistency:</b> a read at a level where R + W is greater than RF sees the newest acknowledged write.',
    '<b>Write latency:</b> a write is a sequential commitlog append plus a memory insert, with no read of existing data (a target to test, not a promise).',
    '<b>Bounded read cost:</b> the files a read touches stay few (compaction) and filters skip the rest.',
    '<b>Deletes stay deleted:</b> a tombstone is kept at least <code>gc_grace_seconds</code> (10 days by default) and repair must run within it.',
    '<b>Elasticity:</b> capacity changes move only the affected ranges, and metadata changes need a majority.'
  ],
  out: 'Installation and sizing guides, security and authentication, materialized views and secondary indexes, CDC, lightweight transactions in depth, Alternator (DynamoDB API), and cloud-managed variants.',
  est: [
    ['How much disk for the cluster?', '30,000 writes/s × 1 KB = 30 MB/s ≈ 2.6 TB/day. Keep 7 days × RF 3 ≈ 55 TB. Stay near 50% disk use for compaction headroom (assumed row size)', 'About 110 TB of disks, so 12 nodes of 10 TB (feature 6).'],
    ['What does one node take?', '30,000 × 3 copies ÷ 12 nodes ≈ 7,500 replica writes/s per node, over 16 shards ≈ 470 per shard (assumed 16 cores)', 'Well inside one core\'s budget when keys are spread; one hot key is not (feature 1).'],
    ['What is a quorum?', 'RF 3, QUORUM = ⌊3/2⌋ + 1 = 2. Read 2 + write 2 = 4 > 3', 'One replica can be down for reads and writes at QUORUM (feature 2).'],
    ['How long can a replica be down for hints to cover it?', '<code>max_hint_window_in_ms</code> = 3 hours by default', 'Longer than 3 hours means repair, not hints, must close the gap (feature 7).'],
    ['How often must repair run?', '<code>gc_grace_seconds</code> = 864,000 s = 10 days', 'A full repair at least every 7 days leaves a safety margin before tombstones can be purged (feature 7).'],
    ['How many voters does metadata need?', 'If every node is a voter: 12 nodes, majority = 7', 'Schema and topology changes stop if 6 nodes are unreachable, while row traffic may carry on (feature 9).']
  ],
  hldNote: 'Select a box to open that feature. The data path runs left to right: client driver → coordinator → replicas → commitlog and memtable → SSTables and compaction. Tombstones and repair, tablets and Raft sit beside it.',
  decisions: [
    ['Who owns data?', 'No owner node: a hash of the key places it on RF nodes', 'No failover for data and no directory, at the price that hot keys cannot be split across nodes.'],
    ['Edit files in place?', 'No: append and merge by timestamp, compact later', 'Fast writes and simple recovery, at the price of read and space amplification.'],
    ['Be strongly consistent?', 'Per request: the client picks the consistency level', 'Availability when you can accept it, at the price that weak levels can read stale data.'],
    ['Keep metadata the same way?', 'No: schema, topology and the tablet map go through Raft', 'One agreed history of cluster changes, at the price that they need a majority.']
  ],
  verify: [
    'Defaults used in the text (<code>gc_grace_seconds</code> 864000, <code>max_hint_window_in_ms</code> 3 hours, batch warn and fail thresholds 128 and 1024 kB, quorum arithmetic) match the ScyllaDB docs pages for consistency, hinted handoff, DDL table options, batch and Raft. They were written from those pages by knowledge and were not re-fetched in this build.',
    'Where a default varies by version or table type (the tombstone GC mode, timeouts, commitlog sync period, tablet size targets, compaction thresholds), the text gives an example and says to check <code>scylla.yaml</code>, the table options, or the docs for your release.',
    'The token ring, quorum, Raft and LSM animations are simplified models: a toy 0 to 359 token space, a three-replica value, a five-node Raft without timers or pre-vote, and a memtable of three cells. The mechanisms (clockwise ownership, newest-timestamp-wins, majority commit, immutable files merged by compaction) are the real ones.',
    'Everything else (sizes, rates, latencies, node counts, durations) is an <b>example or assumption</b> and is labelled that way.'
  ]
};

CourseData.features = [
  {
    id: 'ring', tag: 'partitioning', name: 'Partitioning and the token ring',
    summary: 'A hash of the partition key places a row on a set of nodes that every node can compute, and one key always stays together.',
    goal: 'Place each partition on RF nodes with no directory, spread load evenly, and stay together for one key.',
    scope: [['Murmur3 token, ring ownership, vnodes', 'Hot partitions and bucketing', 'Shard per core'], ['Rack and datacenter placement details', 'Secondary indexes']],
    fr: ['Hash a partition key to a token.', 'Find the owner and the other replicas from the token.', 'Map the token to one core on each replica.'],
    nfr: ['The same key always maps to the same token and replicas.', 'Adding a node moves only the ranges it takes over.', 'All rows of one partition live together on each replica.'],
    decisions: [['How many token positions per node?', 'Many (vnodes) or tablets', 'Load averages out; metadata grows.'], ['Split a hot key across nodes?', 'No: choose a key that spreads writes', 'Simple and local, at the price that a poor key makes a hot spot.']]
  },
  {
    id: 'coord', tag: 'consistency', name: 'Coordinator and consistency levels',
    summary: 'Any node coordinates: it sends to every replica in parallel and waits for as many as the consistency level asks.',
    goal: 'Let the client trade latency and availability against freshness per request.',
    scope: [['Replication factor and quorum', 'ONE, QUORUM, ALL and the LOCAL levels', 'Read repair'], ['Lightweight transactions', 'Counters']],
    fr: ['Send each write to every replica in parallel.', 'Reply after the number of acknowledgements the level needs.', 'Merge replica answers on read by timestamp.'],
    nfr: ['R + W greater than RF guarantees a read sees the latest acknowledged write.', 'A level that cannot be met fails fast as unavailable.', 'LOCAL levels never wait for another datacenter.'],
    decisions: [['Wait for all replicas?', 'No: wait for the level only', 'Low latency and survival of a slow replica, at the price of temporary inconsistency.'], ['One global quorum or one per datacenter?', 'LOCAL_QUORUM for most traffic', 'No cross-datacenter wait, at the price that the other datacenter lags.']]
  },
  {
    id: 'route', tag: 'clients', name: 'Drivers, timeouts and retries',
    summary: 'Token-aware and shard-aware drivers skip hops, and unbounded retries turn a slow cluster into a dead one.',
    goal: 'Send each request to a replica, and keep a failing cluster from being buried by its own clients.',
    scope: [['Token-aware and shard-aware routing', 'Timeouts and retry amplification', 'Idempotent retries'], ['Driver configuration per language']],
    fr: ['Compute the token on the client from the prepared statement.', 'Retry only what is safe, with a bound and backoff.', 'Treat a timeout as unknown, not as failure.'],
    nfr: ['A request takes the fewest hops.', 'Retries multiply load by a bounded factor.', 'A retried statement must give the same final state.'],
    decisions: [['Retry on timeout?', 'Only idempotent statements, bounded and with backoff', 'Recovers from blips, at the price of extra load when the cluster is slow.'], ['Route by token?', 'Yes, from the client', 'Fewer hops and less coordinator CPU, at the price of driver support.']]
  },
  {
    id: 'write', tag: 'write path', name: 'Replica write path',
    summary: 'A write is a commitlog append and a memtable insert; files are only ever created, never edited.',
    goal: 'Make a write durable and fast without reading or rewriting existing data.',
    scope: [['Commitlog and sync modes', 'Memtable and flush', 'Memory pressure'], ['Batch semantics', 'Materialized views']],
    fr: ['Append every write to the commitlog.', 'Insert into the memtable sorted by key.', 'Flush a full memtable to an immutable SSTable.'],
    nfr: ['A write never reads existing data.', 'A crash is repaired by replaying the commitlog.', 'Writes slow down before memory runs out.'],
    decisions: [['Acknowledge before or after fsync?', 'Periodic sync by default: acknowledge first', 'Low latency, at the price of a window on a single node that replication covers.'], ['Edit in place?', 'No: immutable SSTables', 'No random writes and simple recovery, at the price of compaction.']]
  },
  {
    id: 'read', tag: 'read path', name: 'Read path',
    summary: 'A read merges the memtable and every file that may hold the key, and Bloom filters let it skip the rest.',
    goal: 'Answer a point read with few disk reads even though data is spread across files.',
    scope: [['Bloom filters, index, merge by timestamp', 'Row cache and BYPASS CACHE'], ['Range scan internals', 'Paging']],
    fr: ['Check each SSTable filter before reading it.', 'Merge cells from all sources and keep the newest.', 'Serve hot rows from the cache.'],
    nfr: ['A key that is not in a file costs no read of that file (up to the false-positive rate).', 'The newest timestamp wins.', 'A scan must not wash the cache.'],
    decisions: [['Per-file filter?', 'Bloom filter sized by <code>bloom_filter_fp_chance</code>', 'Skips files cheaply, at the price of memory and rare false positives.'], ['Cache scans?', 'Only if asked: BYPASS CACHE for scans', 'Hot rows stay cached, at the price of remembering to use it.']]
  },
  {
    id: 'compact', tag: 'compaction', name: 'Compaction',
    summary: 'Background merges keep the number of files per read small and reclaim overwritten data, at a cost in I/O and temporary space.',
    goal: 'Keep reads cheap and disk use bounded without stopping writes.',
    scope: [['Size-tiered, leveled and time-window strategies', 'Space headroom'], ['Incremental compaction', 'Tuning every parameter']],
    fr: ['Merge SSTables and drop overwritten cells.', 'Choose a strategy that fits the workload.', 'Keep room to write the output before deleting the inputs.'],
    nfr: ['Compaction cannot fall behind flushes for long.', 'Output is written before inputs are deleted.', 'Disk use stays under the headroom you planned.'],
    decisions: [['Which strategy?', 'By workload: STCS for write-heavy, LCS for read-heavy, TWCS for time series', 'Each trades write, read and space amplification differently.'], ['How much free disk?', 'Plan for the largest merge', 'Safety, at the price of unused disk.']]
  },
  {
    id: 'tomb', tag: 'deletes and repair', name: 'Deletes, tombstones and repair',
    summary: 'A delete is a marker that must reach every replica before it can be forgotten, and repair is what spreads it.',
    goal: 'Make deletes final across replicas without growing reads for ever.',
    scope: [['Tombstones and TTL', 'gc_grace_seconds', 'Hinted handoff and repair'], ['Counter and collection tombstones']],
    fr: ['Write a tombstone with a timestamp for a delete or an expired TTL.', 'Keep it long enough for repair to spread it.', 'Purge it only when it is safe.'],
    nfr: ['A tombstone is kept at least <code>gc_grace_seconds</code> (864,000 s).', 'Hints cover at most 3 hours of downtime by default.', 'Repair must complete within the grace window.'],
    decisions: [['Forget a delete after how long?', 'After gc_grace_seconds, tied to repair in repair mode', 'Bounded tombstone growth, at the price of a repair duty.'], ['Queue pattern?', 'Avoid: delete-heavy partitions', 'Reads stay fast, at the price of a different data model.']]
  },
  {
    id: 'tablets', tag: 'elasticity', name: 'Tablets and elastic scaling',
    summary: 'Tables are cut into tablets with their own replica sets, so a balancer can move small ranges while traffic flows.',
    goal: 'Add or remove nodes at peak by moving only the ranges that need to move.',
    scope: [['The tablet map', 'Migration stages', 'Split and merge'], ['Vnode streaming', 'Rack-aware placement rules']],
    fr: ['Keep a map from token range to replica set.', 'Move a tablet from one node to another.', 'Split big tablets and merge small ones.'],
    nfr: ['Traffic continues during a move.', 'No acknowledged write is lost in a move.', 'A single partition is never split.'],
    decisions: [['Move whole nodes or ranges?', 'Tablets: small ranges', 'Fast, incremental rebalancing, at the price of a map in metadata.'], ['Who decides?', 'A load balancer through Raft', 'One agreed map, at the price of needing group 0.']]
  },
  {
    id: 'raft', tag: 'metadata consensus', name: 'Raft for cluster metadata',
    summary: 'Schema, topology and the tablet map change through one Raft group, so there is a single agreed history.',
    goal: 'Keep cluster metadata consistent when nodes crash and networks split, without slowing row traffic.',
    scope: [['Leader election, log replication and majority commit', 'What goes through group 0 and what does not'], ['Raft internals such as snapshots and membership change']],
    fr: ['Elect one leader per term.', 'Commit a metadata change only after a majority stores it.', 'Keep row reads and writes off this path.'],
    nfr: ['At most one leader per term.', 'A committed entry is never lost or changed.', 'A side without a majority cannot change metadata.'],
    decisions: [['How to agree on metadata?', 'Raft, one group for all nodes', 'A single history, at the price that changes need a majority.'], ['Put data writes through Raft too?', 'No: coordinator and consistency level', 'Scale and availability, at the price of per-request consistency choices.']]
  }
];
