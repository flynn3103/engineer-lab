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
  for (const f of ['kit', 'contract', 'animations', 'animations/ring', 'animations/quorum', 'animations/raft', 'animations/lsm']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/course', f + '.js'), 'utf8'), ctx);
  return ctx.Course;
}
const rng = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

test('ring: shares add to 100, replicas are distinct, a new node only takes keys', () => {
  const { ring } = load();
  for (const per of [1, 4, 16]) {
    const nodes = ['A', 'B', 'C', 'D'], r = ring.build(nodes, per), sh = ring.shares(r);
    assert.ok(Math.abs(Object.values(sh).reduce((a, b) => a + b, 0) - 100) < 1e-9);
    for (let t = 0; t < ring.SPACE; t += 7) { const reps = ring.replicas(r, t, 3); assert.equal(new Set(reps).size, 3); assert.equal(reps[0], ring.owner(r, t)); }
    const r2 = ring.build(nodes.concat('E'), per), m = ring.moved(r, r2, 1000);
    assert.deepEqual(Object.keys(m.to).filter(k => k !== 'E'), [], 'keys may only move to the new node');
  }
  const few = ring.shares(ring.build(['A', 'B', 'C', 'D'], 1)), many = ring.shares(ring.build(['A', 'B', 'C', 'D'], 16));
  const spread = s => Math.max(...Object.values(s)) - Math.min(...Object.values(s));
  assert.ok(spread(many) < spread(few), 'more tokens per node evens the ring');
});

test('quorum: R + W > RF never reads stale, ONE and ONE can', () => {
  const { quorum } = load();
  const rand = rng(11);
  let staleOne = 0;
  for (let run = 0; run < 400; run++) {
    const ops = [];
    for (let i = 0; i < 8; i++) { const x = rand(); ops.push(x < 0.2 ? { op: 'down', r: Math.floor(rand() * 3) } : x < 0.4 ? { op: 'up', r: Math.floor(rand() * 3) } : { op: 'write', cl: 'QUORUM' }); }
    ops.push({ op: 'read', cl: 'QUORUM', from: Math.floor(rand() * 3) });
    const f = quorum.runAll(3, ops).frames, last = f[f.length - 1];
    assert.ok(!/stale/.test(last.title), 'quorum read was stale: ' + JSON.stringify(ops));
    const one = quorum.runAll(3, ops.slice(0, -1).concat({ op: 'read', cl: 'ONE', from: 2 })).frames.pop();
    if (/stale/.test(one.title)) staleOne++;
  }
  assert.ok(staleOne > 0, 'a read at ONE should be able to return a stale value');
  const un = quorum.runAll(3, [{ op: 'down', r: 1 }, { op: 'write', cl: 'ALL' }]).frames.pop();
  assert.match(un.title, /unavailable/);
});

test('raft: one leader per term and committed entries never change', () => {
  const { raft } = load();
  const rand = rng(5);
  for (let run = 0; run < 300; run++) {
    const ops = [];
    for (let i = 0; i < 14; i++) {
      const x = rand(), n = Math.floor(rand() * 5);
      ops.push(x < 0.25 ? { op: 'timeout', n } : x < 0.5 ? { op: 'client', cmd: 'c' + i } : x < 0.6 ? { op: 'crash', n } : x < 0.7 ? { op: 'restart', n } : x < 0.8 ? { op: 'partition', sides: [[0, 1], [2, 3, 4]] } : { op: 'heal' });
    }
    const { frames, model } = raft.runAll(5, ops);
    Object.values(model.leaders).forEach(l => assert.equal(new Set(l).size, 1, 'two leaders in one term'));
    let committed = [];
    frames.forEach(fr => fr.snap.nodes.forEach(x => {
      const c = x.log.slice(0, x.commit).map(e => e.join(':'));
      const n = Math.min(c.length, committed.length);
      assert.equal(JSON.stringify(c.slice(0, n)), JSON.stringify(committed.slice(0, n)), 'a committed entry changed');
      if (c.length > committed.length) committed = c;
    }));
  }
});

test('raft: a minority leader cannot commit and loses its entry after the heal', () => {
  const { raft } = load();
  const ops = [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'A' }, { op: 'partition', sides: [[0, 1], [2, 3, 4]] }, { op: 'client', cmd: 'B', to: 0 }, { op: 'timeout', n: 2 }, { op: 'client', cmd: 'C' }, { op: 'heal' }];
  const { frames } = raft.runAll(5, ops), titles = frames.map(f => f.title);
  assert.ok(titles.includes('"B" is NOT committed'));
  assert.ok(titles.includes('"C" is committed'));
  const end = frames[frames.length - 1].snap.nodes;
  end.forEach(x => assert.ok(!x.log.some(e => e[1] === 'B'), 'B should be overwritten'));
  end.forEach(x => assert.equal(x.log.length, end[0].log.length));
});

test('lsm: reads see the newest cell before and after compaction, purge removes tombstones', () => {
  const { lsm } = load();
  const sc = { memCap: 3, threshold: 3 }, rand = rng(3), keys = ['a', 'b', 'c', 'd', 'e'];
  for (let run = 0; run < 200; run++) {
    const ops = [], truth = {};
    for (let i = 0; i < 20; i++) { const k = keys[Math.floor(rand() * 5)], x = rand(); ops.push(x < 0.7 ? { op: 'put', k } : x < 0.85 ? { op: 'del', k } : { op: 'compact', purge: rand() < 0.5 }); }
    const { model } = lsm.runAll(sc, ops);
    const seen = {};
    const apply = o => { if (o.op === 'put') seen[o.k] = true; if (o.op === 'del') seen[o.k] = false; };
    ops.forEach(apply);
    keys.forEach(k => {
      const f = lsm.runAll(sc, ops.concat({ op: 'get', k })).frames.pop();
      const live = seen[k] === true;
      assert.equal(/= v/.test(f.title), live, `key ${k} live=${live} but "${f.title}"`);
    });
  }
  const f = lsm.runAll({ memCap: 2, threshold: 2 }, [{ op: 'put', k: 'a' }, { op: 'put', k: 'b' }, { op: 'del', k: 'a' }, { op: 'del', k: 'b' }, { op: 'compact', purge: true }]).frames;
  assert.equal(Object.keys(f[f.length - 1].sst[0].cells).length, 0);
});

test('every cluster animation validates its scene and rejects a bad one', () => {
  const { validateAnimation } = load();
  assert.deepEqual([...validateAnimation({ kind: 'ring', nodes: ['A', 'B', 'C', 'D', 'E'], rf: 3, start: 4, tokenChoices: [1, 4], key: 'k', keys: ['k'] })], []);
  assert.ok(validateAnimation({ kind: 'ring', nodes: ['A'], rf: 9, start: 1, tokenChoices: [], key: '', keys: 1 }).length >= 4);
  assert.deepEqual([...validateAnimation({ kind: 'quorum', rf: 3, field: 'price', values: ['1', '2', '3'], presets: [{ label: 'x', ops: [{ op: 'write', cl: 'ALL' }] }] })], []);
  assert.ok(validateAnimation({ kind: 'raft', n: 5, split: [[0], [1]], cmd: '', presets: [] }).length >= 3);
  assert.deepEqual([...validateAnimation({ kind: 'lsm', memCap: 3, threshold: 3, presets: [{ label: 'x', ops: [{ op: 'put', k: 'a' }] }] })], []);
});
