/* Keyed SVG objects retain identity between calculated snapshots. Positions and labels
   are presentation only; all records, ranges, assignments and metrics come from the model. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function drawing(scene) {
    const out = [];
    const text = (id, x, y, label, cls = '', anchor = 'start') => out.push({ id, type: 'text', x, y, label: String(label), cls, anchor });
    const rect = (id, x, y, w, h, cls = '') => out.push({ id, type: 'rect', x, y, w, h, cls });
    const card = (id, x, y, w, h, label, sub = '', tone = 'neutral') => out.push({ id, type: 'card', x, y, w, h, label: String(label), sub: String(sub), cls: tone });
    const edge = (id, x1, y1, x2, y2, kind = 'data', active = true) => out.push({ id, type: 'line', x1, y1, x2, y2, cls: kind + (active ? ' active' : ' muted'), marker: kind === 'control' ? 'control-arrow' : 'data-arrow' });
    const label = (id, x, y, value) => text(id, x, y, value, 'small eyebrow');
    const token = (id, x, y, value, tone = 'data', sub = '') => card(id, x, y, 92, 36, value, sub, tone + ' token');
    const cityTotal = (pairs, x = 40, y = 405) => pairs.forEach(([key, value], i) => card('total-' + key, x + i * 185, y, 165, 46, key + ' = ' + value, 'merged contribution', 'good'));
    if (scene.type === 'cluster' || scene.type === 'recovery') {
      const s = scene, active = s.active || [], recovering = s.type === 'recovery';
      label('ctl-label', 30, 27, 'CONTROL / METADATA'); label('data-label', 682, 27, 'DATA / STORAGE');
      card('driver', 25, 65, 215, 116, 'Application driver', 'graph · attempts · locations', active.includes('driver') ? 'control' : 'neutral');
      card('manager', 25, 260, 215, 74, 'Cluster manager', 'allocates processes', active.includes('manager') ? 'control' : 'neutral');
      card('source', 680, 65, 192, 86, 'orders.csv', 'O01…O12 · immutable', active.includes('source') ? 'data' : 'neutral');
      card('output', 680, 332, 192, 86, 'Output store', s.outputState === 'aborted' ? 'partial / not ready' : s.outputState === 'ready' ? 'complete / ready' : 'readiness is a contract', s.outputState === 'aborted' ? 'bad' : s.outputState === 'ready' ? 'good' : active.includes('output') ? 'data' : 'neutral');
      for (let e = 0; e < s.executors; e++) {
        const y = 58 + e * 120, lost = recovering && s.failed === e && s.phase !== 'available';
        card('executor-' + e, 350, y, 245, 102, 'Executor E' + e, lost ? (s.preserved ? 'process exited · blocks served' : 'process / node lost') : s.cores + ' slot(s) · local blocks', lost ? (s.preserved ? 'warning' : 'bad') : active.includes('executors') ? 'control' : 'neutral');
        edge('ctl-' + e, 240, 103, 350, y + 26, 'control', ['dispatch','register','replay','fetch-failed'].includes(s.flow));
        edge('input-' + e, 680, 110, 595, y + 55, 'data', s.flow === 'data');
        edge('result-' + e, 595, y + 83, 680, 375, 'data', s.flow === 'finish');
      }
      edge('allocation', 240, 295, 350, 145, 'control', s.flow === 'allocate');
      const showMaps = recovering || ['data','finish'].includes(s.flow) || s.phase === 'recover';
      if (showMaps) for (const [i, m] of s.maps.entries()) {
        const e = /^E(\d+)/.exec(m.executor), index = e ? Number(e[1]) : 0;
        const same = s.maps.filter(x => x.executor === m.executor).indexOf(m);
        card('map-' + i, 365 + same % 3 * 73, 123 + Math.min(index, s.executors - 1) * 120 + Math.floor(same / 3) * 21, 66, 22,
          m.id + '.' + m.attempt, '', m.available ? 'good mini' : 'bad mini');
      }
      if (s.flow === 'dispatch') token('task-envelope', 262, 60, 'T0.0 → P0', 'control');
      if (s.flow === 'data' && s.currentRecord) token('moving-record',600,183,s.currentRecord.id,'data',s.currentRecord.city + ' · ' + s.currentRecord.amount);
      if (s.flow === 'finish' && s.totals.length) token('moving-record',252,160,s.totals[0][0] + ' = ' + s.totals[0][1],'good');
      text('architecture-note', 30, 453, recovering ? 'Rebuild producer output before retrying dependent fetches.' : 'Executors move bulk records. The driver moves task descriptions and output locations.', 'note');
    } else if (scene.type === 'read') {
      const s = scene, w = 820, scale = w / Math.max(1, s.bytes);
      label('file-label', 40, 28, s.gzip ? 'ONE GZIP STREAM / SEQUENTIAL DECODER' : 'UTF-8 BYTES / RECORD START OWNERSHIP');
      rect('byte-strip', 40, 54, w, 102, 'panel');
      s.all.forEach((r, i) => {
        const owner = s.partitions.findIndex(p => r.start >= p.start && r.start < p.end);
        const crossing = owner >= 0 && r.end > s.partitions[owner].end;
        card('record-reference-' + r.id, 40 + r.start * scale, 70, Math.max(26, (r.end - r.start) * scale - 3), 45, r.id, '', crossing ? 'warning mini' : 'neutral mini');
        if (!s.emitted.includes(r.id)) card('record-' + r.id, 40 + r.start * scale, 122, Math.max(26, (r.end - r.start) * scale - 3), 23, r.id, '', crossing && !s.safe ? 'bad mini' : 'data mini');
      });
      for (const [i, p] of s.partitions.entries()) {
        const x = 40 + p.start * scale;
        edge('cut-' + i, x, 48, x, 166, 'control', i === s.current);
        text('byte-' + i, x + 3, 185, p.start + ' B', 'tiny');
      }
      text('byte-end', 860, 185, s.bytes + ' B', 'tiny', 'end');
      const cols = Math.min(3, s.partitions.length), pw = (820 - 18 * (cols - 1)) / cols;
      s.partitions.forEach((p, i) => {
        const x = 40 + i % cols * (pw + 18), y = 220 + Math.floor(i / cols) * 114;
        card('partition-' + p.id, x, y, pw, 102, p.id + ' / bytes ' + p.start + '…' + p.end, '', i === s.current ? 'control top-title' : 'neutral top-title');
        const tokenCols = Math.max(1, Math.floor((pw - 18) / 62));
        p.records.forEach((r, j) => { if (s.emitted.includes(r.id)) card('record-' + r.id, x + 10 + j % tokenCols * 62, y + 34 + Math.floor(j / tokenCols) * 22, 54, 19, r.id, '', 'good mini'); });
      });
      text('reader-note', 40, 465, s.safe ? 'Read beyond a range to finish its owned record; the next reader skips the fragment.' : 'Hard-stop reader: crossing records are dropped. Task success is not record conservation.', 'note');
    } else if (scene.type === 'pipeline') {
      const s = scene;
      ['Source iterator', 'Filter', 'Map', 'Consumer'].forEach((name, i) => card('operator-' + i, 35 + i * 220, 70, 170, 76, name,
        ['complete records', "paid && amount ≥ " + s.minAmount, '(city, amount)', 'pull next()'][i], 'neutral'));
      for (let i = 0; i < 3; i++) {
        edge('data-' + i, 205 + i * 220, 107, 255 + i * 220, 107);
        edge('demand-' + i, 255 + i * 220, 45, 205 + i * 220, 45, 'control');
      }
      label('demand-label', 440, 26, 'DEMAND ←     RECORDS →');
      const current = s.rows.find(r => r.id === s.current);
      if (current) {
        const x = s.at === 'filter' || s.at === 'skip' ? 270 : 710;
        card('current-record', x, s.at === 'skip' ? 183 : 153, 155, 42, current.id, s.at === 'yield' ? current.city + ' · ' + current.amount : current.status + ' · ' + current.amount, s.at === 'skip' ? 'bad' : s.at === 'yield' ? 'good' : 'data');
      }
      label('source-ledger-label', 40, 248, 'SOURCE IDENTITY LEDGER / SAME RECORDS, CHANGING REPRESENTATION');
      s.rows.forEach((r, i) => card('ledger-' + r.id, 40 + i % 4 * 208, 271 + Math.floor(i / 4) * 53, 187, 41,
        r.id + ' · ' + r.city + ' · ' + r.amount, '', s.passed.includes(r.id) ? 'good' : s.seen.includes(r.id) ? 'muted' : 'neutral'));
      text('pipeline-note', 40, 465, 'A streaming chain keeps only current records; stateful or user-retaining operators need another contract.', 'note');
    } else if (scene.type === 'lineage') {
      const s = scene;
      ['RDD0 / Source','RDD1 / Filter','RDD2 / Map'].forEach((name, i) => card('rdd-' + i, 40 + i * 205, 82, 166, 88, name, 'compute(partition)', s.active === 'graph' ? 'control' : 'neutral'));
      edge('dep-0', 206, 126, 245, 126, 'control'); edge('dep-1', 411, 126, 450, 126, 'control');
      card('action', 680, 82, 170, 88, 'Action / count', 'partition demand', ['action','reuse'].includes(s.active) ? 'control' : 'neutral');
      edge('action-demand', 680, 128, 616, 128, 'control');
      card('store', 450, 218, 400, 190, 'Partition block store', 'Lookup before compute; missing blocks follow lineage.', s.active === 'cache' || s.active === 'reuse' ? 'good top-title' : 'neutral top-title');
      edge('block-lookup', 533, 170, 533, 218, 'control');
      for (let i = 0; i < s.partitions; i++) card('cached-P' + i, 470 + i % 3 * 120, 279 + Math.floor(i / 3) * 47, 104, 35,
        'P' + i, s.cached.includes('P' + i) ? 'available' : 'absent', s.cached.includes('P' + i) ? 'good' : 'muted');
      card('source-contract', 40, 245, 336, 104, 'Recipe ≠ resident output', 'Parents + reproducible input permit recomputation.', 'control');
      text('checkpoint-note', 40, 455, s.active === 'checkpoint' ? 'Durable checkpoint storage is an extension: materialize safely before cutting parents.' : 'Persistence intent alone never proves a partition block is available.', 'note');
    } else if (scene.type === 'stages') {
      const s = scene;
      rect('producer-stage', 28, 72, 532, 302, 'stage-band'); rect('consumer-stage', 647, 72, 224, 302, 'stage-band');
      label('stage-0-title', 46, 100, 'S0 / SHUFFLE PRODUCER'); label('stage-1-title', 666, 100, 'S1 / RESULT');
      ['Read','Filter','Map + partial sum'].forEach((name, i) => card('plan-op-' + i, 45 + i * 171, 136, 153, 76, name, 'local iterator', ['narrow','wait'].includes(s.phase) ? 'control' : 'neutral'));
      edge('narrow-0', 198, 174, 216, 174, 'control'); edge('narrow-1', 369, 174, 387, 174, 'control');
      card('shuffle-gate', 577, 127, 53, 118, '↔', 'hash', 'data'); edge('to-exchange', 540, 174, 577, 174); edge('to-reduce', 630, 174, 668, 174);
      card('final-aggregate', 668, 136, 182, 76, 'Final sum', s.phase === 'ready' ? 'inputs available' : 'wait for outputs', s.phase === 'ready' ? 'good' : 'warning');
      label('producer-tasks-label', 48, 260, s.maps + ' MAP TASKS / PARTITIONS');
      for (let p = 0; p < s.maps; p++) card('planned-P' + p, 48 + p % 3 * 164, 279 + Math.floor(p / 3) * 38, 146, 28, 'T' + p + ' → P' + p, '', 'control mini');
      label('reducer-tasks-label', 667, 260, s.reducers + ' REDUCE TASKS');
      for (let r = 0; r < s.reducers; r++) card('planned-R' + r, 667 + r % 2 * 96, 279 + Math.floor(r / 2) * 29, 83, 22, 'R' + r, '', s.phase === 'ready' ? 'good mini' : 'muted mini');
      text('stage-note', 40, 450, 'Stage boundaries follow dependencies. Partition counts define work; slots define concurrency.', 'note');
    } else if (scene.type === 'schedule') {
      const s = scene;
      label('queue-title', 30, 27, 'PENDING'); label('complete-title', 30, 387, 'COMPLETED');
      for (let slot = 0; slot < s.slots; slot++) {
        const y = 80 + slot * 44;
        rect('slot-lane-' + slot, 30, y, 836, 38, 'slot-lane');
        text('slot-label-' + slot, 44, y + 24, 'E' + Math.floor(slot / s.cores) + ' / slot ' + slot % s.cores, 'small');
        edge('dispatch-arrow-' + slot, 192, y + 19, 238, y + 19, 'control', s.tasks.some(t => t.status === 'running' && t.slot === slot));
      }
      s.tasks.forEach((t, i) => {
        let x = 34 + i * 138, y = 35;
        if (t.status === 'running') { x = 255; y = 83 + t.slot * 44; }
        if (t.status === 'complete') { x = 34 + i * 138; y = 400; }
        card('task-' + t.id, x, y, 123, 31, t.id + '.' + t.attempt + ' → ' + t.partition, '', t.status === 'complete' ? 'good mini' : t.status === 'running' ? 'control mini' : 'neutral mini');
      });
      text('wave-note', 30, 465, 'Wave ' + s.wave + ' · equal-duration teaching tasks; one attempt occupies one registered slot.', 'note');
    } else if (scene.type === 'shuffle') {
      const s = scene, maps = s.shuffle.maps, reducers = s.shuffle.reducers, cw = 580 / reducers;
      label('map-output-title', 32, 27, 'MAP OUTPUT / DATA + INDEX'); label('logical-range-title', 245, 27, 'LOGICAL REDUCER RANGES');
      maps.forEach((m, i) => {
        const y = 56 + i * 49, ready = s.published.includes(m.id);
        card('map-file-' + m.id, 30, y, 190, 41, m.id + (ready ? ' / ' + m.file : ' / pending output'), ready ? m.bytes + ' B · ' + m.records.length + ' entries' : i === s.map ? 'local partial state' : 'not published', ready ? 'data' : 'muted');
        m.blocks.forEach((block, r) => {
          const selected = r === s.reducer || i === s.map;
          card('block-' + m.id + '-R' + r, 244 + r * cw, y, cw - 10, 41, 'R' + r + (ready ? ' · ' + block.length : ' · pending'),
            ready ? m.index[r] + '…' + m.index[r + 1] + ' B' : 'no registered range', ready && selected ? 'good' : 'muted');
          if (r === s.reducer) card('fetch-' + m.id, 251 + r * cw + i % 2 * 12, 345 + Math.floor(i / 2) * 15, 73, 20, m.id + '→R' + r, '', 'data mini');
        });
      });
      for (let r = 0; r < reducers; r++) {
        card('reducer-' + r, 244 + r * cw, 407, cw - 10, 46, 'Reducer R' + r, s.fetched.includes(r) ? s.shuffle.loads[r] + ' fetched entries' : 'waiting for inputs', r === s.reducer || s.phase === 'reduce' ? 'good' : 'neutral');
        edge('fetch-arrow-' + r, 244 + r * cw + (cw - 10) / 2, 325, 244 + r * cw + (cw - 10) / 2, 403, 'data', r === s.reducer);
      }
      text('shuffle-note', 30, 475, 'Offsets refer to real encoded toy bytes; empty ranges have equal start and end offsets.', 'note');
    } else if (scene.type === 'memory') {
      const s = scene, cell = Math.min(132, 820 / s.capacity);
      label('buffer-title', 40, 30, s.map + ' / MANAGED BUFFER GRANT: ' + s.capacity + ' ENTRIES');
      for (let i = 0; i < s.capacity; i++) {
        const r = s.buffer[i]; card('buffer-' + i, 40 + i * cell, 67, cell - 10, 68, r ? r[0] : 'free', r ? String(r[1]) : 'capacity', r ? 'control' : 'muted');
      }
      label('spill-title', 40, 192, 'MODELED LOCAL DISK / SORTED RUNS');
      s.spilled.forEach((run, i) => card('spill-run-' + run.id, 40 + i % 5 * 166, 213 + Math.floor(i / 5) * 53, 151, 44,
        run.id, run.records.map(x => x[0] + ':' + x[1]).join(' · '), 'data'));
      edge('spill-arrow', 440, 145, 440, 176, 'data', s.phase === 'spill');
      label('merge-title', 40, 361, 'MERGE → INDEXED OUTPUT');
      if (s.phase === 'merge') s.merged.forEach(([key,value],i) => card('merged-' + i, 40 + i % 5 * 166, 383 + Math.floor(i / 5) * 31, 151, 27, key + ' = ' + value, '', 'good mini'));
      text('memory-note', 40, 465, 'Runs are arrays representing disk; a real external sorter needs files and bounded merge cursors.', 'note');
    } else if (scene.type === 'commit') {
      const s = scene;
      label('private-title', 30, 29, 'PRIVATE ATTEMPT OUTPUT'); label('visible-title', 510, 29, 'INDIVIDUALLY VISIBLE OBJECTS');
      s.attempts.forEach((a, i) => {
        const accepted = s.accepted.some(x => x.partition === a.partition && x.attempt === a.attempt);
        card('attempt-' + a.id, 30 + i % 2 * 209, 66 + Math.floor(i / 2) * 67, 190, 53, a.id + ' / R' + a.partition,
          s.phase === 'private' ? 'isolated temporary output' : accepted ? 'authorized winner' : 'denied / cleanup', s.phase === 'private' ? 'neutral' : accepted ? 'good' : 'bad');
      });
      s.accepted.forEach((file, i) => {
        const published = s.visible.some(x => x.id === file.id);
        card('visible-' + file.id, 510 + i % 2 * 182, 66 + Math.floor(i / 2) * 67, 165, 53, file.id,
          published ? file.rows.length + ' key result(s)' : 'not visible', published ? 'data' : 'muted');
      });
      edge('publication', 436, 192, 494, 192, 'data', s.visible.length > 0);
      card('readiness', 510, 318, 347, 86, s.ready ? 'READY / completion signalled' : s.aborted ? 'ABORTED / dataset not ready' : 'NOT READY / still publishing',
        s.ready ? 'Readers may use the completed dataset.' : 'Visible files do not prove completeness.', s.ready ? 'good' : s.aborted ? 'bad' : 'warning');
      text('commit-note', 30, 455, 'One winning attempt per task does not make the entire output directory an atomic snapshot.', 'note');
    } else if (scene.type === 'sql') {
      const s = scene;
      label('logical-plan-title', 35, 28, 'LOGICAL / ANALYZED EXPRESSIONS'); label('physical-plan-title', 505, 28, 'PHYSICAL / DISTRIBUTION + ORDER');
      s.plan.logical.forEach((name, i) => {
        card('logical-op-' + i, 35, 60 + i * 78, 360, 55, name, i === 0 ? 'id · city · amount · status' : '', ['logical','analyze','rewrite'].includes(s.phase) ? 'control' : 'neutral');
        if (i < s.plan.logical.length - 1) edge('logical-edge-' + i, 215, 115 + i * 78, 215, 135 + i * 78, 'control');
      });
      if (s.phase === 'codegen' || s.phase === 'execute') {
        rect('codegen-0', 494, 48, 372, 256, 'codegen-band'); rect('codegen-1', 494, 357, 372, 61, 'codegen-band');
      }
      s.plan.physical.forEach((op, i) => {
        const shown = ['physical','codegen','execute'].includes(s.phase);
        card('physical-op-' + i, 505, 58 + i * 61, 349, 48, op.operator, op.detail, op.operator === 'Exchange' ? 'data' : shown ? 'good' : 'muted');
        if (i < s.plan.physical.length - 1) edge('physical-edge-' + i, 681, 106 + i * 61, 681, 116 + i * 61, op.operator === 'Exchange' ? 'data' : 'control', shown);
      });
      text('sql-note', 35, 459, s.phase === 'rewrite' ? 'Required scan fields: ' + s.plan.scanColumns.join(', ') + '. CSV still decodes full lines.' : 'This small planner represents property requirements; it does not compile Spark SQL or generate JVM code.', 'note');
    } else if (scene.type === 'join') {
      const s = scene;
      card('dimension', 30, 60, 255, 153, 'City → region dimension', 'HN North · HUE Central · SG South', 'data top-title');
      s.dimensions.forEach(([key, value], i) => card('dim-' + key, 45, 105 + i * 31, 225, 25, key + ' → ' + value, '', 'data mini'));
      label('join-mode', 360, 30, s.strategy === 'broadcast' ? 'BROADCAST BUILD / LOCAL PROBE' : 'ALIGNED INPUTS / SORT / MERGE');
      if (s.strategy === 'broadcast') for (let i = 0; i < s.executors; i++) {
        const y = 57 + i * 105;
        card('join-executor-' + i, 471, y, 385, 85, 'E' + i + ' / local join probe', s.phase === 'choose' ? 'waiting for build state' : 'hash: HN→North · HUE→Central · SG→South', s.phase === 'choose' ? 'neutral' : 'good');
        edge('broadcast-' + i, 285, 129, 470, y + 42, 'data', ['place','probe','verify'].includes(s.phase));
      } else for (let i = 0; i < Math.min(5, s.reducers); i++) {
        const w = 470 / s.reducers;
        card('aligned-join-' + i, 365 + i * w, 156, w - 10, 97, 'R' + i, 'sort both inputs', 'control');
        edge('dimension-shuffle-' + i, 285, 137, 365 + i * w + w / 2, 156, 'data', s.phase !== 'choose');
      }
      label('fact-title', 30, 294, 'PAID ORDERS / STREAMED INPUT');
      s.partitions.forEach((p, i) => card('fact-part-' + i, 30 + i % 3 * 140, 310 + Math.floor(i / 3) * 47, 125, 36, p.id, p.records.length + ' source rows', 'neutral'));
      if (s.phase === 'probe' || s.phase === 'verify') card('join-row', 475, 390, 380, 48, s.rows[0] ? s.rows[0].id + ' → ' + s.rows[0].city : 'No paid orders', s.rows[0] ? 'matches one region row' : 'empty inner join', 'good');
      text('join-note', 30, 460, 'Synthetic MB estimates choose placement. The actual matching relation shown here has three rows.', 'note');
    } else if (scene.type === 'adaptive') {
      const s = scene, a = s.adaptation;
      label('observed-title', 35, 27, 'MEASURED HASH DESTINATIONS / RECORD COUNTS');
      a.loads.forEach((n, i) => {
        const y = 54 + i * 32;
        text('load-label-' + i, 35, y + 20, 'R' + i, 'small');
        rect('load-track-' + i, 83, y, 560, 25, 'panel'); rect('load-bar-' + i, 83, y, n / 12 * 560, 25, n === a.maximum && n > 6 ? 'hot-bar' : 'load-bar');
        text('load-count-' + i, 666, y + 20, n + ' rows', 'small');
      });
      if (s.phase !== 'measure' && s.phase !== 'merge') {
        const consumers = s.phase === 'coalesce' || s.operation === 'join';
        label('adaptive-piece-title', 35, 246, consumers ? 'CONSUMER PIECES / REMAINING WORK' : 'GROUPED SUM / EXPLICIT PARTIAL STATE');
        const pieces = consumers ? (s.phase === 'coalesce' ? a.coalescedBeforeSplit : a.coalesced).map(p => [p.id, p.rows + ' rows' + (p.counterpart ? ' + counterpart' : '')]) : a.partials.map(([k,v]) => [k, 'sum ' + v]);
        if (s.phase !== 'skew' || s.operation === 'join') pieces.forEach(([key,value],i) => card('adaptive-piece-' + key, 35 + i % 4 * 211, 269 + Math.floor(i / 4) * 53, 191, 42, key, value, 'data'));
        else card('group-boundary',35,269,825,65,'A hot key still belongs to one logical group','Hash buckets cannot divide it; introduce valid partial state explicitly.','warning');
      }
      if (s.phase === 'merge') cityTotal(a.totals,35,324);
      text('adapt-note', 35, 477, s.operation === 'group' ? 'An unsalted hot key remains one group. Valid salted state can merge back to the same answer.' : 'Join splitting repeats required counterpart input; the toy uses record thresholds, not Spark bytes.', 'note');
    } else if (scene.type === 'evidence') {
      const s = scene, last = s.events.slice(-10);
      label('event-source-title', 35, 29, 'EVENTS EMITTED BY THE REFERENCE RUN');
      last.forEach((e, i) => card('event-' + e.sequence, 35 + i % 2 * 420, 58 + Math.floor(i / 2) * 58, 396, 47,
        e.sequence + ' / ' + e.type, e.detail, ['archive','replay'].includes(s.phase) ? 'good' : 'control'));
      card('archive', 35, 384, 825, 61, s.phase === 'archive' || s.phase === 'replay' ? 'Retained log → history views / no old executors required' : 'Append events while the application runs',
        s.events.length + ' of ' + s.total + ' reference events shown in this snapshot', 'data');
      text('evidence-note', 35, 471, 'Event sequence is reported evidence, not a globally synchronized timeline or an application replay.', 'note');
    }
    return out;
  }
  function fitText(el, value, width, average) {
    if (value.length * average > width) { el.setAttribute('textLength', width); el.setAttribute('lengthAdjust','spacingAndGlyphs'); }
    else { el.removeAttribute('textLength'); el.removeAttribute('lengthAdjust'); }
  }
  function render(svg, scene, title, description) {
    if (!svg._elements) {
      svg.innerHTML = '<title></title><desc></desc><defs>' + ['control','data'].map(kind => `<marker id="${kind}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" class="${kind}"/></marker>`).join('') + '</defs><g class="objects"></g>';
      svg._elements = new Map();
    }
    svg.querySelector('title').textContent = title; svg.querySelector('desc').textContent = description;
    const layer = svg.querySelector('.objects'), seen = new Set();
    for (const d of drawing(scene)) {
      seen.add(d.id); let entry = svg._elements.get(d.id);
      if (entry && entry.type !== d.type) { entry.el.remove(); svg._elements.delete(d.id); entry = null; }
      if (!entry) {
        const el = document.createElementNS(NS, d.type === 'card' ? 'g' : d.type);
        el.dataset.key = d.id;
        if (d.type === 'card') el.innerHTML = '<rect rx="9"></rect><text class="card-title"></text><text class="card-sub"></text>';
        layer.append(el); entry = { type: d.type, el }; svg._elements.set(d.id, entry);
      }
      const el = entry.el; el.setAttribute('class', d.type + ' ' + (d.cls || ''));
      if (d.type === 'text') {
        el.setAttribute('x', d.x); el.setAttribute('y', d.y); el.setAttribute('text-anchor', d.anchor); el.textContent = d.label;
        if (d.cls.includes('note')) fitText(el, d.label, 865 - d.x, 6.6);
      } else if (d.type === 'line') {
        for (const a of ['x1','y1','x2','y2']) el.setAttribute(a, d[a]);
        el.setAttribute('marker-end', 'url(#' + d.marker + ')');
      } else {
        if (d.type === 'rect') {
          for (const [a,v] of Object.entries({ x:d.x,y:d.y,width:d.w,height:d.h,rx:8 })) el.setAttribute(a,v);
        } else {
          el.style.transform = `translate(${d.x}px,${d.y}px)`;
          const r = el.querySelector('rect'), t = el.querySelector('.card-title'), sub = el.querySelector('.card-sub');
          r.setAttribute('width', d.w); r.setAttribute('height', d.h);
          const top = d.cls.includes('top-title');
          t.setAttribute('x', top ? 14 : d.w / 2); t.setAttribute('text-anchor', top ? 'start' : 'middle');
          t.setAttribute('y', top ? 25 : d.sub ? d.h / 2 - 3 : d.h / 2 + 5); t.textContent = d.label;
          fitText(t, d.label, d.w - 22, d.cls.includes('mini') ? 6 : 7.2);
          sub.setAttribute('x', top ? 14 : d.w / 2); sub.setAttribute('text-anchor', top ? 'start' : 'middle');
          sub.setAttribute('y', top ? 45 : d.h / 2 + 17); sub.textContent = d.sub;
          fitText(sub, d.sub, d.w - 22, 6);
        }
      }
      // The scene descriptor order is also SVG paint order (bands stay behind cards).
      layer.append(el);
    }
    for (const [key, entry] of svg._elements) if (!seen.has(key)) { entry.el.remove(); svg._elements.delete(key); }
  }
  if (typeof module === 'object' && module.exports) module.exports = { drawing, render };
  else window.SparkScenes = { render };
})();
