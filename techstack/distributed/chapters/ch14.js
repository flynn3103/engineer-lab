/* Chapter 15: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. tape and cursors ---------- */
  const OX = o => 20 + (o - 99) * 42, TY = 140;
  const tape = {
    id: 'offsetahead', label: 'The offset runs ahead of the work',
    desc: 'The offset is committed to 110 before records 101 to 110 reach the warehouse. A crash in between skips them on restart (illustrative offsets).',
    codeLabel: 'Trace',
    code: {
      bug: ['poll: records 101..110 returned', 'auto-commit: offset = 110', 'crash before the warehouse write', 'restart: resume from offset 110', 'records 101..110: never handled'],
      fix: ['poll: records 101..110 returned', 'write records to the warehouse, durable', 'commit offset 110 after the write', 'crash before commit: replay 101..110, safe if idempotent']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: a log tape, one cell per record offset.',
      header: s => ({ left: s.after ? 'commit after the work' : 'commit on a timer', right: s.right || '' }),
      setup(kit) {
        const R = { cell: [] };
        for (let o = 99; o <= 112; o++) R.cell.push(DK.box(kit, { x: OX(o), y: TY, w: 38, h: 40, r: 6, label: String(o), tone: 'soft', op: o <= 100 ? 1 : 0.35 }));
        DK.cap(kit, 20, 128, 'log offsets', 'xs mut');
        R.cm = DK.box(kit, { x: OX(110) - 50, y: 84, w: 100, h: 28, r: 8, tone: 'acc', label: 'committed 100', op: 1 });
        R.cmL = DK.line(kit, { x1: OX(100) + 19, y1: 112, x2: OX(100) + 19, y2: TY, tone: 'acc', w: 2 });
        R.wr = DK.box(kit, { x: OX(100) - 50, y: 200, w: 140, h: 28, r: 8, tone: 'ok', label: 'stored through 100', op: 1 });
        R.wrL = DK.line(kit, { x1: OX(100) + 19, y1: TY + 40, x2: OX(100) + 19, y2: 200, tone: 'ok', w: 2 });
        R.crash = DK.txt(kit, { x: 320, y: 262, t: '', cls: 'lg b', anchor: 'middle' });
        R.res = DK.box(kit, { x: 120, y: 286, w: 400, h: 44, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const c = s.c || 100, w = s.w || 100, p = s.p || 100;
        R.cell.forEach((b, i) => {
          const o = 99 + i; let tone = 'soft', op = o <= 100 ? 1 : 0.35;
          if (o <= 100) tone = 'ok'; else if (o <= p) { op = 1; tone = o <= w ? 'ok' : (s.lost && o <= c ? 'bad' : 'warn'); }
          b.set({ tone, op, label: String(o), dash: (s.lost && o > w && o <= c) ? '4 3' : '' });
        });
        R.cm.set({ x: OX(c) + 19 - 50, label: 'committed ' + c }); R.cmL.set({ x1: OX(c) + 19, x2: OX(c) + 19 });
        R.wr.set({ x: OX(w) + 19 - 70, label: 'stored through ' + w, tone: s.lost ? 'bad' : 'ok' }); R.wrL.set({ x1: OX(w) + 19, x2: OX(w) + 19 });
        R.crash.set(s.crash ? '✕ consumer crashed' : '', { tone: 'bad' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'The consumer polls and gets records 101 to 110. Nothing is written yet.', code: 0, callout: 'Poll: records 101..110', state: { p: 110 }, stats: [{ l: 'in flight', v: '101..110', cls: 'warn' }] },
      { log: 'Auto-commit fires on its timer and saves offset 110, even though no record has reached the warehouse.', code: 1, callout: 'Auto-commit: offset = 110', state: { p: 110, c: 110 }, stats: [{ l: 'committed offset', v: '110', cls: 'warn' }, { l: 'warehouse', v: '≤ 100', cls: 'warn' }] },
      { log: 'The consumer crashes before the warehouse write.', code: 2, callout: 'Crash before the write', moment: true, state: { p: 110, c: 110, crash: 1, lost: 1 }, stats: [{ l: 'consumer', v: 'down', cls: 'bad' }] },
      { log: 'On restart the consumer resumes from the committed offset, 110. Records 101 to 110 are skipped and never reach the warehouse.', code: 4, callout: 'Restart at 110: 101..110 skipped', state: { p: 110, c: 110, lost: 1, res: 'records 101..110 are lost', resSub: 'the offset said done, the work was not', resTone: 'bad' }, stats: [{ l: 'records lost', v: '10', cls: 'bad' }],
        takeaway: 'An offset is a promise that the work is finished. Commit it only after the work is durable.' }
    ],
    fix: [
      { log: 'The consumer polls records 101 to 110. The offset stays at 100 for now.', code: 0, callout: 'Poll: records 101..110', state: { after: 1, p: 110 }, stats: [{ l: 'committed offset', v: '100', cls: 'ok' }] },
      { log: 'It writes the records to the warehouse and waits until the write is durable.', code: 1, callout: 'Write to the warehouse first', state: { after: 1, p: 110, w: 110 }, stats: [{ l: 'warehouse', v: '≤ 110', cls: 'ok' }] },
      { log: 'Only now does it commit offset 110. If it crashes before this step, the work is replayed.', code: 2, callout: 'Then commit offset 110', state: { after: 1, p: 110, w: 110, c: 110 }, stats: [{ l: 'committed offset', v: '110', cls: 'ok' }] },
      { log: 'Suppose a crash had come just before the commit: the restart resumes at 100 and replays 101 to 110. Nothing is lost, and the writes must be safe to repeat.', code: 3, callout: 'A crash replays instead of losing', state: { after: 1, p: 110, w: 110, c: 100, crash: 1, right: 'crash before commit', res: 'replay 101..110, nothing lost', resSub: 'safe only if the write is idempotent', resTone: 'ok' }, stats: [{ l: 'records lost', v: '0', cls: 'ok' }],
        takeaway: 'Commit after the work. A crash then repeats work rather than skipping it, so make the work repeatable.' }
    ]
  };

  /* ---------- 3. event-time scatter ---------- */
  const EX = t => 108 + t * 78, EY = a => 108 + a * 28;
  const LAGM = 1.2;
  const EVS = [{ e: 0.5, a: 0.8 }, { e: 1.5, a: 1.7 }, { e: 2.5, a: 2.8 }, { e: 3.4, a: 3.5 }, { e: 1.2, a: 3.9 }, { e: 4.5, a: 4.8 }, { e: 5.0, a: 5.3 }];
  const scatter = {
    id: 'late', label: 'A late event and a window',
    desc: 'Events carry the time they happened, but arrive later and out of order. A window closes when the watermark passes it, and a straggler can arrive after that (illustrative times).',
    codeLabel: 'Job',
    code: {
      bug: ['window: count events per 2-minute event-time window', 'watermark = latest arrival − 1.2 min', 'window 0 to 2 closes when watermark reaches 2.0', 'event at 1.2 arrives at 3.9: window already closed', 'late event dropped: window 0 to 2 undercounts'],
      fix: ['window: count events per 2-minute event-time window', 'allowed lateness: 2 minutes after the watermark', 'event at 1.2 arrives at 3.9: window still accepts updates', 'window 0 to 2 re-emits with the late event']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: one dot per event. Across is when it happened, down is when it arrived.',
      header: s => ({ left: s.lat ? 'windows accept late events for 2 minutes' : 'windows close at the watermark', right: s.now != null ? 'now = ' + s.now.toFixed(1) : '' }),
      setup(kit) {
        const R = { dot: [], band: [], cnt: [] };
        for (let k = 0; k < 3; k++) {
          const b = DK.box(kit, { x: EX(k * 2), y: 96, w: 2 * 78 - 4, h: 190, r: 8, tone: 'none', op: 1 }); b.g.querySelector('rect').style.fill = k % 2 ? 'var(--soft)' : 'none'; b.g.querySelector('rect').style.stroke = 'var(--line)'; R.band.push(b);
          DK.cap(kit, EX(k * 2) + 76, 90, 'window ' + k * 2 + '–' + (k * 2 + 2), 'xs b', 'middle');
          R.cnt.push(DK.box(kit, { x: EX(k * 2) + 10, y: 296, w: 2 * 78 - 24, h: 38, r: 8, tone: 'soft', label: '', sub: '' }));
        }
        DK.cap(kit, 8, 112, 'arrival', 'xs mut'); DK.cap(kit, 8, 124, 'time ↓', 'xs mut');
        R.now = DK.line(kit, { x1: EX(0), y1: EY(0), x2: EX(6), y2: EY(0), tone: 'acc2', w: 2, dash: '5 4' });
        R.wm = DK.line(kit, { x1: EX(0), y1: 96, x2: EX(0), y2: 286, tone: 'ok', w: 2.6 });
        R.wmT = DK.txt(kit, { x: EX(0), y: 304 + 44, t: '', cls: 'xs b', anchor: 'middle' });
        EVS.forEach(ev => R.dot.push(DK.dot(kit, { x: EX(ev.e), y: EY(ev.a), r: 8, tone: 'ok', op: 0 })));
        return R;
      },
      frame(s, kit, R) {
        const now = s.now == null ? 0 : s.now, wm = Math.max(0, now - LAGM);
        R.now.set({ y1: EY(now), y2: EY(now) }); R.wm.set({ x1: EX(wm), x2: EX(wm), op: now > 0 ? 1 : 0 });
        R.wmT.set('', {});
        const cnt = [0, 0, 0];
        EVS.forEach((ev, i) => {
          const on = ev.a <= now, late = ev.e < wm - (s.lat ? 2 : 0) && ev.a > ev.e + LAGM + 0.01 && ev.e < Math.floor((wm) / 2) * 2 + 0;
          const winClosed = ev.e < Math.floor(wm / 2) * 2;       // its window ended before the watermark
          const lateNow = on && ev.a >= ev.e + LAGM + 1.5 && winClosed;
          const k = Math.floor(ev.e / 2);
          if (on && !(lateNow && !s.lat)) cnt[k]++;
          R.dot[i].set({ op: on ? 1 : 0, tone: lateNow ? (s.lat ? 'warn' : 'bad') : 'ok', label: lateNow ? '!' : '' });
        });
        R.cnt.forEach((b, k) => {
          const closed = wm >= (k + 1) * 2, upd = s.lat && k === 0 && cnt[0] === 3 && now >= 3.9;
          b.set({ label: now > 0 ? cnt[k] + ' events' : '', sub: now > 0 ? (upd ? 'corrected' : closed ? 'closed' : 'open') : '', tone: upd ? 'warn' : closed ? (k === 0 && !s.lat && now >= 3.9 ? 'bad' : 'ok') : 'soft' });
        });
      }
    },
    bug: [
      { log: 'Events arrive. Each one has the time it happened (across) and the time it reached the pipeline (down). The first two fall in window 0–2 and arrive in order.', code: 0, callout: 'Events fill window 0–2', state: { now: 1.8 }, stats: [{ l: 'window 0–2', v: '2 events, open', cls: 'ok' }] },
      { log: 'The watermark says no event older than itself is expected. At now = 3.2 it reaches 2.0, so window 0–2 closes and emits a count of 2.', code: 2, callout: 'Watermark reaches 2.0: window 0–2 closes', state: { now: 3.2 }, stats: [{ l: 'window 0–2', v: 'closed: 2', cls: 'ok' }] },
      { log: 'An event that happened at 1.2 was delayed on the network and arrives at 3.9. Its window is already closed, so it is dropped.', code: 3, callout: 'Event 1.2 arrives at 3.9: too late', moment: true, state: { now: 3.9 }, stats: [{ l: 'window 0–2 true count', v: '3, reported 2', cls: 'bad' }] },
      { log: 'The report for window 0–2 undercounts, and nothing says that an event was discarded.', code: 4, callout: 'Window 0–2 undercounts by one', state: { now: 5.5 }, stats: [{ l: 'window 0–2', v: '2 (true: 3)', cls: 'bad' }],
        takeaway: 'Arrival order is not event order. A window that closes too early drops stragglers without an error.' }
    ],
    fix: [
      { log: 'The same events arrive. Window 0–2 counts the first two, and it closes at the watermark as before.', code: 0, callout: 'Window 0–2 closes with 2', state: { lat: 1, now: 3.2 }, stats: [{ l: 'window 0–2', v: 'closed: 2', cls: 'ok' }] },
      { log: 'The window keeps its state for an allowed lateness of 2 minutes after closing, so the late event at 1.2 still has somewhere to go.', code: 1, callout: 'Allowed lateness: keep the window state', state: { lat: 1, now: 3.5 }, stats: [{ l: 'allowed lateness', v: '2 min', cls: 'ok' }] },
      { log: 'The straggler arrives at 3.9. The window accepts it and emits an updated count of 3. Downstream must treat the new result as a correction.', code: 3, callout: 'Late event accepted: window re-emits 3', state: { lat: 1, now: 3.9 }, stats: [{ l: 'window 0–2', v: 'updated: 3', cls: 'ok' }],
        takeaway: 'Keep window state a little longer and re-emit a corrected result. The cost is memory and a result that can change.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[14] = { scenarios: [tape, scatter] };
})();
