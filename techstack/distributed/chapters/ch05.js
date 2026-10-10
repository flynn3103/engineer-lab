/* Chapter 6: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. log strips ---------- */
  const CX = 150, CW = 38, CG = 5, ENT = [8808, 8809, 8810, 8811, 8812];
  const ROW = { P: 108, R1: 160, R2: 212 };
  const cx = i => CX + i * (CW + CG);
  const strips = {
    id: 'async', label: 'Async loses an order',
    desc: 'The primary answers OK before any replica has the entry. It crashes, and the confirmed order is gone (illustrative).',
    codeLabel: 'Log',
    code: {
      bug: ['PUT order 8812', 'primary: append #8812 (local log only)', 'OK 8812', 'ship #8812 to replica (still in flight)', 'primary: CRASH, disk unreadable', 'promote replica: log ends at #8811', 'GET order 8812  ->  not found'],
      fix: ['PUT order 8812', 'primary: append #8812, hold the reply', 'ship #8812 -> replica: ack', 'primary: OK 8812 (2 copies)', 'primary: CRASH', 'GET order 8812  ->  found']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative entries #8808 to #8812. Replica 2 is a lagging, asynchronous copy.',
      header: s => ({ left: s.sync ? 'semi-synchronous: wait for one replica' : 'asynchronous: answer first', right: s.right || '' }),
      setup(kit) {
        const R = { lab: {}, cell: { P: [], R1: [], R2: [] } };
        R.lab.P = DK.box(kit, { x: 20, y: ROW.P, w: 112, h: 32, label: 'primary', tone: 'acc' });
        R.lab.R1 = DK.box(kit, { x: 20, y: ROW.R1, w: 112, h: 32, label: 'replica 1', tone: 'none' });
        R.lab.R2 = DK.box(kit, { x: 20, y: ROW.R2, w: 112, h: 32, label: 'replica 2', tone: 'none' });
        DK.cap(kit, CX, 96, 'replication log, one box per entry', 'xs mut');
        for (const k of ['P', 'R1', 'R2']) ENT.forEach((e, i) => R.cell[k].push(DK.box(kit, { x: cx(i), y: ROW[k], w: CW, h: 32, r: 6, label: String(e).slice(2), tone: 'soft', op: 0.3, dash: '3 3' })));
        R.tail = DK.line(kit, { x1: cx(4), y1: ROW.P + 40, x2: cx(4) + CW, y2: ROW.P + 40, tone: 'bad', w: 4, op: 0 });
        R.tailL = DK.txt(kit, { x: cx(4) + CW + 8, y: ROW.P + 24, t: '', cls: 'xs', anchor: 'start' });
        R.ship = DK.dot(kit, { r: 6, tone: 'acc2' });
        R.rec = DK.box(kit, { x: 410, y: 262, w: 210, h: 36, tone: 'ok', label: 'client holds a receipt', sub: 'OK 8812', op: 0 });
        R.get = DK.box(kit, { x: 410, y: 306, w: 210, h: 36, tone: 'bad', label: 'GET order 8812', sub: '', op: 0 });
        R.x = DK.txt(kit, { x: 76, y: ROW.P + 52, t: '', cls: 'sm b', anchor: 'middle' });
        R.crown = DK.box(kit, { x: 410, y: ROW.R1, w: 210, h: 32, tone: 'ok', label: 'promoted: new primary', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const n = { P: s.p || 0, R1: s.r1 || 0, R2: s.r2 || 0 };
        for (const k of ['P', 'R1', 'R2']) R.cell[k].forEach((c, i) => {
          const has = i < n[k], lone = i === 4 && n.P > 4 && n.R1 < 5 && n.R2 < 5;
          c.set({ op: has ? 1 : 0.3, tone: has ? (lone ? 'warn' : 'ok') : 'soft', dash: has ? '' : '3 3' });
        });
        const dead = !!s.crash;
        R.lab.P.set({ op: dead ? 0.45 : 1, tone: dead ? 'bad' : 'acc', label: dead ? 'primary ✕' : 'primary', sub: '' });
        R.lab.R1.set({ tone: s.promoted ? 'ok' : 'none', label: s.promoted ? 'R1 → primary' : 'replica 1' });
        R.cell.P.forEach(c => c.g.style.opacity = c.st.op * (dead ? 0.45 : 1));
        const lone = n.P > 4 && n.R1 < 5 && n.R2 < 5;
        R.tail.set({ op: lone && !dead ? 1 : 0 });
        R.tailL.set(lone && !dead ? '← only on the primary' : '', { tone: 'bad' });
        DK.glide(R.ship, { x: cx(4) + CW / 2, y: ROW.P + 16 }, { x: cx(4) + CW / 2, y: ROW.R1 + 16 }, s.ship || 0, 'acc2');
        R.rec.set({ op: s.rec ? 1 : 0 });
        R.get.set({ op: s.get ? 1 : 0, tone: s.get === 'found' ? 'ok' : 'bad', sub: s.get === 'found' ? 'found' : 'not found', label: 'GET order 8812' });
        R.x.set(dead ? '✕ disk unreadable' : '', { tone: 'bad' });
      }
    },
    bug: [
      { log: 'The client sends PUT order 8812. The primary appends #8812 to its own log. No replica has it yet, so this entry is the unreplicated tail.', code: 1, callout: 'Appended on the primary only', state: { p: 5, r1: 4, r2: 3 }, stats: [{ l: 'copies of #8812', v: '1', cls: 'warn' }] },
      { log: 'The primary answers OK at once, which is the asynchronous choice. The client now holds a receipt.', code: 2, callout: 'OK sent before any replica has it', state: { p: 5, r1: 4, r2: 3, rec: 1 }, stats: [{ l: 'copies of #8812', v: '1', cls: 'warn' }] },
      { log: 'The shipment of #8812 is still in flight when the primary crashes. Its disk is unreadable, so #8812 exists nowhere else.', code: 4, callout: 'Crash while the entry is in flight', moment: true, state: { p: 5, r1: 4, r2: 3, rec: 1, ship: 0.45, crash: 1 }, stats: [{ l: 'copies of #8812', v: '0', cls: 'bad' }] },
      { log: 'Failover promotes replica 1, the one with the newest log. Its log ends at #8811.', code: 5, callout: 'Promote replica 1: the log ends at #8811', state: { p: 5, r1: 4, r2: 3, rec: 1, crash: 1, promoted: 1 }, stats: [{ l: 'new primary log ends', v: '#8811', cls: 'bad' }] },
      { log: 'The client asks for the order it was told about. The new primary returns not found.', code: 6, callout: 'The receipt and the database disagree', moment: true, state: { p: 5, r1: 4, r2: 3, rec: 1, crash: 1, promoted: 1, get: 'lost' }, stats: [{ l: 'customer sees', v: 'OK, then not found', cls: 'bad' }],
        takeaway: 'The loss window is the unreplicated tail at the moment of the crash.' }
    ],
    fix: [
      { log: 'Semi-synchronous: the primary appends #8812 but holds the reply until a replica confirms.', code: 1, callout: 'Append, then hold the reply', state: { sync: 1, p: 5, r1: 4, r2: 3 }, stats: [{ l: 'copies before OK', v: '1', cls: 'warn' }] },
      { log: 'The entry is shipped to replica 1, which stores it and acknowledges. Two machines now have #8812.', code: 2, callout: 'Replica 1 stores #8812 and acknowledges', state: { sync: 1, p: 5, r1: 5, r2: 3, ship: 1 }, stats: [{ l: 'copies before OK', v: '2', cls: 'ok' }] },
      { log: 'Only now does the primary send OK 8812. The receipt is backed by two machines.', code: 3, callout: 'OK 8812 backed by 2 copies', state: { sync: 1, p: 5, r1: 5, r2: 3, rec: 1 }, stats: [{ l: 'copies before OK', v: '2', cls: 'ok' }] },
      { log: 'The primary crashes. Replica 1 holds #8812 and has the newest log, so it can safely become primary.', code: 4, callout: 'Crash: replica 1 already has #8812', state: { sync: 1, p: 5, r1: 5, r2: 3, rec: 1, crash: 1, promoted: 1 }, stats: [{ l: 'new primary log ends', v: '#8812', cls: 'ok' }] },
      { log: 'GET order 8812 returns found. The receipt and the database agree.', code: 5, callout: 'The receipt and the database agree', state: { sync: 1, p: 5, r1: 5, r2: 3, rec: 1, crash: 1, promoted: 1, get: 'found' }, stats: [{ l: 'customer sees', v: 'OK, then found', cls: 'ok' }],
        takeaway: 'In this failure, the acknowledging follower preserves the order. Other failover choices need their own safety rules.' }
    ]
  };

  /* ---------- 2. position ruler ---------- */
  const RX = p => 70 + (p - 94) * (500 / 6);
  const ruler = {
    id: 'highest', label: 'Pick the newest replica',
    desc: 'The same crash, but now the question is which replica to promote. Here the surviving logs are prefixes of one history. Compare their positions (illustrative).',
    codeLabel: 'Script',
    code: {
      bug: ['script: first replica to answer wins', 'A: log 1..97 (answered first)', 'promote A -> primary', 'acked 98, 99, 100 are missing on A', 'B rejoins: its 98..100 are rolled back'],
      fix: ['script: ask every replica for its position', 'A: position 97', 'B: position 100', 'promote B (highest position)', 'A replays 98..100 from B']
    },
    stage: {
      w: W, h: H, footer: 'One compatible history; illustrative positions. The primary acknowledged up to 100.',
      header: s => ({ left: 'log position ruler', right: s.right || '' }),
      setup(kit) {
        const R = {};
        DK.rule(kit, RX(94), 186, RX(100), 186, { tone: 'ink', w: 2.4 });
        for (let p = 94; p <= 100; p++) { DK.rule(kit, RX(p), 180, RX(p), 192, { tone: 'ink' }); DK.cap(kit, RX(p), 208, String(p), 'sm mut', 'middle'); }
        R.gap = DK.line(kit, { x1: RX(97), y1: 186, x2: RX(97), y2: 186, tone: 'bad', w: 11, op: 0 });
        R.gapL = DK.txt(kit, { x: RX(98.5), y: 170, t: '', cls: 'sm b', anchor: 'middle' });
        R.ack = DK.box(kit, { x: RX(100) - 66, y: 100, w: 132, h: 40, tone: 'acc', label: 'primary', sub: 'acked up to 100' });
        R.ackLine = DK.rule(kit, RX(100), 140, RX(100), 180, { tone: 'acc', dash: '3 3' });
        R.A = DK.box(kit, { x: RX(97) - 56, y: 240, w: 112, h: 40, tone: 'none', label: 'replica A', sub: 'position 97' });
        R.B = DK.box(kit, { x: RX(100) - 56, y: 292, w: 112, h: 40, tone: 'none', label: 'replica B', sub: 'position 100' });
        R.stemA = DK.line(kit, { x1: RX(97), y1: 240, x2: RX(97), y2: 192, tone: 'mut', w: 1.6 });
        R.stemB = DK.line(kit, { x1: RX(100), y1: 292, x2: RX(100), y2: 192, tone: 'mut', w: 1.6 });
        R.pick = DK.txt(kit, { x: 20, y: 330, t: '', cls: 'sm b', anchor: 'start' });
        return R;
      },
      frame(s, kit, R) {
        const a = s.a == null ? 97 : s.a, b = s.b == null ? 100 : s.b;
        R.A.set({ x: RX(a) - 56, tone: s.crown === 'A' ? 'ok' : s.dim === 'A' ? 'warn' : 'none', label: s.crown === 'A' ? 'A → primary' : 'replica A', sub: 'position ' + a });
        R.B.set({ x: RX(b) - 56, tone: s.crown === 'B' ? 'ok' : s.dim === 'B' ? 'warn' : 'none', label: s.crown === 'B' ? 'B → primary' : 'replica B', sub: 'position ' + b });
        R.stemA.set({ x1: RX(a), x2: RX(a) });
        R.stemB.set({ x1: RX(b), x2: RX(b) });
        const top = s.crown === 'A' ? a : null;
        R.gap.set({ x1: RX(a), x2: top != null ? RX(100) : RX(a), op: top != null ? 1 : 0 });
        R.gapL.set(top != null ? '98, 99, 100 acked, now missing' : '', { tone: 'bad', op: top != null ? 1 : 0 });
        R.pick.set(s.pick || '', { tone: s.pickTone || 'ink' });
      }
    },
    bug: [
      { log: 'The primary had acknowledged writes up to position 100 when it died. Replica A is at 97, replica B is at 100, and the failover script has not looked at either position.', code: 0, callout: 'Which replica to promote?', state: { pick: 'the script only waits for an answer' }, stats: [{ l: 'acked', v: 'up to 100', cls: 'warn' }] },
      { log: 'Replica A answers first, so the script promotes it. Positions 98, 99 and 100 were acknowledged to clients but A does not hold them.', code: 2, callout: 'First to answer wins: A at 97', moment: true, state: { crown: 'A', pick: 'A answered first' }, stats: [{ l: 'new primary position', v: '97', cls: 'bad' }, { l: 'acked but missing', v: '3', cls: 'bad' }] },
      { log: 'Replica B rejoins as a follower. Its entries 98 to 100 do not exist on the new primary, so they are rolled back to match.', code: 4, callout: 'B follows A: its 98 to 100 are discarded', state: { crown: 'A', a: 97, b: 97, pick: 'B truncates to 97', pickTone: 'bad' }, stats: [{ l: 'acked writes lost', v: '3', cls: 'bad' }],
        takeaway: 'Failover that does not compare log positions silently discards acknowledged writes.' }
    ],
    fix: [
      { log: 'The script asks every surviving replica for its log position before it promotes anybody.', code: 0, callout: 'Ask every replica: what is your position?', state: { dim: 'A', pick: 'A: 97 · B: 100' }, stats: [{ l: 'A', v: '97', cls: 'warn' }, { l: 'B', v: '100', cls: 'ok' }] },
      { log: 'B has the highest position, 100, so B is promoted. Every acknowledged entry up to 100 survives.', code: 3, callout: 'Promote the highest position: B', state: { crown: 'B', pick: 'B holds everything acked' }, stats: [{ l: 'new primary position', v: '100', cls: 'ok' }] },
      { log: 'A follows B and replays entries 98 to 100 from B until it catches up.', code: 4, callout: 'A replays 98 to 100 from B', state: { crown: 'B', a: 100, pick: 'A caught up from B' }, stats: [{ l: 'A', v: '100', cls: 'ok' }, { l: 'acked writes lost', v: '0', cls: 'ok' }],
        takeaway: 'For these compatible prefixes, choose B at 100. General elections also need term and commitment rules.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[5] = { scenarios: [strips, ruler] };
})();
