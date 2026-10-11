/* Step-by-step story player for use cases. Each use case supplies actors and steps (see engine-stories.js).
   Click Next to move on. Chips under an actor persist until a later step replaces them. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chip = c => { const k = c[0], t = '+!~'.includes(k) ? c.slice(1) : c; return `<span class="st-chip${k === '+' ? ' good' : k === '!' ? ' bad' : k === '~' ? ' dim' : ''}">${esc(t)}</span>`; };

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim="story"]').forEach(host => {
      if (host.dataset.ready) return;
      const SD = root.SparkSystemDesign, uc = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
      if (!uc || !uc.sim || !uc.sim.steps) return;
      host.dataset.ready = '1';
      const { actors, steps } = uc.sim;
      let k = 0;
      host.innerHTML = `<div class="rs st">
        <div class="st-stage" data-stage></div>
        <div class="st-msg" data-msg aria-hidden="true"></div>
        <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
        <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      </div>`;
      const $ = s => host.querySelector(s);
      function draw() {
        const chips = {}, badge = {};
        actors.forEach(a => { chips[a] = []; badge[a] = ''; });
        for (let i = 0; i <= k; i++) { const s = steps[i]; Object.keys(s.set).forEach(a => { chips[a] = s.set[a]; }); Object.keys(s.badge).forEach(a => { badge[a] = s.badge[a]; }); }
        const cur = steps[k], from = cur.m && cur.m[0], to = cur.m && cur.m[1];
        $('[data-stage]').innerHTML = actors.map(a => `<div class="st-actor${a === from ? ' from' : ''}${a === to ? ' to' : ''}"><div class="st-name">${esc(a)}</div>${badge[a] ? `<div class="st-badge">${esc(badge[a])}</div>` : ''}<div class="st-chips">${chips[a].length ? chips[a].map(chip).join('') : '<small>nothing yet</small>'}</div></div>`).join('');
        $('[data-msg]').innerHTML = cur.m ? `<span class="st-from">${esc(cur.m[0])}</span><span class="st-arrow">${cur.m[0] === cur.m[1] ? '↻' : '→'}</span><span class="st-to">${esc(cur.m[1])}</span><span class="st-label">“${esc(cur.m[2])}”</span>` : '<small>no message in this step</small>';
        $('[data-n]').textContent = k + 1;
        $('[data-title]').textContent = cur.title;
        $('[data-text]').textContent = cur.text;
        $('[data-count]').textContent = `step ${k + 1} of ${steps.length}`;
        $('[data-act=first]').disabled = $('[data-act=prev]').disabled = k === 0;
        $('[data-act=next]').disabled = k === steps.length - 1;
      }
      host.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'first') k = 0; else if (b.dataset.act === 'prev') k = Math.max(0, k - 1); else if (b.dataset.act === 'next') k = Math.min(steps.length - 1, k + 1);
        draw();
      });
      draw();
    });
  }
  root.SparkStory = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
