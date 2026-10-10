/* Chapter 27 "Cloud Data Warehouses" (index 26, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L24 Distributed OLAP Databases (execution models, planning, distributed joins, cloud systems); CMU 15-721 L01 Modern Analytical Database Systems (history, components, object stores), L17 BigQuery, L19 Snowflake, L21 Yellowbrick, L22 Redshift.
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: resizing shared-nothing against disaggregated, worker cache affinity, broadcast against shuffle joins on a chart, a skewed shuffle, and slots with a queue. Counts illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. Cache affinity: the same file must go to the same worker or its cache never helps ---- */
  const WX = i => 30 + i * 148;
  const FILES = [1, 2, 3, 4, 5, 6, 7, 8];
  const R1 = [[1, 5], [3, 6], [2, 8], [4, 7]];
  const R2 = [[1, 5, 2, 7], [3, 6, 1, 8], [2, 8, 4, 5], [4, 7, 3, 6]];
  const H = [[1, 5], [2, 6], [3, 7], [4, 8]];
  const H3 = [[1, 5, 4], [2, 6, 8], [3, 7], []];
  const cacheScene = {
    id: 'cache-affinity', label: 'Cache affinity', desc: 'Eight files of 12.5 GB make a 100 GB table in object storage. Four workers keep a local disk cache. Where a file is sent decides whether the cache ever helps (sizes illustrative).',
    codeLabel: 'Scheduler',
    code: { bug: [
      'SELECT ... FROM events WHERE day = ...;   -- the same 100 GB table, four dashboards in a row',
      'scheduler A: give each file to any free worker -> the file lands on a different worker each time',
      'every query misses and reads 100 GB from object storage again',
      'scheduler B: worker = hash(file) -> the same file always goes to the same worker (consistent hashing)',
      'remove one worker: only its files move, the rest keep their cache',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 files, 4 workers, 4 cache slots each. Illustrative.',
      header: s => ({ left: 'remote reads ' + (s.remote == null ? 0 : s.remote) + ' GB', right: s.right || '' }),
      draw(P, s) {
        const caches = s.cache || [[], [], [], []];
        for (let i = 0; i < 4; i++) {
          const gone = s.gone === i;
          P.box('w' + i, { x: WX(i), y: 100, w: 136, h: 118, tone: gone ? 'bad' : 'mut', label: '', sw: 2, dash: gone, op: gone ? 0.4 : 1 });
          P.text('wl' + i, { x: WX(i) + 68, y: 92, t: 'worker ' + (i + 1) + (gone ? ' (removed)' : ''), cls: 'mut xs', anchor: 'middle' });
          caches[i].forEach((f, k) => {
            const hit = s.hits && s.hits.some(([w, ff]) => w === i && ff === f);
            const warm = s.moved && s.moved.some(([w, ff]) => w === i && ff === f);
            P.chip('c' + i + '_' + f, { x: WX(i) + 8 + (k % 2) * 64, y: 108 + Math.floor(k / 2) * 52, w: 60, h: 46, label: 'f' + f, sub: hit ? 'hit' : (warm ? 'refetch' : 'cached'), tone: hit ? 'ok' : (warm ? 'warn' : 'info') });
          });
        }
        P.text('hs', { x: 30, y: 246, t: 'object storage: events, 8 files x 12.5 GB', cls: 'mut sm' });
        P.box('store', { x: 30, y: 254, w: 580, h: 44, tone: 'mut', label: '', sw: 2 });
        FILES.forEach((f, j) => P.chip('s' + f, { x: 40 + j * 71, y: 262, w: 62, h: 28, label: 'f' + f, tone: 'acc', small: true }));
        if (s.note) P.chip('nt', { x: 30, y: 306, w: 580, h: 34, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Ten terabytes of events sit in object storage. Four workers have empty local caches. Forty dashboards are about to read one 100 GB slice of it.', callout: 'Empty caches, 100 GB slice in storage', code: 0,
        state: { cache: [[], [], [], []], remote: 0 }, stats: [{ l: 'cache', v: 'empty' }, { l: 'slice', v: '100 GB' }] },
      { log: 'Query 1: the scheduler hands each file to any free worker. Each worker fetches its two files from object storage and keeps a copy.', callout: 'Query 1: files go to any free worker', code: 1,
        state: { cache: R1, remote: 100, note: 'miss on every file: 100 GB read', noteTone: 'warn' }, stats: [{ l: 'remote reads', v: '100 GB', cls: 'warn' }, { l: 'cache hits', v: '0' }] },
      { log: 'Query 2 asks for the same files, but the scheduler again picks workers freely. f1 now goes to worker 2, and f2 to worker 1. The copies already cached are on other workers.', callout: 'Query 2: the files land on other workers', moment: true, code: 2,
        state: { cache: R2, remote: 200, note: 'all 8 files fetched again: 200 GB total', noteTone: 'bad' }, stats: [{ l: 'remote reads', v: '200 GB', cls: 'bad' }, { l: 'hit rate', v: '0%', cls: 'bad' }] },
      { log: 'Four runs read 400 GB for one 100 GB table, and each run is no faster than the first. The workers are full of copies that no later query will use.', callout: 'Four runs: 400 GB, no run faster', code: 2,
        state: { cache: R2, remote: 400, note: 'cache full of copies nobody reuses', noteTone: 'bad' }, stats: [{ l: 'remote reads', v: '400 GB', cls: 'bad' }, { l: 'hit rate', v: '0%', cls: 'bad' }] },
      { log: 'Now the scheduler hashes the file name. f1 and f5 always go to worker 1, f2 and f6 to worker 2, and so on. The first query still reads from storage.', callout: 'Hash the file: the same file, the same worker', code: 3,
        state: { cache: H, remote: 100, note: 'cold start: 100 GB read once', noteTone: 'warn', right: 'hashed assignment' }, stats: [{ l: 'remote reads', v: '100 GB', cls: 'warn' }] },
      { log: 'The next dashboard runs the same query. Every file lands on the worker that already holds it. All eight are cache hits and nothing is read from storage.', callout: 'Next query: every file is a cache hit', moment: true, code: 3,
        state: { cache: H, remote: 0, hits: [[0, 1], [0, 5], [1, 2], [1, 6], [2, 3], [2, 7], [3, 4], [3, 8]], note: '0 GB read from remote storage', noteTone: 'ok', right: 'hashed assignment' }, stats: [{ l: 'remote reads', v: '0 GB', cls: 'ok' }, { l: 'hit rate', v: '100%', cls: 'ok' }] },
      { log: 'Worker 4 is removed. With consistent hashing only its files, f4 and f8, move. They are fetched once by workers 1 and 2. The other six keep hitting.', callout: 'Remove a worker: only 2 of 8 files move', code: 4,
        state: { cache: [[1, 5, 4], [2, 6, 8], [3, 7], []], gone: 3, hits: [[0, 1], [0, 5], [1, 2], [1, 6], [2, 3], [2, 7]], moved: [[0, 4], [1, 8]], remote: 25, note: '25 GB refetched, 75 GB served from cache', noteTone: 'ok', right: 'hashed assignment' }, stats: [{ l: 'remote reads', v: '25 GB', cls: 'ok' }, { l: 'hit rate', v: '75%', cls: 'ok' }],
        takeaway: 'A cache helps only if the same file keeps going to the same worker. Hash the file so the assignment survives the next query.' },
    ],
  };

  /* ---- 2. Shuffle: rows are sent to four partitions, and the stage ends when the biggest one is done ---- */
  const TXX = i => 270 + i * 84;
  const TOP = 112, TH = 170;
  const tank = (fr, mx) => Math.max(0, fr) * (TH - 8);
  const shuffle = {
    id: 'shuffle-skew', label: 'Shuffle and a hot key', desc: 'Stage 1 sends every row to one of four partitions by hash of the key. Four workers drain their partitions at the same speed, so a stage ends when its biggest partition is empty (sizes illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'Stage 1: scan events, hash(customer_id) -> partition 0..3     -- the shuffle',
      'Stage 2: four workers, one per partition, aggregate their rows',
      'even keys: every partition holds about 25% of the rows',
      'one customer is 55% of the rows: their partition holds 55%, so one worker has most of the work',
      'fix: salt the hot key into sub-keys, aggregate twice, or give the straggler a redundant copy',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 4 partitions, equal worker speed. Illustrative.',
      header: s => ({ left: s.hdr || 'stage 2', right: s.right || '' }),
      draw(P, s) {
        P.chip('pr', { x: 30, y: 110, w: 110, h: 60, label: 'stage 1', sub: 'scan + hash', tone: 'info' });
        P.chip('sh', { x: 152, y: 190, w: 100, h: 50, label: 'shuffle', sub: 'by key', tone: 'cursor' });
        P.line('l1', 85, 170, 190, 190, { tone: 'mut', arrow: true });
        const fr = s.fr || [0.25, 0.25, 0.25, 0.25];
        const left = s.left == null ? 1 : s.left;
        for (let i = 0; i < 4; i++) {
          P.box('tk' + i, { x: TXX(i), y: TOP, w: 72, h: TH, tone: 'mut', label: '', sw: 2 });
          const h = tank(fr[i] * (s.scale || 1) * left, 1);
          if (h > 1) P.box('fl' + i, { x: TXX(i) + 4, y: TOP + TH - 4 - h, w: 64, h, tone: s.hot === i ? 'bad' : 'ok', label: left < 1 ? '' : Math.round(fr[i] * 100) + '%', cls: 'xs' });
          P.text('tl' + i, { x: TXX(i) + 36, y: TOP + TH + 16, t: 'worker ' + (i + 1), cls: 'mut xs', anchor: 'middle' });
          if (s.idle && s.idle.includes(i)) P.chip('id' + i, { x: TXX(i) + 2, y: TOP + TH - 40, w: 68, h: 26, label: 'idle', tone: 'warn', small: true, r: 4 });
          if (s.dup && i === s.hot) P.chip('dp', { x: TXX(i) + 2, y: TOP - 30, w: 68, h: 24, label: 'copy', tone: 'ok', small: true, r: 4 });
        }
        P.line('l2', 254, 215, 266, 215, { tone: 'mut', arrow: true });
        if (s.note) P.chip('nt', { x: 30, y: 306, w: 580, h: 34, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Stage 1 scans the table and hashes each row\'s key to a partition number from 0 to 3. This exchange of rows between stages is the shuffle.', callout: 'The shuffle sends rows to four partitions', code: 0,
        state: { fr: [0.25, 0.25, 0.25, 0.25], left: 1, scale: 1, hdr: 'stage 1 output' }, stats: [{ l: 'partitions', v: '4' }] },
      { log: 'With evenly spread keys each partition holds about 25% of the rows. Each tank is the work waiting for one worker.', callout: 'Even keys: 25% per partition', code: 2,
        state: { fr: [0.25, 0.25, 0.25, 0.25], left: 1, scale: 3.4 }, stats: [{ l: 'largest partition', v: '25%', cls: 'ok' }] },
      { log: 'All four workers drain at the same speed and finish together. Adding workers would make each tank smaller.', callout: 'All finish together', code: 2,
        state: { fr: [0.25, 0.25, 0.25, 0.25], left: 0.02, scale: 3.4, hdr: 'stage 2 finished', note: 'all four workers done at the same moment', noteTone: 'ok' }, stats: [{ l: 'stage time', v: '1 unit', cls: 'ok' }, { l: 'idle workers', v: '0', cls: 'ok' }] },
      { log: 'Now one customer produces 55% of the rows. Every row with their key hashes to the same partition, so worker 2 has a tank more than twice as full as an even split.', callout: 'A hot key: partition 2 holds 55%', moment: true, code: 3,
        state: { fr: [0.15, 0.55, 0.15, 0.15], left: 1, scale: 1.7, hot: 1 }, stats: [{ l: 'largest partition', v: '55%', cls: 'bad' }, { l: 'median partition', v: '15%' }] },
      { log: 'The other three workers drain quickly and go idle. Worker 2 still has most of its tank left, and the whole stage waits for it.', callout: 'Three workers idle, the stage waits', code: 3,
        state: { fr: [0.15, 0.55, 0.15, 0.15], left: 0.45, scale: 1.7, hot: 1, idle: [0, 2, 3], note: 'median task 2 s, slowest task 20 s (illustrative)', noteTone: 'bad' }, stats: [{ l: 'stage time', v: '3.7 units', cls: 'bad' }, { l: 'idle workers', v: '3 of 4', cls: 'bad' }] },
      { log: 'More workers do not help: the hot key is one key and cannot be split by hashing. The stage time is set by the biggest partition.', callout: 'More workers do not shorten the stage', code: 3,
        state: { fr: [0.15, 0.55, 0.15, 0.15], left: 0.45, scale: 1.7, hot: 1, idle: [0, 2, 3], note: 'stage time = the biggest partition', noteTone: 'bad', right: '8 workers: same time' }, stats: [{ l: 'with 8 workers', v: 'same time', cls: 'bad' }] },
      { log: 'Salt the hot key into sub-keys and aggregate twice, or run a redundant copy of the straggler. The hot partition is split across workers and the stage ends sooner.', callout: 'Salt the key or duplicate the straggler', code: 4,
        state: { fr: [0.25, 0.25, 0.25, 0.25], left: 0.02, scale: 3.4, hdr: 'after salting the hot key', note: 'hot key spread over all four partitions', noteTone: 'ok', dup: 1, hot: 1 }, stats: [{ l: 'largest partition', v: '25%', cls: 'ok' }, { l: 'stage time', v: '1 unit', cls: 'ok' }],
        takeaway: 'A shuffle stage is as fast as its biggest partition. Skew, not worker count, sets the stage time.' },
    ],
  };

  /* ---- 3. Slots: a fixed number of execution slots, and a queue when a burst arrives ---- */
  const QX = i => 30 + (i % 3) * 62, QY = i => 112 + Math.floor(i / 3) * 34;
  const SXX = (i, row) => 292 + (i % 4) * 80;
  const SYY = (i, base) => base + Math.floor(i / 4) * 54;
  const slots = {
    id: 'slot-queue', label: 'Slots and the queue', desc: 'The shared warehouse has 8 execution slots. Forty teams refresh dashboards at 09:00. Queries beyond the slots wait in a queue, and a second cluster adds slots (counts illustrative).',
    codeLabel: 'Workload',
    code: { bug: [
      'warehouse: 8 slots; a query takes 1 slot for about 10 s',
      'quiet hour: 5 queries run at once, nothing waits',
      '09:00: 20 dashboard queries arrive in the same minute; 8 run, 12 wait',
      'queue wait grows to about 20 s on top of the 10 s run time',
      'multi-cluster scaling: start a second cluster of 8 slots while the queue is long, stop it when quiet',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 slots per cluster, equal queries. Illustrative.',
      header: s => ({ left: 'running ' + (s.run || 0) + ' · waiting ' + (s.wait || 0), right: s.right || '1 cluster' }),
      draw(P, s) {
        P.text('hq', { x: 30, y: 96, t: 'queue', cls: 'mut sm' });
        for (let i = 0; i < (s.wait || 0); i++) P.chip('q' + i, { x: QX(i), y: QY(i) + 6, w: 56, h: 28, label: 'q' + (s.run + i + 1), tone: 'warn', small: true });
        P.text('hs', { x: 292, y: 96, t: 'cluster 1: 8 slots', cls: 'mut sm' });
        for (let i = 0; i < 8; i++) { P.box('s1' + i, { x: SXX(i), y: SYY(i, 106), w: 72, h: 46, tone: 'mut', label: '', dash: true }); if (i < Math.min(8, s.run || 0)) P.chip('r1' + i, { x: SXX(i) + 4, y: SYY(i, 106) + 4, w: 64, h: 38, label: 'q' + (i + 1), sub: 'running', tone: 'cursor', small: false }); }
        if (s.c2) {
          P.text('hs2', { x: 292, y: 222, t: 'cluster 2: 8 more slots', cls: 'mut sm' });
          for (let i = 0; i < 8; i++) { P.box('s2' + i, { x: SXX(i), y: SYY(i, 232), w: 72, h: 46, tone: 'mut', label: '', dash: true }); if (i < (s.c2run || 0)) P.chip('r2' + i, { x: SXX(i) + 4, y: SYY(i, 232) + 4, w: 64, h: 38, label: 'q' + (9 + i), sub: 'running', tone: 'ok', small: false }); }
        }
        if (s.note) P.chip('nt', { x: 30, y: 314, w: 580, h: 28, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The warehouse has 8 slots. A query takes one slot while it runs, about 10 seconds.', callout: 'A warehouse with 8 slots', code: 0,
        state: { run: 0, wait: 0 }, stats: [{ l: 'slots', v: '8' }] },
      { log: 'In a quiet hour 5 queries run at once. Every one gets a slot immediately, so wall-clock time equals run time.', callout: 'Quiet hour: 5 queries, no waiting', code: 1,
        state: { run: 5, wait: 0 }, stats: [{ l: 'running', v: '5', cls: 'ok' }, { l: 'queue', v: '0', cls: 'ok' }] },
      { log: 'At 09:00 twenty dashboards refresh in the same minute. Eight queries take the slots, and the other twelve have to wait in the queue.', callout: '09:00: 20 arrive, 8 run, 12 wait', moment: true, code: 2,
        state: { run: 8, wait: 12, note: 'every slot busy, 12 queries queued' , noteTone: 'bad' }, stats: [{ l: 'running', v: '8' }, { l: 'waiting', v: '12', cls: 'bad' }] },
      { log: 'Each query still runs in 10 seconds, but the last ones wait twice before they start. Run time looks normal and wall-clock time is high.', callout: 'Run time normal, wall-clock time high', code: 3,
        state: { run: 8, wait: 12, note: 'queue wait ~20 s + run ~10 s = 30 s for the last queries', noteTone: 'bad' }, stats: [{ l: 'run time', v: '10 s', cls: 'ok' }, { l: 'wall-clock', v: '30 s', cls: 'bad' }] },
      { log: 'Multi-cluster scaling starts a second cluster of 8 slots when the queue is long. Eight of the waiting queries move onto it at once.', callout: 'A second cluster adds 8 slots', code: 4,
        state: { run: 8, wait: 4, c2: 1, c2run: 8, right: '2 clusters', note: 'queue drops from 12 to 4', noteTone: 'ok' }, stats: [{ l: 'slots', v: '16', cls: 'ok' }, { l: 'waiting', v: '4', cls: 'warn' }] },
      { log: 'The queue drains within a few seconds. When the burst is over, the second cluster is stopped, and you stop paying for it.', callout: 'The queue drains, the cluster stops later', code: 4,
        state: { run: 8, wait: 0, c2: 1, c2run: 4, right: '2 clusters', note: 'scale out for the burst, scale in when quiet', noteTone: 'ok' }, stats: [{ l: 'waiting', v: '0', cls: 'ok' }, { l: 'cost', v: 'burst only', cls: 'ok' }],
        takeaway: 'Slots are finite. A burst queues unless more compute starts, and elastic compute means paying for it only while it is needed.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "Forty analytics teams moved from their own fixed clusters, idle most of the day, to one shared cloud warehouse over a 10 TB events table (illustrative). At the 09:00 dashboard refresh, every dashboard is slow and some wait in a queue. Worker metrics show the same 100 GB table read from remote storage on every query, and one ad hoc query for last week billed the whole table.",
    "predict": {
      "q": "The same 100 GB table is queried four times in a row. Each worker has a local disk cache, but files are given to workers without regard to which worker read them before. How much is read from remote storage in total?",
      "opts": [
        "100 GB, because the first query warms the cache for the other three",
        "About 400 GB, because each query lands on workers that do not hold the files",
        "0 GB, because the warehouse keeps the whole table on its workers"
      ],
      "ans": 1,
      "why": "A cache only helps the worker that holds the file. If files land on random workers, every query misses and reads all 100 GB from storage again, which is what the worker metrics in the incident show."
    },
    "diagnose": [
      {
        "t": "Cold workers refetch data",
        "sym": "The same table is read from remote storage on every query, even though the last query read it.",
        "ctx": "Repeated dashboard queries are no faster than the first run. Remote read bytes stay flat per query and the cache hit rate is near zero.",
        "why": "When workers are picked without regard to the data, a file is read by a worker that has no copy of it, and the cache never helps.",
        "log": "representative worker metrics, per query\nquery_id=q2 cache_hit_bytes=0 remote_read_bytes=100 GB\nquery_id=q3 cache_hit_bytes=0 remote_read_bytes=100 GB",
        "fix": [
          "Measure first: compare cache_hit_bytes and remote_read_bytes for repeated queries on the same table.",
          "Map each file to a worker with consistent hashing, so later queries on the same file go to the same worker.",
          "Keep the cache warm on each worker, and size it for the hot part of the table.",
          "Pin files that many queries need, so they are not evicted by a one-off scan.",
          "Verify: count remote GB read over four identical queries. Here it moves from 400 GB to 100 GB (illustrative)."
        ]
      },
      {
        "t": "Skew in a shuffle",
        "sym": "The query finishes when one partition finishes, and most workers sit idle while it runs.",
        "ctx": "One stage shows a median task time of a few seconds and a maximum ten times longer. Adding workers does not shorten it.",
        "why": "A shuffle hashes rows by a key. If one key holds most rows, every row of that key lands in one partition, and that partition sets the finish time.",
        "log": "representative stage timing\nstage 2  tasks=8  p50=4.6 s  max=48 s  partition 0 rows=480\nstage 2  tasks=8  p50=4.6 s  max=10 s  after split",
        "fix": [
          "Measure first: compare the slowest task (max) with the median (p50) of the stage, and check the row count of the slowest partition.",
          "Detect the hot key from statistics or from the first stage, and split its rows across several partitions.",
          "Repartition at run time when a partition gets too full, and give the work to idle workers.",
          "Use a broadcast join when the small side fits in memory, so no shuffle is needed.",
          "Verify: compare the slowest partition with the median. Here the query ends at 48 s and 10 s (illustrative)."
        ]
      },
      {
        "t": "Too many queries for the slots",
        "sym": "Every dashboard query slows down during peak hours, and a few wait for a long time.",
        "ctx": "Run time per query is normal, but wall-clock time is high. The queue is long at the top of each hour.",
        "why": "Queries share a fixed pool of slots. When more queries arrive than there are slots, the extras queue, and each waits behind the ones before it.",
        "log": "representative queue metrics, one warehouse\nqueued_queries=8 running_queries=2 max_concurrency=2\nqueue_wait_p95=high",
        "fix": [
          "Measure first: compare queued_queries with running_queries and max_concurrency at peak, and watch queue_wait_p95.",
          "Add slots: scale out to a second warehouse or cluster for this workload.",
          "Set a per-group concurrency limit, so one team cannot take every slot.",
          "Give short interactive queries a separate queue from long batch jobs.",
          "Verify: count how many ticks the slowest query waits. Here it moves from 5 to 3 ticks (illustrative)."
        ]
      },
      {
        "t": "Unbounded scans",
        "sym": "A query for one week reads the whole multi-terabyte table, and the bill grows with it.",
        "ctx": "One ad hoc query dominates the daily cost report. Its bytes scanned equal the table size.",
        "why": "Without a filter that matches the partitioning, the engine has no reason to skip anything. Storage is read in full, and so is the price.",
        "log": "representative query stats\nbytes_billed=10000 GB  partitions_scanned=365 of 365\n(billing units differ by vendor; this is illustrative)",
        "fix": [
          "Measure first: check bytes_billed and partitions_scanned for the query against the size of the window it asks for.",
          "Filter on the partition column, such as the event day, so the engine can skip partitions.",
          "Cluster the table on the columns that queries filter, so zone maps can prune micropartitions or row groups.",
          "Set a cost or byte limit for ad hoc queries, so a missing filter fails fast.",
          "Verify: compare bytes scanned before and after the change. Here it moves from 10000 GB to 191.8 GB."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L24 Distributed OLAP Databases; CMU 15-721 L01 Modern OLAP, L17 BigQuery, L19 Snowflake, L21 Yellowbrick, L22 Redshift (notes in output/pdf)', href: '../../output/pdf/cmu-15445-fall2024/notes/24-distributedolap.pdf' };

  /* ---- 1. Resize: copying data between nodes against adding stateless compute ---- */
  const RN = i => 30 + i * 74;
  const resize = {
    id: 'resize-cluster', label: 'Resize the cluster', desc: 'Eight data blocks. In a shared-nothing cluster each node owns its blocks, so adding nodes means copying blocks. In a disaggregated cluster the blocks live in object storage and new nodes only start up and warm a cache (counts illustrative).',
    codeLabel: 'Compare',
    code: { bug: [
      'shared nothing: 4 nodes own 2 blocks each; 8 nodes should own 1 each',
      'add 4 nodes: copy 4 of the 8 blocks to the new nodes, queries run slower meanwhile',
      'disaggregated: the 8 blocks stay in the object store; any node can read any block',
      'add 4 nodes: they start empty and fetch what queries ask for, then cache it',
      'compute can be added, removed or paused without moving data',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 blocks, 4 then 8 nodes. Illustrative.',
      header: s => ({ left: s.hl || 'shared nothing (top) and disaggregated (bottom)', right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 82, t: 'shared nothing: each node owns blocks on its own disk', cls: 'mut sm' });
        const n = s.nodes || 4;
        for (let i = 0; i < n; i++) { const mv = s.moving && i >= 4; const blocks = n === 4 ? 'b' + (2 * i + 1) + ' b' + (2 * i + 2) : 'b' + (i + 1);
          P.chip('s' + i, { x: RN(i), y: 94, w: 66, h: 46, label: 'node ' + (i + 1), sub: mv ? 'copy ' + blocks : blocks, tone: i >= 4 ? (mv ? 'warn' : 'live') : 'info', small: true }); }
        if (s.moving) P.chip('cp', { x: 30, y: 148, w: 330, h: 26, label: 'copying 4 of 8 blocks over the network', sub: '', tone: 'warn', small: true });
        P.text('h2', { x: 30, y: 194, t: 'disaggregated: data in an object store, compute is stateless', cls: 'mut sm' });
        P.box('os', { x: 30, y: 202, w: 560, h: 36, tone: 'mut', label: 'object store: b1 b2 b3 b4 b5 b6 b7 b8', cls: 'sm' });
        for (let i = 0; i < n; i++) P.chip('d' + i, { x: RN(i), y: 250, w: 66, h: 46, label: 'node ' + (i + 1), sub: i >= 4 && s.cold ? 'cold cache' : (i >= 4 ? 'new' : 'cache'), tone: i >= 4 ? (s.cold ? 'cursor' : 'live') : 'info', small: true });
        if (s.ready) P.chip('rd', { x: 30, y: 306, w: 330, h: 26, label: 'serving queries right away, cache warms up', sub: '', tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'The cluster has four nodes. In the shared-nothing design (top) each node owns two blocks on its own disk. In the disaggregated design (bottom) all eight blocks are in an object store and the nodes keep only a cache.', callout: 'Four nodes, eight blocks', code: 0, state: { nodes: 4 }, stats: [{ l: 'nodes', v: '4' }] },
      { log: 'The load doubles and four nodes are added to each cluster. In the top design the new nodes own nothing yet. Blocks have to move to them before they can help.', callout: 'Add four nodes', code: 1, state: { nodes: 8, hl: 'four nodes added' }, stats: [{ l: 'nodes', v: '8' }] },
      { log: 'Shared nothing copies blocks to rebalance: four of the eight blocks cross the network, and during the copy the cluster is busy and queries are slower. At terabytes this takes hours.', callout: 'Shared nothing: copy 4 of 8 blocks', moment: true, code: 1, state: { nodes: 8, moving: 1, hl: 'rebalancing the data' }, stats: [{ l: 'data moved', v: '50%', cls: 'bad' }] },
      { log: 'Disaggregated: nothing moves. The new nodes read any block from the object store and cache what they use. The first queries on them are cold and slower, then the cache warms.', callout: 'Disaggregated: nothing to copy', code: 3, state: { nodes: 8, cold: 1, ready: 1, hl: 'new nodes start empty' }, stats: [{ l: 'data moved', v: '0', cls: 'ok' }] },
      { log: 'Because compute holds no data, it can be scaled down or paused to zero when idle, and storage is billed separately. The price is remote reads for cold data and a cache to manage.', callout: 'Compute and storage scale separately', code: 4, state: { nodes: 8, cold: 1, ready: 1, hl: 'pay for compute only when it runs' }, stats: [{ l: 'trade', v: 'elasticity for cold reads', cls: 'warn' }],
        takeaway: 'Disaggregated storage makes resizing free of data movement. The cost is cold reads, which a worker cache has to hide.' },
    ],
  };

  /* ---- 3. Distributed join: bytes sent over the network for three strategies ---- */
  const JB = { bc: { name: 'broadcast small table', tone: 'warn' }, sh: { name: 'shuffle both tables', tone: 'bad' }, co: { name: 'colocated: no network', tone: 'ok' } };
  const jw = v => Math.max(4, Math.log10(v + 1) / 3.3 * 330);
  const joinS = {
    id: 'join-strategies', label: 'Broadcast or shuffle', desc: 'A 1,000 GB table joined with a smaller one on 8 workers. Broadcast copies the small table to every worker. Shuffle repartitions both by the join key. A colocated join needs neither. The cheaper choice depends on the size of the small table (GB sent over the network, illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'big = 1,000 GB, small = 2 GB, 8 workers',
      'broadcast small: 8 copies x 2 GB = 16 GB over the network; the big table stays put',
      'shuffle both: 7/8 of 1,000 GB + 7/8 of 2 GB = about 877 GB',
      'colocated: both tables already partitioned by the join key: 0 GB',
      'if small = 200 GB: broadcast 8 x 200 = 1,600 GB, shuffle about 1,050 GB: shuffle wins',
    ] },
    stage: DB.stage({
      footer: 'Rows of data sent over the network, in GB. Bar length is on a log scale.',
      header: s => ({ left: s.hl || 'big 1,000 GB, small ' + (s.small || 2) + ' GB, 8 workers', right: '' }),
      draw(P, s) {
        const small = s.small || 2, bc = 8 * small, sh = Math.round(7 / 8 * (1000 + small));
        [['bc', bc], ['sh', sh], ['co', 0]].forEach(([k, v], i) => { if (!(s.show || []).includes(k)) return;
          P.text('n' + k, { x: 40, y: 124 + i * 62, t: JB[k].name, cls: 'sm' });
          P.box('b' + k, { x: 40, y: 132 + i * 62, w: jw(v), h: 26, tone: s.best === k ? 'ok' : JB[k].tone, label: '' });
          P.text('v' + k, { x: 40 + jw(v) + 8, y: 151 + i * 62, t: v.toLocaleString('en-US') + ' GB', cls: 'sm' }); });
        if (s.note) P.chip('nt', { x: 40, y: 318, w: 500, h: 28, label: s.note, sub: '', tone: s.noteTone || 'info', small: true });
      }
    }),
    bug: [
      { log: 'A large table of 1,000 GB must be joined with a small table of 2 GB on a key. The two tables are spread over 8 workers, and the rows that match may be on different workers.', callout: 'Rows that match are on different workers', code: 0, state: { show: [] }, stats: [{ l: 'big', v: '1,000 GB' }, { l: 'small', v: '2 GB' }] },
      { log: 'Broadcast: send the small table to every worker, so each worker can join its own slice of the big table with it. 8 copies of 2 GB is 16 GB, and the big table never moves.', callout: 'Broadcast: 16 GB', code: 1, state: { show: ['bc'], note: 'the big table does not move', noteTone: 'ok' }, stats: [{ l: 'network', v: '16 GB', cls: 'ok' }] },
      { log: 'Shuffle: repartition both tables by the join key, so equal keys meet. On 8 workers about 7/8 of every row moves, so almost the whole 1,000 GB crosses the network.', callout: 'Shuffle both: about 877 GB', moment: true, code: 2, state: { show: ['bc', 'sh'] }, stats: [{ l: 'network', v: '877 GB', cls: 'bad' }] },
      { log: 'If both tables were already partitioned on the join key, each worker joins its own partitions and nothing is sent. This is why the partition key of a warehouse table matters.', callout: 'Colocated: nothing sent', code: 3, state: { show: ['bc', 'sh', 'co'], best: 'co' }, stats: [{ l: 'network', v: '0 GB', cls: 'ok' }] },
      { log: 'Now make the small table 200 GB. Broadcast has to send 8 copies, 1,600 GB, more than a shuffle of about 1,050 GB. The planner must compare both with the estimated sizes, since the best strategy flips.', callout: 'A bigger small table flips the choice', moment: true, code: 4, state: { small: 200, show: ['bc', 'sh', 'co'], best: 'sh', hl: 'big 1,000 GB, small 200 GB, 8 workers', note: 'broadcast 1,600 GB > shuffle 1,050 GB', noteTone: 'warn' }, stats: [{ l: 'better', v: 'shuffle', cls: 'warn' }],
        takeaway: 'Broadcast wins when one side is small, shuffle wins when both are large, and colocation avoids both. Estimates decide, so statistics matter again.' },
    ],
  };

  const EXPLAIN = `
<h3>1. How analytical systems evolved</h3>
<p>The 15-721 lecture gives the history. In the 1990s, <b>data cubes</b> kept pre-computed multi-dimensional aggregates that administrators had to define in advance. In the 2000s, <b>data warehouses</b> were monolithic, shared-nothing, column-oriented systems, often forks of Postgres, fed by ETL from the OLTP databases. In the 2010s, <b>shared-disk engines</b> used third-party object storage instead of custom storage, first managing the files themselves and later accepting files from outside. In the 2020s, <b>lakehouses</b> add schema control and transactions on top of open files in a data lake (next chapter). Three observations drive them: people want more than SQL, decoupling storage from the DBMS removes ingest and egress barriers, and most data is semi-structured.</p>

<h3>2. Components of an OLAP system</h3>
<p>Most systems share a structure, and many parts are now reusable services or libraries: catalog, intermediate representation, optimizer, file format, execution engine. The <b>front-end</b> parses the query. The <b>planner</b> binds, rewrites and optimizes it with a cost model. The <b>scheduler</b> splits the plan into <b>fragments</b>, assigns them to workers and schedules execution. The <b>execution engine</b> on each worker runs its fragments. An <b>I/O service</b> turns block requests into reads from the object store and caches results. The <b>catalog</b> holds file locations, schema and statistics, and talks to every component except the front-end.</p>
<figure class="mm" aria-label="Flowchart of the components of a cloud OLAP system" style="--diagram-width:360px">
  <img src="diagrams/ch26-olap-components.svg" alt="Flowchart: a SQL query goes to the front-end parser, then the planner, which binds, rewrites and optimizes with a cost model, then the scheduler, which cuts the plan into fragments, then the execution engines on worker nodes. The workers talk to an I/O service with a local cache, which talks to an object store of immutable columnar files. The catalog of files, schema and statistics feeds the planner, scheduler and I/O service.">
  <figcaption>Flowchart: the parts of a cloud analytical DBMS.</figcaption>
</figure>

<h3>3. Persistent and intermediate data, and where work runs</h3>
<p>A query plan is a DAG of physical operators. Its data is of two kinds. <b>Persistent data</b> is the source of record, the table files, assumed immutable and updated by rewriting. <b>Intermediate data</b> is short-lived, produced by one operator for another, and its size has little to do with the amount of persistent data read or the run time. The architecture decides how a query meets data. <b>Push the query to the data</b>: send the query or a fragment to the node that has the data and filter there, which sends less over the network. <b>Pull the data to the query</b>: needed when the storage has no compute, as with an object store. In practice both are mixed: a storage service may filter, and workers pull the rest.</p>

<h3>4. Object stores and caches</h3>
<p>To keep a table in an object store, the DBMS partitions it into large <b>immutable files</b> in a columnar (PAX) layout. The footer holds the offsets, encodings, indexes and zone maps (chapter 4). The reader fetches the footer first, then reads only the byte ranges it needs with GET requests; each cloud has its own API (GET, PUT, DELETE). Object stores have high latency and a cost per request, so systems read large ranges, avoid many small reads, and keep a <b>cache</b> on the workers&rsquo; local disks. A cache only helps if the same file goes to the same worker, called <b>cache affinity</b>.</p>

<h3>5. Distributed execution and joins</h3>
<p>OLAP execution models from the 445 lecture: a <b>push</b> model sends data to the next stage, and a <b>pull</b> model has it requested. <b>Distributed query planning</b> can be physical, one planner assigns each operator to nodes, or sliced, with each node optimizing its fragment. For a join the planner picks one of three. A <b>colocated</b> join needs both tables partitioned on the join key and sends nothing. A <b>broadcast</b> join copies a small table to every node. A <b>shuffle</b> join repartitions both tables by the join key so equal keys meet. A shuffle of a skewed key sends too much to one worker, and the stage ends when the slowest worker ends.</p>
<figure class="mm" aria-label="Decision flowchart for choosing colocated, broadcast or shuffle join" style="--diagram-width:492px">
  <img src="diagrams/ch26-join-strategies.svg" alt="Flowchart: for a distributed join, if both tables are already partitioned on the join key use a colocated join with no network. Otherwise, if one side is small enough to copy everywhere, broadcast it to every worker. Otherwise shuffle: repartition both tables by the join key.">
  <figcaption>Flowchart: the choice of a distributed join.</figcaption>
</figure>

<h3>6. Case studies from 15-721</h3>
<p><b>BigQuery (Dremel)</b>: disaggregated compute, storage and memory, with a distributed file system for storage, serverless compute, self-describing columnar files with repetition and definition levels for nested data (chapter 4), and vectorized execution. Queries run as a DAG of stages through a <b>shuffle persistence layer</b>: tasks are deterministic and idempotent, so a failed or slow task can simply run again, and workers come from a flexible pool. <b>Snowflake</b>: object storage plus a local-disk cache, <b>virtual warehouses</b> of worker nodes billed on use, a push-based vectorized engine with precompiled kernels and generated serialization, workers pushing data to each other with no shuffle step, <b>work stealing</b> from stragglers (the thief reads from the object store, not from the straggler), and a rerun of the whole query on failure. Cloud services share a transactional key-value store. <b>Redshift</b>: started in 2012 as shared-nothing ParAccel, moved to disaggregated storage on S3 in 2017, added serverless in 2022. It generates and caches compiled C++ fragments (chapter 15), uses precompiled primitives, a compute-side cache and a PAX format. <b>Yellowbrick</b>: a Postgres fork once sold as a hardware appliance, now a Kubernetes service with shared-disk storage, push-based vectorized execution with C++ code generation and heavy use of compute-side caches. The same recipe appears in all four: separate storage and compute, columnar files, a cache, and vectorized or compiled execution.</p>

<h3>7. Resource limits: slots and queues</h3>
<p>A shared warehouse has a limited number of execution slots. When more queries arrive than slots, the extra ones wait in a queue, or the service adds a cluster. Queries that scan too much are billed by bytes scanned in some services, so partition pruning and column selection are also cost controls.</p>

<h3>8. The trade-off</h3>
<p>Disaggregation gives elasticity, independent scaling and shared data, and costs remote-read latency that caches must hide. Shuffle-based execution tolerates failures and uneven nodes, and moves data through the network. Serverless billing matches cost to use and makes bad queries expensive. The practical levers are the partition key, file size and sort order, the cache, and limits on concurrency and bytes scanned.</p>

<h3>9. Syntax</h3>
<pre>-- BigQuery: see the cost before you pay (dry run) and prune by partition
-- bq query --dry_run 'SELECT sum(amount) FROM events WHERE event_date BETWEEN "2026-06-01" AND "2026-06-07"'
--   This query will process 61 GB when run.

-- Snowflake: size a virtual warehouse and let it pause when idle
CREATE WAREHOUSE bi WITH WAREHOUSE_SIZE = 'MEDIUM' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
SELECT query_id, bytes_scanned, partitions_scanned, partitions_total, queued_overload_time
FROM snowflake.account_usage.query_history ORDER BY start_time DESC LIMIT 5;

-- Redshift: distribution key for colocated joins, sort key for pruning
CREATE TABLE orders (order_id bigint, customer_id bigint, order_date date)
DISTKEY (customer_id) SORTKEY (order_date);
EXPLAIN SELECT ... ;   -- DS_DIST_NONE means colocated, DS_BCAST_INNER broadcast, DS_DIST_BOTH shuffle</pre>
<p>Compare <code>partitions_scanned</code> with <code>partitions_total</code> and <code>queued_overload_time</code> with the run time: the first says whether pruning works, the second whether the problem is capacity.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict, diagnose: OLD.diagnose,
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[26] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [resize, cacheScene, joinS, shuffle, slots] };
})();
