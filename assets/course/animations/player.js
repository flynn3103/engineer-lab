/* Shared player for operation-driven animations (Course.opsPlayer). An animation supplies a pure model, run(ops) -> { frames, opStart },
 * a draw(frame, previousFrame) function that returns the stage HTML, and an optional control(button) hook that turns a button press into an op.
 * The player adds the scenario buttons, the Back / Next / Restart controls and the narration box, and replays the ops from the start,
 * so Back and Restart need no extra logic. Used by the Kubernetes animations. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.Course.opsPlayer = (host, o) => {
    const scene = o.scene, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs ${o.cls}">
      <div class="rs-ctl"><div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>${o.controls ? `<details class="rf-try"${o.open ? ' open' : ''}><summary>Try it yourself</summary>${o.controls}</details>` : ''}</div>
      <div class="op-stage ${o.cls}-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = o.run(S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, prev = S.k ? run.frames[S.k - 1] : null;
      $('[data-stage]').innerHTML = o.draw(fr, prev, run);
      $('[data-stat]').textContent = o.stat ? o.stat(fr) : fr.title;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      if (b.dataset.act) {
        const last = run.frames.length - 1;
        if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
        show(); return;
      }
      const op = o.control && o.control(b, host);
      if (op) { S.preset = -1; S.ops.push(op); run = o.run(S.ops); S.k = run.opStart[S.ops.length - 1]; show(); }
    });
    recompute();
  };
  root.Course.esc = esc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
