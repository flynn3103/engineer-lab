/* Chapter 6 "Deletes, TTL and Tombstones": scenes and Explain override (index 6, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict and diagnose come from the course. The four scenes replace the
   reproduce-and-fix playground: each one is a syntax-driven mechanism, with no bug or fix mode.
   Timestamps and sizes are illustrative. */
(function () {
  const base = window.COURSE;
  const FOOT = 'Simplified: one replica, illustrative timestamps. Other replicas are not shown.';
  const X = { coord: 26, commit: 186, mem: 330, disk: 486 };
  const P4 = [
    { id: 'coord', x: 16, y: 58, w: 150, h: 290, title: 'Coordinator', tone: 'info' },
    { id: 'commit', x: 180, y: 58, w: 130, h: 290, title: 'Commit log', tone: 'info' },
    { id: 'mem', x: 324, y: 58, w: 140, h: 290, title: 'Memtable', tone: 'info' },
    { id: 'disk', x: 478, y: 58, w: 146, h: 290, title: 'SSTables on disk', tone: 'info' },
  ];
  const rows = (ys, extra = {}) => Object.fromEntries(ys.map(([id, y]) => [id, { x: X.disk, y, ...(extra[id] || {}) }]));

  /* ================= shared drawing parts: tape cell, read head, gc_grace dial ================= */
  const mx = (c, p) => `color-mix(in srgb, var(--${c}) ${p}%, var(--card))`;
  const EASE = 'cubic-bezier(.3,.7,.2,1)';
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TR = RM ? 'none' : `transform .6s ${EASE}, opacity .45s`;
  const TRC = RM ? 'none' : 'fill .45s, stroke .45s, stroke-width .3s';

  /* cell looks: live row, tombstone (gravestone), shadow (older row hidden by a newer marker), expired TTL cell,
     stale copy, resurrected copy, and a purged (empty) slot */
  const LOOK = {
    '': { fill: 'transparent', stroke: 'var(--line)', dash: '4 3', sw: 1.3, op: 1, ic: '' },
    live: { fill: mx('ok', 26), stroke: 'var(--ink)', dash: '', sw: 1.4, op: 1, ic: 'row' },
    tomb: { fill: mx('bad', 18), stroke: 'var(--bad)', dash: '5 3', sw: 1.8, op: 1, ic: 'tomb' },
    shadow: { fill: mx('ok', 10), stroke: 'var(--mut)', dash: '3 3', sw: 1.3, op: 0.6, ic: 'row', strike: true },
    expired: { fill: mx('warn', 30), stroke: 'var(--warn)', dash: '4 3', sw: 1.8, op: 1, ic: 'row' },
    stale: { fill: mx('warn', 30), stroke: 'var(--warn)', dash: '', sw: 1.8, op: 1, ic: 'row' },
    bad: { fill: mx('bad', 26), stroke: 'var(--bad)', dash: '', sw: 2.2, op: 1, ic: 'row' },
    gone: { fill: 'transparent', stroke: 'var(--line)', dash: '2 4', sw: 1.2, op: 0.75, ic: '' },
  };
  /* one tape cell. o: {w, h, ic: {x, y, s} icon spot, rowIc: draw the little "row" lines, ty / sy: text baselines}.
     set({x, y, id, sub, look, show, dim, hl}) moves and recolours it. */
  function cell(kit, parent, o) {
    const w = o.w, h = o.h, ic = o.ic || { x: w - 11, y: 11, s: 0.75 };
    const g = kit.el('g', null, parent); g.style.transition = TR; g.style.opacity = 0;
    const r = kit.el('rect', { x: 0, y: 0, width: w, height: h, rx: o.rx || 6 }, g); r.style.transition = TRC;
    const strike = kit.el('line', { x1: 4, y1: h - 4, x2: w - 4, y2: 4, 'stroke-width': 1.6 }, g);
    strike.style.stroke = 'var(--bad)'; strike.style.transition = 'opacity .4s'; strike.style.opacity = 0;
    const gs = kit.el('g', null, g); gs.style.transition = 'opacity .4s'; gs.style.opacity = 0;
    gs.style.transform = `translate(${ic.x}px,${ic.y}px) scale(${ic.s})`;
    const p1 = kit.el('path', { d: 'M-6 8 V-2.5 A6 6 0 0 1 6 -2.5 V8 Z', 'stroke-width': 1.7 }, gs); p1.style.fill = 'var(--card)'; p1.style.stroke = 'var(--bad)';
    const p2 = kit.el('path', { d: 'M0 -5.5 V2 M-3 -2 H3', 'stroke-width': 1.7, fill: 'none' }, gs); p2.style.stroke = 'var(--bad)';
    const rw = kit.el('path', { d: 'M-6 -4 H6 M-6 0 H6 M-6 4 H2', 'stroke-width': 1.7, fill: 'none' }, g);
    rw.style.stroke = 'var(--ink)'; rw.style.transition = 'opacity .4s'; rw.style.opacity = 0; rw.style.transform = `translate(${ic.x}px,${ic.y}px)`;
    const t = kit.text(g, { x: w / 2, y: o.ty != null ? o.ty : 16, t: '', cls: 'b sm', anchor: 'middle' });
    const s = kit.text(g, { x: w / 2, y: o.sy != null ? o.sy : h - 8, t: '', cls: 'xs mut', anchor: 'middle' });
    const st = { x: 0, y: 0, id: '', sub: '', look: '', show: true, dim: false, hl: false };
    const api = {
      g, st,
      set(p) {
        Object.assign(st, p);
        const L = LOOK[st.look] || LOOK[''];
        g.style.transform = `translate(${st.x}px,${st.y}px)`;
        g.style.opacity = st.show ? (st.dim ? L.op * 0.4 : L.op) : 0;
        r.style.fill = L.fill; r.style.stroke = st.hl ? 'var(--acc2)' : L.stroke; r.style.strokeWidth = st.hl ? 3 : L.sw; r.style.strokeDasharray = L.dash || 'none';
        gs.style.opacity = L.ic === 'tomb' ? 1 : 0;
        rw.style.opacity = L.ic === 'row' && o.rowIc ? 1 : 0;
        strike.style.opacity = L.strike ? 1 : 0;
        t.set(st.id); s.set(st.sub);
        return api;
      },
    };
    return api.set({});
  }

  /* the read head: a triangle on top, a dashed beam down through the tapes, a label */
  function readHead(kit, o) {
    const g = kit.el('g', null, kit.layer); g.style.transition = TR; g.style.opacity = 0;
    if (o.bot) { const b = kit.el('line', { x1: 0, x2: 0, y1: o.top + 8, y2: o.bot, 'stroke-width': 2 }, g); b.style.stroke = 'var(--acc2)'; b.style.strokeDasharray = '4 3'; }
    const tri = kit.el('path', { d: `M-7 ${o.top - 4} L7 ${o.top - 4} L0 ${o.top + 8} Z`, 'stroke-width': 1.2 }, g); tri.style.fill = 'var(--acc2)'; tri.style.stroke = 'var(--ink)';
    const lab = kit.text(g, { x: 0, y: o.top - 9, t: o.label || 'read', cls: 'b sm', anchor: 'middle' }); lab.el.style.fill = 'var(--acc2)';
    return { set(x, on, label) { g.style.transform = `translate(${x}px,0px)`; g.style.opacity = on ? 1 : 0; if (label != null) lab.set(label); } };
  }

  /* the gc_grace clock: ten day ticks, a sweeping arc and a hand. set(f 0..1, tone, centre text, sub text) */
  function dial(kit, o) {
    const g = kit.el('g', { transform: `translate(${o.cx},${o.cy})` }, kit.layer), r = o.r;
    const track = kit.el('circle', { r, fill: 'none', 'stroke-width': 8 }, g); track.style.stroke = 'var(--soft)';
    for (let d = 0; d < 10; d++) {
      const a = d * 36 * Math.PI / 180, x1 = Math.sin(a) * (r + 7), y1 = -Math.cos(a) * (r + 7), x2 = Math.sin(a) * (r + 12), y2 = -Math.cos(a) * (r + 12);
      const tk = kit.el('line', { x1, y1, x2, y2, 'stroke-width': d === 0 ? 2.4 : 1.4 }, g); tk.style.stroke = 'var(--mut)';
    }
    const arc = kit.el('circle', { r, fill: 'none', 'stroke-width': 8, pathLength: 100, transform: 'rotate(-90)' }, g);
    arc.style.strokeDasharray = '100 100'; arc.style.strokeDashoffset = 100; arc.style.transition = RM ? 'none' : 'stroke-dashoffset .8s cubic-bezier(.3,.7,.2,1), stroke .4s'; arc.style.stroke = 'var(--acc)';
    const hand = kit.el('line', { x1: 0, y1: 0, x2: 0, y2: -(r - 4), 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g);
    hand.style.stroke = 'var(--ink)'; hand.style.transition = RM ? 'none' : `transform .8s ${EASE}`;
    const hub = kit.el('circle', { r: 3.4 }, g); hub.style.fill = 'var(--ink)';
    const big = kit.text(g, { x: 0, y: r + 30, t: '', cls: 'b', anchor: 'middle' });
    const sub = kit.text(g, { x: 0, y: r + 45, t: '', cls: 'xs mut', anchor: 'middle' });
    return {
      set(f, tone, text, note) {
        f = Math.max(0, Math.min(1, f));
        arc.style.strokeDashoffset = 100 - f * 100; arc.style.stroke = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--acc)';
        hand.style.transform = `rotate(${f * 360}deg)`;
        big.set(text || ''); big.el.setAttribute('class', 'kt b' + (tone ? ' tone-' + tone : '')); sub.set(note || '');
      },
    };
  }

  /* ---- 1. The work-queue read: a read head walks the tape and counts the cells it scans ---- */
  const Q = { x0: 22, pitch: 37, cw: 33, y: 134, h: 58 };
  const qx = i => Q.x0 + i * Q.pitch;
  const fmtN = n => Number(n).toLocaleString('en-US');
  const queueScan = {
    id: 'queue-scan', label: 'Queue scans tombstones', desc: 'A work queue is one partition. Six deleted tasks sit ahead of the first live one, and every read walks past them (counts illustrative).',
    codeLabel: 'CQL', code: { bug: [
      "DELETE FROM tasks WHERE queue = 'fulfil' AND task_id = ?;   -- after processing",
      "SELECT * FROM tasks WHERE queue = 'fulfil' LIMIT 1;   -- oldest live task",
      "SELECT * FROM tasks WHERE queue = 'fulfil' AND task_id > ? LIMIT 1;   -- bounded" ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one partition on one replica. Counts and latencies are illustrative.',
      header: s => ({ left: `cells scanned ${fmtN(s.sc || 0)} · rows returned ${s.ret || 0}`, right: s.r || '' }),
      setup(kit) {
        const L = kit.layer;
        kit.text(L, { x: 24, y: 84, t: "partition  queue = 'fulfil'", cls: 'b' });
        kit.text(L, { x: 616, y: 84, t: 'sorted by task_id  →', cls: 'mut sm', anchor: 'end' });
        kit.el('rect', { class: 'pbox tone-info', x: 14, y: 100, width: 612, height: 112, rx: 12 }, L);
        const cells = Array.from({ length: 16 }, () => cell(kit, L, { w: Q.cw, h: Q.h, ic: { x: Q.cw / 2, y: 33, s: 1 }, rowIc: true, ty: 15, sy: Q.h - 6 }));
        const gap = kit.el('g', null, L); gap.style.transition = TR; gap.style.opacity = 0;
        const gr = kit.el('rect', { x: qx(3), y: Q.y, width: 3 * Q.pitch - 4, height: Q.h, rx: 6, 'stroke-width': 1.8 }, gap); gr.style.fill = mx('bad', 18); gr.style.stroke = 'var(--bad)'; gr.style.strokeDasharray = '5 3';
        kit.text(gap, { x: qx(3) + (3 * Q.pitch - 4) / 2, y: Q.y + 26, t: '49,997 more', cls: 'b sm', anchor: 'middle' });
        kit.text(gap, { x: qx(3) + (3 * Q.pitch - 4) / 2, y: Q.y + 42, t: 'tombstones', cls: 'xs mut', anchor: 'middle' });
        const trail = Array.from({ length: 16 }, (_, i) => { const c = kit.el('circle', { cx: qx(i) + Q.cw / 2, cy: Q.y + Q.h + 12, r: 3.6 }, L); c.style.fill = 'var(--acc2)'; c.style.transition = 'opacity .35s'; c.style.opacity = 0; return c; });
        const gapTrail = kit.el('rect', { x: qx(3), y: Q.y + Q.h + 8, width: 3 * Q.pitch - 4, height: 7, rx: 3.5 }, L); gapTrail.style.fill = 'var(--acc2)'; gapTrail.style.transition = 'opacity .35s'; gapTrail.style.opacity = 0;
        const bar = (x, tone) => { const b = kit.el('rect', { x, y: 224, width: 16 * Q.pitch - 4, height: 4, rx: 2 }, L); b.style.fill = `var(--${tone})`; b.style.transformBox = 'fill-box'; b.style.transformOrigin = 'left center'; b.style.transition = RM ? 'none' : `transform .6s ${EASE}, opacity .4s`; return b; };
        const tb = bar(qx(0), 'bad'), lb = bar(qx(0), 'ok');
        const tl = kit.text(L, { x: qx(0), y: 244, t: '', cls: 'sm tone-bad' }), ll = kit.text(L, { x: qx(6), y: 244, t: '', cls: 'sm tone-ok' });
        const head = readHead(kit, { top: 122, label: 'read' });
        kit.panel(L, { x: 16, y: 254, w: 262, h: 84, title: 'cells scanned' });
        const big = kit.text(L, { x: 30, y: 318, t: '0', cls: 'b' }); big.el.style.fontSize = '30px';
        const sk = kit.text(L, { x: 264, y: 298, t: '', cls: 'sm mut', anchor: 'end' }), rt = kit.text(L, { x: 264, y: 318, t: '', cls: 'sm', anchor: 'end' });
        kit.panel(L, { x: 290, y: 254, w: 334, h: 84, title: 'read latency (illustrative)' });
        const bars = kit.bars(L, { x: 304, y: 288, w: 306, labelW: 76, rowH: 24, max: 400, items: [{ id: 'full', label: 'full read' }, { id: 'slice', label: 'bounded' }] });
        return { cells, gap, trail, gapTrail, tb, lb, tl, ll, head, big, sk, rt, bars };
      },
      frame(s, kit, R) {
        const n = s.n || 0, huge = !!s.huge, head = s.head == null ? -1 : s.head, slice = s.mode === 'slice', sc = s.sc || 0, ret = s.ret || 0;
        R.cells.forEach((c, i) => {
          const tomb = i < n;
          c.set({ x: qx(i), y: Q.y, id: huge && !tomb ? '' : String(i + 1), sub: tomb ? 'DEL' : 'live', look: tomb ? 'tomb' : 'live', show: !(huge && i >= 3 && i <= 5), dim: slice && tomb, hl: i === head && !tomb });
        });
        R.gap.style.opacity = huge ? (slice ? 0.4 : 1) : 0;
        R.trail.forEach((c, i) => { c.style.opacity = head >= 0 && (slice ? i === head : i <= head) && !(huge && i >= 3 && i <= 5) ? 1 : 0; });
        R.gapTrail.style.opacity = huge && !slice && head >= 6 ? 1 : 0;
        R.head.set(qx(Math.max(head, 0)) + Q.cw / 2, head >= 0, 'read');
        R.tb.style.transform = `scaleX(${n ? (n * Q.pitch - 4) / (16 * Q.pitch - 4) : 0})`; R.tb.style.opacity = n ? 1 : 0;
        R.lb.style.transform = `translate(${n * Q.pitch}px,0px) scaleX(${(16 - n) * Q.pitch - 4 > 0 ? ((16 - n) * Q.pitch - 4) / (16 * Q.pitch - 4) : 0})`;
        R.tl.set(n ? `${huge ? '50,000' : n} tombstone${huge || n > 1 ? 's' : ''}${slice ? ' · never visited' : ''}` : '');
        R.ll.set(n ? '10 live tasks' : '16 tasks waiting'); R.ll.el.setAttribute('x', qx(Math.max(n + 1, 7)));
        R.big.set(fmtN(sc)); R.big.el.setAttribute('class', 'kt b tone-' + (sc >= 100 ? 'bad' : sc > 1 ? 'warn' : 'ok'));
        R.sk.set(sc ? 'skipped ' + fmtN(Math.max(0, sc - ret)) : ''); R.rt.set(ret ? 'returned ' + ret : '');
        const lat = s.lat || {};
        R.bars.set('full', lat.full || 0, lat.full > 100 ? 'bad' : 'ok', lat.full ? lat.full + ' ms' : '-');
        R.bars.set('slice', lat.slice || 0, 'ok', lat.slice ? lat.slice + ' ms' : '-');
      },
    },
    bug: [
      { log: 'A work queue lives in one partition. Its tasks, sorted by task_id, lie along a tape. Sixteen tasks are waiting, and workers take the oldest first.',
        callout: 'One queue is one partition: one tape of cells', code: 0, state: { r: '16 tasks waiting' },
        stats: [{ l: 'tasks waiting', v: '16' }, { l: 'tombstones', v: '0', cls: 'ok' }] },
      { log: 'A worker processes task 1 and deletes it. The cell is not erased. A tombstone, drawn as a gravestone, is written at task 1’s place.',
        callout: 'A delete leaves a gravestone, not an empty slot', code: 0, state: { n: 1, r: 'DELETE task 1' },
        stats: [{ l: 'tombstones', v: '1', cls: 'warn' }, { l: 'live tasks', v: '15' }] },
      { log: 'Tasks 2 to 6 follow. Six gravestones now sit at the front of the partition, in front of ten live tasks.',
        callout: 'Six gravestones in front of ten live tasks', code: 0, state: { n: 6, r: '6 tasks deleted' },
        stats: [{ l: 'tombstones', v: '6', cls: 'warn' }, { l: 'live tasks', v: '10', cls: 'ok' }] },
      { log: 'The next worker asks for the oldest live task with LIMIT 1. The read starts at the front of the tape, so its first cell is task 1: a tombstone.',
        callout: 'The read starts at the front: cell 1 is a tombstone', code: 1, state: { n: 6, head: 0, sc: 1, r: 'SELECT … LIMIT 1' },
        stats: [{ l: 'cells scanned', v: '1' }, { l: 'rows returned', v: '0' }] },
      { log: 'It cannot skip ahead. It visits tombstones 2 to 6 in order, reads each one from the files and throws it away. Six cells scanned, and still no row.',
        callout: 'Six cells scanned, still no row to return', code: 1, state: { n: 6, head: 5, sc: 6, r: 'walking the tombstones' },
        stats: [{ l: 'cells scanned', v: '6', cls: 'warn' }, { l: 'rows returned', v: '0', cls: 'warn' }] },
      { log: 'Cell 7 is the first live task. The read stops and returns it. It scanned seven cells to return one row, so the work is the cells walked, not the rows returned.',
        callout: 'Scanned 7 cells to return 1 row', moment: true, code: 1, state: { n: 6, head: 6, sc: 7, ret: 1, lat: { full: 2 }, r: 'returned task 7' },
        stats: [{ l: 'cells scanned', v: '7', cls: 'warn' }, { l: 'rows returned', v: '1' }, { l: 'latency', v: '2 ms', cls: 'ok' }] },
      { log: 'Hours later, 50,000 deleted tasks sit ahead of the same ten live ones (illustrative). Every LIMIT 1 read walks all of them, and latency climbs from 2 ms to 320 ms (illustrative).',
        callout: 'Still 10 live tasks, but now 50,007 cells scanned', code: 1, state: { n: 6, huge: true, head: 6, sc: 50007, ret: 1, lat: { full: 320 }, r: '50,000 tombstones' },
        stats: [{ l: 'cells scanned', v: '50,007', cls: 'bad' }, { l: 'latency', v: '320 ms', cls: 'bad' }, { l: 'live tasks', v: '10', cls: 'ok' }] },
      { log: 'The fix: bound the read. Starting after the last processed id puts the read straight onto the first live cell. The tombstones behind it are never visited.',
        callout: 'Start after the last processed id: one cell scanned', code: 2, state: { n: 6, huge: true, mode: 'slice', head: 6, sc: 1, ret: 1, lat: { full: 320, slice: 2 }, r: 'bounded read' },
        stats: [{ l: 'cells scanned', v: '1', cls: 'ok' }, { l: 'latency', v: '2 ms', cls: 'ok' }],
        takeaway: 'A read walks every tombstone ahead of it. Start after the processed rows and it scans 1 cell, not 50,007.' },
    ],
  };

  /* ---- 2. DELETE a row: the tombstone is a new record and travels the write path ---- */
  const deleteRow = {
    id: 'delete-row', label: 'DELETE a row', desc: 'One DELETE. The tombstone is a new record: watch it travel the write path, then what reads and compaction do with it.',
    codeLabel: 'CQL', code: { bug: ["DELETE FROM tasks", "WHERE queue = 'main' AND task_id = 42;", 'SELECT * FROM tasks', "WHERE queue = 'main' AND task_id = 42;"] },
    scene: { w: 640, h: 420, footer: FOOT, panels: P4, tokens: {
      a1: { label: 'task 42', sub: 'resize · t1', tone: 'live', w: 118 },
      d1: { label: 'DEL 42', sub: 'tombstone · t2', tone: 'delete', w: 118 },
      r1: { label: 'read 42', sub: 'cursor', tone: 'cursor', w: 118 },
      res: { label: 'no row', sub: 'result', tone: 'bad', w: 118 },
      m1: { label: 'merged', sub: 'tombstone kept', tone: 'delete', w: 118 } } },
    bug: [
      { log: 'Start: the replica holds task 42 in SSTable-1, written at t1.', callout: 'A row exists on disk: task 42 = resize', at: rows([['a1', 110]]), badge: { disk: 'SSTable-1' }, stats: [{ l: 'records on disk', v: '1' }] },
      { log: 'DELETE leaves the coordinator as a mutation stamped t2. It does not touch SSTable-1.', callout: 'DELETE is a new record, not an edit', code: 0,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.coord, y: 110 } }, stats: [{ l: 'records on disk', v: '1' }] },
      { log: 'The replica appends the tombstone to the commit log first, so a crash cannot lose the delete.', callout: 'Commit log: append only', code: 0,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.commit, y: 110 } }, badge: { commit: 'append only', disk: 'SSTable-1' }, stats: [{ l: 'records on disk', v: '1' }] },
      { log: 'The tombstone is written into the memtable, in memory.', callout: 'Memtable: sorted, in memory', code: 0,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.mem, y: 110 } }, badge: { mem: 'in memory', disk: 'SSTable-1' }, stats: [{ l: 'records on disk', v: '1' }] },
      { log: 'The memtable is flushed to SSTable-2. Files are never edited, so SSTable-1 still holds the old value.', callout: 'Nothing was erased: two records now exist', moment: true,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.disk, y: 170 } }, badge: { disk: 'SSTable-1 · SSTable-2', mem: 'empty' }, stats: [{ l: 'records on disk', v: '2', cls: 'warn' }] },
      { log: 'A read merges both files. Timestamp t2 is newer than t1, so the tombstone wins for task 42.', callout: 'Newest timestamp wins, per cell', code: 2,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.disk, y: 170 }, r1: { x: X.coord, y: 110 } }, arrows: [['r1', 'd1', 't2 > t1']], stats: [{ l: 'records on disk', v: '2' }] },
      { log: 'The read returns no row. Task 42 is hidden, although its old value is still on disk.', callout: 'Result: no row', code: 2,
        at: { a1: { x: X.disk, y: 110 }, d1: { x: X.disk, y: 170 }, r1: { x: X.coord, y: 110 }, res: { x: X.coord, y: 200 } }, arrows: [['r1', 'res', 'return']],
        stats: [{ l: 'records on disk', v: '2' }, { l: 'read returns', v: '0', cls: 'bad' }] },
      { log: 'Compaction merges both files. It keeps the tombstone, because gc_grace_seconds has not passed yet.', callout: 'Compaction keeps tombstones until gc_grace ends', badge: { disk: 'SSTable-3' },
        at: { m1: { x: X.disk, y: 110 }, r1: { x: X.coord, y: 110 }, res: { x: X.coord, y: 200 } }, stats: [{ l: 'records on disk', v: '1', cls: 'warn' }] },
      { log: 'After gc_grace_seconds and repair, compaction purges the tombstone. Nothing is left on disk.', callout: 'Space comes back only now', at: {},
        stats: [{ l: 'records on disk', v: '0', cls: 'ok' }], takeaway: 'A DELETE is a new record. Space comes back only after compaction, and only after gc_grace_seconds and repair.' },
    ],
  };

  /* ---- 2. Range and partition delete: one marker shadows many rows ---- */
  const RW = [['rw1', 190], ['rw2', 240], ['rw3', 290]];
  const rowsTok = { rw1: { label: 'task 1', sub: '@t1 live', tone: 'live', w: 118 }, rw2: { label: 'task 2', sub: '@t1 live', tone: 'live', w: 118 }, rw3: { label: 'task 3', sub: '@t1 live', tone: 'live', w: 118 } };
  const rangeDel = {
    id: 'range', label: 'Range / partition', desc: 'One statement, one marker. A range or partition tombstone hides many rows without touching them.',
    codeLabel: 'CQL', code: { bug: ["DELETE FROM tasks WHERE queue = 'main' AND task_id < 3;", "DELETE FROM tasks WHERE queue = 'main';"] },
    scene: { w: 640, h: 420, footer: FOOT, panels: P4, tokens: { ...rowsTok,
      rng: { label: 'RANGE DEL', sub: 'task_id < 3', tone: 'delete', w: 130, h: 138 },
      pt: { label: 'PARTITION DEL', sub: 'queue = main', tone: 'delete', w: 130, h: 190 },
      r1: { label: 'read', sub: 'cursor', tone: 'cursor', w: 118 },
      res: { label: 'task 3', sub: 'returned', tone: 'ok', w: 118 } } },
    bug: [
      { log: 'Three rows are on disk, written at t1. Nothing is deleted yet.', callout: 'Three live rows: task 1, 2 and 3', at: rows(RW), stats: [{ l: 'rows live', v: '3' }, { l: 'markers', v: '0' }] },
      { log: 'DELETE … WHERE task_id < 3 is one statement. It writes one range tombstone, not one per row.', callout: 'One statement, one marker', code: 0,
        at: { ...rows(RW), rng: { x: X.coord, y: 110 } }, stats: [{ l: 'rows live', v: '3' }, { l: 'markers', v: '1' }] },
      { log: 'The range tombstone goes to the commit log, then to the memtable.', callout: 'Same write path as any other mutation', code: 0,
        at: { ...rows(RW), rng: { x: X.mem, y: 110 } }, badge: { mem: 'in memory' }, stats: [{ l: 'rows live', v: '3' }, { l: 'markers', v: '1' }] },
      { log: 'The memtable is flushed. The marker goes into a new SSTable beside the rows, which are not edited.', callout: 'The rows are untouched on disk', code: 0,
        at: { ...rows(RW), rng: { x: X.disk, y: 110 } }, badge: { disk: 'SSTable-1 · SSTable-2' }, stats: [{ l: 'rows live', v: '3' }, { l: 'markers', v: '1' }] },
      { log: 'The marker slides down over task 1 and task 2. It shadows them without touching them.', callout: 'One marker shadows the rows under it', moment: true, code: 0,
        at: { ...rows(RW, { rw1: { tone: 'warn', sub: 'shadowed' }, rw2: { tone: 'warn', sub: 'shadowed' } }), rng: { x: X.disk, y: 152 } },
        badge: { disk: 'SSTable-1 · SSTable-2' }, stats: [{ l: 'rows live', v: '1' }, { l: 'shadowed', v: '2', cls: 'warn' }] },
      { log: 'A read walks the rows. Tasks 1 and 2 are shadowed, so it returns task 3 only.', callout: 'Read cost: rows walked, rows returned', code: 0,
        at: { ...rows(RW, { rw1: { tone: 'warn', sub: 'shadowed' }, rw2: { tone: 'warn', sub: 'shadowed' } }), rng: { x: X.disk, y: 152 }, r1: { x: X.coord, y: 110 }, res: { x: X.coord, y: 200 } },
        arrows: [['r1', 'rw3', 'read']], stats: [{ l: 'rows walked', v: '3' }, { l: 'shadowed', v: '2', cls: 'warn' }, { l: 'returned', v: '1', cls: 'ok' }] },
      { log: 'Partition delete: DELETE FROM tasks WHERE queue = main writes one partition tombstone. It shadows every row in the partition.', callout: 'A partition marker shadows all rows', code: 1,
        at: { ...rows(RW, { rw1: { tone: 'warn', sub: 'shadowed' }, rw2: { tone: 'warn', sub: 'shadowed' }, rw3: { tone: 'warn', sub: 'shadowed' } }), pt: { x: X.disk, y: 152 } },
        stats: [{ l: 'markers', v: '2' }, { l: 'rows shadowed', v: '3', cls: 'warn' }] },
      { log: 'Both markers stay until compaction purges them after gc_grace_seconds. Every read still has to skip the shadowed rows.', callout: 'Markers cost reads until compaction',
        at: { ...rows(RW, { rw1: { tone: 'warn', sub: 'shadowed' }, rw2: { tone: 'warn', sub: 'shadowed' }, rw3: { tone: 'warn', sub: 'shadowed' } }), pt: { x: X.disk, y: 152 } },
        stats: [{ l: 'markers', v: '2' }, { l: 'rows shadowed', v: '3', cls: 'warn' }], takeaway: 'One range or partition marker can hide thousands of rows. Every read must honour it until compaction purges it.' },
    ],
  };

  /* ---- 3. DROP TABLE: a schema change, no tombstones ---- */
  const NODES = [
    { id: 'nA', x: 16, y: 136, w: 190, h: 172, title: 'Node A', tone: 'info' },
    { id: 'nB', x: 224, y: 136, w: 190, h: 172, title: 'Node B', tone: 'info' },
    { id: 'nC', x: 432, y: 136, w: 192, h: 172, title: 'Node C', tone: 'info' },
  ];
  const FILES = { fA1: [36, 176], fA2: [36, 228], fB1: [244, 176], fB2: [244, 228], fC1: [452, 176], fC2: [452, 228] };
  const filesAt = (tone = null, sub = null) => Object.fromEntries(Object.entries(FILES).map(([k, [x, y]]) => [k, { x, y, ...(tone ? { tone, sub } : {}) }]));
  const fileTok = {}; Object.keys(FILES).forEach(k => { fileTok[k] = { label: 'SSTable', sub: 'tasks · 2 rows', tone: 'live', w: 150 }; });
  const dropTable = {
    id: 'drop', label: 'DROP TABLE', desc: 'A schema change, not a row change. Watch the table’s files go, and check that no tombstone is written.',
    codeLabel: 'CQL', code: { bug: ['DROP TABLE tasks;'] },
    scene: { w: 640, h: 420, footer: FOOT, panels: [{ id: 'coord', x: 16, y: 58, w: 608, h: 62, title: 'Coordinator', tone: 'info' }, ...NODES], tokens: { ...fileTok,
      ddl: { label: 'DROP TABLE tasks', sub: 'schema change', tone: 'cursor', w: 240 } } },
    bug: [
      { log: 'The table lives on three replicas. Each node holds its SSTable files for it.', callout: 'Before: six data files, one table', code: 0, at: { ...filesAt(), },
        badge: { nA: 'schema v7', nB: 'schema v7', nC: 'schema v7' }, stats: [{ l: 'data files', v: '6' }, { l: 'tombstones written', v: '0', cls: 'ok' }] },
      { log: 'DROP TABLE is a schema change. The coordinator sends it to every node.', callout: 'A schema change, not a row change', code: 0,
        at: { ...filesAt(), ddl: { x: 150, y: 72 } }, arrows: [['ddl', 'fA1', 'v8'], ['ddl', 'fB1', 'v8'], ['ddl', 'fC1', 'v8']],
        badge: { nA: 'schema v7', nB: 'schema v7', nC: 'schema v7' }, stats: [{ l: 'data files', v: '6' }, { l: 'tombstones written', v: '0', cls: 'ok' }] },
      { log: 'Each node records schema version 8. If auto_snapshot is enabled, it first takes a snapshot of the files.', callout: 'Snapshot first, only if enabled',
        at: { ...filesAt(), ddl: { x: 150, y: 72 } }, badge: { nA: 'schema v8', nB: 'schema v8', nC: 'schema v8' }, stats: [{ l: 'data files', v: '6' }, { l: 'tombstones written', v: '0', cls: 'ok' }] },
      { log: 'Each node marks the table’s files for removal.', callout: 'Files are marked, not edited', code: 0,
        at: { ...filesAt('warn', 'marked'), ddl: { x: 150, y: 72 } }, badge: { nA: 'schema v8', nB: 'schema v8', nC: 'schema v8' }, stats: [{ l: 'data files', v: '6' }, { l: 'tombstones written', v: '0', cls: 'ok' }] },
      { log: 'Each node deletes the table’s SSTable files. No row is marked deleted, so no tombstone is written.', callout: 'Files removed, no tombstones written', moment: true, code: 0,
        at: { ddl: { x: 150, y: 72 } }, badge: { nA: 'schema v8', nB: 'schema v8', nC: 'schema v8' }, stats: [{ l: 'data files', v: '0' }, { l: 'tombstones written', v: '0', cls: 'ok' }] },
      { log: 'No tombstone exists, so there is nothing to purge and no gc_grace_seconds to wait for.', callout: 'Nothing left to purge later',
        at: { ddl: { x: 150, y: 72 } }, stats: [{ l: 'data files', v: '0' }, { l: 'tombstones', v: '0', cls: 'ok' }],
        takeaway: 'DROP TABLE leaves no tombstones. The data is gone at once, so a snapshot is the only way back.' },
    ],
  };

  /* ---- 4. TTL: expiry stored with the cell; hidden, then a tombstone, then purged ---- */
  const TICK = (cur) => ({ t0: { x: 150, y: 272, ...(cur === 0 ? { tone: 'cursor' } : {}) }, t1: { x: 262, y: 272, ...(cur === 1 ? { tone: 'cursor' } : {}) }, t2: { x: 374, y: 272, ...(cur === 2 ? { tone: 'cursor' } : {}) }, t3: { x: 486, y: 272, ...(cur === 3 ? { tone: 'cursor' } : {}) } });
  const ttl = {
    id: 'ttl', label: 'TTL', desc: 'USING TTL stores an expiry time with the cell. Watch it go from hidden to tombstone to purged, and what null does.',
    codeLabel: 'CQL', code: { bug: ["INSERT INTO tasks (queue, task_id, body)", "VALUES ('main', 43, 'resize') USING TTL 3600;", '-- binding null in a write is a delete of that cell', "INSERT INTO tasks (queue, task_id, body) VALUES ('main', 44, null);"] },
    scene: { w: 640, h: 420, footer: FOOT, panels: [
      { id: 'disk', x: 16, y: 58, w: 608, h: 190, title: 'Replica · cells on disk', tone: 'info' },
      { id: 'clock', x: 16, y: 258, w: 608, h: 60, title: 'Clock', tone: 'info' } ], tokens: {
      c: { label: 'task 43 · resize', sub: 'expires at 3600 s', tone: 'live', w: 170 },
      rd: { label: 'read: no row', sub: 'result', tone: 'bad', w: 170 },
      nb: { label: 'task 44 · null', sub: 'tombstone', tone: 'delete', w: 170 },
      t0: { label: 't = 0', sub: 'INSERT', tone: 'info', w: 104, h: 42 },
      t1: { label: 't = 3600 s', sub: 'TTL expires', tone: 'info', w: 104, h: 42 },
      t2: { label: 'compaction', sub: 'rewrite', tone: 'info', w: 104, h: 42 },
      t3: { label: 'gc passed', sub: 'purge', tone: 'info', w: 104, h: 42 } } },
    bug: [
      { log: 'INSERT … USING TTL 3600 stores the cell with an expiry time: write time plus 3600 seconds.', callout: 'The cell carries its own expiry time', code: 1,
        at: { c: { x: 36, y: 110 }, ...TICK(0) }, stats: [{ l: 'live cells', v: '1', cls: 'ok' }, { l: 'read returns', v: '1', cls: 'ok' }] },
      { log: 'At t = 3600 s the TTL expires. The cell is hidden from every read from this moment on.', callout: 't = 3600 s: hidden from every read now', moment: true, code: 1,
        at: { c: { x: 36, y: 110, tone: 'warn', sub: 'expired · hidden' }, rd: { x: 300, y: 110 }, ...TICK(1) }, arrows: [['c', 'rd', 'read']], stats: [{ l: 'read returns', v: '0', cls: 'bad' }, { l: 'on disk', v: '1', cls: 'warn' }] },
      { log: 'Nothing was deleted from disk. The expired cell still takes space in its SSTable.', callout: 'Hidden, but still on disk', code: 1,
        at: { c: { x: 36, y: 110, tone: 'warn', sub: 'expired · hidden' }, ...TICK(1) }, stats: [{ l: 'read returns', v: '0', cls: 'bad' }, { l: 'on disk', v: '1', cls: 'warn' }] },
      { log: 'Compaction rewrites the SSTable. The expired cell becomes a tombstone, which still uses disk space.', callout: 'Compaction rewrites the SSTable', code: 1,
        at: { c: { x: 36, y: 110, tone: 'delete', sub: 'tombstone' }, ...TICK(2) }, stats: [{ l: 'on disk', v: '1', cls: 'warn' }] },
      { log: 'After gc_grace_seconds, and once no copy can return, compaction purges the tombstone.', callout: 'Purged: the space is free again', code: 1,
        at: { ...TICK(3) }, stats: [{ l: 'on disk', v: '0', cls: 'ok' }] },
      { log: 'Writing null in an insert is a delete of that cell, so it creates a tombstone even with no DELETE statement.', callout: 'A null bind creates a tombstone too', code: 3,
        at: { nb: { x: 36, y: 110 }, ...TICK(3) }, stats: [{ l: 'on disk', v: '1', cls: 'warn' }, { l: 'tombstones', v: '1', cls: 'warn' }] },
      { log: 'Each write sets its own TTL. A later write without a TTL replaces the expiry, so check which write set it.', callout: 'Check which write set the TTL',
        at: { nb: { x: 36, y: 110 }, ...TICK(3) }, stats: [{ l: 'on disk', v: '1', cls: 'warn' }, { l: 'tombstones', v: '1', cls: 'warn' }],
        takeaway: 'TTL is a delete scheduled in advance. Its space comes back only after compaction and gc_grace_seconds.' },
    ],
  };

  /* Shorter entry titles for the pilot: the full original names sit in the symptom line below. */
  const SHORT_T = ['Tombstone-heavy read', 'Null binds create tombstones', 'TTL data stays on disk'];

  /* ---- 5. Resurrection: purge before repair brings a deleted row back (moved from the repair chapter) ---- */
  const RX = { rowA: 191, rowB: 343, rowC: 495 };
  const rowsAll = (over = {}) => ({ rowA: { x: RX.rowA, y: 110, ...(over.rowA || {}) }, rowB: { x: RX.rowB, y: 110, ...(over.rowB || {}) }, rowC: { x: RX.rowC, y: 110, ...(over.rowC || {}) } });
  const resurrect = {
    id: 'resurrect', label: 'Resurrection', desc: 'A delete reaches two replicas. The third misses it, the tombstone is purged, then repair brings the row back.',
    codeLabel: 'CQL and nodetool', code: { bug: ['CONSISTENCY QUORUM;', "DELETE FROM orders WHERE customer = 'ana' AND order_id = 981;", 'ALTER TABLE orders WITH gc_grace_seconds = 864000;', 'nodetool repair -pr'] },
    scene: { w: 640, h: 420, footer: FOOT, panels: [
      { id: 'coord', x: 16, y: 58, w: 150, h: 290, title: 'Coordinator', tone: 'info' },
      { id: 'repA', x: 180, y: 58, w: 140, h: 290, title: 'Replica A', tone: 'info' },
      { id: 'repB', x: 332, y: 58, w: 140, h: 290, title: 'Replica B', tone: 'info' },
      { id: 'repC', x: 484, y: 58, w: 140, h: 290, title: 'Replica C', tone: 'info' } ], tokens: {
      rowA: { label: 'order 981', sub: 'cancelled', tone: 'live', w: 118 },
      rowB: { label: 'order 981', sub: 'cancelled', tone: 'live', w: 118 },
      rowC: { label: 'order 981', sub: 'cancelled', tone: 'live', w: 118 },
      del: { label: 'DELETE 981', sub: 'QUORUM', tone: 'cursor', w: 118 },
      dA: { label: 'DEL 981', sub: 'tombstone · d0', tone: 'delete', w: 118 },
      dB: { label: 'DEL 981', sub: 'tombstone · d0', tone: 'delete', w: 118 },
      dC: { label: 'DEL 981', sub: 'tombstone', tone: 'delete', w: 118 },
      rep: { label: 'repair', sub: 'day 14', tone: 'info', w: 118 },
      cust: { label: 'customer sees', sub: 'order 981', tone: 'bad', w: 128 } } },
    bug: [
      { log: 'Day 0: order 981 is live on A, B and C. All three replicas are up.', callout: 'Three live copies of order 981', code: 0, at: rowsAll(),
        badge: { repC: 'up' }, stats: [{ l: 'day', v: '0' }, { l: 'live copies', v: '3', cls: 'ok' }] },
      { log: 'Day 0: the customer cancels. The DELETE goes to all replicas and needs a quorum to succeed.', callout: 'DELETE at QUORUM', code: 1, at: { ...rowsAll(), del: { x: 26, y: 110 } },
        badge: { repC: 'up' }, stats: [{ l: 'day', v: '0' }, { l: 'live copies', v: '3', cls: 'ok' }] },
      { log: 'A and B acknowledge the delete and store a tombstone. C is down, so it misses the delete.', callout: 'Two replicas record the delete', code: 1,
        at: { ...rowsAll(), dA: { x: RX.rowA, y: 170 }, dB: { x: RX.rowB, y: 170 } }, badge: { repC: 'down · missed DELETE' },
        stats: [{ l: 'day', v: '0' }, { l: 'tombstones', v: '2', cls: 'warn' }, { l: 'live copies', v: '3', cls: 'warn' }] },
      { log: 'C stays down for three days. It keeps the live order and never sees the tombstone.', callout: 'C is stale: it still says the order is live', code: 1,
        at: { rowA: { x: RX.rowA, y: 110 }, rowB: { x: RX.rowB, y: 110 }, rowC: { x: RX.rowC, y: 110, tone: 'warn', sub: 'stale · live' }, dA: { x: RX.rowA, y: 170 }, dB: { x: RX.rowB, y: 170 } },
        badge: { repC: 'down · missed DELETE' }, stats: [{ l: 'day', v: '3' }, { l: 'C has the delete', v: 'no', cls: 'bad' }] },
      { log: 'Day 10: gc_grace_seconds has passed. A and B purge the tombstone. The purge does not wait for repair.', callout: 'Day 10: A and B forget the delete', moment: true, code: 2,
        at: { rowC: { x: RX.rowC, y: 110, tone: 'warn', sub: 'stale · live' } }, badge: { repA: 'tombstone purged', repB: 'tombstone purged', repC: 'down · missed DELETE' },
        stats: [{ l: 'day', v: '10' }, { l: 'live copies', v: '1', cls: 'warn' }] },
      { log: 'Day 14: the scheduled repair runs. C still has the live row, and A and B say nothing about it.', callout: 'Repair sees one copy: C still has it', code: 3,
        at: { rowC: { x: RX.rowC, y: 110, tone: 'warn', sub: 'stale · live' }, rep: { x: 26, y: 230 } }, arrows: [['rep', 'rowC', 'repair']],
        badge: { repC: 'up again' }, stats: [{ l: 'day', v: '14' }, { l: 'live copies', v: '1', cls: 'warn' }] },
      { log: 'Repair copies the old row to A and B as if it were new. The cancelled order is back on all three replicas.', callout: 'The cancelled order is back everywhere', moment: true, code: 3,
        at: { rowA: { x: RX.rowA, y: 110, tone: 'bad', sub: 'resurrected' }, rowB: { x: RX.rowB, y: 110, tone: 'bad', sub: 'resurrected' }, rowC: { x: RX.rowC, y: 110, tone: 'bad', sub: 'resurrected' }, rep: { x: 26, y: 230 }, cust: { x: 26, y: 290 } },
        arrows: [['cust', 'rowA', 'read']], badge: { repC: 'up again' }, stats: [{ l: 'live copies', v: '3', cls: 'bad' }, { l: 'deleted row resurrects', v: 'YES', cls: 'bad' }] },
      { log: 'Fix: a repair within gc_grace_seconds, on day 9, copies the tombstone to C before any purge. Every replica then deletes the row.', callout: 'Repair before gc_grace: the tombstone reaches C first', code: 3,
        at: { rowC: { x: RX.rowC, y: 110, tone: 'delete', sub: 'deleted' }, dC: { x: RX.rowC, y: 170 }, rep: { x: 26, y: 230 } }, arrows: [['rep', 'dC', 'tombstone']],
        badge: { repC: 'up again' }, stats: [{ l: 'live copies', v: '0', cls: 'ok' }, { l: 'deleted row resurrects', v: 'no', cls: 'ok' }],
        takeaway: 'A tombstone must reach every replica before it is purged. Repair within gc_grace_seconds, or a deleted row can return.' },
    ] };

  const chapter = { ...base.chapters[6],
    diagnose: base.chapters[6].diagnose.map((d, i) => ({ ...d, t: SHORT_T[i] || d.t })),
    explain: EXPLAIN() + SYNTAX_SECTION(),
    scenarios: [queueScan, deleteRow, rangeDel, ttl, resurrect] };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[6] = { explain: chapter.explain, scenarios: chapter.scenarios, diagnose: chapter.diagnose };


  function EXPLAIN() {
    return `
<h3>1. A delete cannot erase data in place</h3>
<p>Replicas store rows in immutable files called SSTables. A file is written once and never edited, so a <code>DELETE</code> cannot remove the old value where it sits. Instead, the write path adds a new record that says “this key is deleted as of time T”. That record is a <b>tombstone</b>. It sits beside the old value until compaction rewrites the files and can safely drop both.</p>

<h3>2. Four kinds of tombstone</h3>
<ul>
  <li><b>Cell tombstone</b>: one column of one row is deleted.</li>
  <li><b>Row tombstone</b>: one whole clustering row is deleted.</li>
  <li><b>Range tombstone</b>: one marker hides every row inside a clustering range. One marker can shadow thousands of rows.</li>
  <li><b>Partition tombstone</b>: the whole partition is deleted.</li>
</ul>
<p>A range or partition tombstone is cheap to write, but every read that touches the range must honour it.</p>

<h3>3. Trace the read path</h3>
<p>A read merges the memtable and every SSTable that may hold the partition. It walks the rows in clustering order and must skip every shadowed cell it meets. A work queue has a deleted prefix at its front, so “the oldest live row” is found only after the read has walked past all of it.</p>
<figure class="mm" aria-label="Sequence diagram: worker asks coordinator, coordinator asks replica, replica skips tombstones and returns the first live row" style="--diagram-width:620.00px">
  <img src="diagrams/read-sequence.svg" alt="Sequence diagram: the worker sends the query to the coordinator, which reads the partition from the front on the replica. The replica merges memtable and SSTables, loops over each cell and skips tombstones, returns the first live row after 6 skips, and the coordinator returns task 7 to the worker.">
  <figcaption>Sequence (Mermaid source: diagrams/read-sequence.mmd): the read starts at the front, so every tombstone before task 7 is visited.</figcaption>
</figure>
<p>The same decision, as a flowchart. Every cell is visited until the limit is met:</p>
<figure class="mm" aria-label="Flowchart: visit each cell until the first live row or the limit" style="--diagram-width:354.56px">
  <img src="diagrams/ch06-tombstone-read.svg" alt="Flowchart: visit each cell until the first live row or the limit">
  <figcaption>Flowchart: the same decision, applied to each cell in order.</figcaption>
</figure>

<h3>4. TTL is a tombstone that schedules itself</h3>
<p>An expired TTL cell behaves like a tombstone. It stops being returned once it expires, but it keeps using disk until compaction rewrites its SSTable. Time-window compaction (<code>TimeWindowCompactionStrategy</code>) helps when a whole window of data expires together.</p>

<h3>5. When a tombstone may be purged</h3>
<p>Compaction drops a tombstone only when two things are true. First, <code>gc_grace_seconds</code> has passed since the delete (the default is 864000 seconds, ten days). Second, no older copy of the data can come back from another replica. The second condition is the dangerous one. A replica that missed the delete still holds the old value. If the tombstone is purged before that replica is repaired, the old value returns to every read. Running repair within <code>gc_grace_seconds</code> is what makes the purge safe. The next chapter covers repair in detail.</p>
<p>The life of one cell, as a state diagram:</p>
<figure class="mm" aria-label="State diagram: a cell goes from live to tombstoned to purged" style="--diagram-width:518.59px">
  <img src="diagrams/ch06-cell-states.svg" alt="State diagram: a cell goes from live to tombstoned to purged">
  <figcaption>State: the life of one cell. A tombstone can only move to purged after both conditions in section 5.</figcaption>
</figure>

<h3>6. The trade-off</h3>
<p>Deletes are cheap to write and expensive to read. Wide partitions that churn through deletes slow every read that starts at their front, so a work queue stored in one partition gets slower each hour. Raising warning thresholds only hides the symptom. A bounded read range (a start key, as in the fix path) or a different data model removes the cause.</p>`;
  }

  function SYNTAX_SECTION() {
    return `
<h3>7. The syntax, in one place</h3>
<pre>-- one column of one row: a cell tombstone
DELETE email FROM users WHERE user_id = 1;

-- one clustering row: a row tombstone
DELETE FROM tasks WHERE queue = 'main' AND task_id = 42;

-- a clustering range: one range tombstone shadows many rows
DELETE FROM tasks WHERE queue = 'main' AND task_id &lt; 100;

-- the whole partition: a partition tombstone
DELETE FROM tasks WHERE queue = 'main';

-- DROP TABLE removes the table's files; it writes no tombstones
DROP TABLE tasks;

-- a cell that expires 3600 seconds after the write
INSERT INTO tasks (queue, task_id, body) VALUES ('main', 43, 'resize') USING TTL 3600;

-- a table-wide default for writes that carry no TTL
ALTER TABLE tasks WITH default_time_to_live = 86400;</pre>
<p>Each write sets its own TTL. A later write without a TTL replaces the expiry. Binding null in an insert is a delete of that cell, so leave a field unset when you do not mean to delete it.</p>`;
  }

})();
