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
  for (const f of ['assets/course/kit.js', 'assets/course/contract.js', 'assets/course/animations.js', 'assets/course/animations/btree.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  return ctx.Course;
}

/* Every page within capacity, keys sorted across leaves, separators bound their subtrees, all leaves at one depth. */
function check(tree, cap) {
  const depths = new Set(), seen = [];
  (function walk(n, d, lo, hi) {
    assert.ok(n.keys.length <= cap && n.keys.length >= 1, 'page size ' + n.keys.length);
    n.keys.forEach(k => { assert.ok((lo == null || k >= lo) && (hi == null || k < hi), 'key ' + k + ' outside ' + lo + '..' + hi); });
    if (n.leaf) { depths.add(d); seen.push(...n.keys); return; }
    assert.equal(n.kids.length, n.keys.length + 1);
    n.kids.forEach((k, i) => walk(k, d + 1, i === 0 ? lo : n.keys[i - 1], i === n.keys.length ? hi : n.keys[i]));
  })(tree, 0, null, null);
  assert.equal(depths.size, 1, 'leaves at different depths');
  assert.deepEqual(seen, seen.slice().sort((a, b) => a - b));
  return seen;
}

test('inserts keep the tree balanced and sorted for every capacity', () => {
  const { btree } = load();
  for (const cap of [3, 4, 5]) {
    let seed = 7 + cap;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const keys = Array.from({ length: 200 }, () => 1 + rnd() % 400);
    const m = btree.build(cap, []);
    keys.forEach(k => btree.insert(m, k, null));
    const seen = check(JSON.parse(JSON.stringify(m.root)), cap);
    assert.deepEqual(seen, [...new Set(keys)].sort((a, b) => a - b));
  }
});

test('a split frame follows an overflow frame, and the root split adds a level', () => {
  const { btree } = load();
  const { frames, opStart } = btree.runAll(3, [10, 20, 30], [{ op: 'insert', key: 40 }]);
  const titles = frames.slice(opStart[0]).map(f => f.title);
  assert.ok(titles.includes('The leaf overflows'));
  assert.ok(titles.includes('The root splits: the tree grows'));
  assert.equal(btree.heightOf(frames[frames.length - 1].tree), 2);
  assert.equal(btree.heightOf(frames[0].tree), 1);
});

test('lookup reads one page per level and the range scan follows leaf siblings', () => {
  const { btree } = load();
  const base = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const s = btree.runAll(3, base, [{ op: 'search', key: 50 }, { op: 'search', key: 55 }]);
  assert.match(s.frames[s.opStart[0] + btree.heightOf(s.frames[0].tree)].title, /Found/);
  assert.match(s.frames[s.frames.length - 1].title, /Not in the leaf/);
  const r = btree.runAll(3, base, [{ op: 'range', from: 20, to: 70 }]);
  assert.ok(r.frames.some(f => f.title === 'Step to the right sibling'));
  assert.deepEqual([...r.frames[r.frames.length - 1].marks], [20, 30, 40, 50, 60, 70]);
});

test('the scene validator rejects bad data and the animation is registered', () => {
  const { validateAnimation } = load();
  assert.deepEqual([...validateAnimation({ kind: 'btree', cap: 3, base: [1, 2], presets: [{ label: 'a', ops: [{ op: 'insert', key: 3 }] }] })], []);
  assert.ok(validateAnimation({ kind: 'btree', cap: 9, base: [1, 1], presets: [] }).length >= 3);
});
