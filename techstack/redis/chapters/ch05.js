/* Chapter 5 "Persistence: AOF and RDB": three scenes and the Explain text (index 5, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: the loss window of appendfsync everysec. Scene 2: a failed save closes the write gate (MISCONF). Scene 3: fork and copy-on-write during BGSAVE.
   Sizes and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. A write is acknowledged before it is on disk, unless appendfsync is always ---- */
  const FOOT_FSYNC = 'Simplified: one primary, four writes. The loss window is illustrative.';
  const fsync = {
    id: 'fsync-window', label: 'Loss window', desc: 'With appendfsync everysec the AOF is forced to disk once per second. A power failure loses the writes that were acknowledged since the last fsync.',
    codeLabel: 'Config',
    code: { bug: [
      'appendonly yes',
      'appendfsync everysec        # default: fsync once per second',
      'SET order:1 v   -> OK        # appended to the AOF, in the OS cache',
      '# fsync runs: order:1 and order:2 are on disk',
      'SET order:3 v   -> OK        # acknowledged, not yet fsynced',
      '# 10:03 power fails: order:3 and order:4 are gone',
      'appendfsync always           # fsync before the reply, window shrinks',
    ] },
    scene: { w: W, h: H, footer: FOOT_FSYNC, panels: [
      { id: 'cl', x: 16, y: 58, w: 150, h: 290, title: 'Client', tone: 'info' },
      { id: 'os', x: 180, y: 58, w: 220, h: 290, title: 'AOF in the OS cache', tone: 'info' },
      { id: 'dk', x: 414, y: 58, w: 210, h: 290, title: 'Disk', tone: 'info' },
    ], tokens: {
      a1: { label: 'order:1', sub: 'OK', tone: 'ok', w: 110 },
      a2: { label: 'order:2', sub: 'OK', tone: 'ok', w: 110 },
      a3: { label: 'order:3', sub: 'OK', tone: 'ok', w: 110 },
      a4: { label: 'order:4', sub: 'OK', tone: 'ok', w: 110 },
      o1: { label: 'order:1', sub: 'appended', tone: 'warn', w: 120 },
      o2: { label: 'order:2', sub: 'appended', tone: 'warn', w: 120 },
      o3: { label: 'order:3', sub: 'appended', tone: 'warn', w: 120 },
      o4: { label: 'order:4', sub: 'appended', tone: 'warn', w: 120 },
      d1: { label: 'order:1', sub: 'on disk', tone: 'live', w: 120 },
      d2: { label: 'order:2', sub: 'on disk', tone: 'live', w: 120 },
      x3: { label: 'order:3', sub: 'lost', tone: 'delete', w: 120 },
      x4: { label: 'order:4', sub: 'lost', tone: 'delete', w: 120 },
      fs: { label: 'fsync', sub: 'once per second', tone: 'cursor', w: 120 },
    } },
    bug: [
      { log: 'Two orders are written. Redis appends each command to the AOF, replies OK, and leaves the data in the OS page cache for now.', callout: 'Acknowledged, but only in the OS cache', code: 2,
        at: { a1: { x: 36, y: 110 }, a2: { x: 36, y: 170 }, o1: { x: 214, y: 110 }, o2: { x: 214, y: 170 } }, arrows: [['a1', 'o1', 'append'], ['a2', 'o2', 'append']], badge: { os: 'not durable yet' }, stats: [{ l: 'acknowledged', v: '2' }, { l: 'on disk', v: '0', cls: 'warn' }] },
      { log: 'Once per second a background thread runs fsync and forces the AOF to disk. Orders 1 and 2 are now durable.', callout: 'fsync: orders 1 and 2 reach the disk', code: 3,
        at: { a1: { x: 36, y: 110 }, a2: { x: 36, y: 170 }, fs: { x: 220, y: 240 }, d1: { x: 440, y: 110 }, d2: { x: 440, y: 170 } }, arrows: [['fs', 'd2', 'fsync']], badge: { dk: 'durable' }, stats: [{ l: 'acknowledged', v: '2' }, { l: 'on disk', v: '2', cls: 'ok' }] },
      { log: 'Two more orders arrive just after the fsync. Both are acknowledged and appended, but the next fsync is up to a second away.', callout: 'New writes wait for the next fsync', moment: true, code: 4,
        at: { a3: { x: 36, y: 210 }, a4: { x: 36, y: 270 }, o3: { x: 214, y: 210 }, o4: { x: 214, y: 270 }, d1: { x: 440, y: 110 }, d2: { x: 440, y: 170 } }, arrows: [['a3', 'o3', 'append'], ['a4', 'o4', 'append']], badge: { os: '2 not fsynced', dk: 'durable' }, stats: [{ l: 'acknowledged', v: '4' }, { l: 'on disk', v: '2', cls: 'warn' }] },
      { log: 'At 10:03 the rack loses power. The OS cache is gone with the machine. Orders 3 and 4 were acknowledged but never reached the disk.', callout: 'Power fails: acknowledged writes are lost', code: 5,
        at: { a3: { x: 36, y: 210 }, a4: { x: 36, y: 270 }, x3: { x: 214, y: 210 }, x4: { x: 214, y: 270 }, d1: { x: 440, y: 110 }, d2: { x: 440, y: 170 } }, badge: { os: 'gone', dk: 'orders 1, 2' }, stats: [{ l: 'acknowledged', v: '4' }, { l: 'lost', v: '2', cls: 'bad' }] },
      { log: 'The loss window of everysec is about one second of writes, up to about two if an fsync was still running. A restart loads the AOF and finds only orders 1 and 2.', callout: 'Window: about one to two seconds', code: 5,
        at: { x3: { x: 214, y: 210 }, x4: { x: 214, y: 270 }, d1: { x: 440, y: 110 }, d2: { x: 440, y: 170 } }, badge: { os: 'gone', dk: 'orders 1, 2' }, stats: [{ l: 'loss window', v: '1 to 2 s', cls: 'bad' }] },
      { log: 'appendfsync always runs fsync before the reply, so nothing acknowledged is ever missing, but every write pays a disk sync. no leaves the timing to the OS.', callout: 'always: no window, but each write waits for disk', code: 6,
        at: { a3: { x: 36, y: 210 }, fs: { x: 220, y: 210 }, d1: { x: 440, y: 110 }, d2: { x: 440, y: 170 } }, arrows: [['a3', 'fs', 'wait for fsync']], badge: { dk: 'always: synced first' }, stats: [{ l: 'loss window', v: 'none', cls: 'ok' }, { l: 'throughput', v: 'lower', cls: 'warn' }],
        takeaway: 'Pick the window the business accepts. everysec is the usual balance. always trades throughput for durability.' },
    ],
  };

  /* ---- 2. A failed background save closes the write gate ---- */
  const FOOT_MIS = 'Simplified: one primary with RDB snapshots on.';
  const misconf = {
    id: 'misconf-gate', label: 'Disk full, writes stop', desc: 'A background save fails because the disk is full. While the last save status is err, Redis refuses writes with MISCONF to avoid losing data silently.',
    codeLabel: 'Commands',
    code: { bug: [
      'df -h /data                  # 100% full',
      'BGSAVE                       # write error',
      'INFO persistence             # rdb_last_bgsave_status:err',
      'SET a 1',
      '(error) MISCONF Redis is configured to save RDB snapshots, ...',
      'BGSAVE                       # after space is freed: ok',
    ] },
    scene: { w: W, h: H, footer: FOOT_MIS, panels: [
      { id: 'dk', x: 16, y: 58, w: 190, h: 290, title: 'Disk and save', tone: 'info' },
      { id: 'gt', x: 220, y: 58, w: 200, h: 290, title: 'Write gate', tone: 'info' },
      { id: 'cl', x: 434, y: 58, w: 190, h: 290, title: 'Clients', tone: 'info' },
    ], tokens: {
      disk: { label: 'disk', sub: '100% full', tone: 'warn', w: 140 },
      disk2: { label: 'disk', sub: '40% used', tone: 'ok', w: 140 },
      bg: { label: 'BGSAVE', sub: 'write error', tone: 'warn', w: 140 },
      bg2: { label: 'BGSAVE', sub: 'succeeded', tone: 'ok', w: 140 },
      st: { label: 'last save', sub: 'err', tone: 'warn', w: 140 },
      st2: { label: 'last save', sub: 'ok', tone: 'ok', w: 140 },
      set: { label: 'SET a 1', sub: 'client write', tone: 'cursor', w: 130 },
      err: { label: 'MISCONF', sub: 'write refused', tone: 'warn', w: 130 },
      ok: { label: 'OK', sub: 'write accepted', tone: 'ok', w: 130 },
      get: { label: 'GET', sub: 'still served', tone: 'ok', w: 130 },
    } },
    bug: [
      { log: 'The data disk fills up. Redis can still run, but it cannot write a new RDB file.', callout: 'The disk is full', code: 0,
        at: { disk: { x: 40, y: 110 } }, stats: [{ l: 'disk', v: '100% full', cls: 'bad' }] },
      { log: 'The next background save tries to write its temp file and fails. The last save status becomes err.', callout: 'BGSAVE fails: status err', code: 1,
        at: { disk: { x: 40, y: 110 }, bg: { x: 40, y: 180 }, st: { x: 40, y: 250 } }, arrows: [['bg', 'disk', 'write']], stats: [{ l: 'rdb_last_bgsave_status', v: 'err', cls: 'bad' }] },
      { log: 'A client sends SET a 1. Before it runs a write, Redis checks the last save status.', callout: 'Writes pass through the gate', code: 3,
        at: { st: { x: 40, y: 250 }, set: { x: 450, y: 110 } }, arrows: [['set', 'st', 'check status', 'bad']], badge: { gt: 'status: err' }, stats: [{ l: 'gate', v: 'checks status', cls: 'warn' }] },
      { log: 'stop-writes-on-bgsave-error is on by default, so the gate refuses the write with MISCONF. Redis would rather stop than keep accepting data it cannot save.', callout: 'MISCONF: writes are refused', moment: true, code: 4,
        at: { st: { x: 40, y: 250 }, set: { x: 450, y: 110 }, err: { x: 255, y: 170 }, get: { x: 450, y: 190 } }, arrows: [['set', 'err', 'refused', 'bad']], badge: { gt: 'closed' }, stats: [{ l: 'writes', v: 'refused', cls: 'bad' }, { l: 'reads', v: 'served', cls: 'ok' }] },
      { log: 'An operator frees disk space and runs BGSAVE. The save succeeds and the last save status returns to ok.', callout: 'Space freed, BGSAVE succeeds', code: 5,
        at: { disk2: { x: 40, y: 110 }, bg2: { x: 40, y: 180 }, st2: { x: 40, y: 250 } }, arrows: [['bg2', 'disk2', 'write']], badge: { gt: 'status: ok' }, stats: [{ l: 'rdb_last_bgsave_status', v: 'ok', cls: 'ok' }] },
      { log: 'The gate sees a good status and accepts the write again. SET returns OK.', callout: 'The gate opens, SET returns OK',
        at: { st2: { x: 40, y: 250 }, set: { x: 450, y: 110 }, ok: { x: 255, y: 170 } }, arrows: [['set', 'ok', 'accepted']], badge: { gt: 'open' }, stats: [{ l: 'writes', v: 'accepted', cls: 'ok' }],
        takeaway: 'MISCONF is a safety stop, not a bug. Alert on rdb_last_bgsave_status and disk space before the gate closes.' },
    ],
  };

  /* ---- 3. A snapshot forks the process; copy-on-write grows memory under write load ---- */
  const FOOT_COW = 'Simplified: a 24 GB primary under write load. Sizes and times illustrative.';
  const cow = {
    id: 'fork-cow', label: 'Fork and copy-on-write', desc: 'BGSAVE forks a large primary. The fork pauses it briefly, and every write to a shared page copies that page. A replica snapshot keeps both off the primary.',
    codeLabel: 'Commands',
    code: { bug: [
      'BGSAVE                  # 24 GB primary, peak writes',
      'INFO stats              # latest_fork_usec:480000',
      '# child writes the RDB, parent keeps taking writes',
      'INFO persistence        # rdb_last_cow_size: about 9 GB',
      '# host memory: 24 GB + 9 GB, near the limit',
      '# fix: run BGSAVE on a replica, not on the primary',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_COW,
      header: s => ({ left: s.where || 'primary · 24 GB dataset', right: s.r || '' }),
      setup(kit) {
        const fk = kit.chip(null, { x: 40, y: 84, w: 170, h: 50, label: 'fork()', sub: 'copies page tables', tone: 'info' });
        const ch = kit.chip(null, { x: 235, y: 84, w: 170, h: 50, label: 'child', sub: 'writes the RDB', tone: 'info', show: false });
        const pa = kit.chip(null, { x: 430, y: 84, w: 170, h: 50, label: 'parent', sub: 'serves writes', tone: 'ok' });
        const bars = kit.bars(null, { x: 40, y: 190, w: 560, labelW: 150, rowH: 30, max: 40, title: 'Memory on the host (GB)', items: [{ id: 'data', label: 'dataset' }, { id: 'cow', label: 'copy-on-write' }, { id: 'host', label: 'host total' }] });
        const note = kit.text(null, { x: 40, y: 320, t: '', cls: 'mut sm' });
        return { fk, ch, pa, bars, note };
      },
      frame(s, kit, R) {
        R.fk.set({ sub: s.fk || 'copies page tables', tone: s.fkTone || 'info' });
        R.ch.set({ show: !!s.child });
        R.pa.set({ sub: s.pa || 'serves writes', tone: s.paTone || 'ok' });
        const cowGB = s.cow || 0;
        R.bars.set('data', 24, 'info', '24');
        R.bars.set('cow', cowGB, cowGB >= 8 ? 'bad' : (cowGB ? 'warn' : 'info'), cowGB ? '+' + cowGB : '0');
        R.bars.set('host', 24 + cowGB, 24 + cowGB >= 32 ? 'bad' : 'info', String(24 + cowGB));
        R.note.set(s.note || '');
      },
    },
    bug: [
      { log: 'BGSAVE runs on the 24 GB primary during peak writes. Redis calls fork(), and the kernel copies the page tables for the whole process.', callout: 'fork() copies the page tables', code: 0,
        state: { fk: 'about 480 ms pause', fkTone: 'warn', paTone: 'warn', pa: 'paused by the fork', r: 'fork' }, stats: [{ l: 'fork pause', v: '480 ms', cls: 'bad' }, { l: 'dataset', v: '24 GB' }] },
      { log: 'INFO stats shows the pause as latest_fork_usec. Every client waits for it, because the fork runs on the executor.', callout: 'Every client waits for the fork', code: 1,
        state: { fk: 'latest_fork_usec 480000', fkTone: 'warn', paTone: 'ok', child: true, r: 'child starts' }, stats: [{ l: 'latest_fork_usec', v: '480000', cls: 'bad' }] },
      { log: 'The child writes the RDB from a frozen view of memory. The parent keeps serving writes. Pages are shared, so nothing is copied yet.', callout: 'Parent and child share the pages', code: 2,
        state: { child: true, fk: 'done', cow: 0, note: 'Pages are shared until a write touches them.', r: 'sharing' }, stats: [{ l: 'copy-on-write', v: '0 GB' }] },
      { log: 'Each write to a shared page makes the kernel copy that page for the parent, so the snapshot stays consistent. Under peak writes the copies add up.', callout: 'Writes copy pages: memory grows', moment: true, code: 3,
        state: { child: true, fk: 'done', cow: 5, note: 'The more writes during the save, the more pages are copied.', r: 'copying' }, stats: [{ l: 'copy-on-write', v: '+5 GB', cls: 'warn' }] },
      { log: 'rdb_last_cow_size reports about 9 GB. The host now holds 24 GB of data plus 9 GB of copies, close to its limit, and the kernel OOM killer may end the process.', callout: 'Host memory near the limit', code: 4,
        state: { child: true, fk: 'done', cow: 9, note: 'If the host runs out of memory the OOM killer can end Redis.', r: 'near OOM' }, stats: [{ l: 'copy-on-write', v: '+9 GB', cls: 'bad' }, { l: 'host memory', v: 'near OOM', cls: 'bad' }] },
      { log: 'The fix is to take the snapshot on a replica. The primary never forks and does not pause. The replica sees fewer writes per page, so it copies fewer pages.', callout: 'Snapshot on a replica instead', code: 5,
        state: { where: 'replica · snapshot', child: true, fk: 'pause off the primary', fkTone: 'ok', pa: 'primary keeps serving', paTone: 'ok', cow: 1, note: 'The primary does not fork and does not pause.', r: 'replica BGSAVE' }, stats: [{ l: 'fork pause on primary', v: 'none', cls: 'ok' }, { l: 'copy-on-write', v: '+1 GB', cls: 'ok' }],
        takeaway: 'Fork is cheap to start but not free. Leave memory headroom for copy-on-write, or take snapshots on a replica.' },
    ],
  };

  window.CHAPTER_OVERRIDES[5] = {
    explain: `<h3>1. Memory is volatile</h3>
<p>Everything in Redis lives in memory, and memory is gone when the process or the machine goes. Durability needs a copy on disk. Redis offers two mechanisms with different loss windows and costs: the append-only file (AOF), which logs each write, and RDB snapshots, which save the whole dataset at a point in time. They can be used together.</p>

<h3>2. AOF: log every write</h3>
<p>With <code>appendonly yes</code>, every write command is appended to a log. The log is written through the operating system, so <code>appendfsync</code> decides when it is forced to disk: <code>always</code> (before the reply), <code>everysec</code> (the default, once per second by a background thread) or <code>no</code> (the OS decides). In Redis 7 the AOF is multi-part: a base file plus incremental files in <code>appendonlydir</code>, with a manifest. A background rewrite compacts it into a new base.</p>
<p>The write is acknowledged before the fsync under <code>everysec</code>, so a power failure can lose the last second of acknowledged writes, up to about two if an fsync was still in flight. <code>always</code> shrinks the window to nothing but adds a disk sync to every write.</p>

<h3>3. RDB: a point-in-time snapshot</h3>
<p>A snapshot is made by <code>fork</code>. The child process writes the dataset to a temp file and renames it into place when it is complete. The parent keeps serving clients. Parent and child share memory pages, and a page is copied only when one of them changes it, which is called <b>copy-on-write</b>. Snapshots run on <code>save</code> rules or on <code>BGSAVE</code>, and they load fast on restart, but everything written since the last snapshot is lost.</p>

<h3>4. The cost of a fork</h3>
<p>The fork copies the page tables of the whole process, and that pause grows with the dataset. It shows as <code>latest_fork_usec</code> in <code>INFO stats</code>. After the fork, every write to a shared page makes the kernel copy that page, so a busy primary can need a large share of extra memory while the child runs. <code>rdb_last_cow_size</code> in <code>INFO persistence</code> reports how much. Leave headroom for it, or take snapshots on a replica.</p>

<h3>5. Restart, and the safety stop</h3>
<p>On restart with the AOF enabled, Redis loads the AOF, which is more complete than the RDB. A last command cut off by the crash is handled by <code>aof-load-truncated</code>, or repaired with <code>redis-check-aof --fix</code>. Separately, if a background save fails and <code>stop-writes-on-bgsave-error</code> is on (the default), Redis refuses writes with <code>MISCONF</code> until a save succeeds, rather than keep accepting data it cannot persist.</p>

<h3>6. The trade-off: window, cost, recovery time</h3>
<p><code>everysec</code> is the usual balance, with a loss of about a second at little cost. <code>always</code> narrows the window and costs throughput. An RDB alone is cheap and quick to load but loses everything since the last snapshot. Choose the window the business can accept, then measure the cost: fork time, copy-on-write size, fsync latency and restart time.</p>
<p>A cache that can be refilled may need no persistence at all. An order-event queue that lives in the same instance does. That is a reason to keep them in separate instances with separate settings.</p>

<h3>7. Syntax</h3>
<pre>appendonly yes
appendfsync everysec               # always | everysec | no
save 3600 1 300 100 60 10000       # RDB rules: seconds and changes
stop-writes-on-bgsave-error yes

BGSAVE                             # RDB snapshot in a child
BGREWRITEAOF                       # compact the AOF
INFO persistence                   # rdb_last_bgsave_status, aof_*, rdb_last_cow_size
INFO stats                         # latest_fork_usec
redis-check-aof --fix appendonly.aof.1.incr.aof</pre>
<p>Check <code>INFO persistence</code> first after any restart or disk alert, before you change a setting.</p>`,
    scenarios: [fsync, misconf, cow],
  };
})();
