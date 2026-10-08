/* Chapter 7 "Services, EndpointSlices and kube-proxy": a termination race, a hub with pinned connections and an empty selector (index 7).
   Loads after course.js and scene-tools.js. Delays and counts are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Delays and counts are illustrative.';

  /* ---------- 1. The termination race: rules update later than the process exits ---------- */
  const N = 12;
  const RACE = {
    bug: [
      ['bad', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['ok', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['warn', 'warn', 'warn', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['bad', 'bad', 'bad', 'bad', 'bad', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']
    ],
    fix: [
      ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'warn', 'dim'],
      ['ok', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['warn', 'warn', 'warn', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'dim', 'dim', 'dim', 'dim', 'dim', 'dim'],
      ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']
    ]
  };
  const race = {
    id: 'race', label: 'Termination race', desc: 'A pod is deleted. The process exits at once, but forwarding rules on each node update seconds later, so requests in that gap hit a dead backend. A preStop sleep closes the gap.',
    codeLabel: 'Config',
    code: { bug: ['kubectl scale deploy web --replicas=2     # web-2 is deleted', '# SIGTERM and the endpoint removal start at the same moment', 'lifecycle: {preStop: {exec: {command: ["sleep", "10"]}}}', 'terminationGracePeriodSeconds: 30'] },
    stage: {
      w: W, h: H, footer: 'Simplified. One column = one second. Delays are illustrative.',
      header: s => ({ left: 'pod web-2 deleted at 0 s', right: s.r || '' }),
      setup(kit) {
        const L = KH.lanes(kit, { defs: [{ label: 'pod process', y: 84 }, { label: 'EndpointSlice', y: 118 }, { label: 'rules node-1', y: 152 }, { label: 'rules node-2', y: 186 }, { label: 'requests', y: 220 }], axisY: 262, n: N });
        kit.text(null, { x: 16, y: 284, t: 'green = serving / listed · amber = rule still points at the pod · grey = gone · red = 502', cls: 'kt xs mut' });
        const gap = kit.chip(null, { x: 16, y: 298, w: 300, h: 34, label: '', sub: '', tone: 'warn', show: false, small: true });
        return { L, gap };
      },
      frame(s, kit, R) {
        R.L.paint(RACE[s.mode || 'bug'], s.t == null ? 0 : s.t);
        R.gap.set({ show: !!s.gap, label: s.gap || '', tone: s.gapT || 'warn', w: 300 });
      }
    },
    bug: [
      { log: 'A scale-down deletes pod web-2. The API server starts its termination. Two things begin at the same moment, and nothing orders them.', callout: 'Delete starts two jobs at the same moment', code: 0, state: { mode: 'bug', t: 1, r: 'delete web-2' }, stats: [{ l: 'replicas', v: '3 to 2' }, { l: 'ordering', v: 'none', cls: 'warn' }] },
      { log: 'The kubelet sends SIGTERM, and there is no preStop hook, so the process stops serving and exits at once, within a fraction of a second.', callout: 'SIGTERM: the process exits at about 0.2 s', code: 1, state: { mode: 'bug', t: 1, r: 'process gone' }, stats: [{ l: 'process', v: 'gone', cls: 'bad' }, { l: 'time', v: '0.2 s' }] },
      { log: 'The EndpointSlice controller sees the Pod terminating and removes its IP from the EndpointSlice, about a second later.', callout: 'The EndpointSlice drops the pod after about 1 s', code: 1, state: { mode: 'bug', t: 2, r: 'endpoint removed' }, stats: [{ l: 'EndpointSlice', v: 'updated' }, { l: 'rules updated', v: '0 / 2 nodes', cls: 'warn' }] },
      { log: 'kube-proxy on each node learns about the change and rewrites its rules. Node 1 is done at 3 s, node 2 only at 6 s. Until then each node still forwards new connections to the dead IP.', callout: 'Rules update at 3 s and 6 s: a stale gap', moment: true, code: 1, state: { mode: 'bug', t: 7, gap: 'stale rules: new connections reach a dead IP', r: 'stale gap' }, stats: [{ l: 'rules updated', v: '2 / 2 at 6 s', cls: 'warn' }, { l: 'gap', v: '~6 s', cls: 'bad' }] },
      { log: 'Requests that hit a stale rule during the gap fail with 502 or a connection reset. No pod crashed and no probe failed, which is why the errors look mysterious.', callout: 'About 6 s of 502 on every scale-down', code: 1, state: { mode: 'bug', t: 12, gap: 'about 6 s of 502 (illustrative)', gapT: 'warn', r: '502 burst' }, stats: [{ l: 'errors', v: '~6 s', cls: 'bad' }, { l: 'cause', v: 'rules lag exit', cls: 'warn' }] },
      { log: 'The fix is a preStop hook that sleeps for 10 s, longer than the rule propagation delay. SIGTERM is sent only after the hook, so the process keeps serving while the rules are updated.', callout: 'preStop sleep 10 s: keep serving during the gap', code: 2, state: { mode: 'fix', t: 5, r: 'preStop sleep' }, stats: [{ l: 'process', v: 'serving', cls: 'ok' }, { l: 'sleep', v: '10 s', cls: 'ok' }] },
      { log: 'By 6 s every node has dropped the pod from its rules, while the process was still alive, so no request reached a dead backend. At 10 s SIGTERM arrives, the app drains in-flight requests and exits.', callout: 'Rules catch up first; then it drains and exits', code: 3, state: { mode: 'fix', t: 12, r: 'no errors' }, stats: [{ l: 'errors', v: '0', cls: 'ok' }, { l: 'grace period', v: '30 s' }],
        takeaway: 'The rules update after the process can exit. Keep the process serving long enough with a preStop sleep, then drain on SIGTERM.' }
    ],
  };

  /* ---------- 2. Long-lived connections are balanced once, at connect time ---------- */
  const pin = {
    id: 'pinned', label: 'Pinned connections', desc: 'Rules choose a backend per new connection, not per request. Long-lived HTTP/2 or gRPC connections stay on one pod, so a scale-up does not move any load.',
    codeLabel: 'Config',
    code: { bug: ['kubectl get svc web -o wide        # ClusterIP 10.96.0.12, selector app=web', 'kubectl get endpointslices -l kubernetes.io/service-name=web', 'kubectl scale deploy web --replicas=5   # new pods get no gRPC traffic', 'keepalive: {MaxConnectionAge: 5m}      # server forces reconnects'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Service web · ClusterIP', right: s.r || '' }),
      setup(kit) {
        const clients = [0, 1, 2].map(i => kit.chip(null, { x: 16, y: 86 + i * 62, w: 110, h: 46, label: 'client ' + (i + 1), sub: 'gRPC', tone: 'info' }));
        const hub = kit.chip(null, { x: 188, y: 126, w: 132, h: 64, label: 'ClusterIP', sub: '10.96.0.12:80', tone: 'cursor' });
        const pods = [0, 1, 2, 3, 4].map(i => kit.chip(null, { x: 410, y: 76 + i * 48, w: 214, h: 40, label: 'web-' + i, sub: '0 connections', tone: 'info', show: i < 3 }));
        const ar = KH.links(kit, [
          { id: 'c0', x1: 126, y1: 109, x2: 188, y2: 150 }, { id: 'c1', x1: 126, y1: 171, x2: 188, y2: 158 }, { id: 'c2', x1: 126, y1: 233, x2: 188, y2: 176 },
          ...[0, 1, 2, 3, 4].map(i => ({ id: 'h' + i, x1: 320, y1: 158, x2: 410, y2: 96 + i * 48 }))
        ]);
        const note = kit.chip(null, { x: 16, y: 282, w: 400, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { clients, hub, pods, ar, note };
      },
      frame(s, kit, R) {
        const n = s.pods || 3, load = s.load || [0, 0, 0, 0, 0];
        R.pods.forEach((p, i) => p.set({ show: i < n, sub: load[i] + (load[i] === 1 ? ' connection' : ' connections'), tone: load[i] >= 3 ? 'warn' : load[i] === 0 && n > 3 && i >= 3 ? 'delete' : load[i] ? 'live' : 'info' }));
        R.clients.forEach(c => c.set({ sub: s.kind || 'gRPC' }));
        R.hub.set({ sub: s.hubSub || '10.96.0.12:80' });
        R.ar.only(['c0', 'c1', 'c2'].concat(s.ar || []), []);
        R.note.set({ show: !!s.msg, label: s.msg || '', tone: s.msgT || 'info', w: 400 });
      }
    },
    bug: [
      { log: 'Service web has a stable virtual IP and three ready pods. Each node has rules that rewrite the virtual IP to one pod chosen for every new connection.', callout: 'One stable IP in front of three pods', code: 0, state: { pods: 3, load: [0, 0, 0, 0, 0], ar: ['c0', 'c1', 'c2'], r: '3 pods' }, stats: [{ l: 'pods', v: '3' }, { l: 'choice made', v: 'per connection' }] },
      { log: 'With short HTTP/1.1 connections every new connection draws a backend again, so across many requests the load spreads about evenly.', callout: 'Short connections spread load by chance', code: 0, state: { pods: 3, load: [4, 3, 4, 0, 0], kind: 'HTTP/1.1', ar: ['h0', 'h1', 'h2'], r: 'HTTP/1.1 spread' }, stats: [{ l: 'per pod', v: '4 / 3 / 4' }, { l: 'balance', v: 'even', cls: 'ok' }] },
      { log: 'These clients speak gRPC. Each opens one long-lived connection, and the rule picks a backend once, at connect time. The three connections land unevenly: two on web-0, one on web-1.', callout: 'gRPC: one long connection, one choice', code: 0, state: { pods: 3, load: [2, 1, 0, 0, 0], kind: 'gRPC', ar: ['h0', 'h1'], r: 'connections pinned' }, stats: [{ l: 'web-0', v: '2 conns', cls: 'warn' }, { l: 'web-2', v: '0 conns', cls: 'warn' }] },
      { log: 'Traffic grows. The autoscaler adds two pods. The EndpointSlice lists them as soon as they are ready and kube-proxy adds rules for them.', callout: 'Scale-up to 5 pods: two new endpoints', code: 2, state: { pods: 5, load: [2, 1, 0, 0, 0], kind: 'gRPC', ar: ['h0', 'h1'], r: '5 pods' }, stats: [{ l: 'pods', v: '5', cls: 'ok' }, { l: 'EndpointSlice', v: '5 ready' }] },
      { log: 'The new pods stay idle. Established connections keep their backend through conntrack, and no client opens a new connection, so nothing chooses the new pods.', callout: 'New pods get no traffic: connections are pinned', moment: true, code: 2, state: { pods: 5, load: [2, 1, 0, 0, 0], kind: 'gRPC', ar: ['h0', 'h1'], msg: 'web-3 and web-4 idle: nobody reconnects', msgT: 'warn', r: 'new pods idle' }, stats: [{ l: 'web-3, web-4', v: '0 conns', cls: 'bad' }, { l: 'web-0', v: 'hot', cls: 'bad' }] },
      { log: 'The fix is to make connections end or to balance per request: a server-side max connection age so clients reconnect, client-side balancing over a headless Service, or a proxy or mesh that balances HTTP/2 requests.', callout: 'Force reconnects or balance per request', code: 3, state: { pods: 5, load: [2, 1, 0, 0, 0], kind: 'gRPC', ar: ['h0', 'h1'], msg: 'MaxConnectionAge 5m: clients reconnect', msgT: 'info', r: 'reconnecting' }, stats: [{ l: 'max age', v: '5 min', cls: 'ok' }, { l: 'reconnects', v: 'start' }] },
      { log: 'When the clients reconnect, each connection draws a backend again and may land on the new pods. Over a few connection lifetimes the load spreads over five pods.', callout: 'Reconnects spread connections over all 5 pods', code: 3, state: { pods: 5, load: [1, 1, 0, 1, 0], kind: 'gRPC', ar: ['h0', 'h1', 'h3'], r: 'spread' }, stats: [{ l: 'web-3', v: '1 conn', cls: 'ok' }, { l: 'hot pods', v: 'none', cls: 'ok' }],
        takeaway: 'A ClusterIP balances each connection once. Long-lived connections need max age, client balancing or a request-level proxy.' }
    ],
  };

  /* ---------- 3. Selector mismatch: an empty EndpointSlice ---------- */
  const sel = {
    id: 'selector', label: 'Empty endpoints', desc: 'The Service selector does not match the pod labels, so the EndpointSlice is empty and every request is refused. Fixing the label fills it.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl get svc web -o jsonpath="{.spec.selector}"', '{"app":"web"}', '$ kubectl get pods --show-labels         # app=webapp', '$ kubectl get endpointslices -l kubernetes.io/service-name=web   # ENDPOINTS <unset>'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Service web · selector app=web', right: s.r || '' }),
      setup(kit) {
        const svc = kit.chip(null, { x: 16, y: 96, w: 170, h: 56, label: 'Service web', sub: 'selector app=web', tone: 'cursor' });
        const pods = [0, 1, 2].map(i => kit.chip(null, { x: 226, y: 80 + i * 50, w: 170, h: 40, label: 'web-' + i, sub: 'app=webapp', tone: 'warn' }));
        const es = kit.chip(null, { x: 436, y: 96, w: 188, h: 56, label: 'EndpointSlice', sub: 'endpoints: 0', tone: 'info' });
        const cl = kit.chip(null, { x: 16, y: 206, w: 170, h: 44, label: 'client', sub: 'curl web', tone: 'info' });
        const res = kit.chip(null, { x: 226, y: 244, w: 398, h: 44, label: 'connection', sub: '', tone: 'info' });
        const ar = KH.links(kit, [
          { id: 's0', x1: 186, y1: 112, x2: 226, y2: 100 }, { id: 's1', x1: 186, y1: 124, x2: 226, y2: 150 }, { id: 's2', x1: 186, y1: 136, x2: 226, y2: 200 },
          { id: 'e0', x1: 396, y1: 100, x2: 436, y2: 116 }, { id: 'e1', x1: 396, y1: 150, x2: 436, y2: 124 }, { id: 'e2', x1: 396, y1: 200, x2: 436, y2: 132 },
          { id: 'q', x1: 100, y1: 206, x2: 100, y2: 152 }
        ]);
        return { svc, pods, es, cl, res, ar };
      },
      frame(s, kit, R) {
        const ok = !!s.match, n = s.n == null ? 0 : s.n;
        R.pods.forEach((p, i) => p.set({ sub: ok ? 'app=web · Ready' : 'app=webapp', tone: ok ? 'ok' : 'warn' }));
        R.es.set({ sub: 'endpoints: ' + n, tone: n ? 'live' : s.hlEs ? 'delete' : 'info', hl: !!s.hlEs });
        R.res.set({ label: s.res || 'idle', sub: s.resSub || '', tone: s.resT || 'info', w: 398 });
        R.ar.only(s.ar || [], s.arBad || []);
      }
    },
    bug: [
      { log: 'The Service selects pods with app=web. The Deployment was written with the label app=webapp, so the two names differ by one word.', callout: 'Selector app=web, pod labels app=webapp', code: 0, state: { match: false, n: 0, r: 'labels differ' }, stats: [{ l: 'selector', v: 'app=web' }, { l: 'pod label', v: 'app=webapp', cls: 'warn' }] },
      { log: 'The EndpointSlice controller lists the ready pods that match the selector. None match, so the EndpointSlice for the Service has zero endpoints.', callout: 'No pod matches: the EndpointSlice is empty', moment: true, code: 3, state: { match: false, n: 0, hlEs: true, ar: ['s0', 's1', 's2'], arBad: ['s0', 's1', 's2'], r: 'endpoints 0' }, stats: [{ l: 'endpoints', v: '0', cls: 'bad' }, { l: 'pods running', v: '3 / 3', cls: 'ok' }] },
      { log: 'kube-proxy has no backend to forward to, so it programs a rule that rejects traffic for this Service.', callout: 'kube-proxy has no backend to program', code: 3, state: { match: false, n: 0, hlEs: true, r: 'no backend' }, stats: [{ l: 'rules', v: 'reject', cls: 'warn' }, { l: 'backends', v: '0', cls: 'bad' }] },
      { log: 'A client calls the Service name. It resolves to the ClusterIP, but the connection is refused or times out, although all three pods are Running and Ready.', callout: 'The client is refused; the pods are healthy', code: 0, state: { match: false, n: 0, hlEs: true, ar: ['q'], res: 'connection refused', resSub: 'pods are Running and Ready', resT: 'warn', r: 'refused' }, stats: [{ l: 'client result', v: 'refused', cls: 'bad' }, { l: 'pods', v: 'Ready', cls: 'ok' }] },
      { log: 'Compare the Service selector with the pod labels, and read the EndpointSlice. Fix the label in the Deployment template, which rolls the pods, or fix the Service selector.', callout: 'Make the selector and the labels agree', code: 2, state: { match: true, n: 0, ar: ['s0', 's1', 's2'], r: 'label fixed' }, stats: [{ l: 'selector', v: 'app=web', cls: 'ok' }, { l: 'pod label', v: 'app=web', cls: 'ok' }] },
      { log: 'The EndpointSlice now lists the IPs of the three ready pods. kube-proxy programs three backends on every node.', callout: 'The EndpointSlice lists 3 ready pods', code: 3, state: { match: true, n: 3, ar: ['s0', 's1', 's2', 'e0', 'e1', 'e2'], r: 'endpoints 3' }, stats: [{ l: 'endpoints', v: '3', cls: 'ok' }, { l: 'backends', v: '3', cls: 'ok' }] },
      { log: 'The same client call now succeeds, and each new connection is forwarded to one of the three pods.', callout: 'Requests reach the pods', code: 3, state: { match: true, n: 3, ar: ['q', 'e0', 'e1', 'e2'], res: 'connection established', resSub: 'DNAT to a ready pod', resT: 'ok', r: 'serving' }, stats: [{ l: 'client result', v: 'ok', cls: 'ok' }, { l: 'endpoints', v: '3', cls: 'ok' }],
        takeaway: 'A Service reaches only the ready pods whose labels match its selector. Empty endpoints mean the selector or readiness is wrong.' }
    ],
  };

  const flow = KH.flow(['Service|ClusterIP + selector', '*EndpointSlice|ready pod IPs', 'kube-proxy|watches slices', 'iptables / IPVS|DNAT per connection', 'Pod|chosen backend'], 'Flow: the controller keeps the list of ready IPs, and every node turns that list into forwarding rules.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[7] = { explain: `
<h3>1. One address in front of changing pods</h3>
<p>Pods get a new IP every time they are recreated, so clients cannot depend on them. A Service gives clients one stable virtual IP, the ClusterIP, a DNS name and a label selector. The ClusterIP is not on any interface. It exists only as forwarding rules that every node installs, so a packet sent to it is rewritten to the IP of one real pod.</p>
${flow}

<h3>2. Who builds the list and the rules</h3>
<p>The <b>EndpointSlice controller</b> watches Services and Pods. For each Service it lists the IPs of the pods that match the selector and are Ready, in EndpointSlice objects, with up to 100 endpoints per slice by default. A pod that is not Ready is left out, or marked not ready, which is how readiness probes protect users. <b>kube-proxy</b> runs on every node, watches EndpointSlices and programs the node's kernel rules, in iptables or IPVS mode. The rules do destination NAT (DNAT) to one backend, chosen when a connection starts. Established connections stay on their backend through conntrack, the kernel's connection table.</p>

<h3>3. The termination race</h3>
<p>When a pod is deleted, the kubelet runs its <code>preStop</code> hook and sends SIGTERM, while at the same time the EndpointSlice controller removes the pod, and every node then rewrites its rules. These two paths are not ordered. If the process exits at once, nodes that have not yet updated their rules keep sending new connections to a dead IP, and users see 502 or connection resets for a few seconds, as the first scene shows. The fix has two parts: a <code>preStop</code> sleep longer than the rule propagation time, so the pod keeps serving while the rules change, and graceful shutdown on SIGTERM, so in-flight requests finish. <code>terminationGracePeriodSeconds</code>, default 30, must be longer than the sleep plus the drain.</p>

<h3>4. Balanced per connection, not per request</h3>
<p>The rules choose a backend for each new connection. With short HTTP/1.1 connections that spreads requests well. With long-lived HTTP/2 or gRPC connections, a client picks a backend once and sends every request over it, so after a scale-up the new pods receive nothing, as the second scene shows. Options: a server-side maximum connection age so clients reconnect, client-side load balancing over a headless Service, or a proxy or service mesh that balances requests. A related limit is the conntrack table: when it is full, the kernel drops packets for many Services at once, and the log says <i>nf_conntrack: table full, dropping packet</i>.</p>

<h3>5. When there are no endpoints</h3>
<p>The most common Service failure is an empty EndpointSlice. The selector and the pod labels disagree, or no pod is Ready, or the Service and the pods are in different namespaces. The pods can look healthy, and the client still gets connection refused, because the node has no backend to forward to. Check <code>kubectl get endpointslices</code> first, then compare the selector with <code>--show-labels</code>.</p>

<h3>6. The trade-off</h3>
<p>Virtual IPs and rule-based balancing are simple and work for every client without code. They are also coarse: they balance connections, not requests, they update with a delay, and they know nothing about load. A deliberate sleep on shutdown slows scale-down slightly, and that is the price of avoiding errors.</p>

<h3>7. Syntax</h3>
<pre>kubectl get svc web -o wide
kubectl get endpointslices -l kubernetes.io/service-name=web -o yaml
kubectl get pods -l app=web --show-labels
kubectl describe svc web                # Endpoints: shows the ready pod IPs

lifecycle: {preStop: {exec: {command: ["sleep", "10"]}}}
terminationGracePeriodSeconds: 30
sudo iptables-save | grep KUBE-SVC       # on a node, iptables mode</pre>
<p>Use a headless Service (<code>clusterIP: None</code>) when clients should receive all pod IPs from DNS and balance on their own.</p>`, scenarios: [race, pin, sel] };
})();
