/* Chapter 9: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. merge cards ---------- */
  const lww = {
    id: 'lww', label: 'A timestamp drops an edit',
    desc: 'Two data centres edit the same note while the link is down. Last-write-wins keeps the later timestamp and drops the other edit (illustrative times).',
    codeLabel: 'Trace',
    code: {
      bug: ['Alice: add "buy milk" at 12:00:01 (DC 1)', 'Bob: add "call mum" at 12:00:00 (DC 2)', 'link down: no sync', 'sync: last-write-wins keeps 12:00:01', 'Bob sees +milk, "call mum" is gone'],
      fix: ['Alice: +milk, vv {R1:1}', 'Bob: +call mum, vv {R2:1}', 'sync: concurrent, keep both as siblings', 'app: merge siblings into one note']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative times and version vectors (vv).',
      header: s => ({ left: s.vv ? 'version vectors' : 'last-write-wins', right: '' }),
      setup(kit) {
        const R = {};
        R.d1 = DK.box(kit, { x: 20, y: 110, w: 200, h: 52, tone: 'acc', label: 'DC 1 · Alice', sub: '', op: 0.3 });
        R.d2 = DK.box(kit, { x: 20, y: 214, w: 200, h: 52, tone: 'warn', label: 'DC 2 · Bob', sub: '', op: 0.3 });
        R.cutL = DK.line(kit, { x1: 120, y1: 166, x2: 120, y2: 210, tone: 'bad', w: 3, dash: '5 4', op: 0 });
        R.cutT = DK.txt(kit, { x: 130, y: 192, t: '', cls: 'sm b' });
        R.m1 = DK.line(kit, { x1: 220, y1: 136, x2: 330, y2: 176, tone: 'mut', w: 2, op: 0 });
        R.m2 = DK.line(kit, { x1: 220, y1: 240, x2: 330, y2: 200, tone: 'mut', w: 2, op: 0 });
        R.res = DK.box(kit, { x: 330, y: 150, w: 290, h: 76, tone: 'none', label: '', sub: '', op: 0 });
        R.s1 = DK.box(kit, { x: 330, y: 244, w: 140, h: 40, tone: 'acc', label: '', sub: '', op: 0 });
        R.s2 = DK.box(kit, { x: 480, y: 244, w: 140, h: 40, tone: 'warn', label: '', sub: '', op: 0 });
        R.note = DK.txt(kit, { x: 330, y: 306, t: '', cls: 'sm b' });
        return R;
      },
      frame(s, kit, R) {
        R.d1.set({ op: s.d1 ? 1 : 0.3, sub: s.d1 || '', tone: s.d1x ? 'soft' : 'acc' });
        R.d2.set({ op: s.d2 ? 1 : 0.3, sub: s.d2 || '', tone: s.d2x ? 'bad' : 'warn', dash: s.d2x ? '4 3' : '' });
        R.cutL.set({ op: s.cut ? 1 : 0 }); R.cutT.set(s.cut ? 'link down' : '', { tone: 'bad' });
        R.m1.set({ op: s.sync ? 1 : 0, tone: 'acc' }); R.m2.set({ op: s.sync ? 1 : 0, tone: s.d2x ? 'bad' : 'warn', dash: s.d2x ? '4 3' : '' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
        R.s1.set({ op: s.sib ? 1 : 0, label: s.sib ? '+milk' : '', sub: 'vv {R1:1}' }); R.s2.set({ op: s.sib ? 1 : 0, label: s.sib ? '+call mum' : '', sub: 'vv {R2:1}' });
        R.note.set(s.note || '', { tone: s.noteTone || 'ink' });
      }
    },
    bug: [
      { log: 'During a partition Alice adds "buy milk" in DC 1 at 12:00:01, and Bob adds "call mum" in DC 2 at 12:00:00 (DC 2’s clock is a second behind).', code: 1, callout: 'Two edits, one note, no link', state: { d1: '+milk · 12:00:01', d2: '+call mum · 12:00:00', cut: 1 }, stats: [{ l: 'edits', v: '2', cls: 'warn' }] },
      { log: 'The link returns and the data centres sync. Last-write-wins compares timestamps only.', code: 3, callout: 'Sync: compare timestamps', state: { d1: '+milk · 12:00:01', d2: '+call mum · 12:00:00', sync: 1, res: 'compare 12:00:01 vs 12:00:00', resTone: 'none' }, stats: [{ l: 'rule', v: 'latest timestamp wins', cls: 'warn' }] },
      { log: 'DC 1 has the later timestamp, so its edit wins. Bob’s edit is discarded without any error, even though it was not an older version of the same data.', code: 4, callout: '"call mum" silently dropped', moment: true, state: { d1: '+milk · 12:00:01', d2: '+call mum · 12:00:00', d2x: 1, sync: 1, res: 'note: milk', resSub: '"call mum" is gone', resTone: 'bad' }, stats: [{ l: 'edits kept', v: '1 of 2', cls: 'bad' }],
        takeaway: 'Last-write-wins turns concurrent edits into a data loss, decided by clocks that are never perfectly in step.' }
    ],
    fix: [
      { log: 'Each write carries a version vector. Alice’s write is {R1:1} and Bob’s is {R2:1}.', code: 0, callout: 'Writes carry version vectors', state: { vv: 1, d1: '+milk · {R1:1}', d2: '+call mum · {R2:1}', cut: 1 }, stats: [{ l: 'vectors', v: '{R1:1}, {R2:1}', cls: 'ok' }] },
      { log: 'On sync neither vector includes the other, so the writes are concurrent. Both are kept as siblings.', code: 2, callout: 'Neither is newer: keep both siblings', state: { vv: 1, d1: '+milk · {R1:1}', d2: '+call mum · {R2:1}', sync: 1, sib: 1, res: 'siblings', resSub: 'concurrent: nothing is dropped', resTone: 'ok' }, stats: [{ l: 'siblings', v: '2', cls: 'ok' }] },
      { log: 'The application merges the siblings into one note, so both edits survive.', code: 3, callout: 'The app merges: milk + call mum', state: { vv: 1, d1: '+milk · {R1:1}', d2: '+call mum · {R2:1}', sync: 1, res: 'note: milk + call mum', resSub: 'vv {R1:1, R2:1}', resTone: 'ok' }, stats: [{ l: 'edits kept', v: '2 of 2', cls: 'ok' }],
        takeaway: 'Detect concurrency instead of guessing the order. Keep siblings, then merge in the application.' }
    ]
  };

  /* ---------- 2. replica brackets ---------- */
  const RXS = [40, 220, 400], RW = 190;
  const quorum = {
    id: 'quorum', label: 'W = 1 misses the write',
    desc: 'Three replicas with W = 1 and R = 1. The confirmed write is on replica 1 only, and the read asks replica 3 (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['write v2 (W = 1) -> replica 1', 'client: confirmed v2', 'read (R = 1) -> replica 3', 'replica 3: v1 (never saw v2)'],
      fix: ['write v2 to replicas, W = 2', 'replica 2: ack, 2 of 3', 'read R = 2: replica 3 and replica 2', 'replica 2 holds v2, newest of the two']
    },
    stage: {
      w: W, h: H, footer: 'N = 3; fixed home set, one completed write, no concurrent updates.',
      header: s => ({ left: 'N = 3 replicas', right: s.wr || '' }),
      setup(kit) {
        const R = { rep: [], wl: [], rl: [] };
        RXS.forEach((x, i) => {
          R.rep.push(DK.box(kit, { x, y: 180, w: RW, h: 58, tone: 'none', label: 'replica ' + (i + 1), sub: 'v1' }));
          R.wl.push(DK.line(kit, { x1: x, y1: 258, x2: x + RW, y2: 258, tone: 'acc', w: 7, op: 0 }));
          R.rl.push(DK.line(kit, { x1: x, y1: 162, x2: x + RW, y2: 162, tone: 'acc2', w: 7, op: 0 }));
        });
        R.wT = DK.txt(kit, { x: 40, y: 284, t: '', cls: 'sm b' });
        R.rT = DK.txt(kit, { x: 40, y: 134, t: '', cls: 'sm b' });
        R.ov = DK.box(kit, { x: 150, y: 306, w: 340, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const w = s.w || [], r = s.r || [], v = s.v || ['v1', 'v1', 'v1'];
        R.rep.forEach((b, i) => b.set({ sub: v[i], tone: w.includes(i) && r.includes(i) ? 'ok' : v[i] === 'v2' ? 'acc' : 'none', hl: w.includes(i) && r.includes(i) }));
        R.wl.forEach((l, i) => l.set({ op: w.includes(i) ? 1 : 0 })); R.rl.forEach((l, i) => l.set({ op: r.includes(i) ? 1 : 0 }));
        R.wT.set(w.length ? 'write set: W = ' + w.length : '', { tone: 'acc' });
        R.rT.set(r.length ? 'read set: R = ' + r.length : '', { tone: 'acc2' });
        R.ov.set({ op: s.ov ? 1 : 0, tone: s.ovTone || 'none', label: s.ov || '', sub: s.ovSub || '' });
      }
    },
    bug: [
      { log: 'The client writes v2 with W = 1. Replica 1 stores it and the client is told it is confirmed. Replicas 2 and 3 still hold v1.', code: 0, callout: 'W = 1: replica 1 stores v2, confirmed', state: { v: ['v2', 'v1', 'v1'], w: [0], wr: 'W = 1, R = 1' }, stats: [{ l: 'confirmed copies', v: '1 of 3', cls: 'warn' }] },
      { log: 'A read with R = 1 is routed to replica 3. The write set {1} and the read set {3} share no replica.', code: 2, callout: 'Read set {3} misses write set {1}', moment: true, state: { v: ['v2', 'v1', 'v1'], w: [0], r: [2], wr: 'W = 1, R = 1', ov: 'no shared replica', ovSub: 'W + R = 2, not greater than 3', ovTone: 'bad' }, stats: [{ l: 'W + R', v: '2 ≤ 3', cls: 'bad' }] },
      { log: 'Replica 3 returns v1. The read is correct for that copy, but it misses a write that was already confirmed.', code: 3, callout: 'The read returns v1, the old value', state: { v: ['v2', 'v1', 'v1'], w: [0], r: [2], wr: 'W = 1, R = 1', ov: 'read returns v1', ovSub: 'confirmed v2 was missed', ovTone: 'bad' }, stats: [{ l: 'read returns', v: 'v1', cls: 'bad' }],
        takeaway: 'With W + R ≤ N the read set can miss the write set entirely.' }
    ],
    fix: [
      { log: 'The write waits for W = 2. Replicas 1 and 2 store v2 before the client is confirmed.', code: 0, callout: 'W = 2: replicas 1 and 2 store v2', state: { v: ['v2', 'v2', 'v1'], w: [0, 1], wr: 'W = 2, R = 2' }, stats: [{ l: 'confirmed copies', v: '2 of 3', cls: 'ok' }] },
      { log: 'The read asks R = 2 replicas: 3 and 2. Any 2 of 3 must share a replica with the 2 that took the write.', code: 2, callout: 'Read set {2, 3} overlaps write set {1, 2}', state: { v: ['v2', 'v2', 'v1'], w: [0, 1], r: [1, 2], wr: 'W = 2, R = 2', ov: 'replica 2 is in both sets', ovSub: 'W + R = 4 > 3', ovTone: 'ok' }, stats: [{ l: 'W + R', v: '4 > 3', cls: 'ok' }] },
      { log: 'Replica 3 says v1 and replica 2 says v2. The client keeps the newest version, v2.', code: 3, callout: 'The newest of the answers wins: v2', state: { v: ['v2', 'v2', 'v1'], w: [0, 1], r: [1, 2], wr: 'W = 2, R = 2', ov: 'read returns v2', ovSub: 'overlap includes this write', ovTone: 'ok' }, stats: [{ l: 'read returns', v: 'v2', cls: 'ok' }],
        takeaway: 'R + W > N forces set overlap here. Version rules and concurrent operations still matter.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[8] = { scenarios: [quorum, lww] };
})();
