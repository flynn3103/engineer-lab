/* Chapter 1 "Scheduling: Who Runs Next": two scenes with different forms.
   Scene 1 is a virtual-runtime bar race; scene 2 is four per-core run queues with tasks that migrate. Numbers are illustrative. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Virtual runtime: the smallest bar runs next ---------- */
  const ROW = 44, BX = 40, BY = 118, BW = 560, LW = 84;
  const TRACK = BW - LW - 46 - 8;
  const MAXV = 24;
  const xOf = v => BX + LW + (v / MAXV) * TRACK;
  const vr = {
    id: 'vruntime', label: 'Smallest vruntime runs', desc: 'Each task’s virtual runtime grows while it runs. The scheduler picks the task that has had the least, so everyone converges to a fair share (illustrative units of ms).',
    codeLabel: 'Pseudo-C',
    code: { bug: ['pick = task with smallest vruntime;   // CFS idea; EEVDF also uses lag and a deadline', 'run(pick, slice);  pick.vruntime += slice * 1024 / pick.weight;', '', '// a task wakes after a long sleep', 'if (task.vruntime < min_vruntime) task.vruntime = min_vruntime;  // clamp the credit'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified CFS-style picture; Linux 6.6+ uses EEVDF with the same fairness idea.',
      header: s => ({ left: 'one core · slice 4 ms', right: s.r || '' }),
      setup(kit) {
        const L = D.init(kit, 'vr');
        const bars = kit.bars(null, { x: BX, y: BY, w: BW, rowH: ROW, labelW: LW, max: MAXV, items: [{ id: 'A', label: 'batch A' }, { id: 'B', label: 'batch B' }, { id: 'W', label: 'web W' }] });
        const cpu = kit.chip(null, { x: 566, y: BY - 6, w: 58, h: 26, label: 'CPU', tone: 'cursor', small: true });
        return { L, bars, cpu };
      },
      frame(s, kit, R) {
        D.clear(R.L);
        ['A', 'B', 'W'].forEach(id => {
          const v = s.v[id], sleeping = v == null;
          R.bars.set(id, sleeping ? 0 : v, s.bad === id ? 'bad' : s.run === id ? 'info' : 'ok', sleeping ? 'asleep' : v + ' ms');
        });
        if (s.min != null) {
          D.line(R.L, xOf(s.min), BY - 8, xOf(s.min), BY + 3 * ROW - 8, { tone: 'acc', dash: true });
          D.text(R.L, xOf(s.min), BY - 14, 'min_vruntime ' + s.min, { a: 'middle', xs: 1, tone: 'acc' });
        }
        const i = ['A', 'B', 'W'].indexOf(s.run);
        R.cpu.set({ y: BY + (i < 0 ? 0 : i) * ROW - 6, show: i >= 0, label: i >= 0 ? 'on CPU' : '' });
      }
    },
    bug: [
      { log: 'Two batch jobs have each had 8 ms of CPU. The web handler W is asleep. The scheduler keeps a virtual runtime per task: how much CPU it has had, scaled by its weight.', callout: 'Virtual runtime = CPU time received so far', state: { v: { A: 8, B: 8, W: null }, min: 8, r: 'A=8 B=8' }, stats: [{ l: 'runnable', v: '2' }, { l: 'rule', v: 'smallest runs' }] },
      { log: 'A and B tie at 8. The scheduler picks A. After a 4 ms slice A’s vruntime is 12, so it is no longer the smallest.', callout: 'A runs a slice and moves right', code: 1, state: { v: { A: 12, B: 8, W: null }, run: 'A', min: 8, r: 'A ran 4 ms' }, stats: [{ l: 'A', v: '12 ms' }, { l: 'B', v: '8 ms' }] },
      { log: 'Now B has the smallest virtual runtime, so B runs next and catches up to 12. Neither batch job can hog the core.', callout: 'The laggard runs next', code: 1, state: { v: { A: 12, B: 12, W: null }, run: 'B', min: 12, r: 'B ran 4 ms' }, stats: [{ l: 'A', v: '12 ms' }, { l: 'B', v: '12 ms' }] },
      { log: 'W wakes after sleeping 80 ms. It last ran when its vruntime was 2. If it kept 2, it would be 10 ms “behind” and would monopolise the core until it caught up, starving A and B.', callout: 'A stale low vruntime would starve the others', moment: true, code: 3, state: { v: { A: 12, B: 12, W: 2 }, bad: 'W', min: 12, r: 'W wakes' }, stats: [{ l: 'W credit if kept', v: '10 ms', cls: 'bad' }] },
      { log: 'So the kernel clamps the sleeper: it is placed at about min_vruntime. The wake-up credit is small and bounded (EEVDF stores a bounded “lag” instead).', callout: 'Clamp: sleeping earns a small bounded credit', code: 4, state: { v: { A: 12, B: 12, W: 12 }, min: 12, r: 'W clamped' }, stats: [{ l: 'W vruntime', v: '12 ms', cls: 'ok' }] },
      { log: 'W is eligible at once. It needs 1 ms, answers the request and sleeps again. It waited at most one slice because the batch jobs could not run ahead of it.', callout: 'W runs soon, but cannot starve anyone', code: 1, state: { v: { A: 12, B: 12, W: 13 }, run: 'W', min: 12, r: 'W ran 1 ms' }, stats: [{ l: 'W wait', v: '≤ 1 slice', cls: 'ok' }, { l: 'A,B starved', v: 'no', cls: 'ok' }],
        takeaway: 'Fair share comes from always running whoever has had the least, and clamping what sleeping earns.' }
    ]
  };

  /* ---------- 2. Four run queues: tasks move to idle cores ---------- */
  const CX = k => 20 + k * 154, QY = 96;
  const NT = 9;
  const taskPos = (core, idx) => ({ x: CX(core) + 12, y: QY + 34 + idx * 32 });
  const queues = {
    id: 'run-queues', label: 'Per-core run queues', desc: 'Each core keeps its own queue of runnable tasks. An idle core pulls work from a busy one, at the cost of a cold cache (illustrative).',
    codeLabel: 'Shell', code: { bug: ['$ mpstat -P ALL 1', 'CPU0  98%  CPU1  35%  CPU2   0%  CPU3  41%', '$ cat /proc/pressure/cpu', 'some avg10=22.4', '$ taskset -pc 0 <pid>      # pins a task to core 0'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 9 runnable tasks, 4 cores. Migration cost drawn as lost cache warmth.',
      header: s => ({ left: 'run queue per core', right: s.r || '' }),
      setup(kit) {
        const L = D.init(kit, 'rq');
        const chips = Array.from({ length: NT }, (_, i) => kit.chip(null, { x: 0, y: 0, w: 110, h: 26, label: 'T' + (i + 1), small: true, tone: 'info' }));
        return { L, chips };
      },
      frame(s, kit, R) {
        D.clear(R.L);
        for (let k = 0; k < 4; k++) {
          const n = s.q[k].length;
          D.rect(R.L, CX(k), QY, 140, 188, n === 0 ? 'none' : n > 3 ? 'bad' : 'info');
          D.text(R.L, CX(k) + 70, QY + 20, 'CPU ' + k, { a: 'middle', b: 1, s: 1 });
          D.text(R.L, CX(k) + 70, QY + 182, n === 0 ? 'idle' : n + ' queued', { a: 'middle', xs: 1, tone: n === 0 ? 'warn' : n > 3 ? 'bad' : 'ok' });
        }
        s.q.forEach((list, k) => list.forEach((id, i) => { const p = taskPos(k, i); R.chips[id - 1].set({ x: p.x, y: p.y, show: true, tone: i === 0 ? 'cursor' : (s.cold || []).includes(id) ? 'warn' : 'info', sub: '', label: 'T' + id + (i === 0 ? ' running' : '') }); }));
        if (s.arrow) D.path(R.L, `M${CX(s.arrow[0]) + 70} ${QY + 196} Q${(CX(s.arrow[0]) + CX(s.arrow[1])) / 2 + 70} ${QY + 250} ${CX(s.arrow[1]) + 70} ${QY + 196}`, { tone: 'acc', arrow: true });
        if (s.note) D.text(R.L, 320, 332, s.note, { a: 'middle', s: 1 });
      }
    },
    bug: [
      { log: 'A burst of forks left 6 tasks on CPU 0. CPU 1 and 3 have one each and CPU 2 has none. The load is uneven although the machine has spare capacity.', callout: 'One queue is long while a core is idle', moment: true, code: 1, state: { q: [[1, 2, 3, 4, 5, 6], [7], [], [8, 9]], r: 'imbalanced' }, stats: [{ l: 'CPU0 queue', v: '6', cls: 'bad' }, { l: 'CPU2', v: 'idle', cls: 'warn' }] },
      { log: 'CPU 2 has nothing to run, so it enters idle balancing: it looks at busier cores and pulls tasks (tasks that are not running right now) from the busiest queue.', callout: 'Idle core pulls work from the busiest queue', code: 3, state: { q: [[1, 2, 3, 4, 5, 6], [7], [], [8, 9]], arrow: [0, 2], r: 'idle balance' }, stats: [{ l: 'puller', v: 'CPU 2' }, { l: 'busiest', v: 'CPU 0' }] },
      { log: 'T5 and T6 move to CPU 2. They now run at once, but their data is no longer in CPU 0’s L1 and L2 caches, so they start slow.', callout: 'Migrated tasks start with a cold cache', code: 3, state: { q: [[1, 2, 3, 4], [7], [5, 6], [8, 9]], cold: [5, 6], r: 'migrated' }, stats: [{ l: 'queues', v: '4 · 1 · 2 · 2', cls: 'ok' }, { l: 'cache warmth', v: 'lost for T5 T6', cls: 'warn' }] },
      { log: 'A periodic balance (every few ms, scaling with load) then evens out CPU 0. The balancer prefers moving tasks inside a shared cache or socket (a scheduling domain) before crossing sockets.', callout: 'Periodic balance prefers nearby cores', code: 3, state: { q: [[1, 2, 3], [7, 4], [5, 6], [8, 9]], cold: [4], arrow: [0, 1], r: 'balanced' }, stats: [{ l: 'queues', v: '3 · 2 · 2 · 2', cls: 'ok' }] },
      { log: 'To keep a latency-critical task warm you can pin it with taskset or cpuset. The cost is that the balancer may no longer move it, so one pinned core can still be overloaded.', callout: 'Pinning trades balance for cache warmth', code: 4, state: { q: [[1, 2, 3], [7, 4], [5, 6], [8, 9]], note: 'T1 pinned to CPU 0: the balancer will not move it', r: 'pinned T1' }, stats: [{ l: 'trade-off', v: 'warmth vs balance' }],
        takeaway: 'Per-core queues scale well, and balancing trades cache warmth for fairness.' }
    ]
  };

  const EXPLAIN = `
<h3>1. Two jobs: pick the task, pick the core</h3>
<p>The scheduler answers two questions every few milliseconds: which runnable task should this core run, and which core should this task run on. A task is <b>runnable</b> when it needs the CPU; it is <b>sleeping</b> when it waits for I/O or a lock. Only runnable tasks compete.</p>
<h3>2. Fair share from virtual runtime</h3>
<p>For ordinary tasks Linux tracks how much CPU each has had, scaled by weight (set by the nice value). The classic CFS picked the task with the smallest virtual runtime. Since Linux 6.6 the default is EEVDF: each task also has a lag (how much service it is owed) and a virtual deadline, and the scheduler picks the eligible task with the earliest deadline. A task that asks for a shorter slice gets an earlier deadline, so short interactive work runs sooner while the long-run share stays fair.</p>
<h3>3. Sleepers cannot bank unlimited credit</h3>
<p>A task that slept for a minute must not return with a minute of credit and block everyone else. The scheduler clamps what a sleeper keeps (CFS placed it at <code>min_vruntime</code>; EEVDF keeps a bounded lag). The web handler therefore runs promptly after waking, but only for as long as it asked.</p>
<h3>4. Per-core queues and balancing</h3>
<p>One global queue would make every core fight over one lock, so each core has its own queue. The price is imbalance: after a burst of forks one queue can be long while another core idles. Idle cores pull work, and a periodic balancer pushes work over <b>scheduling domains</b> (SMT siblings, cores sharing a cache, a socket, a NUMA node). Moving a task across a domain costs cache and memory locality, so the balancer prefers the closest move.</p>
<h3>5. Other policies</h3>
<p>Real-time tasks (<code>SCHED_FIFO</code>, <code>SCHED_RR</code>) always beat normal tasks and a runaway one can lock up a core. <code>SCHED_DEADLINE</code> admits tasks only if their declared runtime fits. <code>SCHED_BATCH</code> and <code>SCHED_IDLE</code> are for work that should yield to everything else.</p>
<h3>6. The trade-off</h3>
<p>A short slice gives low latency and more context switches. A long slice gives throughput and worse tail latency. Balancing aggressively spreads the load and cools the caches. Measure before changing any of it.</p>
<h3>7. The commands, in one place</h3>
<pre># per-core utilisation and the run queue length (r column)
mpstat -P ALL 1; vmstat 1
# CPU pressure: share of time tasks waited for a core
cat /proc/pressure/cpu
# per-task scheduling delay and wake-up latency
perf sched record -- sleep 5; perf sched latency
# change priority or policy, pin to cores
renice -n 10 -p &lt;pid&gt;; chrt -f 10 &lt;cmd&gt;; taskset -pc 0-3 &lt;pid&gt;</pre>`;

  window.COURSE.chapters[1] = {
    title: `Scheduling: Who Runs Next`,
    problem: `At 20:00 the build server has 200 runnable tasks on 4 cores. The web handler needs 1 ms of CPU per request, but its p99 latency jumps from 5 ms to 400 ms while a few batch jobs keep every core busy. <code>mpstat</code> shows CPU 2 idle at the same moment CPU 0 has six tasks waiting. Nothing is wrong with the code. The kernel is choosing who runs, and where.`,
    predict: {
      q: `A web handler sleeps for 80 ms, then wakes up. Two batch tasks are CPU-bound. A fair scheduler tracks virtual runtime per task. What should happen to the handler’s stored runtime when it wakes?`,
      opts: [
        `Keep the old low value, so it runs a long time to catch up`,
        `Place it near the current minimum, so it runs soon without monopolising the core`,
        `Reset it to zero, so it always runs first`
      ],
      ans: 1,
      why: `A long sleep must not become a large credit. Clamping near the minimum (or a bounded lag in EEVDF) lets the handler run promptly after waking while the batch tasks keep their share.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Load average high but CPU is not busy`,
        sym: `<b>Load average is 40 on 4 cores, yet <code>%idle</code> is high.</b>`,
        ctx: `Many processes wait on a slow disk or an NFS server.`,
        why: `Linux counts tasks in uninterruptible sleep (state D) in the load average, not only runnable ones.`,
        log: `$ uptime
 load average: 41.2, 38.9, 30.1
$ vmstat 1 3     # r = runnable, b = blocked
 r  b   ... id wa
 1 39   ... 71 25`,
        note: `Representative output. Read r and b separately.`,
        fix: [`Split <code>r</code> (CPU wait) from <code>b</code> (I/O wait) in vmstat.`, `Check <code>/proc/pressure/io</code> and <code>iostat -x</code>.`, `Verify: the load average tracks <code>r</code> again.`]
      },
      {
        t: `Tail latency from CPU contention`,
        sym: `<b>p99 latency is high, average CPU is below 70%, <code>/proc/pressure/cpu</code> shows non-zero some.</b>`,
        ctx: `Batch jobs share the cores of a latency-critical service.`,
        why: `Average CPU hides run-queue wait: tasks wait for a core even when the core average is not 100%.`,
        log: `$ cat /proc/pressure/cpu
some avg10=18.30 avg60=12.10 avg300=7.45 total=912345678`,
        note: `PSI format as documented in the kernel (Documentation/accounting/psi).`,
        fix: [`Measure wake-up latency with <code>perf sched latency</code>.`, `Lower batch priority (<code>nice</code>, cgroup cpu.weight) or isolate cores.`, `Trade-off: batch jobs slow down.`, `Verify: the some value and the p99 fall.`]
      },
      {
        t: `Real-time task locks a core`,
        sym: `<b>A core stays at 100% in one process and other tasks on it stall.</b>`,
        ctx: `A process was started with <code>chrt -f 99</code> and loops.`,
        why: `A SCHED_FIFO task runs until it blocks or a higher priority one arrives, and the fair scheduler cannot preempt it (the kernel throttles real-time tasks by default to leave some time for others).`,
        log: `$ ps -eo pid,cls,rtprio,pcpu,comm | awk '$2=="FF"'
 8821  FF  99  99.9 spinner`,
        note: `<code>kernel.sched_rt_runtime_us</code> limits RT CPU time per period.`,
        fix: [`Find real-time tasks with the ps command above.`, `Return them to <code>SCHED_OTHER</code> (<code>chrt -o -p 0 &lt;pid&gt;</code>) or fix the loop.`, `Verify: other tasks on that core run again.`]
      }
    ],
    scenarios: [vr, queues]
  };
})();
