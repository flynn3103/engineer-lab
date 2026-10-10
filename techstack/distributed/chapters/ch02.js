/* Chapter 3: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;
  const PX = 150, BX = 470;                 // lane x positions: payment service, bank
  const Y = { m1: [116, 148], r1: [158, 190], m2: [238, 268], r2: [278, 310] };
  const P = (x, y) => ({ x, y });
  const FOOT_A = 'Illustrative: 3 s timeout, one 10-unit charge. Time runs downward.';

  const seg = (ln, a, b, p, tone, ms) => ln.set({ x1: a.x, y1: a.y, x2: a.x + (b.x - a.x) * p, y2: a.y + (b.y - a.y) * p, op: p > 0 ? 1 : 0, tone: tone || 'acc2', w: 2.6, ms: ms == null ? 800 : ms });
  const head = (d, a, b, p, tone) => d.set({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, op: p > 0 ? 1 : 0, tone: tone || 'acc2' });

  const ladder = {
    id: 'lost-reply', label: 'Lost reply, then retry',
    desc: 'The bank charges the card, but the reply is lost. The caller cannot tell "never ran" from "ran, reply lost", so it retries (illustrative).',
    codeLabel: 'Call',
    code: {
      bug: ['payment: charge(user, 10)    # timeout = 3 s', 'bank: charge applied, reply lost', 'payment: no reply after 3 s, treat as failed', 'payment: retry POST /charge', 'customer balance: charged twice'],
      fix: ['POST /charge', 'Idempotency-Key: 8f2c-pay-8812', 'bank: store result under the key, then reply', 'retry with same key -> bank returns stored result']
    },
    stage: {
      w: W, h: H, footer: FOOT_A,
      header: s => ({ left: s.key ? 'with Idempotency-Key 8f2c' : 'no idempotency key', right: s.right || '' }),
      setup(kit) {
        const R = {};
        DK.box(kit, { x: PX - 80, y: 76, w: 160, h: 30, label: 'payment service', tone: 'acc' });
        DK.box(kit, { x: BX - 80, y: 76, w: 160, h: 30, label: 'bank', tone: 'warn' });
        DK.rule(kit, PX, 108, PX, 330, { dash: '4 4' }); DK.rule(kit, BX, 108, BX, 330, { dash: '4 4' });
        R.m1 = DK.line(kit, { tone: 'acc2' }); R.r1 = DK.line(kit, { tone: 'ok' }); R.m2 = DK.line(kit, { tone: 'acc2' }); R.r2 = DK.line(kit, { tone: 'ok' });
        R.h = ['m1', 'r1', 'm2', 'r2'].map(() => DK.dot(kit, { r: 5, op: 0 }));
        R.lost = DK.txt(kit, { x: 310, y: 212, t: '', cls: 'lg b', anchor: 'middle' });
        R.l1 = DK.txt(kit, { x: 310, y: 128, t: '', cls: 'sm', anchor: 'middle' });
        R.l2 = DK.txt(kit, { x: 310, y: 250, t: '', cls: 'sm', anchor: 'middle' });
        R.to = DK.line(kit, { x1: PX - 22, y1: Y.m1[0], x2: PX - 22, y2: Y.m1[0], tone: 'warn', w: 7 });
        R.toL = DK.txt(kit, { x: PX - 32, y: 210, t: '', cls: 'sm', anchor: 'end' });
        R.q = DK.box(kit, { x: PX - 150, y: 222, w: 112, h: 36, tone: 'warn', label: 'ran or not?', sub: 'unknown', op: 0 });
        R.key = DK.box(kit, { x: 512, y: 96, w: 118, h: 36, tone: 'ok', label: 'key 8f2c', sub: 'result stored', op: 0 });
        R.c1 = DK.box(kit, { x: 512, y: 140, w: 118, h: 36, tone: 'bad', label: '-10', sub: 'charged', op: 0 });
        R.c2 = DK.box(kit, { x: 512, y: 244, w: 118, h: 36, tone: 'bad', label: '-10', sub: 'charged again', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const A = (y) => P(PX, y), B = (y) => P(BX, y);
        seg(R.m1, A(Y.m1[0]), B(Y.m1[1]), s.m1 || 0); head(R.h[0], A(Y.m1[0]), B(Y.m1[1]), s.m1 || 0);
        const rp = s.lost ? 0.5 : (s.r1 || 0);
        seg(R.r1, B(Y.r1[0]), A(Y.r1[1]), rp, s.lost ? 'bad' : 'ok'); head(R.h[1], B(Y.r1[0]), A(Y.r1[1]), rp, s.lost ? 'bad' : 'ok');
        R.h[1].set({ op: s.lost ? 0 : (rp > 0 ? 1 : 0) });
        seg(R.m2, A(Y.m2[0]), B(Y.m2[1]), s.m2 || 0); head(R.h[2], A(Y.m2[0]), B(Y.m2[1]), s.m2 || 0);
        seg(R.r2, B(Y.r2[0]), A(Y.r2[1]), s.r2 || 0, 'ok'); head(R.h[3], B(Y.r2[0]), A(Y.r2[1]), s.r2 || 0, 'ok');
        R.lost.set(s.lost ? '✕ reply lost' : '', { tone: 'bad', op: s.lost ? 1 : 0 });
        R.l1.set(s.m1 ? (s.key ? 'POST /charge + key' : 'POST /charge') : '', { op: s.m1 ? 1 : 0 });
        R.l2.set(s.m2 ? (s.key ? 'retry, same key' : 'retry, no key') : '', { op: s.m2 ? 1 : 0 });
        R.to.set({ y2: Y.m1[0] + (s.to || 0) * 100, op: s.to ? 1 : 0, tone: s.to >= 1 ? 'bad' : 'warn' });
        R.toL.set(s.to ? '3 s timeout' : '', { op: s.to ? 1 : 0 });
        R.q.set({ op: s.to >= 1 && !s.m2 ? 1 : 0 });
        R.key.set({ op: s.keyBox ? 1 : 0 });
        R.c1.set({ op: s.c1 ? 1 : 0 });
        R.c2.set({ op: s.c2 ? 1 : 0, tone: s.c2 === 'hit' ? 'ok' : 'bad', label: s.c2 === 'hit' ? 'no charge' : '-10', sub: s.c2 === 'hit' ? 'stored result' : 'charged again' });
      }
    },
    bug: [
      { log: 'The payment service sends charge(user, 10) and starts a 3 second timeout (illustrative). It has no way to know what happens next.', code: 0, callout: 'charge(user, 10), timeout 3 s', state: { m1: 1 }, stats: [{ l: 'timeout', v: '3 s', cls: 'warn' }] },
      { log: 'The bank applies the charge and sends the reply. The reply is lost on the way back.', code: 1, callout: 'The charge ran. The reply did not arrive.', state: { m1: 1, c1: 1, lost: 1 }, stats: [{ l: 'customer charged', v: 'once', cls: 'warn' }] },
      { log: 'After 3 seconds the payment service gives up. From its side, "never ran" and "ran, reply lost" look identical.', code: 2, callout: 'Timeout: it cannot tell the two cases apart', state: { m1: 1, c1: 1, lost: 1, to: 1 }, stats: [{ l: 'payment service knows', v: 'nothing', cls: 'warn' }] },
      { log: 'The payment service retries. The request carries no key, so the bank has no way to see it is the same payment and charges again.', code: 4, callout: 'Retry without a key: charged twice', moment: true, state: { m1: 1, c1: 1, lost: 1, to: 1, m2: 1, c2: 1 }, stats: [{ l: 'customer charged', v: 'twice', cls: 'bad' }],
        takeaway: 'A timeout says "no reply", not "did not run". A retry without a key repeats the side effect.' }
    ],
    fix: [
      { log: 'The client makes one Idempotency-Key per payment and sends it with every attempt of that payment.', code: 1, callout: 'One key per payment, sent on every attempt', state: { m1: 1, key: 1 }, stats: [{ l: 'key', v: '8f2c-pay-8812', cls: 'ok' }] },
      { log: 'The bank stores the result under that key before it replies. The reply is lost, as before.', code: 2, callout: 'Result stored under the key, reply lost', state: { m1: 1, key: 1, keyBox: 1, c1: 1, lost: 1 }, stats: [{ l: 'charges applied', v: '1', cls: 'ok' }] },
      { log: 'The client times out and retries with the same key.', code: 1, callout: 'Timeout, retry with the same key', state: { m1: 1, key: 1, keyBox: 1, c1: 1, lost: 1, to: 1, m2: 1 }, stats: [{ l: 'retry key', v: 'same', cls: 'ok' }] },
      { log: 'The bank finds the key already has a result and returns it. The customer is charged once.', code: 3, callout: 'Key hit: the stored result comes back', state: { m1: 1, key: 1, keyBox: 1, c1: 1, lost: 1, to: 1, m2: 1, r2: 1, c2: 'hit' }, stats: [{ l: 'charges applied', v: '1', cls: 'ok' }],
        takeaway: 'Retries look up the same payment when its identity and effect are coordinated.' }
    ]
  };

  /* ---------- 2. retry fan-out tree ---------- */
  const TX = (r, i) => { if (r === 3) return 98 + i * 19.4; const k = Math.pow(3, 3 - r); return (TX(3, i * k) + TX(3, i * k + k - 1)) / 2; };
  const TY = [112, 158, 204, 252];
  const LBL = ['user request', 'web', 'api', 'database'];
  const NODES = [1, 3, 9, 27];
  const fan = {
    id: 'storm', label: 'Retries multiply load',
    desc: 'Three layers each retry three times. One user request becomes 27 calls to a database that is already slow (illustrative).',
    codeLabel: 'Retries',
    code: {
      bug: ['web: retry 3 times on failure', 'api: retry 3 times on failure', 'database: slow, overloaded', 'calls per user request: 1 x 3 x 3 x 3 = 27', 'recovery: never, the retries keep it down'],
      fix: ['web: retry at one layer only', 'budget: at most 10% extra calls', 'backoff: exponential, with jitter', 'circuit breaker: stop calls while the db is down']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: 3 retries per layer; the db can take about 9 calls.',
      header: s => ({ left: 'one user request', right: s.db != null ? s.db + ' calls at the database' : '' }),
      setup(kit) {
        const R = { rows: [], link: [] };
        LBL.forEach((l, r) => DK.cap(kit, 8, TY[r] + 4, l, 'sm mut'));
        for (let r = 1; r < 4; r++) for (let i = 0; i < NODES[r]; i++) R.link.push({ r, i, ln: DK.line(kit, { x1: TX(r - 1, Math.floor(i / 3)), y1: TY[r - 1], x2: TX(r, i), y2: TY[r], tone: 'line', w: 1.2, op: 0 }) });
        NODES.forEach((n, r) => { R.rows[r] = []; for (let i = 0; i < n; i++) R.rows[r].push(DK.dot(kit, { x: TX(r, i), y: TY[r], r: r === 3 ? 4.6 : r === 2 ? 6 : 8, op: 0 })); });
        R.bar = DK.bar(kit, { x: 120, y: 292, w: 340, h: 12 }); DK.cap(kit, 8, 302, 'database load', 'sm');
        R.cut = DK.line(kit, { x1: 120 + 340 / 3, y1: 286, x2: 120 + 340 / 3, y2: 310, tone: 'ink', w: 2 });
        R.cutL = DK.txt(kit, { x: 120 + 340 / 3, y: 324, t: 'it can take 9', cls: 'xs', anchor: 'middle' });
        return R;
      },
      frame(s, kit, R) {
        const rows = s.rows || [];
        NODES.forEach((n, r) => R.rows[r].forEach((d, i) => { const st = (rows[r] || {})[i]; d.set({ op: st ? (st === 'x' ? 0.3 : 1) : 0, tone: st === 'x' ? 'mut' : st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : 'ok' }); }));
        R.link.forEach(k => { const a = (rows[k.r] || {})[k.i], p = (rows[k.r - 1] || {})[Math.floor(k.i / 3)]; k.ln.set({ op: a && p ? 0.8 : 0, tone: a === 'x' ? 'mut' : 'line', dash: a === 'x' ? '3 3' : '' }); });
        const calls = s.db || 0;
        R.bar.set({ f: calls / 27, tone: calls > 9 ? 'bad' : calls > 6 ? 'warn' : 'ok', label: s.db != null ? calls + ' calls' : '' });
      }
    },
    bug: [
      { log: 'One user request reaches the web tier once. The database is slow, but the first call is normal.', code: 0, callout: 'One request, one call', state: { db: 1, rows: [{ 0: 'ok' }] }, stats: [{ l: 'calls at database', v: '1', cls: 'ok' }] },
      { log: 'The web tier retries three times on failure, so the api tier sees 3 calls.', code: 0, callout: 'Web retries 3×: the api sees 3 calls', state: { db: 3, rows: [{ 0: 'ok' }, { 0: 'warn', 1: 'warn', 2: 'warn' }] }, stats: [{ l: 'calls at api', v: '3', cls: 'warn' }] },
      { log: 'The api tier retries too. Each of its 3 calls becomes 3, so the database gets 9 calls for one user request.', code: 1, callout: 'Api retries 3×: 9 calls reach the database', state: { db: 9, rows: [{ 0: 'ok' }, { 0: 'warn', 1: 'warn', 2: 'warn' }, [...Array(9)].map(() => 'warn')] }, stats: [{ l: 'calls at database', v: '9', cls: 'warn' }] },
      { log: 'Every layer retries, so the database receives 27 calls for each user request (illustrative). The extra calls keep it overloaded, which is a metastable failure.', code: 3, callout: '3 × 3 × 3 = 27 calls, and it never recovers', moment: true, state: { db: 27, rows: [{ 0: 'ok' }, { 0: 'bad', 1: 'bad', 2: 'bad' }, [...Array(9)].map(() => 'bad'), [...Array(27)].map(() => 'bad')] }, stats: [{ l: 'calls at database', v: '27', cls: 'bad' }, { l: 'database recovers', v: 'no', cls: 'bad' }],
        takeaway: 'Retries multiply per layer. A slow database receives more load exactly when it is already struggling.' }
    ],
    fix: [
      { log: 'Retries happen at one layer only. The other layers pass the error up instead of retrying.', code: 0, callout: 'Retry at one layer only', state: { db: 3, rows: [{ 0: 'ok' }, { 0: 'ok', 1: 'ok', 2: 'ok' }, { 0: 'ok', 3: 'ok', 6: 'ok' }, { 0: 'ok', 9: 'ok', 18: 'ok' }] }, stats: [{ l: 'calls at database', v: '3', cls: 'warn' }] },
      { log: 'A retry budget caps extra calls at about 10% of normal traffic. Beyond that, calls fail fast and are not sent (shown dim).', code: 1, callout: 'Budget: at most 10% extra calls', state: { db: 1, rows: [{ 0: 'ok' }, { 0: 'ok', 1: 'x', 2: 'x' }, { 0: 'ok', 3: 'x', 6: 'x' }, { 0: 'ok', 9: 'x', 18: 'x' }] }, stats: [{ l: 'extra calls', v: '≤ 10%', cls: 'ok' }] },
      { log: 'Backoff with jitter spaces out the few retries that remain, and a circuit breaker stops calls while the database is down. It gets room to recover.', code: 3, callout: 'Backoff + breaker: the database recovers', state: { db: 1, rows: [{ 0: 'ok' }, { 0: 'ok' }, { 0: 'ok' }, { 0: 'ok' }] }, stats: [{ l: 'database', v: 'recovers', cls: 'ok' }],
        takeaway: 'Cap retries to one layer, a budget and a breaker. Do not let every layer try on its own.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { scenarios: [ladder, fan] };
})();
