/* Shared helpers for the Kubernetes chapter files (loads before chapters/ch*.js).
   KH.links(kit, list)   arrows between scene parts; frame() toggles them by id.
   KH.flow(items, cap)   inline SVG flow figure for the Explain text. */
window.KH = (function () {
  let uid = 0;
  /* arrows for a custom stage: setup creates every arrow once, frame() shows, hides or marks them bad */
  function links(kit, list) {
    const id = 'kh' + (++uid), NS = 'http://www.w3.org/2000/svg';
    const defs = kit.el('defs', null, kit.svg);
    const m = kit.el('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    kit.el('path', { d: 'M0 0L8 4L0 8z', class: 'arr' }, m);
    const map = {};
    list.forEach(o => {
      const line = kit.el('line', { class: 'sarrow', x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, 'marker-end': `url(#${id})` }, kit.layer);
      line.style.animation = 'none'; line.style.opacity = 0; line.style.visibility = 'hidden'; line.style.transition = 'opacity .4s';
      let lab = null;
      if (o.label) { lab = kit.el('text', { class: 'kt xs mut', x: (o.x1 + o.x2) / 2 + (o.dx || 0), y: (o.y1 + o.y2) / 2 + (o.dy == null ? -5 : o.dy), 'text-anchor': 'middle' }, kit.layer); lab.textContent = o.label; lab.style.opacity = 0; lab.style.transition = 'opacity .4s'; }
      map[o.id] = { line, lab };
    });
    return {
      set(id2, on, bad) { const l = map[id2]; if (!l) return; const v = on ? 'visible' : 'hidden'; l.line.style.visibility = v; l.line.style.opacity = on ? 1 : 0; l.line.classList.toggle('bad', !!bad); if (l.lab) { l.lab.style.visibility = v; l.lab.style.opacity = on ? 1 : 0; } },
      only(ids, bad) { Object.keys(map).forEach(k => this.set(k, ids.indexOf(k) >= 0, bad && bad.indexOf(k) >= 0)); }
    };
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  /* items: ['title|sub', ...]; a leading '*' marks the highlighted box. Up to 4 per row. */
  function flow(items, cap) {
    const per = 4, w = 140, h = 46, gx = 28, gy = 26, rows = Math.ceil(items.length / per);
    const W = per * w + (per - 1) * gx, H = rows * h + (rows - 1) * gy;
    let s = '';
    items.forEach((it, i) => {
      const hot = it[0] === '*', t = (hot ? it.slice(1) : it).split('|'), r = Math.floor(i / per), c = i % per;
      const x = c * (w + gx), y = r * (h + gy);
      s += `<rect class="${hot ? 'hot' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/><text x="${x + w / 2}" y="${y + (t[1] ? 19 : 28)}" text-anchor="middle">${esc(t[0])}</text>` + (t[1] ? `<text class="s" x="${x + w / 2}" y="${y + 35}" text-anchor="middle">${esc(t[1])}</text>` : '');
      if (i < items.length - 1) {
        if (c < per - 1) s += `<path d="M${x + w + 3} ${y + h / 2}H${x + w + gx - 6}"/><path class="ah" d="M${x + w + gx - 2} ${y + h / 2}l-6 -4v8z"/>`;
        else s += `<path d="M${x + w / 2} ${y + h + 2}V${y + h + gy - 6}"/><path class="ah" d="M${x + w / 2} ${y + h + gy - 2}l-4 -6h8z"/>`;
      }
    });
    return `<figure class="flow" aria-label="${esc(cap)}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cap)}">${s}</svg><figcaption>${esc(cap)}</figcaption></figure>`;
  }

  /* swimlane grid: one row per lane, one cell per time column. Cells take a tone name per column. */
  const COL = {
    ok: 'color-mix(in srgb, var(--ok) 45%, var(--card))', bad: 'color-mix(in srgb, var(--bad) 40%, var(--card))', warn: 'color-mix(in srgb, var(--warn) 45%, var(--card))',
    dim: 'color-mix(in srgb, var(--mut) 28%, var(--card))', none: 'var(--soft)', info: 'color-mix(in srgb, var(--acc) 30%, var(--card))'
  };
  function lanes(kit, o) {
    const x0 = o.x0 || 92, cw = o.cw || 43, n = o.n || 12, unit = o.unit || 's', every = o.every || 2, per = o.per || 1;
    const rows = o.defs.map(d => {
      kit.text(null, { x: 16, y: d.y + 17, t: d.label, cls: 'kt xs' });
      return Array.from({ length: n }, (_, i) => {
        const r = kit.el('rect', { x: x0 + i * cw + 1, y: d.y, width: cw - 2, height: 24, rx: 4 }, kit.layer);
        r.style.fill = COL.none; r.style.stroke = 'var(--line)'; r.style.transition = 'fill .4s';
        return r;
      });
    });
    for (let i = 0; i < n; i += every) kit.text(null, { x: x0 + i * cw + cw / 2, y: o.axisY, t: (i * per) + unit, cls: 'kt xs mut', anchor: 'middle' });
    return { rows, paint(data, t) { rows.forEach((row, li) => row.forEach((r, i) => { r.style.fill = i < t ? COL[data[li][i]] || COL.none : COL.none; })); } };
  }
  return { links, flow, lanes };
})();
