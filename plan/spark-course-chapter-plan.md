# Apache Spark Course Chapter Plan (11 chapters)

## Objective
Rewrite `techstack/spark/01-spark-internals-end-to-end.html` in the problem-based format of `plan/problem-based-course-spec.md`. The course follows one job: 2 TB of daily order logs give revenue per city by 6 AM, on 50 machines, with failures. Pin Spark 3.5.

## Source coverage
- **Docs:** spark.apache.org/docs/latest/
  - rdd-programming-guide.html (transformations, actions, persistence, shuffle operations)
  - configuration.html
  - tuning.html (memory management)
  - sql-performance-tuning.html (AQE, join hints, file partition settings)
  - web-ui.html
  - monitoring.html (event log, history server)
  - cloud-integration.html (object-store committers)
  - sql-data-sources-csv.html and sql-data-sources-json.html
- **Source code** (apache/spark, verify at tag v3.5.x before citing):
  - core/…/rdd/RDD.scala and Dependency.scala
  - core/…/scheduler/DAGScheduler.scala, TaskSchedulerImpl.scala and TaskSetManager.scala
  - core/…/shuffle/sort/SortShuffleManager.scala
  - core/…/storage/ShuffleBlockFetcherIterator.scala
  - core/…/memory/UnifiedMemoryManager.scala
  - core/…/scheduler/EventLoggingListener.scala
  - core/…/internal/io/FileCommitProtocol.scala
  - sql/core/…/execution/datasources/FilePartition.scala
  - sql/core/…/execution/adaptive/AdaptiveSparkPlanExec.scala
  - sql/core/…/execution/joins/BroadcastHashJoinExec.scala and SortMergeJoinExec.scala
  - sql/core/…/execution/WholeStageCodegenExec.scala
- **Hadoop:** LineRecordReader (it skips the first partial line).

## Design constraints
- The count of 11 comes from the 8 old chapters plus three chapters split out of old "Shuffle & reduce" and the "Deploy on PROD" panel: skew/AQE, join strategy, and executor memory. Each is its own mechanism with its own production failures already listed on the old page.
- Order: reading → planning → scheduling → per-task execution → data exchange → its tuning → output → observability. Each chapter uses only earlier ones.
- `archSteps` is used only in ch3.

## Chapters

### ch0 · Read Source (`s:'files · splits · partitions'`, pg `splits`)
- **Source:** sql-performance-tuning (`spark.sql.files.maxPartitionBytes`, `spark.sql.files.openCostInBytes`); FilePartition.scala; Hadoop LineRecordReader.
- **Problem:** The 2 TB log is cut into equal byte ranges for 50 machines. The row count is off by thousands and some rows hold half a line.
- **Predict:** "A line starts in split 0 and ends 30 bytes into split 1. Who decodes it?"
  - Options: both / split 0 / split 1.
  - Answer: split 0.
- **Core idea:** Cut by bytes for parallelism; the split where a line starts owns it.
- **Mechanism:**
  - source descriptor and the split list;
  - the line reader skips its leading fragment and reads past its end;
  - the decoder handles malformed records;
  - bin-packing of small files (`maxPartitionBytes` 128 MB, `openCostInBytes`);
  - gzip is not splittable.
- **Playground:**
  - Data: a fixed 40-line file of varied lengths.
  - Controls: slider for split count 1–12; seg for boundary rule (naive byte cut / start-owns-line); seg for codec (plain / gzip).
  - Stats: partitions, rows decoded, rows lost or corrupt, largest partition (bytes), parallel tasks usable.
  - Visual: the byte strip with cut marks, and lines coloured by owner.
- **Common:**
  1. Too many small files: listing and open cost dominate (old incident).
  2. One huge gzip file gives one task (old incident).
  3. Malformed lines silently become nulls under the default `mode` `PERMISSIVE`. Fix: `columnNameOfCorruptRecord`, or `FAILFAST` in pipelines.

### ch1 · Build Lineage (`s:'lazy · RDD graph · persist'`, pg `lineage`)
- **Source:** rdd-programming-guide (lazy transformations, RDD persistence, checkpointing); RDD.scala and Dependency.scala.
- **Problem:** A notebook "computes" `filter → map` instantly, then each of two reports re-reads 2 TB.
- **Predict:** "Before any action, how many source records were read?"
  - Answer: 0.
- **Core idea:** A transformation returns an immutable recipe (lineage), not data.
- **Mechanism:**
  - RDD node `{partitions, deps, compute}`;
  - narrow versus shuffle dependencies (named here, used in ch2);
  - actions trigger evaluation;
  - `cache()`/`persist(StorageLevel)`, `checkpoint()`.
- **Playground:**
  - Controls: toggle steps on the chain (filter, map, reduceByKey); seg for eager / lazy; toggle `cache` after map; a "Run action" button pressed 1–3 times.
  - Stats: records read from source, full copies materialised, source scans, lineage depth.
- **Common:**
  1. The same source is scanned twice by two actions (old incident). Fix: persist once.
  2. Iterative loop lineage grows each iteration; planning slows down and a `StackOverflowError` follows. Fix: `checkpoint()`/`localCheckpoint()`.
  3. A cached dataset does not fit `MEMORY_ONLY`. Partitions silently recompute; the Storage tab shows "Fraction Cached" < 100%. Fix: `MEMORY_AND_DISK` or a smaller projection.

### ch2 · Plan Stages (`s:'DAGScheduler · narrow · shuffle'`, pg `stages`)
- **Source:** DAGScheduler.scala; rdd-programming-guide "Shuffle operations"; web-ui (DAG visualization).
- **Problem:** The action fires. The team cannot explain why the UI shows 3 stages for a 4-line job, or which steps wait.
- **Predict:** "How many stages does `read → filter → map → reduceByKey → count` produce?"
  - Answer: 2.
- **Core idea:** Walk back from the final RDD. Narrow dependencies stay in the stage; each shuffle dependency cuts a parent stage.
- **Mechanism:**
  - ShuffleMapStage versus ResultStage;
  - stage boundaries at wide operations (reduceByKey, groupByKey, join, repartition, distinct);
  - co-partitioned joins avoid a shuffle;
  - tasks per stage equal its partitions.
- **Playground:**
  - Controls: a pipeline builder of 6 slots, each picking an operator from map, filter, reduceByKey, groupByKey, join, repartition, coalesce; toggle "join inputs share a partitioner".
  - Stats: stages, shuffle boundaries, tasks per stage, shuffled records (illustrative).
  - Visual: the stage graph drawn with `diagram()`.
- **Common:**
  1. `groupByKey` where `reduceByKey` fits: every value crosses the network and one key's list can exhaust memory.
  2. `repartition(n)` used to shrink before a write adds a full shuffle. Fix: `coalesce(n)`.
  3. `coalesce(1)` without a shuffle collapses the whole upstream stage to one task. Fix: `repartition(1)` or a smaller final reduction.

### ch3 · Schedule Tasks and Retries (`s:'driver · task sets · retries'`, pg `scheduler`, uses archSteps)
- **Source:** TaskSchedulerImpl.scala and TaskSetManager.scala; configuration (`spark.task.maxFailures`, `spark.speculation`, `spark.locality.wait`, `spark.shuffle.service.enabled`, `spark.excludeOnFailure.enabled`).
- **Problem:** 50 executors, 16,000 tasks (illustrative), and one machine dies at minute 40. On-call must know what reruns.
- **Predict:** "An executor dies after the map stage finished and its map outputs were on its disk. What reruns?"
  - Answer: the lost map tasks (FetchFailed → resubmit), then the reducers.
- **Core idea:** The driver alone holds the state: TaskSets go to free slots, failed attempts are retried, and a stage opens only after its parents succeed.
- **Mechanism:**
  - DAGScheduler → TaskScheduler → SchedulerBackend → executors;
  - task attempts and `maxFailures`;
  - FetchFailed resubmits the parent stage;
  - speculation;
  - locality levels;
  - an external shuffle service keeps blocks when the executor process dies.
- **archSteps modes:** "healthy run" and "executor lost after map stage".
- **Playground:**
  - Controls: slider for executors 2–8; slider for tasks 8–40; slider for kill time; seg for shuffle service on/off; toggle speculation; slider for one slow node factor.
  - Player timeline.
  - Stats: makespan (ticks), task attempts, stages resubmitted, slot utilisation %.
- **Common:**
  1. Executor lost → `FetchFailedException` → map stage reruns (old incident).
  2. One straggler holds the stage. Fix: speculation (`spark.speculation`, `spark.speculation.multiplier`).
  3. "Job aborted due to stage failure: Task N in stage S failed 4 times": a deterministic bug retried until `spark.task.maxFailures`.
  4. Cores idle while tasks wait for data locality (`spark.locality.wait`, default 3s).

### ch4 · Run Narrow Tasks (`s:'iterators · fused closures · codegen'`, pg `pipeline`)
- **Source:** RDD.scala (`iterator`/`compute`, MapPartitionsRDD); WholeStageCodegenExec.scala; rdd-programming-guide (closures).
- **Problem:** A task holding a 128 MB partition runs out of memory although each step "only" filters and maps.
- **Predict:** "The filter drops 5 of 8 rows. How many times does map run?"
  - Answer: 3.
- **Core idea:** Narrow functions compose into one pull-based iterator chain, so a row flows through all steps before the next row is read.
- **Mechanism:**
  - iterator chaining in one task;
  - nothing is materialised between steps;
  - whole-stage codegen fuses operators for DataFrames;
  - closures are serialised to executors.
- **Playground:**
  - Controls: seg for pull-iterator / materialise-per-step; slider for filter selectivity; Step/Play over 12 rows.
  - Stats: map calls, peak rows held, rows emitted, intermediate lists created.
- **Common:**
  1. An expensive setup per row (a DB connection inside `map`). Fix: `mapPartitions` with one connection per partition.
  2. `mapPartitions` code calls `iterator.toList`, which materialises the whole partition → OOM.
  3. Row-at-a-time Python UDF serialisation overhead. Fix: `pandas_udf` with Arrow (`spark.sql.execution.arrow.pyspark.enabled`).

### ch5 · Shuffle Write and Read (`s:'hash partitioning · combine · fetch'`, pg `shuffle`)
- **Source:** rdd-programming-guide "Shuffle operations"; SortShuffleManager.scala and ShuffleBlockFetcherIterator.scala; configuration (`spark.sql.shuffle.partitions`, `spark.reducer.maxSizeInFlight`, `spark.local.dir`).
- **Problem:** Revenue per city: each city's rows are spread over all partitions. A naive "send everything to the driver" plan dies.
- **Predict:** "With map-side combine, a map task holds 8 (city, amount) pairs over 3 cities. How many shuffle records does it write?"
  - Answer: 3.
- **Core idea:** Each map task hashes keys into R reduce partitions and writes one block per destination. Reducers fetch their block from every map output.
- **Mechanism:**
  - hash partitioner;
  - map-side combine;
  - sort-based shuffle files and index;
  - M×R blocks;
  - fetch;
  - spill to `spark.local.dir`;
  - the "partitions / parallelism" settings from the old Deploy-on-PROD panel.
- **Playground:**
  - Controls: slider for map tasks 2–6; slider for reduce partitions 2–8; toggle map-side combine; seg for dataset size (small / large).
  - Stats: shuffle records, shuffle bytes, blocks (M×R), per-reducer bytes (bars), average partition size vs 128 MB target.
- **Common:**
  1. The default `spark.sql.shuffle.partitions=200` does not fit the data: 2 TB gives about 10 GB partitions, while 50 MB gives 200 tiny tasks.
  2. "No space left on device" in `spark.local.dir` from shuffle and spill files.
  3. Too many tiny shuffle blocks (huge M×R) make fetch-request overhead dominate.

### ch6 · Skew and Adaptive Query Execution (`s:'hot keys · AQE · salting'`, pg `skew`)
- **Source:** sql-performance-tuning "Adaptive Query Execution": `spark.sql.adaptive.enabled`, `…coalescePartitions.enabled`, `…advisoryPartitionSizeInBytes`, `…skewJoin.enabled`, `…skewJoin.skewedPartitionFactor`, `…skewJoin.skewedPartitionThresholdInBytes`; AdaptiveSparkPlanExec.scala. Verify the defaults for 3.5.
- **Problem:** 199 of 200 reducers finish in a minute; one runs 2 hours (illustrative) for the "unknown" city.
- **Predict:** "Will raising shuffle partitions from 200 to 2000 fix one hot key?"
  - Answer: no, all rows of a key still hash to one partition.
- **Core idea:** Measure the actual shuffle sizes at runtime, then coalesce small partitions and split skewed join partitions. Salt keys where AQE cannot help.
- **Mechanism:**
  - runtime shuffle statistics;
  - coalesce;
  - skew-join split with replication of the other side;
  - two-phase salted aggregation.
- **Playground:**
  - Controls: seg for key distribution (uniform / Zipf / one hot key); toggle AQE coalesce; toggle skew join; slider for salt buckets 1–8; seg for operation (join / groupBy).
  - Stats: max/median task bytes, stage time = slowest task, task count.
  - Visual: per-reducer bars.
- **Common:**
  1. A hot join key holds the stage open (old incident).
  2. A skewed `groupBy` aggregation: AQE skew-join handling does not apply. Fix: two-phase salted aggregation.
  3. NULL join keys pile into one partition. Fix: filter or handle nulls before the join.

### ch7 · Join Strategies (`s:'broadcast · sort-merge · hints'`, pg `joins`)
- **Source:** sql-performance-tuning (join strategy hints, `spark.sql.autoBroadcastJoinThreshold` with a 10 MB default, `spark.sql.broadcastTimeout`); BroadcastHashJoinExec and SortMergeJoinExec.
- **Problem:** A 2 TB fact table is joined to a 5 MB city table, and both sides are shuffled (old incident).
- **Predict:** "A filtered dimension is 4 MB, but the table statistics say 4 GB. What does the planner pick?"
  - Answer: sort-merge (it plans from the estimate).
- **Core idea:** Ship the small side to every executor (broadcast) or co-partition both sides (sort-merge). The choice comes from size estimates and hints.
- **Mechanism:**
  - BroadcastHashJoin, ShuffledHashJoin, SortMergeJoin;
  - the threshold;
  - statistics and `ANALYZE TABLE … COMPUTE STATISTICS`;
  - hints `BROADCAST`/`MERGE`/`SHUFFLE_HASH`;
  - AQE may switch to broadcast at runtime.
- **Playground:**
  - Controls: slider for left size; slider for right size; slider for threshold; toggle "statistics accurate / stale"; seg for hint.
  - Stats: chosen strategy, bytes shuffled, bytes broadcast × executors, driver memory for the broadcast, risk badge.
- **Common:**
  1. A large shuffle for a small join side (old incident).
  2. Broadcasting a side that is actually huge leads to driver OOM or "Could not execute broadcast in 300 secs". Fix: correct stats or the hint, or raise `spark.sql.broadcastTimeout` only after measuring.
  3. Duplicate keys on both sides (many-to-many) make the output explode. Detect them with key-count checks before the join.

### ch8 · Executor Memory and Spill (`s:'unified memory · cores · overhead'`, pg `memory`)
- **Source:** tuning.html "Memory Management Overview"; configuration (`spark.executor.memory`, `spark.executor.cores`, `spark.executor.instances`, `spark.memory.fraction` (0.6), `spark.memory.storageFraction` (0.5), `spark.executor.memoryOverhead` (max(384 MiB, 0.10 × executor memory))); UnifiedMemoryManager.scala (300 MB reserved).
- **Problem:** The nightly job now logs huge "Spill (Disk)" and then `java.lang.OutOfMemoryError`. Executors are 16 GB, 4 cores, with 2 GB partitions (old incident).
- **Predict:** "Doubling `spark.executor.cores` with the same memory makes per-task execution memory…"
  - Answer: halve.
- **Core idea:** Concurrent tasks share one executor's unified execution and storage pool. Partition size must fit memory per task, or the task spills.
- **Mechanism:**
  - (heap − 300 MB) × fraction shared by cores;
  - execution can borrow from storage;
  - spill;
  - container overhead outside the heap;
  - executor count/cores/memory trade-offs (the old Deploy-on-PROD resources panel).
- **Playground:**
  - Controls: sliders for executor memory, cores, `memory.fraction`, partition size; toggle Python workers.
  - Stats: memory per task, spill bytes, OOM risk badge, container total (heap + overhead).
  - Label it a simplified model.
- **Common:**
  1. Large partitions lead to spill or OOM (old incident).
  2. The container is killed for exceeding memory limits (YARN message or Kubernetes `OOMKilled`, exit code 137). The cause is off-heap or Python memory. Fix: `spark.executor.memoryOverhead`.
  3. Long GC pauses in a huge heap shared by many cores. Fix: smaller executors, and check GC time in the Executors tab.

### ch9 · Action Results and Output Commit (`s:'collect · write · commit protocol'`, pg `commit`)
- **Source:** FileCommitProtocol.scala and HadoopMapReduceCommitProtocol; cloud-integration.html (committers); configuration (`spark.driver.maxResultSize`, `spark.driver.memory`, `spark.sql.sources.partitionOverwriteMode`, `spark.sql.files.maxRecordsPerFile`).
- **Problem:** Tasks finish in random order and some run twice (speculation). Yesterday's output had duplicate rows and a half-written folder.
- **Predict:** "With a commit protocol, when can a downstream reader first see output files?"
  - Answer: only after job commit.
- **Core idea:** Merge results by partition index, not arrival order. Writes go to per-attempt temporary paths and are published once at job commit.
- **Mechanism:**
  - count, collect and write sinks;
  - task commit and job commit;
  - `_SUCCESS`;
  - result-size cap.
- **Playground:**
  - Controls: slider for tasks; toggle duplicate speculative attempt; seg for sink (count / collect / write); seg for write mode (direct / commit protocol); a button to kill the job mid-write.
  - Stats: rows in result, duplicate files visible, partial files visible, bytes to driver.
- **Common:**
  1. `collect()` overwhelms the driver: "Total size of serialized results … is bigger than spark.driver.maxResultSize" (old incident).
  2. Thousands of tiny output files (old incident).
  3. An `INSERT OVERWRITE` of one partition wipes all partitions in static mode. Fix: `partitionOverwriteMode=dynamic`.
  4. Rename-based commit on an object store is slow or unsafe. Fix: S3A committers (cloud-integration).

### ch10 · Events, UI and Explain (`s:'listener bus · event log · explain'`, pg `events`)
- **Source:** monitoring.html (`spark.eventLog.enabled`, `spark.eventLog.dir`, history server, `spark.eventLog.rolling.enabled`); web-ui.html; EventLoggingListener.scala; `Dataset.explain("formatted")`.
- **Problem:** Last night's job took 3 h instead of 20 min. The application is gone. Find out why.
- **Predict:** "Where does the UI's 'failed tasks: 1' count come from after the app has ended?"
  - Answer: replayed `SparkListenerTaskEnd` events in the event log.
- **Core idea:** The driver emits one ordered stream of lifecycle events. The UI, the history server and the metrics are all folds over it, and `explain` prints plans from metadata.
- **Mechanism:**
  - LiveListenerBus;
  - events (JobStart, StageSubmitted, TaskEnd, StageCompleted);
  - event log;
  - history server;
  - explain modes;
  - AQE `isFinalPlan`.
- **Playground:**
  - Data: a fixed event stream (about 30 events) of one slow job.
  - Controls: a scrubber; seg for the fold (per stage / per executor / slowest tasks); toggle event log enabled.
  - Stats: stage durations, retries, max/median task time, spill.
  - With logging off, the history view is empty.
- **Common:**
  1. No event log, so the history server shows nothing after the app ends.
  2. Huge single event logs make the history server slow. Fix: rolling and compaction settings.
  3. `explain()` before execution shows `AdaptiveSparkPlan isFinalPlan=false`, and the team tunes the wrong plan. Read the final plan in the SQL tab.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 Read source + incidents small files, gzip | ch0 |
| ch1 Build lineage + incident re-scan | ch1 |
| ch2 Plan stages | ch2 |
| ch3 Schedule tasks + incident executor lost | ch3 |
| ch4 Run narrow tasks | ch4 |
| ch5 Shuffle & reduce | ch5 (mechanics) |
| ch5 incidents: hot key / spill-OOM / small join side | ch6 / ch8 / ch7 |
| ch6 Action result + incidents collect, tiny files | ch9 |
| ch7 Events & explain | ch10 |
| Deploy on PROD: resources (instances, cores, driver) | ch8 (executors), ch9 (driver memory, maxResultSize) |
| Deploy on PROD: memory (fraction) | ch8 |
| Deploy on PROD: partitions/parallelism | ch5 |
| Deploy on PROD: AQE | ch6 |
| STORY.problem (2 TB, 50 machines, the "musts", naive thread pool) | COURSE.lead + ch0 scene |
| per-chapter v0 / design / predict / build steps | scene / idea / predict / idea bullets |
| "Trace a request" overview | ch3 archSteps |

## Dropped or merged, and why
- **"Use your own data" panel** (user CSV/JSON input): dropped. Playgrounds must be deterministic and reviewable.
- **Free-form job template editor:** merged into the ch2 pipeline builder.
- **F01–F17 feature tags:** dropped (internal labels with no meaning for the learner).
