/* Course picture kit.
 * Small pure functions that return HTML strings for the step pictures (.pv) of a course page, in the Spark course style.
 * A painter is  (state, step) => html  and describes the WHOLE scene for one step, so Back and Restart need no replay.
 * Build a painter from these forms instead of hand-writing markup, so every course pictures the same way:
 *
 *   const { chip, cells, meter, limitMeter, timeline, lanes, columns, table, stages, panels } = Course.kit;
 *   CourseData.PAINT.myform = s => cap('...') + cells(s.items.map(i => [i.name, i.ok ? 'ok' : 'bad']));
 *
 * Colour classes everywhere: ok (green), bad (red), warn (yellow), acc (blue), hot (orange), dim (faded), ring (outlined).
 * Nothing here touches the DOM, so Node can run it (tools/course/check.js paints every step that way). */
(function (root) {
  'use strict';
  const Course = root.Course = root.Course || {};
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));

  const chip = (t, c) => '<span class="tag ' + (c || '') + '">' + e(t) + '</span>';
  const cell = (t, c, title) => '<span class="cell ' + (c || '') + '"' + (title ? ' title="' + e(title) + '"' : '') + '>' + e(t) + '</span>';
  const cap = t => '<div class="cap">' + t + '</div>';                         // caption above a picture row (text is trusted markup)
  const strip = html => '<div class="strip">' + html + '</div>';              // wrapping row of chips or cells
  const note = (...chips) => '<div class="strip" style="margin-top:10px">' + chips.filter(Boolean).join('') + '</div>';

  /** A bar filled to value/max. cls: ok|bad|warn|hot, label shown inside. */
  const meter = (v, max, cls, label) => '<div class="meter"><i class="' + (cls || '') + '" style="width:' + pct(v, max) + '%"></i><b>' + e(label || '') + '</b></div>';
  /** A bar with a vertical limit mark. Turns red when v is past the limit. scale is the bar's full width in value units. */
  const limitMeter = (label, v, scale, limit, o = {}) => cap(label) + '<div class="meter" style="overflow:visible;height:' + (o.h || 24) + 'px"><i class="' +
    (o.cls || (v > limit ? 'bad' : o.warnAt && v > o.warnAt ? 'warn' : 'ok')) + '" style="width:' + pct(v, scale) + '%"></i><span class="mark" style="left:' + pct(limit, scale) + '%"></span></div>';

  /** Row of boxes. items: [text, cls, title] or {t, c, title}. */
  const cells = items => '<div class="strip">' + items.map(i => Array.isArray(i) ? cell(i[0], i[1], i[2]) : cell(i.t, i.c, i.title)).join('') + '</div>';

  /** Axis with positioned dots, vertical marks, bands and tick labels.
   *  o = { max, height, points:[{at, top, bg, title, opacity, outline}], marks:[{at, kind:'fs'|'cr', color}],
   *        bands:[{from, to, top, height}], ticks:[{at, label, top, color, bold}], label } */
  function timeline(o) {
    let h = '';
    (o.bands || []).forEach(b => { h += '<div style="position:absolute;top:' + (b.top || 18) + 'px;height:' + (b.height || 22) + 'px;left:' + pct(b.from, o.max) + '%;width:' + pct(b.to - b.from, o.max) + '%;background:var(--p0);border:1.5px solid var(--ink);border-radius:6px"></div>'; });
    (o.marks || []).forEach(m => { h += '<span class="' + (m.kind || 'cr') + '" style="left:' + pct(m.at, o.max) + '%' + (m.color ? ';border-left-color:var(--' + m.color + ')' : '') + '"></span>'; });
    (o.points || []).forEach(p => { h += '<span class="pt" title="' + e(p.title || '') + '" style="left:' + pct(p.at, o.max) + '%;top:' + (p.top || 0) + 'px;background:' + (p.bg || 'var(--mut)') +
      (p.opacity != null ? ';opacity:' + p.opacity : '') + (p.outline ? ';outline:2px solid var(--bad);outline-offset:2px' : '') + (p.label ? ';width:auto;border:0;color:var(--warn);font-size:15px;line-height:12px' : '') + '">' + (p.label ? e(p.label) : '') + '</span>'; });
    (o.ticks || []).forEach(t => { h += '<span class="tick" style="left:' + pct(t.at, o.max) + '%' + (t.top != null ? ';bottom:auto;top:' + t.top + 'px' : '') + (t.color ? ';color:var(--' + t.color + ')' : '') + (t.bold ? ';font-weight:700' : '') + '">' + e(t.label) + '</span>'; });
    return (o.label ? cap(o.label) : '') + '<div class="tl" style="height:' + (o.height || 74) + 'px">' + h + '</div>';
  }

  /** Sequence lanes. heads: lane titles. rows: [{from, to, text, lost, crash}] (indexes into heads). from === to draws a self chip. */
  function lanes(heads, rows) {
    const n = heads.length;
    const g = 'grid-template-columns:repeat(' + n + ',1fr)';
    let h = '<div class="lane" style="' + g + '">' + heads.map(x => '<div class="hd">' + e(x) + '</div>').join('') + '</div>';
    rows.forEach(r => {
      if (r.from === r.to) h += '<div class="lane" style="' + g + '"><div style="grid-column:' + (r.from + 1) + '/' + (r.from + 2) + '">' + chip(r.text, 'bad') + '</div></div>';
      else {
        const a = Math.min(r.from, r.to), b = Math.max(r.from, r.to);
        h += '<div class="lane" style="' + g + '"><div class="arrow ' + (r.lost ? 'lost' : '') + '" style="grid-column:' + (a + 1) + '/' + (b + 2) + '">' + (r.from > r.to ? '◀ ' : '') + e(r.text) + (r.lost && r.from < r.to ? ' ✕' : '') + (r.from < r.to ? ' ▶' : '') + '</div></div>';
      }
    });
    return h;
  }

  /** Items grouped into titled columns. cols: [{title, items:[{name, info, cls}]}]. cls: ok|bad|warn|acc. */
  const columns = cols => '<div class="cols wide" style="--n:' + cols.length + '">' + cols.map(c => '<div>' + cap(c.title) +
    (c.items || []).map(i => '<div class="panel ' + (i.cls || '') + '" style="margin:6px 0"><b>' + e(i.name) + '</b><div class="faint">' + e(i.info || '') + '</div></div>').join('') + '</div>').join('') + '</div>';

  /** Table. head: header strings. rows: arrays of cell HTML (use chip() for status cells). */
  const table = (head, rows) => '<table>' + (head && head.length ? '<tr>' + head.map(x => '<th>' + e(x) + '</th>').join('') + '</tr>' : '') +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table>';

  /** Pipeline of stages with the active one highlighted. stages: [[title, sub]], at: active index. */
  const stages = (list, at) => '<div class="stages">' + list.map((x, i) => '<div style="' + (i === at ? 'border-color:var(--acc);background:var(--p0)' : i < at ? 'border-color:var(--ok)' : 'opacity:.5') + '"><b>' + e(x[0]) + '</b><small>' + e(x[1]) + '</small></div>').join('') + '</div>';

  /** Boxes side by side. items: [{title, big, sub, cls, extra}]. */
  const panels = (items, o = {}) => '<div class="cols ' + (o.wide === false ? '' : 'wide') + '" style="--n:' + items.length + '">' + items.map(p =>
    '<div class="panel ' + (p.cls || '') + '"><b>' + e(p.title) + '</b>' + (p.big != null ? '<div class="hero">' + e(p.big) + '</div>' : '') + (p.sub ? '<div class="faint">' + e(p.sub) + '</div>' : '') + (p.extra || '') + '</div>').join('') + '</div>';

  Course.kit = { e, pct, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels };
})(typeof globalThis !== 'undefined' ? globalThis : this);
