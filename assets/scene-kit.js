/* Scene kit: drawing parts for bespoke chapter scenes (ring, ledger, bars, chips, text).
   A chapter's stage supplies setup(kit) once and frame(state, kit, refs) on every step.
   frame() must be a pure function of `state`: parts keep their own DOM and animate to the target,
   so stepping backwards animates backwards. No dependencies. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  /* Angles: 0 at the top, increasing clockwise, like a clock face. */
  const rad = d => (d - 90) * Math.PI / 180;
  const polar = (cx, cy, r, deg) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
  const norm = d => ((d % 360) + 360) % 360;
  const arcD = (cx, cy, r, a, b) => {
    const span = Math.max(norm(b - a), 0.01), p = polar(cx, cy, r, a), q = polar(cx, cy, r, a + span);
    return `M${p.x.toFixed(2)} ${p.y.toFixed(2)} A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  };
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  /* One running tween per (owner, key). A new target cancels the previous one.
     Timer-based (not requestAnimationFrame) so it also advances in headless and background tabs.
     While snapping (first draw of a scene) every tween jumps straight to its target. */
  let snapping = false;
  function tween(owner, key, from, to, ms, fn) {
    owner.__tw = owner.__tw || {};
    clearTimeout(owner.__tw[key]);
    if (snapping || reduced() || ms <= 0 || from === to) { fn(to); return; }
    const t0 = performance.now();
    const tick = () => { const t = Math.min(1, (performance.now() - t0) / ms); fn(from + (to - from) * ease(t)); if (t < 1) owner.__tw[key] = setTimeout(tick, 16); };
    owner.__tw[key] = setTimeout(tick, 16);
  }
  /* Colours that stay with an identity (node N1 is always blue). */
  const PALETTE = ['--t0', '--t1', '--t2', '--t3', '--t5', '--t6', '--t4', '--t7'];
  const pv = i => `var(${PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]})`;
  const tint = (i, pct = 30) => `color-mix(in srgb, ${pv(i)} ${pct}%, var(--card))`;

  function bind(svg, layer) {
    const root = layer || svg;

    /* text: a label whose content can change */
    function text(parent, o) {
      const t = el('text', { x: o.x, y: o.y, class: 'kt ' + (o.cls || ''), 'text-anchor': o.anchor || 'start' }, parent || root);
      t.textContent = o.t || '';
      return { el: t, set(s) { t.textContent = s; }, show(on) { t.style.opacity = on === false ? 0 : 1; } };
    }

    /* panel: a titled frame, like the ledgers in a notebook */
    function panel(parent, o) {
      const g = el('g', null, parent || root);
      el('rect', { class: 'pbox tone-' + (o.tone || 'info'), x: o.x, y: o.y, width: o.w, height: o.h, rx: 14 }, g);
      if (o.title) { const t = el('text', { class: 'ptitle', x: o.x + 12, y: o.y + 20 }, g); t.textContent = o.title; }
      const b = el('text', { class: 'pbadge', x: o.x + o.w - 12, y: o.y + 20, 'text-anchor': 'end' }, g);
      return { g, badge(s) { b.textContent = s || ''; } };
    }

    /* chip: a small card that can move, recolour and fade (same look as scene tokens) */
    function chip(parent, o) {
      const g = el('g', { class: 'tok' + (o.small ? ' sm' : '') + (snapping ? '' : ' new') }, parent || root);
      if (!snapping) setTimeout(() => g.classList.remove('new'), 520);
      const rect = el('rect', { x: 0, y: 0, rx: o.r || 9 }, g), tl = el('text', { class: 'tl' }, g), ts = el('text', { class: 'ts' }, g);
      const st = { x: o.x, y: o.y, w: o.w || 96, h: o.h || 44, label: o.label || '', sub: o.sub || '', tone: o.tone || 'info', show: o.show !== false, hl: false };
      const api = {
        g, st,
        set(p) {
          Object.assign(st, p);
          g.dataset.tone = st.tone;
          g.classList.toggle('hl', !!st.hl);
          g.classList.toggle('leave', !st.show);
          rect.setAttribute('width', st.w); rect.setAttribute('height', st.h);
          tl.textContent = st.label; ts.textContent = st.sub;
          const one = !st.sub;
          tl.setAttribute('x', st.w / 2); tl.setAttribute('text-anchor', 'middle'); tl.setAttribute('y', one ? st.h / 2 + 4.5 : Math.min(18, st.h / 2 - 2));
          ts.setAttribute('x', st.w / 2); ts.setAttribute('text-anchor', 'middle'); ts.setAttribute('y', Math.min(35, st.h / 2 + 13));
          g.style.transform = `translate(${st.x}px,${st.y}px)`;
          return api;
        },
        remove() { g.remove(); }
      };
      return api.set({});
    }

    /* strip: a row of small chips, e.g. one per key */
    function strip(parent, o) {
      const items = {}, w = o.w || 19, h = o.h || 22, gap = o.gap == null ? 4 : o.gap;
      o.items.forEach((it, i) => { items[it.id] = chip(parent, { x: o.x + i * (w + gap), y: o.y, w, h, label: it.label, tone: o.tone || 'info', small: true, r: 5 }); });
      return items;
    }

    /* ledger: a table whose rows can be set, highlighted and appended */
    function ledger(parent, o) {
      const rowH = o.rowH || 16, rows = o.rows, head = 56, h = head + rows * rowH + 8;
      const g = el('g', null, parent || root);
      el('rect', { class: 'pbox tone-info', x: o.x, y: o.y, width: o.w, height: h, rx: 14 }, g);
      const t = el('text', { class: 'ptitle', x: o.x + 12, y: o.y + 20 }, g); t.textContent = o.title || '';
      const badge = el('text', { class: 'pbadge', x: o.x + o.w - 12, y: o.y + 20, 'text-anchor': 'end' }, g);
      let cx = o.x + 12; const colX = o.cols.map(c => { const v = cx; cx += c.w; return v; });
      o.cols.forEach((c, i) => { const hc = el('text', { class: 'kt mut sm', x: colX[i], y: o.y + 38 }, g); hc.textContent = c.label; });
      const rowsEls = [];
      for (let r = 0; r < rows; r++) {
        const ry = o.y + head + r * rowH, rg = el('g', { class: 'lrow' }, g);
        const bg = el('rect', { class: 'lbg', x: o.x + 6, y: ry - rowH + 4, width: o.w - 12, height: rowH - 1, rx: 4 }, rg);
        const cells = o.cols.map((c, i) => el('text', { class: 'kt sm', x: colX[i], y: ry }, rg));
        rowsEls.push({ rg, bg, cells });
      }
      const api = {
        g, rowH, badge(s) { badge.textContent = s || ''; },
        cell(r, c, s, tone) { const e = rowsEls[r]; if (!e) return api; e.cells[c].textContent = s == null ? '' : s; e.cells[c].setAttribute('class', 'kt sm' + (tone ? ' tone-' + tone : '')); return api; },
        setRow(r, cells, o2 = {}) { cells.forEach((s, c) => api.cell(r, c, s, o2.tones && o2.tones[c])); api.hl(r, o2.hl, o2.tone); return api; },
        hl(r, on, tone) { const e = rowsEls[r]; if (e) { e.bg.setAttribute('class', 'lbg' + (on ? ' on' : '') + (tone ? ' tone-' + tone : '')); } return api; },
        clear() { rowsEls.forEach((e, r) => { e.cells.forEach(c => { c.textContent = ''; }); api.hl(r, false); }); return api; }
      };
      return api;
    }

    /* bars: labelled horizontal gauges that grow and shrink */
    function bars(parent, o) {
      const rowH = o.rowH || 26, lw = o.labelW || 70, vw = 46, tw = o.w - lw - vw - 8, g = el('g', null, parent || root), map = {};
      if (o.title) { const t = el('text', { class: 'ptitle', x: o.x, y: o.y - 8 }, g); t.textContent = o.title; }
      o.items.forEach((it, i) => {
        const y = o.y + i * rowH;
        const lab = el('text', { class: 'kt sm', x: o.x, y: y + 12 }, g); lab.textContent = it.label;
        el('rect', { class: 'kbar-track', x: o.x + lw, y: y + 2, width: tw, height: 12, rx: 6 }, g);
        const fill = el('rect', { class: 'kbar-fill', x: o.x + lw, y: y + 2, width: tw, height: 12, rx: 6 }, g);
        const val = el('text', { class: 'kt sm', x: o.x + o.w, y: y + 12, 'text-anchor': 'end' }, g);
        map[it.id] = { fill, val, cur: 0 };
      });
      return {
        g, set(id, v, tone, label) {
          const b = map[id]; if (!b) return; const max = o.max || 100, f = Math.max(0, Math.min(1, v / max));
          b.fill.style.transform = `scaleX(${f})`; b.fill.dataset.tone = tone || 'ok'; b.val.textContent = label != null ? label : Math.round(v) + (o.unit || '');
        }
      };
    }

    /* ring: a circle of tokens with owner arcs, nodes and keys. A node owns the arc that ends at its token. */
    function ring(parent, o) {
      const { cx, cy, r } = o, g = el('g', null, parent || root);
      el('circle', { class: 'kring-track', cx, cy, r }, g);
      (o.ticks || [0, 90, 180, 270]).forEach(d => {
        const p = polar(cx, cy, r + 8, d), q = polar(cx, cy, r - 6, d), tp = polar(cx, cy, r - 18, d);
        el('line', { class: 'kring-tick', x1: p.x, y1: p.y, x2: q.x, y2: q.y }, g);
        const t = el('text', { class: 'kt mut xs', x: tp.x, y: tp.y + 3, 'text-anchor': 'middle' }, g); t.textContent = d;
      });
      const arcsG = el('g', null, g), keysG = el('g', null, g), nodesG = el('g', null, g), dotsG = el('g', null, g);
      const nodes = {}, keys = {}, dots = {};
      let nextColor = 0;
      const sortedNodes = () => Object.values(nodes).filter(n => !n.gone).sort((a, b) => a.target - b.target);
      const ownerOf = pos => { const s = sortedNodes(); if (!s.length) return null; const p = norm(pos); return (s.find(n => n.target >= p) || s[0]); };
      const drawArc = n => { n.arc.setAttribute('d', arcD(cx, cy, r, n.aFrom, n.aTo)); };
      const drawNode = n => {
        const p = polar(cx, cy, r + 30, n.pos), q = polar(cx, cy, r - 5, n.pos), q2 = polar(cx, cy, r + 14, n.pos);
        n.tick.setAttribute('x1', q.x); n.tick.setAttribute('y1', q.y); n.tick.setAttribute('x2', q2.x); n.tick.setAttribute('y2', q2.y);
        n.mark.style.transform = `translate(${p.x - 22}px,${p.y - 11}px)`;
      };
      const relayout = (ms = 700) => {
        const s = sortedNodes();
        s.forEach((n, i) => {
          const tFrom = i === 0 ? s[s.length - 1].target - 360 : s[i - 1].target;
          const f0 = n.aFrom, t0 = n.aTo, fT = s.length === 1 ? n.target - 359.9 : tFrom, tT = n.target;
          tween(n, 'arc', 0, 1, ms, k => { n.aFrom = f0 + (fT - f0) * k; n.aTo = t0 + (tT - t0) * k; drawArc(n); });
        });
        layoutKeys();
      };
      const layoutKeys = () => Object.values(keys).forEach(k => {
        const own = k.force && nodes[k.force] ? nodes[k.force] : ownerOf(k.pos), cidx = own ? own.color : 0;
        k.circle.style.fill = k.tone ? '' : tint(cidx, 40);
        k.circle.style.stroke = k.tone ? '' : pv(cidx);
        k.g.dataset.tone = k.tone || '';
        k.owner = own ? own.id : null;
      });
      return {
        g, polar: (d, rr) => polar(cx, cy, rr == null ? r : rr, d), ownerOf: pos => (ownerOf(pos) || {}).id,
        setNodes(list, ms) {
          const ids = new Set(list.map(n => n.id));
          Object.values(nodes).forEach(n => { if (!ids.has(n.id) && !n.gone) { n.gone = true; n.mark.style.opacity = 0; n.tick.style.opacity = 0; tween(n, 'arc', 0, 1, 500, k => { n.aTo = n.aFrom + (n.aTo - n.aFrom) * (1 - k); drawArc(n); }); } });
          list.forEach(d => {
            let n = nodes[d.id];
            if (!n) {
              n = nodes[d.id] = { id: d.id, pos: d.pos, target: d.pos, color: d.color != null ? d.color : nextColor++, aFrom: d.pos, aTo: d.pos };
              n.arc = el('path', { class: 'kit-arc' }, arcsG); n.arc.style.stroke = pv(n.color);
              n.tick = el('line', { class: 'kring-tick node' }, nodesG); n.tick.style.stroke = pv(n.color);
              n.mark = el('g', { class: 'knode' }, nodesG);
              n.rect = el('rect', { x: 0, y: 0, width: 44, height: 22, rx: 8 }, n.mark); n.rect.style.stroke = pv(n.color); n.rect.style.fill = tint(n.color, 26);
              n.txt = el('text', { x: 22, y: 15, 'text-anchor': 'middle', class: 'kt b sm' }, n.mark);
              n.mark.style.opacity = snapping ? 1 : 0; if (!snapping) setTimeout(() => { n.mark.style.opacity = 1; }, 30);
            }
            n.gone = false; n.mark.style.opacity = 1; n.tick.style.opacity = 1;
            n.txt.textContent = d.label || d.id; n.target = d.pos; n.hot = !!d.hot;
            n.arc.classList.toggle('hot', !!d.hot); n.mark.classList.toggle('on', !!d.hot);
            n.arc.dataset.role = d.role || ''; n.mark.dataset.role = d.role || '';
            if (d.sub != null) n.txt.textContent = d.label || d.id;
            const from = n.pos; tween(n, 'pos', from, d.pos, ms == null ? 700 : ms, v => { n.pos = v; drawNode(n); });
          });
          relayout(ms == null ? 700 : ms);
        },
        setKeys(list) {
          const ids = new Set(list.map(k => k.id));
          Object.values(keys).forEach(k => { if (!ids.has(k.id)) { k.g.classList.add('leave'); k.ray.style.opacity = 0; k.gone = true; } });
          list.forEach(d => {
            let k = keys[d.id];
            if (!k) { k = keys[d.id] = { id: d.id, ray: el('line', { class: 'kring-ray' }, keysG), g: el('g', { class: 'knob' }, keysG) }; k.circle = el('circle', { r: d.r || 11, cx: 0, cy: 0 }, k.g); k.txt = el('text', { class: 'kt xs b', 'text-anchor': 'middle', y: 3 }, k.g); }
            k.gone = false; k.g.classList.remove('leave'); k.pos = d.pos; k.tone = d.tone || ''; k.force = d.owner || null; k.txt.textContent = d.label != null ? d.label : d.id;
            k.circle.setAttribute('r', d.r || 11);
            const rr = d.rad != null ? d.rad : r - 44, p = polar(cx, cy, rr, d.pos), a = polar(cx, cy, rr + (d.r || 11), d.pos), b = polar(cx, cy, r, d.pos);
            k.g.style.transform = `translate(${p.x}px,${p.y}px)`;
            k.ray.setAttribute('x1', a.x); k.ray.setAttribute('y1', a.y); k.ray.setAttribute('x2', b.x); k.ray.setAttribute('y2', b.y); k.ray.style.opacity = 1;
          });
          layoutKeys();
        },
        dot(id, from, to, ms, tone) {
          let d = dots[id]; if (!d) { d = dots[id] = { c: el('circle', { class: 'kdot', r: 6 }, dotsG), pos: from }; }
          d.c.style.opacity = 1; d.c.dataset.tone = tone || '';
          const place = v => { d.pos = v; const p = polar(cx, cy, r, v); d.c.setAttribute('cx', p.x); d.c.setAttribute('cy', p.y); };
          place(from); tween(d, 'pos', from, to, ms == null ? 900 : ms, place);
        },
        hideDot(id) { const d = dots[id]; if (d) d.c.style.opacity = 0; },
        hideDots() { Object.values(dots).forEach(d => { d.c.style.opacity = 0; }); }
      };
    }

    return { svg, layer: root, el, text, panel, chip, strip, ledger, bars, ring, polar, tint: tint, pv };
  }
  window.Kit = { bind, polar, norm, tween, setSnap(v) { snapping = !!v; } };
})();
