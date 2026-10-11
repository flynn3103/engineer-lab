/* Mermaid diagrams for the Redis system-design course, in the same layout as the Spark course:
 *   CourseData.hldOverall            one flowchart for the whole server
 *   CourseData.hld[featureId]        one flowchart per feature (high-level design)
 *   CourseData.diagrams['id:n']      one or two sequence, state or flow diagrams per use case (n starts at 1)
 * Mermaid syntax notes: no semicolons or hash signs in labels (they end a statement or start a comment). */
(function () {
  const SEQ = 'Sequence', STATE = 'State', FLOW = 'Flow';
  const D = (kind, title, src) => ({ kind, title, src });

  CourseData.hldOverall = `flowchart LR
  C["Clients<br/>RESP over TCP"] --> EL["Event loop<br/>read, parse, write"]
  EL --> EX["Executor<br/>one command at a time"]
  EX --> KS["Keyspace<br/>dict + encodings"]
  KS --> MEM["TTL expiry,<br/>eviction, maxmemory"]
  EX --> AOF["AOF buffer<br/>write, fsync"]
  EX --> RS["Replication stream<br/>+ backlog"]
  RS --> R["Replicas"]
  KS -. fork .-> RDB["RDB child<br/>dump.rdb"]
  S["Sentinel x3"] -. monitors .-> EX
  S -. promotes .-> R
  CL["Cluster<br/>16384 slots"] -. routes keys .-> C`;

  CourseData.hld = {
    proto: `flowchart LR
  SK["Socket"] -->|"read"| QB["Query buffer<br/>per client"]
  QB --> PA["RESP parser<br/>complete frames only"]
  PA --> EX["Executor<br/>one thread"]
  EX --> OB["Output buffer<br/>per client"]
  OB -->|"write when ready"| SK
  EX -. "slow command<br/>blocks the loop" .-> EX`,
    data: `flowchart LR
  KS["Keyspace dict<br/>key to object"] --> OBJ["redisObject<br/>type + encoding"]
  OBJ --> LP["listpack<br/>small hash, zset, list"]
  OBJ --> HT["hashtable<br/>large hash, set"]
  OBJ --> SL["skiplist + dict<br/>large sorted set"]
  OBJ --> IS["intset<br/>small integer set"]
  LP -->|"over a threshold"| HT
  KS --> RH["Incremental rehash<br/>two tables"]`,
    mem: `flowchart TD
  A["Command arrives"] --> O{"used memory<br/>over maxmemory?"}
  O -->|"no"| RUN["Run command"]
  O -->|"yes"| P{"policy?"}
  P -->|"noeviction"| ERR["Growing command<br/>gets -OOM"]
  P -->|"allkeys-lru etc."| EV["Sample keys,<br/>evict the best victim"]
  EV --> O
  CourseData["Key read"] --> LZ["Lazy expire check"]
  CR["Cron 10 times a second"] --> AX["Sample TTL keys,<br/>delete expired"]`,
    persist: `flowchart LR
  W["Write command"] --> AB["AOF buffer"]
  AB -->|"write()"| AF["AOF file<br/>OS cache"]
  AF -->|"fsync always, everysec, no"| DK["Disk"]
  BG["BGSAVE"] -->|"fork"| CH["Child process"]
  CH --> TMP["temp RDB"]
  TMP -->|"rename"| RDB["dump.rdb"]
  AF -->|"rewrite"| MF["manifest + base + incr"]`,
    repl: `flowchart LR
  P["Primary"] -->|"command stream"| R1["Replica 1"]
  P -->|"command stream"| R2["Replica 2"]
  P --> BL["Backlog<br/>last 1 MB"]
  R1 -->|"REPLCONF ACK offset"| P
  R2 -->|"PSYNC replid offset"| P
  BL -->|"gap in range: CONTINUE"| R2
  P -->|"gap too old: FULLRESYNC"| R2`,
    ha: `flowchart TD
  S1["Sentinel 1"] -->|"PING"| P["Primary"]
  S2["Sentinel 2"] -->|"PING"| P
  S3["Sentinel 3"] -->|"PING"| P
  P -. "no reply 30 s" .-> SD["SDOWN<br/>per Sentinel"]
  SD -->|"quorum agrees"| OD["ODOWN"]
  OD --> VT["Majority vote<br/>one leader per epoch"]
  VT --> PR["REPLICAOF NO ONE<br/>on the best replica"]`,
    cluster: `flowchart LR
  K["Key"] -->|"CRC16 mod 16384"| SL["Slot"]
  SL --> A["Node A<br/>0 to 5460"]
  SL --> B["Node B<br/>5461 to 10922"]
  SL --> C["Node C<br/>10923 to 16383"]
  CLI["Client slot map"] -->|"wrong node"| MV["-MOVED, update map"]
  A -->|"slot migrating"| AK["-ASK, one request"]`,
    msg: `flowchart LR
  T["MULTI"] --> Q["Queue commands"] --> EXE["EXEC<br/>run back to back"]
  XA["XADD"] --> ST["Stream"] --> XR["XREADGROUP"] --> PEL["Pending list"] --> XK["XACK"]
  PUB["PUBLISH"] --> SUB["Connected subscribers<br/>only"]`,
    e2e: `flowchart LR
  C["Client"] --> SL["Slot owner"] --> PA["Parse"] --> EX["Execute"]
  EX --> AB["AOF write()"] --> RP["Reply +OK"]
  EX --> RS["Replication stream"]
  AB -. async .-> FS["fsync"]
  RS -. async .-> RE["Replica applies"]`
  };

  CourseData.diagrams = {
    'proto:1': [D(SEQ, 'One command, three reads', `sequenceDiagram
  participant P as Proxy
  participant B as Query buffer
  participant X as Executor
  P->>B: read 1 (10 bytes)
  Note over B: frame incomplete, wait
  P->>B: read 2 (10 bytes)
  Note over B: still incomplete
  P->>B: read 3 (4 bytes)
  B->>X: complete frame (24 bytes)
  X-->>P: :1`)],
    'proto:2': [D(SEQ, 'Five commands, two ways', `sequenceDiagram
  participant A as Client A one by one
  participant B as Client B pipelined
  participant R as Redis
  A->>R: command 1
  R-->>A: reply 1
  A->>R: command 2
  R-->>A: reply 2
  Note over A,R: three more round trips
  B->>R: commands 1 to 5 together
  R-->>B: replies 1 to 5 together`)],
    'proto:3': [D(SEQ, 'A scan blocks two reads', `sequenceDiagram
  participant O as Operator
  participant B as Clients B and C
  participant X as Executor
  O->>X: KEYS cart:*
  Note over X: busy 80 ms
  B->>X: GET sess:7 and GET cart:9
  Note over B,X: bytes wait in socket buffers
  X-->>O: key list
  X-->>B: replies after about 80 ms`)],
    'data:1': [D(STATE, 'Encoding of one hash', `stateDiagram-v2
  [*] --> listpack: new small hash
  listpack --> listpack: fields 512 or fewer and values 64 B or less
  listpack --> hashtable: more than 512 fields
  listpack --> hashtable: a value over 64 B
  hashtable --> hashtable: deleting fields does not convert back`)],
    'data:2': [D(FLOW, 'Which structure answers which command', `flowchart LR
  ZA["ZADD"] --> SK["skiplist<br/>ordered by score"]
  ZA --> DI["dict<br/>member to score"]
  ZS["ZSCORE"] --> DI
  ZR["ZRANGEBYSCORE"] --> SK
  SK -->|"O(log N) to find the start"| WALK["walk level 1 forward"]`)],
    'data:3': [D(STATE, 'Rehash lifecycle', `stateDiagram-v2
  [*] --> Stable
  Stable --> Rehashing: add key when used is not below size
  Rehashing --> Rehashing: each command moves one bucket
  Rehashing --> Rehashing: cron moves buckets for about 1 ms
  Rehashing --> Stable: old table empty, freed`)],
    'mem:1': [D(FLOW, 'Two paths delete an expired key', `flowchart TD
  G["GET key"] --> LZ{"TTL passed?"}
  LZ -->|"yes"| DEL["Delete, reply nil"]
  LZ -->|"no"| VAL["Return value"]
  CR["Cron tick"] --> SM["Sample about 20 TTL keys"]
  SM --> ST{"more than 10 percent<br/>expired?"}
  ST -->|"yes"| SM
  ST -->|"no"| END["Stop until next tick"]`)],
    'mem:2': [D(FLOW, 'One eviction round', `flowchart TD
  W["Write needs space"] --> S["Sample maxmemory-samples keys"]
  S --> PO["Merge with pool of 16 candidates"]
  PO --> V["Pick most idle key"]
  V --> EV["Evict it"]
  EV --> Q{"still over<br/>maxmemory?"}
  Q -->|"yes"| S
  Q -->|"no"| OK["Run the write"]`)],
    'mem:3': [D(STATE, 'Memory against the limit', `stateDiagram-v2
  [*] --> UnderLimit
  UnderLimit --> OverLimit: a write pushes used memory past maxmemory
  OverLimit --> OverLimit: growing commands get OOM, reads and DEL work
  OverLimit --> UnderLimit: keys deleted or expired`)],
    'persist:1': [D(SEQ, 'BGSAVE with copy-on-write', `sequenceDiagram
  participant P as Parent
  participant K as Kernel
  participant C as Child
  participant D as Disk
  P->>K: fork()
  K-->>C: child shares all pages
  C->>D: write temp RDB
  P->>K: write to a shared page
  K->>K: copy that page for the parent
  C->>D: rename temp to dump.rdb
  C-->>P: exit, copies freed`)],
    'persist:2': [D(SEQ, 'A write under everysec', `sequenceDiagram
  participant C as Client
  participant R as Redis
  participant O as OS cache
  participant F as fsync thread
  C->>R: SET k v
  R->>O: write() to the AOF
  R-->>C: +OK
  Note over O,F: up to a second later
  F->>O: fsync to disk`)],
    'persist:3': [D(SEQ, 'Multi-part AOF rewrite', `sequenceDiagram
  participant P as Parent
  participant C as Child
  participant M as Manifest
  P->>P: open new incr file
  P->>C: fork
  C->>C: write new base file
  C-->>P: done
  P->>M: atomically name new base and incr
  P->>P: delete history files`)],
    'repl:1': [D(SEQ, 'Reconnect with PSYNC', `sequenceDiagram
  participant R as Replica
  participant P as Primary
  R->>P: PSYNC replid offset
  alt offset still in backlog
    P-->>R: +CONTINUE
    P-->>R: only the missing bytes
  else offset too old
    P-->>R: +FULLRESYNC
    P-->>R: RDB, then live stream
  end`)],
    'repl:2': [D(SEQ, 'An acknowledged write that never arrives', `sequenceDiagram
  participant C as Client
  participant P as Primary
  participant R as Replica
  C->>P: SET order:77 paid
  P-->>C: +OK
  P--xR: stream carrying the write (lost)
  Note over P: primary crashes
  R->>R: promoted without the write
  C->>R: GET order:77
  R-->>C: nil`)],
    'repl:3': [D(SEQ, 'WAIT counts replica acknowledgements', `sequenceDiagram
  participant C as Client
  participant P as Primary
  participant R as Replica
  C->>P: SET k v
  P->>R: command stream
  C->>P: WAIT 1 100
  R-->>P: REPLCONF ACK offset
  P-->>C: 1`)],
    'ha:1': [D(STATE, 'View of the primary', `stateDiagram-v2
  [*] --> Up
  Up --> SDOWN: no valid reply for down-after-milliseconds
  SDOWN --> Up: reply again
  SDOWN --> ODOWN: quorum of Sentinels report SDOWN
  ODOWN --> Failover: a leader wins the vote`)],
    'ha:2': [D(SEQ, 'Election and promotion', `sequenceDiagram
  participant A as Sentinel A
  participant B as Sentinels B and C
  participant R as Chosen replica
  participant O as Other replicas
  A->>B: request vote for epoch 7
  B-->>A: vote granted (majority)
  A->>R: REPLICAOF NO ONE
  R-->>A: role is master
  A->>O: REPLICAOF new primary`)],
    'ha:3': [D(FLOW, 'Two primaries during a partition', `flowchart LR
  subgraph L["Minority side"]
    OP["Old primary"] --- CA["Client A"]
  end
  subgraph Rt["Majority side"]
    SE["Sentinels"] --- NP["New primary"] --- CB["Client B"]
  end
  L -. "partition" .- Rt
  OP -->|"min-replicas-to-write fails after max-lag"| NR["-NOREPLICAS"]`)],
    'cluster:1': [D(FLOW, 'From key to node', `flowchart TD
  K["Key"] --> T{"contains braces<br/>with text inside?"}
  T -->|"yes"| TG["Hash only the text inside"]
  T -->|"no"| WH["Hash the whole key"]
  TG --> C["CRC16 mod 16384"]
  WH --> C
  C --> N["Slot owner node"]`)],
    'cluster:2': [D(SEQ, 'MOVED and ASK', `sequenceDiagram
  participant C as Client
  participant A as Node A
  participant B as Node B
  C->>B: GET k1 (stale map)
  B-->>C: -MOVED 7638 A
  C->>A: GET k1
  Note over A,B: slot 7638 migrating to B
  C->>A: GET k2 (already moved)
  A-->>C: -ASK 7638 B
  C->>B: ASKING
  C->>B: GET k2
  B-->>C: value`)],
    'cluster:3': [D(FLOW, 'When a command is refused', `flowchart TD
  CM["Command with keys"] --> ONE{"all keys in<br/>one slot?"}
  ONE -->|"no"| CS["-CROSSSLOT"]
  ONE -->|"yes"| OW{"slot has<br/>an owner?"}
  OW -->|"yes"| COV{"any other slot<br/>uncovered?"}
  OW -->|"no"| FAIL["Error for that slot"]
  COV -->|"no"| OK["Served"]
  COV -->|"yes, full-coverage yes"| CD["-CLUSTERDOWN"]
  COV -->|"yes, full-coverage no"| OK`)],
    'msg:1': [D(SEQ, 'WATCH aborts the transaction', `sequenceDiagram
  participant A as Client A
  participant R as Redis
  participant B as Client B
  A->>R: WATCH stock
  A->>R: MULTI
  A->>R: DECR stock (queued)
  B->>R: DECR stock
  A->>R: EXEC
  R-->>A: nil, nothing ran`),
      D(FLOW, 'Errors inside a transaction', `flowchart TD
  Q["Command queued"] --> QE{"syntax or arity error?"}
  QE -->|"yes"| AB["EXEC returns -EXECABORT, nothing runs"]
  QE -->|"no"| EX["EXEC runs all in order"]
  EX --> RE{"a command fails at run time?"}
  RE -->|"yes"| NR["Others still apply, no rollback"]
  RE -->|"no"| OK["All applied"]`)],
    'msg:2': [D(STATE, 'Life of one stream entry', `stateDiagram-v2
  [*] --> New: XADD
  New --> Pending: XREADGROUP delivers to a consumer
  Pending --> Acknowledged: XACK
  Pending --> Pending: XAUTOCLAIM moves it to another consumer
  Acknowledged --> [*]`)],
    'msg:3': [D(SEQ, 'Pub/Sub with a missed message', `sequenceDiagram
  participant P as Publisher
  participant R as Redis
  participant A as Subscriber A
  participant B as Subscriber B
  P->>R: PUBLISH news m1
  R-->>A: m1
  R-->>B: m1
  Note over B: B restarts
  P->>R: PUBLISH news m2
  R-->>A: m2
  Note over B,R: m2 is never delivered to B`)],
    'e2e:1': [D(SEQ, 'One SET from client to disk and replica', `sequenceDiagram
  participant C as Client
  participant N as Slot owner node
  participant A as AOF file
  participant R as Replica
  C->>N: SET cart:42 value
  N->>N: parse, check memory, execute
  N->>A: write() to AOF
  N-->>C: +OK
  N--)R: replication stream (async)
  A->>A: fsync within about 1 s`)]
  };
})();
