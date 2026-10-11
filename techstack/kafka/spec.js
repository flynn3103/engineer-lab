/* Spec for the Apache Kafka system-design course: overview, problem, requirements, estimates, high-level design, and the per-feature specs.
 * Facts target Apache Kafka 4.0 (KRaft only); defaults that changed from 3.x are marked. See spec.verify for what was and was not re-read. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  id: 'kafka', name: 'Apache Kafka', version: '4.0', root: '../../', brand: '#4a5568'
};
CourseData.spec = {
  version: '4.0',
  title: 'Design a distributed event log',
  navTitle: 'Distributed event log',
  lead: 'Start from an order platform that must hand 50,000 events a second to twelve teams, in order, with no loss and no duplicates when a broker fails. Work out what the system has to do and how it is built, then walk each feature through the use cases that decide whether it behaves in production.',
  overview: [
    '<b>What it is.</b> Kafka stores records in topics. A topic is split into partitions, and each partition is an append-only log on disk made of segment files. A record is addressed by its partition and offset. Reading never deletes: every consumer group keeps its own position, so twelve teams can read the same data independently, and data is removed only by retention or compaction.',
    '<b>Who does what.</b> A producer batches records and sends them to the leader broker of the partition. Followers copy from the leader, and the set of followers that are caught up (the ISR) decides when a record is committed. Consumers in a group split the partitions among themselves, coordinated by a group coordinator. A KRaft quorum of controllers keeps cluster metadata, including who leads each partition, in its own replicated log.'
  ],
  problem: [
    ['<b>Scenario</b>', 'An online shop produces 50,000 order events a second (about 1 KB each). Billing, search, fraud, shipping and eight other teams each need every event, in order per order, replayable for 7 days, while brokers get patched and sometimes die (example numbers).'],
    ['<b>Naive design</b>', 'A queue per consumer, with the broker deleting a message when it is acknowledged, and one primary node per queue.'],
    ['<b>Fails when</b>', 'A new team cannot read history. Twelve queues multiply the write load by twelve. A slow consumer fills the broker. The primary dies and either loses acknowledged messages or stops until someone promotes a replacement.'],
    ['<b>Principle</b>', 'Keep one durable, ordered log per partition and let each reader own a position in it. Make a record committed only when every in-sync replica has it, and keep the set of in-sync replicas explicit, so a failover can never promote a copy that is missing committed data.']
  ],
  fr: [
    'Append records to a partition in order and read them back by offset.',
    'Route records by key so that records for one key stay in order.',
    'Batch and retry producer sends without losing or duplicating records.',
    'Replicate every partition and elect a new leader without losing committed records.',
    'Let each consumer group read independently and resume from its committed offset.',
    'Share a topic\'s partitions among the members of a group and rebalance when they change.',
    'Bound disk use by time, size or by keeping only the latest value per key.',
    'Write to several partitions and commit consumer offsets atomically, and keep metadata consistent.'
  ],
  nfr: [
    '<b>Order:</b> records in one partition are read in the order they were written; there is no order across partitions.',
    '<b>Durability:</b> a record acknowledged with <code>acks=all</code> is on every in-sync replica, and there are at least <code>min.insync.replicas</code> of them.',
    '<b>Availability:</b> a partition stays writable while its ISR holds at least <code>min.insync.replicas</code> brokers.',
    '<b>No duplicates:</b> an idempotent producer writes each record once per partition within a producer session.',
    '<b>Independent readers:</b> adding a consumer group does not change what other groups read.',
    '<b>Bounded growth:</b> a log shrinks only at segment boundaries, by retention time, size or compaction.'
  ],
  out: 'Kafka Connect and Kafka Streams in depth, schema registries, security and ACLs, MirrorMaker, cloud-managed offerings, and the legacy ZooKeeper control plane (removed in 4.0).',
  est: [
    ['How much disk for the cluster?', '50,000 events/s × 1 KB = 50 MB/s ≈ 4.3 TB/day. Keep 7 days × RF 3 ≈ 91 TB (assumed event size)', 'About 12 brokers of 10 TB, with room to spare (feature 7).'],
    ['How much network?', 'Out of the brokers: replication 2 × 50 MB/s + reads 12 groups × 50 MB/s = 700 MB/s in total (plus 50 MB/s in from producers)', 'About 58 MB/s out per broker across 12 brokers: a 10 Gbit NIC has room, one slow consumer group does not matter (feature 5).'],
    ['How many partitions?', 'Assume a consumer handles 10 MB/s per partition. 50 ÷ 10 = 5 needed, so choose 24 for headroom and for 12 consumers per group', '24 partitions × RF 3 = 72 replicas, 6 per broker (feature 2).'],
    ['How big are segments in time?', '50 MB/s ÷ 24 partitions ≈ 2.1 MB/s each. <code>segment.bytes</code> = 1 GiB fills in about 8.6 minutes', 'About 1,170 segments per partition for 7 days, each with 3 files. Keep partition counts modest (feature 1).'],
    ['How fast does a leader failure heal?', 'A broker is fenced after <code>broker.session.timeout.ms</code> = 9 s without heartbeats, then a new leader is chosen from the ISR', 'Writes to its partitions pause for seconds, not minutes (features 4 and 9).'],
    ['How long does a lagging follower block acks=all?', '<code>replica.lag.time.max.ms</code> = 30 s by default', 'Until it is dropped from the ISR, producers with acks=all wait for it (feature 4).']
  ],
  hldNote: 'Select a box to open that feature. The data path runs left to right: producer → partition leader → log segments → followers (ISR) → consumer groups. Retention and transactions sit beside it, and the KRaft controllers decide who leads.',
  decisions: [
    ['Delete a record when it is read?', 'No: keep it by retention, and let each group track its own offset', 'Many independent readers and replay, at the price of disk use.'],
    ['Order across a topic?', 'No: order only within a partition, chosen by key', 'Scales by adding partitions, at the price that cross-key order does not exist.'],
    ['Commit when a majority has it?', 'No: commit when every in-sync replica has it', 'Any ISR member can lead without losing committed data, at the price that a slow follower must be dropped from the ISR.'],
    ['Flush every write to disk?', 'No: write to the page cache and rely on replication', 'High throughput, at the price that durability comes from replicas, not fsync.']
  ],
  verify: [
    'Defaults used in the text (<code>replica.lag.time.max.ms</code> 30 s, <code>session.timeout.ms</code> 45 s, <code>heartbeat.interval.ms</code> 3 s, <code>max.poll.interval.ms</code> 5 min, <code>max.poll.records</code> 500, <code>batch.size</code> 16384, <code>delivery.timeout.ms</code> 120 s, <code>segment.bytes</code> 1 GiB, <code>retention.ms</code> 7 days, <code>transaction.timeout.ms</code> 60 s, <code>enable.idempotence</code> true since 3.0) match the Apache Kafka documentation. They were written from the docs and the KIPs by knowledge and were not re-fetched in this build.',
    'Values that changed or may differ by release (<code>linger.ms</code> is 0 in 3.x and 5 ms from 4.0, tiered storage is production-ready from 3.9, the new consumer rebalance protocol of KIP-848 is generally available in 4.0) are marked in the text. Confirm them for your version.',
    'The partitioned-log, ISR and consumer-group animations are simplified models: a three-replica partition with one record id per record, and a group with whole-partition assignment. The murmur2 hash is Kafka\'s own and was checked against the published test vectors. The KRaft animation reuses the five-node Raft model with three controllers.',
    'Everything else (sizes, rates, latencies, counts, durations) is an <b>example or assumption</b> and is labelled that way.'
  ]
};

CourseData.features = [
  {
    id: 'log', tag: 'log storage', name: 'Log segments, offsets and recovery',
    summary: 'A partition is a directory of segment files found by offset in a few steps, written to the page cache and repaired after a crash.',
    goal: 'Find any offset without scanning, append fast, and recover to a consistent log after a crash.',
    scope: [['Segments and the sparse index', 'Crash recovery', 'Page cache and flush'], ['Tiered storage (feature 7)', 'Compaction (feature 7)']],
    fr: ['Locate a record by offset in a few lookups.', 'Append to the active segment only.', 'Recover a log after an unclean shutdown.'],
    nfr: ['A lookup does not scan the partition.', 'Only the active segment is written.', 'Durability does not depend on fsync per record.'],
    decisions: [['Index every record?', 'No: a sparse index entry every 4 KiB', 'Small, memory-mapped index, at the price of a short scan after the lookup.'], ['fsync every write?', 'No: page cache plus replication', 'Throughput, at the price of relying on replicas.']]
  },
  {
    id: 'part', tag: 'partitioning', name: 'Topics, partitions and keys',
    summary: 'Order exists only inside a partition, a key picks the partition, and the partition count is the limit on parallelism.',
    goal: 'Keep records of one key in order and spread load across brokers and consumers.',
    scope: [['Default partitioner and murmur2', 'Key skew', 'Partition count and consumer parallelism'], ['Custom partitioners']],
    fr: ['Map a key to a partition deterministically.', 'Spread keyless records across partitions.', 'Let at most one consumer of a group read a partition.'],
    nfr: ['One key always maps to one partition for a fixed partition count.', 'Partition count caps group parallelism.', 'Changing the count changes where keys go.'],
    decisions: [['How to choose a partition?', 'Hash of the key modulo the count', 'Stable placement, at the price that growing the topic remaps keys.'], ['How many partitions?', 'For peak throughput and consumers, not more', 'Parallelism, at the price of files, memory and longer failover.']]
  },
  {
    id: 'prod', tag: 'producer', name: 'Producer batching and idempotence',
    summary: 'Batches amortise requests, and sequence numbers make retries safe.',
    goal: 'Send at high throughput and survive lost acknowledgements without duplicates or reordering.',
    scope: [['Batching and linger', 'Idempotent producer', 'acks, retries and timeouts'], ['Compression codecs in depth']],
    fr: ['Group records per partition into batches.', 'Retry failed sends within a bounded time.', 'Detect and drop duplicate batches at the broker.'],
    nfr: ['A batch is sent when full or after linger.ms.', 'A retried batch is written once.', 'Retries do not reorder within a partition.'],
    decisions: [['Wait to fill batches?', 'A short linger', 'Fewer, larger requests, at the price of a little latency.'], ['Make retries safe?', 'Idempotence on by default', 'No duplicates from retries, at the price of per-partition sequence state.']]
  },
  {
    id: 'repl', tag: 'replication', name: 'Replication, ISR and placement',
    summary: 'A record is committed when every in-sync replica has it, and a new leader may come only from the ISR.',
    goal: 'Survive broker failures without losing committed records.',
    scope: [['Leader, followers, ISR, high watermark', 'min.insync.replicas', 'Reassignment and throttling'], ['Rack awareness details', 'Unclean election in depth']],
    fr: ['Copy the leader log to followers by fetch.', 'Track the ISR and the high watermark.', 'Move replicas between brokers without overload.'],
    nfr: ['A committed record is on every ISR member.', 'A leader is elected from the ISR.', 'Reassignment is throttled.'],
    decisions: [['Commit by majority or by ISR?', 'By the whole ISR', 'Any ISR member can lead, at the price of waiting for the slowest member until it is dropped.'], ['Allow an out-of-ISR leader?', 'No by default (unclean election off)', 'No data loss on failover, at the price of an offline partition.']]
  },
  {
    id: 'cons', tag: 'consumer', name: 'Consumer offsets and fetching',
    summary: 'A group\'s position is a committed offset per partition, and when to commit decides between duplicates and loss.',
    goal: 'Resume exactly where a group left off and know the cost of each commit strategy.',
    scope: [['Position, committed offset, lag', 'Offset out of range', 'Fetch sizing'], ['Offset storage internals']],
    fr: ['Store a committed offset per group and partition.', 'Resume from it after a restart.', 'Handle an offset that no longer exists.'],
    nfr: ['Commit after processing gives at-least-once.', 'Commit before processing gives at-most-once.', 'Reading never deletes data.'],
    decisions: [['When to commit?', 'After processing', 'No loss, at the price of reprocessing after a crash.'], ['What if the offset is gone?', '<code>auto.offset.reset</code> chooses', 'The group continues, at the price of skipping or replaying data.']]
  },
  {
    id: 'group', tag: 'consumer groups', name: 'Consumer groups and rebalance',
    summary: 'The group coordinator splits partitions among members, and two clocks decide who is still a member.',
    goal: 'Share a topic among consumers and keep rebalances short and rare.',
    scope: [['Eager and cooperative rebalance', 'Heartbeat and poll liveness', 'Static membership'], ['The KIP-848 protocol internals']],
    fr: ['Assign each partition to one member.', 'Detect dead members.', 'Move partitions when membership changes.'],
    nfr: ['A partition has one reader per group.', 'A member must heartbeat and must call poll in time.', 'A rebalance moves as little as it can.'],
    decisions: [['Stop everyone on a rebalance?', 'Not with the cooperative protocol', 'Only moving partitions pause, at the price of two-phase handover.'], ['Treat a restart as leaving?', 'Not with static membership', 'No rebalance on a quick restart, at the price of slower detection of a real death.']]
  },
  {
    id: 'ret', tag: 'retention', name: 'Retention and compaction',
    summary: 'Data leaves a log by segment, by time or size, by key, or by moving to remote storage.',
    goal: 'Keep disk bounded and keep the data you need for as long as you need it.',
    scope: [['Time and size retention', 'Log compaction and tombstones', 'Tiered storage'], ['Cleaner tuning']],
    fr: ['Delete whole segments past retention.', 'Keep only the latest record per key on a compacted topic.', 'Offload old segments to remote storage.'],
    nfr: ['The active segment is never deleted.', 'A compacted topic always holds the latest record per key.', 'Remote reads are slower than local reads.'],
    decisions: [['Delete by record or by segment?', 'By segment', 'Cheap deletion, at the price that data may outlive retention until its segment closes.'], ['Keep history on broker disks?', 'Local for recent, remote for old', 'Cheaper long retention, at the price of slower old reads.']]
  },
  {
    id: 'txn', tag: 'transactions', name: 'Transactions and exactly-once',
    summary: 'A transaction writes to several partitions and commits offsets together, and a fenced epoch stops zombies.',
    goal: 'Make a read-process-write step atomic.',
    scope: [['Transaction coordinator and markers', 'Zombie fencing', 'read_committed and the last stable offset'], ['Streams exactly-once configuration']],
    fr: ['Commit output records and input offsets atomically.', 'Fence an older producer with the same id.', 'Hide uncommitted records from read_committed consumers.'],
    nfr: ['All records of a transaction become visible together or never.', 'An older epoch cannot write.', 'An open transaction holds back read_committed readers.'],
    decisions: [['How to make it atomic?', 'A transaction coordinator and commit markers in the log', 'No two-phase commit across systems, at the price of latency and open-transaction stalls.'], ['Stop zombies how?', 'A producer epoch per transactional id', 'Stale writers are rejected, at the price of one active producer per id.']]
  },
  {
    id: 'kraft', tag: 'control plane', name: 'KRaft metadata quorum',
    summary: 'Cluster metadata is a log replicated by a Raft quorum of controllers, and brokers follow it.',
    goal: 'Decide who leads each partition, consistently, when brokers or controllers fail.',
    scope: [['Active controller election and metadata log', 'Broker heartbeats and fencing'], ['Migration from ZooKeeper']],
    fr: ['Elect an active controller.', 'Commit metadata changes by majority.', 'Fence brokers that stop heartbeating.'],
    nfr: ['At most one active controller per epoch.', 'A committed metadata change is never lost.', 'Brokers converge on the metadata log.'],
    decisions: [['Where does metadata live?', 'In a Raft log in Kafka itself', 'No second system and fast recovery, at the price of running a controller quorum.'], ['How big a quorum?', '3 or 5 controllers', 'Tolerates 1 or 2 failures, at the price of more nodes.']]
  }
];
