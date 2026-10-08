/* Chapter 3 "Replica Write Path": bespoke scenes plus the Explain override (index 3, zero-based).
   Metaphor: a commit-log tape with an append head, a memtable shelf where rows slide into sorted position,
   a memory gauge that fills toward the flush threshold, and a stack of SSTable sheets.
   Sizes, windows, times and row counts are illustrative. The 128 and 1024 KB batch thresholds are the documented defaults. */
(function () {
  const mx = (c, p) => `color-mix(in srgb, var(--${c}) ${p}%, var(--card))`;
  const EASE = 'cubic-bezier(.3,.7,.2,1)';
  const TR = `transform .6s ${EASE}, opacity .45s, fill .45s, stroke .45s`;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  /* tape cell looks: live = needed for replay, warn = on tape but not synced, ok = synced, bad = lost, rel = released, rp = being replayed */
  const CELL = {
    '': { fill: 'transparent', stroke: 'var(--line)', dash: '4 3', op: 1, sw: 1.4 },
    live: { fill: mx('acc', 26), stroke: 'var(--acc)', dash: '', op: 1, sw: 1.6 },
    warn: { fill: mx('warn', 42), stroke: 'var(--warn)', dash: '', op: 1, sw: 1.8 },
    ok: { fill: mx('ok', 42), stroke: 'var(--ok)', dash: '', op: 1, sw: 1.8 },
    bad: { fill: mx('bad', 28), stroke: 'var(--bad)', dash: '4 3', op: 1, sw: 2 },
    rel: { fill: 'var(--soft)', stroke: 'var(--line)', dash: '', op: 0.55, sw: 1.2 },
    rp: { fill: mx('ok', 42), stroke: 'var(--acc2)', dash: '', op: 1, sw: 3 },
  };

  /* a tape: slots in a strip, an append head, an optional fsync line, an optional ACK row, an optional batch window band */
  function makeTape(kit, o) {
    const P = kit.layer, g = kit.el('g', null, P), cx = i => o.x + i * o.pitch + o.cw / 2, big = o.ch > 20;
    kit.el('rect', { class: 'pbox tone-info', x: o.x - 8, y: o.sy, width: (o.slots - 1) * o.pitch + o.cw + 16, height: o.sh, rx: 10 }, g);
    kit.text(g, { x: o.lx, y: o.y + (big ? 14 : 12), t: o.label, cls: 'b' });
    kit.text(g, { x: o.lx, y: o.y + (big ? 29 : 25), t: o.sub, cls: 'mut xs' });
    let band = null, bandT = null;
    if (o.band) {
      band = kit.el('rect', { x: 0, y: o.sy + 3, width: 10, height: o.sh - 6, rx: 8, 'stroke-dasharray': '5 3', 'stroke-width': 1.6 }, g);
      band.style.fill = mx('warn', 14); band.style.stroke = 'var(--warn)'; band.style.opacity = 0; band.style.transition = TR;
      bandT = kit.text(g, { x: 0, y: o.sy + 14, t: 'window', cls: 'xs tone-warn' }); bandT.el.style.transition = 'opacity .4s';
    }
    const cells = [];
    for (let i = 0; i < o.slots; i++) {
      const cg = kit.el('g', null, g), r = kit.el('rect', { x: o.x + i * o.pitch, y: o.y, width: o.cw, height: o.ch, rx: 6 }, cg);
      r.style.transition = TR;
      const t = kit.text(cg, { x: cx(i), y: o.y + o.ch / 2 + 4, t: '', cls: 'b', anchor: 'middle' });
      cells.push({ r, t });
    }
    let head = null, sync = null, syncT = null; const dots = [];
    if (o.head) {
      head = kit.el('g', null, g); kit.el('path', { d: 'M-6 0 L6 0 L0 9 Z' }, head).style.fill = 'var(--acc2)';
      const ht = kit.text(head, { x: 9, y: 8, t: 'head', cls: 'xs mut' }); void ht;
      head.style.transition = `transform .6s ${EASE}, opacity .4s`;
    }
    if (o.sync) {
      sync = kit.el('g', null, g);
      const ln = kit.el('line', { x1: 0, x2: 0, y1: o.sy + 4, y2: o.sy + o.sh + 7, 'stroke-width': 2.6, 'stroke-dasharray': '5 3' }, sync); ln.style.stroke = 'var(--ok)';
      syncT = kit.text(sync, { x: 4, y: o.sy + o.sh + 17, t: 'synced to here', cls: 'xs tone-ok' });
      sync.style.transition = `transform .8s ${EASE}`;
    }
    if (o.acks) {
      kit.text(g, { x: o.lx, y: o.y + o.ch + 20, t: 'client ACK', cls: 'mut xs' });
      for (let i = 0; i < o.slots; i++) {
        const dg = kit.el('g', null, g), c = kit.el('circle', { r: 8, cx: 0, cy: 0, 'stroke-width': 1.8 }, dg), t = kit.text(dg, { x: 0, y: 3.4, t: '', cls: 'xs b', anchor: 'middle' });
        c.style.transition = 'fill .4s, stroke .4s'; dg.style.transition = `transform .55s ${EASE}, opacity .4s`;
        dots.push({ dg, c, t });
      }
    }
    const api = {
      g, cx,
      cells(list) {
        cells.forEach((c, i) => {
          const d = list[i] || { t: '', tone: '' }, k = CELL[d.tone || ''];
          c.r.style.fill = k.fill; c.r.style.stroke = k.stroke; c.r.style.opacity = k.op; c.r.setAttribute('stroke-dasharray', k.dash); c.r.setAttribute('stroke-width', k.sw);
          c.t.set(d.t || ''); c.t.el.setAttribute('class', 'kt b' + (d.tone === 'rel' ? ' mut' : '')); c.t.el.style.opacity = d.tone === 'rel' ? 0.7 : 1;
        });
        return api;
      },
      head(i, on) { if (head) { head.style.transform = `translate(${cx(Math.min(i, o.slots - 1))}px,${o.y - 12}px)`; head.style.opacity = on === false ? 0 : 1; } return api; },
      sync(k) {
        if (!sync) return api;
        const x = o.x + k * o.pitch - (o.pitch - o.cw) / 2;
        sync.style.transform = `translate(${x}px,0px)`; syncT.el.setAttribute('text-anchor', x > 400 ? 'end' : 'start'); syncT.el.setAttribute('x', x > 400 ? -4 : 4);
        return api;
      },
      win(from, k) {
        if (!band) return api;
        if (k > 0) {
          band.style.opacity = 1; bandT.el.style.opacity = 1; const x = o.x + from * o.pitch - 4;
          band.style.transform = `translate(${x}px,0px)`; band.setAttribute('width', (k - 1) * o.pitch + o.cw + 8);
          bandT.el.style.transform = `translate(${x + 5}px,0px)`;
        } else { band.style.opacity = 0; bandT.el.style.opacity = 0; }
        return api;
      },
      acks(list) {
        dots.forEach((d, i) => {
          const st = list[i] || 'none', x = cx(i), y = o.y + o.ch + 16;
          d.dg.style.transform = `translate(${x}px,${st === 'none' ? y - 22 : y}px)`; d.dg.style.opacity = st === 'none' ? 0 : 1;
          d.c.style.fill = st === 'sent' ? mx('ok', 55) : 'transparent'; d.c.style.stroke = st === 'sent' ? 'var(--ok)' : 'var(--mut)';
          d.c.setAttribute('stroke-dasharray', st === 'held' ? '3 2' : ''); d.t.set(st === 'sent' ? 'ok' : '');
        });
        return api;
      }
    };
    return api;
  }

  /* a shelf: sorted slots in RAM, one chip per row that slides to its sorted position; an overlay for a power cut */
  function makeShelf(kit, o) {
    const P = kit.layer, g = kit.el('g', null, P), pw = (o.slots - 1) * o.pitch + o.cw + 16, chips = [];
    kit.el('rect', { class: 'pbox tone-info', x: o.x - 8, y: o.py, width: pw, height: o.ph, rx: 10 }, g);
    kit.text(g, { x: o.lx, y: o.y + 14, t: o.label, cls: 'b' }); kit.text(g, { x: o.lx, y: o.y + 29, t: o.sub, cls: 'mut xs' });
    for (let i = 0; i < o.slots; i++) kit.el('rect', { x: o.x + i * o.pitch, y: o.y, width: o.cw, height: o.ch, rx: 6, 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }, g).style.cssText = 'fill:transparent;stroke:var(--line)';
    const bd = kit.el('rect', { x: o.x - 4, y: o.y + o.ch + 3, width: pw - 8, height: 4, rx: 2 }, g); bd.style.fill = 'var(--mut)';
    o.keys.forEach((k, i) => chips.push(kit.chip(P, { x: o.x, y: o.y, w: o.cw, h: o.ch, label: String(k), tone: 'info', small: true, show: false })));
    const ov = kit.el('g', null, P); ov.style.opacity = 0; ov.style.transition = 'opacity .5s'; ov.style.pointerEvents = 'none';
    const orc = kit.el('rect', { x: o.x - 8, y: o.py, width: pw, height: o.ph, rx: 10, 'stroke-width': 2 }, ov); orc.style.fill = mx('bad', 20); orc.style.stroke = 'var(--bad)';
    kit.text(ov, { x: o.x - 8 + pw / 2, y: o.py + o.ph / 2 + 4, t: 'POWER CUT: RAM is wiped', cls: 'b tone-bad', anchor: 'middle' });
    return {
      slotX: r => o.x + r * o.pitch, y: o.y, w: o.cw,
      put(i, p) { chips[i].set(p); },
      cut(on) { ov.style.opacity = on ? 1 : 0; }
    };
  }

  /* a horizontal gauge with an optional threshold line */
  function makeGauge(kit, o) {
    const P = kit.layer, g = kit.el('g', null, P), h = o.h || 14;
    kit.el('text', { class: 'ptitle', x: o.x, y: o.y - 8 }, g).textContent = o.title;
    kit.el('rect', { class: 'kbar-track', x: o.x, y: o.y, width: o.w, height: h, rx: 7 }, g);
    const fill = kit.el('rect', { class: 'kbar-fill', x: o.x, y: o.y, width: o.w, height: h, rx: 7 }, g);
    if (o.thr != null) kit.el('line', { x1: o.x + o.w * o.thr, x2: o.x + o.w * o.thr, y1: o.y - 4, y2: o.y + h + 4, 'stroke-width': 2.4 }, g).style.stroke = 'var(--bad)';
    const val = kit.text(g, { x: o.x, y: o.y + h + 17, t: '', cls: 'sm' });
    kit.text(g, { x: o.x + o.w, y: o.y + h + 17, t: o.flag || '', cls: 'mut xs', anchor: 'end' });
    return {
      g, set(f, tone, text) { fill.style.transform = `scaleX(${clamp01(f)})`; fill.dataset.tone = tone || 'ok'; val.set(text || ''); }
    };
  }

  const rankMap = (idxs, K) => { const s = idxs.slice().sort((a, b) => K[a] - K[b]), m = {}; s.forEach((i, r) => { m[i] = r; }); return m; };

  /* ================= 1. Append, sort, flush ================= */
  const K1 = [57, 23, 91, 40, 12, 75, 31];
  const SHEET_TXT = ['older rows (illustrative)', 'older rows (illustrative)', '12 23 40 57 75 91'];
  const T1 = { x: 100, y: 98, pitch: 50, cw: 46, ch: 32, slots: 10, sy: 78, sh: 62, lx: 24, label: 'commitlog', sub: 'append only', head: true };
  const S1 = { x: 100, y: 164, slots: 6, pitch: 56, cw: 50, ch: 30, py: 150, ph: 62, lx: 24, label: 'memtable', sub: 'RAM, sorted', keys: K1 };
  const shY = j => 322 - j * 24;
  const appendFlush = {
    id: 'append-flush', label: 'Append, sort, flush', desc: 'Each write is appended to the commit-log tape, slides into sorted place on the memtable shelf, and is later flushed as an SSTable sheet.',
    codeLabel: 'Config', code: { bug: [
      '# scylla.yaml: the commitlog is only for crash recovery',
      'commitlog_sync: periodic',
      '# when the memtable is full it is flushed as an immutable SSTable',
      '# the commitlog segments behind that flush can then be released'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one replica, 6-row memtable. Rows sort by order id. Illustrative.',
      header: s => ({ left: `tape ${(s.n || 0) - (s.rel || 0)} · shelf ${(s.ap || 0) - (s.fl || 0)} rows · sheets ${s.sst || 2}`, right: s.r || '' }),
      setup(kit) {
        const P = kit.layer, tape = makeTape(kit, T1), shelf = makeShelf(kit, S1);
        const note = kit.text(P, { x: 104, y: 91, t: '', cls: 'xs tone-ok' }); note.el.style.transition = 'opacity .4s';
        const mem = makeGauge(kit, { x: 458, y: 172, w: 158, title: 'memtable memory', thr: 1, flag: 'flush line' });
        const log = makeGauge(kit, { x: 458, y: 252, w: 158, title: 'commitlog in use', flag: 'disk' });
        kit.el('rect', { class: 'pbox tone-info', x: 92, y: 222, width: 346, height: 120, rx: 10 }, P);
        kit.text(P, { x: 24, y: 290, t: 'SSTables', cls: 'b' }); kit.text(P, { x: 24, y: 305, t: 'immutable', cls: 'mut xs' });
        const sheets = [0, 1, 2, 3].map(j => {
          const g = kit.el('g', null, P), r = kit.el('rect', { x: 0, y: 0, width: 330, height: 18, rx: 5, 'stroke-width': 1.5 }, g);
          r.style.fill = 'var(--card)'; r.style.stroke = 'var(--ink)';
          const a = kit.text(g, { x: 8, y: 13, t: 'SST ' + (j + 1), cls: 'b sm' }), b = kit.text(g, { x: 322, y: 13, t: SHEET_TXT[j] || '', cls: 'xs mut', anchor: 'end' });
          void a; void b; g.style.transition = `transform .7s ${EASE}, opacity .5s`; return g;
        });
        return { tape, shelf, note, mem, log, sheets };
      },
      frame(s, kit, R) {
        const n = s.n || 0, ap = s.ap || 0, fl = s.fl || 0, rel = s.rel || 0, sst = s.sst || 2;
        R.tape.cells(Array.from({ length: 10 }, (_, i) => (i < n ? { t: String(K1[i]), tone: i < rel ? 'rel' : 'live' } : { t: '', tone: '' }))).head(n, n < 10);
        R.note.set(rel > 0 ? 'cells freed: rows are safe in SST 3' : ''); R.note.el.style.opacity = rel > 0 ? 1 : 0;
        const inMem = []; for (let i = fl; i < ap; i++) inMem.push(i);
        const rk = rankMap(inMem, K1);
        K1.forEach((k, i) => {
          if (i >= ap) R.shelf.put(i, { x: R.tape.cx(i) - 25, y: 112, show: false, tone: 'info' });
          else if (i < fl) R.shelf.put(i, { x: 270, y: shY(sst - 1) - 6, show: false, tone: 'ok' });
          else R.shelf.put(i, { x: R.shelf.slotX(rk[i]), y: R.shelf.y, show: true, tone: i === ap - 1 && s.hot ? 'cursor' : 'info', hl: i === ap - 1 && !!s.hot });
        });
        const f = (ap - fl) / 6; R.mem.set(f, f >= 1 ? 'bad' : f >= 0.7 ? 'warn' : 'ok', Math.round(f * 100) + '%' + (f >= 1 ? ' full: flush' : ''));
        const lf = (n - rel) / 10; R.log.set(lf, lf > 0.55 ? 'warn' : 'info', (n - rel) + ' of 10 slots used');
        R.sheets.forEach((g, j) => {
          const on = j < sst; g.style.transform = `translate(104px,${on ? shY(j) : 176}px)`; g.style.opacity = on ? 1 : 0;
        });
      }
    },
    bug: [
      { log: 'A quiet replica: an empty memtable shelf in RAM, a commit-log tape with nothing on it, and two older SSTable sheets on disk.',
        callout: 'Tape, shelf and sheets: the three parts of a write', code: 0, state: { r: 'idle replica' },
        stats: [{ l: 'tape records', v: '0' }, { l: 'memtable rows', v: '0' }, { l: 'SSTables', v: '2' }] },
      { log: 'Order 57 arrives. The replica appends it to the commit-log tape first. The head only writes at the end, so an append is cheap.',
        callout: 'Append first: the head writes only at the end', code: 0, state: { n: 1, r: 'append 57' },
        stats: [{ l: 'tape records', v: '1', cls: 'ok' }, { l: 'memtable rows', v: '0' }] },
      { log: 'Then the row is applied to the memtable, a sorted table in RAM. It takes the first slot on the shelf and the memory gauge starts to fill.',
        callout: 'Then the row slides onto the memtable shelf', code: 1, state: { n: 1, ap: 1, hot: true, r: 'apply 57' },
        stats: [{ l: 'tape records', v: '1' }, { l: 'memtable rows', v: '1', cls: 'ok' }, { l: 'memory', v: '17%' }] },
      { log: 'Order 23 arrives after 57 but sorts before it. The tape keeps arrival order, so 23 goes second. The shelf keeps sorted order, so 23 slides in on the left.',
        callout: 'Tape: arrival order. Shelf: sorted order', moment: true, code: 1, state: { n: 2, ap: 2, hot: true, r: 'apply 23' },
        stats: [{ l: 'tape order', v: '57, 23' }, { l: 'shelf order', v: '23, 57', cls: 'ok' }] },
      { log: 'Orders 91, 40 and 12 follow. Each is appended to the tape, then slides into its sorted slot. The gauge climbs toward the flush threshold.',
        callout: 'The gauge climbs toward the flush threshold', code: 1, state: { n: 5, ap: 5, r: 'rows 5 of 6' },
        stats: [{ l: 'memtable rows', v: '5' }, { l: 'memory', v: '83%', cls: 'warn' }] },
      { log: 'Order 75 fills the last slot. The memtable reaches its flush threshold (illustrative: 6 rows).',
        callout: 'The memory gauge hits the flush threshold', code: 2, state: { n: 6, ap: 6, r: 'flush threshold' },
        stats: [{ l: 'memory', v: '100%', cls: 'bad' }, { l: 'tape records', v: '6' }] },
      { log: 'The six sorted rows are written out as one immutable SSTable. The new sheet drops onto the stack and the shelf is empty again.',
        callout: 'Flush: the sorted shelf drops onto the SSTable stack', code: 2, state: { n: 6, ap: 6, fl: 6, sst: 3, r: 'flush to SST 3' },
        stats: [{ l: 'SSTables', v: '3', cls: 'ok' }, { l: 'memtable rows', v: '0', cls: 'ok' }, { l: 'tape records', v: '6' }] },
      { log: 'Every row on those tape cells is now in an SSTable, so the replica no longer needs them for crash recovery. The segment is released and the log shrinks.',
        callout: 'Released: the tape behind the flush is freed', moment: true, code: 3, state: { n: 6, ap: 6, fl: 6, rel: 6, sst: 3, r: 'segment released' },
        stats: [{ l: 'commitlog in use', v: '0 of 10', cls: 'ok' }, { l: 'SSTables', v: '3' }] },
      { log: 'Order 31 arrives. It is appended after the freed cells and lands alone on the empty shelf. The cycle starts again.',
        callout: 'A new cycle: one row on an empty shelf', code: 1, state: { n: 7, ap: 7, fl: 6, rel: 6, sst: 3, hot: true, r: 'append 31' },
        stats: [{ l: 'memtable rows', v: '1' }, { l: 'tape records live', v: '1' }, { l: 'SSTables', v: '3' }],
        takeaway: 'The tape is for crashes, the shelf is for sorting, the sheet is for keeps. The tape behind a flush is released.' },
    ],
  };

  /* ================= 2. Periodic sync: the ACK leaves before the sync, then a power cut ================= */
  const K2 = [978, 979, 980, 981, 982];
  const T2 = { x: 100, y: 98, pitch: 50, cw: 46, ch: 32, slots: 10, sy: 78, sh: 80, lx: 24, label: 'commitlog', sub: 'replica A', head: true, sync: true, acks: true };
  const S2 = { x: 100, y: 196, slots: 6, pitch: 56, cw: 50, ch: 30, py: 182, ph: 62, lx: 24, label: 'memtable', sub: 'RAM, sorted', keys: K2 };
  const MB = { x: 100, y: 262, pitch: 50, cw: 46, ch: 18, slots: 10, sy: 252, sh: 38, lx: 24, label: 'replica B', sub: 'other rack' };
  const MC = { x: 100, y: 304, pitch: 50, cw: 46, ch: 18, slots: 10, sy: 294, sh: 38, lx: 24, label: 'replica C', sub: 'other rack' };
  const periodic = {
    id: 'ack-before-sync', label: 'Periodic sync and crash', desc: 'In periodic mode the ACK leaves before the commit-log tape is synced, so a power cut can take acknowledged writes from one replica.',
    codeLabel: 'Config', code: { bug: [
      '# scylla.yaml, periodic mode (values illustrative)',
      'commitlog_sync: periodic',
      'commitlog_sync_period_in_ms: 10000',
      '# a power cut inside that period loses the unsynced tail'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one replica loses power, B and C stay up. Illustrative timings.',
      header: s => ({ left: `replica A · periodic sync · acked ${s.ack || 0} · synced ${s.sy || 0}`, right: s.r || '' }),
      setup(kit) {
        const P = kit.layer, tape = makeTape(kit, T2), shelf = makeShelf(kit, S2), tb = makeTape(kit, MB), tc = makeTape(kit, MC);
        const rep = kit.chip(P, { x: 452, y: 188, w: 168, h: 44, label: 'repair later', sub: 'copies 981, 982 back', tone: 'cursor', show: false });
        return { tape, shelf, tb, tc, rep };
      },
      frame(s, kit, R) {
        const n = s.n || 0, ack = s.ack || 0, ap = s.ap || 0, sy = s.sy || 0, cr = s.cr || 0;
        R.tape.cells(K2.map((k, i) => (i >= n ? { t: '', tone: '' } : cr >= 1 && i >= sy ? { t: String(k), tone: 'bad' } : cr === 2 ? { t: String(k), tone: 'rp' } : { t: String(k), tone: i < sy ? 'ok' : 'warn' })).concat(Array(5).fill({ t: '', tone: '' })));
        R.tape.head(n, cr === 0).sync(sy).acks(K2.map((k, i) => (i < ack ? 'sent' : i < n ? 'held' : 'none')));
        const other = K2.map((k, i) => (i < n ? { t: String(k), tone: 'live' } : { t: '', tone: '' })).concat(Array(5).fill({ t: '', tone: '' }));
        R.tb.cells(other); R.tc.cells(other);
        const set = cr === 2 ? K2.map((k, i) => i).filter(i => i < sy) : K2.map((k, i) => i).filter(i => i < ap), rk = rankMap(set, K2);
        K2.forEach((k, i) => {
          if (cr === 1) R.shelf.put(i, { x: R.shelf.slotX(rankMap(K2.map((q, j) => j).filter(j => j < ap), K2)[i] || 0), y: R.shelf.y, show: false, tone: 'info' });
          else if (set.indexOf(i) >= 0) R.shelf.put(i, { x: R.shelf.slotX(rk[i]), y: R.shelf.y, show: true, tone: cr === 2 ? 'ok' : 'info', hl: false });
          else R.shelf.put(i, { x: R.tape.cx(i) - 25, y: 112, show: false, tone: 'info' });
        });
        R.shelf.cut(cr === 1);
        R.rep.set({ show: !!s.rep });
      }
    },
    bug: [
      { log: 'Order 978 arrives from the coordinator. It is appended at the head of the commit-log tape. Amber means on the tape but not yet synced to disk.',
        callout: 'Appended at the head, not yet synced', code: 1, state: { n: 1, r: 'append 978' },
        stats: [{ l: 'on tape', v: '1' }, { l: 'synced', v: '0', cls: 'warn' }, { l: 'acked', v: '0' }] },
      { log: 'In periodic mode the ACK leaves at once, before any sync. The client now holds an OK for a write that is only on the tape, and the row also joins the memtable.',
        callout: 'Periodic: the ACK leaves before any sync', moment: true, code: 1, state: { n: 1, ack: 1, ap: 1, r: 'ACK 978 at once' },
        stats: [{ l: 'acked', v: '1', cls: 'warn' }, { l: 'synced', v: '0', cls: 'warn' }] },
      { log: 'Orders 979 and 980 follow. Each is appended, acknowledged immediately and applied to the memtable. Three OKs are out and nothing is synced.',
        callout: 'Three OKs are out, nothing is synced yet', code: 1, state: { n: 3, ack: 3, ap: 3, r: '3 acked, 0 synced' },
        stats: [{ l: 'acked', v: '3', cls: 'warn' }, { l: 'synced', v: '0', cls: 'warn' }] },
      { log: 'The sync timer fires (every commitlog_sync_period_in_ms, 10000 here, illustrative). The synced line sweeps to the head and the three cells turn green.',
        callout: 'The sync timer fires: the synced line moves up', code: 2, state: { n: 3, ack: 3, ap: 3, sy: 3, r: 'fsync tick' },
        stats: [{ l: 'acked', v: '3' }, { l: 'synced', v: '3', cls: 'ok' }] },
      { log: 'Orders 981 and 982 arrive after the tick. They are acknowledged at once again, so two OKs now sit past the synced line, on the tape only.',
        callout: 'Two more OKs go out past the synced line', code: 2, state: { n: 5, ack: 5, ap: 5, sy: 3, r: '2 acked past the line' },
        stats: [{ l: 'acked', v: '5', cls: 'warn' }, { l: 'synced', v: '3', cls: 'warn' }, { l: 'at risk', v: '2', cls: 'bad' }] },
      { log: 'The rack loses power. RAM is wiped, so the memtable is gone, and the unsynced tail of the tape never reached the disk. The client still holds both OKs.',
        callout: 'Power cut: the unsynced tail is gone', moment: true, code: 3, state: { n: 5, ack: 5, ap: 5, sy: 3, cr: 1, r: 'power cut' },
        stats: [{ l: 'acked to client', v: '5', cls: 'warn' }, { l: 'on this disk', v: '3', cls: 'bad' }, { l: 'lost here', v: '2', cls: 'bad' }] },
      { log: 'On restart the replica replays the tape up to the synced line. Orders 978 to 980 return to the shelf. Orders 981 and 982 are not there.',
        callout: 'Replay rebuilds 978-980 only', code: 3, state: { n: 5, ack: 5, ap: 5, sy: 3, cr: 2, r: 'replay up to the line' },
        stats: [{ l: 'replayed', v: '3', cls: 'ok' }, { l: 'lost here', v: '2', cls: 'bad' }] },
      { log: 'Replicas B and C sit on other racks and kept both rows, so the data is not gone from the cluster. A repair copies 981 and 982 back to this replica.',
        callout: 'Replicas B and C still hold 981 and 982', code: 0, state: { n: 5, ack: 5, ap: 5, sy: 3, cr: 2, rep: true, r: 'copies survive elsewhere' },
        stats: [{ l: 'copies elsewhere', v: '2', cls: 'ok' }, { l: 'lost here', v: '2', cls: 'bad' }],
        takeaway: 'Periodic sync ACKs before the disk sync, so one replica can lose its last window. Other replicas keep the rows.' },
    ],
  };

  /* ================= 3. Batch sync: wait for the window, one fsync, then ACK ================= */
  const K3 = [979, 980, 981, 982];
  const T3 = { x: 100, y: 98, pitch: 50, cw: 46, ch: 32, slots: 10, sy: 78, sh: 80, lx: 24, label: 'commitlog', sub: 'batch mode', head: true, sync: true, acks: true, band: true };
  const S3 = { x: 100, y: 196, slots: 6, pitch: 56, cw: 50, ch: 30, py: 182, ph: 62, lx: 24, label: 'memtable', sub: 'RAM, sorted', keys: K3 };
  const batchSync = {
    id: 'batch-sync', label: 'Batch mode, sync first', desc: 'In batch mode writes wait in a window, one fsync covers them all, and only then do the ACKs go out, so a power cut cannot take them.',
    codeLabel: 'Config', code: { bug: [
      '# scylla.yaml, batch mode (values illustrative)',
      'commitlog_sync: batch',
      'commitlog_sync_batch_window_in_ms: 2',
      '# the ACK waits for the sync that closes the window'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one replica, a 2 ms window, illustrative timings.',
      header: s => ({ left: `replica · batch sync · acked ${s.ack || 0} · synced ${s.sy || 0}`, right: s.r || '' }),
      setup(kit) {
        const P = kit.layer, tape = makeTape(kit, T3), shelf = makeShelf(kit, S3);
        kit.el('rect', { class: 'pbox tone-info', x: 92, y: 254, width: 524, height: 88, rx: 10 }, P);
        kit.text(P, { x: 24, y: 276, t: 'window clock', cls: 'b' }); kit.text(P, { x: 24, y: 291, t: 'illustrative', cls: 'mut xs' });
        const clock = makeGauge(kit, { x: 104, y: 278, w: 270, title: 'batch window (2 ms)', h: 14, flag: 'window closes' });
        const fs = kit.chip(P, { x: 408, y: 262, w: 196, h: 44, label: 'fsync x1', sub: '3 writes, 1 disk call', tone: 'cursor', show: false });
        const lat = kit.bars(P, { x: 104, y: 312, w: 380, rowH: 14, labelW: 64, max: 3, unit: ' ms', items: [{ id: 'p', label: 'periodic' }, { id: 'b', label: 'batch' }] });
        const latT = kit.text(P, { x: 496, y: 323, t: 'ACK wait (illustrative)', cls: 'mut xs' });
        latT.el.style.transition = 'opacity .4s';
        return { tape, shelf, clock, fs, lat, latT };
      },
      frame(s, kit, R) {
        const n = s.n || 0, ack = s.ack || 0, ap = s.ap || 0, sy = s.sy || 0, cr = s.cr || 0;
        R.tape.cells(K3.map((k, i) => (i >= n ? { t: '', tone: '' } : cr === 2 && i < 3 ? { t: String(k), tone: 'rp' } : { t: String(k), tone: i < sy ? 'ok' : 'warn' })).concat(Array(6).fill({ t: '', tone: '' })));
        R.tape.head(n, true).sync(sy).win(s.wf || 0, s.win || 0).acks(K3.map((k, i) => (i < ack ? 'sent' : i < n ? 'held' : 'none')));
        const keep = K3.map((k, i) => i).filter(i => i < ap), set = cr === 1 ? [] : keep, rk = rankMap(keep, K3);
        K3.forEach((k, i) => {
          if (set.indexOf(i) >= 0) R.shelf.put(i, { x: R.shelf.slotX(rk[i]), y: R.shelf.y, show: true, tone: cr === 2 ? 'ok' : 'info' });
          else if (cr === 1 && i < ap) R.shelf.put(i, { x: R.shelf.slotX(rk[i]), y: R.shelf.y, show: false, tone: 'info' });
          else R.shelf.put(i, { x: R.tape.cx(i) - 25, y: 112, show: false, tone: 'info' });
        });
        R.shelf.cut(cr === 1);
        const c = s.clock || 0; R.clock.set(c, c >= 1 ? 'warn' : 'info', c > 0 ? (c >= 1 ? '2 ms: window closed' : (Math.round(c * 20) / 10) + ' ms waited') : 'idle');
        R.fs.set({ show: !!s.fs, label: 'fsync x' + (s.fs || 1), sub: s.fsT || '3 writes, 1 disk call' });
        R.lat.g.style.opacity = s.lat ? 1 : 0; R.latT.el.style.opacity = s.lat ? 1 : 0;
        R.lat.set('p', s.lat ? 0.3 : 0, 'ok', s.lat ? '0.3 ms' : ''); R.lat.set('b', s.lat ? 2.3 : 0, 'warn', s.lat ? '2.3 ms' : '');
      }
    },
    bug: [
      { log: 'Order 979 arrives. It is appended to the tape, but in batch mode the replica holds the ACK. The amber dashed ring marks an ACK that is still waiting, and the batch window opens.',
        callout: 'Appended, ACK held: the batch window opens', code: 1, state: { n: 1, win: 1, wf: 0, clock: 0.25, r: 'window open' },
        stats: [{ l: 'on tape', v: '1' }, { l: 'synced', v: '0', cls: 'warn' }, { l: 'acked', v: '0' }] },
      { log: 'Orders 980 and 981 arrive before the window closes. They join the same group. All three ACKs are still held.',
        callout: 'Two more writes join the same window', code: 1, state: { n: 3, win: 3, wf: 0, clock: 0.9, r: '3 writes waiting' },
        stats: [{ l: 'on tape', v: '3' }, { l: 'synced', v: '0', cls: 'warn' }, { l: 'acked', v: '0' }] },
      { log: 'The window closes and the replica calls fsync once for the whole group, not once per write. The synced line sweeps over all three cells.',
        callout: 'One fsync covers the whole group', code: 2, state: { n: 3, win: 3, wf: 0, clock: 1, sy: 3, fs: 1, r: 'one fsync, 3 writes' },
        stats: [{ l: 'fsync calls', v: '1', cls: 'ok' }, { l: 'synced', v: '3', cls: 'ok' }, { l: 'acked', v: '0' }] },
      { log: 'Only after the sync do the ACKs go out, all together. Every acknowledged write is already on the disk.',
        callout: 'ACK only after the sync', moment: true, code: 3, state: { n: 3, ack: 3, sy: 3, fs: 1, r: '3 acked, 3 synced' },
        stats: [{ l: 'acked', v: '3', cls: 'ok' }, { l: 'synced', v: '3', cls: 'ok' }, { l: 'at risk', v: '0', cls: 'ok' }] },
      { log: 'The rows are also applied to the memtable shelf in RAM. That copy is for sorted reads and is disposable: the tape is the safe copy.',
        callout: 'The shelf copy is disposable; the tape is not', code: 3, state: { n: 3, ack: 3, ap: 3, sy: 3, fs: 1, r: 'RAM copy applied' },
        stats: [{ l: 'memtable rows', v: '3' }, { l: 'synced', v: '3', cls: 'ok' }] },
      { log: 'The rack loses power. RAM is wiped, so the memtable shelf is gone. The tape is untouched, because each write was synced before its ACK.',
        callout: 'Power cut: the synced tape survives', moment: true, code: 3, state: { n: 3, ack: 3, ap: 3, sy: 3, fs: 1, cr: 1, r: 'power cut' },
        stats: [{ l: 'on disk', v: '3', cls: 'ok' }, { l: 'acked', v: '3' }, { l: 'lost', v: '0', cls: 'ok' }] },
      { log: 'On restart the replica replays the tape and rebuilds the shelf. All three acknowledged writes come back.',
        callout: 'Replay recovers all three acknowledged writes', code: 3, state: { n: 3, ack: 3, ap: 3, sy: 3, fs: 1, cr: 2, r: 'replay: 3 recovered' },
        stats: [{ l: 'recovered', v: '3', cls: 'ok' }, { l: 'lost', v: '0', cls: 'ok' }] },
      { log: 'The price: order 982 arrives alone, and still waits for the window to close before it can be synced. Its ACK is held for that time.',
        callout: 'Price: even a lone write waits for the window', code: 1, state: { n: 4, ack: 3, ap: 4, sy: 3, win: 1, wf: 3, clock: 0.7, fs: 1, r: 'lone write waits' },
        stats: [{ l: 'on tape', v: '4' }, { l: 'acked', v: '3' }, { l: 'waiting', v: '1', cls: 'warn' }] },
      { log: 'After the window and a second fsync the ACK goes out. Every ACK in batch mode waits for the window and a sync, which is slower than periodic (illustrative).',
        callout: 'Every ACK pays the window plus one sync', code: 3, state: { n: 4, ack: 4, ap: 4, sy: 4, fs: 2, fsT: '1 write, 1 disk call', lat: true, r: 'ACK after the sync' },
        stats: [{ l: 'ACK wait, batch', v: '2.3 ms', cls: 'warn' }, { l: 'ACK wait, periodic', v: '0.3 ms', cls: 'ok' }, { l: 'lost', v: '0', cls: 'ok' }],
        takeaway: 'Batch mode waits for the sync before every ACK. Each write pays the window, and no acknowledged write is lost to a power cut.' },
    ],
  };

  /* ================= 4. Batch size: the thresholds, the batchlog and the refusal ================= */
  const KB_MAX = 1280, RX = 100, RW = 500, kx = kb => RX + RW * kb / KB_MAX;
  const LANE_Y = [122, 168, 214];
  const batchSize = {
    id: 'batch-size', label: 'Batch size thresholds', desc: 'A logged batch across several partitions grows past the warn line, loads other replicas through the batchlog, and is refused past the fail line.',
    codeLabel: 'Config', code: { bug: [
      '# scylla.yaml defaults, as in the source page',
      'batch_size_warn_threshold_in_kb: 128',
      'batch_size_fail_threshold_in_kb: 1024',
      '# a logged batch across partitions is also stored as a batchlog'] },
    stage: {
      w: 640, h: 420, footer: 'Illustrative batch sizes. Defaults: warn at 128 KB, fail at 1024 KB (source).',
      header: s => ({ left: 'warn 128 KB · fail 1024 KB', right: s.r || '' }),
      setup(kit) {
        const P = kit.layer;
        kit.text(P, { x: 24, y: 91, t: 'batch size', cls: 'b' }); kit.text(P, { x: 24, y: 106, t: 'in KB', cls: 'mut xs' });
        kit.el('rect', { class: 'kbar-track', x: RX, y: 84, width: RW, height: 16, rx: 8 }, P);
        const fill = kit.el('rect', { class: 'kbar-fill', x: RX, y: 84, width: RW, height: 16, rx: 8 }, P);
        [[128, 'warn 128 KB', 'warn'], [1024, 'fail 1024 KB', 'bad']].forEach(([kb, t, c]) => {
          kit.el('line', { x1: kx(kb), x2: kx(kb), y1: 79, y2: 105, 'stroke-width': 2.6 }, P).style.stroke = `var(--${c})`;
          kit.text(P, { x: kx(kb), y: 76, t, cls: 'xs b tone-' + c, anchor: 'middle' });
        });
        const val = kit.text(P, { x: RX, y: 118, t: '', cls: 'sm b', anchor: 'middle' }); val.el.style.transition = 'transform .7s ' + EASE; val.el.setAttribute('x', 0);
        const names = [['node A', 'coordinator'], ['node B', 'replica'], ['node C', 'replica']];
        names.forEach(([a, b], i) => {
          kit.el('rect', { class: 'pbox tone-info', x: 92, y: LANE_Y[i], width: 512, height: 42, rx: 10 }, P);
          kit.text(P, { x: 24, y: LANE_Y[i] + 18, t: a, cls: 'b' }); kit.text(P, { x: 24, y: LANE_Y[i] + 33, t: b, cls: 'mut xs' });
        });
        const slab = kit.chip(P, { x: 104, y: LANE_Y[0] + 4, w: 140, h: 34, label: 'batch 96 KB', sub: '4 partitions', tone: 'cursor', show: false });
        const bl1 = kit.chip(P, { x: 104, y: LANE_Y[1] + 4, w: 140, h: 34, label: 'batch 140 KB', sub: 'batchlog copy', tone: 'ok', show: false });
        const bl2 = kit.chip(P, { x: 104, y: LANE_Y[2] + 4, w: 140, h: 34, label: 'batch 140 KB', sub: 'batchlog copy', tone: 'ok', show: false });
        const tiny = [];
        for (let i = 0; i < 9; i++) tiny.push(kit.chip(P, { x: 104 + Math.floor(i / 3) * 46, y: LANE_Y[i % 3] + 6, w: 40, h: 30, label: '4 KB', tone: 'ok', small: true, show: false }));
        const none = kit.text(P, { x: 104, y: LANE_Y[1] + 25, t: 'nothing arrives here', cls: 'xs mut' }), none2 = kit.text(P, { x: 104, y: LANE_Y[2] + 25, t: 'nothing arrives here', cls: 'xs mut' });
        none.el.style.transition = none2.el.style.transition = 'opacity .4s';
        const load = kit.bars(P, { x: 420, y: LANE_Y[0] + 15, w: 180, rowH: 46, labelW: 38, max: 100, unit: '%', items: [{ id: 'a', label: 'load' }, { id: 'b', label: 'load' }, { id: 'c', label: 'load' }] });
        kit.el('rect', { class: 'pbox tone-info', x: 92, y: 268, width: 512, height: 72, rx: 10 }, P);
        kit.text(P, { x: 24, y: 292, t: 'client', cls: 'b' }); kit.text(P, { x: 24, y: 307, t: 'gets back', cls: 'mut xs' });
        const res = kit.chip(P, { x: 108, y: 286, w: 230, h: 40, label: 'WARN in the log', sub: 'batch still runs', tone: 'warn', show: false });
        const note = kit.text(P, { x: 356, y: 311, t: '', cls: 'sm' }); note.el.style.transition = 'opacity .4s';
        return { fill, val, slab, bl1, bl2, tiny, none, none2, load, res, note };
      },
      frame(s, kit, R) {
        const kb = s.kb || 0, tone = kb >= 1024 ? 'bad' : kb >= 128 ? 'warn' : 'ok';
        R.fill.style.transform = `scaleX(${clamp01(kb / KB_MAX)})`; R.fill.dataset.tone = tone;
        const vx = Math.max(RX + 24, Math.min(RX + RW - 30, kx(kb)));
        R.val.el.style.transform = `translate(${vx}px,0px)`; R.val.set(s.kbT || (kb >= 1000 ? (kb / 1000).toFixed(1) + ' MB' : kb + ' KB'));
        R.val.el.setAttribute('class', 'kt sm b tone-' + (tone === 'ok' ? 'ok' : tone));
        const sl = s.slab || null;
        R.slab.set(sl ? { show: true, label: sl[0], sub: sl[1], tone: sl[2] } : { show: false });
        R.bl1.set({ show: !!s.blog }); R.bl2.set({ show: !!s.blog });
        R.none.set(s.refused ? 'nothing arrives here' : ''); R.none.el.style.opacity = s.refused ? 1 : 0; R.none2.set(s.refused ? 'nothing arrives here' : ''); R.none2.el.style.opacity = s.refused ? 1 : 0;
        R.tiny.forEach(c => c.set({ show: !!s.tiny }));
        const ld = s.load || [0, 0, 0]; ['a', 'b', 'c'].forEach((id, i) => R.load.set(id, ld[i], ld[i] >= 80 ? 'bad' : ld[i] >= 50 ? 'warn' : 'ok'));
        const rs = { warn: ['WARN in the log', 'batch still runs', 'warn'], fail: ['InvalidRequest', 'Batch too large', 'delete'], ok: ['OK, every write', 'sent one by one', 'ok'] }[s.res];
        R.res.set(rs ? { show: true, label: rs[0], sub: rs[1], tone: rs[2] } : { show: false });
        R.note.set(s.note || ''); R.note.el.style.opacity = s.note ? 1 : 0;
      }
    },
    bug: [
      { log: 'The coordinator holds one logged batch that spans four partitions. At this point it is 96 KB (illustrative), under the warn line.',
        callout: 'One logged batch across four partitions: 96 KB', code: 0,
        state: { kb: 96, slab: ['batch 96 KB', '4 partitions', 'cursor'], load: [25, 0, 0], r: 'under the warn line' },
        stats: [{ l: 'batch size', v: '96 KB', cls: 'ok' }, { l: 'warnings', v: '0', cls: 'ok' }] },
      { log: 'The batch grows to 140 KB (illustrative) and crosses the warn line of 128 KB. A warning is logged, and the batch still goes through.',
        callout: 'Past the 128 KB warn line: a warning, and it runs', code: 1,
        state: { kb: 140, slab: ['batch 140 KB', '4 partitions', 'warn'], res: 'warn', load: [40, 0, 0], r: 'over the warn line' },
        stats: [{ l: 'batch size', v: '140 KB', cls: 'warn' }, { l: 'warnings', v: '1', cls: 'warn' }] },
      { log: 'Before it applies the batch, the coordinator stores a batchlog copy on two other replicas. The load now falls on B and C too, not only on A.',
        callout: 'Batchlog copies load two other replicas too', code: 3,
        state: { kb: 140, slab: ['batch 140 KB', '4 partitions', 'warn'], blog: true, res: 'warn', load: [75, 50, 50], r: 'batchlog on B and C' },
        stats: [{ l: 'nodes loaded', v: '3', cls: 'warn' }, { l: 'batchlog copies', v: '2', cls: 'warn' }] },
      { log: 'Another batch is 1.1 MB (illustrative). It runs past the fail line of 1024 KB. The gauge turns red before anything is sent to B or C.',
        callout: 'Past the 1024 KB fail line', moment: true, code: 2,
        state: { kb: 1100, slab: ['batch 1.1 MB', '4 partitions', 'cursor'], load: [30, 0, 0], r: 'over the fail line' },
        stats: [{ l: 'batch size', v: '1.1 MB', cls: 'bad' }, { l: 'fail line', v: '1024 KB' }] },
      { log: 'The coordinator refuses it. The client gets an InvalidRequest error with Batch too large, and no batchlog copy is made on B or C.',
        callout: 'Refused: the client gets an error, not a result', code: 2,
        state: { kb: 1100, slab: ['batch 1.1 MB', 'refused', 'delete'], res: 'fail', refused: true, load: [30, 0, 0], r: 'InvalidRequest' },
        stats: [{ l: 'rejected', v: '1', cls: 'bad' }, { l: 'batchlog copies', v: '0', cls: 'ok' }] },
      { log: 'Sent as separate single writes, each row is small and goes straight to the replicas that own its partition. They never form a batch, so the thresholds do not apply.',
        callout: 'Single writes never form a batch: no thresholds', code: 1,
        state: { kb: 4, kbT: '4 KB each', tiny: true, res: 'ok', load: [30, 30, 30], note: 'spread by partition', r: 'async single writes' },
        stats: [{ l: 'write size', v: '4 KB', cls: 'ok' }, { l: 'busiest node', v: '30%', cls: 'ok' }] },
      { log: 'Batches are for atomic writes to one partition. A bulk load should send individual asynchronous writes instead, so no single node carries it.',
        callout: 'Bulk loads: async single writes, batches per partition', code: 0,
        state: { kb: 4, kbT: '4 KB each', tiny: true, res: 'ok', load: [30, 30, 30], note: 'one batch per partition at most', r: 'bulk load, spread out' },
        stats: [{ l: 'rejected', v: '0', cls: 'ok' }, { l: 'busiest node', v: '30%', cls: 'ok' }],
        takeaway: 'A large multi-partition batch loads the coordinator and several replicas at once. Keep batches to one partition.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[3] = { explain: EXPLAIN(), scenarios: [appendFlush, periodic, batchSync, batchSize] };

  function EXPLAIN() {
    return `
<h3>1. Append, apply, then write later</h3>
<p>A replica must accept writes fast and still survive a crash. It appends each mutation to a sequential commitlog first, then applies it to a sorted in-memory memtable, and later writes that memtable out as an immutable SSTable. Appends are cheap because they are sequential. The log is only there for recovery: after a crash, the node replays the commitlog to rebuild what the memtable held. The sync mode decides when the replica is allowed to acknowledge a write, and that single choice sets the durability of every write it accepts. When the memtable is full it is flushed as an immutable SSTable, and the matching commitlog segments can then be released. That is what keeps the log from growing without bound.</p>

<h3>2. The path of one mutation</h3>
<p>The coordinator sends the mutation, the replica appends it, and the sync setting decides when the ACK leaves. The sequence below shows both branches of <code>commitlog_sync</code>:</p>
<figure class="mm" aria-label="Sequence diagram: the replica appends to the commitlog, then ACKs at once in periodic mode or after a sync in batch mode, and applies to the memtable" style="--diagram-width:602.12px">
  <img src="diagrams/ch03-sync-sequence.svg" alt="Sequence diagram: the coordinator sends a mutation to the replica, which appends it to the commitlog on disk. In periodic mode the replica ACKs at once and syncs later, every commitlog_sync_period_in_ms. In batch mode it waits up to the batch window, syncs, and then ACKs. The replica then applies the mutation to the memtable.">
  <figcaption>Sequence (Mermaid source: diagrams/ch03-sync-sequence.mmd): the only difference between the modes is where the ACK sits relative to the sync.</figcaption>
</figure>
<p>Read as a lifecycle, one mutation moves through a few states. Only the first two states are on disk, and the ACK is sent at the boundary between them:</p>
<figure class="mm" aria-label="State diagram: a mutation is appended, acknowledged, applied to the memtable, then flushed" style="--diagram-width:205.88px">
  <img src="diagrams/ch03-mutation-states.svg" alt="State diagram: a mutation is appended, acknowledged, applied to the memtable, then flushed">
  <figcaption>State: one mutation. The commitlog segment can be released once its data is in an SSTable.</figcaption>
</figure>

<h3>3. Periodic and batch: where the ACK sits</h3>
<p>In <code>periodic</code> mode the ACK goes out at once. The commitlog is synced every <code>commitlog_sync_period_in_ms</code>, so a crash inside that window can lose the last acknowledged writes on that one replica. In <code>batch</code> mode the replica waits up to <code>commitlog_sync_batch_window_in_ms</code> for other writes, syncs the whole group once, and only then acknowledges. Every acknowledged write is on disk, at the cost of the window on each write. Neither mode protects a single replica against every failure. Other replicas, on other racks, hold the same row, so the real risk depends on how many copies are lost together. If an application needs one replica to keep every acknowledged write across a power cut, batch sync is the mode that promises it. Periodic sync asks the cluster to cover that gap with its other copies instead.</p>

<h3>4. Guards on the same path</h3>
<p>Two guards sit beside the write path. A critical disk-utilization guard rejects user writes before the disk is completely full, so the node keeps room to migrate or compact. The second guard limits batches, and it is the one most often hit by bulk imports. A logged batch that spans several partitions is also stored as a batchlog entry on other replicas before it is applied, so one large batch loads the coordinator and several replicas at once. The warn threshold, <code>batch_size_warn_threshold_in_kb</code>, defaults to 128 KB, and the fail threshold, <code>batch_size_fail_threshold_in_kb</code>, defaults to 1024 KB. Past the fail threshold the coordinator refuses the batch with an error.</p>

<h3>5. The trade-off</h3>
<p>Periodic sync is faster, because the ACK does not wait for the disk, and it can lose the last window of acknowledged writes on one replica. Batch sync waits on every ACK, so it costs latency, and it keeps those writes. Neither choice changes the cluster-wide rule: a write is only as durable as the number of replicas that hold it. For bulk loads, the batch thresholds are the wrong tool. Send individual asynchronous writes and keep batches to one partition.</p>

<h3>6. The syntax, in one place</h3>
<pre># scylla.yaml: the replica acknowledges before the sync (periodic) or after it (batch)
commitlog_sync: periodic
commitlog_sync_period_in_ms: 10000

# or: wait for the sync, within a batch window
commitlog_sync: batch
commitlog_sync_batch_window_in_ms: 2

# logged batch limits: warn at 128 KB, fail at 1024 KB (the defaults)
batch_size_warn_threshold_in_kb: 128
batch_size_fail_threshold_in_kb: 1024

-- a logged batch across partitions, as CQL
BEGIN BATCH
  INSERT INTO orders (seller_id, order_id, total) VALUES (1, 9001, 4.50);
  INSERT INTO orders (seller_id, order_id, total) VALUES (2, 9002, 7.00);
APPLY BATCH;</pre>
<p>The sync values are illustrative. Check the durability you need against the mode in use, because each node reads these settings from its own scylla.yaml.</p>`;
  }
})();
