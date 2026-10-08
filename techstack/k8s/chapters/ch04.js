/* Chapter 4 "Scheduler: Filter, Score, Bind": a node funnel, requests vs usage and anti-affinity columns (index 4).
   Loads after course.js and scene-tools.js. Node sizes and counts are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified cluster. Node sizes, requests and counts are illustrative.';

  /* ---------- 1. Filter funnel: six nodes, three filters, one Pending pod ---------- */
  const NODES = [
    { id: 'n1', disk: 'hdd', cap: 4, req: 3.9 }, { id: 'n2', disk: 'ssd', cap: 4, req: 3.9 }, { id: 'n3', disk: 'ssd', cap: 8, req: 2, taint: 'dedicated=search' },
    { id: 'n4', disk: 'hdd', cap: 8, req: 3 }, { id: 'n5', disk: 'hdd', cap: 8, req: 1 }, { id: 'n6', disk: 'ssd', cap: 8, req: 7.9 }
  ];
  const TX = i => 16 + (i % 3) * 208, TY = i => 76 + Math.floor(i / 3) * 84;
  /* the first failing filter in plugin order wins: taint, then selector, then resources */
  const REASON = n => (n.taint ? 'taint' : n.disk !== 'ssd' ? 'sel' : n.req + 0.2 > n.cap ? 'cpu' : 'ok');
  const filter = {
    id: 'filter', label: 'Filter: why Pending', desc: 'The indexer pod asks for 200m CPU on an SSD node. Each node is dropped by the first filter that rejects it, and the counts in the event add up to the node count.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl describe pod indexer-0', 'Warning  FailedScheduling  0/6 nodes are available: 1 node(s) had untolerated taint {dedicated: search}, 3 node(s) didn\'t match Pod\'s node affinity/selector, 2 Insufficient cpu.', '# add the toleration to the pod template, then:', '$ kubectl get pod indexer-0 -o wide     # NODE n3'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'indexer · 200m CPU · disk=ssd', right: s.r || '' }),
      setup(kit) {
        const tiles = NODES.map((n, i) => kit.chip(null, { x: TX(i), y: TY(i), w: 192, h: 54, label: n.id + ' · disk=' + n.disk, sub: 'requests ' + n.req + ' / ' + n.cap + ' CPU', tone: 'info' }));
        const bars = NODES.map((n, i) => {
          const t = kit.el('rect', { x: TX(i), y: TY(i) + 58, width: 192, height: 7, rx: 3 }, kit.layer); t.style.fill = 'var(--soft)'; t.style.stroke = 'var(--line)';
          const f = kit.el('rect', { x: TX(i), y: TY(i) + 58, width: 192 * n.req / n.cap, height: 7, rx: 3 }, kit.layer); f.style.fill = n.req / n.cap > 0.9 ? 'var(--warn)' : 'var(--acc)';
          return f;
        });
        const pod = kit.chip(null, { x: 16, y: 248, w: 300, h: 40, label: 'indexer-0 · 200m CPU', sub: 'nodeSelector disk=ssd', tone: 'cursor' });
        const tol = kit.chip(null, { x: 332, y: 248, w: 292, h: 40, label: 'toleration', sub: 'none', tone: 'info' });
        const ev = ['', '', ''].map((_, i) => kit.text(null, { x: 16, y: 308 + i * 14, t: '', cls: 'kt xs' }));
        return { tiles, bars, pod, tol, ev };
      },
      frame(s, kit, R) {
        const stage = s.stage || 0, tol = !!s.tol;
        R.tiles.forEach((c, i) => {
          const n = NODES[i], why = tol && n.taint ? (n.req + 0.2 > n.cap ? 'cpu' : 'ok') : REASON(n);
          let tone = 'info', sub = 'requests ' + n.req + ' / ' + n.cap + ' CPU';
          if (stage >= 1 && why === 'taint') { tone = 'delete'; sub = 'untolerated taint'; }
          if (stage >= 2 && why === 'sel') { tone = 'delete'; sub = 'selector mismatch'; }
          if (stage >= 3 && why === 'cpu') { tone = 'delete'; sub = 'Insufficient cpu'; }
          if (stage >= 3 && why === 'ok') { tone = s.bound ? 'ok' : 'live'; sub = s.bound ? 'bound: requests ' + (n.req + 0.2).toFixed(1) + ' / ' + n.cap : 'feasible'; }
          if (stage === 1 && tol && n.taint) { tone = 'live'; sub = 'toleration matches'; }
          c.set({ tone, sub, hl: stage >= 3 && why === 'ok' });
        });
        R.pod.set({ tone: s.pending ? 'warn' : s.bound ? 'ok' : 'cursor', sub: s.bound ? 'spec.nodeName = n3' : s.pending ? 'Pending' : 'nodeSelector disk=ssd' });
        R.tol.set({ sub: tol ? 'dedicated=search:NoSchedule' : 'none', tone: tol ? 'cursor' : 'info', hl: tol && stage === 1 });
        const lines = s.pending ? ['0/6 nodes are available: 1 node(s) had untolerated taint {dedicated: search},', '3 node(s) didn\'t match Pod\'s node affinity/selector, 2 Insufficient cpu.', 'counts: 1 + 3 + 2 = 6 nodes (representative wording)'] : ['', '', ''];
        R.ev.forEach((t, i) => t.set(lines[i]));
      }
    },
    bug: [
      { log: 'The indexer pod is waiting in the scheduling queue with no node. It asks for 200m CPU and has a nodeSelector for disk=ssd. Six nodes are candidates.', callout: 'Six candidate nodes, one pod in the queue', code: 0, state: { stage: 0, r: 'queue' }, stats: [{ l: 'candidates', v: '6' }, { l: 'pod CPU', v: '200m' }] },
      { log: 'Filter plugins run in order. TaintToleration comes first: n3 carries the taint dedicated=search, the pod has no toleration, so n3 is dropped.', callout: 'TaintToleration drops n3', code: 1, state: { stage: 1, r: 'taint filter' }, stats: [{ l: 'candidates left', v: '5', cls: 'warn' }, { l: 'dropped', v: '1' }] },
      { log: 'NodeAffinity checks the nodeSelector. Nodes n1, n4 and n5 do not carry disk=ssd, so all three are dropped.', callout: 'The nodeSelector drops n1, n4 and n5', code: 1, state: { stage: 2, r: 'selector filter' }, stats: [{ l: 'candidates left', v: '2', cls: 'warn' }, { l: 'dropped', v: '4' }] },
      { log: 'NodeResourcesFit adds the pod request to the requests already on each node. n2 would reach 4.1 of 4 and n6 would reach 8.1 of 8, so both are dropped, even if their real CPU usage is low.', callout: 'NodeResourcesFit counts requests: n2 and n6 are full', code: 1, state: { stage: 3, r: 'resource filter' }, stats: [{ l: 'candidates left', v: '0', cls: 'bad' }, { l: 'dropped', v: '6' }] },
      { log: 'No node survives, so the pod stays Pending. The event lists one count per reason, and the counts add up to the six nodes.', callout: 'No feasible node: Pending, with per-reason counts', moment: true, code: 1, state: { stage: 3, pending: true, r: 'Pending' }, stats: [{ l: 'reasons', v: '1 + 3 + 2 = 6', cls: 'warn' }, { l: 'pod', v: 'Pending', cls: 'bad' }] },
      { log: 'The fix is to give the pod the toleration for dedicated=search. The pod is requeued and runs the filters again, now with the taint accepted.', callout: 'Add the toleration and the pod is retried', code: 2, state: { stage: 1, tol: true, r: 'toleration added' }, stats: [{ l: 'toleration', v: 'added', cls: 'ok' }, { l: 'candidates left', v: '6' }] },
      { log: 'Only n3 passes every filter: it has disk=ssd, accepts the taint and has 6 CPU unrequested. With one feasible node the scheduler binds the pod to n3.', callout: 'One feasible node: bind writes nodeName = n3', code: 3, state: { stage: 3, tol: true, bound: true, r: 'bound to n3' }, stats: [{ l: 'node', v: 'n3', cls: 'ok' }, { l: 'pod', v: 'bound', cls: 'ok' }],
        takeaway: 'Each node is dropped by the first filter that rejects it. Read the per-reason counts in the event to see which rule to change.' }
    ],
  };

  /* ---------- 2. Requests, not usage ---------- */
  const IDLE = [{ id: 'n1', req: 98, use: 22 }, { id: 'n2', req: 95, use: 28 }, { id: 'n3', req: 97, use: 24 }, { id: 'n4', req: 96, use: 26 }];
  const idle = {
    id: 'requests', label: 'Requests, not usage', desc: 'Dashboards show a quarter of the CPU in use, yet new pods are Pending. The scheduler adds up requests, and copied templates ask for far more than the pods use.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl top nodes                 # CPU(cores) 1.0 of 4 used', '$ kubectl describe node n1 | grep -A6 Allocated', '  cpu   3900m (97%)  # requests, not usage', '# set requests near the measured p95, then re-apply'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: '4 nodes · 4 CPU each', right: s.r || '' }),
      setup(kit) {
        const rq = kit.bars(null, { x: 16, y: 100, w: 292, labelW: 30, rowH: 28, items: IDLE.map(n => ({ id: n.id, label: n.id })), max: 100, unit: '%', title: 'CPU requested (what the scheduler sees)' });
        const us = kit.bars(null, { x: 332, y: 100, w: 292, labelW: 30, rowH: 28, items: IDLE.map(n => ({ id: n.id, label: n.id })), max: 100, unit: '%', title: 'CPU really used (what dashboards show)' });
        const pod = kit.chip(null, { x: 16, y: 230, w: 250, h: 44, label: 'new pod · 200m CPU', sub: 'waiting', tone: 'cursor' });
        const res = kit.chip(null, { x: 290, y: 230, w: 334, h: 44, label: '', sub: '', tone: 'info', show: false });
        const t = kit.chip(null, { x: 16, y: 288, w: 608, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { rq, us, pod, res, t };
      },
      frame(s, kit, R) {
        const k = s.req == null ? 1 : s.req;
        IDLE.forEach(n => {
          const r = Math.round(n.req * k), tone = r >= 90 ? 'bad' : r >= 60 ? 'warn' : 'ok';
          R.rq.set(n.id, s.hideReq ? 0 : r, tone, s.hideReq ? '' : r + '%'); R.us.set(n.id, n.use, 'ok', n.use + '%');
        });
        R.pod.set({ sub: s.bound ? 'bound to n2' : s.pend ? 'Pending' : 'waiting', tone: s.bound ? 'ok' : s.pend ? 'warn' : 'cursor' });
        R.res.set({ show: !!s.msg, label: s.msg || '', sub: '', tone: s.bound ? 'ok' : 'warn', w: 334 });
        R.t.set({ show: !!s.note, label: s.note || '', sub: '', tone: 'info', w: 608 });
      }
    },
    bug: [
      { log: 'The dashboard shows about a quarter of the CPU in use on every node (illustrative). It looks like there is plenty of room.', callout: 'Real usage: about 25% on every node', code: 0, state: { hideReq: true, r: 'what dashboards show' }, stats: [{ l: 'avg CPU used', v: '25%', cls: 'ok' }, { l: 'nodes', v: '4' }] },
      { log: 'The Deployments were copied from a template that asks for 2 CPU per pod, but each pod really uses about 0.4. The scheduler reserves what is requested, so the nodes look 95% allocated.', callout: 'Requests reserve 95% of every node', code: 1, state: { r: 'what the scheduler sees' }, stats: [{ l: 'requested', v: '~96%', cls: 'bad' }, { l: 'used', v: '~25%', cls: 'ok' }] },
      { log: 'A new pod asks for 200m. The scheduler adds it to the requests already on each node: 3.9 + 0.2 is more than 4, on every node.', callout: 'Every node: requests + 0.2 exceeds 4 CPU', moment: true, code: 2, state: { pend: true, msg: '0/4 nodes: 4 Insufficient cpu', r: 'Pending' }, stats: [{ l: 'pod', v: 'Pending', cls: 'bad' }, { l: 'reason', v: '4 Insufficient cpu', cls: 'warn' }] },
      { log: 'The cluster is idle but full. If a cluster autoscaler is on, this Pending pod would even trigger a new node, and you would pay for capacity nobody uses.', callout: 'Idle but full: a new node would be bought for nothing', code: 2, state: { pend: true, msg: '0/4 nodes: 4 Insufficient cpu', note: 'autoscaler sees a Pending pod and adds a node', r: 'Pending' }, stats: [{ l: 'wasted CPU', v: '~70%', cls: 'bad' }, { l: 'new nodes', v: '+1', cls: 'warn' }] },
      { log: 'The fix is to measure real usage and set requests near the 95th percentile, for example 0.6 CPU per pod. The reservation drops.', callout: 'Right-size requests to measured usage', code: 3, state: { req: 0.35, r: 'requests 0.6 CPU' }, stats: [{ l: 'requested', v: '~34%', cls: 'ok' }, { l: 'used', v: '~25%', cls: 'ok' }] },
      { log: 'The pod fits again. The scheduler scores the feasible nodes and prefers the least allocated one, so it binds to n2.', callout: 'The pod fits and binds to the least allocated node', code: 3, state: { req: 0.35, bound: true, msg: 'Score: n2 is least allocated', r: 'bound' }, stats: [{ l: 'pod', v: 'bound', cls: 'ok' }, { l: 'node', v: 'n2', cls: 'ok' }],
        takeaway: 'The scheduler adds requests, not real usage. Set requests near measured use so the cluster is neither full nor idle.' }
    ],
  };

  /* ---------- 3. Required anti-affinity vs topology spread ---------- */
  const NX = i => 16 + i * 154;
  const spread = {
    id: 'spread', label: 'Anti-affinity vs spread', desc: 'Required pod anti-affinity allows one replica per node, so replica 5 on 4 nodes never schedules. A topology spread constraint allows a bounded skew instead.',
    codeLabel: 'Config',
    code: { bug: ['affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution:', '  topologyKey: kubernetes.io/hostname      # one web pod per node', '0/4 nodes are available: 4 node(s) didn\'t match pod anti-affinity rules.', 'topologySpreadConstraints: [{maxSkew: 1, topologyKey: kubernetes.io/hostname, whenUnsatisfiable: DoNotSchedule}]'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · 4 nodes', right: s.r || '' }),
      setup(kit) {
        const nodes = [0, 1, 2, 3].map(i => kit.chip(null, { x: NX(i), y: 78, w: 146, h: 40, label: 'node-' + (i + 1), sub: '0 pods', tone: 'info' }));
        const pods = [0, 1, 2, 3, 4].map(i => kit.chip(null, { x: NX(i % 4), y: 130 + Math.floor(i / 4) * 48, w: 146, h: 40, label: 'web-' + i, sub: 'Running', tone: 'ok', show: false }));
        const rule = kit.chip(null, { x: 16, y: 240, w: 608, h: 40, label: '', sub: '', tone: 'info' });
        const ev = kit.chip(null, { x: 16, y: 290, w: 608, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { nodes, pods, rule, ev };
      },
      frame(s, kit, R) {
        const n = s.n || 0, count = s.count || [0, 0, 0, 0];
        R.nodes.forEach((c, i) => c.set({ sub: count[i] + (count[i] === 1 ? ' pod' : ' pods'), tone: s.skew && count[i] === 2 ? 'warn' : 'info' }));
        const shown = s.pods || 0;
        R.pods.forEach((c, i) => c.set({ show: i < shown, tone: s.pend && i === 4 ? 'warn' : 'ok', sub: s.pend && i === 4 ? 'Pending' : 'Running', x: NX(i === 4 ? (s.p5 == null ? 0 : s.p5) : i % 4), y: 130 + (i === 4 && !s.pend ? 48 : i === 4 ? 48 : 0) }));
        R.rule.set({ label: s.rule || '', sub: '', tone: s.ruleT || 'info', w: 608 });
        R.ev.set({ show: !!s.ev, label: s.ev || '', tone: s.evT || 'warn', w: 608 });
      }
    },
    bug: [
      { log: 'Deployment web has 4 replicas and a required pod anti-affinity rule on the hostname: no two web pods may share a node. There are 4 nodes.', callout: 'Rule: at most one web pod per node', code: 0, state: { count: [0, 0, 0, 0], pods: 0, rule: 'required anti-affinity, topologyKey hostname', r: 'replicas 4' }, stats: [{ l: 'replicas', v: '4' }, { l: 'nodes', v: '4' }] },
      { log: 'Each replica finds a node without a web pod, so the four pods spread one to a node.', callout: 'Four replicas fit one per node', code: 1, state: { count: [1, 1, 1, 1], pods: 4, rule: 'required anti-affinity, topologyKey hostname', r: '4 / 4 Running' }, stats: [{ l: 'Running', v: '4 / 4', cls: 'ok' }, { l: 'per node', v: '1' }] },
      { log: 'The team scales to 5 replicas. Pod web-4 needs a node with no web pod, and all four nodes already have one.', callout: 'Replica 5 has nowhere to go', moment: true, code: 2, state: { count: [1, 1, 1, 1], pods: 5, pend: true, p5: 3, rule: 'replicas 5 on 4 nodes', ev: '0/4 nodes are available: 4 node(s) didn\'t match pod anti-affinity rules.', r: 'web-4 Pending' }, stats: [{ l: 'Pending', v: '1', cls: 'bad' }, { l: 'filter', v: 'anti-affinity', cls: 'warn' }] },
      { log: 'A hard rule can only remove nodes. With more replicas than nodes the pod stays Pending forever, however much free CPU the nodes have.', callout: 'A required rule never relaxes by itself', code: 2, state: { count: [1, 1, 1, 1], pods: 5, pend: true, p5: 3, rule: 'free CPU does not help: the rule removed every node', ev: '0/4 nodes are available: 4 node(s) didn\'t match pod anti-affinity rules.', r: 'still Pending' }, stats: [{ l: 'free CPU', v: 'plenty', cls: 'ok' }, { l: 'schedulable nodes', v: '0', cls: 'bad' }] },
      { log: 'The fix is a topology spread constraint with maxSkew 1. It does not forbid sharing a node, it only bounds the difference between the busiest and the emptiest node.', callout: 'Replace the hard rule with maxSkew 1', code: 3, state: { count: [1, 1, 1, 1], pods: 4, rule: 'topologySpreadConstraints: maxSkew 1, DoNotSchedule', ruleT: 'cursor', r: 'spread rule' }, stats: [{ l: 'max skew', v: '1', cls: 'ok' }, { l: 'rule', v: 'spread' }] },
      { log: 'Replica 5 can now share node-1: the counts become 2, 1, 1, 1, so the skew is 1, which is within the limit. All five pods run.', callout: 'Replica 5 shares node-1: skew 1 is allowed', code: 3, state: { count: [2, 1, 1, 1], pods: 5, p5: 0, skew: true, rule: 'counts 2, 1, 1, 1: skew = 2 - 1 = 1', ruleT: 'cursor', r: '5 / 5 Running' }, stats: [{ l: 'Running', v: '5 / 5', cls: 'ok' }, { l: 'max skew', v: '1', cls: 'ok' }],
        takeaway: 'A required rule removes nodes and can leave a pod Pending. A spread constraint bounds the imbalance and still schedules.' }
    ],
  };

  const flow = KH.flow(['Pod in queue|no nodeName', '*Filter|drop nodes that cannot run it', 'Score|rank the rest', 'Bind|write spec.nodeName', 'Kubelet|starts the pod'], 'Flow: filters only remove nodes, scores only rank what is left, and bind records the choice.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[4] = { explain: `
<h3>1. Placement is a constraint problem</h3>
<p>The scheduler is one more control loop. It watches for Pods whose <code>spec.nodeName</code> is empty, picks a node for each, and writes the choice back. It does not start containers. Only some nodes can run a given Pod, and among those the scheduler should keep the cluster balanced, so it works in three stages: filter, score, bind.</p>
${flow}

<h3>2. Filter: every rule only removes nodes</h3>
<p>Filter plugins run in a fixed order, and the first plugin that rejects a node is the reason it is dropped. <code>TaintToleration</code> removes nodes whose taints the Pod does not tolerate. <code>NodeAffinity</code> checks <code>nodeSelector</code> and node affinity. <code>NodeResourcesFit</code> compares the Pod's requests with the node's allocatable capacity minus the requests already placed there. <code>InterPodAffinity</code> and <code>PodTopologySpread</code> look at the other Pods. If every node is removed, the Pod stays Pending and the event reports one count per reason, for example <i>0/6 nodes are available: 1 node(s) had untolerated taint, 3 node(s) didn't match Pod's node affinity/selector, 2 Insufficient cpu</i>. Those counts add up to the number of nodes, because each node is counted once, under the first filter that rejected it.</p>

<h3>3. Requests, not usage</h3>
<p><code>NodeResourcesFit</code> never looks at live CPU. It sums <code>resources.requests</code> of the Pods already on a node. That makes placement predictable and protects neighbours, and it explains the "idle but full" cluster in the second scene: requests copied from a template reserve capacity that the Pods never use. Measure real usage over time, set requests near a high percentile, and keep limits for protection, not for sizing. A node's allocatable capacity is also lower than its raw size, because the kubelet and system reserve some of it.</p>

<h3>4. Score and bind</h3>
<p>Feasible nodes are scored by plugins. By default the scheduler favours less-allocated nodes and balanced CPU and memory use, and it adds image locality, preferred affinity and topology spread. In a large cluster it may score only a fraction of the feasible nodes to stay fast (<code>percentageOfNodesToScore</code>). The best score wins, ties are broken at random, and the scheduler writes a Binding that sets <code>spec.nodeName</code>. From then on the kubelet on that node owns the Pod.</p>

<h3>5. Spreading replicas</h3>
<p>Required pod anti-affinity says "never" and a preferred rule says "try". With a required rule, a Deployment with more replicas than nodes leaves the extra Pods Pending forever. <code>topologySpreadConstraints</code> is usually a better tool: <code>maxSkew</code> bounds the difference in Pod count between the busiest and the emptiest domain, <code>topologyKey</code> picks the domain (node, zone), and <code>whenUnsatisfiable</code> chooses between <code>DoNotSchedule</code> and <code>ScheduleAnyway</code>. The third scene shows a fifth replica fitting once the hard rule is replaced.</p>

<h3>6. The trade-off</h3>
<p>Every hard constraint makes the cluster safer and the scheduling problem smaller. Too many hard constraints, such as a nodeSelector, a taint and a required anti-affinity together, can leave a Pod with nowhere to go. The remedy is almost never "more nodes". Read the per-reason counts in the event, change the one rule that removed the nodes, and verify with <code>kubectl get pod -o wide</code>.</p>

<h3>7. Syntax</h3>
<pre>kubectl describe pod indexer-0                 # Events: FailedScheduling, counts per reason
kubectl describe node n1 | grep -A8 Allocated  # requests per node, not usage
kubectl top nodes                              # live usage (metrics-server)
kubectl taint nodes n3 dedicated=search:NoSchedule

tolerations:
- key: dedicated
  operator: Equal
  value: search
  effect: NoSchedule
topologySpreadConstraints:
- maxSkew: 1
  topologyKey: kubernetes.io/hostname
  whenUnsatisfiable: DoNotSchedule
  labelSelector: {matchLabels: {app: web}}</pre>
<p>The text of the FailedScheduling message varies a little between versions, but the shape is always the node count followed by one count per reason.</p>`, scenarios: [filter, idle, spread] };
})();
