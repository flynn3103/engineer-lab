/* Animations for feature 03, lineage. One picture per use case, each step matching its diagram:
   shelf  (UC-01): a task, the cache shelf, and the chain of read, filter and map. Requests travel left, rows come back right.
   tank   (UC-02): memory with three slots, and every block's state. The state diagram, one change per step.
   tiles  (UC-03): the partitions of three stages. A lost partition is rebuilt by walking back through its parents.
   replay (UC-04): eight operators for one partition. A checkpoint on op4 shortens the replay from eight operators to four.
   Each step is a full picture of the scene, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FRAME = `<div class="rs ls">
      <div class="ls-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;

  function usecase(host) {
    const SD = root.SparkSystemDesign;
    const u = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
    return u && u.sim && u.sim.steps ? u : null;
  }

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

  /* UC-01: the task and the cache shelf on top, the chain of read, filter and map below. */
  function paintShelf(stage, sim, k) {
    const st = sim.steps[k];
    const look = { ask: 'asking', miss: 'miss', store: 'storing', hit: 'hit' }[st.look] || '';
    const slots = ['p1', 'p2', 'p3'].map(p => st.shelf.includes(p)
      ? `<span class="ls-chip">${p}</span>` : `<span class="ls-chip empty">empty</span>`).join('');
    const parts = ['p0', 'p1', 'p2', 'p3'];
    const node = name => {
      const on = st.active === name.toLowerCase() ? ' on' : '';
      const up = st.rows === 'up' && st.active === name.toLowerCase() ? '<span class="ls-up">rows ↑</span>' : '';
      return `<div class="ls-node${on}"><b>${name}</b><div class="ls-parts">${parts.map(p => `<span class="ls-part${p === 'p3' ? ' want' : ''}">${p}</span>`).join('')}</div>${up}</div>`;
    };
    stage.innerHTML = `
      <div class="ls-top">
        <div class="ls-box"><b>task</b><span class="ls-big">partition 3</span><small>${esc(st.task)}</small></div>
        <div class="ls-box"><b>cache (block manager)</b><div class="ls-chips">${slots}</div>${look ? `<span class="ls-badge ${st.look}">${look}</span>` : ''}</div>
      </div>
      <div class="ls-legend">requests travel left along the chain, and rows come back to the right</div>
      <div class="ls-chain">${node('read')}<span class="ls-arr">→</span>${node('filter')}<span class="ls-arr">→</span>${node('map')}</div>
      <div class="ls-msg">${esc(st.msg || '')}</div>`;
    return st.look === 'hit' ? 'answered from the cache: nothing recomputed' : `partitions cached: ${st.shelf.length}`;
  }

  /* UC-02: memory with three slots, and the rest of the blocks outside it with their state. */
  function paintTank(stage, sim, k) {
    const st = sim.steps[k], cap = sim.capacity;
    const tag = c => ({ Requested: 'requested', Resident: 'resident', Evicted: 'evicted', Dropped: 'dropped', NotStored: 'not stored' }[c] || c);
    const slot = i => {
      const b = st.mem[i];
      if (!b) return `<div class="ls-slot empty">free</div>`;
      const s = st.states[b] || 'Resident';
      const pick = st.pick === b ? '<span class="ls-tag pick">least recently used</span>' : '';
      const use = st.inuse.includes(b) ? '<span class="ls-tag use">being read</span>' : '';
      return `<div class="ls-slot ${s}"><b>${b}</b><span class="ls-state ${s}">${tag(s)}</span>${pick}${use}</div>`;
    };
    const outside = Object.keys(st.states).filter(b => !st.mem.includes(b));
    const out = outside.map(b => {
      const s = st.states[b];
      const req = st.request === b ? '<span class="ls-tag req">requested now</span>' : '';
      return `<div class="ls-slot out ${s}"><b>${b}</b><span class="ls-state ${s}">${tag(s)}</span>${req}</div>`;
    }).join('');
    stage.innerHTML = `
      <div class="ls-tank">
        <div class="ls-tankhead"><b>memory</b><small>${st.mem.length} of ${cap} slots used</small></div>
        <div class="ls-slots">${Array.from({ length: cap }, (_, i) => slot(i)).join('')}</div>
      </div>
      <div class="ls-tank out-box"><div class="ls-tankhead"><b>outside memory</b><small>these blocks have no copy in memory</small></div><div class="ls-slots">${out || '<small>nothing yet</small>'}</div></div>
      <div class="ls-msg">${esc(st.msg || '')}</div>`;
    const nonRes = outside.length;
    return `in memory: ${st.mem.length} of ${cap} · outside memory: ${nonRes}`;
  }

  /* UC-03: partitions as tiles. Rows are stages (A read, B filter, C map), columns are partitions 0 to 3. */
  function paintTiles(stage, sim, k) {
    const st = sim.steps[k], rows = ['A', 'B', 'C'], cols = [0, 1, 2, 3];
    const label = (key, s) => {
      if (s === 'lost') return 'lost';
      if (s === 'rebuilt') return 'rebuilt on E1';
      if (s === 'rebuilding') return 'rebuilding';
      if (s === 'wanted') return 'needed';
      if (s === 'source') return 'read from file';
      return key[0] === 'A' ? 'file' : (key === 'B2' || key === 'C2') ? 'on E2' : 'on E1';
    };
    const cell = (r, p) => {
      const key = r + p, s = st.states[key] || 'ok';
      return `<div class="ls-tile ${s}"><b>${key}</b><small>${label(key, s)}</small></div>`;
    };
    const row = (r, i) => `<div class="ls-trow"><span class="ls-rname">${sim.stages[i]}</span>${cols.map(p => cell(r, p)).join('')}</div>`;
    const counts = { place: 0, lost: 0, rebuilt: 0 };
    rows.forEach(r => cols.forEach(p => {
      const s = st.states[r + p] || 'ok';
      if (s === 'lost') counts.lost++;
      else if (s === 'rebuilt') counts.rebuilt++;
      if (s === 'ok' || s === 'source' || s === 'rebuilt' || s === 'wanted') counts.place++;
    }));
    stage.innerHTML = `
      <div class="ls-grid">${rows.map((r, i) => row(r, i)).join('')}</div>
      <div class="ls-legend">E1 and E2 are executors. The file holds the source data, A.</div>
      <div class="ls-msg">${esc(st.msg || '')}</div>`;
    return `in place: ${counts.place} of 12 · lost: ${counts.lost} · rebuilt: ${counts.rebuilt}`;
  }

  /* UC-04: the eight operators of one partition, and the replay cost. */
  function paintReplay(stage, sim, k) {
    const st = sim.steps[k], N = sim.ops, ck = sim.checkpointAfter;
    const name = { idle: 'not run', ran: 'ran', result: 'result', lost: 'lost', gone: 'not kept', replay: 'replaying', done: 'rebuilt', wait: 'waiting', marked: 'marked', writing: 'writing', checkpoint: 'saved', skip: 'not needed', read: 'read from checkpoint' };
    const ops = st.states.map((s, i) => {
      const isCk = i + 1 === ck && ['marked', 'writing', 'checkpoint', 'read'].includes(s);
      const arrow = i < N - 1 ? '<span class="ls-arr">→</span>' : '';
      return `<div class="ls-op ${s}"><b>op${i + 1}</b><span>${name[s] || s}</span>${isCk ? '<em>checkpoint</em>' : ''}</div>${arrow}`;
    }).join('');
    const c = st.cost;
    const bar = c ? `<div class="ls-cost"><b>operators replayed</b><div class="ls-bar"><span style="width:${c.replayed / c.of * 100}%"></span></div><small>${c.replayed} of ${c.of}</small></div>` : '';
    stage.innerHTML = `
      <div class="ls-chain ops">${ops}</div>
      ${bar}
      <div class="ls-msg">${esc(st.msg || '')}</div>`;
    return c ? `operators replayed: ${c.replayed} of ${c.of}` : 'no rebuild running';
  }

  const PAINT = { shelf: paintShelf, tank: paintTank, tiles: paintTiles, replay: paintReplay };

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim]').forEach(host => {
      if (host.dataset.ready || !PAINT[host.dataset.sim]) return;
      run(host, PAINT[host.dataset.sim]);
    });
  }

  root.SparkLineage = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkLineage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
