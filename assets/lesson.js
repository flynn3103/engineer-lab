/* Course engine (v2): one page per course, one chapter per #chN hash.
   Each chapter is problem-based: Problem -> Predict -> Mechanism -> Diagnose, plus a Visualize view
   made of scenarios. A scenario has a Code box, a stage (diagram or tables), a list of steps and a
   Log. Steps set highlight classes on diagram nodes and edges, optional stats, and optional tables.
   No dependencies. Data lives in each course's course.js (window.COURSE). */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const KW = /\b(SELECT|FROM|JOIN|ON|WHERE|GROUP BY|ORDER BY|NOT IN|NOT EXISTS|EXISTS|INSERT INTO|VALUES|ALTER TABLE|ADD CONSTRAINT|UNIQUE|COUNT|SUM|AS|AND|IS NOT NULL|NULL|DISTINCT)\b/g;
  const row = r => (Array.isArray(r) ? { c: r, k: '' } : r);
  const sum = a => a.reduce((x, y) => x + y, 0);
  let uid = 0;

  /* ---- tables stage (SQL-style rows and links) ---- */
  function tableSVG(name, def, rows, x, y) {
    const cell = (cx, w, text, cy) => `<rect class="cell" x="${cx}" y="${cy}" width="${w}" height="24"/><text x="${cx + w / 2}" y="${cy + 16}" text-anchor="middle">${esc(text)}</text>`;
    let s = `<text class="tname" x="${x}" y="${y - 8}">${esc(name)}</text><g class="head">`;
    def.cols.forEach((c, i) => { s += cell(x + sum(def.w.slice(0, i)), def.w[i], c, y); });
    s += '</g>';
    rows.forEach((r0, j) => {
      const r = row(r0), ry = y + 24 + j * 24;
      s += `<g class="row ${r.k}${r.k === 'new' ? ' pop' : ''}">`;
      r.c.forEach((v, i) => { s += cell(x + sum(def.w.slice(0, i)), def.w[i], v, ry); });
      s += '</g>';
    });
    return { s, W: sum(def.w), rowY: j => y + 24 + j * 24 + 12 };
  }
  function tablesStage(sc, st) {
    const tb = sc.tables || {}, pos = { customers: [16, 40], orders: [384, 40] }, geo = {};
    let s = '';
    for (const name of Object.keys(tb)) {
      const [x, y] = pos[name] || [16, 40];
      const t = tableSVG(name, tb[name], (st.t && st.t[name]) || tb[name].rows, x, y);
      s += t.s; geo[name] = { x, W: t.W, rowY: t.rowY };
    }
    (st.links || []).forEach(([ci, oj, k]) => {
      const a = geo.customers, b = geo.orders; if (!a || !b) return;
      const x1 = a.x + a.W, y1 = a.rowY(ci), x2 = b.x, y2 = b.rowY(oj), mx = (x1 + x2) / 2;
      s += `<path class="link ${k}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    });
    const resY = Object.keys(tb).length ? 214 : 96;
    if (st.res) {
      s += tableSVG('result', st.res, st.res.rows || [], 16, resY).s;
      if (!(st.res.rows || []).length) s += `<text class="empty" x="16" y="${resY + 54}">${esc(st.res.empty || '0 rows')}</text>`;
    }
    const H = st.res ? resY + 24 + 24 * Math.max(1, (st.res.rows || []).length) + 40 : 200;
    return { vb: `0 0 640 ${Math.max(H, 200)}`, body: s };
  }

  /* ---- diagram stage (nodes and edges with step highlights) ---- */
  function clip(n, cx, cy, dx, dy) {
    const sx = dx ? (n.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (n.h / 2) / Math.abs(dy) : Infinity, k = Math.min(sx, sy, 1);
    return [cx + dx * k, cy + dy * k];
  }
  function diagramStage(sc, st, id) {
    const D = sc.diagram, hl = st.hl || {}, nodes = {};
    D.nodes.forEach(n => { nodes[n.id] = n; });
    let s = `<defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="arr"/></marker></defs>`;
    (D.edges || []).forEach(e => {
      const a = nodes[e.a], b = nodes[e.b]; if (!a || !b) return;
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const p = clip(a, ax, ay, bx - ax, by - ay), q = clip(b, bx, by, ax - bx, ay - by);
      const k = (hl.edges || {})[e.id] || '';
      s += `<line class="edge ${k}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" marker-end="url(#${id})"/>`;
      if (e.label) s += `<text class="elab" x="${(p[0] + q[0]) / 2}" y="${(p[1] + q[1]) / 2 - 7}" text-anchor="middle">${esc(e.label)}</text>`;
    });
    D.nodes.forEach(n => {
      const k = (hl.nodes || {})[n.id] || '', cx = n.x + n.w / 2;
      s += `<g class="node ${k}${k === 'new' ? ' pop' : ''}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>`;
      s += n.s
        ? `<text class="nt" text-anchor="middle" x="${cx}" y="${n.y + n.h / 2 - 3}">${esc(n.t)}</text><text class="ns" text-anchor="middle" x="${cx}" y="${n.y + n.h / 2 + 13}">${esc(n.s)}</text>`
        : `<text class="nt" text-anchor="middle" x="${cx}" y="${n.y + n.h / 2 + 5}">${esc(n.t)}</text>`;
      s += '</g>';
    });
    return { vb: `0 0 ${D.w} ${D.h}`, body: s };
  }

  function stageHTML(sc, st) {
    const id = 'ar' + (++uid);
    const stats = (st.stats || []).map(x => `<span class="st ${x.cls || ''}"><small>${esc(x.l)}</small><b>${esc(x.v)}</b></span>`).join('');
    const g = sc.diagram ? diagramStage(sc, st, id) : tablesStage(sc, st);
    return `${stats ? `<div class="stats">${stats}</div>` : ''}<svg viewBox="${g.vb}" class="dg" role="img" aria-label="${esc(st.log || sc.label)}">${g.body}</svg>`;
  }

  function predictHTML(P) {
    return `<section class="predict" aria-label="Predict"><h3>Predict before you read on</h3><p class="q">${P.q}</p>
      <div class="opts" role="group" aria-label="Choose a prediction">${P.opts.map((o, k) => `<button type="button" data-k="${k}">${o}</button>`).join('')}</div>
      <p class="why" hidden><b>Why:</b> ${P.why}</p></section>`;
  }
  function diagnoseHTML(list) {
    if (!list || !list.length) return '';
    return `<h2>Diagnose</h2><p class="sub">Failures this mechanism causes, from the original course notes.</p>` + list.map(d =>
      `<details class="dx"><summary><b class="dx-t">${d.t}</b>${d.sym ? `<span class="dx-s">${d.sym}</span>` : ''}</summary>
        ${d.ctx ? `<p><b>Context.</b> ${d.ctx}</p>` : ''}${d.why ? `<p><b>Why.</b> ${d.why}</p>` : ''}
        ${d.log ? `<pre>${esc(d.log)}</pre>` : ''}${d.fix ? `<ol>${d.fix.map(f => `<li>${f}</li>`).join('')}</ol>` : ''}
        ${d.note ? `<p class="note">${d.note}</p>` : ''}</details>`).join('');
  }

  window.Lesson = {
    course(course, opts = {}) {
      const app = document.getElementById('app'), root = opts.root || '';
      const chapters = course.chapters;
      let ci = 0, sc = null, mode = 'bug', idx = 0, view = 'visualize', timer = null, playing = false, speed = 1;
      let mounted = null, scene = null;

      app.innerHTML = `
<div class="lx">
  <header class="lx-top">
    <button class="lx-burger" type="button" aria-label="Show chapters" aria-controls="side" aria-expanded="false">☰</button>
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(root)}tech.html">Tech Stack</a><i>›</i><a href="#ch0" class="opt">${esc(course.name)}</a><i class="opt">›</i><b id="crumb"></b></nav>
    <div class="lx-tabs" role="group" aria-label="View">
      <button type="button" data-view="visualize" aria-pressed="true">▷ Visualize</button>
      <button type="button" data-view="explain" aria-pressed="false">Explain</button>
    </div>
  </header>
  <div class="lx-body">
    <aside class="lx-side" id="side">
      <input type="search" id="lsearch" placeholder="Search chapters…" aria-label="Search chapters">
      <h4>${esc(course.name)} · ${chapters.length} chapters</h4>
      <ol id="chapters"></ol>
    </aside>
    <main class="lx-main">
      <div id="viz">
        <h1 id="vtitle"></h1>
        <div class="lead" id="vlead"></div>
        <div class="scenbar" id="scenbar" role="group" aria-label="Scenarios"></div>
        <div class="sqlbox" id="scene-code"><div class="lbl" id="codelbl">Code</div><pre id="sql"></pre></div>
        <div class="stage" id="scene-stage"><div class="cap" id="cap"></div><div class="say" id="say" aria-live="polite"></div><div id="svgwrap"></div></div>
        <div class="player" id="scene-player" role="group" aria-label="Playback">
          <button type="button" id="p-reset" aria-label="Restart">↺</button>
          <button type="button" id="p-prev" aria-label="Previous step">‹</button>
          <button type="button" id="p-play" aria-label="Play">▶</button>
          <button type="button" id="p-next" aria-label="Next step">›</button>
          <input type="range" class="scrub" id="p-scrub" min="0" value="0" aria-label="Step">
          <span class="count" id="p-count" aria-live="polite"></span>
          <select id="p-speed" aria-label="Speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        </div>
      </div>
      <article class="prose" id="exp" hidden></article>
    </main>
    <aside class="lx-aside" id="aside">
      <section>
        <h3>Inputs</h3>
        <p class="hint" id="desc"></p>
        <div id="modeblk"><p class="lbl2">MODE</p>
        <div class="seg" id="mode"><button type="button" data-m="bug" aria-pressed="true">Reproduce the bug</button><button type="button" data-m="fix" aria-pressed="false">Apply the fix</button></div></div>
      </section>
      <section>
        <h3>Log</h3>
        <ol class="lx-log" id="log"></ol>
      </section>
    </aside>
  </div>
</div>`;

      const $ = id => document.getElementById(id);
      const scrim = document.createElement('div'); scrim.className = 'lx-scrim'; scrim.hidden = true; document.body.append(scrim);
      const chap = () => chapters[ci];
      const steps = () => (sc && sc[mode]) || [];

      /* ---- sidebar ---- */
      function chapterList(q) {
        const t = q.trim().toLowerCase();
        $('chapters').innerHTML = chapters.map((c, i) => ({ c, i })).filter(({ c }) => !t || c.title.toLowerCase().includes(t)).map(({ c, i }) =>
          `<li><a href="#ch${i}"${i === ci ? ' aria-current="page"' : ''}><span class="n">${i + 1}</span><span>${esc(c.title)}</span></a></li>`).join('') || '<li><span class="lk">No match</span></li>';
      }
      $('lsearch').addEventListener('input', e => chapterList(e.target.value));

      /* ---- playback ---- */
      function stop() { playing = false; clearTimeout(timer); $('p-play').textContent = '▶'; $('p-play').setAttribute('aria-label', 'Play'); }
      function tick() { if (idx < steps().length - 1) { idx++; render(); timer = setTimeout(tick, 1500 / speed); } else stop(); }
      function play() {
        if (idx >= steps().length - 1) idx = 0;
        playing = true; $('p-play').textContent = '❚❚'; $('p-play').setAttribute('aria-label', 'Pause');
        render(); timer = setTimeout(tick, 1500 / speed);
      }
      function go(n) { stop(); idx = Math.max(0, Math.min(steps().length - 1, n)); render(); }

      /* ---- URL state: #chN&s=scenario&m=fix&view=explain&step=3 (zero-based chapter) ---- */
      function saveHash() {
        const p = [`ch${ci}`];
        if (view === 'explain') p.push('view=explain'); else if (sc) { p.push('s=' + sc.id); if (mode === 'fix') p.push('m=fix'); if (idx) p.push('step=' + (idx + 1)); }
        history.replaceState(null, '', '#' + p.join('&'));
      }

      function renderSide() {
        chapterList($('lsearch').value);
        $('crumb').textContent = chap().title;
        document.title = chap().title + ' · ' + course.name;
      }

      function renderExplain() {
        const c = chap();
        $('exp').innerHTML = `<h1 class="ptitle">${c.n || ci + 1}. ${esc(c.title)}</h1>
          <div class="problem"><span class="sect-tag">Problem</span><div>${c.problem}</div></div>
          ${c.predict ? predictHTML(c.predict) : ''}
          <div class="mech"><span class="sect-tag">Mechanism</span></div>
          <div class="mechbody">${c.explain}</div>
          ${diagnoseHTML(c.diagnose)}
          ${c.source ? `<p class="src">Original source: <a href="${esc(c.source.href)}" target="_blank" rel="noopener">${esc(c.source.label)}</a></p>` : ''}`;
      }

      function pickScenario(id, m) {
        const list = chap().scenarios || [];
        sc = list.find(s => s.id === id) || list[0] || null;
        mode = m === 'fix' && sc && sc.fix ? 'fix' : 'bug'; idx = 0;
      }

      function loadChapter(i, hashScenario, hashMode, hashStep) {
        stop();
        ci = Math.max(0, Math.min(chapters.length - 1, i));
        buildScenarioButtons();
        pickScenario(hashScenario, hashMode);
        if (hashStep) idx = Math.max(0, Math.min(steps().length - 1, Number(hashStep) - 1));
        $('vtitle').textContent = chap().title;
        $('vlead').innerHTML = chap().problem;
        renderExplain(); renderSide(); render(); saveHash();
        if (opts.scrollToTop) window.scrollTo(0, 0);
      }


      /* ---- scene stage (v3): panels stay, tokens keep their ids and move between steps ---- */
      const SVGNS = 'http://www.w3.org/2000/svg';
      function sceneMount(sc) {
        const S = sc.scene, mid = 'sa' + (++uid);
        const panels = (S.panels || []).map(p => `<g class="panel"><rect class="pbox tone-${p.tone || 'info'}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="14"/><text class="ptitle" x="${p.x + 12}" y="${p.y + 20}">${esc(p.title)}</text><text class="pbadge" data-panel="${esc(p.id)}" x="${p.x + p.w - 12}" y="${p.y + p.h - 10}" text-anchor="end"></text></g>`).join('');
        $('svgwrap').innerHTML = `<div class="stats" id="sc-stats"></div><svg viewBox="0 0 ${S.w} ${S.h}" class="scene" role="img" aria-label="${esc(sc.label)}"><defs><marker id="${mid}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="arr"/></marker></defs>${panels}<g class="toks"></g><g class="arrows"></g><g class="hud"></g></svg>`;
        const svg = $('svgwrap').querySelector('svg');
        return { mid, svg, toks: svg.querySelector('.toks'), arrows: svg.querySelector('.arrows'), hud: svg.querySelector('.hud'), els: new Map() };
      }
      function tokElement(id) {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'tok new'); g.dataset.id = id; setTimeout(() => g.classList.remove('new'), 520);
        g.innerHTML = '<rect x="0" y="0" height="44" rx="9"/><text class="tl"></text><text class="ts"></text>';
        return g;
      }
      function paintTok(g, t, p) {
        const w = t.w || 96;
        g.dataset.tone = t.tone || 'info';
        g.classList.toggle('hl', !!p.hl);
        g.querySelector('rect').setAttribute('width', w);
        g.querySelector('rect').setAttribute('height', t.h || 44);
        g.classList.toggle('bar', !!t.h);
        const tl = g.querySelector('.tl'), ts = g.querySelector('.ts');
        tl.setAttribute('x', w / 2); tl.setAttribute('y', 18); tl.setAttribute('text-anchor', 'middle'); tl.textContent = t.label || '';
        ts.setAttribute('x', w / 2); ts.setAttribute('y', 35); ts.setAttribute('text-anchor', 'middle'); ts.textContent = t.sub || '';
        g.style.transform = `translate(${p.x}px,${p.y}px)`;
      }
      function sceneUpdate(sc, st, sm) {
        const S = sc.scene, at = st.at || {}, base = S.tokens || {};
        for (const [tid, g] of sm.els) if (!(tid in at)) { sm.els.delete(tid); g.classList.add('leave'); setTimeout(() => g.remove(), 520); }
        for (const tid of Object.keys(at)) {
          const p = at[tid], t = { ...(base[tid] || {}), ...p };
          let g = sm.els.get(tid);
          if (!g) { g = tokElement(tid); sm.els.set(tid, g); sm.toks.append(g); }
          paintTok(g, t, p);
        }
        const W = tid => ((base[tid] || {}).w || 96);
        const ctr = tid => at[tid] && { x: at[tid].x + W(tid) / 2, y: at[tid].y + 22 };
        sm.arrows.innerHTML = (st.arrows || []).map(([a, b, label, cls]) => {
          let A = ctr(a), B = ctr(b); if (!A || !B) return '';
          /* side by side: run from edge to edge so the line never crosses a label */
          if (Math.abs(B.x - A.x) > Math.abs(B.y - A.y) + 20) {
            const right = B.x > A.x;
            A = { x: right ? at[a].x + W(a) : at[a].x, y: A.y };
            B = { x: right ? at[b].x : at[b].x + W(b), y: B.y };
          }
          return `<line class="sarrow ${cls || ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" marker-end="url(#${sm.mid})"/>` +
            (label ? `<text class="elab" x="${(A.x + B.x) / 2}" y="${(A.y + B.y) / 2 - 8}" text-anchor="middle">${esc(label)}</text>` : '');
        }).join('');
        sm.svg.querySelectorAll('.pbadge').forEach(el => { el.textContent = (st.badge || {})[el.dataset.panel] || ''; });
        $('sc-stats').innerHTML = (st.stats || []).map(x => `<span class="st ${x.cls || ''}"><small>${esc(x.l)}</small><b>${esc(x.v)}</b></span>`).join('');
        let hud = '';
        if (st.callout) hud += `<g class="callout${st.moment ? ' moment' : ''}"><rect x="16" y="8" width="${S.w - 32}" height="36" rx="12"/><text x="${S.w / 2}" y="31" text-anchor="middle">${esc(st.callout)}</text></g>`;
        if (st.takeaway) {
          /* wrap the takeaway to the box width, then size the box to its lines */
          const words = String(st.takeaway).split(' '), lines = [];
          let cur = '';
          for (const w of words) { if ((cur + ' ' + w).trim().length > 64) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
          if (cur) lines.push(cur);
          const bh = lines.length * 18 + 14, by = S.h - 24 - bh;
          hud += `<g class="takeaway"><rect x="16" y="${by}" width="${S.w - 32}" height="${bh}" rx="12"/>` +
            lines.map((ln, i) => `<text x="${S.w / 2}" y="${by + 21 + i * 18}" text-anchor="middle">${esc(ln)}</text>`).join('') + '</g>';
        }
        if (S.footer) hud += `<text class="foot" x="${S.w / 2}" y="${S.h - 10}" text-anchor="middle">${esc(S.footer)}</text>`;
        sm.hud.innerHTML = hud;
      }
      /* ---- custom stages: a scenario with stage { setup(kit), frame(state, kit, refs), header(state), footer } draws its own scene ---- */
      function customMount(sc) {
        const S = sc.stage;
        $('svgwrap').innerHTML = `<div class="stats" id="sc-stats"></div><svg viewBox="0 0 ${S.w} ${S.h}" class="scene custom" role="img" aria-label="${esc(sc.label)}"><g class="draw"></g><g class="hud"></g></svg>`;
        const svg = $('svgwrap').querySelector('svg'), layer = svg.querySelector('.draw');
        const kit = window.Kit.bind(svg, layer);
        return { kit, refs: (S.setup ? S.setup(kit) : null) || {}, hud: svg.querySelector('.hud') };
      }
      function customUpdate(sc, st, cm) {
        const S = sc.stage, state = st.state || {}, first = !cm.ready;
        if (first) { cm.kit.svg.classList.add('snap'); window.Kit.setSnap(true); }
        S.frame(state, cm.kit, cm.refs, { step: idx, steps: steps() });
        if (first) { cm.ready = true; setTimeout(() => { cm.kit.svg.classList.remove('snap'); window.Kit.setSnap(false); }, 140); }
        $('sc-stats').innerHTML = (st.stats || []).map(x => `<span class="st ${x.cls || ''}"><small>${esc(x.l)}</small><b>${esc(x.v)}</b></span>`).join('');
        const hd = S.header ? S.header(state) : null;
        let hud = '';
        if (hd) hud += `<text class="khead" x="16" y="16">${esc(hd.left || '')}</text><text class="khead r" x="${S.w - 16}" y="16" text-anchor="end">${esc(hd.right || '')}</text>`;
        if (st.callout) hud += `<g class="callout${st.moment ? ' moment' : ''}"><rect x="16" y="24" width="${S.w - 32}" height="36" rx="12"/><text x="${S.w / 2}" y="47" text-anchor="middle">${esc(st.callout)}</text></g>`;
        if (st.takeaway) {
          const words = String(st.takeaway).split(' '), lines = [];
          let cur = '';
          for (const w of words) { if ((cur + ' ' + w).trim().length > 64) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
          if (cur) lines.push(cur);
          const bh = lines.length * 18 + 14, by = S.h - 24 - bh;
          hud += `<g class="takeaway"><rect x="16" y="${by}" width="${S.w - 32}" height="${bh}" rx="12"/>` + lines.map((ln, i) => `<text x="${S.w / 2}" y="${by + 21 + i * 18}" text-anchor="middle">${esc(ln)}</text>`).join('') + '</g>';
        }
        if (S.footer) hud += `<text class="foot" x="${S.w / 2}" y="${S.h - 10}" text-anchor="middle">${esc(S.footer)}</text>`;
        cm.hud.innerHTML = hud;
      }

      function render() {
        const st = steps()[idx] || { log: '' }, N = steps().length;
        const lines = (sc.code && (sc.code[mode] || sc.code.bug)) || (sc.sql && (sc.sql[mode] || sc.sql.bug)) || [];
        $('codelbl').textContent = sc.codeLabel || 'Code';
        $('sql').innerHTML = lines.map((l, i) => `<span class="ln${st.code === i || st.sql === i ? ' on' : ''}">${esc(l).replace(KW, '<b class="kw">$1</b>') || '&nbsp;'}</span>`).join('\n');
        const phase = sc.fix ? (mode === 'fix' ? ' · after the fix' : ' · the bug') : '';
        $('cap').textContent = `${sc.label}${phase} · step ${idx + 1} of ${N}`;
        $('say').innerHTML = st.log || '';
        if (sc.stage) { if (mounted !== sc) { scene = customMount(sc); mounted = sc; } customUpdate(sc, st, scene); }
        else if (sc.scene) { if (mounted !== sc) { scene = sceneMount(sc); mounted = sc; } sceneUpdate(sc, st, scene); }
        else { mounted = null; $('svgwrap').innerHTML = stageHTML(sc, st); }
        $('log').innerHTML = steps().slice(0, idx + 1).map((s, i) => `<li class="${i === idx ? 'cur' : ''}"><span class="i">${i + 1}</span><span>${esc(s.log)}</span></li>`).join('');
        $('scene-player').hidden = sc.presentation === 'static';
        $('p-count').textContent = `Step ${idx + 1} / ${N}`;
        $('p-scrub').max = N - 1; $('p-scrub').value = idx;
        $('p-prev').disabled = idx === 0; $('p-next').disabled = idx >= N - 1;
        $('desc').textContent = sc.desc || '';
        [...$('scenbar').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.id === sc.id));
        [...$('mode').children].forEach(b => { b.setAttribute('aria-pressed', b.dataset.m === mode); b.disabled = b.dataset.m === 'fix' && !sc.fix; });
        $('modeblk').hidden = !sc.fix;
        const cur = $('log').querySelector('.cur'); if (cur && view === 'visualize') cur.scrollIntoView({ block: 'nearest' });
        saveHash();
      }

      function buildScenarioButtons() {
        $('scenbar').innerHTML = (chap().scenarios || []).map(s => `<button type="button" data-id="${s.id}" aria-pressed="false">${esc(s.label)}</button>`).join('');
      }
      $('scenbar').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        stop(); pickScenario(b.dataset.id, mode); render();
      });
      $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; stop(); mode = b.dataset.m; idx = 0; render(); });
      $('p-reset').onclick = () => go(0);
      $('p-prev').onclick = () => go(idx - 1);
      $('p-next').onclick = () => go(idx + 1);
      $('p-play').onclick = () => (playing ? stop() : play());
      $('p-scrub').addEventListener('input', e => go(Number(e.target.value)));
      $('p-speed').onchange = e => { speed = Number(e.target.value); if (playing) { clearTimeout(timer); timer = setTimeout(tick, 1500 / speed); } };

      /* Predict: one choice reveals the answer and the reason. */
      $('exp').addEventListener('click', e => {
        const b = e.target.closest('.opts button'); if (!b) return;
        const P = chap().predict, k = Number(b.dataset.k), box = b.closest('.predict');
        [...box.querySelectorAll('.opts button')].forEach((x, j) => { x.disabled = true; x.classList.toggle('right', j === P.ans); x.classList.toggle('wrong', j === k && k !== P.ans); });
        box.querySelector('.why').hidden = false;
      });

      /* ---- view switch ---- */
      function setView(v) {
        view = v; stop();
        document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
        $('viz').hidden = v !== 'visualize'; $('exp').hidden = v !== 'explain';
        document.querySelector('.lx-body').classList.toggle('explain', v === 'explain');
        saveHash();
      }
      document.querySelector('.lx-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });

      /* ---- hash routing: sidebar links and back/forward ---- */
      function fromHash() {
        const h = location.hash.slice(1);
        const m = /^ch(\d+)/.exec(h), p = new URLSearchParams(h.replace(/^ch\d+&?/, ''));
        const i = m ? Number(m[1]) : 0;
        const wantView = p.get('view') === 'explain' ? 'explain' : (p.get('view') === 'visualize' || p.get('s')) ? 'visualize' : (opts.defaultView || 'visualize');
        view = wantView;
        if (!m || i !== ci || !sc) loadChapter(i, p.get('s') || '', p.get('m'), p.get('step'));
        else { /* same chapter: only the tabs or scenario may have changed */ if (p.get('s') && sc && p.get('s') !== sc.id) { pickScenario(p.get('s'), p.get('m')); idx = 0; render(); } }
        setView(wantView);
      }
      addEventListener('hashchange', fromHash);

      /* ---- mobile drawer ---- */
      const side = $('side'), burger = document.querySelector('.lx-burger');
      const toggleSide = open => { side.classList.toggle('open', open); scrim.hidden = !open; burger.setAttribute('aria-expanded', open); };
      burger.onclick = () => toggleSide(!side.classList.contains('open'));
      scrim.onclick = () => toggleSide(false);
      side.addEventListener('click', e => { if (e.target.closest('a')) toggleSide(false); });

      addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) || view !== 'visualize') return;
        if (e.key === 'ArrowRight') go(idx + 1); else if (e.key === 'ArrowLeft') go(idx - 1); else if (e.key === ' ') { e.preventDefault(); $('p-play').click(); }
      });

      chapterList('');
      fromHash();
    }
  };
})();
