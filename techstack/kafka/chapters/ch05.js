/* Chapter 5 "Replication, ISR and High Watermark": scenes and Explain override (index 5, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Four scenes: acks=1 versus acks=all around a leader crash, min.insync.replicas rejecting a write, ISR shrink and expand flapping,
   and an unclean leader election. Offsets, lags and counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* One log offset is one small token. Broker b (1..3) has a row, offsets 0..5 run left to right. */
  const ROW_Y = [58, 152, 246];
  const ox = i => 126 + 44 * i;
  const oy = b => ROW_Y[b - 1] + 38;
  const OFF = {};
  [1, 2, 3].forEach(b => { for (let i = 0; i < 6; i++) OFF['b' + b + 'o' + i] = { label: String(i), sub: '', tone: 'ok', w: 38, h: 34 }; });
  /* log(b, n, over): the first n offsets of broker b; over maps an offset to extra props, or a function of the offset. */
  const log = (b, n, over) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['b' + b + 'o' + i, { x: ox(i), y: oy(b), ...(typeof over === 'function' ? over(i) : (over && over[i]) || {}) }]));
  const dead = () => ({ tone: 'delete' });
  const uncommitted = from => i => (i >= from ? { tone: 'warn' } : {});
  const panelsFor = titles => titles.map((t, i) => ({ id: 'p' + (i + 1), x: 16, y: ROW_Y[i], w: 400, h: 86, title: t, tone: 'info' })).concat([{ id: 'pr', x: 426, y: 58, w: 204, h: 290, title: 'Producer', tone: 'info' }]);
  const SEND = { x: 442, y: 108 }, ACK = { x: 442, y: 200 };

  /* ---- 1. acks=1 versus acks=all around a leader crash ---- */
  const FOOT_ACKS = 'Simplified: one partition, offsets 0 to 5. Replica states illustrative.';
  const acks = {
    id: 'acks', label: 'acks=1 vs acks=all', desc: 'The same leader crash. With acks=1 an acknowledged record exists only on the leader. With acks=all it is copied to the in-sync replicas first (offsets illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        'acks=1   replication.factor=3',
        '# the leader appends offsets 4-5 and acknowledges at once',
        '# the leader crashes before the followers fetch offsets 4-5',
        '# an in-sync follower takes over: its log end offset is 4',
        '# offsets 4-5 were acknowledged and are gone',
      ],
      fix: [
        'acks=all   min.insync.replicas=2   unclean.leader.election.enable=false',
        '# the leader appends offsets 4-5 but does not reply yet',
        '# the followers fetch offsets 4-5; the high watermark moves to 6',
        '# only now is the producer acknowledged',
        '# the leader crashes: an in-sync follower already has offsets 4-5',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_ACKS, panels: panelsFor(['Broker 1 (leader)', 'Broker 2 (follower)', 'Broker 3 (follower)']), tokens: {
      ...OFF,
      send: { label: 'send 4-5', sub: 'to the leader', tone: 'cursor', w: 170 },
      ack: { label: 'ack: success', sub: '', tone: 'cursor', w: 170 },
      ack2: { label: 'ack: success', sub: 'after HW passes 5', tone: 'ok', w: 170 },
      lost: { label: '4-5 are gone', sub: 'but were acked', tone: 'bad', w: 170, h: 52 },
      safe: { label: '4-5 are safe', sub: 'on 2 copies', tone: 'ok', w: 170, h: 52 },
    } },
    bug: [
      { log: 'A partition has three replicas and the producer uses acks=1. Offsets 0 to 3 are on every replica, so the high watermark is 4.', callout: 'Three copies of offsets 0 to 3', code: 0,
        at: { ...log(1, 4), ...log(2, 4), ...log(3, 4) }, stats: [{ l: 'acks', v: '1', cls: 'warn' }, { l: 'high watermark', v: '4', cls: 'ok' }] },
      { log: 'The producer sends offsets 4 and 5. The leader appends them to its own log. The followers have not fetched them yet.', callout: 'The leader appends offsets 4-5', code: 1,
        at: { ...log(1, 6, uncommitted(4)), ...log(2, 4), ...log(3, 4), send: { ...SEND } }, arrows: [['send', 'b1o5', '']], stats: [{ l: 'copies of 4-5', v: '1', cls: 'warn' }, { l: 'high watermark', v: '4', cls: 'ok' }] },
      { log: 'With acks=1 the leader replies after its own append. The producer sees success for offsets 4-5, but only one copy exists.', callout: 'Ack after the leader alone appended', moment: true, code: 1,
        at: { ...log(1, 6, uncommitted(4)), ...log(2, 4), ...log(3, 4), ack: { ...ACK } }, stats: [{ l: 'producer sees', v: 'success', cls: 'ok' }, { l: 'copies of 4-5', v: '1', cls: 'bad' }] },
      { log: 'The leader’s host is lost before the followers fetch. Broker 1 is gone, together with the only copy of offsets 4 and 5.', callout: 'The leader is lost', code: 2,
        at: { ...log(1, 6, dead), ...log(2, 4), ...log(3, 4), ack: { ...ACK } }, stats: [{ l: 'copies of 4-5', v: '0', cls: 'bad' }] },
      { log: 'Broker 2 is in sync and becomes the leader. Its log ends at offset 4, and the controller accepts that as the truth.', callout: 'Broker 2 leads with log end 4', code: 3,
        at: { ...log(1, 6, dead), ...log(2, 4), ...log(3, 4), ack: { ...ACK } }, stats: [{ l: 'new leader', v: 'broker 2', cls: 'warn' }, { l: 'log end offset', v: '4', cls: 'warn' }] },
      { log: 'Offsets 4 and 5 were acknowledged and are now lost. The producer never retries them, because it saw success.', callout: 'Acknowledged records are gone', moment: true, code: 4,
        at: { ...log(2, 4), ...log(3, 4), ack: { ...ACK }, lost: { x: 442, y: 262 } }, stats: [{ l: 'acked records lost', v: '2', cls: 'bad' }, { l: 'producer retries', v: '0', cls: 'bad' }],
        takeaway: 'An acknowledgement is only as strong as the copies that exist when it is sent. With acks=1 that is one copy.' },
    ],
    fix: [
      { log: 'The producer uses acks=all with min.insync.replicas=2. The partition has three in-sync replicas holding offsets 0 to 3.', callout: 'acks=all with three in-sync replicas', code: 0,
        at: { ...log(1, 4), ...log(2, 4), ...log(3, 4) }, stats: [{ l: 'acks', v: 'all', cls: 'ok' }, { l: 'high watermark', v: '4', cls: 'ok' }] },
      { log: 'The leader appends offsets 4 and 5, but it does not reply. The high watermark stays at 4, so a consumer cannot read them yet.', callout: 'Appended, but not acknowledged', code: 1,
        at: { ...log(1, 6, uncommitted(4)), ...log(2, 4), ...log(3, 4), send: { ...SEND } }, stats: [{ l: 'high watermark', v: '4', cls: 'warn' }, { l: 'producer', v: 'waiting', cls: 'warn' }] },
      { log: 'The in-sync followers fetch offsets 4 and 5 and report their new log ends to the leader. The smallest log end in the ISR is now 6.', callout: 'Followers fetch and report their log end', moment: true, code: 2,
        at: { ...log(1, 6, uncommitted(4)), ...log(2, 6, uncommitted(4)), ...log(3, 6, uncommitted(4)), send: { ...SEND } }, arrows: [['b1o5', 'b2o5', ''], ['b1o5', 'b3o5', '']], stats: [{ l: 'copies of 4-5', v: '3', cls: 'ok' }] },
      { log: 'The high watermark moves to 6. Offsets 4 and 5 are committed, and only now does the leader acknowledge the producer.', callout: 'The high watermark passes offsets 4-5', code: 3,
        at: { ...log(1, 6), ...log(2, 6), ...log(3, 6), ack2: { ...ACK } }, stats: [{ l: 'high watermark', v: '6', cls: 'ok' }, { l: 'producer sees', v: 'success', cls: 'ok' }] },
      { log: 'If the leader is lost now, either follower already has offsets 4 and 5, and the new leader’s log ends at 6. Nothing acknowledged is lost.', callout: 'A leader crash loses nothing acked', moment: true, code: 4,
        at: { ...log(1, 6, dead), ...log(2, 6), ...log(3, 6), ack2: { ...ACK }, safe: { x: 442, y: 262 } }, stats: [{ l: 'acked records lost', v: '0', cls: 'ok' }],
        takeaway: 'acks=all waits for the high watermark, so an acknowledged record is on every in-sync replica. The price is latency.' },
    ],
  };

  /* ---- 2. min.insync.replicas: a write is refused instead of living on one copy ---- */
  const BR = ['B1', 'B2', 'B3'];
  const minIsr = {
    id: 'min-isr', label: 'Min ISR rejects writes', desc: 'When only one replica is in sync, acks=all refuses the write instead of storing it on a single copy (rolling restart, values illustrative).',
    codeLabel: 'Config and error',
    code: {
      bug: [
        'replication.factor=3   min.insync.replicas=2   acks=all',
        '# a rolling restart takes broker 3 down, and broker 2 has not caught up yet',
        '# the ISR is {1}: smaller than min.insync.replicas',
        'NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas',
      ],
      fix: [
        '# restart one broker at a time and wait for it to catch up',
        '# ISR = {1, 2}, which meets min.insync.replicas=2',
        '# produce with acks=all succeeds again',
        '# UnderMinIsrPartitionCount is back to 0',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one partition, leader on broker 1. Values illustrative.',
      header: s => ({ left: 'replication.factor = 3 · min.insync.replicas = 2 · acks = all', right: s.r || '' }),
      setup(kit) {
        const chips = BR.map((b, i) => kit.chip(null, { x: 24 + i * 200, y: 76, w: 190, h: 56, label: b, sub: '', tone: 'ok' }));
        const isr = kit.chip(null, { x: 24, y: 152, w: 592, h: 40, label: '', sub: '', tone: 'info' });
        const led = kit.ledger(null, { x: 24, y: 208, w: 592, title: 'Produce request (acks=all)', cols: [{ label: 'check', w: 230 }, { label: 'result', w: 362 }], rows: 4, rowH: 17 });
        return { chips, isr, led };
      },
      frame(s, kit, R) {
        const st = s.b || ['ok', 'ok', 'ok'];
        const names = { ok: 'in sync', warn: 'catching up', bad: 'down' };
        st.forEach((t, i) => R.chips[i].set({ tone: t === 'ok' ? 'ok' : t, label: BR[i] + (i === 0 ? ' (leader)' : ''), sub: names[t] }));
        const n = st.filter(t => t === 'ok').length;
        R.isr.set({ label: 'ISR size = ' + n, sub: n >= 2 ? 'meets min.insync.replicas = 2' : 'below min.insync.replicas = 2', tone: n >= 2 ? 'ok' : 'bad' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r.c, { hl: r.hl, tones: [null, r.t], tone: r.t === 'bad' ? 'bad' : '' }));
      },
    },
    bug: [
      { log: 'The partition has three replicas, all in sync, and writes with acks=all succeed. The ISR is {1, 2, 3}.', callout: 'Healthy: ISR of three', code: 0,
        state: { b: ['ok', 'ok', 'ok'], rows: [{ c: ['ISR size >= min.insync.replicas', '3 >= 2: accepted'], t: 'ok' }], r: 'healthy' }, stats: [{ l: 'ISR', v: '{1, 2, 3}', cls: 'ok' }] },
      { log: 'A rolling restart stops broker 3. The ISR shrinks to {1, 2}. Two replicas still meet min.insync.replicas, so writes continue.', callout: 'Broker 3 restarts, ISR of two', code: 1,
        state: { b: ['ok', 'ok', 'bad'], rows: [{ c: ['ISR size >= min.insync.replicas', '2 >= 2: accepted'], t: 'ok' }], r: 'one broker down' }, stats: [{ l: 'ISR', v: '{1, 2}', cls: 'warn' }] },
      { log: 'The next broker is restarted before broker 3 caught up. Broker 3 is still down and broker 2 is down. The ISR is only the leader.', callout: 'Two brokers are out at once', moment: true, code: 1,
        state: { b: ['ok', 'bad', 'bad'], rows: [{ c: ['ISR size', '1'], t: 'bad' }], r: 'two brokers down' }, stats: [{ l: 'ISR', v: '{1}', cls: 'bad' }] },
      { log: 'A producer sends with acks=all. The leader checks the ISR size against min.insync.replicas before it appends anything.', callout: 'The leader checks the ISR first', code: 2,
        state: { b: ['ok', 'bad', 'bad'], rows: [{ c: ['produce request arrives', 'acks=all'], t: null }, { c: ['ISR size >= min.insync.replicas', '1 >= 2: no'], t: 'bad', hl: true }], r: 'check' }, stats: [{ l: 'ISR', v: '1 < 2', cls: 'bad' }] },
      { log: 'The leader rejects the write with NotEnoughReplicasException. This is the guard: the record is not stored on a single copy.', callout: 'The write is rejected, not stored once', moment: true, code: 3,
        state: { b: ['ok', 'bad', 'bad'], rows: [{ c: ['produce request arrives', 'acks=all'], t: null }, { c: ['ISR size >= min.insync.replicas', '1 >= 2: no'], t: 'bad' }, { c: ['result', 'NotEnoughReplicasException'], t: 'bad', hl: true }], r: 'rejected' }, stats: [{ l: 'produce', v: 'rejected', cls: 'bad' }, { l: 'data on one copy', v: 'none', cls: 'ok' }],
        takeaway: 'min.insync.replicas turns a risky write into an error. Availability is the price of keeping acked data on 2 copies.' },
    ],
    fix: [
      { log: 'Measure first: UnderMinIsrPartitionCount is above zero, and the partition’s ISR shows only the leader.', callout: 'Measure: under min ISR', code: 0,
        state: { b: ['ok', 'bad', 'bad'], rows: [{ c: ['UnderMinIsrPartitionCount', '> 0'], t: 'bad' }], r: 'before' }, stats: [{ l: 'ISR', v: '{1}', cls: 'bad' }] },
      { log: 'Broker 2 is restored first. It fetches from the leader and catches up on what it missed.', callout: 'Restore broker 2 and let it catch up', code: 1,
        state: { b: ['ok', 'warn', 'bad'], rows: [{ c: ['broker 2', 'fetching from the leader'], t: 'warn' }], r: 'catching up' }, stats: [{ l: 'ISR', v: '{1}', cls: 'warn' }] },
      { log: 'Broker 2 reaches the leader’s log end and rejoins the ISR. Two replicas meet min.insync.replicas.', callout: 'Broker 2 rejoins the ISR', moment: true, code: 1,
        state: { b: ['ok', 'ok', 'bad'], rows: [{ c: ['ISR size >= min.insync.replicas', '2 >= 2: accepted'], t: 'ok' }], r: 'ISR of two' }, stats: [{ l: 'ISR', v: '{1, 2}', cls: 'ok' }] },
      { log: 'acks=all writes are accepted again. Broker 3 is brought back, and the next restart waits until the ISR is full again.', callout: 'Writes are accepted again', code: 2,
        state: { b: ['ok', 'ok', 'ok'], rows: [{ c: ['ISR size >= min.insync.replicas', '3 >= 2: accepted'], t: 'ok' }, { c: ['result', 'success'], t: 'ok' }], r: 'healthy' }, stats: [{ l: 'produce', v: 'accepted', cls: 'ok' }, { l: 'UnderMinIsrPartitionCount', v: '0', cls: 'ok' }],
        takeaway: 'Restart brokers one at a time and wait for a full ISR before the next one. That keeps the ISR above the minimum.' },
    ],
  };

  /* ---- 3. ISR flapping: the lag window, shrinks and expands ---- */
  const flap = {
    id: 'isr-flap', label: 'ISR shrink and expand', desc: 'A follower that is slower than replica.lag.time.max.ms leaves the ISR, then rejoins. Every cycle is a metadata change, and acks=all waits for the slow member (values illustrative).',
    codeLabel: 'Metrics',
    code: { bug: [
      'replica.lag.time.max.ms=30000   # default: 30 s',
      '# follower 3 has a slow disk: it falls behind the leader’s log end',
      '# lag > 30 s: the leader removes it from the ISR   (IsrShrinksPerSec)',
      '# it catches up and is added back                   (IsrExpandsPerSec)',
      '# while it is in the ISR, acks=all waits for it',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one follower, one slow period. Values illustrative.',
      header: s => ({ left: 'replica.lag.time.max.ms = 30000', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 190, rowH: 30, max: 60, unit: '', title: 'Follower 3 against the leader', items: [
          { id: 'lag', label: 'time behind the leader (s)' }, { id: 'isr', label: 'ISR size (of 3)' }, { id: 'ack', label: 'acks=all latency (ms)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Controller and metrics', cols: [{ label: 'signal', w: 250 }, { label: 'value', w: 342 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const lag = s.lag || 0, isr = s.isr == null ? 3 : s.isr, ack = s.ack || 12;
        R.bars.set('lag', lag, lag > 30 ? 'bad' : lag > 10 ? 'warn' : 'ok', lag + ' s');
        R.bars.set('isr', (isr / 3) * 60, isr < 3 ? 'warn' : 'ok', isr + '');
        R.bars.set('ack', Math.min(60, ack / 10), ack > 200 ? 'bad' : ack > 50 ? 'warn' : 'ok', ack + ' ms');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The partition has three in-sync replicas. Followers keep up with the leader’s log end, so the lag is a few hundred milliseconds.', callout: 'All followers keep up', code: 0,
        state: { lag: 0, isr: 3, ack: 12, r: 'steady' }, stats: [{ l: 'ISR', v: '3 of 3', cls: 'ok' }, { l: 'acks=all latency', v: '12 ms', cls: 'ok' }] },
      { log: 'Follower 3 has a slow disk and starts to fetch behind. While it is still in the ISR, every acks=all write has to wait for it.', callout: 'A slow follower holds back acks=all', code: 1,
        state: { lag: 18, isr: 3, ack: 260, say: 'follower 3 is slow but still in the ISR', sub: 'the high watermark waits for the slowest member', tone: 'warn', r: 'lagging' }, stats: [{ l: 'follower lag', v: '18 s', cls: 'warn' }, { l: 'acks=all latency', v: '260 ms', cls: 'warn' }] },
      { log: 'The follower is behind for longer than replica.lag.time.max.ms. The leader removes it from the ISR. The shrink is a metadata update through the controller.', callout: 'Over 30 s behind: removed from the ISR', moment: true, code: 2,
        state: { lag: 34, isr: 2, ack: 14, rows: [['IsrShrinksPerSec', '1 (a metadata update)'], ['ISR', '{1, 2}']], rt: 'warn', r: 'shrink' }, stats: [{ l: 'ISR', v: '2 of 3', cls: 'warn' }, { l: 'acks=all latency', v: '14 ms', cls: 'ok' }] },
      { log: 'Follower 3 catches up with the leader and is added back to the ISR. That is a second metadata update.', callout: 'It catches up and rejoins', code: 3,
        state: { lag: 2, isr: 3, ack: 14, rows: [['IsrExpandsPerSec', '1 (a second metadata update)'], ['ISR', '{1, 2, 3}']], rt: 'ok', r: 'expand' }, stats: [{ l: 'ISR', v: '3 of 3', cls: 'ok' }] },
      { log: 'The disk is still slow, so the cycle repeats. Each round costs two metadata updates, and the latency spikes each time the follower is back in the ISR.', callout: 'The cycle repeats: flapping', moment: true, code: 4,
        state: { lag: 22, isr: 3, ack: 300, say: 'shrink, expand, shrink, expand', sub: 'latency spikes and metadata churn', tone: 'bad', rows: [['IsrShrinksPerSec + IsrExpandsPerSec', 'a repeating pattern'], ['acks=all latency', 'spikes while the slow follower is in']], rt: 'bad', r: 'flapping' }, stats: [{ l: 'ISR changes', v: 'repeating', cls: 'bad' }],
        takeaway: 'Flapping points at a slow follower: disk, network or load. Fix that, rather than raising replica.lag.time.max.ms.' },
    ],
  };

  /* ---- 4. Unclean leader election: availability against acknowledged data ---- */
  const unclean = {
    id: 'unclean', label: 'Unclean leader election', desc: 'Only the leader is in sync. If it is lost and unclean election is on, a stale replica leads and acknowledged records are lost; if it is off, the partition waits (offsets illustrative).',
    codeLabel: 'Broker config',
    code: {
      bug: [
        'unclean.leader.election.enable=true   # not the default',
        '# the ISR is {1}: brokers 2 and 3 have fallen behind (log ends 3 and 2)',
        '# broker 1 acknowledged offsets 3-4 with acks=all, min.insync.replicas=1',
        '# broker 1 is lost: no in-sync replica is left',
        '# the controller elects broker 2, which is out of sync: offsets 3-4 are gone',
      ],
      fix: [
        'unclean.leader.election.enable=false   # the default',
        '# broker 1 is lost: no in-sync replica is left, so no leader is elected',
        '# the partition is offline; produce and fetch fail (availability is lost)',
        '# broker 1 returns, becomes leader again with all offsets: nothing was lost',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: ISR of one, stale followers. Offsets illustrative.', panels: panelsFor(['Broker 1 (leader, ISR = {1})', 'Broker 2 (out of sync)', 'Broker 3 (out of sync)']), tokens: {
      ...OFF,
      ack: { label: 'ack: success', sub: 'with acks=all', tone: 'cursor', w: 170 },
      off: { label: 'partition offline', sub: 'no leader elected', tone: 'warn', w: 170, h: 52 },
      lost: { label: 'offsets 3-4', sub: 'acked, now lost', tone: 'bad', w: 170, h: 52 },
      back: { label: 'broker 1 is back', sub: 'leader, all offsets', tone: 'ok', w: 170, h: 52 },
      ldr: { label: 'new leader', sub: 'broker 2', tone: 'warn', w: 170 },
    } },
    bug: [
      { log: 'Brokers 2 and 3 fell behind and left the ISR. Broker 1 is the leader with offsets 0 to 4, and the ISR is just {1}. min.insync.replicas is 1, so writes are still accepted.', callout: 'ISR is only the leader', code: 1,
        at: { ...log(1, 5), ...log(2, 3), ...log(3, 2) }, stats: [{ l: 'ISR', v: '{1}', cls: 'warn' }, { l: 'log ends', v: '5 / 3 / 2' }] },
      { log: 'The producer’s acks=all writes for offsets 3 and 4 are acknowledged, because the leader is the whole ISR.', callout: 'Offsets 3-4 are acknowledged', code: 2,
        at: { ...log(1, 5, uncommitted(3)), ...log(2, 3), ...log(3, 2), ack: { ...ACK } }, stats: [{ l: 'copies of 3-4', v: '1', cls: 'warn' }] },
      { log: 'Broker 1 is lost. There is no in-sync replica left, so the partition has no eligible leader.', callout: 'The leader is lost', moment: true, code: 3,
        at: { ...log(1, 5, dead), ...log(2, 3), ...log(3, 2), ack: { ...ACK } }, stats: [{ l: 'in-sync replicas', v: '0', cls: 'bad' }] },
      { log: 'With unclean election on, the controller may pick a replica that is not in the ISR. It elects broker 2 because the producers need the partition back.', callout: 'An out-of-sync broker is elected', code: 4,
        at: { ...log(1, 5, dead), ...log(2, 3), ...log(3, 2), ack: { ...ACK }, ldr: { x: 442, y: 262 } }, stats: [{ l: 'new leader', v: 'broker 2 (stale)', cls: 'warn' }, { l: 'log end offset', v: '3', cls: 'warn' }] },
      { log: 'The partition is available again, but offsets 3 and 4 do not exist on the new leader. Producers write new records at offset 3 and 4, and any follower that held the old ones has to truncate.', callout: 'Acked offsets 3-4 are lost', moment: true, code: 4,
        at: { ...log(2, 3), ...log(3, 2), ack: { ...ACK }, lost: { x: 442, y: 262 } }, stats: [{ l: 'acked records lost', v: '2', cls: 'bad' }, { l: 'partition', v: 'available', cls: 'ok' }],
        takeaway: 'Unclean election chooses availability over data. Use it only for a topic where losing acked records is acceptable.' },
    ],
    fix: [
      { log: 'unclean.leader.election.enable is false, which is the default. The same state: the ISR is {1}, and offsets 3-4 were acknowledged by the leader.', callout: 'Default: unclean election is off', code: 0,
        at: { ...log(1, 5, uncommitted(3)), ...log(2, 3), ...log(3, 2), ack: { ...ACK } }, stats: [{ l: 'unclean election', v: 'off', cls: 'ok' }] },
      { log: 'Broker 1 is lost. The controller finds no replica in the ISR, and it does not elect an out-of-sync one.', callout: 'No in-sync replica, no leader', code: 1,
        at: { ...log(1, 5, dead), ...log(2, 3), ...log(3, 2), ack: { ...ACK } }, stats: [{ l: 'in-sync replicas', v: '0', cls: 'bad' }] },
      { log: 'The partition is offline. Produce and fetch requests for it fail until a replica of the ISR returns. This is the price: availability.', callout: 'The partition is offline, nothing is lost', moment: true, code: 2,
        at: { ...log(1, 5, dead), ...log(2, 3), ...log(3, 2), ack: { ...ACK }, off: { x: 442, y: 262 } }, stats: [{ l: 'partition', v: 'offline', cls: 'bad' }, { l: 'acked records lost', v: '0', cls: 'ok' }] },
      { log: 'Broker 1 comes back with its log intact. It is the only in-sync replica, so it becomes leader again with offsets 0 to 4.', callout: 'Broker 1 returns and leads again', code: 3,
        at: { ...log(1, 5), ...log(2, 3), ...log(3, 2), ack: { ...ACK }, back: { x: 442, y: 262 } }, stats: [{ l: 'leader', v: 'broker 1', cls: 'ok' }, { l: 'offsets 3-4', v: 'present', cls: 'ok' }],
        takeaway: 'Keep unclean election off for data you cannot lose, and plan for a partition that stays offline until its ISR returns.' },
    ],
  };

  window.CHAPTER_OVERRIDES[5] = { explain: `
<h3>1. One leader, followers that fetch</h3>
<p>Each partition has one <b>leader</b> and, with a replication factor of 3, two followers. Producers and consumers talk to the leader. The followers are not pushed to. They fetch from the leader with the same fetch protocol that consumers use, and they append what they receive to their own logs. Every replica of a partition is a full copy.</p>

<h3>2. The ISR is the set of replicas that keep up</h3>
<p>The <b>in-sync replica set (ISR)</b> is the leader plus the followers that have caught up recently. A follower stays in the ISR if it has fetched up to the leader’s log end within <code>replica.lag.time.max.ms</code> (default 30 s). If it is behind for longer, the leader removes it, and it is added back when it catches up. Both changes go through the controller as metadata updates.</p>

<h3>3. The high watermark decides what is committed</h3>
<p>The <b>high watermark</b> is the smallest log end offset in the ISR. Offsets below it exist on every in-sync replica, so they are <b>committed</b>. Consumers can read only below the high watermark, and a record that is above it can still be lost if the leader fails. The leader learns the log ends of the followers from their fetch requests, and it tells the followers the high watermark in its fetch responses.</p>

<h3>4. What acks and min.insync.replicas promise</h3>
<p><code>acks=0</code> does not wait, <code>acks=1</code> waits for the leader’s own append, and <code>acks=all</code> waits until the high watermark passes the record, so every in-sync replica has it. With <code>acks=1</code> a leader crash before the followers fetch loses acknowledged records. <code>min.insync.replicas</code> adds a guard to <code>acks=all</code>: the leader rejects a write with <code>NotEnoughReplicasException</code> when the ISR has fewer members than that. Without it, <code>acks=all</code> with an ISR of one is the same as <code>acks=1</code>. The usual durable setting is <code>replication.factor=3</code> with <code>min.insync.replicas=2</code>, which tolerates one broker being down.</p>

<h3>5. Leader change and the leader epoch</h3>
<p>When the leader fails, the controller picks a new one from the ISR. Each leader gets a <b>leader epoch</b>, a number that grows with every change. A follower that returns asks the new leader where the previous epoch ended and truncates its log to that point, rather than trusting the high watermark (KIP-101). This keeps the logs of the replicas from diverging after a failover.</p>
<p>With <code>unclean.leader.election.enable=true</code> the controller may also pick a replica that is not in the ISR when no in-sync one is left. The partition comes back faster, but the new leader may have a shorter log. Records that the old leader acknowledged are then lost. The default is <code>false</code>, which keeps the partition offline until an in-sync replica returns.</p>

<h3>6. The trade-offs and what to watch</h3>
<p>The settings choose between latency, durability and availability. <code>acks=all</code> waits for the slowest in-sync replica, so one slow follower slows every write until it is removed from the ISR. A higher <code>min.insync.replicas</code> protects more, but the partition refuses writes sooner. Watch <code>UnderReplicatedPartitions</code>, <code>UnderMinIsrPartitionCount</code>, <code>IsrShrinksPerSec</code> and <code>IsrExpandsPerSec</code>. A repeating pattern of shrinks and expands is a sign of a slow follower, not of a setting that needs tuning.</p>

<h3>7. Syntax</h3>
<pre># topic or broker config for durable writes
replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
replica.lag.time.max.ms=30000

# producer
acks=all

# look at the leader, the replicas and the ISR of each partition
kafka-topics.sh --bootstrap-server b1:9092 --describe --topic orders
# Topic: orders  Partition: 3  Leader: 1  Replicas: 1,2,3  Isr: 1,2,3

# partitions that are under-replicated or under the minimum ISR
kafka-topics.sh --bootstrap-server b1:9092 --describe --under-replicated-partitions
kafka-topics.sh --bootstrap-server b1:9092 --describe --under-min-isr-partitions</pre>
<p>More: ${KL(KDOC + 'replication', 'Replication')}, ${KL(KDOC + 'topicconfigs_min.insync.replicas', 'min.insync.replicas')} and ${KL(KIP + 'KIP-101+-+Alter+Replication+Protocol+to+use+Leader+Epoch+rather+than+High+Watermark+for+Truncation', 'KIP-101: leader epoch for truncation')}.</p>`, scenarios: [acks, minIsr, flap, unclean] };
})();
