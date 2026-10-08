/* Chapter 6 "Replication": three scenes and the Explain text (index 6, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: the replica offset falls out of the backlog, so PSYNC fails and a full sync starts. Scene 2: the replica output buffer passes its hard limit during a full sync.
   Scene 3: replication is asynchronous, so a replica read can be stale. Sizes and rates are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. A partial resync needs the replica's offset to still be inside the backlog ---- */
  const FOOT_BL = 'Simplified: each block is 30 MB of the write stream. Rates illustrative.';
  const BLOCKS = Array.from({ length: 12 }, (_, i) => ({ id: 'b' + i, label: String((i + 1) * 30) }));
  const REPLICA_AT = 1;   // block index of the replica's last applied offset (60 MB)
  const PRIMARY_AT = 11;  // block index of the primary offset (360 MB)
  const backlog = {
    id: 'backlog-gap', label: 'Gap larger than backlog', desc: 'A 30-second disconnect at 10 MB/s writes about 300 MB. A 1 MB backlog no longer holds the replica offset, so PSYNC fails and the primary sends a full RDB.',
    codeLabel: 'Config',
    code: { bug: [
      '# primary writes about 10 MB/s, replica offline 30 s',
      'repl-backlog-size 1mb          # default',
      'Partial resynchronization request rejected: lack of backlog',
      'Starting BGSAVE for SYNC with target: disk',
      'repl-backlog-size 512mb        # fix: above the 300 MB gap',
      '# PSYNC continues: only the missing commands are sent',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_BL,
      header: s => ({ left: 'write stream by offset (MB)', right: s.r || '' }),
      setup(kit) {
        const strip = kit.strip(null, { x: 40, y: 104, items: BLOCKS, w: 40, h: 30, gap: 6 });
        const lab = kit.text(null, { x: 40, y: 160, t: '', cls: 'mut sm' });
        const p1 = kit.chip(null, { x: 40, y: 190, w: 250, h: 50, label: 'PSYNC', sub: '', tone: 'info', show: false });
        const p2 = kit.chip(null, { x: 330, y: 190, w: 270, h: 50, label: 'primary', sub: '', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 40, y: 280, w: 560, labelW: 150, rowH: 28, max: 600, unit: ' MB', title: 'Sizes', items: [{ id: 'gap', label: 'gap to catch up' }, { id: 'bl', label: 'repl-backlog-size' }] });
        return { strip, lab, p1, p2, bars };
      },
      frame(s, kit, R) {
        const up = s.up == null ? REPLICA_AT : s.up, win = s.win || [PRIMARY_AT, PRIMARY_AT];
        BLOCKS.forEach((b, i) => {
          let tone = i <= up ? 'info' : 'warn';
          if (s.win && i >= win[0] && i <= win[1]) tone = 'ok';
          if (i === REPLICA_AT) tone = 'cursor';
          if (i === up && up === PRIMARY_AT) tone = 'live';
          R.strip['b' + i].set({ tone, hl: i === REPLICA_AT || i === up });
        });
        R.lab.set(s.lab || '');
        R.p1.set({ show: !!s.psync, label: 'PSYNC <id> 60', sub: s.psyncSub || 'replica asks to resume' });
        R.p2.set({ show: !!s.reply, label: s.reply || '', sub: s.replySub || '', tone: s.replyTone || 'info' });
        R.bars.set('gap', s.gap || 0, s.gap ? 'warn' : 'info', s.gap ? s.gap + ' MB' : '0');
        R.bars.set('bl', s.bl || 1, s.bl > 300 ? 'ok' : 'bad', (s.bl || 1) + ' MB');
      },
    },
    bug: [
      { log: 'The replica is connected and has applied the stream up to offset 60 MB. The primary numbers every write by its byte offset, and the replica remembers the last one it applied.', callout: 'Replica and primary agree on an offset', code: 0,
        state: { up: REPLICA_AT, lab: 'The replica applied up to 60 MB.', bl: 1, r: 'in sync' }, stats: [{ l: 'replica offset', v: '60 MB' }, { l: 'lag', v: '0', cls: 'ok' }] },
      { log: 'The link drops for 30 seconds. The primary keeps taking about 10 MB/s of writes, so the stream grows by about 300 MB before the replica comes back.', callout: 'The primary writes 300 MB while the replica is away', code: 0,
        state: { up: PRIMARY_AT, gap: 300, lab: 'The replica stays at 60 MB. The primary is at 360 MB.', bl: 1, r: 'link down' }, stats: [{ l: 'gap', v: '300 MB', cls: 'bad' }] },
      { log: 'The backlog is a ring buffer of the most recent writes. A 1 MB ring holds only the newest bytes, which are near offset 360 MB.', callout: 'The 1 MB ring keeps only the newest bytes', code: 1,
        state: { up: PRIMARY_AT, win: [PRIMARY_AT, PRIMARY_AT], gap: 300, lab: 'Green: the part of the stream the backlog still holds.', bl: 1, r: 'backlog 1 MB' }, stats: [{ l: 'backlog', v: '1 MB', cls: 'bad' }] },
      { log: 'The replica reconnects and sends PSYNC with its offset. 60 MB is not inside the ring, so the primary rejects the partial resync.', callout: 'PSYNC: offset not in the backlog', moment: true, code: 2,
        state: { up: PRIMARY_AT, win: [PRIMARY_AT, PRIMARY_AT], gap: 300, psync: true, reply: 'rejected: lack of backlog', replyTone: 'warn', replySub: 'must send a full RDB', bl: 1, r: 'PSYNC' }, stats: [{ l: 'resync', v: 'rejected', cls: 'bad' }] },
      { log: 'The primary forks, writes a full RDB and ships it. Every blip repeats this cycle, so sync_full keeps rising and the primary saturates.', callout: 'Full sync: fork, RDB, ship', code: 3,
        state: { up: PRIMARY_AT, win: [PRIMARY_AT, PRIMARY_AT], gap: 300, psync: true, reply: 'BGSAVE for SYNC', replyTone: 'warn', replySub: 'fork + RDB over the network', bl: 1, r: 'full sync' }, stats: [{ l: 'sync_full', v: 'rising', cls: 'bad' }] },
      { log: 'The fix is a backlog larger than the write rate times the longest disconnect you want to survive. 512 MB covers the 300 MB gap.', callout: 'A 512 MB backlog covers the gap', code: 4,
        state: { up: PRIMARY_AT, win: [0, PRIMARY_AT], gap: 300, lab: 'Green: the backlog now holds the whole gap.', bl: 512, r: 'backlog 512 MB' }, stats: [{ l: 'backlog', v: '512 MB', cls: 'ok' }] },
      { log: 'The replica returns with PSYNC and its offset is still inside the ring. The primary sends only the missing commands. No fork, no RDB.', callout: 'Partial resync: only the missing commands', code: 5,
        state: { up: PRIMARY_AT, win: [0, PRIMARY_AT], gap: 300, psync: true, reply: 'CONTINUE', replyTone: 'ok', replySub: 'sends 300 MB of commands', bl: 512, r: 'partial' }, stats: [{ l: 'resync', v: 'partial', cls: 'ok' }, { l: 'sync_full', v: 'flat', cls: 'ok' }],
        takeaway: 'Size repl-backlog-size from write rate times the longest outage to survive. A bigger ring turns blips into cheap partial syncs.' },
    ],
  };

  /* ---- 2. During a full sync, new writes are buffered for the replica; the buffer has a hard limit ---- */
  const FOOT_BUF = 'Simplified: one replica during a full sync. Sizes and limits illustrative.';
  const buffer = {
    id: 'output-limit', label: 'Buffer over the limit', desc: 'While the RDB is transferred, new writes pile up in the replica output buffer. Past the hard limit the primary closes the link and the full sync starts over.',
    codeLabel: 'Config',
    code: { bug: [
      '# dataset: several GB, the transfer takes minutes',
      'client-output-buffer-limit replica 256mb 64mb 60',
      '# writes during the transfer: 600 MB buffered for the replica',
      '# scheduled to be closed ASAP for overcoming of output buffer limits.',
      '# replica reconnects: a new full sync from the start',
      'client-output-buffer-limit replica 1gb 256mb 60   # illustrative',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_BUF,
      header: s => ({ left: 'full sync · RDB transfer', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 40, y: 104, w: 560, labelW: 170, rowH: 30, max: 1024, unit: ' MB', title: 'Replica output buffer', items: [{ id: 'buf', label: 'buffered writes' }, { id: 'hard', label: 'hard limit' }] });
        const sync = kit.chip(null, { x: 40, y: 214, w: 250, h: 52, label: 'RDB transfer', sub: 'in progress', tone: 'info' });
        const rep = kit.chip(null, { x: 330, y: 214, w: 270, h: 52, label: 'replica', sub: 'loading', tone: 'info' });
        const note = kit.text(null, { x: 40, y: 300, t: '', cls: 'mut sm' });
        return { bars, sync, rep, note };
      },
      frame(s, kit, R) {
        const hard = s.hard || 256, b = s.buf || 0;
        R.bars.set('buf', b, b > hard ? 'bad' : (b > 0.7 * hard ? 'warn' : 'info'), b + ' MB');
        R.bars.set('hard', hard, 'ok', hard + ' MB');
        R.sync.set({ sub: s.sync || 'in progress', tone: s.syncTone || 'info' });
        R.rep.set({ sub: s.rep || 'loading', tone: s.repTone || 'info' });
        R.note.set(s.note || '');
      },
    },
    bug: [
      { log: 'The dataset is several gigabytes, so the RDB transfer takes minutes. The primary has to keep taking writes during that time.', callout: 'A full sync takes minutes on a big dataset', code: 0,
        state: { buf: 0, r: 'sync starts' }, stats: [{ l: 'sync', v: 'in progress', cls: 'warn' }] },
      { log: 'Every write made during the transfer is also buffered for the replica, so the replica can apply it after loading the RDB. The buffer is the replica client output buffer, and it is bounded by client-output-buffer-limit replica.', callout: 'New writes are buffered for the replica', code: 2,
        state: { buf: 40, note: 'Under the 64 MB soft limit: no action yet.', r: 'buffering' }, stats: [{ l: 'buffered', v: '40 MB', cls: 'warn' }] },
      { log: 'Writes keep arriving faster than the replica can load. The buffer passes the 64 MB soft limit, so a 60 second timer starts. If it is still above 64 MB when the timer ends, the link is closed.', callout: 'Past the soft limit: a 60 s timer starts', code: 1,
        state: { buf: 150, note: 'Soft limit: 64 MB for 60 s. Hard limit: 256 MB at once.', r: 'soft limit' }, stats: [{ l: 'buffered', v: '150 MB', cls: 'warn' }, { l: 'soft limit', v: '64 MB / 60 s' }] },
      { log: 'The buffer crosses the 256 MB hard limit. A hard limit closes the connection at once: the primary logs that the replica is scheduled to be closed ASAP for overcoming of output buffer limits, and discards the buffer. The transfer would have needed about 600 MB.', callout: 'Over the hard limit: the link is closed', moment: true, code: 3,
        state: { buf: 260, sync: 'aborted', syncTone: 'warn', rep: 'disconnected', repTone: 'warn', r: 'closed', note: 'The primary protects its own memory. This sync needs about 600 MB.' }, stats: [{ l: 'buffered', v: '260 MB', cls: 'bad' }, { l: 'link', v: 'closed', cls: 'bad' }] },
      { log: 'The replica reconnects and the whole full sync starts again from the beginning, with the same load. If nothing changes it fails the same way.', callout: 'Reconnect: the full sync restarts', code: 4,
        state: { buf: 0, sync: 'restarted', syncTone: 'warn', rep: 'syncing again', repTone: 'warn', r: 'retry loop' }, stats: [{ l: 'sync result', v: 'restarts', cls: 'bad' }] },
      { log: 'Raise the hard limit above the buffer the transfer will need, here to 1 GB (illustrative), and watch the primary memory because this buffer is extra memory on the primary.', callout: 'A higher limit lets the sync finish', code: 5,
        state: { buf: 600, hard: 1024, sync: 'done', syncTone: 'ok', rep: 'online', repTone: 'ok', note: 'The buffer is memory on the primary: budget for it.', r: 'limit 1 GB' }, stats: [{ l: 'hard limit', v: '1 GB', cls: 'ok' }, { l: 'state', v: 'online', cls: 'ok' }],
        takeaway: 'Replica buffers are primary memory. Size the limit from write rate times sync time.' },
    ],
  };

  /* ---- 3. Replication is asynchronous: the primary replies before the replica applies ---- */
  const FOOT_ASYNC = 'Simplified: one primary, one replica, one key. Delays illustrative.';
  const async_ = {
    id: 'async-stale', label: 'Replica reads can be stale', desc: 'The primary replies OK as soon as it applied the write. The replica applies it a moment later, so a read in that gap returns the old value.',
    codeLabel: 'Commands',
    code: { bug: [
      'SET stock:42 5        # on the primary',
      '+OK                   # the reply does not wait for replicas',
      'GET stock:42          # on the replica, 3 ms later',
      '"6"                   # old value',
      'INFO replication      # master_repl_offset vs replica offset',
    ] },
    scene: { w: W, h: H, footer: FOOT_ASYNC, panels: [
      { id: 'pr', x: 16, y: 58, w: 190, h: 290, title: 'Primary', tone: 'info' },
      { id: 'st', x: 220, y: 58, w: 200, h: 290, title: 'Replication stream', tone: 'info' },
      { id: 'rp', x: 434, y: 58, w: 190, h: 290, title: 'Replica', tone: 'info' },
    ], tokens: {
      p6: { label: 'stock:42 = 6', sub: 'before', tone: 'info', w: 150 },
      p5: { label: 'stock:42 = 5', sub: 'applied', tone: 'live', w: 150 },
      r6: { label: 'stock:42 = 6', sub: 'not yet updated', tone: 'warn', w: 150 },
      r5: { label: 'stock:42 = 5', sub: 'applied', tone: 'live', w: 150 },
      set: { label: 'SET stock 5', sub: 'client A', tone: 'cursor', w: 120 },
      ok: { label: '+OK', sub: 'reply, no wait', tone: 'ok', w: 120 },
      cmd: { label: 'SET stock 5', sub: 'in the stream', tone: 'cursor', w: 120 },
      get: { label: 'GET stock', sub: 'client B', tone: 'cursor', w: 120 },
      old: { label: '"6"', sub: 'stale reply', tone: 'warn', w: 120 },
    } },
    bug: [
      { log: 'Both nodes hold stock:42 = 6. Client A sends SET stock:42 5 to the primary.', callout: 'Both nodes hold 6', code: 0,
        at: { p6: { x: 36, y: 130 }, r6: { x: 454, y: 130 }, set: { x: 36, y: 230 } }, stats: [{ l: 'primary', v: '6' }, { l: 'replica', v: '6' }] },
      { log: 'The primary applies the write and replies OK at once. It does not wait for any replica.', callout: 'The primary replies without waiting', moment: true, code: 1,
        at: { p5: { x: 36, y: 130 }, r6: { x: 454, y: 130 }, ok: { x: 36, y: 230 } }, badge: { pr: 'applied', rp: 'not yet' }, stats: [{ l: 'primary', v: '5', cls: 'ok' }, { l: 'replica', v: '6', cls: 'warn' }] },
      { log: 'The command travels to the replica in the replication stream. For a few milliseconds the replica has not applied it.', callout: 'The write is in flight', code: 1,
        at: { p5: { x: 36, y: 130 }, cmd: { x: 245, y: 130 }, r6: { x: 454, y: 130 } }, arrows: [['cmd', 'r6', 'stream']], badge: { rp: 'behind' }, stats: [{ l: 'replica lag', v: 'a few ms', cls: 'warn' }] },
      { log: 'Client B reads from the replica in that gap. The replica answers with what it has, the old value 6.', callout: 'A replica read returns the old value', moment: true, code: 3,
        at: { p5: { x: 36, y: 130 }, r6: { x: 454, y: 130 }, get: { x: 245, y: 180 }, old: { x: 245, y: 270 } }, arrows: [['get', 'r6', 'GET'], ['r6', 'old', 'answers']], badge: { rp: 'stale' }, stats: [{ l: 'client B reads', v: '6', cls: 'bad' }] },
      { log: 'The replica applies the command and catches up. A later read returns 5. The difference is lag, visible as offsets in INFO replication.', callout: 'The replica catches up',
        at: { p5: { x: 36, y: 130 }, r5: { x: 454, y: 130 } }, badge: { rp: 'in sync' }, stats: [{ l: 'primary', v: '5', cls: 'ok' }, { l: 'replica', v: '5', cls: 'ok' }],
        takeaway: 'Asynchronous replication keeps writes fast. Read from the primary when a stale read would be wrong.' },
    ],
  };

  window.CHAPTER_OVERRIDES[6] = {
    explain: `<h3>1. A replica is a copy that must catch up</h3>
<p>A replica connects to a primary, receives a copy of its data and then a stream of every write. It is useful only if it can recover cheaply after a disconnect, because links drop and nodes restart. Everything in this chapter is about how it catches up, and what the primary pays for it.</p>

<h3>2. The write stream has an offset</h3>
<p>The primary numbers its write stream by byte. It has a <b>replication ID and an offset</b>, and <code>INFO replication</code> shows <code>master_repl_offset</code> and the offset of each replica. A replica remembers the last offset it applied, so after a disconnect it can say "resume from here".</p>

<h3>3. Partial resync with PSYNC</h3>
<p>The primary keeps the most recent writes in a ring buffer, the <b>replication backlog</b>, sized by <code>repl-backlog-size</code> (1 MB by default). When a replica returns it sends <code>PSYNC</code> with its replication ID and offset. If every byte after that offset is still in the ring, the primary sends only those commands. There is no fork and no RDB.</p>

<h3>4. Full sync when the gap is too old</h3>
<p>If the replica offset is no longer in the ring, the primary cannot continue the stream. It does a full sync: it forks, writes an RDB, and ships it to the replica. While that transfer runs, new writes are buffered in the replica client output buffer. That buffer is limited by <code>client-output-buffer-limit replica</code> (for example a hard limit and a soft limit with a time). If the buffer passes the limit, the primary closes the connection, throws the buffer away and the replica starts the whole sync again.</p>

<h3>5. Asynchronous by design</h3>
<p>The primary replies to a client as soon as it applied the write. It does not wait for replicas, so replica reads can be stale for a short time, and an acknowledged write that has not yet reached any replica is lost if the primary dies right then. <code>WAIT</code> blocks the client until a number of replicas acknowledged, which narrows the window but is not strong consistency.</p>

<h3>6. The trade-off: memory for cheap recovery</h3>
<p>A bigger backlog costs memory on the primary but turns short blips into cheap partial syncs. Choose it from the write rate times the longest disconnect you want to survive. A full sync costs a fork (chapter 6), network bandwidth, CPU on both nodes and a buffer in primary memory. A flaky link makes it repeat, which is how a small network problem becomes a primary outage.</p>
<p>To diagnose, look at <code>sync_full</code> and <code>sync_partial_ok</code> in <code>INFO stats</code> and the replica offsets in <code>INFO replication</code>. A rising <code>sync_full</code> with a small backlog is the signature of this incident. Fix the backlog and the link before touching anything else.</p>

<h3>7. Syntax</h3>
<pre># on the replica
REPLICAOF primary.internal 6379
INFO replication                     # master_link_status, offsets

# on the primary
repl-backlog-size 512mb
client-output-buffer-limit replica 1gb 256mb 60   # hard, soft, seconds
INFO stats                           # sync_full, sync_partial_ok, sync_partial_err
WAIT 1 100                           # wait for 1 replica, 100 ms</pre>
<p>Read the primary's log for <code>Partial resynchronization request rejected</code> and <code>Starting BGSAVE for SYNC</code> to see which kind of sync happened, and why.</p>`,
    scenarios: [backlog, buffer, async_],
  };
})();
