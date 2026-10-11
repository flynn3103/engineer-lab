/* Mermaid diagrams for the Apache Kafka system-design course, same layout as the other courses:
 *   CourseData.hldOverall, CourseData.hld[featureId], CourseData.diagrams['id:n'].
 * Mermaid syntax notes: no semicolons or hash signs in labels (they end a statement or start a comment). */
(function () {
  const SEQ = 'Sequence', STATE = 'State', FLOW = 'Flow';
  const D = (kind, title, src) => ({ kind, title, src });

  CourseData.hldOverall = `flowchart LR
  P["Producers<br/>batch, idempotent"] --> L["Partition leader"]
  L --> LG["Log segments<br/>page cache"]
  L --> F1["Follower 1"]
  L --> F2["Follower 2"]
  F1 -.->|"ISR"| L
  F2 -.->|"ISR"| L
  LG --> RT["Retention<br/>compaction, tiering"]
  LG --> C1["Consumer group A"]
  LG --> C2["Consumer group B"]
  C1 --> OF["__consumer_offsets"]
  TC["Transaction coordinator"] -.-> LG
  KR["KRaft controllers<br/>metadata log"] -.-> L`;

  CourseData.hld = {
    log: `flowchart LR
  A["Append"] --> AS["Active segment .log"]
  AS --> PC["Page cache"]
  AS --> IX["Sparse .index and .timeindex"]
  R["Read at offset"] --> SM["Pick segment by base offset"]
  SM --> IX
  IX --> SC["Short scan from the index position"]
  PC -->|"OS writes back"| DK["Disk"]`,
    part: `flowchart LR
  REC["Record with a key"] --> H["murmur2 of the key"]
  H --> M["modulo partition count"]
  M --> PT["Partition"]
  NK["Record without a key"] --> ST["Sticky or round robin"]
  ST --> PT
  PT --> CG["One consumer per group"]`,
    prod: `flowchart LR
  S["send()"] --> RA["Record accumulator<br/>one batch per partition"]
  RA -->|"full or linger.ms"| SN["Sender thread"]
  SN -->|"PID, partition, sequence"| BR["Leader broker"]
  BR -->|"ack"| SN
  SN -.->|"timeout"| RT["Retry with the same sequence"]
  RT --> BR`,
    repl: `flowchart LR
  PR["Producer"] --> LD["Leader"]
  LD --> LL["Leader log"]
  F["Followers fetch"] --> LL
  F -->|"caught up"| ISR["ISR"]
  ISR --> HW["High watermark"]
  HW -->|"acks=all"| AK["Acknowledged"]
  HW --> CN["Consumers read up to it"]
  CT["Controller"] -->|"new leader from ISR"| LD`,
    cons: `flowchart LR
  F["fetch from position"] --> PR["Process records"]
  PR --> CM["Commit offset"]
  CM --> OT["__consumer_offsets<br/>group, topic, partition"]
  RS["Restart"] --> OT
  OT -->|"resume at committed"| F
  LG["Log start moves on"] -.->|"below committed: out of range"| RS`,
    group: `flowchart TD
  M["Member joins, leaves or goes silent"] --> GC["Group coordinator"]
  GC --> RB["Rebalance, new generation"]
  RB --> AS["Assignor<br/>range or cooperative sticky"]
  AS --> OW["Each partition: one owner"]
  HB["Heartbeat thread<br/>session.timeout.ms"] --> GC
  PL["poll loop<br/>max.poll.interval.ms"] --> GC`,
    ret: `flowchart TD
  SG["Closed segments"] --> P{"cleanup.policy"}
  P -->|"delete"| T["Delete segments past retention.ms or retention.bytes"]
  P -->|"compact"| CP["Cleaner keeps the latest record per key"]
  SG -->|"tiered storage"| RM["Copy to remote storage"]
  RM --> LR["Local copy deleted after local.retention.ms"]`,
    txn: `flowchart LR
  APP["Producer with transactional.id"] --> TC["Transaction coordinator"]
  APP --> OUT["Output partitions"]
  APP -->|"offsets"| OFF["__consumer_offsets"]
  TC -->|"COMMIT or ABORT marker"| OUT
  TC -->|"marker"| OFF
  OUT --> RC["read_committed consumers<br/>up to the last stable offset"]
  TC -.->|"epoch bump fences zombies"| APP`,
    kraft: `flowchart LR
  CMD["Metadata change"] --> AC["Active controller"]
  AC --> F1["Controller follower"]
  AC --> F2["Controller follower"]
  AC -->|"majority stored: commit"| ML["Metadata log"]
  ML --> B1["Broker fetches"]
  ML --> B2["Broker fetches"]
  B1 -.->|"heartbeat"| AC
  B2 -.->|"heartbeat"| AC`
  };

  CourseData.diagrams = {
    'log:1': [
      D(SEQ, 'Reading offset 9,000,000', `sequenceDiagram
  participant C as Consumer
  participant B as Broker
  participant M as Segment map
  participant I as Sparse index
  participant L as Log file
  C->>B: fetch at offset 9000000
  B->>M: largest base offset not above it
  M-->>B: segment 8950000
  B->>I: binary search relative offset 50000
  I-->>B: entry 49996 at byte 51195904
  B->>L: read from that byte, skip a few records
  L-->>C: records from 9000000`),
      D(STATE, 'Segment lifecycle', `stateDiagram-v2
  [*] --> Active: created at the log end
  Active --> Closed: rolled at segment.bytes or segment.ms
  Closed --> Deleted: retention or compaction
  Deleted --> [*]: files removed after file.delete.delay.ms`)
    ],
    'log:2': [
      D(FLOW, 'Startup after a crash', `flowchart TD
  S["Broker starts"] --> M{"Clean shutdown marker?"}
  M -->|"yes"| F["Skip recovery"]
  M -->|"no"| R["For each log: re-check segments after the recovery point"]
  R --> C["Verify CRC, rebuild the index"]
  C --> T["Truncate at the first bad record"]
  T --> J["Fetch from leaders and rejoin the ISR"]`),
      D(SEQ, 'Why it is slow', `sequenceDiagram
  participant B as Broker
  participant T as Recovery thread
  participant L as Logs
  B->>T: 4000 partitions to check
  T->>L: check partition 1
  T->>L: check partition 2
  T->>L: check partition 4000
  Note over T,L: one thread per data directory by default`)
    ],
    'log:3': [
      D(FLOW, 'What survives which failure', `flowchart TD
  F["Failure"] --> K{"Which?"}
  K -->|"process killed"| A["Page cache survives: no loss"]
  K -->|"machine crash"| B["Unflushed tail lost here, other ISR replicas have it"]
  K -->|"rack power loss"| C["Lost on every replica in the rack"]
  K -->|"disk dies"| D["Rebuild from replicas"]`),
      D(SEQ, 'Acknowledging without fsync', `sequenceDiagram
  participant P as Producer
  participant L as Leader
  participant F as Follower
  P->>L: batch, acks=all
  L->>L: append to page cache
  F->>L: fetch
  F->>F: append to its page cache
  L-->>P: ack once the ISR has it`)
    ],
    'part:1': [
      D(FLOW, 'Choosing a partition', `flowchart TD
  R["Record"] --> K{"Has a key?"}
  K -->|"yes"| H["murmur2(key), clear sign bit, modulo partitions"]
  K -->|"no"| S["Producer picks a partition itself"]
  H --> P["Partition"]
  S --> P`),
      D(SEQ, 'Growing a topic', `sequenceDiagram
  participant P as Producer
  participant T as Topic
  P->>T: key seller-2, 3 partitions, goes to partition 2
  Note over T: operator raises partitions to 6
  P->>T: key seller-2, 6 partitions, goes to partition 5
  Note over T: same key in two partitions, order across them is lost`)
    ],
    'part:2': [
      D(FLOW, 'Fixing a hot key', `flowchart TD
  H["One key carries most traffic"] --> Q{"Is order per key required?"}
  Q -->|"no"| S["Salt the key across partitions"]
  Q -->|"per order only"| O["Key by order id"]
  Q -->|"yes, per seller"| X["Split the work downstream"]`),
      D(SEQ, 'One partition, one consumer', `sequenceDiagram
  participant P as Producers
  participant T as Hot partition
  participant C as Its only consumer
  P->>T: 23 MB/s for the hot key
  C->>T: reads 10 MB/s
  Note over T,C: lag grows 13 MB/s while other consumers idle`)
    ],
    'part:3': [
      D(FLOW, 'How many consumers can work', `flowchart TD
  G["Group of C consumers, P partitions"] --> Q{"C greater than P?"}
  Q -->|"no"| A["Each consumer reads about P over C partitions"]
  Q -->|"yes"| B["P consumers work, C minus P are idle"]`),
      D(STATE, 'A consumer that gets no partition', `stateDiagram-v2
  [*] --> Joined
  Joined --> Assigned: partitions left to give
  Joined --> Idle: all partitions already owned
  Idle --> Assigned: another member leaves`)
    ],
    'prod:1': [
      D(SEQ, 'A batch is built and sent', `sequenceDiagram
  participant A as Application
  participant R as Record accumulator
  participant S as Sender
  participant B as Broker
  A->>R: send record 1
  A->>R: send record 2
  A->>R: send record 3
  R->>S: batch full or linger.ms passed
  S->>B: one request with 3 records
  B-->>S: ack`),
      D(FLOW, 'When a batch is sent', `flowchart TD
  R["Record appended to the open batch"] --> F{"Batch reached batch.size?"}
  F -->|"yes"| S["Send now"]
  F -->|"no"| L{"linger.ms passed?"}
  L -->|"yes"| S
  L -->|"no"| W["Wait for more records"]`)
    ],
    'prod:2': [
      D(SEQ, 'A retry that is a duplicate', `sequenceDiagram
  participant P as Producer
  participant B as Broker
  P->>B: batch seq 0
  B->>B: append
  B--xP: ack lost
  P->>B: retry batch seq 0
  B->>B: seq 0 already written, drop
  B-->>P: ack`),
      D(STATE, 'A sequence number at the broker', `stateDiagram-v2
  [*] --> Expecting: next sequence n
  Expecting --> Appended: batch n arrives
  Appended --> Expecting: next is n plus 1
  Expecting --> Duplicate: batch below n arrives, drop and ack
  Expecting --> Error: batch above n arrives, OutOfOrderSequence`)
    ],
    'prod:3': [
      D(FLOW, 'Which guarantee do I get', `flowchart TD
  A["Producer settings"] --> K{"acks"}
  K -->|"1"| L["Can lose on a leader failure"]
  K -->|"all"| M{"enable.idempotence?"}
  M -->|"no"| D["No loss, duplicates on retry"]
  M -->|"yes"| E["No loss, no duplicate retries, order kept"]`),
      D(SEQ, 'A send with a deadline', `sequenceDiagram
  participant A as Application
  participant P as Producer
  participant B as Broker
  A->>P: send
  P->>B: request (request.timeout.ms 30 s)
  B--xP: no reply
  P->>B: retry
  Note over P: delivery.timeout.ms 120 s bounds all attempts
  P-->>A: success or a timeout error`)
    ],
    'repl:1': [
      D(SEQ, 'A write with acks=all', `sequenceDiagram
  participant P as Producer
  participant L as Leader
  participant F as Follower
  P->>L: record
  L->>L: append
  F->>L: fetch
  L-->>F: record
  F->>F: append
  L->>L: high watermark moves past the record
  L-->>P: ack`),
      D(STATE, 'A follower', `stateDiagram-v2
  [*] --> InSync
  InSync --> OutOfSync: no catch-up for replica.lag.time.max.ms
  OutOfSync --> InSync: caught up with the leader
  InSync --> Leader: elected after the leader fails`)
    ],
    'repl:2': [
      D(FLOW, 'Is the write accepted', `flowchart TD
  W["Produce with acks=all"] --> Q{"ISR size at least min.insync.replicas?"}
  Q -->|"yes"| A["Append, ack when the whole ISR has it"]
  Q -->|"no"| R["NOT_ENOUGH_REPLICAS, nothing written"]`),
      D(SEQ, 'A rolling restart', `sequenceDiagram
  participant O as Operator
  participant B1 as Broker 1
  participant B2 as Broker 2
  O->>B1: restart
  Note over B1: catching up, ISR is 2 of 3
  O->>B2: restart too early
  Note over B2: ISR drops to 1, below min 2, writes refused
  O->>O: wait until under-replicated partitions are zero`)
    ],
    'repl:3': [
      D(SEQ, 'Moving a replica', `sequenceDiagram
  participant O as Operator
  participant C as Controller
  participant N as New replica
  participant L as Leader
  O->>C: reassign with a throttle
  C->>N: add as a replica
  N->>L: fetch the log, throttled
  N->>C: caught up, join the ISR
  C->>C: drop the old replica
  O->>C: verify, remove the throttle`),
      D(FLOW, 'Choosing the throttle', `flowchart TD
  T["Throttle rate"] --> Q{"Above the produce rate for the partitions?"}
  Q -->|"no"| S["New replica never catches up"]
  Q -->|"yes, but over the spare network"| B["Producers starve"]
  Q -->|"yes, within spare network"| OK["Move completes"]`)
    ],
    'cons:1': [
      D(SEQ, 'Commit after processing', `sequenceDiagram
  participant C as Consumer
  participant B as Broker
  C->>B: fetch from position
  B-->>C: offsets 0 to 4
  C->>C: process 0 to 2
  C->>B: commit 3
  C->>C: process 3 and 4
  Note over C: crash before the next commit
  C->>B: restart, resume at committed 3
  Note over C: 3 and 4 processed again`),
      D(FLOW, 'Order decides the guarantee', `flowchart TD
  O["Commit and process"] --> Q{"Which first?"}
  Q -->|"process then commit"| A["At-least-once: duplicates after a crash"]
  Q -->|"commit then process"| B["At-most-once: loss after a crash"]`)
    ],
    'cons:2': [
      D(STATE, 'A consumer against the log', `stateDiagram-v2
  [*] --> Current
  Current --> Behind: lag grows
  Behind --> Current: consumer catches up
  Behind --> OutOfRange: log start passes the committed offset
  OutOfRange --> Reset: auto.offset.reset earliest or latest
  OutOfRange --> Failed: auto.offset.reset none`),
      D(SEQ, 'Retention overtakes a slow group', `sequenceDiagram
  participant C as Slow consumer
  participant B as Broker
  C->>B: committed 60
  B->>B: retention moves log start to 70
  C->>B: fetch at 60
  B-->>C: OffsetOutOfRange
  C->>C: reset by auto.offset.reset`)
    ],
    'cons:3': [
      D(SEQ, 'A long poll', `sequenceDiagram
  participant C as Consumer
  participant B as Broker
  C->>B: fetch, min 1 byte, wait up to 500 ms
  B->>B: no data, park the request
  Note over B: a producer writes at 120 ms
  B-->>C: response with the new records
  C->>B: fetch again`),
      D(FLOW, 'When the broker answers a fetch', `flowchart TD
  F["Fetch request parked"] --> Q{"fetch.min.bytes available?"}
  Q -->|"yes"| R["Respond with data"]
  Q -->|"no"| W{"fetch.max.wait.ms passed?"}
  W -->|"yes"| E["Respond, possibly empty"]
  W -->|"no"| F`)
    ],
    'group:1': [
      D(SEQ, 'A rebalance', `sequenceDiagram
  participant C3 as New consumer
  participant GC as Group coordinator
  participant C1 as Consumer 1
  participant C2 as Consumer 2
  C3->>GC: JoinGroup
  GC->>C1: rebalance, rejoin
  GC->>C2: rebalance, rejoin
  C1->>GC: JoinGroup
  C2->>GC: JoinGroup
  GC->>C1: SyncGroup with the new assignment
  GC->>C2: SyncGroup with the new assignment
  GC->>C3: SyncGroup with the new assignment`),
      D(STATE, 'A group', `stateDiagram-v2
  [*] --> Stable
  Stable --> PreparingRebalance: member joins, leaves or is lost
  PreparingRebalance --> CompletingRebalance: all members rejoined
  CompletingRebalance --> Stable: assignment received`)
    ],
    'group:2': [
      D(SEQ, 'Two clocks', `sequenceDiagram
  participant H as Heartbeat thread
  participant A as Application thread
  participant G as Group coordinator
  A->>G: poll()
  H->>G: heartbeat every 3 s
  A->>A: process a batch for 6 minutes
  H->>G: heartbeat keeps arriving
  Note over A,G: 300 s without poll(), the consumer leaves
  A->>G: commit after 360 s, rejected`),
      D(FLOW, 'Is the member still in the group', `flowchart TD
  M["Member"] --> H{"Heartbeat within session.timeout.ms?"}
  H -->|"no"| X["Removed: presumed dead"]
  H -->|"yes"| P{"poll() within max.poll.interval.ms?"}
  P -->|"no"| L["Leaves the group"]
  P -->|"yes"| OK["Stays a member"]`)
    ],
    'group:3': [
      D(SEQ, 'A static member restarts', `sequenceDiagram
  participant C as Consumer billing-3
  participant G as Group coordinator
  C->>G: stops, no leave sent
  Note over G: remembers billing-3 and its partitions
  C->>G: restarts with the same group.instance.id
  G-->>C: the same partitions, no rebalance`),
      D(FLOW, 'Restart outcome', `flowchart TD
  R["Consumer restarts"] --> S{"Static member?"}
  S -->|"no"| D["Leave then join: two rebalances"]
  S -->|"yes"| T{"Back within session.timeout.ms?"}
  T -->|"yes"| N["No rebalance"]
  T -->|"no"| L["Rebalance after the timeout"]`)
    ],
    'ret:1': [
      D(FLOW, 'The retention check', `flowchart TD
  C["Every log.retention.check.interval.ms"] --> S["For each closed segment"]
  S --> Q{"Newest record older than retention.ms, or partition over retention.bytes?"}
  Q -->|"yes"| D["Rename to .deleted, remove after file.delete.delay.ms"]
  Q -->|"no"| K["Keep"]
  A["Active segment"] -.->|"never deleted"| K`),
      D(STATE, 'A quiet topic', `stateDiagram-v2
  [*] --> Writing: active segment
  Writing --> Writing: few records, no roll
  Writing --> Closed: segment.ms or segment.bytes reached
  Closed --> Deleted: older than retention`)
    ],
    'ret:2': [
      D(SEQ, 'The cleaner', `sequenceDiagram
  participant L as Log
  participant C as Cleaner
  L->>C: dirty ratio above 0.5
  C->>L: build a map of key to latest offset
  C->>L: rewrite segments keeping only the latest per key
  Note over L: offsets of kept records are unchanged
  C->>L: drop tombstones older than delete.retention.ms`),
      D(STATE, 'A key in a compacted topic', `stateDiagram-v2
  [*] --> HasValue: record with a value
  HasValue --> HasValue: newer value replaces older ones
  HasValue --> Tombstone: record with a null value
  Tombstone --> Gone: after delete.retention.ms`)
    ],
    'ret:3': [
      D(SEQ, 'A segment moves to remote storage', `sequenceDiagram
  participant B as Broker
  participant R as Remote storage
  B->>B: segment rolls and closes
  B->>R: copy the segment
  R-->>B: stored
  Note over B: after local.retention.ms delete the local copy
  B->>R: read an old segment for a replay`),
      D(FLOW, 'Where a read is served from', `flowchart TD
  R["Fetch at an offset"] --> Q{"Segment still local?"}
  Q -->|"yes"| L["Local disk and page cache"]
  Q -->|"no"| M["Remote storage, higher latency"]`)
    ],
    'txn:1': [
      D(SEQ, 'A transaction', `sequenceDiagram
  participant A as App
  participant T as Txn coordinator
  participant O as Output partitions
  participant F as __consumer_offsets
  A->>T: initTransactions
  A->>T: AddPartitionsToTxn
  A->>O: produce records
  A->>T: AddOffsetsToTxn
  A->>F: TxnOffsetCommit
  A->>T: commitTransaction
  T->>T: log PREPARE_COMMIT
  T->>O: COMMIT marker
  T->>F: COMMIT marker`),
      D(STATE, 'A transaction at the coordinator', `stateDiagram-v2
  [*] --> Ongoing
  Ongoing --> PrepareCommit: commit requested
  PrepareCommit --> CompleteCommit: markers written everywhere
  Ongoing --> PrepareAbort: abort or timeout
  PrepareAbort --> CompleteAbort: markers written everywhere`)
    ],
    'txn:2': [
      D(SEQ, 'Fencing', `sequenceDiagram
  participant Z as Old instance epoch 5
  participant T as Txn coordinator
  participant N as New instance
  Z->>Z: long pause
  N->>T: initTransactions same id
  T-->>N: epoch 6, old transaction aborted
  Z->>T: produce with epoch 5
  T-->>Z: ProducerFencedException`),
      D(FLOW, 'Which writes are accepted', `flowchart TD
  W["Write with epoch E"] --> Q{"E equal to the current epoch?"}
  Q -->|"yes"| OK["Accepted"]
  Q -->|"no, older"| F["Fenced"]`)
    ],
    'txn:3': [
      D(FLOW, 'What a consumer may read', `flowchart TD
  C["Consumer"] --> I{"isolation.level"}
  I -->|"read_uncommitted"| H["Up to the high watermark"]
  I -->|"read_committed"| L["Up to the last stable offset, skipping aborted records"]`),
      D(STATE, 'The last stable offset', `stateDiagram-v2
  [*] --> Open: transaction begins, LSO stops at its first record
  Open --> Committed: COMMIT marker, LSO moves past
  Open --> Aborted: ABORT marker, LSO moves past
  Open --> Aborted: transaction.timeout.ms 60 s`)
    ],
    'kraft:1': [
      D(STATE, 'A controller', `stateDiagram-v2
  [*] --> Follower
  Follower --> Candidate: no leader heard, epoch plus 1
  Candidate --> Active: votes from a majority
  Candidate --> Follower: another leader or higher epoch seen
  Active --> Follower: higher epoch seen`),
      D(SEQ, 'Failover of the active controller', `sequenceDiagram
  participant C1 as Controller 1 active
  participant C2 as Controller 2
  participant C3 as Controller 3
  C1->>C1: crashes
  C2->>C2: election timeout, epoch plus 1
  C2->>C3: request vote
  C3-->>C2: yes
  C2->>C2: 2 of 3 votes, active controller`)
    ],
    'kraft:2': [
      D(SEQ, 'A metadata change', `sequenceDiagram
  participant A as Admin client
  participant L as Active controller
  participant F as Follower controllers
  participant B as Brokers
  A->>L: create topic
  L->>L: append to __cluster_metadata
  F->>L: fetch the record
  L->>L: majority stored, commit
  L-->>A: topic created
  B->>L: fetch the metadata log`),
      D(FLOW, 'Is a metadata change committed', `flowchart TD
  C["Change appended by the active controller"] --> Q{"Stored on a majority?"}
  Q -->|"yes"| OK["Committed, brokers apply it"]
  Q -->|"no"| W["Not committed, may be discarded after a failover"]`)
    ],
    'kraft:3': [
      D(STATE, 'A broker', `stateDiagram-v2
  [*] --> Registered
  Registered --> Active: heartbeats and caught up
  Active --> Fenced: no heartbeat for broker.session.timeout.ms
  Fenced --> Active: heartbeats again and metadata caught up`),
      D(SEQ, 'Fencing a silent broker', `sequenceDiagram
  participant B as Broker 3
  participant C as Active controller
  B->>B: long GC pause
  Note over C: 9 s without a heartbeat
  C->>C: fence broker 3, move its leaders to other ISR members
  B->>C: heartbeat after recovery
  C->>C: unfence broker 3`)
    ]
  };
})();
