/* Mermaid diagrams for the Kubernetes system-design course, same layout as the other courses:
 *   CourseData.hldOverall, CourseData.hld[featureId], CourseData.diagrams['id:n'].
 * Mermaid syntax notes: no semicolons or hash signs in labels (they end a statement or start a comment). */
(function () {
  const SEQ = 'Sequence', STATE = 'State', FLOW = 'Flow';
  const D = (kind, title, src) => ({ kind, title, src });

  CourseData.hldOverall = `flowchart LR
  U["kubectl, CI"] --> API["API server<br/>authn, RBAC, admission"]
  API --> ET["etcd<br/>Raft, 3 or 5 members"]
  API -.->|"watch"| CM["Controller manager<br/>Deployment, ReplicaSet, HPA, node"]
  API -.->|"watch"| SC["Scheduler<br/>filter, score, bind"]
  API -.->|"watch"| KL["Kubelet on each node<br/>pods, probes"]
  KL --> RT["Container runtime"]
  API -.->|"watch"| KP["kube-proxy<br/>Service rules"]
  CD["CoreDNS"] -.->|"watch"| API
  CA["Cluster autoscaler"] -.-> API`;

  CourseData.hld = {
    api: `flowchart LR
  C["Client"] --> AN["Authenticate"]
  AN --> AZ["Authorize: RBAC"]
  AZ --> AD["Admission: mutate, validate"]
  AD --> VS["Schema validation"]
  VS --> ET["etcd write<br/>resourceVersion checked"]
  ET -.->|"watch events"| W["Watchers"]`,
    ctrl: `flowchart LR
  API["API server"] -->|"list and watch"| IF["Informer cache"]
  IF -->|"key only"| Q["Work queue<br/>dedup, backoff"]
  Q --> RC["Reconcile<br/>desired vs observed"]
  RC -->|"create, update, delete"| API
  RC -.->|"owner references"| GC["Garbage collector"]`,
    sched: `flowchart TD
  P["Pod without a node"] --> F["Filter<br/>resources, selector, taints"]
  F -->|"none pass"| PE["Pending, event, retry"]
  F -->|"some pass"| S["Score<br/>least allocated, balanced"]
  S --> B["Bind: spec.nodeName"]
  B --> K["Kubelet starts it"]`,
    kubelet: `flowchart LR
  W["Watch pods bound to this node"] --> SB["Pod sandbox and image pull"]
  SB --> ST["Start containers"]
  ST --> PR["Probes<br/>startup, liveness, readiness"]
  PR -->|"readiness ok"| RD["Ready: in endpoints"]
  PR -->|"liveness fails"| RS["Restart with backoff"]
  RD --> RP["Report status to the API server"]`,
    net: `flowchart LR
  SV["Service<br/>selector + ClusterIP"] --> ES["EndpointSlices<br/>ready pods only"]
  ES --> KP["kube-proxy rules on every node"]
  CL["Client pod"] -->|"ClusterIP"| KP
  KP -->|"per connection"| PD["Ready pod"]
  CD["CoreDNS"] -->|"name to ClusterIP"| CL
  PD -.->|"delete: endpoints and SIGTERM in parallel"| ES`,
    deploy: `flowchart TD
  T["New pod template"] --> NR["New ReplicaSet"]
  NR --> U{"total at most replicas + maxSurge?"}
  U -->|"yes"| CR["Create new pods"]
  CR --> RD{"ready at least replicas - maxUnavailable?"}
  RD -->|"yes"| DN["Scale the old ReplicaSet down"]
  RD -->|"no"| WT["Wait for readiness"]
  PDB["PodDisruptionBudget"] -.-> EV["Eviction API for drains"]`,
    hpa: `flowchart LR
  KB["Kubelet usage"] --> MS["metrics-server"]
  MS --> HP["HPA<br/>every 15 s"]
  HP -->|"desired replicas"| DP["Deployment scale"]
  DP --> PE["Pods Pending"]
  PE --> CA["Cluster autoscaler"]
  CA --> ND["New node"]`,
    node: `flowchart TD
  HB["Kubelet renews its Lease"] --> NC["Node controller"]
  NC -->|"silent for the grace period"| UN["Node Unknown + NoExecute taint"]
  UN --> TL{"Toleration 300 s over?"}
  TL -->|"yes"| EV["Evict pods"]
  EV --> RC["ReplicaSet makes new pods"]
  EV --> SS["StatefulSet waits for confirmation"]
  KP["Kubelet watches memory"] -->|"below threshold"| PE["Pressure eviction"]`,
    plane: `flowchart LR
  API1["API server 1"] --> ET["etcd leader"]
  API2["API server 2"] --> ET
  ET --> F1["etcd follower"]
  ET --> F2["etcd follower"]
  CM1["Controller manager A"] -->|"holds Lease"| LS["Lease object"]
  CM2["Controller manager B"] -.->|"standby"| LS`
  };

  CourseData.diagrams = {
    'api:1': [
      D(SEQ, 'apply to a running pod', `sequenceDiagram
  participant K as kubectl
  participant A as API server
  participant E as etcd
  participant C as Controllers
  participant S as Scheduler
  participant L as Kubelet
  K->>A: apply Deployment
  A->>E: store
  A-->>K: configured
  A-->>C: watch event
  C->>A: create ReplicaSet and pods
  A-->>S: watch event, pod without a node
  S->>A: bind to a node
  A-->>L: watch event, pod on my node
  L->>A: status Running`),
      D(STATE, 'A pod\'s path', `stateDiagram-v2
  [*] --> Created: controller creates it
  Created --> Scheduled: scheduler sets nodeName
  Scheduled --> Starting: kubelet pulls and starts
  Starting --> Ready: readiness passes
  Ready --> [*]`)
    ],
    'api:2': [
      D(FLOW, 'Gates before etcd', `flowchart TD
  R["Write request"] --> A{"Authenticated?"}
  A -->|"no"| X1["401"]
  A -->|"yes"| Z{"RBAC allows the verb?"}
  Z -->|"no"| X2["403"]
  Z -->|"yes"| M["Mutating webhooks"]
  M --> V["Validating webhooks"]
  V -->|"rejected or webhook down with Fail"| X3["Rejected"]
  V -->|"accepted"| S["Stored in etcd"]`),
      D(SEQ, 'A webhook in the path', `sequenceDiagram
  participant K as kubectl
  participant A as API server
  participant W as Webhook
  K->>A: create pod
  A->>W: admission review
  W--xA: no answer within the timeout
  A-->>K: error if failurePolicy is Fail`)
    ],
    'api:3': [
      D(SEQ, 'A conflict', `sequenceDiagram
  participant A as Client A
  participant B as Client B
  participant E as etcd
  A->>E: read web at resourceVersion 7
  B->>E: read web at resourceVersion 7
  A->>E: update with resourceVersion 7
  E-->>A: ok, resourceVersion 8
  B->>E: update with resourceVersion 7
  E-->>B: 409 Conflict
  B->>E: read again, retry`),
      D(FLOW, 'Resuming a watch', `flowchart TD
  W["Watch from revision R"] --> Q{"R still in the history?"}
  Q -->|"yes"| OK["Replay then stream"]
  Q -->|"no, compacted"| G["410 Gone"]
  G --> L["LIST current state"]
  L --> N["Watch from the list's revision"]`)
    ],
    'ctrl:1': [
      D(FLOW, 'One reconcile', `flowchart TD
  K["Key from the queue"] --> D["Read desired state: spec.replicas"]
  D --> O["Read observed state: pods in the cache"]
  O --> Q{"Equal?"}
  Q -->|"yes"| E["Done"]
  Q -->|"no"| A["Create or delete pods"]
  A --> E`),
      D(SEQ, 'A controller restart', `sequenceDiagram
  participant C as Controller
  participant A as API server
  C->>C: crashes, cache lost
  A->>A: a pod is deleted, nobody listening
  C->>A: restart: LIST all pods
  A-->>C: current pods
  C->>C: observed 2, desired 3
  C->>A: create a pod`)
    ],
    'ctrl:2': [
      D(SEQ, 'Events collapse into one key', `sequenceDiagram
  participant A as API server
  participant I as Informer
  participant Q as Work queue
  participant W as Worker
  A-->>I: update 1
  I->>Q: add default/web
  A-->>I: update 2 to 5
  I->>Q: add default/web again, no duplicate
  W->>Q: take default/web
  W->>I: read latest from the cache
  W->>A: reconcile once`),
      D(STATE, 'A key after a failure', `stateDiagram-v2
  [*] --> Queued
  Queued --> Processing: worker takes it
  Processing --> Done: success, backoff reset
  Processing --> Delayed: error, wait 5 ms then double
  Delayed --> Queued: delay over`)
    ],
    'ctrl:3': [
      D(FLOW, 'Deleting an owner', `flowchart TD
  D["Delete the Deployment"] --> M{"Cascade mode"}
  M -->|"background"| B["Owner deleted now, garbage collector deletes dependents"]
  M -->|"foreground"| F["Owner waits with a finalizer until dependents are gone"]
  M -->|"orphan"| O["Dependents kept, owner reference removed"]`),
      D(STATE, 'An object with a finalizer', `stateDiagram-v2
  [*] --> Active
  Active --> Terminating: delete requested, finalizer present
  Terminating --> Gone: controller removes the finalizer
  Terminating --> Terminating: controller missing, waits`)
    ],
    'sched:1': [
      D(SEQ, 'Scheduling a pod', `sequenceDiagram
  participant A as API server
  participant S as Scheduler
  participant K as Kubelet
  A-->>S: pod without a node
  S->>S: filter nodes
  S->>S: score feasible nodes
  S->>A: bind pod to node-2
  A-->>K: pod bound to my node`),
      D(FLOW, 'Filter then score', `flowchart TD
  N["All nodes"] --> F["Filter plugins: resources, selector, taints"]
  F --> Q{"Any node left?"}
  Q -->|"no"| P["Pending, FailedScheduling event"]
  Q -->|"yes"| S["Score plugins, sum per node"]
  S --> B["Highest score wins, ties random"]`)
    ],
    'sched:2': [
      D(FLOW, 'Reading a Pending pod', `flowchart TD
  P["Pod Pending"] --> E["describe pod, read the event"]
  E --> R{"Dominant reason"}
  R -->|"Insufficient cpu or memory"| A["Lower requests or add capacity"]
  R -->|"selector or affinity"| B["Fix labels"]
  R -->|"taint"| C["Add a toleration"]
  R -->|"volume or anti-affinity"| D["Fix volume zone or relax the rule"]`),
      D(SEQ, 'A retry when the cluster changes', `sequenceDiagram
  participant S as Scheduler
  participant A as API server
  S->>A: event FailedScheduling
  Note over S: pod waits in the unschedulable queue
  A-->>S: a node is added or a pod ends
  S->>S: try the pod again
  S->>A: bind`)
    ],
    'sched:3': [
      D(FLOW, 'What a limit does', `flowchart TD
  U["Container uses more than its limit"] --> R{"Which resource"}
  R -->|"CPU"| T["Throttled: slower"]
  R -->|"memory"| K["OOMKilled, restarted by the kubelet"]`),
      D(STATE, 'QoS class from the spec', `stateDiagram-v2
  [*] --> Guaranteed: requests equal limits for CPU and memory
  [*] --> Burstable: some request or limit set
  [*] --> BestEffort: none set`)
    ],
    'kubelet:1': [
      D(STATE, 'Pod phase', `stateDiagram-v2
  [*] --> Pending: accepted
  Pending --> Running: a container started
  Running --> Succeeded: all containers exited 0
  Running --> Failed: a container failed, no restart
  Running --> Running: container restarted`),
      D(SEQ, 'Starting a pod', `sequenceDiagram
  participant K as Kubelet
  participant R as Runtime
  participant A as API server
  K->>R: create pod sandbox
  K->>R: pull image
  R-->>K: ready
  K->>R: start container
  K->>K: run readiness probe
  K->>A: status Running, Ready`)
    ],
    'kubelet:2': [
      D(FLOW, 'What each probe does', `flowchart TD
  S["startupProbe"] -->|"passes"| L["livenessProbe and readinessProbe start"]
  L --> LV{"liveness fails failureThreshold times?"}
  LV -->|"yes"| RS["Restart the container"]
  L --> RD{"readiness passes?"}
  RD -->|"no"| NR["NotReady: removed from endpoints"]
  RD -->|"yes"| OK["Ready: receives traffic"]`),
      D(SEQ, 'A database blip', `sequenceDiagram
  participant K as Kubelet
  participant P as Pod
  participant D as Database
  D--xP: unreachable
  K->>P: readiness probe fails 3 times
  K->>K: NotReady, endpoints updated
  Note over K,P: container keeps running
  D-->>P: reachable again
  K->>P: readiness passes, Ready`)
    ],
    'kubelet:3': [
      D(STATE, 'A crashing container', `stateDiagram-v2
  [*] --> Running
  Running --> Terminated: exits with an error
  Terminated --> Waiting: CrashLoopBackOff, wait 10 s doubling to 300 s
  Waiting --> Running: restart
  Running --> Running: stays up 10 minutes, delay resets`),
      D(FLOW, 'Debugging', `flowchart TD
  C["CrashLoopBackOff"] --> L["kubectl logs --previous"]
  L --> X{"Exit code"}
  X -->|"137"| M["Killed: memory limit or eviction"]
  X -->|"1 or other"| A["Application error or bad config"]`)
    ],
    'net:1': [
      D(SEQ, 'A connection to a Service', `sequenceDiagram
  participant C as Client pod
  participant R as Node rules
  participant P as Pod A
  C->>R: connect to ClusterIP
  R->>P: rewrite to the pod IP
  P-->>C: response
  Note over R: rules come from Services and EndpointSlices`),
      D(FLOW, 'Who is an endpoint', `flowchart TD
  P["Pod"] --> M{"Matches the selector?"}
  M -->|"no"| X["Not an endpoint"]
  M -->|"yes"| R{"Ready and not terminating?"}
  R -->|"no"| X
  R -->|"yes"| E["In the EndpointSlice"]`)
    ],
    'net:2': [
      D(SEQ, 'Pod deletion', `sequenceDiagram
  participant A as API server
  participant E as Endpoints controller
  participant K as Kubelet
  participant P as Pod
  A->>A: set deletionTimestamp
  par endpoints
    A-->>E: pod terminating
    E->>A: remove from EndpointSlice
  and container
    A-->>K: pod terminating
    K->>P: preStop hook then SIGTERM
  end
  K->>P: SIGKILL after the grace period`),
      D(FLOW, 'Avoiding 502 on scale-down', `flowchart TD
  D["Pod deleted"] --> S["preStop sleep a few seconds"]
  S --> T["SIGTERM"]
  T --> G["Stop accepting, finish in-flight requests"]
  G --> X["Exit before the grace period ends"]`)
    ],
    'net:3': [
      D(SEQ, 'A lookup with ndots 5', `sequenceDiagram
  participant P as Pod
  participant D as CoreDNS
  P->>D: api.example.com.shop.svc.cluster.local
  D-->>P: NXDOMAIN
  P->>D: api.example.com.svc.cluster.local
  D-->>P: NXDOMAIN
  P->>D: api.example.com.cluster.local
  D-->>P: NXDOMAIN
  P->>D: api.example.com
  D-->>P: address`),
      D(FLOW, 'Choosing the query form', `flowchart TD
  N["Name"] --> Q{"Fewer dots than ndots?"}
  Q -->|"yes"| S["Try each search suffix first"]
  Q -->|"no, or trailing dot"| D["Ask the name as it is"]`)
    ],
    'deploy:1': [
      D(SEQ, 'A rolling update round', `sequenceDiagram
  participant D as Deployment controller
  participant N as New ReplicaSet
  participant O as Old ReplicaSet
  D->>N: scale up within replicas + maxSurge
  N-->>D: pods become ready
  D->>O: scale down while ready stays at least replicas - maxUnavailable
  Note over D: repeat until the new set has all replicas`),
      D(STATE, 'A rollout', `stateDiagram-v2
  [*] --> Progressing
  Progressing --> Complete: all pods new and ready
  Progressing --> Stalled: new pods never ready
  Stalled --> RolledBack: kubectl rollout undo
  Stalled --> Failed: progressDeadlineSeconds passes, reported only`)
    ],
    'deploy:2': [
      D(FLOW, 'What counts as a revision', `flowchart TD
  C["Change to the Deployment"] --> T{"Changes spec.template?"}
  T -->|"yes"| R["New ReplicaSet, new revision"]
  T -->|"no, scale or labels"| N["No new revision"]
  R --> K["Old ReplicaSets kept up to revisionHistoryLimit"]`),
      D(SEQ, 'Undo', `sequenceDiagram
  participant U as Operator
  participant D as Deployment controller
  U->>D: rollout undo
  D->>D: set template to the previous revision
  D->>D: scale the old ReplicaSet up, new down
  D-->>U: rollout complete`)
    ],
    'deploy:3': [
      D(SEQ, 'A drain with a budget', `sequenceDiagram
  participant O as kubectl drain
  participant E as Eviction API
  participant P as PodDisruptionBudget
  O->>E: evict pod 1
  E->>P: allowed disruptions 1
  E-->>O: ok
  O->>E: evict pod 2
  E->>P: allowed disruptions 0
  E-->>O: 429, retry later`),
      D(FLOW, 'Voluntary or not', `flowchart TD
  D["A pod goes down"] --> V{"Voluntary: drain, upgrade, scale-down?"}
  V -->|"yes"| B["Eviction API checks the budget"]
  V -->|"no: crash, power loss"| I["Budget does not apply"]`)
    ],
    'hpa:1': [
      D(FLOW, 'One HPA decision', `flowchart TD
  M["Average utilization of ready pods"] --> R["ratio = utilization / target"]
  R --> T{"Within 10% of 1?"}
  T -->|"yes"| K["Keep the replicas"]
  T -->|"no"| C["desired = ceil(ready x ratio), clamp to min and max"]
  C --> U{"Scale up or down?"}
  U -->|"up"| FU["Limit to doubling or +4 per step"]
  U -->|"down"| FD["Use the highest recommendation of the last 300 s"]`),
      D(SEQ, 'Lag after a spike', `sequenceDiagram
  participant H as HPA
  participant D as Deployment
  participant P as New pods
  H->>D: scale to 6
  D->>P: create, not ready yet
  H->>D: still high on ready pods, scale to 12
  P-->>H: ready after warm-up
  H->>D: converge on the needed count`)
    ],
    'hpa:2': [
      D(SEQ, 'Where the number comes from', `sequenceDiagram
  participant K as Kubelet
  participant M as metrics-server
  participant A as API server
  participant H as HPA controller
  M->>K: scrape usage
  K-->>M: container CPU and memory
  H->>A: get pod metrics
  A->>M: metrics.k8s.io
  M-->>H: usage
  H->>H: usage / request`),
      D(FLOW, 'Missing requests', `flowchart TD
  U["Container has a CPU request?"] -->|"no"| X["Utilization unknown, HPA cannot scale"]
  U -->|"yes"| Y["Utilization = usage / request"]`)
    ],
    'hpa:3': [
      D(SEQ, 'Pending pods to a new node', `sequenceDiagram
  participant H as HPA
  participant S as Scheduler
  participant C as Cluster autoscaler
  participant P as Cloud provider
  H->>S: 10 more pods
  S->>S: no node fits, Pending
  C->>S: sees unschedulable pods
  C->>P: add a node
  P-->>S: node Ready
  S->>S: bind the pending pods`),
      D(FLOW, 'Scale-down', `flowchart TD
  N["Node underused for the unneeded time (10 min)"] --> M{"Its pods can move and PDBs allow?"}
  M -->|"yes"| R["Drain and remove the node"]
  M -->|"no"| K["Keep the node"]`)
    ],
    'node:1': [
      D(STATE, 'A node', `stateDiagram-v2
  [*] --> Ready
  Ready --> Unknown: no heartbeat for the grace period
  Unknown --> Ready: heartbeat returns, taint removed
  Unknown --> Evicting: toleration of 300 s over
  Evicting --> [*]: pods deleted and replaced`),
      D(SEQ, 'From silence to replacement', `sequenceDiagram
  participant K as Kubelet
  participant N as Node controller
  participant R as ReplicaSet controller
  participant S as Scheduler
  K--xN: lease renewals stop
  N->>N: grace period over, taint the node
  N->>N: toleration over, evict pods
  R->>R: too few pods, create new ones
  S->>S: place them on healthy nodes`)
    ],
    'node:2': [
      D(FLOW, 'Replace a pod on a dead node', `flowchart TD
  P["Pod on an unreachable node"] --> K{"Workload kind"}
  K -->|"Deployment"| R["ReplicaSet creates a new pod at once"]
  K -->|"StatefulSet"| W["Wait: the old identity may still run"]
  W --> F["Force delete or out-of-service taint"]
  F --> N["New pod with the same name"]`),
      D(SEQ, 'Why it waits', `sequenceDiagram
  participant C as StatefulSet controller
  participant A as API server
  participant K as Kubelet on the dead node
  C->>A: db-0 is terminating
  A-->>C: still present
  Note over C,K: only the kubelet can confirm the container stopped
  C->>C: do not create a second db-0`)
    ],
    'node:3': [
      D(STATE, 'Memory on a node', `stateDiagram-v2
  [*] --> Normal
  Normal --> Pressure: available below the hard threshold
  Pressure --> Evicting: kubelet picks victims
  Evicting --> Normal: memory recovers
  Pressure --> OOM: grows faster than the kubelet reacts`),
      D(FLOW, 'Choosing victims', `flowchart TD
  P["Memory pressure"] --> O["Pods using more than their requests"]
  O --> L["Lowest priority first"]
  L --> B["Largest overuse first"]
  B --> G["Guaranteed pods within requests last"]`)
    ],
    'plane:1': [
      D(STATE, 'An etcd member', `stateDiagram-v2
  [*] --> Follower
  Follower --> Candidate: no leader, term plus 1
  Candidate --> Leader: votes from a majority
  Leader --> Follower: higher term seen
  Candidate --> Follower: another leader seen`),
      D(FLOW, 'Failure tolerance', `flowchart TD
  M["Members N"] --> Q["Majority = floor(N / 2) + 1"]
  Q --> T["Tolerates N minus majority failures"]
  T --> E["3 members: 1 · 5 members: 2"]`)
    ],
    'plane:2': [
      D(SEQ, 'A write', `sequenceDiagram
  participant A as API server
  participant L as etcd leader
  participant F as Followers
  A->>L: write
  L->>L: append to the log
  L->>F: replicate
  F-->>L: stored
  L->>L: majority stored, commit
  L-->>A: ok`),
      D(FLOW, 'Without quorum', `flowchart TD
  Q{"Majority of members reachable?"} -->|"yes"| W["Writes commit"]
  Q -->|"no"| R["No commits: API server cannot write"]
  R --> P["Running pods keep running, nothing changes"]`)
    ],
    'plane:3': [
      D(SEQ, 'Lease handover', `sequenceDiagram
  participant A as Instance A
  participant L as Lease
  participant B as Instance B
  A->>L: renew every 2 s
  B->>L: check, held by A
  A--xL: stalls, no renewals
  B->>L: check after 15 s, expired
  B->>L: acquire, resourceVersion checked
  A->>L: renew fails, steps down`),
      D(STATE, 'Leader election', `stateDiagram-v2
  [*] --> Standby
  Standby --> Leader: lease expired, acquired
  Leader --> Leader: renewed in time
  Leader --> Standby: renew deadline missed or holder changed`)
    ]
  };
})();
