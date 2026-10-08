/* Chapter 7 "Consumer Offsets and Commits": scenes and Explain override (index 7, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: commit before or after processing, auto-commit with asynchronous work, and a new group with auto.offset.reset=latest.
   Offsets, counts and timings are illustrative. Defaults are for Kafka 3.9: enable.auto.commit true, auto.commit.interval.ms 5000,
   auto.offset.reset latest, max.poll.records 500. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Commit before or after processing: skipped records or replayed records ---- */
  const FOOT_COMMIT = 'Simplified: a batch of six records, offsets 1 to 6. Illustrative.';
  const lx = i => 30 + 66 * i;            // slot i in the log (offset i + 1)
  const TOK = {};
  for (let i = 1; i <= 6; i++) { TOK['o' + i] = { label: String(i), sub: '', tone: 'info', w: 52, h: 34 }; TOK['i' + i] = { label: 'inv ' + i, sub: '', tone: 'ok', w: 44, h: 34 }; }
  const lg = (n, over) => Object.fromEntries(Array.from({ length: 6 }, (_, k) => ['o' + (k + 1), { x: lx(k), y: 96, ...(over && over[k + 1] ? over[k + 1] : {}) }]));
  const inv = n => Object.fromEntries(Array.from({ length: n }, (_, k) => ['i' + (k + 1), { x: 346 + 46 * k, y: 262 }]));
  /* committed pointer: x under the offset it names (a restart reads from there) */
  const cmAt = (k, extra) => ({ cm: { x: lx(k - 1) - 6, y: 140, ...(extra || {}) } });
  const commit = {
    id: 'commit', label: 'Commit before or after', desc: 'Committing before processing skips records after a crash. Committing after processing repeats them, and an idempotent write absorbs that (offsets illustrative).',
    codeLabel: 'Consumer config',
    code: {
      bug: [
        'enable.auto.commit=true   auto.commit.interval.ms=5000   # defaults',
        '# a batch of six records is polled; invoices 3-6 are not yet written',
        '# the timer commits the polled position before the batch is finished',
        '# the process is killed after invoice 2',
        '# restart resumes at committed offset 7: offsets 3-6 are skipped',
      ],
      fix: [
        'enable.auto.commit=false',
        '# process the batch: write the invoices first',
        'consumer.commitSync()    # only after the processing succeeded',
        '# a crash before the commit replays offsets 3-6 from the committed offset',
        '# an idempotent upsert on (order id) absorbs the replay',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_COMMIT, panels: [
      { id: 'lg', x: 16, y: 58, w: 614, h: 124, title: 'orders-3 · polled batch, offsets 1 to 6', tone: 'info' },
      { id: 'cs', x: 16, y: 194, w: 306, h: 154, title: 'Consumer', tone: 'info' },
      { id: 'db', x: 334, y: 194, w: 296, h: 154, title: 'Invoices table', tone: 'info' },
    ], tokens: {
      ...TOK,
      cm: { label: 'committed 1', sub: 'resume here', tone: 'cursor', w: 104, h: 40 },
      st: { label: 'processing', sub: 'writes invoices', tone: 'live', w: 130 },
      cr: { label: 'killed', sub: 'after invoice 2', tone: 'bad', w: 130 },
      rs: { label: 'restart', sub: '', tone: 'info', w: 130 },
      up: { label: 'upsert', sub: 'no duplicates', tone: 'ok', w: 130 },
    } },
    bug: [
      { log: 'The consumer polls a batch of six records, offsets 1 to 6. The last committed offset is 1, so a restart would begin at offset 1 for now.', callout: 'A batch of six is polled', code: 0,
        at: { ...lg(), ...cmAt(1) }, stats: [{ l: 'batch', v: 'offsets 1-6' }, { l: 'invoices written', v: '0' }] },
      { log: 'The application starts to write invoices. Invoices 1 and 2 reach the database. Offsets 3 to 6 are still waiting.', callout: 'Invoices 1 and 2 are written', code: 1,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' } }), ...cmAt(1), ...inv(2), st: { x: 38, y: 250 } }, stats: [{ l: 'invoices written', v: '2', cls: 'ok' }] },
      { log: 'The auto-commit timer fires, five seconds after the last commit. It commits the position of the last poll: offset 7, the end of the batch. The batch is not finished.', callout: 'The timer commits past unfinished work', moment: true, code: 2,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'warn' }, 4: { tone: 'warn' }, 5: { tone: 'warn' }, 6: { tone: 'warn' } }), cm: { x: lx(5) + 70, y: 140, label: 'committed 7', sub: '' }, ...inv(2), st: { x: 38, y: 250 } }, stats: [{ l: 'committed', v: 'offset 7', cls: 'bad' }, { l: 'processed', v: 'offsets 1-2', cls: 'warn' }] },
      { log: 'The process is OOM-killed after invoice 2. Offsets 3 to 6 were polled and committed, but no invoice exists for them.', callout: 'The process is killed after invoice 2', code: 3,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'warn' }, 4: { tone: 'warn' }, 5: { tone: 'warn' }, 6: { tone: 'warn' } }), cm: { x: lx(5) + 70, y: 140, label: 'committed 7', sub: '' }, ...inv(2), cr: { x: 38, y: 250 } }, stats: [{ l: 'invoices written', v: '2 of 6', cls: 'bad' }] },
      { log: 'The restarted consumer asks for the committed offset and resumes at 7. Offsets 3 to 6 are never delivered again: those orders have no invoice.', callout: 'Restart resumes at 7: offsets 3-6 are skipped', moment: true, code: 4,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'delete' }, 4: { tone: 'delete' }, 5: { tone: 'delete' }, 6: { tone: 'delete' } }), cm: { x: lx(5) + 70, y: 140, label: 'committed 7', sub: '' }, ...inv(2), rs: { x: 38, y: 250, sub: 'resume at 7' } }, stats: [{ l: 'orders without invoice', v: '4', cls: 'bad' }, { l: 'delivery', v: 'at most once', cls: 'bad' }],
        takeaway: 'A restart resumes at the committed offset. If it runs ahead of the finished work, the records in between are skipped.' },
    ],
    fix: [
      { log: 'Auto-commit is off, so the offset does not move on a timer. The same batch of six is polled, and the committed offset stays at 1.', callout: 'Auto-commit is off', code: 0,
        at: { ...lg(), ...cmAt(1) }, stats: [{ l: 'enable.auto.commit', v: 'false', cls: 'ok' }] },
      { log: 'The application writes the invoices first. All six records are processed and stored.', callout: 'Process the whole batch first', code: 1,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'ok' }, 4: { tone: 'ok' }, 5: { tone: 'ok' }, 6: { tone: 'ok' } }), ...cmAt(1), ...inv(6), st: { x: 38, y: 250 } }, stats: [{ l: 'invoices written', v: '6 of 6', cls: 'ok' }] },
      { log: 'Only after the processing succeeds does the code call commitSync(). The committed offset moves to 7.', callout: 'commitSync() after the processing', moment: true, code: 2,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'ok' }, 4: { tone: 'ok' }, 5: { tone: 'ok' }, 6: { tone: 'ok' } }), cm: { x: lx(5) + 70, y: 140, label: 'committed 7', sub: '' }, ...inv(6) }, stats: [{ l: 'committed', v: 'offset 7', cls: 'ok' }, { l: 'delivery', v: 'at least once', cls: 'ok' }] },
      { log: 'If the process had crashed before the commit, the restart would resume at 1 and replay offsets 3 to 6 again. That is the cost of committing after.', callout: 'A crash before the commit replays records', code: 3,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'warn' }, 4: { tone: 'warn' }, 5: { tone: 'warn' }, 6: { tone: 'warn' } }), ...cmAt(1), ...inv(2), rs: { x: 38, y: 250, sub: 'resume at 1' } }, stats: [{ l: 'replayed', v: 'offsets 3-6', cls: 'warn' }] },
      { log: 'The replay runs an upsert keyed by the order id, so a record that was already written changes nothing. No invoice is lost and none is duplicated.', callout: 'An idempotent write absorbs the replay', moment: true, code: 4,
        at: { ...lg({ 1: { tone: 'ok' }, 2: { tone: 'ok' }, 3: { tone: 'ok' }, 4: { tone: 'ok' }, 5: { tone: 'ok' }, 6: { tone: 'ok' } }), cm: { x: lx(5) + 70, y: 140, label: 'committed 7', sub: '' }, ...inv(6), up: { x: 38, y: 250 } }, stats: [{ l: 'duplicate invoices', v: '0', cls: 'ok' }, { l: 'missing invoices', v: '0', cls: 'ok' }],
        takeaway: 'Commit after processing, and make the processing idempotent. A repeat is then harmless, and a gap cannot happen.' },
    ],
  };

  /* ---- 2. Auto-commit with asynchronous work: the commit runs ahead of the finished work ---- */
  const asyncC = {
    id: 'async', label: 'Auto-commit with async work', desc: 'poll() hands records to worker threads and commits what it returned, not what the workers finished. A crash loses the queue (counts illustrative).',
    codeLabel: 'Consumer code',
    code: { bug: [
      'enable.auto.commit=true',
      'records = consumer.poll(Duration.ofMillis(500));   // 100 records',
      'for (r : records) workers.submit(() -> handle(r));  // returns at once',
      '// the next poll() auto-commits the offsets returned by this poll()',
      '// the process dies while the workers still have a queue',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one partition, one poll of 100 records. Counts illustrative.',
      header: s => ({ left: 'orders-3 · positions of one consumer', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 190, rowH: 30, max: 100, unit: '', title: 'Offsets of the polled batch (0 to 100)', items: [
          { id: 'poll', label: 'returned by poll()' }, { id: 'com', label: 'committed' }, { id: 'done', label: 'finished by workers' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'After a restart', cols: [{ label: 'what', w: 230 }, { label: 'state', w: 362 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const p = s.poll || 0, c = s.com || 0, d = s.done || 0;
        R.bars.set('poll', p, 'info', p + ''); R.bars.set('com', c, c > d ? 'bad' : 'ok', c + ''); R.bars.set('done', d, d < c ? 'warn' : 'ok', d + '');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The consumer polls 100 records. The loop hands each one to a worker pool with submit(), which returns at once.', callout: 'poll() returns 100 records', code: 1,
        state: { poll: 100, com: 0, done: 0, say: '100 records are queued for the workers', sub: 'the polling thread is free again', tone: 'info', r: 'polled' }, stats: [{ l: 'polled', v: '100' }, { l: 'finished', v: '0' }] },
      { log: 'The polling thread goes back to poll(). Before it fetches more, the consumer auto-commits the offsets that the previous poll returned: 100.', callout: 'The next poll() commits offset 100', moment: true, code: 3,
        state: { poll: 100, com: 100, done: 15, say: 'committed 100, finished 15', sub: 'the commit counts what was returned, not what was done', tone: 'bad', r: 'auto-commit' }, stats: [{ l: 'committed', v: '100', cls: 'bad' }, { l: 'finished', v: '15', cls: 'warn' }] },
      { log: 'The workers keep going through the queue, but they are slow. 30 of the 100 records are finished.', callout: 'The workers are still busy', code: 3,
        state: { poll: 100, com: 100, done: 30, r: 'working' }, stats: [{ l: 'finished', v: '30 of 100', cls: 'warn' }, { l: 'in the queue', v: '70', cls: 'warn' }] },
      { log: 'The process crashes. The 70 records in the worker queue were polled and committed, but they were never handled.', callout: 'The process crashes with 70 queued', code: 4,
        state: { poll: 100, com: 100, done: 30, say: 'the queue is lost with the process', sub: '70 records were never handled', tone: 'bad', r: 'crash' }, stats: [{ l: 'lost work', v: '70 records', cls: 'bad' }] },
      { log: 'After the restart the consumer resumes at the committed offset 100. The 70 records are not delivered again, and nothing reports an error.', callout: 'Restart resumes at 100: 70 records skipped', moment: true, code: 4,
        state: { poll: 100, com: 100, done: 30, rows: [['resumes at', 'committed offset 100'], ['records 31 to 100', 'never handled, no error']], rt: 'bad', r: 'after restart' }, stats: [{ l: 'records lost', v: '70', cls: 'bad' }],
        takeaway: 'Auto-commit follows poll(), not your work. With asynchronous processing, commit only what the workers have finished.' },
    ],
  };

  /* ---- 3. A new group: auto.offset.reset decides where it starts ---- */
  const reset = {
    id: 'reset', label: 'New group, latest reset', desc: 'A new group with auto.offset.reset=latest starts at the log end, so the 4 million historical events are never read (counts illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        'kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group invoice-v2',
        "Consumer group 'invoice-v2' does not exist.   # no committed offset yet",
        'auto.offset.reset=latest   # the default',
        '# no committed offset: start at the log end',
        '# the 4,000,000 events before it are never read',
      ],
      fix: [
        'auto.offset.reset=earliest   # for a rebuild from history; or none to fail fast',
        'kafka-consumer-groups.sh --bootstrap-server b1:9092 --group invoice-v2 \\',
        '  --topic orders --reset-offsets --to-earliest --execute',
        '# lag starts at the backlog size and falls as the group catches up',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one partition with 4 million old events. Counts illustrative.',
      header: s => ({ left: 'group invoice-v2 · topic orders-3', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 190, rowH: 30, max: 4, unit: '', title: 'Position in the log (millions of offsets)', items: [
          { id: 'end', label: 'log end offset' }, { id: 'pos', label: 'group position' }, { id: 'lag', label: 'lag (events left to read)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Consumer start', cols: [{ label: 'setting', w: 230 }, { label: 'value', w: 362 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const pos = s.pos || 0, lag = 4 - pos;
        R.bars.set('end', 4, 'info', '4.0 M'); R.bars.set('pos', pos, pos >= 3.99 ? 'ok' : 'warn', pos.toFixed(1) + ' M');
        R.bars.set('lag', s.nolag ? 0 : lag, lag > 0.1 && !s.nolag ? 'warn' : 'ok', (s.nolag ? 0 : lag).toFixed(1) + ' M');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The topic holds 4 million historical events. A new group, invoice-v2, is deployed to compute invoices for them.', callout: 'A new group, 4 million old events', code: 0,
        state: { pos: 0, nolag: true, rows: [['committed offset', 'none: the group is new']], r: 'new group' }, stats: [{ l: 'backlog', v: '4,000,000', cls: 'warn' }] },
      { log: 'The group has no committed offset, so the client falls back to auto.offset.reset. In this client it is latest, the default.', callout: 'No committed offset: use auto.offset.reset', code: 2,
        state: { pos: 0, nolag: true, rows: [['committed offset', 'none'], ['auto.offset.reset', 'latest (default)']], rt: 'warn', r: 'falls back' }, stats: [{ l: 'auto.offset.reset', v: 'latest', cls: 'warn' }] },
      { log: 'latest means the log end at the time of the first fetch. The group starts at offset 4,000,000, the position after the newest event.', callout: 'The group starts at the log end', moment: true, code: 3,
        state: { pos: 4, nolag: true, say: 'start offset = log end', sub: 'everything before it is behind the group', tone: 'bad', r: 'at the end' }, stats: [{ l: 'start offset', v: '4,000,000', cls: 'bad' }, { l: 'lag', v: '0', cls: 'ok' }] },
      { log: 'The group looks healthy: its lag is zero. But the 4 million events before its start are never fetched, and nothing logs an error.', callout: 'Zero lag, and a silent gap', code: 4,
        state: { pos: 4, nolag: true, rows: [['lag', '0: looks healthy'], ['events read', '0 of 4,000,000']], rt: 'bad', r: 'quiet gap' }, stats: [{ l: 'backlog read', v: '0 of 4M', cls: 'bad' }],
        takeaway: 'latest hides history without an error. Choose earliest or none on purpose when a new group needs the past.' },
    ],
    fix: [
      { log: 'For a rebuild from history the client sets auto.offset.reset=earliest. A group with no committed offset then starts at the log start.', callout: 'earliest: start at the log start', code: 0,
        state: { pos: 0, rows: [['committed offset', 'none'], ['auto.offset.reset', 'earliest']], rt: 'ok', r: 'earliest' }, stats: [{ l: 'start offset', v: '0', cls: 'ok' }] },
      { log: 'If the group already exists and is inactive, its committed offsets can be reset to the earliest offset before it starts, with --reset-offsets.', callout: 'Or reset an inactive group', code: 2,
        state: { pos: 0, say: '--reset-offsets --to-earliest --execute', sub: 'the group must have no active members', tone: 'ok', rows: [['committed offset', 'reset to 0']], rt: 'ok', r: 'reset' }, stats: [{ l: 'group state', v: 'inactive', cls: 'ok' }] },
      { log: 'The group reads the backlog. Its lag starts at 4 million and falls as the group catches up.', callout: 'The lag starts at the backlog and falls', moment: true, code: 3,
        state: { pos: 1.5, r: 'replaying' }, stats: [{ l: 'read', v: '1.5M of 4M', cls: 'warn' }] },
      { log: 'The group reaches the log end. All 4 million events were processed, and the lag is zero because it caught up, not because it skipped.', callout: 'Caught up, nothing skipped', code: 3,
        state: { pos: 4, r: 'caught up' }, stats: [{ l: 'backlog read', v: '4M of 4M', cls: 'ok' }, { l: 'lag', v: '0', cls: 'ok' }],
        takeaway: 'Zero lag only means something if the group started where it should. Check the start offset of a new group.' },
    ],
  };

  window.CHAPTER_OVERRIDES[7] = { explain: `
<h3>1. Reading does not delete, so each group has its own position</h3>
<p>When a consumer reads a record, nothing is removed from the log. Retention decides how long records stay. Each <b>consumer group</b> therefore keeps its own position for every partition it reads, and twelve teams can read <code>orders</code> at their own pace. Two numbers matter. The <b>position</b> is the offset of the next record the consumer will fetch, and it moves forward as <code>poll()</code> returns records. The <b>committed offset</b> is the value that was saved, and it is where a restart, or another consumer that takes over the partition, resumes.</p>

<h3>2. Where the offsets are stored</h3>
<p>A commit is a write to an internal compacted topic, <code>__consumer_offsets</code> (50 partitions by default). The key is the group, the topic and the partition, and the value is the offset. Compaction keeps only the latest commit for each key. The group coordinator, one broker for each group, handles the commits. The committed value is the offset of the <em>next</em> record to read, so after processing offset 6 the commit is 7.</p>
<p>Offsets of a group that has no active member expire after <code>offsets.retention.minutes</code> (default 10080, which is 7 days). A group that is idle for longer loses its offsets, and on its next start it falls back to <code>auto.offset.reset</code>.</p>

<h3>3. Where you commit decides the delivery guarantee</h3>
<p>If you commit <b>before</b> you process, a crash after the commit and before the work skips records: <b>at most once</b>. If you commit <b>after</b> you process, a crash after the work and before the commit repeats records: <b>at least once</b>. Exactly-once needs more (a later chapter), or an idempotent consumer: for example an upsert keyed by the order id makes a repeat harmless. At-least-once with an idempotent write is the usual safe choice.</p>

<h3>4. Auto-commit follows poll(), not your work</h3>
<p>With <code>enable.auto.commit=true</code> (the default) and <code>auto.commit.interval.ms</code> (default 5000), the consumer commits inside <code>poll()</code> on a timer. It commits the offsets that earlier <code>poll()</code> calls returned. It does not know which records you have finished. If your code hands records to other threads, the commit can run ahead of the real work, and a crash loses what was still queued. For asynchronous processing, turn auto-commit off and commit only the offsets that have finished, with <code>commitSync()</code> or <code>commitAsync()</code>.</p>

<h3>5. commitSync, commitAsync and the cost of committing</h3>
<p><code>commitSync()</code> blocks until the commit is acknowledged and retries on a retriable error, so it is the safe choice at a batch boundary. <code>commitAsync()</code> does not block and does not retry, because a retry could commit an older offset after a newer one. A common pattern is async commits in the loop and a final sync commit on shutdown. Commits are requests to the coordinator, so committing after every record is expensive. Committing after each batch is the usual balance between the work that is repeated and the number of requests.</p>

<h3>6. No committed offset: auto.offset.reset</h3>
<p>A group that has no committed offset for a partition, because it is new or its offsets expired, starts where <code>auto.offset.reset</code> says. <code>latest</code> (the default) is the log end, so everything before it is ignored with no error. <code>earliest</code> is the log start. <code>none</code> throws an exception, which is the safest way to find out that a group started without a position. Consumers that read a topic only for new events want <code>latest</code>, and a group that has to rebuild state wants <code>earliest</code>.</p>

<h3>7. Syntax</h3>
<pre># consumer.properties
enable.auto.commit=false
auto.offset.reset=none          # fail fast instead of a silent start
max.poll.records=500

# commit after the batch is processed
consumer.commitSync();

# look at the position, the committed offset and the lag of a group
kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group invoice-v2
# GROUP  TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  ...

# move an inactive group to the earliest offsets
kafka-consumer-groups.sh --bootstrap-server b1:9092 --group invoice-v2 --topic orders \\
  --reset-offsets --to-earliest --execute</pre>
<p>More: ${KL(KDOC + 'consumerconfigs_enable.auto.commit', 'enable.auto.commit')} and ${KL(KDOC + 'consumerconfigs_auto.offset.reset', 'auto.offset.reset')}.</p>`, scenarios: [commit, asyncC, reset] };
})();
