/* Side-by-side animation for "Handle a row that does not match the schema".
   The raw file sits on top with a pointer on the row being read. One lane per mode underneath shows what that mode would write.
   Each lane is worked out from the rows up to the pointer, so Back and Restart just redraw an earlier step. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = [
    { key: 'PERMISSIVE', rule: 'keep the row, set the bad value to null, save the raw line' },
    { key: 'DROPMALFORMED', rule: 'drop the bad row, with no warning' },
    { key: 'FAILFAST', rule: 'stop at the first bad row' }
  ];

  /* What one mode has done after reading the first `upto` rows. */
  function run(mode, rows, upto) {
    const out = [];
    let stopAt = -1;
    for (let i = 0; i < upto; i++) {
      const r = rows[i];
      if (!r.bad) { out.push({ kind: 'ok', r }); continue; }
      if (mode === 'PERMISSIVE') out.push({ kind: 'marked', r, i });
      else if (mode === 'DROPMALFORMED') out.push({ kind: 'dropped', r, i });
      else { stopAt = i; break; }
    }
    return { out, stopAt, failed: stopAt >= 0 };
  }

  function mount(rootEl) {
    rootEl.querySelectorAll('[data-sim="compare"]').forEach(host => {
      if (host.dataset.ready) return;
      const SD = root.SparkSystemDesign;
      const uc = SD && SD.data[host.dataset.f] && SD.data[host.dataset.f].uc[+host.dataset.n - 1];
      if (!uc || !uc.sim || !uc.sim.steps) return;
      host.dataset.ready = '1';
      const { header, rows, steps } = uc.sim;
      let k = 0;

      host.innerHTML = `<div class="rs cp">
        <div class="cp-raw"><div class="cp-raw-in" data-raw></div></div>
        <div class="cp-lanes" data-lanes></div>
        <div class="pk-check" data-stat aria-live="polite"></div>
        <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
        <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      </div>`;
      const $ = s => host.querySelector(s);

      function draw() {
        const st = steps[k], upto = st.upto, now = upto - 1;

        $('[data-raw]').innerHTML = `<div class="cp-r head"><span></span>${header.map(h => `<span>${esc(h)}</span>`).join('')}<span>checker</span></div>` +
          rows.map((r, i) => {
            const done = i < upto;
            const cls = ['cp-r', done ? 'done' : '', i === now ? 'now' : ''].join(' ');
            const fld = (v, field) => v == null ? '<span class="cp-null">missing</span>' : `<span class="${r.bad === field ? 'cp-cell bad' : ''}">${esc(v)}</span>`;
            const check = !done ? '' : r.bad ? `<span class="cp-check bad">✗ ${esc(r.issue)}</span>` : '<span class="cp-check ok">✓ fits</span>';
            return `<div class="${cls}"><span class="cp-ptr">${i === now ? '▶' : ''}</span><span>${esc(r.name)}</span>${fld(r.age, 'age')}${fld(r.city, 'city')}${check}</div>`;
          }).join('');

        $('[data-lanes]').innerHTML = MODES.map(m => {
          const res = run(m.key, rows, upto);
          const lines = res.out.map(o => {
            const r = o.r, raw = [r.name, r.age, r.city].filter(v => v != null).join(',');
            if (res.failed) return `<div class="cp-line buffer">${esc(r.name)} · ${esc(r.age)} · ${esc(r.city ?? '')}</div>`;
            if (o.kind === 'ok') return `<div class="cp-line">${esc(r.name)} · ${esc(r.age)} · ${esc(r.city)}</div>`;
            if (o.kind === 'marked') {
              const age = r.bad === 'age' ? 'null' : esc(r.age), city = r.city == null ? 'null' : esc(r.city);
              return `<div class="cp-line marked">${esc(r.name)} · ${age} · ${city}<small>_corrupt_record: "${esc(raw)}"</small></div>`;
            }
            return `<div class="cp-line dropped">${esc(r.name)} · dropped</div>`;
          });
          if (res.failed) {
            lines.push(`<div class="cp-line fail">row ${res.stopAt + 1}: ${esc(rows[res.stopAt].issue)}</div>`);
            if (res.stopAt + 1 < rows.length) lines.push(`<div class="cp-line skip">rows ${res.stopAt + 2} to ${rows.length} not reached</div>`);
          }
          const kept = res.out.filter(o => o.kind !== 'dropped').length;
          const marked = res.out.filter(o => o.kind === 'marked').length;
          let status, cls = '';
          if (m.key === 'FAILFAST' && res.failed) {
            status = `FAILED at row ${res.stopAt + 1}` + (st.summary ? ' · nothing written' : '');
            cls = 'bad';
          } else if (!st.summary) {
            status = `running · ${upto} of ${rows.length} rows read`;
          } else if (m.key === 'PERMISSIVE') {
            status = `SUCCESS · ${kept} rows · ${marked} marked`;
            cls = 'ok';
          } else {
            status = `SUCCESS · ${kept} rows · no warning`;
            cls = 'ok';
          }
          return `<section class="cp-lane ${m.key}"><header><b>${m.key}</b><small>${esc(m.rule)}</small></header><div class="cp-body">${lines.join('') || '<div class="cp-line skip">no rows yet</div>'}</div><footer class="cp-status ${cls}">${esc(status)}</footer></section>`;
        }).join('');

        $('[data-stat]').textContent = `rows read: ${upto} of ${rows.length}`;
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

  root.SparkCompare = { mount };
  if (typeof module === 'object' && module.exports) module.exports = root.SparkCompare;
})(typeof globalThis !== 'undefined' ? globalThis : this);
