/* Mermaid diagrams for the ScyllaDB system-design course, in the same layout as the Redis, Spark and PostgreSQL courses:
 *   CourseData.hldOverall            one flowchart for the whole cluster
 *   CourseData.hld[featureId]        one flowchart per feature (high-level design)
 *   CourseData.diagrams['id:n']      one or two sequence, state or flow diagrams per use case (n starts at 1)
 * Mermaid syntax notes: no semicolons or hash signs in labels (they end a statement or start a comment). */
(function () {
  const SEQ = 'Sequence', STATE = 'State', FLOW = 'Flow';
  const D = (kind, title, src) => ({ kind, title, src });

  CourseData.hldOverall = `flowchart LR
  CL["Client driver<br/>token-aware, shard-aware"] --> CO["Coordinator<br/>any node"]
  CO --> RG["Token ring or tablet map<br/>replica set"]
  RG --> R1["Replica 1"]
  RG --> R2["Replica 2"]
  RG --> R3["Replica 3"]
  R1 --> WP["Commitlog + memtable"]
  WP --> SS["SSTables<br/>flush"]
  SS --> CP["Compaction<br/>merge by timestamp"]
  CP --> TB["Tombstones<br/>gc_grace, repair, hints"]
  RF["Raft group 0<br/>schema, topology, tablet map"] -.-> RG
  TL["Tablet balancer"] -.-> RF`;

  CourseData.hld = {
    ring: `flowchart LR
  K["Partition key"] -->|"Murmur3"| T["64-bit token"]
  T --> O["Owner: first token clockwise"]
  O --> RS["Replica set: next distinct nodes"]
  RS --> N1["Node"]
  N1 --> SH["Shard: one core owns the token"]`,
    coord: `flowchart LR
  C["Client"] --> CO["Coordinator"]
  CO -->|"parallel"| A["Replica A"]
  CO -->|"parallel"| B["Replica B"]
  CO -->|"parallel"| X["Replica C"]
  A -->|"ack"| CO
  B -->|"ack"| CO
  CO -->|"enough acks for the level"| C
  CO -.->|"replica down"| H["Hint stored"]`,
    route: `flowchart TD
  D["Driver"] --> P{"Prepared statement<br/>with partition key?"}
  P -->|"yes"| T["Compute token, pick a replica as coordinator"]
  P -->|"no"| R["Random coordinator, forwards"]
  T --> SA["Shard-aware connection to the owning core"]
  D --> RT{"Timeout?"}
  RT -->|"idempotent, under the limit"| BO["Retry with backoff"]
  RT -->|"otherwise"| ER["Surface the error"]`,
    write: `flowchart LR
  W["Write"] --> CLG["Commitlog append"]
  W --> MT["Memtable<br/>sorted, in memory"]
  MT -->|"full"| FL["Flush"]
  FL --> SS["SSTable<br/>immutable file"]
  CLG -->|"released after flush"| X["Segment recycled"]
  MT -.->|"memory at limit"| BP["Writers wait"]`,
    read: `flowchart LR
  Q["Read"] --> RC{"Row cache hit?"}
  RC -->|"yes"| A["Answer"]
  RC -->|"no"| M["Memtable"]
  M --> BF{"Bloom filter per SSTable"}
  BF -->|"maybe"| IX["Index and data file"]
  BF -->|"absent"| SK["Skip file"]
  IX --> MG["Merge cells, newest timestamp wins"]
  M --> MG
  MG --> A`,
    compact: `flowchart TD
  FL["Flushes create small SSTables"] --> PD["Pending compactions"]
  PD --> ST{"Strategy"}
  ST -->|"STCS"| S1["Merge similar sizes"]
  ST -->|"LCS"| S2["Push into levels"]
  ST -->|"TWCS"| S3["Merge inside a time window"]
  S1 --> OUT["Write output, then delete inputs"]
  S2 --> OUT
  S3 --> OUT
  OUT --> SP["Needs free disk headroom"]`,
    tomb: `flowchart LR
  DEL["Delete or TTL expiry"] --> TS["Tombstone with a timestamp"]
  TS --> RP["Replicas: hint, read repair, repair"]
  RP --> GC{"Older than gc_grace_seconds<br/>and repaired?"}
  GC -->|"yes"| PU["Compaction purges tombstone and data"]
  GC -->|"no"| KP["Keep the tombstone"]
  MISS["Replica missed the delete"] -.-> RES["Old row can return"]`,
    tablets: `flowchart LR
  MAP["Tablet map<br/>range to replica set"] --> LB["Load balancer"]
  LB --> MV["Move a tablet<br/>double-write, stream, switch, clean"]
  MAP --> SP["Split when over the size target"]
  MAP --> MG["Merge when small"]
  RF["Raft group 0"] --> MAP
  MV --> RF`,
    raft: `flowchart LR
  CMD["Metadata command<br/>schema, topology, tablet map"] --> LD["Raft leader"]
  LD --> F1["Follower"]
  LD --> F2["Follower"]
  LD --> F3["Follower"]
  F1 -->|"stored"| LD
  F2 -->|"stored"| LD
  LD -->|"majority stored: commit"| ST["Apply on every node"]
  DATA["Row reads and writes"] -.->|"not through Raft"| CO["Coordinator and consistency level"]`
  };

  CourseData.diagrams = {
    'ring:1': [
      D(FLOW, 'From key to replicas', `flowchart TD
  K["Partition key"] --> H["Murmur3 hash gives a token"]
  H --> O["Find the first ring token at or after it"]
  O --> W{"More tokens to walk?"}
  W -->|"need RF distinct nodes"| N["Take the next distinct node clockwise"]
  N --> W
  W -->|"RF nodes found"| R["Replica set"]`),
      D(SEQ, 'Adding a node', `sequenceDiagram
  participant N as New node
  participant C as Cluster
  participant O as Old owners
  N->>C: join with its tokens
  C->>O: ranges that now belong to the new node
  O->>N: stream those partitions
  N-->>C: ready, serves its ranges
  Note over O: other keys never moved`)
    ],
    'ring:2': [
      D(FLOW, 'Choosing a key that spreads writes', `flowchart TD
  A["Hot partition key"] --> B{"Can one key take the load?"}
  B -->|"no"| C["Add a bucket derived from a known value"]
  C --> D["Reads may need all buckets"]
  B -->|"yes, but it grows for ever"| E["Add a time bucket"]
  E --> F["Bounded partitions"]`),
      D(SEQ, 'One key, one core', `sequenceDiagram
  participant C as Clients
  participant R as Replicas of the key
  participant S as The owning core
  C->>R: 40000 writes per second for seller 17
  R->>S: all hash to one token
  S-->>C: saturated, timeouts
  Note over S: other cores idle`)
    ],
    'ring:3': [
      D(SEQ, 'Shard-aware delivery', `sequenceDiagram
  participant D as Driver
  participant N as Node
  participant S as Owning shard
  D->>D: hash key to token, token to shard
  D->>N: connect to the shard-aware port
  N-->>D: connection to every shard
  D->>S: request on the owning shard's connection
  S-->>D: reply, no hand-off`),
      D(STATE, 'A request on a node', `stateDiagram-v2
  [*] --> Arrived
  Arrived --> Owned: arrives on the owning shard
  Arrived --> Forwarded: wrong shard
  Forwarded --> Owned: hand-off to the owner
  Owned --> [*]: served without locks`)
    ],
    'coord:1': [
      D(SEQ, 'Write then read at QUORUM', `sequenceDiagram
  participant C as Client
  participant Co as Coordinator
  participant A as Replica A
  participant B as Replica B
  participant X as Replica C down
  C->>Co: write at QUORUM
  Co->>A: mutation
  Co->>B: mutation
  Co--xX: mutation lost
  A-->>Co: ack
  B-->>Co: ack
  Co-->>C: OK
  C->>Co: read at QUORUM
  Co->>X: read after C returns
  Co->>A: read
  X-->>Co: old version
  A-->>Co: new version
  Co-->>C: newest timestamp wins`),
      D(FLOW, 'Is a read guaranteed fresh', `flowchart TD
  A["Replicas written W plus replicas read R"] --> B{"W + R greater than RF?"}
  B -->|"yes"| C["They overlap: the read sees the newest acknowledged write"]
  B -->|"no"| D["A read may miss the newest write"]`)
    ],
    'coord:2': [
      D(SEQ, 'Coordinator fan-out', `sequenceDiagram
  participant C as Client
  participant Co as Coordinator
  participant A as Replica A
  participant B as Replica B
  participant X as Replica C
  C->>Co: write at QUORUM
  Co->>A: mutation
  Co->>B: mutation
  Co->>X: mutation
  A-->>Co: ack
  B-->>Co: ack
  Co-->>C: OK at the second ack
  X-->>Co: late ack`),
      D(STATE, 'A write request at the coordinator', `stateDiagram-v2
  [*] --> Sent
  Sent --> Waiting: sent to every replica
  Waiting --> Done: acks reach the level
  Waiting --> TimedOut: not enough acks in time
  Waiting --> Unavailable: not enough live replicas known before sending
  Done --> [*]`)
    ],
    'coord:3': [
      D(FLOW, 'Which replicas count', `flowchart TD
  L{"Consistency level"} -->|"QUORUM"| Q["Majority of all replicas, both datacenters"]
  L -->|"LOCAL_QUORUM"| LQ["Majority of replicas in the coordinator datacenter"]
  L -->|"EACH_QUORUM"| EQ["Majority in every datacenter"]
  Q --> W["May wait on the WAN"]
  LQ --> N["No WAN wait"]
  EQ --> W`),
      D(SEQ, 'A local write with the other datacenter lost', `sequenceDiagram
  participant C as Client in DC1
  participant Co as Coordinator in DC1
  participant L as DC1 replicas
  participant R as DC2 replicas
  C->>Co: write at LOCAL_QUORUM
  Co->>L: mutation
  Co--xR: mutation, DC2 unreachable
  L-->>Co: 2 acks
  Co-->>C: OK
  Note over R: catches up by hints and repair`)
    ],
    'route:1': [
      D(SEQ, 'A token-aware read', `sequenceDiagram
  participant D as Driver
  participant R as Replica as coordinator
  D->>D: partition key from the prepared statement, compute the token
  D->>R: read
  R->>R: serve locally
  R-->>D: reply`),
      D(FLOW, 'Choosing a coordinator', `flowchart TD
  A["Request"] --> B{"Prepared with a partition key?"}
  B -->|"yes"| C["Token-aware: a replica coordinates"]
  B -->|"no"| D["Any node, which forwards"]`)
    ],
    'route:2': [
      D(STATE, 'The retry feedback loop', `stateDiagram-v2
  [*] --> Healthy
  Healthy --> Slow: a burst or a slow node
  Slow --> Retrying: clients time out and retry
  Retrying --> Overloaded: retries add load
  Overloaded --> Retrying: more timeouts
  Retrying --> Healthy: bounded retries and backoff shed load`),
      D(SEQ, 'A request that outlives its client', `sequenceDiagram
  participant C as Client
  participant Co as Coordinator
  participant R as Replicas
  C->>Co: request
  Co->>R: mutation
  C->>C: client timeout fires, give up
  C->>Co: retry
  R-->>Co: first attempt completes anyway
  Note over R: work done for an abandoned request`)
    ],
    'route:3': [
      D(SEQ, 'A timeout then a retry', `sequenceDiagram
  participant C as Client
  participant Co as Coordinator
  participant R as Replicas
  C->>Co: INSERT
  Co->>R: mutation
  R-->>Co: some acks arrive late
  Co-->>C: timeout
  C->>Co: retry the same INSERT
  Co->>R: same cell, same data
  R-->>Co: acks
  Co-->>C: OK`),
      D(FLOW, 'May I retry this statement', `flowchart TD
  S["Statement timed out"] --> I{"Idempotent?"}
  I -->|"yes: same key, fixed values"| R["Retry with backoff"]
  I -->|"counter, list append"| N["Do not retry blindly: read first"]`)
    ],
    'write:1': [
      D(SEQ, 'A write on one replica', `sequenceDiagram
  participant Co as Coordinator
  participant R as Replica shard
  participant L as Commitlog
  participant M as Memtable
  Co->>R: mutation
  R->>L: append
  R->>M: insert, sorted
  R-->>Co: ack
  M->>M: full, flush to a new SSTable
  M->>L: segments can be released`),
      D(STATE, 'A cell\'s life', `stateDiagram-v2
  [*] --> Memtable: write
  Memtable --> SSTable: flush
  SSTable --> SSTable: merged by compaction
  SSTable --> [*]: overwritten or purged`)
    ],
    'write:2': [
      D(SEQ, 'Periodic commitlog sync and a crash', `sequenceDiagram
  participant C as Coordinator
  participant R as Replica
  participant D as Disk
  C->>R: write
  R-->>C: ack at once
  R->>D: fsync on a timer
  Note over R,D: crash between two syncs loses unsynced writes here
  Note over C: the other replicas still hold the write`),
      D(FLOW, 'Which sync mode', `flowchart TD
  A["commitlog_sync"] --> B{"Mode"}
  B -->|"periodic"| P["Ack first, fsync every period"]
  B -->|"batch"| T["Ack after fsync in small groups"]
  P --> L["Loss window on one node, covered by replicas"]
  T --> N["No window, higher latency"]`)
    ],
    'write:3': [
      D(STATE, 'Memtable memory', `stateDiagram-v2
  [*] --> Balanced
  Balanced --> Filling: write rate above flush rate
  Filling --> Balanced: flush catches up
  Filling --> AtLimit: dirty memory full
  AtLimit --> Throttled: writers wait for a flush
  Throttled --> Balanced: memory freed`),
      D(FLOW, 'Why flushes fall behind', `flowchart TD
  W["High write rate"] --> M["Memtables fill"]
  C["Compaction uses the disk"] --> S["Flush is slow"]
  M --> F{"Flush faster than writes?"}
  S --> F
  F -->|"no"| B["Dirty memory grows, writes throttled"]
  F -->|"yes"| OK["Balanced"]`)
    ],
    'read:1': [
      D(SEQ, 'A read across files', `sequenceDiagram
  participant R as Replica shard
  participant M as Memtable
  participant F1 as SSTable 1 filter
  participant F2 as SSTable 2 filter
  participant D as Data files
  R->>M: any cell for the key
  R->>F1: maybe present
  R->>F2: definitely absent
  R->>D: read only SSTable 1
  R->>R: merge, newest timestamp wins`),
      D(FLOW, 'Point read decision', `flowchart TD
  A["Key"] --> B{"In the row cache?"}
  B -->|"yes"| Z["Return"]
  B -->|"no"| C["Ask each SSTable filter"]
  C --> D{"Maybe present?"}
  D -->|"yes"| E["Index lookup then data read"]
  D -->|"no"| F["Skip the file"]`)
    ],
    'read:2': [
      D(FLOW, 'Filter sizing', `flowchart TD
  P["bloom_filter_fp_chance p"] --> B["Bits per key = 1.44 x log2 of 1 over p"]
  B --> M["Memory = bits x keys"]
  P --> R["Wasted file reads per miss = p x files"]
  M --> T["Trade memory for fewer disk reads"]
  R --> T`),
      D(SEQ, 'A miss with and without filters', `sequenceDiagram
  participant R as Replica
  participant F as Filters
  participant D as Data files
  R->>F: is the key in file 1 to 10
  F-->>R: absent in all (probability 1 minus p each)
  Note over R,D: no data file is read
  R->>F: another key
  F-->>R: maybe in file 3 (false positive)
  R->>D: one wasted read`)
    ],
    'read:3': [
      D(STATE, 'The cache under a scan', `stateDiagram-v2
  [*] --> Warm
  Warm --> Filling: scan reads cold rows
  Filling --> Washed: hot rows evicted
  Washed --> Warm: hot reads refill it
  Warm --> Warm: scan with BYPASS CACHE`),
      D(FLOW, 'Should this query use the cache', `flowchart TD
  Q["Query"] --> T{"Hot point read or big scan?"}
  T -->|"hot point read"| C["Use the cache"]
  T -->|"big scan"| B["BYPASS CACHE"]`)
    ],
    'compact:1': [
      D(FLOW, 'Size-tiered merge', `flowchart TD
  F["Flushes make SSTables"] --> C{"Enough of similar size?"}
  C -->|"no"| W["Wait"]
  C -->|"yes"| M["Merge: newest timestamp per key"]
  M --> O["Write the output SSTable"]
  O --> D["Delete the inputs"]`),
      D(SEQ, 'Reads before and after a merge', `sequenceDiagram
  participant R as Read
  participant S as SSTables
  R->>S: key a is in 3 files
  S-->>R: 3 cells, newest wins
  S->>S: compaction merges the 3 files
  R->>S: key a again
  S-->>R: 1 file, 1 cell`)
    ],
    'compact:2': [
      D(FLOW, 'Which strategy', `flowchart TD
  W["Table workload"] --> A{"Append-only with TTL?"}
  A -->|"yes"| T["Time-window"]
  A -->|"no"| B{"Read-heavy with overwrites?"}
  B -->|"yes"| L["Leveled"]
  B -->|"no"| S["Size-tiered"]`),
      D(STATE, 'Leveled compaction', `stateDiagram-v2
  [*] --> L0: flush
  L0 --> L1: compact into non-overlapping files
  L1 --> L2: level full, push down
  L2 --> L3: level full, push down`)
    ],
    'compact:3': [
      D(SEQ, 'Disk use during a merge', `sequenceDiagram
  participant C as Compaction
  participant D as Disk
  C->>D: read 4 input files
  C->>D: write the output, space grows
  Note over D: inputs and output both on disk, peak use
  C->>D: delete the inputs
  Note over D: space returns`),
      D(STATE, 'A node as disk fills', `stateDiagram-v2
  [*] --> Healthy
  Healthy --> Merging: merge in progress
  Merging --> Healthy: inputs deleted
  Merging --> Behind: flushes outrun compaction
  Behind --> Critical: disk almost full
  Critical --> Healthy: space freed and load shed`)
    ],
    'tomb:1': [
      D(STATE, 'A deleted cell', `stateDiagram-v2
  [*] --> Live
  Live --> Shadowed: tombstone written
  Shadowed --> Purged: compaction after gc_grace and repair
  Purged --> [*]`),
      D(SEQ, 'Read after a delete', `sequenceDiagram
  participant R as Read
  participant M as Memtable
  participant S as Older SSTable
  R->>M: cells for the key
  M-->>R: tombstone, timestamp 5
  R->>S: cells for the key
  S-->>R: value, timestamp 1
  R->>R: newest wins, key reads as deleted`)
    ],
    'tomb:2': [
      D(FLOW, 'Why the queue slows', `flowchart TD
  W["Workers delete processed rows"] --> T["Tombstones pile at the head"]
  R["Reads start at the head"] --> S["Scan every tombstone first"]
  T --> S
  S --> L["Latency grows with processed jobs"]
  C["Compaction"] -.->|"cannot purge before gc_grace"| T`),
      D(FLOW, 'Fixes', `flowchart TD
  P["Queue table in a partition"] --> A["Read WHERE id greater than last processed"]
  P --> B["Time bucket in the key, TTL, time-window compaction"]
  P --> Q["Use a real queue system"]`)
    ],
    'tomb:3': [
      D(SEQ, 'How a delete is lost', `sequenceDiagram
  participant C as Client
  participant A as Replica A
  participant B as Replica B
  participant X as Replica C
  C->>A: delete at QUORUM
  C->>B: delete
  C--xX: delete missed, C is down
  A->>A: tombstone kept for gc_grace
  Note over A,B: day 10, tombstone purged
  X-->>C: old row returned at QUORUM with A
  C->>A: read repair copies the old row back`),
      D(STATE, 'A tombstone', `stateDiagram-v2
  [*] --> Written
  Written --> Spread: reaches every replica by hint, read repair or repair
  Written --> Dangerous: grace period over, a replica never got it
  Spread --> Purged: grace over and repaired
  Dangerous --> Resurrected: old row wins`)
    ],
    'tablets:1': [
      D(SEQ, 'Scale out with tablets', `sequenceDiagram
  participant N as New node E
  participant B as Balancer
  participant R as Raft group 0
  N->>R: join, no tablets
  B->>R: plan: move T2 from B to E
  R-->>B: map updated, T2 migrating
  B->>N: stream T2
  B->>R: complete: T2 on C, D, E
  Note over N: repeat for a few tablets`),
      D(FLOW, 'Balancer decision', `flowchart TD
  L["Compare tablet counts and load per node"] --> U{"Uneven?"}
  U -->|"yes"| M["Pick a tablet from the fullest node to the emptiest"]
  U -->|"no"| W["Wait"]
  M --> L`)
    ],
    'tablets:2': [
      D(STATE, 'A tablet replica move', `stateDiagram-v2
  [*] --> Stable
  Stable --> DoubleWrite: new replica added to write set
  DoubleWrite --> Streaming: copy existing data
  Streaming --> Switched: reads move, stale coordinators fenced
  Switched --> CleanedUp: old replica frees its copy
  Streaming --> Stable: failure, rolled back
  CleanedUp --> [*]`),
      D(SEQ, 'Writes during a move', `sequenceDiagram
  participant C as Coordinator
  participant B as Old replica B
  participant E as New replica E
  C->>B: write
  C->>E: write, double-write
  E->>E: store write
  B->>E: stream old data
  Note over E: new writes and old data merge by timestamp`)
    ],
    'tablets:3': [
      D(FLOW, 'Split or merge', `flowchart TD
  S["Tablet size"] --> O{"Over the target?"}
  O -->|"yes"| P{"One partition?"}
  P -->|"no"| SP["Split at a token boundary"]
  P -->|"yes"| NO["Cannot split: fix the key"]
  O -->|"no"| U{"Much under the target?"}
  U -->|"yes"| MG["Merge with a neighbour"]
  U -->|"no"| OK["Leave it"]`),
      D(STATE, 'Tablet count over time', `stateDiagram-v2
  [*] --> Initial
  Initial --> More: splits as data grows
  More --> Fewer: merges as data expires
  Fewer --> More: growth resumes`)
    ],
    'raft:1': [
      D(STATE, 'A node in Raft', `stateDiagram-v2
  [*] --> Follower
  Follower --> Candidate: election timeout, term plus 1
  Candidate --> Leader: votes from a majority
  Candidate --> Follower: another leader or higher term seen
  Candidate --> Candidate: no majority, new term
  Leader --> Follower: higher term seen`),
      D(SEQ, 'An election', `sequenceDiagram
  participant N1 as Node 1 candidate
  participant N2 as Node 2
  participant N3 as Node 3
  N1->>N1: term 1, vote for self
  N1->>N2: request vote
  N1->>N3: request vote
  N2-->>N1: yes
  N3-->>N1: yes
  N1->>N1: 3 of 5 votes, leader of term 1
  N1->>N2: heartbeat and no-op entry`)
    ],
    'raft:2': [
      D(SEQ, 'Replicate and commit', `sequenceDiagram
  participant C as Client
  participant L as Leader
  participant F1 as Follower 1
  participant F2 as Follower 2
  C->>L: ADD COLUMN
  L->>L: append to its log
  L->>F1: append entry
  L->>F2: append entry
  F1-->>L: stored
  F2-->>L: stored
  L->>L: majority stored, commit and apply
  L-->>C: done`),
      D(FLOW, 'After a partition heals', `flowchart TD
  H["Network heals"] --> T{"Which leader has the higher term?"}
  T --> N["The new leader sends its log"]
  N --> S["The stale leader steps down"]
  S --> O["Its uncommitted entries are overwritten"]
  O --> M["All logs match"]`)
    ],
    'raft:3': [
      D(FLOW, 'Which path an operation takes', `flowchart TD
  A["Operation"] --> B{"Cluster metadata?"}
  B -->|"yes: schema, topology, tablet map"| R["Group 0 leader, Raft majority"]
  B -->|"no: row read or write"| C["Coordinator and consistency level"]
  R --> M{"Majority reachable?"}
  M -->|"yes"| OK["Committed"]
  M -->|"no"| BL["Blocked"]`),
      D(SEQ, 'A split with a majority side', `sequenceDiagram
  participant Big as 7 node side
  participant Small as 5 node side
  Big->>Big: schema change committed by 7 of 12
  Small->>Small: schema change cannot commit
  Big->>Big: row writes at LOCAL_QUORUM carry on
  Small->>Small: row writes carry on if their level is met`)
    ]
  };
})();
