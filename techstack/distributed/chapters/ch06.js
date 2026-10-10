/* Chapter 7: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. server columns ---------- */
  const SX = i => 12 + i * 124, SW = 112;
  const KEYS = Array.from({ length: 20 }, (_, i) => i + 1);
  const PART_OWN = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3];
  const cols = {
    id: 'modn', label: 'A fifth server moves the keys',
    desc: 'Four servers hold keys by hash mod 4. Adding a fifth changes the divisor, so most keys must move. Fixed partitions move only a few (illustrative keys).',
    codeLabel: 'Trace',
    code: {
      bug: ['add server, divisor 4 -> 5', 'key 1: 1 mod 4 = 1, 1 mod 5 = 1 (stays)', 'key 4: 4 mod 4 = 0 -> 4 mod 5 = 4 (moves)', 'key 8: 8 mod 4 = 0 -> 8 mod 5 = 3 (moves)', 'moved: about 80% of keys (illustrative)'],
      fix: ['add server 4: hash(key) mod 12 never changes', 'server 0 hands partition 2 to server 4', 'server 2 hands partition 8 to server 4', 'moved: 2 of 12 partitions, about 17% of keys']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: keys 1 to 20, 12 fixed partitions, 5 servers at most.',
      header: s => ({ left: s.parts ? 'fixed partitions: hash(key) mod 12' : 'owner = key mod ' + (s.div || 4), right: s.moved != null ? 'moved ' + s.moved : '' }),
      setup(kit) {
        const R = { head: [], key: [], part: [] };
        for (let i = 0; i < 5; i++) R.head.push(DK.box(kit, { x: SX(i), y: 100, w: SW, h: 34, tone: i === 4 ? 'warn' : 'acc', label: 'server ' + i, op: i === 4 ? 0.2 : 1 }));
        KEYS.forEach(k => R.key.push(DK.box(kit, { x: 0, y: 150, w: 24, h: 24, r: 5, label: String(k), tone: 'soft' })));
        PART_OWN.forEach((o, p) => R.part.push(DK.box(kit, { x: 0, y: 150, w: 50, h: 24, r: 6, label: 'p' + p, tone: 'soft', op: 0 })));
        R.cnt = DK.txt(kit, { x: 12, y: 330, t: '', cls: 'sm b' });
        return R;
      },
      frame(s, kit, R) {
        const n = s.n || 4;
        R.head.forEach((h, i) => h.set({ op: i < n ? 1 : 0.2, tone: i === 4 ? (n === 5 ? 'warn' : 'soft') : 'acc' }));
        const slot = {};
        if (!s.parts) {
          KEYS.forEach((k, idx) => {
            const own = k % (s.div || 4), j = (slot[own] = (slot[own] || 0) + 1) - 1;
            const moved = (s.div || 4) === 5 && k % 4 !== k % 5;
            R.key[idx].set({ x: SX(own) + 4 + (j % 4) * 26, y: 146 + Math.floor(j / 4) * 30, op: 1, tone: moved ? 'warn' : 'live'.length ? 'ok' : 'ok' });
          });
          R.part.forEach(p => p.set({ op: 0 }));
        } else {
          R.key.forEach(k => k.set({ op: 0 }));
          const own = PART_OWN.slice(); if (s.take) { own[2] = 4; own[8] = 4; }
          PART_OWN.forEach((o0, p) => {
            const o = own[p], j = (slot[o] = (slot[o] || 0) + 1) - 1;
            R.part[p].set({ x: SX(o) + 4 + (j % 2) * 54, y: 146 + Math.floor(j / 2) * 30, op: 1, tone: s.take && (p === 2 || p === 8) ? 'warn' : 'ok' });
          });
        }
        R.cnt.set(s.count || '', { tone: s.countTone || 'ink' });
      }
    },
    bug: [
      { log: 'Four servers hold keys by key mod 4. Each owns five of the keys 1 to 20.', code: 0, callout: 'Owner = key mod 4', state: { n: 4, div: 4 }, stats: [{ l: 'servers', v: '4', cls: 'ok' }] },
      { log: 'A fifth server is added, so the divisor becomes 5. The keys have not moved yet, but every key must be checked against the new rule.', code: 0, callout: 'Server 4 joins: the divisor is now 5', state: { n: 5, div: 4 }, stats: [{ l: 'divisor', v: '4 → 5', cls: 'warn' }] },
      { log: 'Key 1 stays, because 1 mod 5 is 1. Key 4 goes from server 0 to server 4. Key 8 goes from server 0 to server 3. Only keys 1, 2, 3 and 20 keep their owner.', code: 4, callout: '16 of 20 keys change owner', moment: true, state: { n: 5, div: 5, moved: '16 of 20', count: 'moved keys are amber: 80% of the table', countTone: 'bad' }, stats: [{ l: 'keys moved', v: '16 of 20 (80%)', cls: 'bad' }],
        takeaway: 'Changing the divisor reassigns almost every key. The migration copies most of the table.' }
    ],
    fix: [
      { log: 'Keys hash into 12 fixed partitions, and partitions are assigned to servers. The hash function never changes.', code: 0, callout: 'hash(key) mod 12: the partition never changes', state: { n: 4, parts: 1 }, stats: [{ l: 'partitions', v: '12', cls: 'ok' }] },
      { log: 'Server 4 joins empty. Nothing has moved, and no key is re-hashed.', code: 0, callout: 'Server 4 joins empty', state: { n: 5, parts: 1 }, stats: [{ l: 'keys re-hashed', v: '0', cls: 'ok' }] },
      { log: 'Server 0 hands partition 2 to server 4 and server 2 hands partition 8. Whole partitions move, and each key keeps the same partition.', code: 3, callout: 'Only p2 and p8 move: 2 of 12', state: { n: 5, parts: 1, take: 1, moved: '2 of 12', count: 'moved partitions are amber: about 17% of keys', countTone: 'ok' }, stats: [{ l: 'partitions moved', v: '2 of 12 (17%)', cls: 'ok' }],
        takeaway: 'Fixed partitions turn a rebalance into moving a few whole chips, not re-hashing keys.' }
    ]
  };

  /* ---------- 2. raining inserts ---------- */
  const BX = [90, 250, 410], BW = 140, BASE = 284, TOPY = 114;
  const rain = {
    id: 'hotrange', label: 'Inserts hit one range',
    desc: 'New users get increasing ids, so every insert lands on the last range. Hashing the key spreads the same inserts (illustrative loads).',
    codeLabel: 'Trace',
    code: {
      bug: ['insert user 2001 -> range 3 (ids >= 2000)', 'insert user 2002 -> range 3', 'insert user 2003 .. 2999 -> range 3', 'range 1 and 2: idle, reads only'],
      fix: ['insert user 2001: hash -> partition 2', 'insert user 2002: hash -> partition 3', 'insert user 2003: hash -> partition 1', 'scan of users registered today: all 3 partitions']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: ranges 1 to 3 by user id; 12 inserts per round.',
      header: s => ({ left: s.hash ? 'partition = hash(user id)' : 'partition = range of user id', right: '' }),
      setup(kit) {
        const R = { bin: [], fill: [], val: [], drop: [] };
        BX.forEach((x, i) => {
          const b = DK.box(kit, { x, y: TOPY, w: BW, h: BASE - TOPY + 4, r: 8, tone: 'none', op: 1 }); b.g.querySelector('rect').style.fill = 'none'; R.bin.push(b);
          R.fill.push(DK.line(kit, { x1: x + BW / 2, y1: BASE, x2: x + BW / 2, y2: BASE, tone: 'ok', w: BW - 8, op: 0.9 }));
          DK.cap(kit, x + BW / 2, BASE + 22, s0(i), 'sm b', 'middle');
          R.val.push(DK.txt(kit, { x: x + BW / 2, y: BASE + 38, t: '', cls: 'sm', anchor: 'middle' }));
        });
        for (let i = 0; i < 6; i++) R.drop.push(DK.dot(kit, { x: 320, y: 100, r: 7, tone: 'acc2', op: 0 }));
        R.scan = DK.box(kit, { x: 90, y: 120, w: 460, h: 24, r: 6, tone: 'warn', label: 'scan: users registered today', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const ld = s.load || [0, 0, 0], max = 12, hot = Math.max(...ld);
        R.fill.forEach((f, i) => f.set({ y2: BASE - (ld[i] / max) * (BASE - TOPY - 4), tone: hot >= 9 && ld[i] === hot ? 'bad' : 'ok', ms: 800 }));
        R.val.forEach((v, i) => v.set(ld[i] ? ld[i] + ' inserts' : 'idle', { tone: hot >= 9 && ld[i] === hot ? 'bad' : 'ink' }));
        const dr = s.drops || [];
        R.drop.forEach((d, i) => { const b = dr[i]; d.set({ x: b == null ? 320 : BX[b] + BW / 2 + (i - 2.5) * 8, y: b == null ? 100 : TOPY + 18, op: b == null ? 0 : 1, tone: s.hash ? 'ok' : 'acc2' }); });
        R.scan.set({ op: s.scan ? 1 : 0 });
      }
    },
    bug: [
      { log: 'Users are partitioned by id range. New users get ids 2001, 2002, 2003 and so on, so each insert belongs to range 3, which holds ids from 2000 up.', code: 0, callout: 'Insert user 2001 → range 3', state: { drops: [2], load: [0, 0, 1] }, stats: [{ l: 'range 3 inserts', v: '1', cls: 'warn' }] },
      { log: 'Every following insert also has the highest id, so every insert lands on range 3.', code: 2, callout: 'Every new id is the highest id', state: { drops: [2, 2, 2, 2, 2, 2], load: [0, 0, 7] }, stats: [{ l: 'range 3 inserts', v: '7', cls: 'warn' }] },
      { log: 'Range 3 takes all the writes while ranges 1 and 2 serve only reads. One server is the bottleneck even though three servers exist.', code: 3, callout: 'One range takes 100% of the writes', moment: true, state: { drops: [2, 2, 2, 2, 2, 2], load: [0, 0, 12] }, stats: [{ l: 'range 1, range 2', v: 'idle', cls: 'bad' }, { l: 'range 3', v: 'all writes', cls: 'bad' }],
        takeaway: 'A key that grows with time sends every new write to the last range.' }
    ],
    fix: [
      { log: 'The partition is chosen by a hash of the user id. User 2001 goes to partition 2, 2002 to partition 3, 2003 to partition 1.', code: 0, callout: 'hash(2001) → 2, hash(2002) → 3, hash(2003) → 1', state: { hash: 1, drops: [1, 2, 0], load: [1, 1, 1] }, stats: [{ l: 'partitions used', v: '3 of 3', cls: 'ok' }] },
      { log: 'Consecutive ids scatter, so the same twelve inserts spread evenly across the three partitions.', code: 2, callout: 'Same 12 inserts, 4 on each partition', state: { hash: 1, drops: [0, 1, 2, 0, 1, 2], load: [4, 4, 4] }, stats: [{ l: 'inserts per partition', v: '4 / 4 / 4', cls: 'ok' }] },
      { log: 'The price is range queries. A scan of users registered today now has to ask all three partitions, because neighbouring ids no longer sit together.', code: 3, callout: 'A range scan must visit all 3 partitions', state: { hash: 1, load: [4, 4, 4], scan: 1 }, stats: [{ l: 'partitions per scan', v: '3', cls: 'warn' }],
        takeaway: 'Hashing spreads writes evenly but gives up cheap range scans.' }
    ]
  };
  function s0(i) { return ['partition 1', 'partition 2', 'partition 3'][i]; }

  /* ---------- 3. heat panel ---------- */
  const PX = [20, 226, 432], PW = 188;
  const heat = {
    id: 'celeb', label: 'One hot key',
    desc: 'A celebrity post gets a like on every request. The counter is one key, so one partition takes all the writes (illustrative rates).',
    codeLabel: 'Trace',
    code: {
      bug: ['like post 77 -> partition 3 (one row)', 'like post 77 -> partition 3', 'row lock: increments run one at a time', 'partition 1 and 2: CPU 4% and 3%'],
      fix: ['like: sub-counter 0..15, chosen at random', 'sub 3 on partition 1: +1', 'sub 13 on partition 3: +1', 'sub 8 on partition 2: +1', 'total = sum of 16 sub-counters']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: 16 sub-counters; CPU percentages are made up.',
      header: s => ({ left: s.sub ? 'counter split into 16 sub-counters' : 'one counter row: post 77', right: '' }),
      setup(kit) {
        const R = { p: [], cpu: [], sq: [], q: [], row: null };
        PX.forEach((x, i) => {
          R.p.push(DK.box(kit, { x, y: 100, w: PW, h: 150, r: 10, tone: 'soft', label: '', op: 1 }));
          DK.cap(kit, x + 10, 118, 'partition ' + (i + 1), 'sm b');
          R.cpu.push(DK.txt(kit, { x: x + PW - 10, y: 118, t: '', cls: 'sm b', anchor: 'end' }));
        });
        R.row = DK.box(kit, { x: PX[2] + 34, y: 150, w: 120, h: 44, r: 8, tone: 'bad', label: 'post 77', sub: 'likes = 1,000,000' });
        for (let i = 0; i < 16; i++) R.sq.push(DK.box(kit, { x: PX[2] + 34, y: 150, w: 28, h: 26, r: 5, label: String(i), tone: 'ok', op: 0 }));
        for (let i = 0; i < 8; i++) R.q.push(DK.dot(kit, { x: PX[2] + 20 + i * 10, y: 214, r: 4.5, tone: 'warn', op: 0 }));
        R.lock = DK.txt(kit, { x: PX[2] + 8, y: 238, t: '', cls: 'xs', anchor: 'start' });
        R.tot = DK.box(kit, { x: 120, y: 280, w: 400, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const cpu = s.cpu || [4, 3, 95];
        R.p.forEach((b, i) => b.set({ tone: cpu[i] > 70 ? 'bad' : cpu[i] > 50 ? 'warn' : 'soft', pct: cpu[i] > 70 ? 34 : 22 }));
        R.cpu.forEach((t, i) => t.set('CPU ' + cpu[i] + '%', { tone: cpu[i] > 70 ? 'bad' : 'ink' }));
        R.row.set({ op: s.sub ? 0 : 1 });
        R.sq.forEach((q, i) => { const part = i % 3; q.set({ op: s.sub ? 1 : 0, x: PX[part] + 14 + Math.floor(i / 3) * 0 + (Math.floor(i / 3) % 5) * 30 - (i % 3 === 2 ? 0 : 0), y: 140 + Math.floor(Math.floor(i / 3) / 5) * 34 + 0, tone: s.hit != null && i === s.hit ? 'acc' : 'ok' }); });
        R.q.forEach((d, i) => d.set({ op: !s.sub && i < (s.queue || 0) ? 1 : 0 }));
        R.lock.set(!s.sub && s.queue ? 'row lock: waiting writers' : '', { tone: 'bad' });
        R.tot.set({ op: s.total ? 1 : 0, label: s.total || '', sub: s.totalSub || '', tone: s.totalTone || 'none' });
      }
    },
    bug: [
      { log: 'The like counter of post 77 is one row, and that row lives on partition 3. Every like goes there.', code: 0, callout: 'Every like → one row on partition 3', state: { cpu: [4, 3, 40], queue: 2 }, stats: [{ l: 'partition 3 CPU', v: '40%', cls: 'warn' }] },
      { log: 'Increments to one row run one at a time, because each takes the row lock. The waiting writers pile up.', code: 2, callout: 'Row lock: increments run one at a time', state: { cpu: [4, 3, 80], queue: 6 }, stats: [{ l: 'writers waiting', v: 'many', cls: 'warn' }] },
      { log: 'Partition 3 is saturated while partitions 1 and 2 sit at 4% and 3%. Three servers exist, but one key uses one.', code: 3, callout: 'A hot key stays on one partition', moment: true, state: { cpu: [4, 3, 98], queue: 8 }, stats: [{ l: 'CPU', v: '4% / 3% / 98%', cls: 'bad' }],
        takeaway: 'Hashing spreads different keys. It cannot spread one key that gets all the traffic.' }
    ],
    fix: [
      { log: 'The counter is split into 16 sub-counters, and each like picks one at random. Sub-counters spread over the partitions.', code: 0, callout: 'Likes pick one of 16 sub-counters', state: { sub: 1, cpu: [30, 31, 32] }, stats: [{ l: 'sub-counters', v: '16', cls: 'ok' }] },
      { log: 'One like lands on sub-counter 3 on partition 1, the next on 13 on partition 3, the next on 8 on partition 2. No single row takes them all.', code: 3, callout: 'Likes land on different rows and servers', state: { sub: 1, hit: 8, cpu: [34, 33, 33] }, stats: [{ l: 'CPU', v: '34% / 33% / 33%', cls: 'ok' }] },
      { log: 'A read of the total sums the 16 sub-counters. Reads cost 16 lookups, but writes no longer queue behind one lock.', code: 4, callout: 'total = sum of 16 sub-counters', state: { sub: 1, cpu: [34, 33, 33], total: 'likes = sum of 16 rows', totalSub: 'reads cost 16 lookups', totalTone: 'ok' }, stats: [{ l: 'write queue', v: 'none', cls: 'ok' }, { l: 'read cost', v: '16 lookups', cls: 'warn' }],
        takeaway: 'Split a hot key into sub-keys. Writes spread, and reads pay by summing them.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[6] = { scenarios: [cols, rain, heat] };
})();
