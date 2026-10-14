/* Computed replication animation: one partition with a leader and followers, the in-sync replica set (ISR), the high watermark,
 * acks=1 against acks=all, a follower that falls behind, a leader crash, and an unclean election. The model is pure
 * (Course.isr) so Node can test it. The course supplies the replica count, min.insync.replicas and the presets. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = i => 'B' + i;

  function fresh(rf, minIsr) { return { rf, minIsr, br: Array.from({ length: rf }, () => ({ up: true, log: [] })), leader: 0, isr: Array.from({ length: rf }, (_, i) => i), epoch: 0, next: 1, acked: [], pending: [], hw: 0, offline: false }; }
  const snap = m => ({ rf: m.rf, minIsr: m.minIsr, br: m.br.map(b => ({ up: b.up, log: b.log.slice() })), leader: m.offline ? null : m.leader, isr: m.isr.slice(), epoch: m.epoch, acked: m.acked.slice(), pending: m.pending.slice(), hw: m.hw, offline: m.offline });
  const lost = m => m.offline ? [] : m.acked.filter(id => !m.br[m.leader].log.includes(id));

  /* high watermark = how many records every ISR member holds; records below it are committed and may be acknowledged to acks=all producers */
  function advance(m) {
    if (m.offline) return [];
    const live = m.isr; m.hw = live.length ? Math.min(...live.map(i => m.br[i].log.length)) : 0;
    if (live.length < m.minIsr) { m.failedAfter = m.pending.slice(); m.pending = []; return []; }
    const done = m.pending.filter(id => m.br[m.leader].log.indexOf(id) < m.hw);
    done.forEach(id => { m.acked.push(id); }); m.pending = m.pending.filter(id => !done.includes(id));
    return done;
  }
  const settleHw = m => { const live = m.isr; m.hw = live.length ? Math.min(...live.map(i => m.br[i].log.length)) : 0; };
  function truncateTo(m, i) { const lead = m.br[m.leader].log, own = m.br[i].log; let k = 0; while (k < own.length && k < lead.length && own[k] === lead[k]) k++; const cut = own.length - k; m.br[i].log = own.slice(0, k); return cut; }

  function step(m, op) {
    const f = (title, text, o) => Object.assign({ snap: snap(m), now: [], title, text, tone: '' }, o);
    const L = () => m.br[m.leader];
    if (op.op === 'produce') {
      if (m.offline) return f('Partition offline', 'There is no leader, so the producer gets an error and cannot write.', { tone: 'bad' });
      if (op.acks === 'all' && m.isr.length < m.minIsr) return f('Rejected: not enough in-sync replicas', `acks=all needs at least min.insync.replicas = ${m.minIsr} in-sync replicas but the ISR has ${m.isr.length}. The leader refuses the write before appending it (NOT_ENOUGH_REPLICAS). Nothing is lost and nothing is written.`, { tone: 'bad' });
      const id = m.next++; L().log.push(id);
      if (op.acks === 1) { m.acked.push(id); return f(`Record ${id} written with acks=1`, `The leader appends record ${id} to its own log and acknowledges at once, before any follower has it. If the leader dies now, this acknowledged record exists only on the dead broker.`, { now: [m.leader], tone: 'bad' }); }
      m.pending.push(id); const done = advance(m);
      return f(`Record ${id} written with acks=all`, `The leader appends record ${id} and waits. The producer is acknowledged only when every broker in the ISR (${m.isr.map(B).join(', ')}) has it, which moves the high watermark past it.${done.length ? ` ISR is just the leader, so it is acknowledged now.` : ''}`, { now: [m.leader], tone: done.length ? 'ok' : '' });
    }
    if (op.op === 'fetch') {
      const i = op.f; if (m.offline || !m.br[i].up || i === m.leader) return f(`${B(i)} cannot fetch`, `${B(i)} is not a running follower.`, { tone: 'bad' });
      const lead = L().log; m.br[i].log = lead.slice();
      const rejoin = !m.isr.includes(i); if (rejoin) m.isr.push(i), m.isr.sort();
      const done = advance(m);
      return f(`${B(i)} fetches and catches up`, `${B(i)} asks the leader for records after its log end and appends them: it now holds ${lead.length} record${lead.length === 1 ? '' : 's'}.${rejoin ? ` It has caught up, so it rejoins the ISR.` : ''} The high watermark is ${m.hw}.${done.length ? ` Record${done.length > 1 ? 's' : ''} ${done.join(', ')} ${done.length > 1 ? 'are' : 'is'} now on every ISR member and acknowledged to the producer.` : ''}`, { now: [i], tone: done.length ? 'ok' : '' });
    }
    if (op.op === 'shrink') {
      const i = op.f; if (m.offline || i === m.leader || !m.isr.includes(i)) return f('Nothing to remove', `${B(i)} is not an in-sync follower.`, { tone: 'bad' });
      m.isr = m.isr.filter(x => x !== i); m.failedAfter = []; const done = advance(m);
      return f(`${B(i)} leaves the ISR`, `${B(i)} has not caught up with the leader for replica.lag.time.max.ms (30 s by default), so the leader removes it from the ISR. The high watermark no longer waits for it.${done.length ? ` Record${done.length > 1 ? 's' : ''} ${done.join(', ')} can now be acknowledged.` : ''} ${m.failedAfter && m.failedAfter.length ? ` The ISR is now below min.insync.replicas, so record${m.failedAfter.length > 1 ? 's' : ''} ${m.failedAfter.join(', ')} waiting for acks=all fail with NOT_ENOUGH_REPLICAS_AFTER_APPEND instead of being acknowledged.` : ''} The partition is under-replicated: ISR ${m.isr.length} of ${m.rf}.`, { now: [i], tone: 'bad' });
    }
    if (op.op === 'crash') {
      const i = op.id; m.br[i].up = false; if (i !== m.leader || m.offline) return f(`${B(i)} crashes`, `${B(i)} stops. It was a follower, so the leader keeps serving. But ${B(i)} stays in the ISR until it has been silent for replica.lag.time.max.ms, and until then the high watermark and acks=all wait for it.`, { now: [i], tone: 'bad' });
      m.epoch++;
      const cand = m.isr.filter(x => m.br[x].up && x !== i);
      if (!cand.length) { m.offline = true; m.pending = []; return f(`${B(i)} (leader) crashes: partition offline`, `The leader is down and no other ISR member is running. A new leader may only come from the ISR, because only ISR members are guaranteed to hold every committed record. The partition is offline for reads and writes until an ISR member returns, or an unclean election is allowed.`, { now: [i], tone: 'bad' }); }
      m.leader = cand[0]; m.isr = m.isr.filter(x => x !== i); m.pending = [];
      m.br.forEach((b, j) => { if (j !== m.leader) truncateTo(m, j); });
      settleHw(m);
      const gone = lost(m);
      return f(`${B(i)} (leader) crashes: ${B(m.leader)} takes over`, `The controller picks ${B(m.leader)}, the first running ISR member, as the new leader and bumps the leader epoch to ${m.epoch}. Records that only the dead leader held are gone from the log.${gone.length ? ` Record${gone.length > 1 ? 's' : ''} ${gone.join(', ')} ${gone.length > 1 ? 'were' : 'was'} ACKNOWLEDGED to the producer but ${gone.length > 1 ? 'are' : 'is'} now LOST.` : ' Every acknowledged record is still present.'}`, { now: [m.leader], tone: gone.length ? 'bad' : 'ok' });
    }
    if (op.op === 'unclean') {
      const i = op.id; if (!m.offline || !m.br[i].up) return f('Not needed', 'An unclean election only applies to an offline partition with a running replica.', { tone: 'bad' });
      m.offline = false; m.leader = i; m.epoch++; m.isr = [i]; m.pending = [];
      m.br.forEach((b, j) => { if (j !== i) truncateTo(m, j); });
      settleHw(m);
      const gone = lost(m);
      return f(`Unclean election: ${B(i)} leads`, `With unclean.leader.election.enable the controller makes ${B(i)}, which was NOT in the ISR, the leader so the partition comes back. It may be missing committed records.${gone.length ? ` Record${gone.length > 1 ? 's' : ''} ${gone.join(', ')} ${gone.length > 1 ? 'were' : 'was'} acknowledged but ${gone.length > 1 ? 'are' : 'is'} lost.` : ''}`, { now: [i], tone: 'bad' });
    }
    if (op.op === 'restart') {
      const i = op.id; m.br[i].up = true;
      if (!m.offline && m.leader != null) { const cut = truncateTo(m, i); return f(`${B(i)} restarts`, `${B(i)} comes back as a follower. It first truncates records the new leader does not have${cut ? ` (${cut} removed)` : ''}, then fetches from the leader. It is not in the ISR until it has caught up.`, { now: [i], tone: 'ok' }); }
      if (m.offline && m.isr.includes(i)) { m.offline = false; m.leader = i; m.epoch++; m.pending = []; m.br.forEach((b, j) => { if (j !== i) truncateTo(m, j); }); settleHw(m); return f(`${B(i)} restarts and leads`, `${B(i)} was in the ISR, so it holds every committed record and becomes leader again. Nothing was lost.`, { now: [i], tone: 'ok' }); }
      return f(`${B(i)} restarts`, `${B(i)} is running again.`, { now: [i], tone: 'ok' });
    }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(rf, minIsr, ops) {
    const m = fresh(rf, minIsr), frames = [{ snap: snap(m), now: [], title: `One partition, ${rf} replicas`, text: `B0 is the leader. Producers write to the leader only, and followers copy from it. The ISR is the set of replicas that are up to date, and min.insync.replicas is ${minIsr}. Pick a scenario, or use the buttons.`, tone: '' }], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); frames.push(step(m, op)); });
    return { frames, opStart, model: m, lost: lost(m) };
  }

  function draw(fr) {
    const s = fr.snap, gone = s.offline ? [] : s.acked.filter(id => !s.br[s.leader].log.includes(id));
    const cards = s.br.map((b, i) => `<div class="isr-br${b.up ? '' : ' down'}${s.leader === i ? ' lead' : ''}${fr.now.includes(i) ? ' now' : ''}"><b>${B(i)}</b><em>${!b.up ? 'DOWN' : s.leader === i ? 'leader' : 'follower'}</em><small>${s.isr.includes(i) ? 'in ISR' : 'out of ISR'}</small><div class="isr-log">${b.log.length ? b.log.map((id, k) => `<span class="${k < s.hw ? 'c' : ''}${s.acked.includes(id) ? ' a' : ''}" title="record ${id}">${id}</span>`).join('') : '<i>empty</i>'}</div></div>`).join('');
    return `<div class="isr-row">${cards}</div>
      <div class="isr-meta"><span>high watermark: <b>${s.hw}</b></span><span>leader epoch: <b>${s.epoch}</b></span><span>acknowledged: <b>${s.acked.length ? s.acked.join(', ') : 'none'}</b></span>${s.pending.length ? `<span>waiting for acks=all: <b>${s.pending.join(', ')}</b></span>` : ''}${gone.length ? `<span class="isr-lost">LOST: ${gone.join(', ')}</span>` : ''}</div>
      <div class="rf-key">A box is a record id in a broker's log. Solid = below the high watermark (committed). A bold border = acknowledged to the producer. Consumers read only up to the high watermark.</div>`;
  }

  function mount(host, scene) {
    const rf = scene.rf, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    const opt = (n, skip) => Array.from({ length: n }, (_, i) => i === skip ? '' : `<option value="${i}">${B(i)}</option>`).join('');
    host.innerHTML = `<div class="rs isr">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><button type="button" data-do="all">Produce, acks=all</button><button type="button" data-do="one">Produce, acks=1</button><label>Broker <select data-b>${opt(rf)}</select></label><button type="button" data-do="fetch">Fetch</button><button type="button" data-do="shrink">Falls out of ISR</button><button type="button" data-do="crash">Crash</button><button type="button" data-do="restart">Restart</button><button type="button" data-do="unclean">Unclean election</button></div>
      </div>
      <div class="isr-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(rf, scene.minIsr, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, s = fr.snap;
      $('[data-stage]').innerHTML = draw(fr);
      $('[data-stat]').textContent = `ISR ${s.isr.length} of ${s.rf} · min.insync.replicas ${s.minIsr} · ${s.offline ? 'partition OFFLINE' : 'leader ' + B(s.leader)}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(rf, scene.minIsr, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      const i = +$('[data-b]').value;
      if (b.dataset.do === 'all') return add({ op: 'produce', acks: 'all' });
      if (b.dataset.do === 'one') return add({ op: 'produce', acks: 1 });
      if (b.dataset.do === 'fetch') return add({ op: 'fetch', f: i });
      if (b.dataset.do === 'shrink') return add({ op: 'shrink', f: i });
      if (b.dataset.do === 'crash') return add({ op: 'crash', id: i });
      if (b.dataset.do === 'restart') return add({ op: 'restart', id: i });
      if (b.dataset.do === 'unclean') return add({ op: 'unclean', id: i });
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [], rf = scene.rf;
    if (!Number.isInteger(rf) || rf < 3 || rf > 5) e.push('animation isr needs rf from 3 to 5');
    if (!Number.isInteger(scene.minIsr) || scene.minIsr < 1 || scene.minIsr > rf) e.push('animation isr needs minIsr from 1 to rf');
    const idx = n => Number.isInteger(n) && n >= 0 && n < rf;
    const okOp = o => o.op === 'produce' ? o.acks === 1 || o.acks === 'all' : o.op === 'fetch' || o.op === 'shrink' ? idx(o.f) : ['crash', 'restart', 'unclean'].includes(o.op) && idx(o.id);
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation isr needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation isr preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.isr = { fresh, step, runAll, lost };
  root.Course.registerAnimation('isr', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
