/* Computed B+tree animation: insert with page splits, point lookup, and range scan along the leaf chain.
 * The model is a pure function (Course.btree) so Node can test it; the renderer draws the whole tree for every frame,
 * so Back and Restart need no replay. The course supplies the page capacity, the starting keys and the presets. */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = n => ({ id: n.id, leaf: n.leaf, keys: n.keys.slice(), kids: n.kids.map(clone) });
  const leavesOf = n => n.leaf ? [n] : n.kids.flatMap(leavesOf);
  const heightOf = n => n.leaf ? 1 : 1 + heightOf(n.kids[0]);
  const pagesOf = n => 1 + n.kids.reduce((a, k) => a + pagesOf(k), 0);
  const keyCount = t => leavesOf(t).reduce((a, l) => a + l.keys.length, 0);
  const slot = (n, key) => { let i = 0; while (i < n.keys.length && n.keys[i] <= key) i++; return i; };

  function build(cap, keys) {
    let nextId = 1;
    const model = { cap, root: { id: nextId++, leaf: true, keys: [], kids: [] }, newId: () => nextId++ };
    keys.forEach(k => insert(model, k, null));
    return model;
  }

  /* Insert key. When `out` is an array, one frame per move is pushed to it. Returns the model's root. */
  function insert(m, key, out) {
    const cap = m.cap;
    const f = (title, text, o) => out && out.push(Object.assign({ tree: clone(m.root), path: [], now: [], over: null, fresh: [], hit: null, title, text }, o));
    let node = m.root; const path = [node];
    f('Start at the root', `Insert key ${key}. Every search starts at the root page, and so does an insert.`, { path: [node.id], now: [node.id] });
    while (!node.leaf) {
      const i = slot(node, key), child = node.kids[i];
      const lo = i === 0 ? null : node.keys[i - 1], hi = i === node.keys.length ? null : node.keys[i];
      f('Pick a child', `${key} is ${lo == null ? '' : 'at least ' + lo}${lo != null && hi != null ? ' and ' : ''}${hi == null ? '' : 'below ' + hi}, so follow downlink ${i + 1} of ${node.kids.length}.`, { path: path.map(p => p.id), now: [child.id] });
      path.push(child); node = child;
    }
    if (node.keys.includes(key)) { f('Already present', `Key ${key} is already in this leaf. A unique index would raise a duplicate-key error here.`, { path: path.map(p => p.id), now: [node.id], hit: key }); return; }
    node.keys.splice(slot(node, key), 0, key);
    if (node.keys.length <= cap) { f('The leaf has room', `Key ${key} is written into the leaf in sorted order. The page holds ${node.keys.length} of ${cap} keys, so nothing else changes.`, { path: path.map(p => p.id), now: [node.id], hit: key }); return; }
    f('The leaf overflows', `Key ${key} does not fit: the page would hold ${node.keys.length} keys but the capacity is ${cap}. The page must split.`, { path: path.map(p => p.id), now: [node.id], over: node.id, hit: key });
    for (let level = path.length - 1; level >= 0; level--) {
      const n = path[level], right = { id: m.newId(), leaf: n.leaf, keys: [], kids: [] };
      let sep;
      if (n.leaf) {
        const mid = Math.ceil(n.keys.length / 2);
        right.keys = n.keys.slice(mid); n.keys = n.keys.slice(0, mid); sep = right.keys[0];
      } else {
        const mid = Math.floor(n.keys.length / 2);
        sep = n.keys[mid];
        right.keys = n.keys.slice(mid + 1); right.kids = n.kids.slice(mid + 1);
        n.keys = n.keys.slice(0, mid); n.kids = n.kids.slice(0, mid + 1);
      }
      const where = n.leaf ? 'The upper half moves to a new right sibling. The separator ' + sep + ' is copied up.' : 'The middle key ' + sep + ' moves up and is removed from this page.';
      if (level === 0) {
        m.root = { id: m.newId(), leaf: false, keys: [sep], kids: [n, right] };
        f('The root splits: the tree grows', `${where} There is no parent, so a new root is created above both halves. Every path is now one page longer.`, { path: [m.root.id], now: [m.root.id], fresh: [right.id, m.root.id] });
        return;
      }
      const parent = path[level - 1], idx = parent.kids.indexOf(n);
      parent.keys.splice(idx, 0, sep); parent.kids.splice(idx + 1, 0, right);
      if (parent.keys.length <= cap) { f('Split done', `${where} The parent has room for the new separator, so the change stops here.`, { path: path.slice(0, level).map(p => p.id), now: [parent.id], fresh: [right.id] }); return; }
      f('The parent overflows', `${where} But the parent now holds ${parent.keys.length} keys against a capacity of ${cap}, so it splits too.`, { path: path.slice(0, level).map(p => p.id), now: [parent.id], over: parent.id, fresh: [right.id] });
    }
  }

  function search(m, key, out) {
    const f = (title, text, o) => out.push(Object.assign({ tree: clone(m.root), path: [], now: [], over: null, fresh: [], hit: null, title, text }, o));
    let node = m.root; const path = [node.id];
    f('Start at the root', `Look up key ${key}. The search reads one page per level, so the tree height is the number of page reads.`, { path: path.slice(), now: [node.id] });
    while (!node.leaf) {
      const i = slot(node, key), child = node.kids[i]; path.push(child.id);
      f('Binary-search the page', `Inside the page the keys are sorted, so a binary search finds the child. ${key} sends the search to downlink ${i + 1}.`, { path: path.slice(), now: [child.id] });
      node = child;
    }
    const found = node.keys.includes(key);
    f(found ? 'Found in the leaf' : 'Not in the leaf', found ? `Key ${key} is in this leaf, next to a pointer to its heap row. Cost: ${path.length} index page reads, then 1 heap page.` : `Key ${key} is not in the leaf that would hold it, so it is not in the index. Cost: ${path.length} index page reads.`, { path: path.slice(), now: [node.id], hit: found ? key : null });
  }

  function range(m, from, to, out) {
    const f = (title, text, o) => out.push(Object.assign({ tree: clone(m.root), path: [], now: [], over: null, fresh: [], hit: null, title, text }, o));
    let node = m.root; const path = [node.id];
    f('Start at the root', `Range scan ${from} to ${to}. First find where ${from} would be, exactly like a point lookup.`, { path: path.slice(), now: [node.id] });
    while (!node.leaf) {
      const i = slot(node, from), child = node.kids[i]; path.push(child.id);
      f('Descend to the first leaf', `Follow the downlink for ${from}.`, { path: path.slice(), now: [child.id] });
      node = child;
    }
    const all = leavesOf(m.root); let li = all.indexOf(node); const got = [];
    for (; li < all.length; li++) {
      const leaf = all[li], inside = leaf.keys.filter(k => k >= from && k <= to);
      got.push(...inside);
      const more = leaf.keys.length && leaf.keys[leaf.keys.length - 1] <= to && li < all.length - 1;
      f(li === all.indexOf(node) ? 'Read the first leaf' : 'Step to the right sibling', `This leaf yields ${inside.length ? inside.join(', ') : 'nothing'}. ${more ? 'The last key is still inside the range, so follow the right-sibling link. The scan does not go back up to the root.' : 'The range ends here, so the scan stops.'}`, { path: path.slice(), now: [leaf.id], hit: null, marks: got.slice() });
      if (!more) break;
    }
  }

  /* Run every op from the base tree. Returns { frames, opStart: [index of the first frame of each op], model }. */
  function runAll(cap, base, ops) {
    const m = build(cap, base), frames = [], opStart = [];
    frames.push({ tree: clone(m.root), path: [], now: [], over: null, fresh: [], hit: null, title: 'The index before', text: `The tree has ${keyCount(m.root)} keys in ${pagesOf(m.root)} pages and height ${heightOf(m.root)}. Each page holds at most ${cap} keys. Leaves are chained left to right.` });
    ops.forEach(op => {
      opStart.push(frames.length);
      if (op.op === 'insert') insert(m, op.key, frames);
      else if (op.op === 'search') search(m, op.key, frames);
      else range(m, op.from, op.to, frames);
    });
    return { frames, opStart, model: m };
  }

  /* ---- drawing ---- */
  const SW = 34, SH = 30, GAP = 14, LV = 74, PAD = 12;
  function layout(tree, cap) {
    const w = n => cap * SW, pos = new Map(); let x = PAD;
    (function place(n, depth) {
      if (n.leaf) { pos.set(n.id, { x, y: PAD + depth * LV, n }); x += w(n) + GAP; return; }
      n.kids.forEach(k => place(k, depth + 1));
      const a = pos.get(n.kids[0].id), b = pos.get(n.kids[n.kids.length - 1].id);
      pos.set(n.id, { x: (a.x + b.x + w(n)) / 2 - w(n) / 2, y: PAD + depth * LV, n });
    })(tree, 0);
    return { pos, width: x - GAP + PAD, height: PAD + (heightOf(tree) - 1) * LV + SH + PAD + 8, w: cap * SW };
  }
  function draw(frame, cap) {
    const L = layout(frame.tree, cap), on = new Set(frame.now), inPath = new Set(frame.path), fresh = new Set(frame.fresh);
    let lines = '', nodes = '', links = '';
    const leaves = leavesOf(frame.tree);
    L.pos.forEach(({ x, y, n }) => {
      if (!n.leaf) n.kids.forEach((k, i) => {
        const c = L.pos.get(k.id), x1 = x + Math.min(i, n.keys.length) * SW;
        lines += `<line class="bt-edge${inPath.has(k.id) && inPath.has(n.id) ? ' on' : ''}" x1="${x1}" y1="${y + SH}" x2="${c.x + L.w / 2}" y2="${c.y}"/>`;
      });
    });
    L.pos.forEach(({ x, y, n }) => {
      const cls = ['bt-node', n.leaf ? 'leaf' : 'int'];
      if (on.has(n.id)) cls.push('now'); else if (inPath.has(n.id)) cls.push('path');
      if (frame.over === n.id) cls.push('over');
      if (fresh.has(n.id)) cls.push('fresh');
      const slots = Math.max(cap, n.keys.length);
      let cells = '';
      for (let i = 0; i < slots; i++) {
        const k = n.keys[i], hit = k != null && (k === frame.hit || (frame.marks && frame.marks.includes(k) && n.leaf));
        cells += `<rect class="bt-slot${k == null ? ' empty' : ''}${hit ? ' hit' : ''}" x="${x + i * SW}" y="${y}" width="${SW}" height="${SH}"/>` + (k != null ? `<text class="bt-key" x="${x + i * SW + SW / 2}" y="${y + SH / 2 + 5}">${esc(k)}</text>` : '');
      }
      nodes += `<g class="${cls.join(' ')}">${cells}<rect class="bt-frame" x="${x}" y="${y}" width="${slots * SW}" height="${SH}" rx="5"/></g>`;
    });
    leaves.forEach((lf, i) => {
      if (i === leaves.length - 1) return;
      const a = L.pos.get(lf.id), b = L.pos.get(leaves[i + 1].id), y = a.y + SH / 2;
      links += `<line class="bt-sib" x1="${a.x + L.w + 1}" y1="${y}" x2="${b.x - 1}" y2="${y}"/><path class="bt-arrow" d="M${b.x - 1} ${y} l-5 -3.5 v7 z"/>`;
    });
    return `<svg class="bt-svg" style="width:${L.width}px" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="B+tree: ${keyCount(frame.tree)} keys, height ${heightOf(frame.tree)}, ${pagesOf(frame.tree)} pages">${lines}${links}${nodes}</svg>`;
  }

  function mount(host, scene) {
    const cap = scene.cap, S = { preset: 0, ops: scene.presets[0].ops.slice(), k: 0 };
    let run;
    host.innerHTML = `<div class="rs bt">
      <div class="rs-ctl">
        <div class="rs-presets" role="group" aria-label="Choose a scenario">${scene.presets.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
        <div class="bt-try"><label>Your own key <input type="number" min="1" max="999" step="1" value="${scene.try || 35}" data-key aria-label="Key to try"></label>
          <button type="button" data-do="insert">Insert it</button><button type="button" data-do="search">Look it up</button></div>
      </div>
      <div class="bt-stage" data-stage></div>
      <div class="pk-check" data-stat aria-live="polite"></div>
      <div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>
      <div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div>
      <div class="rs-key bt-key-legend"><span class="bt-l now">page being read</span><span class="bt-l path">path so far</span><span class="bt-l fresh">new page</span><span class="bt-l over">overflowing page</span><span class="bt-l sib">→ right sibling link</span></div>
    </div>`;
    const $ = s => host.querySelector(s);
    function recompute() { run = runAll(cap, scene.base, S.ops); S.k = 0; show(); }
    function show() {
      const fr = run.frames[S.k], last = run.frames.length - 1;
      $('[data-stage]').innerHTML = draw(fr, cap);
      const leaves = leavesOf(fr.tree);
      $('[data-stat]').textContent = `height ${heightOf(fr.tree)} · pages ${pagesOf(fr.tree)} · leaves ${leaves.length} · keys ${keyCount(fr.tree)}`;
      $('[data-n]').textContent = S.k + 1; $('[data-title]').textContent = fr.title; $('[data-text]').textContent = fr.text;
      $('[data-count]').textContent = `step ${S.k + 1} of ${last + 1}`;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = S.k === 0;
      $('[data-act=next]').disabled = S.k === last;
      host.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.preset === S.preset)));
    }
    host.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.preset != null) { S.preset = +b.dataset.preset; S.ops = scene.presets[S.preset].ops.slice(); recompute(); return; }
      if (b.dataset.do) {
        const key = Math.round(+$('[data-key]').value);
        if (!(key >= 1 && key <= 999)) return;
        S.preset = -1; S.ops.push({ op: b.dataset.do, key });
        run = runAll(cap, scene.base, S.ops); S.k = run.opStart[S.ops.length - 1]; show(); return;
      }
      const last = run.frames.length - 1;
      if (b.dataset.act === 'first') S.k = 0; else if (b.dataset.act === 'prev') S.k = Math.max(0, S.k - 1); else if (b.dataset.act === 'next') S.k = Math.min(last, S.k + 1); else return;
      show();
    });
    recompute();
  }

  function validate(scene) {
    const errs = [], ok = Number.isInteger;
    if (!ok(scene.cap) || scene.cap < 3 || scene.cap > 5) errs.push('animation btree needs cap, an integer from 3 to 5');
    if (!Array.isArray(scene.base) || scene.base.some(k => !ok(k) || k < 1 || k > 999) || new Set(scene.base).size !== scene.base.length) errs.push('animation btree needs base, a list of unique integers from 1 to 999');
    if (!Array.isArray(scene.presets) || !scene.presets.length) errs.push('animation btree needs presets');
    else scene.presets.forEach((p, i) => {
      if (!p.label || !Array.isArray(p.ops) || !p.ops.length) errs.push('animation btree preset ' + (i + 1) + ' needs label and ops');
      else p.ops.forEach(o => { if (!(o.op === 'insert' || o.op === 'search' ? ok(o.key) : o.op === 'range' && ok(o.from) && ok(o.to))) errs.push('animation btree preset ' + (i + 1) + ' has a bad op'); });
    });
    return errs;
  }

  root.Course.btree = { build, insert, search, range, runAll, heightOf, pagesOf, keyCount, leavesOf };
  root.Course.registerAnimation('btree', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
