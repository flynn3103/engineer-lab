/* Small SVG drawing helpers for the OS course scenes. Scenes call D.init(kit) once in setup,
   then redraw a layer from scratch in frame(): the picture is a pure function of the step state.
   Things that must glide between steps use kit.chip instead (it tweens its own position). */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let n = 0;
  const mk = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a || {}) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const D = {
    mk,
    /* a redrawable layer plus an arrow marker unique to this svg */
    init(kit, name) {
      const id = 'oa' + (++n);
      const defs = mk('defs', null, kit.svg);
      const m = mk('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
      mk('path', { d: 'M0 0L8 4L0 8z', class: 'o-arrow' }, m);
      const g = mk('g', { 'data-layer': name || '' }, kit.layer);
      return { g, mid: id };
    },
    clear(L) { while (L.g.firstChild) L.g.removeChild(L.g.firstChild); },
    rect(L, x, y, w, h, tone, o = {}) { return mk('rect', { x, y, width: w, height: h, rx: o.rx == null ? 8 : o.rx, class: 'o-r' + (tone ? ' t-' + tone : '') + (o.hot ? ' t-hot o-pop' : '') }, L.g); },
    text(L, x, y, s, o = {}) { const t = mk('text', { x, y, class: 'o-t' + (o.m ? ' m' : '') + (o.b ? ' b' : '') + (o.s ? ' s' : '') + (o.xs ? ' xs' : '') + (o.tone ? ' t-' + o.tone : ''), 'text-anchor': o.a || 'start' }, L.g); t.textContent = s; return t; },
    line(L, x1, y1, x2, y2, o = {}) { return mk('line', { x1, y1, x2, y2, class: 'o-l' + (o.tone ? ' t-' + o.tone : '') + (o.dash ? ' dash' : '') + (o.thin ? ' thin' : ''), 'marker-end': o.arrow ? `url(#${L.mid})` : null }, L.g); },
    path(L, d, o = {}) { return mk('path', { d, class: 'o-l' + (o.tone ? ' t-' + o.tone : '') + (o.dash ? ' dash' : '') + (o.thin ? ' thin' : ''), 'marker-end': o.arrow ? `url(#${L.mid})` : null }, L.g); },
    circle(L, cx, cy, r, tone, o = {}) { return mk('circle', { cx, cy, r, class: 'o-r' + (tone ? ' t-' + tone : '') + (o.hot ? ' t-hot o-pop' : '') }, L.g); },
    /* a box with a centred one or two line label */
    cell(L, x, y, w, h, label, tone, o = {}) {
      D.rect(L, x, y, w, h, tone, o);
      if (o.sub) { D.text(L, x + w / 2, y + h / 2 - 2, label, { a: 'middle', b: 1, s: 1 }); D.text(L, x + w / 2, y + h / 2 + 12, o.sub, { a: 'middle', m: 1, xs: 1 }); }
      else D.text(L, x + w / 2, y + h / 2 + 4, label, { a: 'middle', s: 1, b: o.b });
    }
  };
  window.OSD = D;
})();
