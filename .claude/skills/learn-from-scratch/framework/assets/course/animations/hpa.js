/* Computed Horizontal Pod Autoscaler animation: every 15 s tick the HPA compares the average CPU use of the READY pods with its target,
 * applies a 10% tolerance, picks desired = ceil(ready x use / target), clamps to min and max, limits how fast it may scale up,
 * and waits out a stabilization window before scaling down. New pods need a warm-up before they are ready. The model is pure
 * (Course.hpa) so Node can test it. The course supplies requests, target, limits and presets. */
(function (root) {
  'use strict';
  const esc = root.Course.esc;

  function fresh(c) { return { ready: c.start, starting: [], load: c.start * c.req * c.target / 100, t: 0, recs: [], hist: [], req: true, last: null }; }
  const snap = m => ({ ready: m.ready, starting: m.starting.length, load: m.load, t: m.t, hist: m.hist.slice(), req: m.req });

  function tick(m, c) {
    m.t++;
    m.starting = m.starting.map(x => x - 1); const up = m.starting.filter(x => x <= 0).length; m.ready += up; m.starting = m.starting.filter(x => x > 0);
    const cur = m.ready + m.starting.length, needed = Math.ceil(m.load / (c.req * c.target / 100));
    let util = null, ratio = null, desired = cur, note = '';
    if (!m.req) note = 'FailedGetResourceMetric: containers have no CPU request, so utilization is undefined. The HPA cannot decide.';
    else {
      util = m.load / (m.ready * c.req) * 100; ratio = util / c.target;
      if (Math.abs(ratio - 1) <= c.tolerance) { desired = cur; note = `Utilization ${util.toFixed(0)}% is within 10% of the ${c.target}% target: no change.`; }
      else { desired = Math.ceil(m.ready * ratio); note = `desired = ceil(${m.ready} ready × ${util.toFixed(0)}% ÷ ${c.target}%) = ${desired}.`; }
      desired = Math.max(c.min, Math.min(c.max, desired));
      m.recs.push(desired); if (m.recs.length > c.window) m.recs.shift();
      if (desired > cur) { const lim = cur + Math.max(4, cur); if (desired > lim) { desired = lim; note += ` Scale-up is limited to doubling or +4 per tick, so ${lim}.`; } }
      else if (desired < cur) { const held = Math.max(...m.recs); if (held > desired) { note += ` The stabilization window remembers a recommendation of ${held} within the last ${c.window * 15} s, so it waits.`; desired = Math.min(cur, held); } }
    }
    let applied = cur;
    if (desired > cur) { for (let i = 0; i < desired - cur; i++) m.starting.push(c.warm); applied = desired; }
    else if (desired < cur) { let r = cur - desired; while (r > 0 && m.starting.length) { m.starting.pop(); r--; } m.ready -= r; applied = desired; }
    m.hist.push({ t: m.t, ready: m.ready, starting: m.starting.length, needed, load: m.load });
    return { util, desired: applied, cur, up, note };
  }

  function runAll(c, ops) {
    const m = fresh(c), frames = [], opStart = [];
    const push = (title, text, tone, extra) => frames.push(Object.assign({ snap: snap(m), title, text, tone: tone || '', info: null }, extra));
    push(`${c.start} pods, load matches the target`, `The HPA keeps average CPU use near ${c.target}% of the pods' requests (${c.req}m each), between ${c.min} and ${c.max} pods. Every 15 s it reads the metrics and decides. Change the load, then step the clock.`);
    ops.forEach(op => {
      opStart.push(frames.length);
      if (op.op === 'load') { m.load = op.to; push(`Load becomes ${op.to}m CPU`, `Total CPU use jumps to ${op.to}m. With ${c.req}m requested per pod and a ${c.target}% target, one pod serves ${c.req * c.target / 100}m, so ${Math.ceil(op.to / (c.req * c.target / 100))} pods are needed.`, ''); }
      else if (op.op === 'noRequest') { m.req = false; push('The containers have no CPU request', 'Utilization is a percentage of the request. With no request there is nothing to divide by.', 'bad'); }
      else if (op.op === 'tick') { let r; for (let i = 0; i < op.n; i++) r = tick(m, c); push(op.n > 1 ? `${op.n} ticks later (${op.n * 15} s)` : `Tick ${m.t}: ${r.cur} → ${r.desired} pods`, `${r.util != null ? `Average CPU use of ready pods: ${r.util.toFixed(0)}% of requests (target ${c.target}%). ` : ''}${r.note}${r.up ? ` ${r.up} pod${r.up > 1 ? 's' : ''} finished warming up.` : ''} Now ${m.ready} ready, ${m.starting.length} starting.`, r.desired > r.cur ? 'ok' : r.desired < r.cur ? 'ok' : '', { info: r }); }
      else throw new Error('unknown op ' + op.op);
    });
    return { frames, opStart, model: m };
  }

  function draw(fr, _p, _r, c) {
    const h = fr.snap.hist, W = 480, H = 170, L = 30, B = 24, T = 10, max = Math.max(c.max, ...h.map(x => x.needed)), n = Math.max(h.length, 12), bw = (W - L - 8) / n;
    const Y = v => H - B - v / max * (H - B - T);
    let bars = '', ticks = '';
    h.forEach((x, i) => { const x0 = L + i * bw + 2; bars += `<rect class="hp-r" x="${x0}" y="${Y(x.ready)}" width="${bw - 4}" height="${H - B - Y(x.ready)}"/><rect class="hp-s" x="${x0}" y="${Y(x.ready + x.starting)}" width="${bw - 4}" height="${Y(x.ready) - Y(x.ready + x.starting)}"/><line class="hp-n" x1="${x0 - 1}" x2="${x0 + bw - 3}" y1="${Y(x.needed)}" y2="${Y(x.needed)}"/>`; if (i % 4 === 3 || i === 0) bars += `<text class="hp-t" x="${x0 + bw / 2}" y="${H - 8}">${x.t * 15}s</text>`; });
    [0, Math.round(max / 2), max].forEach(v => { ticks += `<line class="hp-g" x1="${L}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text class="hp-a" x="${L - 4}" y="${Y(v) + 4}">${v}</text>`; });
    const info = fr.info, cur = fr.snap;
    return `<svg class="hp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pods over time">${ticks}<line class="hp-min" x1="${L}" x2="${W}" y1="${Y(c.min)}" y2="${Y(c.min)}"/>${bars}</svg>
      <div class="hp-leg"><span class="r">ready pods</span><span class="s">starting (warming up)</span><span class="n">pods needed for the load</span></div>
      <div class="hp-facts"><span>load <b>${cur.load}m</b></span><span>ready <b>${cur.ready}</b></span><span>starting <b>${cur.starting}</b></span><span>needed <b>${Math.ceil(cur.load / (c.req * c.target / 100))}</b></span>${info && info.util != null ? `<span>use <b>${info.util.toFixed(0)}%</b> of requests</span>` : ''}</div>`;
  }

  function mount(host, scene) {
    root.Course.opsPlayer(host, { scene, cls: 'hp', run: ops => runAll(scene, ops), draw: (fr, p, r) => draw(fr, p, r, scene), stat: fr => `time ${fr.snap.t * 15} s · ${fr.snap.ready} ready + ${fr.snap.starting} starting · limits ${scene.min} to ${scene.max}`,
      controls: `<div class="bt-try"><label>Load (millicores) <input type="number" min="0" step="100" value="${scene.start * scene.req * scene.target / 100 * 4}" data-l style="width:90px"></label><button type="button" data-do="load">Set the load</button><button type="button" data-do="t1">Tick (15 s)</button><button type="button" data-do="t4">4 ticks (1 min)</button><button type="button" data-do="norq">Remove CPU requests</button></div>`,
      control: (b, h) => { const d = b.dataset.do; return d === 'load' ? { op: 'load', to: Math.max(0, +h.querySelector('[data-l]').value || 0) } : d === 't1' ? { op: 'tick', n: 1 } : d === 't4' ? { op: 'tick', n: 4 } : d === 'norq' ? { op: 'noRequest' } : null; } });
  }

  function validate(scene) {
    const e = [], ok = Number.isInteger;
    ['start', 'min', 'max', 'req', 'target', 'warm', 'window'].forEach(k => { if (!ok(scene[k]) || scene[k] < 1) e.push('animation hpa needs ' + k + ' as a positive integer'); });
    if (typeof scene.tolerance !== 'number') e.push('animation hpa needs tolerance');
    const okOp = o => o.op === 'tick' ? ok(o.n) && o.n >= 1 : o.op === 'load' ? ok(o.to) && o.to >= 0 : o.op === 'noRequest';
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation hpa needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation hpa preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }
  root.Course.hpa = { runAll, tick, fresh };
  root.Course.registerAnimation('hpa', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
