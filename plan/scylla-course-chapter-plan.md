# ScyllaDB Course Chapter Plan (10 chapters)

## Objective
Rewrite `techstack/scylla/01-scylla-internals-end-to-end.html` in the problem-based format. The course problem is a marketplace order store that outgrew one PostgreSQL primary: high write rate, any node may fail, reads must find the latest data. Pin ScyllaDB 2025.x.

## Source coverage
- **Docs:** the URLs already in `scylla-incidents.js` INCIDENT_SOURCES, all under docs.scylladb.com/manual/stable/ unless noted:
  - large-partition-table
  - cql/consistency
  - troubleshooting/timeouts
  - critical-disk-utilization
  - configuration-parameters
  - metrics
  - compaction-strategies
  - system-requirements
  - cql/ddl (table options, tombstone_gc)
  - architecture/tablets
  - architecture/raft
  - schema-mismatch
  - the python-driver shard-aware page
  - Plus architecture/ringarchitecture, architecture/anti-entropy, and operating-scylla/procedures/maintenance/repair. Verify these three URLs.
- **Source code** (scylladb/scylladb, verify at the pinned tag): service/storage_proxy.cc, db/commitlog/, replica/memtable.cc, sstables/, compaction/, locator/ (token metadata, tablets), raft/ and service/raft/.

## Design constraints
- The count of 10 comes from the 8 old chapters plus two splits that the old page already contains:
  - timeouts, retries and routing, split from "Route & replicate" (incidents "extra coordinator hop" and "retry storm");
  - repair and gc_grace, split from "Deletes & TTL" (the tuning panel "Tombstone grace" with its repair interval).
- The four old tuning panels become playgrounds: consistency → ch1, bloom → ch4, compaction → ch5, grace/repair → ch7.
- Migrate all 20 incidents from `scylla-incidents.js`, then delete the file.
- `archSteps` only in ch1.

## Chapters

### ch0 · Partition Key and Token Ring (`s:'key · token · owner'`, pg `ring`)
- **Source:** ring architecture docs; large-partition docs; cql/ddl (PRIMARY KEY).
- **Problem:** Orders keyed by `seller_id`. One celebrity seller's node runs at 100% CPU while others idle.
- **Predict:** "Adding a 4th node to a 3-node ring moves roughly what share of keys?"
  - Answer: about 1/4, only from its neighbours.
- **Core idea:** Hash the partition key to a token and place nodes (vnodes) on the same ring. The owner is the next token clockwise.
- **Mechanism:**
  - Murmur3 token;
  - vnodes (`num_tokens`);
  - RF and NetworkTopologyStrategy placement;
  - partition key versus clustering key.
- **Playground:**
  - Data: a fixed 60-order dataset.
  - Controls: seg for partition key (`seller_id` / `(seller_id, day)` / `order_id`); slider for nodes 3–6; seg for vnodes per node 1/4/16; button "add node".
  - Stats: max/avg node load, largest partition rows, keys moved on add.
  - Visual: a ring SVG.
- **Common:**
  1. Hot partition (incident 0).
  2. Large partition, warning `Writing large partition` / `system.large_partitions` (incident 0).
  3. Uneven token ownership with few vnodes: one node owns a much larger range.

### ch1 · Coordinator and Consistency Levels (`s:'coordinator · RF · CL'`, pg `quorum`, archSteps)
- **Source:** cql/consistency; storage_proxy.cc.
- **Problem:** RF=3. A replica was down during an update; after it returns, some reads show the old price.
- **Predict:** "Write QUORUM + read QUORUM with RF=3 and one replica down: can a read miss the latest write?"
  - Answer: no, R+W>RF guarantees overlap.
- **Core idea:** Any node coordinates: it fans out to all replicas and replies after CL acknowledgements.
- **Mechanism:**
  - coordinator;
  - ONE/QUORUM/ALL/LOCAL_QUORUM;
  - the overlap rule;
  - last-write-wins timestamps.
- **archSteps modes:** "all replicas up" and "one replica down".
- **Playground** (old tuning panel 1):
  - Controls: seg for write CL; seg for read CL; seg for replicas down 0–2; seg for which replica is stale; seg for client clock skew (0 / +5 s).
  - Stats: write ok, read ok, overlap guaranteed, stale-read outcomes out of 3 replica choices (enumerated, deterministic).
- **Common:**
  1. Stale read at ONE (incident 1).
  2. Unavailable at ALL (incident 1).
  3. Client clock skew makes a newer write lose last-write-wins. Fix: server-side timestamps or synchronised clocks.

### ch2 · Timeouts, Retries and Routing (`s:'token-aware · shard-aware · retries'`, pg `routing`)
- **Source:** troubleshooting/timeouts; the python-driver shard-aware page; configuration-parameters (`read_request_timeout_in_ms`, `write_request_timeout_in_ms`).
- **Problem:** A traffic spike. Client timeouts climb faster than incoming traffic, and coordinator CPU rises on healthy nodes.
- **Predict:** "Client timeout 1 s, server timeout 2 s, 3 retries. Under overload, how many requests hit replicas per user request?"
  - Answer: up to 4.
- **Core idea:** Route to the owning node and shard. Keep client timeouts above server timeouts; bound and back off retries, and retry only idempotent statements.
- **Mechanism:**
  - shard-per-core;
  - token-aware and shard-aware drivers;
  - coordinator forwarding;
  - server versus client timeouts;
  - retry policy;
  - speculative execution;
  - idempotent statements.
- **Playground:**
  - Controls: seg for routing (random / token-aware / shard-aware); sliders for client timeout, server timeout, retries; slider for load; toggle backoff.
  - Stats: hops per request, replica load amplification, timeouts, goodput.
- **Common:**
  1. Extra coordinator hop (incident 0).
  2. Retry storm after a timeout (incident 1).
  3. A non-idempotent statement (counter update or list append) is retried and applied twice. Mark statements idempotent only when they truly are.

### ch3 · Replica Write Path (`s:'commitlog · memtable · SSTable'`, pg `writepath`)
- **Source:** configuration-parameters (`commitlog_sync`, `commitlog_sync_period_in_ms`, `batch_size_warn_threshold_in_kb`, `batch_size_fail_threshold_in_kb`); critical-disk-utilization; db/commitlog/.
- **Problem:** Power fails right after the client got OK. Is the order still there?
- **Predict:** "With periodic commitlog sync and RF=1, can an acknowledged write be lost on power loss?"
  - Answer: yes.
- **Core idea:** Append to the commitlog, apply to the sorted memtable, and flush immutable SSTables later.
- **Mechanism:**
  - commitlog segments;
  - periodic versus batch sync;
  - memtable flush;
  - SSTable components;
  - disk-utilisation guard.
- **Playground:**
  - Controls: write stream; seg for sync mode (periodic / batch); slider for sync period; slider for RF 1/3; button "power loss at t".
  - Stats: acknowledged writes, acknowledged-but-lost, memtable size, SSTables flushed, p50 write latency (illustrative).
- **Common:**
  1. ACK before local fsync (incident 2).
  2. A critical disk rejects writes (incident 2).
  3. Large multi-partition logged batches overload the coordinator and trip the batch size warn/fail thresholds.

### ch4 · Read Path (`s:'Bloom · index · merge · cache'`, pg `readpath`)
- **Source:** metrics; performance tips (BYPASS CACHE); cql/ddl (`bloom_filter_fp_chance`).
- **Problem:** A point read takes 40 ms (illustrative). Tracing shows it touched 11 SSTables.
- **Predict:** "Lowering `bloom_filter_fp_chance` from 0.01 to 0.001 costs about…"
  - Answer: about 1.5× the bloom memory per key (about 9.6 → 14.4 bits/key).
- **Core idea:** Skip files that surely lack the key, jump close with the index, merge only the candidates, and cache hot rows.
- **Mechanism:**
  - Bloom filter (bits/key ≈ 1.44·log2(1/p));
  - partition index and summary;
  - multi-version merge by timestamp;
  - row cache.
- **Playground** (old tuning panel 2):
  - Controls: slider for SSTable count; seg for fp chance; slider for "files that truly contain the key"; toggle cache; toggle concurrent scan.
  - Stats: SSTables probed, disk reads, bloom memory, cache hit rate.
- **Common:**
  1. Bloom false positives (incident 3).
  2. Cache thrash from scans. Fix: `BYPASS CACHE` (incident 3).
  3. `ALLOW FILTERING` turns a "lookup" into a full scan under load.

### ch5 · Compaction (`s:'STCS · LCS · TWCS'`, pg `compaction`)
- **Source:** compaction-strategies; system-requirements (disk headroom).
- **Problem:** After a week of writes, read p99 doubles and the disk alarm fires (old incident).
- **Predict:** "Which strategy minimises SSTables per read for an update-heavy table?"
  - Answer: LCS.
- **Core idea:** Merge sorted files in the background. Each strategy trades write, space and read amplification.
- **Mechanism:**
  - STCS size tiers;
  - LCS non-overlapping levels;
  - TWCS time windows;
  - pending compactions;
  - temporary space during a merge.
- **Playground** (old tuning panel 3):
  - Controls: seg for workload (write-heavy / update / TTL time-series); seg for strategy; slider for flushes.
  - Stats: write amplification, peak space amplification, SSTables per read, pending compactions.
- **Common:**
  1. Compaction backlog (incident 4).
  2. Compaction runs out of headroom (incident 4).
  3. A TWCS window stays alive from out-of-order writes or mixed TTLs (incident 4).

### ch6 · Deletes, TTL and Tombstones (`s:'tombstones · TTL · range deletes'`, pg `tombstones`)
- **Source:** cql/ddl; anti-entropy docs.
- **Problem:** A "queue" table (insert, read, delete) gets slower every hour although it is nearly empty.
- **Predict:** "A partition has 10 live rows and 50,000 deleted ones. How many cells does a full-partition read scan?"
  - Answer: all of them, including tombstones.
- **Core idea:** A delete is a newer write (a tombstone) that shadows older data in every file and replica until compaction may purge it.
- **Mechanism:**
  - cell, row, range and partition tombstones;
  - TTL expiry becomes a tombstone;
  - the purge guard (no older data outside the compaction inputs).
- **Playground:**
  - Controls: slider for deletes per minute; seg for delete kind (row / range); seg for query (full partition / bounded slice); button "compact".
  - Stats: tombstones scanned per read, live rows returned, read latency (illustrative), tombstones purged.
- **Common:**
  1. Tombstone-heavy read (incident 5).
  2. Binding `null` in prepared inserts creates tombstones. Fix: leave the value unset.
  3. TTL-expired data keeps using disk until compaction runs.

### ch7 · Repair and gc_grace_seconds (`s:'anti-entropy · grace · resurrection'`, pg `repair`)
- **Source:** cql/ddl (`gc_grace_seconds`, `tombstone_gc` modes); repair procedure docs; configuration-parameters (`max_hint_window_in_ms`). Verify the names for 2025.x.
- **Problem:** A deleted order reappears 12 days later (old incident).
- **Predict:** "gc_grace = 10 days, and repair runs every 14 days. Can a deleted row come back?"
  - Answer: yes.
- **Core idea:** Tombstones must outlive the longest gap in repair, or a replica that missed the delete resurrects the data.
- **Mechanism:**
  - hinted handoff and its window;
  - row-level repair;
  - `gc_grace_seconds` (timeout-based tombstone GC) versus repair-based tombstone GC.
- **Playground** (old tuning panel 4):
  - Data: a 30-day timeline.
  - Controls: slider for grace days; slider for repair interval; slider for replica downtime days; seg for tombstone_gc mode.
  - Stats: resurrection yes/no, days tombstones retained, extra disk (illustrative).
- **Common:**
  1. A deleted row resurfaces (incident 5).
  2. A wrong tombstone GC assumption (incident 5).
  3. A node down longer than the hint window rejoins without repair and serves stale data until repaired.

### ch8 · Tablets and Migration (`s:'split · move · epoch'`, pg `tablets`)
- **Source:** architecture/tablets.
- **Problem:** The team adds a node at peak. Will traffic stop, will writes be lost, and when does the new node take load?
- **Predict:** "During a tablet move, which replica serves writes made after the snapshot?"
  - Answer: both, until the fence; then the new owner.
- **Core idea:** Per-table token ranges (tablets) carry their own replica sets and an epoch. A move copies a snapshot, catches up, fences, and commits a new epoch.
- **Mechanism:**
  - tablet map;
  - split and merge;
  - migration stages;
  - load balancer;
  - vnode keyspaces versus tablet keyspaces.
- **Playground:**
  - Controls: slider for tablets 4–16; slider for nodes 3–5; button "add node"; slider for migration concurrency; toggle "hot tablet".
  - Stats: tablets moved, bytes streamed, p99 during the move (illustrative), max node load.
- **Common:**
  1. Migration hurts p99 (incident 6).
  2. A hot tablet stays hot, because a split cannot divide one hot partition (incident 6).
  3. A vnode keyspace after adding a node: old data stays on disk until `nodetool cleanup`.

### ch9 · Raft Metadata Consensus (`s:'leader · term · majority'`, pg `raft`)
- **Source:** architecture/raft; schema-mismatch; raft/ and service/raft/.
- **Problem:** Two nodes are partitioned from the third. Who may change the tablet map or the schema?
- **Predict:** "3 voters, and 2 are unreachable. Can the remaining node commit a schema change?"
  - Answer: no.
- **Core idea:** One leader per term appends metadata changes. An entry commits only once a majority stores it; the minority cannot commit a competing map.
- **Mechanism:**
  - group 0;
  - terms;
  - leader election;
  - log replication and commit index;
  - Raft orders metadata, not ordinary row writes.
- **Playground:**
  - Controls: 3 or 5 nodes; buttons to kill or partition a node; button "propose change"; Play.
  - Stats: leader, term, commit index, committed versus pending entries.
- **Common:**
  1. Raft majority lost permanently: the documented recovery procedure is needed (incident 7).
  2. Schema versions disagree (incident 7).
  3. An aggressive rolling restart takes 2 of 3 voters down at once, so topology and schema changes block until quorum returns.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 Partition & token ring; incidents 0 | ch0, ch2 ("extra hop") |
| ch1 Route & replicate; incidents 1 | ch1 (CL), ch2 (retry storm) |
| ch2 Replica write path; incidents 2 | ch3 |
| ch3 Read path; incidents 3 | ch4 |
| ch4 Compaction; incidents 4 | ch5 |
| ch5 Deletes & TTL; incidents 5 | ch6 (tombstones), ch7 (repair/grace) |
| ch6 Tablets & migration; incidents 6 | ch8 |
| ch7 Raft consensus; incidents 7 | ch9 |
| Tuning panels 1–4 | ch1, ch4, ch5, ch7 playgrounds |
| STORY problem ("one big PostgreSQL" naive) | COURSE.lead + ch0 scene |
| "whole system" overview | ch1 archSteps |

## Dropped or merged, and why
- **"Use your own data and pick the keys" panel:** merged into the ch0 partition-key seg over a fixed dataset, so results stay deterministic.
- **scylla-incidents.js:** its content is inlined into `common`, the file is deleted, and its `<script>` tag is removed.
