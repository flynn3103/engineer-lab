/* Computed Raft animation: leader election, log replication, majority commit, partitions and crashes on a small cluster.
 * The model is pure (Course.raft) so Node can test it. Each op plays a few synchronous rounds, one frame per round, and every
 * frame carries the messages sent in that round, a majority counter and the Raft rule it illustrates, so the picture shows
 * WHO talks to WHOM and WHY a decision was made. Simplified: no timers, no pre-vote, followers copy the leader log when it
 * reaches them. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = k => 'N' + (k + 1);
  const RULES = ['', 'One leader per term. A higher term always wins.', 'A leader needs votes from a majority.', 'An entry is committed once a majority has stored it.'];

  function fresh(n) { return { n, nodes: Array.from({ length: n }, () => ({ up: true, role: 'F', term: 0, voted: null, log: [], commit: 0 })), group: Array(n).fill(0), leaders: {} }; }
  const clone = m => ({ nodes: m.nodes.map(x => ({ up: x.up, role: x.role, term: x.term, voted: x.voted, log: x.log.map(e => [e[0], e[1]]), commit: x.commit })), group: m.group.slice() });
  const majority = n => Math.floor(n / 2) + 1;
  const reach = (m, a) => m.nodes.map((x, i) => i !== a && x.up && m.group[i] === m.group[a] ? i : -1).filter(i => i >= 0);
  const unreach = (m, a) => m.nodes.map((_, i) => i !== a && !reach(m, a).includes(i) ? i : -1).filter(i => i >= 0);
  const lastTerm = x => x.log.length ? x.log[x.log.length - 1][0] : 0;

  /* Leader a pushes its log to every node it can reach. Returns { acks, stale, to } where stale means a reachable node has a higher term. */
  function replicate(m, a) {
    const L = m.nodes[a], to = reach(m, a), higher = to.find(i => m.nodes[i].term > L.term);
    if (higher != null) { L.role = 'F'; L.term = m.nodes[higher].term; L.voted = null; return { acks: 0, stale: higher, to }; }
    let acks = 1;
    to.forEach(i => { const x = m.nodes[i]; x.term = L.term; x.role = 'F'; x.voted = null; x.log = L.log.map(e => [e[0], e[1]]); acks++; });
    if (acks >= majority(m.n)) { L.commit = L.log.length; to.forEach(i => { m.nodes[i].commit = L.log.length; }); }
    return { acks, stale: null, to };
  }

  /* Apply one op. Returns an array of frames { snap, now, title, text, tone, rule, msgs, meter }. */
  function step(m, op) {
    const frame = (title, text, o) => Object.assign({ snap: clone(m), now: [], title, text, tone: '', rule: 0, msgs: [], meter: null }, o);
    const n = m.n, need = majority(n);
    if (op.op === 'timeout') {
      const c = op.n, X = m.nodes[c];
      if (!X.up) return [frame(`${N(c)} is down`, `${N(c)} is not running, so its election timer cannot fire.`, { now: [c], tone: 'bad' })];
      X.term++; X.role = 'C'; X.voted = c;
      const peers = reach(m, c), lost = unreach(m, c);
      const f1 = frame(`${N(c)} asks for votes (term ${X.term})`, `${N(c)} heard no leader for a while. It raises its term to ${X.term}, becomes a candidate, votes for itself and asks everyone else for a vote.`, { now: [c], rule: 2, msgs: peers.map(i => ({ from: c, to: i, kind: 'vote', label: 'vote?' })).concat(lost.map(i => ({ from: c, to: i, kind: 'vote', label: 'vote?', lost: true }))), meter: { label: `Votes for ${N(c)}`, have: 1, need, total: n, ok: 1 >= need } });
      let votes = 1; const replies = [], why = [];
      peers.forEach(i => {
        const y = m.nodes[i];
        if (y.term < X.term) { y.term = X.term; y.role = 'F'; y.voted = null; }
        const upToDate = lastTerm(X) > lastTerm(y) || (lastTerm(X) === lastTerm(y) && X.log.length >= y.log.length);
        if (y.term === X.term && (y.voted == null || y.voted === c) && upToDate) { y.voted = c; votes++; replies.push({ from: i, to: c, kind: 'yes', label: 'yes' }); }
        else { replies.push({ from: i, to: c, kind: 'no', label: 'no' }); why.push(`${N(i)} says no because ${!upToDate ? 'its log is more complete than the candidate\'s' : 'it already voted in this term'}`); }
      });
      const f2 = frame(`${votes} of ${n} votes`, `Each node votes once per term, for a candidate whose log is at least as complete as its own.${why.length ? ' ' + why.join('. ') + '.' : ''}${lost.length ? ` ${lost.map(N).join(', ')} cannot be reached.` : ''} ${votes >= need ? `${votes} is at least ${need}, a majority.` : `${need} votes are needed and there are only ${votes}.`}`, { now: [c, ...peers], rule: 2, msgs: replies.concat(lost.map(i => ({ from: i, to: c, kind: 'no', label: 'no reply', lost: true }))), meter: { label: `Votes for ${N(c)}`, have: votes, need, total: n, ok: votes >= need } });
      if (votes < need) return [f1, f2, frame('No majority: still a candidate', `${N(c)} cannot become leader, so nothing can be committed through it. It stays a candidate in term ${X.term} until it hears from a leader or tries again.`, { now: [c], tone: 'bad', rule: 2, meter: { label: `Votes for ${N(c)}`, have: votes, need, total: n, ok: false } })];
      X.role = 'L'; m.leaders[X.term] = (m.leaders[X.term] || []).concat(c);
      X.log.push([X.term, 'no-op']);
      const f3pre = frame(`${N(c)} wins term ${X.term}`, `${N(c)} is now the leader. Its first act is to append a no-op entry for its own term, which lets it commit everything before it.`, { now: [c], tone: 'ok', rule: 1 });
      const r = replicate(m, c);
      const f4 = frame(`${N(c)} is leader of term ${X.term}`, `${N(c)} sends the no-op to every follower. ${r.acks >= need ? `${r.acks} of ${n} stored it: it is committed, and every earlier entry is committed with it.` : `Only ${r.acks} of ${n} stored it, so nothing new is committed yet.`}`, { now: [c], tone: 'ok', rule: 3, msgs: r.to.map(i => ({ from: c, to: i, kind: 'append', label: 'no-op' })).concat(r.to.map(i => ({ from: i, to: c, kind: 'ack', label: 'ok' })), unreach(m, c).map(i => ({ from: c, to: i, kind: 'append', label: 'no-op', lost: true }))), meter: { label: 'Copies of the no-op', have: r.acks, need, total: n, ok: r.acks >= need } });
      return [f1, f2, f3pre, f4];
    }
    if (op.op === 'client') {
      const ls = m.nodes.map((x, i) => x.up && x.role === 'L' ? i : -1).filter(i => i >= 0);
      const a = op.to != null ? op.to : ls.sort((p, q) => m.nodes[q].term - m.nodes[p].term)[0];
      if (a == null || !m.nodes[a].up || m.nodes[a].role !== 'L') return [frame('No leader: command rejected', `No running node is a leader, so "${op.cmd}" is turned away. A node must win an election first.`, { tone: 'bad', rule: 0 })];
      const L = m.nodes[a]; L.log.push([L.term, op.cmd]);
      const idx = L.log.length, f1 = frame(`${N(a)} appends "${op.cmd}"`, `Only the leader accepts commands. ${N(a)} writes "${op.cmd}" as entry ${idx} of its own log. Nobody else has it yet, so it is not committed.`, { now: [a], rule: 3, meter: { label: `Copies of entry ${idx}`, have: 1, need, total: n, ok: 1 >= need } });
      const to = reach(m, a), lost = unreach(m, a);
      const f2 = frame(`${N(a)} sends the entry to everyone`, `The leader sends entry ${idx} to all followers it can reach.${lost.length ? ` ${lost.map(N).join(', ')} cannot be reached: the message is lost.` : ''}`, { now: [a], rule: 3, msgs: to.map(i => ({ from: a, to: i, kind: 'append', label: op.cmd })).concat(lost.map(i => ({ from: a, to: i, kind: 'append', label: op.cmd, lost: true }))), meter: { label: `Copies of entry ${idx}`, have: 1, need, total: n, ok: 1 >= need } });
      const r = replicate(m, a);
      if (r.stale != null) return [f1, f2, frame('Stale leader steps down', `${N(a)} learns that ${N(r.stale)} is in term ${m.nodes[r.stale].term}, newer than its own, so it steps down. Its new entry is not committed.`, { now: [a, r.stale], tone: 'bad', rule: 1 })];
      const ok = r.acks >= need;
      return [f1, f2, frame(ok ? `"${op.cmd}" is committed` : `"${op.cmd}" is NOT committed`, ok ? `${r.acks} of ${n} nodes now hold entry ${idx}, which is at least ${need}: a majority. The leader marks it committed and applies it. It can never be lost.` : `Only ${r.acks} of ${n} hold it and ${need} are needed. The entry stays uncommitted and may be thrown away if another leader is elected without it.`, { now: [a, ...r.to], tone: ok ? 'ok' : 'bad', rule: 3, msgs: r.to.map(i => ({ from: i, to: a, kind: 'ack', label: 'ok' })).concat(lost.map(i => ({ from: i, to: a, kind: 'ack', label: 'no reply', lost: true }))), meter: { label: `Copies of entry ${idx}`, have: r.acks, need, total: n, ok } })];
    }
    if (op.op === 'partition') {
      m.group = Array(n).fill(0); op.sides[1].forEach(i => { m.group[i] = 1; });
      const big = op.sides.find(s => s.length >= need);
      return [frame('The network splits', `${op.sides[0].map(N).join(', ')} can talk to each other, and so can ${op.sides[1].map(N).join(', ')}, but nothing crosses the gap. ${big ? `Only the side with ${big.map(N).join(', ')} has a majority (${need}).` : 'Neither side has a majority.'}`, { rule: 2 })];
    }
    if (op.op === 'heal') {
      m.group = Array(n).fill(0);
      const ups = m.nodes.map((x, i) => x.up ? i : -1).filter(i => i >= 0), T = Math.max(...ups.map(i => m.nodes[i].term));
      const dropped = [];
      ups.forEach(i => { const x = m.nodes[i]; if (x.term < T) { if (x.role === 'L') dropped.push(`${N(i)} (leader of term ${x.term}) steps down`); x.term = T; x.role = 'F'; x.voted = null; } });
      const lead = ups.find(i => m.nodes[i].role === 'L' && m.nodes[i].term === T);
      if (lead == null) return [frame('The network heals: no leader', `Everyone can talk again. The highest term is ${T} and its owner is not a leader, so all nodes adopt term ${T} and step down. A new election is needed.`, { now: ups, tone: 'bad', rule: 1 })];
      const r = replicate(m, lead);
      return [frame('The network heals', `${dropped.length ? dropped.join('. ') + '. ' : ''}${N(lead)}, leader of term ${T}, sends its log to everyone. Entries only a stale leader held, and never committed, are overwritten. ${r.acks >= need ? 'All logs now match and the whole log is committed.' : ''}`, { now: [lead, ...ups], tone: 'ok', rule: 1, msgs: r.to.map(i => ({ from: lead, to: i, kind: 'append', label: 'log' })).concat(r.to.map(i => ({ from: i, to: lead, kind: 'ack', label: 'ok' }))), meter: { label: 'Nodes with the leader\'s log', have: r.acks, need, total: n, ok: r.acks >= need } })];
    }
    if (op.op === 'crash') { m.nodes[op.n].up = false; return [frame(`${N(op.n)} crashes`, `${N(op.n)} stops. Its term and log are saved on disk, so they survive. ${m.nodes[op.n].role === 'L' ? 'It was the leader: followers will stop hearing heartbeats, and one of them will time out.' : ''}`, { now: [op.n], tone: 'bad' })]; }
    if (op.op === 'restart') { const x = m.nodes[op.n]; x.up = true; x.role = 'F'; x.voted = null; return [frame(`${N(op.n)} restarts`, `${N(op.n)} comes back as a follower with the term and log it saved. The leader will bring its log up to date at the next replication.`, { now: [op.n], tone: 'ok' })]; }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(n, ops) {
    const m = fresh(n), frames = [{ snap: clone(m), now: [], title: `A cluster of ${n} nodes`, text: `Every node starts as a follower in term 0 with an empty log. A majority is ${majority(n)} of ${n}. Pick a scenario below and press Next step.`, tone: '', rule: 0, msgs: [], meter: null }], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); step(m, op).forEach(f => frames.push(f)); });
    return { frames, opStart, model: m };
  }

  /* ---- drawing ---- */
  const W = 360, R = 26;
  const heightOf = snap => { const groups = [...new Set(snap.group)]; if (groups.length === 1) return 250; const most = Math.max(...groups.map(g => snap.group.filter(x => x === g).length)); return Math.max(250, 100 + (most - 1) * 74 + 50); };
  function positions(snap) {
    const n = snap.nodes.length, groups = [...new Set(snap.group)], pos = [], H = heightOf(snap);
    if (groups.length === 1) { const cx = W / 2, cy = 122, rad = n <= 3 ? 78 : 88; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pos.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } return { pos, split: false, H }; }
    groups.forEach((g, gi) => { const mem = snap.group.map((x, i) => x === g ? i : -1).filter(i => i >= 0), x0 = gi ? 270 : 90, gap = 74, mid = (H - 20) / 2 + 6; mem.forEach((i, k) => { pos[i] = [x0, mid + (k - (mem.length - 1) / 2) * gap]; }); });
    return { pos, split: true, H };
  }
  function arrow(a, b, kind, label, lost, offset) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy * offset, ny = ux * offset;
    const x1 = a[0] + ux * (R + 3) + nx, y1 = a[1] + uy * (R + 3) + ny, x2 = b[0] - ux * (R + 6) + nx, y2 = b[1] - uy * (R + 6) + ny;
    const hx = x2 + ux * 0, hy = y2 + uy * 0, p1 = [hx - ux * 8 - uy * 4, hy - uy * 8 + ux * 4], p2 = [hx - ux * 8 + uy * 4, hy - uy * 8 - ux * 4];
    const mx = (x1 + x2) / 2 + nx * 0.6, my = (y1 + y2) / 2 + ny * 0.6;
    return `<g class="rf-m ${kind}${lost ? ' lost' : ''}"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}"/>${lost ? `<text class="x" x="${(x1 + (x2 - x1) * 0.62).toFixed(1)}" y="${(y1 + (y2 - y1) * 0.62 + 4).toFixed(1)}">✕</text>` : ''}<text class="l" x="${mx.toFixed(1)}" y="${(my - 3).toFixed(1)}">${esc(label)}</text></g>`;
  }
  function drawCluster(fr) {
    const snap = fr.snap, { pos, split, H } = positions(snap), roles = { L: 'leader', C: 'candidate', F: 'follower' };
    let s = '';
    if (split) s += `<line class="rf-wall" x1="180" y1="14" x2="180" y2="${H - 22}"/><text class="rf-wallt" x="180" y="${H - 8}">network split</text><text class="rf-sidet" x="90" y="16">side A</text><text class="rf-sidet" x="270" y="16">side B</text>`;
    const seen = {};
    (fr.msgs || []).forEach(mm => { const key = mm.from + '>' + mm.to; seen[key] = 1; const rev = seen[mm.to + '>' + mm.from] ? 1 : 0; s += arrow(pos[mm.from], pos[mm.to], mm.kind, mm.label, mm.lost, rev || /yes|no|ack/.test(mm.kind) ? 7 : -7); });
    snap.nodes.forEach((x, i) => {
      const [px, py] = pos[i], cls = x.up ? x.role : 'X';
      s += `<g class="rf-n ${cls}${fr.now.includes(i) ? ' now' : ''}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${R}"/>${x.role === 'L' && x.up ? `<text class="crown" x="${px.toFixed(1)}" y="${(py - R - 4).toFixed(1)}">★</text>` : ''}<text class="nm" x="${px.toFixed(1)}" y="${(py - 2).toFixed(1)}">${N(i)}</text><text class="tm" x="${px.toFixed(1)}" y="${(py + 11).toFixed(1)}">term ${x.term}</text><text class="rl" x="${px.toFixed(1)}" y="${(py + R + 12).toFixed(1)}">${x.up ? roles[x.role] : 'DOWN'}</text>${x.up ? '' : `<text class="dead" x="${px.toFixed(1)}" y="${(py + 6).toFixed(1)}">✕</text>`}</g>`;
    });
    return `<svg class="rf-svg" viewBox="0 0 ${W} ${H}" style="max-height:${H + 40}px" role="img" aria-label="Cluster of ${snap.nodes.length} nodes">${s}</svg>`;
  }
  function drawMeter(me) {
    if (!me) return '<div class="rf-meter empty"></div>';
    return `<div class="rf-meter${me.ok ? ' ok' : ''}"><b>${esc(me.label)}</b><span class="rf-sq">${Array.from({ length: me.total }, (_, i) => `<i class="${i < me.have ? 'on' : ''}${i === me.need - 1 ? ' line' : ''}"></i>`).join('')}</span><em>${me.have} of ${me.total} · need ${me.need} (a majority) ${me.ok ? '✓' : '✗'}</em></div>`;
  }
  const label = cmd => cmd === 'no-op' ? 'no-op' : cmd.length > 11 ? cmd.slice(0, 10) + '…' : cmd;
  function drawLogs(fr, prev) {
    const nodes = fr.snap.nodes, len = Math.max(4, ...nodes.map(x => x.log.length)), terms = [...new Set(nodes.flatMap(x => x.log.map(e => e[0])))].sort((a, b) => a - b);
    const head = '<span class="rf-lh"></span>' + Array.from({ length: len }, (_, i) => `<span class="rf-ih">${i + 1}</span>`).join('');
    const rows = nodes.map((x, ni) => `<span class="rf-ln${x.up ? '' : ' down'}">${N(ni)}</span>` + Array.from({ length: len }, (_, k) => {
      const e = x.log[k]; if (!e) return '<span class="rf-e empty"></span>';
      const was = prev && prev.nodes[ni].log[k] && prev.nodes[ni].log[k][0] === e[0] && prev.nodes[ni].log[k][1] === e[1];
      return `<span class="rf-e t${(e[0] - 1) % 6}${k < x.commit ? ' c' : ''}${was ? '' : ' new'}${e[1] === 'no-op' ? ' noop' : ''}" title="entry ${k + 1}, written in term ${e[0]}: ${esc(e[1])}${k < x.commit ? ' (committed)' : ' (not committed)'}">${esc(label(e[1]))}</span>`;
    }).join('')).join('');
    return `<div class="rf-logwrap"><div class="rf-logs" style="--cols:${len}">${head}${rows}</div></div>
      <div class="rf-key">Logs: one row per node, one column per entry number. Colour = the term when the entry was written${terms.length ? ' (' + terms.map(t => `<span class="rf-tl t${(t - 1) % 6}">term ${t}</span>`).join(' ') + ')' : ''}. Solid with ✓ = committed. Dashed = not committed. A glowing entry is new in this step.</div>`;
  }

  function mount(host, scene) {
    const n = scene.n, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs rf">
      <div class="rf-rules" data-rules>${[1, 2, 3].map(i => `<span data-rule="${i}"><b>${i}</b>${esc(RULES[i])}</span>`).join('')}</div>
      <div class="rf-scen"><b>Scenario</b><div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div></div>
      <div class="rf-main">
        <div class="rf-clusterbox"><div class="rf-legend"><span class="L">leader</span><span class="C">candidate</span><span class="F">follower</span><span class="X">down</span></div><div data-cluster></div><div data-meter></div>
          <div class="rf-mlegend"><span class="vote">vote request</span><span class="yes">yes</span><span class="no">no</span><span class="append">log entry</span><span class="ack">stored</span><span class="lost">lost</span></div></div>
        <div class="rf-logbox" data-logs></div>
      </div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      <details class="rf-try"><summary>Try it yourself</summary>
        <div class="bt-try"><label>Node <select data-node>${Array.from({ length: n }, (_, i) => `<option value="${i}">${N(i)}</option>`).join('')}</select></label><button type="button" data-do="timeout">Start an election</button><button type="button" data-do="crash">Crash</button><button type="button" data-do="restart">Restart</button></div>
        <div class="bt-try"><label>Command <input type="text" value="${esc(scene.cmd)}" maxlength="24" data-cmd aria-label="Command"></label><button type="button" data-do="client">Send to the leader</button><button type="button" data-do="partition">Split ${scene.split[0].map(i => N(i)).join('+')} | ${scene.split[1].map(i => N(i)).join('+')}</button><button type="button" data-do="heal">Heal the network</button></div>
      </details>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(n, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, prev = S.k ? run.frames[S.k - 1].snap : null;
      $('[data-cluster]').innerHTML = drawCluster(fr); $('[data-meter]').innerHTML = drawMeter(fr.meter); $('[data-logs]').innerHTML = drawLogs(fr, prev);
      host.querySelectorAll('[data-rule]').forEach(el => el.classList.toggle('on', +el.dataset.rule === fr.rule));
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
