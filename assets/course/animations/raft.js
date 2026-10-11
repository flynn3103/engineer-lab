/* Computed Raft animation: leader election, log replication, majority commit, partitions and crashes on a small cluster.
 * The model is pure (Course.raft) so Node can test it. Each op plays one synchronous round and yields one or two frames, so
 * Back and Restart need no extra logic. Simplified: no timers, no pre-vote, followers copy the leader log when it reaches them. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = k => 'N' + (k + 1);

  function fresh(n) { return { n, nodes: Array.from({ length: n }, () => ({ up: true, role: 'F', term: 0, voted: null, log: [], commit: 0 })), group: Array(n).fill(0), leaders: {} }; }
  const clone = m => ({ nodes: m.nodes.map(x => ({ up: x.up, role: x.role, term: x.term, voted: x.voted, log: x.log.map(e => [e[0], e[1]]), commit: x.commit })), group: m.group.slice() });
  const majority = n => Math.floor(n / 2) + 1;
  const reach = (m, a) => m.nodes.map((x, i) => i !== a && x.up && m.group[i] === m.group[a] ? i : -1).filter(i => i >= 0);
  const lastTerm = x => x.log.length ? x.log[x.log.length - 1][0] : 0;

  /* Leader a pushes its log to every node it can reach. Returns { acks, stale } where stale means a reachable node has a higher term. */
  function replicate(m, a) {
    const L = m.nodes[a], to = reach(m, a), higher = to.find(i => m.nodes[i].term > L.term);
    if (higher != null) { L.role = 'F'; L.term = m.nodes[higher].term; L.voted = null; return { acks: 0, stale: higher }; }
    let acks = 1;
    to.forEach(i => { const x = m.nodes[i]; x.term = L.term; x.role = 'F'; x.voted = null; x.log = L.log.map(e => [e[0], e[1]]); acks++; });
    if (acks >= majority(m.n)) { L.commit = L.log.length; to.forEach(i => { m.nodes[i].commit = L.log.length; }); }
    return { acks, stale: null };
  }

  /* Apply one op. Returns an array of frames { snap, now, title, text, tone }. */
  function step(m, op) {
    const frame = (title, text, now, tone) => ({ snap: clone(m), now: now || [], title, text, tone: tone || '' });
    const n = m.n;
    if (op.op === 'timeout') {
      const c = op.n, X = m.nodes[c];
      if (!X.up) return [frame(`${N(c)} is down`, `${N(c)} is not running, so its election timer cannot fire.`, [c], 'bad')];
      X.term++; X.role = 'C'; X.voted = c;
      const log = [], peers = reach(m, c); let votes = 1;
      peers.forEach(i => {
        const y = m.nodes[i];
        if (y.term < X.term) { y.term = X.term; y.role = 'F'; y.voted = null; }
        const upToDate = lastTerm(X) > lastTerm(y) || (lastTerm(X) === lastTerm(y) && X.log.length >= y.log.length);
        if (y.term === X.term && (y.voted == null || y.voted === c) && upToDate) { y.voted = c; votes++; log.push(`${N(i)} votes yes`); }
        else log.push(`${N(i)} votes no (${!upToDate ? 'its log is more complete' : 'it already voted this term'})`);
      });
      const unreachable = m.nodes.map((x, i) => i !== c && !peers.includes(i) ? N(i) : null).filter(Boolean);
      const f1 = frame(`${N(c)} asks for votes in term ${X.term}`, `${N(c)} timed out, became a candidate, raised its term to ${X.term} and voted for itself. ${log.join('. ')}${log.length ? '.' : ''}${unreachable.length ? ' It cannot reach ' + unreachable.join(', ') + '.' : ''} It has ${votes} of ${n} votes and needs ${majority(n)}.`, [c, ...peers]);
      if (votes < majority(n)) { return [f1, frame('No majority', `${N(c)} stays a candidate in term ${X.term}. It cannot become leader without ${majority(n)} votes, so nothing can be committed through it.`, [c], 'bad')]; }
      X.role = 'L'; m.leaders[X.term] = (m.leaders[X.term] || []).concat(c);
      X.log.push([X.term, 'no-op']);
      const r = replicate(m, c);
      return [f1, frame(`${N(c)} is leader of term ${X.term}`, `A majority voted for ${N(c)}. A new leader first appends a no-op entry of its own term and replicates it. ${r.acks >= majority(n) ? `${r.acks} of ${n} nodes stored it, so it is committed, and every earlier entry is committed with it.` : `Only ${r.acks} nodes stored it, so nothing new is committed yet.`}`, [c], 'ok')];
    }
    if (op.op === 'client') {
      const ls = m.nodes.map((x, i) => x.up && x.role === 'L' ? i : -1).filter(i => i >= 0);
      const a = op.to != null ? op.to : ls.sort((p, q) => m.nodes[q].term - m.nodes[p].term)[0];
      if (a == null || !m.nodes[a].up || m.nodes[a].role !== 'L') return [frame('No leader', `No running node is a leader, so the command "${op.cmd}" is rejected. A node has to win an election first.`, [], 'bad')];
      const L = m.nodes[a]; L.log.push([L.term, op.cmd]);
      const f1 = frame(`${N(a)} appends "${op.cmd}"`, `Only the leader accepts commands. ${N(a)} appends "${op.cmd}" to its own log as entry ${L.log.length}, term ${L.term}. It is not committed yet.`, [a]);
      const r = replicate(m, a);
      if (r.stale != null) return [f1, frame('Leader is stale', `${N(a)} learns that ${N(r.stale)} is in term ${m.nodes[r.stale].term}, newer than its own. It steps down. Its new entry is not committed.`, [a, r.stale], 'bad')];
      const ok = r.acks >= majority(n);
      return [f1, frame(ok ? `"${op.cmd}" is committed` : `"${op.cmd}" is NOT committed`, ok ? `${r.acks} of ${n} nodes stored entry ${L.log.length}, which is a majority (${majority(n)}). The leader marks it committed, applies it, and tells the followers.` : `Only ${r.acks} of ${n} nodes stored it, and a majority is ${majority(n)}. The entry stays uncommitted: it may be thrown away if a new leader is elected without it.`, [a, ...reach(m, a)], ok ? 'ok' : 'bad')];
    }
    if (op.op === 'partition') {
      m.group = Array(n).fill(0); op.sides[1].forEach(i => { m.group[i] = 1; });
      return [frame('The network splits', `Nodes ${op.sides[0].map(N).join(', ')} can talk to each other, and so can ${op.sides[1].map(N).join(', ')}, but not across. Only a side with ${majority(n)} or more nodes can elect a leader or commit.`, [])];
    }
    if (op.op === 'heal') {
      m.group = Array(n).fill(0);
      const ups = m.nodes.map((x, i) => x.up ? i : -1).filter(i => i >= 0), T = Math.max(...ups.map(i => m.nodes[i].term));
      const dropped = [];
      ups.forEach(i => { const x = m.nodes[i]; if (x.term < T) { if (x.role === 'L') dropped.push(`${N(i)} (leader of term ${x.term}) steps down`); x.term = T; x.role = 'F'; x.voted = null; } });
      const lead = ups.find(i => m.nodes[i].role === 'L' && m.nodes[i].term === T);
      if (lead == null) return [frame('The network heals, no leader', `All nodes can talk again. The highest term is ${T}, and its owner is not a leader, so every node adopts term ${T} and steps down. A new election is needed.`, ups, 'bad')];
      const r = replicate(m, lead);
      return [frame('The network heals', `${dropped.length ? dropped.join('. ') + '. ' : ''}${N(lead)}, leader of term ${T}, replicates its log to everyone. Entries that only a stale leader held, and never committed, are overwritten. ${r.acks >= majority(n) ? 'All logs now match and the whole log is committed.' : ''}`, [lead, ...ups], 'ok')];
    }
    if (op.op === 'crash') { m.nodes[op.n].up = false; return [frame(`${N(op.n)} crashes`, `${N(op.n)} stops. Its term and log are on disk, so they survive. ${m.nodes[op.n].role === 'L' ? 'It was the leader: followers will notice the missing heartbeats and one will time out.' : ''}`, [op.n], 'bad')]; }
    if (op.op === 'restart') { const x = m.nodes[op.n]; x.up = true; x.role = 'F'; x.voted = null; return [frame(`${N(op.n)} restarts`, `${N(op.n)} comes back as a follower with the term and log it saved. The leader will bring its log up to date at the next replication.`, [op.n], 'ok')]; }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(n, ops) {
    const m = fresh(n), frames = [{ snap: clone(m), now: [], title: `A cluster of ${n} nodes`, text: `Every node is a follower in term 0 with an empty log. A majority is ${majority(n)} of ${n}. Pick a scenario, or start an election yourself with a Timeout button.`, tone: '' }], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); step(m, op).forEach(f => frames.push(f)); });
    return { frames, opStart, model: m };
  }

  function draw(fr, scene) {
    const nodes = fr.snap.nodes, groups = [...new Set(fr.snap.group)];
    const card = (x, i) => `<div class="rf-node ${x.up ? x.role : 'X'}${fr.now.includes(i) ? ' now' : ''}"><b>${N(i)}</b><em>${x.up ? { L: 'leader', C: 'candidate', F: 'follower' }[x.role] : 'DOWN'}</em><small>term ${x.term}${x.voted != null ? ' · voted ' + N(x.voted) : ''}</small>
      <div class="rf-log">${x.log.length ? x.log.map((e, k) => `<span class="${k < x.commit ? 'c' : ''}" title="${esc(e[1])}">${e[0]}</span>`).join('') : '<i>empty log</i>'}</div></div>`;
    return `<div class="rf-groups">${groups.map(g => `<div class="rf-group">${groups.length > 1 ? `<b class="rf-gl">side ${g ? 'B' : 'A'}</b>` : ''}${nodes.map((x, i) => fr.snap.group[i] === g ? card(x, i) : '').join('')}</div>`).join('')}</div>
      <div class="rf-key">Each box in a log is one entry, labelled with its term. Solid = committed, dashed = not committed.</div>`;
  }

  function mount(host, scene) {
    const n = scene.n, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs rf">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><label>Node <select data-node>${Array.from({ length: n }, (_, i) => `<option value="${i}">${N(i)}</option>`).join('')}</select></label><button type="button" data-do="timeout">Election timeout</button><button type="button" data-do="crash">Crash</button><button type="button" data-do="restart">Restart</button></div>
        <div class="bt-try"><label>Command <input type="text" value="${esc(scene.cmd)}" maxlength="24" data-cmd aria-label="Command"></label><button type="button" data-do="client">Send to the leader</button><button type="button" data-do="partition">Split ${scene.split[0].map(i => N(i)).join('+')} | ${scene.split[1].map(i => N(i)).join('+')}</button><button type="button" data-do="heal">Heal</button></div>
      </div>
      <div class="rf-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(n, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, leaders = fr.snap.nodes.map((x, i) => x.up && x.role === 'L' ? N(i) : null).filter(Boolean);
      $('[data-stage]').innerHTML = draw(fr, scene);
      $('[data-stat]').textContent = `leaders: ${leaders.join(', ') || 'none'} · highest term ${Math.max(...fr.snap.nodes.map(x => x.term))} · majority ${majority(n)} of ${n}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(n, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      const node = +$('[data-node]').value;
      if (b.dataset.do === 'timeout') return add({ op: 'timeout', n: node });
      if (b.dataset.do === 'crash') return add({ op: 'crash', n: node });
      if (b.dataset.do === 'restart') return add({ op: 'restart', n: node });
      if (b.dataset.do === 'client') return add({ op: 'client', cmd: $('[data-cmd]').value.trim() || scene.cmd });
      if (b.dataset.do === 'partition') return add({ op: 'partition', sides: scene.split });
      if (b.dataset.do === 'heal') return add({ op: 'heal' });
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [], n = scene.n;
    if (!Number.isInteger(n) || n < 3 || n > 7) e.push('animation raft needs n from 3 to 7');
    if (!Array.isArray(scene.split) || scene.split.length !== 2 || !scene.split.every(Array.isArray) || scene.split[0].length + scene.split[1].length !== n) e.push('animation raft needs split, two lists of node indexes covering every node');
    if (!scene.cmd) e.push('animation raft needs a default cmd');
    const okOp = o => ['timeout', 'crash', 'restart'].includes(o.op) ? Number.isInteger(o.n) && o.n >= 0 && o.n < n : o.op === 'client' ? !!o.cmd : o.op === 'partition' ? Array.isArray(o.sides) : o.op === 'heal';
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation raft needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation raft preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.raft = { fresh, step, runAll, majority };
  root.Course.registerAnimation('raft', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
