/* Pictures for the Redis system-design course. One form per use case; each takes the whole scene for a step
 * and returns HTML, so Back, Restart and jumping need no replay. Colours come from CSS tokens (design.css). */
(function () {
  'use strict';
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chip = (t, c) => '<span class="tag ' + (c || '') + '">' + e(t) + '</span>';
  const cell = (t, c, title) => '<span class="cell ' + (c || '') + '"' + (title ? ' title="' + e(title) + '"' : '') + '>' + e(t) + '</span>';
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
  const bar = (v, max, cls, label) => '<div class="meter"><i class="' + (cls || '') + '" style="width:' + pct(v, max) + '%"></i><b>' + e(label || '') + '</b></div>';
  const lab = t => '<div class="cap">' + t + '</div>';

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
  const slotOf = key => {
    const a = key.indexOf('{');
    if (a >= 0) { const z = key.indexOf('}', a + 1); if (z > a + 1) key = key.slice(a + 1, z); }
    return crc16(key) & 16383;
  };
  const nodeOf = slot => (slot < 5461 ? 'A' : slot < 10923 ? 'B' : 'C');

  const P = {};

  // 1.1 byte tape: bytes received, the frame boundary and when it runs
  P.tape = s => {
    const FR = '*2\r\n$4\r\nINCR\r\n$4\r\nhits\r\n';
    const cuts = [10, 20, 24];
    let h = lab('Client query buffer: each box is one byte of the RESP frame (<code>␍␊</code> = CRLF). A bar marks the end of each TCP read.') + '<div class="strip">';
    [...FR].forEach((c, i) => {
      h += cell(c === '\r' ? '␍' : c === '\n' ? '␊' : c, i < s.got ? (s.got === 24 ? 'ok' : 'on') : 'dim');
      if (cuts.includes(i + 1) && i + 1 <= s.got) h += '<span class="faint">│</span>';
    });
    h += '</div>';
    h += '<div class="strip">' + (s.got === 0 ? chip('no bytes yet') : s.got < 24 ? chip('incomplete: ' + (24 - s.got) + ' bytes still expected', 'warn') : chip('complete frame', 'ok')) +
      (s.exec ? chip('INCR hits executed once → :1', 'acc') : '') + '</div>';
    return h;
  };

  // 1.2 timelines: sequential versus pipelined
  P.lanes = s => {
    const MAX = 2.5, t = s.t;
    const doneA = Math.floor(t / 0.5 + 1e-9), doneB = t >= 0.5 ? 5 : 0;
    const row = (name, w, done, c) => '<div class="cap">' + name + ' — replies: ' + done + ' of 5</div><div class="meter"><i class="' + c + '" style="width:' + pct(w, MAX) + '%"></i><b>' + (w ? e(w.toFixed(1)) + ' ms' : '') + '</b></div>';
    return lab('Time axis 0 to 2.5 ms (example round trip 0.5 ms).') +
      row('One at a time', Math.min(t, MAX), doneA, 'warn') +
      row('Pipelined (all five sent together)', Math.min(t, 0.5), doneB, 'ok') +
      '<div class="strip" style="justify-content:space-between"><span class="faint">0</span><span class="faint">0.5</span><span class="faint">1.0</span><span class="faint">1.5</span><span class="faint">2.0</span><span class="faint">2.5 ms</span></div>';
  };

  // 1.3 one executor with a queue
  P.swim = s => {
    const q = s.queue.map(x => chip(x, 'warn')).join(' ') || '<span class="faint">empty</span>';
    const d = s.done.map(x => '<tr><td>' + e(x[0]) + '</td><td>' + e(x[1]) + '</td></tr>').join('');
    return '<div class="panel ' + (s.run === 'idle' ? '' : 'acc') + '"><b>Executor (one thread)</b><div class="hero">' + e(s.run) + '</div></div>' +
      lab('Waiting in socket buffers') + '<div class="strip">' + q + '</div>' +
      (d ? lab('Finished') + '<table>' + d + '</table>' : '');
  };

  // 2.1 two gauges against their limits
  P.gauge = s => {
    const g = (name, v, max, lim, unit) => '<div class="cap">' + name + ': ' + v + unit + ' (limit ' + lim + ')</div><div class="meter" style="overflow:visible">' +
      '<i class="' + (v > lim ? 'bad' : 'ok') + '" style="width:' + pct(v, max) + '%"></i><span class="mark" style="left:' + pct(lim, max) + '%"></span></div>';
    return g('fields', s.n, 600, 512, '') + g('longest value', s.len, 100, 64, ' B') +
      '<div class="strip" style="margin-top:12px">' + chip('encoding: ' + s.enc, s.enc === 'listpack' ? 'ok' : 'warn') + (s.stuck ? chip('stays hashtable: no automatic downgrade', 'warn') : '') + '</div>';
  };

  // 2.2 skip list with the search path
  P.skiplist = s => {
    const nodes = [['head', 0, 3], ['ann', 120, 1], ['bob', 180, 3], ['cho', 250, 2], ['dan', 310, 1], ['eve', 400, 2]];
    let h = lab('Skip list: each column is a member (score below). A member appears on every level up to its height.') +
      '<div class="sk" style="grid-template-columns:36px repeat(6,1fr);display:grid">';
    for (let L = 3; L >= 1; L--) {
      h += '<span class="faint">L' + L + '</span>';
      nodes.forEach(n => {
        if (L > n[2]) { h += '<span class="faint" style="text-align:center">·</span>'; return; }
        const visited = s.vis.includes(L + ':' + n[0]);
        const out = L === 1 && s.out && s.out.includes(n[0]);
        const found = s.found === n[0];
        h += cell(n[0], out ? 'ok' : found ? 'ok ring' : visited ? 'hot' : n[0] === 'head' ? 'dim' : '');
      });
    }
    h += '<span></span>' + nodes.map(n => '<span class="faint" style="text-align:center">' + (n[1] || '') + '</span>').join('') + '</div>';
    if (s.dict) h += '<div class="strip" style="margin-top:10px">' + chip('dict: cho → 250', 'acc') + chip('O(1), no walk', 'ok') + '</div>';
    return h;
  };

  // 2.3 two hash tables and the rehash index
  P.rehash = s => {
    const row = (name, a, moved) => lab(name) + '<div class="strip">' + a.map((n, i) => cell(n ? '●'.repeat(n) : '·', n ? 'on' : 'dim', 'bucket ' + i)).join('') + '</div>';
    const t0 = s.t0 ? row('table 0 (size ' + s.t0.length + ')', s.t0.map((n, i) => n), s.idx) : lab('table 0: freed');
    const t1 = s.t1 ? row('table 1 (size ' + s.t1.length + ')', s.t1) : lab('table 1: not allocated');
    return t0 + t1 + '<div class="strip">' + (s.idx >= 0 ? chip('rehashidx = ' + s.idx + ' (buckets below it have moved)', 'warn') : chip('rehashidx = -1 (not rehashing)', 'ok')) + '</div>';
  };

  // 3.1 TTL keys: live, expired but stored, deleted; sample outlined
  P.sweep = s => {
    const kind = ['', 'warn', 'dim'];
    const cells = s.keys.map((v, i) => '<span class="cell ' + kind[v] + (s.samp.includes(i) ? ' ring' : '') + '" title="key ' + i + '">' + (v === 2 ? '✕' : i) + '</span>').join('');
    return lab('40 keys with a TTL. Outlined = in this sample.') + '<div class="strip">' + cells + '</div>' +
      '<div class="strip">' + chip('live', '') + chip('expired, still in memory', 'warn') + chip('deleted ✕', 'bad') + '</div>';
  };

  // 3.2 idle-time strip with sample, victim, true oldest
  P.scatter = s => {
    const MAX = 1300;
    let dots = '';
    s.idle.forEach((v, i) => {
      const sampled = s.samp.includes(i), victim = s.victim === i;
      const bg = victim ? 'var(--bad)' : sampled ? 'var(--acc)' : 'var(--mut)';
      dots += '<span class="pt" title="idle ' + v + ' s" style="left:' + pct(v, MAX) + '%;top:' + ((i % 4) * 16) + 'px;background:' + bg + ';opacity:' + (sampled || victim ? 1 : .55) + (victim ? ';outline:2px solid var(--bad);outline-offset:2px' : '') + '"></span>';
    });
    dots += '<span class="pt" style="left:' + pct(s.idle[s.oldest], MAX) + '%;top:56px;background:none;color:var(--warn);font-size:15px;line-height:12px;width:auto">★ oldest</span>';
    return lab('Each dot is a key placed by seconds since last use (0 to 1300 s). Blue = sampled, red ring = evicted.') +
      '<div class="tl">' + dots + '<span class="tick" style="left:0">0 s</span><span class="tick" style="left:50%">650 s</span><span class="tick" style="left:100%">1300 s</span></div>';
  };

  // 3.3 used memory against the cap, plus command outcomes
  P.bullet = s => {
    const rows = s.out.map(o => '<tr><td><code>' + e(o[0]) + '</code></td><td>' + chip(o[1], o[2] ? 'ok' : 'bad') + '</td></tr>').join('');
    return '<div class="cap">used_memory ' + s.used + ' GB of maxmemory ' + s.max + ' GB</div><div class="meter" style="overflow:visible;height:26px">' +
      '<i class="' + (s.used > s.max ? 'bad' : s.used > s.max * .95 ? 'warn' : 'ok') + '" style="width:' + pct(s.used, 4.4) + '%"></i><span class="mark" style="left:' + pct(s.max, 4.4) + '%"></span></div>' +
      '<table style="margin-top:10px">' + rows + '</table>';
  };

  // 4.1 memory pages, shared or duplicated
  P.pages = s => {
    const copies = s.pages.reduce((a, b) => a + b, 0);
    const row = (name, arr, cls) => lab(name) + '<div class="strip">' + arr.map((v, i) => cell(v ? 'p' + i + '×2' : 'p' + i, v ? 'hot' : cls)).join('') + '</div>';
    let h = row('Parent (orange = page copied because the parent wrote it)', s.pages, 'on');
    if (s.child === 1) h += row('Child: frozen view of the fork instant', s.pages.map(() => 0), 'ok') + lab('Child progress writing dump.rdb') + bar(s.prog, 16, 'ok', s.prog + ' / 16 pages read');
    if (s.child === 2) h += '<div class="strip">' + chip('dump.rdb written and renamed; child exited', 'ok') + '</div>';
    return h + '<div class="strip">' + chip('pages in use: ' + (16 + copies) + ' (16 + ' + copies + ' copies)', copies > 8 ? 'bad' : copies ? 'warn' : '') + '</div>';
  };

  // 4.2 timeline of writes and fsyncs
  P.window = s => {
    const W = [0.2, 0.5, 0.9, 1.3, 1.8, 2.2, 2.5], F = [1, 2, 3], MAXT = 3.2;
    const cap = s.crash != null ? Math.min(s.t, s.crash) : s.t;
    let h = '';
    W.forEach(w => {
      if (w > s.t) return;
      const fs = s.always ? true : F.some(f => f >= w && f <= cap);
      const lost = s.crash != null && !fs;
      h += '<span class="pt" title="write at ' + w + ' s" style="left:' + pct(w, MAXT) + '%;top:' + (w * 10 % 4 * 14 + 8) + 'px;background:var(--' + (lost ? 'bad' : fs ? 'ok' : 'warn') + ')"></span>';
    });
    F.forEach(f => { if (f <= cap) h += '<span class="fs" style="left:' + pct(f, MAXT) + '%"></span>'; });
    if (s.crash != null) h += '<span class="cr" style="left:' + pct(s.crash, MAXT) + '%"></span>';
    h += [0, 1, 2, 3].map(x => '<span class="tick" style="left:' + pct(x, MAXT) + '%">' + x + ' s</span>').join('');
    return lab('Dots = acknowledged writes. Green = on disk, amber = in OS cache only, red = lost. Dashed = fsync, solid red = crash.') + '<div class="tl">' + h + '</div>' +
      '<div class="strip">' + chip(s.always ? 'appendfsync always: fsync before reply' : 'appendfsync everysec', s.always ? 'acc' : '') + '</div>';
  };

  // 4.3 file set and their status
  P.ledger = s => '<table>' + s.files.map(f => {
    const c = { live: 'ok', new: 'acc', old: 'warn', gone: 'bad' }[f[1]];
    return '<tr' + (f[1] === 'gone' ? ' style="opacity:.5;text-decoration:line-through"' : '') + '><td><code>' + e(f[0]) + '</code></td><td>' + chip(f[1], c) + '</td><td class="faint">' + e(f[2]) + '</td></tr>';
  }).join('') + '</table>';

  // 5.1 backlog window on an offset axis
  P.ring = s => {
    const inside = s.rep >= s.lo, c = inside ? 'ok' : 'bad';
    return lab('Replication offsets in KB (example). Blue band = what the 1 MB backlog still holds.') +
      '<div class="tl" style="height:84px"><div style="position:absolute;top:30px;height:24px;left:' + pct(s.lo, s.max) + '%;width:' + pct(s.hi - s.lo, s.max) + '%;background:var(--p0);border:1px solid var(--t0);border-radius:5px"></div>' +
      '<span class="cr" style="left:' + pct(s.rep, s.max) + '%;border-left-color:var(--' + c + ')"></span>' +
      '<span class="tick" style="left:' + pct(s.rep, s.max) + '%;bottom:auto;top:60px;color:var(--' + c + ');font-weight:700">replica ' + s.rep + '</span>' +
      '<span class="tick" style="left:' + pct(s.hi, s.max) + '%;bottom:auto;top:8px">primary ' + s.hi + '</span></div>' +
      '<div class="strip" style="margin-top:30px">' + chip('backlog covers ' + s.lo + ' to ' + s.hi, '') + chip(inside ? 'replica offset is inside' : 'replica offset is outside', c) + (s.res ? chip('reply: +' + s.res, s.res === 'CONTINUE' ? 'ok' : 'warn') : '') + '</div>';
  };

  // 5.2 message sequence across three lanes
  P.ack = s => {
    let h = '<div class="lane"><div class="hd">Client</div><div class="hd">Primary</div><div class="hd">Replica</div></div>';
    s.rows.forEach(r => {
      if (r.f === r.t) h += '<div class="lane"><div style="grid-column:' + (r.f + 1) + '/' + (r.f + 2) + '">' + chip(r.m, 'bad') + '</div></div>';
      else {
        const a = Math.min(r.f, r.t), b = Math.max(r.f, r.t);
        h += '<div class="lane"><div class="arrow ' + (r.lost ? 'lost' : '') + '" style="grid-column:' + (a + 1) + '/' + (b + 2) + '">' + (r.f > r.t ? '◀ ' : '') + e(r.m) + (r.lost && r.f < r.t ? ' ✕' : '') + (r.f < r.t ? ' ▶' : '') + '</div></div>';
      }
    });
    return h;
  };

  // 5.3 offset bars: primary and each replica
  P.offsets = s => {
    const max = Math.max(1700, s.p);
    const one = (name, v, p, c) => '<div class="cap">' + name + ' offset ' + v + (p != null ? ' — lag ' + (s.p - v) : '') + '</div>' + bar(v, max, c, '');
    return one('Primary', s.p, null, 'hot') + one('Replica 1', s.r[0], 1, s.alert ? 'ok' : 'ok') + one('Replica 2', s.r[1], 1, s.alert ? 'bad' : 'warn') +
      (s.wait ? '<div class="strip" style="margin-top:10px">' + chip(s.wait, s.wait.includes('timed') ? 'warn' : 'ok') + '</div>' : '');
  };

  // 6.1 Sentinel opinions and the quorum counter
  P.votes = s => {
    const n = s.v.filter(x => x === 1).length;
    return '<div class="cols" style="--n:3">' + s.v.map((v, i) => '<div class="panel ' + (v ? 'bad' : 'ok') + '"><b>Sentinel ' + (i + 1) + '</b><div>' + (v ? 'primary is SDOWN' : 'primary looks up') + '</div></div>').join('') + '</div>' +
      lab('SDOWN reports against quorum ' + s.q) + bar(n, 3, n >= s.q ? 'bad' : 'warn', n + ' of ' + s.q + ' needed') +
      '<div class="strip" style="margin-top:10px">' + (s.ask ? chip('asking: is-master-down-by-addr', 'acc') : '') + (s.odown ? chip('ODOWN: failover may start', 'bad') : chip('not ODOWN', 'ok')) + '</div>';
  };

  // 6.2 nodes grouped by role
  P.roles = s => {
    const col = (title, roles) => '<div><div class="cap">' + title + '</div>' + s.nodes.filter(n => roles.includes(n[1])).map(n =>
      '<div class="panel ' + ({ primary: 'ok', candidate: 'acc', down: 'bad', replica: '' }[n[1]]) + '" style="margin:6px 0"><b>' + e(n[0]) + '</b><div class="faint">' + e(n[2]) + '</div></div>').join('') + '</div>';
    return (s.leader ? '<div class="strip">' + chip('leader: ' + s.leader, 'acc') + '</div>' : '') +
      '<div class="cols wide" style="--n:3">' + col('Primary', ['primary']) + col('Replicas', ['replica', 'candidate']) + col('Down', ['down']) + '</div>';
  };

  // 6.3 two sides of a partition
  P.split = s => {
    const side = (o, cls) => '<div class="panel ' + cls + '"><b>' + e(o.name) + '</b><div class="hero">' + o.w + '</div><div class="faint">writes acknowledged</div>' + (o.refuse ? chip('-NOREPLICAS: refusing writes', 'warn') : '') + '</div>';
    return '<div class="cols wide" style="--n:2">' + side(s.left, s.left.refuse ? 'warn' : s.part ? 'bad' : 'ok') + side(s.right, 'ok') + '</div>' +
      '<div class="strip" style="margin-top:10px">' + (s.part ? chip('✂ network partition', 'bad') : chip('network healthy', 'ok')) + (s.lost ? chip(s.lost + ' acknowledged writes discarded', 'bad') : '') + (s.bounded ? chip('loss bounded by min-replicas-max-lag', 'ok') : '') + '</div>';
  };

  // 7.1 key to slot to node, computed here
  P.hash = s => {
    const rows = s.keys.map(k => { const sl = slotOf(k); const a = k.indexOf('{'), z = k.indexOf('}', a + 1); const tag = a >= 0 && z > a + 1 ? k.slice(a + 1, z) : k;
      return '<tr><td><code>' + e(k) + '</code></td><td><code>' + e(tag) + '</code></td><td>' + sl + '</td><td>' + chip('node ' + nodeOf(sl), { A: 'acc', B: 'warn', C: 'ok' }[nodeOf(sl)]) + '</td></tr>'; }).join('');
    const same = new Set(s.keys.map(slotOf)).size === 1;
    return '<table><tr><th>key</th><th>text hashed</th><th>slot</th><th>owner</th></tr>' + rows + '</table>' +
      '<div class="strip" style="margin-top:10px">' + chip('A: 0–5460', 'acc') + chip('B: 5461–10922', 'warn') + chip('C: 10923–16383', 'ok') + (same ? chip('all three share one slot', 'ok') : chip('slots differ', '')) + '</div>';
  };

  // 7.2 two nodes, their slot state, and the redirect conversation
  P.redirect = s => {
    const node = (n, o) => '<div class="panel"><b>Node ' + n + '</b><div class="faint">' + e(o[0]) + '</div><div class="strip">' + (o[1].length ? o[1].map(k => cell(k, 'on')).join('') : '<span class="faint">no keys of slot 7638</span>') + '</div></div>';
    const lines = s.lines.map(l => '<tr><td><code>' + e(l[0]) + '</code></td><td>' + chip(l[1], l[2] ? 'ok' : 'warn') + '</td></tr>').join('');
    return '<div class="cols wide" style="--n:2">' + node('A', s.a) + node('B', s.b) + '</div>' + (lines ? lab('Requests and replies') + '<table>' + lines + '</table>' : '');
  };

  // 7.3 slot blocks by owner, with keys and holes
  P.grid = s => {
    const col = ['var(--p0)', 'var(--p1)', 'var(--p2)'];
    const hit = new Set((s.keys || []).map(k => slotOf(k) >> 9));
    const cells = s.own.map((o, i) => '<span class="cell' + (hit.has(i) ? ' ring' : '') + '" style="min-width:20px;height:34px;background:' + (o < 0 ? 'var(--p5)' : col[o]) + ';border-color:' + (o < 0 ? 'var(--bad)' : 'var(--line)') + '" title="slots ' + (i * 512) + '–' + (i * 512 + 511) + '">' + (o < 0 ? '✕' : '') + '</span>').join('');
    return lab('16384 slots as 32 blocks of 512. Colour = owner (A, B, C, schematic thirds); ✕ = no owner; ring = a key used in this step.') + '<div class="strip" style="gap:3px">' + cells + '</div>' +
      '<div class="strip">' + chip('A', 'acc') + chip('B', 'warn') + chip('C', 'ok') + (s.own.includes(-1) ? chip('uncovered slots', 'bad') : '') + (s.down ? chip('CLUSTERDOWN', 'bad') : '') + '</div>' +
      (s.err ? '<div class="strip"><code>' + e(s.err) + '</code></div>' : '');
  };

  // 8.1 two traces side by side
  P.diff = s => {
    const col = (title, rows) => '<div class="panel"><b>' + title + '</b><table>' + (rows.length ? rows.map(r => '<tr><td><code>' + e(r[0]) + '</code></td><td>' + chip(r[1], /^-|nil|WRONGTYPE/.test(r[1]) ? 'bad' : r[1] === 'QUEUED' ? '' : 'ok') + '</td></tr>').join('') : '<tr><td class="faint">nothing yet</td></tr>') + '</table></div>';
    return '<div class="cols wide" style="--n:2">' + col('Plain MULTI', s.a) + col('Guarded by WATCH', s.b) + '</div>';
  };

  // 8.2 pending entries list
  P.pel = s => '<table><tr><th>entry</th><th>state</th><th>owner</th></tr>' + s.e.map(r =>
    '<tr><td><code>' + e(r[0]) + '</code></td><td>' + chip(r[1], { new: '', pending: 'warn', done: 'ok' }[r[1]]) + '</td><td>' + e(r[2]) + '</td></tr>').join('') + '</table>' +
    '<div class="strip" style="margin-top:10px">' + chip('group last-delivered-id: ' + s.ldi, 'acc') + '</div>';

  // 8.3 publisher, two subscribers, and a stream
  P.fan = s => {
    const sub = (n, got, up) => '<div class="panel ' + (up ? 'ok' : 'dim') + '"><b>Subscriber ' + n + '</b> ' + chip(up ? 'connected' : 'offline', up ? 'ok' : 'bad') + '<div class="strip">' + (got.map(m => cell(m, 'ok')).join('') || '<span class="faint">nothing</span>') + '</div></div>';
    return '<div class="panel acc"><b>Publisher</b> <div class="strip">' + s.pub.map(m => cell(m, 'on')).join('') + (s.res ? chip(s.res, 'acc') : '') + '</div></div>' +
      '<div class="cols wide" style="--n:2;margin-top:8px">' + sub('A', s.A, s.aUp) + sub('B', s.B, s.bUp) + '</div>' +
      lab('Stream (kept until trimmed)') + '<div class="strip">' + s.stream.map(m => cell(m, 'hot')).join('') + (s.fromStream ? chip('B reads m2 from the stream', 'ok') : '') + (s.cost ? chip('memory held until XTRIM', 'warn') : '') + '</div>';
  };

  // 9 one write across the stages
  P.flow = s => {
    const st = [['1 · Route', 'CRC16 → slot → owner node'], ['2 · Read + parse', 'query buffer → RESP frame'], ['3 · Check + run', 'maxmemory, then the executor'], ['4 · Append + propagate', 'AOF buffer, replication stream'],
      ['5 · write() + reply', 'AOF to OS cache, then +OK'], ['6 · Later: fsync + replica', 'background, about a second'], ['7 · If the primary dies', 'two windows: fsync, replica lag']];
    return '<div class="rd-flow" style="gap:6px">' + st.map((x, i) => '<div style="flex:1 1 130px;' + (i === s.at ? 'border-color:var(--acc);background:var(--p0)' : i < s.at ? 'border-color:var(--ok)' : 'opacity:.5') + '"><b>' + e(x[0]) + '</b><small>' + e(x[1]) + '</small></div>').join('') + '</div>' +
      (s.at >= 4 ? '<div class="strip" style="margin-top:10px">' + chip('client already has +OK', 'ok') + (s.at >= 5 ? chip('window 1: not fsynced', 'warn') + chip('window 2: replica behind', 'warn') : '') + '</div>' : '');
  };

  RD.PAINT = P;
  RD.slotOf = slotOf;
})();
