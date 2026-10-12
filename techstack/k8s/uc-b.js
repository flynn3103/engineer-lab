/* Use cases for features 4 to 6: kubelet and probes, Services and DNS, Deployments and rollouts.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.kubelet = [
    {
      title: 'From Bound to Ready: what the kubelet reports', short: 'pod lifecycle', kind: 'podstages',
      intro: 'A pod is bound to a node but never becomes Running, or restarts every few minutes. See what the kubelet does at each stage and what it writes back.',
      trigger: 'The pod is bound to node-1, but <code>kubectl get pod</code> shows Pending, then ContainerCreating, then CrashLoopBackOff (example).',
      run: "kubectl get pod web-1 -o wide\nkubectl describe pod web-1          # Conditions, container states, Events\nkubectl get pod web-1 -o jsonpath='{.status.phase} {.status.containerStatuses[0].state}'",
      expect: 'The kubelet reports each step: Pending while the image is pulled, Running once a container starts, and Ready only after its readiness probe passes.',
      steps: [
        S('Bound to this node', 'The scheduler has set <code>spec.nodeName</code>. The kubelet on that node sees the pod through its watch. The pod phase is Pending: accepted, not yet running.', { at: 0, phase: 'Pending', ready: false, cs: 'no container yet' }, 'phase Pending'),
        S('Pull the image', 'The kubelet asks the container runtime (through CRI) to create the pod sandbox and pull the image. The container state is Waiting with reason ContainerCreating. A wrong image name or tag shows ErrImagePull, then ImagePullBackOff.', { at: 1, phase: 'Pending', ready: false, cs: 'Waiting: ContainerCreating' }, 'Waiting: ContainerCreating'),
        S('The container starts', 'Once the process is started the container state becomes Running and the pod phase becomes Running. But the pod is not yet a member of any Service.', { at: 2, phase: 'Running', ready: false, cs: 'Running' }, 'phase Running · not Ready'),
        S('Readiness passes', 'The kubelet runs the readiness probe. When it succeeds, the pod\'s Ready condition becomes True. Only now is the pod added to the Service\'s endpoints and receives traffic.', { at: 3, phase: 'Running', ready: true, cs: 'Running' }, 'Ready = True'),
        S('The container exits', 'If the process exits, the container is Terminated with an exit code. With restartPolicy Always (the default for pods in Deployments) the kubelet starts it again, with a growing delay.', { at: 3, phase: 'Running', ready: false, cs: 'Terminated, restarting' }, 'restart with backoff'),
        S('The status is a report', 'What <code>kubectl</code> shows as status is what the kubelet last wrote to the API server. If the node stops reporting, the status goes stale, which the node failure use cases cover.', { at: 3, phase: 'Running', ready: true, cs: 'Running', report: true }, 'status = the kubelet\'s report')
      ],
      edges: [
        E('Pending for a long time', 'A pod stuck in ContainerCreating often waits on an image pull, a volume mount or the network plugin.', 'Read the Events in <code>kubectl describe pod</code>: they name the failing step (FailedMount, FailedCreatePodSandBox).'),
        E('Running but not Ready', 'A pod can be Running for hours with Ready False if the readiness probe never passes. It gets no traffic.', 'Check the probe path, port and timeouts, and the container logs.')
      ],
      invariant: 'The kubelet writes a pod\'s phase and conditions from what it observes on the node; Ready becomes true only after the readiness probe succeeds.',
      src: 'Kubernetes docs: Pod Lifecycle (phases, container states, conditions), Container Runtime Interface, Images (ImagePullBackOff).'
    },
    {
      title: 'Liveness, readiness and startup: three different questions', short: 'probes', kind: 'probes',
      intro: 'A short database outage must not restart every replica. See why liveness must not depend on a dependency, and what readiness does instead.',
      trigger: 'During a short database blip every replica restarts at once and the outage gets longer (example).',
      run: "livenessProbe:  { httpGet: { path: /healthz, port: 8080 }, periodSeconds: 10, failureThreshold: 3 }\nreadinessProbe: { httpGet: { path: /ready,   port: 8080 }, periodSeconds: 10, failureThreshold: 3 }\nstartupProbe:   { httpGet: { path: /healthz, port: 8080 }, periodSeconds: 10, failureThreshold: 30 }",
      expect: 'A failing readiness probe only removes the pod from traffic. A failing liveness probe restarts the container, which is wrong for a dependency problem.',
      steps: [
        S('Startup probe first', 'While a slow application starts, the startup probe runs alone. Liveness and readiness are held back until it succeeds, so a slow start is not mistaken for a hang.', { t: 10 }, 'startup passes at 10 s'),
        S('Readiness passes', 'The readiness probe succeeds, the pod becomes Ready and joins the Service endpoints. Liveness is also passing.', { t: 30 }, 'Ready · in endpoints'),
        S('The database blips', 'From 30 s the database is unreachable. The readiness probe checks the dependency and fails. After 3 failures (failureThreshold) the pod is NotReady and removed from the endpoints. The container keeps running.', { t: 50 }, 'NotReady · removed from traffic · not restarted'),
        S('A liveness probe that checks the database', 'If the liveness probe also checks the database, it fails 3 times as well, and at 50 s the kubelet restarts the container. Every replica does this at the same moment, so the whole service restarts during a blip it did not cause.', { t: 50, liveDep: true }, 'liveness fails: every replica restarts'),
        S('Recovery', 'When the database returns, readiness passes again after successThreshold (1) successes. The pod rejoins the endpoints with no restart needed.', { t: 70 }, 'Ready again · back in endpoints'),
        S('The design rule', 'Liveness asks "is this process stuck and beyond repair?" and should check only itself. Readiness asks "can I serve now?" and may check dependencies. Startup protects slow starts.', { t: 100, rule: true }, 'liveness: me · readiness: me and dependencies')
      ],
      edges: [
        E('Probe timeouts too short', 'A probe that times out under load (default timeoutSeconds is 1) fails, and the restart adds more load.', 'Raise timeoutSeconds and failureThreshold for services that are slow under load, and keep liveness cheap.'),
        E('Readiness during shutdown', 'A pod being terminated stays Ready until the endpoints change, so it can still get requests.', 'See the graceful shutdown use case: a preStop delay and handling SIGTERM.')
      ],
      invariant: 'A failed readiness probe removes a pod from traffic without restarting it; a failed liveness probe restarts the container.',
      src: 'Kubernetes docs: Liveness, Readiness, and Startup Probes (<code>periodSeconds</code> 10, <code>timeoutSeconds</code> 1, <code>failureThreshold</code> 3, <code>successThreshold</code> 1 defaults).'
    },
    {
      title: 'CrashLoopBackOff: the restart delay', short: 'restart backoff', kind: 'backoff',
      intro: 'A container that keeps crashing is restarted with a doubling delay. CrashLoopBackOff is the waiting state between restarts, not the crash.',
      trigger: 'A pod restarts every few minutes with status CrashLoopBackOff, because it exits right after start (example).',
      run: "kubectl get pod web-1 -w              # RESTARTS column grows, STATUS CrashLoopBackOff\nkubectl logs web-1 --previous          # logs of the container that just crashed",
      expect: 'The kubelet restarts after 10 s, then 20, 40, 80, 160 and then every 5 minutes, and resets the delay after the container runs 10 minutes.',
      steps: [
        S('The container exits', 'The process exits with an error. With restartPolicy Always the kubelet will restart it, but not at once.', { n: 0 }, 'exit code 1'),
        S('First restart after 10 s', 'The kubelet waits 10 s, then starts the container again. It crashes again.', { n: 1 }, 'delay 10 s'),
        S('The delay doubles', 'The next waits are 20 s, then 40 s, then 80 s, then 160 s. During each wait the container state is Waiting with the reason CrashLoopBackOff.', { n: 4 }, 'delays 10, 20, 40, 80'),
        S('The cap: 5 minutes', 'The delay stops growing at 300 s. From here the container is retried every 5 minutes, so a fix can take up to 5 minutes to be tried.', { n: 6 }, 'delay capped at 5 minutes'),
        S('A healthy run resets it', 'If the container runs for 10 minutes without crashing, the backoff resets to 10 s, so a rare crash is restarted quickly again.', { n: 0, reset: true }, 'reset after 10 minutes of success'),
        S('Reading it', 'The status shows the wait, not the crash. The cause is in <code>kubectl logs --previous</code> and in the last state\'s exit code (137 is a kill, often out of memory).', { n: 6, read: true }, 'cause: logs --previous and exit code')
      ],
      edges: [
        E('Fixing the config does not restart at once', 'After you fix the cause, the pod may still wait out the current backoff before the next try.', 'Delete the pod to restart immediately; the new pod starts with a fresh backoff.'),
        E('A crash loop on many pods', 'All replicas can crash for the same reason (a bad config) and fail together.', 'A rolling update stops at the first failing pods (readiness never passes), so roll back before all are replaced.')
      ],
      invariant: 'The restart delay doubles from 10 s up to a cap of 5 minutes and resets after 10 minutes of the container running.',
      src: 'Kubernetes docs: Pod Lifecycle (container restart policy and exponential back-off, 10 s base, 300 s cap, reset after 10 minutes), Debug Running Pods.'
    }
  ];

  CourseData.uc.net = [
    {
      title: 'A Service is a virtual IP over ready pods', short: 'Service path', kind: 'svcpath',
      intro: 'Pod IPs change on every deploy, but clients use one stable address. See how that address reaches a ready pod and how the set of pods is kept current.',
      trigger: 'A client calls the Service <code>web</code> at its ClusterIP while pods are replaced by a deploy (example addresses).',
      run: "kubectl get svc web                       # CLUSTER-IP 10.96.0.10\nkubectl get endpointslices -l kubernetes.io/service-name=web\nkubectl get pods -l app=web -o wide",
      expect: 'The ClusterIP belongs to no interface: node rules rewrite it to a ready pod IP per connection, and a pod that fails readiness leaves the rules.',
      steps: [
        S('Service and EndpointSlice', 'A Service has a selector and a stable virtual IP, the ClusterIP. The EndpointSlice controller lists the IPs of pods that match the selector and are Ready. A terminating or NotReady pod is not listed.', { n: 0, eps: ['A', 'B', 'C'] }, 'endpoints: A, B, C'),
        S('Every node programs rules', 'kube-proxy on each node watches Services and EndpointSlices and programs rules (iptables, IPVS or nftables). No process listens on the ClusterIP: it is only matched by those rules.', { n: 0, eps: ['A', 'B', 'C'], rules: true }, 'rules on every node'),
        S('A client connects', 'The client pod connects to the ClusterIP. The node\'s rules rewrite the destination to the IP of one endpoint, Pod A, and the connection goes there.', { n: 3, eps: ['A', 'B', 'C'] }, 'ClusterIP → Pod A'),
        S('The next connection', 'A new connection may be sent to a different endpoint, here Pod B. Balancing is per connection, not per request.', { n: 5, eps: ['A', 'B', 'C'] }, 'next connection → Pod B'),
        S('A pod fails readiness', 'Pod C stops passing its readiness probe. The EndpointSlice is updated without it, and kube-proxy on every node removes it from the rules. New connections no longer go to C.', { n: 6, eps: ['A', 'B'] }, 'endpoints: A, B'),
        S('It is not instant', 'The update travels through several watches (endpoints controller, API server, every node), so a pod that is gone can still get connections for a moment. Long-lived connections (HTTP/2, keep-alive) stay on their endpoint.', { n: 6, eps: ['A', 'B'], lag: true }, 'propagation takes time')
      ],
      edges: [
        E('A client that pins a connection', 'A client that reuses one long-lived connection (gRPC, keep-alive) always talks to one pod, so load balances badly after a scale-up.', 'Use client-side load balancing (a headless Service), or a mesh or L7 proxy that balances per request.'),
        E('Service with no endpoints', 'A selector that matches no Ready pods gives an empty EndpointSlice, and connections fail.', 'Check <code>kubectl get endpointslices</code> and that the labels and the readiness probe are right.')
      ],
      invariant: 'Only pods that match the selector and are Ready are in the EndpointSlice, and kube-proxy makes the ClusterIP reach exactly those.',
      src: 'Kubernetes docs: Service, EndpointSlices, Virtual IPs and Service Proxies (iptables, IPVS, nftables).'
    },
    {
      title: 'Graceful shutdown: the endpoint race', short: 'drain on delete', kind: 'shutdown',
      intro: 'When a pod is deleted, its removal from the endpoints and the SIGTERM to its container start at the same time. Requests can still arrive for a few seconds after the app has stopped.',
      trigger: 'During a scale-down users see 502 errors for a few seconds (example).',
      run: "lifecycle:\n  preStop: { exec: { command: [\"sleep\", \"8\"] } }\nterminationGracePeriodSeconds: 30     # default 30 s, then SIGKILL",
      expect: 'A short preStop sleep and an application that finishes in-flight requests on SIGTERM remove the errors.',
      steps: [
        S('The pod is deleted', 'The API server sets a deletion timestamp. Two things start in parallel: the endpoints controller removes the pod from the EndpointSlice, and the kubelet starts stopping the container.', { k: 1 }, 'delete at t = 0'),
        S('Propagation takes time', 'The endpoint removal has to reach kube-proxy on every node and the load balancers. That takes a second or a few, during which new requests still go to the pod.', { k: 2 }, 'traffic still routed for about 3 s'),
        S('An app that exits at once', 'If the application exits as soon as it gets SIGTERM, requests routed during the propagation window hit a closed port and fail: the 502 errors.', { k: 3 }, 'errors until endpoints catch up'),
        S('A preStop delay', 'A <code>preStop</code> hook that sleeps 8 s runs before SIGTERM is sent. The pod keeps serving while the endpoint removal spreads, so no request arrives after it stops.', { k: 4 }, 'preStop sleep 8 s, then SIGTERM'),
        S('Drain, then exit', 'On SIGTERM the application stops accepting new connections, finishes in-flight requests, and exits on its own. Nothing is cut off.', { k: 5 }, 'finish in-flight requests'),
        S('The grace period is a hard limit', '<code>terminationGracePeriodSeconds</code> (30 s by default) counts from the delete, including the preStop time. When it ends the kubelet sends SIGKILL, so the sleep and the drain must fit inside it.', { k: 6 }, 'SIGKILL at 30 s')
      ],
      edges: [
        E('Sleep longer than the grace period', 'A preStop sleep that eats most of the grace period leaves no time to drain.', 'Keep sleep plus drain time under terminationGracePeriodSeconds, and raise it for slow-draining services.'),
        E('PID 1 ignores SIGTERM', 'A shell wrapper as the main process may not pass the signal on, so the container is killed only at the end of the grace period.', 'Run the application as PID 1 (exec), or use a minimal init that forwards signals.')
      ],
      invariant: 'Removing a pod from the endpoints and stopping its container start together, so a pod must keep serving until the endpoints have caught up.',
      src: 'Kubernetes docs: Pod Lifecycle (Termination of Pods), Container Lifecycle Hooks (<code>preStop</code>), <code>terminationGracePeriodSeconds</code> 30. Propagation time is an example.'
    },
    {
      title: 'DNS names, search paths and ndots', short: 'DNS', kind: 'dns',
      intro: 'A Service name is resolved by CoreDNS, and the pod\'s resolver tries a list of suffixes before the plain name. External names can cost several extra queries.',
      trigger: 'A pod in the namespace shop calls <code>orders</code> and also <code>api.example.com</code> (example).',
      run: "kubectl exec web-1 -- cat /etc/resolv.conf\n# search shop.svc.cluster.local svc.cluster.local cluster.local\n# options ndots:5",
      expect: 'A short Service name resolves on the first query. An external name with fewer than 5 dots tries each search suffix first.',
      steps: [
        S('Names of a Service', 'The Service <code>orders</code> in namespace shop is <code>orders.shop.svc.cluster.local</code>. Inside the namespace the short name <code>orders</code> works, from other namespaces use <code>orders.shop</code>.', { name: '', tries: [] }, 'Service DNS names'),
        S('The pod\'s resolv.conf', 'The kubelet writes a resolver config with a search list (the namespace, svc and the cluster domain) and <code>ndots:5</code>: a name with fewer than 5 dots is tried with each search suffix before being tried as it is.', { name: '', tries: [], conf: true }, 'search list + ndots:5'),
        S('A Service name resolves at once', '<code>orders</code> has no dots, so the first attempt, <code>orders.shop.svc.cluster.local</code>, is asked to CoreDNS and answers with the ClusterIP. One query.', { name: 'orders', tries: [['orders.shop.svc.cluster.local', 'ClusterIP']] }, '1 query'),
        S('An external name costs more', '<code>api.example.com</code> has 2 dots, under 5, so the resolver tries the suffixes first: three queries that return NXDOMAIN, then the real name. Four queries for one lookup, repeated for every new connection.', { name: 'api.example.com', tries: [['api.example.com.shop.svc.cluster.local', 'NXDOMAIN'], ['api.example.com.svc.cluster.local', 'NXDOMAIN'], ['api.example.com.cluster.local', 'NXDOMAIN'], ['api.example.com', 'address']] }, '4 queries'),
        S('Skip the search path', 'A trailing dot, <code>api.example.com.</code>, marks the name as complete and is asked once. Or lower <code>ndots</code> in the pod\'s <code>dnsConfig</code>.', { name: 'api.example.com.', tries: [['api.example.com.', 'address']] }, '1 query'),
        S('Where answers come from', 'CoreDNS watches Services and EndpointSlices and answers from them. A headless Service (no ClusterIP) answers with the pod IPs themselves, which is how clients find every replica.', { name: 'orders', tries: [['orders.shop.svc.cluster.local', 'ClusterIP']], coredns: true }, 'CoreDNS answers from the API') 
      ],
      edges: [
        E('DNS as the bottleneck', 'Many extra queries per connection load CoreDNS and add latency, and a dropped UDP packet adds seconds.', 'Reduce ndots, use trailing dots for external names, keep connections alive, and run a node-local DNS cache.'),
        E('Names are cached by the client', 'A client that resolves a Service name once and keeps the address may miss changes of headless Services.', 'Respect the DNS TTL, and re-resolve for long-lived processes.')
      ],
      invariant: 'A name with fewer dots than ndots is tried with every search suffix before the name itself.',
      src: 'Kubernetes docs: DNS for Services and Pods (resolv.conf, <code>ndots:5</code>, search paths, headless Services), CoreDNS.'
    }
  ];

  CourseData.uc.deploy = [
    {
      title: 'Rolling update: surge, unavailable and capacity', short: 'rolling update', animation: {
        kind: 'rollout', replicas: 4,
        presets: [
          { label: 'maxSurge 1, maxUnavailable 0', ops: [{ op: 'update', s: 1, u: 0 }] },
          { label: 'The default 25% / 25%', ops: [{ op: 'update', s: 1, u: 1 }] },
          { label: 'maxSurge 0, maxUnavailable 1', ops: [{ op: 'update', s: 0, u: 1 }] },
          { label: 'A broken image stalls, capacity holds', ops: [{ op: 'update', s: 1, u: 0, bad: true }] },
          { label: 'Stalled, then rolled back', ops: [{ op: 'update', s: 1, u: 0, bad: true }, { op: 'rollback', s: 1, u: 0 }] }
        ]
      },
      intro: 'Change the surge and unavailable limits, or ship a broken image, and watch the Deployment move pods between ReplicaSets while two counters guard capacity.',
      trigger: 'How do you ship version 2 to every pod without dropping below full capacity, when yesterday\'s rollout fell to 50%? Four replicas here (example).',
      run: "kubectl set image deployment/web web=web:v2\nkubectl rollout status deployment/web\nkubectl rollout undo deployment/web\n# strategy: rollingUpdate: { maxSurge: 25%, maxUnavailable: 25% }   # the defaults",
      expect: 'Total pods stay at or below replicas + maxSurge and ready pods at or above replicas - maxUnavailable. A new pod that never becomes ready stops the rollout without dropping capacity.',
      edges: [
        E('Both set to 0', 'maxSurge 0 and maxUnavailable 0 would forbid creating or removing any pod, so the API rejects it.', 'Allow at least one of them to be above 0.'),
        E('Percentages round differently', 'maxSurge rounds up and maxUnavailable rounds down, so 25% of 3 replicas gives surge 1 and unavailable 0.', 'Use absolute numbers for small deployments, so the behaviour is obvious.')
      ],
      invariant: 'During a rolling update, total pods never exceed replicas + maxSurge and ready pods never fall below replicas - maxUnavailable.',
      src: 'Kubernetes docs: Deployments (Rolling Update Deployment, <code>maxSurge</code> and <code>maxUnavailable</code> defaulting to 25%, <code>progressDeadlineSeconds</code>). The model works in whole pods and rounds of one readiness delay.'
    },
    {
      title: 'Rollback, history and the progress deadline', short: 'rollback', kind: 'rollback',
      intro: 'Every pod template change creates a ReplicaSet and the old ones are kept, so a rollback is another rolling update towards an existing ReplicaSet.',
      trigger: 'A rollout to a broken image stalled halfway. You need to see the history and go back (example).',
      run: "kubectl rollout history deployment/web\nkubectl rollout undo deployment/web --to-revision=2\nkubectl get replicasets -l app=web",
      expect: 'The Deployment keeps up to 10 old ReplicaSets (scaled to 0), reports a stalled rollout after 600 s, and does not roll back by itself.',
      steps: [
        S('One ReplicaSet per template', 'A change to <code>spec.template</code> gets a new pod-template hash and a new ReplicaSet. The old ReplicaSet is not deleted: it is scaled down to 0 pods and kept.', { rows: [['web-7d4f9', 'v1', 4, 'old'], ['web-9b6c2', 'v2', 0, 'new']] }, '2 ReplicaSets'),
        S('The rollout runs', 'The Deployment moves pods from the old ReplicaSet to the new one, within the surge and unavailability limits.', { rows: [['web-7d4f9', 'v1', 3, 'old'], ['web-9b6c2', 'v2', 1, 'new']] }, 'moving pods'),
        S('The new pods never become ready', 'The v2 image fails its readiness probe. The Deployment cannot remove old ready pods without breaking the capacity floor, so it stops. The service keeps running on v1.', { rows: [['web-7d4f9', 'v1', 4, 'old'], ['web-9b6c2', 'v2', 1, 'stuck']] }, 'stalled, capacity intact'),
        S('The progress deadline', 'After <code>progressDeadlineSeconds</code> (600 s by default) with no progress, the Deployment gets the condition Progressing=False with reason ProgressDeadlineExceeded. It only reports this: it does not undo the rollout.', { rows: [['web-7d4f9', 'v1', 4, 'old'], ['web-9b6c2', 'v2', 1, 'stuck']], deadline: true }, 'ProgressDeadlineExceeded after 600 s'),
        S('Roll back', '<code>kubectl rollout undo</code> sets the template back to the previous revision. The Deployment finds the existing ReplicaSet for v1 and scales it up while removing the broken v2 pods.', { rows: [['web-7d4f9', 'v1', 4, 'new'], ['web-9b6c2', 'v2', 0, 'old']] }, 'back on v1'),
        S('History is bounded', '<code>revisionHistoryLimit</code> (10 by default) caps how many old ReplicaSets are kept for rollback. Older ones are deleted, so you can only go back that far.', { rows: [['web-7d4f9', 'v1', 4, 'new'], ['web-9b6c2', 'v2', 0, 'old'], ['web-5a1e0', 'v0', 0, 'old']], history: true }, 'up to 10 old ReplicaSets') 
      ],
      edges: [
        E('A change that is not a rollout', 'Scaling replicas or changing labels on the Deployment does not create a ReplicaSet, so it does not appear in the history.', 'Only template changes are revisions; record the reason with the change-cause annotation.'),
        E('minReadySeconds', 'A pod that is ready for a moment and then fails counts as available at once unless <code>minReadySeconds</code> is set.', 'Set minReadySeconds so a pod must stay ready for a while before the rollout counts it.')
      ],
      invariant: 'Each pod template has its own ReplicaSet, and a rollback scales an existing one up.',
      src: 'Kubernetes docs: Deployments (<code>revisionHistoryLimit</code> 10, <code>progressDeadlineSeconds</code> 600, <code>minReadySeconds</code>, rollback, rollout history).'
    },
    {
      title: 'PodDisruptionBudget: draining without an outage', short: 'disruption budget', kind: 'pdb',
      intro: 'Draining a node evicts its pods. A PodDisruptionBudget limits how many pods of a workload can be taken down by such voluntary actions at once.',
      trigger: 'Operators drain nodes for an upgrade while a service of 6 pods must keep at least 5 ready (example).',
      run: "apiVersion: policy/v1\nkind: PodDisruptionBudget\nspec: { minAvailable: 5, selector: { matchLabels: { app: web } } }\nkubectl drain node-2 --ignore-daemonsets",
      expect: 'The eviction API refuses an eviction that would leave fewer than 5 ready pods, so the drain waits until a replacement is ready.',
      steps: [
        S('The budget', 'With 6 ready pods and <code>minAvailable: 5</code>, one pod may be disrupted at a time: allowed disruptions = ready − minAvailable = 1.', { ready: 6, total: 6, min: 5, msg: 'allowed disruptions: 1' }, 'allowed disruptions 1'),
        S('Drain evicts one pod', '<code>kubectl drain</code> asks the eviction API to evict each pod on the node. The first eviction is allowed: 6 ready → 5 ready.', { ready: 5, total: 6, min: 5, msg: 'one pod evicted', evicted: 1 }, '5 ready'),
        S('The next eviction is refused', 'A second pod on the node would leave 4 ready, below the budget. The eviction API answers 429 Too Many Requests, and the drain retries later.', { ready: 5, total: 6, min: 5, msg: '429: would violate the budget', blocked: true, evicted: 1 }, '429 · drain waits'),
        S('A replacement becomes ready', 'The Deployment creates a replacement on another node. When it is ready the count is back to 6, so the budget allows the next eviction.', { ready: 6, total: 6, min: 5, msg: 'replacement ready' }, 'back to 6 ready'),
        S('A budget that is too strict', 'With <code>minAvailable</code> equal to the number of replicas, allowed disruptions is 0 and no pod can ever be evicted. The drain blocks for ever and the upgrade stalls.', { ready: 6, total: 6, min: 6, msg: 'allowed disruptions: 0', blocked: true }, 'drain blocked for ever'),
        S('It covers voluntary disruptions only', 'A node that crashes or loses power is an involuntary disruption: the budget does not stop it. It guards drains, upgrades and autoscaler scale-downs that use the eviction API.', { ready: 4, total: 6, min: 5, msg: 'node crash ignores the budget', crash: true }, 'budget does not protect from crashes')
      ],
      edges: [
        E('A single replica with a budget', 'A workload with one pod and minAvailable 1 can never be drained.', 'Run at least two replicas for anything that must survive node maintenance.'),
        E('maxUnavailable versus minAvailable', 'minAvailable as a percentage rounds up, which can make a small deployment undisruptable.', 'Prefer <code>maxUnavailable</code> with absolute numbers for small workloads.')
      ],
      invariant: 'The eviction API allows a voluntary eviction only while ready pods stay at or above minAvailable.',
      src: 'Kubernetes docs: Specifying a Disruption Budget for your Application, Safely Drain a Node, API-initiated Eviction.'
    }
  ];
})();
