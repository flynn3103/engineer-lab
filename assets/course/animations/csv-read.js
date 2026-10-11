/* Computed CSV split animation; byte fixture, worker names and cut presets belong to the course. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function parseLines(text) {
    const lines = [];
    for (let i = 0, start = 0; i < text.length; i++) if (text[i] === '\n') {
      lines.push({ a: start, b: i, text: text.slice(start, i) }); start = i + 1;
    }
    return lines;
  }
  function build(cuts, careful, TEXT, NAMES) {
    const LEN = TEXT.length, lines = parseLines(TEXT);
    const bounds = [0, ...cuts, LEN], steps = [];
    steps.push({ title: 'The file', text: `This CSV file is ${LEN} bytes long and has ${lines.length} lines. The first line is the header and counts as a line too. The file is cut into ${bounds.length - 1} pieces of bytes. Each worker gets one piece and must work alone.`, marks: [] });
    bounds.slice(0, -1).forEach((s, w) => {
      const e = bounds[w + 1], who = 'Worker ' + NAMES[w];
      steps.push({ w, title: `${who} gets bytes ${s} to ${e - 1}`, text: `${who} knows only its own piece. It cannot ask the others where their lines end.`, marks: [] });
      let start = s;
      if (s > 0) {
        const from = careful ? s - 1 : s, q = TEXT.indexOf('\n', from);
        const startsHere = TEXT[s - 1] === '\n';
        let text;
        if (careful) text = startsHere
          ? `${who} looks one byte BEFORE its piece, at byte ${from}. That byte is already a line break, so only that one byte is thrown away. The line that begins at byte ${s} is kept.`
          : `${who} looks one byte before its piece and throws away bytes ${from} to ${q}, up to the first line break. That is the end of a line that began in the piece before, so Worker ${NAMES[w - 1]} will read it.`;
        else text = startsHere
          ? `${who} does NOT step back. It throws away everything up to the first line break at or after byte ${s}, which is bytes ${s} to ${q}. But a whole line began exactly at byte ${s}. It is thrown away too.`
          : `${who} throws away bytes ${s} to ${q}, up to the first line break. That is the end of a line that began in the piece before.`;
        steps.push({ w, title: `${who} skips the leftover`, text, marks: [{ a: from, b: q, type: 'skip', w }] });
        start = q + 1;
      } else steps.push({ w, title: `${who} starts at the top`, text: `The piece begins at byte 0, the start of the file. Nothing comes before it, so nothing is skipped.`, marks: [] });
      let pos = start;
      while (pos < e && pos < LEN) {
        const ln = lines.find(l => l.a === pos), past = ln.b >= e;
        steps.push({ w, title: `${who} reads a line`, text: `A line begins at byte ${ln.a}, which is before the end of the piece (byte ${e}). ${who} reads the whole line${past ? `, even though it runs ${ln.b - e + 1} byte${ln.b - e ? 's' : ''} into the next piece` : ''}.`, marks: [{ a: ln.a, b: ln.b, type: 'read', w, end: e }], read: { w, line: lines.indexOf(ln) } });
        pos = ln.b + 1;
      }
      steps.push({ w, title: `${who} stops`, text: pos >= LEN ? `${who} has reached the end of the file, so it stops.` : `The next line begins at byte ${pos}, which is not before the end of the piece (byte ${e}). ${who} stops. That line belongs to the next worker.`, marks: [] });
    });
    const owners = lines.map(() => []);
    steps.forEach(st => st.read && owners[st.read.line].push(st.read.w));
    const lost = owners.map((o, i) => o.length === 0 ? i : -1).filter(i => i >= 0), twice = owners.map((o, i) => o.length > 1 ? i : -1).filter(i => i >= 0);
    const ok = !lost.length && !twice.length;
    const name = i => `line ${i + 1} (${lines[i].text})`;
    steps.push({ final: true, title: ok ? 'Every line was read exactly once' : 'The answer is wrong', text: ok ? `Check each line: every one has exactly one worker. Nothing is missing and nothing is counted twice, and no worker had to ask another worker anything.` : `${lost.length ? 'Lost: ' + lost.map(name).join(', ') + '. Nobody read it. ' : ''}${twice.length ? 'Read twice: ' + twice.map(name).join(', ') + '. ' : ''}The job would finish without any error, and the result would be silently wrong.`, marks: [], ok, lost, twice, owners });
    return { bounds, steps };
  }

  function mount(host, scene) {
    const { text: TEXT, names: NAMES, presets: PRESETS } = scene;
    const LEN = TEXT.length, lines = parseLines(TEXT);
    const S = { cut: scene.cut, pieces: scene.pieces, careful: true, k: 0 };
    let model;
    const cutsOf = () => S.pieces === 2 ? [S.cut] : [S.cut, Math.min(LEN - 1, S.cut + Math.round((LEN - S.cut) / 2))];
    host.innerHTML = `<div class="rs">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Where to cut the file">${PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <label class="rs-slide">Move the cut: byte <b data-cutn></b><input type="range" min="2" max="${LEN - 3}" step="1" data-cut aria-label="Position of the cut in bytes"></label>
        <div class="rs-opts">
          <label><input type="checkbox" data-three> Use 3 pieces</label>
          <label><input type="checkbox" data-break> Break the rule (do not step back one byte)</label>
        </div>
      </div>
      <div class="rs-file" data-file></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play">
        <button type="button" data-act="first">Restart</button>
        <button type="button" data-act="prev">← Back</button>
        <button type="button" data-act="next" class="rs-go">Next step →</button>
        <span data-count class="rs-count"></span>
      </div>
      <div class="rs-key"><span class="w0">Worker A</span><span class="w1">Worker B</span><span class="w2" data-keyc>Worker C</span><span class="sk">thrown away</span><span class="past">read from the next piece</span></div>
      <div class="rs-out" data-out></div>
    </div>`;
    const $ = s => host.querySelector(s);

    function reset() { model = build(cutsOf(), S.careful, TEXT, NAMES); S.k = 0; draw(); }

    function draw() {
      const { bounds, steps } = model, st = steps[S.k], fin = steps[steps.length - 1];
      const mark = new Array(LEN).fill(null);
      steps.slice(0, S.k + 1).forEach(s => s.marks.forEach(m => { for (let i = m.a; i <= m.b; i++) mark[i] = { ...m, now: s === st }; }));
      const pieceOf = i => bounds.findIndex((b, w) => i >= b && i < bounds[w + 1]);
      $('[data-file]').innerHTML = lines.map((l, li) => {
        let cells = '';
        for (let i = l.a; i <= l.b; i++) {
          const m = mark[i], c = TEXT[i] === '\n' ? '↵' : TEXT[i] === ' ' ? '·' : esc(TEXT[i]);
          const cls = ['rs-c', 'pc' + pieceOf(i)];
          if (bounds.includes(i) && i > 0) cls.push('cut');
          if (m) { cls.push(m.type === 'skip' ? 'sk' : 'rd w' + m.w); if (m.type === 'read' && i >= m.end) cls.push('past'); if (m.now) cls.push('now'); }
          cells += `<span class="${cls.join(' ')}"${bounds.includes(i) && i > 0 ? ` data-cut="✂ ${i}"` : ''} title="byte ${i}">${c}</span>`;
        }
        const bad = S.k === steps.length - 1 && (fin.lost.includes(li) || fin.twice.includes(li));
        return `<div class="rs-row${bad ? ' bad' : ''}"><i>byte ${l.a}</i><span class="rs-cells">${cells}</span>${bad ? `<em>${fin.lost.includes(li) ? 'LOST' : 'TWICE'}</em>` : ''}</div>`;
      }).join('');
      $('[data-n]').textContent = S.k + 1;
      $('[data-title]').textContent = st.title;
      $('[data-text]').textContent = st.text;
      $('[data-text]').className = st.final ? (st.ok ? 'good' : 'badtxt') : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${steps.length}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0;
      $('[data-act=next]').disabled = S.k === steps.length - 1;
      $('[data-keyc]').hidden = S.pieces !== 3;
      const nW = bounds.length - 1, rows = Array.from({ length: nW }, () => []);
      steps.slice(0, S.k + 1).forEach(s => s.read && rows[s.read.w].push(lines[s.read.line].text));
      $('[data-out]').innerHTML = rows.map((r, w) => `<div class="rs-box w${w}"><b>Worker ${NAMES[w]} produced ${r.length} row${r.length === 1 ? '' : 's'}</b>${r.length ? r.map(t => `<div class="rs-rowout">${t.split(',').map(f => `<span>${esc(f)}</span>`).join('')}</div>`).join('') : '<small>nothing yet</small>'}</div>`).join('');
      $('[data-cutn]').textContent = S.cut;
      $('[data-cut]').value = S.cut;
      $('[data-three]').checked = S.pieces === 3;
      $('[data-break]').checked = !S.careful;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(PRESETS[+b.dataset.preset].cut === S.cut)));
    }

    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.preset) { S.cut = PRESETS[+b.dataset.preset].cut; reset(); return; }
      const last = model.steps.length - 1;
      switch (b.dataset.act) {
        case 'first': S.k = 0; break;
        case 'prev': S.k = Math.max(0, S.k - 1); break;
        case 'next': S.k = Math.min(last, S.k + 1); break;
      }
      draw();
    });
    host.addEventListener('input', ev => {
      const t = ev.target;
      if (t.matches('[data-cut]')) { S.cut = +t.value; reset(); }
    });
    host.addEventListener('change', ev => {
      const t = ev.target;
      if (t.matches('[data-three]')) { S.pieces = t.checked ? 3 : 2; reset(); }
      else if (t.matches('[data-break]')) { S.careful = !t.checked; reset(); }
    });
    reset();
  }
  root.Course.registerAnimation('csv-read', { mount, validate(scene) {
    if (typeof scene.text !== 'string' || !scene.text.endsWith('\n') || /[^\x00-\x7f]/.test(scene.text)) return ['animation csv-read needs newline-terminated ASCII text'];
    if (!Array.isArray(scene.names) || scene.names.length < 3) return ['animation csv-read needs three worker names'];
    if (!Array.isArray(scene.presets) || !scene.presets.length || scene.presets.some(p => !Number.isInteger(p.cut) || p.cut < 2 || p.cut > scene.text.length - 3)) return ['animation csv-read needs valid cut presets'];
    if (!Number.isInteger(scene.cut) || scene.cut < 2 || scene.cut > scene.text.length - 3 || ![2, 3].includes(scene.pieces)) return ['animation csv-read needs a valid initial cut and piece count'];
    return [];
  } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
