/* Animations for feature 02, the pipeline. One file, four pictures, one per use case:
   slots  (UC-01): the pull chain. A request travels back up the chain, and each box holds at most one row.
   swim   (UC-02): task attempts on a timeline. Each reader's bar shows when it is open and when it closes.
   piles  (UC-03): 12 named rows through two lanes. Eager builds full lists; pull passes one row along. The footer counts rows held.
   basket (UC-04): reader, filter and basket for LIMIT 3, with a strip of every row showing which were read.
   Each step is a full picture of the scene, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n).toLocaleString('en-US');

  const FRAME = `<div class="rs pp">
      <div class="pp-stage" data-stage></div>
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

  /* UC-01: the chain of boxes, with a demand arrow going left and a row going right. */
  function paintSlots(stage, sim, k) {
    const st = sim.steps[k], names = sim.nodes, slots = st.slots || [], src = st.src || [];
    stage.innerHTML = `
      <div class="pp-src"><span class="pp-lab">file</span>${src.length ? src.map(v => `<span class="pp-row">${esc(v)}</span>`).join('') : '<small>no rows left</small>'}</div>
      <div class="pp-chain">${names.map((n, i) => {
        const v = slots[i], flag = st.flag && st.flag[i] ? ' ' + st.flag[i] : '';
        const box = `<div class="pp-node"><div class="pp-nlab">${esc(n)}</div><div class="pp-slot${flag}">${v != null ? esc(v) : '<small>empty</small>'}</div></div>`;
        if (i === names.length - 1) return box;
        const a = st.arrow && st.arrow.gap === i ? st.arrow : null;
        const label = a ? `${a.dir === 'left' ? '← ' : ''}${a.label}${a.dir === 'right' ? ' →' : ''}` : '';
        return box + `<div class="pp-gap${a ? ' on ' + a.dir : ''}"><span>${esc(label)}</span></div>`;
      }).join('')}</div>
      <div class="pp-note">${esc(st.note || '')}</div>`;
    const held = slots.slice(0, names.length - 1).filter(v => v != null).length;
    return `rows read: ${sim.rows - src.length} of ${sim.rows} · rows held in the chain: ${held}`;
  }

  /* UC-02: one lane per attempt. The thin bar is the task, the thick bar is the reader. Open readers are striped. */
  function paintSwim(stage, sim, k) {
    const t = sim.steps[k].t, T = sim.tMax;
    const pct = v => (v / T * 100) + '%';
    const openAt = tt => sim.lanes.filter(l => l.reader[0] <= tt && tt < l.reader[1]).length;
    let maxOpen = 0;
    for (let i = 0; i <= k; i++) maxOpen = Math.max(maxOpen, openAt(sim.steps[i].t));
    const closed = sim.lanes.filter(l => l.reader[1] <= t).length;
    const ticks = Array.from({ length: T / 2 + 1 }, (_, i) => i * 2).map(v => `<span style="left:${pct(v)}">${v}</span>`).join('');
    stage.innerHTML = `
      <div class="sw-axis"><div></div><div class="sw-track sw-ticks">${ticks}</div></div>
      ${sim.lanes.map(l => {
        const taskW = l.task[0] <= t ? (Math.min(t, l.task[1]) - l.task[0]) / T * 100 : 0;
        const readW = l.reader[0] <= t ? (Math.min(t, l.reader[1]) - l.reader[0]) / T * 100 : 0;
        const open = l.reader[0] <= t && t < l.reader[1] ? ' open' : '';
        const marks = l.marks.filter(m => m.at <= t).map(m => `<span class="sw-mark ${m.kind || ''}" style="left:${pct(m.at)}">${esc(m.label)}</span>`).join('');
        return `<div class="sw-lane">
          <div class="sw-lanehead">${esc(l.name)}</div>
          <div class="sw-track">
            <span class="sw-task ${l.result}" style="left:${pct(l.task[0])};width:${taskW}%"></span>
            <span class="sw-read ${l.result}${open}" style="left:${pct(l.reader[0])};width:${readW}%"></span>
            ${marks}
            <span class="sw-now" style="left:${pct(t)}"></span>
          </div></div>`;
      }).join('')}`;
    return `open readers now: ${openAt(t)} · most open at once: ${maxOpen} · readers closed: ${closed} of ${sim.lanes.length}`;
  }

  /* UC-03: two lanes, one per way of passing the rows on. Each station is a box with the rows it holds, so you can read the values.
     Dimmed stations hold rows that the next step no longer needs. The footer counts the rows held at once. */
  const STATIONS = ['file', 'reader', 'filter', 'map', 'out'];
  const NAMES = { file: 'file', reader: 'reader', filter: 'filter', map: 'map', out: 'consumer' };
  function heldCount(L) {
    return (L.reader || []).length + (L.filter || []).filter(x => !x.startsWith('✗')).length + (L.map || []).length;
  }
  function paintPiles(stage, sim, k) {
    const peak = key => sim.steps.slice(0, k + 1).reduce((m, s) => Math.max(m, heldCount(s[key])), 0);
    const lane = key => {
      const L = sim.steps[k][key];
      const wait = L.wait || [];
      const stations = STATIONS.map((s, i) => {
        const items = L[s] || [];
        const dim = wait.includes(s) ? ' wait' : '';
        const chips = items.map(x => x.startsWith('✗')
          ? `<span class="pl-chip rej">✗ ${esc(x.slice(1))}</span>`
          : `<span class="pl-chip">${esc(x)}</span>`).join('');
        return `${i ? '<span class="pl-arr">→</span>' : ''}<div class="pl-st${dim}"><div class="pl-sh">${NAMES[s]}</div><div class="pl-items">${chips || '<small class="pl-none">empty</small>'}</div>${dim ? '<div class="pl-tag">held, not needed</div>' : ''}</div>`;
      }).join('');
      const title = key === 'eager' ? 'Eager: each step builds a full list' : 'Pull: one row at a time';
      return `<section class="pl-lane ${key}"><header><b>${title}</b><small>${esc(L.say || '')}</small></header><div class="pl-row">${stations}</div><footer>rows in memory now: <b>${heldCount(L)}</b> · most so far: <b>${peak(key)}</b></footer></section>`;
    };
    stage.innerHTML = lane('eager') + lane('pull');
    return `most rows in memory at once: eager ${peak('eager')} · pull ${peak('pull')}`;
  }

  /* UC-04: the path a row takes (reader, filter, basket), with a strip of all rows below it.
     The reader's current row is judged by the filter, and passing rows fill the basket. The strip shows which rows were read. */
  function paintBasket(stage, sim, k) {
    const upto = sim.steps[k].upto, N = sim.rowsN, V = sim.values, T = sim.threshold, L = sim.limit;
    const kept = [];
    for (let i = 1; i <= upto && kept.length < L; i++) if (V[i - 1] > T) kept.push(i);
    const full = kept.length === L;
    const now = upto > 0 ? upto : null;
    const nowVal = now ? V[now - 1] : null;
    const pass = now ? nowVal > T : null;
    const flowFilter = now === null ? 'keeps values above 10'
      : pass ? 'value above 10: passes' : 'value not above 10: rejected';
    stage.innerHTML = `
      <div class="bk-flow">
        <div class="bk-box"><b>reader</b><span class="bk-big">${now ? 'row ' + now : '–'}</span><small>${now ? 'value ' + nowVal : 'waiting to start'}</small></div>
        <div class="bk-arr">→</div>
        <div class="bk-box ${pass === null ? '' : pass ? 'pass' : 'fail'}"><b>filter</b><span class="bk-big">${pass === null ? 'checks' : pass ? 'passes' : 'rejects'}</span><small>${flowFilter}</small></div>
        <div class="bk-arr">→</div>
        <div class="bk-basket${full ? ' full' : ''}"><b>basket · LIMIT ${L}</b><div class="bk-slots">${Array.from({ length: L }, (_, i) => `<span class="bk-slot${kept[i] ? ' on' : ''}">${kept[i] ? 'row ' + kept[i] : 'empty'}</span>`).join('')}</div><small>${kept.length} of ${L} filled</small></div>
      </div>
      <div class="bk-strip">${Array.from({ length: N }, (_, i) => {
        const n = i + 1, read = n <= upto, ok = read && V[i] > T;
        const cls = !read ? 'unread' : ok ? 'pass' : 'fail';
        return `<div class="bk-cell ${cls}${n === now ? ' now' : ''}"><span class="bk-n">${n}</span><span class="bk-v">${read ? V[i] : ''}</span>${n === now ? '<span class="bk-ptr">▲</span>' : ''}</div>`;
      }).join('')}</div>
      ${full ? `<div class="bk-stop">Basket full: the reader stops and closes. Rows after ${kept[L - 1]} are never read.</div>` : ''}`;
    return `rows read: ${upto} of ${N} · basket: ${kept.length} of ${L}`;
  }

  const PAINT = { slots: paintSlots, swim: paintSwim, piles: paintPiles, basket: paintBasket };

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim]').forEach(host => {
      if (host.dataset.ready || !PAINT[host.dataset.sim]) return;
      run(host, PAINT[host.dataset.sim]);
    });
  }

  root.SparkPipe = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkPipe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
