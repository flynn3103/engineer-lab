/* Use cases for features 7 to 9: retention and compaction, transactions, KRaft.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const K = 'kept', D = 'delete', A = 'active';

  CourseData.uc.ret = [
    {
      title: 'Retention deletes whole segments', short: 'time retention', kind: 'retain',
      intro: 'Kafka deletes data by closed segment, not by record. See which segments go when retention is 7 days, and which old data survives.',
      trigger: 'Disks fill within days though <code>retention.ms</code> is 7 days. Some old records are still there (example segment ages).',
      run: "kafka-configs.sh --bootstrap-server b:9092 --entity-type topics --entity-name orders --describe\n# retention.ms=604800000 (7 days)  retention.bytes=-1 (no size limit)  segment.ms=604800000",
      expect: 'A closed segment is deleted only when its newest record is older than the retention time. The active segment is never deleted.',
      steps: [
        S('Five segments', 'A partition holds closed segments, with the age in days of the newest record in each, and one active segment still being written. Retention is 7 days.', { rows: [['segment 0', 9, K], ['segment 1', 8, K], ['segment 2', 6, K], ['segment 3', 3, K], ['segment 4 (active)', 0, A]] }, 'retention.ms = 7 days'),
        S('The retention check runs', 'Every 5 minutes (<code>log.retention.check.interval.ms</code>) the broker looks at closed segments. Segments 0 and 1 have a newest record older than 7 days, so both are deleted.', { rows: [['segment 0', 9, D], ['segment 1', 8, D], ['segment 2', 6, K], ['segment 3', 3, K], ['segment 4 (active)', 0, A]] }, 'segments 0 and 1 deleted'),
        S('Segments go whole', 'Segment 2\'s newest record is 6 days old, so the whole segment stays, including its oldest records, which may be 9 days old. Data can outlive retention until its segment is closed and old enough.', { rows: [['segment 0', 9, D], ['segment 1', 8, D], ['segment 2', 6, K], ['segment 3', 3, K], ['segment 4 (active)', 0, A]], whole: true }, 'old records inside a kept segment'),
        S('The active segment is never deleted', 'A quiet topic can write one segment for weeks. Until it rolls, by <code>segment.bytes</code> (1 GiB) or <code>segment.ms</code> (7 days), nothing in it is deleted, however old.', { rows: [['segment 0', 9, D], ['segment 1', 8, D], ['segment 2', 6, K], ['segment 3', 3, K], ['segment 4 (active)', 20, A]], quiet: true }, 'active segment holds 20-day-old data'),
        S('A size limit also deletes', '<code>retention.bytes</code> (per partition, default -1 for none) deletes the oldest closed segments when the partition is over the limit, whichever limit is hit first.', { rows: [['segment 0', 9, D], ['segment 1', 8, D], ['segment 2', 6, D], ['segment 3', 3, K], ['segment 4 (active)', 0, A]], size: true }, 'oldest segments over the size limit go'),
        S('Deletion is delayed a little', 'A segment chosen for deletion is first renamed with a <code>.deleted</code> suffix and its files are removed after <code>file.delete.delay.ms</code> (60 s), so a consumer that has the file open can finish reading it.', { rows: [['segment 0', 9, D], ['segment 1', 8, D], ['segment 2', 6, K], ['segment 3', 3, K], ['segment 4 (active)', 0, A]], delay: true }, 'files removed after 60 s')
      ],
      edges: [
        E('Low-traffic topics keep data too long', 'A topic with little traffic fills a segment slowly, so its data far outlives retention.', 'Set <code>segment.ms</code> shorter on such topics so segments roll and become deletable.'),
        E('Retention shorter than a consumer outage', 'A consumer that is down longer than retention loses data it never read.', 'Alert on lag against retention headroom (feature 5) and size retention for your longest outage.')
      ],
      invariant: 'Retention removes whole closed segments whose newest record is past the limit, and never touches the active segment.',
      src: 'Apache Kafka docs: Topic configs (<code>retention.ms</code> 604800000, <code>retention.bytes</code> -1, <code>segment.ms</code>, <code>segment.bytes</code>, <code>file.delete.delay.ms</code> 60000), Broker configs (<code>log.retention.check.interval.ms</code> 300000).'
    },
    {
      title: 'Log compaction keeps the latest value per key', short: 'compaction', kind: 'compactkeys',
      intro: 'A compacted topic does not expire by time. It keeps at least the latest record for each key, which makes it a table of current values.',
      trigger: 'A "latest price per product" topic must keep only the newest value per key, yet new consumers must be able to rebuild the whole table (example records).',
      run: "kafka-configs.sh --bootstrap-server b:9092 --entity-type topics --entity-name prices --alter --add-config cleanup.policy=compact\n# a record with a null value is a tombstone: it deletes the key",
      expect: 'After cleaning only the newest record per key remains in the older part of the log, with offsets unchanged. A tombstone is kept for a while, then removed.',
      steps: [
        S('A compacted topic', 'With <code>cleanup.policy=compact</code> the log keeps the latest value for every key instead of expiring by age. It is the log form of a table, used for changelogs and configuration.', { phase: 0 }, 'cleanup.policy = compact'),
        S('The log before cleaning', 'Seven records: key k1 appears three times, k2 twice (the second a tombstone with a null value), k3 twice. Offsets 0 to 6.', { phase: 1 }, '7 records, 3 keys'),
        S('The cleaner marks stale records', 'A background cleaner works on the older part of the log (not the active segment). A record is stale if a later record has the same key. Here offsets 0, 1, 2 and 3 are stale.', { phase: 2 }, 'stale: 0, 1, 2, 3'),
        S('After cleaning', 'Stale records are dropped and the segment is rewritten. Offsets of the survivors do not change, so there are gaps. Reading from the start still gives the latest value of every key.', { phase: 3 }, 'kept: offsets 4, 5, 6'),
        S('Tombstones', 'The null value for k2 deletes the key. The tombstone itself is kept for <code>delete.retention.ms</code> (24 hours) so slow consumers see the delete. After that it is removed too.', { phase: 4 }, 'tombstone kept 24 hours'),
        S('When it runs', 'The cleaner starts when the share of uncleaned records passes <code>min.cleanable.dirty.ratio</code> (0.5 by default). Until then older duplicates stay, so a compacted topic may hold more than the latest value for a while.', { phase: 5 }, 'dirty ratio 0.5 by default')
      ],
      edges: [
        E('Records without keys', 'A compacted topic requires every record to have a key.', 'Use a key for each logical entity, or do not use compaction.'),
        E('Compaction is not instant', 'A consumer can still read older values of a key that have not been cleaned yet.', 'Treat compaction as a storage optimisation: consumers must apply the last value they see, not assume only one exists.')
      ],
      invariant: 'A compacted log always keeps at least the latest record of every key, with its original offset.',
      src: 'Apache Kafka docs: Log compaction (<code>cleanup.policy</code>, <code>min.cleanable.dirty.ratio</code> 0.5, <code>delete.retention.ms</code> 86400000).'
    },
    {
      title: 'Tiered storage: recent data local, old data remote', short: 'tiered storage', kind: 'tier',
      intro: 'Keeping a month of data on broker disks is expensive. Tiered storage moves closed segments to remote storage and keeps only recent data local.',
      trigger: 'The team wants 30 days of history at 4.3 TB a day, but local disks only fit a few days (example sizes).',
      run: "# topic config (tiered storage must be enabled on the brokers)\nremote.storage.enable=true\nlocal.retention.ms=86400000      # keep 1 day on local disks\nretention.ms=2592000000          # 30 days in total",
      expect: 'Local disks hold about a day, the remote tier holds the rest, and recent reads stay fast.',
      steps: [
        S('Everything on local disks', 'Thirty days at 4.3 TB a day, with 3 replicas, is about 390 TB on broker disks. It is a lot of disk for data that is rarely read.', { local: 390, remote: 0, label: '30 days × 4.3 TB × 3 replicas' }, 'local 390 TB'),
        S('Enable tiered storage', 'Closed segments are copied to remote storage (an object store, through a plugin) shortly after they roll. Tiered storage is production-ready from Kafka 3.9.', { local: 390, remote: 60, label: 'copying closed segments' }, 'copying to remote'),
        S('Shrink the local retention', 'With <code>local.retention.ms</code> of 1 day, brokers delete the local copy once a segment is uploaded and older than a day. Local use drops to about 13 TB.', { local: 13, remote: 129, label: 'local 1 day, remote the rest' }, 'local 13 TB · remote 129 TB'),
        S('Reads', 'Consumers of recent data read from local disks and the page cache as before. A consumer replaying old data is served from remote storage with higher latency, and does not disturb the brokers\' local cache as much.', { local: 13, remote: 129, label: 'recent local, old remote', reads: true }, 'old reads are slower'),
        S('Faster broker replacement', 'A new broker only needs to copy the local part, about a day of data, before it can join the ISR. Moving partitions is far quicker.', { local: 13, remote: 129, label: 'only local data is copied', fast: true }, 'recovery copies 1 day, not 30'),
        S('Limits to check', 'Check your version for features not supported with tiered storage (such as compacted topics), and test the remote store\'s throughput and cost for replays before relying on it.', { local: 13, remote: 129, label: 'check limits', limits: true }, 'verify support and cost')
      ],
      edges: [
        E('Remote reads are slower', 'A replay of a month of history is limited by the object store, not by broker disks.', 'Run large replays in off-peak hours, and measure throughput before promising a replay time.'),
        E('The remote copy has its own durability', 'The remote tier holds one logical copy, relying on the store for durability, not on Kafka replicas.', 'Pick a store with the durability you need, and keep local retention long enough for your recovery plans.')
      ],
      invariant: 'A segment is deleted locally only after it has been copied to remote storage, and recent data is always served from local disks.',
      src: 'Apache Kafka docs: Tiered Storage (KIP-405, <code>remote.storage.enable</code>, <code>local.retention.ms</code>), production-ready from 3.9. Sizes are examples.'
    }
  ];

  CourseData.uc.txn = [
    {
      title: 'Read, process and write atomically', short: 'transaction flow', kind: 'txnflow',
      intro: 'A job reads orders, writes invoices and commits its offset. A crash between the writes causes duplicates. A transaction makes the writes and the offset commit succeed or fail together.',
      trigger: 'A crash between writing invoices and committing the input offset causes duplicate invoices (example).',
      run: "producer.initTransactions();\nproducer.beginTransaction();\nproducer.send(invoice);\nproducer.sendOffsetsToTransaction(offsets, consumerGroupMetadata);\nproducer.commitTransaction();",
      expect: 'The invoices and the consumer offset become visible together, or none of them does.',
      steps: [
        S('Register the transactional id', '<code>initTransactions()</code> registers <code>transactional.id</code> with the transaction coordinator, a broker, which returns a producer id and an epoch.', { n: 1 }, 'PID and epoch assigned'),
        S('Write output records', 'The producer tells the coordinator which partitions it will write, then sends the invoices to them. The records are in the log, but read_committed consumers do not see them yet.', { n: 3 }, 'records written, not visible'),
        S('Add the input offsets', '<code>sendOffsetsToTransaction</code> registers the consumer group\'s offsets in the same transaction. They are written to the offsets topic as pending.', { n: 5 }, 'offsets pending'),
        S('Commit', '<code>commitTransaction()</code> asks the coordinator to finish. This is the last client step.', { n: 6 }, 'commit requested'),
        S('The decision is logged', 'The coordinator writes PREPARE_COMMIT to its own transaction log. From this moment the transaction will complete even if the coordinator crashes.', { n: 7 }, 'PREPARE_COMMIT logged'),
        S('Markers make it visible', 'The coordinator writes a COMMIT marker into every partition involved, including the offsets topic. When the markers are in, the invoices and the offset become visible to everyone at once.', { n: 9 }, 'markers written · visible together')
      ],
      edges: [
        E('Transactions are within Kafka', 'The guarantee covers records written to Kafka and offsets committed through the transaction. A write to an external database is outside it.', 'Make external writes idempotent, or use a transactional outbox pattern.'),
        E('A cost per transaction', 'Each transaction adds coordinator requests and markers, so very small transactions are expensive.', 'Commit every 100 ms or so rather than per record, batching many records into one transaction.')
      ],
      invariant: 'All records and offsets of a transaction become visible together, once the commit markers are written, or none of them do.',
      src: 'Apache Kafka docs: Transactions (KIP-98), <code>transactional.id</code>, <code>sendOffsetsToTransaction</code>, Message delivery semantics.'
    },
    {
      title: 'Fencing a zombie producer', short: 'zombie fencing', kind: 'fence',
      intro: 'A paused or partitioned producer can come back after its work was taken over. The epoch on its transactional id stops it from writing.',
      trigger: 'An instance pauses for a long garbage collection. The orchestrator starts a replacement with the same transactional id (example).',
      run: "# same transactional.id on the old and the new instance\ntransactional.id=billing-1\ntransaction.timeout.ms=60000   # default: an open transaction is aborted after 60 s",
      expect: 'The replacement bumps the epoch and aborts the old transaction. When the old instance wakes up its writes are rejected.',
      steps: [
        S('The old instance works', 'It registered <code>billing-1</code>, got epoch 5, and has a transaction in progress.', { n: 2 }, 'epoch 5 · transaction open'),
        S('A long pause', 'The old instance stops responding: a long GC pause or a network partition. It does not know it is about to be replaced.', { n: 3 }, 'old instance paused'),
        S('The replacement starts', 'The new instance calls <code>initTransactions()</code> with the same transactional id. The coordinator bumps the epoch to 6 and aborts the old instance\'s open transaction.', { n: 5 }, 'epoch 6 · old transaction aborted'),
        S('The zombie wakes up', 'The old instance continues as if nothing happened and sends a record with epoch 5.', { n: 6 }, 'write with epoch 5'),
        S('It is fenced', 'The broker sees an epoch older than the current one and rejects the write with a producer-fenced error. The old instance must shut down. No duplicate output is written.', { n: 7 }, 'ProducerFencedException'),
        S('Why the id must be stable', 'Fencing works only because both instances use the same <code>transactional.id</code>. A random id per instance would give no epoch to compare, and a zombie could write duplicates.', { n: 7, why: true }, 'stable id = working fence')
      ],
      edges: [
        E('One id per partition of input', 'In a consumer-producer app each input partition (or task) needs its own transactional id, or fencing hits healthy instances.', 'Derive the id from the input partition or the stream task, as Kafka Streams does.'),
        E('The transaction timeout', 'A transaction left open by a crashed producer holds back read_committed consumers until it is aborted.', 'Keep <code>transaction.timeout.ms</code> as short as your longest transaction allows (default 60 s).')
      ],
      invariant: 'A producer with an older epoch for a transactional id cannot write once a newer epoch has been issued.',
      src: 'Apache Kafka docs: Transactions (producer epoch, fencing), <code>transaction.timeout.ms</code> 60000, <code>ProducerFencedException</code>.'
    },
    {
      title: 'read_committed and the last stable offset', short: 'read_committed', kind: 'lso',
      intro: 'A read_committed consumer must not see records of a transaction until it commits. One open transaction therefore holds the reader back, even from unrelated committed records after it.',
      trigger: 'A producer opened a transaction and has not finished it. Other producers keep writing to the same partition (example).',
      run: "# consumer config\nisolation.level=read_committed   # default: read_uncommitted\n# transactions that are open: kafka-transactions.sh --bootstrap-server b:9092 list",
      expect: 'The reader stops at the last stable offset, the first offset of the oldest open transaction, until it commits or aborts.',
      steps: [
        S('Records and an open transaction', 'Offsets 0 to 4 are written. Records 1 and 3 belong to transaction A, still open. Records 0, 2 and 4 are plain committed writes. The high watermark is 5.', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p']], lso: 1, hw: 5, mode: 'none' }, 'high watermark 5 · LSO 1'),
        S('read_uncommitted reads all', 'The default isolation level reads every record up to the high watermark, offsets 0 to 4, including records 1 and 3 that may still abort.', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p']], lso: 1, hw: 5, mode: 'unc' }, 'reads 0 to 4'),
        S('read_committed stops at the LSO', 'The last stable offset is 1, the first offset of the oldest open transaction. A read_committed consumer reads only offset 0. Records 2 and 4 are committed plain writes, but sit behind the open transaction and are held back.', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p']], lso: 1, hw: 5, mode: 'com' }, 'reads 0 only'),
        S('The transaction commits', 'A COMMIT marker is written at offset 5. The LSO moves to 6 and the consumer now returns records 1 to 4 (markers are filtered out).', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p'], ['C', 'c']], lso: 6, hw: 6, mode: 'com' }, 'LSO 6 · reads 0 to 4'),
        S('Or it aborts', 'With an ABORT marker the same consumer skips records 1 and 3 entirely and returns 0, 2 and 4. A read_uncommitted consumer had already seen 1 and 3.', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p'], ['A', 'a']], lso: 6, hw: 6, mode: 'abort' }, 'skips 1 and 3'),
        S('A hung transaction', 'If a producer dies without finishing, nothing moves the LSO until the coordinator aborts the transaction after <code>transaction.timeout.ms</code> (60 s by default). Until then read_committed lag grows although the broker is healthy.', { recs: [['0', 'p'], ['1', 't'], ['2', 'p'], ['3', 't'], ['4', 'p']], lso: 1, hw: 5, mode: 'com', hung: true }, 'LSO stuck until the timeout')
      ],
      edges: [
        E('Long transactions hurt readers', 'A transaction held open for minutes delays every read_committed consumer of its partitions.', 'Keep transactions short, and monitor the gap between the log end and the last stable offset.'),
        E('The default isolation level', 'A consumer left on read_uncommitted sees records of transactions that later abort.', 'Set read_committed on every consumer of a topic written by transactional producers.')
      ],
      invariant: 'A read_committed consumer returns only records below the last stable offset, and never the records of an aborted transaction.',
      src: 'Apache Kafka docs: Consumer configs (<code>isolation.level</code>), Transactions (last stable offset, control records), <code>transaction.timeout.ms</code> 60000.'
    }
  ];

  CourseData.uc.kraft = [
    {
      title: 'Electing the active controller', short: 'controller election', animation: {
        kind: 'raft', n: 3, split: [[0], [1, 2]], cmd: 'CreateTopic',
        presets: [
          { label: 'A controller wins the election', ops: [{ op: 'timeout', n: 0 }] },
          { label: 'The active controller crashes', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'CreateTopic orders' }, { op: 'crash', n: 0 }, { op: 'timeout', n: 1 }, { op: 'restart', n: 0 }] },
          { label: 'An isolated controller cannot lead', ops: [{ op: 'partition', sides: [[0], [1, 2]] }, { op: 'timeout', n: 0 }, { op: 'timeout', n: 1 }] }
        ]
      },
      intro: 'In KRaft a quorum of controllers runs Raft. One is the active controller and the others are followers. Crash it, or cut it off, and see a new active controller take over with a higher epoch.',
      trigger: 'Who decides which broker leads each partition, and what happens if that decider dies? Three controllers form the quorum (example).',
      run: "kafka-metadata-quorum.sh --bootstrap-server b:9092 describe --status   # LeaderId, LeaderEpoch, CurrentVoters\n# controller.quorum.voters=1@c1:9093,2@c2:9093,3@c3:9093",
      expect: 'A controller needs votes from a majority (2 of 3) to be active. An isolated controller cannot become active, and one controller failure is survived.',
      edges: [
        E('Even-sized quorums', 'Four controllers tolerate only one failure, the same as three.', 'Run 3 controllers (tolerate 1 failure) or 5 (tolerate 2).'),
        E('Losing a majority', 'With 2 of 3 controllers down, metadata cannot change: no new topics, no leader elections.', 'Existing leaders keep serving data, but recover the quorum before any failure needs a new leader.')
      ],
      invariant: 'There is at most one active controller per epoch, and it needs votes from a majority of the quorum.',
      src: 'Apache Kafka docs: KRaft (KIP-500, KIP-595, KIP-631), <code>kafka-metadata-quorum.sh</code>. The animation is the same simplified Raft model with three voters.'
    },
    {
      title: 'A metadata change is a log entry', short: 'metadata log', animation: {
        kind: 'raft', n: 3, split: [[0], [1, 2]], cmd: 'CreateTopic',
        presets: [
          { label: 'A change is committed by a majority', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'CreateTopic orders' }, { op: 'client', cmd: 'AlterIsr p0' }] },
          { label: 'A lagging controller catches up', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'A' }, { op: 'crash', n: 2 }, { op: 'client', cmd: 'B' }, { op: 'restart', n: 2 }, { op: 'client', cmd: 'C' }] },
          { label: 'No majority, no change', ops: [{ op: 'timeout', n: 0 }, { op: 'crash', n: 1 }, { op: 'crash', n: 2 }, { op: 'client', cmd: 'CreateTopic' }] }
        ]
      },
      intro: 'Every change to cluster metadata (a topic, a partition leader, an ISR change) is a record in the metadata log. Send changes to the leader and watch when each is committed.',
      trigger: 'An operator creates a topic while one controller is down. The change must be durable and the same on every controller (example).',
      run: "kafka-topics.sh --bootstrap-server b:9092 --create --topic orders --partitions 24 --replication-factor 3\nkafka-dump-log.sh --cluster-metadata-decoder --files /var/kafka/__cluster_metadata-0/00000000000000000000.log",
      expect: 'The change is committed when 2 of 3 controllers store it, and a controller that was down catches up from the leader when it returns.',
      edges: [
        E('Metadata is a topic', 'The metadata log is a single-partition log named <code>__cluster_metadata</code>, with snapshots to bound its size.', 'Treat it like any other log for monitoring: watch its lag on the brokers.'),
        E('Too slow a disk', 'Every metadata change waits for a majority to flush it, so a slow controller disk slows all changes.', 'Put controllers on fast disks and keep them off busy data brokers in large clusters.')
      ],
      invariant: 'A metadata change takes effect only after a majority of controllers have stored it, so it is never lost by a controller failover.',
      src: 'Apache Kafka docs: KRaft metadata log (<code>__cluster_metadata</code>, snapshots), <code>kafka-dump-log.sh --cluster-metadata-decoder</code>.'
    },
    {
      title: 'Brokers follow the metadata log and get fenced', short: 'broker fencing', kind: 'metaprop',
      intro: 'Brokers do not vote. They fetch the metadata log from the active controller, and heartbeat to it. A broker that goes silent is fenced and loses its leaderships.',
      trigger: 'A broker stalls for a long garbage collection while a topic is created and leaders change (example offsets).',
      run: "kafka-metadata-quorum.sh --bootstrap-server b:9092 describe --replication   # follower lag per node\n# broker.session.timeout.ms=9000   # a broker with no heartbeat for 9 s is fenced",
      expect: 'After 9 seconds without heartbeats the broker is fenced and its partition leaders move to other ISR members. It returns after it catches up.',
      steps: [
        S('A change is committed', 'The active controller commits a new topic at metadata offset 120. Brokers 1, 2 and 3 are at 119 and have not seen it yet.', { head: 120, offs: [119, 119, 119], fenced: [], note: 'topic committed at 120' }, 'metadata head 120'),
        S('Brokers fetch the log', 'Each broker fetches the metadata log from the active controller, like a consumer. They apply the change and start leading and following the new partitions.', { head: 120, offs: [120, 120, 120], fenced: [], note: 'all brokers at 120' }, 'brokers at 120'),
        S('One broker stalls', 'Broker 3 hits a long GC pause. It stops fetching and heartbeating. The log moves on to 135 while broker 3 stays at 120.', { head: 135, offs: [135, 135, 120], fenced: [], note: 'broker 3 silent' }, 'broker 3 lags by 15'),
        S('The controller fences it', 'After <code>broker.session.timeout.ms</code> (9 s by default) without a heartbeat the controller fences broker 3. Partitions it led get a new leader from their ISR, committed as metadata offset 136.', { head: 136, offs: [136, 136, 120], fenced: [2], note: 'broker 3 fenced, leaders moved' }, 'broker 3 fenced at 136'),
        S('It returns and is unfenced', 'Broker 3 recovers, fetches the missing metadata, heartbeats, and the controller unfences it. Its replicas then catch up and rejoin ISRs.', { head: 137, offs: [137, 137, 137], fenced: [], note: 'broker 3 back' }, 'all brokers at 137'),
        S('A clean shutdown avoids the wait', 'A broker stopped cleanly asks the controller to move its leaders away first (controlled shutdown), so there is no 9 second gap of unavailable leaders.', { head: 137, offs: [137, 137, 137], fenced: [], note: 'controlled shutdown', clean: true }, 'leaders moved before stopping')
      ],
      edges: [
        E('A broker that keeps heartbeating but cannot fetch', 'A broker with a healthy heartbeat but a stuck metadata fetch serves stale metadata.', 'Watch the metadata lag metrics per broker, not only heartbeats.'),
        E('Fencing and the ISR', 'Fencing removes the broker from leadership only. Its followers fall out of ISRs after <code>replica.lag.time.max.ms</code>.', 'Expect under-replicated partitions for as long as the broker is away, and size min.insync.replicas for it.')
      ],
      invariant: 'Brokers apply the metadata log in order, and a broker without a recent heartbeat is fenced and cannot lead partitions.',
      src: 'Apache Kafka docs: KRaft (broker heartbeats, <code>broker.session.timeout.ms</code> 9000, fencing, controlled shutdown), KIP-631. Offsets are examples.'
    }
  ];
})();
