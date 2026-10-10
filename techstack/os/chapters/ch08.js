/* Chapter 8 "Containers: Namespaces and cgroups": three scenes in three forms:
   nested views of one process table, a memory gauge with two limits, and a CPU quota sawtooth over three periods. */
(function () {
  const D = window.OSD;

  /* ---------- 1. PID namespace: the same process has two numbers ---------- */
  const HOST = [[1, 'systemd'], [880, 'sshd'], [4242, 'app (container init)'], [4250, 'worker'], [4261, 'sidecar']];
  const INSIDE = { 4242: 1, 4250: 8, 4261: 12 };
  const ns = {
    id: 'pid-ns', label: 'Two views of one process', desc: 'A namespace gives a group of processes their own view of the system. In a PID namespace the first process is pid 1 and the host’s processes are invisible (illustrative).',
    codeLabel: 'Shell', code: { bug: ['$ unshare --pid --mount-proc --fork --uts --net bash', '# inside:  ps → only the container’s processes, numbered from 1', '# outside: ps → the same processes with their host pids', '$ ls -l /proc/4242/ns        # one link per namespace type', '$ docker stop app             # sends SIGTERM to the container’s pid 1'] },
    stage: {
      w: 640, h: 420, footer: 'PID namespace shown; mnt, net, uts, ipc, user work the same way.',
      header: s => ({ left: 'host pid  ↔  pid inside the container', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'ns') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        D.rect(L, 24, 76, 592, 258, 'info'); D.text(L, 36, 96, 'host view (the root PID namespace)', { b: 1, s: 1 });
        HOST.forEach(([pid, nm], i) => {
          const y = 112 + i * 40, inC = INSIDE[pid] != null && s.ns;
          D.cell(L, 36, y, 230, 32, 'pid ' + pid, inC ? 'acc' : 'mut', { sub: nm, hot: s.hot === pid });
        });
        if (s.ns) {
          D.rect(L, 340, 108, 262, 210, 'warn', { rx: 12 }); D.text(L, 352, 128, 'container (new PID namespace)', { b: 1, s: 1 });
          Object.entries(INSIDE).forEach(([hp, ip], i) => {
            const hy = 112 + HOST.findIndex(h => h[0] === Number(hp)) * 40, cy = 140 + i * 48;
            D.cell(L, 360, cy, 200, 36, 'pid ' + ip, s.hot === Number(hp) ? 'acc' : 'ok', { sub: 'same task as host pid ' + hp });
            D.path(L, `M266 ${hy + 16} L360 ${cy + 18}`, { tone: 'acc', dash: true, thin: true });
          });
          if (s.note) D.text(L, 352, 300, s.note, { xs: 1, tone: s.noteTone || '' });
        }
        if (s.out) D.text(L, 36, 358, s.out, { s: 1, b: 1, tone: s.outTone || '' });
      }
    },
    bug: [
      { log: 'On the host, every process has one pid, and any root process can see all of them.', callout: 'One global process table', state: { r: 'host only' }, stats: [{ l: 'processes visible', v: '5' }] },
      { log: 'Starting the container calls clone with CLONE_NEWPID (and new mount, network and uts namespaces). The kernel creates a new, empty PID namespace and puts the new process in it.', callout: 'clone(CLONE_NEWPID | …): a new namespace', moment: true, code: 0, state: { ns: true, hot: 4242, r: 'namespace created' }, stats: [{ l: 'namespaces', v: 'pid, mnt, net, uts' }] },
      { log: 'The first process in the namespace is pid 1 inside, while the host still sees it as pid 4242. It is one task with two numbers. Its children get 8 and 12.', callout: 'One task, two pids', code: 1, state: { ns: true, hot: 4250, r: 'pid mapping' }, stats: [{ l: 'inside', v: '1, 8, 12' }, { l: 'host', v: '4242, 4250, 4261' }] },
      { log: 'Inside, ps and kill see only the container’s three processes: sshd and systemd on the host do not exist from here. The host sees everything, so a monitoring agent on the host still sees container processes.', callout: 'Inside the container: only its own processes', code: 2, state: { ns: true, r: 'isolated view', out: 'inside: ps shows 3 processes · host: ps shows 5', note: 'cannot see or signal host pids' }, stats: [{ l: 'inside sees', v: '3', cls: 'ok' }, { l: 'host sees', v: '5' }] },
      { log: 'pid 1 has special rules. The kernel does not apply default signal actions to it, so SIGTERM is ignored unless the program installed a handler. docker stop sends SIGTERM, waits (10 s by default), then sends SIGKILL. And pid 1 must reap orphaned zombies (chapter 4).', callout: 'pid 1 ignores SIGTERM without a handler', moment: true, code: 4, state: { ns: true, hot: 4242, r: 'pid 1 rules', out: 'docker stop: SIGTERM ignored → wait 10 s → SIGKILL', outTone: 'bad', note: 'also reaps orphans; use --init', noteTone: 'warn' }, stats: [{ l: 'stop delay', v: '10 s', cls: 'bad' }],
        takeaway: 'A namespace changes what a process can see; it does not limit what it can use. That is the job of cgroups.' }
    ]
  };

  /* ---------- 2. cgroup memory: high throttles, max kills, the host stays safe ---------- */
  const BX = 90, BW = 480;
  const gauge = (L, y, label, used, total, tone, marks) => {
    D.text(L, BX, y - 8, label, { s: 1, b: 1 });
    D.rect(L, BX, y, BW, 26, 'mut', { rx: 6 });
    D.rect(L, BX, y, Math.max(0, Math.min(1, used / total)) * BW, 26, tone, { rx: 6 });
    (marks || []).forEach(([v, nm, t]) => { const x = BX + v / total * BW; D.line(L, x, y - 6, x, y + 32, { tone: t, dash: true }); D.text(L, x, y + 44, nm, { a: 'middle', xs: 1, tone: t }); });
  };
  const mem = {
    id: 'cg-mem', label: 'memory.high and memory.max', desc: 'A cgroup puts a limit on one group of processes. memory.high slows the group down, memory.max kills inside it. Without a limit a leak takes the host (illustrative).',
    codeLabel: 'Shell', code: { bug: ['# no memory limit on the sidecar container', '$ cat /sys/fs/cgroup/side/memory.max      # max (unlimited)', '$ dmesg | grep -i "out of memory"          # host-wide OOM'], fix: ['$ echo 2G   > /sys/fs/cgroup/side/memory.max      # hard limit', '$ echo 1600M > /sys/fs/cgroup/side/memory.high    # throttle first', '$ cat /sys/fs/cgroup/side/memory.events           # high, max, oom_kill counters', '# Kubernetes: resources.limits.memory → memory.max'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 8 GB host, other services use 3.2 GB (illustrative).',
      header: s => ({ left: 'memory of the host and of the sidecar container', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'mem') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        const host = 3.2 + s.u;
        gauge(R.L, 112, 'host RAM (8 GB): other services 3.2 GB + sidecar', Math.min(8, host), 8, host > 7.5 ? 'bad' : 'ok', [[3.2, 'others end', 'mut']]);
        gauge(R.L, 210, 'sidecar container usage (limit 2 GB)', s.u, 2, s.state === 'killed' ? 'none' : s.state === 'throttle' ? 'warn' : s.u >= 2 ? 'bad' : 'info', s.fix ? [[1.6, 'memory.high 1.6G', 'warn'], [2, 'memory.max 2G', 'bad']] : []);
        if (!s.fix) D.text(R.L, BX, 262, 'no cgroup limit: container usage can grow to the whole host', { xs: 1, m: 1 });
        D.text(L, 24, 306, s.out || '', { s: 1, b: 1, tone: s.outTone || '' });
      }
    },
    bug: [
      { log: 'The sidecar container has no memory limit. It uses 1 GB, and the host has 3.8 GB free.', callout: 'No limit on the container', state: { u: 1, r: 'running', out: 'host: healthy' }, stats: [{ l: 'host used', v: '4.2 GB', cls: 'ok' }] },
      { log: 'A leak makes it grow. Nothing slows it, because the only limit is the whole machine.', callout: 'The leak grows without a ceiling', code: 0, state: { u: 3.6, r: 'leaking', out: 'host: 6.8 GB used, reclaim starting (chapter 3)', outTone: 'warn' }, stats: [{ l: 'host used', v: '6.8 GB', cls: 'warn' }] },
      { log: 'Memory is exhausted for the whole host. The global OOM killer chooses the largest process by score, which is the database, not the leaking sidecar.', callout: 'Host OOM kills the wrong victim', moment: true, code: 2, state: { u: 4.6, r: 'host OOM', out: 'host OOM killer: killed postgres (3.6 GB)', outTone: 'bad' }, stats: [{ l: 'victim', v: 'postgres', cls: 'bad' }],
        takeaway: 'Without a cgroup limit, one container’s leak becomes everyone’s outage.' }
    ],
    fix: [
      { log: 'The container now has memory.max = 2 GB and memory.high = 1.6 GB. The leak starts and usage climbs.', callout: 'Two limits on the container', code: 0, state: { fix: true, u: 1, r: 'running', out: 'host: healthy' }, stats: [{ l: 'host used', v: '4.2 GB', cls: 'ok' }] },
      { log: 'At memory.high the kernel throttles the group: its tasks are made to reclaim their own pages and slow down. This is a warning zone, not a kill, and it never invokes the OOM killer.', callout: 'Over memory.high: throttled', code: 1, state: { fix: true, u: 1.7, state: 'throttle', r: 'throttled', out: 'container is slow, host untouched', outTone: 'warn' }, stats: [{ l: 'container', v: 'throttled', cls: 'warn' }, { l: 'host used', v: '4.9 GB', cls: 'ok' }] },
      { log: 'At memory.max the kernel first tries to reclaim inside the cgroup. If that fails, a cgroup OOM kill picks a victim among the container’s own processes. The host keeps 3.2 GB of other services untouched.', callout: 'memory.max: OOM kill inside the cgroup', moment: true, code: 2, state: { fix: true, u: 2, r: 'cgroup OOM', out: 'killed inside the container only: memory.events oom_kill 1', outTone: 'ok' }, stats: [{ l: 'victim', v: 'leaker', cls: 'warn' }, { l: 'postgres', v: 'alive', cls: 'ok' }] },
      { log: 'The container is restarted and its memory goes to zero. In Kubernetes this shows as OOMKilled with exit code 137. The limit contained the leak; fixing it is still necessary.', callout: 'Contained: the container restarts', code: 3, state: { fix: true, u: 0.2, state: 'killed', r: 'restarted', out: 'exit code 137 (SIGKILL) · OOMKilled', outTone: 'ok' }, stats: [{ l: 'blast radius', v: '1 container', cls: 'ok' }],
        takeaway: 'A cgroup turns a host-wide OOM into a failure of one container.' }
    ]
  };

  /* ---------- 3. cgroup CPU quota: the sawtooth that throttles a busy service ---------- */
  const CX0 = 60, CW = 540, CY0 = 100, CH = 190;
  const quotaStage = Q => ({
    w: 640, h: 420, footer: 'Simplified: 4 busy threads, period 100 ms.',
    header: s => ({ left: 'cpu.max: ' + (Q === 50 ? '50000 100000' : '400000 100000') + '   (quota µs, period µs)', right: s.r || '' }),
    setup(kit) { return { L: D.init(kit, 'cpu') }; },
    frame(s, kit, R) {
      const L = R.L; D.clear(L);
      D.line(L, CX0, CY0 + CH, CX0 + CW, CY0 + CH, { thin: true }); D.line(L, CX0, CY0, CX0, CY0 + CH, { thin: true });
      D.text(L, CX0 - 6, CY0 + 8, Q + ' ms', { a: 'end', xs: 1, m: 1 }); D.text(L, CX0 - 6, CY0 + CH, '0', { a: 'end', xs: 1, m: 1 });
      D.text(L, CX0, CY0 + CH + 16, 'time (ms): period 1 | period 2 | period 3', { xs: 1, m: 1 });
      [100, 200].forEach(t => D.line(L, CX0 + t / 300 * CW, CY0, CX0 + t / 300 * CW, CY0 + CH, { thin: true, dash: true, tone: 'mut' }));
      const rem = t => Math.max(0, Q - 4 * (t % 100));
      const X = t => CX0 + t / 300 * CW, Y = r => CY0 + CH - r / Q * CH;
      let d = '', thr = [];
      for (let t = 0; t <= s.t; t += 1) { const r = rem(t); d += (t === 0 ? 'M' : 'L') + X(t) + ' ' + Y(r) + ' '; if (r === 0) thr.push(t); }
      D.path(L, d, { tone: 'acc' });
      thr.forEach(t => D.line(L, X(t), CY0 + CH, X(t), CY0 + CH - 8, { tone: 'bad' }));
      if (thr.length) D.text(L, X(thr[0]) + 6, CY0 + CH - 14, 'THROTTLED: all threads stopped', { xs: 1, tone: 'bad', b: 1 });
      D.circle(L, X(s.t), Y(rem(s.t)), 5, rem(s.t) === 0 ? 'bad' : 'acc', { hot: true });
      D.text(L, 24, 372, s.out || '', { s: 1, b: 1, tone: s.outTone || '' });
    }
  });
  const quotaSteps = (Q, bad) => {
    const out = [];
    const S = (t, log, callout, extra) => out.push(Object.assign({ log, callout, state: { t, r: t % 100 === 0 ? 'new period' : 'running' }, stats: [] }, extra));
    if (bad) {
      S(3, 'A service runs 4 busy threads on 4 cores. Its cgroup has a quota of 50 ms of CPU time per 100 ms period, which is half of one core, whatever the number of cores. Each millisecond of wall time burns 4 ms of quota.', 'Quota 50 ms per 100 ms', { code: 0, state: { t: 3, r: 'running', out: 'quota left: 38 ms' }, stats: [{ l: 'quota left', v: '38 ms' }] });
      S(12, 'After 12.5 ms of wall time the four threads have used all 50 ms of quota.', 'The quota runs out after 12.5 ms', { code: 0, moment: true, state: { t: 12, r: 'quota gone', out: 'quota left: 2 ms', outTone: 'warn' }, stats: [{ l: 'quota left', v: '~0', cls: 'warn' }] });
      S(60, 'The kernel throttles the whole cgroup: every thread is stopped until the next period starts, even though the cores are idle and the average CPU graph looks low.', 'Throttled for the other 87 ms', { code: 1, moment: true, state: { t: 60, r: 'THROTTLED', out: 'requests arriving now wait up to 87 ms', outTone: 'bad' }, stats: [{ l: 'throttled', v: '87%', cls: 'bad' }, { l: 'avg CPU', v: '0.5 core', cls: 'ok' }] });
      S(112, 'The quota is refilled at the period boundary. The threads run for 12 ms and are throttled again. A request that spans a throttle pays the pause.', 'Refill, burn, throttle, repeat', { code: 1, state: { t: 112, r: 'period 2', out: 'p99 ≈ 100 ms although average CPU is 50%', outTone: 'bad' }, stats: [{ l: 'nr_throttled', v: '2 periods', cls: 'bad' }] });
      S(260, 'Over three periods the cgroup runs 12 ms in every 100 ms. The cause is a hard cap with many threads, not a shortage of CPU.', 'Same pattern every period', { moment: true, state: { t: 260, r: 'period 3', out: 'avg CPU 0.5 core, p99 spiky', outTone: 'bad' }, stats: [{ l: 'cause', v: 'quota < threads', cls: 'bad' }], takeaway: 'A hard CPU quota stalls a multi-threaded service in bursts, even when the average usage looks low.' });
    } else {
      S(3, 'The limit is raised to 400 ms per 100 ms period, so four busy threads can run flat out. (Alternatively drop the hard cap and use cpu.weight, which only matters under contention.)', 'Quota matches the threads', { code: 0, state: { t: 3, r: 'running', out: 'quota left: 388 ms' }, stats: [{ l: 'quota left', v: '388 ms' }] });
      S(60, 'Four threads use 4 ms of quota per millisecond, so the 400 ms quota lasts a full period. The cgroup is never throttled.', 'No throttling in the period', { code: 0, state: { t: 60, r: 'running', out: 'quota left: 160 ms', outTone: 'ok' }, stats: [{ l: 'nr_throttled', v: '0', cls: 'ok' }] });
      S(240, 'The quota refills each period and the threads keep running. Cost: the container can now use four cores, so a noisy neighbour is limited only by the other containers’ weights.', 'Refill each period, no pause', { moment: true, code: 1, state: { t: 240, r: 'steady', out: 'p99 follows the work, not the quota', outTone: 'ok' }, stats: [{ l: 'nr_throttled', v: '0', cls: 'ok' }], takeaway: 'Size the CPU limit to the thread count, or use weights, to avoid throttling.' });
    }
    return out;
  };
  const cpu = {
    id: 'cg-cpu', label: 'CPU quota throttling', desc: 'A CPU limit is a quota of run time per 100 ms period. A service with many threads can use it all in a few milliseconds and then stands still (illustrative).',
    codeLabel: 'Shell', code: { bug: ['$ cat /sys/fs/cgroup/svc/cpu.max          # 50000 100000', '$ cat /sys/fs/cgroup/svc/cpu.stat', 'nr_periods 5000  nr_throttled 4350  throttled_usec 380000000', '# Kubernetes: resources.limits.cpu: "500m" → cpu.max 50000 100000'], fix: ['$ echo "400000 100000" > /sys/fs/cgroup/svc/cpu.max   # 4 CPUs', '$ cat /sys/fs/cgroup/svc/cpu.stat                       # nr_throttled stays 0', '# or: keep a small limit and use cpu.weight for fair sharing'] },
    stage: { ...quotaStage(50), footer: 'Simplified: 4 busy threads, period 100 ms (quota 50 ms, then 400 ms).', header: s => quotaStage(s.fixed ? 400 : 50).header(s), frame(s, kit, R) { (s.fixed ? quotaStage(400) : quotaStage(50)).frame(s, kit, R); } },
    bug: quotaSteps(50, true),
    fix: quotaSteps(400, false).map(st => ({ ...st, state: { ...st.state, fixed: true } }))
  };

  const EXPLAIN = `
<h3>1. A container is a process with two kernel features applied</h3>
<p>There is no “container” object in the Linux kernel. A container is an ordinary process started with <b>namespaces</b>, which decide what it can see, and placed in <b>cgroups</b>, which decide how much it can use. Everything else, the image and the runtime, is packaging around these two features and a root file system.</p>
<h3>2. Namespaces change the view</h3>
<p>Each namespace type virtualises one global resource: PID (process numbers), mount (the file system tree), network (interfaces, routes, ports), UTS (hostname), IPC, user (user and group ids) and cgroup. A process in a new PID namespace sees itself as pid 1 and cannot see or signal processes outside. The host still sees the same tasks under their real pids. Namespaces isolate by hiding; they do not meter anything.</p>
<h3>3. cgroups meter and limit</h3>
<p>Control groups form a tree of process groups with controllers attached. <code>memory.max</code> is a hard limit: when the group reaches it, the kernel reclaims inside the group and then runs an OOM kill inside that group only. <code>memory.high</code> is a soft limit that throttles the group by forcing it to reclaim, and it never kills. <code>cpu.max</code> sets a quota of CPU time per period, <code>cpu.weight</code> sets a relative share used only when cores are contended, and <code>pids.max</code> bounds the number of tasks. <code>io.max</code> bounds disk bandwidth and operations.</p>
<h3>4. CPU limits behave differently from memory limits</h3>
<p>Memory is a stock, so a limit means kill or slow down at the ceiling. CPU is a flow, so a limit means pause until the next period. A service with 16 threads and a limit of 1 CPU burns its quota in 6 ms of wall time and then stands still for 94 ms. The average CPU graph looks calm while p99 latency spikes. The signal is <code>nr_throttled</code> and <code>throttled_usec</code> in <code>cpu.stat</code>.</p>
<h3>5. Kubernetes maps requests and limits to these files</h3>
<p>A pod’s memory limit becomes <code>memory.max</code> and an exceeded limit shows as <code>OOMKilled</code>, exit code 137. A CPU limit becomes <code>cpu.max</code>, a CPU request becomes <code>cpu.weight</code>, and the request is also what the scheduler uses to place the pod. See the Kubernetes course for the control plane side of this.</p>
<h3>6. The trade-off</h3>
<p>Limits protect neighbours and make failures local, at the price of surprising behaviour inside the container: throttling, OOM kills, and a runtime that sees the host’s 64 cores while it may use two. Language runtimes need to be told about the limit (GOMAXPROCS, JVM container support). Containers share one kernel, so a kernel bug or a misconfigured capability can break isolation; stronger boundaries use a user namespace, seccomp, or a lightweight VM.</p>
<h3>7. The commands, in one place</h3>
<pre># which namespaces and cgroup a process is in
ls -l /proc/&lt;pid&gt;/ns; cat /proc/&lt;pid&gt;/cgroup
# memory limit, usage and OOM counters (cgroup v2)
cat /sys/fs/cgroup/&lt;group&gt;/memory.{max,high,current,events}
# CPU limit and throttling
cat /sys/fs/cgroup/&lt;group&gt;/cpu.max /sys/fs/cgroup/&lt;group&gt;/cpu.stat
# pressure inside one group
cat /sys/fs/cgroup/&lt;group&gt;/{cpu,memory,io}.pressure</pre>`;

  window.COURSE.chapters[8] = {
    title: `Containers: Namespaces and cgroups`,
    problem: `The build server now runs its services in containers. A leaking sidecar container, with no memory limit, takes the host to its limit, and the OOM killer takes out the database instead of the leaker. Meanwhile an API container limited to “0.5 CPU” shows 20% CPU on its graph but a p99 of 100 ms, and <code>docker stop</code> on one service always takes exactly ten seconds.`,
    predict: {
      q: `A container has <code>memory.max = 2 GB</code> and leaks past 2 GB while the host still has 5 GB free. What happens?`,
      opts: [
        `The host runs out of memory first and the global OOM killer picks the largest process on the host`,
        `The kernel reclaims inside the cgroup, then OOM-kills a process inside that cgroup; the host is untouched`,
        `Nothing: the limit is advisory and the container keeps growing`
      ],
      ans: 1,
      why: `memory.max is a hard limit enforced per cgroup. When the group hits it, reclaim and, if needed, the OOM killer run inside that group, so the blast radius is one container.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `CPU throttling hides behind a low average`,
        sym: `<b>p99 latency is high while container CPU usage looks low; <code>nr_throttled</code> keeps increasing.</b>`,
        ctx: `A multi-threaded service has a CPU limit smaller than its number of busy threads.`,
        why: `The quota is used up early in each 100 ms period, and the cgroup is paused until the next period.`,
        log: `$ cat /sys/fs/cgroup/svc/cpu.stat
nr_periods 5000
nr_throttled 4350
throttled_usec 380000000`,
        note: `Cgroup v2 <code>cpu.stat</code> fields.`,
        fix: [`Compare <code>nr_throttled</code> with <code>nr_periods</code>.`, `Raise the limit, reduce the thread count, or drop the limit and use requests/weights.`, `Make the runtime match the limit (GOMAXPROCS, JVM flags).`, `Verify: nr_throttled stops growing and p99 drops.`]
      },
      {
        t: `Container OOMKilled`,
        sym: `<b>The container restarts with exit code 137; <code>memory.events</code> shows <code>oom_kill</code>.</b>`,
        ctx: `The working set, including page cache the process uses, reached <code>memory.max</code>.`,
        why: `Reclaim inside the cgroup could not free enough, so the cgroup OOM killer ran.`,
        log: `$ cat /sys/fs/cgroup/svc/memory.events
low 0
high 1203
max 87
oom 1
oom_kill 1`,
        note: `Cgroup v2 file; in Kubernetes the pod status shows <code>OOMKilled</code>.`,
        fix: [`Look at <code>memory.current</code>, <code>memory.stat</code> (anon vs file) and the heap of the process.`, `Fix the leak or raise the limit with headroom for cache.`, `Set <code>memory.high</code> a little below the max to see pressure before a kill.`, `Verify: <code>oom_kill</code> stops increasing.`]
      },
      {
        t: `docker stop always takes 10 seconds`,
        sym: `<b>A container needs the full stop timeout to exit, then dies with SIGKILL.</b>`,
        ctx: `The application is pid 1 in its container and has no SIGTERM handler, or a shell wrapper is pid 1 and does not forward signals.`,
        why: `The kernel gives pid 1 no default signal actions, so SIGTERM is ignored until the timeout and then SIGKILL is sent.`,
        log: `$ time docker stop app
app
real    0m10.21s`,
        note: `Default stop timeout is 10 s.`,
        fix: [`Handle SIGTERM in the app, or use <code>exec</code> in the entrypoint script.`, `Use an init such as <code>docker run --init</code> or tini to forward signals and reap zombies.`, `Verify: <code>docker stop</code> returns in about a second.`]
      }
    ],
    scenarios: [ns, mem, cpu]
  };
})();
