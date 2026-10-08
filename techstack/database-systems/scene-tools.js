/* Shared drawing helpers for the Database Systems chapter scenes (loads before chapters/ch*.js).
   DB.stage({footer, header, draw}) builds a bespoke stage. draw(P, state, kit) is a pure function of the step state:
   it calls P.chip / P.box / P.text / P.line for everything visible, and whatever it does not call fades out.
   Parts keep their DOM by id, so they slide, recolour and fade between steps (and backwards).
   Nothing here touches the DOM at load time. */
window.DB = (function () {
  let uid = 0;
  const TONE = {
    info: 'var(--card)', delete: 'color-mix(in srgb, var(--bad) 12%, var(--card))', mut: 'var(--soft)', ok: 'color-mix(in srgb, var(--ok) 36%, var(--card))', live: 'color-mix(in srgb, var(--ok) 20%, var(--card))',
    warn: 'color-mix(in srgb, var(--warn) 34%, var(--card))', bad: 'color-mix(in srgb, var(--bad) 32%, var(--card))',
    cursor: 'color-mix(in srgb, var(--acc2) 30%, var(--card))', acc: 'color-mix(in srgb, var(--acc) 30%, var(--card))',
    t0: 'color-mix(in srgb, var(--t0) 32%, var(--card))', t1: 'color-mix(in srgb, var(--t1) 32%, var(--card))', t2: 'color-mix(in srgb, var(--t2) 32%, var(--card))',
    t3: 'color-mix(in srgb, var(--t3) 32%, var(--card))', t4: 'color-mix(in srgb, var(--t4) 32%, var(--card))', t5: 'color-mix(in srgb, var(--t5) 32%, var(--card))'
  };
  const STROKE = { delete: 'var(--bad)', ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', cursor: 'var(--acc2)', acc: 'var(--acc)', t0: 'var(--t0)', t1: 'var(--t1)', t2: 'var(--t2)', t3: 'var(--t3)', t4: 'var(--t4)', t5: 'var(--t5)' };
  const EASE = 'transform .6s cubic-bezier(.3,.7,.2,1), opacity .4s, fill .4s, stroke .4s, width .6s cubic-bezier(.3,.7,.2,1), height .6s cubic-bezier(.3,.7,.2,1)';

  function pool(kit) {
    const chips = {}, items = {};
    let seen = new Set();
    const defs = kit.el('defs', null, kit.svg), mid = 'dbm' + (++uid);
    const mk = kit.el('marker', { id: mid, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    kit.el('path', { d: 'M0 0L8 4L0 8z', class: 'arr' }, mk);
    const get = (key, make) => { seen.add(key); return items[key] || (items[key] = make()); };
    const P = {
      begin() { seen = new Set(); },
      /* a card that moves: label (bold) and sub (small). Width rule: label.length * 7.9 + 16 <= w */
      chip(id, o) {
        seen.add('c' + id);
        let c = chips[id];
        if (!c) c = chips[id] = kit.chip(null, { x: o.x, y: o.y, w: o.w || 96, h: o.h || 44, label: o.label || '', show: false, small: !!o.small, r: o.r });
        c.set({ x: o.x, y: o.y, w: o.w || 96, h: o.h || 44, label: o.label || '', sub: o.sub || '', tone: o.tone || 'info', hl: !!o.hl, show: o.show !== false });
      },
      /* a plain rectangle, optionally with a centred label; it slides and resizes */
      box(id, o) {
        const it = get('b' + id, () => {
          const g = kit.el('g', null, kit.layer); g.style.transition = EASE;
          const r = kit.el('rect', { x: 0, y: 0, rx: o.rx == null ? 6 : o.rx }, g);
          r.style.transition = EASE;
          const t = kit.el('text', { class: 'kt sm', 'text-anchor': 'middle' }, g);
          return { g, r, t };
        });
        it.g.style.opacity = o.op == null ? 1 : o.op; it.g.style.transform = `translate(${o.x}px,${o.y}px)`;
        it.r.style.width = o.w + 'px'; it.r.style.height = o.h + 'px';
        it.r.setAttribute('width', o.w); it.r.setAttribute('height', o.h);
        it.r.style.fill = TONE[o.tone || 'info']; it.r.style.stroke = o.stroke ? (STROKE[o.stroke] || o.stroke) : (o.tone && STROKE[o.tone]) || 'var(--ink)';
        it.r.style.strokeWidth = o.sw || 1.4; it.r.style.strokeDasharray = o.dash ? '5 3' : '';
        it.t.textContent = o.label || ''; it.t.setAttribute('x', o.w / 2); it.t.setAttribute('y', o.h / 2 + 4);
        it.t.setAttribute('class', 'kt ' + (o.cls || 'sm'));
      },
      text(id, o) {
        const it = get('t' + id, () => { const t = kit.el('text', null, kit.layer); t.style.transition = 'opacity .4s'; return t; });
        it.setAttribute('x', o.x); it.setAttribute('y', o.y); it.setAttribute('text-anchor', o.anchor || 'start');
        it.setAttribute('class', 'kt ' + (o.cls || '')); it.textContent = o.t; it.style.opacity = 1;
      },
      /* a line or arrow between two points; o.tone 'bad' | 'ok' | 'mut', o.dash, o.arrow, o.label */
      line(id, x1, y1, x2, y2, o = {}) {
        const it = get('l' + id, () => {
          const l = kit.el('line', { class: 'dbl' }, kit.layer); l.style.transition = 'opacity .4s, stroke .4s';
          const t = kit.el('text', { class: 'kt xs mut', 'text-anchor': 'middle' }, kit.layer); t.style.transition = 'opacity .4s';
          return { l, t };
        });
        const L = it.l; L.setAttribute('x1', x1); L.setAttribute('y1', y1); L.setAttribute('x2', x2); L.setAttribute('y2', y2);
        L.style.opacity = 1; L.style.stroke = o.tone ? (STROKE[o.tone] || 'var(--mut)') : 'var(--ink)'; L.style.strokeWidth = o.sw || 1.6;
        L.style.strokeDasharray = o.dash ? '5 4' : ''; if (o.arrow) L.setAttribute('marker-end', `url(#${mid})`); else L.removeAttribute('marker-end');
        it.t.textContent = o.label || ''; it.t.setAttribute('x', (x1 + x2) / 2 + (o.dx || 0)); it.t.setAttribute('y', (y1 + y2) / 2 + (o.dy == null ? -5 : o.dy)); it.t.style.opacity = o.label ? 1 : 0;
      },
      end() {
        Object.keys(chips).forEach(k => { if (!seen.has('c' + k)) chips[k].set({ show: false }); });
        Object.keys(items).forEach(k => {
          if (seen.has(k)) return; const it = items[k];
          if (k[0] === 'l') { it.l.style.opacity = 0; it.t.style.opacity = 0; } else if (k[0] === 'b') it.g.style.opacity = 0; else it.style.opacity = 0;
        });
      }
    };
    return P;
  }

  function stage(o) {
    return {
      w: 640, h: 420, footer: o.footer, header: o.header,
      setup(kit) { const R = { P: pool(kit) }; if (o.decor) o.decor(kit, R); return R; },
      frame(state, kit, R) { R.P.begin(); o.draw(R.P, state, kit); R.P.end(); }
    };
  }
  const fmt = n => Number(n).toLocaleString('en-US');
  return { stage, pool, fmt, TONE };
})();
