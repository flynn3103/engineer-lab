/* Chapter 13: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. phase columns ---------- */
  const CO = { x: 220, y: 92, w: 170, h: 44 }, LG = { x: 440, y: 92, w: 170, h: 44 };
  const PS = [{ x: 40, y: 224, w: 200, h: 60, n: 'shard 1', t: 'debit A' }, { x: 380, y: 224, w: 200, h: 60, n: 'shard 2', t: 'credit B' }];
  const pc = (p, side) => ({ x: p.x + p.w / 2 + (side || 0), y: p.y });
  const cb = { x: 305, y: 136 };
  const phases = {
    id: 'coordcrash', label: 'The coordinator crashes',
    desc: 'Both shards vote yes, then the coordinator crashes before it writes its decision. The shards hold their locks until it recovers (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['prepare: debit A on shard 1, credit B on shard 2', 'shard 1: yes, shard 2: yes (both locked)', 'coordinator: crashes before writing COMMIT', 'shard 1 and shard 2: in doubt, cannot decide alone', 'accounts A and B stay locked until recovery'],
      fix: ['coordinator restarts and reads its decision log', 'log has COMMIT: resend commit to both shards', 'log is empty: presumed abort, nothing was sent', 'locks released, transfer is all-or-nothing']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative. A shard that voted yes has promised to commit if told to.',
      header: s => ({ left: 'two-phase commit', right: s.phase || '' }),
      setup(kit) {
        const R = { p: [], lock: [], d1: [], d2: [], line: [] };
        R.co = DK.box(kit, { ...CO, label: 'coordinator', sub: '', tone: 'acc' });
        R.lg = DK.box(kit, { ...LG, label: 'decision log', sub: 'empty', tone: 'soft' });
        PS.forEach((p, i) => {
          R.p.push(DK.box(kit, { ...p, label: p.n + ' · ' + p.t, sub: 'idle', tone: 'none' }));
          R.lock.push(DK.box(kit, { x: p.x + 40, y: p.y + 76, w: 120, h: 28, r: 8, label: '', tone: 'bad', op: 0 }));
          R.line.push(DK.line(kit, { x1: cb.x + (i ? 30 : -30), y1: cb.y, x2: pc(p).x, y2: p.y, tone: 'mut', w: 1.6, dash: '3 4' }));
          R.d1.push(DK.dot(kit, { r: 7, tone: 'acc2', op: 0 })); R.d2.push(DK.dot(kit, { r: 7, tone: 'ok', op: 0 }));
        });
        R.x = DK.txt(kit, { x: 305, y: 124, t: '', cls: 'lg b', anchor: 'middle' });
        R.res = DK.box(kit, { x: 120, y: 310, w: 400, h: 34, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.co.set({ tone: s.dead ? 'bad' : 'acc', op: s.dead ? 0.55 : 1, sub: s.dead ? 'crashed' : s.cosub || '' });
        R.lg.set({ sub: s.log || 'empty', tone: s.log === 'COMMIT' ? 'ok' : 'soft' });
        PS.forEach((p, i) => {
          const st = (s.st || ['idle', 'idle'])[i];
          R.p[i].set({ sub: st, tone: st === 'prepared' ? 'warn' : st === 'committed' ? 'ok' : st === 'aborted' ? 'soft' : 'none', hl: st === 'prepared' && s.dead });
          R.lock[i].set({ op: s.lock && s.lock[i] ? 1 : 0, label: s.lock && s.lock[i] ? (i ? 'account B locked' : 'account A locked') : '' });
          const a = { x: cb.x + (i ? 30 : -30), y: cb.y }, b = { x: pc(PS[i]).x, y: PS[i].y };
          DK.glide(R.d1[i], a, b, (s.down || [0, 0])[i], 'acc2', ''); DK.glide(R.d2[i], b, a, (s.up || [0, 0])[i], 'ok', '');
          R.d1[i].set({ label: (s.dl || '')[0] || '' }); R.d2[i].set({ label: (s.ul || '')[0] || '' });
        });
        R.x.set(s.dead ? '✕' : '', { tone: 'bad' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Phase 1: the coordinator sends prepare to both shards. Each shard checks it can do its part, locks its account, and writes that it is prepared.', code: 0, callout: 'Prepare: shards lock their accounts', state: { phase: 'phase 1: prepare', down: [1, 1], dl: 'p', st: ['prepared', 'prepared'], lock: [1, 1] }, stats: [{ l: 'locks held', v: '2', cls: 'warn' }] },
      { log: 'Both shards vote yes. A yes is a promise: from now on the shard may not abort on its own.', code: 1, callout: 'Both vote yes: a binding promise', state: { phase: 'phase 1: votes', up: [1, 1], ul: 'y', st: ['prepared', 'prepared'], lock: [1, 1] }, stats: [{ l: 'votes', v: '2 yes', cls: 'ok' }] },
      { log: 'The coordinator crashes before it writes COMMIT to its decision log. The shards are prepared and cannot reach any decision themselves.', code: 2, callout: 'Coordinator dies before deciding', moment: true, state: { phase: 'phase 2: no decision', dead: 1, st: ['prepared', 'prepared'], lock: [1, 1] }, stats: [{ l: 'coordinator', v: 'down', cls: 'bad' }] },
      { log: 'If a shard commits it might disagree with the other, and if it aborts it might break its promise. It cannot ask the other shard what it knows. It must wait, in doubt.', code: 3, callout: 'In doubt: the shards must wait', state: { phase: 'in doubt', dead: 1, st: ['prepared', 'prepared'], lock: [1, 1] }, stats: [{ l: 'shard state', v: 'in doubt', cls: 'bad' }] },
      { log: 'Accounts A and B stay locked until the coordinator recovers. Every other transaction that touches them queues behind these locks.', code: 4, callout: 'Locks held until recovery', state: { phase: 'blocked', dead: 1, st: ['prepared', 'prepared'], lock: [1, 1], res: 'A and B are blocked', resSub: 'for as long as the coordinator is down', resTone: 'bad' }, stats: [{ l: 'blocked', v: 'accounts A and B', cls: 'bad' }],
        takeaway: 'A prepared shard missing the decision must recover it; a timeout alone cannot choose commit or abort.' }
    ],
    fix: [
      { log: 'The coordinator restarts and reads its decision log. The log is on disk, so it survives the crash.', code: 0, callout: 'Recovery: read the decision log', state: { phase: 'recovery', cosub: 'reading log', st: ['prepared', 'prepared'], lock: [1, 1], log: 'COMMIT' }, stats: [{ l: 'log', v: 'COMMIT', cls: 'ok' }] },
      { log: 'The log says COMMIT, so the coordinator sends commit to both shards again. Commit messages can be repeated safely.', code: 1, callout: 'Log says COMMIT: resend commit', state: { phase: 'phase 2: commit', cosub: 'resending', down: [1, 1], dl: 'c', st: ['prepared', 'prepared'], lock: [1, 1], log: 'COMMIT' }, stats: [{ l: 'commit sent to', v: 'both shards', cls: 'ok' }] },
      { log: 'Both shards commit and release their locks. If the log had been empty, the rule is presumed abort: nothing was ever promised to the client, so the coordinator tells the shards to abort.', code: 3, callout: 'Both commit, locks released', state: { phase: 'done', st: ['committed', 'committed'], lock: [0, 0], log: 'COMMIT', res: 'all or nothing', resSub: 'the transfer is atomic across both shards', resTone: 'ok' }, stats: [{ l: 'locks held', v: '0', cls: 'ok' }],
        takeaway: 'The coordinator must write its decision to disk before it tells anyone. Recovery reads it back.' }
    ]
  };

  /* ---------- 2. ledger ---------- */
  const ledger = {
    id: 'dualwrite', label: 'Two writes, no record',
    desc: 'The service debits shard 1 and credits shard 2 in two calls. The credit times out, a retry runs the debit again, and nothing links the writes (illustrative balances).',
    codeLabel: 'Trace',
    code: {
      bug: ['shard 1: debit A 100 (500 -> 400)', 'shard 2: credit B 100 (timeout)', 'service: retry the whole request', 'shard 1: debit A 100 again (400 -> 300)', 'no transfer ID recorded, nothing can undo it', 'reconciliation: gap found days later'],
      fix: ['record transfer 7731 (intent) before any write', 'shard 1: debit A 100, id 7731', 'shard 2: credit B 100, id 7731 (retry is a no-op)', 'reconciliation: pending transfers only']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: transfer of 100 from account A (shard 1) to account B (shard 2).',
      header: s => ({ left: s.id ? 'transfers carry an id' : 'two independent calls', right: '' }),
      setup(kit) {
        const R = { j: [] };
        R.a = DK.box(kit, { x: 20, y: 110, w: 170, h: 70, tone: 'acc', label: 'account A · shard 1', sub: 'balance 500' });
        R.b = DK.box(kit, { x: 450, y: 110, w: 170, h: 70, tone: 'warn', label: 'account B · shard 2', sub: 'balance 500' });
        R.svc = DK.box(kit, { x: 235, y: 100, w: 170, h: 44, tone: 'none', label: 'payment service', sub: '' });
        R.l1 = DK.line(kit, { tone: 'acc', w: 2.6, op: 0 }); R.l2 = DK.line(kit, { tone: 'warn', w: 2.6, op: 0 });
        R.x2 = DK.txt(kit, { x: 430, y: 150, t: '', cls: 'sm b', anchor: 'middle' });
        DK.cap(kit, 20, 214, 'transfer journal', 'sm mut');
        for (let i = 0; i < 4; i++) R.j.push(DK.box(kit, { x: 20 + (i % 2) * 300, y: 224 + Math.floor(i / 2) * 36, w: 290, h: 30, r: 6, label: '', tone: 'soft', op: 0 }));
        R.res = DK.box(kit, { x: 120, y: 304, w: 400, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.a.set({ sub: 'balance ' + (s.A || 500), tone: (s.A || 500) < 400 && !s.id ? 'bad' : 'acc' }); R.b.set({ sub: 'balance ' + (s.B || 500), tone: s.Bbad ? 'bad' : 'warn' });
        R.svc.set({ sub: s.say || '' });
        DK.seg(R.l1, { x: 235, y: 122 }, { x: 190, y: 140 }, s.c1 || 0, s.c1t || 'acc'); DK.seg(R.l2, { x: 405, y: 122 }, { x: 450, y: 140 }, s.c2 || 0, s.c2t || 'warn');
        R.x2.set(s.timeout ? '✕ timeout' : '', { tone: 'bad' });
        R.j.forEach((b, i) => { const r = (s.j || [])[i]; b.set({ op: r ? 1 : 0, label: r ? r[0] : '', tone: r ? r[1] : 'soft' }); });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'The service debits account A on shard 1. The balance goes from 500 to 400.', code: 0, callout: 'Debit A: 500 → 400', state: { A: 400, c1: 1, say: 'debit A 100' }, stats: [{ l: 'A', v: '400', cls: 'ok' }] },
      { log: 'It then credits account B on shard 2, but the call times out. The service does not know if the credit happened.', code: 1, callout: 'Credit B times out', state: { A: 400, c1: 1, c2: 1, c2t: 'bad', timeout: 1, say: 'credit B 100', Bbad: 0 }, stats: [{ l: 'credit', v: 'unknown', cls: 'warn' }] },
      { log: 'The service retries the whole request, so shard 1 debits A again. The balance goes from 400 to 300. Nothing links this debit to the first one.', code: 3, callout: 'Retry debits A again: 300', moment: true, state: { A: 300, c1: 1, c2: 1, c2t: 'bad', timeout: 1, say: 'retry whole request' }, stats: [{ l: 'A', v: '300', cls: 'bad' }] },
      { log: 'No transfer id was recorded, so nothing can tell that the second debit was a repeat. The gap shows up in reconciliation days later.', code: 5, callout: 'No record: found days later', state: { A: 300, B: 500, c1: 1, say: 'done?', j: [['debit A 100 (no id)', 'bad'], ['debit A 100 (no id)', 'bad']], res: 'A lost 200, B gained 0', resSub: 'there is no way to tell which debit was a retry', resTone: 'bad' }, stats: [{ l: 'unexplained', v: '200', cls: 'bad' }],
        takeaway: 'Two separate writes are not one transaction. A retry of the whole request repeats the writes that worked.' }
    ],
    fix: [
      { log: 'Before any write, the service records the transfer intent with an id, 7731, in a journal.', code: 0, callout: 'Record intent: transfer 7731', state: { id: 1, say: 'transfer 7731', j: [['7731: A → B 100, pending', 'warn']] }, stats: [{ l: 'journal', v: '7731 pending', cls: 'ok' }] },
      { log: 'The debit carries id 7731, so shard 1 applies it once and remembers the id. A goes to 400.', code: 1, callout: 'Debit A with id 7731: 400', state: { id: 1, A: 400, c1: 1, say: 'debit A, id 7731', j: [['7731: A → B 100, pending', 'warn'], ['7731: debit A done', 'ok']] }, stats: [{ l: 'A', v: '400', cls: 'ok' }] },
      { log: 'The credit to B times out. The retry carries the same id, so any step that already ran is a no-op and the credit that did not run is applied.', code: 2, callout: 'Retry with id 7731: no double debit', state: { id: 1, A: 400, B: 600, c1: 1, c2: 1, timeout: 1, say: 'retry, id 7731', j: [['7731: A → B 100, pending', 'warn'], ['7731: debit A done', 'ok'], ['7731: debit A again: no-op', 'ok'], ['7731: credit B done', 'ok']] }, stats: [{ l: 'A / B', v: '400 / 600', cls: 'ok' }] },
      { log: 'Reconciliation only looks at transfers still pending in the journal. Every step has an id, so a gap is found in minutes, not days.', code: 3, callout: 'Reconcile pending transfers only', state: { id: 1, A: 400, B: 600, say: 'transfer 7731 complete', j: [['7731: A → B 100, complete', 'ok']], res: 'one transfer, applied once', resSub: 'every step is traceable by id', resTone: 'ok' }, stats: [{ l: 'unexplained', v: '0', cls: 'ok' }],
        takeaway: 'A durable intent and idempotent steps support recovery; they do not automatically hide partial transfer state.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[12] = { scenarios: [phases, ledger] };
})();
