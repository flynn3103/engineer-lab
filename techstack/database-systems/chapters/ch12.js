/* Chapter 13 "Parallel Execution and Scheduling" (index 12, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L14 Query Execution II (process models, inter- and intra-query parallelism, I/O parallelism); CMU 15-721 L05 Query Execution II (exchange operators) and L08 Scheduling (worker allocation, NUMA data placement, morsel-driven task assignment).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: partial aggregates through an exchange, morsels on two NUMA sockets, and a worker pool against thread-per-query on a throughput chart. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 4. Morsels: workers pull small units of work, prefer their own socket, and steal only when idle ---- */
  const GX = t => 130 + t, GY = i => 130 + i * 44, UNIT = 56, FAR = 84;
  const LANES = [['W1', 'socket 0', 't0'], ['W2', 'socket 0', 't0'], ['W3', 'socket 1', 't1'], ['W4', 'socket 1', 't1']];
  const blk = (lane, t, dur, tone, label, bad) => ({ lane, t, dur, tone, label, bad });
  const R1 = [blk(0, 0, UNIT, 't0', 'm1'), blk(1, 0, UNIT, 't0', 'm2'), blk(2, 0, UNIT, 't1', 'm9'), blk(3, 0, UNIT, 't1', 'm10')];
  const R2 = [blk(0, UNIT, UNIT, 't0', 'm3'), blk(1, UNIT, UNIT, 't0', 'm4'), blk(2, UNIT, UNIT, 't1', 'm11'), blk(3, UNIT, UNIT, 't1', 'm12')];
  const R3 = [blk(0, 2 * UNIT, UNIT, 't0', 'm5'), blk(1, 2 * UNIT, UNIT, 't0', 'm6')];
  const STEAL = [blk(2, 2 * UNIT, FAR, 't0', 'm7 far', true), blk(3, 2 * UNIT, FAR, 't0', 'm8 far', true)];
  const WAIT = [];
  [0, 1, 2, 3].forEach(l => { let t = 0; for (let k = 0; k < 3; k++) { WAIT.push(blk(l, t, 22, 'bad', 'lock', true)); t += 22; WAIT.push(blk(l, t, UNIT, l < 2 ? 't0' : 't1', 'm' + (k + 1 + l * 3), false)); t += UNIT; } });
  const morsel = {
    id: 'morsel-workers', label: 'Morsel scheduling', desc: 'Twelve morsels of 100,000 tuples sit on two NUMA sockets, eight on socket 0 and four on socket 1. Four workers pull morsels, prefer their own socket and steal only when idle (durations illustrative).',
    codeLabel: 'Scheduler',
    code: { bug: [
      'cut the scan into morsels of about 100,000 tuples; each lives in one socket\'s memory',
      'one worker per core; each pulls the next morsel from its own socket first',
      'socket 1 runs out of morsels early: its workers go idle',
      'idle workers steal from socket 0: a far read takes longer but beats idling',
      'a single shared queue and more workers than cores add lock waits instead of speed',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 4 workers, 12 morsels, time left to right. Illustrative.',
      header: s => ({ left: s.end ? 'finish at t = ' + s.end : 'running', right: s.right || '' }),
      draw(P, s) {
        LANES.forEach(([n, sock, tone], i) => {
          P.text('ln' + i, { x: 30, y: GY(i) + 14, t: n, cls: 'sm b' }); P.text('ls' + i, { x: 30, y: GY(i) + 28, t: sock, cls: 'mut xs' });
          P.line('gl' + i, 122, GY(i) + 36, 600, GY(i) + 36, { tone: 'mut', sw: 0.8 });
        });
        P.text('hq', { x: 130, y: 92, t: s.queue || '', cls: 'mut sm' });
        (s.blocks || []).forEach((b, k) => P.box('b' + k, { x: GX(b.t), y: GY(b.lane), w: b.dur - 2, h: 30, tone: b.tone, label: b.label, cls: 'xs', dash: b.bad && b.tone !== 'bad', stroke: b.bad ? 'bad' : null }));
        if (s.idle) P.box('idle', { x: GX(2 * UNIT), y: GY(2), w: 3 * UNIT, h: 30 + 44, tone: 'mut', label: 'idle: no morsels left on socket 1', cls: 'xs', dash: true, op: 0.6 });
        if (s.note) P.chip('nt', { x: 130, y: 318, w: 400, h: 26, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The scan is cut into 12 morsels of about 100,000 tuples. Eight sit in socket 0 memory and four in socket 1 memory. Four workers, two per socket, are ready.', callout: '12 morsels, 4 workers, 2 sockets', code: 0,
        state: { queue: '12 morsels waiting: 8 on socket 0, 4 on socket 1' }, stats: [{ l: 'morsels', v: '12' }, { l: 'workers', v: '4' }] },
      { log: 'Each worker pulls a morsel from its own socket, so every read is local and fast. W1 and W2 take m1 and m2, W3 and W4 take m9 and m10.', callout: 'Workers pull from their own socket', code: 1,
        state: { blocks: R1, queue: 'first morsels pulled' }, stats: [{ l: 'local reads', v: '4', cls: 'ok' }] },
      { log: 'The second round goes the same way. After it, socket 1 has no morsels left, while socket 0 still has four.', callout: 'Socket 1 runs out of morsels', code: 2,
        state: { blocks: R1.concat(R2), queue: 'socket 1 empty, socket 0 has 4 left' }, stats: [{ l: 'morsels left', v: '4 on socket 0', cls: 'warn' }] },
      { log: 'W3 and W4 would now sit idle while W1 and W2 work through four morsels alone. Without stealing the job ends at t = 224.', callout: 'Without stealing, W3 and W4 sit idle', moment: true, code: 2,
        state: { blocks: R1.concat(R2, R3), idle: 1, queue: 'W1, W2 take m5, m6; W3, W4 idle', end: 224 }, stats: [{ l: 'idle workers', v: '2', cls: 'bad' }, { l: 'finish', v: 't = 224', cls: 'bad' }] },
      { log: 'W3 and W4 steal m7 and m8 from socket 0. Those reads cross to the far socket and take longer, but still beat waiting.', callout: 'Idle workers steal from the far socket', code: 3,
        state: { blocks: R1.concat(R2, R3, STEAL), queue: 'W3, W4 steal m7, m8 (far reads)', end: 196 }, stats: [{ l: 'far reads', v: '2', cls: 'warn' }, { l: 'finish', v: 't = 196', cls: 'ok' }] },
      { log: 'Now the opposite mistake: more workers than cores pulling from one shared queue. Each morsel is preceded by a lock wait, and the finish moves later.', callout: 'One shared queue: workers wait on a lock', code: 4,
        state: { blocks: WAIT, queue: 'single queue, lock before every morsel', end: 240, note: 'time spent waiting is not work', noteTone: 'bad', right: 'shared queue' }, stats: [{ l: 'lock waits', v: '12', cls: 'bad' }, { l: 'finish', v: 't = 240', cls: 'bad' }],
        takeaway: 'Small morsels, one worker per core and local reads first keep every core busy. Stealing handles imbalance, locks add waiting.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L14 Query Execution II and CMU 15-721 L05 Query Execution II, L08 Scheduling (notes in output/pdf)', href: '../../output/pdf/cmu-15445-fall2024/notes/14-queryexecution2.pdf' };

  /* ---- 1. Exchange: partitions, partial aggregates, a repartition, a final aggregate, a gather ---- */
  const PART = [['A', [['VN', 10], ['SG', 5], ['VN', 20]]], ['B', [['TH', 7], ['VN', 30], ['SG', 15]]], ['C', [['ID', 8], ['TH', 3], ['SG', 12]]]];
  const PARTIAL = [[['VN', 30], ['SG', 5]], [['TH', 7], ['VN', 30], ['SG', 15]], [['ID', 8], ['TH', 3], ['SG', 12]]];
  const OWN = { VN: 0, SG: 0, TH: 1, ID: 1 };
  const FINAL = [[['VN', 60], ['SG', 32]], [['TH', 10], ['ID', 8]]];
  const py = i => 104 + i * 74;
  const exch = {
    id: 'exchange', label: 'Exchange operator', desc: 'SUM(price) GROUP BY country on a table in three partitions. Three workers aggregate their own slice, an exchange sends each partial group to the worker that owns the country, and a gather collects the answer (values illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'SELECT country, SUM(price) FROM orders GROUP BY country;',
      'stage 1 (3 workers): scan own partition, partial SUM per country',
      'exchange: repartition by hash(country), so one worker owns each country',
      'stage 2 (2 workers): add the partial sums of the countries they own',
      'gather: collect the two outputs into one result stream',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 3 slices, 2 final workers, 4 groups. Illustrative.',
      header: s => ({ left: s.hl || 'table in 3 partitions', right: s.rt || '' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 82, t: 'partitions', cls: 'mut sm' }); P.text('h2', { x: 170, y: 82, t: 'stage 1 workers', cls: 'mut sm' });
        P.text('h3', { x: 380, y: 82, t: 'stage 2 workers', cls: 'mut sm' }); P.text('h4', { x: 520, y: 82, t: 'result', cls: 'mut sm' });
        PART.forEach(([n, rows], i) => P.chip('d' + i, { x: 30, y: py(i), w: 100, h: 56, label: 'part ' + n, sub: rows.length + ' rows', tone: ['t0', 't1', 't2'][i] }));
        if (s.w1) PARTIAL.forEach((p, i) => { P.chip('w' + i, { x: 170, y: py(i), w: 150, h: 56, label: 'worker ' + (i + 1), sub: s.partial ? p.map(([k, v]) => k + ' ' + v).join(', ') : 'scan own slice', tone: s.partial ? 'ok' : ['t0', 't1', 't2'][i] });
          P.line('a' + i, 130, py(i) + 28, 170, py(i) + 28, { tone: 'mut', arrow: true }); });
        if (s.xchg) PARTIAL.forEach((p, i) => [0, 1].forEach(j => { if (p.some(([k]) => OWN[k] === j)) P.line('x' + i + j, 320, py(i) + 28, 380, 120 + j * 120 + 28, { tone: 'cursor', arrow: true }); }));
        if (s.w2) [0, 1].forEach(j => P.chip('f' + j, { x: 380, y: 120 + j * 120, w: 120, h: 56, label: 'worker ' + (j + 4), sub: s.fin ? FINAL[j].map(([k, v]) => k + ' ' + v).join(', ') : 'owns ' + (j ? 'TH, ID' : 'VN, SG'), tone: s.fin ? 'ok' : 'acc' }));
        if (s.gather) { P.chip('g', { x: 520, y: 170, w: 100, h: 72, label: 'result', sub: 'VN 60 SG 32 TH 10 ID 8', tone: 'ok' });
          [0, 1].forEach(j => P.line('gl' + j, 500, 148 + j * 120, 520, 206, { tone: 'ok', arrow: true })); }
      }
    }),
    bug: [
      { log: 'The table is stored in three partitions. The same operators will run on each slice at the same time: intra-operator, or horizontal, parallelism.', callout: 'Three partitions, same operators on each', code: 0, state: {}, stats: [{ l: 'partitions', v: '3' }] },
      { log: 'Stage 1: each worker scans only its own partition. No worker waits for another, and there is no shared structure to latch.', callout: 'Each worker scans its own slice', code: 1, state: { w1: 1 }, stats: [{ l: 'workers', v: '3', cls: 'ok' }] },
      { log: 'Each worker aggregates locally into partial sums per country. A country can appear in several workers: VN is in A and B, SG in all three.', callout: 'Local partial sums, with overlapping groups', code: 1, state: { w1: 1, partial: 1 }, stats: [{ l: 'partial rows', v: '8' }] },
      { log: 'The exchange operator repartitions the partial rows by hash of the country, so every partial of the same country goes to the same stage 2 worker. This is the only step where data crosses workers.', callout: 'Exchange: send each group to its owner', moment: true, code: 2, state: { w1: 1, partial: 1, xchg: 1, w2: 1 }, stats: [{ l: 'rows moved', v: '8 partial rows, not the whole table', cls: 'ok' }] },
      { log: 'Stage 2: each worker adds the partials of the countries it owns. VN is 30 + 30 = 60, SG is 5 + 15 + 12 = 32.', callout: 'Stage 2 adds the partials', code: 3, state: { w1: 1, partial: 1, xchg: 1, w2: 1, fin: 1 }, stats: [{ l: 'groups done', v: '4', cls: 'ok' }] },
      { log: 'A gather exchange collects the two outputs into one stream for the client. Three kinds of exchange appeared in total: distribute, repartition and gather.', callout: 'Gather: many streams into one', code: 4, state: { w1: 1, partial: 1, xchg: 1, w2: 1, fin: 1, gather: 1 }, stats: [{ l: 'result rows', v: '4', cls: 'ok' }],
        takeaway: 'Parallel aggregation is partial work per slice, one exchange on the group key, and a final merge. Aggregate before the exchange so fewer rows cross.' },
    ],
  };

  /* ---- 3. Process model: a fixed worker pool against one thread per query ---- */
  const CX0 = 80, CX1 = 590, CY0 = 288, CY1 = 108;
  const cxq = q => CX0 + Math.log2(q) / 7 * (CX1 - CX0);
  const cyv = v => CY0 - v / 100 * (CY0 - CY1);
  const POOLC = [[1, 5], [2, 10], [4, 20], [8, 40], [16, 78], [32, 96], [64, 96], [128, 95]];
  const OVER = [[1, 5], [2, 10], [4, 20], [8, 40], [16, 74], [32, 80], [64, 52], [128, 24]];
  const pool = {
    id: 'worker-pool', label: 'Worker pool', desc: 'Throughput as the number of concurrent queries grows on a 32-core server. A fixed pool of workers levels off at the core count. One thread per query, with each query spawning more, spends its time switching and slows down (shape illustrative, not a benchmark).',
    codeLabel: 'Model',
    code: { bug: [
      'x: concurrent queries (log scale), y: queries completed per second (illustrative)',
      'fixed pool: one worker per core, a queue of tasks, a worker never blocks on another',
      'thread per query: each query starts 16 threads, 64 queries = 1,024 threads on 32 cores',
      'more runnable threads than cores: the scheduler switches, caches are cold, memory grows',
      'admission control keeps the number of running queries near what the cores can serve',
    ] },
    stage: DB.stage({
      footer: 'Illustrative curves, not measured. The knee is at the core count (32).',
      header: s => ({ left: s.hl || 'throughput against concurrency', right: '' }),
      draw(P, s) {
        P.line('ax', CX0, CY0 + 4, CX1, CY0 + 4, { tone: 'mut' }); P.line('ay', CX0, CY0 + 4, CX0, CY1 - 10, { tone: 'mut' });
        [1, 4, 16, 64, 128].forEach((q, i) => P.text('tx' + i, { x: cxq(q), y: CY0 + 22, t: String(q), cls: 'mut xs', anchor: 'middle' }));
        P.text('xl', { x: CX1, y: CY0 + 40, t: 'concurrent queries (log)', cls: 'mut xs', anchor: 'end' }); P.text('yl', { x: CX0 + 6, y: CY1 - 14, t: 'queries per second', cls: 'mut xs' });
        const seg = (id, arr, tone, upto) => arr.forEach(([q, v], k) => { if (!k || q > upto) return; const [pq, pv] = arr[k - 1]; P.line(id + k, cxq(pq), cyv(pv), cxq(q), cyv(v), { tone, sw: 2.8 }); });
        if (s.pool) seg('p', POOLC, 'ok', s.pool);
        if (s.over) seg('o', OVER, 'bad', s.over);
        if (s.knee) { P.line('kn', cxq(32), CY0 + 4, cxq(32), CY1 - 6, { tone: 'cursor', dash: true, sw: 2 }); P.text('kt', { x: cxq(32) + 6, y: CY1 + 4, t: '32 cores', cls: 'xs' }); }
        if (s.lbl1) P.text('l1', { x: cxq(40), y: cyv(96) - 10, t: 'worker pool', cls: 'xs tone-ok' });
        if (s.lbl2) P.text('l2', { x: cxq(64), y: cyv(52) + 18, t: 'thread per query', cls: 'xs tone-bad' });
      }
    }),
    bug: [
      { log: 'Few queries at a time: every query gets cores to itself, and throughput grows with the number of queries in both designs.', callout: 'Light load: both designs scale', code: 0, state: { pool: 8, over: 8 }, stats: [{ l: 'up to 8 queries', v: 'linear' }] },
      { log: 'Up to the core count the two designs still match. 32 cores are the limit of useful parallelism: more runnable work cannot run faster.', callout: 'The knee is the core count', code: 1, state: { pool: 32, over: 32, knee: 1 }, stats: [{ l: 'cores', v: '32' }] },
      { log: 'With a fixed pool, extra queries wait in a queue. Throughput stays at the plateau, and latency rises gently with queue length.', callout: 'Worker pool: a flat plateau', code: 1, state: { pool: 128, over: 32, knee: 1, lbl1: 1 }, stats: [{ l: 'at 128 queries', v: 'plateau', cls: 'ok' }] },
      { log: 'With a thread per query and 16 threads each, 64 queries make 1,024 threads on 32 cores. The scheduler switches constantly, caches go cold, and memory per thread adds up.', callout: 'Oversubscription: throughput falls', moment: true, code: 2, state: { pool: 128, over: 128, knee: 1, lbl1: 1, lbl2: 1 }, stats: [{ l: 'at 128 queries', v: 'falls', cls: 'bad' }] },
      { log: 'The remedy is to cap what runs at once: a pool of workers sized to the cores, with a queue, and admission control for queries.', callout: 'Admission control keeps load near the knee', code: 4, state: { pool: 128, over: 128, knee: 1, lbl1: 1, lbl2: 1 }, stats: [{ l: 'good load', v: '≈ cores', cls: 'ok' }],
        takeaway: 'Parallelism helps up to the core count. Beyond it, more threads only add switching, so use a bounded pool.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Many cores, many kinds of parallelism</h3>
<p>One query on one core wastes a modern server. <b>Parallel</b> databases run on one machine, with shared memory, and workers talk through memory. <b>Distributed</b> databases span machines and talk over a network (chapters 26 and 27). There are two scopes. <b>Inter-query</b> parallelism runs different queries at once, and the scheduler typically serves them first come first served with some prioritisation. <b>Intra-query</b> parallelism splits one query across workers. It comes in two shapes that can be combined: <b>inter-operator</b> (vertical, pipelined) parallelism runs different operators at the same time, for instance two scans of different tables; <b>intra-operator</b> (horizontal) parallelism runs the same operator on different slices of the data.</p>
<figure class="mm" aria-label="Tree of parallelism types: inter-query, intra-query with inter-operator and intra-operator, exchange kinds" style="--diagram-width:637px">
  <img src="diagrams/ch12-parallel-types.svg" alt="Tree: parallelism is inter-query, different queries at once, or intra-query, one query on many workers. Intra-query is inter-operator, vertical, where pipeline stages run together, or intra-operator, horizontal, where the same operator runs on slices. Intra-operator uses an exchange operator, which is gather, N to 1, distribute, 1 to N, or repartition, N to M by hash.">
  <figcaption>Tree: the kinds of parallelism and the exchange operator that joins them.</figcaption>
</figure>

<h3>2. The exchange operator</h3>
<p>To parallelise an operator the engine inserts an <b>exchange</b> operator into the plan. <b>Gather</b> merges N input streams into one. <b>Distribute</b> splits one stream into N. <b>Repartition</b> (a shuffle) turns N streams into M by the hash of a key, so rows with the same key meet in the same worker, which a parallel join or a group by needs. A bushy plan, where the two inputs of a join are produced by independent subtrees, lets both run at once. Do as much work as possible before the exchange, such as a partial aggregate, since the exchange is where data is copied or sent.</p>

<h3>3. Process models: who runs the work</h3>
<p>A <b>process per worker</b> gives isolation and relies on shared memory for shared state: PostgreSQL works this way. A <b>thread per worker</b> shares one address space, switches cheaply and needs care for shared structures: most newer systems use it. A <b>process pool</b> or <b>thread pool</b> reuses workers instead of creating them for each query, and a bounded pool is what protects a server from overload. An <b>embedded</b> database runs inside the application&rsquo;s own process, and uses its threads, which is how DuckDB works (chapter 28).</p>

<h3>4. Scheduling on many cores and sockets (15-721)</h3>
<p>The 721 lecture asks how an OLAP engine keeps every core busy without moving data around. It allocates <b>one worker per core</b> and pins it. <b>Data placement</b> matters on NUMA machines: memory attached to another socket is slower to read, so a worker should read memory near its own socket. <b>Task assignment</b> is either static, partitioning the input once up front, which suffers when slices differ in speed, or dynamic, handing out small tasks as workers free up. The <b>morsel-driven</b> design of HyPer cuts the input of a pipeline into morsels of about 100,000 tuples. A dispatcher keeps morsel lists per socket. A worker takes a morsel near its socket, and only <b>steals</b> a far one when its own socket has none left, so it never sits idle and it rarely reads remote memory. Because the morsel size is the unit of work, the degree of parallelism of a running query can change at morsel boundaries, and a short query can be served in between. SQLOS, in SQL Server, goes further and gives the database its own user-level scheduler, so it controls what runs on each core instead of the operating system.</p>
<figure class="mm" aria-label="Flowchart of morsel dispatch: cut input into morsels, dispatcher lists per socket, worker takes local morsel or steals" style="--diagram-width:360px">
  <img src="diagrams/ch12-morsel-dispatch.svg" alt="Flowchart: a pipeline of a query has its input cut into morsels of about 100 thousand tuples. A dispatcher keeps morsel lists per NUMA socket. A worker on each socket takes a local morsel. If local morsels remain it takes the next local one, otherwise it steals a morsel from the other socket.">
  <figcaption>Flowchart: workers pull small units of work and prefer their own socket.</figcaption>
</figure>

<h3>5. I/O parallelism</h3>
<p>Compute is only half of it. If the data sits on one disk, many workers wait on it. <b>I/O parallelism</b> spreads the table over several disks or devices: multiple disks per database, a table split by partitioning across devices, or striping, so reads from different workers go to different devices. In the cloud the same idea means many files in an object store read by many workers.</p>

<h3>6. Flow control</h3>
<p>Pipelines can produce faster than the next stage consumes. <b>Flow control</b> keeps the system stable: a bounded queue that blocks or slows the producer (back pressure), and limits on how many morsels or batches are in flight, so memory does not grow without bound.</p>

<h3>7. The trade-off</h3>
<p>More workers mean a faster single query until memory bandwidth, the exchange or the cores run out, and they reduce the capacity left for other queries. Static partitioning is simple and suffers from stragglers. Dynamic morsels balance load and need a dispatcher. A bounded pool protects the server and makes some queries wait.</p>

<h3>8. Syntax</h3>
<pre>-- PostgreSQL: how many workers a query may use
SHOW max_parallel_workers_per_gather;
SET max_parallel_workers_per_gather = 8;

EXPLAIN (ANALYZE)
SELECT country, sum(price) FROM orders GROUP BY country;
--   Finalize HashAggregate
--     -&gt; Gather  (Workers Planned: 4  Workers Launched: 4)
--          -&gt; Partial HashAggregate
--               -&gt; Parallel Seq Scan on orders

-- a function that blocks parallelism
CREATE FUNCTION tier(x numeric) RETURNS text ... PARALLEL SAFE;</pre>
<p><code>Workers Planned</code> larger than <code>Workers Launched</code> means the server ran out of worker slots, a sign of too many concurrent queries.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A 32-core analytics server runs one nightly query that keeps a single core at 100% for two hours while 31 cores sit idle (illustrative). During the day, 500 dashboard queries arrive together, each spawning 16 threads, and p99 latency climbs from 2 seconds to 90 seconds although CPU use is high and throughput has dropped.`,
    predict: {
      q: `A scan and aggregate runs on 8 workers, each reading its own slice and computing SUM per country. What must happen before the result is correct?`,
      opts: [
        `The partial sums of each country must be brought together, by an exchange on the country key, and added`,
        `Nothing: each worker's result is already complete, so the results are concatenated`,
        `The workers must sort all rows by country before they start`,
        `Every worker must read the whole table, so its sums are complete`
      ],
      ans: 0,
      why: `A country can occur in every slice, so each worker has only a partial sum for it. The partial results are repartitioned by country, so one worker holds all the partials of a country, and then added.`
    },
    diagnose: [
      {
        t: 'One core busy, the rest idle',
        sym: '<b>A long query</b> uses one core while the server is otherwise idle.',
        ctx: 'The plan has no parallel nodes. A function in the query is marked parallel unsafe, or the parallel degree is set to 0.',
        why: 'The planner only parallelises when every operator and function is safe to run in workers and when the table is large enough. One unsafe function keeps the whole plan serial.',
        log: `-- representative, illustrative
Seq Scan on events  (Workers Planned: 0)
  Filter: (tier(amount) = 'gold')       -- tier() is PARALLEL UNSAFE
top: 1 core at 100%, 31 idle`,
        note: 'A Gather node in the plan means parallel. No Gather on a big scan means something prevented it.',
        fix: [
          'Measure first: read the plan for <code>Gather</code> and <code>Workers Planned</code>, and check CPU per core.',
          'Mark functions that are safe as <code>PARALLEL SAFE</code> after checking they have no side effects.',
          'Raise <code>max_parallel_workers_per_gather</code> and check <code>parallel_setup_cost</code> for large tables.',
          'Verify: the plan should show Gather with workers launched, and the elapsed time should fall in line with the worker count.'
        ]
      },
      {
        t: 'Thread oversubscription',
        sym: '<b>CPU is high</b>, throughput falls and p99 latency explodes as concurrency rises.',
        ctx: 'Each of 500 queries starts 16 threads, so thousands of runnable threads compete for 32 cores.',
        why: 'Beyond the core count, extra threads add context switches and cold caches and use memory, but no useful work. A bounded pool with a queue does the same work with less overhead.',
        log: `-- representative, illustrative
load average: 412   threads: 8,160   context switches: 1.9M/s
queries/s: 11 (was 38 at 32 concurrent)`,
        note: 'A load average many times the core count together with falling throughput is oversubscription.',
        fix: [
          'Measure first: compare running threads to cores, and read context switches per second.',
          'Cap concurrent queries with a connection pool or admission control, sized near the core count.',
          'Reduce the degree of parallelism per query when many queries run at once.',
          'Verify: throughput at 500 clients should return near its peak, with a longer queue and a shorter service time.'
        ]
      },
      {
        t: 'Straggler worker',
        sym: '<b>A parallel query</b> waits for one worker long after the others have finished.',
        ctx: 'The input was split once into equal-sized slices, but one slice has a hot key or slow storage, so its worker takes five times longer.',
        why: 'With static partitioning the stage ends only when the slowest worker ends. Idle workers cannot help, because their slice is done and the remaining work is owned by someone else.',
        log: `-- representative per-worker timings, illustrative
worker 1: 41 s   worker 2: 39 s   worker 3: 44 s   worker 4: 212 s`,
        note: 'One worker far above the median is a straggler, not a capacity problem.',
        fix: [
          'Measure first: compare per-worker time and rows processed in the query profile.',
          'Use morsel-style dynamic assignment, so idle workers take pending small tasks.',
          'Break up skew: choose a different partition key, or split hot keys across workers.',
          'Verify: per-worker times should be within a small factor of each other.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[12] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [exch, morsel, pool] };
})();
