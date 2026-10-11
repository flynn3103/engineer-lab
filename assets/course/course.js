/* Course engine: shell, router and page templates for a system-design course page.
 * Layout is the Spark course's: sticky top bar, left navigation with nested use cases, page head, jump bar,
 * numbered sections, feature and use-case cards, pager. Diagrams are Mermaid, loaded on demand.
 * Usage (after the data files, kit.js and contract.js):   Course.mount(CourseData)
 * Routes: #/ (overview) · #/f/N (feature) · #/f/N/u/M (use case). N and M start at 1.
 * The data contract is documented in contract.js and assets/course/README.md. */
(function (root) {
  'use strict';
  const Course = root.Course = root.Course || {};
  const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
  Course.mount = function (RD, opts) {
  opts = opts || {};
  const cfg = RD.config;
  const app = opts.el || document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Narration and spec text carry a little inline markup (<code>, <b>) written by the author, so it is passed through.
  const list = a => '<ul>' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
  const table = (head, rows) => '<div class="table-scroll"><table><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  const feats = RD.features;
  const ucs = f => RD.uc[f.id] || [];
  const pad = n => String(n).padStart(2, '0');
  const TONES = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const tone = i => 'var(--' + TONES[i % TONES.length] + ')';
  const firstSentence = t => { const p = String(t).replace(/<[^>]+>/g, ''); return p.length <= 110 ? p : (p.match(/^.*?[.!?](\s|$)/) || [p])[0].trim(); };
  const href = (n, m) => '#/' + (n ? 'f/' + n + (m ? '/u/' + m : '') : '');
  const section = (id, n, title, body, sub) => '<section class="sec" id="' + id + '"><h2><span>' + pad(n) + '</span>' + title + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>';
  const chips = items => '<div class="chips">' + items.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>';
  const jump = items => '<nav class="jump" aria-label="On this page">' + items.map(([id, l]) => '<a href="#' + id + '" data-jump>' + l + '</a>').join('') + '</nav>';

  /* ---------- diagrams (Mermaid, loaded on demand) ---------- */
  const diagram = (d, hero) => '<figure class="diagram' + (hero ? ' diagram-hero' : '') + '"><figcaption><b>' + esc(d.kind) + '</b>' + (d.title ? ' · ' + esc(d.title) : '') +
    '</figcaption><div class="diagram-body" data-mermaid><pre class="diagram-src">' + esc(d.src.trim()) + '</pre></div></figure>';
  let loading;
  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = MERMAID;
      el.onload = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('mermaid missing'));
      el.onerror = () => { loading = null; reject(new Error('mermaid failed to load')); };
      document.head.appendChild(el);
    });
    return loading;
  }
  /* Mermaid cannot read CSS variables, so resolve the site palette at draw time. */
  function themeVars() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const ink = v('--ink'), card = v('--card'), line = v('--line');
    return { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: '13px', background: card, primaryColor: v('--p0'), primaryBorderColor: ink, primaryTextColor: ink,
      secondaryColor: v('--p1'), secondaryBorderColor: ink, secondaryTextColor: ink, tertiaryColor: v('--p2'), tertiaryBorderColor: ink, tertiaryTextColor: ink,
      lineColor: ink, textColor: ink, mainBkg: v('--p0'), nodeBorder: ink, clusterBkg: v('--soft'), clusterBorder: line, edgeLabelBackground: card, titleColor: ink,
      actorBkg: v('--p0'), actorBorder: ink, actorTextColor: ink, actorLineColor: line, signalColor: ink, signalTextColor: ink, labelBoxBkgColor: v('--p4'), labelBoxBorderColor: ink, labelTextColor: ink,
      noteBkgColor: v('--p4'), noteBorderColor: ink, noteTextColor: ink, activationBkgColor: v('--p2'), activationBorderColor: ink, sequenceNumberColor: card,
      stateBkg: v('--p2'), stateLabelColor: ink, altBackground: v('--soft') };
  }
  /* A diamond grows with its label width, so wrap long decision labels onto short lines. */
  const wrapDecisions = src => src.replace(/\{"([^"]*)"\}/g, (m, t) => {
    if (t.includes('<br')) return m;
    const lines = []; let cur = '';
    for (const w of t.split(' ')) { if (cur && (cur + ' ' + w).length > 16) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) lines.push(cur);
    return '{"' + lines.join('<br/>') + '"}';
  });
  let counter = 0;
  async function draw(container) {
    const nodes = [...container.querySelectorAll('[data-mermaid]:not([data-drawn])')];
    if (!nodes.length) return;
    let m;
    try { m = await loadMermaid(); } catch (e) {
      nodes.forEach(n => n.insertAdjacentHTML('beforebegin', '<p class="diagram-offline">Diagram renderer unavailable offline. Showing the Mermaid source.</p>'));
      return;
    }
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVars(), flowchart: { htmlLabels: true, curve: 'basis', padding: 8 }, sequence: { useMaxWidth: true, mirrorActors: false } });
    for (const n of nodes) {
      try {
        const { svg } = await m.render('mmd-' + (++counter), wrapDecisions(n.querySelector('pre').textContent));
        if (!n.isConnected) continue;
        n.innerHTML = svg; n.setAttribute('data-drawn', '1');
      } catch (e) {
        n.setAttribute('data-drawn', 'error');
        n.insertAdjacentHTML('beforebegin', '<p class="diagram-offline">This diagram could not be rendered. Showing its source.</p>');
        const bad = document.getElementById('dmmd-' + counter); if (bad) bad.remove();
      }
    }
  }

  /* ---------- page templates ---------- */
  const scopeList = sc => Array.isArray(sc[0]) ? sc[0].map(x => 'In scope: ' + x).concat(sc[1].map(x => 'Out of scope: ' + x)) : sc;
  const contractsTable = c => '<h3>Component contracts</h3>' + table(['Component', 'Interface', 'Guarantee'], c);
  let secNo = 0;
  const numbered = (id, title, body, sub) => section(id, ++secNo, title, body, sub);

  function featureCard(f, i) {
    return '<a class="ccard" href="' + href(i + 1) + '"><div class="art" style="--p:' + tone(i) + '"><svg viewBox="0 0 200 90" aria-hidden="true"><rect x="22" y="22" width="156" height="46" rx="10" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/>' +
      '<text x="100" y="51" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="15" font-weight="700" fill="var(--ink)">' + esc(f.tag) + '</text></svg><span class="flag">' + pad(i + 1) + '</span></div>' +
      '<div class="body"><h3>' + esc(f.name) + '</h3><p>' + f.summary + '</p><div class="chips"><span>' + ucs(f).length + ' use case' + (ucs(f).length > 1 ? 's' : '') + '</span></div></div></a>';
  }
  function useCaseCards(f, n) {
    return '<div class="ucgrid">' + ucs(f).map((u, i) => {
      const kinds = [...new Set((RD.diagrams[f.id + ':' + (i + 1)] || []).map(d => d.kind.toLowerCase()))].concat([u.custom ? 'simulation' : 'picture']);
      return '<a class="uccard" href="' + href(n, i + 1) + '"><span class="ucn">UC-' + pad(i + 1) + '</span><h3>' + esc(u.title) + '</h3><p>' + (u.blurb || firstSentence(u.intro)) + '</p>' +
        '<div class="chips">' + kinds.map(k => '<span>' + esc(k) + '</span>').join('') + '</div><b class="go">Go deeper →</b></a>';
    }).join('') + '</div>';
  }

  function overview() {
    const s = RD.spec, total = feats.reduce((n, f) => n + ucs(f).length, 0), strip = t => t.replace(/^<b>[^<]*<\/b>\s*/, '');
    secNo = 0;
    const nav = [], add = (id, label) => nav.push([id, label]);
    let body = '';
    if (s.overview) { add('overview', 'Overview'); body += numbered('overview', 'Overview', '<div class="two"><div><h3>What it is</h3><p>' + strip(s.overview[0]) + '</p></div><div><h3>Who does what</h3><p>' + strip(s.overview[1]) + '</p></div></div>'); }
    add('problem', 'Problem');
    if (s.problem) body += numbered('problem', 'Problem statement', '<p class="lead-problem">' + s.problem[0][1] + '</p><div class="two"><div><h3>Naive design</h3><p>' + s.problem[1][1] + '</p></div><div><h3>Fails when</h3><p>' + s.problem[2][1] + '</p></div></div><p class="note"><b>Principle.</b> ' + s.problem[3][1] + '</p>');
    else body += numbered('problem', 'Problem statement', '<p class="lead-problem">' + s.problemLead + '</p>' + (s.inherited ? '<p><b>Starting point.</b> ' + s.inherited + '</p>' : '') +
      (s.goal ? '<div class="two"><div><h3>Goal</h3><p>' + s.goal + '</p></div><div><h3>Scope</h3>' + list(scopeList(s.scope || [])) + '</div></div>' : ''));
    add('spec', 'Spec');
    body += numbered('spec', 'Functional and non-functional spec', '<div class="two"><div><h3>Functional requirements</h3>' + list(s.fr) + '</div><div><h3>Non-functional requirements</h3>' + list(s.nfr) + '</div></div>' +
      (s.contracts ? contractsTable(s.contracts) : '') + (s.out ? '<p class="note"><b>Out of scope.</b> ' + s.out + '</p>' : ''));
    add('estimate', 'Estimation');
    body += numbered('estimate', 'Back-of-the-envelope estimation', '<p class="assume"><b>Assumptions.</b> ' + (s.estAssume || 'These are assumptions, not measurements. Replace each number with one from your own system.') + '</p>' +
      table(['Question', 'Calculation', 'Implication'], s.est) + (s.estNote ? '<p class="note"><b>Reading the numbers.</b> ' + s.estNote + '</p>' : ''));
    add('hld', 'High-level design');
    body += numbered('hld', 'High-level design', diagram({ kind: 'Flowchart', title: 'Components and flows', src: RD.hldOverall }, true) + '<p class="caption">' + s.hldNote + '</p>' +
      '<div class="c-hld-links">' + feats.map((f, i) => '<a href="' + href(i + 1) + '">' + pad(i + 1) + ' · ' + esc(f.tag) + '</a>').join('') + '</div>' + table(['Decision', 'Choice', 'Trade-off'], s.decisions));
    add('features', 'Features');
    body += numbered('features', 'Features', '<div class="cgrid">' + feats.map(featureCard).join('') + '</div>', 'Pick a feature to see its own spec, design and use cases.');
    if (s.verify) { add('checks', 'Checks'); body += numbered('checks', 'How the facts were checked', '<div class="note">' + list(s.verify) + '</div>'); }
    return '<header class="page-head"><p class="kick">OVERVIEW · SYSTEM DESIGN</p><h1>' + esc(s.title) + '</h1><p class="lead">' + s.lead + '</p>' +
      chips([feats.length + ' features', total + ' use cases', cfg.name + ' ' + cfg.version]) + '</header>' + jump(nav) + body;
  }

  function feature(n) {
    const f = feats[n - 1], prev = feats[n - 2], next = feats[n];
    secNo = 0;
    const scopeCards = '<div class="two"><div><h3>Goal</h3><p>' + f.goal + '</p></div><div><h3>Scope</h3>' + list(scopeList(f.scope)) + '</div></div>';
    return '<header class="page-head"><p class="kick">FEATURE ' + pad(n) + ' · ' + esc(f.tag.toUpperCase()) + '</p><h1>' + esc(f.name) + '</h1>' + (f.problem ? '' : '<p class="lead">' + f.summary + '</p>') + '</header>' +
      (f.problem ? numbered('problem', 'Problem statement', '<p class="lead-problem">' + f.problem + '</p>' + (f.inherited ? '<p><b>Starting point.</b> ' + f.inherited + '</p>' : '') + scopeCards)
        : numbered('goal', 'Goal and scope', scopeCards)) +
      numbered('spec', 'Functional and non-functional spec', '<div class="two"><div><h3>Functional requirements</h3>' + list(f.fr) + '</div><div><h3>Non-functional requirements</h3>' + list(f.nfr) + '</div></div>' + (f.contracts ? contractsTable(f.contracts) : '')) +
      numbered('hld', 'High-level design', diagram({ kind: 'Flowchart', title: 'Components and flows', src: RD.hld[f.id] }, true) + (f.hldCaption ? '<p class="caption">' + f.hldCaption + '</p>' : '') + table(['Decision', 'Choice', 'Trade-off'], f.decisions)) +
      numbered('usecases', 'Use cases', useCaseCards(f, n), 'Pick one to see how it works, step by step.') +
      '<nav class="pager" aria-label="Previous and next feature"><a href="' + href(n > 1 ? n - 1 : 0) + '"><small>' + (prev ? 'PREVIOUS FEATURE' : 'BACK TO') + '</small><b>← ' + esc(prev ? prev.name : 'Overview') + '</b></a>' +
      (next ? '<a class="next" href="' + href(n + 1) + '"><small>NEXT FEATURE</small><b>' + esc(next.name) + ' →</b></a>' : '') + '</nav>';
  }

  function edgeCard(e, i) {
    return '<details class="edgecard"><summary><span class="en">' + (i + 1) + '</span><span class="et"><b>' + esc(e.t) + '</b><small>' + (e.short || firstSentence(e.ctx)) + '</small></span><span class="ex" aria-hidden="true"></span></summary>' +
      '<div class="eb"><div><h4>Context</h4><p>' + e.ctx + '</p></div><div><h4>Solution</h4><p>' + e.fix + '</p></div></div></details>';
  }

  let player = null;
  function useCase(n, m) {
    const f = feats[n - 1], L = ucs(f), u = L[m - 1], prev = L[m - 2], next = L[m];
    secNo = 0;
    return '<header class="page-head"><p class="kick">FEATURE ' + pad(n) + ' · USE CASE ' + pad(m) + '</p><h1>' + esc(u.title) + '</h1></header>' +
      numbered('trigger', 'Trigger', '<p class="lead-problem">' + u.trigger + '</p>' + (u.run ? '<div class="cmd"><span>Run</span><code>' + esc(u.run) + '</code></div>' : '') + (u.expect ? '<p class="expect"><b>Expect.</b> ' + u.expect + '</p>' : '')) +
      numbered('flow', 'Diagrams', (RD.diagrams[f.id + ':' + m] || []).map(d => diagram(d, true)).join(''), u.intro) +
      (u.custom ? numbered('steps', 'Step by step', u.custom, 'Press Next step to walk through it one move at a time.') :
        numbered('steps', 'Step by step', '<div class="c-player"><div class="pv-stage" id="c-stage"><div class="pv" id="c-pic" aria-live="polite"></div></div>' +
        '<div class="c-inspector"><p class="kick" id="c-kick"></p><h3 id="c-title"></h3><p id="c-text"></p><div class="c-stat" id="c-stat"></div></div>' +
        '<div class="c-controls" role="group" aria-label="Step controls"><button id="c-reset" aria-label="Restart">↺</button><button id="c-back">← Back</button><button id="c-next" class="go">Next step →</button><span class="c-dots" id="c-dots"></span></div></div>',
        'Press Next step to walk through it one move at a time. The arrow keys work too.')) +
      numbered('edges', 'Edge cases and failure modes', '<div class="edges">' + u.edges.map(edgeCard).join('') + '</div>') +
      (u.invariant ? numbered('rule', 'Invariant', '<div class="invariant"><b>Must always hold</b><p>' + u.invariant + '</p></div>' + (u.src ? '<p class="sub" style="margin-top:14px">Sources: ' + u.src + '</p>' : '')) : '') +
      '<nav class="pager" aria-label="Use cases"><a href="' + (prev ? href(n, m - 1) : href(n)) + '"><small>' + (prev ? 'PREVIOUS USE CASE' : 'BACK TO') + '</small><b>← ' + esc(prev ? prev.title : f.name) + '</b></a>' +
      (next ? '<a class="next" href="' + href(n, m + 1) + '"><small>NEXT USE CASE</small><b>' + esc(next.title) + ' →</b></a>' : '<a class="next" href="' + href(n) + '"><small>BACK TO</small><b>' + esc(f.name) + ' →</b></a>') + '</nav>';
  }

  /* A painter returns html, or { html, stat, bare } (bare drops the stage frame when the painter draws its own). */
  function mountPlayer(u) {
    const paint = RD.PAINT[u.kind] || (() => '<p class="faint">No painter named ' + esc(u.kind) + '.</p>'), $ = id => document.getElementById(id);
    let i = 0;
    function show() {
      const st = u.steps[i], r = paint(st.s, st), o = typeof r === 'string' ? { html: r } : r;
      $('c-pic').innerHTML = o.html;
      $('c-stage').classList.toggle('bare', !!o.bare);
      $('c-kick').textContent = 'STEP ' + (i + 1) + ' OF ' + u.steps.length;
      $('c-title').textContent = st.t;
      $('c-text').innerHTML = st.x;
      $('c-stat').innerHTML = o.stat || st.stat || '&nbsp;';
      $('c-dots').innerHTML = u.steps.map((_, k) => '<i class="' + (k === i ? 'on' : k < i ? 'done' : '') + '"></i>').join('');
      $('c-back').disabled = i === 0; $('c-next').disabled = i === u.steps.length - 1;
    }
    $('c-back').onclick = () => { if (i > 0) { i--; show(); } };
    $('c-next').onclick = () => { if (i < u.steps.length - 1) { i++; show(); } };
    $('c-reset').onclick = () => { i = 0; show(); };
    player = e => { if (e.key === 'ArrowRight') $('c-next').click(); else if (e.key === 'ArrowLeft') $('c-back').click(); };
    show();
  }

  const notFound = () => '<header class="page-head"><p class="kick">NOT FOUND</p><h1>No such page</h1></header><p><a href="#/">Back to the overview</a></p>';

  /* ---------- shell ---------- */
  if (!document.getElementById('rough')) document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></svg>');
  if (cfg.brand) app.style.setProperty('--brand', cfg.brand);
  app.className = 'course';
  app.innerHTML = '<a class="skip-link" href="#course-main">Skip to content</a>' +
    '<header class="course-top"><button id="menu-toggle" aria-label="Show navigation" aria-controls="course-sidebar" aria-expanded="false">☰</button><nav aria-label="Breadcrumb" id="breadcrumb"></nav><span class="course-version">SYSTEM DESIGN · ' + esc((cfg.name + ' ' + cfg.version).toUpperCase()) + '</span></header>' +
    '<div class="course-layout"><aside class="course-sidebar" id="course-sidebar"><label class="search-label" for="course-search">Find a feature</label><input id="course-search" type="search" placeholder="Search features…"><nav id="chapter-nav" aria-label="Pages"></nav></aside>' +
    '<main id="course-main" tabindex="-1"><article id="page"></article><footer class="course-foot">' + (cfg.footer || 'A model of ' + esc(cfg.name) + ' ' + esc(cfg.version) + ' for learning. Numbers marked as examples are assumptions, not measurements.') + ' This course was built with the <a href="' + esc(cfg.root) + 'skills.html?q=learn-technology-from-scratch">learn-technology-from-scratch</a> skill.</footer></main></div>' +
    '<button id="sidebar-scrim" class="sidebar-scrim" aria-label="Close navigation" hidden></button>';
  const $ = id => document.getElementById(id);
  let route = { n: 0, m: 0 };

  function renderNav() {
    const q = $('course-search').value.trim().toLowerCase();
    const link = (h, text, cls, cur) => '<a href="' + h + '"' + (cur ? ' aria-current="page"' : '') + ' class="' + (cls || '') + '">' + text + '</a>';
    const shown = feats.map((f, i) => [f, i]).filter(([f]) => !q || [f.name, f.summary, f.tag].some(x => x.toLowerCase().includes(q)));
    $('chapter-nav').innerHTML = (q ? '' : '<p class="nav-group">Overview</p>' + link(href(0), '<span>◆</span><div><b>' + esc(RD.spec.navTitle || RD.spec.title) + '</b><small>The whole system on one page</small></div>', 'nav-item', !route.n)) +
      '<p class="nav-group">Features</p>' + (shown.map(([f, i]) => link(href(i + 1), '<span>' + pad(i + 1) + '</span><div><b>' + esc(f.name) + '</b><small>' + f.summary + '</small></div>', 'nav-item', route.n === i + 1 && !route.m) +
        (route.n === i + 1 ? '<div class="nav-uc">' + ucs(f).map((u, k) => link(href(i + 1, k + 1), esc(u.title), '', route.m === k + 1)).join('') + '</div>' : '')).join('') || '<p class="empty-state">No matching feature.</p>') +
      ((cfg.related || []).length ? '<p class="nav-group">Related</p>' + cfg.related.map(r => link(r.href, '<span>↗</span><div><b>' + esc(r.title) + '</b><small>' + esc(r.sub || '') + '</small></div>', 'nav-item', false)).join('') : '');
  }
  function renderCrumb() {
    const parts = ['<a href="' + esc(cfg.root) + 'tech.html">Tech Stack</a>', '<a href="' + href(0) + '">' + esc(cfg.name) + '</a>'];
    const f = feats[route.n - 1];
    if (f) parts.push(route.m ? '<a href="' + href(route.n) + '">' + esc(f.name) + '</a>' : '<b>' + esc(f.name) + '</b>');
    if (f && route.m && ucs(f)[route.m - 1]) parts.push('<b>' + esc(ucs(f)[route.m - 1].title) + '</b>');
    $('breadcrumb').innerHTML = parts.join('<span>›</span>');
  }
  function closeMenu() { $('course-sidebar').classList.remove('open'); $('sidebar-scrim').hidden = true; $('menu-toggle').setAttribute('aria-expanded', 'false'); }

  function render() {
    player = null;
    /* old links of the form #c=<featureId>&uc=<n> keep working */
    if (/^#c=/.test(location.hash)) { const q = new URLSearchParams(location.hash.slice(1)), k = feats.findIndex(f => f.id === q.get('c')), uc = +q.get('uc') || 0;
      history.replaceState(null, '', k < 0 ? '#/' : '#/f/' + (k + 1) + (uc && ucs(feats[k])[uc - 1] ? '/u/' + uc : '')); }
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    route = p[0] === 'f' ? { n: +p[1] || 0, m: p[2] === 'u' ? +p[3] || 0 : 0 } : { n: 0, m: 0 };
    const page = $('page'); let title = RD.spec.title;
    const f = feats[route.n - 1], u = f && route.m ? ucs(f)[route.m - 1] : null;
    if ((route.n && !f) || (route.m && !u)) { page.innerHTML = notFound(); route = { n: 0, m: 0 }; }
    else if (u) { page.innerHTML = useCase(route.n, route.m); if (!u.custom) mountPlayer(u); title = u.title + ' · ' + f.name; }
    else if (f) { page.innerHTML = feature(route.n); title = f.name; }
    else page.innerHTML = overview();
    document.title = title + ' · ' + cfg.name + ' design';
    renderNav(); renderCrumb(); closeMenu(); window.scrollTo(0, 0); draw(page);
    if (cfg.afterRender) cfg.afterRender(page);
  }

  $('menu-toggle').onclick = () => { const o = $('course-sidebar').classList.toggle('open'); $('sidebar-scrim').hidden = !o; $('menu-toggle').setAttribute('aria-expanded', String(o)); };
  $('sidebar-scrim').onclick = closeMenu;
  $('course-search').oninput = renderNav;
  document.addEventListener('click', e => { const a = e.target.closest('a[data-jump]'); if (a) { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' }); } });
  window.addEventListener('hashchange', render);
  window.addEventListener('keydown', e => { if (player && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) player(e); });
  render();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
