/* Computed token ring: hash a partition key to a token, find the owner clockwise, pick replicas, and see what adding a node moves.
 * The model is pure (Course.ring) so Node can test it. The toy token space is 0..359 so the ring can be drawn in degrees;
 * real Murmur3 tokens are 64-bit. The course supplies node names, token counts, replication factor and example keys. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SPACE = 360;
  const hash = s => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };
  const tokenOf = key => hash('k:' + key) % SPACE;

  /* Sorted ring entries { t, node }. Tokens are unique: a clash moves to the next free position. */
  function build(nodes, perNode) {
    const taken = new Set(), ring = [];
    nodes.forEach(n => { for (let i = 0; i < perNode; i++) { let t = hash(n + '#' + i) % SPACE; while (taken.has(t)) t = (t + 1) % SPACE; taken.add(t); ring.push({ t, node: n }); } });
    return ring.sort((a, b) => a.t - b.t);
  }
  /* A token belongs to the first ring position at or after it, wrapping past the top. */
  const ownerIndex = (ring, t) => { const i = ring.findIndex(e => e.t >= t); return i < 0 ? 0 : i; };
  const owner = (ring, t) => ring[ownerIndex(ring, t)].node;
  /* Replicas: the owner, then the next distinct nodes clockwise. */
  function replicas(ring, t, rf) {
    const out = [], start = ownerIndex(ring, t), want = Math.min(rf, new Set(ring.map(e => e.node)).size);
    for (let k = 0; out.length < want && k < ring.length; k++) { const n = ring[(start + k) % ring.length].node; if (!out.includes(n)) out.push(n); }
    return out;
  }
  /* Share of the token space each node owns, in percent. */
  function shares(ring) {
    const s = {};
    ring.forEach((e, i) => { const prev = ring[(i + ring.length - 1) % ring.length].t; const arc = ring.length === 1 ? SPACE : ((e.t - prev) % SPACE + SPACE) % SPACE; s[e.node] = (s[e.node] || 0) + arc; });
    Object.keys(s).forEach(k => { s[k] = s[k] * 100 / SPACE; });
    return s;
  }
  /* Of N sample keys, how many change primary owner between two rings, and to whom. */
  function moved(a, b, N) {
    let m = 0; const to = {};
    for (let i = 0; i < N; i++) { const t = tokenOf('sample-' + i), x = owner(a, t), y = owner(b, t); if (x !== y) { m++; to[y] = (to[y] || 0) + 1; } }
    return { moved: m, of: N, to };
  }

  const arcPath = (cx, cy, r, a0, a1) => {
    const p = a => { const rad = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
    const [x0, y0] = p(a0), [x1, y1] = p(a1), large = ((a1 - a0) % 360 + 360) % 360 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  function draw(S, scene) {
    const ring = build(S.nodes, S.tokens), sh = shares(ring), cx = 150, cy = 140, R = 104, idx = n => scene.nodes.indexOf(n);
    let arcs = '', ticks = '';
    ring.forEach((e, i) => {
      const prev = ring[(i + ring.length - 1) % ring.length].t, a0 = ring.length === 1 ? 0 : prev, a1 = ring.length === 1 ? 359.9 : e.t;
      arcs += `<path class="rg-arc rg-n${idx(e.node) % 8}${S.hl && S.hl.includes(e.node) ? ' hl' : ''}" d="${arcPath(cx, cy, R, a0 === a1 ? a0 : a0, a1 < a0 ? a1 + 360 : a1)}"/>`;
      const rad = (e.t - 90) * Math.PI / 180;
      ticks += `<circle class="rg-tick" cx="${(cx + (R + 14) * Math.cos(rad)).toFixed(1)}" cy="${(cy + (R + 14) * Math.sin(rad)).toFixed(1)}" r="2.2"/>`;
    });
    let key = '';
    if (S.key != null) {
      const t = tokenOf(S.key), rad = (t - 90) * Math.PI / 180, kx = cx + (R - 24) * Math.cos(rad), ky = cy + (R - 24) * Math.sin(rad);
      key = `<line class="rg-ray" x1="${cx}" y1="${cy}" x2="${kx.toFixed(1)}" y2="${ky.toFixed(1)}"/><circle class="rg-key" cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="7"/><text class="rg-keyt" x="${cx}" y="${cy + 4}">${t}</text>`;
    }
    const svg = `<svg class="rg-svg" viewBox="0 0 300 280" role="img" aria-label="Token ring with ${S.nodes.length} nodes and ${S.tokens} tokens each">${arcs}${ticks}${key}<text class="rg-top" x="${cx}" y="12">0</text></svg>`;
    const bars = S.nodes.map(n => `<div class="rg-bar"><span class="rg-sw rg-n${idx(n) % 8}"></span><b>${esc(n)}</b><i><u class="rg-n${idx(n) % 8}" style="width:${Math.min(100, sh[n] * 2.2).toFixed(1)}%"></u></i><em>${sh[n].toFixed(1)}%</em></div>`).join('');
    return { svg, bars, ring, sh };
  }

  function narrate(S, scene) {
    const ring = build(S.nodes, S.tokens);
    if (S.key == null) return null;
    const t = tokenOf(S.key), i = ownerIndex(ring, t), reps = replicas(ring, t, scene.rf);
    return { title: `Key "${S.key}" lives on ${reps.join(', ')}`, text: `The hash of "${S.key}" is token ${t} (toy space 0 to ${SPACE - 1}; real tokens are 64-bit). Walk clockwise to the first token at or after ${t}: ${ring[i].t}, which belongs to ${ring[i].node}. With replication factor ${scene.rf} the next distinct nodes clockwise hold the other copies: ${reps.join(', ')}. Every node can compute this alone, so nobody asks a directory.` };
  }

  function mount(host, scene) {
    const S = { nodes: scene.nodes.slice(0, scene.start), tokens: scene.tokenChoices[0], key: scene.key, hl: null, say: null };
    host.innerHTML = `<div class="rs rg">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Tokens per node">${scene.tokenChoices.map(n => `<button type="button" data-tok="${n}">${n} token${n > 1 ? 's' : ''} per node</button>`).join('')}</div>
        <div class="rs-presets" role="group" aria-label="Cluster size"><button type="button" data-do="add">Add a node</button><button type="button" data-do="remove">Remove the last node</button></div>
        <div class="bt-try"><label>Partition key <input type="text" maxlength="24" value="${esc(scene.key)}" data-key aria-label="Partition key"></label><button type="button" data-do="locate">Locate it</button>${scene.keys.map(k => `<button type="button" data-pick="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      </div>
      <div class="rg-stage"><div class="rg-ringbox" data-ring></div><div class="rg-side"><b class="rg-h">Share of the ring owned</b><div data-bars></div><div class="rg-legend">Arc colour = owner. Dots = token positions.</div></div></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n">i</span><div><b data-title></b><p data-text></p></div></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function show() {
      const d = draw(S, scene);
      $('[data-ring]').innerHTML = d.svg; $('[data-bars]').innerHTML = d.bars;
      const vals = Object.values(d.sh), max = Math.max(...vals), min = Math.min(...vals);
      $('[data-stat]').textContent = `${S.nodes.length} nodes · ${S.tokens * S.nodes.length} tokens · largest share ${max.toFixed(1)}% · smallest ${min.toFixed(1)}% · ratio ${(max / Math.max(min, 0.01)).toFixed(1)}×`;
      const say = S.say || narrate(S, scene) || { title: 'The token ring', text: 'Each node owns the arcs that end at its tokens. Pick a key to see where it lands.' };
      $('[data-title]').textContent = say.title; $('[data-text]').textContent = say.text;
      host.querySelectorAll('[data-tok]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.tok === S.tokens)));
      $('[data-do=add]').disabled = S.nodes.length >= scene.nodes.length; $('[data-do=remove]').disabled = S.nodes.length <= scene.rf;
    }
    function change(next, label) {
      const before = build(S.nodes, S.tokens), nodes = next.nodes || S.nodes, tokens = next.tokens || S.tokens, after = build(nodes, tokens), m = moved(before, after, 1000);
      S.nodes = nodes; S.tokens = tokens; S.hl = next.hl || null;
      const to = Object.entries(m.to).map(([k, v]) => `${v} to ${k}`).join(', ');
      S.say = { title: label, text: m.moved ? `Of 1,000 sample keys, ${m.moved} (${(m.moved / 10).toFixed(1)}%) changed owner${to ? ': ' + to : ''}. Those partitions must be streamed to their new owner. ${next.note || ''}` : `No sample key changed owner. ${next.note || ''}` };
      show();
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.tok) change({ tokens: +b.dataset.tok, note: 'Tokens per node changes how evenly the arcs average out.' }, `${b.dataset.tok} token(s) per node`);
      else if (b.dataset.pick) { $('[data-key]').value = b.dataset.pick; S.key = b.dataset.pick; S.say = null; show(); }
      else if (b.dataset.do === 'locate') { S.key = $('[data-key]').value.trim() || scene.key; S.say = null; show(); }
      else if (b.dataset.do === 'add') { const n = scene.nodes[S.nodes.length]; change({ nodes: S.nodes.concat(n), hl: [n], note: `Only the arcs the new node takes over move; every other key stays where it is.` }, `Node ${n} joins`); }
      else if (b.dataset.do === 'remove') { const n = S.nodes[S.nodes.length - 1]; change({ nodes: S.nodes.slice(0, -1), note: `${n}'s partitions are handed to the remaining nodes.` }, `Node ${n} leaves`); }
    });
    show();
  }

  function validate(scene) {
    const e = [];
    if (!Array.isArray(scene.nodes) || scene.nodes.length < 4 || scene.nodes.length > 8) e.push('animation ring needs 4 to 8 node names');
    if (!Number.isInteger(scene.rf) || scene.rf < 1 || scene.rf > 5) e.push('animation ring needs rf from 1 to 5');
    if (!Number.isInteger(scene.start) || scene.start < 3 || scene.start >= (scene.nodes || []).length) e.push('animation ring needs start (nodes at first), at least 3 and fewer than the node list');
    if (!Array.isArray(scene.tokenChoices) || !scene.tokenChoices.length || scene.tokenChoices.some(n => !Number.isInteger(n) || n < 1 || n > 32)) e.push('animation ring needs tokenChoices, integers from 1 to 32');
    if (typeof scene.key !== 'string' || !scene.key || !Array.isArray(scene.keys)) e.push('animation ring needs key and keys');
    return e;
  }

  root.Course.ring = { SPACE, hash, tokenOf, build, owner, ownerIndex, replicas, shares, moved };
  root.Course.registerAnimation('ring', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
