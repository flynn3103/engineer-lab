/* Chapter 1 "API Server: Authentication, RBAC, Admission": a gate corridor, a webhook outage and flow-control seats (index 1).
   Loads after course.js and scene-tools.js. Numbers are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified request path. Seat counts and timings are illustrative.';

  /* ---------- 1. One request through the gates ---------- */
  const GATES = [['authn', 'who?'], ['APF', 'seat?'], ['RBAC', 'allowed?'], ['mutate', 'may edit'], ['schema', 'shape'], ['validate', 'accept?'], ['etcd', 'write']];
  const GX = i => 16 + i * 87;
  const gates = {
    id: 'gates', label: 'One request, six gates', desc: 'A DELETE of namespace prod, first with a cluster-admin token, then with a namespaced Role. The first failing gate ends the request.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl delete ns prod --as=system:serviceaccount:ci:deployer', 'namespace "prod" deleted           # cluster-admin: every gate passes', '# after replacing the binding with a namespaced Role:', 'Error from server (Forbidden): namespaces "prod" is forbidden: User "system:serviceaccount:ci:deployer" cannot delete resource "namespaces" in API group "" at the cluster scope'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'request = DELETE namespace prod', right: s.r || '' }),
      setup(kit) {
        const g = GATES.map(([l, sub], i) => kit.chip(null, { x: GX(i), y: 84, w: 84, h: 52, label: l, sub, tone: 'info' }));
        const tok = kit.chip(null, { x: 16, y: 144, w: 116, h: 36, label: 'DELETE ns', sub: '', tone: 'cursor' });
        const hook = kit.chip(null, { x: GX(3) - 20, y: 190, w: 124, h: 40, label: 'webhook', sub: 'not called', tone: 'info' });
        const rv = kit.chip(null, { x: GX(6) - 40, y: 190, w: 124, h: 40, label: 'etcd rv 4811', sub: 'unchanged', tone: 'info' });
        const led = kit.ledger(null, { x: 16, y: 240, w: 608, title: 'Who asked, and what the API server answered', cols: [{ label: 'identity', w: 250 }, { label: 'binding', w: 170 }, { label: 'answer', w: 160 }], rows: 2, rowH: 16 });
        return { g, tok, hook, rv, led };
      },
      frame(s, kit, R) {
        const at = s.at || 0, stop = s.stop == null ? -1 : s.stop, scoped = s.mode === 'scoped';
        R.g.forEach((c, i) => {
          const dead = i === stop, pass = i < at && !(stop >= 0 && i >= stop);
          c.set({ tone: dead ? 'delete' : pass ? 'ok' : i === at ? 'cursor' : 'info', hl: i === at });
        });
        R.tok.set({ x: Math.min(GX(at) - 16, 508), tone: stop >= 0 ? 'warn' : 'cursor', label: stop >= 0 ? 'HTTP 403' : 'DELETE ns' });
        const hookRan = !scoped && at >= 3 && stop < 0, wrote = !scoped && at >= 6;
        R.hook.set({ sub: hookRan ? 'called, allowed' : 'not called', tone: hookRan ? 'ok' : 'info' });
        R.rv.set({ label: wrote ? 'etcd rv 4812' : 'etcd rv 4811', sub: wrote ? 'prod deleted' : 'unchanged', tone: wrote ? 'delete' : 'info' });
        R.led.clear();
        R.led.setRow(0, ['sa:ci:deployer', scoped ? 'Role deploy (ns ci)' : 'cluster-admin', at < 2 ? 'checking' : at < 3 ? 'seat granted' : (scoped ? '403 Forbidden' : at >= 6 ? '200, prod removed' : 'allowed')], { hl: true, tones: [null, scoped ? null : 'bad', scoped && stop >= 0 ? 'bad' : null] });
      }
    },
    bug: [
      { log: 'A CI job sends DELETE namespace prod. It carries a ServiceAccount token. The request enters the chain at the first gate.', callout: 'The request must pass six gates before etcd', code: 0, state: { at: 0, mode: 'admin', r: 'cluster-admin token' }, stats: [{ l: 'gates passed', v: '0 / 6' }, { l: 'etcd revision', v: '4811' }] },
      { log: 'Authentication maps the token to the identity system:serviceaccount:ci:deployer. A bad or expired token would stop here with 401.', callout: 'authn: the token becomes an identity', code: 0, state: { at: 1, mode: 'admin', r: 'identity known' }, stats: [{ l: 'gates passed', v: '1 / 6', cls: 'ok' }, { l: 'status so far', v: '-' }] },
      { log: 'API Priority and Fairness gives the request a seat in its flow. If the level were saturated, the answer would be 429 with Retry-After.', callout: 'APF: the request gets a seat', code: 0, state: { at: 2, mode: 'admin', r: 'seat granted' }, stats: [{ l: 'gates passed', v: '2 / 6', cls: 'ok' }, { l: 'queued', v: 'no' }] },
      { log: 'RBAC looks for a rule that allows delete on namespaces. This ServiceAccount is bound to cluster-admin, so the rule exists and the request is allowed.', callout: 'RBAC: cluster-admin allows everything', code: 0, state: { at: 3, mode: 'admin', r: 'allowed by cluster-admin' }, stats: [{ l: 'gates passed', v: '3 / 6', cls: 'ok' }, { l: 'binding', v: 'cluster-admin', cls: 'warn' }] },
      { log: 'Mutation, schema validation and validating admission all accept the request, and the namespace is deleted from etcd as revision 4812.', callout: 'Every gate passes: namespace prod is gone', moment: true, code: 1, state: { at: 6, mode: 'admin', r: 'prod deleted' }, stats: [{ l: 'gates passed', v: '6 / 6', cls: 'warn' }, { l: 'etcd revision', v: '4812', cls: 'bad' }] },
      { log: 'The fix is least privilege. The cluster-admin binding is replaced by a Role that only lets the deployer manage Deployments in one namespace, and the same request is sent again.', callout: 'Replay with a namespaced Role', code: 2, state: { at: 0, mode: 'scoped', r: 'namespaced Role' }, stats: [{ l: 'binding', v: 'Role deploy', cls: 'ok' }, { l: 'gates passed', v: '0 / 6' }] },
      { log: 'Authentication and APF pass again. RBAC finds no rule that allows delete on namespaces for this identity, and RBAC has no deny rules, only allows.', callout: 'RBAC: no rule allows it, so 403', code: 3, state: { at: 2, stop: 2, mode: 'scoped', r: '403 at RBAC' }, stats: [{ l: 'status', v: '403', cls: 'bad' }, { l: 'etcd revision', v: '4811', cls: 'ok' }] },
      { log: 'The request ends at the third gate. No webhook is called, nothing is validated and nothing is written, so the first failing gate fully protects everything behind it.', callout: 'Later gates never see the request', code: 3, state: { at: 2, stop: 2, mode: 'scoped', r: 'rejected early' }, stats: [{ l: 'webhooks called', v: '0', cls: 'ok' }, { l: 'etcd writes', v: '0', cls: 'ok' }],
        takeaway: 'The chain is ordered and the first failing gate rejects the request. Give every identity the narrowest Role it needs.' }
    ],
  };

  /* ---------- 2. A webhook outage: failurePolicy decides what a dead dependency means ---------- */
  const TEAMS = ['team-a', 'team-b', 'team-c'];
  const webhook = {
    id: 'webhook', label: 'Webhook outage', desc: 'A policy webhook crashes. With failurePolicy Fail every matching create is rejected; with Ignore they pass unchecked. Scoping and replicas are the real fix.',
    codeLabel: 'Config',
    code: { bug: ['kind: ValidatingWebhookConfiguration', 'webhooks:', '- name: policy.example.com', '  failurePolicy: Fail        # Ignore lets requests through', '  timeoutSeconds: 10', '  namespaceSelector: {matchExpressions: [{key: policy, operator: NotIn, values: [skip]}]}'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'validating webhook policy.example.com', right: s.r || '' }),
      setup(kit) {
        const reqs = TEAMS.map((t, i) => kit.chip(null, { x: 16, y: 84 + i * 62, w: 130, h: 46, label: t, sub: 'kubectl apply', tone: 'info' }));
        const api = kit.chip(null, { x: 230, y: 130, w: 132, h: 70, label: 'API server', sub: 'calls webhook', tone: 'info' });
        const wh = kit.chip(null, { x: 460, y: 84, w: 160, h: 56, label: 'policy webhook', sub: 'pods 2 / 2', tone: 'ok' });
        const fp = kit.chip(null, { x: 460, y: 160, w: 160, h: 40, label: 'failurePolicy', sub: 'Fail', tone: 'info' });
        const etcd = kit.chip(null, { x: 230, y: 236, w: 132, h: 48, label: 'etcd', sub: 'rv 912', tone: 'info' });
        const out = kit.chip(null, { x: 16, y: 280, w: 200, h: 40, label: 'result', sub: '', tone: 'info' });
        const ar = KH.links(kit, [
          { id: 'q0', x1: 146, y1: 107, x2: 230, y2: 150 }, { id: 'q1', x1: 146, y1: 169, x2: 230, y2: 165 }, { id: 'q2', x1: 146, y1: 231, x2: 230, y2: 185 },
          { id: 'cw', x1: 362, y1: 150, x2: 460, y2: 118 }, { id: 'we', x1: 296, y1: 200, x2: 296, y2: 236 }
        ]);
        return { reqs, api, wh, fp, etcd, out, ar };
      },
      frame(s, kit, R) {
        const up = s.up !== false, pol = s.pol || 'Fail', outcome = s.out || 'ok', all = s.all !== false;
        const blocked = outcome === 'fail', open = outcome === 'open';
        R.reqs.forEach((c, i) => c.set({ tone: !s.send ? 'info' : blocked ? 'warn' : open ? 'warn' : 'ok', sub: !s.send ? 'kubectl apply' : blocked ? 'HTTP 500' : open ? 'applied, unchecked' : 'applied', show: all || i === 0 }));
        R.api.set({ tone: s.send ? 'cursor' : 'info', hl: !!s.send });
        R.wh.set({ tone: up ? 'ok' : 'delete', sub: up ? 'pods 2 / 2' : 'pods 0 / 2' });
        R.fp.set({ sub: pol, tone: pol === 'Fail' ? 'info' : 'warn', hl: !!s.polHl });
        R.etcd.set({ sub: blocked ? 'rv 912 (unchanged)' : s.send ? 'rv 915' : 'rv 912', tone: blocked ? 'info' : s.send ? 'live' : 'info' });
        R.out.set({ label: blocked ? 'failed calling webhook' : open ? 'accepted, policy skipped' : s.send ? 'accepted, policy checked' : 'idle', sub: '', tone: blocked ? 'warn' : open ? 'warn' : s.send ? 'ok' : 'info', w: 236 });
        const sh = !!s.send;
        R.ar.only(sh ? ['q0', 'q1', 'q2', 'cw'].concat(open || outcome === 'ok' ? ['we'] : []) : [], blocked ? ['cw'] : []);
      }
    },
    bug: [
      { log: 'The policy webhook runs with two replicas and the failurePolicy is Fail. Teams apply as usual and the API server calls the webhook for every matching create.', callout: 'Normal day: webhook up, every apply is checked', code: 3, state: { up: true, send: true, out: 'ok', pol: 'Fail' }, stats: [{ l: 'applies accepted', v: '3 / 3', cls: 'ok' }, { l: 'webhook', v: 'up' }] },
      { log: 'At 16:40 (illustrative) a bad rollout takes both webhook pods down. The Service has no endpoints, so every call from the API server will fail.', callout: 'The webhook pods are gone', code: 3, state: { up: false, send: false, out: 'ok', pol: 'Fail' }, stats: [{ l: 'webhook', v: 'down', cls: 'bad' }, { l: 'endpoints', v: '0', cls: 'bad' }] },
      { log: 'Team A applies a Deployment. The API server must call the webhook before it can admit the object, and waits up to timeoutSeconds (default 10) for an answer.', callout: 'The API server waits for a webhook that is down', code: 4, state: { up: false, send: false, out: 'ok', pol: 'Fail', all: false }, stats: [{ l: 'waiting', v: '10 s max', cls: 'warn' }, { l: 'team-a', v: 'pending' }] },
      { log: 'With failurePolicy Fail an unreachable webhook rejects the request. Every team that matches the rule now gets HTTP 500 failed calling webhook, though no manifest changed.', callout: 'failurePolicy Fail: every matching write is rejected', moment: true, code: 3, state: { up: false, send: true, out: 'fail', pol: 'Fail' }, stats: [{ l: 'applies accepted', v: '0 / 3', cls: 'bad' }, { l: 'etcd revision', v: '912', cls: 'ok' }] },
      { log: 'Switching an advisory policy to failurePolicy Ignore lets the API server skip a webhook that cannot be reached, so the applies go through again.', callout: 'failurePolicy Ignore: requests pass, unchecked', code: 3, state: { up: false, send: true, out: 'open', pol: 'Ignore', polHl: true }, stats: [{ l: 'applies accepted', v: '3 / 3', cls: 'warn' }, { l: 'policy enforced', v: 'no', cls: 'warn' }] },
      { log: 'Ignore trades safety for availability, so a security policy may still need Fail. The durable fix is a webhook that can survive: several replicas, a narrow rule and a namespaceSelector that excludes its own namespace.', callout: 'Scope the rule, add replicas, keep Fail where needed', code: 5, state: { up: true, send: true, out: 'ok', pol: 'Fail', polHl: true }, stats: [{ l: 'webhook', v: 'up 3 / 3', cls: 'ok' }, { l: 'applies accepted', v: '3 / 3', cls: 'ok' }],
        takeaway: 'Every matching write depends on the webhook. Choose failurePolicy per policy, scope the rules and run several replicas.' }
    ],
  };

  /* ---------- 3. API Priority and Fairness: a noisy client is queued and rejected, others keep their seats ---------- */
  const apf = {
    id: 'apf', label: 'Burst and 429', desc: 'A batch job lists pods in a tight loop. Its priority level saturates and the job gets 429 while other levels keep their seats.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl get flowschemas', '$ kubectl get prioritylevelconfigurations', '# client log during the burst:', 'Waited for 4.1s due to client-side throttling, not priority and fairness'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'seats in use per priority level (%)', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 16, y: 96, w: 400, labelW: 120, rowH: 30, items: [{ id: 'le', label: 'leader-election' }, { id: 'hi', label: 'workload-high' }, { id: 'lo', label: 'workload-low' }, { id: 'q', label: 'queue of lo' }], unit: '%', title: 'Priority levels (illustrative)' });
        const job = kit.chip(null, { x: 450, y: 90, w: 168, h: 46, label: 'batch job', sub: 'list pods loop', tone: 'info' });
        const ctl = kit.chip(null, { x: 450, y: 150, w: 168, h: 46, label: 'controllers', sub: 'leader-election', tone: 'info' });
        const res = kit.chip(null, { x: 450, y: 210, w: 168, h: 46, label: 'HTTP answer', sub: '', tone: 'info' });
        const note = kit.chip(null, { x: 16, y: 240, w: 400, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { bars, job, ctl, res, note };
      },
      frame(s, kit, R) {
        const lo = s.lo == null ? 20 : s.lo, q = s.q || 0;
        R.bars.set('le', 12, 'ok'); R.bars.set('hi', s.hi == null ? 30 : s.hi, 'ok');
        R.bars.set('lo', lo, lo >= 100 ? 'bad' : lo >= 60 ? 'warn' : 'ok'); R.bars.set('q', q, q >= 100 ? 'bad' : q >= 40 ? 'warn' : 'ok');
        R.job.set({ tone: s.reject ? 'warn' : s.burst ? 'warn' : 'info', sub: s.fixed ? 'informer + watch' : 'list pods loop' });
        R.ctl.set({ tone: 'ok', sub: 'unaffected' });
        R.res.set({ label: s.reject ? '429 + Retry-After' : s.queue ? 'slower, queued' : '200 OK', tone: s.reject ? 'warn' : s.queue ? 'warn' : 'ok' });
        R.note.set({ show: !!s.msg, label: s.msg || '', sub: '', tone: s.reject ? 'warn' : 'warn' });
      }
    },
    bug: [
      { log: 'Requests belong to flows, and each flow maps to a priority level with its own share of the API server concurrency. Today every level has spare capacity.', callout: 'Each priority level has its own seats', code: 0, state: { lo: 20, q: 0 }, stats: [{ l: 'workload-low', v: '20%', cls: 'ok' }, { l: 'queue', v: '0%' }] },
      { log: 'A batch job starts listing all pods every second from many workers. All its requests land in the same flow and level.', callout: 'A noisy client starts a tight list loop', code: 1, state: { lo: 70, q: 10, burst: true }, stats: [{ l: 'workload-low', v: '70%', cls: 'warn' }, { l: 'queue', v: '10%' }] },
      { log: 'The level has no free seats, so new requests wait in a queue. Latency grows for this job, but other levels still have their own seats.', callout: 'Seats full: requests wait in the queue', code: 1, state: { lo: 100, q: 60, burst: true, queue: true, msg: 'queued requests wait for a free seat' }, stats: [{ l: 'workload-low', v: '100%', cls: 'bad' }, { l: 'queue', v: '60%', cls: 'warn' }] },
      { log: 'The queue is full. The server rejects new requests with HTTP 429 and a Retry-After header, and the client has to back off.', callout: 'Queue full: HTTP 429 with Retry-After', moment: true, code: 3, state: { lo: 100, q: 100, burst: true, reject: true, msg: 'full queue: reject with 429' }, stats: [{ l: 'status', v: '429', cls: 'bad' }, { l: 'queue', v: '100%', cls: 'bad' }] },
      { log: 'Controllers and leader election run in other priority levels. Their seats are untouched, so the cluster itself keeps working while one client is throttled.', callout: 'Other levels keep their seats', code: 3, state: { lo: 100, q: 100, burst: true, reject: true, msg: 'leader-election stays at 12%' }, stats: [{ l: 'leader-election', v: '12%', cls: 'ok' }, { l: 'controllers', v: 'healthy', cls: 'ok' }] },
      { log: 'The fix is in the client. Use an informer with a watch instead of polling list, lower the request rate and respect Retry-After. Load drops and the queue empties.', callout: 'Fix the client: watch, do not poll', code: 3, state: { lo: 25, q: 0, fixed: true, msg: 'informer + watch: one list, then events' }, stats: [{ l: 'workload-low', v: '25%', cls: 'ok' }, { l: 'status', v: '200', cls: 'ok' }],
        takeaway: 'APF gives each client class its own seats and queue. A flood is queued then rejected with 429, and the rest keeps running.' }
    ],
  };

  const flow = KH.flow(['Authentication|401 if unknown', 'Flow control|429 if full', '*RBAC|403 if no rule', 'Mutating admission|webhook may edit', 'Schema validation|shape of the object', 'Validating admission|accept or reject', 'Persist to etcd|only now written'], 'Flow: the request stops at the first failing stage, and nothing is stored before the last stage passes.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[1] = { explain: `
<h3>1. One front door with a fixed order</h3>
<p>Every client, from <code>kubectl</code> to the kubelet to a controller, talks to the same API server. A request is untrusted until it has passed a fixed chain of stages, and the first stage that fails rejects it. Nothing is written to etcd until the last stage has passed. That is why a single policy can protect the whole cluster, and why a single bad policy can block it.</p>
${flow}

<h3>2. Who are you, and what may you do</h3>
<p><b>Authentication</b> maps a client certificate, a bearer token, a ServiceAccount token or an OIDC identity to a user name and groups. It answers 401 if the identity cannot be established. <b>Authorization</b> then asks whether that identity may do this verb on this resource in this namespace. With RBAC, a Role or ClusterRole lists the allowed verbs and resources, and a RoleBinding or ClusterRoleBinding attaches it to a subject. There are no deny rules, so a missing binding simply means no access, and the answer is 403.</p>
<p>The first scene shows why this matters. The same DELETE succeeds with a cluster-admin binding and fails at the third gate with a namespaced Role. When it fails there, nothing behind it runs: no webhook is called, and no revision is written.</p>

<h3>3. Admission: policy that can change and check</h3>
<p>After authorization the object passes through admission. Mutating admission plugins and webhooks may change the object, for example to inject a sidecar or default a field. Then the API server validates the schema. Last, validating admission may only accept or reject. Built-in plugins such as <code>ResourceQuota</code> and <code>LimitRanger</code> sit in the same chain as your webhooks.</p>
<p>A webhook is a network call that the API server must make before it can admit the object. Its <code>failurePolicy</code> decides what an outage means: <code>Fail</code> rejects the request, and <code>Ignore</code> lets it through unchecked. The default in the v1 API is <code>Fail</code>. <code>timeoutSeconds</code> defaults to 10 and may be up to 30. The second scene shows the effect: with <code>Fail</code>, one dead webhook blocks every team whose write matches its rules.</p>

<h3>4. Flow control keeps one client from starving the rest</h3>
<p>API Priority and Fairness classifies each request into a flow with a <code>FlowSchema</code> and runs it at a priority level defined by a <code>PriorityLevelConfiguration</code>. Each level has its own share of concurrency and its own queues. When a level is saturated, requests wait; when its queues are full, the server answers 429 with <code>Retry-After</code>. Leader election and system controllers sit in other levels, so a runaway client is throttled while the control loops keep their seats. Separately, client-go has a client-side rate limiter, and its log line says it waited <i>due to client-side throttling</i> before the request even left the client.</p>

<h3>5. The trade-off</h3>
<p>One gate gives one place to enforce security and policy, and one audit trail. The price is that every extra check adds latency, and each webhook becomes a dependency of every matching write. Scope webhooks narrowly with <code>rules</code>, <code>namespaceSelector</code> and <code>objectSelector</code>, run several replicas and exclude the webhook's own namespace so that it can always restart. Choose <code>failurePolicy</code> per policy: security-critical rules may need <code>Fail</code>, advisory rules should usually be <code>Ignore</code>. The HTTP status tells you which gate rejected the request: 401 or 403 for identity and permission, 429 for flow control, 500 for a webhook call that failed.</p>

<h3>6. Syntax</h3>
<pre>kubectl auth can-i delete namespaces --as=system:serviceaccount:ci:deployer
kubectl get clusterrolebinding -o wide | grep deployer
kubectl get validatingwebhookconfigurations
kubectl get flowschemas,prioritylevelconfigurations
kubectl get --raw /debug/api_priority_and_fairness/dump_priority_levels

webhooks:
- name: policy.example.com
  failurePolicy: Fail          # or Ignore
  timeoutSeconds: 10
  namespaceSelector: {matchExpressions: [{key: policy, operator: NotIn, values: [skip]}]}</pre>
<p><code>kubectl auth can-i</code> evaluates RBAC for any identity you may impersonate, so you can test a binding before a pipeline uses it.</p>`, scenarios: [gates, webhook, apf] };
})();
