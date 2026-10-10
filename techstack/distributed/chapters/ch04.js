/* Chapter 5: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. tanks ---------- */
  const Y0 = 312, YPOS = p => Y0 - (p - 804) * 22;
  const TK = { L: 40, F1: 150, F2: 260 }, TW = 72;
  const tanks = {
    id: 'ryw', label: 'Reload shows the old title',
    desc: 'Alice saves a title on the leader. Her reload is served by a follower that is 3 entries behind (illustrative positions).',
    codeLabel: 'Trace',
    code: {
      bug: ['save title: Lead', 'leader: append entry 812, reply OK', 'OK, saved', 'GET profile -> follower 2 (applied 809)', 'title: Engineer (old)'],
      fix: ['leader: entry 812, reply OK position 812', 'client keeps token: 812', 'GET profile, min 812', 'follower 2 waits: applied 809 < 812', 'entries 810-812 arrive, follower reaches 812', 'title: Lead']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative log positions. A tank is filled to the last entry that machine applied.',
      header: s => ({ left: 'water level = applied log position', right: '' }),
      setup(kit) {
        const R = { water: {}, lab: {}, val: {} };
        for (const k of ['L', 'F1', 'F2']) {
          DK.box(kit, { x: TK[k], y: YPOS(812) - 8, w: TW, h: Y0 - YPOS(812) + 12, r: 8, tone: 'none', op: 1 }).g.querySelector('rect').style.fill = 'none';
          R.water[k] = DK.line(kit, { x1: TK[k] + TW / 2, y1: Y0, x2: TK[k] + TW / 2, y2: YPOS(809), tone: 'ok', w: TW - 6, op: 0.85 });
          DK.cap(kit, TK[k] + TW / 2, 332, { L: 'leader', F1: 'follower 1', F2: 'follower 2' }[k], 'sm b', 'middle');
          R.val[k] = DK.txt(kit, { x: TK[k] + TW / 2, y: 348, t: '', cls: 'sm', anchor: 'middle' });
        }
        R.tok = DK.line(kit, { x1: 28, y1: YPOS(812), x2: 350, y2: YPOS(812), tone: 'acc2', w: 2.4, dash: '6 4', op: 0 });
        R.tokL = DK.txt(kit, { x: 350, y: YPOS(812) - 14, t: '', cls: 'sm b', anchor: 'end' });
        R.user = DK.box(kit, { x: 440, y: 108, w: 176, h: 44, tone: 'acc', label: 'Alice', sub: '' });
        R.req = DK.line(kit, { tone: 'acc2', w: 2.6, op: 0 });
        R.rd = DK.dot(kit, { r: 6, tone: 'acc2' });
        R.page = DK.box(kit, { x: 440, y: 232, w: 176, h: 52, tone: 'none', label: 'page shows', sub: '', op: 0 });
        R.wait = DK.txt(kit, { x: 440, y: 308, t: '', cls: 'sm b', anchor: 'start' });
        return R;
      },
      frame(s, kit, R) {
        const lv = { L: s.l || 811, F1: s.f1 || 811, F2: s.f2 || 809 };
        for (const k of ['L', 'F1', 'F2']) {
          R.water[k].set({ y2: YPOS(lv[k]), tone: k === 'F2' && s.stale ? 'warn' : 'ok', ms: 900 });
          R.val[k].set('applied ' + lv[k], { tone: k === 'F2' && s.stale ? 'bad' : 'ink' });
        }
        R.tok.set({ op: s.token ? 1 : 0 }); R.tokL.set(s.token ? "Alice's token: min 812" : '', { tone: 'acc2' });
        R.user.set({ sub: s.say || '' });
        DK.seg(R.req, { x: 440, y: 150 }, { x: TK.F2 + TW + 4, y: 214 }, s.req ? 1 : 0, s.waiting ? 'warn' : 'acc2');
        R.rd.set({ op: 0 });
        R.page.set({ op: s.page ? 1 : 0, tone: s.page === 'new' ? 'ok' : 'bad', label: 'page shows', sub: s.page === 'new' ? 'title: Lead' : 'title: Engineer (old)' });
        R.wait.set(s.wait || '', { tone: 'warn' });
      }
    },
    bug: [
      { log: 'Alice saves the title Lead. The leader appends entry 812 and replies OK at once. Follower 1 is at 811 and follower 2 is at 809.', code: 1, callout: 'Leader appends 812', state: { l: 812, f1: 811, f2: 809, say: 'save title: Lead' }, stats: [{ l: 'leader', v: '812', cls: 'ok' }, { l: 'follower 2', v: '809', cls: 'warn' }] },
      { log: 'Alice sees OK, saved. The leader has not waited for any follower.', code: 2, callout: 'OK, saved', state: { l: 812, f1: 811, f2: 809, say: 'OK, saved' }, stats: [{ l: 'follower 2 behind by', v: '3 entries', cls: 'warn' }] },
      { log: 'Alice reloads. The balancer sends the read to follower 2, which has applied only up to 809.', code: 3, callout: 'Reload goes to follower 2 (applied 809)', state: { l: 812, f1: 811, f2: 809, stale: 1, say: 'reload profile', req: 1 }, stats: [{ l: 'read served at', v: '809', cls: 'warn' }] },
      { log: 'Follower 2 answers correctly for position 809, which holds the old title. From Alice’s side her own change went back in time.', code: 4, callout: 'Her own write is gone from her view', moment: true, state: { l: 812, f1: 811, f2: 809, stale: 1, say: 'reload profile', req: 1, page: 'old' }, stats: [{ l: 'Alice sees', v: 'old title', cls: 'bad' }],
        takeaway: 'The follower was right for its position. The read did not ask for a position that includes Alice’s write.' }
    ],
    fix: [
      { log: 'The leader replies OK with the entry position, 812. The client keeps it as a token for the next read.', code: 1, callout: 'OK, position 812: keep the token', state: { l: 812, f1: 811, f2: 809, token: 1, say: 'token = 812' }, stats: [{ l: 'token', v: '812', cls: 'ok' }] },
      { log: 'Alice reloads and the read carries min 812. Follower 2 compares its applied position, 809, with 812.', code: 2, callout: 'GET profile, min 812', state: { l: 812, f1: 811, f2: 809, token: 1, stale: 1, say: 'reload, min 812', req: 1, waiting: 1, wait: 'applied 809 < 812: wait' }, stats: [{ l: 'follower 2', v: '809 < 812', cls: 'warn' }] },
      { log: 'Entries 810 to 812 arrive and follower 2 climbs to 812. It now answers, and the answer includes Alice’s write.', code: 4, callout: 'Follower 2 reaches 812, then answers', state: { l: 812, f1: 812, f2: 812, token: 1, say: 'reload, min 812', req: 1, page: 'new' }, stats: [{ l: 'Alice sees', v: 'Lead', cls: 'ok' }],
        takeaway: 'A read that carries the write’s position either waits for it or goes to a copy that has it.' }
    ]
  };

  /* ---------- 2. comment strips ---------- */
  const SX = 20 + 0, CELL = 29;
  const strip = (kit, x, y, n) => Array.from({ length: n }, (_, i) => DK.box(kit, { x: x + i * CELL, y, w: 25, h: 28, r: 5, label: String(i + 1), tone: 'soft', op: 0.3 }));
  const flick = {
    id: 'flicker', label: 'Refresh goes backward',
    desc: 'Bob refreshes a thread through a load balancer. The second request reaches a lagging replica, so comment 7 disappears (illustrative positions).',
    codeLabel: 'Trace',
    code: {
      bug: ['refresh 1: GET thread -> replica A', 'replica A: comments 1..7 (pos 701)', 'refresh 2: GET thread -> replica B', 'replica B: comments 1..6 (behind)', 'refresh 3: GET thread -> replica A'],
      fix: ['refresh: GET thread, min pos 701', 'replica A: comments 1..7, pos 701', 'replica B: at 690, refuses', 'balancer: redirect to replica A', 'Bob sees comments 1..7, nothing goes backwards']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: replica A has 7 comments (position 701), replica B has 6 (position 690).',
      header: s => ({ left: s.hdr || 'Bob refreshes the thread', right: '' }),
      setup(kit) {
        const R = {};
        DK.cap(kit, 20, 108, 'what Bob sees', 'sm mut');
        DK.panel = null;
        R.me = strip(kit, 20, 120, 7);
        R.panA = DK.box(kit, { x: 392, y: 100, w: 230, h: 76, r: 10, tone: 'none', label: '', op: 1 }); R.panA.g.querySelector('rect').style.fill = 'none';
        R.panB = DK.box(kit, { x: 392, y: 214, w: 230, h: 76, r: 10, tone: 'none', label: '', op: 1 }); R.panB.g.querySelector('rect').style.fill = 'none';
        R.tA = DK.txt(kit, { x: 404, y: 118, t: 'replica A · position 701', cls: 'sm b' });
        R.tB = DK.txt(kit, { x: 404, y: 232, t: 'replica B · position 690', cls: 'sm b' });
        R.a = strip(kit, 402, 132, 7); R.b = strip(kit, 402, 246, 7);
        R.req = DK.line(kit, { tone: 'acc2', w: 2.6, op: 0 });
        R.lbl = DK.txt(kit, { x: 20, y: 184, t: '', cls: 'sm b' });
        R.stamp = DK.txt(kit, { x: 392, y: 312, t: '', cls: 'sm b', anchor: 'start' });
        DK.cap(kit, 20, 262, 'comments seen, refresh by refresh', 'sm mut');
        R.hist = [0, 1, 2].map(i => DK.box(kit, { x: 20 + i * 72, y: 272, w: 64, h: 40, r: 8, label: '', sub: 'refresh ' + (i + 1), tone: 'soft', op: 0.3 }));
        return R;
      },
      frame(s, kit, R) {
        R.a.forEach((c, i) => c.set({ op: 1, tone: 'ok' }));
        R.b.forEach((c, i) => c.set({ op: i < 6 ? 1 : 0.3, tone: i < 6 ? 'ok' : 'soft', dash: i < 6 ? '' : '3 3' }));
        const n = s.seen == null ? 0 : s.seen;
        R.me.forEach((c, i) => c.set({ op: i < n ? 1 : 0.3, tone: i < n ? (n === 6 ? 'bad' : 'ok') : 'soft', dash: i < n ? '' : '3 3' }));
        const to = s.to, B = to === 'B';
        const from = { x: 252, y: 150 }, tp = B ? { x: 388, y: 252 } : { x: 388, y: 140 };
        DK.seg(R.req, from, tp, s.to ? 1 : 0, s.stamp ? 'warn' : 'acc2');
        R.lbl.set(s.to ? (s.minpos ? 'refresh ' + s.n + ' · min pos 701' : 'refresh ' + s.n) : '', { tone: 'acc2' });
        R.stamp.set(s.stamp || '', { tone: 'bad' });
        R.hist.forEach((h, i) => { const v = (s.hist || [])[i]; h.set({ op: v ? 1 : 0.3, label: v ? String(v) : '', tone: v === 6 ? 'bad' : v ? 'ok' : 'soft' }); });
        R.panB.set({ tone: 'none' });
      }
    },
    bug: [
      { log: 'Refresh 1: the balancer sends Bob to replica A, which holds comments 1 to 7 at position 701.', code: 0, callout: 'Refresh 1 → replica A: 7 comments', state: { to: 'A', n: 1, seen: 7, hist: [7] }, stats: [{ l: 'Bob sees', v: '7 comments', cls: 'ok' }] },
      { log: 'Refresh 2: the balancer picks replica B, which is behind at position 690 and holds only comments 1 to 6.', code: 2, callout: 'Refresh 2 → replica B: 6 comments', moment: true, state: { to: 'B', n: 2, seen: 6, hist: [7, 6] }, stats: [{ l: 'Bob sees', v: '6 comments', cls: 'bad' }] },
      { log: 'Refresh 3: back on replica A, comment 7 returns. From Bob’s side time ran backward and forward again.', code: 4, callout: 'Refresh 3 → replica A: comment 7 is back', state: { to: 'A', n: 3, seen: 7, hist: [7, 6, 7] }, stats: [{ l: 'Bob saw', v: '7, 6, 7', cls: 'bad' }],
        takeaway: 'Each request found a copy that was right for its own position. Nothing kept Bob’s reads moving forward.' }
    ],
    fix: [
      { log: 'Refresh 1 reaches replica A at position 701 and Bob sees 7 comments. The client remembers 701.', code: 0, callout: 'Remember position 701', state: { to: 'A', n: 1, seen: 7, hist: [7] }, stats: [{ l: 'Bob’s position', v: '701', cls: 'ok' }] },
      { log: 'Refresh 2 carries min position 701. The balancer picks replica B, which is at 690 and refuses.', code: 2, callout: 'Replica B: 690 < 701, refuse', state: { to: 'B', n: 2, minpos: 1, seen: 7, stamp: 'refused: behind Bob', hist: [7] }, stats: [{ l: 'replica B', v: '690 < 701', cls: 'warn' }] },
      { log: 'The balancer redirects to replica A. Bob sees 7 comments again, so nothing went backward.', code: 3, callout: 'Redirect to replica A: 7 again', state: { to: 'A', n: 2, minpos: 1, seen: 7, hist: [7, 7] }, stats: [{ l: 'Bob saw', v: '7, 7', cls: 'ok' }],
        takeaway: 'Monotonic reads mean the position can only move forward, per user. Pin the user or carry a minimum position.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[4] = { scenarios: [tanks, flick] };
})();
