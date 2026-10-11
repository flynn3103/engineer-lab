/* Pictures for the ScyllaDB system-design course: one form per use case, built from the shared picture kit (assets/course/kit.js).
 * A painter takes the whole scene for a step and returns HTML, so Back, Restart and jumping need no replay.
 * (The token ring, quorum, LSM and Raft use cases are shared animations, Course.registerAnimation, and need no painter here.) */
(function () {
  'use strict';
  const { e, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels } = Course.kit;
  const P = CourseData.PAINT = {};
  const n = v => Number(v).toLocaleString('en-US');

  // 1.2 write rate per core against what one core can take
  P.hotkey = s => cap('Writes per second on each of 8 cores (thousands). Each core takes about ' + s.cap + ',000 a second (example).') +
    s.rows.map((v, i) => meter(v, 46, v > s.cap ? 'bad' : 'ok', 'core ' + (i + 1) + ': ' + n(v * 1000) + '/s')).join('') +
    note(chip('partitions per seller: ' + s.fan, s.fan > 1 ? 'ok' : 'warn'), s.ghost ? chip('more nodes added: same hot core', 'bad') : '', s.cost ? chip('one logical read = ' + s.fan + ' partition reads', 'warn') : '', s.time ? chip('key = (seller, bucket, day)', 'acc') : '');

  // 1.3 key to token to replicas to core
  P.shardpath = s => stages([['Key', 'seller-17'], ['Token', 'Murmur3, 64 bit'], ['Replicas', '3 nodes'], ['Shard', 'one core each'], ['Delivery', 'shard-aware']], s.at) +
    note(s.at >= 1 ? chip('same token on every node and driver', 'ok') : '', s.at >= 3 ? chip('one core owns the data, no locks', 'acc') : '', s.hop ? chip('wrong core: extra hand-off inside the node', 'warn') : '', s.at === 4 ? chip('direct to the owning core', 'ok') : '');

  // 2.2 coordinator fan-out as messages
  P.fanout = s => {
    const W = { from: 0, to: 1, text: 'write at QUORUM' }, F = [2, 3, 4].map(r => ({ from: 1, to: r, text: 'mutation' }));
    const A = [{ from: 2, to: 1, text: 'ack A' }, { from: 3, to: 1, text: 'ack B' }], OK = { from: 1, to: 0, text: 'OK (2 of 3)' };
    const rows = s.down ? [W, F[0], F[1], { from: 1, to: 4, text: 'mutation lost', lost: true }, A[0], A[1], OK, { from: 1, to: 1, text: 'hint stored for C' }]
      : [[W], [W, ...F], [W, ...F, ...A], [W, ...F, ...A, OK], [W, ...F, ...A, OK, { from: 4, to: 1, text: 'ack C (late)' }]][s.k - 1];
    return lanes(['Client', 'Coordinator', 'Replica A', 'Replica B', 'Replica C'], rows) +
      note(chip('QUORUM = 2 of 3', 'acc'), s.k >= 4 ? chip('client answered at the 2nd ack', 'ok') : '', s.down ? chip('C is down: hint stored', 'warn') : '');
  };

  // 2.3 replicas in two datacenters and the level that counts them
  P.dcs = s => {
    const col = (title, st) => ({ title, items: st.map((x, i) => ({ name: 'replica ' + (i + 1), info: { ack: 'acknowledged', up: 'up', down: 'DOWN' }[x], cls: { ack: 'ok', up: '', down: 'bad' }[x] })) });
    return columns([col('DC1', s.dc1), col('DC2', s.dc2)]) + note(chip(s.cl, 'acc'), chip(s.out, s.cls));
  };

  // 3.1 messages with and without token awareness
  P.routing = s => {
    const R = s.mode === 'blind'
      ? [{ from: 0, to: 1, text: 'request' }, { from: 1, to: 2, text: 'forward to a replica' }, { from: 2, to: 1, text: 'reply' }, { from: 1, to: 0, text: 'reply' }]
      : [{ from: 0, to: 2, text: 'request to a replica, token from the driver' }, { from: 2, to: 0, text: 'reply' }];
    return lanes(['Client', 'Node X (not a replica)', 'Replica node'], R.slice(0, s.n)) +
      note(chip(s.mode === 'blind' ? 'round-robin coordinator' : 'token-aware coordinator', s.mode === 'blind' ? 'warn' : 'ok'), chip('messages: ' + s.n), s.prepared ? chip('needs a prepared statement', 'acc') : '');
  };

  // 3.2 load factor from retries
  P.amp = s => limitMeter('Requests per second reaching the replicas: ' + n(s.load) + ' (capacity 15,000)', s.load, 36000, 15000, { h: 26, warnAt: 12000 }) +
    '<div style="margin-top:10px">' + table(['Share of attempts that time out', 'Attempts per user request (3 retries)'], [[e(s.p), e(s.amp.toFixed(2)) + '×']]) + '</div>' +
    note(s.waste ? chip('replicas also work on abandoned requests', 'bad') : '', s.fixed ? chip('bounded retries + backoff + limit', 'ok') : '');

  // 3.3 statements and whether a retry is safe
  P.idem = s => {
    const R = [['INSERT with the same primary key', chip('safe', 'ok')], ['UPDATE SET status = fixed value', chip('safe', 'ok')], ['UPDATE counter hits = hits + 1', chip('NOT safe: counted twice', 'bad')], ['list append', chip('NOT safe: duplicate element', 'bad')], ['INSERT IF NOT EXISTS', chip('safe, but read the result', 'warn')]];
    return (s.upto ? table(['Statement', 'Retry after a timeout'], R.slice(0, s.upto).map(r => ['<code>' + e(r[0]) + '</code>', r[1]])) : cap('The client sees a timeout. The write may have reached 0, 1, 2 or 3 replicas.')) +
      note(chip('timeout = outcome unknown', 'warn'));
  };

  // 4.2 acknowledged writes against fsync times
  P.sync = s => {
    const W = [1, 3, 6, 8, 12, 13], upto = s.crash != null ? Math.min(s.t, s.crash) : s.t, syncs = [10, 20, 30].filter(x => x <= upto);
    const points = W.filter(w => w <= s.t).map((w, i) => {
      const synced = s.mode === 'batch' || syncs.some(f => f >= w), lost = s.crash != null && !synced;
      return { at: w, top: (i % 3) * 14 + 8, title: 'write at ' + w + ' s', bg: 'var(--' + (lost ? (s.rep ? 'acc' : 'bad') : synced ? 'ok' : 'warn') + ')' };
    });
    const marks = (s.mode === 'batch' ? [] : syncs.map(f => ({ at: f, kind: 'fs' }))).concat(s.crash != null ? [{ at: s.crash, kind: 'cr' }] : []);
    return timeline({ max: 30, points, marks, ticks: [0, 10, 20, 30].map(x => ({ at: x, label: x + ' s' })), label: 'Dots = acknowledged writes on one node. Green = on disk, amber = in the OS cache, blue = lost here but on other replicas, red = lost everywhere. Dashed = fsync, red line = crash.' }) +
      strip(chip(s.mode === 'batch' ? 'commitlog_sync: batch' : 'commitlog_sync: periodic (10 s example)', 'acc'), s.all ? chip('all replicas lost power together', 'bad') : '');
  };

  // 4.3 dirty memory against the budget
  P.dirty = s => limitMeter('Memtable memory used: ' + s.dirty + '% of the shard budget', s.dirty, 110, 100, { h: 26, warnAt: 80 }) +
    note(chip(s.note, s.blocked ? 'bad' : s.dirty > 80 ? 'warn' : 'ok'), s.blocked ? chip('writers wait for a flush', 'bad') : '');

  // 5.2 Bloom filter size against false positives
  P.fp = s => {
    const R = [['0.1', '4.8', '0.60 GB', '1'], ['0.01', '9.6', '1.2 GB', '0.1'], ['0.001', '14.4', '1.8 GB', '0.01'], ['0.0001', '19.1', '2.4 GB', '0.001']].slice(0, s.upto);
    return (R.length ? table(['False-positive chance p', 'Bits per key', 'Memory for 1 billion keys', 'Wasted file reads per miss across 10 files'], R.map(r => r.map(x => e(x)))) : cap('Per SSTable: "definitely absent" is always right, "maybe present" is wrong with probability p.')) +
      note(chip('bits per key = 1.44 × log2(1/p)', 'acc'), s.mem ? chip('filters stay resident in memory', 'warn') : '');
  };

  // 5.3 cache contents and hit rate
  P.cachefill = s => cap('Row cache, 16 slots. Green = hot row, orange = cold row from a scan, grey = empty.') +
    cells([...s.cells].map((c, i) => c === 'h' ? ['hot', 'ok'] : c === 'c' ? ['cold', 'warn'] : ['·', 'dim'])) +
    '<div style="margin-top:10px">' + meter(s.hit, 100, s.hit < 50 ? 'bad' : 'ok', 'cache hit rate ' + s.hit + '%') + '</div>' +
    note(s.hitRow ? chip('hit: no SSTable read', 'ok') : '', s.bypass ? chip('BYPASS CACHE: scan leaves the cache alone', 'ok') : '', s.sep ? chip('analytics isolated from serving', 'acc') : '');

  // 6.2 compaction strategies compared
  P.strategies = s => {
    const lv = { low: 'ok', mid: 'warn', high: 'bad' }, c = (t, k) => chip(t, lv[k]);
    const R = [['Size-tiered (STCS)', c('low', 'low'), c('high', 'high'), c('high', 'high'), 'write-heavy, few overwrites'], ['Leveled (LCS)', c('high', 'high'), c('low', 'low'), c('low', 'low'), 'read-heavy, rows overwritten'], ['Time-window (TWCS)', c('low', 'low'), c('low (time-bounded)', 'low'), c('low', 'low'), 'append-only with TTL']];
    const W = [['orders: written once, 7-day TTL', chip('time-window', 'ok')], ['sessions: read often, rewritten', chip('leveled', 'ok')], ['bulk ingest: mostly written', chip('size-tiered', 'ok')]];
    if (!s.upto) return cap('Three costs: write amplification (rewrites), read amplification (files per read), space amplification (disk beyond live data).') + note(chip('write amplification', 'warn'), chip('read amplification', 'warn'), chip('space amplification', 'warn'));
    return table(['Strategy', 'Write amp', 'Read amp', 'Space amp', 'Fits'], R.slice(0, Math.min(s.upto, 3)).map(r => [e(r[0]), r[1], r[2], r[3], e(r[4])])) +
      (s.upto >= 4 ? '<div style="margin-top:10px">' + table(['Table', 'Strategy'], W.map(r => [e(r[0]), r[1]])) + '</div>' : '') + note(s.change ? chip('changing strategy rewrites data over time', 'warn') : '');
  };

  // 6.3 disk usage while a merge runs
  P.headroom = s => limitMeter('Disk used: ' + s.used + '% · ' + s.label, s.used, 100, 80, { h: 26, warnAt: 70 }) +
    note(chip('danger line 80% (example)', 'acc'), s.behind ? chip('compaction behind: pending grows', 'bad') : '', s.refuse ? chip('node refuses writes', 'bad') : '');

  // 7.2 tombstones scanned for a few live rows
  P.tombscan = s => {
    const dead = s.dead > 0 ? Array.from({ length: 10 }, () => cell('✕', s.fix === 'cursor' ? 'dim' : 'bad', 'tombstone')) : [];
    const live = Array.from({ length: 4 }, (_, i) => cell('job', 'ok ' + (i < 3 && s.fix === 'cursor' ? 'ring' : '')));
    return cap('Head of the partition, in order: deleted rows (tombstones) then live jobs. The count of ✕ is shown as 10 cells; the real pile is ' + n(s.dead) + '.') + strip(dead.join('') + live.join('')) +
      '<div style="margin-top:10px">' + meter(s.scanned, 200010, s.hot ? 'bad' : 'ok', 'cells scanned: ' + n(s.scanned)) + meter(10, 200010, 'ok', 'rows returned: 10') + '</div>' +
      note(chip('about ' + s.ms + ' ms per read (example)', s.ms > 50 ? 'bad' : 'ok'), s.fix === 'cursor' ? chip('WHERE id > last processed', 'ok') : '', s.fix === 'bucket' ? chip('time bucket in the key + TTL', 'ok') : '');
  };

  // 7.3 days on an axis: grace period, a replica that missed a delete, the purge
  P.resurrect = s => {
    const k = s.k, bands = [{ from: 0, to: 10, top: 14, height: 16 }, { from: 0, to: k >= 3 ? 5 : 1, top: 40, height: 16 }];
    const marks = k >= 4 ? [{ at: 10, kind: 'cr' }] : [], points = (k >= 5 ? [{ at: 12, top: 4, bg: 'var(--bad)', title: 'deleted row returned' }] : []);
    const ticks = [{ at: 0, label: 'delete' }, { at: 10, label: 'day 10', top: 62 }].concat(k >= 3 ? [{ at: 5, label: 'C back', top: 62 }] : [], k >= 5 ? [{ at: 12, label: 'read', top: 62 }] : [], [{ at: 14, label: 'day 14' }]);
    const rep = (name, st) => chip(name + ': ' + st, st === 'old row' ? 'bad' : st === 'tombstone' ? 'ok' : 'dim');
    const ab = k >= 5 ? 'old row' : k >= 4 ? 'nothing' : 'tombstone', c = 'old row';
    return timeline({ max: 14, height: 96, bands, marks, points, ticks, label: 'Days. Top bar: gc_grace_seconds (10 days). Lower bar: replica C down or unrepaired. Red line: tombstone purged. Red dot: the deleted row comes back.' }) +
      '<div style="margin-top:34px">' + strip(rep('A', ab) + rep('B', ab) + rep('C', c) + (k >= 5 ? chip('read at QUORUM returns the deleted row', 'bad') : '') + (k === 6 ? chip('repair within gc_grace_seconds prevents it', 'ok') : '')) + '</div>';
  };

  // 8.1 the tablet map and the load per node
  P.tabletmap = s => {
    const load = {}; s.nodes.forEach(x => { load[x] = 0; });
    s.rows.forEach(r => (r[1].match(/[A-E]/g) || []).forEach(x => { load[x]++; }));
    return table(['Tablet', 'Replicas', 'State'], s.rows.map(r => ['<code>' + e(r[0]) + '</code>', e(r[1]), chip(r[2], r[2] === 'migrating' ? 'warn' : 'ok')])) +
      note(...s.nodes.map(x => chip(x + ': ' + load[x], load[x] === 0 ? 'bad' : '')), chip('map version ' + s.epoch, 'acc'), s.done ? chip('no pause in traffic', 'ok') : '');
  };

  // 8.2 stages of a tablet move and the nodes involved
  P.handover = s => {
    const cls = { B: ['', '', '', 'warn', 'dim'], E: ['dim', 'warn', 'warn', 'ok', 'ok'] }, i = s.at + 1;
    const nodes = [['B (old)', s.failed ? '' : cls.B[i]], ['C', ''], ['D', ''], ['E (new)', s.failed ? 'bad' : cls.E[i]]];
    return stages([['Double-write', 'new replica gets writes'], ['Stream', 'copy existing data'], ['Switch reads', 'through Raft, fenced'], ['Clean up', 'old copy freed']], s.at) +
      cap('Replicas of tablet T2') + cells(nodes.map(x => [x[0], x[1]])) + note(chip(s.note, s.failed ? 'bad' : 'acc'));
  };

  // 8.3 tablet sizes against a target
  P.tabletsize = s => cap('Tablet sizes in GB. The size target here is ' + s.target + ' GB (example).') +
    s.sizes.map((v, i) => meter(v, 10, v > s.target ? 'bad' : 'ok', 'tablet ' + (i + 1) + ': ' + v + ' GB' + (s.single === i ? ' (one partition)' : ''))).join('') +
    note(chip('tablets: ' + s.sizes.length, 'acc'), s.single != null ? chip('one partition: cannot be split', 'bad') : '', s.merged ? chip('small neighbours merged', 'ok') : '');

  // 9.3 which operations need group 0
  P.scope = s => {
    const R = [['CREATE TABLE or ALTER (schema)', true], ['Add or remove a node (topology)', true], ['Move a tablet (tablet map)', true], ['INSERT at LOCAL_QUORUM', false], ['SELECT at LOCAL_QUORUM', false]].slice(0, s.upto);
    return table(['Operation', 'Goes through Raft', s.maj ? 'With a majority' : 'Without a majority'], R.map(r => ['<code>' + e(r[0]) + '</code>', r[1] ? 'yes' : 'no', r[1] ? (s.maj ? chip('commits', 'ok') : chip('blocked', 'bad')) : chip('works if its own level can be met', 'ok')])) +
      note(s.lost ? chip('more than half of the nodes lost', 'bad') : '', s.why ? chip('one committed history of metadata', 'ok') : '');
  };
})();
