/* Pictures for the Apache Kafka system-design course: one form per use case, built from the shared picture kit (assets/course/kit.js).
 * A painter takes the whole scene for a step and returns HTML, so Back, Restart and jumping need no replay.
 * (The key-to-partition, ISR, rebalance and KRaft use cases are shared animations and need no painter here.) */
(function () {
  'use strict';
  const { e, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels } = Course.kit;
  const P = CourseData.PAINT = {};
  const n = v => Number(v).toLocaleString('en-US');

  // 1.1 segment files and the sparse index
  P.segfind = s => {
    const segs = [['00000000000000000000', '0 to 8,399,999', ''], ['00000000000008400000', '8,400,000 to 8,949,999', ''], ['00000000000008950000', '8,950,000 to 9,399,999', ''], ['00000000000009400000', '9,400,000 and growing', 'active']];
    let h = table(['Segment file (base offset)', 'Records', 'Lookup of 9,000,000'], segs.map((x, i) => ['<code>' + x[0] + '.log</code>', e(x[1]) + (x[2] ? ' ' + chip('active', 'acc') : ''), s.sel < 0 ? '' : s.sel === i ? chip('chosen: largest base ≤ target', 'ok') : chip('not touched', 'dim')]));
    if (s.ix) h += cap('Sparse index of the chosen segment: one entry about every 4 KiB of log (relative offset to byte position)') + cells([['rel 49,992 → byte 51,191,808', 'dim'], ['rel 49,996 → byte 51,195,904', 'ok'], ['rel 50,000 = target', 'ring']]);
    if (s.scan) h += strip(chip('read the log from byte 51,195,904, skip about 4 KiB', 'acc'), s.scan > 1 ? chip('records from 9,000,000 onwards', 'ok') : '');
    return h + note(s.why ? chip('sparse: about 2 MiB per 1 GiB segment · dense: about 8 MiB', 'acc') : '');
  };

  // 1.2 recovery after an unclean shutdown
  P.recover = s => stages([['Start', 'no clean marker'], ['Check', 'CRC of tail segments'], ['Truncate', 'at first bad record'], ['Catch up', 'fetch from leaders']], s.at) +
    '<div style="margin-top:10px">' + meter(s.done, s.total, s.done === s.total ? 'ok' : 'warn', 'logs checked: ' + n(s.done) + ' of ' + n(s.total)) + '</div>' +
    note(chip('one recovery thread per data dir (default)', 'warn'), s.fix ? chip('clean stop · more threads · fewer partitions', 'ok') : '');

  // 1.3 which failures lose unflushed data
  P.durability = s => {
    const R = [['Broker process killed', 'page cache survives (the OS owns it)', chip('no loss', 'ok')], ['Machine or OS crash', 'unflushed pages are lost', chip('loss on this broker only: other ISR replicas have it', 'warn')], ['Whole rack loses power', 'unflushed pages lost on every replica in the rack', chip('loss unless replicas span racks', 'bad')], ['Disk dies', 'data on that disk is lost', chip('rebuilt from replicas', 'warn')]].slice(0, s.upto);
    return (R.length ? table(['Failure', 'What happens to unflushed data', 'Outcome'], R.map(r => [e(r[0]), e(r[1]), r[2]])) : cap('The broker appends to the page cache and does not fsync each batch. The OS writes pages back later.')) +
      note(chip('log.flush.interval.messages = Long.MAX_VALUE (no forced flush)', 'acc'), s.plan ? chip('durability = replicas in different racks', 'ok') : '');
  };

  // 2.2 partition load against what one consumer can take
  P.skew = s => cap('Producer load per partition (MB/s). One consumer handles about ' + s.cap + ' MB/s (example).') +
    s.rows.map((v, i) => meter(v, 26, v > s.cap ? 'bad' : 'ok', 'partition ' + i + ': ' + v + ' MB/s')).join('') +
    note(s.lag ? chip('lag grows on the hot partition', 'bad') : '', s.salt ? chip('key = (seller, salt)', 'acc') : '', s.order ? chip('per-seller order is lost across salt values', 'warn') : '', s.byOrder ? chip('key = order id: per-order order kept', 'ok') : '');

  // 2.3 consumers against partitions
  P.parallel = s => {
    const each = (c, p) => Array.from({ length: c }, (_, i) => { const per = Math.floor(p / c), extra = p % c, start = i * per + Math.min(i, extra), len = per + (i < extra ? 1 : 0); return len ? ['C' + (i + 1) + ': p' + start + (len > 1 ? ' to p' + (start + len - 1) : ''), 'ok'] : ['C' + (i + 1) + ': idle', 'dim']; });
    const idle = Math.max(0, s.c - s.p);
    return cap('Group "billing": ' + s.c + ' consumers share ' + s.p + ' partitions') + cells(each(s.c, s.p)) +
      (s.groups ? cap('Group "audit" reads the same topic with its own assignment') + cells(each(4, s.p)) : '') +
      note(idle ? chip(idle + ' consumers idle', 'bad') : chip('every consumer has work', 'ok'), s.size ? chip('partitions ≥ peak consumers', 'acc') : '');
  };

  // 3.1 records arriving and batches closing on a time axis
  P.batchfill = s => {
    const times = s.rate === 1 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : Array.from({ length: 33 }, (_, i) => Math.round((i + 1) * 1) / 10);
    const req = s.rate === 1 ? (s.linger ? '200 requests/s' : '1,000 requests/s') : '625 requests/s (16 records per batch)';
    return timeline({ max: 10, height: 86, points: times.map((t, i) => ({ at: t, top: 6 + (i % 3) * 11, title: 'record at ' + t + ' ms', bg: 'var(--mut)' })), bands: s.linger ? [{ from: 0, to: s.linger, top: 44, height: 14 }] : [],
      marks: s.closes.map(c => ({ at: c, kind: 'fs' })), ticks: [0, 5, 10].map(x => ({ at: x, label: x + ' ms' })), label: 'Records for one partition (dots, ' + (s.rate === 1 ? '1 per ms' : '10 per ms') + '), the linger window (bar) and batches sent (dashed).' }) +
      '<div style="margin-top:34px">' + strip(chip('linger.ms = ' + s.linger, 'acc'), chip(req, s.linger || s.rate > 1 ? 'ok' : 'bad'), s.comp ? chip('compressed per batch', 'acc') : '', s.mem ? chip('in-flight 5 · buffer.memory 32 MiB', 'acc') : '', s.plan ? chip('choose linger from the latency budget', 'ok') : '') + '</div>';
  };

  // 3.2 sequence numbers and a lost ack
  P.dedup = s => {
    const R = [{ from: 0, to: 1, text: 'batch seq 0 (PID 7)' }, { from: 1, to: 0, text: 'ack', lost: true }, { from: 0, to: 1, text: 'retry: batch seq 0' }, { from: 1, to: 0, text: 'duplicate dropped, ack' }, { from: 0, to: 1, text: 'batch seq 1' }, { from: 1, to: 0, text: 'ack' }, { from: 0, to: 1, text: 'batch seq 3 (2 is missing)' }, { from: 1, to: 0, text: 'OutOfOrderSequence' }];
    return lanes(['Producer', 'Broker'], R.slice(0, [1, 2, 3, 4, 6, 8][s.k - 1])) + note(s.k >= 4 ? chip('record written once', 'ok') : '', s.k === 6 ? chip('gap rejected, order kept', 'ok') : '');
  };

  // 3.3 settings against guarantees
  P.settings = s => {
    const R = [['acks=1 with retries', chip('can lose', 'bad'), chip('possible', 'bad'), chip('can break', 'warn')], ['acks=all, no idempotence', chip('no loss (with min ISR)', 'ok'), chip('possible', 'bad'), chip('can break', 'warn')], ['acks=all + idempotence (default since 3.0)', chip('no loss (with min ISR)', 'ok'), chip('none from retries', 'ok'), chip('kept (up to 5 in flight)', 'ok')]].slice(0, Math.min(s.upto, 3));
    return table(['Settings', 'Loss on a leader failure', 'Duplicates on retry', 'Order within a partition'], R.map(r => [e(r[0]), r[1], r[2], r[3]])) +
      note(s.upto === 4 ? chip('without idempotence a retried batch can land after a later one', 'warn') : '', s.upto >= 5 ? chip('delivery.timeout.ms 120 s · request.timeout.ms 30 s', 'acc') : '', s.minisr ? chip('+ min.insync.replicas = 2', 'ok') : '');
  };

  // 4.2 RF and min.insync.replicas
  P.minisr = s => {
    const R = [['3', '1', '2 failures', '0 failures'], ['3', '2', '1 failure', '1 failure'], ['3', '3', '0 failures', '2 failures'], ['2', '2', '0 failures', '1 failure']].slice(0, s.upto);
    return (R.length ? table(['Replication factor', 'min.insync.replicas', 'Writes keep working through', 'An acknowledged record survives'], R.map((r, i) => [e(r[0]), e(r[1]), e(r[2]), e(r[3])])) : cap('Writes keep working through RF − min failures. An acknowledged record survives min − 1 failures.')) +
      note(s.upto === 2 ? chip('the usual choice: RF 3, min 2', 'ok') : '', s.err ? chip('ISR below min: NOT_ENOUGH_REPLICAS', 'bad') : '');
  };

  // 4.3 network use while partitions move
  P.moves = s => limitMeter('Network used: ' + s.used + '% of the NIC · ' + s.label, s.used, 100, 85, { h: 26, warnAt: 70 }) +
    note(chip('comfort line 85% (example)', 'acc'), s.sat ? chip('producers time out', 'bad') : '', s.time ? chip('2 TB at 200 MB/s is about 2.8 hours', 'acc') : '', s.stall ? chip('new replica never joins the ISR', 'bad') : '');

  // 5.1 offsets: processed, committed, lost
  P.commit = s => {
    const items = Array.from({ length: 10 }, (_, o) => [String(o), o < s.done ? (o < s.committed ? 'ok' : 'warn') : o < s.committed ? 'bad' : o < s.pos ? 'acc' : 'dim']);
    return cap('Offsets 0 to 9. Green = processed and committed, yellow = processed not committed, blue = fetched not processed, red = committed but never processed, grey = not fetched.') + cells(items) +
      note(chip('position ' + s.pos, 'acc'), chip('committed ' + s.committed, s.mode === 'before' && s.crash ? 'bad' : 'ok'), s.crash ? chip(s.mode === 'before' ? 'crash: resume at ' + s.committed + ', offsets 3 and 4 are lost' : 'crash: resume at ' + s.committed + ', offsets 3 and 4 repeat', s.mode === 'before' ? 'bad' : 'warn') : '');
  };

  // 5.2 log range against the committed offset
  P.lag = s => timeline({ max: 170, height: 96, bands: [{ from: s.start, to: s.end, top: 16, height: 22 }], marks: [{ at: s.committed, kind: s.oor ? 'cr' : 'fs' }],
    ticks: [{ at: s.start, label: 'log start ' + s.start, top: 50 }, { at: s.committed, label: 'committed ' + s.committed, top: 66, bold: true, color: s.oor ? 'bad' : undefined }, { at: s.end, label: 'log end ' + s.end, top: 50 }],
    label: 'Offsets in millions. The bar is the part of the log still on disk.' }) +
    '<div style="margin-top:30px">' + strip(chip('lag ' + (s.end - s.committed) + 'M', s.end - s.committed > 30 ? 'warn' : 'ok'), chip('headroom ' + Math.max(0, s.committed - s.start) + 'M', s.committed > s.start ? 'ok' : 'bad'), s.oor ? chip('committed offset is below the log start', 'bad') : '', s.reset ? chip('auto.offset.reset = ' + s.reset, 'warn') : '', s.alert ? chip('alert on headroom', 'acc') : '') + '</div>';

  // 5.3 consumer fetch requests and the broker's wait
  P.fetchwait = s => lanes(['Consumer', 'Broker'], s.rows.map(r => ({ from: r[0], to: r[1], text: r[2] })));

  // 6.2 poll and heartbeat clocks
  P.liveness = s => {
    const hb = []; for (let x = 15; x <= Math.min(s.t, 360); x += 30) hb.push({ at: x, top: 8, bg: 'var(--ok)', title: 'heartbeat' });
    return timeline({ max: 380, height: 92, points: hb, bands: s.t >= 240 ? [{ from: 0, to: Math.min(s.t, 360), top: 34, height: 16 }] : [], marks: s.t >= 300 ? [{ at: 300, kind: 'cr' }] : [],
      ticks: [{ at: 0, label: 'poll()' }, { at: 300, label: '300 s limit', top: 60 }, { at: 360, label: '360 s', top: 74 }], label: 'Seconds. Green dots = heartbeats (every 3 s, drawn every 30 s). The bar = processing one batch without calling poll(). Red line = max.poll.interval.ms.' }) +
      '<div style="margin-top:34px">' + strip(chip('session clock: heartbeats ok', 'ok'), s.t >= 240 ? chip('poll clock: no poll for ' + Math.min(s.t, 360) + ' s', s.t >= 300 ? 'bad' : 'warn') : chip('poll clock: ok', 'ok'), s.left ? chip('left the group at 300 s', 'bad') : '', s.fail ? chip('commit rejected', 'bad') : '', s.fix ? chip('smaller batches or a longer interval', 'ok') : '') + '</div>';
  };

  // 6.3 restart behaviours
  P.static = s => {
    const R = [['Dynamic member, eager', '2 rebalances, all partitions stop each time', 'up to 24 group-wide pauses'], ['Dynamic member, cooperative', '2 rebalances, only moving partitions stop', 'up to 24 small rebalances'], ['Static member, back within session.timeout.ms', 'no rebalance', '0 rebalances'], ['Static member, back too late', 'one rebalance after the timeout', 'one per late restart']].slice(0, s.upto);
    return table(['Membership', 'One consumer restarts', 'Rolling restart of 12'], R.map((r, i) => [e(r[0]), chip(r[1], i === 2 ? 'ok' : i === 0 ? 'bad' : 'warn'), e(r[2])])) + note(s.note ? chip(s.note, 'bad') : '', s.plan ? chip('static + cooperative for stateful consumers', 'ok') : '');
  };

  // 7.1 segments by age against retention
  P.retain = s => table(['Segment', 'Newest record (days old)', 'Decision'], s.rows.map(r => [e(r[0]), e(r[1]), r[2] === 'delete' ? chip('deleted', 'bad') : r[2] === 'active' ? chip('active: never deleted', 'acc') : chip('kept', 'ok')])) +
    note(chip('retention.ms = 7 days', 'acc'), s.whole ? chip('a kept segment can hold records older than 7 days', 'warn') : '', s.quiet ? chip('roll with segment.ms on quiet topics', 'warn') : '', s.size ? chip('retention.bytes also deletes the oldest', 'acc') : '', s.delay ? chip('.deleted, removed after 60 s', 'acc') : '');

  // 7.2 a compacted log before and after
  P.compactkeys = s => {
    const L = [['k1', 'a'], ['k2', 'b'], ['k1', 'c'], ['k3', 'd'], ['k2', '∅'], ['k1', 'e'], ['k3', 'f']], stale = [0, 1, 2, 3];
    if (!s.phase) return cap('A compacted topic keeps the latest value for each key. A value of ∅ (null) is a tombstone.');
    let h = cap('Log before cleaning: offset, key = value') + cells(L.map((r, i) => [i + ': ' + r[0] + ' = ' + r[1], s.phase >= 2 && stale.includes(i) ? 'dim' : r[1] === '∅' ? 'warn' : 'acc']));
    if (s.phase >= 3) h += cap('After cleaning: the latest record of each key, with its original offset') + cells([4, 5, 6].map(i => [i + ': ' + L[i][0] + ' = ' + L[i][1], L[i][1] === '∅' ? 'warn' : 'ok']));
    return h + note(s.phase === 4 ? chip('tombstone kept for delete.retention.ms (24 h), then removed', 'warn') : '', s.phase === 5 ? chip('cleaner starts at min.cleanable.dirty.ratio 0.5', 'acc') : '');
  };

  // 7.3 local and remote storage
  P.tier = s => cap(s.label) + meter(s.local, 400, s.local > 100 ? 'bad' : 'ok', 'local broker disks: ' + s.local + ' TB') + meter(s.remote, 400, 'acc', 'remote storage: ' + s.remote + ' TB') +
    note(s.reads ? chip('recent reads local, old reads remote (slower)', 'acc') : '', s.fast ? chip('a new broker copies about a day of data', 'ok') : '', s.limits ? chip('check unsupported features and replay cost', 'warn') : '');

  // 8.1 messages of a transaction
  P.txnflow = s => {
    const R = [{ from: 0, to: 1, text: 'initTransactions: PID + epoch' }, { from: 0, to: 1, text: 'AddPartitionsToTxn' }, { from: 0, to: 2, text: 'produce invoices (hidden from read_committed)' }, { from: 0, to: 1, text: 'AddOffsetsToTxn' }, { from: 0, to: 3, text: 'TxnOffsetCommit (pending)' }, { from: 0, to: 1, text: 'commitTransaction' }, { from: 1, to: 1, text: 'PREPARE_COMMIT logged' }, { from: 1, to: 2, text: 'COMMIT marker' }, { from: 1, to: 3, text: 'COMMIT marker' }];
    return lanes(['App', 'Txn coordinator', 'Output partitions', '__consumer_offsets'], R.slice(0, s.n)) + note(s.n >= 7 ? chip('decision logged: will complete', 'acc') : '', s.n >= 9 ? chip('records and offset visible together', 'ok') : '');
  };

  // 8.2 epochs and a zombie
  P.fence = s => {
    const R = [{ from: 0, to: 1, text: 'initTransactions billing-1: epoch 5' }, { from: 0, to: 1, text: 'transaction open' }, { from: 0, to: 0, text: 'paused (GC or network)' }, { from: 2, to: 1, text: 'initTransactions billing-1' }, { from: 1, to: 2, text: 'epoch 6, old transaction aborted' }, { from: 0, to: 1, text: 'produce with epoch 5' }, { from: 1, to: 0, text: 'ProducerFencedException' }];
    return lanes(['Old instance', 'Txn coordinator', 'New instance'], R.slice(0, s.n)) + note(s.n >= 5 ? chip('current epoch 6', 'acc') : chip('current epoch 5', 'acc'), s.n >= 7 ? chip('zombie rejected, no duplicate output', 'ok') : '', s.why ? chip('the same transactional.id on both instances', 'ok') : '');
  };

  // 8.3 records, markers and the last stable offset
  P.lso = s => {
    const lab = (r, i) => r[1] === 'p' ? [i + ' plain', 'ok'] : r[1] === 't' ? [i + ' txn A', 'warn'] : r[1] === 'c' ? [i + ' COMMIT', 'acc'] : [i + ' ABORT', 'bad'];
    const view = { none: '', unc: chip('read_uncommitted sees offsets 0 to 4', 'warn'), com: chip(s.lso > 5 ? 'read_committed sees offsets 0 to 4' : 'read_committed sees offset 0 only', s.lso > 5 ? 'ok' : 'warn'), abort: chip('read_committed sees 0, 2 and 4', 'ok') }[s.mode];
    return cap('Partition log. Yellow = records of an open or finished transaction A, green = plain writes, blue/red = control markers.') + cells(s.recs.map(lab)) +
      note(chip('high watermark ' + s.hw, 'acc'), chip('last stable offset ' + s.lso, 'acc'), view, s.hung ? chip('LSO stuck until transaction.timeout.ms (60 s)', 'bad') : '');
  };

  // 9.3 brokers against the metadata head
  P.metaprop = s => table(['Node', 'Metadata offset', 'State'], s.offs.map((o, i) => ['Broker ' + (i + 1), e(o), s.fenced.includes(i) ? chip('fenced: no heartbeat for 9 s', 'bad') : s.head - o > 1 ? chip('behind by ' + (s.head - o), 'warn') : chip('in sync', 'ok')])) +
    note(chip('active controller head: ' + s.head, 'acc'), chip(s.note, s.fenced.length ? 'bad' : 'ok'), s.clean ? chip('leaders moved before stopping', 'ok') : '');
})();
