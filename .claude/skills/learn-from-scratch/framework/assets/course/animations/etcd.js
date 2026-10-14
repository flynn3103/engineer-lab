/* Computed etcd animation: one object, a global revision counter, two clients with cached copies, optimistic concurrency by
 * resourceVersion, last-write-wins without it, a watch stream, and compaction that makes an old watch fail with 410 Gone.
 * The model is pure (Course.etcd) so Node can test it. */
(function (root) {
  'use strict';
  const esc = root.Course.esc, KEY = 'web';
  const cp = o => JSON.parse(JSON.stringify(o)), show = v => v ? `replicas ${v.replicas}, image ${v.image}` : '(not read yet)';

  function fresh() { const v = { replicas: 3, image: 'v1' }; return { val: v, rev: 1, mod: 1, hist: [{ rev: 1, type: 'PUT', val: cp(v) }], compacted: 0, cache: { A: null, B: null }, watch: null }; }
  const snap = m => ({ val: cp(m.val), rev: m.rev, mod: m.mod, hist: cp(m.hist), compacted: m.compacted, cache: cp(m.cache), watch: cp(m.watch) });
  const write = (m, v) => { m.rev++; m.mod = m.rev; m.val = cp(v); const ev = { rev: m.rev, type: 'PUT', val: cp(v) }; m.hist.push(ev); if (m.watch) m.watch.got.push(ev); };

  function step(m, op) {
    const f = (title, text, tone, extra) => Object.assign({ snap: snap(m), title, text, tone: tone || '', now: null }, extra);
    if (op.op === 'read') { m.cache[op.c] = { val: cp(m.val), rv: m.mod }; return f(`Client ${op.c} reads the object`, `${op.c} GETs ${KEY} and keeps a copy: ${show(m.val)}, with metadata.resourceVersion ${m.mod}, the revision of its last change.`, '', { now: op.c }); }
    if (op.op === 'update' || op.op === 'force') {
      const c = m.cache[op.c]; if (!c) return f(`Client ${op.c} has no copy`, `Read the object first.`, 'bad');
      const next = cp(c.val); next[op.field] = op.value;
      if (op.op === 'update') {
        if (c.rv !== m.mod) return f(`409 Conflict for client ${op.c}`, `${op.c} sent its update with resourceVersion ${c.rv}, but the object is now at ${m.mod}. etcd refuses: someone changed it since ${op.c} read it. ${op.c} must read again, redo its change on the fresh copy, and retry. Nothing was overwritten.`, 'ok', { now: op.c });
        write(m, next); m.cache[op.c] = { val: cp(next), rv: m.mod };
        return f(`Client ${op.c} sets ${op.field} = ${op.value}`, `The resourceVersion matched, so the write is accepted and the global revision moves to ${m.rev}. The object is now at resourceVersion ${m.mod}.`, 'ok', { now: op.c });
      }
      const lost = Object.keys(m.val).filter(k => k !== op.field && m.val[k] !== next[k]);
      write(m, next); m.cache[op.c] = { val: cp(next), rv: m.mod };
      return f(`Client ${op.c} overwrites the object`, `${op.c} PUTs its whole copy with no resourceVersion check. etcd accepts it, revision ${m.rev}.${lost.length ? ` The other writer's change to ${lost.join(', ')} is silently lost: the last write wins.` : ''}`, lost.length ? 'bad' : '', { now: op.c });
    }
    if (op.op === 'watch') {
      const from = op.from === 'now' ? m.rev + 1 : op.from;
      if (from <= m.compacted) { m.watch = null; return f(`410 Gone: revision ${from} is too old`, `The client asked to resume the watch at revision ${from}, but history up to revision ${m.compacted} has been compacted away. The server cannot replay what it no longer has. The client must LIST the current state and start a new watch from there.`, 'bad', { now: 'W' }); }
      m.watch = { from, got: m.hist.filter(e => e.rev >= from).map(cp) };
      return f(`Watch starts at revision ${from}`, `The client opens a watch from revision ${from}. ${m.watch.got.length ? `etcd first replays the ${m.watch.got.length} event(s) it still has from that revision, then streams new ones live.` : 'There is nothing to replay yet; every later change is pushed to the client as it happens.'}`, 'ok', { now: 'W' });
    }
    if (op.op === 'compact') { m.hist = m.hist.filter(e => e.rev >= op.to); m.compacted = Math.max(m.compacted, op.to - 1); return f(`History is compacted up to revision ${m.compacted}`, `etcd keeps old revisions only for a while (compaction runs on a schedule and bounds the database size). Revisions up to ${m.compacted} can no longer be replayed to a watcher.`, ''); }
    throw new Error('unknown op ' + op.op);
  }

  function runAll(ops) { const m = fresh(), frames = [{ snap: snap(m), title: 'One object, two clients', text: 'etcd holds the object web. Every write, to any key, increases one global revision counter, and that revision becomes the object\'s resourceVersion. Two controllers want to change it at the same time.', tone: '', now: null }], opStart = []; ops.forEach(op => { opStart.push(frames.length); frames.push(step(m, op)); }); return { frames, opStart, model: m }; }

  function client(name, c, now, cur) {
    return `<div class="et-cl${now === name ? ' now' : ''}"><b>Client ${name}</b><small>its cached copy</small><div>${c ? esc(show(c.val)) : '<i>not read yet</i>'}</div><em>${c ? 'resourceVersion ' + c.rv + (c.rv !== cur ? ' (stale)' : '') : ''}</em></div>`;
  }
  function draw(fr) {
    const s = fr.snap;
    const hist = s.hist.map(e => `<span class="et-ev"><i>rev ${e.rev}</i>${esc(show(e.val))}</span>`).join('');
    const watch = s.watch ? `<div class="et-watch${fr.now === 'W' ? ' now' : ''}"><b>Watch from revision ${s.watch.from}</b>${s.watch.got.length ? s.watch.got.map(e => `<span class="et-ev"><i>rev ${e.rev}</i>${esc(show(e.val))}</span>`).join('') : '<em>no events yet</em>'}</div>` : `<div class="et-watch${fr.now === 'W' ? ' now' : ''}"><b>Watch</b><em>${fr.now === 'W' ? 'failed: 410 Gone' : 'not started'}</em></div>`;
    return `<div class="et-row">${client('A', s.cache.A, fr.now, s.mod)}<div class="et-store"><b>etcd</b><div class="v">${esc(show(s.val))}</div><em>resourceVersion ${s.mod}</em><small>global revision ${s.rev}${s.compacted ? ' · compacted up to ' + s.compacted : ''}</small></div>${client('B', s.cache.B, fr.now, s.mod)}</div>
      <div class="et-hist"><b>Event history kept by etcd</b>${hist || '<em>empty</em>'}</div>${watch}`;
  }

  function mount(host, scene) {
    root.Course.opsPlayer(host, { scene, cls: 'et', run: runAll, draw,
      stat: fr => `revision ${fr.snap.rev} · object at resourceVersion ${fr.snap.mod} · history ${fr.snap.hist.length} event(s)`,
      controls: `<div class="bt-try"><label>Client <select data-c><option>A</option><option>B</option></select></label><button type="button" data-do="read">Read</button><label>Set <select data-f><option value="replicas">replicas</option><option value="image">image</option></select> to <input type="text" value="5" maxlength="4" data-v style="width:70px"></label><button type="button" data-do="update">Update with resourceVersion</button><button type="button" data-do="force">Overwrite (no check)</button></div>
        <div class="bt-try"><button type="button" data-do="watch">Start a watch now</button><button type="button" data-do="compact">Compact history</button><button type="button" data-do="old">Watch from revision 1</button></div>`,
      control: (b, h) => { const c = h.querySelector('[data-c]').value, f = h.querySelector('[data-f]').value, v = h.querySelector('[data-v]').value.trim() || '5', val = f === 'replicas' ? Math.max(0, parseInt(v, 10) || 5) : v, d = b.dataset.do;
        if (d === 'read') return { op: 'read', c }; if (d === 'update' || d === 'force') return { op: d, c, field: f, value: val };
        if (d === 'watch') return { op: 'watch', from: 'now' }; if (d === 'old') return { op: 'watch', from: 1 }; if (d === 'compact') return { op: 'compact', to: 99 }; return null; } });
  }

  function validate(scene) {
    const e = [], okOp = o => ['read', 'update', 'force'].includes(o.op) ? ['A', 'B'].includes(o.c) && (o.op === 'read' || (['replicas', 'image'].includes(o.field) && o.value != null)) : o.op === 'watch' ? o.from === 'now' || Number.isInteger(o.from) : o.op === 'compact' && Number.isInteger(o.to);
    if (!Array.isArray(scene.presets) || !scene.presets.length) e.push('animation etcd needs presets');
    else scene.presets.forEach((p, i) => { if (!p.label || !Array.isArray(p.ops) || !p.ops.length || !p.ops.every(okOp)) e.push('animation etcd preset ' + (i + 1) + ' needs label and valid ops'); });
    return e;
  }
  root.Course.etcd = { runAll, step, fresh };
  root.Course.registerAnimation('etcd', { mount, validate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
