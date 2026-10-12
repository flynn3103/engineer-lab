const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function load() {
  const ctx = { TextEncoder, TextDecoder };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['kit', 'contract', 'animations', 'animations/player', 'animations/etcd', 'animations/reconcile', 'animations/scheduler', 'animations/rollout', 'animations/hpa']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/course', f + '.js'), 'utf8'), ctx);
  return ctx.Course;
}
const rng = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

test('etcd: an update with a stale resourceVersion is refused, an unchecked overwrite can lose a change', () => {
  const { etcd } = load();
  const rand = rng(4);
  for (let run = 0; run < 300; run++) {
    const ops = [];
    for (let i = 0; i < 12; i++) { const c = rand() < 0.5 ? 'A' : 'B', x = rand(); ops.push(x < 0.3 ? { op: 'read', c } : x < 0.85 ? { op: 'update', c, field: rand() < 0.5 ? 'replicas' : 'image', value: rand() < 0.5 ? 7 : 'v9' } : { op: 'compact', to: 1 + Math.floor(rand() * 4) }); }
    const { frames } = etcd.runAll(ops);
    frames.forEach((fr, i) => { if (/^409/.test(fr.title)) assert.equal(fr.snap.mod, frames[i - 1].snap.mod, 'a refused write must not change the object'); });
    let last = 1; frames.forEach(fr => { assert.ok(fr.snap.rev >= last); last = fr.snap.rev; });
  }
  const lost = etcd.runAll([{ op: 'read', c: 'A' }, { op: 'read', c: 'B' }, { op: 'force', c: 'A', field: 'replicas', value: 5 }, { op: 'force', c: 'B', field: 'image', value: 'v2' }]);
  assert.equal(lost.frames.at(-1).snap.val.replicas, 3);
  const safe = etcd.runAll([{ op: 'read', c: 'A' }, { op: 'read', c: 'B' }, { op: 'update', c: 'A', field: 'replicas', value: 5 }, { op: 'update', c: 'B', field: 'image', value: 'v2' }, { op: 'read', c: 'B' }, { op: 'update', c: 'B', field: 'image', value: 'v2' }]);
  assert.equal(safe.frames.at(-1).snap.val.replicas, 5); assert.equal(safe.frames.at(-1).snap.val.image, 'v2');
  assert.match(etcd.runAll([{ op: 'update', c: 'A', field: 'replicas', value: 4 }, { op: 'read', c: 'A' }, { op: 'update', c: 'A', field: 'replicas', value: 4 }, { op: 'update', c: 'A', field: 'replicas', value: 5 }, { op: 'compact', to: 4 }, { op: 'watch', from: 2 }]).frames.at(-1).title, /410 Gone/);
});

test('reconcile: a level-triggered controller always converges after a restart, an edge-triggered one may not', () => {
  const { reconcile } = load();
  const rand = rng(8);
  for (let run = 0; run < 300; run++) {
    const ops = [{ op: 'mode', level: true }];
    for (let i = 0; i < 8; i++) { const x = rand(); ops.push(x < 0.3 ? { op: 'delete', id: 1 + Math.floor(rand() * 8) } : x < 0.5 ? { op: 'crash' } : x < 0.65 ? { op: 'scale', to: 1 + Math.floor(rand() * 6) } : { op: 'restart' }); }
    ops.push({ op: 'restart' });
    const { model } = reconcile.runAll(3, ops);
    assert.equal(model.pods.length, model.D, 'level-triggered controller must converge: ' + JSON.stringify(ops));
  }
  const edge = reconcile.runAll(3, [{ op: 'mode', level: false }, { op: 'crash' }, { op: 'delete', id: 2 }, { op: 'restart' }]);
  assert.equal(edge.model.pods.length, 2);
});

test('scheduler: the bound node is feasible and has the highest score, capacity is never exceeded', () => {
  const { scheduler } = load();
  const scene = { nodes: [
    { name: 'n1', cpu: 2000, mem: 4, usedCpu: 1500, usedMem: 3, labels: { disk: 'ssd' } }, { name: 'n2', cpu: 2000, mem: 4, usedCpu: 400, usedMem: 1, labels: { disk: 'hdd' } },
    { name: 'n3', cpu: 4000, mem: 8, usedCpu: 3700, usedMem: 6, labels: { disk: 'ssd' } }, { name: 'n4', cpu: 4000, mem: 8, usedCpu: 800, usedMem: 2, labels: { disk: 'hdd' }, taints: ['gpu=true:NoSchedule'] }],
    pods: [{ name: 'web', cpu: 500, mem: 1 }, { name: 'db', cpu: 400, mem: 1, selector: { disk: 'ssd' } }, { name: 'huge', cpu: 3000, mem: 2 }, { name: 'ml', cpu: 600, mem: 2, tolerates: ['gpu=true:NoSchedule'] }] };
  const rand = rng(2);
  for (let run = 0; run < 200; run++) {
    const ops = Array.from({ length: 6 }, () => ({ op: 'schedule', pod: Math.floor(rand() * 4) }));
    const { frames } = scheduler.runAll(scene, ops);
    frames.forEach(fr => {
      fr.nodes.forEach(n => { assert.ok(n.usedCpu <= n.cpu && n.usedMem <= n.mem, 'over capacity'); });
      if (fr.stage === 'bind') { const i = fr.chosen; assert.equal(fr.filt[i].length, 0); fr.scores.forEach(s => { if (s) assert.ok(fr.scores[i].total >= s.total); }); }
    });
  }
  const f = scheduler.runAll(scene, [{ op: 'schedule', pod: 2 }]).frames;
  assert.equal(f.at(-1).stage, 'pending'); assert.match(f.at(-1).text, /0\/4 nodes are available/);
});

test('rollout: total never exceeds replicas + maxSurge and ready never drops below replicas - maxUnavailable', () => {
  const { rollout } = load();
  for (const R of [3, 4, 6, 8]) for (let s = 0; s <= 3; s++) for (let u = 0; u <= 3; u++) {
    if (!s && !u) continue;
    for (const bad of [false, true]) {
      const { frames } = rollout.runAll(R, [{ op: 'update', s, u, bad }]);
      frames.forEach(fr => { if (fr.round) { assert.ok(fr.oldTotal + fr.newTotal <= R + s, `total R${R} s${s} u${u}`); assert.ok(fr.oldReady + fr.newReady >= R - u, `ready R${R} s${s} u${u}`); } });
      const last = frames.at(-1);
      if (!bad) { assert.equal(last.title, 'Rollout complete', `R${R} s${s} u${u}`); assert.equal(last.newReady, R); assert.equal(last.oldTotal, 0); } else assert.equal(last.title, 'The rollout is stuck');
    }
  }
  const rb = rollout.runAll(4, [{ op: 'update', s: 1, u: 0, bad: true }, { op: 'rollback', s: 1, u: 0 }]).frames.at(-1);
  assert.equal(rb.title, 'Rollout complete'); assert.equal(rb.newV, 'v1');
  assert.match(rollout.runAll(4, [{ op: 'update', s: 0, u: 0 }]).frames.at(-1).title, /Invalid/);
});

test('hpa: replicas stay within the limits, a jump is followed, scale-down waits for the window', () => {
  const { hpa } = load();
  const c = { start: 3, min: 2, max: 25, req: 200, target: 50, warm: 2, window: 20, tolerance: 0.1 };
  const jump = hpa.runAll(c, [{ op: 'load', to: 2100 }, { op: 'tick', n: 12 }]).model;
  assert.equal(jump.ready + jump.starting.length, 21);
  const rand = rng(6);
  for (let run = 0; run < 200; run++) {
    const ops = []; for (let i = 0; i < 10; i++) ops.push(rand() < 0.4 ? { op: 'load', to: Math.floor(rand() * 40) * 100 } : { op: 'tick', n: 1 + Math.floor(rand() * 4) });
    const { frames } = hpa.runAll(c, ops);
    frames.forEach(fr => { const t = fr.snap.ready + fr.snap.starting; assert.ok(t >= c.min && t <= c.max, 'replicas ' + t); });
  }
  const down = hpa.runAll(c, [{ op: 'load', to: 2100 }, { op: 'tick', n: 12 }, { op: 'load', to: 300 }, { op: 'tick', n: 10 }]).model;
  assert.ok(down.ready + down.starting.length > 10, 'must not scale down inside the stabilization window');
  const later = hpa.runAll(c, [{ op: 'load', to: 2100 }, { op: 'tick', n: 12 }, { op: 'load', to: 300 }, { op: 'tick', n: 30 }]).model;
  assert.ok(later.ready + later.starting.length <= 4);
  const norq = hpa.runAll(c, [{ op: 'noRequest' }, { op: 'load', to: 2100 }, { op: 'tick', n: 6 }]).model;
  assert.equal(norq.ready + norq.starting.length, 3);
});

test('k8s animations validate their scenes', () => {
  const { validateAnimation } = load();
  assert.deepEqual([...validateAnimation({ kind: 'etcd', presets: [{ label: 'x', ops: [{ op: 'read', c: 'A' }] }] })], []);
  assert.deepEqual([...validateAnimation({ kind: 'reconcile', replicas: 3, presets: [{ label: 'x', ops: [{ op: 'crash' }] }] })], []);
  assert.deepEqual([...validateAnimation({ kind: 'rollout', replicas: 4, presets: [{ label: 'x', ops: [{ op: 'update', s: 1, u: 1 }] }] })], []);
  assert.deepEqual([...validateAnimation({ kind: 'hpa', start: 3, min: 2, max: 20, req: 200, target: 50, warm: 2, window: 20, tolerance: 0.1, presets: [{ label: 'x', ops: [{ op: 'tick', n: 1 }] }] })], []);
  assert.ok(validateAnimation({ kind: 'scheduler', nodes: [], pods: [], presets: [] }).length >= 3);
});
