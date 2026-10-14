/* Computed quorum animation: write and read one value at chosen consistency levels while replicas go down and come back.
 * The model is pure (Course.quorum) so Node can test it. Ops are replayed from the start, so Back and Restart need no extra logic.
 * The course supplies the replication factor, the value labels and the presets. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LEVELS = ['ONE', 'TWO', 'QUORUM', 'ALL'];
  const need = (cl, rf) => ({ ONE: 1, TWO: 2, QUORUM: Math.floor(rf / 2) + 1, ALL: rf })[cl];

  function fresh(rf) { return { reps: Array.from({ length: rf }, () => ({ up: true, ver: 1 })), latest: 1, issued: 1 }; }
  const snap = m => ({ reps: m.reps.map(r => ({ up: r.up, ver: r.ver })), latest: m.latest });

  /* Apply one op. Returns a frame { snap, now, touched, title, text, tone }. */
  function step(m, op, rf) {
    const f = (title, text, o) => Object.assign({ snap: snap(m), now: [], touched: [], title, text, tone: '' }, o);
    if (op.op === 'down') { m.reps[op.r].up = false; return f(`R${op.r + 1} goes down`, `R${op.r + 1} stops answering. The coordinator will not wait for it, and writes it misses are not applied to it.`, { now: [op.r] }); }
    if (op.op === 'up') { m.reps[op.r].up = true; return f(`R${op.r + 1} comes back`, `R${op.r + 1} answers again with the version it had when it left (v${m.reps[op.r].ver}). Nothing has copied the missed writes to it yet.`, { now: [op.r] }); }
    const live = m.reps.map((r, i) => r.up ? i : -1).filter(i => i >= 0);
    if (op.op === 'write') {
      const n = need(op.cl, rf);
      if (live.length < n) return f(`Write at ${op.cl}: unavailable`, `${op.cl} needs ${n} live replica${n > 1 ? 's' : ''} but only ${live.length} ${live.length === 1 ? 'is' : 'are'} up. The coordinator refuses the write before sending it, so no replica changes.`, { tone: 'bad' });
      m.issued++; live.forEach(i => { m.reps[i].ver = m.issued; });
      m.latest = m.issued;
      const missed = m.reps.map((r, i) => r.up ? -1 : i).filter(i => i >= 0);
      return f(`Write v${m.issued} at ${op.cl}: OK`, `The coordinator sends v${m.issued} to every live replica (${live.map(i => 'R' + (i + 1)).join(', ')}) and waits for ${n} acknowledgement${n > 1 ? 's' : ''}. ${live.length} arrived, so the client gets OK.${missed.length ? ' ' + missed.map(i => 'R' + (i + 1)).join(', ') + ' missed it.' : ''}`, { touched: live, tone: 'ok' });
    }
    if (op.op === 'read') {
      const n = need(op.cl, rf), order = Array.from({ length: rf }, (_, k) => (op.from + k) % rf).filter(i => m.reps[i].up);
      if (order.length < n) return f(`Read at ${op.cl}: unavailable`, `${op.cl} needs ${n} live replica${n > 1 ? 's' : ''} but only ${order.length} ${order.length === 1 ? 'is' : 'are'} up.`, { tone: 'bad' });
      const ask = order.slice(0, n), top = Math.max(...ask.map(i => m.reps[i].ver)), stale = top < m.latest;
      let text = `The coordinator asks ${ask.map(i => 'R' + (i + 1)).join(' and ')}, starting from R${op.from + 1}, the closest. ${ask.map(i => `R${i + 1} has v${m.reps[i].ver}`).join(', ')}. The newest answer wins: v${top}.`;
      if (n > 1 && ask.some(i => m.reps[i].ver < top)) { ask.forEach(i => { m.reps[i].ver = top; }); text += ' The digests disagree, so read repair copies v' + top + ' to the stale replica it asked.'; }
      text += stale ? ` But the newest acknowledged write is v${m.latest}: this read is STALE.` : ' This is the newest acknowledged write.';
      return f(`Read at ${op.cl}: v${top}${stale ? ' (stale)' : ''}`, text, { touched: ask, tone: stale ? 'bad' : 'ok', result: top });
    }
    if (op.op === 'repair') {
      const top = Math.max(...live.map(i => m.reps[i].ver)); live.forEach(i => { m.reps[i].ver = top; });
      return f('Repair', `Repair compares the live replicas and streams the newest version to the ones behind. All live replicas now hold v${top}.`, { touched: live, tone: 'ok' });
    }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(rf, ops) {
    const m = fresh(rf), frames = [{ snap: snap(m), now: [], touched: [], title: 'Three replicas of one value', text: `All ${rf} replicas hold v1 and it was acknowledged. A quorum is ${need('QUORUM', rf)} of ${rf}. Use the buttons to bring replicas down, write and read at different levels.`, tone: '' }], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); frames.push(step(m, op, rf)); });
    return { frames, opStart };
  }

  function draw(fr, scene) {
    const rf = scene.rf;
    return `<div class="qm-reps">${fr.snap.reps.map((r, i) => `<div class="qm-rep${r.up ? '' : ' down'}${fr.now.includes(i) ? ' now' : ''}${fr.touched.includes(i) ? ' touched ' + fr.tone : ''}"><b>R${i + 1}</b><span>${r.up ? 'up' : 'DOWN'}</span><strong>${esc(scene.field)} = ${esc(scene.values[Math.min(r.ver - 1, scene.values.length - 1)])}</strong><small>v${r.ver}${r.ver < fr.snap.latest ? ' · behind' : ''}</small></div>`).join('')}</div>
      <div class="qm-latest">Newest acknowledged write: <b>v${fr.snap.latest}</b> (${esc(scene.values[Math.min(fr.snap.latest - 1, scene.values.length - 1)])}) · quorum = ${need('QUORUM', rf)} of ${rf}</div>`;
  }

  function mount(host, scene) {
    const rf = scene.rf, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    const opts = sel => LEVELS.map(l => `<option${l === sel ? ' selected' : ''}>${l}</option>`).join('');
    host.innerHTML = `<div class="rs qm">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><span>Replica</span>${Array.from({ length: rf }, (_, i) => `<button type="button" data-down="${i}">R${i + 1} down</button><button type="button" data-up="${i}">R${i + 1} up</button>`).join('')}</div>
        <div class="bt-try"><label>Write at <select data-wcl>${opts('QUORUM')}</select></label><button type="button" data-do="write">Write</button>
          <label>Read at <select data-rcl>${opts('QUORUM')}</select></label><label>closest <select data-from>${Array.from({ length: rf }, (_, i) => `<option value="${i}">R${i + 1}</option>`).join('')}</select></label><button type="button" data-do="read">Read</button><button type="button" data-do="repair">Repair</button></div>
      </div>
      <div class="qm-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute(jump) { run = runAll(rf, S.ops); S.k = jump == null ? 0 : jump; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1;
      $('[data-stage]').innerHTML = draw(fr, scene);
      $('[data-stat]').textContent = fr.title;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(rf, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      if (b.dataset.down != null) return add({ op: 'down', r: +b.dataset.down });
      if (b.dataset.up != null) return add({ op: 'up', r: +b.dataset.up });
      if (b.dataset.do === 'write') return add({ op: 'write', cl: $('[data-wcl]').value });
      if (b.dataset.do === 'read') return add({ op: 'read', cl: $('[data-rcl]').value, from: +$('[data-from]').value });
      if (b.dataset.do === 'repair') return add({ op: 'repair' });
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [], okOp = o => ['down', 'up', 'write', 'read', 'repair'].includes(o.op) && (o.op !== 'write' && o.op !== 'read' || LEVELS.includes(o.cl));
    if (!Number.isInteger(scene.rf) || scene.rf < 3 || scene.rf > 5) e.push('animation quorum needs rf from 3 to 5');
    if (!scene.field || !Array.isArray(scene.values) || scene.values.length < 3) e.push('animation quorum needs field and at least 3 values');
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation quorum needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation quorum preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.quorum = { LEVELS, need, fresh, step, runAll };
  root.Course.registerAnimation('quorum', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
