(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (w, h, body, label) => `<svg class="vz-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

  const FRAME = `<div class="rs vz">
      <div class="vz-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;

  function usecase(host) {
    const SD = root.SparkSystemDesign;
    const u = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
    return u && u.sim && u.sim.steps ? u : null;
  }

  /* Shared controller: buttons, narration and the stat line. The picture painter returns the stat text. */
  function run(host, paint) {
    const u = usecase(host); if (!u) return;
    host.dataset.ready = '1';
    host.innerHTML = FRAME;
    const sim = u.sim, steps = sim.steps;
    const $ = s => host.querySelector(s);
    let k = 0;
    function show() {
      const st = steps[k];
      $('[data-stat]').textContent = paint($('[data-stage]'), sim, k) || '';
      $('[data-n]').textContent = k + 1;
      $('[data-title]').textContent = st.title;
      $('[data-text]').textContent = st.text;
      $('[data-count]').textContent = `step ${k + 1} of ${steps.length}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = k === 0;
      $('[data-act=next]').disabled = k === steps.length - 1;
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'first') k = 0;
      else if (b.dataset.act === 'prev') k = Math.max(0, k - 1);
      else if (b.dataset.act === 'next') k = Math.min(steps.length - 1, k + 1);
      show();
    });
    show();
  }

  /* schedule:1 · step line of free slots over time, with the slot tiles and queue for the current step. */
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

  const PAINT = {
    ticks: paintTicks, kanban: paintKanban, stacked: paintStacked, lanes: paintLanes,
    sawtooth: paintSawtooth, bullet: paintBullet, heatmap: paintHeat, strip: paintStrip,
    ledger: paintLedger, filetree: paintFileTree, flow: paintFlow, waterfall: paintWaterfall,
    fanout: paintFanout, scatter: paintScatter, histogram: paintHistogram, donut: paintDonut,
    tape: paintTape, segments: paintSegments, mosaic: paintMosaic
  };

  /* Attach each picture to its use case. Narration (title, text) stays in engine-stories.js. */
  /* One picture per use case. Each list has one entry per narration step in engine-stories.js. */
  const DATA = {
    'schedule:1': { kind: 'ticks', steps: [
      { free: 0, run: 0, queue: 6 }, { free: 4, run: 0, queue: 6 }, { free: 4, run: 0, queue: 6 },
      { free: 0, run: 4, queue: 2 }, { free: 0, run: 4, queue: 2 }, { free: 1, run: 3, queue: 2 }, { free: 0, run: 4, queue: 1 }] },
    'schedule:2': { kind: 'kanban', steps: [
      { cards: [{ id: 'A1', col: 0, note: 'no free slot' }] },
      { cards: [{ id: 'A1', col: 1, note: 'slot matched' }] },
      { cards: [{ id: 'A1', col: 2 }] },
      { cards: [{ id: 'A1', col: 3, note: 'success' }] },
      { cards: [{ id: 'A1', col: 3, note: 'success' }, { id: 'A2', col: 4, note: 'error' }] },
      { cards: [{ id: 'A1', col: 3, note: 'success' }, { id: 'A2', col: 4, note: 'error' }, { id: 'A3', col: 2, note: 'running' }] },
      { cards: [{ id: 'A1', col: 3, note: 'success' }, { id: 'A2', col: 4, note: 'error' }, { id: 'A3', col: 4, note: 'no heartbeat' }, { id: 'A2', col: 5, ghost: true, note: 'late success' }] }] },
    'shuffle:1': { kind: 'stacked', steps: [
      { raw: true, mem: [['cat', 1, 0], ['dog', 1, 1], ['cat', 1, 0], ['bird', 1, 0], ['dog', 1, 1], ['cat', 1, 0]], run: [], file: [] },
      { mem: [['cat', 3, 0], ['dog', 2, 1], ['bird', 1, 0]], run: [], file: [] },
      { mem: [['cat', 1, 0], ['dog', 2, 1]], run: [['bird', 1, 0], ['cat', 2, 0]], file: [] },
      { mem: [['cat', 1, 0], ['dog', 2, 1]], run: [['bird', 1, 0], ['cat', 2, 0]], file: [], assign: true },
      { mem: [], run: [], file: [['bird', 1, 0], ['cat', 3, 0], ['dog', 2, 1]] },
      { mem: [], run: [], file: [['bird', 1, 0], ['cat', 3, 0], ['dog', 2, 1]], index: true },
      { mem: [], run: [], file: [['bird', 1, 0], ['cat', 3, 0], ['dog', 2, 1]], index: true, driver: true }] },
    'shuffle:2': { kind: 'lanes', steps: [
      { known: false, asked: false, lanes: [], inflight: 0 },
      { known: false, asked: true, lanes: [], inflight: 0 },
      { known: true, lanes: [{ h: 'A', p: 0, s: 'wait' }, { h: 'B', p: 0, s: 'wait' }, { h: 'C', p: 0, s: 'wait' }], inflight: 0 },
      { known: true, lanes: [{ h: 'A', p: 40, s: 'fetch' }, { h: 'B', p: 40, s: 'fetch' }, { h: 'C', p: 0, s: 'wait' }], inflight: 2 },
      { known: true, lanes: [{ h: 'A', p: 100, s: 'done' }, { h: 'B', p: 100, s: 'done' }, { h: 'C', p: 60, s: 'fetch' }], inflight: 1 },
      { known: true, lanes: [{ h: 'A', p: 100, s: 'done' }, { h: 'B', p: 100, s: 'done' }, { h: 'C', p: 100, s: 'done' }], inflight: 0, merge: [['A', 2], ['B', 1], ['C', 4]] },
      { known: true, lanes: [{ h: 'A', p: 100, s: 'done' }, { h: 'B', p: 100, s: 'done' }, { h: 'C', p: 100, s: 'done' }], inflight: 0, freed: true }] },
    'memory:1': { kind: 'sawtooth', steps: [
      { used: 0, runs: 0, ask: 64 }, { used: 64, runs: 0 }, { used: 128, runs: 0, refused: true },
      { used: 0, runs: 1 }, { used: 64, runs: 1 }, { used: 0, runs: 2, merge: true }, { used: 0, runs: 2, merge: true, same: true }] },
    'memory:2': { kind: 'bullet', steps: [
      { acc: 0, hidden: 0, limit: 10 }, { acc: 5, hidden: 0, limit: 10 }, { acc: 8, hidden: 0, limit: 10, refused: true },
      { acc: 8, hidden: 1.5, limit: 10 }, { acc: 8, hidden: 3, limit: 10 }, { acc: 8, hidden: 3, limit: 10, killed: true },
      { acc: 8, hidden: 3, limit: 13, fixed: true }] },
    'recovery:1': { kind: 'heatmap', steps: [
      { cells: { m1X: 'ok', m2X: 'ok', m3Y: 'ok' } },
      { cells: { m1X: 'lost', m2X: 'lost', m3Y: 'ok' }, dead: true },
      { cells: { m1X: 'fail', m2X: 'lost', m3Y: 'ok' }, dead: true },
      { cells: { m1X: 'struck', m2X: 'struck', m3Y: 'ok' }, dead: true },
      { cells: { m1X: 'struck', m2X: 'struck', m3Y: 'ok', m1Z: 'rerun', m2Z: 'rerun' }, dead: true },
      { cells: { m1X: 'struck', m2X: 'struck', m3Y: 'ok', m1Z: 'ok', m2Z: 'ok' }, dead: true },
      { cells: { m1X: 'struck', m2X: 'struck', m3Y: 'ok', m1Z: 'ok', m2Z: 'ok' }, dead: true, reducers: true }] },
    'recovery:2': { kind: 'strip', steps: [
      { c1: 40, c2: null, med: false },
      { c1: 40, c2: null, med: true },
      { c1: 40, c2: 0, med: true },
      { c1: 46, c2: 6, med: true },
      { c1: 52, c2: 12, med: true, won: true },
      { c1: 52, c2: 12, med: true, won: true, killed: true }] },
    'commit:1': { kind: 'ledger', steps: [
      { t1: ['part-0'], t2: ['part-0'], ledger: [], final: [] },
      { t1: ['part-0'], t2: ['part-0'], ledger: [{ who: 'attempt 1', ans: 'pending' }], final: [] },
      { t1: ['part-0'], t2: ['part-0'], ledger: [{ who: 'attempt 1', ans: 'yes' }], final: [] },
      { t1: ['part-0'], t2: ['part-0'], ledger: [{ who: 'attempt 1', ans: 'yes' }, { who: 'attempt 2', ans: 'pending' }], final: [] },
      { t1: ['part-0'], t2: ['part-0'], ledger: [{ who: 'attempt 1', ans: 'yes' }, { who: 'attempt 2', ans: 'no' }], final: [] },
      { t1: [], t2: ['part-0'], ledger: [{ who: 'attempt 1', ans: 'yes' }, { who: 'attempt 2', ans: 'no' }], final: ['part-0 (attempt 1)'] },
      { t1: [], t2: [], gone: true, ledger: [{ who: 'attempt 1', ans: 'yes' }, { who: 'attempt 2', ans: 'no' }], final: ['part-0 (attempt 1)'] }] },
    'commit:2': { kind: 'filetree', steps: [
      { parts: 1, marker: false },
      { parts: 2, marker: false, reader: 'a reader sees 2 files and may think the output is complete' },
      { parts: 4, marker: false, check: 'driver: 4 of 4 partitions committed' },
      { parts: 4, marker: true },
      { parts: 4, marker: true, reader: 'a correct reader looks for _SUCCESS first' },
      { parts: 2, marker: false, failed: true, reader: 'no marker: incomplete, even though 2 files exist' }] },
    'sql:1': { kind: 'flow', steps: [
      { at: 0, cols: 12, rows: 100 },
      { at: 1, cols: 12, rows: 100 },
      { at: 2, cols: 12, rows: 100, names: true },
      { at: 3, cols: 2, rows: 40, names: true },
      { at: 3, cols: 2, rows: 40, names: true, ex: true },
      { at: 4, cols: 2, rows: 40, names: true, ex: true, tasks: 3 }] },
    'sql:2': { kind: 'waterfall', steps: [
      { mode: 'none' }, { mode: 'unknown' }, { mode: 'inplace' }, { mode: 'partial' }, { mode: 'sent' }, { mode: 'final' }] },
    'joins:1': { kind: 'fanout', steps: [
      { s: 'sizes' }, { s: 'collect' }, { s: 'hash' }, { s: 'copies' }, { s: 'stream' },
      { s: 'match', dup: 'Hanoi appears twice in cities, so each order matches twice: both matches are kept' }] },
    'joins:2': { kind: 'scatter', steps: [
      { moved: { A: false, B: false } },
      { moved: { A: false, B: false }, rule: true },
      { moved: { A: true, B: false }, rule: true },
      { moved: { A: true, B: true }, rule: true },
      { moved: { A: true, B: true }, rule: true, probe: true }] },
    'adaptive:1': { kind: 'histogram', steps: [
      { real: false },
      { real: true },
      { real: true, merged: true },
      { real: true, merged: true, flag: true },
      { real: true, merged: true, flag: true, layout: true }] },
    'adaptive:2': { kind: 'donut', steps: [
      { slices: [3, 3, 300, 3] },
      { slices: [3, 3, 300, 3], flag: true },
      { slices: [3, 3, 100, 100, 100, 3], split: true },
      { slices: [3, 3, 100, 100, 100, 3], split: true, copies: true },
      { slices: [3, 3, 100, 100, 100, 3], split: true, copies: true, reducers: true },
      { slices: [3, 3, 100, 100, 100, 3], split: true, copies: true, reducers: true, done: true }] },
    'evidence:1': { kind: 'tape', steps: [
      { ev: 0, written: 0, writer: 0, live: 0 },
      { ev: 1, written: 0, bus: true, writer: 0, live: 0 },
      { ev: 1, written: 0, writer: 1, live: 0 },
      { ev: 1, written: 1, writer: 0, live: 0 },
      { ev: 1, written: 1, writer: 0, live: 1 },
      { ev: 6, written: 4, writer: 3, live: 6, slow: true }] },
    'evidence:2': { kind: 'segments', steps: [
      { found: false },
      { found: true, cur: 0 },
      { found: true, cur: 6 },
      { found: true, cur: 12, jobs: 1, stages: 2, tasks: 40, plan: 1 },
      { found: true, cur: 12, jobs: 1, stages: 2, tasks: 40, plan: 1, match: true }] },
    'build:1': { kind: 'mosaic', steps: [
      { opts: true },
      { rows: true },
      { rows: true, parts: true },
      { rows: true, parts: true, shuf: true },
      { rows: true, parts: true, shuf: true, lost: 1 },
      { rows: true, parts: true, lost: 1, replayed: true, pub: true },
      { rows: true, parts: true, lost: 1, replayed: true, pub: true, alt: true }] }
  };
  const SD = root.SparkSystemDesign || (typeof require === "function" ? require("./engine-sysdesign.js") : null);
  for (const [key, spec] of Object.entries(DATA)) {
    const [id, n] = key.split(':');
    const sim = SD.data[id].uc[n - 1].sim;
    if (!sim || !sim.steps || sim.steps.length !== spec.steps.length) throw new Error(`visual steps for ${key} do not match its narration`);
    sim.kind = spec.kind;
    sim.steps.forEach((s, i) => { s.v = spec.steps[i]; });
  }

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim]').forEach(host => {
      if (host.dataset.ready || !PAINT[host.dataset.sim]) return;
      run(host, PAINT[host.dataset.sim]);
    });
  }

  root.SparkVisuals = { mount, PAINT, DATA };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkVisuals;
})(typeof globalThis !== 'undefined' ? globalThis : this);
