/* Chapter 13 · Logging and crash recovery: write-ahead logging, checkpoints and ARIES on one page-level model */
(function () {
  const sec = SX.sec, para = SX.para, chip = SX.chip, stat = SX.stat, stepper = SX.stepper, problems = SX.problems;

  SX.css('ch13-css', `
.c13-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.c13-box{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card);font-size:13px;display:grid;gap:2px;color:var(--mut);align-content:start}
.c13-box b{color:var(--ink);font-size:13px}
.c13-box small{font-size:12px;line-height:1.35}
.c13-box.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 16%,var(--card))}
.c13-box.bad{border-color:var(--acc2);background:color-mix(in srgb,var(--acc2) 14%,var(--card))}
.c13-box.dim{opacity:.55}
.c13-facts{display:flex;flex-wrap:wrap;gap:6px}
.c13-tl{margin:0;padding:0 0 0 18px;display:grid;gap:4px;font-size:13.5px;color:var(--mut)}
.c13-tl li.on{color:var(--ink)}
.c13-tl li.cur{font-weight:700;color:var(--ink)}
.c13-tl li.lost{text-decoration:line-through;opacity:.6}
.c13-cols{display:grid;grid-template-columns:1fr;gap:10px}
@media (min-width:760px){.c13-cols{grid-template-columns:1fr 1fr}}
.c13-arch{display:flex;flex-wrap:wrap;gap:6px}
.c13-comp{font-size:13px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.c13-comp.c13-pick{border-color:var(--acc);color:var(--acc)}
.c13-def{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--soft);font-size:14px;color:var(--ink)}
.c13-def p{margin:4px 0 0;color:var(--mut)}
.c13-cs{display:grid;gap:10px}
.c13-scroll{overflow-x:auto}
.c13-scroll table{min-width:520px}
.c13-play{display:grid;gap:10px}
.c13-verdict{font-weight:700;color:var(--ink)}
`);

  /*SIM-BEGIN*/
  /* Model: accounts A (100) and B (50). T1 moves 30 from A to B and commits. T2 moves 10 from A to B and never commits.
     Ops run in one of two orders: the WAL rule (log flushed before a page is written), or pages written first. */
  const OPS = {
    1: { op: 'begin', txn: 'T1' },
    2: { op: 'upd', txn: 'T1', obj: 'A', before: 100, after: 70 },
    3: { op: 'upd', txn: 'T1', obj: 'B', before: 50, after: 80 },
    4: { op: 'flush' },
    5: { op: 'write', obj: 'A' },
    6: { op: 'write', obj: 'B' },
    7: { op: 'commit', txn: 'T1' },
    8: { op: 'flush' },
    9: { op: 'ckpt' },
    10: { op: 'begin', txn: 'T2' },
    11: { op: 'upd', txn: 'T2', obj: 'A', before: 70, after: 60 },
    12: { op: 'upd', txn: 'T2', obj: 'B', before: 80, after: 90 },
    13: { op: 'flush' },
    14: { op: 'write', obj: 'A' }
  };
  const TEXT = {
    1: 'BEGIN T1 goes to the log buffer.',
    2: 'T1 changes A from 100 to 70. The record is buffered, and page A is dirty in memory.',
    3: 'T1 changes B from 50 to 80. The record is buffered, and page B is dirty in memory.',
    4: 'Flush: the log buffer reaches disk through LSN 3.',
    5: 'Write page A: the pool writes the change to disk before T1 commits (steal).',
    6: 'Write page B to disk.',
    7: 'COMMIT T1 goes to the log buffer. It is not durable yet.',
    8: 'Flush: COMMIT T1 reaches disk. Only now may the client be told that T1 committed.',
    9: 'Checkpoint: a CHECKPOINT record is written with the dirty page table. No page is dirty, so the table is empty.',
    10: 'BEGIN T2 goes to the log buffer.',
    11: 'T2 changes A from 70 to 60. The record is buffered, and page A is dirty.',
    12: 'T2 changes B from 80 to 90. The record is buffered, and page B is dirty.',
    13: 'Flush: the log reaches disk through LSN 8.',
    14: 'Write page A: the pool writes T2 change to disk (steal). T2 never commits.'
  };
  /* the order the events run in, for each rule */
  const ORDER = {
    good: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    bad: [1, 2, 3, 5, 6, 4, 7, 8, 9, 10, 11, 12, 14, 13]
  };

  const CRASH_MAX = 14;
  function applyOp(st, id) {
    const o = OPS[id];
    if (o.op === 'begin') { st.lsn++; st.log.push({ lsn: st.lsn, type: 'BEGIN', txn: o.txn }); }
    else if (o.op === 'upd') {
      st.lsn++;
      st.log.push({ lsn: st.lsn, type: 'UPDATE', txn: o.txn, obj: o.obj, before: o.before, after: o.after });
      const p = st.pool[o.obj];
      p.rec = p.dirty ? p.rec : st.lsn;
      p.v = o.after; p.lsn = st.lsn; p.dirty = true;
    } else if (o.op === 'commit') { st.lsn++; st.log.push({ lsn: st.lsn, type: 'COMMIT', txn: o.txn }); }
    else if (o.op === 'flush') st.flushed = st.lsn;
    else if (o.op === 'write') { const p = st.pool[o.obj]; st.disk[o.obj] = { v: p.v, lsn: p.lsn }; p.dirty = false; }
    else if (o.op === 'ckpt') {
      st.lsn++;
      const dpt = {};
      ['A', 'B'].forEach(k => { if (st.pool[k].dirty) dpt[k] = st.pool[k].rec; });
      st.log.push({ lsn: st.lsn, type: 'CHECKPOINT', dpt });
      st.flushed = st.lsn;
    }
  }

  /* the state after the first k events of a rule */
  function stateAt(rule, k) {
    const st = { lsn: 0, flushed: 0, log: [], pool: { A: { v: 100, lsn: 0, dirty: false, rec: 0 }, B: { v: 50, lsn: 0, dirty: false, rec: 0 } }, disk: { A: { v: 100, lsn: 0 }, B: { v: 50, lsn: 0 } } };
    ORDER[rule].slice(0, k).forEach(id => applyOp(st, id));
    return st;
  }

  /* ARIES: analysis from the last durable checkpoint, redo from the smallest recLSN, undo the losers */
  function recover(st) {
    const durable = st.log.filter(r => r.lsn <= st.flushed);
    const cps = durable.filter(r => r.type === 'CHECKPOINT');
    const cp = cps.length ? cps[cps.length - 1] : null;
    const scanFrom = cp ? cp.lsn : 0;
    const dpt = Object.assign({}, cp ? cp.dpt : {});
    const status = {};
    durable.filter(r => r.lsn > scanFrom).forEach(r => {
      if (r.type === 'BEGIN') status[r.txn] = 'loser';
      if (r.type === 'UPDATE') { status[r.txn] = status[r.txn] || 'loser'; if (!(r.obj in dpt)) dpt[r.obj] = r.lsn; }
      if (r.type === 'COMMIT') status[r.txn] = 'winner';
    });
    const vals = Object.values(dpt);
    const redoFrom = vals.length ? Math.min(...vals) : scanFrom + 1;
    const disk = { A: Object.assign({}, st.disk.A), B: Object.assign({}, st.disk.B) };
    const redone = [];
    durable.filter(r => r.type === 'UPDATE' && r.lsn >= redoFrom).forEach(r => {
      const inDpt = r.obj in dpt && r.lsn >= dpt[r.obj];
      if (inDpt && disk[r.obj].lsn < r.lsn) { disk[r.obj] = { v: r.after, lsn: r.lsn }; redone.push(r.lsn); }
    });
    const undone = [];
    durable.filter(r => r.type === 'UPDATE' && status[r.txn] === 'loser').reverse().forEach(r => {
      disk[r.obj] = { v: r.before, lsn: disk[r.obj].lsn }; undone.push(r.lsn);
    });
    const t1c = durable.some(r => r.type === 'COMMIT' && r.txn === 'T1');
    const expA = t1c ? 70 : 100, expB = t1c ? 80 : 50;
    return {
      durable, cp, scanFrom, redoFrom, dpt, redone, undone, t1c,
      scanned: durable.filter(r => r.lsn >= scanFrom).length,
      A: disk.A.v, B: disk.B.v, diskA: disk.A, diskB: disk.B, total: disk.A.v + disk.B.v,
      expA, expB, ok: disk.A.v === expA && disk.B.v === expB
    };
  }
  function failures(rule) {
    let n = 0;
    for (let k = 0; k <= CRASH_MAX; k++) if (!recover(stateAt(rule, k)).ok) n++;
    return n;
  }
  /*SIM-END*/


  /* ---- PLAYGROUND: pick a crash point and a write rule; replay recovery; check the money ---- */
  function playground(A) {
    let k = 9, rule = 'good';
    const tl = h('ol', { class: 'c13-tl' }), panel = h('div', { class: 'c13-cols' }), verdict = h('p', { class: 'sx-txt c13-verdict' }), summary = h('p', { class: 'sx-txt' });
    const paint = () => {
      const st = stateAt(rule, k), r = recover(st);
      const order = ORDER[rule];
      tl.replaceChildren(...order.map((id, i) => {
        const cls = i < k ? (i === k - 1 ? 'cur' : 'on') : '';
        return h('li', { class: cls }, TEXT[id]);
      }));
      const log = st.log.map(x => {
        const durable = x.lsn <= st.flushed;
        const text = 'LSN ' + x.lsn + ' · ' + x.type + (x.txn ? ' ' + x.txn : '') + (x.obj ? ' ' + x.obj + ' ' + x.before + '→' + x.after : '');
        return h('div', { class: 'c13-box ' + (durable ? 'on' : 'dim') }, h('b', {}, durable ? 'durable' : 'in buffer, lost on crash'), h('small', {}, text));
      });
      const disk = h('div', { class: 'c13-grid' }, [
        h('div', { class: 'c13-box ' + (st.disk.A.v !== 100 ? 'on' : '') }, h('b', {}, 'page A on disk: ' + st.disk.A.v), h('small', {}, 'pageLSN ' + st.disk.A.lsn)),
        h('div', { class: 'c13-box ' + (st.disk.B.v !== 50 ? 'on' : '') }, h('b', {}, 'page B on disk: ' + st.disk.B.v), h('small', {}, 'pageLSN ' + st.disk.B.lsn))
      ]);
      const rec = h('div', { class: 'c13-grid' }, [
        stat('scan from LSN', r.scanFrom), stat('records scanned', r.scanned), stat('redone', r.redone.length), stat('undone', r.undone.length),
        stat('A after recovery', r.A), stat('B after recovery', r.B), stat('total money', r.total), stat('expected from durable commits', r.expA + ' + ' + r.expB)
      ]);
      panel.replaceChildren(
        h('div', { class: 'sx-vis' }, h('small', {}, 'log'), log.length ? log : [h('small', {}, 'empty')]),
        h('div', { class: 'sx-vis' }, h('small', {}, 'data pages before recovery'), disk, h('small', {}, 'recovery'), rec));
      verdict.textContent = (r.ok ? 'Correct. ' : 'Wrong state. ') + (r.t1c ? 'T1 committed durably, so A 70 and B 80 are expected.' : 'T1 is not durable, so it must be undone: A 100 and B 50 are expected.') + (r.total === 150 ? ' The total is 150.' : ' The total is ' + r.total + ', not 150.');
      summary.textContent = 'Over all 15 crash points: the WAL rule gives ' + failures('good') + ' wrong states; writing pages first gives ' + failures('bad') + '.';
    };
    const kSlider = slider('Crash after step', 0, CRASH_MAX, k, 1, v => { k = v; paint(); }, v => 'step ' + v);
    const ruleSeg = seg([{ v: 'good', l: 'WAL rule: log flushed before a page write' }, { v: 'bad', l: 'Page written before its log record' }], rule, v => { rule = v; paint(); });
    paint();
    return h('div', { class: 'c13-play' }, h('div', { class: 'sx-controls' }, kSlider, ruleSeg), tl, panel, verdict, summary);
  }

  /* ---- CASE STUDY: ARIES on the same log ---- */
  const DEF = {
    buf: ['Log buffer', 'Records wait here in memory after they get an LSN. A commit forces the buffer to disk, and group commit shares one flush among several commits.'],
    disk: ['Log on disk', 'The durable prefix of the log, up to flushedLSN. Only these records survive a crash.'],
    page: ['pageLSN on a page', 'The LSN of the newest update to that page. Redo skips a record when the page already has it: pageLSN is at least the record LSN.'],
    dpt: ['Dirty page table (DPT)', 'For each dirty page, recLSN: the LSN of the first update since the page was last clean. Redo can start at the smallest recLSN.'],
    att: ['Active transaction table (ATT)', 'Each transaction still running at the time, with its lastLSN and a status. Analysis rebuilds it, and undo works through it.'],
    master: ['MasterRecord', 'The LSN of the last completed checkpoint. Recovery reads it first to know where analysis starts.'],
    clr: ['Compensation log record (CLR)', 'Written while undoing an update. It describes the undo, and it is never undone itself, so a crash during undo is safe.']
  };
  function caseStudy() {
    const comp = h('div', { class: 'c13-arch' }), def = h('div', { class: 'c13-def', 'aria-live': 'polite' });
    const show = key => {
      [...comp.children].forEach(b => b.classList.toggle('c13-pick', b.getAttribute('data-k') === key));
      def.replaceChildren(h('b', {}, DEF[key][0]), h('p', { html: DEF[key][1] }));
    };
    Object.keys(DEF).forEach(key => comp.append(h('button', { class: 'c13-comp', 'data-k': key, onclick: () => show(key) }, DEF[key][0])));
    show('dpt');
    const LOG = [
      { n: 'LSN 1 · BEGIN T1', cls: 'dim' }, { n: 'LSN 2 · A 100→70 (T1)', cls: 'dim' }, { n: 'LSN 3 · B 50→80 (T1)', cls: 'dim' },
      { n: 'LSN 4 · COMMIT T1', cls: 'dim' }, { n: 'LSN 5 · CHECKPOINT', cls: '' }, { n: 'LSN 6 · BEGIN T2', cls: 'bad' },
      { n: 'LSN 7 · A 70→60 (T2)', cls: 'bad' }, { n: 'LSN 8 · B 80→90 (T2)', cls: 'bad' }
    ];
    const view = s => [
      h('div', { class: 'c13-grid' }, s.recs.map(r => h('div', { class: 'c13-box ' + (r.cls || '') }, h('small', {}, r.n)))),
      h('div', { class: 'c13-facts' }, s.facts.map(f => chip(f, '')))
    ];
    const S = [
      { t: 'Crash. The durable log ends at LSN 8. Disk holds A 60 (pageLSN 7) and B 80 (pageLSN 3). The buffer pool is lost. The MasterRecord points to LSN 5.', recs: LOG, facts: ['A 60 · pageLSN 7', 'B 80 · pageLSN 3', 'MasterRecord: LSN 5'] },
      { t: 'Analysis starts at the checkpoint, LSN 5, and scans forward. BEGIN T2 puts T2 in the ATT as a loser. The updates to A and B add them to the DPT with their first LSNs.', recs: LOG, facts: ['ATT: T2 (undo)', 'DPT: A recLSN 7, B recLSN 8'] },
      { t: 'Redo starts at the smallest recLSN, LSN 7, and repeats history. LSN 7 on A is skipped, because the disk pageLSN is already 7.', recs: LOG, facts: ['LSN 7 on A: skipped, pageLSN 7', 'LSN 8 on B: pageLSN 3 is older, so redo applies it'] },
      { t: 'Redo is complete. The pages now match the moment of the crash: A 60 and B 90, with B at pageLSN 8.', recs: LOG, facts: ['A 60 · pageLSN 7', 'B 90 · pageLSN 8'] },
      { t: 'Undo reverses T2, the only loser, from its last record backward. LSN 8: B goes from 90 back to 80, and a CLR records it. LSN 7: A goes from 60 back to 70, another CLR.', recs: LOG.concat([{ n: 'CLR 9 · B 90→80', cls: 'on' }, { n: 'CLR 10 · A 60→70', cls: 'on' }]), facts: ['ATT: T2 undone', 'writes TXN-END for T2'] },
      { t: 'Result: A 70 and B 80. The total is 150, and the state holds exactly the committed work of T1.', recs: LOG.concat([{ n: 'CLR 9 · B 90→80', cls: 'on' }, { n: 'CLR 10 · A 60→70', cls: 'on' }, { n: 'TXN-END T2', cls: '' }]), facts: ['A 70 · B 80', 'total 150'] }
    ];
    return h('div', { class: 'c13-cs' },
      para('ARIES was developed at IBM Research in the early 1990s for DB2. The walkthrough below uses the same log as the playground, after 14 steps with the WAL rule. Values are illustrative.'),
      comp, def,
      stepper(S, view));
  }

  /* ---- COMMON PROBLEMS ---- */
  function ackDemo(mode) {
    const bad = mode === 'bad';
    const S = bad ? [
      { t: 'Start: T1 moves 30 from A to B. Balances are A 100 and B 50. Nothing is logged yet.', buf: 'empty', dur: 'none', client: 'waiting', bal: 'A 100 · B 50', verdict: '' },
      { t: 'T1 writes UPDATE and COMMIT to the log buffer. Nothing is on disk yet.', buf: 'UPDATE + COMMIT', dur: 'none', client: 'waiting', bal: 'A 100 · B 50', verdict: '' },
      { t: 'The server sends OK to the client before the flush, so the client shows success.', buf: 'UPDATE + COMMIT', dur: 'none', client: 'OK: transfer done', bal: 'A 100 · B 50', verdict: '' },
      { t: 'Power fails. The buffer is lost, and the log on disk has nothing about T1.', buf: 'lost', dur: 'none', client: 'OK: transfer done', bal: 'A 100 · B 50', verdict: '' },
      { t: 'Recovery: T1 is absent from the log, so it never happened. The client was told it succeeded, and the write is lost.', buf: 'lost', dur: 'none', client: 'OK: transfer done', bal: 'A 100 · B 50', verdict: 'acknowledged write lost' }
    ] : [
      { t: 'Start: the same transfer, and the same balances.', buf: 'empty', dur: 'none', client: 'waiting', bal: 'A 100 · B 50', verdict: '' },
      { t: 'T1 writes UPDATE and COMMIT to the log buffer.', buf: 'UPDATE + COMMIT', dur: 'none', client: 'waiting', bal: 'A 100 · B 50', verdict: '' },
      { t: 'The server flushes the log to disk. The COMMIT record is now durable.', buf: 'flushed', dur: 'UPDATE + COMMIT', client: 'waiting', bal: 'A 100 · B 50', verdict: '' },
      { t: 'Only now does the server send OK to the client.', buf: 'flushed', dur: 'UPDATE + COMMIT', client: 'OK: transfer done', bal: 'A 100 · B 50', verdict: '' },
      { t: 'Power fails. Recovery replays the durable COMMIT, so the balances come back as A 70 and B 80.', buf: 'lost', dur: 'UPDATE + COMMIT', client: 'OK: transfer done', bal: 'A 70 · B 80', verdict: 'acknowledged write survives' }
    ];
    const draw = s => [
      h('div', { class: 'c13-grid' }, [
        h('div', { class: 'c13-box' }, h('b', {}, 'log buffer (memory)'), h('small', {}, s.buf)),
        h('div', { class: 'c13-box ' + (s.dur !== 'none' ? 'on' : '') }, h('b', {}, 'log on disk'), h('small', {}, s.dur)),
        h('div', { class: 'c13-box' }, h('b', {}, 'client'), h('small', {}, s.client)),
        h('div', { class: 'c13-box' }, h('b', {}, 'balances'), h('small', {}, s.bal))
      ]),
      h('div', { class: 'c13-facts' }, s.verdict ? [chip(s.verdict, '')] : [chip('not yet decided', '')])
    ];
    return stepper(S, draw);
  }

  function tornDemo(mode) {
    const bad = mode === 'bad';
    const S = bad ? [
      { t: 'Start: page 7 on disk has pageLSN 7, with A 100 and B 50.', disk: 'pageLSN 7 · A 100 · B 50', copy: 'no copy', verdict: '' },
      { t: 'T1 writes the new page image: pageLSN 8, A 70 and B 80. Only the first 4 KB reach disk before power fails.', disk: 'pageLSN 8 · A 70 · B 50 (torn)', copy: 'no copy', verdict: '' },
      { t: 'Recovery reads pageLSN 8. The log record for B is LSN 8, so redo decides the page already has it and skips it.', disk: 'pageLSN 8 · A 70 · B 50 (torn)', copy: 'no copy', verdict: 'wrong: total 120' }
    ] : [
      { t: 'Start: the same page on disk, with pageLSN 7, A 100 and B 50.', disk: 'pageLSN 7 · A 100 · B 50', copy: 'empty', verdict: '' },
      { t: 'Doublewrite: the full new image, pageLSN 8, A 70 and B 80, is first written to a separate doublewrite area and synced.', disk: 'pageLSN 7 · A 100 · B 50', copy: 'pageLSN 8 · A 70 · B 80', verdict: '' },
      { t: 'The page is then written in place, and power fails after the first 4 KB. The page is torn.', disk: 'pageLSN 8 · A 70 · B 50 (torn)', copy: 'pageLSN 8 · A 70 · B 80', verdict: '' },
      { t: 'Recovery checks the checksum, finds it wrong, and restores the page from the doublewrite copy.', disk: 'pageLSN 8 · A 70 · B 80', copy: 'pageLSN 8 · A 70 · B 80', verdict: '' },
      { t: 'Redo then compares pageLSN with each record. Nothing is missing, so nothing is applied. The total is 150.', disk: 'pageLSN 8 · A 70 · B 80', copy: 'pageLSN 8 · A 70 · B 80', verdict: 'total 150' }
    ];
    const draw = s => [
      h('div', { class: 'c13-grid' }, [
        h('div', { class: 'c13-box ' + (s.disk.indexOf('torn') >= 0 ? 'bad' : (s.disk.indexOf('pageLSN 8') >= 0 ? 'on' : '')) }, h('b', {}, 'page 7 in place'), h('small', {}, s.disk)),
        h('div', { class: 'c13-box' }, h('b', {}, 'doublewrite area'), h('small', {}, s.copy))
      ]),
      h('div', { class: 'c13-facts' }, s.verdict ? [chip(s.verdict, '')] : [chip('not yet decided', '')])
    ];
    return stepper(S, draw);
  }

  function burstDemo(mode) {
    const bad = mode === 'bad';
    const DIRTY = 400;
    let done = 0;
    const S = [{ t: bad ? 'Start: 400 dirty pages are in the pool. A blocking checkpoint must write them all before new transactions can start.' : 'Start: 400 dirty pages are in the pool. A fuzzy checkpoint records the dirty page table, and the writer flushes pages in the background.', now: 0, done: 0, p99: 4 }];
    for (let t = 1; t <= 4; t++) {
      let now;
      if (bad) now = t === 1 ? DIRTY : 0;
      else now = t <= 4 ? DIRTY / 4 : 0;
      done += now;
      const p99 = bad ? (t === 1 ? 900 : 4) : 5;
      const t2 = bad
        ? (t === 1 ? 'Tick 1: all 400 pages are written in one burst, and new transactions wait. p99 latency jumps.' : 'Tick ' + t + ': nothing left to write. Latency is back to normal.')
        : (t === 4 ? 'Tick 4: the last 100 pages are written. The checkpoint is complete, and the redo start point is recorded.' : 'Tick ' + t + ': the writer flushes 100 pages in the background. New transactions keep running.');
      S.push({ t: t2, now, done, p99 });
    }
    const draw = s => [
      h('div', { class: 'c13-grid' }, [
        stat('written this tick', s.now), stat('written so far', s.done), stat('dirty left', DIRTY - s.done), stat('p99 latency (ms, illustrative)', s.p99)
      ])
    ];
    return stepper(S, draw);
  }

  function slotDemo(mode) {
    const bad = mode === 'bad';
    const S = [{ t: 'Start: the WAL keeps 4 segments (16 MB each is a PostgreSQL default, illustrative). A logical replication slot consumes the WAL, and its confirmed position is current.', kept: 4, slot: 'active' }];
    let kept = 4;
    for (let t = 1; t <= 6; t++) {
      if (bad) {
        kept += 2;
        S.push({ t: t === 1 ? 'Tick 1: the consumer stops. Its slot still needs the old WAL, so the server cannot recycle it. The primary writes 2 new segments.' : 'Tick ' + t + ': the consumer is still down. The slot holds every segment since its restart point, so the WAL grows by 2 more.', kept, slot: 'inactive, held' });
      } else {
        if (t === 1) { kept += 2; S.push({ t: 'Tick 1: the consumer stops. The slot holds the WAL, and 2 new segments are written.', kept, slot: 'inactive, held' }); }
        else if (t === 2) { kept += 2; S.push({ t: 'Tick 2: monitoring alerts on the inactive slot. The WAL is still growing, so the team is paging.', kept, slot: 'inactive, held' }); }
        else if (t === 3) { kept = 4; S.push({ t: 'Tick 3: the stale slot is dropped. Segments no longer needed are recycled, and the WAL is back to its normal size.', kept, slot: 'dropped' }); }
        else { kept = 4; S.push({ t: 'Tick ' + t + ': the primary writes 2 segments and recycles 2 at each checkpoint, so the WAL stays at 4.', kept, slot: 'dropped' }); }
      }
    }
    const draw = s => [
      h('div', { class: 'c13-grid' }, [
        stat('segments kept', s.kept), stat('WAL on disk (MB, illustrative)', s.kept * 16), stat('slot', s.slot)
      ])
    ];
    return stepper(S, draw);
  }

  const PROBLEMS = [
    { tab: 'Acknowledged before durable', sym: '<b>Client shows success</b>, but after a restart the transfer has disappeared.',
      why: 'The database must not tell the client that a transaction committed until its COMMIT record is on stable storage. If the server replies first, a crash can erase a commit the client was told about.',
      log: '-- representative application log\nINFO  transfer ok  txn=T1  account=1842 -> 2291  amount=30\n-- after a restart, the same transfer is missing from the log and the balances',
      demo: ackDemo,
      fix: ['Reply to the client only after the commit flush returns. The server must wait for the WAL sync before it sends OK.', 'If synchronous commit is turned off for speed, say so to the client: the reply then promises less.', 'Use group commit to share one flush among concurrent commits, so the wait stays short.', 'Verify: kill the server right after OK is sent in a test. The transfer must be present after restart, every time.'] },
    { tab: 'Partially written page', sym: '<b>Wrong balance after restart</b>, and the page fails verification when it is read.',
      why: 'The torn-write model and the doublewrite area are illustrative; the course text does not cover them. A page write is not atomic on disk: power can fail after the first sector. Recovery then sees a fresh header with stale contents. Redo skips the record because the page header says it is already applied.',
      log: '-- representative PostgreSQL log, wording varies by version\nWARNING:  page verification failed, calculated checksum 41237 but expected 9182\n-- representative application check\nSUM(balance) = 120, expected 150',
      demo: tornDemo,
      fix: ['Write a full copy of each page to a doublewrite area and sync it, before the page is written in place (illustrative; not in the course text).', 'Store a checksum in each page, and on recovery restore a page that fails it from the doublewrite copy.', 'Log a full page image the first time a page changes after a checkpoint, so redo can rebuild a torn page (illustrative; not in the course text).', 'Verify: simulate a torn write in a test. The restart must restore a page with the expected total.'] },
    { tab: 'Checkpoint I/O burst', sym: '<b>p99 latency spikes</b> every few minutes, exactly when the checkpoint runs.',
      why: 'A blocking checkpoint writes every dirty page at once, and transactions wait while it runs. The write burst fills the device queue, and everyone pays the latency.',
      log: '-- representative PostgreSQL server log, counts illustrative\nLOG:  checkpoint starting: time\nLOG:  checkpoint complete: wrote 412000 buffers (12.3%); write=268.4 s, sync=3.1 s',
      demo: burstDemo,
      fix: ['Use a fuzzy checkpoint: record the dirty page table and the active transactions, and let work continue during the flush.', 'Spread the writes: let the background writer flush a steady number of pages per tick, so no single tick takes the whole burst.', 'Set the checkpoint interval so that recovery time is acceptable, and no more often than the device can absorb.', 'Verify: the peak write count per second and the p99 latency should both fall, while the recovery time stays within target.'] },
    { tab: 'Stalled replication slot', sym: '<b>Disk fills</b> with WAL while the primary looks healthy and queries stay fast.',
      why: 'Representative of PostgreSQL slot behavior, not from the course text: a replication or change-data-capture slot keeps the WAL it has not consumed. A stopped consumer keeps its slot, so the server cannot recycle the WAL, and the directory grows until it is full.',
      log: '-- representative PostgreSQL 16 output\nslot_name   | active | restart_lsn | wal_status\norders_cdc  | f      | 3A/0F2C1000 | extended',
      demo: slotDemo,
      fix: ['Alert on inactive slots and on retained WAL bytes, not only on query latency.', 'Set a limit on retained WAL, so a stuck consumer loses its slot instead of filling the disk.', 'Make consumers resume from the slot position, and fix the consumer before the disk is at risk.', 'Verify: stop a test consumer. The alert fires, and the retained WAL stays within the limit.'] }
  ];

  PG.recovery = function (root, A) {
    root.append(
      sec('1 · The problem',
        para('A transfer debits one account, then credits another. Power fails after the debit reaches its data page, but before the credit does.'),
        para('Now the money has left one account and not arrived in the other. The database must restore a consistent state after restart, and it must keep every commit it acknowledged.'),
        h('p', { class: 'sx-q', html: 'After a crash halfway through a transfer, which writes must be durable first, and how does recovery rebuild the balances?' })),
      sec('2 · Core idea and mechanisms',
        para('<b>Core idea:</b> the log becomes durable before the data page, so recovery can redo committed work and undo incomplete work.'),
        h('ul', { class: 'sx-list', html: [
          '<b>Crash recovery.</b> Every recovery algorithm has two parts: actions during normal processing that make recovery possible, and actions after a failure that restore atomicity and durability. REDO reapplies committed effects; UNDO removes the effects of incomplete or aborted transactions.',
          '<b>Buffer pool policies.</b> STEAL lets an uncommitted change reach disk before commit; NO-STEAL does not. FORCE requires all of a transaction\'s changes on disk at commit; NO-FORCE does not. NO-STEAL + FORCE needs no undo or redo, but every change must fit in memory. Most systems use STEAL + NO-FORCE, which needs both, and so it runs faster.',
          '<b>Shadow paging.</b> Writes go to a copy of the page tree, and the root pointer switches atomically at commit. Recovery needs only undo, but commits flush many scattered pages and fragment the data.',
          '<b>Journal file.</b> Before a page changes, its original copy is written to a journal. After a crash the journal restores the originals. SQLite used this before 2010, and then moved to a write-ahead log.',
          '<b>Write-ahead logging (WAL).</b> Every change is logged before the page changes. A page may be written only after the log records for its changes are on disk, and a commit is final only when its COMMIT record is flushed. The log is written sequentially, which is why almost every system uses it.',
          '<b>WAL records and LSNs.</b> Each record gets a globally unique log sequence number (LSN), with its transaction id, object, before value (for undo) and after value (for redo). The pageLSN is the newest LSN that changed a page, and flushedLSN is the newest LSN on disk. Log records of one transaction are chained with prevLSN.',
          '<b>Logging schemes.</b> Physical logs record byte-level changes. Logical logs record the operations, which are smaller but harder to make idempotent. Physiological logs target one page and identify tuples by slot number. The notes call this the most common approach used in DBMSs.',
          '<b>Normal execution.</b> A commit writes a COMMIT record and flushes the log before the client is told. Group commit shares one flush among several commits. An abort undoes the updates in reverse, writes a compensation log record (CLR) for each, and ends with TXN-END.',
          '<b>Checkpoints.</b> Without them the log grows forever and recovery replays all of it. A blocking checkpoint stops new transactions, flushes everything, and writes a CHECKPOINT record. A fuzzy checkpoint lets work continue, and records the active transaction table (ATT) and dirty page table (DPT) as they were when it began. MasterRecord points to the last completed checkpoint.',
          '<b>Checkpoint I/O bursts.</b> A blocking checkpoint writes every dirty page at once, which queues the device and lifts latency for everyone. The fix is a fuzzy checkpoint with a paced background writer, covered in the problems below. This is the checkpoint promised in chapter 2.',
          '<b>ARIES.</b> Analysis rebuilds the ATT and DPT from the last checkpoint. Redo starts at the smallest recLSN and repeats history for winners and losers, skipping a record when the page already has it. Undo reverses the losers, writing CLRs, so a crash during recovery is safe.',
          '<b>Ownership.</b> This chapter covers one database on one node. Commits that span several nodes need a distributed protocol, which is chapter 14.'
        ].map(x => '<li>' + x + '</li>').join('') })),
      sec('3 · Playground: crash at any step, then replay recovery', playground(A)),
      sec('4 · Case study · ARIES recovery, step by step',
        para('The same log as the playground: a committed transfer and an uncommitted one, with a checkpoint in the middle.'),
        caseStudy()),
      sec('5 · Common problems · what breaks in production?', problems(PROBLEMS))
    );
  };
})();
