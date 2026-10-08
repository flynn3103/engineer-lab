/* Problem-based course data for Kubernetes. Written from the original CHAPTERS in techstack/k8s/01-k8s-internals-end-to-end.html. */
(() => {
const K8S = 'https://kubernetes.io/docs/';
const src = (u, t) => 'Source: <a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';
const N = (id, x, y, w, t, s, h) => ({ id, x, y, w, h: h || 56, t, s });
const E = (id, a, b, label) => ({ id, a, b, label });
window.COURSE = {
  name: 'Kubernetes',
  kick: '11 chapters · problem-based · Kubernetes 1.30+',
  lead: `A web service named web runs as one Deployment. You run kubectl apply, traffic reaches it, a new version rolls out, it scales with load and it survives a dead machine. Each chapter starts from a production incident on that service, asks you to predict the outcome, then walks the control-plane mechanism behind it.`,
  chapters: [
/* ---------- 0 · kubectl apply, End to End ---------- */
{ title: 'kubectl apply, End to End',
  problem: `The checkout team applies <code>web</code> at 14:02. kubectl prints <code>deployment.apps/web configured</code> in about 200 ms (illustrative) and CI turns green. Two minutes later the dashboard still shows the old version, and the new pods are Pending. No component seems to have been told to start them.`,
  predict: { q: `Which component creates the <b>Pod objects</b> for a brand-new Deployment?`,
    opts: [`<code>kubectl</code>, as part of <code>apply</code>`, `The scheduler, when it finds a free node`, `The ReplicaSet controller, after the Deployment controller created a ReplicaSet`, `The kubelet, when it sees the Deployment`], ans: 2,
    why: `The chain is Deployment, then ReplicaSet, then Pods. The Deployment controller only creates a ReplicaSet; the ReplicaSet controller creates the Pods without a node; the scheduler binds them and the kubelet runs them. kubectl never creates pods.` },
  explain: `<h3>The idea</h3>
<p>Kubernetes keeps <b>desired state</b> in one store, the API server, which saves it in etcd. Every object has a <code>spec</code> (what you want) and a <code>status</code> (what the controllers observed). Running <code>kubectl apply</code> does not start a container. It writes desired state, and many small loops each watch the objects they own and write the next object down the chain.</p>
<h3>How it works, step by step</h3>
<p>For a first-time apply of the Deployment <code>web</code>, the chain runs like this:</p>
<ol>
<li><code>kubectl</code> sends the manifest and exits as soon as the API server answers.</li>
<li>The API server checks the request and stores the Deployment in etcd with a new <code>metadata.resourceVersion</code>.</li>
<li>The Deployment controller hashes <code>spec.template</code> and creates a ReplicaSet named <code>web-&lt;hash&gt;</code>.</li>
<li>The ReplicaSet controller creates Pod objects with an empty <code>spec.nodeName</code>, so they are Pending.</li>
<li>The scheduler writes <code>spec.nodeName</code> on each Pod.</li>
<li>The kubelet on that node pulls the image, starts the containers and reports the Ready condition.</li>
<li>The EndpointSlice controller lists the IPs of ready Pods, so the Service can route to them.</li>
</ol>
<p>With server-side apply, <code>metadata.managedFields</code> records which field manager owns each field, so two writers conflict instead of silently overwriting each other.</p>
<h3>The trade-off</h3>
<p>Loops that work independently are robust: any one of them can restart and catch up by reading current state. The cost is that <code>apply</code> returning only means the desired state was stored. To debug, follow the chain object by object until you find the first one that is missing or wrong.</p>`,
  diagnose: [
    { t: 'Apply conflict', sym: `<b>kubectl apply --server-side</b> exits non-zero and names another manager that owns the field you want to change.`,
      ctx: `An engineer hot-fixed <code>spec.replicas</code> with <code>kubectl edit</code> during an incident. The next pipeline run applies the manifest from Git with server-side apply.`,
      why: `Server-side apply records an owner (field manager) for every field in <code>metadata.managedFields</code>. Changing a field owned by a different manager with a different value is a conflict. The API server refuses instead of overwriting the other writer.`,
      log: `-- representative output, wording varies by version
$ kubectl apply --server-side -f web.yaml
error: Apply failed with 1 conflict: conflict with "kubectl-edit" using apps/v1: .spec.replicas
Please review the fields above--they currently have other managers. Here
are the ways you can resolve this warning:
* If you intend to manage all of these fields, please re-run the apply
  command with the --force-conflicts flag.
* If you do not intend to manage all of the fields, please edit your
  manifest to remove references to the fields that should keep their
  current managers.`,
      fix: [`Measure first: <code>kubectl get deploy web -o yaml --show-managed-fields</code> and read <code>managedFields</code> to see who owns <code>.spec.replicas</code>.`, `Fix: decide the owner. If an HPA or an operator should own the field, remove it from the manifest.`, `Fix: if the manifest must win, re-run once with <code>--force-conflicts</code> and tell the other writer to stop.`, `Verify: re-run the apply without flags; it exits 0 and <code>managedFields</code> shows one manager for the field.`],
      note: `The manager name and field path tell you who else writes the field. Decide who should own it. ${src('https://kubernetes.io/docs/reference/using-api/server-side-apply/#conflicts', 'Server-Side Apply: Conflicts')}` },
    { t: 'Scale reverted', sym: `Someone runs <code>kubectl scale deploy web --replicas=10</code>; a minute later it is back to 3.`,
      ctx: `During a traffic spike an engineer scales by hand. The cluster is managed by a GitOps controller with automated self-heal, and the Deployment also has an HPA for another team.`,
      why: `Controllers reconcile toward declared state. A GitOps tool with self-heal puts the Git value back; an HPA rewrites <code>spec.replicas</code> from its own calculation. Your manual write is only a temporary difference that the next loop corrects.`,
      log: `-- representative output, values illustrative
$ kubectl scale deploy web --replicas=10
deployment.apps/web scaled
$ kubectl get deploy web -w
NAME   READY   UP-TO-DATE   AVAILABLE
web    3/10    10           3
web    10/10   10           10
web    10/3    3            10     <- declared state reasserted
web    3/3     3            3`,
      fix: [`Measure first: <code>kubectl get hpa web</code> and check whether the GitOps app has self-heal on; see who owns <code>spec.replicas</code> in <code>managedFields</code>.`, `Fix: raise <code>maxReplicas</code> or <code>minReplicas</code> on the HPA, or change the replica value in Git, instead of scaling by hand.`, `Fix: if an HPA owns replicas, remove <code>spec.replicas</code> from the manifest so Git stops fighting it.`, `Verify: <code>kubectl get deploy web</code> keeps the new count for several sync intervals.`],
      note: `The write succeeded; it just lost to the loop that owns the field. ${src('https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/', 'Horizontal Pod Autoscaling')}` },
    { t: 'No rollout', sym: `The pipeline applies a new manifest, <code>kubectl rollout status</code> returns instantly, and the pods are unchanged.`,
      ctx: `A change adds a label and an annotation to the Deployment <code>metadata</code>, and the team expects a restart to pick up a ConfigMap edit.`,
      why: `Only a change to <code>spec.template</code> changes the pod-template hash and so creates a new ReplicaSet. Deployment-level labels and annotations, or a ConfigMap edited in place, leave the template untouched.`,
      log: `-- representative output, values illustrative
$ kubectl apply -f web.yaml
deployment.apps/web configured
$ kubectl get rs -l app=web
NAME            DESIRED   CURRENT   READY
web-7d9f6c5b8   3         3         3      <- same ReplicaSet, same pods`,
      fix: [`Measure first: <code>kubectl get rs -l app=web</code> before and after the apply and compare the ReplicaSet names.`, `Fix: put the change into <code>spec.template</code>, for example an annotation that carries a hash of the ConfigMap content.`, `Fix: for an intentional restart use <code>kubectl rollout restart deploy/web</code>, which stamps the template.`, `Verify: <code>kubectl rollout status deploy/web</code> reports the rollout and a new ReplicaSet appears.`],
      note: `Same ReplicaSet name means same pod-template hash. ${src('https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment', 'Deployments: Updating a Deployment')}` }
  ],
  source: { label: 'Original: kubectl apply, End to End', href: '01-k8s-internals-end-to-end.html#ch0' },
  scenarios: [
    { id: 'chain', label: 'Follow one apply', desc: 'Trace a first-time apply of Deployment web. The chain stalls at the ReplicaSet controller (illustrative: the controller is down), so no Pod ever exists.',
      codeLabel: 'Command',
      code: { bug: ['$ kubectl apply -f web.yaml', 'deployment.apps/web configured   # returns once etcd stores it', '# ReplicaSet controller is not running', '$ kubectl get rs,pods -l app=web', 'No resources found'],
              fix: ['$ kubectl apply -f web.yaml', 'deployment.apps/web configured', '$ kubectl get rs,pods -l app=web', 'replicaset.apps/web-7d9f6c5b8   3   3   3', 'pod/web-7d9f6c5b8-abcde   1/1   Running'] },
      diagram: { w: 640, h: 300, nodes: [
        N('kc', 10, 120, 140, 'kubectl', 'apply -f web.yaml'),
        N('api', 180, 120, 150, 'API server', 'validate and store'),
        N('etcd', 380, 20, 150, 'etcd', 'Deployment stored'),
        N('dc', 380, 120, 150, 'Deployment ctrl', 'creates ReplicaSet'),
        N('rsc', 380, 220, 150, 'ReplicaSet ctrl', 'creates Pods')],
        edges: [E('e1', 'kc', 'api', 'apply'), E('e2', 'api', 'etcd', 'persist'), E('e3', 'api', 'dc', 'watch'), E('e4', 'dc', 'api', 'write RS'), E('e5', 'api', 'rsc', 'watch'), E('e6', 'rsc', 'api', 'write Pods')] },
      bug: [
        { log: 'kubectl sends the Deployment. The API server validates it and stores it in etcd. kubectl exits after about 200 ms (illustrative).', code: 0, hl: { nodes: { kc: 'on', api: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'kubectl exit', v: '200 ms (illustrative)', cls: 'ok' }] },
        { log: 'The Deployment controller sees the new object on its watch and creates ReplicaSet web-7d9f6c5b8.', code: 1, hl: { nodes: { dc: 'on' }, edges: { e3: 'on', e4: 'on' } }, stats: [{ l: 'ReplicaSets', v: 1, cls: 'ok' }] },
        { log: 'The ReplicaSet controller is not running, so nobody creates the Pod objects. The chain stops here.', code: 2, hl: { nodes: { rsc: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'Pod objects', v: 0, cls: 'bad' }] },
        { log: 'kubectl get finds no Pods. The scheduler and kubelet never get work, so no container starts and no Pod becomes Ready.', code: 4, hl: { nodes: { rsc: 'bad' } }, stats: [{ l: 'time to Ready', v: 'never', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The ReplicaSet controller runs again. It sees a ReplicaSet that wants 3 Pods and creates them with an empty spec.nodeName.', code: 2, hl: { nodes: { rsc: 'ok' }, edges: { e5: 'ok', e6: 'ok' } }, stats: [{ l: 'Pod objects', v: 3, cls: 'ok' }] },
        { log: 'The scheduler binds each Pod to a node and the kubelet starts the containers. Pods report Ready.', code: 3, hl: { nodes: { rsc: 'ok' } }, stats: [{ l: 'Pods Ready', v: '3 of 3 (illustrative)', cls: 'ok' }] },
        { log: 'The EndpointSlice controller lists the three ready IPs, so the Service routes traffic to them.', code: 4, hl: { nodes: { etcd: 'ok' } }, stats: [{ l: 'time to Ready', v: 'about 20 s (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'update', label: 'Label-only change', desc: 'Change only a Deployment label. spec.template is untouched, so the pod-template hash does not change and no new ReplicaSet is made.',
      codeLabel: 'Manifest',
      code: { bug: ['metadata:', '  labels:', '    release: "2026-10-08"   # Deployment-level only', 'spec:', '  template:', '    metadata:', '      labels:', '        app: web'],
              fix: ['spec:', '  template:', '    metadata:', '      annotations:', '        checksum/config: "9f2c41"   # illustrative hash', '      labels:', '        app: web'] },
      diagram: { w: 640, h: 300, nodes: [
        N('kc', 10, 120, 140, 'kubectl', 'apply -f web.yaml'),
        N('api', 180, 120, 150, 'API server', 'stores new revision'),
        N('dc', 380, 120, 150, 'Deployment ctrl', 'hashes spec.template'),
        N('rs1', 400, 10, 200, 'ReplicaSet v1', 'web-7d9f6c5b8', 50),
        N('rs2', 400, 230, 200, 'ReplicaSet v2', 'web-5c8b (new)', 50)],
        edges: [E('e1', 'kc', 'api', 'apply'), E('e2', 'api', 'dc', 'watch'), E('e3', 'dc', 'rs1', 'hash same'), E('e4', 'dc', 'rs2', 'hash changed')] },
      bug: [
        { log: 'kubectl apply sends the Deployment with a new label in metadata. The API server stores the new revision.', code: 1, hl: { nodes: { kc: 'on', api: 'on' }, edges: { e1: 'on' } } },
        { log: 'The Deployment controller hashes spec.template. The template did not change, so the hash is the same.', code: 4, hl: { nodes: { dc: 'on', rs1: 'on' }, edges: { e3: 'on', e4: 'dim' } }, stats: [{ l: 'pod-template hash', v: 'unchanged', cls: 'warn' }] },
        { log: 'No new ReplicaSet is created, so no new Pods start. The same Pods keep serving the old config.', code: 7, hl: { nodes: { rs2: 'dim' } }, stats: [{ l: 'new Pods', v: 0, cls: 'bad' }] },
        { log: 'kubectl rollout status returns at once, and the team believes the restart happened. It did not.', code: 0, hl: { edges: { e4: 'dim' } }, stats: [{ l: 'rollout', v: 'none', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The change now goes into spec.template as a pod template annotation that carries a hash of the config.', code: 2, hl: { nodes: { dc: 'on' } }, stats: [{ l: 'spec.template', v: 'changed', cls: 'ok' }] },
        { log: 'The hash changes, so the Deployment controller creates ReplicaSet web-5c8b and starts a rolling update.', code: 4, hl: { nodes: { rs2: 'new' }, edges: { e4: 'on' } }, stats: [{ l: 'new ReplicaSet', v: 'web-5c8b', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 1 · API Server: Authentication, RBAC, Admission ---------- */
{ title: 'API Server: Authentication, RBAC, Admission',
  problem: `A CI token can delete production namespaces, and one broken admission webhook blocks every deploy. The CI system deploys <code>web</code> to namespace <code>prod</code> with a ServiceAccount token that is bound to <code>cluster-admin</code>. Later a policy webhook crashes at 16:40 (illustrative), and every <code>kubectl apply</code> of a Deployment returns HTTP 500 while the manifest is unchanged.`,
  predict: { q: `A request fails RBAC authorization. Does the <b>mutating admission webhook</b> still run for it?`,
    opts: [`Yes, mutation always runs first so policies can fix the request`, `Yes, but only if the webhook has <code>failurePolicy: Ignore</code>`, `No, the first failing stage rejects it and later stages never see it`], ans: 2,
    why: `The chain is ordered: authentication, authorization, mutating admission, schema validation, validating admission, persist. A 403 from RBAC ends the request, so the webhook is never called and cannot slow it down or change it.` },
  explain: `<h3>The idea</h3>
<p>Every request to the API server is untrusted until it passes one fixed chain of checks. The chain runs in order and the first stage that fails rejects the request. Nothing is written to etcd until the last stage has passed. That single gate is why one policy can protect the whole cluster, and also why one bad policy can block it.</p>
<h3>How it works, step by step</h3>
<ol>
<li><b>Authentication</b> maps a token, certificate or OIDC identity to a user and groups, or answers 401.</li>
<li><b>Flow control</b> (API Priority and Fairness) queues requests per flow. When a priority level is saturated, it answers 429 with <code>Retry-After</code>.</li>
<li><b>Authorization (RBAC)</b> checks Role and ClusterRole rules bound by RoleBinding or ClusterRoleBinding. It answers 403 if no rule allows the verb on the resource in that namespace. RBAC has no deny rules, only allows.</li>
<li><b>Mutating admission</b> webhooks may change the object.</li>
<li><b>Schema validation</b> checks the object shape.</li>
<li><b>Validating admission</b> webhooks may only accept or reject.</li>
<li>The object is persisted to etcd.</li>
</ol>
<p>A webhook's <code>failurePolicy</code> decides what an outage means. <code>Fail</code> rejects the request; <code>Ignore</code> lets it through.</p>
<h3>The trade-off</h3>
<p>A single gate gives one place to enforce security and policy. But every extra check adds latency, and each webhook is a dependency of every matching write. Scope webhooks narrowly, give them several replicas, and choose <code>failurePolicy</code> per webhook: critical policies may need <code>Fail</code>, while advisory ones should usually be <code>Ignore</code>. The status code tells you which gate rejected the request: 401 or 403 for identity and permission, 429 for flow control, and 500 for a failed webhook call.</p>`,
  diagnose: [
    { t: 'Forbidden', sym: `<code>Error from server (Forbidden)</code> naming the user, verb, resource and namespace.`,
      ctx: `A new pipeline uses a ServiceAccount that only has a RoleBinding in <code>staging</code>. The first deploy to <code>prod</code> is rejected.`,
      why: `The authorizer found no Role bound to this subject that allows the verb on the resource in that namespace. RBAC is allow-only and namespace-scoped, so a missing binding means no access.`,
      log: `-- representative output, wording varies by version
Error from server (Forbidden): deployments.apps is forbidden: User
"system:serviceaccount:ci:deployer" cannot create resource "deployments"
in API group "apps" in the namespace "prod"`,
      fix: [`Measure first: <code>kubectl auth can-i create deployments -n prod --as=system:serviceaccount:ci:deployer</code> answers yes or no.`, `Fix: create a namespaced Role with only the verbs and resources the pipeline needs and bind it with a RoleBinding.`, `Fix: never solve a 403 by binding <code>cluster-admin</code>; scope to the namespace.`, `Verify: <code>kubectl auth can-i</code> now returns yes for the deploy and no for <code>delete namespaces</code>.`],
      note: `The message gives you the exact subject, verb, resource, API group and namespace to grant, nothing more. ${src('https://kubernetes.io/docs/reference/access-authn-authz/rbac/', 'Using RBAC Authorization')}` },
    { t: 'Webhook down', sym: `Matching creates and updates fail with <code>failed calling webhook</code> and HTTP 500, for every team.`,
      ctx: `A policy engine webhook matches Deployments in all namespaces. Its own pods crashed after a node drain.`,
      why: `The API server must call the webhook before it can admit the object. With <code>failurePolicy: Fail</code> an unreachable webhook rejects the request. Webhook pods that are themselves blocked by the webhook can make recovery harder.`,
      log: `-- representative output, wording varies by version
Error from server (InternalError): error when creating "web.yaml":
Internal error occurred: failed calling webhook "validate.policy.example.com":
failed to call webhook: Post "https://policy.svc:443/validate?timeout=10s":
dial tcp 10.96.14.7:443: connect: connection refused`,
      fix: [`Measure first: <code>kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations</code> and check which rules and <code>failurePolicy</code> match the failing request.`, `Fix: restore the webhook pods; in an emergency delete or patch the webhook configuration to <code>failurePolicy: Ignore</code>.`, `Fix: run the webhook with multiple replicas, exclude its own namespace with <code>namespaceSelector</code>, and keep <code>timeoutSeconds</code> short.`, `Verify: create a test Deployment; it is admitted, and the API server request latency metric for admission returns to normal.`],
      note: `A 500 with the webhook name points at the webhook, not at your manifest. ${src('https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/#failure-policy', 'Dynamic Admission Control: Failure policy')}` },
    { t: 'Throttled 429', sym: `Clients log <code>Waited for ... due to client-side throttling</code> or receive HTTP 429 with <code>Retry-After</code>.`,
      ctx: `A deploy tool lists every Pod in every namespace once per second from 200 parallel jobs, and controllers start to lag.`,
      why: `Each request belongs to a flow and consumes seats at a priority level. When queues overflow the server answers 429. Separately, client-go has its own client-side rate limit that delays requests before they leave the client.`,
      log: `-- representative output, values illustrative
I1008 09:14:02 request.go:700] Waited for 3.2s due to client-side throttling,
  not priority and fairness, request: GET:https://10.0.0.1/api/v1/pods
HTTP/1.1 429 Too Many Requests
Retry-After: 1`,
      fix: [`Measure first: look at the <code>apiserver_flowcontrol_rejected_requests_total</code> metric by <code>flow_schema</code> and <code>priority_level</code>.`, `Fix: replace polling LIST loops with informers or watches and add backoff to retries.`, `Fix: if one tenant needs more share, add a <code>FlowSchema</code> and <code>PriorityLevelConfiguration</code> for it rather than raising global limits.`, `Verify: the rejected-requests counter stays flat and the controllers' work queue depth drops.`],
      note: `The log line says whether the delay was client-side or from server-side flow control. ${src('https://kubernetes.io/docs/concepts/cluster-administration/flow-control/', 'API Priority and Fairness')}` }
  ],
  source: { label: 'Original: API Server: Authentication, RBAC, Admission', href: '01-k8s-internals-end-to-end.html#ch1' },
  scenarios: [
    { id: 'chain', label: 'CI token deletes', desc: 'A CI token bound to cluster-admin passes every stage and deletes namespace prod. Then the same request with a namespaced Role is stopped at RBAC with a 403.',
      codeLabel: 'Binding',
      code: { bug: ['kind: ClusterRoleBinding', 'metadata:', '  name: ci-deployer', 'roleRef:', '  kind: ClusterRole', '  name: cluster-admin', 'subjects:', '  - kind: ServiceAccount', '    name: deployer', '    namespace: ci'],
              fix: ['kind: RoleBinding', 'metadata:', '  name: ci-deployer', '  namespace: prod', 'roleRef:', '  kind: Role', '  name: deployer-rw   # illustrative name', 'subjects:', '  - kind: ServiceAccount', '    name: deployer', '    namespace: ci'] },
      diagram: { w: 640, h: 270, nodes: [
        N('cl', 10, 20, 170, 'CI token', 'ServiceAccount deployer'),
        N('an', 230, 20, 170, 'Authentication', 'who are you'),
        N('apf', 450, 20, 170, 'Flow control', 'APF queues'),
        N('az', 450, 150, 170, 'RBAC', 'allow or 403'),
        N('mut', 230, 150, 170, 'Admission', 'mutating, validating'),
        N('st', 10, 150, 170, 'etcd', 'namespace deleted')],
        edges: [E('e1', 'cl', 'an', 'token'), E('e2', 'an', 'apf', 'user'), E('e3', 'apf', 'az', 'queued'), E('e4', 'az', 'mut', 'allowed'), E('e5', 'mut', 'st', 'persist')] },
      bug: [
        { log: 'The CI token authenticates as system:serviceaccount:ci:deployer. Authentication passes.', code: 9, hl: { nodes: { cl: 'on', an: 'ok' }, edges: { e1: 'on', e2: 'on' } } },
        { log: 'Flow control accepts the request. It is not throttled, so it goes on to RBAC.', code: 0, hl: { nodes: { apf: 'ok' }, edges: { e3: 'on' } } },
        { log: 'RBAC finds ClusterRoleBinding ci-deployer to cluster-admin, which allows delete on namespaces everywhere. Authorization passes.', code: 5, hl: { nodes: { az: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'RBAC answer', v: 'allowed', cls: 'bad' }] },
        { log: 'No webhook blocks the delete, and the store accepts it. Namespace prod is marked for deletion.', code: 2, hl: { nodes: { mut: 'ok', st: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'namespace prod', v: 'deleting', cls: 'bad' }, { l: 'HTTP code', v: 200, cls: 'bad' }] }
      ],
      fix: [
        { log: 'The binding is now a RoleBinding in namespace prod to a Role that allows only what the pipeline needs.', code: 0, hl: { nodes: { az: 'ok' } }, stats: [{ l: 'scope', v: 'prod only', cls: 'ok' }] },
        { log: 'The same delete request reaches RBAC. There is no rule that allows it, so the request is stopped there with 403.', code: 0, hl: { nodes: { az: 'bad' }, edges: { e4: 'dim', e5: 'dim' } }, stats: [{ l: 'HTTP code', v: 403, cls: 'ok' }, { l: 'namespace prod', v: 'kept', cls: 'ok' }] },
        { log: 'Later stages never run, so a broken webhook could not change the result either way.', code: 9, hl: { nodes: { mut: 'dim', st: 'ok' } }, stats: [{ l: 'stored', v: 'no', cls: 'ok' }] }
      ] },
    { id: 'webhook', label: 'Webhook outage', desc: 'A policy webhook is down. With failurePolicy Fail every matching create is rejected (illustrative). With Ignore, the request continues to etcd.',
      codeLabel: 'Config',
      code: { bug: ['apiVersion: admissionregistration.k8s.io/v1', 'kind: ValidatingWebhookConfiguration', 'webhooks:', '  - name: validate.policy.example.com', '    failurePolicy: Fail   # unreachable webhook = reject', '    timeoutSeconds: 10'],
              fix: ['apiVersion: admissionregistration.k8s.io/v1', 'kind: ValidatingWebhookConfiguration', 'webhooks:', '  - name: validate.policy.example.com', '    failurePolicy: Ignore   # non-critical policy', '    timeoutSeconds: 10'] },
      diagram: { w: 640, h: 300, nodes: [
        N('req', 10, 120, 170, 'Deployment create', 'kubectl apply'),
        N('az', 230, 120, 170, 'RBAC', 'allowed'),
        N('wh', 450, 120, 170, 'Mutating webhook', 'policy.example.com'),
        N('st', 450, 230, 170, 'etcd', 'stored')],
        edges: [E('e1', 'req', 'az', 'request'), E('e2', 'az', 'wh', 'call webhook'), E('e3', 'wh', 'st', 'admitted')] },
      bug: [
        { log: 'kubectl apply of Deployment web passes RBAC. The API server must now call the policy webhook.', code: 0, hl: { nodes: { req: 'on', az: 'ok' }, edges: { e1: 'on', e2: 'on' } } },
        { log: 'The webhook pods crashed after a node drain, so the call gets connection refused.', code: 0, hl: { nodes: { wh: 'bad' }, edges: { e2: 'bad' } } },
        { log: 'With failurePolicy Fail, an unreachable webhook rejects the request. The client sees HTTP 500 that names the webhook.', code: 4, hl: { edges: { e3: 'dim' } }, stats: [{ l: 'HTTP code', v: 500, cls: 'bad' }, { l: 'deploys succeeding', v: '0% (illustrative)', cls: 'bad' }] },
        { log: 'Every team that creates a matching object is blocked, even though no manifest is wrong.', code: 2, hl: { nodes: { req: 'bad' } }, stats: [{ l: 'affected teams', v: 'all namespaces', cls: 'bad' }] }
      ],
      fix: [
        { log: 'For a non-critical policy the webhook is set to Ignore. The API server still tries the call and times out or fails.', code: 4, hl: { nodes: { wh: 'warn' }, edges: { e2: 'dim' } }, stats: [{ l: 'failurePolicy', v: 'Ignore', cls: 'ok' }] },
        { log: 'When the call fails, the request continues to etcd. The object is stored and the outage only degrades the policy check.', code: 4, hl: { nodes: { st: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'deploys succeeding', v: '100% (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 2 · etcd, resourceVersion and Watch ---------- */
{ title: 'etcd, resourceVersion and Watch',
  problem: `A release tool and an autoscaler both read Deployment <code>web</code> at resourceVersion 41 (illustrative) and send full updates within the same second. The replica count is right, but the image is the old one. Nothing was logged as an error, and the release tool reports success.`,
  predict: { q: `Two clients both read the object at <code>resourceVersion: 41</code> and both send an update that carries <code>resourceVersion: 41</code>. What happens to the <b>second</b> update?`,
    opts: [`It overwrites the first; the last writer wins`, `It is merged field by field with the first`, `It is rejected with HTTP 409 Conflict`, `It waits until the first update finishes, then applies`], ans: 2,
    why: `The first write moves the object to a new resourceVersion. The second still claims 41, so the compare fails and the API server answers 409 Conflict; the client must re-read and retry. A PUT with no resourceVersion skips the check, which is how lost updates happen.` },
  explain: `<h3>The idea</h3>
<p>Many controllers and clients write to the same object. The store must stop a writer that read old data from silently overwriting newer data. Kubernetes solves this with one global revision number on every write and with compare-and-swap: an update succeeds only if the revision it read is still the current one.</p>
<h3>How it works, step by step</h3>
<ol>
<li>etcd keeps a history of every key. Each write gets the next revision. The API server exposes that as <code>metadata.resourceVersion</code>.</li>
<li>A client reads the object, which carries <code>resourceVersion: 41</code>, and sends an update that includes that value.</li>
<li>If the stored object is still at 41, the write succeeds and the object moves to 42.</li>
<li>If another writer already moved it, the API server answers 409 Conflict with "the object has been modified". The client re-reads and retries.</li>
<li>Watches work the same way. A client lists once, keeps the list's resourceVersion and watches for newer events. If that revision was compacted away, the watch returns 410 Gone and the client must list again.</li>
</ol>
<p>Compaction keeps history bounded. The API server asks etcd to compact about every 5 minutes by default, and etcd has a space quota set by <code>--quota-backend-bytes</code> (2 GiB by default). When the quota is reached, etcd raises a NOSPACE alarm and rejects writes.</p>
<h3>The trade-off</h3>
<p>Compare-and-swap is cheap and safe, but it moves the work to the client, which must retry on 409. A blind PUT without a resourceVersion avoids retries and loses updates. Patches and server-side apply touch only the fields you own, so unrelated writers rarely conflict at all.</p>`,
  diagnose: [
    { t: 'Conflict 409', sym: `<code>kubectl apply</code> or a client library call fails with a 409 message about modification.`,
      ctx: `Two pipeline jobs patch the same Deployment. One of them keeps a stale copy from an earlier GET.`,
      why: `The update carried an old <code>resourceVersion</code>. The stored object changed in between, so the API server refused the compare-and-swap rather than overwrite the newer data.`,
      log: `-- representative output, wording varies by version
Error from server (Conflict): Operation cannot be fulfilled on
deployments.apps "web": the object has been modified; please apply your
changes to the latest version and try again`,
      fix: [`Measure first: count 409s per client in the API server audit log or <code>apiserver_request_total{code="409"}</code>.`, `Fix: wrap read-modify-write in a retry loop (client-go has <code>retry.RetryOnConflict</code>).`, `Fix: prefer a patch or server-side apply that touches only your fields, so unrelated changes do not conflict.`, `Verify: the 409 rate falls and no lost updates appear when the two writers run together.`],
      note: `This is the safe outcome. Re-read, re-apply your change, retry. ${src('https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions', 'API Concepts: Resource versions')}` },
    { t: 'Watch 410', sym: `A controller log shows a watch error with HTTP 410 and then relists.`,
      ctx: `A custom controller restarted after a long pause and tried to resume its watch from the last resourceVersion it had saved.`,
      why: `etcd keeps history only back to the last compaction. A revision older than that no longer exists, so the server returns <code>410 Gone</code> (reason <code>Expired</code>) and the client must do a fresh LIST and watch from the list's resourceVersion.`,
      log: `-- representative output, wording varies by version
W1008 03:12:41 reflector.go: watch of *v1.Pod ended with:
  too old resource version: 38120 (39877)
I1008 03:12:41 reflector.go: Listing and watching *v1.Pod again`,
      fix: [`Measure first: count <code>410</code> responses and relists per controller; a few per day is normal, a loop is not.`, `Fix: use an informer or reflector that relists on 410 instead of a hand-written watch.`, `Fix: do not persist old resourceVersions across long downtimes; always LIST first.`, `Verify: after a restart the controller logs one relist and then runs without repeated 410s.`],
      note: `The two numbers are the requested and the current revision. Normal client code (informers) handles this by relisting. ${src('https://kubernetes.io/docs/reference/using-api/api-concepts/#410-gone-responses', 'API Concepts: 410 Gone responses')}` },
    { t: 'DB space', sym: `All writes fail with <code>mvcc: database space exceeded</code>; reads still work.`,
      ctx: `A cluster with heavy event and Lease churn reaches the 2 GiB default backend quota. Deploys and even <code>kubectl delete</code> fail.`,
      why: `Every write adds a revision. If compaction runs but the backend file is not defragmented, free space inside the file is not returned, and the usage the quota measures stays high. At the quota etcd raises the NOSPACE alarm and rejects writes.`,
      log: `-- representative output, values illustrative
Error from server: etcdserver: mvcc: database space exceeded
$ etcdctl endpoint status -w table
| ENDPOINT | DB SIZE | DB SIZE IN USE |
| :2379    | 2.1 GB  | 0.4 GB         |
$ etcdctl alarm list
memberID:8e9e05c52164694d alarm:NOSPACE`,
      fix: [`Measure first: <code>etcdctl endpoint status -w table</code> and compare DB SIZE with DB SIZE IN USE; find the object kinds that grew (events, Leases, large CRs).`, `Fix: compact to the current revision, run <code>etcdctl defrag</code> one member at a time, then <code>etcdctl alarm disarm</code>.`, `Fix: find and stop the writer that churns objects, and keep automatic compaction enabled.`, `Verify: <code>endpoint status</code> shows the file shrunk, the alarm list is empty and a test write succeeds.`],
      note: `A large gap between DB SIZE and DB SIZE IN USE means defragmentation is overdue. ${src('https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#space-quota', 'Operating etcd clusters: Space quota')}` },
    { t: 'Too large', sym: `<code>kubectl create configmap</code> or an apply fails with a request-too-large error.`,
      ctx: `A team embeds a 3 MB data file into a ConfigMap so that pods can mount it.`,
      why: `Objects live in etcd, which is built for small values. ConfigMaps and Secrets are limited to 1 MiB, and etcd and the API server also cap request size. Large objects also slow every list and watch of that kind.`,
      log: `-- representative output, wording varies by version
The ConfigMap "ref-data" is invalid: []: Too long: must have at most 1048576 bytes
Error from server (RequestEntityTooLarge): Request entity too large: limit is 3145728`,
      fix: [`Measure first: <code>kubectl get cm ref-data -o json | wc -c</code> and total size per kind.`, `Fix: keep large files in an object store or a container image and pass a reference in the ConfigMap.`, `Fix: split truly configuration-sized data into several objects if it must live in the API.`, `Verify: the apply succeeds and the kind's list/watch latency does not grow.`],
      note: `Either message means the payload does not belong in the API at all. ${src('https://kubernetes.io/docs/concepts/configuration/configmap/', 'ConfigMaps')}` }
  ],
  source: { label: 'Original: etcd, resourceVersion and Watch', href: '01-k8s-internals-end-to-end.html#ch2' },
  scenarios: [
    { id: 'cas', label: 'Two writers', desc: 'Client A and client B both read resourceVersion 41. Without a check, B silently reverts A (illustrative). With compare-and-swap, B gets 409 and re-applies on the new revision.',
      codeLabel: 'Requests',
      code: { bug: ['GET deployments/web          # both read resourceVersion 41', 'A: PUT image=v2  (rv 41)      # 200 OK, rv 42', 'B: PUT replicas=6  (no rv)     # 200 OK, rv 43', '# image is back to v1: A lost'],
              fix: ['GET deployments/web          # both read resourceVersion 41', 'A: PUT image=v2  (rv 41)      # 200 OK, rv 42', 'B: PUT replicas=6  (rv 41)      # 409 Conflict', 'B: GET rv 42, PUT replicas=6 (rv 42)  # 200 OK, rv 43'] },
      diagram: { w: 640, h: 290, nodes: [
        N('a', 10, 20, 170, 'Client A', 'PUT image=v2, rv 41'),
        N('b', 10, 170, 170, 'Client B', 'PUT replicas=6'),
        N('api', 250, 95, 175, 'API server', 'checks resourceVersion'),
        N('etcd', 470, 95, 160, 'etcd', 'current revision')],
        edges: [E('e1', 'a', 'api', 'rv 41 matches'), E('e2', 'b', 'api', 'rv 41 or none'), E('e3', 'api', 'etcd', 'write rv 42, 43')] },
      bug: [
        { log: 'Both clients GET Deployment web and read resourceVersion 41.', code: 0, hl: { nodes: { a: 'on', b: 'on' } } },
        { log: 'Client A sends a PUT with rv 41. The stored object is still at 41, so the write succeeds and the revision becomes 42.', code: 1, hl: { nodes: { a: 'ok', api: 'ok' }, edges: { e1: 'ok', e3: 'on' } }, stats: [{ l: 'stored revision', v: 42, cls: 'ok' }] },
        { log: 'Client B sends a PUT with no resourceVersion. The API server skips the compare and writes its full copy, which still has the old image.', code: 2, hl: { nodes: { b: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'stored revision', v: 43, cls: 'bad' }, { l: 'lost updates', v: 1, cls: 'bad' }] },
        { log: 'The image is back to v1. Both calls returned success, so the release tool reports done.', code: 3, hl: { nodes: { api: 'bad' } }, stats: [{ l: 'image now', v: 'v1', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Client B sends the rv 41 it read. The stored object is already at 42, so the compare fails and the API server answers 409 Conflict.', code: 2, hl: { nodes: { b: 'warn', api: 'warn' }, edges: { e2: 'dim' } }, stats: [{ l: 'HTTP code', v: 409, cls: 'warn' }] },
        { log: 'Client B re-reads at rv 42, keeps the image v2 and applies only its replica change. The write succeeds at revision 43.', code: 3, hl: { nodes: { b: 'ok', etcd: 'ok' }, edges: { e2: 'ok', e3: 'on' } }, stats: [{ l: 'lost updates', v: 0, cls: 'ok' }, { l: 'image now', v: 'v2', cls: 'ok' }] }
      ] },
    { id: 'watch', label: 'Compacted watch', desc: 'A controller resumes its watch from resourceVersion 38120. History starts at 39000 (illustrative), so the server answers 410 Gone and the controller must list again.',
      codeLabel: 'Log',
      code: { bug: ['W1008 03:12:41 reflector.go: watch of *v1.Pod ended with:', '  too old resource version: 38120 (39877)', 'I1008 03:12:41 reflector.go: Listing and watching *v1.Pod again'],
              fix: ['LIST pods                     # returns resourceVersion 39877', 'WATCH pods?resourceVersion=39877   # live events from here on'] },
      diagram: { w: 640, h: 290, nodes: [
        N('hist', 10, 110, 170, 'etcd history', 'kept from 39000'),
        N('wa', 240, 110, 170, 'Watch from 38120', 'controller saved rv'),
        N('gone', 470, 20, 160, '410 Gone', 'too old resource'),
        N('list', 470, 190, 160, 'LIST then WATCH', 'from rv 39877')],
        edges: [E('e1', 'wa', 'hist', 'resume'), E('e2', 'hist', 'gone', 'compacted'), E('e3', 'gone', 'list', 'relist')] },
      bug: [
        { log: 'The controller restarts after a long pause and resumes its watch from the saved revision 38120.', code: 0, hl: { nodes: { wa: 'on' }, edges: { e1: 'on' } } },
        { log: 'Etcd has compacted all revisions below 39000 (illustrative). Revision 38120 no longer exists.', code: 1, hl: { nodes: { hist: 'warn' }, edges: { e2: 'bad' } } },
        { log: 'The server answers 410 Gone with reason Expired. The watch ends.', code: 1, hl: { nodes: { gone: 'bad' } }, stats: [{ l: 'HTTP code', v: 410, cls: 'bad' }] },
        { log: 'Without a relist the controller would keep failing with the same stale revision and miss events.', code: 2, hl: { nodes: { list: 'dim' } }, stats: [{ l: 'events missed', v: 'until relist', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The client does a fresh LIST. The list returns the current state and its resourceVersion, 39877.', code: 0, hl: { nodes: { list: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'list revision', v: 39877, cls: 'ok' }] },
        { log: 'The client watches from 39877, which is inside the kept history. Events arrive live and nothing is missed.', code: 1, hl: { nodes: { wa: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'repeated 410s', v: 0, cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 3 · Controllers and Reconcile Loops ---------- */
{ title: 'Controllers and Reconcile Loops',
  problem: `A ReplicaSet <code>web</code> wants 3 pods. During a rolling restart of kube-controller-manager, a node drain deletes one pod at the exact second the controller is down (illustrative timing). The controller comes back with a working watch, but the deletion was never reported to it, so only 2 pods run.`,
  predict: { q: `The DELETE event was dropped. When is the missing pod created?`,
    opts: [`Never: without the event the controller cannot know`, `At the next relist or resync, because the controller compares levels instead of events`, `Only when an operator runs <code>kubectl rollout restart</code>`], ans: 1,
    why: `The controller's job is "make the number of matching pods equal spec.replicas". On any wake-up, including a relist after restart or a periodic resync, it counts pods, sees 2 not 3 and creates one. An edge-triggered design that only reacts to DELETE events would never recover.` },
  explain: `<h3>The idea</h3>
<p>Notifications can be dropped, delayed or duplicated, so a controller cannot rely on seeing every event. Kubernetes controllers are therefore <b>level-triggered</b>: whatever woke them up, they re-read the current state, compare it with the desired state and take the smallest step that closes the gap. An event only tells the controller which object to look at.</p>
<h3>How it works, step by step</h3>
<ol>
<li>A <b>reflector</b> does a LIST and then a WATCH against the API server and fills a local <b>informer cache</b>. Controllers read from memory, not from the API server.</li>
<li>Event handlers put only the object <b>key</b> into a <b>work queue</b>. The queue removes duplicates and rate-limits retries with exponential backoff, so a failing key does not spin.</li>
<li><b>Reconcile(key)</b> reads the desired state (the spec) and the observed state from the cache, creates or deletes the difference and writes status.</li>
<li>Ownership links tie objects together. <code>ownerReferences</code> let the garbage collector delete dependents. A <code>finalizer</code> in <code>metadata.finalizers</code> blocks deletion until its controller removes it.</li>
</ol>
<p>So when the DELETE event is lost, the next relist or resync still puts the key in the queue. Reconcile counts 2 pods, wants 3 and creates one.</p>
<h3>The trade-off</h3>
<p>Level-triggered loops are robust to lost events, restarts and duplicates, because each run is idempotent. The cost is extra reads and a delay before a missed change is noticed, which is why resyncs and relists matter. Controllers also must avoid tight retry loops: a key that keeps failing needs backoff, not an immediate requeue.</p>`,
  diagnose: [
    { t: 'Stuck Terminating', sym: `<code>kubectl delete</code> hangs; the object shows <code>Terminating</code> with a <code>deletionTimestamp</code> for hours.`,
      ctx: `A team uninstalled an operator before deleting its custom resources. A namespace delete is now stuck with remaining resources.`,
      why: `A finalizer in <code>metadata.finalizers</code> keeps the object in the API after deletion is requested, until the controller that owns the finalizer cleans up and removes it. If that controller no longer runs, no one removes the entry.`,
      log: `-- representative output, values illustrative
$ kubectl get db mydb -o jsonpath='{.metadata.deletionTimestamp} {.metadata.finalizers}'
2026-10-08T03:10:00Z ["db.example.com/cleanup"]
$ kubectl get ns old
NAME   STATUS        AGE
old    Terminating   3d`,
      fix: [`Measure first: <code>kubectl get &lt;kind&gt; &lt;name&gt; -o yaml</code> and read <code>finalizers</code> and <code>deletionTimestamp</code>.`, `Fix: reinstall or restart the controller that owns the finalizer so it can clean up.`, `Fix: only if the external resource is gone, remove the finalizer by hand: <code>kubectl patch &lt;kind&gt; &lt;name&gt; --type=merge -p '{"metadata":{"finalizers":null}}'</code>.`, `Verify: the object disappears from <code>kubectl get</code>.`],
      note: `A set deletionTimestamp plus a non-empty finalizers list is the signature. ${src('https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/', 'Finalizers')}` },
    { t: 'Fighting RS', sym: `Pods are created and deleted in a loop, or the replica counts never settle.`,
      ctx: `Two Deployments in one namespace both use the selector <code>app: web</code> with different templates.`,
      why: `A ReplicaSet counts every pod that matches its selector, regardless of who created it (unless another controller owns it). Two overlapping ReplicaSets each see the other's pods as theirs and scale against each other.`,
      log: `-- representative output, values illustrative
$ kubectl get pods -l app=web --show-labels
NAME          READY   STATUS    AGE
web-a-xxxxx   1/1     Running   12s
web-a-yyyyy   1/1     Terminating  3s
web-b-zzzzz   1/1     Running   2s   <- created by the other ReplicaSet`,
      fix: [`Measure first: <code>kubectl get rs,deploy -o wide</code> and compare selectors; check each pod's <code>ownerReferences</code>.`, `Fix: give each Deployment a unique selector label (selectors are immutable, so recreate the Deployment).`, `Fix: never share a label set between workloads that have different templates.`, `Verify: pod count equals <code>replicas</code> for each Deployment and stops changing.`],
      note: `Deployment docs warn that controllers with overlapping selectors fight each other. ${src('https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#selector', 'Deployments: Selector')}` },
    { t: 'Hot loop', sym: `One controller burns CPU and floods the API server with identical failing calls.`,
      ctx: `A custom operator reconciles a resource that references a missing Secret. The reconcile returns an error every time it is called.`,
      why: `Returning an error requeues the key immediately. Without backoff the same key is retried at full speed. Work queue rate limiters add per-item exponential delay for exactly this reason; custom code that bypasses them (or requeues with zero delay) spins.`,
      log: `-- representative output, values illustrative
E1008 03:20:01.001 controller.go: reconcile "ns/db-7": secret "db-creds" not found
E1008 03:20:01.002 controller.go: reconcile "ns/db-7": secret "db-creds" not found
E1008 03:20:01.003 controller.go: reconcile "ns/db-7": secret "db-creds" not found
(2400 lines per second, illustrative)`,
      fix: [`Measure first: look at the controller's work queue metrics (<code>workqueue_retries_total</code>, <code>workqueue_depth</code>) and its error rate.`, `Fix: requeue through the rate-limited queue (<code>AddRateLimited</code>) so each failing key backs off.`, `Fix: distinguish permanent errors from transient ones and record a status condition instead of retrying forever.`, `Verify: retries per minute for the key fall, and the API server request rate from this client drops.`],
      note: `Identical lines milliseconds apart for one key means no backoff. ${src('https://kubernetes.io/docs/concepts/architecture/controller/', 'Controllers')}` }
  ],
  source: { label: 'Original: Controllers and Reconcile Loops', href: '01-k8s-internals-end-to-end.html#ch3' },
  scenarios: [
    { id: 'levels', label: 'Lost DELETE event', desc: 'A pod is deleted while the controller is down, so its DELETE event is lost. Edge-triggered handling never recovers; level-triggered reconcile recreates the pod at the next relist.',
      codeLabel: 'Commands',
      code: { bug: ['$ kubectl drain node-7 --ignore-daemonsets', '# DELETE event for web-abc is lost while the controller restarts', '$ kubectl get pods -l app=web', 'web-7d9f6c5b8-aaaaa   1/1   Running', 'web-7d9f6c5b8-bbbbb   1/1   Running', '# 2 of 3 replicas: nothing re-counts the Pods'],
              fix: ['# level-triggered: reconcile re-reads the state on every wake-up', '# counts matching Pods: 2, spec.replicas: 3', '# creates 1 Pod with an empty spec.nodeName', '$ kubectl get pods -l app=web   # 3 Running'] },
      diagram: { w: 640, h: 290, nodes: [
        N('api', 10, 110, 150, 'API server', 'LIST + WATCH'),
        N('refl', 230, 20, 160, 'Reflector', 'list then watch'),
        N('cache', 430, 20, 170, 'Informer cache', 'local copy'),
        N('q', 430, 110, 170, 'Work queue', 'keys, backoff'),
        N('rec', 230, 200, 160, 'Reconcile', 'desired vs actual')],
        edges: [E('e1', 'api', 'refl', 'list/watch'), E('e2', 'refl', 'cache', 'store'), E('e3', 'cache', 'q', 'enqueue key'), E('e4', 'q', 'rec', 'next key'), E('e5', 'rec', 'cache', 'read'), E('e6', 'rec', 'api', 'create/delete')] },
      bug: [
        { log: 'A node drain deletes one Pod while the controller is down. The DELETE event is not delivered to the controller.', code: 1, hl: { nodes: { api: 'warn' }, edges: { e1: 'dim' } }, stats: [{ l: 'Pods running', v: 2, cls: 'bad' }, { l: 'spec.replicas', v: 3 }] },
        { log: 'When the controller starts, its handler sees no pending event for this key, so it has nothing queued.', code: 2, hl: { nodes: { q: 'dim' }, edges: { e3: 'dim' } } },
        { log: 'An edge-triggered handler only acts on events. With no event it does nothing, so the gap stays.', code: 2, hl: { nodes: { rec: 'bad' } }, stats: [{ l: 'stuck forever', v: 'yes', cls: 'bad' }] },
        { log: 'Two Pods run where three are wanted. The on-call waits and nothing changes.', code: 5, hl: { nodes: { cache: 'warn' } }, stats: [{ l: 'actual / desired', v: '2 / 3', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The controller starts with a LIST, which fills the informer cache with the current Pods. The watch then continues.', code: 0, hl: { nodes: { refl: 'ok', cache: 'ok' }, edges: { e1: 'on', e2: 'on' } } },
        { log: 'Reconcile counts the matching Pods (2) against spec.replicas (3) and creates one. The Pod has no node yet.', code: 1, hl: { nodes: { rec: 'ok' }, edges: { e6: 'on' } }, stats: [{ l: 'actual / desired', v: '3 / 3', cls: 'ok' }] },
        { log: 'A periodic resync also re-reads state, so a missed event is corrected on the next pass even without a restart.', code: 3, hl: { nodes: { q: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'stuck forever', v: 'no', cls: 'ok' }] }
      ] },
    { id: 'hotloop', label: 'Missing Secret loop', desc: 'A reconcile fails on a missing Secret and requeues the key with no delay. Using the rate limiter, the retries back off (delays illustrative).',
      codeLabel: 'Log',
      code: { bug: ['E1008 03:20:01.001 controller.go: reconcile "ns/db-7": secret "db-creds" not found', 'E1008 03:20:01.002 controller.go: reconcile "ns/db-7": secret "db-creds" not found', '# requeue with zero delay: queue.Add(key)'],
              fix: ['# requeue through the rate limiter', 'queue.AddRateLimited(key)', '# delays for one key: 5 ms, 10 ms, 20 ms ... capped (illustrative)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('rc', 10, 110, 170, 'Reconcile', 'key ns/db-7'),
        N('err', 230, 110, 170, 'Secret missing', 'error returned'),
        N('imm', 450, 20, 170, 'Requeue now', 'queue.Add(key)'),
        N('rl', 450, 200, 170, 'Rate limiter', 'AddRateLimited')],
        edges: [E('e1', 'rc', 'err', 'fails'), E('e2', 'err', 'imm', 'no delay'), E('e3', 'err', 'rl', 'backoff'), E('e4', 'rl', 'rc', 'retry later')] },
      bug: [
        { log: 'Reconcile runs for key ns/db-7. Secret db-creds does not exist, so the reconcile returns an error.', code: 0, hl: { nodes: { rc: 'on', err: 'bad' }, edges: { e1: 'on' } } },
        { log: 'The error path requeues the key immediately with zero delay.', code: 2, hl: { nodes: { imm: 'bad' }, edges: { e2: 'bad' } } },
        { log: 'The same key runs again milliseconds later. The loop repeats with no pause.', code: 1, hl: { nodes: { rc: 'bad' }, edges: { e4: 'dim' } }, stats: [{ l: 'retries per minute', v: 'about 144000 (illustrative)', cls: 'bad' }] },
        { log: 'CPU and the API request rate from this client both climb, and other controllers see the load.', code: 0, hl: { nodes: { imm: 'warn' } }, stats: [{ l: 'log lines per second', v: 2400, cls: 'bad' }] }
      ],
      fix: [
        { log: 'The error is requeued through the rate limiter. Each failure of this key waits longer than the last.', code: 1, hl: { nodes: { rl: 'ok' }, edges: { e3: 'on' } } },
        { log: 'Retries now follow the backoff curve. The key runs about ten times a minute (illustrative) instead of thousands.', code: 2, hl: { nodes: { rl: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'retries per minute', v: '~10 (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 4 · Scheduler: Filter, Score, Bind ---------- */
{ title: 'Scheduler: Filter, Score, Bind',
  problem: `The search team deploys <code>indexer</code> with a request of 200m CPU and a <code>nodeSelector</code> for SSD nodes. The cluster has 6 nodes in this view (illustrative), and dashboards show average CPU usage around 25% (illustrative). The pod stays Pending, and the event lists reasons that do not match the dashboards.`,
  predict: { q: `A node has 4 CPU, real usage is 1 CPU, but the <b>requests</b> of its pods add up to 3.9 CPU. Can a 200m pod be scheduled there?`,
    opts: [`Yes: only 1 of 4 CPU is actually used`, `No: the scheduler adds requests, and 3.9 + 0.2 exceeds 4`, `Yes, but only with a toleration`], ans: 1,
    why: `The scheduler works with declared requests, not live usage (NodeResourcesFit compares the sum of requests with allocatable). Idle usage does not create room; only lower requests or more capacity do.` },
  explain: `<h3>The idea</h3>
<p>Placing a pod is a constraint problem. Only some nodes can run it, and among those the scheduler should keep the cluster balanced. The scheduler does this in three stages: <b>Filter</b> removes nodes that cannot run the pod, <b>Score</b> ranks the rest, and <b>Bind</b> records the choice. It works from declared <b>requests</b>, not from live CPU usage.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The pod waits in the scheduling queue with no <code>spec.nodeName</code>.</li>
<li><b>Filter</b> plugins run in order. <code>NodeResourcesFit</code> compares the pod's requests with each node's allocatable capacity minus the requests already placed there. <code>TaintToleration</code> checks taints, <code>NodeAffinity</code> checks <code>nodeSelector</code> and affinity, and <code>InterPodAffinity</code> checks pod (anti-)affinity. The first plugin that rejects a node is the reason it is dropped.</li>
<li><b>Score</b> ranks the feasible nodes. By default it favours less-allocated nodes and balanced CPU and memory, plus image locality and topology spread.</li>
<li><b>Bind</b> writes a Binding that sets <code>spec.nodeName</code>. The kubelet on that node then starts the pod.</li>
</ol>
<p>If every node fails some filter, the pod stays Pending and the event reports counts per reason, such as <code>3 Insufficient cpu</code>. Those counts must add up to the node count.</p>
<h3>The trade-off</h3>
<p>Requests make scheduling predictable and protect neighbours, but they reserve capacity that may sit idle. Setting requests near real use frees room; setting them too low risks overcommitted nodes. Hard rules such as <code>nodeSelector</code>, taints and required anti-affinity only ever remove nodes, so they can leave a pod with nowhere to go.</p>`,
  diagnose: [
    { t: 'FailedScheduling', sym: `The pod is <code>Pending</code> and the event says <code>0/N nodes are available</code> with counts per reason.`,
      ctx: `An SSD-only workload with a small request meets full SSD nodes and tainted GPU nodes.`,
      why: `Each node is dropped by the first Filter plugin that rejects it, and the event reports how many nodes failed for each reason. A pod stays Pending until a node passes every filter.`,
      log: `-- representative output, wording varies by version
Events:
  Warning  FailedScheduling  default-scheduler
  0/6 nodes are available: 3 Insufficient cpu,
  2 node(s) had untolerated taint {dedicated: gpu},
  1 node(s) didn't match Pod's node affinity/selector.`,
      fix: [`Measure first: <code>kubectl describe pod &lt;pod&gt;</code> and read the FailedScheduling counts; compare with <code>kubectl describe node</code> (Allocated resources).`, `Fix: for Insufficient cpu or memory, add capacity or lower other workloads' requests.`, `Fix: for taints, add a toleration only if the pod should use those nodes; for selector mismatch, fix the label or the selector.`, `Verify: the Pending pod becomes Running and <code>kubectl get pod -o wide</code> shows its node.`],
      note: `Add the counts: they must equal the node count. Each reason names the filter to fix. ${src('https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/', 'Kubernetes Scheduler')}` },
    { t: 'Idle but full', sym: `Cluster CPU usage is 20%, yet new pods are Pending with Insufficient cpu.`,
      ctx: `Teams copy a template that requests 2 CPU per pod. Real use is 150m (illustrative).`,
      why: `Scheduling uses requests as a reservation. Inflated requests reserve capacity nobody uses, so allocatable fills up long before real CPU does, and you pay for idle nodes.`,
      log: `-- representative output, values illustrative
$ kubectl describe node node-1 | grep -A4 "Allocated resources"
  Resource  Requests      Limits
  cpu       3900m (97%)   8 (200%)
$ kubectl top node node-1
NAME     CPU(cores)   CPU%
node-1   980m         24%`,
      fix: [`Measure first: compare <code>kubectl top pod</code> history (or Prometheus) with <code>resources.requests</code>.`, `Fix: set requests near the observed p90-p95 plus headroom; a Vertical Pod Autoscaler in recommendation mode can suggest values.`, `Fix: set memory requests carefully because memory cannot be reclaimed by throttling.`, `Verify: allocated requests per node drop, previously Pending pods schedule, and no new OOMKills appear.`],
      note: `97% requested against 24% used is the signal. Compare requests with measured usage. ${src('https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/', 'Resource Management for Pods and Containers')}` },
    { t: 'Anti-affinity', sym: `Replicas 4 and 5 of a Deployment stay Pending with an anti-affinity reason.`,
      ctx: `A Deployment scaled from 3 to 5 replicas on a 4-node pool with required pod anti-affinity per host.`,
      why: `<code>requiredDuringSchedulingIgnoredDuringExecution</code> anti-affinity is a hard filter: at most one matching pod per topology domain. With 5 replicas and 4 hosts, one replica has no legal node.`,
      log: `-- representative output, wording varies by version
Warning  FailedScheduling  default-scheduler
0/4 nodes are available: 4 node(s) didn't match pod anti-affinity rules.`,
      fix: [`Measure first: count replicas against nodes in the topology domain and read the FailedScheduling message.`, `Fix: use <code>topologySpreadConstraints</code> with <code>maxSkew</code> and <code>whenUnsatisfiable: ScheduleAnyway</code>, or <code>preferredDuringSchedulingIgnoredDuringExecution</code> anti-affinity.`, `Fix: or add nodes so domains are at least as many as replicas.`, `Verify: all replicas are Running and <code>kubectl get pods -o wide</code> shows an even spread.`],
      note: `The count equals the number of nodes: the rule, not capacity, is the blocker. ${src('https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#inter-pod-affinity-and-anti-affinity', 'Assigning Pods to Nodes: Inter-pod affinity and anti-affinity')}` }
  ],
  source: { label: 'Original: Scheduler: Filter, Score, Bind', href: '01-k8s-internals-end-to-end.html#ch4' },
  scenarios: [
    { id: 'filter', label: 'Why Pending?', desc: 'The indexer pod asks for 200m and an SSD node. Each node is dropped by the first filter that rejects it, and the counts in the event add up to the node count (illustrative cluster).',
      codeLabel: 'Event',
      code: { bug: ['Events:', '  Warning  FailedScheduling  default-scheduler', '  0/6 nodes are available: 3 Insufficient cpu,', '  2 node(s) had untolerated taint {dedicated: gpu},', "  1 node(s) didn't match Pod's node affinity/selector."],
              fix: ['$ kubectl get pod indexer -o wide', 'indexer-6f9d   1/1   Running   ssd-node-7   # illustrative node name'] },
      diagram: { w: 640, h: 290, nodes: [
        N('q', 10, 110, 170, 'Pending pod', 'indexer, 200m, SSD'),
        N('f1', 230, 20, 170, 'Insufficient cpu', '3 nodes dropped'),
        N('f2', 230, 110, 170, 'Untolerated taint', '2 nodes dropped'),
        N('f3', 230, 200, 170, 'Selector mismatch', '1 node dropped'),
        N('res', 450, 110, 170, 'Feasible nodes', '0 left: Pending')],
        edges: [E('e1', 'q', 'f1', 'filter 1'), E('e2', 'f1', 'f2', 'survivors'), E('e3', 'f2', 'f3', 'survivors'), E('e4', 'f3', 'res', 'none left')] },
      bug: [
        { log: 'The scheduler takes the pending indexer pod. It asks for 200m CPU and the SSD selector.', code: 0, hl: { nodes: { q: 'on' } } },
        { log: 'NodeResourcesFit drops three nodes: their requests plus 200m exceed allocatable CPU.', code: 2, hl: { nodes: { f1: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'feasible left', v: 3, cls: 'warn' }] },
        { log: 'TaintToleration drops two GPU nodes: the pod has no toleration for dedicated=gpu.', code: 3, hl: { nodes: { f2: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'feasible left', v: 1, cls: 'warn' }] },
        { log: 'NodeAffinity drops the last node, which is not labelled as SSD. Nothing is feasible, so the pod stays Pending.', code: 4, hl: { nodes: { f3: 'bad', res: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'feasible nodes', v: 0, cls: 'bad' }, { l: 'pod', v: 'Pending', cls: 'bad' }] }
      ],
      fix: [
        { log: 'An SSD node with spare CPU is added. Its requests plus 200m fit, so the CPU filter keeps it.', code: 0, hl: { nodes: { f1: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'feasible nodes', v: 1, cls: 'ok' }] },
        { log: 'It has no taint and matches the selector, so it passes the rest. Score ranks it and Bind sets spec.nodeName.', code: 1, hl: { nodes: { res: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'pod', v: 'Running', cls: 'ok' }] }
      ] },
    { id: 'idle', label: 'Requests vs usage', desc: 'Copied templates request 2 CPU per pod, so nodes look full while real usage is low (illustrative). Matching requests to measured usage lets the pod fit.',
      codeLabel: 'Manifest',
      code: { bug: ['resources:', '  requests:', '    cpu: 2   # copied template; real use is about 150m (illustrative)', 'Allocated resources:', '  cpu  3900m (97%)'],
              fix: ['resources:', '  requests:', '    cpu: 250m   # near observed p95 plus headroom (illustrative)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('n1', 10, 40, 220, 'node-1 requests 97%', 'Allocated 3900m of 4000m', 60),
        N('use', 10, 170, 220, 'node-1 usage 24%', 'kubectl top node', 60),
        N('new', 380, 100, 220, 'New pod 200m', 'Pending or Running', 60)],
        edges: [E('e1', 'n1', 'new', 'no room'), E('e2', 'use', 'new', 'unused capacity')] },
      bug: [
        { log: 'The template requests 2 CPU per pod. Existing pods add up to 3900m of the 4000m node capacity.', code: 4, hl: { nodes: { n1: 'bad' } }, stats: [{ l: 'requested', v: '97%', cls: 'bad' }] },
        { log: 'Real use on node-1 is 24% (illustrative). The CPU is idle, but the scheduler does not look at usage.', code: 1, hl: { nodes: { use: 'ok' } }, stats: [{ l: 'real use', v: '24%', cls: 'ok' }] },
        { log: 'The new pod asks for 200m. 3900m plus 200m is more than 4000m, so the CPU filter rejects node-1.', code: 3, hl: { nodes: { new: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'pod', v: 'Pending: Insufficient cpu', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Requests are set near the observed p95 plus headroom. The reservation now matches what the pod really uses.', code: 2, hl: { nodes: { n1: 'ok', use: 'ok' } }, stats: [{ l: 'requested', v: '60% (illustrative)', cls: 'ok' }] },
        { log: 'Requested CPU per node falls, the new pod fits, and the scheduler binds it to node-1.', code: 0, hl: { nodes: { new: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'pod', v: 'Running', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 5 · Kubelet and Pod Lifecycle ---------- */
{ title: 'Kubelet and Pod Lifecycle',
  problem: `The new <code>web</code> pods were scheduled within seconds, but one node shows <code>ImagePullBackOff</code>, another flips between <code>Running</code> and <code>CrashLoopBackOff</code>, and a third shows <code>OOMKilled</code> while the node has plenty of free memory. The on-call must decide whether the cause is an image, an app or a limit.`,
  predict: { q: `A container exceeds its <b>memory limit</b>. What does <code>kubectl describe pod</code> show for that container?`,
    opts: [`State Waiting, Reason ImagePullBackOff`, `Last State Terminated, Reason OOMKilled, Exit Code 137`, `Last State Terminated, Reason Completed, Exit Code 0`], ans: 1,
    why: `The limit is a cgroup memory limit. When the container goes over it the kernel OOM-kills the process (SIGKILL, exit code 137 = 128 + 9). The kubelet records Terminated with reason OOMKilled and then restarts the container according to restartPolicy.` },
  explain: `<h3>The idea</h3>
<p>A pod is only a record until an agent on its node turns it into running processes. The <b>kubelet</b> runs on every node. It watches the Pods bound to its node, asks the container runtime to run them, enforces their resource limits and writes the status back to the API server.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The kubelet watches Pods whose <code>spec.nodeName</code> is its node.</li>
<li>It calls the container runtime through the <b>CRI</b> (for example containerd or CRI-O) to pull the image, create the sandbox and start each container.</li>
<li>Limits are enforced through cgroups. A memory limit is hard: a container that goes over it is OOM-killed with exit code 137. A CPU limit is a CFS quota: a container that uses its quota in a 100 ms period is throttled, not killed.</li>
<li>When a container exits, the kubelet records a Terminated state with a reason and restarts it according to <code>restartPolicy</code>. Failed pulls and crashes wait with exponential back-off, starting at 10 seconds and capped at 5 minutes by default.</li>
</ol>
<p>Each failure has a different signature in <code>kubectl describe pod</code>: a pull error shows <code>ErrImagePull</code> with no container start, a crash shows <code>CrashLoopBackOff</code> with an exit code, and an OOM kill shows <code>Reason: OOMKilled</code>.</p>
<h3>The trade-off</h3>
<p>Restarts hide transient faults, but they also hide how fast an app fails. Memory limits protect neighbours but turn any peak above the limit into a kill, so limits must sit above real peaks. CPU limits prevent noisy neighbours but can throttle latency-sensitive code even when the node is idle.</p>`,
  diagnose: [
    { t: 'ImagePullBackOff', sym: `The pod stays Pending with the container Waiting and the reason cycling between ErrImagePull and ImagePullBackOff.`,
      ctx: `A deploy references a tag that was never pushed, or a private registry without an <code>imagePullSecret</code>.`,
      why: `The pull failed. The kubelet retries with growing delays, reporting <code>ErrImagePull</code> during the attempt and <code>ImagePullBackOff</code> while it waits. The container never starts, so there are no application logs.`,
      log: `-- representative output, wording varies by version
Events:
  Warning  Failed   kubelet  Failed to pull image "registry.example.com/web:1.O":
                              rpc error: ... not found
  Warning  Failed   kubelet  Error: ErrImagePull
  Normal   BackOff  kubelet  Back-off pulling image "registry.example.com/web:1.O"
  Warning  Failed   kubelet  Error: ImagePullBackOff`,
      fix: [`Measure first: <code>kubectl describe pod</code>; read the first <code>Failed to pull image</code> event for the real cause.`, `Fix: correct the tag, or add an <code>imagePullSecrets</code> entry for a private registry.`, `Fix: pin images by digest or an immutable tag so a typo cannot reach production.`, `Verify: the pod reaches Running and the Events show a successful Pulled and Started.`],
      note: `Read the first Failed line: it carries the registry's real error (not found, unauthorized). ${src('https://kubernetes.io/docs/concepts/containers/images/#imagepullbackoff', 'Images: ImagePullBackOff')}` },
    { t: 'CrashLoop', sym: `Restart count climbs and the pod alternates between Running and CrashLoopBackOff.`,
      ctx: `The container exits with code 1 two seconds after start because a required environment variable is missing.`,
      why: `With <code>restartPolicy: Always</code> the kubelet restarts the container each time it exits, but waits longer each time: 10 s, 20 s, 40 s and so on, capped at 5 minutes. The delay resets after the container runs cleanly for a while.`,
      log: `-- representative output, values illustrative
$ kubectl get pod web-7d9f6c5b8-abcde
NAME                  READY   STATUS             RESTARTS      AGE
web-7d9f6c5b8-abcde   0/1     CrashLoopBackOff   6 (3m ago)    9m
$ kubectl logs web-7d9f6c5b8-abcde --previous
FATAL: DATABASE_URL is not set`,
      fix: [`Measure first: <code>kubectl logs --previous</code> and <code>kubectl describe pod</code> (Last State, Exit Code).`, `Fix: fix the failing startup condition: missing config, bad command, unreachable dependency.`, `Fix: make the app fail with a clear message, and check Exit Code (1 app error, 137 killed, 143 SIGTERM).`, `Verify: restart count stops increasing and the pod stays Running.`],
      note: `Use <code>--previous</code> to read the last crashed attempt. ${src('https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy', 'Pod Lifecycle: Restart policy')}` },
    { t: 'OOMKilled', sym: `<code>Last State: Terminated, Reason: OOMKilled, Exit Code: 137</code>, and the restart count rises.`,
      ctx: `A service peaks at 450 MiB (illustrative) during startup caches but has <code>limits.memory: 256Mi</code>.`,
      why: `The memory limit is enforced by the kernel through the container cgroup. A process that grows past it is killed with SIGKILL. The node can have plenty of free memory; the limit is per container.`,
      log: `-- representative output, values illustrative
    State:          Running
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    Restart Count:  4
    Limits:
      memory:  256Mi`,
      fix: [`Measure first: read peak working set from metrics (<code>container_memory_working_set_bytes</code>) over a representative period, including startup.`, `Fix: raise <code>limits.memory</code> above the peak with headroom and set the request near typical use.`, `Fix: if memory keeps growing, it is a leak: fix the application instead of raising limits forever.`, `Verify: <code>Restart Count</code> stops rising and no new OOMKilled appears in Last State.`],
      note: `Reason OOMKilled plus 137 identifies a memory-limit kill, as opposed to an app crash with exit 1. ${src('https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#how-pods-with-resource-limits-are-run', 'How Pods with resource limits are run')}` },
    { t: 'CPU throttle', sym: `p99 latency spikes every 100 ms window although node CPU is below 40%.`,
      ctx: `A service with <code>limits.cpu: 500m</code> bursts to 2 cores for a few milliseconds per request.`,
      why: `A CPU limit is a CFS quota per 100 ms period. Once a container uses its quota inside the period, its threads are paused until the next period, regardless of idle CPU on the node.`,
      log: `-- representative output, values illustrative
container_cpu_cfs_throttled_periods_total / container_cpu_cfs_periods_total
web-7d9f6c5b8-abcde   0.62   (62% of periods throttled)
node CPU utilisation  38%`,
      fix: [`Measure first: the ratio of <code>container_cpu_cfs_throttled_periods_total</code> to <code>container_cpu_cfs_periods_total</code> per container.`, `Fix: raise the CPU limit or remove it for latency-sensitive workloads, keeping a realistic request.`, `Fix: make sure thread pools match the CPU you actually have (for example GOMAXPROCS or JVM CPU count).`, `Verify: the throttled ratio and p99 latency fall.`],
      note: `A high throttled-period ratio with a low node CPU is the signature. ${src('https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#how-pods-with-resource-limits-are-run', 'How Pods with resource limits are run')}` }
  ],
  source: { label: 'Original: Kubelet and Pod Lifecycle', href: '01-k8s-internals-end-to-end.html#ch5' },
  scenarios: [
    { id: 'oom', label: 'Memory limit low', desc: 'Startup caches grow to 450 MiB (illustrative) but the memory limit is 256Mi. The kernel kills the process, and the kubelet restarts it. Raising the limit above the peak stops the kills.',
      codeLabel: 'Config',
      code: { bug: ['resources:', '  limits:', '    memory: 256Mi', '# Last State:   Terminated', '#   Reason:     OOMKilled', '#   Exit Code:  137'],
              fix: ['resources:', '  limits:', '    memory: 600Mi   # above the 450 MiB peak (illustrative)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('kl', 10, 110, 170, 'Kubelet', 'reconciles Pods'),
        N('cri', 230, 110, 170, 'Container runtime', 'CRI starts it'),
        N('cg', 450, 20, 170, 'cgroup limit', 'memory 256Mi'),
        N('ct', 450, 200, 170, 'Container process', 'peak 450 MiB'),
        N('st', 230, 220, 170, 'Pod status', 'Restart Count')],
        edges: [E('e1', 'kl', 'cri', 'start'), E('e2', 'cri', 'cg', 'set limit'), E('e3', 'cg', 'ct', 'enforce'), E('e4', 'ct', 'kl', 'exit 137'), E('e5', 'kl', 'st', 'status')] },
      bug: [
        { log: 'The kubelet asks the runtime to start the container. The runtime sets a cgroup memory limit of 256 MiB.', code: 1, hl: { nodes: { kl: 'on', cri: 'on', cg: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'memory limit', v: '256 MiB', cls: 'warn' }] },
        { log: 'The startup caches grow to 450 MiB (illustrative). The process goes over its cgroup limit.', code: 2, hl: { nodes: { ct: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'peak memory', v: '450 MiB (illustrative)', cls: 'bad' }] },
        { log: 'The kernel OOM-kills the process with SIGKILL. The exit code is 137, which is 128 plus 9.', code: 2, hl: { nodes: { ct: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'exit code', v: 137, cls: 'bad' }] },
        { log: 'The kubelet records Terminated with reason OOMKilled and restarts the container. Each cycle repeats the kill.', code: 3, hl: { nodes: { st: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'Restart Count', v: 4, cls: 'bad' }] }
      ],
      fix: [
        { log: 'The memory limit is raised to 600 MiB, above the 450 MiB peak. The node still enforces it per container.', code: 2, hl: { nodes: { cg: 'ok' } }, stats: [{ l: 'memory limit', v: '600 MiB (illustrative)', cls: 'ok' }] },
        { log: 'The startup caches fit under the limit. The process runs with no OOM kill, and Restart Count stops rising.', code: 0, hl: { nodes: { ct: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'Restart Count', v: 0, cls: 'ok' }] }
      ] },
    { id: 'crash', label: 'Crash loop', desc: 'The app exits with code 1 because DATABASE_URL is missing. The kubelet waits longer before each restart (10 s, 20 s, 40 s, capped at 5 minutes). Providing the variable fixes the loop.',
      codeLabel: 'Manifest',
      code: { bug: ['# web container has no DATABASE_URL', 'containers:', '  - name: web', '    image: registry.example.com/web:1.0', '    # env: missing', '# app prints: FATAL: DATABASE_URL is not set and exits 1'],
              fix: ['env:', '  - name: DATABASE_URL', '    valueFrom:', '      secretKeyRef:', '        name: web-db', '        key: url'] },
      diagram: { w: 640, h: 290, nodes: [
        N('ct', 10, 110, 170, 'Container', 'starts, exits 1'),
        N('kl', 230, 110, 170, 'Kubelet', 'restartPolicy Always'),
        N('bo', 450, 20, 170, 'Back-off timer', '10 s, 20 s, 40 s'),
        N('run', 450, 200, 170, 'Container run', 'about 2 s')],
        edges: [E('e1', 'ct', 'kl', 'exit 1'), E('e2', 'kl', 'bo', 'wait'), E('e3', 'bo', 'run', 'restart'), E('e4', 'run', 'ct', 'crash')] },
      bug: [
        { log: 'The container starts and the app reads DATABASE_URL. It is not set, so the app prints FATAL and exits with code 1.', code: 5, hl: { nodes: { ct: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'exit code', v: 1, cls: 'bad' }] },
        { log: 'The kubelet sees the exit and waits 10 s before restarting (CrashLoopBackOff).', code: 0, hl: { nodes: { kl: 'warn', bo: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'back-off', v: '10 s', cls: 'warn' }] },
        { log: 'The container restarts, runs about 2 s and exits again. Each wait is longer than the last, up to 5 minutes.', code: 1, hl: { nodes: { run: 'bad' }, edges: { e3: 'on', e4: 'bad' } }, stats: [{ l: 'RESTARTS', v: 6, cls: 'bad' }] },
        { log: 'Most of the time is spent waiting, so the pod is almost never Running. The logs of each run are gone unless you use --previous.', code: 0, hl: { nodes: { bo: 'bad' } }, stats: [{ l: 'time Running', v: 'mostly zero', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The variable is read from a Secret through secretKeyRef, so the app gets a valid URL at start.', code: 1, hl: { nodes: { ct: 'ok' } }, stats: [{ l: 'DATABASE_URL', v: 'set', cls: 'ok' }] },
        { log: 'The app starts and stays up. The restart count stays at 0 and the pod stays Running.', code: 0, hl: { nodes: { run: 'ok' }, edges: { e4: 'dim' } }, stats: [{ l: 'RESTARTS', v: 0, cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 6 · Probes and Readiness ---------- */
{ title: 'Probes and Readiness',
  problem: `The <code>web</code> pods have a liveness probe on <code>/health</code>, and that endpoint runs <code>SELECT 1</code> against the database. At 11:20 the database fails over and is unreachable for 40 seconds (illustrative). All four replicas fail the probe, the kubelets restart them, and the outage lasts several minutes instead of 40 seconds.`,
  predict: { q: `The <b>readiness</b> probe of a container fails. What does the kubelet do?`,
    opts: [`Restarts the container`, `Marks the pod NotReady so it is removed from Service endpoints; the container keeps running`, `Deletes the pod and lets the ReplicaSet recreate it`], ans: 1,
    why: `Readiness only controls the Ready condition. A NotReady pod is taken out of the ready addresses in EndpointSlices, but its container is not restarted. Only a failing liveness probe (or startup probe running out of budget) restarts the container.` },
  explain: `<h3>The idea</h3>
<p>A running process is not the same as a process that can serve traffic. Kubernetes separates the two questions and asks them with separate probes: <b>liveness</b> asks whether the process is stuck and should be restarted, <b>readiness</b> asks whether it can take traffic now, and <b>startup</b> protects slow starters from the other two until they are up.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The kubelet runs each configured probe on its own schedule. A probe can be an HTTP GET, a TCP connection, a gRPC check or a command run in the container.</li>
<li>Liveness failures count up. After <code>failureThreshold</code> consecutive failures the kubelet restarts the container.</li>
<li>Readiness failures set the pod's <code>Ready</code> condition to false. The EndpointSlice controller then removes the pod from the ready addresses, so no new traffic is sent to it. The container is not restarted.</li>
<li>Startup gives slow starters a budget of <code>failureThreshold</code> times <code>periodSeconds</code>. While it runs, the liveness and readiness probes are held back.</li>
</ol>
<p>The defaults are <code>initialDelaySeconds</code> 0, <code>periodSeconds</code> 10, <code>timeoutSeconds</code> 1, <code>successThreshold</code> 1 and <code>failureThreshold</code> 3.</p>
<h3>The trade-off</h3>
<p>A liveness probe that checks a shared dependency turns a dependency outage into a restart of every replica, and the restarts do not fix the dependency. Keep liveness shallow, so it only proves the process is alive, and let readiness reflect dependencies. The cost is that a truly broken pod can stay NotReady rather than restart, so you still need a clear signal to act on. Read restart counts and Ready status together, since they answer different questions.</p>`,
  diagnose: [
    { t: 'Deep liveness', sym: `All replicas restart together during a dependency outage; restart counts jump on every pod.`,
      ctx: `<code>/health</code> is used for both liveness and readiness and calls the database.`,
      why: `Liveness failure restarts the container, but a restart cannot fix a dependency that is down. Every replica fails the same check at the same time, so the whole fleet restarts and capacity drops to zero for the duration.`,
      log: `-- representative output, wording varies by version
Events:
  Warning  Unhealthy  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
  Normal   Killing    kubelet  Container web failed liveness probe, will be restarted`,
      fix: [`Measure first: <code>kubectl get pods</code> restart counts and <code>kubectl describe pod</code> events; check what <code>/health</code> calls.`, `Fix: make liveness a shallow check of the process only (event loop alive), and put dependency checks in readiness.`, `Fix: keep readiness light enough not to overload the dependency it checks.`, `Verify: repeat a short dependency outage in staging: pods turn NotReady and then Ready again with restart count unchanged.`],
      note: `Same Unhealthy event on every replica in the same minute means a shared dependency, not a stuck process. ${src('https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/', 'Configure Liveness, Readiness and Startup Probes')}` },
    { t: 'No readiness', sym: `Right after a deploy, users get errors for a few seconds from the new pods only.`,
      ctx: `The Deployment has no readiness probe. The JVM takes 40 s (illustrative) to load caches.`,
      why: `A pod with no readiness probe becomes Ready as soon as its containers are running. It is added to endpoints and receives traffic before it can serve.`,
      log: `-- representative output, values illustrative
$ kubectl get pods -w
web-5c8b-xxxxx   1/1   Running   0   2s     <- Ready immediately
(access log) 503 upstream not ready  x 140 in first 40 s`,
      fix: [`Measure first: compare pod Ready time with the first successful request; watch <code>kubectl get endpointslices</code> during a rollout.`, `Fix: add a readiness probe on an endpoint that returns success only when the app can serve.`, `Fix: tune <code>periodSeconds</code> and <code>failureThreshold</code>; consider <code>minReadySeconds</code> on the Deployment.`, `Verify: the error count in the first minute of a rollout drops to zero.`],
      note: `Ready at age 2 s for a 40 s warm-up is the mismatch. ${src('https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-conditions', 'Pod Lifecycle: Pod conditions')}` },
    { t: 'Slow start', sym: `A pod restarts again and again within a minute of starting and never gets Ready.`,
      ctx: `A JVM service needs 60 s (illustrative) to start; liveness has <code>initialDelaySeconds: 10</code>, <code>periodSeconds: 10</code>, <code>failureThreshold: 3</code>.`,
      why: `The liveness budget is about 10 + 3 × 10 = 40 s. The app is not up in time, so the kubelet kills it, and the next start has the same problem, an endless loop.`,
      log: `-- representative output, values illustrative
Events:
  Warning  Unhealthy  kubelet  Liveness probe failed: Get "http://10.0.1.5:8080/health":
                                dial tcp 10.0.1.5:8080: connect: connection refused
  Normal   Killing    kubelet  Container web failed liveness probe, will be restarted`,
      fix: [`Measure first: time from container start to the first successful health response in a normal start.`, `Fix: add a <code>startupProbe</code> with <code>failureThreshold × periodSeconds</code> comfortably above the worst startup time.`, `Fix: keep liveness settings strict, because they only start after the startup probe succeeds.`, `Verify: restart count stays 0 and the pod reaches Ready once.`],
      note: `Connection refused at 10-30 s means the app is not listening yet. ${src('https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-startup-probes', 'Define startup probes')}` },
    { t: 'Tight timeout', sym: `Under a traffic spike pods restart one after another and capacity falls just when it is needed.`,
      ctx: `Liveness uses <code>timeoutSeconds: 1</code> against an endpoint that shares the busy worker pool. The spike makes responses take 1.5 s.`,
      why: `A probe that times out counts as a failure. Under load the app is slow but working, the probes fail, restarts remove capacity, the remaining pods get more load and more probes fail.`,
      log: `-- representative output, wording varies by version
Events:
  Warning  Unhealthy  kubelet  Liveness probe failed: Get "http://10.0.2.9:8080/health":
                                context deadline exceeded (Client.Timeout exceeded while awaiting headers)`,
      fix: [`Measure first: compare probe latency with application p99 during peak; look for <code>context deadline exceeded</code> events.`, `Fix: serve the probe from a path that does not queue behind request handling, and raise <code>timeoutSeconds</code> and <code>failureThreshold</code>.`, `Fix: handle load with autoscaling and readiness (shed traffic), not with liveness restarts.`, `Verify: during a load test the restart count stays at 0 while latency is high.`],
      note: `A timeout (not an error status) during a load spike is the cascade pattern. ${src('https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#configure-probes', 'Configure Probes')}` }
  ],
  source: { label: 'Original: Probes and Readiness', href: '01-k8s-internals-end-to-end.html#ch6' },
  scenarios: [
    { id: 'deep', label: 'Deep liveness outage', desc: 'The liveness probe calls the database. During a 40 s outage (illustrative) every replica is restarted. A shallow liveness and a database readiness probe only remove the pods from traffic.',
      codeLabel: 'Config',
      code: { bug: ['livenessProbe:', '  httpGet:', '    path: /health   # runs SELECT 1 on the database', '    port: 8080', '  periodSeconds: 10', '  failureThreshold: 3'],
              fix: ['livenessProbe:', '  httpGet:', '    path: /livez   # process only (illustrative path)', '    port: 8080', 'readinessProbe:', '  httpGet:', '    path: /ready   # checks the database (illustrative path)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('kl', 10, 110, 170, 'Kubelet', 'runs the probes'),
        N('ct', 230, 110, 170, 'web container', '/health'),
        N('db', 450, 20, 170, 'Database', 'SELECT 1 fails'),
        N('rs', 450, 200, 170, 'Restart container', 'all replicas'),
        N('rd', 230, 220, 170, 'Ready condition', 'NotReady, no restart')],
        edges: [E('e1', 'kl', 'ct', 'probe'), E('e2', 'ct', 'db', 'SELECT 1'), E('e3', 'kl', 'rs', 'fails 3 times'), E('e4', 'kl', 'rd', 'readiness')] },
      bug: [
        { log: 'The database fails over and is unreachable for 40 s (illustrative). The liveness endpoint runs SELECT 1 on it.', code: 2, hl: { nodes: { db: 'bad' }, edges: { e2: 'bad' } } },
        { log: 'Each replica fails its liveness probe three times in a row. The kubelet treats that as a stuck process.', code: 0, hl: { nodes: { kl: 'on' }, edges: { e1: 'on', e3: 'bad' } }, stats: [{ l: 'liveness failures', v: 3, cls: 'bad' }] },
        { log: 'The kubelet restarts all four containers. Restarting does not bring the database back.', code: 1, hl: { nodes: { rs: 'bad' } }, stats: [{ l: 'replicas serving', v: '0 of 4', cls: 'bad' }] },
        { log: 'The new containers start into a database that is still recovering. The probes fail again and the outage lasts several minutes.', code: 2, hl: { nodes: { db: 'warn' } }, stats: [{ l: 'restarts', v: 'rising', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Liveness only checks the process. The database outage no longer fails it, so no container restarts.', code: 1, hl: { nodes: { ct: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'restarts', v: 0, cls: 'ok' }] },
        { log: 'Readiness calls the database and fails. The pod becomes NotReady and leaves the endpoints. The container keeps running.', code: 5, hl: { nodes: { rd: 'warn' }, edges: { e4: 'dim' } }, stats: [{ l: 'pods in traffic', v: '0 during outage (illustrative)', cls: 'warn' }] },
        { log: 'When the database answers, readiness passes again and the pods return to the endpoints with no restarts.', code: 5, hl: { nodes: { rd: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'restarts', v: 0, cls: 'ok' }] }
      ] },
    { id: 'slow', label: 'Slow start budget', desc: 'The JVM needs 60 s (illustrative) to start. Liveness allows about 40 s, so it kills the pod before it is up. A startupProbe with a 150 s budget (illustrative) fixes the loop.',
      codeLabel: 'Config',
      code: { bug: ['livenessProbe:', '  initialDelaySeconds: 10', '  periodSeconds: 10', '  failureThreshold: 3   # budget about 40 s', '# app needs 60 s to start (illustrative)'],
              fix: ['startupProbe:', '  httpGet:', '    path: /health', '    port: 8080', '  periodSeconds: 5', '  failureThreshold: 30   # 150 s budget (illustrative)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('st', 10, 110, 170, 'Container start', 'JVM loading'),
        N('lv', 230, 20, 170, 'Liveness budget', 'about 40 s'),
        N('kill', 450, 20, 170, 'Killed, restarted', 'connection refused'),
        N('sp', 230, 200, 170, 'Startup probe', 'budget 150 s'),
        N('ok', 450, 200, 170, 'Liveness starts', 'app is up')],
        edges: [E('e1', 'st', 'lv', 'liveness'), E('e2', 'lv', 'kill', 'fails 3 times'), E('e3', 'st', 'sp', 'startup'), E('e4', 'sp', 'ok', 'passes')] },
      bug: [
        { log: 'The container starts. Liveness is active from 10 s and checks every 10 s, with 3 allowed failures.', code: 0, hl: { nodes: { st: 'on', lv: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'kill at', v: 'about 40 s', cls: 'bad' }] },
        { log: 'The app is still loading and not listening, so each probe gets connection refused.', code: 4, hl: { nodes: { st: 'warn' } } },
        { log: 'Three failures at about 40 s and the kubelet kills the container. The next start has the same timing, so it loops.', code: 3, hl: { nodes: { kill: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'app ready at', v: '60 s (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A startupProbe allows 30 tries every 5 s, about 150 s (illustrative). Liveness and readiness wait until it passes.', code: 5, hl: { nodes: { sp: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'startup budget', v: '150 s (illustrative)', cls: 'ok' }] },
        { log: 'The app is up at about 60 s. The startup probe passes, and the normal liveness probe takes over with no kill.', code: 5, hl: { nodes: { ok: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'restarts', v: 0, cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 7 · Services, EndpointSlices and kube-proxy ---------- */
{ title: 'Services, EndpointSlices and kube-proxy',
  problem: `Pod IPs change on every deploy, and during scale-down users see a burst of <code>502 Bad Gateway</code> for about 4 seconds (illustrative). No pod crashed and no probe failed, and the errors appear only on scale-down and rolling updates.`,
  predict: { q: `A pod receives SIGTERM. What is guaranteed about <b>removal from every node's forwarding rules</b> versus <b>the process exiting</b>?`,
    opts: [`Rules are removed first, so no traffic can reach a dead process`, `The process always lives until its connections drain`, `Nothing is guaranteed: both start at the same time and race`], ans: 2,
    why: `When a pod is deleted, the API server sets its deletionTimestamp. The kubelet starts shutdown (preStop hook, then SIGTERM) while, in parallel, the EndpointSlice controller removes the endpoint and each node's kube-proxy updates its rules. A process that exits quickly can die before the rules catch up.` },
  explain: `<h3>The idea</h3>
<p>Clients need one stable address even though pods come and go. A <b>Service</b> gives a stable virtual IP (ClusterIP) and a selector. Every node then turns a live list of ready backends into forwarding rules, so a request sent to the virtual IP reaches one of the ready pods.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The Service has a <code>selector</code>. The EndpointSlice controller lists the IPs of pods that match it and are ready, in EndpointSlices.</li>
<li><b>kube-proxy</b> on every node watches EndpointSlices and programs iptables or IPVS rules. The rules rewrite (DNAT) the virtual IP to one backend, chosen for each new connection.</li>
<li>Established connections stay on their backend through conntrack. A long-lived connection never moves to a new pod on its own.</li>
<li>When a pod is deleted, two things happen at once: the kubelet runs the <code>preStop</code> hook and sends SIGTERM, and the endpoint is removed and each node's rules are updated. The rules take a few seconds to reach every node.</li>
</ol>
<p>If the process exits before the rules are updated, some nodes still send new connections to a dead IP and get a 502. A <code>preStop</code> sleep that is longer than the rule-propagation delay closes the gap, and graceful shutdown on SIGTERM drains in-flight requests. <code>terminationGracePeriodSeconds</code> defaults to 30 s.</p>
<h3>The trade-off</h3>
<p>Virtual IPs and rule-based balancing are simple and work for every client, but they balance per connection, not per request. Long-lived HTTP/2 or gRPC connections can pin all traffic to one pod. The cost of the fix is a deliberate delay on shutdown, which slows scale-down a little.</p>`,
  diagnose: [
    { t: 'No endpoints', sym: `Requests to the Service time out or are refused; the Service has no endpoints.`,
      ctx: `The Deployment labels pods <code>app: web-v2</code> but the Service selects <code>app: web</code>.`,
      why: `The EndpointSlice controller only lists pods that match the selector. A typo means an empty list, so kube-proxy has nothing to forward to.`,
      log: `-- representative output, values illustrative
$ kubectl describe svc web
Selector:          app=web
Endpoints:         <none>
$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS
web-4x7kq   IPv4          8080    <unset>`,
      fix: [`Measure first: <code>kubectl get pods --show-labels</code> and <code>kubectl describe svc</code>.`, `Fix: align the Service <code>selector</code> and the pod template labels.`, `Fix: also check <code>targetPort</code> and that the pods are Ready; not-ready pods are not listed as ready endpoints.`, `Verify: <code>kubectl get endpointslices</code> lists the pod IPs and a request through the Service succeeds.`],
      note: `Endpoints <none> with healthy pods is a label mismatch. ${src('https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/', 'EndpointSlices')}` },
    { t: '502 on scale-down', sym: `A short burst of 502 or connection resets whenever pods terminate.`,
      ctx: `The container exits immediately on SIGTERM and there is no preStop hook. Rule updates take about 5 s to reach all nodes (illustrative).`,
      why: `Endpoint removal and process shutdown race. For a few seconds some nodes still send new connections to a pod whose process is already gone.`,
      log: `-- representative output, values illustrative
lb access log (scale-down at 17:05:00):
17:05:01  502  upstream connect error  backend=10.0.1.7:8080
17:05:03  502  upstream connect error  backend=10.0.1.7:8080
17:05:06  200  backend=10.0.1.8:8080`,
      fix: [`Measure first: line up the error timestamps with pod deletion times; estimate the propagation delay.`, `Fix: add a <code>preStop</code> hook with a sleep longer than the delay (for example <code>sleep 10</code>), and size <code>terminationGracePeriodSeconds</code> above sleep plus drain time.`, `Fix: handle SIGTERM by stopping new accepts and finishing in-flight requests.`, `Verify: a scale-down under load produces zero 502s.`],
      note: `Errors confined to one backend IP and a few seconds after deletion mean the race. ${src('https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination', 'Pod Lifecycle: Termination of Pods')}` },
    { t: 'Conntrack full', sym: `Random timeouts across many Services on one node, and the kernel logs a dropped-packet message.`,
      ctx: `A node handles many short outbound connections through Services, and the connection-tracking table fills.`,
      why: `Every NATed connection needs a conntrack entry. When the table reaches <code>net.netfilter.nf_conntrack_max</code>, new connections are dropped until entries expire.`,
      log: `-- representative output, wording varies by kernel
kernel: nf_conntrack: table full, dropping packet
$ sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max
net.netfilter.nf_conntrack_count = 262144
net.netfilter.nf_conntrack_max = 262144`,
      fix: [`Measure first: compare <code>nf_conntrack_count</code> with <code>nf_conntrack_max</code> on affected nodes over time.`, `Fix: reuse connections (keep-alive, connection pools) to reduce churn; shorten idle timeouts only if you understand the effect.`, `Fix: raise <code>nf_conntrack_max</code> on the nodes if memory allows.`, `Verify: the count stays below max at peak and the kernel message stops.`],
      note: `Count equal to max confirms it. ${src('https://kubernetes.io/docs/reference/networking/virtual-ips/', 'Virtual IPs and Service Proxies')}` },
    { t: 'HTTP/2 pinned', sym: `One pod runs hot while its peers are idle, and new pods receive no traffic after a scale-up.`,
      ctx: `A gRPC client opens one connection to the Service and multiplexes everything on it.`,
      why: `The ClusterIP balances per connection, when it is established. All requests on a long-lived connection stay on that one pod, and a scale-up never moves them.`,
      log: `-- representative output, values illustrative
requests per second per pod after scale-up from 3 to 6:
web-a 410   web-b 395   web-c 405   web-d 0   web-e 0   web-f 0`,
      fix: [`Measure first: per-pod request rates after a scale-up; compare to the number of long-lived connections.`, `Fix: use a headless Service with client-side load balancing, or an L7 proxy or mesh that balances per request.`, `Fix: or set a maximum connection age on the server so clients reconnect.`, `Verify: new pods receive a share of traffic within a few minutes of scale-up.`],
      note: `Original pods keep all traffic and new pods stay at zero. ${src('https://kubernetes.io/docs/concepts/services-networking/service/#headless-services', 'Service: Headless Services')}` }
  ],
  source: { label: 'Original: Services, EndpointSlices and kube-proxy', href: '01-k8s-internals-end-to-end.html#ch7' },
  scenarios: [
    { id: 'race', label: 'Scale-down race', desc: 'A pod is deleted. The process exits at about 0.2 s, but rules on each node take about 6 s to update (illustrative). Requests in that gap hit a dead backend. A preStop sleep of 10 s keeps it serving until the rules catch up.',
      codeLabel: 'Config',
      code: { bug: ['spec:', '  terminationGracePeriodSeconds: 30', '  containers:', '  - name: web', '    # no lifecycle.preStop: the process exits on SIGTERM at once', '# rule update on each node takes about 6 s (illustrative)'],
              fix: ['spec:', '  terminationGracePeriodSeconds: 30', '  containers:', '  - name: web', '    lifecycle:', '      preStop:', '        exec:', '          command: ["sleep", "10"]   # longer than the rule-sync lag'] },
      diagram: { w: 640, h: 290, nodes: [
        N('pod', 10, 110, 170, 'Pod deleted', 'deletionTimestamp set'),
        N('kub', 230, 20, 170, 'kubelet', 'SIGTERM, preStop'),
        N('epc', 230, 200, 170, 'EndpointSlice', 'endpoint not ready'),
        N('kp', 450, 200, 170, 'kube-proxy', 'rules still old'),
        N('proc', 450, 20, 170, 'Container process', 'exits at about 0.2 s')],
        edges: [E('e1', 'pod', 'kub', 'shutdown'), E('e2', 'pod', 'epc', 'mark'), E('e3', 'epc', 'kp', 'slices'), E('e4', 'kub', 'proc', 'SIGTERM'), E('e5', 'kp', 'proc', 'still sent')] },
      bug: [
        { log: 'The pod is deleted. The API server sets deletionTimestamp, and shutdown starts on the node at once.', code: 0, hl: { nodes: { pod: 'on' }, edges: { e1: 'on', e2: 'on' } } },
        { log: 'The EndpointSlice controller marks the endpoint not ready. kube-proxy on each node has not yet rewritten its rules.', code: 4, hl: { nodes: { epc: 'warn', kp: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'rule update lag', v: '6 s (illustrative)', cls: 'warn' }] },
        { log: 'Without a preStop hook the process exits at about 0.2 s. Some nodes still forward new connections to its IP.', code: 4, hl: { nodes: { proc: 'bad' }, edges: { e4: 'bad', e5: 'bad' } }, stats: [{ l: 'failed requests', v: '30 (illustrative)', cls: 'bad' }] },
        { log: 'The load balancer logs a 502 for the dead backend IP, a few seconds after the deletion, then a 200 from a live pod.', code: 0, hl: { nodes: { kp: 'bad' } }, stats: [{ l: 'HTTP code', v: 502, cls: 'bad' }] }
      ],
      fix: [
        { log: 'The preStop hook runs sleep 10 before SIGTERM. The process keeps serving while every node drops the endpoint.', code: 7, hl: { nodes: { proc: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'preStop sleep', v: '10 s', cls: 'ok' }] },
        { log: 'After the rules have caught up, SIGTERM arrives. The process stops accepting new requests, finishes in-flight ones and exits.', code: 1, hl: { nodes: { kp: 'ok' }, edges: { e5: 'dim' } }, stats: [{ l: 'failed requests', v: 0, cls: 'ok' }] }
      ] },
    { id: 'pin', label: 'Long HTTP/2 connections', desc: 'A gRPC client keeps a few long-lived connections. After a scale-up, the new pods get no traffic because balancing happened only at connect time.',
      codeLabel: 'Log',
      code: { bug: ['requests per second per pod after scale-up from 3 to 6:', 'web-a 410   web-b 395   web-c 405   web-d 0   web-e 0   web-f 0'],
              fix: ['# headless Service: DNS returns every pod IP', '# the client balances per request across web-a .. web-f'] },
      diagram: { w: 640, h: 290, nodes: [
        N('cli', 10, 110, 170, 'gRPC client', 'few long connections'),
        N('svc', 230, 110, 170, 'ClusterIP Service', 'balances per connect'),
        N('old', 450, 20, 170, 'Pods web-a to c', 'all traffic'),
        N('new', 450, 200, 170, 'Pods web-d to f', 'zero requests')],
        edges: [E('e1', 'cli', 'svc', 'connect'), E('e2', 'svc', 'old', 'pinned'), E('e3', 'svc', 'new', 'no new connections')] },
      bug: [
        { log: 'The client opens three connections through the ClusterIP. The choice of pod is made once per connection.', code: 0, hl: { nodes: { cli: 'on', svc: 'on' }, edges: { e1: 'on' } } },
        { log: 'All requests are multiplexed on those three connections, so they all reach web-a to web-c.', code: 1, hl: { nodes: { old: 'warn' }, edges: { e2: 'dim' } } },
        { log: 'The Deployment scales from 3 to 6. The new pods exist, but no existing connection moves to them.', code: 1, hl: { nodes: { new: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'requests on new pods', v: 0, cls: 'bad' }] }
      ],
      fix: [
        { log: 'A headless Service returns every pod IP, so the client can open connections to all six pods.', code: 0, hl: { nodes: { svc: 'ok' }, edges: { e3: 'on' } } },
        { log: 'The client balances per request, so web-d to web-f receive a share of the traffic.', code: 1, hl: { nodes: { new: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'balance', v: 'even (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 8 · Rolling Update ---------- */
{ title: 'Rolling Update',
  problem: `The <code>web</code> Deployment has 4 replicas. Yesterday's release used <code>maxUnavailable: 50%</code> to finish faster, and for about 40 seconds (illustrative) only two pods served, so latency tripled at the busiest hour. Today the new image crashes on start and the rollout hangs.`,
  predict: { q: `<code>replicas: 4</code>, <code>maxSurge: 0</code>, <code>maxUnavailable: 25%</code>. What is the <b>minimum number of Ready pods</b> during the rollout?`,
    opts: [`4`, `3`, `2`, `1`], ans: 1,
    why: `25% of 4 is 1 (maxUnavailable percentages round down). With no surge, the controller must kill one old pod before it can create a new one, so Ready never drops below 4 - 1 = 3. maxSurge percentages round up.` },
  explain: `<h3>The idea</h3>
<p>A rolling update replaces running pods one by one without going below a safe capacity. The Deployment does this by giving the new version its own <b>ReplicaSet</b> and moving replicas from the old ReplicaSet to the new one in bounded steps. Readiness decides how far it may go, because only Ready pods count as available.</p>
<h3>How it works, step by step</h3>
<ol>
<li>A change to <code>spec.template</code> produces a new pod-template hash, so the Deployment creates a new ReplicaSet. The old ReplicaSet is kept, scaled to 0, for rollback.</li>
<li>Two bounds apply at each step. Total pods may not exceed <code>replicas + maxSurge</code>. Ready pods may not fall below <code>replicas - maxUnavailable</code>. Both default to 25%, and they cannot both be 0.</li>
<li>The controller first scales the new ReplicaSet up within the surge limit. A new pod counts as available only once it is Ready, and after <code>minReadySeconds</code> if set.</li>
<li>Only then does it scale the old ReplicaSet down, within the unavailable limit.</li>
<li>If the new pods never become Ready, the rollout stalls. After <code>progressDeadlineSeconds</code> (600 by default) the Deployment gets the condition <code>ProgressDeadlineExceeded</code>. Old pods keep serving, and nothing rolls back automatically.</li>
</ol>
<h3>The trade-off</h3>
<p>Small bounds keep capacity high but make rollouts slow and need spare cluster room for surge pods. Large bounds finish fast and cut capacity by the same share. Percentages round differently on small fleets: 50% of 4 is two pods, so one setting can halve a service. Use <code>maxUnavailable: 0</code> with <code>maxSurge: 1</code> when latency matters.</p>`,
  diagnose: [
    { t: 'Deadline exceeded', sym: `<code>kubectl rollout status</code> hangs and then reports that the Deployment exceeded its progress deadline.`,
      ctx: `The new image crashes on startup, so its pods never become Ready.`,
      why: `The controller will not remove old pods faster than the Ready count allows. New pods never turn Ready, so the rollout makes no progress; after <code>progressDeadlineSeconds</code> the Deployment gets a <code>Progressing=False</code> condition. Old pods keep serving, and no automatic rollback happens.`,
      log: `-- representative output, wording varies by version
$ kubectl rollout status deploy/web
Waiting for deployment "web" rollout to finish: 2 out of 4 new replicas have been updated...
error: deployment "web" exceeded its progress deadline
$ kubectl get deploy web -o jsonpath='{.status.conditions[?(@.type=="Progressing")].reason}'
ProgressDeadlineExceeded`,
      fix: [`Measure first: <code>kubectl get rs -l app=web</code> and <code>kubectl describe pod</code> on a new pod; read the probe or crash reason.`, `Fix: <code>kubectl rollout undo deploy/web</code> to return to the previous ReplicaSet.`, `Fix: correct the image or probe, and consider a smaller <code>progressDeadlineSeconds</code> if you want a quicker alert.`, `Verify: <code>kubectl rollout status deploy/web</code> succeeds and Ready equals replicas.`],
      note: `Look at the new ReplicaSet's pods for the cause; the condition is the symptom. ${src('https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#failed-deployment', 'Deployments: Failed Deployment')}` },
    { t: 'Capacity drop', sym: `Latency rises during every deploy, and Ready pods fall to half of replicas.`,
      ctx: `A 4-replica service uses <code>maxUnavailable: 50%</code> and <code>maxSurge: 0</code> so rollouts finish faster.`,
      why: `Unavailable pods can be up to the configured amount. On a small fleet a percentage is a big share of capacity: 50% of 4 is two pods. Percentages round down for unavailable and up for surge.`,
      log: `-- representative output, values illustrative
$ kubectl get deploy web -w
NAME   READY   UP-TO-DATE   AVAILABLE
web    4/4     0            4
web    2/4     2            2     <- half the capacity
web    4/4     4            4`,
      fix: [`Measure first: record <code>AVAILABLE</code> during a rollout, and compute <code>replicas - maxUnavailable</code>.`, `Fix: use <code>maxUnavailable: 0</code> with <code>maxSurge: 1</code> (or a percentage that rounds up) for latency-sensitive services.`, `Fix: make sure there is spare cluster capacity for the surge pods.`, `Verify: the minimum Ready count during a rollout equals the replica count.`],
      note: `AVAILABLE falling to 2 is the drop. ${src('https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#max-unavailable', 'Deployments: Max Unavailable')}` },
    { t: 'Selector immutable', sym: `<code>kubectl apply</code> of an edited Deployment is rejected with an <code>Invalid value</code> and <code>field is immutable</code> message.`,
      ctx: `A cleanup commit renamed a label in the Deployment's selector and in its pod template.`,
      why: `The selector links a Deployment to its ReplicaSets and pods. Changing it would orphan the existing ones, so <code>apps/v1</code> makes <code>spec.selector</code> immutable after creation.`,
      log: `-- representative output, wording varies by version
The Deployment "web" is invalid: spec.selector: Invalid value:
v1.LabelSelector{MatchLabels:map[string]string{"app":"web-v2"}, ...}:
field is immutable`,
      fix: [`Measure first: <code>kubectl diff -f web.yaml</code> shows which field changed.`, `Fix: keep the selector; if it must change, create a new Deployment (new name or labels) and move traffic.`, `Fix: make sure the new Deployment's selector does not overlap the old one's.`, `Verify: the apply succeeds and both versions' pods are counted separately.`],
      note: `The API server blocks it; there is no safe in-place migration. ${src('https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates', 'Deployments: Label selector updates')}` }
  ],
  source: { label: 'Original: Rolling Update', href: '01-k8s-internals-end-to-end.html#ch8' },
  scenarios: [
    { id: 'stall', label: 'Broken v2 stalls', desc: 'The new image crashes, so its pods never become Ready. The Ready gate stops the old pods from being removed, and after the progress deadline the rollout is reported as stuck. Undo brings back v1.',
      codeLabel: 'Config',
      code: { bug: ['strategy:', '  rollingUpdate:', '    maxSurge: 1', '    maxUnavailable: 0', '# v2 pods crash on start: never Ready', '# progressDeadlineSeconds defaults to 600'],
              fix: ['$ kubectl rollout undo deploy/web', '$ kubectl rollout status deploy/web', 'deployment "web" successfully rolled out'] },
      diagram: { w: 640, h: 290, nodes: [
        N('dep', 10, 110, 150, 'Deployment', 'strategy'),
        N('old', 230, 20, 180, 'ReplicaSet v1', '3 Ready, serving'),
        N('new', 230, 200, 180, 'ReplicaSet v2', '1 created, not Ready'),
        N('gate', 450, 110, 170, 'Ready gate', 'blocks scale-down')],
        edges: [E('e1', 'dep', 'old', 'scale down'), E('e2', 'dep', 'new', 'scale up'), E('e3', 'new', 'gate', 'not Ready'), E('e4', 'gate', 'dep', 'no progress')] },
      bug: [
        { log: 'The Deployment creates one v2 pod, within maxSurge 1. The new pod starts and crashes.', code: 0, hl: { nodes: { dep: 'on', new: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'v2 Ready', v: 0, cls: 'bad' }] },
        { log: 'maxUnavailable is 0, so the controller may not remove any v1 pod until a v2 pod is available.', code: 3, hl: { nodes: { gate: 'warn', old: 'ok' }, edges: { e3: 'bad', e4: 'dim' } }, stats: [{ l: 'v1 Ready', v: 3, cls: 'ok' }] },
        { log: 'The rollout makes no progress. Old pods keep serving, so users see no outage.', code: 4, hl: { nodes: { old: 'ok' }, edges: { e1: 'dim' } }, stats: [{ l: 'capacity', v: '3 of 4 (illustrative)', cls: 'warn' }] },
        { log: 'After progressDeadlineSeconds (600 by default) the Deployment is reported with ProgressDeadlineExceeded.', code: 5, hl: { nodes: { dep: 'bad' } }, stats: [{ l: 'Progressing', v: 'False', cls: 'bad' }] }
      ],
      fix: [
        { log: 'kubectl rollout undo scales the previous ReplicaSet back up and the broken v2 pods are removed.', code: 0, hl: { nodes: { old: 'ok', dep: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'v1 Ready', v: 4, cls: 'ok' }] },
        { log: 'Rollout status succeeds once Ready equals replicas. Fix the image or the probe before trying again.', code: 2, hl: { nodes: { gate: 'ok' }, edges: { e4: 'dim' } }, stats: [{ l: 'capacity', v: '4 of 4', cls: 'ok' }] }
      ] },
    { id: 'drop', label: '50% unavailable', desc: 'A 4-replica service with maxSurge 0 and maxUnavailable 50% can drop to 2 Ready pods (illustrative). Surge first, then remove an old pod, keeps all 4 serving.',
      codeLabel: 'Config',
      code: { bug: ['strategy:', '  type: RollingUpdate', '  rollingUpdate:', '    maxSurge: 0', '    maxUnavailable: 50%   # 2 of 4 pods may be unavailable'],
              fix: ['strategy:', '  type: RollingUpdate', '  rollingUpdate:', '    maxSurge: 1', '    maxUnavailable: 0   # never fewer than 4 Ready'] },
      diagram: { w: 640, h: 290, nodes: [
        N('str', 10, 110, 170, 'Strategy', 'surge 0, unavail 2'),
        N('old', 230, 20, 170, 'Old pods', 'deleted first'),
        N('new', 230, 200, 170, 'New pods', 'created after'),
        N('min', 450, 110, 170, 'Ready minimum', '2 of 4 (illustrative)')],
        edges: [E('e1', 'str', 'old', 'remove 2'), E('e2', 'str', 'new', 'create later'), E('e3', 'old', 'min', 'Ready falls'), E('e4', 'new', 'min', 'not Ready yet')] },
      bug: [
        { log: 'With no surge, the rollout may remove two old pods first, because maxUnavailable allows 50% of 4.', code: 4, hl: { nodes: { str: 'on', old: 'warn' }, edges: { e1: 'on' } } },
        { log: 'Two old pods go away while their replacements are still starting.', code: 2, hl: { nodes: { old: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'AVAILABLE', v: 2, cls: 'bad' }] },
        { log: 'The new pods are created after the removal and need time to become Ready.', code: 3, hl: { nodes: { new: 'warn' }, edges: { e2: 'on', e4: 'dim' } } },
        { log: 'For about 40 s (illustrative) only two pods serve, and latency triples at the busiest hour.', code: 0, hl: { nodes: { min: 'bad' } }, stats: [{ l: 'min capacity', v: '50%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With maxSurge 1 the controller creates one new pod first, while all four old pods still serve.', code: 3, hl: { nodes: { new: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'total pods', v: 5, cls: 'ok' }] },
        { log: 'maxUnavailable 0 means an old pod is removed only after a new one is Ready. The minimum Ready count stays at 4.', code: 4, hl: { nodes: { min: 'ok' }, edges: { e3: 'dim', e4: 'ok' } }, stats: [{ l: 'min capacity', v: '100%', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 9 · Horizontal Pod Autoscaler ---------- */
{ title: 'Horizontal Pod Autoscaler',
  problem: `A ticketing site's <code>web</code> Deployment has 4 pods and an HPA that targets 70% CPU utilisation. At 20:00 a sale starts and requests rise about 7 times (illustrative). Latency climbs for several minutes, and later the replica count saws up and down every few minutes, with a brief overload after each drop.`,
  predict: { q: `4 replicas run at <b>140%</b> CPU utilisation (of requests) and the target is <b>70%</b>. What replica count does the HPA compute?`,
    opts: [`5`, `6`, `8`, `16`], ans: 2,
    why: `desiredReplicas = ceil(currentReplicas × currentMetric / target) = ceil(4 × 140 / 70) = 8. The HPA works from utilisation relative to the pods' CPU requests, so the requests must exist.` },
  explain: `<h3>The idea</h3>
<p>Load changes faster than people can react, and a simple rule either lags behind a spike or oscillates around its threshold. The Horizontal Pod Autoscaler closes a loop: it measures utilisation, computes the replica count that would bring it back to the target, applies that count and waits for the new pods to become Ready before it measures again.</p>
<h3>How it works, step by step</h3>
<ol>
<li>The kubelet exposes container usage. <b>metrics-server</b> serves it through the <code>metrics.k8s.io</code> API.</li>
<li>The HPA controller queries that API every 15 s by default. Utilisation is a percentage of each container's CPU request, so a container without a request gives no signal.</li>
<li>The formula is <code>desired = ceil(current × metric / target)</code>. Within 10% of the target the HPA does nothing, which avoids chatter.</li>
<li>Scale-up is fast by default: with no stabilisation window, it may add the larger of 100% or 4 pods per 15 s.</li>
<li>Scale-down uses a 300 s stabilisation window and takes the highest recommendation in that window, so a short dip cannot remove pods that the next burst needs.</li>
<li><code>minReplicas</code> and <code>maxReplicas</code> clamp the result. If the clamp binds, the HPA sets the <code>ScalingLimited</code> condition.</li>
</ol>
<h3>The trade-off</h3>
<p>Fast scale-up and slow scale-down protect users during bursts, but they keep extra pods around for a few minutes after each peak. CPU is also only a proxy: an I/O-bound service can be overloaded with CPU at 20%. Pick a metric that tracks the real bottleneck, keep a sensible maximum, and alert when the maximum is reached.</p>`,
  diagnose: [
    { t: 'Unknown target', sym: `<code>kubectl get hpa</code> shows <code>&lt;unknown&gt;/70%</code> and the Deployment never scales.`,
      ctx: `The container spec has no <code>resources.requests.cpu</code>, or metrics-server is not installed.`,
      why: `Utilisation is a percentage of the request. Without a request there is no denominator, so the HPA cannot compute and marks scaling as inactive.`,
      log: `-- representative output, wording varies by version
$ kubectl get hpa web
NAME   REFERENCE        TARGETS         MINPODS   MAXPODS   REPLICAS
web    Deployment/web   <unknown>/70%   2         20        4
Conditions:
  ScalingActive  False  FailedGetResourceMetric
  the HPA was unable to compute the replica count: failed to get cpu
  utilization: missing request for cpu`,
      fix: [`Measure first: <code>kubectl describe hpa web</code> and read the conditions; <code>kubectl top pods</code> works only if metrics-server is healthy.`, `Fix: set <code>resources.requests.cpu</code> on every container in the pod (sidecars included).`, `Fix: install or repair metrics-server so the metrics API answers.`, `Verify: TARGETS shows a percentage and scaling events appear under load.`],
      note: `ScalingActive=False with that reason is the signature. ${src('https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/', 'Horizontal Pod Autoscaling')}` },
    { t: 'Flapping', sym: `Replicas oscillate every few minutes and each scale-down is followed by overload.`,
      ctx: `<code>scaleDown.stabilizationWindowSeconds: 15</code> was set to save cost; the load is bursty.`,
      why: `Without a long window the HPA follows each dip: it scales down on the low recommendation, then must scale up again at the next burst, while new pods need time to become Ready.`,
      log: `-- representative output, values illustrative
LAST SEEN  REASON             MESSAGE
12m        SuccessfulRescale  New size: 18; reason: cpu resource utilization above target
9m         SuccessfulRescale  New size: 6;  reason: All metrics below target
6m         SuccessfulRescale  New size: 19; reason: cpu resource utilization above target
3m         SuccessfulRescale  New size: 6;  reason: All metrics below target`,
      fix: [`Measure first: <code>kubectl describe hpa</code> events over an hour; count opposite-direction rescales.`, `Fix: restore a scale-down <code>stabilizationWindowSeconds</code> of several minutes and limit scale-down speed with a <code>policies</code> entry.`, `Fix: let scale-up stay fast.`, `Verify: the number of rescales per hour drops and latency after a drop stays flat.`],
      note: `Alternating large changes of opposite sign is flapping. ${src('https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/', 'HPA: Stabilization window')}` },
    { t: 'I/O bound', sym: `Latency is high and queues grow while CPU stays at 20% and replicas stay at the minimum.`,
      ctx: `The service mostly waits on a downstream API and the HPA uses CPU utilisation only.`,
      why: `The HPA reacts to its metric. If the real bottleneck is waiting, not computing, CPU does not rise, so the formula sees nothing to fix.`,
      log: `-- representative output, values illustrative
$ kubectl get hpa web
NAME   TARGETS    MINPODS   MAXPODS   REPLICAS
web    21%/70%    2         20        2
app metric: in-flight requests per pod = 180 (limit 50)`,
      fix: [`Measure first: compare CPU with queue depth, in-flight requests and latency during the slow period.`, `Fix: scale on a metric that tracks the bottleneck through a custom or external metrics adapter.`, `Fix: keep CPU as a second metric; the HPA uses the highest recommendation.`, `Verify: replica count rises with in-flight requests during a load test.`],
      note: `Healthy HPA output with unhealthy application metrics. ${src('https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/', 'HPA: Support for custom metrics')}` },
    { t: 'Max reached', sym: `Replicas sit at the maximum, utilisation stays above target, and nothing alerts.`,
      ctx: `<code>maxReplicas: 10</code> was chosen two years ago.`,
      why: `The HPA clamps its result to maxReplicas. It reports this in the <code>ScalingLimited</code> condition, but a limit that is reached is not an error, so nobody is paged.`,
      log: `-- representative output, wording varies by version
Conditions:
  AbleToScale    True   ReadyForNewScale
  ScalingActive  True   ValidMetricFound
  ScalingLimited True   TooManyReplicas   the desired replica count is more than the maximum replica count`,
      fix: [`Measure first: <code>kubectl describe hpa</code> for <code>ScalingLimited</code>, and compare desired with max.`, `Fix: raise <code>maxReplicas</code> after confirming cluster capacity (node autoscaling) for the extra pods.`, `Fix: alert when ScalingLimited stays True for several minutes.`, `Verify: utilisation returns to target and the condition clears.`],
      note: `ScalingLimited=True with TooManyReplicas means the cap, not the signal, is the limit. ${src('https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/', 'HPA: Status conditions')}` }
  ],
  source: { label: 'Original: Horizontal Pod Autoscaler', href: '01-k8s-internals-end-to-end.html#ch9' },
  scenarios: [
    { id: 'flap', label: 'Flapping scale-down', desc: 'Load moves up and down. With a 15 s scale-down window the HPA follows every dip and flaps. A 300 s window keeps the highest recent recommendation (the window is a model: 15 s steps, illustrative).',
      codeLabel: 'Config',
      code: { bug: ['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 15   # follows every dip', '# CPU target: 70% of the request'],
              fix: ['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 300   # highest recommendation in the last 5 min', '# CPU target: 70% of the request'] },
      diagram: { w: 640, h: 290, nodes: [
        N('pods', 10, 110, 170, 'Pods', 'request 250m each'),
        N('ms', 230, 20, 170, 'metrics-server', 'metrics.k8s.io'),
        N('hpa', 230, 200, 170, 'HPA controller', 'every 15 s'),
        N('dep', 450, 110, 170, 'Deployment', 'sets replicas')],
        edges: [E('e1', 'pods', 'ms', 'usage'), E('e2', 'ms', 'hpa', 'query'), E('e3', 'hpa', 'dep', 'desired'), E('e4', 'dep', 'pods', 'create or delete')] },
      bug: [
        { log: 'Load dips. Utilisation falls below target, so the HPA recommends fewer replicas.', code: 2, hl: { nodes: { hpa: 'on' }, edges: { e2: 'on' } } },
        { log: 'The scale-down window is only 15 s, so the HPA takes the low recommendation at once and removes pods.', code: 2, hl: { nodes: { dep: 'warn' }, edges: { e3: 'on', e4: 'dim' } }, stats: [{ l: 'window', v: '15 s', cls: 'bad' }] },
        { log: 'The next burst arrives. The new pods need time to become Ready, and latency rises while they start.', code: 0, hl: { nodes: { pods: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'scale events / 10 min', v: '8 (illustrative)', cls: 'bad' }] },
        { log: 'The cycle repeats. Each drop is followed by a brief overload, which is the sawtooth on the dashboard.', code: 1, hl: { nodes: { ms: 'warn' }, edges: { e1: 'dim' } } }
      ],
      fix: [
        { log: 'A 300 s window makes the HPA keep the highest recommendation from the last five minutes.', code: 2, hl: { nodes: { hpa: 'ok' } }, stats: [{ l: 'window', v: '300 s', cls: 'ok' }] },
        { log: 'Pods are removed only when every recent recommendation was low. A short dip no longer shrinks the fleet, so the next burst finds capacity ready.', code: 2, hl: { nodes: { dep: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'scale events / 10 min', v: '1 (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'nocpu', label: 'Requests missing', desc: 'The container has no CPU request, so utilisation is unknown and the HPA never scales (illustrative load of 7 times). Adding a request gives the HPA its denominator.',
      codeLabel: 'Manifest',
      code: { bug: ['containers:', '  - name: web', '    image: registry.example.com/web:1.0', '    # resources.requests.cpu is missing', '$ kubectl get hpa web', 'web   Deployment/web   <unknown>/70%   2   20   4'],
              fix: ['containers:', '  - name: web', '    resources:', '      requests:', '        cpu: 250m   # illustrative request'] },
      diagram: { w: 640, h: 290, nodes: [
        N('req', 10, 110, 170, 'Container spec', 'no requests.cpu'),
        N('pods', 230, 110, 170, 'Pods', 'utilisation unknown'),
        N('hpa', 450, 20, 170, 'HPA controller', 'ScalingActive False'),
        N('dep', 450, 200, 170, 'Deployment', 'stays at 4')],
        edges: [E('e1', 'req', 'pods', 'no denominator'), E('e2', 'pods', 'hpa', 'no value'), E('e3', 'hpa', 'dep', 'no change')] },
      bug: [
        { log: 'The web container has no CPU request. Utilisation is a percentage of the request, so there is no denominator.', code: 3, hl: { nodes: { req: 'bad' }, edges: { e1: 'bad' } } },
        { log: 'The HPA cannot compute utilisation. It reports TARGETS as unknown and marks scaling inactive.', code: 4, hl: { nodes: { pods: 'warn', hpa: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'ScalingActive', v: 'False', cls: 'bad' }] },
        { log: 'Load rises about 7 times (illustrative), but the Deployment stays at 4 replicas.', code: 5, hl: { nodes: { dep: 'bad' }, edges: { e3: 'dim' } }, stats: [{ l: 'replicas vs need', v: '4 of 28 (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Each container gets a CPU request, and the sidecars too. The HPA can now compute utilisation.', code: 4, hl: { nodes: { req: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'CPU request', v: '250m', cls: 'ok' }] },
        { log: 'TARGETS shows a percentage, ScalingActive is True and the Deployment scales toward the need.', code: 0, hl: { nodes: { hpa: 'ok', dep: 'ok' }, edges: { e2: 'on', e3: 'on' } }, stats: [{ l: 'replicas vs need', v: '28 of 28 (illustrative)', cls: 'ok' }] }
      ] }
  ]
},
/* ---------- 10 · Node Failure and Self-Healing ---------- */
{ title: 'Node Failure and Self-Healing',
  problem: `At 03:07 a rack loses power and node-7 disappears. It hosted one Deployment pod of <code>web</code> and the StatefulSet pod <code>db-1</code>. The Deployment's missing pod comes back around 03:13 (illustrative), but <code>db-1</code> is still Terminating at 03:30, and nobody knows what the cluster is waiting for.`,
  predict: { q: `The node stops heartbeating. <b>When</b> are its Deployment pods recreated on another node, with default settings?`,
    opts: [`Within a few seconds of the last heartbeat`, `After the node grace period plus the NoExecute toleration, about 5 to 6 minutes`, `Only after an operator deletes the Node object`], ans: 1,
    why: `The node lifecycle controller marks the node Unknown after node-monitor-grace-period (40 s; 50 s from 1.32) and adds the unreachable NoExecute taint. Pods get a default toleration of 300 s for it, so they are evicted about 300 s later, and the ReplicaSet then creates replacements.` },
  explain: `<h3>The idea</h3>
<p>Silence can mean a dead machine or only a broken network. The cluster treats silence as suspicion, not proof: it marks the node, waits, evicts the pods and lets the normal replacement loops heal the workload. For a StatefulSet it waits longer, because two copies of one pod with the same identity and volume would be unsafe.</p>
<h3>How it works, step by step</h3>
<ol>
<li>Each kubelet renews a <b>Lease</b> in the <code>kube-node-lease</code> namespace, about every 10 seconds. The Lease is the heartbeat.</li>
<li>When renewals stop, the node lifecycle controller marks the node Unknown after <code>node-monitor-grace-period</code> (40 s; 50 s from 1.32).</li>
<li>It adds the taint <code>node.kubernetes.io/unreachable:NoExecute</code>. Pods without a matching toleration are evicted at once. Pods get a default toleration of <code>tolerationSeconds</code> 300 s, so they stay for 300 s and are then evicted.</li>
<li>The ReplicaSet sees its pod is gone and creates a replacement on another node.</li>
<li>A StatefulSet keeps at-most-one semantics. It creates the replacement only after the old pod object is confirmed gone. An unreachable kubelet cannot confirm that, so the pod stays Terminating. An operator who has verified the node is off can add <code>node.kubernetes.io/out-of-service:NoExecute</code>, which lets the control plane clear the pod.</li>
</ol>
<p>Voluntary moves such as <code>kubectl drain</code> use the Eviction API, which refuses any eviction that would break a PodDisruptionBudget.</p>
<h3>The trade-off</h3>
<p>Waiting 5 to 6 minutes protects against a false alarm, but capacity is lost for that long. Evicting faster would heal sooner and risk running two copies. For a StatefulSet the safe choice is to wait for a human to confirm the node is really off. Spread replicas across nodes and zones so that one failure never takes out the whole service.</p>`,
  diagnose: [
    { t: 'StatefulSet stuck', sym: `Pod <code>db-1</code> stays <code>Terminating</code> (or Unknown) on a NotReady node for a long time.`,
      ctx: `A node lost power. Its StatefulSet pod holds a volume and a stable identity.`,
      why: `A StatefulSet guarantees at most one pod with a given identity. The controller waits until the old pod is really gone, and only the kubelet (or an operator) can confirm that. With the kubelet unreachable, nothing confirms it, so the pod is never replaced automatically.`,
      log: `-- representative output, values illustrative
$ kubectl get pods -o wide
NAME    READY   STATUS        NODE
db-1    1/1     Terminating   node-7
$ kubectl get nodes
node-7  NotReady  <none>  41d`,
      fix: [`Measure first: <code>kubectl get nodes</code> and <code>kubectl get pods -o wide</code>; confirm by other means (cloud console, power) that the node is down.`, `Fix: once you are sure the node is down, taint it: <code>kubectl taint nodes node-7 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute</code>.`, `Fix: never do this for a node that may still be running: two pods could write the same volume.`, `Verify: the pod is recreated on another node and the volume attaches there.`],
      note: `Terminating on a NotReady node is the wait. ${src('https://kubernetes.io/docs/concepts/cluster-administration/node-shutdown/#non-graceful-node-shutdown', 'Node Shutdown: Non-graceful node shutdown')}` },
    { t: 'PDB blocks drain', sym: `<code>kubectl drain</code> keeps retrying the same pod and never finishes.`,
      ctx: `A 3-replica service has a PDB with <code>minAvailable: 3</code>, and a maintenance drain starts.`,
      why: `The Eviction API refuses a voluntary eviction when it would take the healthy count below the budget. With <code>minAvailable</code> equal to the replica count, zero disruptions are ever allowed.`,
      log: `-- representative output, wording varies by version
evicting pod prod/web-5c8b-xxxxx
error when evicting pods/"web-5c8b-xxxxx" -n "prod" (will retry after 5s):
Cannot evict pod as it would violate the pod's disruption budget.`,
      fix: [`Measure first: <code>kubectl get pdb</code> and read <code>ALLOWED DISRUPTIONS</code>.`, `Fix: set the budget to leave room: <code>maxUnavailable: 1</code> or <code>minAvailable</code> below the replica count.`, `Fix: run enough replicas that a budget can be honoured during maintenance.`, `Verify: the drain completes and ALLOWED DISRUPTIONS returns to at least 1 afterwards.`],
      note: `The retry loop is the safety net. ${src('https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/', 'Safely Drain a Node')}` },
    { t: 'One node, one zone', sym: `One node or zone fails and the service has no healthy replicas for minutes.`,
      ctx: `All 3 pods of <code>web</code> were scheduled onto the same node because it had the most free resources.`,
      why: `The scheduler spreads by score, not by guarantee. Without a topology spread constraint or anti-affinity, replicas can land together, and a single failure removes them all until the eviction timeout elapses.`,
      log: `-- representative output, values illustrative
$ kubectl get pods -l app=web -o wide
NAME             READY   STATUS    NODE
web-5c8b-aaaaa   1/1     Running   node-7
web-5c8b-bbbbb   1/1     Running   node-7
web-5c8b-ccccc   1/1     Running   node-7`,
      fix: [`Measure first: <code>kubectl get pods -o wide</code> grouped by node and by zone label.`, `Fix: add <code>topologySpreadConstraints</code> on <code>kubernetes.io/hostname</code> and <code>topology.kubernetes.io/zone</code> with <code>maxSkew: 1</code>.`, `Fix: pair with a PodDisruptionBudget and enough replicas to survive one domain.`, `Verify: after a node drain, replicas are distributed and the service stays up.`],
      note: `Same NODE column on all replicas is the risk. ${src('https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/', 'Pod Topology Spread Constraints')}` }
  ],
  source: { label: 'Original: Node Failure and Self-Healing', href: '01-k8s-internals-end-to-end.html#ch10' },
  scenarios: [
    { id: 'kill', label: 'Node dies', desc: 'node-7 loses power. The taint and eviction replace the Deployment pod after about 340 s (defaults), but the StatefulSet pod db-1 waits until an operator confirms the node is off.',
      codeLabel: 'Command',
      code: { bug: ['$ kubectl get pods -o wide', 'db-1   1/1   Terminating   node-7', '$ kubectl get nodes', 'node-7   NotReady   <none>   41d'],
              fix: ['$ kubectl taint nodes node-7 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute', '$ kubectl get pods -o wide', 'db-1   1/1   Running   node-9   # recreated on another node (illustrative)'] },
      diagram: { w: 640, h: 290, nodes: [
        N('nd', 10, 110, 130, 'Node-7', 'kubelet, Lease'),
        N('ls', 200, 20, 170, 'Node Lease', 'renewed about 10 s'),
        N('nc', 200, 200, 170, 'Node lifecycle', 'marks Unknown'),
        N('tn', 430, 20, 190, 'Taint NoExecute', 'unreachable'),
        N('ev', 430, 200, 190, 'Eviction', 'after tolerationSeconds')],
        edges: [E('e1', 'nd', 'ls', 'heartbeat'), E('e2', 'ls', 'nc', 'stops'), E('e3', 'nc', 'tn', 'adds taint'), E('e4', 'tn', 'ev', 'after 300 s')] },
      bug: [
        { log: 'node-7 loses power. Its last Lease renewal is the last sign of life the cluster has.', code: 0, hl: { nodes: { nd: 'bad' }, edges: { e1: 'dim' } } },
        { log: 'After node-monitor-grace-period (40 s) the node lifecycle controller marks node-7 Unknown and adds the unreachable taint.', code: 3, hl: { nodes: { nc: 'warn', tn: 'warn' }, edges: { e2: 'on', e3: 'on' } } },
        { log: 'The Deployment pod tolerates the taint for 300 s, then it is evicted and its ReplicaSet creates a new pod elsewhere.', code: 0, hl: { nodes: { ev: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'Deployment pod', v: 'replaced', cls: 'ok' }] },
        { log: 'db-1 is a StatefulSet pod. Its replacement waits for proof that the old pod is gone. An unreachable kubelet cannot give that proof, so db-1 stays Terminating.', code: 1, hl: { nodes: { ev: 'bad' } }, stats: [{ l: 'db-1', v: 'Terminating', cls: 'bad' }, { l: 'replacement', v: 'not created', cls: 'bad' }] }
      ],
      fix: [
        { log: 'An operator checks power and the cloud console, and confirms node-7 is really off. Only then is the out-of-service taint added.', code: 2, hl: { nodes: { nc: 'ok' } } },
        { log: 'The control plane clears the pod that was bound to the shut-down node, and the StatefulSet creates db-1 on another node.', code: 2, hl: { nodes: { ev: 'ok', tn: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'capacity lost', v: 'minutes (illustrative)', cls: 'ok' }] }
      ] },
    { id: 'pdb', label: 'PDB blocks drain', desc: 'A 3-replica service has minAvailable 3, so a drain may evict no pod at all (illustrative). Setting maxUnavailable 1 lets the drain move one pod at a time.',
      codeLabel: 'Config',
      code: { bug: ['spec:', '  minAvailable: 3   # 3 replicas, so 0 disruptions allowed', '$ kubectl drain node-7 --ignore-daemonsets', 'error when evicting pods/"web-5c8b-xxxxx" -n "prod" (will retry after 5s):', "Cannot evict pod as it would violate the pod's disruption budget."],
              fix: ['spec:', '  maxUnavailable: 1   # one eviction at a time'] },
      diagram: { w: 640, h: 290, nodes: [
        N('dr', 10, 110, 170, 'kubectl drain', 'Eviction API'),
        N('pdb', 230, 110, 170, 'PodDisruptionBudget', 'minAvailable 3'),
        N('pods', 450, 20, 170, 'web pods x3', 'all 3 healthy'),
        N('allow', 450, 200, 170, 'Evictions allowed', '0 (illustrative)')],
        edges: [E('e1', 'dr', 'pdb', 'evict one'), E('e2', 'pdb', 'pods', 'counts healthy'), E('e3', 'pdb', 'allow', 'would drop to 2')] },
      bug: [
        { log: 'The drain asks the Eviction API to evict one web pod.', code: 2, hl: { nodes: { dr: 'on' }, edges: { e1: 'on' } } },
        { log: 'The PDB counts 3 healthy pods. Evicting one would leave 2, which is below minAvailable 3.', code: 3, hl: { nodes: { pdb: 'warn', pods: 'ok' }, edges: { e2: 'on', e3: 'bad' } }, stats: [{ l: 'allowed disruptions', v: 0, cls: 'bad' }] },
        { log: 'The eviction is refused. The drain retries every 5 s and never finishes.', code: 4, hl: { nodes: { dr: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'drain', v: 'blocked', cls: 'bad' }] }
      ],
      fix: [
        { log: 'maxUnavailable 1 lets one pod be disrupted at a time, so the PDB allows one eviction.', code: 1, hl: { nodes: { pdb: 'ok' } }, stats: [{ l: 'allowed disruptions', v: 1, cls: 'ok' }] },
        { log: 'The drain evicts one pod, its replacement becomes Ready, and then the next one moves. The service keeps two or more pods serving.', code: 1, hl: { nodes: { pods: 'ok', dr: 'ok' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'drain', v: 'completes', cls: 'ok' }] }
      ] }
  ]
}
  ]
};
})();
