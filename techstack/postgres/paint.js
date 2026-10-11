/* Pictures for the PostgreSQL system-design course: one form per use case, built from the shared picture kit (assets/course/kit.js).
 * A painter takes the whole scene for a step and returns HTML, so Back, Restart and jumping need no replay.
 * (The B+tree use case is a shared animation, Course.registerAnimation('btree'), and needs no painter here.) */
(function () {
  'use strict';
  const { e, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels } = Course.kit;
  const P = CourseData.PAINT = {};
  const n = v => Number(v).toLocaleString('en-US');
  const code = t => '<code>' + e(t) + '</code>';

  // 1.1 the stages of the query path, with the catalog the analyzer reads
  P.pipeline = s => {
    const list = [['Parse', 'grammar only'], ['Analyze', 'names vs catalog'], ['Rewrite', 'views, rules'], ['Plan', 'cheapest plan'], ['Execute', 'read pages']];
    const known = s.look && s.cols.includes(s.look);
    return cap('The query path of one statement. The active stage is highlighted and stages already passed are outlined.') + stages(list, s.at) +
      cap('Columns of <code>orders</code> in the catalog (<code>pg_attribute</code>)') + cells(s.cols.map(c => [c, c === s.look ? 'ok' : ''])) +
      note(s.look ? chip('looking up: ' + s.look, s.fail ? 'bad' : known ? 'ok' : 'warn') : '', s.fail ? chip('ERROR 42703: column does not exist', 'bad') : '', s.cached ? chip('cached plan invalidated by the rename', 'warn') : '', chip('pages read: ' + s.pages, s.pages ? 'acc' : 'ok'));
  };

  // 1.2 the connection limit, the reserved slots and a pooler
  P.backends = s => {
    let h = panels([{ title: 'max_connections', big: 100 }, { title: 'reserved for superusers', big: 3 }, { title: 'ordinary roles may use', big: 97 }], { wide: false });
    h += limitMeter('Server backends (processes): ' + s.used + ' of 100', s.used, 110, 100, { h: 26, warnAt: 97 });
    if (s.pool) h += cap('Client connections') + meter(5000, 5000, 'acc', n(s.clients) + ' clients') + cap('A pooler lends a server connection per transaction');
    return h + note(s.refused ? chip('new ordinary connection: FATAL, remaining slots are reserved', 'bad') : '', s.reserved && !s.refused ? chip('3 slots stay free for superusers', 'warn') : '', s.note ? chip('target: active sessions near the number of cores', 'ok') : '');
  };

  // 1.3 executions of a prepared statement and the plan each one used
  P.plancache = s => {
    const items = [];
    for (let i = 1; i <= 10; i++) {
      let c = 'dim', t = String(i);
      if (i <= s.n) {
        if (s.mode === 'generic') c = i <= 5 ? 'acc' : 'hot';
        else if (s.mode === 'compare') c = i <= 5 ? 'acc' : 'warn';
        else c = 'acc';
      }
      items.push([t, c, i <= s.n ? (s.mode === 'generic' && i > 5 ? 'generic plan' : 'custom plan') : 'not run']);
    }
    return cap('Executions of the prepared statement, in order. Blue = planned with the real value, orange = generic plan reused, yellow = compared.') + cells(items) +
      note(chip('custom: ' + Math.min(s.n, 5) + ' of the first 5', s.n ? 'acc' : ''), s.mode === 'generic' ? chip('generic plan reused: no planning', 'hot') : '', s.mode === 'compare' ? chip('generic cost vs average custom cost', 'warn') : '', s.skew ? chip('customer 1: index scan over 2,000,000 rows', 'bad') : '', s.fixed ? chip('plan_cache_mode = force_custom_plan', 'ok') : '');
  };

  // 2.1 one 8 kB page: header, line pointers, free space, rows from the back
  P.page = s => {
    const rows = s.rows, present = rows.filter(r => r[1]).length, free = 8168 - 4 * rows.length - 150 * present;
    const lps = rows.map((r, i) => cell('lp' + (i + 1), r[0] === 'unused' ? 'dim' : r[1] === 'dead' ? 'warn' : 'ok', r[0] === 'unused' ? 'unused pointer' : 'line pointer ' + (i + 1)));
    const tups = rows.map((r, i) => r[1] ? cell('row ' + (i + 1) + (r[1] === 'dead' ? ' dead' : ''), r[1] === 'dead' ? 'warn' : 'ok', '150 B') : '').reverse();
    return cap('One 8 kB page. Front: 24 B header, then 4 B line pointers growing right. Back: rows growing left. The ring is free space.') +
      strip(cell('header 24 B', 'acc') + lps.join('') + cell('free ' + n(free) + ' B', 'ring') + tups.join('')) +
      note(...rows.map((r, i) => r[1] ? chip('ctid (0,' + (i + 1) + ')', r[1] === 'dead' ? 'warn' : 'ok') : chip('pointer ' + (i + 1) + ' unused', 'dim')));
  };

  // 2.2 buffer pool: page, usage count, pin, clock hand
  P.clock = s => {
    const items = s.bufs.map((b, i) => [b[0] + ' · ' + b[1], (s.victim === i ? 'bad' : b[2] ? 'warn' : b[1] === 0 ? 'dim' : '') + (s.hand === i ? ' ring' : ''), 'buffer ' + i + ': page ' + b[0] + ', usage ' + b[1] + (b[2] ? ', pinned' : '')]);
    return cap('Buffer pool, 8 buffers. Each box shows page name and usage count. Outlined = clock hand, orange = pinned, red = victim.') + cells(items) +
      note(chip('hand at buffer ' + s.hand, 'acc'), s.x === 'miss' ? chip('page X is not in the pool', 'warn') : chip('page X loaded', 'ok'), s.pinned != null ? chip('buffer ' + s.pinned + ' pinned: skipped', 'warn') : '', s.victim != null ? chip('victim: buffer ' + s.victim + ' (usage 0, not pinned)', 'bad') : '');
  };

  // 2.3 row size against the TOAST threshold, and the chunks
  P.toast = s => {
    let h = limitMeter('Row size in the heap page: ' + n(s.row) + ' B. Threshold about 2,032 B.', s.row, 3400, 2032, { h: 26 });
    h += note(s.stage === 'inline' ? chip('stored inline', 'ok') : s.stage === 'compressed' ? chip('compressed, still inline', 'acc') : chip('value moved out of line: pointer of about 18 B in the row', 'hot'));
    if (s.chunks) h += cap('TOAST table: the value as ' + s.chunks + ' chunks of about 2 kB') + cells(Array.from({ length: s.chunks }, (_, i) => ['c' + (i + 1), s.read === 'all' ? 'ok' : 'dim']));
    return h + note(s.read === 'none' ? chip('chunks read: 0', 'ok') : '', s.read === 'all' ? chip('chunks read: ' + s.chunks, 'warn') : '', s.update ? chip('new row version copies the pointer: chunks untouched', 'ok') : '');
  };

  // 3.2 which queries a (customer_id, created_at) index can seek on
  P.prefix = s => {
    const sample = [['7 · Jan 1', 'acc'], ['7 · Jan 3', 'acc'], ['7 · Jan 9', 'acc'], ['8 · Jan 1', 'hot'], ['8 · Jan 2', 'hot'], ['9 · Jan 5', 'ok']];
    const Q = [
      ['WHERE customer_id = 7', chip('seek on customer_id', 'ok')],
      ['WHERE customer_id = 7 AND created_at &gt; X', chip('seek on both columns', 'ok')],
      ['WHERE customer_id = 7 ORDER BY created_at DESC LIMIT 20', chip('ordered, no sort, stops early', 'ok')],
      ['WHERE created_at &gt; X', chip('no seek: scan table or whole index (17)', 'bad')],
      ['same query with an extra index on (created_at)', chip('seek on created_at', 'acc')]
    ];
    return cap('Index entries in order: customer_id first, then created_at inside each customer.') + cells(sample) +
      (s.upto ? '<div style="margin-top:10px">' + table(['Query', 'Index (customer_id, created_at)'], Q.slice(0, s.upto).map(q => ['<code>' + q[0] + '</code>', q[1]])) + '</div>' : '');
  };

  // 3.3 heap pointers and index entries for a HOT or a normal update
  P.hot = s => {
    const lpInfo = (st, i) => st === 'live' ? 'current version' : st === 'old' ? (s.chain ? 'old, chained to pointer ' + (i + 2) : 'old version') : 'redirect to pointer 2';
    const heap = s.lps.map((l, i) => ({ name: 'pointer ' + (i + 1) + ' · ' + l[0] + (s.other && i === 1 ? ' (page 1)' : ''), info: lpInfo(l[1], i), cls: l[1] === 'live' ? 'ok' : l[1] === 'redirect' ? 'acc' : 'warn' }));
    const idx = (title, list) => ({ title, items: list.map(p => ({ name: 'entry → pointer ' + p, info: p === 1 ? 'old version' : 'new version', cls: p === 1 ? '' : 'ok' })) });
    const cols = [{ title: 'Heap page 0', items: heap }, idx('Index on id', s.pk), idx('Index on customer_id', s.cu)];
    if (s.status) cols.push(idx('Index on status', s.status));
    return columns(cols) + note(chip(s.note, s.status || s.other ? 'bad' : 'ok'), s.chain && !s.status ? chip('chain inside the page', 'acc') : '', s.follow ? chip('scan follows the chain: no extra I/O', 'ok') : '');
  };

  // 4.1 row versions with xmin and xmax
  P.versions = s => table(['ctid', 'xmin', 'xmax', 'amount', 'for a new snapshot'], s.rows.map(r => ['<code>' + e(r.c) + '</code>', e(r.xmin), e(r.xmax), e(r.amt), chip(r.tag, { ok: 'ok', no: 'dim', old: 'warn' }[r.v])])) +
    note(chip('reader ' + s.reader, 'acc'));

  // 4.2 the same two sessions at two isolation levels
  P.snaps = s => {
    const R = [
      ['A', 'BEGIN', 'no snapshot yet', 'no snapshot yet'],
      ['A', 'SELECT sum(amount)', '100', '100'],
      ['B', 'INSERT amount 50, COMMIT', 'committed', 'committed'],
      ['A', 'SELECT sum(amount)', '150 (new snapshot)', '100 (same snapshot)'],
      ['A', 'UPDATE the row B changed', 'waits, re-reads the newest version, applies', 'ERROR 40001 could not serialize'],
      ['A', 'ROLLBACK, run it all again', 'not needed', 'new snapshot: 150']
    ].slice(0, s.k + 1);
    const hl = (t, i, bad) => chip(t, i === R.length - 1 ? (bad ? 'bad' : 'acc') : '');
    return table(['Session', 'Statement', 'READ COMMITTED sees', 'REPEATABLE READ sees'], R.map((r, i) => [e(r[0]), '<code>' + e(r[1]) + '</code>', hl(r[2], i, false), hl(r[3], i, r[3].startsWith('ERROR'))]));
  };

  // 4.3 lock waits between two sessions
  P.deadlock = s => {
    const R = [
      { from: 0, to: 1, text: 'UPDATE id 1 · lock row 1' },
      { from: 2, to: 1, text: 'UPDATE id 2 · lock row 2' },
      { from: 0, to: 1, text: 'UPDATE id 2 · waits for B', lost: true },
      { from: 2, to: 1, text: 'UPDATE id 1 · waits for A', lost: true },
      { from: 1, to: 2, text: 'ERROR deadlock detected 40P01' },
      { from: 1, to: 0, text: 'row 2 granted · COMMIT' }
    ].slice(0, s.k);
    return lanes(['Session A', 'Lock manager', 'Session B'], R) +
      note(s.k >= 3 ? chip('A waits for B', 'warn') : '', s.k >= 4 ? chip('B waits for A', 'warn') : '', s.k >= 4 && s.k < 6 ? chip('cycle in the waits-for graph', 'bad') : '', s.k >= 5 ? chip('B aborted, A continues', 'ok') : '');
  };

  // 5.1 where a commit is durable
  P.commit = s => {
    const R = [
      { from: 0, to: 1, text: 'change page, mark dirty' },
      { from: 0, to: 2, text: 'WAL record (LSN 0/5000)' },
      { from: 0, to: 2, text: 'commit record (LSN 0/5040)' },
      { from: 2, to: 3, text: 'write + fsync to 0/5040' },
      { from: 3, to: 0, text: 'flushed: COMMIT returns' },
      { from: 1, to: 4, text: 'dirty page written later' }
    ].slice(0, s.k);
    return lanes(['Backend', 'Shared buffers', 'WAL buffer', 'WAL file', 'Data file'], R) +
      note(s.k >= 1 ? chip('page dirty in memory', 'warn') : '', s.k < 4 ? chip('not durable yet', 'bad') : chip('durable: commit record on disk', 'ok'), s.k >= 6 ? chip('data file updated after the commit', 'acc') : '');
  };

  // 5.2 WAL records against page LSNs during replay
  P.replay = s => {
    const R = [
      ['0/1010', 'page 5: insert row', '0/0F00', chip('apply', 'ok')],
      ['0/1040', 'page 9: update row', '0/1100', chip('skip: page already newer', 'warn')],
      ['0/1080', 'commit of tx 71', '-', chip('tx 71 committed', 'acc')],
      ['0/10C0', 'page 5: insert by tx 72', '0/1010', chip('apply', 'ok')]
    ].slice(0, s.upto);
    const at = { crashed: 0, start: 1, replay: 2, done: 3 }[s.phase];
    return stages([['Crash', 'control file'], ['Redo point', 'LSN 0/1000'], ['Replay', 'record by record'], ['Consistent', 'accept clients']], at) +
      (R.length ? '<div style="margin-top:10px">' + table(['WAL record', 'Change', 'Page LSN on disk', 'Replay'], R.map(r => [e(r[0]), e(r[1]), e(r[2]), r[3]])) + '</div>' : '') +
      note(s.upto >= 4 ? chip('tx 72: no commit record, so its rows stay invisible', 'bad') : '');
  };

  // 5.3 WAL volume per interval and the torn page
  P.fpw = s => {
    let h = cap('WAL written per 30 seconds, one bar per interval (MB, example)') + s.bars.map((v, i) => meter(v, 130, v > 40 ? 'hot' : 'ok', 'interval ' + (i + 1) + ': ' + v + ' MB')).join('');
    if (s.torn) h += cap('One 8 kB page written as two 4 kB halves, crash after the first half') + cells([['4 kB new', 'warn'], ['4 kB old', 'bad']]);
    return h + note(s.ck ? chip('checkpoint completed: every page is clean', 'acc') : '', s.torn ? chip('full-page image in the WAL restores the page whole', 'ok') : '', s.long ? chip('longer checkpoint_timeout: fewer spikes, longer replay', 'ok') : '');
  };

  // 6.1 dead versions against the horizon
  P.horizon = s => (s.dels.length ? cap('Dead row versions, labelled by the transaction that deleted them. Green = older than the horizon, removable. Yellow = held back.') + cells(s.dels.map(d => [d, d >= s.horizon ? 'warn' : 'ok', 'deleted by tx ' + d])) : cap('No dead versions waiting.')) +
    '<div style="margin-top:10px">' + meter(s.size, 100, s.size > 60 ? 'bad' : 'ok', 'table size: ' + s.size + ' MB') + '</div>' +
    note(chip('horizon: oldest snapshot id ' + s.horizon, 'acc'), s.idle ? chip('idle in transaction, snapshot at 210', 'bad') : '', s.dels.length && s.dels.every(d => d < s.horizon) ? chip('all removable', 'ok') : '', s.dels.some(d => d >= s.horizon) ? chip('vacuum removes none of these', 'warn') : '');

  // 6.2 dead rows against the autovacuum threshold
  P.trigger = s => {
    const thr = 50 + s.sf * s.rows, scale = Math.max(thr * 1.4, s.dead * 1.15);
    return limitMeter('Dead rows ' + n(s.dead) + ' · autovacuum threshold ' + n(thr), s.dead, scale, thr, { h: 26 }) +
      '<div style="margin-top:10px">' + table(['Rows in table', 'scale_factor', 'Threshold = 50 + factor × rows'], [[n(s.rows), s.sf, n(thr)]]) + '</div>' +
      note(chip(s.dead > thr ? 'autovacuum starts' : 'autovacuum waits', s.dead > thr ? 'ok' : 'warn'), s.throttle ? chip('cost limit 200 · delay 2 ms · 3 workers share it', 'acc') : '', s.nap ? chip('checked every 1 minute (naptime)', 'acc') : '');
  };

  // 6.3 age of the oldest unfrozen row on the id axis
  P.xidring = s => {
    const color = s.age < 150 ? 'var(--ok)' : s.age < 200 ? 'var(--warn)' : s.age < 2060 ? 'var(--acc2)' : 'var(--bad)';
    return timeline({ max: 2300, height: 96, points: [{ at: s.age, top: 26, bg: color, title: 'age ' + s.age + ' million' }],
      marks: [{ at: 150, kind: 'fs' }, { at: 200, kind: 'fs' }, { at: 2060, kind: 'cr' }, { at: 2145, kind: 'cr' }],
      ticks: [{ at: 0, label: '0' }, { at: 150, label: '150M', top: 56 }, { at: 200, label: '200M', top: 72 }, { at: 2060, label: '2.06B', top: 56 }, { at: 2145, label: 'stop', top: 72 }],
      label: 'Age of the oldest unfrozen row, in millions of transaction ids. Dashed = vacuum thresholds, solid red = warning and stop.' }) +
      '<div style="margin-top:34px">' + strip(chip('age ' + n(s.age) + ' million', s.age < 150 ? 'ok' : s.age < 200 ? 'warn' : s.age < 2060 ? 'hot' : 'bad') + (s.mark ? chip(s.mark, ['warning', 'stop'].includes(s.mark) ? 'bad' : 'acc') : '')) + '</div>';
  };

  // 7.1 estimate against reality and the plan it chose
  P.estimate = s => cap('Rows with <code>status = \'pending\'</code> (million)') + meter(s.est, 14e6, 'acc', 'planner believes ' + n(s.est)) + meter(s.act, 14e6, s.act > s.est * 2 ? 'bad' : 'ok', 'reality ' + n(s.act)) +
    '<div style="margin-top:10px">' + table(['', 'Value'], [['Chosen plan', e(s.plan)], ['Estimate vs actual', s.act === s.est ? 'equal' : Math.round(s.act / s.est) + '× off']]) + '</div>' +
    note(s.stale ? chip('statistics older than the data', 'warn') : '', s.slow ? chip('13 million random index probes', 'bad') : '', s.analyzed ? chip('ANALYZE: sample of 30,000 rows', 'ok') : '', s.fixed ? chip('plan changed to Hash Join', 'ok') : '', s.tune ? chip('autoanalyze trigger: 50 + 10% of rows', 'acc') : '');

  // 7.2 hash join batches and where each lives
  P.batches = s => {
    const k = s.k;
    if (k === 0) return limitMeter('Hash table needed: 24 MB · allowed: 8 MB', 24, 30, 8, { h: 26 }) + note(chip('one in-memory table is impossible', 'bad'));
    let items;
    if (s.n === 1) items = [['batch 0 · 24 MB in memory', 'ok']];
    else {
      const cls = [['acc', 'acc', 'acc', 'acc'], ['ok', 'warn', 'warn', 'warn'], ['ok ring', 'warn', 'warn', 'warn'], ['ok', 'ok', 'ok', 'ok']][k - 1];
      const lab = [['6 MB', '6 MB', '6 MB', '6 MB'], ['memory', 'temp file', 'temp file', 'temp file'], ['joined', 'waiting', 'waiting', 'waiting'], ['joined', 'from disk', 'from disk', 'from disk']][k - 1];
      items = cls.map((c, i) => ['batch ' + i + ' · ' + lab[i], c]);
    }
    return cap('Batches of the hash join. Rows with equal keys always land in the same batch.') + cells(items) +
      note(chip('Hash  Batches: ' + s.n + '  Memory Usage: ' + (s.n === 1 ? '24MB' : '7500kB'), s.n === 1 ? 'ok' : 'warn'), s.n > 1 && k >= 2 ? chip('temp files: 3 build + 3 probe', 'warn') : '');
  };

  // 7.3 which rows each operator has touched
  P.pull = s => {
    const seq = ['paid', 'new', 'paid', 'new', 'new', 'paid'];
    const got = seq.slice(0, s.fetched).map(v => cell(v, v === 'paid' ? 'ok' : 'dim', v === 'paid' ? 'passes the filter' : 'rejected by the filter'));
    const rest = Array.from({ length: Math.max(0, 8 - s.fetched) }, () => cell('·', 'dim'));
    const rows = s.sort
      ? [['Limit 3', '3', '3'], ['Sort (top-N heapsort)', n(200000000), '3'], ['Seq Scan on orders', n(200000000), n(200000000)]]
      : [['Limit 3', s.emitted, s.emitted], ['Index Scan Backward + Filter', s.fetched, s.emitted]];
    return cap('Index entries in <code>created_at</code> order, newest first. Green = passes <code>status = paid</code>, grey = rejected, dots = never touched.') + strip(got.join('') + rest.join('')) +
      '<div style="margin-top:10px">' + table(['Operator', 'Rows read', 'Rows returned'], rows.map(r => r.map(x => e(x)))) + '</div>' +
      note(s.done ? chip('Limit has 3 rows: it stops asking', 'ok') : '', s.sort ? chip('Sort is blocking: no row out until all rows are in', 'bad') : '', s.explain ? chip('EXPLAIN ANALYZE: rows=3 vs rows=200000000', 'acc') : '');
  };

  // 8.1 messages between client, primary and standby for each synchronous_commit level
  P.syncwait = s => {
    const L = ['off', 'local', 'remote_write', 'on', 'remote_apply'], acks = ['written to the OS', 'flushed to disk', 'applied'], R = [{ from: 0, to: 1, text: 'COMMIT' }];
    if (s.level < 2) { R.push({ from: 1, to: 0, text: s.level === 0 ? 'OK (WAL not flushed yet)' : 'OK (local flush done)' }); R.push({ from: 1, to: 2, text: 'WAL stream (not waited for)' }); }
    else if (s.down) R.push({ from: 1, to: 2, text: 'WAL stream, standby unreachable', lost: true });
    else { R.push({ from: 1, to: 2, text: 'WAL stream' }); R.push({ from: 2, to: 1, text: 'ack: ' + acks[s.level - 2] }); R.push({ from: 1, to: 0, text: 'OK' }); }
    return lanes(['Client', 'Primary', 'Standby'], R) + note(...L.map((l, i) => chip(l, i === s.level ? 'acc' : 'dim')), s.down ? chip('COMMIT waits for a standby that is gone', 'bad') : '');
  };

  // 8.2 a long query on a standby against paused replay
  P.conflict = s => {
    const k = s.k, endR = [0, 8, 10, 25, 40, 40, 60][k], endP = k === 3 ? 25 : 40;
    const bands = [{ from: 0, to: endR, top: 14, height: 20 }].concat(k >= 3 ? [{ from: 10, to: endP, top: 42, height: 16 }] : []);
    const marks = (k >= 2 ? [{ at: 10, kind: 'fs' }] : []).concat(k === 4 || k === 5 ? [{ at: 40, kind: 'cr' }] : []);
    return timeline({ max: 60, height: 96, bands, marks, ticks: [{ at: 0, label: '0 s' }, { at: 10, label: '10 s', top: 70 }, { at: 40, label: '40 s', top: 70 }, { at: 60, label: '60 s' }], label: 'Standby timeline in seconds. Top bar: the report query. Lower bar: replay paused. Dashed: cleanup record. Red: cancel.' }) +
      '<div style="margin-top:34px">' + strip(chip('report query') + (k >= 3 ? chip('replay paused') : '')) +
      note(k >= 3 && k <= 4 ? chip('lag grows while replay waits', 'warn') : '', k === 4 ? chip('ERROR: canceling statement due to conflict with recovery', 'bad') : '', k === 5 ? chip('max_standby_streaming_delay = -1: lag has no bound', 'warn') : '', k === 6 ? chip('hot_standby_feedback = on: primary keeps dead rows, report finishes', 'ok') : '') + '</div>';
  };

  // 8.3 WAL retained on the primary disk by a slot
  P.slot = s => limitMeter('pg_wal on the primary: ' + s.gb + ' GB of a 100 GB disk' + (s.cap ? ' (cap 20 GB)' : ''), s.gb, 100, s.cap ? 20 : 90, { h: 26 }) +
    note(chip('slot: ' + s.slot, { active: 'ok', inactive: 'warn', lost: 'bad', dropped: 'ok' }[s.slot]), s.gb >= 100 ? chip('disk full: the primary cannot commit', 'bad') : '', s.cap ? chip('max_slot_wal_keep_size = 20GB', 'acc') : '');
})();
