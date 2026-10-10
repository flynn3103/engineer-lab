/* Chapter 10: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. operation intervals ---------- */
  const TX = t => 118 + t * 50, LY = [108, 152, 196], RY = 244;
  const OPS = [
    { lane: 0, a: 0.5, b: 3.5, pt: 2, name: 'transfer', who: 'bank app' },
    { lane: 1, a: 4.5, b: 5.5, pt: 5, name: 'read', who: 'phone' },
    { lane: 2, a: 6.5, b: 7.5, pt: 7, name: 'read', who: 'laptop' }
  ];
  const intervals = {
    id: 'balance', label: 'The balance goes back',
    desc: 'The transfer completes on the leader. The phone reads a follower that has it and the laptop reads a follower that does not (illustrative values).',
    codeLabel: 'Trace',
    code: {
      bug: ['transfer: balance = 1200 on the leader', 'replicate 1200 to follower 1', 'phone reads follower 1: 1200', 'laptop reads follower 2 (not replicated yet)', 'follower 2 answers 1000'],
      fix: ['transfer: balance = 1200, on leader and a majority', 'phone: read from the leader', 'leader: asks a majority, still leader? yes', 'leader answers: balance 1200', 'laptop: read from the leader too', 'laptop: leader answers 1200']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative balances. A dot marks the instant an operation takes effect.',
      header: s => ({ left: s.lin ? 'reads go through the leader' : 'reads go to any follower', right: '' }),
      setup(kit) {
        const R = { bar: [], dot: [], drop: [], lab: [] };
        ['bank app', 'phone', 'laptop'].forEach((l, i) => { DK.box(kit, { x: 6, y: LY[i] - 15, w: 96, h: 30, r: 6, label: l, tone: i ? 'acc' : 'warn' }); DK.rule(kit, TX(0), LY[i], TX(10), LY[i], { dash: '3 4' }); });
        DK.box(kit, { x: 6, y: RY - 15, w: 96, h: 30, r: 6, label: 'real value', tone: 'none' });
        R.v1 = DK.line(kit, { x1: TX(0), y1: RY, x2: TX(0), y2: RY, tone: 'mut', w: 12 });
        R.v2 = DK.line(kit, { x1: TX(2), y1: RY, x2: TX(2), y2: RY, tone: 'ok', w: 12, op: 0 });
        R.t1 = DK.txt(kit, { x: TX(1), y: RY + 28, t: 'balance 1000', cls: 'sm', anchor: 'middle' });
        R.t2 = DK.txt(kit, { x: TX(6), y: RY + 28, t: '', cls: 'sm', anchor: 'middle' });
        OPS.forEach((o, i) => {
          R.bar.push(DK.line(kit, { x1: TX(o.a), y1: LY[o.lane], x2: TX(o.a), y2: LY[o.lane], tone: 'acc', w: 18, op: 0 }));
          R.dot.push(DK.dot(kit, { x: TX(o.pt), y: LY[o.lane], r: 7, tone: 'acc2', op: 0 }));
          R.drop.push(DK.line(kit, { x1: TX(o.pt), y1: LY[o.lane], x2: TX(o.pt), y2: RY, tone: 'mut', w: 1.6, dash: '3 3', op: 0 }));
          R.lab.push(DK.txt(kit, { x: TX(o.b) + 8, y: LY[o.lane] + 4, t: '', cls: 'sm b', anchor: 'start' }));
        });
        R.res = DK.box(kit, { x: 120, y: 288, w: 400, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const n = s.n || 0, ans = s.ans || [];
        R.v2.set({ x2: TX(10), op: n >= 1 ? 1 : 0 });
        R.v1.set({ x2: n >= 1 ? TX(2) : TX(10) }); R.t1.set('balance 1000', { x: TX(1) }); R.t2.set(n >= 1 ? 'balance 1200' : '', { tone: 'ok', x: TX(6) });
        OPS.forEach((o, i) => {
          const on = i < n, bad = ans[i] === 1000 && i > 0;
          R.bar[i].set({ x2: on ? TX(o.b) : TX(o.a), op: on ? 1 : 0, tone: bad ? 'bad' : i ? 'acc' : 'warn' });
          R.dot[i].set({ op: on ? 1 : 0, tone: bad ? 'bad' : 'acc2' });
          R.drop[i].set({ op: on && i ? 1 : 0, tone: bad ? 'bad' : 'mut' });
          R.lab[i].set(on ? (i ? '→ ' + ans[i] : 'sets 1200') : '', { tone: bad ? 'bad' : 'ink' });
        });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'The transfer completes on the leader. From the instant it takes effect, the real balance is 1200.', code: 0, callout: 'The transfer takes effect: 1200', state: { n: 1 }, stats: [{ l: 'real balance', v: '1200', cls: 'ok' }] },
      { log: 'The phone reads follower 1, which already has the write, and sees 1200.', code: 2, callout: 'Phone reads follower 1: 1200', state: { n: 2, ans: [0, 1200] }, stats: [{ l: 'phone sees', v: '1200', cls: 'ok' }] },
      { log: 'The laptop reads follower 2, which has not applied the write. It answers 1000, even though the phone has already seen 1200 and the real value is 1200.', code: 4, callout: 'Laptop reads follower 2: 1000', moment: true, state: { n: 3, ans: [0, 1200, 1000], res: 'the balance went 1000 → 1200 → 1000', resSub: 'a read returned an older value than one before it', resTone: 'bad' }, stats: [{ l: 'laptop sees', v: '1000', cls: 'bad' }],
        takeaway: 'Each follower was right for its own copy. Together the reads behave as if time ran backward.' }
    ],
    fix: [
      { log: 'The transfer is written on the leader and a majority, then takes effect. The real balance is 1200.', code: 0, callout: 'Written to a majority: 1200', state: { lin: 1, n: 1 }, stats: [{ l: 'real balance', v: '1200', cls: 'ok' }] },
      { log: 'The phone reads from the leader. First the leader asks a majority whether it is still the leader. It is, so it answers 1200.', code: 2, callout: 'Leader confirms with a majority: 1200', state: { lin: 1, n: 2, ans: [0, 1200] }, stats: [{ l: 'phone sees', v: '1200', cls: 'ok' }] },
      { log: 'The laptop’s read goes through the leader too. It starts after the phone’s read ended, so it must not see anything older, and it sees 1200.', code: 5, callout: 'Laptop reads via the leader: 1200', state: { lin: 1, n: 3, ans: [0, 1200, 1200], res: 'the balance only moves forward', resSub: 'the cost: a majority round trip per read', resTone: 'ok' }, stats: [{ l: 'laptop sees', v: '1200', cls: 'ok' }, { l: 'cost', v: 'majority check', cls: 'warn' }],
        takeaway: 'Linearizable reads cost a round trip. Use them for the operations where going backward is not acceptable.' }
    ]
  };

  /* ---------- 3. name table ---------- */
  const tableScene = {
    id: 'unique', label: 'Check, then insert',
    desc: 'Two users claim the same name. Each checks a follower, sees it free and inserts. Without a unique constraint on the leader both inserts succeed (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['user 1: is ann free? follower says free', 'user 2: is ann free? follower says free', 'user 1: insert ann, leader accepts', 'user 2: insert ann, no unique constraint, accepts'],
      fix: ['user 1: insert ann (unique), accepted', 'user 2: insert ann (unique), arrives second', 'leader: rejected, name taken']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: the name "ann" and two sign-ups at the same moment.',
      header: s => ({ left: s.uniq ? 'leader enforces UNIQUE(name)' : 'no unique constraint', right: '' }),
      setup(kit) {
        const R = {};
        R.u1 = DK.box(kit, { x: 16, y: 120, w: 120, h: 50, tone: 'acc', label: 'user 1', sub: '' });
        R.u2 = DK.box(kit, { x: 16, y: 232, w: 120, h: 50, tone: 'warn', label: 'user 2', sub: '' });
        R.f = DK.box(kit, { x: 220, y: 164, w: 130, h: 62, tone: 'none', label: 'follower', sub: 'ann: no row' });
        R.l = DK.box(kit, { x: 440, y: 100, w: 180, h: 36, r: 8, tone: 'soft', label: 'leader · table users' });
        R.r1 = DK.box(kit, { x: 440, y: 144, w: 180, h: 34, r: 6, tone: 'ok', label: 'ann → user 1', op: 0 });
        R.r2 = DK.box(kit, { x: 440, y: 184, w: 180, h: 34, r: 6, tone: 'bad', label: 'ann → user 2', op: 0 });
        R.q1 = DK.line(kit, { tone: 'acc', w: 2.4, op: 0 }); R.q2 = DK.line(kit, { tone: 'warn', w: 2.4, op: 0 });
        R.i1 = DK.line(kit, { tone: 'acc', w: 2.4, op: 0 }); R.i2 = DK.line(kit, { tone: 'warn', w: 2.4, op: 0 });
        R.d = [0, 1, 2, 3].map(() => DK.dot(kit, { r: 6, tone: 'acc2', op: 0 }));
        R.x = DK.txt(kit, { x: 500, y: 240, t: '', cls: 'sm b', anchor: 'middle' });
        R.res = DK.box(kit, { x: 150, y: 290, w: 340, h: 44, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.u1.set({ sub: s.s1 || '' }); R.u2.set({ sub: s.s2 || '' });
        DK.seg(R.q1, { x: 136, y: 145 }, { x: 220, y: 185 }, s.q1 || 0, 'acc'); DK.seg(R.q2, { x: 136, y: 257 }, { x: 220, y: 205 }, s.q2 || 0, 'warn');
        DK.seg(R.i1, { x: 136, y: 140 }, { x: 440, y: 160 }, s.i1 || 0, 'acc'); DK.seg(R.i2, { x: 136, y: 270 }, { x: 440, y: 205 }, s.i2 || 0, s.rej ? 'bad' : 'warn');
        R.r1.set({ op: s.r1 ? 1 : 0 }); R.r2.set({ op: s.r2 ? 1 : 0, tone: 'bad' });
        R.x.set(s.rej ? '✕ rejected: name taken' : '', { tone: 'bad' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'User 1 asks the follower whether the name ann is free. The follower has no such row and says it is free.', code: 0, callout: 'User 1 checks: ann is free', state: { q1: 1, s1: 'ann free?' }, stats: [{ l: 'follower says', v: 'free', cls: 'warn' }] },
      { log: 'User 2 checks the same follower at the same moment and also hears free. Neither insert has reached the follower yet.', code: 1, callout: 'User 2 checks: ann is free', state: { q1: 1, q2: 1, s1: 'ann free?', s2: 'ann free?' }, stats: [{ l: 'both told', v: 'free', cls: 'warn' }] },
      { log: 'User 1 inserts ann and the leader accepts. A second later user 2 inserts ann too. Nothing stops it, so both rows exist.', code: 3, callout: 'Both inserts accepted', moment: true, state: { q1: 1, q2: 1, i1: 1, i2: 1, r1: 1, r2: 1, s1: 'insert ann', s2: 'insert ann', res: 'two users named ann', resSub: 'the check and the insert were separate', resTone: 'bad' }, stats: [{ l: 'rows named ann', v: '2', cls: 'bad' }],
        takeaway: 'A check on a stale copy followed by a separate write is a race. Anyone can slip in between.' }
    ],
    fix: [
      { log: 'The leader enforces a unique constraint on the name. User 1 inserts ann, and it is accepted.', code: 0, callout: 'User 1: insert ann, accepted', state: { uniq: 1, i1: 1, r1: 1, s1: 'insert ann' }, stats: [{ l: 'rows named ann', v: '1', cls: 'ok' }] },
      { log: 'User 2’s insert arrives second. The leader sees a row already has this name.', code: 1, callout: 'User 2: insert ann arrives second', state: { uniq: 1, i1: 1, r1: 1, i2: 1, s1: 'insert ann', s2: 'insert ann' }, stats: [{ l: 'order', v: 'decided by the leader', cls: 'ok' }] },
      { log: 'The leader rejects it: name taken. There is one row, and user 2 is told to pick another name.', code: 2, callout: 'Rejected: name taken', state: { uniq: 1, i1: 1, r1: 1, i2: 1, rej: 1, s1: 'insert ann', s2: 'name taken', res: 'one user named ann', resSub: 'the decision happens at the leader', resTone: 'ok' }, stats: [{ l: 'rows named ann', v: '1', cls: 'ok' }],
        takeaway: 'Make the uniqueness check and the write one atomic step at the single place that decides.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[9] = { scenarios: [intervals, tableScene] };
})();
