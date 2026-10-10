/* Chapter 3 "The Buffer Pool" (index 2, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L06 Buffer Pools. The page layout half of the old chapter now lives in chapter 2.
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: a clock sweep around the frames, a scan flooding the pool, and a miss that has to write a dirty victim first. Sizes and timings illustrative. */
(function () {
  const DB = window.DB;

  /* ---- 1. Clock sweep: a hand circles the frames, clears reference bits, and evicts the first unpinned frame at zero ---- */
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

  /* ---- 2. Scan flooding: a big scan pushes the hot pages out, unless it is held to a small ring ---- */
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

  const SOURCE = { label: 'CMU 15-445 L06 Buffer Pools (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/06-bufferpool.pdf' };

  /* ---- 3. A miss with a dirty victim: the read waits for a log flush and a page write ---- */
  const FR = i => ({ x: 236, y: 98 + i * 58 });
  const frameChip = (P, i, f, hl) => P.chip('f' + i, { ...FR(i), w: 176, h: 46, label: (f.p || 'free') + (f.p ? ' · pin ' + f.pin : ''), sub: f.dirty ? 'dirty' : (f.p ? 'clean' : 'empty'), tone: f.tone || (f.dirty ? 'warn' : f.p ? 'info' : 'mut'), hl });
  const dirtyVictim = {
    id: 'dirty-victim', label: 'Dirty victim', desc: 'A request misses and every frame is taken. The replacer picks an unpinned frame, and when that page is dirty the read waits for a log flush and a page write (timings illustrative).',
    codeLabel: 'Path',
    code: { bug: [
      'getPage(P9): page table has no entry for P9 -> miss',
      'free list is empty -> ask the replacer for a victim',
      'victim = frame 2, page P3, pin 0, dirty = true',
      'flush WAL up to the page LSN, then write P3 to disk',
      'read P9 into frame 2, pin = 1, return it',
      'background writer cleans P3 earlier -> the victim is clean, one I/O',
    ] },
    stage: DB.stage({
      footer: 'Simplified: four frames, one disk. Timings illustrative.',
      header: s => ({ left: 'I/Os the request waited for: ' + (s.io || 0), right: s.bg ? 'background writer on' : 'no background writer' }),
      draw(P, s) {
        P.text('hx', { x: 30, y: 82, t: 'executor', cls: 'mut sm' });
        P.text('hf', { x: 236, y: 82, t: 'frames in the buffer pool', cls: 'mut sm' });
        P.text('hd', { x: 470, y: 82, t: 'disk', cls: 'mut sm' });
        P.chip('req', { x: 30, y: 180, w: 150, h: 46, label: s.got ? 'P9 · got it' : 'need P9', sub: s.got ? 'pinned' : 'page table: miss', tone: s.got ? 'ok' : 'cursor' });
        (s.fr || []).forEach((f, i) => frameChip(P, i, f, s.vic === i));
        if (s.log) P.chip('log', { x: 462, y: 98, w: 150, h: 46, label: 'WAL flushed', sub: 'up to LSN of P3', tone: 'acc' });
        if (s.w) P.chip('dw', { x: 462, y: 170, w: 150, h: 46, label: 'write P3', sub: 'page to disk', tone: 'warn' });
        if (s.r) P.chip('dr', { x: 462, y: 242, w: 150, h: 46, label: 'read P9', sub: 'page from disk', tone: 'info' });
        if (s.vic != null) P.line('v', 180, 203, 236, FR(s.vic).y + 23, { tone: 'cursor', arrow: true, label: 'victim', dy: -8 });
        if (s.w || s.log) P.line('wl', 412, FR(2).y + 23, 462, 193, { tone: 'warn', arrow: true });
        if (s.r) P.line('rl', 462, 265, 412, FR(2).y + 30, { tone: 'ok', arrow: true });
      }
    }),
    bug: [
      { log: 'The executor needs page P9. The page table has no entry for it, so this is a miss. All four frames hold pages.', callout: 'P9 is not in the pool', code: 0,
        state: { fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P3', pin: 0, dirty: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'free frames', v: '0', cls: 'warn' }] },
      { log: 'The replacer looks for a frame with pin count 0. Frames 0, 1 and 3 are in use. Frame 2 holds P3 with no users, so it is the victim.', callout: 'Frame 2 is the only unpinned frame', code: 2,
        state: { vic: 2, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P3', pin: 0, dirty: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'victim', v: 'P3', cls: 'warn' }, { l: 'dirty', v: 'yes', cls: 'bad' }] },
      { log: 'P3 was changed in memory and not yet written. Before the page goes out, the log up to its LSN must be on disk: write-ahead logging.', callout: 'The log goes to disk first', moment: true, code: 3, io: 1,
        state: { vic: 2, log: 1, io: 1, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P3', pin: 0, dirty: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'I/Os waited', v: '1', cls: 'warn' }] },
      { log: 'Then the page itself is written. The request is still waiting, and the executor sees this as a slow read.', callout: 'Then the page is written', code: 3,
        state: { vic: 2, log: 1, w: 1, io: 2, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P3', pin: 0, dirty: 1, tone: 'bad' }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'I/Os waited', v: '2', cls: 'bad' }] },
      { log: 'Only now is the frame free. P9 is read into it with pin count 1.', callout: 'P9 is read into the freed frame', code: 4,
        state: { vic: 2, r: 1, io: 3, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P9', pin: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'I/Os waited', v: '3', cls: 'bad' }] },
      { log: 'The request waited for a log flush, a page write and a page read. A clean victim would have cost one read.', callout: 'Three waits instead of one', moment: true, code: 4,
        state: { got: 1, io: 3, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P9', pin: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'I/Os waited', v: '3', cls: 'bad' }, { l: 'read latency', v: 'spike', cls: 'bad' }] },
      { log: 'With a background writer, P3 was written during idle time and its dirty flag cleared. The replacer takes the same victim, and the read is one I/O.', callout: 'A clean victim costs one read', code: 5,
        state: { got: 1, bg: 1, io: 1, fr: [{ p: 'P1', pin: 2 }, { p: 'P2', pin: 1 }, { p: 'P9', pin: 1 }, { p: 'P4', pin: 1 }] }, stats: [{ l: 'I/Os waited', v: '1', cls: 'ok' }, { l: 'read latency', v: 'normal', cls: 'ok' }],
        takeaway: 'A dirty victim moves write work into the read path. Keep dirty pages flushed in the background so eviction finds clean frames.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why a pool</h3>
<p>Disk is far slower than memory, and a query can only work on data that is in RAM. The database groups rows into fixed-size <b>pages</b> (chapter 2) and keeps a bounded set of them in memory, the <b>buffer pool</b>. The executor never reads the disk. It asks the <b>buffer pool manager</b> for a page ID. The manager looks in the <b>page table</b>, a map from page ID to <b>frame</b>, a fixed slot in RAM that holds one page. Found is a <b>hit</b>. Not found is a <b>miss</b>, and the page is read into a free frame.</p>
<p>Why not leave this to the operating system? The OS page cache does not know which pages a query will need next, when a page is dirty and must not be flushed before its log record, or which pages to keep. The DBMS knows all three, so most systems bypass the OS cache with direct I/O (<code>O_DIRECT</code>) and manage their own pool. PostgreSQL is a notable exception: it keeps <code>shared_buffers</code> and still lets the OS cache pages beneath it.</p>
<figure class="mm" aria-label="Flowchart of fetching a page: page table lookup, free frame or victim, flush a dirty victim, read, pin" style="--diagram-width:360px">
  <img src="diagrams/ch02-get-page.svg" alt="Flowchart: the executor asks for page 9. If the page table has it, pin the frame and return it. Otherwise take a free frame, or ask the replacer for an unpinned victim. A clean victim is replaced directly. A dirty victim needs the log flushed up to its LSN and the page written first. Then page 9 is read in and pinned.">
  <figcaption>Flowchart: the path of one page request. The right-hand branch, a dirty victim, is the slow one.</figcaption>
</figure>

<h3>2. What a frame carries</h3>
<p>Each frame has a <b>pin count</b>, the number of queries using the page right now, and a <b>dirty flag</b>, which says the page differs from the copy on disk. A pinned frame is never evicted. A dirty frame must be written before it is reused. The page is lost only if a pin is never released, a bug that slowly drains the free frames.</p>
<figure class="mm" aria-label="State diagram of a frame: free, pinned, dirty, unpinned, evicted" style="--diagram-width:610px">
  <img src="diagrams/ch02-frame-states.svg" alt="State diagram: a frame starts free, becomes pinned when a page is loaded, becomes dirty when updated, becomes unpinned when the last user releases it, goes through a write to clear the dirty flag, and returns to free when the replacer evicts it.">
  <figcaption>State diagram of one frame. Only an unpinned, clean frame can be reused without a write.</figcaption>
</figure>

<h3>3. Choosing a victim</h3>
<p>When no frame is free, the <b>replacer</b> picks a victim among the unpinned frames. <b>LRU</b> evicts the page used longest ago. <b>Clock</b> approximates it with one reference bit per frame: a hand sweeps the frames, clears set bits and evicts the first unpinned frame whose bit is already clear. <b>LRU-K</b> keeps the last K access times per page and evicts the page whose K-th most recent access is oldest, so a page touched once does not look as important as a page touched often.</p>
<p>All of them have a weak spot. A loop over 5 pages in a pool of 4 frames evicts, each time, the page needed next, so every request misses. A one-time sequential scan looks to LRU like a long run of recent pages and pushes the real hot set out. This is <b>sequential flooding</b>.</p>

<h3>4. Defending the working set</h3>
<p>The lecture lists the usual remedies. <b>Localization</b>: each query evicts from its own small set of frames, so it cannot flood the pool. PostgreSQL gives large sequential scans, VACUUM and COPY a ring of 256 kB. <b>Priority hints</b>: the executor tells the pool a page matters, for example an index root. <b>Prefetching</b>: for a scan the next pages are known, so the pool reads them ahead. <b>Scan sharing</b>: a query joins a scan already in progress and reads the pages once for both. <b>Buffer pool bypass</b>: a scan or a sort uses private memory and never touches the pool. InnoDB uses midpoint insertion instead of a ring: new pages enter the old end and are promoted only if used again after <code>innodb_old_blocks_time</code>.</p>

<h3>5. Dirty pages and the background writer</h3>
<p>A dirty victim turns a read into a write plus a read. <b>Background writing</b> walks the page table and writes dirty pages while the system is idle, so the replacer finds clean frames. The rule it must obey is write-ahead logging: a page may go to disk only after the log records that changed it are on disk (chapter 24).</p>

<h3>6. The trade-off</h3>
<p>A larger pool means more hits, but it takes memory from the operating system cache and from per-query work. A smaller pool misses more. Writing dirty pages early keeps reads fast but writes pages that may be changed again. Read the numbers before you tune: the hit ratio, the dirty-page count and who writes the dirty pages.</p>

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
  /* problem, predict and diagnose (kept from the first version of this course) */
  const FIELDS = {
    "problem": "An order service keeps a 200 GB <code>orders</code> table on a database server with 16 GB of RAM (illustrative). Most customer lookups return in 2 ms, but some take 3 seconds, and a nightly report makes the slow ones common. The on-call engineer sees <code>EXPLAIN (ANALYZE, BUFFERS)</code> report a large <code>shared read</code> count and a small <code>shared hit</code> count for the slow queries.",
    "predict": {
      "q": "The pool has 4 frames and evicts the least recently used page (LRU). A report reads pages P1, P2, P3, P4, P5 in a loop, three times. How many of the 15 page requests are served from memory?",
      "opts": [
        "0: each page is evicted just before the loop needs it again",
        "11: only the first read of each page misses, the rest hit",
        "About 8: LRU keeps roughly half of the pages",
        "15: the database reads the whole table into RAM on the first pass"
      ],
      "ans": 0,
      "why": "With 5 pages and 4 frames, the page LRU evicts is always the one the loop asks for next. Every request misses, so the cache never helps until the pool holds the whole loop."
    },
    "diagnose": [
      {
        "t": "Thrashing",
        "sym": "<b>Hit rate</b> collapses once the working set stops fitting in the pool.",
        "ctx": "A report reads five pages in a loop, again and again. The pool has 4 frames, so each page is evicted just before it is needed again.",
        "why": "LRU evicts the page that was used longest ago, and in a loop that is exactly the page needed next. Every access misses, so the cache never helps.",
        "log": "-- representative output, counts illustrative\nIndex Scan using orders_customer_idx on orders  (actual time=0.041..2871.337 rows=14 loops=1)\n  Buffers: shared hit=212 read=18427\nExecution Time: 2871.802 ms",
        "note": "Run the same query twice. If <code>shared read</code> stays large and <code>shared hit</code> stays small, the working set is not staying cached.",
        "fix": [
          "Measure first: run <code>EXPLAIN (ANALYZE, BUFFERS)</code> twice on the same query, and read the per-table cache hit ratio from <code>pg_statio_user_tables</code> (<code>heap_blks_hit</code> against <code>heap_blks_read</code>).",
          "Size the pool to the hot set. The PostgreSQL documentation suggests starting <code>shared_buffers</code> at about 25% of RAM on a dedicated server, and leaving the rest to the OS page cache.",
          "Touch fewer pages per request: add an index that covers the predicate, or keep related rows together, so the hot set shrinks.",
          "Verify: run the same query twice after the change. The second run should show almost no <code>read</code>."
        ]
      },
      {
        "t": "Leaked pin",
        "sym": "<b>Free frames</b> run out after a few failed requests, and then the next request waits forever.",
        "ctx": "An error path in a storage extension returns early without unpinning. Each failed request leaves its frame pinned for the life of the process.",
        "why": "A pin is a reference count, and eviction needs the count at zero. Time never clears a missing unpin, so the unpinned frames drain until none are left.",
        "log": "-- representative MySQL/InnoDB output, wording varies by version\n[Warning] InnoDB: Difficult to find free blocks in the buffer pool (search iterations ...)!\n\nSHOW ENGINE INNODB STATUS;  ->  BUFFER POOL AND MEMORY: Free buffers 0",
        "note": "Free buffers at 0 with rising search iterations means no frame can be reused. Look for references that never went away.",
        "fix": [
          "Measure first: find the leaking path with diagnostics. In MySQL, <code>SHOW ENGINE INNODB STATUS</code> reports free buffers and pending reads; in PostgreSQL, the <code>pg_buffercache</code> extension shows what each buffer holds.",
          "Pair every pin with an unpin on every exit path. Use a guard that releases on scope exit: RAII in C++ or Rust, try-with-resources in Java, defer in Go.",
          "Add an assertion in debug and test builds: when a request ends, every frame it touched must have a pin count of zero.",
          "Verify: run the failing path 10,000 times in a test, then check that the number of free frames matches the count before the test."
        ]
      },
      {
        "t": "Scan flooding",
        "sym": "<b>Checkout</b> latency rises only while the nightly export runs.",
        "ctx": "A nightly export reads a 180 GB sales table once, page by page. It passes through the same buffer pool that serves checkout, so the checkout hot set is replaced every night.",
        "why": "LRU keeps the most recently used pages. A scan touches many pages exactly once, and each one is more recent than the hot pages, so the scan pushes them out. The export gains nothing from caching, yet it uses the cache that other queries need.",
        "log": "-- representative pg_stat_io (PostgreSQL 16+), counts illustrative\nbackend_type   | context  |   reads     |    hits\nclient backend | normal   |   412,908   |  9,811,002\nclient backend | bulkread | 1,920,000   |          0",
        "note": "A <code>bulkread</code> row with many reads and no hits is a scan. If <code>normal</code> reads rise in the same window, the hot set is being evicted.",
        "fix": [
          "Measure first: during the export, read <code>pg_stat_io</code> and compare reads in context <code>bulkread</code> with reads in context <code>normal</code>.",
          "Give large scans a bounded ring. PostgreSQL does this for large sequential scans, VACUUM and COPY: they reuse a small 256 kB ring of buffers instead of the whole pool.",
          "In MySQL/InnoDB, rely on midpoint insertion. Pages read by a scan enter the old sublist first; <code>innodb_old_blocks_time</code> (default 1000 ms) delays promotion, and <code>innodb_old_blocks_pct</code> sets the old-sublist share.",
          "Move the export to a replica or to an off-peak window, so it does not compete with the hot set on the primary.",
          "Verify: compare checkout p99 latency and <code>pg_stat_io</code> reads in context <code>normal</code> across two export runs, before and after the change."
        ]
      },
      {
        "t": "Dirty eviction",
        "sym": "<b>Read latency</b> spikes during write bursts, while disk read throughput looks normal.",
        "ctx": "An order-ingest service updates about 8,000 rows a second. The background writer cannot flush pages as fast as writers dirty them, so most frames a reader needs hold changes that are not on disk yet.",
        "why": "A frame cannot be reused while it holds unsaved changes. A backend that needs a frame and finds a dirty victim must write it first, so the read waits on a write. That is background flushing work done inside the query path.",
        "log": "-- representative pg_stat_bgwriter (PostgreSQL 16 and earlier), counts illustrative\n buffers_clean | buffers_alloc | buffers_backend\n   1,203,411   |  9,870,114   |   6,402,955   <- written by query backends",
        "note": "A rising <code>buffers_backend</code> means query backends are doing the writer&rsquo;s job. PostgreSQL 17 moved these counts into <code>pg_stat_io</code>.",
        "fix": [
          "Measure first: track <code>buffers_backend</code> (or writes by backend in <code>pg_stat_io</code>) as a rate. It should stay small next to background writes.",
          "Keep the background writer ahead of the workload: raise <code>bgwriter_lru_maxpages</code> and lower <code>bgwriter_delay</code>, so dirty pages are written before a backend needs their frames.",
          "Spread the writes: commit in smaller batches so dirty pages reach disk steadily, instead of in one burst. Checkpoint I/O bursts are a separate mechanism, covered in chapter 24.",
          "Verify: replay the same write burst and compare p99 read latency before and after the change."
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [clock, flood, dirtyVictim] };
})();
