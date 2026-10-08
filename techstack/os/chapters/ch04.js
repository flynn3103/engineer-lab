/* Chapter 4 "Processes: fork, Copy-on-Write and Zombies": two scenes in two forms:
   a page-sharing graph (parent and child tables pointing at shared frames) and a state machine with a gliding token. */
(function () {
  const D = window.OSD;

  /* ---------- 1. fork(): the child shares every frame until someone writes ---------- */
  const PX = 30, CXX = 480, FX = 262, VW = 128, VH = 38, FW = 116;
  const vy = i => 120 + i * 62;
  const FR = { F1: { y: 112, name: 'F1 code' }, F2: { y: 174, name: 'F2 heap' }, F3: { y: 236, name: 'F3 stack' }, F4: { y: 298, name: 'F4 copy' } };
  const cow = {
    id: 'cow', label: 'fork and copy-on-write', desc: 'fork copies the page tables, not the data. Both processes point at the same frames, marked read-only. A write copies exactly one 4 KB page (illustrative).',
    codeLabel: 'C', code: { bug: ['pid_t pid = fork();            // child gets a copy of the page tables only', 'if (pid == 0) {', '  heap[0] = 42;                // child writes V2: copy-on-write fault', '}', '// parent later writes the same page'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 3 pages, 4 KB each. refcount = how many page tables map the frame.',
      header: s => ({ left: 'page tables → physical frames', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'cow') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        D.text(L, PX, 92, 'parent', { b: 1 });
        if (s.child) D.text(L, CXX, 92, 'child', { b: 1 });
        const names = ['V1 code', 'V2 heap', 'V3 stack'];
        const fOf = (who, i) => (who === 'c' && i === 1 && s.copied ? 'F4' : 'F' + (i + 1));
        const rc = f => (f === 'F4' ? 1 : f === 'F2' ? (s.child && !s.copied ? 2 : 1) : f === 'F1' ? (s.child ? 2 : 1) : (s.child ? 2 : 1));
        const roOf = (who, i) => i === 0 || (s.child && !(i === 1 && (who === 'c' ? s.copied : s.parentOwns)) && !(s.copiedAll));
        ['p', 'c'].forEach(who => {
          if (who === 'c' && !s.child) return;
          const x = who === 'p' ? PX : CXX;
          names.forEach((nm, i) => {
            const f = fOf(who, i), ro = roOf(who, i), hot = s.hot === who + i;
            D.cell(L, x, vy(i), VW, VH, nm, hot ? 'acc' : 'info', { sub: ro ? 'read-only' : 'read/write', hot });
            const fy = FR[f].y + 17;
            D.path(L, who === 'p' ? `M${x + VW} ${vy(i) + 19} L${FX} ${fy}` : `M${x} ${vy(i) + 19} L${FX + FW} ${fy}`, { tone: hot ? 'acc' : '', arrow: true });
          });
        });
        Object.keys(FR).forEach(f => {
          if (f === 'F4' && !s.copied) return;
          const n = rc(f);
          D.cell(L, FX, FR[f].y, FW, 34, FR[f].name, n > 1 ? 'warn' : 'ok', { sub: 'refcount ' + n, hot: s.newf === f });
        });
        D.text(L, 24, 372, 'data copied so far: ' + (s.copied ? '4 KB' : '0 bytes'), { s: 1, tone: s.copied ? 'warn' : 'ok' });
      }
    },
    bug: [
      { log: 'One process maps three pages: code, heap and stack. Each frame is used by one page table, so each refcount is 1 and the heap and stack are writable.', callout: 'One process, three private frames', state: { r: 'before fork' }, stats: [{ l: 'frames used', v: '3' }] },
      { log: 'fork() creates the child by copying the page tables, not the pages. Both tables now point at the same frames, every writable page is marked read-only in both, and refcounts become 2.', callout: 'fork copies tables, not data', moment: true, code: 0, state: { child: true, r: 'fork() done' }, stats: [{ l: 'data copied', v: '0 B', cls: 'ok' }, { l: 'frames used', v: '3', cls: 'ok' }] },
      { log: 'The child writes to its heap page. The page is read-only in its table, so the CPU raises a protection fault.', callout: 'A write to a shared page faults', code: 2, state: { child: true, hot: 'c1', r: 'child writes V2' }, stats: [{ l: 'fault', v: 'write to R/O', cls: 'warn' }] },
      { log: 'The kernel sees refcount 2, allocates a new frame F4, copies the 4 KB, points the child’s heap entry at F4 as read/write, and drops F2’s refcount to 1.', callout: 'Copy exactly one page', moment: true, code: 2, state: { child: true, copied: true, newf: 'F4', r: 'copy-on-write' }, stats: [{ l: 'data copied', v: '4 KB', cls: 'warn' }, { l: 'frames used', v: '4' }] },
      { log: 'When the parent later writes the same page, F2 now has refcount 1. No copy is needed: the kernel just makes the entry writable again.', callout: 'The last owner writes in place', code: 4, state: { child: true, copied: true, parentOwns: true, hot: 'p1', r: 'parent writes V2' }, stats: [{ l: 'extra copy', v: 'none', cls: 'ok' }] },
      { log: 'Production reading: Redis forks to take a snapshot while the parent keeps taking writes. Every page the parent writes is copied once, so memory can grow by up to the size of the dataset. The fork itself copies the page tables, which takes longer the more memory is mapped.', callout: 'Copy cost grows with writes after fork', state: { child: true, copied: true, parentOwns: true, r: 'snapshot running' }, stats: [{ l: 'worst case', v: '2× memory', cls: 'bad' }, { l: 'fork time', v: '∝ mapped size', cls: 'warn' }],
        takeaway: 'fork is cheap because the copy is deferred until a write, one page at a time.' }
    ]
  };

  /* ---------- 2. Process states: a token glides along the state machine ---------- */
  const N = { new: [24, 140], ready: [168, 140], run: [352, 140], zom: [528, 140], blk: [260, 280], gone: [528, 280] };
  const NW = 88, NH = 40;
  const EDGES = [
    ['new', 'ready', 'fork', 'right'], ['ready', 'run', 'scheduled', 'right'], ['run', 'ready', 'preempted', 'left'],
    ['run', 'blk', 'read() waits', 'down'], ['blk', 'ready', 'I/O done', 'up'], ['run', 'zom', 'exit()', 'right'], ['zom', 'gone', 'parent wait()', 'down']
  ];
  const cen = k => ({ x: N[k][0] + NW / 2, y: N[k][1] + NH / 2 });
  const states = {
    id: 'states', label: 'Process states and zombies', desc: 'A child moves between ready, running and blocked. When it exits it stays as a zombie until the parent calls wait (illustrative).',
    codeLabel: 'C', code: { bug: ['while (1) {', '  if (fork() == 0) { work(); exit(0); }   // child exits...', '}                                         // ...parent never calls wait()'], fix: ['signal(SIGCHLD, reap);', 'void reap(int s) { while (waitpid(-1, NULL, WNOHANG) > 0) ; }', 'while (1) { if (fork() == 0) { work(); exit(0); } }'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified Linux task states: R running/ready, S/D blocked, Z zombie.',
      header: s => ({ left: 'child pid 4242', right: s.r || '' }),
      setup(kit) {
        const tok = kit.chip(null, { x: N.new[0], y: N.new[1] - 52, w: 88, h: 30, label: 'pid 4242', tone: 'cursor' });
        return { L: D.init(kit, 'st'), tok };
      },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        EDGES.forEach(([a, b, lab, side]) => {
          const A = cen(a), B = cen(b); let x1 = A.x, y1 = A.y, x2 = B.x, y2 = B.y, dx = 0, dy = 0;
          if (side === 'right') { x1 = N[a][0] + NW; x2 = N[b][0]; y1 = y2 = A.y - (lab === 'preempted' ? 0 : 0); }
          if (side === 'left') { x1 = N[a][0]; x2 = N[b][0] + NW; y1 = y2 = A.y + 12; dy = 12; x1 = N[a][0]; }
          if (side === 'down') { y1 = N[a][1] + NH; y2 = N[b][1]; if (lab === 'parent wait()') { x1 = x2 = A.x; } else { x1 = A.x - 14; x2 = B.x + 14; } }
          if (side === 'up') { y1 = N[a][1] + NH; y2 = N[b][1] + NH; y1 = N[a][1]; y2 = N[b][1] + NH; x1 = A.x - 12; x2 = B.x + 14; }
          const hot = s.edge === lab;
          if (lab === 'preempted') { y1 = y2 = N.run[1] + NH + 8; x1 = N.run[0]; x2 = N.ready[0] + NW; D.line(L, x1, y1, x2, y2, { arrow: true, tone: hot ? 'acc' : 'mut' }); D.text(L, (x1 + x2) / 2, y1 + 14, lab, { a: 'middle', xs: 1, tone: hot ? 'acc' : '', b: hot }); return; }
          D.line(L, x1, y1, x2, y2, { arrow: true, tone: hot ? 'acc' : 'mut' });
          D.text(L, (x1 + x2) / 2 + (lab === 'parent wait()' ? -6 : side === 'down' ? 6 : 0), (y1 + y2) / 2 - (side === 'right' ? 6 : 0) + (side === 'up' ? 4 : 0), lab, { a: lab === 'parent wait()' ? 'end' : side === 'down' || side === 'up' ? 'start' : 'middle', xs: 1, tone: hot ? 'acc' : '', b: hot });
        });
        Object.keys(N).forEach(k => {
          if (k === 'gone') { D.cell(L, N.gone[0], N.gone[1], NW, NH, 'removed', 'none', {}); return; }
          const label = { new: 'new', ready: 'ready', run: 'running', blk: 'blocked', zom: 'zombie' }[k];
          D.cell(L, N[k][0], N[k][1], NW, NH, label, s.at === k ? 'acc' : k === 'zom' ? 'warn' : 'info', { b: 1, hot: s.at === k });
        });
        const p = N[s.at] || N.new;
        R.tok.set({ x: s.at === 'blk' ? p[0] - 100 : p[0], y: s.at === 'blk' ? p[1] + 5 : p[1] - 36, label: s.at === 'zom' ? 'pid 4242 Z' : 'pid 4242', tone: s.at === 'zom' ? 'warn' : 'cursor', show: s.at !== 'gone' });
        D.rect(L, 24, 68, 592, 30, s.z > 100 ? 'bad' : s.z ? 'warn' : 'mut');
        D.text(L, 36, 88, s.z ? 'zombies in the process table: ' + s.z + (s.z > 100 ? '   → fork fails with EAGAIN' : '') : 'zombies in the process table: 0', { s: 1, tone: s.z > 100 ? 'bad' : '' });
      }
    },
    bug: (() => {
      const S = (at, edge, r, z, log, callout, extra = {}) => ({ log, callout, code: extra.code, moment: extra.moment, state: { at, edge, r, z }, stats: [{ l: 'zombies', v: String(z), cls: z > 100 ? 'bad' : z ? 'warn' : '' }], takeaway: extra.takeaway });
      return [
        S('new', 'fork', 'fork', 0, 'The parent calls fork(). The kernel allocates pid 4242, a task struct and a copy of the page tables (copy-on-write). The child is new.', 'fork creates the child', { code: 1 }),
        S('ready', 'fork', 'ready', 0, 'The child is runnable. It waits in a run queue until the scheduler gives it a core.', 'Ready: waiting for a core'),
        S('run', 'scheduled', 'running', 0, 'The scheduler picks it and it runs on a core. A timer tick would move it back to ready (preempted).', 'Running on a core'),
        S('blk', 'read() waits', 'blocked', 0, 'The child calls read() on a socket with no data. It cannot make progress, so the kernel marks it blocked and the core goes to another task. Blocked tasks use no CPU.', 'Blocked: waiting for I/O'),
        S('ready', 'I/O done', 'ready', 0, 'The data arrives and an interrupt wakes the child. It becomes ready again.', 'I/O done: ready again'),
        S('run', 'scheduled', 'running', 0, 'It runs and finishes its work.', 'Running again'),
        S('zom', 'exit()', 'zombie', 1, 'The child calls exit(0). Its memory is freed, but the kernel keeps the process-table entry and the exit status until the parent reads it. The child is now a zombie. It uses no CPU or memory, but it holds a pid.', 'exit(): zombie until the parent waits', { moment: true, code: 1 }),
        S('zom', 'exit()', 'leak', 32000, 'The parent loop never calls wait(), so every child stays a zombie. After about 32 000 of them the pid space (or the cgroup pids.max) is full, and every fork() fails with EAGAIN.', 'Zombies pile up and fork() starts failing', { moment: true, code: 2, takeaway: 'A zombie is not a running process: it is an unread exit status, and only the parent can clear it.' })
      ];
    })(),
    fix: (() => {
      const S = (at, edge, r, z, log, callout, extra = {}) => ({ log, callout, code: extra.code, moment: extra.moment, state: { at, edge, r, z }, stats: [{ l: 'zombies', v: String(z), cls: z ? 'warn' : 'ok' }], takeaway: extra.takeaway });
      return [
        S('run', 'scheduled', 'running', 0, 'The parent now installs a SIGCHLD handler. Each child runs as before.', 'The parent will be told when a child exits', { code: 0 }),
        S('zom', 'exit()', 'zombie', 1, 'The child exits and becomes a zombie. The kernel sends SIGCHLD to the parent.', 'exit() sends SIGCHLD', { moment: true }),
        S('gone', 'parent wait()', 'reaped', 0, 'The handler calls waitpid(). The parent reads the exit status and the kernel frees the process-table entry and the pid. If a parent dies first, init (pid 1) adopts its children and reaps them.', 'wait() reaps the zombie', { code: 1, takeaway: 'Reap children with waitpid (or ignore SIGCHLD); containers need a real init to reap orphans.' })
      ];
    })()
  };

  const EXPLAIN = `
<h3>1. A process is a kernel record plus an address space</h3>
<p>The kernel keeps a task record per thread: its state, its registers when it is not running, its page tables, its open files and its parent. A <b>process</b> is a group of tasks that share one address space. <code>fork</code> makes a new process that looks like the old one; <code>exec</code> replaces its memory with a new program. A shell starts every command with fork followed by exec.</p>
<h3>2. fork is cheap because of copy-on-write</h3>
<p>Copying every page of a large process at fork would take seconds and double the memory. Instead the kernel copies only the page tables and marks every writable page read-only in both processes. The first write by either side faults, and the kernel copies that one page (or, if the other process already exited, just re-enables writing). The cost moves to the writes that follow, and its size depends on how many pages are written, not on the size of the process.</p>
<h3>3. The states of a task</h3>
<p>A task is <b>running</b> on a core, <b>ready</b> in a queue, or <b>blocked</b> waiting for I/O, a lock or a timer. The timer tick moves a running task back to ready. A wake-up interrupt moves a blocked task to ready. Linux shows these as R, S (interruptible sleep), D (uninterruptible, usually disk I/O) and Z (zombie).</p>
<h3>4. Exit and zombies</h3>
<p>When a process exits, the kernel frees its memory at once but keeps a small record so the parent can ask how it ended. Until the parent calls <code>wait</code> or <code>waitpid</code>, the child is a <b>zombie</b>. A parent that never waits slowly leaks pids and process-table entries. If a parent exits first, its children are re-parented to init, which reaps them. In a container the process running as pid 1 must do this job, or zombies accumulate; that is what <code>--init</code> or a small init such as tini is for.</p>
<h3>5. The trade-off</h3>
<p>Copy-on-write gives fast fork, but it makes memory use unpredictable: a snapshotting database can nearly double its footprint under heavy writes, and the fork pause is proportional to the mapped size. <code>vfork</code> and <code>posix_spawn</code> avoid copying altogether when you only want to exec at once.</p>
<h3>6. The commands, in one place</h3>
<pre># process states and the parent of each task
ps -eo pid,ppid,stat,wchan:24,cmd
# zombies and their parents
ps -eo stat,pid,ppid,cmd | awk '$1 ~ /^Z/'
# copy-on-write effect on one process (private dirty pages)
grep -E 'Private_Dirty|Shared_Clean' /proc/&lt;pid&gt;/smaps_rollup
# limits that make fork() fail
cat /proc/sys/kernel/pid_max /proc/sys/kernel/threads-max; ulimit -u</pre>`;

  window.COURSE.chapters[4] = {
    title: `Processes: fork, Copy-on-Write and Zombies`,
    problem: `The build server’s task runner starts a child process per job. After a week, new jobs fail with <code>fork: Resource temporarily unavailable</code> although CPU and memory are idle, and <code>ps</code> shows tens of thousands of entries marked <code>&lt;defunct&gt;</code>. Separately, the Redis snapshot on the same box pauses for 600 ms every time it forks and its memory doubles during the save.`,
    predict: {
      q: `A 40 GB process calls <code>fork()</code>. What does the kernel copy right away?`,
      opts: [
        `All 40 GB, so the child has its own private copy`,
        `Only the page tables; both processes share the frames until one writes a page`,
        `Nothing at all, not even the page tables`
      ],
      ans: 1,
      why: `fork duplicates the page tables and marks the writable pages read-only. Data pages are copied lazily, one page per first write. The page-table copy is why fork time still grows with mapped memory.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Zombie processes accumulate`,
        sym: `<b><code>ps</code> shows many <code>Z</code> / <code>&lt;defunct&gt;</code> entries whose parent is the same process.</b>`,
        ctx: `A supervisor starts short-lived children and never reads their exit status. Often this is the pid-1 process in a container.`,
        why: `An exited child stays in the process table until its parent calls wait. Zombies hold pids, not memory or CPU.`,
        log: `$ ps -eo stat,pid,ppid,cmd | awk '$1 ~ /^Z/' | head -3
Z  9120  2201 [worker] <defunct>
Z  9121  2201 [worker] <defunct>`,
        note: `Representative output.`,
        fix: [`Find the common parent (<code>ppid</code>).`, `Fix the parent to call <code>waitpid</code>, or set <code>SIGCHLD</code> to <code>SIG_IGN</code> if it does not need the status.`, `In a container run a real init (<code>docker run --init</code>, tini).`, `Verify: the Z count returns to zero. Killing a zombie does nothing; ending its parent lets init reap it.`]
      },
      {
        t: `fork() fails with EAGAIN`,
        sym: `<b>New processes or threads fail with <code>Resource temporarily unavailable</code> while the host looks idle.</b>`,
        ctx: `A user or a cgroup reached its process limit, often because of zombies or runaway thread creation.`,
        why: `fork returns EAGAIN when RLIMIT_NPROC, <code>kernel.pid_max</code>, <code>threads-max</code> or the cgroup <code>pids.max</code> is reached.`,
        log: `bash: fork: retry: Resource temporarily unavailable
$ cat /sys/fs/cgroup/<group>/pids.current /sys/fs/cgroup/<group>/pids.max
4096
4096`,
        note: `Cgroup v2 file names.`,
        fix: [`Check which limit applies: <code>ulimit -u</code>, <code>pids.max</code>, <code>pid_max</code>.`, `Remove the cause (zombies, thread leak) before raising a limit.`, `Verify: <code>pids.current</code> stays well under <code>pids.max</code>.`]
      },
      {
        t: `Fork pause and copy-on-write memory spike`,
        sym: `<b>A database pauses for hundreds of ms at snapshot time and memory use rises during the save.</b>`,
        ctx: `Redis (BGSAVE) forks a large process while the parent keeps handling writes.`,
        why: `The fork copies page tables proportional to the mapped size, and every page written afterward is copied once.`,
        log: `$ redis-cli info stats | grep latest_fork_usec
latest_fork_usec:612034`,
        note: `<code>latest_fork_usec</code> is a Redis metric; value illustrative.`,
        fix: [`Measure fork time and the copy-on-write size (<code>Private_Dirty</code> in smaps).`, `Leave memory headroom for the copy, and avoid snapshots at peak write load.`, `Trade-off: huge pages make fork faster but copy 2 MB per written page.`, `Verify: the fork pause and peak memory match the headroom you planned.`]
      }
    ],
    scenarios: [cow, states]
  };
})();
