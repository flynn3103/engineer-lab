/* Router and page renderer for the Redis system-design course.
 * Routes: #/ (overview) · #/f/N (feature) · #/f/N/u/M (use case). N and M start at 1.
 * Content lives in spec.js (RD.spec, RD.features) and uc-*.js (RD.uc[featureId]); pictures in paint.js (RD.PAINT). */
(function () {
  'use strict';
  const RD = window.RD;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Narration text may carry <code> and <b>; everything else is escaped by the author, so it is passed through.
  const li = a => '<ul class="rd-list">' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
  const table = (head, rows) => '<table class="rd-t"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const feats = RD.features;
  const ucs = f => RD.uc[f.id] || [];

  function top(crumbs) {
    return '<div class="rd-top"><a href="../../../index.html">Engineer Lab</a><span>/</span><a href="../course.html">Redis course</a><span>/</span>' +
      crumbs.map((c, i) => i === crumbs.length - 1 ? '<span>' + c[0] + '</span>' : '<a href="' + c[1] + '">' + c[0] + '</a>').join('<span>/</span>') + '</div>';
  }

  function hldFlow() {
    const box = (id, t, s) => '<a href="#/f/' + id + '"><b>' + t + '</b><small>' + s + '</small></a>';
    return '<div class="rd-flow">' +
      '<div><b>Clients</b><small>RESP over TCP, pipelines, pools</small></div>' +
      box(1, '1 · Event loop', 'read, parse, run one command at a time') +
      box(2, '2 · Data', 'dict + compact encodings') +
      box(3, '3 · Memory', 'TTL, eviction, maxmemory') +
      box(4, '4 · Persistence', 'RDB fork, AOF append') +
      box(5, '5 · Replication', 'stream + backlog to replicas') +
      box(6, '6 · Sentinel', 'detect, elect, promote') +
      box(7, '7 · Cluster', '16384 slots across primaries') +
      box(8, '8 · Messaging', 'MULTI, streams, Pub/Sub') +
      '</div>';
  }

  function overview() {
    const s = RD.spec;
    const total = feats.reduce((n, f) => n + ucs(f).length, 0);
    return top([['Design an in-memory data server', '#/']]) +
      '<div class="rd-kick">Redis ' + esc(s.version) + ' · system-design course</div>' +
      '<h1>' + esc(s.title) + '</h1><p class="rd-lead">' + s.lead + '</p>' +
      '<p><span class="rd-pill">' + feats.length + ' features</span><span class="rd-pill">' + total + ' use cases</span><span class="rd-pill">a picture for every use case</span></p>' +
      '<h2>Overview</h2><div class="rd-card">' + s.overview.map(p => '<p>' + p + '</p>').join('') + '</div>' +
      '<h2>Problem statement</h2><div class="rd-card"><table class="rd-t"><tbody>' + s.problem.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</tbody></table></div>' +
      '<h2>Requirements</h2><div class="rd-two"><div class="rd-card"><h3>Functional</h3>' + li(s.fr) + '</div><div class="rd-card"><h3>Non-functional</h3>' + li(s.nfr) + '</div></div>' +
      '<div class="rd-card" style="margin-top:12px"><b>Out of scope.</b> ' + s.out + '</div>' +
      '<h2>Estimation</h2><p class="rd-src">Assumptions, not measurements. Replace each number with one from your own system.</p>' +
      '<div class="rd-card">' + table(['Question', 'Calculation', 'Implication'], s.est) + '</div>' +
      '<h2>High-level design</h2><div class="rd-card">' + hldFlow() + '<p class="rd-src" style="margin-top:10px">' + s.hldNote + '</p></div>' +
      '<div class="rd-card" style="margin-top:12px">' + table(['Decision', 'Choice', 'Trade-off'], s.decisions) + '</div>' +
      '<h2>Features</h2><div class="rd-grid">' + feats.map((f, i) =>
        '<a class="rd-card rd-fcard" href="#/f/' + (i + 1) + '"><b><span class="rd-num">' + (i + 1) + '</span>' + esc(f.name) + '</b><small>' + f.summary + '</small>' +
        '<div style="margin-top:8px">' + ucs(f).map(u => '<span class="rd-pill">' + esc(u.short || u.title) + '</span>').join('') + '</div></a>').join('') + '</div>' +
      '<h2>How the facts were checked</h2><div class="rd-card">' + li(s.verify) + '</div>';
  }

  function feature(n) {
    const f = feats[n - 1]; if (!f) return notFound();
    const prev = feats[n - 2], next = feats[n];
    return top([['Features', '#/'], [esc(f.name), '#/f/' + n]]) +
      '<div class="rd-kick">Feature ' + n + ' of ' + feats.length + '</div><h1>' + esc(f.name) + '</h1><p class="rd-lead">' + f.summary + '</p>' +
      '<div class="rd-two"><div class="rd-card"><h3>Goal</h3><p>' + f.goal + '</p><h3>In scope</h3>' + li(f.scope[0]) + '<h3>Out of scope</h3>' + li(f.scope[1]) + '</div>' +
      '<div class="rd-card"><h3>Functional requirements</h3>' + li(f.fr) + '<h3>Non-functional requirements</h3>' + li(f.nfr) + '</div></div>' +
      '<h2>High-level design</h2><div class="rd-card"><pre>' + esc(f.hld) + '</pre>' + table(['Decision', 'Choice', 'Trade-off'], f.decisions) + '</div>' +
      '<h2>Use cases</h2><div class="rd-grid">' + ucs(f).map((u, i) =>
        '<a class="rd-card rd-fcard" href="#/f/' + n + '/u/' + (i + 1) + '"><b>UC-' + (i + 1) + ' · ' + esc(u.title) + '</b><small>' + u.intro + '</small></a>').join('') + '</div>' +
      '<div class="rd-nav">' + (prev ? '<a href="#/f/' + (n - 1) + '">← ' + esc(prev.name) + '</a>' : '<span></span>') +
      (next ? '<a href="#/f/' + (n + 1) + '">' + esc(next.name) + ' →</a>' : '<span></span>') + '</div>';
  }

  let player = null;
  function useCase(n, m) {
    const f = feats[n - 1], u = f && ucs(f)[m - 1]; if (!u) return notFound();
    const list = ucs(f);
    const prevHref = m > 1 ? '#/f/' + n + '/u/' + (m - 1) : (n > 1 ? '#/f/' + (n - 1) + '/u/' + ucs(feats[n - 2]).length : null);
    const nextHref = m < list.length ? '#/f/' + n + '/u/' + (m + 1) : (n < feats.length ? '#/f/' + (n + 1) + '/u/1' : null);
    const html = top([[esc(f.name), '#/f/' + n], ['UC-' + m, '#/f/' + n + '/u/' + m]]) +
      '<div class="rd-kick">Feature ' + n + ' · use case ' + m + ' of ' + list.length + '</div><h1>' + esc(u.title) + '</h1><p class="rd-lead">' + u.intro + '</p>' +
      '<div class="rd-two"><div class="rd-card"><h3>Trigger</h3><p>' + u.trigger + '</p><h3>Expect</h3><p>' + u.expect + '</p></div>' +
      '<div class="rd-card"><h3>Run</h3><pre>' + esc(u.run) + '</pre></div></div>' +
      '<h2>Step by step</h2><div class="rd-card" id="rd-player"><div class="pv" id="rd-pic" aria-live="polite"></div>' +
      '<div class="rd-step" id="rd-txt"></div><div class="rd-stat" id="rd-stat"></div>' +
      '<div class="rd-btns"><button class="rd-btn" id="rd-back">← Back</button><button class="rd-btn pri" id="rd-next">Next →</button><button class="rd-btn" id="rd-reset">Restart</button><span class="rd-dots" id="rd-dots"></span></div></div>' +
      '<h2>Edge cases</h2>' + u.edges.map(e => '<div class="rd-edge"><b>' + esc(e.t) + '</b><p><i>Context.</i> ' + e.ctx + '</p><p><i>Solution.</i> ' + e.fix + '</p></div>').join('') +
      '<h2>Invariant</h2><div class="rd-inv">' + u.invariant + '</div>' +
      '<p class="rd-src">Sources: ' + u.src + '</p>' +
      '<div class="rd-nav">' + (prevHref ? '<a href="' + prevHref + '">← Previous use case</a>' : '<span></span>') +
      (nextHref ? '<a href="' + nextHref + '">Next use case →</a>' : '<a href="#/">Back to overview</a>') + '</div>';
    app.innerHTML = html + foot;
    mountPlayer(u);
  }

  function mountPlayer(u) {
    const paint = RD.PAINT[u.kind];
    const pic = document.getElementById('rd-pic'), txt = document.getElementById('rd-txt'), stat = document.getElementById('rd-stat'), dots = document.getElementById('rd-dots');
    const back = document.getElementById('rd-back'), next = document.getElementById('rd-next'), reset = document.getElementById('rd-reset');
    let i = 0;
    function show() {
      const st = u.steps[i];
      pic.innerHTML = paint(st.s, st);
      txt.innerHTML = '<h3>' + (i + 1) + '. ' + st.t + '</h3><p>' + st.x + '</p>';
      stat.innerHTML = st.stat || '&nbsp;';
      dots.innerHTML = u.steps.map((_, k) => '<i class="' + (k === i ? 'on' : k < i ? 'done' : '') + '"></i>').join('');
      back.disabled = i === 0; next.disabled = i === u.steps.length - 1;
    }
    back.onclick = () => { if (i > 0) { i--; show(); } };
    next.onclick = () => { if (i < u.steps.length - 1) { i++; show(); } };
    reset.onclick = () => { i = 0; show(); };
    player = e => {
      if (e.key === 'ArrowRight') next.click();
      else if (e.key === 'ArrowLeft') back.click();
    };
    show();
  }

  const foot = '<p class="rd-src" style="margin-top:40px">Built with the <a href="../../../skills.html?q=learn-technology-from-scratch">learn-technology-from-scratch</a> skill. Numbers marked as examples are assumptions, not measurements. Targets Redis 7.2.</p>';
  function notFound() { return top([['Not found', '#/']]) + '<h1>Not found</h1><p><a href="#/">Back to the overview</a></p>'; }

  function render() {
    player = null;
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    let html;
    if (!p.length) { html = overview(); document.title = RD.spec.title + ' · Redis'; }
    else if (p[0] === 'f' && p[2] === 'u') { useCase(+p[1], +p[3]); window.scrollTo(0, 0); document.title = (feats[p[1] - 1] ? feats[p[1] - 1].name : '') + ' · Redis design'; return; }
    else if (p[0] === 'f') { html = feature(+p[1]); document.title = (feats[p[1] - 1] ? feats[p[1] - 1].name : 'Redis') + ' · Redis design'; }
    else html = notFound();
    app.innerHTML = html + foot; window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('keydown', e => { if (player && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) player(e); });
  render();
})();
