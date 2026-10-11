/* Computed consumer-group animation: members join and leave, the group coordinator starts a rebalance, and the partitions are
 * assigned again. Compare the eager protocol (everyone stops, ranges are recomputed) with the cooperative sticky protocol
 * (only the partitions that must move are stopped). The model is pure (Course.kgroup) so Node can test it. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Range assignor: members sorted by name, each gets a contiguous block, the first (P mod M) members get one extra. */
  function assignRange(members, P) {
    const out = Array(P).fill(null), ms = members.slice().sort(), M = ms.length; if (!M) return out;
    const per = Math.floor(P / M), extra = P % M; let p = 0;
    ms.forEach((m, i) => { const n = per + (i < extra ? 1 : 0); for (let k = 0; k < n; k++) out[p++] = m; });
    return out;
  }
  /* Sticky assignor: keep as much of the previous assignment as the balance allows, then hand out the rest. */
  function assignSticky(prev, members, P) {
    const out = Array(P).fill(null), ms = members.slice().sort(), M = ms.length; if (!M) return out;
    const per = Math.floor(P / M), extra = P % M, count = {}, own = {}; ms.forEach(m => { count[m] = 0; own[m] = []; });
    prev.forEach((m, p) => { if (m && own[m]) own[m].push(p); });
    const order = ms.slice().sort((a, b) => own[b].length - own[a].length || (a < b ? -1 : 1)), target = {};
    order.forEach((m, i) => { target[m] = per + (i < extra ? 1 : 0); });
    ms.forEach(m => own[m].slice(0, target[m]).forEach(p => { out[p] = m; count[m]++; }));
    out.forEach((o, p) => { if (!o) { const m = ms.find(x => count[x] < target[x]); out[p] = m; count[m]++; } });
    return out;
  }

  const fresh = (P, start) => ({ P, mode: 'eager', members: start.slice().sort(), assign: assignRange(start, P), gen: 1 });
  const snap = (m, paused) => ({ P: m.P, mode: m.mode, members: m.members.slice(), assign: m.assign.slice(), gen: m.gen, paused: paused || [] });

  function rebalance(m, why, gone) {
    const f = (title, text, paused, tone) => ({ snap: snap(m, paused), title, text, tone: tone || '' });
    const before = m.assign.map(o => o && m.members.includes(o) ? o : null);
    m.gen++;
    const next = m.mode === 'eager' ? assignRange(m.members, m.P) : assignSticky(before, m.members, m.P);
    const moved = next.map((o, p) => o !== m.assign[p] ? p : -1).filter(p => p >= 0);
    const orphan = m.assign.map((o, p) => !o || !m.members.includes(o) ? p : -1).filter(p => p >= 0);
    const pausedSet = m.mode === 'eager' ? m.assign.map((_, p) => p) : [...new Set(moved.concat(orphan))];
    const out = [f(why, `The group coordinator sees a membership change and starts a rebalance: the generation becomes ${m.gen}. Every member must rejoin the group.`, orphan)];
    const stale = m.assign.slice(); m.assign = m.assign.map((o, p) => pausedSet.includes(p) ? null : o);
    out.push(f(m.mode === 'eager' ? 'Eager: every consumer stops' : 'Cooperative: only moving partitions stop', m.mode === 'eager' ? `The eager protocol revokes ALL partitions from ALL members before anything is assigned. All ${m.P} partitions stop being consumed until the new assignment arrives, even the ones that will end up with the same consumer.` : `The cooperative sticky protocol keeps every partition that does not need to move running. Only ${pausedSet.length} of ${m.P} partitions are revoked from their owner and reassigned.`, pausedSet, pausedSet.length === m.P ? 'bad' : 'ok'));
    m.assign = next;
    out.push(f('New assignment', `${m.mode === 'eager' ? 'The range assignor recomputes contiguous blocks from scratch.' : 'The sticky assignor keeps previous owners where the balance allows and hands out the rest.'} ${moved.length} of ${m.P} partitions have a different owner than before. ${pausedSet.length} stopped during the rebalance.${m.members.length > m.P ? ` There are more members than partitions, so ${m.members.length - m.P} member${m.members.length - m.P > 1 ? 's' : ''} sit idle: a partition is read by at most one member of a group.` : ''}`, [], 'ok'));
    return out;
  }

  function step(m, op) {
    if (op.op === 'mode') { m.mode = op.mode; return [{ snap: snap(m), title: op.mode === 'eager' ? 'Protocol: eager (range assignor)' : 'Protocol: cooperative sticky', text: op.mode === 'eager' ? 'Every rebalance stops all members and recomputes ranges.' : 'A rebalance moves only the partitions that have to move; the rest keep being consumed.', tone: '' }]; }
    if (op.op === 'join') { if (m.members.includes(op.c)) return [{ snap: snap(m), title: `${op.c} is already a member`, text: 'Nothing changes.', tone: 'bad' }]; m.members = m.members.concat(op.c).sort(); return rebalance(m, `Consumer ${op.c} joins`); }
    if (op.op === 'leave') { if (!m.members.includes(op.c)) return [{ snap: snap(m), title: `${op.c} is not a member`, text: 'Nothing changes.', tone: 'bad' }]; m.members = m.members.filter(x => x !== op.c); return rebalance(m, `Consumer ${op.c} ${op.crash ? 'stops sending heartbeats' : 'leaves'}`); }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(P, start, ops) {
    const m = fresh(P, start), frames = [{ snap: snap(m), title: `${start.length} consumers share ${P} partitions`, text: `Within one group each partition is read by exactly one member. The group coordinator, one broker, tracks the members. Join or remove a consumer, and compare the two rebalance protocols.`, tone: '' }], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); step(m, op).forEach(f => frames.push(f)); });
    return { frames, opStart, model: m };
  }

  function draw(fr, scene) {
    const s = fr.snap, owner = {};
    s.members.forEach(c => { owner[c] = []; });
    const free = [];
    s.assign.forEach((o, p) => { if (o && owner[o]) owner[o].push(p); else free.push(p); });
    const chip = p => `<span class="kg-p${fr.snap.paused.includes(p) ? ' paused' : ''}">p${p}</span>`;
    const cols = s.members.map(c => `<div class="kg-c${owner[c].length ? '' : ' idle'}"><b>${esc(c)}</b><div>${owner[c].length ? owner[c].map(chip).join('') : '<i>idle</i>'}</div></div>`).join('');
    return `<div class="kg-head"><span>generation <b>${s.gen}</b></span><span>protocol <b>${s.mode === 'eager' ? 'eager, range' : 'cooperative, sticky'}</b></span><span>partitions stopped now <b>${s.paused.length}</b> of ${s.P}</span></div>
      <div class="kg-cols">${cols}${free.length ? `<div class="kg-c free"><b>unassigned</b><div>${free.map(chip).join('')}</div></div>` : ''}</div>
      <div class="rf-key">A striped partition is not being consumed right now.</div>`;
  }

  function mount(host, scene) {
    const S = { preset: 0, ops: scene.presets[0].ops.slice(), start: scene.presets[0].start || scene.start, k: 0 };
    let run;
    host.innerHTML = `<div class="rs kg">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><label>Consumer <select data-c>${scene.consumers.map(c => `<option>${esc(c)}</option>`).join('')}</select></label><button type="button" data-do="join">Join</button><button type="button" data-do="leave">Leave</button><button type="button" data-do="crash">Miss the session timeout</button><button type="button" data-do="eager">Eager protocol</button><button type="button" data-do="coop">Cooperative protocol</button></div>
      </div>
      <div class="kg-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(scene.partitions, S.start, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1;
      $('[data-stage]').innerHTML = draw(fr, scene);
      $('[data-stat]').textContent = `members ${fr.snap.members.join(', ') || 'none'} · partitions ${fr.snap.P} · stopped now ${fr.snap.paused.length}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(scene.partitions, S.start, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; const p = scene.presets[S.preset]; S.ops = p.ops.slice(); S.start = p.start || scene.start; recompute(); return; }
      const c = $('[data-c]').value;
      if (b.dataset.do === 'join') return add({ op: 'join', c });
      if (b.dataset.do === 'leave') return add({ op: 'leave', c });
      if (b.dataset.do === 'crash') return add({ op: 'leave', c, crash: true });
      if (b.dataset.do === 'eager') return add({ op: 'mode', mode: 'eager' });
      if (b.dataset.do === 'coop') return add({ op: 'mode', mode: 'cooperative' });
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [];
    if (!Number.isInteger(scene.partitions) || scene.partitions < 3 || scene.partitions > 12) e.push('animation kgroup needs partitions from 3 to 12');
    if (!Array.isArray(scene.consumers) || scene.consumers.length < 3) e.push('animation kgroup needs at least 3 consumer names');
    const ok = list => Array.isArray(list) && list.length >= 1 && list.every(c => (scene.consumers || []).includes(c));
    if (!ok(scene.start)) e.push('animation kgroup needs start, a list of consumer names');
    const okOp = o => o.op === 'mode' ? o.mode === 'eager' || o.mode === 'cooperative' : (o.op === 'join' || o.op === 'leave') && (scene.consumers || []).includes(o.c);
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation kgroup needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp) || (p.start && !ok(p.start))) e.push('animation kgroup preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.kgroup = { assignRange, assignSticky, runAll, step };
  root.Course.registerAnimation('kgroup', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
