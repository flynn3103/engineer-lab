/* Use cases for features 7 to 9: autoscaling, node failure and self-healing, control-plane HA.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.hpa = [
    {
      title: 'The HPA: from CPU to a replica count', short: 'HPA loop', animation: {
        kind: 'hpa', start: 3, min: 2, max: 25, req: 200, target: 50, warm: 2, window: 20, tolerance: 0.1,
        presets: [
          { label: 'Traffic jumps 7 times', ops: [{ op: 'load', to: 2100 }, { op: 'tick', n: 1 }, { op: 'tick', n: 1 }, { op: 'tick', n: 1 }, { op: 'tick', n: 4 }, { op: 'tick', n: 4 }] },
          { label: 'Within 10%: no change', ops: [{ op: 'load', to: 330 }, { op: 'tick', n: 1 }, { op: 'load', to: 600 }, { op: 'tick', n: 1 }, { op: 'tick', n: 4 }] },
          { label: 'Load drops: scale-down waits', ops: [{ op: 'load', to: 2100 }, { op: 'tick', n: 12 }, { op: 'load', to: 300 }, { op: 'tick', n: 8 }, { op: 'tick', n: 8 }, { op: 'tick', n: 8 }] },
          { label: 'No CPU request: cannot scale', ops: [{ op: 'noRequest' }, { op: 'load', to: 2100 }, { op: 'tick', n: 4 }] }
        ]
      },
      intro: 'Change the load and step the 15-second clock. See the formula the HPA applies, how fast it may add pods, why new pods do not help for a moment, and why scale-down is slower than scale-up.',
      trigger: 'Traffic jumps 7 times at 8 p.m. How many replicas do you need, how fast, and when do you scale back without flapping? Each pod requests 200m CPU with a 50% target (example).',
      run: "kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=25\nkubectl get hpa web -w\nkubectl describe hpa web            # conditions, last scale time, current metrics",
      expect: 'desired = ceil(ready pods × current use ÷ target). Scale-up is fast (up to doubling per step), scale-down waits for a 5 minute stabilization window.',
      edges: [
        E('Scaling on the lagging average', 'New pods take time to warm up and pass readiness, so the HPA can keep asking for more while the first ones start.', 'Make pods start quickly, set readiness correctly, and use <code>behavior.scaleUp</code> policies for steady growth.'),
        E('Flapping around the target', 'A load close to the target would otherwise change the replica count every 15 s.', 'The 10% tolerance and the scale-down stabilization window exist to prevent it; do not remove them without a reason.')
      ],
      invariant: 'The HPA computes desired replicas from ready pods, utilization and the target, clamps it to min and max, and limits how fast it changes.',
      src: 'Kubernetes docs: Horizontal Pod Autoscaling (algorithm, <code>--horizontal-pod-autoscaler-tolerance</code> 0.1, sync period 15 s, <code>stabilizationWindowSeconds</code> 300 for scale-down, default scale-up policies 100% or 4 pods per 15 s). Pod warm-up is an example.'
    },
    {
      title: 'The metrics pipeline and why requests are required', short: 'metrics pipeline', kind: 'metricspipe',
      intro: 'The HPA does not measure anything. It reads numbers produced by the kubelet and served by metrics-server, and divides them by the pod\'s requests.',
      trigger: 'An HPA shows <code>unknown</code> for its target and never scales, though the pods are busy (example).',
      run: "kubectl top pods                       # served by metrics-server\nkubectl get --raw /apis/metrics.k8s.io/v1beta1/pods | head\nkubectl describe hpa web | grep -i 'failedget\\|unable'",
      expect: 'Utilization is usage divided by request, so a container with no CPU request has no utilization and the HPA reports an error.',
      steps: [
        S('The kubelet measures', 'Each kubelet collects the CPU and memory use of the containers on its node (through cAdvisor, built into the kubelet) and exposes them.', { at: 0 }, 'usage per container'),
        S('metrics-server collects', 'metrics-server scrapes every kubelet and keeps the latest values in memory. It keeps no history: it is for autoscaling and <code>kubectl top</code>, not for monitoring.', { at: 1 }, 'latest values only'),
        S('An API for consumers', 'It serves them through an aggregated API, <code>metrics.k8s.io</code>, which looks like any Kubernetes API to its clients.', { at: 2 }, 'metrics.k8s.io'),
        S('The HPA controller queries', 'Every sync period (15 s by default) the HPA controller reads the pods\' metrics for each HPA and applies the formula.', { at: 3 }, 'every 15 s'),
        S('Utilization needs a request', 'CPU utilization is current use as a percentage of the pod\'s requested CPU, summed over containers. A container without a request has nothing to compare with, so the HPA cannot decide and shows <code>unknown</code>.', { at: 3, unknown: true }, 'no request = no utilization'),
        S('Other metrics need an adapter', 'To scale on requests per second or queue length, an adapter serves custom or external metrics through other aggregated APIs. The HPA logic is the same.', { at: 3, custom: true }, 'custom metrics via an adapter')
      ],
      edges: [
        E('metrics-server not installed', 'Without it, <code>kubectl top</code> fails and every HPA reports it cannot get metrics.', 'Install it, check its APIService is Available, and allow it to reach the kubelets.'),
        E('Sidecars change utilization', 'Utilization is summed over all containers, so a sidecar with a small request can skew the percentage.', 'Set requests for every container, or scale on a container-level metric where supported.')
      ],
      invariant: 'CPU utilization = measured use ÷ requested CPU, so autoscaling on CPU needs a CPU request on the containers.',
      src: 'Kubernetes docs: Resource metrics pipeline (metrics-server, <code>metrics.k8s.io</code>), HPA (how utilization is computed), Metrics Server project README.'
    },
    {
      title: 'The cluster autoscaler: adding nodes for pending pods', short: 'node autoscaling', kind: 'clusterscale',
      intro: 'An HPA can create more pods than the cluster has room for. The cluster autoscaler reacts to the pods that cannot be placed, not to utilization.',
      trigger: 'The HPA adds 10 pods and they stay Pending because every node is full (example).',
      run: "kubectl get pods --field-selector=status.phase=Pending\nkubectl describe pod web-9 | grep FailedScheduling   # Insufficient cpu\nkubectl -n kube-system logs deploy/cluster-autoscaler | tail",
      expect: 'The autoscaler adds a node when pods are unschedulable and a new node would fit them, and removes nodes that stay underused.',
      steps: [
        S('The HPA wants more pods', 'The load grows and the HPA raises replicas by 10. The cluster has no free capacity left for them.', { at: 0, note: 'HPA: +10 pods' }, 'HPA asks for 10 more pods'),
        S('Pods are Pending', 'The scheduler cannot place them and marks them Unschedulable with the event "Insufficient cpu". The pods wait.', { at: 1, note: 'pods Pending: Insufficient cpu' }, '10 pods Pending'),
        S('The autoscaler decides', 'The cluster autoscaler watches for unschedulable pods. It simulates whether adding a node from one of its node groups would let them fit, and asks the cloud provider for one or more nodes.', { at: 2, note: 'simulate, then request nodes' }, 'node requested'),
        S('A node joins', 'The machine boots, its kubelet registers and the node becomes Ready. This takes minutes (an example is 2 to 5), which is why pods can be Pending for a while.', { at: 3, note: 'node booting (minutes)' }, 'node becomes Ready'),
        S('The pods are placed', 'The scheduler now sees the new capacity and binds the pending pods to it. The kubelet starts them.', { at: 4, note: 'pods scheduled and started' }, 'pods Running'),
        S('Scale-down is slower', 'A node is removed only after it has been underused for a while (10 minutes by default) and its pods can move elsewhere without breaking a PodDisruptionBudget. Nodes running pods that cannot be evicted stay.', { at: 4, note: 'scale-down after about 10 minutes', down: true }, 'removes underused nodes later')
      ],
      edges: [
        E('Pods that fit no node group', 'If a pending pod asks for something no node group can provide (a GPU, a zone), adding nodes does not help.', 'Check the node group labels, taints and limits, and the autoscaler\'s "no scale up" reasons in its status.'),
        E('Spare capacity for spikes', 'A node takes minutes to arrive, which is too slow for a sudden spike.', 'Keep headroom with low-priority placeholder pods that are evicted when real pods need the room.')
      ],
      invariant: 'The cluster autoscaler adds nodes only for pods the scheduler could not place, and removes nodes only when their pods can safely move.',
      src: 'Kubernetes docs: Node Autoscaling, Cluster Autoscaler FAQ (scale-down-unneeded-time 10 minutes, PodDisruptionBudget handling). Boot times are examples.'
    }
  ];

  CourseData.uc.node = [
    {
      title: 'A machine loses power: the timeline of recovery', short: 'node failure', kind: 'nodefail',
      intro: 'A node dies at 3 a.m. See how silence becomes a taint, a taint becomes an eviction, and a replacement pod runs elsewhere, and why it takes about six minutes.',
      trigger: 'A machine loses power with 6 pods of a Deployment on it (example).',
      run: "kubectl get nodes -w                       # Ready → NotReady\nkubectl describe node node-3 | grep -A5 Taints   # node.kubernetes.io/unreachable:NoExecute\nkubectl -n kube-node-lease get lease node-3",
      expect: 'After about 50 seconds the node is marked Unknown and tainted. Its pods are evicted 5 minutes later by default, and replacements start elsewhere.',
      steps: [
        S('Heartbeats', 'Each kubelet renews a small Lease object in the kube-node-lease namespace about every 10 s. The node lifecycle controller watches these leases. A Lease is much cheaper than rewriting the whole node status.', { k: 1 }, 'lease renewed every ~10 s'),
        S('The machine dies', 'At time 0 the power is lost. No more lease renewals reach the API server. Nothing else changes yet: the pods still show Running, because nobody has said otherwise.', { k: 2 }, 'last heartbeat at 0'),
        S('The node is marked Unknown', 'After <code>node-monitor-grace-period</code> (40 s, 50 s from Kubernetes 1.32) without a heartbeat, the node lifecycle controller sets the node Ready condition to Unknown and adds the taint <code>node.kubernetes.io/unreachable:NoExecute</code>.', { k: 3 }, 'Unknown + taint at ~50 s'),
        S('Pods tolerate it for 5 minutes', 'Every pod gets a default toleration for that taint with <code>tolerationSeconds: 300</code>. So the pods are not evicted yet. This protects against short network blips.', { k: 4 }, 'toleration window 300 s'),
        S('Eviction and replacement', 'At about 350 s the toleration expires and the pods are deleted. The ReplicaSet sees too few pods, creates replacements, the scheduler places them on healthy nodes, and they start (about 30 s in the example).', { k: 5 }, 'replacements Running at ~380 s'),
        S('Tuning the window', 'For stateless services that can move quickly, set a shorter <code>tolerationSeconds</code> (for example 30) in the pod spec. The cost is more movement on a flaky network.', { k: 6 }, 'shorter toleration = faster failover')
      ],
      edges: [
        E('Everything is evicted at once', 'If the control plane loses contact with many nodes at once (a network problem), evicting all their pods would take the cluster down.', 'The controller slows or stops evictions when too many nodes are unhealthy (unhealthy zone thresholds).'),
        E('A node that comes back', 'If the node returns before eviction, the taint is removed and nothing moves.', 'That is the point of the 5-minute window: transient failures do not cause churn.')
      ],
      invariant: 'A silent node becomes Unknown and tainted after the grace period, and its pods are evicted only after their toleration expires.',
      src: 'Kubernetes docs: Nodes (heartbeats, Lease, <code>node-monitor-grace-period</code> 40 s, 50 s from 1.32), Taints and Tolerations (<code>tolerationSeconds</code> 300 default for not-ready and unreachable), Node-pressure Eviction. Pod start time is an example.'
    },
    {
      title: 'Why the StatefulSet pod did not come back', short: 'StatefulSet identity', kind: 'sts',
      intro: 'A Deployment pod is replaced at once because any pod will do. A StatefulSet pod has an identity, and running two pods with one identity can corrupt data.',
      trigger: 'The node with <code>db-0</code> dies. The Deployment pods reappear on other nodes, but <code>db-0</code> stays Terminating (example).',
      run: "kubectl get pods -o wide                       # db-0 Terminating on node-3\nkubectl delete pod db-0 --force --grace-period=0   # only if the node is truly dead\nkubectl taint nodes node-3 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute",
      expect: 'The StatefulSet controller will not start a second db-0 until the first is confirmed gone, so it waits, safely, for a person or the out-of-service taint.',
      steps: [
        S('A Deployment pod is interchangeable', 'When the node dies the ReplicaSet creates a new pod with a new name at once. It does not matter whether the old one is dead or just unreachable.', { upto: 1 }, 'Deployment: replace at once'),
        S('A StatefulSet pod has an identity', '<code>db-0</code> has a stable name and its own volume. The StatefulSet promises at most one pod with that identity at any moment.', { upto: 2 }, 'at most one db-0'),
        S('The node is unreachable, not proven dead', 'The pod is marked for deletion, but only the kubelet on the dead node can confirm that the containers stopped. The API cannot tell "dead" from "partitioned and still writing to the disk".', { upto: 3 }, 'cannot confirm the old pod stopped'),
        S('So it waits', 'Creating a second <code>db-0</code> now could give two writers on one volume. The controller waits, and the pod stays Terminating.', { upto: 4 }, 'db-0 stays Terminating'),
        S('A person decides', 'If you are sure the machine is off, force-delete the pod, which removes the object without the kubelet\'s confirmation. The StatefulSet then creates the replacement.', { upto: 5 }, 'force delete when sure'),
        S('Automating the decision', 'Since Kubernetes 1.28 you can mark a shut-down node with the <code>node.kubernetes.io/out-of-service</code> taint. Pods on it are deleted and their volumes detached, so stateful pods can move without manual force-deleting.', { upto: 5, oos: true }, 'out-of-service taint')
      ],
      edges: [
        E('Force-deleting a live node\'s pod', 'If the node was only partitioned, the old pod keeps running and two instances now exist.', 'Make sure the machine is powered off or fenced before forcing, or use the out-of-service taint only for a node you know is down.'),
        E('Volumes that cannot be attached twice', 'A block volume still attached to the dead node blocks the new pod from starting.', 'Use the out-of-service taint (it triggers detach) or detach the volume in the cloud console.')
      ],
      invariant: 'A StatefulSet never starts a pod with an identity while another pod with that identity might still be running.',
      src: 'Kubernetes docs: StatefulSets (Pod Management, Forced deletion), Force Delete StatefulSet Pods, Non-graceful node shutdown (out-of-service taint, stable in 1.28).'
    },
    {
      title: 'Memory pressure: eviction before the kernel kills', short: 'node-pressure eviction', kind: 'pressure',
      intro: 'When a node runs low on memory the kubelet evicts pods itself, in a chosen order, before the kernel\'s out-of-memory killer acts at random.',
      trigger: 'Pods on a node grow in memory and available memory falls (example MiB).',
      run: "kubectl describe node node-3 | grep -A3 'MemoryPressure'\nkubectl get events --field-selector reason=Evicted\n# kubelet: --eviction-hard=memory.available<100Mi   (default)",
      expect: 'Below the hard threshold the node reports MemoryPressure, new BestEffort pods are kept away, and the kubelet evicts pods using more than they requested, lowest priority first.',
      steps: [
        S('Normal use', 'The node has plenty of available memory. All pods run.', { avail: 3000, note: 'no pressure' }, 'available 3000 MiB'),
        S('Memory gets tight', 'Pods use more memory and the available amount falls. Nothing happens until a threshold is crossed.', { avail: 400, note: 'getting tight' }, 'available 400 MiB'),
        S('The hard threshold', 'Available memory drops below <code>memory.available&lt;100Mi</code>, the default hard eviction threshold. The node gets the condition MemoryPressure=True and a taint that keeps new BestEffort pods off it.', { avail: 90, note: 'MemoryPressure = True' }, 'below 100 MiB: pressure'),
        S('The kubelet picks victims', 'It evicts pods that are using more memory than they requested first, then lower priority, then by how far above the request. Guaranteed pods using no more than requested go last. Evicted pods are marked Failed with reason Evicted. Their controllers replace them elsewhere.', { avail: 90, note: 'evicting the biggest overusers', evict: true }, 'evict: over request, low priority first'),
        S('Pressure ends', 'Memory is freed and available memory rises above the threshold (with a short delay). The condition clears and the taint is removed.', { avail: 700, note: 'pressure cleared' }, 'available 700 MiB'),
        S('If the kubelet is too slow', 'If memory grows faster than the kubelet checks, the kernel OOM killer acts first and kills a process, using the pod\'s QoS class to bias the choice. That shows up as OOMKilled, not Evicted.', { avail: 0, note: 'kernel OOM killer', oom: true }, 'OOMKilled instead of Evicted')
      ],
      edges: [
        E('Soft thresholds', 'A soft threshold with a grace period starts evictions earlier and more gently than the hard one.', 'Set soft thresholds on production nodes so pods get terminationGracePeriod to shut down properly.'),
        E('Eviction with no requests', 'Pods without memory requests are the first to go and the hardest to account for.', 'Set memory requests so the eviction order protects the important pods.')
      ],
      invariant: 'Under memory pressure the kubelet evicts by usage above requests and priority; Guaranteed pods within their requests are evicted last.',
      src: 'Kubernetes docs: Node-pressure Eviction (<code>memory.available</code> hard default 100Mi, eviction ordering), Pod Quality of Service Classes.'
    }
  ];

  CourseData.uc.plane = [
    {
      title: 'etcd members elect a leader', short: 'etcd election', animation: {
        kind: 'raft', n: 3, split: [[0], [1, 2]], cmd: 'PUT pod/web-1',
        presets: [
          { label: 'A member wins the election', ops: [{ op: 'timeout', n: 0 }] },
          { label: 'The leader fails: another takes over', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'PUT pod/web-1' }, { op: 'crash', n: 0 }, { op: 'timeout', n: 1 }, { op: 'client', cmd: 'PUT pod/web-2' }, { op: 'restart', n: 0 }] },
          { label: 'An isolated member cannot lead', ops: [{ op: 'partition', sides: [[0], [1, 2]] }, { op: 'timeout', n: 0 }, { op: 'timeout', n: 1 }] }
        ]
      },
      intro: 'etcd keeps every Kubernetes object, replicated by Raft across three members. Crash the leader or isolate a member and see which side may keep working.',
      trigger: 'One etcd member dies. Does the cluster stop, and what happens if two are lost? Three members (example).',
      run: "etcdctl endpoint status --cluster -w table     # IS LEADER, RAFT TERM, RAFT INDEX\netcdctl member list\n# 3 members: majority 2, tolerates 1 failure",
      expect: 'With 2 of 3 members up a new leader is elected and writes continue. With 1 of 3 no leader can be elected and writes stop.',
      edges: [
        E('Even numbers of members', 'Four members tolerate only one failure, the same as three, and need a bigger majority.', 'Run 3 members (tolerate 1) or 5 (tolerate 2).'),
        E('Slow disks', 'Every write waits for a majority to flush to disk, so a slow disk on a member slows the whole cluster and can cause leader changes.', 'Put etcd on fast, dedicated disks and watch its fsync duration.')
      ],
      invariant: 'A write is committed only when a majority of members store it, and there is at most one leader per term.',
      src: 'etcd docs: Learning (Raft, quorum, failure tolerance), Kubernetes docs: Operating etcd clusters for Kubernetes. The animation is the same simplified Raft model with three members.'
    },
    {
      title: 'Writes need a majority: partitions and lost quorum', short: 'etcd quorum', animation: {
        kind: 'raft', n: 3, split: [[0], [1, 2]], cmd: 'PUT pod/web-1',
        presets: [
          { label: 'A write is committed by 2 of 3', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'PUT pod/web-1' }, { op: 'client', cmd: 'PUT pod/web-2' }] },
          { label: 'The old leader is cut off', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'PUT a' }, { op: 'partition', sides: [[0], [1, 2]] }, { op: 'client', cmd: 'PUT b', to: 0 }, { op: 'timeout', n: 1 }, { op: 'client', cmd: 'PUT c' }, { op: 'heal' }] },
          { label: 'Quorum is lost: no writes', ops: [{ op: 'timeout', n: 0 }, { op: 'crash', n: 1 }, { op: 'crash', n: 2 }, { op: 'client', cmd: 'PUT pod/web-3' }] }
        ]
      },
      intro: 'Send writes to the leader, cut it off from the others, and then lose two members. Only a side that holds a majority can commit a write.',
      trigger: 'A network partition isolates the etcd leader from the other two members (example).',
      run: "kubectl get --raw /readyz?verbose | grep etcd\netcdctl endpoint health --cluster\n# with no quorum the API server cannot write and returns timeouts",
      expect: 'The isolated leader can accept an entry but cannot commit it. The side with two members elects a new leader and continues; the old leader\'s entry is discarded after the heal.',
      edges: [
        E('The API server without etcd', 'With no quorum the API server cannot store anything. Running pods keep running (the kubelets keep their containers), but nothing changes: no scheduling, no scaling, no new pods.', 'Restore quorum from healthy members or from a backup; practise the restore before you need it.'),
        E('Reads from a lagging member', 'A read served by a member that is behind may be stale, so the API server asks for consistent (quorum) reads for correctness.', 'Do not point clients straight at an etcd member; always go through the API server.')
      ],
      invariant: 'A minority side cannot commit: its uncommitted entries are overwritten when it rejoins the majority.',
      src: 'etcd docs: Failure modes and quorum, Kubernetes docs: Operating etcd clusters (backup and restore). The model has three members and no timers.'
    },
    {
      title: 'Leader election by lease: one active controller', short: 'leader election', kind: 'leaderlease',
      intro: 'The scheduler and the controller manager run as several replicas for availability, but only one may act. They agree through a Lease object.',
      trigger: 'The active kube-scheduler stalls for 20 seconds in a long garbage collection pause (example).',
      run: "kubectl -n kube-system get lease kube-scheduler -o yaml   # holderIdentity, renewTime\n# defaults: leaseDuration 15s, renewDeadline 10s, retryPeriod 2s",
      expect: 'A standby takes the lease once it has not been renewed for 15 s, and the stalled instance stops acting when it finds the lease taken.',
      steps: [
        S('One holder', 'Instance A created a Lease and renews it every few seconds (<code>retryPeriod</code> 2 s). The holder identity in the Lease is A. A does all the scheduling.', { n: 2 }, 'holder A · renewing'),
        S('The standby watches', 'Instance B reads the Lease. It is held by A and recently renewed, so B does nothing and checks again later.', { n: 3 }, 'B waits'),
        S('The leader stalls', 'A freezes for 20 s in a garbage collection pause. It stops renewing. B keeps checking the Lease.', { n: 4 }, 'no renewals'),
        S('The lease expires', 'After <code>leaseDuration</code> (15 s) without a renewal, B sees the Lease is expired.', { n: 5 }, 'lease expired after 15 s'),
        S('B takes over', 'B writes itself as the holder. Because the write goes through the API server with a resourceVersion check, only one standby can win. B starts scheduling.', { n: 6 }, 'holder B'),
        S('A wakes up and stops', 'A tries to renew and finds the holder is B, so it knows it lost leadership. It stops acting (the process exits and is restarted as a standby). Two active leaders never overlap, as long as A notices within its <code>renewDeadline</code> (10 s) of the last renewal.', { n: 8 }, 'A steps down')
      ],
      edges: [
        E('Clock skew', 'Expiry is measured by each candidate\'s own clock against the renew time in the Lease, so clocks that run at different speeds can shorten or lengthen the wait.', 'Keep control-plane clocks synced, and keep the renew deadline shorter than the lease duration so the leader gives up first.'),
        E('Slow failover', 'A leader change takes up to the lease duration, so the scheduler pauses up to about 15 s.', 'Accept it for the scheduler (running pods are unaffected), or tune the durations for faster failover with more API load.')
      ],
      invariant: 'Only the holder of an unexpired Lease acts, and a standby can acquire it only after the lease duration without a renewal.',
      src: 'Kubernetes docs: Leases, Leader election in client-go (<code>--leader-elect-lease-duration</code> 15s, <code>--leader-elect-renew-deadline</code> 10s, <code>--leader-elect-retry-period</code> 2s).'
    }
  ];
})();
