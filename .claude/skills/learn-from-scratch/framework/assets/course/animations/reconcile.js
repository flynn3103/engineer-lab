/* Computed reconcile-loop animation: a controller compares desired state (spec.replicas) with what it observes and acts.
 * Level-triggered (Kubernetes) controllers re-list after a restart and notice drift; an edge-triggered design reacts only to events
 * and never heals a change that happened while it was down. The model is pure (Course.reconcile) so Node can test it. */
(function (root) {
  'use strict';
  const esc = root.Course.esc;
  const P = id => 'pod-' + id;

  function fresh(D) { const pods = Array.from({ length: D }, (_, i) => i + 1); return { D, pods, next: D + 1, up: true, level: true, cache: pods.slice(), queue: [] }; }
  const snap = m => ({ D: m.D, pods: m.pods.slice(), up: m.up, level: m.level, cache: m.cache.slice(), queue: m.queue.slice() });

  /* One reconcile: compare the controller's cache with spec, create or delete pods through the API. */
  function reconcile(m) {
    const acts = [];
    while (m.cache.length < m.D) { const id = m.next++; m.pods.push(id); m.cache.push(id); acts.push('create ' + P(id)); }
    while (m.cache.length > m.D) { const id = m.cache.pop(); m.pods = m.pods.filter(x => x !== id); acts.push('delete ' + P(id)); }
    return acts;
  }

  function step(m, op) {
    const f = (title, text, tone, extra) => Object.assign({ snap: snap(m), title, text, tone: tone || '', event: '' }, extra);
    const out = [];
    if (op.op === 'mode') { m.level = op.level; return [f(op.level ? 'Level-triggered controller' : 'Edge-triggered controller (the wrong design)', op.level ? 'After any restart the controller lists everything and compares it with the spec. It does not matter which events it saw.' : 'The controller keeps a count from the events it has seen and acts only on new events. It never re-checks the real state.', '')]; }
    if (op.op === 'crash') { m.up = false; m.queue = []; return [f('The controller crashes', 'The controller process stops. Its in-memory cache and work queue are gone. The pods keep running, and the API server keeps accepting changes.', 'bad')]; }
    if (op.op === 'delete') {
      const id = op.id; if (!m.pods.includes(id)) return [f(`${P(id)} does not exist`, 'Nothing to delete.', 'bad')];
      m.pods = m.pods.filter(x => x !== id);
      if (!m.up) return [f(`${P(id)} is deleted while the controller is down`, `Someone deletes ${P(id)}. The API server stores the change, but the controller is not running, so the "deleted" event reaches nobody. There are now ${m.pods.length} pods and the spec says ${m.D}.`, 'bad', { event: 'deleted ' + P(id) + ' (nobody is listening)' })];
      m.cache = m.cache.filter(x => x !== id); m.queue.push('rs/web');
      out.push(f(`${P(id)} is deleted`, `The API server tells the controller through its watch: ${P(id)} is gone. The controller updates its cache (now ${m.cache.length} pods) and puts one item, the key of the ReplicaSet, in its work queue. It does not store "what changed", only "look at this object".`, '', { event: 'deleted ' + P(id) }));
      const acts = reconcile(m); m.queue = [];
      out.push(f('The controller reconciles', `It reads the spec (${m.D} replicas), counts the pods it observes (${m.D - acts.length}), and sees the gap. It acts: ${acts.join(', ')}. The loop compares desired with observed every time, so it needs no memory of why the numbers differ.`, 'ok', { event: acts.join(', ') }));
      return out;
    }
    if (op.op === 'restart') {
      m.up = true;
      if (m.level) {
        m.cache = m.pods.slice(); m.queue.push('rs/web');
        out.push(f('The controller restarts and lists everything', `A restarted controller starts with a LIST of all pods from the API server, then a WATCH. Its cache now holds the real ${m.cache.length} pods, whatever happened while it was away.`, '', { event: 'LIST pods: ' + m.cache.length }));
        const acts = reconcile(m); m.queue = [];
        out.push(f(acts.length ? 'It notices the drift and repairs it' : 'Nothing to repair', acts.length ? `Observed ${m.D - acts.length} pods, desired ${m.D}. It acts: ${acts.join(', ')}. The pod deleted while it was down is replaced even though the controller never saw the delete event.` : 'Observed and desired match.', 'ok', { event: acts.join(', ') }));
      } else out.push(f('The controller restarts and sees nothing new', `The edge-triggered controller reacts to events only. No event arrives, so it believes everything is as before. The API server has ${m.pods.length} pods and the spec says ${m.D}, and nothing will ever fix the difference.`, 'bad', { event: 'no event, no action' }));
      return out;
    }
    if (op.op === 'scale') {
      m.D = op.to;
      if (!m.up) return [f(`Spec changed to ${op.to} replicas`, 'The controller is down, so the change waits in the API server.', 'bad')];
      out.push(f(`The spec changes to ${op.to} replicas`, `Someone edits spec.replicas. The controller is told through its watch and queues the ReplicaSet key.`, '', { event: 'spec.replicas = ' + op.to }));
      const acts = reconcile(m); m.queue = [];
      out.push(f('The controller reconciles', acts.length ? `It compares ${m.D} desired with what it observes and acts: ${acts.join(', ')}.` : 'Nothing to do.', 'ok', { event: acts.join(', ') }));
      return out;
    }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(D, ops) { const m = fresh(D), frames = [{ snap: snap(m), title: `A ReplicaSet wants ${D} pods`, text: 'A controller watches the ReplicaSet and its pods, and keeps the number of pods equal to spec.replicas. Delete a pod, crash the controller, or change the spec, and watch how it converges.', tone: '', event: '' }], opStart = []; ops.forEach(op => { opStart.push(frames.length); step(m, op).forEach(x => frames.push(x)); }); return { frames, opStart, model: m }; }

  function draw(fr) {
    const s = fr.snap, chip = (id, cls) => `<span class="rc-pod ${cls || ''}">${P(id)}</span>`;
    const diff = s.pods.length - s.D;
    return `<div class="rc-cols">
      <div class="rc-box"><b>Desired state</b><small>ReplicaSet spec</small><div class="big">replicas: ${s.D}</div></div>
      <div class="rc-box"><b>Actual state</b><small>pods in the API server</small><div>${s.pods.map(id => chip(id)).join('') || '<i>none</i>'}</div><em class="${diff ? 'bad' : 'ok'}">${s.pods.length} of ${s.D} ${diff ? '(drift)' : '✓'}</em></div>
      <div class="rc-box ${s.up ? '' : 'down'}"><b>Controller</b><small>${s.up ? 'running, ' + (s.level ? 'level-triggered' : 'edge-triggered') : 'DOWN'}</small><div class="rc-sub">cache: ${s.up ? (s.cache.map(id => chip(id, 'c')).join('') || '<i>empty</i>') : '<i>lost</i>'}</div><div class="rc-sub">work queue: ${s.queue.length ? s.queue.map(k => `<span class="rc-pod q">${esc(k)}</span>`).join('') : '<i>empty</i>'}</div></div>
    </div>${fr.event ? `<div class="rc-ev">event / action: <b>${esc(fr.event)}</b></div>` : ''}`;
  }

  function mount(host, scene) {
    root.Course.opsPlayer(host, { scene, cls: 'rc', run: ops => runAll(scene.replicas, ops), draw, stat: fr => `desired ${fr.snap.D} · actual ${fr.snap.pods.length} · controller ${fr.snap.up ? 'running' : 'down'}`,
      controls: `<div class="bt-try"><label>Pod <select data-p>${Array.from({ length: scene.replicas }, (_, i) => `<option value="${i + 1}">${P(i + 1)}</option>`).join('')}</select></label><button type="button" data-do="delete">Delete the pod</button><button type="button" data-do="crash">Crash the controller</button><button type="button" data-do="restart">Restart the controller</button></div>
        <div class="bt-try"><label>Replicas <input type="number" min="0" max="9" value="${scene.replicas + 2}" data-n style="width:64px"></label><button type="button" data-do="scale">Change spec.replicas</button><button type="button" data-do="level">Level-triggered</button><button type="button" data-do="edge">Edge-triggered</button></div>`,
      control: (b, h) => { const d = b.dataset.do; if (d === 'delete') return { op: 'delete', id: +h.querySelector('[data-p]').value }; if (d === 'crash') return { op: 'crash' }; if (d === 'restart') return { op: 'restart' }; if (d === 'scale') return { op: 'scale', to: Math.max(0, Math.min(9, +h.querySelector('[data-n]').value || 1)) }; if (d === 'level') return { op: 'mode', level: true }; if (d === 'edge') return { op: 'mode', level: false }; return null; } });
  }

  function validate(scene) {
    const e = [], okOp = o => o.op === 'delete' ? Number.isInteger(o.id) : o.op === 'scale' ? Number.isInteger(o.to) : o.op === 'mode' ? typeof o.level === 'boolean' : ['crash', 'restart'].includes(o.op);
    if (!Number.isInteger(scene.replicas) || scene.replicas < 2 || scene.replicas > 6) e.push('animation reconcile needs replicas from 2 to 6');
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation reconcile needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation reconcile preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }
  root.Course.reconcile = { runAll, step, fresh };
  root.Course.registerAnimation('reconcile', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
