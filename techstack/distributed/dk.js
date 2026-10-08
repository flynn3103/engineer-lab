/* Distributed Systems scene helpers on top of assets/scene-kit.js.
   Every part keeps its own DOM and moves to the state it is given, so frame() stays a pure function of state.
   Position and colour changes animate through CSS transitions (see diagrams.css); line and bar geometry uses Kit.tween. */
(function () {
  const TONE = { ok: 'var(--ok)', bad: 'var(--bad)', warn: 'var(--warn)', acc: 'var(--acc)', acc2: 'var(--acc2)', mut: 'var(--mut)', ink: 'var(--ink)', line: 'var(--line)' };
  const stroke = t => TONE[t] || 'var(--ink)';
  const fill = (t, pct) => (!t || t === 'none' ? 'var(--card)' : t === 'soft' ? 'var(--soft)' : `color-mix(in srgb, ${TONE[t]} ${pct || 28}%, var(--card))`);
  const E = (kit, tag, a, p) => kit.el(tag, a, p || kit.layer);

  /* line whose end points tween; set({ x1, y1, x2, y2, tone, w, dash, op, arrow }) */
  function line(kit, o, parent) {
    const l = E(kit, 'line', { class: 'dk-line' }, parent), c = { x1: o.x1 || 0, y1: o.y1 || 0, x2: o.x2 || 0, y2: o.y2 || 0 };
    const api = {
      el: l,
      set(p) {
        if (p.tone !== undefined) l.style.stroke = stroke(p.tone);
        if (p.w !== undefined) l.style.strokeWidth = p.w;
        if (p.dash !== undefined) { if (p.dash) l.setAttribute('stroke-dasharray', p.dash); else l.removeAttribute('stroke-dasharray'); }
        if (p.op !== undefined) l.style.opacity = p.op;
        const to = { x1: p.x1 != null ? p.x1 : c.x1, y1: p.y1 != null ? p.y1 : c.y1, x2: p.x2 != null ? p.x2 : c.x2, y2: p.y2 != null ? p.y2 : c.y2 };
        const from = { ...c };
        window.Kit.tween(api, 'g', 0, 1, p.ms == null ? 600 : p.ms, k => {
          for (const q in to) { c[q] = from[q] + (to[q] - from[q]) * k; l.setAttribute(q, c[q]); }
        });
        return api;
      }
    };
    api.set({ tone: o.tone || 'mut', w: o.w || 2, dash: o.dash || '', op: o.op == null ? 1 : o.op, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, ms: 0 });
    return api;
  }

  /* box: a card that can move, resize, recolour; set({ x, y, w, h, tone, label, sub, op, dash, hl }) */
  function box(kit, o, parent) {
    const g = E(kit, 'g', { class: 'dk-g' }, parent), r = E(kit, 'rect', { rx: o.r == null ? 9 : o.r }, g), t1 = E(kit, 'text', { class: 'kt b', 'text-anchor': 'middle' }, g), t2 = E(kit, 'text', { class: 'kt mut sm', 'text-anchor': 'middle' }, g);
    r.style.strokeWidth = 1.6;
    const st = { x: 0, y: 0, w: 96, h: 40, tone: 'none', label: '', sub: '', op: 1, dash: '', hl: false, ...o };
    const api = {
      g, st,
      set(p) {
        Object.assign(st, p);
        r.setAttribute('width', st.w); r.setAttribute('height', st.h);
        r.style.fill = fill(st.tone, st.pct); r.style.stroke = st.tone === 'none' ? 'var(--ink)' : stroke(st.tone);
        r.style.strokeWidth = st.hl ? 3 : 1.6;
        if (st.dash) r.setAttribute('stroke-dasharray', st.dash); else r.removeAttribute('stroke-dasharray');
        t1.textContent = st.label; t2.textContent = st.sub;
        const two = !!st.sub;
        t1.setAttribute('x', st.w / 2); t1.setAttribute('y', two ? st.h / 2 - 3 : st.h / 2 + 4.5);
        t2.setAttribute('x', st.w / 2); t2.setAttribute('y', st.h / 2 + 12);
        g.style.opacity = st.op; g.style.transform = `translate(${st.x}px,${st.y}px)`;
        return api;
      }
    };
    return api.set({});
  }

  /* dot: a message or token; set({ x, y, tone, op, label, r }) glides between steps */
  function dot(kit, o, parent) {
    const g = E(kit, 'g', { class: 'dk-g fast' }, parent), c = E(kit, 'circle', { r: o.r || 7 }, g), t = E(kit, 'text', { class: 'kt xs b', 'text-anchor': 'middle', y: 3.5 }, g);
    c.style.strokeWidth = 1.4; c.style.stroke = 'var(--ink)';
    const st = { x: 0, y: 0, tone: 'acc2', op: 0, label: '', r: 7, ...o };
    const api = {
      g, st,
      set(p) {
        Object.assign(st, p);
        c.setAttribute('r', st.r); c.style.fill = fill(st.tone, 70); t.textContent = st.label;
        g.style.opacity = st.op; g.style.transform = `translate(${st.x}px,${st.y}px)`;
        return api;
      }
    };
    return api.set({});
  }

  /* bar: a horizontal gauge, set({ f: 0..1, tone, label }) */
  function bar(kit, o, parent) {
    const g = E(kit, 'g', null, parent);
    E(kit, 'rect', { class: 'kbar-track', x: o.x, y: o.y, width: o.w, height: o.h || 12, rx: (o.h || 12) / 2 }, g);
    const f = E(kit, 'rect', { class: 'kbar-fill', x: o.x, y: o.y, width: o.w, height: o.h || 12, rx: (o.h || 12) / 2 }, g);
    const t = E(kit, 'text', { class: 'kt sm', x: o.x + o.w + 8, y: o.y + (o.h || 12) - 1 }, g);
    return { g, set(p) { f.style.transform = `scaleX(${Math.max(0, Math.min(1, p.f))})`; f.dataset.tone = p.tone || 'ok'; t.textContent = p.label || ''; } };
  }

  /* txt: a label, set(text, { tone, op, x, y }) */
  function txt(kit, o, parent) {
    const t = kit.text(parent || null, o), api = {
      el: t.el,
      set(s, p) {
        p = p || {}; t.set(s == null ? '' : s);
        t.el.style.fill = p.tone ? stroke(p.tone) : '';
        if (p.op !== undefined) t.el.style.opacity = p.op;
        if (p.x != null) t.el.setAttribute('x', p.x);
        if (p.y != null) t.el.setAttribute('y', p.y);
        return api;
      }
    };
    return api;
  }

  /* rule: a static decorative line (axis, lane) */
  function rule(kit, x1, y1, x2, y2, o) {
    o = o || {};
    const l = E(kit, 'line', { x1, y1, x2, y2 }, o.parent);
    l.style.stroke = o.tone ? stroke(o.tone) : 'var(--line)'; l.style.strokeWidth = o.w || 1.5;
    if (o.dash) l.setAttribute('stroke-dasharray', o.dash);
    return l;
  }
  /* cap: a static caption */
  function cap(kit, x, y, s, cls, anchor) { return kit.text(null, { x, y, t: s, cls: cls || 'sm mut', anchor: anchor || 'start' }); }

  /* geometry helpers: a point part-way along a->b; a line drawn from a towards b; a dot gliding along a->b */
  const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
  const seg = (ln, a, b, p, tone, o) => { const q = lerp(a, b, p); return ln.set({ x1: a.x, y1: a.y, x2: q.x, y2: q.y, op: p > 0 ? 1 : 0, tone: tone || 'acc2', w: (o && o.w) || 2.6, ms: o && o.ms != null ? o.ms : 800 }); };
  const glide = (d, a, b, p, tone, label) => { const q = lerp(a, b, p); return d.set({ x: q.x, y: q.y, op: p > 0 ? 1 : 0, tone: tone || 'acc2', label: label || '' }); };

  window.DK = { line, box, dot, bar, txt, rule, cap, fill, stroke, E, lerp, seg, glide };
})();
