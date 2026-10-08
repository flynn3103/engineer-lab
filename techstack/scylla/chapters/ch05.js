/* Chapter 5 "Compaction": three strategy-specific scenes plus the Explain override (index 5, zero-based).
   Loads after course.js and scene-kit.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Metaphors: STCS size bins, LCS key-range shelves, TWCS timestamp windows and a clock.
   Counts, sizes, percentages and days are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;
  const FOOT_STCS = 'Simplified: one replica, one table. Sizes and counts illustrative, not to scale.';
  const TC = ['var(--t0)', 'var(--t3)', 'var(--t6)'];                       // one colour per bin: blue, purple, teal
  const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, var(--card))`;
  const TRANS = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'none' : 'transform .6s cubic-bezier(.3,.7,.2,1), opacity .45s';

  /* ---------- shared parts: sheet, bucket, arrow, gauge ---------- */
  const LOOK = {
    merging: ['var(--warn)', mix('var(--warn)', 40), '', 1.8],
    ghost: ['var(--warn)', mix('var(--warn)', 12), '4 3', 1.6],
    probe: ['var(--acc2)', mix('var(--acc2)', 34), '', 2.2],
    expired: ['var(--bad)', mix('var(--bad)', 12), '4 3', 1.4],
    kept: ['var(--warn)', mix('var(--warn)', 34), '', 2],
    live: null,
  };
  /* A sheet = one SSTable. Pass its tier colour and size; set({x, y, show, mode, label}) moves and recolours it. */
  function sheet(kit, o) {
    const g = kit.el('g', null, kit.layer);
    g.style.transition = TRANS; g.style.opacity = 0;
    const r = kit.el('rect', { x: 0, y: 0, width: o.w, height: o.h, rx: 3 }, g);
    r.style.transition = TRANS === 'none' ? 'none' : 'fill .4s, stroke .4s';
    const tx = kit.el('text', { class: 'kt xs b', x: o.w / 2, y: o.h / 2 + 3.5, 'text-anchor': 'middle' }, g);
    return {
      g,
      set(p) {
        g.style.transform = `translate(${p.x}px,${p.y}px)`;
        g.style.opacity = p.show ? 1 : 0;
        const m = p.mode || 'live', L = LOOK[m] || [o.color, mix(o.color, 42), '', 1.4];
        r.style.stroke = L[0]; r.style.fill = L[1]; r.style.strokeDasharray = L[2]; r.style.strokeWidth = L[3];
        tx.textContent = p.label != null ? p.label : (m === 'ghost' ? 'writing' : o.label);
      }
    };
  }
  /* A bucket (bin): open at the top, a title above, a count below. */
  function bucket(kit, b, top, bot, title) {
    const bg = kit.el('rect', { x: b.x, y: top, width: b.w, height: bot - top, rx: 8 }, kit.layer); bg.style.fill = 'var(--soft)'; bg.style.opacity = .55;
    const wall = kit.el('path', { d: `M${b.x} ${top} V${bot} H${b.x + b.w} V${top}`, fill: 'none' }, kit.layer);
    wall.style.stroke = 'var(--mut)'; wall.style.strokeWidth = 2.4; wall.style.transition = 'stroke .4s';
    kit.text(kit.layer, { x: b.x + b.w / 2, y: top - 8, t: title, cls: 'kt sm b', anchor: 'middle' });
    const cnt = kit.text(kit.layer, { x: b.x + b.w / 2, y: bot + 17, t: '', cls: 'kt sm', anchor: 'middle' });
    return { set(tone, text) { wall.style.stroke = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--mut)'; wall.style.strokeWidth = tone ? 3.2 : 2.4; cnt.set(text); cnt.el.setAttribute('class', 'kt sm' + (tone ? ' tone-' + tone : '')); } };
  }
  function arrow(kit, x1, x2, y, label) {
    const ln = kit.el('path', { d: `M${x1} ${y} H${x2 - 7}`, fill: 'none' }, kit.layer), hd = kit.el('path', { d: `M${x2} ${y} l-9 -5.5 v11 z` }, kit.layer);
    const lb = kit.text(kit.layer, { x: (x1 + x2) / 2, y: y - 9, t: label || '', cls: 'kt xs b', anchor: 'middle' });
    [ln, hd].forEach(e => { e.style.transition = 'stroke .4s, fill .4s, stroke-width .4s'; });
    return { set(on) { const c = on ? 'var(--acc2)' : 'var(--line)'; ln.style.stroke = c; ln.style.strokeWidth = on ? 3.4 : 2.2; hd.style.fill = c; hd.style.stroke = 'none'; lb.el.style.fill = on ? 'var(--acc2)' : 'var(--mut)'; } };
  }
  /* A labelled gauge: label and value above a track; set(fraction, tone, valueText). */
  function gauge(kit, o) {
    const g = kit.layer;
    kit.text(g, { x: o.x, y: o.y, t: o.label, cls: 'kt sm' });
    const val = kit.text(g, { x: o.x + o.w, y: o.y, t: '', cls: 'kt sm b', anchor: 'end' });
    kit.el('rect', { class: 'kbar-track', x: o.x, y: o.y + 6, width: o.w, height: 10, rx: 5 }, g);
    const fill = kit.el('rect', { class: 'kbar-fill', x: o.x, y: o.y + 6, width: o.w, height: 10, rx: 5 }, g);
    return { set(f, tone, text) { fill.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`; fill.dataset.tone = tone || 'ok'; val.set(text); } };
  }

  /* ---------- the size-tiered bins (scenarios 1 and 2) ---------- */
  const BIN = [{ x: 24, w: 100 }, { x: 148, w: 140 }, { x: 312, w: 148 }];
  const BTOP = 124, BBOT = 318;
  const TIER = [
    { w: 42, h: 22, cols: 2, gap: 6, pitch: 27, label: '1 MB' },
    { w: 62, h: 30, cols: 2, gap: 6, pitch: 37, label: '4 MB' },
    { w: 130, h: 40, cols: 1, gap: 0, pitch: 48, label: '16 MB' },
  ];
  const slot = (t, i) => {
    const T = TIER[t], b = BIN[t], c = i % T.cols, r = Math.floor(i / T.cols), rowW = T.cols * T.w + (T.cols - 1) * T.gap;
    return { x: b.x + (b.w - rowW) / 2 + c * (T.w + T.gap), y: BBOT - 6 - T.h - r * T.pitch };
  };
  const MEMDROP = { x: BIN[0].x + (BIN[0].w - TIER[0].w) / 2, y: 100 };
  function buildBins(kit) {
    const R = {};
    ['bin 0 · 1 MB', 'bin 1 · 4 MB', 'bin 2 · 16 MB'].forEach((t, i) => { R['b' + i] = bucket(kit, BIN[i], BTOP, BBOT, t); });
    R.a0 = arrow(kit, BIN[0].x + BIN[0].w + 2, BIN[1].x - 2, 214, '4→1');
    R.a1 = arrow(kit, BIN[1].x + BIN[1].w + 2, BIN[2].x - 2, 214, '4→1');
    R.mem = kit.chip(null, { x: BIN[0].x, y: 66, w: 100, h: 32, label: 'memtable', sub: 'flush 0', tone: 'info' });
    [0, 1].forEach(t => {                                       // the line where a bin is full: four sheets
      const y = slot(t, 2).y - 4, b = BIN[t], ln = kit.el('path', { d: `M${b.x + 4} ${y} H${b.x + b.w - 4}`, fill: 'none' }, kit.layer);
      ln.style.stroke = 'var(--mut)'; ln.style.strokeDasharray = '4 3'; ln.style.strokeWidth = 1.3;
      kit.text(kit.layer, { x: b.x + b.w - 6, y: y - 4, t: 'merge at 4', cls: 'kt xs mut', anchor: 'end' });
    });
    R.F = Array.from({ length: 16 }, () => sheet(kit, { ...TIER[0], color: TC[0] }));
    R.T = Array.from({ length: 4 }, () => sheet(kit, { ...TIER[1], color: TC[1] }));
    R.S = Array.from({ length: 2 }, () => sheet(kit, { ...TIER[2], color: TC[2] }));
    R.rd = kit.chip(null, { x: 312, y: 66, w: 148, h: 32, label: 'read one key', sub: '', tone: 'cursor', show: false });
    return R;
  }
  /* state: f = flushes so far, m0 = bin-0 merges done, m1 = bin-1 merges done, mg = merge running (0: bin 0 to 1, 1: bin 1 to 2), probe = a read is checking sheets */
  function frameBins(s, R) {
    const f = s.f || 0, m0 = s.m0 || 0, m1 = s.m1 || 0, mg = s.mg, probe = !!s.probe;
    const n0 = Math.max(0, f - 4 * m0), n1 = Math.max(0, m0 - 4 * m1), n2 = m1;
    R.F.forEach((sh, k) => {
      const i = k + 1;
      if (i > f) { sh.set({ x: MEMDROP.x, y: MEMDROP.y, show: false }); return; }
      if (i <= 4 * m0) { const p = slot(1, Math.max(0, Math.ceil(i / 4) - 4 * m1 - 1)); sh.set({ x: p.x + 9, y: p.y + 3, show: false }); return; }
      const idx = i - 4 * m0 - 1, p = slot(0, idx);
      sh.set({ x: p.x, y: p.y, show: true, mode: mg === 0 && idx < 4 ? 'merging' : probe ? 'probe' : 'live' });
    });
    R.T.forEach((sh, k) => {
      const j = k + 1, idx = Math.max(0, j - 4 * m1 - 1), p = slot(1, idx);
      if (j <= 4 * m1) { const q = slot(2, 0); sh.set({ x: q.x + 32, y: q.y + 3, show: false }); return; }
      if (j <= m0) sh.set({ x: p.x, y: p.y, show: true, mode: mg === 1 && idx < 4 ? 'merging' : probe ? 'probe' : 'live' });
      else if (mg === 0 && j === m0 + 1) sh.set({ x: p.x, y: p.y, show: true, mode: 'ghost' });
      else sh.set({ x: p.x, y: p.y, show: false });
    });
    R.S.forEach((sh, k) => {
      const p = slot(2, 0);
      if (k + 1 <= m1) sh.set({ x: p.x, y: p.y, show: true, mode: probe ? 'probe' : 'live' });
      else if (mg === 1 && k + 1 === m1 + 1) sh.set({ x: p.x, y: p.y, show: true, mode: 'ghost' });
      else sh.set({ x: p.x, y: p.y, show: false });
    });
    R.b0.set(n0 >= 8 ? 'bad' : n0 >= 4 && mg !== 0 ? 'warn' : '', n0 + ' / 4 sheets');
    R.b1.set(n1 >= 4 && mg !== 1 ? 'warn' : '', n1 + ' / 4 sheets');
    R.b2.set('', n2 + (n2 === 1 ? ' sheet' : ' sheets'));
    R.a0.set(mg === 0); R.a1.set(mg === 1);
    R.mem.set({ sub: 'flush ' + f });
    const total = n0 + n1 + n2;
    R.rd.set({ show: probe, sub: 'checks ' + total + (total === 1 ? ' file' : ' files') });
    return { n0, n1, n2, total };
  }

  /* ---- 1. Bins that merge: sheets drop in, four similar sheets merge up, write amplification climbs ---- */
  const wa = s => { const f = s.f || 0, m0 = s.m0 || 0, m1 = s.m1 || 0, mg = s.mg; const written = f + 4 * m0 + 16 * m1 + (mg === 0 ? 4 : mg === 1 ? 16 : 0); return { f, written, x: f ? written / f : 1 }; };
  const sheetsOf = s => { const f = s.f || 0, m0 = s.m0 || 0, m1 = s.m1 || 0; return Math.max(0, f - 4 * m0) + Math.max(0, m0 - 4 * m1) + m1; };
  const fx = x => x.toFixed(1) + '×';
  const tiers = {
    id: 'tiers', label: 'STCS · size tiers', desc: 'Sheets of similar size share a bin. Four of them merge into one bigger sheet in the next bin, and every merge rewrites the data (sizes illustrative).',
    codeLabel: 'CQL / mechanism',
    code: { bug: [
      "ALTER TABLE ks_orders.orders WITH compaction = {'class': 'SizeTieredCompactionStrategy'};",
      '-- a memtable flush writes one small SSTable: one sheet',
      '-- four similar-size sheets in one bin: one merge',
      '-- the output is one bigger sheet in the next bin',
      '-- observe the running merge with: nodetool compactionstats',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_STCS,
      header: s => ({ left: 'size-tiered bins · 4 similar sheets merge up', right: s.r || '' }),
      setup(kit) {
        const R = buildBins(kit);
        const P = { x: 472, y: 68, w: 152 };
        kit.panel(null, { x: P.x, y: P.y, w: P.w, h: 156, title: 'Bytes written' });
        R.gF = gauge(kit, { x: P.x + 12, y: P.y + 44, w: P.w - 24, label: 'flushed' });
        R.gW = gauge(kit, { x: P.x + 12, y: P.y + 76, w: P.w - 24, label: 'written' });
        R.big = kit.text(null, { x: P.x + P.w / 2, y: P.y + 126, t: '1.0×', cls: 'kt b', anchor: 'middle' }); R.big.el.style.fontSize = '28px';
        kit.text(null, { x: P.x + P.w / 2, y: P.y + 146, t: 'write amplification', cls: 'kt sm mut', anchor: 'middle' });
        kit.panel(null, { x: P.x, y: 232, w: P.w, h: 98, title: 'Bin rule' });
        ['4 similar sheets', 'merge into 1 sheet', '4× bigger, next bin'].forEach((t, i) => kit.text(null, { x: P.x + 12, y: 232 + 42 + i * 16, t, cls: 'kt sm' }));
        kit.text(null, { x: P.x + 12, y: 232 + 90, t: 'sizes illustrative', cls: 'kt xs mut' });
        return R;
      },
      frame(s, kit, R) {
        frameBins(s, R);
        const w = wa(s);
        R.gF.set(w.f / 48, 'info', w.f + ' MB'); R.gW.set(w.written / 48, w.x >= 2.5 ? 'bad' : w.x > 1 ? 'warn' : 'ok', w.written + ' MB');
        R.big.set(fx(w.x)); R.big.el.setAttribute('class', 'kt b tone-' + (w.x >= 2.5 ? 'bad' : w.x > 1 ? 'warn' : 'ok'));
      }
    },
    bug: [
      { log: 'Each memtable flush writes one small SSTable, drawn here as a sheet. Sheets of similar size share a bin, and bin 0 holds two sheets.', callout: 'Similar-size sheets share a bin', code: 1,
        state: { f: 2, r: 'flush 2' }, stats: [{ l: 'sheets on disk', v: '2' }, { l: 'write amplification', v: '1.0×', cls: 'ok' }] },
      { log: 'Another flush drops a third sheet into bin 0. Nothing is merged yet, because the bin is not full.', callout: 'A flush drops a new sheet into bin 0', code: 1,
        state: { f: 3, r: 'flush 3' }, stats: [{ l: 'sheets on disk', v: '3' }, { l: 'write amplification', v: '1.0×', cls: 'ok' }] },
      { log: 'A fourth flush reaches the merge threshold. Four is the default minimum; the file sizes in this drawing are illustrative.', callout: 'Four similar sheets: this bin is ready to merge', code: 2,
        state: { f: 4, r: 'merge threshold reached' }, stats: [{ l: 'sheets in bin 0', v: '4 / 4', cls: 'warn' }, { l: 'write amplification', v: '1.0×', cls: 'ok' }] },
      { log: 'The merge reads the four sheets and writes one output sheet, four times bigger, into bin 1. The inputs stay on disk until the output is complete.', callout: 'The merge writes one bigger sheet into bin 1', code: 3,
        state: { f: 4, mg: 0, r: 'merge: bin 0 → bin 1' }, stats: [{ l: 'bytes written', v: '8 MB', cls: 'warn' }, { l: 'write amplification', v: '2.0×', cls: 'warn' }] },
      { log: 'The new output is installed and the inputs are retired. The same data was written twice, once by the flush and once by the merge, so write amplification is 2.0×.', callout: 'Written twice: first the flush, then the merge', moment: true, code: 3,
        state: { f: 4, m0: 1, r: 'merged' }, stats: [{ l: 'sheets on disk', v: '1', cls: 'ok' }, { l: 'write amplification', v: '2.0×', cls: 'warn' }] },
      { log: 'Time passes. Twelve more flushes and three more merges later, bin 1 holds four 4 MB sheets and bin 0 is empty again.', callout: 'Bin 1 fills up the same way', code: 2,
        state: { f: 16, m0: 4, r: '16 flushes, 4 merges' }, stats: [{ l: 'sheets on disk', v: '4', cls: 'ok' }, { l: 'write amplification', v: '2.0×', cls: 'warn' }] },
      { log: 'A read of one key must check every sheet that may hold it. In this example their key ranges overlap, so all four are read candidates; filters and caches can save disk I/O.', callout: 'A read checks every overlapping sheet', code: 4,
        state: { f: 16, m0: 4, probe: true, r: 'read touches 4 files' }, stats: [{ l: 'read candidates', v: '4', cls: 'warn' }, { l: 'sheets on disk', v: '4' }] },
      { log: 'The four sheets in bin 1 are similar in size, so they merge into one 16 MB sheet in bin 2. Every byte is written a third time.', callout: 'Bin 1 merges up into bin 2', code: 3,
        state: { f: 16, m0: 4, mg: 1, r: 'merge: bin 1 → bin 2' }, stats: [{ l: 'bytes written', v: '48 MB', cls: 'warn' }, { l: 'write amplification', v: '3.0×', cls: 'warn' }] },
      { log: 'Sixteen flushed sheets are now one sheet. A read touches a single file, and each byte was written three times: write amplification is 3.0×.', callout: 'One file to read, three writes per byte', code: 4,
        state: { f: 16, m0: 4, m1: 1, r: 'merged: 1 sheet' }, stats: [{ l: 'sheets on disk', v: '1', cls: 'ok' }, { l: 'read candidates', v: '1', cls: 'ok' }, { l: 'write amplification', v: '3.0×', cls: 'warn' }],
        takeaway: 'Every bin merge rewrites each byte once more. Size-tiered compaction trades that write cost for fewer files per read.' },
    ],
  };

  /* ---------- LCS: key ranges form shelves, not size buckets ---------- */
  const KX = 140, KW = 464, kx = k => KX + k * KW / 100;
  const lcs = {
    id: 'lcs', label: 'LCS · key ranges',
    desc: 'Overlapping flushes enter L0. Compaction rewrites them into non-overlapping ranges in L1, then carries selected ranges into L2.',
    codeLabel: 'CQL / mechanism',
    code: { bug: [
      "ALTER TABLE ks_orders.orders WITH compaction = {'class': 'LeveledCompactionStrategy'};",
      '-- memtable flushes enter L0; their key ranges can overlap',
      '-- merge selected L0 inputs with overlapping L1 files',
      '-- split sorted output into bounded-size, non-overlapping files',
      '-- when L1 exceeds its budget, merge a range with its L2 overlaps',
      '-- a point read: L0 candidates + at most one file per higher level',
    ] },
    stage: {
      w: W, h: H, footer: 'Simplified: one shard. Key positions, file counts and level budgets illustrative.',
      header: s => ({ left: 'LCS · horizontal position = sorted key', right: s.r || '' }),
      setup(kit) {
        const t = (x, y, text, cls = 'kt sm', anchor) => kit.text(null, { x, y, t: text, cls, anchor });
        [0, 25, 50, 75, 100].forEach(k => {
          t(kx(k), 80, String(k), 'kt xs mut', 'middle');
          const grid = kit.el('line', { x1: kx(k), y1: 88, x2: kx(k), y2: 321 }, kit.layer);
          grid.style.stroke = 'var(--line)'; grid.style.strokeDasharray = '2 5';
        });
        const y = [110, 234, 294];
        y.forEach((yy, i) => {
          t(28, yy + 15, 'L' + i, 'kt b');
          t(28, yy + 32, i === 0 ? 'can overlap' : 'no overlap', 'kt xs mut');
          const line = kit.el('line', { x1: 132, y1: yy + (i === 0 ? 102 : 24), x2: 612, y2: yy + (i === 0 ? 102 : 24) }, kit.layer);
          line.style.stroke = 'var(--line)';
        });
        const make = (a, b, color) => sheet(kit, { w: (b - a) * KW / 100 - 4, h: 19, color });
        const A = [[10, 55], [25, 75], [42, 95], [0, 40]];
        const B = [[0, 30], [30, 65], [65, 100]];
        const C = [[0, 30], [30, 60], [60, 100]];
        const O = [[0, 25], [25, 50], [50, 75], [75, 100]];
        const D = [[0, 25], [25, 50], [50, 60]];
        const probe = kit.el('g', null, kit.layer);
        probe.style.transition = TRANS;
        const beam = kit.el('rect', { x: -7, y: 97, width: 14, height: 222, rx: 4 }, probe);
        beam.style.fill = mix('var(--acc2)', 20); beam.style.stroke = 'var(--acc2)'; beam.style.strokeDasharray = '3 3';
        const caption = t(140, 337, '', 'kt sm b');
        return { A, B, C, O, D, a: A.map(([a, b]) => make(a, b, TC[0])), b: B.map(([a, b]) => make(a, b, TC[1])),
          c: C.map(([a, b]) => make(a, b, TC[2])), o: O.map(([a, b]) => make(a, b, TC[1])), d: D.map(([a, b]) => make(a, b, TC[2])), probe, caption };
      },
      frame(s, kit, R) {
        const phase = s.p, merged = phase >= 4, lower = phase >= 6, reading = phase === 2 || phase === 7 || phase === 8;
        const contains = ([a, b]) => a <= 42 && b > 42;
        R.a.forEach((sh, i) => sh.set({ x: kx(R.A[i][0]), y: merged ? 234 : 110 + i * 24,
          show: !merged && i < (phase === 0 ? 1 : 4), label: 'flush ' + (i + 1),
          mode: phase === 3 ? 'merging' : reading && contains(R.A[i]) ? 'probe' : 'live' }));
        R.b.forEach((sh, i) => sh.set({ x: kx(R.B[i][0]), y: 234, show: !merged, label: R.B[i].join('..'), mode: phase === 3 ? 'merging' : reading && contains(R.B[i]) ? 'probe' : 'live' }));
        R.o.forEach((sh, i) => sh.set({ x: kx(R.O[i][0]), y: lower && i === 1 ? 294 : phase === 3 ? 263 : 234,
          show: (phase >= 3) && !(lower && i === 1), label: R.O[i].join('..'),
          mode: phase === 3 ? 'ghost' : phase === 5 && i === 1 ? 'merging' : reading && contains(R.O[i]) ? 'probe' : 'live' }));
        R.c.forEach((sh, i) => sh.set({ x: kx(R.C[i][0]), y: 294, show: !lower || i === 2,
          label: R.C[i].join('..'), mode: phase === 5 && i < 2 ? 'merging' : reading && contains(R.C[i]) ? 'probe' : 'live' }));
        R.d.forEach((sh, i) => sh.set({ x: kx(R.D[i][0]), y: phase === 5 ? 264 : 294, show: phase >= 5,
          label: R.D[i].join('..'), mode: phase === 5 ? 'ghost' : reading && contains(R.D[i]) ? 'probe' : 'live' }));
        R.probe.style.transform = `translate(${kx(42)}px,0)`; R.probe.style.opacity = reading ? 1 : 0;
        R.caption.set(s.note || '');
      }
    },
    bug: [
      { code: 0, log: 'The existing sorted runs occupy L1 and L2. A new memtable flush arrives in L0 with a key range that overlaps older files.', callout: 'A flush enters L0, where key ranges can overlap', state: { p: 0, r: 'flush to L0', note: 'L0 is the exception to the non-overlap rule.' }, stats: [{ l: 'L0 files', v: '1' }, { l: 'higher levels', v: 'sorted runs' }] },
      { code: 1, log: 'Three more flushes arrive. Their horizontal spans overlap: several files may contain versions of key 42. Horizontal width represents key coverage, not bytes.', callout: 'Four L0 files can cover the same key', state: { p: 1, r: 'L0 grows', note: 'L1 and L2 still have disjoint ranges within each level.' }, stats: [{ l: 'L0 files', v: '4', cls: 'warn' }, { l: 'L1 budget', v: 'bounded bytes' }] },
      { code: 5, log: 'A point read for key 42 follows the vertical beam: three L0 candidates, one L1 file and one L2 file. Bloom filters and caches may avoid actual disk reads.', callout: 'Key 42 crosses several L0 files, one per higher level', state: { p: 2, r: 'read key 42', note: '5 candidate files; actual disk I/O can be lower.' }, stats: [{ l: 'L0 candidates', v: '3', cls: 'warn' }, { l: 'L1 + L2 candidates', v: '2' }] },
      { code: 2, log: 'Compaction selects L0 files and overlapping L1 inputs. It reconciles versions and writes sorted, size-bounded outputs; the dashed output files coexist with the inputs.', callout: 'Merge overlapping inputs; split the sorted output', state: { p: 3, r: 'L0 → L1', note: 'Inputs remain until the new output is safely installed.' }, stats: [{ l: 'input files', v: '7' }, { l: 'output files', v: '4', cls: 'warn' }] },
      { code: 3, moment: true, log: 'The output is installed and the old inputs are retired. Four new L1 files cover adjacent key ranges without overlap. A key can now appear in at most one of them.', callout: 'One sorted run: non-overlapping ranges in L1', state: { p: 4, r: 'new L1 run', note: 'Different files, adjacent ranges; never one giant output file.' }, stats: [{ l: 'L0 files', v: '0', cls: 'ok' }, { l: 'L1 files per key', v: 'at most 1', cls: 'ok' }] },
      { code: 4, log: 'When L1 exceeds its byte budget, compaction selects its 25..50 range and the two L2 files it overlaps. The 60..100 L2 file is untouched.', callout: 'Only the selected range and its L2 overlaps are rewritten', state: { p: 5, r: 'L1 → L2', note: 'Real higher-level byte budgets grow by about 10× per level.' }, stats: [{ l: 'selected L1 files', v: '1' }, { l: 'overlapping L2 files', v: '2', cls: 'warn' }] },
      { code: 4, log: 'The selected L1 range moves down and its old inputs disappear. New L2 output covers 0..60 in adjacent pieces, while the unrelated 60..100 file stays in place.', callout: 'A range moves down; unrelated files stay put', state: { p: 6, r: 'L2 output installed', note: 'The same data is rewritten again: this is write amplification.' }, stats: [{ l: 'rewritten input files', v: '3', cls: 'warn' }, { l: 'untouched L2 files', v: '1', cls: 'ok' }] },
      { code: 5, log: 'Read key 42 again. L0 is empty, L1 has a gap at that key, and exactly one L2 file covers it. A sparse level can contribute zero candidates.', callout: 'Point reads follow one vertical column through the levels', state: { p: 7, r: 'read key 42', note: 'At most one candidate per level above L0, not exactly one.' }, stats: [{ l: 'candidate files', v: '1', cls: 'ok' }, { l: 'L0 candidates', v: '0', cls: 'ok' }] },
      { code: 5, log: 'Leveled compaction buys predictable point-read candidates by repeatedly rewriting selected key ranges. L0 backlog can still increase read cost when flushes outpace compaction.', callout: 'Fewer read candidates, more rewriting along the way', state: { p: 8, r: 'LCS trade-off', note: 'L0 still needs compaction to keep up with incoming flushes.' }, stats: [{ l: 'read amplification', v: 'bounded above L0', cls: 'ok' }, { l: 'write amplification', v: 'higher', cls: 'warn' }], takeaway: 'LCS orders files by key range. Above L0, a key has at most one candidate file per level; moving down rewrites data.' },
    ]
  };

  /* ---------- TWCS: windows on a moving clock, with STCS inside ---------- */
  const WIN = [32, 240, 448], WY = 144, wh = 154;
  const twcs = {
    id: 'twcs-window', label: 'TWCS · time windows',
    desc: 'Flushes merge inside one time window. A clock then reveals the difference between TTL expiry, safe whole-file removal and a file pinned by mixed TTLs.',
    codeLabel: 'CQL / mechanism',
    code: { bug: [
      "ALTER TABLE ks_sessions.sessions WITH compaction =",
      "  {'class': 'TimeWindowCompactionStrategy',",
      "   'compaction_window_unit': 'DAYS', 'compaction_window_size': '1'};",
      'ALTER TABLE ks_sessions.sessions WITH default_time_to_live = 172800;',
      '-- STCS merges inside an active window; closed windows converge to one file',
      '-- full expiry + safe-purge checks allow a whole SSTable to be dropped',
    ] },
    stage: {
      w: W, h: H, footer: 'Simplified: one shard, 1-day windows, 2-day TTL. Safe-purge checks shown separately.',
      header: s => ({ left: 'TWCS · group by time, not size or key', right: s.r || '' }),
      setup(kit) {
        const t = (x, y, text, cls = 'kt sm', anchor) => kit.text(null, { x, y, t: text, cls, anchor });
        const line = kit.el('line', { x1: 40, y1: 100, x2: 602, y2: 100 }, kit.layer); line.style.stroke = 'var(--mut)';
        for (let d = 0; d <= 6; d++) {
          const x = 50 + d * 90;
          const tick = kit.el('line', { x1: x, y1: 97, x2: x, y2: 106 }, kit.layer); tick.style.stroke = 'var(--mut)';
          t(x, 121, 'd' + d, 'kt xs mut', 'middle');
        }
        const clock = kit.el('g', null, kit.layer); clock.style.transition = TRANS;
        const hand = kit.el('path', { d: 'M-6 87 L6 87 L0 98 Z' }, clock); hand.style.fill = 'var(--acc2)';
        const now = kit.text(clock, { x: 0, y: 80, t: '', cls: 'kt xs b', anchor: 'middle' });
        const boxes = WIN.map((x, i) => {
          const g = kit.el('g', null, kit.layer);
          const r = kit.el('rect', { x, y: WY, width: 160, height: wh, rx: 10 }, g);
          r.style.fill = mix(TC[i], 10); r.style.stroke = TC[i]; r.style.strokeDasharray = '3 3';
          t(x + 80, 162, 'day ' + i + ' → ' + (i + 1), 'kt sm b', 'middle');
          return { r, label: t(x + 80, 284, '', 'kt xs b', 'middle') };
        });
        const a = Array.from({ length: 4 }, () => sheet(kit, { w: 60, h: 26, color: TC[0] }));
        const out = WIN.map((x, i) => sheet(kit, { w: 132, h: 32, color: TC[i] }));
        const pin = sheet(kit, { w: 84, h: 23, color: 'var(--warn)' });
        return { clock, now, boxes, a, out, pin, note: t(32, 334, '', 'kt sm b') };
      },
      frame(s, kit, R) {
        const p = s.p;
        R.clock.style.transform = `translate(${50 + s.now * 90}px,0)`; R.now.set('now d' + s.now);
        R.a.forEach((sh, i) => sh.set({ x: p >= 3 ? WIN[0] + 50 : WIN[0] + 16 + (i % 2) * 68,
          y: p >= 3 ? 211 : 182 + Math.floor(i / 2) * 36, show: p <= 2 && i < (p === 0 ? 2 : 4),
          label: 'flush ' + (i + 1), mode: p === 2 ? 'merging' : 'live' }));
        R.out.forEach((sh, i) => {
          const exists = i === 0 ? p >= 2 : p >= 4, removed = (i === 0 && p >= 6) || (i > 0 && p >= 8);
          sh.set({ x: WIN[i] + 14, y: removed ? 297 : p === 2 ? 245 : 211, show: exists && !removed,
            label: i === 0 && p >= 5 ? 'all expired' : i === 1 && p >= 7 ? 'still pinned' : 'closed file',
            mode: p === 2 ? 'ghost' : i === 0 && p >= 5 ? 'expired' : i === 1 && p === 7 ? 'kept' : 'live' });
          const label = !exists ? (i === 0 ? 'active window' : 'future window') : removed ? 'dropped whole' :
            i === 0 && p === 5 ? 'expired ≠ removed' : i === 1 && p === 7 ? 'one live cell pins file' : 'no cross-window merge';
          R.boxes[i].label.set(label);
          R.boxes[i].r.style.stroke = removed ? 'var(--ok)' : i === 1 && p === 7 ? 'var(--warn)' : TC[i];
        });
        R.pin.set({ x: WIN[1] + 38, y: 181, show: p === 7, label: 'long TTL', mode: 'kept' });
        R.note.set(s.note || '');
      }
    },
    bug: [
      { code: 2, log: 'A one-day window is open. Two memtable flushes arrive as separate SSTables containing newly written time-series data; they use the same two-day TTL.', callout: 'New flushes collect inside the active time window', state: { p: 0, now: 0.4, r: 'active day 0', note: 'Timestamp windows keep old and new data apart.' }, stats: [{ l: 'active-window files', v: '2' }, { l: 'window width', v: '1 day' }] },
      { code: 4, log: 'Two more flushes arrive in the same window. TWCS uses size-tiered compaction inside that window; it does not merge these files with a different window.', callout: 'STCS works inside a window; boundaries stay separate', state: { p: 1, now: 0.8, r: '4 flushes', note: 'Time is the outer grouping; size selects merges inside it.' }, stats: [{ l: 'window files', v: '4', cls: 'warn' }, { l: 'cross-window merges', v: '0' }] },
      { code: 4, log: 'The selected flushes merge and a larger output is written in the same window. Input files still exist while the dashed output is being written.', callout: 'Merge locally, without moving data into the next window', state: { p: 2, now: 0.9, r: 'within-window merge', note: 'Output and inputs coexist until the merge completes.' }, stats: [{ l: 'input files', v: '4' }, { l: 'output files', v: '1' }] },
      { code: 4, moment: true, log: 'Day 0 closes. TWCS works toward one SSTable for the closed window. It will not merge this file with day 1 files, so their expiry horizons remain separate.', callout: 'A closed window converges to one file and stays isolated', state: { p: 3, now: 1, r: 'day 0 closed', note: 'One closed-window file, kept apart from newer writes.' }, stats: [{ l: 'day 0 files', v: '1', cls: 'ok' }, { l: 'cross-window merges', v: '0', cls: 'ok' }] },
      { code: 3, log: 'More days pass. Each closed window has its own SSTable. With a two-day TTL, the last cell from day 0 expires by day 3, but deletion from disk is a later decision.', callout: 'The TTL horizon follows the last write in each window', state: { p: 4, now: 2.9, r: 'three closed windows', note: 'Uniform TTL: each file has a predictable expiry horizon.' }, stats: [{ l: 'closed files', v: '3' }, { l: 'day 0 full expiry', v: 'by d3' }] },
      { code: 5, log: 'By day 3 every cell in the day 0 file has expired. Reads hide them. The file still occupies disk while compaction checks grace and whether removal could expose older data.', callout: 'TTL hides cells; expiry does not itself remove the file', state: { p: 5, now: 3.1, r: 'day 0 fully expired', note: 'Full expiry is necessary; safe-purge checks must also pass.' }, stats: [{ l: 'live day 0 cells', v: '0', cls: 'ok' }, { l: 'day 0 file', v: 'still on disk', cls: 'warn' }] },
      { code: 5, log: 'In this example all safe-purge checks now pass. Compaction removes the fully expired day 0 SSTable whole, without rewriting its rows or merging it with a younger window.', callout: 'Once safe, reclaim a whole file without rewriting its rows', state: { p: 6, now: 3.4, r: 'safe drop of day 0', note: 'The delay here is illustrative; actual purge timing depends on safety.' }, stats: [{ l: 'files remaining', v: '2', cls: 'ok' }, { l: 'bytes rewritten for drop', v: '0', cls: 'ok' }] },
      { code: 3, log: 'Compare a mixed-TTL file in day 1. Most of its cells have expired by day 4, but one longer-lived cell remains. The whole-file fast path cannot remove that SSTable.', callout: 'One longer TTL can pin an otherwise expired file', state: { p: 7, now: 4.2, r: 'mixed TTL in day 1', note: 'Old + new data mixed at flush can cause the same retention problem.' }, stats: [{ l: 'live day 1 cells', v: '1', cls: 'warn' }, { l: 'whole-file drop', v: 'blocked', cls: 'warn' }] },
      { code: 5, log: 'By day 6 the long-lived cell and the day 2 file have fully expired too. Safety checks now pass for both, so compaction removes both files whole. Consistent TTLs keep this lifecycle predictable.', callout: 'Uniform TTLs make closed windows easier to retire together', state: { p: 8, now: 6, r: 'remaining files dropped', note: 'Prefer append-only data; updates and deletes can complicate purge.' }, stats: [{ l: 'files on disk', v: '0', cls: 'ok' }, { l: 'whole-file rewrite', v: 'none', cls: 'ok' }], takeaway: 'TWCS groups by time. Whole-file removal needs full expiry and safe purge; mixed TTLs can keep an old file alive.' },
    ]
  };

  const EXPLAIN = `
<h3>1. Every flush adds a file, and reads must merge them</h3>
<p>A memtable flush writes one new immutable SSTable. Nothing is edited in place, so the number of files on disk only grows until compaction merges some of them. A read consults every file that may hold part of the partition, which makes the count of overlapping files the main driver of read cost. Compaction exists to keep that count low while the write rate stays high. Each strategy chooses which cost to pay: writes, disk space, or reads.</p>

<h3>2. Three strategies, three costs</h3>
<p><b>SizeTieredCompactionStrategy (STCS)</b> merges SSTables of similar size once enough of them exist. It generally rewrites less than LCS, but files of mixed age overlap, so a read may touch many of them. <b>LeveledCompactionStrategy (LCS)</b> keeps small SSTables in levels. L0 can overlap; above L0, key ranges within each level do not overlap. A point lookup has at most one candidate per higher level, so reads touch few files, but data is rewritten as it moves down the levels. <b>TimeWindowCompactionStrategy (TWCS)</b> groups data into time windows and compacts inside each one. When an SSTable is fully expired and safe-purge checks pass, it can be removed whole. Expiry alone is not sufficient.</p>
<p>The flowchart asks the two questions that usually decide the choice.</p>
<figure class="mm" aria-label="Flowchart: time-series data with one TTL suits TWCS, frequently updated keys suit LCS, everything else suits STCS" style="--diagram-width:345.98px">
  <img src="diagrams/ch05-strategy-choice.svg" alt="Flowchart: time-series data with one TTL suits TWCS, frequently updated keys suit LCS, everything else suits STCS">
  <figcaption>Flowchart: a rule of thumb. Confirm the choice with the read and write pattern of the real table.</figcaption>
</figure>

<h3>3. Read the animations: size, key range, time</h3>
<p>The STCS bins group similar <em>byte sizes</em>; they do not partition keys. Four 1 MB inputs merge into one roughly 4 MB output in this illustrative model. Real output size depends on compression and obsolete versions. The LCS shelves instead share a horizontal key axis: files within L1 or L2 cover adjacent, disjoint ranges. L0 is the exception. Selecting a file for movement requires merging its overlaps in the destination level; it does not simply copy the file down. Outputs are split at a target size, and higher-level byte budgets grow by about ten times.</p>
<p>The vertical LCS beam is a point lookup, not a range scan. It marks candidate SSTables, not guaranteed disk reads: filters and caches may save I/O. The TWCS clock separates window closure, full TTL expiry and safe removal. Its window boundaries are based on timestamps; late data can mix with newer data in a memtable and flush into the same file. TWCS cannot magically separate those cells afterward. Mixed TTLs can also leave one live cell pinning an otherwise expired file.</p>
<h3>4. An SSTable has a lifecycle</h3>
<p>A merge reads its inputs, writes its output, and only then deletes the inputs. Until that last step, the old and new files exist side by side. The life of one SSTable, as a state diagram:</p>
<figure class="mm" aria-label="State diagram: an SSTable goes from live to merged, awaiting removal, to gone" style="--diagram-width:202.80px">
  <img src="diagrams/ch05-sstable-states.svg" alt="State diagram: an SSTable goes from live to merged, awaiting removal, to gone">
  <figcaption>State: the life of one SSTable. Its disk space is released only in the last step.</figcaption>
</figure>

<h3>5. Headroom: a merge writes before it deletes</h3>
<p>Because the output is written before the inputs are removed, a merge needs free space about equal to the data it rewrites. A large STCS merge can therefore need a big share of the disk as temporary space. If flushes outrun compaction, the backlog grows: pending work rises, each read touches more files, and p99 follows. Watch <code>nodetool compactionstats</code> and the metric <code style="overflow-wrap:anywhere">scylla_column_family_pending_compaction</code> for that trend, and keep free space above what the largest merge needs.</p>

<h3>6. The trade-off</h3>
<p>LCS reads less and writes more. STCS generally rewrites less, but leaves more overlapping read candidates. TWCS suits time-series data with a consistent TTL, and it fails when late writes or mixed TTLs keep old windows alive. Compaction also uses the disk and CPU that foreground requests need, so its pace is a balance: too slow and the backlog grows, too fast and latency suffers. Changing strategy can trigger substantial reorganization, so plan it for a quiet period and check headroom first.</p>

<h3>7. The syntax, in one place</h3>
<pre>-- size-tiered compaction: group similarly sized files
ALTER TABLE ks_orders.orders WITH compaction = {'class': 'SizeTieredCompactionStrategy'};

-- switch a table to leveled compaction
ALTER TABLE ks_orders.orders WITH compaction = {'class': 'LeveledCompactionStrategy'};

-- time-window compaction for TTL time-series data
ALTER TABLE ks_sessions.sessions WITH compaction =
  {'class': 'TimeWindowCompactionStrategy',
   'compaction_window_unit': 'DAYS', 'compaction_window_size': '1'};

-- a table-wide default TTL, for writes that carry no TTL of their own
ALTER TABLE ks_sessions.sessions WITH default_time_to_live = 86400;

-- pending work and the merges that are running now
nodetool compactionstats

-- per-table SSTable count and space used
nodetool tablestats ks_orders.orders

-- the metric to graph over time
scylla_column_family_pending_compaction</pre>
<p>Read the pending work before you change the strategy. A strategy change does not instantly clear a backlog by itself, and it may add reorganization work while the backlog is still there.</p>
<p>Source mapping: this chapter expands the original Compaction chapter’s STCS, LCS, TWCS, backlog and headroom mechanisms. The simulations use illustrative sizes and timings. Technical details are checked against the <a href="https://docs.scylladb.com/manual/stable/kb/compaction.html" target="_blank" rel="noopener">ScyllaDB compaction guide</a>, <a href="https://docs.scylladb.com/manual/stable/cql/compaction.html" target="_blank" rel="noopener">strategy options</a> and <a href="https://docs.scylladb.com/manual/stable/kb/ttl-facts.html" target="_blank" rel="noopener">TTL and safe purge</a>.</p>`;

  window.CHAPTER_OVERRIDES[5] = {
    explain: EXPLAIN,
    predict: { ...window.COURSE.chapters[5].predict, why: 'LCS keeps non-overlapping ranges within each level above L0. A point lookup has at most one candidate file per higher level, plus potentially several overlapping L0 candidates. The cost is repeated rewriting as ranges move down. STCS groups by size; TWCS separates timestamp windows for mostly append-only TTL data.' },
    scenarios: [tiers, lcs, twcs],
  };
})();
