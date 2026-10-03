/* Engineer Lab · shared runtime for the internals playgrounds.
 *
 *  - Lab.morph      patches the DOM in place instead of replacing innerHTML, so animated SVG and
 *                   controls keep their identity (no flicker, no lost focus, no restarted CSS animation)
 *  - one scheduler  animate()/stopAll(): starting anything cancels whatever else is running
 *  - page shell     problem → map → chapters → build checklist → capstone (built from STORY)
 *  - overview map   generic renderer for an OVS topology
 *  - cluster sim    generic player for a SIMM model
 *
 * Page contract (see scylla/visualize/01-scylla-internals-end-to-end.html):
 *   Lab.mount(STORY)                        first statement of the page script
 *   Lab.sim(SIMM)                           inside the simulation IIFE
 *   Lab.start({phases,detail,ovs,ctl,state, beforePlay, afterPlay})   last statement
 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pc = i => `var(--p${((i % 8) + 8) % 8})`;
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const L = window.Lab = { hooks: { stop: [] }, cfg: null };
const st = { cur: 0, speed: 1, paused: false, gen: 0, state: 'idle' };
const vis = new Map();   // selector -> is it on screen (only for animations that ask to be paused off-screen)
// globals the engines read (rsLoop checks cur/paused/speed)
['cur', 'speed', 'paused', 'gen'].forEach(k => Object.defineProperty(window, k, { get: () => st[k], set: v => { st[k] = v; }, configurable: true }));
L.onStop = fn => L.hooks.stop.push(fn);

/* ================= morph: patch DOM in place ================= */
const sameNode = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.nodeName === b.nodeName && a.namespaceURI === b.namespaceURI));
function syncAttrs(d, s) {
  const isDetails = d.nodeName === 'DETAILS';
  for (const a of [...d.attributes]) if (!s.hasAttribute(a.name) && !(isDetails && a.name === 'open')) d.removeAttribute(a.name);
  for (const a of s.attributes) { if (isDetails && a.name === 'open') continue; if (d.getAttribute(a.name) !== a.value) d.setAttribute(a.name, a.value); }
  const tag = d.nodeName;
  if (tag === 'INPUT') {
    if (d !== document.activeElement && d.value !== (s.getAttribute('value') || '') && d.type !== 'file') d.value = s.getAttribute('value') || '';
    if (d.type === 'checkbox' || d.type === 'radio') d.checked = s.hasAttribute('checked');
  } else if (tag === 'OPTION') d.selected = s.hasAttribute('selected');
  else if (tag === 'TEXTAREA' && d !== document.activeElement) { if (d.value !== s.textContent) d.value = s.textContent; }
}
function patch(d, s) {
  if (d.nodeType !== 1) { if (d.nodeValue !== s.nodeValue) d.nodeValue = s.nodeValue; return; }
  syncAttrs(d, s);
  if (d.nodeName === 'TEXTAREA') return;
  patchKids(d, s);
  if (d.nodeName === 'SELECT') { const o = [...d.options].find(x => x.hasAttribute('selected')); if (o) d.value = o.value; }
}
function patchKids(d, s) {
  const sk = s.childNodes;
  let i = 0;
  for (; i < sk.length; i++) {
    const sn = sk[i], dn = d.childNodes[i];
    if (!dn) d.appendChild(document.importNode(sn, true));
    else if (sameNode(dn, sn)) patch(dn, sn);
    else d.replaceChild(document.importNode(sn, true), dn);
  }
  while (d.childNodes.length > sk.length) d.removeChild(d.lastChild);
}
L.morph = function (root, html) {
  if (!root) return;
  const tpl = document.createElement('template');
  const isSvg = root.namespaceURI === 'http://www.w3.org/2000/svg';
  tpl.innerHTML = isSvg ? '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>' : html;
  patchKids(root, isSvg ? tpl.content.firstChild : tpl.content);
};
const morph = L.morph;

/* ================= scheduler ================= */
function animate(draw, dur, watch) {
  const g = ++st.gen;
  let el = 0, last = null;
  if (REDUCED) { draw(1); return Promise.resolve(true); }
  draw(0);
  return new Promise(res => {
    function frame(now) {
      if (g !== st.gen) { res(false); return; }
      if (last === null) last = now;
      const dt = Math.min(64, now - last); last = now;      // clamp: a background tab never "jumps"
      if (st.paused || (watch && vis.get(watch) === false)) { requestAnimationFrame(frame); return; }
      el += dt * st.speed;
      const p = Math.min(1, el / dur);
      draw(p);
      if (p < 1) requestAnimationFrame(frame); else res(true);
    }
    requestAnimationFrame(frame);
  });
}
function stopAll() {
  st.gen++; st.paused = false; st.state = 'idle';
  if (simApi) simApi.pause();
  L.hooks.stop.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  playUI();
}
window.animate = animate; window.stopAll = stopAll;
L.sleep = ms => new Promise(r => setTimeout(r, ms / st.speed));

/* ================= knobs: show the first 3, tuck the rest away ================= */
function knobs(html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const items = [...tpl.content.children];
  if (items.length <= 3) return html;
  const out = document.createElement('div');
  items.slice(0, 3).forEach(n => out.append(n));
  const det = document.createElement('details'); det.className = 'more';
  const sm = document.createElement('summary'); sm.textContent = `More options (${items.length - 3})`;
  const box = document.createElement('div'); items.slice(3).forEach(n => box.append(n));
  det.append(sm, box); out.append(det);
  return out.innerHTML;
}

/* ================= page shell ================= */
L.mount = function (story) {
  L.story = story = story || {};
  const app = document.createElement('div'); app.id = 'app';
  const P = story.problem || {};
  const paras = (P.scene || []).map(t => `<p>${t}</p>`).join('');
  const musts = (P.musts || []).map(t => `<li><span>${t}</span></li>`).join('');
  const brk = P.naive ? `<div class="callout warn"><b class="t">${P.naive.title || 'The obvious first attempt'}</b>${P.naive.text || ''}${P.naive.breaks ? '<ul>' + P.naive.breaks.map(b => `<li>${b}</li>`).join('') + '</ul>' : ''}</div>` : '';
  const ex = (story.extras || []).map(e => `<details class="dd"><summary>${e.title}${e.sub ? `<small>${e.sub}</small>` : ''}</summary><div id="${e.id}" class="ddb"></div></details>`).join('');
  app.innerHTML = `
  <div class="topbar"><div class="wrap">
    <a class="home" href="../../index.html">← Engineer Lab</a><b>${esc(story.system || document.title)}</b>
    <nav aria-label="Page sections"><a href="#problem">Problem</a><a href="#overview">Map</a><a href="#chapters">Chapters</a><a href="#build">Build it</a><a href="#capstone">Capstone</a></nav>
  </div></div>
  <div class="wrap">
    <header class="hero" id="problem">
      <div class="kick">${esc(story.kicker || 'Problem-based tour')}</div>
      <h1>${story.title || esc(document.title)}</h1>
      <p class="lead">${story.lead || ''}</p>
      <div class="scene">
        <div class="card story"><h4>The situation</h4>${paras}${brk ? `<div style="margin-top:6px">${brk}</div>` : ''}</div>
        <div class="card"><h4>What your design must guarantee</h4><ul class="musts">${musts}</ul>
          <div class="callout ask" style="margin-top:14px"><b class="t">Your quest</b>${P.quest || 'Rebuild it piece by piece. Each chapter starts from a problem, shows the naive fix breaking, then the real design.'}</div></div>
      </div>
      <div class="sec-h" style="margin-top:26px"><h2 style="font-size:20px">The journey, one problem at a time</h2></div>
      <ol class="journey" id="journey"></ol>
      <div id="dataHost"></div>
    </header>

    <section class="sec" id="overview">
      <div class="sec-h"><div class="kick">Overview</div><h2>${(story.overview && story.overview.title) || 'The whole system on one page'}</h2>
        <p>${(story.overview && story.overview.lead) || 'Before the details, see how the pieces connect. Press <b>Trace a request</b> to follow one request through, or tap a component to see what it receives and sends.'}</p></div>
      <div class="card">
        <div class="ovhead"><button class="primary" id="ovTrace">▶ Trace a request</button><button id="ovClear" class="ghost">Reset</button><span class="note" id="ovCap" style="margin:0"></span></div>
        <div class="svgscroll"><div id="ovView"></div></div><div class="swipehint">← swipe the map →</div>
        <ol class="ovsteps" id="ovSteps" aria-label="Request steps"></ol>
        <div class="ovchips" id="ovChips" aria-label="Components"></div>
        <div id="ovInfo"></div>
        <div class="legend"><span class="chip">solid = data flow</span><span class="chip">dashed = control / metadata</span><span class="chip" style="border-color:var(--bad)">dotted = events / async</span></div>
      </div>
    </section>

    <section class="sec" id="chapters">
      <div class="sec-h"><div class="kick">Chapter by chapter</div><h2>${(story.chaptersTitle) || 'Rebuild it, one problem at a time'}</h2>
        <p>Each chapter: <b>problem</b> → <b>naive first attempt</b> → <b>the real design</b> → <b>try it</b> → <b>build it yourself</b> → <b>trade-offs</b>.</p></div>
      <div class="chtabs" id="chTabs" role="tablist" aria-label="Chapters"></div>
      <article class="chapter" id="chapter" style="scroll-margin-top:64px">
        <div class="ch-head"><div class="ch-n" id="chN"></div><div><small id="chKick"></small><h3 id="chTitle"></h3></div></div>
        <div class="pair" id="chPN">
          <div class="lbk"><div class="stepno"><i>1</i>The problem</div><div id="chProblem"></div></div>
          <div class="lbk"><div class="stepno"><i>2</i>First attempt</div><div id="chNaive"></div></div>
        </div>
        <div class="lbk design"><div class="stepno"><i>3</i>The real design</div><div id="blurb"></div></div>
        <div class="lab" id="chLab">
          <div class="stepno"><i>4</i>Try it</div>
          <div id="chPredict"></div>
          <div class="knobs" id="phCtl"></div>
          <div class="player"><button class="primary" id="anim">▶ Play</button><input type="range" id="scrub" min="0" max="1000" value="1000" aria-label="Scrub the animation"><label>Speed <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
          <div class="view" id="phView" aria-live="polite"></div>
        </div>
        <div class="lbk build"><div class="stepno"><i>5</i>Build it yourself</div><div id="chBuild"></div></div>
        <div class="lbk"><div class="stepno"><i>6</i>Trade-offs &amp; failure modes</div><div id="chTrade"></div></div>
        <div class="ch-nav"><button id="prev"></button><button id="nextB"></button></div>
      </article>
    </section>

    <section class="sec" id="build">
      <div class="sec-h"><div class="kick">If you build it</div><h2>${(story.milestonesTitle) || 'A build order that always has something testable'}</h2>
        <p>${(story.milestonesLead) || 'Implement in this order. Each milestone ends with a test you can run before moving on.'}</p></div>
      <ol class="miles" id="miles"></ol>
    </section>

    <section class="sec sim" id="capstone">
      <div class="sec-h"><div class="kick">Capstone</div><h2>${(story.capstone && story.capstone.title) || 'Put it together: a live cluster'}</h2>
        <p>${(story.capstone && story.capstone.lead) || 'Everything from the chapters, running at once. Play a scenario, scrub the timeline, click any node or event to see why it happened, then break something.'}</p></div>
      <div class="card">
        <div class="ctl"><label>Scenario <select id="simScn"></select></label><label><span id="simNL">nodes</span> <select id="simN"></select></label><span id="simSet" class="ctl" style="margin:0"></span></div>
        <p class="scn" id="simDesc"></p>
        <div class="player"><button class="primary" id="simPlay">▶ Play</button><button id="simStep">Step ›</button><button id="simReset" aria-label="Back to start">⏮</button><label>Speed <select id="simSpeed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
        <div class="simbox"><svg id="simSvg" role="img" aria-label="Cluster simulation"></svg></div>
        <div class="timeline" style="margin-top:6px"><input type="range" id="simT" min="0" max="1000" value="0" step="10" aria-label="Timeline"><span class="mono" id="simTv"></span></div>
        <div id="simInsp" class="box simnow"></div>
        <div class="simgrid"><div><h4 style="font-size:13px;margin:0 0 6px">Event log <span class="note" style="font-weight:400">tap an event to see why</span></h4><div id="simLog" class="simlog"></div></div>
          <div><details class="adv"><summary>Edit the script &amp; add your own actions</summary>
            <p class="note">One action per line: time in ms, operation, arguments.</p><textarea id="simAct" rows="7" spellcheck="false"></textarea>
            <div class="bar"><select id="simOp"></select><span id="simArgs" class="bar" style="margin:0"></span><button id="simAdd">＋ add</button></div></details></div></div>
      </div>
    </section>

    ${ex ? `<section class="sec" id="extras"><div class="sec-h"><div class="kick">Extras</div><h2>Deep dives</h2></div>${ex}</section>` : ''}
    <footer class="foot">Part of <b>engineer-lab</b>. Everything runs in your browser; your data never leaves this page. These are learning models: simplified on purpose.</footer>
  </div>`;
  document.body.prepend(app);
  const slot = $('#dataSlot'), host = $('#dataHost');
  if (slot && host) { while (slot.firstChild) host.append(slot.firstChild); slot.remove(); }
};

/* ================= chapters ================= */
const li = a => '<ul>' + (a || []).map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
function tabsHTML(k) {
  const ph = L.cfg.phases;
  return ph.map((p, i) => `<button class="chtab ${i === k ? 'act' : ''}" role="tab" aria-selected="${i === k}" data-ph="${i}" style="--pc:${pc(i)}"><i>${i + 1}</i><span>${esc(p.t)}</span></button>`).join('');
}
function renderStatic(k) {
  const c = L.cfg, ph = c.phases[k], sc = ((L.story.chapters || [])[k]) || {}, d = (c.detail || [])[k];
  const n = c.phases.length;
  const root = $('#chapter'); root.style.setProperty('--pc', pc(k));
  $('#chN').textContent = k + 1; $('#chN').style.setProperty('--pc', pc(k));
  $('#chKick').textContent = `Chapter ${k + 1} of ${n}`;
  $('#chTitle').textContent = ph.t;
  $('#chProblem').innerHTML = `<p class="big-ask">${sc.ask || esc(ph.s || '')}</p>${sc.why ? `<p class="mut">${sc.why}</p>` : ''}`;
  const v0 = sc.v0;
  $('#chNaive').innerHTML = v0 ? `<p><b>${v0.name || ''}</b></p>${v0.code ? `<pre><code>${esc(v0.code)}</code></pre>` : ''}<div class="callout warn" style="margin-top:10px"><b class="t">Where it breaks</b>${v0.breaks || ''}</div>` : '<p class="mut">Start simple, then see what fails.</p>';
  $('#blurb').innerHTML = (sc.design ? `<p>${sc.design}</p>` : '') + `<p${sc.design ? ' class="mut"' : ''}>${ph.b || ''}</p>`;
  const pr = sc.predict;
  $('#chPredict').innerHTML = pr ? `<div class="callout ask predict"><b class="t">Predict first</b><div>${pr.q}</div><div class="opts">${pr.opts.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join('')}</div><div class="fb callout"></div></div>` : '';
  const b = sc.build;
  $('#chBuild').innerHTML = b ? `${b.intro ? `<p>${b.intro}</p>` : ''}<ol>${(b.steps || []).map(s => `<li>${s}</li>`).join('')}</ol>${b.code ? `<pre><code>${esc(b.code)}</code></pre>` : ''}${b.rule ? `<div class="callout good rule"><b class="t">The invariant to protect</b>${b.rule}</div>` : ''}` : '<p class="mut">No build notes for this chapter yet.</p>';
  if (d) {
    const tabs = [['how', 'How it works'], ['pc', 'Pros & cons'], ['fm', `Failure modes (${(d.fails || []).length})`], ['w', 'What to watch']];
    $('#chTrade').innerHTML = `<div class="lbtabs" role="tablist">${tabs.map(([id, t], i) => `<button role="tab" data-t="${id}" class="${i === 0 ? 'act' : ''}">${t}</button>`).join('')}</div>
      <div class="tpanel" data-p="how"><p>${esc(d.how || '')}</p></div>
      <div class="tpanel pc" data-p="pc" hidden><div class="lpro"><b>✓ Pros</b>${li(d.pros)}</div><div class="lcon"><b>✗ Cons</b>${li(d.cons)}</div></div>
      <div class="tpanel" data-p="fm" hidden><table class="fm"><tr><th>Failure mode</th><th>What you see</th><th>Mitigation</th></tr>${(d.fails || []).map(f => `<tr><td><b>${esc(f.m)}</b></td><td>${esc(f.s)}</td><td>${esc(f.x)}</td></tr>`).join('')}</table></div>
      <div class="tpanel" data-p="w" hidden>${li(d.watch)}</div>`;
  } else $('#chTrade').innerHTML = '';
  const pv = c.phases[k - 1], nx = c.phases[k + 1];
  const pb = $('#prev'), nb = $('#nextB');
  pb.innerHTML = pv ? `<small>‹ Previous</small>${esc(pv.t)}` : ''; pb.style.visibility = pv ? '' : 'hidden';
  nb.innerHTML = nx ? `<small>Next ›</small>${esc(nx.t)}` : ''; nb.style.visibility = nx ? '' : 'hidden';
  $('#chTabs').innerHTML = tabsHTML(k);
  const act = $('#chTabs .act'); if (act && act.scrollIntoView && st.userNav) { const bar = $('#chTabs'); bar.scrollTo({ left: act.offsetLeft - bar.clientWidth / 2 + act.clientWidth / 2, behavior: 'smooth' }); }
}
let shown = -1;
function showPhase(k, p) {
  if (p === undefined) p = 1;
  const c = L.cfg; if (!c) return;
  st.cur = k;
  if (k !== shown) { renderStatic(k); shown = k; }
  morph($('#phCtl'), knobs(c.ctl ? c.ctl(k) : ''));
  paintView(p);
  const ph = c.phases[k], sc = $('#scrub'); sc.style.display = ph.live ? 'none' : ''; sc.value = Math.round(p * 1000);
  ovRender(); playUI();
}
function paintView(p) {
  if (p === undefined) p = 1;
  const c = L.cfg, s = c.state ? c.state() : null, v = $('#phView');
  if (!s || s.error) { morph(v, `<div class="box bad">${esc(s ? s.error : 'No data yet. Pick a sample above.')}</div>`); return; }
  try { morph(v, c.phases[st.cur].draw(p)); } catch (e) { morph(v, `<div class="box bad">Render error: ${esc(e.message)}</div>`); console.error(e); }
}
function jumpPhase(k, scroll) {
  stopAll(); st.userNav = true; showPhase(k);
  if (scroll !== false) { const t = $('#chapter'); if (t) t.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }
}
window.showPhase = showPhase; window.paintView = paintView; window.jumpPhase = jumpPhase;

function playUI() {
  const b = $('#anim'); if (!b) return;
  b.textContent = st.state === 'playing' ? (st.paused ? '▶ Resume' : '⏸ Pause') : st.state === 'done' ? '↻ Replay' : '▶ Play';
}
function playPhase() {
  const c = L.cfg, k = st.cur;
  if (st.state === 'playing') { st.paused = !st.paused; playUI(); return; }
  stopAll(); if (c.beforePlay) c.beforePlay(k);
  st.state = 'playing'; playUI();
  const sc = $('#scrub'), g0 = st.gen;
  animate(p => { paintView(p); sc.value = Math.round(p * 1000); }, c.phases[k].dur || 5000, '#chLab').then(ok => {
    if (c.afterPlay) c.afterPlay(k);
    if (ok && g0 === st.gen) { st.state = 'done'; playUI(); }
  });
}

/* keep the interesting part of a horizontally scrollable SVG in view (phones) */
function follow(box, svg, vbW, x, instant) {
  if (!box || !svg || box.scrollWidth <= box.clientWidth + 4) return;
  const target = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, x / vbW * svg.clientWidth - box.clientWidth / 2));
  if (instant) box.scrollTo({ left: target, behavior: REDUCED ? 'auto' : 'smooth' }); else box.scrollLeft += (target - box.scrollLeft) * 0.18;
}

L.follow = follow;

/* ================= overview map ================= */
const OV = L.OV = { sel: null, k: -1, kf: null };
let OVS = null, OVN = null;
function ovAnchor(n, tx, ty) { const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy]; const s = Math.min((n.w / 2) / Math.abs(dx || 1e-9), (n.h / 2) / Math.abs(dy || 1e-9)); return [cx + dx * s, cy + dy * s]; }
function ovGeom(e) {
  const a = OVN[e.from], b = OVN[e.to], ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2]; let c = null;
  if (e.bend) { const mx = (ca[0] + cb[0]) / 2, my = (ca[1] + cb[1]) / 2, dx = cb[0] - ca[0], dy = cb[1] - ca[1], Ln = Math.hypot(dx, dy) || 1; c = [mx - dy / Ln * e.bend, my + dx / Ln * e.bend]; }
  const p0 = ovAnchor(a, ...(c || cb)), p1 = ovAnchor(b, ...(c || ca));
  const mid = c ? [.25 * p0[0] + .5 * c[0] + .25 * p1[0], .25 * p0[1] + .5 * c[1] + .25 * p1[1]] : [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  return { p0, p1, c, mid };
}
const qpt = (g, f) => { if (g.c) { const u = 1 - f; return [u * u * g.p0[0] + 2 * u * f * g.c[0] + f * f * g.p1[0], u * u * g.p0[1] + 2 * u * f * g.c[1] + f * f * g.p1[1]]; } return [g.p0[0] + (g.p1[0] - g.p0[0]) * f, g.p0[1] + (g.p1[1] - g.p0[1]) * f]; };
function findEdge(a, b) { let e = OVS.edges.find(x => x.from === a && x.to === b); if (e) return { e, rev: false }; e = OVS.edges.find(x => x.from === b && x.to === a); return e ? { e, rev: true } : null; }
function ovRender() {
  const el = $('#ovView'); if (!el || !OVS) return;
  const flow = OVS.flow || [], k = OV.k, act = new Set(), actE = new Set();
  if (k >= 0) { for (let i = 0; i <= Math.min(k, flow.length - 1); i++) act.add(flow[i].n); for (let i = 1; i <= k && i < flow.length; i++) { actE.add(flow[i - 1].n + '>' + flow[i].n); actE.add(flow[i].n + '>' + flow[i - 1].n); } }
  const sel = OV.sel, rel = new Set(); if (sel) { rel.add(sel); OVS.edges.forEach(e => { if (e.from === sel) rel.add(e.to); if (e.to === sel) rel.add(e.from); }); }
  const curPh = st.cur;
  let s = `<defs><marker id="ovar" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#8a94a6"/></marker><marker id="ovara" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--brand,var(--acc))"/></marker></defs>`;
  (OVS.groups || []).forEach(g => { s += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="7 5"/><text x="${g.x + 12}" y="${OVS.groupLabelBottom ? g.y + g.h - 10 : g.y + 17}" style="fill:var(--mut);font-size:11.5px;font-weight:700">${esc(g.label)}</text>`; });
  OVS.edges.forEach(e => {
    const g = ovGeom(e), on = actE.has(e.from + '>' + e.to), dim = sel && !(e.from === sel || e.to === sel), hl = sel && (e.from === sel || e.to === sel);
    const d = g.c ? `M${g.p0[0]},${g.p0[1]} Q${g.c[0]},${g.c[1]} ${g.p1[0]},${g.p1[1]}` : `M${g.p0[0]},${g.p0[1]} L${g.p1[0]},${g.p1[1]}`;
    s += `<g style="${dim ? 'opacity:.2' : ''}"><path d="${d}" class="ove ${e.kind || 'data'} ${on || hl ? 'act' : ''}" marker-end="url(#${on || hl ? 'ovara' : 'ovar'})"/>${on ? `<path d="${d}" class="ove flow act" style="stroke-width:5;opacity:.5"/>` : ''}<text x="${g.mid[0]}" y="${g.mid[1] - 5}" text-anchor="middle" style="font-size:10.5px;fill:${hl || on ? 'var(--brand,var(--acc))' : 'var(--mut)'};paint-order:stroke;stroke:var(--card);stroke-width:4px">${esc(e.label)}</text></g>`;
  });
  OVS.nodes.forEach(n => {
    const ph = n.phase, cls = ['ovn', sel === n.id ? 'sel' : '', ph !== undefined && ph === curPh ? 'cur' : '', act.has(n.id) ? 'act' : ''].join(' '), dim = sel && !rel.has(n.id);
    s += `<g class="${cls}" data-node="${n.id}" style="${dim ? 'opacity:.3' : ''}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${ph !== undefined ? pc(ph) : 'var(--card)'}"/><text x="${n.x + 10}" y="${n.y + 22}" font-weight="700" style="font-size:12.5px">${esc(n.label)}</text><text x="${n.x + 10}" y="${n.y + 40}" style="font-size:10.5px;fill:var(--mut)">${esc(n.sub || '')}</text>${ph !== undefined ? `<text x="${n.x + n.w - 8}" y="${n.y + n.h - 8}" text-anchor="end" style="font-size:10px;font-weight:700;fill:var(--mut)">ch ${ph + 1}</text>` : ''}</g>`;
  });
  // the travelling packet lives in the same string, so morph moves it instead of re-creating the SVG
  let fx = null;
  if (k >= 0) { const fn = OVN[flow[Math.min(k, flow.length - 1)].n]; if (fn) fx = fn.x + fn.w / 2; } else if (sel && OV.focus && OVN[sel]) fx = OVN[sel].x + OVN[sel].w / 2;
  if (k >= 0 && OV.kf != null) {
    const i = Math.min(flow.length - 1, Math.floor(OV.kf)), f = OV.kf - Math.floor(OV.kf);
    if (i >= 1) { const ed = findEdge(flow[i - 1].n, flow[i].n); if (ed) {
      const g = ovGeom(ed.e), ff = Math.min(1, f * 1.15), q = ed.rev ? 1 - ff : ff;
      for (let tr = 3; tr >= 1; tr--) { const qq = ed.rev ? Math.min(1, q + tr * .06) : Math.max(0, q - tr * .06), p2 = qpt(g, qq); s += `<circle cx="${p2[0]}" cy="${p2[1]}" r="${7 - tr * 1.4}" fill="var(--acc2)" opacity="${.5 - tr * .12}"/>`; }
      const p = qpt(g, q); fx = p[0]; s += `<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="var(--acc2)" stroke="#fff" stroke-width="2"/><text x="${p[0]}" y="${p[1] - 13}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:var(--acc2);paint-order:stroke;stroke:var(--card);stroke-width:4px">${esc(short(flow[i].t || '', 24))}</text>`;
    } }
  }
  let svg = el.firstElementChild;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') { el.innerHTML = `<svg viewBox="0 0 ${OVS.w} ${OVS.h}" role="img" aria-label="Architecture map"></svg>`; svg = el.firstElementChild; }
  morph(svg, s);
  if (fx != null) { follow(el.parentElement, svg, OVS.w, fx, k < 0); OV.focus = false; }
  const stp = $('#ovSteps'); if (stp) morph(stp, flow.map((f, i) => `<li data-k="${i}" class="${k >= 0 && i < k ? 'done' : ''} ${k >= 0 && i === Math.min(k, flow.length - 1) ? 'cur' : ''}"><span>${esc(f.t)}</span></li>`).join(''));
  const cap = $('#ovCap');
  if (cap) cap.innerHTML = k >= 0 ? `<b>Step ${Math.min(k, flow.length - 1) + 1}/${flow.length}:</b> ${esc(flow[Math.min(k, flow.length - 1)].t)}` : (sel ? '' : 'Tap a component to see how it connects.');
  const chips = $('#ovChips'); if (chips) chips.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.node === sel));
}
function ovInfo() {
  const el = $('#ovInfo'); if (!el) return;
  const sel = OV.sel && OVN[OV.sel];
  if (!sel) { el.innerHTML = ''; return; }
  const ins = OVS.edges.filter(e => e.to === sel.id), outs = OVS.edges.filter(e => e.from === sel.id), P = L.cfg.phases;
  el.innerHTML = `<div class="callout" style="margin-top:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">${esc(sel.label)}</b><span class="note" style="margin:0">${esc(sel.sub || '')}</span>${sel.phase !== undefined && P[sel.phase] ? `<button class="primary" data-go="${sel.phase}" style="margin-left:auto">Open chapter ${sel.phase + 1}: ${esc(P[sel.phase].t)} ›</button>` : ''}</div>
    <p style="margin:8px 0">${esc(sel.desc || '')}</p>
    <div class="g2"><div><b style="font-size:12px">Receives</b>${ins.map(e => `<div class="row"><span class="mut">${esc(OVN[e.from].label)}</span> ─ ${esc(e.label)} ▸</div>`).join('') || '<div class="note">nothing: this is where requests enter.</div>'}</div>
    <div><b style="font-size:12px">Sends</b>${outs.map(e => `<div class="row">▸ ${esc(e.label)} ─ <span class="mut">${esc(OVN[e.to].label)}</span></div>`).join('') || '<div class="note">nothing: it is an endpoint.</div>'}</div></div></div>`;
}
function ovSelect(id) { stopAll(); OV.k = -1; OV.kf = null; OV.sel = OV.sel === id ? null : id; OV.focus = true; ovInfo(); ovRender(); }
function ovInit() {
  OVS = L.cfg.ovs; if (!OVS) { const s = $('#overview'); if (s) s.hidden = true; return; }
  OVN = Object.fromEntries(OVS.nodes.map(n => [n.id, n]));
  $('#ovChips').innerHTML = OVS.nodes.map(n => `<button data-node="${n.id}" style="--pc:${n.phase !== undefined ? pc(n.phase) : 'var(--card)'}">${esc(n.label)}</button>`).join('');
  $('#ovView').addEventListener('click', e => { const n = e.target.closest('[data-node]'); if (n) ovSelect(n.dataset.node); });
  $('#ovChips').addEventListener('click', e => { const n = e.target.closest('[data-node]'); if (n) ovSelect(n.dataset.node); });
  $('#ovInfo').addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) jumpPhase(+g.dataset.go); });
  $('#ovTrace').onclick = () => { stopAll(); OV.sel = null; ovInfo(); const n = OVS.flow.length; animate(p => { OV.kf = Math.min(n - .001, p * n); OV.k = Math.floor(OV.kf); ovRender(); }, n * 1400, '#ovView'); };
  $('#ovSteps').addEventListener('click', e => { const li = e.target.closest('[data-k]'); if (!li) return; stopAll(); OV.sel = null; ovInfo(); OV.k = +li.dataset.k; OV.kf = OV.k; ovRender(); });
  $('#ovClear').onclick = () => { stopAll(); OV.k = -1; OV.kf = null; OV.sel = null; ovInfo(); ovRender(); };
}
window.ovRender = ovRender;

/* ================= cluster simulation (generic) ================= */
let SIMM = null, simApi = null;
const SIM = window.SIM = { n: 0, set: {}, run: null, T: 0, play: false, sel: null, selNode: null, speed: 1, last: null };
window.SIMCOL = { write: '#2f6fed', ack: '#1a9b5a', read: '#e25a1c', data: '#e25a1c', repl: '#9b4fd0', ctl: '#6b7280', fail: '#d64545', info: '#c9a400', sched: '#0f9d8a', watch: '#8a6fd0', ctrl: '#6b7280', trunc: '#d64545' };
window.sHash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
window.sEsc = esc; window.sShort = short;
window.E = (t, d, from, to, msg, kind, fx, cause) => ({ t, d, from, to, msg, kind, fx: fx || [], cause: cause || '' });
const g$ = id => document.getElementById(id);
L.sim = function (m) {
  SIMM = m;
  simApi = { pause() { if (SIM.play) { SIM.play = false; SIM.last = null; const b = g$('simPlay'); if (b) b.textContent = '▶ Play'; } } };
};
function simParse(text) { return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => { const p = l.split(/\s+/); return { t: Number(p[0]) || 0, op: (p[1] || '').toUpperCase(), args: p.slice(2), raw: l }; }).sort((a, b) => a.t - b.t); }
function simRun() {
  const acts = simParse(g$('simAct').value);
  try { SIM.run = SIMM.run(acts, SIM.n, SIM.set); SIM.run.events.sort((a, b) => a.t - b.t || a.d - b.d); } catch (e) { SIM.run = { events: [], end: 0, err: e.message }; console.error(e); }
  SIM.end = Math.max(1000, (SIM.run.events.reduce((m, e) => Math.max(m, e.t + e.d), 0)) + 600);
  const sl = g$('simT'); sl.max = SIM.end; if (SIM.T > SIM.end) SIM.T = SIM.end;
}
function simStateAt(T) { const s = SIMM.init(SIM.n, SIM.set); for (const e of SIM.run.events) { if (e.t + e.d <= T) e.fx.forEach(f => SIMM.apply(s, f)); } return s; }
function simDraw() {
  const svg = g$('simSvg'); if (!svg || !SIM.run || !SIMM) return;
  const T = SIM.T, topo = SIMM.topo(SIM.n), s0 = simStateAt(T), byId = Object.fromEntries(topo.nodes.map(n => [n.id, n]));
  const W = topo.w || 900, H = topo.h || 430; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const col = k => window.SIMCOL[k] || '#6b7280';
  const active = SIM.run.events.filter(e => e.t <= T && T < e.t + e.d), recent = SIM.run.events.filter(e => e.t + e.d <= T && T - (e.t + e.d) < 450);
  const hot = new Set([...active.flatMap(e => [e.from, e.to]), ...recent.map(e => e.to)]);
  const activeEdge = new Set(active.map(e => [e.from, e.to].sort().join('|')));
  let s = '<defs></defs>';
  (topo.zones || []).forEach(z => { s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="14" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="7 5"/><text x="${z.x + 12}" y="${z.y + 17}" style="fill:var(--mut);font-size:11.5px;font-weight:700">${esc(z.label)}</text>`; });
  topo.edges.forEach(([a, b]) => { const A = byId[a], B = byId[b]; if (!A || !B) return; const on = activeEdge.has([a, b].sort().join('|')); s += `<line x1="${A.x + A.w / 2}" y1="${A.y + A.h / 2}" x2="${B.x + B.w / 2}" y2="${B.y + B.h / 2}" stroke="var(--line)" stroke-width="${on ? 2.5 : 1.2}" opacity="${on ? 1 : .55}"/>`; });
  topo.nodes.forEach(n => {
    const down = ((s0.status && s0.status[n.id]) || 'up') === 'down', isHot = hot.has(n.id), sel = SIM.selNode === n.id, lines = SIMM.lines(n.id, s0) || [];
    const badge = n.badge ? String(typeof n.badge === 'function' ? n.badge(s0) : n.badge) : '';
    s += `<g class="simn" data-id="${esc(n.id)}" style="cursor:pointer;${down ? 'opacity:.55' : ''}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${down ? 'var(--p5)' : n.c || 'var(--card)'}" stroke="${sel ? 'var(--brand,var(--acc))' : isHot ? 'var(--acc2)' : 'var(--line)'}" stroke-width="${sel || isHot ? 3.5 : 1.8}"/><text x="${n.x + 9}" y="${n.y + 17}" font-weight="700" style="font-size:12.5px">${esc(n.label)}${down ? ' ✕' : ''}</text>${badge && (n.label.length * 7.6 + badge.length * 5.8 < n.w) ? `<text x="${n.x + n.w - 8}" y="${n.y + 17}" text-anchor="end" style="font-size:10px;fill:var(--mut)">${esc(badge)}</text>` : ''}${lines.slice(0, Math.floor((n.h - 24) / 13)).map((l, i) => `<text x="${n.x + 9}" y="${n.y + 32 + i * 13}" style="font-size:10.5px;${/^!/.test(l) ? 'fill:var(--bad)' : ''}">${esc(short(String(l).replace(/^!/, ''), Math.floor((n.w - 14) / 6.3)))}</text>`).join('')}</g>`;
  });
  active.forEach(e => {
    const A = byId[e.from], B = byId[e.to]; if (!A || !B) return;
    const f = Math.min(1, (T - e.t) / Math.max(1, e.d)), ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = B.x + B.w / 2, by = B.y + B.h / 2, c = col(e.kind);
    if (e.from === e.to) { s += `<text x="${A.x + A.w / 2}" y="${A.y - 6}" text-anchor="middle" style="font-size:10.5px;fill:${c};font-weight:700;paint-order:stroke;stroke:var(--bg);stroke-width:3px">${esc(short(e.msg, 30))}</text>`; return; }
    const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
    s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${c}" stroke-width="2.5" opacity=".35"/><circle cx="${px}" cy="${py}" r="7" fill="${c}" stroke="#fff" stroke-width="1.5"/><text x="${(ax + bx) / 2}" y="${(ay + by) / 2 - 9}" text-anchor="middle" style="font-size:10.5px;fill:${c};font-weight:700;paint-order:stroke;stroke:var(--bg);stroke-width:4px">${esc(short(e.msg, 28))}</text>`;
  });
  morph(svg, s);
  const pk = active.find(e => e.from !== e.to && byId[e.from] && byId[e.to]);
  if (pk && SIM.play) { const f = Math.min(1, (T - pk.t) / Math.max(1, pk.d)), A = byId[pk.from], B = byId[pk.to]; follow(svg.parentElement, svg, W, (A.x + A.w / 2) + ((B.x + B.w / 2) - (A.x + A.w / 2)) * f); }
  g$('simTv').textContent = (T / 1000).toFixed(2) + ' s / ' + (SIM.end / 1000).toFixed(1) + ' s';
  const sl = g$('simT'); if (+sl.value !== T) sl.value = T;
  const evs = SIM.run.events, lastI = evs.filter(e => e.t <= T).length - 1;
  const logEl = g$('simLog');
  morph(logEl, evs.map((e, i) => `<div class="simev ${i === lastI ? 'cur' : ''} ${e.t > T ? 'fut' : ''}" data-i="${i}"><span class="simtag" style="background:${col(e.kind)}">${esc(e.kind)}</span> <span class="mono">${(e.t / 1000).toFixed(2)}s</span> ${esc(e.from)}${e.from === e.to ? '' : ' → ' + esc(e.to)}: ${esc(e.msg)}</div>`).join('') || '<div class="note">No actions yet.</div>');
  const curEl = logEl.querySelector('.cur');   // scroll only the log box, never the page
  if (curEl && SIM.play) { const top = curEl.offsetTop, h = curEl.offsetHeight; if (top < logEl.scrollTop) logEl.scrollTop = top - 4; else if (top + h > logEl.scrollTop + logEl.clientHeight) logEl.scrollTop = top + h - logEl.clientHeight + 4; }
  const insp = g$('simInsp'), evInfo = e => `<b>${esc(e.msg)}</b><div class="note">${esc(e.from)} → ${esc(e.to)} · ${(e.t / 1000).toFixed(2)}s (+${e.d} ms) · ${esc(e.kind)}</div>${e.cause ? `<div class="caption" style="margin-top:6px"><b>Why:</b> ${esc(e.cause)}</div>` : ''}<div class="note">state changes: ${e.fx.length ? esc(e.fx.map(f => SIMM.fxText ? SIMM.fxText(f) : f.op).join('; ')) : 'none (message only)'}</div>`;
  let html;
  if (SIM.selNode && byId[SIM.selNode]) { const det = SIMM.detail ? SIMM.detail(SIM.selNode, s0) : SIMM.lines(SIM.selNode, s0); html = `<b>${esc(byId[SIM.selNode].label)}</b> at ${(T / 1000).toFixed(2)}s<pre>${esc((det || []).join('\n') || '(empty)')}</pre>`; }
  else if (SIM.sel != null && evs[SIM.sel]) html = evInfo(evs[SIM.sel]);
  else if (lastI >= 0) html = `<div class="note" style="margin:0 0 4px">Latest event. Tap a node or an event in the log to inspect it.</div>` + evInfo(evs[lastI]);
  else html = '<div class="note">Press Play. Tap a node to inspect its data, or an event in the log to see why it happened.</div>';
  morph(insp, html);
}
function simTick(now) {
  if (!SIM.play) { SIM.last = null; return; }
  if (SIM.last == null) SIM.last = now;
  const dt = Math.min(64, now - SIM.last); SIM.last = now;
  if (!false) SIM.T = Math.min(SIM.end, SIM.T + dt * SIM.speed);
  simDraw();
  if (SIM.T >= SIM.end) { SIM.play = false; g$('simPlay').textContent = '↻ Replay'; return; }
  requestAnimationFrame(simTick);
}
function simBuildControls() {
  const m = SIMM, nr = m.nodeRange;
  g$('simScn').innerHTML = m.scenarios.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
  g$('simN').innerHTML = Array.from({ length: nr[1] - nr[0] + 1 }, (_, i) => `<option value="${nr[0] + i}" ${nr[0] + i === nr[2] ? 'selected' : ''}>${nr[0] + i}</option>`).join('');
  g$('simNL').textContent = m.nodeLabel;
  g$('simSet').innerHTML = (m.settings || []).map(s => `<label>${esc(s.label)} <select data-set="${s.id}">${s.opts.map(o => `<option ${o === s.def ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`).join('');
  SIM.set = Object.fromEntries((m.settings || []).map(s => [s.id, s.def]));
  g$('simOp').innerHTML = m.menu.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
  simArgs();
}
function simArgs() { const o = SIMM.menu[+g$('simOp').value]; g$('simArgs').innerHTML = o.args.map((a, i) => `<input type="text" data-a="${i}" value="${esc(a.d)}" placeholder="${esc(a.n)}" aria-label="${esc(a.n)}" style="width:${a.w || 80}px">`).join(''); }
function simLoadScenario(i) { const s = SIMM.scenarios[i]; g$('simAct').value = s.acts.join('\n'); g$('simDesc').textContent = s.desc; SIM.T = 0; SIM.sel = null; SIM.selNode = null; simRun(); simDraw(); }
function simInit() {
  if (!g$('simSvg') || !SIMM) return;
  const pl = () => { g$('simPlay').textContent = '▶ Play'; };
  SIM.n = SIMM.nodeRange[2]; simBuildControls(); simLoadScenario(0);
  g$('simScn').onchange = e => { SIM.play = false; pl(); simLoadScenario(+e.target.value); };
  g$('simN').onchange = e => { SIM.n = +e.target.value; SIM.T = 0; SIM.play = false; pl(); simRun(); simDraw(); };
  g$('simSet').onchange = e => { const t = e.target.closest('[data-set]'); if (t) { SIM.set[t.dataset.set] = t.value; simRun(); simDraw(); } };
  g$('simOp').onchange = simArgs;
  g$('simAdd').onclick = () => { const o = SIMM.menu[+g$('simOp').value], vals = [...document.querySelectorAll('#simArgs input')].map(i => i.value.trim() || '-'); const ta = g$('simAct'), t = Math.round(SIM.run.events.reduce((m, e) => Math.max(m, e.t + e.d), 0) + 300); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + `${t} ${o.op} ${vals.join(' ')}`.trim(); SIM.T = Math.max(0, t - 200); simRun(); simDraw(); };
  g$('simAct').onchange = () => { simRun(); simDraw(); };
  g$('simPlay').onclick = () => {
    if (SIM.play) { SIM.play = false; pl(); return; }
    stopAll(); if (SIM.T >= SIM.end) SIM.T = 0;
    SIM.play = true; SIM.last = null; g$('simPlay').textContent = '⏸ Pause'; requestAnimationFrame(simTick);
  };
  g$('simReset').onclick = () => { SIM.play = false; SIM.T = 0; pl(); simDraw(); };
  g$('simStep').onclick = () => { SIM.play = false; pl(); const nx = SIM.run.events.find(e => e.t + e.d > SIM.T + 1); SIM.T = nx ? nx.t + nx.d : SIM.end; SIM.sel = nx ? SIM.run.events.indexOf(nx) : null; SIM.selNode = null; simDraw(); };
  g$('simSpeed').onchange = e => { SIM.speed = +e.target.value; };
  g$('simT').oninput = e => { SIM.play = false; pl(); SIM.T = +e.target.value; simDraw(); };
  g$('simLog').onclick = e => { const d = e.target.closest('.simev'); if (!d) return; const i = +d.dataset.i; SIM.sel = i; SIM.selNode = null; SIM.play = false; pl(); const ev = SIM.run.events[i]; SIM.T = ev.t + ev.d; simDraw(); };
  g$('simSvg').onclick = e => { const g = e.target.closest('.simn'); if (g) { SIM.selNode = SIM.selNode === g.dataset.id ? null : g.dataset.id; SIM.sel = null; simDraw(); } };
}
window.simInit = simInit;

/* ================= start ================= */
L.start = function (c) {
  L.cfg = c;
  const S = L.story || {};
  const sc = S.chapters || [];
  $('#journey').innerHTML = c.phases.map((p, i) => `<li><a href="#chapter" data-ph="${i}" style="--pc:${pc(i)}"><span class="n">${i + 1}</span><span><b>${(sc[i] && sc[i].ask) || esc(p.t)}</b><small>${esc(p.t)}${p.s ? ' · ' + esc(p.s) : ''}</small></span></a></li>`).join('');
  $('#miles').innerHTML = (S.milestones || []).map(m => `<li><div><b>${m.t}</b><span>${m.test || ''}</span></div></li>`).join('');
  if (!(S.milestones || []).length) $('#build').hidden = true;
  $('#journey').addEventListener('click', e => { const a = e.target.closest('[data-ph]'); if (a) { e.preventDefault(); jumpPhase(+a.dataset.ph); } });
  $('#chTabs').addEventListener('click', e => { const b = e.target.closest('[data-ph]'); if (b) jumpPhase(+b.dataset.ph, false); });
  $('#prev').onclick = () => jumpPhase(Math.max(0, st.cur - 1));
  $('#nextB').onclick = () => jumpPhase(Math.min(c.phases.length - 1, st.cur + 1));
  $('#anim').onclick = playPhase;
  $('#speed').onchange = e => { st.speed = +e.target.value; };
  $('#scrub').addEventListener('input', e => { const wasRunning = st.state === 'playing'; stopAll(); if (wasRunning) st.state = 'idle'; paintView(+e.target.value / 1000); });
  $('#chTrade').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    $('#chTrade').querySelectorAll('.lbtabs button').forEach(x => x.classList.toggle('act', x === b));
    $('#chTrade').querySelectorAll('.tpanel').forEach(p => { p.hidden = p.dataset.p !== b.dataset.t; });
  });
  $('#chPredict').addEventListener('click', e => {
    const b = e.target.closest('.opt'); if (!b) return;
    const box = b.closest('.predict'), pr = (S.chapters || [])[st.cur].predict, i = +b.dataset.i;
    box.classList.add('done');
    box.querySelectorAll('.opt').forEach((o, j) => { o.classList.toggle('right', j === pr.ans); o.classList.toggle('wrong', j === i && i !== pr.ans); });
    const fb = box.querySelector('.fb'); fb.className = 'fb callout ' + (i === pr.ans ? 'good' : 'warn');
    fb.innerHTML = `<b class="t">${i === pr.ans ? 'Right' : 'Not quite'}</b>${pr.why || ''} <span class="mut">Press Play below to watch it happen.</span>`;
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea,button')) return;
    if (e.key === 'ArrowRight' && st.cur < c.phases.length - 1) jumpPhase(st.cur + 1, false);
    if (e.key === 'ArrowLeft' && st.cur > 0) jumpPhase(st.cur - 1, false);
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => vis.set('#' + e.target.id, e.isIntersecting)), { rootMargin: '120px' });
    ['chLab', 'ovView'].forEach(id => { const el = $('#' + id); if (el) io.observe(el); });
  }
  ovInit();
  showPhase(st.cur);
  if (SIMM) simInit();
  const cap = $('#capstone'); if (!SIMM && cap) cap.hidden = true;
};
})();
