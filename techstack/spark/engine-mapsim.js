/* Map animation for "Read only the row groups a query needs".
   One row per row group. The cells on the left are its column chunks. The track on the right is the amount range,
   from the footer's smallest to biggest value, with the filter line at 500. Dots are sample rows inside the range.
   Each step is a full picture of the scene, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CELL = { idle: 'unknown', read: 'read', unread: 'not read', skip: 'skipped' };

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim="map"]').forEach(host => {
      if (host.dataset.ready) return;
      const SD = root.SparkSystemDesign;
      const uc = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
      if (!uc || !uc.sim || !uc.sim.steps) return;
      host.dataset.ready = '1';
      const { cols, line, scale, groups, steps } = uc.sim;
      const pct = v => (v / scale * 100) + '%';
      let k = 0;

      host.innerHTML = `<div class="rs mp">
        <div class="mp-panel"><div class="mp-map">
          <div class="mp-head"><span>row group</span>${cols.map((c, i) => `<span data-col="${i}">${esc(c)}</span>`).join('')}<span>amount, smallest to biggest</span></div>
          <div data-rows></div>
          <div class="mp-row mp-foot"><span class="mp-gname">footer</span><span class="mp-cell" style="grid-column:2 / 6" data-foot></span><span></span></div>
          <div class="mp-row mp-axis"><span></span><span style="grid-column:2 / 6"></span><span class="mp-ax"><span>0</span><span>${(scale / 2).toLocaleString('en-US')}</span><span>${scale.toLocaleString('en-US')}</span></span></div>
        </div></div>
        <div class="pk-legend">
          <span><i class="sw read"></i>read</span><span><i class="sw unread"></i>not read</span><span><i class="sw skip"></i>skipped</span><span><i class="sw pass"></i>passes</span><span><i class="sw fail"></i>fails</span><span><i class="sw line"></i>amount &gt; ${line}</span>
        </div>
        <div class="mp-out"><span class="mp-label">result so far</span><div data-out></div></div>
        <div class="pk-check" data-stat aria-live="polite"></div>
        <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
        <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      </div>`;
      const $ = s => host.querySelector(s);

      function draw() {
        const st = steps[k];
        const rows = st.groups.map((g, gi) => {
          const G = groups[gi];
          const cells = cols.map((c, ci) => `<span class="mp-cell ${g.cols[ci]}">${CELL[g.cols[ci]]}</span>`).join('');
          const range = g.state === 'hidden' ? '' :
            `<span class="mp-range ${g.state}" style="left:${pct(G.min)};width:${Math.max(0.6, (G.max - G.min) / scale * 100)}%"></span>`;
          const dots = g.state === 'read' ? G.dots.map(d => {
            const cls = g.test ? (d.v > line ? ' pass' : ' fail') : '';
            return `<span class="mp-dot${cls}" style="left:${pct(d.v)}" title="${d.v}${d.c ? ' · ' + esc(d.c) : ''}"></span>`;
          }).join('') : '';
          const stamp = g.state === 'skipped' ? '<span class="mp-stamp">SKIPPED</span>' : '';
          return `<div class="mp-row ${g.state}"><span class="mp-gname">${esc(G.name)}</span>${cells}<span class="mp-track"><span class="mp-line" style="left:${pct(line)}"></span>${range}${dots}${stamp}</span></div>`;
        }).join('');
        $('[data-rows]').innerHTML = rows;

        const foot = $('[data-foot]');
        foot.textContent = st.footer === 'read' ? 'read: schema, and the smallest and biggest amount in each group' : 'not read yet';
        foot.className = 'mp-cell ' + (st.footer === 'read' ? 'footread' : 'idle');

        host.querySelectorAll('.mp-never').forEach(el => el.classList.remove('mp-never'));
        if (st.never) host.querySelector(`[data-col="${cols.length - 1}"]`).classList.add('mp-never');

        const out = [];
        st.groups.forEach((g, gi) => {
          if (g.state !== 'read' || !g.test) return;
          const pass = groups[gi].dots.filter(d => d.v > line);
          if (pass.length <= 4) pass.forEach(d => out.push(`<span class="st-chip good">${esc(d.c || '')}</span>`));
          else out.push(`<span class="st-chip good">+${pass.length} rows from ${esc(groups[gi].name)}</span>`);
        });
        $('[data-out]').innerHTML = out.join('') || '<small>nothing yet</small>';

        const readN = st.groups.reduce((a, g) => a + g.cols.filter(c => c === 'read').length, 0);
        const groupsRead = st.groups.filter(g => g.state === 'read').length;
        $('[data-stat]').textContent = `column chunks read: ${readN} of ${cols.length * groups.length} · row groups read: ${groupsRead} of ${groups.length}`;

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

  root.SparkMap = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkMap;
})(typeof globalThis !== 'undefined' ? globalThis : this);
