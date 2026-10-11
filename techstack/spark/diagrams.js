/* Mermaid diagrams for the Spark system-design course. */
CourseData.diagrams = {
  "read:1": [
    {
      "kind": "Sequence diagram",
      "title": "Example 1: a line sits across the cut",
      "src": "sequenceDiagram\n  participant F as File of 20 bytes\n  participant A as Worker A, bytes 0 to 10\n  participant B as Worker B, bytes 10 to 20\n  Note over F: apple starts at 0, banana starts at 6 and ends at 12, cherry starts at 13\n  A->>F: start at byte 0\n  F-->>A: apple\n  F-->>A: banana, read to the end even though the cut is at byte 10\n  A->>A: next line starts at 13, which is after my end, so stop\n  B->>F: look from byte 9 for a line break\n  F-->>B: break found at byte 12\n  B->>B: throw away the leftover part of banana\n  F-->>B: cherry\n  B->>B: end of file, so stop"
    },
    {
      "kind": "Sequence diagram",
      "title": "Example 2: the cut lands exactly where a line begins",
      "src": "sequenceDiagram\n  participant F as Same file\n  participant A as Worker A, bytes 0 to 13\n  participant B as Worker B, bytes 13 to 20\n  Note over F: cherry starts at byte 13, exactly on the cut\n  A->>F: start at byte 0\n  F-->>A: apple\n  F-->>A: banana\n  A->>A: next line starts at 13, which is not before my end, so stop\n  B->>F: look from byte 12, one byte BEFORE my start\n  F-->>B: byte 12 is a line break, so only that break is thrown away\n  F-->>B: cherry, kept\n  B->>B: end of file, so stop"
    }
  ],
  "read:2": [
    {
      "kind": "Sequence diagram",
      "title": "Planning",
      "src": "sequenceDiagram\n  participant V as Driver\n  participant S as Input store\n  participant P as Split planner\n  V->>S: list files\n  S-->>V: paths and sizes\n  V->>P: files, target size, open cost\n  P->>P: cut splittable files\n  P->>P: pack small files by effective size\n  P-->>V: list of partitions\n  V->>V: one task per partition"
    }
  ],
  "read:3": [
    {
      "kind": "Sequence diagram",
      "title": "Footer first, then only the groups that might match",
      "src": "sequenceDiagram\n  participant Q as Query: amount > 500\n  participant R as Reader\n  participant F as File\n  Q->>R: read orders.parquet\n  R->>F: read the last bytes, then the footer\n  F-->>R: schema + min and max amount per row group\n  loop each row group\n    R->>R: is max amount above 500?\n    alt no\n      R->>R: skip the group, read no bytes\n    else yes\n      R->>F: read only the amount and city columns\n      F-->>R: rows\n    end\n  end"
    }
  ],
  "read:4": [
    {
      "kind": "Sequence diagram",
      "title": "Only matching folders are listed",
      "src": "sequenceDiagram\n  participant Q as Query: date = 2026-10-03\n  participant P as Planner\n  participant S as Storage\n  Q->>P: plan the scan\n  P->>S: list the top-level folders\n  S-->>P: date=2026-10-01 ... date=2026-10-04\n  P->>P: keep only folders whose name matches\n  P->>S: list files in date=2026-10-03 only\n  S-->>P: 4 files\n  P->>P: one task per file"
    }
  ],
  "read:5": [
    {
      "kind": "State diagram",
      "title": "What happens to one row",
      "src": "stateDiagram-v2\n  [*] --> Read: take the next line\n  Read --> Parsed: fields match the schema\n  Read --> Malformed: wrong count or bad value\n  Parsed --> Kept\n  Malformed --> Kept: PERMISSIVE, nulls + raw line saved\n  Malformed --> Dropped: DROPMALFORMED, no trace\n  Malformed --> Failed: FAILFAST, job stops\n  Kept --> [*]\n  Dropped --> [*]\n  Failed --> [*]"
    }
  ],
  "pipeline:1": [
    {
      "kind": "Sequence diagram",
      "title": "Pull",
      "src": "sequenceDiagram\n  participant K as Consumer\n  participant M as map\n  participant F as filter\n  participant R as reader\n  K->>M: next\n  M->>F: next\n  F->>R: next\n  R-->>F: row 5 (rejected)\n  F->>R: next\n  R-->>F: row 12 (passes)\n  F-->>M: row 12\n  M-->>K: pair (12, 24)"
    }
  ],
  "pipeline:2": [
    {
      "kind": "State diagram",
      "title": "Reader lifetime",
      "src": "stateDiagram-v2\n  [*] --> Opened: task attempt starts\n  Opened --> Streaming: first next\n  Streaming --> Streaming: next\n  Streaming --> Exhausted: no more rows\n  Streaming --> Failed: exception\n  Streaming --> Cancelled: cancel signal\n  Exhausted --> Closed\n  Failed --> Closed\n  Cancelled --> Closed\n  Closed --> [*]"
    }
  ],
  "pipeline:3": [
    {
      "kind": "Sequence diagram",
      "title": "Eager: a full list after each step",
      "src": "sequenceDiagram\n  participant R as reader\n  participant F as filter\n  participant M as map\n  R->>R: read all 12 rows into a list\n  F->>R: take the whole list\n  F->>F: keep 6 rows in a second list\n  M->>F: take the whole list\n  M->>M: build 6 pairs in a third list\n  M-->>M: hand the list to the consumer"
    }
  ],
  "pipeline:4": [
    {
      "kind": "Sequence diagram",
      "title": "LIMIT 3",
      "src": "sequenceDiagram\n  participant C as basket, LIMIT 3\n  participant F as filter\n  participant R as reader\n  loop until the basket holds 3 rows\n    C->>F: next\n    F->>R: next\n    R-->>F: row\n    alt row passes the filter\n      F-->>C: row\n    else row fails\n      Note over F: drop it and ask again\n    end\n  end\n  C->>R: stop, and the reader closes"
    }
  ],
  "lineage:1": [
    {
      "kind": "Sequence diagram",
      "title": "Partition lookup",
      "src": "sequenceDiagram\n  participant T as Task\n  participant B as Block manager\n  participant M as map\n  participant F as filter\n  participant R as read\n  T->>B: do you have partition 3?\n  alt cached\n    B-->>T: yes, here are the rows\n  else not cached\n    B-->>T: no\n    T->>M: compute partition 3\n    M->>F: give me partition 3\n    F->>R: give me partition 3\n    R-->>F: rows\n    F-->>M: rows\n    M-->>T: rows\n    T->>B: store partition 3\n  end\n  T->>B: do you have partition 3 again?\n  B-->>T: yes, here are the rows"
    }
  ],
  "lineage:2": [
    {
      "kind": "State diagram",
      "title": "Cached block",
      "src": "stateDiagram-v2\n  [*] --> Requested: persist called\n  Requested --> Resident: computed and stored\n  Requested --> NotStored: no memory\n  Resident --> Evicted: memory pressure\n  Evicted --> Resident: recomputed and stored\n  Resident --> Dropped: unpersist\n  NotStored --> [*]\n  Dropped --> [*]"
    }
  ],
  "lineage:3": [
    {
      "kind": "Sequence diagram",
      "title": "Walk back through the parents",
      "src": "sequenceDiagram\n  participant D as Driver\n  participant E2 as Executor 2\n  participant E1 as Executor 1\n  participant F as File\n  D->>E2: compute C partition 2\n  E2--xD: no answer, executor lost\n  Note over D: C partition 2 needs B partition 2, which is lost too\n  D->>E1: recompute B partition 2\n  E1->>F: read A partition 2\n  F-->>E1: rows\n  E1-->>D: B partition 2 is back\n  D->>E1: recompute C partition 2 from B\n  E1-->>D: C partition 2 is back"
    }
  ],
  "lineage:4": [
    {
      "kind": "Sequence diagram",
      "title": "Replay from the checkpoint",
      "src": "sequenceDiagram\n  participant D as Driver\n  participant X as Executor\n  participant S as Reliable storage\n  D->>X: run op1 to op8 once\n  Note over X: the result of op8 is lost\n  D->>X: replay op1 from the source\n  D->>X: replay op2\n  D->>X: replay op3\n  D->>X: replay op4\n  D->>X: replay op5\n  D->>X: replay op6\n  D->>X: replay op7\n  D->>X: replay op8\n  X-->>D: op8 is back\n  D->>D: mark op4 for a checkpoint\n  D->>X: run op1 to op4 for the checkpoint\n  X->>S: write op4 to reliable storage\n  Note over X: the result of op8 is lost again\n  D->>S: read op4 from the checkpoint\n  D->>X: replay op5\n  D->>X: replay op6\n  D->>X: replay op7\n  D->>X: replay op8\n  X-->>D: op8 is back"
    }
  ],
  "stages:1": [
    {
      "kind": "Sequence diagram",
      "title": "Stage planning",
      "src": "sequenceDiagram\n  participant U as Your code\n  participant D as Driver planner\n  U->>D: action on the final dataset\n  D->>D: create the result stage\n  loop each wide step found going backwards\n    D->>D: cut here, create a parent stage\n  end\n  D->>D: keep narrow steps together inside one stage\n  D->>U: run stages, parents first"
    }
  ],
  "stages:2": [
    {
      "kind": "State diagram",
      "title": "Stage state",
      "src": "stateDiagram-v2\n  [*] --> Waiting\n  Waiting --> Running: all parent outputs available\n  Running --> Complete: all tasks succeeded and outputs registered\n  Running --> Resubmitting: output lost or fetch failed\n  Resubmitting --> Running: missing tasks relaunched\n  Running --> Failed: attempts exhausted\n  Complete --> [*]\n  Failed --> [*]"
    }
  ],
  "stages:3": [
    {
      "kind": "Flowchart",
      "title": "Diamond plan",
      "src": "flowchart TD\n  D[\"Shuffle 1: read + reduceByKey\"] --> A[\"Branch A: map\"]\n  D --> B[\"Branch B: filter\"]\n  A -- \"shuffle\" --> R[\"Result: join + collect\"]\n  B -- \"shuffle\" --> R\n  M[\"Planner memo: D already has a stage?\"] -. \"yes: link it, plan nothing new\" .-> D"
    }
  ],
  "stages:4": [
    {
      "kind": "Sequence diagram",
      "title": "Two jobs, one shuffle",
      "src": "sequenceDiagram\n  participant U as Your code\n  participant D as Driver\n  participant E as Executors\n  U->>D: job 1: collect()\n  D->>E: run map side (4 tasks)\n  E-->>D: 4 of 4 outputs registered\n  D->>E: run result (2 tasks)\n  U->>D: job 2: count()\n  D->>D: map side has 4 of 4 outputs, skip it\n  D->>E: run only the result (2 tasks)\n  E-->>U: count"
    }
  ],
  "stages:5": [
    {
      "kind": "Flowchart",
      "title": "Two plans for one join",
      "src": "flowchart LR\n  subgraph S1[\"Layouts unknown\"]\n    A1[\"orders\"] -- \"exchange\" --> J1[\"join stage\"]\n    B1[\"customers\"] -- \"exchange\" --> J1\n  end\n  subgraph S2[\"Layouts match\"]\n    A2[\"orders: hash(id) % 8\"] -- \"partition i to i\" --> J2[\"join stage\"]\n    B2[\"customers: hash(id) % 8\"] -- \"partition i to i\" --> J2\n  end"
    }
  ],
  "stages:6": [
    {
      "kind": "Flowchart",
      "title": "Partitions to waves",
      "src": "flowchart LR\n  P[\"12 partitions\"] --> T[\"12 tasks\"]\n  T --> S[\"4 slots\"]\n  S --> W[\"3 waves of 4 tasks\"]"
    }
  ],
  "schedule:1": [
    {
      "kind": "Sequence diagram",
      "title": "Dispatch loop",
      "src": "sequenceDiagram\n  participant T as Task scheduler\n  participant B as Backend\n  participant E as Executor\n  E->>B: register (4 slots)\n  B->>T: resource offer\n  T-->>B: tasks that fit\n  B->>E: launch tasks\n  E-->>B: status update\n  B->>T: task finished, slot free\n  T->>T: next offer"
    }
  ],
  "schedule:2": [
    {
      "kind": "State diagram",
      "title": "Attempt",
      "src": "stateDiagram-v2\n  [*] --> Pending\n  Pending --> Launched: slot matched\n  Launched --> Running: executor started it\n  Running --> Finished: success\n  Running --> Failed: error or executor lost\n  Running --> Killed: cancelled\n  Finished --> [*]\n  Failed --> [*]\n  Killed --> [*]"
    }
  ],
  "schedule:3": [
    {
      "kind": "Flowchart",
      "title": "Locality levels",
      "src": "flowchart TD\n  A[\"Free slot on the data's executor?\"] -- \"yes\" --> R1[\"run: PROCESS_LOCAL\"]\n  A -- \"no, wait up to spark.locality.wait\" --> B[\"Free slot on the same host?\"]\n  B -- \"yes\" --> R2[\"run: NODE_LOCAL\"]\n  B -- \"no, wait again\" --> C[\"Free slot in the same rack?\"]\n  C -- \"yes\" --> R3[\"run: RACK_LOCAL\"]\n  C -- \"no, wait again\" --> R4[\"run: ANY, read remotely\"]"
    }
  ],
  "schedule:4": [
    {
      "kind": "State diagram",
      "title": "Attempts of one task",
      "src": "stateDiagram-v2\n  [*] --> Attempt0\n  Attempt0 --> Succeeded: ok\n  Attempt0 --> Failed1: error\n  Failed1 --> Attempt1: retry on another executor\n  Attempt1 --> Succeeded: ok\n  Attempt1 --> Failed2: error\n  Failed2 --> Attempt2: retry\n  Attempt2 --> Failed3: error\n  Failed3 --> Attempt3: retry\n  Attempt3 --> Failed4: error\n  Failed4 --> Aborted: 4 of 4 used, job aborted\n  Succeeded --> [*]\n  Aborted --> [*]"
    }
  ],
  "schedule:5": [
    {
      "kind": "Flowchart",
      "title": "Slots from cores",
      "src": "flowchart LR\n  E[\"Executor: 4 cores\"] --> S[\"slots = cores / spark.task.cpus\"]\n  S --> A[\"spark.task.cpus = 1: 4 tasks at once\"]\n  S --> B[\"spark.task.cpus = 2: 2 tasks at once\"]"
    }
  ],
  "shuffle:1": [
    {
      "kind": "Sequence diagram",
      "title": "Map-side write",
      "src": "sequenceDiagram\n  participant T as Map task\n  participant M as In-memory map\n  participant D as Disk\n  participant R as Driver\n  T->>M: add each record and combine by key\n  loop memory budget exceeded\n    M->>D: sort and spill a run\n  end\n  T->>D: merge runs into one data file\n  T->>D: write an index with one offset per reducer\n  T->>R: register where the output lives"
    }
  ],
  "shuffle:2": [
    {
      "kind": "Sequence diagram",
      "title": "Shuffle read",
      "src": "sequenceDiagram\n  participant R as Reduce task\n  participant V as Driver\n  participant A as Executor A\n  participant B as Executor B\n  R->>V: where are outputs of shuffle 0?\n  V-->>R: map 0 on A, map 1 on B\n  par fetch\n    R->>A: range 3 of map 0\n    A-->>R: bytes\n  and\n    R->>B: range 3 of map 1\n    B-->>R: bytes\n  end\n  R->>R: merge partial sums by key"
    }
  ],
  "shuffle:3": [
    {
      "kind": "Flowchart",
      "title": "Choosing the write path",
      "src": "flowchart TD\n  A[\"Map task with R reducers\"] --> B{\"R at most 200, and no map-side combine?\"}\n  B -- \"yes\" --> C[\"Bypass: one temp file per reducer\"]\n  C --> D[\"Concatenate into one data file + index\"]\n  B -- \"no\" --> E[\"Sort records by reducer id, spill if needed\"]\n  E --> F[\"Merge into one data file + index\"]"
    }
  ],
  "shuffle:4": [
    {
      "kind": "Flowchart",
      "title": "Where each range is read from",
      "src": "flowchart LR\n  R[\"Reduce task\"] --> L[\"same executor: read the local file\"]\n  R --> H[\"same host: read the other executor's file from disk\"]\n  R --> N[\"other host: fetch over the network, within the cap\"]"
    }
  ],
  "shuffle:5": [
    {
      "kind": "Flowchart",
      "title": "Where the blocks come from",
      "src": "flowchart LR\n  M[\"2,000 map tasks\"] --> B[\"blocks = maps x reducers\"]\n  R[\"2,000 reduce tasks\"] --> B\n  B --> Q[\"4,000,000 fetches\"]\n  Q --> F[\"Fix: fewer reducers, or merge them at run time\"]"
    }
  ],
  "memory:1": [
    {
      "kind": "Sequence diagram",
      "title": "Grant and spill",
      "src": "sequenceDiagram\n  participant T as Task\n  participant M as Memory manager\n  participant D as Disk\n  T->>M: acquire 64 MB\n  M-->>T: granted\n  T->>M: acquire 64 MB\n  M-->>T: refused (pool exhausted)\n  T->>D: sort state, write run 1\n  T->>M: release state\n  T->>T: continue with empty buffer\n  T->>D: read runs, k-way merge"
    }
  ],
  "memory:2": [
    {
      "kind": "State diagram",
      "title": "Pressure outcomes",
      "src": "stateDiagram-v2\n  [*] --> Growing: task needs memory\n  Growing --> Growing: grant given\n  Growing --> Spilling: grant refused, can spill\n  Spilling --> Growing: memory released\n  Growing --> TaskFailed: grant refused, cannot spill\n  Growing --> Killed: process passes the container limit\n  TaskFailed --> [*]\n  Killed --> [*]"
    }
  ],
  "memory:3": [
    {
      "kind": "Flowchart",
      "title": "Who can evict whom",
      "src": "flowchart TD\n  P[\"Unified pool\"] --> S[\"Storage: cached blocks\"]\n  P --> E[\"Execution: sorts, joins, aggregations\"]\n  E -- \"may evict cache above the protected share\" --> S\n  S -. \"cannot evict running execution\" .-> E"
    }
  ],
  "memory:4": [
    {
      "kind": "Flowchart",
      "title": "Bounds per task",
      "src": "flowchart LR\n  P[\"Execution pool\"] --> N[\"N running tasks\"]\n  N --> C[\"Each task: up to pool / N\"]\n  N --> F[\"Each task: at least pool / (2N) before it waits or spills\"]"
    }
  ],
  "memory:5": [
    {
      "kind": "State diagram",
      "title": "Where cached bytes live",
      "src": "stateDiagram-v2\n  [*] --> OnHeap\n  OnHeap --> GCScanned: heap fills\n  GCScanned --> OnHeap: full collection pauses everything\n  OnHeap --> OffHeap: spark.memory.offHeap.enabled = true\n  OffHeap --> [*]: not scanned by the collector"
    }
  ],
  "recovery:1": [
    {
      "kind": "Sequence diagram",
      "title": "Fetch failure and replay",
      "src": "sequenceDiagram\n  participant R as Reducer\n  participant V as Driver\n  participant A as Executor A (lost)\n  participant N as Executor N\n  R->>A: fetch range\n  A--xR: connection refused\n  R->>V: fetch failed (shuffle 0, map 7)\n  V->>V: invalidate all outputs on A\n  V->>N: rerun lost map tasks\n  N-->>V: new locations\n  V->>R: retry with new locations\n  R->>N: fetch range\n  N-->>R: bytes"
    }
  ],
  "recovery:2": [
    {
      "kind": "State diagram",
      "title": "Task with speculation",
      "src": "stateDiagram-v2\n  [*] --> Running\n  Running --> Suspected: slower than threshold\n  Suspected --> Duplicated: second attempt launched\n  Duplicated --> Won: first attempt succeeds\n  Won --> Cancelled: other attempt killed\n  Running --> Won: success\n  Cancelled --> [*]\n  Won --> [*]"
    }
  ],
  "recovery:3": [
    {
      "kind": "Sequence diagram",
      "title": "Retries inside one fetch",
      "src": "sequenceDiagram\n  participant R as Reduce task\n  participant B as Executor B\n  R->>B: fetch range 3 of map 1\n  B--xR: connection drops\n  R->>R: wait retryWait (5 s)\n  R->>B: retry 1\n  B-->>R: range arrives"
    }
  ],
  "recovery:4": [
    {
      "kind": "Flowchart",
      "title": "Exclusion for one stage",
      "src": "flowchart TD\n  A[\"Task fails on executor E3\"] --> B{\"Failures on E3 in this stage at the limit?\"}\n  B -- \"no\" --> C[\"Retry the task on another executor\"]\n  B -- \"yes\" --> D[\"Exclude E3 for the rest of this stage\"]\n  D --> E[\"Tasks go to E1, E2 and E4\"]"
    }
  ],
  "recovery:5": [
    {
      "kind": "Sequence diagram",
      "title": "Executor lost, output still served",
      "src": "sequenceDiagram\n  participant R as Reducer\n  participant S as Shuffle service (node)\n  participant E as Executor E2\n  E--xE: executor lost\n  R->>S: fetch map 2 output\n  S-->>R: bytes from the files on disk\n  Note over R,S: no map task reruns"
    }
  ],
  "commit:1": [
    {
      "kind": "Sequence diagram",
      "title": "Commit",
      "src": "sequenceDiagram\n  participant T as Task attempt\n  participant C as Commit coordinator\n  participant S as Sink\n  T->>S: write to staging path\n  T->>C: may I commit partition 0, attempt 1?\n  C-->>T: yes (first asker)\n  T->>S: promote staging to final\n  T-->>C: committed\n  Note over C: later attempt for partition 0 is denied\n  C->>S: all partitions committed, write marker"
    }
  ],
  "commit:2": [
    {
      "kind": "State diagram",
      "title": "Partition output",
      "src": "stateDiagram-v2\n  [*] --> Writing\n  Writing --> Staged: task success\n  Staged --> Authorized: coordinator accepts\n  Staged --> Discarded: another attempt won\n  Authorized --> Promoted: final path written\n  Promoted --> Ready: marker covers all partitions\n  Discarded --> [*]\n  Ready --> [*]"
    }
  ],
  "commit:3": [
    {
      "kind": "Flowchart",
      "title": "Where each file moves",
      "src": "flowchart LR\n  subgraph V1[\"Algorithm v1\"]\n    A1[\"task commit: temp to job folder\"] --> A2[\"job commit: job folder to output\"]\n  end\n  subgraph V2[\"Algorithm v2\"]\n    B1[\"task commit: temp straight to output\"] --> B2[\"job commit: write marker only\"]\n  end"
    }
  ],
  "commit:4": [
    {
      "kind": "State diagram",
      "title": "Output folder across an overwrite",
      "src": "stateDiagram-v2\n  [*] --> Previous\n  Previous --> Cleared: overwrite starts\n  Cleared --> Written: job commits\n  Cleared --> Empty: job fails"
    }
  ],
  "sql:1": [
    {
      "kind": "Sequence diagram",
      "title": "Plan lifecycle",
      "src": "sequenceDiagram\n  participant U as User\n  participant P as Parser\n  participant A as Analyzer\n  participant O as Optimizer\n  participant S as Planner\n  participant E as Execution\n  U->>P: query\n  P-->>A: unresolved plan\n  A-->>O: resolved plan\n  O-->>S: optimized plan\n  S-->>E: physical plan with exchanges\n  E-->>U: rows"
    }
  ],
  "sql:2": [
    {
      "kind": "Sequence diagram",
      "title": "Aggregate planning",
      "src": "sequenceDiagram\n  participant P as Planner\n  participant C as Child plan\n  P->>C: how is your output split?\n  alt already split by city\n    C-->>P: by city\n    P->>P: aggregate in place, no exchange\n  else not split by city\n    C-->>P: no particular split\n    P->>P: partial aggregate per task\n    P->>P: exchange by city hash\n    P->>P: final aggregate\n  end"
    }
  ],
  "sql:3": [
    {
      "kind": "Flowchart",
      "title": "Rewrite rules applied",
      "src": "flowchart TD\n  A[\"x > 5 AND x > 3 AND 2 * 3 = 6\"] --> B[\"Fold constants: 2 * 3 becomes 6\"]\n  B --> C[\"Drop TRUE: 6 = 6 is always true\"]\n  C --> D[\"Keep the stronger: x > 5 implies x > 3\"]\n  D --> E[\"x > 5, pushed down to the reader\"]"
    }
  ],
  "sql:4": [
    {
      "kind": "Flowchart",
      "title": "Expand, group, combine",
      "src": "flowchart LR\n  I[\"Input rows\"] --> X[\"Expand: one copy per distinct column\"]\n  X --> G[\"Group by day and column\"]\n  G --> C[\"Count distinct within each group\"]\n  C --> R[\"One row per day with both counts\"]"
    }
  ],
  "sql:5": [
    {
      "kind": "Flowchart",
      "title": "Where the 200 comes from",
      "src": "flowchart LR\n  S[\"Shuffle in a SQL stage\"] --> P[\"spark.sql.shuffle.partitions = 200\"]\n  P --> T[\"200 reduce tasks\"]\n  T --> A[\"Adaptive execution: merge small partitions at run time\"]"
    }
  ],
  "joins:1": [
    {
      "kind": "Sequence diagram",
      "title": "Broadcast",
      "src": "sequenceDiagram\n  participant V as Driver\n  participant D as Dimension scan\n  participant E as Each executor\n  V->>D: collect small side\n  D-->>V: rows\n  V->>E: broadcast hash table\n  E->>E: stream fact partition, probe table\n  E-->>V: joined partition"
    }
  ],
  "joins:2": [
    {
      "kind": "Sequence diagram",
      "title": "Shuffled join",
      "src": "sequenceDiagram\n  participant F as Fact partitions\n  participant D as Dimension partitions\n  participant X as Exchange\n  participant R as Reducers\n  F->>X: rows, sent by hash of key\n  D->>X: rows, sent by hash of key\n  X->>R: same keys go to the same reducer\n  R->>R: build a hash table from one side\n  R->>R: probe it with the other side\n  R-->>R: emit the matches"
    }
  ],
  "joins:3": [
    {
      "kind": "Flowchart",
      "title": "Sort-merge steps",
      "src": "flowchart LR\n  A[\"Both sides partitioned by key\"] --> S[\"Sort each side by key\"]\n  S --> M{\"Left key vs right key\"}\n  M -- \"smaller\" --> N[\"Advance that side\"]\n  N --> M\n  M -- \"equal\" --> O[\"Output all pairs with that key\"]"
    }
  ],
  "joins:4": [
    {
      "kind": "Flowchart",
      "title": "Cost of a pair comparison",
      "src": "flowchart TD\n  Q[\"Join condition has no equal key\"] --> P[\"Compare every pair of rows\"]\n  P --> C[\"Work = rows of A times rows of B\"]\n  C --> F[\"Fix: broadcast the small side, or add an equal key\"]"
    }
  ],
  "joins:5": [
    {
      "kind": "Flowchart",
      "title": "What each join keeps",
      "src": "flowchart LR\n  L[\"Left row\"] --> J{\"Matched on the key?\"}\n  J -- \"yes\" --> I[\"inner and left: output with right columns\"]\n  J -- \"no\" --> N[\"left: output with nulls on the right\"]\n  J -- \"no\" --> X[\"anti: output only, no right columns\"]"
    }
  ],
  "adaptive:1": [
    {
      "kind": "Sequence diagram",
      "title": "Runtime re-planning",
      "src": "sequenceDiagram\n  participant M as Map stage\n  participant V as Driver\n  participant P as Adaptive planner\n  participant R as Reduce stage\n  M-->>V: output sizes per partition\n  V->>P: statistics\n  P->>P: coalesce small, split skewed\n  P-->>V: new reducer layout\n  V->>R: launch tasks for new layout"
    }
  ],
  "adaptive:2": [
    {
      "kind": "Sequence diagram",
      "title": "Skew decision",
      "src": "sequenceDiagram\n  participant D as Driver\n  participant L as Skewed side\n  participant R as Other side\n  D->>L: which partition is over the threshold?\n  L-->>D: partition 3, 300 MB\n  D->>L: split it into ranges by map output\n  D->>R: copy the matching partition to each range\n  D->>D: join each pair locally\n  D->>D: union the results"
    }
  ],
  "adaptive:3": [
    {
      "kind": "Flowchart",
      "title": "Runtime join choice",
      "src": "flowchart TD\n  E[\"Estimate says 200 MB, so shuffle join\"] --> R[\"Run the first side's map stage\"]\n  R --> M[\"Measure real size: 6 MB\"]\n  M --> T{\"Below autoBroadcastJoinThreshold (10 MB)?\"}\n  T -- \"yes\" --> B[\"Switch to broadcast join: the other side is not shuffled\"]\n  T -- \"no\" --> S[\"Keep the shuffle join\"]"
    }
  ],
  "adaptive:4": [
    {
      "kind": "Flowchart",
      "title": "Local and remote blocks",
      "src": "flowchart LR\n  P[\"Shuffle read\"] --> Q[\"Adaptive: check where each block sits\"]\n  Q --> L[\"Blocks on this executor: read local disk\"]\n  Q --> N[\"Blocks on other executors: fetch over the network\"]"
    }
  ],
  "adaptive:5": [
    {
      "kind": "Flowchart",
      "title": "The re-planning loop",
      "src": "flowchart LR\n  S1[\"Query stage 1\"] --> M1[\"Measure sizes\"] --> P1[\"Re-plan the rest\"] --> S2[\"Query stage 2\"] --> M2[\"Measure\"] --> P2[\"Re-plan\"] --> S3[\"Query stage 3\"]"
    }
  ],
  "evidence:1": [
    {
      "kind": "Sequence diagram",
      "title": "Event replay",
      "src": "sequenceDiagram\n  participant S as Scheduler\n  participant L as Log writer\n  participant F as Storage\n  participant H as History server\n  S->>L: task end (metrics)\n  L->>F: append event\n  Note over S,F: driver exits\n  H->>F: read log\n  F-->>H: events\n  H->>H: rebuild stages, tasks, metrics"
    }
  ],
  "evidence:2": [
    {
      "kind": "State diagram",
      "title": "Event log",
      "src": "stateDiagram-v2\n  [*] --> InProgress\n  InProgress --> Complete: application end event written\n  InProgress --> Incomplete: driver died, no end event\n  Complete --> Compacted: rolled up\n  Complete --> Expired: retention\n  Incomplete --> Expired: retention\n  Expired --> [*]"
    }
  ],
  "evidence:3": [
    {
      "kind": "Flowchart",
      "title": "Bounded listener queue",
      "src": "flowchart LR\n  S[\"Scheduler posts event\"] --> Q[\"Bounded queue: capacity 10,000\"]\n  Q --> L[\"Listener consumes\"]\n  S -. \"queue full\" .-> D[\"Event dropped, counted in a warning\"]"
    }
  ],
  "evidence:4": [
    {
      "kind": "Flowchart",
      "title": "Live window versus the log",
      "src": "flowchart LR\n  T[\"Every stage\"] --> W[\"Live UI: latest 1000 stages\"]\n  T --> G[\"Event log: every stage\"]\n  G --> H[\"History server: all stages\"]"
    }
  ],
  "evidence:5": [
    {
      "kind": "Flowchart",
      "title": "Reading the summary",
      "src": "flowchart TD\n  A[\"Stage summary: min, median, max duration\"] --> B{\"Max far above the median?\"}\n  B -- \"no\" --> C[\"Whole stage is uniformly slow: add resources\"]\n  B -- \"yes\" --> D[\"A few heavy tasks: check input size, then fix the key\"]"
    }
  ],
  "build:1": [
    {
      "kind": "Sequence diagram",
      "title": "Reference run",
      "src": "sequenceDiagram\n  participant C as You\n  participant E as Engine\n  participant S as Scheduler\n  participant K as Sink\n  C->>E: run(options)\n  E->>S: tasks for each stage\n  S-->>E: waves complete\n  E->>E: shuffle, spill, merge\n  E->>K: publish winners\n  K-->>C: answer + trace"
    }
  ],
  "build:2": [
    {
      "kind": "Sequence diagram",
      "title": "Two runs, one answer",
      "src": "sequenceDiagram\n  participant Y as You\n  participant E as Engine\n  Y->>E: run with small memory, no speculation\n  E-->>Y: total 640, trace A\n  Y->>E: run with large memory, speculation on\n  E-->>Y: total 640, trace B\n  Y->>Y: compare outputs key by key"
    }
  ],
  "build:3": [
    {
      "kind": "State diagram",
      "title": "Job outcome",
      "src": "stateDiagram-v2\n  [*] --> Running\n  Running --> Published: every partition committed, marker written\n  Running --> Aborted: a partition exhausts its attempts\n  Aborted --> [*]: nothing visible\n  Published --> [*]"
    }
  ],
  "build:4": [
    {
      "kind": "Flowchart",
      "title": "Cost per option",
      "src": "flowchart LR\n  O[\"Options: memory, speculation, worker loss\"] --> R[\"Run each combination once\"]\n  R --> C[\"Counters: total, spills, attempts, time\"]\n  C --> D[\"Choose by the cost that matters\"]"
    }
  ]
};
