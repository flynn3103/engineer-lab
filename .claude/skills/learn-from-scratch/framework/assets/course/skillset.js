/* Skill-set course engine: shell, router, page templates and validator for a course that teaches a SKILL (backend engineer,
 * product management, ...) rather than a tool. It reuses course.css, the shell and the Mermaid layer of course.js, so a skill-set
 * course looks like a tool-set course but is laid out around competencies, lessons, practice and checklists.
 * Usage (after the data files, course.js and skillset.js):   Course.mountSkill(SkillData)      validate: Course.validateSkill(SkillData)
 * Routes: #/ (role overview) · #/m/N (module) · #/m/N/l/M (lesson). N and M start at 1.
 * Data contract (also in assets/course/README.md):
 *   SkillData.config   { id, name, role, root, brand?, plugin: { name, agent, persona? }, related?: [{href,title,sub}], home?: {href,label} }
 *   SkillData.spec     { title, navTitle, lead, overview[2], audience[], outcomes[], prerequisites[], mindset: [[habit, meaning, reviewer question]], scenario: { title, body }, gate: [[module, evidence, agent]], verify[] }
 *   SkillData.modules  [{ id, tag, name, status: 'ready'|'planned', summary, goal, competencies[], artifact, agent, skillName? | agentName? }]  (planned modules: id, tag, name, status, summary, outline: [lesson titles], artifact)
 *   SkillData.lessons  { <moduleId>: [ lesson ] }            only for status 'ready'
 *   SkillData.diagrams { '<moduleId>:<n>': [{ kind, title, src }] }   n = lesson number from 1; at least one per lesson
 * lesson = { title, short, why, concept: [html], terms: [[term, meaning]], example: { setup, body: [html], table?: {head, rows} },
 *            technique: [{ t, x }], mistakes: [{ t, ctx, fix }], review: [question or red flag], exercise: { prompt, answer }, checklist: [text], artifact, agent, src } */
(function (root) {
  'use strict';
  const Course = root.Course = root.Course || {};

  /* ---------- validator ---------- */
  Course.validateSkill = function (D) {
    const errors = [], warnings = [], err = m => errors.push(m), warn = m => warnings.push(m);
    const need = (o, keys, where) => keys.forEach(k => { if (o == null || o[k] == null || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) err(where + ' is missing "' + k + '"'); });
    if (!D) { err('SkillData is not defined'); return { errors, warnings, stats: {} }; }
    need(D, ['config', 'spec', 'modules', 'lessons', 'diagrams'], 'SkillData');
    if (errors.length) return { errors, warnings, stats: {} };
    need(D.config, ['id', 'name', 'role', 'root', 'plugin'], 'config');
    need(D.config.plugin || {}, ['name', 'agent'], 'config.plugin');
    need(D.spec, ['title', 'lead', 'overview', 'audience', 'outcomes', 'prerequisites', 'mindset', 'scenario', 'gate'], 'spec');
    (D.spec.mindset || []).forEach((r, i) => { if (!Array.isArray(r) || r.length !== 3) err('spec.mindset[' + i + '] must be [habit, what it means, the question a reviewer asks]'); });
    if (D.spec.overview && D.spec.overview.length !== 2) err('spec.overview needs 2 paragraphs (what the role does, how the course is built)');
    need(D.spec.scenario || {}, ['title', 'body'], 'spec.scenario');
    (D.spec.gate || []).forEach((r, i) => { if (!Array.isArray(r) || r.length !== 3) err('spec.gate[' + i + '] must be [module, evidence you bring, what the agent does]'); });
    if (!D.spec.verify) warn('spec.verify is missing: add how the content was checked');
    const L = Course.lintMermaid || (() => {}), ids = new Set();
    let lessons = 0, ready = 0, diagrams = 0, checks = 0;
    D.modules.forEach((m, mi) => {
      const w = 'module ' + (m && m.id);
      need(m, ['id', 'tag', 'name', 'status', 'summary'], w);
      if (ids.has(m.id)) err(w + ' is duplicated'); ids.add(m.id);
      if (m.status !== 'ready' && m.status !== 'planned') { err(w + ': status must be "ready" or "planned"'); return; }
      if (m.status === 'planned') {
        if (D.lessons[m.id]) err(w + ' is planned but has lessons: set status to "ready"');
        need(m, ['outline', 'artifact'], w);
        if (m.outline && (m.outline.length < 3 || m.outline.length > 8)) warn(w + ' outline has ' + m.outline.length + ' lessons, the template asks for 3 to 8');
        return;
      }
      ready++;
      need(m, ['goal', 'competencies', 'artifact', 'agent'], w);
      const ls = D.lessons[m.id];
      if (!ls || !ls.length) { err(w + ' is ready but has no lessons'); return; }
      if (ls.length < 5 || ls.length > 9) warn(w + ' has ' + ls.length + ' lessons, the template asks for 5 to 9');
      ls.forEach((l, i) => {
        const id = m.id + ':' + (i + 1), lw = 'lesson ' + id;
        lessons++;
        need(l, ['title', 'short', 'why', 'concept', 'example', 'technique', 'mistakes', 'review', 'exercise', 'checklist', 'artifact', 'agent', 'src'], lw);
        if (l.review && (l.review.length < 3 || l.review.length > 5)) warn(lw + ' has ' + l.review.length + ' reviewer questions, the template asks for 3 to 5');
        need(l.example || {}, ['setup', 'body'], lw + ' example');
        need(l.exercise || {}, ['prompt', 'answer'], lw + ' exercise');
        if (l.terms) l.terms.forEach((r, k) => { if (!Array.isArray(r) || r.length !== 2) err(lw + ' terms[' + k + '] must be [term, meaning]'); });
        if (l.technique && (l.technique.length < 3 || l.technique.length > 7)) warn(lw + ' has ' + l.technique.length + ' technique steps, the template asks for 3 to 7');
        (l.technique || []).forEach((s, k) => need(s, ['t', 'x'], lw + ' technique step ' + (k + 1)));
        if (l.mistakes && (l.mistakes.length < 2 || l.mistakes.length > 3)) warn(lw + ' has ' + l.mistakes.length + ' mistakes, the template asks for 2 or 3');
        (l.mistakes || []).forEach((x, k) => need(x, ['t', 'ctx', 'fix'], lw + ' mistake ' + (k + 1)));
        if (l.checklist) { checks += l.checklist.length; if (l.checklist.length < 3 || l.checklist.length > 7) warn(lw + ' has ' + l.checklist.length + ' checklist items, the template asks for 3 to 7'); }
        const ds = D.diagrams[id];
        if (!ds || !ds.length) err(lw + ' has no diagram'); else ds.forEach((d, k) => { diagrams++; need(d, ['kind', 'title', 'src'], 'diagram ' + id + '#' + (k + 1)); L(d.src || '', 'diagram ' + id + '#' + (k + 1), errors); });
      });
    });
    Object.keys(D.lessons).forEach(k => { if (!ids.has(k)) err('lessons has entries for unknown module "' + k + '"'); });
    Object.keys(D.diagrams).forEach(k => { const [m, n] = k.split(':'); if (!D.lessons[m] || !D.lessons[m][n - 1]) err('diagrams has an entry for unknown lesson "' + k + '"'); });
    if (!ready) warn('no module is ready yet: this is a curriculum layout only');
    const todo = JSON.stringify([D.config, D.spec, D.modules, D.lessons, D.diagrams]).match(/TODO/g);
    if (todo) warn('placeholders: ' + todo.length + ' TODO marker(s) are still in the content');
    const bad = JSON.stringify([D.spec, D.modules, D.lessons]).match(/undefined|NaN|\[object/g);
    if (bad) err('content contains "undefined", "NaN" or "[object"');
    return { errors, warnings, stats: { modules: D.modules.length, ready, lessons, diagrams, checklist: checks } };
  };

  /* ---------- engine ---------- */
  Course.mountSkill = function (D, opts) {
    opts = opts || {};
    const cfg = D.config, app = opts.el || document.getElementById('app'), mods = D.modules;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const list = a => '<ul>' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const table = (head, rows) => '<div class="table-scroll"><table><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    const pad = n => String(n).padStart(2, '0'), $ = id => document.getElementById(id);
    const lessonsOf = m => D.lessons[m.id] || [];
    const tone = i => 'var(--p' + (i % 7) + ')';
    const strip = t => String(t).replace(/<[^>]+>/g, '');
    const first = t => { const p = strip(t); return p.length <= 110 ? p : (p.match(/^.*?[.!?](\s|$)/) || [p])[0].trim(); };
    const href = (n, m) => '#/' + (n ? 'm/' + n + (m ? '/l/' + m : '') : '');
    const section = (n, title, body, sub, id) => '<section class="sec"' + (id ? ' id="' + id + '"' : '') + '><h2><span>' + pad(n) + '</span>' + title + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>';
    const chips = items => '<div class="chips">' + items.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>';
    const diagram = d => '<figure class="diagram diagram-hero"><figcaption><b>' + esc(d.kind) + '</b>' + (d.title ? ' · ' + esc(d.title) : '') + '</figcaption><div class="diagram-body" data-mermaid><pre class="diagram-src">' + esc(d.src.trim()) + '</pre></div></figure>';
    /* a module can name the skill that carries it (one persona agent plus one skill per module), else the plugin's agent */
    const who = m => m.skillName ? '<code>' + esc(m.skillName) + '</code> skill' : esc(m.agentName || cfg.plugin.agent) + ' agent';
    const agentBox = (label, text) => '<aside class="sk-agent"><b>' + label + '</b><p>' + text + '</p></aside>';
    const jump = items => '<nav class="jump" aria-label="On this page">' + items.map(([id, l]) => '<a href="#' + id + '" data-jump>' + l + '</a>').join('') + '</nav>';

    /* progress is a convenience: it lives in this browser only and the page works without it */
    const KEY = 'skillcourse:' + cfg.id;
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private window */ } };

    function moduleCard(m, i) {
      const ready = m.status === 'ready', n = lessonsOf(m).length;
      const body = '<div class="art" style="--p:' + tone(i) + '"><svg viewBox="0 0 200 90" aria-hidden="true"><rect x="22" y="22" width="156" height="46" rx="10" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/>' +
        '<text x="100" y="51" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="15" font-weight="700" fill="var(--ink)">' + esc(m.tag) + '</text></svg><span class="flag">' + pad(i + 1) + '</span></div>' +
        '<div class="body"><h3>' + esc(m.name) + '</h3><p>' + m.summary + '</p><div class="chips"><span>' + (ready ? n + ' lessons' : 'planned') + '</span></div></div>';
      return ready ? '<a class="ccard" href="' + href(i + 1) + '">' + body + '</a>' : '<div class="ccard sk-planned" aria-disabled="true">' + body + '</div>';
    }
    function lessonCard(m, n) {
      return '<div class="ucgrid">' + lessonsOf(m).map((l, i) => '<a class="uccard" href="' + href(n, i + 1) + '"><span class="ucn">L-' + pad(i + 1) + '</span><h3>' + esc(l.title) + '</h3><p>' + l.short + '</p>' +
        '<div class="chips"><span>' + (D.diagrams[m.id + ':' + (i + 1)] || []).length + ' diagram' + ((D.diagrams[m.id + ':' + (i + 1)] || []).length > 1 ? 's' : '') + '</span><span>' + l.checklist.length + ' checks</span><span>exercise</span></div><b class="go">Open lesson →</b></a>').join('') + '</div>';
    }

    /* ---------- pages ---------- */
    function overview() {
      const s = D.spec, total = mods.reduce((n, m) => n + lessonsOf(m).length, 0), ready = mods.filter(m => m.status === 'ready').length;
      let n = 0;
      const nav = [['overview', 'Overview'], ['audience', 'Who it is for'], ['mindset', 'Mindset'], ['map', 'Competency map'], ['outline', 'Curriculum'], ['scenario', 'Running scenario'], ['gate', 'Plugin gate'], ['checks', 'Checks']];
      return '<header class="page-head"><p class="kick">OVERVIEW · SKILL SET</p><h1>' + esc(s.title) + '</h1><p class="lead">' + s.lead + '</p>' +
        chips([mods.length + ' modules', ready + ' ready', total + ' lessons', cfg.plugin.name + ' plugin']) + '</header>' + jump(nav) +
        section(++n, 'Overview', '<div class="two"><div><h3>What the role does</h3><p>' + strip(s.overview[0]) + '</p></div><div><h3>How this course works</h3><p>' + strip(s.overview[1]) + '</p></div></div>', '', 'overview') +
        section(++n, 'Who it is for', '<div class="two"><div><h3>You are</h3>' + list(s.audience) + '</div><div><h3>You will be able to</h3>' + list(s.outcomes) + '</div></div><p class="note"><b>Prerequisites.</b> ' + s.prerequisites.join(' ') + '</p>', '', 'audience') +
        section(++n, 'The reviewer\'s mindset', '<p>The skill set is the techniques. The mindset is the habits that make you ask the right question when an agent hands you a confident answer. Each habit has a question you can ask.</p>' + table(['Habit', 'What it means', 'The question you ask'], s.mindset), 'Module 01 teaches these with worked examples.', 'mindset') +
        section(++n, 'Competency map', '<div class="cgrid">' + mods.map(moduleCard).join('') + '</div>', 'Modules marked planned are not written yet. Each ready module ends in an artifact the plugin checks.', 'map') +
        section(++n, 'Curriculum outline', table(['Module', 'Lessons', 'You leave with'], mods.map((m, i) => ['<b>' + pad(i + 1) + ' ' + esc(m.name) + '</b>' + (m.status === 'ready' ? '' : '<br><small>planned</small>'),
          '<ol class="sk-outline">' + (m.status === 'ready' ? lessonsOf(m).map(l => l.title) : m.outline).map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>', m.artifact])), 'The layout of the whole curriculum. Planned modules list their lessons now and get their content later.', 'outline') +
        section(++n, 'Running scenario', '<p class="lead-problem">' + s.scenario.body + '</p>', esc(s.scenario.title), 'scenario') +
        section(++n, 'The plugin gate', '<p>The <b>' + esc(cfg.plugin.name) + '</b> plugin ' + (cfg.plugin.persona ? 'has one agent, <code>' + esc(cfg.plugin.agent) + '</code>: ' + cfg.plugin.persona + ' Each module below is a <b>skill</b> that the agent loads when the task matches. ' : '(agent <code>' + esc(cfg.plugin.agent) + '</code>) assumes you can produce these artifacts. ') + 'Each row is the evidence you bring and what the plugin does with it.</p>' + table(['Module', 'Evidence you bring', 'What the agent does with it'], s.gate), '', 'gate') +
        (s.verify ? section(++n, 'How the content was checked', '<div class="note">' + list(s.verify) + '</div>', '', 'checks') : '');
    }

    function module_(n) {
      const m = mods[n - 1], prev = mods[n - 2], next = mods[n]; let k = 0;
      return '<header class="page-head"><p class="kick">MODULE ' + pad(n) + ' · ' + esc(m.tag.toUpperCase()) + '</p><h1>' + esc(m.name) + '</h1><p class="lead">' + m.summary + '</p></header>' +
        section(++k, 'Goal and competencies', '<div class="two"><div><h3>Goal</h3><p>' + m.goal + '</p></div><div><h3>You will be able to</h3>' + list(m.competencies) + '</div></div>') +
        section(++k, 'Lessons', lessonCard(m, n), 'Take them in order: each lesson builds on the running scenario.') +
        section(++k, 'The artifact you leave with', '<p class="lead-problem">' + m.artifact + '</p>' + agentBox('What the ' + who(m) + ' does with it', m.agent)) +
        '<nav class="pager" aria-label="Modules"><a href="' + href(0) + '"><small>BACK TO</small><b>← Overview</b></a>' + (next && next.status === 'ready' ? '<a class="next" href="' + href(n + 1) + '"><small>NEXT MODULE</small><b>' + esc(next.name) + ' →</b></a>' : '') + '</nav>';
    }

    function lesson(n, m) {
      const mod = mods[n - 1], L = lessonsOf(mod), l = L[m - 1], prev = L[m - 2], next = L[m], saved = load(), id = mod.id + ':' + m; let k = 0;
      const ex = l.example, ds = D.diagrams[id] || [];
      const mistake = (x, i) => '<details class="edgecard"><summary><span class="en">' + (i + 1) + '</span><span class="et"><b>' + esc(x.t) + '</b><small>' + first(x.ctx) + '</small></span><span class="ex" aria-hidden="true"></span></summary>' +
        '<div class="eb"><div><h4>What goes wrong</h4><p>' + x.ctx + '</p></div><div><h4>Do this instead</h4><p>' + x.fix + '</p></div></div></details>';
      return '<header class="page-head"><p class="kick">MODULE ' + pad(n) + ' · LESSON ' + pad(m) + '</p><h1>' + esc(l.title) + '</h1><p class="lead">' + l.short + '</p></header>' +
        jump([['why', 'Why'], ['idea', 'The idea'], ['example', 'Example'], ['technique', 'Technique'], ['mistakes', 'Mistakes'], ['review', 'Review'], ['practice', 'Practice'], ['done', 'Checklist']]) +
        section(++k, 'Why it matters', '<p class="lead-problem">' + l.why + '</p>', '', 'why') +
        section(++k, 'The idea', l.concept.map(p => '<p>' + p + '</p>').join('') + (l.terms ? table(['Term', 'Meaning'], l.terms) : ''), '', 'idea') +
        section(++k, 'Worked example', '<p class="assume"><b>Setup.</b> ' + ex.setup + '</p>' + ds.map(diagram).join('') + ex.body.map(p => '<p>' + p + '</p>').join('') + (ex.table ? table(ex.table.head, ex.table.rows) : ''), 'One running scenario across the module, so each lesson builds on the last.', 'example') +
        section(++k, 'The technique', '<ol class="sk-steps">' + l.technique.map(s => '<li><b>' + esc(s.t) + '</b><span>' + s.x + '</span></li>').join('') + '</ol>', 'Do these in order. Each one is a single move.', 'technique') +
        section(++k, 'Common mistakes', '<div class="edges">' + l.mistakes.map(mistake).join('') + '</div>', '', 'mistakes') +
        section(++k, 'What a reviewer asks', '<ul class="sk-review">' + l.review.map(q => '<li>' + q + '</li>').join('') + '</ul>', 'Questions to put to the agent, and the red flags to look for.', 'review') +
        section(++k, 'Practice', '<p class="lead-problem">' + l.exercise.prompt + '</p><details class="sk-answer"><summary>Show a model answer</summary><div>' + l.exercise.answer + '</div></details>', 'Try it on paper first, then open the answer.', 'practice') +
        section(++k, 'Checklist and artifact', '<ul class="sk-check">' + l.checklist.map((c, i) => '<li><label><input type="checkbox" data-k="' + id + ':' + i + '"' + (saved[id + ':' + i] ? ' checked' : '') + '><span>' + c + '</span></label></li>').join('') + '</ul>' +
          '<p class="expect"><b>Artifact.</b> ' + l.artifact + '</p>' + agentBox('What the ' + who(mod) + ' does here', l.agent) + '<p class="sub" style="margin-top:14px">Sources: ' + l.src + '</p>', 'Tick these off as you go. Ticks are kept in this browser only.', 'done') +
        '<nav class="pager" aria-label="Lessons"><a href="' + (prev ? href(n, m - 1) : href(n)) + '"><small>' + (prev ? 'PREVIOUS LESSON' : 'BACK TO') + '</small><b>← ' + esc(prev ? prev.title : mod.name) + '</b></a>' +
        (next ? '<a class="next" href="' + href(n, m + 1) + '"><small>NEXT LESSON</small><b>' + esc(next.title) + ' →</b></a>' : '<a class="next" href="' + href(n) + '"><small>BACK TO</small><b>' + esc(mod.name) + ' →</b></a>') + '</nav>';
    }
    const notFound = () => '<header class="page-head"><p class="kick">NOT FOUND</p><h1>No such page</h1></header><p><a href="#/">Back to the overview</a></p>';

    /* ---------- shell ---------- */
    if (!document.getElementById('rough')) document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></svg>');
    if (cfg.brand) app.style.setProperty('--brand', cfg.brand);
    app.className = 'course skillset';
    app.innerHTML = '<a class="skip-link" href="#course-main">Skip to content</a>' +
      '<header class="course-top"><button id="menu-toggle" aria-label="Show navigation" aria-controls="course-sidebar" aria-expanded="false">☰</button><nav aria-label="Breadcrumb" id="breadcrumb"></nav><span class="course-version">SKILL SET · ' + esc(cfg.role.toUpperCase()) + '</span></header>' +
      '<div class="course-layout"><aside class="course-sidebar" id="course-sidebar"><label class="search-label" for="course-search">Find a module or lesson</label><input id="course-search" type="search" placeholder="Search…"><nav id="chapter-nav" aria-label="Pages"></nav></aside>' +
      '<main id="course-main" tabindex="-1"><article id="page"></article><footer class="course-foot">' + (cfg.footer || 'A skill-set course for the ' + esc(cfg.role) + ' role. Examples use one invented scenario; numbers marked as examples are assumptions, not measurements.') + ' Built with the learn-from-scratch skill (skill-set mode).</footer></main></div>' +
      '<button id="sidebar-scrim" class="sidebar-scrim" aria-label="Close navigation" hidden></button>';
    let route = { n: 0, m: 0 };

    function renderNav() {
      const q = $('course-search').value.trim().toLowerCase();
      const link = (h, text, cls, cur) => '<a href="' + h + '"' + (cur ? ' aria-current="page"' : '') + ' class="' + (cls || '') + '">' + text + '</a>';
      const hit = (m, i) => !q || [m.name, m.summary, m.tag].concat(lessonsOf(m).map(l => l.title)).some(x => String(x).toLowerCase().includes(q));
      const shown = mods.map((m, i) => [m, i]).filter(([m, i]) => hit(m, i));
      $('chapter-nav').innerHTML = (q ? '' : '<p class="nav-group">Overview</p>' + link(href(0), '<span>◆</span><div><b>' + esc(D.spec.navTitle || D.spec.title) + '</b><small>The whole skill set on one page</small></div>', 'nav-item', !route.n)) +
        '<p class="nav-group">Modules</p>' + (shown.map(([m, i]) => m.status === 'ready' ?
          link(href(i + 1), '<span>' + pad(i + 1) + '</span><div><b>' + esc(m.name) + '</b><small>' + m.summary + '</small></div>', 'nav-item', route.n === i + 1 && !route.m) +
            (route.n === i + 1 ? '<div class="nav-uc">' + lessonsOf(m).map((l, k) => link(href(i + 1, k + 1), esc(l.title), '', route.m === k + 1)).join('') + '</div>' : '')
          : '<a class="nav-item sk-planned" aria-disabled="true"><span>' + pad(i + 1) + '</span><div><b>' + esc(m.name) + '</b><small>planned</small></div></a>').join('') || '<p class="empty-state">No match.</p>') +
        ((cfg.related || []).length ? '<p class="nav-group">Related</p>' + cfg.related.map(r => link(r.href, '<span>↗</span><div><b>' + esc(r.title) + '</b><small>' + esc(r.sub || '') + '</small></div>', 'nav-item', false)).join('') : '');
    }
    function renderCrumb() {
      const h = cfg.home || { href: cfg.root + 'index.html', label: 'Home' };
      const parts = ['<a href="' + esc(h.href) + '">' + esc(h.label) + '</a>', '<a href="' + href(0) + '">' + esc(cfg.name) + '</a>'];
      const m = mods[route.n - 1];
      if (m) parts.push(route.m ? '<a href="' + href(route.n) + '">' + esc(m.name) + '</a>' : '<b>' + esc(m.name) + '</b>');
      if (m && route.m && lessonsOf(m)[route.m - 1]) parts.push('<b>' + esc(lessonsOf(m)[route.m - 1].title) + '</b>');
      $('breadcrumb').innerHTML = parts.join('<span>›</span>');
    }
    function closeMenu() { $('course-sidebar').classList.remove('open'); $('sidebar-scrim').hidden = true; $('menu-toggle').setAttribute('aria-expanded', 'false'); }

    function render() {
      const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      route = p[0] === 'm' ? { n: +p[1] || 0, m: p[2] === 'l' ? +p[3] || 0 : 0 } : { n: 0, m: 0 };
      const page = $('page'), mod = mods[route.n - 1], l = mod && route.m ? lessonsOf(mod)[route.m - 1] : null; let title = D.spec.title;
      if ((route.n && (!mod || mod.status !== 'ready')) || (route.m && !l)) { page.innerHTML = notFound(); route = { n: 0, m: 0 }; }
      else if (l) { page.innerHTML = lesson(route.n, route.m); title = l.title + ' · ' + mod.name; }
      else if (mod) { page.innerHTML = module_(route.n); title = mod.name; }
      else page.innerHTML = overview();
      document.title = title + ' · ' + cfg.name;
      renderNav(); renderCrumb(); closeMenu(); window.scrollTo(0, 0); Course.mermaid.draw(page);
    }

    $('menu-toggle').onclick = () => { const o = $('course-sidebar').classList.toggle('open'); $('sidebar-scrim').hidden = !o; $('menu-toggle').setAttribute('aria-expanded', String(o)); };
    $('sidebar-scrim').onclick = closeMenu;
    $('course-search').oninput = renderNav;
    document.addEventListener('click', e => { const a = e.target.closest('a[data-jump]'); if (a) { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' }); } });
    document.addEventListener('change', e => { const c = e.target; if (c && c.matches && c.matches('input[data-k]')) { const s = load(); s[c.dataset.k] = c.checked; save(s); } });
    window.addEventListener('hashchange', render);
    render();
  };
  if (typeof module === 'object' && module.exports) module.exports = Course;
})(typeof globalThis !== 'undefined' ? globalThis : this);
