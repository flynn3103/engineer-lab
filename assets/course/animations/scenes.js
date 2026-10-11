/* Reusable scheduling, memory, exchange, join, output and evidence scene forms. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (w, h, body, label) => `<svg class="vz-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

  function paintTicks(stage, sim, k) {
    const W = 560, H = 170, L = 34, R = 14, T = 14, B = 26, n = sim.steps.length;
    const X = i => L + i * (W - L - R) / (n - 1), Y = v => T + (1 - v / 4) * (H - T - B);
    const grid = [0, 1, 2, 3, 4].map(v => `<line class="vz-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="vz-tick" x="${L - 10}" y="${Y(v) + 4}">${v}</text>`).join('');
    const seen = sim.steps.slice(0, k + 1).map(s => s.v);
    const pts = seen.map((v, i) => `${X(i)},${Y(v.free)}`).join(' ');
    const dots = seen.map((v, i) => `<circle class="vz-dot${i === k ? ' now' : ''}" cx="${X(i)}" cy="${Y(v.free)}" r="${i === k ? 6 : 4}"/>`).join('');
    const v = sim.steps[k].v;
    const slots = Array.from({ length: 4 }, (_, i) => `<span class="vz-slot ${i < v.run ? 'busy' : 'free'}">${i < v.run ? 'running' : 'free'}</span>`).join('');
    stage.innerHTML = `${svg(W, H, `${grid}<polyline class="vz-line" points="${pts}"/>${dots}<text class="vz-axis" x="${L}" y="${H - 6}">free slots, one point per step</text>`, 'Free slots over time')}
      <div class="vz-row"><span class="vz-lab">slots</span>${slots}<span class="vz-chip">queue: ${v.queue}</span></div>`;
    return `free slots: ${v.free} · running: ${v.run} · queued: ${v.queue}`;
  }

  /* schedule:2 · a kanban board: one column per state, one card per attempt. */
  const COLS = ['Waiting', 'Launched', 'Running', 'Finished', 'Failed', 'Late · ignored'];
  function paintKanban(stage, sim, k) {
    const cards = sim.steps[k].v.cards;
    const cols = COLS.map((c, i) => `<div class="vz-col"><b>${c}</b>${cards.filter(x => x.col === i).map(x => `<div class="vz-card c${i}${x.ghost ? ' ghost' : ''}"><span>${x.id}</span><small>${esc(x.note || '')}</small></div>`).join('')}</div>`).join('');
    stage.innerHTML = `<div class="vz-board">${cols}</div>`;
    return `attempts: ${cards.filter(x => !x.ghost).length} · terminal: ${cards.filter(x => x.col >= 3 && x.col <= 4 && !x.ghost).length}`;
  }

  /* shuffle:1 · stacked bars per location. Each segment is one word, coloured by the reducer that owns it. */
  function paintStacked(stage, sim, k) {
    const v = sim.steps[k].v, MAX = 6;
    const row = (label, segs) => `<div class="vz-hrow"><span class="vz-lab">${label}</span><div class="vz-hbar">${segs.map(([w, n, r]) => `<span class="vz-seg r${r}${v.assign ? ' tag' : ''}" style="width:${n / MAX * 100}%">${esc(w)}${n > 1 ? ' ' + n : ''}</span>`).join('')}</div></div>`;
    const raw = v.raw ? `<div class="vz-hrow"><span class="vz-lab">records</span><div class="vz-hbar">${v.mem.map(([w, , r]) => `<span class="vz-seg r${r}" style="width:${100 / MAX}%">${esc(w)} 1</span>`).join('')}</div></div>` : '';
    const body = v.raw ? raw : `${v.mem.length ? row('memory', v.mem) : ''}${v.run.length ? row('disk run', v.run) : ''}${v.file.length ? row('data file', v.file) : ''}`;
    const idx = v.index ? `<div class="vz-note">index: reducer 0 starts at byte 0 · reducer 1 starts at byte 40</div>` : '';
    const drv = v.driver ? `<div class="vz-note warn">driver receives: file addresses only (no rows)</div>` : '';
    stage.innerHTML = `<div class="vz-stack">${body}</div>${idx}${drv}<div class="vz-key"><span class="vz-sw r0">reducer 0 · bird, cat</span><span class="vz-sw r1">reducer 1 · dog</span></div>`;
    const total = [...(v.mem || []), ...(v.run || []), ...(v.file || [])].reduce((a, s) => a + s[1], 0);
    return v.raw ? 'records in: 6' : `counts held: ${total} · files: ${v.file.length ? 1 : 0} · driver rows: 0`;
  }

  /* shuffle:2 · one progress lane per host, with a cap of two requests in the air at once. */
  function paintLanes(stage, sim, k) {
    const v = sim.steps[k].v, cap = 2;
    const lanes = v.lanes.map(l => `<div class="vz-lane ${l.s}"><span class="vz-lab">host ${l.h}</span><div class="vz-track"><span style="width:${l.p}%"></span></div><small>${l.s === 'wait' ? 'queued' : l.s === 'done' ? 'fetched' : l.s === 'fetch' ? 'in flight' : ''}</small></div>`).join('');
    const slots = Array.from({ length: cap }, (_, i) => `<span class="vz-slot ${i < (v.inflight || 0) ? 'busy' : 'free'}">${i < (v.inflight || 0) ? 'request' : 'free'}</span>`).join('');
    const msg = !v.known ? (v.asked ? 'asking the driver for addresses…' : 'addresses unknown') : '';
    const merge = v.merge ? `<div class="vz-sum">${v.merge.map(([h, n]) => `<span class="vz-chip">${h}: ${n}</span>`).join('<b>+</b>')}<b>=</b><strong>${v.merge.reduce((a, x) => a + x[1], 0)}</strong></div>` : '';
    stage.innerHTML = `<div class="vz-lanes">${lanes || `<p class="vz-empty">${msg}</p>`}</div>
      <div class="vz-row"><span class="vz-lab">in flight, cap ${cap}</span>${slots}</div>${merge}${v.freed ? '<div class="vz-note">each part is released after use: buffers stay empty</div>' : ''}`;
    return `in flight: ${v.inflight || 0} of ${cap} · fetched: ${v.lanes.filter(l => l.s === 'done').length} of ${v.lanes.length || 3}`;
  }

  /* memory:1 · used memory over time as an area with the pool limit. Runs written to disk are counted below. */
  function paintSawtooth(stage, sim, k) {
    const W = 560, H = 170, L = 40, R = 14, T = 14, B = 26, n = sim.steps.length, CAP = 128;
    const X = i => L + i * (W - L - R) / (n - 1), Y = m => T + (1 - m / 160) * (H - T - B);
    const seen = sim.steps.slice(0, k + 1).map(s => s.v);
    const pts = seen.map((v, i) => `${X(i)},${Y(v.used)}`);
    const area = `${L},${Y(0)} ${pts.join(' ')} ${X(seen.length - 1)},${Y(0)}`;
    const v = sim.steps[k].v;
    const capLine = `<line class="vz-cap" x1="${L}" x2="${W - R}" y1="${Y(CAP)}" y2="${Y(CAP)}"/><text class="vz-axis" x="${W - R}" y="${Y(CAP) - 6}" text-anchor="end">pool limit 128 MB</text>`;
    const body = `${capLine}<polygon class="vz-area" points="${area}"/><polyline class="vz-line" points="${pts.join(' ')}"/>${seen.map((s, i) => `<circle class="vz-dot${i === k ? ' now' : ''}" cx="${X(i)}" cy="${Y(s.used)}" r="${i === k ? 6 : 4}"/>`).join('')}${v.refused ? `<text class="vz-warn" x="${X(k)}" y="${Y(128) - 12}" text-anchor="middle">refused</text>` : ''}`;
    const runs = Array.from({ length: v.runs }, (_, i) => `<span class="vz-run">run ${i + 1}</span>`).join('');
    stage.innerHTML = `${svg(W, H, body, 'Memory used over time')}<div class="vz-row"><span class="vz-lab">on disk</span>${runs || '<span class="vz-chip">none</span>'}${v.merge ? '<span class="vz-chip">merging runs + memory</span>' : ''}</div>`;
    return `in memory: ${v.used} MB · runs on disk: ${v.runs}`;
  }

  /* memory:2 · bullet gauge against the container limit. Spark's own books cover 8 GB; the rest is hidden. */
  function paintBullet(stage, sim, k) {
    const v = sim.steps[k].v, MAX = 13, pct = x => x / MAX * 100;
    const total = v.acc + v.hidden;
    const over = total > v.limit;
    stage.innerHTML = `<div class="vz-bullet">
        <div class="vz-btrack">
          <span class="vz-bacc" style="width:${pct(v.acc)}%"></span>
          <span class="vz-bhid${v.killed ? ' dead' : ''}" style="left:${pct(v.acc)}%;width:${pct(v.hidden)}%"></span>
          <span class="vz-bcap" style="left:${pct(8)}%"><em>Spark books 8 GB</em></span>
          <span class="vz-blim" style="left:${pct(v.limit)}%"><em>container limit ${v.limit} GB</em></span>
        </div>
        <div class="vz-scale"><span>0</span><span>4</span><span>8</span><span>12 GB</span></div>
        <div class="vz-row"><span class="vz-chip">Spark accounted: ${v.acc} GB</span><span class="vz-chip">hidden: ${v.hidden} GB</span><span class="vz-chip ${over ? 'bad' : ''}">total: ${total} GB</span>${v.refused ? '<span class="vz-chip warn">next request refused: spill</span>' : ''}${v.killed ? '<span class="vz-chip bad">OS kills the container</span>' : ''}${v.fixed ? '<span class="vz-chip good">overhead room added</span>' : ''}</div>
      </div>`;
    return `total ${total} GB · limit ${v.limit} GB${v.killed ? ' · killed' : over ? ' · over limit' : ''}`;
  }

  /* recovery:1 · map outputs as a heatmap: producer rows, worker columns. Each cell is one output's state. */
  const HEAT_ROWS = ['map 1', 'map 2', 'map 3'], HEAT_COLS = ['worker X', 'worker Y', 'surviving workers'];
  const HEAT_LABEL = { ok: 'registered', lost: 'lost', fail: 'fetch failed', struck: 'struck off', rerun: 'rerunning' };
  function paintHeat(stage, sim, k) {
    const v = sim.steps[k].v, key = { 'map 1': 'm1', 'map 2': 'm2', 'map 3': 'm3' };
    const cell = (r, c) => {
      const st = v.cells[key[HEAT_ROWS[r]] + 'XYZ'[c]];
      return st ? `<div class="vz-hcell ${st}"><span>${HEAT_LABEL[st]}</span></div>` : '<div class="vz-hcell empty"><span>–</span></div>';
    };
    const head = HEAT_COLS.map((c, i) => `<div class="vz-hhead${i === 0 && v.dead ? ' dead' : ''}">${c}${i === 0 && v.dead ? ' · dead' : ''}</div>`).join('');
    const rows = HEAT_ROWS.map((r, ri) => `<div class="vz-hlab">${r}</div>${[0, 1, 2].map(c => cell(ri, c)).join('')}`).join('');
    stage.innerHTML = `<div class="vz-heat"><div></div>${head}${rows}</div>${v.reducers ? '<div class="vz-note good">reducers: all three map outputs fetched, merge continues</div>' : ''}`;
    const ok = Object.values(v.cells).filter(s => s === 'ok').length;
    return `registered outputs: ${ok} of 3 · ${v.dead ? 'worker X dead' : 'all workers alive'}`;
  }

  /* recovery:2 · strip plot: one dot per attempt, placed at its elapsed run time. A dashed median marks the norm. */
  function paintStrip(stage, sim, k) {
    const v = sim.steps[k].v, W = 560, H = 190, L = 110, R = 16, MAX = 60;
    const X = s => L + s / MAX * (W - L - R);
    const row = (y, label) => `<text class="vz-tick" x="${L - 10}" y="${y + 4}" text-anchor="end">${label}</text><line class="vz-grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/>`;
    const quick = Array.from({ length: 9 }, (_, i) => `<circle class="vz-dot ok" cx="${X(10) + (i - 4) * 5}" cy="40" r="4"/>`).join('');
    const med = v.med ? `<line class="vz-cap" x1="${X(10)}" x2="${X(10)}" y1="22" y2="${H - 28}"/><text class="vz-axis" x="${X(10) + 6}" y="30">median 10 s</text>` : '';
    const c1 = v.c1 != null ? `<circle class="vz-dot${v.killed ? ' dead' : ' hot'}" cx="${X(v.c1)}" cy="112" r="7"/>` : '';
    const c2 = v.c2 != null ? `<circle class="vz-dot${v.won ? ' ok' : ' now'}" cx="${X(v.c2)}" cy="150" r="7"/>` : '';
    const ticks = [0, 10, 20, 30, 40, 50, 60].map(s => `<text class="vz-tick" x="${X(s)}" y="${H - 6}" text-anchor="middle">${s}s</text>`).join('');
    const body = `${row(40, 'tasks 1–6, 8–9')}${row(112, 'task 7 · copy 1')}${row(150, 'task 7 · copy 2')}${quick}${med}${c1}${c2}${ticks}${v.won ? `<text class="vz-axis" x="${X(v.c2) + 10}" y="154">won</text>` : ''}${v.killed ? `<text class="vz-warn" x="${X(v.c1) + 10}" y="116">killed</text>` : ''}`;
    stage.innerHTML = svg(W, H, body, 'Attempt durations as dots');
    return `copy 1: ${v.killed ? 'killed' : v.c1 + ' s'} · copy 2: ${v.c2 == null ? 'not started' : v.won ? 'won at ' + v.c2 + ' s' : v.c2 + ' s'}`;
  }

  /* commit:1 · ledger of publish requests, the two temporary folders, and the final folder. */
  function paintLedger(stage, sim, k) {
    const v = sim.steps[k].v;
    const folder = (name, files, gone) => `<div class="vz-folder${gone ? ' gone' : ''}"><b>${name}</b>${gone ? '<small>deleted</small>' : files.map(f => `<span class="vz-file">${f}</span>`).join('') || '<small>empty</small>'}</div>`;
    const rows = v.ledger.map(r => `<tr class="${r.ans}"><td>${r.who}</td><td>part-0</td><td>${r.ans === 'pending' ? '…' : r.ans === 'yes' ? 'yes · winner' : 'no · refused'}</td></tr>`).join('');
    stage.innerHTML = `<div class="vz-commit">
        <div class="vz-col2">${folder('attempt 1 · temp', v.t1)}${folder('attempt 2 · temp', v.t2, v.gone)}</div>
        <div class="vz-ledger"><b>coordinator ledger</b><table><tr><th>who</th><th>part</th><th>answer</th></tr>${rows || '<tr><td colspan="3" class="vz-empty">no requests yet</td></tr>'}</table></div>
        <div class="vz-col2">${folder('final folder', v.final)}</div>
      </div>`;
    return `winners for part-0: ${v.ledger.filter(r => r.ans === 'yes').length} of 1`;
  }

  /* commit:2 · file tree of the output folder, with what a reader sees. The _SUCCESS marker is the readiness signal. */
  function paintFileTree(stage, sim, k) {
    const v = sim.steps[k].v;
    const files = [0, 1, 2, 3].map(i => i < v.parts ? `<div class="vz-tree-row ok">├── part-${i}</div>` : `<div class="vz-tree-row todo">├── part-${i} <small>not yet</small></div>`).join('');
    const marker = v.marker ? '<div class="vz-tree-row mark">└── _SUCCESS</div>' : '<div class="vz-tree-row todo">└── _SUCCESS <small>not written</small></div>';
    const reader = v.reader ? `<div class="vz-note ${v.failed ? 'warn' : ''}">${esc(v.reader)}</div>` : '';
    const check = v.check ? `<div class="vz-note good">${esc(v.check)}</div>` : '';
    stage.innerHTML = `<div class="vz-tree"><b>output/</b>${files}${marker}</div>${check}${reader}`;
    return `parts visible: ${v.parts} of 4 · marker: ${v.marker ? 'present' : 'absent'}`;
  }

  /* sql:1 · the query strip (one box per planner step) and the two volume bars that shrink after the rewrite. */
  const SQL_STEPS = ['Parse', 'Check names', 'Optimize', 'Physical plan', 'Tasks'];
  function paintFlow(stage, sim, k) {
    const v = sim.steps[k].v;
    const strip = SQL_STEPS.map((s, i) => `<div class="vz-sstep${i === v.at ? ' now' : i < v.at ? ' past' : ''}">${s}</div>`).join('');
    const bar = (label, pct, text) => `<div class="vz-vol"><span class="vz-lab">${label}</span><div class="vz-track big"><span style="width:${pct}%"></span></div><small>${text}</small></div>`;
    const ex = v.ex ? '<div class="vz-note warn">exchange by city: rows of one city are gathered into one task</div>' : '';
    const tasks = v.tasks ? `<div class="vz-row">${Array.from({ length: v.tasks }, (_, i) => `<span class="vz-chip">stage ${i + 1}</span>`).join('')}</div>` : '';
    stage.innerHTML = `<div class="vz-strip">${strip}</div>
      ${bar('columns read', v.cols / 12 * 100, v.cols + ' of 12')}
      ${bar('rows read', v.rows, v.rows === 100 ? 'every row' : 'only age > 30 rows')}
      ${v.names ? '<div class="vz-row"><span class="vz-chip good">users ✓</span><span class="vz-chip good">city ✓</span><span class="vz-chip good">age ✓</span></div>' : ''}${ex}${tasks}`;
    return `columns read: ${v.cols} · rows read: ${v.rows}%`;
  }

  /* sql:2 · waterfall of partial counts per city. Each task's partial total stacks on the one before it. */
  function paintWaterfall(stage, sim, k) {
    const v = sim.steps[k].v, MAX = 70, pct = x => x / MAX * 100;
    const bars = (label, parts, total) => {
      let acc = 0;
      const segs = parts.map(([t, n]) => { const s = `<span class="vz-wf" style="left:${pct(acc)}%;width:${pct(n)}%"><em>${t} ${n}</em></span>`; acc += n; return s; }).join('');
      return `<div class="vz-hrow"><span class="vz-lab">${label}</span><div class="vz-wtrack">${segs}${total ? `<span class="vz-wfin" style="width:${pct(total)}%"><em>total ${total}</em></span>` : ''}</div></div>`;
    };
    const quiet = v.mode === 'none' || v.mode === 'unknown';
    const hanoi = quiet ? [] : v.mode === 'inplace' ? [['in place', 65]] : [['task 1', 40], ['task 2', 25]];
    const hue = quiet ? [] : v.mode === 'inplace' ? [['in place', 15]] : [['task 1', 10], ['task 2', 5]];
    const fin = v.mode === 'final';
    stage.innerHTML = `<div class="vz-wf-chart">${bars('Hanoi', hanoi, fin ? 65 : 0)}${bars('Hue', hue, fin ? 15 : 0)}</div>
      <div class="vz-note">${v.mode === 'unknown' ? 'the planner does not know how the child is split yet' : v.mode === 'inplace' ? 'every city is whole inside one task: nothing crosses the network' : v.mode === 'sent' ? 'only these small partial totals cross the network' : v.mode === 'final' ? 'each reducer adds its parts; same answer as one count' : v.mode === 'partial' ? 'each task counts what it has first' : ''}</div>`;
    return v.mode === 'final' ? 'Hanoi 65 · Hue 15' : v.mode === 'sent' ? 'rows moved: small partial totals only' : v.mode === 'inplace' ? 'stages: 1 · rows moved: 0' : 'partial totals: ' + (v.mode === 'partial' ? 'counted per task' : 'pending');
  }

  /* joins:1 · broadcast: size bars, then the driver and one copy of the small table on each worker. */
  function paintFanout(stage, sim, k) {
    const v = sim.steps[k].v, s = v.s;
    const copies = ['copies', 'stream', 'match'].includes(s);
    const hash = ['hash', 'copies', 'stream', 'match'].includes(s);
    const workers = [1, 2, 3, 4].map(i => `<div class="vz-wk"><b>worker ${i}</b><div class="vz-part">orders part ${i} · stays here</div>${copies ? '<div class="vz-part small">cities copy</div>' : ''}${s === 'stream' || s === 'match' ? '<small>orders read one by one, each looked up</small>' : ''}</div>`).join('');
    stage.innerHTML = `<div class="vz-bcast">
        <div class="vz-sizes"><div class="vz-hrow"><span class="vz-lab">orders</span><div class="vz-hbar"><span class="vz-seg big" style="width:100%">1 billion rows</span></div></div>
        <div class="vz-hrow"><span class="vz-lab">cities</span><div class="vz-hbar"><span class="vz-seg small" style="width:3%">200</span></div></div></div>
        <div class="vz-driver ${s === 'collect' ? 'lit' : ''}"><b>driver</b><small>${hash ? 'hash table: city id → row' : s === 'collect' ? 'collecting 200 cities' : 'waiting'}</small></div>
        <div class="vz-wks">${workers}</div>
      </div>${s === 'match' ? `<div class="vz-note good">${esc(v.dup)}</div>` : ''}`;
    return s === 'match' ? 'matches kept: one per copy of each duplicate' : `cities collected: ${['collect', 'hash', 'copies', 'stream', 'match'].includes(s) ? 200 : 0} · orders moved: 0`;
  }

  /* joins:2 · scatter of rows by key. Rows move into one reducer lane per key class; probe links matches. */
  const SCAT = [
    { t: 'A', k: 1, w: 0 }, { t: 'A', k: 2, w: 1 }, { t: 'A', k: 3, w: 2 }, { t: 'A', k: 4, w: 3 },
    { t: 'B', k: 1, w: 1 }, { t: 'B', k: 2, w: 2 }, { t: 'B', k: 3, w: 0 }, { t: 'B', k: 4, w: 3 }
  ];
  function paintScatter(stage, sim, k) {
    const v = sim.steps[k].v, W = 560, H = 230;
    const srcX = w => 70 + w * 120, srcY = t => t === 'A' ? 50 : 80;
    const red = key => key % 2 === 1 ? 0 : 1, redX = r => r === 0 ? 170 : 400, redY = (t, i) => 150 + (t === 'A' ? 0 : 36) + i * 0;
    const pos = d => {
      if (!(v.moved && v.moved[d.t])) return { x: srcX(d.w), y: srcY(d.t) };
      const sameLane = SCAT.filter(o => o.t === d.t && red(o.k) === red(d.k));
      const idx = sameLane.indexOf(d);
      return { x: redX(red(d.k)) + (idx - 1.5) * 30, y: redY(d.t, 0) };
    };
    const lanes = [0, 1, 2, 3].map(w => `<text class="vz-tick" x="${srcX(w)}" y="22" text-anchor="middle">worker ${w + 1}</text>`).join('')
      + (v.rule ? `<text class="vz-axis" x="${redX(0)}" y="140" text-anchor="middle">keys 1, 3 → reducer 0</text><text class="vz-axis" x="${redX(1)}" y="140" text-anchor="middle">keys 2, 4 → reducer 1</text>` : '');
    const dots = SCAT.map(d => { const p = pos(d); return `<g class="vz-pt k${d.k % 2 ? 0 : 1}" transform="translate(${p.x},${p.y})">${d.t === 'A' ? `<circle r="9"/>` : `<rect x="-8" y="-8" width="16" height="16"/>`}<text y="4">${d.k}</text></g>`; }).join('');
    const probe = v.probe ? [1, 2, 3, 4].map(k => {
      const a = SCAT.find(d => d.t === 'A' && d.k === k), b = SCAT.find(d => d.t === 'B' && d.k === k), pa = pos(a), pb = pos(b);
      return `<line class="vz-link" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
    }).join('') : '';
    stage.innerHTML = svg(W, H, `${lanes}${probe}${dots}<text class="vz-axis" x="${W - 6}" y="${H - 6}" text-anchor="end">● table A   ■ table B   colour = key class</text>`, 'Rows by key');
    return v.probe ? 'matching rows are side by side' : v.moved && (v.moved.A || v.moved.B) ? `moved: ${v.moved.A ? 'A' : ''}${v.moved.A && v.moved.B ? ' + ' : ''}${v.moved.B ? 'B' : ''}` : 'rows still where they were';
  }

  /* adaptive:1 · histogram of partition sizes against the target. Planned guesses fade out once the real sizes arrive. */
  const REAL = [2, 2, 2, 60, 2], TARGET = 16;
  function paintHistogram(stage, sim, k) {
    const v = sim.steps[k].v, W = 560, H = 190, L = 36, B = 30, T = 14, n = REAL.length, bw = (W - L - 14) / n;
    const Y = m => T + (1 - m / 64) * (H - T - B);
    const bars = REAL.map((m, i) => {
      const x = L + i * bw + 8, w = bw - 16;
      if (!v.real) return `<rect class="vz-plan" x="${x}" y="${Y(20)}" width="${w}" height="${Y(0) - Y(20)}"/>`;
      const cls = v.flag && i === 3 ? 'hot' : v.merged && i < 3 ? 'merge' : 'ok';
      return `<rect class="vz-bar ${cls}" x="${x}" y="${Y(m)}" width="${w}" height="${Y(0) - Y(m)}"/><text class="vz-tick" x="${x + w / 2}" y="${Y(0) + 16}" text-anchor="middle">part ${i}</text><text class="vz-axis" x="${x + w / 2}" y="${Y(m) - 6}" text-anchor="middle">${m} MB</text>`;
    }).join('');
    const tgt = `<line class="vz-cap" x1="${L}" x2="${W - 14}" y1="${Y(TARGET)}" y2="${Y(TARGET)}"/><text class="vz-axis" x="${W - 14}" y="${Y(TARGET) - 6}" text-anchor="end">target 16 MB</text>`;
    const brace = v.merged ? `<rect class="vz-group" x="${L + 6}" y="${Y(10) - 10}" width="${3 * bw - 12}" height="${Y(0) - Y(10) + 10}"/><text class="vz-axis" x="${L + 1.5 * bw}" y="${Y(10) - 16}" text-anchor="middle">6 MB → one task</text>` : '';
    const lbl = v.real ? '' : `<text class="vz-axis" x="${W / 2}" y="${H / 2}" text-anchor="middle">planned: five equal guesses of 20 MB</text>`;
    let layout = '';
    if (v.layout) layout = `<div class="vz-row"><span class="vz-chip good">task: parts 0–2 · 6 MB</span><span class="vz-chip warn">task: part 3 · split into ranges</span><span class="vz-chip">task: part 4 · 2 MB</span></div>`;
    stage.innerHTML = `${svg(W, H, `${tgt}${bars}${brace}${lbl}`, 'Partition sizes')}${layout}`;
    return v.real ? `parts: ${n} · largest: ${Math.max(...REAL)} MB · target ${TARGET} MB` : 'planned sizes, not real yet';
  }

  /* adaptive:2 · donut of partition shares. The hot partition is split into three slices, each joined with its own copy. */
  function paintDonut(stage, sim, k) {
    const v = sim.steps[k].v, parts = v.slices, total = parts.reduce((a, b) => a + b, 0);
    const cx = 110, cy = 110, r = 88, ri = 52;
    let a0 = -Math.PI / 2;
    const arc = (sz, cls, i) => {
      const a1 = a0 + sz / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const P = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)], Q = a => [cx + ri * Math.cos(a), cy + ri * Math.sin(a)];
      const [x0, y0] = P(a0), [x1, y1] = P(a1), [x2, y2] = Q(a1), [x3, y3] = Q(a0);
      a0 = a1;
      return `<path class="vz-slice ${cls}" d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z"/>`;
    };
    const slices = parts.map((sz, i) => {
      const cls = v.split && i >= 2 && i <= 4 ? `h${i - 2}` : i === 2 && v.flag ? 'hot' : 'lo';
      return arc(sz, cls, i);
    });
    const legend = `<div class="vz-legend"><span class="vz-sw lo">small partitions · 3 MB each</span>${v.flag ? '<span class="vz-sw hot">flagged: 300 MB</span>' : ''}${v.split ? '<span class="vz-sw h0">range 1</span><span class="vz-sw h1">range 2</span><span class="vz-sw h2">range 3</span>' : ''}</div>`;
    const copies = v.copies ? `<div class="vz-note">other side: the matching Hanoi rows are copied ×3</div>` : '';
    const reducers = v.reducers ? `<div class="vz-row"><span class="vz-chip h0">reducer 1 · range 1 ⋈ copy</span><span class="vz-chip h1">reducer 2 · range 2 ⋈ copy</span><span class="vz-chip h2">reducer 3 · range 3 ⋈ copy</span></div>` : '';
    const done = v.done ? '<div class="vz-note good">three outputs joined end to end: every match produced exactly once</div>' : '';
    stage.innerHTML = `<div class="vz-donut-wrap">${svg(220, 220, `${slices.join('')}<text class="vz-donut-c" x="${cx}" y="${cy + 6}" text-anchor="middle">${total} MB</text>`, 'Partition shares')}<div>${legend}</div></div>${copies}${reducers}${done}`;
    return v.split ? 'hot partition split into 3 ranges' : v.flag ? 'partition 2 is 100× the median' : 'partitions: 4 · one of them is huge';
  }

  /* evidence:1 · an event tape: each event is one cell. The listener bus, log writer queue and live counter sit beside it. */
  const EVENTS = ['task 1 end', 'task 2 end', 'task 3 end', 'task 4 end', 'task 5 end', 'task 6 end'];
  function paintTape(stage, sim, k) {
    const v = sim.steps[k].v;
    const tape = EVENTS.slice(0, v.ev).map((e, i) => `<div class="vz-ev ${i < v.written ? 'logged' : 'queued'}"><span>E${i + 1}</span><small>${e}</small></div>`).join('') || '<small class="vz-empty">no event yet</small>';
    const bus = v.bus ? '<div class="vz-note">event posted to the bus; scheduling continues at once</div>' : '';
    stage.innerHTML = `<div class="vz-tape">${tape}</div>
      <div class="vz-lanes2">
        <div class="vz-lane2"><span class="vz-lab">log writer queue</span><div class="vz-track"><span style="width:${v.writer / 4 * 100}%"></span></div><small>${v.writer} waiting</small></div>
        <div class="vz-lane2"><span class="vz-lab">live counters</span><div class="vz-track"><span style="width:${v.live / 6 * 100}%"></span></div><small>${v.live} tasks counted</small></div>
      </div>${bus}${v.slow ? '<div class="vz-note good">scheduler: not waiting for the disk. Its decisions are the same either way.</div>' : ''}`;
    return `events on tape: ${v.ev} · written to log: ${v.written || 0} · queued: ${v.writer}`;
  }

  /* evidence:2 · a finished job's log as one bar of events. A cursor replays it, and the rebuilt counts fill in. */
  const SEG = ['APP_START', 'JOB_START', 'STAGE_1', 'TASKS', 'STAGE_DONE', 'PLAN', 'JOB_END', 'JOB_START', 'STAGE_2', 'TASKS', 'STAGE_DONE', 'APP_END'];
  function paintSegments(stage, sim, k) {
    const v = sim.steps[k].v;
    const segs = SEG.map((s, i) => `<div class="vz-seg2 ${!v.found ? 'off' : i < v.cur ? 'read' : i === v.cur ? 'now' : ''}"><small>${s}</small></div>`).join('');
    const cnt = [['jobs', v.jobs], ['stages', v.stages], ['tasks', v.tasks], ['plan', v.plan]].map(([l, n]) => `<div class="vz-cnt"><b>${n == null ? '–' : n}</b><small>${l}</small></div>`).join('');
    const match = v.match ? '<div class="vz-note good">the rebuilt view matches the live view</div>' : '';
    stage.innerHTML = `<div class="vz-logfile"><b>${v.found ? 'app-42 · event log' : 'event log folder'}</b><div class="vz-segs">${segs}</div></div><div class="vz-counts">${cnt}</div>${match}`;
    return v.found ? `events replayed: ${v.cur} of ${SEG.length}` : 'log not opened yet';
  }

  /* build:1 · a 12-tile mosaic of input rows, grouped into partitions. Partial totals and the final answer sum to 640. */
  const ROWS = [40, 60, 50, 70, 80, 30, 90, 55, 45, 65, 25, 30];
  function paintMosaic(stage, sim, k) {
    const v = sim.steps[k].v;
    const groups = [0, 1, 2, 3].map(g => {
      const sum = ROWS.slice(g * 3, g * 3 + 3).reduce((a, b) => a + b, 0);
      const tiles = ROWS.slice(g * 3, g * 3 + 3).map((x, j) => {
        const i = g * 3 + j;
        const st = v.lost === g && !v.replayed ? 'lost' : v.lost === g ? 'replay' : v.parts ? 'part' : v.rows ? 'raw' : 'off';
        return `<div class="vz-tile ${st}"><span>${v.rows || v.parts ? x : '·'}</span><small>row ${i + 1}</small></div>`;
      }).join('');
      const label = v.parts ? `<small class="vz-gsum">partition ${g}: ${sum}</small>` : `<small class="vz-gsum">partition ${g}</small>`;
      return `<div class="vz-group2 ${v.lost === g ? 'lost' : ''}">${label}<div class="vz-tiles">${tiles}</div></div>`;
    }).join('');
    const opts = v.opts ? `<div class="vz-row"><span class="vz-chip">memory: small</span><span class="vz-chip">worker loss: on</span><span class="vz-chip">speculation: off</span></div>` : v.alt ? `<div class="vz-row"><span class="vz-chip good">memory: large</span><span class="vz-chip">worker loss: on</span><span class="vz-chip">speculation: on</span></div>` : '';
    const shuf = v.shuf ? '<div class="vz-note">reducers fetch partial totals; spilled runs merge at the end</div>' : '';
    const pub = v.pub ? `<div class="vz-answer"><b>answer</b><strong>${ROWS.reduce((a, b) => a + b, 0)}</strong><small>one attempt per partition published</small></div>` : '';
    stage.innerHTML = `${opts}<div class="vz-mosaic">${groups}</div>${shuf}${pub}`;
    return v.pub ? 'answer: 640 · published once per partition' : v.lost != null ? 'partition 1 lost: replaying only it' : 'rows: 12 · partitions: 4';
  }

  /* schedule:3 · locality ladder: one lane per level. The bar is the wait at the current level; the dot is where the task ran. */
  const LEVELS = ['PROCESS_LOCAL', 'NODE_LOCAL', 'RACK_LOCAL', 'ANY'];
  function paintLadder(stage, sim, k) {
    const v = sim.steps[k].v, W = 560, H = 190, L = 130, R = 16, MAX = 12;
    const X = s => L + s / MAX * (W - L - R), Y = i => 30 + i * 40;
    const lanes = LEVELS.map((name, i) => {
      const bar = v.level === i && v.t > v.since ? `<rect class="vz-wait" x="${X(v.since)}" y="${Y(i) - 8}" width="${X(v.t) - X(v.since)}" height="16" rx="4"/>` : '';
      const ran = v.ran === i ? `<circle class="vz-dot ok" cx="${X(v.t)}" cy="${Y(i)}" r="7"/>` : '';
      const gave = v.passed.includes(i) ? `<text class="vz-axis" x="${X(MAX)}" y="${Y(i) - 8}" text-anchor="end">gave up</text>` : '';
      return `<text class="vz-tick" x="${L - 12}" y="${Y(i) + 4}" text-anchor="end">${name}</text><line class="vz-grid" x1="${L}" x2="${W - R}" y1="${Y(i)}" y2="${Y(i)}"/>${bar}${ran}${gave}`;
    }).join('');
    const ticks = [0, 3, 6, 9, 12].map(s => `<text class="vz-tick" x="${X(s)}" y="${H - 6}" text-anchor="middle">${s}s</text>`).join('');
    stage.innerHTML = svg(W, H, lanes + ticks, 'Locality levels over time');
    if (v.zero) return 'spark.locality.wait = 0: no waiting';
    return v.ran == null ? `waiting at ${LEVELS[v.level]} · ${v.t} s` : `ran at ${LEVELS[v.ran]} after ${v.t} s`;
  }

  /* schedule:4 · failure budget: one cell per attempt of one task, out of spark.task.maxFailures. */
  function paintBudget(stage, sim, k) {
    const v = sim.steps[k].v, LIM = 4, used = v.att.filter(x => x === 'fail').length;
    const label = { fail: 'failed', ok: 'succeeded', run: 'running', none: 'not yet' };
    const cells = Array.from({ length: LIM }, (_, i) => `<div class="vz-bud ${v.att[i] || 'none'}"><b>attempt ${i}</b><small>${label[v.att[i] || 'none']}</small></div>`).join('');
    stage.innerHTML = `<div class="vz-row"><span class="vz-lab">task 7</span><span class="vz-chip">${used} of ${LIM} failures used</span></div>
      <div class="vz-budget">${cells}</div>${v.abort ? '<div class="vz-note warn">limit reached: the job is aborted with the last error</div>' : ''}`;
    return `failures: ${used} of ${LIM}${v.abort ? ' · job aborted' : ''}`;
  }

  /* schedule:5 · executor cores as cells. A task takes spark.task.cpus adjacent cells, so the slot count is cores / cpus. */
  function paintCores(stage, sim, k) {
    const v = sim.steps[k].v, N = v.cores, owner = Array(N).fill(null);
    v.tasks.forEach(t => (t.at || []).forEach(c => { owner[c] = t; }));
    const cells = owner.map((t, c) => `<div class="vz-core ${t ? 'run' : 'free'}"><small>core ${c + 1}</small><b>${t ? t.id : 'free'}</b></div>`).join('');
    const waiting = v.tasks.filter(t => t.s === 'wait').map(t => `<span class="vz-chip warn">${t.id} waits: needs ${v.cpus} cores</span>`).join('');
    stage.innerHTML = `<div class="vz-cores" style="grid-template-columns:repeat(${N},minmax(0,1fr))">${cells}</div>
      <div class="vz-row">${waiting}<span class="vz-chip">spark.task.cpus = ${v.cpus}</span><span class="vz-chip">slots = ${N} / ${v.cpus} = ${Math.floor(N / v.cpus)}</span></div>`;
    return `tasks running: ${v.tasks.filter(t => t.s !== 'wait').length} · free cores: ${owner.filter(x => !x).length}`;
  }

  /* shuffle:3 · write path: the checks, then either temp files per reducer or one sorted run, then the output and open-file count. */
  function paintPaths(stage, sim, k) {
    const v = sim.steps[k].v, shown = Math.min(v.tmp, 8);
    const checks = v.checks ? `<div class="vz-row">${v.checks.map(([t, ok]) => `<span class="vz-chip ${ok ? 'good' : 'warn'}">${esc(t)}</span>`).join('')}</div>` : '';
    const tmps = Array.from({ length: shown }, (_, i) => `<span class="vz-tmp">r${i}.tmp</span>`).join('') + (v.tmp > shown ? `<span class="vz-chip">+${v.tmp - shown} more</span>` : '');
    const tmpRow = v.tmp ? `<div class="vz-hrow"><span class="vz-lab">temp files</span><div class="vz-tmps">${tmps}</div></div>` : '';
    const sortRow = v.sorted ? `<div class="vz-hrow"><span class="vz-lab">sorted run</span><div class="vz-hbar"><span class="vz-seg r0" style="width:100%">records sorted by reducer id</span></div></div>` : '';
    const out = v.data ? `<div class="vz-row"><span class="vz-lab">output</span><span class="vz-file">data file</span>${v.index ? '<span class="vz-file">index file</span>' : ''}${v.merged ? '<small class="vz-empty">segments joined end to end</small>' : ''}</div>` : '';
    const open = v.open != null ? `<div class="vz-row"><span class="vz-lab">files open at once</span><span class="vz-chip ${v.open > 200 ? 'bad' : 'good'}">${v.open}</span></div>` : '';
    stage.innerHTML = `${checks}${tmpRow}${sortRow}${out}${open}`;
    return v.path ? `write path: ${v.path} · reducers: ${v.R}` : `reducers: ${v.R} · path not chosen yet`;
  }

  /* shuffle:4 · where each range is read from: same executor, same host, other host. Only the last group uses the network. */
  function paintRoutes(stage, sim, k) {
    const v = sim.steps[k].v, label = { wait: 'waiting', disk: 'read from disk', net: 'over the network', done: 'done' };
    const group = (title, sub, states) => `<div class="vz-route"><b>${title}</b><small>${sub}</small>${states.map((s, i) => `<div class="vz-block ${s}"><span>range ${i + 1}</span><small>${label[s]}</small></div>`).join('')}</div>`;
    const net = v.R.filter(s => s === 'net' || s === 'done').length, disk = [...v.L, ...v.H].filter(s => s === 'disk' || s === 'done').length;
    stage.innerHTML = `<div class="vz-routes">${group('same executor', 'no socket', v.L)}${group('same host', 'another executor, same machine', v.H)}${group('other host', 'crosses the network', v.R)}</div>
      <div class="vz-row"><span class="vz-chip">from disk: ${disk}</span><span class="vz-chip">over network: ${net}</span>${v.cap ? '<span class="vz-chip warn">network cap: 2 requests in flight</span>' : ''}</div>`;
    return `from disk: ${disk} of 5 local · over network: ${net} of 3`;
  }

  /* shuffle:5 · blocks explode as maps times reducers. Bars show the totals; the last row shows the size of each block. */
  function paintExplode(stage, sim, k) {
    const v = sim.steps[k].v, blocks = v.M * v.R, MAX = 4e6, kb = 8e6 / blocks, fmt = n => n.toLocaleString('en-US');
    const row = (label, val, pct, cls) => `<div class="vz-hrow"><span class="vz-lab">${label}</span><div class="vz-track big"><span class="${cls}" style="width:${Math.min(100, pct)}%"></span></div><small class="vz-num">${val}</small></div>`;
    const plan = v.planned ? `<div class="vz-note good">planned ${fmt(v.planned)} reduce partitions, merged at run time to ${fmt(v.R)}</div>` : '';
    const note = v.note ? `<div class="vz-note">${esc(v.note)}</div>` : '';
    stage.innerHTML = `<div class="vz-explode">
        ${row('map outputs', fmt(v.M), v.M / 4000 * 100, 'f0')}
        ${row('reduce tasks', fmt(v.R), v.R / 4000 * 100, 'f1')}
        ${row('blocks = M × R', fmt(blocks), blocks / MAX * 100, 'f2')}
        ${row('fetches per reducer', fmt(v.M), v.M / 4000 * 100, 'f0')}
        <div class="vz-row"><span class="vz-lab">average block</span><span class="vz-chip ${kb < 100 ? 'bad' : 'good'}">${kb.toFixed(1)} KB</span></div>
      </div>${plan}${note}`;
    return `blocks: ${fmt(blocks)} · average block ${kb.toFixed(1)} KB`;
  }

  /* memory:3 · one unified pool as a segmented bar. The dashed line is storage's protected share; spills and refusals are marked. */
  function paintPool(stage, sim, k) {
    const v = sim.steps[k].v, P = v.pool, pct = x => x / P * 100, free = P - v.storage - v.exec;
    const protectedAt = pct(P / 2);
    stage.innerHTML = `<div class="vz-pool">
        <div class="vz-ptrack">
          <span class="vz-pst" style="width:${pct(v.storage)}%"><em>cache ${v.storage}</em></span>
          <span class="vz-pex" style="width:${pct(v.exec)}%"><em>execution ${v.exec}</em></span>
          <span class="vz-pfree" style="width:${pct(free)}%"><em>free ${free}</em></span>
          <span class="vz-pprot" style="left:${protectedAt}%"><em>protected 5</em></span>
        </div>
        <div class="vz-scale"><span>0</span><span>5</span><span>10 units</span></div>
      </div>
      <div class="vz-row">${v.asked ? `<span class="vz-chip warn">sort asks for ${v.asked} more</span>` : ''}${v.spill ? `<span class="vz-chip warn">spills ${v.spill} to disk</span>` : ''}${v.refused ? `<span class="vz-chip bad">cache refused ${v.refused}: not stored</span>` : ''}</div>`;
    return `cache ${v.storage} · execution ${v.exec} · free ${free} of ${P}`;
  }

  /* memory:4 · one column per running task. The bar is what it uses; the solid line is its cap (pool / N), the dashed line its floor (pool / 2N). */
  function paintShares(stage, sim, k) {
    const v = sim.steps[k].v, P = v.pool, H = 180, cap = P / v.n, floor = P / (2 * v.n), y = x => H - x / P * H;
    const cols = v.tasks.map(t => `<div class="vz-share"><div class="vz-scol"><span class="vz-sbar" style="height:${t.use / P * 100}%"></span>${t.spill ? `<span class="vz-sspill" style="height:${t.spill / P * 100}%"></span>` : ''}</div><b>${t.id}</b><small>${t.use} units${t.spill ? ' · spills ' + t.spill : ''}</small></div>`).join('');
    stage.innerHTML = `<div class="vz-shares" style="--cap:${y(cap)}px;--floor:${y(floor)}px;height:${H + 40}px">
        <div class="vz-capline" style="bottom:${100 * cap / P}%"><em>cap ${cap} units</em></div>
        <div class="vz-floorline" style="bottom:${100 * floor / P}%"><em>floor ${floor} units</em></div>
        ${cols}</div>`;
    return `running tasks: ${v.n} · cap per task ${cap} units`;
  }

  /* memory:5 · two stacked bars, heap and off-heap, and the GC pause meter. The full collection is marked when it happens. */
  function paintHeap(stage, sim, k) {
    const v = sim.steps[k].v, MAX = 8, pct = x => x / MAX * 100;
    const bar = (label, val, max, cls) => `<div class="vz-hrow"><span class="vz-lab">${label}</span><div class="vz-track big"><span class="${cls}" style="width:${val / max * 100}%"></span></div><small class="vz-num">${val} / ${max} GB</small></div>`;
    const pause = v.pause > 2 ? 'bad' : v.pause > 0 ? 'warn' : 'good';
    stage.innerHTML = `<div class="vz-heapbox">
        ${bar('java heap', v.heap, v.heapMax, 'f1')}
        ${bar('off-heap', v.off, v.offMax, 'f0')}
        <div class="vz-hrow"><span class="vz-lab">gc pause</span><div class="vz-track big"><span class="${pause === 'bad' ? 'f2' : 'f1'}" style="width:${Math.min(100, v.pause / 8 * 100)}%"></span></div><small class="vz-num">${v.pause} s</small></div>
      </div>
      <div class="vz-row">${v.full ? '<span class="vz-chip good">only short collections left</span>' : ''}${v.pause > 2 ? '<span class="vz-chip bad">every task is paused</span>' : ''}${v.off >= v.offMax ? '<span class="vz-chip bad">off-heap full: spills, counts toward the container limit</span>' : ''}</div>`;
    return `heap ${v.heap} GB · off-heap ${v.off} GB · pause ${v.pause} s`;
  }

  /* recovery:3 · one fetch as a row of attempts. A gap between two attempts is the retry wait; a failed final attempt is reported to the driver. */
  function paintBackoff(stage, sim, k) {
    const v = sim.steps[k].v;
    const label = { run: 'in progress', fail: 'connection lost', ok: 'range arrived' };
    const parts = v.att.map((s, i) => `<div class="vz-try ${s}"><b>try ${i + 1}</b><small>${label[s]}</small></div>` +
      (i < v.att.length - 1 || v.waiting ? `<div class="vz-gap${v.waiting && i === v.att.length - 1 ? ' on' : ''}"><span>5 s wait</span></div>` : '')).join('');
    stage.innerHTML = `<div class="vz-tries">${parts}</div>${v.reported ? '<div class="vz-note warn">all retries used: the reducer reports a fetch failure to the driver</div>' : ''}`;
    return `attempts: ${v.att.length} of 4 · retries left: ${4 - v.att.length}`;
  }

  /* recovery:4 · four executors on one stage. Failures count per executor; one that reaches the limit is excluded for the rest of the stage. */
  function paintExclude(stage, sim, k) {
    const v = sim.steps[k].v, LIMIT = 2;
    const cards = Object.keys(v.nodes).map(id => {
      const n = v.nodes[id];
      const state = n.ex ? 'excluded' : n.f ? 'flaky' : '';
      const txt = n.ex ? 'excluded for this stage' : n.f ? `${n.f} failure${n.f > 1 ? 's' : ''}` : 'healthy';
      return `<div class="vz-exec ${state}"><b>${id}</b><small>${txt}</small><span class="vz-chip good">${n.done} done</span></div>`;
    }).join('');
    stage.innerHTML = `<div class="vz-execs">${cards}</div>
      <div class="vz-row"><span class="vz-chip">${v.stage}</span><span class="vz-chip">exclude after ${LIMIT} failures on one executor</span></div>
      <div class="vz-note">${esc(v.note)}</div>`;
    return `excluded: ${Object.values(v.nodes).filter(n => n.ex).length} of 4 · failures on E3: ${v.nodes.E3.f}`;
  }

  /* recovery:5 · the executor and the node's shuffle service side by side. The reducer fetches from whichever still serves the files. */
  function paintService(stage, sim, k) {
    const v = sim.steps[k].v;
    const execState = v.exec === 'alive' ? 'ok' : v.exec === 'dead' ? 'dead' : 'gone';
    const execTxt = { alive: 'running', dead: 'lost', released: 'released (idle)' }[v.exec];
    const svc = v.svc
      ? `<div class="vz-svc ${v.svc === 'up' ? 'ok' : 'dead'}"><b>shuffle service</b><small>${v.svc === 'up' ? 'serving files' : 'process down'}</small><div class="vz-file">map output files</div></div>`
      : '<div class="vz-svc none"><b>shuffle service</b><small>not running yet</small></div>';
    const from = { exec: 'from executor E2', svc: 'from the service on the same node', fail: 'fetch failed: rerun needed' }[v.fetch] || 'waiting';
    stage.innerHTML = `<div class="vz-svcs">
        <div class="vz-svc ${execState}"><b>executor E2</b><small>${execTxt}</small><div class="vz-file">map output files</div></div>
        ${svc}
        <div class="vz-svc reducer"><b>reducer</b><small>${from}</small></div>
      </div>${v.idle ? '<div class="vz-note good">dynamic allocation released the idle executor; its output stays served</div>' : ''}`;
    return `fetch: ${from}`;
  }

  /* commit:3 · each file's place in the commit: private folder, job folder, output. The counter is the number of renames so far. */
  function paintRenames(stage, sim, k) {
    const v = sim.steps[k].v, label = { temp: 'private folder', jobtmp: 'job temp folder', output: 'output folder' };
    const files = v.files.map((s, i) => `<div class="vz-fmove ${s}"><b>file ${i}</b><small>${label[s]}</small></div>`).join('');
    stage.innerHTML = `<div class="vz-fmoves">${files}</div>
      <div class="vz-row"><span class="vz-chip">algorithm version ${v.alg}</span><span class="vz-chip ${v.renames >= 8 ? 'warn' : ''}">renames so far: ${v.renames}</span>${v.failed ? '<span class="vz-chip bad">job failed: readers see the two output files</span>' : ''}</div>`;
    return `renames: ${v.renames} · visible in output: ${v.files.filter(s => s === 'output').length} of 4`;
  }

  /* commit:4 · the output folder as items. Old output, staged output and deleted output are shown on their own tiles. */
  function paintOverwrite(stage, sim, k) {
    const v = sim.steps[k].v;
    const tiles = v.items.map(it => `<div class="vz-otile ${it.st}"><b>${it.n}</b><small>${{ old: 'previous run', new: 'new run', staged: 'staged, not visible', gone: 'removed' }[it.st]}</small></div>`).join('');
    const empty = v.items.length ? '' : '<p class="vz-empty">the folder is empty: readers get nothing</p>';
    stage.innerHTML = `<div class="vz-ofolder">${tiles}${empty}</div>
      <div class="vz-row">${v.dynamic ? '<span class="vz-chip good">dynamic mode: only written partitions change</span>' : '<span class="vz-chip warn">full overwrite: the whole folder is cleared first</span>'}${v.failed ? '<span class="vz-chip bad">job failed before commit</span>' : ''}</div>`;
    return v.items.length ? `visible to readers: ${v.items.filter(i => i.st === 'old' || i.st === 'new').length} items` : 'visible to readers: nothing';
  }

  /* sql:3 · the filter as written, with the comparisons that remain highlighted. A pushed filter is shown on the reader. */
  function paintRewrite(stage, sim, k) {
    const v = sim.steps[k].v, slots = Array.from({ length: 4 }, (_, i) => `<span class="vz-cmp ${i < v.ops ? 'on' : 'off'}">${i < v.ops ? 'comparison' : 'removed'}</span>`).join('');
    stage.innerHTML = `<div class="vz-expr"><code>${esc(v.expr)}</code></div>
      <div class="vz-row"><span class="vz-lab">per row</span>${slots}</div>
      <div class="vz-row">${v.pushed ? '<span class="vz-chip good">pushed down: the file reader skips rows</span>' : '<span class="vz-chip">evaluated after reading each row</span>'}</div>`;
    return `comparisons per row: ${v.ops} of 4${v.pushed ? ' · pushed to reader' : ''}`;
  }

  /* sql:4 · the input table, its expanded copies (one per distinct column), the groups, the counts and the combined row. */
  const EXP_IN = [['Mon', 'Hanoi', 'tea'], ['Mon', 'Hue', 'tea'], ['Tue', 'Hanoi', 'milk']];
  function paintExpand(stage, sim, k) {
    const v = sim.steps[k].v;
    const table = (head, rows, cls) => `<table class="vz-tbl ${cls || ''}"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '<i>null</i>' : esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const exp = EXP_IN.flatMap(([d, c, p]) => [[d, c, null, 'city'], [d, null, p, 'product']]);
    let body = '';
    if (v.view === 'input') body = table(['day', 'city', 'product'], EXP_IN);
    if (v.view === 'expand') body = table(['day', 'city', 'product', 'copy'], exp);
    if (v.view === 'group') body = table(['day', 'copy', 'distinct value'], exp.map(([d, c, p, kind]) => [d, kind, kind === 'city' ? c : p]));
    if (v.view === 'count') body = table(['day', 'copy', 'count distinct'], [['Mon', 'city', 2], ['Mon', 'product', 1], ['Tue', 'city', 1], ['Tue', 'product', 1]]);
    if (v.view === 'combine') body = table(['day', 'distinct cities', 'distinct products'], [['Mon', 2, 1], ['Tue', 1, 1]]);
    if (v.view === 'cost') body = `<div class="vz-note warn">10 distinct columns: each input row is copied 10 times</div>`;
    stage.innerHTML = `<div class="vz-expand">${body}</div>`;
    return { input: 'input: 3 rows', expand: 'expanded: 6 rows, one copy per distinct column', group: 'grouped by day and column', count: 'distinct counted within each group', combine: 'one row per day', cost: 'copies grow with each distinct column' }[v.view];
  }

  /* sql:5 · one square per reduce task. Tiny tasks are drawn small; the overhead and merge steps say what changed. */
  function paintSwarm(stage, sim, k) {
    const v = sim.steps[k].v, N = v.tasks, per = N ? v.mb / N : 0, shown = Math.min(N, 200);
    const sq = Array.from({ length: shown }, () => `<span class="vz-sq${v.tiny ? ' tiny' : ''}${v.big ? ' big' : ''}"></span>`).join('');
    const perTxt = per >= 1024 ? `${(per / 1024).toFixed(1)} GB` : per >= 1 ? `${per.toFixed(1)} MB` : `${Math.round(per * 1024)} KB`;
    stage.innerHTML = `<div class="vz-swarm">${sq || '<p class="vz-empty">no shuffle yet</p>'}</div>
      <div class="vz-row"><span class="vz-chip">input: ${v.mb >= 1000 ? (v.mb / 1000).toFixed(0) + ' GB' : v.mb + ' MB'}</span>${N ? `<span class="vz-chip">reduce tasks: ${N}</span><span class="vz-chip ${v.big || v.tiny ? 'warn' : 'good'}">per task: ${perTxt}</span>` : ''}${v.overhead ? '<span class="vz-chip bad">start-up cost dominates</span>' : ''}${v.merged ? '<span class="vz-chip good">merged at run time</span>' : ''}</div>`;
    return N ? `reduce tasks: ${N} · per task about ${perTxt}` : 'no shuffle yet';
  }

  /* joins:3 · two key lists, sorted after step 2. Pointers mark the current row on each side; a shaded group is the run of equal keys. */
  const MJ = { LU: [4, 2, 6, 1, 2], RU: [3, 4, 2, 4, 2], LS: [1, 2, 2, 4, 6], RS: [2, 2, 3, 4, 4] };
  function paintMerge(stage, sim, k) {
    const v = sim.steps[k].v, L = v.sorted ? MJ.LS : MJ.LU, R = v.sorted ? MJ.RS : MJ.RU;
    const col = (arr, p, g, name, ptr) => `<div class="vz-mcol"><b>${name}</b>${arr.map((x, i) => `<div class="vz-mcell${p === i ? ' now' : ''}${g && i >= g[0] && i <= g[1] ? ' grp' : ''}">${x}${p === i ? `<em>${ptr}</em>` : ''}</div>`).join('')}</div>`;
    const lgrp = v.group ? v.group.l : null, rgrp = v.group ? v.group.r : null;
    stage.innerHTML = `<div class="vz-merge">${col(L, v.li, lgrp, 'left keys', '◂')}${col(R, v.ri, rgrp, 'right keys', '◂')}
        <div class="vz-mout"><b>output pairs</b><span class="vz-chip ${v.out ? 'good' : ''}">${v.out}</span>${v.buffered ? '<small>group of equal keys buffered</small>' : ''}</div></div>
      ${v.lt ? '<div class="vz-note">left key is smaller: the left pointer moves on</div>' : ''}${v.match ? '<div class="vz-note good">keys equal: the matching pairs come next</div>' : ''}`;
    return v.sorted ? `pairs output: ${v.out}` : 'partitions not sorted yet';
  }

  /* joins:4 · the grid of comparisons, filled row by row; a big row count shows the pair count instead. */
  function paintPairs(stage, sim, k) {
    const v = sim.steps[k].v;
    if (v.big) {
      stage.innerHTML = `<div class="vz-bignum"><b>${(v.a * v.b).toExponential(0).replace('e+', ' × 10^')}</b><small>pairs to compare: a million rows times a million</small></div>
        <div class="vz-note warn">at a billion comparisons a second: about 1000 seconds, before any real work</div>`;
      return 'pairs: 10^12';
    }
    const bc = v.broadcast ? '<div class="vz-row"><span class="vz-chip good">B is broadcast: each worker compares locally</span></div>' : '';
    stage.innerHTML = `<div class="vz-pgrid">
        <div class="vz-pheadrow"><span></span>${Array.from({ length: v.b }, (_, j) => `<span class="vz-ph">B${j + 1}</span>`).join('')}</div>
        ${Array.from({ length: v.a }, (_, i) => `<div class="vz-prow"><span class="vz-ph">A${i + 1}</span>${Array.from({ length: v.b }, (_, j) => `<span class="vz-pc${i * v.b + j < v.done ? ' on' : ''}"></span>`).join('')}</div>`).join('')}
      </div>${bc}`;
    return `comparisons: ${v.done} of ${v.a * v.b}`;
  }

  /* joins:5 · two overlapping circles of ids. The result list shows which ids each join keeps. */
  function paintVenn(stage, sim, k) {
    const v = sim.steps[k].v, Lo = [1, 2, 3, 4, 5], Ro = [3, 4, 5, 6, 7];
    const inR = x => Ro.includes(x), inL = x => Lo.includes(x);
    const mark = x => v.result && v.result.includes(x);
    const sets = `<div class="vz-venn2">
        <div class="vz-lcirc${v.mode === 'anti' || v.mode === 'left' || v.mode === 'full' || v.mode === 'filter' ? ' lit' : ''}"><b>orders</b>${Lo.map(x => `<span class="vz-id ${inR(x) ? 'both' : 'only'}${mark(x) ? ' keep' : ''}">${x}</span>`).join('')}</div>
        <div class="vz-rcirc${v.mode === 'full' ? ' lit' : ''}"><b>customers</b>${Ro.map(x => `<span class="vz-id ${inL(x) ? 'both' : 'only'}${mark(x) ? ' keep' : ''}">${x}</span>`).join('')}</div>
      </div>`;
    const keep = v.result ? `<div class="vz-row"><span class="vz-lab">output ids</span>${v.result.map(x => `<span class="vz-chip good">${x}</span>`).join('')}</div>` : '';
    const note = { sets: 'two tables, ids 3 to 5 in both', inner: 'inner join: the overlap only', left: 'left join: all orders, nulls where no customer matches', anti: 'left anti join: unmatched orders only, no customer columns', full: 'full outer join: every id from both tables', filter: 'the filter removed the unmatched orders' }[v.mode];
    stage.innerHTML = `${sets}${keep}<div class="vz-note${v.mode === 'filter' ? ' warn' : ''}">${note}</div>`;
    return v.result ? `output rows: ${v.result.length}` : 'no join yet';
  }

  /* adaptive:3 · the join decision on one scale: the estimate, the measured size, and the threshold. The join shown is what the engine chose. */
  function paintSwitch(stage, sim, k) {
    const v = sim.steps[k].v, MAX = 250, pct = x => x / MAX * 100;
    const measured = v.real != null ? `<span class="vz-sw-real" style="width:${pct(v.real)}%"></span>` : '';
    stage.innerHTML = `<div class="vz-swscale">
        <div class="vz-swtrack"><span class="vz-swest" style="width:${pct(v.est)}%"></span>${measured}
          <span class="vz-swthr" style="left:${pct(v.threshold)}%"><em>broadcast threshold 10 MB</em></span></div>
        <div class="vz-scale"><span>0</span><span>100 MB</span><span>200 MB</span><span>250 MB</span></div>
        <div class="vz-swkey"><span class="vz-sw-est">estimate ${v.est} MB</span>${v.real != null ? `<span class="vz-sw-real-k">measured ${v.real} MB</span>` : ''}</div>
      </div>
      <div class="vz-row"><span class="vz-chip ${v.join === 'broadcast' ? 'good' : 'warn'}">join: ${v.join === 'broadcast' ? 'broadcast hash join' : 'shuffle join'}</span>${v.compare ? '<span class="vz-chip">6 MB is below 10 MB</span>' : ''}${v.saved ? '<span class="vz-chip good">the big side is not shuffled</span>' : ''}</div>`;
    return `join: ${v.join} · estimate ${v.est} MB${v.real != null ? ' · measured ' + v.real + ' MB' : ''}`;
  }

  /* adaptive:4 · the eight blocks of one reducer, as tiles. Local blocks are read from disk; the rest travel over the network. */
  function paintLocalRead(stage, sim, k) {
    const v = sim.steps[k].v;
    const label = { net: 'over the network', local: 'read from local disk', wait: 'not yet checked' };
    const tiles = v.blocks.map((s, i) => `<div class="vz-lblock ${s}"><b>block ${i + 1}</b><small>${label[s]}</small></div>`).join('');
    const nLocal = v.blocks.filter(s => s === 'local').length, nNet = v.blocks.filter(s => s === 'net').length;
    stage.innerHTML = `<div class="vz-lblocks">${tiles}</div>
      <div class="vz-row"><span class="vz-lab">reader</span><span class="vz-chip">executor E1</span>${v.mode === 'normal' ? '<span class="vz-chip warn">normal shuffle reader</span>' : '<span class="vz-chip good">local shuffle reader</span>'}${v.count ? `<span class="vz-chip">${nLocal} local · ${nNet} over the network</span>` : ''}</div>`;
    return `local: ${nLocal} of 8 · over the network: ${nNet}`;
  }

  /* adaptive:5 · query stages in a row, with the re-planning cycle under them. The highlighted phase is the current one. */
  const PHASES = [['run', 'run stage'], ['measure', 'measure sizes'], ['replan', 're-plan the rest']];
  function paintLoop(stage, sim, k) {
    const v = sim.steps[k].v, N = 3;
    const stages = Array.from({ length: N }, (_, i) => `<div class="vz-qstage ${i < v.done ? 'done' : i === v.stage ? 'now' : ''}"><b>query stage ${i + 1}</b><small>${i < v.done ? 'finished' : i === v.stage ? (v.phase === 'final' ? 'final plan' : 'current') : 'not yet planned'}</small></div>`).join('');
    const cyc = PHASES.map(([key, name]) => `<span class="vz-phase${v.phase === key || (v.phase === 'cut' && key === 'run') ? ' on' : ''}">${name}</span>`).join('<span class="vz-arrow">→</span>');
    stage.innerHTML = `<div class="vz-qstages">${stages}</div><div class="vz-cycle">${cyc}</div>
      ${v.phase === 'cut' ? '<div class="vz-note">the query is cut into stages at each exchange</div>' : ''}${v.phase === 'final' ? '<div class="vz-note good">the plan shown by explain is the one that executed</div>' : ''}`;
    return `finished: ${v.done} of ${N} query stages · phase: ${v.phase}`;
  }

  /* evidence:3 · the bounded queue as a bar with its capacity, the number of dropped events and whether the event log kept them. */
  function paintDropQueue(stage, sim, k) {
    const v = sim.steps[k].v, pct = v.fill / v.cap * 100;
    stage.innerHTML = `<div class="vz-dq">
        <div class="vz-dqtrack"><span class="vz-dqfill${v.fill >= v.cap ? ' full' : ''}" style="width:${pct}%"></span><em>${v.fill.toLocaleString('en-US')} of ${v.cap.toLocaleString('en-US')} places</em></div>
        <div class="vz-dqkeys">
          <div class="vz-dqcell"><b>listener</b><small>${v.slow ? 'slow: writing the log' : 'keeping up'}</small></div>
          <div class="vz-dqcell${v.dropped ? ' bad' : ''}"><b>dropped</b><small>${v.dropped}</small></div>
          <div class="vz-dqcell${v.logged ? ' good' : ' bad'}"><b>event log</b><small>${v.logged ? 'complete so far' : 'gaps: dropped events missing'}</small></div>
        </div>
      </div>`;
    return `queue ${v.fill.toLocaleString('en-US')} of ${v.cap.toLocaleString('en-US')} · dropped ${v.dropped}`;
  }

  /* evidence:4 · the stages as cells. Old ones leave the live window, the log keeps them, and the history view shows all. */
  function paintWindow(stage, sim, k) {
    const v = sim.steps[k].v;
    const cells = Array.from({ length: v.total }, (_, i) => {
      const evicted = v.evicted && i < v.total - v.window;
      return `<div class="vz-wcell ${evicted ? 'gone' : 'live'}"><span>${i + 1}</span></div>`;
    }).join('');
    stage.innerHTML = `<div class="vz-wstages">${cells}</div>
      <div class="vz-wrows">
        <div class="vz-wrow"><span class="vz-lab">live UI</span><span class="vz-chip ${v.live ? 'good' : ''}">${v.window} most recent stages</span></div>
        <div class="vz-wrow"><span class="vz-lab">event log</span><span class="vz-chip ${v.log ? 'good' : ''}">${v.log ? 'all ' + v.total + ' stages' : 'not enabled'}</span></div>
        <div class="vz-wrow"><span class="vz-lab">history server</span><span class="vz-chip ${v.history ? 'good' : ''}">${v.history ? 'rebuilt: all ' + v.total : 'waiting for replay'}</span></div>
      </div>${v.bigger ? '<div class="vz-note warn">a bigger live window keeps more objects in driver memory</div>' : ''}`;
    return `live window: ${v.window} of ${v.total} stages${v.evicted ? ' · older removed from memory' : ''}`;
  }

  /* evidence:5 · a box plot of task durations. The box is the middle half; the whiskers reach the min and max; dots are outliers. */
  function paintBox(stage, sim, k) {
    const v = sim.steps[k].v, W = 560, H = 150, L = 40, R = 20;
    if (!v.stats) { stage.innerHTML = `<p class="vz-empty">select a stage to see its task durations</p>`; return 'no stage selected'; }
    const s = v.stats, MAX = Math.ceil(s.max * 1.15 / 10) * 10, step = Math.ceil(MAX / 4 / 5) * 5;
    const X = t => L + t / MAX * (W - L - R), cy = 70, boxW = X(s.q3) - X(s.q1);
    const ticks = [0, 1, 2, 3, 4].map(i => i * step).filter(t => t <= MAX).map(t => `<text class="vz-tick" x="${X(t)}" y="${H - 6}" text-anchor="middle">${t}s</text>`).join('');
    const out = (v.outliers || []).map(o => `<circle class="vz-dot hot" cx="${X(o)}" cy="${cy}" r="6"/>`).join('');
    const body = `<line class="vz-grid" x1="${L}" x2="${W - R}" y1="${cy}" y2="${cy}"/>
      <line class="vz-line" x1="${X(s.min)}" x2="${X(s.q1)}" y1="${cy}" y2="${cy}"/>
      <line class="vz-line" x1="${X(s.q3)}" x2="${X(s.max)}" y1="${cy}" y2="${cy}"/>
      <line class="vz-line" x1="${X(s.min)}" x2="${X(s.min)}" y1="${cy - 12}" y2="${cy + 12}"/>
      <line class="vz-line" x1="${X(s.max)}" x2="${X(s.max)}" y1="${cy - 12}" y2="${cy + 12}"/>
      <rect class="vz-bx${v.tight ? ' tight' : ''}" x="${X(s.q1)}" y="${cy - 22}" width="${boxW}" height="44"/>
      <line class="vz-line" x1="${X(s.med)}" x2="${X(s.med)}" y1="${cy - 22}" y2="${cy + 22}"/>${out}${ticks}`;
    const inputs = v.inputs ? `<div class="vz-row"><span class="vz-chip good">typical task: 0.2 GB input</span><span class="vz-chip bad">outlier tasks: 4 GB input each</span></div>` : '';
    const note = v.skew ? '<div class="vz-note warn">tight box, long tail: skewed key, so fix the key rather than add machines</div>' : '';
    stage.innerHTML = `${svg(W, H, body, 'Task duration box plot')}${inputs}${note}`;
    return `median ${s.med} s · max ${s.max} s${v.outliers && v.outliers.length ? ' · outliers ' + v.outliers.length : ''}`;
  }

  /* build:2 · two runs side by side, counter by counter. Rows are the same in both runs for the answer, and differ for the costs. */
  function paintDiff(stage, sim, k) {
    const v = sim.steps[k].v;
    if (!v.rows.length) { stage.innerHTML = '<p class="vz-empty">two runs will be compared on their answers and their costs</p>'; return 'nothing compared yet'; }
    const rows = v.rows.map(([name, a, b]) => {
      const same = a === b, cls = v.focus === 'bug' && name === 'partition 2' ? 'bad' : same ? 'same' : 'differ';
      return `<tr class="${cls}"><td>${esc(name)}</td><td>${esc(a)}</td><td>${esc(b)}</td><td>${same ? 'same' : 'differs'}</td></tr>`;
    }).join('');
    const hdr = v.focus === 'keys' || v.focus === 'bug' ? 'output rows per partition' : v.focus === 'total' ? 'answer' : 'costs';
    stage.innerHTML = `<div class="vz-diff"><b>${hdr}</b><table class="vz-tbl"><tr><th>counter</th><th>run A</th><th>run B</th><th></th></tr>${rows}</table></div>
      ${v.focus === 'bug' ? '<div class="vz-note warn">a mismatch on a key is a bug: the outputs diverged</div>' : ''}`;
    const differ = v.rows.filter(([, a, b]) => a !== b).length;
    return v.focus === 'bug' ? 'mismatch on partition 2' : `counters that differ: ${differ} of ${v.rows.length}`;
  }

  /* build:3 · four partitions as tiles, and the job state. Staged output is not visible; a failed partition ends the job. */
  function paintAbort(stage, sim, k) {
    const v = sim.steps[k].v, label = { staging: 'staging, private', committed: 'committed', failing: 'attempt failing', failed: 'attempts used up' };
    const tiles = v.parts.map((s, i) => `<div class="vz-abtile ${s}"><b>partition ${i}</b><small>${label[s]}</small></div>`).join('');
    stage.innerHTML = `<div class="vz-abparts">${tiles}</div>
      <div class="vz-abstate"><span class="vz-chip ${v.job === 'aborted' ? 'bad' : v.job === 'done' ? 'good' : ''}">job: ${v.job}</span><span class="vz-chip ${v.result === '640' ? 'good' : ''}">result: ${v.result === 'none' ? 'nothing published' : v.result}</span></div>`;
    return `job ${v.job} · result ${v.result === 'none' ? 'not published' : v.result}`;
  }

  /* build:4 · three option sets, one small bar per counter. The highlighted counter is the one under discussion. */
  const RUNS = [
    { name: 'small memory, speculation off', short: 'small, no spec', total: 640, spill: 3, attempts: 12, time: 14 },
    { name: 'large memory, speculation off', short: 'large, no spec', total: 640, spill: 0, attempts: 10, time: 10 },
    { name: 'large memory, speculation on', short: 'large, spec', total: 640, spill: 0, attempts: 13, time: 11 }
  ];
  function paintMultiples(stage, sim, k) {
    const v = sim.steps[k].v, metrics = [['total', 'answer', 640], ['spill', 'spilled', 4], ['attempts', 'attempts', 14], ['time', 'time (s)', 16]];
    const panels = metrics.map(([key, title, max]) => `<div class="vz-mp${v.focus === key ? ' focus' : ''}"><b>${title}</b>${RUNS.map(r => `<div class="vz-mrow"><span>${r.short}</span><div class="vz-track"><span style="width:${r[key] / max * 100}%"></span></div><small>${r[key]}</small></div>`).join('')}</div>`).join('');
    stage.innerHTML = `<div class="vz-multiples">${panels}</div>${v.note ? `<div class="vz-note good">${esc(v.note)}</div>` : ''}`;
    return v.focus ? `focus: ${v.focus} · time: ${RUNS.map(r => r.time).join(' / ')} s` : 'three option sets, not yet compared';
  }

  const PAINT = {
    ticks: paintTicks, kanban: paintKanban, stacked: paintStacked, lanes: paintLanes,
    sawtooth: paintSawtooth, bullet: paintBullet, heatmap: paintHeat, strip: paintStrip,
    ledger: paintLedger, filetree: paintFileTree, flow: paintFlow, waterfall: paintWaterfall,
    fanout: paintFanout, scatter: paintScatter, histogram: paintHistogram, donut: paintDonut,
    tape: paintTape, segments: paintSegments, mosaic: paintMosaic, ladder: paintLadder, budget: paintBudget, cores: paintCores, paths: paintPaths, routes: paintRoutes, explode: paintExplode, diff: paintDiff, abort: paintAbort, multiples: paintMultiples, dropqueue: paintDropQueue, window: paintWindow, box: paintBox, switch: paintSwitch, localread: paintLocalRead, loop: paintLoop, merge: paintMerge, pairs: paintPairs, venn: paintVenn, rewrite: paintRewrite, expand: paintExpand, swarm: paintSwarm, renames: paintRenames, overwrite: paintOverwrite, backoff: paintBackoff, exclude: paintExclude, service: paintService, pool: paintPool, shares: paintShares, heap: paintHeap
  };

  Object.entries(PAINT).forEach(([name, painter]) => root.Course.registerScene(name, painter));
})(typeof globalThis !== 'undefined' ? globalThis : this);
