/* Chapter 7 "Repair and gc_grace_seconds": bespoke scenes plus the Explain text (index 7, zero-based).
   Loads after course.js and scene-kit.js; course.html merges CHAPTER_OVERRIDES into the course.
   Metaphor: one hash tree per replica, compared top-down. Matching branches are skipped, only the branches that differ
   are opened, and only the ranges at their leaves are streamed. The picture is a teaching model: real repair works on
   token sub-ranges and rows, not on a fixed 8-leaf tree.
   The resurrection story lives in chapter 6 (Deletes, TTL and Tombstones) and is not redrawn here.
   Hashes, times, counts and sizes are illustrative unless the course text gives a default. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;
  const mix = (c, p) => `color-mix(in srgb, var(--${c}) ${p}%, var(--card))`;
  const pad = n => String(n).padStart(2, '0');

  /* ---- node and edge looks (theme variables only, so dark mode works) ---- */
  const TONE = {
    idle: { f: 'var(--card)', s: 'var(--mut)', w: 1.4, o: 1 },
    ok: { f: mix('ok', 38), s: 'var(--ok)', w: 2, o: 1 },
    bad: { f: mix('bad', 26), s: 'var(--bad)', w: 2.2, o: 1 },
    warn: { f: mix('warn', 32), s: 'var(--warn)', w: 2, o: 1 },
    skip: { f: 'var(--soft)', s: 'var(--line)', w: 1.2, o: .42 },
    cur: { f: mix('acc2', 26), s: 'var(--acc2)', w: 2.4, o: 1 },
    del: { f: mix('bad', 12), s: 'var(--bad)', w: 1.8, o: 1, dash: '4 3' },
  };
  const ETONE = { idle: ['var(--mut)', 1.2, .7, 'none'], ok: ['var(--ok)', 2.2, 1, 'none'], bad: ['var(--bad)', 2.8, 1, 'none'], skip: ['var(--line)', 1.2, .5, '3 3'] };

  /* ---- a tiny hash: same input, same 3 hex characters ---- */
  const hx = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return (h % 4096).toString(16).padStart(3, '0'); };
  /* levels[0] = root ... levels[L] = leaves. ver[i] = how many writes range i+1 holds on this replica. */
  const hashes = ver => {
    const L = Math.round(Math.log2(ver.length)), lv = [];
    lv[L] = ver.map((v, i) => hx('r' + (i + 1) + ':' + v));
    for (let l = L - 1; l >= 0; l--) lv[l] = Array.from({ length: 1 << l }, (_, j) => hx(lv[l + 1][2 * j] + lv[l + 1][2 * j + 1] + l));
    return lv;
  };

  /* ---- a hash tree drawn with raw SVG: root on top, one leaf per token sub-range ---- */
  function tree(kit, o) {
    const n = o.n, L = Math.round(Math.log2(n)), pitch = o.w / n, nw = o.nw || 34, nh = o.nh || 18, lh = o.lh || 30, lw = Math.min(pitch - 4, 32);
    const cx = (l, j) => o.x + (j + .5) * (n >> l) * pitch, top = l => o.y + l * o.gap;
    const wOf = l => (l === L ? lw : nw), hOf = l => (l === L ? lh : nh);
    const g = kit.el('g', null, kit.layer), eg = kit.el('g', null, g), ng = kit.el('g', null, g);
    const edges = [], nodes = [];
    for (let l = 0; l <= L; l++) { edges[l] = []; nodes[l] = []; }
    for (let l = 1; l <= L; l++) for (let j = 0; j < (1 << l); j++) {
      const e = kit.el('line', { x1: cx(l - 1, j >> 1), y1: top(l - 1) + nh, x2: cx(l, j), y2: top(l) }, eg);
      e.style.transition = 'stroke .45s, stroke-width .3s, opacity .45s';
      edges[l][j] = e;
    }
    for (let l = 0; l <= L; l++) for (let j = 0; j < (1 << l); j++) {
      const w = wOf(l), h = hOf(l), leaf = l === L;
      const gg = kit.el('g', null, ng); gg.style.transform = `translate(${cx(l, j) - w / 2}px,${top(l)}px)`; gg.style.transition = 'opacity .45s';
      const rect = kit.el('rect', { x: 0, y: 0, width: w, height: h, rx: leaf ? 6 : 5 }, gg);
      rect.style.transition = 'fill .45s, stroke .45s, stroke-width .3s';
      const ht = kit.el('text', { class: 'kt xs b', x: w / 2, y: leaf ? h - 6 : h / 2 + 3.4, 'text-anchor': 'middle' }, gg);
      if (leaf) { const lb = kit.el('text', { class: 'kt xs mut', x: w / 2, y: 11, 'text-anchor': 'middle' }, gg); lb.textContent = 'r' + (j + 1); }
      nodes[l][j] = { g: gg, rect, ht };
    }
    return { L, n, cx, top, nh, lh, nodes, edges };
  }

  /* Colour a tree from the hashes it holds (`mine`) against its peer (`other`).
     o.lvl = how many levels are drawn (counted from the leaves), o.cmp = how many levels the descent has reached,
     o.all = colour every node by equal or not, o.done = everything agrees, o.flash = leaves to highlight,
     o.fn / o.sel = custom tone for a node, o.up = recolour bottom-up instead of top-down. */
  function paint(T, mine, other, o) {
    const L = T.L, lvl = o.lvl == null ? L + 1 : o.lvl, cmp = o.cmp || 0;
    const diff = (l, j) => mine[l][j] !== other[l][j];
    const opened = (l, j) => l === 0 || diff(l - 1, j >> 1);
    const delay = l => (o.up ? (L - l) * .28 : l * .2);
    const toneOf = (l, j) => {
      if (o.fn) return o.fn(l, j);
      if (o.done) return 'ok';
      if (o.all) return diff(l, j) ? 'bad' : 'ok';
      if (l < cmp && opened(l, j)) return diff(l, j) ? 'bad' : 'ok';
      if (l > 0 && l <= cmp && !opened(l, j)) return 'skip';
      return 'idle';
    };
    for (let l = 0; l <= L; l++) for (let j = 0; j < (1 << l); j++) {
      const nd = T.nodes[l][j], show = l >= L + 1 - lvl;
      let tone = toneOf(l, j);
      if (o.flash && l === L && o.flash.has(j)) tone = 'cur';
      const t = TONE[tone] || TONE.idle;
      const sel = o.sel ? o.sel(l, j) : (!o.all && !o.done && !o.fn && cmp > 0 && l === cmp - 1 && opened(l, j));
      nd.g.style.opacity = show ? t.o : 0;
      nd.rect.style.fill = t.f; nd.rect.style.stroke = sel ? 'var(--acc2)' : t.s; nd.rect.style.strokeWidth = sel ? 3.4 : t.w;
      nd.rect.style.strokeDasharray = t.dash || 'none';
      nd.rect.style.transitionDelay = delay(l) + 's';
      nd.ht.textContent = (l === L && o.leafText && o.leafText[j]) || mine[l][j];
      if (l > 0) {
        const e = T.edges[l][j], et = ETONE[{ bad: 'bad', ok: 'ok', skip: 'skip' }[tone] || 'idle'];
        e.style.stroke = et[0]; e.style.strokeWidth = et[1]; e.style.strokeDasharray = et[3];
        e.style.opacity = l - 1 >= L + 1 - lvl ? et[2] : 0; e.style.transitionDelay = delay(l) + 's';
      }
    }
  }
  /* how many opened nodes differ at level l (compare mode) */
  const countDiff = (mine, other, l) => {
    let d = 0;
    for (let j = 0; j < (1 << l); j++) { const open = l === 0 || mine[l - 1][j >> 1] !== other[l - 1][j >> 1]; if (open && mine[l][j] !== other[l][j]) d++; }
    return d;
  };

  /* ---- a stream: a dashed lane under the leaves and dots that travel along it ---- */
  const polyAt = (pts, t) => {
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); tot += d; }
    let k = Math.max(0, Math.min(1, t)) * tot;
    for (let i = 0; i < segs.length; i++) {
      if (k <= segs[i] || i === segs.length - 1) { const f = segs[i] ? Math.min(1, k / segs[i]) : 1; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
      k -= segs[i];
    }
    return pts[pts.length - 1];
  };
  function stream(kit, pts, nDots) {
    const path = kit.el('path', { d: 'M' + pts.map(p => p.join(' ')).join(' L'), fill: 'none' }, kit.layer);
    const e = pts[pts.length - 1], head = kit.el('path', { d: `M${e[0] - 4.5} ${e[1] + 6} L${e[0]} ${e[1] + 1} L${e[0] + 4.5} ${e[1] + 6}`, fill: 'none' }, kit.layer);
    [path, head].forEach(p => { p.style.stroke = 'var(--acc2)'; p.style.strokeWidth = 2; p.style.opacity = 0; p.style.transition = 'opacity .4s'; });
    path.style.strokeDasharray = '5 4';
    const dots = Array.from({ length: nDots }, () => { const c = kit.el('circle', { class: 'kdot', r: 4.5, cx: pts[0][0], cy: pts[0][1] }, kit.layer); c.style.opacity = 0; return c; });
    const put = (c, v) => { const p = polyAt(pts, v); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.style.opacity = v > 0 ? 1 : 0; };
    return {
      lane(on) { path.style.opacity = on ? 1 : 0; head.style.opacity = on ? 1 : 0; },
      run(ms) { dots.forEach((c, k) => Kit.tween(c, 'p', -k * .22, 1, ms, v => put(c, v))); },
      stop() { dots.forEach(c => { Kit.tween(c, 'p', 0, 0, 0, () => {}); c.style.opacity = 0; }); },
    };
  }
  const bandRect = (kit, x, y, w, h, fill, stroke, dash) => {
    const r = kit.el('rect', { x, y, width: w, height: h, rx: 5 }, kit.layer);
    r.style.fill = fill; r.style.stroke = stroke; r.style.strokeWidth = 1.4; if (dash) r.style.strokeDasharray = dash;
    r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'left center'; r.style.transition = 'transform .8s cubic-bezier(.3,.7,.2,1), opacity .4s, fill .4s';
    return r;
  };
  const scaleX = (el, f) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`; };

  /* ================= 1. Compare two hash trees top-down ================= */
  const TA = { x: 16, y: 74, w: 264, n: 8, gap: 34, nw: 34, nh: 18, lh: 30 };
  const TB = { ...TA, x: 360 };
  const verA0 = [0, 1, 0, 0, 0, 0, 0, 0], verB0 = [0, 0, 0, 0, 0, 0, 1, 0], verN = [0, 1, 0, 0, 0, 0, 1, 0];
  const hA0 = hashes(verA0), hB0 = hashes(verB0), hN = hashes(verN);
  const showHash = (h0, h1, fix) => h0.map((row, l) => row.map((v, j) => (fix >= 3 || (fix >= 2 && l === 3) ? h1[l][j] : v)));
  const LANE1 = [[TA.x + 1.5 * 33, 206], [TA.x + 1.5 * 33, 220], [TB.x + 1.5 * 33, 220], [TB.x + 1.5 * 33, 206]];
  const LANE2 = [[TB.x + 6.5 * 33, 206], [TB.x + 6.5 * 33, 232], [TA.x + 6.5 * 33, 232], [TA.x + 6.5 * 33, 206]];
  const CHECKS = [0, 1, 3, 7, 11];
  const NAMES = ['root', 'level 1', 'level 2', 'ranges'];

  const compare = {
    id: 'tree-compare', label: 'Compare trees', desc: 'Two replicas hash their token range into a tree, compare the roots first, and open only the branches that differ.',
    codeLabel: 'nodetool',
    code: { bug: ['nodetool repair ks_orders', '# 1. each replica hashes its token range into a tree (illustrative model)', '# 2. compare the roots; open only the branches that differ', '# 3. stream only the ranges that still differ, then the hashes match'] },
    stage: {
      w: W, h: H, footer: 'Simplified: 8 ranges per tree; real ones have many more. Hashes are illustrative.',
      header: s => ({ left: 'hash checks ' + CHECKS[Math.min(s.cmp || 0, 4)], right: s.r || '' }),
      setup(kit) {
        const a = tree(kit, TA), b = tree(kit, TB);
        kit.text(null, { x: 16, y: 86, t: 'Replica A', cls: 'b sm' }); kit.text(null, { x: 360, y: 86, t: 'Replica B', cls: 'b sm' });
        const gl = NAMES.map((nm, l) => ({
          a: kit.text(null, { x: 320, y: a.top(l) + (l === 3 ? 11 : 9), t: nm, cls: 'mut xs', anchor: 'middle' }),
          b: kit.text(null, { x: 320, y: a.top(l) + (l === 3 ? 22 : 20), t: '', cls: 'xs b', anchor: 'middle' }),
        }));
        const s1 = stream(kit, LANE1, 3), s2 = stream(kit, LANE2, 3);
        const bars = kit.bars(null, { x: 16, y: 262, w: 296, labelW: 64, items: [{ id: 'o', label: 'opened' }, { id: 'k', label: 'skipped' }, { id: 's', label: 'streamed' }], max: 8, title: 'Ranges (of 8)' });
        const led = kit.ledger(null, { x: 330, y: 244, w: 294, title: 'Repair plan', cols: [{ label: 'range', w: 44 }, { label: 'direction', w: 66 }, { label: 'reason', w: 98 }, { label: 'state', w: 62 }], rows: 2, rowH: 16 });
        return { a, b, gl, s1, s2, bars, led, prev: {} };
      },
      frame(s, kit, R) {
        const fix = s.fix || 0, cmp = s.cmp || 0, lvl = s.lvl || 4;
        const mineA = showHash(hA0, hN, fix), mineB = showHash(hB0, hN, fix);
        const o = { lvl, cmp, done: fix >= 3, up: fix >= 2, flash: fix === 2 ? new Set([1, 6]) : null };
        paint(R.a, mineA, mineB, o); paint(R.b, mineB, mineA, o);
        for (let l = 0; l < 4; l++) {
          const shown = l >= 4 - lvl, g = R.gl[l], d = countDiff(mineA, mineB, l), on = shown && (fix >= 3 || l < cmp);
          g.a.show(shown); g.a.set(NAMES[l]); g.b.show(on);
          g.b.set(d > 0 ? d + ' differ' : 'match'); g.b.el.setAttribute('class', 'kt xs b ' + (d > 0 ? 'tone-bad' : 'tone-ok'));
        }
        R.s1.lane(fix === 1 || fix === 2); R.s2.lane(fix === 1 || fix === 2);
        if (fix === 1) { if (R.prev.fix !== 1) { R.s1.run(1700); R.s2.run(1700); } } else { R.s1.stop(); R.s2.stop(); }
        R.prev.fix = fix;
        R.bars.set('o', cmp >= 4 ? 4 : 0, 'info', (cmp >= 4 ? 4 : 0) + ' of 8');
        R.bars.set('k', cmp >= 3 ? 4 : 0, 'ok', (cmp >= 3 ? 4 : 0) + ' of 8');
        R.bars.set('s', fix >= 1 ? 2 : 0, fix >= 2 ? 'ok' : 'warn', (fix >= 1 ? 2 : 0) + ' of 8');
        R.led.clear(); R.led.badge(cmp >= 4 ? '' : 'not found yet');
        if (cmp >= 4) {
          const st = fix >= 2 ? 'done' : fix === 1 ? 'sending' : 'found';
          R.led.setRow(0, ['r2', 'A → B', 'B is behind', st], { hl: fix >= 1, tone: fix >= 2 ? 'ok' : undefined, tones: [null, null, null, fix >= 2 ? 'ok' : 'warn'] });
          R.led.setRow(1, ['r7', 'B → A', 'A is behind', st], { hl: fix >= 1, tone: fix >= 2 ? 'ok' : undefined, tones: [null, null, null, fix >= 2 ? 'ok' : 'warn'] });
        }
      }
    },
    bug: [
      { log: 'nodetool repair starts. Replica A and replica B each cut the same token range into 8 sub-ranges, r1 to r8, and hash the rows of each one (hashes illustrative).', callout: 'Each replica hashes its 8 sub-ranges', code: 0,
        state: { lvl: 1, r: 'leaf hashes' }, stats: [{ l: 'sub-ranges per replica', v: '8' }, { l: 'leaf hashes', v: '8' }] },
      { log: 'Each parent hashes its two children, up to one root. Building the hashes reads the local data once. After that, a change in any row changes the root.', callout: 'Parents hash their children, up to one root', code: 1,
        state: { lvl: 4, r: 'tree built' }, stats: [{ l: 'hashes per tree', v: '15' }, { l: 'roots', v: '1' }] },
      { log: `Repair compares the two roots first. They differ (${hA0[0][0]} and ${hB0[0][0]}), so the replicas disagree somewhere. Equal roots would end the repair right here.`, callout: 'Roots differ: the replicas disagree somewhere', code: 2,
        state: { cmp: 1, r: 'compare roots' }, stats: [{ l: 'hash checks', v: '1' }, { l: 'roots equal', v: 'no', cls: 'bad' }] },
      { log: 'Next level: both halves differ, so both stay open. Repair has made 3 hash checks so far.', callout: 'Both halves differ, so both stay open', code: 2,
        state: { cmp: 2, r: 'open level 1' }, stats: [{ l: 'hash checks', v: '3' }, { l: 'open branches', v: '2', cls: 'warn' }] },
      { log: 'Level 2: the two middle nodes match. Everything under them, r3 to r6, is skipped, and nothing there is compared again.', callout: 'Matching branches are skipped: r3 to r6 are never opened', moment: true, code: 2,
        state: { cmp: 3, r: 'skip matches' }, stats: [{ l: 'hash checks', v: '7' }, { l: 'ranges skipped', v: '4 of 8', cls: 'ok' }] },
      { log: 'Only the open branches go down to the leaves. r2 and r7 differ, while r1 and r8 match. These two ranges are all that repair has to fix.', callout: 'Leaves r2 and r7 differ: the only ranges to fix', code: 2,
        state: { cmp: 4, r: 'leaves found' }, stats: [{ l: 'hash checks', v: '11' }, { l: 'ranges to fix', v: '2 of 8', cls: 'warn' }] },
      { log: 'Repair streams just those two ranges. A holds newer rows in r2, so it sends them to B. B holds newer rows in r7, so it sends them to A.', callout: 'Stream r2 (A to B) and r7 (B to A), nothing else', code: 3,
        state: { cmp: 4, fix: 1, r: 'streaming' }, stats: [{ l: 'streaming', v: '2 of 8', cls: 'warn' }, { l: 'skipped', v: '4 of 8', cls: 'ok' }] },
      { log: 'Each side applies the rows and hashes r2 and r7 again. The leaves now match, but the parents above them still hold their old hashes.', callout: 'Leaves match; the parents are not re-hashed yet', code: 3,
        state: { cmp: 4, fix: 2, r: 'leaves re-hashed' }, stats: [{ l: 'leaves matching', v: '8 of 8', cls: 'ok' }, { l: 'roots equal', v: 'not yet', cls: 'warn' }] },
      { log: 'The hashes are recomputed up the tree and the roots match. A and B hold the same data, and 6 of 8 ranges were never streamed.', callout: 'Roots match: A and B agree', code: 3,
        state: { cmp: 4, fix: 3, r: 'in sync' }, stats: [{ l: 'roots equal', v: 'yes', cls: 'ok' }, { l: 'ranges streamed', v: '2 of 8', cls: 'ok' }],
        takeaway: 'Repair compares hashes top-down and streams only the ranges that differ. Streaming follows the drift, not the table size.' },
    ],
  };

  /* ================= 2. Hint buffer fills, the window closes, repair closes the gap ================= */
  const X0 = 48, PXH = 110, XT = t => X0 + PXH * t, WIN = 3, TOUT = 5;
  const WR = [[.5, 1], [1.17, 5], [1.83, 2], [2.33, 8], [2.75, 1], [3.33, 3], [3.75, 6], [4.17, 3], [4.5, 6], [4.83, 3]];
  const verPeer = t => { const v = Array(8).fill(0); WR.forEach(([wt, r]) => { if (wt <= t + 1e-9) v[r - 1]++; }); return v; };
  const verHinted = () => { const v = Array(8).fill(0); WR.forEach(([wt, r]) => { if (wt <= WIN) v[r - 1]++; }); return v; };
  const ZERO = Array(8).fill(0);
  const TC = { x: 16, y: 204, w: 264, n: 8, gap: 26, nw: 34, nh: 16, lh: 28 };
  const TP = { ...TC, x: 360 };
  const LANE3 = [[TP.x + 2.5 * 33, 310], [TP.x + 2.5 * 33, 322], [TC.x + 2.5 * 33, 322], [TC.x + 2.5 * 33, 310]];
  const LANE6 = [[TP.x + 5.5 * 33, 310], [TP.x + 5.5 * 33, 332], [TC.x + 5.5 * 33, 332], [TC.x + 5.5 * 33, 310]];
  const clock = t => { const m = Math.round(t * 60); return pad(5 + Math.floor(m / 60)) + ':' + pad(m % 60); };
  const behind = (hC, hP) => hC[3].filter((v, j) => v !== hP[3][j]).length;

  const hintWindow = {
    id: 'hint-window', label: 'Hints, then repair', desc: 'Replica C is down for 5 hours. Hints cover only the first 3 (times illustrative); the later writes reach C only through repair.',
    codeLabel: 'Config',
    code: { bug: ['node C: down 05:00 .. 10:00 (5 h)', 'max_hint_window_in_ms = 10800000   # 3 h', 'hints stored for C: 05:00 .. 08:00; writes 08:00 .. 10:00: no hint', '$ nodetool repair ks_orders   # after C rejoins at 10:00'] },
    stage: {
      w: W, h: H, footer: 'Simplified: one table, 8 ranges, replica C against one peer. Times illustrative.',
      header: s => ({ left: 'clock ' + clock(s.t || 0), right: s.r || '' }),
      setup(kit) {
        const L = kit.layer;
        const out = bandRect(kit, X0, 72, PXH * TOUT, 14, mix('bad', 22), 'var(--bad)');
        const outT = kit.text(null, { x: X0 + 8, y: 82.5, t: 'replica C is down', cls: 'xs b' });
        const winBox = bandRect(kit, X0, 96, PXH * WIN, 14, 'none', 'var(--mut)', '4 3');
        const hint = bandRect(kit, X0, 96, PXH * WIN, 14, mix('ok', 45), 'var(--ok)');
        const hintT = kit.text(null, { x: X0 + 8, y: 106.5, t: 'hints stored', cls: 'xs b' });
        const none = bandRect(kit, XT(WIN), 96, PXH * (TOUT - WIN), 14, mix('bad', 12), 'var(--bad)', '4 3');
        const noneT = kit.text(null, { x: XT(WIN) + 8, y: 106.5, t: 'no hints stored', cls: 'xs b' });
        const axis = kit.el('line', { x1: X0, y1: 152, x2: XT(TOUT), y2: 152 }, L); axis.style.stroke = 'var(--mut)'; axis.style.strokeWidth = 1.4;
        for (let h = 0; h <= TOUT; h++) {
          const tk = kit.el('line', { x1: XT(h), y1: 148, x2: XT(h), y2: 156 }, L); tk.style.stroke = 'var(--mut)'; tk.style.strokeWidth = 1.4;
          kit.text(null, { x: XT(h), y: 168, t: pad(5 + h) + ':00', cls: 'mut xs', anchor: 'middle' });
        }
        const wmark = kit.el('line', { x1: XT(WIN), y1: 92, x2: XT(WIN), y2: 156 }, L); wmark.style.stroke = 'var(--warn)'; wmark.style.strokeWidth = 2; wmark.style.strokeDasharray = '4 3'; wmark.style.transition = 'opacity .4s';
        const wText = kit.text(null, { x: XT(WIN), y: 180, t: 'hint window closes', cls: 'xs b tone-warn', anchor: 'middle' });
        const bText = kit.text(null, { x: XT(TOUT), y: 180, t: 'C rejoins', cls: 'xs b', anchor: 'end' });
        const chips = WR.map(([wt, r]) => {
          const g = kit.el('g', null, L), rc = kit.el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 5 }, g), tx = kit.el('text', { class: 'kt xs b', x: 13, y: 12.5, 'text-anchor': 'middle' }, g);
          tx.textContent = 'r' + r; g.style.transform = `translate(${XT(wt) - 13}px,120px)`; g.style.transition = 'opacity .4s';
          rc.style.transition = 'fill .4s, stroke .4s'; rc.style.strokeWidth = 1.6;
          return { g, rc, wt };
        });
        const cur = kit.el('line', { x1: 0, y1: 68, x2: 0, y2: 154 }, L); cur.style.stroke = 'var(--acc2)'; cur.style.strokeWidth = 2.4; cur.style.transition = 'transform .8s cubic-bezier(.3,.7,.2,1), opacity .4s';
        const c = tree(kit, TC), p = tree(kit, TP);
        kit.text(null, { x: 16, y: 214, t: 'Replica C', cls: 'b sm' }); kit.text(null, { x: 360, y: 214, t: 'Peer replica', cls: 'b sm' });
        const gl = [0, 1, 2, 3].map(l => kit.text(null, { x: 320, y: c.top(l) + (l === 3 ? 17 : 11.5), t: '', cls: 'xs b', anchor: 'middle' }));
        const s3 = stream(kit, LANE3, 3), s6 = stream(kit, LANE6, 3);
        return { out, outT, winBox, hint, hintT, none, noneT, wmark, wText, bText, chips, cur, c, p, gl, s3, s6, prev: {} };
      },
      frame(s, kit, R) {
        const t = s.t || 0, replay = !!s.replay, cmp = s.cmp || 0, fix = s.fix || 0;
        scaleX(R.out, t / TOUT); R.outT.show(t >= 1);
        scaleX(R.hint, Math.min(t, WIN) / WIN); R.hintT.show(t >= 1); R.hintT.set(replay ? 'hints replayed to C' : 'hints stored');
        scaleX(R.none, (t - WIN) / (TOUT - WIN)); R.noneT.show(t >= 3.9);
        R.winBox.style.opacity = t > 0 ? 1 : 0;
        R.wmark.style.opacity = t >= WIN ? 1 : 0; R.wText.show(t >= WIN); R.bText.show(!!s.back);
        R.cur.style.transform = `translate(${XT(t)}px,0)`; R.cur.style.opacity = t > 0 ? 1 : 0;
        R.chips.forEach(ch => {
          const hinted = ch.wt <= WIN;
          ch.g.style.opacity = t >= ch.wt ? 1 : 0;
          ch.rc.style.fill = hinted ? mix('ok', 45) : mix('bad', 24); ch.rc.style.stroke = hinted ? 'var(--ok)' : 'var(--bad)';
        });
        const vp = verPeer(t), vc = fix >= 3 ? verPeer(TOUT) : (replay ? verHinted() : ZERO);
        const hP = hashes(vp), hC = hashes(vc);
        const o = { cmp, all: !cmp && !fix, done: fix >= 3, up: fix >= 3 };
        paint(R.c, hC, hP, o); paint(R.p, hP, hC, o);
        const GN = ['root', 'L1', 'L2', 'ranges'];
        for (let l = 0; l < 4; l++) {
          const g = R.gl[l], d = countDiff(hC, hP, l), on = fix >= 3 || (cmp > 0 && l < cmp);
          g.show(on); g.set(GN[l] + ' ' + (d > 0 ? d + ' differ' : 'match')); g.el.setAttribute('class', 'kt xs b ' + (d > 0 ? 'tone-bad' : 'tone-ok'));
        }
        const dots = fix === 1;
        R.s3.lane(fix >= 1 && fix < 3); R.s6.lane(fix >= 1 && fix < 3);
        if (dots) { if (R.prev.fix !== 1) { R.s3.run(1700); R.s6.run(1700); } } else { R.s3.stop(); R.s6.stop(); }
        R.prev.fix = fix;
      }
    },
    bug: [
      { log: 'Replica C goes down at 05:00 (times illustrative). The coordinator will keep a hint for each write C misses, but only while the hint window is open: 3 hours by default.', callout: 'C is down; the hint window is open for 3 h', code: 0,
        state: { t: .2, r: '05:00 C goes down' }, stats: [{ l: 'outage', v: '5 h', cls: 'bad' }, { l: 'hint window', v: '3 h', cls: 'warn' }] },
      { log: 'Writes to r1, r5 and r2 arrive. They reach the peers but not C, so the coordinator keeps a hint for each, and the hint buffer grows. C drifts away from its peers.', callout: 'Each write C misses is stored as a hint', code: 1,
        state: { t: 2, r: 'hints fill the buffer' }, stats: [{ l: 'hints stored', v: '3', cls: 'ok' }, { l: 'ranges behind on C', v: '3', cls: 'warn' }] },
      { log: 'At 08:00 the hint window closes. Five hints are stored, and the coordinator stops storing hints for C. The buffer cannot grow any more.', callout: 'Window closed: no more hints for C', code: 2,
        state: { t: 3, r: '08:00 window closes' }, stats: [{ l: 'hints stored', v: '5', cls: 'ok' }, { l: 'ranges behind on C', v: '4', cls: 'warn' }] },
      { log: 'C is still down. Writes after 08:00, to r3 and r6, find no open window. They reach the peers, but nothing is stored for C, so nothing will ever replay them.', callout: 'Writes after 08:00 are never stored for C', moment: true, code: 2,
        state: { t: 4.9, r: 'no hints any more' }, stats: [{ l: 'writes with no hint', v: '5', cls: 'bad' }, { l: 'ranges behind on C', v: '6', cls: 'bad' }] },
      { log: 'At 10:00 C rejoins, behind in six ranges: r1, r2, r3, r5, r6 and r8. A read at ONE that lands on C returns old data, and the coordinator cannot tell.', callout: 'C rejoins behind in six ranges', code: 3,
        state: { t: 5, back: true, r: '10:00 C rejoins' }, stats: [{ l: 'ranges behind on C', v: '6', cls: 'bad' }, { l: 'read at ONE on C', v: 'stale', cls: 'bad' }] },
      { log: 'C replays the five stored hints. Ranges r1, r2, r5 and r8 turn green. r3 and r6 stay red, because their writes came after the window closed.', callout: 'Hints replay: 4 of 6 ranges are fixed', code: 3,
        state: { t: 5, back: true, replay: true, r: 'hints replayed' }, stats: [{ l: 'hints replayed', v: '5', cls: 'ok' }, { l: 'ranges behind on C', v: '2', cls: 'warn' }] },
      { log: 'Repair compares the trees top-down. The branches over r1, r2, r7 and r8 match and are skipped. Only r3 and r6 differ, so only they need to move.', callout: 'Repair opens only the branches over r3 and r6', code: 3,
        state: { t: 5, back: true, replay: true, cmp: 4, r: 'repair compares' }, stats: [{ l: 'ranges skipped', v: '4 of 8', cls: 'ok' }, { l: 'ranges to stream', v: '2 of 8', cls: 'warn' }] },
      { log: 'Repair streams r3 and r6 from the peers to C. It is the only path that delivers writes older than the hint window.', callout: 'Repair streams r3 and r6 to C', code: 3,
        state: { t: 5, back: true, replay: true, cmp: 4, fix: 1, r: 'streaming r3, r6' }, stats: [{ l: 'streaming', v: '2 of 8', cls: 'warn' }, { l: 'ranges behind on C', v: '2', cls: 'warn' }] },
      { log: 'C now matches its peers and the roots are equal. Hints covered the first 3 hours and repair covered the rest. QUORUM reads avoid a stale replica until repair finishes.', callout: 'Roots match: repair closed the gap', code: 3,
        state: { t: 5, back: true, replay: true, cmp: 4, fix: 3, r: 'in sync' }, stats: [{ l: 'ranges behind on C', v: '0', cls: 'ok' }, { l: 'roots equal', v: 'yes', cls: 'ok' }],
        takeaway: 'Hints cover only the hint window. Writes after it reach C only through repair, so read at QUORUM until it completes.' },
    ],
  };

  /* ================= 3. tombstone_gc: repair. The purge gate opens only after a completed repair ================= */
  const XD = d => 40 + 40 * d;
  const T3 = [16, 224, 432].map(x => ({ x, y: 196, w: 188, n: 4, gap: 26, nw: 34, nh: 16, lh: 28 }));
  const verT = [0, 0, 7, 0], verP = [0, 0, 0, 0];
  const hT = hashes(verT), hPg = hashes(verP);
  const statusOf = s => (s.purged ? 'purged, space freed' : (s.rep || 0) >= 2 ? 'repaired: safe to purge' : s.rep === 1 ? 'comparing the trees' : (s.day || 0) >= 10 ? 'grace over, tombstone kept' : 'tombstone on disk');

  const repairGc = {
    id: 'repair-gc', label: 'tombstone_gc: repair', desc: 'In repair mode a tombstone is purged only after a completed repair, so elapsed gc_grace_seconds alone frees nothing (days illustrative).',
    codeLabel: 'CQL',
    code: { bug: [
      "ALTER TABLE ks_orders.orders WITH tombstone_gc = {'mode': 'repair'};",
      "DELETE FROM orders WHERE customer = 'ana' AND order_id = 981;",
      'ALTER TABLE ks_orders.orders WITH gc_grace_seconds = 864000;   -- 10 days',
      '-- day 10: grace has passed, but no repair has run since the delete',
      '-- nodetool repair ks_orders, started on day 12, completes after the delete',
      '-- compaction purges the tombstones only once the replicas agree',
    ] },
    stage: {
      w: W, h: H, footer: 'Simplified: one tombstone, three replicas. Days illustrative; gc_grace is 10 days.',
      header: s => ({ left: 'day ' + (s.day || 0), right: s.r || '' }),
      setup(kit) {
        const L = kit.layer;
        const gbox = bandRect(kit, XD(0), 72, 400, 16, 'none', 'var(--mut)', '4 3');
        const grace = bandRect(kit, XD(0), 72, 400, 16, mix('warn', 34), 'var(--warn)');
        const gT = kit.text(null, { x: XD(0) + 8, y: 83.5, t: 'gc_grace_seconds = 10 days', cls: 'xs b' });
        const gOver = kit.text(null, { x: XD(10) + 8, y: 83.5, t: 'grace passed', cls: 'xs b tone-warn' });
        const axis = kit.el('line', { x1: XD(0), y1: 150, x2: XD(14), y2: 150 }, L); axis.style.stroke = 'var(--mut)'; axis.style.strokeWidth = 1.4;
        for (let d = 0; d <= 14; d += 2) {
          const tk = kit.el('line', { x1: XD(d), y1: 146, x2: XD(d), y2: 154 }, L); tk.style.stroke = 'var(--mut)'; tk.style.strokeWidth = 1.4;
          kit.text(null, { x: XD(d), y: 166, t: 'd' + d, cls: 'mut xs', anchor: 'middle' });
        }
        const cur = kit.el('line', { x1: 0, y1: 92, x2: 0, y2: 152 }, L); cur.style.stroke = 'var(--acc2)'; cur.style.strokeWidth = 2.4; cur.style.transition = 'transform .8s cubic-bezier(.3,.7,.2,1)';
        const ev = {
          del: kit.chip(null, { x: 16, y: 96, w: 58, h: 22, label: 'DELETE', tone: 'delete', small: true }),
          grace: kit.chip(null, { x: XD(10) - 36, y: 96, w: 72, h: 22, label: 'd10 grace', tone: 'warn', small: true, show: false }),
          rep: kit.chip(null, { x: XD(12) - 28, y: 96, w: 56, h: 22, label: 'repair', tone: 'cursor', small: true, show: false }),
          purge: kit.chip(null, { x: XD(12) - 30, y: 122, w: 60, h: 22, label: 'purged', tone: 'ok', small: true, show: false }),
        };
        const trees = T3.map(o => tree(kit, o));
        const names = ['Replica A', 'Replica B', 'Replica C'];
        names.forEach((n, i) => kit.text(null, { x: T3[i].x, y: 208, t: n, cls: 'b sm' }));
        const sts = T3.map(o => kit.text(null, { x: o.x + o.w / 2, y: 290, t: '', cls: 'xs', anchor: 'middle' }));
        const same = kit.text(null, { x: 320, y: 190, t: 'roots equal', cls: 'xs b tone-ok', anchor: 'middle' });
        const gate = kit.chip(null, { x: 16, y: 300, w: 150, h: 38, label: 'purge gate', sub: 'locked: no repair', tone: 'warn' });
        const bars = kit.bars(null, { x: 190, y: 318, w: 434, labelW: 80, items: [{ id: 't', label: 'tombstones' }], max: 3, title: 'Tombstones on disk' });
        return { gbox, grace, gT, gOver, cur, ev, trees, sts, same, gate, bars };
      },
      frame(s, kit, R) {
        const day = s.day || 0, rep = s.rep || 0, purged = !!s.purged;
        scaleX(R.grace, Math.min(day, 10) / 10); R.grace.style.fill = day >= 10 ? mix('ok', 38) : mix('warn', 34); R.grace.style.stroke = day >= 10 ? 'var(--ok)' : 'var(--warn)';
        R.gT.show(day > 0); R.gOver.show(day >= 10); R.gOver.el.setAttribute('class', 'kt xs b ' + (rep >= 2 ? 'tone-mut' : 'tone-warn')); R.gOver.set(rep >= 2 ? 'grace passed' : 'grace passed: no purge');
        R.cur.style.transform = `translate(${XD(day)}px,0)`;
        R.ev.grace.set({ show: day >= 10 }); R.ev.rep.set({ show: rep >= 1, tone: rep >= 2 ? 'ok' : 'cursor' }); R.ev.purge.set({ show: purged });
        const h = purged ? hPg : hT;
        R.trees.forEach((T, i) => {
          paint(T, h, h, {
            lvl: 3, up: false, leafText: purged ? null : { 2: 'tomb' },
            fn: (l, j) => {
              if (l === 2 && j === 2 && !purged) return rep >= 2 ? 'ok' : (day >= 10 ? 'warn' : 'del');
              if (rep === 1) return 'cur';
              return rep >= 2 && !purged ? 'ok' : 'idle';
            },
            sel: () => false,
          });
          R.sts[i].set(statusOf(s));
        });
        R.same.show(rep >= 1 && !purged);
        R.same.set(rep === 1 ? 'comparing: roots match' : 'roots equal on all three');
        const open = rep >= 2;
        R.gate.set({ sub: purged ? 'open: purged' : open ? 'open: repaired' : rep === 1 ? 'checking replicas' : (day >= 10 ? 'locked: no repair' : 'locked: no repair'), tone: open ? 'ok' : rep === 1 ? 'cursor' : 'warn' });
        const n = purged ? 0 : 3;
        R.bars.set('t', n, n ? (day >= 10 ? 'warn' : 'info') : 'ok', n + ' of 3 replicas');
      }
    },
    bug: [
      { log: 'Day 0: a DELETE writes a tombstone on each of the three replicas. The table uses tombstone_gc mode repair. Each replica holds the tombstone in range r3.', callout: 'Three tombstones, one per replica', code: 1,
        state: { day: 0, r: 'DELETE on day 0' }, stats: [{ l: 'day', v: '0' }, { l: 'tombstones on disk', v: '3', cls: 'warn' }] },
      { log: 'Days pass and no repair has run since the delete. In repair mode, that keeps the purge gate shut.', callout: 'No repair since the delete: the gate stays shut', code: 0,
        state: { day: 5, r: 'no repair yet' }, stats: [{ l: 'repairs since delete', v: '0', cls: 'warn' }, { l: 'tombstones on disk', v: '3', cls: 'warn' }] },
      { log: 'Day 10: gc_grace_seconds has passed. In timeout mode the tombstones could be purged now, even with no repair.', callout: 'Day 10: the grace period is over', code: 2,
        state: { day: 10, r: 'grace over' }, stats: [{ l: 'day', v: '10' }, { l: 'tombstones purged', v: '0', cls: 'ok' }] },
      { log: 'In repair mode the elapsed grace period does not open the gate. The three tombstones stay on disk well past gc_grace_seconds.', callout: 'The timer alone frees nothing', moment: true, code: 3,
        state: { day: 11, r: 'gate still shut' }, stats: [{ l: 'day', v: '11' }, { l: 'tombstones on disk', v: '3', cls: 'bad' }] },
      { log: 'Day 12: a repair starts. It compares the hash trees of the three replicas.', callout: 'Day 12: repair compares the replicas', code: 4,
        state: { day: 12, rep: 1, r: 'repair running' }, stats: [{ l: 'day', v: '12' }, { l: 'repairs since delete', v: '1', cls: 'ok' }] },
      { log: 'The roots match, so all three replicas hold the same tombstone. The repair completes and marks the tombstones as repaired. Only now is a purge safe.', callout: 'Repaired: the purge gate is open', code: 4,
        state: { day: 12, rep: 2, r: 'repair complete' }, stats: [{ l: 'replicas agree', v: '3 of 3', cls: 'ok' }, { l: 'purge gate', v: 'open', cls: 'ok' }] },
      { log: 'Compaction now purges the tombstones. The space comes back, and the purge followed the repair, not the timer alone.', callout: 'Compaction purges; space comes back', code: 5,
        state: { day: 12, rep: 2, purged: true, r: 'purged' }, stats: [{ l: 'tombstones on disk', v: '0', cls: 'ok' }, { l: 'repairs since delete', v: '1', cls: 'ok' }] },
      { log: 'The grace period had already passed on day 10. Shortening it would not have freed these tombstones any sooner.', callout: 'Lowering gc_grace_seconds would not have helped', code: 5,
        state: { day: 12, rep: 2, purged: true, r: 'purged' }, stats: [{ l: 'tombstones on disk', v: '0', cls: 'ok' }],
        takeaway: 'In repair mode the purge waits for a completed repair. Lowering gc_grace_seconds alone does not make tombstones vanish sooner.' },
    ],
  };

  const EXPLAIN = `
<h3>1. A tombstone must reach every replica</h3>
<p>A tombstone is the only record that a row was deleted. A replica that was down during the delete still holds the old value, and it learns of the delete only when the tombstone reaches it. Two mechanisms carry missed writes and deletes: hinted handoff covers short outages, and row-level repair covers everything else. The grace period decides how long a tombstone is kept. The case where a purge before repair brings a deleted row back is in the previous chapter, Deletes, TTL and Tombstones. This chapter covers why an outage longer than the hint window needs repair, and how the purge rule decides when that repair must have happened.</p>

<h3>2. Hints cover only the hint window</h3>
<p>When a replica is down, the coordinator stores a hint for each write it could not deliver. Hints are kept only for the <code>max_hint_window_in_ms</code> window, which is 3 hours by default. After that the coordinator stops storing hints for the replica. A write made after the window is never recorded for that replica, so nothing will replay it. The sequence below follows a five-hour outage: the first 3 hours are covered by hints, and the last 2 hours are not.</p>
<figure class="mm" aria-label="Sequence diagram: hints cover the first three hours of an outage, writes after that are missing, and repair streams them" style="--diagram-width:620.00px">
  <img src="diagrams/ch07-hint-repair.svg" alt="Sequence diagram: replica C is down from 05:00 to 10:00. The coordinator stores hints from 05:00 to 08:00, the three hour window. Writes from 08:00 to 10:00 are never stored. At 10:00 the stored hints are replayed to C, but the two hours of writes are still missing until a repair streams them from the other replicas.">
  <figcaption>Sequence (Mermaid source: diagrams/ch07-hint-repair.mmd). The five-hour outage is illustrative.</figcaption>
</figure>

<h3>3. Repair closes the gap</h3>
<p><code>nodetool repair</code> compares the replicas of a keyspace and streams the differences, tombstones included. It is the only path that delivers writes older than the hint window. Until it completes, a read at ONE that lands on the stale replica can return the old value. Reads at QUORUM or LOCAL_QUORUM overlap the replicas that accepted the writes, so they are the safer choice until repair finishes. Repair also has to run within the grace period. A tombstone that a stale replica has not seen must survive until repair delivers it to that replica.</p>

<h3>4. Two rules decide when a tombstone is purged</h3>
<p>The table option <code>tombstone_gc</code> sets the rule. In <b>timeout</b> mode, a tombstone may be purged once <code>gc_grace_seconds</code> has passed, whether or not a repair ran. The default is 864000 seconds, ten days. In <b>repair</b> mode, a tombstone is purged only after a repair has made the replicas agree, and elapsed time alone does not release it. Check the option on the table, because defaults can vary by version and table type. The rule, as a flowchart:</p>
<figure class="mm" aria-label="Flowchart: timeout mode purges after the grace period, repair mode purges only after a completed repair" style="--diagram-width:620.00px">
  <img src="diagrams/ch07-gc-modes.svg" alt="Flowchart: timeout mode purges after the grace period, repair mode purges only after a completed repair">
  <figcaption>Flowchart: the same rule for each tombstone. Timeout mode skips the repair check, which is why it needs repair within the grace period.</figcaption>
</figure>

<h3>5. The trade-off</h3>
<p>A longer <code>gc_grace_seconds</code> keeps tombstones longer, which costs disk and read time, because every read has to skip them. Repair-based GC is safer, but it keeps dead data longer when repair is delayed. Hints cover only short outages and never replace repair. For a replica absent longer than the hint window, repair, or the documented replacement path, is the way to catch it up. Shortening the grace period is the wrong lever when the real delay is a repair that has not run.</p>

<h3>6. The syntax, in one place</h3>
<pre>-- the gc grace period for the table (864000 seconds, ten days)
ALTER TABLE ks_orders.orders WITH gc_grace_seconds = 864000;

-- purge a tombstone only after a completed repair
ALTER TABLE ks_orders.orders WITH tombstone_gc = {'mode': 'repair'};

-- check the table options, including tombstone_gc
DESCRIBE TABLE ks_orders.orders;

-- row-level repair of one keyspace, after a node rejoins
nodetool repair ks_orders

-- node option, not CQL: max_hint_window_in_ms (default 10800000 ms, 3 h), set in the node config

-- read at a level that overlaps the replicas that took the writes
CONSISTENCY QUORUM;</pre>
<p>Repair before you rely on ONE reads after an outage. A repair that has not run is the usual reason a deleted row or an old value lingers.</p>`;

  window.CHAPTER_OVERRIDES[7] = {
    explain: EXPLAIN,
    scenarios: [compare, hintWindow, repairGc],
  };
})();
