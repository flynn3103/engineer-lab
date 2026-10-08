/* Chapter 0 "kubectl apply, End to End": two bespoke scenes plus the Explain text (index 0, zero-based).
   Loads after course.js and chapters/_h.js. Timings and counts are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified control plane. Timings and counts are illustrative.';

  /* ---------- 1. Follow one apply: an etcd revision tape and the loops that watch it ---------- */
  const LANES = [['kubectl', 'writes Deployment'], ['Deployment ctrl', 'writes ReplicaSet'], ['ReplicaSet ctrl', 'writes Pods'], ['Scheduler', 'writes nodeName'], ['Kubelet', 'writes Ready']];
  const TAPE = [['rv 101', 'Deployment web'], ['rv 102', 'ReplicaSet web-7d9f6'], ['rv 103', '3 Pods, nodeName empty'], ['rv 104', 'nodeName set on 3 Pods'], ['rv 105', '3 Pods Ready']];
  const LY = i => 76 + i * 50;
  const chain = {
    id: 'chain', label: 'Follow one apply', desc: 'A first-time apply of Deployment web. Each loop watches the tape for its object and appends the next one. The ReplicaSet controller is down, so the tape stops growing.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl apply -f web.yaml', 'deployment.apps/web configured   # returns once etcd has it', '$ kubectl get rs,pods -l app=web', '# restart the ReplicaSet controller, then:', '$ kubectl get pods -l app=web -o wide'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'etcd revision tape · 3 replicas', right: s.r || '' }),
      setup(kit) {
        const tape = TAPE.map(([rv, what], i) => kit.chip(null, { x: 16, y: LY(i), w: 250, h: 36, label: rv + '  ' + what, tone: 'info', show: false, small: true }));
        const lanes = LANES.map(([l, sub], i) => kit.chip(null, { x: 424, y: LY(i), w: 192, h: 36, label: l, sub, tone: 'info' }));
        const links = [];
        LANES.forEach((_, i) => {
          links.push({ id: 'w' + i, x1: 424, y1: LY(i) + 18, x2: 270, y2: LY(i) + 18 });
          if (i > 0) links.push({ id: 'r' + i, x1: 270, y1: LY(i - 1) + 18, x2: 424, y2: LY(i) + 6 });
        });
        const ar = KH.links(kit, links);
        const gap = kit.text(null, { x: 16, y: 332, t: '', cls: 'kt sm tone-bad' });
        return { tape, lanes, ar, gap };
      },
      frame(s, kit, R) {
        const n = s.n || 0, down = n === 3 || n === 4;
        const vis = [n >= 1, n >= 2, n >= 5, n >= 6, n >= 7];
        const lane = { 0: -1, 1: 0, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 4 }[n];
        R.tape.forEach((c, i) => c.set({ show: vis[i], tone: i === lane ? 'cursor' : (i === 2 && n === 5) ? 'warn' : (i === 4 ? 'ok' : 'live'), hl: i === [0, 1, 1, -1, -1, 2, 3, 4][n] }));
        R.lanes.forEach((c, i) => {
          const act = (i === 1 && n === 2) || (i === 2 && n === 5) || (i === 3 && n === 6) || (i === 4 && n === 7) || (i === 0 && n === 1);
          const dead = i === 2 && down;
          c.set({ tone: dead ? 'delete' : act ? 'cursor' : 'info', hl: act || dead, sub: dead ? 'NOT RUNNING' : LANES[i][1] });
        });
        const on = { 1: ['w0'], 2: ['r1', 'w1'], 3: ['r2'], 4: ['r2'], 5: ['r2', 'w2'], 6: ['r3', 'w3'], 7: ['r4', 'w4'] }[n] || [];
        R.ar.only(on, down ? ['r2'] : []);
        R.gap.set(down ? 'tape stops at rv 102: nothing wakes the next loop' : '');
      }
    },
    bug: [
      { log: 'The cluster is idle. Each loop watches the API server for the objects it owns, and the revision tape in etcd has nothing about web yet.', callout: 'Every loop watches; the tape is empty', code: 0, state: { n: 0, r: 'idle' }, stats: [{ l: 'objects for web', v: '0' }, { l: 'loops watching', v: '4' }] },
      { log: 'kubectl sends the Deployment. The API server validates it and appends it to etcd as revision 101, then answers. kubectl exits after about 200 ms (illustrative).', callout: 'apply returns once etcd has appended the Deployment', code: 1, state: { n: 1, r: 'rv 101' }, stats: [{ l: 'kubectl exit', v: '~200 ms', cls: 'ok' }, { l: 'containers started', v: '0', cls: 'warn' }] },
      { log: 'The Deployment controller sees revision 101 on its watch, hashes spec.template and appends ReplicaSet web-7d9f6c5b8 as revision 102.', callout: 'Deployment controller appends the ReplicaSet', code: 1, state: { n: 2, r: 'rv 102' }, stats: [{ l: 'ReplicaSets', v: '1', cls: 'ok' }, { l: 'Pod objects', v: '0' }] },
      { log: 'The ReplicaSet controller is not running (the controller manager crashed). Revision 102 sits on the tape and nobody watches it.', callout: 'The tape stops: no ReplicaSet controller', moment: true, code: 2, state: { n: 3, r: 'chain stopped' }, stats: [{ l: 'Pod objects', v: '0', cls: 'bad' }, { l: 'time to Ready', v: 'never', cls: 'bad' }] },
      { log: 'kubectl get shows a ReplicaSet and no Pods. The scheduler and the kubelet are healthy but idle, because they only react to Pods that exist.', callout: 'Healthy loops cannot act on a missing object', code: 2, state: { n: 4, r: 'no pods' }, stats: [{ l: 'scheduler work', v: 'none' }, { l: 'kubelet work', v: 'none' }] },
      { log: 'The controller comes back, lists the ReplicaSet and sees 0 Pods against 3 wanted. It appends three Pod objects as revision 103. Their nodeName is empty, so they are Pending.', callout: 'RS controller returns: 3 Pending Pods appended', code: 3, state: { n: 5, r: 'rv 103' }, stats: [{ l: 'Pod objects', v: '3', cls: 'ok' }, { l: 'nodeName set', v: '0 / 3', cls: 'warn' }] },
      { log: 'The scheduler watches for Pods with an empty nodeName, picks a node for each and writes it as revision 104. It does not start anything itself.', callout: 'Scheduler writes nodeName', code: 4, state: { n: 6, r: 'rv 104' }, stats: [{ l: 'nodeName set', v: '3 / 3', cls: 'ok' }, { l: 'running', v: '0 / 3', cls: 'warn' }] },
      { log: 'The kubelet on each node sees a Pod bound to it, pulls the image, starts the containers and reports Ready as revision 105. Only now do the three replicas serve traffic.', callout: 'Kubelet starts containers and reports Ready', code: 4, state: { n: 7, r: 'rv 105' }, stats: [{ l: 'Ready', v: '3 / 3', cls: 'ok' }, { l: 'revisions written', v: '5' }],
        takeaway: 'apply writes desired state. Each loop appends the next object. When the chain is stuck, find the first missing object.' }
    ],
  };

  /* ---------- 2. Which edits start a rollout: only a new pod template does ---------- */
  const rollout = {
    id: 'template-hash', label: 'Which edit rolls out', desc: 'Three edits to the same Deployment. Only a change to spec.template changes the hash and creates a new ReplicaSet.',
    codeLabel: 'kubectl',
    code: { bug: ['kubectl label deploy web team=pay        # Deployment metadata', 'kubectl edit configmap web-cfg           # edited in place', 'kubectl set image deploy/web web=web:1.1 # spec.template', 'kubectl get rs -l app=web'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · replicas 3', right: s.r || '' }),
      setup(kit) {
        kit.panel(null, { x: 16, y: 70, w: 212, h: 256, title: 'Deployment web' });
        const meta = kit.chip(null, { x: 28, y: 98, w: 188, h: 42, label: 'metadata.labels', sub: 'outside the template', tone: 'info' });
        const cm = kit.chip(null, { x: 28, y: 148, w: 188, h: 42, label: 'ConfigMap web-cfg', sub: 'outside the template', tone: 'info' });
        const img = kit.chip(null, { x: 28, y: 198, w: 188, h: 42, label: 'spec.template', sub: 'image web:1.0', tone: 'info' });
        const hash = kit.chip(null, { x: 28, y: 266, w: 188, h: 42, label: 'hash(spec.template)', sub: '6f4b9', tone: 'live' });
        const pA = kit.panel(null, { x: 248, y: 70, w: 376, h: 122, title: 'ReplicaSet web-6f4b9' });
        const pB = kit.panel(null, { x: 248, y: 204, w: 376, h: 122, title: 'ReplicaSet web-7d9f6' });
        const A = [0, 1, 2].map(i => kit.chip(null, { x: 264 + i * 112, y: 112, w: 100, h: 56, label: 'pod ' + i, sub: 'web:1.0 Ready', tone: 'ok' }));
        const B = [0, 1, 2].map(i => kit.chip(null, { x: 264 + i * 112, y: 246, w: 100, h: 56, label: 'pod ' + i, sub: 'web:1.1 Ready', tone: 'ok', show: false }));
        return { meta, cm, img, hash, pA, pB, A, B };
      },
      frame(s, kit, R) {
        const n = s.n || 0, img2 = n >= 4;
        R.meta.set({ tone: n === 1 || n === 2 ? 'cursor' : 'info', hl: n === 1, sub: n >= 1 ? 'team=pay added' : 'outside the template' });
        R.cm.set({ tone: n === 3 ? 'cursor' : 'info', hl: n === 3, sub: n >= 3 ? 'data edited in place' : 'outside the template' });
        R.img.set({ tone: img2 ? 'cursor' : 'info', hl: n === 4, sub: img2 ? 'image web:1.1' : 'image web:1.0' });
        R.hash.set({ sub: img2 ? '7d9f6 (changed)' : '6f4b9', tone: img2 ? 'warn' : 'live' });
        const oldCount = n >= 7 ? 0 : n === 6 ? 2 : 3, newCount = n >= 7 ? 3 : n === 6 ? 1 : 0;
        R.A.forEach((c, i) => c.set({ show: i < oldCount }));
        R.B.forEach((c, i) => c.set({ show: i < newCount }));
        R.pA.badge(n >= 7 ? '0 replicas · kept for undo' : oldCount + ' Ready' + (n === 2 || n === 3 ? ' · hash unchanged' : ''));
        R.pB.badge(n < 5 ? 'does not exist' : newCount + ' Ready');
      }
    },
    bug: [
      { log: 'Deployment web has one ReplicaSet, web-6f4b9, with 3 Ready Pods. The 6f4b9 suffix is the hash of spec.template.', callout: 'One template, one ReplicaSet', code: 3, state: { n: 0, r: 'steady' }, stats: [{ l: 'ReplicaSets', v: '1' }, { l: 'pods', v: '3 / 3', cls: 'ok' }] },
      { log: 'Someone adds a label to the Deployment itself. This lives in metadata, outside the pod template.', callout: 'A label on the Deployment object', code: 0, state: { n: 1, r: 'label edit' }, stats: [{ l: 'template changed', v: 'no', cls: 'ok' }, { l: 'pods', v: '3 / 3' }] },
      { log: 'The Deployment controller recomputes the hash of spec.template. It is still 6f4b9, so the existing ReplicaSet already matches.', callout: 'Same hash: nothing to roll out', moment: true, code: 3, state: { n: 2, r: 'no rollout' }, stats: [{ l: 'new ReplicaSets', v: '0', cls: 'warn' }, { l: 'pods restarted', v: '0', cls: 'warn' }] },
      { log: 'A ConfigMap is edited in place. The template still points at the same ConfigMap name, so the hash does not move and env vars are not re-read.', callout: 'ConfigMap edit alone restarts nothing', code: 1, state: { n: 3, r: 'configmap edit' }, stats: [{ l: 'template changed', v: 'no', cls: 'ok' }, { l: 'pods restarted', v: '0', cls: 'warn' }] },
      { log: 'The image tag changes. This edits spec.template, so the hash of the template changes to 7d9f6.', callout: 'Image change edits spec.template', code: 2, state: { n: 4, r: 'image 1.1' }, stats: [{ l: 'template changed', v: 'yes', cls: 'warn' }, { l: 'new hash', v: '7d9f6' }] },
      { log: 'No ReplicaSet owns hash 7d9f6, so the Deployment controller creates web-7d9f6 with 0 Ready Pods. The old ReplicaSet is kept.', callout: 'A new ReplicaSet appears', code: 3, state: { n: 5, r: 'RS created' }, stats: [{ l: 'ReplicaSets', v: '2', cls: 'warn' }, { l: 'new Ready', v: '0 / 3' }] },
      { log: 'The new ReplicaSet scales up while the old one scales down, in steps bounded by maxSurge and maxUnavailable (chapter 8).', callout: 'New scales up, old scales down', code: 3, state: { n: 6, r: 'rolling' }, stats: [{ l: 'old Ready', v: '2' }, { l: 'new Ready', v: '1' }] },
      { log: 'The new ReplicaSet has 3 Ready Pods. The old ReplicaSet stays at 0 replicas, which is what makes kubectl rollout undo possible.', callout: 'Old ReplicaSet kept at 0 for rollback', code: 3, state: { n: 7, r: 'done' }, stats: [{ l: 'new Ready', v: '3 / 3', cls: 'ok' }, { l: 'old replicas', v: '0' }],
        takeaway: 'Only spec.template starts a rollout. A label on the Deployment or an in-place ConfigMap edit leaves the hash alone.' }
    ],
  };

  const flow = KH.flow(['kubectl|apply -f', '*API server|validate, store', 'etcd|desired state', 'Deployment ctrl|creates RS', 'ReplicaSet ctrl|creates Pods', 'Scheduler|writes nodeName', 'Kubelet|runs containers', 'EndpointSlice ctrl|adds ready IPs'], 'Flow: each box writes one object, and the next box watches for it. No box calls another directly.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[0] = { explain: `
<h3>1. Desired state lives in one place</h3>
<p><code>kubectl apply</code> does not start a container. It sends an object to the API server, which validates it and stores it in etcd, and then answers. Every object has a <code>spec</code>, which is what you want, and a <code>status</code>, which is what the controllers saw. kubectl exits as soon as the write is stored, so a green pipeline step only proves that the desired state was saved.</p>
${flow}

<h3>2. Many loops, each with one job</h3>
<p>The Deployment controller watches Deployments and creates ReplicaSets. The ReplicaSet controller watches ReplicaSets and creates Pod objects. The scheduler watches Pods whose <code>spec.nodeName</code> is empty and writes a node name. The kubelet on that node watches Pods bound to it and drives the container runtime. The EndpointSlice controller watches Pods and Services and lists the IPs of Ready Pods. None of them calls another one. They only read and write objects through the API server.</p>
<p>That is why scene 1 stops cleanly when one loop is down. The objects before the gap exist, the objects after it never appear, and every other component stays healthy but has nothing to do. Debugging an apply is therefore a walk along the chain: Deployment, ReplicaSet, Pod, <code>nodeName</code>, container status, EndpointSlice. The first missing or wrong object points at the broken loop.</p>

<h3>3. What counts as a change: the pod template hash</h3>
<p>The Deployment controller hashes <code>spec.template</code> and puts the result in the ReplicaSet name and in the <code>pod-template-hash</code> label. If a ReplicaSet with that hash already exists, there is nothing to do. If not, a new ReplicaSet is created and the old one scales down. Scene 2 shows the consequence: a label on the Deployment, or a ConfigMap edited in place, leaves the hash alone, so nothing rolls out. An image tag, an env var or an annotation inside <code>spec.template</code> changes the hash.</p>
<p>To make a config change roll out, put something derived from the config into the template, for example an annotation that carries a hash of the ConfigMap data. <code>kubectl rollout restart</code> does the same by stamping an annotation with the current time.</p>

<h3>4. Ownership: server-side apply and managedFields</h3>
<p>With server-side apply, the API server records in <code>metadata.managedFields</code> which field manager owns each field. A second writer that sets a different value for a field that someone else owns gets a conflict error instead of silently overwriting it. A controller that owns <code>spec.replicas</code>, such as an HPA or a GitOps tool with self-heal, will also put the value back after a manual <code>kubectl scale</code>, because declared state always wins in the next reconcile.</p>

<h3>5. The trade-off</h3>
<p>Independent loops are robust. Any one of them can crash, restart and catch up by reading current state, and no central coordinator can become a single point of failure. The cost is that nothing tells you the whole job finished. <code>apply</code> returning means "stored", not "running". Use <code>kubectl rollout status</code> or watch the Ready condition when you need to know the Pods are actually serving.</p>

<h3>6. Syntax</h3>
<pre>kubectl apply -f web.yaml
kubectl apply --server-side -f web.yaml          # field-level ownership
kubectl get deploy,rs,pods -l app=web            # walk the chain
kubectl get deploy web -o yaml --show-managed-fields
kubectl rollout status deploy/web
kubectl rollout restart deploy/web               # stamps spec.template
kubectl describe pod web-7d9f6c5b8-abcde         # Events: Scheduled, Pulled, Started</pre>
<p>The ReplicaSet name is <code>&lt;deployment&gt;-&lt;pod-template-hash&gt;</code>, and each Pod name adds a random suffix. In <code>kubectl get pods -o wide</code>, an empty NODE means the scheduler has not bound the Pod yet.</p>`, scenarios: [chain, rollout] };
})();
