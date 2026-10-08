/* Chapter 2 "Iterator Execution": three bespoke scenes plus the Explain text (index 2, zero-based).
   Loads after course.js and scene-kit.js. Row counts and timings are illustrative; the pull model is PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: 20 chips stand for the table. All numbers are illustrative.';
  const PAGES = 20;

  /* A plan tree (Limit, optional Sort, Scan), a row-count meter and a strip of table pages. */
  function planSetup(kit, opt) {
    const lim = kit.chip(null, { x: 16, y: 76, w: 220, h: 46, label: 'Limit', sub: opt.limSub || 'LIMIT 5', tone: 'info' });
    const mid = kit.chip(null, { x: 16, y: 136, w: 220, h: 46, label: opt.midLabel || 'Sort', sub: opt.midSub || 'top-N heapsort', tone: 'info', show: false });
    const scan = kit.chip(null, { x: 16, y: 196, w: 220, h: 46, label: opt.scanLabel || 'Seq Scan', sub: opt.scanSub || 'orders', tone: 'info' });
    const bars = kit.bars(null, { x: 270, y: 100, w: 354, labelW: 96, max: 100, items: opt.items, title: opt.barsTitle || 'Rows pulled (EXPLAIN ANALYZE: rows)' });
    const pages = kit.strip(null, { x: 16, y: 296, items: Array.from({ length: PAGES }, (_, i) => ({ id: 'p' + i, label: '' })), w: 26, h: 22, gap: 4, tone: 'info' });
    const res = kit.chip(null, { x: 16, y: 262, w: 608, h: 26, label: '', tone: 'info', small: true, show: false });
    return { lim, mid, scan, bars, pages, res };
  }
  function planFrame(s, R) {
    const read = s.read || 0;
    Object.values(R.pages).forEach((c, i) => c.set({ tone: i < read ? (s.pgTone || 'cursor') : s.stopped ? 'dim' : 'info' }));
    R.lim.set({ tone: s.limT || 'info' }); R.scan.set({ tone: s.scanT || 'info' });
    R.mid.set({ show: !!s.sort, tone: s.midT || 'info', sub: s.midSub || 'top-N heapsort' });
    R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
  }

  /* ---------- 1. LIMIT without a blocking node stops the scan ---------- */
  const streams = {
    id: 'streams', label: 'LIMIT with no sort', desc: 'Without a blocking node, each row travels up as soon as the scan returns it. LIMIT stops after five pulls.',
    codeLabel: 'SQL', code: { bug: ['SELECT * FROM orders LIMIT 5;', '-- Limit', '--   -> Seq Scan on orders', '-- the client pulls one row at a time'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'plan A · Seq Scan → Limit', right: s.r || '' }),
      setup(kit) { return planSetup(kit, { items: [{ id: 'lim', label: 'Limit' }, { id: 'scan', label: 'Seq Scan' }] }); },
      frame(s, kit, R) {
        planFrame(s, R);
        R.scan.set({ y: 150 }); R.lim.set({ y: 90 });
        R.bars.set('lim', Math.min(s.n || 0, 5) * 20, s.n >= 5 ? 'ok' : 'warn', String(Math.min(s.n || 0, 5)));
        R.bars.set('scan', (s.n || 0) * 20, 'warn', String(s.n || 0));
      }
    },
    bug: [
      { log: 'The client asks the top node, Limit, for its first row. Nothing has been read yet.', callout: 'The client pulls: Limit asks the scan', code: 0, state: { limT: 'cursor', r: 'pull 0' }, stats: [{ l: 'rows pulled', v: '0' }, { l: 'pages read', v: '0', cls: 'ok' }] },
      { log: 'The Seq Scan reads the first page and returns one row. Limit passes it straight up, without waiting for more.', callout: 'One row up, nothing held back', code: 1, state: { n: 1, read: 1, scanT: 'cursor', r: 'pull 1' }, stats: [{ l: 'rows pulled', v: '1', cls: 'ok' }, { l: 'pages read', v: '1', cls: 'ok' }] },
      { log: 'The client asks again. Each call returns one more row. Streaming nodes hold almost nothing in memory.', callout: 'Streaming nodes hold almost nothing', code: 1, state: { n: 3, read: 1, scanT: 'cursor', r: 'pull 3' }, stats: [{ l: 'rows pulled', v: '3', cls: 'ok' }, { l: 'pages read', v: '1', cls: 'ok' }] },
      { log: 'On the fifth pull Limit has what it needs. It stops asking for rows.', callout: 'Limit has 5 rows and stops pulling', moment: true, code: 0, state: { n: 5, read: 1, limT: 'ok', scanT: 'info', stopped: true, r: 'pull 5' }, stats: [{ l: 'rows pulled', v: '5', cls: 'ok' }, { l: 'pages read', v: '1', cls: 'ok' }] },
      { log: 'The rest of the table is never read. The query finishes in about a millisecond (illustrative).', callout: 'The rest of the table is never read', code: 0, state: { n: 5, read: 1, limT: 'ok', stopped: true, res: 'done in about 1 ms (illustrative): 1 page read, 19 never touched', resTone: 'ok', r: 'done' }, stats: [{ l: 'pages never read', v: '19', cls: 'ok' }],
        takeaway: 'A streaming plan can stop early, because every row travels up the moment it exists.' },
    ],
  };

  /* ---------- 2. ORDER BY ... LIMIT: the Sort blocks ---------- */
  const topn = {
    id: 'top-n', label: 'ORDER BY ... LIMIT 5', desc: 'Sort must read every input row before it can return the first one. The scan cannot stop early, even with LIMIT on top.',
    codeLabel: 'SQL', code: { bug: ['SELECT * FROM orders ORDER BY amount DESC LIMIT 5;', '-- Limit', '--   -> Sort (top-N heapsort, keeps 5 rows)', '--        -> Seq Scan on orders   rows=10000000'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'plan B · Seq Scan → Sort → Limit', right: s.r || '' }),
      setup(kit) { return planSetup(kit, { items: [{ id: 'lim', label: 'Limit' }, { id: 'held', label: 'Sort holds' }, { id: 'scan', label: 'Seq Scan' }] }); },
      frame(s, kit, R) {
        planFrame(s, R);
        R.bars.set('lim', s.out ? 5 * 20 : 0, s.out ? 'ok' : 'ok', String(s.out ? 5 : 0));
        R.bars.set('held', s.held ? 5 * 20 : 0, 'ok', s.held ? '5 rows' : '0');
        R.bars.set('scan', s.scan || 0, s.scan >= 100 ? 'bad' : 'warn', s.lbl || '0');
      }
    },
    bug: [
      { log: 'The client asks Limit for a row. Limit asks Sort. Sort has nothing to return yet, so it asks the scan for a row.', callout: 'Limit asks Sort, Sort asks the scan', code: 1, state: { sort: true, limT: 'cursor', midT: 'cursor', r: 'pull' }, stats: [{ l: 'rows returned', v: '0' }, { l: 'blocking node', v: 'Sort', cls: 'warn' }] },
      { log: 'Sort cannot know the top 5 until it has seen every row. It keeps only 5 rows in a small heap, so memory stays tiny, and pulls again and again.', callout: 'Top-N heapsort: 5 rows in memory, all rows read', code: 2, state: { sort: true, held: true, midT: 'cursor', scanT: 'cursor', scan: 25, lbl: '2.5M', read: 5, r: 'reading' }, stats: [{ l: 'rows pulled', v: '2.5M', cls: 'warn' }, { l: 'Sort holds', v: '5 rows', cls: 'ok' }] },
      { log: 'The scan is halfway through. Nothing has gone up to Limit yet, because any remaining row might be a new top value.', callout: 'Nothing goes up until the input is finished', moment: true, code: 3, state: { sort: true, held: true, midT: 'cursor', scanT: 'cursor', scan: 60, lbl: '6M', read: 12, r: 'reading' }, stats: [{ l: 'rows pulled', v: '6M', cls: 'warn' }, { l: 'rows returned', v: '0' }] },
      { log: 'The scan reaches the last row. All 10 million rows were pulled, and every page of the table was read.', callout: 'The whole table has been read', code: 3, state: { sort: true, held: true, midT: 'warn', scanT: 'bad', scan: 100, lbl: '10M', read: 20, pgTone: 'bad', r: 'scan finished' }, stats: [{ l: 'rows pulled', v: '10M', cls: 'bad' }, { l: 'pages read', v: 'all', cls: 'bad' }] },
      { log: 'Only now does Sort return its 5 rows, one per pull. Limit passes them up and stops. The scan had already finished.', callout: 'Sort finally emits 5 rows', code: 1, state: { sort: true, held: true, out: true, midT: 'ok', limT: 'ok', scan: 100, lbl: '10M', read: 20, pgTone: 'bad', res: 'about 4 s (illustrative) for 5 rows', resTone: 'bad', r: 'done' }, stats: [{ l: 'rows returned', v: '5' }, { l: 'time', v: '~4 s', cls: 'bad' }],
        takeaway: 'A blocking node forces a full read before the first row, whatever LIMIT says.' },
    ],
  };

  /* ---------- 3. OFFSET pagination versus keyset ---------- */
  const page = {
    id: 'offset', label: 'Deep OFFSET vs keyset', desc: 'OFFSET reads and throws away every skipped row. A keyset condition starts at the right place in the index.',
    codeLabel: 'SQL', code: { bug: ['-- page 2000, 50 rows per page (illustrative)', 'SELECT * FROM orders ORDER BY created_at DESC, id DESC', '  OFFSET 100000 LIMIT 50;', '-- keyset: remember the last row of the previous page', 'SELECT * FROM orders WHERE (created_at, id) < ($1, $2)', '  ORDER BY created_at DESC, id DESC LIMIT 50;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'plan: Index Scan → Limit', right: s.r || '' }),
      setup(kit) { return planSetup(kit, { scanLabel: 'Index Scan', scanSub: 'orders_created_idx', limSub: 'OFFSET / LIMIT', items: [{ id: 'kept', label: 'rows returned' }, { id: 'skipped', label: 'discarded' }, { id: 'scan', label: 'scanned' }] }); },
      frame(s, kit, R) {
        planFrame(s, R);
        R.scan.set({ y: 150 }); R.lim.set({ y: 90, sub: s.sub || 'OFFSET 0 LIMIT 50' });
        R.bars.set('kept', s.out ? 50 / 1000 * 100 + 6 : 0, 'ok', s.out ? '50' : '0');
        R.bars.set('skipped', s.skip || 0, s.skip ? 'bad' : 'ok', s.skipL || '0');
        R.bars.set('scan', s.scan || 0, s.scan > 50 ? 'bad' : 'warn', s.scanL || '0');
      }
    },
    bug: [
      { log: 'Page 1: OFFSET 0 LIMIT 50. The index scan returns 50 rows and Limit keeps all of them. This is cheap, so nobody notices.', callout: 'Page 1 is cheap', code: 1, state: { read: 1, out: true, scan: 6, scanL: '50', sub: 'OFFSET 0 LIMIT 50', r: 'page 1' }, stats: [{ l: 'rows scanned', v: '50', cls: 'ok' }] },
      { log: 'Page 2000: OFFSET 100000. Limit must discard the first 100,000 rows before it keeps one, so the scan pulls 100,050 rows.', callout: 'OFFSET 100000: 100,000 rows are pulled and dropped', moment: true, code: 1, state: { read: 14, out: true, scan: 100, scanL: '100 K', skip: 100, skipL: '100 K', sub: 'OFFSET 100000 LIMIT 50', pgTone: 'bad', r: 'page 2000' }, stats: [{ l: 'rows scanned', v: '100,050', cls: 'bad' }, { l: 'rows returned', v: '50' }] },
      { log: 'Every later page is slower than the one before, because the skipped part grows. Latency depends on how deep the user pages.', callout: 'The deeper the page, the slower it is', code: 1, state: { read: 18, out: true, scan: 100, scanL: '100 K+', skip: 100, skipL: '100 K+', sub: 'OFFSET 100000 LIMIT 50', pgTone: 'bad', r: 'deeper' }, stats: [{ l: 'cost grows with', v: 'OFFSET', cls: 'bad' }] },
      { log: 'Keyset pagination remembers the last row of the previous page and puts it in a WHERE. The index starts right after that row.', callout: 'Keyset: start at the last row you saw', code: 4, state: { read: 1, out: true, scan: 6, scanL: '50', sub: 'keyset: WHERE (…) < last row', pgTone: 'ok', r: 'keyset' }, stats: [{ l: 'rows scanned', v: '50', cls: 'ok' }] },
      { log: 'The scan reads 50 rows for any page. The index on (created_at, id) delivers rows already in order, so there is no Sort and no skipped part.', callout: '50 rows for any page, no sort', code: 5, state: { read: 1, out: true, scan: 6, scanL: '50', sub: 'keyset: WHERE (…) < last row', pgTone: 'ok', res: 'every page: about 50 rows scanned (illustrative)', resTone: 'ok', r: 'keyset' }, stats: [{ l: 'rows scanned', v: '50', cls: 'ok' }, { l: 'cost grows with', v: 'page size', cls: 'ok' }],
        takeaway: 'Keyset pagination makes every page cost the same, because nothing is thrown away.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { explain: `
<h3>1. A plan is a tree that is pulled from the top</h3>
<p>A query plan is a tree of nodes. The executor uses the Volcano, or iterator, model. Each node implements a next-row call (<code>ExecProcNode</code>). The client asks the top node for a row, that node pulls from its child, and so on down to the scan. Each call returns one row. Whether a query can stop early depends on whether the nodes between the scan and the client stream or block.</p>
<figure class="hd" aria-label="Flowchart: rows are pulled from the top of the plan">
  <div class="hd-flow"><div class="hd-node">Client asks for a row</div><div class="hd-down">↓</div><div class="hd-node ok">Limit 5: stops pulling after 5 rows</div><div class="hd-down">↓</div><div class="hd-node warn">Sort: blocking, must read all input first</div><div class="hd-down">↓</div><div class="hd-node">Seq Scan: returns one row per pull</div></div>
  <figcaption>Without the Sort in the middle, the pulls stop early.</figcaption>
</figure>

<h3>2. Streaming nodes</h3>
<p>Scan, filter, limit and nested loop pass a row up as soon as they have it. They hold almost nothing in memory, and a consumer can stop the work at any moment. In the first scene Limit has what it needs after five pulls, so it stops asking, and 19 of the 20 pages are never read.</p>

<h3>3. Blocking nodes</h3>
<p><b>Sort</b>, <b>Hash</b> and <b>HashAggregate</b> must read their whole input before they return the first row. Their memory is what <code>work_mem</code> limits (chapter 9 shows what happens when the input is larger). A <code>LIMIT</code> above a Sort does not change that. PostgreSQL then uses a top-N heapsort that keeps only N rows in a heap, so memory stays tiny. It still has to read every input row to know which N rows are the top ones.</p>

<h3>4. Reading the plan</h3>
<p><code>EXPLAIN ANALYZE</code> prints the actual <code>rows</code> and <code>loops</code> of each node. The scan's <code>rows</code> is the number of pulls the plan needed, so it shows at once whether LIMIT really cut the work. The useful check is simple: find the blocking node, and ask whether an index can deliver rows in the order the query needs. With an index on <code>amount DESC</code>, the Sort disappears and the plan becomes the streaming one.</p>

<h3>5. The trade-off, and paging</h3>
<p>Streaming keeps memory small and lets a consumer stop early. Blocking nodes are required for sorting and for some joins, but they force a full read before any row goes out. <code>OFFSET</code> is a streaming trap: Limit must pull and discard the skipped rows, so page 2000 costs 2000 times page 1. A keyset condition moves the work into the index instead. The same idea applies to the client. A driver that fetches the whole result set puts every row in client memory at once, so use a cursor or a fetch size to keep the stream a stream.</p>

<h3>6. Syntax</h3>
<pre>-- how many rows did each node actually pull?
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders ORDER BY amount DESC LIMIT 5;

-- an index that delivers rows in order removes the Sort
CREATE INDEX CONCURRENTLY orders_amount_idx ON orders (amount DESC);

-- keyset pagination, backed by an index on (created_at, id)
SELECT * FROM orders
WHERE (created_at, id) &lt; ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- stream a big result instead of loading it all (psql)
\\set FETCH_COUNT 5000
COPY (SELECT * FROM orders) TO STDOUT;</pre>
<p>In a JDBC driver, turn autocommit off and call <code>setFetchSize(5000)</code> so the driver uses a cursor.</p>`, scenarios: [streams, topn, page] };
})();
