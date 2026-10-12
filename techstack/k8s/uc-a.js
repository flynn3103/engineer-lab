/* Use cases for features 1 to 3: API server and etcd, controllers, scheduler.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.api = [
    {
      title: 'kubectl apply: who actually starts the containers', short: 'apply end to end', kind: 'applyflow',
      intro: 'kubectl apply returns in about 200 ms and says "configured", yet the pods appear seconds later. See which component does each step.',
      trigger: 'You run <code>kubectl apply -f web.yaml</code> for a Deployment of 3 replicas (example).',
      run: "kubectl apply -f web.yaml\nkubectl get pods -w          # watch the pods appear\nkubectl get events --sort-by=.lastTimestamp",
      expect: 'kubectl only stores the Deployment. Controllers, the scheduler and the kubelet each react to what they watch and write the next object.',
      steps: [
        S('kubectl sends the object', 'kubectl turns the YAML into an HTTP request to the API server. Nothing runs yet: it is a request to store a Deployment named web.', { n: 1 }, 'POST Deployment web'),
        S('Stored, then answered', 'The API server authenticates the request, stores the object in etcd at a new revision, and replies. That is the "configured" you see after about 200 ms. The Deployment exists as data, no pod does.', { n: 3 }, 'stored · client already has its answer'),
        S('Controllers see it', 'The Deployment controller watches Deployments. It sees the new object, creates a ReplicaSet, and the ReplicaSet controller creates 3 pods. Each pod is an object with no node yet.', { n: 5 }, 'ReplicaSet and 3 pods created'),
        S('The scheduler places the pods', 'The scheduler watches for pods without a node. For each it picks a node and writes a binding, which sets <code>spec.nodeName</code>. It still starts nothing.', { n: 7 }, 'pods bound to nodes'),
        S('The kubelet runs them', 'The kubelet on each chosen node watches pods bound to it. It pulls the image, starts the containers through the runtime, runs the probes, and reports the pod status back to the API server.', { n: 9 }, 'status: Running, Ready'),
        S('Why it takes seconds', 'Each hop is a watch event and a write, and the slow parts are real work: pulling an image, starting a process, passing a readiness probe. The 200 ms was only the first hop.', { n: 9, why: true }, 'time = scheduling + image pull + start + probes')
      ],
      edges: [
        E('Nothing seems to happen', 'A pod can be Pending (no node fits), ContainerCreating (image pull) or CrashLoopBackOff, and each is a different component\'s problem.', 'Read <code>kubectl describe pod</code> events: they name the component that acted last.'),
        E('apply is not synchronous', 'A script that deploys and then immediately calls the service can hit old pods or none.', 'Wait for the rollout: <code>kubectl rollout status deployment/web</code>.')
      ],
      invariant: 'Components never call each other: each watches the API server for the objects it owns and writes the next object.',
      src: 'Kubernetes docs: Components, Controllers, Deployments, kube-scheduler. The 200 ms is the example from the course scenario; durations depend on the cluster.'
    },
    {
      title: 'Authentication, RBAC and admission', short: 'request gates', kind: 'authgate',
      intro: 'Before a request is stored it passes three gates. A CI token that can delete namespaces, or a broken webhook that blocks every deploy, is a failure at one of them.',
      trigger: 'A CI pipeline deploys with a service account token, and a new validating webhook is installed that is not responding (example).',
      run: "kubectl auth can-i delete namespace --as=system:serviceaccount:ci:deployer\nkubectl get validatingwebhookconfigurations\nkubectl apply -f web.yaml   # Error from server (InternalError): failed calling webhook",
      expect: 'Authentication names the caller, RBAC allows or refuses the action, and admission can change or reject the object, before anything reaches etcd.',
      steps: [
        S('A request arrives', 'The API server receives a write with a bearer token. Everything below happens before the object is stored.', { at: -1 }, 'request received'),
        S('Authentication: who are you', 'The token, certificate or OIDC identity is mapped to a user and groups. If none matches the answer is 401 Unauthorized.', { at: 0 }, '401 if unknown'),
        S('Authorization: may you', 'RBAC checks whether any Role or ClusterRole bound to this user allows the verb (create, delete) on the resource in this namespace. There are only allow rules, no deny rules. If none allows it the answer is 403 Forbidden. A token bound to cluster-admin can delete anything.', { at: 1 }, '403 if no rule allows it'),
        S('Admission: may this object exist', 'Mutating webhooks can change the object (inject a sidecar, set defaults), then validating webhooks can reject it. The API server calls each webhook and waits for its answer.', { at: 2 }, 'webhooks called'),
        S('A webhook that is down', 'With <code>failurePolicy: Fail</code>, an unreachable webhook rejects every matching request after its timeout (up to 10 s by default). One broken webhook on pods or deployments blocks every deploy.', { at: 2, fail: true }, 'every matching request fails'),
        S('Validate and store', 'If all gates pass, the object is validated against its schema and written to etcd. Only then do controllers see it.', { at: 3 }, 'stored in etcd')
      ],
      edges: [
        E('Too-broad tokens', 'CI systems often get a cluster-admin token for convenience.', 'Bind CI to a Role limited to its namespace and verbs, and check with <code>kubectl auth can-i</code>.'),
        E('Webhook failure policy', 'A webhook that is slow or down with failurePolicy Fail can also block the control plane\'s own components.', 'Scope webhooks with <code>namespaceSelector</code> and <code>objectSelector</code>, exclude system namespaces, and prefer Ignore for non-critical checks.')
      ],
      invariant: 'A write reaches etcd only after authentication, authorization and admission all pass; RBAC has no deny rules.',
      src: 'Kubernetes docs: Controlling Access to the Kubernetes API, RBAC, Admission Controllers and Dynamic Admission Control (<code>failurePolicy</code>, <code>timeoutSeconds</code> up to 30 s, default 10 s).'
    },
    {
      title: 'resourceVersion: how two writers do not overwrite each other', short: 'etcd and watch', animation: {
        kind: 'etcd',
        presets: [
          { label: 'Two writers, no lost update', ops: [{ op: 'read', c: 'A' }, { op: 'read', c: 'B' }, { op: 'update', c: 'A', field: 'replicas', value: 5 }, { op: 'update', c: 'B', field: 'image', value: 'v2' }, { op: 'read', c: 'B' }, { op: 'update', c: 'B', field: 'image', value: 'v2' }] },
          { label: 'Last write wins: a change is lost', ops: [{ op: 'read', c: 'A' }, { op: 'read', c: 'B' }, { op: 'force', c: 'A', field: 'replicas', value: 5 }, { op: 'force', c: 'B', field: 'image', value: 'v2' }] },
          { label: 'A watch streams changes', ops: [{ op: 'watch', from: 'now' }, { op: 'read', c: 'A' }, { op: 'update', c: 'A', field: 'replicas', value: 5 }, { op: 'update', c: 'A', field: 'replicas', value: 6 }] },
          { label: 'Compaction: 410 Gone', ops: [{ op: 'read', c: 'A' }, { op: 'update', c: 'A', field: 'replicas', value: 4 }, { op: 'update', c: 'A', field: 'replicas', value: 5 }, { op: 'update', c: 'A', field: 'replicas', value: 6 }, { op: 'compact', to: 4 }, { op: 'watch', from: 2 }] }
        ]
      },
      intro: 'Two controllers read the same Deployment and each changes a different field. Step through what etcd does with and without the version check, then see a watch and what happens when its history is gone.',
      trigger: 'Two controllers update the same Deployment at the same moment and one change silently disappears (example).',
      run: "kubectl get deployment web -o jsonpath='{.metadata.resourceVersion}'\nkubectl get deployment web -w --resource-version=0   # watch\n# client-go: Update fails with 409 Conflict when resourceVersion is stale",
      expect: 'An update that carries a stale resourceVersion is refused with 409, so the client re-reads and retries. A watch resumes from a revision, or fails with 410 Gone when that history is compacted.',
      edges: [
        E('Retry loops on conflict', 'A controller that gets 409 must re-read the object and apply its change again, not resend the old copy.', 'Use <code>retry.RetryOnConflict</code> or server-side apply, which tracks who owns each field.'),
        E('A watch that falls behind', 'A client that is away longer than the history is kept gets 410 Gone, and has no way to replay what it missed.', 'On 410, list the current state and start a new watch from the list\'s resourceVersion. Informers do this for you.')
      ],
      invariant: 'A write succeeds only if the resourceVersion it carries still matches the stored object; otherwise nothing is overwritten.',
      src: 'Kubernetes docs: API concepts (resourceVersion, optimistic concurrency, watch, <code>410 Gone</code>), etcd docs (revisions, compaction). The model has one object and two clients.'
    }
  ];

  CourseData.uc.ctrl = [
    {
      title: 'Level-triggered: a missed event does not matter', short: 'reconcile loop', animation: {
        kind: 'reconcile', replicas: 3,
        presets: [
          { label: 'Delete a pod: it is replaced', ops: [{ op: 'delete', id: 2 }] },
          { label: 'Deleted while the controller is down', ops: [{ op: 'crash' }, { op: 'delete', id: 2 }, { op: 'restart' }] },
          { label: 'The same, edge-triggered (broken)', ops: [{ op: 'mode', level: false }, { op: 'crash' }, { op: 'delete', id: 2 }, { op: 'restart' }] },
          { label: 'Scale the ReplicaSet up', ops: [{ op: 'scale', to: 5 }] }
        ]
      },
      intro: 'Crash the controller, delete a pod while it is away, and restart it. A controller that compares desired with observed state repairs the drift. One that only reacts to events never notices.',
      trigger: 'A pod is deleted while the controller is restarting, and the delete event is lost. Will the pod ever be replaced? (example)',
      run: "kubectl delete pod web-2\nkubectl get replicaset web           # DESIRED 3, CURRENT 3 again\nkubectl -n kube-system rollout restart deployment ...   # a controller restart does not lose the work",
      expect: 'After a restart the controller lists all pods, compares the count with the spec, and creates the missing one, though it never saw the delete.',
      edges: [
        E('Writing a controller that depends on events', 'A custom operator that stores "I saw event X" in memory will drift after a restart or a dropped watch.', 'Compute the action from the current spec and the current observed state every time, and make each step idempotent.'),
        E('Observed state may be stale', 'The cache can lag behind the API server for a moment, so a reconcile can create a pod that already exists.', 'Controllers use expectations and owner references, and a duplicate create fails safely (the name already exists).')
      ],
      invariant: 'A controller\'s action depends only on the current desired state and the current observed state, never on which events it happened to see.',
      src: 'Kubernetes docs: Controllers, ReplicaSet; client-go informers (list then watch). The model is one ReplicaSet and one controller.'
    },
    {
      title: 'Work queue: many events, one reconcile, bounded retries', short: 'work queue', kind: 'queue',
      intro: 'A controller does not process events. It queues the key of the object that changed, and processes each key once at a time, retrying failures with growing delays.',
      trigger: 'A burst of 5 updates to the Deployment web arrives in 10 ms, and then a reconcile fails because the API server is busy (example).',
      run: "kubectl -n kube-system logs deploy/kube-controller-manager | grep -i 'requeue\\|retry'\n# client-go workqueue: AddRateLimited(key) after an error",
      expect: 'The five events become one queued key and one reconcile. A failed reconcile is retried after 5 ms, then 10 ms, 20 ms and so on, up to a cap.',
      steps: [
        S('Events arrive', 'Five update events for the Deployment web arrive within 10 ms. The informer updates its local cache for each.', { ev: 5, q: [], note: 'cache updated' }, '5 events'),
        S('Only the key is queued', 'The event handler does not enqueue the event. It enqueues the object\'s key, <code>default/web</code>. While the key is already waiting, adding it again does nothing.', { ev: 5, q: ['default/web'], note: 'one key waits' }, 'queue: 1 key'),
        S('One worker reconciles', 'A worker takes the key and reconciles once, reading the latest state from the cache. It does the work for all five changes at once. A key is never handled by two workers at the same time.', { ev: 5, q: [], note: 'reconciled once', worker: true }, '5 events · 1 reconcile'),
        S('A reconcile fails', 'The reconcile gets an error from the API server. The key is put back with a delay, a per-key exponential backoff that starts at 5 ms.', { ev: 0, q: ['default/web'], note: 'retry in 5 ms', delay: 5 }, 'retry after 5 ms'),
        S('Failures back off', 'Each failure doubles the delay: 5, 10, 20, 40 ms and so on, up to a cap of about 16 minutes. A broken object cannot spin the CPU or flood the API server.', { ev: 0, q: ['default/web'], note: 'delay doubles', delay: 40 }, 'delay 40 ms'),
        S('Success resets it', 'When a reconcile succeeds the key\'s failure count is cleared and the next failure starts again at 5 ms. The state of the object, not the history of events, decides what happens.', { ev: 0, q: [], note: 'backoff reset', delay: 0 }, 'backoff cleared')
      ],
      edges: [
        E('A permanently failing key', 'A key that always fails is retried at the capped delay for ever, which is cheap but noisy.', 'Fix the object or the cause; use status conditions so the failure is visible to users.'),
        E('Many workers, one key', 'Raising worker counts speeds up different keys but never runs the same key in parallel.', 'If one object is the bottleneck, make its reconcile cheaper; concurrency cannot help.')
      ],
      invariant: 'Many events for one object collapse into one queued key, and a key is reconciled by at most one worker at a time.',
      src: 'client-go <code>workqueue</code> (rate-limiting queue, default controller rate limiter), Kubernetes docs: Controllers. The 5 ms base and the cap are the client-go defaults; check your controller\'s configuration.'
    },
    {
      title: 'Owner references and garbage collection', short: 'ownership', kind: 'ownertree',
      intro: 'A Deployment owns ReplicaSets, which own pods. Deleting the owner decides what happens to the rest, in one of three modes.',
      trigger: 'You delete a Deployment and want to know what happens to its ReplicaSets and pods (example).',
      run: "kubectl delete deployment web                      # background cascade (default)\nkubectl delete deployment web --cascade=foreground\nkubectl delete deployment web --cascade=orphan",
      expect: 'By default the Deployment disappears at once and the garbage collector deletes the dependents. Orphan mode leaves them running.',
      steps: [
        S('A chain of owners', 'Each pod has <code>metadata.ownerReferences</code> pointing to its ReplicaSet, and each ReplicaSet to its Deployment. The references, not names, define ownership.', { d: ['alive', 'alive', 'alive'] }, 'Deployment → ReplicaSet → Pods'),
        S('Background deletion (default)', 'The Deployment is deleted at once. The garbage collector then notices dependents with a missing owner and deletes the ReplicaSet, then the pods, in the background.', { d: ['gone', 'deleting', 'deleting'] }, 'owner gone first, dependents after'),
        S('Foreground deletion', 'The Deployment is kept with a deletion timestamp and a finalizer until its dependents are gone. Only then is it removed. Use it when you must know that everything is deleted.', { d: ['terminating', 'deleting', 'deleting'] }, 'owner waits for dependents'),
        S('Orphan', 'With <code>--cascade=orphan</code> the Deployment is deleted but the ReplicaSet and pods stay, with the owner reference removed. They keep running with no owner.', { d: ['gone', 'orphan', 'orphan'] }, 'dependents kept'),
        S('Adoption', 'A ReplicaSet adopts any pod with matching labels and no owner. That is how an orphaned pod can be picked up again, and how a stray pod with the right labels can be counted by mistake.', { d: ['alive', 'alive', 'adopted'] }, 'matching labels and no owner'),
        S('A stuck deletion', 'An object with a finalizer stays in Terminating until the controller that owns the finalizer removes it. If that controller is gone, the object waits for ever.', { d: ['terminating', 'alive', 'alive'], stuck: true }, 'Terminating until the finalizer is removed')
      ],
      edges: [
        E('Deleting a namespace that hangs', 'A namespace stays Terminating while any object in it has a finalizer whose controller no longer exists.', 'Find the blocking objects with <code>kubectl get all -n ns</code> and the finalizers in their metadata; remove the stale finalizer as a last resort.'),
        E('Selectors that overlap', 'Two ReplicaSets with overlapping selectors can fight over the same pods.', 'Give each workload a unique label, and use the Deployment, which adds a pod-template-hash.')
      ],
      invariant: 'A dependent with an owner reference is deleted by the garbage collector when its owner is deleted, unless the delete was an orphan delete.',
      src: 'Kubernetes docs: Garbage Collection, Owners and Dependents, Finalizers, cascading deletion (<code>--cascade</code>).'
    }
  ];

  CourseData.uc.sched = [
    {
      title: 'Filter, score, bind', short: 'placement', animation: {
        kind: 'scheduler',
        nodes: [
          { name: 'node-1', cpu: 2000, mem: 4, usedCpu: 1600, usedMem: 3, labels: { disk: 'ssd' } },
          { name: 'node-2', cpu: 2000, mem: 4, usedCpu: 500, usedMem: 1, labels: { disk: 'hdd' } },
          { name: 'node-3', cpu: 4000, mem: 8, usedCpu: 3600, usedMem: 6, labels: { disk: 'ssd' } },
          { name: 'node-4', cpu: 4000, mem: 8, usedCpu: 800, usedMem: 2, labels: { disk: 'hdd' }, taints: ['gpu=true:NoSchedule'] },
          { name: 'node-5', cpu: 4000, mem: 8, usedCpu: 1000, usedMem: 2, labels: { disk: 'hdd' } }
        ],
        pods: [
          { name: 'web', cpu: 500, mem: 1 },
          { name: 'db', cpu: 400, mem: 1, selector: { disk: 'ssd' } },
          { name: 'big-db', cpu: 800, mem: 2, selector: { disk: 'ssd' } },
          { name: 'ml', cpu: 600, mem: 2, tolerates: ['gpu=true:NoSchedule'] },
          { name: 'batch', cpu: 300, mem: 1 }
        ],
        presets: [
          { label: 'A pod that fits anywhere', ops: [{ op: 'schedule', pod: 0 }] },
          { label: 'Needs an SSD node', ops: [{ op: 'schedule', pod: 1 }] },
          { label: 'Pending: no SSD node has room', ops: [{ op: 'schedule', pod: 2 }] },
          { label: 'A taint keeps ordinary pods away', ops: [{ op: 'schedule', pod: 4 }, { op: 'schedule', pod: 3 }] },
          { label: 'Each placement changes the next', ops: [{ op: 'schedule', pod: 0 }, { op: 'schedule', pod: 0 }, { op: 'schedule', pod: 0 }] }
        ]
      },
      intro: 'Pick a pod and watch the scheduler first discard nodes that cannot run it, then rank the rest and bind the winner. Try a pod that needs an SSD node that has no room.',
      trigger: 'A new pod asks for 200m CPU and an SSD node, yet it sits Pending while 120 nodes look half empty (example).',
      run: "kubectl describe pod web-1 | sed -n '/Events/,$p'\n# Warning FailedScheduling  0/5 nodes are available: 2 Insufficient cpu, ...\nkubectl get pod web-1 -o jsonpath='{.spec.nodeName}'",
      expect: 'Nodes that fail a filter are never scored. If none passes, the pod stays Pending with a message counting the reasons.',
      edges: [
        E('Scores are not a global optimum', 'The scheduler places one pod at a time with what it knows now, so a later large pod can find no node that fits even if the total capacity is there.', 'Spread small pods, leave headroom, or use priorities and preemption for important pods.'),
        E('Requests, not use, decide', 'A node that is idle but whose pods have requested all its CPU is "full" for scheduling.', 'Right-size requests from measured usage (a VPA recommendation helps) instead of over-asking.')
      ],
      invariant: 'A pod is bound only to a node that passed every filter, and among those, to the one with the highest score.',
      src: 'Kubernetes docs: Kubernetes Scheduler (filtering and scoring, <code>NodeResourcesFit</code>, <code>NodeAffinity</code>, <code>TaintToleration</code>, <code>NodeResourcesBalancedAllocation</code>), Assigning Pods to Nodes. The scores are simplified to two plugins.'
    },
    {
      title: 'Why a pod stays Pending', short: 'Pending reasons', kind: 'pending',
      intro: 'The scheduler records one reason per rejected node. Reading the counts tells you which constraint to change.',
      trigger: 'Pods sit Pending and the events say "0/6 nodes are available" (example message).',
      run: "kubectl get pods --field-selector=status.phase=Pending\nkubectl describe pod web-7 | grep -A4 FailedScheduling\nkubectl describe node node-3 | sed -n '/Allocated resources/,/Events/p'",
      expect: 'Each reason in the message names a filter that rejected some nodes: resources, a selector, a taint, a volume or an anti-affinity rule.',
      steps: [
        S('The event message', 'The message reads like "0/6 nodes are available: 3 Insufficient cpu, 2 node(s) didn\'t match Pod\'s node affinity/selector, 1 node(s) had untolerated taint". The counts add up to the nodes, one reason per node.', { upto: 0 }, '0/6 nodes available · 3 + 2 + 1'),
        S('Insufficient cpu or memory', 'The pod\'s requests are larger than any node\'s free allocatable (allocatable minus what other pods already request). Lower the request, free some capacity, or add a node.', { upto: 1 }, 'requests > free allocatable'),
        S('Node selector or affinity', 'The pod asks for a label (disk=ssd, a zone) that these nodes do not have. Fix the label on the nodes or the selector on the pod.', { upto: 2 }, 'labels do not match'),
        S('Untolerated taint', 'A node carries a taint (a dedicated GPU node, a control-plane node) and the pod has no toleration for it. Add the toleration, or accept that those nodes are not for this pod.', { upto: 3 }, 'taint not tolerated'),
        S('Volume and topology', 'A pod whose volume is in one zone can only run on nodes of that zone. "Unbound immediate PersistentVolumeClaims" means the claim has no volume yet.', { upto: 4 }, 'volume or zone does not fit'),
        S('Anti-affinity', '"Didn\'t satisfy existing pods anti-affinity rules" means a rule such as one pod per node or per zone has no free place left. Relax it from required to preferred, or add nodes.', { upto: 5 }, 'spread rule has no free place')
      ],
      edges: [
        E('Pending after adding nodes', 'New nodes may be tainted or lack the labels the pods need, so they pass no filter.', 'Check the node\'s labels and taints with <code>kubectl describe node</code> before blaming capacity.'),
        E('Preemption', 'A high-priority pod can evict lower-priority pods to fit, which looks like pods disappearing.', 'Use priorities deliberately and watch for Preempted events.')
      ],
      invariant: 'A Pending pod\'s event lists, per node, the first filter that rejected it; no node passed them all.',
      src: 'Kubernetes docs: Scheduling, taints and tolerations, Assigning Pods to Nodes, Pod Priority and Preemption. Message wording varies slightly by version.'
    },
    {
      title: 'Requests, limits and who is killed first', short: 'QoS', kind: 'qos',
      intro: 'Requests decide placement, limits decide throttling and killing, and the relation between them decides which pod is evicted first under pressure.',
      trigger: 'A node runs out of memory and some pods are killed while others survive (example).',
      run: "kubectl get pod web-1 -o jsonpath='{.status.qosClass}'\nkubectl describe pod web-1 | grep -A3 'Last State'   # Reason: OOMKilled, Exit Code: 137",
      expect: 'Going over a CPU limit only slows the container; going over a memory limit kills it. Under node pressure, BestEffort pods go first, then Burstable above their requests, and Guaranteed last.',
      steps: [
        S('A request is a reservation', 'The scheduler counts requests, not real use. A pod that requests 500m CPU and 1 GiB takes that much of the node\'s allocatable capacity whether it uses it or not.', { upto: 1 }, 'requests decide placement'),
        S('A CPU limit throttles', 'CPU is compressible. A container that tries to use more than its CPU limit is slowed down in short periods, not killed. Latency rises but the process lives.', { upto: 2 }, 'CPU over the limit: throttled'),
        S('A memory limit kills', 'Memory is not compressible. A container that goes over its memory limit is killed by the kernel (OOMKilled, exit code 137) and restarted by the kubelet.', { upto: 3 }, 'memory over the limit: OOMKilled'),
        S('Three QoS classes', 'Guaranteed: every container has requests equal to limits for CPU and memory. Burstable: some request or limit is set. BestEffort: none. The class is computed from the spec, not chosen.', { upto: 4 }, 'Guaranteed · Burstable · BestEffort'),
        S('Pressure picks victims', 'When the node runs low on memory the kubelet evicts BestEffort pods and Burstable pods using more than they requested first. Guaranteed pods are the last to go.', { upto: 5 }, 'eviction order: BestEffort, Burstable, Guaranteed'),
        S('A common setting', 'Set a memory request equal to the limit, so a pod is never evicted for using more than it asked, and be generous or omit CPU limits where throttling hurts latency.', { upto: 5, plan: true }, 'memory request = limit')
      ],
      edges: [
        E('CPU limits and latency', 'A low CPU limit throttles bursts even when the node has idle CPU, which shows up as latency spikes.', 'Prefer CPU requests without tight limits for latency-sensitive services, and watch the throttling metrics.'),
        E('JVM and container memory', 'A runtime that sizes its heap from the machine memory, not the container limit, grows past the limit and is OOMKilled.', 'Set the heap from the container limit (container-aware flags) and keep headroom for non-heap memory.')
      ],
      invariant: 'Over a CPU limit a container is slowed; over a memory limit it is killed; under node pressure the QoS class decides who is evicted first.',
      src: 'Kubernetes docs: Resource Management for Pods and Containers, Pod Quality of Service Classes, Node-pressure Eviction.'
    }
  ];
})();
