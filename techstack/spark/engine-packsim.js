/* Packing animation for "Plan splits for a mixed directory".
   Left: the input files as bars drawn to one scale, so the big file looks big.
   Right: one column per task. A column fills up to the 128 MB target line, and the hatched part is the 4 MB open cost.
   Each step is a full picture of the scene, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL_H = 220; // pixels for the tallest column we draw (target plus a little room for open costs)

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim="pack"]').forEach(host => {
      if (host.dataset.ready) return;
      const SD = root.SparkSystemDesign;
      const uc = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
      if (!uc || !uc.sim || !uc.sim.steps) return;
      host.dataset.ready = '1';
      const { target, open, max, steps } = uc.sim;
      const taskCount = Math.max(...steps.map(s => s.tasks.length));
      const ppm = COL_H / (target + 12); // pixels per MB
      let k = 0;

      host.innerHTML = `<div class="rs pk">
        <div class="pk-grid">
          <section class="pk-panel"><h3>Input files, drawn to scale</h3><div class="pk-lane" data-lane></div></section>
          <section class="pk-panel"><h3>Tasks: each one reads a group of pieces</h3><div class="pk-tasks" data-tasks></div></section>
        </div>
        <div class="pk-legend">
          <span><i class="sw file"></i>whole file</span><span><i class="sw big"></i>bigger than one task</span><span><i class="sw piece"></i>piece of a cut file</span><span><i class="sw lock"></i>cannot be cut</span><span><i class="sw open"></i>${open} MB open cost</span><span><i class="sw line"></i>${target} MB target</span>
        </div>
        <div class="pk-check" data-check aria-live="polite"></div>
        <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
        <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      </div>`;
      const $ = s => host.querySelector(s);

      function draw() {
        const st = steps[k];

        $('[data-lane]').innerHTML = st.lane.map(f => `<div class="pk-row${f.done ? ' done' : ''}">
            <span class="pk-name">${esc(f.name)}</span>
            <span class="pk-track"><span class="pk-bar ${f.tone}" style="width:${Math.max(0.8, f.size / max * 100)}%"></span><span class="pk-tgt" style="left:${target / max * 100}%"></span></span>
            <span class="pk-val">${f.size} MB${f.done ? ' ✓' : ''}</span>
          </div>`).join('');

        const cols = [];
        for (let t = 0; t < taskCount; t++) {
          const items = st.tasks[t] || [];
          let bottom = 0, counted = 0, segs = '';
          items.forEach(f => {
            const h = f.size * ppm, ho = open * ppm;
            segs += `<span class="pk-seg ${f.tone}" style="bottom:${bottom}px;height:${h}px" title="${esc(f.name)}, ${f.size} MB">${h > 22 ? esc(f.name) : ''}</span>`;
            bottom += h;
            segs += `<span class="pk-open" style="bottom:${bottom}px;height:${ho}px" title="${open} MB open cost"></span>`;
            bottom += ho;
            counted += f.size + open;
          });
          cols.push(`<div class="pk-col${items.length ? '' : ' empty'}">
            <div class="pk-total">${items.length ? counted + ' MB counted' : ''}</div>
            <div class="pk-box" style="height:${COL_H}px">
              <span class="pk-cap" style="bottom:${target * ppm}px"></span>${segs}
            </div>
            <div class="pk-task">Task ${t + 1}</div>
            <ul class="pk-list">${items.map(f => `<li>${esc(f.name)} · ${f.size} MB</li>`).join('') || '<li class="none">empty</li>'}</ul>
          </div>`);
        }
        $('[data-tasks]').innerHTML = cols.join('');

        $('[data-check]').textContent = st.check || '';
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
        draw();
      });
      draw();
    });
  }

  root.SparkPack = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkPack;
})(typeof globalThis !== 'undefined' ? globalThis : this);
