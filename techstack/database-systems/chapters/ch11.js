/* Chapter 12 "Join Algorithms" (index 11, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L12 Join Algorithms (nested loop, sort-merge, hash, Grace hash); CMU 15-721 L09 Hash Join Algorithms (partition, build, probe, radix) and L10 Multi-way Joins (worst-case optimal joins).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: block nested loop sweeps, Grace hash partitions, radix partitioning with a histogram, and a triangle query as an intermediate-size chart. Counts illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 2. Block nested loop: the inner table is rescanned once per block of the outer table ---- */
  const nested = {
    id: 'nested-loop', label: 'Nested loop sweeps', desc: 'Table R has 4 blocks and S has 10 pages. A block nested loop scans all of S once per block of R. Hash join reads each table once (pages illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'SELECT ... FROM orders_10m o JOIN events_100m e ON e.order_id = o.id;',
      'block nested loop: load one block of R, then scan ALL of S against it',
      'cost = M + ceil(M / (B - 2)) x N    -- the inner table is read once per outer block',
      'at 10M x 100M rows: 101,100,000 page reads, about 2.3 hours (illustrative)',
      'hash join: build a table on R once, scan S once: M + N reads',
    ] },
    stage: DB.stage({
      footer: 'Simplified: R is 4 blocks, S is 10 pages. Illustrative.',
      header: s => ({ left: 'page reads ' + (s.reads || 0), right: s.mode === 'hash' ? 'hash join' : 'block nested loop' }),
      draw(P, s) {
        P.text('hr', { x: 30, y: 84, t: 'R (outer): 4 blocks', cls: 'mut sm' });
        for (let k = 0; k < 4; k++) P.chip('R' + k, { x: 30, y: 96 + k * 54, w: 108, h: 42, label: 'R block ' + (k + 1), sub: s.blk === k ? 'in memory' : '', tone: s.blk === k ? 'cursor' : (s.blk != null && k < s.blk ? 'mut' : 'info'), hl: s.blk === k });
        P.text('hs', { x: 190, y: 84, t: 'S (inner): 10 pages', cls: 'mut sm' });
        for (let i = 0; i < 10; i++) {
          const scanned = s.sweep != null && i < s.sweep;
          P.box('S' + i, { x: 190 + (i % 5) * 84, y: 96 + Math.floor(i / 5) * 56, w: 76, h: 44, tone: scanned ? (s.mode === 'hash' ? 'ok' : 'warn') : 'info', label: 'S' + (i + 1), cls: 'sm' });
        }
        if (s.mode === 'hash') P.chip('ht', { x: 190, y: 220, w: 200, h: 44, label: 'hash table on R', sub: 'all 4 blocks in memory', tone: 'ok' });
        if (s.pass != null) P.chip('pass', { x: 190, y: 220, w: 200, h: 44, label: 'pass ' + s.pass + ' of 4 over S', sub: 'S read again from page 1', tone: 'warn' });
        if (s.formula) P.chip('fm', { x: 190, y: 284, w: 420, h: 40, label: s.formula, tone: s.fTone || 'bad' });
      }
    }),
    bug: [
      { log: 'R is the outer table with 4 blocks, S is the inner table with 10 pages. Memory holds one block of R plus room to read S.', callout: 'R: 4 blocks. S: 10 pages.', code: 1,
        state: {}, stats: [{ l: 'M (pages of R)', v: '4' }, { l: 'N (pages of S)', v: '10' }] },
      { log: 'The join loads the first block of R into memory. This costs one block read.', callout: 'Load block 1 of R', code: 1,
        state: { blk: 0, reads: 1, mode: 'nl' }, stats: [{ l: 'page reads', v: '1' }] },
      { log: 'Now the whole of S is scanned against that block, page by page. Ten page reads, just for one block of R.', callout: 'Scan all of S for block 1', code: 1,
        state: { blk: 0, sweep: 10, pass: 1, reads: 11, mode: 'nl' }, stats: [{ l: 'page reads', v: '11', cls: 'warn' }] },
      { log: 'Block 2 of R is loaded, and S is scanned from the first page again. The inner table is read once per outer block.', callout: 'Block 2: scan all of S again', code: 2,
        state: { blk: 1, sweep: 10, pass: 2, reads: 22, mode: 'nl' }, stats: [{ l: 'page reads', v: '22', cls: 'warn' }] },
      { log: 'After four blocks, S has been read four times. Reads total 4 + 4 × 10 = 44 pages, against 14 pages if each table were read once.', callout: '44 reads instead of 14', moment: true, code: 2,
        state: { blk: 3, sweep: 10, pass: 4, reads: 44, mode: 'nl', formula: 'M + (M / blocks) x N = 4 + 4 x 10 = 44', fTone: 'bad' }, stats: [{ l: 'page reads', v: '44', cls: 'bad' }, { l: 'ideal', v: '14', cls: 'ok' }] },
      { log: 'Scaled to 10 million and 100 million rows, the same formula gives 101,100,000 page reads, about 2.3 hours (illustrative). Ten times the data costs a hundred times the reads.', callout: 'Cost grows with the product of the sizes', code: 3,
        state: { blk: 3, sweep: 10, pass: 4, reads: 44, mode: 'nl', formula: '101,100,000 page reads, about 2.3 h', fTone: 'bad' }, stats: [{ l: 'at full scale', v: '101,100,000', cls: 'bad' }, { l: 'time', v: '~2.3 h', cls: 'bad' }] },
      { log: 'A hash join builds a hash table on R once, in memory, then scans S once and probes the table for every row. 4 + 10 = 14 reads.', callout: 'Hash join: build once, probe once', code: 4,
        state: { sweep: 10, reads: 14, mode: 'hash', formula: 'hash join: M + N = 4 + 10 = 14 page reads', fTone: 'ok' }, stats: [{ l: 'page reads', v: '14', cls: 'ok' }, { l: 'needs', v: 'equality key', cls: 'warn' }],
        takeaway: 'A nested loop multiplies the sizes. A hash join or sort-merge reads each input about once, if memory and the join key allow.' },
    ],
  };

  /* ---- 3. Grace hash join: hash both inputs into partitions, then join each partition pair in memory ---- */
  const PXX = p => 232 + p * 124, PYR = 100, PYS = 206, PH = 78, PWD = 112;
  const FILL = { even: [0.42, 0.40, 0.44], skew: [0.18, 0.95, 0.2] };
  const grace = {
    id: 'grace-hash', label: 'Grace hash join', desc: 'Neither input fits in memory. Both are hashed into the same three partitions on disk, then each partition pair is joined in memory. A hot key can overfill one partition (fractions illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'Hash Join  (Hash Cond: e.order_id = o.id)   -- build side does not fit in memory',
      'partition phase: h1(key) mod 3 sends every row of R and S to a partition file',
      'rows with equal keys land in partitions with the same number',
      'build phase: load R_p into a hash table, probe it with S_p',
      'a partition that is still too big is split again with a second hash h2',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 3 partitions, dashed line = what fits in memory. Illustrative.',
      header: s => ({ left: 'spill passes ' + (s.spills || 0), right: s.phase || 'inputs' }),
      draw(P, s) {
        P.chip('Rin', { x: 30, y: PYR + 10, w: 150, h: 54, label: 'R: 10M rows', sub: 'build side', tone: 'info' });
        P.chip('Sin', { x: 30, y: PYS + 10, w: 150, h: 54, label: 'S: 100M rows', sub: 'probe side', tone: 'info' });
        if (s.hash) P.chip('h1', { x: 30, y: 150, w: 150, h: 40, label: s.hash, tone: 'cursor', small: false });
        const f = s.fill || null;
        for (let p = 0; p < 3; p++) {
          [['R', PYR], ['S', PYS]].forEach(([side, y]) => {
            const shown = f && (side === 'R' ? s.rShown : s.sShown);
            const fr = shown ? f[p] : 0;
            const over = fr > 0.6;
            P.box('pb' + side + p, { x: PXX(p), y, w: PWD, h: PH, tone: s.pair === p ? 'cursor' : 'mut', label: '', dash: true, stroke: s.pair === p ? 'cursor' : null });
            if (fr > 0) P.box('pf' + side + p, { x: PXX(p) + 4, y: y + PH - 4 - fr * (PH - 8), w: PWD - 8, h: fr * (PH - 8), tone: over ? 'bad' : 't' + p, label: side + p, cls: 'xs' });
            P.line('ml' + side + p, PXX(p), y + PH - 4 - 0.6 * (PH - 8), PXX(p) + PWD, y + PH - 4 - 0.6 * (PH - 8), { tone: 'mut', dash: true, sw: 1 });
          });
          P.text('pn' + p, { x: PXX(p) + PWD / 2, y: PYS + PH + 16, t: 'partition ' + p, cls: 'mut xs', anchor: 'middle' });
        }
        if (s.join) P.chip('jn', { x: 232, y: 308, w: 356, h: 34, label: s.join, tone: s.joinTone || 'ok', small: true });
      }
    }),
    bug: [
      { log: 'R has 10 million rows and S has 100 million. The build table for R does not fit in memory, so a simple in-memory hash join is not possible.', callout: 'The build side does not fit in memory', code: 0,
        state: { phase: 'inputs' }, stats: [{ l: 'R rows', v: '10M' }, { l: 'S rows', v: '100M' }] },
      { log: 'Partition phase for R: every row is hashed with h1 and appended to one of three partition files on disk.', callout: 'Hash every R row into a partition', code: 1,
        state: { phase: 'partition R', hash: 'h1(key) mod 3', fill: FILL.even, rShown: 1 }, stats: [{ l: 'partitions', v: '3' }, { l: 'R write', v: '1 pass' }] },
      { log: 'Then S is hashed with the same function. Rows with the same key now sit in the same partition number on both sides.', callout: 'Equal keys meet in the same partition', moment: true, code: 2,
        state: { phase: 'partition S', hash: 'h1(key) mod 3', fill: FILL.even, rShown: 1, sShown: 1 }, stats: [{ l: 'partitions', v: '3' }, { l: 'S write', v: '1 pass' }] },
      { log: 'Build phase for partition 0: load R0 into an in-memory hash table, then read S0 and probe the table row by row.', callout: 'Join pair 0 in memory: build R0, probe S0', code: 3,
        state: { phase: 'build and probe', fill: FILL.even, rShown: 1, sShown: 1, pair: 0, join: 'hash table on R0, probe with S0 -> output rows' }, stats: [{ l: 'fits in memory', v: 'yes', cls: 'ok' }] },
      { log: 'Each page was read, written to a partition, and read again. The total is 3 × (M + N) page I/Os when every partition fits.', callout: 'Total cost: 3 × (M + N)', code: 3,
        state: { phase: 'done', fill: FILL.even, rShown: 1, sShown: 1, join: 'cost = 3 x (M + N) page I/Os', joinTone: 'acc' }, stats: [{ l: 'I/O', v: '3 × (M + N)', cls: 'warn' }] },
      { log: 'Now suppose one customer places half of all events. Every row with that key hashes to partition 1, which swells far past what fits in memory.', callout: 'A hot key overfills partition 1', code: 4,
        state: { phase: 'skewed key', fill: FILL.skew, rShown: 1, sShown: 1, pair: 1 }, stats: [{ l: 'partition 1 share', v: '~60%', cls: 'bad' }, { l: 'fits in memory', v: 'no', cls: 'bad' }] },
      { log: 'The partition is split again with a second hash function and written to disk again. Every extra split is another read and write.', callout: 'Split again with h2: another spill', code: 4,
        state: { phase: 'recursive spill', hash: 'h2(key) mod 3', fill: FILL.skew, rShown: 1, sShown: 1, pair: 1, spills: 2, join: 'one key cannot be split: all its rows share a hash', joinTone: 'bad' }, stats: [{ l: 'spill passes', v: '2+', cls: 'bad' }, { l: 'one key', v: 'never splits', cls: 'warn' }],
        takeaway: 'Hashing splits distinct keys evenly, but it cannot split one hot key. Skew is what makes a hash join spill and wait.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A nightly report joins <code>orders_10m</code> (10,000,000 rows) with <code>events_100m</code> (100,000,000 rows) (illustrative). In staging, with 10,000 rows on each side, the same join finished instantly. In production it runs for hours, temporary storage fills again and again, and the report misses its morning deadline.",
    "predict": {
      "q": "The join is fast at 10,000 rows and takes hours at 100,000,000. What makes the cost grow so much faster than the data?",
      "opts": [
        "The plan re-reads the larger table for each chunk of the smaller one, so cost grows with the product of the two sizes",
        "The result has to travel over the network, and that grows with the row count",
        "The database takes a lock per row, and lock waits add up",
        "The disk is slower for big tables, so every page read costs more"
      ],
      "ans": 0,
      "why": "A nested-loop join reads the inner table once per block of the outer table. Ten times more data on each side means about a hundred times more page reads, not ten."
    },
    "diagnose": [
      {
        "t": "Nested loop on two large inputs",
        "sym": "The nested loop reads 101,100,000 pages, about 2.3 h, because the inner table is rescanned for every block of the outer table.",
        "ctx": "A join of a 10M-row and a 100M-row table runs for hours; the plan shows a Nested Loop with 101 outer blocks.",
        "why": "A block nested loop reads the inner table once per block of the outer table. With 1,000 buffers, the outer table is 101 blocks, so the inner table is read that many times.",
        "log": "representative plan summary, counts illustrative\nNested Loop (outer: orders_10m, inner: events_100m)\nbuffers: 1000, outer blocks: 101\npages read: 101,100,000",
        "fix": [
          "Measure first: read the join algorithm and pages read in the plan.",
          "Use a hash join for an equi-join of two large inputs. It reads each input a fixed number of times, not once per block.",
          "If the join key is already sorted on both sides, use a sort-merge join, which reads each input once.",
          "Put the smaller table on the build side, and check that it is the one the optimizer chooses (chapter 9).",
          "Verify: pages read in the plan before and after the change."
        ]
      },
      {
        "t": "Hash or sort spills repeatedly",
        "sym": "The join writes its partitions to disk 5 times, because each partition is still too big for the 10 buffers.",
        "ctx": "Temporary storage fills and drains in waves while the join runs; the engine log shows one spilling line per partitioning level.",
        "why": "A partition that does not fit in memory is split again. With few buffers, each split leaves partitions still too large, so the data is written to disk at every level.",
        "log": "representative engine log, counts illustrative\nhash join: buffers 10, partitions 9\nlevel 1: 11,111 pages per partition, spilling\nlevel 2: 1,235 pages per partition, spilling\nlevel 5: 2 pages per partition, fits in memory",
        "fix": [
          "Measure first: count the spilling levels in the log and the temp I/O pages.",
          "Give the join enough buffers that its first partitions fit in memory. In this case, 1,000 buffers is enough for one level.",
          "Project only the columns the join and the output need, so each row is smaller and the partitions are smaller.",
          "Pre-aggregate or filter before the join, so that fewer rows reach the partitioning step.",
          "Verify: count the levels in the log and temp I/O pages, before and after the change."
        ]
      },
      {
        "t": "Skewed key sends work to one partition",
        "sym": "One worker holds 38.75 percent of the probe work, while the other 7 workers wait.",
        "ctx": "A parallel join shows one worker pegged and seven idle near the end; the join finishes only when the busiest worker does.",
        "why": "Hash partitioning puts all rows with the same key in the same partition. When 30 percent of the rows share one key, that partition gets far more work than the others, and the join finishes only when its busiest worker does.",
        "log": "representative worker summary, counts illustrative\nprobe rows per worker: w1 = 38,750,000, w2..w8 = 8,750,000 each\nmax/avg: 3.1x\njoin wait: 7 workers idle",
        "fix": [
          "Measure first: find the hot keys from statistics, or from a sample, before the join, and read probe rows per worker.",
          "Salt the hot key: add a random suffix on the probe side, and copy the matching build row for each suffix, so the hot rows spread over all workers.",
          "Handle the hot key separately, with a broadcast of its build rows, and hash-join the rest.",
          "Verify: the busiest worker share and the time of the slowest partition, before and after the change."
        ]
      },
      {
        "t": "Binary join order creates a huge intermediate",
        "sym": "A three-way join stores 100,000,000 intermediate rows, to produce 1,000,000 output rows.",
        "ctx": "A triangle query on a 10M-edge graph returns 1,000,000 rows, but the first hash join emits 100,000,000.",
        "why": "A binary plan joins two tables first, and the result can be much larger than both the inputs and the final output. For a triangle query on a graph, the first two-hop join produces every path, and most of them never close.",
        "log": "representative plan summary, counts illustrative\nHash Join (R.b = S.b) rows out: 100,000,000\n  -> Hash Join (S.c = T.c) rows out: 1,000,000\nintermediate rows stored: 100,000,000",
        "fix": [
          "Measure first: compare intermediate rows in the plan with the input and output row counts.",
          "Use a multiway join (worst-case optimal, such as leapfrog trie join), which works one variable at a time, so no pairwise intermediate is stored.",
          "A multiway join is slower when the pairwise intermediates are not larger than the inputs, so the plan choice depends on that size. Join ordering is chapter 9.",
          "For a binary plan, choose the first join that keeps the intermediate small, using the statistics.",
          "Verify: intermediate rows in the plan, before and after the change."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L12 Join Algorithms and CMU 15-721 L09 Hash Joins, L10 Multi-way Joins (notes in output/pdf)', href: '../../output/pdf/cmu-15445-fall2024/notes/12-joins.pdf' };

  /* ---- 3. Radix partitioning: histogram, prefix sum, scatter, so each partition fits in cache ---- */
  const RH = [2, 0, 3, 2, 0, 1, 3, 2];    // radix bits of the hash of each tuple
  const RCNT = [2, 1, 3, 2], ROFF = [0, 2, 3, 6];
  const RTONE = ['t0', 't1', 't2', 't3'];
  const RDEST = (() => { const c = [0, 0, 0, 0]; return RH.map(h => ROFF[h] + c[h]++); })();
  const radix = {
    id: 'radix-partition', label: 'Radix partition', desc: 'Eight tuples are split into four partitions by two bits of the hash. A histogram counts each partition, a prefix sum gives each one its start offset, and a second pass writes every tuple straight to its place, with no latches (hash bits illustrative).',
    codeLabel: 'Steps',
    code: { bug: [
      'bits = hash(key) & 3          -- 4 partitions of a table too big for the CPU cache',
      'pass 1: histogram[bits]++     -- count tuples per partition: 2, 1, 3, 2',
      'prefix sum: offsets = 0, 2, 3, 6',
      'pass 2: out[offset[bits]++] = tuple   -- scatter, each thread owns its slots',
      'join partition i of R with partition i of S: both fit in cache',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 tuples, 2 radix bits. Illustrative.',
      header: s => ({ left: s.hl || 'input in arrival order', right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 40, y: 82, t: 'input tuples (label: radix bits)', cls: 'mut sm' });
        RH.forEach((h, i) => P.chip('t' + i, { x: 40 + i * 72, y: 92, w: 62, h: 36, label: 't' + (i + 1), sub: 'bits ' + h, tone: s.scatter ? 'mut' : (s.hist ? RTONE[h] : 'info'), small: true }));
        if (s.hist) { P.text('h2', { x: 40, y: 160, t: 'histogram: tuples per partition', cls: 'mut sm' });
          RCNT.forEach((c, p) => P.chip('hc' + p, { x: 40 + p * 150, y: 168, w: 130, h: 38, label: 'part ' + p + ': ' + c, sub: s.pre ? 'starts at ' + ROFF[p] : '', tone: RTONE[p] })); }
        if (s.scatter) { P.text('h3', { x: 40, y: 232, t: 'output array: tuples grouped by partition', cls: 'mut sm' });
          for (let i = 0; i < 8; i++) P.box('o' + i, { x: 40 + i * 72, y: 242, w: 62, h: 36, tone: 'mut', label: '', dash: true });
          RH.forEach((h, i) => P.chip('s' + i, { x: 40 + RDEST[i] * 72, y: 242, w: 62, h: 36, label: 't' + (i + 1), sub: '', tone: RTONE[h], small: true })); }
        if (s.fit) P.chip('fit', { x: 40, y: 292, w: 400, h: 32, label: 'each partition now fits in cache: join them one pair at a time', sub: '', tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'Eight tuples of R must be partitioned so that each partition is small enough for the CPU cache. The two radix bits of each hash say which partition a tuple belongs to.', callout: 'Two hash bits pick one of four partitions', code: 0, state: {}, stats: [{ l: 'tuples', v: '8' }, { l: 'partitions', v: '4' }] },
      { log: 'Pass 1 only counts. For each tuple, add one to the counter of its partition. Nothing is moved yet.', callout: 'Pass 1: a histogram of partition sizes', code: 1, state: { hist: 1 }, stats: [{ l: 'sizes', v: '2, 1, 3, 2' }] },
      { log: 'A prefix sum turns the sizes into start offsets: 0, 2, 3, 6. Every partition now owns an exact range of the output array.', callout: 'Prefix sum gives each partition its range', moment: true, code: 2, state: { hist: 1, pre: 1 }, stats: [{ l: 'offsets', v: '0, 2, 3, 6' }] },
      { log: 'Pass 2 scatters the tuples into their ranges. Because every slot is owned in advance, threads write without latches and without a shared lock.', callout: 'Pass 2: scatter into owned slots', code: 3, state: { hist: 1, pre: 1, scatter: 1 }, stats: [{ l: 'latches', v: '0', cls: 'ok' }] },
      { log: 'The same is done for S. Partition i of R only matches partition i of S, and the pair is small enough for the cache, so building and probing hit cache instead of memory.', callout: 'Join one cache-sized pair at a time', code: 4, state: { hist: 1, pre: 1, scatter: 1, fit: 1 }, stats: [{ l: 'cache misses', v: 'fewer', cls: 'ok' }],
        takeaway: 'Partitioning costs two extra passes and pays when random memory access would be slower than the passes.' },
    ],
  };

  /* ---- 4. Multi-way join: a triangle query as a chart of the intermediate result ---- */
  const TRI = [
    { id: 'in', name: 'each input table', v: 1000, tone: 't0' },
    { id: 'bin', name: 'binary join: R⋈S', v: 1000000, tone: 'bad' },
    { id: 'out', name: 'final triangles (at most)', v: 31623, tone: 'ok' },
    { id: 'wc', name: 'multi-way work', v: 31623, tone: 'ok' },
  ];
  const tw = v => Math.log10(v) / 6 * 330;
  const wcoj = {
    id: 'triangle-join', label: 'Multi-way join', desc: 'The triangle query R(a,b) ⋈ S(b,c) ⋈ T(a,c) over three tables of 1,000 rows. Joining two tables first can create a huge intermediate result that the third table then throws away. A multi-way join extends one attribute at a time (bar scale is logarithmic).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT * FROM R, S, T WHERE R.b = S.b AND S.c = T.c AND R.a = T.a;   -- triangles',
      'binary plan: (R join S) join T. If one b has many a and many c, R join S makes them all',
      'R join S can reach 1,000 x 1,000 = 1,000,000 rows from 1,000 + 1,000',
      'T then keeps only the pairs that close a triangle: at most about 31,600',
      'multi-way: pick a, then b, then c, intersecting candidates from all tables each time',
      'work stays near the size of the output, not of the intermediate',
    ] },
    stage: DB.stage({
      footer: 'Illustrative sizes. The 31,623 comes from the N^1.5 bound for triangles.',
      header: s => ({ left: s.hl || 'rows (log scale)', right: '' }),
      draw(P, s) {
        TRI.forEach((t, i) => {
          if (!(s.show || []).includes(t.id)) return;
          P.text('n' + i, { x: 40, y: 124 + i * 52, t: t.name, cls: 'sm' });
          P.box('b' + i, { x: 40, y: 132 + i * 52, w: tw(t.v), h: 24, tone: t.tone, label: '' });
          P.text('v' + i, { x: 40 + tw(t.v) + 8, y: 150 + i * 52, t: t.v.toLocaleString('en-US'), cls: 'sm' });
        });
        if (s.note) P.chip('nt', { x: 40, y: 316, w: 420, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Three tables of 1,000 edges each, and the query asks for triangles: a, b and c where all three pairs are edges.', callout: 'Find triangles in three tables', code: 0, state: { show: ['in'] }, stats: [{ l: 'input rows', v: '3 x 1,000' }] },
      { log: 'A binary plan joins R and S first. If one value of b links to 1,000 values of a and 1,000 values of c, the join makes every pair: 1,000,000 rows from 2,000 inputs.', callout: 'The first binary join explodes', moment: true, code: 2, state: { show: ['in', 'bin'], note: 'intermediate is 1,000 times the input', noteTone: 'bad' }, stats: [{ l: 'intermediate', v: '1,000,000', cls: 'bad' }] },
      { log: 'Only then does T filter these pairs, keeping the ones that close a triangle. The theoretical maximum number of triangles in tables of this size is about 31,600, so almost all of the work was thrown away.', callout: 'T discards almost all of it', code: 3, state: { show: ['in', 'bin', 'out'], note: 'at most 31,623 triangles', noteTone: 'ok' }, stats: [{ l: 'maximum output', v: '31,623', cls: 'ok' }] },
      { log: 'A worst-case optimal multi-way join does not build the pair table. It picks a value of a, then b from the values that R and T both allow, then c from those that S and T both allow, intersecting candidates at each step.', callout: 'Extend one attribute at a time', code: 4, state: { show: ['in', 'bin', 'out', 'wc'] }, stats: [{ l: 'work', v: '~31,623', cls: 'ok' }] },
      { log: 'The work is bounded by the output bound, not by the largest intermediate. For queries with cycles on skewed data this can be orders of magnitude cheaper than any binary join order.', callout: 'Work follows the output, not the intermediate', code: 5, state: { show: ['in', 'bin', 'out', 'wc'], note: '30x less work than the binary plan', noteTone: 'ok' }, stats: [{ l: 'binary / multi-way', v: '~30x', cls: 'ok' }],
        takeaway: 'For cyclic joins such as triangles, the join order cannot fix a binary plan. A multi-way join avoids the intermediate altogether.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why joins, and how we count their cost</h3>
<p>Normalization splits information over tables to avoid repetition, and joins rebuild it. The lecture covers inner equijoins of R (the outer table, M pages, m tuples) and S (the inner table, N pages, n tuples). A join operator concatenates matching tuples, and may copy the <b>data</b> or only the key and a <b>record ID</b>, which is late materialization and suits column stores. The cost metric is disk I/O for reading and for writing intermediate data, ignoring output cost since it is the same for every algorithm. The cross product followed by a filter is the worst algorithm: the product is huge.</p>

<h3>2. Nested loop joins</h3>
<p>Two loops compare every pair. The <b>naive</b> version scans the inner table for every outer tuple: M + m·N I/Os. The <b>block</b> version reads the outer table a block at a time, using B-2 buffers for it, one for the inner scan and one for output, and scans the inner table once per outer block: M + ⌈M/(B-2)⌉·N. The smaller table should be the outer. An <b>index nested loop</b> probes an index on the inner join column once per outer tuple, M + m·C where C is the cost of a probe, which wins when the outer side is small.</p>

<h3>3. Sort-merge join</h3>
<p>Sort both tables on the join key with external merge sort (chapter 11), then walk both with cursors and emit matches. The cost is the two sorts plus M + N for the merge, and it is attractive when an input is already sorted, for instance from a clustered index, or when the result must be sorted anyway. The worst case is a key shared by every row of both tables, where the merge degenerates to M·N.</p>

<h3>4. Hash join</h3>
<p>A hash join builds a hash table on the outer input with hash h1, then probes it with each inner tuple. It only works for equality on the whole key. A <b>Bloom filter</b> built during the build phase lets the probe skip tuples that cannot match, which is <b>sideways information passing</b>. If the build side does not fit in memory, the <b>Grace hash join</b> hashes both inputs into partitions on disk, so matching keys are in the same partition number, and then joins each pair in memory, recursively re-partitioning with h2 if a partition is still too big. The cost is 3(M + N): two passes to partition, one to probe. A <b>hybrid</b> hash join keeps one partition in memory to avoid spilling it, and is hard to implement. In the lecture's example (M=1000, N=500, B=100, 0.1 ms per I/O) the plain nested loop takes 1.4 hours, the block nested loop 50 seconds, sort-merge 0.75 seconds and hash join 0.45 seconds.</p>
<figure class="mm" aria-label="Decision flowchart for choosing a join algorithm" style="--diagram-width:585px">
  <img src="diagrams/ch11-join-choice.svg" alt="Flowchart: for a join, if the condition is not an equality on the whole key, use a nested loop, with an index if there is one. Otherwise, if there is an index on the inner join column and few outer rows, use an index nested loop. Otherwise, if the inputs are sorted or the output must be sorted, use sort-merge. Otherwise, if the build side fits in memory use a hash join, and if not use a Grace hash join.">
  <figcaption>Flowchart: how an engine picks a join algorithm. The planner uses estimated sizes (chapter 19).</figcaption>
</figure>

<h3>5. Parallel hash joins on many cores (15-721)</h3>
<p>In OLAP the hash join is the most important operator, and the 721 lecture asks how to run it on many cores without becoming memory-bound. The goals: avoid latches, and keep data local to the worker and in the CPU cache. The join has three phases: <b>partition</b> (optional), <b>build</b> and <b>probe</b>. Partitioning can be non-blocking (one scan, shared or private partitions) or blocking <b>radix</b> partitioning: scan once to build a histogram, a prefix sum to find output offsets, and scan again to place each tuple. Radix partitioning costs extra passes and pays when it makes the build and probe fit in cache and the TLB. The build can use chained hashing or linear probing (chapter 6).</p>
<figure class="mm" aria-label="Flowchart of parallel hash join phases: partition, build, probe" style="--diagram-width:360px">
  <img src="diagrams/ch11-parallel-hash.svg" alt="Flowchart: relations R and S are partitioned by hash on the join key. Each worker builds a hash table for its partition of R, then probes it by scanning the matching partition of S, and outputs the matches.">
  <figcaption>Flowchart: partition, build, probe. Each worker owns whole partitions.</figcaption>
</figure>

<h3>6. Multi-way joins (15-721)</h3>
<p>A plan of binary joins can create an intermediate result far larger than both inputs and the output. For cyclic queries, such as finding triangles, no binary order avoids it. <b>Worst-case optimal joins</b> (WCOJ) such as the leapfrog trie join process one <em>attribute</em> at a time, intersecting the candidates from every table that mentions it, so the work stays within the proven output bound. They use trie-shaped indexes on each table. The hash trie join variant builds them lazily and prunes singletons. Practical systems use them for graph-like and cyclic queries, and use binary hash joins for the usual star and chain shapes.</p>

<h3>7. The trade-off</h3>
<p>Nested loops are simple and cost the product of the inputs unless an index helps. Sort-merge shines on sorted input and skew. Hash join is the default for large unsorted inputs and is memory hungry. Partitioning trades extra passes for locality. Multi-way joins trade complexity for protection against blow-ups. Which one the planner chooses depends on size estimates, which is why wrong statistics produce slow joins.</p>

<h3>8. Syntax</h3>
<pre>-- which join algorithm and how big was the hash table
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders o JOIN events e ON e.order_id = o.id;
--   Hash Join  (Hash Cond: e.order_id = o.id)
--     -&gt; Hash  Buckets: 524288  Batches: 8      (Batches &gt; 1: Grace-style spill)
--   Nested Loop  (loops=1000000)                (inner side ran a million times)

-- give the join more memory for one session
SET work_mem = '512MB';

-- let the planner use each algorithm, for experiments only
SET enable_nestloop = off;
SET enable_mergejoin = off;</pre>
<p>A Nested Loop with a huge <code>loops</code> count on a large table is the sign of a wrong estimate. Fix the statistics before you force a plan.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict, diagnose: OLD.diagnose,
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[11] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [nested, grace, radix, wcoj] };
})();
