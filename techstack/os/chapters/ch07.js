/* Chapter 7 "Block I/O: Queues, Elevators and io_uring": two scenes in two forms:
   a head-position chart (service order against track number) and two ring buffers shared with the kernel. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Disk head path: FCFS against the elevator ---------- */
  const REQ = [98, 183, 37, 122, 14, 124, 65, 67], START = 53;
  const ORDER_FCFS = [START, ...REQ];
  const ORDER_LOOK = [START, 65, 67, 98, 122, 124, 183, 37, 14];
  const px = i => 74 + i * 62, py = t => 104 + t / 200 * 214;
  const total = (o, n) => { let s = 0; for (let i = 1; i <= n; i++) s += Math.abs(o[i] - o[i - 1]); return s; };
  const headStage = order => ({
    w: 640, h: 420, footer: 'Simplified: tracks 0–199, head starts at 53, seek time ∝ distance (illustrative).',
    header: s => ({ left: 'head position (track) per request served', right: s.r || '' }),
    setup(kit) { return { L: D.init(kit, 'head') }; },
    frame(s, kit, R) {
      const L = R.L; D.clear(L);
      D.line(L, 62, 96, 62, 326, { thin: true }); D.text(L, 58, 100, '0', { a: 'end', xs: 1, m: 1 }); D.text(L, 58, 324, '199', { a: 'end', xs: 1, m: 1 });
      D.text(L, 70, 342, 'service order →', { xs: 1, m: 1 });
      order.forEach((t, i) => { D.line(L, px(i), 96, px(i), 326, { thin: true, tone: 'mut' }); });
      let d = ''; for (let i = 0; i <= s.n; i++) d += (i ? 'L' : 'M') + px(i) + ' ' + py(order[i]) + ' ';
      D.path(L, d, { tone: s.n === order.length - 1 ? 'acc' : 'acc' });
      for (let i = 0; i <= s.n; i++) { D.circle(L, px(i), py(order[i]), 6, i === s.n ? 'acc' : i === 0 ? 'mut' : 'ok', { hot: i === s.n }); D.text(L, px(i), py(order[i]) - 11, String(order[i]), { a: 'middle', xs: 1, b: i === s.n }); }
      D.text(L, 70, 372, 'queue: ' + REQ.join(', '), { s: 1 });
      D.text(L, 70, 392, 'head travel so far: ' + total(order, s.n) + ' tracks', { s: 1, b: 1, tone: s.n === order.length - 1 ? (order === ORDER_FCFS ? 'bad' : 'ok') : '' });
    }
  });
  const head = {
    id: 'elevator', label: 'Disk head elevator', desc: 'On a spinning disk, time is spent moving the head. Serving requests in arrival order zigzags; sweeping in one direction does the same work with far less travel (illustrative).',
    codeLabel: 'Shell', code: { bug: ['$ cat /sys/block/sda/queue/scheduler', '[none] mq-deadline bfq          # no reordering: arrival order', '$ iostat -x 1   # r_await 120 ms, %util 100'], fix: ['$ echo mq-deadline > /sys/block/sda/queue/scheduler', '# sorts by sector and sweeps the head, with deadlines so nothing starves', '$ iostat -x 1   # r_await falls'] },
    stage: headStage(ORDER_FCFS),
    bug: [0, 1, 3, 5, 8].map((n, k) => ({
      log: ['Eight requests wait for the disk and the head is at track 53. Arrival order is 98, 183, 37, 122, 14, 124, 65, 67.', 'First come, first served: the head goes 53 → 98, then 183.', 'Then back to 37, out to 122, back to 14: the head keeps crossing the disk.', 'It jumps to 124, then back to 65 and 67, which were close to where it started.', 'Total head travel is 640 tracks. At a few ms per hundred tracks, most of the I/O time is seeking, not reading.'][k],
      callout: ['Eight requests, head at 53', 'FCFS: 53 → 98 → 183', 'Zigzagging across the platter', 'Passing right by 65 and 67 early', 'FCFS: 640 tracks of travel'][k], moment: k === 4,
      state: { n, r: 'FCFS' }, stats: [{ l: 'travel', v: total(ORDER_FCFS, n) + ' tracks', cls: k === 4 ? 'bad' : '' }], takeaway: k === 4 ? 'Arrival order ignores geometry, so a seek-bound disk spends its time moving.' : undefined
    })),
    fix: [0, 3, 6, 8].map((n, k) => ({
      log: ['The scheduler keeps the queue sorted by position and moves the head in one direction (an elevator), serving requests it passes.', 'Sweeping up from 53: 65, 67, 98, 122, 124 are served in order, on the way.', 'The sweep reaches the highest request, 183, then reverses.', 'Coming back it serves 37 and 14. Travel is 299 tracks instead of 640. A deadline per request stops far-away requests from waiting forever.'][k],
      callout: ['Sort by position, sweep one way', 'Serve requests on the way up', 'Turn at the last request', 'Elevator: 299 tracks, less than half'][k], moment: k === 3,
      state: { n, r: 'elevator' }, stats: [{ l: 'travel', v: total(ORDER_LOOK, n) + ' tracks', cls: k === 3 ? 'ok' : '' }], takeaway: k === 3 ? 'Reordering trades fairness (a deadline bounds it) for much less head travel; SSDs have no head, so they use none or mq-deadline.' : undefined
    }))
  };
  head.stage = headStage(ORDER_FCFS);
  /* fix mode draws the elevator order: switch by state flag */
  const fcfsStage = headStage(ORDER_FCFS), lookStage = headStage(ORDER_LOOK);
  head.stage = { ...fcfsStage, frame(s, kit, R) { (s.r === 'elevator' ? lookStage : fcfsStage).frame(s, kit, R); } };

  /* ---------- 2. io_uring: two rings in memory shared with the kernel ---------- */
  const RC = { sq: { x: 170, y: 218 }, cq: { x: 470, y: 218 } }, RR = 66;
  const slotPos = (k, i) => ({ x: RC[k].x + RR * Math.sin(i * Math.PI / 4), y: RC[k].y - RR * Math.cos(i * Math.PI / 4) });
  const URING = {
    id: 'uring', label: 'io_uring rings', desc: 'The app and the kernel share two ring buffers. The app queues requests with no system call, submits many with one call, and reads completions straight from memory (illustrative).',
    codeLabel: 'C', code: { bug: ['io_uring_queue_init(8, &ring, 0);       // setup + mmap the rings', 'for (i = 0; i < 4; i++) {', '  sqe = io_uring_get_sqe(&ring);       // slot in the SQ ring, no syscall', '  io_uring_prep_read(sqe, fd, buf[i], 4096, off[i]); sqe->user_data = i; }', 'io_uring_submit(&ring);                 // one io_uring_enter() for all four', 'io_uring_wait_cqe(&ring, &cqe);        // completions come back in any order'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 8 slots per ring. Real rings are power-of-two sized and shared via mmap.',
      header: s => ({ left: 'submission ring (SQ) → kernel → completion ring (CQ)', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'ur') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        ['sq', 'cq'].forEach(k => {
          D.text(L, RC[k].x, 96, k === 'sq' ? 'SQ: app writes tail, kernel reads head' : 'CQ: kernel writes tail, app reads head', { a: 'middle', xs: 1, b: 1 });
          const cells = s[k];
          for (let i = 0; i < 8; i++) {
            const p = slotPos(k, i), c = cells[i];
            D.circle(L, p.x, p.y, 15, c ? (k === 'cq' ? 'ok' : 'warn') : 'mut');
            if (c) D.text(L, p.x, p.y + 4, c, { a: 'middle', xs: 1, b: 1 });
          }
          const ph = slotPos(k, s[k + 'H']), pt = slotPos(k, s[k + 'T']);
          
          const hx = RC[k].x + (ph.x - RC[k].x) * 0.62, hy = RC[k].y + (ph.y - RC[k].y) * 0.62, tx = RC[k].x + (pt.x - RC[k].x) * 0.35, ty = RC[k].y + (pt.y - RC[k].y) * 0.35;
          if (s[k + 'H'] === s[k + 'T']) { D.line(L, RC[k].x, RC[k].y, hx, hy, { arrow: true, tone: 'acc' }); D.text(L, RC[k].x, RC[k].y + 22, 'head = tail (empty)', { a: 'middle', xs: 1, tone: 'acc' }); }
          else { D.line(L, RC[k].x, RC[k].y, hx, hy, { arrow: true, tone: 'mut' }); D.text(L, RC[k].x, RC[k].y + 22, 'head ↗ grey · tail ↗ orange', { a: 'middle', xs: 1 }); D.line(L, RC[k].x, RC[k].y, tx, ty, { arrow: true, tone: 'acc' }); }
        });
        D.cell(L, 262, 190, 116, 56, 'kernel', 'info', { sub: s.kern || 'idle', b: 1, hot: !!s.hotk });
        D.line(L, 236, 218, 262, 218, { arrow: true, tone: 'acc' }); D.line(L, 378, 218, 404, 218, { arrow: true, tone: 'acc' });
        D.rect(L, 24, 330, 592, 34, 'mut');
        D.text(L, 36, 352, 'system calls so far: ' + s.sys + (s.cmp ? '   (read() per request would be ' + s.cmp + ')' : ''), { s: 1, b: 1, tone: s.sys <= 1 ? 'ok' : '' });
      }
    },
    bug: [
      { log: 'io_uring_setup creates two rings and the app maps them with mmap. The same memory is visible to the kernel, so passing a request or a result needs no copy.', callout: 'Two rings in shared memory', code: 0, state: { sq: Array(8).fill(''), cq: Array(8).fill(''), sqH: 0, sqT: 0, cqH: 0, cqT: 0, sys: 1, r: 'setup' }, stats: [{ l: 'syscalls', v: '1 (setup)' }] },
      { log: 'The app fills four submission entries (SQEs) for four reads. This is just writing to memory and moving the tail: no system call yet. Each entry carries a user_data tag so the result can be matched later.', callout: 'Queue 4 reads: no syscall', code: 3, state: { sq: ['A', 'B', 'C', 'D', '', '', '', ''], cq: Array(8).fill(''), sqH: 0, sqT: 4, cqH: 0, cqT: 0, sys: 1, r: '4 SQEs queued' }, stats: [{ l: 'queued', v: '4' }, { l: 'syscalls', v: '1' }] },
      { log: 'One io_uring_enter call tells the kernel to submit. The kernel consumes all four entries (head catches up with the tail) and starts four reads. Classic read() would have taken four calls, one blocking at a time.', callout: 'One syscall submits all four', moment: true, code: 4, state: { sq: ['A', 'B', 'C', 'D', '', '', '', ''], cq: Array(8).fill(''), sqH: 4, sqT: 4, cqH: 0, cqT: 0, sys: 2, kern: '4 reads in flight', hotk: true, cmp: 5, r: 'submitted' }, stats: [{ l: 'syscalls', v: '2', cls: 'ok' }, { l: 'in flight', v: '4', cls: 'warn' }] },
      { log: 'The device finishes C and then A first. The kernel writes completion entries (CQEs) into the CQ ring and advances its tail. Completions arrive in any order, so the user_data tag is how the app knows which read finished.', callout: 'Completions arrive out of order', code: 5, state: { sq: Array(8).fill(''), cq: ['C', 'A', '', '', '', '', '', ''], sqH: 4, sqT: 4, cqH: 0, cqT: 2, sys: 2, kern: '2 done, 2 in flight', cmp: 5, r: 'C, A done' }, stats: [{ l: 'completed', v: '2', cls: 'ok' }] },
      { log: 'B and D finish. The app reads all four CQEs directly from memory and advances the CQ head: still no syscall for reaping.', callout: 'The app reads results from memory', code: 5, state: { sq: Array(8).fill(''), cq: ['C', 'A', 'B', 'D', '', '', '', ''], sqH: 4, sqT: 4, cqH: 4, cqT: 4, sys: 2, kern: 'idle', cmp: 5, r: 'reaped' }, stats: [{ l: 'syscalls', v: '2 total', cls: 'ok' }, { l: 'vs read()', v: '5', cls: 'warn' }] },
      { log: 'With SQPOLL a kernel thread polls the SQ ring, so a busy app can submit and reap with zero syscalls, at the price of a core spinning. If the CQ ring fills up because the app reaps too slowly, completions overflow, so size the rings for the queue depth.', callout: 'SQPOLL: zero syscalls, one busy core', state: { sq: Array(8).fill(''), cq: Array(8).fill(''), sqH: 4, sqT: 4, cqH: 4, cqT: 4, sys: 0, kern: 'poll thread', cmp: 4, r: 'SQPOLL' }, stats: [{ l: 'syscalls', v: '0', cls: 'ok' }, { l: 'cost', v: 'a spinning core', cls: 'warn' }],
        takeaway: 'Shared rings batch submissions and completions, so the cost per I/O falls as the queue deepens.' }
    ]
  };

  const EXPLAIN = `
<h3>1. A request leaves the page cache through the block layer</h3>
<p>When the page cache needs a page it does not have, or flushes a dirty one, it builds a <b>bio</b>: a request for a range of sectors. The block layer merges adjacent requests, orders them with an I/O scheduler and passes them to the device driver, which hands them to the hardware. The program waiting for the data sleeps until the device interrupts the CPU to say the work is done.</p>
<h3>2. Seeking is the cost on a spinning disk</h3>
<p>A hard disk spends milliseconds moving the head and waiting for the platter to rotate, and microseconds actually transferring bytes. Serving requests in arrival order can send the head back and forth across the platter. An <b>elevator</b> sorts the queue by position and sweeps one way, then the other. The classic example in the figure goes from 640 tracks of travel to 299. The scheduler also puts a deadline on each request so a far-away one is not delayed forever. <code>mq-deadline</code> and <code>bfq</code> are the Linux schedulers that do this.</p>
<h3>3. SSDs change the question</h3>
<p>An NVMe drive has no head and serves many requests in parallel from many hardware queues, so sorting by position gains nothing and a software queue can even add latency. For NVMe, <code>none</code> is the usual choice. What matters then is <b>queue depth</b>: keeping enough requests in flight to use the drive’s parallelism, and keeping the CPU cost per request low.</p>
<h3>4. System calls become the bottleneck at high rates</h3>
<p>At a million small reads per second, one system call per read spends more CPU crossing into the kernel than on the I/O. <b>io_uring</b> addresses this with two ring buffers in shared memory: the app writes submission entries to one and the kernel writes completions to the other. Many requests go in with one <code>io_uring_enter</code>, completions are read from memory, and each entry carries a tag because completions arrive in any order. The older <code>epoll</code> only reports readiness; io_uring performs the operation.</p>
<h3>5. The trade-off</h3>
<p>Deep queues raise throughput and also latency for each request, because requests wait behind others. Elevator sorting trades a little fairness for throughput. io_uring cuts syscall cost, but it adds complexity, needs care with ring sizes, and its large feature surface has been restricted or disabled in some hardened environments.</p>
<h3>6. The commands, in one place</h3>
<pre># per-device queue depth, wait time and utilisation
iostat -x 1
# which scheduler is active, and change it
cat /sys/block/sda/queue/scheduler; echo mq-deadline | sudo tee /sys/block/sda/queue/scheduler
# per-request latency distribution
biolatency-bpfcc 10 1      # bcc tools; names vary
# who is issuing I/O
iotop -oPa; pidstat -d 1</pre>`;

  window.COURSE.chapters[7] = {
    title: `Block I/O: Queues, Elevators and io_uring`,
    problem: `A bulk reindex runs on the build server’s RAID of hard disks. Throughput is 90 random reads per second, <code>iostat</code> shows <code>r_await</code> at 120 ms and <code>%util</code> at 100%, and every other service on the volume slows down. On the NVMe host next to it the opposite happens: the disk is nearly idle, but the log processor is stuck at 100% system CPU doing a million tiny reads per second.`,
    predict: {
      q: `Eight read requests are queued on a spinning disk at scattered tracks. How should the kernel order them to spend the least time on head movement?`,
      opts: [
        `In arrival order, so every request is treated equally`,
        `Sorted by position, sweeping the head in one direction and serving requests on the way`,
        `Random order, to spread wear evenly`
      ],
      ans: 1,
      why: `Seek time dominates. Sorting by position and sweeping (an elevator) serves the same requests with far less head travel. A deadline on each request keeps far-away ones from starving.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Disk saturated: high await and utilisation`,
        sym: `<b><code>r_await</code> in the hundreds of ms, <code>%util</code> near 100, queue size (<code>aqu-sz</code>) large.</b>`,
        ctx: `Random reads from many clients on a hard-disk array.`,
        why: `Each request needs a seek; the device can do roughly a hundred per second per spindle, so the queue grows and every request waits.`,
        log: `$ iostat -x 1 2
Device  r/s   r_await  aqu-sz  %util
sda     92.0   118.40   10.9   100.0`,
        note: `Representative output; columns depend on the sysstat version.`,
        fix: [`Confirm with <code>iostat -x</code> and find the heaviest process with <code>iotop</code> or <code>pidstat -d</code>.`, `Move the random-read load to SSD, add cache, or make the access pattern sequential.`, `Check the scheduler suits the device.`, `Verify: await and queue size fall.`]
      },
      {
        t: `Wrong I/O scheduler for the device`,
        sym: `<b>Latency is worse than the hardware should give: a hard disk with <code>none</code>, or an NVMe with a heavy scheduler.</b>`,
        ctx: `A default changed in a new image or a kernel upgrade.`,
        why: `A disk benefits from sorting; an NVMe with many hardware queues does not, and a software scheduler adds a lock and latency.`,
        log: `$ cat /sys/block/sda/queue/scheduler
[none] mq-deadline kyber bfq`,
        note: `The bracketed name is active.`,
        fix: [`Pick <code>mq-deadline</code> or <code>bfq</code> for HDD, <code>none</code> for NVMe.`, `Set it persistently with a udev rule.`, `Verify with a repeatable <code>fio</code> run before and after.`]
      },
      {
        t: `io_uring completions overflow`,
        sym: `<b>Completions seem to go missing, or submission returns EBUSY, under high queue depth.</b>`,
        ctx: `An app submits faster than it reaps, with a small CQ ring.`,
        why: `The CQ ring is full, so the kernel cannot post more entries. Recent kernels keep an overflow list and flag it, which adds a slow path.`,
        log: `liburing: io_uring_submit returned -EBUSY   # application log, illustrative`,
        note: `Behaviour depends on the kernel version and ring flags.`,
        fix: [`Size the CQ ring at least twice the SQ depth (<code>IORING_SETUP_CQSIZE</code>).`, `Reap completions before submitting more.`, `Verify: no EBUSY and no overflow flag at peak load.`]
      }
    ],
    scenarios: [head, URING]
  };
})();
