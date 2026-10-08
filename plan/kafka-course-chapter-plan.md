# Apache Kafka Course Chapter Plan (12 chapters)

## Objective
Rewrite `techstack/kafka/01-kafka-internals-end-to-end.html` in the problem-based format. The course problem: 50,000 order events/s (illustrative) must be stored once and read by twelve teams at their own pace, without losing or duplicating acknowledged events. Pin Kafka 3.9 in KRaft mode.

## Source coverage
- **Docs:** kafka.apache.org/documentation, the anchors already in `kafka-incidents.js` INCIDENT_SOURCES: #brokerconfigs, #topicconfigs, #producerconfigs, #consumerconfigs, #design_ha, #semantics, #compaction, #monitoring, #basic_ops_cluster_expansion, #kraft. Also #design_filesystem, #design_consumerposition, #replication and #tiered_storage (verify these four).
- **KIPs:** 98 (exactly-once), 101 (leader epoch), 345 (static membership), 405 (tiered storage), 429 (incremental rebalance), 500/595/631 (KRaft), 664 (hanging transactions), 679 (idempotence on by default), 794 (uniform sticky partitioner), 890 (transactions server-side defence).
- **Source code** (apache/kafka, verify at 3.9 before citing paths): class names LogSegment, OffsetIndex, TimeIndex, UnifiedLog, LogCleaner, ReplicaManager, Partition, RecordAccumulator, Sender, ConsumerCoordinator, GroupCoordinator, TransactionCoordinator, QuorumController, KafkaRaftClient.

## Design constraints
- The count of 12 comes from the 7 old chapters, which each held 2–3 tabs with separate mechanisms:
  - Log: segments / offset lookup / crash recovery;
  - Produce: route / batch / retry;
  - Replicate: ISR and high watermark / reassignment;
  - Consume: offsets / rebalance.
- Each tab becomes a chapter with its own playground. All 21 incidents in `kafka-incidents.js` are migrated, then the .js and .css files are deleted.
- The old "Crash matrix" becomes the ch10 playground.
- `archSteps` only in ch5.

## Chapters

### ch0 · Log Segments and Offsets (`s:'append · segments · sparse index'`, pg `segments`)
- **Source:** #design_filesystem; topic configs `segment.bytes`, `segment.ms`, `index.interval.bytes`, `message.timestamp.type`.
- **Problem:** Events must be kept so any reader can resume from any point, but scanning a 1 TB partition to find offset 9,000,000 is too slow.
- **Predict:** "To find offset 1,234,567, which file does the broker open first?"
  - Answer: the segment whose base offset is the greatest one ≤ the target, via its .index file.
- **Core idea:** Append-only segment files named by base offset; a sparse offset index and time index per segment; records framed with a length and a CRC.
- **Mechanism:**
  - active versus closed segments;
  - roll by size or time;
  - sparse index binary search, then a short scan;
  - timeindex.
- **Playground:**
  - Controls: slider for records; slider for `segment.bytes`; slider for `index.interval.bytes`; input for target offset or timestamp.
  - Stats: segments, index entries, bytes scanned for the lookup, files open.
- **Common:**
  1. Too many partitions: `Too many open files` / `Map failed` (vm.max_map_count) (incident).
  2. `RecordTooLargeException` when a batch exceeds `message.max.bytes`/`max.request.size`.
  3. Producer-set `CreateTime` timestamps are wrong, so `offsetsForTimes` lands in the wrong place. Fix: `LogAppendTime` or fix the clocks.

### ch1 · Log Crash Recovery (`s:'recovery point · CRC · truncation'`, pg `recovery`)
- **Source:** broker configs `num.recovery.threads.per.data.dir`, `log.flush.interval.messages`; #design_ha (durability via replication).
- **Problem:** A broker with thousands of partitions is killed with `kill -9`. Restart takes 40 minutes (illustrative) and partitions stay under-replicated.
- **Predict:** "After an unclean shutdown, which segments are re-validated?"
  - Answer: only those past each partition's recovery point.
- **Core idea:** A clean shutdown marker skips recovery. Otherwise the broker validates frames and CRCs past the recovery point, truncates a torn tail and rebuilds the indexes.
- **Mechanism:**
  - recovery-point checkpoint;
  - frame and CRC validation;
  - truncation;
  - index rebuild;
  - durability by replication rather than fsync.
- **Playground:**
  - Controls: seg for shutdown (clean / kill -9); slider for partitions; slider for recovery threads; slider for torn-tail position.
  - Stats: segments scanned, records truncated, restart time (illustrative), under-replicated partitions.
- **Common:**
  1. Slow restart after an unclean shutdown (incident).
  2. A corrupted record or index (incident).
  3. Power loss on all replicas at once loses the unflushed tail, because Kafka does not fsync each message by default. Fix: rack and power-domain spread, and replication.

### ch2 · Partitioning and Keys (`s:'key hash · order per key · stickiness'`, pg `partitioner`)
- **Source:** producer configs `partitioner.class`, `partitioner.ignore.keys`; KIP-480 and KIP-794.
- **Problem:** Orders for seller 42 are processed out of order after the team "scaled" the topic from 6 to 12 partitions.
- **Predict:** "After growing partitions 6 → 12, do old and new events for key K land in the same partition?"
  - Answer: not necessarily.
- **Core idea:** The same key goes to the same partition (murmur2 mod N). Order is per partition, not global. Null keys use sticky batching.
- **Mechanism:**
  - default partitioner;
  - key hash;
  - partition count change;
  - uniform sticky partitioner.
- **Playground:**
  - Controls: input keys with a frequency distribution; slider for partitions; button "grow partitions"; seg for key distribution (uniform / hot key / null keys).
  - Stats: per-partition load bars, max/avg, keys whose partition changed, out-of-order events.
- **Common:**
  1. A hot key makes a hot partition (incident).
  2. More partitions break per-key order (incident).
  3. Null-key traffic piles onto slow brokers with the old sticky behaviour (KIP-794).

### ch3 · Producer Batching and Buffering (`s:'linger · batch.size · buffer.memory'`, pg `batching`)
- **Source:** producer configs `linger.ms`, `batch.size`, `buffer.memory`, `max.block.ms`, `compression.type`; RecordAccumulator.
- **Problem:** Brokers run at 90% CPU handling 200,000 requests/s (illustrative) for only 50,000 events/s.
- **Predict:** "Raise `linger.ms` from 0 to 10 at a steady 5,000 events/s per producer. Requests/s…"
  - Answer: drop sharply; latency rises by up to 10 ms.
- **Core idea:** Batch per partition by size and time in a bounded buffer. The send blocks, then fails, when the buffer is full.
- **Mechanism:**
  - accumulator deques;
  - batch close on size or linger;
  - Sender drain;
  - compression per batch;
  - buffer exhaustion and `max.block.ms`.
- **Playground:**
  - Controls: slider for event rate; slider for linger.ms; slider for batch.size; seg for compression; slider for broker slowdown.
  - Stats: requests/s, average batch size, added latency, buffer used, `send()` blocked time.
- **Common:**
  1. Tiny batches flood the brokers (incident).
  2. The buffer is exhausted: `send()` blocks then throws `TimeoutException` after `max.block.ms`.
  3. `linger.ms=0` with compression gives a poor compression ratio and high network use.

### ch4 · Idempotent Producer and Retries (`s:'producer id · sequence · delivery timeout'`, pg `idempotence`)
- **Source:** #semantics; producer configs `enable.idempotence` (default true since 3.0, KIP-679), `acks`, `retries`, `max.in.flight.requests.per.connection`, `delivery.timeout.ms`.
- **Problem:** The ack was lost on the network and the producer retried. Finance sees the same order twice and one order before its predecessor.
- **Predict:** "With idempotence on and 5 requests in flight, can a retry reorder records within a partition?"
  - Answer: no.
- **Core idea:** The broker deduplicates by (producer ID, epoch, sequence) per partition, so a retry is recognised, not appended twice.
- **Mechanism:**
  - PID and epoch;
  - per-partition sequence numbers;
  - in-flight limit;
  - `OutOfOrderSequenceException`;
  - `delivery.timeout.ms` bounds the total retry time.
- **Playground:**
  - Controls: toggle idempotence; slider for max.in.flight 1–5; button "drop ack of request N"; button "fail request N then succeed N+1".
  - Stats: duplicates in log, reordered pairs, retries.
- **Common:**
  1. Retry duplicates and reordering (incident).
  2. `TimeoutException: Expiring N record(s) … has passed since batch creation` when `delivery.timeout.ms` is exceeded.
  3. Idempotence silently disabled by an explicit conflicting config (`acks=1` or a custom setting). Check the effective config in the producer startup log.

### ch5 · Replication, ISR and High Watermark (`s:'ISR · high watermark · acks'`, pg `isr`, archSteps)
- **Source:** #design_ha, #replication; configs `acks`, `min.insync.replicas`, `replica.lag.time.max.ms`, `unclean.leader.election.enable`; KIP-101.
- **Problem:** A broker dies right after saying OK. Are the acknowledged events gone?
- **Predict:** "`acks=1`, and the leader dies before followers fetch. Is the acknowledged record safe?"
  - Answer: no.
- **Core idea:** Track the in-sync replicas. The high watermark is the smallest log end in the ISR; consumers read below it, and `acks=all` replies when the HW passes the record.
- **Mechanism:**
  - leader and followers fetching;
  - ISR shrink and expand;
  - high watermark;
  - leader epoch truncation;
  - min.insync.replicas.
- **archSteps modes:** `acks=all` versus `acks=1` with a leader crash.
- **Playground:**
  - Controls: seg for acks; slider for min.insync.replicas; per-follower lag sliders; button "kill leader at t"; toggle unclean election.
  - Stats: acknowledged-then-lost, HW, ISR size, writes rejected.
- **Common:**
  1. `acks=1` loses an acknowledged record (incident).
  2. `NOT_ENOUGH_REPLICAS` rejects writes (incident).
  3. A slow follower flaps in and out of the ISR (incident).
  4. Unclean leader election truncates acknowledged data.

### ch6 · Partition Reassignment and Placement (`s:'reassign · throttle · rack'`, pg `reassign`)
- **Source:** #basic_ops_cluster_expansion; `kafka-reassign-partitions.sh` (`--throttle`); `broker.rack`; `auto.leader.rebalance.enable`; `kafka-leader-election.sh`.
- **Problem:** New brokers are added, and moving partitions to them saturates the network; producers time out.
- **Predict:** "During a reassignment, when does the new replica start serving as leader?"
  - Answer: only after it joins the ISR and leadership moves.
- **Core idea:** Add a replica, let it catch up as a follower, join the ISR, then drop the old replica. Throttle the copy and place replicas across racks.
- **Mechanism:**
  - adding and removing replicas;
  - replication throttle;
  - preferred leader;
  - rack-aware placement.
- **Playground:**
  - Controls: slider for data to move; slider for throttle; slider for brokers before/after; toggle rack awareness; button "restart broker".
  - Stats: copy time, producer p99 (illustrative), leaders per broker, partitions with all replicas in one rack.
- **Common:**
  1. Reassignment saturates the cluster (incident).
  2. Leaders stay piled on a few brokers after restarts. Fix: preferred leader election.
  3. Without `broker.rack`, all replicas sit in one rack or zone and an outage takes the partition offline.

### ch7 · Consumer Offsets and Commits (`s:'position · commit · reset'`, pg `offsets`)
- **Source:** #design_consumerposition; consumer configs `enable.auto.commit`, `auto.commit.interval.ms`, `auto.offset.reset`; `__consumer_offsets`.
- **Problem:** Twelve teams read the same topic. After a crash, the billing team skipped some orders and replayed others.
- **Predict:** "Commit happens before processing and the consumer crashes after the commit. The record is…"
  - Answer: skipped.
- **Core idea:** The log is not deleted on read. Each group stores its committed position; where you commit relative to processing decides at-most-once versus at-least-once.
- **Mechanism:**
  - fetch position versus committed offset;
  - auto versus manual commit;
  - the offsets topic;
  - `auto.offset.reset` for new groups.
- **Playground:**
  - Controls: seg for commit placement (before / after processing / auto every N ms); button "crash at record k"; seg for auto.offset.reset.
  - Stats: records skipped, records reprocessed, lag.
- **Common:**
  1. Commit placement skips or duplicates records (incident).
  2. Auto-commit with asynchronous processing commits work that has not finished, and a crash loses it.
  3. A new group with `auto.offset.reset=latest` silently skips the backlog.

### ch8 · Consumer Groups and Rebalance (`s:'coordinator · generation · assignment'`, pg `rebalance`)
- **Source:** consumer configs `max.poll.interval.ms`, `max.poll.records`, `session.timeout.ms`, `group.instance.id`, `partition.assignment.strategy`; KIP-345 and KIP-429.
- **Problem:** Every few minutes all consumers stop for 30 s (illustrative) and lag climbs.
- **Predict:** "Processing one poll's batch takes longer than `max.poll.interval.ms`. What happens?"
  - Answer: the member is removed and a rebalance starts.
- **Core idea:** The group coordinator assigns partitions to members and bumps the generation on membership change. Cooperative and static membership reduce stop-the-world pauses.
- **Mechanism:**
  - JoinGroup and SyncGroup;
  - eager versus cooperative-sticky;
  - heartbeats versus poll interval;
  - static membership.
- **Playground:**
  - Controls: slider for consumers 1–8 against 6 partitions; slider for processing time per batch; slider for max.poll.interval; seg for strategy (eager / cooperative); toggle static IDs; button "rolling restart".
  - Stats: rebalances, paused partition-seconds, idle consumers.
- **Common:**
  1. Rebalance storm when processing outlasts `max.poll.interval.ms` (incident).
  2. More consumers than partitions leaves consumers idle (incident).
  3. Rolling deploys trigger N rebalances. Fix: `group.instance.id` (static membership).

### ch9 · Retention, Tiered Storage and Compaction (`s:'retention · tiers · compaction'`, pg `cleanup`)
- **Source:** topic configs `retention.ms`, `retention.bytes`, `cleanup.policy`, `delete.retention.ms`, `min.compaction.lag.ms`, `segment.ms`; #compaction; KIP-405.
- **Problem:** Disks fill within days, and a compacted "latest price" topic must keep only the newest value per key.
- **Predict:** "`retention.ms` = 1 day, but the active segment has been open for 5 days. Is its data deleted?"
  - Answer: no, only closed segments are deleted.
- **Core idea:** Two cleaners over the same segments: delete whole closed segments by age or size, or compact to the latest value per key. Neither waits for a reader.
- **Mechanism:**
  - segment-level deletion;
  - log cleaner (dirty ratio, tombstones, `delete.retention.ms`);
  - `OFFSET_OUT_OF_RANGE` for readers that fell behind;
  - tiered storage offload.
- **Playground:**
  - Controls: seg for policy (delete / compact); slider for retention; slider for segment.ms; slider for consumer lag; slider for delete.retention.ms.
  - Stats: disk used, segments deleted, keys retained, consumer gap (records missed).
- **Common:**
  1. A consumer falls behind retention (incident).
  2. A tombstone is purged before a slow consumer saw it (incident).
  3. The disk fills although retention is set (incident).

### ch10 · Transactions and Exactly-Once (`s:'transactional.id · markers · LSO'`, pg `transactions`)
- **Source:** KIP-98, KIP-664, KIP-890; producer `transactional.id`, `transaction.timeout.ms`; consumer `isolation.level`.
- **Problem:** A job reads orders, writes invoices, then commits its offset. A crash in between causes duplicate invoices.
- **Predict:** "Crash after writing the invoice but before commitTransaction. What does a `read_committed` reader see?"
  - Answer: nothing from that attempt.
- **Core idea:** A transaction coordinator maps `transactional.id` to a PID and epoch (fencing zombies), records the partitions touched, and writes commit or abort markers. Offsets commit inside the transaction.
- **Mechanism:**
  - initTransactions and epoch bump;
  - AddPartitions;
  - sendOffsetsToTransaction;
  - markers;
  - last stable offset.
- **Playground** (the old crash matrix):
  - Controls: seg for crash point (before produce / after produce / after offsets / after commit); toggle transactions; seg for isolation.level; button "start zombie instance".
  - Stats: duplicate invoices, lost invoices, aborted records visible, LSO lag.
- **Common:**
  1. Two instances share a `transactional.id`: `ProducerFencedException` (incident).
  2. A hanging transaction stalls `read_committed` consumers (incident, KIP-664 tooling).
  3. A `read_uncommitted` downstream consumer reads aborted records.

### ch11 · KRaft Control Plane (`s:'metadata quorum · epochs · fencing'`, pg `kraft`)
- **Source:** #kraft; KIP-500, KIP-595, KIP-631; `controller.quorum.voters` / `controller.quorum.bootstrap.servers` (verify for 3.9).
- **Problem:** Who decides which broker leads each partition, and what if that decider dies or is partitioned?
- **Predict:** "4 controllers: how many can fail before metadata stops?"
  - Answer: 1, the same as 3 controllers.
- **Core idea:** A few controllers elect one active controller per epoch. Metadata changes are log entries committed by a majority; brokers apply only committed entries and reject older epochs.
- **Mechanism:**
  - Raft-based metadata log;
  - active controller;
  - epochs;
  - broker heartbeats and fencing;
  - metadata snapshots.
- **Playground:**
  - Controls: seg for voters 3/4/5; buttons to kill or isolate the active controller; button "propose leader change"; Play.
  - Stats: active controller, epoch, committed metadata offset, brokers fenced.
- **Common:**
  1. The metadata quorum loses its majority (incident).
  2. Network split: the old controller cannot commit (incident).
  3. An even voter count (4) tolerates no more failures than 3, at extra cost.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 The log, tab "append and roll" + "find offset" | ch0 |
| ch0 tab "crash repair" | ch1 |
| ch1 Produce, tab route / batch / retry | ch2 / ch3 / ch4 |
| ch2 Replicate, tab ISR & HW / move replica | ch5 / ch6 |
| ch3 Consume, tab offsets / rebalance | ch7 / ch8 |
| ch4 Clean up | ch9 |
| ch5 Transactions + crash matrix | ch10 |
| ch6 Control plane (live quorum) | ch11 |
| incidents 0..6 in kafka-incidents.js | spread as listed per chapter above |
| STORY/overview nodes | COURSE.lead + ch5 archSteps |

## Dropped or merged, and why
- **"Use your own events and pick the key" panel:** merged into the ch2 key input over a fixed dataset.
- **kafka-incidents.js and kafka-incidents.css:** content inlined into `common` and source links kept. Both files are deleted and their tags removed. The per-incident custom visuals (`view` types) become `viz` rows and bars.
