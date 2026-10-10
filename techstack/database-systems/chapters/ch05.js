/* Chapter 6 "Hash Tables" (index 5, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L07 Hash Tables (hash functions, linear probing, cuckoo, chained, extendible and linear hashing).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: linear probing with a delete, a probe-count chart against load factor, cuckoo eviction, and extendible-hashing splits.
   Hash values, sizes and counts are illustrative. */
(function () {
  const DB = window.DB;
  const SOURCE = { label: 'CMU 15-445 L07 Hash Tables (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/07-hashtables.pdf' };

  /* ---- 1. Linear probing: a delete that empties a slot cuts the probe chain, a tombstone keeps it ---- */
  const SX = i => 40 + i * 72;
  const probe = {
    id: 'linear-probe', label: 'Linear probing', desc: 'Keys A, B and C hash to slots 2, 2 and 3 of an 8-slot table. Collisions take the next free slot. Emptying a slot on delete breaks the chain, and a tombstone repairs it (hash values illustrative).',
    codeLabel: 'Table',
    code: { bug: [
      'slot = hash(key) mod 8; while taken and key differs: slot + 1',
      'insert A (hash 2), B (hash 2), C (hash 3): they sit in slots 2, 3 and 4',
      'lookup C: start at slot 3, keep going until the key or an empty slot',
      'DELETE B by emptying slot 3',
      'lookup C: slot 3 is empty, so the search stops and says "not found"',
      'DELETE B by writing a tombstone: lookups continue past it, inserts may reuse it',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 slots, keys with chosen hash values. Illustrative.',
      header: s => ({ left: s.hl || 'slots 0 to 7', right: s.rt || '' }),
      draw(P, s) {
        for (let i = 0; i < 8; i++) {
          const v = (s.slots || [])[i];
          P.box('s' + i, { x: SX(i), y: 196, w: 66, h: 50, tone: v === 'x' ? 'warn' : v ? ({ A: 't0', B: 't1', C: 't2', D: 't3' })[v] : 'mut', label: v === 'x' ? 'tomb' : v || '', dash: !v });
          P.text('i' + i, { x: SX(i) + 33, y: 264, t: String(i), cls: 'mut xs', anchor: 'middle' });
        }
        if (s.key) {
          P.chip('key', { x: s.key.x, y: 90, w: 140, h: 44, label: s.key.label, sub: s.key.sub, tone: 'cursor' });
          P.line('hk', s.key.x + 70, 134, SX(s.key.h) + 33, 196, { tone: 'cursor', arrow: true, label: 'hash', dy: -4 });
        }
        if (s.cur != null) P.chip('cur', { x: SX(s.cur) - 3, y: 282, w: 72, h: 34, label: 'probe', sub: '', tone: s.curTone || 'cursor', small: true, hl: true });
        if (s.res) P.chip('res', { x: 400, y: 330, w: 210, h: 40, label: s.res[0], sub: '', tone: s.res[1] });
      }
    }),
    bug: [
      { log: 'Insert A with hash 2. Slot 2 is free, so A goes there.', callout: 'A takes its home slot 2', code: 1,
        state: { slots: [, , 'A'], key: { x: 100, label: 'insert A', sub: 'hash 2', h: 2 } }, stats: [{ l: 'probes', v: '1', cls: 'ok' }] },
      { log: 'B also hashes to 2. Slot 2 is taken by A, so B moves to the next slot, 3.', callout: 'B collides and moves to slot 3', code: 1,
        state: { slots: [, , 'A', 'B'], key: { x: 100, label: 'insert B', sub: 'hash 2', h: 2 }, cur: 3 }, stats: [{ l: 'probes', v: '2', cls: 'warn' }] },
      { log: 'C hashes to 3, which B now occupies. C moves to slot 4. The three keys form one cluster.', callout: 'C is pushed to slot 4: a cluster forms', code: 1,
        state: { slots: [, , 'A', 'B', 'C'], key: { x: 190, label: 'insert C', sub: 'hash 3', h: 3 }, cur: 4 }, stats: [{ l: 'probes', v: '2', cls: 'warn' }, { l: 'cluster size', v: '3' }] },
      { log: 'Lookup C starts at its hash slot 3, sees B, moves on and finds C in slot 4. Two probes.', callout: 'Lookup C: slot 3, then slot 4', code: 2,
        state: { slots: [, , 'A', 'B', 'C'], key: { x: 190, label: 'find C', sub: 'hash 3', h: 3 }, cur: 4, res: ['found C in 2 probes', 'ok'] }, stats: [{ l: 'probes', v: '2', cls: 'ok' }] },
      { log: 'A cleanup job deletes B and simply empties slot 3.', callout: 'Delete B: slot 3 becomes empty', code: 3,
        state: { slots: [, , 'A', , 'C'] }, stats: [{ l: 'live keys', v: '2' }] },
      { log: 'Lookup C starts at slot 3 again, finds it empty, and stops. An empty slot means "this key was never inserted", so the answer is not found.', callout: 'C exists but the lookup says not found', moment: true, code: 4,
        state: { slots: [, , 'A', , 'C'], key: { x: 190, label: 'find C', sub: 'hash 3', h: 3 }, cur: 3, curTone: 'bad', res: ['not found: wrong', 'bad'] }, stats: [{ l: 'C is stored', v: 'yes', cls: 'bad' }, { l: 'answer', v: 'not found', cls: 'bad' }] },
      { log: 'Write a tombstone into slot 3 instead. It says "something was here, keep probing". Lookups pass over it.', callout: 'A tombstone keeps the chain intact', code: 5,
        state: { slots: [, , 'A', 'x', 'C'], hl: 'delete B with a tombstone' }, stats: [{ l: 'tombstones', v: '1', cls: 'warn' }] },
      { log: 'Now lookup C goes from slot 3 over the tombstone to slot 4 and finds it. New inserts may reuse the tombstone slot, and a rebuild clears the rest.', callout: 'Lookup C passes the tombstone', code: 5,
        state: { slots: [, , 'A', 'x', 'C'], key: { x: 190, label: 'find C', sub: 'hash 3', h: 3 }, cur: 4, res: ['found C in 2 probes', 'ok'], hl: 'delete B with a tombstone' }, stats: [{ l: 'answer', v: 'found', cls: 'ok' }],
        takeaway: 'In open addressing an empty slot ends a search. A delete must leave a tombstone, or the table loses keys behind it.' },
    ],
  };

  /* ---- 2. Load factor chart: expected probes grow slowly, then explode ---- */
  const LX0 = 80, LX1 = 590, LY0 = 290, LY1 = 106;
  const lx = a => LX0 + a / 0.96 * (LX1 - LX0);
  const ly = p => LY0 - Math.log(p) / Math.log(250) * (LY0 - LY1);
  const hitP = a => 0.5 * (1 + 1 / (1 - a)), missP = a => 0.5 * (1 + 1 / ((1 - a) * (1 - a)));
  const LOADS = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95];
  const loadChart = {
    id: 'load-factor', label: 'Probes vs load', desc: 'Expected probes per lookup in a linear-probing table, found keys and missing keys, as the table fills. The expected counts follow the classic formulas, so the curve is exact for this scheme.',
    codeLabel: 'Formula',
    code: { bug: [
      'load factor a = keys / slots',
      'probes for a key that is there:  0.5 * (1 + 1 / (1 - a))',
      'probes for a key that is not:    0.5 * (1 + 1 / (1 - a)^2)',
      'a = 0.5: 1.5 and 2.5 probes   (the usual rule: twice as many slots as keys)',
      'a = 0.9: 5.5 and 50.5 probes',
      'a = 0.95: 10.5 and 200.5 probes',
    ] },
    stage: DB.stage({
      footer: 'Linear probing, uniform hash. Vertical axis is a log scale.',
      header: s => ({ left: s.at != null ? 'load factor ' + s.at + ' · found ' + hitP(s.at).toFixed(1) + ' · missing ' + missP(s.at).toFixed(1) : 'expected probes per lookup', right: '' }),
      draw(P, s) {
        P.line('ax', LX0, LY0 + 4, LX1, LY0 + 4, { tone: 'mut' }); P.line('ay', LX0, LY0 + 4, LX0, LY1 - 10, { tone: 'mut' });
        [0, .25, .5, .75, .9].forEach((a, i) => P.text('tx' + i, { x: lx(a), y: LY0 + 22, t: String(a), cls: 'mut xs', anchor: 'middle' }));
        [1, 5, 20, 100].forEach((p, i) => P.text('ty' + i, { x: LX0 - 8, y: ly(p) + 4, t: String(p), cls: 'mut xs', anchor: 'end' }));
        P.text('xl', { x: LX1, y: LY0 + 40, t: 'load factor (keys / slots)', cls: 'mut xs', anchor: 'end' });
        P.text('yl', { x: LX0 + 6, y: LY1 - 14, t: 'expected probes', cls: 'mut xs' });
        const curve = (id, f, tone, upto) => LOADS.forEach((a, k) => { if (k === 0 || a > upto) return; P.line(id + k, lx(LOADS[k - 1]), ly(f(LOADS[k - 1])), lx(a), ly(f(a)), { tone, sw: 2.6 }); });
        if (s.hit) curve('h', hitP, 'ok', s.hit);
        if (s.miss) curve('m', missP, 'bad', s.miss);
        if (s.hit) P.text('lh', { x: lx(.62), y: ly(hitP(.6)) + 20, t: 'key present', cls: 'xs tone-ok' });
        if (s.miss) P.text('lm', { x: lx(.5), y: ly(missP(.5)) - 12, t: 'key absent', cls: 'xs tone-bad' });
        if (s.at != null) { P.line('mk', lx(s.at), LY0 + 4, lx(s.at), LY1 - 6, { tone: 'cursor', dash: true, sw: 2 });
          P.chip('pm', { x: Math.min(lx(s.at) + 6, LX1 - 120), y: LY1 - 4, w: 114, h: 30, label: missP(s.at).toFixed(1) + ' probes', sub: '', tone: s.tone || 'cursor', small: true }); }
      }
    }),
    bug: [
      { log: 'The load factor is keys divided by slots. The vertical axis is the expected number of slots a lookup reads before it stops.', callout: 'Load factor against probes', code: 0, state: {}, stats: [{ l: 'axes', v: 'load, probes' }] },
      { log: 'For a key that is in the table, probes grow gently: 1.5 at half full, 5.5 at 90% full.', callout: 'Found keys: gentle growth', code: 1, state: { hit: .95 }, stats: [{ l: 'at 0.9', v: '5.5 probes', cls: 'ok' }] },
      { log: 'For a key that is not in the table, the search runs until an empty slot. Clusters make that far longer: the curve bends upward steeply.', callout: 'Missing keys: much steeper', moment: true, code: 2, state: { hit: .95, miss: .95 }, stats: [{ l: 'at 0.9', v: '50.5 probes', cls: 'bad' }] },
      { log: 'At 50% full a missing key costs 2.5 probes. This is the rule behind twice as many slots as keys.', callout: '50% full: 2.5 probes', code: 3, state: { hit: .95, miss: .95, at: .5, tone: 'ok' }, stats: [{ l: 'missing key', v: '2.5', cls: 'ok' }] },
      { log: 'At 90% a missing key costs about 50 probes, twenty times more, for the same table with 80% more keys.', callout: '90% full: 50 probes', code: 4, state: { hit: .95, miss: .95, at: .9, tone: 'bad' }, stats: [{ l: 'missing key', v: '50.5', cls: 'bad' }] },
      { log: 'At 95% it is about 200 probes. A hash join that guessed the build size too low ends here, and its probe phase slows by orders of magnitude.', callout: '95% full: about 200 probes', code: 5, state: { hit: .95, miss: .95, at: .95, tone: 'bad' }, stats: [{ l: 'missing key', v: '200', cls: 'bad' }],
        takeaway: 'Size the table so it stays around half full, and rebuild before the curve turns up.' },
    ],
  };

  /* ---- 3. Cuckoo hashing: an insert may evict a key to its other home, and every lookup checks two places ---- */
  const T1 = i => ({ x: 70, y: 100 + i * 58 }), T2 = i => ({ x: 360, y: 100 + i * 58 });
  const H = { A: [0, 1], B: [3, 1], C: [0, 2] };    // [slot in table 1, slot in table 2]
  const CT = { A: 't0', B: 't1', C: 't2' };
  const cuckoo = {
    id: 'cuckoo', label: 'Cuckoo hashing', desc: 'Two tables, two hash functions. A key lives in one of two slots, so a lookup reads at most two. An insert into a taken slot evicts the occupant to its other slot (positions illustrative).',
    codeLabel: 'Tables',
    code: { bug: [
      'T1[h1(key)] or T2[h2(key)]: a key is in one of these two slots',
      'A: h1 = 0, h2 = 1     B: h1 = 3, h2 = 1     C: h1 = 0, h2 = 2',
      'state: A in T1[0], B in T2[1]',
      'insert C: T1[0] is taken by A -> evict A',
      'A moves to its other home T2[1], taken by B -> evict B',
      'B moves to its other home T1[3], which is free: done',
      'lookup any key: read T1[h1] then T2[h2], at most 2 probes',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two tables of four slots, three keys. Illustrative.',
      header: s => ({ left: s.hl || 'two tables, two hash functions', right: s.rt || '' }),
      draw(P, s) {
        P.text('t1', { x: 70, y: 82, t: 'table 1 (hash h1)', cls: 'mut sm' }); P.text('t2', { x: 360, y: 82, t: 'table 2 (hash h2)', cls: 'mut sm' });
        for (let i = 0; i < 4; i++) { P.box('a' + i, { ...T1(i), w: 110, h: 46, tone: 'mut', label: '', dash: true }); P.box('b' + i, { ...T2(i), w: 110, h: 46, tone: 'mut', label: '', dash: true });
          P.text('na' + i, { x: 60, y: T1(i).y + 28, t: String(i), cls: 'mut xs', anchor: 'end' }); P.text('nb' + i, { x: 350, y: T2(i).y + 28, t: String(i), cls: 'mut xs', anchor: 'end' }); }
        Object.entries(s.at || {}).forEach(([k, [t, i]]) => { const p = t === 0 ? { x: 205, y: 346 } : (t === 1 ? T1 : T2)(i); P.chip('k' + k, { x: p.x, y: p.y, w: 110, h: 46, label: k, sub: 'h1 ' + H[k][0] + ' · h2 ' + H[k][1], tone: s.hot === k ? 'cursor' : CT[k] }); });
        if (s.move) { const [k, t1, i1, t2, i2] = s.move; const a = (t1 === 1 ? T1 : T2)(i1), b = (t2 === 1 ? T1 : T2)(i2);
          P.line('mv', t1 === 1 ? a.x + 110 : a.x, a.y + 23, t2 === 1 ? b.x + 110 : b.x, b.y + 23, { tone: 'warn', arrow: true, label: s.mvl || 'evict', dy: -6 }); }
        if (s.res) P.chip('res', { x: 190, y: 350, w: 260, h: 38, label: s.res, sub: '', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'Two keys are stored. A sits in table 1 slot 0 (its h1). B sits in table 2 slot 1 (its h2).', callout: 'Each key has two possible homes', code: 2, state: { at: { A: [1, 0], B: [2, 1] } }, stats: [{ l: 'keys', v: '2' }] },
      { log: 'Insert C. Its first home is table 1 slot 0, which A occupies.', callout: 'C wants T1[0], A is there', code: 3, state: { at: { A: [1, 0], B: [2, 1] }, hot: 'A', hl: 'insert C' }, stats: [{ l: 'moves', v: '0' }] },
      { log: 'C takes the slot and A is evicted. A must go to its other home, table 2 slot 1.', callout: 'C takes T1[0], A is evicted', code: 3, state: { at: { C: [1, 0], A: [0, 0], B: [2, 1] }, move: ['A', 1, 0, 2, 1], hot: 'A', hl: 'insert C' }, stats: [{ l: 'moves', v: '1', cls: 'warn' }] },
      { log: 'That slot is taken by B, so B is evicted in turn and goes to its other home, table 1 slot 3.', callout: 'A takes T2[1], B is evicted', moment: true, code: 4, state: { at: { C: [1, 0], A: [2, 1], B: [0, 0] }, move: ['B', 2, 1, 1, 3], hot: 'B', hl: 'insert C', mvl: 'evict' }, stats: [{ l: 'moves', v: '2', cls: 'warn' }] },
      { log: 'Table 1 slot 3 is free, so the chain stops. Three keys sit in their final slots after two moves.', callout: 'B lands in a free slot: chain ends', code: 5, state: { at: { C: [1, 0], A: [2, 1], B: [1, 3] }, hl: 'insert C finished' }, stats: [{ l: 'moves', v: '2' }, { l: 'keys', v: '3', cls: 'ok' }] },
      { log: 'Any lookup reads at most two slots: T1[h1(key)] and T2[h2(key)]. Lookups and deletes stay cheap no matter how long an insert chain was.', callout: 'A lookup reads at most two slots', code: 6, state: { at: { C: [1, 0], A: [2, 1], B: [1, 3] }, res: 'find A: T1[0]=C no, T2[1]=A yes' }, stats: [{ l: 'probes per lookup', v: '≤ 2', cls: 'ok' }] },
      { log: 'The price is on the insert side. If the eviction chain ever loops back to a slot it has used, the tables are rebuilt with new hash seeds or at double size.', callout: 'A loop forces a rebuild', code: 6, state: { at: { C: [1, 0], A: [2, 1], B: [1, 3] }, hl: 'worst case: eviction loop', rt: 'rebuild with new seeds or 2x size' }, stats: [{ l: 'insert cost', v: 'variable', cls: 'warn' }],
        takeaway: 'Cuckoo hashing moves the cost from lookups to inserts. Lookups are two reads, and a rare loop triggers a rebuild.' },
    ],
  };

  /* ---- 4. Extendible hashing: split one bucket, double the directory only when needed ---- */
  const KEYS = { k1: '001', k2: '010', k3: '011', k4: '100', k5: '110', k6: '111' };
  const dirY = (i, n) => 100 + i * (n <= 2 ? 90 : 50);
  const bucketPos = (i, n) => ({ x: 270, y: 96 + i * 78 });
  const mk = (g, dir, buckets) => ({ g, dir, buckets });
  const extend = {
    id: 'extendible', label: 'Extendible hashing', desc: 'Buckets hold two keys. A full bucket splits. If its local depth equals the global depth, the directory doubles first, otherwise only the bucket splits and directory entries are repointed (3-bit hashes illustrative).',
    codeLabel: 'Directory',
    code: { bug: [
      'global depth g: the directory has 2^g entries, indexed by the first g hash bits',
      'k1=001 k2=010 k3=011 k4=100 k5=110 k6=111   bucket capacity 2',
      'g = 1: entry 0 -> bucket A (keys 0xx), entry 1 -> bucket B (keys 1xx)',
      'insert k3: A is full, local depth 1 = g -> double the directory',
      'split A into A0 (00x) and A1 (01x); B stays shared by entries 10 and 11',
      'insert k6: B is full, local depth 1 < g -> split B only, no doubling',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 3-bit hashes, bucket capacity two. Illustrative.',
      header: s => ({ left: 'global depth ' + s.g + ' · directory entries ' + (1 << s.g), right: s.rt || '' }),
      draw(P, s) {
        P.text('hd', { x: 40, y: 82, t: 'directory', cls: 'mut sm' }); P.text('hb', { x: 270, y: 82, t: 'buckets', cls: 'mut sm' });
        const n = 1 << s.g;
        for (let i = 0; i < n; i++) {
          const bits = i.toString(2).padStart(s.g, '0');
          P.chip('d' + i, { x: 40, y: dirY(i, n), w: 80, h: 38, label: bits, sub: '', tone: s.hotDir === i ? 'cursor' : 'info', small: true });
          const bi = s.dir[i]; const bp = bucketPos(bi, n);
          P.line('dl' + i, 120, dirY(i, n) + 19, 270, bp.y + 24, { tone: 'mut', arrow: true });
        }
        s.buckets.forEach((b, i) => { const p = bucketPos(i, n);
          P.chip('b' + i, { x: p.x, y: p.y, w: 270, h: 48, label: b.name + ' · depth ' + b.d, sub: b.keys.map(k => k + ' ' + KEYS[k]).join('   ') || 'empty', tone: s.hotB === i ? 'cursor' : (b.d === s.g ? 'ok' : 'info') }); });
        if (s.note) P.chip('nt', { x: 400, y: 380, w: 214, h: 32, label: s.note, sub: '', tone: 'warn', small: true });
      }
    }),
    bug: [
      { log: 'The directory has two entries, selected by the first hash bit. Bucket A holds the keys starting with 0, bucket B the keys starting with 1. Each bucket is full with two keys.', callout: 'Two buckets, both full', code: 2,
        state: mk(1, [0, 1], [{ name: 'A', d: 1, keys: ['k1', 'k2'] }, { name: 'B', d: 1, keys: ['k4', 'k5'] }]), stats: [{ l: 'global depth', v: '1' }] },
      { log: 'Insert k3, hash 011. It belongs in bucket A, which is full. The local depth of A is 1, equal to the global depth, so one bit of directory is not enough to tell the keys apart.', callout: 'A is full and its depth equals the global depth', moment: true, code: 3,
        state: { ...mk(1, [0, 1], [{ name: 'A', d: 1, keys: ['k1', 'k2'] }, { name: 'B', d: 1, keys: ['k4', 'k5'] }]), hotDir: 0, hotB: 0 }, stats: [{ l: 'action', v: 'double the directory', cls: 'warn' }] },
      { log: 'The directory doubles to four entries and the global depth becomes 2. No bucket moves yet: entries 00 and 01 both point to A, entries 10 and 11 both point to B.', callout: 'Directory doubles: 2 entries become 4', code: 3,
        state: { ...mk(2, [0, 0, 1, 1], [{ name: 'A', d: 1, keys: ['k1', 'k2'] }, { name: 'B', d: 1, keys: ['k4', 'k5'] }]), hotB: 0 }, stats: [{ l: 'global depth', v: '2', cls: 'warn' }, { l: 'keys moved', v: '0', cls: 'ok' }] },
      { log: 'Split A into A0 for 00x and A1 for 01x, then insert k3. Only the keys of A were looked at. B and its entries are untouched.', callout: 'Split A: only A is rewritten', code: 4,
        state: mk(2, [0, 1, 2, 2], [{ name: 'A0', d: 2, keys: ['k1'] }, { name: 'A1', d: 2, keys: ['k2', 'k3'] }, { name: 'B', d: 1, keys: ['k4', 'k5'] }]), stats: [{ l: 'buckets', v: '3' }, { l: 'keys moved', v: '3 of 6', cls: 'ok' }] },
      { log: 'Insert k6, hash 111. It goes to bucket B, which is full. B has local depth 1, less than the global depth 2.', callout: 'B is full, but its depth is below the global depth', code: 5,
        state: { ...mk(2, [0, 1, 2, 2], [{ name: 'A0', d: 2, keys: ['k1'] }, { name: 'A1', d: 2, keys: ['k2', 'k3'] }, { name: 'B', d: 1, keys: ['k4', 'k5'] }]), hotDir: 3, hotB: 2 }, stats: [{ l: 'action', v: 'split B, no doubling', cls: 'ok' }] },
      { log: 'Split B into B0 for 10x and B1 for 11x, and repoint the two directory entries. The directory keeps four entries.', callout: 'Split B, repoint two entries', moment: true, code: 5,
        state: mk(2, [0, 1, 2, 3], [{ name: 'A0', d: 2, keys: ['k1'] }, { name: 'A1', d: 2, keys: ['k2', 'k3'] }, { name: 'B0', d: 2, keys: ['k4'] }, { name: 'B1', d: 2, keys: ['k5', 'k6'] }]), stats: [{ l: 'buckets', v: '4' }, { l: 'directory', v: '4 entries', cls: 'ok' }],
        takeaway: 'Extendible hashing grows by splitting the one bucket that filled up. The table is never rebuilt, and the directory doubles only when a bucket is as deep as the directory.' },
    ],
  };

  const EXPLAIN = `
<h3>1. What a hash table gives, and what it costs</h3>
<p>A hash table maps a key to a value in constant time on average. It stores no order, so it cannot answer "all keys between a and b" and it cannot return keys in sorted order. A DBMS uses hash tables in many places: the page table of the buffer pool (chapter 3), the build side of a hash join and the groups of a hash aggregate (chapters 11 and 12), and sometimes an index. It has two parts. The <b>hash function</b> maps a large key space to an integer, and trades speed against collisions. A database does not need a cryptographic hash, only a fast one with few collisions, such as xxHash3. The <b>hashing scheme</b> decides what to do when two keys land in the same place.</p>
<figure class="mm" aria-label="Decision flowchart between static and dynamic hashing schemes" style="--diagram-width:936px">
  <img src="diagrams/ch05-scheme-map.svg" alt="Flowchart: if the number of keys is known in advance use a static scheme, a fixed array with about two slots per key, either linear probing which is fast and needs tombstones, or cuckoo hashing where a lookup checks two places and an insert may move keys. If it is not known, use a dynamic scheme: chained buckets, extendible hashing that splits one bucket and sometimes doubles the directory, or linear hashing with a split pointer.">
  <figcaption>Flowchart: the first question is whether the table size is known.</figcaption>
</figure>

<h3>2. Static schemes: linear probing and cuckoo</h3>
<p>A <b>static</b> table has a fixed size. If it fills, it must be rebuilt from scratch, usually at double the size, which is expensive, so it is sized at about twice the expected key count. <b>Linear probing</b> is the simplest and usually the fastest: hash to a slot, and if it is taken step to the next, wrapping around. A lookup steps until it finds the key or an empty slot. This makes deletes tricky. Emptying a slot can cut the chain for keys stored after it, so most implementations leave a <b>tombstone</b> that lookups pass over and inserts may reuse. The other option is to shift the following entries back, which is costly with many keys. <b>Cuckoo hashing</b> uses several tables with different seeds. A key is in exactly one of its homes, so a lookup reads at most one slot per table. An insert into a full slot evicts the occupant to its other home, which can chain. If the chain loops, the tables are rebuilt with new seeds or a larger size.</p>
<p>The load factor decides how well linear probing behaves, as the chart shows. Practical details from the lecture: fixed-length keys and values live in the table; variable-length ones go to a side table, and the hash table keeps a hash and a record ID. Non-unique keys are either stored redundantly or point to a list of values. Metadata such as empty and tombstone bits can be packed in a bitmap, and a version counter on the table lets a clear be a single increment instead of rewriting every slot.</p>

<h3>3. Dynamic schemes: grow without a full rebuild</h3>
<p><b>Chained hashing</b> keeps a linked list of buckets per slot. It is the simplest and the most common, and chains grow without limit. <b>Extendible hashing</b> splits buckets instead. A directory of 2<sup>g</sup> entries is indexed by the first g bits of the hash (g is the global depth), and several entries may share a bucket. A full bucket is split and the entries repointed. Only when the bucket is as deep as the directory (its local depth equals g) does the directory double. Only the keys of the split bucket move.</p>
<figure class="mm" aria-label="Flowchart of an extendible hashing insert: bucket full, compare local and global depth, split or double" style="--diagram-width:454px">
  <img src="diagrams/ch05-extendible-split.svg" alt="Flowchart: insert a key, take the first global-depth bits of its hash, go to the bucket the directory points to. If the bucket has room, put the key in. If it is full and the local depth is less than the global depth, split the bucket and repoint entries. If the local depth equals the global depth, double the directory and increase the global depth, then split.">
  <figcaption>Flowchart: the extendible-hashing insert. The loop at the bottom retries after the split.</figcaption>
</figure>
<p><b>Linear hashing</b> keeps a split pointer that moves through the buckets in order. When any bucket overflows, the bucket at the pointer is split, whether or not it is the one that overflowed, and a second hash function is used for keys of buckets already passed. The table grows one bucket at a time with no directory.</p>

<h3>4. Where a DBMS uses them</h3>
<p>A hash index gives fast equality lookups but no range scans, and its growth is awkward, so most databases default to the B+ tree (next chapter), and PostgreSQL&rsquo;s <code>USING hash</code> index is a niche choice. The big uses are inside execution. A hash join builds a table on the smaller input and probes it with the other. A hash aggregate keeps one entry per group. When the table does not fit in memory, the operator partitions to disk (chapters 11 and 12). The sizing question, how many keys will arrive, comes from cardinality estimation (chapter 19), so a bad estimate shows up here as a table that is too full.</p>

<h3>5. The trade-off</h3>
<p>Linear probing is fast and cache-friendly but degrades quickly above 70% full and needs tombstones. Cuckoo guarantees short lookups and pays on inserts. Chained hashing is simple and never fills but follows pointers. Extendible hashing grows smoothly and uses a directory in memory. All of them trade memory (empty slots) for speed, which is why sizing matters.</p>

<h3>6. Syntax</h3>
<pre>-- a hash index (PostgreSQL): equality only, no ranges
CREATE INDEX orders_user_hash ON orders USING hash (user_id);

-- see a hash join: Buckets and Batches show the table size and spills
EXPLAIN (ANALYZE)
SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id;
--   Hash  (Buckets: 262144  Batches: 4  Memory Usage: 4096kB)
--   Batches greater than 1 means the hash table did not fit in work_mem

-- give the hash table more room for one session
SET work_mem = '256MB';

-- group-by uses a hash aggregate when the groups fit
EXPLAIN SELECT status, count(*) FROM orders GROUP BY status;
--   HashAggregate  Group Key: status</pre>
<p>When <code>Batches</code> is above 1, the build side did not fit in memory. Fix the estimate before you raise <code>work_mem</code> for everyone.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A session cache keyed by user id is an in-memory open-addressing hash table sized for 1,000,000 keys (illustrative). After a traffic spike it holds 950,000 keys and the p99 lookup climbs from 1 microsecond to 400 microseconds with the key count nearly unchanged. Separately, a cleanup job deletes expired sessions, and afterwards lookups for live sessions sometimes return "not found".`,
    predict: {
      q: `A linear-probing table has keys A, B and C in slots 2, 3 and 4. All hash to slot 2 or 3. B is deleted by setting slot 3 to empty. What does a lookup for C, which hashes to slot 3, return?`,
      opts: [
        `C is found in slot 4, because the lookup keeps scanning`,
        `Not found, because the lookup stops at the empty slot 3 even though C is in slot 4`,
        `An error, because the table is inconsistent`,
        `C is found, because deletes rehash the cluster automatically`
      ],
      ans: 1,
      why: `An empty slot ends a linear-probing search, because it means no key ever probed past this point. Emptying slot 3 breaks the chain, so C in slot 4 becomes unreachable. A tombstone in slot 3 keeps the chain intact.`
    },
    diagnose: [
      {
        t: 'Table too full',
        sym: '<b>Lookup latency</b> rises sharply while the key count barely changes, and missing-key lookups are the slowest.',
        ctx: 'A table sized for 1,000,000 keys holds 950,000, so its load factor is 0.95. A probe for a missing key scans a long cluster before it finds an empty slot.',
        why: 'Linear probing keeps keys in clusters. Above about 70% full the expected probes for a missing key grow from a few to dozens and then hundreds, because each insert extends a cluster and the search must cross the whole of it.',
        log: `-- representative metrics, counts illustrative
table slots: 1,048,576  keys: 995,000  load factor: 0.95
avg probes (hit): 10.4   avg probes (miss): 198   p99 lookup: 410 us`,
        note: 'A load factor above 0.7 and many probes on misses means the table is too small for its keys.',
        fix: [
          'Measure first: export the load factor and the average probe length of hits and misses.',
          'Size for the expected key count with about twice the slots, so the load factor stays near 0.5.',
          'Resize before 0.7: grow to double the size at a threshold, ideally in the background.',
          'For a hash join or aggregate, fix the cardinality estimate (chapter 19), so the build size is right the first time.',
          'Verify: the load factor and the p99 lookup should both return to their old values.'
        ]
      },
      {
        t: 'Delete breaks the probe chain',
        sym: '<b>Lookups return not found</b> for keys that are still stored, after a cleanup job ran.',
        ctx: 'The cleanup job removes expired sessions by setting their slots to empty. Live sessions that were placed after a removed key, because of a collision, are now unreachable.',
        why: 'In open addressing an empty slot means a search can stop. If a delete empties a slot in the middle of a cluster, a lookup that hashes before it stops there and never reaches the keys after it.',
        log: `-- representative, illustrative
get(session:9917)  -> MISS   (key is present at slot 4, hash slot 3)
slot 3: EMPTY (cleared by cleanup 12:04)`,
        note: 'A miss for a key you can prove exists, right after deletes, points at a broken chain.',
        fix: [
          'Measure first: compare a full scan of the table with a point lookup for a sample of keys that returned a miss.',
          'Delete by writing a tombstone, and let lookups pass over tombstones while inserts may reuse them.',
          'Count tombstones. When they pass a threshold, rebuild the table or compact the cluster.',
          'Or choose a scheme without the problem, such as chained or cuckoo hashing.',
          'Verify: after the cleanup, look up every live key and confirm there are no misses.'
        ]
      },
      {
        t: 'Stop-the-world resize',
        sym: '<b>A latency spike</b> every time the table doubles, long enough to time out requests.',
        ctx: 'A static table doubles when it fills. Every key is rehashed into the new array while readers wait.',
        why: 'A static scheme has no way to grow in place. The whole table is rebuilt from scratch, so the cost of one insert is the cost of rehashing every key, and it lands on one unlucky request.',
        log: `-- representative, illustrative
resize: 8,388,608 -> 16,777,216 slots   rehash 8.0M keys   pause 1,350 ms`,
        note: 'Periodic pauses that line up with the doubling points of the table are rebuilds.',
        fix: [
          'Measure first: log each resize with its duration and compare it with the latency spikes.',
          'Pre-size the table from the best estimate of the key count, so resizes are rare.',
          'Use a dynamic scheme such as extendible or linear hashing, which splits one bucket at a time.',
          'Or resize incrementally: keep both tables and move a few buckets per operation.',
          'Verify: the latency spikes should disappear or fall below the timeout.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[5] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [probe, loadChart, cuckoo, extend] };
})();
