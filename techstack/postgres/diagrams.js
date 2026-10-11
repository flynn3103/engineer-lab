/* Mermaid diagrams for the PostgreSQL system-design course, in the same layout as the Redis and Spark courses:
 *   CourseData.hldOverall            one flowchart for the whole engine
 *   CourseData.hld[featureId]        one flowchart per feature (high-level design)
 *   CourseData.diagrams['id:n']      one or two sequence, state or flow diagrams per use case (n starts at 1)
 * Mermaid syntax notes: no semicolons or hash signs in labels (they end a statement or start a comment). */
(function () {
  const SEQ = 'Sequence', STATE = 'State', FLOW = 'Flow';
  const D = (kind, title, src) => ({ kind, title, src });

  CourseData.hldOverall = `flowchart LR
  C["Clients"] --> PM["Postmaster<br/>one backend per connection"]
  PM --> PA["Parser and analyzer<br/>catalog lookups"]
  PA --> PL["Planner<br/>statistics and costs"]
  PL --> EX["Executor<br/>tree of operators"]
  EX --> BP["Shared buffers<br/>8 kB pages"]
  BP --> HP["Heap files and TOAST"]
  BP --> IX["B+tree indexes"]
  EX --> MV["MVCC<br/>snapshots, xmin, xmax"]
  EX --> WAL["WAL<br/>log first"]
  WAL --> CK["Checkpointer and<br/>background writer"]
  CK --> HP
  WAL --> WS["WAL senders"]
  WS --> RP["Replicas"]
  AV["Autovacuum<br/>vacuum and analyze"] -.-> HP
  AV -.-> IX
  AV -.-> PL`;

  CourseData.hld = {
    conn: `flowchart LR
  CL["Client"] -->|"connect"| PM["Postmaster"]
  PM -->|"fork"| BE["Backend process"]
  BE --> PS["Parse<br/>grammar"]
  PS --> AN["Analyze<br/>catalog lookup"]
  AN --> RW["Rewrite<br/>views, rules"]
  RW --> PC{"Plan cache<br/>usable plan?"}
  PC -->|"no"| PL["Planner"]
  PC -->|"yes"| EX["Executor"]
  PL --> EX
  CAT["System catalogs<br/>pg_class, pg_attribute"] -.-> AN`,
    heap: `flowchart LR
  EX["Executor"] --> BM["Buffer manager"]
  BM --> HIT{"In shared<br/>buffers?"}
  HIT -->|"yes"| PG["8 kB page"]
  HIT -->|"no"| CS["Clock sweep<br/>pick a victim"]
  CS --> RD["Read page from file"]
  RD --> PG
  PG --> LP["Line pointers<br/>and row versions"]
  LP -->|"value over 2 kB"| TO["TOAST table<br/>chunks"]`,
    index: `flowchart TD
  Q["WHERE id = 40"] --> R["Root page"]
  R --> I["Internal page"]
  I --> L1["Leaf page"]
  L1 -->|"ctid"| H["Heap page and row"]
  L1 -->|"right link"| L2["Next leaf"]
  INS["Insert"] --> L1
  L1 -->|"full"| SP["Split: new page,<br/>separator goes up"]
  SP -->|"parent full"| R`,
    mvcc: `flowchart LR
  TX["Transaction"] --> SN["Snapshot<br/>xmin, xmax, active ids"]
  SN --> VIS{"Row version<br/>visible?"}
  VIS -->|"xmin committed<br/>xmax not"| OK["Return row"]
  VIS -->|"otherwise"| SK["Skip version"]
  TX --> UP["Update or delete"]
  UP --> NV["New version<br/>old gets xmax"]
  UP --> LK["Row lock"]
  LK -->|"cycle"| DL["Deadlock detector<br/>after 1 s"]`,
    wal: `flowchart LR
  BE["Backend"] --> WB["WAL buffer"]
  BE --> SB["Shared buffers<br/>dirty page"]
  WB -->|"fsync at COMMIT"| WF["WAL files<br/>16 MB segments"]
  SB -->|"after its WAL is flushed"| DF["Data files"]
  CK["Checkpointer<br/>every 5 min or max_wal_size"] --> SB
  CK --> CR["Checkpoint record<br/>and redo point"]
  WF --> RC["Crash recovery<br/>replay from redo point"]`,
    vacuum: `flowchart TD
  UP["Updates and deletes"] --> DT["Dead row versions"]
  DT --> AVL["Autovacuum launcher<br/>checks every minute"]
  AVL --> TH{"Dead rows over<br/>50 + 20% of table?"}
  TH -->|"yes"| VW["Vacuum worker"]
  VW --> HZ{"Older than the<br/>oldest snapshot?"}
  HZ -->|"yes"| FR["Space reusable"]
  HZ -->|"no"| KP["Kept, tried again"]
  VW --> FZ["Freeze old rows"]
  VW --> VM["Visibility map"]`,
    plan: `flowchart LR
  ST["pg_statistic<br/>from ANALYZE"] --> PL["Planner<br/>estimate rows, cost paths"]
  PL --> TR["Plan tree"]
  TR --> LM["Limit"]
  LM --> SC["Scan or sort"]
  SC --> HJ["Hash join<br/>work_mem"]
  HJ -->|"too big"| TF["Temp files<br/>batches"]
  EX["Executor"] -->|"asks for one row"| LM`,
    repl: `flowchart LR
  WAL["Primary WAL"] --> WS["WAL sender"]
  WS --> WR["WAL receiver on standby"]
  WR --> SW["Standby WAL file"]
  SW --> SU["Startup process<br/>replay"]
  SU --> HS["Hot standby queries"]
  WR -.->|"ack: write, flush, apply"| WS
  WS -.->|"commit waits<br/>per synchronous_commit"| WAL
  SL["Replication slot<br/>keeps WAL"] --> WAL
  HS -.->|"hot_standby_feedback"| WAL`
  };

  CourseData.diagrams = {
    'conn:1': [
      D(SEQ, 'The path of one statement', `sequenceDiagram
  participant C as Client
  participant P as Parser
  participant A as Analyzer
  participant K as Catalog
  C->>P: SELECT customer_name FROM orders
  P->>P: grammar check ok
  P->>A: raw parse tree
  A->>K: find orders and its columns
  K-->>A: id, buyer_name, amount
  A-->>C: ERROR 42703 column does not exist`),
      D(STATE, 'Stages of a statement', `stateDiagram-v2
  [*] --> Parse
  Parse --> Analyze: valid grammar
  Analyze --> Rewrite: all names found
  Analyze --> Failed: name not found
  Rewrite --> Plan
  Plan --> Execute
  Execute --> [*]
  Failed --> [*]`)
    ],
    'conn:2': [
      D(SEQ, 'A connection becomes a process', `sequenceDiagram
  participant C as Client
  participant M as Postmaster
  participant B as Backend
  C->>M: connect
  M->>M: slots left under max_connections
  M->>B: fork backend
  B-->>C: authenticated, ready
  C->>B: queries
  C->>B: disconnect
  B-->>M: exit`),
      D(FLOW, 'Admit or refuse a connection', `flowchart TD
  A["New connection"] --> B{"Backends in use<br/>under 97?"}
  B -->|"yes"| OK["Fork a backend"]
  B -->|"no"| C{"Role is a superuser?"}
  C -->|"yes"| OK
  C -->|"no"| X["FATAL: slots reserved"]`)
    ],
    'conn:3': [
      D(SEQ, 'Prepared statement lifecycle', `sequenceDiagram
  participant C as Client
  participant B as Backend
  participant PC as Plan cache
  C->>B: PREPARE by_customer
  B->>PC: store parse tree, no plan
  C->>B: EXECUTE 1 to 5
  B->>B: plan with the real value each time
  C->>B: EXECUTE 6
  B->>PC: compare generic cost with average custom cost
  PC-->>B: keep the generic plan
  C->>B: EXECUTE 7 and later
  B->>PC: reuse the plan, no planning`),
      D(STATE, 'Plan choice for a prepared statement', `stateDiagram-v2
  [*] --> NoPlan
  NoPlan --> Custom: executions 1 to 5
  Custom --> Compare: execution 6
  Compare --> Generic: generic not costlier
  Compare --> Custom: generic costlier
  Generic --> NoPlan: schema change invalidates`)
    ],
    'heap:1': [
      D(FLOW, 'Insert, delete and clean one page', `flowchart TD
  I["Insert row"] --> LP["Add a line pointer at the front"]
  LP --> T["Write the row at the back"]
  D["Delete row"] --> X["Stamp xmax, bytes stay"]
  X --> V["Prune or VACUUM when no snapshot needs it"]
  V --> U["Pointer becomes unused, rows slide together"]
  U --> R["Next insert reuses the pointer"]`),
      D(STATE, 'Life of a line pointer', `stateDiagram-v2
  [*] --> Unused
  Unused --> Normal: insert
  Normal --> Redirect: HOT chain pruned
  Normal --> Dead: row removed, index entries remain
  Dead --> Unused: VACUUM
  Redirect --> Unused: chain end removed`)
    ],
    'heap:2': [
      D(SEQ, 'A miss in the buffer pool', `sequenceDiagram
  participant Q as Backend
  participant B as Buffer manager
  participant F as Data file
  Q->>B: need page X
  B->>B: lookup in hash table, miss
  B->>B: clock sweep lowers usage counts
  B->>B: pick unpinned buffer with usage 0
  B->>F: write victim first if dirty
  B->>F: read page X
  B-->>Q: pinned buffer`),
      D(STATE, 'A buffer', `stateDiagram-v2
  [*] --> Free
  Free --> Valid: page read
  Valid --> Valid: access raises usage up to 5
  Valid --> Dirty: page changed
  Dirty --> Valid: written after its WAL is flushed
  Valid --> Free: evicted at usage 0`)
    ],
    'heap:3': [
      D(FLOW, 'Where a large value ends up', `flowchart TD
  V["Row with a large value"] --> S{"Row over about 2 kB?"}
  S -->|"no"| IN["Store inline"]
  S -->|"yes"| CP["Try compression"]
  CP --> F{"Fits now?"}
  F -->|"yes"| CI["Store compressed inline"]
  F -->|"no"| OL["Cut into chunks in the TOAST table"]
  OL --> PT["Row keeps an 18 byte pointer"]`),
      D(SEQ, 'Reading a toasted value', `sequenceDiagram
  participant Q as Executor
  participant H as Heap page
  participant T as TOAST table
  Q->>H: fetch row
  H-->>Q: row with pointer
  Q->>T: look up chunks through the TOAST index
  T-->>Q: chunk 1 to 20
  Q->>Q: reassemble and decompress`)
    ],
    'index:1': [
      D(SEQ, 'Lookup and insert in a B+tree', `sequenceDiagram
  participant Q as Backend
  participant R as Root page
  participant I as Internal page
  participant L as Leaf page
  participant H as Heap
  Q->>R: binary search, pick child
  R-->>Q: downlink
  Q->>I: binary search, pick child
  I-->>Q: downlink
  Q->>L: binary search for the key
  L-->>Q: key and ctid
  Q->>H: read the heap page`),
      D(FLOW, 'Insert and split', `flowchart TD
  A["Descend to the leaf"] --> B{"Room in the leaf?"}
  B -->|"yes"| C["Insert in order, done"]
  B -->|"no"| D["Split: new right page,<br/>upper half moves"]
  D --> E["Separator goes to the parent"]
  E --> F{"Parent full?"}
  F -->|"no"| G["Done"]
  F -->|"yes"| H{"Parent is the root?"}
  H -->|"no"| D
  H -->|"yes"| I["Split root, add a new root<br/>tree grows one level"]`)
    ],
    'index:2': [
      D(FLOW, 'Can the index seek?', `flowchart TD
  Q["Query on the index (customer_id, created_at)"] --> A{"Filters customer_id?"}
  A -->|"yes, equality"| B["Seek to that customer"]
  A -->|"no"| X["No seek in 17: scan"]
  B --> C{"Also filters created_at?"}
  C -->|"yes"| D["Seek inside the customer run"]
  C -->|"no"| E["Read the whole run, ordered by created_at"]`)
    ],
    'index:3': [
      D(FLOW, 'HOT or not', `flowchart TD
  U["UPDATE a row"] --> A{"Any indexed column changed?"}
  A -->|"yes"| N["Normal update: new entry in every index"]
  A -->|"no"| B{"Room on the same page?"}
  B -->|"no"| N
  B -->|"yes"| H["HOT: new version on the same page, no index entry"]`),
      D(SEQ, 'Reading through a HOT chain', `sequenceDiagram
  participant Q as Index scan
  participant I as Index
  participant P as Heap page
  Q->>I: find id 42
  I-->>Q: pointer 1
  Q->>P: read pointer 1
  P-->>Q: old version, chained to pointer 2
  Q->>P: follow the chain to pointer 2
  P-->>Q: visible version`)
    ],
    'mvcc:1': [
      D(STATE, 'A row version', `stateDiagram-v2
  [*] --> Created: insert by tx 100
  Created --> Visible: tx 100 commits
  Created --> Invisible: tx 100 aborts
  Visible --> Deleted: update or delete by tx 105
  Deleted --> Visible: tx 105 aborts
  Deleted --> Dead: tx 105 commits, no snapshot needs it
  Dead --> [*]: VACUUM removes it`),
      D(SEQ, 'Reader and writer do not block', `sequenceDiagram
  participant W as Writer tx 105
  participant H as Heap
  participant R as Reader
  W->>H: set xmax 105 on old version, add new version
  R->>H: read with a snapshot
  H-->>R: old version (105 not committed)
  W->>H: commit
  R->>H: next statement, new snapshot
  H-->>R: new version`)
    ],
    'mvcc:2': [
      D(SEQ, 'Two isolation levels, one history', `sequenceDiagram
  participant A as Session A
  participant B as Session B
  A->>A: BEGIN
  A->>A: SELECT sum, snapshot taken
  B->>B: INSERT and COMMIT
  A->>A: SELECT sum again
  Note over A: READ COMMITTED takes a new snapshot and sees 150
  Note over A: REPEATABLE READ keeps the old snapshot and sees 100`),
      D(FLOW, 'A write to a row changed by another transaction', `flowchart TD
  U["UPDATE a row another tx changed and committed"] --> L{"Isolation level"}
  L -->|"READ COMMITTED"| R["Re-read the newest version, apply the change"]
  L -->|"REPEATABLE READ"| E["ERROR 40001: could not serialize"]
  E --> T["Application retries the whole transaction"]`)
    ],
    'mvcc:3': [
      D(SEQ, 'A deadlock', `sequenceDiagram
  participant A as Session A
  participant B as Session B
  A->>A: UPDATE id 1, holds row 1
  B->>B: UPDATE id 2, holds row 2
  A->>B: UPDATE id 2, waits for B
  B->>A: UPDATE id 1, waits for A
  Note over A,B: after deadlock_timeout 1 s the waiter checks the graph
  B-->>B: ERROR deadlock detected 40P01
  A->>A: gets row 2 and commits`),
      D(STATE, 'A lock wait', `stateDiagram-v2
  [*] --> Running
  Running --> Waiting: row lock held by another tx
  Waiting --> Running: holder commits or aborts
  Waiting --> Checking: deadlock_timeout 1 s
  Checking --> Waiting: no cycle
  Checking --> Aborted: cycle found, this tx is the victim`)
    ],
    'wal:1': [
      D(SEQ, 'COMMIT and the WAL flush', `sequenceDiagram
  participant B as Backend
  participant SB as Shared buffers
  participant WB as WAL buffer
  participant WF as WAL file
  B->>SB: change page, mark dirty
  B->>WB: WAL record for the change
  B->>WB: commit record
  WB->>WF: write and fsync up to commit LSN
  WF-->>B: durable
  B-->>B: COMMIT returns`),
      D(STATE, 'A dirty page and its WAL', `stateDiagram-v2
  [*] --> Clean
  Clean --> Dirty: change, WAL record created
  Dirty --> WalFlushed: WAL flushed up to the page LSN
  WalFlushed --> Clean: page written to the data file`)
    ],
    'wal:2': [
      D(FLOW, 'Replay of one record', `flowchart TD
  R["Read WAL record at LSN L"] --> P["Read the page it changes"]
  P --> C{"Page LSN older than L?"}
  C -->|"yes"| A["Apply the change, set page LSN to L"]
  C -->|"no"| S["Skip, already applied"]
  A --> N["Next record"]
  S --> N`),
      D(SEQ, 'Startup after a crash', `sequenceDiagram
  participant PM as Postmaster
  participant ST as Startup process
  participant W as WAL
  participant D as Data files
  PM->>ST: start recovery
  ST->>ST: read pg_control, find the redo point
  ST->>W: read records from the redo point
  ST->>D: apply records newer than the page LSN
  ST->>ST: end of WAL reached
  ST->>D: end of recovery checkpoint
  PM-->>PM: accept connections`)
    ],
    'wal:3': [
      D(FLOW, 'When a change logs the whole page', `flowchart TD
  C["Change a page"] --> A{"First change since<br/>the last checkpoint redo point?"}
  A -->|"yes"| F["Write the full 8 kB image plus the record"]
  A -->|"no"| S["Write only the small record"]
  F --> L["WAL grows"]
  S --> L`),
      D(SEQ, 'Repairing a torn page', `sequenceDiagram
  participant D as Data file
  participant W as WAL
  participant R as Recovery
  D->>D: page half written, crash
  R->>W: read the record with the full-page image
  R->>D: overwrite the page whole
  R->>W: apply later records on top`)
    ],
    'vacuum:1': [
      D(SEQ, 'An idle transaction pins the horizon', `sequenceDiagram
  participant X as Idle session
  participant W as Writers
  participant V as Autovacuum
  X->>X: BEGIN and one SELECT, snapshot at 210
  W->>W: updates leave dead versions 211 and up
  V->>V: horizon is 210, versions are still visible to X
  V-->>W: nothing removed, table grows
  X->>X: COMMIT or timeout
  V->>V: horizon moves on, versions removable`),
      D(FLOW, 'Is a dead version removable', `flowchart TD
  A["Dead version, deleted by tx D"] --> H["Horizon = oldest snapshot of any session, slot or prepared tx"]
  H --> C{"D older than the horizon?"}
  C -->|"yes"| R["Removable"]
  C -->|"no"| K["Keep it for now"]`)
    ],
    'vacuum:2': [
      D(FLOW, 'The autovacuum decision', `flowchart TD
  L["Launcher wakes every minute"] --> T["For each table read dead rows"]
  T --> C{"dead over 50 + scale_factor x rows?"}
  C -->|"yes"| W{"Free worker? up to 3"}
  C -->|"no"| S["Wait for next round"]
  W -->|"yes"| V["Vacuum, throttled by cost limit and delay"]
  W -->|"no"| S`),
      D(SEQ, 'A throttled vacuum', `sequenceDiagram
  participant V as Vacuum worker
  participant D as Table pages
  V->>D: read and clean pages
  V->>V: cost reaches 200
  V->>V: sleep 2 ms
  V->>D: continue
  V->>V: finish, update statistics`)
    ],
    'vacuum:3': [
      D(STATE, 'Age of the oldest unfrozen row', `stateDiagram-v2
  [*] --> Young
  Young --> Aggressive: age over 150 million
  Aggressive --> Forced: age over 200 million
  Forced --> Young: rows frozen
  Forced --> Warning: vacuum blocked, 40 million ids left
  Warning --> Stopped: 3 million ids left
  Stopped --> Young: manual VACUUM`),
      D(FLOW, 'What freezing does', `flowchart TD
  V["Vacuum visits a page"] --> A{"Row older than<br/>vacuum_freeze_min_age?"}
  A -->|"yes"| F["Mark frozen: visible to every snapshot"]
  A -->|"no"| K["Leave as it is"]
  F --> D["Table age drops"]`)
    ],
    'plan:1': [
      D(SEQ, 'Estimate, run, re-analyze', `sequenceDiagram
  participant P as Planner
  participant S as pg_statistic
  participant E as Executor
  participant A as ANALYZE
  P->>S: how many pending rows
  S-->>P: 1 million (stale)
  P->>E: nested loop with index probes
  E->>E: 13 million probes, hours
  A->>S: sample 30000 rows, new statistics
  P->>S: how many pending rows
  S-->>P: 13 million
  P->>E: hash join over a seq scan`),
      D(FLOW, 'Why the statistics lagged', `flowchart TD
  C["Rows changed since the last analyze"] --> T{"over 50 + 10% of the table?"}
  T -->|"no"| W["Autoanalyze waits, statistics stay stale"]
  T -->|"yes"| A["Autoanalyze runs"]`)
    ],
    'plan:2': [
      D(FLOW, 'Hash join with batches', `flowchart TD
  B["Build side larger than the hash memory"] --> N["Pick the batch count, a power of two"]
  N --> P["Hash each row to a batch"]
  P --> M["Batch 0 stays in memory"]
  P --> T["Other batches go to temp files, both inputs"]
  M --> J0["Join batch 0 while reading the probe side"]
  T --> JN["Join each other batch from disk, one at a time"]`),
      D(SEQ, 'One spilled batch', `sequenceDiagram
  participant H as Hash join
  participant F as Temp files
  H->>F: write build rows of batch 1
  H->>F: write probe rows of batch 1
  H->>H: finish batch 0
  H->>F: read build rows of batch 1
  H->>H: build a hash table
  H->>F: stream probe rows of batch 1
  H-->>H: emit matches`)
    ],
    'plan:3': [
      D(SEQ, 'Demand pull', `sequenceDiagram
  participant L as Limit
  participant S as Index scan
  participant I as Index and heap
  L->>S: next row
  S->>I: fetch entry
  I-->>S: row, status new
  S->>S: filter rejects it
  S->>I: fetch next entry
  I-->>S: row, status paid
  S-->>L: row
  L->>L: 3 rows returned, stop asking`),
      D(FLOW, 'Streaming or blocking', `flowchart TD
  Q["ORDER BY created_at DESC LIMIT 3"] --> I{"Index gives the order?"}
  I -->|"yes"| S["Index scan returns rows in order, Limit stops early"]
  I -->|"no"| B["Sort must read every row before returning the first"]`)
    ],
    'repl:1': [
      D(SEQ, 'A commit with a synchronous standby', `sequenceDiagram
  participant C as Client
  participant P as Primary
  participant S as Standby
  C->>P: COMMIT
  P->>P: flush WAL locally
  P->>S: stream WAL
  S->>S: write, flush, apply
  S-->>P: ack at the chosen stage
  P-->>C: OK`),
      D(STATE, 'How far a commit waits', `stateDiagram-v2
  [*] --> Off
  Off --> Local: waits for local flush
  Local --> RemoteWrite: waits for standby write
  RemoteWrite --> On: waits for standby flush
  On --> RemoteApply: waits for standby apply
  RemoteApply --> [*]`)
    ],
    'repl:2': [
      D(SEQ, 'A recovery conflict', `sequenceDiagram
  participant Q as Report on standby
  participant S as Startup process
  participant P as Primary
  Q->>Q: running with a snapshot
  P->>S: WAL: vacuum removes dead rows
  S->>S: conflict with the report, wait
  S->>S: max_standby_streaming_delay 30 s passes
  S->>Q: cancel with conflict error
  S->>S: resume replay`),
      D(FLOW, 'Choosing a remedy', `flowchart TD
  C["Reports cancelled by recovery conflicts"] --> A{"Can reports tolerate a lagging replica?"}
  A -->|"yes"| D["Raise max_standby_streaming_delay"]
  A -->|"no"| F{"Can the primary hold cleanup?"}
  F -->|"yes"| H["hot_standby_feedback = on"]
  F -->|"no"| R["Use a separate analytics replica"]`)
    ],
    'repl:3': [
      D(STATE, 'Life of a slot', `stateDiagram-v2
  [*] --> Active: consumer connected
  Active --> Inactive: consumer gone
  Inactive --> Active: consumer returns
  Inactive --> Lost: retained WAL passes max_slot_wal_keep_size
  Inactive --> Dropped: administrator drops it
  Lost --> Dropped
  Dropped --> [*]`),
      D(FLOW, 'WAL removal at a checkpoint', `flowchart TD
  C["Checkpoint ends"] --> S{"Any slot or keep size needs this WAL?"}
  S -->|"no"| R["Recycle or remove the segment"]
  S -->|"yes"| K["Keep it, pg_wal grows"]
  K --> D{"Disk full?"}
  D -->|"yes"| X["Primary cannot write WAL, commits fail"]`)
    ]
  };
})();
