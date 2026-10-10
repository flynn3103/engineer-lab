/* Chapter 25 "Crash Recovery with ARIES" (index 24, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L21 Database Crash Recovery (LSNs, normal execution, CLRs, fuzzy checkpoints, analysis, redo and undo passes).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: the three ARIES passes over a log, the pageLSN and flushedLSN rule, undo with compensation records, and a checkpoint-spacing chart. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 2. ARIES: analysis and redo walk the log forward, undo walks the losers backward and writes CLRs ---- */
  const LOGR = [
    ['L1', 'T1 update P1', 0], ['L2', 'T2 update P2', 0], ['L3', 'CHECKPOINT  ATT {T1, T2}', 1], ['L4', 'T1 update P3', 0], ['L5', 'T1 COMMIT', 0], ['L6', 'T2 update P2', 0], ['L7', 'T2 update P1', 0],
  ];
  const RY = i => 92 + i * 25;
  const aries = {
    id: 'aries-passes', label: 'ARIES recovery', desc: 'The log after a crash. Analysis scans forward from the last checkpoint, redo repeats history, and undo walks the loser transaction backward, writing a compensation record for each step (log illustrative).',
    codeLabel: 'Recovery',
    code: { bug: [
      'MasterRecord -> last checkpoint at L3: active transactions {T1, T2}, dirty pages',
      'analysis: scan L3 to the end, rebuild the active transaction table and dirty page table',
      'redo: start at the smallest recLSN, repeat every update unless pageLSN >= LSN',
      'undo: T2 never committed; undo its updates newest first, logging a CLR for each',
      'a crash during recovery is safe: CLRs are never undone, so progress is kept',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 3 pages, 2 transactions, one crash. Illustrative.',
      header: s => ({ left: s.pass || 'log after the crash', right: s.right || '' }),
      draw(P, s) {
        P.text('hl', { x: 30, y: 84, t: 'write-ahead log, oldest first', cls: 'mut sm' });
        const rows = LOGR.map(r => r.slice());
        (s.clrs || []).forEach(c => rows.push(c));
        rows.forEach(([id, text, ck], i) => {
          const mark = s.marks && s.marks[id];
          P.box('r' + id, { x: 30, y: RY(i), w: 290, h: 21, tone: mark === 'redo' ? 'ok' : mark === 'skip' ? 'mut' : mark === 'undo' ? 'warn' : (s.cursor === id ? 'cursor' : (ck ? 'acc' : (id.startsWith('C') ? 'warn' : 'info'))), label: id + '  ' + text, cls: 'xs', sw: s.cursor === id ? 2.6 : 1.2, stroke: s.cursor === id ? 'cursor' : null });
          if (mark) P.text('mk' + id, { x: 330, y: RY(i) + 15, t: mark === 'redo' ? 'redo' : mark === 'skip' ? 'skip' : 'undo', cls: 'xs b tone-' + (mark === 'redo' ? 'ok' : mark === 'skip' ? 'mut' : 'warn') });
        });
        if (s.crashAt) P.chip('cr', { x: 30, y: RY(rows.length) + 4, w: 290, h: 22, label: 'crash here', tone: 'bad', small: true, r: 4 });
        if (s.att) { P.text('ha', { x: 430, y: 84, t: 'active transactions', cls: 'mut sm' }); s.att.forEach(([t, l], i) => P.chip('at' + i, { x: 430, y: 94 + i * 38, w: 180, h: 32, label: t + '  lastLSN ' + l, tone: l === 'none' ? 'mut' : 'cursor', small: true })); }
        if (s.dpt) { P.text('hd', { x: 430, y: 180, t: 'dirty pages (recLSN)', cls: 'mut sm' }); s.dpt.forEach(([p, l], i) => P.chip('dp' + i, { x: 430, y: 190 + i * 34, w: 180, h: 28, label: p + '  recLSN ' + l, tone: 'warn', small: true })); }
        if (s.note) P.chip('nt', { x: 430, y: 300, w: 180, h: 40, label: s.note, tone: s.noteTone || 'ok', small: true });
      }
    }),
    bug: [
      { log: 'After the crash the log holds seven records. T1 committed at L5. T2 was still running, so it has no COMMIT. The MasterRecord points to the checkpoint at L3.', callout: 'T1 committed, T2 did not', code: 0,
        state: { cursor: 'L3', crashAt: 1 }, stats: [{ l: 'log records', v: '7' }, { l: 'losers', v: 'T2', cls: 'warn' }] },
      { log: 'Analysis starts at the checkpoint. It takes the active transaction table from the checkpoint record and scans forward from L3.', callout: 'Analysis: start at the checkpoint', code: 1,
        state: { pass: 'pass 1: analysis', cursor: 'L3', crashAt: 1, att: [['T1', 2], ['T2', 2]], dpt: [['P1', 1], ['P2', 2]] }, stats: [{ l: 'pass', v: 'analysis' }] },
      { log: 'Scanning on, L4 dirties P3. L5 commits T1, so T1 leaves the table. L6 and L7 move T2\'s last LSN to 7. The pass ends with T2 as the only active transaction.', callout: 'Analysis ends: T2 is the loser', code: 1,
        state: { pass: 'pass 1: analysis', cursor: 'L7', crashAt: 1, att: [['T1', 'none'], ['T2', 7]], dpt: [['P1', 1], ['P2', 2], ['P3', 4]], note: 'T1 committed, T2 is a loser', noteTone: 'warn' }, stats: [{ l: 'losers', v: 'T2', cls: 'warn' }, { l: 'dirty pages', v: '3' }] },
      { log: 'Redo starts at the smallest recLSN, 1, and repeats history. L1 is skipped because P1 on disk already has pageLSN 1. L2, L4, L6 and L7 are redone.', callout: 'Redo: repeat history from LSN 1', moment: true, code: 2,
        state: { pass: 'pass 2: redo', cursor: 'L7', crashAt: 1, marks: { L1: 'skip', L2: 'redo', L4: 'redo', L6: 'redo', L7: 'redo' }, att: [['T2', 7]], dpt: [['P1', 1], ['P2', 2], ['P3', 4]] }, stats: [{ l: 'redone', v: '4', cls: 'ok' }, { l: 'skipped', v: '1' }] },
      { log: 'Redo repeats even the loser\'s updates. The pages are now exactly as they were at the moment of the crash, which makes undo simple.', callout: 'Pages are back to their state at the crash', code: 2,
        state: { pass: 'pass 2: redo', crashAt: 1, att: [['T2', 7]], note: 'state as at the crash', noteTone: 'ok' }, stats: [{ l: 'state', v: 'as at crash', cls: 'ok' }] },
      { log: 'Undo walks T2 backward from its last LSN. L7 is undone first and a compensation record, CLR 8, is written. Then L6 and CLR 9.', callout: 'Undo: newest first, a CLR for each', code: 3,
        state: { pass: 'pass 3: undo', marks: { L7: 'undo', L6: 'undo' }, clrs: [['C8', 'CLR undo L7', 0], ['C9', 'CLR undo L6', 0]], att: [['T2', 9]], note: 'T2 rolled back to L2', noteTone: 'warn' }, stats: [{ l: 'undone', v: '2', cls: 'warn' }, { l: 'CLRs written', v: '2' }] },
      { log: 'L2 is undone too, with CLR 10. T2 is fully rolled back and recovery writes its END record. Only T1\'s committed work remains.', callout: 'T2 fully undone, only T1 remains', code: 3,
        state: { pass: 'pass 3: undo', marks: { L7: 'undo', L6: 'undo', L2: 'undo' }, clrs: [['C8', 'CLR undo L7', 0], ['C9', 'CLR undo L6', 0], ['C10', 'CLR undo L2', 0]], att: [['T2', 'done']], note: 'database consistent', noteTone: 'ok' }, stats: [{ l: 'losers left', v: '0', cls: 'ok' }] },
      { log: 'If power fails again during recovery, the CLRs are already in the log. A CLR is never undone, so the next recovery continues where this one stopped.', callout: 'A crash during recovery loses no progress', code: 4,
        state: { pass: 'pass 3: undo', marks: { L7: 'undo', L6: 'undo', L2: 'undo' }, clrs: [['C8', 'CLR undo L7', 0], ['C9', 'CLR undo L6', 0], ['C10', 'CLR undo L2', 0]], note: 'CLRs are redo-only', noteTone: 'ok' }, stats: [{ l: 'repeated work', v: 'none', cls: 'ok' }],
        takeaway: 'ARIES analyses, redoes everything, then undoes the losers. CLRs make undo safe even if recovery itself crashes.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A payments database moves 30 from account A to account B. The host loses power in the middle of the transfer. After restart, <code>SUM(balance)</code> is 120 instead of 150 (illustrative). Thirty units have left A and never arrived in B, and nothing in the log mentions the transfer.",
    "predict": {
      "q": "Now assume the log records for the transfer were flushed before page A was written. Power fails after page A is on disk, before the COMMIT. What should recovery do?",
      "opts": [
        "Undo the transfer from the logged before values, so A is 100 and B is 50",
        "Redo the rest of the transfer, so A is 70 and B is 80",
        "Leave A at 70, because pages on disk are always trusted",
        "Stop and wait for an operator to fix the balances by hand"
      ],
      "ans": 0,
      "why": "The transfer never wrote a durable COMMIT record, so it is a loser and must be undone. The log holds the before values, so recovery can restore A to 100, and the total is 150 again."
    },
    "diagnose": [
      {
        "t": "Partially written page",
        "sym": "Wrong balance after restart, and the page fails verification when it is read.",
        "ctx": "Power failed in the middle of an in-place data page write.",
        "why": "The torn-write model and the doublewrite area are illustrative; the course text does not cover them. A page write is not atomic on disk: power can fail after the first sector. Recovery then sees a fresh header with stale contents. Redo skips the record because the page header says it is already applied.",
        "log": "-- representative PostgreSQL log, wording varies by version\nWARNING:  page verification failed, calculated checksum 41237 but expected 9182\n-- representative application check\nSUM(balance) = 120, expected 150",
        "fix": [
          "Measure first: search the server log for page verification failed, and compare SUM(balance) with the expected total.",
          "Fix: write a full copy of each page to a doublewrite area and sync it, before the page is written in place (illustrative; not in the course text).",
          "Fix: store a checksum in each page, and on recovery restore a page that fails it from the doublewrite copy.",
          "Fix: log a full page image the first time a page changes after a checkpoint, so redo can rebuild a torn page (illustrative; not in the course text).",
          "Verify: simulate a torn write in a test. The restart must restore a page with the expected total."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-445 L21 Database Crash Recovery (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/21-recovery.pdf' };

  /* ---- 2. LSNs: a page may reach disk only after the log up to its pageLSN ---- */
  const LX = i => 40 + i * 92;
  const lsnScene = {
    id: 'lsn-rule', label: 'The LSN rule', desc: 'Every log record has a number, the LSN. A page remembers the LSN of its latest update, the pageLSN. The log keeps a flushedLSN for how far it is on disk. A page may be written only if pageLSN is at most flushedLSN (numbers illustrative).',
    codeLabel: 'Rule',
    code: { bug: [
      'log: LSN 1..3 on disk (flushedLSN = 3), LSN 4 and 5 still in the memory buffer',
      'UPDATE page 17 -> log record LSN 5, pageLSN of page 17 = 5',
      'the buffer pool wants to evict page 17: pageLSN 5 > flushedLSN 3 -> not allowed yet',
      'flush the log through LSN 5: flushedLSN = 5',
      'now pageLSN 5 <= flushedLSN 5: write page 17 to disk',
      'a crash now still finds the log record that describes the change',
    ] },
    stage: DB.stage({
      footer: 'Simplified: five log records, one page. Illustrative.',
      header: s => ({ left: s.hl || 'log and page', right: 'flushedLSN = ' + s.fl + ' · pageLSN = ' + (s.pl == null ? '-' : s.pl) }),
      draw(P, s) {
        P.text('hl', { x: 40, y: 88, t: 'log (oldest left)', cls: 'mut sm' });
        for (let i = 1; i <= (s.n || 5); i++) P.chip('l' + i, { x: LX(i - 1), y: 100, w: 82, h: 44, label: 'LSN ' + i, sub: i <= s.fl ? 'on disk' : 'in memory', tone: i <= s.fl ? 'ok' : 'warn' });
        P.line('fl', LX(s.fl - 1) + 82, 94, LX(s.fl - 1) + 82, 152, { tone: 'ok', sw: 3 }); P.text('flt', { x: LX(s.fl - 1) + 86, y: 164, t: 'flushedLSN', cls: 'xs' });
        if (s.page) { P.text('hp', { x: 40, y: 210, t: 'buffer pool', cls: 'mut sm' }); P.chip('pg', { x: 40, y: 220, w: 190, h: 56, label: 'page 17 (dirty)', sub: 'pageLSN = ' + s.pl, tone: s.verdict === 'wait' ? 'bad' : s.verdict === 'ok' ? 'ok' : 'cursor' }); }
        if (s.verdict) P.chip('vd', { x: 260, y: 220, w: 350, h: 56, label: s.verdict === 'wait' ? 'evict? pageLSN 5 > flushedLSN 3: NO' : s.verdict === 'ok' ? 'evict? pageLSN 5 <= flushedLSN 5: YES' : s.verdict, sub: s.sub || '', tone: s.verdict === 'wait' ? 'bad' : 'ok' });
        if (s.disk) P.chip('dk', { x: 260, y: 290, w: 350, h: 32, label: 'page 17 written to the data file', sub: '', tone: 'ok', small: true });
      }
    }),
    bug: [
      { log: 'Three log records are already on disk, so flushedLSN is 3. Records 4 and 5 sit in the memory buffer and would be lost in a crash.', callout: 'flushedLSN = 3', code: 0, state: { fl: 3, n: 5 }, stats: [{ l: 'on disk', v: 'LSN 1 to 3' }] },
      { log: 'An UPDATE changes page 17 and appends record 5. The page remembers it: pageLSN = 5. The page is dirty and its log record is not yet on disk.', callout: 'The update sets pageLSN = 5', code: 1, state: { fl: 3, n: 5, page: 1, pl: 5 }, stats: [{ l: 'pageLSN', v: '5' }] },
      { log: 'The buffer pool wants the frame. It compares pageLSN 5 with flushedLSN 3. Writing the page now could put a change on disk that the log cannot undo after a crash, so it refuses.', callout: 'pageLSN 5 > flushedLSN 3: refuse', moment: true, code: 2, state: { fl: 3, n: 5, page: 1, pl: 5, verdict: 'wait' }, stats: [{ l: 'write page 17', v: 'not yet', cls: 'bad' }] },
      { log: 'The log is flushed through LSN 5, and flushedLSN becomes 5. All records the page depends on are now on stable storage.', callout: 'Flush the log first: flushedLSN = 5', code: 3, state: { fl: 5, n: 5, page: 1, pl: 5, verdict: 'wait' }, stats: [{ l: 'flushedLSN', v: '5', cls: 'ok' }] },
      { log: 'Now pageLSN 5 is not greater than flushedLSN 5, and the page can go to disk. If the machine crashes, the log holds both the old and the new value for undo and redo.', callout: 'pageLSN 5 <= flushedLSN 5: write', moment: true, code: 4, state: { fl: 5, n: 5, page: 1, pl: 5, verdict: 'ok', disk: 1 }, stats: [{ l: 'write page 17', v: 'allowed', cls: 'ok' }],
        takeaway: 'The pageLSN and flushedLSN pair enforces write-ahead logging with one comparison.' },
    ],
  };

  /* ---- 3. Undo with CLRs: a rollback is itself logged, so a crash in the middle never undoes twice ---- */
  const RX = i => 24 + i * 76;
  const RECS = [['10', 'U(A)'], ['20', 'U(B)'], ['30', 'U(C)'], ['40', 'ABORT'], ['50', 'CLR 30'], ['60', 'CLR 20'], ['70', 'CLR 10'], ['80', 'END']];
  const clr = {
    id: 'clr-undo', label: 'Undo and CLRs', desc: 'T1 updates A, B and C, then aborts. Each undo step is written to the log as a compensation record, a CLR, that points to the next record still to undo. If the system crashes in the middle of the rollback, recovery resumes where it stopped (LSNs illustrative).',
    codeLabel: 'Log',
    code: { bug: [
      'T1: LSN 10 update A, LSN 20 update B, LSN 30 update C   (prevLSN links 30 -> 20 -> 10)',
      'abort: LSN 40 ABORT, then undo from the newest update',
      'LSN 50 CLR undoes 30, undoNextLSN = 20      LSN 60 CLR undoes 20, undoNextLSN = 10',
      'crash here: LSN 70 and 80 were never written',
      'restart: redo repeats history, including the CLRs; undo resumes at undoNextLSN = 10',
      'LSN 70 CLR undoes 10, then TXN-END. A CLR is never undone',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one transaction. A CLR is never undone.',
      header: s => ({ left: s.hl || 'log of T1', right: s.rt || '' }),
      draw(P, s) {
        RECS.forEach(([l, t], i) => { if (i >= (s.n || 0)) return; const isClr = t.startsWith('CLR');
          P.chip('r' + l, { x: RX(i), y: 100, w: 70, h: 48, label: 'LSN ' + l, sub: t, tone: s.hot === l ? 'cursor' : isClr ? 'acc' : t === 'ABORT' || t === 'END' ? 'mut' : 'info', small: true }); });
        (s.prev || []).forEach(([a, b], k) => P.line('pv' + k, RX(a) + 35, 152, RX(b) + 35, 152, { tone: 'mut', arrow: true, label: 'prevLSN', dy: 14 }));
        (s.und || []).forEach(([a, b], k) => P.line('un' + k, RX(a) + 35, 96, RX(b) + 35, 96, { tone: 'acc', arrow: true, label: 'undoNext', dy: -10 }));
        if (s.crash != null) P.line('cr', RX(s.crash) - 3, 90, RX(s.crash) - 3, 200, { tone: 'bad', sw: 3 });
        if (s.crash != null) P.text('crt', { x: RX(s.crash) + 2, y: 214, t: 'crash', cls: 'xs tone-bad' });
        if (s.note) P.chip('nt', { x: 24, y: 250, w: 580, h: 36, label: s.note, sub: '', tone: s.noteTone || 'info', small: true });
      }
    }),
    bug: [
      { log: 'T1 updates three items. Each log record carries a prevLSN that points to the previous record of the same transaction, so the DBMS can walk T1 backward without scanning the whole log.', callout: 'prevLSN chains T1\'s records', code: 0, state: { n: 3, prev: [[2, 1], [1, 0]] }, stats: [{ l: 'updates', v: '3' }] },
      { log: 'T1 aborts. The DBMS writes an ABORT record and starts undoing, newest update first, so that the data returns to its old values.', callout: 'ABORT, then undo from the newest', code: 1, state: { n: 4, prev: [[2, 1], [1, 0]], hot: '40' }, stats: [{ l: 'to undo', v: '3 updates' }] },
      { log: 'Undoing LSN 30 restores C and appends a compensation record, CLR 50. It holds the same fields as an update plus undoNextLSN = 20: the next thing to undo.', callout: 'CLR 50 undoes 30, next is 20', code: 2, state: { n: 5, prev: [[2, 1], [1, 0]], und: [[4, 1]], hot: '50' }, stats: [{ l: 'undone', v: '1 of 3' }] },
      { log: 'CLR 60 undoes LSN 20 and points to 10. Two of three updates are now rolled back, and the work is recorded in the log.', callout: 'CLR 60 undoes 20, next is 10', code: 2, state: { n: 6, prev: [[2, 1], [1, 0]], und: [[4, 1], [5, 0]], hot: '60' }, stats: [{ l: 'undone', v: '2 of 3' }] },
      { log: 'The power fails here. Records 70 and 80 never reach the log. T1 is a loser that was in the middle of rolling back.', callout: 'Crash in the middle of the rollback', moment: true, code: 3, state: { n: 6, prev: [[2, 1], [1, 0]], und: [[4, 1], [5, 0]], crash: 6, note: 'T1 is in the active transaction table, last record: CLR 60', noteTone: 'warn' }, stats: [{ l: 'T1', v: 'half undone', cls: 'warn' }] },
      { log: 'On restart, redo repeats history, CLRs included, so C and B are back to their old values. Undo takes the last record of T1, CLR 60, and follows its undoNextLSN to 10. LSN 30 and 20 are not undone again.', callout: 'Resume at undoNextLSN = 10', code: 4, state: { n: 6, prev: [[2, 1], [1, 0]], und: [[4, 1], [5, 0]], note: 'undo continues at LSN 10, not at LSN 30', noteTone: 'ok' }, stats: [{ l: 'double undo', v: 'none', cls: 'ok' }] },
      { log: 'CLR 70 undoes LSN 10, with no next record, and TXN-END 80 closes the transaction. CLRs are never undone, so repeated crashes cannot loop.', callout: 'CLR 70 and TXN-END finish it', moment: true, code: 5, state: { n: 8, prev: [[2, 1], [1, 0]], und: [[4, 1], [5, 0], [6, 2]], hot: '80' }, stats: [{ l: 'undone', v: '3 of 3', cls: 'ok' }],
        takeaway: 'Logging the undo makes recovery restartable. Every undo step is recorded, and a CLR tells recovery where to continue.' },
    ],
  };

  /* ---- 4. Checkpoint spacing: shorter recovery against more write work ---- */
  const KX0 = 80, KX1 = 590, KY0 = 288, KY1 = 108;
  const kxm = t => KX0 + Math.log10(t) / Math.log10(60) * (KX1 - KX0);
  const kyv = v => KY0 - v / 100 * (KY0 - KY1);
  const KT = [1, 2, 5, 10, 20, 40, 60];
  const recoveryIdx = t => Math.min(100, 100 * t / 60), ioIdx = t => Math.min(100, 100 / Math.pow(t, 0.9));
  const ckpt = {
    id: 'checkpoint-interval', label: 'Checkpoint spacing', desc: 'How far apart checkpoints are decides two costs. The longer the gap, the more log recovery must redo. The shorter the gap, the more dirty pages are written during normal work. Both on a relative scale (shape illustrative).',
    codeLabel: 'Reading',
    code: { bug: [
      'x: minutes between checkpoints (log scale), y: relative cost 0 to 100',
      'recovery time grows with the log to redo: about the work since the last checkpoint',
      'checkpoint I/O falls as the gap grows: fewer dirty pages are written twice',
      'the curves cross: the interval balances restart time against write overhead',
      'checkpoint_timeout = 5 min, max_wal_size sized so checkpoints are time-driven, not size-driven',
    ] },
    stage: DB.stage({
      footer: 'Illustrative shape, not a benchmark.',
      header: s => ({ left: s.hl || 'relative cost against checkpoint gap', right: '' }),
      draw(P, s) {
        P.line('ax', KX0, KY0 + 4, KX1, KY0 + 4, { tone: 'mut' }); P.line('ay', KX0, KY0 + 4, KX0, KY1 - 10, { tone: 'mut' });
        [1, 2, 5, 10, 20, 60].forEach((t, i) => P.text('tx' + i, { x: kxm(t), y: KY0 + 22, t: String(t), cls: 'mut xs', anchor: 'middle' }));
        P.text('xl', { x: KX1, y: KY0 + 40, t: 'minutes between checkpoints (log)', cls: 'mut xs', anchor: 'end' }); P.text('yl', { x: KX0 + 6, y: KY1 - 14, t: 'relative cost', cls: 'mut xs' });
        KT.forEach((t, k) => { if (!k) return; const p = KT[k - 1]; if (s.rec) P.line('r' + k, kxm(p), kyv(recoveryIdx(p)), kxm(t), kyv(recoveryIdx(t)), { tone: 'bad', sw: 3 }); if (s.io) P.line('i' + k, kxm(p), kyv(ioIdx(p)), kxm(t), kyv(ioIdx(t)), { tone: 'warn', sw: 3 }); });
        if (s.rec) P.text('lr', { x: kxm(20), y: kyv(recoveryIdx(20)) - 10, t: 'recovery time', cls: 'xs tone-bad' });
        if (s.io) P.text('li', { x: kxm(2) + 6, y: kyv(ioIdx(2)) - 8, t: 'checkpoint I/O', cls: 'xs' });
        if (s.x) { P.line('x', kxm(6.5), KY0 + 4, kxm(6.5), KY1 - 6, { tone: 'cursor', dash: true, sw: 2 }); P.chip('xc', { x: kxm(6.5) + 6, y: KY1 - 4, w: 150, h: 26, label: 'balance near 5 to 10 min', sub: '', tone: 'cursor', small: true }); }
      }
    }),
    bug: [
      { log: 'Recovery redoes everything logged since the last checkpoint. The further apart checkpoints are, the more log has to be read and replayed before the database opens.', callout: 'Longer gap, longer restart', code: 1, state: { rec: 1 }, stats: [{ l: 'recovery time', v: 'grows with gap', cls: 'warn' }] },
      { log: 'A checkpoint writes dirty pages to disk. With frequent checkpoints the same hot page is written again and again, so write bandwidth is spent on checkpoints. With rare ones each page is written once per long cycle.', callout: 'Shorter gap, more write work', code: 2, state: { rec: 1, io: 1 }, stats: [{ l: 'checkpoint I/O', v: 'falls with gap', cls: 'warn' }] },
      { log: 'The curves cross. A very short gap means a fast restart and a busy disk, with bursts that raise latency. A very long gap means a quiet disk and a restart of many minutes.', callout: 'The curves cross', moment: true, code: 3, state: { rec: 1, io: 1, x: 1 }, stats: [{ l: 'balance', v: 'a few minutes' }] },
      { log: 'Systems let you set the timeout and the maximum log size, and spread the writes over most of the interval, so the checkpoint is a steady background load, not a burst.', callout: 'Spread the writes over the interval', code: 4, state: { rec: 1, io: 1, x: 1 }, stats: [{ l: 'setting', v: 'time-driven, spread', cls: 'ok' }],
        takeaway: 'Checkpoint spacing trades restart time against write overhead. Pick the recovery time you can accept, then spread the writes.' },
    ],
  };

  const EXPLAIN = `
<h3>1. ARIES in three ideas</h3>
<p>ARIES (Algorithms for Recovery and Isolation Exploiting Semantics) was designed at IBM Research in the early 1990s for DB2, and its structure is used by most databases. It has three key ideas. <b>Write-ahead logging</b> with STEAL and NO-FORCE, from the last chapter: every change is in the log on stable storage before the data page. <b>Repeating history during redo</b>: on restart, retrace every action, from winners and losers alike, to restore the exact state at the crash. <b>Logging changes during undo</b>: the undo actions are logged too, so they are never repeated if the system crashes again.</p>

<h3>2. LSNs and the tables that track them</h3>
<p>Every log record has a globally unique, increasing <b>log sequence number</b> (LSN). The system keeps several: the <b>flushedLSN</b> in memory, the last LSN of the log that is on disk; the <b>pageLSN</b> in each data page, the newest update applied to it; the <b>recLSN</b> in the dirty page table, the oldest update to a page since it was last flushed; the <b>lastLSN</b> in the active transaction table, the latest record of a transaction; and the <b>MasterRecord</b> on disk, the LSN of the latest checkpoint. The write-ahead rule becomes a comparison: before page i is written, the log must be flushed so that pageLSN<sub>i</sub> ≤ flushedLSN. Log records of one transaction are linked by a <b>prevLSN</b>.</p>

<h3>3. Normal execution</h3>
<p>To <b>commit</b>, the DBMS appends a COMMIT record to the log buffer and flushes the log up to it, a sequential, synchronous write. Then it acknowledges the client. Later it writes a TXN-END record, which needs no immediate flush. To <b>abort</b>, it appends an ABORT record and undoes the updates in reverse order. For every undone update it writes a <b>compensation log record</b> (CLR): the same fields as an update plus an <b>undoNextLSN</b>, the next record still to undo. CLRs are appended like any record and are never undone, and the abort does not need to wait for them to be flushed. A TXN-END record closes the transaction.</p>

<h3>4. Checkpoints with an active system</h3>
<p>A checkpoint limits how much log recovery needs. A <b>non-fuzzy</b> checkpoint halts new transactions, waits for active ones to finish and flushes dirty pages: simple, and it stalls the system. A slightly better one records state at the start without waiting for transactions. The <b>fuzzy checkpoint</b> lets transactions run while it works. It writes the <b>active transaction table</b> (ATT: transaction ID, status, lastLSN) and the <b>dirty page table</b> (DPT: each dirty page and its recLSN) into the log as CHECKPOINT-BEGIN and CHECKPOINT-END records, and updates the MasterRecord when it finishes. Pages written during the checkpoint may be newer or older than the tables say, which is why redo checks each page.</p>

<h3>5. The three recovery passes</h3>
<p>After a crash ARIES starts at the MasterRecord and runs three passes. <b>Analysis</b> reads the log forward from the last checkpoint and rebuilds the ATT and DPT: a transaction with a COMMIT is a winner, one with no COMMIT or END is a loser, and any update to a page not in the DPT adds it. <b>Redo</b> reads forward from the smallest recLSN in the DPT and reapplies each update and CLR unless the page is not dirty, or was already flushed, or already has the change, as in the diagram. <b>Undo</b> reads backward and rolls back every loser, following prevLSN and undoNextLSN, writing a CLR for each step and ending each transaction with TXN-END.</p>
<figure class="mm" aria-label="Flowchart of the three ARIES recovery passes" style="--diagram-width:168px">
  <img src="diagrams/ch24-aries-passes.svg" alt="Flowchart: after a crash read the MasterRecord for the last checkpoint LSN. Pass 1, analysis, goes forward from the checkpoint to rebuild the active transaction table and the dirty page table. Pass 2, redo, goes forward from the smallest recLSN and repeats history for winners and losers. Pass 3, undo, goes backward and rolls back the losers, writing CLRs. Then the database opens.">
  <figcaption>Flowchart: analysis, redo, undo.</figcaption>
</figure>
<figure class="mm" aria-label="Flowchart of the redo decision for each log record" style="--diagram-width:575px">
  <img src="diagrams/ch24-redo-test.svg" alt="Flowchart: for each update or CLR record with LSN n on page p, skip it if p is not in the dirty page table, skip it if the recLSN of p is greater than n, skip it if the pageLSN on disk is at least n, otherwise redo the change and set the pageLSN to n.">
  <figcaption>Flowchart: when redo skips a record. Redo is idempotent because of the pageLSN test.</figcaption>
</figure>

<h3>6. The trade-off</h3>
<p>ARIES makes normal operation cheap, with sequential log writes and free page writes, and pays at recovery with up to three passes. How long recovery takes depends on the checkpoint spacing and on how much was in flight: a long transaction that must be undone can take nearly as long to roll back as it ran. Checkpointing too often wastes write bandwidth, too rarely lengthens restart. The log must also be kept, for recovery and for replicas.</p>

<h3>7. Syntax</h3>
<pre>-- PostgreSQL: when did the last checkpoint run and what did it cost
SELECT checkpoints_timed, checkpoints_req, checkpoint_write_time, checkpoint_sync_time
FROM pg_stat_checkpointer;      -- pg_stat_bgwriter before PostgreSQL 17

-- the start point recovery would use
-- pg_controldata $PGDATA | grep -i "checkpoint location"

-- the log record types for a transaction
-- pg_waldump -x 735 $PGDATA/pg_wal/000000010000000000000042

-- restart time scales with the log since the checkpoint; spread the checkpoint writes
SHOW checkpoint_timeout;  SHOW checkpoint_completion_target;  SHOW max_wal_size;

-- torn page protection: full page after each checkpoint
SHOW full_page_writes;</pre>
<p>On startup, the server log shows <code>redo starts at</code> and <code>redo done at</code> with the LSNs. The difference is the log that was replayed.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: [
      {
        t: 'Slow restart after a crash',
        sym: '<b>The database takes many minutes</b> to accept connections after a crash.',
        ctx: 'Checkpoints are 30 minutes apart and the write load is heavy, so there are tens of GB of log between the last checkpoint and the crash.',
        why: 'Redo starts at the smallest recLSN of the dirty page table and replays every change since then. Replay speed is bounded by reading the log and fetching pages, so restart time grows with the distance from the last checkpoint.',
        log: `-- representative server log, illustrative
LOG: redo starts at 4/1A000028
LOG: redo done at 4/9C2F1100   (38 GB of WAL, 17 minutes)`,
        note: 'The difference between redo start and redo done is the work recovery had to do.',
        fix: [
          'Measure first: read the redo start and redo done positions and the time between them in the server log after a restart.',
          'Shorten the checkpoint interval, for example <code>checkpoint_timeout</code> and <code>max_wal_size</code>, and spread the writes with <code>checkpoint_completion_target</code>.',
          'Place the log on fast sequential storage, and size memory so redo does not wait for page reads.',
          'Rehearse a crash restart on a replica and record the time.',
          'Verify: restart time should match the recovery time objective.'
        ]
      },
      {
        t: 'A long transaction takes as long to roll back',
        sym: '<b>A rollback</b> of a big transaction takes nearly as long as the transaction ran, while it holds locks.',
        ctx: 'A batch job updated 80 million rows in one transaction for two hours and then failed. The abort must undo every update.',
        why: 'Undo walks the log backward and restores each changed row, writing a CLR for each. The work is proportional to the number of updates, and the transaction keeps its locks until it ends.',
        log: `-- representative, illustrative
batch_job: ran 2h05m, 80,000,000 row updates
ROLLBACK issued 14:20 ... completed 16:11   (1h51m, locks held throughout)`,
        note: 'A long rollback is normal. The remedy is to avoid giant transactions.',
        fix: [
          'Measure first: note the elapsed time and the number of rows changed before the failure.',
          'Split the job into batches of a few thousand rows with a commit between them, so any failure undoes little.',
          'Make the job restartable, by key range, so a failure resumes instead of starting over.',
          'Do not kill the server to stop a rollback: recovery would redo and undo it again on restart.',
          'Verify: with batches, a failure should roll back in seconds.'
        ]
      },
      OLD.diagnose[0]
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[24] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [aries, lsnScene, clr, ckpt] };
})();
