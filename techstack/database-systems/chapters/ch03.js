/* Chapter 4 "Hash Tables, Indexes, and Filters": four bespoke scenes plus the Explain text (index 3, zero-based).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: a B+ tree descent and leaf chain, a leaf split, a Bloom filter bit array, and 16 writers queueing on the rightmost leaf.
   Key values, page counts and timings are illustrative. */
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

  /* ---- 3. Bloom filter: bits set by inserts, a probe says "no" for sure or "maybe" ---- */
  const BW = 36, BX = i => 30 + (i % 16) * BW, BY = i => 150 + Math.floor(i / 16) * 50;
  const KEYSET = { ana: [3, 11, 20], ben: [7, 14, 27], cy: [1, 18, 25] };
  const OWN = { ana: 't0', ben: 't2', cy: 't4' };
  const bitOwner = (keys, b) => keys.find(k => KEYSET[k].includes(b));
  const FULL = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 30, 31];
  const bloom = {
    id: 'bloom-filter', label: 'Bloom filter', desc: 'A 32-bit array and three hash functions. A probe answers "no" for certain or "maybe". A saturated array says "maybe" to everything (illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      '-- one Bloom filter per file: 32 bits, k = 3 hash functions (illustrative)',
      'insert ana, ben, cy: each key sets the 3 bits its hashes pick',
      'probe dee: bit 5 is 0, so dee is certainly not in the file: skip the read',
      'probe eve: all 3 bits happen to be set by other keys: "maybe", a wasted read',
      '-- sized for 1 million keys, then 5 million arrive: nearly every bit is 1',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 32 bits, 3 hashes. Real filters use about 10 bits per key for 1% errors.',
      header: s => ({ left: s.fill == null ? 'bits set ' + (s.keys || []).length * 3 : 'bits set ' + s.fill + ' of 32', right: s.keys && s.keys.length ? 'keys: ' + s.keys.join(', ') : 'empty filter' }),
      draw(P, s) {
        const keys = s.keys || [];
        P.text('hb', { x: 30, y: 84, t: 'bit array', cls: 'mut sm' });
        const set = new Set(s.full ? FULL : keys.flatMap(k => KEYSET[k]));
        for (let i = 0; i < 32; i++) {
          const on = set.has(i), own = s.full ? null : bitOwner(keys, i), probe = s.probe && s.probe.bits.includes(i);
          P.box('b' + i, { x: BX(i), y: BY(i), w: BW - 4, h: 32, tone: on ? (own ? OWN[own] : 'acc') : 'info', label: on ? '1' : '0', cls: 'sm', sw: probe ? 3 : 1.4, stroke: probe ? (set.has(i) ? 'var(--warn)' : 'var(--bad)') : null });
          P.text('bn' + i, { x: BX(i) + (BW - 4) / 2, y: BY(i) + 46, t: String(i), cls: 'mut xs', anchor: 'middle' });
        }
        if (s.add) { const k = s.add; P.chip('add', { x: 30, y: 96, w: 120, h: 34, label: 'insert ' + k, tone: OWN[k] }); KEYSET[k].forEach((b, j) => P.line('ah' + j, 90, 130, BX(b) + 16, BY(b), { tone: 'cursor', arrow: true })); }
        if (s.probe) {
          const pr = s.probe;
          P.chip('pr', { x: 230, y: 96, w: 120, h: 34, label: 'probe ' + pr.key, tone: 'cursor' });
          pr.bits.forEach((b, j) => P.line('ph' + j, 290, 130, BX(b) + 16, BY(b), { tone: set.has(b) ? 'warn' : 'bad', arrow: true, dash: true }));
          P.chip('ans', { x: 400, y: 96, w: 210, h: 34, label: pr.ans, sub: '', tone: pr.tone });
        }
        if (s.waste) P.chip('waste', { x: 30, y: 270, w: 350, h: 44, label: 'file opened, key not found', sub: 'a false positive: one wasted read', tone: 'bad' });
        if (s.skip) P.chip('skip', { x: 30, y: 270, w: 350, h: 44, label: 'file skipped, no read', sub: 'a "no" is always correct', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'An empty Bloom filter: 32 bits, all zero. Three hash functions will turn each key into three bit positions.', callout: 'An empty filter: all bits 0', code: 0,
        state: {}, stats: [{ l: 'bits', v: '32' }, { l: 'hash functions', v: '3' }] },
      { log: 'Insert ana. Her three hashes pick bits 3, 11 and 20, and those bits become 1.', callout: 'Insert sets three bits', code: 1,
        state: { keys: ['ana'], add: 'ana' }, stats: [{ l: 'bits set', v: '3', cls: 'ok' }] },
      { log: 'Insert ben and cy as well. The array now has nine bits set. Keys leave no trace except the bits.', callout: 'Three keys, nine bits', code: 1,
        state: { keys: ['ana', 'ben', 'cy'] }, stats: [{ l: 'bits set', v: '9', cls: 'ok' }, { l: 'keys', v: '3' }] },
      { log: 'Probe dee. Her hashes pick bits 5, 11 and 29. Bit 5 is 0, so dee was never inserted. A no is certain.', callout: 'One zero bit: certainly not here', moment: true, code: 2,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'dee', bits: [5, 11, 29], ans: 'no: skip the file', tone: 'ok' }, skip: 1 }, stats: [{ l: 'answer', v: 'no', cls: 'ok' }, { l: 'disk reads', v: '0', cls: 'ok' }] },
      { log: 'Probe eve, who was never inserted. Her bits 7, 18 and 25 were all set by other keys, so the filter answers maybe.', callout: 'All bits set by others: a false positive', code: 3,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'eve', bits: [7, 18, 25], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'answer', v: 'maybe', cls: 'warn' }, { l: 'disk reads', v: '1', cls: 'bad' }] },
      { log: 'A maybe costs a read of the file, which then finds nothing. A filter never says no for a key that is present.', callout: 'Maybe costs a read, a no never lies', code: 3,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'eve', bits: [7, 18, 25], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'false negatives', v: '0', cls: 'ok' }, { l: 'false positives', v: 'possible', cls: 'warn' }] },
      { log: 'The filter was sized for 1 million keys, and 5 million have arrived. Almost every bit is 1 now.', callout: 'Too many keys: nearly every bit is 1', code: 4,
        state: { full: 1, fill: 28 }, stats: [{ l: 'bits set', v: '28 of 32', cls: 'bad' }] },
      { log: 'With 28 of 32 bits set, a random probe of three bits passes about 66% of the time. The filter answers maybe almost always.', callout: 'About 2 in 3 absent keys now say maybe', code: 4,
        state: { full: 1, fill: 28, probe: { key: 'zed', bits: [9, 21, 29], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'false positive rate', v: '~66%', cls: 'bad' }, { l: 'target', v: '1%', cls: 'ok' }],
        takeaway: 'A Bloom filter must be sized for the keys it will hold. Past that, it stops skipping files and only adds cost.' },
    ],
  };

  /* ---- 4. Hot leaf: increasing keys put every writer on the rightmost leaf ---- */
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

  const EXPLAIN = `
<h3>1. Rule out most rows quickly</h3>
<p>An index is an extra structure that lets the database skip most of a table. You pay for it with storage and with extra work on every write. The structure must match the query: a hash table for equality, a B+ tree for equality and ranges, and a Bloom filter to skip data that cannot match.</p>

<h3>2. Hash tables</h3>
<p>A <b>hash table</b> maps a key to a slot with a fast hash function, so a lookup takes constant time on average. Keys have no order, so it cannot answer a range. With <b>linear probing</b>, a lookup scans forward from the hashed slot until it finds the key or an empty slot. A missing key must reach an empty slot to be sure, so misses get slow as the table fills. <b>Extendible</b> and <b>linear hashing</b> grow the table by splitting buckets rather than rebuilding it.</p>

<h3>3. The B+ tree</h3>
<p>A <b>B+ tree</b> is a balanced, sorted tree. Every node is a page. Inner nodes hold separator keys, and values (record IDs) sit only in the leaves, which are linked left to right. A lookup reads one node per level. With 256 entries per node, four levels hold more than 4 billion keys, so 100 million keys need four pages and one heap page. A range scan descends once and then follows the leaf links.</p>
<p>An insert goes into the right leaf in sorted order. A full leaf <b>splits</b>: half the keys move to a new leaf, and the first key of the new leaf is copied up to the parent. A full parent splits the same way, and a full root splits into a new root, so the tree grows at the top and stays balanced. A <b>composite</b> key such as (a, b, c) serves a prefix, a or a and b, but not b alone, because the entries are sorted by a first.</p>

<h3>4. The Bloom filter</h3>
<p>A <b>Bloom filter</b> is a bit array with k hash functions. An insert sets k bits. A probe checks the same k bits. If any bit is 0, the key is certainly absent. If all are 1, the key is possibly present. There are no false negatives. About 10 bits per key with k = 7 gives about 1% false positives. A filter sized for 1 million keys quietly turns into a stream of maybes when 5 million arrive.</p>

<h3>5. Latches protect the structure</h3>
<p>A <b>latch</b> is a short lock on a page in memory. It is not a transaction lock. A B+ tree walks down using <b>latch crabbing</b>: take the child latch, then release the parent once the child cannot split. Writers serialize on a leaf latch. Increasing keys, such as sequence ids and timestamps, all go to the rightmost leaf, so that one latch becomes the limit of insert throughput.</p>

<h3>6. The trade-off</h3>
<p>Every index adds one more page to write on each insert and one more structure to keep in memory. An index nobody queries is pure cost. Spreading keys across leaves removes contention but loses locality for range scans. Check how often each index is used before you add or drop one, and measure rows examined against rows returned.</p>

<h3>7. Syntax</h3>
<pre>CREATE INDEX customers_id_idx ON customers (customer_id);
-- composite: serves (customer_id) and (customer_id, status), not status alone
CREATE INDEX orders_cust_status_idx ON orders (customer_id, status);

EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM customers WHERE customer_id = 58114203;
--   Index Scan using customers_id_idx   Buffers: shared hit=5

-- which indexes are never used
SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;

-- index height and size
SELECT * FROM bt_metap('customers_id_idx');   -- extension pageinspect</pre>
<p>If an index scan examines far more rows than it returns, look at the column order of the key before you add another index.</p>`;

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[3] = { explain: EXPLAIN, scenarios: [descent, splitScene, bloom, hot] };
})();
