/* Computed scheduler animation: for each pod the kube-scheduler FILTERS out nodes that cannot run it, SCORES the rest, and BINDS the pod to the best.
 * Filters: resources (requests against free allocatable), node selector, taints. Scores: LeastAllocated and BalancedAllocation, equal weight.
 * The model is pure (Course.scheduler) so Node can test it. The course supplies the nodes, the pods and the presets. */
(function (root) {
  'use strict';
  const esc = root.Course.esc;

  const cp = o => JSON.parse(JSON.stringify(o));
  function filterNode(n, p) {
    const r = [];
    if (n.cpu - n.usedCpu < p.cpu) r.push('Insufficient cpu');
    if (n.mem - n.usedMem < p.mem) r.push('Insufficient memory');
    Object.keys(p.selector || {}).forEach(k => { if (n.labels[k] !== p.selector[k]) r.push('node(s) didn\'t match Pod\'s node selector'); });
    (n.taints || []).forEach(t => { if (!(p.tolerates || []).includes(t)) r.push('node(s) had untolerated taint ' + t); });
    return r;
  }
  function score(n, p) {
    const cf = (n.usedCpu + p.cpu) / n.cpu, mf = (n.usedMem + p.mem) / n.mem, least = ((1 - cf) + (1 - mf)) / 2 * 100, bal = 100 - Math.abs(cf - mf) * 100;
    return { least: Math.round(least), balanced: Math.round(bal), total: Math.round(least) + Math.round(bal) };
  }
  const message = (nodes, filt) => {
    const c = {}; filt.forEach(f => { if (f.length) c[f[0]] = (c[f[0]] || 0) + 1; });
    return `0/${nodes.length} nodes are available: ` + Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ') + '.';
  };

  function runAll(scene, ops) {
    const nodes = cp(scene.nodes), frames = [], opStart = [];
    const snap = (extra) => Object.assign({ nodes: cp(nodes), pod: null, filt: null, scores: null, chosen: null, stage: 'start', title: '', text: '', tone: '' }, extra);
    frames.push(snap({ title: `${nodes.length} nodes, some already busy`, text: 'For every new pod the scheduler runs two phases: filter the nodes that cannot run it, then score the ones that can and pick the best. Choose a scenario to place pods.' }));
    ops.forEach(op => {
      opStart.push(frames.length);
      const p = scene.pods[op.pod], filt = nodes.map(n => filterNode(n, p));
      const desc = `${p.name}: requests ${p.cpu}m CPU and ${p.mem} GiB${Object.keys(p.selector || {}).length ? ', needs ' + Object.entries(p.selector).map(([k, v]) => k + '=' + v).join(', ') : ''}${(p.tolerates || []).length ? ', tolerates ' + p.tolerates.join(', ') : ''}`;
      frames.push(snap({ pod: p, filt, stage: 'filter', title: `Filter: where can ${p.name} run?`, text: `${desc}. Each filter plugin rejects nodes that cannot host the pod: not enough free requests, a selector that does not match, or a taint the pod does not tolerate. ${filt.filter(f => !f.length).length} of ${nodes.length} nodes pass.` }));
      const ok = filt.map((f, i) => f.length ? -1 : i).filter(i => i >= 0);
      if (!ok.length) { frames.push(snap({ pod: p, filt, stage: 'pending', tone: 'bad', title: `${p.name} stays Pending`, text: `No node passed the filters, so there is nothing to score and the pod cannot be bound. The scheduler records an event: "${message(nodes, filt)}" The pod waits and is retried when the cluster changes.` })); return; }
      const sc = nodes.map((n, i) => filt[i].length ? null : score(n, p)), best = ok.reduce((a, i) => sc[i].total > sc[a].total ? i : a, ok[0]);
      frames.push(snap({ pod: p, filt, scores: sc, stage: 'score', title: `Score: which feasible node is best for ${p.name}?`, text: `Each feasible node gets a score from 0 to 200: LeastAllocated (more free CPU and memory after placing is better) plus BalancedAllocation (CPU and memory use should stay in proportion). Highest total wins; here ${nodes[best].name} with ${sc[best].total}. Ties are broken at random in the real scheduler.` }));
      nodes[best].usedCpu += p.cpu; nodes[best].usedMem += p.mem;
      frames.push(snap({ pod: p, filt, scores: sc, chosen: best, stage: 'bind', tone: 'ok', title: `Bind ${p.name} to ${nodes[best].name}`, text: `The scheduler writes the binding through the API server: spec.nodeName = ${nodes[best].name}. It does not start anything. The kubelet on that node sees the pod and does the rest. The node's free capacity is now lower.` }));
    });
    return { frames, opStart };
  }

  function draw(fr) {
    const bar = (u, a, add) => `<span class="sc-bar"><i style="width:${Math.min(100, u / a * 100)}%"></i>${add ? `<u style="left:${Math.min(100, u / a * 100)}%;width:${Math.min(100 - u / a * 100, add / a * 100)}%"></u>` : ''}</span>`;
    const rows = fr.nodes.map((n, i) => {
      const f = fr.filt && fr.filt[i], sc = fr.scores && fr.scores[i], chosen = fr.chosen === i;
      return `<tr class="${chosen ? 'chosen' : ''}${f && f.length ? ' out' : ''}"><td><b>${esc(n.name)}</b><small>${Object.entries(n.labels).map(([k, v]) => k + '=' + v).join(' ')}${(n.taints || []).length ? ' · taint ' + n.taints.join(' ') : ''}</small></td>
        <td>${bar(n.usedCpu, n.cpu, fr.pod && fr.stage !== 'bind' ? fr.pod.cpu : 0)}<small>cpu ${n.usedCpu}/${n.cpu}m</small></td><td>${bar(n.usedMem, n.mem, fr.pod && fr.stage !== 'bind' ? fr.pod.mem : 0)}<small>mem ${n.usedMem}/${n.mem} GiB</small></td>
        <td>${f ? (f.length ? `<span class="sc-no">✗ ${esc(f[0])}</span>` : '<span class="sc-yes">✓ feasible</span>') : ''}</td>
        <td>${sc ? `<b>${sc.total}</b><small>least ${sc.least} + balanced ${sc.balanced}</small>` : ''}${chosen ? '<span class="sc-pick">← bound here</span>' : ''}</td></tr>`;
    }).join('');
    return `<div class="sc-wrap"><table class="sc-t"><thead><tr><th>Node</th><th>CPU used</th><th>Memory used</th><th>Filter</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div><div class="rf-key">Dark bar = already requested by other pods. Light bar = this pod's request.</div>`;
  }

  function mount(host, scene) {
    root.Course.opsPlayer(host, { scene, cls: 'sc', run: ops => runAll(scene, ops), draw, stat: fr => fr.stage === 'start' ? 'choose a scenario' : `${fr.pod ? fr.pod.name : ''} · ${fr.stage}`,
      controls: `<div class="bt-try"><label>Pod <select data-pod>${scene.pods.map((p, i) => `<option value="${i}">${esc(p.name)} (${p.cpu}m, ${p.mem} GiB)</option>`).join('')}</select></label><button type="button" data-do="go">Schedule it</button></div>`,
      control: (b, h) => b.dataset.do === 'go' ? { op: 'schedule', pod: +h.querySelector('[data-pod]').value } : null });
  }

  function validate(scene) {
    const e = [], okN = n => n && n.name && n.cpu > 0 && n.mem > 0 && n.labels && n.usedCpu >= 0 && n.usedMem >= 0;
    if (!Array.isArray(scene.nodes) || scene.nodes.length < 3 || !scene.nodes.every(okN)) e.push('animation scheduler needs at least 3 valid nodes');
    if (!Array.isArray(scene.pods) || !scene.pods.length || !scene.pods.every(p => p.name && p.cpu > 0 && p.mem > 0)) e.push('animation scheduler needs pods');
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation scheduler needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(o => o.op === 'schedule' && scene.pods[o.pod])) e.push('animation scheduler preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }
  root.Course.scheduler = { runAll, filterNode, score };
  root.Course.registerAnimation('scheduler', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
