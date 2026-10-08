/* Chapter 1 "Heap Pages and the Buffer Pool": three bespoke scenes plus the Explain text (index 1, zero-based).
   Loads after course.js and scene-kit.js. Pool sizes, usage counts and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: a few slots stand for shared_buffers. All numbers are illustrative.';

  /* A row of pool slots. pool = [[page, usage], ...]; marks = {index: tone}. */
  function slotsSetup(kit, n, x0, y, w) {
    const gap = 8, cw = Math.floor((w - gap * (n - 1)) / n);
    return Array.from({ length: n }, (_, i) => kit.chip(null, { x: x0 + i * (cw + gap), y, w: cw, h: 54, label: '', sub: '', tone: 'info' }));
  }
  function slotsFrame(chips, pool, marks, hand) {
    chips.forEach((c, i) => {
      const p = pool[i];
      c.set({ show: !!p, label: p ? p[0] : '', sub: p ? 'use ' + p[1] : '', tone: (marks && marks[i]) || 'info', hl: hand === i });
    });
  }

  /* ---------- 1. Clock sweep: one miss, one victim ---------- */
  const P0 = [['p3', 4], ['p8', 1], ['p21', 2], ['p5', 1], ['p40', 0], ['p9', 3]];
  const sweep = {
    id: 'clock-sweep', label: 'Clock sweep eviction', desc: 'Page 17 is not in the pool. The clock hand lowers usage counts until it finds an unpinned page at zero, and evicts that one.',
    codeLabel: 'Buffer manager', code: { bug: ['-- need page 17 of orders, not in the pool', 'for each slot from the hand:', '  if pinned: skip', '  if usage > 0: usage = usage - 1, move on', '  if usage = 0: evict, load page 17'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'shared_buffers · 6 slots', right: s.r || '' }),
      setup(kit) {
        const chips = slotsSetup(kit, 6, 16, 140, 608);
        const need = kit.chip(null, { x: 16, y: 76, w: 200, h: 40, label: 'need page 17', sub: 'orders, not in the pool', tone: 'cursor' });
        const bars = kit.bars(null, { x: 16, y: 232, w: 300, labelW: 108, max: 5, items: [{ id: 'hand', label: 'hand moved' }, { id: 'drop', label: 'counts lowered' }], title: 'Sweep work (illustrative)' });
        const res = kit.chip(null, { x: 340, y: 216, w: 284, h: 34, label: '', tone: 'info', show: false });
        return { chips, need, bars, res };
      },
      frame(s, kit, R) {
        slotsFrame(R.chips, s.pool || P0, s.marks, s.hand);
        R.need.set({ tone: s.hit ? 'ok' : 'cursor', label: s.hit ? 'need page 3' : 'need page 17', sub: s.hit ? 'hit: already in the pool' : 'orders, not in the pool' });
        R.bars.set('hand', s.moved || 0, 'warn', String(s.moved || 0)); R.bars.set('drop', s.dropped || 0, 'warn', String(s.dropped || 0));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'Six slots hold pages with usage counts from 0 to 4. The clock hand points at slot 3. A backend now needs page 17 of orders, and it is not here.', callout: 'A miss: page 17 is not in the pool', state: { hand: 2, r: 'miss' }, stats: [{ l: 'slots', v: '6' }, { l: 'victim', v: '?' }] },
      { log: 'Slot 3 holds page 21 with usage 2. Nonzero, so it is not evicted. The hand lowers it to 1 and moves on.', callout: 'usage 2 → 1: spared this pass', code: 3, state: { hand: 2, pool: [['p3', 4], ['p8', 1], ['p21', 1], ['p5', 1], ['p40', 0], ['p9', 3]], marks: { 2: 'cursor' }, moved: 1, dropped: 1, r: 'sweep' }, stats: [{ l: 'counts lowered', v: '1', cls: 'warn' }, { l: 'victim', v: '?' }] },
      { log: 'Slot 4 holds page 5 with usage 1. The hand lowers it to 0 and moves on. It will be the victim next time round.', callout: 'usage 1 → 0: next pass it goes', code: 3, state: { hand: 3, pool: [['p3', 4], ['p8', 1], ['p21', 1], ['p5', 0], ['p40', 0], ['p9', 3]], marks: { 2: 'info', 3: 'cursor' }, moved: 2, dropped: 2, r: 'sweep' }, stats: [{ l: 'counts lowered', v: '2', cls: 'warn' }, { l: 'victim', v: '?' }] },
      { log: 'Slot 5 holds page 40 with usage 0 and no pin. This is the victim.', callout: 'usage 0 and unpinned: the victim', moment: true, code: 4, state: { hand: 4, pool: [['p3', 4], ['p8', 1], ['p21', 1], ['p5', 0], ['p40', 0], ['p9', 3]], marks: { 4: 'bad' }, moved: 3, dropped: 2, r: 'victim p40' }, stats: [{ l: 'victim', v: 'p40', cls: 'bad' }, { l: 'hand moved', v: '3', cls: 'warn' }] },
      { log: 'Page 17 is read from the OS cache or disk into slot 5 with usage 1. The hand advances to slot 6.', callout: 'Page 17 loaded with usage 1', code: 4, state: { hand: 5, pool: [['p3', 4], ['p8', 1], ['p21', 1], ['p5', 0], ['p17', 1], ['p9', 3]], marks: { 4: 'ok' }, moved: 3, dropped: 2, res: 'miss: read from OS cache or disk', resTone: 'warn', r: 'loaded' }, stats: [{ l: 'shared read', v: '1', cls: 'warn' }] },
      { log: 'Later, a backend needs page 3. It is in the pool, so this is a hit and its usage rises (the cap is 5). Hot pages survive many passes.', callout: 'A hit raises usage: hot pages stay', code: 0, state: { hand: 5, pool: [['p3', 5], ['p8', 1], ['p21', 1], ['p5', 0], ['p17', 1], ['p9', 3]], marks: { 0: 'ok' }, hit: true, moved: 0, dropped: 0, res: 'hit: no read', resTone: 'ok', r: 'hit' }, stats: [{ l: 'shared hit', v: '1', cls: 'ok' }, { l: 'shared read', v: '0', cls: 'ok' }],
        takeaway: 'Hits raise the usage count, each sweep pass lowers it. Pages that are used often stay.' },
    ],
  };

  /* ---------- 2. A big sequential scan uses a small ring ---------- */
  const HOT = [['o1', 3], ['o2', 4], ['o3', 3], ['o4', 2]];
  const ring = {
    id: 'big-scan', label: 'Big scan, small ring', desc: 'The nightly batch scans a table far larger than the pool. A ring of a few buffers keeps checkout pages cached.',
    codeLabel: 'SQL', code: { bug: ['-- nightly batch (illustrative: 40 GB table, 4 GB pool)', 'SELECT count(*) FROM events;', '-- checkout, a moment later', 'SELECT * FROM orders WHERE id = 42;', 'EXPLAIN (ANALYZE, BUFFERS)  -- shared hit=4 read=0'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.world || 'pool · 4 hot orders pages + others', right: s.r || '' }),
      setup(kit) {
        const pool = slotsSetup(kit, 8, 16, 90, 608);
        const rg = kit.panel(null, { x: 16, y: 164, w: 300, h: 84, title: 'Scan ring · 256 kB (32 pages)', tone: 'info' });
        const rc = [0, 1, 2].map(i => kit.chip(null, { x: 28 + i * 94, y: 196, w: 84, h: 40, label: 'ev' + (i + 1), sub: 'reused', tone: 'delete', small: true, show: false }));
        const bars = kit.bars(null, { x: 340, y: 192, w: 284, labelW: 92, max: 100, items: [{ id: 'hit', label: 'checkout hit' }], unit: '%', title: 'Checkout cache hit (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 268, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { pool, rc, bars, res };
      },
      frame(s, kit, R) {
        const fl = s.flood;
        const pool = [...HOT, ['x1', 1], ['x2', 1], ['x3', 1], ['x4', 1]].map((p, i) => fl && i < fl ? ['ev' + (i + 1), 1] : p);
        const marks = {}; pool.forEach((p, i) => { if (p[0].startsWith('ev')) marks[i] = 'delete'; else if (i < 4) marks[i] = s.hot ? 'live' : 'info'; });
        slotsFrame(R.pool, pool, marks);
        R.rc.forEach((c, i) => c.set({ show: !!s.ring, label: s.ring ? 'ev' + (((s.rot || 0) + i) % 9 + 1) : '' }));
        R.bars.set('hit', s.hitr == null ? 99 : s.hitr, s.hitr != null && s.hitr < 50 ? 'bad' : 'ok');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The pool holds the four hot pages that checkout uses (blue) and four others. Checkout hits 99 times in 100 (illustrative).', callout: 'The hot pages are cached', code: 3, state: { hot: true, r: 'normal day' }, stats: [{ l: 'checkout hit', v: '99%', cls: 'ok' }] },
      { log: 'The nightly batch starts a sequential scan of events. The table is much bigger than a quarter of shared_buffers.', callout: 'A scan far bigger than the pool starts', code: 1, state: { hot: true, r: 'batch starts' }, stats: [{ l: 'events pages', v: 'many', cls: 'warn' }, { l: 'pool pages', v: '8' }] },
      { log: 'If every scan page went into the main pool, each one would evict a hot page. This is what the batch would do without a ring.', callout: 'Without a ring: scan pages evict hot pages', moment: true, code: 1, state: { flood: 8, world: 'what would happen without a ring', hitr: 4, r: 'pool flooded' }, stats: [{ l: 'checkout hit', v: '4%', cls: 'bad' }, { l: 'hot pages left', v: '0', cls: 'bad' }] },
      { log: 'In reality the scan gets a small private ring. It reads each page into the ring and recycles the same few buffers, so the pool is barely touched.', callout: 'Real behaviour: the scan uses a small ring', code: 1, state: { hot: true, ring: true, rot: 0, r: 'ring in use' }, stats: [{ l: 'pool pages used by scan', v: '0', cls: 'ok' }, { l: 'ring size', v: '256 kB' }] },
      { log: 'The scan keeps moving. The ring reuses the same buffers again and again, while the hot pages never leave the pool.', callout: 'The ring recycles its own pages', code: 1, state: { hot: true, ring: true, rot: 3, r: 'ring recycles' }, stats: [{ l: 'pool pages used by scan', v: '0', cls: 'ok' }, { l: 'hot pages left', v: '4', cls: 'ok' }] },
      { log: 'Checkout reads one order a moment later. Its page is still in the pool, so it is a hit. The batch cost the pool nothing.', callout: 'Checkout still hits the pool', code: 4, state: { hot: true, ring: true, rot: 5, res: 'EXPLAIN: shared hit=4 read=0', resTone: 'ok', r: 'checkout' }, stats: [{ l: 'checkout hit', v: '99%', cls: 'ok' }, { l: 'shared read', v: '0', cls: 'ok' }],
        takeaway: 'A large scan recycles a small ring, so one batch cannot flush the hot set.' },
    ],
  };

  /* ---------- 3. TOAST: SELECT * reads the side table ---------- */
  const CH = 8;
  const toast = {
    id: 'toast', label: 'SELECT * and TOAST', desc: 'A wide column is stored outside the heap page in chunks. Naming only the columns you need skips the chunks.',
    codeLabel: 'SQL', code: { bug: ['-- orders.payload is 40 kB of JSON (illustrative)', 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 50;', '-- the list page needs only these:', 'SELECT id, status, amount FROM orders ORDER BY created_at DESC LIMIT 50;'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'one row · heap page and TOAST table', right: s.r || '' }),
      setup(kit) {
        const heap = kit.panel(null, { x: 16, y: 76, w: 296, h: 96, title: 'Heap page · orders', tone: 'info' });
        const row = kit.chip(null, { x: 32, y: 108, w: 264, h: 48, label: 'id 42 · status · amount', sub: 'payload: pointer to TOAST', tone: 'info' });
        const tp = kit.panel(null, { x: 328, y: 76, w: 296, h: 96, title: 'TOAST table · pg_toast', tone: 'info' });
        const chunks = kit.strip(null, { x: 340, y: 120, items: Array.from({ length: CH }, (_, i) => ({ id: 'c' + i, label: 'c' + (i + 1) })), w: 28, h: 30, gap: 4, tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 218, w: 400, labelW: 90, max: 10, items: [{ id: 'heap', label: 'heap pages' }, { id: 'toast', label: 'TOAST pages' }], title: 'Buffers for one row (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { row, chunks, bars, res };
      },
      frame(s, kit, R) {
        R.row.set({ tone: s.row || 'info', sub: s.sub || 'payload: pointer to TOAST' });
        Object.values(R.chunks).forEach((c, i) => c.set({ tone: s.chunks ? 'cursor' : s.dim ? 'dim' : 'info' }));
        R.bars.set('heap', s.heap || 0, 'ok', String(s.heap || 0)); R.bars.set('toast', s.toast || 0, s.toast ? 'bad' : 'ok', String(s.toast || 0));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The payload column is too wide for the page, so PostgreSQL compresses it or stores it outside the row, in a TOAST table, in chunks of about 2 kB.', callout: 'A wide value lives in a TOAST table', state: { r: 'row stored' }, stats: [{ l: 'chunks per payload', v: '8' }, { l: 'in the heap', v: 'a pointer' }] },
      { log: 'The list endpoint runs SELECT *. It reads the heap page for each row, and the payload column is part of the answer.', callout: 'SELECT * names the payload column too', code: 1, state: { row: 'cursor', heap: 1, r: 'SELECT *' }, stats: [{ l: 'heap pages', v: '1', cls: 'warn' }] },
      { log: 'To return it, PostgreSQL follows the pointer and fetches every chunk, then joins them and decompresses (detoasts).', callout: 'Every chunk is fetched, then detoasted', moment: true, code: 1, state: { row: 'cursor', heap: 1, toast: 8, chunks: true, res: '50 rows × 8 chunks = 400 extra page reads', resTone: 'bad', r: 'detoast' }, stats: [{ l: 'TOAST pages per row', v: '8', cls: 'bad' }, { l: 'per 50 rows', v: '400', cls: 'bad' }] },
      { log: 'The page only shows id, status and amount. Naming those columns means the payload pointer is never followed.', callout: 'Name only the columns you need', code: 3, state: { row: 'ok', heap: 1, dim: true, r: 'named columns' }, stats: [{ l: 'heap pages', v: '1', cls: 'ok' }, { l: 'TOAST pages', v: '0', cls: 'ok' }] },
      { log: 'The TOAST chunks are not read at all, and the response is smaller. The same query now costs one heap page per row.', callout: 'The chunks are never touched', code: 3, state: { row: 'ok', heap: 1, dim: true, res: '50 rows × 0 chunks = 0 extra reads', resTone: 'ok', r: 'named columns' }, stats: [{ l: 'TOAST pages per row', v: '0', cls: 'ok' }, { l: 'per 50 rows', v: '0', cls: 'ok' }],
        takeaway: 'TOASTed columns cost extra reads only when the query asks for them.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[1] = { explain: `
<h3>1. Pages are the unit of storage and caching</h3>
<p>Disk is thousands of times slower than memory, so what stays cached decides latency. PostgreSQL stores every table as fixed 8 kB pages. Each page has a header, an array of line pointers that grows down, and tuples that grow up. A row is addressed as (page, line pointer), which is the <code>ctid</code>. Reading one row means reading one whole page.</p>
<figure class="hd" aria-label="Flowchart: how a backend gets a page">
  <div class="hd-flow"><div class="hd-node">Backend needs page 17</div><div class="hd-down">↓</div><div class="hd-node dec">Look it up in shared_buffers</div><div class="hd-down">↓</div><div class="hd-row"><div class="hd-node ok">Hit: usage count goes up</div><span class="hd-arr">→</span><div class="hd-node warn">Miss: clock sweep picks a victim (usage 0, unpinned)</div></div><div class="hd-down">↓</div><div class="hd-node">Read the page from the OS cache or disk, load it with usage 1</div></div>
  <figcaption>A hit is a hash lookup. A miss costs a victim search and a read.</figcaption>
</figure>

<h3>2. The buffer pool: shared_buffers</h3>
<p>The <code>shared_buffers</code> area is an array of page slots in shared memory. Each slot has a descriptor with a pin count and a usage count, capped at 5. When a backend needs a page, the buffer manager looks it up in a hash table first. A hit costs a lookup and raises the usage count. A miss has to find a slot to reuse.</p>

<h3>3. Clock sweep: who gets evicted</h3>
<p>On a miss, the clock hand moves around the pool. Pinned pages are skipped. A page with a nonzero usage count is lowered by one and spared. The first unpinned page whose count is zero is evicted, and the new page takes its slot with usage 1. Every hit raises a count, so pages that are used often survive several passes. This is why a hot working set that fits in the pool stays at a high hit ratio.</p>

<h3>4. Rings: big scans do not flood the pool</h3>
<p>A sequential scan of a table larger than a quarter of <code>shared_buffers</code> uses a small private ring of about 256 kB and recycles its own pages. Bulk writes and <code>VACUUM</code> use rings too. Without them, one nightly scan would evict the whole hot set. Most pages also sit in the OS page cache, so a miss in <code>shared_buffers</code> is not always a disk read. That is called double caching, and it is why a common starting value for <code>shared_buffers</code> is about 25% of RAM, not nearly all of it.</p>

<h3>5. TOAST and the trade-off</h3>
<p>Values too wide for a page are compressed or moved into a side table in chunks of about 2 kB. They are read only when the column is named, so <code>SELECT *</code> on a table with a wide column pays for every chunk, and the list endpoint returns data it never shows. A bigger pool holds more of the hot set, but it also means more dirty pages to write at each checkpoint. When the hot set is bigger than the pool, the clock sweep keeps the best pages and misses the rest. The fix is to shrink the hot set, not to hope the sweep will cope.</p>
<p>To tell the cases apart, read <code>EXPLAIN (ANALYZE, BUFFERS)</code>. <code>shared hit</code> is a pool hit, and <code>shared read</code> is a miss that went to the OS or the disk.</p>

<h3>6. Syntax</h3>
<pre>-- what occupies the pool, by relation
CREATE EXTENSION IF NOT EXISTS pg_buffercache;
SELECT c.relname, count(*) AS buffers
FROM pg_buffercache b JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

-- hits versus reads, per database
SELECT datname, blks_hit, blks_read FROM pg_stat_database;

-- one query: where did the pages come from?
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE id = 42;

-- how big is the TOAST side of a table?
SELECT pg_size_pretty(pg_relation_size('orders')) AS heap,
       pg_size_pretty(pg_total_relation_size('orders') - pg_relation_size('orders')) AS indexes_and_toast;

-- postgresql.conf (restart needed): about 25% of RAM is a common start
-- shared_buffers = 4GB
-- huge_pages = try</pre>`, scenarios: [sweep, ring, toast] };
})();
