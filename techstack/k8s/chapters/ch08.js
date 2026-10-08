/* Chapter 8 "Rolling Update": two ReplicaSets as rows of pod tiles, a stuck rollout and a capacity dip (index 8).
   Loads after course.js and scene-tools.js. Replica counts and timings are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Replica counts and timings are illustrative.';

  /* One pod tile per slot. A row string has one letter per pod: R Ready, S starting, C crash loop, T terminating. */
  const TX = i => 40 + i * 114;
  const TONE = { R: 'ok', S: 'warn', C: 'warn', T: 'delete' };
  const SUB = { R: 'Ready', S: 'starting', C: 'CrashLoop', T: 'Terminating' };
  function rows(kit) {
    kit.text(null, { x: 40, y: 86, t: 'old ReplicaSet web-6f4b9 · image v1', cls: 'kt xs' });
    kit.text(null, { x: 40, y: 168, t: 'new ReplicaSet web-7d9f6 · image v2', cls: 'kt xs' });
    const mk = (y, v) => [0, 1, 2, 3, 4].map(i => kit.chip(null, { x: TX(i), y, w: 104, h: 44, label: 'pod', sub: '', tone: 'info', show: false }));
    return { old: mk(94), nw: mk(176) };
  }
  function drawRows(R, s) {
    const fill = (chips, str, v) => chips.forEach((c, i) => {
      const ch = str[i];
      c.set({ show: !!ch, label: ch ? v + ' pod' : 'pod', sub: ch ? SUB[ch] : '', tone: ch ? TONE[ch] : 'info' });
    });
    fill(R.old, s.old || '', 'v1'); fill(R.nw, s.nw || '', 'v2');
  }
  const count = (str, ch) => (str.match(new RegExp(ch, 'g')) || []).length;

  /* ---------- 1. Surge, then retire: the safe rolling update ---------- */
  const safe = {
    id: 'surge', label: 'Surge, then retire', desc: 'replicas 4, maxSurge 1, maxUnavailable 0. The new ReplicaSet goes up first; an old pod is removed only when a new one is Ready, so Ready pods never drop below 4.',
    codeLabel: 'kubectl',
    code: { bug: ['strategy: {rollingUpdate: {maxSurge: 1, maxUnavailable: 0}}', '$ kubectl set image deploy/web web=web:v2', '$ kubectl rollout status deploy/web', 'deployment "web" successfully rolled out'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · replicas 4', right: s.r || '' }),
      setup(kit) {
        const r = rows(kit);
        const bars = kit.bars(null, { x: 40, y: 270, w: 400, labelW: 110, rowH: 28, items: [{ id: 'ready', label: 'Ready pods' }, { id: 'total', label: 'all pods' }], max: 6, unit: '', title: 'capacity' });
        const lim = [kit.text(null, { x: 470, y: 284, t: '', cls: 'kt xs' }), kit.text(null, { x: 470, y: 312, t: '', cls: 'kt xs' })];
        return { r, bars, lim };
      },
      frame(s, kit, R) {
        drawRows(R.r, s);
        const old = s.old || '', nw = s.nw || '', ready = count(old, 'R') + count(nw, 'R'), total = old.length + nw.length;
        const floor = 4, ceil = 5;
        R.bars.set('ready', ready, ready < floor ? 'bad' : 'ok', String(ready)); R.bars.set('total', total, total > ceil ? 'bad' : 'info', String(total));
        R.lim[0].set('floor: ' + floor + ' Ready'); R.lim[1].set('ceiling: ' + ceil + ' pods');
      }
    },
    bug: [
      { log: 'Deployment web runs 4 pods from ReplicaSet web-6f4b9. Two bounds apply during an update: at most replicas + maxSurge = 5 pods, and at least replicas - maxUnavailable = 4 Ready.', callout: 'Floor 4 Ready, ceiling 5 pods', code: 0, state: { old: 'RRRR', nw: '', r: 'v1 steady' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'bounds', v: '4 to 5' }] },
      { log: 'The image changes, which edits spec.template. The pod-template hash is new, so the Deployment creates ReplicaSet web-7d9f6. It starts with 0 pods and the old ReplicaSet is kept.', callout: 'A new template creates a new ReplicaSet', code: 1, state: { old: 'RRRR', nw: '', r: 'RS created' }, stats: [{ l: 'ReplicaSets', v: '2' }, { l: 'new pods', v: '0' }] },
      { log: 'The controller scales the new ReplicaSet up first, within the surge limit. A fifth pod starts but is not Ready, so it does not count as available.', callout: 'Surge: the 5th pod starts, not yet Ready', code: 1, state: { old: 'RRRR', nw: 'S', r: 'surge' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'all pods', v: '5', cls: 'warn' }] },
      { log: 'The new pod passes its readiness probe. Now 5 pods are Ready, one more than the floor, so one old pod may be removed.', callout: 'The new pod is Ready: one old pod may go', code: 1, state: { old: 'RRRR', nw: 'R', r: '5 Ready' }, stats: [{ l: 'Ready', v: '5', cls: 'ok' }, { l: 'headroom', v: '1' }] },
      { log: 'The controller scales the old ReplicaSet down by one. The terminating pod no longer counts, so Ready is back to exactly 4, the floor, and never below it.', callout: 'An old pod terminates: Ready stays at 4', moment: true, code: 1, state: { old: 'RRRT', nw: 'R', r: 'retire one' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'min Ready so far', v: '4', cls: 'ok' }] },
      { log: 'The cycle repeats: surge one, wait for Ready, retire one. Halfway through there are 2 old and 2 new pods, all Ready.', callout: 'Surge, ready, retire: repeated', code: 1, state: { old: 'RR', nw: 'RR', r: 'half way' }, stats: [{ l: 'old Ready', v: '2' }, { l: 'new Ready', v: '2' }] },
      { log: 'The last old pod is terminating while all four new pods are Ready, so capacity is still 4.', callout: 'The last old pod terminates', code: 1, state: { old: 'T', nw: 'RRRR', r: 'last old pod' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'old pods', v: '0 soon' }] },
      { log: 'The new ReplicaSet has 4 Ready pods. The old ReplicaSet stays at 0 replicas, so a rollback only needs to scale it up again.', callout: 'Done: 4 new pods; old RS kept at 0', code: 3, state: { old: '', nw: 'RRRR', r: 'v2 steady' }, stats: [{ l: 'min Ready', v: '4', cls: 'ok' }, { l: 'max pods', v: '5', cls: 'ok' }],
        takeaway: 'A rolling update surges first, then retires old pods only as new ones become Ready, so capacity stays inside the bounds.' }
    ],
  };

  /* ---------- 2. A stuck rollout: new pods never become Ready ---------- */
  const stuck = {
    id: 'stuck', label: 'Stuck rollout', desc: 'The new image crashes on start. The Ready gate keeps every old pod serving, and after the progress deadline the rollout is reported as stuck. Undo brings back v1.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl set image deploy/web web=web:v2', '$ kubectl rollout status deploy/web', 'error: deployment "web" exceeded its progress deadline', '$ kubectl rollout undo deploy/web'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · progressDeadlineSeconds 600', right: s.r || '' }),
      setup(kit) {
        const r = rows(kit);
        const bars = kit.bars(null, { x: 40, y: 270, w: 400, labelW: 110, rowH: 28, items: [{ id: 'ready', label: 'Ready pods' }, { id: 'dl', label: 'deadline used' }], max: 100, unit: '%', title: 'capacity and progress' });
        const cond = kit.chip(null, { x: 470, y: 262, w: 154, h: 52, label: 'Progressing', sub: 'True', tone: 'ok' });
        return { r, bars, cond };
      },
      frame(s, kit, R) {
        drawRows(R.r, s);
        const old = s.old || '', nw = s.nw || '', ready = count(old, 'R') + count(nw, 'R');
        R.bars.set('ready', ready * 25, ready < 4 ? 'bad' : 'ok', String(ready));
        R.bars.set('dl', s.dl || 0, (s.dl || 0) >= 100 ? 'bad' : (s.dl || 0) > 40 ? 'warn' : 'info', (s.dl || 0) + '%');
        R.cond.set({ label: s.cond || 'Progressing', sub: s.condV || 'True', tone: s.condT || 'ok' });
      }
    },
    bug: [
      { log: 'Version 1 runs on four Ready pods. maxSurge is 1 and maxUnavailable is 0, and progressDeadlineSeconds is 600.', callout: 'v1 steady: four Ready pods', code: 0, state: { old: 'RRRR', nw: '', dl: 0, r: 'v1' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'deadline', v: '600 s' }] },
      { log: 'A new image is rolled out. The controller starts one surge pod from the new ReplicaSet, as in a normal update.', callout: 'The first v2 pod starts', code: 0, state: { old: 'RRRR', nw: 'S', dl: 5, r: 'v2 starting' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'v2 pods', v: '1 starting' }] },
      { log: 'The v2 container crashes on start (a bad config key), so the kubelet restarts it with back-off. The pod never passes readiness.', callout: 'The v2 container crashes: CrashLoopBackOff', code: 0, state: { old: 'RRRR', nw: 'C', dl: 30, r: 'v2 crashing' }, stats: [{ l: 'v2 Ready', v: '0', cls: 'bad' }, { l: 'deadline used', v: '30%' }] },
      { log: 'The Ready gate holds. With maxUnavailable 0, no old pod may be removed until a new one is Ready, so all four v1 pods keep serving and users see no change.', callout: 'The Ready gate keeps all 4 old pods serving', code: 1, state: { old: 'RRRR', nw: 'C', dl: 60, r: 'rollout waits' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'rollout', v: 'waiting', cls: 'warn' }] },
      { log: 'After progressDeadlineSeconds (600 by default) with no progress, the Deployment gets the condition Progressing=False, reason ProgressDeadlineExceeded. kubectl rollout status exits with an error. Nothing rolls back by itself.', callout: 'ProgressDeadlineExceeded: reported, not undone', moment: true, code: 2, state: { old: 'RRRR', nw: 'C', dl: 100, cond: 'Progressing', condV: 'False: deadline', condT: 'warn', r: 'deadline exceeded' }, stats: [{ l: 'condition', v: 'False', cls: 'bad' }, { l: 'Ready', v: '4', cls: 'ok' }] },
      { log: 'The fix is to undo. kubectl rollout undo puts the previous template back. It matches the old ReplicaSet, which still has 4 pods, so only the new ReplicaSet has to shrink.', callout: 'rollout undo: the old template matches again', code: 3, state: { old: 'RRRR', nw: 'T', dl: 100, cond: 'Progressing', condV: 'True', condT: 'ok', r: 'undo' }, stats: [{ l: 'template', v: 'v1', cls: 'ok' }, { l: 'v2 pods', v: 'terminating' }] },
      { log: 'The Deployment is back on v1 with 4 Ready pods and the failed ReplicaSet at 0. Fix the config, then roll out v2 again.', callout: 'Back on v1: the broken RS scaled to 0', code: 3, state: { old: 'RRRR', nw: '', dl: 0, r: 'v1 restored' }, stats: [{ l: 'Ready', v: '4', cls: 'ok' }, { l: 'downtime', v: 'none', cls: 'ok' }],
        takeaway: 'A bad version stalls at the Ready gate while the old pods keep serving. The deadline only reports it, so undo or fix forward.' }
    ],
  };

  /* ---------- 3. A capacity dip: maxUnavailable 50% on a small Deployment ---------- */
  const dip = {
    id: 'dip', label: 'Capacity dip', desc: 'With maxSurge 0 and maxUnavailable 50% on 4 replicas, two old pods go at once. Ready pods fall to 2 while the new ones start, then again at the end.',
    codeLabel: 'Config',
    code: { bug: ['strategy: {rollingUpdate: {maxSurge: 0, maxUnavailable: 50%}}   # 50% of 4 = 2 pods', '# floor 2 Ready, ceiling 4 pods: remove 2 old pods immediately', 'strategy: {rollingUpdate: {maxSurge: 1, maxUnavailable: 0}}', 'kubectl rollout status deploy/web'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · replicas 4', right: s.r || '' }),
      setup(kit) {
        const r = rows(kit);
        const bars = kit.bars(null, { x: 40, y: 270, w: 400, labelW: 110, rowH: 28, items: [{ id: 'ready', label: 'Ready pods' }, { id: 'load', label: 'load per pod' }], max: 100, unit: '%', title: 'capacity (illustrative)' });
        const lim = [kit.text(null, { x: 470, y: 284, t: '', cls: 'kt xs' }), kit.text(null, { x: 470, y: 312, t: '', cls: 'kt xs' })];
        return { r, bars, lim };
      },
      frame(s, kit, R) {
        drawRows(R.r, s);
        const old = s.old || '', nw = s.nw || '', ready = Math.max(1, count(old, 'R') + count(nw, 'R'));
        const load = Math.round(400 / ready);
        R.bars.set('ready', ready * 25, ready < 4 ? 'bad' : 'ok', String(ready));
        R.bars.set('load', Math.min(100, load / 2), load > 100 ? 'bad' : 'ok', load + '%');
        R.lim[0].set('floor: ' + (s.floor || 2) + ' Ready'); R.lim[1].set('ceiling: ' + (s.ceil || 4) + ' pods');
      }
    },
    bug: [
      { log: 'To finish faster, a team sets maxSurge 0 and maxUnavailable 50% on a 4-replica Deployment. The percentage is rounded down, so 50% of 4 is 2 pods.', callout: 'maxUnavailable 50% of 4 pods = 2', code: 0, state: { old: 'RRRR', nw: '', floor: 2, ceil: 4, r: 'v1 steady' }, stats: [{ l: 'floor', v: '2 Ready', cls: 'warn' }, { l: 'ceiling', v: '4 pods' }] },
      { log: 'The new template creates a new ReplicaSet. With no surge allowed, the only way to make room for a new pod is to remove old ones first.', callout: 'No surge: old pods must go first', code: 1, state: { old: 'RRRR', nw: '', floor: 2, ceil: 4, r: 'RS created' }, stats: [{ l: 'surge room', v: '0', cls: 'warn' }, { l: 'removable', v: '2 pods' }] },
      { log: 'The controller terminates two old pods at once. Ready pods drop from 4 to 2, which is exactly what the setting allows.', callout: 'Two old pods go at once: Ready drops to 2', moment: true, code: 1, state: { old: 'RRTT', nw: '', floor: 2, ceil: 4, r: 'Ready 2' }, stats: [{ l: 'Ready', v: '2', cls: 'bad' }, { l: 'load per pod', v: '200%', cls: 'bad' }] },
      { log: 'Two new pods start but need about 40 s to become Ready (illustrative). During that time two pods carry all the traffic, so latency triples at the busiest hour.', callout: 'About 40 s on half the capacity', code: 1, state: { old: 'RR', nw: 'SS', floor: 2, ceil: 4, r: 'new pods starting' }, stats: [{ l: 'Ready', v: '2', cls: 'bad' }, { l: 'latency', v: '~3x', cls: 'bad' }] },
      { log: 'The new pods become Ready, so 4 pods are Ready for a moment. Now the controller may remove the two remaining old pods, and the next two new pods have to start.', callout: 'Ready again 4, then the second dip begins', code: 1, state: { old: 'TT', nw: 'RRSS', floor: 2, ceil: 4, r: 'second dip' }, stats: [{ l: 'Ready', v: '2', cls: 'bad' }, { l: 'dips so far', v: '2', cls: 'bad' }] },
      { log: 'All four new pods are Ready and the update is finished, after two periods of half capacity.', callout: 'Finished, after two dips', code: 3, state: { old: '', nw: 'RRRR', floor: 2, ceil: 4, r: 'v2 steady' }, stats: [{ l: 'min Ready', v: '2', cls: 'bad' }, { l: 'rollout', v: 'done' }] },
      { log: 'The fix is the conservative setting: maxSurge 1 and maxUnavailable 0. It needs room for one extra pod and takes longer, but Ready pods never fall below 4.', callout: 'maxSurge 1, maxUnavailable 0: floor stays 4', code: 2, state: { old: 'RRRT', nw: 'R', floor: 4, ceil: 5, r: 'safe settings' }, stats: [{ l: 'min Ready', v: '4', cls: 'ok' }, { l: 'extra pods', v: '1' }],
        takeaway: 'Percentages round on small fleets, and 50% of 4 halves the service. Surge first and keep maxUnavailable at 0 when latency matters.' }
    ],
  };

  const flow = KH.flow(['New spec.template|new pod-template hash', '*New ReplicaSet|created at 0', 'Scale new up|within maxSurge', 'Wait for Ready|available pods only', 'Scale old down|within maxUnavailable'], 'Flow: the Deployment controller moves replicas between two ReplicaSets and counts only Ready pods.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[8] = { explain: `
<h3>1. Replace pods without going dark</h3>
<p>A rolling update swaps a running version for a new one without dropping below a safe capacity. The Deployment does this by giving the new version its own ReplicaSet and moving replicas from the old ReplicaSet to the new one in bounded steps. Readiness decides how far it may go, because only Ready pods count as available.</p>
${flow}

<h3>2. Two ReplicaSets and a hash</h3>
<p>A change to <code>spec.template</code> produces a new <code>pod-template-hash</code>, so the Deployment creates a new ReplicaSet. The old one is kept at zero replicas, up to <code>revisionHistoryLimit</code> of them (default 10), which is what makes <code>kubectl rollout undo</code> cheap. Changes outside the template, such as the replica count, do not create a ReplicaSet.</p>

<h3>3. The two bounds</h3>
<p>At each step two rules apply. The total number of pods may not exceed <code>replicas + maxSurge</code>. The number of available pods may not fall below <code>replicas - maxUnavailable</code>. Both default to 25%. A percentage for <code>maxSurge</code> rounds up and a percentage for <code>maxUnavailable</code> rounds down, and the two cannot both be zero, since then nothing could move. The first scene runs with maxSurge 1 and maxUnavailable 0: surge one new pod, wait until it is Ready, retire one old pod, and repeat. A pod that is starting does not count as available, and neither does a terminating one. <code>minReadySeconds</code>, if set, adds a delay after Ready before a pod counts.</p>

<h3>4. When the new version never becomes Ready</h3>
<p>If the new pods crash or fail readiness, the Ready gate stops the controller from removing old pods, so users keep being served by the old version. That is the good news. The bad news is that the rollout simply waits. After <code>progressDeadlineSeconds</code>, default 600, the Deployment gets <code>Progressing=False</code> with reason <code>ProgressDeadlineExceeded</code>, and <code>kubectl rollout status</code> exits with an error. The controller does not roll back. You run <code>kubectl rollout undo</code> or push a fixed version, and the second scene shows the old ReplicaSet being reused. The deadline is only a report, so a CI step that waits on <code>rollout status</code> is what turns it into a failed pipeline.</p>

<h3>5. Percentages and small fleets</h3>
<p>The third scene shows how a convenient setting hurts. On a 4-replica Deployment with <code>maxSurge: 0</code> and <code>maxUnavailable: 50%</code>, two old pods are removed at once, and half the capacity is missing until the new pods are Ready, then again for the next pair. The same percentages on 100 replicas behave very differently, so choose absolute numbers for small services. Surge needs room in the cluster for the extra pods, so a full cluster can stall a surge-based update with Pending pods.</p>

<h3>6. The trade-off</h3>
<p>Small bounds keep capacity high but make rollouts slow and need spare room for surge pods. Large bounds finish fast and remove the same share of capacity. Use <code>maxUnavailable: 0</code> with <code>maxSurge: 1</code>, or a percentage of 25% for large fleets, when latency matters. Pair every Deployment with a readiness probe, because without one a new pod counts as available the moment its container starts, and the rollout can retire healthy pods for broken ones.</p>

<h3>7. Syntax</h3>
<pre>kubectl set image deploy/web web=web:v2
kubectl rollout status deploy/web
kubectl rollout history deploy/web
kubectl rollout undo deploy/web [--to-revision=3]
kubectl get rs -l app=web

spec:
  replicas: 4
  progressDeadlineSeconds: 600
  minReadySeconds: 5
  strategy:
    type: RollingUpdate
    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}</pre>
<p>The Deployment <code>spec.selector</code> cannot be changed after creation. An edited selector is rejected with a <i>field is immutable</i> error, so create a new Deployment with a new name instead.</p>`, scenarios: [safe, stuck, dip] };
})();
