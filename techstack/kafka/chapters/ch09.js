/* Chapter 9 "Retention, Tiered Storage and Compaction": scenes and Explain override (index 9, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Five scenes: retention against a stopped reader, a tombstone that outlives its reader, how the log cleaner compacts,
   retention.bytes as a per-partition cap, and tiered storage. Sizes, ages and offsets are illustrative.
   Defaults are for Kafka 3.9: retention.ms 7 days, retention.bytes -1, delete.retention.ms 24 h, min.cleanable.dirty.ratio 0.5. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Retention deletes closed segments and does not ask the readers ---- */
  const FOOT_RET = 'Simplified: eight segments of two offsets each. Ages illustrative.';
  const SX = i => 28 + 74 * i;
  const SEGT = {};
  for (let i = 0; i < 8; i++) SEGT['s' + i] = { label: 'o' + 2 * i + '-' + (2 * i + 1), sub: i === 7 ? 'active' : 'closed', tone: 'info', w: 66, h: 44 };
  const segs = (from, over) => Object.fromEntries(Array.from({ length: 8 - from }, (_, k) => ['s' + (k + from), { x: SX(k + from), y: 100, ...(over && over[k + from] ? over[k + from] : {}) }]));
  const retain = {
    id: 'retention', label: 'Retention vs a stopped reader', desc: 'Retention deletes closed segments on time. A stopped group whose committed offset is now below the log start fails when it restarts (ages illustrative).',
    codeLabel: 'Config and error',
    code: {
      bug: [
        'retention.ms=259200000   # 3 days (illustrative)',
        '# the group stopped over the weekend; its committed offset is 3',
        '# segments o0-1, o2-3 and o4-5 are older than 3 days: deleted; log start offset = 6',
        'OffsetOutOfRangeException: Fetch position offset=3 is out of range for partition orders-0',
        '# auto.offset.reset then decides: latest skips the gap, earliest replays what is left',
      ],
      fix: [
        'retention.ms=604800000   # 7 days (illustrative): longer than the longest stop',
        '# the committed offset 3 stays above the log start offset',
        '# or: tiered storage keeps old segments readable from remote storage',
        '# alert when committed offsets get close to the log start',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_RET, panels: [
      { id: 'lg', x: 16, y: 58, w: 614, h: 150, title: 'orders-0 on the broker (oldest first)', tone: 'info' },
      { id: 'gr', x: 16, y: 220, w: 614, h: 128, title: 'Consumer group billing', tone: 'info' },
    ], tokens: {
      ...SEGT,
      cm: { label: 'committed 3', sub: 'in segment o2-3', tone: 'cursor', w: 110, h: 40 },
      ls: { label: 'log start 6', sub: 'oldest offset left', tone: 'warn', w: 110, h: 40 },
      st: { label: 'group restarts', sub: 'fetches offset 3', tone: 'live', w: 150 },
      er: { label: 'OFFSET_OUT_OF_RANGE', sub: 'offset 3 is gone', tone: 'bad', w: 210 },
      ok: { label: 'resumes at 3', sub: 'inside the log', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'The topic keeps eight segments, two offsets each. The group billing stopped over the weekend with a committed offset of 3, inside the second segment.', callout: 'The group is stopped at offset 3', code: 1,
        at: { ...segs(0), cm: { x: SX(1) - 12, y: 152 } }, stats: [{ l: 'committed offset', v: '3' }, { l: 'retention.ms', v: '3 days', cls: 'warn' }] },
      { log: 'The broker checks retention every few minutes. The three oldest closed segments have records older than three days, so they are eligible.', callout: 'Three segments are older than the window', code: 2,
        at: { ...segs(0, { 0: { tone: 'warn', sub: '> 3 days' }, 1: { tone: 'warn', sub: '> 3 days' }, 2: { tone: 'warn', sub: '> 3 days' } }), cm: { x: SX(1) - 12, y: 152 } }, stats: [{ l: 'eligible', v: '3 segments', cls: 'warn' }] },
      { log: 'The broker deletes them as whole files. It does not look at any consumer group. The log start offset moves forward to 6.', callout: 'Segments o0-5 are deleted, log start = 6', moment: true, code: 2,
        at: { ...segs(3), ls: { x: SX(3) - 12, y: 152 }, cm: { x: 30, y: 270 } }, stats: [{ l: 'log start offset', v: '6', cls: 'warn' }, { l: 'committed offset', v: '3 (gone)', cls: 'bad' }] },
      { log: 'On Monday the group restarts and asks for offset 3, where it committed. That offset is below the log start offset.', callout: 'The group asks for a deleted offset', code: 3,
        at: { ...segs(3), ls: { x: SX(3) - 12, y: 152 }, cm: { x: 30, y: 270 }, st: { x: 160, y: 270 } }, stats: [{ l: 'fetch at', v: 'offset 3', cls: 'bad' }] },
      { log: 'The broker answers OFFSET_OUT_OF_RANGE, so the group cannot resume. The client then applies auto.offset.reset: latest skips the gap, earliest replays what is left.', callout: 'OFFSET_OUT_OF_RANGE: the group cannot resume', moment: true, code: 4,
        at: { ...segs(3), ls: { x: SX(3) - 12, y: 152 }, cm: { x: 30, y: 270 }, er: { x: 330, y: 270 } }, stats: [{ l: 'records skipped or replayed', v: 'offsets 3-5 lost', cls: 'bad' }],
        takeaway: 'Retention ignores the readers. A group that is stopped longer than the retention window loses its place.' },
    ],
    fix: [
      { log: 'The window is longer than the longest stop a group may have. With retention.ms of 7 days the segments of the weekend are all still there.', callout: 'A longer window than any stop', code: 0,
        at: { ...segs(0), cm: { x: SX(1) - 12, y: 152 } }, stats: [{ l: 'retention.ms', v: '7 days', cls: 'ok' }, { l: 'cost', v: 'more disk', cls: 'warn' }] },
      { log: 'No segment is eligible yet, because all records are younger than seven days. The log start offset stays at 0.', callout: 'Nothing is deleted yet', code: 1,
        at: { ...segs(0), cm: { x: SX(1) - 12, y: 152 } }, stats: [{ l: 'log start offset', v: '0', cls: 'ok' }] },
      { log: 'The group restarts, asks for offset 3 and finds it. It resumes exactly where it stopped.', callout: 'The committed offset is still in the log', moment: true, code: 1,
        at: { ...segs(0), cm: { x: SX(1) - 12, y: 152 }, ok: { x: 160, y: 270 } }, stats: [{ l: 'resumes at', v: 'offset 3', cls: 'ok' }, { l: 'records lost', v: '0', cls: 'ok' }] },
      { log: 'An alert on the gap between the committed offset and the log start offset warns before a group runs out of room. Tiered storage can extend the history for less cost.', callout: 'Alert on the room left, or tier the old data', code: 3,
        at: { ...segs(0), cm: { x: SX(1) - 12, y: 152 }, ok: { x: 160, y: 270 } }, stats: [{ l: 'alert', v: 'committed - log start', cls: 'ok' }],
        takeaway: 'Set retention from the longest reader stop, not from disk alone, and alert when a group gets close to the log start.' },
    ],
  };

  /* ---- 2. A tombstone is removed after delete.retention.ms: a slow reader never sees the delete ---- */
  const tomb = {
    id: 'tombstone', label: 'Tombstone outlives reader', desc: 'A delete marker is removed by the cleaner before a paused consumer reads it, so the deleted key survives in that consumer’s table (times illustrative).',
    codeLabel: 'Topic config',
    code: {
      bug: [
        'cleanup.policy=compact   delete.retention.ms=86400000   # 24 h (default)',
        '# k1 = A is written; the consumer builds its table, then pauses',
        '# k1 is deleted: a tombstone (k1 = null) is appended',
        '# the cleaner removes the old k1 = A, and the tombstone after 24 h',
        '# the consumer resumes after 2 days: it never sees the delete and keeps k1',
      ],
      fix: [
        'delete.retention.ms=604800000   # longer than the worst-case time to read the log',
        '# alert when a consumer position is older than delete.retention.ms',
        '# the paused consumer reads the tombstone and removes k1 from its table',
        '# or rebuild the table from the compacted topic',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: one compacted partition, three keys. Times illustrative.', panels: [
      { id: 'lg', x: 16, y: 58, w: 400, h: 150, title: 'Compacted log, key k1', tone: 'info' },
      { id: 'tb', x: 426, y: 58, w: 204, h: 290, title: 'Consumer table', tone: 'info' },
      { id: 'cs', x: 16, y: 220, w: 400, h: 128, title: 'Cleaner and consumer', tone: 'info' },
    ], tokens: {
      r1: { label: 'k1 = A', sub: 'offset 1', tone: 'info', w: 88, h: 44 },
      r2: { label: 'k2 = X', sub: 'offset 2', tone: 'info', w: 88, h: 44 },
      r3: { label: 'k1 = null', sub: 'tombstone', tone: 'warn', w: 96, h: 44 },
      t1: { label: 'k1 = A', sub: 'in the table', tone: 'ok', w: 170 },
      t2: { label: 'k2 = X', sub: 'in the table', tone: 'ok', w: 170 },
      pz: { label: 'consumer paused', sub: 'position: after offset 2', tone: 'warn', w: 190 },
      cl: { label: 'cleaner runs', sub: 'keeps the last value per key', tone: 'live', w: 190 },
      tm: { label: '24 h pass', sub: 'tombstone is removed', tone: 'bad', w: 190 },
      rs: { label: 'consumer resumes', sub: 'after 2 days', tone: 'cursor', w: 190 },
      nz: { label: 'no tombstone found', sub: 'k1 stays in the table', tone: 'bad', w: 190 },
    } },
    bug: [
      { log: 'The compacted topic holds k1 = A and k2 = X. A consumer reads both and builds a table, then pauses for maintenance.', callout: 'The consumer builds a table, then pauses', code: 1,
        at: { r1: { x: 30, y: 100 }, r2: { x: 130, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, pz: { x: 30, y: 266 } }, stats: [{ l: 'table', v: 'k1, k2', cls: 'ok' }] },
      { log: 'Customer k1 is deleted. The producer writes a tombstone, which is a record for k1 with a null value, at offset 3.', callout: 'A tombstone for k1 is appended', code: 2,
        at: { r1: { x: 30, y: 100 }, r2: { x: 130, y: 100 }, r3: { x: 230, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, pz: { x: 30, y: 266 } }, stats: [{ l: 'log', v: 'k1=A, k2=X, k1=null' }] },
      { log: 'The log cleaner compacts the log. It keeps only the latest record for each key, so the old k1 = A is removed. The tombstone stays, so that readers can learn about the delete.', callout: 'The cleaner removes the old k1 = A', moment: true, code: 3,
        at: { r2: { x: 130, y: 100 }, r3: { x: 230, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, pz: { x: 30, y: 266 }, cl: { x: 226, y: 266 } }, stats: [{ l: 'tombstone kept for', v: 'delete.retention.ms', cls: 'warn' }] },
      { log: 'delete.retention.ms is 24 hours. After that time the cleaner removes the tombstone as well. The log no longer says anything about k1.', callout: 'After 24 h the tombstone is removed', code: 3,
        at: { r2: { x: 130, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, pz: { x: 30, y: 266 }, tm: { x: 226, y: 266 } }, stats: [{ l: 'k1 in the log', v: 'gone', cls: 'warn' }] },
      { log: 'The consumer resumes after two days from its old position. It reads k2 but never sees a record for k1 at all, so nothing tells it to remove k1.', callout: 'The paused consumer never sees the delete', code: 4,
        at: { r2: { x: 130, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, rs: { x: 30, y: 266 }, nz: { x: 226, y: 266 } }, stats: [{ l: 'k1 in the table', v: 'present (wrong)', cls: 'bad' }] },
      { log: 'The table keeps k1 for as long as the consumer runs. The downstream data shows a customer that was deleted last week.', callout: 'The deleted key lives on downstream', moment: true, code: 4,
        at: { r2: { x: 130, y: 100 }, t1: { x: 446, y: 100, tone: 'bad', sub: 'deleted upstream' }, t2: { x: 446, y: 150 }, rs: { x: 30, y: 266 }, nz: { x: 226, y: 266 } }, stats: [{ l: 'downstream table', v: 'wrong', cls: 'bad' }],
        takeaway: 'A tombstone is only kept for delete.retention.ms. A consumer that is paused longer than that misses the delete.' },
    ],
    fix: [
      { log: 'delete.retention.ms is set longer than the worst-case time any consumer takes to read the log, for example 7 days.', callout: 'delete.retention.ms is longer than any pause', code: 0,
        at: { r2: { x: 130, y: 100 }, r3: { x: 230, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, pz: { x: 30, y: 266 } }, stats: [{ l: 'delete.retention.ms', v: '7 days', cls: 'ok' }] },
      { log: 'After two days the tombstone is still in the log, because seven days have not passed. The cleaner has only removed the old k1 = A.', callout: 'After 2 days the tombstone is still there', code: 1,
        at: { r2: { x: 130, y: 100 }, r3: { x: 230, y: 100 }, t1: { x: 446, y: 100 }, t2: { x: 446, y: 150 }, rs: { x: 30, y: 266 } }, stats: [{ l: 'tombstone', v: 'kept', cls: 'ok' }] },
      { log: 'The consumer resumes, reads the tombstone for k1 and removes k1 from its table.', callout: 'The consumer reads the tombstone', moment: true, code: 2,
        at: { r2: { x: 130, y: 100 }, r3: { x: 230, y: 100, tone: 'ok' }, t2: { x: 446, y: 150 }, rs: { x: 30, y: 266 } }, stats: [{ l: 'k1 in the table', v: 'removed', cls: 'ok' }] },
      { log: 'An alert fires when a consumer’s position gets older than delete.retention.ms. Such a consumer rebuilds its table from the compacted topic.', callout: 'Alert on position age, rebuild if needed', code: 3,
        at: { r2: { x: 130, y: 100 }, r3: { x: 230, y: 100 }, t2: { x: 446, y: 150 } }, stats: [{ l: 'drift', v: 'caught early', cls: 'ok' }],
        takeaway: 'Keep tombstones longer than your slowest reader, and rebuild any consumer that was away for longer.' },
    ],
  };

  /* ---- 3. How the log cleaner compacts: the last value for each key, with the offsets kept ---- */
  const KR = [['k1', 'a'], ['k2', 'b'], ['k1', 'c'], ['k3', 'd'], ['k2', 'e'], ['k1', 'f'], ['k3', 'g'], ['k2', 'h']];
  const CT = {};
  KR.forEach((r, i) => { CT['d' + i] = { label: r[0] + '=' + r[1], sub: 'off ' + i, tone: 'info', w: 62, h: 44 }; CT['c' + i] = { label: r[0] + '=' + r[1], sub: 'off ' + i, tone: 'ok', w: 62, h: 44 }; });
  const dx = i => 28 + 72 * i;
  const dirty = over => Object.fromEntries(KR.map((_, i) => ['d' + i, { x: dx(i), y: 100, ...(over && over[i] ? over[i] : {}) }]));
  const KEEP = [5, 6, 7];   // last record of k1, k3, k2
  const compact = {
    id: 'compact', label: 'How the cleaner compacts', desc: 'The cleaner keeps only the last record of each key and leaves gaps in the offsets. The active segment is never cleaned (illustrative).',
    codeLabel: 'Topic config',
    code: { bug: [
      'cleanup.policy=compact',
      'min.cleanable.dirty.ratio=0.5   # clean when the dirty part is half of the log (default)',
      '# the cleaner scans the dirty part and builds a map: key -> last offset',
      '# it rewrites the segments, copying only the records that are the last for their key',
      '# offsets are not renumbered: a consumer sees gaps',
    ] },
    scene: { w: 640, h: 420, footer: 'Simplified: eight records, three keys. Illustrative.', panels: [
      { id: 'dl', x: 16, y: 58, w: 614, h: 112, title: 'Before: the log, oldest on the left', tone: 'info' },
      { id: 'mp', x: 16, y: 182, w: 300, h: 166, title: 'Cleaner offset map', tone: 'info' },
      { id: 'cl', x: 326, y: 182, w: 304, h: 166, title: 'After: the cleaned log', tone: 'info' },
    ], tokens: {
      ...CT,
      m1: { label: 'k1 -> offset 5', sub: '', tone: 'live', w: 150, h: 34 }, m2: { label: 'k2 -> offset 7', sub: '', tone: 'live', w: 150, h: 34 }, m3: { label: 'k3 -> offset 6', sub: '', tone: 'live', w: 150, h: 34 },
      ra: { label: 'dirty ratio', sub: 'dirty / (clean + dirty)', tone: 'cursor', w: 150 },
    } },
    bug: [
      { log: 'The log holds eight records for three keys. The cleaner treats the whole part as dirty: it was never compacted before.', callout: 'Eight records, three keys', code: 0,
        at: { ...dirty() }, stats: [{ l: 'records', v: '8' }, { l: 'distinct keys', v: '3' }] },
      { log: 'The cleaner runs when the dirty part is at least min.cleanable.dirty.ratio of the log. At the default of 0.5 here the whole log is dirty, so it is cleaned.', callout: 'The dirty ratio passes the threshold', code: 1,
        at: { ...dirty(), ra: { x: 40, y: 232 } }, stats: [{ l: 'dirty ratio', v: '100% >= 50%', cls: 'warn' }] },
      { log: 'The cleaner reads the dirty records once and fills a map: for each key, the offset of its last record. The map holds three entries.', callout: 'The map holds the last offset per key', moment: true, code: 2,
        at: { ...dirty({ 5: { tone: 'live' }, 6: { tone: 'live' }, 7: { tone: 'live' } }), m1: { x: 30, y: 226 }, m2: { x: 30, y: 262 }, m3: { x: 30, y: 298 } }, stats: [{ l: 'map entries', v: '3', cls: 'ok' }] },
      { log: 'The cleaner rewrites the segments. Records that are not the last for their key are dropped: five of the eight.', callout: 'Older records of a key are dropped', code: 3,
        at: { ...dirty({ 0: { tone: 'delete' }, 1: { tone: 'delete' }, 2: { tone: 'delete' }, 3: { tone: 'delete' }, 4: { tone: 'delete' }, 5: { tone: 'live' }, 6: { tone: 'live' }, 7: { tone: 'live' } }), m1: { x: 30, y: 226 }, m2: { x: 30, y: 262 }, m3: { x: 30, y: 298 } }, stats: [{ l: 'dropped', v: '5 records', cls: 'warn' }] },
      { log: 'The cleaned log keeps three records with their original offsets 5, 6 and 7. Offsets 0 to 4 are gaps, which consumers handle by moving to the next offset.', callout: 'Offsets are kept, so there are gaps', moment: true, code: 4,
        at: { c5: { x: 340, y: 240 }, c6: { x: 410, y: 240 }, c7: { x: 480, y: 240 }, m1: { x: 30, y: 226 }, m2: { x: 30, y: 262 }, m3: { x: 30, y: 298 } }, stats: [{ l: 'records left', v: '3', cls: 'ok' }, { l: 'offsets', v: '5, 6, 7 (gaps before)', cls: 'ok' }],
        takeaway: 'Compaction keeps the latest record of each key and never renumbers offsets, so a compacted topic has gaps.' },
    ],
  };

  /* ---- 4. retention.bytes is a cap per partition: it multiplies ---- */
  const cap = {
    id: 'disk-cap', label: 'retention.bytes is per partition', desc: 'retention.bytes caps one partition, not the topic. The disk need is the cap times partitions times replicas (sizes illustrative).',
    codeLabel: 'Topic config',
    code: {
      bug: [
        'retention.bytes=107374182400   # 100 GiB, per partition',
        '# 24 partitions, replication factor 3',
        '# worst case on disk: 100 GiB x 24 x 3 = 7,200 GiB, about 7 TiB',
        '# the cluster has 4 TiB of disk for this topic: the disks fill',
      ],
      fix: [
        'retention.bytes=42949672960    # 40 GiB per partition (illustrative)',
        '# worst case: 40 GiB x 24 x 3 = 2,880 GiB, about 2.8 TiB: inside the 4 TiB',
        'segment.ms=86400000            # roll quiet partitions daily so old data can go',
        '# alert on disk used, not on the cap',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one topic on one cluster. Sizes illustrative.',
      header: s => ({ left: 'orders · 24 partitions · replication factor 3', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 210, rowH: 30, max: 8, unit: '', title: 'Disk in TiB', items: [
          { id: 'cap', label: 'worst case at the cap' }, { id: 'disk', label: 'disk of the cluster' }, { id: 'used', label: 'used now' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Arithmetic', cols: [{ label: 'what', w: 250 }, { label: 'value', w: 342 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const c = s.cap || 0, u = s.used || 0;
        R.bars.set('cap', c, c > 4 ? 'bad' : 'ok', c.toFixed(1) + ' TiB'); R.bars.set('disk', 4, 'info', '4.0 TiB');
        R.bars.set('used', u, u > 3.5 ? 'bad' : u > 2.5 ? 'warn' : 'ok', u.toFixed(1) + ' TiB');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The team reads retention.bytes=100 GiB as a limit for the topic. It looks safe next to the 4 TiB of disk.', callout: 'The cap looks small: 100 GiB', code: 0,
        state: { cap: 0.1, used: 1.2, say: 'retention.bytes = 100 GiB', sub: 'read as a limit for the whole topic', tone: 'warn', r: 'misread' }, stats: [{ l: 'cap as read', v: '100 GiB', cls: 'ok' }] },
      { log: 'The cap applies to each partition. With 24 partitions, the topic can hold 2,400 GiB before retention starts to delete by size.', callout: 'The cap applies to each partition', moment: true, code: 1,
        state: { cap: 2.4, used: 1.8, rows: [['100 GiB x 24 partitions', '2,400 GiB, about 2.3 TiB']], rt: 'warn', r: 'x 24' }, stats: [{ l: 'topic cap', v: '2.3 TiB', cls: 'warn' }] },
      { log: 'Every partition is stored on three brokers. The disk need is three times larger: 7,200 GiB, about 7 TiB, at the cap.', callout: 'Replication triples the need', code: 2,
        state: { cap: 7.0, used: 2.6, rows: [['100 GiB x 24 x 3 replicas', '7,200 GiB, about 7 TiB']], rt: 'bad', r: 'x 3' }, stats: [{ l: 'worst case', v: '7 TiB', cls: 'bad' }, { l: 'disk', v: '4 TiB', cls: 'warn' }] },
      { log: 'The partitions grow towards their caps. The disks pass 95% long before any partition reaches 100 GiB, and the brokers start to fail.', callout: 'The disks fill before the cap is reached', moment: true, code: 3,
        state: { cap: 7.0, used: 3.9, say: 'disks at 95%', sub: 'retention by size has not started yet', tone: 'bad', rows: [['disk used', '3.9 TiB of 4.0 TiB']], rt: 'bad', r: 'disks full' }, stats: [{ l: 'used', v: '3.9 TiB', cls: 'bad' }],
        takeaway: 'retention.bytes multiplies by partitions and replicas. Size it from the disk you have, not from one partition.' },
    ],
    fix: [
      { log: 'The cap is computed from the disk budget: 4 TiB divided by 24 partitions and 3 replicas is about 55 GiB, so 40 GiB leaves some room.', callout: 'Size the cap from the disk budget', code: 0,
        state: { cap: 2.8, used: 3.9, rows: [['40 GiB x 24 x 3 replicas', '2,880 GiB, about 2.8 TiB']], rt: 'ok', r: 'new cap' }, stats: [{ l: 'worst case', v: '2.8 TiB', cls: 'ok' }] },
      { log: 'The worst case now fits inside the 4 TiB. Retention by size starts to delete closed segments when a partition passes 40 GiB.', callout: 'The worst case fits the disk', moment: true, code: 1,
        state: { cap: 2.8, used: 2.7, say: 'size retention starts at 40 GiB', sub: 'closed segments go first', tone: 'ok', r: 'under control' }, stats: [{ l: 'used', v: '2.7 TiB', cls: 'ok' }] },
      { log: 'Quiet partitions roll daily with segment.ms, so their old data becomes eligible instead of waiting in an active segment.', callout: 'Quiet partitions roll daily', code: 2,
        state: { cap: 2.8, used: 2.4, rows: [['segment.ms', '1 day: old data becomes eligible']], rt: 'ok', r: 'rolled' }, stats: [{ l: 'used', v: '2.4 TiB', cls: 'ok' }] },
      { log: 'The alert watches the disk that is used, not the cap, because the cap is only a limit in theory.', callout: 'Alert on disk used', code: 3,
        state: { cap: 2.8, used: 2.4, say: 'alert at 80% of disk used', sub: 'it fires before the brokers are in trouble', tone: 'ok', r: 'watched' }, stats: [{ l: 'headroom', v: '1.6 TiB', cls: 'ok' }],
        takeaway: 'Combine retention.bytes with retention.ms and segment.ms, and alert on real disk usage.' },
    ],
  };

  /* ---- 5. Tiered storage: closed segments move to remote storage, the local disk keeps a short window ---- */
  const TS = {};
  for (let i = 0; i < 6; i++) TS['t' + i] = { label: 'seg ' + (i + 1), sub: i === 5 ? 'active' : 'closed', tone: 'info', w: 70, h: 44 };
  const tx = i => 28 + 78 * i;
  const tiered = {
    id: 'tiered', label: 'Tiered storage', desc: 'Closed segments are copied to remote storage and the local disk keeps only a short window. Old offsets are read from the remote tier (KIP-405, values illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      'remote.log.storage.system.enable=true            # broker: turn the feature on',
      'remote.storage.enable=true   retention.ms=2592000000   # topic: 30 days in total',
      'local.retention.ms=86400000                       # topic: 1 day stays on the local disks',
      '# closed segments are copied to remote storage; local copies older than 1 day are deleted',
      '# a fetch below the local log start is served from the remote tier',
    ] },
    scene: { w: 640, h: 420, footer: 'Simplified: six segments. Remote storage is object storage. Illustrative.', panels: [
      { id: 'lc', x: 16, y: 58, w: 614, h: 118, title: 'Local disk of the broker', tone: 'info' },
      { id: 'rm', x: 16, y: 188, w: 614, h: 100, title: 'Remote storage', tone: 'info' },
      { id: 'cs', x: 16, y: 298, w: 614, h: 50, title: '', tone: 'info' },
    ], tokens: {
      ...TS,
      r0: { label: 'seg 1', sub: 'remote', tone: 'ok', w: 70, h: 44 }, r1: { label: 'seg 2', sub: 'remote', tone: 'ok', w: 70, h: 44 }, r2: { label: 'seg 3', sub: 'remote', tone: 'ok', w: 70, h: 44 },
      r3: { label: 'seg 4', sub: 'remote', tone: 'ok', w: 70, h: 44 }, r4: { label: 'seg 5', sub: 'remote', tone: 'ok', w: 70, h: 44 },
      rd: { label: 'old read', sub: 'from the remote tier', tone: 'cursor', w: 190, h: 36 },
      nw: { label: 'new read', sub: 'from the local disk', tone: 'live', w: 190, h: 36 },
    } },
    bug: [
      { log: 'A topic with tiered storage has six segments on the local disk. The first five are closed, and the last is the active one.', callout: 'All six segments are on the local disk', code: 0,
        at: { ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['t' + i, { x: tx(i), y: 100 }])) }, stats: [{ l: 'local segments', v: '6' }, { l: 'remote segments', v: '0' }] },
      { log: 'The broker copies each closed segment to remote storage, in the background. The active segment is never copied.', callout: 'Closed segments are copied to remote storage', moment: true, code: 3,
        at: { ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['t' + i, { x: tx(i), y: 100 }])), r0: { x: tx(0), y: 226 }, r1: { x: tx(1), y: 226 }, r2: { x: tx(2), y: 226 }, r3: { x: tx(3), y: 226 }, r4: { x: tx(4), y: 226 } }, stats: [{ l: 'remote segments', v: '5', cls: 'ok' }] },
      { log: 'local.retention.ms is one day. Local copies older than that are deleted, because the remote copy exists. The local disk now holds a short window.', callout: 'Old local copies are deleted', code: 2,
        at: { t3: { x: tx(3), y: 100 }, t4: { x: tx(4), y: 100 }, t5: { x: tx(5), y: 100 }, r0: { x: tx(0), y: 226 }, r1: { x: tx(1), y: 226 }, r2: { x: tx(2), y: 226 }, r3: { x: tx(3), y: 226 }, r4: { x: tx(4), y: 226 } }, stats: [{ l: 'local segments', v: '3', cls: 'ok' }, { l: 'remote segments', v: '5', cls: 'ok' }] },
      { log: 'A consumer that reads the recent data is served from the local disk, with the usual low latency.', callout: 'Recent reads stay on the local disk', code: 4,
        at: { t3: { x: tx(3), y: 100 }, t4: { x: tx(4), y: 100 }, t5: { x: tx(5), y: 100 }, r0: { x: tx(0), y: 226 }, r1: { x: tx(1), y: 226 }, r2: { x: tx(2), y: 226 }, r3: { x: tx(3), y: 226 }, r4: { x: tx(4), y: 226 }, nw: { x: 28, y: 304 } }, arrows: [['nw', 't4', '']], stats: [{ l: 'read latency', v: 'low', cls: 'ok' }] },
      { log: 'A replay from an old offset fetches from the remote tier. It works, but each read goes to object storage, so it has a higher latency.', callout: 'Old reads come from the remote tier', moment: true, code: 4,
        at: { t3: { x: tx(3), y: 100 }, t4: { x: tx(4), y: 100 }, t5: { x: tx(5), y: 100 }, r0: { x: tx(0), y: 226 }, r1: { x: tx(1), y: 226 }, r2: { x: tx(2), y: 226 }, r3: { x: tx(3), y: 226 }, r4: { x: tx(4), y: 226 }, rd: { x: 28, y: 304 } }, stats: [{ l: 'read latency', v: 'higher for old data', cls: 'warn' }, { l: 'history kept', v: '30 days in total', cls: 'ok' }],
        takeaway: 'Tiering keeps long history on small local disks. Old data stays readable, but slower. No compacted topics.' },
    ],
  };

  window.CHAPTER_OVERRIDES[9] = { explain: `
<h3>1. A log needs a forgetting rule, and readers are not consulted</h3>
<p>Disks are finite, and readers come back at their own pace. Kafka therefore removes data by a rule on the topic, and the rule works in whole segments. It never waits for a consumer. There are two kinds of rule: <b>delete</b> by age or size, and <b>compact</b> down to the latest value for each key. A topic can use both, with <code>cleanup.policy=compact,delete</code>.</p>

<h3>2. Delete: by time, or by size</h3>
<p>Every <code>log.retention.check.interval.ms</code> (default 5 minutes) the broker looks at the closed segments. A segment is deleted when its newest record is older than <code>retention.ms</code> (default 7 days), or when the partition is over <code>retention.bytes</code> (default -1, which means no limit) and the segment is among the oldest. The check uses the largest record timestamp in the segment, so wrong timestamps (chapter 1) can keep a segment alive. The active segment is never deleted. A quiet partition can keep old data until <code>segment.ms</code> or <code>segment.bytes</code> rolls the segment.</p>

<h3>3. retention.bytes is a cap per partition</h3>
<p><code>retention.bytes</code> limits one partition, not the topic and not the broker. The disk need at the cap is the limit times the number of partitions times the replication factor. Size it from the disk you have, and alert on the disk that is really used.</p>

<h3>4. What a reader sees when data is gone</h3>
<p>Retention moves the <b>log start offset</b> forward. A consumer whose committed offset is below it gets <code>OFFSET_OUT_OF_RANGE</code> on its next fetch. The client then applies <code>auto.offset.reset</code>: <code>latest</code> skips the gap, <code>earliest</code> replays what is left, and <code>none</code> raises an error. A group that stops longer than the retention window loses its place, so set retention from the longest stop you accept, and alert on the gap between the committed offset and the log start.</p>

<h3>5. Compaction: the last value for each key</h3>
<p>With <code>cleanup.policy=compact</code> the <b>log cleaner</b> threads keep the last record of each key and drop the earlier ones. The cleaner runs on a partition when the dirty part, the part that was not cleaned before, is at least <code>min.cleanable.dirty.ratio</code> (default 0.5) of the log. It never cleans the active segment, and <code>min.compaction.lag.ms</code> can hold back young records. It reads the dirty part once, builds a map from key to last offset, and rewrites the segments with the records that are still the last for their key. Offsets are <b>not</b> renumbered, so a compacted log has gaps, and a consumer simply moves to the next offset. A compacted topic is a table of the latest state, which is why it is used for changelogs and for the consumer offsets topic itself.</p>

<h3>6. Tombstones: how a delete travels</h3>
<p>To delete a key, a producer writes a record with that key and a null value, a <b>tombstone</b>. Compaction removes the older values of the key, and keeps the tombstone for <code>delete.retention.ms</code> (default 24 hours) so that readers can see it. After that the cleaner removes the tombstone too. A consumer that was away for longer than <code>delete.retention.ms</code> may never see the delete, and keeps the key in its own table. For such a consumer, rebuild from the topic, and set <code>delete.retention.ms</code> above your slowest reader.</p>

<h3>7. Tiered storage (KIP-405)</h3>
<p>Tiered storage separates how long data is kept from how much local disk it needs. With <code>remote.log.storage.system.enable=true</code> on the brokers and a remote storage plugin, a topic with <code>remote.storage.enable=true</code> gets its closed segments copied to remote storage. <code>retention.ms</code> then applies to the total history, and <code>local.retention.ms</code> and <code>local.retention.bytes</code> limit what stays on the local disks. A fetch below the local log start is served from the remote tier, with a higher latency. The feature is production-ready from Kafka 3.9. It does not support compacted topics, and the active segment is never copied.</p>

<h3>8. Syntax</h3>
<pre># topic configs
retention.ms=604800000
retention.bytes=42949672960
segment.ms=86400000
cleanup.policy=compact              # or delete, or compact,delete
min.cleanable.dirty.ratio=0.5
delete.retention.ms=604800000

# tiered storage: brokers, then topic
remote.log.storage.system.enable=true
remote.storage.enable=true
local.retention.ms=86400000

# see the log start offset and the end offset of each partition
kafka-get-offsets.sh --bootstrap-server b1:9092 --topic orders --time -2    # earliest (log start)
kafka-get-offsets.sh --bootstrap-server b1:9092 --topic orders --time -1    # latest</pre>
<p>More: ${KL(KDOC + 'compaction', 'Log compaction')}, ${KL(KDOC + 'tiered_storage', 'Tiered storage')} and ${KL(KIP + 'KIP-405%3A+Kafka+Tiered+Storage', 'KIP-405: Kafka Tiered Storage')}.</p>`, scenarios: [retain, tomb, compact, cap, tiered] };
})();
