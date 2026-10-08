/* Problem-based course data for Apache Spark. Written from the original CHAPTERS and COURSE in techstack/spark/01-spark-internals-end-to-end.html. Numbers marked illustrative are not measurements. */
window.COURSE = {
  name: 'Apache Spark',
  kick: '11 chapters · problem-based · Apache Spark 3.5',
  lead: `Every night 2 TB of order logs must become revenue per city by 6 AM, on 50 machines where something always fails. Each chapter starts from one production symptom, asks you to predict, shows the mechanism in a small deterministic simulation, and ends with real failure cases to diagnose.`,
  chapters: [
  {
    title: 'Read Source',
    problem: `The nightly job reads about <b>2 TB</b> of order logs (illustrative) across 50 machines. The first version cuts the files into equal byte ranges, one per task. The report runs, but its row count is a few thousand off the order database (illustrative), and some rows hold half a city name. Nothing crashed, so nobody looked.`,
    predict: {
      q: `A log line starts in split 0 and ends 30 bytes into split 1. Which split decodes the whole line?`,
      opts: [`Both splits, so the line is counted twice`, `Split 0, because the line starts there`, `Split 1, because the line ends there`],
      ans: 1,
      why: `A byte-range reader owns the lines that <b>start</b> inside its range. Split 0 reads past its end to finish the line, and split 1 skips its leading fragment.`
    },
    explain: `<h3>The idea</h3>
<p>Spark cuts each input file into splits by bytes, so many machines can read at once. A byte cut almost never lands on a line break. So every split needs one rule for which lines it owns: the split where a line <b>starts</b> owns that line.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>File index</b> lists the files and cuts them into splits of at most <code>spark.sql.files.maxPartitionBytes</code> (128 MB by default). Each split becomes one partition and one task.</li>
<li><b>Line reader</b> (Hadoop LineRecordReader for text formats) makes every split after the first skip its partial first line. Then it keeps reading until the line it started ends.</li>
<li><b>Decoder</b> turns each line into a row. Under the default <code>PERMISSIVE</code> mode, a line that does not parse becomes a row with nulls instead of an error.</li>
<li><b>Small files</b> are packed together up to the size limit. Each file is charged <code>spark.sql.files.openCostInBytes</code> (4 MB by default), so thousands of tiny files do not all land in one task.</li>
</ol>
<h3>The trade-off</h3>
<p>Byte splits give parallelism only where the format allows it. A gzip stream has no safe restart point, so a <code>.gz</code> file is read as one split. The lenient default keeps the job alive, but it also hides bad lines. Count the nulls on purpose, or use <code>FAILFAST</code>.</p>
<h3>What to look for</h3>
<p>Compare the listing time in the driver log with the first task launch. Compare the output row count with the source system. Count rows where every field is null, because under PERMISSIVE a bad line shows up only as nulls.</p>`,
    diagnose: [
      {
        t: `Millions of small files`,
        sym: `Stage 0 shows a huge task count, and the job spends its first minutes before any task runs.`,
        ctx: `An upstream collector flushes every few seconds, so a day is millions of files of tens of KB each (illustrative). The 2 TB total is unchanged, but the read stage is slow and the driver is busy.`,
        why: `Listing files on an object store and opening each one costs time per file, not per byte. Packing fixes the task count, not the listing and open overhead.`,
        log: `-- representative output, values illustrative
INFO InMemoryFileIndex: It took 1480231 ms to list leaf files for 1 paths.
INFO FileSourceStrategy: Pushed Filters: IsNotNull(city)
[Stage 0:>                                (0 + 800) / 96000]`,
        note: `The listing line is logged on the driver before any task starts. Compare the listing time with the first task launch in the Jobs tab.`,
        fix: [
          `Measure first: read the listing time in the driver log, and count the files per day.`,
          `Fix: compact upstream, or flush less often and write larger files.`,
          `Fix: write the day partitioned by hour, so a job lists only the prefixes it needs.`,
          `Verify: the stage 0 task count is near total size ÷ 128 MB, and the listing line drops from minutes to seconds.`
        ]
      },
      {
        t: `One huge gzip file gives one task`,
        sym: `Stage 0 shows <code>(0 + 1) / 1</code>. 49 executors are idle while one reads for hours.`,
        ctx: `A partner delivers the whole day as a single 400 GB <code>orders.json.gz</code> (illustrative).`,
        why: `gzip is a stream with no safe restart points, so a reader cannot jump to byte N. Spark cannot split it and runs one task for the whole file.`,
        log: `-- representative output, values illustrative
[Stage 0:>                                              (0 + 1) / 1]
Executors: 50 active, 1 task running`,
        note: `One partition means one task, whatever the cluster size.`,
        fix: [
          `Measure first: check the file extension and the task count of stage 0.`,
          `Fix: ask the producer for many files, each compressed separately, so each file is one task.`,
          `Fix: convert once to a splittable format (Parquet, ORC) or a splittable codec, then read that.`,
          `Verify: stage 0 task count is far above 1, and executor CPU is spread evenly.`
        ]
      },
      {
        t: `Malformed lines silently become nulls`,
        sym: `The job succeeds, but revenue is lower than the ledger, and some rows have every column null.`,
        ctx: `A new app version writes a bad separator in 0.3% of lines (illustrative). The pipeline never failed, so nobody looked.`,
        why: `The CSV and JSON readers default to <code>mode=PERMISSIVE</code>. A line that does not fit the schema is kept, with fields set to null, instead of raising an error.`,
        log: `-- representative output, values illustrative
rows in source lines   : 41,200,000
rows with city IS NULL : 123,600
(no error, no warning in the driver log)`,
        note: `Compare the source line count with the non-null row count.`,
        fix: [
          `Measure first: count rows where every field is null, and compare with the source line count.`,
          `Fix: in pipelines use <code>.option("mode","FAILFAST")</code> so a bad line stops the job.`,
          `Fix: or add a string column and set <code>columnNameOfCorruptRecord</code> (the column must be in the schema), then route those rows to a quarantine table.`,
          `Verify: the corrupt-row count is reported on every run, and the job fails or alerts when it is above zero.`
        ]
      }
    ],
    source: { label: `Original: Read Source`, href: `01-spark-internals-end-to-end.html#ch0` },
    scenarios: [
      {
        id: `byte-cut`,
        label: `Cut at byte 128 MB`,
        desc: `A byte cut lands inside line 90. Watch which split decodes it, and what the output looks like.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `# 2 TB of order logs, cut into byte ranges`,
            `split_0 = bytes[0 : 128 MB]`,
            `split_1 = bytes[128 MB : 256 MB]`,
            `# each task decodes only its own bytes`,
            `rows = decode(split_k)   # line 90 is cut here`
          ],
          fix: [
            `# a split owns the lines that START inside it`,
            `# split 0 reads past 128 MB to finish its last line`,
            `# split 1 skips its partial first line`,
            `spark.sql.files.maxPartitionBytes = 134217728  # 128 MB`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `file`, x: 20, y: 120, w: 160, h: 56, t: `Log file`, s: `2 TB, line per order` },
            { id: `s0`, x: 240, y: 20, w: 160, h: 56, t: `Split 0`, s: `bytes 0 to 128 MB` },
            { id: `s1`, x: 240, y: 220, w: 160, h: 56, t: `Split 1`, s: `bytes 128 to 256 MB` },
            { id: `r0`, x: 460, y: 20, w: 160, h: 56, t: `Rows, split 0`, s: `half a city name` },
            { id: `r1`, x: 460, y: 220, w: 160, h: 56, t: `Rows, split 1`, s: `a stray number tail` }
          ],
          edges: [
            { id: `e1`, a: `file`, b: `s0`, label: `bytes 0-128` },
            { id: `e2`, a: `file`, b: `s1`, label: `bytes 128+` },
            { id: `e3`, a: `s0`, b: `r0`, label: `decode` },
            { id: `e4`, a: `s1`, b: `r1`, label: `decode` }
          ]
        },
        bug: [
          { log: `The 2 TB is cut into byte ranges of 128 MB, about 16,000 splits (illustrative).`, code: 1, hl: { nodes: { file: `on`, s0: `on`, s1: `on` }, edges: { e1: `on`, e2: `on` } }, stats: [{ l: `Splits`, v: `≈16,000` }] },
          { log: `Line 90 starts in split 0 and ends 30 bytes into split 1 (illustrative).`, code: 4, hl: { nodes: { s0: `warn`, s1: `warn` } } },
          { log: `Each split decodes only its own bytes, so split 0 keeps half a city name and split 1 keeps the tail.`, code: 4, hl: { nodes: { r0: `bad`, r1: `bad` }, edges: { e3: `bad`, e4: `bad` } }, stats: [{ l: `Broken rows`, v: `a few thousand`, cls: `bad` }] },
          { log: `No error is raised. The row count is off, and some rows are not valid orders.`, code: 4, hl: { nodes: { r0: `bad`, r1: `bad` } }, stats: [{ l: `Job status`, v: `succeeded`, cls: `warn` }] }
        ],
        fix: [
          { log: `The split list stays the same, but each split now owns the lines that start inside it.`, code: 0, hl: { nodes: { s0: `ok`, s1: `ok` }, edges: { e1: `ok`, e2: `ok` } } },
          { log: `Split 0 reads past 128 MB to finish line 90 (illustrative).`, code: 1, hl: { nodes: { s0: `ok` } } },
          { log: `Split 1 skips its first partial line, because split 0 already owns it.`, code: 2, hl: { nodes: { s1: `ok` } } },
          { log: `Each line is decoded once, so the row count matches the source (illustrative).`, code: 3, hl: { nodes: { r0: `ok`, r1: `ok` }, edges: { e3: `ok`, e4: `ok` } }, stats: [{ l: `Lines decoded twice`, v: `0`, cls: `ok` }] }
        ]
      },
      {
        id: `gzip-one-task`,
        label: `One gzip file`,
        desc: `A gzip file cannot be cut at a byte, so the whole partner file becomes one task.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `# one partner file, 400 GB, gzip-compressed`,
            `df = spark.read.json("s3://partner/2026-10-07/orders.json.gz")`,
            `# gzip cannot restart mid-stream, so there is no split`,
            `# stage 0 shows (0 + 1) / 1`
          ],
          fix: [
            `# ask the producer for many files, each gzip-compressed alone`,
            `df = spark.read.json("s3://partner/2026-10-07/part-*.json.gz")`,
            `# one split per file: about 3,200 files give about 3,200 tasks`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `src`, x: 20, y: 20, w: 160, h: 56, t: `orders.json.gz`, s: `400 GB, one file` },
            { id: `idx`, x: 240, y: 20, w: 160, h: 56, t: `File index`, s: `gzip: not splittable` },
            { id: `t1`, x: 460, y: 20, w: 160, h: 56, t: `Task 1`, s: `reads 400 GB alone` },
            { id: `many`, x: 20, y: 220, w: 160, h: 56, t: `Many .gz files`, s: `3,200 files` },
            { id: `fan`, x: 240, y: 220, w: 160, h: 56, t: `Tasks`, s: `one per file` },
            { id: `ex`, x: 460, y: 220, w: 160, h: 56, t: `Executors 2-50`, s: `idle or busy` }
          ],
          edges: [
            { id: `a`, a: `src`, b: `idx`, label: `one file` },
            { id: `b`, a: `idx`, b: `t1`, label: `one split` },
            { id: `c`, a: `idx`, b: `ex`, label: `no split` },
            { id: `d`, a: `many`, b: `fan`, label: `read` },
            { id: `e`, a: `fan`, b: `ex`, label: `spread` }
          ]
        },
        bug: [
          { log: `The job reads one 400 GB gzip file (illustrative).`, code: 1, hl: { nodes: { src: `on` }, edges: { a: `on` } }, stats: [{ l: `Input files`, v: `1` }] },
          { log: `The file index cannot cut a gzip stream, so it makes one split.`, code: 2, hl: { nodes: { idx: `warn` }, edges: { b: `warn`, c: `dim` } }, stats: [{ l: `Tasks`, v: `1`, cls: `bad` }] },
          { log: `One task reads 400 GB while the other 49 executors wait.`, code: 3, hl: { nodes: { t1: `bad`, ex: `dim` }, edges: { c: `dim` } }, stats: [{ l: `Executors busy`, v: `1 of 50`, cls: `bad` }] },
          { log: `The stage stays at (0 + 1) / 1 until that one task finishes, possibly after hours.`, code: 3, hl: { nodes: { t1: `bad` } } }
        ],
        fix: [
          { log: `The partner writes many files, each compressed on its own.`, code: 0, hl: { nodes: { many: `ok` } } },
          { log: `The index now makes one split per file, so about 3,200 tasks are created (illustrative).`, code: 2, hl: { nodes: { idx: `ok`, fan: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Tasks`, v: `3,200`, cls: `ok` }] },
          { log: `The tasks spread across all 50 executors.`, code: 2, hl: { nodes: { ex: `ok` }, edges: { e: `ok` } }, stats: [{ l: `Executors busy`, v: `50 of 50`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Build Lineage',
    problem: `An analyst chains <code>filter</code> and <code>map</code> on the order logs. The cell returns in 40 ms (illustrative), so the team thinks the data is loaded. Two reports then call an action on the same variable. Each takes 25 minutes (illustrative), and the storage bill shows the 2 TB was read twice.`,
    predict: {
      q: `The notebook cell defines <code>filter</code> then <code>map</code> and returns. Before any action, how many source records have been read?`,
      opts: [`All of them, because map has to see every record`, `Only the first partition, as a sample`, `None`],
      ans: 2,
      why: `Transformations only add nodes to the lineage graph. The source is read when an action such as <code>count</code> or <code>write</code> runs, and again for every action unless the data is persisted.`
    },
    explain: `<h3>The idea</h3>
<p>Spark separates <b>describing</b> the work from <b>doing</b> it. Calls like <code>filter</code> and <code>map</code> only record a recipe. Nothing is read until an action asks for a result. This lets Spark plan the whole pipeline before it touches 2 TB.</p>
<h3>How it works, step by step</h3>
<ol>
<li>Each RDD is a node with a list of partitions, links to its parent RDDs, and a <code>compute</code> function for one partition.</li>
<li>A <b>narrow</b> child partition reads a fixed few parent partitions, so <code>filter</code> and <code>map</code> can run in the same task. A <b>shuffle</b> child reads from all parents. Chapter three uses this split to cut stages.</li>
<li>An action such as <code>count</code>, <code>collect</code> or <code>write</code> walks the lineage back to the source, and runs a new job each time.</li>
<li><b>Persistence</b> keeps results between jobs. <code>cache()</code> is <code>persist(StorageLevel.MEMORY_ONLY)</code> for an RDD. <code>persist(StorageLevel.MEMORY_AND_DISK)</code> spills what does not fit to disk.</li>
<li><code>checkpoint()</code> saves the data to reliable storage and cuts the lineage. <code>localCheckpoint()</code> is faster but not fault tolerant.</li>
</ol>
<h3>The trade-off</h3>
<p>Lazy evaluation lets Spark optimise the whole job, but it repeats work. Every action re-walks the lineage. If two reports need the same data, persist it once, and make sure the cached part fits the memory you have.</p>
<h3>What to look for</h3>
<p>The Jobs tab shows one job per action, so two jobs that read the same input mean the data was not kept. In the Storage tab, Fraction Cached below 100% means some partitions are rebuilt on every use. Print <code>toDebugString</code> when a loop is slow.</p>`,
    diagnose: [
      {
        t: `Two actions scan the same 2 TB twice`,
        sym: `Two jobs in the Jobs tab, both with a full read stage. The storage bill doubles.`,
        ctx: `One DataFrame feeds a revenue report and a fraud report in the same application. Neither report persists anything (illustrative).`,
        why: `Each action starts a job that follows the lineage back to the source. Without persistence nothing is kept between jobs.`,
        log: `-- representative output, values illustrative
Job 0 (count)   Stage 0: read 2.0 TiB   25 min
Job 1 (collect) Stage 1: read 2.0 TiB   25 min`,
        note: `Two jobs that each read the full input is the signature.`,
        fix: [
          `Measure first: count read stages with the same input in the Jobs tab.`,
          `Fix: <code>persist()</code> the shared DataFrame before the first action, using a level that fits memory.`,
          `Fix: write an intermediate table if the two reports run in different applications.`,
          `Verify: the second job shows far less input read, and the Storage tab lists the cached data.`
        ]
      },
      {
        t: `Iterative loop makes the lineage grow without bound`,
        sym: `Each iteration is slower than the last. After a few hundred, a <code>StackOverflowError</code> appears.`,
        ctx: `A ranking job reassigns the same RDD 400 times in a loop (illustrative). The driver planning time grows each pass.`,
        why: `Every iteration adds nodes to the lineage. Planning, serialising and recovering a long chain gets slower, and deep recursion eventually overflows the stack.`,
        log: `-- representative output, wording varies by version
Exception in thread "main" java.lang.StackOverflowError
	at java.io.ObjectOutputStream.writeObject0(ObjectOutputStream.java:1185)
	...`,
        note: `A very deep stack of serialisation frames while submitting a job points to a long lineage.`,
        fix: [
          `Measure first: print <code>rdd.toDebugString</code> and watch its length grow.`,
          `Fix: call <code>sc.setCheckpointDir(...)</code>, then <code>checkpoint()</code> every N iterations, and run an action so it takes effect.`,
          `Trade-off: <code>localCheckpoint()</code> is cheaper, but the data is lost if an executor is lost.`,
          `Verify: <code>toDebugString</code> stays short, and per-iteration time stays flat.`
        ]
      },
      {
        t: `The cached data does not fit in memory`,
        sym: `The Storage tab shows Fraction Cached below 100%, and the job is as slow as it was before the cache.`,
        ctx: `A 900 GB RDD is cached with <code>cache()</code> on a cluster with 600 GB of storage memory (illustrative).`,
        why: `<code>MEMORY_ONLY</code> drops partitions that do not fit. A dropped partition is not an error: it is recomputed from the lineage the next time it is needed.`,
        log: `-- representative output, values illustrative
Storage tab: RDD 14  Storage Level: Memory Deserialized 1x Replicated
Cached Partitions: 3,100 / 8,000   Fraction Cached: 39%`,
        note: `Fraction Cached below 100% means silent recomputation.`,
        fix: [
          `Measure first: open the Storage tab and read Fraction Cached and the size in memory.`,
          `Fix: use <code>persist(StorageLevel.MEMORY_AND_DISK)</code> so overflow partitions go to disk instead of being recomputed.`,
          `Fix: cache a smaller projection, with only the columns and rows the later steps use.`,
          `Verify: Fraction Cached reaches 100%, and the repeated action time drops.`
        ]
      }
    ],
    source: { label: `Original: Build Lineage`, href: `01-spark-internals-end-to-end.html#ch1` },
    scenarios: [
      {
        id: `lazy-two-reads`,
        label: `Lazy, then two actions`,
        desc: `Transformations build a recipe. Each action walks it back to the 2 TB source again.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `orders = sc.textFile("s3://logs/orders/2026-10-07/*")`,
            `valid = orders.filter(lambda line: "city" in line)`,
            `pairs = valid.map(lambda line: (city(line), amount(line)))`,
            `# no action yet: this cell returns in about 40 ms`,
            `pairs.count()      # first action: reads 2 TB`,
            `pairs.collect()    # second action: reads 2 TB again`
          ],
          fix: [
            `pairs = valid.map(lambda line: (city(line), amount(line))).persist(StorageLevel.MEMORY_AND_DISK)`,
            `pairs.count()      # first action fills the cache from the source`,
            `pairs.collect()    # second action reads the cached copy`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `src`, x: 20, y: 120, w: 160, h: 56, t: `Source RDD`, s: `2 TB of order logs` },
            { id: `flt`, x: 240, y: 120, w: 160, h: 56, t: `filter`, s: `narrow, no data read` },
            { id: `mp`, x: 460, y: 120, w: 160, h: 56, t: `map`, s: `narrow, no data read` },
            { id: `act`, x: 460, y: 20, w: 160, h: 56, t: `Action`, s: `count() starts a job` }
          ],
          edges: [
            { id: `e1`, a: `src`, b: `flt`, label: `lineage` },
            { id: `e2`, a: `flt`, b: `mp`, label: `lineage` },
            { id: `e3`, a: `mp`, b: `act`, label: `runs` }
          ]
        },
        bug: [
          { log: `The cell only adds lineage nodes. No task runs and no byte is read (illustrative 40 ms).`, code: 3, hl: { nodes: { src: `dim`, flt: `on`, mp: `on` }, edges: { e1: `dim`, e2: `on` } }, stats: [{ l: `Bytes read`, v: `0`, cls: `ok` }] },
          { log: `count() walks the lineage back to the source and reads the full 2 TB (illustrative 25 min).`, code: 4, hl: { nodes: { src: `bad`, act: `on` }, edges: { e1: `bad`, e3: `on` } }, stats: [{ l: `Bytes read`, v: `2 TB`, cls: `bad` }] },
          { log: `collect() walks the same lineage again and reads the 2 TB a second time.`, code: 5, hl: { nodes: { src: `bad` }, edges: { e1: `bad` } }, stats: [{ l: `Bytes read`, v: `4 TB total`, cls: `bad` }] }
        ],
        fix: [
          { log: `persist() marks the RDD to be kept after its first computation.`, code: 0, hl: { nodes: { mp: `ok` } } },
          { log: `The first action computes the partitions and stores them, reading the 2 TB source once.`, code: 1, hl: { nodes: { src: `ok`, act: `ok` }, edges: { e1: `ok` } }, stats: [{ l: `Source reads`, v: `2 TB`, cls: `ok` }] },
          { log: `The second action reads the stored copy, so the source is not touched again.`, code: 2, hl: { nodes: { mp: `ok` }, edges: { e1: `dim` } }, stats: [{ l: `Source reads`, v: `still 2 TB`, cls: `ok` }] }
        ]
      },
      {
        id: `cache-overflow`,
        label: `Cache does not fit`,
        desc: `A 900 GB RDD is cached with 600 GB of storage memory. The overflow is silently recomputed.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `big = sc.textFile("s3://logs/orders/2026-10-07/*").map(parse)   # 900 GB`,
            `big.cache()        # persist(StorageLevel.MEMORY_ONLY)`,
            `big.count()        # fills memory until it is full`,
            `big.filter(is_ok).count()   # missing partitions are recomputed`
          ],
          fix: [
            `big.persist(StorageLevel.MEMORY_AND_DISK)`,
            `big.count()        # overflow partitions are written to disk`,
            `big.filter(is_ok).count()   # read from memory or disk, no recompute`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `src`, x: 20, y: 120, w: 160, h: 56, t: `Source files`, s: `900 GB RDD (illustr.)` },
            { id: `mem`, x: 240, y: 20, w: 160, h: 56, t: `Storage memory`, s: `600 GB (illustrative)` },
            { id: `drop`, x: 240, y: 220, w: 160, h: 56, t: `Dropped partitions`, s: `61% not cached` },
            { id: `rec`, x: 460, y: 220, w: 160, h: 56, t: `Recompute`, s: `rebuilt from lineage` },
            { id: `disk`, x: 460, y: 20, w: 160, h: 56, t: `Disk`, s: `overflow goes here` }
          ],
          edges: [
            { id: `e1`, a: `src`, b: `mem`, label: `fill` },
            { id: `e2`, a: `mem`, b: `drop`, label: `overflow` },
            { id: `e3`, a: `drop`, b: `rec`, label: `missing` },
            { id: `e4`, a: `rec`, b: `src`, label: `re-read` },
            { id: `e5`, a: `mem`, b: `disk`, label: `spill` }
          ]
        },
        bug: [
          { log: `cache() only marks the RDD for MEMORY_ONLY storage. Nothing is stored yet.`, code: 1, hl: { nodes: { src: `on` } } },
          { log: `The first count fills the 600 GB of storage memory. The rest of the partitions do not fit.`, code: 2, hl: { nodes: { mem: `warn`, drop: `warn` }, edges: { e1: `on`, e2: `warn` } }, stats: [{ l: `Fraction Cached`, v: `39%`, cls: `warn` }] },
          { log: `The second action needs the missing 61% again, so those partitions are recomputed from the source.`, code: 3, hl: { nodes: { drop: `bad`, rec: `bad` }, edges: { e3: `bad`, e4: `bad` } }, stats: [{ l: `Recomputed`, v: `61%`, cls: `bad` }] },
          { log: `No error is raised. The job is no faster than it was before the cache.`, code: 3, hl: { nodes: { rec: `bad` } }, stats: [{ l: `Job time`, v: `no faster`, cls: `bad` }] }
        ],
        fix: [
          { log: `MEMORY_AND_DISK keeps the same logical RDD, but allows disk for the overflow.`, code: 0, hl: { nodes: { disk: `ok` } } },
          { log: `Partitions that do not fit in memory are written to disk instead of dropped.`, code: 1, hl: { nodes: { mem: `ok`, disk: `ok` }, edges: { e5: `ok` } } },
          { log: `Later actions read from memory or disk, not from the source.`, code: 2, hl: { nodes: { rec: `dim` }, edges: { e3: `dim`, e4: `dim` } }, stats: [{ l: `Fraction Cached`, v: `100%`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Plan Stages',
    problem: `The job is four lines long, but the Spark UI shows three stages. Nobody can say which line made each boundary, or why the second stage waits for the first to finish completely. A teammate then adds a join to a reference table, and the stage count jumps again (illustrative).`,
    predict: {
      q: `How many stages does <code>read → filter → map → reduceByKey → count</code> produce?`,
      opts: [`1, everything is one pipeline`, `2: one before the shuffle, one after`, `5, one per operator`],
      ans: 1,
      why: `<code>filter</code> and <code>map</code> are narrow, so they run in the same stage as the read. <code>reduceByKey</code> needs a shuffle, so it starts a new stage, and <code>count</code> runs in that last one.`
    },
    explain: `<h3>The idea</h3>
<p>Some steps can run on one partition alone. Others need rows from every partition. Spark groups the narrow steps into one <b>stage</b>, and it cuts a new stage wherever data must cross the network.</p>
<h3>How it works, step by step</h3>
<ol>
<li>When an action runs, the <b>DAGScheduler</b> starts at the final RDD and walks its dependencies backwards.</li>
<li><b>Narrow dependencies</b> (<code>map</code>, <code>filter</code>, <code>coalesce</code> without a shuffle, co-partitioned joins) stay inside one stage, pipelined together.</li>
<li><b>Shuffle dependencies</b> (<code>reduceByKey</code>, <code>groupByKey</code>, <code>repartition</code>, <code>distinct</code>, and a join that is not co-partitioned) end a ShuffleMapStage. That stage writes shuffle files for the next one.</li>
<li>The last stage is the <b>ResultStage</b>. It returns the action's result to the driver.</li>
<li>The number of tasks in a stage equals the partitions of its last RDD. So one operator can change the parallelism of a whole stage.</li>
</ol>
<h3>The trade-off</h3>
<p>A shuffle is the most expensive step in the job, because data moves between machines and is written to disk. Stage boundaries show you where that cost is. Fewer shuffles usually means a faster job, but a single operator can also decide how many tasks every stage in the chain gets.</p>
<h3>What to look for</h3>
<p>Each stage in the Spark UI covers a block of narrow operators, and a new stage starts after every shuffle. When you add a join or a repartition, count the stage boundaries again, because each one adds a shuffle.</p>`,
    diagnose: [
      {
        t: `groupByKey used where reduceByKey fits`,
        sym: `Shuffle read is as large as the input, and one task dies with an out-of-memory error.`,
        ctx: `Revenue per city is written as <code>groupByKey().mapValues(sum)</code>. The "unknown" city holds a very large share of rows (illustrative).`,
        why: `<code>groupByKey</code> has no map-side combine, so every value crosses the network, and all values of one key must fit in one task's memory.`,
        log: `-- representative output, values illustrative
Stage 1: shuffle write 1.9 TiB, shuffle read 1.9 TiB
Task 17 failed: java.lang.OutOfMemoryError: Java heap space`,
        note: `Shuffle bytes close to input bytes means nothing was combined before the shuffle.`,
        fix: [
          `Measure first: compare shuffle write bytes with input bytes on the stage page.`,
          `Fix: use <code>reduceByKey</code>, <code>aggregateByKey</code>, or DataFrame <code>groupBy().agg()</code>, which combine before the shuffle.`,
          `Fix: only use <code>groupByKey</code> when you need the full list per key and it is known to be small.`,
          `Verify: shuffle write drops to roughly distinct keys × map tasks records.`
        ]
      },
      {
        t: `repartition used to shrink output files`,
        sym: `A final write that used to take minutes now adds a full shuffle stage.`,
        ctx: `To cut 16,000 output files down to 200, someone added <code>repartition(200)</code> before the write (illustrative).`,
        why: `<code>repartition</code> always does a full shuffle to rebalance. When you only want fewer partitions, <code>coalesce</code> merges neighbours with a narrow dependency.`,
        log: `-- representative output, values illustrative
Stage 2 (repartition): shuffle write 410 GiB
Stage 3 (write): 200 tasks`,
        note: `An extra shuffle stage right before the write is the cost.`,
        fix: [
          `Measure first: look for a shuffle stage whose only job is rebalancing before the write.`,
          `Fix: use <code>coalesce(n)</code> to reduce the partition count without a shuffle.`,
          `Trade-off: <code>coalesce</code> can leave partitions of uneven size. Use <code>repartition</code> when evenness matters more than the shuffle cost.`,
          `Verify: the stage count drops by one, and total job time falls.`
        ]
      },
      {
        t: `coalesce(1) collapses the whole upstream stage`,
        sym: `Stage 0 shows <code>(0 + 1) / 1</code> after a change that was only meant to produce one file.`,
        ctx: `To produce a single CSV, <code>coalesce(1)</code> was added right after a heavy transformation (illustrative).`,
        why: `Without a shuffle, <code>coalesce</code> shrinks the partition count of the stage it sits in, so the transformation before it also runs in one task.`,
        log: `-- representative output, values illustrative
[Stage 4:>                                           (0 + 1) / 1]
49 executors idle`,
        note: `The task count of the stage that contains the heavy work is now 1.`,
        fix: [
          `Measure first: check the task count of the stage that contains the expensive step.`,
          `Fix: use <code>repartition(1)</code> so a shuffle separates the heavy stage from the single-task write.`,
          `Fix: or reduce the data first (aggregate), so the one task has little to do.`,
          `Verify: the heavy stage shows many tasks, and only the final write stage shows one.`
        ]
      }
    ],
    source: { label: `Original: Plan Stages`, href: `01-spark-internals-end-to-end.html#ch2` },
    scenarios: [
      {
        id: `where-stages-cut`,
        label: `Where the cut happens`,
        desc: `Walk back from the action. Narrow steps stay together; the reduceByKey shuffle starts a new stage.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `lines = sc.textFile("orders/2026-10-07")`,
            `paid = lines.filter(lambda l: "PAID" in l)`,
            `pairs = paid.map(lambda l: (city(l), amount(l)))`,
            `rev = pairs.reduceByKey(lambda a, b: a + b)`,
            `rev.count()        # the action starts the job`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `dag`, x: 240, y: 20, w: 160, h: 56, t: `DAGScheduler`, s: `walks back from end` },
            { id: `st0`, x: 20, y: 120, w: 160, h: 56, t: `ShuffleMapStage`, s: `read, filter, map` },
            { id: `sh`, x: 240, y: 120, w: 160, h: 56, t: `Shuffle boundary`, s: `all partitions move` },
            { id: `st1`, x: 460, y: 120, w: 160, h: 56, t: `ResultStage`, s: `reduce, then count` },
            { id: `out`, x: 460, y: 220, w: 160, h: 56, t: `Driver`, s: `count() result` }
          ],
          edges: [
            { id: `e1`, a: `st0`, b: `sh`, label: `write files` },
            { id: `e2`, a: `sh`, b: `st1`, label: `fetch blocks` },
            { id: `e3`, a: `st1`, b: `out`, label: `result` },
            { id: `e4`, a: `dag`, b: `st0`, label: `plans` }
          ]
        },
        bug: [
          { log: `The action rev.count() submits a job. The DAGScheduler walks back from the last RDD.`, code: 4, hl: { nodes: { dag: `on` }, edges: { e4: `on` } } },
          { log: `filter and map are narrow, so each partition's data stays in one task. They form one ShuffleMapStage.`, code: 2, hl: { nodes: { st0: `on` } }, stats: [{ l: `Stages so far`, v: `1` }] },
          { log: `reduceByKey needs rows from all partitions, so it is a shuffle dependency and cuts a new stage.`, code: 3, hl: { nodes: { sh: `warn` }, edges: { e1: `warn` } } },
          { log: `count() runs in the ResultStage, after the shuffle files are complete. Total: 2 stages.`, code: 4, hl: { nodes: { st1: `ok`, out: `ok` }, edges: { e2: `ok`, e3: `ok` } }, stats: [{ l: `Stages`, v: `2`, cls: `ok` }] }
        ]
      },
      {
        id: `coalesce-one-task`,
        label: `coalesce(1) vs repartition`,
        desc: `coalesce(1) is narrow, so it pulls the heavy steps into a single task. repartition(1) adds a shuffle that keeps them wide.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `# one CSV is wanted`,
            `big = raw.filter(valid).map(enrich)   # 16,000 tasks`,
            `out = big.coalesce(1)                 # narrow: no shuffle`,
            `out.saveAsTextFile("report/one.csv")`
          ],
          fix: [
            `# a shuffle separates the heavy stage from the write`,
            `big = raw.filter(valid).map(enrich)   # still 16,000 tasks`,
            `out = big.repartition(1)              # full shuffle to 1 partition`,
            `out.saveAsTextFile("report/one.csv")  # one task writes the file`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `rd`, x: 20, y: 120, w: 160, h: 56, t: `Read and map`, s: `16,000 partitions` },
            { id: `co`, x: 240, y: 120, w: 160, h: 56, t: `coalesce(1)`, s: `narrow, no shuffle` },
            { id: `sh`, x: 240, y: 220, w: 160, h: 56, t: `repartition(1)`, s: `full shuffle` },
            { id: `wr`, x: 460, y: 120, w: 160, h: 56, t: `Write one file`, s: `a single task` }
          ],
          edges: [
            { id: `e1`, a: `rd`, b: `co`, label: `narrow` },
            { id: `e2`, a: `co`, b: `wr`, label: `one task` },
            { id: `e3`, a: `rd`, b: `sh`, label: `shuffle` },
            { id: `e4`, a: `sh`, b: `wr`, label: `write` }
          ]
        },
        bug: [
          { log: `coalesce(1) is narrow, so it is pushed back into the stage with read, filter and map.`, code: 2, hl: { nodes: { rd: `on`, co: `bad` }, edges: { e1: `on` } } },
          { log: `The whole stage now has one partition, so one task runs all the heavy work.`, code: 2, hl: { nodes: { co: `bad`, wr: `bad` }, edges: { e2: `bad` } }, stats: [{ l: `Tasks in stage`, v: `1`, cls: `bad` }, { l: `Idle executors`, v: `49`, cls: `bad` }] },
          { log: `The other 49 executors sit idle while the single task runs for hours (illustrative).`, code: 3, hl: { nodes: { wr: `bad` } } }
        ],
        fix: [
          { log: `repartition(1) adds a shuffle, which ends the heavy stage.`, code: 2, hl: { nodes: { sh: `ok`, co: `dim` }, edges: { e1: `dim`, e3: `ok` } } },
          { log: `The heavy stage runs 16,000 tasks on all executors, then shuffles its output into one partition.`, code: 1, hl: { nodes: { rd: `ok` } } },
          { log: `Only the small final write stage has one task.`, code: 3, hl: { nodes: { wr: `ok` }, edges: { e4: `ok` } }, stats: [{ l: `Heavy stage tasks`, v: `16,000`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Schedule Tasks and Retries',
    problem: `The nightly job runs about 16,000 tasks (illustrative) on 50 executors. At minute 40 a node is reclaimed. The UI shows tasks failing with executor lost, and then a map stage that looks like it started over. The on-call engineer must answer one question before the 6 AM deadline: what has to run again, and will it finish in time?`,
    predict: {
      q: `An executor dies after the map stage finished, and its map outputs were only on its local disk. What runs again?`,
      opts: [`Nothing; finished tasks stay finished`, `Only the reduce tasks that were running on it`, `The lost map tasks first (after a FetchFailed), then the reducers that need them`],
      ans: 2,
      why: `Reducers fetch map output from the dead executor's disk and get a <code>FetchFailedException</code>. The scheduler marks those outputs lost, resubmits the missing map tasks, then runs the reducers. An external shuffle service would have kept the files.`
    },
    explain: `<h3>The idea</h3>
<p>The driver keeps all the scheduling state. Executors only run the tasks they are given. A failed task can simply run again. But when map output is lost, the stage that made it has to be rebuilt first, so the scheduler must track where every map output lives.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The <b>DAGScheduler</b> submits a stage only when its parent stages are complete, and tracks which map outputs exist and where.</li>
<li>The <b>TaskScheduler</b> and its <b>TaskSetManager</b> keep one TaskSet per stage attempt. They hand tasks to free slots and retry a failed task up to <code>spark.task.maxFailures</code> (4 by default).</li>
<li>A <b>FetchFailed</b> is different from a normal task error. It means map output is gone, so the parent stage is resubmitted. Retrying the reducer alone would not help.</li>
<li><code>spark.speculation</code> (off by default) launches a second copy of a slow task. <code>spark.locality.wait</code> (3s) sets how long a task waits for a data-local slot.</li>
<li>With <code>spark.shuffle.service.enabled</code>, an external shuffle service serves shuffle files after the executor process dies. <code>spark.excludeOnFailure.enabled</code> keeps new tasks away from nodes that keep failing.</li>
</ol>
<h3>The trade-off</h3>
<p>Retries and speculation cost extra work, and both can hide a bad node for a while. The shuffle service only helps where your cluster manager supports it. Retries also cannot fix a deterministic bug: the same bad row fails again on every attempt.</p>
<h3>What to look for</h3>
<p>Read the failure reason in the stage page first. <code>executor lost</code> points to the infrastructure, <code>FetchFailed</code> to lost map output, and the same stack trace on every attempt to bad data. Each needs a different fix, so check the reason before changing any setting.</p>`,
    diagnose: [
      {
        t: `Executor lost triggers FetchFailed and a map rerun`,
        sym: `Reducers fail with <code>FetchFailedException</code>, and the map stage appears again in the UI.`,
        ctx: `A spot node is reclaimed 40 minutes into the run (illustrative). The job finishes late but correctly.`,
        why: `Map output lived on the dead executor's local disk. The reducers cannot fetch it, so the DAGScheduler resubmits the lost map tasks before the reducers can complete.`,
        log: `-- representative output, wording varies by version
WARN TaskSetManager: Lost task 12.0 in stage 4.0: FetchFailed(BlockManagerId(2, node-17, 7337), shuffleId=1, mapIndex=311, mapId=..., reduceId=12, message=
org.apache.spark.shuffle.FetchFailedException: Failed to connect to node-17
INFO DAGScheduler: Resubmitting ShuffleMapStage 3 (map at Job.scala:42) due to fetch failure`,
        note: `"Resubmitting ShuffleMapStage" after a FetchFailed is the mechanism working as designed.`,
        fix: [
          `Measure first: count the resubmitted stages, and read the lost executor reason in the driver log and the Executors tab.`,
          `Fix: run an external shuffle service (<code>spark.shuffle.service.enabled</code>) where your cluster manager supports it, so files outlive the executor process.`,
          `Fix: avoid reclaimable nodes for long shuffle-heavy jobs, or use <code>spark.excludeOnFailure.enabled</code> for flaky nodes.`,
          `Verify: after a kill test, no stage is resubmitted for a lost executor.`
        ]
      },
      {
        t: `One slow task holds the whole stage open`,
        sym: `99% of tasks are done, and the stage has been at <code>(0 + 1)</code> for twenty minutes.`,
        ctx: `One node has a failing disk and runs everything several times slower (illustrative). The tasks assigned to it finish last.`,
        why: `A stage finishes only when its last task finishes. A task on a slow node is not wrong, only late, so it is never retried by itself.`,
        log: `-- representative output, values illustrative
Stage 5: 15,999 / 16,000 tasks succeeded
Task 8123 running on executor 31 for 1140 s (median 38 s)`,
        note: `Compare the maximum task time with the median on the stage page.`,
        fix: [
          `Measure first: read the min, median and max task duration for the stage.`,
          `Fix: enable <code>spark.speculation</code> and tune <code>spark.speculation.multiplier</code> (1.5 by default), so a copy of a slow task starts on another executor.`,
          `Fix: exclude the bad node with <code>spark.excludeOnFailure.enabled</code>, then repair or drain it.`,
          `Verify: the max task time falls close to the median.`
        ]
      },
      {
        t: `Job aborted: a task failed 4 times`,
        sym: `The job dies with <code>Task N in stage S failed 4 times</code>, and the same task failed on different executors.`,
        ctx: `A row with a null amount triggers a <code>NullPointerException</code> in the parsing code (illustrative).`,
        why: `The task is deterministic: every attempt fails on the same input. The scheduler retries up to <code>spark.task.maxFailures</code> and then aborts the stage.`,
        log: `-- representative output, wording varies by version
org.apache.spark.SparkException: Job aborted due to stage failure: Task 7 in stage 3.0 failed 4 times, most recent failure: Lost task 7.3 in stage 3.0: java.lang.NullPointerException
	at com.example.Parse.amount(Parse.scala:31)`,
        note: `Four attempts on different executors with the same stack trace means a data or code bug, not a node problem.`,
        fix: [
          `Measure first: read the failure stack trace, and find the failing partition on the stage page.`,
          `Fix: handle the bad record (a null check, a quarantine, or <code>FAILFAST</code> earlier in the pipeline).`,
          `Do not raise <code>spark.task.maxFailures</code> to hide it. Retries cannot fix a deterministic bug.`,
          `Verify: re-run the failing partition alone, and confirm it passes.`
        ]
      },
      {
        t: `Cores sit idle waiting for data locality`,
        sym: `The Executors tab shows free cores while a stage still has pending tasks.`,
        ctx: `Data sits on a few nodes of a shared cluster. Most executors are elsewhere (illustrative).`,
        why: `The scheduler prefers a data-local slot and waits <code>spark.locality.wait</code> (3s by default) at each locality level before it launches a task less locally.`,
        log: `-- representative output, values illustrative
Stage 2: active tasks 18, pending tasks 4,200
Executors: 50 active, 32 cores idle`,
        note: `Idle cores with pending tasks hints that tasks are waiting for locality.`,
        fix: [
          `Measure first: compare idle cores with pending tasks in the UI.`,
          `Fix: for object-store data, locality does not exist, so lower <code>spark.locality.wait</code> (even to 0) and let tasks start anywhere.`,
          `Fix: for HDFS, place executors where the blocks are, or accept the wait for big reads.`,
          `Verify: slot utilisation rises and stage time falls.`
        ]
      }
    ],
    source: { label: `Original: Schedule Tasks and Retries`, href: `01-spark-internals-end-to-end.html#ch3` },
    scenarios: [
      {
        id: `executor-lost`,
        label: `Executor lost after map`,
        desc: `Executor 2 holds the only copy of a finished map stage. When it dies, the lost map tasks run again.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `# 16,000 map tasks on 50 executors, no shuffle service`,
            `spark.shuffle.service.enabled = false`,
            `# map outputs live on each executor's local disk`,
            `# executor 2 is reclaimed at minute 40`,
            `# a reducer fetch to executor 2 fails: FetchFailedException`
          ],
          fix: [
            `spark.shuffle.service.enabled = true   # cluster manager must support it`,
            `# the node-level service serves the shuffle files`,
            `# executor 2 is reclaimed, but its map files stay readable`,
            `# reducers keep running; no map stage is resubmitted`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `dag`, x: 20, y: 20, w: 160, h: 56, t: `DAGScheduler`, s: `stages, map outputs` },
            { id: `ts`, x: 20, y: 120, w: 160, h: 56, t: `TaskScheduler`, s: `one per stage attempt` },
            { id: `bk`, x: 20, y: 220, w: 160, h: 56, t: `SchedulerBackend`, s: `resource offers` },
            { id: `e1`, x: 240, y: 20, w: 160, h: 56, t: `Executor 1`, s: `reducer, task slots` },
            { id: `e2`, x: 240, y: 120, w: 160, h: 56, t: `Executor 2`, s: `holds map output` },
            { id: `e3`, x: 240, y: 220, w: 160, h: 56, t: `Executor 3`, s: `takes offers` },
            { id: `sh`, x: 460, y: 120, w: 160, h: 56, t: `Shuffle files`, s: `on local disk` }
          ],
          edges: [
            { id: `a`, a: `dag`, b: `ts`, label: `TaskSet` },
            { id: `b`, a: `ts`, b: `bk`, label: `offers` },
            { id: `c`, a: `bk`, b: `e1`, label: `launch` },
            { id: `d`, a: `bk`, b: `e2`, label: `launch` },
            { id: `e`, a: `bk`, b: `e3`, label: `launch` },
            { id: `f`, a: `e2`, b: `sh`, label: `write` },
            { id: `h`, a: `e1`, b: `sh`, label: `fetch` }
          ]
        },
        bug: [
          { log: `The map stage has finished. Its outputs live only on executor 2's local disk.`, code: 2, hl: { nodes: { e2: `on`, sh: `on` }, edges: { f: `on` } } },
          { log: `Executor 2 is reclaimed. With no shuffle service its files are unreachable.`, code: 3, hl: { nodes: { e2: `bad`, sh: `bad` }, edges: { f: `dim` } }, stats: [{ l: `Map outputs lost`, v: `320 (illustrative)`, cls: `bad` }] },
          { log: `A reducer on executor 1 tries to fetch from executor 2 and gets FetchFailedException.`, code: 4, hl: { nodes: { e1: `warn`, sh: `bad` }, edges: { h: `bad` } } },
          { log: `The TaskScheduler reports the fetch failure, and the DAGScheduler marks those map outputs lost.`, code: 4, hl: { nodes: { ts: `warn`, dag: `warn` }, edges: { a: `warn` } } },
          { log: `Only the missing map tasks are resubmitted on surviving executors, and then the reducers run again.`, code: 4, hl: { nodes: { dag: `ok`, ts: `ok`, bk: `ok`, e3: `ok` }, edges: { b: `ok`, e: `ok` } }, stats: [{ l: `Stage resubmitted`, v: `map stage only`, cls: `warn` }] }
        ],
        fix: [
          { log: `Same job. The shuffle service runs on each node and owns the shuffle files there.`, code: 0, hl: { nodes: { sh: `ok` } } },
          { log: `Executor 2 is reclaimed, but its map files stay on disk and the node service serves them.`, code: 2, hl: { nodes: { e2: `dim`, sh: `ok` }, edges: { f: `ok` } } },
          { log: `Reducers fetch from the shuffle service and keep running. No map stage is resubmitted.`, code: 3, hl: { nodes: { e1: `ok`, sh: `ok` }, edges: { h: `ok` } }, stats: [{ l: `Stage resubmitted`, v: `none`, cls: `ok` }] }
        ]
      },
      {
        id: `straggler`,
        label: `One slow task`,
        desc: `15,999 tasks finish in about 38 s each. One task on a failing node takes 1140 s and holds the stage open.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.speculation = false   # off by default`,
            `# 16,000 tasks on 50 executors`,
            `# one node has a failing disk and runs tasks several times slower`,
            `# the stage ends only when task 8123 ends`
          ],
          fix: [
            `spark.speculation = true`,
            `spark.speculation.multiplier = 1.5   # default`,
            `# a copy of a slow task starts on another executor`,
            `# the first attempt to finish wins`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `stage`, x: 20, y: 120, w: 160, h: 56, t: `Stage 5`, s: `15,999 of 16,000 done` },
            { id: `fast`, x: 240, y: 20, w: 160, h: 56, t: `Fast tasks`, s: `finish in about 38 s` },
            { id: `slow`, x: 240, y: 220, w: 160, h: 56, t: `Straggler`, s: `failing disk node` },
            { id: `spec`, x: 460, y: 220, w: 160, h: 56, t: `Speculative copy`, s: `healthy executor` },
            { id: `done`, x: 460, y: 120, w: 160, h: 56, t: `Stage complete`, s: `waits for last task` }
          ],
          edges: [
            { id: `a`, a: `stage`, b: `fast`, label: `run` },
            { id: `b`, a: `stage`, b: `slow`, label: `run` },
            { id: `c`, a: `slow`, b: `spec`, label: `speculate` },
            { id: `d`, a: `spec`, b: `done`, label: `first wins` },
            { id: `e`, a: `fast`, b: `done`, label: `done` }
          ]
        },
        bug: [
          { log: `The stage runs 16,000 tasks. Most of them finish in about 38 s (illustrative).`, code: 1, hl: { nodes: { stage: `on`, fast: `ok` }, edges: { a: `on`, e: `ok` } }, stats: [{ l: `Median task`, v: `38 s`, cls: `ok` }] },
          { log: `One task is on a node with a failing disk, so it runs several times slower.`, code: 2, hl: { nodes: { slow: `bad` }, edges: { b: `bad` } } },
          { log: `The stage sits at 15,999 of 16,000 tasks for about 20 minutes.`, code: 3, hl: { nodes: { done: `warn` } }, stats: [{ l: `Slowest task`, v: `1140 s`, cls: `bad` }] },
          { log: `A slow task is never retried just for being slow, so nothing changes until it ends.`, code: 3, hl: { nodes: { slow: `bad` } } }
        ],
        fix: [
          { log: `Speculation is on. The scheduler compares each running task with the median.`, code: 0, hl: { nodes: { stage: `ok` } } },
          { log: `A task slower than 1.5 times the median gets a second copy on another executor.`, code: 1, hl: { nodes: { spec: `ok` }, edges: { c: `ok` } }, stats: [{ l: `Speculated copy`, v: `85 s (illustrative)`, cls: `ok` }] },
          { log: `The copy finishes first, so the stage closes. The other attempt is stopped.`, code: 2, hl: { nodes: { done: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Slowest task`, v: `85 s`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Run Narrow Tasks',
    problem: `A task holds one 128 MB partition and runs three narrow steps: parse, filter, enrich. Nothing shuffles and nothing is cached. Yet one stage fails with out-of-memory errors in its tasks (illustrative). The same code runs fine on another team's cluster, and the only recent change is an edit to the enrich step.`,
    predict: {
      q: `A partition has 8 rows, and the filter drops 5 of them. How many times does the following map function run?`,
      opts: [`8, once per input row`, `3, only for the rows that passed`, `5, for the rows the filter dropped`],
      ans: 1,
      why: `Each row is pulled through filter and then map, one at a time. A dropped row never reaches map, so map runs 3 times, and no intermediate list is built.`
    },
    explain: `<h3>The idea</h3>
<p>A task does not build a full list for each step. It pulls rows through the whole chain one at a time. Memory then depends on one row in flight, not on the size of the partition, as long as no step collects the rows into a list.</p>
<h3>How it works, step by step</h3>
<ol>
<li>Each narrow step wraps its parent's iterator. <code>map</code> and <code>filter</code> add a wrapper, not a copy of the data.</li>
<li>The task calls <code>next()</code> on the last iterator. That one row flows through every step before the next row is read.</li>
<li>For DataFrames, whole-stage codegen fuses the operators of a stage into one generated Java loop, which removes per-row calls between operators.</li>
<li>Closures are serialised on the driver and shipped to the executors with the task. They must be serialisable and small.</li>
<li>Memory breaks the chain only where code materialises rows: <code>toList</code>, a collected buffer, or a shuffle.</li>
</ol>
<h3>The trade-off</h3>
<p>Streaming keeps memory flat, but the cost is paid per row. Setup inside a function runs for every row, and a Python UDF crosses a process boundary for every row. Move setup outside the per-row path, and prefer built-in functions when you can.</p>
<h3>What to look for</h3>
<p>Compare rows per second with CPU use inside the task. High CPU with low throughput means the work is in the function. Low CPU with an external system under load means per-row setup or per-row calls. For PySpark, high Python worker CPU with low JVM CPU shows the serialisation boundary.</p>`,
    diagnose: [
      {
        t: `Expensive setup runs once per row`,
        sym: `The job is slow, the database shows thousands of connections, and CPU is idle in the tasks.`,
        ctx: `A <code>map</code> opens a database connection for each order to look up a city (illustrative).`,
        why: `The function body runs for every row. A connection opened inside it is opened 40 million times per partition (illustrative).`,
        log: `-- representative output, values illustrative
DB: max_connections reached (500)
Task 12: 3,400 rows/s (expected 90,000 rows/s)`,
        note: `Throughput far below CPU capacity, with an external system under load, points to per-row setup.`,
        fix: [
          `Measure first: count connections opened per task against rows per task.`,
          `Fix: use <code>mapPartitions</code> and open one connection per partition, closing it when the iterator ends.`,
          `Fix: or load the lookup table as a broadcast value, or join it, instead of calling out per row.`,
          `Verify: connections equal partitions in flight, and throughput rises.`
        ]
      },
      {
        t: `mapPartitions materialises the whole partition`,
        sym: `Tasks run out of heap although the partition size is normal.`,
        ctx: `A <code>mapPartitions</code> body starts with <code>iter.toList</code> to "make it easier to loop" (illustrative).`,
        why: `<code>toList</code> reads the entire partition into memory at once, which turns a streaming pipeline into a materialised one.`,
        log: `-- representative output, wording varies by version
java.lang.OutOfMemoryError: Java heap space
	at scala.collection.immutable.List.$colon$colon(List.scala)
	at com.example.Enrich$.apply(Enrich.scala:18)`,
        note: `A stack trace through collection building inside your function is the clue.`,
        fix: [
          `Measure first: find the allocation site in the heap-error stack trace.`,
          `Fix: keep the iterator lazy with <code>iter.map(...)</code> or <code>iter.filter(...)</code>, and return an iterator.`,
          `Fix: if you must batch, use <code>iter.grouped(n)</code> with a bounded n.`,
          `Verify: peak memory stays flat as partition size grows.`
        ]
      },
      {
        t: `Row-at-a-time Python UDF overhead`,
        sym: `A simple Python function makes the stage several times slower than the same logic in SQL.`,
        ctx: `A PySpark job applies a plain Python UDF to every order row (illustrative).`,
        why: `Each row is serialised from the JVM to a Python worker and back. The cost is per row, not per useful computation.`,
        log: `-- representative output, values illustrative
Stage 3: 20,000 tasks, median 4.2 min (SQL equivalent: 40 s)
Python worker CPU high, JVM CPU low`,
        note: `High Python worker CPU with low JVM CPU shows the serialisation boundary.`,
        fix: [
          `Measure first: compare stage time against a built-in function version, on a sample.`,
          `Fix: prefer built-in functions. They run inside the JVM and benefit from codegen.`,
          `Fix: otherwise use a <code>pandas_udf</code> and enable <code>spark.sql.execution.arrow.pyspark.enabled</code> to move data in Arrow batches.`,
          `Verify: stage time drops, and Python worker CPU falls.`
        ]
      }
    ],
    source: { label: `Original: Run Narrow Tasks`, href: `01-spark-internals-end-to-end.html#ch4` },
    scenarios: [
      {
        id: `tolist-heap`,
        label: `toList holds the partition`,
        desc: `A toList inside mapPartitions turns a streaming pass into one list the size of the partition.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `rdd.mapPartitions { iter =>`,
            `  val rows = iter.toList          // whole partition in memory`,
            `  rows.map(r => lookup(r)).iterator`,
            `}`
          ],
          fix: [
            `rdd.mapPartitions { iter =>`,
            `  iter.map(r => lookup(r))        // lazy: one row at a time`,
            `}`,
            `// if batching is needed: iter.grouped(n) with a bounded n`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `in`, x: 20, y: 120, w: 160, h: 56, t: `Input iterator`, s: `128 MB partition` },
            { id: `buf`, x: 240, y: 20, w: 160, h: 56, t: `toList buffer`, s: `all rows at once` },
            { id: `flt`, x: 240, y: 120, w: 160, h: 56, t: `map per row`, s: `one row in flight` },
            { id: `out`, x: 460, y: 120, w: 160, h: 56, t: `Output rows`, s: `enrich, then write` },
            { id: `heap`, x: 460, y: 220, w: 160, h: 56, t: `Heap`, s: `holds the partition` }
          ],
          edges: [
            { id: `e1`, a: `in`, b: `buf`, label: `toList` },
            { id: `e2`, a: `buf`, b: `out`, label: `drain` },
            { id: `e3`, a: `in`, b: `flt`, label: `next()` },
            { id: `e4`, a: `flt`, b: `out`, label: `stream` },
            { id: `e5`, a: `buf`, b: `heap`, label: `all rows` }
          ]
        },
        bug: [
          { log: `toList reads the whole partition into a list before any row is processed.`, code: 1, hl: { nodes: { in: `on`, buf: `bad` }, edges: { e1: `bad` } } },
          { log: `The list holds all 128 MB of rows on the executor heap (illustrative).`, code: 1, hl: { nodes: { buf: `bad`, heap: `bad` }, edges: { e5: `bad` } }, stats: [{ l: `Rows held`, v: `whole partition`, cls: `bad` }] },
          { log: `Only then does the map run and drain the list into the output.`, code: 2, hl: { nodes: { out: `warn` }, edges: { e2: `warn` } } },
          { log: `With a big partition the heap fills, and the task fails with java.lang.OutOfMemoryError: Java heap space.`, code: 2, hl: { nodes: { heap: `bad` } }, stats: [{ l: `Error`, v: `OutOfMemoryError`, cls: `bad` }] }
        ],
        fix: [
          { log: `iter.map keeps the work lazy. Nothing is collected into a list.`, code: 1, hl: { nodes: { flt: `ok` }, edges: { e3: `ok` } } },
          { log: `One row flows from the input, through the function, to the output, and then the next row is read.`, code: 1, hl: { nodes: { in: `ok`, out: `ok` }, edges: { e4: `ok` } } },
          { log: `Only one row is in flight at a time, so heap use stays flat as the partition grows.`, code: 3, hl: { nodes: { heap: `dim`, buf: `dim` }, edges: { e1: `dim`, e5: `dim` } }, stats: [{ l: `Rows held`, v: `one row`, cls: `ok` }] }
        ]
      },
      {
        id: `connect-per-row`,
        label: `Connection per row`,
        desc: `Setup inside the map runs once per row. Moving it to once per partition keeps the same lookup with one connection.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `rdd.map { order =>`,
            `  val conn = openConnection()           // per row`,
            `  val city = conn.lookup(order.cityId)`,
            `  conn.close()                          // per row`,
            `  (city, order.amount)`,
            `}`
          ],
          fix: [
            `rdd.mapPartitions { iter =>`,
            `  val conn = openConnection()           // once per partition`,
            `  val out = iter.map(o => (conn.lookup(o.cityId), o.amount))`,
            `  // close the connection once the iterator ends`,
            `  out`,
            `}`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `rows`, x: 20, y: 120, w: 160, h: 56, t: `Partition rows`, s: `40 M rows (illustr.)` },
            { id: `conn`, x: 240, y: 20, w: 160, h: 56, t: `Open connection`, s: `per row in bug path` },
            { id: `lk`, x: 240, y: 120, w: 160, h: 56, t: `Lookup`, s: `one call per row` },
            { id: `cls`, x: 240, y: 220, w: 160, h: 56, t: `Close connection`, s: `per row in bug path` },
            { id: `db`, x: 460, y: 120, w: 160, h: 56, t: `Database`, s: `max_connections 500` }
          ],
          edges: [
            { id: `e1`, a: `rows`, b: `lk`, label: `each row` },
            { id: `e2`, a: `lk`, b: `db`, label: `query` },
            { id: `e3`, a: `conn`, b: `lk`, label: `open` },
            { id: `e4`, a: `lk`, b: `cls`, label: `close` }
          ]
        },
        bug: [
          { log: `Each row opens a connection. The connect call sits in the function body, so it runs for every row.`, code: 1, hl: { nodes: { conn: `bad` }, edges: { e3: `bad` } } },
          { log: `Each row makes one lookup. The lookup itself is cheap next to the connect and close.`, code: 2, hl: { nodes: { lk: `warn`, rows: `on` }, edges: { e1: `on` } } },
          { log: `Each row closes its connection, so the database sees a flood of opens and closes.`, code: 3, hl: { nodes: { cls: `bad`, db: `bad` }, edges: { e4: `bad` } }, stats: [{ l: `Connections opened`, v: `40 million (illustrative)`, cls: `bad` }] },
          { log: `The database reaches max_connections (500). Throughput is 3,400 rows/s (illustrative) while CPU sits idle.`, code: 4, hl: { nodes: { db: `bad` } }, stats: [{ l: `Rows/s`, v: `3,400 (illustr.)`, cls: `bad` }] }
        ],
        fix: [
          { log: `The connection is opened once for the whole partition, not once per row.`, code: 1, hl: { nodes: { conn: `ok` }, edges: { e3: `ok` } } },
          { log: `Each row only does its lookup, and the same connection is reused.`, code: 2, hl: { nodes: { lk: `ok` }, edges: { e1: `ok`, e2: `ok` } }, stats: [{ l: `Connections opened`, v: `1 per partition`, cls: `ok` }] },
          { log: `The connection closes once, when the partition is done.`, code: 3, hl: { nodes: { cls: `ok` }, edges: { e4: `ok` } } },
          { log: `Throughput returns toward the CPU limit (about 90,000 rows/s, illustrative), and the database stays under its limit.`, code: 4, hl: { nodes: { db: `ok` } }, stats: [{ l: `Rows/s`, v: `90,000 (illustr.)`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Shuffle Write and Read',
    problem: `Each city's orders are spread across all 16,000 partitions (illustrative). The first design sends every order to the driver and sums it there, and the driver dies long before the report. The second design uses <code>reduceByKey</code> and works on a sample. On the full night, one stage ends with nearly 200 reducers that each read a huge block, while a smaller job runs 200 tiny tasks. The on-call engineer wants to know where those shuffle numbers come from.`,
    predict: {
      q: `With map-side combine, one map task holds 8 (city, amount) pairs over 3 distinct cities. How many shuffle records does it write?`,
      opts: [`8, one per input pair`, `3, one per distinct city`, `1, one per map task`],
      ans: 1,
      why: `Map-side combine sums per key inside the map task first. It writes one partial sum per distinct key, here 3, and not the 8 input pairs.`
    },
    explain: `<h3>The idea</h3>
<p>Rows of one city are spread over every partition, but one city's total needs all of its rows in one place. Spark routes each row by a hash of its key. Every map task writes one block for each destination, and each destination fetches its blocks from every map task.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The <b>hash partitioner</b> sends a key to reduce partition <code>hash(key) mod R</code>, so all rows of one key meet in one reducer.</li>
<li><b>Map-side combine</b> pre-aggregates per key inside each map task. This is why <code>reduceByKey</code> shuffles far less than <code>groupByKey</code>.</li>
<li>The <b>sort-based shuffle</b> writes one data file and one index per map task. Logically there are M × R blocks, one for each pair of map task and reduce partition.</li>
<li>Each reducer <b>fetches</b> its block from every map output over the network. Bytes in flight are capped by <code>spark.reducer.maxSizeInFlight</code>.</li>
<li>For SQL the partition count is <code>spark.sql.shuffle.partitions</code> (200 by default). Shuffle and spill files are written under <code>spark.local.dir</code>.</li>
</ol>
<h3>The trade-off</h3>
<p>More reduce partitions make each task smaller, but they also create more blocks to fetch. Fewer partitions mean fewer, bigger blocks, and each reducer may spill to disk. The right count depends on the size of the data, not on a fixed default.</p>
<h3>What to look for</h3>
<p>On the stage page, compare the median and maximum shuffle read per task. Estimate the block count from the task counts of the two stages. Big spill with few tasks means partitions are too large. Many tiny tasks with long fetch waits means too many small blocks.</p>`,
    diagnose: [
      {
        t: `The default 200 shuffle partitions do not fit the data`,
        sym: `Huge tasks with spill on the full night, and a swarm of tiny tasks on a small input, from the same setting.`,
        ctx: `The nightly 2 TB job and a 50 MB test job both use <code>spark.sql.shuffle.partitions=200</code> (illustrative).`,
        why: `Partition count is fixed, not derived from data size. 2 TB over 200 partitions is about 10 GB each. 50 MB over 200 partitions is 250 KB each.`,
        log: `-- representative output, values illustrative
Night job: shuffle read 2.0 TiB over 200 tasks, median 10 GiB, Spill (Disk) 6 GiB per task
Test job:  shuffle read 50 MiB over 200 tasks, median 250 KiB`,
        note: `Check the median shuffle read per task. A target of roughly 100 MB to a few hundred MB is a common starting point.`,
        fix: [
          `Measure first: read shuffle read size per task on the stage page (median and max).`,
          `Fix: set <code>spark.sql.shuffle.partitions</code> per job so partitions land near the target size, and let AQE coalesce small ones.`,
          `Fix: for RDD jobs pass the partition count to <code>reduceByKey(f, n)</code>.`,
          `Verify: median task input is near the target, and spill is gone.`
        ]
      },
      {
        t: `No space left on device during shuffle`,
        sym: `Executors die with <code>No space left on device</code> on shuffle and spill files.`,
        ctx: `Local disks on the nodes are small, and a big sort and shuffle together exceed them (illustrative).`,
        why: `Map outputs and spill files are written under <code>spark.local.dir</code>. They stay until the shuffle is no longer needed, so a wide job can need several times its input size.`,
        log: `-- representative output, wording varies by version
java.io.IOException: No space left on device
	at org.apache.spark.shuffle.sort.BypassMergeSortShuffleWriter.write
ExecutorLostFailure (executor 14 exited caused by one of the running tasks)`,
        note: `Look at the disk usage of the directory configured by spark.local.dir on the failing node.`,
        fix: [
          `Measure first: check free space on the volume behind <code>spark.local.dir</code>.`,
          `Fix: point <code>spark.local.dir</code> to larger or several disks (comma separated).`,
          `Fix: reduce the shuffled bytes: combine earlier, select fewer columns, filter first.`,
          `Verify: peak local disk usage stays below the volume size during the shuffle.`
        ]
      },
      {
        t: `Too many tiny shuffle blocks`,
        sym: `Reduce tasks spend most of their time waiting on fetch requests, not processing.`,
        ctx: `A job with 20,000 map tasks and 2,000 reduce partitions on a small data volume (illustrative).`,
        why: `There are M × R logical blocks. When each one is only a few KB, request overhead and connections dominate, not the bytes.`,
        log: `-- representative output, values illustrative
Stage 4 shuffle read: 12 GiB in 40,000,000 blocks (avg 0.3 KiB)
Task time: fetch wait 82%, compute 9%`,
        note: `Many remote blocks with a small average size is the signature.`,
        fix: [
          `Measure first: compute M × R, and compare it with the shuffle bytes.`,
          `Fix: lower the number of reduce partitions, or the number of map tasks, so blocks are larger.`,
          `Fix: let AQE coalesce small shuffle partitions.`,
          `Verify: average block size rises, and fetch wait falls.`
        ]
      }
    ],
    source: { label: `Original: Shuffle Write and Read`, href: `01-spark-internals-end-to-end.html#ch5` },
    scenarios: [
      {
        id: `combine-blocks`,
        label: `Combine before shuffle`,
        desc: `groupByKey sends every pair across the network. reduceByKey sends one partial sum per city from each map task.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `rev = pairs.groupByKey().mapValues(sum)   # no map-side combine`,
            `# each map task sends every (city, amount) pair: 8 records`,
            `# each reducer must hold all raw values for its cities`
          ],
          fix: [
            `rev = pairs.reduceByKey(lambda a, b: a + b)   # combine in the map task`,
            `# each map task sends one partial sum per city: 3 records`,
            `# reducers only add the partial sums`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `m1`, x: 20, y: 20, w: 160, h: 56, t: `Map task 1`, s: `city, amount pairs` },
            { id: `m2`, x: 20, y: 120, w: 160, h: 56, t: `Map task 2`, s: `city, amount pairs` },
            { id: `mn`, x: 20, y: 220, w: 160, h: 56, t: `Map task M`, s: `city, amount pairs` },
            { id: `sh`, x: 240, y: 120, w: 160, h: 56, t: `Shuffle files`, s: `M × R blocks` },
            { id: `r1`, x: 460, y: 20, w: 160, h: 56, t: `Reduce task 1`, s: `hash(city) mod 2 = 0` },
            { id: `r2`, x: 460, y: 220, w: 160, h: 56, t: `Reduce task 2`, s: `hash(city) mod 2 = 1` }
          ],
          edges: [
            { id: `a`, a: `m1`, b: `sh`, label: `write` },
            { id: `b`, a: `m2`, b: `sh`, label: `write` },
            { id: `c`, a: `mn`, b: `sh`, label: `write` },
            { id: `d`, a: `sh`, b: `r1`, label: `fetch` },
            { id: `e`, a: `sh`, b: `r2`, label: `fetch` }
          ]
        },
        bug: [
          { log: `Each map task reads its (city, amount) pairs over 3 cities (illustrative).`, code: 0, hl: { nodes: { m1: `on`, m2: `on`, mn: `on` } }, stats: [{ l: `Input pairs per task`, v: `8`, cls: `ok` }] },
          { log: `groupByKey sends every pair into the shuffle with no combine, so 8 records are written.`, code: 1, hl: { nodes: { sh: `warn` }, edges: { a: `warn`, b: `warn`, c: `warn` } }, stats: [{ l: `Records shuffled`, v: `8 per task`, cls: `warn` }] },
          { log: `Each reducer must hold all the raw values for its cities in memory before it sums them.`, code: 2, hl: { nodes: { r1: `bad`, r2: `bad` }, edges: { d: `bad`, e: `bad` } }, stats: [{ l: `Values per key`, v: `all raw values`, cls: `bad` }] },
          { log: `At full scale the shuffle moves nearly the whole input, about 1.9 TB in the source case.`, code: 2, hl: { nodes: { sh: `bad` } }, stats: [{ l: `Shuffle bytes`, v: `≈ input size`, cls: `bad` }] }
        ],
        fix: [
          { log: `reduceByKey runs a partial sum inside each map task, before the shuffle.`, code: 0, hl: { nodes: { m1: `ok`, m2: `ok`, mn: `ok` } } },
          { log: `Each map task writes one partial sum per city: 3 records, not 8 (illustrative).`, code: 1, hl: { nodes: { sh: `ok` }, edges: { a: `ok`, b: `ok`, c: `ok` } }, stats: [{ l: `Records shuffled`, v: `3 per task`, cls: `ok` }] },
          { log: `The reducers add the partial sums, so the shuffle moves far fewer bytes (illustrative: 60 GB).`, code: 2, hl: { nodes: { r1: `ok`, r2: `ok` }, edges: { d: `ok`, e: `ok` } }, stats: [{ l: `Shuffle bytes`, v: `60 GB (illustr.)`, cls: `ok` }] }
        ]
      },
      {
        id: `partition-sizing`,
        label: `Fixed 200 partitions`,
        desc: `One fixed partition count is far too big for the 50 MB job and too small for the 2 TB job. AQE coalesces what is small.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.sql.shuffle.partitions = 200   # fixed, not from the data size`,
            `# night job: 2 TB / 200 = about 10 GB per task, so it spills`,
            `# test job: 50 MB / 200 = about 250 KB per task, so tiny tasks`
          ],
          fix: [
            `spark.sql.shuffle.partitions = 16000   # night job: 2 TB / 128 MB`,
            `spark.sql.adaptive.enabled = true      # AQE reads the real sizes`,
            `# AQE merges the test job's partitions into a few`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `inN`, x: 20, y: 20, w: 160, h: 56, t: `Night job`, s: `2 TB shuffle read` },
            { id: `p`, x: 240, y: 120, w: 160, h: 56, t: `Shuffle partitions`, s: `fixed at 200` },
            { id: `inT`, x: 20, y: 220, w: 160, h: 56, t: `Test job`, s: `50 MB shuffle read` },
            { id: `t1`, x: 460, y: 20, w: 160, h: 56, t: `Night tasks`, s: `about 10 GB each` },
            { id: `aq`, x: 460, y: 120, w: 160, h: 56, t: `AQE coalesce`, s: `merges small ones` },
            { id: `t2`, x: 460, y: 220, w: 160, h: 56, t: `Test tasks`, s: `about 250 KB each` }
          ],
          edges: [
            { id: `a`, a: `inN`, b: `p`, label: `shuffle` },
            { id: `b`, a: `inT`, b: `p`, label: `shuffle` },
            { id: `c`, a: `p`, b: `t1`, label: `split` },
            { id: `d`, a: `p`, b: `t2`, label: `split` },
            { id: `f`, a: `p`, b: `aq`, label: `sizes` },
            { id: `e`, a: `aq`, b: `t2`, label: `merge` }
          ]
        },
        bug: [
          { log: `The night job shuffles 2 TB into 200 partitions. Each task reads about 10 GB (illustrative).`, code: 1, hl: { nodes: { inN: `on`, p: `on`, t1: `bad` }, edges: { a: `on`, c: `on` } }, stats: [{ l: `Per task`, v: `about 10 GB`, cls: `bad` }] },
          { log: `Each night task cannot fit 10 GB in its memory share, so it spills 6 GB to disk.`, code: 1, hl: { nodes: { t1: `bad` } }, stats: [{ l: `Spill (Disk)`, v: `6 GB per task`, cls: `bad` }] },
          { log: `The same 200 partitions split the 50 MB test job into tasks of about 250 KB each.`, code: 2, hl: { nodes: { inT: `on`, t2: `bad` }, edges: { b: `on`, d: `bad` } }, stats: [{ l: `Per task`, v: `about 250 KB`, cls: `warn` }] }
        ],
        fix: [
          { log: `The night job sets its partition count so each partition is about 128 MB.`, code: 0, hl: { nodes: { t1: `ok` } }, stats: [{ l: `Per task`, v: `about 128 MB`, cls: `ok` }] },
          { log: `AQE checks the real shuffle sizes after the map stage, then merges small partitions.`, code: 1, hl: { nodes: { aq: `ok`, p: `ok` }, edges: { f: `ok`, d: `dim` } } },
          { log: `The test job's 200 small partitions merge into a few tasks of normal size (illustrative).`, code: 2, hl: { nodes: { t2: `ok` }, edges: { e: `ok` } }, stats: [{ l: `Tasks, test job`, v: `a few`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Skew and Adaptive Query Execution',
    problem: `The nightly report groups and joins by city. 199 reduce tasks finish in about a minute, but the one for the "unknown" city is still running two hours later (illustrative), and it holds up the whole stage. Someone suggests raising <code>spark.sql.shuffle.partitions</code> from 200 to 2000, and the 6 AM deadline is close.`,
    predict: {
      q: `Will raising shuffle partitions from 200 to 2000 fix a stage held open by one hot key?`,
      opts: [`Yes, the hot key is spread over more reducers`, `No, every row of that key still hashes to one partition`, `Yes, but only if AQE is also on`],
      ans: 1,
      why: `The partition is chosen by <code>hash(key) mod R</code>. All rows with the same key get the same hash for any R, so the hot key stays in one task. More partitions only make the other tasks smaller.`
    },
    explain: `<h3>The idea</h3>
<p>A hash partitioner sends every row of one key to one reducer. If one key is hot, one task carries most of the data, and adding partitions cannot split that key. Adaptive Query Execution (AQE) helps by measuring the real sizes at runtime and re-planning the rest of the query.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>Runtime statistics</b>: after a shuffle map stage, AQE knows the exact bytes in each reduce partition. It re-plans what is left (<code>spark.sql.adaptive.enabled</code>, on by default since Spark 3.2).</li>
<li><b>Coalesce</b> (<code>spark.sql.adaptive.coalescePartitions.enabled</code>) merges small neighbouring partitions toward <code>spark.sql.adaptive.advisoryPartitionSizeInBytes</code>.</li>
<li><b>Skew join</b> (<code>spark.sql.adaptive.skewJoin.enabled</code>) splits a partition that is larger than <code>skewedPartitionFactor</code> times the median, and above <code>skewedPartitionThresholdInBytes</code>. It replicates the other side of the join to match. It only works for joins.</li>
<li><b>Salting</b> is the manual fix. It adds a random suffix to a hot key, aggregates in two phases (partial by salted key, then final by key), or replicates the other join side.</li>
<li><b>Limits</b>: AQE cannot split one key's rows for a <code>groupBy</code>, and all NULL keys hash to one partition.</li>
</ol>
<h3>The trade-off</h3>
<p>AQE is automatic, but it only acts on joins and on sizes it can measure. Salting works for aggregations too, but it adds a shuffle and more code to maintain. Both are cheaper than one giant task that holds the stage open.</p>
<h3>What to look for</h3>
<p>The stage task table is the first place to look. Compare the max with the median shuffle read, then read the plan. A join makes AQE skew join a candidate; an aggregation needs salting. A NULL bucket in a count by key is the cheapest check.</p>`,
    diagnose: [
      {
        t: `A hot join key holds the stage open`,
        sym: `One task in the join stage processes hundreds of GB while the others are done.`,
        ctx: `Orders joined to a city dimension. 38% of orders have city "unknown" (illustrative).`,
        why: `The sort-merge join partitions both sides by key. All rows with the same key land in one partition and one task.`,
        log: `-- representative output, values illustrative
Stage 7 (join): 200 tasks, median 1.2 min, max 118 min
Shuffle Read Size: median 9.6 GiB, max 780 GiB`,
        note: `A maximum far above the median in the stage task summary is skew.`,
        fix: [
          `Measure first: read the max versus median shuffle read in the stage task table, and find the key.`,
          `Fix: keep <code>spark.sql.adaptive.skewJoin.enabled</code> on, and check the skew factor and threshold against your sizes.`,
          `Fix: where AQE is not available, salt the hot key and replicate the small side.`,
          `Verify: max task time falls to a small multiple of the median.`
        ]
      },
      {
        t: `A skewed groupBy that AQE skew join cannot help`,
        sym: `AQE is on, yet the aggregation stage still has one very slow task.`,
        ctx: `Revenue per city with no join; the heavy key is again "unknown" (illustrative).`,
        why: `AQE's skew handling is for sort-merge joins. A hash-partitioned aggregation still needs all rows of a key in one reducer.`,
        log: `-- representative output, values illustrative
Stage 9 (HashAggregate): max task 96 min, median 1.1 min
AdaptiveSparkPlan isFinalPlan=true, no skew split applied`,
        note: `The final plan shows no skew-join rewrite for an aggregation.`,
        fix: [
          `Measure first: confirm the slow stage has no join, and read the key's share of rows.`,
          `Fix: two-phase aggregation, first by (key, salt) with the salt in a few buckets, then by key.`,
          `Trade-off: salting adds one more small shuffle, which is cheap compared with one giant task.`,
          `Verify: the max task time drops, and the totals still match the unsalted result.`
        ]
      },
      {
        t: `NULL join keys pile into one partition`,
        sym: `A join stage is held up by one task, and the key value looks like <code>null</code>.`,
        ctx: `An optional <code>city_id</code> column is null for 10% of rows (illustrative), and those rows are shuffled for a join.`,
        why: `All NULLs hash to the same partition, even though they never match anything in an inner join. The shuffle sends them for no result.`,
        log: `-- representative output, values illustrative
Stage 6: max task shuffle read 410 GiB (all keys null), median 8 GiB`,
        note: `A group-by-count on the key shows the NULL bucket as the largest.`,
        fix: [
          `Measure first: run a count by the join key, and look at the NULL group.`,
          `Fix: filter NULL keys before an inner join. For an outer join, split them out and union their result back.`,
          `Fix: where NULLs must be kept for a left join, join only the non-null part and append the null rows unmatched.`,
          `Verify: no task is dominated by a NULL key, and row counts still reconcile.`
        ]
      }
    ],
    source: { label: `Original: Skew and Adaptive Query Execution`, href: `01-spark-internals-end-to-end.html#ch6` },
    scenarios: [
      {
        id: `hot-key-join`,
        label: `Hot key in a join`,
        desc: `One key sends most rows to one reducer. The AQE skew join splits that partition and copies the other side.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `orders.join(cities, "city_id")   # sort-merge join, both sides shuffled`,
            `# every row with city_id = "unknown" hashes to one partition`,
            `# that task reads 780 GB; the other 199 tasks take about 1 min`
          ],
          fix: [
            `spark.sql.adaptive.enabled = true`,
            `spark.sql.adaptive.skewJoin.enabled = true`,
            `# the hot partition is split into several smaller tasks`,
            `# the other join side is copied to each piece`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `orders`, x: 20, y: 120, w: 160, h: 56, t: `Orders`, s: `38% city = unknown` },
            { id: `hash`, x: 240, y: 120, w: 160, h: 56, t: `Hash by city`, s: `same key, same task` },
            { id: `hot`, x: 460, y: 20, w: 160, h: 56, t: `Hot task`, s: `unknown: 780 GB` },
            { id: `cold`, x: 460, y: 120, w: 160, h: 56, t: `Normal tasks`, s: `about 1 min each` },
            { id: `split`, x: 460, y: 220, w: 160, h: 56, t: `Split pieces`, s: `many, about 7 min` },
            { id: `dim`, x: 240, y: 220, w: 160, h: 56, t: `Other side`, s: `replicated for skew` }
          ],
          edges: [
            { id: `a`, a: `orders`, b: `hash`, label: `shuffle` },
            { id: `b`, a: `hash`, b: `hot`, label: `unknown key` },
            { id: `c`, a: `hash`, b: `cold`, label: `other keys` },
            { id: `d`, a: `hash`, b: `split`, label: `split` },
            { id: `e`, a: `dim`, b: `split`, label: `copy` }
          ]
        },
        bug: [
          { log: `Both sides are shuffled by city_id, so rows with the same key go to the same reducer.`, code: 0, hl: { nodes: { orders: `on`, hash: `on` }, edges: { a: `on` } } },
          { log: `38% of orders have the key "unknown", and all of those rows hash to one partition.`, code: 1, hl: { nodes: { hot: `bad`, hash: `warn` }, edges: { b: `bad` } }, stats: [{ l: `Share of rows on one key`, v: `38%`, cls: `bad` }] },
          { log: `The other 199 tasks finish in about a minute, but the hot task reads 780 GB and runs for two hours.`, code: 2, hl: { nodes: { cold: `ok`, hot: `bad` }, edges: { c: `ok` } }, stats: [{ l: `Max vs median`, v: `118 min vs 1.2 min`, cls: `bad` }] },
          { log: `Adding partitions does not help, because the hot key still hashes to one partition.`, code: 2, hl: { nodes: { hot: `bad` } } }
        ],
        fix: [
          { log: `AQE reads the real shuffle sizes after the map stage, and sees one oversized partition.`, code: 0, hl: { nodes: { hash: `ok` } } },
          { log: `The skew join splits the hot partition into several pieces, and copies the other side to each piece.`, code: 2, hl: { nodes: { hot: `dim`, split: `ok`, dim: `ok` }, edges: { d: `ok`, e: `ok` } } },
          { log: `Each piece takes about 7 minutes (illustrative). The stage ends when the largest piece finishes.`, code: 2, hl: { nodes: { split: `ok` } }, stats: [{ l: `Max task`, v: `about 7 min`, cls: `ok` }] }
        ]
      },
      {
        id: `skewed-groupby`,
        label: `Skew in an aggregation`,
        desc: `The skew join only handles joins. A hot key in a groupBy needs a two-phase salted aggregation.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `rev = orders.groupBy("city_id").agg(sum("amount"))`,
            `# AQE is on, but this is an aggregation, not a join`,
            `# the hot key "unknown" is shuffled to one reducer`
          ],
          fix: [
            `salted = orders.withColumn("salt", (rand() * 8).cast("int"))`,
            `partial = salted.groupBy("city_id", "salt").agg(sum("amount").alias("part"))`,
            `rev = partial.groupBy("city_id").agg(sum("part"))`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `src`, x: 20, y: 120, w: 160, h: 56, t: `Rows`, s: `hot key is "unknown"` },
            { id: `shuf`, x: 240, y: 120, w: 160, h: 56, t: `Shuffle by key`, s: `all hot rows together` },
            { id: `fin`, x: 460, y: 120, w: 160, h: 56, t: `Final agg`, s: `one task: hot key` },
            { id: `part`, x: 240, y: 20, w: 160, h: 56, t: `Partial agg`, s: `per task, per salt` },
            { id: `salt`, x: 240, y: 220, w: 160, h: 56, t: `Salted shuffle`, s: `key + salt 0-7` },
            { id: `merge`, x: 460, y: 220, w: 160, h: 56, t: `Merge salts`, s: `key, then final` }
          ],
          edges: [
            { id: `e1`, a: `src`, b: `shuf`, label: `by key` },
            { id: `e2`, a: `shuf`, b: `fin`, label: `one task` },
            { id: `e3`, a: `src`, b: `part`, label: `partial` },
            { id: `e4`, a: `part`, b: `salt`, label: `by key+salt` },
            { id: `e5`, a: `salt`, b: `merge`, label: `small pieces` },
            { id: `e6`, a: `merge`, b: `fin`, label: `final` }
          ]
        },
        bug: [
          { log: `The aggregation shuffles all rows by city_id. AQE skew handling applies to joins, so it does nothing here.`, code: 0, hl: { nodes: { src: `on`, shuf: `on` }, edges: { e1: `on` } } },
          { log: `Every "unknown" row lands on one reducer, which then sums all of them.`, code: 1, hl: { nodes: { shuf: `bad`, fin: `bad` }, edges: { e2: `bad` } }, stats: [{ l: `Max task`, v: `96 min`, cls: `bad` }, { l: `Median task`, v: `1.1 min`, cls: `ok` }] },
          { log: `The final plan has no skew rewrite (isFinalPlan=true, no skew split applied).`, code: 2, hl: { nodes: { fin: `warn` } } }
        ],
        fix: [
          { log: `A random salt spreads the hot key over 8 buckets (illustrative).`, code: 0, hl: { nodes: { src: `ok`, part: `ok` }, edges: { e3: `ok` } } },
          { log: `Partial sums per (city, salt) run in parallel, and the shuffle moves small pieces.`, code: 1, hl: { nodes: { part: `ok`, salt: `ok` }, edges: { e4: `ok`, e1: `dim`, e2: `dim` } }, stats: [{ l: `Reducers for hot key`, v: `8 (illustrative)`, cls: `ok` }] },
          { log: `The second aggregation merges the partial sums for each city.`, code: 2, hl: { nodes: { merge: `ok`, fin: `ok` }, edges: { e5: `ok`, e6: `ok` } }, stats: [{ l: `Totals`, v: `match unsalted`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Join Strategies',
    problem: `A 2 TB order table is joined to a 5 MB city table, filtered to active cities (illustrative). The SQL tab shows a <code>SortMergeJoin</code> with an exchange on both sides. The join stage moves terabytes, while the team believes the city table is tiny. The planner seems to disagree.`,
    predict: {
      q: `The filtered city table is really 4 MB, but its table statistics say 4 GB. What does the planner pick with the default threshold?`,
      opts: [`Broadcast hash join, because it checks the real size`, `Sort-merge join, because it plans from the estimate`, `It fails with an error`],
      ans: 1,
      why: `The planner decides from size <b>estimates</b>, not from the real size. An estimate of 4 GB is above the 10 MB default of <code>spark.sql.autoBroadcastJoinThreshold</code>, so it picks sort-merge unless a hint overrides it.`
    },
    explain: `<h3>The idea</h3>
<p>Sending a small table to every machine is far cheaper than moving a big table across the network. Spark picks the join strategy from size estimates, so a wrong estimate leads to the wrong plan.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>BroadcastHashJoin</b> collects the small side on the driver, sends it to all executors, and joins it without shuffling the big side.</li>
<li><b>SortMergeJoin</b> shuffles both sides by the join key, sorts them, and merges. It scales to big × big joins.</li>
<li><b>ShuffledHashJoin</b> shuffles both sides and builds a hash table from the smaller side in each partition.</li>
<li>The planner compares the size estimate with <code>spark.sql.autoBroadcastJoinThreshold</code> (10 MB by default). Statistics come from <code>ANALYZE TABLE ... COMPUTE STATISTICS</code>. The hints <code>BROADCAST</code>, <code>MERGE</code> and <code>SHUFFLE_HASH</code> override the choice.</li>
<li>With AQE on, a sort-merge join can switch to a broadcast join at runtime, once it sees the real shuffle size. <code>spark.sql.broadcastTimeout</code> (300 seconds) limits how long a broadcast may take.</li>
</ol>
<h3>The trade-off</h3>
<p>Broadcast is the fastest join when the small side really is small. The small side must fit in memory on the driver and on every executor. A hint or a stale estimate that makes a large table look small can turn a fast join into an out-of-memory failure.</p>
<h3>What to look for</h3>
<p>Open the physical plan with <code>explain("formatted")</code>. Look for BroadcastHashJoin or SortMergeJoin, and for Exchange nodes under it. Compare the estimated size of each side with its real size on storage. A join whose output has more rows than its larger input is many-to-many.</p>`,
    diagnose: [
      {
        t: `A large shuffle for a small join side`,
        sym: `The join stage shuffles terabytes and runs for an hour, although one input is a small dimension.`,
        ctx: `The city table is read through a view with a filter, and its statistics come from before the filter (illustrative).`,
        why: `The estimate is above the threshold, so the planner chooses sort-merge and shuffles both sides.`,
        log: `-- representative output, values illustrative
== Physical Plan ==
SortMergeJoin [city_id#12], [id#40], Inner
:- Exchange hashpartitioning(city_id#12, 200)   <- 2 TiB
+- Exchange hashpartitioning(id#40, 200)        <- 4 MiB`,
        note: `An Exchange on both sides of a SortMergeJoin, where one side is tiny, is the sign.`,
        fix: [
          `Measure first: run <code>explain("formatted")</code> and read the join node and the exchanges.`,
          `Fix: run <code>ANALYZE TABLE ... COMPUTE STATISTICS</code> so the estimate is correct, or use the <code>BROADCAST</code> hint on the small side.`,
          `Fix: with AQE on, check whether the runtime switch to broadcast already applies.`,
          `Verify: the plan shows BroadcastHashJoin, and the 2 TB exchange is gone.`
        ]
      },
      {
        t: `Broadcasting a side that is actually huge`,
        sym: `Driver out-of-memory, or a failure after 300 seconds waiting for a broadcast.`,
        ctx: `A hint or a wrong low estimate makes the planner broadcast a table that is really tens of GB (illustrative).`,
        why: `The broadcast side is collected on the driver and sent to every executor. Its real size, not the estimate, decides the memory and time it costs.`,
        log: `-- representative output, wording varies by version
org.apache.spark.SparkException: Could not execute broadcast in 300 secs. You can increase the timeout for broadcasts via spark.sql.broadcastTimeout or disable broadcast join by setting spark.sql.autoBroadcastJoinThreshold to -1`,
        note: `This message, or a driver OutOfMemoryError during a join, points at a broadcast of a large side.`,
        fix: [
          `Measure first: compare the estimated size in the plan with the actual table size on storage.`,
          `Fix: correct the statistics, or remove the wrong <code>BROADCAST</code> hint and use <code>MERGE</code>.`,
          `Fix: raise <code>spark.sql.broadcastTimeout</code> only after you measured that the side is small enough to be worth broadcasting.`,
          `Verify: the broadcast stage finishes quickly, and the driver heap stays flat.`
        ]
      },
      {
        t: `Many-to-many keys make the join output explode`,
        sym: `The join output has far more rows than either input, and tasks run out of disk or time.`,
        ctx: `Both sides have repeated <code>city_id</code> values: a daily snapshot table joined to every order (illustrative).`,
        why: `A key with a rows on one side and b rows on the other produces a × b output rows.`,
        log: `-- representative output, values illustrative
orders: 41,200,000 rows   city_snapshots: 40 versions per city
join output: 1,648,000,000 rows (expected ≈ 41,200,000)`,
        note: `Output rows far above the larger input mean a many-to-many join.`,
        fix: [
          `Measure first: run a count by key on both sides before the join.`,
          `Fix: reduce one side to one row per key, for example the latest snapshot, or an aggregate.`,
          `Fix: add the missing key column, such as the date, to the join condition.`,
          `Verify: output rows equal the larger input's row count for a key-unique join.`
        ]
      }
    ],
    source: { label: `Original: Join Strategies`, href: `01-spark-internals-end-to-end.html#ch7` },
    scenarios: [
      {
        id: `broadcast-or-shuffle`,
        label: `Estimate picks the join`,
        desc: `Stale statistics say 4 GB, so the planner shuffles 2 TB. Refreshing the estimate, or hinting, lets it broadcast the 4 MB table.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `# statistics for dim.cities are stale: estimate 4 GB`,
            `cities = spark.table("dim.cities").filter(col("active"))`,
            `orders.join(cities, "city_id")   # 4 GB > 10 MB threshold`,
            `# the planner picks SortMergeJoin: 2 TB is shuffled too`
          ],
          fix: [
            `ANALYZE TABLE dim.cities COMPUTE STATISTICS   # estimate becomes 4 MB`,
            `orders.join(broadcast(cities), "city_id")     # hint: small side is broadcast`,
            `# BroadcastHashJoin: no shuffle of orders`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `cities`, x: 20, y: 20, w: 160, h: 56, t: `City table`, s: `real size: 4 MB` },
            { id: `stats`, x: 20, y: 120, w: 160, h: 56, t: `Statistics`, s: `estimate: 4 GB` },
            { id: `orders`, x: 20, y: 220, w: 160, h: 56, t: `Orders, 2 TB`, s: `large side` },
            { id: `pl`, x: 240, y: 120, w: 160, h: 56, t: `Planner`, s: `threshold 10 MB` },
            { id: `bj`, x: 460, y: 20, w: 160, h: 56, t: `BroadcastHashJoin`, s: `no shuffle of orders` },
            { id: `sm`, x: 460, y: 220, w: 160, h: 56, t: `SortMergeJoin`, s: `shuffle both sides` }
          ],
          edges: [
            { id: `a`, a: `cities`, b: `stats`, label: `analyze` },
            { id: `b`, a: `stats`, b: `pl`, label: `estimate` },
            { id: `c`, a: `pl`, b: `bj`, label: `small or hint` },
            { id: `d`, a: `pl`, b: `sm`, label: `estimate above` },
            { id: `e`, a: `orders`, b: `sm`, label: `shuffle` }
          ]
        },
        bug: [
          { log: `The city table is filtered, but its statistics still show the size from before the filter (illustrative).`, code: 0, hl: { nodes: { stats: `warn`, cities: `on` }, edges: { a: `dim` } } },
          { log: `The planner reads the estimate of 4 GB, which is above the 10 MB spark.sql.autoBroadcastJoinThreshold.`, code: 2, hl: { nodes: { pl: `warn` }, edges: { b: `on`, d: `bad` } }, stats: [{ l: `Estimate vs threshold`, v: `4 GB vs 10 MB`, cls: `bad` }] },
          { log: `SortMergeJoin puts an exchange on both sides, so the 2 TB of orders is shuffled.`, code: 3, hl: { nodes: { sm: `bad`, orders: `bad` }, edges: { e: `bad` } }, stats: [{ l: `Shuffled`, v: `2 TB`, cls: `bad` }] },
          { log: `The join stage runs for an hour, although one of its inputs is a 4 MB table (illustrative).`, code: 3, hl: { nodes: { cities: `warn` } } }
        ],
        fix: [
          { log: `ANALYZE TABLE refreshes the statistics, so the estimate becomes 4 MB.`, code: 0, hl: { nodes: { stats: `ok`, cities: `ok` }, edges: { a: `ok` } }, stats: [{ l: `Estimate`, v: `4 MB`, cls: `ok` }] },
          { log: `The broadcast() hint also tells the planner to broadcast the small side.`, code: 1, hl: { nodes: { pl: `ok`, bj: `ok` }, edges: { c: `ok`, d: `dim` } } },
          { log: `The 4 MB table is copied to each executor, and orders is joined in place without a shuffle.`, code: 2, hl: { nodes: { bj: `ok`, orders: `ok` }, edges: { e: `dim` } }, stats: [{ l: `Orders shuffled`, v: `0 B`, cls: `ok` }] }
        ]
      },
      {
        id: `broadcast-too-big`,
        label: `Broadcast too big`,
        desc: `The side looks small, but it is really 30 GB. The driver collects it and every executor gets a copy.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `big = orders.join(broadcast(side), "city_id")   # the hint forces a broadcast`,
            `# side is really 30 GB, but the estimate said 300 MB`,
            `# the driver collects 30 GB, then sends it to every executor`,
            `# the broadcast must finish within spark.sql.broadcastTimeout (300 s)`
          ],
          fix: [
            `ANALYZE TABLE side COMPUTE STATISTICS   # estimate now 30 GB`,
            `# no broadcast hint: the planner uses the real estimate`,
            `big = orders.join(side, "city_id")     # sort-merge, both sides shuffled`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `src`, x: 20, y: 120, w: 160, h: 56, t: `Small-looking side`, s: `really 30 GB` },
            { id: `drv`, x: 240, y: 20, w: 160, h: 56, t: `Driver`, s: `collects 30 GB` },
            { id: `ex1`, x: 460, y: 20, w: 160, h: 56, t: `Executor 1`, s: `copy of 30 GB` },
            { id: `ex2`, x: 460, y: 120, w: 160, h: 56, t: `Executors 2-50`, s: `copy of 30 GB each` },
            { id: `srt`, x: 240, y: 220, w: 160, h: 56, t: `Sort-merge plan`, s: `both sides shuffled` },
            { id: `jn`, x: 460, y: 220, w: 160, h: 56, t: `Join runs`, s: `tasks on the cluster` }
          ],
          edges: [
            { id: `a`, a: `src`, b: `drv`, label: `collect` },
            { id: `b`, a: `drv`, b: `ex1`, label: `broadcast` },
            { id: `c`, a: `drv`, b: `ex2`, label: `broadcast` },
            { id: `d`, a: `src`, b: `srt`, label: `no hint` },
            { id: `e`, a: `srt`, b: `jn`, label: `join` }
          ]
        },
        bug: [
          { log: `The hint overrides the planner. The side is collected to the driver, which must hold 30 GB.`, code: 0, hl: { nodes: { src: `on`, drv: `bad` }, edges: { a: `bad` } }, stats: [{ l: `Driver memory`, v: `30 GB`, cls: `bad` }] },
          { log: `Each executor receives its own copy, so about 1.5 TB moves over the network (illustrative).`, code: 2, hl: { nodes: { ex1: `bad`, ex2: `bad` }, edges: { b: `bad`, c: `bad` } }, stats: [{ l: `Copies`, v: `50 × 30 GB`, cls: `bad` }] },
          { log: `The broadcast does not finish within the timeout, and the join fails.`, code: 3, hl: { nodes: { drv: `bad` } }, stats: [{ l: `Timeout`, v: `300 s`, cls: `bad` }] }
        ],
        fix: [
          { log: `The statistics now show the real size of the side (30 GB), so the planner does not choose a broadcast.`, code: 0, hl: { nodes: { src: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Estimate`, v: `30 GB`, cls: `ok` }] },
          { log: `Without the hint, the planner chooses the sort-merge plan. Both sides are shuffled and sorted.`, code: 2, hl: { nodes: { srt: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Driver memory`, v: `small`, cls: `ok` }] },
          { log: `The join runs as tasks on the cluster, so no single machine holds the 30 GB.`, code: 2, hl: { nodes: { jn: `ok` }, edges: { e: `ok` } } }
        ]
      }
    ]
  },
  {
    title: 'Executor Memory and Spill',
    problem: `Executors have 16 GB and 4 cores (illustrative). After the input grew, the shuffle partitions are about 2 GB each. The stage page shows large <code>Spill (Memory)</code> and <code>Spill (Disk)</code> numbers, and then tasks fail with <code>java.lang.OutOfMemoryError</code>. A teammate proposes doubling <code>spark.executor.cores</code> to "use the machine better" without changing memory.`,
    predict: {
      q: `Doubling <code>spark.executor.cores</code> with the same executor memory. What happens to the execution memory available per task?`,
      opts: [`It stays the same`, `It halves, because tasks share the same pool`, `It doubles, because there are more cores`],
      ans: 1,
      why: `The unified pool belongs to the executor. With twice as many tasks running at once, each one has on average half as much, so partitions that fit before can now spill or fail.`
    },
    explain: `<h3>The idea</h3>
<p>One executor's memory is shared by every task running in it. More cores mean more tasks at the same time, so each task gets a smaller slice. Memory per task is the pool divided by the number of concurrent tasks, so cores and memory must be sized together.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>Unified memory</b>: <code>(heap − 300 MB reserved) × spark.memory.fraction</code> (0.6 by default) forms one pool. Execution (shuffles, sorts, joins) and storage (cache) both use it.</li>
<li><code>spark.memory.storageFraction</code> (0.5) is the part of the pool that cached data keeps from being evicted by execution. Execution can borrow the storage memory that is not in use.</li>
<li><b>Per-task share</b>: with N tasks running, each task gets roughly between 1/(2N) and 1/N of the pool.</li>
<li><b>Spill</b>: when a task's data is larger than its share, it writes the excess to disk. This is correct but slow. A very large spill can still end in an out-of-memory error.</li>
<li><b>Overhead</b>: <code>spark.executor.memoryOverhead</code> (the larger of 384 MiB and 10% of executor memory by default) covers off-heap, native and Python memory. It counts toward the container limit.</li>
</ol>
<h3>The trade-off</h3>
<p>Many cores per executor use the machine with fewer processes, but each task gets less memory and garbage collection gets harder. Smaller executors with fewer cores often handle big partitions more safely, at the cost of more processes.</p>
<h3>What to look for</h3>
<p>On the stage page, compare Spill (Memory) and Spill (Disk) with the task input. In the Executors tab, compare GC Time with Task Time. A container kill with exit code 137 and no Java OutOfMemoryError means memory outside the heap, so look at the overhead first.</p>`,
    diagnose: [
      {
        t: `Large partitions lead to spill and OOM`,
        sym: `The stage page shows <code>Spill (Disk)</code> in the tens of GB per task, and then tasks fail.`,
        ctx: `2 TB over 1,000 partitions on 16 GB, 4-core executors (illustrative).`,
        why: `A task with 2 GB of input wants several GB for sorting or aggregating. Its share of the pool is smaller, so it spills heavily or runs out of memory.`,
        log: `-- representative output, values illustrative
Stage 5: Spill (Memory) 31 GiB, Spill (Disk) 6.2 GiB for task 211
Task 211 failed: java.lang.OutOfMemoryError: Java heap space`,
        note: `The Spill columns are in the stage task summary.`,
        fix: [
          `Measure first: read Spill (Disk) and the task input size on the stage page.`,
          `Fix: more partitions (smaller per task), or fewer cores per executor, or more memory.`,
          `Fix: avoid caching so much that execution cannot borrow memory.`,
          `Verify: spill falls to near zero, and tasks stop failing.`
        ]
      },
      {
        t: `The container is killed for exceeding memory limits`,
        sym: `Executors vanish with exit code 137 or an <code>OOMKilled</code> status, with no Java OutOfMemoryError.`,
        ctx: `A PySpark job runs Python workers next to the JVM on Kubernetes (illustrative).`,
        why: `The container limit counts the heap plus the overhead, including Python and native memory. The JVM heap can be fine while the process is killed from outside.`,
        log: `-- representative output, wording varies by version
ExecutorLostFailure (executor 9 exited caused by one of the running tasks) Reason: Container killed by YARN for exceeding memory limits. 16.5 GB of 16 GB physical memory used. Consider boosting spark.executor.memoryOverhead.
(Kubernetes: lastState.terminated.reason=OOMKilled, exitCode=137)`,
        note: `No Java OOM stack trace together with a container kill points to memory outside the heap.`,
        fix: [
          `Measure first: confirm exit code 137 or the container-kill message, and whether Python or off-heap use is large.`,
          `Fix: raise <code>spark.executor.memoryOverhead</code>.`,
          `Fix: use fewer cores per executor, so fewer Python workers share the overhead.`,
          `Verify: no more container kills over a full run.`
        ]
      },
      {
        t: `Long GC pauses in a huge heap shared by many cores`,
        sym: `The Executors tab shows GC Time as a big share of task time.`,
        ctx: `One executor with 64 GB and 16 cores (illustrative), after "bigger is better".`,
        why: `A large heap with many threads allocating at once has long garbage-collection pauses, and those pauses stall all the tasks in the executor.`,
        log: `-- representative output, values illustrative
Executors tab: executor 4  Task Time (GC Time)  41 min (17 min)`,
        note: `GC time above roughly 10% of task time is usually worth attention.`,
        fix: [
          `Measure first: read GC Time against Task Time in the Executors tab.`,
          `Fix: run smaller executors (for example, fewer cores and moderate memory each) and more of them.`,
          `Fix: reduce object churn by selecting fewer columns and avoiding large intermediate collections.`,
          `Verify: the GC share falls, and stage times become steadier.`
        ]
      }
    ],
    source: { label: `Original: Executor Memory and Spill`, href: `01-spark-internals-end-to-end.html#ch8` },
    scenarios: [
      {
        id: `cores-share-pool`,
        label: `Cores share one pool`,
        desc: `Doubling the cores halves each task's share of the same pool. A 2 GB partition then spills and fails.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.executor.memory = 16g`,
            `spark.executor.cores = 8     # doubled: 8 tasks at once`,
            `# the pool stays about 9.4 GB, so each task gets about 1.2 GB`,
            `# a 2 GB partition does not fit, so it spills, then fails`
          ],
          fix: [
            `spark.executor.memory = 16g`,
            `spark.executor.cores = 4     # tasks at once that fit the pool`,
            `# partitions of about 128 MB: each fits its share of about 2.4 GB`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `pool`, x: 20, y: 120, w: 160, h: 56, t: `Unified pool`, s: `about 9.4 GB` },
            { id: `t1`, x: 240, y: 20, w: 160, h: 56, t: `Task 1`, s: `share ≈ pool ÷ 4` },
            { id: `t2`, x: 240, y: 120, w: 160, h: 56, t: `Task 2`, s: `share ≈ pool ÷ 4` },
            { id: `t3`, x: 240, y: 220, w: 160, h: 56, t: `Tasks 3-4`, s: `share ≈ pool ÷ 4` },
            { id: `ok`, x: 460, y: 120, w: 160, h: 56, t: `Execution`, s: `runs in memory` },
            { id: `sp`, x: 460, y: 220, w: 160, h: 56, t: `Spill to disk`, s: `when share is small` }
          ],
          edges: [
            { id: `a`, a: `pool`, b: `t1`, label: `share` },
            { id: `b`, a: `pool`, b: `t2`, label: `share` },
            { id: `c`, a: `pool`, b: `t3`, label: `share` },
            { id: `d`, a: `t2`, b: `ok`, label: `fits` },
            { id: `e`, a: `t3`, b: `sp`, label: `too big` }
          ]
        },
        bug: [
          { log: `Cores are doubled to 8, so eight tasks now run at once in the same executor.`, code: 1, hl: { nodes: { pool: `on`, t1: `on` } }, stats: [{ l: `Concurrent tasks`, v: `8`, cls: `warn` }] },
          { log: `The unified pool stays at about 9.4 GB, so each task's share drops to about 1.2 GB.`, code: 2, hl: { nodes: { pool: `warn`, t1: `warn`, t2: `warn`, t3: `warn` }, edges: { a: `warn`, b: `warn`, c: `warn` } }, stats: [{ l: `Share per task`, v: `about 1.2 GB`, cls: `bad` }] },
          { log: `A 2 GB partition does not fit in 1.2 GB, so the task spills to disk.`, code: 3, hl: { nodes: { t3: `bad`, sp: `bad` }, edges: { e: `bad` } }, stats: [{ l: `Spill (Disk)`, v: `tens of GB`, cls: `bad` }] },
          { log: `The spill runs out of memory, and the task fails with java.lang.OutOfMemoryError: Java heap space.`, code: 3, hl: { nodes: { sp: `bad` } }, stats: [{ l: `Task`, v: `failed`, cls: `bad` }] }
        ],
        fix: [
          { log: `Cores are set back to 4, so four tasks share the pool, and each share is about 2.4 GB.`, code: 1, hl: { nodes: { pool: `ok`, t1: `ok`, t2: `ok`, t3: `ok` }, edges: { a: `ok`, b: `ok`, c: `ok` } }, stats: [{ l: `Share per task`, v: `about 2.4 GB`, cls: `ok` }] },
          { log: `Partitions of about 128 MB sit inside that share, so execution does not need to spill.`, code: 2, hl: { nodes: { t2: `ok`, ok: `ok` }, edges: { d: `ok`, e: `dim` } }, stats: [{ l: `Spill (Disk)`, v: `0`, cls: `ok` }] },
          { log: `Spill stays at zero, and no task fails with an out-of-memory error.`, code: 2, hl: { nodes: { ok: `ok`, sp: `dim` } } }
        ]
      },
      {
        id: `container-killed`,
        label: `Container killed`,
        desc: `The JVM heap is fine. The Python workers and off-heap memory push the container past its limit, so it is killed.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.executor.memory = 12g`,
            `spark.executor.memoryOverhead = 1g   # too small for Python workers`,
            `# container limit = heap + overhead = 13 GB (illustrative)`,
            `# Python workers use more than the 1 GB overhead (illustrative)`
          ],
          fix: [
            `spark.executor.memory = 12g`,
            `spark.executor.memoryOverhead = 4g   # room for Python and off-heap`,
            `# container limit = heap + overhead = 16 GB`,
            `# fewer cores: fewer Python workers share the overhead`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `cont`, x: 20, y: 120, w: 160, h: 56, t: `Container`, s: `limit set by YARN` },
            { id: `hp`, x: 240, y: 20, w: 160, h: 56, t: `JVM heap`, s: `about 12 GB, fine` },
            { id: `ov`, x: 240, y: 220, w: 160, h: 56, t: `Overhead`, s: `off-heap, Python` },
            { id: `py`, x: 460, y: 220, w: 160, h: 56, t: `Python workers`, s: `outside the heap` },
            { id: `kl`, x: 460, y: 120, w: 160, h: 56, t: `Kill signal`, s: `exit code 137` }
          ],
          edges: [
            { id: `a`, a: `hp`, b: `cont`, label: `counts` },
            { id: `b`, a: `ov`, b: `cont`, label: `counts` },
            { id: `c`, a: `py`, b: `ov`, label: `uses` },
            { id: `d`, a: `cont`, b: `kl`, label: `over limit` }
          ]
        },
        bug: [
          { log: `The JVM heap is 12 GB and is fine. No Java OutOfMemoryError is thrown.`, code: 0, hl: { nodes: { hp: `ok` } }, stats: [{ l: `Heap`, v: `fine`, cls: `ok` }] },
          { log: `Python workers use memory outside the heap, and a 1 GB overhead is too small for them.`, code: 1, hl: { nodes: { py: `bad`, ov: `bad` }, edges: { c: `bad`, b: `bad` } }, stats: [{ l: `Overhead`, v: `exceeded`, cls: `bad` }] },
          { log: `The container goes over its limit, and the cluster manager sends a kill signal.`, code: 2, hl: { nodes: { cont: `bad`, kl: `bad` }, edges: { d: `bad` } }, stats: [{ l: `Exit code`, v: `137`, cls: `bad` }] },
          { log: `The executor is lost. The driver logs ExecutorLostFailure, and the task is retried elsewhere.`, code: 3, hl: { nodes: { kl: `bad` } } }
        ],
        fix: [
          { log: `memoryOverhead is raised to 4 GB, so the container limit grows to 16 GB.`, code: 1, hl: { nodes: { ov: `ok`, cont: `ok` }, edges: { b: `ok` } }, stats: [{ l: `Container limit`, v: `16 GB`, cls: `ok` }] },
          { log: `Python workers and off-heap use now fit inside the overhead.`, code: 3, hl: { nodes: { py: `ok` }, edges: { c: `ok` } } },
          { log: `Run a full job and check that no container is killed.`, code: 2, hl: { nodes: { kl: `dim` }, edges: { d: `dim` } }, stats: [{ l: `Container kills`, v: `0`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Action Results and Output Commit',
    problem: `The report writes its result as files for a BI tool. Speculation is on, and a node dies while the job is still writing. In the morning the output folder has one partition twice, so revenue is doubled for some cities, and a few files hold only half their rows. The BI tool had already loaded them (illustrative).`,
    predict: {
      q: `With a commit protocol, when can a downstream reader first see the output files?`,
      opts: [`As soon as each task finishes writing`, `Only after the job commit`, `After the first task commit`],
      ans: 1,
      why: `Task output goes to temporary attempt paths. Only the job commit moves the winning attempts into the final location, so a reader sees all of the output or none of it.`
    },
    explain: `<h3>The idea</h3>
<p>Tasks finish in any order, a task can run twice, and the whole job can die halfway. Readers must still see only whole, correct output. So each attempt writes privately, the driver picks one winner per task, and all winners are published together at job commit.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>Result merge</b>: <code>count</code> and <code>collect</code> send results to the driver, which orders them by partition index, not by arrival time. The total is capped by <code>spark.driver.maxResultSize</code> (1 GiB by default).</li>
<li><b>Task attempt</b> writes under its own temporary path, so a retried or speculative copy cannot overwrite another attempt.</li>
<li><b>Task commit</b>: the driver authorises one attempt per task. The other attempts are aborted, and their files are discarded.</li>
<li><b>Job commit</b> publishes all committed files at once, and writes <code>_SUCCESS</code>. If the job dies before this step, the final location is untouched.</li>
<li><b>Object stores</b> have no atomic rename. The rename-based protocol is slow or unsafe there, so use an object-store committer from the cloud integration module.</li>
</ol>
<h3>The trade-off</h3>
<p>The commit protocol protects readers, but the final publish takes time. On an object store that time can dominate the whole job. Returning results to the driver has its own limit: anything large should be written to storage, not collected.</p>
<h3>What to look for</h3>
<p>Count the files under the output path, and divide the total size by the count. Look at the commit phase separately. If it takes far longer than the last task, the commit protocol is the cost, not the compute.</p>`,
    diagnose: [
      {
        t: `collect() overwhelms the driver`,
        sym: `The job aborts with a message about <code>spark.driver.maxResultSize</code>, or the driver runs out of memory.`,
        ctx: `A notebook calls <code>collect()</code> on a DataFrame that turned out to have hundreds of millions of rows (illustrative).`,
        why: `All task results are sent to the driver and held there. The driver's memory and the result-size cap are far smaller than the cluster.`,
        log: `-- representative output, wording varies by version
org.apache.spark.SparkException: Job aborted due to stage failure: Total size of serialized results of 1432 tasks (1025.0 MiB) is bigger than spark.driver.maxResultSize (1024.0 MiB)`,
        note: `The cap protects the driver. Fix the action, not the cap.`,
        fix: [
          `Measure first: count the rows you are about to collect, with <code>count()</code> or an estimate.`,
          `Fix: aggregate on the cluster, use <code>limit</code> or <code>take</code>, or write to storage instead of collecting.`,
          `Fix: only raise <code>spark.driver.maxResultSize</code> and <code>spark.driver.memory</code> for results you know are small enough.`,
          `Verify: the bytes returned to the driver are small, and the driver heap is stable.`
        ]
      },
      {
        t: `Thousands of tiny output files`,
        sym: `The output folder has 20,000 files of a few KB each, and downstream readers are slow.`,
        ctx: `A write after a wide stage, partitioned by city, produces one file per partition per city (illustrative).`,
        why: `Each task writes at least one file for each output key it holds. Many partitions times many keys is many tiny files.`,
        log: `-- representative output, values illustrative
hdfs dfs -count out/date=2026-10-07
 20211        0          81,200,000 out/date=2026-10-07   (avg 4 KB per file)`,
        note: `An average file size well below the target (for example 128 MB) is the problem.`,
        fix: [
          `Measure first: count the files and compute the average size under the output path.`,
          `Fix: <code>coalesce</code> or repartition by the partition column before writing, and set <code>spark.sql.files.maxRecordsPerFile</code> to bound large files.`,
          `Fix: compact old partitions in a separate maintenance job.`,
          `Verify: the file count falls, and the average size approaches the target.`
        ]
      },
      {
        t: `INSERT OVERWRITE of one partition wipes the others`,
        sym: `After a re-run for one day, all other days in the table are gone.`,
        ctx: `A backfill rewrites yesterday with <code>INSERT OVERWRITE</code> into a partitioned table (illustrative).`,
        why: `By default <code>spark.sql.sources.partitionOverwriteMode</code> is <code>static</code>. The static mode clears every partition that matches the statement, not only the ones it writes.`,
        log: `-- representative output, values illustrative
SELECT date, count(*) FROM orders_out GROUP BY date;
2026-10-07   41,200,000
(all earlier dates missing)`,
        note: `Check this setting before any partial overwrite.`,
        fix: [
          `Measure first: read the current value of <code>spark.sql.sources.partitionOverwriteMode</code>, and test on a copy.`,
          `Fix: set it to <code>dynamic</code>, so only the partitions with new data are replaced.`,
          `Fix: or keep a table-format layer that supports atomic partition replacement.`,
          `Verify: after a one-day re-run, the other days still have their row counts.`
        ]
      },
      {
        t: `Rename-based commit on an object store`,
        sym: `The job's last minutes are spent in a long job-commit step, and a failure can leave partial data.`,
        ctx: `The report writes to S3 with the default file committer (illustrative).`,
        why: `The default commit protocol renames files at task and job commit. On an object store a rename is a copy and a delete, which is slow and not atomic.`,
        log: `-- representative output, values illustrative
INFO FileOutputCommitter: Saved output of task attempt_...  (rename: 4,100 ms per file)
Job commit: 41 min for 20,000 files`,
        note: `A very long job commit after all tasks are done points to rename cost.`,
        fix: [
          `Measure first: time the commit phase separately from the compute phase.`,
          `Fix: use an object-store committer such as the S3A committers (see <code>fs.s3a.committer.name</code>) with the cloud integration module.`,
          `Fix: or write to a table format that commits through a metadata file.`,
          `Verify: the job commit takes seconds, and a killed job leaves no partial data visible.`
        ]
      }
    ],
    source: { label: `Original: Action Results and Output Commit`, href: `01-spark-internals-end-to-end.html#ch9` },
    scenarios: [
      {
        id: `commit-protocol`,
        label: `Attempts, then one commit`,
        desc: `Without a commit protocol, a speculative copy and a dead node leave duplicates and half files. With it, the job commit publishes one attempt per task.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.speculation = true`,
            `# each attempt writes straight into out/date=2026-10-07/`,
            `# a speculative copy writes partition 7 a second time`,
            `# the BI tool reads the folder while the job is still running`
          ],
          fix: [
            `# each attempt writes to a private temporary path`,
            `# the driver commits exactly one attempt per task`,
            `# job commit moves all committed files into out/ at once, then writes _SUCCESS`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `a1`, x: 20, y: 20, w: 160, h: 56, t: `Attempt 0`, s: `temp path, part 7` },
            { id: `a2`, x: 20, y: 120, w: 160, h: 56, t: `Attempt 1`, s: `speculative copy` },
            { id: `tc`, x: 240, y: 120, w: 160, h: 56, t: `Task commit`, s: `one attempt wins` },
            { id: `abort`, x: 240, y: 220, w: 160, h: 56, t: `Discarded`, s: `losing attempt files` },
            { id: `fin`, x: 460, y: 20, w: 160, h: 56, t: `Final folder`, s: `readers look here` },
            { id: `jc`, x: 460, y: 120, w: 160, h: 56, t: `Job commit`, s: `publish all files` },
            { id: `succ`, x: 460, y: 220, w: 160, h: 56, t: `_SUCCESS`, s: `readers see output` }
          ],
          edges: [
            { id: `e1`, a: `a1`, b: `tc`, label: `commit` },
            { id: `e2`, a: `a2`, b: `abort`, label: `abort` },
            { id: `e3`, a: `tc`, b: `jc`, label: `publish` },
            { id: `e4`, a: `jc`, b: `fin`, label: `move files` },
            { id: `e5`, a: `jc`, b: `succ`, label: `write` },
            { id: `e6`, a: `a1`, b: `fin`, label: `direct write` },
            { id: `e7`, a: `a2`, b: `fin`, label: `duplicate` }
          ]
        },
        bug: [
          { log: `Speculation starts a second copy of a slow task, so two attempts now write partition 7.`, code: 0, hl: { nodes: { a1: `warn`, a2: `warn` } }, stats: [{ l: `Attempts on partition 7`, v: `2`, cls: `warn` }] },
          { log: `Both attempts write straight into the final folder, so partition 7 appears twice.`, code: 1, hl: { nodes: { fin: `bad` }, edges: { e6: `bad`, e7: `bad` } }, stats: [{ l: `Rows for partition 7`, v: `2 copies`, cls: `bad` }] },
          { log: `A node dies mid-write, so one file holds only half of its rows.`, code: 2, hl: { nodes: { a2: `bad` } }, stats: [{ l: `Partial files`, v: `1`, cls: `bad` }] },
          { log: `The BI tool reads the folder before the job ends, and it already shows the wrong numbers.`, code: 3, hl: { nodes: { fin: `bad` } } }
        ],
        fix: [
          { log: `Each attempt writes to its own temporary path, so a copy cannot overwrite another attempt.`, code: 0, hl: { nodes: { a1: `ok`, a2: `ok` }, edges: { e6: `dim`, e7: `dim` } } },
          { log: `The driver commits one attempt for partition 7, and aborts the other. Its files are discarded.`, code: 1, hl: { nodes: { tc: `ok`, abort: `ok` }, edges: { e1: `ok`, e2: `ok` } }, stats: [{ l: `Committed attempts per task`, v: `1`, cls: `ok` }] },
          { log: `At job commit, all committed files move to the final folder together, and _SUCCESS is written.`, code: 2, hl: { nodes: { jc: `ok`, fin: `ok`, succ: `ok` }, edges: { e3: `ok`, e4: `ok`, e5: `ok` } }, stats: [{ l: `Readers see`, v: `whole output only`, cls: `ok` }] }
        ]
      },
      {
        id: `rename-commit`,
        label: `Object store commit`,
        desc: `On S3, a rename is a copy and a delete for each file. The commit step can take longer than the compute itself.`,
        codeLabel: `Code`,
        code: {
          bug: [
            `df.write.parquet("s3a://bi-bucket/out/2026-10-07")   # default file committer`,
            `# task commit and job commit rename every file`,
            `# on S3 each rename is a copy, then a delete`
          ],
          fix: [
            `# set fs.s3a.committer.name to an S3A committer (cloud integration module)`,
            `df.write.parquet("s3a://bi-bucket/out/2026-10-07")`,
            `# the committer writes a manifest, then publishes without per-file rename`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `tasks`, x: 20, y: 120, w: 160, h: 56, t: `Finished tasks`, s: `20,000 temp files` },
            { id: `rn`, x: 240, y: 20, w: 160, h: 56, t: `Rename per file`, s: `copy then delete` },
            { id: `cm`, x: 240, y: 220, w: 160, h: 56, t: `Manifest commit`, s: `no rename (fix)` },
            { id: `fin`, x: 460, y: 120, w: 160, h: 56, t: `Final folder`, s: `published at commit` },
            { id: `tm`, x: 460, y: 20, w: 160, h: 56, t: `Commit time`, s: `41 min for 20,000` }
          ],
          edges: [
            { id: `a`, a: `tasks`, b: `rn`, label: `rename` },
            { id: `b`, a: `rn`, b: `fin`, label: `copy + delete` },
            { id: `c`, a: `tasks`, b: `cm`, label: `manifest` },
            { id: `d`, a: `cm`, b: `fin`, label: `publish` },
            { id: `e`, a: `rn`, b: `tm`, label: `slow` }
          ]
        },
        bug: [
          { log: `The job has 20,000 finished files in temporary locations (illustrative).`, code: 0, hl: { nodes: { tasks: `on` } }, stats: [{ l: `Files`, v: `20,000`, cls: `warn` }] },
          { log: `The job commit renames every file. On S3 each rename is a copy plus a delete.`, code: 1, hl: { nodes: { rn: `bad` }, edges: { a: `bad`, b: `bad` } }, stats: [{ l: `Rename per file`, v: `4,100 ms (illustr.)`, cls: `bad` }] },
          { log: `The renames run one after another during the commit, after the compute is already finished.`, code: 2, hl: { nodes: { tm: `bad` }, edges: { e: `bad` } }, stats: [{ l: `Job commit`, v: `41 min`, cls: `bad` }] },
          { log: `If a failure hits during this step, some files can be published and others not.`, code: 2, hl: { nodes: { fin: `warn` } } }
        ],
        fix: [
          { log: `The committer writes a manifest of the finished files, instead of renaming them one by one.`, code: 2, hl: { nodes: { cm: `ok` }, edges: { c: `ok` } } },
          { log: `The manifest is published in one step, so the job commit takes seconds (illustrative).`, code: 1, hl: { nodes: { cm: `ok`, fin: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Job commit`, v: `seconds`, cls: `ok` }] },
          { log: `A killed job leaves no partial data visible to readers.`, code: 2, hl: { nodes: { rn: `dim`, fin: `ok` }, edges: { a: `dim`, b: `dim` } }, stats: [{ l: `Partial data visible`, v: `none`, cls: `ok` }] }
        ]
      }
    ]
  },
  {
    title: 'Events, UI and Explain',
    problem: `The nightly job normally takes 20 minutes. Last night it took 3 hours (illustrative), and the scheduler cleaned up the application when it ended. The Spark UI link now returns nothing. The on-call engineer has the application ID and 20 minutes before the review, and must say which stage was slow and why.`,
    predict: {
      q: `After the application has ended, where does the history server's "failed tasks: 1" count come from?`,
      opts: [`From the executors' local logs`, `From replaying <code>SparkListenerTaskEnd</code> events stored in the event log`, `From the cluster manager's container list`],
      ans: 1,
      why: `With <code>spark.eventLog.enabled=true</code>, the driver writes its listener events to <code>spark.eventLog.dir</code>. The history server replays them and rebuilds the same UI. No event log means no history.`
    },
    explain: `<h3>The idea</h3>
<p>The driver writes one ordered stream of facts about the job. The live UI, the event log and the history server are all views built from that same stream, so they agree with each other. Plans are printed from metadata, not from a running job.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>Listener bus</b>: the driver posts ordered events, such as <code>SparkListenerJobStart</code>, <code>SparkListenerStageSubmitted</code>, <code>SparkListenerTaskEnd</code> and <code>SparkListenerStageCompleted</code>.</li>
<li><b>UI and metrics</b> are listeners. They fold the events into stage and task tables. Nothing is read from the executors after the fact.</li>
<li><b>Event log</b>: with <code>spark.eventLog.enabled</code> (off by default) and <code>spark.eventLog.dir</code>, the same events are written as JSON lines. <code>spark.eventLog.rolling.enabled</code> splits the log into several files.</li>
<li><b>History server</b> replays the event log from <code>spark.history.fs.logDirectory</code> and shows the finished application.</li>
<li><b>Explain</b>: <code>Dataset.explain("formatted")</code> prints the plan. With AQE, <code>AdaptiveSparkPlan isFinalPlan=false</code> means the plan can still change while the query runs.</li>
</ol>
<h3>The trade-off</h3>
<p>Writing the event log costs a little I/O, and one huge log file is slow to replay. Rolling logs fix that, but you must decide how many files to keep. Treat any plan printed before the run as a guess until the final plan is shown.</p>
<h3>What to look for</h3>
<p>Start with the event log directory, and confirm the application ID has a file. Then open the SQL tab in the history server and read the final plan, not the plan printed by <code>explain</code>. Sort the stages by duration to find the slow one, then open its task table.</p>`,
    diagnose: [
      {
        t: `No event log, so nothing to look at later`,
        sym: `The history server lists no application for last night's run.`,
        ctx: `The job was launched with a default configuration (illustrative).`,
        why: `<code>spark.eventLog.enabled</code> is false by default. Without it, nothing is written for the history server to replay.`,
        log: `-- representative output, values illustrative
spark-submit --conf spark.eventLog.enabled=false ...
History Server: "No completed applications found!"`,
        note: `Turn it on for every production job.`,
        fix: [
          `Measure first: check whether <code>spark.eventLog.dir</code> has a file for the application ID.`,
          `Fix: set <code>spark.eventLog.enabled=true</code> and a durable <code>spark.eventLog.dir</code> in the shared defaults.`,
          `Fix: point <code>spark.history.fs.logDirectory</code> at the same location.`,
          `Verify: a finished test job appears in the history server, with its stages.`
        ]
      },
      {
        t: `A single huge event log slows the history server`,
        sym: `The history server takes a very long time to open one long-running application.`,
        ctx: `A streaming-style application runs for weeks, with one event log file that keeps growing (illustrative).`,
        why: `The server must replay the whole file to build the UI. A multi-GB single file takes a long time and a lot of memory.`,
        log: `-- representative output, values illustrative
-rw-r--r--  38G  application_1696600000000_0042
History Server: parsing log... 41 min`,
        note: `Rolling event logs split the stream into several files.`,
        fix: [
          `Measure first: check the size of the application's event log directory.`,
          `Fix: enable <code>spark.eventLog.rolling.enabled</code> and size the files with <code>spark.eventLog.rolling.maxFileSize</code>.`,
          `Fix: on the history server, limit retained files with <code>spark.history.fs.eventLog.rolling.maxFilesToRetain</code>, so old ones are compacted.`,
          `Verify: the application opens quickly in the history server.`
        ]
      },
      {
        t: `Tuning the plan printed before execution`,
        sym: `The team tunes a join in <code>explain()</code>, but the finished query ran a different join.`,
        ctx: `AQE is on, and the plan was printed before the query ran (illustrative).`,
        why: `With AQE, the initial plan is provisional. It can be rewritten after shuffle stages finish, for example from sort-merge to broadcast.`,
        log: `-- representative output, wording varies by version
== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- SortMergeJoin [city_id#12], [id#40], Inner
   ...
(SQL tab after run: BroadcastHashJoin, isFinalPlan=true)`,
        note: `<code>isFinalPlan=false</code> means this is not necessarily what ran.`,
        fix: [
          `Measure first: note whether the plan header says <code>isFinalPlan=false</code>.`,
          `Fix: read the final plan in the SQL tab, in the live UI or the history server, after the query has run.`,
          `Fix: use <code>explain("formatted")</code> for the structure, and the SQL tab for what actually ran.`,
          `Verify: the plan you tune matches the plan in the SQL tab of the finished run.`
        ]
      }
    ],
    source: { label: `Original: Events, UI and Explain`, href: `01-spark-internals-end-to-end.html#ch10` },
    scenarios: [
      {
        id: `no-event-log`,
        label: `Event log off`,
        desc: `The driver posts events as the job runs. With the event log off, the events die with the application.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `# the driver posts listener events while the job runs`,
            `spark.eventLog.enabled = false   # default`,
            `# the application ends, and the live UI goes with it`,
            `# history server: "No completed applications found!"`
          ],
          fix: [
            `spark.eventLog.enabled = true`,
            `spark.eventLog.dir = s3a://ops-logs/spark-events   # durable, shared location`,
            `spark.history.fs.logDirectory = s3a://ops-logs/spark-events`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `ex`, x: 20, y: 20, w: 160, h: 56, t: `Executors`, s: `report task status` },
            { id: `drv`, x: 20, y: 120, w: 160, h: 56, t: `Driver`, s: `posts ordered events` },
            { id: `bus`, x: 240, y: 120, w: 160, h: 56, t: `Listener bus`, s: `ordered stream` },
            { id: `ui`, x: 460, y: 20, w: 160, h: 56, t: `Live UI`, s: `folds events, tables` },
            { id: `log`, x: 240, y: 220, w: 160, h: 56, t: `Event log`, s: `JSON lines on disk` },
            { id: `hs`, x: 460, y: 220, w: 160, h: 56, t: `History server`, s: `replays the log` }
          ],
          edges: [
            { id: `a`, a: `ex`, b: `drv`, label: `status` },
            { id: `b`, a: `drv`, b: `bus`, label: `post` },
            { id: `c`, a: `bus`, b: `ui`, label: `fold` },
            { id: `d`, a: `bus`, b: `log`, label: `write` },
            { id: `e`, a: `log`, b: `hs`, label: `replay` }
          ]
        },
        bug: [
          { log: `The driver posts events on the listener bus as the job runs (illustrative: thousands per minute).`, code: 0, hl: { nodes: { drv: `on`, bus: `on` }, edges: { b: `on` } } },
          { log: `With the event log disabled, nothing is written to disk. The events stay in memory only.`, code: 1, hl: { nodes: { log: `bad` }, edges: { d: `dim` } }, stats: [{ l: `Event log`, v: `not written`, cls: `bad` }] },
          { log: `The application ends, and the live UI goes away with the driver.`, code: 2, hl: { nodes: { ui: `bad` }, edges: { c: `dim` } }, stats: [{ l: `Live UI`, v: `gone`, cls: `bad` }] },
          { log: `The history server has nothing to replay, so the slow stage cannot be found.`, code: 3, hl: { nodes: { hs: `bad` }, edges: { e: `bad` } }, stats: [{ l: `Applications listed`, v: `0`, cls: `bad` }] }
        ],
        fix: [
          { log: `Event logging is on, so the same listener events are written as JSON lines.`, code: 0, hl: { nodes: { log: `ok`, bus: `ok` }, edges: { d: `ok` } }, stats: [{ l: `Event log`, v: `written`, cls: `ok` }] },
          { log: `The event log goes to a durable directory that outlives the driver.`, code: 1, hl: { nodes: { log: `ok` } } },
          { log: `The history server reads the same directory and rebuilds the stages and tasks.`, code: 2, hl: { nodes: { hs: `ok` }, edges: { e: `ok` } }, stats: [{ l: `Applications listed`, v: `1`, cls: `ok` }] }
        ]
      },
      {
        id: `plan-before-after`,
        label: `Plan before or after`,
        desc: `explain() before the run shows a provisional plan. AQE can switch the join while the query runs.`,
        codeLabel: `Config`,
        code: {
          bug: [
            `spark.sql.adaptive.enabled = true`,
            `df.join(cities, "city_id").explain("formatted")   # printed before the run`,
            `# AdaptiveSparkPlan isFinalPlan=false: a provisional plan`,
            `# the team tunes the SortMergeJoin they see here`
          ],
          fix: [
            `spark.sql.adaptive.enabled = true`,
            `# run the query first, then open the SQL tab`,
            `# the final plan (isFinalPlan=true) is what actually ran`
          ]
        },
        diagram: {
          w: 640, h: 300,
          nodes: [
            { id: `ex`, x: 20, y: 120, w: 160, h: 56, t: `explain()`, s: `isFinalPlan=false` },
            { id: `smj`, x: 240, y: 120, w: 160, h: 56, t: `SortMergeJoin`, s: `the printed plan` },
            { id: `aqe`, x: 240, y: 220, w: 160, h: 56, t: `AQE at runtime`, s: `sees real sizes` },
            { id: `bhj`, x: 460, y: 20, w: 160, h: 56, t: `BroadcastHashJoin`, s: `what actually ran` },
            { id: `sqlt`, x: 460, y: 220, w: 160, h: 56, t: `SQL tab`, s: `isFinalPlan=true` }
          ],
          edges: [
            { id: `a`, a: `ex`, b: `smj`, label: `printed` },
            { id: `b`, a: `smj`, b: `aqe`, label: `may change` },
            { id: `c`, a: `aqe`, b: `bhj`, label: `switch` },
            { id: `d`, a: `bhj`, b: `sqlt`, label: `shown` }
          ]
        },
        bug: [
          { log: `explain() prints the plan before the query runs, so AQE has not seen any real shuffle sizes yet.`, code: 1, hl: { nodes: { ex: `warn`, smj: `warn` }, edges: { a: `warn` } }, stats: [{ l: `isFinalPlan`, v: `false`, cls: `warn` }] },
          { log: `The team tunes the SortMergeJoin they see in the printout.`, code: 3, hl: { nodes: { smj: `bad` } } },
          { log: `During the run, AQE sees that the small side is 4 MB and switches to a broadcast join.`, code: 2, hl: { nodes: { aqe: `warn`, bhj: `ok` }, edges: { b: `warn`, c: `ok` } }, stats: [{ l: `Ran`, v: `BroadcastHashJoin`, cls: `warn` }] },
          { log: `The tuning was done on a plan that never ran, so the join the team changed is not the one the job used.`, code: 3, hl: { nodes: { sqlt: `bad`, smj: `dim` } }, stats: [{ l: `Tuned plan`, v: `SortMergeJoin (not run)`, cls: `bad` }] }
        ],
        fix: [
          { log: `Run the query first. The SQL tab in the live UI, or in the history server, holds the plan that executed.`, code: 1, hl: { nodes: { sqlt: `ok` }, edges: { d: `ok` } } },
          { log: `The final plan says isFinalPlan=true and shows BroadcastHashJoin.`, code: 2, hl: { nodes: { bhj: `ok` } }, stats: [{ l: `isFinalPlan`, v: `true`, cls: `ok` }] },
          { log: `Tune the join that is shown in the final plan. Then the result matches what ran.`, code: 2, hl: { nodes: { sqlt: `ok`, bhj: `ok` }, edges: { d: `ok` } } }
        ]
      }
    ]
  }
  ]
};
