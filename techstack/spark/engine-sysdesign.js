/* System-design documents, one per chapter: problem → spec → estimation → high-level design → use-case deep dives → hard part.
   Estimates are stated assumptions for a reference workload (1 TB, 1 KB rows, 16 executors x 4 slots). They are not measurements of any cluster. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const table = (headers, rows) => `<div class="table-scroll"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const diagram = (d, hero) => `<figure class="diagram${hero ? ' diagram-hero' : ''}"><figcaption><b>${esc(d.kind)}</b>${d.title ? ' · ' + esc(d.title) : ''}</figcaption><div class="diagram-body" data-mermaid><pre class="diagram-src">${esc(d.src.trim())}</pre></div></figure>`;
  const SEQ = 'Sequence diagram', FLOW = 'Flowchart', STATE = 'State diagram';

  const D = {};

  D.architecture = {
    goal: 'Run a computation over data that no single machine can hold, finish within a deadline, and survive losing machines on the way.',
    scope: ['In scope: finite batch jobs, partitioned input, shuffle, retry, result publication.', 'Out of scope: cluster-wide resource arbitration (delegated to a cluster manager), continuous streaming, multi-tenant security.'],
    fr: ['Accept a lazy computation graph and an action; return a job handle.', 'Split work into partitions and run one task attempt per partition on executor slots.', 'Move intermediate data between executors without routing it through the coordinator.', 'Retry failed attempts and recompute lost intermediate output from lineage.', 'Expose status, cancellation and a durable record of what ran.'],
    nfr: ['<b>Correctness:</b> result independent of placement, partition count and retries for deterministic code.', '<b>Throughput:</b> scale with workers until storage or network saturates.', '<b>Availability:</b> executor loss costs time, not the job. Driver loss ends the application.', '<b>Bounded coordinator:</b> driver memory grows with metadata (tasks, blocks), not with data.'],
    est: { assume: 'Reference job: scan 1 TB (1 KB rows) in 20 minutes. One task sustains 50 MB/s. Decimal units.', rows: [
      ['Rows', '1,000 GB ÷ 1 KB ≈ 1 billion', 'Never collect source rows on the driver.'],
      ['Aggregate scan rate', '1,000,000 MB ÷ 1,200 s ≈ 833 MB/s', 'Storage must sustain this aggregate rate.'],
      ['Slots needed (lower bound)', 'ceil(833 ÷ 50) = 17', 'Scan only. No startup, shuffle or retries.'],
      ['Partitions', 'ceil(1,000,000 ÷ 256) = 3,907', '256 MB is a planning target, not a law.'],
      ['Cluster shape', '16 executors × 4 slots = 64 slots', 'Executors are processes. Partitions are work. They are different numbers.'],
      ['Scan waves', 'ceil(3,907 ÷ 64) = 62 → ~317 s', 'Uniform-work assumption. Skew and retries add time.'],
      ['Scheduler metadata', '3,907 × 2 KB ≈ 7.8 MB', 'Tiny now. Grows with tasks, not bytes.']
    ], note: 'Budget, not promise: scan (~5.3 min) plus an exchange of 30% of input (~2 min) fits in 20 minutes with headroom. Benchmark the slowest partition before accepting the target.' },
    hld: { src: `flowchart LR
  Dev["Developer API"] -->|"graph + action"| Drv["Driver<br/>plans, schedules, tracks outputs"]
  Drv -. "resource request" .-> CM["Cluster manager"]
  CM -. "grants executors" .-> Ex
  Drv -. "task descriptions" .-> Ex["Executors x16<br/>4 slots each"]
  Ex -. "status, block locations" .-> Drv
  In[("Input store")] ==>|"bulk reads"| Ex
  Ex <==>|"shuffle ranges"| Ex
  Ex ==>|"result files"| Out[("Output store")]`, caption: 'Dashed arrows are control metadata. Thick arrows are data. The driver never sits on a thick arrow.',
      decisions: [['Who schedules tasks?', 'One driver per application', 'Isolated state. Driver failure ends that application.'], ['When does work start?', 'Lazy graph, evaluated by an action', 'No unrequested work. Needs readiness tracking.'], ['Where does bulk data move?', 'Worker to worker and worker to store', 'No central funnel. Needs a block-location protocol.'], ['How is lost work recovered?', 'Recompute from lineage and immutable input', 'No replicated intermediates. Replay costs time.']] },
    uc: [],
    hard: null
  };

  D.read = {
    goal: 'Turn a pile of files into independent, replayable units of work whose boundaries never cut a record in half.',
    scope: ['In scope: file discovery, split planning, record ownership at boundaries, replay of a split.', 'Out of scope: table formats with transactional snapshots, schema evolution.'],
    fr: ['List input files and produce a set of read ranges (splits).', 'Assign every record to exactly one split, including records that straddle a boundary.', 'Re-read any split and get the same records (replay).', 'Pack many small files into fewer tasks.'],
    nfr: ['<b>Parallelism:</b> enough splits to keep every slot busy.', '<b>Low planning cost:</b> listing and planning must not dominate small jobs.', '<b>Determinism:</b> same snapshot gives the same splits and records.'],
    hld: { src: `flowchart LR
  Snap["Input snapshot<br/>file list + sizes"] --> Plan["Split planner"]
  Plan --> P1["Split 0<br/>bytes 0..N"]
  Plan --> P2["Split 1<br/>bytes N..2N"]
  Plan --> P3["Packed small files"]
  P1 --> R["Format-aware reader"]
  P2 --> R
  P3 --> R
  R --> Rec["Whole records<br/>exactly once"]`, caption: 'Splits are byte ranges. Records are owned by the format-aware reader, not by the byte cut.',
      decisions: [['Who owns a straddling record?', 'The split where the record starts', 'Previous split reads past its end. Next split skips the partial head.'], ['Compressed files?', 'Split only if the codec allows restart points', 'Else one task per file.'], ['Many small files?', 'Pack until a byte target', 'Fewer tasks, less locality precision.']] },
    uc: [
      { title: 'UC-01 · Read a split without losing or doubling a record', blurb: 'Cut a CSV into pieces and still read every row exactly once.', intro: 'Imagine a CSV file too big for one machine. It is cut into pieces by size only, and each piece goes to a different worker. A cut does not care where a line ends, so it can land in the middle of a row. The sequence diagrams below show two cases. The step-by-step section lets you move the cut yourself and watch the one small rule that makes every row get read exactly once.', diagrams: [
        { kind: SEQ, title: 'Example 1: a line sits across the cut', src: `sequenceDiagram
  participant F as File of 20 bytes
  participant A as Worker A, bytes 0 to 10
  participant B as Worker B, bytes 10 to 20
  Note over F: apple starts at 0, banana starts at 6 and ends at 12, cherry starts at 13
  A->>F: start at byte 0
  F-->>A: apple
  F-->>A: banana, read to the end even though the cut is at byte 10
  A->>A: next line starts at 13, which is after my end, so stop
  B->>F: look from byte 9 for a line break
  F-->>B: break found at byte 12
  B->>B: throw away the leftover part of banana
  F-->>B: cherry
  B->>B: end of file, so stop` },
        { kind: SEQ, title: 'Example 2: the cut lands exactly where a line begins', src: `sequenceDiagram
  participant F as Same file
  participant A as Worker A, bytes 0 to 13
  participant B as Worker B, bytes 13 to 20
  Note over F: cherry starts at byte 13, exactly on the cut
  A->>F: start at byte 0
  F-->>A: apple
  F-->>A: banana
  A->>A: next line starts at 13, which is not before my end, so stop
  B->>F: look from byte 12, one byte BEFORE my start
  F-->>B: byte 12 is a line break, so only that break is thrown away
  F-->>B: cherry, kept
  B->>B: end of file, so stop` }
      ], sim: 'csv-read' },
      { title: 'UC-02 · Plan splits for a mixed directory', intro: 'Large files get cut. Small files get packed.', diagrams: [{ kind: SEQ, title: 'Planning', src: `sequenceDiagram
  participant V as Driver
  participant S as Input store
  participant P as Split planner
  V->>S: list files
  S-->>V: paths and sizes
  V->>P: files, target size, open cost
  P->>P: cut splittable files
  P->>P: pack small files by effective size
  P-->>V: list of partitions
  V->>V: one task per partition` }] },
      { title: 'UC-03 · Read only the row groups a query needs', blurb: 'A Parquet file keeps a small summary, so most of it can be skipped.', intro: 'A Parquet file is split into row groups, and its footer records the smallest and biggest value of each column in each group. A filter can use those numbers to skip whole groups without reading them.', diagrams: [
        { kind: SEQ, title: 'Footer first, then only the groups that might match', src: `sequenceDiagram
  participant Q as Query: amount > 500
  participant R as Reader
  participant F as File
  Q->>R: read orders.parquet
  R->>F: read the last bytes, then the footer
  F-->>R: schema + min and max amount per row group
  loop each row group
    R->>R: is max amount above 500?
    alt no
      R->>R: skip the group, read no bytes
    else yes
      R->>F: read only the amount and city columns
      F-->>R: rows
    end
  end` }
      ] },
      { title: 'UC-04 · Skip folders that a filter rules out', blurb: 'A date in a folder name lets the planner skip whole folders.', intro: 'Many tables are stored as folders named after a column, such as date=2026-10-03. The planner reads the folder names and never opens the files in folders that cannot match.', diagrams: [
        { kind: SEQ, title: 'Only matching folders are listed', src: `sequenceDiagram
  participant Q as Query: date = 2026-10-03
  participant P as Planner
  participant S as Storage
  Q->>P: plan the scan
  P->>S: list the top-level folders
  S-->>P: date=2026-10-01 ... date=2026-10-04
  P->>P: keep only folders whose name matches
  P->>S: list files in date=2026-10-03 only
  S-->>P: 4 files
  P->>P: one task per file` }
      ] },
      { title: 'UC-05 · Handle a row that does not match the schema', blurb: 'One bad line should not silently change the answer.', intro: 'A CSV row may have too few columns, or a value that is not a number. The reader follows a chosen mode: keep the row, drop it, or stop the job. Each mode gives a different answer, so the choice matters.', diagrams: [
        { kind: STATE, title: 'What happens to one row', src: `stateDiagram-v2
  [*] --> Read: take the next line
  Read --> Parsed: fields match the schema
  Read --> Malformed: wrong count or bad value
  Parsed --> Kept
  Malformed --> Kept: PERMISSIVE, nulls + raw line saved
  Malformed --> Dropped: DROPMALFORMED, no trace
  Malformed --> Failed: FAILFAST, job stops
  Kept --> [*]
  Dropped --> [*]
  Failed --> [*]` }
      ] }
    ],
    hard: null
  };

  D.pipeline = {
    goal: 'Run read, filter and map inside one task while holding a handful of rows, not a whole partition.',
    scope: ['In scope: iterator composition of narrow operators, resource lifetime.', 'Out of scope: stateful operators (sort, aggregate), which need their own budget.'],
    fr: ['Compose operators so the consumer pulls one result at a time.', 'Reject rows early without calling downstream operators.', 'Close readers on exhaustion, failure and cancellation.'],
    nfr: ['<b>Memory:</b> independent of row count for stateless chains.', '<b>Safety:</b> a retry repeats only pure work.'],
    hld: { src: `flowchart LR
  Sink["Consumer"] -. "next()" .-> M["map"]
  M -. "next()" .-> F["filter"]
  F -. "next()" .-> R["reader"]
  R ==>|"row"| F
  F ==>|"passing row"| M
  M ==>|"pair"| Sink`, caption: 'Demand flows left to right (dashed). Rows flow back (thick). All inside one task: no network hop.',
      decisions: [['Materialize each stage?', 'No: pull', 'Peak memory independent of partition size.'], ['Who closes the reader?', 'The task attempt', 'Closing at iterator creation breaks later pulls.']] },
    uc: [
      { title: 'UC-01 · Consumer asks for the next pair', blurb: 'Each step asks the one before it for a row, so only one row is in flight.', intro: 'One request may scan several rows before one passes.', diagrams: [{ kind: SEQ, title: 'Pull', src: `sequenceDiagram
  participant K as Consumer
  participant M as map
  participant F as filter
  participant R as reader
  K->>M: next
  M->>F: next
  F->>R: next
  R-->>F: row 5 (rejected)
  F->>R: next
  R-->>F: row 12 (passes)
  F-->>M: row 12
  M-->>K: pair (12, 24)` }] },
      { title: 'UC-02 · Own the resource lifetime', blurb: 'Each attempt opens its own reader and closes it on every exit path.', intro: 'A lazy iterator outlives the call that created it.', diagrams: [{ kind: STATE, title: 'Reader lifetime', src: `stateDiagram-v2
  [*] --> Opened: task attempt starts
  Opened --> Streaming: first next
  Streaming --> Streaming: next
  Streaming --> Exhausted: no more rows
  Streaming --> Failed: exception
  Streaming --> Cancelled: cancel signal
  Exhausted --> Closed
  Failed --> Closed
  Cancelled --> Closed
  Closed --> [*]` }] },
      { title: 'UC-03 · Fuse a chain of narrow steps into one pass', blurb: 'Map and filter need only the row in front of them, so the whole chain can run in one pass.', intro: 'Filter and map look at one row at a time. Spark can run them as one chain over the rows, instead of building a full list after every step.', diagrams: [{ kind: SEQ, title: 'Eager: a full list after each step', src: `sequenceDiagram
  participant R as reader
  participant F as filter
  participant M as map
  R->>R: read all 12 rows into a list
  F->>R: take the whole list
  F->>F: keep 6 rows in a second list
  M->>F: take the whole list
  M->>M: build 6 pairs in a third list
  M-->>M: hand the list to the consumer` }] },
      { title: 'UC-04 · Stop early when the consumer has enough rows', blurb: 'LIMIT stops the pipeline as soon as enough rows have passed.', intro: 'A consumer that needs three rows should not make the reader scan the whole file. Rows are pulled one at a time, so the reader stops as soon as the third row passes.', diagrams: [{ kind: SEQ, title: 'LIMIT 3', src: `sequenceDiagram
  participant C as basket, LIMIT 3
  participant F as filter
  participant R as reader
  loop until the basket holds 3 rows
    C->>F: next
    F->>R: next
    R-->>F: row
    alt row passes the filter
      F-->>C: row
    else row fails
      Note over F: drop it and ask again
    end
  end
  C->>R: stop, and the reader closes` }] }
    ],
    hard: { title: 'Why does one request sometimes scan several rows?', body: 'Demand travels upstream while rows travel downstream. Watch a rejected row get read but never projected.' }
  };

  D.lineage = {
    goal: 'Describe work without doing it, remember how to rebuild any partition, and keep reusable results without unbounded storage.',
    scope: ['In scope: lazy graph, persistence, eviction, checkpointing.', 'Out of scope: cross-application caches.'],
    fr: ['Record each transformation and its parent dependencies without running it.', 'Cache chosen partitions and serve later actions from them.', 'Rebuild an evicted or lost partition from its parents.', 'Truncate lineage by checkpointing to reliable storage.'],
    nfr: ['<b>Bounded storage:</b> cache never exceeds its memory share.', '<b>Correctness:</b> cache hit and recompute return the same rows.'],
    hld: { src: `flowchart LR
  A["RDD A<br/>read"] --> B["RDD B<br/>filter"]
  B --> C["RDD C<br/>map<br/>persist"]
  C --> D["RDD D<br/>reduceByKey"]
  C -.-> BM[("Block manager<br/>cached partitions")]
  D -->|"action"| Job["Job"]
  CP[("Reliable storage<br/>checkpoint")] -.-> C`, caption: 'Each node knows its parents, not its data. The block manager holds whatever is resident.',
      decisions: [['Eager or lazy?', 'Lazy', 'No unused work. Needs a graph.'], ['Replicate cache?', 'Optional', 'Faster loss recovery, double storage.'], ['Truncate lineage?', 'Checkpoint', 'Bounded replay, extra write.']] },
    uc: [
      { title: 'UC-01 · Compute a partition with a cache in front', blurb: 'A cached partition is served from memory, and a miss is rebuilt from its parents.', intro: 'Hit, miss, and evict all end in the same rows.', diagrams: [{ kind: SEQ, title: 'Partition lookup', src: `sequenceDiagram
  participant T as Task
  participant B as Block manager
  participant M as map
  participant F as filter
  participant R as read
  T->>B: do you have partition 3?
  alt cached
    B-->>T: yes, here are the rows
  else not cached
    B-->>T: no
    T->>M: compute partition 3
    M->>F: give me partition 3
    F->>R: give me partition 3
    R-->>F: rows
    F-->>M: rows
    M-->>T: rows
    T->>B: store partition 3
  end
  T->>B: do you have partition 3 again?
  B-->>T: yes, here are the rows` }] },
      { title: 'UC-02 · Block lifecycle', blurb: 'A cached block can be stored, evicted, dropped or never stored, and each has a different cost.', intro: 'Intent to cache and actual residency are different states.', diagrams: [{ kind: STATE, title: 'Cached block', src: `stateDiagram-v2
  [*] --> Requested: persist called
  Requested --> Resident: computed and stored
  Requested --> NotStored: no memory
  Resident --> Evicted: memory pressure
  Evicted --> Resident: recomputed and stored
  Resident --> Dropped: unpersist
  NotStored --> [*]
  Dropped --> [*]` }] },
      { title: 'UC-03 · Rebuild a lost partition from its lineage', blurb: 'Only the lost partitions are rebuilt, by walking back through their parents.', intro: 'A lost partition is rebuilt from its parent, and that parent from its own parent, until a partition that still exists is found.', diagrams: [{ kind: SEQ, title: 'Walk back through the parents', src: `sequenceDiagram
  participant D as Driver
  participant E2 as Executor 2
  participant E1 as Executor 1
  participant F as File
  D->>E2: compute C partition 2
  E2--xD: no answer, executor lost
  Note over D: C partition 2 needs B partition 2, which is lost too
  D->>E1: recompute B partition 2
  E1->>F: read A partition 2
  F-->>E1: rows
  E1-->>D: B partition 2 is back
  D->>E1: recompute C partition 2 from B
  E1-->>D: C partition 2 is back` }] },
      { title: 'UC-04 · A checkpoint cuts a long lineage', blurb: 'A checkpoint saves a partition, so a rebuild stops there instead of at the source.', intro: 'A checkpoint writes a result to reliable storage and cuts the lineage behind it.', diagrams: [{ kind: SEQ, title: 'Replay from the checkpoint', src: `sequenceDiagram
  participant D as Driver
  participant X as Executor
  participant S as Reliable storage
  D->>X: run op1 to op8 once
  Note over X: the result of op8 is lost
  D->>X: replay op1 from the source
  D->>X: replay op2
  D->>X: replay op3
  D->>X: replay op4
  D->>X: replay op5
  D->>X: replay op6
  D->>X: replay op7
  D->>X: replay op8
  X-->>D: op8 is back
  D->>D: mark op4 for a checkpoint
  D->>X: run op1 to op4 for the checkpoint
  X->>S: write op4 to reliable storage
  Note over X: the result of op8 is lost again
  D->>S: read op4 from the checkpoint
  D->>X: replay op5
  D->>X: replay op6
  D->>X: replay op7
  D->>X: replay op8
  X-->>D: op8 is back` }] }
    ],
    hard: null
  };

  D.stages = {
    goal: 'Decide which work can start now, which must wait, and how many tasks each piece needs.',
    scope: ['In scope: dependency walk, stage cuts at shuffle boundaries, readiness.', 'Out of scope: SQL-level planning (chapter 11).'],
    fr: ['Walk back from the action to find parent stages.', 'Cut a stage wherever a wide dependency needs data from many parents.', 'Run a stage only when all required parent outputs are available.', 'Set task count per stage from partitions, not from slots.'],
    nfr: ['<b>No premature reads:</b> a reducer never starts on partial map output.', '<b>Reuse:</b> a shared parent stage runs once.'],
    hld: { src: `flowchart LR
  subgraph S0["Stage 0 · 3,907 tasks"]
    A["read"] --> B["filter"] --> C["map"]
  end
  subgraph S1["Stage 1 · 128 tasks"]
    D["reduce"] --> E["map"]
  end
  subgraph S2["Stage 2 · 128 tasks"]
    F["reduce"]
  end
  C ==>|"shuffle 1"| D
  E ==>|"shuffle 2"| F`, caption: 'Narrow operators stay inside a stage. Each shuffle edge is a barrier.',
      decisions: [['Where to cut?', 'At every wide dependency', 'Correct by construction. Some barriers can be avoided by co-partitioning.'], ['Task count?', 'One per output partition', 'Independent of cluster size.']] },
    uc: [
      { title: 'UC-01 · Plan stages from an action', intro: 'The planner walks backwards from the result.', diagrams: [{ kind: FLOW, title: 'Stage planning', src: `flowchart TD
  A["Action on final RDD"] --> B["Create result stage"]
  B --> C{"Any wide parent dependency?"}
  C -- "yes" --> D["Create parent shuffle-map stage"]
  D --> C
  C -- "no" --> E["Pipeline narrow parents into this stage"]
  E --> F["Submit stages with no missing parents first"]` }] },
      { title: 'UC-02 · Stage readiness', intro: 'A stage is runnable only when its inputs are registered.', diagrams: [{ kind: STATE, title: 'Stage state', src: `stateDiagram-v2
  [*] --> Waiting
  Waiting --> Running: all parent outputs available
  Running --> Complete: all tasks succeeded and outputs registered
  Running --> Resubmitting: output lost or fetch failed
  Resubmitting --> Running: missing tasks relaunched
  Running --> Failed: attempts exhausted
  Complete --> [*]
  Failed --> [*]` }] },
      { title: 'UC-03 · A shared parent stage is planned once', intro: 'Two branches of one graph both need the same shuffle. The planner keeps a memo of stages it has made, so the shared parent is linked twice and run once.', diagrams: [{ kind: FLOW, title: 'Diamond plan', src: `flowchart TD
  D["Shuffle 1: read + reduceByKey"] --> A["Branch A: map"]
  D --> B["Branch B: filter"]
  A -- "shuffle" --> R["Result: join + collect"]
  B -- "shuffle" --> R
  M["Planner memo: D already has a stage?"] -. "yes: link it, plan nothing new" .-> D` }] },
      { title: 'UC-04 · A second job skips a finished shuffle', intro: 'Two actions run on the same dataset. The map outputs from the first job are still registered, so the second job does not run that stage again.', diagrams: [{ kind: SEQ, title: 'Two jobs, one shuffle', src: `sequenceDiagram
  participant U as Your code
  participant D as Driver
  participant E as Executors
  U->>D: job 1: collect()
  D->>E: run map side (4 tasks)
  E-->>D: 4 of 4 outputs registered
  D->>E: run result (2 tasks)
  U->>D: job 2: count()
  D->>D: map side has 4 of 4 outputs, skip it
  D->>E: run only the result (2 tasks)
  E-->>U: count` }] },
      { title: 'UC-05 · A join with matching layouts adds no exchange', intro: 'When both sides are already partitioned by the same key and partition count, each join task reads matching partitions directly. The stage and its exchange disappear.', diagrams: [{ kind: FLOW, title: 'Two plans for one join', src: `flowchart LR
  subgraph S1["Layouts unknown"]
    A1["orders"] -- "exchange" --> J1["join stage"]
    B1["customers"] -- "exchange" --> J1
  end
  subgraph S2["Layouts match"]
    A2["orders: hash(id) % 8"] -- "partition i to i" --> J2["join stage"]
    B2["customers: hash(id) % 8"] -- "partition i to i" --> J2
  end` }] },
      { title: 'UC-06 · Tasks follow partitions, not slots', intro: 'A stage makes one task per partition. Slots decide only how many of those tasks run at the same time, in waves.', diagrams: [{ kind: FLOW, title: 'Partitions to waves', src: `flowchart LR
  P["12 partitions"] --> T["12 tasks"]
  T --> S["4 slots"]
  S --> W["3 waves of 4 tasks"]` }] }
    ],
    hard: { title: 'Why can a reducer not start early?', body: 'Step through producer outputs becoming available and see which stage unlocks, and why task count is not slot count.' }
  };

  D.schedule = {
    goal: 'Keep every executor slot busy with ready tasks, and learn their outcomes, before worrying about failures.',
    scope: ['In scope: registration, dispatch, status loop, locality wait, attempt retries, cores per task.', 'Out of scope: recovery of lost map outputs (recovery page), cross-application fairness.'],
    fr: ['Track executors and their free slots.', 'Offer slots to the next runnable task set and launch tasks.', 'Receive status, free the slot, offer again.', 'Prefer data-local slots, but not forever.', 'Retry a failed attempt until a fixed limit is reached.'],
    nfr: ['<b>Utilization:</b> no slot idle while a task is ready.', '<b>Dispatch rate:</b> driver handles launch and completion messages fast enough.'],
    hld: { src: `flowchart LR
  Dag["Stage planner"] -->|"task set"| TS["Task scheduler<br/>queue + locality"]
  TS -->|"resource offers"| BE["Scheduler backend"]
  BE -. "launch" .-> E1["Executor 1<br/>4 slots"]
  BE -. "launch" .-> E2["Executor 2<br/>4 slots"]
  E1 -. "status" .-> BE
  E2 -. "status" .-> BE
  BE --> TS`, caption: 'Offers go down, statuses come up. The planner never talks to executors directly.',
      decisions: [['Push or pull?', 'Executors register, driver offers', 'Driver stays authoritative on slot use.'], ['Wait for locality?', 'Bounded wait', 'Trades short delay for fewer remote reads.']] },
    uc: [
      { title: 'UC-01 · One launch and completion cycle', intro: 'Each finished task frees a slot, and the freed slot triggers the next offer. The cycle repeats until the queue is empty.', diagrams: [{ kind: SEQ, title: 'Dispatch loop', src: `sequenceDiagram
  participant T as Task scheduler
  participant B as Backend
  participant E as Executor
  E->>B: register (4 slots)
  B->>T: resource offer
  T-->>B: tasks that fit
  B->>E: launch tasks
  E-->>B: status update
  B->>T: task finished, slot free
  T->>T: next offer` }] },
      { title: 'UC-02 · Task attempt states', intro: 'One attempt, from queue to result.', diagrams: [{ kind: STATE, title: 'Attempt', src: `stateDiagram-v2
  [*] --> Pending
  Pending --> Launched: slot matched
  Launched --> Running: executor started it
  Running --> Finished: success
  Running --> Failed: error or executor lost
  Running --> Killed: cancelled
  Finished --> [*]
  Failed --> [*]
  Killed --> [*]` }] },
      { title: 'UC-03 · Wait for a local slot, then step down', intro: 'A task prefers the executor that holds its data. If no slot is free there, it waits a bounded time at each locality level before accepting a farther one.', diagrams: [{ kind: FLOW, title: 'Locality levels', src: `flowchart TD
  A["Free slot on the data's executor?"] -- "yes" --> R1["run: PROCESS_LOCAL"]
  A -- "no, wait up to spark.locality.wait" --> B["Free slot on the same host?"]
  B -- "yes" --> R2["run: NODE_LOCAL"]
  B -- "no, wait again" --> C["Free slot in the same rack?"]
  C -- "yes" --> R3["run: RACK_LOCAL"]
  C -- "no, wait again" --> R4["run: ANY, read remotely"]` }] },
      { title: 'UC-04 · Retry a failed attempt until the limit', intro: 'A failure from an application error is retried on another executor. If the same task keeps failing, the limit stops the job instead of looping forever.', diagrams: [{ kind: STATE, title: 'Attempts of one task', src: `stateDiagram-v2
  [*] --> Attempt0
  Attempt0 --> Succeeded: ok
  Attempt0 --> Failed1: error
  Failed1 --> Attempt1: retry on another executor
  Attempt1 --> Succeeded: ok
  Attempt1 --> Failed2: error
  Failed2 --> Attempt2: retry
  Attempt2 --> Failed3: error
  Failed3 --> Attempt3: retry
  Attempt3 --> Failed4: error
  Failed4 --> Aborted: 4 of 4 used, job aborted
  Succeeded --> [*]
  Aborted --> [*]` }] },
      { title: 'UC-05 · Cores per task set the slot count', intro: 'Each task takes spark.task.cpus cores from the executor. The number of tasks an executor can run at once is its cores divided by that value.', diagrams: [{ kind: FLOW, title: 'Slots from cores', src: `flowchart LR
  E["Executor: 4 cores"] --> S["slots = cores / spark.task.cpus"]
  S --> A["spark.task.cpus = 1: 4 tasks at once"]
  S --> B["spark.task.cpus = 2: 2 tasks at once"]` }] }
    ],
    hard: null
  };

  D.shuffle = {
    goal: 'Bring together all records that share a key, which start on different executors, without a central funnel.',
    scope: ['In scope: map-side partial state, indexed output file, range fetch.', 'Out of scope: external shuffle service deployment details.'],
    fr: ['Each map task writes one output split by reducer id.', 'Register block locations with the driver.', 'Each reducer fetches its range from every map output.', 'Combine partial state on both sides when the operation allows.'],
    nfr: ['<b>Bounded:</b> in-flight fetch bytes and requests are capped.', '<b>Correct:</b> aggregation equals the no-shuffle answer.', '<b>Efficient:</b> avoid millions of tiny reads.'],
    hld: { src: `flowchart LR
  subgraph Maps["Map tasks"]
    M1["Map 0<br/>combine + partition"]
    M2["Map 1"]
  end
  M1 --> F1[("Data file + index<br/>local disk")]
  M2 --> F2[("Data file + index")]
  M1 -. "register locations" .-> Drv["Driver<br/>map output tracker"]
  Drv -. "where is range r?" .-> R1
  F1 ==>|"range 0"| R1["Reduce 0"]
  F2 ==>|"range 0"| R1
  F1 ==>|"range 1"| R2["Reduce 1"]
  F2 ==>|"range 1"| R2`, caption: 'Map tasks write local files. The driver only knows where ranges are, never what is in them.',
      decisions: [['Many files or one?', 'One data file + index per map', 'Avoids M × R files.'], ['Fetch strategy?', 'Parallel, capped by bytes and requests', 'Bounds memory and connection count.'], ['Where do blocks live?', 'Executor disk', 'Lost with the executor unless a shuffle service holds them.']] },
    uc: [
      { title: 'UC-01 · Write and index map output', intro: 'The index file turns one big file into addressable ranges.', diagrams: [{ kind: FLOW, title: 'Map-side write', src: `flowchart TD
  A["Map task reads partition"] --> B["Aggregate into in-memory map"]
  B --> C{"Memory budget exceeded?"}
  C -- "yes" --> D["Sort and spill a run"]
  D --> B
  C -- "no" --> E["Partition by hash of key"]
  B --> E
  E --> F["Merge runs, write one data file"]
  F --> G["Write index: offset per reducer"]
  G --> H["Register output with driver"]` }] },
      { title: 'UC-02 · Reducer fetches its ranges', intro: 'Locations come from the driver. Bytes do not.', diagrams: [{ kind: SEQ, title: 'Shuffle read', src: `sequenceDiagram
  participant R as Reduce task
  participant V as Driver
  participant A as Executor A
  participant B as Executor B
  R->>V: where are outputs of shuffle 0?
  V-->>R: map 0 on A, map 1 on B
  par fetch
    R->>A: range 3 of map 0
    A-->>R: bytes
  and
    R->>B: range 3 of map 1
    B-->>R: bytes
  end
  R->>R: merge partial sums by key` }] }
    ],
    hard: { title: 'How do partial sums from different executors meet?', body: 'Watch indexed ranges, map-side combine and fetch limits. Change reducer count to see blocks multiply.' }
  };

  D.memory = {
    goal: 'Let a task work on more state than fits in memory, and keep the answer identical.',
    scope: ['In scope: execution memory accounting, spill, merge.', 'Out of scope: JVM garbage collection tuning, off-heap allocators.'],
    fr: ['Account for execution memory per task.', 'Spill sorted runs to local disk when a grant is refused.', 'Merge runs back into a single ordered result.', 'Share memory fairly among active tasks.'],
    nfr: ['<b>Bounded:</b> a task never holds more than its grant.', '<b>Correct:</b> spilling never changes the result.', '<b>Diagnosable:</b> spill volume is a visible metric.'],
    hld: { src: `flowchart LR
  T["Task<br/>aggregation map"] -->|"request grant"| MM["Memory manager<br/>per-task fair share"]
  MM -->|"granted"| T
  MM -->|"refused"| Sp["Spill: sort + write run"]
  Sp --> D[("Local disk<br/>sorted runs")]
  T --> Mg["Merge iterator"]
  D --> Mg
  Mg --> Out["Final ordered output"]`, caption: 'Spill is the escape path when a grant request is refused. The merge restores one answer.',
      decisions: [['Who decides memory?', 'A per-executor manager with a fair share', 'Prevents one task starving others.'], ['Spill format?', 'Sorted runs', 'Merge is a streaming k-way pass.']] },
    uc: [
      { title: 'UC-01 · Grow state under a grant', intro: 'Each insert asks for more memory before growing.', diagrams: [{ kind: SEQ, title: 'Grant and spill', src: `sequenceDiagram
  participant T as Task
  participant M as Memory manager
  participant D as Disk
  T->>M: acquire 64 MB
  M-->>T: granted
  T->>M: acquire 64 MB
  M-->>T: refused (pool exhausted)
  T->>D: sort state, write run 1
  T->>M: release state
  T->>T: continue with empty buffer
  T->>D: read runs, k-way merge` }] },
      { title: 'UC-02 · Memory pressure outcomes', intro: 'Three different endings. Know which one you are looking at.', diagrams: [{ kind: FLOW, title: 'Pressure outcomes', src: `flowchart TD
  A["Task needs more memory"] --> B{"Grant available?"}
  B -- "yes" --> C["Grow in memory"]
  B -- "no" --> D{"Spillable structure?"}
  D -- "yes" --> E["Spill run, continue"]
  D -- "no" --> F["Task fails with out-of-memory"]
  C --> G{"Process exceeds container limit?"}
  G -- "yes" --> H["Container killed by OS"]
  G -- "no" --> I["Continue"]` }] }
    ],
    hard: { title: 'What happens to the answer when memory runs out?', body: 'Shrink the grant and watch runs spill and merge back to the same total.' }
  };

  D.recovery = {
    goal: 'Finish the job after a worker dies, without redoing work that survived.',
    scope: ['In scope: task retry, fetch failure, producer replay, speculation.', 'Out of scope: driver failover.'],
    fr: ['Retry a failed task attempt a bounded number of times.', 'On fetch failure, invalidate lost outputs and re-run only their producers.', 'Launch a duplicate of a straggler (speculation) and accept the first success.', 'Track every attempt separately.'],
    nfr: ['<b>Minimal replay:</b> surviving outputs are reused.', '<b>Safety:</b> duplicates cannot corrupt results.', '<b>Bounded:</b> retries have a ceiling.'],
    hld: { src: `flowchart LR
  Ex["Executor lost"] --> Drv["Driver<br/>invalidate outputs on that executor"]
  Drv --> St["Stage: resubmit<br/>missing producer tasks"]
  St --> Re["Recompute from<br/>lineage + immutable input"]
  Re --> Reg["Register new block locations"]
  Reg --> Cons["Waiting reducers retry"]`, caption: 'Failure handling is a decision about which class of failure it is, then which dependency to restore.',
      decisions: [['Retry the reducer?', 'Only after the input exists again', 'Retrying against a dead location is wasted.'], ['Replicate shuffle?', 'No, recompute', 'Cheaper in steady state.']] },
    uc: [
      { title: 'UC-01 · Executor lost mid-reduce', intro: 'The reducer reports a fetch failure. The producers rerun.', diagrams: [{ kind: SEQ, title: 'Fetch failure and replay', src: `sequenceDiagram
  participant R as Reducer
  participant V as Driver
  participant A as Executor A (lost)
  participant N as Executor N
  R->>A: fetch range
  A--xR: connection refused
  R->>V: fetch failed (shuffle 0, map 7)
  V->>V: invalidate all outputs on A
  V->>N: rerun lost map tasks
  N-->>V: new locations
  V->>R: retry with new locations
  R->>N: fetch range
  N-->>R: bytes` }] },
      { title: 'UC-02 · Speculate a straggler', intro: 'Two attempts, one winner. The loser must not publish.', diagrams: [{ kind: STATE, title: 'Task with speculation', src: `stateDiagram-v2
  [*] --> Running
  Running --> Suspected: slower than threshold
  Suspected --> Duplicated: second attempt launched
  Duplicated --> Won: first attempt succeeds
  Won --> Cancelled: other attempt killed
  Running --> Won: success
  Cancelled --> [*]
  Won --> [*]` }] }
    ],
    hard: { title: 'Which work is lost, and which is reused?', body: 'Kill an executor and watch outputs invalidate, producers replay, and reducers resume. Toggle the shuffle service.' }
  };

  D.commit = {
    goal: 'Make a result visible only when it is complete and made of exactly one winner per partition.',
    scope: ['In scope: attempt winners, staged output, visibility, readiness.', 'Out of scope: table-format transactions beyond what the sink provides.'],
    fr: ['Each attempt writes to a private location.', 'Exactly one attempt per partition is promoted.', 'The job publishes a completion marker only when all partitions are promoted.', 'Readers consult the marker, not the directory listing.'],
    nfr: ['<b>No partial results</b> presented as complete.', '<b>No duplicates</b> from retries or speculation.', '<b>Bounded commit time</b> on the target store.'],
    hld: { src: `flowchart LR
  T1["Attempt 0 of p0"] --> S1[("Staging")]
  T2["Attempt 1 of p0"] --> S1
  Drv["Driver<br/>commit coordinator"] -. "authorize one" .-> T1
  S1 --> Pro["Promote winner"]
  Pro --> Fin[("Final location")]
  Pro --> Mk["Readiness marker<br/>written last"]
  Mk -.-> Rd["Readers"]
  Fin -.-> Rd`, caption: 'Winner selection and job readiness are separate steps. Readers trust the marker.',
      decisions: [['Who picks the winner?', 'A coordinator at the driver', 'First authorized attempt wins; late ones are refused.'], ['How do readers know?', 'Readiness marker, written last', 'Listing files alone can show partials.']] },
    uc: [
      { title: 'UC-01 · Attempt commit protocol', intro: 'The task asks before it promotes.', diagrams: [{ kind: SEQ, title: 'Commit', src: `sequenceDiagram
  participant T as Task attempt
  participant C as Commit coordinator
  participant S as Sink
  T->>S: write to staging path
  T->>C: may I commit partition 0, attempt 1?
  C-->>T: yes (first asker)
  T->>S: promote staging to final
  T-->>C: committed
  Note over C: later attempt for partition 0 is denied
  C->>S: all partitions committed, write marker` }] },
      { title: 'UC-02 · Output attempt states', intro: 'Visible is not the same as ready.', diagrams: [{ kind: STATE, title: 'Partition output', src: `stateDiagram-v2
  [*] --> Writing
  Writing --> Staged: task success
  Staged --> Authorized: coordinator accepts
  Staged --> Discarded: another attempt won
  Authorized --> Promoted: final path written
  Promoted --> Ready: marker covers all partitions
  Discarded --> [*]
  Ready --> [*]` }] }
    ],
    hard: { title: 'How can duplicate attempts publish only once?', body: 'Run speculative attempts and watch one winner promoted while the job stays unready until every partition is done.' }
  };

  D.sql = {
    goal: 'Let users say what they want, and let the engine pick how, using an inspectable plan.',
    scope: ['In scope: analyze, optimize, physical plan, lowering to tasks.', 'Out of scope: full SQL grammar, UDF compilation.'],
    fr: ['Parse a query into a logical plan.', 'Resolve names and types against a catalog.', 'Rewrite for cost: prune columns, push filters.', 'Choose physical operators with distribution requirements; lower to stages.'],
    nfr: ['<b>Inspectable:</b> every plan can be printed.', '<b>Semantics-preserving:</b> rewrites never change results.'],
    hld: { src: `flowchart LR
  Q["Query text or DataFrame"] --> P["Parse"]
  P --> A["Analyze<br/>resolve columns and types"]
  A --> O["Optimize<br/>prune, push, fold"]
  O --> Ph["Physical planning<br/>pick operators + distribution"]
  Ph --> L["Lower to RDD stages"]
  L --> Ex["Tasks run"]
  Cat[("Catalog + statistics")] -.-> A
  Cat -.-> Ph`, caption: 'Each arrow produces a new, printable plan. Statistics only influence physical choices.',
      decisions: [['Opaque function or expression?', 'Expression', 'Visible to rewrites.'], ['Cost or rule based?', 'Rules first, statistics for strategy', 'Predictable, then improved by evidence.']] },
    uc: [
      { title: 'UC-01 · From query to tasks', intro: 'The same pipeline for SQL and DataFrame code.', diagrams: [{ kind: SEQ, title: 'Plan lifecycle', src: `sequenceDiagram
  participant U as User
  participant P as Parser
  participant A as Analyzer
  participant O as Optimizer
  participant S as Planner
  participant E as Execution
  U->>P: query
  P-->>A: unresolved plan
  A-->>O: resolved plan
  O-->>S: optimized plan
  S-->>E: physical plan with exchanges
  E-->>U: rows` }] },
      { title: 'UC-02 · Choose a physical operator', intro: 'Distribution requirements decide where exchanges go.', diagrams: [{ kind: FLOW, title: 'Aggregate planning', src: `flowchart TD
  A["Logical aggregate by city"] --> B{"Child already partitioned by city?"}
  B -- "yes" --> C["Aggregate in place, no exchange"]
  B -- "no" --> D["Partial aggregate per task"]
  D --> E["Exchange by city hash"]
  E --> F["Final aggregate"]` }] }
    ],
    hard: null
  };

  D.joins = {
    goal: 'Make matching records meet, using the cheapest data movement that fits memory.',
    scope: ['In scope: broadcast, shuffled hash, sort-merge, outer-join semantics.', 'Out of scope: non-equi joins.'],
    fr: ['Join a large fact relation to another relation on a key.', 'Choose a strategy from size and properties.', 'Preserve match multiplicity and outer-join semantics.'],
    nfr: ['<b>Correct multiplicity:</b> m × n matches per key.', '<b>Bounded build side:</b> a hash table must fit its grant.'],
    hld: { src: `flowchart TD
  Q["Join request"] --> S{"Either side under broadcast threshold?"}
  S -- "yes" --> B["Broadcast hash join"]
  S -- "no" --> P{"Sorted or co-partitioned?"}
  P -- "yes" --> M["Local merge, no exchange"]
  P -- "no" --> H{"Build side fits per-partition memory?"}
  H -- "yes" --> HJ["Shuffled hash join"]
  H -- "no" --> SM["Sort-merge join with spill"]`, caption: 'Strategy follows size, existing distribution and memory, and always keeps join semantics.',
      decisions: [['Broadcast?', 'Only if tiny and the join type allows it', 'Outer-join side restrictions apply.'], ['Hash or sort-merge?', 'Hash if the build fits', 'Sort-merge is robust but costs a sort.']] },
    uc: [
      { title: 'UC-01 · Broadcast hash join', intro: 'The fact table does not move.', diagrams: [{ kind: SEQ, title: 'Broadcast', src: `sequenceDiagram
  participant V as Driver
  participant D as Dimension scan
  participant E as Each executor
  V->>D: collect small side
  D-->>V: rows
  V->>E: broadcast hash table
  E->>E: stream fact partition, probe table
  E-->>V: joined partition` }] },
      { title: 'UC-02 · Shuffled join, same key meets', intro: 'Both sides are exchanged by key, then joined locally.', diagrams: [{ kind: FLOW, title: 'Shuffle join', src: `flowchart LR
  F["Fact partitions"] -->|"hash(key)"| X["Exchange"]
  D["Dimension partitions"] -->|"hash(key)"| X
  X --> R0["Reducer 0<br/>build + probe"]
  X --> R1["Reducer 1<br/>build + probe"]` }] }
    ],
    hard: { title: 'Where do matching records meet?', body: 'Compare broadcast, aligned and shuffled placement, and see m×n multiplicity preserved.' }
  };

  D.adaptive = {
    goal: 'Use what actually happened at an exchange to fix partition counts, joins and skew, which estimates could not predict.',
    scope: ['In scope: post-shuffle statistics, coalescing, skew split, salting.', 'Out of scope: cost-based global reordering.'],
    fr: ['Collect map output sizes per reducer partition.', 'Merge small neighbouring partitions up to a target size.', 'Split an oversized partition into sub-ranges that still join correctly.', 'Decompose hot aggregation keys with valid partial state.'],
    nfr: ['<b>Correctness:</b> adaptation never changes the answer.', '<b>Cheap:</b> decisions use already-collected statistics.'],
    hld: { src: `flowchart LR
  M["Map stage done"] --> St["Per-partition byte sizes"]
  St --> D{"Many tiny partitions?"}
  D -- "yes" --> C["Coalesce neighbours"]
  St --> K{"One partition much larger than median?"}
  K -- "yes" --> S["Split into sub-partitions"]
  C --> N["Reduce stage with new plan"]
  S --> N
  K -- "no" --> N`, caption: 'Planning is re-run at the barrier, where the real numbers become available.',
      decisions: [['Plan when?', 'At the stage boundary', 'Statistics are actual, not guessed.'], ['Split how?', 'By map output ranges', 'No new shuffle needed.']] },
    uc: [
      { title: 'UC-01 · Re-plan at the barrier', intro: 'The map stage finished. The reduce stage has not started.', diagrams: [{ kind: SEQ, title: 'Runtime re-planning', src: `sequenceDiagram
  participant M as Map stage
  participant V as Driver
  participant P as Adaptive planner
  participant R as Reduce stage
  M-->>V: output sizes per partition
  V->>P: statistics
  P->>P: coalesce small, split skewed
  P-->>V: new reducer layout
  V->>R: launch tasks for new layout` }] },
      { title: 'UC-02 · Skewed join', intro: 'Split the big side, replicate the small side. Never the reverse.', diagrams: [{ kind: FLOW, title: 'Skew decision', src: `flowchart TD
  A["Partition larger than threshold"] --> B{"Which side is skewed?"}
  B -- "left" --> C["Split left into N ranges"]
  C --> D["Copy matching right partition N times"]
  B -- "right" --> E["Mirror the same plan"]
  B -- "aggregation" --> F["Salt key, partial aggregate, then combine"]` }] }
    ],
    hard: { title: 'How do you fix a hot key without breaking the answer?', body: 'See coalescing and skew splitting on measured sizes. Check which operations allow valid partial state.' }
  };

  D.evidence = {
    goal: 'Keep enough of what actually ran to explain a slow or failed job after the driver is gone.',
    scope: ['In scope: event log, metrics, history replay, final plans.', 'Out of scope: long-term analytics warehouse.'],
    fr: ['Record job, stage and task lifecycle events.', 'Attribute metrics (time, bytes, spill) to tasks and stages.', 'Persist the final plan including runtime changes.', 'Replay the log into a history view.'],
    nfr: ['<b>Low overhead:</b> logging does not slow tasks noticeably.', '<b>Bounded:</b> retention and size are controlled.'],
    hld: { src: `flowchart LR
  Sch["Scheduler"] -->|"events"| Bus["Event bus"]
  Bus --> L["Event log writer"]
  Bus --> UI["Live status store"]
  L --> FS[("Durable storage")]
  FS --> H["History server<br/>replays log"]
  Ex["Executors"] -. "task metrics" .-> Sch`, caption: 'One stream of events feeds both the live view and the durable log.',
      decisions: [['Sync or async logging?', 'Asynchronous', 'Never block scheduling on disk.'], ['What to keep?', 'Events and final plan', 'Not data.']] },
    uc: [
      { title: 'UC-01 · Explain a slow stage after the fact', intro: 'Replay turns a log into the same view that ran live.', diagrams: [{ kind: SEQ, title: 'Event replay', src: `sequenceDiagram
  participant S as Scheduler
  participant L as Log writer
  participant F as Storage
  participant H as History server
  S->>L: task end (metrics)
  L->>F: append event
  Note over S,F: driver exits
  H->>F: read log
  F-->>H: events
  H->>H: rebuild stages, tasks, metrics` }] },
      { title: 'UC-02 · Log lifecycle', intro: 'In-progress logs must be distinguishable from complete ones.', diagrams: [{ kind: STATE, title: 'Event log', src: `stateDiagram-v2
  [*] --> InProgress
  InProgress --> Complete: application end event written
  InProgress --> Incomplete: driver died, no end event
  Complete --> Compacted: rolled up
  Complete --> Expired: retention
  Incomplete --> Expired: retention
  Expired --> [*]` }] }
    ],
    hard: null
  };

  D.build = {
    goal: 'Prove the parts fit: run one engine whose answer is unchanged by every scheduling, spill, replay and publication choice.',
    scope: ['In scope: the 12-row reference engine and its invariants.', 'Out of scope: real network, real disks, real SQL compiler.'],
    fr: ['Run read → filter → map → shuffle → aggregate → publish end to end.', 'Accept settings for partitions, slots, memory, combine, executor loss.', 'Report the same total under every setting.'],
    nfr: ['<b>Deterministic:</b> same inputs give the same trace.', '<b>Honest:</b> the model states what it does not simulate.'],
    hld: { src: `flowchart LR
  In["Input (12 rows)"] --> R["Read partitions"]
  R --> P["Pull pipeline"]
  P --> Sh["Shuffle + combine"]
  Sh --> Sp["Spill + merge"]
  Sp --> Ag["Aggregate"]
  Ag --> Pub["Publish winner attempts"]
  Pub --> Ans["City sums, total 640"]
  Loss["Executor loss"] -.-> Sh
  Loss -.-> Rec["Replay lost outputs"]
  Rec -.-> Ag`, caption: 'Every chapter\'s mechanism is one box. The dashed path is recovery.',
      decisions: [['What to run?', 'The same model as the animations', 'Explanations and code cannot drift apart.'], ['Failure input?', 'Explicit toggles', 'Reproducible, not random.']] },
    uc: [
      { title: 'UC-01 · End-to-end run', intro: 'One set of options, one trace, one answer.', diagrams: [{ kind: SEQ, title: 'Reference run', src: `sequenceDiagram
  participant C as You
  participant E as Engine
  participant S as Scheduler
  participant K as Sink
  C->>E: run(options)
  E->>S: tasks for each stage
  S-->>E: waves complete
  E->>E: shuffle, spill, merge
  E->>K: publish winners
  K-->>C: answer + trace` }] }
    ],
    hard: null
  };

  /* Page names. The overview is the architecture chapter. Every other chapter is a feature with its own page. */
  const META = {
    architecture: ['Distributed batch engine', 'Overview', 'Who plans, who executes, who moves the bytes.'],
    read: ['Input & partitions', 'Read', 'Turn files into replayable work without cutting a record.'],
    pipeline: ['Pull pipeline', 'Stream', 'Run narrow operators with a handful of rows in memory.'],
    lineage: ['Lineage & cache', 'Recipe', 'Describe work lazily, reuse blocks, cut long recipes.'],
    stages: ['Stage planning', 'Stages', 'Cut the graph at shuffle barriers and gate readiness.'],
    schedule: ['Task scheduling', 'Tasks', 'Keep every executor slot busy before failures exist.'],
    shuffle: ['Shuffle exchange', 'Exchange', 'Bring same-key records together without a central funnel.'],
    memory: ['Memory & spill', 'Spill', 'Hold more state than memory and keep the answer.'],
    recovery: ['Failure recovery', 'Recover', 'Replay only the lost work and race stragglers safely.'],
    commit: ['Output commit', 'Publish', 'Show a result only when it is complete and single-winner.'],
    sql: ['SQL planner', 'SQL', 'Turn declarative queries into inspectable physical work.'],
    joins: ['Join strategies', 'Join', 'Make matching records meet at the cheapest cost.'],
    adaptive: ['Adaptive execution', 'Adapt', 'Re-plan from real sizes and split hot keys correctly.'],
    evidence: ['Execution evidence', 'Evidence', 'Keep enough history to explain a run after it ends.'],
    build: ['End-to-end build', 'Build', 'Prove the parts fit with one engine whose answer never changes.']
  };
  for (const [id, [name, tag, summary]] of Object.entries(META)) Object.assign(D[id], { name, tag, summary });

  /* Per use case: trigger, the steps in order, edge cases, and the invariant that must hold. Keyed by feature id, then use-case index. */
  const X = {
    read: [
      { trigger: 'A worker is handed one piece of a big text file, for example bytes 10 to 20 of a 20-byte file. Many workers do this at the same time, each with a different piece, and none of them can ask the others where their lines ended.', command: "spark.read.option(\"header\", True).csv(\"people.csv\").count()", expect: 'Every row is read by exactly one worker, even when a cut falls in the middle of a row.', steps: [
        'The file is cut into pieces by size only. A cut can fall in the middle of a line, or on the first letter of a line, or right on a line break.',
        'If the piece starts at the very beginning of the file, the worker starts reading at the first line. Nothing comes before it.',
        'Otherwise the worker goes back one byte before the start of its piece, and throws away everything up to and including the first line break it finds. This leftover belongs to the worker before it, which will read that line in full.',
        'Stepping back one byte matters. If the byte just before the piece is a line break, only that break is thrown away, and the first full line of this piece is kept.',
        'The worker now reads line after line. For each line it asks one question: does this line START before the end of my piece? Where the line ends does not matter.',
        'If yes, it reads the whole line, even when the line runs past the end of its piece. It simply keeps reading into the next piece until it reaches the line break.',
        'If no, it stops. The line starts at or after its end, so the next worker owns it, and that worker will keep it because of the one-byte step back.',
        'Each piece always lets the line it starts in finish, and always leaves the line cut at its front to the worker before. Put together, every line has exactly one owner: the piece where the line starts.'
      ], edges: [
        { title: 'The cut lands exactly where a line begins', short: 'The line is easy to lose.', context: 'Worker A stops because that line does not start before the end of its piece. If Worker B also throws it away while skipping the leftover, nobody reads it. The job still finishes with no error, but the answer is missing a row.', solution: 'Worker B steps back one byte before it skips. If the byte just before its piece is a line break, only that one break is thrown away and the line that begins here is kept.' },
        { title: 'The cut lands in the middle of a line', short: 'The line could be read twice.', context: 'The line starts in one piece and ends in the next. If both workers read it, the row is counted twice.', solution: 'The piece where the line starts owns it. That worker reads past its own end to finish the line. The next worker throws away the leftover part.' },
        { title: 'One line is longer than a whole piece', short: 'A worker in the middle gets no line start.', context: 'The worker in the middle looks for the first line break, and that break is already past the end of its own piece. So no line starts inside its piece.', solution: 'It reads nothing, and that is correct. The worker where the line starts reads it whole. That one worker is slow, but the answer is right.' },
        { title: 'A line break made of two characters is cut in half', short: 'The worker may start reading from the middle of a row.', context: 'Some files end a line with a carriage return and a newline together. If the cut falls between the two, a worker can mistake the second character for the whole break.', solution: 'Read raw bytes and treat the pair as one line break. Drop the leftover carriage return from the row before using it.' },
        { title: 'A cell contains a line break inside quotes', short: 'The rule cannot tell a real break from one inside a cell.', context: 'In a CSV, a quoted cell can hold a paragraph with line breaks. A worker that starts in the middle of the file cannot know whether a break it finds is inside quotes.', solution: 'Do not cut such files by size. Use one worker for the whole file, or use a file format that marks safe places to start reading.' },
        { title: 'The last line has no line break', short: 'The final row could be dropped.', context: 'Some files end without a line break after the last row, so the worker never finds the end of that line.', solution: 'Treat the end of the file as the end of the line. The last worker reads that row as normal.' },
        { title: 'Characters that take several bytes', short: 'A cut can land in the middle of one letter.', context: 'An accented letter can use two or more bytes, and the file is cut by bytes, not by letters. A cut can fall inside one letter.', solution: 'A line break is a single byte that never appears inside another character in UTF-8. So the worker only searches for that byte and never mistakes half a letter for a break.' },
        { title: 'Extra reading at the edges', short: 'Every worker reads a little outside its own piece.', context: 'Every worker except the first reads a little before its start, and every worker reads a little past its end. If the next piece is on a far-away machine, that small read is a network trip.', solution: 'Make pieces large, such as 128 MB, so the extra read is a tiny share of the work. Run each worker close to its data when possible.' }
      ] },
      { trigger: 'The driver plans an input of many differently sized files.', steps: ['List the files and their sizes.', 'Cut files larger than the target into splits when the codec allows it.', 'Pack small files together using size plus per-file open cost.', 'Create one task per resulting partition.'], edges: ['Gzip files cannot be cut: one task per file.', 'Listing millions of files is itself a slow driver step.'], invariant: 'Re-planning the same snapshot gives the same partitions.' }
    ],
    pipeline: [
      { trigger: 'The consumer asks for the next key/value pair.', steps: ['The consumer calls next on the map iterator.', 'Map calls next on filter, which calls next on the reader.', 'The filter keeps pulling until a row passes the predicate.', 'The passing row is transformed and returned up the chain.'], edges: ['No row passes: the chain exhausts and returns nothing.', 'A predicate that throws fails the task attempt, not the process.'], invariant: 'At most one row per operator is in flight.' },
      { trigger: 'A task attempt starts, ends or is cancelled.', steps: ['The attempt opens its reader and per-partition resources.', 'Iteration drives all reads.', 'On exhaustion, failure or cancel, the attempt closes everything it opened.', 'A retry reopens from scratch.'], edges: ['Closing when the iterator is created breaks later pulls.', 'A leaked reader under many retries exhausts file handles.'], invariant: 'Every opened resource is closed exactly once.' }
    ],
    lineage: [
      { trigger: 'A task needs partition p of a persisted dataset.', steps: ['Ask the block manager for the block.', 'On a hit, return the cached rows.', 'On a miss, compute from parents and return the rows.', 'If persistence was requested and memory allows, store the block.'], edges: ['Memory is full: the block is not stored, the job still succeeds.', 'Non-deterministic parents make a recompute differ from the cache.'], invariant: 'A hit and a recompute return the same rows.' },
      { trigger: 'Memory pressure or an unpersist call.', steps: ['A block is chosen for eviction by policy.', 'It is dropped or spilled depending on the storage level.', 'Later requests miss and recompute.', 'A checkpoint, if present, bounds how far the recompute walks.'], edges: ['Evicting a block another task is reading is blocked.', 'Without a checkpoint, a very long lineage replays everything.'], invariant: 'Eviction changes cost, never results.' }
    ],
    stages: [
      { trigger: 'An action arrives with a graph containing shuffles.', steps: ['Create the result stage for the final dataset.', 'Walk its dependencies backwards.', 'Cut a new parent stage at each wide dependency.', 'Submit stages with no missing parents first.'], edges: ['A diamond-shaped graph: the shared parent stage is created once.', 'Already available outputs let a stage be skipped.'], invariant: 'No stage runs before its parent outputs are complete.' },
      { trigger: 'A producer task finishes or an output is lost.', steps: ['Register the output and count completed tasks.', 'When all producers have registered, mark child stages runnable.', 'On loss, move the stage to resubmitting and relaunch missing tasks.', 'The child waits again until outputs are complete.'], edges: ['Late task completions from an old stage attempt are ignored.', 'A stage that keeps losing outputs fails after its limit.'], invariant: 'Stage state follows registered outputs, not task chatter.' }
    ],
    schedule: [
      { trigger: 'Executors register and a task set is submitted.', steps: ['Executors report free slots as resource offers.', 'The task scheduler matches queued tasks to offers by locality.', 'The backend sends launch messages.', 'Status updates free slots and trigger the next offer.'], edges: ['No local slot: wait a bounded time, then run remotely.', 'Tasks far shorter than dispatch time make the driver the bottleneck.'], invariant: 'Active attempts never exceed granted slots.' },
      { trigger: 'A task attempt moves through its life.', steps: ['Pending until matched with a slot.', 'Launched when the message is sent.', 'Running once the executor starts it.', 'Finished, failed or killed reports back and frees the slot.'], edges: ['An executor stops responding mid-run: heartbeats expire and the attempt is failed.', 'A late success from a killed attempt is ignored.'], invariant: 'Each attempt has exactly one terminal state.' }
    ],
    shuffle: [
      { trigger: 'A map task finishes reading and aggregating its partition.', steps: ['Aggregate records into an in-memory map by key.', 'If memory is exceeded, sort and spill a run.', 'Partition the state by hash of the key into reducer ranges.', 'Write one data file and an index of offsets, then register it.'], edges: ['High key cardinality: combining saves little.', 'Many tiny output ranges slow reducers with seek-bound fetches.'], invariant: 'Combined partial state sums to the same total as raw records.' },
      { trigger: 'A reduce task starts.', steps: ['Ask the driver where each map output lives.', 'Fetch the reducer range from each location in parallel, within in-flight limits.', 'Merge partial sums by key.', 'Release fetched buffers as they are consumed.'], edges: ['A location is dead: report a fetch failure.', 'Too many requests in flight exhaust memory or connections.'], invariant: 'Fetched bytes in flight never exceed the configured cap.' }
    ],
    memory: [
      { trigger: 'A task grows aggregation state.', steps: ['Ask the memory manager for the next grant before growing.', 'If granted, grow in memory.', 'If refused, sort the state and write a run to disk, then release memory.', 'At the end, merge all runs and the in-memory remainder.'], edges: ['A non-spillable structure that cannot grow fails the task.', 'Too many runs make the final merge slow.'], invariant: 'Spilling never changes the final result.' },
      { trigger: 'The process nears a memory limit.', steps: ['Spark accounting refuses grants first.', 'Spillable structures spill.', 'Untracked memory (buffers, native code) keeps growing regardless.', 'The OS kills the container if the limit is crossed.'], edges: ['A kill looks like a lost executor, not an out-of-memory error.', 'Raising executor memory without overhead room can still be killed.'], invariant: 'Accounted memory and container memory are different numbers.' }
    ],
    recovery: [
      { trigger: 'An executor holding map outputs dies during the reduce stage.', steps: ['Reducers fail to fetch and report which map outputs are missing.', 'The driver invalidates every output on that executor.', 'Missing producer tasks are rerun on surviving executors.', 'Reducers retry with the new locations.'], edges: ['An external shuffle service keeps files alive if only the executor died.', 'Non-deterministic producers can change results between attempts.'], invariant: 'Surviving outputs are reused, not recomputed.' },
      { trigger: 'One task runs much slower than its peers.', steps: ['After a quantile of tasks finish, compare running time with the median.', 'Launch a second attempt of the slow task.', 'Accept whichever attempt finishes first.', 'Kill the other and discard its output.'], edges: ['Side effects of the loser may already have happened.', 'Speculating a skew-bound task just duplicates the slow work.'], invariant: 'Only one attempt per partition becomes visible.' }
    ],
    commit: [
      { trigger: 'A task attempt finishes writing its output.', steps: ['The attempt wrote to a private staging path.', 'It asks the commit coordinator for permission.', 'The first request for a partition is authorized, later ones are denied.', 'The winner promotes its output to the final location.'], edges: ['The authorized attempt dies before promoting: the partition is retried.', 'Denied attempts must clean their staging files.'], invariant: 'At most one attempt per partition is promoted.' },
      { trigger: 'All partitions report committed.', steps: ['The driver checks every partition is promoted.', 'It writes the readiness marker last.', 'Readers consult the marker, not the directory listing.', 'On failure the marker is absent and the output is treated as incomplete.'], edges: ['Object stores cannot rename atomically, so files appear one by one.', 'A reader that lists files may see a partial result.'], invariant: 'Readiness is a separate fact from file existence.' }
    ],
    sql: [
      { trigger: 'A user submits a query or DataFrame action.', steps: ['Parse into an unresolved logical plan.', 'Resolve names and types against the catalog.', 'Rewrite: prune columns, push down filters, fold constants.', 'Choose physical operators and insert exchanges where distribution demands.'], edges: ['An opaque UDF blocks pushdown and pruning.', 'Stale statistics lead to a poor strategy, not a wrong answer.'], invariant: 'Every rewrite preserves query semantics.' },
      { trigger: 'The planner meets an aggregate.', steps: ['Check the child distribution against the grouping keys.', 'If aligned, aggregate in place.', 'Otherwise aggregate partially per task.', 'Exchange by key hash and finish with a final aggregate.'], edges: ['A non-decomposable aggregate cannot use partial state.', 'Too few shuffle partitions create big tasks, too many create tiny ones.'], invariant: 'Partial plus final equals the single-stage answer.' }
    ],
    joins: [
      { trigger: 'One side of an equi-join is small.', steps: ['The driver collects the small side.', 'It builds a hash table and broadcasts it.', 'Each executor streams its fact partitions through the table.', 'Matches are emitted with full multiplicity.'], edges: ['The small side is not small: the broadcast exceeds memory.', 'Some outer join types cannot broadcast the preserved side.'], invariant: 'Matching rows appear m × n times per key.' },
      { trigger: 'Neither side is small.', steps: ['Exchange both sides by key hash.', 'Each reducer holds the matching partitions of both.', 'Build a hash table from one side, or sort and merge.', 'Probe with the other side and emit matches.'], edges: ['A hot key puts many rows in one reducer.', 'Null keys never match under standard equi-join semantics.'], invariant: 'Equal keys always land in the same reducer.' }
    ],
    adaptive: [
      { trigger: 'A shuffle map stage completes.', steps: ['Collect output size per reducer partition.', 'Merge neighbouring small partitions up to the target size.', 'Detect partitions far above the median.', 'Launch the reduce stage with the new layout.'], edges: ['Coalescing past a required partition count changes semantics for some operators.', 'Statistics lag if a stage is cached.'], invariant: 'Layout changes never change the answer.' },
      { trigger: 'One join key is hot.', steps: ['Find the oversized partition on the skewed side.', 'Split it into ranges using map output boundaries.', 'Replicate the matching partition of the other side to each range.', 'Join each pair locally and union the results.'], edges: ['Splitting the preserved side of an outer join is not allowed.', 'Replicating a large other side costs more than the skew.'], invariant: 'Each match is produced once.' }
    ],
    evidence: [
      { trigger: 'A task ends.', steps: ['The scheduler emits a task-end event with metrics.', 'The listener bus fans it out.', 'The log writer appends it asynchronously.', 'The live status store updates counters.'], edges: ['A slow disk must not block scheduling.', 'Very large jobs need metric sampling.'], invariant: 'Logging never changes scheduling decisions.' },
      { trigger: 'Someone opens a finished application.', steps: ['The history server finds the log.', 'It reads events in order.', 'It rebuilds jobs, stages, tasks and the final plan.', 'The same views as live are shown.'], edges: ['An incomplete log (driver died) is flagged, not trusted.', 'Retention may have already deleted the log.'], invariant: 'Replaying the log reproduces the live view.' }
    ],
    build: [
      { trigger: 'You set the animation controls.', steps: ['Read the 12-row input as partitions.', 'Run the pull pipeline and map-side combine.', 'Shuffle, spill and merge under the chosen memory.', 'Optionally lose an executor and replay.', 'Publish winners and print the answer and trace.'], edges: ['Zero rows still produces a valid empty result.', 'Invalid options are rejected, not silently clamped.'], invariant: 'The total is 640 under every setting.' }
    ]
  };
  for (const [id, list] of Object.entries(X)) list.forEach((x, i) => Object.assign(D[id].uc[i], x));
  const ST = root.SparkStories || (typeof require === 'function' ? require('./engine-stories.js') : {});
  for (const [key, story] of Object.entries(ST)) { const [id, n] = key.split(':'); Object.assign(D[id].uc[n - 1], story); }

  let loading;
  function loadMermaid() {
    if (root.mermaid) return Promise.resolve(root.mermaid);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
      s.onload = () => root.mermaid ? resolve(root.mermaid) : reject(new Error('mermaid missing'));
      s.onerror = () => { loading = null; reject(new Error('mermaid failed to load')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  /* Mermaid cannot read CSS variables, so resolve the site palette (pastel fills, ink outlines, mono labels) at draw time. */
  function themeVars() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const ink = v('--ink'), card = v('--card'), line = v('--line');
    return { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: '13px', background: card, primaryColor: v('--p0'), primaryBorderColor: ink, primaryTextColor: ink,
      secondaryColor: v('--p1'), secondaryBorderColor: ink, secondaryTextColor: ink, tertiaryColor: v('--p2'), tertiaryBorderColor: ink, tertiaryTextColor: ink,
      lineColor: ink, textColor: ink, mainBkg: v('--p0'), nodeBorder: ink, clusterBkg: v('--soft'), clusterBorder: line, edgeLabelBackground: card, titleColor: ink,
      actorBkg: v('--p0'), actorBorder: ink, actorTextColor: ink, actorLineColor: line, signalColor: ink, signalTextColor: ink, labelBoxBkgColor: v('--p4'), labelBoxBorderColor: ink, labelTextColor: ink,
      noteBkgColor: v('--p4'), noteBorderColor: ink, noteTextColor: ink, activationBkgColor: v('--p2'), activationBorderColor: ink, sequenceNumberColor: card,
      stateBkg: v('--p2'), stateLabelColor: ink, altBackground: v('--soft') };
  }
  /* A diamond grows with its label width, so wrap long decision labels onto several short lines to keep it small. */
  const wrapDecisions = src => src.replace(/\{"([^"]*)"\}/g, (m, t) => {
    if (t.includes('<br')) return m;
    const lines = []; let cur = '';
    for (const w of t.split(' ')) { if (cur && (cur + ' ' + w).length > 16) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) lines.push(cur);
    return '{"' + lines.join('<br/>') + '"}';
  });
  let counter = 0;
  async function draw(container) {
    const nodes = [...container.querySelectorAll('[data-mermaid]:not([data-drawn])')];
    if (!nodes.length) return;
    let m;
    try { m = await loadMermaid(); } catch (e) {
      for (const n of nodes) n.insertAdjacentHTML('beforebegin', '<p class="diagram-offline">Diagram renderer unavailable offline. Showing the Mermaid source.</p>');
      return;
    }
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVars(), flowchart: { htmlLabels: true, curve: 'basis', padding: 8 }, sequence: { useMaxWidth: true, mirrorActors: false } });
    for (const n of nodes) {
      const src = wrapDecisions(n.querySelector('pre').textContent);
      try {
        const { svg } = await m.render('mmd-' + (++counter), src);
        if (!n.isConnected) continue;
        n.innerHTML = svg; n.setAttribute('data-drawn', '1');
      } catch (e) {
        n.setAttribute('data-drawn', 'error');
        n.insertAdjacentHTML('beforebegin', '<p class="diagram-offline">This diagram could not be rendered. Showing its source.</p>');
        document.getElementById('d' + counter)?.remove();
      }
    }
  }
  const has = id => Object.prototype.hasOwnProperty.call(D, id);
  const animated = new Set(Object.keys(D).filter(k => D[k].hard));
  const order = Object.keys(META);
  root.SparkSystemDesign = { draw, has, animated, order, data: D, diagram, table, list, esc };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkSystemDesign;
})(typeof globalThis !== 'undefined' ? globalThis : this);
