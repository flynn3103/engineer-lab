/* Chapter 14: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. shuffle flows ---------- */
  const MXY = [{ y: 126 }, { y: 188 }, { y: 250 }], RXY = [{ y: 126 }, { y: 188 }, { y: 250 }];
  const MAPX = 20, MAPW = 120, REDX = 330, REDW = 130;
  const shuffle = {
    id: 'hotkey', label: 'One reducer, one hot key',
    desc: 'Most records share one key, so the shuffle sends them all to reducer 1. Salting the key spreads them over several reducers (illustrative counts).',
    codeLabel: 'Job',
    code: {
      bug: ['map: emit (US, 1) for each US page view', 'shuffle: all US pairs go to reducer 1', 'reducer 1: sums hours of US records', 'reducer 2: VN finishes in minutes, then idle', 'job waits for reducer 1 (skew)'],
      fix: ['map: emit (US#0..US#2, 1), salted key', 'combiner: sum repeated keys before the shuffle', 'shuffle: salted keys spread over reducers', 'round 2: sum the partial totals per country']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: line thickness is the number of records on that flow.',
      header: s => ({ left: s.salt ? 'keys salted: US#0, US#1, US#2' : 'key = country', right: '' }),
      setup(kit) {
        const R = { map: [], red: [], line: [], bar: [] };
        DK.cap(kit, MAPX, 96, 'map tasks', 'sm mut'); DK.cap(kit, REDX, 96, 'reduce tasks', 'sm mut'); DK.cap(kit, 490, 96, 'time to finish', 'sm mut');
        MXY.forEach((m, i) => R.map.push(DK.box(kit, { x: MAPX, y: m.y - 20, w: MAPW, h: 40, tone: 'acc', label: 'map ' + (i + 1), sub: '' })));
        RXY.forEach((r, i) => { R.red.push(DK.box(kit, { x: REDX, y: r.y - 20, w: REDW, h: 40, tone: 'ok', label: 'reducer ' + (i + 1), sub: '' })); R.bar.push(DK.bar(kit, { x: 484, y: r.y - 6, w: 110, h: 12 })); });
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R.line.push({ i, j, ln: DK.line(kit, { x1: MAPX + MAPW, y1: MXY[i].y, x2: REDX, y2: RXY[j].y, tone: 'acc2', w: 1, op: 0 }) });
        R.res = DK.box(kit, { x: 120, y: 292, w: 400, h: 36, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const flow = s.flow || [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        R.line.forEach(k => { const v = flow[k.i][k.j]; k.ln.set({ op: v ? 0.85 : 0, w: Math.max(1.2, v / 4), tone: s.hot === k.j && v >= 8 ? 'bad' : 'acc2' }); });
        const load = [0, 1, 2].map(j => flow.reduce((a, r) => a + r[j], 0));
        R.red.forEach((r, j) => r.set({ sub: load[j] ? load[j] + ' records' : '', tone: s.hot === j && load[j] > 40 ? 'bad' : 'ok' }));
        R.bar.forEach((b, j) => b.set({ f: load[j] / 80, tone: load[j] > 40 ? 'bad' : 'ok', label: s.time ? s.time[j] : '' }));
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Every map task reads page views and emits (country, 1). About 90% of the records have the key US; a few have VN or DE.', code: 0, callout: 'Map: emit (US, 1) per page view', state: { flow: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }, stats: [{ l: 'US share', v: '90%', cls: 'warn' }] },
      { log: 'The shuffle sends all pairs with the same key to the same reducer, so every US record goes to reducer 1. Reducers 2 and 3 get only a trickle.', code: 1, callout: 'All US records → reducer 1', state: { hot: 0, flow: [[24, 2, 1], [24, 1, 1], [24, 1, 2]] }, stats: [{ l: 'reducer 1', v: '72 records', cls: 'bad' }, { l: 'reducers 2, 3', v: '4 and 4', cls: 'ok' }] },
      { log: 'Reducers 2 and 3 finish in minutes and sit idle. Reducer 1 works for hours, and the job ends only when its slowest reducer ends.', code: 4, callout: 'The job waits for reducer 1', moment: true, state: { hot: 0, flow: [[24, 2, 1], [24, 1, 1], [24, 1, 2]], time: ['3 h', '5 min', '5 min'], res: 'job time = slowest reducer', resSub: '3 hours, with two reducers idle', resTone: 'bad' }, stats: [{ l: 'job time', v: '3 h', cls: 'bad' }],
        takeaway: 'Partitioning by key cannot split one key. A hot key makes one reducer the whole job.' }
    ],
    fix: [
      { log: 'The mappers salt the hot key. A US record is emitted as US#0, US#1 or US#2, so it is one of three different keys.', code: 0, callout: 'Salt: US → US#0 / US#1 / US#2', state: { salt: 1, flow: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }, stats: [{ l: 'US keys', v: '3', cls: 'ok' }] },
      { log: 'A combiner sums repeated keys inside each map task before the shuffle, so far fewer records cross the network. The three salted keys land on different reducers.', code: 2, callout: 'Salted keys spread over 3 reducers', state: { salt: 1, flow: [[8, 8, 8], [8, 8, 8], [8, 8, 8]] }, stats: [{ l: 'records per reducer', v: '24 each', cls: 'ok' }] },
      { log: 'A second round sums the three partial totals per country. All reducers finish at about the same time.', code: 3, callout: 'Round 2: sum the partial totals', state: { salt: 1, flow: [[8, 8, 8], [8, 8, 8], [8, 8, 8]], time: ['1 h', '1 h', '1 h'], res: 'job time: about 1 hour', resSub: 'work spread evenly, one tiny extra round', resTone: 'ok' }, stats: [{ l: 'job time', v: '1 h', cls: 'ok' }],
        takeaway: 'Salt the hot key so one key becomes several, then add the partial results.' }
    ]
  };

  /* ---------- 2. staging folders ---------- */
  const folders = {
    id: 'attempts', label: 'A failed attempt’s output',
    desc: 'A task writes straight into the shared report. Its first attempt fails halfway and the retry adds more records, so the total is wrong (illustrative counts).',
    codeLabel: 'Job',
    code: {
      bug: ['attempt 1: append output to the shared report', 'attempt 1: machine fails, half written', 'attempt 2: append full output to the same report', 'report: partial + full, totals wrong'],
      fix: ['attempt 1: write to a temporary location', 'attempt 1: machine fails, temp output ignored', 'attempt 2: complete temp output', 'rename temp to final output: one attempt only']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: a task should produce 100 records.',
      header: s => ({ left: s.tmp ? 'write to a temp folder, then rename' : 'write straight to the report', right: '' }),
      setup(kit) {
        const R = {};
        R.a1 = DK.box(kit, { x: 20, y: 116, w: 170, h: 70, tone: 'acc', label: 'attempt 1', sub: 'machine A' });
        R.a2 = DK.box(kit, { x: 20, y: 214, w: 170, h: 70, tone: 'warn', label: 'attempt 2', sub: 'machine B', op: 0.3 });
        R.t1 = DK.box(kit, { x: 250, y: 116, w: 160, h: 70, tone: 'soft', label: '_tmp/attempt_1', sub: '', op: 0 });
        R.t2 = DK.box(kit, { x: 250, y: 214, w: 160, h: 70, tone: 'soft', label: '_tmp/attempt_2', sub: '', op: 0 });
        R.rep = DK.box(kit, { x: 450, y: 150, w: 170, h: 90, tone: 'none', label: 'report/part-0', sub: 'empty' });
        R.w1 = DK.line(kit, { tone: 'acc', w: 3, op: 0 }); R.w2 = DK.line(kit, { tone: 'warn', w: 3, op: 0 });
        R.mv = DK.line(kit, { tone: 'ok', w: 3, op: 0, dash: '6 4' });
        R.x = DK.txt(kit, { x: 100, y: 206, t: '', cls: 'sm b', anchor: 'middle' });
        R.res = DK.box(kit, { x: 120, y: 296, w: 400, h: 40, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        R.a1.set({ tone: s.fail ? 'bad' : 'acc', sub: s.fail ? 'machine A failed' : 'machine A' }); R.a2.set({ op: s.a2 ? 1 : 0.3 });
        R.t1.set({ op: s.tmp ? 1 : 0, sub: s.t1 || '', tone: s.t1 ? (s.fail ? 'bad' : 'soft') : 'soft', dash: s.fail && s.tmp ? '4 3' : '' }); R.t2.set({ op: s.tmp && s.a2 ? 1 : 0, sub: s.t2 || '', tone: s.t2 === '100 records' ? 'ok' : 'soft' });
        R.rep.set({ sub: s.rep || 'empty', tone: s.reptone || 'none' });
        const t1 = s.tmp ? { x: 250, y: 150 } : { x: 450, y: 170 }, t2 = s.tmp ? { x: 250, y: 249 } : { x: 450, y: 215 };
        DK.seg(R.w1, { x: 190, y: 151 }, t1, s.w1 || 0, 'acc'); DK.seg(R.w2, { x: 190, y: 249 }, t2, s.w2 || 0, 'warn');
        DK.seg(R.mv, { x: 410, y: 249 }, { x: 450, y: 210 }, s.mv || 0, 'ok');
        R.x.set(s.fail ? '✕ fails at record 50' : '', { tone: 'bad' });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Attempt 1 appends its records directly to the shared report as it goes.', code: 0, callout: 'Attempt 1 appends to the report', state: { w1: 1, rep: '30 records', reptone: 'none' }, stats: [{ l: 'report', v: '30 records', cls: 'ok' }] },
      { log: 'Machine A fails after 50 of 100 records. The 50 are already in the report, and the report is now half of one task.', code: 1, callout: 'Attempt 1 fails with 50 in the report', moment: true, state: { w1: 1, fail: 1, rep: '50 records', reptone: 'warn' }, stats: [{ l: 'report', v: '50 records', cls: 'warn' }] },
      { log: 'The framework retries the task on machine B. Attempt 2 appends all 100 records to the same report.', code: 2, callout: 'Attempt 2 appends 100 more', state: { w1: 1, fail: 1, a2: 1, w2: 1, rep: '150 records', reptone: 'bad' }, stats: [{ l: 'report', v: '150 records', cls: 'bad' }] },
      { log: 'The report holds 150 records for a task that should give 100. Fifty are duplicated, so the totals are wrong and nothing flags it.', code: 3, callout: 'Totals are off by 50', state: { w1: 1, fail: 1, a2: 1, w2: 1, rep: '150 records', reptone: 'bad', res: 'duplicates in the report', resSub: 'partial output of a failed attempt was kept', resTone: 'bad' }, stats: [{ l: 'duplicate records', v: '50', cls: 'bad' }],
        takeaway: 'Output of a failed attempt must never reach the final result.' }
    ],
    fix: [
      { log: 'Each attempt writes to its own temporary folder, not to the report. Attempt 1 writes 30 records there.', code: 0, callout: 'Attempt 1 writes to its own temp folder', state: { tmp: 1, w1: 1, t1: '30 records' }, stats: [{ l: 'report', v: 'empty', cls: 'ok' }] },
      { log: 'Machine A fails at record 50. The temp output is simply ignored and never renamed, so the report is still empty.', code: 1, callout: 'Attempt 1 fails: temp output ignored', state: { tmp: 1, w1: 1, t1: '50 records', fail: 1 }, stats: [{ l: 'report', v: 'empty', cls: 'ok' }] },
      { log: 'The retry on machine B writes all 100 records to its own temp folder.', code: 2, callout: 'Attempt 2 completes 100 records', state: { tmp: 1, w1: 1, t1: '50 records', fail: 1, a2: 1, w2: 1, t2: '100 records' }, stats: [{ l: 'attempt 2', v: '100 records', cls: 'ok' }] },
      { log: 'The framework commits only the first attempt that finishes by renaming its folder into place. The rename is one atomic step, so the report holds exactly 100 records.', code: 3, callout: 'Rename: one attempt becomes the output', state: { tmp: 1, w1: 1, t1: '50 records', fail: 1, a2: 1, w2: 1, t2: '100 records', mv: 1, rep: '100 records', reptone: 'ok', res: 'exactly 100 records', resSub: 'the failed attempt left no trace', resTone: 'ok' }, stats: [{ l: 'report', v: '100 records', cls: 'ok' }],
        takeaway: 'Write to a temporary place, then commit with one atomic rename. A retry can never double the output.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[13] = { scenarios: [shuffle, folders] };
})();
