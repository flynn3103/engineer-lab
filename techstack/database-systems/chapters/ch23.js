/* Chapter 24 "Write-Ahead Logging" (index 23, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L20 Database Logging (crash recovery, STEAL and FORCE, shadow paging, journal file, write-ahead logging, logging schemes, checkpoints).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: what survives a crash, the four STEAL and FORCE policies, group commit on a timeline, and WAL segments pinned by a replication slot. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. Write-ahead rule: what is in memory is lost, what is on disk is all recovery has ---- */
  const LX = (i, base) => base + i * 88;
  const wal = {
    id: 'wal-quadrants', label: 'What survives a crash', desc: 'A transfer of 30 from A to B. Memory is on the left and disk on the right, log on top and data pages below. A crash keeps only the right-hand side (balances illustrative).',
    codeLabel: 'WAL',
    code: { bug: [
      'BEGIN; UPDATE accounts SET balance = balance - 30 WHERE id = A;   -- LSN 1: A 100 -> 70',
      'UPDATE accounts SET balance = balance + 30 WHERE id = B;          -- LSN 2: B 50 -> 80',
      'WAL rule: flush the log through LSN 1 before page A may be written to disk',
      'COMMIT;   -- LSN 3: the transaction is durable only when this record is flushed',
      'NO-FORCE: data pages may stay in memory after commit; recovery redoes them from the log',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one transfer, two pages, a log record per change. Illustrative.',
      header: s => ({ left: 'flushedLSN ' + (s.flushed || 0), right: s.right || '' }),
      draw(P, s) {
        const lost = !!s.lost;
        P.text('t1', { x: 30, y: 84, t: 'log buffer (memory)', cls: 'mut sm' }); P.text('t2', { x: 340, y: 84, t: 'log on disk', cls: 'mut sm' });
        P.text('t3', { x: 30, y: 206, t: 'buffer pool (memory)', cls: 'mut sm' }); P.text('t4', { x: 340, y: 206, t: 'data pages on disk', cls: 'mut sm' });
        P.box('q1', { x: 30, y: 92, w: 270, h: 92, tone: lost ? 'bad' : 'mut', label: '', dash: lost, op: lost ? 0.35 : 1 });
        P.box('q2', { x: 340, y: 92, w: 270, h: 92, tone: 'ok', label: '', op: 0.35, stroke: 'ok' });
        P.box('q3', { x: 30, y: 214, w: 270, h: 100, tone: lost ? 'bad' : 'mut', label: '', dash: lost, op: lost ? 0.35 : 1 });
        P.box('q4', { x: 340, y: 214, w: 270, h: 100, tone: 'ok', label: '', op: 0.35, stroke: 'ok' });
        (s.logMem || []).forEach(([id, sub], i) => P.chip('lm' + id, { x: LX(i, 40), y: 130, w: 82, h: 42, label: id, sub, tone: lost ? 'bad' : 'cursor', small: false }));
        (s.logDisk || []).forEach(([id, sub], i) => P.chip('ld' + id, { x: LX(i, 350), y: 130, w: 82, h: 42, label: id, sub, tone: 'ok' }));
        (s.pool || []).forEach(([n, v, lsn, dirty], i) => P.chip('pm' + n, { x: 44 + i * 128, y: 248, w: 116, h: 54, label: n + ' = ' + v, sub: 'pageLSN ' + lsn, tone: lost ? 'bad' : (dirty ? 'warn' : 'info') }));
        (s.disk || []).forEach(([n, v, lsn], i) => P.chip('pd' + n, { x: 354 + i * 128, y: 248, w: 116, h: 54, label: n + ' = ' + v, sub: 'pageLSN ' + lsn, tone: s.diskTone && s.diskTone[n] || 'info' }));
        if (s.crash) P.chip('cr', { x: 214, y: 66, w: 212, h: 24, label: 'POWER LOSS: memory is gone', tone: 'bad', small: true });
        if (s.ack) P.chip('ack', { x: 214, y: 322, w: 212, h: 22, label: 'client told: committed', tone: 'ok', small: true, r: 4 });
        if (s.sum) P.text('sm', { x: 30, y: 340, t: s.sum, cls: 'sm b' });
      }
    }),
    bug: [
      { log: 'Account A holds 100 and B holds 50, both on disk. The log on disk is empty. The total is 150.', callout: 'Disk: A 100, B 50, total 150', code: 0,
        state: { pool: [['A', 100, 0, 0], ['B', 50, 0, 0]], disk: [['A', 100, 0], ['B', 50, 0]], flushed: 0 }, stats: [{ l: 'total', v: '150', cls: 'ok' }] },
      { log: 'The transfer changes both pages in memory. Each change first appends a log record to the log buffer, with the before and after values.', callout: 'Changes go to memory and the log buffer', code: 1,
        state: { logMem: [['L1', 'A:100>70'], ['L2', 'B:50>80']], pool: [['A', 70, 1, 1], ['B', 80, 2, 1]], disk: [['A', 100, 0], ['B', 50, 0]], flushed: 0 }, stats: [{ l: 'dirty pages', v: '2', cls: 'warn' }, { l: 'on disk', v: 'nothing new', cls: 'warn' }] },
      { log: 'The buffer pool wants to write page A to disk. The WAL rule says the log through LSN 1 must reach disk first. Then page A may follow, even though the transfer has not committed (STEAL).', callout: 'WAL rule: log first, then the page', moment: true, code: 2,
        state: { logMem: [['L2', 'B:50>80']], logDisk: [['L1', 'A:100>70']], pool: [['A', 70, 1, 0], ['B', 80, 2, 1]], disk: [['A', 70, 1], ['B', 50, 0]], flushed: 1, diskTone: { A: 'warn' } }, stats: [{ l: 'flushedLSN', v: '1' }, { l: 'A on disk', v: '70', cls: 'warn' }, { l: 'total on disk', v: '120', cls: 'bad' }] },
      { log: 'Power fails before COMMIT. Everything in memory is gone. Disk holds A = 70 and B = 50, so the total is 120, plus a log with only L1.', callout: 'Crash: memory lost, disk has 120', code: 2,
        state: { logDisk: [['L1', 'A:100>70']], disk: [['A', 70, 1], ['B', 50, 0]], flushed: 1, crash: 1, lost: 1, pool: [['A', 70, 1, 0], ['B', 80, 2, 1]], logMem: [['L2', 'B:50>80']], diskTone: { A: 'warn' }, sum: 'on disk: 70 + 50 = 120' }, stats: [{ l: 'total', v: '120', cls: 'bad' }] },
      { log: 'Recovery reads the log. L1 belongs to a transaction with no COMMIT record, so it is a loser. The before value in L1 lets recovery restore A to 100.', callout: 'No COMMIT: undo L1 from its before value', code: 0,
        state: { logDisk: [['L1', 'A:100>70'], ['CLR', 'A:70>100']], disk: [['A', 100, 4], ['B', 50, 0]], flushed: 4, diskTone: { A: 'ok' }, sum: 'after recovery: 100 + 50 = 150', right: 'recovered' }, stats: [{ l: 'total', v: '150', cls: 'ok' }] },
      { log: 'Now the same transfer commits. The log buffer holds L1, L2 and COMMIT (L3). The commit flushes them to disk together, and only then does the client hear OK.', callout: 'COMMIT: flush the log, then reply', code: 3,
        state: { logDisk: [['L1', 'A:100>70'], ['L2', 'B:50>80'], ['L3', 'COMMIT']], pool: [['A', 70, 1, 1], ['B', 80, 2, 1]], disk: [['A', 100, 0], ['B', 50, 0]], flushed: 3, ack: 1, right: 'second run', sum: 'data pages not written yet (NO-FORCE)' }, stats: [{ l: 'flushedLSN', v: '3', cls: 'ok' }, { l: 'pages written', v: '0' }] },
      { log: 'Power fails again, before either data page is written. Memory is gone, and the disk pages still hold the old balances. The log holds the committed transfer.', callout: 'Crash after commit: pages are stale', code: 4,
        state: { logDisk: [['L1', 'A:100>70'], ['L2', 'B:50>80'], ['L3', 'COMMIT']], pool: [['A', 70, 1, 1], ['B', 80, 2, 1]], disk: [['A', 100, 0], ['B', 50, 0]], flushed: 3, crash: 1, lost: 1, right: 'second run', sum: 'disk 100 + 50, log says: committed' }, stats: [{ l: 'client was told', v: 'committed', cls: 'ok' }, { l: 'pages on disk', v: 'old', cls: 'warn' }] },
      { log: 'Recovery redoes L1 and L2 from the log, because pageLSN on disk is lower than their LSNs. The committed transfer is durable even though no data page was written.', callout: 'Redo from the log: the transfer survives', code: 4,
        state: { logDisk: [['L1', 'A:100>70'], ['L2', 'B:50>80'], ['L3', 'COMMIT']], disk: [['A', 70, 1], ['B', 80, 2]], flushed: 3, diskTone: { A: 'ok', B: 'ok' }, right: 'second run recovered', sum: 'after redo: 70 + 80 = 150' }, stats: [{ l: 'total', v: '150', cls: 'ok' }, { l: 'transfer', v: 'durable', cls: 'ok' }],
        takeaway: 'The log reaches disk first. Undo cleans up uncommitted work, redo restores committed work, and both come from the log.' },
    ],
  };

  /* ---- 3. WAL segments: the checkpoint and a stalled replication slot decide which segments can be recycled ---- */
  const SX = i => 30 + (i % 8) * 74, SY = i => 112 + Math.floor(i / 8) * 70;
  const segs = {
    id: 'wal-segments', label: 'WAL segments pinned', desc: 'Sixteen WAL segments in a ring. Segments behind both the last checkpoint and the slowest replication slot can be recycled. A stalled slot pins them all (sizes illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      '-- WAL is written in segments of 16 MB; the head advances as transactions commit',
      'a checkpoint at segment 6 makes everything before it unnecessary for crash recovery',
      'checkpoint_timeout = 5min, checkpoint_completion_target = 0.9   -- spread the page writes',
      "SELECT slot_name, active, restart_lsn FROM pg_replication_slots;   -- CDC consumer stopped",
      'max_slot_wal_keep_size = 50GB   -- cap what a slot may pin',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 16 segments, one checkpoint, one replication slot. Illustrative.',
      header: s => ({ left: 'segments kept ' + (s.kept == null ? '-' : s.kept) + ' of 16', right: s.right || '' }),
      draw(P, s) {
        const head = s.head == null ? 0 : s.head, floor = Math.min(s.ckpt == null ? 0 : s.ckpt, s.slot == null ? 99 : s.slot);
        for (let i = 0; i < 16; i++) {
          let tone = 'info', label = String(i + 1);
          if (i <= head) tone = i < floor ? 'delete' : 'ok';
          if (i > head) tone = 'info';
          if (s.full && i <= head && i >= floor) tone = 'bad';
          P.box('sg' + i, { x: SX(i), y: SY(i), w: 68, h: 44, tone, label, cls: 'sm', dash: i < floor && i <= head, op: i < floor && i <= head ? 0.55 : 1 });
        }
        const mark = (id, i, text, tone, row) => P.chip(id, { x: SX(i) - 2, y: SY(i) + 48 + (row || 0) * 0, w: 74, h: 26, label: text, tone, small: true, r: 4 });
        if (s.head != null) mark('mh', head, 'head', 'cursor', 0);
        if (s.ckpt != null) P.chip('mc', { x: SX(s.ckpt) - 2, y: SY(s.ckpt) - 28, w: 74, h: 24, label: 'checkpoint', tone: 'ok', small: true, r: 4 });
        if (s.slot != null) P.chip('ms', { x: SX(s.slot) - 2, y: SY(s.slot) - 28, w: 74, h: 24, label: 'slot', tone: s.slotTone || 'warn', small: true, r: 4 });
        if (s.note) P.chip('nt', { x: 30, y: 292, w: 580, h: 34, label: s.note, sub: s.noteSub || '', tone: s.noteTone || 'warn' });
      }
    }),
    bug: [
      { log: 'WAL is written in segments. The write head is at segment 4, and nothing behind it has been recycled yet.', callout: 'The head fills segments in order', code: 0,
        state: { head: 3, kept: 4 }, stats: [{ l: 'segments used', v: '4' }] },
      { log: 'A checkpoint completes at segment 6. Crash recovery never needs anything before it, so segments 1 to 5 can be recycled.', callout: 'The checkpoint frees segments behind it', code: 1,
        state: { head: 7, ckpt: 5, kept: 3, note: 'segments 1 to 5 recycled', noteTone: 'ok' }, stats: [{ l: 'kept', v: '3', cls: 'ok' }, { l: 'recycled', v: '5', cls: 'ok' }] },
      { log: 'The checkpoint has to write every dirty page. Written all at once it is an I/O burst, and p99 latency spikes. Spreading the writes over 90% of the interval flattens it.', callout: 'A checkpoint writes the dirty pages', code: 2,
        state: { head: 7, ckpt: 5, kept: 3, note: 'write all at once: spike. Spread over the interval: flat', noteTone: 'warn', right: 'checkpoint I/O' }, stats: [{ l: 'burst', v: 'p99 spike', cls: 'warn' }, { l: 'fix', v: 'spread writes', cls: 'ok' }] },
      { log: 'A change-data-capture consumer stopped some time ago. Its replication slot still points at segment 2, because the primary must keep what the slot has not yet read.', callout: 'A stalled slot points at segment 2', moment: true, code: 3,
        state: { head: 7, ckpt: 5, slot: 1, kept: 7, note: 'slot: restart_lsn at segment 2, consumer stopped', noteTone: 'bad' }, stats: [{ l: 'slot', v: 'stalled', cls: 'bad' }, { l: 'kept', v: '7', cls: 'warn' }] },
      { log: 'The head keeps advancing and checkpoints keep passing, but nothing behind the slot can be recycled. Segments pile up behind it.', callout: 'Nothing behind the slot can be recycled', code: 3,
        state: { head: 12, ckpt: 10, slot: 1, kept: 12, note: 'checkpoint at 11, but the slot holds segments 2 to 13', noteTone: 'bad' }, stats: [{ l: 'kept', v: '12', cls: 'bad' }, { l: 'disk used', v: '75%', cls: 'warn' }] },
      { log: 'The disk fills with WAL. Queries stayed fast, the database looked healthy, and now writes stop because there is no room for the next segment.', callout: 'Disk full of WAL: writes stop', code: 3,
        state: { head: 15, ckpt: 13, slot: 1, kept: 15, full: 1, note: 'No space left on device while writing WAL', noteSub: 'primary stops accepting writes', noteTone: 'bad', right: 'disk full' }, stats: [{ l: 'kept', v: '15 of 16', cls: 'bad' }, { l: 'writes', v: 'blocked', cls: 'bad' }] },
      { log: 'Drop the slot, or cap it with max_slot_wal_keep_size. The segments behind the checkpoint are recycled at once, and the primary recovers.', callout: 'Drop or cap the slot: segments are recycled', code: 4,
        state: { head: 15, ckpt: 13, kept: 3, note: 'slot dropped: segments 1 to 13 recycled', noteTone: 'ok' }, stats: [{ l: 'kept', v: '3', cls: 'ok' }, { l: 'writes', v: 'resume', cls: 'ok' }],
        takeaway: 'The oldest thing still needed, a checkpoint or a slow consumer, decides how much WAL stays. Monitor slots as well as disk.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A payments database moves 30 from account A to account B. The host loses power in the middle of the transfer. After restart, <code>SUM(balance)</code> is 120 instead of 150 (illustrative). Thirty units have left A and never arrived in B, and nothing in the log mentions the transfer.",
    "predict": {
      "q": "Now assume the log records for the transfer were flushed before page A was written. Power fails after page A is on disk, before the COMMIT. What should recovery do?",
      "opts": [
        "Undo the transfer from the logged before values, so A is 100 and B is 50",
        "Redo the rest of the transfer, so A is 70 and B is 80",
        "Leave A at 70, because pages on disk are always trusted",
        "Stop and wait for an operator to fix the balances by hand"
      ],
      "ans": 0,
      "why": "The transfer never wrote a durable COMMIT record, so it is a loser and must be undone. The log holds the before values, so recovery can restore A to 100, and the total is 150 again."
    },
    "diagnose": [
      {
        "t": "Acknowledged before durable",
        "sym": "The client shows success, but after a restart the transfer has disappeared.",
        "ctx": "The server crashed or lost power shortly after it replied OK to the client.",
        "why": "The database must not tell the client that a transaction committed until its COMMIT record is on stable storage. If the server replies first, a crash can erase a commit the client was told about.",
        "log": "-- representative application log\nINFO  transfer ok  txn=T1  account=1842 -> 2291  amount=30\n-- after a restart, the same transfer is missing from the log and the balances",
        "fix": [
          "Measure first: compare the transfers the application logged as ok with the rows present after the restart.",
          "Fix: reply to the client only after the commit flush returns. The server must wait for the WAL sync before it sends OK.",
          "Fix: if synchronous commit is turned off for speed, say so to the client: the reply then promises less.",
          "Fix: use group commit to share one flush among concurrent commits, so the wait stays short.",
          "Verify: kill the server right after OK is sent in a test. The transfer must be present after restart, every time."
        ]
      },
      {
        "t": "Checkpoint I/O burst",
        "sym": "p99 latency spikes every few minutes, exactly when the checkpoint runs.",
        "ctx": "The latency graph has regular spikes that line up with checkpoint lines in the server log.",
        "why": "A blocking checkpoint writes every dirty page at once, and transactions wait while it runs. The write burst fills the device queue, and everyone pays the latency.",
        "log": "-- representative PostgreSQL server log, counts illustrative\nLOG:  checkpoint starting: time\nLOG:  checkpoint complete: wrote 412000 buffers (12.3%); write=268.4 s, sync=3.1 s",
        "fix": [
          "Measure first: line up the checkpoint starting and checkpoint complete log lines with the p99 latency graph, and read the buffers written and the write and sync times.",
          "Fix: use a fuzzy checkpoint: record the dirty page table and the active transactions, and let work continue during the flush.",
          "Fix: spread the writes: let the background writer flush a steady number of pages per tick, so no single tick takes the whole burst.",
          "Fix: set the checkpoint interval so that recovery time is acceptable, and no more often than the device can absorb.",
          "Verify: the peak write count per second and the p99 latency should both fall, while the recovery time stays within target."
        ]
      },
      {
        "t": "Stalled replication slot",
        "sym": "Disk fills with WAL while the primary looks healthy and queries stay fast.",
        "ctx": "A change-data-capture consumer stopped some time ago, and its slot is still defined on the primary.",
        "why": "Representative of PostgreSQL slot behavior, not from the course text: a replication or change-data-capture slot keeps the WAL it has not consumed. A stopped consumer keeps its slot, so the server cannot recycle the WAL, and the directory grows until it is full.",
        "log": "-- representative PostgreSQL 16 output\nslot_name   | active | restart_lsn | wal_status\norders_cdc  | f      | 3A/0F2C1000 | extended",
        "fix": [
          "Measure first: list the replication slots and check active, restart_lsn and wal_status. An inactive slot with an old restart_lsn is holding WAL.",
          "Fix: alert on inactive slots and on retained WAL bytes, not only on query latency.",
          "Fix: set a limit on retained WAL, so a stuck consumer loses its slot instead of filling the disk.",
          "Fix: make consumers resume from the slot position, and fix the consumer before the disk is at risk.",
          "Verify: stop a test consumer. The alert fires, and the retained WAL stays within the limit."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L20 Database Logging (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/20-logging.pdf' };

  /* ---- 2. STEAL and FORCE: the two buffer-pool policies that decide what recovery must do ---- */
  const CELLS = [
    { r: 0, c: 0, title: 'NO-STEAL + FORCE', undo: 'no undo', redo: 'no redo', perf: ['slow: every commit writes pages;', 'a transaction must fit in memory'], tone: 'warn' },
    { r: 0, c: 1, title: 'NO-STEAL + NO-FORCE', undo: 'no undo', redo: 'redo needed', perf: ['commit is fast, but dirty pages', 'of running transactions pin memory'], tone: 'info' },
    { r: 1, c: 0, title: 'STEAL + FORCE', undo: 'undo needed', redo: 'no redo', perf: ['commit writes all its pages;', 'uncommitted pages may be on disk'], tone: 'info' },
    { r: 1, c: 1, title: 'STEAL + NO-FORCE', undo: 'undo needed', redo: 'redo needed', perf: ['fastest at run time:', 'what WAL with ARIES uses'], tone: 'ok' },
  ];
  const stealForce = {
    id: 'steal-force', label: 'STEAL and FORCE', desc: 'Two questions about the buffer pool. STEAL: may it write a dirty page of an uncommitted transaction to disk? FORCE: must it write all changed pages at commit? The answers decide whether recovery needs undo, redo or both (policies as defined in the lecture).',
    codeLabel: 'Policies',
    code: { bug: [
      'STEAL: a page changed by an uncommitted transaction may be written to disk to free a frame',
      'FORCE: at commit, every page the transaction changed is written to disk first',
      'NO-STEAL + FORCE: nothing uncommitted reaches disk, everything committed does: no undo, no redo',
      'NO-STEAL + NO-FORCE: committed changes may not be on disk: redo needed',
      'STEAL + FORCE: uncommitted changes may be on disk: undo needed',
      'STEAL + NO-FORCE: both: needs a log, and is the fastest. This is what real systems use',
    ] },
    stage: DB.stage({
      footer: 'Simplified: the four combinations. Qualitative.',
      header: s => ({ left: s.hl || 'what recovery must do', right: '' }),
      draw(P, s) {
        P.text('c0', { x: 190, y: 90, t: 'FORCE at commit', cls: 'sm' }); P.text('c1', { x: 420, y: 90, t: 'NO-FORCE at commit', cls: 'sm' });
        P.text('r0', { x: 14, y: 170, t: 'NO-STEAL', cls: 'sm' }); P.text('r1', { x: 14, y: 284, t: 'STEAL', cls: 'sm' });
        CELLS.forEach((c, i) => { if (i >= (s.n || 0)) return; P.box('b' + i, { x: 110 + c.c * 240, y: 102 + c.r * 112, w: 226, h: 104, tone: s.pick === i ? 'ok' : (c.tone === 'warn' ? 'warn' : 'info'), label: '', sw: s.pick === i ? 3 : 1.4 });
          P.text('t' + i, { x: 120 + c.c * 240, y: 122 + c.r * 112, t: c.title, cls: 'sm' });
          P.text('u' + i, { x: 120 + c.c * 240, y: 142 + c.r * 112, t: c.undo + ' · ' + c.redo, cls: 'xs' });
          c.perf.forEach((ln, k) => P.text('p' + i + k, { x: 120 + c.c * 240, y: 168 + k * 14 + c.r * 112, t: ln, cls: 'xs mut' })); });
      }
    }),
    bug: [
      { log: 'The two questions combine into four policies. A policy decides what is on disk after a crash, and therefore what recovery has to repair.', callout: 'Two questions, four combinations', code: 0, state: { n: 0 }, stats: [{ l: 'policies', v: '4' }] },
      { log: 'NO-STEAL with FORCE is the simplest. Uncommitted data never reaches disk, and everything committed is already there, so after a crash there is nothing to undo or redo. It is slow, and a transaction cannot be larger than memory.', callout: 'NO-STEAL + FORCE: simple and slow', code: 2, state: { n: 1 }, stats: [{ l: 'recovery work', v: 'none', cls: 'ok' }, { l: 'run time', v: 'slow', cls: 'bad' }] },
      { log: 'NO-FORCE lets commit return without writing the pages, which is fast, but a committed change may exist only in memory when the power fails. Recovery must redo it from a log.', callout: 'NO-FORCE: committed data may be missing', code: 3, state: { n: 2 }, stats: [{ l: 'recovery needs', v: 'redo', cls: 'warn' }] },
      { log: 'STEAL lets the buffer pool write a dirty page of a running transaction to free a frame. A crash can then leave uncommitted changes on disk, and recovery must undo them.', callout: 'STEAL: uncommitted data may be on disk', code: 4, state: { n: 3 }, stats: [{ l: 'recovery needs', v: 'undo', cls: 'warn' }] },
      { log: 'Steal and no-force together give the best run-time speed: the pool writes pages when it likes and commits are cheap. Recovery must then both undo losers and redo winners, and that is what the log is for.', callout: 'STEAL + NO-FORCE: fast, needs undo and redo', moment: true, code: 5, state: { n: 4, pick: 3 }, stats: [{ l: 'recovery needs', v: 'undo + redo', cls: 'warn' }, { l: 'run time', v: 'fastest', cls: 'ok' }],
        takeaway: 'Real systems steal and do not force, because it is fast, and use a write-ahead log so recovery can undo and redo.' },
    ],
  };

  /* ---- 3. Group commit: one log flush can acknowledge several commits ---- */
  const GX0 = 100, GU = 20;
  const ARR = [0, 1, 2, 3, 5, 6];
  const gy = i => 98 + i * 28;
  const lbar = (i, a, b, tone, label) => ({ i, a, b, tone, label });
  const gcs = {
    id: 'group-commit', label: 'Group commit', desc: 'Six transactions commit at times 0, 1, 2, 3, 5 and 6. Each commit must wait for a log flush that takes 4 time units. One flush per commit queues them up. Flushing everything that has arrived serves several commits at once (times illustrative).',
    codeLabel: 'Timeline',
    code: { bug: [
      'each COMMIT needs the log on disk before it is acknowledged: one fsync of 4 units',
      'without batching: a flush per commit, one after another: 6 flushes',
      'T1 waits 4, T2 waits 7, T3 10, T4 13, T5 15, T6 18: average 11.2',
      'group commit: while a flush runs, new commits queue; the next flush covers them all',
      '3 flushes: T1 alone, T2 to T4 together, T5 and T6 together: average 5.8',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 6 commits, each flush takes 4 units. Illustrative.',
      header: s => ({ left: s.hl || 'commit arrival and log flushes', right: s.rt || '' }),
      draw(P, s) {
        for (let t = 0; t <= 24; t += 4) { P.line('g' + t, GX0 + t * GU, 90, GX0 + t * GU, 292, { tone: 'mut', sw: 0.6, dash: true }); P.text('gt' + t, { x: GX0 + t * GU, y: 306, t: String(t), cls: 'mut xs', anchor: 'middle' }); }
        ARR.forEach((a, i) => { P.text('n' + i, { x: 14, y: gy(i) + 18, t: 'T' + (i + 1) + ' commits', cls: 'mut xs' }); P.box('ar' + i, { x: GX0 + a * GU - 3, y: gy(i) + 4, w: 6, h: 18, tone: 'cursor', label: '' }); });
        P.text('nd', { x: 14, y: 284, t: 'log flushes', cls: 'sm' });
        (s.waits || []).forEach(([i, a, b]) => P.box('w' + i, { x: GX0 + a * GU, y: gy(i) + 8, w: Math.max(2, (b - a) * GU), h: 10, tone: 'mut', label: '', dash: true }));
        (s.acks || []).forEach(([i, t]) => P.chip('k' + i, { x: GX0 + t * GU - 4, y: gy(i) + 2, w: 56, h: 22, label: 'ack ' + t, sub: '', tone: 'ok', small: true }));
        (s.flush || []).forEach(([a, b, l], k) => P.box('f' + k, { x: GX0 + a * GU, y: 262, w: (b - a) * GU - 2, h: 28, tone: 'warn', label: l, cls: 'xs' }));
      }
    }),
    bug: [
      { log: 'Six transactions finish their work and call COMMIT at different times. A commit is acknowledged only after its log records are durable on disk.', callout: 'Six commits arrive', code: 0, state: {}, stats: [{ l: 'commits', v: '6' }] },
      { log: 'Without batching each commit gets its own flush, and flushes run one at a time. T2 arrives at 1 but the disk is busy until 4, and the queue grows: the last commit waits 18 units.', callout: 'A flush per commit: a queue', moment: true, code: 2, state: { waits: [[1, 1, 4], [2, 2, 8], [3, 3, 12], [4, 5, 16], [5, 6, 20]], flush: [[0, 4, 'F1'], [4, 8, 'F2'], [8, 12, 'F3'], [12, 16, 'F4'], [16, 20, 'F5'], [20, 24, 'F6']], acks: [[0, 4], [1, 8], [2, 12], [3, 16], [4, 20], [5, 24]] }, stats: [{ l: 'flushes', v: '6', cls: 'bad' }, { l: 'average wait', v: '11.2', cls: 'bad' }] },
      { log: 'With group commit, commits that arrive while a flush is running wait in a batch. T1 flushes alone. At 4, T2, T3 and T4 are waiting, so one flush covers all three.', callout: 'The next flush covers everyone waiting', code: 3, state: { waits: [[1, 1, 4], [2, 2, 4], [3, 3, 4]], flush: [[0, 4, 'F1'], [4, 8, 'F2: T2 T3 T4']], acks: [[0, 4], [1, 8], [2, 8], [3, 8]] }, stats: [{ l: 'flushes so far', v: '2', cls: 'ok' }] },
      { log: 'T5 and T6 arrive during the second flush and are served together by the third. Three flushes serve six commits, and the average wait falls from 11.2 to 5.8.', callout: 'Three flushes for six commits', code: 4, state: { waits: [[1, 1, 4], [2, 2, 4], [3, 3, 4], [4, 5, 8], [5, 6, 8]], flush: [[0, 4, 'F1'], [4, 8, 'F2: T2 T3 T4'], [8, 12, 'F3: T5 T6']], acks: [[0, 4], [1, 8], [2, 8], [3, 8], [4, 12], [5, 12]] }, stats: [{ l: 'flushes', v: '3', cls: 'ok' }, { l: 'average wait', v: '5.8', cls: 'ok' }],
        takeaway: 'Group commit trades a small wait for far fewer fsyncs. The busier the system, the bigger each batch.' },
    ],
  };

  const EXPLAIN = `
<h3>1. What crash recovery is for</h3>
<p>A DBMS must survive a crash at any instant. <b>Recovery</b> is a set of algorithms with two parts: actions during normal execution that make recovery possible, and actions after a crash that restore a state with atomicity and durability. The failure case in the lecture: a transfer of 30 from A to B writes page A to disk, the power fails before page B is written, and without a log the database now holds 120 instead of 150. Atomicity says the transfer must happen entirely or not at all, and durability says that once committed it must survive. Both need a record of intent kept on stable storage.</p>

<h3>2. Buffer pool policies: STEAL and FORCE</h3>
<p>The buffer pool (chapter 3) can behave in four ways, defined by two questions. <b>STEAL</b>: may it write a dirty page of an uncommitted transaction to disk to free a frame? <b>FORCE</b>: must it write every page a transaction changed before the commit returns? NO-STEAL with FORCE is the simplest, because nothing uncommitted reaches disk and everything committed is there, so recovery has nothing to do. But it writes a lot at commit and a transaction cannot be larger than memory. STEAL with NO-FORCE is the fastest at run time, and it requires recovery to both <b>undo</b> changes of transactions that did not commit and <b>redo</b> changes of committed ones that were never written. That needs a log.</p>

<h3>3. Alternatives to a log</h3>
<p><b>Shadow paging</b> copies a page before changing it. Updates go to the copy, and at commit a pointer from the old tree (the master) to the new tree (the shadow) is swapped. Nothing needs undoing, but every commit copies pages, pages are scattered so sequential scans suffer, and it is hard to support many concurrent writers. SQLite once had a related <b>journal file</b>: before a page changes, its original contents go to a journal, and recovery copies them back. These are used in small systems. Large systems use a write-ahead log.</p>

<h3>4. Write-ahead logging</h3>
<p>In <b>write-ahead logging</b> (WAL) the DBMS first appends records describing each change to a log on stable storage, and only then may it write the changed page. The protocol: every change adds a log record in a memory buffer; before a dirty page is written to disk, all log records up to that page&rsquo;s LSN (log sequence number) must be flushed; when a transaction commits, its COMMIT record and all earlier records are flushed, and only then is the client told it is committed. The log is written sequentially, which is cheap, while data pages are written later in whatever order is convenient. A record has a transaction ID, an object ID, and the before and after values: the before value for undo and the after value for redo.</p>
<figure class="mm" aria-label="Sequence diagram of the write-ahead protocol: log first, commit after flush, page later" style="--diagram-width:889px">
  <img src="diagrams/ch23-wal-protocol.svg" alt="Sequence diagram: a transaction updates a page in the buffer pool, appends a log record with LSN 41 and a commit record with LSN 42. The buffer pool flushes the log up to LSN 42 and only then the client is told committed. The dirty page is written later, only after the log up to its LSN is on disk.">
  <figcaption>Sequence: the log reaches disk before the commit is acknowledged and before the page is written.</figcaption>
</figure>

<h3>5. Group commit and logging schemes</h3>
<p>A flush to disk takes milliseconds, so one flush per commit would limit throughput. <b>Group commit</b> buffers log records from several transactions and flushes them together, either when the buffer is full or after a short timeout. Logging schemes decide what a record contains. <b>Physical logging</b> records the exact byte changes of a page: precise and large. <b>Logical logging</b> records the operation, such as the SQL statement: small, but replaying it must give the same result, which concurrent changes and non-deterministic functions can break. <b>Physiological logging</b> is the common compromise: it names the page physically and the change logically (page 17, slot 5, set this column).</p>
<figure class="mm" aria-label="Three logging schemes for one UPDATE: physical, logical and physiological" style="--diagram-width:552px">
  <img src="diagrams/ch23-log-schemes.svg" alt="Tree: for one UPDATE statement, physical logging records byte changes at a page offset, which is exact, large and without meaning; logical logging records the SQL statement itself, which is small and hard to replay exactly; physiological logging records the page, slot and the column change, which is the usual choice.">
  <figcaption>Tree: three ways to log the same update.</figcaption>
</figure>

<h3>6. Checkpoints</h3>
<p>Without a checkpoint, recovery would have to read the log from the beginning. A <b>checkpoint</b> writes the dirty pages to disk, so recovery can start from it. The simple form stops all work, flushes everything and writes a CHECKPOINT record. Practical systems take <b>fuzzy checkpoints</b> that record which transactions are active and which pages are dirty while the system keeps running (chapter 25). The checkpoint also decides which log segments can be recycled: the log cannot be discarded before the oldest change that is still needed by recovery or by a replica. The frequency is a trade-off: frequent checkpoints shorten recovery and cause write bursts, rare ones do the reverse.</p>

<h3>7. The trade-off</h3>
<p>WAL turns random page writes into sequential log writes and makes commits cheap. It costs the log itself: write volume (a full-page image after each checkpoint, in PostgreSQL), disk space for segments, and a fsync on the commit path. Settings such as <code>synchronous_commit = off</code> trade durability of the last moments for speed, and a bad one acknowledges before the log is durable.</p>

<h3>8. Syntax</h3>
<pre>-- PostgreSQL: where the log is, and how far it has been flushed
SELECT pg_current_wal_lsn(), pg_current_wal_flush_lsn();

-- commit durability: on is safe, off may lose the last moments but never corrupts
SHOW synchronous_commit;
SET synchronous_commit = on;

-- group commit tuning
SHOW commit_delay;  SHOW commit_siblings;

-- checkpoint spacing and spreading
SHOW max_wal_size;  SHOW checkpoint_timeout;  SHOW checkpoint_completion_target;
CHECKPOINT;   -- force one now

-- what keeps WAL segments from being recycled (replication slots)
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;</pre>
<p>A <code>retained</code> value of many GB on an inactive slot is the sign of a stalled consumer filling the disk.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A payments service acknowledges a transfer to the client and, minutes later, the host loses power. After the restart the transfer is gone. Separately, p99 latency spikes every few minutes in step with checkpoints, and on another cluster the disk fills with log files while the primary looks healthy and queries stay fast (illustrative).`,
    predict: {
      q: `A transaction commits. The DBMS appends the commit record to the log buffer in memory and immediately returns success to the client. The power fails a moment later. What happens to the transaction after restart?`,
      opts: [
        `It is lost, although the client was told it committed: the log record never reached disk`,
        `It survives, because the buffer pool is saved to disk on power loss`,
        `It is redone from the data pages, which were forced at commit`,
        `It is rolled back and the client is told automatically`
      ],
      ans: 0,
      why: `Durability needs the commit record on stable storage before the acknowledgment. A record that lives only in the memory buffer disappears with the power. Write-ahead logging requires a log flush (fsync) before the client sees a commit.`
    },
    diagnose: [
      OLD.diagnose[0],
      OLD.diagnose[1],
      OLD.diagnose[2]
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[23] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [wal, stealForce, gcs, segs] };
})();
