/* Chapter 6 · sorting, aggregation and join algorithms. Owns the algorithms used by blocking operators. Join order and cost models are chapter 9; vectorized and SIMD probing are chapter 10; the operator pipeline is chapter 5; pages and the buffer pool are chapter 2; hash table schemes are chapter 4. */
PG.algorithms = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch06-css', `
.c06-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.c06-table th,.c06-table td{border-bottom:1px solid var(--line);padding:6px 6px;text-align:right;color:var(--ink);vertical-align:top}
.c06-table th:first-child,.c06-table td:first-child{text-align:left}
.c06-table th{color:var(--mut);font-weight:600;font-size:12px}
.c06-table th,.c06-table td{white-space:nowrap}
.c06-table tr.win td{background:var(--soft)}
.c06-bar{height:12px;border-radius:6px;background:var(--soft);overflow:hidden;margin:4px 0}
.c06-bar i{display:block;height:100%;background:var(--acc2);border-radius:6px}
.c06-wrap{overflow-x:auto;max-width:100%}
.c06-note{color:var(--mut);font-size:13px}
.c06-workers{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;align-items:end;height:120px;margin:10px 0}
.c06-w{display:flex;flex-direction:column;justify-content:flex-end;height:100%;font-size:11px;color:var(--mut);text-align:center}
.c06-w i{display:block;background:var(--acc2);border-radius:4px 4px 0 0;min-height:2px}
.c06-w.hot i{background:var(--bad)}
.c06-levels{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.c06-lv{flex:1 1 90px;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:12px;background:var(--soft);color:var(--mut)}
.c06-lv b{display:block;font-size:14px;color:var(--ink)}
.c06-lv.on{border-color:var(--acc);border-width:2px}
.c06-lv.bad{border-color:var(--bad);border-width:2px}
.c06-graph{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
.c06-g{border:1px solid var(--line);border-radius:8px;padding:8px 4px;text-align:center;font-size:12px;background:var(--soft);color:var(--mut)}
.c06-g b{display:block;font-size:15px;color:var(--ink)}
.c06-g.on{background:var(--acc);border-color:var(--acc);color:#fff}
.c06-g.on b{color:#fff}
@media (max-width:560px){.c06-workers{grid-template-columns:repeat(4,1fr);height:auto}.c06-graph{grid-template-columns:repeat(2,1fr)}.c06-table{font-size:12px}.c06-table th,.c06-table td{padding:5px 4px}}
`);

  /* ---- model constants: every number on this page is computed from these ---- */
  const TPP = 100;                 // tuples per page (illustrative)
  const PAGE_B = 8192;             // bytes per page
  const DISK = 100e6;              // bytes per second, illustrative sequential disk
  const PPS = DISK / PAGE_B;       // pages per second, about 12,207
  const FUDGE = 1.2;               // hash table size per input page (illustrative)
  const WORKERS = 8;
  const SKEW = 0.3;                // share of probe rows on one hot key, in the skew case

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const sci = n => n >= 1e9 ? n.toExponential(1).replace('e+', 'e') : fmt(n);
  const tm = io => {
    const s = io / PPS;
    return s < 1 ? Math.round(s * 1000) + ' ms' : s < 60 ? s.toFixed(1) + ' s' : s < 3600 ? (s / 60).toFixed(1) + ' min' : s < 86400 ? (s / 3600).toFixed(1) + ' h' : (s / 86400).toFixed(1) + ' days';
  };
  const passes = (X, B) => X <= B ? 0 : 1 + Math.ceil(Math.log(Math.ceil(X / B)) / Math.log(B - 1) - 1e-9);   // external sort passes after the sort phase

  /* the three algorithms on one pair of inputs; M and N are pages, m and n tuples */
  function model(m, n, B, ordered, skew) {
    const M = m / TPP, N = n / TPP, out = n;
    const bnl = { name: 'Block nested loop', io: M + Math.ceil(M / (B - 2)) * N, comps: m * n, temp: 0, out, busy: null };
    // sort-merge: sort each side unless it is already ordered, then merge once
    const sR = ordered ? 0 : (M <= B ? 0 : 2 * M * passes(M, B)), sS = ordered ? 0 : (N <= B ? 0 : 2 * N * passes(N, B));
    const sm = { name: 'Sort-merge join', io: sR + sS + M + N,
      comps: ordered ? m + n : m * Math.log2(m) + n * Math.log2(n) + m + n,
      temp: (sR + sS) / 2, out, busy: null };
    // hash join: in memory if the build side fits, otherwise Grace (partitioned) with recursive levels when needed
    const build = M * FUDGE, fits = build <= B - 2;
    const L = fits ? 0 : Math.max(1, Math.ceil(Math.log(Math.ceil(M / B)) / Math.log(B - 1) - 1e-9));
    const hj = fits
      ? { name: 'Hash join (in memory)', io: M + N, comps: m + n, temp: 0, out, busy: null }
      : { name: 'Hash join (Grace)', io: 2 * (M + N) * L + (M + N), comps: m + n, temp: (M + N) * L, out,
          busy: skew ? SKEW + (1 - SKEW) / (B - 1) : 1 / (B - 1) };
    return { M, N, fits, L, list: [bnl, sm, hj] };
  }

  /* PLAYGROUND: change sizes, memory, order and skew; compare I/O, comparisons, temp I/O and output size */
  function playground() {
    let size = 'medium', mem = 1000, ordered = false, skew = false;
    const SIZES = { small: { l: '10K × 10K', m: 1e4, n: 1e4 }, medium: { l: '1M × 10M', m: 1e6, n: 1e7 }, large: { l: '10M × 100M', m: 1e7, n: 1e8 } };
    const box = h('div', { class: 'c06-wrap' }), txt = h('p', { class: 'sx-txt' });
    const paint = () => {
      const S = SIZES[size], r = model(S.m, S.n, mem, ordered, skew);
      const maxIO = Math.max(...r.list.map(x => x.io));
      const best = r.list.reduce((a, b) => (a.io <= b.io ? a : b));
      box.replaceChildren(
        h('table', { class: 'c06-table' },
          h('thead', {}, h('tr', {}, ['Algorithm', 'I/O pages', 'time', 'comparisons', 'temp pages written', 'output = intermediate rows', 'busiest partition'].map(c => h('th', {}, c)))),
          h('tbody', {}, r.list.map(x => h('tr', { class: x === best ? 'win' : '' },
            h('td', {}, h('b', {}, x.name), h('div', { class: 'c06-bar' }, h('i', { style: 'width:' + Math.max(2, x.io / maxIO * 100).toFixed(1) + '%' }))),
            h('td', {}, fmt(x.io)), h('td', {}, tm(x.io)), h('td', {}, sci(x.comps)), h('td', {}, fmt(x.temp)), h('td', {}, fmt(x.out)),
            h('td', {}, x.busy == null ? 'n/a' : (x.busy * 100).toFixed(1) + '%'))))));
      txt.textContent = 'Inputs: ' + fmt(S.m) + ' rows (' + fmt(r.M) + ' pages) and ' + fmt(S.n) + ' rows (' + fmt(r.N) + ' pages), with ' + fmt(mem) + ' buffer pages. '
        + 'Cheapest here: ' + best.name + ' (' + tm(best.io) + ').'
        + (r.fits ? ' The build side fits in memory, so the hash join needs no partitions.' : ' The build side does not fit, so the Grace hash join partitions both inputs' + (r.L > 1 ? ' over ' + r.L + ' levels.' : ' once.'))
        + (skew ? ' With skew, the busiest partition holds ' + (SKEW * 100).toFixed(0) + '% of the probe work plus its share.' : '');
    };
    const sizeSeg = seg([{ v: 'small', l: 'Small 10K × 10K' }, { v: 'medium', l: 'Medium 1M × 10M' }, { v: 'large', l: 'Large 10M × 100M' }], size, v => { size = v; paint(); });
    const memSeg = seg([{ v: 100, l: 'B = 100' }, { v: 1000, l: 'B = 1,000' }, { v: 10000, l: 'B = 10,000' }], mem, v => { mem = v; paint(); });
    const ordSeg = seg([{ v: false, l: 'Unsorted inputs' }, { v: true, l: 'Both sorted on the key' }], ordered, v => { ordered = v; paint(); });
    const skSeg = seg([{ v: false, l: 'Uniform keys' }, { v: true, l: 'Skewed: 30% on one key' }], skew, v => { skew = v; paint(); });
    paint();
    return h('div', { class: 'c06-wrap' },
      h('div', { class: 'sx-play' },
        h('div', { class: 'sx-controls' }, sizeSeg, memSeg),
        h('div', { class: 'sx-controls' }, ordSeg, skSeg),
        box, txt),
      h('p', { class: 'c06-note' }, 'Time assumes ' + (DISK / 1e6) + ' MB/s of sequential disk and 8 KB pages (illustrative). B is the number of buffer pages. Assumption: every S row matches exactly one R row (a key-to-foreign-key join), so the output, which is also the intermediate result, has n rows for every algorithm. Only a multiway plan (problem 4) changes the intermediate size.'));
  }

  /* ---- COMMON PROBLEMS: each demo is a stepper whose final numbers differ between Failure and After fix ---- */
  const M1 = 100000, N1 = 1000000;   // 10M and 100M rows at 100 tuples per page
  function nlDemo(mode) {
    const good = mode === 'good', B = 1000;
    const blocks = Math.ceil(M1 / (B - 2));
    const states = [];
    if (!good) {
      states.push({ t: 'Start: R (10M rows, ' + fmt(M1) + ' pages) is the outer table. S (100M rows, ' + fmt(N1) + ' pages) is the inner table, and B = ' + B + ' buffer pages.', io: M1, scans: 0 });
      for (let k = 1; k <= 10; k++) {
        const done = Math.round(blocks * k / 10);
        states.push({ t: 'Outer blocks ' + fmt(Math.round(blocks * (k - 1) / 10) + 1) + ' to ' + fmt(done) + ': each block rescans all of S, ' + fmt(N1) + ' pages each time.', io: M1 + done * N1, scans: done });
      }
      states[states.length - 1].t = 'Finished: S was scanned ' + fmt(blocks) + ' times, so the join read ' + fmt(M1 + blocks * N1) + ' pages, about ' + tm(M1 + blocks * N1) + '.';
    } else {
      states.push({ t: 'Start: the same inputs and the same B = ' + B + ' buffers. Hash join: partition both inputs once, then join each partition in memory.', io: 0, scans: 0 });
      states.push({ t: 'Partition R: read ' + fmt(M1) + ' pages and write ' + fmt(M1) + ' pages to ' + (B - 1) + ' partitions.', io: 2 * M1, scans: 0 });
      states.push({ t: 'Partition S: read ' + fmt(N1) + ' pages and write ' + fmt(N1) + ' pages. Each R partition is now about ' + fmt(M1 / (B - 1)) + ' pages, which fits in memory.', io: 2 * M1 + 2 * N1, scans: 0 });
      states.push({ t: 'Build and probe each partition: read the partitions once more, ' + fmt(M1 + N1) + ' pages. Total: ' + fmt(3 * (M1 + N1)) + ' pages, about ' + tm(3 * (M1 + N1)) + '.', io: 3 * (M1 + N1), scans: 0 });
    }
    return stepper(states, s => [
      h('div', { class: 'sx-stats' }, stat('pages read so far', fmt(s.io)), stat('scans of S', s.scans), stat('time so far', tm(Math.max(1, s.io)))) ]);
  }
  function spillDemo(mode) {
    const good = mode === 'good', B = good ? 1000 : 10;
    const part = M1 / (B - 1);
    const states = [{ t: 'Start: R has ' + fmt(M1) + ' pages and the join has B = ' + B + ' buffer pages. ' + (good ? 'The first partitions are ' + fmt(part) + ' pages.' : 'The first partitions would be ' + fmt(part) + ' pages.'), level: 0, temp: 0 }];
    const levels = good ? 1 : Math.ceil(Math.log(Math.ceil(M1 / B)) / Math.log(B - 1) - 1e-9);
    for (let L = 1; L <= levels; L++) {
      const size = M1 / Math.pow(B - 1, L);
      states.push({ t: good ? 'Level 1: ' + (B - 1) + ' partitions of ' + fmt(size) + ' pages each fit in ' + B + ' buffers. Partitions are joined without another split.'
        : 'Level ' + L + ': the partitions are still ' + fmt(size) + ' pages, larger than ' + B + ' buffers, so they are written to disk and split again.', level: L, temp: L * 2 * M1 });
    }
    const last = states[states.length - 1];
    last.t = good ? 'Finished: 1 level of partitioning. ' + fmt(2 * M1) + ' pages written and read in temp space.'
      : 'Finished: ' + levels + ' levels, and every level rewrote all ' + fmt(M1) + ' pages. Temp I/O: ' + fmt(levels * 2 * M1) + ' pages.';
    return stepper(states, s => [
      h('div', { class: 'c06-levels' }, Array.from({ length: levels }, (_, i) => h('div', { class: 'c06-lv' + (s.level > i ? ' on' : '') + (!good && s.level === i + 1 ? ' bad' : '') },
        h('b', {}, 'level ' + (i + 1)), fmt(M1 / Math.pow(B - 1, i + 1)) + ' pages each'))),
      h('div', { class: 'sx-stats' }, stat('levels spilled', s.level), stat('temp I/O pages', fmt(s.temp)))]);
  }
  function skewDemo(mode) {
    const good = mode === 'good';
    const even = 1 / WORKERS, hot = SKEW + (1 - SKEW) / WORKERS;
    const states = [{ t: 'Start: 8 workers each probe one hash partition. The probe side is 100M rows.', share: Array(WORKERS).fill(even) }];
    if (good) {
      states.push({ t: 'Detect the hot key from statistics. Salt it: the hot rows get a random suffix, so they spread over all 8 partitions. The build side keeps one copy of the hot key per partition.', share: Array(WORKERS).fill(SKEW / WORKERS + (1 - SKEW) / WORKERS) });
      states[states.length - 1].t = 'Finished: each worker now probes 12.5 percent of the rows. The busiest worker holds 12.5 percent.';
    } else {
      states.push({ t: 'Hash the join key. All 30 percent of the rows with the hot key land on one worker, which holds ' + (hot * 100).toFixed(2) + ' percent of the probe work.', share: Array.from({ length: WORKERS }, (_, i) => i === 0 ? hot : (1 - hot) / (WORKERS - 1)) });
      states[states.length - 1].t = 'Finished: the other 7 workers finish early and wait. The busiest worker holds ' + (hot * 100).toFixed(2) + ' percent of the probe work, so the join takes about ' + (hot * WORKERS).toFixed(1) + ' times as long as an even split.';
    }
    return stepper(states, s => [
      h('div', { class: 'c06-workers' }, s.share.map((x, i) => h('div', { class: 'c06-w' + (x > even * 1.5 ? ' hot' : '') }, h('i', { style: 'height:' + Math.max(2, x / hot * 100).toFixed(1) + '%' }), 'w' + (i + 1)))),
      h('div', { class: 'sx-stats' }, stat('busiest worker', (Math.max(...s.share) * 100).toFixed(2) + '%'), stat('even split', (even * 100).toFixed(1) + '%'))]);
  }
  function multiDemo(mode) {
    const good = mode === 'good';
    const E = 10000000, deg = 10, paths = E * deg, tri = 1000000;
    const states = [{ t: 'Start: find triangles in a graph with 10M edges: R(a,b), S(b,c), T(a,c). Average out-degree is ' + deg + '.', inter: 0, out: 0 }];
    if (good) {
      states.push({ t: 'Leapfrog: pick a, then intersect the sorted neighbor lists of R and T for that a. No pair of tables is joined first.', inter: 0, out: 0, on: 1 });
      states.push({ t: 'For each (a, b), intersect the next lists with S. Only closed triangles are emitted.', inter: 0, out: tri / 2, on: 2 });
      states.push({ t: 'Finished: ' + fmt(tri) + ' triangles. No pairwise intermediate was ever stored.', inter: 0, out: tri, on: 3 });
    } else {
      states.push({ t: 'Step 1: join R and S first. Every edge extends into about ' + deg + ' paths, so the intermediate result grows to ' + fmt(paths) + ' rows.', inter: paths, out: 0, on: 1 });
      states.push({ t: 'Step 2: join that intermediate with T. Most of the ' + fmt(paths) + ' paths do not close into a triangle.', inter: paths, out: tri / 2, on: 2 });
      states.push({ t: 'Finished: ' + fmt(tri) + ' triangles. The binary plan stored ' + fmt(paths) + ' intermediate rows to produce them.', inter: paths, out: tri, on: 3 });
    }
    return stepper(states, s => [
      h('div', { class: 'c06-graph' }, ['R(a,b)', 'S(b,c)', 'T(a,c)', 'output'].map((x, i) => h('div', { class: 'c06-g' + (s.on === i || (s.on >= 3 && i === 3) ? ' on' : '') }, x))),
      h('div', { class: 'sx-stats' }, stat('intermediate rows stored', fmt(s.inter)), stat('rows output so far', fmt(s.out)))]);
  }

  const PROBLEMS = [
    { tab: 'Nested loop on two large inputs',
      sym: 'the nested loop reads ' + sci(M1 + Math.ceil(M1 / 998) * N1) + ' pages, about ' + tm(M1 + Math.ceil(M1 / 998) * N1) + ', because the inner table is rescanned for every block of the outer table.',
      why: 'A block nested loop reads the inner table once per block of the outer table. With 1,000 buffers, the outer table is ' + fmt(Math.ceil(M1 / 998)) + ' blocks, so the inner table is read that many times.',
      log: 'representative plan summary, counts illustrative\nNested Loop (outer: orders_10m, inner: events_100m)\nbuffers: 1000, outer blocks: ' + fmt(Math.ceil(M1 / 998)) + '\npages read: ' + fmt(M1 + Math.ceil(M1 / 998) * N1),
      demo: v => nlDemo(v),
      fix: ['Use a hash join for an equi-join of two large inputs. It reads each input a fixed number of times, not once per block.', 'If the join key is already sorted on both sides, use a sort-merge join, which reads each input once.', 'Put the smaller table on the build side, and check that it is the one the optimizer chooses (chapter 9).', 'Verify: pages read in the plan before and after the change.'] },
    { tab: 'Hash or sort spills repeatedly',
      sym: 'the join writes its partitions to disk ' + Math.ceil(Math.log(Math.ceil(M1 / 10)) / Math.log(9) - 1e-9) + ' times, because each partition is still too big for the 10 buffers.',
      why: 'A partition that does not fit in memory is split again. With few buffers, each split leaves partitions still too large, so the data is written to disk at every level.',
      log: 'representative engine log, counts illustrative\nhash join: buffers 10, partitions 9\nlevel 1: ' + fmt(M1 / 9) + ' pages per partition, spilling\nlevel 2: ' + fmt(M1 / 81) + ' pages per partition, spilling\nlevel 5: ' + fmt(M1 / Math.pow(9, 5)) + ' pages per partition, fits in memory',
      demo: v => spillDemo(v),
      fix: ['Give the join enough buffers that its first partitions fit in memory. In this case, 1,000 buffers is enough for one level.', 'Project only the columns the join and the output need, so each row is smaller and the partitions are smaller.', 'Pre-aggregate or filter before the join, so that fewer rows reach the partitioning step.', 'Verify: count the levels in the log and temp I/O pages, before and after the change.'] },
    { tab: 'Skewed key sends work to one partition',
      sym: 'one worker holds ' + (((SKEW + (1 - SKEW) / WORKERS) * 100)).toFixed(2) + ' percent of the probe work, while the other 7 workers wait.',
      why: 'Hash partitioning puts all rows with the same key in the same partition. When 30 percent of the rows share one key, that partition gets far more work than the others, and the join finishes only when its busiest worker does.',
      log: 'representative worker summary, counts illustrative\nprobe rows per worker: w1 = ' + fmt((SKEW + (1 - SKEW) / WORKERS) * 100000000) + ', w2..w8 = ' + fmt((1 - SKEW) / WORKERS * 100000000) + ' each\nmax/avg: ' + ((SKEW + (1 - SKEW) / WORKERS) * WORKERS).toFixed(1) + 'x\njoin wait: 7 workers idle',
      demo: v => skewDemo(v),
      fix: ['Find the hot keys from statistics, or from a sample, before the join.', 'Salt the hot key: add a random suffix on the probe side, and copy the matching build row for each suffix, so the hot rows spread over all workers.', 'Handle the hot key separately, with a broadcast of its build rows, and hash-join the rest.', 'Verify: the busiest worker share and the time of the slowest partition, before and after the change.'] },
    { tab: 'Binary join order creates a huge intermediate',
      sym: 'a three-way join stores ' + fmt(10000000 * 10) + ' intermediate rows, to produce ' + fmt(1000000) + ' output rows.',
      why: 'A binary plan joins two tables first, and the result can be much larger than both the inputs and the final output. For a triangle query on a graph, the first two-hop join produces every path, and most of them never close.',
      log: 'representative plan summary, counts illustrative\nHash Join (R.b = S.b) rows out: ' + fmt(10000000 * 10) + '\n  -> Hash Join (S.c = T.c) rows out: ' + fmt(1000000) + '\nintermediate rows stored: ' + fmt(10000000 * 10),
      demo: v => multiDemo(v),
      fix: ['Use a multiway join (worst-case optimal, such as leapfrog trie join), which works one variable at a time, so no pairwise intermediate is stored.', 'Use the optimizer heuristic the 10-multiwayjoins notes describe: a multiway join is slower when the pairwise intermediates are not larger than the inputs, so the plan choice depends on that size. Join ordering is chapter 9.', 'For a binary plan, choose the first join that keeps the intermediate small, using the statistics.', 'Verify: intermediate rows in the plan, before and after the change.'] }
  ];

  root.append(
    sec('1 · The problem',
      para('A join that works for 10,000 rows takes hours for 100 million rows, and it exhausts memory.'),
      para('Sorting, grouping and joining all need working space. When the input is larger than memory, the algorithm must spill to disk, and a poor algorithm spills again and again.'),
      para('The same query can be answered by several algorithms, and each one is cheap for some sizes and ruinous for others.'),
      h('p', { class: 'sx-q', html: 'Which algorithm should the engine pick for two inputs of a given size, order and skew, and what does it cost when memory runs out?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> pick the physical algorithm from the input size, the order, the memory and the key distribution, and count the disk I/O each choice needs.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Cost model:</b> disk I/O counts pages read and written. CPU and network are ignored here, because I/O usually dominates. The outer table is the smaller one when possible. Let M and N be the pages of R and S, and m and n their tuples.',
        '<b>Join output:</b> early materialization copies the attribute values into the output, so later operators need not revisit the base tables. Late materialization copies only join keys and record ids, which suits column stores.',
        '<b>Nested loop:</b> the naive version costs M + m times N. The block version reads the inner table once per block of the outer table, so it costs M + ceil(M / (B - 2)) times N. An index nested loop costs M plus one index probe per outer tuple.',
        '<b>Sort-merge join:</b> external merge sort on each input, then one merge pass of M + N (merge and sort formulas from the 15-445 notes, lecture 12). The sort costs 2M times (1 + ceil(log base B-1 of M/B)) for R, and the same for S. If an input is already sorted on the key, its sort is free. Merge cost grows toward M times N only when one key repeats on every row.',
        '<b>External merge sort:</b> the sort phase writes sorted runs of B pages. The merge phase combines up to B - 1 runs per pass, with one buffer per run and one for output. A top-N query with LIMIT keeps only a heap of N elements, so it scans once.',
        '<b>Sort details:</b> double buffering prefetches the next run, which halves the usable buffers (15-445 notes, lecture 11). Comparisons can be specialized to the key type. A clustered B+ tree already gives sorted order, so it can replace the sort; an unclustered tree is usually slower, except for small top-N queries.',
        '<b>Hash join:</b> build a hash table on the smaller input, then probe it with the other. Hash joins work only for equi-joins on the full key. A Bloom filter built during the build phase rejects probes that cannot match, which saves reads (sideways information passing).',
        '<b>Grace hash join:</b> when the build side does not fit, hash both inputs into B - 1 partitions on disk, then build and probe each partition in memory. Partitioning reads and writes everything once, 2(M + N), and the probe reads it once more, (M + N). The total is 3 times (M + N) when the partitions fit (15-445 notes, lecture 12). A partition that still does not fit is split again with a new hash function.',
        '<b>Hybrid hash join:</b> keeps the hot partition in memory, instead of spilling it, when keys are skewed. The 15-445 notes say it is hard to implement correctly and rarely done in practice.',
        '<b>Parallel hash join:</b> three phases, partition (optional), build and probe. Non-blocking partitioning scans the input once, with shared partitions (latched) or private partitions (merged later). Radix (blocking) partitioning scans twice: once for a histogram of hash ranges, then a prefix sum gives each partition its output offset, and a second scan writes the partitions (15-721 notes). Partitioned joins beat non-partitioned joins in most settings, but they are hard to tune.',
        '<b>Hash table choices for joins:</b> chaining, linear probing, Robin Hood, hopscotch and cuckoo tables are covered in chapter 4. Here what matters is what to store: the key with its hash, and either the full tuple or a pointer to it.',
        '<b>Aggregation:</b> sort on the group key, then scan once, or hash: a table from group key to running value (for AVG, a count and a sum). Hashing is cheaper unless the input is already sorted. When the table does not fit, partition on a first hash, then rehash each partition with a second hash.',
        '<b>Multiway joins:</b> a worst-case optimal join bounds its run time by the output size, not by the input sizes. Leapfrog trie join sorts the inputs, builds a trie per attribute order, and intersects them one variable at a time. Its limit: the global attribute order must be fixed in advance, and tries for every order are too costly to build on the fly. Hash trie join stores hashes instead of keys, prunes singleton nodes, and expands child nodes lazily. Deciding when to use one is an optimizer task (chapter 9). Factorization keeps a count instead of repeated rows.',
        '<b>Owned elsewhere:</b> choosing the join order and the cost model are chapter 9; vectorized and SIMD hash probes are chapter 10; the operator pipeline and pipeline breakers are chapter 5; pages and the buffer pool are chapter 2.'
      ].map(x => '<li>' + x + '</li>').join('') })),
    sec('3 · Playground: sizes, memory, order and skew', playground()),
    sec('4 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
