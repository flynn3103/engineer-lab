/* Folder-tree animation for "Skip folders that a filter rules out".
   The table is a folder tree. The query sits on top. Folders that cannot match are ruled out and their files never enter the plan.
   Each step is a full picture of the scene, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim="tree"]').forEach(host => {
      if (host.dataset.ready) return;
      const SD = root.SparkSystemDesign;
      const uc = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
      if (!uc || !uc.sim || !uc.sim.steps) return;
      host.dataset.ready = '1';
      const { query, match, folders, steps } = uc.sim;
      const total = folders.reduce((a, f) => a + f.files.length, 0);
      let k = 0;

      host.innerHTML = `<div class="rs tr">
        <div class="tr-query" data-query></div>
        <div class="tr-panel"><div class="tr-root">orders/</div><div data-folders></div></div>
        <div class="tr-tasks" data-tasks></div>
        <div class="pk-check" data-stat aria-live="polite"></div>
        <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
        <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      </div>`;
      const $ = s => host.querySelector(s);

      function draw() {
        const st = steps[k];
        const ruled = st.ruled || [], open = st.open || [];

        $('[data-query]').innerHTML = st.query
          ? `<span class="tr-q">${esc(query)}</span>`
          : '<span class="tr-q off">no query yet</span>';

        $('[data-folders]').innerHTML = folders.map((f, i) => {
          const isRuled = ruled.includes(i), isOpen = open.includes(i), isMatch = st.query && f.name === match;
          return `<div class="tr-folder${isRuled ? ' ruled' : ''}${isMatch ? ' match' : ''}">
            <div class="tr-row"><span class="tr-arrow">${isOpen ? '▾' : '▸'}</span><span class="tr-name">${esc(f.name)}</span><span class="tr-meta">${f.files.length} files</span>${st.checked ? '<span class="tr-tick">name read</span>' : ''}${isRuled ? '<span class="tr-stamp">RULED OUT</span>' : ''}</div>
            ${isOpen ? `<div class="tr-files">${f.files.map(x => `<span class="tr-file">${esc(x)}</span>`).join('')}</div>` : ''}
          </div>`;
        }).join('');

        const files = open.flatMap(i => folders[i].files.map(x => `${folders[i].name}/${x}`));
        $('[data-tasks]').innerHTML = st.tasks
          ? `<span class="tr-label">tasks</span>${files.map((f, i) => `<span class="tr-task">task ${i + 1}<small>${esc(f)}</small></span>`).join('')}`
          : '';

        const toRead = open.reduce((a, i) => a + folders[i].files.length, 0);
        $('[data-stat]').textContent = `files to read: ${toRead} of ${total} · folders ruled out: ${ruled.length} of ${folders.length}${st.tasks ? ' · tasks: ' + files.length : ''}`;

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

  root.SparkTree = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkTree;
})(typeof globalThis !== 'undefined' ? globalThis : this);
