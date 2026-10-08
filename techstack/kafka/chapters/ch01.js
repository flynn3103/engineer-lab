/* Chapter 1 "Log Crash Recovery": scenes and Explain override (index 1, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: restart after kill -9 versus a controlled shutdown, a CRC failure on a follower, and why acks=all is not an fsync.
   Offsets, counts and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Restart: kill -9 leaves an unflushed tail to check, a clean stop leaves nothing ---- */
  const FOOT_RESTART = 'Simplified: one partition of 3,000, ten batches, offsets illustrative.';
  const OFFS = ['4160', '4170', '4180', '4190', '4200', '4210', '4220', '4230', '4240', '4250'];
  const fx = i => 24 + 58 * i;
  const FR = {};
  OFFS.forEach((o, i) => { FR['f' + i] = { label: o, sub: 'batch', tone: 'info', w: 54, h: 44 }; });
  const frames = over => Object.fromEntries(OFFS.map((_, i) => ['f' + i, { x: fx(i), y: 100, ...(over && over[i] ? over[i] : {}) }]));
  const flushedOK = () => Object.fromEntries(OFFS.map((_, i) => [i, i < 4 ? { tone: 'ok', sub: 'disk' } : { tone: 'warn', sub: 'cache' }]));
  const restart = {
    id: 'restart', label: 'Clean stop vs kill -9', desc: 'A clean stop writes a marker and the next start skips recovery. A kill -9 forces a check of every batch past the recovery point (counts illustrative).',
    codeLabel: 'Broker log',
    code: {
      bug: [
        '# kill -9 on a pod with 3,000 replicas (illustrative)',
        '# no clean shutdown marker is written',
        '# recovery-point-offset-checkpoint: orders-0 = 4200',
        'INFO Recovering unflushed segment 4200 in log orders-0',
        '# walk each batch: length, then CRC; truncate at the first bad one',
        '# then rebuild missing or invalid index files',
      ],
      fix: [
        '# SIGTERM with controlled.shutdown.enable=true',
        '# leadership moves to the other replicas first',
        '# logs are flushed, the clean marker and checkpoint are written',
        '# next start: marker found, recovery skipped, nothing is scanned',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_RESTART, panels: [
      { id: 'lg', x: 16, y: 58, w: 614, h: 142, title: 'orders-0 active segment', tone: 'info' },
      { id: 'bk', x: 16, y: 212, w: 614, h: 136, title: 'Broker startup', tone: 'info' },
    ], tokens: {
      ...FR,
      rp: { label: 'recovery point 4200', sub: 'checkpoint file', tone: 'cursor', w: 190, h: 40 },
      mk: { label: 'clean marker', sub: 'absent', tone: 'bad', w: 130 },
      th: { label: 'recovery threads', sub: 'num.recovery.threads.per.data.dir', tone: 'info', w: 250 },
      ix: { label: 'indexes', sub: 'rebuilt from log', tone: 'info', w: 130 },
      ld: { label: 'leadership', sub: 'moved away', tone: 'ok', w: 130 },
    } },
    bug: [
      { log: 'The broker is killed with SIGKILL. The first four batches were flushed before. The six after the recovery point are in the page cache, and nobody knows what reached the disk.', callout: 'kill -9 gives no chance to flush', code: 0,
        at: { ...frames(flushedOK()), mk: { x: 28, y: 252 } }, stats: [{ l: 'replicas on the broker', v: '3,000 (illustrative)', cls: 'warn' }, { l: 'clean marker', v: 'absent', cls: 'bad' }] },
      { log: 'On restart the broker finds no clean shutdown marker, so it must run log recovery for every partition.', callout: 'No marker, so recovery runs', code: 1,
        at: { ...frames(flushedOK()), mk: { x: 28, y: 252 } }, stats: [{ l: 'recovery', v: 'required', cls: 'bad' }] },
      { log: 'It reads the recovery point from the checkpoint file: offset 4200. Everything before it was flushed and is trusted.', callout: 'Trust up to the recovery point', code: 2,
        at: { ...frames(flushedOK()), mk: { x: 28, y: 252 }, rp: { x: fx(4) - 20, y: 148 } }, stats: [{ l: 'trusted batches', v: '4', cls: 'ok' }, { l: 'to check', v: '6', cls: 'warn' }] },
      { log: 'Each batch after the recovery point is read, and its length and CRC are checked. The first one passes.', callout: 'Each later batch is checked', code: 4,
        at: { ...frames({ ...flushedOK(), 4: { tone: 'live', sub: 'check', hl: true } }), mk: { x: 28, y: 252 }, rp: { x: fx(4) - 20, y: 148 } }, stats: [{ l: 'checked', v: '1 of 6' }] },
      { log: 'The check walks on. Batches 4200 to 4230 are intact; the batch at 4240 was only half written when the process died.', callout: 'The check walks to the torn batch', code: 4,
        at: { ...frames({ ...flushedOK(), 4: { tone: 'ok', sub: 'valid' }, 5: { tone: 'ok', sub: 'valid' }, 6: { tone: 'ok', sub: 'valid' }, 7: { tone: 'ok', sub: 'valid' }, 8: { tone: 'bad', sub: 'torn', hl: true } }), mk: { x: 28, y: 252 }, rp: { x: fx(4) - 20, y: 148 } }, stats: [{ l: 'checked', v: '5 of 6' }, { l: 'first bad batch', v: '4240', cls: 'bad' }] },
      { log: 'The log is truncated at the first bad batch. The torn batch and what follows are cut, and the leader will send them again.', callout: 'Truncate at the first bad batch', moment: true, code: 4,
        at: { ...Object.fromEntries(OFFS.slice(0, 8).map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: i < 4 ? 'flushed' : 'valid' }])), mk: { x: 28, y: 252 }, rp: { x: fx(4) - 20, y: 148 } }, stats: [{ l: 'kept', v: '8 batches', cls: 'ok' }, { l: 'truncated', v: '2 batches', cls: 'warn' }] },
      { log: 'The broker also rebuilds the index files that are missing or invalid. Only num.recovery.threads.per.data.dir partitions recover at once.', callout: 'Indexes are rebuilt, few threads at a time', code: 5,
        at: { ...Object.fromEntries(OFFS.slice(0, 8).map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: 'valid' }])), mk: { x: 28, y: 252 }, th: { x: 170, y: 252 }, ix: { x: 430, y: 252 } }, stats: [{ l: 'recovery threads', v: '1 per data dir (default)', cls: 'warn' }] },
      { log: 'This is repeated for 3,000 partitions on a few threads. The broker needs about 40 minutes before it can serve (illustrative), and its partitions stay under-replicated.', callout: 'About 40 minutes before it serves', moment: true, code: 5,
        at: { ...Object.fromEntries(OFFS.slice(0, 8).map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: 'valid' }])), mk: { x: 28, y: 252 }, th: { x: 170, y: 252 }, ix: { x: 430, y: 252 } }, stats: [{ l: 'restart time', v: '40 min (illustrative)', cls: 'bad' }, { l: 'UnderReplicatedPartitions', v: '> 0', cls: 'bad' }],
        takeaway: 'After a kill the broker checks every batch past each recovery point. With thousands of partitions, that takes minutes.' },
    ],
    fix: [
      { log: 'The pod gets SIGTERM and the broker has controlled.shutdown.enable=true (the default). It starts a controlled shutdown.', callout: 'SIGTERM starts a controlled shutdown', code: 0,
        at: { ...frames(flushedOK()), mk: { x: 28, y: 252 } }, stats: [{ l: 'shutdown', v: 'controlled', cls: 'ok' }] },
      { log: 'Before it stops, leadership of its partitions moves to the other replicas, so producers see only a short leader change.', callout: 'Leadership moves away first', code: 1,
        at: { ...frames(flushedOK()), mk: { x: 28, y: 252 }, ld: { x: 170, y: 252 } }, stats: [{ l: 'leaders on this broker', v: '0', cls: 'ok' }] },
      { log: 'The logs are flushed. All ten batches are on disk and the recovery point moves to the end of the log.', callout: 'The logs are flushed', code: 2,
        at: { ...Object.fromEntries(OFFS.map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: 'disk' }])), mk: { x: 28, y: 252, tone: 'warn', sub: 'write' }, ld: { x: 170, y: 252 } }, stats: [{ l: 'unflushed batches', v: '0', cls: 'ok' }] },
      { log: 'The clean shutdown marker is written. It is the broker’s promise that the files match the checkpoint.', callout: 'The clean marker is written', code: 2,
        at: { ...Object.fromEntries(OFFS.map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: 'disk' }])), mk: { x: 28, y: 252, tone: 'ok', sub: 'written' }, ld: { x: 170, y: 252 } }, stats: [{ l: 'clean marker', v: 'written', cls: 'ok' }] },
      { log: 'On the next start the broker finds the marker and skips log recovery. It only loads the logs.', callout: 'The next start skips recovery', moment: true, code: 3,
        at: { ...Object.fromEntries(OFFS.map((_, i) => ['f' + i, { x: fx(i), y: 100, tone: 'ok', sub: 'trusted' }])), mk: { x: 28, y: 252, tone: 'ok', sub: 'found' } }, stats: [{ l: 'restart time', v: 'seconds (illustrative)', cls: 'ok' }, { l: 'batches scanned', v: '0', cls: 'ok' }],
        takeaway: 'Let the process stop cleanly: the grace period must cover a controlled shutdown, or the long recovery returns.' },
    ],
  };

  /* ---- 2. A bad block: the CRC check stops the read, and the copy is replaced from the leader ---- */
  const FOOT_CRC = 'Simplified: six batches per replica, offsets illustrative.';
  const CO = ['4200', '4205', '4210', '4215', '4220', '4225'];
  const cx = i => 28 + 62 * i;
  const CFR = {};
  CO.forEach((o, i) => { CFR['l' + i] = { label: o, sub: 'lead', tone: 'ok', w: 56, h: 44 }; CFR['f' + i] = { label: o, sub: 'copy', tone: 'info', w: 56, h: 44 }; });
  const lead = () => Object.fromEntries(CO.map((_, i) => ['l' + i, { x: cx(i), y: 100 }]));
  const foll = over => Object.fromEntries(CO.map((_, i) => ['f' + i, { x: cx(i), y: 224, ...(over && over[i] ? over[i] : {}) }]));
  const crc = {
    id: 'crc', label: 'Bad batch and CRC', desc: 'A bad disk block fails the CRC check. The follower cannot read past it until the copy is replaced from the leader (offsets illustrative).',
    codeLabel: 'Broker log',
    code: {
      bug: [
        '# disk writes a bad block into a closed segment (illustrative)',
        '# follower reads offset 4210: CRC mismatch',
        'CorruptRecordException: Record is corrupt (stored crc = 3053437206, computed crc = 1190349371)',
        '# the replica stays out of the ISR',
      ],
      fix: [
        '# measure: check disk health, then dump the segment',
        'kafka-dump-log.sh --files 00000000000000004200.log',
        '# remove the bad copy; the follower fetches it again from the leader',
        '# the replica catches up and rejoins the ISR',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_CRC, panels: [
      { id: 'ld', x: 16, y: 58, w: 410, h: 106, title: 'Leader log (healthy)', tone: 'info' },
      { id: 'fo', x: 16, y: 182, w: 410, h: 166, title: 'Follower log (one bad block)', tone: 'info' },
      { id: 'is', x: 440, y: 58, w: 190, h: 290, title: 'In-sync replicas', tone: 'info' },
    ], tokens: {
      ...CFR,
      isr: { label: 'ISR', sub: '{leader, follower}', tone: 'ok', w: 160 },
      err: { label: 'CRC mismatch', sub: 'at offset 4210', tone: 'bad', w: 160 },
      dump: { label: 'dump log', sub: 'first bad: 4210', tone: 'warn', w: 160 },
    } },
    bug: [
      { log: 'The follower and the leader hold the same six batches. The follower is in the in-sync replica set.', callout: 'Two healthy copies in the ISR', code: 0,
        at: { ...lead(), ...foll(), isr: { x: 455, y: 110 } }, stats: [{ l: 'healthy copies', v: '2', cls: 'ok' }] },
      { log: 'A failing disk writes a bad block into the follower’s segment. Nothing reports it, because the bytes are only read when someone needs them.', callout: 'A bad block, and nobody knows yet', code: 0,
        at: { ...lead(), ...foll({ 2: { tone: 'bad', sub: 'bad' } }), isr: { x: 455, y: 110 } }, stats: [{ l: 'bad batches', v: '1', cls: 'bad' }] },
      { log: 'The follower reads offset 4210 again, for example while a consumer fetches from it or after a restart. The stored CRC does not match the one computed from the bytes.', callout: 'Stored CRC and computed CRC differ', moment: true, code: 2,
        at: { ...lead(), ...foll({ 2: { tone: 'bad', sub: 'bad', hl: true } }), isr: { x: 455, y: 110 }, err: { x: 455, y: 190 } }, stats: [{ l: 'CRC', v: 'mismatch', cls: 'bad' }] },
      { log: 'The read fails instead of serving bad bytes. The follower cannot move past offset 4210.', callout: 'The read fails, not the data', code: 2,
        at: { ...lead(), ...foll({ 2: { tone: 'bad', sub: 'bad' }, 3: { tone: 'delete', sub: 'wait' }, 4: { tone: 'delete', sub: 'wait' }, 5: { tone: 'delete', sub: 'wait' } }), isr: { x: 455, y: 110 }, err: { x: 455, y: 190 } }, stats: [{ l: 'follower', v: 'stuck at 4205', cls: 'bad' }] },
      { log: 'The follower falls behind the leader, so the leader removes it from the ISR. The partition now has one healthy copy.', callout: 'The follower leaves the ISR', code: 3,
        at: { ...lead(), ...foll({ 2: { tone: 'bad', sub: 'bad' }, 3: { tone: 'delete', sub: 'wait' }, 4: { tone: 'delete', sub: 'wait' }, 5: { tone: 'delete', sub: 'wait' } }), isr: { x: 455, y: 110, tone: 'warn', sub: '{leader}' }, err: { x: 455, y: 190 } }, stats: [{ l: 'healthy copies', v: '1', cls: 'warn' }, { l: 'UnderReplicatedPartitions', v: '> 0', cls: 'bad' }],
        takeaway: 'The CRC check turns silent corruption into a failed read. A bad log segment must be replaced from a healthy copy.' },
    ],
    fix: [
      { log: 'Measure first: check the disk health and dump the segment. The dump shows the first bad batch.', callout: 'Measure: find the first bad batch', code: 1,
        at: { ...lead(), ...foll({ 2: { tone: 'bad', sub: 'bad' }, 3: { tone: 'delete', sub: 'wait' }, 4: { tone: 'delete', sub: 'wait' }, 5: { tone: 'delete', sub: 'wait' } }), isr: { x: 455, y: 110, tone: 'warn', sub: '{leader}' }, dump: { x: 455, y: 190 } }, stats: [{ l: 'first bad batch', v: 'offset 4210', cls: 'warn' }] },
      { log: 'The damaged copy is removed from the follower. The leader’s copy is the source of truth, and the disk is replaced if it keeps failing.', callout: 'Drop the damaged copy', code: 2,
        at: { ...lead(), isr: { x: 455, y: 110, tone: 'warn', sub: '{leader}' } }, stats: [{ l: 'follower data', v: 'removed', cls: 'warn' }] },
      { log: 'The follower fetches the partition again from the leader. The batches arrive in order and each one passes its CRC.', callout: 'The leader sends clean batches', moment: true, code: 2,
        at: { ...lead(), ...foll({ 0: { tone: 'ok', sub: 'ok' }, 1: { tone: 'ok', sub: 'ok' }, 2: { tone: 'live', sub: 'copy', hl: true } }), isr: { x: 455, y: 110, tone: 'warn', sub: '{leader}' } }, arrows: [['l2', 'f2', 'fetch']], stats: [{ l: 'copied', v: '3 of 6', cls: 'ok' }] },
      { log: 'The follower reaches the end of the log, catches up and is added back to the ISR.', callout: 'The follower rejoins the ISR', code: 3,
        at: { ...lead(), ...foll({ 0: { tone: 'ok', sub: 'ok' }, 1: { tone: 'ok', sub: 'ok' }, 2: { tone: 'ok', sub: 'ok' }, 3: { tone: 'ok', sub: 'ok' }, 4: { tone: 'ok', sub: 'ok' }, 5: { tone: 'ok', sub: 'ok' } }), isr: { x: 455, y: 110 } }, stats: [{ l: 'healthy copies', v: '2', cls: 'ok' }, { l: 'UnderReplicatedPartitions', v: '0', cls: 'ok' }],
        takeaway: 'Replace the bad copy from a healthy replica and check that the ISR is full again. Never edit a batch by hand.' },
    ],
  };

  /* ---- 3. acks=all is an append, not an fsync: safety comes from independent failures ---- */
  const FOOT_PWR = 'Simplified: one record on three replicas. Timings illustrative.';
  const BX = [16, 226, 436];
  const pageAt = i => ({ x: BX[i] + 24, y: 110 });
  const diskAt = i => ({ x: BX[i] + 24, y: 244 });
  const power = {
    id: 'power-loss', label: 'acks=all and power loss', desc: 'acks=all means every in-sync replica appended the record, not that every disk flushed it. Spread replicas over independent failure domains (illustrative).',
    codeLabel: 'Config',
    code: {
      bug: [
        'acks=all   min.insync.replicas=2   replication.factor=3',
        '# all three brokers share one rack and one power feed (illustrative)',
        '# log.flush.interval.messages is effectively unlimited: the OS flushes pages later',
        '# the rack loses power: every unflushed tail is lost at once',
      ],
      fix: [
        'broker.rack=<rack or AZ id> on every broker',
        '# the three replicas are placed on three racks',
        '# one rack loses power: two other copies keep the record',
        '# the broker restarts, recovers, and fetches what it lost from the leader',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_PWR, panels: [
      { id: 'b0', x: BX[0], y: 58, w: 188, h: 290, title: 'Broker 1 (leader)', tone: 'info' },
      { id: 'b1', x: BX[1], y: 58, w: 188, h: 290, title: 'Broker 2', tone: 'info' },
      { id: 'b2', x: BX[2], y: 58, w: 188, h: 290, title: 'Broker 3', tone: 'info' },
    ], tokens: {
      pc0: { label: 'record', sub: 'page cache', tone: 'warn', w: 140 }, pc1: { label: 'record', sub: 'page cache', tone: 'warn', w: 140 }, pc2: { label: 'record', sub: 'page cache', tone: 'warn', w: 140 },
      dk0: { label: 'record', sub: 'on disk', tone: 'ok', w: 140 }, dk1: { label: 'record', sub: 'on disk', tone: 'ok', w: 140 }, dk2: { label: 'record', sub: 'on disk', tone: 'ok', w: 140 },
      ack: { label: 'ack to producer', sub: 'all ISR appended', tone: 'cursor', w: 140 },
    } },
    bug: [
      { log: 'A producer with acks=all sends one record. The leader appends it and the two followers fetch it. All three replicas hold it in the page cache.', callout: 'Appended on all three replicas', code: 0,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: pageAt(2) }, stats: [{ l: 'replicas with the record', v: '3', cls: 'ok' }, { l: 'on disk', v: '0', cls: 'warn' }] },
      { log: 'Every in-sync replica has appended the record, so the leader acknowledges it. No disk flush was waited for.', callout: 'The ack does not wait for a flush', moment: true, code: 2,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: pageAt(2), ack: { x: 250, y: 300 } }, stats: [{ l: 'acked', v: 'yes', cls: 'ok' }, { l: 'fsync waited', v: 'no', cls: 'warn' }] },
      { log: 'The operating system flushes dirty pages some time later, for example after a time or a size threshold. None of the three copies has reached a disk yet.', callout: 'The OS has not flushed any copy yet', code: 2,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: pageAt(2), ack: { x: 250, y: 300 } }, stats: [{ l: 'on disk', v: '0 of 3', cls: 'warn' }] },
      { log: 'Before any flush happens, the rack that holds all three brokers loses power at once.', callout: 'One rack, one power feed, all lost', code: 3,
        at: { pc0: { ...pageAt(0), tone: 'delete', sub: 'lost' }, pc1: { ...pageAt(1), tone: 'delete', sub: 'lost' }, pc2: { ...pageAt(2), tone: 'delete', sub: 'lost' }, ack: { x: 250, y: 300 } }, stats: [{ l: 'failure domains', v: '1 shared', cls: 'bad' }] },
      { log: 'The page caches are gone on all three brokers. The producer saw an ack, but no replica holds the record any more.', callout: 'An acked record is gone on every replica', moment: true, code: 3,
        at: { ack: { x: 250, y: 300, sub: 'no copy left' } }, stats: [{ l: 'acked records lost', v: '1', cls: 'bad' }, { l: 'copies left', v: '0', cls: 'bad' }],
        takeaway: 'acks=all protects against one broker failing, not against all replicas failing together before a flush.' },
    ],
    fix: [
      { log: 'Each broker sets broker.rack to its rack or availability zone. The replica placement then puts the three copies on three different racks.', callout: 'broker.rack spreads the replicas', code: 0,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: pageAt(2) }, stats: [{ l: 'failure domains', v: '3', cls: 'ok' }] },
      { log: 'The record is appended on all three racks and acknowledged, as before.', callout: 'Same write path, three racks', code: 1,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: pageAt(2), ack: { x: 250, y: 300 } }, stats: [{ l: 'acked', v: 'yes', cls: 'ok' }] },
      { log: 'One rack loses power. Broker 3 and its page cache are gone, but the other two replicas still hold the record.', callout: 'One rack fails, two copies remain', moment: true, code: 2,
        at: { pc0: pageAt(0), pc1: pageAt(1), pc2: { ...pageAt(2), tone: 'delete', sub: 'lost' } }, stats: [{ l: 'copies left', v: '2', cls: 'ok' }, { l: 'data lost', v: 'none', cls: 'ok' }] },
      { log: 'Broker 3 restarts, runs log recovery, truncates its bad tail and fetches the missing records from the leader.', callout: 'The broker refetches from the leader', code: 3,
        at: { pc0: pageAt(0), pc1: pageAt(1), dk2: diskAt(2) }, arrows: [['pc0', 'dk2', 'fetch']], stats: [{ l: 'copies', v: '3', cls: 'ok' }],
        takeaway: 'Kafka durability comes from replicas that fail independently, not from one disk. Spread them with broker.rack.' },
    ],
  };

  window.CHAPTER_OVERRIDES[1] = { explain: `
<h3>1. Kafka does not fsync every write</h3>
<p>A broker appends each batch to the segment file through the operating system’s page cache and returns. The OS writes the pages to disk later. By default <code>log.flush.interval.messages</code> is effectively unlimited, so the broker does not force a flush on its own. This is why Kafka writes are fast: they are sequential appends to memory.</p>
<p>The price is that after a crash the end of a log may hold half-written or missing batches. The broker cannot trust what is past the last flush, and it has to find that boundary again.</p>

<h3>2. The recovery point marks what is trusted</h3>
<p>For each partition the broker keeps a <b>recovery point</b>: the offset up to which the log was flushed. The values are stored in the <code>recovery-point-offset-checkpoint</code> file of each log directory. Everything before the recovery point is trusted. Everything after it is unverified.</p>
<p>A neighbouring file, <code>replication-offset-checkpoint</code>, holds the high watermark of each partition. Do not mix the two. The recovery point is about the local disk. The high watermark is about what all in-sync replicas hold.</p>

<h3>3. A clean shutdown skips recovery, a kill does not</h3>
<p>A controlled stop flushes every log, writes the checkpoints and leaves a <b>clean shutdown marker</b> file (<code>.kafka_cleanshutdown</code>). The next start sees the marker and loads the logs without checking them. A controlled shutdown also moves leadership off the broker first, so clients only see a short leader change.</p>
<p>A <code>SIGKILL</code>, an out-of-memory kill or a power loss leaves no marker. If a Kubernetes pod’s grace period is shorter than the controlled shutdown takes, the kubelet kills the process and the next start pays for the full recovery.</p>

<h3>4. What recovery does, step by step</h3>
<p>For each partition past its recovery point the broker reads the unflushed segments batch by batch. It checks the length and the CRC of every batch, and it truncates the log at the first bad batch. Then it rebuilds the <code>.index</code> and <code>.timeindex</code> files that are missing or invalid. The partitions are recovered in parallel, but only <code>num.recovery.threads.per.data.dir</code> at a time for each data directory (default 1).</p>
<p>The records that were cut are not lost for good, if other replicas have them. When the broker becomes a follower again it fetches from the leader the offsets it truncated.</p>

<h3>5. The CRC check and bad data</h3>
<p>Every record batch carries a CRC. If it does not match the bytes, the read fails with <code>CorruptRecordException</code> and the broker does not serve the data. A bad <b>index</b> is only a hint and is rebuilt from the log on start. A bad <b>log segment</b> cannot be rebuilt. It has to be replaced from a healthy replica, so one copy must be removed and fetched again.</p>

<h3>6. The trade-off: durability is replication</h3>
<p>Because writes are not flushed one by one, one disk gives no durability guarantee. <code>acks=all</code> with <code>min.insync.replicas</code> means that enough in-sync replicas appended the record. It does not mean that they flushed it. The safety comes from replicas that fail independently. If all replicas share a rack, a power feed or an availability zone, one event can cut the unflushed tail on all of them. Set <code>broker.rack</code> so that Kafka spreads the replicas.</p>
<p>More recovery threads shorten a long start, but they add disk I/O while the broker is coming back. To reduce the work after a restart, give the process enough time to stop cleanly. To bound the data at risk, compare it with the flush settings, and do not rely on a flush per message.</p>

<h3>7. Syntax</h3>
<pre># broker.properties
controlled.shutdown.enable=true
num.recovery.threads.per.data.dir=4
broker.rack=az-1

# look at the checkpoint and the marker in a log directory
cat /var/lib/kafka/data/recovery-point-offset-checkpoint
ls -a /var/lib/kafka/data/ | grep cleanshutdown

# check a segment and its indexes
kafka-dump-log.sh --files /var/lib/kafka/data/orders-0/00000000000000004200.log --verify-index-only

# the startup log lines to look for
INFO Recovering unflushed segment 4200 in log orders-0 (kafka.log.LogLoader)
INFO Loaded 3000 logs in 2400000ms</pre>
<p>In Kubernetes, set <code>terminationGracePeriodSeconds</code> above the time a controlled shutdown takes. More: ${KL(KDOC + 'design_filesystem', 'Filesystem and persistence')} and ${KL(KDOC + 'brokerconfigs_num.recovery.threads.per.data.dir', 'num.recovery.threads.per.data.dir')}.</p>`, scenarios: [restart, crc, power] };
})();
