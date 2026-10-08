/* Chapter 0 "The Kernel Boundary": two scenes. Scene 1 is a set of concentric privilege rings with a syscall gate;
   scene 2 is a single-CPU timeline with timer ticks. Numbers are illustrative. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Privilege rings: one read() call crosses the gate and comes back ---------- */
  const C = { x: 190, y: 192 }, R = { user: 124, kern: 80, hw: 38 };
  const POS = {            /* chip top-left for the running program, by where it is */
    user: [158, 78], gate: [158, 99], kern: [158, 122], hw: [158, 177], dead: [158, 78]
  };
  const rings = {
    id: 'ring-gate', label: 'The syscall gate', desc: 'A user program can only reach the kernel and the hardware through one gate that the kernel built. Illegal instructions fault instead (illustrative).',
    codeLabel: 'C',
    code: { bug: ['n = read(fd, buf, 4096);   // syscall #0', '// kernel: validate fd and buf, talk to the disk', '', 'asm volatile("hlt");       // privileged instruction'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: x86-64, ring 3 = user mode, ring 0 = kernel mode.',
      header: s => ({ left: 'CPU mode: ' + (s.mode === 0 ? 'ring 0 (kernel)' : 'ring 3 (user)'), right: s.r || '' }),
      setup(kit) {
        const L = D.init(kit, 'rings');
        const A = kit.chip(null, { x: 158, y: 78, w: 64, h: 30, label: 'proc A', tone: 'cursor' });
        const B = kit.chip(null, { x: 158, y: 272, w: 64, h: 30, label: 'proc B', tone: 'info' });
        const led = kit.ledger(null, { x: 350, y: 78, w: 280, title: 'What the CPU holds', cols: [{ label: 'register', w: 84 }, { label: 'value', w: 90 }, { label: 'meaning', w: 90 }], rows: 6, rowH: 17 });
        return { L, A, B, led };
      },
      frame(s, kit, R2) {
        const L = R2.L; D.clear(L);
        D.circle(L, C.x, C.y, R.user, s.pos === 'user' || s.pos === 'dead' ? 'info' : 'mut');
        D.circle(L, C.x, C.y, R.kern, s.mode === 0 ? 'warn' : 'mut');
        D.circle(L, C.x, C.y, R.hw, s.pos === 'hw' ? 'acc' : 'mut');
        D.text(L, C.x, C.y + 4, 'disk · NIC', { a: 'middle', xs: 1, m: 1 });
        D.text(L, C.x, C.y - R.kern + 14, 'kernel', { a: 'middle', xs: 1, m: 1 });
        D.text(L, C.x - 96, C.y + 94, 'user space', { a: 'middle', xs: 1, m: 1 });
        /* the gate: a bright notch in the kernel ring, with its own label */
        D.rect(L, C.x - 20, C.y - R.kern - 3, 40, 6, s.pos === 'gate' ? 'acc' : 'ok', { rx: 3, hot: s.pos === 'gate' });
        D.text(L, C.x + 26, C.y - R.kern + 2, 'gate', { xs: 1, tone: 'ok' });
        if (s.fault) { D.path(L, `M${C.x} ${C.y - R.user + 8} L${C.x} ${C.y - R.kern - 8}`, { tone: 'bad', arrow: true, dash: true }); D.text(L, C.x + 38, C.y - R.user + 14, 'blocked: #GP fault', { xs: 1, tone: 'bad' }); }
        const p = POS[s.pos] || POS.user;
        R2.A.set({ x: p[0], y: p[1], tone: s.fault ? 'delete' : s.pos === 'user' ? 'cursor' : 'warn', label: s.pos === 'dead' ? 'killed' : 'proc A', show: true, hl: !!s.hot });
        R2.B.set({ tone: 'ok', label: s.pos === 'dead' ? 'B runs' : 'proc B' });
        R2.led.clear(); (s.rows || []).forEach((r, i) => R2.led.setRow(i, r, { hl: i === s.hl }));
      }
    },
    bug: [
      { log: 'Process A runs in user mode (ring 3). It can use its own memory but cannot touch the disk, other processes, or the privileged instructions.', callout: 'A user program starts in ring 3', state: { pos: 'user', mode: 3, r: 'running', rows: [['mode', 'ring 3', 'user'], ['rip', '0x401a30', 'A’s code']] }, stats: [{ l: 'mode', v: 'user' }, { l: 'disk access', v: 'no' }] },
      { log: 'A calls read(). The C library runs the syscall instruction with the number 0 (read) in rax. The CPU switches to ring 0 and jumps to one fixed entry address that only the kernel could set.', callout: 'syscall: switch to ring 0, jump to a fixed address', code: 0, moment: true, state: { pos: 'gate', mode: 0, hot: true, r: 'syscall #0', rows: [['mode', 'ring 0', 'kernel'], ['rax', '0', 'read'], ['rip', 'entry_SYSCALL_64', 'set by kernel (MSR LSTAR)'], ['rsp', 'kernel stack', 'switched']], hl: 2 }, stats: [{ l: 'mode', v: 'kernel', cls: 'warn' }, { l: 'entry points', v: '1' }] },
      { log: 'The kernel does not trust the arguments. It checks that fd is open for this process and that buf lies inside user memory.', callout: 'The kernel validates every argument', code: 1, state: { pos: 'kern', mode: 0, r: 'validating', rows: [['mode', 'ring 0', 'kernel'], ['fd', '3', 'open for A: ok'], ['buf', '0x7ffd…', 'user range: ok'], ['count', '4096', 'ok']], hl: 2 }, stats: [{ l: 'fd valid', v: 'yes', cls: 'ok' }, { l: 'buf in user range', v: 'yes', cls: 'ok' }] },
      { log: 'Only now does the kernel talk to the device. A is put to sleep if the data is not cached and another process gets the core.', callout: 'Only the kernel reaches the hardware', code: 1, state: { pos: 'hw', mode: 0, r: 'device I/O', rows: [['mode', 'ring 0', 'kernel'], ['device', 'disk', 'kernel driver only']], hl: 1 }, stats: [{ l: 'who touched the disk', v: 'kernel' }] },
      { log: 'The kernel copies the bytes into A’s buffer and runs sysret. The CPU drops back to ring 3 and A continues, with the byte count in rax.', callout: 'sysret: back to ring 3 with the result', code: 0, state: { pos: 'user', mode: 3, r: 'returned', rows: [['mode', 'ring 3', 'user'], ['rax', '4096', 'bytes read']], hl: 1 }, stats: [{ l: 'mode', v: 'user' }, { l: 'rax', v: '4096', cls: 'ok' }] },
      { log: 'A buggy or hostile line: hlt halts the CPU, and it is allowed only in ring 0. In ring 3 the CPU refuses and raises a general protection fault instead of executing it.', callout: 'Privileged instruction in ring 3: refused', moment: true, code: 3, state: { pos: 'user', mode: 3, fault: true, hot: true, r: 'hlt in ring 3', rows: [['mode', 'ring 3', 'user'], ['hlt', '#GP', 'CPU refuses']], hl: 1 }, stats: [{ l: 'result', v: 'fault', cls: 'bad' }] },
      { log: 'The fault enters the kernel. Linux delivers SIGSEGV to A and kills only that process. B, the other 199 programs and the machine keep running.', callout: 'Only the offender dies', code: 3, state: { pos: 'dead', mode: 0, fault: true, r: 'A killed', rows: [['mode', 'ring 0', 'kernel'], ['signal', 'SIGSEGV', 'to proc A'], ['proc B', 'runs', 'unaffected']], hl: 1 }, stats: [{ l: 'A', v: 'killed', cls: 'bad' }, { l: 'B', v: 'running', cls: 'ok' }],
        takeaway: 'Hardware modes plus one kernel-controlled gate let the kernel enforce every other rule: memory, files, scheduling.' }
    ]
  };

  /* ---------- 2. Timer interrupt: the CPU comes back to the kernel even if A never asks ---------- */
  const X0 = 52, U = 62;   /* x of t=0, pixels per tick (10 ms) */
  const SLICES_FIX = [[0, 1, 'A'], [1, 1.1, 'K'], [1.1, 1.55, 'B'], [1.55, 1.65, 'K'], [1.65, 8, 'A']];
  const timeline = {
    id: 'timer-tick', label: 'Timer takes the CPU back', desc: 'One core, program A spins in while(1) and a web handler B arrives. Compare a machine with no timer interrupt and one with it (illustrative, 1 tick = 10 ms).',
    codeLabel: 'C', code: { bug: ['// proc A', 'while (1) { }          // never calls into the kernel', '', '// proc B: a web handler, needs 4 ms of CPU'], fix: ['// same programs', '// kernel: program the timer at boot', 'lapic_timer(HZ = 100);   // interrupt every 10 ms', 'on_tick: if (A used its slice) switch to B'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one core, scheduling decision is instant, kernel entry cost drawn as K.',
      header: s => ({ left: 'one core · tick = 10 ms', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'tl') }; },
      frame(s, kit, R2) {
        const L = R2.L; D.clear(L);
        const t = s.t, fix = !!s.fix;
        D.text(L, 16, 112, 'CPU', { b: 1 }); D.text(L, 16, 196, 'B', { b: 1 }); D.text(L, 16, 216, 'web', { xs: 1, m: 1 });
        /* axis and ticks */
        D.line(L, X0, 150, X0 + 8 * U, 150, { thin: true });
        for (let i = 0; i <= 8; i++) { D.line(L, X0 + i * U, 146, X0 + i * U, 154, { thin: true }); D.text(L, X0 + i * U, 166, i * 10 + 'ms', { a: 'middle', xs: 1, m: 1 }); if (fix && i >= 1 && i <= t && i <= 3) D.circle(L, X0 + i * U, 80, 5, 'acc', { hot: i === Math.floor(t) }); }
        if (fix) D.text(L, X0 + U, 66, 'timer IRQ', { a: 'middle', xs: 1, tone: 'acc' });
        const sl = fix ? SLICES_FIX : [[0, 8, 'A']];
        sl.forEach(([a, b, who]) => {
          if (a >= t) return; const e = Math.min(b, t);
          D.rect(L, X0 + a * U, 96, (e - a) * U, 36, who === 'A' ? 'info' : who === 'B' ? 'ok' : 'warn', { rx: 3 });
          if (e - a > 0.5) D.text(L, X0 + (a + e) / 2 * U, 119, who === 'A' ? 'A  while(1)' : who === 'B' ? 'B  handler' : '', { a: 'middle', s: 1 });
          if (who === 'K' && e - a > 0.05) D.text(L, X0 + (a + e) / 2 * U, 90, 'K', { a: 'middle', xs: 1, tone: 'warn' });
        });
        /* B lane: waiting (ready but no core) then done */
        const arrive = 0.2, doneAt = fix ? 1.55 : Infinity;
        if (t > arrive) D.rect(L, X0 + arrive * U, 180, (Math.min(t, doneAt) - arrive) * U, 22, fix && t >= doneAt ? 'ok' : 'bad', { rx: 3 });
        if (t > arrive) D.text(L, X0 + arrive * U + 6, 195, fix && t >= doneAt ? 'ran 4 ms, answered' : 'ready, waiting for a core', { xs: 1 });
        D.line(L, X0 + t * U, 82, X0 + t * U, 210, { tone: 'acc', dash: true });
        D.text(L, 16, 260, 'B waited:', { b: 1 });
        const waited = Math.max(0, (fix ? Math.min(t, 1.1) : t) - arrive);
        D.text(L, 108, 260, Math.round(waited * 10) + ' ms' + (!fix && t > 3 ? '  and counting' : ''), { tone: fix ? 'ok' : t > 1 ? 'bad' : '' });
      }
    },
    bug: [
      { log: 'A is running while(1). It never calls read, write or sleep, so it never enters the kernel on its own.', callout: 'A never asks for the kernel', code: 1, state: { t: 0.15, r: 'no timer' }, stats: [{ l: 'B waiting', v: '0 ms' }] },
      { log: 'B arrives at 2 ms: a web request that needs only 4 ms of CPU. The only core is busy, so B is runnable but not running.', callout: 'B is ready, but the core is taken', code: 3, state: { t: 0.6, r: 'no timer' }, stats: [{ l: 'B waiting', v: '4 ms', cls: 'warn' }] },
      { log: 'Nothing interrupts A. The kernel code is not running, so it cannot make any decision.', callout: 'Nothing gives the CPU back', moment: true, code: 1, state: { t: 3, r: 'no timer' }, stats: [{ l: 'B waiting', v: '28 ms', cls: 'bad' }] },
      { log: 'The wait only grows. On a machine that depends on programs to yield, one loop starves everyone queued behind it.', callout: 'Starvation: B waits as long as A runs', code: 1, state: { t: 8, r: 'no timer' }, stats: [{ l: 'B waiting', v: '78+ ms', cls: 'bad' }],
        takeaway: 'Trusting programs to yield means one bug freezes the machine.' }
    ],
    fix: [
      { log: 'At boot the kernel programs the timer to interrupt every 10 ms (HZ = 100; many kernels use 250 or 1000). A is running while(1).', callout: 'The kernel arms a periodic timer', code: 2, state: { fix: true, t: 0.15, r: 'timer on' }, stats: [{ l: 'B waiting', v: '0 ms' }] },
      { log: 'B arrives at 2 ms and waits. The core is still with A.', callout: 'B is ready and waits for the tick', code: 3, state: { fix: true, t: 0.6, r: 'timer on' }, stats: [{ l: 'B waiting', v: '4 ms', cls: 'warn' }] },
      { log: 'At 10 ms the timer fires. The CPU saves A’s registers, switches to ring 0 and runs the kernel’s tick handler, whether A wants it or not.', callout: 'Timer interrupt: the kernel runs now', moment: true, code: 3, state: { fix: true, t: 1.1, r: 'tick' }, stats: [{ l: 'who has the CPU', v: 'kernel', cls: 'warn' }] },
      { log: 'A used its slice, and B has been waiting. The scheduler picks B and returns to user mode in B’s context. That switch is a context switch.', callout: 'Scheduler picks B', code: 3, state: { fix: true, t: 1.55, r: 'B runs' }, stats: [{ l: 'B waited', v: '8 ms', cls: 'warn' }, { l: 'context switches', v: '1' }] },
      { log: 'B finishes its 4 ms of work and answers. The next tick or a block lets A run again; A is slowed down but not blocked forever.', callout: 'B answers; A resumes', code: 3, state: { fix: true, t: 5, r: 'A resumes' }, stats: [{ l: 'B waited', v: '8 ms', cls: 'ok' }, { l: 'A progress', v: 'continues' }],
        takeaway: 'The timer interrupt turns “please yield” into “the kernel decides”.' }
    ]
  };

  const EXPLAIN = `
<h3>1. The kernel is the only code allowed to do everything</h3>
<p>The CPU has privilege modes. On x86-64 they are called rings, and Linux uses two of them: ring 0 for the kernel and ring 3 for programs. In ring 3 the CPU refuses privileged instructions (<code>hlt</code>, writing page-table registers, <code>in</code>/<code>out</code>) and any access to memory the kernel did not map for that process. That refusal is done by hardware, so a program cannot argue its way around it.</p>
<h3>2. Three ways in: syscall, fault, interrupt</h3>
<p>Control moves from user mode to the kernel in exactly three ways. A <b>system call</b> is a deliberate request: the <code>syscall</code> instruction switches to ring 0 and jumps to the address the kernel stored in a model-specific register at boot, so the program never chooses the target. A <b>fault</b> (page fault, divide by zero, privileged instruction) is the CPU reporting that the program did something it may not. An <b>interrupt</b> comes from a device or the timer and has nothing to do with what the program is running.</p>
<h3>3. Arguments from user space are never trusted</h3>
<p>Before using a pointer or file descriptor, the kernel checks it (<code>copy_from_user</code> and <code>copy_to_user</code> return an error instead of crashing). A bad pointer ends as <code>EFAULT</code> for the call or <code>SIGSEGV</code> for the process, but it never reaches kernel memory.</p>
<h3>4. The timer makes the kernel unavoidable</h3>
<p>If the kernel only ran when programs called it, a <code>while(1)</code> would own the core forever. A hardware timer interrupts every few milliseconds. The tick handler lets the scheduler decide whether to keep the running task or switch. This is preemption, and it is what the next chapter builds on. Modern kernels can stop the tick on idle cores (NO_HZ) to save power, but a busy core still gets it.</p>
<h3>5. The trade-off</h3>
<p>Every crossing has a cost: the mode switch, the saved registers and the cache and TLB effects. A syscall takes on the order of 100 ns to a microsecond depending on mitigations, which is why high-rate programs batch work (<code>readv</code>, <code>sendmmsg</code>, io_uring in chapter 8) instead of calling the kernel for every byte.</p>
<h3>6. The commands, in one place</h3>
<pre># count syscalls and the time spent in each
strace -c -f -p &lt;pid&gt;
# system vs user CPU per core
mpstat -P ALL 1
# context switches per process
pidstat -w 1
# the fixed timer rate this kernel was built with
grep 'CONFIG_HZ=' /boot/config-$(uname -r)</pre>`;

  window.COURSE.chapters[0] = {
    title: `The Kernel Boundary`,
    problem: `The shared build server runs 200 programs from different teams. One student’s batch job has a typo and is stuck in <code>while(1){}</code>. Another program writes through a stray pointer. The product rule is that any program may crash or misbehave and the other 199 must keep serving. With one core busy in a loop that never calls the kernel, nothing the program does gives the CPU back.`,
    predict: {
      q: `A program on a one-core machine runs <code>while(1){}</code> and never makes a system call. What lets the web handler waiting behind it run?`,
      opts: [
        `A hardware timer interrupt forces the CPU back into the kernel every few milliseconds`,
        `The kernel waits for the loop to call sleep() or yield() before switching`,
        `The compiler removes the infinite loop, so it exits immediately`
      ],
      ans: 0,
      why: `The kernel cannot depend on a program to give the CPU back. The timer interrupt is hardware, so the kernel runs on every tick whatever the program is doing and can then preempt it.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `High system CPU from syscall storms`,
        sym: `<b><code>%sys</code> is high in top or mpstat while throughput is low.</b>`,
        ctx: `A log shipper calls <code>write()</code> once per line, or a client reads a socket one byte at a time.`,
        why: `Each call crosses the boundary and pays the mode switch. At millions of calls per second the crossings cost more than the useful work.`,
        log: `$ strace -c -f -p 4821
% time     seconds  usecs/call     calls  syscall
 71.4     3.912004           2   1893201  write`,
        note: `Representative output; numbers illustrative. See strace(1).`,
        fix: [`Find the hot syscall with <code>strace -c</code> or <code>perf trace -s</code>.`, `Batch: buffer in user space, use <code>writev</code>, <code>sendmmsg</code> or io_uring.`, `Trade-off: batching adds latency for the first item in the batch.`, `Verify: calls per second drop and <code>%sys</code> falls.`]
      },
      {
        t: `Segmentation fault from a bad pointer`,
        sym: `<b>The process dies with SIGSEGV; dmesg shows a line with the faulting address.</b>`,
        ctx: `A C service dereferences freed memory or a null pointer.`,
        why: `The MMU found no valid mapping or a permission mismatch, raised a fault, and the kernel delivered SIGSEGV. Only that process is affected.`,
        log: `segfault at 0 ip 000055d3c1a2b1c4 sp 00007ffd9c3e1a50 error 4 in app[55d3c1a2a000+2000]`,
        note: `Format as in dmesg on x86-64.`,
        fix: [`Enable core dumps (<code>ulimit -c unlimited</code>) and open the core with gdb.`, `Build with AddressSanitizer in test.`, `Verify: the fault no longer reproduces under the sanitizer.`]
      },
      {
        t: `A process stuck in uninterruptible sleep`,
        sym: `<b>ps shows state D; kill -9 does nothing; load average rises.</b>`,
        ctx: `A process waits inside a syscall on a hung NFS mount or a failing disk.`,
        why: `The task is inside the kernel waiting for a device. It is not interruptible by signals until the I/O completes or fails.`,
        log: `$ ps -eo pid,stat,wchan:32,cmd | awk '$2 ~ /D/'
 3120 D    nfs_wait_bit_killable   /usr/bin/backup`,
        note: `The wait channel name depends on the kernel and file system.`,
        fix: [`Read <code>/proc/&lt;pid&gt;/stack</code> (root) to see where it waits.`, `Fix the device or mount; mount with <code>soft</code> or <code>intr</code>-style options only if the data allows it.`, `Verify: the state returns to S or R.`]
      }
    ],
    scenarios: [rings, timeline]
  };
})();
