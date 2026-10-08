/* Chapter 16 · Lakehouse and embedded analytics. A table as data files plus a transaction log; the engine in-process.
   Everything lives inside PG.lakehouse so this file adds no global names. Numbers are illustrative unless said otherwise. */
PG.lakehouse = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;
  const kids = arr => arr.filter(Boolean);
  const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
  const r1 = x => (Math.round(x * 10) / 10).toString();

  SX.css('ch16-css', `
.c16-arch{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.c16-box{flex:1 1 130px;min-width:0;text-align:left;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:600 13px system-ui,sans-serif;cursor:pointer}
.c16-box:hover{border-color:var(--acc)}
.c16-def{margin:6px 0 0;color:var(--mut);font-size:13px;overflow-wrap:anywhere;min-height:1.4em}
.c16-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.c16-chip{font:12px ui-monospace,monospace;padding:4px 8px;border-radius:6px;background:var(--soft);color:var(--mut);border:1px solid var(--line)}
.c16-chip.on{background:var(--acc);color:var(--card);border-color:var(--acc)}
.c16-chip.bad{background:var(--bad);color:var(--card);border-color:var(--bad)}
.c16-data{font:12px ui-monospace,monospace;color:var(--ink);margin:6px 0;overflow-wrap:anywhere}
.c16-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.c16-wrap{overflow-x:auto}
.c16-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.c16-table th,.c16-table td{text-align:left;padding:6px;border-bottom:1px solid var(--line);color:var(--ink);overflow-wrap:anywhere;vertical-align:top}
.c16-table th{color:var(--mut);font-weight:600}
.c16-table td.no{color:var(--bad);font-weight:600}
.c16-table td.yes{color:var(--ok);font-weight:600}
`);

  /* ---------- shared helpers ---------- */

  function arch(comps) {
    const info = h('p', { class: 'c16-def' }, 'Click a component to see its role.');
    const row = h('div', { class: 'c16-arch' }, comps.map(c => h('button', { class: 'c16-box', onclick: () => { info.textContent = c.name + ': ' + c.def; } }, c.name)));
    return h('div', {}, row, info);
  }

  function flow(comps, states) {
    return stepper(states, s => kids([
      h('div', { class: 'c16-chips' }, comps.map(c => h('span', { class: 'c16-chip' + (c === s.on ? ' on' : '') }, c))),
      s.data ? h('p', { class: 'c16-data' }, s.data) : null
    ]));
  }

  /* ---------- PLAYGROUND: one analytical workload, two places to run it ---------- */
  /* Illustrative model. Lakehouse: a cluster reads Parquet files from object storage; every write is a commit in the log.
     Embedded: DuckDB-like engine in the application process on one machine (16 GB RAM, 8 cores, data in memory when it fits).
     All numbers are illustrative, not measurements. */
  const FILE_MB = 128, CLUSTER_GBPS = 4, CLUSTER_SLOTS = 8, LAKE_OVERHEAD_S = 2, FILE_OPEN_S = 0.01;
  const RAM_GB = 16, CORES = 8, MEM_GBPS = 1, DISK_GBPS = 0.5, EMBED_OVERHEAD_S = 0.05;

  function lakeRow(gb, updatesPerMin, conc) {
    const baseFiles = Math.max(1, Math.ceil(gb * 1024 / FILE_MB));
    const smallFiles = updatesPerMin * 60;
    const files = baseFiles + smallFiles;
    const one = LAKE_OVERHEAD_S + gb / CLUSTER_GBPS + files * FILE_OPEN_S;
    const waves = Math.ceil(conc / CLUSTER_SLOTS);
    return { name: 'Lakehouse (cluster over object storage)', latency: one * waves, coord: updatesPerMin * 60 + ' commits per hour in the log', mem: 'cluster memory, no limit on this machine', verdict: 'works for many users; needs a cluster and a catalog' , ok: true, files };
  }

  function embedRow(gb, updatesPerMin, conc, deploy) {
    const fits = gb <= RAM_GB;
    const one = EMBED_OVERHEAD_S + gb / (fits ? MEM_GBPS * CORES : DISK_GBPS);
    const waves = Math.ceil(conc / CORES);
    const shared = deploy === 'shared';
    return {
      name: 'Embedded (in-process DuckDB-like)',
      latency: one * waves,
      coord: 'none: one writer, no commit log',
      mem: fits ? 'fits in ' + RAM_GB + ' GB RAM' : 'does not fit: spills to disk at ' + DISK_GBPS + ' GB/s',
      verdict: shared ? 'not suitable: one process per user, no shared access' : (fits || gb > RAM_GB ? 'fine for one user on this machine' : ''),
      ok: !shared
    };
  }

  function playground() {
    let gb = 10, upd = 1, conc = 1, deploy = 'laptop';
    const holder = h('div', {});
    const paint = () => {
      const rows = [lakeRow(gb, upd, conc), embedRow(gb, upd, conc, deploy)];
      holder.replaceChildren(
        h('div', { class: 'c16-wrap' }, h('table', { class: 'c16-table' },
          h('thead', {}, h('tr', {}, ['design', 'latency per query', 'coordination', 'memory', 'verdict'].map(x => h('th', {}, x)))),
          h('tbody', {}, rows.map(r => h('tr', {},
            h('td', {}, r.name),
            h('td', {}, r1(r.latency) + ' s'),
            h('td', {}, r.coord),
            h('td', {}, r.mem),
            h('td', { class: r.ok ? 'yes' : 'no' }, r.verdict)))))),
        h('div', { class: 'c16-stats' },
          stat('small files, lakehouse', rows[0].files),
          stat('data size', gb >= 1000 ? (gb / 1000) + ' TB' : gb + ' GB'),
          stat('concurrent queries', conc)),
        h('p', { class: 'sx-p' }, 'The lakehouse adds commits to the log with every write (update frequency) and small files with every commit. Embedded has no log, but it does not serve more than one process at a time.')
      );
    };
    const sizeSeg = seg([{ v: 0.1, l: '100 MB' }, { v: 10, l: '10 GB' }, { v: 1000, l: '1 TB' }], gb, v => { gb = v; paint(); });
    const updSeg = seg([{ v: 0, l: 'no writes' }, { v: 1, l: '1 write per minute' }, { v: 60, l: '1 write per second' }], upd, v => { upd = v; paint(); });
    const concSeg = seg([{ v: 1, l: '1 user' }, { v: 8, l: '8 queries at once' }, { v: 64, l: '64 queries at once' }], conc, v => { conc = v; paint(); });
    const deploySeg = seg([{ v: 'laptop', l: 'laptop app, offline' }, { v: 'shared', l: 'shared service, many users' }], deploy, v => { deploy = v; paint(); });
    paint();
    return h('div', { class: 'sx-play' }, h('div', { class: 'sx-controls' }, sizeSeg, updSeg, concSeg, deploySeg), holder);
  }

  /* ---------- CASE STUDY 1 · Databricks / Spark: lakehouse table ---------- */
  const DB_COMPS = ['Spark driver', 'executors with Photon', 'object store: data files', 'transaction log', 'checkpoint'];
  const DB_ARCH = [
    { name: 'Spark driver', def: 'plans the query with the Catalyst optimizer, a Cascades-style optimizer, and sends the stages to the executors.' },
    { name: 'executors with Photon', def: 'run the tasks. Photon is a C++ vectorized engine embedded in the Spark runtime through JNI, so each operator can run in Photon or in the JVM.' },
    { name: 'object store: data files', def: 'Parquet files, immutable once written. A change writes new files and does not edit old ones.' },
    { name: 'transaction log', def: 'a directory of numbered JSON commit files. Each commit lists the files added and removed, and the schema changes. The table state is the replay of the log.' },
    { name: 'checkpoint', def: 'a Parquet summary of the log up to some version, so readers do not replay every commit. The default interval is every 10 commits.' }
  ];
  const dbWriteStates = [
    { on: 'Spark driver', t: 'A job writes new rows. The executors write them as new Parquet files. Nothing in the table changes yet.', data: 'new files: part-0001.parquet, part-0002.parquet (representative names)' },
    { on: 'object store: data files', t: 'The new files are complete in the object store, but no reader can see them until the commit is written.' },
    { on: 'transaction log', t: 'The driver writes the next commit file, version 9, with the files added and any files removed. The write succeeds only if the version number is free, so two writers cannot both claim version 9.', data: 'commit 9: add part-0001.parquet, add part-0002.parquet (representative)' },
    { on: 'checkpoint', t: 'Commit 9 is the tenth commit (versions 0 to 9), so the default interval is reached. A checkpoint Parquet file summarises the table state at version 9. Readers can start from it.', data: 'checkpoint at version 9; _last_checkpoint points to it' }
  ];
  const dbReadStates = [
    { on: 'checkpoint', t: 'A reader starts with the last checkpoint named in _last_checkpoint. It knows the file list up to that version.' },
    { on: 'transaction log', t: 'The reader replays only the commit files after the checkpoint, so the table state is the checkpoint plus the newer commits.', data: 'replayed: commit 10 and commit 11 (representative)' },
    { on: 'Spark driver', t: 'The driver prunes files whose column statistics cannot match the filter, so only some files are listed for the scan.' },
    { on: 'executors with Photon', t: 'Executors read the remaining Parquet files with Photon, using vectorized kernels and expression fusion.' }
  ];
  const dbTimeStates = [
    { on: 'transaction log', t: 'Time travel: a reader asks for version 7. The same replay runs, but it stops at version 7, so the snapshot shows the table as it was then.' },
    { on: 'object store: data files', t: 'The files removed in later commits are still in the object store, so version 7 can be read. Only maintenance (cleanup of old files) removes them for good.' }
  ];

  /* ---------- CASE STUDY 2 · DuckDB: embedded, in-process ---------- */
  const DK_COMPS = ['client process', 'DuckDB engine', 'database file', 'remote file extension', 'MotherDuck (cloud)'];
  const DK_ARCH = [
    { name: 'client process', def: 'the application, such as a Python or R program. DuckDB runs inside it, so there is no server and no network hop.' },
    { name: 'DuckDB engine', def: 'a multi-threaded, push-based vectorized engine with MVCC and morsel-driven parallelism. It uses precompiled primitives, not JIT code generation.' },
    { name: 'database file', def: 'a single file per database. Tables are split into PAX row groups of 120k tuples; the on-disk encoding differs from the in-memory one.' },
    { name: 'remote file extension', def: 'reads Parquet, Arrow, SQLite and JSON files, and files on HTTP or S3, without loading them into the database file first.' },
    { name: 'MotherDuck (cloud)', def: 'an extension that runs DuckDB queries on serverless "ducklings" in the cloud, and splits a query between local and remote DuckDB with bridge operators.' }
  ];
  const dkReadStates = [
    { on: 'client process', t: 'The query runs inside the application. No request leaves the process.' },
    { on: 'DuckDB engine', t: 'The optimizer plans the query. The executor splits it into pipelines that push vectors from one operator to the next.', data: 'vector kinds: flat, constant, dictionary, sequence' },
    { on: 'database file', t: 'The scan reads row groups from the single file. A row group that cannot match the filter is skipped.' },
    { on: 'remote file extension', t: 'A query over a Parquet file on S3 reads it through an extension, without copying it into the database file first.' },
    { on: 'client process', t: 'The result returns to the client in the same process, through the transfer path covered in chapter 8.' }
  ];
  const dkWriteStates = [
    { on: 'client process', t: 'An INSERT runs in a transaction inside the same process.' },
    { on: 'database file', t: 'Rows are appended to the table. Snapshot visibility, which keeps the old version visible to readers until the commit, is covered in chapter 12.' },
    { on: 'client process', t: 'Commit: the new rows become visible to later queries in this process. Another process cannot write to the file while this one has it open for writing (representative; the course notes do not state this lock rule).' }
  ];

  /* ---------- PROBLEM DEMOS ---------- */

  /* 1 · small files: one commit adds one small file (illustrative: compaction every 100 commits in the good case) */
  const SMALL_MILESTONES = [0, 100, 250, 500, 1000];
  const PLAN_S_PER_FILE = 0.01;
  function smallFilesDemo(mode) {
    const S = SMALL_MILESTONES.map(k => {
      const files = mode === 'bad' ? k : Math.floor(k / 100) + (k % 100);
      return { k, files, plan: files * PLAN_S_PER_FILE, t: k === 0 ? 'Start: an empty table. Each commit writes one small file.'
        : (mode === 'bad' ? k + ' commits, no compaction: ' + k + ' small files. Planning opens every one of them.'
          : k + ' commits: every 100 commits, the small files are rewritten into one larger file, so ' + files + ' files remain.') };
    });
    return stepper(S, s => kids([
      h('div', { class: 'c16-stats' }, stat('commits', s.k), stat('files to open', s.files), stat('planning time', r1(s.plan) + ' s'))
    ]));
  }

  /* 2 · log growth: reads replay the log from the last checkpoint (checkpoint every 10 commits, default) */
  const LOG_MILESTONES = [0, 10, 100, 250, 1005];
  function logDemo(mode) {
    const S = LOG_MILESTONES.map(k => {
      const replay = mode === 'bad' ? k : k % 10;
      return { k, replay, t: k === 0 ? 'Start: no commits yet.'
        : (mode === 'bad' ? k + ' commits, no checkpoint. A reader replays all ' + k + ' commit files to find the current files.'
          : k + ' commits. A checkpoint is written every 10 commits, so a reader replays only the commits after the last checkpoint: ' + (k % 10) + ' here.') };
    });
    return stepper(S, s => kids([
      h('div', { class: 'c16-stats' }, stat('commits', s.k), stat('commit files replayed per read', s.replay))
    ]));
  }

  /* 3 · embedded memory: a 200 GB dataset on a 16 GB laptop, 40 GB chunks of row groups (illustrative) */
  const EM_TOTAL = 200, EM_CHUNK = 40, EM_RAM = 16, EM_CHUNKS = EM_TOTAL / EM_CHUNK;
  /* assumption, not from the notes: 120k tuples at about 100 bytes each, so 12 MB per row group */
  const EM_ROWGROUP_GB = 0.012;
  /* the bad run fails at the first chunk whose kept total is above RAM */
  const memBadPeak = Math.ceil(EM_RAM / EM_CHUNK) * EM_CHUNK;
  function memDemo(mode) {
    const S = [{ t: 'Start: the table is ' + EM_TOTAL + ' GB and the machine has ' + EM_RAM + ' GB of RAM.', chunk: 0, mem: 0, status: 'ready' }];
    let mem = 0, failed = false;
    for (let c = 1; c <= EM_CHUNKS && !failed; c++) {
      if (mode === 'bad') {
        mem += EM_CHUNK;
        if (mem > EM_RAM) { failed = true; S.push({ t: 'Chunk ' + c + ': the engine keeps every chunk in memory, so the total is ' + mem + ' GB. That is above ' + EM_RAM + ' GB, and the process runs out of memory.', chunk: c, mem, status: 'out of memory' }); }
        else S.push({ t: 'Chunk ' + c + ' is loaded and kept. Memory is now ' + mem + ' GB.', chunk: c, mem, status: 'ok' });
      } else {
        mem = EM_ROWGROUP_GB;
        S.push({ t: 'Chunk ' + c + ' streams through row group by row group. Only one row group is in memory: ' + mem.toFixed(3) + ' GB. A large aggregate spills its hash partitions to disk when needed.', chunk: c, mem, status: 'ok' });
      }
    }
    return stepper(S, s => kids([
      h('div', { class: 'c16-stats' }, stat('chunks read', s.chunk + ' of ' + EM_CHUNKS), stat('peak memory', s.mem.toFixed(3) + ' GB'), stat('status', s.status))
    ]));
  }

  /* 4 · concurrency: five clients, one embedded database file (illustrative: the file is opened for writing by one process at a time) */
  const CLIENTS = 5;
  function sharedDemo(mode) {
    const S = [{ t: 'Start: ' + CLIENTS + ' clients want to write to the same database.', served: 0, failed: 0 }];
    let served = 0, failed = 0;
    for (let i = 1; i <= CLIENTS; i++) {
      if (mode === 'bad') {
        if (i === 1) { served++; S.push({ t: 'Client 1 opens the database file for writing and gets the lock. Its write succeeds.', served, failed }); }
        else { failed++; S.push({ t: 'Client ' + i + ' tries to open the same file, but another process holds the write lock. The request fails.', served, failed }); }
      } else {
        served++;
        S.push({ t: 'Client ' + i + ' sends its write to the one service process, which owns the connection. The request queues, then succeeds.', served, failed });
      }
    }
    return stepper(S, s => kids([
      h('div', { class: 'c16-stats' }, stat('writes served', s.served), stat('writes failed', s.failed))
    ]));
  }

  /* ---------- NUMBERS for the problem tabs ---------- */
  const smallFilesAt = (mode, k) => mode === 'bad' ? k : Math.floor(k / 100) + (k % 100);
  const logReplayAt = (mode, k) => mode === 'bad' ? k : k % 10;
  const smallBad = smallFilesAt('bad', 1000), smallGood = smallFilesAt('good', 1000);
  const logBad = logReplayAt('bad', 1005), logGood = logReplayAt('good', 1005);

  const PROBLEMS = [
    { tab: 'Thousands of small files',
      sym: 'the query plan takes longer each week, even though the data has not grown. Most of the time goes to opening files.',
      why: 'Every commit writes a few small files. Planning and each scan open every file, and small files make the per-file cost dominate. The data is the same size, but there are many more files to open.',
      log: 'representative table health metrics\nfiles=1000 avg_file_size=0.5 MB\nplanning_time=10 s (planning, not execution)',
      demo: smallFilesDemo,
      fix: ['Compact small files on a schedule (OPTIMIZE-style rewrites into larger files).',
        'Write fewer, larger files per commit: batch small writes instead of committing each row.',
        'Keep per-file statistics, so pruning can skip files without opening them.',
        'Verify: count the files that a query has to open before and after compaction. Here it moves from ' + smallBad + ' to ' + smallGood + ' files (illustrative).'] },
    { tab: 'Log and catalog metadata grow',
      sym: 'every read of the table is slower than last month, and the log and the file catalog keep growing.',
      why: 'The table state is the replay of the log. Without checkpoints, every reader replays every commit, so the cost of a read grows with the number of commits. The catalog of file entries grows with each commit too, and old files pile up unless old commits and files are cleaned up.',
      log: 'representative log directory listing\n_delta_log/00000000000000001000.json\n_delta_log/_last_checkpoint  (missing or stale)\nfile catalog: 1000 file entries listed for one table (representative)',
      demo: logDemo,
      fix: ['Write a checkpoint every 10 commits (the default for Delta Lake), so a reader replays only the commits after it.',
        'Expire old log entries after the retention window (30 days by default for Delta Lake, per the Delta Lake documentation checked on the web, not the course notes), once a checkpoint covers them.',
        'Vacuum old data files that no retained version still needs. Time travel only works within the retention window.',
        'Verify: count the commit files a read replays before and after checkpointing. Here it moves from ' + logBad + ' to ' + logGood + ' files (illustrative).'] },
    { tab: 'Embedded workload exceeds RAM',
      sym: 'the process is killed with an out-of-memory error, halfway through a query over a file that was fine last week.',
      why: 'An embedded engine runs inside the application process, on one machine. If it keeps the whole input in memory, a dataset larger than RAM fails. A streaming scan with spilling operators can run on the same machine.',
      log: 'representative process log\nprocess exited: out of memory (embedded engine, 16 GB limit)\nlast operator: hash aggregate, spill=disabled',
      demo: memDemo,
      fix: ['Scan row group by row group, so only one group is in memory at a time.',
        'Turn on spilling for the blocking operators (aggregates, joins, sorts) and give the engine a disk temp directory.',
        'Move the largest tables to a lakehouse or a server when the data no longer fits on one machine.',
        'Verify: watch the peak memory of the process during the same query. Here it moves from ' + memBadPeak + ' GB (out of memory at chunk 1) to ' + EM_ROWGROUP_GB + ' GB (the row group size is an assumption), plus spill.'] },
    { tab: 'Embedded engine as a shared service',
      sym: 'many users write to one embedded database and most of their requests fail with a lock error.',
      why: 'An embedded engine is one library in one process. A database file can be open for writing by only one process at a time (representative; not stated in the course notes), so putting it behind a multi-user service without a single owner process means most requests fail.',
      log: 'representative error\nIO Error: Could not set lock on file "analytics.db": another process holds it (representative wording)',
      demo: sharedDemo,
      fix: ['Put one service process in front of the file, and let it own the connection. Requests from many users queue inside the service.',
        'Use a lakehouse or a managed server for many concurrent writers, so the storage is not tied to one process.',
        'Keep the embedded engine for one user, such as a laptop app or a notebook.',
        'Verify: count the writes that fail with 5 concurrent clients. Here it moves from ' + (CLIENTS - 1) + ' failed to 0 failed (illustrative).'] }
  ];

  const ARCH_NOTE = 'Note: Delta Lake is one open table format. The commit file names and the checkpoint interval follow the Delta Lake protocol; the SQL below is representative.';

  root.append(
    sec('1 · The problem',
      para('One team runs distributed analytics over files in an object store, shared by many people and tools. Another team needs fast analysis inside a laptop app, with no server at all.'),
      para('The first needs many writers, a shared table and time travel. The second needs one process, low latency and no coordination. (Illustrative: a 10 GB table on one laptop is quick; the same table on a shared cluster needs coordination.)'),
      h('p', { class: 'sx-q', html: 'Where should the analytical engine and the transaction boundary live: shared storage with a log, or inside the application?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> place the analytical engine and the transaction boundary where the data and the users need them.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Lakehouse table:</b> immutable data files (usually Parquet) in an object store, plus a transaction log that says which files make up each version of the table. A lakehouse adds CRUD and schema control on top of a data lake.',
        '<b>Log-structured writes:</b> changes are appended to the log, and background work periodically turns them into columnar files (Delta Lake appends writes to a JSON log that background work converts to Parquet; Kudu keeps updates in an in-memory B+ tree before writing columnar files).',
        '<b>Snapshot commit:</b> a writer writes its data files first, then writes one commit that adds them. The commit has the next version number, and it succeeds only if that version is free. Readers see either the old version or the new one, never a half-written state.',
        '<b>Time travel:</b> readers replay the log up to version N to get the table as it was then. Old data files stay until cleanup removes them, so time travel works only within the retention window.',
        '<b>Checkpoints:</b> a Parquet summary of the table state at some version. The default checkpoint interval in Delta Lake is every 10 commits (Delta Lake documentation, checked on the web; not in the course notes), and a reader starts from the last checkpoint.',
        '<b>Metadata and statistics:</b> per-file statistics let the engine skip whole files. Iceberg and Hudi keep a catalog for runtime lookups and pruning of metadata.',
        '<b>Small files and maintenance:</b> each commit can add small files. Compaction rewrites them into larger ones, and vacuum removes files that no retained version needs. Both are needed to keep planning and I/O cheap.',
        '<b>Distributed execution on a lake:</b> Spark runs the query across executors. Dynamic plans switch between shuffle and broadcast joins, coalesce partitions and handle skew, using statistics from the previous stage. Chapter 15 covers the shuffle model in detail.',
        '<b>Spark history:</b> Shark (2013) translated Hive plans into Spark programs, which the Hive optimizer, built for MapReduce, planned badly. Spark SQL (2015) is a row-based engine inside Spark, with code generation and in-memory columnar buffers (notes 18 §1.2–1.3).',
        '<b>JVM limits:</b> Databricks workloads became CPU-bound. Expression trees compiled to JVM bytecode cost too much, GC slows on heaps above 64 GB, and JIT code generation struggles with large methods (notes 18 §1.4).',
        '<b>Photon memory management:</b> allocations come from a pool managed by the runtime. When an operator needs memory, the manager releases it from the operator with the least allocated that can still satisfy the request, instead of each operator spilling on its own (notes 18 §2.4).',
        '<b>Physical-plan transformation:</b> the Catalyst optimizer walks the plan bottom-up and inserts Photon operators where they exist, aiming to limit switches between the Java and C++ engines (notes 18 §2.5).',
        '<b>Batch-level adaptivity:</b> Photon picks a specialized code path for each batch, such as ASCII-only strings, sparse vectors compacted before hash probing, or vectors with no nulls and no inactive rows (notes 18 §3.2).',
        '<b>Query-level adaptivity:</b> statistics from the end of each shuffle stage let Spark switch between shuffle and broadcast joins, coalesce partitions and handle skewed joins before the next stage starts (notes 18 §3.1).',
        '<b>Spark accelerators:</b> open-source alternatives such as Apache Gluten, the NVIDIA RAPIDS accelerator, Blaze and DataFusion Comet redirect whole plans to a separate engine, instead of Photon\'s operator-level integration (notes 18 §4).',
        '<b>DataFrames:</b> dplyr (R) and Ibis (Python) build DuckDB logical plans directly, bypassing the SQL parser (notes 20 §2.4).',
        '<b>Photon conclusion:</b> precompiled primitives, plus integration into an existing JVM runtime rather than building a Java OLAP engine from scratch (notes 18 §6). <b>DuckDB conclusion:</b> no single component is new; the value is in combining known methods that suit its use cases (notes 20 §4).',
        '<b>Photon:</b> a C++ vectorized engine embedded in the Spark runtime through JNI. It is pull-based, with precompiled kernels and expression fusion. Photon takes over an operator only when an accelerated version exists (notes 18 §2). Chapter 10 covers vectorized and compiled execution.',
        '<b>Embedded, in-process execution:</b> the engine is a library inside the application process, so there is no server and no network hop. The transfer of results to the client is covered in chapter 8.',
        '<b>DuckDB:</b> a single-file, multi-threaded, push-based vectorized engine with morsel-driven parallelism (snapshot visibility is covered in chapter 12). Tables are PAX row groups of 120k tuples. It reads Parquet, Arrow and JSON, and files on HTTP or S3, through extensions.',
        '<b>Limits of embedded execution:</b> the working set must fit in memory, or the operators must spill to disk. One process at a time can hold a database file open for writing (representative; the course notes do not state this lock rule). Many users need a server or a lakehouse instead.',
        '<b>Deployment boundary:</b> MotherDuck extends DuckDB to the cloud, running a query partly on the laptop and partly on serverless compute with bridge operators. The boundary is a choice of where each part of the query runs.'].map(x => '<li>' + x + '</li>').join('') })),
    sec('3 · Playground: lakehouse or embedded?',
      para('Change the dataset size, the write frequency, the number of queries at once, and where the app runs. The two rows show latency per query, the coordination work, and whether each design is a fit. All numbers are illustrative.'),
      playground()),
    sec('4 · Case study 1 · Databricks / Spark: a lakehouse table',
      para('A Delta table is a directory of Parquet files and a _delta_log directory of numbered JSON commits. The read path below starts from the last checkpoint, then replays only the newer commits. (Representative names and sequence.)'),
      arch(DB_ARCH),
      para(ARCH_NOTE),
      h('h3', {}, 'Write path: a snapshot commit'),
      flow(DB_COMPS, dbWriteStates),
      h('h3', {}, 'Read path: from the last checkpoint'),
      flow(DB_COMPS, dbReadStates),
      h('h3', {}, 'Time travel: read an older version'),
      flow(DB_COMPS, dbTimeStates)),
    sec('5 · Case study 2 · DuckDB: embedded and in-process',
      para('DuckDB is an embedded analytical database, often called "SQLite for analytics". A query runs in the application process over one database file, or over files outside it. The read path below follows one query.'),
      arch(DK_ARCH),
      h('h3', {}, 'Read path: one query in the process'),
      flow(DK_COMPS, dkReadStates),
      h('h3', {}, 'Write path: one insert in the process'),
      flow(DK_COMPS, dkWriteStates)),
    sec('6 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
