(function () {
  const X = [28, 176, 324, 472], C = X.map(x => x + 66);
  const MOVE = 'transform .65s cubic-bezier(.3,.7,.2,1), opacity .4s';
  const tint = (c, n = 22) => `color-mix(in srgb, var(${c}) ${n}%, var(--card))`;
  const tabletMove = {
    id: 'tablet-move', label: 'Move a tablet replica',
    desc: 'Follow one replica of tablet 17 from N1 to N4: dual writes, streaming, a read-routing switch, then retirement of the old copy.',
    codeLabel: 'nodetool / migration stages',
    code: { bug: [
      'nodetool status ks_orders',
      '// write_both_read_old: writes reach old + new; reads stay old',
      '// streaming: transfer existing data to the new replica',
      '// write_both_read_new: reads use new; writes still reach both',
      '// use_new: reads and writes use the new replica set',
      '// cleanup: retire the leaving replica’s tablet data',
    ] },
    stage: {
      w: 640, h: 420,
      footer: 'Simplified: one moving replica; other RF copies hidden. Numbers illustrative.',
      header: s => ({ left: 'tablet 17 · N1 → N4', right: s.phase }),
      setup(kit) {
        const t = (x, y, text, cls = 'kt sm', anchor) => kit.text(null, { x, y, t: text, cls, anchor });
        const rev = t(28, 80, '', 'kt sm b');
        const progLabel = t(194, 80, '', 'kt xs mut');
        const track = kit.el('rect', { x: 194, y: 89, width: 258, height: 8, rx: 4 }, kit.layer);
        track.style.fill = 'var(--soft)';
        const progress = kit.el('rect', { x: 0, y: 0, width: 258, height: 8, rx: 4 }, kit.layer);
        progress.style.fill = 'var(--acc)'; progress.style.transformOrigin = '0 0'; progress.style.transition = MOVE;
        const racks = X.map((x, n) => {
          const circle = kit.el('circle', { cx: C[n], cy: 127, r: 17 }, kit.layer);
          circle.style.stroke = 'var(--ink)'; circle.style.strokeWidth = 2; circle.style.fill = tint('--t' + n);
          t(C[n], 131, 'N' + (n === 3 ? 4 : n + 1), 'kt b', 'middle');
          const outline = kit.el('path', { d: `M${x} 156 V270 H${x + 132} V156`, fill: 'none' }, kit.layer);
          outline.style.stroke = 'var(--line)'; outline.style.strokeWidth = 2;
          t(C[n], 153, n === 3 ? 'destination' : 'existing replicas', 'kt xs mut', 'middle');
          if(n < 3) [0, 1, 2, 3].forEach(i => kit.chip(null, { x: x + 12 + (i % 2) * 56, y: 166 + Math.floor(i / 2) * 32,
            w: 48, h: 24, label: 'T' + (n * 4 + i + 1), small: true, tone: 'info' }));
          return outline;
        });
        const primary = kit.chip(null, { x: 40, y: 232, w: 108, h: 32, label: 'T17', sub: 'read replica', small: true, tone: 'cursor' });
        const pending = kit.chip(null, { x: 484, y: 232, w: 108, h: 32, label: 'T17 copy', sub: 'not ready', small: true, tone: 'warn', show: false });
        const leaving = kit.chip(null, { x: 40, y: 232, w: 108, h: 32, label: 'T17 old', sub: 'retiring', small: true, tone: 'warn', show: false });
        const stream = Array.from({ length: 5 }, (_, i) => {
          const g = kit.el('g', null, kit.layer); g.style.transition = MOVE;
          const r = kit.el('rect', { x: 0, y: 0, width: 10, height: 7, rx: 2 }, g); r.style.fill = 'var(--acc)';
          return g;
        });
        const read = kit.el('g', null, kit.layer); read.style.transition = MOVE;
        const rc = kit.el('circle', { r: 6, cx: 0, cy: 0 }, read); rc.style.fill = 'var(--ok)';
        const rl = kit.text(read, { x: 10, y: 4, t: 'read', cls: 'kt xs b' });
        const wr = [0, 1].map(() => {
          const g = kit.el('g', null, kit.layer); g.style.transition = MOVE;
          const c = kit.el('circle', { r: 5 }, g); c.style.fill = 'var(--acc2)';
          return g;
        });
        const wires = [C[0], C[3]].map(cx => {
          const path = kit.el('path', { d: `M320 298 H${cx} V275`, fill: 'none' }, kit.layer);
          path.style.stroke = 'var(--acc2)'; path.style.strokeWidth = 1.5; path.style.transition = 'opacity .4s';
          return path;
        });
        t(320, 316, 'incoming write', 'kt xs mut', 'middle');
        const routes = t(28, 338, '', 'kt sm b');
        return { rev, progLabel, progress, racks, primary, pending, leaving, stream, read, wr, wires, routes };
      },
      frame(s, kit, R) {
        const p = s.p, dual = p >= 1 && p <= 5, switched = p >= 5;
        R.rev.set('map rev ' + (p < 1 ? 41 : p < 5 ? 42 : p < 6 ? 43 : 44));
        R.progLabel.set(p < 2 ? 'existing data not copied yet' : 'existing data copied: ' + s.copy + '%');
        R.progress.style.transform = `translate(194px,89px) scaleX(${s.copy / 100})`;
        R.primary.set({ x: switched ? 484 : 40, y: 232, sub: p >= 6 ? 'active replica' : 'read replica', tone: switched ? 'ok' : 'cursor' });
        R.pending.set({ show: p >= 1 && p < 5, sub: s.copy === 100 ? 'caught up' : s.copy + '% copied', tone: s.copy === 100 ? 'ok' : 'warn' });
        R.leaving.set({ show: p >= 5 && p < 7, y: p >= 7 ? 264 : 232, sub: p === 5 ? 'dual writes' : 'retiring' });
        R.stream.forEach((g, i) => {
          g.style.opacity = p >= 2 && p <= 4 ? 1 : 0;
          g.style.transform = `translate(${98 + s.copy * 3.95 + i * 9}px,103px)`;
        });
        R.read.style.transform = `translate(${switched ? C[3] : C[0]}px,282px)`;
        R.wr.forEach((g, i) => {
          const visible = dual || (p === 0 && i === 0) || (p >= 6 && i === 1);
          g.style.opacity = visible ? 1 : 0;
          g.style.transform = `translate(${i === 0 ? C[0] : C[3]}px,298px)`;
          R.wires[i].style.opacity = visible ? 1 : 0;
        });
        R.racks[0].style.stroke = p >= 6 ? 'var(--line)' : 'var(--acc2)';
        R.racks[3].style.stroke = switched ? 'var(--ok)' : p >= 1 ? 'var(--warn)' : 'var(--line)';
        R.routes.set('reads → ' + (switched ? 'N4' : 'N1') + '   writes → ' + (dual ? 'N1 + N4' : p >= 6 ? 'N4' : 'N1') + '   other tablets stay put');
      }
    },
    bug: [
      { code: 0, log: 'N4 joins with spare capacity. The balancer selects one replica of tablet 17 on N1 for migration; its other replicas are outside this drawing.', callout: 'Move one tablet replica; the rest of the table stays put', state: { p: 0, copy: 0, phase: 'plan' }, stats: [{ l: 'read replica shown', v: 'N1' }, { l: 'copy progress', v: '0%' }] },
      { code: 1, log: 'A Raft-managed transition adds the destination to the write path before streaming. New mutations reach N1 and N4; reads continue using the old replica set.', callout: 'Protect new writes before copying old data', state: { p: 1, copy: 0, phase: 'dual writes' }, stats: [{ l: 'writes shown', v: 'N1 + N4', cls: 'warn' }, { l: 'reads shown', v: 'N1' }] },
      { code: 2, log: 'Existing tablet data streams toward N4, shown as moving blue fragments. The destination has only a partial copy, so it cannot replace N1 for reads yet.', callout: 'A partial copy is not a ready read replica', state: { p: 2, copy: 25, phase: 'streaming' }, stats: [{ l: 'existing data copied', v: '25%' }, { l: 'reads shown', v: 'N1', cls: 'ok' }] },
      { code: 2, log: 'The copy advances while new writes keep reaching both replicas. Streaming competes with foreground requests for disk and network; p99 rises in this illustrative workload.', callout: 'Streaming consumes I/O before N4 takes read traffic', state: { p: 3, copy: 75, phase: 'shared I/O' }, stats: [{ l: 'existing data copied', v: '75%' }, { l: 'read p99', v: '30 ms', cls: 'warn' }] },
      { code: 2, log: 'Streaming and catch-up complete. N4 now has the existing data and intervening mutations. Completion alone does not switch routing; the transition must advance safely.', callout: 'Copy complete does not automatically change routing', state: { p: 4, copy: 100, phase: 'caught up' }, stats: [{ l: 'existing data copied', v: '100%', cls: 'ok' }, { l: 'reads shown', v: 'still N1' }] },
      { code: 3, moment: true, log: 'The committed transition changes the read replica set. The green read marker and tablet tile move to N4, while writes still reach both sides during the handoff.', callout: 'Reads switch first; writes still protect both replicas', state: { p: 5, copy: 100, phase: 'read switch' }, stats: [{ l: 'reads shown', v: 'N4', cls: 'ok' }, { l: 'writes shown', v: 'N1 + N4' }] },
      { code: 4, log: 'After the transition barriers, use_new removes the leaving replica from the write path. Both reads and writes now use the new replica set, including N4.', callout: 'Finalize the replica set, then stop old writes', state: { p: 6, copy: 100, phase: 'use new' }, stats: [{ l: 'reads + writes shown', v: 'N4', cls: 'ok' }, { l: 'old copy', v: 'awaiting cleanup' }] },
      { code: 5, log: 'Migration cleanup retires the old tablet copy on N1. Temporary duplicate storage is released after the routing handoff; unrelated tablets never moved.', callout: 'Retire the old copy after the routing handoff', state: { p: 7, copy: 100, phase: 'cleanup' }, stats: [{ l: 'temporary copies', v: '0', cls: 'ok' }, { l: 'read p99', v: '8 ms', cls: 'ok' }] },
      { code: 5, log: 'Tablet 17 is now placed on N4 instead of N1 in the replica set. A physical data copy and several committed metadata transitions made the move safe under live traffic.', callout: 'Data movement and metadata agreement do different jobs', state: { p: 8, copy: 100, phase: 'move complete' }, stats: [{ l: 'replica moved', v: 'N1 → N4', cls: 'ok' }, { l: 'other tablets moved', v: '0' }], takeaway: 'Copying data is not changing ownership. Protect writes, copy, switch reads, finalize the set, then retire the old copy.' },
    ]
  };
  /* ---------- shared tile-map parts for the hot-tablet and vnode-cleanup scenes ---------- */
  const slotXY = (n, i) => [X[n] + 12 + (i % 2) * 56, 126 + Math.floor(i / 2) * 30];
  const loadTone = v => (v >= 60 ? 'bad' : v >= 35 ? 'warn' : 'ok');
  const HOT_FILL = 'color-mix(in srgb, var(--bad) 36%, var(--card))';
  const paintHot = (chip, on) => {
    const r = chip.g.querySelector('rect');
    r.style.fill = on ? HOT_FILL : ''; r.style.stroke = on ? 'var(--bad)' : ''; r.style.strokeWidth = on ? '2.6' : '';
  };
  /* node circle + one or two stacked gauge segments, drawn at the top of column n */
  function colHead(kit, n, name, max) {
    const cx = X[n] + 16, cy = 95, x0 = X[n] + 36, y0 = 90, w = 96;
    const circle = kit.el('circle', { cx, cy, r: 13 }, kit.layer);
    circle.style.stroke = 'var(--ink)'; circle.style.strokeWidth = 2; circle.style.fill = tint('--t' + n); circle.style.transition = 'opacity .4s';
    const label = kit.text(null, { x: cx, y: cy + 4, t: name, cls: 'kt b', anchor: 'middle' });
    const track = kit.el('rect', { x: x0, y: y0, width: w, height: 10, rx: 5 }, kit.layer);
    track.style.fill = 'var(--soft)'; track.style.stroke = 'var(--line)';
    const seg = fill => {
      const r = kit.el('rect', { x: 0, y: 0, width: w, height: 10, rx: 4 }, kit.layer);
      r.style.transformOrigin = '0 0'; r.style.fill = fill; r.style.transition = 'transform .7s cubic-bezier(.3,.7,.2,1), fill .4s';
      return r;
    };
    const a = seg('var(--ok)'), b = seg('var(--warn)');
    const tick = kit.el('line', { x1: 0, y1: y0 - 3, x2: 0, y2: y0 + 13 }, kit.layer);
    tick.style.stroke = 'var(--ink)'; tick.style.strokeWidth = 2; tick.style.transition = 'opacity .4s'; tick.style.opacity = 0;
    const val = kit.text(null, { x: X[n] + 132, y: 86, t: '', cls: 'kt sm b', anchor: 'end' });
    return {
      circle, label, val,
      set(own, stale, tone, text, bad) {
        a.style.transform = `translate(${x0}px,${y0}px) scaleX(${Math.min(1, own / max)})`;
        b.style.transform = `translate(${x0 + w * Math.min(1, own / max)}px,${y0}px) scaleX(${Math.min(1, stale / max)})`;
        a.style.fill = 'var(--' + (tone || 'ok') + ')';
        val.set(text); val.el.setAttribute('class', 'kt sm b' + (bad ? ' tone-bad' : ''));
      },
      tickAt(v, on) { const x = x0 + w * v / max; tick.setAttribute('x1', x); tick.setAttribute('x2', x); tick.style.opacity = on ? 1 : 0; }
    };
  }
  const columnOutline = (kit, n, bottom) => {
    const p = kit.el('path', { d: `M${X[n]} 116 V${bottom} H${X[n] + 132} V116`, fill: 'none' }, kit.layer);
    p.style.stroke = 'var(--line)'; p.style.strokeWidth = 2; p.style.transition = 'stroke .4s, opacity .4s';
    return p;
  };

  /* ---------- hot tablet: one key, one token, one tablet ---------- */
  const hotTablet = {
    id: 'hot-tablet', label: 'Hot tablet key',
    desc: 'Moving or splitting a tablet cannot cool a hot key, because one partition key stays in one tablet (percentages illustrative).',
    codeLabel: 'CQL',
    code: { bug: [
      '-- seller 77 is one partition: one tablet, one shard',
      'SELECT * FROM ks_orders.orders WHERE seller_id = 77;',
      '-- fix: spread the key over 16 buckets in the data model',
      'PRIMARY KEY ((seller_id, bucket), order_id)',
      '-- each bucket hashes to its own token, so it can move alone',
      '-- reads now fan out over all 16 buckets'
    ] },
    stage: {
      w: 640, h: 420,
      footer: 'Simplified: one replica per tablet shown; traffic shares are illustrative.',
      header: s => ({ left: 'tile map · 16 tablets · seller 77', right: s.hdr || '' }),
      setup(kit) {
        const t = (x, y, text, cls = 'kt sm', anchor) => kit.text(null, { x, y, t: text, cls, anchor });
        t(28, 75, 'tile = tablet · bar = share of traffic on that node (illustrative)', 'kt xs mut');
        const heads = [0, 1, 2, 3].map(n => colHead(kit, n, 'N' + (n + 1), 100));
        const outlines = [0, 1, 2, 3].map(n => columnOutline(kit, n, 250));
        const BASE = [['T1', 'T2', 'T3', 'T4'], ['T5', 'T6', 'T7', 'T8'], ['T9', 'T10', 'T11', 'T12'], ['T13', 'T14', 'T15', 'T16']];
        const tiles = {};
        BASE.forEach((ids, n) => ids.forEach((id, i) => {
          const [x, y] = slotXY(n, i);
          tiles[id] = kit.chip(null, { x, y, w: 48, h: 24, label: id, small: true, tone: 'info' });
        }));
        tiles.T4b = kit.chip(null, { x: X[0] + 68, y: 156, w: 48, h: 24, label: 'T4b', small: true, tone: 'info', show: false });
        const bk = Array.from({ length: 16 }, (_, i) => kit.chip(null, { x: X[0] + 12, y: 130, w: 24, h: 18, label: String(i), small: true, tone: 'live', show: false }));
        const key = kit.el('g', null, kit.layer);
        key.style.transition = 'transform .65s cubic-bezier(.3,.7,.2,1), opacity .4s';
        const kc = kit.el('circle', { r: 8, cx: 0, cy: 0 }, key);
        kc.style.fill = 'color-mix(in srgb, var(--bad) 60%, var(--card))'; kc.style.stroke = 'var(--bad)'; kc.style.strokeWidth = 1.6;
        kit.text(key, { x: 0, y: 3, t: '77', cls: 'kt xs b', anchor: 'middle' });
        const lines = [0, 1, 2, 3].map(n => {
          const l = kit.el('line', { x1: 320, y1: 280, x2: X[n] + 66, y2: 252 }, kit.layer);
          l.style.stroke = 'var(--acc2)'; l.style.strokeWidth = 1.5; l.style.strokeDasharray = '4 3'; l.style.transition = 'opacity .4s'; l.style.opacity = 0;
          return l;
        });
        const counts = [0, 1, 2, 3].map(n => { const x = t(X[n] + 66, 264, '4 reads', 'kt xs b', 'middle'); x.show(false); return x; });
        const client = kit.chip(null, { x: 245, y: 282, w: 150, h: 26, label: 'read seller 77', small: true, tone: 'cursor', show: false });
        const dots = [];
        [0, 1, 2, 3].forEach(n => [0, 1].forEach(j => {
          const d = kit.el('circle', { r: 5, class: 'kdot' }, kit.layer); d.style.opacity = 0;
          dots.push({ d, n, j });
        }));
        const route = t(28, 328, '', 'kt sm b');
        return { heads, outlines, tiles, bk, key, lines, counts, client, dots, route, m: 0 };
      },
      frame(s, kit, R) {
        const hot = s.hot || 0, split = !!s.split, cold = s.cold == null ? hot : s.cold, load = s.load || [25, 25, 25, 25];
        /* where the tablets sit: T4 starts on N1 (slot 3) and later extras use slots 4 and 5 */
        const at4 = (split ? cold : hot) === 0 ? slotXY(0, 3) : slotXY(split ? cold : hot, 4);
        const at4b = split ? slotXY(hot, 5) : at4;
        const front = split ? at4b : at4;
        R.tiles.T4.set({ x: at4[0], y: at4[1], label: split ? 'T4a' : 'T4', tone: 'info' });
        R.tiles.T4b.set({ x: at4b[0], y: at4b[1], show: split, tone: 'info' });
        paintHot(R.tiles.T4, !!s.flash && !split);
        paintHot(R.tiles.T4b, !!s.flash && split);
        R.key.style.transform = `translate(${front[0] + 44}px,${front[1] + 3}px)`;
        R.key.style.opacity = s.flash ? 1 : 0;
        R.bk.forEach((c, i) => {
          const n = Math.floor(i / 4), k = i % 4;
          c.set({ x: s.fix ? X[n] + 12 + k * 28 : front[0] + 12, y: s.fix ? 218 : front[1] + 3, show: !!s.fix, tone: s.read ? 'cursor' : 'live' });
        });
        R.heads.forEach((h, n) => {
          const tn = loadTone(load[n]);
          h.set(load[n], 0, tn, Math.round(load[n]) + '%', tn === 'bad');
          R.outlines[n].style.stroke = tn === 'bad' ? 'var(--bad)' : 'var(--line)';
        });
        R.route.set(s.route || '');
        const reading = !!s.read;
        R.client.set({ show: reading });
        R.lines.forEach(l => { l.style.opacity = reading ? 1 : 0; });
        R.counts.forEach(c => c.show(reading));
        Kit.tween(R, 'm', R.m, reading ? 1 : 0, 1100, v => {
          R.m = v;
          R.dots.forEach(({ d, n, j }) => {
            const u = v * (j ? 0.7 : 1), px = X[n] + 66 + (j ? 12 : -12);
            d.setAttribute('cx', 320 + (px - 320) * u); d.setAttribute('cy', 280 + (244 - 280) * u);
            d.style.opacity = v > 0.02 ? 1 : 0;
          });
        });
      }
    },
    bug: [
      { code: 0, log: 'A normal evening: 16 tablets, four per node, and traffic spreads about evenly over the four nodes (illustrative).', callout: 'Equal tablet counts and equal traffic', state: { hot: 0, load: [26, 25, 25, 24], route: '16 tablets · 4 per node · traffic follows the tablets evenly', hdr: 'normal evening' }, stats: [{ l: 'tablets per node', v: '4 · 4 · 4 · 4' }, { l: 'busiest node', v: '26%', cls: 'ok' }] },
      { code: 1, log: 'A flash sale starts. Seller 77 is one partition key with one token, so every one of its rows sits in tablet T4 on N1, and that key takes about 90% of traffic (illustrative).', callout: 'One key lights up one tablet: N1 serves 90% of traffic', state: { hot: 0, flash: true, load: [90, 4, 3, 3], route: 'seller 77 → 1 token → tablet T4 → N1', hdr: 'flash sale' }, stats: [{ l: 'N1 traffic', v: '90%', cls: 'bad' }, { l: 'tablets per node', v: '4 · 4 · 4 · 4' }, { l: 'key split across tablets', v: 'no', cls: 'bad' }] },
      { code: 0, log: 'The balancer sees N1 saturated and moves T4 to N4. The hot spot moves with the tablet: N1 cools down and N4 now serves 90%.', callout: 'The hot spot follows the moved tablet', state: { hot: 3, flash: true, load: [4, 3, 3, 90], route: 'seller 77 → 1 token → tablet T4 → N4', hdr: 'T4 moved to N4' }, stats: [{ l: 'N1 traffic', v: '4%', cls: 'ok' }, { l: 'N4 traffic', v: '90%', cls: 'bad' }] },
      { code: 0, moment: true, log: 'The balancer splits T4 by token range into T4a and T4b. Seller 77 has one token, so all its rows fall in the same half, T4b. The split divides a range, not one key.', callout: 'A split divides a range, not one partition key', state: { hot: 3, flash: true, split: true, cold: 3, load: [4, 3, 3, 90], route: 'seller 77 → 1 token → T4b (T4a has the other keys) → N4', hdr: 'T4 split in two' }, stats: [{ l: 'tablets', v: '17' }, { l: 'seller 77 rows in T4b', v: 'all', cls: 'bad' }, { l: 'N4 traffic', v: '90%', cls: 'bad' }] },
      { code: 0, log: 'The cold half, T4a, moves back to N1 to even out tablet counts. Traffic does not change: T4b, the half with seller 77, still sits on N4 at 90%.', callout: 'Moving the cold half cannot cool N4', state: { hot: 3, flash: true, split: true, cold: 0, load: [4, 3, 3, 90], route: 'T4a went to N1; seller 77 is still in T4b on N4', hdr: 'T4a moved to N1' }, stats: [{ l: 'tablets per node', v: '4 · 4 · 4 · 5' }, { l: 'N4 traffic', v: '90%', cls: 'bad' }, { l: 'N1 to N3 traffic', v: '≈ 4%', cls: 'ok' }] },
      { code: 2, log: 'The fix is in the data model: add a bucket to the key. Seller 77 becomes 16 partitions, each with its own token, so they land in different tablets on all four nodes and the bars even out.', callout: 'Fix: 16 buckets, 16 tokens, spread over 4 nodes', state: { hot: 3, split: true, cold: 0, fix: true, load: [25, 25, 25, 25], route: 'seller 77 → 16 buckets → 16 tokens → 16 tablets → 4 nodes', hdr: '16 buckets' }, stats: [{ l: 'buckets for seller 77', v: '16', cls: 'ok' }, { l: 'busiest node', v: '25%', cls: 'ok' }, { l: 'key split across tablets', v: 'yes', cls: 'ok' }] },
      { code: 5, log: 'The price: a read of the whole seller now visits every bucket. One query becomes 16 partition reads, about four on each node.', callout: 'Reads now fan out over the buckets', state: { hot: 3, split: true, cold: 0, fix: true, read: true, load: [25, 25, 25, 25], route: 'one read of seller 77 = 16 partition reads, 4 per node', hdr: 'read fan-out' }, stats: [{ l: 'reads per seller query', v: '16', cls: 'warn' }, { l: 'busiest node', v: '25%', cls: 'ok' }],
        takeaway: 'A tablet move carries its hot key with it. Bucketing the key in the data model is what spreads the load.' }
    ]
  };


window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
window.CHAPTER_OVERRIDES[8] = {
  explain: `
<h3>1. Tablets are small units with their own owners</h3>
<p>A table is split into <b>tablets</b>. Each tablet is a token range with its own replica set and a state. Because the unit is small, the cluster can move one tablet at a time to a new node while the rest of the table keeps serving reads and writes. No global rebalance is needed, and no node has to pause its whole table to take on a share of the data.</p>

<h3>2. The tablet map and the load balancer</h3>
<p>The <b>tablet map</b> records, for each tablet, its token range, its replicas and an <b>epoch</b>. The epoch is a version number that rises each time the map changes. The map is metadata, so every change to it is committed through Raft, which the next chapter covers. A background <b>load balancer</b> reads the load on each node and each shard, then moves tablets from busy nodes to emptier ones. It also balances shards inside one node. According to the ScyllaDB docs, tablets are the default for new keyspaces.</p>

<h3>3. Protect writes, stream data, then change routing</h3>
<p>The animation follows one <b>tablet replica</b> migrating from N1 to N4; other copies required by the replication factor are hidden. Tablet 17 is a token range, not a table or a single row. Moving one replica replaces one member of its replica set.</p>
<p>Before streaming, a committed transition enables writes to both the old and new replica sets while reads use the old set. Existing data then streams to N4 as new mutations continue reaching both sides. A complete copy does not itself authorize new routing: the transition state and synchronization barriers decide when it is safe.</p>
<p>After the destination is ready, reads switch to the new set while writes still reach both. A later transition selects the new set for both reads and writes; cleanup then retires the leaving replica’s data. The drawing labels these stages <code>write_both_read_old</code>, <code>streaming</code>, <code>write_both_read_new</code>, <code>use_new</code> and <code>cleanup</code>. It groups preparatory barriers and omits failure/revert paths. The displayed map revisions are illustrative; real migration uses several Raft-managed transitions, not one magic switch.</p>
<p>The copy shares disk and network with node 1's own traffic. That is the source of the p99 rise during the move, and it is why the move is paced.</p>
<figure class="mm" aria-label="Sequence diagram: a tablet replica moves through dual writes, streaming, routing transitions and cleanup" style="--diagram-width:620.00px">
  <img src="diagrams/tablet-move-sequence.svg" alt="Sequence diagram: the balancer plans a move of tablet 17 from node 1 to node 4. Node 1 streams existing data to node 4 after writes reach both replica sets. Reads then switch, writes later switch, and node 1 retires the leaving replica after reads and writes switch.">
  <figcaption>Sequence (Mermaid source: diagrams/tablet-move-sequence.mmd): data copying and committed routing transitions are separate operations.</figcaption>
</figure>
<p>The life of one move, as a state diagram:</p>
<figure class="mm" aria-label="State diagram: a tablet replica moves from planned through copying, read handoff, write handoff and cleanup" style="--diagram-width:175.75px">
  <img src="diagrams/ch08-tablet-states.svg" alt="State diagram: a tablet replica moves from planned through copying, read handoff, write handoff and cleanup">
  <figcaption>State: the life of one move. Copy completion, read routing and write routing advance separately.</figcaption>
</figure>

<h3>4. Splits and merges</h3>
<p>A tablet <b>splits</b> when it grows past a size target and <b>merges</b> when it shrinks. A split divides a token range. It cannot divide one partition key, because every row of that key hashes to the same token and stays in one tablet. A move has the same limit: it carries the whole tablet, including a hot key inside it.</p>

<h3>5. Vnode keyspaces keep their old data</h3>
<p>A keyspace created with vnodes behaves differently. A new node takes whole token ranges from its neighbours, and the old nodes keep the data for ranges they no longer own. That data keeps using disk until <code>nodetool cleanup</code> removes it. If the old nodes do not shrink after a join, the stale data is still there, and the new node's empty disk tells you nothing about it.</p>

<h3>6. The trade-off</h3>
<p>Paced moves protect foreground latency, but the imbalance lasts longer. Moves, splits and merges share disk and network with requests, so a join during peak traffic can raise p99 while the streams run. A move also cannot cool one hot partition key. Bucketing that key in the data model spreads it, but every read of the key then has to visit each bucket.</p>

<h3>7. The syntax, in one place</h3>
<pre>$ nodetool status ks_orders      # per-node load for one keyspace
$ nodetool cleanup ks_orders     # vnode keyspaces: on each old node, one at a time</pre>
<p>The load balancer starts tablet moves in the background, so this chapter needs no statement to start one. Watch the load and the streams instead.</p>
<p>Source mapping: the original chapter’s migration, shared-I/O, hot-partition and vnode-cleanup lessons remain. Transition details follow the <a href="https://github.com/scylladb/scylladb/blob/branch-2025.1/locator/tablets.hh" target="_blank" rel="noopener">2025.1 tablet migration states</a>; the drawing compresses their barriers into a teaching sequence.</p>`,

  scenarios: [
    tabletMove,
    hotTablet,
    {
      id: 'vnode-cleanup',
      label: 'Vnode cleanup',
      desc: 'A new node takes whole ranges in a vnode keyspace, and the old nodes keep their stale slices until cleanup (sizes illustrative).',
      codeLabel: 'nodetool',
      code: { bug: [
        '$ nodetool status ks_orders   # old nodes keep their load',
        '# node 4 streams whole token ranges from nodes 1 to 3',
        '$ nodetool cleanup ks_orders  # on node 1, then node 2, then 3',
        '# cleanup rewrites SSTables and uses I/O: one node at a time'
      ] },
      scene: {
        w: 640, h: 420,
        footer: 'Simplified: four nodes, one table. Sizes are illustrative; other ranges are hidden.',
        panels: [
          { id: 'n1', x: 16, y: 58, w: 140, h: 300, title: 'Old node 1', tone: 'info' },
          { id: 'n2', x: 168, y: 58, w: 140, h: 300, title: 'Old node 2', tone: 'info' },
          { id: 'n3', x: 320, y: 58, w: 140, h: 300, title: 'Old node 3', tone: 'info' },
          { id: 'n4', x: 472, y: 58, w: 140, h: 300, title: 'New node 4 (joined)', tone: 'info' }
        ],
        tokens: {
          o1: { label: 'ranges A', sub: 'owned · 1.2 TB', tone: 'live', w: 120 },
          o2: { label: 'ranges B', sub: 'owned · 1.2 TB', tone: 'live', w: 120 },
          o3: { label: 'ranges C', sub: 'owned · 1.2 TB', tone: 'live', w: 120 },
          s1: { label: 'stale slice', sub: 'stale · 0.3 TB', tone: 'warn', w: 124 },
          s2: { label: 'stale slice', sub: 'stale · 0.3 TB', tone: 'warn', w: 124 },
          s3: { label: 'stale slice', sub: 'stale · 0.3 TB', tone: 'warn', w: 124 },
          c1: { label: 'from node 1', sub: 'streamed 0.3 TB', tone: 'live', w: 120 },
          c2: { label: 'from node 2', sub: 'streamed 0.3 TB', tone: 'live', w: 120 },
          c3: { label: 'from node 3', sub: 'streamed 0.3 TB', tone: 'live', w: 120 }
        }
      },
      bug: [
        { log: 'Node 4 joins a vnode keyspace. The three old nodes hold all the data, each for the ranges it owns (sizes illustrative).', callout: 'Three old nodes hold all the data', code: 0,
          at: { o1: { x: 26, y: 110 }, o2: { x: 178, y: 110 }, o3: { x: 330, y: 110 } },
          badge: { n4: 'empty' },
          stats: [{ l: 'node 4 data', v: 'none', cls: 'ok' }, { l: 'stale slices', v: '0' }] },
        { log: 'Node 4 takes whole token ranges. It streams a copy of its share from each old node.', callout: 'Node 4 streams its share from each old node', code: 1,
          at: { o1: { x: 26, y: 110 }, o2: { x: 178, y: 110 }, o3: { x: 330, y: 110 }, c1: { x: 484, y: 110, sub: 'streaming' }, c2: { x: 484, y: 170, sub: 'streaming' }, c3: { x: 484, y: 230, sub: 'streaming' } },
          arrows: [['o1', 'c1', 'stream'], ['o2', 'c2', 'stream'], ['o3', 'c3', 'stream']],
          stats: [{ l: 'node 4 data', v: 'streaming', cls: 'warn' }, { l: 'stale slices', v: '0' }] },
        { log: 'The join completes. Each old node keeps the slice it gave away, and that slice still uses disk on the old node.', callout: 'Old nodes keep the slices they gave away', code: 0,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, s1: { x: 26, y: 190 }, s2: { x: 178, y: 190 }, s3: { x: 330, y: 190 }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          stats: [{ l: 'node 4 data', v: 'complete', cls: 'ok' }, { l: 'stale slices', v: '3', cls: 'warn' }] },
        { log: 'Nodes 1 to 3 still report about 1.2 TB each, the same as before the join. The stale slices are still on disk.', callout: 'Load did not fall: stale slices remain', code: 0, moment: true,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, s1: { x: 26, y: 190 }, s2: { x: 178, y: 190 }, s3: { x: 330, y: 190 }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          badge: { n1: 'load unchanged', n2: 'load unchanged', n3: 'load unchanged' },
          stats: [{ l: 'old node load', v: '1.2 TB', cls: 'bad' }, { l: 'stale slices', v: '3', cls: 'warn' }] },
        { log: 'Cleanup runs on node 1. It rewrites its SSTables and drops the slice node 1 no longer owns.', callout: 'Cleanup on node 1 drops its stale slice', code: 2,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, s2: { x: 178, y: 190 }, s3: { x: 330, y: 190 }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          badge: { n1: 'cleaned' },
          stats: [{ l: 'stale slices', v: '2', cls: 'warn' }, { l: 'cleaned nodes', v: '1', cls: 'ok' }] },
        { log: 'Cleanup then runs on node 2. Running one node at a time keeps the extra I/O bounded.', callout: 'Node 2 cleaned; one node at a time', code: 2,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, s3: { x: 330, y: 190 }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          badge: { n2: 'cleaned' },
          stats: [{ l: 'stale slices', v: '1', cls: 'warn' }, { l: 'cleaned nodes', v: '2', cls: 'ok' }] },
        { log: 'Cleanup on node 3 removes the last stale slice. Each old node now holds only the ranges it owns, about 0.9 TB each.', callout: 'Last stale slice gone: loads fall', code: 2,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          badge: { n3: 'cleaned' },
          stats: [{ l: 'old node load', v: '0.9 TB', cls: 'ok' }, { l: 'stale slices', v: '0', cls: 'ok' }] },
        { log: 'The old nodes hold only their own ranges now. Their disk use drops only after cleanup, not after the join.', callout: 'Space comes back only after cleanup', code: 3,
          at: { o1: { x: 26, y: 110, sub: 'owned · 0.9 TB' }, o2: { x: 178, y: 110, sub: 'owned · 0.9 TB' }, o3: { x: 330, y: 110, sub: 'owned · 0.9 TB' }, c1: { x: 484, y: 110 }, c2: { x: 484, y: 170 }, c3: { x: 484, y: 230 } },
          stats: [{ l: 'old node load', v: '0.9 TB', cls: 'ok' }],
          takeaway: 'A vnode scale-out leaves stale slices on the old nodes. Run nodetool cleanup on each old node, one at a time.' }
      ]
    }
  ]
};

})();
