/* Spark system-design specification and feature contracts. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  "id": "spark",
  "name": "Apache Spark",
  "version": "3.5",
  "root": "../../",
  "brand": "var(--acc2)",
  "footer": "A finite batch engine model grounded in Spark 3.5. Capacity numbers are stated assumptions, not measurements. Real transport, disk I/O and transactional table storage are extension boundaries."
};
CourseData.spec = {
  "title": "Design a distributed batch engine",
  "navTitle": "Distributed batch engine",
  "lead": "Run a computation over data that no single machine can hold, finish within a deadline, and survive losing machines on the way. This page is the whole system on one screen. Each feature below zooms into one subsystem.",
  "problemLead": "More machines do not automatically form an engine. We need to decide who plans work, who executes it, where data lives, and how those components communicate.",
  "inherited": "We have an immutable file of orders and a question: paid revenue per city.",
  "goal": "Run a computation over data that no single machine can hold, finish within a deadline, and survive losing machines on the way.",
  "scope": [
    "In scope: finite batch jobs, partitioned input, shuffle, retry, result publication.",
    "Out of scope: cluster-wide resource arbitration (delegated to a cluster manager), continuous streaming, multi-tenant security."
  ],
  "fr": [
    "Accept a lazy computation graph and an action; return a job handle.",
    "Split work into partitions and run one task attempt per partition on executor slots.",
    "Move intermediate data between executors without routing it through the coordinator.",
    "Retry failed attempts and recompute lost intermediate output from lineage.",
    "Expose status, cancellation and a durable record of what ran."
  ],
  "nfr": [
    "<b>Correctness:</b> result independent of placement, partition count and retries for deterministic code.",
    "<b>Throughput:</b> scale with workers until storage or network saturates.",
    "<b>Availability:</b> executor loss costs time, not the job. Driver loss ends the application.",
    "<b>Bounded coordinator:</b> driver memory grows with metadata (tasks, blocks), not with data."
  ],
  "contracts": [
    [
      "Driver",
      "{ graph, stages, taskAttempts, mapOutputs }",
      "Owns the application’s scheduling decisions and recovery metadata."
    ],
    [
      "Executor",
      "{ executorId, slots, localBlocks }",
      "Runs partition attempts and serves available local data."
    ],
    [
      "TaskAttempt",
      "{ stageId, partitionId, attemptId, recipe }",
      "A retry changes attempt identity, not logical output identity."
    ],
    [
      "Messages",
      "control: register / launch / complete; data: read / fetch",
      "Metadata and bulk records have different routes and costs."
    ]
  ],
  "est": [
    [
      "Rows",
      "1,000 GB ÷ 1 KB ≈ 1 billion",
      "Never collect source rows on the driver."
    ],
    [
      "Aggregate scan rate",
      "1,000,000 MB ÷ 1,200 s ≈ 833 MB/s",
      "Storage must sustain this aggregate rate."
    ],
    [
      "Slots needed (lower bound)",
      "ceil(833 ÷ 50) = 17",
      "Scan only. No startup, shuffle or retries."
    ],
    [
      "Partitions",
      "ceil(1,000,000 ÷ 256) = 3,907",
      "256 MB is a planning target, not a law."
    ],
    [
      "Cluster shape",
      "16 executors × 4 slots = 64 slots",
      "Executors are processes. Partitions are work. They are different numbers."
    ],
    [
      "Scan waves",
      "ceil(3,907 ÷ 64) = 62 → ~317 s",
      "Uniform-work assumption. Skew and retries add time."
    ],
    [
      "Scheduler metadata",
      "3,907 × 2 KB ≈ 7.8 MB",
      "Tiny now. Grows with tasks, not bytes."
    ]
  ],
  "estAssume": "Reference job: scan 1 TB (1 KB rows) in 20 minutes. One task sustains 50 MB/s. Decimal units.",
  "estNote": "Budget, not promise: scan (~5.3 min) plus an exchange of 30% of input (~2 min) fits in 20 minutes with headroom. Benchmark the slowest partition before accepting the target.",
  "hldNote": "Dashed arrows are control metadata. Thick arrows are data. The driver never sits on a thick arrow.",
  "decisions": [
    [
      "Who schedules tasks?",
      "One driver per application",
      "Isolated state. Driver failure ends that application."
    ],
    [
      "When does work start?",
      "Lazy graph, evaluated by an action",
      "No unrequested work. Needs readiness tracking."
    ],
    [
      "Where does bulk data move?",
      "Worker to worker and worker to store",
      "No central funnel. Needs a block-location protocol."
    ],
    [
      "How is lost work recovered?",
      "Recompute from lineage and immutable input",
      "No replicated intermediates. Replay costs time."
    ]
  ],
  "verify": [
    "Facts were written from knowledge of Spark 3.5. Web searches in the build environment returned mostly secondary sources, so this course has not been checked against Spark's source or its configuration page.",
    "Defaults to check against the Spark configuration page for your version: <code>spark.locality.wait</code> (3s), <code>spark.task.maxFailures</code> (4), <code>spark.shuffle.sort.bypassMergeThreshold</code> (200), <code>spark.shuffle.readHostLocalDisk</code> (true), <code>spark.shuffle.io.maxRetries</code> (3) and <code>retryWait</code> (5s), <code>spark.sql.shuffle.partitions</code> (200), <code>spark.sql.autoBroadcastJoinThreshold</code> (10 MB), <code>spark.scheduler.listenerbus.eventqueue.capacity</code> (10000), <code>spark.ui.retainedStages</code> (1000), <code>spark.excludeOnFailure.enabled</code> (off).",
    "Numbers in the estimates and pictures are stated assumptions or examples, not measurements."
  ]
};
CourseData.features = [
  {
    "id": "read",
    "tag": "Read",
    "name": "Input & partitions",
    "summary": "Turn files into replayable work without cutting a record.",
    "goal": "Turn a pile of files into independent, replayable units of work whose boundaries never cut a record in half.",
    "scope": [
      "In scope: file discovery, split planning, record ownership at boundaries, replay of a split.",
      "Out of scope: table formats with transactional snapshots, schema evolution."
    ],
    "fr": [
      "List input files and produce a set of read ranges (splits).",
      "Assign every record to exactly one split, including records that straddle a boundary.",
      "Re-read any split and get the same records (replay).",
      "Pack many small files into fewer tasks."
    ],
    "nfr": [
      "<b>Parallelism:</b> enough splits to keep every slot busy.",
      "<b>Low planning cost:</b> listing and planning must not dominate small jobs.",
      "<b>Determinism:</b> same snapshot gives the same splits and records."
    ],
    "decisions": [
      [
        "Who owns a straddling record?",
        "The split where the record starts",
        "Previous split reads past its end. Next split skips the partial head."
      ],
      [
        "Compressed files?",
        "Split only if the codec allows restart points",
        "Else one task per file."
      ],
      [
        "Many small files?",
        "Pack until a byte target",
        "Fewer tasks, less locality precision."
      ]
    ],
    "hldCaption": "Splits are byte ranges. Records are owned by the format-aware reader, not by the byte cut.",
    "problem": "An equal byte cut can land inside a record. A reader that stops exactly at that cut can drop or corrupt it; a compressed stream may not allow a restart there at all.",
    "inherited": "We know which processes read shared input.",
    "contracts": [
      [
        "Partition",
        "{ id, startByte, endByte }",
        "A scheduling range is distinct from a complete-record boundary."
      ],
      [
        "Reader",
        "read(partition) → Iterator&lt;Record&gt;",
        "For this newline-delimited text, the owner of a record’s start finishes it."
      ]
    ]
  },
  {
    "id": "pipeline",
    "tag": "Stream",
    "name": "Pull pipeline",
    "summary": "Run narrow operators with a handful of rows in memory.",
    "goal": "Run read, filter and map inside one task while holding a handful of rows, not a whole partition.",
    "scope": [
      "In scope: iterator composition of narrow operators, resource lifetime.",
      "Out of scope: stateful operators (sort, aggregate), which need their own budget."
    ],
    "fr": [
      "Compose operators so the consumer pulls one result at a time.",
      "Reject rows early without calling downstream operators.",
      "Close readers on exhaustion, failure and cancellation."
    ],
    "nfr": [
      "<b>Memory:</b> independent of row count for stateless chains.",
      "<b>Safety:</b> a retry repeats only pure work."
    ],
    "decisions": [
      [
        "Materialize each stage?",
        "No: pull",
        "Peak memory independent of partition size."
      ],
      [
        "Who closes the reader?",
        "The task attempt",
        "Closing at iterator creation breaks later pulls."
      ]
    ],
    "hldCaption": "Demand flows left to right (dashed). Rows flow back (thick). All inside one task: no network hop.",
    "problem": "Materializing the output of every filter and map makes memory grow with partition size. We need downstream demand to pull only the next useful result.",
    "inherited": "Each read partition can produce complete records.",
    "contracts": [
      [
        "Operator",
        "iterator.next() → record | done",
        "Demand flows upstream; surviving records flow downstream."
      ],
      [
        "Partition resource",
        "acquire → consume → close",
        "Keep it alive until consumption finishes, fails or is cancelled."
      ]
    ]
  },
  {
    "id": "lineage",
    "tag": "Recipe",
    "name": "Lineage & cache",
    "summary": "Describe work lazily, reuse blocks, cut long recipes.",
    "goal": "Describe work without doing it, remember how to rebuild any partition, and keep reusable results without unbounded storage.",
    "scope": [
      "In scope: lazy graph, persistence, eviction, checkpointing.",
      "Out of scope: cross-application caches."
    ],
    "fr": [
      "Record each transformation and its parent dependencies without running it.",
      "Cache chosen partitions and serve later actions from them.",
      "Rebuild an evicted or lost partition from its parents.",
      "Truncate lineage by checkpointing to reliable storage."
    ],
    "nfr": [
      "<b>Bounded storage:</b> cache never exceeds its memory share.",
      "<b>Correctness:</b> cache hit and recompute return the same rows."
    ],
    "decisions": [
      [
        "Eager or lazy?",
        "Lazy",
        "No unused work. Needs a graph."
      ],
      [
        "Replicate cache?",
        "Optional",
        "Faster loss recovery, double storage."
      ],
      [
        "Truncate lineage?",
        "Checkpoint",
        "Bounded replay, extra write."
      ]
    ],
    "hldCaption": "Each node knows its parents, not its data. The block manager holds whatever is resident.",
    "problem": "Running every transformation eagerly wastes unused work. Retaining only output locations leaves no recovery recipe when those outputs disappear.",
    "inherited": "We can compute a narrow partition pipeline.",
    "contracts": [
      [
        "RDD",
        "{ id, partitions, parent, dependency, compute }",
        "A transformation describes how a partition can be computed."
      ],
      [
        "Block identity",
        "RDD id + partition id",
        "Lookup reuses an available block; absence follows lineage."
      ],
      [
        "Reliable checkpoint",
        "durable result + severed parents",
        "Only sever the dependency after durable materialization."
      ]
    ]
  },
  {
    "id": "stages",
    "tag": "Stages",
    "name": "Stage planning",
    "summary": "Cut the graph at shuffle barriers and gate readiness.",
    "goal": "Decide which work can start now, which must wait, and how many tasks each piece needs.",
    "scope": [
      "In scope: dependency walk, stage cuts at shuffle boundaries, readiness.",
      "Out of scope: SQL-level planning (chapter 11)."
    ],
    "fr": [
      "Walk back from the action to find parent stages.",
      "Cut a stage wherever a wide dependency needs data from many parents.",
      "Run a stage only when all required parent outputs are available.",
      "Set task count per stage from partitions, not from slots."
    ],
    "nfr": [
      "<b>No premature reads:</b> a reducer never starts on partial map output.",
      "<b>Reuse:</b> a shared parent stage runs once."
    ],
    "decisions": [
      [
        "Where to cut?",
        "At every wide dependency",
        "Correct by construction. Some barriers can be avoided by co-partitioning."
      ],
      [
        "Task count?",
        "One per output partition",
        "Independent of cluster size."
      ]
    ],
    "hldCaption": "Narrow operators stay inside a stage. Each shuffle edge is a barrier.",
    "problem": "A same-key sum needs contributions from many parent partitions. The planner must separate independent producer work from consumers that cannot run yet.",
    "inherited": "An action can request partitions through a lazy graph.",
    "contracts": [
      [
        "Narrow dependency",
        "child partition → known parent partitions",
        "Can be pulled inside the same task pipeline."
      ],
      [
        "Shuffle dependency",
        "child reducer → producer output ranges",
        "Required producer outputs must be available."
      ],
      [
        "Stage",
        "{ id, dependencies, requiredPartitions, status }",
        "Waiting → runnable → running → complete; output loss can invalidate readiness."
      ]
    ]
  },
  {
    "id": "schedule",
    "tag": "Tasks",
    "name": "Task scheduling",
    "summary": "Keep every executor slot busy before failures exist.",
    "goal": "Keep every executor slot busy with ready tasks, and learn their outcomes, before worrying about failures.",
    "scope": [
      "In scope: registration, dispatch, status loop, locality wait, attempt retries, cores per task.",
      "Out of scope: recovery of lost map outputs (recovery page), cross-application fairness."
    ],
    "fr": [
      "Track executors and their free slots.",
      "Offer slots to the next runnable task set and launch tasks.",
      "Receive status, free the slot, offer again.",
      "Prefer data-local slots, but not forever.",
      "Retry a failed attempt until a fixed limit is reached."
    ],
    "nfr": [
      "<b>Utilization:</b> no slot idle while a task is ready.",
      "<b>Dispatch rate:</b> driver handles launch and completion messages fast enough."
    ],
    "decisions": [
      [
        "Push or pull?",
        "Executors register, driver offers",
        "Driver stays authoritative on slot use."
      ],
      [
        "Wait for locality?",
        "Bounded wait",
        "Trades short delay for fewer remote reads."
      ]
    ],
    "hldCaption": "Offers go down, statuses come up. The planner never talks to executors directly.",
    "problem": "There may be more ready partitions than execution slots. We need a normal launch/completion loop before adding failure handling.",
    "inherited": "The stage planner knows which partition tasks are ready.",
    "contracts": [
      [
        "Task state",
        "pending → running(slot, attempt) → complete",
        "One active non-speculative attempt consumes one slot."
      ],
      [
        "Launch envelope",
        "{ stage, partition, attempt, serializedRecipe }",
        "The executor must have the code and inputs needed for that attempt."
      ],
      [
        "Completion",
        "{ taskId, attemptId, resultOrOutputLocation }",
        "Validate identity, accept completion and free the slot."
      ]
    ]
  },
  {
    "id": "shuffle",
    "tag": "Exchange",
    "name": "Shuffle exchange",
    "summary": "Bring same-key records together without a central funnel.",
    "goal": "Bring together all records that share a key, which start on different executors, without a central funnel.",
    "scope": [
      "In scope: map-side partial state, indexed output file, range fetch.",
      "Out of scope: external shuffle service deployment details."
    ],
    "fr": [
      "Each map task writes one output split by reducer id.",
      "Register block locations with the driver.",
      "Each reducer fetches its range from every map output.",
      "Combine partial state on both sides when the operation allows."
    ],
    "nfr": [
      "<b>Bounded:</b> in-flight fetch bytes and requests are capped.",
      "<b>Correct:</b> aggregation equals the no-shuffle answer.",
      "<b>Efficient:</b> avoid millions of tiny reads."
    ],
    "decisions": [
      [
        "Many files or one?",
        "One data file + index per map",
        "Avoids M × R files."
      ],
      [
        "Fetch strategy?",
        "Parallel, capped by bytes and requests",
        "Bounds memory and connection count."
      ],
      [
        "Where do blocks live?",
        "Executor disk",
        "Lost with the executor unless a shuffle service holds them."
      ]
    ],
    "hldCaption": "Map tasks write local files. The driver only knows where ranges are, never what is in them.",
    "problem": "Same-city records begin on different readers. We need to move their contributions together while preserving the aggregation result and avoiding a driver bottleneck.",
    "inherited": "Partition tasks can execute on available slots.",
    "contracts": [
      [
        "Partitioner",
        "destination(key) → reducer id",
        "Equal keys route consistently."
      ],
      [
        "MapOutput",
        "{ mapId, attemptId, executor, data, index[] }",
        "index[r]..index[r+1] identifies reducer r’s logical range."
      ],
      [
        "Aggregate state",
        "create / mergeValue / mergeStates",
        "Local combine must preserve the operation’s algebra."
      ]
    ]
  },
  {
    "id": "memory",
    "tag": "Spill",
    "name": "Memory & spill",
    "summary": "Hold more state than memory and keep the answer.",
    "goal": "Let a task work on more state than fits in memory, and keep the answer identical.",
    "scope": [
      "In scope: execution memory accounting, spill, merge.",
      "Out of scope: JVM garbage collection tuning, off-heap allocators."
    ],
    "fr": [
      "Account for execution memory per task.",
      "Spill sorted runs to local disk when a grant is refused.",
      "Merge runs back into a single ordered result.",
      "Share memory fairly among active tasks."
    ],
    "nfr": [
      "<b>Bounded:</b> a task never holds more than its grant.",
      "<b>Correct:</b> spilling never changes the result.",
      "<b>Diagnosable:</b> spill volume is a visible metric."
    ],
    "decisions": [
      [
        "Who decides memory?",
        "A per-executor manager with a fair share",
        "Prevents one task starving others."
      ],
      [
        "Spill format?",
        "Sorted runs",
        "Merge is a streaming k-way pass."
      ]
    ],
    "hldCaption": "Spill is the escape path when a grant request is refused. The merge restores one answer.",
    "problem": "A map’s sorting or aggregation state can exceed local memory. We need a spillable structure whose answer survives releasing its working buffer.",
    "inherited": "Shuffle output must be sorted and indexed.",
    "contracts": [
      [
        "Managed buffer",
        "{ grantedCapacity, currentEntries, peakEntries }",
        "Accept new state only within the current grant or spill first."
      ],
      [
        "Spill run",
        "sorted entries + decoder metadata",
        "Once safely written, its in-memory buffer can be released."
      ],
      [
        "Merge reader",
        "bounded cursors over sorted runs",
        "Merge every valid partial state without loading all disk runs at once."
      ]
    ]
  },
  {
    "id": "recovery",
    "tag": "Recover",
    "name": "Failure recovery",
    "summary": "Replay only the lost work and race stragglers safely.",
    "goal": "Finish the job after a worker dies, without redoing work that survived.",
    "scope": [
      "In scope: task retry, fetch failure, producer replay, speculation.",
      "Out of scope: driver failover."
    ],
    "fr": [
      "Retry a failed task attempt a bounded number of times.",
      "On fetch failure, invalidate lost outputs and re-run only their producers.",
      "Launch a duplicate of a straggler (speculation) and accept the first success.",
      "Track every attempt separately."
    ],
    "nfr": [
      "<b>Minimal replay:</b> surviving outputs are reused.",
      "<b>Safety:</b> duplicates cannot corrupt results.",
      "<b>Bounded:</b> retries have a ceiling."
    ],
    "decisions": [
      [
        "Retry the reducer?",
        "Only after the input exists again",
        "Retrying against a dead location is wasted."
      ],
      [
        "Replicate shuffle?",
        "No, recompute",
        "Cheaper in steady state."
      ]
    ],
    "hldCaption": "Failure handling is a decision about which class of failure it is, then which dependency to restore.",
    "problem": "A host can lose several completed outputs at once. Retrying a reducer against that dead location cannot recreate its missing input.",
    "inherited": "Maps publish local outputs and reducers know their locations.",
    "contracts": [
      [
        "Output registry",
        "mapId → { executor, attempt, available }",
        "Completion and reachability are separate facts."
      ],
      [
        "Attempt history",
        "logical task → attempt 0, attempt 1, …",
        "Recovery and speculation preserve logical task identity."
      ],
      [
        "Fetch failure",
        "{ shuffle, map, reducer, missingLocation }",
        "A missing producer must become available before dependent work succeeds."
      ]
    ]
  },
  {
    "id": "commit",
    "tag": "Publish",
    "name": "Output commit",
    "summary": "Show a result only when it is complete and single-winner.",
    "goal": "Make a result visible only when it is complete and made of exactly one winner per partition.",
    "scope": [
      "In scope: attempt winners, staged output, visibility, readiness.",
      "Out of scope: table-format transactions beyond what the sink provides."
    ],
    "fr": [
      "Each attempt writes to a private location.",
      "Exactly one attempt per partition is promoted.",
      "The job publishes a completion marker only when all partitions are promoted.",
      "Readers consult the marker, not the directory listing."
    ],
    "nfr": [
      "<b>No partial results</b> presented as complete.",
      "<b>No duplicates</b> from retries or speculation.",
      "<b>Bounded commit time</b> on the target store."
    ],
    "decisions": [
      [
        "Who picks the winner?",
        "A coordinator at the driver",
        "First authorized attempt wins; late ones are refused."
      ],
      [
        "How do readers know?",
        "Readiness marker, written last",
        "Listing files alone can show partials."
      ]
    ],
    "hldCaption": "Winner selection and job readiness are separate steps. Readers trust the marker.",
    "problem": "Writing directly to final paths can expose partial files or duplicate attempts. Choosing one task winner still cannot make many object publications one atomic transaction.",
    "inherited": "Retries and speculative attempts can compute one partition more than once.",
    "contracts": [
      [
        "Attempt output",
        "{ partition, attempt, privateArtifacts }",
        "Keep competing attempts isolated until authorization."
      ],
      [
        "Task commit",
        "one accepted attempt per logical partition",
        "Duplicate computation must not become duplicate logical output."
      ],
      [
        "Dataset readiness",
        "completion policy or committed snapshot",
        "Readers must know whether the full dataset is valid."
      ]
    ]
  },
  {
    "id": "sql",
    "tag": "SQL",
    "name": "SQL planner",
    "summary": "Turn declarative queries into inspectable physical work.",
    "goal": "Let users say what they want, and let the engine pick how, using an inspectable plan.",
    "scope": [
      "In scope: analyze, optimize, physical plan, lowering to tasks.",
      "Out of scope: full SQL grammar, UDF compilation."
    ],
    "fr": [
      "Parse a query into a logical plan.",
      "Resolve names and types against a catalog.",
      "Rewrite for cost: prune columns, push filters.",
      "Choose physical operators with distribution requirements; lower to stages."
    ],
    "nfr": [
      "<b>Inspectable:</b> every plan can be printed.",
      "<b>Semantics-preserving:</b> rewrites never change results."
    ],
    "decisions": [
      [
        "Opaque function or expression?",
        "Expression",
        "Visible to rewrites."
      ],
      [
        "Cost or rule based?",
        "Rules first, statistics for strategy",
        "Predictable, then improved by evidence."
      ]
    ],
    "hldCaption": "Each arrow produces a new, printable plan. Statistics only influence physical choices.",
    "problem": "Opaque functions tell an engine what code to run, but hide which columns and predicates can be simplified. A SQL layer needs an inspectable plan and physical properties.",
    "inherited": "The batch runtime can read, stream, exchange, recover and publish.",
    "contracts": [
      [
        "Logical plan",
        "relation + schema + expressions",
        "Analyze names/types before selecting physical work."
      ],
      [
        "Physical operator",
        "{ requiredDistribution, requiredOrdering, outputProperties }",
        "Insert an exchange or sort only where properties require it."
      ],
      [
        "Encoder",
        "typed JVM object ↔ SQL row",
        "Dataset types provide a programming contract, not a universal speed guarantee."
      ]
    ]
  },
  {
    "id": "joins",
    "tag": "Join",
    "name": "Join strategies",
    "summary": "Make matching records meet at the cheapest cost.",
    "goal": "Make matching records meet, using the cheapest data movement that fits memory.",
    "scope": [
      "In scope: broadcast, shuffled hash, sort-merge, outer-join semantics.",
      "Out of scope: non-equi joins."
    ],
    "fr": [
      "Join a large fact relation to another relation on a key.",
      "Choose a strategy from size and properties.",
      "Preserve match multiplicity and outer-join semantics."
    ],
    "nfr": [
      "<b>Correct multiplicity:</b> m × n matches per key.",
      "<b>Bounded build side:</b> a hash table must fit its grant."
    ],
    "decisions": [
      [
        "Broadcast?",
        "Only if tiny and the join type allows it",
        "Outer-join side restrictions apply."
      ],
      [
        "Hash or sort-merge?",
        "Hash if the build fits",
        "Sort-merge is robust but costs a sort."
      ]
    ],
    "hldCaption": "Strategy follows size, existing distribution and memory, and always keeps join semantics.",
    "problem": "Paid orders and city regions may live on different workers. A correct join needs matching records to meet, but replicating an entire relation can exceed local capacity.",
    "inherited": "A physical plan can express distribution and ordering requirements.",
    "contracts": [
      [
        "Broadcast hash join",
        "replicated build relation + streamed probes",
        "Every task can access matching build rows locally."
      ],
      [
        "Sort-merge join",
        "aligned key partitions + ordered streams",
        "Corresponding tasks receive and merge both key ranges."
      ],
      [
        "Shuffled hash join",
        "aligned partitions + per-task hash build",
        "The local build partition, not the full relation, must fit."
      ]
    ]
  },
  {
    "id": "adaptive",
    "tag": "Adapt",
    "name": "Adaptive execution",
    "summary": "Re-plan from real sizes and split hot keys correctly.",
    "goal": "Use what actually happened at an exchange to fix partition counts, joins and skew, which estimates could not predict.",
    "scope": [
      "In scope: post-shuffle statistics, coalescing, skew split, salting.",
      "Out of scope: cost-based global reordering."
    ],
    "fr": [
      "Collect map output sizes per reducer partition.",
      "Merge small neighbouring partitions up to a target size.",
      "Split an oversized partition into sub-ranges that still join correctly.",
      "Decompose hot aggregation keys with valid partial state."
    ],
    "nfr": [
      "<b>Correctness:</b> adaptation never changes the answer.",
      "<b>Cheap:</b> decisions use already-collected statistics."
    ],
    "decisions": [
      [
        "Plan when?",
        "At the stage boundary",
        "Statistics are actual, not guessed."
      ],
      [
        "Split how?",
        "By map output ranges",
        "No new shuffle needed."
      ]
    ],
    "hldCaption": "Planning is re-run at the barrier, where the real numbers become available.",
    "problem": "Estimates cannot predict every partition size. One hot key can dominate while other tasks finish; fixing that imbalance must still preserve matches or aggregate state.",
    "inherited": "The planner can choose exchange and join strategies.",
    "contracts": [
      [
        "Runtime statistics",
        "materialized exchange → actual partition sizes",
        "Adapt eligible remaining work; completed work still costs."
      ],
      [
        "Skew join piece",
        "split range + required counterpart",
        "Every valid join match receives both inputs."
      ],
      [
        "Salted aggregate",
        "(key, subkey) partial → original key merge",
        "Partial-state decomposition preserves the original operation."
      ]
    ]
  },
  {
    "id": "evidence",
    "tag": "Evidence",
    "name": "Execution evidence",
    "summary": "Keep enough history to explain a run after it ends.",
    "goal": "Keep enough of what actually ran to explain a slow or failed job after the driver is gone.",
    "scope": [
      "In scope: event log, metrics, history replay, final plans.",
      "Out of scope: long-term analytics warehouse."
    ],
    "fr": [
      "Record job, stage and task lifecycle events.",
      "Attribute metrics (time, bytes, spill) to tasks and stages.",
      "Persist the final plan including runtime changes.",
      "Replay the log into a history view."
    ],
    "nfr": [
      "<b>Low overhead:</b> logging does not slow tasks noticeably.",
      "<b>Bounded:</b> retention and size are controlled."
    ],
    "decisions": [
      [
        "Sync or async logging?",
        "Asynchronous",
        "Never block scheduling on disk."
      ],
      [
        "What to keep?",
        "Events and final plan",
        "Not data."
      ]
    ],
    "hldCaption": "One stream of events feeds both the live view and the durable log.",
    "problem": "Source code and final files cannot explain every retry, spill or strategy choice. Once the driver stops, unrecorded decisions disappear.",
    "inherited": "Tasks, output availability and runtime planning can change during execution.",
    "contracts": [
      [
        "Event",
        "{ sequence, type, detail, metrics }",
        "Reported evidence has an identity and retention policy."
      ],
      [
        "Event sink",
        "append → durable log",
        "Capture during execution; missing events cannot be recreated later."
      ],
      [
        "History reader",
        "retained log → reconstructed views",
        "Replay evidence without contacting old workers or rerunning work."
      ]
    ]
  },
  {
    "id": "build",
    "tag": "Build",
    "name": "End-to-end build",
    "summary": "Prove the parts fit with one engine whose answer never changes.",
    "goal": "Prove the parts fit: run one engine whose answer is unchanged by every scheduling, spill, replay and publication choice.",
    "scope": [
      "In scope: the 12-row reference engine and its invariants.",
      "Out of scope: real network, real disks, real SQL compiler."
    ],
    "fr": [
      "Run read → filter → map → shuffle → aggregate → publish end to end.",
      "Accept settings for partitions, slots, memory, combine, executor loss.",
      "Report the same total under every setting."
    ],
    "nfr": [
      "<b>Deterministic:</b> same inputs give the same trace.",
      "<b>Honest:</b> the model states what it does not simulate."
    ],
    "decisions": [
      [
        "What to run?",
        "The same model as the animations",
        "Explanations and code cannot drift apart."
      ],
      [
        "Failure input?",
        "Explicit toggles",
        "Reproducible, not random."
      ]
    ],
    "hldCaption": "Every chapter&#39;s mechanism is one box. The dashed path is recovery.",
    "problem": "Independent explanations do not prove that an engine fits together. The completed reference must preserve the query answer across scheduling, spill, replay and publication choices.",
    "inherited": "Every chapter supplies a component contract and a verification criterion.",
    "contracts": [
      [
        "Application",
        "paid orders → map city/amount → reduce sum → sink",
        "For default input: HN=220, HUE=210, SG=210; total=640."
      ],
      [
        "Invariant",
        "same input + same query → same logical answer",
        "Distribution and recovery choices change work, not contributions."
      ],
      [
        "Reference limits",
        "in-process calls, arrays modeling blocks, small planner",
        "Real RPC, bounded disk I/O, JVM codegen, driver HA and transactions are extensions."
      ]
    ]
  }
];
CourseData.hldOverall = "flowchart LR\n  Dev[\"Developer API\"] -->|\"graph + action\"| Drv[\"Driver<br/>plans, schedules, tracks outputs\"]\n  Drv -. \"resource request\" .-> CM[\"Cluster manager\"]\n  CM -. \"grants executors\" .-> Ex\n  Drv -. \"task descriptions\" .-> Ex[\"Executors x16<br/>4 slots each\"]\n  Ex -. \"status, block locations\" .-> Drv\n  In[(\"Input store\")] ==>|\"bulk reads\"| Ex\n  Ex <==>|\"shuffle ranges\"| Ex\n  Ex ==>|\"result files\"| Out[(\"Output store\")]";
CourseData.hld = {
  "read": "flowchart LR\n  Snap[\"Input snapshot<br/>file list + sizes\"] --> Plan[\"Split planner\"]\n  Plan --> P1[\"Split 0<br/>bytes 0..N\"]\n  Plan --> P2[\"Split 1<br/>bytes N..2N\"]\n  Plan --> P3[\"Packed small files\"]\n  P1 --> R[\"Format-aware reader\"]\n  P2 --> R\n  P3 --> R\n  R --> Rec[\"Whole records<br/>exactly once\"]",
  "pipeline": "flowchart LR\n  Sink[\"Consumer\"] -. \"next()\" .-> M[\"map\"]\n  M -. \"next()\" .-> F[\"filter\"]\n  F -. \"next()\" .-> R[\"reader\"]\n  R ==>|\"row\"| F\n  F ==>|\"passing row\"| M\n  M ==>|\"pair\"| Sink",
  "lineage": "flowchart LR\n  A[\"RDD A<br/>read\"] --> B[\"RDD B<br/>filter\"]\n  B --> C[\"RDD C<br/>map<br/>persist\"]\n  C --> D[\"RDD D<br/>reduceByKey\"]\n  C -.-> BM[(\"Block manager<br/>cached partitions\")]\n  D -->|\"action\"| Job[\"Job\"]\n  CP[(\"Reliable storage<br/>checkpoint\")] -.-> C",
  "stages": "flowchart LR\n  subgraph S0[\"Stage 0 · 3,907 tasks\"]\n    A[\"read\"] --> B[\"filter\"] --> C[\"map\"]\n  end\n  subgraph S1[\"Stage 1 · 128 tasks\"]\n    D[\"reduce\"] --> E[\"map\"]\n  end\n  subgraph S2[\"Stage 2 · 128 tasks\"]\n    F[\"reduce\"]\n  end\n  C ==>|\"shuffle 1\"| D\n  E ==>|\"shuffle 2\"| F",
  "schedule": "flowchart LR\n  Dag[\"Stage planner\"] -->|\"task set\"| TS[\"Task scheduler<br/>queue + locality\"]\n  TS -->|\"resource offers\"| BE[\"Scheduler backend\"]\n  BE -. \"launch\" .-> E1[\"Executor 1<br/>4 slots\"]\n  BE -. \"launch\" .-> E2[\"Executor 2<br/>4 slots\"]\n  E1 -. \"status\" .-> BE\n  E2 -. \"status\" .-> BE\n  BE --> TS",
  "shuffle": "flowchart LR\n  subgraph Maps[\"Map tasks\"]\n    M1[\"Map 0<br/>combine + partition\"]\n    M2[\"Map 1\"]\n  end\n  M1 --> F1[(\"Data file + index<br/>local disk\")]\n  M2 --> F2[(\"Data file + index\")]\n  M1 -. \"register locations\" .-> Drv[\"Driver<br/>map output tracker\"]\n  Drv -. \"where is range r?\" .-> R1\n  F1 ==>|\"range 0\"| R1[\"Reduce 0\"]\n  F2 ==>|\"range 0\"| R1\n  F1 ==>|\"range 1\"| R2[\"Reduce 1\"]\n  F2 ==>|\"range 1\"| R2",
  "memory": "flowchart LR\n  T[\"Task<br/>aggregation map\"] -->|\"request grant\"| MM[\"Memory manager<br/>per-task fair share\"]\n  MM -->|\"granted\"| T\n  MM -->|\"refused\"| Sp[\"Spill: sort + write run\"]\n  Sp --> D[(\"Local disk<br/>sorted runs\")]\n  T --> Mg[\"Merge iterator\"]\n  D --> Mg\n  Mg --> Out[\"Final ordered output\"]",
  "recovery": "flowchart LR\n  Ex[\"Executor lost\"] --> Drv[\"Driver<br/>invalidate outputs on that executor\"]\n  Drv --> St[\"Stage: resubmit<br/>missing producer tasks\"]\n  St --> Re[\"Recompute from<br/>lineage + immutable input\"]\n  Re --> Reg[\"Register new block locations\"]\n  Reg --> Cons[\"Waiting reducers retry\"]",
  "commit": "flowchart LR\n  T1[\"Attempt 0 of p0\"] --> S1[(\"Staging\")]\n  T2[\"Attempt 1 of p0\"] --> S1\n  Drv[\"Driver<br/>commit coordinator\"] -. \"authorize one\" .-> T1\n  S1 --> Pro[\"Promote winner\"]\n  Pro --> Fin[(\"Final location\")]\n  Pro --> Mk[\"Readiness marker<br/>written last\"]\n  Mk -.-> Rd[\"Readers\"]\n  Fin -.-> Rd",
  "sql": "flowchart LR\n  Q[\"Query text or DataFrame\"] --> P[\"Parse\"]\n  P --> A[\"Analyze<br/>resolve columns and types\"]\n  A --> O[\"Optimize<br/>prune, push, fold\"]\n  O --> Ph[\"Physical planning<br/>pick operators + distribution\"]\n  Ph --> L[\"Lower to RDD stages\"]\n  L --> Ex[\"Tasks run\"]\n  Cat[(\"Catalog + statistics\")] -.-> A\n  Cat -.-> Ph",
  "joins": "flowchart TD\n  Q[\"Join request\"] --> S{\"Either side under broadcast threshold?\"}\n  S -- \"yes\" --> B[\"Broadcast hash join\"]\n  S -- \"no\" --> P{\"Sorted or co-partitioned?\"}\n  P -- \"yes\" --> M[\"Local merge, no exchange\"]\n  P -- \"no\" --> H{\"Build side fits per-partition memory?\"}\n  H -- \"yes\" --> HJ[\"Shuffled hash join\"]\n  H -- \"no\" --> SM[\"Sort-merge join with spill\"]",
  "adaptive": "flowchart LR\n  M[\"Map stage done\"] --> St[\"Per-partition byte sizes\"]\n  St --> D{\"Many tiny partitions?\"}\n  D -- \"yes\" --> C[\"Coalesce neighbours\"]\n  St --> K{\"One partition much larger than median?\"}\n  K -- \"yes\" --> S[\"Split into sub-partitions\"]\n  C --> N[\"Reduce stage with new plan\"]\n  S --> N\n  K -- \"no\" --> N",
  "evidence": "flowchart LR\n  Sch[\"Scheduler\"] -->|\"events\"| Bus[\"Event bus\"]\n  Bus --> L[\"Event log writer\"]\n  Bus --> UI[\"Live status store\"]\n  L --> FS[(\"Durable storage\")]\n  FS --> H[\"History server<br/>replays log\"]\n  Ex[\"Executors\"] -. \"task metrics\" .-> Sch",
  "build": "flowchart LR\n  In[\"Input (12 rows)\"] --> R[\"Read partitions\"]\n  R --> P[\"Pull pipeline\"]\n  P --> Sh[\"Shuffle + combine\"]\n  Sh --> Sp[\"Spill + merge\"]\n  Sp --> Ag[\"Aggregate\"]\n  Ag --> Pub[\"Publish winner attempts\"]\n  Pub --> Ans[\"City sums, total 640\"]\n  Loss[\"Executor loss\"] -.-> Sh\n  Loss -.-> Rec[\"Replay lost outputs\"]\n  Rec -.-> Ag"
};
