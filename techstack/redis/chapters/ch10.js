/* Chapter 10 "Streams and Consumer Groups": three scenes and the Explain text (index 10, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: an entry delivered to a worker that dies stays in the PEL until it is claimed. Scene 2: a stream without a cap keeps acknowledged entries.
   Scene 3: a slow worker is claimed from and the entry is processed twice. IDs, lengths and times are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. Delivered is not done: the PEL holds an entry until XACK ---- */
  const FOOT_PEL = 'Simplified: one stream, one group, two workers. IDs and times illustrative.';
  const E = Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, label: String(i + 1) }));
  const pel = {
    id: 'pel-stuck', label: 'Crashed worker, stuck entry', desc: 'A worker reads an entry and is killed before XACK. The entry stays in its pending list, and XREADGROUP with > never hands it out again. XAUTOCLAIM by a live worker moves it on.',
    codeLabel: 'Commands',
    code: { bug: [
      'XADD orders * order 9 status paid',
      'XREADGROUP GROUP workers worker-2 COUNT 1 STREAMS orders >',
      '# worker-2 is killed by a deploy before XACK',
      'XPENDING orders workers - + 10     # idle 5400000 ms',
      'XREADGROUP GROUP workers worker-1 STREAMS orders >   # new entries only',
      'XAUTOCLAIM orders workers worker-1 60000 0-0 COUNT 10',
      'XACK orders workers <id>',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_PEL,
      header: s => ({ left: 'stream orders · group workers', right: s.r || '' }),
      setup(kit) {
        const strip = kit.strip(null, { x: 40, y: 98, items: E, w: 44, h: 30, gap: 8 });
        const mark = kit.text(null, { x: 40, y: 150, t: '', cls: 'mut sm' });
        const led = kit.ledger(null, { x: 40, y: 168, w: 560, title: 'Pending entries list (XPENDING)', cols: [{ label: 'entry', w: 90 }, { label: 'consumer', w: 120 }, { label: 'idle', w: 150 }, { label: 'deliveries', w: 100 }], rows: 3, rowH: 22 });
        return { strip, mark, led };
      },
      frame(s, kit, R) {
        const st = s.st || [];
        E.forEach((e, i) => R.strip['e' + i].set({ tone: st[i] || 'info', hl: st[i] === 'warn' }));
        R.mark.set(s.mark || '');
        R.led.clear();
        (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i, tones: [null, null, s.idleBad ? 'bad' : null, null] }));
      },
    },
    bug: [
      { log: 'The producer appends order events with XADD. Each entry gets an ID like 1696747800000-0, made of a millisecond time and a sequence. The group has delivered none of them yet.', callout: 'Entries are appended, none delivered', code: 0,
        state: { st: ['info', 'info', 'info', 'info', 'info', 'info', 'info', 'info'], mark: 'last-delivered-id of the group: 0-0', rows: [], r: 'XADD' }, stats: [{ l: 'entries', v: '8' }, { l: 'pending', v: '0' }] },
      { log: 'worker-2 reads entry 3 with XREADGROUP and >. The group moves its last-delivered-id forward, and the entry goes into the PEL of worker-2.', callout: 'Delivered: the entry enters worker-2\'s PEL', code: 1,
        state: { st: ['ok', 'ok', 'warn', 'info', 'info', 'info', 'info', 'info'], mark: 'entries 1 and 2 were delivered and acknowledged; 3 is pending', rows: [['entry 3', 'worker-2', '0 ms', '1']], r: 'delivered' }, stats: [{ l: 'pending', v: '1', cls: 'warn' }] },
      { log: 'A deploy kills worker-2 before it sends XACK. The entry stays in its PEL, and its idle time keeps growing.', callout: 'worker-2 dies without XACK', moment: true, code: 2,
        state: { st: ['ok', 'ok', 'warn', 'info', 'info', 'info', 'info', 'info'], mark: 'worker-2 is gone', rows: [['entry 3', 'worker-2', '5,400,000 ms', '1']], idleBad: true, hl: 0, r: 'idle 90 min' }, stats: [{ l: 'idle', v: '90 min (illustrative)', cls: 'bad' }] },
      { log: 'worker-1 keeps reading with >, which returns only entries never delivered to the group. It gets entries 4 and 5, and nobody ever gets entry 3.', callout: '> returns only new entries', code: 4,
        state: { st: ['ok', 'ok', 'warn', 'ok', 'warn', 'info', 'info', 'info'], mark: 'last-delivered-id has moved past entry 3', rows: [['entry 3', 'worker-2', '5,400,000 ms', '1'], ['entry 5', 'worker-1', '120 ms', '1']], idleBad: true, hl: 0, r: 'stuck' }, stats: [{ l: 'order of entry 3', v: 'never fulfilled', cls: 'bad' }] },
      { log: 'A reaper on a live worker runs XAUTOCLAIM with min-idle-time 60000 ms. Entries idle for longer than that move from worker-2 to worker-1, and the delivery count rises to 2.', callout: 'XAUTOCLAIM takes over idle entries', code: 5,
        state: { st: ['ok', 'ok', 'warn', 'ok', 'warn', 'info', 'info', 'info'], mark: 'claimed: entry 3 now belongs to worker-1', rows: [['entry 3', 'worker-1', '0 ms', '2'], ['entry 5', 'worker-1', '300 ms', '1']], hl: 0, r: 'claimed' }, stats: [{ l: 'claimed by', v: 'worker-1', cls: 'ok' }, { l: 'deliveries', v: '2', cls: 'warn' }] },
      { log: 'worker-1 processes the order and sends XACK. The entry leaves the PEL, and the order is fulfilled. Acknowledged entries are not removed from the stream itself.', callout: 'XACK: the entry leaves the PEL', code: 6,
        state: { st: ['ok', 'ok', 'ok', 'ok', 'ok', 'info', 'info', 'info'], mark: 'the entries stay in the stream after XACK', rows: [], r: 'acked' }, stats: [{ l: 'pending entries', v: '0', cls: 'ok' }],
        takeaway: 'Delivered is not done. A pending entry waits for XACK, so run a reaper with XAUTOCLAIM or crashed work stays stuck.' },
    ],
  };

  /* ---- 2. A stream keeps every entry until you trim it ---- */
  const FOOT_MAX = 'Simplified: one stream. Lengths and sizes are illustrative.';
  const maxlen = {
    id: 'maxlen-cap', label: 'Capped with MAXLEN', desc: 'XACK does not delete entries. Without a cap the stream grows for ever. XADD with MAXLEN ~ n trims the oldest entries as new ones arrive.',
    codeLabel: 'Commands',
    code: { bug: [
      'XADD orders * order 9 status paid       # every event, for ever',
      'XACK orders workers <id>                # acknowledged, still stored',
      'XLEN orders                -> 48211394  # illustrative',
      'MEMORY USAGE orders        -> 9810346112',
      'XADD orders MAXLEN ~ 1000000 * order 9 status paid',
      'XLEN orders                -> about 1,000,000',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_MAX,
      header: s => ({ left: 'stream orders', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 40, y: 104, w: 560, labelW: 170, rowH: 32, max: 50, title: 'Size of the stream', items: [{ id: 'len', label: 'entries (millions)' }, { id: 'mem', label: 'memory (GB)' }] });
        const prod = kit.chip(null, { x: 40, y: 214, w: 250, h: 52, label: 'producer', sub: 'XADD orders', tone: 'info' });
        const trim = kit.chip(null, { x: 330, y: 214, w: 270, h: 52, label: 'MAXLEN ~ 1000000', sub: 'not set', tone: 'info' });
        const note = kit.text(null, { x: 40, y: 300, t: '', cls: 'mut sm' });
        return { bars, prod, trim, note };
      },
      frame(s, kit, R) {
        const len = s.len == null ? 1 : s.len, mem = s.mem == null ? 0.2 : s.mem;
        R.bars.set('len', len, len > 20 ? 'bad' : (s.capped ? 'ok' : 'info'), len + 'M');
        R.bars.set('mem', mem, mem > 5 ? 'bad' : (s.capped ? 'ok' : 'info'), mem + ' GB');
        R.prod.set({ sub: s.prod || 'XADD orders', tone: s.prodTone || 'info' });
        R.trim.set({ sub: s.trim || 'not set', tone: s.trimTone || 'info' });
        R.note.set(s.note || '');
      },
    },
    bug: [
      { log: 'The producer appends an entry for every order event with XADD. The stream starts small and grows with every event.', callout: 'Every event is appended', code: 0,
        state: { len: 1, mem: 0.2, r: 'week 1' }, stats: [{ l: 'XLEN', v: '1M' }, { l: 'memory', v: '0.2 GB' }] },
      { log: 'Consumers read entries and XACK them. But XACK only removes an entry from the pending list. The entry stays in the stream.', callout: 'XACK does not delete the entry', code: 1,
        state: { len: 20, mem: 4, note: 'Acknowledged entries are still stored.', r: 'week 8' }, stats: [{ l: 'XLEN', v: '20M', cls: 'warn' }, { l: 'memory', v: '4 GB', cls: 'warn' }] },
      { log: 'Nothing trims the stream, so the length only goes up. With no change in traffic, memory climbs week after week.', callout: 'The stream grows for ever', moment: true, code: 2,
        state: { len: 48, mem: 9.8, note: 'The host will run short of memory.', r: 'week 20' }, stats: [{ l: 'XLEN', v: '48,211,394', cls: 'bad' }, { l: 'memory', v: '9.8 GB', cls: 'bad' }] },
      { log: 'Add a cap to XADD. MAXLEN ~ 1000000 trims the oldest entries as new ones arrive. The tilde makes the cap approximate: Redis trims whole internal nodes, which is cheap.', callout: 'MAXLEN ~ 1000000 caps the stream', code: 4,
        state: { len: 48, mem: 9.8, prod: 'XADD MAXLEN ~ 1000000', prodTone: 'ok', trim: 'trims on every append', trimTone: 'ok', r: 'cap added' }, stats: [{ l: 'cap', v: 'MAXLEN ~ 1000000', cls: 'ok' }] },
      { log: 'After the oldest entries are trimmed the length stays near the cap, a little above it because of the approximate trim. Memory stays bounded and flat.', callout: 'Length stays near the cap', code: 5,
        state: { len: 1, mem: 0.2, capped: true, prod: 'XADD MAXLEN ~ 1000000', prodTone: 'ok', trim: 'length near 1M', trimTone: 'ok', note: 'Trimmed entries are gone for every consumer.', r: 'capped' }, stats: [{ l: 'XLEN', v: 'about 1M', cls: 'ok' }, { l: 'memory', v: '0.2 GB', cls: 'ok' }],
        takeaway: 'Cap the stream from the producer. Choose the cap so a slow consumer can still catch up inside the window.' },
    ],
  };

  /* ---- 3. At-least-once: a slow worker and a claim can process one entry twice ---- */
  const FOOT_TWICE = 'Simplified: one entry, two workers. Times illustrative.';
  const twice = {
    id: 'at-least-once', label: 'Processed twice', desc: 'A worker that is only slow, not dead, loses its entry to XAUTOCLAIM. Both workers then process it, so a handler must be idempotent.',
    codeLabel: 'Commands',
    code: { bug: [
      'XREADGROUP GROUP workers worker-2 COUNT 1 STREAMS orders >',
      '# worker-2 is slow: a long GC pause, 70 s without XACK',
      'XAUTOCLAIM orders workers worker-1 60000 0-0     # idle > 60 s',
      '# worker-1 processes the entry and XACKs it',
      '# worker-2 wakes up, finishes the same entry, XACKs it too',
      '# fix: an idempotent handler, e.g. SET order:9:done NX',
    ] },
    scene: { w: W, h: H, footer: FOOT_TWICE, panels: [
      { id: 'w2', x: 16, y: 58, w: 190, h: 290, title: 'worker-2 (slow)', tone: 'info' },
      { id: 'pl', x: 220, y: 58, w: 190, h: 290, title: 'Group PEL', tone: 'info' },
      { id: 'w1', x: 424, y: 58, w: 200, h: 290, title: 'worker-1', tone: 'info' },
    ], tokens: {
      e2: { label: 'entry 9', sub: 'processing...', tone: 'cursor', w: 140 },
      e2s: { label: 'entry 9', sub: 'stalled 70 s', tone: 'warn', w: 140 },
      e2d: { label: 'entry 9', sub: 'done again', tone: 'warn', w: 140 },
      pe: { label: 'entry 9', sub: 'owner worker-2', tone: 'info', w: 150 },
      pe1: { label: 'entry 9', sub: 'owner worker-1', tone: 'live', w: 150 },
      pe0: { label: 'entry 9', sub: 'acknowledged', tone: 'ok', w: 150 },
      e1: { label: 'entry 9', sub: 'processed', tone: 'ok', w: 150 },
      eff1: { label: 'charge sent', sub: 'by worker-1', tone: 'ok', w: 150 },
      eff2: { label: 'charge sent', sub: 'by worker-2 again', tone: 'warn', w: 150 },
      idem: { label: 'order:9:done', sub: 'SET NX: skip', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'worker-2 reads entry 9 and starts the work. The entry is in the PEL, owned by worker-2.', callout: 'worker-2 holds entry 9', code: 0,
        at: { e2: { x: 36, y: 130 }, pe: { x: 240, y: 130 } }, arrows: [['pe', 'e2', 'delivered']], stats: [{ l: 'owner', v: 'worker-2' }] },
      { log: 'worker-2 stalls, for example in a long GC pause. It is alive, but 70 seconds pass without an XACK.', callout: 'worker-2 stalls: idle for 70 s', code: 1,
        at: { e2s: { x: 36, y: 130 }, pe: { x: 240, y: 130 } }, stats: [{ l: 'idle', v: '70 s', cls: 'warn' }] },
      { log: 'A reaper on worker-1 runs XAUTOCLAIM with min-idle-time 60000 ms. Entry 9 has been idle for longer, so it moves to worker-1.', callout: 'XAUTOCLAIM moves entry 9 to worker-1', moment: true, code: 2,
        at: { e2s: { x: 36, y: 130 }, pe1: { x: 240, y: 130 }, e1: { x: 444, y: 130 } }, arrows: [['pe1', 'e1', 'claimed']], stats: [{ l: 'owner', v: 'worker-1', cls: 'ok' }] },
      { log: 'worker-1 processes the entry and sends XACK. The PEL is clean, and the side effect, for example a charge, has happened once.', callout: 'worker-1 finishes and acknowledges', code: 3,
        at: { e2s: { x: 36, y: 130 }, pe0: { x: 240, y: 130 }, eff1: { x: 444, y: 130 } }, stats: [{ l: 'charges', v: '1', cls: 'ok' }] },
      { log: 'worker-2 wakes up, still holds the entry in memory and finishes it. Without a guard, the same side effect happens a second time.', callout: 'worker-2 finishes the same entry', moment: true, code: 4,
        at: { e2d: { x: 36, y: 130 }, eff1: { x: 444, y: 130 }, eff2: { x: 444, y: 200 } }, stats: [{ l: 'charges', v: '2', cls: 'bad' }] },
      { log: 'The PEL gives at-least-once delivery, not exactly-once. The handler must be idempotent, for example by recording the order id with SET NX before it acts.', callout: 'An idempotent handler absorbs the repeat', code: 5,
        at: { e2d: { x: 36, y: 130 }, eff1: { x: 444, y: 130 }, idem: { x: 240, y: 200 } }, stats: [{ l: 'charges', v: '1', cls: 'ok' }],
        takeaway: 'A claim can race a slow worker. Make handlers idempotent, and pick min-idle-time above your slowest healthy run.' },
    ],
  };

  window.CHAPTER_OVERRIDES[10] = {
    explain: `<h3>1. A stream is an append-only log</h3>
<p>A stream is a log that only grows at the end. <code>XADD</code> appends an entry with an ID of the form <code>ms-seq</code>, a millisecond time and a sequence number, so IDs always increase. Readers do not remove entries by reading them. That makes a stream different from a list used as a queue, where popping an element removes it.</p>

<h3>2. Consumer groups share the work</h3>
<p>A consumer group lets several workers share one stream. The group remembers a <code>last-delivered-id</code>. <code>XREADGROUP ... &gt;</code> delivers only entries that were never delivered to the group, and each such entry goes to exactly one consumer. Workers that do not need to share can read the stream directly with <code>XREAD</code> and keep their own position.</p>

<h3>3. The PEL: delivered is not done</h3>
<p>Each consumer has a <b>pending entries list</b>. When an entry is delivered, it goes into the PEL of that consumer, with the time of the last delivery and a delivery count. <code>XPENDING</code> shows it. The entry stays in the PEL until the consumer sends <code>XACK</code>. A worker that crashes after the read and before the ack leaves the entry in its PEL, and nobody else will receive it through <code>&gt;</code>.</p>

<h3>4. Claiming idle entries</h3>
<p><code>XAUTOCLAIM key group consumer min-idle-time start</code> lets a live worker take over entries that have been pending for longer than <code>min-idle-time</code>, and it returns them for processing. <code>XCLAIM</code> does the same for chosen IDs. A claim moves the entry into the PEL of the new owner and raises its delivery count, which also helps you find entries that keep failing: a high delivery count is a poison message, so move it to a dead-letter stream after a few tries.</p>

<h3>5. Trimming is your job</h3>
<p><code>XACK</code> removes an entry from the PEL, not from the stream. The stream keeps every entry until you trim it. <code>XADD ... MAXLEN ~ n</code> caps the length as you append, and <code>XTRIM</code> trims on demand, by length or by minimum ID. The tilde makes the trim approximate, which lets Redis drop whole internal nodes and keeps the cost low. A trimmed entry is gone for every consumer, so a consumer that falls behind the cap loses the entries it has not read.</p>

<h3>6. The trade-off: at-least-once, and a window</h3>
<p>The PEL gives at-least-once delivery. A claimed entry can be processed twice, for example when the first worker was only slow, so handlers must be idempotent. Capping the stream protects memory but drops old history. Choose <code>min-idle-time</code> from your slowest healthy processing time, and the cap from the slowest consumer's lag plus a margin.</p>
<p>To diagnose, watch <code>XLEN</code>, <code>XINFO STREAM</code>, <code>XINFO GROUPS</code> (pending count and lag) and <code>XPENDING</code> (idle time and delivery count). A growing pending count with no active consumers is the signature of a crashed worker. A growing <code>XLEN</code> with a stable pending count is the signature of a missing cap.</p>

<h3>7. Syntax</h3>
<pre>XADD orders MAXLEN ~ 1000000 * order 9 status paid
XGROUP CREATE orders workers $ MKSTREAM
XREADGROUP GROUP workers worker-1 COUNT 10 BLOCK 5000 STREAMS orders &gt;
XACK orders workers 1696747800000-0

XPENDING orders workers - + 10
XAUTOCLAIM orders workers worker-1 60000 0-0 COUNT 10
XINFO GROUPS orders
XLEN orders
XTRIM orders MAXLEN ~ 1000000</pre>
<p>Create the group at <code>$</code> to read only new entries, or at <code>0</code> to start from the beginning of the stream.</p>`,
    scenarios: [pel, maxlen, twice],
  };
})();
