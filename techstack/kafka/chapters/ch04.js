/* Chapter 4 "Idempotent Producer and Retries": scenes and Explain override (index 4, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: a retry with and without a sequence check, a gap in the sequence with five requests in flight, and delivery.timeout.ms expiring.
   Producer IDs, sequence numbers and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. A lost ack and a retry: duplicate without idempotence, ignored with it ---- */
  const FOOT_SEQ = 'Simplified: one partition, one producer, two batches. Values illustrative.';
  const LX = i => 218 + 100 * i;
  const slot = (i, over) => ({ x: LX(i), y: 108, ...(over || {}) });
  const seq = {
    id: 'retry-seq', label: 'Retry with sequence check', desc: 'Batch 1 is retried after its ack is lost. Without a sequence number the leader appends it again; with one, the leader already holds it (values illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        'enable.idempotence=false',
        'retries=2147483647   max.in.flight.requests.per.connection=5',
        '# batch 1 is appended, but its ack is lost',
        '# the producer times out and retries batch 1 after batch 2',
        '# the log now reads 1 2 1: batch 1 twice, and out of order',
      ],
      fix: [
        'enable.idempotence=true   acks=all   max.in.flight.requests.per.connection=5',
        '# the broker assigns a producer ID; each batch gets a sequence per partition',
        '# batch 1 is appended, its ack is lost, the producer retries it',
        '# the retry carries the same producer ID and sequence: the leader already has it',
        '# nothing is appended, the log stays in order',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_SEQ, panels: [
      { id: 'pd', x: 16, y: 58, w: 176, h: 290, title: 'Producer', tone: 'info' },
      { id: 'ld', x: 202, y: 58, w: 428, h: 290, title: 'Leader log, orders-3', tone: 'info' },
    ], tokens: {
      pb1: { label: 'batch 1', sub: 'in flight', tone: 'cursor', w: 150 },
      pb2: { label: 'batch 2', sub: 'in flight', tone: 'cursor', w: 150 },
      rt: { label: 'retry batch 1', sub: 'after timeout', tone: 'warn', w: 150 },
      l0: { label: 'batch 1', sub: 'appended', tone: 'ok', w: 90 },
      l1: { label: 'batch 2', sub: 'appended', tone: 'ok', w: 90 },
      l2: { label: 'batch 1', sub: 'again', tone: 'bad', w: 90 },
      lost: { label: 'ack lost', sub: 'for batch 1', tone: 'bad', w: 150 },
      pid: { label: 'producer ID 7', sub: 'seq per partition', tone: 'live', w: 150 },
      dup: { label: 'duplicate', sub: 'seq 0 already seen', tone: 'ok', w: 170, h: 46 },
      exp: { label: 'next expected seq', sub: '', tone: 'info', w: 170 },
    } },
    bug: [
      { log: 'The producer has idempotence off, retries set very high and up to 5 requests in flight. It sends batch 1 and then batch 2 without waiting.', callout: 'Two batches in flight, no sequence', code: 1,
        at: { pb1: { x: 28, y: 100 }, pb2: { x: 28, y: 152 } }, stats: [{ l: 'enable.idempotence', v: 'false', cls: 'bad' }, { l: 'in flight', v: '2' }] },
      { log: 'The leader appends batch 1. Its acknowledgement is lost, for example during a broker restart, so the producer never sees it.', callout: 'Batch 1 is appended, the ack is lost', moment: true, code: 2,
        at: { pb1: { x: 28, y: 100, tone: 'warn' }, pb2: { x: 28, y: 152 }, l0: slot(0), lost: { x: 28, y: 214 } }, arrows: [['pb1', 'l0', 'send']], stats: [{ l: 'log', v: '1', cls: 'ok' }, { l: 'producer knows', v: 'nothing', cls: 'warn' }] },
      { log: 'Batch 2 is appended and acknowledged. The log reads 1 2.', callout: 'Batch 2 is appended', code: 2,
        at: { pb1: { x: 28, y: 100, tone: 'warn' }, l0: slot(0), l1: slot(1), lost: { x: 28, y: 214 } }, stats: [{ l: 'log', v: '1 2', cls: 'ok' }] },
      { log: 'Batch 1 times out and the producer retries it. The leader has no way to know that it has seen this batch before.', callout: 'The producer retries batch 1', code: 3,
        at: { rt: { x: 28, y: 100 }, l0: slot(0), l1: slot(1), lost: { x: 28, y: 214 } }, stats: [{ l: 'ambiguous timeout', v: 'retry', cls: 'warn' }] },
      { log: 'The leader appends the retry as a new batch. The log reads 1 2 1: batch 1 is stored twice and the second copy sits after batch 2.', callout: 'The log reads 1 2 1', moment: true, code: 4,
        at: { l0: slot(0), l1: slot(1), l2: slot(2), lost: { x: 28, y: 214 } }, stats: [{ l: 'order 7731', v: 'booked twice (illustrative)', cls: 'bad' }, { l: 'order of batches', v: 'broken', cls: 'bad' }],
        takeaway: 'A timeout does not say whether the write landed. A blind retry can duplicate a record and put it after a later one.' },
    ],
    fix: [
      { log: 'With enable.idempotence=true (the default since Kafka 3.0) the broker gives the producer an ID. Every batch gets a sequence number for each partition.', callout: 'A producer ID and a sequence per partition', code: 1,
        at: { pid: { x: 28, y: 100 }, pb1: { x: 28, y: 152, sub: 'PID 7, seq 0' }, pb2: { x: 28, y: 204, sub: 'PID 7, seq 1' } }, stats: [{ l: 'producer ID', v: '7', cls: 'ok' }, { l: 'sequence', v: 'per partition', cls: 'ok' }] },
      { log: 'The leader appends batch 1 (sequence 0) and remembers that it now expects sequence 1. The ack is lost again.', callout: 'Leader expects sequence 1 next', code: 2,
        at: { pid: { x: 28, y: 100 }, pb1: { x: 28, y: 152, sub: 'PID 7, seq 0', tone: 'warn' }, pb2: { x: 28, y: 204, sub: 'PID 7, seq 1' }, l0: slot(0), lost: { x: 28, y: 260 }, exp: { x: 440, y: 190, sub: 'seq 1' } }, arrows: [['pb1', 'l0', 'send']], stats: [{ l: 'next expected', v: '1', cls: 'ok' }] },
      { log: 'Batch 2 (sequence 1) is the next expected one, so it is appended. The leader now expects sequence 2.', callout: 'Sequence 1 is next, so it is appended', code: 2,
        at: { pid: { x: 28, y: 100 }, pb1: { x: 28, y: 152, sub: 'PID 7, seq 0', tone: 'warn' }, l0: slot(0), l1: slot(1), lost: { x: 28, y: 260 }, exp: { x: 440, y: 190, sub: 'seq 2' } }, stats: [{ l: 'next expected', v: '2', cls: 'ok' }] },
      { log: 'The producer retries batch 1 with the same producer ID and the same sequence 0. The leader sees that sequence 0 is below the one it expects.', callout: 'The retry carries the same PID and seq', moment: true, code: 3,
        at: { pid: { x: 28, y: 100 }, rt: { x: 28, y: 152, sub: 'PID 7, seq 0' }, l0: slot(0), l1: slot(1), exp: { x: 440, y: 190, sub: 'seq 2' } }, arrows: [['rt', 'exp', '']], stats: [{ l: 'retry seq', v: '0 (already seen)', cls: 'warn' }] },
      { log: 'The leader recognises the duplicate. It appends nothing and answers success, so the producer stops retrying. The log stays 1 2.', callout: 'A duplicate is acknowledged, not appended', code: 4,
        at: { pid: { x: 28, y: 100 }, l0: slot(0), l1: slot(1), dup: { x: 424, y: 190 } }, stats: [{ l: 'duplicates', v: '0', cls: 'ok' }, { l: 'log', v: '1 2', cls: 'ok' }],
        takeaway: 'Idempotence gives each batch an identity, so a retry is recognised and ignored. It covers one producer session.' },
    ],
  };

  /* ---- 2. Five requests in flight: a sequence gap is rejected and retried in order ---- */
  const GAPR = ['seq 0', 'seq 1', 'seq 2'];
  const gap = {
    id: 'in-flight', label: 'Gap in the sequence', desc: 'With idempotence and up to 5 requests in flight, a lost batch makes later ones arrive with a gap. The leader rejects them, so order is kept (values illustrative).',
    codeLabel: 'Broker log',
    code: { bug: [
      'enable.idempotence=true   max.in.flight.requests.per.connection=5',
      '# batches seq 0, 1 and 2 are in flight; the request with seq 0 is lost on the network',
      '# the leader receives seq 1 but expects seq 0',
      'OutOfOrderSequenceException: The broker received an out of order sequence number.',
      '# the producer retries seq 0, then seq 1 and seq 2, in order',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: producer ID 7, one partition. Sequences illustrative.',
      header: s => ({ left: 'producer ID 7 · orders-3 · 3 batches in flight', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 24, y: 76, w: 592, title: 'Arrivals at the leader', cols: [{ label: 'arrived', w: 110 }, { label: 'leader expects', w: 150 }, { label: 'verdict', w: 332 }], rows: 6, rowH: 18 });
        const chips = {};
        GAPR.forEach((g, i) => { chips[i] = kit.chip(null, { x: 24 + i * 120, y: 244, w: 108, h: 40, label: g, sub: '', tone: 'info', show: false }); });
        const log = kit.chip(null, { x: 24, y: 294, w: 592, h: 34, label: '', sub: '', tone: 'info', show: false });
        return { led, chips, log };
      },
      frame(s, kit, R) {
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r.c, { hl: r.hl, tones: [null, null, r.t], tone: r.t === 'bad' ? 'bad' : '' }));
        GAPR.forEach((g, i) => { const c = (s.fl || {})[i]; R.chips[i].set({ show: !!c, tone: c ? c[0] : 'info', sub: c ? c[1] : '' }); });
        R.log.set({ show: !!s.log, label: s.log || '', tone: s.lt || 'info' });
      },
    },
    bug: [
      { log: 'The producer sends three batches at once, with sequences 0, 1 and 2. Up to five requests may be in flight on one connection.', callout: 'Three requests in flight', code: 0,
        state: { fl: { 0: ['cursor', 'in flight'], 1: ['cursor', 'in flight'], 2: ['cursor', 'in flight'] }, r: 'sent' }, stats: [{ l: 'in flight', v: '3' }, { l: 'next expected', v: 'seq 0' }] },
      { log: 'The request with sequence 0 is lost on the network. Sequence 1 reaches the leader first, and the leader still expects sequence 0.', callout: 'Seq 1 arrives, the leader expects seq 0', moment: true, code: 2,
        state: { fl: { 0: ['bad', 'lost'], 1: ['warn', 'arrived'], 2: ['cursor', 'in flight'] }, rows: [{ c: ['seq 1', 'seq 0', 'gap: not the next one'], t: 'bad', hl: true }], r: 'gap' }, stats: [{ l: 'arrived', v: 'seq 1', cls: 'warn' }, { l: 'expected', v: 'seq 0', cls: 'ok' }] },
      { log: 'The leader does not append a batch with a gap. It answers OutOfOrderSequenceException. Sequence 2 gets the same answer.', callout: 'The leader rejects a gap', code: 3,
        state: { fl: { 0: ['bad', 'lost'], 1: ['bad', 'rejected'], 2: ['bad', 'rejected'] }, rows: [{ c: ['seq 1', 'seq 0', 'OutOfOrderSequenceException'], t: 'bad' }, { c: ['seq 2', 'seq 0', 'OutOfOrderSequenceException'], t: 'bad', hl: true }], r: 'rejected' }, stats: [{ l: 'appended', v: '0', cls: 'ok' }] },
      { log: 'The producer retries the batches in sequence order: 0 first. Now the leader sees the sequence it expects and appends it.', callout: 'Retried in order: seq 0 first', code: 4,
        state: { fl: { 0: ['ok', 'appended'], 1: ['cursor', 'retrying'], 2: ['cursor', 'retrying'] }, rows: [{ c: ['seq 1', 'seq 0', 'OutOfOrderSequenceException'], t: 'bad' }, { c: ['seq 2', 'seq 0', 'OutOfOrderSequenceException'], t: 'bad' }, { c: ['seq 0 (retry)', 'seq 0', 'next expected: append'], t: 'ok', hl: true }], r: 'retry' }, stats: [{ l: 'next expected', v: 'seq 1', cls: 'ok' }] },
      { log: 'Sequences 1 and 2 follow and are appended. The log holds the batches in the order they were sent, with no gap and no duplicate.', callout: 'Order is kept with 5 in flight', moment: true, code: 4,
        state: { fl: { 0: ['ok', 'appended'], 1: ['ok', 'appended'], 2: ['ok', 'appended'] }, rows: [{ c: ['seq 0 (retry)', 'seq 0', 'next expected: append'], t: 'ok' }, { c: ['seq 1 (retry)', 'seq 1', 'next expected: append'], t: 'ok' }, { c: ['seq 2 (retry)', 'seq 2', 'next expected: append'], t: 'ok', hl: true }], log: 'log: seq 0, seq 1, seq 2', lt: 'ok', r: 'ordered' }, stats: [{ l: 'order', v: 'kept', cls: 'ok' }, { l: 'duplicates', v: '0', cls: 'ok' }],
        takeaway: 'The leader appends only the next expected sequence, so up to 5 in-flight requests cannot reorder on retry.' },
    ],
  };

  /* ---- 3. delivery.timeout.ms: the window for send() to a final answer ---- */
  const expire = {
    id: 'expire', label: 'Delivery timeout expires', desc: 'A leader outage longer than delivery.timeout.ms expires the batch. The caller must then treat the write as maybe landed (times illustrative).',
    codeLabel: 'Producer log',
    code: {
      bug: [
        'delivery.timeout.ms=120000   # default, 2 min',
        '# the leader of orders-3 is unreachable for more than 2 min (illustrative)',
        'TimeoutException: Expiring 25 record(s) for orders-3:120000 ms has passed since batch creation',
        '# the callback reports a failure; the write may or may not have landed',
      ],
      fix: [
        '# fix the unavailable leader within the window',
        'delivery.timeout.ms >= linger.ms + request.timeout.ms   # required',
        '# on a failure: re-send from an outbox, with idempotence on',
        '# a failover test shows no callback with an expiry',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one batch of 25 records. Times illustrative.',
      header: s => ({ left: 'delivery.timeout.ms = 120000 · request.timeout.ms = 30000', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 190, rowH: 30, max: 120, unit: '', title: 'Time since the batch was created', items: [
          { id: 't', label: 'elapsed (s of 120)' }, { id: 'a', label: 'send attempts' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 176, w: 592, h: 44, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 230, w: 592, title: 'Caller side', cols: [{ label: 'what', w: 170 }, { label: 'state', w: 422 }], rows: 3, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const t = s.t || 0, a = s.a || 0;
        R.bars.set('t', t, t >= 120 ? 'bad' : t > 60 ? 'warn' : 'ok', t + ' s');
        R.bars.set('a', (a / 10) * 120, a > 4 ? 'warn' : 'ok', a + '');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'At 0 s the application hands 25 records to the producer. They form one batch for orders-3, and the batch starts waiting for its leader.', callout: 'The batch is created at 0 s', code: 0,
        state: { t: 0, a: 0, rows: [['send()', 'returned a future at once']], r: 'start' }, stats: [{ l: 'window', v: '120 s', cls: 'ok' }] },
      { log: 'The leader of orders-3 stops answering. The producer keeps retrying, each request waiting up to request.timeout.ms.', callout: 'The leader is unreachable', code: 1,
        state: { t: 60, a: 3, say: 'requests time out and retry', sub: 'each attempt waits up to request.timeout.ms', tone: 'warn', rows: [['future', 'still pending']], r: 'retrying' }, stats: [{ l: 'attempts', v: '3', cls: 'warn' }, { l: 'elapsed', v: '60 s', cls: 'warn' }] },
      { log: 'The outage lasts longer than the window. When delivery.timeout.ms has passed since the batch was created, the producer stops trying.', callout: 'The 120 s window is used up', moment: true, code: 1,
        state: { t: 120, a: 6, say: 'delivery.timeout.ms reached', sub: 'the batch expires, retries or not', tone: 'bad', rows: [['future', 'completes with an error']], rt: 'bad', r: 'expired' }, stats: [{ l: 'elapsed', v: '120 s', cls: 'bad' }] },
      { log: 'The callback receives a TimeoutException for all 25 records. The producer cannot say whether any request had already reached the log.', callout: 'The callback gets TimeoutException', code: 2,
        state: { t: 120, a: 6, rows: [['callback', 'TimeoutException: Expiring 25 record(s)'], ['outcome', 'unknown: maybe written, maybe not'], ['blind retry', 'can duplicate without idempotence']], rt: 'bad', r: 'unknown' }, stats: [{ l: 'outcome', v: 'unknown', cls: 'warn' }] },
      { log: 'The application has to treat the 25 records as possibly written. Dropping them can lose data, and a blind resend can duplicate it.', callout: 'Maybe written: neither drop nor blindly resend', moment: true, code: 3,
        state: { t: 120, a: 6, say: 'maybe written', sub: 'handle it with an outbox and idempotence', tone: 'warn', rows: [['callback', 'TimeoutException: Expiring 25 record(s)'], ['outcome', 'unknown: maybe written, maybe not']], rt: 'bad', r: 'decide' }, stats: [{ l: 'outcome', v: 'unknown', cls: 'warn' }],
        takeaway: 'delivery.timeout.ms ends the attempt, not the doubt. After an expiry the write may exist, so design for that.' },
    ],
    fix: [
      { log: 'Measure first: the producer’s record-error-rate and the leader election count show how long the outage lasts compared with the window.', callout: 'Measure: outage versus the window', code: 0,
        state: { t: 80, a: 4, rows: [['record-error-rate', 'rises with the outage'], ['window', 'delivery.timeout.ms = 120 s']], r: 'measure' }, stats: [{ l: 'outage', v: 'about 9 s in a normal failover', cls: 'ok' }] },
      { log: 'The unavailable leader is fixed or fails over within the window, for example in about 9 s (illustrative). The batch is acknowledged in time.', callout: 'The leader is back inside the window', moment: true, code: 0,
        state: { t: 9, a: 2, say: 'ack received', sub: 'the batch lands before delivery.timeout.ms', tone: 'ok', rows: [['callback', 'success']], rt: 'ok', r: 'ok' }, stats: [{ l: 'elapsed', v: '9 s', cls: 'ok' }, { l: 'callback', v: 'success', cls: 'ok' }] },
      { log: 'The setting is checked against its rule: delivery.timeout.ms must be at least linger.ms plus request.timeout.ms, or the producer refuses to start.', callout: 'delivery >= linger + request timeout', code: 1,
        state: { t: 9, a: 2, rows: [['linger.ms + request.timeout.ms', '5 + 30000 = 30005 ms'], ['delivery.timeout.ms', '120000 ms: valid']], rt: 'ok', r: 'config check' }, stats: [{ l: 'rule', v: 'satisfied', cls: 'ok' }] },
      { log: 'For the rare batch that does expire, the application re-sends it from an outbox with idempotence on, so a repeat is recognised and dropped.', callout: 'An outbox plus idempotence covers expiry', code: 2,
        state: { t: 9, a: 2, say: 'outbox re-send is safe', sub: 'idempotence ignores the repeat within one producer session', tone: 'ok', rows: [['callback on failure', 'mark the outbox row as not confirmed'], ['re-send', 'same record, idempotence on']], rt: 'ok', r: 'safe' }, stats: [{ l: 'expiry handling', v: 'outbox', cls: 'ok' }],
        takeaway: 'Keep the outage inside the window, and keep unconfirmed writes in an outbox so they can be re-sent safely.' },
    ],
  };

  window.CHAPTER_OVERRIDES[4] = { explain: `
<h3>1. A timeout does not say whether the write landed</h3>
<p>When a produce request times out, the producer cannot tell which of two things happened: the request never reached the leader, or the leader appended it and the answer was lost. If the producer retries blindly, the second case produces a duplicate. If more than one request is in flight, a retried batch can also land after a later batch, so the order is broken.</p>

<h3>2. Producer ID, epoch and sequence numbers</h3>
<p>With <code>enable.idempotence=true</code> the producer asks the broker for a <b>producer ID</b> (PID) and an <b>epoch</b> when it starts. Every batch it sends carries the PID, the epoch and a <b>sequence number</b> for each partition. Sequence numbers start at 0 and grow by the number of records in each batch. The leader keeps, for each producer and partition, the last sequence it appended.</p>

<h3>3. What the leader does with a batch</h3>
<p>The leader compares the batch’s first sequence with the next one it expects. If it is the next one, the leader appends the batch. If it is lower, the batch is a duplicate, and the leader does not append it but answers success with the original offset, so the producer stops retrying. If it is higher, there is a gap: a batch before it was lost. The leader rejects it with <code>OutOfOrderSequenceException</code>, and the producer retries the missing batch first.</p>
<p>This is why <code>max.in.flight.requests.per.connection</code> up to 5 keeps the order. The broker remembers the metadata of the last five batches per producer and partition, which is what lets it recognise their retries.</p>

<h3>4. The settings that go with it</h3>
<p>Idempotence is on by default since Kafka 3.0 (KIP-679), but only when the other settings allow it. It needs <code>acks=all</code>, <code>retries</code> above 0 and <code>max.in.flight.requests.per.connection</code> of at most 5. If you did not set <code>enable.idempotence</code> and another setting conflicts, the producer turns idempotence off and only logs it. If you set <code>enable.idempotence=true</code> explicitly together with a conflicting setting, the producer fails with a <code>ConfigException</code>. Check the producer’s startup log for the effective configuration.</p>

<h3>5. Bounded retries: delivery.timeout.ms</h3>
<p>The producer does not retry for ever. <code>delivery.timeout.ms</code> (default 120000) bounds the time from <code>send()</code> to a final answer, retries included. It must be at least <code>linger.ms + request.timeout.ms</code>. When it passes, the batch expires and the callback gets a <code>TimeoutException</code>. If a request was already in flight at that moment, the outcome is unknown, so the application has to treat the records as possibly written.</p>

<h3>6. The scope: one producer session, one partition</h3>
<p>Deduplication works per partition and only while the producer keeps its PID. A restarted producer gets a new PID, so a re-send after a restart is not recognised. The transactional <code>transactional.id</code> (a later chapter) keeps the identity across restarts. Beyond Kafka, the systems that consumers write to still need their own protection: a dedupe key or an upsert makes the consumer idempotent too.</p>

<h3>7. Syntax</h3>
<pre># producer.properties (all safe defaults in 3.9, shown for clarity)
enable.idempotence=true
acks=all
max.in.flight.requests.per.connection=5
retries=2147483647
delivery.timeout.ms=120000   # must be >= linger.ms + request.timeout.ms
request.timeout.ms=30000

# see the producer ID, epoch and sequence numbers stored in a segment
kafka-dump-log.sh --files /var/lib/kafka/data/orders-3/00000000000000000000.log --print-data-log
# baseOffset: 0 ... producerId: 7 producerEpoch: 0 baseSequence: 0 ...</pre>
<p>More: ${KL(KDOC + 'producerconfigs_enable.idempotence', 'enable.idempotence')}, ${KL(KDOC + 'producerconfigs_delivery.timeout.ms', 'delivery.timeout.ms')} and ${KL(KIP + 'KIP-679%3A+Producer+will+enable+the+strongest+delivery+guarantee+by+default', 'KIP-679: strongest delivery guarantee by default')}.</p>`, scenarios: [seq, gap, expire] };
})();
