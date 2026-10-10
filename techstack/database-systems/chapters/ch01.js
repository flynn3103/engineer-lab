/* Chapter 2 "Pages, Records, and Log-Structured Storage" (index 1, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L03 Database Storage I (pages, heap files, slotted pages, tuples), L04 Database Storage II (log-structured and index-organized storage, data representation).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a slotted page, an LSM write path with compaction, and byte-level tuple alignment. Sizes and counts illustrative. */
(function () {
  const DB = window.DB;

  /* ---- 1. Slotted page: the slot array grows right, records grow left, the free gap is in the middle ---- */
  const U = 20, PX = 30, PW = 580, PY = 176, PH = 64, SLOT0 = PX + 3 * U;   // 29 units wide, header 3 units
  const recX = (off, n) => PX + PW - (off + n) * U;
  const slotted = {
    id: 'slotted-page', label: 'Slotted page', desc: 'An 8 KB page drawn as 29 units. The slot array grows from the left, records are packed from the right, and a record ID (page, slot) never changes (sizes illustrative).',
    codeLabel: 'Page',
    code: { bug: [
      'page 7 = header | slot array -> ... free ... <- records',
      'INSERT: append a record at the right end, add a slot at the left end',
      'record ID = (page 7, slot 1): the slot holds offset and length',
      'DELETE leaves a hole inside the record area',
      'compaction slides records right; slot numbers do not change',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 29 units per page, every unit about 280 bytes. Illustrative.',
      header: s => ({ left: 'page 7 · free gap ' + (s.gap == null ? 26 : s.gap) + ' units', right: s.total == null ? '' : 'total free ' + s.total + ' units' }),
      draw(P, s) {
        const recs = s.recs || [], slots = s.slots || 0;
        P.text('hp', { x: PX, y: 150, t: 'one page: 8 KB', cls: 'mut sm' });
        P.box('page', { x: PX, y: PY, w: PW, h: PH, tone: 'mut', label: '', sw: 2 });
        P.box('hdr', { x: PX, y: PY, w: 3 * U - 2, h: PH, tone: 't0', label: 'hdr', cls: 'xs' });
        for (let i = 0; i < slots; i++) P.box('s' + i, { x: SLOT0 + i * U, y: PY, w: U - 2, h: PH, tone: (s.deadSlot === i) ? 'mut' : 't1', label: 's' + i, cls: 'xs', dash: s.deadSlot === i });
        recs.forEach(([n, size, off, tone]) => P.box('r' + n, { x: recX(off, size), y: PY, w: size * U - 2, h: PH, tone: tone || 'ok', label: n, dash: tone === 'delete' }));
        (s.links || []).forEach(([slot, n, size, off]) => P.line('k' + slot, SLOT0 + slot * U + 9, PY, recX(off, size) + size * U / 2, PY - 6 - slot * 8, { tone: 'cursor', arrow: true, dash: true }));
        if (s.want) P.box('want', { x: recX(s.want[1], s.want[0]), y: PY + PH + 14, w: s.want[0] * U - 2, h: 34, tone: 'bad', label: 'r4 needs ' + s.want[0], dash: true });
        if (s.rid) P.chip('rid', { x: 30, y: 280, w: 220, h: 44, label: 'RID (page 7, slot ' + s.rid + ')', sub: 'slot holds offset + length', tone: 'cursor' });
        if (s.note) P.text('nt', { x: 300, y: 304, t: s.note, cls: 'sm' });
        P.text('lg', { x: SLOT0, y: PY + PH + 60 + (s.want ? 0 : 0), t: '', cls: 'xs' });
      }
    }),
    bug: [
      { log: 'A fresh page has a header and no records. The slot array will grow from the left and the records from the right, so all free space stays in one gap.', callout: 'An empty page: one free gap', code: 0,
        state: { gap: 26, total: 26 }, stats: [{ l: 'records', v: '0' }, { l: 'free gap', v: '26 units', cls: 'ok' }] },
      { log: 'INSERT r1 (6 units). The record is written at the right end, and slot 0 is added at the left end to point at it.', callout: 'Insert: record from the right, slot from the left', code: 1,
        state: { slots: 1, recs: [['r1', 6, 0]], links: [[0, 'r1', 6, 0]], gap: 19, total: 19 }, stats: [{ l: 'records', v: '1' }, { l: 'free gap', v: '19 units', cls: 'ok' }] },
      { log: 'Two more inserts, r2 (5 units) and r3 (4 units). Each takes record space plus one slot, and the gap shrinks from both sides.', callout: 'The gap shrinks from both sides', code: 1,
        state: { slots: 3, recs: [['r1', 6, 0], ['r2', 5, 6], ['r3', 4, 11]], links: [[0, 'r1', 6, 0], [1, 'r2', 5, 6], [2, 'r3', 4, 11]], gap: 8, total: 8 }, stats: [{ l: 'records', v: '3' }, { l: 'free gap', v: '8 units', cls: 'warn' }] },
      { log: 'A query finds a row by its record ID (page 7, slot 1). The slot says where the record sits, so the reader jumps straight to r2.', callout: 'The record ID is (page, slot)', code: 2,
        state: { slots: 3, recs: [['r1', 6, 0], ['r2', 5, 6, 'cursor'], ['r3', 4, 11]], links: [[1, 'r2', 5, 6]], gap: 8, total: 8, rid: 1 }, stats: [{ l: 'pages read', v: '1', cls: 'ok' }] },
      { log: 'DELETE r2. The slot is marked empty and the record bytes become a hole in the middle of the record area. The gap itself does not grow.', callout: 'A delete leaves a hole', code: 3,
        state: { slots: 3, deadSlot: 1, recs: [['r1', 6, 0], ['r2', 5, 6, 'delete'], ['r3', 4, 11]], links: [[0, 'r1', 6, 0], [2, 'r3', 4, 11]], gap: 8, total: 13 }, stats: [{ l: 'contiguous gap', v: '8 units', cls: 'warn' }, { l: 'total free', v: '13 units', cls: 'ok' }] },
      { log: 'A new record r4 needs 10 units plus a slot. 13 units are free in total, but only 8 are in one piece, so the insert does not fit.', callout: '13 free in total, only 8 contiguous', moment: true, code: 3,
        state: { slots: 3, deadSlot: 1, recs: [['r1', 6, 0], ['r2', 5, 6, 'delete'], ['r3', 4, 11]], links: [[0, 'r1', 6, 0], [2, 'r3', 4, 11]], gap: 8, total: 13, want: [10, 15] }, stats: [{ l: 'needs', v: '11 units', cls: 'bad' }, { l: 'contiguous gap', v: '8 units', cls: 'bad' }] },
      { log: 'Compaction slides r3 to the right over the hole. Only its offset inside the slot changes, so the record ID of every other row stays valid.', callout: 'Compaction moves records, slots stay put', code: 4,
        state: { slots: 3, deadSlot: 1, recs: [['r1', 6, 0], ['r3', 4, 6]], links: [[0, 'r1', 6, 0], [2, 'r3', 4, 6]], gap: 13, total: 13 }, stats: [{ l: 'contiguous gap', v: '13 units', cls: 'ok' }, { l: 'record IDs changed', v: '0', cls: 'ok' }] },
      { log: 'Now r4 fits: 10 units for the record and one new slot. The page is nearly full, so the free-space map will stop offering it for inserts.', callout: 'r4 fits after compaction', code: 1,
        state: { slots: 4, deadSlot: 1, recs: [['r1', 6, 0], ['r3', 4, 6], ['r4', 10, 10, 'live']], links: [[0, 'r1', 6, 0], [2, 'r3', 4, 6], [3, 'r4', 10, 10]], gap: 2, total: 2 }, stats: [{ l: 'free gap', v: '2 units', cls: 'warn' }, { l: 'records', v: '3' }],
        takeaway: 'Slots make records movable: the page can compact itself while every record ID (page, slot) stays valid.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L03 Database Storage I, L04 Database Storage II (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/03-storage1.pdf' };

  /* ---- 2. Log-structured storage: writes go to memory and to new sorted files, compaction merges them ---- */
  const FOOT_LSM = 'Simplified: one level 0, one level 1, four keys per memtable. Illustrative.';
  const LSM_CODE = [
    'PUT k7=A; PUT k2=B; PUT k9=C; PUT k4=D     -- memtable, in memory',
    'memtable full: sort by key, write SSTable 1   -- one sequential write',
    'three more flushes: level 0 has 4 files with overlapping key ranges',
    'GET k7: memtable, then each file from newest to oldest (Bloom filter first)',
    'DELETE k2 writes a tombstone; the old value is still in an older file',
    'compaction: sort-merge the 4 files into one level-1 file; newest value wins',
  ];
  const lsm = {
    id: 'lsm-compaction', label: 'LSM write path', desc: 'Writes land in a memtable and are flushed as immutable sorted files. Reads check newest to oldest, and compaction merges the files back down (counts illustrative).',
    codeLabel: 'Storage',
    code: { bug: LSM_CODE },
    stage: DB.stage({
      footer: FOOT_LSM,
      header: s => ({ left: 'level-0 files: ' + (s.l0 || []).length + ' · logical writes 16', right: 'disk writes: ' + (s.dw || 0) + ' units' }),
      draw(P, s) {
        P.text('hm', { x: 30, y: 82, t: 'memory', cls: 'mut sm' });
        P.text('hd', { x: 250, y: 82, t: 'disk: level 0 (new files)', cls: 'mut sm' });
        P.box('mem', { x: 30, y: 92, w: 170, h: 136, tone: 'mut', label: '', sw: 2 });
        P.text('mn', { x: 42, y: 112, t: 'MemTable', cls: 'sm' });
        (s.mem || []).forEach((k, i) => P.chip('k' + i, { x: 42, y: 120 + i * 26, w: 146, h: 24, label: k, tone: s.hot === i ? 'cursor' : 'info', small: true }));
        (s.l0 || []).forEach(([n, sub, tone], i) => P.chip('f' + n, { x: 250 + i * 92, y: 104, w: 84, h: 46, label: 'SST ' + n, sub, tone: tone || 'info' }));
        if (s.tomb) P.chip('tomb', { x: 42, y: 120 + 4 * 26 - 2, w: 146, h: 24, label: 'k2 = DELETE', tone: 'warn', small: true });
        P.text('hl1', { x: 250, y: 258, t: 'disk: level 1 (merged, sorted)', cls: 'mut sm' });
        if (s.l1) P.chip('l1', { x: 250, y: 270, w: 300, h: 48, label: s.l1[0], sub: s.l1[1], tone: 'ok' });
        if (s.read) P.chip('rd', { x: 30, y: 262, w: 170, h: 48, label: 'GET k7', sub: s.read, tone: 'cursor' });
        if (s.flushArrow) P.line('fa', 200, 160, 250, 128, { tone: 'ok', arrow: true, label: 'flush', dy: -8 });
        if (s.merge) (s.l0 || []).forEach(([n], i) => P.line('mg' + i, 292 + i * 92, 150, 400, 270, { tone: 'acc', arrow: true }));
      }
    }),
    bug: [
      { log: 'Four writes arrive. Each one changes the memtable, a sorted structure in memory. No data page on disk is read or rewritten.', callout: 'Writes only touch memory', code: 0,
        state: { mem: ['k7 = A', 'k2 = B', 'k9 = C', 'k4 = D'], hot: 3 }, stats: [{ l: 'disk writes', v: '0', cls: 'ok' }] },
      { log: 'The memtable is full. It is written to disk in key order as one new immutable file, SSTable 1, in a single sequential write.', callout: 'Flush: one sequential write', code: 1,
        state: { mem: [], flushArrow: 1, dw: 4, l0: [[1, 'k2..k9']] }, stats: [{ l: 'disk writes', v: '4 units', cls: 'ok' }, { l: 'files', v: '1' }] },
      { log: 'Writes continue and three more flushes follow. Level 0 now has four files. Their key ranges overlap, because each holds whatever arrived in its time window.', callout: 'Level 0 files overlap in key range', code: 2,
        state: { dw: 16, l0: [[1, 'k2..k9'], [2, 'k1..k8'], [3, 'k3..k9'], [4, 'k2..k7']] }, stats: [{ l: 'files', v: '4', cls: 'warn' }, { l: 'disk writes', v: '16 units' }] },
      { log: 'GET k7 checks the memtable, then every file from newest to oldest. A Bloom filter and the key range of each file skip files that cannot hold it, but overlapping files still need checks.', callout: 'A read may check several files', moment: true, code: 3,
        state: { dw: 16, read: 'checks 4 files', l0: [[1, 'k2..k9', 'warn'], [2, 'k1..k8', 'warn'], [3, 'k3..k9', 'ok'], [4, 'k2..k7', 'warn']] }, stats: [{ l: 'files checked', v: '4', cls: 'bad' }] },
      { log: 'DELETE k2 cannot erase the old value from an immutable file. It writes a tombstone to the memtable, and reads must see the tombstone before the older value.', callout: 'A delete is a new record, a tombstone', code: 4,
        state: { mem: [], tomb: 1, dw: 16, l0: [[1, 'k2..k9'], [2, 'k1..k8'], [3, 'k3..k9'], [4, 'k2..k7']] }, stats: [{ l: 'space freed', v: '0', cls: 'warn' }] },
      { log: 'Compaction reads the four files, sort-merges them and keeps the newest record per key. Old versions and the tombstone with its target disappear.', callout: 'Compaction: sort-merge, newest wins', code: 5,
        state: { dw: 16, merge: 1, l0: [[1, 'k2..k9'], [2, 'k1..k8'], [3, 'k3..k9'], [4, 'k2..k7']] }, stats: [{ l: 'files in', v: '4' }] },
      { log: 'One sorted file remains, so a read checks one file. But every byte was written twice, once by the flush and once by the compaction. That is write amplification.', callout: 'Fewer files to read, more bytes written', moment: true, code: 5,
        state: { dw: 28, l1: ['SST 5: k1..k9', 'merged and sorted'], l0: [] }, stats: [{ l: 'files', v: '1', cls: 'ok' }, { l: 'bytes written per user byte', v: '~2+', cls: 'warn' }],
        takeaway: 'Log-structured storage buys sequential writes by paying later: reads check many files until compaction, and compaction rewrites data.' },
    ],
  };

  /* ---- 3. Tuple layout: alignment padding wastes bytes until the columns are reordered ---- */
  const FIELDS_A = [['a', 1, 'bool'], ['b', 8, 'bigint'], ['c', 1, 'bool'], ['d', 8, 'bigint']];
  const FIELDS_B = [['b', 8, 'bigint'], ['d', 8, 'bigint'], ['a', 1, 'bool'], ['c', 1, 'bool']];
  const bytesOf = order => {
    const out = []; let off = 0;
    order.forEach(([n, sz]) => {
      const al = sz >= 8 ? 8 : 1;
      while (off % al) { out.push({ pad: 1 }); off++; }
      for (let i = 0; i < sz; i++) out.push({ n, first: i === 0 }); off += sz;
    });
    while (off % 8) { out.push({ pad: 1 }); off++; }
    return out;
  };
  const BA = bytesOf(FIELDS_A), BB = bytesOf(FIELDS_B);
  const bx = (k, x0) => ({ x: x0 + (k % 8) * 34, y: 134 + Math.floor(k / 8) * 40 });
  const align = {
    id: 'tuple-padding', label: 'Alignment padding', desc: 'A tuple stores each value at an offset its type is aligned to. A bool between two bigints costs 7 bytes of padding, and putting the wide columns first removes most of it (sizes as in PostgreSQL).',
    codeLabel: 'DDL',
    code: { bug: [
      'CREATE TABLE t (a bool, b bigint, c bool, d bigint);',
      '-- bigint must start at an offset divisible by 8; bool can start anywhere',
      '-- a at 0, pad 1..7, b at 8, c at 16, pad 17..23, d at 24: 32 bytes',
      'CREATE TABLE t (b bigint, d bigint, a bool, c bool);',
      '-- b at 0, d at 8, a at 16, c at 17, row padded to 24 bytes',
    ] },
    stage: DB.stage({
      footer: 'One row, one square per byte. Sizes as in PostgreSQL.',
      header: s => ({ left: s.hl || 'column order a, b, c, d', right: s.rt || '' }),
      draw(P, s) {
        const draw = (B, x0, tag, upto, dim) => {
          P.text('h' + tag, { x: x0, y: 112, t: tag === 'A' ? 'a, b, c, d' : 'b, d, a, c', cls: 'mut sm' });
          B.forEach((c, k) => { if (k >= upto) return; const p = bx(k, x0);
            P.box(tag + k, { x: p.x, y: p.y, w: 30, h: 30, tone: c.pad ? 'bad' : (c.n === 'a' || c.n === 'c' ? 't0' : 't1'), label: c.pad ? '' : (c.first ? c.n : ''), cls: 'xs', dash: !!c.pad, op: dim ? .45 : 1 }); });
        };
        if (s.A) draw(BA, 30, 'A', s.A, s.B != null);
        if (s.B != null) draw(BB, 340, 'B', s.B, false);
        if (s.padA) P.chip('pa', { x: 30, y: 300, w: 270, h: 36, label: s.padA, sub: '', tone: 'bad', small: true });
        if (s.padB) P.chip('pb', { x: 340, y: 300, w: 270, h: 36, label: s.padB, sub: '', tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'The table declares a bool, a bigint, a bool and a bigint in that order. Each square is one byte. The first bool takes byte 0.', callout: 'Column a, a bool, takes one byte', code: 0,
        state: { A: 1 }, stats: [{ l: 'row bytes so far', v: '1' }] },
      { log: 'A bigint must start at an offset divisible by 8. The next free byte is 1, so seven bytes of padding come first and b starts at byte 8.', callout: 'b needs a multiple of 8: 7 bytes padding', code: 1,
        state: { A: 16, rt: '7 bytes padded' }, stats: [{ l: 'padding', v: '7', cls: 'bad' }] },
      { log: 'The same happens again: c takes byte 16, seven bytes of padding follow, and d starts at byte 24.', callout: 'c, then 7 more bytes padding, then d', code: 2,
        state: { A: 32, rt: '14 bytes padded', padA: '32 bytes, 14 of them padding' }, stats: [{ l: 'row size', v: '32 B', cls: 'warn' }, { l: 'padding', v: '14 B', cls: 'bad' }] },
      { log: 'Declare the wide columns first: b, d, a, c. Both bigints are already aligned, the two bools sit side by side, and only the tail is padded to 8.', callout: 'Wide columns first', moment: true, code: 3,
        state: { A: 32, B: 24, hl: 'column order b, d, a, c', rt: '6 bytes padded', padA: '32 bytes, 14 of them padding', padB: '24 bytes, 6 of them padding' }, stats: [{ l: 'row size', v: '24 B', cls: 'ok' }, { l: 'padding', v: '6 B', cls: 'ok' }] },
      { log: 'The data is identical, 18 bytes of values. At a billion rows the reordered table is 8 GB smaller and each page holds about a third more rows, so scans read fewer pages.', callout: '25% smaller, same values', code: 4,
        state: { A: 32, B: 24, hl: 'column order b, d, a, c', padA: '1 billion rows: 32 GB', padB: '1 billion rows: 24 GB' }, stats: [{ l: 'saved per billion rows', v: '8 GB', cls: 'ok' }, { l: 'rows per page', v: '+33%', cls: 'ok' }],
        takeaway: 'Padding is invisible in the data and visible in the file size. Order fixed-width columns from widest to narrowest when the table will be large.' },
    ],
  };

  const EXPLAIN = `
<h3>1. From file to page to row</h3>
<p>A database is a set of files, and the DBMS manages the bytes itself instead of leaving them to the operating system. A file is cut into fixed-size <b>pages</b>, usually 4, 8 or 16 KB, and every disk read or write moves a whole page. A table is a <b>heap file</b>: an unordered collection of pages, with a <b>page directory</b> that records which page has free space. The DBMS avoids <code>mmap</code> for its files because the OS can evict a page, or flush a dirty page before its log record is on disk, without telling it. Controlling that order is the DBMS&rsquo;s job.</p>
<figure class="mm" aria-label="Flowchart: heap file, page directory, slotted page, record ID, tuple, overflow for large values" style="--diagram-width:552px">
  <img src="diagrams/ch01-page-hierarchy.svg" alt="Flowchart: a heap file is an unordered set of pages with a page directory that says which page has room. A page of 8 KB holds a header, a slot array and tuples. A record ID is the page number and the slot. A tuple has a header and aligned values. A value larger than a page goes to an overflow page or TOAST, with a pointer left in the tuple.">
  <figcaption>Flowchart: what sits between a table and its bytes. Chapter 3 shows how pages are cached.</figcaption>
</figure>

<h3>2. The slotted page</h3>
<p>Most engines use a <b>slotted page</b>. A small header comes first. A <b>slot array</b> grows from the left, and the tuples are packed from the right. Each slot holds the offset and length of one tuple. A tuple is found again by its <b>record ID</b>, the pair (page, slot). Because the ID goes through the slot, a tuple can move inside its page without changing its ID, and indexes that store the ID stay valid. A delete leaves a hole, and compaction slides the tuples back together. A <b>free-space map</b> tells an insert which page has room.</p>

<h3>3. Inside a tuple</h3>
<p>A tuple is a header followed by bytes. The header holds metadata such as a null bitmap and, in a multi-version engine, visibility information (chapter 23). The tuple does not record the types: the catalog does, and the DBMS reads the bytes by the column definitions. Fixed-width types such as integers and floats are stored in their native form. <b>Alignment</b> matters: a CPU reads a word at an aligned offset, so the DBMS pads values or reorders columns. A <code>bool</code> between two <code>bigint</code> columns costs 7 bytes of padding. For exact decimals, <code>NUMERIC</code> keeps digits in a variable-length form, which is exact but slower than a float. A value too big for a page, such as a long text or a JSON document, is stored in <b>overflow pages</b> (PostgreSQL calls this TOAST), and the tuple keeps a pointer.</p>

<h3>4. Where page-oriented storage hurts</h3>
<p>The lecture names three costs. <b>Fragmentation</b>: deletes leave holes, so pages are not full. <b>Useless I/O</b>: changing one 120-byte row rewrites a whole 8 KB page. <b>Random I/O</b>: updating 20 rows may mean 20 page writes at 20 places. These costs are small for most workloads and large for ingest-heavy ones.</p>

<h3>5. Log-structured storage</h3>
<p>The alternative never updates in place. The DBMS keeps log records of changes, <code>PUT key value</code> or <code>DELETE key</code>, applies them to an in-memory sorted <b>MemTable</b>, and when it is full writes it out as an immutable sorted file, an <b>SSTable</b>. Writes become sequential. A read checks the memtable, then the files from newest to oldest. A summary table with each file&rsquo;s key range and a Bloom filter (chapter 8) lets it skip files. A delete is a <b>tombstone</b>, a record that hides older values until compaction drops both.</p>
<figure class="mm" aria-label="Flowchart of the log-structured write and read paths: memtable, flush, level 0, compaction, summary table" style="--diagram-width:360px">
  <img src="diagrams/ch01-lsm-paths.svg" alt="Flowchart: a put or delete goes to the memtable, which is flushed as one sorted SSTable when full. Level 0 files have overlapping key ranges and are compacted by sort-merge into level 1 and deeper levels. A get checks the memtable, then the summary table and Bloom filter, then the level 0 files.">
  <figcaption>Flowchart: the write path on the left, the read path on the right. Compaction closes the loop.</figcaption>
</figure>
<p>Compaction picks files and merges them by sort-merge, keeping the newest record per key. <b>Level compaction</b> merges level 0 into a larger level 1, level 1 into level 2 and so on. <b>Universal compaction</b> merges any files together. The price is <b>write amplification</b>: for each byte the user writes, the system may write several bytes over its life.</p>

<h3>6. Index-organized storage</h3>
<p>Both heap pages and log files need a separate index to find a tuple, because the table itself is unsorted. In <b>index-organized storage</b> the tuples are stored as the values of an index, sorted by key, in pages that look like slotted pages. MySQL InnoDB works this way: the clustered primary-key index <em>is</em> the table. A lookup by key reaches the tuple in one tree descent, and a range scan reads neighbouring pages in order (chapter 7).</p>

<h3>7. The trade-off</h3>
<p>Slotted heap pages give cheap in-place updates and stable record IDs, but they pay random I/O, fragmentation and padding. Log-structured storage gives fast sequential writes, and pays with slower reads, compaction work and write amplification. Index-organized storage is fast for key lookups and ranges, but a secondary index must store the primary key and do a second lookup. No layout wins for every workload: pick the one whose cost lands where the workload is cheap.</p>

<h3>8. Syntax</h3>
<pre>-- column order changes the row size
CREATE TABLE t_bad  (a bool, b bigint, c bool, d bigint);
CREATE TABLE t_good (b bigint, d bigint, a bool, c bool);
-- compare: SELECT pg_column_size(t_bad.*)  FROM t_bad  LIMIT 1;

-- bloat: dead tuples and free space inside pages (extension pgstattuple)
SELECT * FROM pgstattuple('orders');
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'orders';

-- leave room in each page so an update can stay on its page
ALTER TABLE orders SET (fillfactor = 85);

-- a record ID is visible in PostgreSQL as ctid: (page, slot)
SELECT ctid, id FROM orders LIMIT 3;</pre>
<p>When the table is much larger than its live rows, count dead tuples before you buy disk.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `An <code>orders</code> table holds 40 GB of live rows and takes 63 GB on disk after months of updates and deletes (illustrative). Each UPDATE of a 120-byte row rewrites a whole 8 KB page. The events team moved to a log-structured store for fast writes, and now its disks stay busy with compaction even when traffic is low.`,
    predict: {
      q: `A slotted page has a hole where a deleted record used to be. The DBMS compacts the page by sliding the remaining records together. What happens to the record IDs (page, slot) of the records that moved?`,
      opts: [
        `They stay the same: each ID points to a slot, and only the offset stored in the slot changes`,
        `They all change, so every index entry for those rows must be rewritten`,
        `Only the records after the hole get new IDs`,
        `The page cannot be compacted while any index points into it`
      ],
      ans: 0,
      why: `The record ID names a slot, not a byte offset. Compaction updates the offset inside the slot, so the ID and every index that stores it stay valid.`
    },
    diagnose: [
      {
        t: 'Table bloat',
        sym: '<b>Table size</b> is far larger than the live rows, and scans get slower every month.',
        ctx: 'An orders table is updated all day. Each update writes a new row version and leaves the old one in the page until it is cleaned up. Cleanup has fallen behind.',
        why: 'A page holds dead tuples and holes the engine has not yet reclaimed, so a scan reads many pages for few live rows. Space inside a page is reused only after the dead tuples are removed and the free-space map is updated.',
        log: `-- representative output, counts illustrative
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'orders';
 n_live_tup | n_dead_tup
  41,200,000 | 23,900,000

SELECT pg_size_pretty(pg_total_relation_size('orders'));   ->  63 GB`,
        note: 'Dead tuples at more than half the live count mean cleanup is behind. Check whether an old transaction is holding the oldest visible version.',
        fix: [
          'Measure first: read <code>n_dead_tup</code> and <code>last_autovacuum</code> in <code>pg_stat_user_tables</code>, and <code>pgstattuple</code> for free space inside pages.',
          'Look for an old open transaction in <code>pg_stat_activity</code> (<code>xact_start</code>). While it is open, VACUUM cannot remove the versions it might still see.',
          'Make autovacuum run sooner on this table: lower <code>autovacuum_vacuum_scale_factor</code> for it with <code>ALTER TABLE ... SET (...)</code>.',
          'Leave room so updates stay on their page: lower <code>fillfactor</code> to 85 for update-heavy tables.',
          'Verify: after a vacuum run, compare <code>n_dead_tup</code> and the size of the table before and after.'
        ]
      },
      {
        t: 'Write amplification from compaction',
        sym: '<b>Disk write bandwidth</b> is high while the application writes little.',
        ctx: 'A log-structured store keeps data in levels. Each level is about 10 times larger than the one above, and a byte moves down through every level.',
        why: 'Compaction rewrites data to merge sorted files. In a leveled layout a byte can be written several times as it moves down, so the disk writes a multiple of what the application wrote.',
        log: `-- representative RocksDB-style statistics, counts illustrative
Cumulative writes: 41 GB   (user)
Cumulative compaction: 902 GB write, 12 GB/s peak
Write amplification: 22.0`,
        note: 'Write amplification above about 10 on a write-heavy workload means compaction is most of your I/O.',
        fix: [
          'Measure first: read the store&rsquo;s own statistics for write amplification, pending compaction bytes and stall time.',
          'Batch small writes in the application, so each memtable flush carries more useful data.',
          'Choose the compaction style by workload: leveled favours reads and space, universal or tiered style favours write cost.',
          'Rate-limit compaction I/O so it does not starve foreground reads and writes.',
          'Verify: compare disk bytes written per user byte before and after the change.'
        ]
      },
      {
        t: 'Padding waste',
        sym: '<b>Row size</b> is larger than the sum of the column sizes, on a table with billions of rows.',
        ctx: 'A fact table declares a bool, then a bigint, then another bool and a bigint. Nobody chose the order on purpose.',
        why: 'Each bigint must start at an offset divisible by 8, so the bools force padding between them. The padding is stored in every row.',
        log: `-- representative PostgreSQL output
SELECT pg_column_size(ROW(true, 1::bigint, true, 2::bigint));    -- 40 (with tuple overhead)
SELECT pg_column_size(ROW(1::bigint, 2::bigint, true, true));    -- 32`,
        note: 'The same values in a different column order give a smaller row. The saving repeats in every row of the table.',
        fix: [
          'Measure first: compare <code>pg_column_size</code> of a sample row for two column orders.',
          'For new large tables, declare fixed-width columns from widest to narrowest, then variable-length columns.',
          'For an existing table, create the reordered table and copy the data in a maintenance window.',
          'Verify: compare the table size and the rows per page after the copy.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[1] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [slotted, lsm, align] };
})();
