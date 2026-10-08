/* Chapter 3 "B-tree Index": three bespoke scenes plus the Explain text (index 3, zero-based).
   Loads after course.js and scene-kit.js. Keys, fill levels and page counts are illustrative; the nbtree mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: real pages hold hundreds of keys. All numbers are illustrative.';
  const line = (kit, x1, y1, x2, y2) => kit.el('line', { class: 'kring-tick', x1, y1, x2, y2 }, kit.layer);

  /* ---------- 1. A lookup walks one root-to-leaf path ---------- */
  const SEP = ['0-249', '250-499', '500-749', '750+'];
  const descend = {
    id: 'descend', label: 'Lookup: one path', desc: 'Searching amount = 99 walks one root-to-leaf path, three index pages and one heap page, instead of 150,000 heap pages.',
    codeLabel: 'SQL', code: { bug: ['CREATE INDEX orders_amount_idx ON orders (amount);', 'SELECT * FROM orders WHERE amount = 99;', '-- Index Scan using orders_amount_idx', '--   root -> internal -> leaf -> heap row'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'B-tree on amount · height 3', right: s.r || '' }),
      setup(kit) {
        const root = kit.chip(null, { x: 230, y: 74, w: 180, h: 38, label: 'root', sub: '250 | 500 | 750', tone: 'info' });
        const mid = SEP.map((t, i) => kit.chip(null, { x: 16 + i * 156, y: 138, w: 140, h: 36, label: 'internal', sub: t, tone: 'info' }));
        const leaves = Array.from({ length: 8 }, (_, i) => kit.chip(null, { x: 16 + i * 78, y: 204, w: 70, h: 32, label: 'leaf ' + (i + 1), tone: 'info', small: true }));
        mid.forEach((m, i) => { line(kit, 320, 112, 86 + i * 156, 138); line(kit, 86 + i * 156, 174, 51 + i * 156, 204); line(kit, 86 + i * 156, 174, 129 + i * 156, 204); });
        const heap = kit.chip(null, { x: 16, y: 260, w: 200, h: 40, label: 'heap page', sub: 'the row for amount = 99', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 240, y: 262, w: 384, labelW: 96, max: 100, items: [{ id: 'idx', label: 'index lookup' }, { id: 'seq', label: 'Seq Scan' }], title: 'Pages read (illustrative)' });
        return { root, mid, leaves, heap, bars };
      },
      frame(s, kit, R) {
        const d = s.depth || 0;
        R.root.set({ tone: d >= 1 ? 'cursor' : 'info' });
        R.mid.forEach((m, i) => m.set({ tone: d >= 2 && i === 0 ? 'cursor' : d >= 2 ? 'dim' : 'info' }));
        R.leaves.forEach((l, i) => l.set({ tone: d >= 3 && i === 0 ? 'cursor' : d >= 3 ? 'dim' : 'info' }));
        R.heap.set({ show: d >= 4, tone: 'ok' });
        R.bars.set('idx', d >= 4 ? 4 : d, 'ok', d ? String(Math.min(d, 4)) : '0');
        R.bars.set('seq', s.seq ? 100 : 0, 'bad', s.seq ? '150,000' : '0');
      }
    },
    bug: [
      { log: 'Without an index, amount = 99 means a Seq Scan: every heap page, about 150,000 pages for 1.2 GB (illustrative).', callout: 'No index: read every page of the table', code: 1, state: { seq: true, r: 'Seq Scan' }, stats: [{ l: 'pages read', v: '150,000', cls: 'bad' }, { l: 'time', v: 'seconds', cls: 'bad' }] },
      { log: 'With the index, the search starts at the root. It binary-searches 250, 500, 750 and picks the child for 0 to 249.', callout: 'Root: 99 is below 250, go to the first child', code: 3, state: { depth: 1, r: 'level 1' }, stats: [{ l: 'index pages read', v: '1', cls: 'ok' }] },
      { log: 'The internal page holds the next set of keys and downlinks. One more binary search picks the leaf that covers 99.', callout: 'Internal page: pick the leaf', code: 3, state: { depth: 2, r: 'level 2' }, stats: [{ l: 'index pages read', v: '2', cls: 'ok' }] },
      { log: 'The leaf holds the key 99 and a pointer (ctid) to the row. The number of index page reads equals the tree height.', callout: 'Leaf: key 99 and a ctid', code: 3, state: { depth: 3, r: 'level 3' }, stats: [{ l: 'index pages read', v: '3', cls: 'ok' }] },
      { log: 'The ctid names one heap page and one line pointer. A single heap read returns the row.', callout: '3 index pages and 1 heap page', moment: true, code: 3, state: { depth: 4, r: 'heap row' }, stats: [{ l: 'pages read', v: '4', cls: 'ok' }, { l: 'time', v: 'ms', cls: 'ok' }],
        takeaway: 'A lookup reads one page per level. The height grows very slowly with table size.' },
    ],
  };

  /* ---------- 2. A full leaf splits ---------- */
  const split = {
    id: 'split', label: 'A leaf splits', desc: 'A leaf holds four keys here and is full. Inserting key 25 forces a split: a new page, half the entries moved, a downlink added.',
    codeLabel: 'SQL', code: { bug: ['INSERT INTO orders (amount) VALUES (25);', '-- leaf for 20..40 is full (4 entries, illustrative)', '-- 1 allocate a new page', '-- 2 move the upper half of the entries', '-- 3 add a downlink to the parent'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'one parent · one leaf (capacity 4 keys)', right: s.r || '' }),
      setup(kit) {
        const parent = kit.chip(null, { x: 200, y: 80, w: 240, h: 44, label: 'parent', sub: '', tone: 'info' });
        const a = kit.chip(null, { x: 40, y: 190, w: 240, h: 54, label: 'leaf A', sub: '', tone: 'info' });
        const b = kit.chip(null, { x: 360, y: 190, w: 240, h: 54, label: 'leaf B (new page)', sub: '', tone: 'info', show: false });
        const ins = kit.chip(null, { x: 232, y: 140, w: 176, h: 30, label: 'insert 25', tone: 'cursor', small: true, show: false });
        const wr = kit.chip(null, { x: 16, y: 274, w: 608, h: 32, label: '', tone: 'info', show: false });
        return { parent, a, b, ins, wr };
      },
      frame(s, kit, R) {
        R.parent.set({ sub: s.pk || 'keys: (none) · one downlink', tone: s.pt || 'info' });
        R.a.set({ sub: s.ak || '10  20  30  40', tone: s.at || 'info' });
        R.b.set({ show: !!s.bShow, sub: s.bk || '', tone: s.bt || 'info' });
        R.ins.set({ show: !!s.ins });
        R.wr.set({ show: !!s.wr, label: s.wr || '', tone: s.wrT || 'info' });
      }
    },
    bug: [
      { log: 'Leaf A holds the four keys 10, 20, 30 and 40. It is full. The parent has one downlink to it.', callout: 'Leaf A is full: 4 of 4 keys', state: { at: 'warn', r: 'full leaf' }, stats: [{ l: 'leaf A', v: '4 / 4', cls: 'warn' }, { l: 'pages', v: '2' }] },
      { log: 'An INSERT of amount 25 belongs between 20 and 30. The search ends at leaf A, and there is no free slot.', callout: 'Key 25 belongs in leaf A, which has no room', code: 0, state: { ins: true, at: 'warn', r: 'insert 25' }, stats: [{ l: 'leaf A', v: '4 / 4', cls: 'warn' }] },
      { log: 'PostgreSQL allocates a new page, leaf B, from the index file. It is empty.', callout: 'Step 1: allocate a new page', moment: true, code: 2, state: { ins: true, at: 'warn', bShow: true, bt: 'cursor', bk: '(empty)', r: 'new page' }, stats: [{ l: 'pages', v: '3', cls: 'warn' }] },
      { log: 'About half of the entries move to B, and 25 goes into A, which now has room. A keeps 10, 20 and 25. B holds 30 and 40.', callout: 'Step 2: move the upper half, then insert', code: 3, state: { at: 'ok', ak: '10  20  25', bShow: true, bt: 'ok', bk: '30  40', r: 'moved' }, stats: [{ l: 'leaf A', v: '3 / 4' }, { l: 'leaf B', v: '2 / 4' }] },
      { log: 'The parent gets a new key, 30, and a downlink to B, so searches for 30 and above go to B. If the parent were full it would split too, and the split would cascade up.', callout: 'Step 3: the parent gains a downlink', code: 4, state: { at: 'ok', ak: '10  20  25', bShow: true, bt: 'ok', bk: '30  40', pk: 'keys: 30 · two downlinks', pt: 'ok', r: 'linked' }, stats: [{ l: 'pages written', v: '3', cls: 'warn' }, { l: 'tree height', v: 'unchanged', cls: 'ok' }] },
      { log: 'One INSERT wrote three pages and all three go to the WAL. That is the price of a split, and why many splits show up as extra WAL volume.', callout: 'One insert, three pages written, all logged', code: 4, state: { at: 'ok', ak: '10  20  25', bShow: true, bt: 'ok', bk: '30  40', pk: 'keys: 30 · two downlinks', pt: 'ok', wr: 'writes: leaf A + leaf B + parent, each recorded in WAL', wrT: 'warn', r: 'split done' }, stats: [{ l: 'pages written', v: '3', cls: 'warn' }, { l: 'both leaves', v: 'about half full' }],
        takeaway: 'A split moves half a leaf and touches the parent. Frequent splits mean extra writes and half-empty pages.' },
    ],
  };

  /* ---------- 3. Sequential versus random keys ---------- */
  const L8 = i => 'L' + (i + 1);
  const fillTone = f => (f >= 85 ? 'ok' : f >= 65 ? 'info' : 'warn');
  const keys = {
    id: 'random-keys', label: 'Sequential vs random keys', desc: 'A batch of inserts goes into the same index twice: once with increasing keys, once with random UUIDv4 keys. Compare the leaves it touches.',
    codeLabel: 'SQL', code: { bug: ['-- A: bigint identity, increasing', 'INSERT INTO orders_a SELECT g, ... FROM generate_series(1, 100000) g;', '-- B: UUIDv4, random', 'INSERT INTO orders_b SELECT gen_random_uuid(), ... FROM generate_series(1,100000);', 'SELECT * FROM pgstatindex(\'orders_b_pkey\');  -- avg_leaf_density'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.mode === 'rand' ? 'random UUIDv4 keys' : s.mode === 'seq' ? 'increasing keys' : 'an index of 8 leaves', right: s.r || '' }),
      setup(kit) {
        const leaves = Array.from({ length: 8 }, (_, i) => kit.chip(null, { x: 16 + i * 78, y: 80, w: 70, h: 56, label: L8(i), sub: '', tone: 'info', small: true }));
        const bars = kit.bars(null, { x: 16, y: 190, w: 400, labelW: 120, max: 100, items: [{ id: 'touch', label: 'leaves touched' }, { id: 'split', label: 'page splits' }, { id: 'dens', label: 'leaf density' }, { id: 'wal', label: 'WAL per insert' }], title: 'After 100,000 inserts (illustrative)' });
        return { leaves, bars };
      },
      frame(s, kit, R) {
        const fills = s.fills || [70, 70, 70, 70, 70, 70, 70, 70];
        R.leaves.forEach((l, i) => {
          const hit = s.touch === 'all' || (s.touch === 'last' && i === 7);
          l.set({ sub: fills[i] + '% full', tone: hit ? 'cursor' : fillTone(fills[i]) });
        });
        const b = s.bar || {};
        R.bars.set('touch', b.touch || 0, 'ok', b.touchL || '0');
        R.bars.set('split', b.split || 0, b.split > 30 ? 'bad' : 'ok', b.splitL || '0');
        R.bars.set('dens', b.dens || 0, b.dens >= 80 ? 'ok' : 'warn', b.dens ? b.dens + '%' : '0');
        R.bars.set('wal', b.wal || 0, b.wal > 50 ? 'bad' : 'ok', b.walL || '0');
      }
    },
    bug: [
      { log: 'An index of 8 leaves, each about 70% full. The same 100,000 inserts will run twice: first with increasing keys, then with random UUIDv4 keys.', callout: 'Same index, same batch, two key patterns', state: { r: 'start' }, stats: [{ l: 'leaves', v: '8' }, { l: 'density', v: '70%' }] },
      { log: 'Increasing keys always sort after every existing key, so every insert goes to the rightmost leaf. Only one leaf is touched.', callout: 'Increasing keys: always the rightmost leaf', code: 1, state: { mode: 'seq', touch: 'last', r: 'sequential' }, stats: [{ l: 'leaves touched', v: '1', cls: 'ok' }] },
      { log: 'When the right edge fills, PostgreSQL splits it so the left page stays about 90% full. The old leaves are never touched again, and they stay dense.', callout: 'The old leaves stay full and are left alone', moment: true, code: 1, state: { mode: 'seq', fills: [90, 90, 90, 90, 90, 90, 90, 45], bar: { touch: 12, touchL: '1', split: 8, splitL: 'few', dens: 90, wal: 15, walL: '1x' }, r: 'sequential done' }, stats: [{ l: 'leaves touched', v: '1', cls: 'ok' }, { l: 'density', v: '~90%', cls: 'ok' }] },
      { log: 'A UUIDv4 is random, so each key lands on a random leaf. The batch touches every leaf in the index.', callout: 'Random keys: every leaf is touched', code: 3, state: { mode: 'rand', touch: 'all', r: 'random' }, stats: [{ l: 'leaves touched', v: 'all 8', cls: 'warn' }] },
      { log: 'Leaves fill up in the middle of the tree and split again and again. Each split leaves two half-full pages, so the density settles near 60 to 70%.', callout: 'Many splits, half-full pages', moment: true, code: 3, state: { mode: 'rand', fills: [62, 58, 66, 55, 64, 60, 57, 63], bar: { touch: 100, touchL: 'all', split: 80, splitL: 'many', dens: 62, wal: 100, walL: '6x' }, r: 'random done' }, stats: [{ l: 'splits', v: 'many', cls: 'bad' }, { l: 'density', v: '~60%', cls: 'warn' }] },
      { log: 'After a checkpoint, the first change to a page writes a full-page image to the WAL. Touching every leaf means many full-page images, so the WAL grows with each insert.', callout: 'Full-page images: more WAL per insert', code: 4, state: { mode: 'rand', fills: [62, 58, 66, 55, 64, 60, 57, 63], bar: { touch: 100, touchL: 'all', split: 80, splitL: 'many', dens: 62, wal: 100, walL: '6x' }, r: 'random done' }, stats: [{ l: 'WAL per insert', v: '6x (illustrative)', cls: 'bad' }, { l: 'index size', v: 'larger', cls: 'warn' }],
        takeaway: 'Random keys scatter writes across the tree. Time-ordered keys keep one hot, dense edge.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[3] = { explain: `
<h3>1. A tree of sorted pages</h3>
<p>An index keeps keys in sorted order in a tree of 8 kB pages. A lookup starts at the root and walks down a few levels to one leaf, so it reads a handful of pages instead of the whole table. The price is that every insert must also find its place in that sorted order.</p>
<figure class="hd" aria-label="Flowchart: a B-tree lookup, and what an insert can add">
  <div class="hd-flow"><div class="hd-node">Root page: binary search picks a child</div><div class="hd-down">↓</div><div class="hd-node">Internal page: picks a leaf</div><div class="hd-down">↓</div><div class="hd-node">Leaf page: key and ctid</div><div class="hd-down">↓</div><div class="hd-node ok">Heap page: the row</div><div class="hd-down">↓</div><div class="hd-node warn">Insert into a full leaf: new page, move half, add a downlink in the parent</div></div>
  <figcaption>A lookup reads one page per level. A split writes a leaf, a new leaf and the parent.</figcaption>
</figure>

<h3>2. Searching</h3>
<p>Each page holds keys and downlinks to child pages. PostgreSQL binary-searches the page to choose a child, and repeats until it reaches a leaf. The number of page reads equals the tree height. Pages hold hundreds of keys, so a table of ten million rows needs a tree only three or four levels high, and the height grows very slowly. A leaf entry holds the key and a <code>ctid</code>, which names one heap page and one line pointer.</p>

<h3>3. Range scans and index-only scans</h3>
<p>Leaves link to their neighbours, so a range scan finds the first key and then walks sideways along the leaf chain. An index-only scan goes one step further: if every column the query needs is in the index, and the visibility map says the heap page is all-visible, PostgreSQL never reads the heap. A leading-prefix rule decides which queries can use a multicolumn index. Entries are ordered by the first column, then the second, so the index helps a query that constrains a leading prefix of the columns. A filter on only the second column has to walk every leaf.</p>

<h3>4. Inserts and page splits</h3>
<p>When a leaf is full, PostgreSQL allocates a new page, moves about half of the entries to it, and adds a downlink in the parent. A split can cascade up the tree, and if the root splits the tree grows one level taller. A single insert can therefore write several pages, and each of them goes to the WAL.</p>

<h3>5. The trade-off: reads against writes</h3>
<p>An index buys short lookups and costs space and write time. Each insert also changes the index. Sequential keys always land on the rightmost leaf, which stays hot, and the left leaves stay dense. Random keys such as UUIDv4 make the work scattered: many leaves are touched, pages split often and end up half full. After a checkpoint the first change to each page also writes a full-page image to the WAL, so scattered writes cost extra WAL.</p>
<p>Choose keys and column order with the query pattern in mind. Put equality columns first and range or sort columns last. An expression on the column, such as <code>lower(email)</code>, or an implicit cast on the column, cannot use a plain index on the column. Index the same expression instead.</p>

<h3>6. Syntax</h3>
<pre>-- build without blocking writes
CREATE INDEX CONCURRENTLY orders_amount_idx ON orders (amount);

-- equality column first, range column last
CREATE INDEX CONCURRENTLY orders_status_created_idx ON orders (status, created_at);

-- an expression index for lower(email) lookups
CREATE INDEX CONCURRENTLY users_lower_email_idx ON users (lower(email));

-- how dense are the leaves?
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT tree_level, leaf_pages, avg_leaf_density FROM pgstatindex('orders_pkey');

-- rebuild a bloated index without blocking writes
REINDEX INDEX CONCURRENTLY orders_pkey;</pre>
<p>Prefer a time-ordered key such as a <code>bigint</code> identity column. PostgreSQL 16 and 17 do not generate UUIDv7 themselves, so it has to come from the application.</p>`, scenarios: [descend, split, keys] };
})();
