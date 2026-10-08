# Kubernetes Course Chapter Plan (11 chapters)

## Objective
Rewrite `techstack/k8s/01-k8s-internals-end-to-end.html` in the problem-based format. ("kubenet" in the request means this page.) The course problem: one web service deployed with `kubectl apply`, followed from the API call to running, routed, rolled, scaled and self-healing pods. Pin Kubernetes 1.30+, and verify the defaults for the pinned version.

## Source coverage
- **Docs:** kubernetes.io/docs/
  - concepts/overview/components
  - reference/using-api/server-side-apply, reference/using-api/api-concepts (resourceVersion, watch, 410 Gone)
  - reference/access-authn-authz/ (authentication, rbac, admission-controllers, extensible-admission-controllers)
  - concepts/cluster-administration/flow-control
  - tasks/administer-cluster/configure-upgrade-etcd (space quota, defragmentation)
  - concepts/architecture/controller, concepts/overview/working-with-objects/finalizers, owners-dependents
  - concepts/scheduling-eviction/ (kube-scheduler, taint-and-toleration, assign-pod-node, topology-spread-constraints)
  - concepts/workloads/pods/pod-lifecycle, concepts/configuration/manage-resources-containers
  - tasks/configure-pod-container/configure-liveness-readiness-startup-probes
  - concepts/services-networking/service, endpoint-slices; reference/networking/virtual-ips
  - concepts/workloads/controllers/deployment
  - tasks/run-application/horizontal-pod-autoscale
  - concepts/architecture/nodes (heartbeats), concepts/architecture/leases, tasks/run-application/configure-pdb
- **Source code** (kubernetes/kubernetes, verify at release-1.30+):
  - staging/src/k8s.io/apiserver/pkg/endpoints/filters, …/apiserver/pkg/admission
  - plugin/pkg/auth/authorizer/rbac
  - staging/src/k8s.io/apiserver/pkg/storage/etcd3
  - staging/src/k8s.io/client-go/tools/cache (reflector, shared_informer, delta_fifo), client-go/util/workqueue
  - pkg/controller/replicaset, pkg/controller/deployment
  - pkg/scheduler/framework/plugins
  - pkg/kubelet (prober, kuberuntime)
  - pkg/controller/endpointslice
  - pkg/proxy/iptables
  - pkg/controller/podautoscaler
  - pkg/controller/nodelifecycle

## Design constraints
- The count of 11 comes from the 10 old chapters plus "Probes and readiness". The old kubelet chapter's design already includes readiness reporting, and the services chapter depends on it ("readiness" appears 23 times on the old page).
- Order: desired state → API front door → storage → controllers → placement → node agent → health → traffic → rollout → scale → failure.
- `archSteps` only in ch0.

## Chapters

### ch0 · kubectl apply, End to End (`s:'desired state · watch chain'`, pg `apply`, archSteps)
- **Source:** components overview; server-side-apply; controller docs.
- **Problem:** `kubectl apply` returns in 200 ms and says "configured", but the new pods appear 20 s later or never. Who actually starts the containers?
- **Predict:** "Which component creates the Pod objects for a new Deployment?"
  - Answer: the ReplicaSet controller (Deployment → ReplicaSet → Pods).
- **Core idea:** Store only desired state, in one place. Independent components each watch it and move reality one step closer.
- **Mechanism:** the apiserver stores the Deployment; the Deployment controller creates a ReplicaSet; the ReplicaSet controller creates Pods; the scheduler binds them; the kubelet runs them; EndpointSlices are updated.
- **archSteps modes:** "create" and "update image" (the old scenario "create → update → delete").
- **Playground:**
  - Controls: an editable mini manifest (replicas, image, labels); seg for which controller is stopped (none / deployment / replicaset / scheduler / kubelet); Play.
  - Stats: objects created per kind, step where the chain stops, time to Ready (ticks).
- **Common:**
  1. Server-side apply conflict with another field manager ("conflict with \"kubectl-edit\"", representative wording).
  2. A manual `kubectl scale` is reverted by GitOps or an HPA, because declared state wins.
  3. An apply that only changes Deployment metadata, not the pod template, triggers no rollout.

### ch1 · API Server: Authentication, RBAC, Admission (`s:'authn · authz · admission · validation'`, pg `apiserver`)
- **Source:** access-authn-authz pages; flow-control; endpoints/filters.
- **Problem:** A CI token can delete production namespaces, and a broken admission webhook blocks every deploy.
- **Predict:** "A request fails RBAC. Does the mutating webhook still run?"
  - Answer: no, the first failing stage rejects it.
- **Core idea:** One gatekeeper: every request passes the same chain, and the first failing stage rejects it before anything is written.
- **Mechanism:**
  - authentication;
  - RBAC (Role, Binding, verbs, resources);
  - mutating admission, schema validation, validating admission;
  - API Priority and Fairness.
- **Playground:**
  - Controls: seg for user (admin / ci-bot / viewer); seg for verb and resource; toggle webhook down with failurePolicy (Fail / Ignore); slider for request burst.
  - Stats: stage reached, HTTP code (201/403/500/429), store revision changed (yes/no).
- **Common:**
  1. `Error from server (Forbidden): deployments.apps is forbidden: User "…" cannot create resource "deployments" in API group "apps" in the namespace "…"`
  2. A webhook with `failurePolicy: Fail` is down and all matching creates fail with `failed calling webhook`.
  3. Bursts hit API Priority and Fairness (429), and clients log `Waited for …s due to client-side throttling`.

### ch2 · etcd, resourceVersion and Watch (`s:'revisions · conflicts · watch'`, pg `etcd`)
- **Source:** api-concepts; configure-upgrade-etcd; storage/etcd3.
- **Problem:** Two controllers update the same Deployment at once, and one change silently disappears (in a homegrown tool).
- **Predict:** "Two updates both carry resourceVersion 41. What happens to the second?"
  - Answer: 409 Conflict.
- **Core idea:** Version every write with one global revision. Updates are compare-and-swap on resourceVersion, and readers stream changes from a revision.
- **Mechanism:**
  - etcd MVCC revision;
  - resourceVersion;
  - optimistic concurrency;
  - watch from a revision;
  - compaction and 410 Gone;
  - object size limit;
  - db quota.
- **Playground:**
  - Controls: two clients' read and update steps; slider for compaction point; button "watch from rv N"; slider for object size.
  - Stats: conflicts, lost updates (with and without CAS), events replayed, 410s.
- **Common:**
  1. `the object has been modified; please apply your changes to the latest version and try again`
  2. A watch fails with `too old resource version` (410 Gone) after compaction.
  3. `mvcc: database space exceeded`. Fix: compaction plus defragmentation, and the quota.
  4. A ConfigMap or Secret over etcd's request limit is rejected (`Request entity too large`, representative wording).

### ch3 · Controllers and Reconcile Loops (`s:'informers · work queue · level-triggered'`, pg `controllers`)
- **Source:** controller docs; finalizers; owners-dependents; client-go cache and workqueue; pkg/controller/replicaset.
- **Problem:** A pod is deleted and the "pod deleted" event is lost during a controller restart. Is the pod ever replaced?
- **Predict:** "The DELETE event was dropped. When is the pod recreated?"
  - Answer: at the next resync or relist, because controllers compare levels, not events.
- **Core idea:** Level-triggered: whatever woke the controller, it re-reads current state, compares it with desired state and takes the smallest step.
- **Mechanism:**
  - reflector, list and watch;
  - informer cache;
  - work queue with rate limiting;
  - reconcile;
  - ownerReferences;
  - finalizers.
- **Playground:**
  - Controls: slider for desired replicas; buttons "delete pod" and "drop next event"; seg for edge-triggered / level-triggered controller; slider for resync period.
  - Stats: actual vs desired, reconciles, time to converge, stuck forever (yes/no).
- **Common:**
  1. An object stays `Terminating` forever because a finalizer's controller is gone.
  2. Two ReplicaSets with overlapping selectors fight over pods.
  3. A controller hot-loops on a permanent error. Fix: rate-limited requeue with backoff.

### ch4 · Scheduler: Filter, Score, Bind (`s:'requests · taints · affinity'`, pg `scheduler`)
- **Source:** kube-scheduler, taint-and-toleration, assign-pod-node, topology-spread-constraints, manage-resources-containers; scheduler framework plugins.
- **Problem:** A new pod asks for 200m CPU and an SSD and stays Pending among 120 nodes.
- **Predict:** "A node has 4 CPU, usage 1 CPU, and requests already 3.9 CPU. Can a 200m pod land there?"
  - Answer: no, the scheduler counts requests, not usage.
- **Core idea:** Filter out every node that cannot run the pod, score the rest, then bind by writing `spec.nodeName`.
- **Mechanism:**
  - NodeResourcesFit;
  - taints and tolerations;
  - nodeSelector and affinity;
  - topology spread;
  - scoring;
  - bind.
- **Playground:**
  - Data: 6 nodes with capacity, requests, taints and labels.
  - Controls: pod requests; tolerations; nodeSelector; anti-affinity toggle.
  - Stats: feasible nodes, chosen node, the Pending reason string.
- **Common:**
  1. `0/6 nodes are available: 3 Insufficient cpu, 3 node(s) had untolerated taint {…}` (representative format).
  2. Requests far above real usage leave nodes idle while pods stay Pending.
  3. Required pod anti-affinity with more replicas than nodes leaves pods Pending forever.

### ch5 · Kubelet and Pod Lifecycle (`s:'CRI · restarts · limits'`, pg `kubelet`)
- **Source:** pod-lifecycle; manage-resources-containers; pkg/kubelet/kuberuntime.
- **Problem:** The pod is bound to node-1, but it never becomes Running, or it restarts every few minutes.
- **Predict:** "A container exceeds its memory limit. What does `kubectl describe` show?"
  - Answer: Last State: Terminated, Reason OOMKilled, exit code 137.
- **Core idea:** An agent on every node reconciles its own pods: it watches pods bound to it, drives the container runtime (CRI) and reports status back.
- **Mechanism:**
  - pod phases and container states;
  - image pull with backoff;
  - restartPolicy and CrashLoopBackOff;
  - cgroup limits (OOM kill, CPU CFS throttling);
  - status updates.
- **Playground:**
  - Controls: seg for image (valid / typo); seg for app behaviour (ok / exits 1 / leaks memory / CPU busy); sliders for memory and CPU limits; Play.
  - Stats: phase timeline, restarts, back-off delay, throttled %.
- **Common:**
  1. `ErrImagePull` then `ImagePullBackOff`.
  2. `CrashLoopBackOff`, with back-off growing to 5 minutes.
  3. `OOMKilled` (exit code 137) from a limit below the real peak.
  4. CPU limits throttle a latency-sensitive service while node CPU is idle.

### ch6 · Probes and Readiness (`s:'liveness · readiness · startup'`, pg `probes`)
- **Source:** configure-liveness-readiness-startup-probes; pod-lifecycle (conditions); pkg/kubelet/prober.
- **Problem:** During a database blip, every replica restarts at once and the outage gets longer.
- **Predict:** "The readiness probe fails. Is the container restarted?"
  - Answer: no, it is only removed from endpoints. Liveness restarts.
- **Core idea:** Separate the questions: alive (restart me), ready (send me traffic), started (do not judge me yet).
- **Mechanism:**
  - probe types and parameters (`initialDelaySeconds`, `periodSeconds`, `failureThreshold`);
  - the Ready condition;
  - startupProbe gating.
- **Playground:**
  - Controls: app timeline (slow start, dependency outage, load spike); seg for each probe's target (/healthz shallow / checks DB); sliders for probe parameters.
  - Stats: restarts, seconds serving traffic while not ready, capacity lost.
- **Common:**
  1. A liveness probe that checks the database restarts the whole fleet during a DB outage.
  2. Without a readiness probe, traffic reaches pods still warming up.
  3. A slow-starting app is killed by liveness before it is up. Fix: startupProbe.
  4. A tight liveness timeout under load causes a restart cascade.

### ch7 · Services, EndpointSlices and kube-proxy (`s:'virtual IP · endpoints · NAT rules'`, pg `services`)
- **Source:** service docs, endpoint-slices, virtual-ips; pkg/controller/endpointslice; pkg/proxy/iptables.
- **Problem:** Pods get new IPs on every deploy, and during scale-down users see 502s for a few seconds.
- **Predict:** "A pod gets SIGTERM. Which happens first: removal from every node's rules, or the process exit?"
  - Answer: not guaranteed. They race.
- **Core idea:** A stable virtual IP, a live list of ready pod IPs (EndpointSlices), and every node rewrites packets for the virtual IP to one of them.
- **Mechanism:**
  - Service selector;
  - EndpointSlice controller;
  - kube-proxy iptables/IPVS rules;
  - conntrack;
  - the termination race with preStop.
- **Playground:**
  - Controls: slider for replicas; button "scale down"; slider for rule-sync lag; slider for preStop sleep; seg for client (short HTTP/1.1 / long-lived HTTP/2).
  - Stats: failed requests, requests per pod, endpoints count.
- **Common:**
  1. A selector does not match the pod labels, so endpoints are empty.
  2. 502s during scale-down or rollout. Fix: a preStop sleep longer than the propagation lag, and a graceful shutdown.
  3. `nf_conntrack: table full, dropping packet`
  4. Long-lived gRPC/HTTP2 connections never rebalance through a ClusterIP.

### ch8 · Rolling Update (`s:'ReplicaSets · maxSurge · maxUnavailable'`, pg `rollout`)
- **Source:** deployment docs; pkg/controller/deployment.
- **Problem:** Ship version 2 to all pods without dropping below full capacity. Yesterday's rollout dropped to 50%.
- **Predict:** "replicas=4, maxSurge=0, maxUnavailable=25%. What is the minimum Ready count during the rollout?"
  - Answer: 3.
- **Core idea:** A new pod template gets its own ReplicaSet. The Deployment controller shifts replicas in steps bounded by maxSurge and maxUnavailable, counting only Ready pods.
- **Mechanism:**
  - pod-template hash;
  - old and new ReplicaSets;
  - surge and unavailable arithmetic;
  - progressDeadlineSeconds;
  - rollout history and undo.
- **Playground:**
  - Controls: slider for replicas; slider for maxSurge; slider for maxUnavailable; seg for v2 health (ok / never ready); Play.
  - Stats: min Ready, max total pods, rollout time, stuck (yes/no).
- **Common:**
  1. The rollout is stuck with `ProgressDeadlineExceeded`.
  2. maxUnavailable rounding on a small replica count drops capacity.
  3. `spec.selector` changed: `field is immutable`.

### ch9 · Horizontal Pod Autoscaler (`s:'target utilisation · stabilisation'`, pg `hpa`)
- **Source:** horizontal-pod-autoscale (algorithm `desired = ceil(current × metric / target)`, `behavior`, stabilisation window); pkg/controller/podautoscaler.
- **Problem:** Traffic jumps 7× at 8 p.m. How many replicas, and when do you scale back without flapping?
- **Predict:** "4 replicas at 140% of a 70% target. Desired replicas?"
  - Answer: 8.
- **Core idea:** Compute replicas proportionally from utilisation versus target, scale up fast, and scale down only to the highest recommendation within the stabilisation window.
- **Mechanism:**
  - metrics pipeline;
  - utilisation relative to requests;
  - tolerance;
  - behaviour policies;
  - min and max replicas.
- **Playground:**
  - Controls: load curve preset (step 7× / sawtooth); slider for target; slider for scale-down window; slider for maxReplicas; toggle "requests set".
  - Stats: replicas over time, peak utilisation, scale events, minutes over target.
- **Common:**
  1. `<unknown>` targets: `failed to get cpu utilization: missing request for cpu` (representative).
  2. Flapping from a short stabilisation window.
  3. CPU-based scaling on an I/O-bound service never triggers.
  4. maxReplicas is reached silently: the condition `ScalingLimited`.

### ch10 · Node Failure and Self-Healing (`s:'leases · taints · eviction'`, pg `nodefail`)
- **Source:** nodes (heartbeats), leases, taint-and-toleration (taint-based evictions, default `tolerationSeconds` 300), configure-pdb; pkg/controller/nodelifecycle. Verify `node-monitor-grace-period` for the pinned version.
- **Problem:** A machine loses power at 3 a.m. How does the cluster notice and heal, and why did the StatefulSet pod not come back?
- **Predict:** "The node stops heartbeating. When are its Deployment pods recreated elsewhere?"
  - Answer: after the grace period plus the NoExecute toleration (about 5 minutes by default).
- **Core idea:** Treat silence as suspicion, not death. Mark the node NotReady and taint it, evict after a toleration period, and let the normal ReplicaSet loop replace the pods.
- **Mechanism:**
  - node Lease heartbeats;
  - node lifecycle controller;
  - `node.kubernetes.io/unreachable` NoExecute taint;
  - tolerationSeconds;
  - StatefulSet at-most-one semantics;
  - PodDisruptionBudget for voluntary drains.
- **Playground** (the old scenario "worker node fails"):
  - Controls: button "kill node" / "partition node"; slider for grace period; slider for tolerationSeconds; seg for workload (Deployment / StatefulSet); toggle PDB with a drain.
  - Stats: time to replacement, capacity lost (pod-minutes), duplicate pods (must stay 0 for the StatefulSet).
- **Common:**
  1. StatefulSet pods on a dead node are not replaced until the node object is deleted or confirmed gone.
  2. A drain blocks: `Cannot evict pod as it would violate the pod's disruption budget.`
  3. All replicas on one node or zone (no topology spread) means a full outage.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 kubectl apply (end-to-end sequence) + scenario "create → update → delete" | ch0 |
| ch1 API server | ch1 |
| ch2 etcd & watch | ch2 |
| ch3 Controllers | ch3 |
| ch4 Scheduler | ch4 |
| ch5 Kubelet, lifecycle and CRI | ch5 |
| ch5 Kubelet, readiness and probes | ch6 |
| ch6 Services & kube-proxy | ch7 |
| ch7 Rolling update | ch8 |
| ch8 Autoscaling | ch9 |
| ch9 Node failure + scenario "worker node fails" | ch10 |

## Dropped or merged, and why
- **"Edit the manifest yourself (YAML)" panel:** merged into the ch0 mini-manifest controls, with fixed fields only.
- **Milestones:** dropped as a section; their assertions appear as the playgrounds' fix outcomes.
