/* Animations for feature 04, stages. One picture per use case, each step a full picture of the scene:
   dag      (UC-01): the plan as a row of operators. The cursor walks back from the action and cuts a stage before each wide operator.
   gate     (UC-02): producer tasks fill in the driver's output tracker. The child stage opens only at 4 of 4, and shuts again when an output is lost.
   diamond  (UC-03): two branches share one shuffle parent. The planner's memo decides whether that parent is planned again.
   skip     (UC-04): two jobs on one dataset. A map side whose outputs are still registered is skipped by the second job.
   copart   (UC-05): a join that exchanges both sides, against a join whose sides already share a partitioner.
   waves    (UC-06): tasks follow partitions. Slots only decide how many run in each wave.
   Back and Restart just redraw an earlier step, so every step carries its whole state. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function paintDag(stage, sim, k) {
    const st = sim.steps[k], N = sim.nodes;
    const owner = i => { const s = st.stages.find(x => x.nodes.includes(i)); return s ? s.id : null; };
    const chain = N.map((n, i) => {
      const o = owner(i), wide = sim.wide[i];
      const gap = i === 0 ? '' : `<span class="${wide ? 'sg-gap wide' : 'sg-gap'}">${wide ? 'shuffle' : '→'}</span>`;
      return `${gap}<div class="sg-node${o ? ' sg-t' + (o % 3) : ''}${i === st.cur ? ' now' : ''}"><small>${i + 1}</small><b>${esc(n)}</b></div>`;
    }).join('');
    const cards = st.stages.map(s => `<div class="sg-card ${s.state}"><b>${esc(s.name)}</b><div class="sg-chips">${s.nodes.map(i => `<span>${esc(N[i])}</span>`).join('')}</div><em>${esc(s.state)}</em></div>`).join('');
    stage.innerHTML = `<div class="sg-chain">${chain}</div>
      <div class="sg-cards">${cards || '<p class="sg-empty">No stage exists yet.</p>'}</div>`;
    return `stages cut: ${Math.max(0, st.stages.length)} of ${sim.maxStages} · running: ${st.stages.filter(s => s.state === 'running').length}`;
  }

  /* UC-02: four producer tasks fill the tracker. The gate opens at four of four and shuts when an output is lost. */
  function paintGate(stage, sim, k) {
    const st = sim.steps[k], open = st.outputs === sim.tasks;
    const tiles = st.tiles.map((t, i) => {
      const detail = t.s === 'done' ? `host ${t.h}` : t.s === 'rerun' ? `rerun on ${t.h}` : t.s === 'lost' ? 'output lost' : 'running';
      return `<div class="sg-tile ${t.s}"><span>task ${i + 1}</span><em>${detail}</em></div>`;
    }).join('');
    stage.innerHTML = `<div class="sg-gate">
        <div class="sg-box ${st.parent}"><b>Stage 1 · producer</b><small>${st.parent}</small><div class="sg-tiles">${tiles}</div></div>
        <div class="sg-gatebox ${open ? 'open' : 'shut'}"><b>driver tracker</b><div class="sg-bar"><span style="width:${st.outputs / sim.tasks * 100}%"></span></div><strong>${st.outputs} / ${sim.tasks}</strong><small>${open ? 'gate open' : 'gate shut'}</small></div>
        <div class="sg-box ${st.child}"><b>Stage 2 · child</b><small>${st.child}</small></div>
      </div>${st.msg ? `<div class="sg-msg">${esc(st.msg)}</div>` : ''}`;
    return `outputs registered: ${st.outputs} of ${sim.tasks} · child stage: ${st.child}`;
  }

  /* UC-03: the diamond on top, the planner's memo below. A duplicate copy appears only in the step that shows the naive planner. */
  function paintDiamond(stage, sim, k) {
    const st = sim.steps[k], n = st.n;
    const op = (key, name, sub) => `<div class="sg-op ${n[key]}"><b>${esc(name)}</b><small>${esc(sub)}</small></div>`;
    const memo = st.memo.length ? st.memo.map(m => `<span>${esc(m)}</span>`).join('') : '<span>empty</span>';
    const cards = st.stages.map(s => `<div class="sg-card ${s.state}"><b>${esc(s.name)}</b><em>${esc(s.state)}</em></div>`).join('')
      + (st.dup ? '<div class="sg-card duplicate"><b>D copy · map side</b><em>duplicate</em></div>' : '');
    stage.innerHTML = `<div class="sg-dia">
        <div class="sg-row">${op('D', 'D · read + reduceByKey', 'shuffle 1, shared')}</div>
        <div class="sg-row"><span class="sg-arrow">↙</span><span class="sg-arrow">↘</span></div>
        <div class="sg-row">${op('A', 'A · map', 'branch A')}${op('B', 'B · filter', 'branch B')}</div>
        <div class="sg-row"><span class="sg-arrow">↓</span></div>
        <div class="sg-row">${op('R', 'join + collect', 'result')}</div>
      </div>
      <div class="sg-memo"><b>planner memo</b><div class="sg-chips">${memo}</div></div>
      <div class="sg-cards">${cards || '<p class="sg-empty">No stage exists yet.</p>'}</div>`;
    const planned = st.stages.some(s => s.id === 'D') ? (st.dup ? 'planned twice' : 'planned once') : 'not planned yet';
    return `shuffle 1: ${planned} · stages in plan: ${st.stages.length + (st.dup ? 1 : 0)}`;
  }

  /* UC-04: two jobs, one row each. Each stage shows its state, and the outputs bar shows what the driver still holds. */
  const LABEL = { idle: 'not run', run: 'running', done: 'done', skip: 'skipped', waiting: 'waiting', rerun: 'resubmit' };
  function paintSkip(stage, sim, k) {
    const st = sim.steps[k];
    const job = (title, list) => `<div class="sg-job"><b>${title}</b><div class="sg-stages">${list.map(([name, s]) => `<div class="sg-st ${s}"><small>${LABEL[s]}</small>${esc(name)}</div>`).join('')}</div></div>`;
    const j2 = st.j2 ? job('Job 2 · count()', st.j2) : '<div class="sg-job"><b>Job 2 · count()</b><small>not submitted yet</small></div>';
    stage.innerHTML = `<div class="sg-jobs">${job('Job 1 · collect()', st.j1)}${j2}</div>
      <div class="sg-outputs"><b>map outputs registered</b><div class="sg-bar"><span style="width:${st.outputs / 4 * 100}%"></span></div><strong>${st.outputs} / 4</strong></div>`;
    return `outputs registered: ${st.outputs} of 4 · tasks finished: ${st.tasks}`;
  }

  /* UC-05: two inputs, each with its layout tag and partition cells, then the plan. Matching tags fill the cells. */
  function paintCopart(stage, sim, k) {
    const st = sim.steps[k];
    const ds = d => `<div class="sg-ds${d.set ? ' set' : ''}"><b>${esc(d.name)}</b><small>${esc(d.tag)}</small><div class="sg-cells">${Array.from({ length: d.parts }, () => '<i></i>').join('')}</div></div>`;
    const plan = st.plan.length
      ? st.plan.map(p => `<div class="sg-card ${p.kind}"><b>${esc(p.name)}</b><em>${{ out: 'writes exchange', in: 'reads exchange', local: 'no exchange' }[p.kind]}</em></div>`).join('')
      : '<p class="sg-empty">No plan yet.</p>';
    stage.innerHTML = `<div class="sg-data">${ds(st.a)}<div class="sg-join">⋈</div>${ds(st.b)}</div>
      <div class="sg-cards">${plan}</div>`;
    return `stages: ${st.plan.length} · rows moved: ${st.moved}`;
  }

  /* UC-06: one column per wave, one cell per slot. Cells are tasks; the last wave may have idle slots. */
  function paintWaves(stage, sim, k) {
    const st = sim.steps[k], P = st.parts, S = st.slots, W = Math.ceil(P / S), idle = W * S - P;
    const cols = Array.from({ length: W }, (_, w) => {
      const cells = Array.from({ length: S }, (_, s) => {
        const t = w * S + s;
        if (t >= P) return '<div class="sg-cell idle">idle slot</div>';
        const state = !st.started ? 'wait' : w < st.done ? 'done' : w === st.done ? 'run' : 'wait';
        return `<div class="sg-cell ${state}">task ${t + 1}</div>`;
      }).join('');
      return `<div class="sg-wave"><small>wave ${w + 1}</small>${cells}</div>`;
    }).join('');
    stage.innerHTML = `<div class="sg-waves" style="grid-template-columns:repeat(${W},minmax(96px,1fr))">${cols}</div>`;
    return `tasks: ${P} · waves: ${W} · idle slots: ${idle}`;
  }

  const PAINT = { dag: paintDag, gate: paintGate, diamond: paintDiamond, skip: paintSkip, copart: paintCopart, waves: paintWaves };

  Object.entries(PAINT).forEach(([name, painter]) => root.Course.registerAnimation(name, {
    mount(host, scene) { root.Course.animationPlayer(host, scene, painter, 'sg'); }
  }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
