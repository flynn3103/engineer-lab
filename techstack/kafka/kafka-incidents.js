/* Kafka production incident examples (chapter-by-chapter "Common problems").
   Diagrams and sample signals are illustrative; each case links to the Apache Kafka documentation / KIP that supports
   its diagnosis. Chapter index: 0 Log · 1 Produce · 2 Replicate · 3 Consume · 4 Log lifecycle · 5 Transactions · 6 Control plane.
   Globals: INCIDENT_SOURCES, INCIDENTS, incidentVisual, renderIncidents, initIncidents. Helpers are prefixed inc/INC. */
const incEsc = window.sEsc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

const INCIDENT_SOURCES = {
  broker: ['Broker configs', 'https://kafka.apache.org/documentation/#brokerconfigs'],
  topic: ['Topic configs', 'https://kafka.apache.org/documentation/#topicconfigs'],
  producer: ['Producer configs', 'https://kafka.apache.org/documentation/#producerconfigs'],
  consumer: ['Consumer configs', 'https://kafka.apache.org/documentation/#consumerconfigs'],
  ha: ['Replication design', 'https://kafka.apache.org/documentation/#design_ha'],
  semantics: ['Delivery semantics', 'https://kafka.apache.org/documentation/#semantics'],
  compaction: ['Log compaction', 'https://kafka.apache.org/documentation/#compaction'],
  monitoring: ['Monitoring', 'https://kafka.apache.org/documentation/#monitoring'],
  expansion: ['Expanding your cluster', 'https://kafka.apache.org/documentation/#basic_ops_cluster_expansion'],
  kraft: ['KRaft', 'https://kafka.apache.org/documentation/#kraft'],
  kip98: ['KIP-98 · exactly-once & transactions', 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging'],
  kip101: ['KIP-101 · leader epoch', 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-101+-+Alter+Replication+Protocol+to+use+Leader+Epoch+rather+than+High+Watermark+for+Truncation'],
  kip429: ['KIP-429 · incremental rebalance', 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol'],
  kip595: ['KIP-595 · Raft for the metadata quorum', 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-595%3A+A+Raft+Protocol+for+the+Metadata+Quorum'],
  kip664: ['KIP-664 · hanging transactions', 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-664%3A+Provide+tooling+to+detect+and+abort+hanging+transactions']
};

const INCIDENTS = {
  /* ───────────── 0 · Log ───────────── */
  0: [
    {
      title: 'Slow restart after unclean shutdown',
      context: 'A broker holding thousands of partitions is killed with SIGKILL (or loses power). On restart it cannot trust the tail of its logs.',
      symptom: 'The broker takes many minutes to rejoin; its partitions stay offline or under-replicated while it loads logs.',
      signal: 'INFO Recovering unflushed segment 4200 in log orders-0\nUnderReplicatedPartitions > 0 until the broker is back',
      signalNote: 'Representative startup log line plus a documented broker metric; wording and numbering vary by version.',
      cause: 'A clean shutdown writes a marker and skips recovery. After an unclean one the broker re-validates every segment past each partition\'s recovery point (frame length and checksum) and rebuilds missing or invalid index files, using only num.recovery.threads.per.data.dir threads.',
      fix: [
        'Always stop brokers with a controlled shutdown (SIGTERM, controlled.shutdown.enable=true) and give them time before escalating.',
        'Raise num.recovery.threads.per.data.dir so several partitions recover in parallel.',
        'Keep segments a sensible size so less unflushed data has to be re-validated.',
        'Rely on replication: whatever is truncated from a torn tail is re-fetched from the leader.'
      ],
      trade: 'More recovery threads mean more disk I/O during startup. Kafka does not fsync every message by default; durability comes from replication, not from the flush.',
      verify: 'Restart time falls and UnderReplicatedPartitions returns to 0 soon after the broker is up.',
      source: 'broker',
      view: { type: 'files', count: 12, prefix: 'seg', legend: ['torn tail (needed)', 'scanned after kill -9', 'skipped'], before: { count: 12, open: 9, needed: 1 }, after: { count: 12, open: 0, needed: 0 }, beforeText: 'kill -9: every segment past the recovery point is re-validated.', afterText: 'Clean shutdown: recovery is skipped and nothing is scanned.' }
    },
    {
      title: 'Too many partitions: open files and mmaps',
      context: 'A team keeps adding partitions "for parallelism". Each partition replica is a directory of .log, .index and .timeindex files per segment, and index files are memory-mapped.',
      symptom: 'After adding topics, a broker fails to start or to roll a segment, even though the disks are nearly empty.',
      signal: 'java.io.IOException: Too many open files\njava.io.IOException: Map failed (vm.max_map_count)',
      signalNote: 'Typical OS-level errors from the broker log; the limits are the process nofile ulimit and vm.max_map_count.',
      cause: 'Every segment of every replica holds file descriptors and mmaps. Partitions per broker × segments per partition × 3 files grows past the OS limits long before disk space runs out.',
      fix: [
        'Raise the broker\'s open-file ulimit and vm.max_map_count to documented production values.',
        'Cut partitions per broker: right-size partition counts, delete unused topics, or spread replicas over more brokers.',
        'Use larger segments (log.segment.bytes) so there are fewer files per partition.',
        'Alert on file-descriptor usage well before the limit.'
      ],
      trade: 'Fewer, larger partitions limit consumer parallelism and per-key spread; larger segments make retention coarser because only closed segments are deleted.',
      verify: 'Open file descriptors and mmap counts stay well below the limits after a restart and a segment roll.',
      source: 'broker',
      view: { type: 'bars', labels: ['broker 1', 'broker 2', 'broker 3'], before: [96, 94, 91], after: [38, 36, 35], unit: 'open files, % of ulimit · illustrative', hot: 80, beforeText: 'Thousands of replicas per broker push file descriptors toward the limit.', afterText: 'Fewer partitions per broker and a raised limit leave headroom.' }
    },
    {
      title: 'Corrupted record or index',
      context: 'A failing disk or filesystem writes a bad block into a closed segment, or an index file no longer matches its log.',
      symptom: 'Fetches from one partition fail repeatedly; a follower or a consumer cannot get past one offset.',
      signal: 'CorruptRecordException: Record is corrupt (stored crc = ..., computed crc = ...)\nkafka-dump-log.sh --files <segment>.log',
      signalNote: 'Representative exception text and a documented dump tool; the numbers are placeholders.',
      cause: 'Every record batch carries a CRC. A mismatch makes the read fail rather than serve bad bytes. Indexes are only hints: Kafka rebuilds a bad one from the log at startup, but a bad log segment must be replaced from a healthy copy.',
      fix: [
        'Check disk and filesystem health first (SMART, dmesg); do not keep serving from a failing disk.',
        'Let the broker rebuild corrupt index files on restart.',
        'If log data is bad on a follower, remove that replica\'s partition data and let it re-replicate from the leader.',
        'If the leader copy is bad, fail over to an in-sync follower before cleaning up.'
      ],
      trade: 'Re-replicating a large partition costs network and disk on the leader; do it throttled and one partition at a time.',
      verify: 'The replica rejoins the ISR, UnderReplicatedPartitions returns to 0 and the CRC error stops.',
      source: 'ha',
      view: { type: 'timeline', before: [['fetch', 'read offset 4210', 'good'], ['verify', 'CRC mismatch', 'bad'], ['broker', 'CorruptRecordException', 'bad'], ['replica', 'stuck, not in ISR', 'bad']], after: [['disk', 'replace / check', 'good'], ['replica', 'bad copy removed', 'good'], ['fetch', 'copy from leader', 'good'], ['ISR', 'caught up', 'good']], beforeText: 'The bad batch blocks every reader of that replica.', afterText: 'A clean copy from the leader replaces the damaged one.' }
    }
  ],

  /* ───────────── 1 · Produce ───────────── */
  1: [
    {
      title: 'Hot key makes a hot partition',
      context: 'An orders topic is keyed by seller_id. One marketplace seller produces a large share of all events.',
      symptom: 'One partition has far higher bytes-in and consumer lag; one consumer is pegged while the others idle.',
      signal: 'Bytes-in per partition: P0 ≫ P1..P5\nkafka-consumer-groups.sh --describe: LAG concentrated on one partition',
      signalNote: 'Metric pattern and a documented CLI; the values are illustrative.',
      cause: 'partition = hash(key) mod N. Equal keys always map to one partition, so adding brokers or partitions cannot split the traffic of a single key.',
      fix: [
        'Confirm skew by comparing per-partition bytes-in and consumer lag.',
        'Use a finer key (seller_id + order_id) or salt the hot key into a few buckets.',
        'Optionally use a custom partitioner for known hot keys.',
        'Re-check balance after the change.'
      ],
      trade: 'Order is guaranteed only per key within one partition. A salted or finer key gives up ordering across the buckets for that seller.',
      verify: 'Per-partition throughput and lag are within a small factor of each other.',
      source: 'producer',
      view: { type: 'bars', labels: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'], before: [48, 4, 5, 3, 4, 4], after: [11, 9, 10, 9, 10, 9], unit: 'MB/s in · illustrative', hot: 30, beforeText: 'The hot key keeps all its traffic on P0.', afterText: 'A finer / salted key spreads it over all partitions.' }
    },
    {
      title: 'More partitions break per-key order',
      context: 'To get more consumer parallelism the topic grows from 3 to 4 partitions while orders are in flight.',
      symptom: 'A consumer sees an order\'s "paid" event before its "created" event, or a stateful job loses state for some keys.',
      signal: 'kafka-topics.sh --alter --partitions 4\nkey order-7: created @ p1, paid @ p3',
      signalNote: 'Command is documented; the key placement is an illustration of hash(key) mod N changing.',
      cause: 'The partitioner is hash(key) mod numPartitions. Changing N moves most keys to a new partition, while existing records never move, so one key\'s history is now split over two logs.',
      fix: [
        'Treat the partition count as part of the data contract and size it up front for the target consumer parallelism.',
        'If it must grow, create a new topic with the final count and migrate: dual-write or replay old data into it.',
        'Quiesce or drain the old topic before switching key-dependent consumers over.'
      ],
      trade: 'A migration costs a full copy and a coordinated cut-over; the partition count can never be lowered without recreating the topic.',
      verify: 'For sampled keys, every event lands in one partition in the new topic and consumers see them in order.',
      source: 'topic',
      view: { type: 'lanes', before: { parts: 4, laneLabels: ['P0', 'P1', 'P2', 'P3 (new)'], items: [['order-7', 1, 'good', 'created'], ['order-7', 3, 'bad', 'paid'], ['order-5', 2, 'good', 'created'], ['order-5', 2, 'good', 'paid']] }, after: { parts: 4, laneLabels: ['P0', 'P1', 'P2', 'P3'], items: [['order-7', 3, 'good', 'created'], ['order-7', 3, 'good', 'paid'], ['order-5', 2, 'good', 'created'], ['order-5', 2, 'good', 'paid']] }, beforeText: 'Same key, two partitions: order-7 is split across P1 and P3.', afterText: 'A topic created with the final count keeps each key in one lane.' }
    },
    {
      title: 'Tiny batches flood the brokers',
      context: 'Many producers send each record immediately: linger.ms=0 and a small batch.size, at tens of thousands of records per second.',
      symptom: 'Broker request-handler CPU and network request rate are high while bytes-in is modest; produce latency rises with load.',
      signal: 'Producer: batch-size-avg small, records-per-request-avg ≈ 1\nBroker: RequestsPerSec{request=Produce} very high',
      signalNote: 'Documented producer and broker metrics; the pattern is illustrative.',
      cause: 'Each request costs a round trip and broker work no matter how small it is. With no linger the producer closes a batch after one record, so throughput is bounded by request rate, not bandwidth.',
      fix: [
        'Check batch-size-avg and records-per-request-avg on the producers.',
        'Raise linger.ms (for example 5–20 ms) and batch.size (for example 64 KB) so records share a request.',
        'Enable compression (compression.type) to shrink whole batches.',
        'Keep buffer.memory bounded so a slow broker applies back-pressure instead of an OutOfMemoryError.'
      ],
      trade: 'linger.ms adds up to that much latency to a record while the batch fills; under heavy load fewer requests can even lower end-to-end latency.',
      verify: 'Produce request rate drops sharply with the same bytes-in, and p99 produce latency does not rise.',
      source: 'producer',
      view: { type: 'bars', labels: ['producer A', 'producer B', 'producer C', 'producer D'], before: [38, 41, 36, 40], after: [4, 5, 4, 5], unit: 'produce requests/s, thousands · illustrative', hot: 20, beforeText: 'linger.ms=0: roughly one request per record.', afterText: 'linger + larger batches: many records per request.' }
    },
    {
      title: 'Retry duplicates and reordering',
      context: 'A producer without idempotence times out waiting for an ack and retries, with several batches in flight per connection.',
      symptom: 'Downstream sees the same event twice, or events of one key in a different order than they were sent.',
      signal: 'Producer: record-retry-rate > 0, request timeouts\nConsumer: same business id appears twice',
      signalNote: 'Documented producer metric; the duplicate is observed by the application, not logged by Kafka.',
      cause: 'A timeout is ambiguous: the write may already have landed. A blind retry appends it again, and with max.in.flight.requests.per.connection > 1 a retried batch can land after a later batch. Idempotence adds (producer ID, sequence) so the leader can recognise a retry.',
      fix: [
        'Set enable.idempotence=true (the default in current clients) with acks=all.',
        'Keep max.in.flight.requests.per.connection at 5 or less; with idempotence that still preserves order.',
        'Use delivery.timeout.ms to bound total retry time instead of an unbounded retry count.',
        'For effects outside Kafka, make the consumer idempotent too.'
      ],
      trade: 'Idempotence is per producer session and partition: a restarted producer gets a new producer ID, so it does not dedupe across restarts. That needs a transactional.id (chapter 6).',
      verify: 'After injecting a lost ack, the log holds each batch once and in order.',
      source: 'semantics',
      view: { type: 'timeline', before: [['t0', 'send #1, #2 (in flight)', 'good'], ['t1', '#1 lands, ack lost', 'bad'], ['t2', '#2 lands', 'good'], ['t3', '#1 retried → log 1 2 1', 'bad']], after: [['t0', 'send #1, #2 with PID + seq', 'good'], ['t1', '#1 lands, ack lost', 'bad'], ['t2', '#2 lands', 'good'], ['t3', '#1 retry: seq seen → no-op', 'good']], beforeText: 'A blind retry appends batch #1 a second time, after #2.', afterText: 'The leader recognises the sequence and appends nothing.' }
    }
  ],

  /* ───────────── 2 · Replicate ───────────── */
  2: [
    {
      title: 'acks=1 loses an acknowledged record',
      context: 'A producer uses acks=1 for speed. The leader acknowledges after its own append and then crashes before followers fetch the newest records.',
      symptom: 'Producers saw success for every record, but after a failover some of those records are gone from the topic.',
      signal: 'Producer: ack for offsets 4–5 received\nNew leader (follower): log end offset = 4',
      signalNote: 'Illustrative trace of the failover; Kafka does not log a "lost record" line.',
      cause: 'With acks=1 the leader replies before any follower has the record. An in-sync follower with a shorter log is elected, so records above its log end are lost. The high watermark only counts replicas that have the data.',
      fix: [
        'Use acks=all with replication.factor=3 and min.insync.replicas=2 for data that must not be lost.',
        'Keep unclean.leader.election.enable=false so an out-of-sync replica cannot become leader.',
        'Retry on failure and rely on idempotence to avoid duplicates.'
      ],
      trade: 'acks=all waits for the slowest in-sync replica, so latency rises; with min.insync.replicas=2 the partition rejects writes when only one replica is in sync.',
      verify: 'Kill the leader mid-stream: every acknowledged offset is present on the new leader.',
      source: 'ha',
      view: { type: 'strip', before: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'ok'], ['4', 'gone'], ['5', 'gone']], marks: [['HW = 4', 4, 'good'], ['new leader LEO = 4', 4, 'bad', 'bottom'], ['acked 0–5 (acks=1)', 5, 'bad']] }, after: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'ok'], ['4', 'open'], ['5', 'open']], marks: [['HW = 4', 4, 'good'], ['not acked: producer retries', 5, 'warn'], ['acks=all: acked 0–3 only', 3, 'good', 'bottom']] }, beforeText: 'Offsets 4–5 were acked by the leader alone and vanish on failover.', afterText: 'Only offsets at or below the high watermark are acked; the rest are retried.' }
    },
    {
      title: 'NOT_ENOUGH_REPLICAS rejects writes',
      context: 'A topic uses replication.factor=3, min.insync.replicas=2 and acks=all. Two of the three replicas fall out of sync during a rolling restart.',
      symptom: 'Produce requests fail even though the leader is healthy; consumers can still read.',
      signal: 'NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required.\nUnderMinIsrPartitionCount > 0',
      signalNote: 'Documented exception and broker metric (UnderMinIsrPartitionCount); message wording can vary by version.',
      cause: 'With acks=all the leader refuses writes when the ISR has fewer than min.insync.replicas members. That is the guard that stops an acknowledged record from existing on a single copy.',
      fix: [
        'List under-min-ISR partitions and find which replicas are out of sync and why (down broker, slow disk, network).',
        'Restore or replace the missing replica so the ISR grows back to at least min.insync.replicas.',
        'Restart brokers one at a time and wait for UnderReplicatedPartitions to reach 0 before the next.',
        'Do not lower min.insync.replicas as a quick fix unless losing that guarantee is acceptable.'
      ],
      trade: 'A higher min.insync.replicas trades availability for durability: the partition stops accepting writes sooner. min.insync.replicas=1 keeps writing on one copy.',
      verify: 'UnderMinIsrPartitionCount returns to 0 and produce errors stop.',
      source: 'ha',
      view: { type: 'replicas', before: [['broker 1 (leader)', 'in ISR · 1 < min 2', 'bad'], ['broker 2', 'out of sync', 'bad'], ['broker 3', 'down', 'muted']], after: [['broker 1 (leader)', 'in ISR', 'good'], ['broker 2', 'caught up · in ISR', 'good'], ['broker 3', 'down', 'muted']], beforeText: 'Only 1 replica is in sync, below min.insync.replicas=2: writes are rejected.', afterText: 'Two in-sync replicas: acks=all succeeds again.' }
    },
    {
      title: 'Slow follower flaps in and out of the ISR',
      context: 'One follower sits on a busy disk or a congested link and can barely keep up with the leader.',
      symptom: 'Under-replicated partitions blink on and off; acks=all latency spikes whenever the follower is in the ISR.',
      signal: 'IsrShrinksPerSec and IsrExpandsPerSec both non-zero\nUnderReplicatedPartitions oscillating',
      signalNote: 'Documented broker metrics; the oscillation pattern is illustrative.',
      cause: 'A follower that has not caught up to the leader log end within replica.lag.time.max.ms is removed from the ISR, then re-added when it catches up. Every shrink and expand is a metadata update, and acks=all waits for the slow member while it is in.',
      fix: [
        'Find the slow broker (disk latency, network, GC, noisy neighbour) from fetcher lag and disk metrics.',
        'Fix or move the underlying bottleneck rather than raising the timeout.',
        'Spread replicas so no broker carries a disproportionate share.',
        'Tune replica.lag.time.max.ms only to match a known, bounded stall.'
      ],
      trade: 'A larger replica.lag.time.max.ms keeps a slow follower in the ISR longer: fewer flaps but higher acks=all latency and a longer wait before the ISR reflects reality.',
      verify: 'IsrShrinksPerSec and IsrExpandsPerSec return to about 0 and UnderReplicatedPartitions stays at 0.',
      source: 'monitoring',
      view: { type: 'timeline', before: [['0:00', 'ISR {1,2,3}', 'good'], ['0:31', 'follower 3 lags → ISR {1,2}', 'bad'], ['0:40', 'catches up → ISR {1,2,3}', 'good'], ['1:10', 'lags again → ISR {1,2}', 'bad']], after: [['0:00', 'slow disk replaced', 'good'], ['0:05', 'follower 3 fetches in time', 'good'], ['1:00', 'ISR {1,2,3} stable', 'good'], ['2:00', 'no shrink / expand', 'good']], beforeText: 'The ISR keeps shrinking and expanding around the slow follower.', afterText: 'Once the follower keeps up, the ISR is stable.' }
    },
    {
      title: 'Reassignment saturates the cluster',
      context: 'To use new brokers, an operator reassigns hundreds of partitions at once during peak traffic.',
      symptom: 'Produce and fetch latency rise and followers drop out of the ISR while data is being copied.',
      signal: 'kafka-reassign-partitions.sh --execute (no --throttle)\nNetwork and disk saturated; UnderReplicatedPartitions climbing',
      signalNote: 'Documented command; saturation figures are illustrative.',
      cause: 'A move is just replication: the new replica fetches the full committed log from the leader. Unthrottled, that copy competes with client traffic and with normal follower fetches for the same network and disk.',
      fix: [
        'Re-run with --throttle (inter-broker bytes/s) so clients keep their bandwidth.',
        'Move a few partitions at a time, preferably off-peak.',
        'Watch the ISR and latency during the move.',
        'Verify completion with --verify, which also removes the throttle.'
      ],
      trade: 'A throttle makes the move slower and keeps old replicas around longer; a too-low throttle can leave a new replica unable to catch up while producers keep writing.',
      verify: 'Client latency stays flat during the move and the throttle is removed after --verify reports completion.',
      source: 'expansion',
      view: { type: 'bars', labels: ['broker 1', 'broker 2', 'broker 3', 'broker 4 (new)'], before: [95, 92, 90, 98], after: [62, 60, 58, 40], unit: 'network used, % of NIC · illustrative', hot: 85, beforeText: 'The copy competes with client traffic for the same network.', afterText: 'A throttle leaves headroom for producers and consumers.' }
    }
  ],

  /* ───────────── 3 · Consume ───────────── */
  3: [
    {
      title: 'Rebalance storm: processing outlasts max.poll.interval.ms',
      context: 'Consumers process each polled batch with slow downstream calls. One batch occasionally takes longer than max.poll.interval.ms.',
      symptom: 'Group members repeatedly leave and rejoin; throughput collapses and lag climbs.',
      signal: 'consumer poll timeout has expired ... max.poll.interval.ms\nCommitFailedException: ... the consumer was kicked out of the group\nconsumer-coordinator-metrics: rebalance-total increasing',
      signalNote: 'Representative client messages and a documented coordinator metric; exact wording varies by client version.',
      cause: 'If poll() is not called again within max.poll.interval.ms, the member is removed and its partitions are reassigned. It rejoins, receives the same slow work, times out again, and the group never settles. Heartbeats run on a separate thread and do not prevent this.',
      fix: [
        'Lower max.poll.records so a batch finishes comfortably inside the interval, or raise max.poll.interval.ms.',
        'Move slow work to a worker pool and use pause()/resume() while keeping poll() running.',
        'Use CooperativeStickyAssignor so only moved partitions pause; consider static membership (group.instance.id) for rolling restarts.',
        'Stagger restarts so members do not all leave at once.'
      ],
      trade: 'A longer max.poll.interval.ms also delays detection of a genuinely stuck consumer; static membership delays reassignment until session.timeout.ms expires.',
      verify: 'rebalance-total stays flat while lag drains, and no poll-timeout lines appear.',
      source: 'kip429',
      view: { type: 'timeline', before: [['t0', 'poll() batch takes 6 min', 'bad'], ['5 min', 'no poll → removed from group', 'bad'], ['5 min+', 'rebalance, rejoin, same batch', 'bad'], ['loop', 'lag grows', 'bad']], after: [['fix', 'smaller batch / worker pool', 'good'], ['t0', 'poll() returns every ~20 s', 'good'], ['steady', 'no rebalance', 'good'], ['later', 'lag drains', 'good']], beforeText: 'Each slow batch triggers another rebalance.', afterText: 'Polling stays inside the interval; ownership is stable.' }
    },
    {
      title: 'More consumers than partitions',
      context: 'Lag is growing, so the team scales the consumer group from 4 to 6 instances. The topic has 4 partitions.',
      symptom: 'Adding consumers does not reduce lag; two of the six instances sit idle.',
      signal: 'kafka-consumer-groups.sh --describe: partitions p0–p3 each owned; two members with no assignment',
      signalNote: 'Documented CLI; the assignment shown is an illustration.',
      cause: 'Within a group a partition is read by one member at a time. Parallelism is capped by the partition count, so extra members get nothing.',
      fix: [
        'Check that members ≤ partitions and that the per-partition consumer is the bottleneck.',
        'If more parallelism is needed, create a topic with more partitions (see the key-order trade-off in chapter 2) and migrate.',
        'Otherwise make each consumer faster: batch downstream calls, parallelise inside the member with ordering by key.'
      ],
      trade: 'More partitions raise open files, replication work and recovery time, and can break per-key order if added later.',
      verify: 'Every group member owns at least one partition and total lag falls.',
      source: 'consumer',
      view: { type: 'replicas', before: [['C1', 'p0', 'good'], ['C2', 'p1', 'good'], ['C3', 'p2', 'good'], ['C4', 'p3', 'good'], ['C5', 'idle', 'muted'], ['C6', 'idle', 'muted']], after: [['C1', 'p0, p1', 'good'], ['C2', 'p2, p3', 'good'], ['C3', 'p4, p5', 'good'], ['C4', 'p6, p7', 'good'], ['C5', 'p8, p9', 'good'], ['C6', 'p10, p11', 'good']], beforeText: '4 partitions can keep only 4 members busy.', afterText: '12 partitions let all 6 members share the work.' }
    },
    {
      title: 'Commit placement: skipped or duplicated records',
      context: 'A consumer crashes in the middle of a batch. Whether work is lost or repeated depends on when it committed offsets.',
      symptom: 'After a restart, either some records were never processed, or the last few are processed twice.',
      signal: 'enable.auto.commit=true, auto.commit.interval.ms=5000\nkafka-consumer-groups.sh --describe: CURRENT-OFFSET ahead of or behind real progress',
      signalNote: 'Documented configs and CLI; the exact offsets depend on timing.',
      cause: 'A restart resumes from the committed offset. Committing before processing gives at-most-once (a crash skips records); committing after gives at-least-once (a crash repeats everything since the last commit). Auto-commit can commit offsets of records that have not finished processing.',
      fix: [
        'Disable auto-commit for work with side effects and commit after processing succeeds.',
        'Make processing idempotent (a dedupe key or an upsert) so a replay is harmless.',
        'For Kafka-to-Kafka pipelines, commit the offset inside a transaction with the output (chapter 6).'
      ],
      trade: 'Committing more often reduces duplicates but costs more commit requests; at-least-once always needs an idempotent consumer.',
      verify: 'Crash a consumer mid-batch: no offset is skipped, and any repeat is absorbed by idempotent processing.',
      source: 'semantics',
      view: { type: 'strip', before: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'gone'], ['4', 'gone'], ['5', 'gone'], ['6', 'open'], ['7', 'open']], marks: [['crash after 2', 2, 'bad'], ['resume at committed = 6', 6, 'bad', 'bottom']] }, after: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'dup'], ['4', 'dup'], ['5', 'open'], ['6', 'open'], ['7', 'open']], marks: [['resume at committed = 3', 3, 'good', 'bottom'], ['crash after 4', 4, 'warn']] }, beforeText: 'Committed before processing: records 3–5 are skipped after the crash.', afterText: 'Committed after processing: records 3–4 are repeated, never skipped.' }
    }
  ],

  /* ───────────── 4 · Log lifecycle ───────────── */
  4: [
    {
      title: 'Consumer falls behind retention',
      context: 'A consumer group is stopped for a weekend while the topic keeps retention.ms at 3 days.',
      symptom: 'On restart the consumer fails to fetch, then either skips a large range of events or reprocesses the whole topic.',
      signal: 'OffsetOutOfRangeException: Fetch position FetchPosition{offset=3, ...} is out of range for partition orders-0\nauto.offset.reset = latest | earliest',
      signalNote: 'Representative client message; the broker-side error is OFFSET_OUT_OF_RANGE.',
      cause: 'Retention deletes whole closed segments by time or size and ignores consumers. The log start offset moves forward past the group\'s committed offset, so that offset no longer exists. The client then applies auto.offset.reset.',
      fix: [
        'Alert on consumer lag measured against retention, not just absolute lag.',
        'Raise retention.ms / retention.bytes, or use tiered storage so older history stays readable.',
        'Scale or fix the slow consumer so it keeps up.',
        'Choose auto.offset.reset deliberately: latest skips data, earliest reprocesses it.'
      ],
      trade: 'Longer retention costs disk (or remote storage) and recovery time; tiered storage keeps the retention.ms bound for the whole log and reads old data at higher latency.',
      verify: 'Committed offsets stay above the log start offset and no OffsetOutOfRangeException occurs after a long pause.',
      source: 'topic',
      view: { type: 'strip', before: { cells: [['0', 'gone'], ['1', 'gone'], ['2', 'gone'], ['3', 'gone'], ['4', 'gone'], ['5', 'gone'], ['6', 'ok'], ['7', 'ok'], ['8', 'ok'], ['9', 'ok'], ['10', 'ok'], ['11', 'ok']], marks: [['LOG-START = 6', 6, 'good'], ['COMMITTED = 3 → out of range', 3, 'bad', 'bottom']] }, after: { cells: [['0', 'gone'], ['1', 'gone'], ['2', 'gone'], ['3', 'gone'], ['4', 'gone'], ['5', 'gone'], ['6', 'ok'], ['7', 'ok'], ['8', 'ok'], ['9', 'ok'], ['10', 'ok'], ['11', 'ok']], marks: [['LOG-START = 6', 6, 'good'], ['COMMITTED = 9 (keeps up)', 9, 'good', 'bottom']] }, beforeText: 'The committed offset is below the log start: its segment was deleted.', afterText: 'The consumer stays ahead of the log start offset.' }
    },
    {
      title: 'Tombstone purged before a slow consumer saw it',
      context: 'A compacted changelog holds one row per customer. A consumer rebuilding its table pauses for hours, and customer k1 is deleted meanwhile.',
      symptom: 'A deleted customer is still present in one downstream table that never saw the delete.',
      signal: 'Topic cleanup.policy=compact, delete.retention.ms=86400000 (24 h)\nConsumer position older than the purge time of the tombstone',
      signalNote: 'Documented topic configs; the scenario is a timing pattern, not a log line.',
      cause: 'Compaction keeps the latest value per key and writes a delete as a tombstone (null value). The cleaner removes the tombstone itself after delete.retention.ms. A consumer that read the old value but not the tombstone keeps the key forever.',
      fix: [
        'Set delete.retention.ms longer than the worst-case time a consumer takes to read the log from start to end.',
        'Alert on consumers whose position is older than delete.retention.ms.',
        'If the table is already wrong, rebuild it by re-reading the compacted topic from the beginning.'
      ],
      trade: 'Longer tombstone retention keeps deleted keys\' markers (and any PII in the key) in the log for longer and slightly delays space reclaim.',
      verify: 'A consumer paused longer than the old value still ends with the deleted key removed.',
      source: 'compaction',
      view: { type: 'strip', before: { cells: [['k1=A', 'gone'], ['k2=B', 'ok'], ['k1=∅', 'gone'], ['k3=C', 'ok'], ['k2=D', 'ok']], marks: [['COMMITTED = 1', 1, 'bad'], ['tombstone purged', 2, 'bad', 'bottom']] }, after: { cells: [['k1=A', 'gone'], ['k2=B', 'ok'], ['k1=∅', 'marker'], ['k3=C', 'ok'], ['k2=D', 'ok']], marks: [['COMMITTED = 1', 1, 'good'], ['tombstone kept', 2, 'good', 'bottom']] }, beforeText: 'The cleaner dropped the delete: the consumer keeps k1 forever.', afterText: 'The tombstone outlives the slow consumer, which then removes k1.' }
    },
    {
      title: 'Disk fills although retention is set',
      context: 'A topic sets retention.bytes=100 GiB, thinking of it as a cap for the topic, on 24 partitions with RF 3.',
      symptom: 'Broker disks approach 100% and log directories go offline even though "retention is configured".',
      signal: 'df: data volume > 90%\nOfflineLogDirectoryCount > 0',
      signalNote: 'OS command and a documented broker metric; the numbers are illustrative.',
      cause: 'retention.bytes applies per partition, not per topic: the cap is 100 GiB × 24 partitions × 3 replicas. Retention also only deletes closed segments, so a slow partition can hold old data until its active segment rolls (segment.ms / segment.bytes).',
      fix: [
        'Compute capacity as partitions × replicas × per-partition limit and compare with real disk.',
        'Lower retention.bytes / retention.ms to match the disk budget, or add brokers or disks.',
        'Set segment.ms so quiet partitions roll and become deletable.',
        'Alert early (for example 70–80%); consider tiered storage for long history.'
      ],
      trade: 'Shorter retention shrinks the replay window for slow or new consumers; more disks or tiered storage cost money and add operational surface.',
      verify: 'Disk usage per broker settles below the alert threshold and no log directory goes offline.',
      source: 'topic',
      view: { type: 'bars', labels: ['broker 1', 'broker 2', 'broker 3'], before: [97, 94, 96], after: [58, 55, 57], unit: 'disk used, % · illustrative', hot: 85, beforeText: 'The per-partition cap multiplied across partitions and replicas exceeds the disk.', afterText: 'Retention sized against the disk budget leaves headroom.' }
    }
  ],

  /* ───────────── 5 · Transactions ───────────── */
  5: [
    {
      title: 'Two instances share a transactional.id',
      context: 'An app deploys several pods that all configure the same transactional.id (for example copied from a template).',
      symptom: 'Producers crash with a fencing error and restart in a loop; throughput is near zero.',
      signal: 'ProducerFencedException: There is a newer producer with the same transactionalId which fences the current one.',
      signalNote: 'Documented exception; the sequence below is an illustration.',
      cause: 'initTransactions() maps a transactional.id to one producer ID and bumps its epoch, fencing any older producer with the same id. Two live instances keep fencing each other, so neither can commit.',
      fix: [
        'Give every producer instance (or every input partition, depending on your design) its own stable transactional.id.',
        'Treat ProducerFencedException as fatal for that instance: close it, do not retry the same transaction.',
        'Prefer a framework that derives the id for you (for example Kafka Streams with exactly-once) over hand-rolled ids.'
      ],
      trade: 'A stable per-instance id is what makes zombie fencing and cross-restart dedupe work, but it must be unique, so it needs a deployment story.',
      verify: 'Each instance keeps one epoch and transactions commit without fencing errors.',
      source: 'kip98',
      view: { type: 'timeline', before: [['pod A', 'initTransactions → epoch 5', 'good'], ['pod B', 'initTransactions → epoch 6, fences A', 'bad'], ['pod A', 'send → ProducerFencedException', 'bad'], ['pod A', 'restart → epoch 7, fences B', 'bad']], after: [['pod A', 'id svc-0 → epoch 5', 'good'], ['pod B', 'id svc-1 → epoch 5', 'good'], ['both', 'commit independently', 'good'], ['crash', 'restart → fences only its zombie', 'good']], beforeText: 'The shared id makes the pods fence each other in a loop.', afterText: 'Unique ids: fencing only stops real zombies.' }
    },
    {
      title: 'Hanging transaction stalls read_committed consumers',
      context: 'A transactional producer crashes after writing records but before commit or abort, and the coordinator\'s timeout is long.',
      symptom: 'read_committed consumers stop advancing and lag grows, while read_uncommitted consumers keep going.',
      signal: 'read_committed consumer lag grows; last stable offset (LSO) frozen\nkafka-transactions.sh find-hanging',
      signalNote: 'Documented tool (KIP-664); the offsets shown are illustrative.',
      cause: 'A read_committed consumer may read only up to the last stable offset, which is the first offset of the earliest still-open transaction. One open transaction pins the LSO for the partition until it is committed or aborted.',
      fix: [
        'Run kafka-transactions.sh find-hanging to locate open transactions older than expected.',
        'Fix or restart the stuck producer so it ends the transaction, or let the coordinator abort it at transaction.timeout.ms.',
        'Use kafka-transactions.sh abort for a transaction that will never finish.',
        'Keep transaction.timeout.ms short (bounded by transaction.max.timeout.ms on the broker).'
      ],
      trade: 'A short timeout aborts slow but healthy transactions; a long one lets a dead producer block readers for that long.',
      verify: 'The LSO advances to the log end and read_committed lag drains.',
      source: 'kip664',
      view: { type: 'strip', before: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'ok'], ['4', 'open'], ['5', 'open'], ['6', 'ok'], ['7', 'ok'], ['8', 'ok'], ['9', 'ok']], marks: [['LSO = 4 (open txn)', 4, 'bad'], ['LEO = 10', 9, 'good', 'bottom']] }, after: { cells: [['0', 'ok'], ['1', 'ok'], ['2', 'ok'], ['3', 'ok'], ['4', 'aborted'], ['5', 'aborted'], ['6', 'marker'], ['7', 'ok'], ['8', 'ok'], ['9', 'ok']], marks: [['ABORT marker', 6, 'warn'], ['LSO = LEO = 10', 9, 'good', 'bottom']] }, beforeText: 'One open transaction at offset 4 pins the LSO; later committed data is hidden.', afterText: 'An ABORT marker closes it; the LSO jumps to the log end.' }
    }
  ],

  /* ───────────── 6 · Control plane ───────────── */
  6: [
    {
      title: 'Metadata quorum loses its majority',
      context: 'Three controller voters run in one rack. A power event takes two of them down.',
      symptom: 'No active controller: topic creation, leader election and broker registration stall, while data traffic on healthy leaders may continue for a while.',
      signal: 'kafka-metadata-quorum.sh --bootstrap-server <host:9092> describe --status\nActiveControllerCount = 0 on every node',
      signalNote: 'Documented tool and controller metric; output fields shown are abbreviated.',
      cause: 'The metadata log is replicated with a Raft-style protocol: an entry commits, and a leader is elected, only with a majority of voters. One of three voters alive is a minority and can neither elect nor commit.',
      fix: [
        'Check the quorum status and bring a majority of voters back (here 2 of 3).',
        'Do not force a minority to act; wait for a majority to elect a leader with a higher epoch.',
        'Place controller voters in separate failure domains and use an odd number (3 or 5).',
        'Alert on ActiveControllerCount and quorum lag.'
      ],
      trade: 'More voters tolerate more failures but each commit waits for a larger majority; two voters tolerate none.',
      verify: 'One voter reports leader and epoch, ActiveControllerCount is 1, and the high watermark advances.',
      source: 'kip595',
      view: { type: 'quorum', before: { sides: [[1, 'alive · no majority', 'bad'], [2, 'down', 'muted']] }, after: { sides: [[2, 'alive · majority · leader elected', 'good'], [1, 'down', 'muted']] }, beforeText: '1 of 3 voters is a minority: no leader, no commits.', afterText: 'Restoring one voter gives a 2-of-3 majority that can elect and commit.' }
    },
    {
      title: 'Network split: the old controller cannot commit',
      context: 'Five controller voters are split 2 | 3 by a network fault; the old active controller is on the two-voter side.',
      symptom: 'Changes sent to the old active controller hang, while the three-voter side elects a new active controller.',
      signal: 'Old side: metadata writes never commit; LeaderEpoch unchanged\nMajority side: new LeaderEpoch, ActiveControllerCount = 1',
      signalNote: 'Behaviour pattern; the epoch values are illustrative.',
      cause: 'Committing needs 3 of 5 voters. The two-voter side cannot reach a majority, so its entries stay uncommitted. The three-voter side elects a leader with a higher epoch, and brokers reject requests from the older epoch.',
      fix: [
        'Treat the majority side as authoritative and restore the network between the sides.',
        'Check quorum status from both sides to confirm who holds the higher epoch.',
        'On heal the old leader steps down and truncates its uncommitted entries; resend any change that did not commit.'
      ],
      trade: 'A split-safe design stops the minority side instead of accepting writes on both: it sacrifices availability of metadata changes on that side to avoid two authorities.',
      verify: 'All voters report the same leader and epoch and the same committed high watermark.',
      source: 'kraft',
      view: { type: 'quorum', before: { sides: [[2, 'old active · cannot commit', 'bad'], [3, 'majority · new leader (higher epoch)', 'good']] }, after: { sides: [[5, 'healed · one leader, same log', 'good']] }, beforeText: 'Only the 3-voter side can commit; the old leader\'s entries stay uncommitted.', afterText: 'After the heal there is one leader and one committed log.' }
    }
  ]
};

/* ───────────── rendering ───────────── */
const incidentState = {};
let activeIncidentChapter = 0;

function incTone(t) { return /^(good|bad|warn|muted)$/.test(t) ? t : ''; }

function incStrip(d) {
  const n = d.cells.length;
  const rowsFor = place => {
    const ms = (d.marks || []).filter(m => (m[3] === 'bottom' ? 'bottom' : 'top') === place).sort((a, b) => a[1] - b[1]);
    const rows = [], items = [];
    ms.forEach(m => {
      const i = Math.max(0, Math.min(n - 1, m[1])), span = Math.max(1, Math.min(n, Math.ceil(String(m[0]).length * n * 0.024)));
      let c0 = i, c1 = Math.min(n - 1, i + span - 1), right = false;
      if (i + span > n) { c1 = i; c0 = Math.max(0, i - span + 1); right = true; }
      let r = 0;
      while (rows[r] && rows[r].some(x => !(c1 < x[0] || c0 > x[1]))) r++;
      (rows[r] = rows[r] || []).push([c0, c1]);
      items.push(`<div class="inc-mk ${incTone(m[2])} ${right ? 'r' : 'l'}" style="grid-column:${c0 + 1}/${c1 + 2};grid-row:${r + 1}"><span>${incEsc(m[0])}</span></div>`);
    });
    return items.length ? `<div class="inc-marks ${place}" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${items.join('')}</div>` : '';
  };
  const mk = new Map((d.marks || []).map(m => [m[1], incTone(m[2])]));
  const cells = `<div class="inc-cells" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${d.cells.map((c, i) => `<span class="inc-cell ${incEsc(c[1])} ${mk.has(i) ? 'm-' + (mk.get(i) || 'x') : ''}" title="${incEsc(c[0] + ' · ' + c[1])}">${incEsc(c[0])}</span>`).join('')}</div>`;
  return `<div class="inc-strip">${rowsFor('top')}${cells}${rowsFor('bottom')}</div>`;
}

function incidentVisual(c, fixed) {
  const v = c.view, data = fixed ? v.after : v.before;
  if (v.type === 'bars') {
    const max = Math.max(...v.before, ...v.after, 1);
    return `<div class="ops-chart" role="img" aria-label="${incEsc(v.labels.map((l, i) => l + ': ' + data[i] + ' ' + v.unit).join('; '))}">${v.labels.map((l, i) => `<div class="ops-chart-row"><span>${incEsc(l)}</span><div class="ops-chart-track"><i class="${fixed ? '' : (v.hot == null || data[i] >= v.hot ? '' : 'neu')}" style="width:${Math.max(2, data[i] / max * 100)}%"></i></div><strong>${data[i]}</strong></div>`).join('')}</div><small class="ops-muted">${incEsc(v.unit)}</small>`;
  }
  if (v.type === 'replicas') return `<div class="ops-node-grid" role="img" aria-label="${incEsc(data.map(x => x[0] + ' ' + x[1]).join('; '))}">${data.map(x => `<div class="ops-node ${incTone(x[2])}"><b>${incEsc(x[0])}</b><span>${incEsc(x[1])}</span></div>`).join('')}</div>`;
  if (v.type === 'files') {
    const lg = v.legend || ['needed', 'scanned', 'skipped'], pf = v.prefix || 'S';
    return `<div class="ops-files" role="img" aria-label="${data.count} ${incEsc(pf)} files; ${data.open} scanned; ${data.needed} needed">${Array.from({ length: data.count }, (_, i) => `<span class="ops-file ${i < data.needed ? 'needed' : i < data.open ? 'open' : 'skip'}">${incEsc(pf)}${i + 1}</span>`).join('')}</div><div class="ops-file-summary"><span>● ${incEsc(lg[0])} ${data.needed}</span><span>● ${incEsc(lg[1])} ${Math.max(0, data.open - data.needed)}</span><span>● ${incEsc(lg[2])} ${data.count - Math.max(data.open, data.needed)}</span></div>`;
  }
  if (v.type === 'timeline') return `<div class="ops-time" role="img" aria-label="${incEsc(data.map(x => x[0] + ': ' + x[1]).join('; '))}">${data.map((x, i) => `${i ? '<span class="ops-time-arrow">→</span>' : ''}<div class="ops-time-point ${incTone(x[2])}"><b>${incEsc(x[0])}</b>${incEsc(x[1])}</div>`).join('')}</div>`;
  if (v.type === 'quorum') return `<div class="inc-quorum" role="img" aria-label="${incEsc(data.sides.map(s => s[0] + ' voters ' + s[1]).join('; '))}">${data.sides.map((s, i) => `${i ? '<span class="inc-qsep">║</span>' : ''}<div class="ops-quorum-side ${incTone(s[2])}"><b>${s[0]}</b>${incEsc(s[1])}</div>`).join('')}</div>`;
  if (v.type === 'strip') {
    const lab = data.cells.map(x => x[0] + ' ' + x[1]).join(', ') + '; ' + (data.marks || []).map(m => m[0]).join('; ');
    const used = new Set(data.cells.map(x => x[1])), LG = [['ok', 'committed / visible'], ['open', 'open / not yet acked'], ['gone', 'lost or deleted'], ['dup', 'replayed'], ['aborted', 'aborted'], ['marker', 'marker']];
    return `<div role="img" aria-label="${incEsc(lab)}">${incStrip(data)}</div><div class="ops-file-summary inc-legend">${LG.filter(x => used.has(x[0])).map(x => `<span class="k ${x[0]}">● ${x[1]}</span>`).join('')}</div>`;
  }
  if (v.type === 'lanes') {
    const lab = (data.laneLabels || []);
    return `<div class="inc-lanes" role="img" aria-label="${incEsc(data.items.map(x => x[0] + ' ' + (x[3] || '') + ' in ' + (lab[x[1]] || 'P' + x[1])).join('; '))}">${Array.from({ length: data.parts }, (_, p) => `<div class="inc-lane"><b>${incEsc(lab[p] || 'P' + p)}</b><div class="inc-lane-items">${data.items.filter(x => x[1] === p).map(x => `<span class="inc-chip ${incTone(x[2])}">${incEsc(x[0])}${x[3] ? `<small>${incEsc(x[3])}</small>` : ''}</span>`).join('') || '<em>empty</em>'}</div></div>`).join('')}</div>`;
  }
  return '';
}

function renderIncidents(k, host) {
  activeIncidentChapter = k;
  const cases = INCIDENTS[k], box = host.parentElement;
  box.hidden = !cases; if (!cases) return;
  box.querySelector('.stepno').innerHTML = '<i>6</i>Common problems · diagnose and fix';
  const state = incidentState[k] || (incidentState[k] = { index: 0, fixed: false }), c = cases[state.index], src = INCIDENT_SOURCES[c.source];
  host.innerHTML = `<p class="ops-muted">Choose a production scenario. The diagrams and sample signals illustrate the failure; verify against your Kafka version, client and workload.</p>
    <div class="ops-case-tabs" role="tablist" aria-label="Common problems in chapter ${k + 1}">${cases.map((v, i) => `<button role="tab" data-case="${i}" aria-selected="${state.index === i}" tabindex="${state.index === i ? 0 : -1}">${incEsc(v.title)}</button>`).join('')}</div>
    <article class="ops-incident"><h3>${incEsc(c.title)}</h3><p>${incEsc(c.symptom)}</p>
      <div class="ops-context"><div><h4>Scenario context</h4><p>${incEsc(c.context)}</p><h4 style="margin-top:12px">Why it happens</h4><p>${incEsc(c.cause)}</p></div>
      <div><h4>Error log / signal</h4><pre>${incEsc(c.signal)}</pre><small>${incEsc(c.signalNote)}</small></div></div>
      <div class="ops-stage ${state.fixed ? 'fixed' : ''}"><div class="ops-stage-head"><b>${state.fixed ? 'After mitigation' : 'Failure state'}</b><div class="ops-case-tabs" aria-label="Compare failure and mitigation"><button data-fixed="false" aria-pressed="${!state.fixed}">Failure</button><button data-fixed="true" aria-pressed="${state.fixed}">After fix</button></div></div>
      <div aria-live="polite">${incidentVisual(c, state.fixed)}<p class="ops-stage-caption">${incEsc(state.fixed ? c.view.afterText : c.view.beforeText)}</p></div></div>
      <div class="ops-fix"><h4>How to fix</h4><ol>${c.fix.map(x => `<li>${incEsc(x)}</li>`).join('')}</ol></div>
      <div class="ops-evidence"><p><b>Trade-off.</b> ${incEsc(c.trade)}</p><p><b>Verify.</b> ${incEsc(c.verify)}</p><p><b>Source.</b> <a href="${src[1]}" target="_blank" rel="noopener noreferrer">${incEsc(src[0])}</a></p></div>
    </article>`;
}

function initIncidents(host) {
  if (!host || host.dataset.incInit) return;
  host.dataset.incInit = '1';
  host.addEventListener('click', e => {
    const c = e.target.closest('[data-case]'), f = e.target.closest('[data-fixed]');
    if (!c && !f) return;
    const k = activeIncidentChapter, state = incidentState[k];
    if (!state) return;
    if (c) { state.index = +c.dataset.case; state.fixed = false; } else state.fixed = f.dataset.fixed === 'true';
    renderIncidents(k, host);
    const sel = c ? `[data-case="${state.index}"]` : `[data-fixed="${state.fixed}"]`;
    const el = host.querySelector(sel); if (el) el.focus({ preventScroll: true });
  });
  host.addEventListener('keydown', e => {
    const tab = e.target.closest('[data-case]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const tabs = [...host.querySelectorAll('[data-case]')], i = tabs.indexOf(tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  });
}
