/* Chapter 15 · Cloud data warehouses. Disaggregated storage and compute, distributed columnar scans, shuffle, slots.
   Everything lives inside PG.warehouse so this file adds no global names. Numbers are illustrative unless said otherwise. */
PG.warehouse = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;
  const kids = arr => arr.filter(Boolean);
  const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
  const r1 = x => (Math.round(x * 10) / 10).toString();

  SX.css('ch15-css', `
.c15-arch{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.c15-box{flex:1 1 130px;min-width:0;text-align:left;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:600 13px system-ui,sans-serif;cursor:pointer}
.c15-box:hover{border-color:var(--acc)}
.c15-def{margin:6px 0 0;color:var(--mut);font-size:13px;overflow-wrap:anywhere;min-height:1.4em}
.c15-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.c15-chip{font:12px ui-monospace,monospace;padding:4px 8px;border-radius:6px;background:var(--soft);color:var(--mut);border:1px solid var(--line)}
.c15-chip.on{background:var(--acc);color:var(--card);border-color:var(--acc)}
.c15-chip.warn{background:var(--warn);color:var(--ink);border-color:var(--warn)}
.c15-data{font:12px ui-monospace,monospace;color:var(--ink);margin:6px 0;overflow-wrap:anywhere}
.c15-row{display:flex;align-items:center;gap:8px;margin:4px 0;font:12px ui-monospace,monospace;color:var(--ink)}
.c15-row span:first-child{flex:0 0 92px}
.c15-track{flex:1;min-width:0;height:14px;background:var(--soft);border-radius:4px;overflow:hidden}
.c15-track i{display:block;height:100%;background:var(--acc)}
.c15-track i.hot{background:var(--bad)}
.c15-row em{flex:0 0 74px;font-style:normal;text-align:right}
.c15-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.c15-table th,.c15-table td{text-align:left;padding:6px;border-bottom:1px solid var(--line);color:var(--ink);overflow-wrap:anywhere}
.c15-table th{color:var(--mut);font-weight:600}
.c15-table tr.best td{color:var(--acc);font-weight:600}
.c15-wrap{overflow-x:auto}
.c15-stats-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
`);

  /* ---------- shared helpers ---------- */

  /* a row of clickable components; clicking one shows its definition under the row */
  function arch(comps) {
    const info = h('p', { class: 'c15-def' }, 'Click a component to see its role.');
    const row = h('div', { class: 'c15-arch' }, comps.map(c => h('button', { class: 'c15-box', onclick: () => { info.textContent = c.name + ': ' + c.def; } }, c.name)));
    return h('div', {}, row, info);
  }

  /* a read or write path: each state lights one component and says what happens there */
  function flow(comps, states) {
    return stepper(states, s => kids([
      h('div', { class: 'c15-chips' }, comps.map(c => h('span', { class: 'c15-chip' + (c === s.on ? ' on' : '') }, c))),
      s.data ? h('p', { class: 'c15-data' }, s.data) : null
    ]));
  }

  /* ---------- PLAYGROUND: one workload, four architecture models ---------- */
  /* Illustrative parameters, not measurements. units = parallel workers; cache and remote are GB per second per unit;
     slots = queries that run at once; local = whether the workers keep a cache of their own. */
  const MODELS = [
    { name: 'BigQuery-like', units: 200, cache: 0.5, remote: 0.5, slots: 20, local: false, note: 'no worker cache: every read goes to storage' },
    { name: 'Snowflake-like', units: 8, cache: 4, remote: 0.5, slots: 8, local: true, note: 'warehouse with a local disk cache' },
    { name: 'Redshift-like', units: 8, cache: 3, remote: 0.4, slots: 5, local: true, note: 'compute nodes with an SSD cache, spill to S3' },
    { name: 'Yellowbrick-like', units: 8, cache: 4, remote: 0.5, slots: 1, local: true, note: 'one query at a time across the cluster' }
  ];

  function modelRow(m, conc, warm, gb) {
    const rate = m.local ? warm * m.cache + (1 - warm) * m.remote : m.remote;
    const service = gb / (m.units * rate);
    const waves = Math.ceil(conc / m.slots);
    const remoteGb = m.local ? gb * (1 - warm) : gb;
    return { name: m.name, service, slowest: waves * service, remoteGb, slots: m.slots };
  }

  function playground() {
    let conc = 4, warm = 0.5, gb = 1000;
    const holder = h('div', {});
    const paint = () => {
      const rows = MODELS.map(m => modelRow(m, conc, warm, gb));
      const worst = Math.max(...rows.map(r => r.slowest));
      holder.replaceChildren(
        h('div', { class: 'c15-wrap' }, h('table', { class: 'c15-table' },
          h('thead', {}, h('tr', {}, ['model', 'one query', conc + ' queries, slowest', 'remote GB per query', 'run at once'].map(x => h('th', {}, x)))),
          h('tbody', {}, rows.map(r => h('tr', { class: r.slowest === Math.min(...rows.map(q => q.slowest)) ? 'best' : '' },
            h('td', {}, r.name),
            h('td', {}, r1(r.service) + ' s'),
            h('td', {}, r1(r.slowest) + ' s'),
            h('td', {}, r1(r.remoteGb) + ' GB'),
            h('td', {}, String(r.slots))))))),
        ...rows.map(r => h('div', { class: 'c15-row' }, h('span', {}, r.name), h('div', { class: 'c15-track' }, h('i', { style: 'width:' + pct(r.slowest, worst) + '%' })), h('em', {}, r1(r.slowest) + ' s'))),
        h('p', { class: 'sx-p' }, 'Each model: ' + MODELS.map(m => m.name + ' (' + m.note + ')').join('; ') + '. The parameters are illustrative.')
      );
    };
    const concSeg = seg([{ v: 1, l: '1 query' }, { v: 4, l: '4 queries' }, { v: 16, l: '16 queries' }], conc, v => { conc = v; paint(); });
    const warmSeg = seg([{ v: 0, l: 'cold cache' }, { v: 0.5, l: 'half warm' }, { v: 0.9, l: 'warm (90%)' }], warm, v => { warm = v; paint(); });
    const scanSeg = seg([{ v: 100, l: '100 GB scan' }, { v: 1000, l: '1 TB scan' }, { v: 10000, l: '10 TB scan' }], gb, v => { gb = v; paint(); });
    paint();
    return h('div', { class: 'sx-play' }, h('div', { class: 'sx-controls' }, concSeg, warmSeg, scanSeg), holder);
  }

  /* ---------- CASE STUDIES: short architecture plus one read path each ---------- */

  const BQ_COMPS = ['client', 'root coordinator', 'scheduler', 'workers', 'shuffle nodes', 'distributed file system'];
  const BQ_ARCH = [
    { name: 'root coordinator', def: 'builds the query DAG, gets the metadata, and sends each worker its local plan fragment.' },
    { name: 'scheduler', def: 'hands out workers from a flexible pool. Workers have no fixed place in the cluster.' },
    { name: 'workers', def: 'read columnar files from the distributed file system and run one task each. Tasks must be deterministic and idempotent, so a restart is safe.' },
    { name: 'shuffle nodes', def: 'hold the intermediate output of one stage in memory, in hash partitions, for the next stage. They spill to disk only when needed.' },
    { name: 'distributed file system', def: 'stores the data as self-describing columnar files, which scale out separately from compute.' }
  ];
  const bqStates = [
    { on: 'client', t: 'A user runs an aggregate query. Nothing is provisioned in advance: the work is served by a shared pool of workers.' },
    { on: 'root coordinator', t: 'The coordinator reads the metadata and binds it to the plan. It does this once, so the workers do not all hit the file system at the same time.', data: 'plan: stage 1 scan, stage 2 partial aggregate, stage 3 final' },
    { on: 'scheduler', t: 'The coordinator assigns the stage 1 tasks to workers from the pool.' },
    { on: 'workers', t: 'Each worker reads only the column chunks it needs from the file system and computes its partial result.' },
    { on: 'shuffle nodes', t: 'Partial results go to shuffle nodes, which keep them in memory in hash partitions. The next stage reads them there.' },
    { on: 'workers', t: 'A slow task (a straggler) passes the threshold, so the coordinator starts a redundant copy. Whichever copy finishes first wins.' },
    { on: 'distributed file system', t: 'When all stages finish, the final output is written back to the file system, and the client gets the result.' }
  ];

  const SF_COMPS = ['cloud services', 'optimizer', 'metadata (FoundationDB)', 'virtual warehouse', 'worker cache', 'object storage'];
  const SF_ARCH = [
    { name: 'cloud services', def: 'shared by all users. It holds the optimizer, the catalog, and transaction state in a transactional key-value store (FoundationDB).' },
    { name: 'virtual warehouse', def: 'an arbitrary number of worker VMs with locally attached disks. Serverless warehouses switch off when the query load stops.' },
    { name: 'worker cache', def: 'a local disk cache on each worker. It hides the latency of object storage.' },
    { name: 'object storage', def: 'the cloud vendor object store holds the table as micropartition files in Snowflake\'s own columnar PAX format. The source slides give 50 to 500 MB per micropartition before compression, which compresses to about 16 MB per file (notes and slides 19).' }
  ];
  const sfStates = [
    { on: 'cloud services', t: 'A query arrives at the cloud services layer, which compiles it with a Cascades-style top-down optimizer.' },
    { on: 'optimizer', t: 'Zone maps in the catalog prune micropartitions that cannot match, before any data is read.', data: 'micropartitions after pruning: a subset of the table' },
    { on: 'virtual warehouse', t: 'Consistent hashing assigns each micropartition to a worker, so later queries on the same file go to the same node.' },
    { on: 'worker cache', t: 'The worker reads a micropartition from its local cache when it is there. The first read is a miss.' },
    { on: 'object storage', t: 'On a miss, the worker fetches the file from object storage and keeps it in its cache.' },
    { on: 'virtual warehouse', t: 'The push-based engine streams data between worker stages without a separate shuffle step. A worker that finishes early claims work from a straggler, and downloads from object storage, not from the straggler.' }
  ];

  const YB_COMPS = ['front-end', 'worker pods', 'SSD cache', 'maintenance nodes', 'object store'];
  const YB_ARCH = [
    { name: 'front-end', def: 'the data warehouse instance. It manages connections, parsing, plan caching, row storage, metadata, and concurrency control (notes 21 §2.2).' },
    { name: 'worker pods', def: 'one pod per node, so each worker has exclusive hardware. Workers run the query fragments and manage their local cache.' },
    { name: 'SSD cache', def: 'a per-worker buffer pool of data files, managed with an approximate LRU-K policy.' },
    { name: 'maintenance nodes', def: 'compile query fragments to machine code and run bulk loads, off the query path.' },
    { name: 'object store', def: 'holds the columnar files of about 100 MB, each split into 2 MB chunks, in a proprietary PAX format.' }
  ];
  const ybStates = [
    { on: 'front-end', t: 'A query arrives. The front-end parses it and checks the plan cache. The optimizer is a heavily modified version of PostgreSQL\'s.' },
    { on: 'maintenance nodes', t: 'The plan is split into independent fragments. Each fragment is turned into C++ source, compiled with LLVM, and linked in at runtime. A fragment that was already compiled is reused.' },
    { on: 'worker pods', t: 'Each data file is assigned to a worker with rendezvous hashing: the worker with the highest weight for that file gets it.' },
    { on: 'SSD cache', t: 'The worker looks for the file in its SSD cache. A hit reads locally.' },
    { on: 'object store', t: 'A miss fetches the file from the object store. Recent writes are read from the front-end row store, which background tasks compact into columnar files.' },
    { on: 'worker pods', t: 'Workers run push-based vectorized operators on the chunks in the L3 cache. The cluster scheduler runs one query at a time across all workers, in 100 ms slices.' }
  ];

  const RS_COMPS = ['optimizer', 'compilation service', 'compute nodes', 'SSD cache', 'Redshift Managed Storage', 'Amazon S3'];
  const RS_ARCH = [
    { name: 'optimizer', def: 'a stratified optimizer. Rewrite rules run first, then a cost-based search picks the cheapest plan.' },
    { name: 'compilation service', def: 'separate nodes that compile query fragments with GCC. It keeps a local cache per customer and a global cache for the fleet.' },
    { name: 'compute nodes', def: 'run the query with a push-based vectorized engine, with hand-written SIMD and prefetching.' },
    { name: 'SSD cache', def: 'a local SSD cache on each compute node. When it is full, excess data spills to S3.' },
    { name: 'Redshift Managed Storage', def: 'storage nodes with SSDs for Redshift\'s own columnar PAX format (notes 22 §3).' },
    { name: 'Amazon S3', def: 'the spill target. Redshift Spectrum can also read Parquet and ORC files in S3 directly, using their zone maps.' }
  ];
  const rsStates = [
    { on: 'optimizer', t: 'The optimizer applies rewrite rules, then a cost-based search chooses the cheapest plan.' },
    { on: 'compilation service', t: 'Each fragment is looked up first in the customer\'s local compiled cache, then in the global cache. Only a miss is compiled.' },
    { on: 'compute nodes', t: 'Compute nodes start the scan with software prefetching, so the data is in cache before the vector needs it.' },
    { on: 'SSD cache', t: 'Blocks are read from the local SSD cache when they are there.' },
    { on: 'Redshift Managed Storage', t: 'A block that is not cached is read from Redshift Managed Storage.' },
    { on: 'Amazon S3', t: 'If the local SSD cache is full, data that does not fit is spilled to S3 and read from there when needed.' }
  ];

  /* ---------- PROBLEM DEMOS ---------- */

  /* 1 · cold workers: four queries over one 100 GB table (GB, illustrative) */
  function coldDemo(mode) {
    const GB = 100, Q = 4;
    const S = [];
    let remote = 0, hits = 0;
    for (let q = 1; q <= Q; q++) {
      if (mode === 'bad' || q === 1) remote += GB; else hits += GB;
      S.push({ q, remote, hits, t: mode === 'bad'
        ? 'Query ' + q + ': workers are picked at random, so each file lands on a worker that does not hold it. Every byte comes from storage again.'
        : (q === 1 ? 'Query 1: the cache is empty, so the files are read from storage.' : 'Query ' + q + ': consistent hashing sends each file to the worker that already has it. The read is a cache hit.') });
    }
    S.unshift({ q: 0, remote: 0, hits: 0, t: 'Start: the same 100 GB table will be queried four times.' });
    return stepper(S, s => kids([
      h('div', { class: 'c15-stats-row' }, stat('queries run', s.q), stat('remote GB read', s.remote), stat('cache hit share', pct(s.hits, s.q * GB) + '%'))
    ]));
  }

  /* 2 · skew: one hot key with 60% of 800 rows, eight shuffle partitions, 10 rows per second per worker (illustrative) */
  const SK_ROWS = 800, SK_PARTS = 8, SK_SPEED = 10;
  function skewDemo(mode) {
    const hot = Math.round(SK_ROWS * 0.6);
    const rest = SK_ROWS - hot, base = Math.floor(rest / (SK_PARTS - 1)), extra = rest - base * (SK_PARTS - 1);
    const sizes = mode === 'bad'
      ? [hot].concat(Array.from({ length: SK_PARTS - 1 }, (_, i) => base + (i < extra ? 1 : 0)))
      : Array(SK_PARTS).fill(SK_ROWS / SK_PARTS);
    const times = sizes.map((x, i) => ({ i, size: x, done: x / SK_SPEED })).sort((a, b) => a.done - b.done);
    const S = [{ t: 'Start: the shuffle splits the rows into ' + SK_PARTS + ' partitions. Each worker takes one partition.', upto: 0, slowest: 0 }];
    times.forEach((p, k) => S.push({ t: 'Partition ' + p.i + ' (' + p.size + ' rows) finishes at ' + r1(p.done) + ' s.' + (mode === 'bad' && p.i === 0 ? ' This is the hot key partition.' : ''), upto: k + 1, slowest: p.done, p }));
    const max = times[times.length - 1].done;
    return stepper(S, s => {
      const top = max;
      return kids([
        h('div', { class: 'c15-bars' }, times.map((p, k) => h('div', { class: 'c15-row' },
          h('span', {}, 'partition ' + p.i),
          h('div', { class: 'c15-track' }, h('i', { class: p.done === top && k < s.upto ? 'hot' : '', style: 'width:' + (k < s.upto ? pct(p.done, top) : 0) + '%' })),
          h('em', {}, k < s.upto ? r1(p.done) + ' s' : 'running')))),
        h('div', { class: 'c15-stats-row' }, stat('query done at', s.upto === SK_PARTS ? r1(max) + ' s' : 'not yet'), stat('partitions finished', s.upto + ' of ' + SK_PARTS))
      ]);
    });
  }

  /* 3 · slots: 10 queries, each one tick of work, FIFO. Two slots versus four slots (illustrative) */
  const SLOT_Q = 10;
  function slotDemo(mode) {
    const slots = mode === 'bad' ? 2 : 4;
    const S = [];
    const slowest = Math.ceil(SLOT_Q / slots);
    for (let t = 0; t <= slowest; t++) {
      const done = Math.min(SLOT_Q, t * slots), running = Math.min(slots, SLOT_Q - done), queued = SLOT_Q - done - running;
      S.push({ t, done, running, queued, slots, text: t === 0 ? 'All ' + SLOT_Q + ' dashboard queries arrive at once. With ' + slots + ' slots, ' + running + ' start and ' + queued + ' wait.' : 'Tick ' + t + ': ' + done + ' queries have finished. ' + (queued > 0 ? 'The next ' + running + ' start, and ' + queued + ' still wait.' : 'The queue is empty.') });
    }
    return stepper(S.map(x => Object.assign({}, x, { t: x.text })), s => kids([
      h('div', { class: 'c15-stats-row' }, stat('slots', s.slots), stat('running', s.running), stat('queued', s.queued), stat('slowest query ends at tick', slowest))
    ]));
  }

  /* 4 · unbounded scan: 10 TB over 365 daily partitions, a 7-day query (illustrative sizes) */
  const TB_GB = 10000, DAYS = 365, WINDOW = 7, CHUNKS = 5;
  const PER_DAY = TB_GB / DAYS, DAYS_PER_CHUNK = DAYS / CHUNKS;
  function scanDemo(mode) {
    const S = [{ t: 'Start: the table has ' + TB_GB + ' GB in ' + DAYS + ' daily partitions. The query wants the last ' + WINDOW + ' days.', chunk: 0, scanned: 0 }];
    let scanned = 0;
    for (let c = 0; c < CHUNKS; c++) {
      const lastChunk = c === CHUNKS - 1;
      let read;
      if (mode === 'bad') read = DAYS_PER_CHUNK * PER_DAY;
      else read = lastChunk ? WINDOW * PER_DAY : 0;
      scanned += read;
      S.push({ t: mode === 'bad'
        ? 'Days ' + (c * DAYS_PER_CHUNK + 1) + ' to ' + ((c + 1) * DAYS_PER_CHUNK) + ': no partition filter, so every partition is read.'
        : (lastChunk ? 'Days ' + (c * DAYS_PER_CHUNK + 1) + ' to ' + ((c + 1) * DAYS_PER_CHUNK) + ': only the last ' + WINDOW + ' days match the filter, so only those partitions are read.' : 'Days ' + (c * DAYS_PER_CHUNK + 1) + ' to ' + ((c + 1) * DAYS_PER_CHUNK) + ': the partition filter skips every partition, with no read.'),
        chunk: c + 1, scanned });
    }
    return stepper(S, s => kids([
      h('div', { class: 'c15-stats-row' }, stat('GB scanned', r1(s.scanned)), stat('share of table', pct(s.scanned, TB_GB) + '%'))
    ]));
  }

  /* ---------- NUMBERS for the problem tabs ---------- */
  const coldRun = mode => { let remote = 0, hits = 0; for (let q = 1; q <= 4; q++) { if (mode === 'bad' || q === 1) remote += 100; else hits += 100; } return { remote, hits }; };
  const coldBad = coldRun('bad').remote, coldGood = coldRun('good').remote;
  const skBad = Math.max(...[Math.round(SK_ROWS * 0.6)].concat([0]).map(x => x / SK_SPEED));
  const skGood = (SK_ROWS / SK_PARTS) / SK_SPEED;
  const slotBad = Math.ceil(SLOT_Q / 2), slotGood = Math.ceil(SLOT_Q / 4);
  const scanBad = TB_GB, scanGood = WINDOW * PER_DAY;

  const PROBLEMS = [
    { tab: 'Cold workers refetch data',
      sym: 'the same table is read from remote storage on every query, even though the last query read it.',
      why: 'When workers are picked without regard to the data, a file is read by a worker that has no copy of it, and the cache never helps.',
      log: 'representative worker metrics, per query\nquery_id=q2 cache_hit_bytes=0 remote_read_bytes=100 GB\nquery_id=q3 cache_hit_bytes=0 remote_read_bytes=100 GB',
      demo: coldDemo,
      fix: ['Map each file to a worker with consistent hashing, so later queries on the same file go to the same worker.',
        'Keep the cache warm on each worker, and size it for the hot part of the table.',
        'Pin files that many queries need, so they are not evicted by a one-off scan.',
        'Verify: count remote GB read over four identical queries. Here it moves from ' + coldBad + ' GB to ' + coldGood + ' GB (illustrative).'] },
    { tab: 'Skew in a shuffle',
      sym: 'the query finishes when one partition finishes, and most workers sit idle while it runs.',
      why: 'A shuffle hashes rows by a key. If one key holds most rows, every row of that key lands in one partition, and that partition sets the finish time.',
      log: 'representative stage timing\nstage 2  tasks=8  p50=4.6 s  max=48 s  partition 0 rows=480\nstage 2  tasks=8  p50=4.6 s  max=10 s  after split',
      demo: skewDemo,
      fix: ['Detect the hot key from statistics or from the first stage, and split its rows across several partitions.',
        'Repartition at run time when a partition gets too full, and give the work to idle workers.',
        'Use a broadcast join when the small side fits in memory, so no shuffle is needed.',
        'Verify: compare the slowest partition with the median. Here the query ends at ' + r1(skBad) + ' s and ' + r1(skGood) + ' s (illustrative).'] },
    { tab: 'Too many queries for the slots',
      sym: 'every dashboard query slows down during peak hours, and a few wait for a long time.',
      why: 'Queries share a fixed pool of slots. When more queries arrive than there are slots, the extras queue, and each waits behind the ones before it.',
      log: 'representative queue metrics, one warehouse\nqueued_queries=8 running_queries=2 max_concurrency=2\nqueue_wait_p95=high',
      demo: slotDemo,
      fix: ['Add slots: scale out to a second warehouse or cluster for this workload.',
        'Set a per-group concurrency limit, so one team cannot take every slot.',
        'Give short interactive queries a separate queue from long batch jobs.',
        'Verify: count how many ticks the slowest query waits. Here it moves from ' + slotBad + ' to ' + slotGood + ' ticks (illustrative).'] },
    { tab: 'Unbounded scans',
      sym: 'a query for one week reads the whole multi-terabyte table, and the bill grows with it.',
      why: 'Without a filter that matches the partitioning, the engine has no reason to skip anything. Storage is read in full, and so is the price.',
      log: 'representative query stats\nbytes_billed=10000 GB  partitions_scanned=365 of 365\n(billing units differ by vendor; this is illustrative)',
      demo: scanDemo,
      fix: ['Filter on the partition column, such as the event day, so the engine can skip partitions.',
        'Cluster the table on the columns that queries filter, so zone maps can prune micropartitions or row groups.',
        'Set a cost or byte limit for ad hoc queries, so a missing filter fails fast.',
        'Verify: compare bytes scanned before and after the change. Here it moves from ' + scanBad + ' GB to ' + r1(scanGood) + ' GB.'] }
  ];

  root.append(
    sec('1 · The problem',
      para('Thousands of analysts run queries over petabytes. Each team, if it had its own cluster, would pay for idle capacity most of the day and wait in line at peak.'),
      para('Analytical work comes in bursts, so the capacity must grow and shrink, and the data must outlive any one cluster. (Illustrative: a shared cluster sized for the peak sits idle most of the time.)'),
      h('p', { class: 'sx-q', html: 'How can many teams share one analytical system that scales up for peaks and does not need a cluster per team?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> keep durable storage, elastic compute and query coordination apart, and run columnar work across many workers at once.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Disaggregation:</b> storage is a distributed file system or an object store. Compute is a pool of workers that can be added or removed. Dremel, Snowflake, Redshift and Yellowbrick all separate the two, though the details differ.',
        '<b>Self-describing data:</b> files carry their own schema, so any reader can open them. Dremel\'s nested columns and the PAX footer with zone maps are covered in chapter 3.',
        '<b>Vectorized execution:</b> columnar data suits block-at-a-time processing (chapter 10).',
        '<b>Shuffle:</b> a stage sends its output to the next stage by hash partition. Dremel keeps shuffle output in memory on shuffle nodes and spills to disk only when needed.',
        '<b>Deterministic, idempotent tasks:</b> each task produces the same result if it is run again, so a failed task can restart safely.',
        '<b>Stragglers:</b> when a task runs past a threshold, the coordinator runs a redundant copy. Snowflake uses work stealing: an early worker claims work from a slow one.',
        '<b>Dynamic resources and plans:</b> the number of workers per stage can change while the query runs. Dremel also changes a join from broadcast to hash join, and repartitions when a partition is too full.',
        '<b>Stratified optimizer:</b> rule-based rewrites first, then cost-based planning. The cost model uses only the statistics that exist, and adaptive steps correct the plan at run time (chapter 9 covers the optimizer). Snowflake prunes micropartitions with zone maps before execution (chapter 3 covers zone maps).',
        '<b>Snowflake statistics and adaptivity:</b> Snowflake keeps only simple zone maps, which stay in sync with its own micropartition format. Its adaptive step pushes downstream aggregations below joins in the plan, and enables them only at run time when the observed statistics justify it (notes 19 §4.1, §4.3).',
        '<b>Caching:</b> a worker keeps files it has read. Consistent hashing sends a file to the same worker, so the cache is hit again (Snowflake, Yellowbrick, Redshift).',
        '<b>Result caching:</b> a repeated identical query can return a stored result instead of running again. This is a general technique, not described in the course notes, so the chapter does not describe any one system\'s cache.',
        '<b>Snowflake hybrid tables:</b> Snowflake\'s Hybrid Tables (Unistore, 2022) take row-based writes with transactional guarantees, and background processes merge them into micropartitions for analytics (notes 19 §3.3). The notes also flag that files written outside the DBMS have no statistics.',
        '<b>Snowflake flexible compute:</b> for a plan fragment that will process a lot of data, Snowflake can borrow extra workers for a short time, like spot instances. Those workers write intermediate results back to the object store, so their own caches are not polluted (notes 19 §2.2).',
        '<b>Yellowbrick memory and devices:</b> a NUMA-aware, latch-free allocator reserves memory at startup, with huge pages. Each worker has an approximate LRU-K buffer pool. Custom user-space NVMe and NIC drivers and a reliable UDP protocol over DPDK cut copies and kernel work (notes 21 §3.1, §3.3).',
        '<b>Yellowbrick conclusion:</b> the low-level work only pays off if the planner produces good plans. The notes suggest eBPF as a more modern choice than DPDK (notes 21 §4).',
        '<b>Redshift overview:</b> Redshift began as ParAccel, a shared-nothing OLAP system. Athena (2016, a Presto rebrand) and Redshift Spectrum (2017, reads S3 directly) joined it. Managed storage moved to S3-based disaggregation in 2017, and serverless came in 2022. Redshift is a more traditional warehouse than BigQuery or Spark (notes 22 §2).',
        '<b>Compiled fragments:</b> Yellowbrick and Redshift compile fragments to machine code and reuse them. Redshift\'s compile service keeps a local and a fleet-wide cache (chapter 10 covers compilation).',
        '<b>Distributed joins:</b> with the right partitioning a join stays local. Four cases: one table replicated to every node (scenario 1); both tables partitioned on the join key (scenario 2); one small table broadcast (scenario 3); neither partitioned on the key, so both are reshuffled (scenario 4, a shuffle join). A semi-join sends only the join columns of one side. The join algorithms themselves are chapter 6.',
        '<b>Query failure:</b> most shared-nothing OLAP systems assume nodes do not fail during a query. If one node fails, the whole query fails and reruns from the start (lecture 23 notes, §2). Dremel avoids this with idempotent tasks and shuffle nodes.',
        '<b>Star and snowflake schemas:</b> a star schema has one fact table and dimension tables one join away. Fewer joins make it faster. A snowflake schema normalizes the dimensions, which saves space but needs more joins.',
        '<b>ETL and ELT:</b> ETL transforms data before loading it into the warehouse. ELT loads raw data first and transforms it inside the warehouse.',
        '<b>Decision support and eras:</b> decision support systems serve management and planning, using history loaded into a warehouse from OLTP databases. OLAP moved from data cubes (1990s) to warehouses (2000s), then shared-disk engines on object stores (2010s), then lakehouses (2020s) (notes 24 §1, notes 01 §1).',
        '<b>OLAP components:</b> a front-end parses the query. A planner (binder, rewriter, optimizer and cost model) builds the plan. A scheduler breaks it into fragments for the workers. An execution engine runs them, an I/O service fetches blocks from the object store, and a catalog tracks data locations and metadata (notes 01 §2.2).',
        '<b>Push and pull:</b> pushing the query to the data filters at the node that stores it. Pulling the data to the query is what a shared-disk system does, and it needs a filter to read only what is needed.',
        '<b>Shared nothing and shared disk:</b> defined in chapter 14. Cloud object stores are now the usual shared-disk storage (notes 01 §2.6).',
        '<b>Object-store layout:</b> large immutable files with a footer of offsets and zone maps, as covered in chapter 3. A reader fetches the footer first, then only the byte ranges it needs.',
        '<b>Managed and cloud-native:</b> a managed DBMS is an existing system run by a vendor, with backup and recovery handled for the client. A cloud-native system is built for the cloud, usually shared-disk. Serverless systems evict idle tenants and checkpoint their state to disk, so the user pays only for storage when idle.',
        '<b>Data lakes and catalogs:</b> a lake stores raw files without a schema, and the user writes the transformations. A catalog records which files exist. Chapter 16 covers the lakehouse layer on top.',
        '<b>OLAP commoditization:</b> catalogs, optimizers, file formats (Parquet, ORC, Iceberg, Arrow) and execution engines (Velox, DataFusion) now come as separate open components.'].map(x => '<li>' + x + '</li>').join('') })),
    sec('3 · Playground: one workload, four architectures',
      para('Pick the concurrency, the cache warmth and the scan size. Each row runs the same scan on one model. The models are illustrative and show only the shape of each design, not measured speed. The fastest row is highlighted.'),
      playground()),
    sec('4 · Case study 1 · BigQuery (Dremel): a shared pool of workers',
      para('Dremel is Google\'s interactive analysis system, and BigQuery is its managed service. Compute is a flexible pool of workers, and the data sits in a distributed file system. The read path below follows a query through stages and shuffle nodes.'),
      arch(BQ_ARCH),
      flow(BQ_COMPS, bqStates)),
    sec('5 · Case study 2 · Snowflake: warehouses over object storage',
      para('Snowflake stores its tables in object storage, in its own columnar micropartition format. Warehouses are groups of workers with local caches, and cloud services handle planning and metadata for every user.'),
      arch(SF_ARCH),
      flow(SF_COMPS, sfStates)),
    sec('6 · Case study 3 · Yellowbrick: shared disk on Kubernetes',
      para('Yellowbrick began as a fork of PostgreSQL 9.5 and runs as microservices on Kubernetes. Its storage is shared-disk, and the workers keep a local SSD cache. The read path below shows how a query reaches its data.'),
      arch(YB_ARCH),
      flow(YB_COMPS, ybStates)),
    sec('7 · Case study 4 · Redshift: compute nodes, managed storage and S3',
      para('Redshift began as ParAccel, a shared-nothing OLAP system. It moved to S3-based storage in 2017, and added serverless in 2022. Data goes to Redshift Managed Storage by default, and excess data can spill to S3.'),
      arch(RS_ARCH),
      flow(RS_COMPS, rsStates)),
    sec('8 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
