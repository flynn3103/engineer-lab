/* Chapter 9 "Index Concurrency Control" (index 8, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L10 Index Concurrency Control (locks vs latches, latch implementations, hash table and B+ tree latching).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: latch crabbing down a tree, a mutex against a reader-writer latch on a timeline, and sixteen writers queueing on the rightmost leaf. Numbers illustrative. */
(function () {
  const DB = window.DB;
  const SOURCE = { label: 'CMU 15-445 L10 Index Concurrency Control (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/10-indexconcurrency.pdf' };

  /* ---- 3. Hot leaf: increasing keys put every writer on the rightmost leaf ---- */
  const LX = j => 30 + j * 72, LYY = 262;
  const tpos = (i, mode) => {
    if (mode === 'idle') return { x: 30 + (i % 8) * 70, y: 96 + Math.floor(i / 8) * 28 };
    if (mode === 'hot') return { x: 490 + (i % 4) * 34, y: 122 + Math.floor(i / 4) * 28 };
    return { x: LX(i % 8) + 12, y: 160 + Math.floor(i / 8) * 40 };
  };
  const hot = {
    id: 'hot-leaf', label: 'Rightmost leaf', desc: 'Sixteen writers insert one key each into an index of eight leaves. Always-increasing keys all land on the last leaf and take its latch one by one (illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'INSERT INTO orders (id, ...) VALUES (nextval(\'orders_id_seq\'), ...);   -- 16 writers',
      '-- every new id is larger than any existing id: it goes to the rightmost leaf',
      '-- one write latch per leaf: 1 writer holds it, 15 wait',
      'CREATE INDEX orders_shard_idx ON orders ((id % 8), id);   -- spread by shard',
      '-- 8 leaves take writes at once; range scans on id now need 8 probes',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 16 writers, 8 leaves, one latch per leaf. Illustrative.',
      header: s => ({ left: 'latch waits per round: ' + (s.waits == null ? '-' : s.waits), right: s.shard ? 'key = (id % 8, id)' : 'key = id (increasing)' }),
      draw(P, s) {
        for (let j = 0; j < 8; j++) {
          const isHot = s.mode === 'hot' && j === 7;
          P.box('lf' + j, { x: LX(j), y: LYY, w: 66, h: 44, tone: isHot ? 'bad' : (s.mode === 'spread' ? 'ok' : 'mut'), label: 'leaf ' + (j + 1), cls: 'xs', sw: isHot ? 3 : 1.4 });
          P.text('lr' + j, { x: LX(j) + 33, y: LYY + 60, t: s.shard ? 'id%8=' + j : (j === 7 ? 'newest ids' : ''), cls: 'mut xs', anchor: 'middle' });
        }
        for (let i = 0; i < 16; i++) {
          const p = tpos(i, s.mode || 'idle');
          let tone = 'info';
          if (s.mode === 'hot') tone = i === 0 ? 'ok' : 'bad';
          if (s.mode === 'spread') tone = i < 8 ? 'ok' : 'warn';
          P.chip('t' + i, { x: p.x, y: p.y, w: 36, h: 22, label: 't' + (i + 1), tone, small: true, hl: false });
        }
      }
    }),
    bug: [
      { log: 'An index on orders.id has eight leaves. Sixteen writer threads are about to insert one new order each.', callout: '16 writers, 8 leaves', code: 0,
        state: { mode: 'idle' }, stats: [{ l: 'writers', v: '16' }, { l: 'leaves', v: '8' }] },
      { log: 'Each new id comes from a sequence, so it is larger than every key already in the index.', callout: 'Every new id is the largest so far', code: 1,
        state: { mode: 'idle' }, stats: [{ l: 'new id vs index', v: 'always bigger', cls: 'warn' }] },
      { log: 'The tree sends all sixteen writers to the rightmost leaf, the only leaf that holds the largest keys.', callout: 'All 16 head for the last leaf', code: 1,
        state: { mode: 'hot' }, stats: [{ l: 'writers on leaf 8', v: '16', cls: 'bad' }] },
      { log: 'A leaf allows one writer at a time, so one thread holds the latch and fifteen wait. The other seven leaves sit idle.', callout: '1 holds the latch, 15 wait', moment: true, code: 2,
        state: { mode: 'hot', waits: 15 }, stats: [{ l: 'latch waits', v: '15', cls: 'bad' }, { l: 'idle leaves', v: '7', cls: 'warn' }] },
      { log: 'Prefix the key with a shard number, id % 8. Writers with different ids now land on different leaves.', callout: 'Prefix the key with a shard number', code: 3,
        state: { mode: 'spread', shard: 1 }, stats: [{ l: 'leaves taking writes', v: '8', cls: 'ok' }] },
      { log: 'Each leaf has two writers. One holds its latch and one waits, so eight writers proceed at once and eight wait.', callout: '8 waits instead of 15, 8 writers in parallel', code: 4,
        state: { mode: 'spread', shard: 1, waits: 8 }, stats: [{ l: 'latch waits', v: '8', cls: 'ok' }, { l: 'parallel writers', v: '8', cls: 'ok' }] },
      { log: 'The trade-off: a range scan over ids must now probe all eight shards and merge the results. Keep the plain key if ranges matter more than write rate.', callout: 'Range scans now probe 8 shards', code: 4,
        state: { mode: 'spread', shard: 1, waits: 8 }, stats: [{ l: 'range scan probes', v: '8', cls: 'warn' }, { l: 'write contention', v: 'lower', cls: 'ok' }],
        takeaway: 'Increasing keys make one hot leaf. Spreading the key trades range-scan locality for write parallelism.' },
    ],
  };


  /* ---- 1. Latch crabbing: hold the parent only until the child is known to be safe ---- */
  const ND = { R: { x: 252, y: 92, w: 110 }, A: { x: 105, y: 160, w: 110 }, B: { x: 400, y: 160, w: 110 }, L1: { x: 40, y: 232, w: 110 }, L2: { x: 170, y: 232, w: 110 }, L3: { x: 330, y: 232, w: 110 }, L4: { x: 470, y: 232, w: 110 } };
  const EDGES = [['R', 'A'], ['R', 'B'], ['A', 'L1'], ['A', 'L2'], ['B', 'L3'], ['B', 'L4']];
  const crab = {
    id: 'latch-crabbing', label: 'Latch crabbing', desc: 'Thread T1 inserts into leaf L2. It latches the child before it lets go of the parent, and lets go of every ancestor once the child is safe. A second thread T2 waits only while T1 holds a latch on its path (illustrative tree).',
    codeLabel: 'Protocol',
    code: { bug: [
      'T1: insert key into leaf L2.  Latch the root in write mode.',
      'latch child A; A is not full, so a split cannot reach the root: release the root',
      'T2 (insert under B) now descends through the root freely',
      'latch leaf L2; L2 has room: release A, insert the key, release L2',
      'if A had been full, T1 must keep the root latched, and T2 waits at the root',
      'improved: take read latches down to the leaf, a write latch only on the leaf',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 7 nodes, two threads. A safe node is one that will not split or merge.',
      header: s => ({ left: s.hl || 'T1 inserts into L2', right: s.rt || '' }),
      draw(P, s) {
        EDGES.forEach(([a, b], i) => P.line('e' + i, ND[a].x + ND[a].w / 2, ND[a].y + 40, ND[b].x + ND[b].w / 2, ND[b].y, { tone: 'mut', sw: 1.4 }));
        Object.entries(ND).forEach(([k, n]) => {
          const full = (s.full || []).includes(k);
          P.chip('n' + k, { x: n.x, y: n.y, w: n.w, h: 40, label: k === 'R' ? 'root' : k.length === 1 ? 'inner ' + k : 'leaf ' + k.slice(1), sub: full ? 'full' : 'has room', tone: full ? 'warn' : 'info' });
        });
        Object.entries(s.latch || {}).forEach(([k, arr]) => arr.forEach(([who, mode], j) => P.chip('lt' + k + j, { x: ND[k].x + ND[k].w - 54 + j * 0, y: ND[k].y - 14 - j * 18, w: 62, h: 20, label: mode + ' ' + who, sub: '', tone: who === 'T1' ? 'cursor' : (s.wait ? 'bad' : 'live'), small: true })));
        if (s.wait) P.chip('wt', { x: 440, y: 92, w: 170, h: 34, label: 'T2 waits at the root', sub: '', tone: 'bad', small: true });
        if (s.note) P.chip('nt', { x: 40, y: 306, w: 330, h: 30, label: s.note, sub: '', tone: s.noteTone || 'ok', small: true });
      }
    }),
    bug: [
      { log: 'T1 wants to insert a key into leaf L2. It starts at the root and takes a write latch there. Nobody else can change the root now.', callout: 'T1 latches the root', code: 0,
        state: { latch: { R: [['T1', 'W']] } }, stats: [{ l: 'T1 holds', v: 'root' }] },
      { log: 'T1 latches the child A before it releases the root, so no other thread can slip a split in between. A has room, so A is safe: an insert below it can split at most A’s children, never A.', callout: 'The child A has room: it is safe', code: 1,
        state: { latch: { R: [['T1', 'W']], A: [['T1', 'W']] }, hl: 'A is safe', note: 'A has room: nothing above A can change' }, stats: [{ l: 'T1 holds', v: 'root, A' }] },
      { log: 'Because A is safe, T1 releases the root. The root is latched for only a moment, so it does not become a bottleneck.', callout: 'Release the root', moment: true, code: 1,
        state: { latch: { A: [['T1', 'W']] }, hl: 'root released' }, stats: [{ l: 'T1 holds', v: 'A' }, { l: 'root latched', v: 'no', cls: 'ok' }] },
      { log: 'T2 inserts under B. It passes through the root with no wait, because T1 has already released it. The two writers work in parallel.', callout: 'T2 descends in parallel', code: 2,
        state: { latch: { A: [['T1', 'W']], B: [['T2', 'W']] }, hl: 'T2 passes the root', note: 'two inserts at once', noteTone: 'ok' }, stats: [{ l: 'writers running', v: '2', cls: 'ok' }] },
      { log: 'T1 latches leaf L2. It has room, so it is safe too. T1 releases A, inserts the key and releases L2.', callout: 'Leaf has room: insert, release', code: 3,
        state: { latch: { L2: [['T1', 'W']], B: [['T2', 'W']] }, hl: 'T1 at the leaf', note: 'L2 has room: release A, insert' }, stats: [{ l: 'splits', v: '0', cls: 'ok' }] },
      { log: 'Now suppose A is full. T1 cannot release the root after latching A, because a split of L2 could split A and then need to change the root. It keeps both latches.', callout: 'A full node is unsafe: keep the ancestors', moment: true, code: 4,
        state: { full: ['A'], latch: { R: [['T1', 'W']], A: [['T1', 'W']] }, hl: 'A is full: unsafe', note: 'T1 keeps the root latched' }, stats: [{ l: 'T1 holds', v: 'root, A', cls: 'warn' }] },
      { log: 'T2 now stops at the root and waits for as long as T1 works below. That is the price of a split that may travel up.', callout: 'T2 waits at the root', code: 4,
        state: { full: ['A'], latch: { R: [['T1', 'W'], ['T2', 'W']], A: [['T1', 'W']] }, wait: 1, hl: 'T2 blocked', note: 'a rare case: only full nodes' , noteTone: 'warn' }, stats: [{ l: 'T2', v: 'waiting', cls: 'bad' }] },
      { log: 'The improved protocol assumes splits are rare. It takes read latches down to the leaf, a write latch only on the leaf, and restarts with write latches only if the leaf turns out to be full.', callout: 'Optimistic: read latches, write on the leaf', code: 5,
        state: { latch: { R: [['T1', 'R']], A: [['T1', 'R']], L2: [['T1', 'W']] }, hl: 'improved protocol', note: 'root held in read mode: others share it', noteTone: 'ok' }, stats: [{ l: 'root mode', v: 'read, shared', cls: 'ok' }],
        takeaway: 'Crabbing holds a parent only until the child is safe. Optimistic crabbing assumes splits are rare and takes write latches only where they are needed.' },
    ],
  };

  /* ---- 2. Reader-writer latch: a mutex serializes readers, a shared mode lets them overlap ---- */
  const TX0 = 100, TU = 48;
  const rows = ['T1 read', 'T2 read', 'T3 read', 'T4 read', 'T5 write', 'T6 read', 'T7 read'];
  const gy = i => 96 + i * 34;
  const bar = (i, a, b, tone, label) => ({ i, a, b, tone, label });
  const rw = {
    id: 'rw-latch', label: 'Reader-writer latch', desc: 'Four readers and one writer each need the latch for two time units. A mutex runs them one at a time. A reader-writer latch lets readers share it, and its waiting policy decides whether the writer ever gets in (time units illustrative).',
    codeLabel: 'Policy',
    code: { bug: [
      '4 readers and 1 writer arrive together, each needs the latch for 2 units',
      'mutex: one holder at a time -> 5 x 2 = 10 units',
      'reader-writer latch: readers share, the writer waits for them -> 4 units',
      'reader-preferred: new readers keep joining, the writer starves',
      'fair or writer-preferred: new readers queue behind the waiting writer',
    ] },
    stage: DB.stage({
      footer: 'Simplified: bars are time the latch is held. Illustrative.',
      header: s => ({ left: s.hl || 'time on the latch', right: s.rt || '' }),
      draw(P, s) {
        for (let t = 0; t <= 10; t += 2) { P.line('g' + t, TX0 + t * TU, 84, TX0 + t * TU, 336, { tone: 'mut', sw: 0.6, dash: true }); P.text('gt' + t, { x: TX0 + t * TU, y: 350, t: String(t), cls: 'mut xs', anchor: 'middle' }); }
        rows.forEach((r, i) => { if (i < (s.nrows || 5)) P.text('r' + i, { x: 10, y: gy(i) + 20, t: r, cls: 'mut sm' }); });
        (s.bars || []).forEach(b => P.box('b' + b.i + '_' + b.a, { x: TX0 + b.a * TU, y: gy(b.i), w: (b.b - b.a) * TU - 2, h: 28, tone: b.tone, label: b.label || '', cls: 'xs', dash: b.tone === 'mut' }));
        if (s.end != null) { P.line('end', TX0 + s.end * TU, 84, TX0 + s.end * TU, 336, { tone: s.endTone || 'cursor', sw: 2.4 }); P.chip('endc', { x: Math.min(TX0 + s.end * TU - 40, 560), y: 66, w: 90, h: 24, label: 'done at ' + s.end, sub: '', tone: s.endTone || 'cursor', small: true }); }
      }
    }),
    bug: [
      { log: 'Four readers and one writer all want the latch at time 0. Each needs it for two units.', callout: 'Four readers, one writer', code: 0,
        state: { bars: [] }, stats: [{ l: 'readers', v: '4' }, { l: 'writers', v: '1' }] },
      { log: 'With a plain mutex only one thread holds the latch at a time. The readers queue one behind another even though reading does not conflict with reading.', callout: 'A mutex serializes the readers', code: 1,
        state: { bars: [bar(0, 0, 2, 'info', 'T1'), bar(1, 2, 4, 'info', 'T2'), bar(2, 4, 6, 'info', 'T3'), bar(3, 6, 8, 'info', 'T4'), bar(4, 8, 10, 'warn', 'T5 write')], end: 10, endTone: 'bad' }, stats: [{ l: 'total', v: '10 units', cls: 'bad' }] },
      { log: 'A reader-writer latch has a shared read mode. The four readers hold it together from 0 to 2. The writer needs it exclusively, so it enters when the readers leave.', callout: 'Readers share the latch', moment: true, code: 2,
        state: { bars: [bar(0, 0, 2, 'ok', 'T1'), bar(1, 0, 2, 'ok', 'T2'), bar(2, 0, 2, 'ok', 'T3'), bar(3, 0, 2, 'ok', 'T4'), bar(4, 2, 4, 'warn', 'T5 write')], end: 4, endTone: 'ok' }, stats: [{ l: 'total', v: '4 units', cls: 'ok' }] },
      { log: 'Now new readers T6 and T7 keep arriving. Under a reader-preferred policy they are let in beside the current readers, so the writer waits behind an unending stream.', callout: 'Reader-preferred: the writer starves', code: 3,
        state: { nrows: 7, bars: [bar(0, 0, 2, 'ok', 'T1'), bar(1, 0, 2, 'ok', 'T2'), bar(2, 0, 2, 'ok', 'T3'), bar(3, 0, 2, 'ok', 'T4'), bar(5, 1, 3, 'ok', 'T6'), bar(6, 2, 4, 'ok', 'T7'), bar(4, 0, 4, 'mut', 'T5 waiting'), bar(4, 4, 6, 'warn', 'write')], end: 6, endTone: 'bad', hl: 'reader-preferred policy' }, stats: [{ l: 'writer wait', v: '4 units', cls: 'bad' }] },
      { log: 'A fair or writer-preferred policy makes a reader that arrives after a waiting writer queue behind it. The writer goes in as soon as the current readers finish.', callout: 'Fair queue: the writer goes next', code: 4,
        state: { nrows: 7, bars: [bar(0, 0, 2, 'ok', 'T1'), bar(1, 0, 2, 'ok', 'T2'), bar(2, 0, 2, 'ok', 'T3'), bar(3, 0, 2, 'ok', 'T4'), bar(4, 2, 4, 'warn', 'T5 write'), bar(5, 4, 6, 'info', 'T6'), bar(6, 4, 6, 'info', 'T7')], end: 6, endTone: 'ok', hl: 'fair policy' }, stats: [{ l: 'writer wait', v: '2 units', cls: 'ok' }],
        takeaway: 'Use a reader-writer latch when reads dominate, and pick the waiting policy on purpose: unfair queues can starve the writer.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Two kinds of correctness</h3>
<p>Until now each structure was single-threaded. A real server runs many threads, to use many cores and to hide disk waits. A <b>concurrency control protocol</b> keeps a shared structure correct under concurrent access. There are two meanings of correct. <b>Logical correctness</b> says a thread reads what it should: it sees its own earlier write. <b>Physical correctness</b> says the structure itself is sound: no pointer leads to freed memory, no node is half-split. This chapter is only about physical correctness. Logical correctness, the job of transactions, is the topic of chapters 20 to 23.</p>

<h3>2. Locks and latches are different tools</h3>
<p>A <b>lock</b> is a high-level, logical primitive. It protects database contents, such as a row or a table, from other transactions, and a transaction holds it for its whole life. The system can show you the locks, and a lock manager detects deadlocks and rolls back a transaction. A <b>latch</b> is a low-level primitive that protects an internal structure, such as a page or a hash bucket, from other threads. It is held for a short operation. There is no deadlock detector for latches: avoiding deadlock is the programmer’s job. A latch has two modes. In <b>read</b> mode many threads may hold it. In <b>write</b> mode exactly one may, and no reader may.</p>

<h3>3. How a latch is built</h3>
<p>Every latch rests on an atomic CPU instruction such as <b>compare-and-swap</b> (CAS): set a word to a new value only if it still holds the expected one, as one indivisible step.</p>
<figure class="mm" aria-label="Sequence diagram: two threads try to compare-and-swap a latch word; one wins and the other retries" style="--diagram-width:710px">
  <img src="diagrams/ch08-cas-latch.svg" alt="Sequence diagram: thread 1 and thread 2 both compare-and-swap the latch word from 0 to 1. Thread 1 succeeds and the word becomes 1. Thread 2 fails because the word was already 1, and spins or sleeps. Thread 1 stores 0 to release, and thread 2 retries and succeeds.">
  <figcaption>Sequence: a latch is one word and one atomic instruction. The loser decides how to wait.</figcaption>
</figure>
<p>A <b>spin latch</b> retries in a loop. It is cheap and a single instruction to release, but under contention threads burn CPU and bounce the cache line between cores. An <b>OS mutex</b> (on Linux a futex) puts a waiting thread to sleep. It is simple and costs around 25 ns per call and an OS context switch on contention, which is why it is rarely used in the hot path. A <b>reader-writer latch</b> builds on one of these and adds read and write queues, with a waiting policy: reader-preferred (writers can starve), writer-preferred, or fair. Page latches protect a whole page and give less parallelism. Slot latches give more and cost memory. A static linear-probing hash table can even be latch-free with CAS on slots, because every thread moves in the same direction and no deadlock is possible.</p>

<h3>4. B+ tree latching: crabbing</h3>
<p>A tree needs more care, because a thread must not read a node while another splits it, and two threads must not edit the same node. <b>Latch crabbing</b> (or coupling) solves it. Latch the parent, then the child, then release the parent if the child is <b>safe</b>: a node that will not split, merge or redistribute after the operation. For an insert, safe means not full. For a delete, safe means more than half full. Reads need no safety check: they release the parent as soon as the child is latched. Releasing the highest latches first helps most, because they block access to the most leaves.</p>
<figure class="mm" aria-label="Flowchart of the latch crabbing protocol: latch child, check safe, release ancestors or keep them" style="--diagram-width:392px">
  <img src="diagrams/ch08-crabbing-flow.svg" alt="Flowchart: latch the root, then latch the child. If the child is safe, release every ancestor latch. If not, keep the ancestor latches because a split or merge may reach them. Repeat until the leaf, then do the insert or delete and release all latches.">
  <figcaption>Flowchart: the basic crabbing protocol for an insert or delete.</figcaption>
</figure>
<p>The basic protocol always takes a write latch on the root for any insert or delete, which limits parallelism. The <b>improved</b> protocol assumes splits are rare. It takes read latches down to the leaf and a write latch on the leaf only, and if the leaf is not safe it releases everything and restarts with the basic protocol. Descents always go top-down, so they cannot deadlock each other.</p>

<h3>5. Leaf scans can deadlock</h3>
<p>A range scan moves sideways along the leaves, which is the opposite direction to a descent. A scan holding leaf 3 and wanting leaf 4 can meet an insert holding leaf 4 and wanting leaf 3. Latches have no deadlock detection, so the scan uses a <b>no-wait</b> acquisition: if the sibling latch is not free, it releases what it holds and restarts the operation, perhaps after a short wait.</p>

<h3>6. Hot spots</h3>
<p>Latching is correct and has a cost: a thread that wants a latch another thread holds waits. If all inserts go to the same leaf, they all queue on its latch, however many cores you have. Monotonically increasing keys, such as an auto-increment id or a timestamp, do exactly that: every insert goes to the rightmost leaf.</p>

<h3>7. The trade-off</h3>
<p>A coarse latch is simple and limits parallelism. A fine latch raises parallelism and costs memory and code complexity. Read-mostly structures gain from shared modes and risk writer starvation. Optimistic protocols win when conflicts are rare and pay a restart when they are not. Spreading the keys, or splitting an index into partitions, removes a hot spot at the cost of locality for range scans.</p>

<h3>8. Syntax</h3>
<pre>-- PostgreSQL: where do backends wait on index structures
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity WHERE state = 'active' GROUP BY 1, 2 ORDER BY 3 DESC;
--   LWLock | BufferContent   (waiting for a page latch)
--   LWLock | BufferMapping   (waiting for the page table)

-- MySQL InnoDB: latch contention on indexes and buffer pool
SHOW ENGINE INNODB STATUS\G
--   RW-shared spins ... RW-excl spins ...   (counts of latch spins and waits)

-- spread an increasing key (hash prefix) so inserts hit several leaves
CREATE INDEX orders_spread ON orders ((id % 8), id);</pre>
<p>When many backends wait on <code>BufferContent</code> for the same relation, look for a hot leaf before you add cores.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `An orders table with an auto-increment primary key takes 40,000 inserts per second on a 32-core server (illustrative). Throughput stops improving past 4 client connections, CPU is 30% busy, and the profiler shows most threads waiting on a latch for the same index page. A nightly report that scans a key range sometimes restarts part-way.`,
    predict: {
      q: `A thread inserting into a B+ tree holds a write latch on the root and has just latched child A, which is not full. What should it do with the root latch?`,
      opts: [
        `Release it: A is safe, so a split below A cannot reach the root`,
        `Keep it until the insert is done, in case the leaf splits`,
        `Keep it, and release A instead, because the root is more important`,
        `Convert it to a lock, so a transaction can keep it`
      ],
      ans: 0,
      why: `A node is safe when an insert below it cannot make it split. A has room, so any split stops at or below A, and nothing above A needs to change. Releasing the root early lets other threads through it.`
    },
    diagnose: [
      {
        t: 'Sequential keys',
        sym: '<b>Every insert</b> lands on the rightmost leaf, and most threads wait for its latch.',
        ctx: 'The primary key is increasing, so each insert goes to the last leaf. Sixteen writers each add one key per round, and they take the one write latch of that leaf in turn.',
        why: 'A leaf has one write latch, and a new key always belongs after every existing key. Parallel writers all aim at the same page, so they queue regardless of core count.',
        log: `-- representative latch summary, counts illustrative
index orders_pkey, leaf 8 (rightmost)
threads: 16, inserts per round: 16
latch waits per round: 15`,
        note: 'Waits that are almost one less than the number of threads, all on one page, mean a hot leaf.',
        fix: [
          'Measure first: find the page the waits are on, for example the wait event with the relation name, and check whether it is the rightmost leaf.',
          'Spread the writes: a hash or shard prefix on the key, such as <code>(id % 8, id)</code>, puts the writers on several leaves.',
          'Or partition the table so each partition has its own index and its own rightmost leaf.',
          'Be aware of the cost: a range scan on id now probes every shard, and random keys such as UUID v4 trade a hot leaf for scattered page writes.',
          'Verify: the latch waits per round and the insert throughput at 16 clients, before and after.'
        ]
      },
      {
        t: 'Spin latch under contention',
        sym: '<b>CPU is near 100%</b>, but throughput is flat, and the profile shows time inside latch acquisition.',
        ctx: 'Many threads spin on one latch word. They all execute compare-and-swap in a loop, and the cache line holding the latch moves between cores.',
        why: 'A spin latch does no useful work while it waits. With many waiters the wasted instructions and cache-line traffic grow, so adding threads reduces throughput.',
        log: `-- representative profile, counts illustrative
 61.2%  s_lock / spin_delay     (waiting for a latch)
 18.7%  index insert
cpu: 98%   throughput: 40k/s (was 55k/s with 8 threads)`,
        note: 'More threads and less throughput is the sign of waiting that burns CPU.',
        fix: [
          'Measure first: sample wait events or profile the process, and compute the share of time spent acquiring latches.',
          'Reduce sharing: shard the hot structure so threads contend on different latches.',
          'Use a reader-writer latch for read-heavy structures, and add backoff or a queue to spinning.',
          'Limit the active connections with a pool, so fewer threads compete at once.',
          'Verify: throughput should rise with the thread count again, or at least not fall.'
        ]
      },
      {
        t: 'Range scan restarts',
        sym: '<b>A long range scan</b> restarts, and its elapsed time varies from run to run.',
        ctx: 'The scan walks leaf siblings left to right while inserts and deletes descend from the root. When it cannot get the next leaf latch, it must not wait.',
        why: 'A scan acquires latches sideways and a writer acquires them top-down, so waiting could deadlock and latches have no deadlock detection. The scan uses a no-wait acquisition and restarts when the latch is busy, so a busy range makes it restart repeatedly.',
        log: `-- representative counters, illustrative
btree_scan_restarts: 1,204   scans: 36
slowest scan: 14.2 s (typical 2.1 s)`,
        note: 'Restarts concentrated on a hot key range point to contention between the scan and writers.',
        fix: [
          'Measure first: count restarts per scan and note which key ranges they come from.',
          'Run the long scan on a replica or from a snapshot, away from the write path.',
          'Break one big scan into smaller key ranges, so a restart repeats little work.',
          'Move the writes that hit the same range to another time or another partition.',
          'Verify: restarts per scan and the p99 scan time over several runs.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[8] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [crab, rw, hot] };
})();
