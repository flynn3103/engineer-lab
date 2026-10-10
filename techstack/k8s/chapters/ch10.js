/* Chapter 10 "Node Failure and Self-Healing": a heartbeat-to-eviction timeline, a drain blocked by a budget and zone spread (index 10).
   Loads after course.js and scene-tools.js. Times and counts are illustrative; the defaults named are for recent Kubernetes versions. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Times and counts are illustrative.';

  /* ---------- 1. Silence to eviction: heartbeat, taint, 300 s of patience ---------- */
  const T = {
    plain: [
      ['ok', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn'],
      ['none', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'bad', 'info', 'ok', 'ok'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'bad', 'bad', 'bad', 'bad']
    ],
    done: [
      ['ok', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn'],
      ['none', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'bad', 'info', 'ok', 'ok'],
      ['ok', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'bad', 'bad', 'info', 'ok']
    ]
  };
  const kill = {
    id: 'kill', label: 'Node loses power', desc: 'node-7 stops heartbeating. The cluster waits, taints the node, waits again, and only then evicts. The Deployment pod is replaced after about 340 s; the StatefulSet pod waits for a human.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl get lease -n kube-node-lease node-7        # renewTime stops advancing', '$ kubectl describe node node-7 | grep -A2 Taints', 'Taints: node.kubernetes.io/unreachable:NoExecute', '$ kubectl taint nodes node-7 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute'] },
    stage: {
      w: W, h: H, footer: 'Simplified. One column = 40 s. Defaults vary a little by version.',
      header: s => ({ left: 'node-7 power loss at 0 s', right: s.r || '' }),
      setup(kit) {
        const L = KH.lanes(kit, { defs: [{ label: 'lease', y: 84 }, { label: 'node', y: 118 }, { label: 'taint', y: 152 }, { label: 'web pod', y: 186 }, { label: 'db-1 pod', y: 220 }], axisY: 262, n: 12, per: 40, every: 2 });
        kit.text(null, { x: 16, y: 284, t: 'green fine · amber tolerated · red evicted or stuck · blue starting · grey silent', cls: 'kt xs mut' });
        const note = kit.chip(null, { x: 16, y: 296, w: 400, h: 32, label: '', sub: '', tone: 'info', show: false, small: true });
        return { L, note };
      },
      frame(s, kit, R) {
        R.L.paint(T[s.mode || 'plain'], s.t == null ? 0 : s.t);
        R.note.set({ show: !!s.note, label: s.note || '', tone: s.noteT || 'info', w: 400 });
      }
    },
    bug: [
      { log: 'Every kubelet renews a Lease object in the kube-node-lease namespace about every 10 s. That renewal is the heartbeat the control plane watches.', callout: 'A Lease renewal about every 10 s is the heartbeat', code: 0, state: { t: 1, r: 'healthy' }, stats: [{ l: 'node-7', v: 'Ready', cls: 'ok' }, { l: 'lease renew', v: '~10 s' }] },
      { log: 'A rack loses power at 03:07. node-7 vanishes, with one pod of Deployment web and the StatefulSet pod db-1. The Lease stops advancing.', callout: 'Power is lost: the heartbeats stop', code: 0, state: { t: 2, r: 'silence' }, stats: [{ l: 'lease', v: 'stale', cls: 'warn' }, { l: 'pods on node', v: '2' }] },
      { log: 'After the node monitor grace period (about 40 to 50 s) the node lifecycle controller marks the node Unknown and adds the taint node.kubernetes.io/unreachable:NoExecute.', callout: 'About 40 s later: Unknown, and the taint is added', code: 1, state: { t: 3, r: 'tainted' }, stats: [{ l: 'node status', v: 'Unknown', cls: 'warn' }, { l: 'taint', v: 'unreachable', cls: 'warn' }] },
      { log: 'The taint would evict pods at once, but every pod gets a default toleration for it with tolerationSeconds 300. Pods stay assigned to the dead node for five minutes, in case it was only a network blip.', callout: 'Pods tolerate the taint for 300 s by default', moment: true, code: 2, state: { t: 6, note: 'tolerationSeconds 300: the pods wait', noteT: 'warn', r: 'waiting' }, stats: [{ l: 'capacity lost', v: '1 pod', cls: 'warn' }, { l: 'waited', v: '~200 s' }] },
      { log: 'At about 340 s after the last heartbeat (the 40 s grace plus 300 s) the toleration runs out and the taint evicts both pods.', callout: 'About 340 s: both pods are evicted', code: 2, state: { t: 9, r: 'evicted' }, stats: [{ l: 'time since loss', v: '~340 s', cls: 'warn' }, { l: 'evicted', v: '2 pods' }] },
      { log: 'The ReplicaSet sees one pod fewer than wanted and creates a replacement. The scheduler places it on a healthy node and it becomes Ready.', callout: 'The Deployment pod is replaced on another node', code: 3, state: { t: 12, r: 'web healed' }, stats: [{ l: 'web replicas', v: '3 / 3', cls: 'ok' }, { l: 'db-1', v: 'Terminating', cls: 'bad' }] },
      { log: 'The StatefulSet must never run two copies of db-1, since both would use the same identity and volume. It creates the replacement only after the old pod object is confirmed gone, and the dead kubelet cannot confirm that. db-1 stays Terminating.', callout: 'StatefulSet: at most one db-1, so it waits', code: 3, state: { t: 12, note: 'old pod cannot be confirmed gone', noteT: 'warn', r: 'db-1 stuck' }, stats: [{ l: 'db-1', v: 'Terminating', cls: 'bad' }, { l: 'safe to replace', v: 'unknown', cls: 'warn' }] },
      { log: 'An operator who has verified that the machine is really off adds the out-of-service taint. That lets the control plane remove the pod object, and the StatefulSet starts db-1 elsewhere.', callout: 'Human confirms the node is off: out-of-service taint', code: 3, state: { t: 12, mode: 'done', note: 'out-of-service taint: pod cleared, db-1 recreated', noteT: 'ok', r: 'db-1 healed' }, stats: [{ l: 'db-1', v: 'Running', cls: 'ok' }, { l: 'by', v: 'operator', cls: 'ok' }],
        takeaway: 'Silence is suspicion. The cluster waits about 340 s to evict, and a StatefulSet waits for you to confirm the node is really off.' }
    ],
  };

  /* ---------- 2. A drain blocked by a PodDisruptionBudget ---------- */
  const NX = i => 16 + i * 208;
  const pdb = {
    id: 'pdb', label: 'Drain blocked by PDB', desc: 'kubectl drain uses the Eviction API, which refuses an eviction that would break a PodDisruptionBudget. With minAvailable 3 on 3 replicas, no pod may ever be evicted.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl drain node-1 --ignore-daemonsets', 'error when evicting pods/"web-0": Cannot evict pod as it would violate the pod\'s disruption budget.', 'spec: {maxUnavailable: 1, selector: {matchLabels: {app: web}}}   # PodDisruptionBudget', '$ kubectl get pdb web   # ALLOWED DISRUPTIONS 1'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'service web · 3 replicas', right: s.r || '' }),
      setup(kit) {
        const nodes = [0, 1, 2].map(i => kit.chip(null, { x: NX(i), y: 78, w: 200, h: 40, label: 'node-' + (i + 1), sub: 'schedulable', tone: 'info' }));
        const pods = [0, 1, 2].map(i => kit.chip(null, { x: NX(i), y: 130, w: 200, h: 40, label: 'web-' + i, sub: 'Ready', tone: 'ok' }));
        const pdb = kit.chip(null, { x: 16, y: 190, w: 300, h: 48, label: 'PodDisruptionBudget', sub: 'minAvailable 3', tone: 'info' });
        const ev = kit.chip(null, { x: 332, y: 190, w: 292, h: 48, label: 'Eviction API', sub: 'idle', tone: 'info' });
        const bar = kit.bars(null, { x: 16, y: 274, w: 400, labelW: 150, rowH: 28, items: [{ id: 'ready', label: 'Ready replicas' }, { id: 'allow', label: 'disruptions allowed' }], max: 3, unit: '', title: 'budget' });
        return { nodes, pods, pdb, ev, bar };
      },
      frame(s, kit, R) {
        R.nodes.forEach((n, i) => n.set({ sub: i === 0 && s.cordon ? 'SchedulingDisabled' : 'schedulable', tone: i === 0 && s.cordon ? 'warn' : 'info' }));
        const st = s.pods || ['R', 'R', 'R'];
        R.pods.forEach((p, i) => p.set({ sub: st[i] === 'R' ? 'Ready' : st[i] === 'T' ? 'Terminating' : st[i] === 'S' ? 'starting' : '-', tone: st[i] === 'R' ? 'ok' : st[i] === 'T' ? 'delete' : 'warn', x: NX(st[i] === 'M' ? 1 : i), label: s.moved && i === 0 ? 'web-0 (new)' : 'web-' + i }));
        R.pdb.set({ sub: s.pdb || 'minAvailable 3', tone: s.pdbHl ? 'cursor' : 'info', hl: !!s.pdbHl });
        R.ev.set({ sub: s.evSub || 'idle', tone: s.evT || 'info' });
        const ready = st.filter(x => x === 'R').length, allow = s.allow == null ? 0 : s.allow;
        R.bar.set('ready', ready, ready < 2 ? 'bad' : 'ok', String(ready)); R.bar.set('allow', allow, allow ? 'ok' : 'warn', String(allow));
      }
    },
    bug: [
      { log: 'Service web has three replicas and a PodDisruptionBudget with minAvailable 3. The budget allows 0 voluntary disruptions, because all three must always be available.', callout: 'minAvailable 3 of 3: zero disruptions allowed', code: 0, state: { pods: ['R', 'R', 'R'], allow: 0, r: 'PDB: 0 allowed' }, stats: [{ l: 'replicas', v: '3 / 3', cls: 'ok' }, { l: 'allowed', v: '0', cls: 'warn' }] },
      { log: 'An upgrade starts. kubectl drain first cordons node-1, so nothing new is scheduled there, and then asks the Eviction API to evict its pods.', callout: 'drain cordons node-1 and starts evicting', code: 0, state: { cordon: true, pods: ['R', 'R', 'R'], allow: 0, evSub: 'evict web-0?', evT: 'cursor', r: 'drain' }, stats: [{ l: 'node-1', v: 'cordoned' }, { l: 'evicting', v: 'web-0' }] },
      { log: 'The Eviction API checks the budget. Evicting web-0 would leave 2 available, below the 3 required, so it refuses with HTTP 429.', callout: 'Eviction refused: it would break the budget', moment: true, code: 1, state: { cordon: true, pods: ['R', 'R', 'R'], allow: 0, pdbHl: true, evSub: '429 would violate budget', evT: 'warn', r: 'refused' }, stats: [{ l: 'status', v: '429', cls: 'bad' }, { l: 'pods moved', v: '0', cls: 'bad' }] },
      { log: 'The drain retries every few seconds and never succeeds, because nothing about the budget changes. The upgrade hangs on this node.', callout: 'drain retries forever: the budget never changes', code: 1, state: { cordon: true, pods: ['R', 'R', 'R'], allow: 0, evSub: 'retry, retry, retry', evT: 'warn', r: 'stuck' }, stats: [{ l: 'retries', v: 'many', cls: 'bad' }, { l: 'upgrade', v: 'blocked', cls: 'bad' }] },
      { log: 'The fix is a budget that leaves room to move. With maxUnavailable 1, one pod may be disrupted at a time, so the allowed disruptions become 1.', callout: 'maxUnavailable 1: one disruption allowed', code: 2, state: { cordon: true, pods: ['R', 'R', 'R'], allow: 1, pdb: 'maxUnavailable 1', pdbHl: true, evSub: 'evict web-0?', evT: 'cursor', r: 'budget fixed' }, stats: [{ l: 'allowed', v: '1', cls: 'ok' }, { l: 'Ready', v: '3 / 3', cls: 'ok' }] },
      { log: 'The eviction is accepted. web-0 terminates and the Deployment starts a replacement on node-2. While it is not Ready, the budget allows no further disruption.', callout: 'web-0 is evicted; a replacement starts elsewhere', code: 3, state: { cordon: true, pods: ['T', 'R', 'R'], allow: 0, pdb: 'maxUnavailable 1', evSub: 'accepted', evT: 'ok', r: 'one at a time' }, stats: [{ l: 'Ready', v: '2 / 3', cls: 'warn' }, { l: 'allowed', v: '0', cls: 'warn' }] },
      { log: 'The replacement becomes Ready, the budget opens again, and the drain finishes its remaining pods one by one without ever dropping the service below 2 of 3.', callout: 'The drain finishes one pod at a time', code: 3, state: { cordon: true, pods: ['R', 'R', 'R'], moved: true, allow: 1, pdb: 'maxUnavailable 1', evSub: 'node-1 drained', evT: 'ok', r: 'drained' }, stats: [{ l: 'Ready', v: '3 / 3', cls: 'ok' }, { l: 'node-1', v: 'empty', cls: 'ok' }],
        takeaway: 'A drain obeys the PodDisruptionBudget. A budget of zero allowed disruptions blocks every drain, so leave room to move one pod.' }
    ],
  };

  /* ---------- 3. One zone fails: packed replicas vs spread replicas ---------- */
  const ZX = i => 16 + i * 208;
  const slot = (z, k) => ({ x: ZX(z) + 4 + (k % 3) * 65, y: 130 + Math.floor(k / 3) * 44 });
  const zones = {
    id: 'zones', label: 'One zone fails', desc: 'Six replicas packed in one zone all vanish with it. Replicas spread across three zones lose only a third of the capacity, and the rest keeps serving.',
    codeLabel: 'Config',
    code: { bug: ['# all 6 replicas happen to land in zone a', 'topologySpreadConstraints:', '- {maxSkew: 1, topologyKey: topology.kubernetes.io/zone, whenUnsatisfiable: DoNotSchedule, labelSelector: {matchLabels: {app: web}}}', 'kubectl get pods -l app=web -o wide'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'service web · 6 replicas · 3 zones', right: s.r || '' }),
      setup(kit) {
        const z = [0, 1, 2].map(i => kit.chip(null, { x: ZX(i), y: 78, w: 200, h: 40, label: 'zone ' + 'abc'[i], sub: 'healthy', tone: 'info' }));
        const pods = Array.from({ length: 6 }, (_, i) => kit.chip(null, { x: 16, y: 134, w: 62, h: 38, label: 'web-' + i, sub: 'Ready', tone: 'ok', show: false }));
        const bar = kit.bars(null, { x: 16, y: 268, w: 400, labelW: 130, rowH: 28, items: [{ id: 'ready', label: 'Ready replicas' }], max: 6, unit: '', title: 'capacity' });
        const msg = kit.chip(null, { x: 16, y: 308, w: 400, h: 32, label: '', sub: '', tone: 'info', show: false, small: true });
        return { z, pods, bar, msg };
      },
      frame(s, kit, R) {
        const place = s.place || [0, 0, 0, 0, 0, 0], down = s.down == null ? -1 : s.down, count = [0, 0, 0];
        R.z.forEach((c, i) => c.set({ sub: i === down ? 'power lost' : 'healthy', tone: i === down ? 'delete' : 'info' }));
        let ready = 0;
        R.pods.forEach((p, i) => {
          const zi = place[i], k = count[zi]++, pos = slot(zi, k), dead = zi === down;
          if (!dead) ready++;
          p.set({ show: i < (s.n == null ? 6 : s.n), x: pos.x, y: pos.y, sub: dead ? 'down' : 'Ready', tone: dead ? 'delete' : 'ok' });
        });
        R.bar.set('ready', s.n === 0 ? 0 : ready, ready === 0 ? 'bad' : ready < 6 ? 'warn' : 'ok', String(ready));
        R.msg.set({ show: !!s.msg, label: s.msg || '', tone: s.msgT || 'info', w: 400 });
      }
    },
    bug: [
      { log: 'Six replicas of web run, but no rule spreads them, so the scheduler packed them into zone a, which had the most free room.', callout: 'All six replicas happen to sit in zone a', code: 0, state: { place: [0, 0, 0, 0, 0, 0], r: 'packed' }, stats: [{ l: 'replicas', v: '6 / 6', cls: 'ok' }, { l: 'zones used', v: '1', cls: 'warn' }] },
      { log: 'Zone a loses power. Every node in it, and every web pod on those nodes, becomes unreachable at the same moment.', callout: 'Zone a loses power', code: 0, state: { place: [0, 0, 0, 0, 0, 0], down: 0, r: 'zone a down' }, stats: [{ l: 'unreachable', v: '6 pods', cls: 'bad' }, { l: 'zone', v: 'a', cls: 'bad' }] },
      { log: 'The service has no healthy replica. The control plane needs about 340 s to evict and replace the pods, and the whole service is down for all that time.', callout: 'Zero replicas serve until pods are replaced', moment: true, code: 0, state: { place: [0, 0, 0, 0, 0, 0], down: 0, msg: 'no replica Ready for about 6 minutes', msgT: 'warn', r: 'outage' }, stats: [{ l: 'Ready', v: '0 / 6', cls: 'bad' }, { l: 'outage', v: '~6 min', cls: 'bad' }] },
      { log: 'The fix is a topology spread constraint on the zone label with maxSkew 1. The scheduler must keep the replica count per zone within one of each other.', callout: 'maxSkew 1 across zones', code: 1, state: { place: [0, 0, 1, 1, 2, 2], r: 'spread' }, stats: [{ l: 'zones used', v: '3', cls: 'ok' }, { l: 'per zone', v: '2 / 2 / 2', cls: 'ok' }] },
      { log: 'Zone a fails again. Four replicas in zones b and c are untouched and keep serving at two thirds of the capacity.', callout: 'Zone a fails: 4 of 6 replicas keep serving', code: 1, state: { place: [0, 0, 1, 1, 2, 2], down: 0, msg: 'zones b and c keep serving', msgT: 'ok', r: 'zone a down' }, stats: [{ l: 'Ready', v: '4 / 6', cls: 'warn' }, { l: 'outage', v: 'none', cls: 'ok' }] },
      { log: 'Meanwhile the usual eviction and replacement run for the two lost pods. The new pods are placed in zones b and c, within the skew limit.', callout: 'Lost pods are replaced in the healthy zones', code: 3, state: { place: [1, 2, 1, 1, 2, 2], down: 0, msg: 'skew limit holds with two zones left', msgT: 'ok', r: 'healed' }, stats: [{ l: 'Ready', v: '6 / 6', cls: 'ok' }, { l: 'zones used', v: '2' }],
        takeaway: 'Spread replicas across zones and nodes, so one failure removes a share of the capacity instead of the whole service.' }
    ],
  };

  const flow = KH.flow(['Lease|renewed about every 10 s', '*Node controller|marks Unknown after grace', 'Taint|unreachable:NoExecute', 'tolerationSeconds|300 s by default', 'Eviction|pod object deleted', 'Controller|creates a replacement'], 'Flow: silence becomes a taint, the taint becomes an eviction, and the normal controllers do the healing.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[10] = { explain: `
<h3>1. Silence is suspicion, not proof</h3>
<p>When a node stops answering, the cluster cannot tell a dead machine from a broken network. It treats silence as suspicion: it marks the node, waits, evicts the pods, and lets the ordinary replacement loops heal the workload. Nothing in this path is special: the healing is the same ReplicaSet and StatefulSet logic from earlier chapters, started by one more object, a taint.</p>
${flow}

<h3>2. Heartbeat, taint and patience</h3>
<p>Each kubelet renews a <b>Lease</b> in the <code>kube-node-lease</code> namespace about every 10 s, and that is the cheap heartbeat. When renewals stop, the node lifecycle controller waits for <code>node-monitor-grace-period</code>, about 40 to 50 s depending on the version, then marks the Node <code>Unknown</code> and adds the taint <code>node.kubernetes.io/unreachable:NoExecute</code>. A NoExecute taint evicts pods that do not tolerate it. But the <code>DefaultTolerationSeconds</code> admission plugin gives every pod a toleration for this taint with <code>tolerationSeconds: 300</code>. So the pods stay bound to the dead node for another five minutes, and the eviction comes about 340 s after the last heartbeat, as the first scene shows. Pods that must react faster can set a shorter toleration, at the risk of reacting to network blips.</p>

<h3>3. Replacement and the StatefulSet exception</h3>
<p>After the eviction, the ReplicaSet sees one pod fewer than it wants and creates a replacement, and the scheduler places it on a healthy node. A StatefulSet is stricter. Each pod has a stable identity and its own volume, and running two copies of <code>db-1</code> could corrupt data. So it creates the replacement only after the old pod object is confirmed gone, and a dead kubelet cannot confirm it. The pod stays <code>Terminating</code> or <code>Unknown</code>. An operator who has verified that the machine is really off can add <code>node.kubernetes.io/out-of-service:NoExecute</code>, which allows the control plane to remove the pods and volume attachments safely.</p>

<h3>4. Voluntary disruption: drain and budgets</h3>
<p>Planned moves, such as <code>kubectl drain</code> before an upgrade, go through the Eviction API instead of deleting pods. The API refuses an eviction that would break a <b>PodDisruptionBudget</b>, and answers 429. A budget like <code>minAvailable: 3</code> on three replicas allows zero disruptions, so the drain retries forever (second scene). Prefer <code>maxUnavailable: 1</code>, or a <code>minAvailable</code> that is lower than the replica count. A budget protects only voluntary evictions. It does nothing against a power loss.</p>

<h3>5. Spread, so one failure is a small failure</h3>
<p>None of this heals the time you lose waiting. The real protection is not to lose everything at once. Spread replicas over nodes and zones with <code>topologySpreadConstraints</code> on <code>kubernetes.io/hostname</code> and <code>topology.kubernetes.io/zone</code>, so that a failed node or zone removes a share of the capacity, as in the third scene. Run enough replicas that the survivors can carry the load, and keep an eye on the capacity left after a zone loss.</p>

<h3>6. The trade-off</h3>
<p>Waiting five to six minutes protects against false alarms, and the capacity is gone for that long. Evicting faster heals sooner and risks two copies of a pod running at once. For stateless pods that risk is acceptable, so shorten the toleration if you can. For stateful ones the safe choice is a human confirming the machine is off.</p>

<h3>7. Syntax</h3>
<pre>kubectl get nodes
kubectl describe node node-7 | grep -A3 Taints
kubectl get lease -n kube-node-lease node-7 -o jsonpath='{.spec.renewTime}'
kubectl drain node-7 --ignore-daemonsets --delete-emptydir-data
kubectl get pdb
kubectl taint nodes node-7 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute

tolerations:
- {key: node.kubernetes.io/unreachable, operator: Exists, effect: NoExecute, tolerationSeconds: 60}</pre>
<p>Remove the out-of-service taint once the node has been repaired or replaced.</p>`, scenarios: [kill, pdb, zones] };
})();
