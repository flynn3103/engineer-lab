/* Computed rolling-update animation: a Deployment replaces old pods with new ones under maxSurge and maxUnavailable.
 * Each round the controller first creates new pods (never more than replicas + maxSurge in total), then removes old pods
 * (never leaving fewer than replicas - maxUnavailable READY pods). New pods become ready one round after they are created,
 * unless the new image is bad. The model is pure (Course.rollout) so Node can test it. */
(function (root) {
  'use strict';
  const esc = root.Course.esc;

  function rounds(m, s, u, bad, frames, label) {
    const R = m.R;
    const mk = (title, text, tone, extra) => frames.push(Object.assign({ R, s, u, oldTotal: m.oldTotal, oldReady: m.oldReady, newTotal: m.newTotal, newReady: m.newReady, oldV: m.oldV, newV: m.newV, bad, title, text, tone: tone || '' }, extra));
    if (s === 0 && u === 0) { mk('Invalid: maxSurge and maxUnavailable are both 0', 'The Deployment would not be able to start a new pod (surge 0) or stop an old one (unavailable 0). The API server rejects this combination.', 'bad'); return; }
    mk(`${label}: surge ${s}, unavailable ${u}`, `New version ${m.newV}. During the update the controller keeps total pods at most ${R + s} (replicas + maxSurge) and ready pods at least ${R - u} (replicas - maxUnavailable).`, '');
    for (let r = 1; r <= 40; r++) {
      const before = [m.oldTotal, m.oldReady, m.newTotal, m.newReady];
      let becameReady = 0;
      if (!bad) { becameReady = m.fresh; m.newReady += m.fresh; } m.fresh = 0;
      const allowed = R + s - (m.oldTotal + m.newTotal), create = Math.max(0, Math.min(allowed, R - m.newTotal));
      m.newTotal += create; m.fresh = create;
      const unhealthy = m.oldTotal - m.oldReady, avail = m.oldReady + m.newReady, killReady = Math.max(0, Math.min(m.oldReady, avail - (R - u))), kill = unhealthy + killReady;
      m.oldTotal -= kill; m.oldReady -= killReady;
      const done = m.newTotal === R && m.oldTotal === 0 && m.newReady === R;
      const parts = [becameReady ? `${becameReady} new pod${becameReady > 1 ? 's' : ''} became ready` : '', create ? `created ${create} new` : '', kill ? `removed ${kill} old` : ''].filter(Boolean);
      const stuck = !done && before[0] === m.oldTotal && before[2] === m.newTotal && before[3] === m.newReady;
      mk(done ? 'Rollout complete' : stuck ? 'The rollout is stuck' : `Round ${r}`, done ? `Every pod is now version ${m.newV} and ready. Throughout, at least ${R - u} pods were ready and at most ${R + s} existed.` : stuck ? `${m.newTotal - m.newReady} new pod${m.newTotal - m.newReady > 1 ? 's' : ''} never become ready (the readiness probe keeps failing). Old pods cannot be removed, because that would leave fewer than ${R - u} ready. The rollout stops making progress but capacity is preserved. After progressDeadlineSeconds (600 s by default) the Deployment reports ProgressDeadlineExceeded.` : `${parts.length ? parts.join(', ') : 'waiting for new pods to pass their readiness probe'}. Total ${m.oldTotal + m.newTotal} (limit ${R + s}), ready ${m.oldReady + m.newReady} (minimum ${R - u}).`, done ? 'ok' : stuck ? 'bad' : '', { round: r });
      if (done || stuck) return;
    }
  }

  function runAll(R, ops) {
    const m = { R, oldTotal: R, oldReady: R, newTotal: 0, newReady: 0, fresh: 0, oldV: 'v1', newV: 'v1' }, frames = [], opStart = [];
    frames.push({ R, s: 0, u: 0, oldTotal: R, oldReady: R, newTotal: 0, newReady: 0, oldV: 'v1', newV: 'v1', bad: false, title: `${R} pods of version v1, all ready`, text: 'A Deployment owns one ReplicaSet per pod template. A new image creates a new ReplicaSet, and the controller moves pods from the old one to the new one in small steps.', tone: '' });
    ops.forEach(op => {
      opStart.push(frames.length);
      if (op.op === 'update') {
        m.oldTotal += m.newTotal; m.oldReady += m.newReady; m.newTotal = 0; m.newReady = 0; m.fresh = 0; m.oldV = m.newV; m.newV = 'v' + (parseInt(m.newV.slice(1), 10) + 1);
        rounds(m, op.s, op.u, !!op.bad, frames, op.bad ? 'Update to a broken image' : 'Update');
      } else if (op.op === 'rollback') {
        const t = [m.oldTotal, m.oldReady, m.oldV]; m.oldTotal = m.newTotal; m.oldReady = m.newReady; m.oldV = m.newV; m.newTotal = t[0]; m.newReady = t[1]; m.newV = t[2]; m.fresh = 0;
        rounds(m, op.s, op.u, false, frames, 'Rollback');
      } else throw new Error('unknown op ' + op.op);
    });
    return { frames, opStart };
  }

  function draw(fr) {
    const cells = (total, ready, v, cls) => Array.from({ length: total }, (_, i) => `<span class="ro-pod ${cls}${i < ready ? ' ready' : ' notready'}" title="${v}, ${i < ready ? 'ready' : 'not ready'}">${v}${i < ready ? '' : '<i>?</i>'}</span>`).join('');
    const tot = fr.oldTotal + fr.newTotal, rdy = fr.oldReady + fr.newReady, okT = !fr.s && !fr.u ? true : tot <= fr.R + fr.s, okR = !fr.s && !fr.u ? true : rdy >= fr.R - fr.u;
    return `<div class="ro-rs"><b>ReplicaSet ${esc(fr.oldV)} (old)</b><div>${cells(fr.oldTotal, fr.oldReady, fr.oldV, 'old') || '<i>0 pods</i>'}</div></div>
      <div class="ro-rs"><b>ReplicaSet ${esc(fr.newV)} (new)</b><div>${cells(fr.newTotal, fr.newReady, fr.newV, fr.bad ? 'bad' : 'new') || '<i>0 pods</i>'}</div></div>
      <div class="ro-lim"><span class="${okT ? 'ok' : 'bad'}">total pods ${tot} ≤ ${fr.R + fr.s} (replicas ${fr.R} + maxSurge ${fr.s})</span><span class="${okR ? 'ok' : 'bad'}">ready pods ${rdy} ≥ ${fr.R - fr.u} (replicas ${fr.R} − maxUnavailable ${fr.u})</span></div>
      <div class="rf-key">A pod with ? is created but not ready: it receives no traffic.</div>`;
  }

  function mount(host, scene) {
    root.Course.opsPlayer(host, { scene, cls: 'ro', run: ops => runAll(scene.replicas, ops), draw, stat: fr => `${fr.oldTotal + fr.newTotal} pods · ${fr.oldReady + fr.newReady} ready · old ${fr.oldTotal} · new ${fr.newTotal}`,
      controls: `<div class="bt-try"><label>maxSurge <input type="number" min="0" max="${scene.replicas}" value="1" data-s style="width:60px"></label><label>maxUnavailable <input type="number" min="0" max="${scene.replicas}" value="1" data-u style="width:60px"></label><label><input type="checkbox" data-bad> broken image (never ready)</label><button type="button" data-do="update">Roll out a new version</button><button type="button" data-do="rollback">Roll back</button></div>`,
      control: (b, h) => { const s = Math.max(0, +h.querySelector('[data-s]').value || 0), u = Math.max(0, +h.querySelector('[data-u]').value || 0); return b.dataset.do === 'update' ? { op: 'update', s, u, bad: h.querySelector('[data-bad]').checked } : b.dataset.do === 'rollback' ? { op: 'rollback', s, u } : null; } });
  }

  function validate(scene) {
    const e = [];
    if (!Number.isInteger(scene.replicas) || scene.replicas < 3 || scene.replicas > 8) e.push('animation rollout needs replicas from 3 to 8');
    const okOp = o => (o.op === 'update' || o.op === 'rollback') && Number.isInteger(o.s) && Number.isInteger(o.u) && o.s >= 0 && o.u >= 0;
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation rollout needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation rollout preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }
  root.Course.rollout = { runAll };
  root.Course.registerAnimation('rollout', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
