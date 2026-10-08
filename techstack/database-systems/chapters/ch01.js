/* Chapter 2 "Pages, Records, and the Buffer Pool": three bespoke scenes plus the Explain text (index 1, zero-based).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: a slotted page (slot array and records grow toward each other), a clock sweep around the frames, and a scan flooding the pool.
   Sizes, page numbers and timings are illustrative. */
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

  /* ---- 2. Clock sweep: a hand circles the frames, clears reference bits, and evicts the first unpinned frame at zero ---- */
  const CX = 214, CY = 208, CR = 98;
  const fpos = i => ({ x: CX + CR * Math.sin(i * Math.PI / 3) - 42, y: CY - CR * Math.cos(i * Math.PI / 3) - 20 });
  const hpos = i => ({ x: CX + 50 * Math.sin(i * Math.PI / 3) - 28, y: CY - 50 * Math.cos(i * Math.PI / 3) - 13 });
  const F0 = [['A', 1, 'dirty'], ['B', 1, ''], ['C', 1, 'pin'], ['D', 1, ''], ['E', 1, ''], ['F', 1, '']];
  const frames = (over) => F0.map((f, i) => (over && over[i]) ? over[i] : f);
  const clock = {
    id: 'clock-sweep', label: 'Clock sweep', desc: 'Six frames on a clock face. A miss with no free frame starts the hand: it clears reference bits and evicts the first unpinned frame at 0 (illustrative).',
    codeLabel: 'Policy',
    code: { bug: [
      'miss on page G, no free frame: run the clock',
      'hand sees ref = 1: clear it to 0, move on (second chance)',
      'hand sees a pinned frame: skip it, never evict',
      'hand sees ref = 0, unpinned: victim',
      'victim dirty: write it to disk first, then read G into the frame',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 6 frames, r = reference bit, pin = in use by a query. Illustrative.',
      header: s => ({ left: 'disk reads ' + (s.rd || 0) + ' · writes ' + (s.wr || 0), right: s.req ? 'request ' + s.req : 'buffer pool' }),
      decor(kit) { kit.el('circle', { cx: CX, cy: CY, r: CR, class: 'kring-track' }, kit.layer); },
      draw(P, s) {
        s.fr.forEach((f, i) => {
          const p = fpos(i), flags = f[2];
          const tone = s.victim === i ? 'bad' : (flags === 'pin' ? 't3' : (f[1] ? 'warn' : 'info'));
          P.chip('f' + i, { x: p.x, y: p.y, w: 84, h: 40, label: f[0], sub: 'r' + f[1] + (flags ? ' ' + flags : ''), tone, hl: s.hit === i });
        });
        if (s.hand != null) { const h = hpos(s.hand); P.chip('hand', { x: h.x, y: h.y, w: 56, h: 26, label: 'hand', tone: 'cursor', small: true }); }
        P.text('hc', { x: CX, y: CY + 4, t: 'clock', cls: 'mut sm', anchor: 'middle' });
        if (s.req) P.chip('req', { x: 420, y: 100, w: 150, h: 44, label: 'request ' + s.req, sub: s.hit != null ? 'hit' : 'miss', tone: s.hit != null ? 'ok' : 'cursor' });
        P.text('hd', { x: 420, y: 232, t: 'disk', cls: 'mut sm' });
        P.box('disk', { x: 420, y: 240, w: 190, h: 70, tone: 'mut', label: '' });
        if (s.io === 'write') P.chip('io', { x: 440, y: 254, w: 150, h: 40, label: 'write A', sub: 'dirty victim', tone: 'warn' });
        if (s.io === 'read') P.chip('io', { x: 440, y: 254, w: 150, h: 40, label: 'read ' + s.req, sub: 'into the frame', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'Six frames hold pages A to F. Every reference bit is 1, A is dirty, and C is pinned by a running query.', callout: 'The pool is full, every bit is 1', code: 0,
        state: { fr: frames(), hand: 0 }, stats: [{ l: 'free frames', v: '0', cls: 'warn' }] },
      { log: 'A query asks for page G. It is not in the pool and no frame is free, so the replacer must pick a victim.', callout: 'Miss on G, no free frame', code: 0,
        state: { fr: frames(), hand: 0, req: 'G' }, stats: [{ l: 'free frames', v: '0', cls: 'warn' }, { l: 'victims found', v: '0' }] },
      { log: 'The hand sees A with bit 1 and clears it, then B with bit 1 and clears it. Both get a second chance. The hand reaches C.', callout: 'Bit 1: clear it, move on', code: 1,
        state: { fr: frames({ 0: ['A', 0, 'dirty'], 1: ['B', 0, ''] }), hand: 2, req: 'G' }, stats: [{ l: 'bits cleared', v: '2', cls: 'warn' }] },
      { log: 'C is pinned, so the hand skips it. D, E and F are cleared in turn, and the hand completes a full lap back to A.', callout: 'Pinned frames are skipped', code: 2,
        state: { fr: frames({ 0: ['A', 0, 'dirty'], 1: ['B', 0, ''], 3: ['D', 0, ''], 4: ['E', 0, ''], 5: ['F', 0, ''] }), hand: 0, req: 'G' }, stats: [{ l: 'bits cleared', v: '5', cls: 'warn' }, { l: 'laps', v: '1' }] },
      { log: 'A has bit 0 and no pin, so A is the victim. A is dirty, so its page must go to disk before the frame can be reused.', callout: 'Victim A is dirty: write it first', moment: true, code: 4,
        state: { fr: frames({ 0: ['A', 0, 'dirty'], 1: ['B', 0, ''], 3: ['D', 0, ''], 4: ['E', 0, ''], 5: ['F', 0, ''] }), hand: 0, req: 'G', victim: 0, io: 'write', wr: 1 }, stats: [{ l: 'disk writes', v: '1', cls: 'bad' }, { l: 'the read waits', v: 'yes', cls: 'bad' }] },
      { log: 'Page G is read into the frame with bit 1, and the hand moves to B. One miss cost a lap of the clock, one write and one read.', callout: 'G loaded, hand moves on', code: 4,
        state: { fr: frames({ 0: ['G', 1, ''], 1: ['B', 0, ''], 3: ['D', 0, ''], 4: ['E', 0, ''], 5: ['F', 0, ''] }), hand: 1, req: 'G', io: 'read', rd: 1, wr: 1 }, stats: [{ l: 'disk reads', v: '1' }, { l: 'disk writes', v: '1' }] },
      { log: 'A later request for E finds it in the pool. A hit only sets E\'s bit back to 1, which protects it from the next sweep.', callout: 'A hit sets the bit back to 1', code: 1,
        state: { fr: frames({ 0: ['G', 1, ''], 1: ['B', 0, ''], 3: ['D', 0, ''], 4: ['E', 1, ''], 5: ['F', 0, ''] }), hand: 1, req: 'E', hit: 4, rd: 1, wr: 1 }, stats: [{ l: 'disk reads', v: '1' }, { l: 'hit', v: 'E', cls: 'ok' }] },
      { log: 'The next miss, page H, finds B at the hand with bit 0 and clean. B is evicted at once with no write and no lap.', callout: 'A clean victim at bit 0 costs one read', code: 3,
        state: { fr: frames({ 0: ['G', 1, ''], 1: ['H', 1, ''], 3: ['D', 0, ''], 4: ['E', 1, ''], 5: ['F', 0, ''] }), hand: 2, req: 'H', io: 'read', rd: 2, wr: 1 }, stats: [{ l: 'disk reads', v: '2' }, { l: 'disk writes', v: '1' }],
        takeaway: 'Clock approximates LRU with one bit per frame. The expensive miss is the one whose victim is dirty.' },
    ],
  };

  /* ---- 3. Scan flooding: a big scan pushes the hot pages out, unless it is held to a small ring ---- */
  const GX = i => 30 + (i % 4) * 108, GY = i => 100 + Math.floor(i / 4) * 66;
  const HOTC = ['h1', 'h2', 'h3', 'h4'];
  const fl = (arr, ring) => arr;
  const flood = {
    id: 'scan-flood', label: 'Scan floods the pool', desc: 'Eight frames hold four hot pages. A nightly scan with no limit takes every frame. A small ring for the scan leaves the hot pages alone (illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      'SELECT * FROM orders;   -- nightly export, 200 GB sequential scan',
      '-- every scanned page enters the pool as most recently used',
      '-- hot pages become the oldest and are evicted first',
      '-- point lookups now miss: shared read up, shared hit down',
      '-- fix: scans of big tables use a small ring of buffers (PostgreSQL: 256 kB)',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 frames, LRU order, 4 hot pages. Illustrative.',
      header: s => ({ left: 'lookup hit rate ' + (s.hit == null ? '100' : s.hit) + '%', right: s.ring ? 'scan limited to a ring' : 'scan uses the whole pool' }),
      draw(P, s) {
        P.text('hf', { x: 30, y: 82, t: 'buffer pool: 8 frames', cls: 'mut sm' });
        for (let i = 0; i < 8; i++) P.box('fr' + i, { x: GX(i), y: GY(i), w: 100, h: 54, tone: 'mut', label: '', dash: true, stroke: (s.ring && (i === 6 || i === 7)) ? 'cursor' : null });
        (s.pool || []).forEach(([id, slot, tone]) => P.chip('p' + id, { x: GX(slot) + 4, y: GY(slot) + 5, w: 92, h: 44, label: id, sub: id[0] === 'h' ? 'hot' : 'scan', tone: tone || (id[0] === 'h' ? 'live' : 'warn') }));
        if (s.ring) P.text('rg', { x: GX(6), y: GY(6) + 72, t: 'ring: 2 frames reused by the scan', cls: 'xs', });
        P.text('hd', { x: 490, y: 82, t: 'disk', cls: 'mut sm' });
        P.box('disk', { x: 480, y: 92, w: 134, h: 200, tone: 'mut', label: '' });
        (s.disk || []).forEach(([id, k]) => P.chip('d' + id, { x: 494, y: 104 + k * 50, w: 106, h: 40, label: id, sub: 'evicted', tone: 'bad' }));
        if (s.scan) P.chip('scan', { x: 30, y: 262, w: 150, h: 40, label: 'scan ' + s.scan, sub: 'sequential', tone: 'cursor' });
        if (s.look) P.chip('look', { x: 220, y: 262, w: 150, h: 40, label: 'lookup ' + s.look[0], sub: s.look[1], tone: s.look[1] === 'hit' ? 'ok' : 'bad' });
      }
    }),
    bug: [
      { log: 'Four hot pages (h1 to h4) sit in the 8-frame pool, and the other four frames are free. Point lookups on them are hits.', callout: 'Hot pages are cached', code: 0,
        state: { pool: HOTC.map((id, i) => [id, i]) }, stats: [{ l: 'lookup hit rate', v: '100%', cls: 'ok' }, { l: 'free frames', v: '4' }] },
      { log: 'The nightly export starts a sequential scan. Pages s1 and s2 are read into the free frames.', callout: 'The scan starts reading pages', code: 0,
        state: { pool: [...HOTC.map((id, i) => [id, i]), ['s1', 4], ['s2', 5]], scan: 's1, s2' }, stats: [{ l: 'free frames', v: '2' }, { l: 'lookup hit rate', v: '100%', cls: 'ok' }] },
      { log: 'Pages s3 and s4 fill the last frames. The pool is full, and the hot pages are now the oldest in LRU order.', callout: 'The pool is full, hot pages are oldest', code: 1,
        state: { pool: [...HOTC.map((id, i) => [id, i]), ['s1', 4], ['s2', 5], ['s3', 6], ['s4', 7]], scan: 's3, s4' }, stats: [{ l: 'free frames', v: '0', cls: 'warn' }] },
      { log: 'Scan pages s5 to s8 need frames. LRU evicts the oldest pages, which are the hot ones. The scan will never read those scan pages again.', callout: 'The scan evicts every hot page', moment: true, code: 2,
        state: { pool: [['s5', 0], ['s6', 1], ['s7', 2], ['s8', 3], ['s1', 4], ['s2', 5], ['s3', 6], ['s4', 7]], disk: HOTC.map((id, i) => [id, i]), scan: 's5 to s8', hit: 0 }, stats: [{ l: 'hot pages cached', v: '0', cls: 'bad' }, { l: 'lookup hit rate', v: '0%', cls: 'bad' }] },
      { log: 'A customer lookup for h2 now misses and reads from disk. This is the 3 second request in the incident (illustrative).', callout: 'The lookup misses and reads from disk', code: 3,
        state: { pool: [['s5', 0], ['s6', 1], ['s7', 2], ['s8', 3], ['s1', 4], ['s2', 5], ['s3', 6], ['s4', 7]], disk: HOTC.map((id, i) => [id, i]), look: ['h2', 'miss'], hit: 0 }, stats: [{ l: 'lookup latency', v: '3 s (illustrative)', cls: 'bad' }, { l: 'shared read', v: 'high', cls: 'bad' }] },
      { log: 'Now the fix. The scan is limited to a ring of two frames. It reuses those two frames for every page it reads and never touches the others.', callout: 'The scan gets a ring of 2 frames', code: 4,
        state: { ring: 1, pool: [...HOTC.map((id, i) => [id, i]), ['s1', 6], ['s2', 7]], scan: 's1, s2' }, stats: [{ l: 'frames the scan may use', v: '2', cls: 'ok' }, { l: 'lookup hit rate', v: '100%', cls: 'ok' }] },
      { log: 'The scan reads s3 and s4 into the same two frames and drops s1 and s2. The hot pages are never evicted.', callout: 'The ring recycles its own frames', code: 4,
        state: { ring: 1, pool: [...HOTC.map((id, i) => [id, i]), ['s3', 6], ['s4', 7]], scan: 's3, s4', look: ['h2', 'hit'] }, stats: [{ l: 'hot pages cached', v: '4', cls: 'ok' }, { l: 'lookup hit rate', v: '100%', cls: 'ok' }],
        takeaway: 'A page read once is not a hot page. Keep one-time scans in a small ring so they cannot push out the working set.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why pages</h3>
<p>Disk is far slower than memory, and a query can only work on data that is in RAM. So the database groups rows into fixed-size <b>pages</b>, usually 8 KB, and every disk read moves a whole page. A 200 GB table is about 25 million pages. A server with 16 GB of RAM can hold only a small part of it, so the question for every request is whether its page is already in memory.</p>

<h3>2. How a row sits in a page</h3>
<p>Most engines use a <b>slotted page</b>. A small header comes first. A <b>slot array</b> grows from the left, and the records are packed from the right. Each slot holds the offset and length of one record. The free space sits in one gap between them, and an insert shrinks the gap from both ends.</p>
<p>A row is found again by its <b>record ID</b>, the pair (page, slot). Because the ID goes through the slot, a record can move inside the page without changing its ID. A delete leaves a hole, and <b>compaction</b> slides records together to rebuild one gap. A <b>free-space map</b> tracks which pages still have room, so an insert does not scan the table to find one.</p>

<h3>3. The buffer pool</h3>
<p>The executor never reads the disk. It asks the <b>buffer pool manager</b> for a page ID. The manager looks in the <b>page table</b>, a map from page ID to <b>frame</b>, which is a fixed slot in RAM that holds one page. If the page is there, that is a <b>hit</b>. Otherwise it is a <b>miss</b>, and the manager must find a frame and read the page into it.</p>
<p>Each frame carries a <b>pin count</b>, the number of queries using the page right now, and a <b>dirty flag</b>, which says the page differs from the copy on disk. A pinned frame is never evicted. A dirty frame must be written back before its frame is reused, and the new read waits for that write.</p>

<h3>4. Choosing a victim</h3>
<p>When no frame is free, the <b>replacer</b> picks a victim among the unpinned frames. <b>LRU</b> evicts the page that was used longest ago. <b>Clock</b> approximates it with one reference bit per frame. A hand sweeps around the frames, clears each bit it finds set, and evicts the first unpinned frame whose bit is already 0. A hit sets the bit back to 1, so recently used pages survive a sweep.</p>
<p>Both policies share a weakness. A loop over 5 pages in a pool of 4 frames evicts, each time, the page needed next, so every request misses. And a one-time sequential scan looks to LRU like a long run of recently used pages, so it pushes out the pages that are really hot. This is why a nightly export can slow down lookups for the whole system.</p>

<h3>5. Defending the working set</h3>
<p>Real systems add scan resistance. PostgreSQL gives large sequential scans, VACUUM and COPY a small ring of 256 kB of buffers, so they recycle their own frames. InnoDB inserts new pages at the midpoint of its LRU list and promotes them only after a delay set by <code>innodb_old_blocks_time</code>. A background writer (<code>bgwriter_lru_maxpages</code>, <code>bgwriter_delay</code>) cleans dirty pages ahead of time so that a read does not wait for a write.</p>

<h3>6. The trade-off</h3>
<p>A larger pool means more hits, but it takes memory from the operating system cache and from per-query work. A smaller pool misses more. Read the numbers before you tune: the hit ratio, the dirty pages written by backends instead of the background writer, and which tables fill the pool. A ratio that falls only during one job points at scan flooding, not at the pool size.</p>

<h3>7. Syntax</h3>
<pre>-- how big is the pool, and how often do reads hit it
SHOW shared_buffers;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE id = 42;
--   Buffers: shared hit=4 read=0     (all from memory)

-- which relations fill the pool (extension pg_buffercache)
SELECT c.relname, count(*) AS buffers
FROM pg_buffercache b JOIN pg_class c ON b.relfilenode = c.relfilenode
GROUP BY c.relname ORDER BY buffers DESC LIMIT 5;

-- how many dirty pages did backends have to write themselves
SELECT buffers_clean, buffers_backend FROM pg_stat_bgwriter;

-- MySQL InnoDB scan resistance
SHOW VARIABLES LIKE 'innodb_old_blocks%';</pre>
<p>A large <code>shared read</code> next to a small <code>shared hit</code> means the working set does not fit, or a scan has pushed it out.</p>`;

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[1] = { explain: EXPLAIN, scenarios: [slotted, clock, flood] };
})();
