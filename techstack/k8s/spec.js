/* Spec for the Kubernetes system-design course: overview, problem, requirements, estimates, high-level design, and the per-feature specs.
 * Facts target Kubernetes 1.33. Defaults come from the Kubernetes docs and the component flag references; see spec.verify. */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = {
  id: 'k8s', name: 'Kubernetes', version: '1.33', root: '../../', brand: '#326ce5'
};
CourseData.spec = {
  version: '1.33',
  title: 'Design a container orchestrator',
  navTitle: 'Container orchestrator',
  lead: 'Start from a platform that must keep 600 containers running on 120 machines through 50 deploys a day and a machine failing every other day, with no human in the loop. Work out what the system has to do and how it is built, then walk each feature through the use cases that decide whether it behaves in production.',
  overview: [
    '<b>What it is.</b> Kubernetes stores the state you want (a Deployment of 10 pods) and the state it observes in one database, etcd, behind one API server. Nothing is started by a command. Independent controllers watch that store, compare desired with observed, and write the next small change until the two match. The same loop runs for scheduling, scaling, rollouts and recovery.',
    '<b>Who does what.</b> The API server is the only component that talks to etcd: it authenticates, authorises, validates and stores objects. Controllers (in the controller manager) turn Deployments into ReplicaSets and pods. The scheduler picks a node for each unplaced pod. The kubelet on each node starts and watches the containers and reports status. kube-proxy and CoreDNS make Services reachable. Components never call each other: they watch the API server.'
  ],
  problem: [
    ['<b>Scenario</b>', 'A platform team runs 600 containers for 40 services on 120 machines. It ships 50 deploys a day, traffic jumps 7 times at 8 p.m., and a machine loses power every other day (example numbers).'],
    ['<b>Naive design</b>', 'A central scheduler that SSHes to machines to start and stop containers, a script per deploy, and an operator paged to move work when a machine dies.'],
    ['<b>Fails when</b>', 'The scheduler is down during a deploy, so nothing converges. Two scripts change the same service and one overwrites the other. A failed machine\'s containers stay dead until someone notices. A restart in the middle of a step leaves half a change.'],
    ['<b>Principle</b>', 'Store the desired state, not a list of commands, and let many small controllers each repeatedly compare it with what is observed and fix one gap. Because every loop looks at the current state instead of remembering events, a crash or a missed event only delays convergence.']
  ],
  fr: [
    'Store objects with a desired state and an observed state, and let clients watch changes.',
    'Keep the number of pods of a workload equal to the number asked for, whatever fails.',
    'Place each pod on a node that fits it, from requests and constraints.',
    'Start containers on the node, check their health, and restart them when stuck.',
    'Give a set of pods a stable address and send traffic only to ready pods.',
    'Roll out a new version without dropping below a capacity floor, and roll back.',
    'Add and remove pods as load changes.',
    'Detect a dead node and move its work, and keep the control plane itself available.'
  ],
  nfr: [
    '<b>Convergence:</b> every controller reaches the desired state from any starting state, including after a restart or a missed event.',
    '<b>No lost updates:</b> two writers cannot silently overwrite one another: the store checks the version.',
    '<b>Capacity during change:</b> a rolling update keeps ready pods at or above <code>replicas - maxUnavailable</code>.',
    '<b>Safe traffic:</b> only pods whose readiness probe passes receive Service traffic.',
    '<b>Bounded detection:</b> a dead node is noticed in about 40 to 50 seconds and its pods are replaced after the toleration window (5 minutes by default).',
    '<b>Control-plane availability:</b> writes need a majority of etcd members, and active controllers hold a lease so only one acts.'
  ],
  out: 'Installation and cluster sizing guides, container runtimes and CNI plugin internals, storage classes and CSI, service meshes and Ingress controllers in depth, custom resources and operators, security hardening, and managed offerings.',
  est: [
    ['How much state is in etcd?', '600 pods + their ReplicaSets, Services, EndpointSlices, Nodes and events ≈ 5,000 objects × ~2 KB (assumed) ≈ 10 MB', 'Tiny against the default 2 GiB etcd quota: the limit that matters is object size (about 1 MiB) and write rate, not total size (feature 1).'],
    ['What is the heartbeat load?', '120 kubelets renew a Lease about every 10 s = 12 small writes/s, plus node status updates only when something changes', 'Cheap by design: Leases replaced a full node-status write every heartbeat (feature 8).'],
    ['How long does a rollout of 100 replicas take?', 'maxSurge 25% = 25 extra pods: 4 waves of 25. Each wave takes image pull + start + readiness (assume 30 s)', 'About 2 minutes of waves, with at most 125 pods and at least 75 ready (assumed pod start time, feature 6).'],
    ['How fast does autoscaling react?', 'HPA sync every 15 s, scale-up at most double per step, pods need 30 s to warm (assumed)', 'From 3 to 21 pods in about 4 to 5 steps, one minute or two (feature 7).'],
    ['How long until a dead node\'s pods run elsewhere?', 'Grace period 40 s (50 s from 1.32) + default toleration 300 s + schedule and start about 30 s', 'About 6 minutes by default; tune tolerationSeconds for services that can move faster (feature 8).'],
    ['How many etcd members?', '3 members tolerate 1 failure (majority 2), 5 tolerate 2 (majority 3)', 'Three or five, never an even number (feature 9).']
  ],
  hldNote: 'Select a box to open that feature. Every arrow is a watch or a write through the API server: kubectl and controllers write objects, the scheduler binds pods, the kubelet runs them, and etcd stores it all.',
  decisions: [
    ['Command or declaration?', 'Declare the desired state and let controllers converge', 'Self-healing and idempotent, at the price that effects are eventual, not immediate.'],
    ['React to events or to state?', 'Level-triggered: every loop compares the current state', 'A lost event only delays recovery, at the price of a periodic re-check and caches.'],
    ['Let components call each other?', 'No: all coordination through watches on the API server', 'Loose coupling and one audit point, at the price that the API server and etcd are the critical path.'],
    ['Strong consistency for state?', 'Yes for the store (etcd, Raft), eventual between components', 'No split-brain in the record of truth, at the price that writes need a majority.']
  ],
  verify: [
    'Defaults used in the text (<code>maxSurge</code> and <code>maxUnavailable</code> 25%, <code>progressDeadlineSeconds</code> 600, <code>revisionHistoryLimit</code> 10, HPA sync 15 s with a 10% tolerance and a 300 s scale-down window, node-monitor-grace-period 40 s and 50 s from 1.32, default tolerationSeconds 300, <code>terminationGracePeriodSeconds</code> 30, leader election 15 s / 10 s / 2 s, etcd quota 2 GiB) match the Kubernetes docs and component references. They were written from those pages by knowledge and were not re-fetched in this build.',
    'Values that differ by version or distribution (metrics-server scrape interval, the CoreDNS and node-local DNS setup, kube-proxy mode, pod start times, cloud autoscaler timings) are marked as examples or left out. Confirm them for your cluster.',
    'The etcd, reconcile-loop, scheduler, rolling-update and HPA animations are simplified models: one object, one ReplicaSet, a filter and two score plugins, rounds of whole pods, and a 15 s tick. The mechanisms (resourceVersion conflicts, level-triggered reconcile, filter then score then bind, surge and unavailable bounds, the HPA formula) are the real ones. The Raft animation is reused for etcd with three members.',
    'Everything else (sizes, counts, rates, durations of example workloads) is an <b>example or assumption</b> and is labelled that way.'
  ]
};

CourseData.features = [
  {
    id: 'api', tag: 'API and store', name: 'API server, admission and etcd',
    summary: 'One API server stores declared state in etcd, checks who may change it, and lets everyone watch.',
    goal: 'Accept changes safely, store them consistently, and tell watchers.',
    scope: [['Request path: authentication, authorisation, admission, storage', 'resourceVersion and watch'], ['Aggregated APIs and CRD internals']],
    fr: ['Authenticate and authorise each request.', 'Validate and store objects in etcd.', 'Reject a write based on a stale version.', 'Stream changes to watchers from a revision.'],
    nfr: ['Only the API server writes to etcd.', 'An update carries a resourceVersion and conflicts return 409.', 'A watch can resume from a recent revision, otherwise the client re-lists.'],
    decisions: [['How to avoid lost updates?', 'Optimistic concurrency with resourceVersion', 'No locks, at the price that clients retry on 409.'], ['Push or poll?', 'Watch streams from a revision', 'Cheap and timely, at the price of handling a too-old revision.']]
  },
  {
    id: 'ctrl', tag: 'controllers', name: 'Controllers and reconcile loops',
    summary: 'Each controller compares desired with observed state and fixes one gap, from a cache and a work queue.',
    goal: 'Converge to the desired state from any starting point.',
    scope: [['Informers, work queues, reconcile', 'Owner references and garbage collection'], ['Writing a custom operator']],
    fr: ['Cache objects locally through list and watch.', 'Queue keys, not events, and reconcile one at a time.', 'Delete dependents when an owner is deleted.'],
    nfr: ['A lost event never leaves drift for ever.', 'Many events for one key cost one reconcile.', 'Failures retry with backoff.'],
    decisions: [['Edge or level triggered?', 'Level', 'Self-healing after a crash, at the price of re-checking state.'], ['Queue the event or the key?', 'The key', 'Natural de-duplication, at the price of losing the reason for the wake-up.']]
  },
  {
    id: 'sched', tag: 'scheduling', name: 'Scheduler',
    summary: 'The scheduler filters nodes that cannot run a pod, scores the rest and binds the pod.',
    goal: 'Place each pod where it fits and the cluster stays balanced.',
    scope: [['Filter, score, bind', 'Requests, limits and QoS', 'Why a pod stays Pending'], ['Descheduler', 'Custom scheduler plugins']],
    fr: ['Filter nodes by resources, selectors and taints.', 'Score feasible nodes and bind the best.', 'Explain why no node fits.'],
    nfr: ['Placement uses requests, not actual use.', 'Binding only sets a node name.', 'A pod that fits nowhere stays Pending and is retried.'],
    decisions: [['Schedule by use or by request?', 'By request', 'Predictable and fast, at the price of unused reserved capacity.'], ['One global optimum?', 'No: greedy per pod', 'Fast decisions, at the price of fragmentation over time.']]
  },
  {
    id: 'kubelet', tag: 'node agent', name: 'Kubelet and probes',
    summary: 'The kubelet turns a bound pod into running containers, checks health with probes and reports status.',
    goal: 'Run the pods assigned to this node and report their real state.',
    scope: [['Pod phases and container states', 'Liveness, readiness and startup probes', 'Restart backoff'], ['CRI and CNI internals']],
    fr: ['Pull images and start containers.', 'Run probes and act on their result.', 'Restart failed containers with backoff.'],
    nfr: ['A failing liveness probe restarts the container; a failing readiness probe only removes it from traffic.', 'Restart delay grows to five minutes.', 'Status reflects what the kubelet observed.'],
    decisions: [['One probe or three?', 'Separate liveness, readiness and startup', 'Different questions need different reactions, at the price of more config.'], ['Restart at once?', 'No: exponential backoff', 'A crash loop cannot overwhelm the node, at the price of slower recovery.']]
  },
  {
    id: 'net', tag: 'networking', name: 'Services, endpoints and DNS',
    summary: 'A Service is a stable virtual IP over the ready pods, kept current by EndpointSlices and kube-proxy.',
    goal: 'Let clients reach a changing set of pods by one stable name.',
    scope: [['ClusterIP, EndpointSlices, kube-proxy', 'Graceful termination', 'In-cluster DNS'], ['Ingress, service mesh, network policy']],
    fr: ['Map a Service to the pods that match and are ready.', 'Stop sending traffic to a terminating pod.', 'Resolve Service names.'],
    nfr: ['Only ready pods are in the endpoints.', 'Removal from endpoints and SIGTERM race, so pods must drain.', 'DNS names resolve inside the cluster.'],
    decisions: [['Where does load balancing run?', 'On every node (kube-proxy rules)', 'No central balancer, at the price of eventual propagation of changes.'], ['Remove the pod first or stop it first?', 'Both start together', 'Fast shutdown, at the price of a race the application must handle.']]
  },
  {
    id: 'deploy', tag: 'rollouts', name: 'Deployments and rollouts',
    summary: 'A Deployment moves pods between ReplicaSets within a surge and an unavailability budget.',
    goal: 'Ship a new version without losing capacity, and undo it when it fails.',
    scope: [['maxSurge and maxUnavailable', 'Rollback and the progress deadline', 'PodDisruptionBudgets'], ['Canary and blue-green tooling']],
    fr: ['Create a ReplicaSet per pod template.', 'Scale old and new within the bounds.', 'Keep history for rollback.'],
    nfr: ['Total pods stay at most replicas + maxSurge.', 'Ready pods stay at least replicas - maxUnavailable.', 'A stalled rollout is reported after 600 s.'],
    decisions: [['Surge or unavailability?', 'Both bounded, default 25%', 'Faster rollouts with a capacity floor, at the price of extra pods during the update.'], ['Keep old ReplicaSets?', 'Yes, 10 by default', 'Instant rollback, at the price of objects in etcd.']]
  },
  {
    id: 'hpa', tag: 'autoscaling', name: 'Autoscaling',
    summary: 'The HPA turns average utilization into a replica count, and the cluster autoscaler adds nodes for pods that do not fit.',
    goal: 'Follow the load with the least pods that keep utilization near a target.',
    scope: [['The HPA formula, tolerance and stabilization', 'The metrics pipeline', 'Cluster autoscaler'], ['VPA', 'Event-driven autoscalers']],
    fr: ['Compute desired replicas from a metric.', 'Limit how fast replicas change.', 'Add nodes when pods are unschedulable.'],
    nfr: ['Utilization is relative to requests, so a request is required.', 'A 10% tolerance prevents flapping.', 'Scale-down waits for a 300 s window.'],
    decisions: [['Scale up and down at the same speed?', 'No: fast up, slow down', 'Absorbs spikes, at the price of paying for pods a few minutes longer.'], ['Metric from where?', 'metrics-server for CPU and memory', 'Simple, at the price of needing requests and custom metrics for anything else.']]
  },
  {
    id: 'node', tag: 'self-healing', name: 'Node failure and self-healing',
    summary: 'Missed heartbeats become taints, taints become evictions, and controllers replace the pods.',
    goal: 'Move work off a dead node without a human, and without running a stateful pod twice.',
    scope: [['Lease heartbeats and node conditions', 'Taints and eviction', 'StatefulSet identity', 'Node-pressure eviction'], ['Cluster API and repair tooling']],
    fr: ['Detect a silent node.', 'Evict pods after a toleration window.', 'Keep at most one pod per StatefulSet identity.', 'Evict by pressure when a node runs low.'],
    nfr: ['Detection takes about 40 to 50 s.', 'Default toleration is 300 s.', 'A StatefulSet pod is not replaced until the old one is known gone.'],
    decisions: [['Evict immediately?', 'Wait out a toleration window', 'Tolerates short blips, at the price of slower recovery.'], ['Replace a stateful pod while the node is unreachable?', 'No', 'Never two pods with one identity, at the price of manual action.']]
  },
  {
    id: 'plane', tag: 'control plane', name: 'Control plane and etcd',
    summary: 'etcd replicates with Raft, and replicated controllers use a lease so only one acts at a time.',
    goal: 'Keep the record of truth and the controllers available through failures.',
    scope: [['etcd members and quorum', 'Leader election by Lease'], ['Backup and restore procedures']],
    fr: ['Replicate every write to a majority of etcd members.', 'Elect one active controller-manager and scheduler.', 'Keep the API stateless and replicated.'],
    nfr: ['A write is committed once a majority stores it.', 'With no quorum the store is read-only or unavailable.', 'Leader election tolerates a stalled leader within the lease duration.'],
    decisions: [['How many etcd members?', '3 or 5', 'Tolerates 1 or 2 failures, at the price of more members and slower writes.'], ['Run all controller replicas actively?', 'No: one active, others standby', 'No conflicting actions, at the price of a pause on failover.']]
  }
];
