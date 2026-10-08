/* Card thumbnails: one small inline SVG per system, skill and post. Plain functions, no dependencies.
   Colours come from theme tokens via style="fill:var(--…)" so light and dark mode both work. */
(function () {
  const F = c => `style="fill:var(${c})"`;
  const S = c => `style="stroke:var(${c})"`;
  const box = (x, y, w, h, c = '--card', k = '--ink') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ${F(c)} ${S(k)} stroke-width="1.8"/>`;
  const txt = (x, y, s, a = 'middle', c = '--ink') => `<text x="${x}" y="${y}" text-anchor="${a}" ${F(c)} font-family="ui-monospace,Menlo,monospace" font-size="11" font-weight="600">${s}</text>`;
  const arrow = (x1, y1, x2, y2, c = '--ink') => `<path d="M${x1} ${y1}L${x2} ${y2}" ${S(c)} stroke-width="1.8" fill="none" marker-end="url(#ah)"/>`;
  const svg = body => `<svg viewBox="0 0 240 120" role="img" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" style="fill:var(--ink)"/></marker></defs>${body}</svg>`;

  const T = {
    /* DAG of stages: a job split into stages with dependencies */
    spark: () => svg(
      box(14, 14, 62, 30) + txt(45, 33, 'stage 0') +
      box(14, 76, 62, 30) + txt(45, 95, 'stage 1') +
      box(110, 14, 62, 30) + txt(141, 33, 'stage 2') +
      box(110, 76, 62, 30) + txt(141, 95, 'stage 3') +
      box(200, 45, 30, 30, '--p2', '--ok') + txt(215, 64, 'out', 'middle') +
      arrow(78, 29, 108, 29) + arrow(78, 91, 108, 91) + arrow(174, 29, 198, 56) + arrow(174, 91, 198, 66)),
    /* token ring: nodes around a ring, a key lands on one */
    scylla: () => svg(
      `<circle cx="120" cy="60" r="44" fill="none" ${S('--line')} stroke-width="5"/>` +
      [0, 1, 2, 3, 4, 5].map(i => { const a = i * Math.PI / 3; return `<circle cx="${120 + 44 * Math.cos(a)}" cy="${60 + 44 * Math.sin(a)}" r="9" ${F(i === 2 ? '--acc' : '--card')} ${S('--ink')} stroke-width="1.6"/>`; }).join('') +
      `<circle cx="${120 + 44 * Math.cos(2 * Math.PI / 3 + 0.35)}" cy="${60 + 44 * Math.sin(2 * Math.PI / 3 + 0.35)}" r="4" ${F('--acc2')}/>` +
      txt(120, 64, 'ring', 'middle')),
    /* memory budget with keys evicted from the bottom */
    redis: () => svg(
      box(20, 18, 130, 84, '--card') +
      [0, 1, 2, 3].map(i => `<rect x="34" y="${30 + i * 18}" width="${90 - i * 14}" height="11" rx="3" ${F(i === 3 ? '--p5' : '--p0')}/>`).join('') +
      txt(85, 110, 'maxmemory', 'middle', '--mut') +
      arrow(160, 40, 178, 40, "--bad") + box(180, 56, 50, 40, "--p5", "--bad") + txt(205, 81, "evict")),
    /* partitioned log: segments per partition, consumer offset as a marker */
    kafka: () => svg([0, 1, 2].map(r => {
      const y = 22 + r * 34;
      return txt(14, y + 14, 'P' + r, 'start', '--mut') + [0, 1, 2, 3, 4, 5].map(i => `<rect x="${34 + i * 32}" y="${y}" width="28" height="22" rx="4" ${F(i < 4 ? '--p1' : '--card')} ${S('--ink')} stroke-width="1.4"/>`).join('');
    }).join('') + `<path d="M${34 + 3 * 32 + 14} 10 L${34 + 3 * 32 + 14} 96" ${S('--acc')} stroke-width="2" stroke-dasharray="4 3"/>` + txt(34 + 3 * 32 + 14, 110, 'offset', 'middle', '--acc')),
    /* B-tree: a root with children and leaves */
    postgres: () => svg(
      box(92, 8, 56, 24, '--p0') + txt(120, 25, 'root') +
      box(34, 52, 56, 24, '--p0') + txt(62, 69, 'node') + box(150, 52, 56, 24, '--p0') + txt(178, 69, 'node') +
      [[14, 96], [56, 96], [100, 96], [142, 96], [186, 96]].map(([x, y]) => box(x, y - 4, 34, 20, '--p2') + txt(x + 17, y + 10, 'leaf')).join('') +
      arrow(108, 32, 74, 50) + arrow(132, 32, 166, 50) + arrow(70, 76, 40, 94) + arrow(78, 76, 70, 94) + arrow(170, 76, 118, 94) + arrow(176, 76, 186, 94)),
    /* pods on nodes */
    k8s: () => svg(
      box(12, 18, 104, 84, '--card', '--acc') + txt(64, 34, 'node a', 'middle', '--mut') +
      [0, 1, 2, 3].map(i => `<rect x="${24 + (i % 2) * 46}" y="${44 + Math.floor(i / 2) * 34}" width="38" height="26" rx="6" ${F('--p0')} ${S('--acc')}/>`).join('') +
      box(124, 18, 104, 84, '--card', '--acc') + txt(176, 34, 'node b', 'middle', '--mut') +
      [0, 1].map(i => `<rect x="${136 + i * 46}" y="44" width="38" height="26" rx="6" ${F('--p0')} ${S('--acc')}/>`).join('') +
      `<rect x="136" y="76" width="38" height="18" rx="6" ${F('--p5')} ${S('--bad')} stroke-dasharray="3 2"/>` + txt(176, 92, 'pending', 'middle', '--mut')),
    /* a lock shared by two threads */
    concurrency: () => svg(
      box(10, 30, 64, 60, '--p3') + txt(42, 66, 'thread A') +
      box(166, 30, 64, 60, '--p3') + txt(198, 66, 'thread B') +
      `<rect x="98" y="44" width="44" height="34" rx="6" ${F('--p4')} ${S('--ink')} stroke-width="1.8"/>` +
      `<path d="M106 44 V36 a14 14 0 0 1 28 0 V44" fill="none" ${S('--ink')} stroke-width="2.4"/>` +
      arrow(74, 60, 96, 60, '--mut') + arrow(166, 60, 144, 60, '--mut')),
    /* three nodes that must agree on a value */
    distributed: () => svg(
      `<circle cx="120" cy="22" r="16" ${F('--p6')} ${S('--ink')} stroke-width="1.8"/>` + txt(120, 27, 'A') +
      `<circle cx="52" cy="92" r="16" ${F('--p6')} ${S('--ink')} stroke-width="1.8"/>` + txt(52, 97, 'B') +
      `<circle cx="188" cy="92" r="16" ${F('--p6')} ${S('--ink')} stroke-width="1.8"/>` + txt(188, 97, 'C') +
      `<path d="M104 34 L64 78 M136 34 L176 78 M68 92 L172 92" ${S('--mut')} stroke-width="1.6" stroke-dasharray="4 4" fill="none"/>` +
      txt(120, 116, 'majority agrees', 'middle', '--mut')),
    /* two tables joined on a key */
    database: () => svg(
      box(12, 14, 96, 92, '--p0') + txt(60, 30, 'customers', 'middle') +
      [0, 1, 2].map(i => `<rect x="20" y="${40 + i * 20}" width="80" height="14" rx="3" ${F('--card')}/>`).join('') +
      box(132, 14, 96, 92, '--p2') + txt(180, 30, 'orders', 'middle') +
      [0, 1, 2].map(i => `<rect x="140" y="${40 + i * 20}" width="80" height="14" rx="3" ${F('--card')}/>`).join('') +
      `<path d="M100 47 L140 47 M100 67 L140 87" ${S('--ok')} stroke-width="2" fill="none"/>`),
    /* skills: a terminal with a command */
    skill: () => svg(
      box(14, 14, 212, 92, '--soft') +
      `<circle cx="28" cy="27" r="3.5" ${F('--bad')}/><circle cx="40" cy="27" r="3.5" ${F('--warn')}/><circle cx="52" cy="27" r="3.5" ${F('--ok')}/>` +
      txt(26, 52, '$ npx degit skill', 'start') + txt(26, 72, '> ready to use', 'start', '--ok') +
      `<rect x="26" y="82" width="${120}" height="10" rx="4" ${F('--p0')}/>`),
    /* blog: a page with lines */
    blog: () => svg(
      box(56, 10, 128, 100, '--card') +
      [0, 1, 2, 3, 4].map(i => `<rect x="72" y="${30 + i * 13}" width="${96 - (i % 2) * 20}" height="6" rx="3" ${F(i === 0 ? '--acc' : '--line')}/>`).join('')),
    /* generic fallback */
    generic: () => svg(box(40, 20, 160, 80, '--card') + txt(120, 66, 'lesson', 'middle', '--mut'))
  };

  /* Chapter-level thumbnail: a simple join with a highlighted match, used by the database lesson card. */
  T.join = T.database;
  window.Thumbs = { svg: name => (T[name] || T.generic)() };

  /* One shared sketchy-edge filter, used by card art through CSS: filter:url(#rough). */
  document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2"/></filter></svg>');
})();
