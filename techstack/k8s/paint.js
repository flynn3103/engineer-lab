/* Pictures for the Kubernetes system-design course: one form per use case, built from the shared picture kit (assets/course/kit.js).
 * A painter takes the whole scene for a step and returns HTML, so Back, Restart and jumping need no replay.
 * (The etcd, reconcile, scheduler, rollout, HPA and Raft use cases are shared animations and need no painter here.) */
(function () {
  'use strict';
  const { e, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels } = Course.kit;
  const P = CourseData.PAINT = {};
  const n = v => Number(v).toLocaleString('en-US');

  // 1.1 messages from kubectl to a running pod
  P.applyflow = s => {
    const R = [{ from: 0, to: 1, text: 'apply Deployment web' }, { from: 1, to: 2, text: 'store, revision 101' }, { from: 1, to: 0, text: 'configured (about 200 ms)' }, { from: 1, to: 3, text: 'watch event: Deployment web' }, { from: 3, to: 1, text: 'create ReplicaSet and 3 pods' }, { from: 1, to: 4, text: 'watch event: pods with no node' }, { from: 4, to: 1, text: 'bind pods to nodes' }, { from: 1, to: 5, text: 'watch event: pod bound to my node' }, { from: 5, to: 1, text: 'status: Running, Ready' }];
    return lanes(['kubectl', 'API server', 'etcd', 'Controllers', 'Scheduler', 'Kubelet'], R.slice(0, s.n)) + note(s.n >= 3 ? chip('kubectl is already done', 'acc') : '', s.n >= 9 ? chip('pods Running and Ready', 'ok') : '', s.why ? chip('time = scheduling + image pull + start + probes', 'warn') : '');
  };

  // 1.2 the three gates before storage
  P.authgate = s => stages([['Authenticate', 'who are you'], ['Authorize (RBAC)', 'may you'], ['Admission', 'mutate, validate'], ['Validate and store', 'etcd']], s.at) +
    note(s.at === 0 ? chip('401 Unauthorized if unknown', 'warn') : '', s.at === 1 ? chip('403 Forbidden if no rule allows it · no deny rules', 'warn') : '', s.at === 2 && !s.fail ? chip('mutating webhooks, then validating webhooks', 'acc') : '', s.fail ? chip('webhook down + failurePolicy Fail: every deploy is rejected', 'bad') : '', s.at === 3 ? chip('written to etcd', 'ok') : '');

  // 2.2 events collapsing into a key and retry delays
  P.queue = s => cap('Informer events (each updates the local cache)') + strip(s.ev ? Array.from({ length: s.ev }, (_, i) => cell('update ' + (i + 1), 'acc')).join('') : '<span class="faint">none now</span>') +
    cap('Work queue (keys, not events)') + strip(s.q.length ? s.q.map(k => cell(k, 'hot')).join('') : '<span class="faint">empty</span>') +
    note(chip(s.note, 'acc'), s.worker ? chip('one worker, one reconcile for all events', 'ok') : '', s.delay ? chip('retry delay ' + s.delay + ' ms, doubling per failure', 'warn') : '');

  // 2.3 owner and dependents
  P.ownertree = s => {
    const cls = { alive: 'ok', gone: 'dim', deleting: 'warn', terminating: 'bad', orphan: 'acc', adopted: 'hot' }, txt = { alive: 'exists', gone: 'deleted', deleting: 'being deleted', terminating: 'Terminating (waits)', orphan: 'kept, no owner', adopted: 'adopted' };
    const names = ['Deployment web', 'ReplicaSet web-7d4f9', 'Pods web-7d4f9-*'];
    return panels(s.d.map((x, i) => ({ title: names[i], big: txt[x], cls: cls[x] })), { wide: false }) + note(chip('ownerReferences link each level to its owner', 'acc'), s.stuck ? chip('a finalizer without its controller blocks the delete', 'bad') : '');
  };

  // 3.2 why a pod stays Pending
  P.pending = s => {
    const R = [['Insufficient cpu / memory', 'requests exceed the free allocatable', 'lower requests, free capacity, add a node'], ['didn\'t match Pod\'s node affinity/selector', 'the nodes lack the label the pod asks for', 'fix the labels or the selector'], ['had untolerated taint', 'a taint with no matching toleration', 'add a toleration'], ['volume node affinity conflict / unbound PVC', 'the volume is in another zone or does not exist yet', 'provision or move the volume'], ['didn\'t satisfy existing pods anti-affinity rules', 'the spread rule has no free place left', 'prefer instead of require, add nodes']].slice(0, s.upto);
    return (R.length ? table(['Reason in the event', 'Meaning', 'What to change'], R.map(r => ['<code>' + e(r[0]) + '</code>', e(r[1]), e(r[2])])) : cap('Warning FailedScheduling: <code>0/6 nodes are available: 3 Insufficient cpu, 2 node(s) didn\'t match Pod\'s node affinity/selector, 1 node(s) had untolerated taint.</code>')) + note(chip('one reason per node: the counts add up to the nodes', 'acc'));
  };

  // 3.3 requests, limits, QoS
  P.qos = s => {
    const A = [['request', 'reserved at scheduling, counted even if unused'], ['CPU over the limit', 'throttled: slower, not killed'], ['memory over the limit', 'OOMKilled, exit code 137']].slice(0, Math.min(s.upto, 3));
    return (A.length ? table(['Setting', 'What happens'], A.map(r => [e(r[0]), e(r[1])])) : '') +
      (s.upto >= 4 ? '<div style="margin-top:10px">' + table(['QoS class', 'When', 'Under node pressure'], [['Guaranteed', 'requests = limits for CPU and memory in every container', chip('evicted last', 'ok')], ['Burstable', 'some request or limit set', chip('evicted next, above requests first', 'warn')], ['BestEffort', 'no requests or limits', chip('evicted first', 'bad')]].map(r => [e(r[0]), e(r[1]), r[2]])) + '</div>' : '') + note(s.plan ? chip('memory request = limit', 'ok') : '');
  };

  // 4.1 pod lifecycle stages
  P.podstages = s => stages([['Bound', 'spec.nodeName set'], ['Pull image', 'ContainerCreating'], ['Start', 'container Running'], ['Ready', 'probes pass']], s.at) +
    '<div style="margin-top:10px">' + table(['Pod phase', 'Ready condition', 'Container state'], [[chip(s.phase, s.phase === 'Running' ? 'ok' : 'warn'), chip(s.ready ? 'True' : 'False', s.ready ? 'ok' : 'warn'), e(s.cs)]]) + '</div>' + note(s.report ? chip('status = what the kubelet last wrote', 'acc') : '');

  // 4.2 probe results over time
  P.probes = s => {
    const pts = [], fail = t => t >= 30 && t <= 50;
    for (let t = 10; t <= Math.min(s.t, 100); t += 10) { pts.push({ at: t, top: 6, bg: 'var(--' + (fail(t) ? 'bad' : 'ok') + ')', title: 'readiness at ' + t + ' s' }); pts.push({ at: t, top: 40, bg: 'var(--' + (s.liveDep && fail(t) ? 'bad' : 'ok') + ')', title: 'liveness at ' + t + ' s' }); }
    const notReady = s.t >= 50 && s.t < 60;
    return timeline({ max: 110, height: 78, points: pts, marks: s.liveDep && s.t >= 50 ? [{ at: 50, kind: 'cr' }] : [], ticks: [0, 30, 50, 60, 100].map(x => ({ at: x, label: x + ' s' })), label: 'Probe results every 10 s. Top row: readiness. Lower row: liveness. Green = pass, red = fail. Red line = container restarted.' }) +
      '<div style="margin-top:30px">' + strip(chip(s.t <= 10 ? 'startup probe passed: readiness and liveness start' : notReady ? 'NotReady: removed from endpoints' : 'Ready: in endpoints', s.t <= 10 ? 'warn' : notReady ? 'bad' : 'ok'), s.liveDep && s.t >= 50 ? chip('liveness failed 3 times: container restarted', 'bad') : chip('container not restarted', 'ok'), s.rule ? chip('liveness: me · readiness: me and dependencies', 'acc') : '') + '</div>';
  };

  // 4.3 restart delays
  P.backoff = s => {
    const D = [10, 20, 40, 80, 160, 300];
    return (s.n ? cap('Wait before each restart (seconds)') + D.slice(0, s.n).map((d, i) => meter(d, 300, d >= 300 ? 'bad' : 'warn', 'restart ' + (i + 1) + ': wait ' + d + ' s')).join('') : cap('The container exited. restartPolicy Always: it will be restarted, with a delay.')) +
      note(s.reset ? chip('ran 10 minutes without a crash: delay resets to 10 s', 'ok') : '', s.read ? chip('cause: kubectl logs --previous · exit code', 'acc') : '', s.n >= 6 ? chip('status CrashLoopBackOff = the waiting, not the crash', 'warn') : '');
  };

  // 5.1 a client, node rules, and the endpoints
  P.svcpath = s => {
    const R = [{ from: 0, to: 1, text: 'connect to ClusterIP 10.96.0.10:80' }, { from: 1, to: 2, text: 'rewrite to 10.1.0.5:8080' }, { from: 2, to: 0, text: 'response' }, { from: 0, to: 1, text: 'next connection to the ClusterIP' }, { from: 1, to: 3, text: 'rewrite to 10.1.0.6:8080' }, { from: 1, to: 4, text: 'Pod C failed readiness: removed', lost: true }];
    return lanes(['Client pod', 'kube-proxy rules on the node', 'Pod A', 'Pod B', 'Pod C'], R.slice(0, s.n)) +
      note(chip('EndpointSlice: ' + s.eps.map(x => 'Pod ' + x).join(', '), 'acc'), s.rules ? chip('every node programs the same rules', 'ok') : '', s.lag ? chip('propagation takes time · long connections stay put', 'warn') : '');
  };

  // 5.2 pod deletion: endpoints and SIGTERM
  P.shutdown = s => {
    const k = s.k, bands = [], marks = [], pts = [];
    if (k >= 2) bands.push({ from: 0, to: 3, top: 12, height: 14 });
    if (k >= 4) bands.push({ from: 0, to: 8, top: 34, height: 14 });
    if (k >= 6) bands.push({ from: 0, to: 30, top: 56, height: 14 });
    if (k >= 1) marks.push({ at: 0, kind: 'fs' });
    marks.push({ at: k >= 4 ? 8 : 0, kind: 'fs' }); if (k >= 6) marks.push({ at: 30, kind: 'cr' });
    if (k === 3) [0.5, 1, 1.5, 2, 2.5].forEach(t => pts.push({ at: t, top: 80, bg: 'var(--bad)', title: 'request to a closed port' }));
    return timeline({ max: 40, height: 100, bands, marks, points: pts, ticks: [0, 3, 8, 30].map(x => ({ at: x, label: x + ' s', top: 84 })), label: 'Seconds after the delete. Bars: endpoint propagation (3 s example), preStop sleep, grace period. Dashed = SIGTERM, red line = SIGKILL, red dots = failed requests.' }) +
      '<div style="margin-top:34px">' + strip(k >= 2 ? chip('endpoint removal reaches nodes in about 3 s', 'acc') : '', k === 3 ? chip('app exited at once: errors until endpoints catch up', 'bad') : '', k >= 4 ? chip('preStop sleep 8 s, then SIGTERM', 'ok') : '', k >= 5 ? chip('drain in-flight requests, exit', 'ok') : '', k >= 6 ? chip('terminationGracePeriodSeconds 30: SIGKILL', 'warn') : '') + '</div>';
  };

  // 5.3 resolver queries
  P.dns = s => {
    if (!s.tries.length && !s.conf) return table(['Name form', 'Works from'], [['orders', 'the same namespace'], ['orders.shop', 'any namespace'], ['orders.shop.svc.cluster.local', 'anywhere in the cluster']].map(r => ['<code>' + e(r[0]) + '</code>', e(r[1])]));
    return (s.conf ? cap('/etc/resolv.conf of a pod in namespace shop') + strip(cell('search shop.svc.cluster.local svc.cluster.local cluster.local', 'acc') + cell('options ndots:5', 'hot')) : '') +
      (s.tries.length ? table(['Query tried for ' + s.name, 'Answer'], s.tries.map(t => ['<code>' + e(t[0]) + '</code>', chip(t[1], t[1] === 'NXDOMAIN' ? 'bad' : 'ok')])) : '') + note(s.tries.length ? chip('queries: ' + s.tries.length, s.tries.length > 1 ? 'warn' : 'ok') : '', s.coredns ? chip('CoreDNS answers from Services and EndpointSlices', 'acc') : '');
  };

  // 6.2 ReplicaSets and their roles
  P.rollback = s => table(['ReplicaSet', 'Image', 'Pods', 'Role'], s.rows.map(r => ['<code>' + e(r[0]) + '</code>', e(r[1]), e(r[2]), chip(r[3] === 'stuck' ? 'new, not ready' : r[3], { old: 'dim', new: 'ok', stuck: 'bad' }[r[3]])])) +
    note(s.deadline ? chip('Progressing=False · ProgressDeadlineExceeded (600 s)', 'bad') : '', s.history ? chip('revisionHistoryLimit 10', 'acc') : '');

  // 6.3 pods against the disruption budget
  P.pdb = s => cap('Pods of the service: green = ready, grey = not ready or evicted') + cells(Array.from({ length: s.total }, (_, i) => ['pod ' + (i + 1), i < s.ready ? 'ok' : 'dim'])) +
    note(chip('minAvailable ' + s.min, 'acc'), chip('allowed disruptions ' + Math.max(0, s.ready - s.min), s.ready - s.min > 0 ? 'ok' : 'bad'), chip(s.msg, s.blocked || s.crash ? 'bad' : 'ok'));

  // 7.2 where the HPA gets its numbers
  P.metricspipe = s => stages([['kubelet', 'container usage (cAdvisor)'], ['metrics-server', 'latest values in memory'], ['metrics.k8s.io', 'aggregated API'], ['HPA controller', 'every 15 s']], s.at) +
    note(s.unknown ? chip('no CPU request: utilization unknown', 'bad') : '', s.custom ? chip('custom metrics need an adapter', 'acc') : '', s.at === 1 ? chip('no history: not a monitoring system', 'warn') : '');

  // 7.3 from pending pods to a new node
  P.clusterscale = s => stages([['HPA adds pods', 'replicas up'], ['Pods Pending', 'Unschedulable'], ['Autoscaler decides', 'simulate, request a node'], ['Node Ready', 'boots, kubelet joins'], ['Pods scheduled', 'Running']], s.at) + note(chip(s.note, 'acc'), s.at === 3 ? chip('minutes, example 2 to 5', 'warn') : '', s.down ? chip('scale-down: underused for 10 minutes and pods can move', 'acc') : '');

  // 8.1 recovery timeline after a power loss
  P.nodefail = s => {
    const k = s.k, o = 30, bands = [], marks = [], pts = [];
    if (k >= 3) bands.push({ from: o, to: o + 50, top: 12, height: 14 });
    if (k >= 4) bands.push({ from: o + 50, to: o + 350, top: 32, height: 14 });
    if (k >= 5) bands.push({ from: o + 350, to: o + 380, top: 52, height: 14 });
    if (k >= 1) [0, 10, 20].forEach(t => pts.push({ at: t, top: 74, bg: 'var(--ok)', title: 'lease renewed' }));
    if (k >= 2) marks.push({ at: o, kind: 'cr' }); if (k >= 3) marks.push({ at: o + 50, kind: 'fs' }); if (k >= 5) marks.push({ at: o + 350, kind: 'fs' });
    return timeline({ max: 430, height: 96, bands, marks, points: pts, ticks: [{ at: o, label: '0 s' }, { at: o + 50, label: '50 s', top: 80 }, { at: o + 350, label: '350 s', top: 80 }, { at: o + 380, label: '380 s', top: 80 }], label: 'Seconds after the power loss. Bars: grace period, toleration window, replacement start. Dots: heartbeats before. Red = power loss, dashed = taint and eviction.' }) +
      '<div style="margin-top:34px">' + strip(k >= 1 ? chip('Lease renewed every about 10 s', 'ok') : '', k >= 3 ? chip('Unknown + unreachable:NoExecute taint at about 50 s', 'warn') : '', k >= 4 ? chip('default toleration 300 s: pods stay', 'acc') : '', k >= 5 ? chip('evicted at about 350 s, replacements start', 'ok') : '', k >= 6 ? chip('tolerationSeconds 30 for faster failover', 'acc') : '') + '</div>';
  };

  // 8.2 Deployment pod against StatefulSet pod
  P.sts = s => {
    const R = [['Node dies, kubelet silent', 'pod is replaced after the eviction', 'db-0 is Terminating, node unreachable'], ['Can the API prove the old pod stopped?', 'not needed', 'no: only the kubelet could confirm it'], ['What the controller does', 'creates a new pod with a new name', 'waits: never two db-0 at once'], ['How you recover', 'nothing to do', 'force delete when sure, or the out-of-service taint'], ['Risk if forced wrongly', 'none', 'two writers on one volume']].slice(0, s.upto);
    return table(['Step', 'Deployment pod', 'StatefulSet pod db-0'], R.map(r => [e(r[0]), e(r[1]), e(r[2])])) + note(s.oos ? chip('taint node.kubernetes.io/out-of-service (stable in 1.28)', 'ok') : '');
  };

  // 8.3 memory used against the eviction threshold
  P.pressure = s => limitMeter('Memory used: ' + n(4096 - s.avail) + ' of 4,096 MiB · available ' + n(s.avail) + ' MiB', 4096 - s.avail, 4096, 3996, { h: 26, warnAt: 3500 }) +
    note(chip('hard threshold: available below 100 MiB', 'acc'), chip(s.note, s.avail < 100 ? 'bad' : 'ok'), s.evict ? chip('Failed, reason Evicted', 'warn') : '', s.oom ? chip('OOMKilled', 'bad') : '');

  // 9.3 a lease between two instances
  P.leaderlease = s => {
    const R = [{ from: 0, to: 1, text: 'create Lease, holder A' }, { from: 0, to: 1, text: 'renew every 2 s' }, { from: 2, to: 1, text: 'read: held by A, renewed 1 s ago' }, { from: 0, to: 0, text: 'stalls (GC pause 20 s)' }, { from: 2, to: 1, text: 'read: not renewed for 15 s: expired' }, { from: 2, to: 1, text: 'acquire: holder B (version checked)' }, { from: 0, to: 1, text: 'renew fails: holder is B' }, { from: 0, to: 0, text: 'steps down and exits' }];
    return lanes(['Instance A (leader)', 'Lease object', 'Instance B (standby)'], R.slice(0, s.n)) + note(chip('leaseDuration 15 s · renewDeadline 10 s · retryPeriod 2 s', 'acc'), s.n >= 6 ? chip('holder B', 'ok') : chip('holder A', 'ok'));
  };
})();
