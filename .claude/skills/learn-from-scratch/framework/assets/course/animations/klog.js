/* Computed partitioned-log animation: a keyed record goes to partition murmur2(key) mod N and gets the next offset there.
 * Growing the partition count changes where a key goes, so per-key order across the change is lost. The model is pure
 * (Course.klog) so Node can test it. murmur2 is Kafka's own hash for the default partitioner. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function murmur2(str) {
    const data = new TextEncoder().encode(str), len = data.length, m = 0x5bd1e995, r = 24;
    let h = (0x9747b28c ^ len) | 0;
    const n4 = len >> 2;
    for (let i = 0; i < n4; i++) {
      const j = i * 4;
      let k = (data[j] & 0xff) + ((data[j + 1] & 0xff) << 8) + ((data[j + 2] & 0xff) << 16) + ((data[j + 3] & 0xff) << 24);
      k = Math.imul(k, m); k ^= k >>> r; k = Math.imul(k, m);
      h = Math.imul(h, m); h ^= k;
    }
    const base = len & ~3;
    switch (len % 4) {
      case 3: h ^= (data[base + 2] & 0xff) << 16; // falls through
      case 2: h ^= (data[base + 1] & 0xff) << 8; // falls through
      case 1: h ^= data[base] & 0xff; h = Math.imul(h, m);
    }
    h ^= h >>> 13; h = Math.imul(h, m); h ^= h >>> 15;
    return h | 0;
  }
  const partitionOf = (key, P) => (murmur2(key) & 0x7fffffff) % P;

  const fresh = P => ({ P, parts: Array.from({ length: P }, () => []), rr: 0, seq: 0, hist: {} });
  const snap = m => ({ P: m.P, parts: m.parts.map(p => p.map(r => ({ k: r.k, off: r.off, n: r.n }))), hist: JSON.parse(JSON.stringify(m.hist)) });

  function step(m, op) {
    const f = (title, text, o) => Object.assign({ snap: snap(m), title, text, tone: '', now: null }, o);
    if (op.op === 'produce') {
      const key = op.key == null ? null : op.key; let p, how;
      if (key == null) { p = m.rr++ % m.P; how = `The record has no key, so the producer is free to choose: here it takes the next partition in turn.`; }
      else { const h = murmur2(key); p = (h & 0x7fffffff) % m.P; how = `The default partitioner hashes the key bytes with murmur2 (${h}), clears the sign bit and takes the remainder by ${m.P} partitions: partition ${p}.`; }
      const off = m.parts[p].length; m.seq++; m.parts[p].push({ k: key, off, n: m.seq });
      if (key != null) { const hs = m.hist[key] = m.hist[key] || []; if (hs[hs.length - 1] !== p) hs.push(p); }
      const moved = key != null && m.hist[key].length > 1;
      return f(`${key == null ? 'No key' : '"' + key + '"'} → partition ${p}, offset ${off}`, `${how} The broker appends it to the end of that partition's log and it gets the next offset there: ${off}. Offsets are per partition, so offset ${off} exists in every partition.${moved ? ` Key "${key}" has now been written to partitions ${m.hist[key].join(', ')}: its records are no longer in one ordered log.` : ''}`, { now: { p, off }, tone: moved ? 'bad' : 'ok' });
    }
    if (op.op === 'grow') {
      for (let i = m.P; i < op.to; i++) m.parts.push([]);
      m.P = op.to;
      return f(`Partitions grow to ${op.to}`, `Adding partitions does not move any record. But the default partitioner now takes the hash modulo ${op.to}, so a key can map to a different partition than before. New records for it may land elsewhere, and a consumer of the old and new partition can see them out of order.`, { tone: 'bad' });
    }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(P, ops) {
    const m = fresh(P), frames = [f0(m, P)], opStart = [];
    function f0(mm, p) { return { snap: snap(mm), title: `A topic with ${p} partitions`, text: `Each partition is its own ordered log. A producer picks the partition, and the broker gives the record the next offset in that partition. Press Next, or try your own key.`, tone: '', now: null }; }
    ops.forEach(op => { opStart.push(frames.length); frames.push(step(m, op)); });
    return { frames, opStart, model: m };
  }

  function draw(fr, scene) {
    const colour = k => k == null ? 7 : scene.keys.includes(k) ? scene.keys.indexOf(k) % 7 : (murmur2(k) & 0x7fffffff) % 7;
    const rows = fr.snap.parts.map((p, i) => `<div class="kl-part"><b>partition ${i}</b><div class="kl-log">${p.length ? p.map(r => `<span class="kl-rec c${colour(r.k)}${fr.now && fr.now.p === i && fr.now.off === r.off ? ' now' : ''}" title="offset ${r.off}, key ${esc(r.k == null ? 'none' : r.k)}"><i>${r.off}</i>${esc(r.k == null ? '·' : r.k.replace(/^.*-/, ''))}</span>`).join('') : '<em>empty</em>'}</div></div>`).join('');
    const keys = Object.keys(fr.snap.hist);
    return `${rows}<div class="kl-keys">${keys.map(k => `<span class="kl-k c${colour(k)}">${esc(k)}: partition ${fr.snap.hist[k].join(' → ')}</span>`).join('') || '<em>no keyed records yet</em>'}</div>`;
  }

  function mount(host, scene) {
    const S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs kl">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><label>Key <input type="text" maxlength="14" value="${esc(scene.keys[0])}" data-key aria-label="Record key"></label><button type="button" data-do="produce">Produce it</button><button type="button" data-do="nokey">Produce without a key</button><label>Partitions <select data-grow>${[scene.partitions + 1, scene.partitions * 2, scene.partitions * 4].map(v => `<option>${v}</option>`).join('')}</select></label><button type="button" data-do="grow">Grow</button></div>
      </div>
      <div class="kl-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(scene.partitions, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1, total = fr.snap.parts.reduce((a, p) => a + p.length, 0);
      $('[data-stage]').innerHTML = draw(fr, scene);
      $('[data-stat]').textContent = `partitions ${fr.snap.P} · records ${total} · the same key in more than one partition: ${Object.values(fr.snap.hist).some(h => h.length > 1) ? 'yes' : 'no'}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-text]').className = fr.tone === 'bad' ? 'badtxt' : fr.tone === 'ok' ? 'good' : '';
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0; $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const add = op => { S.preset = -1; S.ops.push(op); run = runAll(scene.partitions, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); };
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      if (b.dataset.do === 'produce') { const k = $('[data-key]').value.trim(); return add({ op: 'produce', key: k || scene.keys[0] }); }
      if (b.dataset.do === 'nokey') return add({ op: 'produce', key: null });
      if (b.dataset.do === 'grow') { const to = +$('[data-grow]').value, cur = run.frames[run.frames.length - 1].snap.P; if (to > cur) return add({ op: 'grow', to }); return; }
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const e = [];
    if (!Number.isInteger(scene.partitions) || scene.partitions < 2 || scene.partitions > 6) e.push('animation klog needs partitions from 2 to 6');
    if (!Array.isArray(scene.keys) || scene.keys.length < 2) e.push('animation klog needs at least 2 keys');
    const okOp = o => o.op === 'produce' ? o.key === null || typeof o.key === 'string' : o.op === 'grow' && Number.isInteger(o.to) && o.to > scene.partitions && o.to <= 16;
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation klog needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation klog preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }

  root.Course.klog = { murmur2, partitionOf, runAll, step, fresh };
  root.Course.registerAnimation('klog', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
