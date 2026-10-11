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
  for (const f of ['kit', 'contract', 'animations', 'animations/klog', 'animations/isr', 'animations/kgroup']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/course', f + '.js'), 'utf8'), ctx);
  return ctx.Course;
}
const rng = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

test('klog: murmur2 matches the Kafka test vectors, same key keeps its partition until the count changes', () => {
  const { klog } = load();
  const V = { '21': -973932308, 'foobar': -790332482, 'a-little-bit-long-string': -985981536, 'a-little-bit-longer-string': -1486304829, 'lkjh234lh9fiuh90y23oiuhsafujhadof229phr9h19h89h8': -58897971, 'abc': 479470107 };
  Object.entries(V).forEach(([s, v]) => assert.equal(klog.murmur2(s), v, s));
  for (let P = 2; P <= 8; P++) for (const k of ['a', 'seller-1', 'x9']) { const p = klog.partitionOf(k, P); assert.ok(p >= 0 && p < P); assert.equal(p, klog.partitionOf(k, P)); }
  const { frames } = klog.runAll(3, [{ op: 'produce', key: 'seller-2' }, { op: 'grow', to: 6 }, { op: 'produce', key: 'seller-2' }]);
  assert.equal(JSON.stringify(frames.at(-1).snap.hist['seller-2']), '[2,5]');
  const rr = klog.runAll(3, [null, null, null, null].map(key => ({ op: 'produce', key }))).model;
  assert.equal(JSON.stringify(rr.parts.map(p => p.length)), '[2,1,1]');
});

test('isr: acks=all never loses an acknowledged record without an unclean election, acks=1 can', () => {
  const { isr } = load();
  const rand = rng(21);
  let lostWithOne = 0;
  for (let run = 0; run < 600; run++) {
    const allOps = [], oneOps = [];
    for (let i = 0; i < 14; i++) {
      const x = rand(), id = Math.floor(rand() * 3), f = 1 + Math.floor(rand() * 2);
      const mk = acks => x < 0.35 ? { op: 'produce', acks } : x < 0.55 ? { op: 'fetch', f } : x < 0.65 ? { op: 'shrink', f } : x < 0.8 ? { op: 'crash', id } : { op: 'restart', id };
      allOps.push(mk('all')); oneOps.push(mk(1));
    }
    const a = isr.runAll(3, 2, allOps);
    assert.deepEqual([...a.lost], [], 'acks=all lost a record: ' + JSON.stringify(allOps));
    a.frames.forEach(fr => { const s = fr.snap; if (!s.offline) { const live = s.isr.map(i => s.br[i].log.length); if (live.length) assert.ok(s.hw <= Math.min(...live) || s.hw === 0); } });
    if (isr.runAll(3, 2, oneOps).lost.length) lostWithOne++;
  }
  assert.ok(lostWithOne > 0, 'acks=1 should be able to lose acknowledged records');
  const un = isr.runAll(3, 2, [{ op: 'shrink', f: 1 }, { op: 'shrink', f: 2 }, { op: 'produce', acks: 1 }, { op: 'crash', id: 0 }, { op: 'unclean', id: 1 }]);
  assert.deepEqual([...un.lost], [1]);
  assert.match(isr.runAll(3, 2, [{ op: 'shrink', f: 1 }, { op: 'shrink', f: 2 }, { op: 'produce', acks: 'all' }]).frames.at(-1).title, /not enough/i);
});

test('kgroup: every partition has exactly one owner, ranges stay balanced, sticky moves no more than range', () => {
  const { kgroup } = load();
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'], rand = rng(9);
  for (let run = 0; run < 300; run++) {
    const P = 3 + Math.floor(rand() * 8);
    const ops = [{ op: 'mode', mode: rand() < 0.5 ? 'eager' : 'cooperative' }];
    for (let i = 0; i < 8; i++) { const c = names[Math.floor(rand() * 7)]; ops.push(rand() < 0.6 ? { op: 'join', c } : { op: 'leave', c }); }
    const { frames } = kgroup.runAll(P, ['A', 'B'], ops);
    frames.forEach(fr => { const s = fr.snap; if ((fr.title === 'New assignment' || /share/.test(fr.title)) && s.members.length) {
      assert.ok(s.assign.every(o => o && s.members.includes(o)), 'unassigned partition');
      const cnt = {}; s.assign.forEach(o => { cnt[o] = (cnt[o] || 0) + 1; });
      const vals = s.members.map(m => cnt[m] || 0); assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, 'unbalanced ' + JSON.stringify(cnt));
    } });
  }
  const e = kgroup.runAll(6, ['A', 'B'], [{ op: 'mode', mode: 'eager' }, { op: 'join', c: 'C' }]).frames, c = kgroup.runAll(6, ['A', 'B'], [{ op: 'mode', mode: 'cooperative' }, { op: 'join', c: 'C' }]).frames;
  assert.equal(Math.max(...e.map(f => f.snap.paused.length)), 6);
  assert.equal(Math.max(...c.map(f => f.snap.paused.length)), 2);
});

test('kafka animations validate their scenes', () => {
  const { validateAnimation } = load();
  assert.deepEqual([...validateAnimation({ kind: 'klog', partitions: 3, keys: ['a', 'b'], presets: [{ label: 'x', ops: [{ op: 'produce', key: 'a' }, { op: 'grow', to: 6 }] }] })], []);
  assert.deepEqual([...validateAnimation({ kind: 'isr', rf: 3, minIsr: 2, presets: [{ label: 'x', ops: [{ op: 'produce', acks: 'all' }, { op: 'crash', id: 0 }] }] })], []);
  assert.deepEqual([...validateAnimation({ kind: 'kgroup', partitions: 6, consumers: ['A', 'B', 'C'], start: ['A'], presets: [{ label: 'x', ops: [{ op: 'join', c: 'B' }] }] })], []);
  assert.ok(validateAnimation({ kind: 'isr', rf: 9, minIsr: 0, presets: [] }).length >= 3);
});
