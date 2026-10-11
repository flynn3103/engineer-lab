/* Pictures for the Redis system-design course: one form per use case, built from the shared picture kit (assets/course/kit.js).
 * A painter takes the whole scene for a step and returns HTML, so Back, Restart and jumping need no replay. */
(function () {
  'use strict';
  const { e, chip, cell, cap, strip, note, meter, limitMeter, cells, timeline, lanes, columns, table, stages, panels } = Course.kit;
  const P = CourseData.PAINT = {};

  // CRC16/XMODEM, the variant Redis Cluster uses. Self-check: "foo" -> slot 12182.
  function crc16(str) {
    let crc = 0;
    const b = new TextEncoder().encode(str);
    for (let i = 0; i < b.length; i++) {
      crc ^= b[i] << 8;
      for (let k = 0; k < 8; k++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  }
  const tagOf = key => { const a = key.indexOf('{'); if (a >= 0) { const z = key.indexOf('}', a + 1); if (z > a + 1) return key.slice(a + 1, z); } return key; };
  const slotOf = key => crc16(tagOf(key)) & 16383;
  const nodeOf = slot => (slot < 5461 ? 'A' : slot < 10923 ? 'B' : 'C');

  // 1.1 byte tape: bytes received, the frame boundary and when it runs
  P.tape = s => {
    const FR = '*2\r\n$4\r\nINCR\r\n$4\r\nhits\r\n', cuts = [10, 20, 24];
    let h = '';
    [...FR].forEach((c, i) => {
      h += cell(c === '\r' ? '␍' : c === '\n' ? '␊' : c, i < s.got ? (s.got === 24 ? 'ok' : 'on') : 'dim');
      if (cuts.includes(i + 1) && i + 1 <= s.got) h += '<span class="faint">│</span>';
    });
    return cap('Client query buffer: each box is one byte of the RESP frame (<code>␍␊</code> = CRLF). A bar marks the end of each TCP read.') + strip(h) +
      strip((s.got === 0 ? chip('no bytes yet') : s.got < 24 ? chip('incomplete: ' + (24 - s.got) + ' bytes still expected', 'warn') : chip('complete frame', 'ok')) + (s.exec ? chip('INCR hits executed once → :1', 'acc') : ''));
  };

  // 1.2 timelines: sequential versus pipelined
  P.lanes = s => {
    const MAX = 2.5, t = s.t;
    const doneA = Math.floor(t / 0.5 + 1e-9), doneB = t >= 0.5 ? 5 : 0;
    const row = (name, w, done, c) => cap(name + ' — replies: ' + done + ' of 5') + meter(w, MAX, c, w ? w.toFixed(1) + ' ms' : '');
    return cap('Time axis 0 to 2.5 ms (example round trip 0.5 ms).') +
      row('One at a time', Math.min(t, MAX), doneA, 'warn') + row('Pipelined (all five sent together)', Math.min(t, 0.5), doneB, 'ok') +
      '<div class="strip" style="justify-content:space-between"><span class="faint">0</span><span class="faint">0.5</span><span class="faint">1.0</span><span class="faint">1.5</span><span class="faint">2.0</span><span class="faint">2.5 ms</span></div>';
  };

  // 1.3 one executor with a queue
  P.swim = s => panels([{ title: 'Executor (one thread)', big: s.run, cls: s.run === 'idle' ? '' : 'acc' }], { wide: false }) +
    cap('Waiting in socket buffers') + strip(s.queue.map(x => chip(x, 'warn')).join(' ') || '<span class="faint">empty</span>') +
    (s.done.length ? cap('Finished') + table(null, s.done.map(x => [e(x[0]), e(x[1])])) : '');

  // 2.1 two gauges against their limits
  P.gauge = s => limitMeter('fields: ' + s.n + ' (limit 512)', s.n, 600, 512) + limitMeter('longest value: ' + s.len + ' B (limit 64)', s.len, 100, 64) +
    note(chip('encoding: ' + s.enc, s.enc === 'listpack' ? 'ok' : 'warn'), s.stuck ? chip('stays hashtable: no automatic downgrade', 'warn') : '');

  // 2.2 skip list with the search path
  P.skiplist = s => {
    const nodes = [['head', 0, 3], ['ann', 120, 1], ['bob', 180, 3], ['cho', 250, 2], ['dan', 310, 1], ['eve', 400, 2]];
    let h = cap('Skip list: each column is a member (score below). A member appears on every level up to its height.') + '<div class="sk" style="grid-template-columns:36px repeat(6,1fr);display:grid">';
    for (let L = 3; L >= 1; L--) {
      h += '<span class="faint">L' + L + '</span>';
      nodes.forEach(n => {
        if (L > n[2]) { h += '<span class="faint" style="text-align:center">·</span>'; return; }
        const visited = s.vis.includes(L + ':' + n[0]), out = L === 1 && s.out && s.out.includes(n[0]), found = s.found === n[0];
        h += cell(n[0], out ? 'ok' : found ? 'ok ring' : visited ? 'hot' : n[0] === 'head' ? 'dim' : '');
      });
    }
    h += '<span></span>' + nodes.map(n => '<span class="faint" style="text-align:center">' + (n[1] || '') + '</span>').join('') + '</div>';
    return h + (s.dict ? note(chip('dict: cho → 250', 'acc'), chip('O(1), no walk', 'ok')) : '');
  };

  // 2.3 two hash tables and the rehash index
  P.rehash = s => {
    const row = (name, a) => cap(name) + cells(a.map((n, i) => [n ? '●'.repeat(n) : '·', n ? 'on' : 'dim', 'bucket ' + i]));
    return (s.t0 ? row('table 0 (size ' + s.t0.length + ')', s.t0) : cap('table 0: freed')) + (s.t1 ? row('table 1 (size ' + s.t1.length + ')', s.t1) : cap('table 1: not allocated')) +
      strip(s.idx >= 0 ? chip('rehashidx = ' + s.idx + ' (buckets below it have moved)', 'warn') : chip('rehashidx = -1 (not rehashing)', 'ok'));
  };

  // 3.1 TTL keys: live, expired but stored, deleted; sample outlined
  P.sweep = s => cap('40 keys with a TTL. Outlined = in this sample.') +
    cells(s.keys.map((v, i) => [v === 2 ? '✕' : i, ['', 'warn', 'dim'][v] + (s.samp.includes(i) ? ' ring' : ''), 'key ' + i])) +
    strip(chip('live') + chip('expired, still in memory', 'warn') + chip('deleted ✕', 'bad'));

  // 3.2 idle-time strip with sample, victim, true oldest
  P.scatter = s => {
    const MAX = 1300;
    const points = s.idle.map((v, i) => { const sampled = s.samp.includes(i), victim = s.victim === i;
      return { at: v, top: (i % 4) * 16, title: 'idle ' + v + ' s', bg: victim ? 'var(--bad)' : sampled ? 'var(--acc)' : 'var(--mut)', opacity: sampled || victim ? 1 : .55, outline: victim }; });
    points.push({ at: s.idle[s.oldest], top: 64, label: '★ oldest', bg: 'none' });
    return timeline({ max: MAX, height: 90, points, ticks: [{ at: 0, label: '0 s' }, { at: 650, label: '650 s' }, { at: 1300, label: '1300 s' }],
      label: 'Each dot is a key placed by seconds since last use (0 to 1300 s). Blue = sampled, red ring = evicted.' });
  };

  // 3.3 used memory against the cap, plus command outcomes
  P.bullet = s => limitMeter('used_memory ' + s.used + ' GB of maxmemory ' + s.max + ' GB', s.used, 4.4, s.max, { h: 26, warnAt: s.max * .95 }) +
    '<div style="margin-top:10px">' + table(null, s.out.map(o => ['<code>' + e(o[0]) + '</code>', chip(o[1], o[2] ? 'ok' : 'bad')])) + '</div>';

  // 4.1 memory pages, shared or duplicated
  P.pages = s => {
    const copies = s.pages.reduce((a, b) => a + b, 0);
    const row = (name, arr, cls) => cap(name) + cells(arr.map((v, i) => ['p' + i + (v ? '×2' : ''), v ? 'hot' : cls]));
    return row('Parent (orange = page copied because the parent wrote it)', s.pages, 'on') +
      (s.child === 1 ? row('Child: frozen view of the fork instant', s.pages.map(() => 0), 'ok') + cap('Child progress writing dump.rdb') + meter(s.prog, 16, 'ok', s.prog + ' / 16 pages read') : '') +
      (s.child === 2 ? strip(chip('dump.rdb written and renamed; child exited', 'ok')) : '') +
      strip(chip('pages in use: ' + (16 + copies) + ' (16 + ' + copies + ' copies)', copies > 8 ? 'bad' : copies ? 'warn' : ''));
  };

  // 4.2 timeline of writes and fsyncs
  P.window = s => {
    const W = [0.2, 0.5, 0.9, 1.3, 1.8, 2.2, 2.5], F = [1, 2, 3];
    const upto = s.crash != null ? Math.min(s.t, s.crash) : s.t;
    const points = W.filter(w => w <= s.t).map(w => { const fs = s.always ? true : F.some(f => f >= w && f <= upto), lost = s.crash != null && !fs;
      return { at: w, top: (w * 10 % 4) * 14 + 8, title: 'write at ' + w + ' s', bg: 'var(--' + (lost ? 'bad' : fs ? 'ok' : 'warn') + ')' }; });
    const marks = F.filter(f => f <= upto).map(f => ({ at: f, kind: 'fs' })).concat(s.crash != null ? [{ at: s.crash, kind: 'cr' }] : []);
    return timeline({ max: 3.2, points, marks, ticks: [0, 1, 2, 3].map(x => ({ at: x, label: x + ' s' })), label: 'Dots = acknowledged writes. Green = on disk, amber = in OS cache only, red = lost. Dashed = fsync, solid red = crash.' }) +
      strip(chip(s.always ? 'appendfsync always: fsync before reply' : 'appendfsync everysec', s.always ? 'acc' : ''));
  };

  // 4.3 file set and their status
  P.ledger = s => table(null, s.files.map(f => ['<span' + (f[1] === 'gone' ? ' style="opacity:.5;text-decoration:line-through"' : '') + '><code>' + e(f[0]) + '</code></span>',
    chip(f[1], { live: 'ok', new: 'acc', old: 'warn', gone: 'bad' }[f[1]]), '<span class="faint">' + e(f[2]) + '</span>']));

  // 5.1 backlog window on an offset axis
  P.ring = s => {
    const inside = s.rep >= s.lo, c = inside ? 'ok' : 'bad';
    return timeline({ max: s.max, height: 84, bands: [{ from: s.lo, to: s.hi, top: 30, height: 24 }], marks: [{ at: s.rep, kind: 'cr', color: c }],
      ticks: [{ at: s.rep, label: 'replica ' + s.rep, top: 60, color: c, bold: true }, { at: s.hi, label: 'primary ' + s.hi, top: 8 }],
      label: 'Replication offsets in KB (example). Blue band = what the 1 MB backlog still holds.' }) +
      '<div style="margin-top:30px">' + strip(chip('backlog covers ' + s.lo + ' to ' + s.hi) + chip(inside ? 'replica offset is inside' : 'replica offset is outside', c) + (s.res ? chip('reply: +' + s.res, s.res === 'CONTINUE' ? 'ok' : 'warn') : '')) + '</div>';
  };

  // 5.2 message sequence across three lanes
  P.ack = s => lanes(['Client', 'Primary', 'Replica'], s.rows.map(r => ({ from: r.f, to: r.t, text: r.m, lost: r.lost })));

  // 5.3 offset bars: primary and each replica
  P.offsets = s => {
    const max = Math.max(1700, s.p), one = (name, v, withLag, c) => cap(name + ' offset ' + v + (withLag ? ' — lag ' + (s.p - v) : '')) + meter(v, max, c, '');
    return one('Primary', s.p, false, 'hot') + one('Replica 1', s.r[0], true, 'ok') + one('Replica 2', s.r[1], true, s.alert ? 'bad' : 'warn') +
      (s.wait ? note(chip(s.wait, s.wait.includes('timed') ? 'warn' : 'ok')) : '');
  };

  // 6.1 Sentinel opinions and the quorum counter
  P.votes = s => {
    const n = s.v.filter(x => x === 1).length;
    return panels(s.v.map((v, i) => ({ title: 'Sentinel ' + (i + 1), sub: v ? 'primary is SDOWN' : 'primary looks up', cls: v ? 'bad' : 'ok' })), { wide: false }) +
      cap('SDOWN reports against quorum ' + s.q) + meter(n, 3, n >= s.q ? 'bad' : 'warn', n + ' of ' + s.q + ' needed') +
      note(s.ask ? chip('asking: is-master-down-by-addr', 'acc') : '', s.odown ? chip('ODOWN: failover may start', 'bad') : chip('not ODOWN', 'ok'));
  };

  // 6.2 nodes grouped by role
  P.roles = s => {
    const col = (title, roles) => ({ title, items: s.nodes.filter(n => roles.includes(n[1])).map(n => ({ name: n[0], info: n[2], cls: { primary: 'ok', candidate: 'acc', down: 'bad', replica: '' }[n[1]] })) });
    return (s.leader ? strip(chip('leader: ' + s.leader, 'acc')) : '') + columns([col('Primary', ['primary']), col('Replicas', ['replica', 'candidate']), col('Down', ['down'])]);
  };

  // 6.3 two sides of a partition
  P.split = s => {
    const side = (o, cls) => ({ title: o.name, big: o.w, sub: 'writes acknowledged', cls, extra: o.refuse ? chip('-NOREPLICAS: refusing writes', 'warn') : '' });
    return panels([side(s.left, s.left.refuse ? 'warn' : s.part ? 'bad' : 'ok'), side(s.right, 'ok')]) +
      note(s.part ? chip('✂ network partition', 'bad') : chip('network healthy', 'ok'), s.lost ? chip(s.lost + ' acknowledged writes discarded', 'bad') : '', s.bounded ? chip('loss bounded by min-replicas-max-lag', 'ok') : '');
  };

  // 7.1 key to slot to node, computed here
  P.hash = s => table(['key', 'text hashed', 'slot', 'owner'], s.keys.map(k => { const sl = slotOf(k);
    return ['<code>' + e(k) + '</code>', '<code>' + e(tagOf(k)) + '</code>', String(sl), chip('node ' + nodeOf(sl), { A: 'acc', B: 'warn', C: 'ok' }[nodeOf(sl)])]; })) +
    note(chip('A: 0–5460', 'acc'), chip('B: 5461–10922', 'warn'), chip('C: 10923–16383', 'ok'), new Set(s.keys.map(slotOf)).size === 1 ? chip('all three share one slot', 'ok') : chip('slots differ'));

  // 7.2 two nodes, their slot state, and the redirect conversation
  P.redirect = s => {
    const node = (n, o) => ({ title: 'Node ' + n, sub: o[0], extra: '<div class="strip">' + (o[1].length ? o[1].map(k => cell(k, 'on')).join('') : '<span class="faint">no keys of slot 7638</span>') + '</div>' });
    return panels([node('A', s.a), node('B', s.b)]) + (s.lines.length ? cap('Requests and replies') + table(null, s.lines.map(l => ['<code>' + e(l[0]) + '</code>', chip(l[1], l[2] ? 'ok' : 'warn')])) : '');
  };

  // 7.3 slot blocks by owner, with keys and holes
  P.grid = s => {
    const col = ['var(--p0)', 'var(--p1)', 'var(--p2)'], hit = new Set((s.keys || []).map(k => slotOf(k) >> 9));
    const blocks = s.own.map((o, i) => '<span class="cell' + (hit.has(i) ? ' ring' : '') + '" style="min-width:20px;height:34px;background:' + (o < 0 ? 'var(--p5)' : col[o]) + '" title="slots ' + (i * 512) + '–' + (i * 512 + 511) + '">' + (o < 0 ? '✕' : '') + '</span>').join('');
    return cap('16384 slots as 32 blocks of 512. Colour = owner (A, B, C, schematic thirds); ✕ = no owner; ring = a key used in this step.') + '<div class="strip" style="gap:3px">' + blocks + '</div>' +
      strip(chip('A', 'acc') + chip('B', 'warn') + chip('C', 'ok') + (s.own.includes(-1) ? chip('uncovered slots', 'bad') : '') + (s.down ? chip('CLUSTERDOWN', 'bad') : '')) + (s.err ? strip('<code>' + e(s.err) + '</code>') : '');
  };

  // 8.1 two traces side by side
  P.diff = s => {
    const col = (title, rows) => ({ title, extra: rows.length ? table(null, rows.map(r => ['<code>' + e(r[0]) + '</code>', chip(r[1], /^-|nil|WRONGTYPE/.test(r[1]) ? 'bad' : r[1] === 'QUEUED' ? '' : 'ok')])) : '<span class="faint">nothing yet</span>' });
    return panels([col('Plain MULTI', s.a), col('Guarded by WATCH', s.b)]);
  };

  // 8.2 pending entries list
  P.pel = s => table(['entry', 'state', 'owner'], s.e.map(r => ['<code>' + e(r[0]) + '</code>', chip(r[1], { new: '', pending: 'warn', done: 'ok' }[r[1]]), e(r[2])])) + note(chip('group last-delivered-id: ' + s.ldi, 'acc'));

  // 8.3 publisher, two subscribers, and a stream
  P.fan = s => {
    const sub = (n, got, up) => ({ title: 'Subscriber ' + n, cls: up ? 'ok' : 'dim', extra: ' ' + chip(up ? 'connected' : 'offline', up ? 'ok' : 'bad') + '<div class="strip">' + (got.map(m => cell(m, 'ok')).join('') || '<span class="faint">nothing</span>') + '</div>' });
    return panels([{ title: 'Publisher', cls: 'acc', extra: '<div class="strip">' + s.pub.map(m => cell(m, 'on')).join('') + (s.res ? chip(s.res, 'acc') : '') + '</div>' }], { wide: false }) +
      '<div style="margin-top:8px">' + panels([sub('A', s.A, s.aUp), sub('B', s.B, s.bUp)]) + '</div>' +
      cap('Stream (kept until trimmed)') + strip(s.stream.map(m => cell(m, 'hot')).join('') + (s.fromStream ? chip('B reads m2 from the stream', 'ok') : '') + (s.cost ? chip('memory held until XTRIM', 'warn') : ''));
  };

  // 9 one write across the stages
  P.flow = s => stages([['1 · Route', 'CRC16 → slot → owner node'], ['2 · Read + parse', 'query buffer → RESP frame'], ['3 · Check + run', 'maxmemory, then the executor'], ['4 · Append + propagate', 'AOF buffer, replication stream'],
    ['5 · write() + reply', 'AOF to OS cache, then +OK'], ['6 · Later: fsync + replica', 'background, about a second'], ['7 · If the primary dies', 'two windows: fsync, replica lag']], s.at) +
    (s.at >= 4 ? note(chip('client already has +OK', 'ok'), s.at >= 5 ? chip('window 1: not fsynced', 'warn') + chip('window 2: replica behind', 'warn') : '') : '');

  CourseData.slotOf = slotOf;
})();
