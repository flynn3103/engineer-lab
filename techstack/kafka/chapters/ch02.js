/* Chapter 2 "Partitioning and Keys": scenes and Explain override (index 2, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: growing the partition count re-routes a key, one hot key loads one partition, and the sticky partitioner with a slow broker.
   Hash results, rates and queue sizes are illustrative: the drawn partition numbers are not real murmur2 outputs. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Growing N: the same key maps to a different partition, and old records stay behind ---- */
  const FOOT_GROW = 'Simplified: partition numbers are illustrative, not real murmur2 values.';
  const px = i => 198 + 70 * (i % 6);
  const py = i => (i < 6 ? 98 : 196);
  const PT = {};
  for (let i = 0; i < 12; i++) PT['p' + i] = { label: 'P' + i, sub: 'orders', tone: 'info', w: 62, h: 44 };
  const parts = (n, over) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i, { x: px(i), y: py(i), ...(over && over[i] ? over[i] : {}) }]));
  const grow = {
    id: 'grow', label: 'Hash key, grow N', desc: 'A key maps to one partition while N stays fixed. Growing N from 6 to 12 routes new events for the same seller to another partition (numbers illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        '# topic orders: 6 partitions, key = seller_id',
        'kafka-topics.sh --bootstrap-server b1:9092 --alter --topic orders --partitions 12',
        '# partition = toPositive(murmur2(key)) % 12',
        '# seller 42: "paid" is in partition 3, "shipped" goes to partition 9',
        '# existing records are not moved',
      ],
      fix: [
        '# decide the partition count before the first event',
        'kafka-topics.sh --bootstrap-server b1:9092 --create --topic orders-v2 --partitions 12',
        '# partition = toPositive(murmur2(key)) % 12 for every event',
        '# seller 42 keeps one partition, so its order holds',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_GROW, panels: [
      { id: 'pr', x: 16, y: 58, w: 166, h: 290, title: 'Producer', tone: 'info' },
      { id: 'tp', x: 190, y: 58, w: 440, h: 290, title: 'Topic orders', tone: 'info' },
    ], tokens: {
      ...PT,
      k: { label: 'key 42', sub: 'seller_id', tone: 'cursor', w: 130 },
      h6: { label: 'hash % 6', sub: '= 3', tone: 'info', w: 130 },
      h12: { label: 'hash % 12', sub: '= 9', tone: 'warn', w: 130 },
      e1: { label: 'paid', sub: '#42', tone: 'ok', w: 62, h: 40 },
      e2: { label: 'shipped', sub: '#42', tone: 'warn', w: 62, h: 40 },
      v: { label: 'Fulfilment sees', sub: 'shipped before paid', tone: 'bad', w: 150 },
    } },
    bug: [
      { log: 'The topic orders has 6 partitions and the key is seller_id. The default partitioner takes the murmur2 hash of the key bytes modulo the partition count.', callout: 'partition = hash(key) % numPartitions', code: 0,
        at: { ...parts(6), k: { x: 32, y: 110 } }, stats: [{ l: 'partitions', v: '6', cls: 'ok' }] },
      { log: 'Seller 42 hashes to 3 when N is 6 (illustrative). The “paid” event is appended to partition 3.', callout: 'Seller 42 maps to partition 3', code: 0,
        at: { ...parts(6, { 3: { tone: 'live', hl: true } }), k: { x: 32, y: 110 }, h6: { x: 32, y: 170 }, e1: { x: px(3), y: 146 } }, arrows: [['k', 'p3', 'key 42']], stats: [{ l: 'seller 42 partition', v: '3', cls: 'ok' }] },
      { log: 'During the sale someone grows the topic to 12 partitions. Six new empty partitions appear and no record moves.', callout: 'The topic grows to 12 partitions', moment: true, code: 1,
        at: { ...parts(12, { 3: { tone: 'live' } }), k: { x: 32, y: 110 }, e1: { x: px(3), y: 146 } }, stats: [{ l: 'partitions', v: '12', cls: 'warn' }, { l: 'records moved', v: '0' }] },
      { log: 'The same key now hashes modulo 12. Seller 42 maps to partition 9 (illustrative), a partition that did not exist before.', callout: 'The same key now maps to partition 9', code: 2,
        at: { ...parts(12, { 3: { tone: 'live' } }), k: { x: 32, y: 110 }, h12: { x: 32, y: 170 }, e1: { x: px(3), y: 146 } }, arrows: [['k', 'p9', 'key 42']], stats: [{ l: 'seller 42 partition', v: '9', cls: 'bad' }] },
      { log: 'The “shipped” event for the same seller is appended to partition 9. One seller’s history is now in two partitions.', callout: 'One seller, two partitions', code: 3,
        at: { ...parts(12, { 3: { tone: 'live' }, 9: { tone: 'warn', hl: true } }), k: { x: 32, y: 110 }, h12: { x: 32, y: 170 }, e1: { x: px(3), y: 146 }, e2: { x: px(9), y: 244 } }, stats: [{ l: 'partitions for seller 42', v: '2', cls: 'bad' }] },
      { log: 'A consumer group reads partitions in parallel. The consumer of partition 9 can be ahead of the consumer of partition 3, so fulfilment sees “shipped” before “paid”.', callout: 'Order across partitions is not defined', moment: true, code: 4,
        at: { ...parts(12, { 3: { tone: 'live' }, 9: { tone: 'warn' } }), e1: { x: px(3), y: 146 }, e2: { x: px(9), y: 244 }, v: { x: 32, y: 250 } }, stats: [{ l: 'order of events', v: 'broken', cls: 'bad' }],
        takeaway: 'Order exists only inside one partition. Changing N changes the modulo, so a key can move to another partition.' },
    ],
    fix: [
      { log: 'The team decides the partition count first. The consumer parallelism needed at peak, plus headroom, gives 12 partitions.', callout: 'Decide N before the first event', code: 0,
        at: { ...parts(12), k: { x: 32, y: 110 } }, stats: [{ l: 'partitions', v: '12', cls: 'ok' }] },
      { log: 'A new topic orders-v2 is created with 12 partitions and the producers are moved to it, with the old topic drained first.', callout: 'Create the topic with its final N', code: 1,
        at: { ...parts(12), k: { x: 32, y: 110 } }, stats: [{ l: 'partition count changes', v: '0 after launch', cls: 'ok' }] },
      { log: 'Every event for seller 42 uses the same modulo 12. “Paid” and “shipped” both go to partition 9.', callout: 'Same key, same modulo, same partition', moment: true, code: 2,
        at: { ...parts(12, { 9: { tone: 'live', hl: true } }), k: { x: 32, y: 110 }, h12: { x: 32, y: 170 }, e1: { x: px(9), y: 244 } }, arrows: [['k', 'p9', 'key 42']], stats: [{ l: 'seller 42 partition', v: '9', cls: 'ok' }] },
      { log: 'The second event follows the first in the same log. A consumer reads them in the order they were sent.', callout: 'One partition keeps the order', code: 3,
        at: { ...parts(12, { 9: { tone: 'ok' } }), e1: { x: px(9), y: 244 }, e2: { x: px(9) + 0, y: 290, tone: 'ok' } }, stats: [{ l: 'partitions for seller 42', v: '1', cls: 'ok' }],
        takeaway: 'Plan the partition count up front. If you must grow it later, expect keys to move, and drain the old topic first.' },
    ],
  };

  /* ---- 2. One hot key: all traffic of a key goes to one partition, and one consumer falls behind ---- */
  const hotBytes = { bug: { p0: 48, p1: 4, p2: 5, p3: 3, p4: 4, p5: 4 }, fix: { p0: 11, p1: 9, p2: 10, p3: 9, p4: 10, p5: 9 } };
  const hot = {
    id: 'hot-key', label: 'Hot key, one partition', desc: 'All events of one busy seller carry the same key, so one partition takes most bytes and its consumer falls behind (rates illustrative).',
    codeLabel: 'Metrics',
    code: {
      bug: [
        '# bytes-in per partition (illustrative)',
        'P0 48 MB/s, P1 4, P2 5, P3 3, P4 4, P5 4',
        '# seller_id is the key: one seller owns most events',
        'kafka-consumer-groups.sh --describe --group billing',
        '# LAG is concentrated on partition 0',
      ],
      fix: [
        '# finer key: seller_id plus a bucket, or a salted key (illustrative)',
        '# the partitioner now spreads the seller over several partitions',
        'P0 11 MB/s, P1 9, P2 10, P3 9, P4 10, P5 9 (illustrative)',
        '# trade-off: the seller’s events are no longer ordered across buckets',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: six partitions, one consumer each. Rates and lag illustrative.',
      header: s => ({ left: 'orders · 6 partitions · key = ' + (s.fine ? 'seller_id + bucket' : 'seller_id'), right: s.r || '' }),
      setup(kit) {
        const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
        const bytes = kit.bars(null, { x: 24, y: 104, w: 290, labelW: 34, rowH: 30, max: 50, unit: '', title: 'bytes-in (MB/s)', items: ids.map(id => ({ id, label: id.toUpperCase() })) });
        const lag = kit.bars(null, { x: 334, y: 104, w: 286, labelW: 34, rowH: 30, max: 100, unit: '', title: 'consumer lag (k records)', items: ids.map(id => ({ id, label: id.toUpperCase() })) });
        const chip = kit.chip(null, { x: 24, y: 300, w: 592, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { ids, bytes, lag, chip };
      },
      frame(s, kit, R) {
        const b = s.bytes || {}, l = s.lag || {};
        R.ids.forEach(id => {
          const hotP = (b[id] || 0) >= 30;
          R.bytes.set(id, b[id] || 0, hotP ? 'bad' : 'ok', b[id] ? b[id] + '' : '');
          R.lag.set(id, l[id] || 0, (l[id] || 0) >= 60 ? 'bad' : (l[id] || 0) > 20 ? 'warn' : 'ok', l[id] ? l[id] + 'k' : '0');
        });
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
      },
    },
    bug: [
      { log: 'The topic has six partitions and the key is seller_id. Before the sale all six partitions carry a similar load.', callout: 'Six partitions, a similar load', code: 0,
        state: { bytes: { p0: 8, p1: 7, p2: 8, p3: 7, p4: 8, p5: 7 }, lag: {}, r: 'before the sale' }, stats: [{ l: 'busiest partition', v: '8 MB/s', cls: 'ok' }] },
      { log: 'One seller starts a flash sale. Most events carry the same key, so the partitioner sends all of them to the same partition: partition 0.', callout: 'One key, one partition, every time', moment: true, code: 2,
        state: { bytes: hotBytes.bug, lag: {}, say: 'seller 42 key -> partition 0', sub: 'hash(key) % 6 is the same for every event', tone: 'warn', r: 'flash sale' }, stats: [{ l: 'P0 bytes-in', v: '48 MB/s', cls: 'bad' }, { l: 'other partitions', v: '3 to 5 MB/s', cls: 'ok' }] },
      { log: 'One consumer owns partition 0 and has to process almost all the traffic. Its lag grows while the others sit idle.', callout: 'One consumer falls behind', code: 3,
        state: { bytes: hotBytes.bug, lag: { p0: 70, p1: 1, p2: 1, p3: 1, p4: 1, p5: 1 }, say: 'consumer of P0 is the bottleneck', sub: 'more consumers cannot share one partition', tone: 'bad', r: 'lag grows' }, stats: [{ l: 'LAG on P0', v: '70k (illustrative)', cls: 'bad' }] },
      { log: 'Adding partitions or consumers does not help. The one key still hashes to one partition, and a partition has one consumer in a group.', callout: 'More partitions do not split one key', code: 4,
        state: { bytes: hotBytes.bug, lag: { p0: 95, p1: 1, p2: 1, p3: 1, p4: 1, p5: 1 }, say: 'a partition has one consumer per group', sub: 'the hot key stays on one partition', tone: 'bad', r: 'lag keeps growing' }, stats: [{ l: 'LAG on P0', v: '95k (illustrative)', cls: 'bad' }],
        takeaway: 'One key cannot be spread: its order and its load live in one partition. Check bytes-in per partition first.' },
    ],
    fix: [
      { log: 'Measure first: bytes-in per partition and the consumer lag show that one partition and one key carry the load.', callout: 'Measure: one partition, one key', code: 0,
        state: { bytes: hotBytes.bug, lag: { p0: 95, p1: 1, p2: 1, p3: 1, p4: 1, p5: 1 }, r: 'before the fix' }, stats: [{ l: 'P0 bytes-in', v: '48 MB/s', cls: 'bad' }] },
      { log: 'The key is refined. The producer adds a bucket, for example the order id modulo a small number, so the seller’s events no longer share one key.', callout: 'Refine the key with a bucket', moment: true, code: 0,
        state: { fine: true, bytes: hotBytes.bug, lag: { p0: 95, p1: 1, p2: 1, p3: 1, p4: 1, p5: 1 }, say: 'key = seller 42 + bucket', sub: 'several keys now hash to several partitions', tone: 'ok', r: 'new key' }, stats: [{ l: 'keys per seller', v: 'several', cls: 'ok' }] },
      { log: 'The partitioner spreads the seller over the partitions. Each one now takes a similar share of the bytes.', callout: 'The seller is spread over partitions', code: 2,
        state: { fine: true, bytes: hotBytes.fix, lag: { p0: 40, p1: 20, p2: 20, p3: 20, p4: 20, p5: 20 }, r: 'rebalanced' }, stats: [{ l: 'P0 bytes-in', v: '11 MB/s', cls: 'ok' }] },
      { log: 'Every consumer has work and the lag drains. The cost is that the seller’s events are ordered inside a bucket, not across all buckets.', callout: 'The lag drains, order is per bucket', code: 3,
        state: { fine: true, bytes: hotBytes.fix, lag: { p0: 4, p1: 3, p2: 3, p3: 3, p4: 3, p5: 3 }, say: 'order is kept per bucket', sub: 'consumers that need a total order must merge', tone: 'warn', r: 'caught up' }, stats: [{ l: 'LAG on P0', v: '4k (illustrative)', cls: 'ok' }],
        takeaway: 'Spread a hot key by refining it, and accept that order now holds only within each finer key.' },
    ],
  };

  /* ---- 3. Null keys: the sticky partitioner and a slow broker, then adaptive partitioning ---- */
  const sticky = {
    id: 'sticky', label: 'Sticky partitioner, slow broker', desc: 'Records without a key fill one batch per partition. When one broker is slow, the old rule keeps feeding it; KIP-794 weights partitions by queue size (numbers illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        '# records have no key; the old sticky rule picks a partition per batch',
        '# the batch switches when it is full, not when the broker is slow',
        '# broker 3 slows down: its batches stay in the producer queue',
        '# partition 3 keeps receiving about a third of the records',
      ],
      fix: [
        '# Kafka 3.3+: uniform sticky partitioner with adaptive partitioning',
        'partitioner.adaptive.partitioning.enable=true   # default',
        '# partitions with long queues get fewer records',
        'partitioner.availability.timeout.ms=0           # default: no timeout',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: three partitions on three brokers. Numbers illustrative.',
      header: s => ({ left: 'no key · one producer · 3 partitions', right: s.r || '' }),
      setup(kit) {
        const ids = ['b1', 'b2', 'b3'];
        const share = kit.bars(null, { x: 24, y: 104, w: 280, labelW: 70, rowH: 30, max: 100, unit: '%', title: 'share of new records', items: [{ id: 'b1', label: 'P1 (B1)' }, { id: 'b2', label: 'P2 (B2)' }, { id: 'b3', label: 'P3 (B3)' }] });
        const q = kit.bars(null, { x: 336, y: 104, w: 284, labelW: 70, rowH: 30, max: 100, unit: '', title: 'producer queue (batches)', items: [{ id: 'b1', label: 'P1 (B1)' }, { id: 'b2', label: 'P2 (B2)' }, { id: 'b3', label: 'P3 (B3)' }] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Producer side', cols: [{ label: 'signal', w: 200 }, { label: 'value', w: 392 }], rows: 2, rowH: 16 });
        return { ids, share, q, chip, led };
      },
      frame(s, kit, R) {
        const sh = s.share || {}, q = s.q || {};
        R.ids.forEach(id => {
          R.share.set(id, sh[id] || 0, id === 'b3' && (sh[id] || 0) > 20 && s.slow ? 'bad' : 'ok', Math.round(sh[id] || 0) + '%');
          R.q.set(id, q[id] || 0, (q[id] || 0) > 60 ? 'bad' : (q[id] || 0) > 25 ? 'warn' : 'ok', q[id] ? q[id] + '' : '0');
        });
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || [['partitioner', 'sticky: switch partition when the batch is full'], ['slow broker', s.slow ? 'B3 (not considered)' : 'none']]).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The producer sends records with a null key. The sticky partitioner fills one batch for one partition, then switches, so batches stay large.', callout: 'Sticky: one batch at a time', code: 0,
        state: { share: { b1: 34, b2: 33, b3: 33 }, q: { b1: 5, b2: 5, b3: 5 }, r: 'all brokers healthy' }, stats: [{ l: 'batches per request', v: 'large', cls: 'ok' }] },
      { log: 'Broker 3 slows down, for example because of a bad disk. It takes longer to acknowledge each batch.', callout: 'Broker 3 gets slow', code: 2,
        state: { slow: true, share: { b1: 34, b2: 33, b3: 33 }, q: { b1: 5, b2: 5, b3: 35 }, say: 'B3 drains batches slowly', sub: 'its in-flight batches are waiting for acks', tone: 'warn', r: 'B3 slow' }, stats: [{ l: 'B3 queue', v: '35 batches', cls: 'warn' }] },
      { log: 'The old rule switches partitions when a batch is full, not when a broker is slow. Partition 3 still gets about a third of the new records.', callout: 'The slow broker is still fed a third', moment: true, code: 3,
        state: { slow: true, share: { b1: 34, b2: 33, b3: 33 }, q: { b1: 5, b2: 5, b3: 70 }, say: 'queue for P3 keeps growing', sub: 'records wait while the other brokers are idle', tone: 'bad', r: 'backlog' }, stats: [{ l: 'B3 queue', v: '70 batches', cls: 'bad' }, { l: 'records for P3', v: '~33%', cls: 'bad' }] },
      { log: 'Records for partition 3 age in the producer buffer. Send latency climbs, and records can hit delivery.timeout.ms.', callout: 'Latency climbs, timeouts follow', code: 3,
        state: { slow: true, share: { b1: 34, b2: 33, b3: 33 }, q: { b1: 5, b2: 5, b3: 95 }, rows: [['record-queue-time-avg', 'grows for the P3 batches'], ['expired batches', 'TimeoutException after delivery.timeout.ms']], rt: 'bad', r: 'timeouts' }, stats: [{ l: 'B3 queue', v: '95 batches', cls: 'bad' }],
        takeaway: 'A partitioner that ignores broker speed keeps feeding the slowest broker, which makes the slowdown worse.' },
    ],
    fix: [
      { log: 'Since Kafka 3.3 (KIP-794) the default uniform sticky partitioner uses adaptive partitioning. It looks at the producer queue of every partition.', callout: 'Adaptive partitioning is on by default', code: 1,
        state: { share: { b1: 34, b2: 33, b3: 33 }, q: { b1: 5, b2: 5, b3: 70 }, rows: [['partitioner.adaptive.partitioning.enable', 'true (default)']], rt: 'ok', r: 'KIP-794' }, stats: [{ l: 'B3 queue', v: '70 batches', cls: 'warn' }] },
      { log: 'A partition with a long queue gets a lower weight. The next batches go mostly to the partitions that drain fast.', callout: 'Long queue, lower weight', moment: true, code: 2,
        state: { share: { b1: 46, b2: 46, b3: 8 }, q: { b1: 6, b2: 6, b3: 60 }, say: 'weights follow queue size', sub: 'P3 gets about 8% of the records (illustrative)', tone: 'ok', r: 'adaptive' }, stats: [{ l: 'records for P3', v: '~8%', cls: 'ok' }] },
      { log: 'The queue of the slow broker drains, and the producer’s latency recovers. Broker 3 still has to be fixed, but it no longer drags the producer down.', callout: 'The queue drains, latency recovers', code: 2,
        state: { share: { b1: 44, b2: 44, b3: 12 }, q: { b1: 6, b2: 6, b3: 15 }, rows: [['partitioner.availability.timeout.ms', '0 (default: no timeout)']], rt: 'ok', r: 'recovered' }, stats: [{ l: 'B3 queue', v: '15 batches', cls: 'ok' }],
        takeaway: 'The adaptive partitioner reacts to a slow broker. It does not remove the need to find out why that broker is slow.' },
    ],
  };

  window.CHAPTER_OVERRIDES[2] = { explain: `
<h3>1. The key picks the partition, and order lives inside it</h3>
<p>A topic is split into partitions, and each partition is one ordered log. Kafka promises order only inside one partition. The producer therefore decides the partition for each record, and the usual way is to hash the record key. All events with the same key then land in the same log, in the order they were sent. Across partitions there is no global order.</p>

<h3>2. The default partitioner, step by step</h3>
<p>For a record with a key, the producer computes <code>toPositive(murmur2(keyBytes)) % numPartitions</code>. For a fixed partition count the same key always maps to the same partition, in every producer instance and every language that uses the same hash. Records without a key use the uniform sticky partitioner instead (see section 5).</p>
<p>The producer learns the partition count from the topic metadata. It refreshes that metadata, so after a change it may use the old count for a short time.</p>

<h3>3. The partition count is part of the data contract</h3>
<p>The count can be raised later, but never lowered without creating a new topic. Raising it changes the modulo. Most keys then map to a different partition, and no existing record moves. The history of one key is split over two logs, and a consumer group that reads them in parallel can see a later event before an earlier one. If order per key matters, create the topic with its final count, or drain the old topic before the producers switch.</p>
<p>The count also limits the consumer parallelism: a consumer group can use at most as many consumers as there are partitions. Plan for the peak, with some headroom, but do not create thousands of partitions “just in case”, because each one costs files, memory and recovery time.</p>

<h3>4. Hot keys: one key is one partition</h3>
<p>Every record of one key goes to one partition. If one seller sends half of the traffic, one partition gets half of the bytes, and one consumer in the group has to read it. More partitions or more consumers cannot split it. Look at bytes-in per partition and the consumer lag per partition. A skew that sits on one partition is almost always a key problem, not a capacity problem.</p>
<p>The fix is a finer key, for example <code>seller_id</code> plus a bucket, or a salt. The price is that order now holds only inside each finer key, and a consumer that needs the whole seller must merge the buckets.</p>

<h3>5. Null keys: the sticky partitioner</h3>
<p>For a record with no key, spreading it round robin would make tiny batches for every partition. The sticky partitioner fills one batch for one partition and only then moves on, which keeps batches large and the load even over time. The first version switched when a batch was full, so a slow broker, whose batches drain slowly, kept receiving about the same share of records and its queue grew. <b>KIP-794</b> (Kafka 3.3 and later) replaced it with the uniform sticky partitioner and adaptive partitioning. A partition with a long producer queue gets a lower weight. <code>partitioner.ignore.keys=true</code> applies the same logic to records that do have a key, at the price of the key’s placement guarantee.</p>

<h3>6. Custom partitioners, and what to measure</h3>
<p>A custom <code>partitioner.class</code> is possible, for example to route by region. It must be deterministic and fast, because the producer calls it for every record. Measure bytes-in per partition (<code>BytesInPerSec</code> per topic and the per-partition log size), the consumer lag per partition, and the producer’s <code>record-queue-time-avg</code>. A skew between partitions, or a partition with a long queue, tells which of the cases above applies.</p>

<h3>7. Syntax</h3>
<pre># create a topic with its final partition count
kafka-topics.sh --bootstrap-server b1:9092 --create --topic orders --partitions 12 --replication-factor 3

# growing a topic re-routes keys: use it with care
kafka-topics.sh --bootstrap-server b1:9092 --alter --topic orders --partitions 24

# where does the load sit? lag per partition
kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group billing

# producer config for records without a key
partitioner.adaptive.partitioning.enable=true     # default since 3.3
partitioner.availability.timeout.ms=0             # default: no timeout
partitioner.ignore.keys=false                     # default</pre>
<p>More: ${KL(KDOC + 'producerconfigs_partitioner.class', 'partitioner.class')} and ${KL(KIP + 'KIP-794%3A+Strictly+Uniform+Sticky+Partitioner', 'KIP-794: Strictly Uniform Sticky Partitioner')}.</p>`, scenarios: [grow, hot, sticky] };
})();
