/* Router, shell and the embedded animation lab. Routes:
   #c=architecture              overview of the whole system
   #c=<feature>                 one feature (spec, estimate, design, use cases, animation)
   #c=<feature>&uc=<n>          one use case of that feature, on its own page
   Options such as partitions or executors are query parameters and carry across features. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./engine-model.js') : root.SparkEngine, node ? require('./engine-curriculum.js') : root.SparkCurriculum,
    node ? require('./engine-sysdesign.js') : root.SparkSystemDesign, node ? require('./engine-pages.js') : root.SparkPages);
  if (node) module.exports = api;
  else { root.SparkCourse = api; api.mount(document.getElementById('app')); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, C, SD, Pages) {
  'use strict';
  const esc = SD.esc, D = SD.data;
  const byId = id => C.chapters.find(c => c.id === id);

  function parseRoute(hash = '') {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const chapter = D[p.get('c')] ? p.get('c') : 'architecture';
    const uc = Number(p.get('uc')), step = Number(p.get('step'));
    return {
      chapter,
      uc: Number.isInteger(uc) && uc >= 1 && uc <= D[chapter].uc.length ? uc : 0,
      focus: SD.animated.has(chapter) && (p.get('focus') === 'lab' || p.get('view') === 'visualize') ? 'lab' : '',
      step: Number.isFinite(step) ? Math.max(0, Math.min(10000, Math.floor(step) - 1)) : 0,
      options: M.normalizeOptions(Object.fromEntries(p))
    };
  }
  function serializeRoute(state) {
    const chapter = D[state.chapter] ? state.chapter : 'architecture', p = new URLSearchParams({ c: chapter });
    if (state.uc) p.set('uc', String(state.uc));
    if (state.focus === 'lab' && !state.uc) p.set('focus', 'lab');
    if (state.step > 0 && SD.animated.has(chapter) && !state.uc) p.set('step', String(state.step + 1));
    const o = M.normalizeOptions(state.options);
    for (const key of Object.keys(M.DEFAULTS)) if (o[key] !== M.DEFAULTS[key]) p.set(key, String(o[key]));
    return '#' + p;
  }

  function labHTML(chapter, state) {
    const controls = chapter.controls.map(key => {
      const c = C.controls[key], value = state.options[key];
      let field;
      if (c.type === 'toggle') field = `<input type="checkbox" id="input-${key}" data-option="${key}"${value ? ' checked' : ''}><span class="toggle-track" aria-hidden="true"></span>`;
      else if (c.type === 'select') field = `<select id="input-${key}" data-option="${key}">${c.choices.map(([v, label]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
      else field = `<input type="range" id="input-${key}" data-option="${key}" min="${M.RANGES[key][0]}" max="${M.RANGES[key][1]}" value="${value}" aria-describedby="hint-${key}"><output for="input-${key}" id="value-${key}">${value}</output>`;
      return `<div class="lab-input${c.type === 'toggle' ? ' toggle-input' : ''}"><label for="input-${key}">${esc(c.label)}</label><div class="input-field">${field}</div><small id="hint-${key}">${esc(c.hint)}</small></div>`;
    }).join('');
    return `<div class="lab" id="visualization">
      <div class="lab-head"><h3>${esc(chapter.short)}</h3><span class="chip-note">Calculated teaching model · 12-order CSV · paid orders summed by city</span></div>
      <div id="lab-controls" class="lab-controls">${controls}<button data-action="reset-inputs" class="reset-inputs">Reset inputs</button></div>
      <div id="metrics" class="lab-metrics" aria-label="Current calculated metrics"></div>
      <div class="lab-workspace"><div class="scene-column"><div class="scene-heading"><span id="scene-phase"></span><div class="flow-legend"><span class="control-key">Control / demand</span><span class="data-key">Data / state</span></div></div><div class="engine-canvas"><svg id="engine-svg" viewBox="0 0 900 485" role="img" aria-label="Engine mechanism"></svg></div>
      <div class="lab-player" role="group" aria-label="Animation playback"><button data-action="restart" aria-label="Restart">↺</button><button data-action="previous" id="prev-step" aria-label="Previous step">←</button><button data-action="play" id="play" class="play-button" aria-label="Play">▶ Play</button><button data-action="next" id="next-step" aria-label="Next step">→</button><input type="range" id="scrubber" min="0" value="0" aria-label="Animation step"><output id="step-count" for="scrubber"></output><select id="play-speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></div>
      <nav id="phase-nav" class="phase-nav" aria-label="Select an execution phase"></nav></div>
      <aside class="step-inspector" aria-label="Current transition"><p class="kick" id="transition-number"></p><h3 id="transition-title"></h3><p id="transition-why"></p><div id="transition-change"></div><p class="inspector-contract" id="transition-contract"></p></aside></div>
      <details class="implementation-detail"><summary>Inspect the algorithm and observable state</summary><div class="implementation-grid"><section class="algorithm-panel"><p class="kick">CONCEPTUAL ALGORITHM</p><ol id="algorithm"></ol><p class="model-limit">Describes the mechanism. It is not a line-by-line trace of Spark’s source.</p></section><section class="state-panel"><p class="kick">OBSERVABLE STATE</p><h4 id="state-title">Inspect identities and values</h4><div id="state-table"></div></section></div></details>
      <section class="experiment-panel" id="experiment"><p class="kick">TRY A CAUSAL CHANGE</p><h4>${esc(chapter.experiment[0])}</h4><p>${esc(chapter.experiment[1])}</p><details><summary>What should change?</summary><p>${esc(chapter.experiment[2])}</p></details></section></div>`;
  }

  function mount(app) {
    let state = parseRoute(location.hash), trace, chapter, playing = false, timer, speed = 1;
    const $ = id => document.getElementById(id);
    const href = (over = {}) => serializeRoute({ ...state, uc: 0, focus: '', step: 0, ...over });

    app.className = 'spark-course';
    app.innerHTML = `<a class="skip-link" href="#course-main">Skip to content</a>
      <header class="course-top"><button id="menu-toggle" aria-label="Show navigation" aria-controls="course-sidebar" aria-expanded="false">☰</button><nav aria-label="Breadcrumb" id="breadcrumb"></nav><span class="course-version">SYSTEM DESIGN · SPARK 3.5</span></header>
      <div class="course-layout"><aside class="course-sidebar" id="course-sidebar"><label class="search-label" for="course-search">Find a feature</label><input id="course-search" type="search" placeholder="Search features…"><nav id="chapter-nav" aria-label="Pages"></nav></aside>
      <main id="course-main" tabindex="-1"><article id="page"></article><footer class="course-foot">A finite batch engine model grounded in Spark 3.5. Capacity numbers are stated assumptions, not measurements. Real transport, disk I/O and transactional table storage are extension boundaries.</footer></main></div><button id="sidebar-scrim" class="sidebar-scrim" aria-label="Close navigation" hidden></button>`;

    const mobile = window.matchMedia('(max-width:850px)');
    const label = id => id === 'architecture' ? 'Overview' : D[id].name;
    const ucName = (id, n) => D[id].uc[n - 1].title.replace(/^UC-\d+ · /, '');

    function renderNav() {
      const q = $('course-search').value.trim().toLowerCase();
      const link = (over, text, extra = '', cur = false) => `<a href="${href(over)}"${cur ? ' aria-current="page"' : ''} class="${extra}">${text}</a>`;
      const ucs = id => `<div class="nav-uc">${D[id].uc.map((u, i) => link({ chapter: id, uc: i + 1 }, esc(ucName(id, i + 1)), '', state.chapter === id && state.uc === i + 1)).join('')}</div>`;
      const feats = Pages.features().filter(id => ![D[id].name, D[id].summary, D[id].tag].some(x => x.toLowerCase().includes(q)));
      const hidden = new Set(feats);
      $('chapter-nav').innerHTML = (q ? '' : `<p class="nav-group">Overview</p>${link({ chapter: 'architecture' }, `<span>◆</span><div><b>Distributed batch engine</b><small>The whole system on one page</small></div>`, 'nav-item', state.chapter === 'architecture' && !state.uc)}`)
        + `<p class="nav-group">Features</p>` + (Pages.features().filter(id => !hidden.has(id)).map(id => link({ chapter: id }, `<span>${Pages.number(id)}</span><div><b>${esc(D[id].name)}</b><small>${esc(D[id].summary)}</small></div>`, 'nav-item', state.chapter === id && !state.uc) + (state.chapter === id ? ucs(id) : '')).join('') || '<p class="empty-state">No matching feature.</p>');
    }
    function renderCrumb() {
      const parts = [`<a href="../../tech.html">Tech Stack</a>`, `<a href="${href({ chapter: 'architecture' })}">Apache Spark</a>`];
      if (state.chapter !== 'architecture') parts.push(state.uc ? `<a href="${href({ chapter: state.chapter })}">${esc(label(state.chapter))}</a>` : `<b>${esc(label(state.chapter))}</b>`);
      if (state.uc) parts.push(`<b>${esc(ucName(state.chapter, state.uc))}</b>`);
      $('breadcrumb').innerHTML = parts.join('<span>›</span>');
    }

    function stop() { clearTimeout(timer); playing = false; if ($('play')) { $('play').textContent = '▶ Play'; $('play').setAttribute('aria-label', 'Play'); } }
    function closeMenu(restoreFocus = false) {
      $('course-sidebar').classList.remove('open'); $('sidebar-scrim').hidden = true; $('menu-toggle').setAttribute('aria-expanded', 'false');
      if (restoreFocus && mobile.matches) $('menu-toggle').focus();
    }
    const save = () => history.replaceState(null, '', serializeRoute(state));

    function renderPage() {
      stop(); chapter = byId(state.chapter); trace = null;
      const animated = false; /* feature pages no longer carry the animated lab */
      let html;
      if (state.uc) html = Pages.useCase(chapter, state.uc, href);
      else if (chapter.id === 'architecture') html = Pages.overview(chapter, href);
      else html = Pages.feature(chapter, href, animated ? labHTML(chapter, state) : '');
      $('page').innerHTML = html;
      document.title = (state.uc ? ucName(chapter.id, state.uc) + ' · ' : '') + label(chapter.id) + ' · Spark system design';
      if (animated) {
        trace = M.buildTrace(chapter.id, state.options);
        state.step = Math.min(state.step, trace.steps.length - 1);
        renderStep();
      } else state.step = 0;
      renderNav(); renderCrumb(); closeMenu(); save();
      SD.draw($('page'));
      if (window.SparkReadSim) window.SparkReadSim.mount($('page'));
      if (window.SparkStory) window.SparkStory.mount($('page'));
      if (window.SparkPack) window.SparkPack.mount($('page'));
      if (window.SparkMap) window.SparkMap.mount($('page'));
      if (window.SparkTree) window.SparkTree.mount($('page'));
      if (window.SparkCompare) window.SparkCompare.mount($('page'));
      if (window.SparkPipe) window.SparkPipe.mount($('page'));
      if (window.SparkLineage) window.SparkLineage.mount($('page'));
    }
    function renderStep() {
      const phaseFocus = $('phase-nav').contains(document.activeElement);
      const step = trace.steps[state.step], prev = trace.steps[state.step - 1];
      $('metrics').innerHTML = step.metrics.map(x => `<div><small>${esc(x.label)}</small><strong>${esc(x.value)}</strong></div>`).join('');
      $('scene-phase').textContent = step.phase;
      SparkScenes.render($('engine-svg'), step.scene, step.title, step.why);
      $('transition-number').textContent = 'TRANSITION ' + (state.step + 1) + ' / ' + trace.steps.length;
      $('transition-title').textContent = step.title; $('transition-why').textContent = step.why;
      $('transition-change').innerHTML = `<p><span>BEFORE</span>${esc(prev ? prev.phase : 'Input and component setup')}</p><p><span>AFTER</span>${esc(step.phase)}</p>`;
      $('transition-contract').textContent = chapter.contracts[Math.min(Math.floor(state.step / Math.max(1, trace.steps.length / chapter.contracts.length)), chapter.contracts.length - 1)][2];
      $('algorithm').innerHTML = chapter.algorithm.map((line, n) => `<li${n === step.code ? ' class="current" aria-current="step"' : ''}><span>${n + 1}</span><code>${esc(line)}</code>${n === step.code ? '<b aria-hidden="true">←</b>' : ''}</li>`).join('');
      $('state-table').innerHTML = SD.table(step.table.columns, step.table.rows);
      $('state-title').textContent = step.table.columns.length ? 'Inspect ' + step.phase : 'Read the current component state';
      $('phase-nav').innerHTML = trace.steps.map((s, n) => `<button data-step="${n}"${n === state.step ? ' aria-current="step"' : ''}><span>${String(n + 1).padStart(2, '0')}</span>${esc(s.phase)}</button>`).join('');
      if (phaseFocus) $('phase-nav').querySelector('[aria-current]').focus({ preventScroll: true });
      $('scrubber').max = trace.steps.length - 1; $('scrubber').value = state.step;
      $('step-count').textContent = (state.step + 1) + ' / ' + trace.steps.length;
      $('prev-step').disabled = state.step === 0; $('next-step').disabled = state.step === trace.steps.length - 1;
      save();
    }
    function go(n) { stop(); state.step = Math.max(0, Math.min(trace.steps.length - 1, n)); renderStep(); }
    function play() {
      if (playing) { stop(); return; }
      if (state.step === trace.steps.length - 1) { state.step = 0; renderStep(); }
      playing = true; $('play').textContent = 'Ⅱ Pause'; $('play').setAttribute('aria-label', 'Pause');
      const tick = () => {
        if (!playing) return;
        if (state.step >= trace.steps.length - 1) { stop(); return; }
        state.step++; renderStep(); timer = setTimeout(tick, 1900 / speed);
      };
      timer = setTimeout(tick, 1900 / speed);
    }
    function navigate(route) {
      history.pushState(null, '', serializeRoute(route)); state = route; renderPage();
      if (state.focus === 'lab' && $('lab')) $('lab').scrollIntoView({ behavior: 'instant', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function rerunLab(key) {
      stop(); state.step = 0; trace = M.buildTrace(chapter.id, state.options); renderStep(); renderNav();
      if (key && $('value-' + key)) $('value-' + key).textContent = state.options[key];
    }

    app.addEventListener('click', e => {
      const action = e.target.closest('[data-action]');
      if (action && trace) {
        const a = action.dataset.action;
        if (a === 'play') play(); else if (a === 'next') go(state.step + 1); else if (a === 'previous') go(state.step - 1); else if (a === 'restart') go(0);
        else if (a === 'reset-inputs') { state.options = { ...M.DEFAULTS }; state.step = 0; renderPage(); }
      }
      const phase = e.target.closest('[data-step]'); if (phase && trace) go(Number(phase.dataset.step));
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const h = link.getAttribute('href');
      if (link.hasAttribute('data-jump') || h === '#course-main') {
        e.preventDefault(); const target = $(h.slice(1)); if (!target) return;
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
        target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
      } else if (h.startsWith('#c=') && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault(); const next = parseRoute(h); next.options = { ...state.options }; navigate(next);
      }
    });
    app.addEventListener('input', e => {
      const key = e.target.dataset && e.target.dataset.option; if (!key || e.target.type !== 'range' || !trace) return;
      state.options = M.normalizeOptions({ ...state.options, [key]: e.target.value }); rerunLab(key);
    });
    app.addEventListener('change', e => {
      if (e.target.id === 'play-speed') { const was = playing; stop(); speed = Number(e.target.value); if (was) play(); return; }
      const key = e.target.dataset && e.target.dataset.option; if (!key || e.target.type === 'range' || !trace) return;
      state.options = M.normalizeOptions({ ...state.options, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); rerunLab(key);
    });
    app.addEventListener('input', e => { if (e.target.id === 'scrubber' && trace) go(Number(e.target.value)); if (e.target.id === 'course-search') renderNav(); });
    $('menu-toggle').addEventListener('click', () => {
      const open = !$('course-sidebar').classList.contains('open');
      $('course-sidebar').classList.toggle('open', open); $('sidebar-scrim').hidden = !open; $('menu-toggle').setAttribute('aria-expanded', String(open));
      if (open) $('course-search').focus();
    });
    $('sidebar-scrim').addEventListener('click', () => closeMenu(true));
    const onRoute = () => { state = parseRoute(location.hash); renderPage(); if (state.focus === 'lab' && $('lab')) $('lab').scrollIntoView({ behavior: 'instant', block: 'start' }); };
    window.addEventListener('hashchange', onRoute); window.addEventListener('popstate', onRoute);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenu(true);
      if (!trace || /^(INPUT|SELECT|TEXTAREA|A|BUTTON)$/.test(e.target.tagName.toUpperCase()) || e.target.isContentEditable) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(state.step + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(state.step - 1); }
      else if (e.code === 'Space' && /^(BODY|SVG|MAIN)$/.test(e.target.tagName.toUpperCase())) { e.preventDefault(); play(); }
    });
    renderPage();
    if (state.focus === 'lab' && $('lab')) $('lab').scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  return { parseRoute, serializeRoute, mount };
});
