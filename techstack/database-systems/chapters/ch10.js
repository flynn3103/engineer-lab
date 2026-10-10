/* Chapter 11 "Sorting and Aggregation" (index 10, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L11 Sorting and Aggregation Algorithms (external merge sort, top-N heap, hash and sort aggregation).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: external merge sort passes, a top-N heap against a full sort buffer, and hash aggregation that partitions to disk. Counts and sizes illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. External merge sort: runs of B pages, then B-1 way merges ---- */
  const UNS = [9, 4, 11, 2, 7, 12, 1, 10, 5, 8, 3, 6];
  const P0 = [[2, 4, 9], [1, 7, 12], [5, 8, 10], [3, 6, 11]];
  const P1 = [[1, 2, 4, 7, 9, 12], [3, 5, 6, 8, 10, 11]];
  const P2 = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];
  const RUNT = ['t0', 't1', 't2', 't3'];
  const RY = [96, 158, 220, 282], BX = 40, BWD = 44;
  const sorter = {
    id: 'external-sort', label: 'External merge sort', desc: 'Twelve pages and a buffer of three. Pass 0 sorts runs of three pages, then each merge pass joins two runs into one (page counts illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'ORDER BY customer_id   -- 12 pages of input, only 3 buffer pages',
      'pass 0: read 3 pages, sort them in memory, write one sorted run',
      'pass 1: merge 2 runs at a time (B - 1 = 2 inputs, 1 output buffer)',
      'pass 2: merge the last 2 runs into one sorted file',
      'passes = 1 + ceil(log2(12 / 3)) = 3, I/O = 2 x 12 x 3 = 72 pages',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 1 number per page, buffer of 3 pages, 2-way merge. Illustrative.',
      header: s => ({ left: 'passes done ' + (s.lvl || 0) + ' of 3', right: 'page I/O so far ' + (s.io || 0) }),
      draw(P, s) {
        const lvl = s.lvl || 0;
        const rows = [UNS.map(v => [v, 'info']), P0, P1, P2];
        const names = ['input: unsorted pages', 'pass 0: 4 sorted runs of 3 pages', 'pass 1: 2 runs of 6 pages', 'pass 2: 1 run of 12 pages'];
        const io = ['', 'read 12 + write 12 = 24 I/O', 'read 12 + write 12 = 24 I/O', 'read 12 + write 12 = 24 I/O'];
        for (let r = 0; r <= lvl; r++) {
          P.text('rt' + r, { x: BX, y: RY[r] - 6, t: names[r] + (r ? '   ' + io[r] : ''), cls: 'mut xs' });
          if (r === 0) UNS.forEach((v, i) => P.box('u' + i, { x: BX + i * BWD, y: RY[0], w: BWD - 4, h: 30, tone: lvl === 0 ? 'info' : 'mut', label: String(v), cls: 'sm', op: lvl === 0 ? 1 : 0.5 }));
          else {
            let k = 0;
            rows[r].forEach((run, ri) => {
              run.forEach(v => { P.box('p' + r + '_' + v, { x: BX + k * BWD + ri * 10, y: RY[r], w: BWD - 4, h: 30, tone: r === 1 ? RUNT[ri] : (r === 2 ? RUNT[ri * 2] : 'ok'), label: String(v), cls: 'sm' }); k++; });
            });
          }
        }
        if (s.buf) P.chip('buf', { x: 460, y: 330, w: 150, h: 12, label: s.buf, tone: 'cursor', small: true });
      }
    }),
    bug: [
      { log: 'Twelve pages of unsorted customer ids on disk. Memory holds only three pages at a time, so the whole input cannot be sorted in RAM.', callout: '12 pages, room for 3 in memory', code: 0,
        state: { lvl: 0 }, stats: [{ l: 'input pages', v: '12' }, { l: 'buffer pages', v: '3', cls: 'warn' }] },
      { log: 'Pass 0 starts with the first three pages, 9, 4 and 11. They fit in the buffer, so they can be sorted in memory and written out as one run.', callout: 'Read three pages, sort them in memory', code: 1,
        state: { lvl: 0, io: 3, buf: 'sorting 9, 4, 11' }, stats: [{ l: 'pages in memory', v: '3', cls: 'warn' }, { l: 'page I/O', v: '3' }] },
      { log: 'Pass 0 reads three pages at a time, sorts them in memory and writes each as a sorted run. Four runs of three pages result.', callout: 'Pass 0: four sorted runs', code: 1,
        state: { lvl: 1, io: 24, buf: '3-page buffer' }, stats: [{ l: 'runs', v: '4' }, { l: 'page I/O', v: '24' }] },
      { log: 'Pass 1 merges two runs at a time. With 3 buffers, two hold one page each of the input runs, and the third holds the output.', callout: 'Pass 1: merge pairs of runs', code: 2,
        state: { lvl: 2, io: 48, buf: '2 in + 1 out' }, stats: [{ l: 'runs', v: '2' }, { l: 'page I/O', v: '48' }] },
      { log: 'Pass 2 merges the last two runs. The output is one sorted file of 12 pages. Each pass read and wrote every page once.', callout: 'Pass 2: one sorted run', moment: true, code: 3,
        state: { lvl: 3, io: 72, buf: '2 in + 1 out' }, stats: [{ l: 'passes', v: '3' }, { l: 'page I/O', v: '72', cls: 'warn' }] },
      { log: 'Each pass costs 2N page I/Os, so the total is 2N times the passes. More buffer pages mean longer runs and wider merges, which cut the passes.', callout: 'Cost = 2N per pass; more memory, fewer passes', code: 4,
        state: { lvl: 3, io: 72 }, stats: [{ l: 'with 6 buffer pages', v: '2 passes', cls: 'ok' }, { l: 'page I/O', v: '48', cls: 'ok' }],
        takeaway: 'A sort larger than memory costs 2N I/O per pass. Memory for sorting decides the number of passes.' },
    ],
  };

  /* ---- 3. Pipeline breaker: a sort must see every row before it emits one, so its buffer fills like a tank ---- */
  const TX = 250, TY = 96, TW = 150, TH = 190;
  const tank = {
    id: 'sort-buffer', label: 'Top-N vs full sort', desc: 'ORDER BY total LIMIT 100 over 10 million rows. A full sort must buffer every row. A top-N heap keeps only the best 100 (sizes illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT customer_name, total FROM orders ORDER BY total DESC LIMIT 100;',
      'Sort needs all 10,000,000 rows before it can emit the first one',
      'Limit sits above Sort, so it cannot stop the scan early',
      'the sort buffer holds every row: 60 MB here, spilling to disk beyond memory',
      'Top-N heapsort: keep the 100 best rows seen so far, discard the rest',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one sort buffer, 10 million rows at 6 bytes each. Illustrative.',
      header: s => ({ left: 'buffer ' + (s.mb || '0 MB'), right: s.right || 'Sort' }),
      draw(P, s) {
        P.chip('in', { x: 30, y: 150, w: 150, h: 54, label: 'Scan', sub: s.read || 'not started', tone: s.reading ? 'cursor' : 'info' });
        P.line('l1', 180, 177, TX, 177, { tone: s.reading ? 'cursor' : 'mut', arrow: true, label: s.reading ? 'rows stream in' : '' });
        P.text('ht', { x: TX, y: 86, t: s.heap ? 'Top-N heap' : 'Sort buffer', cls: 'mut sm' });
        P.box('tank', { x: TX, y: TY, w: TW, h: TH, tone: 'mut', label: '', sw: 2 });
        const f = s.fill == null ? 0 : s.fill;
        if (f > 0) P.box('fill', { x: TX + 4, y: TY + TH - 4 - f * (TH - 8), w: TW - 8, h: Math.max(4, f * (TH - 8)), tone: s.heap ? 'ok' : (f > 0.9 ? 'bad' : 'warn'), label: s.fillLabel || '', cls: 'sm' });
        P.line('l2', TX + TW, 177, 460, 177, { tone: s.emit ? 'ok' : 'mut', arrow: true, label: s.emit ? 'rows out' : 'blocked', dy: -6 });
        P.chip('out', { x: 460, y: 150, w: 150, h: 54, label: 'Limit 100', sub: s.outSub || 'waiting', tone: s.emit ? 'ok' : 'info' });
      }
    }),
    bug: [
      { log: 'The query sorts all orders by total and keeps the top 100. Sort sits between the scan and Limit.', callout: 'Sort sits between Scan and Limit', code: 0,
        state: { outSub: 'waiting' }, stats: [{ l: 'rows to sort', v: '10,000,000' }] },
      { log: 'Rows start flowing in. Sort cannot emit anything yet, because the largest total may be the very last row.', callout: 'Sort cannot emit until it has seen all rows', code: 1,
        state: { reading: 1, fill: 0.25, read: '2.5M rows read', mb: '15 MB', fillLabel: '15 MB' }, stats: [{ l: 'rows emitted', v: '0', cls: 'warn' }, { l: 'buffer', v: '15 MB', cls: 'warn' }] },
      { log: 'The buffer keeps growing. Memory use follows the size of the input, not the size of the answer.', callout: 'Memory follows the input, not the answer', code: 3,
        state: { reading: 1, fill: 0.7, read: '7M rows read', mb: '42 MB', fillLabel: '42 MB' }, stats: [{ l: 'buffer', v: '42 MB', cls: 'warn' }] },
      { log: 'All 10,000,000 rows are buffered at about 6 bytes each, 60 MB. Only now can Sort start to emit.', callout: 'The tank is full: 60 MB for 100 rows of answer', moment: true, code: 3,
        state: { reading: 1, fill: 1, read: '10M rows read', mb: '60 MB', fillLabel: '60 MB', right: 'input finished' }, stats: [{ l: 'buffer', v: '60 MB', cls: 'bad' }, { l: 'rows returned', v: '100' }] },
      { log: 'Sort emits its rows in order and Limit takes the first 100, discarding the rest. The scan could not be stopped, because Sort is a pipeline breaker.', callout: 'Limit cannot stop the scan below a breaker', code: 2,
        state: { fill: 1, mb: '60 MB', fillLabel: '60 MB', emit: 1, outSub: '100 rows taken', read: '10M rows read' }, stats: [{ l: 'rows read', v: '10,000,000', cls: 'bad' }, { l: 'rows returned', v: '100' }] },
      { log: 'The fix is a top-N heap. It keeps only the 100 best rows seen so far, and each new row either replaces the worst or is dropped.', callout: 'Top-N heap: keep only the best 100', code: 4,
        state: { heap: 1, reading: 1, fill: 0.08, fillLabel: '100 rows', read: '6M rows read', mb: '< 1 KB', right: 'Top-N heapsort' }, stats: [{ l: 'buffer', v: '~100 rows', cls: 'ok' }] },
      { log: 'When the scan ends, the heap already holds the answer. Memory never grew with the table, and no spill to disk is possible.', callout: 'Memory is bounded by the limit, not the table', code: 4,
        state: { heap: 1, fill: 0.08, fillLabel: '100 rows', mb: '< 1 KB', emit: 1, outSub: '100 rows out', read: '10M rows read', right: 'Top-N heapsort' }, stats: [{ l: 'buffer', v: '< 1 KB', cls: 'ok' }, { l: 'was', v: '60 MB', cls: 'warn' }],
        takeaway: 'A sort buffers its whole input. With a LIMIT, a top-N heap or an index that gives the order avoids the breaker.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L11 Sorting and Aggregation Algorithms (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/11-sorting.pdf' };

  /* ---- 3. Hash aggregation: a running value per group, and partition then rehash when the groups do not fit ---- */
  const AROWS = [['VN', 10], ['SG', 5], ['VN', 20], ['TH', 7], ['SG', 15], ['VN', 30], ['TH', 3], ['ID', 8]];
  const AP = { VN: 0, ID: 0, SG: 1, TH: 1 };
  const inPos = i => ({ x: 30, y: 96 + i * 30 });
  const partPos = (p, j) => ({ x: 450, y: p ? 236 + j * 30 : 100 + j * 30 });
  const hagg = {
    id: 'hash-aggregate', label: 'Hash aggregation', desc: 'AVG(price) GROUP BY country. Each group keeps a running (sum, count) in a hash table. When the table cannot hold every group, rows are partitioned to disk by one hash and each partition is aggregated with another (memory limit of 3 groups, illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'SELECT country, AVG(price) FROM orders GROUP BY country;',
      'hash table: country -> (sum, count); each row updates its group',
      '4 groups but memory for 3: the ID row finds no room',
      'phase 1: partition by h1(country) into 2 disk partitions; equal keys meet',
      'phase 2: rehash partition 0 with h2 in memory, aggregate',
      'phase 2: rehash partition 1, aggregate; output is not sorted',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 rows, 4 groups, room for 3 groups in memory. Illustrative.',
      header: s => ({ left: s.hl || 'rows → hash table', right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 82, t: 'input rows', cls: 'mut sm' });
        P.text('h2', { x: 190, y: 82, t: 'hash table in memory (3 groups)', cls: 'mut sm' });
        P.text('h3', { x: 450, y: 82, t: 'disk partitions', cls: 'mut sm' });
        const cnt = [0, 0];
        AROWS.forEach(([k, v], i) => {
          const loc = (s.loc || [])[i] || 'in';
          let pos = inPos(i), tone = 'info';
          if (loc === 'gone') return;
          if (loc === 'mem') tone = 'mut';
          if (loc === 'p') { const p = AP[k]; pos = partPos(p, cnt[p]++); tone = p ? 't1' : 't0'; }
          if (s.blocked === i) tone = 'bad';
          P.chip('r' + i, { x: pos.x, y: pos.y, w: 84, h: 26, label: k + ' ' + v, sub: '', tone, small: true });
        });
        P.box('tbl', { x: 190, y: 92, w: 220, h: 170, tone: 'mut', label: '', dash: true });
        (s.table || []).forEach(([k, sum, n], i) => P.chip('g' + k, { x: 200, y: 100 + i * 54, w: 200, h: 46, label: k + ' · sum ' + sum + ' · n ' + n, sub: s.avg ? 'AVG ' + (sum / n) : 'running value', tone: s.avg ? 'ok' : 'cursor' }));
        if (s.part) { P.text('p0', { x: 450, y: 94, t: '', cls: 'xs' }); }
        if (s.out) s.out.forEach(([k, a], i) => P.chip('o' + k, { x: 190 + i * 110, y: 290, w: 100, h: 34, label: k + ' ' + a, sub: '', tone: 'ok', small: true }));
        if (s.out) P.text('ho', { x: 190, y: 282, t: 'result so far (unsorted)', cls: 'mut xs' });
      }
    }),
    bug: [
      { log: 'Eight rows arrive and the query wants the average price per country. The engine builds a hash table that maps a country to a running value, here (sum, count).', callout: 'A hash table of running values', code: 1,
        state: {}, stats: [{ l: 'rows', v: '8' }, { l: 'groups', v: '4' }] },
      { log: 'The first four rows update three groups: VN (sum 30, n 2), SG (5, 1) and TH (7, 1). Each row finds its group by hash and updates it in place. No sorting is needed.', callout: 'Each row updates its group in place', code: 1,
        state: { loc: ['mem', 'mem', 'mem', 'mem'], table: [['VN', 30, 2], ['SG', 5, 1], ['TH', 7, 1]] }, stats: [{ l: 'groups in memory', v: '3 of 3', cls: 'warn' }] },
      { log: 'The remaining rows would add a fourth group, ID, but memory holds only three. The row has nowhere to go, and a hash table that cannot grow must spill.', callout: 'A fourth group does not fit', moment: true, code: 2,
        state: { loc: ['mem', 'mem', 'mem', 'mem'], table: [['VN', 30, 2], ['SG', 5, 1], ['TH', 7, 1]], blocked: 7, hl: 'no room for group ID' }, stats: [{ l: 'groups', v: '4 > 3', cls: 'bad' }] },
      { log: 'Phase 1 partitions every row to disk by hash h1 of the group key. All rows of a group land in the same partition, so no group is split. VN and ID go to partition 0, SG and TH to partition 1.', callout: 'Partition by h1: equal keys stay together', code: 3,
        state: { loc: ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], hl: 'phase 1: partition on disk' }, stats: [{ l: 'partitions', v: '2' }] },
      { log: 'Phase 2 reads partition 0 into memory and builds a hash table with a second hash h2. It now holds two groups, VN and ID, so it fits, and the averages come out: VN 20, ID 8.', callout: 'Rehash partition 0: VN 20, ID 8', code: 4,
        state: { loc: ['gone', 'p', 'gone', 'p', 'p', 'gone', 'p', 'gone'], table: [['VN', 60, 3], ['ID', 8, 1]], avg: 1, out: [['VN', 20], ['ID', 8]], hl: 'phase 2: partition 0' }, stats: [{ l: 'groups done', v: '2' }] },
      { log: 'Partition 1 is rehashed the same way: SG 10 and TH 5. All four groups are done. The output comes in hash order, not sorted.', callout: 'Rehash partition 1: SG 10, TH 5', moment: true, code: 5,
        state: { loc: ['gone', 'gone', 'gone', 'gone', 'gone', 'gone', 'gone', 'gone'], table: [['SG', 20, 2], ['TH', 10, 2]], avg: 1, out: [['VN', 20], ['ID', 8], ['SG', 10], ['TH', 5]], hl: 'phase 2: partition 1' }, stats: [{ l: 'groups done', v: '4', cls: 'ok' }, { l: 'disk passes', v: '1 write, 1 read' }],
        takeaway: 'Hash aggregation does one pass when the groups fit, and one extra write and read per row when they do not. Output order is not guaranteed.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why a database sorts</h3>
<p>Relations are unordered, but queries ask for order: <code>ORDER BY</code>, <code>GROUP BY</code>, <code>DISTINCT</code>, and a sort-merge join all use sorting. The data may be larger than memory, so the DBMS cannot just call a library <code>sort</code>. If the data fits, an in-memory sort such as quicksort works. If a query wants only the first N rows, a <b>top-N heap sort</b> is much cheaper: keep a priority queue of the best N rows seen so far, discard any row that loses to the worst of them, and the whole sort never needs more than N rows of memory.</p>

<h3>2. External merge sort</h3>
<p>When data is larger than memory, the standard answer is <b>external merge sort</b>, a divide-and-conquer sort in two phases. <b>Sort</b>: read B pages (the buffer size) at a time, sort them in memory and write the result as a <b>run</b>. <b>Merge</b>: combine up to B-1 runs into one longer run, using one buffer page per input run and one for the output, and repeat until one run is left. With N pages and B buffer pages the algorithm makes 1 + ⌈log<sub>B-1</sub>⌈N/B⌉⌉ passes, and each pass reads and writes every page, so the I/O is 2N times the number of passes.</p>
<figure class="mm" aria-label="Flowchart of external merge sort: sort runs, then repeatedly merge up to B-1 runs" style="--diagram-width:360px">
  <img src="diagrams/ch10-merge-passes.svg" alt="Flowchart: N pages on disk. Pass 0 reads B pages, sorts them in memory and writes a run, giving N over B sorted runs. While more than one run remains, a merge pass combines up to B minus 1 runs into one longer run. When one run is left it is the sorted output.">
  <figcaption>Flowchart: one sort pass, then merge passes until a single run remains.</figcaption>
</figure>
<p>Optimizations from the lecture. <b>Double buffering</b> prefetches the next run into a second buffer while the CPU works on the current one, at the cost of half the buffers. <b>Code specialization</b> compiles the comparator for the key type instead of calling a function pointer, and <b>suffix truncation</b> style prefixes compare the first bytes of long strings first. A run can be <b>early materialized</b> (whole tuples) or <b>late materialized</b> (key and record ID only, with the rows fetched after). And if a clustered B+ tree index already holds the rows in order, scanning it is always better than sorting. An unclustered index is almost always worse, because each row is a random read, except when N is small.</p>

<h3>3. Aggregation: sort or hash</h3>
<p>An aggregation turns many rows into one value per group. <b>Sorting</b> first and then scanning is correct and gives sorted output, and it is the choice when the input is already sorted, say after an <code>ORDER BY</code>. Put filters before the sort, so fewer rows are sorted. <b>Hashing</b> is usually cheaper: build a table from group key to running value as rows stream by. The running value depends on the function: sum and count for <code>AVG</code>. When the groups do not fit in memory, the DBMS uses divide and conquer. Phase 1 <b>partitions</b> the rows to disk with hash h1, so all rows of a group land in one partition. Phase 2 <b>rehashes</b> each partition in memory with a different hash h2 and aggregates it, which works if each partition fits.</p>
<figure class="mm" aria-label="Decision flowchart for choosing between streaming, in-memory hash and partitioned hash aggregation" style="--diagram-width:471px">
  <img src="diagrams/ch10-agg-choice.svg" alt="Flowchart: for a GROUP BY, if the input is already sorted on the group key use a streaming aggregate, one pass with no memory. Otherwise, if all groups fit in memory use one in-memory hash table from key to running value. If not, partition rows to disk with hash h1 in phase 1, then in phase 2 build a hash table per partition with hash h2 and aggregate.">
  <figcaption>Flowchart: which aggregation algorithm the engine uses.</figcaption>
</figure>

<h3>4. The trade-off</h3>
<p>Sorting costs a few passes over the data and gives ordered output that later operators can reuse. Hashing costs nothing extra when the groups fit and one more write and read of the data when they do not, and gives no order. A top-N heap is almost free for small N and useless when N is a large share of the table. All of them are limited by memory, which a DBMS sets per operator (PostgreSQL <code>work_mem</code>), so a bigger limit helps one query and multiplies across concurrent ones.</p>

<h3>5. Syntax</h3>
<pre>-- how the sort ran: in memory, or spilled to disk
EXPLAIN (ANALYZE) SELECT * FROM orders ORDER BY created_at;
--   Sort Method: external merge  Disk: 2412040kB      (spilled)
--   Sort Method: quicksort  Memory: 25kB              (fit in work_mem)

-- top-N: a heap, not a full sort
EXPLAIN (ANALYZE) SELECT * FROM orders ORDER BY created_at DESC LIMIT 100;
--   Sort Method: top-N heapsort  Memory: 40kB

-- an index in sort order avoids the sort entirely
CREATE INDEX orders_created ON orders (created_at DESC);

-- hash aggregate spilling: Batches above 1 mean partitions on disk
--   HashAggregate  Batches: 17  Memory Usage: 4145kB  Disk Usage: 3264000kB
SET work_mem = '256MB';</pre>
<p>Read <code>Sort Method</code> and <code>Batches</code> first. They say whether the operator stayed in memory.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A nightly report runs <code>SELECT country, AVG(price) FROM orders GROUP BY country ORDER BY 2 DESC</code> over 2 billion rows, and a dashboard runs <code>ORDER BY created_at DESC LIMIT 100</code> on the same table (illustrative). The report fills temporary disk with hundreds of GB, and the dashboard query takes two minutes to return 100 rows, with the plan showing a sort of the whole table.`,
    predict: {
      q: `A table has N = 1,000 pages and the sort has B = 11 buffer pages. Counting the first sort pass, how many passes does an external merge sort make?`,
      opts: [
        `3: one sort pass makes 91 runs, then two merge passes of up to 10 runs each`,
        `2: one sort pass and one merge of all 91 runs`,
        `10: one pass per buffer page of fan-in`,
        `91: one pass per run`
      ],
      ans: 0,
      why: `Pass 0 sorts 11 pages at a time and writes ⌈1000/11⌉ = 91 runs. Each merge pass combines up to B-1 = 10 runs, so 91 runs become 10, then 1. That is 1 + ⌈log10 91⌉ = 3 passes, and the I/O is 2 × 1000 × 3 pages.`
    },
    diagnose: [
      {
        t: 'Full sort for a top-N query',
        sym: '<b>ORDER BY ... LIMIT 100</b> takes minutes, and the plan sorts the whole table before returning 100 rows.',
        ctx: 'The query asks for the newest 100 orders on a table with no index on created_at. The engine must see every row to know which are the newest.',
        why: 'Without an index in the sort order the engine has to read every row. A top-N heap keeps only 100 rows, but the scan still reads the table. A full sort is worse: it buffers and spills everything.',
        log: `-- representative plan, counts illustrative
Limit  (actual time=121000..121000 rows=100)
  -> Sort  (Sort Method: external merge  Disk: 2412040kB)
       -> Seq Scan on orders  (rows=2000000000)`,
        note: 'A Sort node under a Limit that spills to disk is a full sort. The top-N method names itself in the plan.',
        fix: [
          'Measure first: read the <code>Sort Method</code> in <code>EXPLAIN (ANALYZE)</code>. External merge under a LIMIT is the problem.',
          'Create an index in the sort order, <code>(created_at DESC)</code>, so the engine reads the first 100 index entries and stops.',
          'If you cannot index, filter first, for example the last day, so the sort sees fewer rows.',
          'Verify: the plan should show an index scan with a Limit and no Sort, and the time should be milliseconds.'
        ]
      },
      {
        t: 'Sort spills to temporary files',
        sym: '<b>Temporary disk</b> fills during a big ORDER BY or a sort-merge join, and the query is slow.',
        ctx: 'The sort has a small memory budget per operator. The data is far larger than the budget, so it goes through many merge passes.',
        why: 'Each merge pass reads and writes every page. A larger fan-in needs more buffer pages, so a small budget means more passes, and the I/O is 2 × N × passes.',
        log: `-- representative plan, counts illustrative
Sort Method: external merge  Disk: 18340000kB
-- work_mem = 4MB, rows = 380,000,000, width = 62`,
        note: 'A small <code>work_mem</code> next to a large spill shows a budget problem, not a data problem.',
        fix: [
          'Measure first: note the disk size of the sort and the memory setting in the plan.',
          'Sort fewer bytes: select only the columns you need, and filter before the sort.',
          'Raise <code>work_mem</code> for this session only. It applies per operator per query, so a global increase multiplies by concurrent queries.',
          'Use an index that provides the order, or presort the data on write.',
          'Verify: the sort method should become quicksort or a single merge, and the temp disk use should fall.'
        ]
      },
      {
        t: 'Hash aggregate spills',
        sym: '<b>A GROUP BY</b> reports many batches and a large disk usage.',
        ctx: 'The table of groups is larger than the memory budget, for example grouping by a high-cardinality key such as user id.',
        why: 'The hash table keeps one entry per group. When the entries do not fit, rows are partitioned to disk and aggregated partition by partition, which adds one extra write and read of the data.',
        log: `-- representative plan, counts illustrative
HashAggregate  (Group Key: user_id)
  Batches: 17  Memory Usage: 4145kB  Disk Usage: 3264000kB`,
        note: '<code>Batches</code> above 1 is the partition-and-rehash path. A bad estimate of the group count is a common cause.',
        fix: [
          'Measure first: compare the estimated number of groups with the actual number in the plan.',
          'Refresh statistics with <code>ANALYZE</code> if the estimate is far off, so the planner chooses the right strategy.',
          'Reduce the group count: group by a coarser key, or pre-aggregate in a first step.',
          'Raise <code>work_mem</code> for this query if the groups really are numerous.',
          'Verify: Batches should be 1 and Disk Usage should be gone.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[10] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [sorter, tank, hagg] };
})();
