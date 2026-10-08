/* Chapter 1 "Coordinator and Consistency Levels": bespoke hub-and-spoke scenes plus the Explain text (index 1, zero-based).
   Metaphor: the coordinator is the hub, the three replicas are the spokes. Request pulses travel out, acknowledgements race back.
   Latencies (2, 5, 40 ms), versions (v1, v2), stamps (1000, 950) and real times are illustrative. */
(function () {
  const W = 640, H = 420;
  const POS = { hub: { x: 200, y: 206 }, A: { x: 330, y: 110 }, B: { x: 376, y: 206 }, C: { x: 330, y: 302 } };
  const HUBR = 32, RR = 27, REPL = ['A', 'B', 'C'], MX = 440;
  /* animation times in ms for one trip along a spoke (not to scale with the real latencies) */
  const LAT = { A: { ms: 2, out: 200, back: 200 }, B: { ms: 5, out: 340, back: 340 }, C: { ms: 40, out: 800, back: 800 } };
  const CLEG = 260;                                   // client <-> coordinator leg
  const TONE = {
    neutral: { fill: 'var(--card)', stroke: 'var(--ink)', dash: '' },
    ok: { fill: 'color-mix(in srgb, var(--ok) 42%, var(--card))', stroke: 'var(--ok)', dash: '' },
    stale: { fill: 'color-mix(in srgb, var(--warn) 32%, var(--card))', stroke: 'var(--warn)', dash: '' },
    down: { fill: 'color-mix(in srgb, var(--bad) 14%, var(--card))', stroke: 'var(--bad)', dash: '5 3' },
    hot: { fill: 'color-mix(in srgb, var(--acc2) 26%, var(--card))', stroke: 'var(--acc2)', dash: '' }
  };
  const SLOT = {
    empty: { fill: 'var(--soft)', stroke: 'var(--line)', dash: '' },
    ok: { fill: 'color-mix(in srgb, var(--ok) 40%, var(--card))', stroke: 'var(--ok)', dash: '' },
    late: { fill: 'var(--card)', stroke: 'var(--mut)', dash: '' },
    bad: { fill: 'color-mix(in srgb, var(--bad) 18%, var(--card))', stroke: 'var(--bad)', dash: '4 3' }
  };
  const PULSE = { req: 'var(--acc2)', ack: 'var(--ok)', bad: 'var(--bad)', hint: 'var(--warn)', info: 'var(--acc)' };
  const NOTE = { A: { x: POS.A.x + RR + 18, y: POS.A.y + 4, a: 'start' }, B: { x: POS.B.x, y: POS.B.y + RR + 28, a: 'middle' }, C: { x: POS.C.x + RR + 18, y: POS.C.y + 4, a: 'start' } };
  const flush = e => e.getBoundingClientRect();

  /* ---- the star: client(s) on the left, coordinator hub, three replica spokes, ack meter on the right ---- */
  function buildStar(kit, o) {
    o = o || {};
    const L = kit.layer, el = kit.el;
    const R = { gen: 0, pool: [], node: {}, spoke: {}, cl: {}, prev: {} };
    const clients = o.clients || [{ id: 'cli', x: 16, y: 184, w: 106, h: 44, label: 'client', sub: '' }];
    R.clients = clients;
    const gS = el('g', null, L), gN = el('g', null, L), gM = el('g', null, L), gP = el('g', null, L);
    R.gP = gP;
    const sline = (a, b) => { const l = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, gS); l.style.transition = 'stroke .4s, stroke-width .4s'; l.style.stroke = 'var(--mut)'; l.style.strokeWidth = 2.5; return l; };
    clients.forEach(c => { c.cx = c.x + c.w; c.cy = c.y + c.h / 2; R.cl[c.id] = { line: sline({ x: c.cx, y: c.cy }, POS.hub), pos: { x: c.cx, y: c.cy } }; });
    REPL.forEach(id => {
      const p = POS[id], mid = { x: (POS.hub.x + p.x) / 2, y: (POS.hub.y + p.y) / 2 };
      const lab = kit.text(gS, { x: mid.x, y: mid.y + (id === 'B' ? -6 : 4), t: '', cls: 'sm elab', anchor: 'middle' });
      R.spoke[id] = { line: sline(POS.hub, p), lab };
    });
    /* hub */
    const hub = el('circle', { cx: POS.hub.x, cy: POS.hub.y, r: HUBR }, gN);
    hub.style.fill = 'color-mix(in srgb, var(--acc) 22%, var(--card))'; hub.style.stroke = 'var(--acc)'; hub.style.strokeWidth = 3.4;
    kit.text(gN, { x: POS.hub.x, y: POS.hub.y + 4, t: 'coord', cls: 'b', anchor: 'middle' });
    kit.text(gN, { x: POS.hub.x, y: POS.hub.y + HUBR + 14, t: 'coordinator', cls: 'xs mut', anchor: 'middle' });
    /* replicas */
    REPL.forEach(id => {
      const p = POS[id], g = el('g', { transform: `translate(${p.x},${p.y})` }, gN);
      const mk = (r, dash, col) => { const c = el('circle', { r }, g); c.style.fill = 'none'; c.style.stroke = col; c.style.strokeWidth = 3; c.style.opacity = 0; c.style.transition = 'opacity .4s, stroke .4s'; if (dash) c.setAttribute('stroke-dasharray', dash); return c; };
      const wr = mk(RR + 6, '', 'var(--acc)'), rr = mk(RR + 11, '4 3', 'var(--acc2)');
      const c = el('circle', { r: RR }, g); c.style.strokeWidth = 2.4; c.style.transition = 'fill .4s, stroke .4s';
      const lt = kit.text(g, { x: 0, y: -4, t: id, cls: 'b', anchor: 'middle' });
      const nt = NOTE[id], note = kit.text(gN, { x: nt.x, y: nt.y, t: '', cls: 'sm elab', anchor: nt.a });
      R.node[id] = { g, c, wr, rr, vt: {}, lt, note };
    });
    /* meter: slots fill as acks (or replies) arrive, the marker is the threshold */
    R.mTitle = kit.text(gM, { x: MX, y: 84, t: 'Acks needed', cls: 'sm mut' });
    R.slots = [0, 1, 2].map(i => {
      const x = MX + i * 59, r = el('rect', { x, y: 94, width: 54, height: 28, rx: 8 }, gM);
      r.style.transition = 'fill .4s, stroke .4s'; r.style.strokeWidth = 2;
      const t = kit.text(gM, { x: x + 27, y: 112, t: '', cls: 'xs', anchor: 'middle' }); t.el.style.transition = 'opacity .4s';
      return { r, t };
    });
    R.thr = el('g', null, gM); R.thr.style.transition = 'transform .6s cubic-bezier(.3,.7,.2,1), opacity .4s'; R.thr.style.opacity = 0;
    const tl = el('line', { x1: 0, y1: 88, x2: 0, y2: 128 }, R.thr); tl.style.stroke = 'var(--acc2)'; tl.style.strokeWidth = 3.6;
    R.thrLab = kit.text(R.thr, { x: 4, y: 142, t: '', cls: 'sm b', anchor: 'end' });
    R.verdict = kit.text(gM, { x: MX, y: 164, t: '', cls: 'b' });
    R.gM = gM;
    /* client chips */
    clients.forEach(c => { c.chip = kit.chip(null, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, sub: c.sub, tone: c.tone || 'cursor', show: c.show !== false }); });
    R.res = kit.chip(null, { x: 16, y: 240, w: 148, h: 44, label: 'OK', sub: '', tone: 'ok', show: false });
    R.hint = kit.chip(null, { x: 172, y: 268, w: 96, h: 40, label: 'hint for C', sub: 'v2', tone: 'warn', show: false });
    return R;
  }

  const HINTPOS = { x: 220, y: 288 };                 // centre of the "hint for C" chip
  const posOf = (R, id) => (id === 'hub' ? POS.hub : id === 'hint' ? HINTPOS : R.cl[id] ? R.cl[id].pos : POS[id]);
  /* one-shot pulses: each leg is { a, b, ms, delay, tone, hold }. A generation counter drops stale timers. */
  function fire(R, kit, legs) {
    const gen = ++R.gen;
    R.pool.forEach(p => { window.Kit.tween(p, 'm', 0, 0, 0, () => {}); p.c.style.opacity = 0; });
    legs.forEach((lg, i) => {
      if (!R.pool[i]) { const c = kit.el('circle', { r: 6, class: 'kdot' }, R.gP); c.style.opacity = 0; R.pool[i] = { c }; }
      const p = R.pool[i], a = posOf(R, lg.a), b = posOf(R, lg.b);
      setTimeout(() => {
        if (gen !== R.gen) return;
        p.c.style.fill = PULSE[lg.tone || 'req'];
        window.Kit.tween(p, 'm', 0, 1, lg.ms, k => {
          p.c.setAttribute('cx', a.x + (b.x - a.x) * k); p.c.setAttribute('cy', a.y + (b.y - a.y) * k);
          p.c.style.opacity = k >= 1 && !lg.hold ? 0 : 1;
        });
      }, lg.delay || 0);
    });
  }
  /* legs for a full round trip from a client: client -> hub, hub -> replicas, replicas -> hub, hub -> client */
  function trip(from, targets, need, o) {
    o = o || {};
    const legs = [{ a: from, b: 'hub', ms: CLEG, delay: 0, tone: 'req' }];
    targets.forEach(id => legs.push({ a: 'hub', b: id, ms: LAT[id].out, delay: CLEG, tone: o.tone || 'req' }));
    if (o.acks !== false) {
      const order = targets.slice().sort((x, y) => LAT[x].out - LAT[y].out);
      targets.forEach(id => legs.push({ a: id, b: 'hub', ms: LAT[id].back, delay: CLEG + LAT[id].out, tone: 'ack' }));
      if (need) legs.push({ a: 'hub', b: from, ms: CLEG, delay: CLEG + LAT[order[need - 1]].out + LAT[order[need - 1]].back, tone: 'ack' });
    }
    return legs;
  }
  const arrive = (id, lead) => lead + LAT[id].out + LAT[id].back;

  const tintBad = (chip, on) => {
    const r = chip.g.querySelector('rect');
    if (on) { r.style.fill = 'color-mix(in srgb, var(--bad) 20%, var(--card))'; r.style.stroke = 'var(--bad)'; r.style.strokeWidth = 2.4; }
    else { r.style.removeProperty('fill'); r.style.removeProperty('stroke'); r.style.removeProperty('stroke-width'); }
  };
  const paint = (e, t) => { e.style.fill = t.fill; e.style.stroke = t.stroke; if (t.dash) e.setAttribute('stroke-dasharray', t.dash); else e.removeAttribute('stroke-dasharray'); };
  /* Apply the picture of one state. anim = this render follows a step change that carries a pulse program. */
  function applyStar(R, kit, s, anim) {
    const N = s.nodes || {}, use = s.use || [], down = s.down || [], recv = s.recv || [], lead = s.lead || 0;
    const noMeter = !!s.nometer;
    /* spokes */
    REPL.forEach(id => {
      const sp = R.spoke[id], isDown = down.includes(id), on = use.includes(id);
      sp.line.style.stroke = isDown ? 'var(--bad)' : on ? 'var(--acc2)' : 'var(--mut)';
      sp.line.style.strokeWidth = on ? 4 : 2.5;
      if (isDown) sp.line.setAttribute('stroke-dasharray', '6 5'); else sp.line.removeAttribute('stroke-dasharray');
      sp.lab.set(isDown ? 'down' : s.lat === false ? '' : (s.lat && s.lat[id]) || LAT[id].ms + ' ms');
      sp.lab.el.style.fill = isDown ? 'var(--bad)' : 'var(--ink)';
    });
    R.clients.forEach(c => {
      const on = (s.cli || []).includes(c.id);
      R.cl[c.id].line.style.stroke = on ? 'var(--acc2)' : 'var(--mut)'; R.cl[c.id].line.style.strokeWidth = on ? 4 : 2.5;
    });
    /* replicas */
    REPL.forEach(id => {
      const n = N[id] || {}, nd = R.node[id], tn = TONE[down.includes(id) ? 'down' : (n.t || 'neutral')];
      const play = anim && recv.includes(id), dly = play ? lead + LAT[id].out : 0, val = n.v == null ? 'v1' : n.v;
      const vt = str => {
        if (!nd.vt[str]) { const t = kit.text(nd.g, { x: 0, y: 12, t: str, cls: 'sm', anchor: 'middle' }); t.el.style.transition = 'opacity .35s'; t.el.style.opacity = 0; nd.vt[str] = t; }
        return nd.vt[str];
      };
      vt(val);
      if (play && s.replay) {                           // replay: start again from the old picture, then apply on arrival
        nd.c.style.transition = 'none'; paint(nd.c, TONE.neutral);
        Object.keys(nd.vt).forEach(k => { nd.vt[k].el.style.transition = 'none'; nd.vt[k].el.style.opacity = k === (s.from || 'v1') ? 1 : 0; });
        flush(nd.c);
        nd.c.style.transition = 'fill .4s, stroke .4s'; Object.keys(nd.vt).forEach(k => { nd.vt[k].el.style.transition = 'opacity .35s'; });
      }
      nd.c.style.transitionDelay = dly + 'ms'; paint(nd.c, tn);
      Object.keys(nd.vt).forEach(k => { nd.vt[k].el.style.transitionDelay = dly + 'ms'; nd.vt[k].el.style.opacity = k === val ? 1 : 0; });
      nd.wr.style.opacity = (s.wset || []).includes(id) ? 1 : 0;
      nd.rr.style.opacity = (s.rset || []).includes(id) ? 1 : 0; nd.rr.style.stroke = s.rcol === 'bad' ? 'var(--bad)' : 'var(--acc2)';
      nd.note.set(n.note || ''); nd.note.el.style.fill = n.nt === 'bad' ? 'var(--bad)' : n.nt === 'ok' ? 'var(--ok)' : n.nt === 'warn' ? 'var(--warn)' : 'var(--ink)';
    });
    /* meter */
    R.gM.style.opacity = noMeter ? 0 : 1;
    R.mTitle.set(s.mt || 'Acks needed');
    const slots = s.slots || [];
    R.slots.forEach((sl, i) => {
      const sp = slots[i], tn = SLOT[sp ? sp.tone : 'empty'];
      const dly = anim && sp && sp.r ? (sp.back ? LAT[sp.r].back : arrive(sp.r, lead)) : 0;
      if (anim && s.replay) { sl.r.style.transition = 'none'; paint(sl.r, SLOT.empty); sl.t.el.style.transition = 'none'; sl.t.el.style.opacity = 0; flush(sl.r); sl.r.style.transition = 'fill .4s, stroke .4s'; sl.t.el.style.transition = 'opacity .4s'; }
      sl.r.style.transitionDelay = dly + 'ms'; sl.t.el.style.transitionDelay = dly + 'ms';
      paint(sl.r, tn); sl.t.set(sp ? sp.t : ''); sl.t.el.style.opacity = sp ? 1 : 0;
    });
    const need = s.need || 0;
    R.thr.style.opacity = need ? 1 : 0; R.thr.style.transform = `translate(${MX + need * 59 - 2.5}px, 0px)`;
    R.thrLab.set(need ? 'need ' + need : '');
    const vd = s.verdict;
    R.verdict.set(vd ? vd.t : ''); R.verdict.el.setAttribute('class', 'kt b' + (vd && vd.c ? ' tone-' + vd.c : ''));
    if (anim && s.replay) { R.verdict.el.style.transition = 'none'; R.verdict.el.style.opacity = 0; flush(R.verdict.el); }
    R.verdict.el.style.transition = 'opacity .4s'; R.verdict.el.style.transitionDelay = (anim && vd && vd.after ? vd.after : 0) + 'ms'; R.verdict.el.style.opacity = vd ? 1 : 0;
    /* client chips and the response chip */
    R.clients.forEach(c => { const q = (s.req && s.req[c.id]) || c; c.chip.set({ label: q.label, sub: q.sub || '', tone: q.tone || 'cursor', show: q.show !== false }); });
    const rs = s.res;
    if (anim && s.replay) { R.res.g.style.transition = 'none'; R.res.set({ show: false }); flush(R.res.g); R.res.g.style.transition = ''; }
    R.res.g.style.transitionDelay = (anim && rs && rs.after ? rs.after : 0) + 'ms';
    R.res.set(rs ? { show: true, label: rs.l, sub: rs.s || '', tone: rs.t === 'bad' ? 'info' : (rs.t || 'ok') } : { show: false });
    tintBad(R.res, !!rs && rs.t === 'bad');             // the chip kit has no red tone: tint the rect by hand
    const hn = s.hint;
    R.hint.set(hn ? { show: true, label: hn.l || 'hint for C', sub: hn.s || 'v2', tone: hn.t || 'warn' } : { show: false });
  }

  /* shared bits for the frame functions: pulses are only fired when the step changes */
  function starFrame(R, kit, s, ctx, plan) {
    const anim = R.prev.step !== undefined && R.prev.step !== ctx.step && !!s.play;
    applyStar(R, kit, s, anim);
    if (anim) fire(R, kit, plan(s));
    else if (R.prev.step !== ctx.step) fire(R, kit, []);
    R.prev.step = ctx.step;
  }

  /* ---------------------------------------------------------------- 1. ONE, QUORUM, ALL: the threshold moves */
  const FOOT_1 = 'Simplified: ack times 2, 5 and 40 ms are illustrative; pulse speed is not to scale.';
  const FOOT_2 = 'Simplified: RF = 3, replica C down; ack times and v1/v2 are illustrative.';
  const FOOT_3 = 'Simplified: RF = 3; versions and the replica a read picks are illustrative.';
  const V1 = { A: { v: 'v1' }, B: { v: 'v1' }, C: { v: 'v1' } };
  const V2 = { A: { v: 'v2', t: 'ok' }, B: { v: 'v2', t: 'ok' }, C: { v: 'v2', t: 'ok' } };
  const ALL3 = ['A', 'B', 'C'];
  const slots1 = need => ['A', 'B', 'C'].map((r, i) => ({ r, t: r + ' ' + LAT[r].ms + ' ms', tone: i < need ? 'ok' : 'late' }));
  const okAfter = need => arrive(['A', 'B', 'C'][need - 1], CLEG) + CLEG;
  const lvl = (name, need, extra) => Object.assign({
    nodes: V2, use: ALL3, cli: ['cli'], recv: ALL3, replay: true, lead: CLEG, play: 'race', need,
    req: { cli: { label: 'UPDATE', sub: 'CL = ' + name } }, slots: slots1(need),
    res: { l: 'OK', s: 'after ' + LAT[['A', 'B', 'C'][need - 1]].ms + ' ms', t: 'ok', after: okAfter(need) },
    verdict: { t: 'OK after ' + LAT[['A', 'B', 'C'][need - 1]].ms + ' ms', c: 'ok', after: okAfter(need) - CLEG },
    h: { l: 'RF 3 · CL ' + name + ' · need ' + need, r: 'OK after ' + LAT[['A', 'B', 'C'][need - 1]].ms + ' ms' }
  }, extra || {});
  const ackRace = {
    id: 'ack-race', label: 'ONE, QUORUM, ALL', desc: 'One write, three levels. The level is only the height of a threshold on a meter that the acks fill; the slowest spoke sets the pace of ALL.',
    codeLabel: 'CQL', code: { bug: ['CONSISTENCY ONE;      -- wait for 1 of 3 acks', 'CONSISTENCY QUORUM;   -- wait for 2 of 3 acks', 'CONSISTENCY ALL;      -- wait for 3 of 3 acks', 'UPDATE orders SET price = 13.00 WHERE order_id = 981;'] },
    stage: {
      w: W, h: H, footer: FOOT_1,
      header: s => ({ left: (s.h && s.h.l) || 'RF = 3 · 3 replicas up', right: (s.h && s.h.r) || '' }),
      setup(kit) {
        const R = buildStar(kit);
        R.bars = kit.bars(null, { x: MX, y: 224, w: 184, labelW: 66, rowH: 28, max: 40, unit: ' ms', title: 'Time to OK (illustrative)', items: [{ id: 'ONE', label: 'ONE' }, { id: 'QUORUM', label: 'QUORUM' }, { id: 'ALL', label: 'ALL' }] });
        return R;
      },
      frame(s, kit, R, ctx) {
        starFrame(R, kit, s, ctx, st => {
          if (st.play === 'req') return [{ a: 'cli', b: 'hub', ms: CLEG, tone: 'req', hold: true }];
          if (st.play === 'out') return trip('cli', ALL3, 0, { acks: false });
          return trip('cli', ALL3, st.need);
        });
        const T = s.bars || {};
        [['ONE', 'ok'], ['QUORUM', 'ok'], ['ALL', 'warn']].forEach(([id, tn]) => R.bars.set(id, T[id] || 0, tn, T[id] ? T[id] + ' ms' : '-'));
      }
    },
    bug: [
      { log: 'One node acts as the coordinator and sits at the hub. It has one spoke to each of the three replicas of the row. The time on each spoke is how long that replica takes to answer (illustrative).',
        callout: 'Coordinator at the hub, three replicas on spokes', code: 3,
        state: { nodes: V1, use: [], h: { l: 'RF = 3 · 3 replicas up', r: 'idle' }, req: { cli: { label: 'client', sub: 'CQL' } } },
        stats: [{ l: 'replicas', v: '3' }, { l: 'coordinator', v: 'any node' }] },
      { log: 'The client sends UPDATE price to a node. That node becomes the coordinator for this request. The consistency level is not chosen yet.',
        callout: 'Any node can be the coordinator', code: 3,
        state: { nodes: V1, use: [], cli: ['cli'], play: 'req', req: { cli: { label: 'UPDATE', sub: 'CL = ?' } }, h: { l: 'RF = 3 · 3 replicas up', r: 'request arrives' } },
        stats: [{ l: 'replicas', v: '3' }, { l: 'acks counted', v: '0' }] },
      { log: 'The coordinator sends the mutation on all three spokes at once, not only on as many as it needs. Each replica applies v2 when the pulse arrives.',
        callout: 'The mutation goes out on all three spokes', code: 3,
        state: { nodes: V2, use: ALL3, cli: ['cli'], play: 'out', recv: ALL3, replay: true, lead: CLEG, req: { cli: { label: 'UPDATE', sub: 'CL = ?' } }, h: { l: 'RF = 3 · sent to 3 of 3', r: 'v2 on its way' } },
        stats: [{ l: 'sent to', v: '3 of 3', cls: 'ok' }, { l: 'acks counted', v: '0' }] },
      { log: 'Level ONE: the threshold sits at 1. Replica A is the fastest spoke, so its ack arrives first and the coordinator answers the client after 2 ms. The acks from B and C still come, but nobody waits for them.',
        callout: 'ONE: threshold at 1, OK after 2 ms', code: 0,
        state: lvl('ONE', 1, { bars: { ONE: 2 } }),
        stats: [{ l: 'need', v: '1', cls: 'ok' }, { l: 'client waits', v: '2 ms', cls: 'ok' }] },
      { log: 'Level QUORUM: the threshold slides to 2, a majority of 3. The coordinator now also waits for B, so the client gets OK after 5 ms. C is still on its way.',
        callout: 'QUORUM: threshold slides to 2, OK after 5 ms', code: 1,
        state: lvl('QUORUM', 2, { bars: { ONE: 2, QUORUM: 5 } }),
        stats: [{ l: 'need', v: '2', cls: 'ok' }, { l: 'client waits', v: '5 ms', cls: 'ok' }] },
      { log: 'Level ALL: the threshold slides to 3. The coordinator must wait for the slowest spoke, C, which takes 40 ms. One slow replica now sets the pace for every write.',
        callout: 'ALL: threshold at 3, the slowest spoke decides', moment: true, code: 2,
        state: lvl('ALL', 3, { bars: { ONE: 2, QUORUM: 5, ALL: 40 } }),
        stats: [{ l: 'need', v: '3', cls: 'warn' }, { l: 'client waits', v: '40 ms', cls: 'warn' }] },
      { log: 'The same mutation went to all three replicas in every run. The level changed how long the client waited, not where the data went.',
        callout: 'The level changes the wait, not where data goes', code: 3,
        state: { nodes: V2, use: [], need: 3, slots: slots1(3), bars: { ONE: 2, QUORUM: 5, ALL: 40 }, h: { l: 'RF = 3 · all runs', r: '2 ms · 5 ms · 40 ms' },
          req: { cli: { label: 'UPDATE', sub: 'any level' } }, verdict: { t: 'wait grows with CL', c: 'warn' } },
        stats: [{ l: 'ONE', v: '2 ms', cls: 'ok' }, { l: 'QUORUM', v: '5 ms', cls: 'ok' }, { l: 'ALL', v: '40 ms', cls: 'warn' }],
        takeaway: 'A level is a wait count. ONE answers on the first ack and ALL waits for the slowest replica.' }
    ]
  };

  /* ---------------------------------------------------------------- 2. A replica is down: QUORUM still counts to 2, ALL cannot count to 3 */
  const NQ0 = { A: { v: 'v1' }, B: { v: 'v1' }, C: { v: 'v1' } };
  const NQ1 = { A: { v: 'v2', t: 'ok' }, B: { v: 'v2', t: 'ok' }, C: { v: 'v1', note: 'missed v2', nt: 'warn' } };
  const NQ2 = { A: { v: 'v2', t: 'ok' }, B: { v: 'v2', t: 'ok' }, C: { v: 'v2', t: 'ok' } };
  const live = (a, b, c, tone) => [{ t: a, tone: tone[0] }, { t: b, tone: tone[1] }, { t: c, tone: tone[2] }];
  const planQD = st => {
    switch (st.play) {
      case 'req': return [{ a: 'cli', b: 'hub', ms: CLEG, tone: 'req', hold: true }];
      case 'fail': return [{ a: 'hub', b: 'cli', ms: CLEG, tone: 'bad' }];
      case 'fail2': return [{ a: 'cli', b: 'hub', ms: CLEG, tone: 'req' }, { a: 'hub', b: 'cli', ms: CLEG, delay: CLEG, tone: 'bad' }];
      case 'out2': return [{ a: 'cli', b: 'hub', ms: CLEG, tone: 'req' }, { a: 'hub', b: 'A', ms: LAT.A.out, delay: CLEG, tone: 'req' },
        { a: 'hub', b: 'B', ms: LAT.B.out, delay: CLEG, tone: 'req' }, { a: 'hub', b: 'hint', ms: 520, delay: CLEG, tone: 'hint' }];
      case 'acks': return [{ a: 'A', b: 'hub', ms: LAT.A.back, tone: 'ack' }, { a: 'B', b: 'hub', ms: LAT.B.back, tone: 'ack' },
        { a: 'hub', b: 'cli', ms: CLEG, delay: LAT.B.back, tone: 'ack' }];
      case 'hintback': return [{ a: 'hint', b: 'C', ms: LAT.C.out, tone: 'hint' }];
      default: return [];
    }
  };
  const quorumDown = {
    id: 'quorum-down', label: 'A replica is down', desc: 'Replica C is down. QUORUM still gets its 2 acks from A and B, but ALL needs all 3 replicas and fails at once.',
    codeLabel: 'CQL', code: { bug: ['CONSISTENCY ALL;      -- needs 3 live replicas', 'CONSISTENCY QUORUM;   -- needs 2 live replicas', 'UPDATE orders SET price = 13.00 WHERE order_id = 981;', '-- nodetool status shows replica C as DN (down)'] },
    stage: {
      w: W, h: H, footer: FOOT_2,
      header: s => ({ left: (s.h && s.h.l) || 'RF = 3 · replica C down', right: (s.h && s.h.r) || '' }),
      setup(kit) {
        const R = buildStar(kit);
        R.bars = kit.bars(null, { x: MX, y: 236, w: 184, labelW: 66, rowH: 26, max: 3, title: 'Replicas that may be down', items: [{ id: 'ONE', label: 'ONE' }, { id: 'QUORUM', label: 'QUORUM' }, { id: 'ALL', label: 'ALL' }] });
        R.barsG = R.bars.g; R.barsG.style.transition = 'opacity .5s';
        return R;
      },
      frame(s, kit, R, ctx) {
        starFrame(R, kit, s, ctx, planQD);
        const B = s.tol;
        R.barsG.style.opacity = B ? 1 : 0;
        [['ONE', 2, 'ok'], ['QUORUM', 1, 'ok'], ['ALL', 0, 'bad']].forEach(([id, v, tn]) => R.bars.set(id, B ? v : 0, tn, B ? String(v) : ''));
      }
    },
    bug: [
      { log: 'Replica C restarts, so only A and B are alive. The row still has three replicas (RF = 3), and the coordinator already knows that C is down.',
        callout: 'Replica C is down: 2 of 3 replicas are alive', code: 3,
        state: { nodes: NQ0, down: ['C'], use: [], nometer: true, h: { l: 'RF = 3 · replica C down', r: 'C is restarting' }, req: { cli: { label: 'client', sub: 'CQL' } } },
        stats: [{ l: 'replicas alive', v: '2 of 3', cls: 'warn' }, { l: 'replication factor', v: '3' }] },
      { log: 'The client sends UPDATE at ALL. The threshold sits at 3, so the coordinator first counts live replicas: A and B are up, C is down, and 2 is less than 3.',
        callout: 'ALL needs 3 live replicas: only 2 are alive', code: 0,
        state: { nodes: NQ0, down: ['C'], use: [], cli: ['cli'], play: 'req', need: 3, mt: 'Live replicas · need 3', replay: true,
          slots: live('A up', 'B up', 'C down', ['ok', 'ok', 'bad']), verdict: { t: '2 alive < 3 needed', c: 'bad', after: CLEG },
          req: { cli: { label: 'UPDATE', sub: 'CL = ALL' } }, h: { l: 'RF = 3 · CL ALL · need 3', r: 'counting live replicas' } },
        stats: [{ l: 'need', v: '3' }, { l: 'alive', v: '2', cls: 'warn' }] },
      { log: 'The coordinator answers at once with Unavailable and sends the mutation to no replica, so A and B still hold v1. The error is fast because nobody waited for C.',
        callout: 'ALL fails at once: Unavailable, nothing written', code: 0,
        state: { nodes: NQ0, down: ['C'], use: [], cli: ['cli'], play: 'fail', need: 3, mt: 'Live replicas · need 3', replay: true,
          slots: live('A up', 'B up', 'C down', ['ok', 'ok', 'bad']), verdict: { t: 'ALL fails: 2 < 3', c: 'bad' },
          res: { l: 'Unavailable', s: 'need 3, alive 2', t: 'bad', after: CLEG }, req: { cli: { label: 'UPDATE', sub: 'CL = ALL' } }, h: { l: 'RF = 3 · CL ALL · need 3', r: 'Unavailable' } },
        stats: [{ l: 'result', v: 'Unavailable', cls: 'bad' }, { l: 'replicas written', v: '0', cls: 'bad' }] },
      { log: 'The same write at QUORUM: the threshold slides to 2 and two live replicas are enough. The mutation goes to A and B, and the coordinator keeps a hint for C.',
        callout: 'QUORUM: the threshold slides to 2, A and B suffice', code: 1,
        state: { nodes: NQ1, down: ['C'], use: ['A', 'B'], cli: ['cli'], play: 'out2', recv: ['A', 'B'], replay: true, lead: CLEG, need: 2, mt: 'Live replicas · need 2',
          slots: live('A up', 'B up', 'C down', ['ok', 'ok', 'bad']), verdict: { t: '2 alive ≥ 2 needed', c: 'ok', after: CLEG }, hint: { l: 'hint for C', s: 'v2' },
          req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · CL QUORUM · need 2', r: 'sent to A and B' } },
        stats: [{ l: 'need', v: '2', cls: 'ok' }, { l: 'alive', v: '2', cls: 'ok' }, { l: 'hints kept', v: '1', cls: 'warn' }] },
      { log: 'A acks after 2 ms and B after 5 ms. Two acks meet the threshold, so the client gets OK after 5 ms. C never has to answer.',
        callout: 'QUORUM still succeeds with 2 of 3 acks', moment: true, code: 1,
        state: { nodes: NQ1, down: ['C'], use: ['A', 'B'], cli: ['cli'], play: 'acks', replay: true, need: 2, mt: 'Acks needed', hint: { l: 'hint for C', s: 'v2' },
          slots: [{ r: 'A', back: true, t: 'A 2 ms', tone: 'ok' }, { r: 'B', back: true, t: 'B 5 ms', tone: 'ok' }, { t: 'C down', tone: 'bad' }],
          verdict: { t: 'OK after 5 ms', c: 'ok', after: LAT.B.back }, res: { l: 'OK', s: '2 of 3 acks', t: 'ok', after: LAT.B.back + CLEG },
          req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · CL QUORUM · need 2', r: 'OK after 5 ms' } },
        stats: [{ l: 'acks', v: '2 of 3', cls: 'ok' }, { l: 'client waits', v: '5 ms', cls: 'ok' }] },
      { log: 'The rule is subtraction. At RF = 3, a level that waits for N acks survives RF - N down replicas: ONE can lose two, QUORUM one, ALL none.',
        callout: 'Replicas that may be down = RF minus the wait count', code: 1,
        state: { nodes: NQ1, down: ['C'], use: [], need: 2, tol: true, mt: 'Acks needed', hint: { l: 'hint for C', s: 'v2' },
          slots: [{ t: 'A 2 ms', tone: 'ok' }, { t: 'B 5 ms', tone: 'ok' }, { t: 'C down', tone: 'bad' }], verdict: { t: 'OK after 5 ms', c: 'ok' },
          res: { l: 'OK', s: '2 of 3 acks', t: 'ok' }, req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · wait count N', r: 'RF - N may be down' } },
        stats: [{ l: 'ONE', v: '2 may be down', cls: 'ok' }, { l: 'QUORUM', v: '1 may be down', cls: 'ok' }, { l: 'ALL', v: '0 may be down', cls: 'bad' }] },
      { log: 'If B goes down too, only A is alive. QUORUM needs 2 and fails with Unavailable as well: the budget of one failure at QUORUM is spent.',
        callout: 'Two replicas down: QUORUM cannot reach 2', code: 1,
        state: { nodes: NQ1, down: ['B', 'C'], use: [], cli: ['cli'], play: 'fail2', replay: true, need: 2, tol: true, mt: 'Live replicas · need 2', hint: { l: 'hint for C', s: 'v2' },
          slots: live('A up', 'B down', 'C down', ['ok', 'bad', 'bad']), verdict: { t: '1 alive < 2 needed', c: 'bad', after: CLEG },
          res: { l: 'Unavailable', s: 'need 2, alive 1', t: 'bad', after: CLEG * 2 }, req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · CL QUORUM · need 2', r: 'Unavailable' } },
        stats: [{ l: 'alive', v: '1', cls: 'bad' }, { l: 'need', v: '2' }, { l: 'result', v: 'Unavailable', cls: 'bad' }] },
      { log: 'B and C come back. Inside max_hint_window_in_ms (3 hours by default) the coordinator replays its hint, so C catches up to v2 without a repair.',
        callout: 'C returns: the hint replays and C gets v2', code: 3,
        state: { nodes: NQ2, down: [], use: [], play: 'hintback', recv: ['C'], replay: true, from: 'v1', lead: 0, tol: true, nometer: true, hint: { l: 'hint for C', s: 'replayed', t: 'ok' },
          h: { l: 'RF = 3 · all replicas up', r: 'hint replayed' }, req: { cli: { label: 'client', sub: 'CQL' } } },
        stats: [{ l: 'replicas alive', v: '3 of 3', cls: 'ok' }, { l: 'C holds', v: 'v2', cls: 'ok' }],
        takeaway: 'At RF = 3, QUORUM survives one down replica and ALL none. A short outage heals by hint; a long one needs repair.' }
    ]
  };

  /* ---------------------------------------------------------------- 3. Stale read: when the write set and the read set do not meet */
  const IDS = ['A', 'B', 'C'];
  /* overlap strip: one cell per replica, a blue bar above it when it is in the write set W, an orange bar below when it is in the read set R */
  function buildOverlap(kit) {
    const el = kit.el, g = el('g', null, kit.layer); g.style.transition = 'opacity .45s'; g.style.opacity = 0;
    kit.text(g, { x: MX, y: 84, t: 'Write set W, read set R', cls: 'sm mut' });
    const trans = 'fill .4s, stroke .4s, opacity .4s';
    const cells = IDS.map((id, i) => {
      const x = MX + i * 59;
      const wb = el('rect', { x, y: 92, width: 54, height: 9, rx: 4 }, g), c = el('rect', { x, y: 106, width: 54, height: 32, rx: 9 }, g), rb = el('rect', { x, y: 143, width: 54, height: 9, rx: 4 }, g);
      wb.style.fill = 'var(--acc)'; rb.style.fill = 'var(--acc2)'; wb.style.transition = rb.style.transition = 'opacity .4s'; c.style.transition = trans; c.style.strokeWidth = 2;
      const t = kit.text(g, { x: x + 27, y: 126, t: '', cls: 'sm b', anchor: 'middle' });
      return { wb, c, rb, t };
    });
    kit.text(g, { x: MX - 6, y: 101, t: 'W', cls: 'sm b', anchor: 'end' }).el.style.fill = 'var(--acc)';
    kit.text(g, { x: MX - 6, y: 152, t: 'R', cls: 'sm b', anchor: 'end' }).el.style.fill = 'var(--acc2)';
    const l1 = kit.text(g, { x: MX, y: 175, t: '', cls: 'b' }), l2 = kit.text(g, { x: MX, y: 192, t: '', cls: 'sm b' });
    return {
      set(o) {
        g.style.opacity = o.show ? 1 : 0;
        const W = o.w || [], Rd = o.r || [], V = o.v || {};
        cells.forEach((cl, i) => {
          const id = IDS[i], inW = W.includes(id), inR = Rd.includes(id), both = inW && inR;
          cl.wb.style.opacity = inW ? 1 : 0.1; cl.rb.style.opacity = inR ? 1 : 0.1;
          cl.c.style.fill = both ? 'color-mix(in srgb, var(--ok) 40%, var(--card))' : inR && V[id] === 'v1' ? 'color-mix(in srgb, var(--warn) 34%, var(--card))' : 'var(--card)';
          cl.c.style.stroke = both ? 'var(--ok)' : inR && V[id] === 'v1' ? 'var(--warn)' : 'var(--line)';
          cl.t.set(V[id] ? id + ' ' + V[id] : id);
        });
        l1.set(o.l1 || ''); l2.set(o.l2 || '');
        const col = o.tone === 'bad' ? 'var(--bad)' : o.tone === 'ok' ? 'var(--ok)' : o.tone === 'warn' ? 'var(--warn)' : 'var(--ink)';
        l1.el.style.fill = 'var(--ink)'; l2.el.style.fill = col;
      }
    };
  }
  const planSR = st => {
    switch (st.play) {
      case 'wr': return trip('cli', ['A', 'B'], 2);
      case 'rd': {
        const tg = st.rd, stale = st.stale || [], legs = [{ a: 'cli', b: 'hub', ms: CLEG, tone: 'req' }];
        tg.forEach(id => { legs.push({ a: 'hub', b: id, ms: LAT[id].out, delay: CLEG, tone: 'req' }); legs.push({ a: id, b: 'hub', ms: LAT[id].back, delay: CLEG + LAT[id].out, tone: stale.includes(id) ? 'bad' : 'ack' }); });
        const last = Math.max(...tg.map(id => LAT[id].out + LAT[id].back));
        legs.push({ a: 'hub', b: 'cli', ms: CLEG, delay: CLEG + last, tone: st.rtone || 'ack' });
        return legs;
      }
      case 'repair': return [{ a: 'A', b: 'C', ms: LAT.C.out, tone: 'info' }];
      default: return [];
    }
  };
  const rdAfter = tg => CLEG * 2 + Math.max(...tg.map(id => LAT[id].out + LAT[id].back));
  const NS0 = { A: { v: 'v1' }, B: { v: 'v1' }, C: { v: 'v1' } };
  const NS1 = { A: { v: 'v2', t: 'ok' }, B: { v: 'v2', t: 'ok' }, C: { v: 'v1', note: 'missed v2', nt: 'warn' } };
  const NS2 = { A: { v: 'v2', t: 'ok' }, B: { v: 'v2', t: 'ok' }, C: { v: 'v1', t: 'stale', note: 'still v1', nt: 'warn' } };
  const VV = { A: 'v2', B: 'v2', C: 'v1' };
  const PAIRS = { w1r1: 2, w2r1: 3, w2r2: 4, w3r1: 4 };
  const staleRead = {
    id: 'stale-read', label: 'Stale read, no overlap', desc: 'Replica C missed a QUORUM write. A ONE read can land on C and return the old price; a QUORUM read cannot, because 2 + 2 is more than 3.',
    codeLabel: 'CQL', code: { bug: ['CONSISTENCY QUORUM;   -- write set W = 2 replicas', 'CONSISTENCY ONE;      -- read set R = 1 replica', 'CONSISTENCY QUORUM;   -- read set R = 2, and 2 + 2 > 3', 'SELECT price FROM orders WHERE order_id = 981;', '-- shell: nodetool repair ks_orders   (brings C back to v2)'] },
    stage: {
      w: W, h: H, footer: FOOT_3,
      header: s => ({ left: (s.h && s.h.l) || 'RF = 3', right: (s.h && s.h.r) || '' }),
      setup(kit) {
        const R = buildStar(kit);
        R.ov = buildOverlap(kit);
        R.pairs = kit.bars(null, { x: 432, y: 236, w: 192, labelW: 54, rowH: 22, max: 4, title: 'R + W against RF = 3', items: [{ id: 'w1r1', label: 'W1+R1' }, { id: 'w2r1', label: 'W2+R1' }, { id: 'w2r2', label: 'W2+R2' }, { id: 'w3r1', label: 'W3+R1' }] });
        R.pairsG = kit.el('g', null, kit.layer); R.pairsG.style.transition = 'opacity .5s';
        R.pairs.g.parentNode.appendChild(R.pairsG);
        R.pairsG.appendChild(R.pairs.g);
        const thrX = 432 + 54 + (192 - 54 - 46 - 8) * 3 / 4;
        const ln = kit.el('line', { x1: thrX, y1: 236, x2: thrX, y2: 318 }, R.pairsG); ln.style.stroke = 'var(--acc2)'; ln.style.strokeWidth = 2; ln.setAttribute('stroke-dasharray', '4 3');
        kit.text(R.pairsG, { x: thrX, y: 330, t: 'RF = 3', cls: 'xs b', anchor: 'middle' });
        return R;
      },
      frame(s, kit, R, ctx) {
        starFrame(R, kit, s, ctx, planSR);
        R.ov.set(s.ov || {});
        const P = s.pairs || {};
        R.pairsG.style.opacity = s.pairs ? 1 : 0;
        [['w1r1', '2 ≤ 3'], ['w2r1', '3 ≤ 3'], ['w2r2', '4 > 3'], ['w3r1', '4 > 3']].forEach(([id, lab]) => R.pairs.set(id, P[id] ? PAIRS[id] : 0, PAIRS[id] > 3 ? 'ok' : 'bad', P[id] ? lab : ''));
      }
    },
    bug: [
      { log: 'Order 981 has the price v1 on all three replicas. Two sets matter from now on: the replicas a write waits for (W), and the replicas a read asks (R).',
        callout: 'Three replicas, all holding price v1', code: 3,
        state: { nodes: NS0, use: [], nometer: true, h: { l: 'RF = 3 · price v1 on all 3', r: 'before the update' }, req: { cli: { label: 'client', sub: 'CQL' } }, ov: { show: true, v: { A: 'v1', B: 'v1', C: 'v1' }, l1: 'W = ?   R = ?', l2: 'RF = 3 replicas' } },
        stats: [{ l: 'replicas', v: '3' }, { l: 'price', v: 'v1 everywhere' }] },
      { log: 'C restarts while the price is updated to v2 at QUORUM. The coordinator waits for 2 acks (A and B), answers OK after 5 ms, and C misses the write.',
        callout: 'Write at QUORUM: W = {A, B}, and C missed it', code: 0,
        state: { nodes: NS1, down: ['C'], use: ['A', 'B'], cli: ['cli'], play: 'wr', recv: ['A', 'B'], replay: true, lead: CLEG, nometer: true, wset: ['A', 'B'],
          res: { l: 'OK', s: 'after 5 ms', t: 'ok', after: okAfter(2) }, req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · CL QUORUM · W = 2', r: 'OK after 5 ms' },
          ov: { show: true, w: ['A', 'B'], v: VV, l1: 'W = 2 (A, B)', l2: 'C is down and misses v2', tone: 'warn' } },
        stats: [{ l: 'write acks', v: '2 of 3', cls: 'ok' }, { l: 'client waits', v: '5 ms', cls: 'ok' }, { l: 'replicas on v2', v: '2 of 3', cls: 'warn' }] },
      { log: 'C is back up, but its hint has not replayed yet, so it still holds v1. Nothing is broken and nothing is logged: the replicas simply disagree.',
        callout: 'C is back, still holding v1: the replicas disagree', code: 0,
        state: { nodes: NS2, use: [], nometer: true, wset: ['A', 'B'], res: { l: 'OK', s: 'after 5 ms', t: 'ok' }, req: { cli: { label: 'UPDATE', sub: 'CL = QUORUM' } },
          h: { l: 'RF = 3 · C back up', r: 'C still holds v1' }, ov: { show: true, w: ['A', 'B'], v: VV, l1: 'W = 2 (A, B)', l2: 'C holds v1', tone: 'warn' } },
        stats: [{ l: 'replicas on v2', v: '2 of 3', cls: 'warn' }, { l: 'replicas on v1', v: '1 of 3', cls: 'bad' }] },
      { log: 'A read at ONE asks one replica, and the coordinator picks C. C answers v1, so the customer sees the old price. R + W = 1 + 2 = 3 is not more than RF = 3, so the sets can miss.',
        callout: 'A ONE read picks C: the sets miss, stale v1', moment: true, code: 1,
        state: { nodes: NS2, use: ['C'], cli: ['cli'], play: 'rd', rd: ['C'], stale: ['C'], rtone: 'bad', nometer: true, wset: ['A', 'B'], rset: ['C'], rcol: 'bad',
          res: { l: 'price v1', s: 'stale reply', t: 'bad', after: rdAfter(['C']) }, req: { cli: { label: 'SELECT', sub: 'CL = ONE' } }, h: { l: 'RF = 3 · CL ONE · R = 1', r: 'client sees v1' },
          ov: { show: true, w: ['A', 'B'], r: ['C'], v: VV, l1: 'R + W = 1 + 2 = 3', l2: '3 ≤ RF 3: no shared replica', tone: 'bad' }, pairs: { w2r1: 1 } },
        stats: [{ l: 'client sees', v: 'v1 (stale)', cls: 'bad' }, { l: 'R + W', v: '3 ≤ RF 3', cls: 'bad' }] },
      { log: 'Refresh, and the same ONE read may pick A instead. A answers v2. Same statement, different answer: that is the two prices that support sees.',
        callout: 'Same ONE read, another replica: v2 by luck, not by rule', code: 1,
        state: { nodes: NS2, use: ['A'], cli: ['cli'], play: 'rd', rd: ['A'], nometer: true, wset: ['A', 'B'], rset: ['A'],
          res: { l: 'price v2', s: 'fresh reply', t: 'ok', after: rdAfter(['A']) }, req: { cli: { label: 'SELECT', sub: 'CL = ONE' } }, h: { l: 'RF = 3 · CL ONE · R = 1', r: 'client sees v2' },
          ov: { show: true, w: ['A', 'B'], r: ['A'], v: VV, l1: 'R + W = 1 + 2 = 3', l2: 'sets meet only by luck', tone: 'warn' }, pairs: { w2r1: 1 } },
        stats: [{ l: 'client sees', v: 'v2 (fresh)', cls: 'ok' }, { l: 'guaranteed', v: 'no', cls: 'bad' }] },
      { log: 'A read at QUORUM asks 2 replicas. Even the worst pair, B and C, contains B, which has v2. C says v1, B says v2, and the higher timestamp wins: the client gets v2.',
        callout: 'QUORUM read: B sits in both sets, so v2 wins', code: 2,
        state: { nodes: NS2, use: ['B', 'C'], cli: ['cli'], play: 'rd', rd: ['B', 'C'], stale: ['C'], nometer: true, wset: ['A', 'B'], rset: ['B', 'C'],
          res: { l: 'price v2', s: 'newest wins', t: 'ok', after: rdAfter(['B', 'C']) }, req: { cli: { label: 'SELECT', sub: 'CL = QUORUM' } }, h: { l: 'RF = 3 · CL QUORUM · R = 2', r: 'client sees v2' },
          ov: { show: true, w: ['A', 'B'], r: ['B', 'C'], v: VV, l1: 'R + W = 2 + 2 = 4', l2: '4 > RF 3: the sets meet', tone: 'ok' }, pairs: { w2r1: 1, w2r2: 1 } },
        stats: [{ l: 'client sees', v: 'v2 (fresh)', cls: 'ok' }, { l: 'R + W', v: '4 > RF 3', cls: 'ok' }] },
      { log: 'Count it in numbers: when R + W is more than RF, any read set must share a replica with any write set. W1 + R1 and W2 + R1 can miss; W2 + R2 and W3 + R1 cannot.',
        callout: 'R + W > RF means the two sets always meet', code: 2,
        state: { nodes: NS2, use: [], nometer: true, wset: ['A', 'B'], req: { cli: { label: 'client', sub: 'CQL' } }, h: { l: 'RF = 3 · R + W against RF', r: 'overlap needs R + W > 3' },
          ov: { show: true, w: ['A', 'B'], v: VV, l1: 'W = 2 (A, B)', l2: 'a QUORUM read always meets W', tone: 'ok' }, pairs: { w1r1: 1, w2r1: 1, w2r2: 1, w3r1: 1 } },
        stats: [{ l: 'W2 + R1', v: '3, can miss', cls: 'bad' }, { l: 'W2 + R2', v: '4, always meets', cls: 'ok' }] },
      { log: 'nodetool repair copies v2 to C. Until then, a ONE read can still hit C and return v1; after the repair all three replicas agree again.',
        callout: 'Repair brings C back to v2: all three agree', code: 4,
        state: { nodes: NQ2, use: [], play: 'repair', recv: ['C'], replay: true, from: 'v1', lead: 0, nometer: true, res: null, req: { cli: { label: 'client', sub: 'CQL' } },
          h: { l: 'RF = 3 · after repair', r: 'v2 on all 3' }, ov: { show: true, v: { A: 'v2', B: 'v2', C: 'v2' }, l1: 'W = 3 after repair', l2: 'every replica holds v2', tone: 'ok' }, pairs: { w1r1: 1, w2r1: 1, w2r2: 1, w3r1: 1 } },
        stats: [{ l: 'replicas on v2', v: '3 of 3', cls: 'ok' }, { l: 'ONE read', v: 'fresh now', cls: 'ok' }],
        takeaway: 'Freshness needs R + W > RF. A QUORUM write with a ONE read can miss; QUORUM on both sides cannot.' }
    ]
  };

  /* ---------------------------------------------------------------- scenarios exported below */
  const SCENARIOS = [ackRace, quorumDown, staleRead];

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[1] = { explain: EXPLAIN(), scenarios: SCENARIOS };

  function EXPLAIN() {
    return `
<h3>1. A consistency level is a count of acknowledgements</h3>
<p>Every write goes to all replicas of the row. The consistency level (CL) only says how many of them must answer before the client gets OK. Reads use the same kind of count. Whether a read can be stale depends on one question: do the set of replicas that answered the write and the set that answers the read share a member? The coordinator is simply the node that receives the request and does the counting. It can be any node in the cluster. The level belongs to each statement, so two requests for the same row can be as strong or as weak as their own levels allow.</p>

<h3>2. One write, step by step</h3>
<p>The client sends CQL with a consistency level to any node. The coordinator hashes the partition key, finds the replicas from the ring, and sends the mutation to <em>all</em> of them in parallel. It then counts acknowledgements until the CL is met. The replicas that are slow or down do not block the answer. The client gets OK when the count is met, not when every replica has the write.</p>
<figure class="mm" aria-label="Sequence diagram: a QUORUM write goes to three replicas, two acknowledge, the coordinator replies OK, and a later ONE read lands on the stale replica" style="--diagram-width:620.00px">
  <img src="diagrams/ch01-quorum-sequence.svg" alt="Sequence diagram: the client sends UPDATE at QUORUM to the coordinator, which sends the mutation to replicas A, B and C. C is down. A and B acknowledge, so the coordinator stores a hint for C and replies OK. Later a read at ONE reaches C, which still holds v1.">
  <figcaption>Sequence (Mermaid source: diagrams/ch01-quorum-sequence.mmd): two acks meet QUORUM. The hint for C and the later ONE read are shown too.</figcaption>
</figure>

<h3>3. The overlap rule</h3>
<p>With replication factor RF, a write that waits for W replicas and a read that asks R replicas overlap whenever R + W is greater than RF. With RF = 3, QUORUM is 2 of 3, so 2 + 2 is greater than 3 and every read set shares a replica with every write set. <code>ONE</code> needs 1 answer and <code>ALL</code> needs all 3, and <code>LOCAL_QUORUM</code> applies the quorum inside the local datacenter. A ONE write with a ONE read has no guarantee at all, because 1 + 1 is not greater than 3. Overlap decides freshness. It does not decide speed: a higher CL waits for more replicas, so it answers later and becomes unavailable sooner when nodes fail.</p>
<p>The arithmetic holds for any RF. With RF = 5, QUORUM is 3, and 3 + 3 is greater than 5. The danger is changing one side only: a QUORUM write paired with a ONE read on RF = 3 is exactly the case where the two sets need not meet, and nothing in the statement warns about it.</p>

<h3>4. A replica that missed the write</h3>
<p>A replica that is down misses the mutation. While it is down for less than <code>max_hint_window_in_ms</code>, which is 3 hours by default, the coordinator stores a hint and replays it when the replica returns. After the window closes, hints stop, and only repair can bring the replica back to the current value. A stale replica stays stale on every read at ONE until one of the two happens.</p>
<p>A restart shorter than the window costs little, because the hints replay. A rack that stays down for a day loses its hints, so its replicas need repair before reads at ONE can be trusted to be current.</p>

<h3>5. Timestamps decide conflicts</h3>
<p>Each cell carries a write timestamp, and when two versions meet, the higher timestamp wins. The arrival order does not count. Overlap guarantees that the newest acknowledged value is among the replies, and timestamps pick it out. Timestamps only order writes that the clocks describe correctly, so the clocks are part of the design. Timestamps come from the writers’ clocks, so a writer whose clock runs ahead keeps winning against later writes from writers with correct clocks. Nothing in the cluster reports this as an error.</p>

<h3>6. The syntax, in one place</h3>
<pre>-- cqlsh: the level for this session
CONSISTENCY QUORUM;
CONSISTENCY ONE;

-- a read at LOCAL_QUORUM in the local datacenter
CONSISTENCY LOCAL_QUORUM;
SELECT price FROM orders WHERE order_id = 981;

-- tracing shows which replicas answered a statement
TRACING ON;</pre>
<p>The level is per statement in a driver, and cqlsh sets it per session. Check it on every read path that must see its own writes, because a single ONE read on a path is enough to show a stale value.</p>
<p>When a user sees a value flip between two states, list the CL of each read path and the replicas that were down during the write. That quickly separates the overlap case from the timestamp case, and it points at the statement that needs a higher level.</p>`;
  }
})();
