/* Chapter 7 "B+ Tree Indexes" (index 6, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L08 Tree Indexes I (B+Tree structure, design choices, optimizations), L09 Tree Indexes II (clustered, covering and partial index use).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a descent from root to leaf, a leaf split, a composite index that only serves its leftmost prefix, and a covering index that skips the table. Numbers illustrative. */
(function () {
  const DB = window.DB;

  /* ---- 1. Descent: one page per level from the root to a leaf, then a jump into the heap ---- */
  const LY = [88, 140, 192, 244], NX = i => 40 + i * 118, NW = 104;
  const L2 = ['<20M', '20-40M', '40-60M', '60-80M', '>80M'], L3 = ['40-44M', '44-48M', '48-52M', '52-56M', '56-60M'], L4 = ['58.0M', '58.1M', '58.2M', '58.3M', '58.4M'];
  const descent = {
    id: 'btree-descent', label: 'B+ tree descent', desc: 'A lookup for one customer in 100 million rows. A full scan reads every heap page. A B+ tree with 256 entries per node reads one page per level (illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT * FROM customers WHERE customer_id = 58114203;   -- no index',
      'CREATE INDEX customers_id_idx ON customers (customer_id);',
      '-- 256 entries per node: 256^4 = 4.3 billion, so 4 levels cover 100 million keys',
      '-- root, inner, inner, leaf: one page each, then the heap page for the row',
      "SELECT * FROM customers WHERE customer_id BETWEEN 58110000 AND 58130000;",
    ] },
    stage: DB.stage({
      footer: 'Simplified: 5 nodes drawn per level out of 256. Key ranges illustrative.',
      header: s => ({ left: 'pages read ' + (s.pages == null ? 0 : s.pages), right: s.noindex ? 'full scan' : 'B+ tree, 4 levels' }),
      draw(P, s) {
        if (s.noindex) {
          P.text('hs', { x: 40, y: 86, t: 'heap: 100 rows per page', cls: 'mut sm' });
          P.box('heap', { x: 40, y: 98, w: 560, h: 40, tone: 'bad', label: '1,000,000 heap pages, all read for 1 row', cls: 'sm' });
          P.chip('q0', { x: 40, y: 170, w: 250, h: 44, label: 'customer_id = 58114203', sub: 'rows examined: 100,000,000', tone: 'cursor' });
          P.chip('t0', { x: 320, y: 170, w: 180, h: 44, label: '~100 s', sub: 'at 1M rows/s', tone: 'bad' });
          return;
        }
        const lv = s.lvl || 0, pathIdx = 2;
        const pos = [[{ x: NX(2), key: 0 }], [0, 1, 2, 3, 4].map(i => ({ x: NX(i) })), [0, 1, 2, 3, 4].map(i => ({ x: NX(i) })), [0, 1, 2, 3, 4].map(i => ({ x: NX(i) }))];
        const labels = [['root', '256 keys'], null, null, null];
        for (let l = 0; l < 4; l++) {
          const lab = [null, L2, L3, L4][l];
          pos[l].forEach((p, i) => {
            const on = l < lv && (l === 0 || i === pathIdx);
            const rng = s.range && l === 3 && (i === 1 || i === 2);
            P.chip('n' + l + '_' + i, { x: p.x, y: LY[l], w: NW, h: 40, label: l === 0 ? 'root' : l === 3 ? 'leaf' : 'inner', sub: l === 0 ? '256 keys' : lab[i], tone: rng ? 'ok' : (on ? (l === 3 ? 'ok' : 'cursor') : 'info'), hl: on || rng });
          });
        }
        pos[0][0].x = NX(2);
        for (let i = 0; i < 5; i++) {
          const hot1 = lv >= 2 && i === pathIdx;
          P.line('e1_' + i, NX(2) + NW / 2, LY[0] + 40, NX(i) + NW / 2, LY[1], { tone: lv >= 2 && i === pathIdx ? 'cursor' : 'mut', sw: hot1 ? 2.6 : 1.2 });
          P.line('e2_' + i, NX(pathIdx) + NW / 2, LY[1] + 40, NX(i) + NW / 2, LY[2], { tone: lv >= 3 && i === pathIdx ? 'cursor' : 'mut', sw: lv >= 3 && i === pathIdx ? 2.6 : 1.2 });
          P.line('e3_' + i, NX(pathIdx) + NW / 2, LY[2] + 40, NX(i) + NW / 2, LY[3], { tone: lv >= 4 && i === pathIdx ? 'cursor' : 'mut', sw: lv >= 4 && i === pathIdx ? 2.6 : 1.2 });
        }
        for (let i = 0; i < 4; i++) P.line('sib' + i, NX(i) + NW, LY[3] + 20, NX(i + 1), LY[3] + 20, { tone: s.range && (i === 1) ? 'ok' : 'mut', arrow: true, sw: s.range && i === 1 ? 2.6 : 1.2 });
        if (s.key) P.chip('key', { x: 30, y: 300, w: 230, h: 34, label: 'customer_id = 58114203', tone: 'cursor' });
        if (s.heap) { P.chip('hp', { x: 330, y: 296, w: 150, h: 40, label: 'heap row', sub: '(page, slot)', tone: 'ok' }); P.line('lh', NX(pathIdx) + NW / 2, LY[3] + 40, 405, 296, { tone: 'ok', arrow: true, label: 'record id', dx: 34 }); }
        if (s.range) P.chip('rq', { x: 30, y: 296, w: 270, h: 40, label: 'BETWEEN 58110000 AND 58130000', sub: 'follow leaf links, no re-descent', tone: 'cursor' });
      }
    }),
    bug: [
      { log: 'The table has 100 million rows and no index on customer_id. The only way to find one customer is to read every row.', callout: 'No index: read all 1,000,000 heap pages', code: 0,
        state: { noindex: 1, pages: 1000000 }, stats: [{ l: 'pages read', v: '1,000,000', cls: 'bad' }, { l: 'time', v: '~100 s', cls: 'bad' }] },
      { log: 'CREATE INDEX builds a B+ tree. Each node holds 256 sorted entries, so each level divides the search by 256.', callout: 'A B+ tree: 256 entries per node', code: 1,
        state: {}, stats: [{ l: 'fanout', v: '256' }, { l: 'levels for 100M keys', v: '4', cls: 'ok' }] },
      { log: 'A lookup for customer 58,114,203 starts at the root. One binary search over its 256 keys picks the child.', callout: 'Page 1: the root picks a child', code: 3,
        state: { lvl: 1, pages: 1, key: 1 }, stats: [{ l: 'pages read', v: '1', cls: 'ok' }] },
      { log: 'The inner node for 40 to 60 million narrows the range again. Each level reads exactly one page.', callout: 'Page 2: an inner node narrows the range', code: 3,
        state: { lvl: 2, pages: 2, key: 1 }, stats: [{ l: 'pages read', v: '2', cls: 'ok' }] },
      { log: 'A second inner node covers 56 to 60 million keys. Three levels have cut 100 million keys to a few hundred.', callout: 'Page 3: the last inner level', code: 3,
        state: { lvl: 3, pages: 3, key: 1 }, stats: [{ l: 'pages read', v: '3', cls: 'ok' }] },
      { log: 'The leaf holds the key and a record id, the (page, slot) of the row in the heap.', callout: 'Page 4: the leaf holds the record id', code: 3,
        state: { lvl: 4, pages: 4, key: 1 }, stats: [{ l: 'pages read', v: '4', cls: 'ok' }] },
      { log: 'One more page read fetches the row from the heap. The whole lookup touched 5 pages instead of 1,000,000.', callout: '5 pages instead of 1,000,000', moment: true, code: 3,
        state: { lvl: 4, heap: 1, pages: 5, key: 1 }, stats: [{ l: 'pages read', v: '5', cls: 'ok' }, { l: 'time', v: '~1 ms', cls: 'ok' }] },
      { log: 'Leaves are linked to their neighbours. A range query descends once, then walks along the leaf chain without going back to the root.', callout: 'Ranges follow the leaf links', code: 4,
        state: { lvl: 4, range: 1, pages: 6 }, stats: [{ l: 'descents', v: '1', cls: 'ok' }, { l: 'leaves walked', v: '2' }],
        takeaway: 'A B+ tree turns a search over 100 million keys into one page per level, and keeps the keys in order for ranges.' },
    ],
  };

  /* ---- 2. Split: a full leaf divides in two, and the middle key is copied up to the parent ---- */
  const CW = 30, KY = 202, RY = 100;
  const fw = n => Math.max(4, n) * CW + 8;
  const BEFORE = { A: [5, 10, 20, 25], B: [30, 40, 50, 55], C: [60, 70, 80, 90] };
  const ax = { A: 40, B: 232, C: 424 }, ax2 = { A: 40, B1: 182, B2: 324, C: 466 };
  const splitScene = {
    id: 'leaf-split', label: 'Leaf split', desc: 'Leaves hold at most four keys. Inserting key 45 into a full leaf splits it, and the first key of the new leaf is copied up (keys illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'INSERT INTO customers (customer_id) VALUES (45);   -- leaf capacity is 4 keys',
      'descend: 45 >= 30 and 45 < 60, so go to the middle leaf',
      'leaf is full: 5 keys do not fit, so split into two leaves',
      'copy the first key of the new right leaf (50) up to the parent',
      'if the parent is full too, it splits, and the tree grows one level',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 4 keys per node. A real node holds hundreds. Illustrative.',
      header: s => ({ left: 'height 2 · leaves ' + (s.split ? 4 : 3), right: s.note || '' }),
      draw(P, s) {
        const L = s.split ? { A: BEFORE.A, B1: s.b1, B2: s.b2, C: BEFORE.C } : { A: BEFORE.A, B: s.b || BEFORE.B, C: BEFORE.C };
        const X = s.split ? ax2 : ax;
        Object.keys(L).forEach(id => {
          const keys = L[id], over = !s.split && id === 'B' && keys.length > 4;
          P.box('f' + id, { x: X[id], y: KY - 4, w: fw(keys.length), h: 34, tone: over ? 'bad' : 'mut', label: '', sw: over ? 2.6 : 1.4, stroke: over ? 'bad' : null });
          P.text('fl' + id, { x: X[id] + 4, y: KY + 56, t: id === 'B1' ? 'old leaf' : id === 'B2' ? 'new leaf' : 'leaf ' + id, cls: 'mut xs' });
        });
        Object.keys(L).forEach(id => L[id].forEach((k, i) => P.box('k' + k, { x: X[id] + 4 + i * CW, y: KY, w: CW - 4, h: 26, tone: k === 45 ? 'cursor' : (id === 'B2' && s.split ? 'ok' : 't0'), label: String(k), cls: 'xs' })));
        const rk = s.root || [30, 60], rx = 270;
        P.box('rf', { x: rx - 4, y: RY - 4, w: fw(rk.length), h: 34, tone: 'mut', label: '', sw: 2 });
        P.text('rl', { x: rx - 4, y: RY - 12, t: 'root (parent)', cls: 'mut xs' });
        rk.forEach((k, i) => P.box('r' + k, { x: rx + i * CW, y: RY, w: CW - 4, h: 26, tone: k === 50 && s.copied ? 'ok' : 't1', label: String(k), cls: 'xs' }));
        const kids = s.split ? ['A', 'B1', 'B2', 'C'] : ['A', 'B', 'C'];
        kids.forEach((id, i) => {
          const hot = s.descend && id === 'B';
          P.line('ed' + id, rx + (fw(rk.length) - 8) * (i + 0.5) / kids.length + 2, RY + 30, X[id] + fw(L[id].length) / 2, KY - 4, { tone: hot ? 'cursor' : 'mut', sw: hot ? 2.6 : 1.4 });
        });
        if (s.split) for (let i = 0; i < 3; i++) { const a = kids[i], b = kids[i + 1]; P.line('sb' + i, X[a] + fw(L[a].length), KY + 26, X[b], KY + 26, { tone: 'mut', arrow: true, sw: 1.2 }); }
        if (s.ins) P.chip('ins', { x: s.ins === 1 ? 40 : 200, y: s.ins === 1 ? 100 : 270, w: 150, h: 34, label: 'INSERT 45', sub: '', tone: 'cursor' });
        if (s.up) P.chip('up', { x: 440, y: 100, w: 170, h: 34, label: 'copy 50 up', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'A two-level tree. The root holds the separators 30 and 60. Three leaves each hold four keys, which is their capacity.', callout: 'Three leaves, all full', code: 0,
        state: {}, stats: [{ l: 'height', v: '2' }, { l: 'leaf capacity', v: '4 keys' }] },
      { log: 'INSERT 45. The root sends it right of 30 and left of 60, so it belongs in the middle leaf.', callout: '45 belongs in the middle leaf', code: 1,
        state: { descend: 1, ins: 1 }, stats: [{ l: 'pages read', v: '2', cls: 'ok' }] },
      { log: 'The middle leaf already holds four keys. Placing 45 in sorted order gives five, which does not fit.', callout: 'Five keys in a leaf of four: overflow', moment: true, code: 2,
        state: { descend: 1, b: [30, 40, 45, 50, 55], note: 'overflow' }, stats: [{ l: 'keys in leaf', v: '5 of 4', cls: 'bad' }] },
      { log: 'The leaf splits in two. The left leaf keeps 30, 40 and 45. The right leaf takes 50 and 55. Both are about half full now.', callout: 'Split into two half-full leaves', code: 2,
        state: { split: 1, b1: [30, 40, 45], b2: [50, 55], root: [30, 60] }, stats: [{ l: 'leaves', v: '4' }, { l: 'pages written', v: '2', cls: 'warn' }] },
      { log: 'The first key of the new leaf, 50, is copied up into the parent as a new separator. The parent now has three keys.', callout: '50 is copied up into the root', code: 3,
        state: { split: 1, b1: [30, 40, 45], b2: [50, 55], root: [30, 50, 60], copied: 1, up: 1 }, stats: [{ l: 'pages written', v: '3', cls: 'warn' }, { l: 'root keys', v: '3 of 4' }] },
      { log: 'One more split in the same parent would overflow it too. A full root splits, a new root is made above it, and the tree grows by one level.', callout: 'A full root splits: the tree grows one level', code: 4,
        state: { split: 1, b1: [30, 40, 45], b2: [50, 55], root: [30, 50, 60], copied: 1, note: 'root has room for 1 more' }, stats: [{ l: 'splits cost', v: '1 to 3 pages', cls: 'warn' }, { l: 'tree stays balanced', v: 'yes', cls: 'ok' }],
        takeaway: 'Inserts keep the tree balanced by splitting full nodes. Each insert into a full leaf writes two or three pages.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L08 Tree Indexes I (B+Tree) and L09 Tree Indexes II (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/08-indexes1.pdf' };

  /* ---- 3. Composite index: entries are sorted by the first column, so the second column alone cannot be searched ---- */
  const E_STATUS = [['new', 17], ['new', 4242], ['new', 9000], ['new', 9100], ['paid', 5], ['paid', 77], ['paid', 4242], ['paid', 8800], ['shipped', 9], ['shipped', 63], ['shipped', 905], ['shipped', 4242]];
  const E_CUST = [[5, 'paid'], [9, 'shipped'], [17, 'new'], [63, 'shipped'], [77, 'paid'], [905, 'shipped'], [4242, 'new'], [4242, 'paid'], [4242, 'shipped'], [8800, 'paid'], [9000, 'new'], [9100, 'new']];
  const ex = i => 30 + (i % 6) * 98, ey = i => 140 + Math.floor(i / 6) * 66;
  const prefix = {
    id: 'leftmost-prefix', label: 'Leftmost prefix', desc: 'An index on (status, customer_id) is sorted by status first. A search on customer_id alone finds its matches scattered across the index, so the engine reads every entry. Reversing the columns puts them side by side (12 sample entries, values illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'CREATE INDEX o_status_cust ON orders (status, customer_id);',
      "WHERE status = 'paid' AND customer_id = 4242   -- descend to paid, then to 4242",
      'WHERE customer_id = 4242                       -- 4242 is in every status group',
      '-- the index cannot binary search on its second column: all entries are examined',
      'CREATE INDEX o_cust_status ON orders (customer_id, status);',
      'WHERE customer_id = 4242                       -- the matches are adjacent',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 12 index entries stand for 100 million. Illustrative.',
      header: s => ({ left: s.hl || 'index on (status, customer_id)', right: s.ex == null ? '' : 'entries examined: ' + s.ex }),
      draw(P, s) {
        const rows = s.by === 'cust' ? E_CUST : E_STATUS;
        P.text('hh', { x: 30, y: 112, t: s.by === 'cust' ? 'entries in index order: customer_id, then status' : 'entries in index order: status, then customer_id', cls: 'mut sm' });
        rows.forEach((r, i) => {
          const cid = s.by === 'cust' ? r[0] : r[1], st = s.by === 'cust' ? r[1] : r[0];
          const hit = cid === 4242 && (!s.stat || st === s.stat);
          const seen = (s.exam || []).includes(i);
          P.chip('e' + i, { x: ex(i), y: ey(i), w: 90, h: 46, label: String(cid), sub: st, tone: hit && s.show ? 'ok' : seen ? 'warn' : 'info' });
        });
        if (s.show) P.text('hs', { x: 30, y: 296, t: s.show, cls: 'sm' });
        if (s.arrow != null) P.line('ar', ex(s.arrow) + 45, ey(s.arrow) + 50, ex(s.arrow) + 45, ey(s.arrow) + 64, { tone: 'cursor', arrow: true });
      }
    }),
    bug: [
      { log: 'The index is sorted by status first, and by customer_id inside each status. Twelve sample entries stand for 100 million.', callout: 'Sorted by status, then customer_id', code: 0,
        state: { exam: [] }, stats: [{ l: 'entries', v: '12 sample' }] },
      { log: 'Both columns are in the predicate. The tree descends to the paid group and then to 4242 inside it. One entry is the answer, and a few are read on the way.', callout: 'Both columns: descend straight to the entry', code: 1,
        state: { exam: [4, 5, 6], stat: 'paid', show: '1 match found after reading 3 entries', ex: 3 }, stats: [{ l: 'examined', v: '3', cls: 'ok' }] },
      { log: 'Only customer_id is in the predicate. Customer 4242 appears once in every status group, so the matches are scattered across the whole index.', callout: 'The matches sit in three separate places', moment: true, code: 2,
        state: { exam: [], show: '3 matches, one per status group', ex: 0 }, stats: [{ l: 'match groups', v: '3', cls: 'warn' }] },
      { log: 'A binary search needs one sorted order, and customer_id is only sorted inside each group. The engine has no choice but to read every entry and test it.', callout: 'The engine reads every entry', code: 3,
        state: { exam: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], show: '3 matches, 12 entries read', ex: 12 }, stats: [{ l: 'examined', v: '12 of 12', cls: 'bad' }] },
      { log: 'Rebuild the index with customer_id first. The entries are now sorted by customer, and every entry for 4242 sits next to the others.', callout: 'Put customer_id first', code: 4,
        state: { by: 'cust', hl: 'index on (customer_id, status)', exam: [] }, stats: [{ l: 'entries', v: '12 sample' }] },
      { log: 'The tree descends to the first 4242 and reads along the leaf until the key changes. Three matches, and only the entries next to them are read.', callout: 'One descent, then three neighbours', moment: true, code: 5,
        state: { by: 'cust', hl: 'index on (customer_id, status)', exam: [5, 6, 7, 8, 9], show: '3 matches, 5 entries read', ex: 5 }, stats: [{ l: 'examined', v: '5 of 12', cls: 'ok' }],
        takeaway: 'An index serves a leftmost prefix of its columns. Order columns by the equality filters the queries actually use.' },
    ],
  };

  /* ---- 4. Covering index: the leaf can answer the query, or it must send each match to a table page ---- */
  const MATCH = [['4242', 'rid (p2, s3)', 1], ['4242', 'rid (p5, s1)', 4], ['4242', 'rid (p1, s7)', 0], ['4242', 'rid (p6, s2)', 5]];
  const hpPos = i => ({ x: 390 + (i % 2) * 126, y: 112 + Math.floor(i / 2) * 76 });
  const covering = {
    id: 'covering-index', label: 'Covering index', desc: 'A query reads customer_id and total for four matching rows. A plain index sends each match to a table page. An index that also stores total answers from the leaf (page numbers illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT customer_id, total FROM orders WHERE customer_id = 4242;',
      'index on (customer_id): leaf entries hold the key and a record ID',
      '-- each of 4 matches needs its table page: 4 random reads',
      'CREATE INDEX o_cust_inc ON orders (customer_id) INCLUDE (total);',
      '-- the leaf now holds total: index-only scan, no table page',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one leaf page, six table pages. Illustrative.',
      header: s => ({ left: s.hl || 'index on (customer_id)', right: 'pages read: ' + (s.pages || 0) }),
      draw(P, s) {
        P.text('hl', { x: 30, y: 82, t: 'index leaf', cls: 'mut sm' }); P.text('ht', { x: 390, y: 82, t: 'table pages (heap)', cls: 'mut sm' });
        if (s.leaf) MATCH.forEach(([k, rid], i) => P.chip('m' + i, { x: 30, y: 98 + i * 64, w: 300, h: 52, label: 'customer ' + k + (s.inc ? ' · total ' + [40, 25, 90, 15][i] : ''), sub: s.inc ? 'total is stored in the leaf' : rid, tone: s.inc ? 'ok' : 'info' }));
        for (let p = 0; p < 6; p++) P.chip('p' + p, { ...hpPos(p), w: 112, h: 50, label: 'page ' + (p + 1), sub: s.fetch && MATCH.some(m => m[2] === p) ? 'read' : '', tone: s.fetch && MATCH.some(m => m[2] === p) ? 'warn' : 'mut' });
        if (s.fetch) MATCH.forEach(([, , pg], i) => P.line('f' + i, 330, 124 + i * 64, hpPos(pg).x, hpPos(pg).y + 25, { tone: 'warn', arrow: true }));
      }
    }),
    bug: [
      { log: 'The query asks for customer_id and total of customer 4242. The index on customer_id finds four matching entries on one leaf page. Each holds a key and a record ID.', callout: 'The leaf holds keys and record IDs', code: 1,
        state: { leaf: 1, pages: 3 }, stats: [{ l: 'index pages read', v: '3 (root, inner, leaf)' }] },
      { log: 'total is not in the index, so each record ID is followed to its table page. The four rows are on four different pages.', callout: 'Each match needs a table page', moment: true, code: 2,
        state: { leaf: 1, fetch: 1, pages: 7 }, stats: [{ l: 'table pages', v: '4', cls: 'bad' }, { l: 'pages read', v: '7', cls: 'bad' }] },
      { log: 'These are four random reads in four places. With a few matches it is fine. With thousands of matches the table reads dwarf the index reads.', callout: 'Random table reads dominate', code: 2,
        state: { leaf: 1, fetch: 1, pages: 7 }, stats: [{ l: 'index vs table pages', v: '3 vs 4', cls: 'warn' }] },
      { log: 'Add INCLUDE (total). The index leaf now stores total next to the key. The index is wider, but it holds everything the query needs.', callout: 'Store total in the index', code: 3,
        state: { leaf: 1, inc: 1, pages: 3, hl: 'index on (customer_id) INCLUDE (total)' }, stats: [{ l: 'index size', v: 'larger', cls: 'warn' }] },
      { log: 'The query is answered from the leaf alone, an index-only scan. No table page is read.', callout: 'Index-only scan: no table pages', moment: true, code: 4,
        state: { leaf: 1, inc: 1, pages: 3, hl: 'index on (customer_id) INCLUDE (total)' }, stats: [{ l: 'table pages', v: '0', cls: 'ok' }, { l: 'pages read', v: '3', cls: 'ok' }],
        takeaway: 'A covering index trades a bigger index for fewer table reads. Include only the few columns a hot query needs.' },
    ],
  };

  const EXPLAIN = `
<h3>1. What an index is for</h3>
<p>A table can be read in full, which costs the size of the table, or through an <b>index</b>, a second structure that maps a key to where the row is. The index is kept in step with the table on every write. Without one, a lookup of one customer among 100 million rows reads 100 million rows. With one it reads a handful of pages. The usual choice is the <b>B+ tree</b>, because it handles equality, ranges and ordered scans, and because it works in pages, which is how storage is read (chapters 2 and 3).</p>

<h3>2. The shape of a B+ tree</h3>
<p>The tree is balanced: every leaf is at the same depth. An <b>inner node</b> holds sorted keys and child pointers, and acts as a signpost. A <b>leaf</b> holds the keys with their values, either a record ID or the whole row, and a pointer to the next leaf. Every node holds at least half of its capacity, except the root. A lookup starts at the root, and at each node picks the child whose range covers the key. With 256 entries per node, each level divides the search by 256, so four levels cover more than 4 billion keys. A lookup reads one page per level, and the top levels are almost always in the buffer pool. A range scan descends once and then follows the leaf siblings, reading pages in key order.</p>
<figure class="mm" aria-label="Decision flowchart: leading column, descent, range, covering or fetch" style="--diagram-width:456px">
  <img src="diagrams/ch06-lookup-decision.svg" alt="Flowchart: for a predicate on customer_id, if the leading column of the index is not in the predicate the engine cannot binary search and scans the whole index or table. If it is, the tree descends one page per level and follows leaf sibling pointers for a range. If the index holds every column the query needs, it is an index-only scan with no table page read. Otherwise each row is fetched by record ID from a heap page, or by a primary key lookup.">
  <figcaption>Flowchart: the questions an engine asks before it uses an index.</figcaption>
</figure>

<h3>3. Insert and delete: split and merge</h3>
<p>An insert descends to the leaf and puts the key in sorted position. If the leaf is full, it is <b>split</b> into two leaves, and the first key of the new leaf is copied up into the parent as a signpost. If the parent is full, it splits too, and its middle key moves up. A split that reaches the root creates a new root, which is the only way the tree gets taller. A delete removes the key, and if a node falls below half full, the engine borrows from a sibling or <b>merges</b> two nodes. The <b>merge threshold</b> is a design choice: many systems delay merges, since an index that shrinks and grows again wastes work.</p>
<figure class="mm" aria-label="Flowchart of a B+ tree insert with leaf split and parent split" style="--diagram-width:413px">
  <img src="diagrams/ch06-split-flow.svg" alt="Flowchart: descend to the leaf. If it has room, insert in sorted position. If not, split the leaf in two and copy the first key of the new leaf up into the parent. If the parent is full, split the parent and push the middle key up, repeating until a node has room or the root splits, which creates a new root and makes the tree one level taller.">
  <figcaption>Flowchart: the split can cascade to the root.</figcaption>
</figure>

<h3>4. Design choices and optimizations</h3>
<p>The lecture lists the knobs. <b>Node size</b> is bigger for slow storage, smaller for fast storage and for in-memory trees. <b>Variable-length keys</b> are handled by pointers, padding or a slot array. <b>Intra-node search</b> is a linear scan, a binary search or interpolation. Optimizations: <b>prefix compression</b> stores a shared key prefix once per node; <b>deduplication</b> stores a repeated key once with a list of values; <b>suffix truncation</b> keeps only the shortest prefix of a key that still separates two children in an inner node; <b>pointer swizzling</b> replaces a page ID with a memory pointer for pages known to be in the buffer pool, avoiding the page-table lookup; <b>bulk insert</b> sorts the data and builds the tree bottom-up, far faster than inserting one key at a time; the <b>write-optimized B+ tree</b> (B&epsilon;-tree) buffers updates in inner nodes and pushes them down in batches.</p>

<h3>5. Clustered, secondary, composite and covering</h3>
<p>A <b>clustered</b> index stores the rows in the leaf in index order, so a primary-key range reads neighbouring pages. A table has at most one. A <b>secondary</b> index leaf holds a record ID in a heap, or the primary key in a clustered table, and the engine must then fetch the row: a second lookup. In a <b>composite</b> index the entries are sorted by the first column, then the second, so the index serves a <b>leftmost prefix</b>: a search on the first column, or on both. A predicate on the second column alone cannot use the order. A <b>covering</b> index holds every column the query needs, using <code>INCLUDE</code> for the non-key ones, and the engine answers from the leaf without touching the table. A <b>partial</b> index covers only the rows that match a predicate, for example <code>WHERE status = 'open'</code>, and is much smaller.</p>

<h3>6. The trade-off</h3>
<p>Every index speeds the reads it can serve and slows every write: each insert changes the table and every index. Indexes also take space and buffer pool memory. A table with eight indexes can write nine pages per insert. Index only the access paths that run often, order columns by the filters the queries use, and drop the indexes that the statistics show are never scanned.</p>

<h3>7. Syntax</h3>
<pre>-- composite index for: WHERE customer_id = ? AND status = ?
CREATE INDEX o_cust_status ON orders (customer_id, status);

-- covering index: total is carried in the leaf
CREATE INDEX o_cust_inc ON orders (customer_id) INCLUDE (total);

-- partial index: only the open orders
CREATE INDEX o_open ON orders (customer_id) WHERE status = 'open';

-- did the query use the index, and was it index-only
EXPLAIN (ANALYZE, BUFFERS) SELECT customer_id, total FROM orders WHERE customer_id = 4242;
--   Index Only Scan using o_cust_inc   Heap Fetches: 0

-- find indexes that are never used
SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan LIMIT 10;</pre>
<p><code>Heap Fetches</code> above zero on an index-only scan means the visibility map is stale. Vacuum the table (chapter 23).</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A support tool looks up one customer by id in a table of 100 million rows. With no index, each lookup reads every row: at 1 million rows per second it takes about 100 seconds (illustrative). The on-call engineer sees the lookup endpoint time out, and the plan shows a full scan that returns one row. After an index is added, a second query that filters only by <code>customer_id</code> still scans everything.`,
    predict: {
      q: `You add a B+ tree index on <code>customer_id</code>. With 256 entries per node and 100 million keys (illustrative), about how many index pages does one lookup read?`,
      opts: [
        `About 4, one node per level from the root to a leaf`,
        `About 1,000,000, because the index is as large as the table`,
        `Exactly 1, because an index jumps straight to the row`,
        `About 27, because a lookup is a binary search over 100 million keys`
      ],
      ans: 0,
      why: `Each node holds 256 sorted keys, so each level divides the search by 256. Four levels cover 256 to the fourth power, more than 100 million keys, so a lookup reads one page per level.`
    },
    diagnose: [
      {
        t: 'Wrong leading column',
        sym: '<b>A lookup by customer_id</b> examines all 100,000,000 index entries to return 100 rows.',
        ctx: 'The index is on (status, customer_id). The query filters by customer_id only, and the plan reads the whole index.',
        why: 'A composite index is sorted by the first column, then by the second inside each group. Without the first column in the predicate there is no sorted range to search, so the engine reads every entry.',
        log: `-- representative plan summary, counts illustrative
Index Scan using orders_status_customer_idx (status, customer_id)
Filter: (customer_id = 4242)
rows examined: 100000000, rows returned: 100`,
        note: 'An index scan with the key column only in <code>Filter</code> and not in <code>Index Cond</code> is reading everything.',
        fix: [
          'Measure first: compare rows examined with rows returned, and look at <code>Index Cond</code> against <code>Filter</code> in the plan.',
          'Create an index with the filtered column first, here (customer_id, status), and drop the old one if no query needs it.',
          'Order columns by the equality filters the queries use, then by range filters.',
          'Verify: the plan should show <code>customer_id</code> in <code>Index Cond</code> and rows examined close to rows returned.'
        ]
      },
      {
        t: 'Too many indexes',
        sym: '<b>Each insert</b> writes 9 pages, and 8 indexes take 66.4 GB for a 20 GB table.',
        ctx: 'Every query once got its own index. Nobody dropped them when the queries changed.',
        why: 'An insert must add its key to every index, and each addition may dirty a leaf page and cause a split. Indexes also take space, so they push the hot set out of the buffer pool.',
        log: `-- representative usage report, counts illustrative
index orders_idx_3: scans 0 in 30 days, writes 100000000
index orders_idx_7: scans 0 in 30 days, writes 100000000
page writes per insert: 9`,
        note: 'An index with no scans and many writes costs you and gives nothing back.',
        fix: [
          'Measure first: read scans and writes per index, for example <code>pg_stat_user_indexes</code>, over a full business cycle.',
          'Drop the indexes with no scans, after checking they are not needed for constraints or rare reports.',
          'Merge indexes that share a prefix: one on (a, b) also serves queries on a.',
          'Verify: page writes per insert and the table plus index size should both fall.'
        ]
      },
      {
        t: 'Non-covering index, random table reads',
        sym: '<b>A query that returns 50,000 rows</b> is slow although it uses an index, and most of the time is spent reading table pages.',
        ctx: 'The index on customer_id finds 50,000 matching entries quickly. For each one the engine fetches a different table page for the total column.',
        why: 'Each record ID points to a place in the table. Matching rows are spread over many pages, so the engine does thousands of random page reads. A covering index answers from the leaf.',
        log: `-- representative plan, counts illustrative
Index Scan using o_cust (customer_id)   rows=50000
  Buffers: shared hit=31 read=48,872
Execution Time: 1840 ms`,
        note: 'Many buffer reads for few index pages means the table fetches dominate.',
        fix: [
          'Measure first: compare buffers read in the index node with buffers read in the table in <code>EXPLAIN (ANALYZE, BUFFERS)</code>.',
          'Add the columns the query reads with <code>INCLUDE</code>, so the plan becomes an index-only scan.',
          'Or cluster the table by the filter column so matching rows share pages.',
          'Verify: the plan should show <code>Index Only Scan</code> with <code>Heap Fetches</code> near zero.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[6] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [descent, splitScene, prefix, covering] };
})();
