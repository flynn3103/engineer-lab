/* Use cases for features 1 to 3: log storage, partitioning, producer.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.log = [
    {
      title: 'Finding offset 9,000,000 without a scan', short: 'segment lookup', kind: 'segfind',
      intro: 'A consumer must resume from any offset, and scanning a 1 TB partition for one is far too slow. See the three small lookups that find it.',
      trigger: 'A consumer asks for offset 9,000,000 of a partition that has four segment files (example offsets).',
      run: "kafka-dump-log.sh --files /var/kafka/orders-0/00000000000008950000.index --print-data-log\nls /var/kafka/orders-0/    # *.log, *.index, *.timeindex named by base offset",
      expect: 'The broker picks the segment by name, binary-searches a sparse index, and scans a few kilobytes of the log.',
      steps: [
        S('The partition is a directory', 'Each segment is a set of files named by the offset of its first record: <code>.log</code> (records), <code>.index</code> (offset to byte position) and <code>.timeindex</code>. Only the newest, the active segment, is written.', { sel: -1, ix: 0, scan: 0 }, '4 segments · target 9,000,000'),
        S('Pick the segment by name', 'The broker keeps the base offsets in a sorted map in memory and takes the largest base that is not above the target: 8,950,000. The other segments are not touched.', { sel: 2, ix: 0, scan: 0 }, 'segment 8,950,000'),
        S('Binary-search the sparse index', 'The index has one entry about every 4 KiB of log (<code>log.index.interval.bytes</code> = 4096), mapping a relative offset to a file position. The target is relative offset 50,000. The largest entry at or below it is 49,996 at byte 51,195,904.', { sel: 2, ix: 1, scan: 0 }, 'index: relative 49,996 at byte 51,195,904'),
        S('Scan forward a little', 'The broker reads the log from byte 51,195,904 and walks record batches until it reaches offset 9,000,000. At most about 4 KiB is skipped, a few records.', { sel: 2, ix: 1, scan: 1 }, 'scanned about 4 KiB'),
        S('Return the records', 'From there the consumer reads sequentially. Lookup cost is one map lookup, one binary search over a memory-mapped file and a short scan, whatever the partition size.', { sel: 2, ix: 1, scan: 2 }, 'cost independent of partition size'),
        S('Why the index is sparse', 'A dense index would hold an 8-byte entry per record: about 8 MiB for a 1 GiB segment of 1 KB records. The sparse one holds about 262,144 entries, 2 MiB, small enough to memory-map, at the price of the short scan.', { sel: 2, ix: 1, scan: 2, why: true }, 'dense 8 MiB vs sparse 2 MiB per 1 GiB')
      ],
      edges: [
        E('Seeking by timestamp', 'A time lookup uses the <code>.timeindex</code> to find an offset, then does the same offset lookup.', 'Use <code>offsetsForTimes</code> in the consumer API instead of scanning by time.'),
        E('Too many small segments', 'Rolling segments often (small <code>segment.bytes</code> or <code>segment.ms</code>) multiplies files and open file handles per partition.', 'Keep segments at the default 1 GiB unless a topic is tiny or retention is very short.')
      ],
      invariant: 'A record is found by its offset with a segment-name lookup, a sparse-index search and a bounded scan, never a scan of the partition.',
      src: 'Apache Kafka docs: Log (segments, <code>log.index.interval.bytes</code> 4096, <code>segment.bytes</code> 1 GiB), <code>kafka-dump-log.sh</code>. Offsets and sizes are examples.'
    },
    {
      title: 'A kill -9 and a 40-minute restart', short: 'crash recovery', kind: 'recover',
      intro: 'After an unclean shutdown a broker must prove each log is intact before it serves it. See what that check does and why it can take so long.',
      trigger: 'A broker with 4,000 partition replicas is killed with <code>kill -9</code>. Its restart takes about 40 minutes (example).',
      run: "# server.properties\nnum.recovery.threads.per.data.dir=1     # default: one thread per log directory\n# a clean stop (SIGTERM, controlled shutdown) leaves a marker and skips this check",
      expect: 'The broker re-checks every log segment after the last recovery point, one partition after another, then truncates damage and catches up from the leaders.',
      steps: [
        S('The process dies', 'There was no clean shutdown, so no clean-shutdown marker was written. On start the broker must assume any log may have a torn tail.', { at: 0, done: 0, total: 4000 }, 'no clean marker · recovery needed'),
        S('Check the unflushed tail', 'Each log dir keeps a recovery-point checkpoint: everything before it is known to be on disk. For every partition the broker re-reads the segments after that point, checking each record batch\'s CRC and rebuilding the index.', { at: 1, done: 1000, total: 4000 }, 'recovered 1,000 of 4,000 logs'),
        S('Serial work adds up', 'With one recovery thread per data directory, partitions are checked one after another. Thousands of partitions with gigabytes of tail each take tens of minutes.', { at: 1, done: 2600, total: 4000 }, 'recovered 2,600 of 4,000 logs'),
        S('Truncate at the first bad record', 'Where a batch fails its CRC, the log is cut there. Records after it are discarded on this broker. They were not committed unless other replicas hold them.', { at: 2, done: 4000, total: 4000 }, 'all logs checked · tails truncated'),
        S('Catch up from the leaders', 'The broker is now a follower for its partitions. It truncates to the leader\'s high watermark where needed and fetches what it missed, then rejoins the ISR.', { at: 3, done: 4000, total: 4000 }, 'following leaders · rejoining ISR'),
        S('How to avoid the wait', 'Stop brokers cleanly so they flush and leave the marker (controlled shutdown moves leaders away first). Add recovery threads on fast disks, and keep partitions per broker in check.', { at: 3, done: 4000, total: 4000, fix: true }, 'clean stop · more threads · fewer partitions')
      ],
      edges: [
        E('Data lost on this broker', 'Records in the truncated tail that no other replica had are gone.', 'That is why durability comes from the ISR (feature 4) and not from this broker\'s disk alone.'),
        E('Many threads on a slow disk', 'Raising recovery threads on a single spinning disk can make it slower.', 'Match threads to the number of directories and the I/O the disks can take.')
      ],
      invariant: 'After an unclean shutdown a log is served only after its tail has been verified and cut at the first corrupt record.',
      src: 'Apache Kafka docs: Log recovery, <code>num.recovery.threads.per.data.dir</code>, controlled shutdown. Partition counts and times are examples.'
    },
    {
      title: 'What the page cache protects and what it does not', short: 'page cache', kind: 'durability',
      intro: 'Kafka writes to the operating system page cache and does not fsync every record. See which failures lose data on one broker, and what covers them.',
      trigger: 'A leader acknowledges a record and fails a moment later. The question is which kind of failure that was (example scenarios).',
      run: "# defaults: no forced flush\nlog.flush.interval.messages=9223372036854775807   # Long.MAX_VALUE\nlog.flush.interval.ms=null                          # unset: the OS decides when",
      expect: 'A killed process loses nothing, a machine crash loses the unflushed tail on that broker, and replicas on other machines cover it.',
      steps: [
        S('The write path', 'The broker appends the batch to the active segment through the page cache and replies once the replicas it waits for have it. It does not call fsync for each batch. The OS writes dirty pages back on its own schedule.', { upto: 0 }, 'append to page cache · no fsync per batch'),
        S('The process is killed', 'The page cache belongs to the operating system, not the process. The data written before <code>kill -9</code> is still in it and will be flushed. Nothing is lost.', { upto: 1 }, 'process killed: no loss'),
        S('The machine or OS crashes', 'Dirty pages that were not yet written back are gone. This broker loses its unflushed tail. But a record acknowledged with acks=all is on every ISR member, so another broker has it.', { upto: 2 }, 'machine crash: loss on this broker only'),
        S('A whole rack loses power', 'If all replicas of a partition sit in one rack, all of them lose their unflushed pages together, and nobody has the record.', { upto: 3 }, 'one rack: loss on every replica'),
        S('A disk dies', 'The data on that disk is gone, and the broker is rebuilt by copying from the leaders.', { upto: 4 }, 'disk loss: rebuild from replicas'),
        S('So durability is replication', 'Spread replicas across racks or zones (rack awareness), use acks=all with a sensible <code>min.insync.replicas</code>, and leave forced flushing off except for special cases. Flushing every write would cost throughput for little gain.', { upto: 4, plan: true }, 'replicas across racks · acks=all')
      ],
      edges: [
        E('Forcing a flush', '<code>flush.messages=1</code> makes every batch wait for a disk flush and removes most of Kafka\'s throughput.', 'Do it only for a tiny, critical topic, and prefer more replicas in more failure domains.'),
        E('Stale replicas after a crash', 'A broker that crashed with a truncated tail must not become leader before it has caught up.', 'That is what the ISR rule guarantees (feature 4): only caught-up replicas are eligible.')
      ],
      invariant: 'Kafka\'s durability comes from the number and placement of in-sync replicas, not from flushing each write to disk.',
      src: 'Apache Kafka docs: Persistence and Filesystem (page cache), <code>log.flush.interval.messages</code>, <code>log.flush.interval.ms</code>, rack awareness (<code>broker.rack</code>).'
    }
  ];

  CourseData.uc.part = [
    {
      title: 'A key picks the partition', short: 'key to partition', animation: {
        kind: 'klog', partitions: 3, keys: ['seller-1', 'seller-2', 'seller-3'],
        presets: [
          { label: 'Same key, same partition', ops: ['seller-1', 'seller-2', 'seller-3', 'seller-1', 'seller-2', 'seller-1'].map(key => ({ op: 'produce', key })) },
          { label: 'Grow 3 to 6: a key moves', ops: [{ op: 'produce', key: 'seller-2' }, { op: 'produce', key: 'seller-3' }, { op: 'produce', key: 'seller-2' }, { op: 'grow', to: 6 }, { op: 'produce', key: 'seller-2' }, { op: 'produce', key: 'seller-3' }, { op: 'produce', key: 'seller-1' }] },
          { label: 'No key: spread evenly', ops: [null, null, null, null, null, null].map(key => ({ op: 'produce', key })) }
        ]
      },
      intro: 'Produce records with your own keys and watch the partition each one lands in, and the offset it gets. Then grow the topic and see why the same key can end up in two partitions.',
      trigger: 'After the team scaled a topic from 6 to 12 partitions, orders for one seller arrive out of order. Here the topic goes from 3 to 6 (example).',
      run: "kafka-topics.sh --bootstrap-server b:9092 --alter --topic orders --partitions 12\n# default partitioner with a key: toPositive(murmur2(keyBytes)) % numPartitions",
      expect: 'For a fixed partition count one key always goes to one partition, so its records stay in order. After the count changes, the same key may go elsewhere.',
      edges: [
        E('Order across keys', 'Two different keys can sit in different partitions, so there is no order between a record for seller 1 and one for seller 2.', 'Choose the key from the order you need: per order, per seller, per account.'),
        E('Plan the partition count early', 'Increasing partitions later remaps keys, and there is no way to reduce them.', 'Pick the count for the peak you expect, and for key-ordered topics create a new topic and migrate rather than grow in place.')
      ],
      invariant: 'For a fixed partition count, murmur2(key) modulo the count always names the same partition, so records of one key are totally ordered.',
      src: 'Apache Kafka docs: Producer partitioner (murmur2, keyless records), <code>kafka-topics.sh --alter</code>. murmur2 matches the Kafka test vectors.'
    },
    {
      title: 'A celebrity key melts one partition', short: 'key skew', kind: 'skew',
      intro: 'A key sends all its records to one partition. When one key is far busier than the rest, one partition and one consumer carry most of the load.',
      trigger: 'Orders are keyed by <code>seller_id</code>. During a flash sale seller 17 produces 20 MB/s into one partition while the others carry 3 MB/s each. A consumer handles about 10 MB/s per partition (example numbers).',
      run: "kafka-consumer-groups.sh --bootstrap-server b:9092 --describe --group billing   # LAG per partition\n# one partition with lag growing, the others near zero",
      expect: 'The hot partition\'s consumer cannot keep up and lag grows, while the other consumers idle.',
      steps: [
        S('Evenly spread keys', 'With many sellers of similar size the hash spreads records evenly. Each of the 6 partitions carries about 3 MB/s.', { rows: [3, 3, 3, 3, 3, 3], cap: 10 }, 'busiest partition: 3 MB/s'),
        S('One seller floods', 'Seller 17 sends 20 MB/s. All its records share one key, so they go to one partition: that partition now carries 23 MB/s.', { rows: [3, 3, 3, 3, 3, 23], cap: 10 }, 'busiest partition: 23 MB/s'),
        S('The consumer cannot keep up', 'One consumer reads that partition and handles 10 MB/s. Lag grows by 13 MB/s, while five other consumers sit mostly idle. Adding consumers does not help: a partition has one reader per group.', { rows: [3, 3, 3, 3, 3, 23], cap: 10, lag: true }, 'lag grows 13 MB/s'),
        S('Salt the key', 'Use a compound key such as (seller, salt) with a small salt, so seller 17 spreads over several partitions. Load evens out to about 6 MB/s each.', { rows: [6, 6, 6, 6, 6, 5], cap: 10, salt: true }, 'busiest partition: 6 MB/s'),
        S('The price of salting', 'Records of seller 17 are now in several partitions, so their relative order is lost. It is only acceptable if consumers do not need per-seller order.', { rows: [6, 6, 6, 6, 6, 5], cap: 10, salt: true, order: true }, 'per-seller order lost'),
        S('Match the key to the ordering you need', 'If order per order id is enough, key by order id: it spreads perfectly and keeps each order\'s events in order. Key by seller only if seller-level order is a real requirement.', { rows: [6, 6, 6, 6, 6, 5], cap: 10, byOrder: true }, 'key by order id')
      ],
      edges: [
        E('Hot key with order required', 'If one seller\'s events must be strictly ordered and the seller is huge, partitioning cannot fix it.', 'Split the work downstream (a single ordered stream per seller, a stateful processor with batching) or accept sequencing per sub-entity.'),
        E('Skew you cannot see in totals', 'Topic-level throughput looks fine while one partition is saturated.', 'Monitor bytes in and consumer lag per partition, not only per topic.')
      ],
      invariant: 'All records with one key go to one partition, and a partition is read by at most one consumer of a group.',
      src: 'Apache Kafka docs: Producer (keys and partitioner), Consumer groups (<code>kafka-consumer-groups.sh --describe</code>). Rates are examples.'
    },
    {
      title: 'Partitions cap consumer parallelism', short: 'parallelism', kind: 'parallel',
      intro: 'In a group each partition is read by exactly one consumer, so the number of partitions is the most consumers that can work in parallel.',
      trigger: 'A topic has 6 partitions and the team scales its consumers from 3 to 8 to clear a backlog (example).',
      run: "kafka-topics.sh --bootstrap-server b:9092 --describe --topic orders      # PartitionCount\nkafka-consumer-groups.sh --bootstrap-server b:9092 --describe --group billing",
      expect: 'Up to 6 consumers each take a partition. The 7th and 8th get nothing and sit idle.',
      steps: [
        S('Three consumers, six partitions', 'Each consumer reads two partitions. Work is shared evenly.', { c: 3, p: 6 }, 'each consumer: 2 partitions'),
        S('Six consumers', 'Each consumer reads one partition. This is the most parallelism the topic can give one group.', { c: 6, p: 6 }, 'each consumer: 1 partition'),
        S('Eight consumers', 'There are only 6 partitions. Two consumers receive no partition and are idle. They cost money and add rebalance work, and they speed nothing up.', { c: 8, p: 6 }, '2 consumers idle'),
        S('Adding partitions raises the cap', 'Raising the topic to 12 partitions lets all 8 consumers work. But it remaps keys (see the first use case of this feature) so key-ordered topics need care.', { c: 8, p: 12 }, 'all 8 consumers busy'),
        S('Size the count for the target', 'Choose partitions from the throughput you need divided by what one consumer can handle (here about 5 for 50 MB/s at 10 MB/s each), and add headroom for the consumers you may run.', { c: 8, p: 12, size: true }, 'partitions ≥ peak consumers'),
        S('Each group is independent', 'Another group reading the same topic gets its own full set of assignments. Twelve groups can each use all the partitions without affecting one another.', { c: 8, p: 12, groups: true }, 'groups do not compete')
      ],
      edges: [
        E('Too many partitions', 'Every partition is files, memory and a replica to elect on failure, and a controller to keep up with.', 'Keep the count to what you need, and avoid tens of thousands of partitions per broker.'),
        E('Slow consumers, few partitions', 'If one record takes seconds to process, the only way to scale is more partitions or concurrency inside a consumer.', 'Process records of one partition on a thread pool carefully (keeping per-key order), or add partitions.')
      ],
      invariant: 'Within one consumer group, a partition is assigned to at most one consumer, so parallelism cannot exceed the partition count.',
      src: 'Apache Kafka docs: Consumer groups and partition assignment, <code>kafka-topics.sh --describe</code>. Counts and rates are examples.'
    }
  ];

  CourseData.uc.prod = [
    {
      title: 'Batching: linger.ms and batch.size', short: 'batching', kind: 'batchfill',
      intro: 'Sending one request per record wastes the broker on overhead. The producer groups records per partition and sends when a batch is full or has waited long enough.',
      trigger: 'Brokers run at 90% CPU serving one request per event though bandwidth is low. Records of 1 KB arrive for one partition (example rates).',
      run: "# producer config\nlinger.ms=5        # default: 0 before Kafka 4.0, 5 from 4.0 (check your version)\nbatch.size=16384   # default: 16 KiB per partition batch",
      expect: 'At low rates, linger.ms turns many tiny requests into a few batches. At high rates the batch fills first and is sent at once.',
      steps: [
        S('No linger, low rate', 'With <code>linger.ms=0</code> and one record every millisecond, each record is sent as soon as the sender is free. That is about 1,000 requests a second for one partition, each with its own overhead.', { rate: 1, linger: 0, closes: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, '1,000 requests/s'),
        S('Linger 5 ms', 'With <code>linger.ms=5</code> the producer holds the open batch for up to 5 ms. About 5 records collect and go in one request: 200 requests a second, at the price of up to 5 ms of added latency.', { rate: 1, linger: 5, closes: [5] }, '200 requests/s · +5 ms at most'),
        S('A high rate fills the batch first', 'At 10 records per millisecond a 16 KiB batch holds about 16 records and fills in about 1.6 ms, long before 5 ms. It is sent when full, so linger does not add latency.', { rate: 10, linger: 5, closes: [1.6, 3.2] }, 'batch full at 16 KiB first'),
        S('Compression is per batch', 'Records are compressed together (<code>compression.type</code>). A larger batch compresses better, and the broker stores the batch as received, so the saving applies to disk, replication and consumers.', { rate: 10, linger: 5, closes: [1.6, 3.2], comp: true }, 'bigger batches compress better'),
        S('Bounded in-flight work', 'Each connection allows <code>max.in.flight.requests.per.connection</code> (5 by default) requests, and unsent batches wait in <code>buffer.memory</code> (32 MiB). A full buffer blocks <code>send()</code> for up to <code>max.block.ms</code> (60 s).', { rate: 10, linger: 5, closes: [1.6, 3.2], mem: true }, 'in-flight 5 · buffer 32 MiB'),
        S('Choose by latency budget', 'A few milliseconds of linger is cheap for most services. Set it from the delay you can tolerate, and size <code>batch.size</code> from how many records you want per request at peak.', { rate: 1, linger: 5, closes: [5], plan: true }, 'tune by latency budget')
      ],
      edges: [
        E('Many partitions dilute batches', 'A producer keeps one batch per partition, so a spread of keys across hundreds of partitions makes many small batches.', 'Use fewer partitions for low-rate topics, or a sticky partitioner for keyless records so records fill one partition\'s batch at a time.'),
        E('Linger adds to every send', 'For a latency-critical call, even 5 ms of linger is too much, and flush() may be needed.', 'Use a topic or producer with linger.ms=0 for that path, and keep high-volume paths on a larger linger.')
      ],
      invariant: 'A batch is sent when it reaches batch.size or when linger.ms has passed since its first record, whichever comes first.',
      src: 'Apache Kafka docs: Producer configs (<code>linger.ms</code>, <code>batch.size</code> 16384, <code>buffer.memory</code>, <code>max.in.flight.requests.per.connection</code> 5, <code>max.block.ms</code> 60000), KIP-1030 for the 4.0 default. Rates are examples.'
    },
    {
      title: 'A lost ack and a safe retry', short: 'idempotence', kind: 'dedup',
      intro: 'If an acknowledgement is lost, the producer cannot know whether the write happened and retries. Sequence numbers let the broker recognise the repeat.',
      trigger: 'A lost ack made a producer retry, and finance sees one order twice (example).',
      run: "# producer config: on by default since Kafka 3.0 (KIP-679)\nenable.idempotence=true\nacks=all\nmax.in.flight.requests.per.connection=5   # up to 5 keeps order with idempotence",
      expect: 'The broker writes the batch once, drops the repeat, and still acknowledges it.',
      steps: [
        S('Send with a sequence number', 'The broker gave the producer an id (PID) at startup. Each batch carries a sequence number per partition. The first batch is sequence 0.', { k: 1 }, 'batch seq 0 sent'),
        S('The broker appends and acknowledges', 'The broker appends the batch and replies. The reply is lost on the network.', { k: 2 }, 'ack lost'),
        S('The producer retries', 'No ack arrives before the request times out, so the producer sends the same batch again with the same sequence number 0.', { k: 3 }, 'retry of seq 0'),
        S('The broker recognises it', 'The broker remembers the last sequences it wrote for this producer and partition. Sequence 0 is already written, so it drops the duplicate and acknowledges again. The record exists once.', { k: 4 }, 'duplicate dropped · acked'),
        S('The next batch continues', 'Sequence 1 follows 0, so it is appended normally.', { k: 5 }, 'seq 1 appended'),
        S('A gap is an error', 'If sequence 3 arrived while 2 never did, the broker rejects it with an out-of-order-sequence error rather than writing records out of order. The producer must not skip.', { k: 6 }, 'gap rejected: OutOfOrderSequence')
      ],
      edges: [
        E('Only one producer session', 'The PID is new after a producer restart, so a record resent by the application after a restart is not recognised as a duplicate.', 'For exactly-once across restarts use transactions with a stable <code>transactional.id</code> (feature 8) or make consumers idempotent.'),
        E('Deduplication state is bounded', 'The broker keeps the last few batches\' sequences per producer and partition (five).', 'That is why in-flight requests above 5 are not allowed with idempotence.')
      ],
      invariant: 'With idempotence a batch identified by producer id, partition and sequence number is written at most once, in order.',
      src: 'Apache Kafka docs: Producer configs (<code>enable.idempotence</code>), Message delivery semantics, KIP-98, KIP-679 (idempotence on by default in 3.0).'
    },
    {
      title: 'Which settings give which guarantee', short: 'acks and retries', kind: 'settings',
      intro: 'Delivery guarantees come from a handful of producer settings that work together. See what each combination actually promises.',
      trigger: 'A service writes orders with the defaults it inherited, and nobody knows whether it can lose or duplicate them (example).',
      run: "# the combination that protects an order stream\nacks=all\nenable.idempotence=true\nmin.insync.replicas=2   # on the topic or broker",
      expect: 'acks=all with idempotence and a sensible min.insync.replicas gives no loss on a single broker failure and no duplicates from retries.',
      steps: [
        S('acks=1 with retries', 'The leader acknowledges after its own append. If it dies before followers copy the record, an acknowledged record is lost. A retry after a lost ack can also duplicate it.', { upto: 1 }, 'can lose and duplicate'),
        S('acks=all without idempotence', 'The record is on every ISR member before the ack, so it survives a leader failure. But a retry after a lost ack still writes a second copy.', { upto: 2 }, 'no loss · duplicates possible'),
        S('Add idempotence', 'Sequence numbers drop duplicate retries. With acks=all this is the default since Kafka 3.0 and gives no loss on a leader failure and no duplicates from retries, within one producer session.', { upto: 3 }, 'no loss · no duplicate retries'),
        S('Many in-flight requests without idempotence', 'If batch 1 fails and batch 2 succeeds, a retry of batch 1 lands after batch 2: the order is broken. Idempotence prevents this for up to 5 in-flight requests.', { upto: 4 }, 'order can break without idempotence'),
        S('A deadline for all of it', '<code>delivery.timeout.ms</code> (120 s by default) bounds the whole send including retries, and <code>request.timeout.ms</code> (30 s) bounds each request. After the deadline the send fails and the application must decide.', { upto: 5 }, 'send fails after delivery.timeout.ms'),
        S('Pair it with min.insync.replicas', 'acks=all alone still acknowledges with an ISR of one. Setting <code>min.insync.replicas=2</code> makes the leader refuse writes when fewer than two replicas are in sync, so a single further failure cannot lose an acknowledged record.', { upto: 5, minisr: true }, 'acks=all + min.insync.replicas=2')
      ],
      edges: [
        E('acks=0', 'The producer does not wait for any reply, so a failed send is not even noticed.', 'Use it only for data you can afford to lose silently, such as sampled metrics.'),
        E('Application-level resends', 'Resending after the application catches an exception creates a new producer batch with a new sequence, which idempotence cannot recognise.', 'Let the producer\'s own retries run to the delivery timeout, and make downstream consumers tolerate a rare duplicate.')
      ],
      invariant: 'No loss on one broker failure needs acks=all with min.insync.replicas of at least 2, and no duplicate retries needs idempotence.',
      src: 'Apache Kafka docs: Producer configs (<code>acks</code>, <code>retries</code>, <code>delivery.timeout.ms</code> 120000, <code>request.timeout.ms</code> 30000), Message delivery semantics.'
    }
  ];
})();
