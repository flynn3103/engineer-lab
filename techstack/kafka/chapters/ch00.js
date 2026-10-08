/* Chapter 0 "Log Segments and Offsets": scenes and Explain override (index 0, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: finding offset 9,000,000 without and with the segment index, a time lookup skewed by a producer clock, and a segment roll.
   Sizes, offsets and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Lookup: scan from segment 0 versus pick the segment by file name, then the sparse index ---- */
  const FOOT_LOOK = 'Simplified: five segments, offsets and timings illustrative.';
  const SEGS = [['0', 'base 0'], ['2.9M', 'base 2,900,000'], ['5.8M', 'base 5,800,000'], ['8.7M', 'base 8,700,000'], ['11.6M', 'base 11,600,000 (active)']];
  const segPos = i => ({ x: 180, y: 96 + i * 50 });
  const SEG_TOKENS = {};
  SEGS.forEach(([k, sub], i) => { SEG_TOKENS['s' + i] = { label: k + '.log', sub, tone: 'info', w: 210, h: 42 }; });
  const segs = over => Object.fromEntries(SEGS.map((_, i) => ['s' + i, { ...segPos(i), ...(over && over[i] ? over[i] : {}) }]));
  const QPOS = { x: 24, y: 130 };
  const lookup = {
    id: 'lookup', label: 'Scan vs index lookup', desc: 'The replay tool either reads every segment from 0, or jumps to the segment named for the target and uses its index (sizes illustrative).',
    codeLabel: 'Replay',
    code: {
      bug: [
        '# replay tool: orders-3, target offset 9000000',
        '# no index use: start at segment 0',
        '# read each segment in order, dropping records below the target',
        '# the target segment is reached after about 40 min (illustrative)',
      ],
      fix: [
        '# the segment files are named by base offset',
        '# pick the greatest base offset at or below 9000000: 8700000',
        '# binary search 8700000.index for the closest entry',
        '# scan a few KB of 8700000.log: offset 9000000 found',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_LOOK, panels: [
      { id: 'rp', x: 16, y: 58, w: 150, h: 290, title: 'Replay tool', tone: 'info' },
      { id: 'dp', x: 170, y: 58, w: 230, h: 290, title: 'orders-3 directory', tone: 'info' },
      { id: 'fp', x: 414, y: 58, w: 216, h: 290, title: 'Segment 8.7M files', tone: 'info' },
    ], tokens: {
      ...SEG_TOKENS,
      q: { label: 'seek 9.0M', sub: 'orders-3', tone: 'cursor', w: 126 },
      idx: { label: '.index', sub: 'sparse, memory-mapped', tone: 'info', w: 192 },
      log: { label: '.log', sub: 'batches with CRC', tone: 'info', w: 192 },
      hit: { label: 'offset 9,000,000', sub: 'found', tone: 'ok', w: 192 },
    } },
    bug: [
      { log: 'The replay tool must start at offset 9,000,000 of orders-3. The partition holds five segments and about 1 TB (illustrative).', callout: 'Target: offset 9,000,000', code: 0,
        at: { q: { ...QPOS }, ...segs() }, stats: [{ l: 'partition size', v: '~1 TB (illustrative)', cls: 'warn' }, { l: 'segments', v: '5' }] },
      { log: 'The tool does not use the file names or the index. It starts at the first segment and reads forward.', callout: 'It starts at the first segment', code: 1,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'bad', sub: 'reading', hl: true } }) }, arrows: [['q', 's0', 'read']], stats: [{ l: 'segments read', v: '1', cls: 'bad' }] },
      { log: 'Every record below the target is read and then dropped. Segments 0 and 1 are consumed completely.', callout: 'Records below the target are dropped', code: 2,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'bad', sub: 'dropped' }, 1: { tone: 'bad', sub: 'reading', hl: true } }) }, arrows: [['q', 's1', 'read']], stats: [{ l: 'segments read', v: '2', cls: 'bad' }] },
      { log: 'Segment 2 is dropped too. The disk is at 100% read, and other consumers on the broker start to lag.', callout: 'Disk at 100% read', code: 2,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'bad', sub: 'dropped' }, 1: { tone: 'bad', sub: 'dropped' }, 2: { tone: 'bad', sub: 'reading', hl: true } }) }, arrows: [['q', 's2', 'read']], stats: [{ l: 'segments read', v: '3', cls: 'bad' }, { l: 'disk read', v: '100%', cls: 'bad' }] },
      { log: 'Only in segment 3 does the tool meet offset 9,000,000. It had to read about 8,700,000 records it never wanted.', callout: 'The target is in segment 3', moment: true, code: 3,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'bad', sub: 'dropped' }, 1: { tone: 'bad', sub: 'dropped' }, 2: { tone: 'bad', sub: 'dropped' }, 3: { tone: 'ok', sub: 'target here', hl: true } }) }, arrows: [['q', 's3', 'found']], stats: [{ l: 'records dropped', v: '~8.7M', cls: 'bad' }, { l: 'time to target', v: '40 min (illustrative)', cls: 'bad' }] },
      { log: 'The cost grows with the offset. A target near the end of a 1 TB partition always costs nearly a full scan.', callout: 'Cost grows with the target offset', code: 3,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'bad', sub: 'dropped' }, 1: { tone: 'bad', sub: 'dropped' }, 2: { tone: 'bad', sub: 'dropped' }, 3: { tone: 'ok', sub: 'target here' } }) }, stats: [{ l: 'time to target', v: '40 min (illustrative)', cls: 'bad' }],
        takeaway: 'Without the file names and the index, a seek is a scan, and a scan of a big partition takes minutes.' },
    ],
    fix: [
      { log: 'The broker lists the segment files. Each one is named by the base offset of its first record, so the names are a sorted map of the partition.', callout: 'File names are base offsets', code: 0,
        at: { q: { ...QPOS }, ...segs() }, stats: [{ l: 'files listed', v: '5', cls: 'ok' }, { l: 'data read', v: '0' }] },
      { log: 'The broker takes the greatest base offset that is at or below 9,000,000. That is 8,700,000, so the other four segments are never opened.', callout: 'Greatest base offset at or below the target', moment: true, code: 1,
        at: { q: { ...QPOS }, ...segs({ 0: { tone: 'info', sub: 'skipped' }, 1: { sub: 'skipped' }, 2: { sub: 'skipped' }, 3: { tone: 'ok', sub: 'chosen', hl: true }, 4: { sub: 'skipped' } }) }, arrows: [['q', 's3', 'by name']], stats: [{ l: 'segments opened', v: '1', cls: 'ok' }, { l: 'segments skipped', v: '4', cls: 'ok' }] },
      { log: 'Inside the chosen segment, the broker opens the sparse .index file. It holds one entry for every index.interval.bytes of data, so it stays small.', callout: 'The sparse index is memory-mapped', code: 2,
        at: { q: { ...QPOS }, ...segs({ 3: { tone: 'ok', sub: 'chosen' } }), idx: { x: 424, y: 100, tone: 'live', hl: true }, log: { x: 424, y: 170 } }, stats: [{ l: 'index entries', v: 'one per 4 KB (default)', cls: 'ok' }] },
      { log: 'A binary search on the index finds the closest entry at or below offset 9,000,000. It gives a byte position in the .log file.', callout: 'Binary search: closest entry at or below', code: 2,
        at: { q: { ...QPOS }, ...segs({ 3: { tone: 'ok', sub: 'chosen' } }), idx: { x: 424, y: 100, tone: 'live' }, log: { x: 424, y: 170 } }, arrows: [['idx', 'log', 'position']], stats: [{ l: 'search steps', v: 'about 15 (illustrative)', cls: 'ok' }] },
      { log: 'The broker reads forward from that byte position. Batches carry their length, so it skips whole batches until it reaches the offset.', callout: 'A short scan from the byte position', code: 3,
        at: { q: { ...QPOS }, ...segs({ 3: { tone: 'ok', sub: 'chosen' } }), idx: { x: 424, y: 100 }, log: { x: 424, y: 170, tone: 'live', hl: true }, hit: { x: 424, y: 250 } }, arrows: [['log', 'hit', 'scan']], stats: [{ l: 'bytes scanned', v: 'a few KB', cls: 'ok' }] },
      { log: 'Offset 9,000,000 is found. The replay starts in milliseconds instead of 40 minutes.', callout: 'Replay starts in milliseconds', moment: true, code: 3,
        at: { q: { ...QPOS, tone: 'ok' }, ...segs({ 3: { tone: 'ok', sub: 'chosen' } }), idx: { x: 424, y: 100 }, log: { x: 424, y: 170 }, hit: { x: 424, y: 250 } }, stats: [{ l: 'time to target', v: 'milliseconds (illustrative)', cls: 'ok' }, { l: 'data read', v: 'a few KB', cls: 'ok' }],
        takeaway: 'Pick the segment by name, binary-search its sparse index, scan a few KB. The cost no longer depends on the offset.' },
    ],
  };

  /* ---- 2. Time index: producer CreateTime versus broker LogAppendTime ---- */
  const TROWS = [
    { off: '9,411,990', ct: '14:00', ap: '14:00' },
    { off: '9,412,010', ct: '20:00', ap: '14:01' },
    { off: '9,412,031', ct: '14:02', ap: '14:02' },
    { off: '9,412,077', ct: '20:03', ap: '14:03' },
  ];
  const timeScene = (mode) => ({
    w: 640, h: 420, footer: 'Simplified: four records of a segment, timestamps illustrative.',
    header: s => ({ left: mode === 'ct' ? 'message.timestamp.type = CreateTime' : 'message.timestamp.type = LogAppendTime', right: s.r || '' }),
    setup(kit) {
      const led = kit.ledger(null, { x: 20, y: 76, w: 330, title: 'Records in 8700000.log', cols: [{ label: 'offset', w: 92 }, { label: 'CreateTime', w: 108 }, { label: 'arrived', w: 90 }], rows: 4, rowH: 18 });
      const ti = kit.ledger(null, { x: 366, y: 76, w: 258, title: '.timeindex entries', cols: [{ label: 'timestamp', w: 96 }, { label: 'offset', w: 100 }], rows: 4, rowH: 18 });
      const q = kit.chip(null, { x: 20, y: 250, w: 220, h: 44, label: 'lookup 14:00', sub: 'offsetsForTimes', tone: 'cursor', show: false });
      const r = kit.chip(null, { x: 266, y: 250, w: 358, h: 44, label: '', sub: '', tone: 'info', show: false });
      return { led, ti, q, r };
    },
    frame(s, kit, R) {
      const stamp = i => (mode === 'ct' ? TROWS[i].ct : TROWS[i].ap);
      R.led.clear(); R.ti.clear();
      const n = s.rows || 0;
      for (let i = 0; i < n; i++) {
        const skew = mode === 'ct' && TROWS[i].ct !== TROWS[i].ap;
        R.led.setRow(i, [TROWS[i].off, TROWS[i].ct, TROWS[i].ap], { hl: s.cur === i, tones: [null, skew ? 'bad' : null, null], tone: skew ? 'bad' : '' });
      }
      const idx = [];
      let high = '';
      for (let i = 0; i < n; i++) { const t = stamp(i); if (!high || t > high) { high = t; idx.push([t, TROWS[i].off]); } }
      if (s.idx) idx.forEach((e, i) => R.ti.setRow(i, e, { hl: i === idx.length - 1 }));
      R.q.set({ show: !!s.q });
      const hit = s.res;
      R.r.set({ show: !!hit, tone: hit === 'late' ? 'bad' : 'ok', label: hit === 'late' ? 'result: offset 9,412,077' : 'result: offset 9,411,990', sub: hit === 'late' ? 'record stamped 20:03, replay starts hours late' : 'record from 14:00, replay starts on time' });
    },
  });
  const timeBug = {
    id: 'clock-skew', label: 'Time lookup skew', desc: 'A producer clock six hours ahead puts future timestamps in the time index, and LogAppendTime fixes it (times illustrative).',
    codeLabel: 'Config',
    code: {
      bug: [
        'message.timestamp.type=CreateTime   # default',
        '# one producer host has a clock 6 h ahead (illustrative)',
        '# the time index keeps the largest timestamp seen so far',
        "consumer.offsetsForTimes({orders-3: 14:00}) -> record stamped 20:03",
      ],
      fix: [
        'message.timestamp.type=LogAppendTime',
        '# the broker stamps each record with its own clock',
        "consumer.offsetsForTimes({orders-3: 14:00}) -> record from 14:00",
      ],
    },
    stage: timeScene('ct'),
    bug: [
      { log: 'Four records sit in the segment. The CreateTime column is what each producer wrote; the arrived column is the broker clock.', callout: 'CreateTime: the producer sets the time', code: 0,
        state: { rows: 4, r: 'CreateTime' }, stats: [{ l: 'records', v: '4' }, { l: 'timestamp source', v: 'producer', cls: 'warn' }] },
      { log: 'Two of the records come from a host whose clock is six hours ahead. They carry 20:00 and 20:03 although they arrived at 14:01 and 14:03.', callout: 'Two records carry future timestamps', moment: true, code: 1,
        state: { rows: 4, cur: 1, r: 'skewed clock' }, stats: [{ l: 'skewed records', v: '2', cls: 'bad' }, { l: 'skew', v: '+6 h (illustrative)', cls: 'bad' }] },
      { log: 'The time index keeps the largest timestamp it has seen. After the 20:00 record, a later 14:02 record adds no entry.', callout: 'The index keeps the largest timestamp so far', code: 2,
        state: { rows: 4, idx: true, r: 'time index' }, stats: [{ l: 'index entries', v: '3', cls: 'warn' }, { l: 'largest timestamp', v: '20:03', cls: 'bad' }] },
      { log: 'The consumer asks for the first offset at or after 14:00. The index jumps to the first entry whose timestamp is big enough.', callout: 'offsetsForTimes asks for 14:00', code: 3,
        state: { rows: 4, idx: true, q: true, r: 'lookup 14:00' }, stats: [{ l: 'asked for', v: '14:00' }] },
      { log: 'The answer is wrong for a replay. It does not start from the records that arrived at 14:00 but from a record stamped 20:03.', callout: 'The replay starts hours late', moment: true, code: 3,
        state: { rows: 4, idx: true, q: true, res: 'late', r: 'wrong start' }, stats: [{ l: 'returned record', v: '20:03', cls: 'bad' }, { l: 'replay start', v: '6 h late', cls: 'bad' }],
        takeaway: 'With CreateTime, one skewed clock puts wrong timestamps in the index, so time lookups follow that clock.' },
    ],
    fix: [
      { log: 'The topic switches to LogAppendTime. From now on the broker writes its own clock into each record, whatever the producer sent.', callout: 'LogAppendTime: the broker sets the time', code: 0,
        state: { rows: 0, r: 'LogAppendTime' }, stats: [{ l: 'timestamp source', v: 'broker', cls: 'ok' }] },
      { log: 'The same four records now carry their arrival times. Timestamps grow with the offsets.', callout: 'Timestamps follow the offsets', code: 1,
        state: { rows: 4, r: 'LogAppendTime' }, stats: [{ l: 'skewed records', v: '0', cls: 'ok' }] },
      { log: 'The time index gets one entry per record, ordered like the offsets.', callout: 'The index grows in order', code: 1,
        state: { rows: 4, idx: true, r: 'time index' }, stats: [{ l: 'largest timestamp', v: '14:03', cls: 'ok' }] },
      { log: 'The lookup for 14:00 now returns the record that arrived at 14:00.', callout: 'The lookup lands on 14:00', moment: true, code: 2,
        state: { rows: 4, idx: true, q: true, res: 'ok', r: 'right start' }, stats: [{ l: 'returned record', v: '14:00', cls: 'ok' }],
        takeaway: 'LogAppendTime trades event time for a broker clock. Keep the business time in the payload if you need it.' },
    ],
  };
  timeBug.stage = (() => {
    /* the fix mode needs the LogAppendTime header and index, so both modes share one stage that reads the mode from the step state */
    const ct = timeScene('ct'), la = timeScene('la');
    return {
      w: ct.w, h: ct.h, footer: ct.footer,
      header: s => (s.la ? la.header(s) : ct.header(s)),
      setup: ct.setup,
      frame: (s, kit, R, ctx) => (s.la ? la.frame(s, kit, R, ctx) : ct.frame(s, kit, R, ctx)),
    };
  })();
  timeBug.fix.forEach(st => { st.state = { ...st.state, la: true }; });

  /* ---- 3. Segment roll and retention: only closed segments can be deleted ---- */
  const FOOT_ROLL = 'Simplified: sizes and ages illustrative. segment.bytes is 1 GiB by default.';
  const ROLL = {
    id: 'roll', label: 'Segment roll', desc: 'The active segment fills and rolls. Retention deletes only closed segments, never the active one (sizes illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      'segment.bytes=1073741824     # roll at 1 GiB (default)',
      'retention.ms=604800000       # 7 days (default)',
      '# only the active segment is written',
      '# a closed segment is deleted when its newest record is older than retention.ms',
      '# the active segment is never deleted, even when it is old',
    ] },
    stage: {
      w: 640, h: 420, footer: FOOT_ROLL,
      header: s => ({ left: 'orders-3 · segment.bytes = 1 GiB', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 96, w: 420, labelW: 100, rowH: 26, max: 100, unit: '%', title: 'Segment fill', items: [
          { id: 'a', label: 'base 0' }, { id: 'b', label: 'base 2.9M' }, { id: 'c', label: 'base 5.8M' }, { id: 'd', label: 'base 8.7M' },
        ] });
        const chips = {};
        ['a', 'b', 'c', 'd'].forEach((k, i) => { chips[k] = kit.chip(null, { x: 470, y: 94 + i * 26, w: 146, h: 22, label: '', tone: 'info', show: false, small: true }); });
        const led = kit.ledger(null, { x: 24, y: 212, w: 592, title: 'Retention check', cols: [{ label: 'segment', w: 130 }, { label: 'newest record', w: 150 }, { label: 'verdict', w: 280 }], rows: 4, rowH: 16 });
        return { bars, chips, led };
      },
      frame(s, kit, R) {
        const fill = s.fill || {}, age = s.age || {};
        ['a', 'b', 'c', 'd'].forEach(k => {
          R.bars.set(k, fill[k] || 0, fill[k] >= 100 ? 'info' : 'ok', (fill[k] || 0) + '%');
          R.chips[k].set({ show: !!s.names, label: s.names ? { a: '00000000.log', b: '02900000.log', c: '05800000.log', d: '08700000.log' }[k] : '', tone: s.active === k ? 'live' : 'info' });
        });
        R.led.clear();
        (s.rows || []).forEach((r, i) => R.led.setRow(i, r.c, { hl: r.hl, tones: r.tones, tone: r.tone }));
      },
    },
    bug: [
      { log: 'Three segments are closed and full. The fourth is the active one: it is the only file the broker appends to.', callout: 'Only the active segment is written', code: 2,
        state: { fill: { a: 100, b: 100, c: 100, d: 40 }, names: true, active: 'd', r: 'active: 8.7M' }, stats: [{ l: 'closed segments', v: '3' }, { l: 'active segment', v: '1', cls: 'ok' }] },
      { log: 'Writes continue and the active segment reaches segment.bytes. The broker rolls: it closes this file and starts a new one named for the next offset.', callout: 'At segment.bytes the log rolls', moment: true, code: 0,
        state: { fill: { a: 100, b: 100, c: 100, d: 100 }, names: true, active: 'd', r: 'roll' }, stats: [{ l: 'fill', v: '100%', cls: 'warn' }, { l: 'roll trigger', v: 'segment.bytes or segment.ms' }] },
      { log: 'Retention runs on closed segments. It compares retention.ms with the newest record of each one. The first two are older than seven days (illustrative).', callout: 'Retention looks at closed segments', code: 3,
        state: { fill: { a: 100, b: 100, c: 100, d: 100 }, names: true, rows: [{ c: ['00000000', '9 days ago', 'older than retention.ms: delete'], tones: [null, null, 'bad'], tone: 'bad', hl: true }, { c: ['02900000', '8 days ago', 'older than retention.ms: delete'], tones: [null, null, 'bad'], tone: 'bad', hl: true }, { c: ['05800000', '6 days ago', 'within retention.ms: keep'], tones: [null, null, 'ok'] }, { c: ['08700000', '1 day ago', 'within retention.ms: keep'], tones: [null, null, 'ok'] }], r: 'retention' }, stats: [{ l: 'to delete', v: '2', cls: 'warn' }, { l: 'to keep', v: '2', cls: 'ok' }] },
      { log: 'The two old segments are removed as whole files. Deleting a file needs no rewrite and no scan of the data.', callout: 'Whole files are deleted', code: 3,
        state: { fill: { c: 100, d: 100 }, names: true, rows: [{ c: ['05800000', '6 days ago', 'within retention.ms: keep'], tones: [null, null, 'ok'] }, { c: ['08700000', '1 day ago', 'within retention.ms: keep'], tones: [null, null, 'ok'] }], r: 'deleted' }, stats: [{ l: 'deleted', v: '2 files', cls: 'ok' }] },
      { log: 'A quiet topic gets few writes, so its active segment stays open for weeks. Its old records are never deleted until the segment rolls, even past retention.ms.', callout: 'An old active segment is never deleted', moment: true, code: 4,
        state: { fill: { d: 5 }, names: true, active: 'd', rows: [{ c: ['08700000 (active)', '12 days ago', 'active: not eligible'], tones: [null, null, 'warn'], tone: 'warn', hl: true }], r: 'quiet topic' }, stats: [{ l: 'fill', v: '5%', cls: 'warn' }, { l: 'oldest record', v: '12 days', cls: 'bad' }],
        takeaway: 'Retention works on closed segments. For a quiet topic, set segment.ms so the active segment rolls.' },
    ],
  };

  window.CHAPTER_OVERRIDES[0] = { explain: `
<h3>1. A partition is a directory of segment files</h3>
<p>Every partition replica lives in one directory on a broker, for example <code>orders-3</code>. Inside it are segment files. Each segment is a set of three files that share a name: a <code>.log</code> file that holds the records, an <code>.index</code> file for offsets and a <code>.timeindex</code> file for timestamps. The name is the <b>base offset</b>, the offset of the first record in that segment, padded to 20 digits.</p>
<p>Only the newest segment, the active one, is ever written. The broker only appends to it. It never rewrites a record in place. That is why a write is cheap and why old segments can be read, copied and deleted without any locking.</p>

<h3>2. Offsets are positions, not row numbers</h3>
<p>Each record in a partition gets the next offset when the leader appends it. The offset is the position of the record in this partition, and it is never reused. Offsets are only unique inside one partition: <code>orders-3</code> and <code>orders-4</code> both have an offset 9,000,000.</p>
<p>A gap in offsets is normal. Compaction and transactions both leave gaps (control records take an offset too). A consumer must therefore never assume that the next record is at offset + 1.</p>

<h3>3. The log rolls on size or time</h3>
<p>The active segment rolls when it reaches <code>segment.bytes</code> (default 1 GiB) or when its oldest record is older than <code>segment.ms</code> (default 7 days). The broker closes the file, builds its final indexes and opens a new file named for the next offset. A closed segment is immutable.</p>
<p>The size of a segment is a trade-off. Many small segments mean many open files and memory maps. A few huge segments mean that retention and compaction work in coarse steps, because only closed segments are touched.</p>

<h3>4. Finding an offset: names, then a sparse index</h3>
<p>The broker finds a record in three steps. First it picks the segment from the file names alone: the one with the greatest base offset that is at or below the target. Then it binary-searches the sparse <code>.index</code> file of that segment. The index holds one entry for every <code>index.interval.bytes</code> of data (default 4096), so it is small enough to memory-map. The entry gives a byte position in the <code>.log</code> file. Last, the broker scans forward from that position until it meets the offset.</p>
<p>Records are written in <b>batches</b>. Each batch carries its length and a CRC, so a reader can skip whole batches and notice damage. This is also why the scan is only a few KB long.</p>

<h3>5. The time index and what it trusts</h3>
<p>The <code>.timeindex</code> file maps a timestamp to an offset. <code>offsetsForTimes</code> uses it to answer “the first offset at or after this time”. Time-based retention also uses record timestamps, with the largest timestamp in a segment deciding when the segment may go.</p>
<p>By default (<code>message.timestamp.type=CreateTime</code>) the broker keeps whatever timestamp the producer set. One host with a wrong clock therefore leaves wrong timestamps in the index and can keep segments alive past <code>retention.ms</code>. With <code>LogAppendTime</code> the broker writes its own clock. Then the timestamp no longer says when the event happened, only when the broker received it.</p>

<h3>6. The trade-offs and how to check them</h3>
<p>A sparse index trades a tiny scan for a small memory footprint. A very large partition count multiplies open files and memory maps, so a broker can fail on the OS limits long before the disk is full. Check the process open files against the <code>nofile</code> limit and the mapped regions against <code>vm.max_map_count</code>.</p>
<p>To look inside a segment, dump it. <code>kafka-dump-log.sh</code> prints batches with their offsets, CRC and timestamps, and it can verify the index files.</p>

<h3>7. Syntax</h3>
<pre># segment files of one partition
ls /var/lib/kafka/data/orders-3/
00000000000008700000.index  00000000000008700000.log  00000000000008700000.timeindex

# look inside a segment, and verify its indexes
kafka-dump-log.sh --files /var/lib/kafka/data/orders-3/00000000000008700000.log --print-data-log
kafka-dump-log.sh --files /var/lib/kafka/data/orders-3/00000000000008700000.index --index-sanity-check

# topic configs that shape segments and time
kafka-configs.sh --bootstrap-server b1:9092 --alter --entity-type topics --entity-name orders \\
  --add-config segment.bytes=1073741824,segment.ms=604800000,message.timestamp.type=LogAppendTime

# find the offset for a time (consumer API: offsetsForTimes)
kafka-get-offsets.sh --bootstrap-server b1:9092 --topic orders --time 1760018400000</pre>
<p>More: ${KL(KDOC + 'design_filesystem', 'Filesystem and persistence')} and ${KL(KDOC + 'topicconfigs', 'Topic configs')}.</p>`, scenarios: [lookup, timeBug, ROLL] };
})();
