/* Chapter 4 "Read Path": scenes and Explain override (index 4, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes, each a different mechanism: Bloom filter probes, an ALLOW FILTERING scan, and a scan that evicts the row cache.
   Counts and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const RANGE12 = Array.from({ length: 12 }, (_, i) => i + 1);

  /* ---- 1. Bloom filter probes: a point read opens only the files a filter cannot rule out ---- */
  const FOOT_BLOOM = 'Simplified: one replica, 12 SSTables, counts illustrative.';
  const MAYBE = [2, 4, 5, 7, 9, 10, 11];   // 7 filters answer maybe
  const REAL = 7;                          // the one file that holds order 42
  const ABSENT = [1, 3, 6, 8, 12];         // 5 filters answer absent and are skipped
  const bfPos = n => ({ x: [188, 268, 348][(n - 1) % 3], y: 100 + Math.floor((n - 1) / 3) * 66 });
  const opPos = k => ({ x: [456, 540][k % 2], y: 100 + Math.floor(k / 2) * 66 });
  const FILE_TOKENS = {};
  RANGE12.forEach(n => { FILE_TOKENS['f' + n] = { label: 'SST ' + n, sub: 'SSTable', tone: 'info', w: 76 }; });
  const plainFiles = () => Object.fromEntries(RANGE12.map(n => ['f' + n, { ...bfPos(n) }]));
  const answeredFiles = () => Object.fromEntries(RANGE12.map(n => {
    const p = bfPos(n);
    if (n === REAL) return ['f' + n, { ...p, tone: 'live', sub: 'real hit' }];
    if (MAYBE.includes(n)) return ['f' + n, { ...p, tone: 'warn', sub: 'maybe' }];
    return ['f' + n, { ...p, tone: 'ok', sub: 'absent' }];
  }));
  const openedFiles = () => Object.fromEntries([
    ...MAYBE.map(n => ['f' + n, n === REAL ? { ...opPos(MAYBE.indexOf(n)), tone: 'live', sub: 'real hit' } : { ...opPos(MAYBE.indexOf(n)), tone: 'warn', sub: 'no key' }]),
    ...ABSENT.map(n => ['f' + n, { ...bfPos(n), tone: 'ok', sub: 'absent' }]),
  ]);
  const QREQ = { x: 24, y: 120 };
  const RES = { x: 24, y: 250 };
  const bloomProbes = {
    id: 'bloom-probes', label: 'Bloom skips files', desc: 'A point read checks every SSTable filter, and a high false-positive rate opens files that hold nothing (counts illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      '# table options (illustrative)',
      'bloom_filter_fp_chance: 0.01',
      'SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;',
      '# 12 SSTables on disk, 1 holds this partition',
      '# filters say maybe for 7: 1 real hit, 6 false positives',
      '# skipped 5 files, opened 7',
    ] },
    scene: { w: 640, h: 420, footer: FOOT_BLOOM, panels: [
      { id: 'rq', x: 16, y: 58, w: 150, h: 290, title: 'Point read', tone: 'info' },
      { id: 'bf', x: 180, y: 58, w: 250, h: 290, title: 'Bloom filter per file', tone: 'info' },
      { id: 'op', x: 444, y: 58, w: 186, h: 290, title: 'Files actually opened', tone: 'info' },
    ], tokens: {
      ...FILE_TOKENS,
      q: { label: 'order 42', sub: 'seller 77', tone: 'cursor', w: 118 },
      res: { label: 'order 42', sub: 'newest cell', tone: 'ok', w: 118 },
    } },
    bug: [
      { log: 'A point read asks for seller 77, order 42. Each of the 12 SSTables gets a Bloom filter check (counts illustrative).', callout: 'Every SSTable gets a filter check', code: 3,
        at: { q: { ...QREQ }, ...plainFiles() }, stats: [{ l: 'SSTables checked', v: '12', cls: 'warn' }] },
      { log: 'Seven filters answer maybe. One is the right file, and six are false positives (illustrative).', callout: 'Seven say maybe, only one is right', code: 4,
        at: { q: { ...QREQ }, ...answeredFiles() }, stats: [{ l: 'maybe answers', v: '7', cls: 'warn' }, { l: 'absent answers', v: '5', cls: 'ok' }] },
      { log: 'The seven maybe files are opened through their partition index. Six of those opens find no cell for the key.', callout: 'Six opened files find nothing', moment: true, code: 5,
        at: { q: { ...QREQ }, ...openedFiles() }, stats: [{ l: 'files opened', v: '7', cls: 'bad' }, { l: 'no key found', v: '6', cls: 'bad' }] },
      { log: 'Each open costs an index jump and a disk read. The five absent files were skipped without any disk work.', callout: 'Each open is an index jump and a read', code: 5,
        at: { q: { ...QREQ }, ...openedFiles() }, stats: [{ l: 'files opened', v: '7', cls: 'bad' }, { l: 'files skipped', v: '5', cls: 'ok' }] },
      { log: 'The replica merges the cells from the real file with the memtable. For each cell, the newest timestamp wins.', callout: 'Merge by timestamp, newest cell wins', code: 2,
        at: { q: { ...QREQ }, res: { ...RES }, ...openedFiles() }, arrows: [['f7', 'res', 'merge']],
        stats: [{ l: 'files opened', v: '7', cls: 'bad' }, { l: 'p99 read', v: '40 ms (illustrative)', cls: 'bad' }] },
      { log: 'A lower target such as 0.001 cuts false opens, but each key then costs about 14.4 bits instead of 9.6 (illustrative).', callout: 'A lower target costs memory on every key', code: 1,
        at: { q: { ...QREQ }, res: { ...RES }, ...openedFiles() }, stats: [{ l: 'bits per key at 0.01', v: '9.6', cls: 'ok' }, { l: 'bits per key at 0.001', v: '14.4', cls: 'warn' }] },
      { log: 'A filter never skips a file that holds the key, so a read that must touch many files stays expensive.', callout: 'A filter cannot skip a file with the key',
        at: { q: { ...QREQ }, res: { ...RES }, ...openedFiles() }, stats: [{ l: 'files opened', v: '7', cls: 'bad' }],
        takeaway: 'Bloom filters skip only files that surely lack the key. Tune the false-positive target only when wasted opens cost real latency.' },
    ],
  };

  /* ---- 2. ALLOW FILTERING: no partition key restriction, so every partition is a candidate ---- */
  const FOOT_SCAN = 'Simplified: one table, one replica. Counts illustrative.';
  const KEPT = [2, 5, 8, 11];              // partitions that hold a matching row
  const pPos = n => ({ x: [216, 296, 376][(n - 1) % 3], y: 100 + Math.floor((n - 1) / 3) * 66 });
  const PART_TOKENS = {};
  RANGE12.forEach(n => { PART_TOKENS['p' + n] = { label: 'part ' + n, sub: 'scan', tone: 'info', w: 74 }; });
  const plainParts = () => Object.fromEntries(RANGE12.map(n => ['p' + n, { ...pPos(n) }]));
  const sortedParts = () => Object.fromEntries(RANGE12.map(n => [
    'p' + n, KEPT.includes(n) ? { ...pPos(n), tone: 'ok', sub: 'kept' } : { ...pPos(n), tone: 'warn', sub: 'dropped' },
  ]));
  const QSCAN = { x: 31, y: 130 };
  const OUT = { x: 478, y: 150 };
  const fullScan = {
    id: 'full-scan', label: 'ALLOW FILTERING scan', desc: 'Without a partition key restriction, the query reads every partition and throws most rows away (counts illustrative).',
    codeLabel: 'CQL',
    code: { bug: [
      'cqlsh> TRACING ON;',
      "SELECT * FROM orders WHERE status = 'open' ALLOW FILTERING;",
      '-- status is not part of PRIMARY KEY (seller_id, order_id)',
      '-- no partition key restriction: every partition is a candidate',
      '-- rows returned: 1,204; rows scanned: about 38,000,000 (illustrative)',
    ] },
    scene: { w: 640, h: 420, footer: FOOT_SCAN, panels: [
      { id: 'qp', x: 16, y: 58, w: 180, h: 290, title: 'CQL request', tone: 'info' },
      { id: 'pp', x: 212, y: 58, w: 240, h: 290, title: 'All partitions read', tone: 'info' },
      { id: 'cl', x: 468, y: 58, w: 156, h: 290, title: 'Client', tone: 'info' },
    ], tokens: {
      ...PART_TOKENS,
      qy: { label: 'SELECT', sub: 'status = open', tone: 'cursor', w: 150 },
      out: { label: 'rows: 1,204', sub: 'returned', tone: 'ok', w: 136 },
    } },
    bug: [
      { log: 'The query filters on status, which is not in the key. There is no partition key restriction, so every partition is a candidate.', callout: 'No partition key restriction', code: 2,
        at: { qy: { ...QSCAN }, ...plainParts() }, stats: [{ l: 'partition key', v: 'not set', cls: 'bad' }] },
      { log: 'The query fans out. Every partition is read in full, and each row is tested against status = open after it is read.', callout: 'Every partition is read, row by row', code: 3,
        at: { qy: { ...QSCAN }, ...plainParts() }, arrows: [['qy', 'p1', 'scan']], stats: [{ l: 'rows scanned', v: 'about 38,000,000 (illustrative)', cls: 'bad' }] },
      { log: 'Only 1,204 rows match (illustrative). The other rows were read and thrown away after the test.', callout: 'Most rows read are thrown away', moment: true, code: 4,
        at: { qy: { ...QSCAN }, ...sortedParts() }, stats: [{ l: 'rows scanned', v: 'about 38,000,000', cls: 'bad' }, { l: 'rows returned', v: '1,204', cls: 'ok' }] },
      { log: 'The matching rows travel to the client. The waste is the ratio of rows scanned to rows returned.', callout: 'Matches travel to the client', code: 4,
        at: { qy: { ...QSCAN }, ...sortedParts(), out: { ...OUT } }, arrows: [['p5', 'out', 'matches']], stats: [{ l: 'rows scanned', v: 'about 38,000,000', cls: 'bad' }, { l: 'rows returned', v: '1,204', cls: 'ok' }] },
      { log: 'The query takes 41 seconds (illustrative) for 1,204 rows. The cost follows the table size, not the number of rows returned.', callout: 'Cost follows table size, not results', code: 4,
        at: { qy: { ...QSCAN }, ...sortedParts(), out: { ...OUT } }, stats: [{ l: 'duration', v: '41 s (illustrative)', cls: 'bad' }, { l: 'rows returned', v: '1,204', cls: 'ok' }] },
      { log: 'About 31,500 rows are scanned for each row returned (illustrative, from the two counts above).', callout: 'Scanned per returned row: about 31,500', code: 4,
        at: { qy: { ...QSCAN }, ...sortedParts(), out: { ...OUT } }, stats: [{ l: 'scanned per row', v: '~31,500 (illustrative)', cls: 'bad' }] },
      { log: 'A table keyed for this query, such as PRIMARY KEY ((status, day), order_id), reads one partition instead of all of them.', callout: 'Key the table for the query', code: 1,
        at: { qy: { ...QSCAN }, ...sortedParts(), out: { ...OUT } }, stats: [{ l: 'partitions read', v: 'one, by key', cls: 'ok' }],
        takeaway: 'ALLOW FILTERING reads every partition and filters afterwards. Cost grows with table size, so key the table by the query.' },
    ],
  };

  /* ---- 3. Row cache: an analytics scan without BYPASS CACHE evicts the hot rows point reads depend on ---- */
  const FOOT_CACHE = 'Simplified: 4-slot row cache, one replica. Sizes illustrative.';
  const CS = [{ x: 214, y: 110 }, { x: 310, y: 110 }, { x: 214, y: 200 }, { x: 310, y: 200 }];
  const DS = [{ x: 436, y: 100 }, { x: 530, y: 100 }, { x: 436, y: 160 }, { x: 530, y: 160 }, { x: 436, y: 220 }, { x: 530, y: 220 }, { x: 436, y: 280 }, { x: 530, y: 280 }];
  const HOT = ['hA', 'hB', 'hC', 'hD'];
  const COLD = ['cA', 'cB', 'cC', 'cD'];
  const CACHE_TOKENS = {};
  HOT.forEach((id, i) => { CACHE_TOKENS[id] = { label: 'hot ' + 'ABCD'[i], sub: 'hot row', tone: 'live', w: 92 }; });
  COLD.forEach((id, i) => { CACHE_TOKENS[id] = { label: 'cold ' + 'ABCD'[i], sub: 'on disk', tone: 'info', w: 92 }; });
  const hotInCache = () => Object.fromEntries(HOT.map((id, i) => [id, { ...CS[i] }]));
  const coldOnDisk = () => Object.fromEntries(COLD.map((id, i) => [id, { ...DS[i] }]));
  const coldCached = () => Object.fromEntries(COLD.map((id, i) => [id, { ...CS[i], tone: 'ok', sub: 'cached' }]));
  const hotEvicted = () => Object.fromEntries(HOT.map((id, i) => [id, { ...DS[4 + i], tone: 'warn', sub: 'evicted' }]));
  const PR = { x: 36, y: 120 };
  const SC = { x: 36, y: 240 };
  const cacheScan = {
    id: 'cache-scan', label: 'Scan evicts the cache', desc: 'A scan without BYPASS CACHE fills the row cache and evicts the hot rows point reads depend on (counts illustrative).',
    codeLabel: 'CQL',
    code: { bug: [
      'SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;',
      'SELECT * FROM orders;   -- analytics scan, no BYPASS CACHE',
      '-- the scan fills the row cache and evicts the hot rows',
      '-- scylla_cache_row_misses rises as point reads go to disk',
    ] },
    scene: { w: 640, h: 420, footer: FOOT_CACHE, panels: [
      { id: 'qs', x: 16, y: 58, w: 170, h: 290, title: 'Queries', tone: 'info' },
      { id: 'cache', x: 204, y: 58, w: 200, h: 290, title: 'Row cache', tone: 'info' },
      { id: 'disk', x: 422, y: 58, w: 202, h: 290, title: 'Data files on disk', tone: 'info' },
    ], tokens: {
      ...CACHE_TOKENS,
      pr: { label: 'order 42', sub: 'point read', tone: 'cursor', w: 130 },
      sc: { label: 'full scan', sub: 'analytics job', tone: 'cursor', w: 130 },
    } },
    bug: [
      { log: 'Point reads for hot orders are served from the row cache. Four hot rows sit in the cache slots (illustrative).', callout: 'Hot rows live in the cache', code: 0,
        at: { pr: { ...PR }, ...hotInCache(), ...coldOnDisk() }, stats: [{ l: 'hot rows cached', v: '4', cls: 'ok' }, { l: 'cache hits', v: 'high', cls: 'ok' }] },
      { log: 'An analytics scan starts. It reads cold rows from disk, and by default each row it reads is placed in the cache.', callout: 'A scan reads cold rows, then caches them', code: 1,
        at: { pr: { ...PR }, sc: { ...SC }, ...hotInCache(), ...coldOnDisk() }, arrows: [['sc', 'cA', 'reads']], stats: [{ l: 'hot rows cached', v: '4', cls: 'ok' }, { l: 'cache hits', v: 'high', cls: 'ok' }] },
      { log: 'Each cold row takes a cache slot. The four slots fill with scan rows, and the hot rows are pushed back to disk (illustrative).', callout: 'The scan evicts every hot row', moment: true, code: 2,
        at: { pr: { ...PR }, sc: { ...SC }, ...coldCached(), ...hotEvicted() }, stats: [{ l: 'hot rows cached', v: '0', cls: 'bad' }, { l: 'cold rows cached', v: '4', cls: 'warn' }] },
      { log: 'The next point read for order 42 misses the cache. It has to go to disk, which costs far more than a cache hit.', callout: 'Point read misses the cache', code: 3,
        at: { pr: { ...PR, tone: 'bad', sub: 'miss' }, sc: { ...SC }, ...coldCached(), ...hotEvicted() }, arrows: [['pr', 'hA', 'disk read']],
        stats: [{ l: 'row cache misses', v: 'rising', cls: 'bad' }, { l: 'hot rows cached', v: '0', cls: 'bad' }] },
      { log: 'Point reads for hot orders now wait on disk, so their p99 rises while the scan runs (illustrative).', callout: 'Hot point reads now wait on disk', code: 3,
        at: { pr: { ...PR, tone: 'bad', sub: 'miss' }, sc: { ...SC }, ...coldCached(), ...hotEvicted() }, stats: [{ l: 'p99 read', v: 'up (illustrative)', cls: 'bad' }, { l: 'row cache misses', v: 'rising', cls: 'bad' }] },
      { log: 'The scan finishes, but the hot rows are still on disk. The cache refills only as point reads miss and load them again.', callout: 'The cache refills one miss at a time', code: 3,
        at: { pr: { ...PR, tone: 'bad', sub: 'miss' }, ...coldCached(), ...hotEvicted() }, stats: [{ l: 'hot rows cached', v: '0', cls: 'bad' }],
        takeaway: 'A scan fills the row cache by default and evicts hot rows. BYPASS CACHE keeps point reads fast while the scan runs.' },
    ],
  };

  const EXPLAIN = `
<h3>1. A read touches only the files that might hold the key</h3>
<p>A table’s data is spread over several immutable SSTable files: one per memtable flush, plus the merged output of compaction. A point read must find the cells of one partition across all of them. Opening every file would make the cost grow with the number of files, so the read path uses cheap checks to skip most of them. Only the files that cannot be ruled out are opened and merged.</p>

<h3>2. Bloom filters answer before any disk read</h3>
<p>Each SSTable has a Bloom filter held in memory. It answers either “definitely absent” or “maybe present”. An “absent” answer is never wrong, so that file is skipped. A “maybe” can be a false positive, and that file is then opened for nothing. The false-positive target is set per table with <code>bloom_filter_fp_chance</code>, whose default is 0.01. A filter needs about 1.44 · log₂(1/p) bits per key: roughly 9.6 bits per key at 0.01 and 14.4 bits at 0.001 (illustrative arithmetic).</p>
<p>The read then follows the path in the diagram. A “maybe” file is opened through its partition index and summary, which jump close to the partition’s position in the data file. The replica reads the matching cells, merges them with the memtable, and keeps the newest version of each cell by timestamp.</p>
<figure class="mm" aria-label="Sequence diagram: the coordinator sends a point read, the replica checks Bloom filters, opens only the maybe files and merges by timestamp" style="--diagram-width:620.00px">
  <img src="diagrams/ch04-read-path.svg" alt="Sequence diagram: the coordinator sends a point read to the replica. The replica checks the Bloom filter of each SSTable and gets seven maybe answers and five absent answers. It opens only the maybe files through the partition index, merges the cells by timestamp so the newest wins, and returns one row to the coordinator.">
  <figcaption>Sequence (Mermaid source: diagrams/ch04-read-path.mmd). Counts are illustrative.</figcaption>
</figure>
<p>The same per-file decision, as a flowchart:</p>
<figure class="mm" aria-label="Flowchart: for each SSTable, skip it when the filter says absent, otherwise open it and merge the cells" style="--diagram-width:605.14px">
  <img src="diagrams/ch04-bloom-read.svg" alt="Flowchart: for each SSTable, skip it when the filter says absent, otherwise open it and merge the cells">
  <figcaption>Flowchart: the same decision for every file. A false positive costs an open and returns nothing.</figcaption>
</figure>

<h3>3. The row cache can answer first, and scans can wash it out</h3>
<p>Before any file is read, the replica checks the memtable, which holds the newest writes in memory. The row cache keeps recently read rows in memory too, so a cache hit avoids the disk read entirely. The cache is only as good as its contents. By default a read places the rows it touches into the cache, so a large scan of cold rows can push out the hot rows that point reads depend on. Watch <code>scylla_cache_row_hits</code> and <code>scylla_cache_row_misses</code> to see whether this is happening.</p>
<p><code>BYPASS CACHE</code> tells one query not to use or fill the cache. An analytics scan that runs with it leaves the hot rows where they are. The scan itself can become slower, because nothing it reads is kept for a later query.</p>

<h3>4. ALLOW FILTERING reads every partition</h3>
<p>A filter on a column that is not in the primary key cannot jump to one partition. <code>ALLOW FILTERING</code> tells the cluster to read candidate rows from every partition and drop the ones that do not match. The cost grows with table size, not with the number of rows returned. A trace makes the waste visible: compare rows scanned with rows returned. When the query runs often, model a table whose partition key matches it, so the read touches one partition.</p>

<h3>5. The trade-off</h3>
<p>A lower false-positive target saves wasted opens, but every key in the table pays for the extra bits in memory. A Bloom filter can never skip a file that really holds the key, so it cannot make a read that must touch many files cheap. Read the SSTables opened per read and the filter memory together, and change one only when the other is not the real cost.</p>

<h3>6. The syntax, in one place</h3>
<pre>-- per-table false-positive target (default 0.01)
ALTER TABLE ks_orders.orders WITH bloom_filter_fp_chance = 0.001;

-- a scan that must not fill the row cache
SELECT * FROM ks_orders.orders BYPASS CACHE;

-- filtering on a non-key column reads candidate rows from every partition
SELECT * FROM orders WHERE status = 'open' ALLOW FILTERING;

-- a table keyed for the query reads one partition
CREATE TABLE orders_by_status (
  status text, day date, order_id uuid, ...
  PRIMARY KEY ((status, day), order_id)
);
SELECT * FROM orders_by_status WHERE status = ? AND day = ?;

-- trace one query, then compare rows scanned with rows returned
cqlsh&gt; TRACING ON;

-- per-table statistics, including the Bloom filter memory
nodetool tablestats ks_orders.orders</pre>
<p>Measure before you tune. The filter target, the cache and the table key each fix a different cost, so read the trace and the counters first.</p>`;

  window.CHAPTER_OVERRIDES[4] = {
    explain: EXPLAIN,
    scenarios: [bloomProbes, fullScan, cacheScan],
  };
})();
