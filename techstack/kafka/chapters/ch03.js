/* Chapter 3 "Producer Batching and Buffering": scenes and Explain override (index 3, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: linger.ms and batch.size, a full buffer.memory, and compression per batch. Rates and sizes are illustrative.
   Defaults are for Kafka 3.9: linger.ms 0, batch.size 16384, buffer.memory 32 MiB, max.block.ms 60000. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. linger.ms and batch.size: many single-record requests versus a few full ones ---- */
  const FOOT_BATCH = 'Simplified: six records for partition 3 within 10 ms. Rates illustrative.';
  const RY = i => 96 + 38 * i;
  const REC = {};
  for (let i = 0; i < 6; i++) { REC['r' + i] = { label: 'record ' + (i + 1), sub: '', tone: 'info', w: 128, h: 30 }; REC['b' + i] = { label: 'batch ' + (i + 1), sub: '', tone: 'info', w: 110, h: 30 }; REC['q' + i] = { label: 'request ' + (i + 1), sub: '', tone: 'info', w: 150, h: 30 }; }
  const recs = (n, over) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['r' + i, { x: 28, y: RY(i), ...(over && over[i] ? over[i] : {}) }]));
  const batchBug = {
    id: 'batch', label: 'linger.ms and batch.size', desc: 'Closing a batch on time or on size turns many single-record requests into a few full ones (rates illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        'linger.ms=0',
        'batch.size=1024              # small (illustrative; the default is 16384)',
        '# each send() finds nothing to wait for, so the batch is sent at once',
        '# about 38k produce requests/s per producer (illustrative)',
      ],
      fix: [
        'linger.ms=10',
        'batch.size=65536',
        '# about 50 records share one request in 10 ms (illustrative)',
        '# produce requests fall to about 4k/s (illustrative)',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_BATCH, panels: [
      { id: 'sd', x: 16, y: 58, w: 156, h: 290, title: 'send() calls', tone: 'info' },
      { id: 'ac', x: 182, y: 58, w: 232, h: 290, title: 'Accumulator, partition 3', tone: 'info' },
      { id: 'rq', x: 424, y: 58, w: 206, h: 290, title: 'Produce requests', tone: 'info' },
    ], tokens: {
      ...REC,
      big: { label: 'batch 1', sub: '6 records', tone: 'live', w: 210, h: 120 },
      one: { label: 'request 1', sub: '6 records, one header', tone: 'ok', w: 180, h: 60 },
    } },
    bug: [
      { log: 'Six records for partition 3 arrive within 10 ms. The producer has linger.ms=0 and a batch.size of only 1 KB.', callout: 'Six records, linger.ms = 0', code: 0,
        at: { ...recs(6) }, stats: [{ l: 'records', v: '6' }, { l: 'linger.ms', v: '0', cls: 'bad' }] },
      { log: 'With no linger, a batch is ready as soon as it exists. The first record is wrapped in a batch of its own.', callout: 'A batch is ready after one record', code: 2,
        at: { ...recs(6, { 0: { tone: 'warn' } }), b0: { x: 196, y: RY(0), tone: 'warn' } }, arrows: [['r0', 'b0', '']], stats: [{ l: 'records per batch', v: '1', cls: 'bad' }] },
      { log: 'The sender thread turns that batch into a produce request and sends it. Records 2 and 3 do the same, so each one pays a full request.', callout: 'Each record becomes a request', code: 2,
        at: { ...recs(6, { 0: { tone: 'warn' }, 1: { tone: 'warn' }, 2: { tone: 'warn' } }), b0: { x: 196, y: RY(0), tone: 'warn' }, b1: { x: 196, y: RY(1), tone: 'warn' }, b2: { x: 196, y: RY(2), tone: 'warn' }, q0: { x: 440, y: RY(0), tone: 'warn' }, q1: { x: 440, y: RY(1), tone: 'warn' }, q2: { x: 440, y: RY(2), tone: 'warn' } }, stats: [{ l: 'requests so far', v: '3', cls: 'bad' }] },
      { log: 'Six records make six requests. Each request carries its own header, its own network round trip and its own broker work.', callout: 'Six records, six requests', moment: true, code: 3,
        at: { ...recs(6, { 0: { tone: 'warn' }, 1: { tone: 'warn' }, 2: { tone: 'warn' }, 3: { tone: 'warn' }, 4: { tone: 'warn' }, 5: { tone: 'warn' } }), ...Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap(i => [['b' + i, { x: 196, y: RY(i), tone: 'warn' }], ['q' + i, { x: 440, y: RY(i), tone: 'bad' }]])) }, stats: [{ l: 'requests', v: '6', cls: 'bad' }, { l: 'requests per second', v: '~38k per producer', cls: 'bad' }] },
      { log: 'The broker spends its time on per-request work. Its request threads reach about 90% CPU (illustrative) while the network stays almost idle.', callout: 'Broker CPU is busy, bandwidth is idle', code: 3,
        at: { ...recs(6), ...Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap(i => [['b' + i, { x: 196, y: RY(i), tone: 'warn' }], ['q' + i, { x: 440, y: RY(i), tone: 'bad' }]])) }, stats: [{ l: 'broker CPU', v: 'about 90% (illustrative)', cls: 'bad' }, { l: 'bandwidth', v: 'low', cls: 'ok' }],
        takeaway: 'A request has a fixed cost, so one record per request makes the broker busy long before the network is.' },
    ],
    fix: [
      { log: 'linger.ms=10 tells the producer to wait up to 10 ms for more records before it sends a batch.', callout: 'linger.ms=10 holds the batch open', code: 0,
        at: { ...recs(6) }, stats: [{ l: 'linger.ms', v: '10', cls: 'ok' }] },
      { log: 'The six records join one open batch for partition 3. A batch is closed when it holds batch.size bytes or when linger.ms has passed since its first record.', callout: 'Records share one open batch', code: 1,
        at: { ...recs(6, { 0: { tone: 'ok' }, 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'ok' }, 4: { tone: 'ok' }, 5: { tone: 'ok' } }), big: { x: 196, y: 110 } }, stats: [{ l: 'records in batch', v: '6', cls: 'ok' }] },
      { log: 'The 10 ms pass, or the batch reaches batch.size first, whichever comes earlier. The batch is closed and handed to the sender thread.', callout: 'Close on time or on size, first one wins', moment: true, code: 1,
        at: { ...recs(0), big: { x: 196, y: 110, tone: 'ok', sub: 'closed' } }, stats: [{ l: 'closed by', v: 'linger.ms or batch.size', cls: 'ok' }] },
      { log: 'One produce request carries the whole batch. The six records share one header and one round trip.', callout: 'One request for six records', code: 3,
        at: { big: { x: 196, y: 110, tone: 'ok', sub: 'sent' }, one: { x: 440, y: 120 } }, arrows: [['big', 'one', 'send']], stats: [{ l: 'requests', v: '1', cls: 'ok' }] },
      { log: 'For the same bytes, produce requests fall from about 38k/s to about 4k/s (illustrative). The broker CPU drops, and each record waits at most 10 ms.', callout: 'Fewer requests, at most 10 ms of wait', code: 3,
        at: { big: { x: 196, y: 110, tone: 'ok', sub: 'sent' }, one: { x: 440, y: 120 } }, stats: [{ l: 'produce requests', v: 'about 4k/s (illustrative)', cls: 'ok' }, { l: 'added latency', v: '<= 10 ms', cls: 'warn' }],
        takeaway: 'linger.ms trades up to that much latency per record for far fewer requests. Measure records-per-request-avg.' },
    ],
  };

  /* ---- 2. buffer.memory: a slow broker fills the buffer and send() blocks ---- */
  const buffer = {
    id: 'buffer', label: 'Full buffer blocks send()', desc: 'A slow broker fills buffer.memory. send() blocks the calling thread, then throws after max.block.ms (values illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        '# buffer.memory = 32 MiB (default)',
        '# broker 2 is slow: its unsent batches pile up in the buffer',
        '# send() waits for free memory, up to max.block.ms = 60000 (default)',
        'TimeoutException: Failed to allocate memory within the configured max blocking time 60000 ms.',
      ],
      fix: [
        '# fix the slow broker first',
        'max.block.ms=2000        # request threads fail fast (illustrative)',
        '# raise buffer.memory only for a known, short burst',
        '# buffer-available-bytes stays above zero',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one producer, 32 MiB buffer. Values illustrative.',
      header: s => ({ left: 'buffer.memory = 32 MiB · max.block.ms = ' + (s.fast ? '2000' : '60000'), right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 150, rowH: 30, max: 100, unit: '', title: 'Producer state', items: [
          { id: 'used', label: 'buffer used (MiB)' }, { id: 'wait', label: 'send() waiting (s)' }, { id: 'q', label: 'broker 2 queue (ms)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'What the application sees', cols: [{ label: 'thread', w: 170 }, { label: 'state', w: 422 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const used = s.used || 0, wait = s.wait || 0, q = s.q || 0;
        R.bars.set('used', (used / 32) * 100, used >= 32 ? 'bad' : used > 20 ? 'warn' : 'ok', used + ' / 32');
        R.bars.set('wait', (wait / 60) * 100, wait >= 60 ? 'bad' : wait > 0 ? 'warn' : 'ok', wait + ' s');
        R.bars.set('q', (q / 2000) * 100, q > 1000 ? 'bad' : q > 200 ? 'warn' : 'ok', q + ' ms');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The producer sends about 6 MiB per second and its buffer.memory is the 32 MiB default. All brokers answer quickly, so the buffer stays almost empty.', callout: 'Healthy: the buffer is nearly empty', code: 0,
        state: { used: 4, wait: 0, q: 20, r: 'before the slowdown' }, stats: [{ l: 'buffer used', v: '4 of 32 MiB', cls: 'ok' }] },
      { log: 'Broker 2 slows down. Its batches wait longer for acknowledgements, so they stay in the buffer instead of being freed.', callout: 'A slow broker keeps its batches', code: 1,
        state: { used: 18, wait: 0, q: 900, say: 'broker 2 acks slowly', sub: 'its in-flight batches are not freed', tone: 'warn', r: 'broker 2 slow' }, stats: [{ l: 'buffer used', v: '18 of 32 MiB', cls: 'warn' }, { l: 'queue time', v: '900 ms', cls: 'warn' }] },
      { log: 'The application keeps calling send() faster than broker 2 drains. The buffer fills to the 32 MiB limit.', callout: 'The buffer is full', moment: true, code: 1,
        state: { used: 32, wait: 0, q: 1800, say: 'no free memory for the next batch', sub: 'send() has to wait', tone: 'bad', r: 'buffer full' }, stats: [{ l: 'buffer used', v: '32 of 32 MiB', cls: 'bad' }, { l: 'buffer-available-bytes', v: '0', cls: 'bad' }] },
      { log: 'send() now blocks the calling thread. This is back-pressure, but the caller here is an HTTP request thread, so web threads pile up.', callout: 'send() blocks the HTTP thread', code: 2,
        state: { used: 32, wait: 35, q: 1800, rows: [['HTTP thread 1..200', 'blocked inside send() for up to 60 s'], ['p99 API latency', 'tens of seconds']], rt: 'bad', say: 'threads wait for memory', sub: 'max.block.ms is 60000 by default', tone: 'bad', r: 'blocking' }, stats: [{ l: 'threads waiting', v: 'many', cls: 'bad' }] },
      { log: 'After max.block.ms the producer gives up. send() throws a TimeoutException and the HTTP request fails.', callout: 'After 60 s send() throws', moment: true, code: 3,
        state: { used: 32, wait: 60, q: 1800, rows: [['HTTP thread 1..200', 'TimeoutException: Failed to allocate memory'], ['HTTP response', '500 after 60 s']], rt: 'bad', r: 'failed' }, stats: [{ l: 'result', v: 'TimeoutException', cls: 'bad' }],
        takeaway: 'A bigger buffer only delays the failure. A full buffer means the producer is faster than the cluster.' },
    ],
    fix: [
      { log: 'Measure first: buffer-available-bytes at zero and a high record-queue-time for broker 2 point at a slow broker, not at a small buffer.', callout: 'Measure: the queue time, then the broker', code: 0,
        state: { used: 32, wait: 40, q: 1800, say: 'buffer-available-bytes = 0', sub: 'record-queue-time is high for broker 2', tone: 'warn', r: 'before the fix' }, stats: [{ l: 'buffer used', v: '32 of 32 MiB', cls: 'bad' }] },
      { log: 'The slow broker is fixed first, for example its disk or its leader load. Its acknowledgements speed up and the buffer drains.', callout: 'Fix the slow broker first', moment: true, code: 0,
        state: { used: 8, wait: 0, q: 60, r: 'broker recovered' }, stats: [{ l: 'buffer used', v: '8 of 32 MiB', cls: 'ok' }, { l: 'queue time', v: '60 ms', cls: 'ok' }] },
      { log: 'On request threads max.block.ms is lowered, so a full buffer makes the caller fail fast instead of hanging a web thread for a minute.', callout: 'Request threads fail fast', fast: true, code: 1,
        state: { fast: true, used: 8, wait: 0, q: 60, rows: [['HTTP thread', 'send() fails after 2 s at most'], ['handling', 'return an error or queue the event elsewhere']], rt: 'ok', r: 'fail fast' }, stats: [{ l: 'max.block.ms', v: '2000', cls: 'ok' }] },
      { log: 'buffer.memory is raised only for a known, short burst. buffer-available-bytes stays above zero, so send() returns at once.', callout: 'Buffer space stays available', code: 3,
        state: { fast: true, used: 10, wait: 0, q: 60, r: 'steady' }, stats: [{ l: 'buffer-available-bytes', v: '> 0', cls: 'ok' }],
        takeaway: 'Use the buffer to absorb bursts, not a broker that stays slow. Alert on buffer-available-bytes.' },
    ],
  };

  /* ---- 3. Compression works on a batch: tiny batches do not shrink ---- */
  const compress = {
    id: 'compression', label: 'Compression per batch', desc: 'compression.type is applied to a whole batch. A batch of one or two records has little to remove (ratios illustrative).',
    codeLabel: 'Producer config',
    code: { bug: [
      'compression.type=lz4',
      '# linger.ms=0: a batch holds 1 or 2 records',
      '# a tiny batch has little repeated data, so the ratio stays near 1',
      '# larger batches compress better: more repeated field names and values',
      'linger.ms=10   # records share a batch, ratio improves',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: JSON order events of about 400 bytes. Ratios illustrative.',
      header: s => ({ left: 'compression.type = lz4 · bytes on the wire per record', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 190, rowH: 38, max: 100, unit: '%', title: 'Size after compression (100% = uncompressed)', items: [
          { id: 'a', label: 'batch of 1 record' }, { id: 'b', label: 'batch of 3 records' }, { id: 'c', label: 'batch of 50 records' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 252, w: 592, h: 44, label: '', sub: '', tone: 'info', show: false });
        return { bars, chip };
      },
      frame(s, kit, R) {
        const v = s.v || {};
        ['a', 'b', 'c'].forEach(k => R.bars.set(k, v[k] || 0, (v[k] || 0) > 85 ? 'bad' : (v[k] || 0) > 50 ? 'warn' : 'ok', v[k] ? v[k] + '%' : ''));
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
      },
    },
    bug: [
      { log: 'The producer compresses with lz4. Compression is applied to a whole batch, never to a single record on its own.', callout: 'Compression works per batch', code: 0,
        state: { v: {}, r: 'lz4' }, stats: [{ l: 'unit of compression', v: 'batch', cls: 'ok' }] },
      { log: 'With linger.ms=0 a batch holds one record. It has no repeated data inside it and still carries the batch header, so the size stays near 100%.', callout: 'One record: nothing to remove', moment: true, code: 1,
        state: { v: { a: 97 }, say: 'tiny batch, almost no gain', sub: 'a header per record plus little repetition', tone: 'bad', r: 'linger.ms = 0' }, stats: [{ l: 'ratio', v: '~1.03:1 (illustrative)', cls: 'bad' }] },
      { log: 'A few records in a batch share field names such as order_id and seller_id, so the compressor finds repeats.', callout: 'A few records start to share bytes', code: 3,
        state: { v: { a: 97, b: 62 }, say: 'repeated JSON field names', sub: 'three records share keys', tone: 'warn', r: 'small batch' }, stats: [{ l: 'ratio', v: '~1.6:1 (illustrative)', cls: 'warn' }] },
      { log: 'With linger.ms=10 about 50 records share a batch. Field names and common values repeat, and the compressor removes most of them.', callout: 'Fifty records share one batch', moment: true, code: 4,
        state: { v: { a: 97, b: 62, c: 28 }, say: 'a bigger batch compresses better', sub: 'less network, less disk, less replication traffic', tone: 'ok', r: 'linger.ms = 10' }, stats: [{ l: 'ratio', v: '~3.5:1 (illustrative)', cls: 'ok' }] },
      { log: 'The broker stores the compressed batch as it received it, and followers and consumers get the same bytes, so the saving carries through the whole path.', callout: 'The saving carries to disk and followers', code: 3,
        state: { v: { a: 97, b: 62, c: 28 }, r: 'end to end' }, stats: [{ l: 'ratio', v: '~3.5:1', cls: 'ok' }, { l: 'cost', v: 'producer CPU', cls: 'warn' }],
        takeaway: 'Batch first, then the codec has something to compress. Watch compression-rate-avg.' },
    ],
  };

  window.CHAPTER_OVERRIDES[3] = { explain: `
<h3>1. A request has a fixed cost</h3>
<p>Every produce request costs the broker a fixed amount of work: reading the request, authenticating, checking the topic, writing to the log and building a response. That cost is the same for a request with one record and for a request with fifty. If a producer sends every record alone, the broker’s request threads become the limit long before the network is. Batching spreads the fixed cost over many records.</p>

<h3>2. The RecordAccumulator and the Sender</h3>
<p>The producer has two parts. When your code calls <code>send()</code>, the record is serialised, a partition is chosen, and the record is appended to the open batch for that partition in the <b>RecordAccumulator</b>. A separate <b>Sender</b> thread drains the batches that are ready and groups them by the broker that leads each partition. One request then carries one batch for every partition that broker leads. <code>send()</code> returns a future; the record is not on the broker yet.</p>

<h3>3. When a batch closes</h3>
<p>A batch is ready when it holds <code>batch.size</code> bytes (default 16384) or when <code>linger.ms</code> has passed since its first record (default 0 in Kafka 3.9), whichever comes first. With <code>linger.ms=0</code> the Sender sends whatever is ready right away. Under light load that means one record per request, and under heavy load the batches still fill while earlier requests are in flight, so they grow by themselves.</p>
<p>The wait is bounded. A record waits at most <code>linger.ms</code> for its batch to close, so a value of 5 to 20 ms adds a small, known latency and often lowers the end-to-end latency under load, because the broker is less busy.</p>

<h3>4. Compression works on a whole batch</h3>
<p><code>compression.type</code> (<code>none</code>, <code>gzip</code>, <code>snappy</code>, <code>lz4</code>, <code>zstd</code>) is applied to the batch. A batch of one record has almost nothing to compress, and a larger batch repeats field names and values, so it compresses much better. The broker keeps the batch compressed, and followers and consumers receive the same bytes. The cost is producer CPU for compressing and consumer CPU for decompressing.</p>

<h3>5. The buffer is bounded, and that is back-pressure</h3>
<p>The unsent batches live in <code>buffer.memory</code> (default 32 MiB). When the buffer is full, <code>send()</code> blocks for up to <code>max.block.ms</code> (default 60 s) and then throws a <code>TimeoutException</code>. Blocking is the intended back-pressure. It becomes a problem when the caller is a request thread, because every blocked thread is a web thread that cannot serve anyone. A bigger buffer hides a slow broker for longer and loses more unsent data if the process dies. It does not remove the cause.</p>
<p>Separately, <code>delivery.timeout.ms</code> (default 120 s) bounds how long a batch may take from <code>send()</code> to a final answer, including retries. A batch that sits in the buffer behind a slow broker can expire there.</p>

<h3>6. The trade-off, and what to measure</h3>
<p><code>linger.ms</code> and <code>batch.size</code> trade a little latency and memory for far fewer requests. Measure <code>records-per-request-avg</code>, <code>batch-size-avg</code>, <code>request-rate</code>, <code>record-queue-time-avg</code>, <code>compression-rate-avg</code> and <code>buffer-available-bytes</code>. A <code>batch-size-avg</code> far below <code>batch.size</code> means batches close on time before they fill. A <code>buffer-available-bytes</code> near zero means the producer is faster than the cluster.</p>

<h3>7. Syntax</h3>
<pre># producer.properties
linger.ms=10
batch.size=65536
compression.type=lz4
buffer.memory=33554432      # default, 32 MiB
max.block.ms=2000           # on request threads: fail fast
delivery.timeout.ms=120000  # default

# the producer metrics worth watching (JMX: kafka.producer:type=producer-metrics)
records-per-request-avg  batch-size-avg  request-rate
record-queue-time-avg    compression-rate-avg  buffer-available-bytes</pre>
<p>More: ${KL(KDOC + 'producerconfigs_linger.ms', 'linger.ms')} and ${KL(KDOC + 'producerconfigs_buffer.memory', 'buffer.memory')}.</p>`, scenarios: [batchBug, buffer, compress] };
})();
