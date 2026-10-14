/* Computed LSM animation: writes go to a commitlog and a memtable, a full memtable is flushed to an immutable SSTable,
 * reads merge the memtable and every SSTable that may hold the key, and compaction merges SSTables. Deletes write tombstones.
 * The model is pure (Course.lsm) so Node can test it. The course supplies the memtable size, the compaction threshold and presets. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fresh = () => ({ mem: {}, sst: [], clock: 0, log: 0, nextId: 1 });
  const copyCells = c => { const o = {}; Object.keys(c).forEach(k => { o[k] = { ts: c[k].ts, tomb: !!c[k].tomb }; }); return o; };
  const snap = (m, extra) => Object.assign({ mem: copyCells(m.mem), sst: m.sst.map(s => ({ id: s.id, cells: copyCells(s.cells) })), log: m.log, probe: null, title: '', text: '', tone: '' }, extra);
  const cellStr = (k, c) => `${k} ${c.tomb ? '✕' : 'v' + c.ts}`;

  function flush(m, sc, why) {
    const keys = Object.keys(m.mem); if (!keys.length) return null;
    const t = { id: m.nextId++, cells: m.mem }; m.sst.push(t); m.mem = {}; m.log = 0;
    return snap(m, { title: `Flush to SSTable ${t.id}`, text: `${why} The memtable is written, sorted by key, as one immutable file: SSTable ${t.id} with ${keys.length} cell${keys.length > 1 ? 's' : ''}. The commitlog segments for these writes can be released. SSTables are never edited, so an update or delete later goes into a newer file.`, tone: 'ok', fresh: t.id });
  }

  /* Apply one op. Returns an array of frames. */
  function step(m, op, sc) {
    const out = [];
    if (op.op === 'put' || op.op === 'del') {
      const tomb = op.op === 'del'; m.clock++; m.mem[op.k] = { ts: m.clock, tomb }; m.log++;
      out.push(snap(m, { title: tomb ? `Delete ${op.k}: write a tombstone` : `Write ${op.k} (timestamp ${m.clock})`, text: tomb ? `A delete does not remove anything. It writes a tombstone for ${op.k} with timestamp ${m.clock}, first to the commitlog and then to the memtable. The old value stays in older SSTables until compaction merges them.` : `The write is appended to the commitlog (sequential, for crash safety) and put in the memtable, a sorted structure in memory. Each cell carries a write timestamp, ${m.clock} here. The client can be acknowledged now: no data file was touched.`, touched: op.k }));
      if (Object.keys(m.mem).length >= sc.memCap) out.push(flush(m, sc, `The memtable holds ${sc.memCap} cells, its limit in this demo.`));
      return out;
    }
    if (op.op === 'flush') { const f = flush(m, sc, 'A flush is requested.'); return [f || snap(m, { title: 'Nothing to flush', text: 'The memtable is empty.', tone: 'bad' })]; }
    if (op.op === 'compact') {
      if (m.sst.length < sc.threshold) return [snap(m, { title: 'Not enough SSTables', text: `Size-tiered compaction waits for ${sc.threshold} SSTables of similar size (the real default min_threshold is 4; the demo uses ${sc.threshold}). There are ${m.sst.length}.`, tone: 'bad' })];
      const before = m.sst.reduce((a, s) => a + Object.keys(s.cells).length, 0), merged = {}; let dropped = 0, purged = 0;
      m.sst.forEach(s => Object.keys(s.cells).forEach(k => { const c = s.cells[k]; if (!merged[k] || merged[k].ts < c.ts) merged[k] = c; }));
      if (op.purge) Object.keys(merged).forEach(k => { if (merged[k].tomb) { delete merged[k]; purged++; } });
      const after = Object.keys(merged).length; dropped = before - after - purged;
      const inputs = m.sst.map(s => s.id), t = { id: m.nextId++, cells: merged }; m.sst = [t];
      return [snap(m, { title: `Compact SSTables ${inputs.join(', ')} into ${t.id}`, text: `The inputs held ${before} cells. For every key the newest timestamp wins, which drops ${dropped} overwritten cell${dropped === 1 ? '' : 's'}. ${purged ? `${purged} tombstone${purged > 1 ? 's were' : ' was'} purged because every older copy was in this compaction and gc_grace_seconds had passed.` : 'Tombstones are kept: they must outlive gc_grace_seconds, and a repair must have spread them, before they can be dropped.'} The output ${after} cell${after === 1 ? '' : 's'} are written first and the inputs deleted after, so the disk briefly holds both.`, tone: 'ok', fresh: t.id })];
    }
    if (op.op === 'get') {
      const found = [], probe = { mem: false, read: [], skip: [] };
      if (m.mem[op.k]) { probe.mem = true; found.push(['memtable', m.mem[op.k]]); }
      for (let i = m.sst.length - 1; i >= 0; i--) { const s = m.sst[i]; if (s.cells[op.k]) { probe.read.push(s.id); found.push(['SSTable ' + s.id, s.cells[op.k]]); } else probe.skip.push(s.id); }
      if (!found.length) return [snap(m, { probe, title: `Read ${op.k}: not found`, text: `No bloom filter says "maybe": the memtable does not have ${op.k}, and every SSTable's filter says it is definitely absent, so no data file was read.`, tone: 'bad' })];
      const win = found.reduce((a, b) => b[1].ts > a[1].ts ? b : a), many = found.length > 1;
      return [snap(m, { probe, title: win[1].tomb ? `Read ${op.k}: deleted` : `Read ${op.k} = v${win[1].ts}`, text: `${probe.mem ? 'The memtable has a cell. ' : ''}${probe.read.length ? `Bloom filters say "maybe present" for SSTable${probe.read.length > 1 ? 's' : ''} ${probe.read.join(', ')}, so those are read. ` : ''}${probe.skip.length ? `SSTable${probe.skip.length > 1 ? 's' : ''} ${probe.skip.join(', ')} ${probe.skip.length > 1 ? 'are' : 'is'} skipped: the filter says definitely absent. ` : ''}${many ? `The cells are merged and the newest timestamp (${win[1].ts}, from ${win[0]}) wins.` : `Only ${win[0]} has it.`}${win[1].tomb ? ' The newest cell is a tombstone, so the key reads as deleted even though older values still sit in files.' : ''} Data files read: ${probe.read.length}.`, tone: win[1].tomb ? 'bad' : 'ok', touched: op.k })];
    }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(sc, ops) {
    const m = fresh(), frames = [snap(m, { title: 'An empty node', text: `Writes go to the commitlog and the memtable (it holds ${sc.memCap} cells here). A full memtable becomes an SSTable. Compaction merges SSTables when ${sc.threshold} exist. Use the buttons to try it.` })], opStart = [];
    ops.forEach(op => { opStart.push(frames.length); step(m, op, sc).forEach(f => frames.push(f)); });
    return { frames, opStart, model: m };
  }

  function draw(fr, sc) {
    const cellHtml = (k, c, cls) => `<span class="lm-cell${c.tomb ? ' tomb' : ''}${cls || ''}${fr.touched === k ? ' key' : ''}" title="timestamp ${c.ts}">${esc(cellStr(k, c))}</span>`;
    const mem = Object.keys(fr.mem).sort().map(k => cellHtml(k, fr.mem[k], fr.probe && fr.probe.mem ? ' read' : '')).join('') || '<i>empty</i>';
    const ssts = fr.sst.slice().reverse().map(s => {
      const cls = fr.probe ? (fr.probe.read.includes(s.id) ? ' read' : fr.probe.skip.includes(s.id) ? ' skip' : '') : '';
      const tag = fr.probe ? (fr.probe.read.includes(s.id) ? '<em>bloom: maybe, read</em>' : fr.probe.skip.includes(s.id) ? '<em>bloom: absent, skipped</em>' : '') : '';
      return `<div class="lm-sst${cls}${fr.fresh === s.id ? ' fresh' : ''}"><b>SSTable ${s.id}</b>${tag}<div>${Object.keys(s.cells).sort().map(k => cellHtml(k, s.cells[k], '')).join('')}</div></div>`;
    }).join('') || '<div class="lm-none">No SSTables yet.</div>';
    return `<div class="lm-mem"><b>Memtable (RAM, sorted)</b><div>${mem}</div></div>
      <div class="lm-log"><b>Commitlog</b><span class="lm-bar"><u style="width:${Math.min(100, fr.log * 100 / sc.memCap)}%"></u></span><em>${fr.log} unflushed write${fr.log === 1 ? '' : 's'}</em></div>
      <div class="lm-files"><b>SSTables on disk (newest first, never edited)</b>${ssts}</div>
      <div class="rf-key">A cell reads "key vTIMESTAMP". A cell with ✕ is a tombstone.</div>`;
  }

  function mount(host, scene) {
    const sc = scene, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs lm">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><label>Key <input type="text" maxlength="3" value="${esc(scene.key || 'a')}" data-key aria-label="Key"></label><button type="button" data-do="put">Write</button><button type="button" data-do="del">Delete</button><button type="button" data-do="get">Read</button><button type="button" data-do="flush">Flush</button><button type="button" data-do="compact">Compact</button><label><input type="checkbox" data-purge> gc_grace_seconds has passed</label></div>
      </div>
      <div class="lm-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(sc, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, cells = fr.sst.reduce((a, s) => a + Object.keys(s.cells).length, 0);
      $('[data-stage]').innerHTML = draw(fr, sc);
      $('[data-stat]').textContent = `memtable ${Object.keys(fr.mem).length} cells · SSTables ${fr.sst.length} · cells on disk ${cells}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(sc, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      const k = ($('[data-key]').value.trim().toLowerCase() || 'a').slice(0, 3);
      if (['put', 'del', 'get'].includes(b.dataset.do)) return add({ op: b.dataset.do, k });
      if (b.dataset.do === 'flush') return add({ op: 'flush' });
      if (b.dataset.do === 'compact') return add({ op: 'compact', purge: $('[data-purge]').checked });
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [], ok = Number.isInteger;
    if (!ok(scene.memCap) || scene.memCap < 2 || scene.memCap > 5) e.push('animation lsm needs memCap from 2 to 5');
    if (!ok(scene.threshold) || scene.threshold < 2 || scene.threshold > 5) e.push('animation lsm needs threshold from 2 to 5');
    const okOp = o => ['put', 'del', 'get'].includes(o.op) ? typeof o.k === 'string' && o.k.length > 0 : o.op === 'flush' || o.op === 'compact';
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation lsm needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation lsm preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.lsm = { fresh, step, runAll };
  root.Course.registerAnimation('lsm', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
