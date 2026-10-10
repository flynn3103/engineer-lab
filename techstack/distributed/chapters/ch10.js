/* Chapter 11: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. Gantt chart ---------- */
  const TX = t => 100 + t * 10, LA = 112, LB = 164, LS = 216;
  const gantt = {
    id: 'zombie', label: 'Paused, then writes',
    desc: 'Worker A holds the lease, freezes for 40 seconds and writes after worker B has taken over. Without fencing the stale write lands (illustrative times).',
    codeLabel: 'Trace',
    code: {
      bug: ['lease until 10 s, held by A', 'A: GC pause 40 s, no code runs', 'lease expires, lock service grants B', 'B: writes total 1100', 'A wakes up, still believes it holds the lock', 'A: writes stale total 1050 over B result'],
      fix: ['lock granted to A, token 33', 'A pauses 40 s, still holds token 33', 'lease expired, lock granted to B, token 34', 'B: write total 1100 with token 34, accepted', 'A: write total 1050 with token 33, refused']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: 10 s lease, 40 s pause. Time runs left to right.',
      header: s => ({ left: s.fence ? 'storage checks the fencing token' : 'storage trusts any writer', right: s.right || '' }),
      setup(kit) {
        const R = {};
        DK.box(kit, { x: 6, y: LA - 16, w: 84, h: 32, r: 6, label: 'worker A', tone: 'acc' });
        DK.box(kit, { x: 6, y: LB - 16, w: 84, h: 32, r: 6, label: 'worker B', tone: 'warn' });
        DK.box(kit, { x: 6, y: LS - 16, w: 84, h: 32, r: 6, label: 'storage', tone: 'none' });
        [LA, LB, LS].forEach(y => DK.rule(kit, TX(0), y, TX(50), y, { dash: '3 4' }));
        DK.rule(kit, TX(0), 248, TX(50), 248, { tone: 'ink', w: 2 });
        for (let t = 0; t <= 50; t += 10) { DK.rule(kit, TX(t), 244, TX(t), 254, { tone: 'ink' }); DK.cap(kit, TX(t), 270, t + ' s', 'sm mut', 'middle'); }
        R.la = DK.line(kit, { x1: TX(0), y1: LA, x2: TX(0), y2: LA, tone: 'acc', w: 14 });
        R.laT = DK.txt(kit, { x: TX(0) + 2, y: LA - 14, t: '', cls: 'xs', anchor: 'start' });
        R.pause = DK.line(kit, { x1: TX(4), y1: LA + 20, x2: TX(4), y2: LA + 20, tone: 'mut', w: 6, dash: '4 3' });
        R.pauseT = DK.txt(kit, { x: TX(24), y: LA + 36, t: '', cls: 'xs', anchor: 'middle' });
        R.bel = DK.line(kit, { x1: TX(10), y1: LA, x2: TX(10), y2: LA, tone: 'warn', w: 14, dash: '3 3', op: 0 });
        R.belT = DK.txt(kit, { x: TX(27), y: LA - 14, t: '', cls: 'xs', anchor: 'middle' });
        R.lb = DK.line(kit, { x1: TX(10), y1: LB, x2: TX(10), y2: LB, tone: 'warn', w: 14, op: 0 });
        R.lbT = DK.txt(kit, { x: TX(10) + 2, y: LB - 14, t: '', cls: 'xs', anchor: 'start' });
        R.wB = DK.dot(kit, { x: TX(12), y: LS, r: 13, tone: 'ok', label: 'B', op: 0 });
        R.wA = DK.dot(kit, { x: TX(44), y: LS, r: 13, tone: 'bad', label: 'A', op: 0 });
        R.wBT = DK.txt(kit, { x: TX(12), y: LS - 20, t: '', cls: 'xs', anchor: 'middle' });
        R.wAT = DK.txt(kit, { x: TX(44), y: LS - 20, t: '', cls: 'xs', anchor: 'middle' });
        R.now = DK.line(kit, { x1: TX(0), y1: 92, x2: TX(0), y2: 248, tone: 'acc2', w: 2.2, dash: '5 4' });
        R.nowT = DK.txt(kit, { x: TX(0), y: 86, t: '', cls: 'sm b', anchor: 'middle' });
        R.st = DK.box(kit, { x: 120, y: 284, w: 400, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const t = s.t || 0, fence = !!s.fence;
        const m = (a, b) => Math.max(a, Math.min(b, t));
        R.la.set({ x2: TX(m(0, 10)), tone: 'acc' });
        R.laT.set(t > 0 ? (fence ? 'lease, token 33' : 'lease: 10 s') : '', { tone: 'acc' });
        R.pause.set({ x2: TX(m(4, 44)), op: t > 4 ? 1 : 0 }); R.pauseT.set(t > 6 ? 'A frozen: GC pause 40 s' : '', { tone: 'ink' });
        R.bel.set({ x2: TX(m(10, 44)), op: t > 10 ? 1 : 0 }); R.belT.set(t > 12 && t < 45 ? 'A still believes it holds the lock' : '', { tone: 'warn' });
        R.lb.set({ x2: TX(m(10, 20)), op: t > 10 ? 1 : 0 }); R.lbT.set(t > 10 ? (fence ? 'lease, token 34' : 'lease granted to B') : '', { tone: 'ink' });
        R.wB.set({ op: t >= 12 ? 1 : 0 }); R.wBT.set(t >= 12 ? (fence ? 'token 34: accepted' : 'writes 1100') : '', { tone: 'ok' });
        R.wA.set({ op: t >= 44 ? 1 : 0, label: t >= 44 && fence ? '✕' : 'A', tone: 'bad' });
        R.wAT.set(t >= 44 ? (fence ? 'token 33: refused' : 'writes 1050') : '', { tone: 'bad', x: TX(44) - 10 });
        R.now.set({ x1: TX(t), x2: TX(t) }); R.nowT.set('t = ' + t + ' s', { x: TX(t) });
        R.st.set({ op: s.view ? 1 : 0, label: s.view || '', sub: s.viewSub || '', tone: s.viewTone || 'none' });
      }
    },
    bug: [
      { log: 'Worker A holds the lock lease, which runs until 10 s. At 4 s it checks the lease, sees time left, and starts a write.', code: 0, callout: 'A holds the lease until 10 s', state: { t: 4 }, stats: [{ l: 'lease left', v: '6 s', cls: 'ok' }] },
      { log: 'A freezes for 40 seconds in a stop-the-world GC pause. No code runs, so it cannot notice time passing. At 10 s the lease expires and the lock service grants the lock to B.', code: 2, callout: 'Lease expires while A is frozen', state: { t: 10 }, stats: [{ l: 'lock holder', v: 'B', cls: 'warn' }] },
      { log: 'B writes total 1100 to storage. This is correct: B holds the lease.', code: 3, callout: 'B writes total 1100', state: { t: 12, view: 'storage: total = 1100', viewTone: 'ok' }, stats: [{ l: 'storage total', v: '1100', cls: 'ok' }] },
      { log: 'At 44 s A wakes up. Its last check said it held the lock, so it writes its stale total 1050. Storage trusts any writer and accepts it on top of B’s result. No log shows an error.', code: 5, callout: 'A wakes and writes the stale 1050', moment: true, state: { t: 44, view: 'storage: total = 1050 (stale)', viewSub: 'B’s result was overwritten', viewTone: 'bad' }, stats: [{ l: 'storage total', v: '1050', cls: 'bad' }],
        takeaway: 'A node cannot know it was paused. A lease alone does not stop a write from the past.' }
    ],
    fix: [
      { log: 'Every grant of the lock comes with a fencing token that increases each time. A gets token 33 and sends it with every write.', code: 0, callout: 'Lease + increasing token: A gets 33', state: { t: 4, fence: 1 }, stats: [{ l: 'A’s token', v: '33', cls: 'ok' }] },
      { log: 'A freezes. The lease expires and the lock service grants B the next token, 34. B writes 1100 with token 34 and storage accepts it, remembering 34 as the highest.', code: 3, callout: 'B: token 34 accepted', state: { t: 12, fence: 1, right: 'highest token seen: 34', view: 'storage: total = 1100', viewTone: 'ok' }, stats: [{ l: 'highest token', v: '34', cls: 'ok' }] },
      { log: 'A wakes up at 44 s and writes with token 33. Storage compares it with 34 and refuses the older token. The stale write never lands.', code: 4, callout: 'A: token 33 < 34, refused', state: { t: 44, fence: 1, right: 'highest token seen: 34', view: 'storage: total = 1100', viewSub: 'A’s stale write was refused', viewTone: 'ok' }, stats: [{ l: 'storage total', v: '1100', cls: 'ok' }],
        takeaway: 'Make the resource itself reject old tokens. The paused node does not have to know it was paused.' }
    ]
  };

  /* ---------- 2. lock file ---------- */
  const lockfile = {
    id: 'checkact', label: 'Check, then pause',
    desc: 'Two deploys check the same lock. A pauses between its check and its write, so both proceed. A conditional write at the lock file stops the second one (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['A: checks the lock, it is free', 'A: pauses before writing its owner record', 'B: checks, sees free, writes owner B', 'A: resumes, writes owner A over B', 'both roll out v2 on the same hosts'],
      fix: ['A: read owner none, version 7', 'B: read owner none, version 7', 'B: CAS set owner B if version 7 -> ok, now version 8', 'A: CAS set owner A if version 7 -> rejected, version is 8']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: lock file versions 7 and 8. CAS means compare-and-set.',
      header: s => ({ left: s.cas ? 'conditional write (compare-and-set)' : 'check, then write', right: '' }),
      setup(kit) {
        const R = {};
        R.a = DK.box(kit, { x: 16, y: 120, w: 150, h: 50, tone: 'acc', label: 'deploy A', sub: '' });
        R.b = DK.box(kit, { x: 474, y: 120, w: 150, h: 50, tone: 'warn', label: 'deploy B', sub: '' });
        R.f = DK.box(kit, { x: 232, y: 112, w: 176, h: 66, tone: 'none', label: 'lock file', sub: 'owner none · v7' });
        R.ac = DK.box(kit, { x: 16, y: 196, w: 150, h: 40, r: 8, tone: 'soft', label: '', sub: '', op: 0 });
        R.bc = DK.box(kit, { x: 474, y: 196, w: 150, h: 40, r: 8, tone: 'soft', label: '', sub: '', op: 0 });
        R.la = DK.line(kit, { tone: 'acc', w: 2.6, op: 0 }); R.lb = DK.line(kit, { tone: 'warn', w: 2.6, op: 0 });
        R.da = DK.dot(kit, { r: 6, tone: 'acc', op: 0 }); R.db = DK.dot(kit, { r: 6, tone: 'warn', op: 0 });
        R.z = DK.txt(kit, { x: 91, y: 108, t: '', cls: 'lg b', anchor: 'middle' });
        R.res = DK.box(kit, { x: 120, y: 268, w: 400, h: 46, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.f.set({ sub: s.file || 'owner none · v7', tone: s.ftone || 'none' });
        R.a.set({ sub: s.asub || '' }); R.b.set({ sub: s.bsub || '' });
        R.ac.set({ op: s.ac ? 1 : 0, label: s.ac || '', tone: s.act || 'soft' }); R.bc.set({ op: s.bc ? 1 : 0, label: s.bc || '', tone: s.bct || 'soft' });
        DK.seg(R.la, { x: 166, y: 145 }, { x: 232, y: 145 }, s.la || 0, s.lat || 'acc'); DK.glide(R.da, { x: 166, y: 145 }, { x: 232, y: 145 }, s.la || 0, s.lat || 'acc');
        DK.seg(R.lb, { x: 474, y: 145 }, { x: 408, y: 145 }, s.lb || 0, s.lbt || 'warn'); DK.glide(R.db, { x: 474, y: 145 }, { x: 408, y: 145 }, s.lb || 0, s.lbt || 'warn');
        R.z.set(s.zzz ? 'z z z' : '', { tone: 'mut' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Deploy A checks the lock file. It says owner none, so A decides it may proceed.', code: 0, callout: 'A checks: the lock is free', state: { la: 1, ac: 'read: owner none' }, stats: [{ l: 'A believes', v: 'free', cls: 'ok' }] },
      { log: 'A pauses before it writes its owner record. The check is now stale, but A does not know that.', code: 1, callout: 'A pauses between check and write', state: { zzz: 1, ac: 'read: none (stale)', act: 'warn', asub: 'paused' }, stats: [{ l: 'A', v: 'paused', cls: 'warn' }] },
      { log: 'B checks, sees free, and writes owner B. The lock file now says B.', code: 2, callout: 'B checks, writes owner B', state: { zzz: 1, ac: 'read: owner none', act: 'warn', asub: 'paused', lb: 1, bc: 'wrote owner B', bct: 'ok', file: 'owner B', ftone: 'warn' }, stats: [{ l: 'lock owner', v: 'B', cls: 'warn' }] },
      { log: 'A resumes and writes owner A over B. Both deploys believe they own the lock and roll out v2 on the same hosts.', code: 3, callout: 'Both own the lock', moment: true, state: { la: 1, lat: 'bad', ac: 'wrote owner A', act: 'bad', lb: 1, bc: 'wrote owner B', bct: 'bad', file: 'owner A', ftone: 'bad', res: 'both roll out v2 on the same hosts', resTone: 'bad' }, stats: [{ l: 'deploys running', v: '2', cls: 'bad' }],
        takeaway: 'A check followed by a write has a gap. Anyone can act in the gap, including a paused node.' }
    ],
    fix: [
      { log: 'Both deploys read the lock file. Each sees owner none at version 7.', code: 0, callout: 'A and B both read: none, v7', state: { cas: 1, la: 1, lb: 1, ac: 'read: none, v7', bc: 'read: none, v7' }, stats: [{ l: 'version read', v: '7 by both', cls: 'warn' }] },
      { log: 'B writes with a condition: set owner B only if the version is still 7. It is, so the write succeeds and the version becomes 8.', code: 2, callout: 'B: CAS if v7 → ok, now v8', state: { cas: 1, la: 1, lb: 1, ac: 'read: none, v7', bc: 'CAS v7: accepted', bct: 'ok', file: 'owner B · v8', ftone: 'ok' }, stats: [{ l: 'lock owner', v: 'B, v8', cls: 'ok' }] },
      { log: 'A resumes and writes with the same condition, version 7. The file is at 8, so the write is rejected.', code: 3, callout: 'A: CAS if v7 → rejected, file is v8', state: { cas: 1, la: 1, lat: 'bad', ac: 'CAS v7: rejected', act: 'bad', lb: 1, bc: 'CAS v7: accepted', bct: 'ok', file: 'owner B · v8', ftone: 'ok', res: 'only B rolls out', resSub: 'A learns it lost the race', resTone: 'ok' }, stats: [{ l: 'deploys running', v: '1', cls: 'ok' }],
        takeaway: 'Make the check and the write one atomic step at the resource, using a version.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[10] = { scenarios: [gantt, lockfile] };
})();
