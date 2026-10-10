/* Chapter 8: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 2. ID tape ---------- */
  const MX = ms => 60 + (ms - 940) * 8, AXY = 268;
  const tape = {
    id: 'idgen', label: 'The clock steps back',
    desc: 'An ID generator packs the wall-clock millisecond into each ID. After an NTP step back it issues an ID it already issued (illustrative ids).',
    codeLabel: 'Trace',
    code: {
      bug: ['issue 1000-3-0 to row 1 (counter 0)', 'NTP: clock steps back 50 ms, now 950', 'clock 950: counter resets, issue 950-3-0', 'clock reaches 1000 again, counter 0', 'issue 1000-3-0 again: duplicate key'],
      fix: ['issue 1000-3-0, high-water mark 1000', 'NTP: clock steps back to 950, below 1000', 'generator waits until the clock passes 1000', 'issue 1001-3-0, high-water mark 1001']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: id = millisecond, worker 3, counter. Axis: generator clock.',
      header: s => ({ left: s.hwm ? 'generator keeps a high-water mark' : 'generator trusts the clock', right: '' }),
      setup(kit) {
        const R = { chip: [] };
        DK.rule(kit, MX(940), AXY, MX(1010), AXY, { tone: 'ink', w: 2 });
        for (let ms = 940; ms <= 1010; ms += 10) { DK.rule(kit, MX(ms), AXY - 5, MX(ms), AXY + 5, { tone: 'ink' }); DK.cap(kit, MX(ms), AXY + 22, String(ms), 'sm mut', 'middle'); }
        R.ptr = DK.dot(kit, { x: MX(1000), y: AXY, r: 9, tone: 'acc2', op: 0 });
        R.ptrT = DK.txt(kit, { x: MX(1000), y: AXY - 18, t: '', cls: 'sm b', anchor: 'middle' });
        R.step = DK.line(kit, { x1: MX(1000), y1: AXY - 36, x2: MX(950), y2: AXY - 36, tone: 'bad', w: 3, op: 0 });
        R.stepT = DK.txt(kit, { x: MX(975), y: AXY - 44, t: '', cls: 'sm b', anchor: 'middle' });
        R.hw = DK.line(kit, { x1: MX(1000), y1: 96, x2: MX(1000), y2: AXY, tone: 'ok', w: 2.4, dash: '6 4', op: 0 });
        R.hwT = DK.txt(kit, { x: MX(1000), y: 90, t: '', cls: 'xs b', anchor: 'middle' });
        for (let i = 0; i < 4; i++) R.chip.push(DK.box(kit, { x: 0, y: 108 + i * 34, w: 86, h: 26, r: 6, label: '', tone: 'ok', op: 0 }));
        R.dup = DK.line(kit, { x1: MX(1000), y1: 130, x2: MX(1000), y2: 130, tone: 'bad', w: 3, op: 0 });
        R.res = DK.box(kit, { x: 120, y: 306, w: 400, h: 34, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.ptr.set({ x: MX(s.now || 1000), op: s.now ? 1 : 0, tone: s.wait ? 'warn' : 'acc2' });
        R.ptrT.set(s.now ? 'clock ' + s.now : '', { x: MX(s.now || 1000) });
        R.step.set({ op: s.stepped ? 1 : 0 }); R.stepT.set(s.stepped ? 'NTP: back 50 ms' : '', { tone: 'bad' });
        R.hw.set({ op: s.hwm ? 1 : 0 }); R.hwT.set(s.hwm ? 'high-water mark ' + s.hwm : '', { tone: 'ok', x: MX(s.hwm || 1000) });
        R.hw.set({ x1: MX(s.hwm || 1000), x2: MX(s.hwm || 1000) });
        const ch = s.ids || [];
        R.chip.forEach((c, i) => { const e = ch[i]; c.set({ op: e ? 1 : 0, x: e ? Math.min(MX(e.ms) - 43, 548) : 0, y: 108 + i * 34, label: e ? e.id : '', tone: e && e.bad ? 'bad' : 'ok' }); });
        const dupI = ch.findIndex(e => e.bad);
        R.dup.set({ op: dupI > 0 ? 1 : 0, x1: MX(1000), x2: MX(1000), y1: 134, y2: 108 + dupI * 34 });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'The generator reads its clock, 1000 ms, and issues id 1000-3-0: the millisecond, worker 3, and counter 0.', code: 0, callout: 'Clock 1000: issue 1000-3-0', state: { now: 1000, ids: [{ ms: 1000, id: '1000-3-0' }] }, stats: [{ l: 'issued', v: '1000-3-0', cls: 'ok' }] },
      { log: 'NTP corrects the clock by stepping it back 50 ms. The generator now reads 950 and issues 950-3-0, because the counter resets for a new millisecond.', code: 2, callout: 'NTP steps the clock back to 950', state: { now: 950, stepped: 1, ids: [{ ms: 1000, id: '1000-3-0' }, { ms: 950, id: '950-3-0' }] }, stats: [{ l: 'clock', v: '950', cls: 'warn' }] },
      { log: 'The clock climbs and reaches 1000 again. This millisecond’s counter starts at 0, so the generator issues 1000-3-0 for a second time.', code: 4, callout: 'Same millisecond again: duplicate id', moment: true, state: { now: 1000, stepped: 1, ids: [{ ms: 1000, id: '1000-3-0' }, { ms: 950, id: '950-3-0' }, { ms: 1000, id: '1000-3-0', bad: 1 }], res: 'duplicate primary key', resSub: '1000-3-0 issued twice', resTone: 'bad' }, stats: [{ l: 'duplicate', v: '1000-3-0', cls: 'bad' }],
        takeaway: 'Wall clocks can move backward. An id built from the clock can repeat.' }
    ],
    fix: [
      { log: 'The generator issues 1000-3-0 and remembers the highest millisecond it has used: a high-water mark of 1000.', code: 0, callout: 'Issue 1000-3-0, mark = 1000', state: { now: 1000, hwm: 1000, ids: [{ ms: 1000, id: '1000-3-0' }] }, stats: [{ l: 'high-water mark', v: '1000', cls: 'ok' }] },
      { log: 'NTP steps the clock back to 950. The reading is below the mark, so the generator refuses to issue and waits.', code: 2, callout: 'Clock 950 < mark 1000: wait', state: { now: 950, hwm: 1000, stepped: 1, wait: 1, ids: [{ ms: 1000, id: '1000-3-0' }] }, stats: [{ l: 'generator', v: 'waiting', cls: 'warn' }] },
      { log: 'When the clock passes 1000 the generator issues 1001-3-0 and moves the mark to 1001. No id repeats.', code: 3, callout: 'Clock past the mark: issue 1001-3-0', state: { now: 1001, hwm: 1001, stepped: 1, ids: [{ ms: 1000, id: '1000-3-0' }, { ms: 1001, id: '1001-3-0' }], res: 'ids stay unique', resSub: 'at the cost of a short wait', resTone: 'ok' }, stats: [{ l: 'duplicates', v: '0', cls: 'ok' }],
        takeaway: 'Track the highest value issued. Never issue from a clock reading below it.' }
    ]
  };

  /* ---------- 4. space-time diagram ---------- */
  const LAY = { A: 128, B: 222 }, EV = {
    a1: { l: 'A', x: 110, t: 'write x' }, b1: { l: 'B', x: 240, t: 'receive' }, b2: { l: 'B', x: 320, t: 'reply' },
    a2: { l: 'A', x: 440, t: 'receive' }, a3: { l: 'A', x: 540, t: 'edit y' }, b3: { l: 'B', x: 470, t: 'edit z' }
  };
  const ORDER = ['a1', 'b1', 'b2', 'a2', 'b3', 'a3'];
  const WALL = { a1: ':04', b1: ':02', b2: ':03', a2: ':07', b3: ':05', a3: ':08' };
  const LAMP = { a1: '1', b1: '2', b2: '3', a2: '4', b3: '4', a3: '5' };
  const VEC = { a1: '[1,0]', b1: '[1,1]', b2: '[1,2]', a2: '[2,2]', b3: '[1,3]', a3: '[3,2]' };
  const MSG = [['a1', 'b1'], ['b2', 'a2']];
  const spacetime = {
    id: 'logical', label: 'Count events, not seconds',
    desc: 'Process B’s clock is slow, so wall stamps put a message’s receipt before its send. Lamport counters respect cause and effect; vector clocks also expose concurrency (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['A: write x, stamp 12:00:04 (A is fast)', 'B: receive A’s message, stamp 12:00:02', 'sorted by stamp: B receive comes before A send', 'effect ordered before its cause'],
      fix: ['A: counter 1, sends it', 'B: receive, counter = max(0, 1) + 1 = 2', 'Lamport: cause always has a smaller number', 'vector clocks: [3,2] vs [1,3] are incomparable: concurrent']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative. Lamport: max(own, received) + 1. Vector: a counter each.',
      header: s => ({ left: s.mode === 'wall' ? 'wall-clock stamps' : s.mode === 'lamp' ? 'Lamport counters' : 'vector clocks', right: '' }),
      setup(kit) {
        const R = { ev: {}, lab: {}, msg: [], md: [] };
        DK.box(kit, { x: 6, y: LAY.A - 16, w: 70, h: 32, r: 6, label: 'process A', tone: 'acc' });
        DK.box(kit, { x: 6, y: LAY.B - 16, w: 70, h: 32, r: 6, label: 'process B', tone: 'warn' });
        DK.rule(kit, 90, LAY.A, 620, LAY.A, { dash: '3 4' }); DK.rule(kit, 90, LAY.B, 620, LAY.B, { dash: '3 4' });
        DK.cap(kit, 330, 84, 'time →', 'sm mut', 'middle');
        for (const k of ORDER) {
          R.ev[k] = DK.dot(kit, { x: EV[k].x, y: LAY[EV[k].l], r: 9, tone: 'acc', op: 0 });
          R.lab[k] = DK.txt(kit, { x: EV[k].x, y: LAY[EV[k].l] + (EV[k].l === 'A' ? -18 : 30), t: '', cls: 'sm b', anchor: 'middle' });
        }
        MSG.forEach(() => R.msg.push(DK.line(kit, { tone: 'acc2', w: 2.2, op: 0 })));
        R.res = DK.box(kit, { x: 100, y: 292, w: 440, h: 44, tone: 'none', label: '', sub: '', op: 0 });
        R.bad = DK.line(kit, { tone: 'bad', w: 4, op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const n = s.n || 0, tbl = s.mode === 'wall' ? WALL : s.mode === 'lamp' ? LAMP : VEC;
        ORDER.forEach((k, i) => { const on = i < n, hi = (s.hi || []).includes(k); R.ev[k].set({ op: on ? 1 : 0, tone: hi ? 'bad' : 'acc', r: hi ? 11 : 9 }); R.lab[k].set(on ? tbl[k] : '', { tone: hi ? 'bad' : 'ink' }); });
        MSG.forEach(([a, b], i) => { const on = ORDER.indexOf(a) < n && ORDER.indexOf(b) < n; DK.seg(R.msg[i], { x: EV[a].x, y: LAY[EV[a].l] }, { x: EV[b].x, y: LAY[EV[b].l] }, on ? 1 : 0, s.badmsg && i === 0 ? 'bad' : 'acc2', { w: 2.2 }); });
        const pa = EV[s.hi && s.hi[0] || 'a1'], pb = EV[s.hi && s.hi[1] || 'a1'];
        R.bad.set({ op: s.hi && s.hi.length === 2 ? 1 : 0, x1: pa.x, y1: LAY[pa.l] + 14, x2: pb.x, y2: LAY[pb.l] - 14, dash: '5 4' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Process A, whose clock is fast, writes x and stamps it 12:00:04, then sends a message to B.', code: 0, callout: 'A sends, stamp :04', state: { mode: 'wall', n: 1 }, stats: [{ l: 'A’s stamp', v: ':04', cls: 'ok' }] },
      { log: 'B’s clock is slow. It receives the message and stamps the receipt 12:00:02, two seconds before the send was stamped.', code: 1, callout: 'Receive stamped :02, send stamped :04', moment: true, state: { mode: 'wall', n: 2, hi: ['a1', 'b1'], badmsg: 1 }, stats: [{ l: 'receive before send', v: 'yes', cls: 'bad' }] },
      { log: 'Sorting the log by stamp now shows the effect before its cause. Any rule that depends on this order, like last-write-wins, gets the wrong answer.', code: 3, callout: 'The effect sorts before its cause', state: { mode: 'wall', n: 6, hi: ['a1', 'b1'], badmsg: 1, res: 'sorted by stamp: :02 receive, :03 reply, :04 send …', resSub: 'cause and effect are swapped', resTone: 'bad' }, stats: [{ l: 'order by stamp', v: 'wrong', cls: 'bad' }],
        takeaway: 'Skewed clocks can order a message’s receipt before its send.' }
    ],
    fix: [
      { log: 'Each process keeps a counter. A bumps its counter to 1 for the write and sends the message with it.', code: 0, callout: 'A: counter = 1, sent with the message', state: { mode: 'lamp', n: 1 }, stats: [{ l: 'A counter', v: '1', cls: 'ok' }] },
      { log: 'B receives it and sets its counter to max(its own, received) + 1 = 2. The receipt always gets a larger number than the send.', code: 1, callout: 'B: max(0, 1) + 1 = 2', state: { mode: 'lamp', n: 2 }, stats: [{ l: 'B counter', v: '2', cls: 'ok' }] },
      { log: 'Continue: B replies with 3, A receives and takes 4. A later edit on A gets 5, while an unrelated edit on B gets 4. Lamport numbers never order a cause after its effect, but they also put unrelated events in a made-up order.', code: 2, callout: 'Cause < effect, always. Unrelated events: arbitrary', state: { mode: 'lamp', n: 6, hi: ['b3', 'a3'] }, stats: [{ l: 'a3 vs b3', v: '5 vs 4: looks ordered', cls: 'warn' }] },
      { log: 'Vector clocks keep one counter per process. A’s edit is [3,2] and B’s edit is [1,3]. Neither vector is at least the other in every position, so the two events are concurrent.', code: 3, callout: '[3,2] vs [1,3]: incomparable = concurrent', moment: false, state: { mode: 'vec', n: 6, hi: ['b3', 'a3'], res: 'a3 [3,2] and b3 [1,3] are concurrent', resSub: 'neither happened before the other', resTone: 'ok' }, stats: [{ l: 'a3 and b3', v: 'concurrent', cls: 'ok' }],
        takeaway: 'Counters give an order that respects causality. Vector clocks also tell you when there is no order.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[7] = { scenarios: [tape, spacetime] };
})();
