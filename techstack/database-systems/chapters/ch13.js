/* Chapter 14 "Vectorized Execution and SIMD" (index 13, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-721 L06 Vectorized Query Execution (SIMD, vertical and horizontal vectorization, AVX-512 operations, selection scans, relaxed operator fusion, vector refill, hash tables); links to L04 batch execution.
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: SIMD lanes with a selection vector, branch prediction, refilling sparse lanes, and cost against vector size. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. SIMD lanes: eight values compared by one instruction, survivors listed in a selection vector ---- */
  const VALS = [120, 950, 310, 45, 700, 980, 1200, 260, 80, 500, 640, 990, 150, 330, 720, 410];
  const PASS = VALS.map(v => v > 900);
  const CWD = 36;
  const simd = {
    id: 'simd-lanes', label: 'SIMD lanes', desc: 'A batch of 16 values and the predicate amount > 900. One SIMD instruction compares 8 values at once, and a selection vector lists the rows that survive (values illustrative).',
    codeLabel: 'Loop',
    code: { bug: [
      'batch of amount values: 16 shown, about 1,000 in a real batch',
      'load 8 values into one SIMD register: one lane per row',
      'compare all 8 lanes with 900 in one instruction -> a bitmask',
      'second register, second instruction: 2 instructions instead of 16 compares',
      'compress the passing positions into a selection vector, then SUM over it',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 lanes per register, 16 values per batch. Illustrative.',
      header: s => ({ left: 'compare instructions ' + (s.ins || 0) + ' (scalar: 16)', right: s.right || 'one batch' }),
      draw(P, s) {
        P.text('h1', { x: 30, y: 84, t: 'amount (one batch)', cls: 'mut sm' });
        VALS.forEach((v, i) => P.box('v' + i, { x: 30 + i * (CWD + 2), y: 94, w: CWD, h: 34, tone: s.mask && s.mask > (i < 8 ? 0 : 1) ? (PASS[i] ? 'ok' : 'info') : 'info', label: String(v), cls: 'xs' }));
        if (s.reg >= 1) P.box('r1', { x: 27, y: 90, w: 8 * (CWD + 2) + 1, h: 42, tone: 'cursor', label: '', op: 0.25, stroke: 'cursor', sw: 2.6 });
        if (s.reg >= 2) P.box('r2', { x: 27 + 8 * (CWD + 2), y: 90, w: 8 * (CWD + 2) + 1, h: 42, tone: 'acc', label: '', op: 0.25, stroke: 'acc', sw: 2.6 });
        if (s.reg) P.text('rl', { x: 30, y: 152, t: s.reg >= 2 ? 'register 1 and register 2: 8 lanes each' : 'register 1: lanes 0 to 7', cls: 'xs' });
        if (s.mask) {
          P.text('h2', { x: 30, y: 180, t: 'mask: amount > 900', cls: 'mut sm' });
          for (let i = 0; i < (s.mask >= 2 ? 16 : 8); i++) P.box('m' + i, { x: 30 + i * (CWD + 2), y: 190, w: CWD, h: 28, tone: PASS[i] ? 'ok' : 'mut', label: PASS[i] ? '1' : '0', cls: 'sm' });
        }
        if (s.sel) {
          P.text('h3', { x: 30, y: 246, t: 'selection vector: positions that passed', cls: 'mut sm' });
          VALS.forEach((v, i) => { if (PASS[i]) P.chip('sv' + i, { x: 30 + [1, 5, 6, 11].indexOf(i) * 64, y: 256, w: 56, h: 34, label: String(i), sub: '', tone: 'ok' }); });
        }
        if (s.sum) P.chip('sum', { x: 300, y: 256, w: 310, h: 34, label: 'SUM over 4 positions: 4,120', tone: 'cursor', small: true });
      }
    }),
    bug: [
      { log: 'A batch of amounts has been handed to the filter. A scalar loop would compare these 16 values one at a time, with one instruction each.', callout: 'A batch: 16 values, one predicate', code: 0,
        state: {}, stats: [{ l: 'scalar compares', v: '16' }] },
      { log: 'The first 8 values are loaded into one SIMD register. Each value sits in its own lane, and an instruction acts on all lanes together.', callout: 'Load 8 values into one register', code: 1,
        state: { reg: 1 }, stats: [{ l: 'lanes', v: '8', cls: 'ok' }] },
      { log: 'One instruction compares all 8 lanes with 900. The result is a bitmask: 1 where the amount is above 900. 950, 980 and 1200 pass.', callout: 'One compare for 8 values', moment: true, code: 2,
        state: { reg: 1, mask: 1, ins: 1 }, stats: [{ l: 'instructions', v: '1', cls: 'ok' }, { l: 'passed', v: '3' }] },
      { log: 'The second register is compared the same way. Two instructions replaced 16 compares, and no branch was taken per row.', callout: '2 instructions instead of 16', code: 3,
        state: { reg: 2, mask: 2, ins: 2 }, stats: [{ l: 'instructions', v: '2', cls: 'ok' }, { l: 'branches per row', v: '0', cls: 'ok' }] },
      { log: 'The mask is turned into a selection vector, the list of positions that passed: 1, 5, 6 and 11. Surviving rows are not copied.', callout: 'A selection vector lists the survivors', code: 4,
        state: { reg: 2, mask: 2, ins: 2, sel: 1 }, stats: [{ l: 'survivors', v: '4' }] },
      { log: 'The next operator, SUM, reads only those four positions in a tight loop. No call per row and no row-at-a-time branching.', callout: 'The next operator reads only those positions', code: 4,
        state: { reg: 2, mask: 2, ins: 2, sel: 1, sum: 1 }, stats: [{ l: 'sum', v: '4,120', cls: 'ok' }, { l: 'calls per row', v: '0', cls: 'ok' }],
        takeaway: 'Vectorized execution shares each call over a batch, and SIMD shares each instruction over eight values.' },
    ],
  };

  /* ---- 2. Branch prediction: a stream of pass/fail outcomes, and how often the CPU guesses wrong ---- */
  const LOW = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0];
  const MID = [1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0];
  const miss = seq => seq.reduce((n, v, i) => n + (i > 0 && seq[i - 1] !== v ? 1 : 0), 0);
  const BW = 36;
  const branch = {
    id: 'branch-predict', label: 'Branch prediction', desc: 'A loop with if (amount > limit). The CPU guesses each outcome from the last one. A rare match is easy to guess, a 50% match is not (patterns illustrative).',
    codeLabel: 'Code',
    code: { bug: [
      'for each row: if (amount > limit) out[k++] = row;   -- a branch per row',
      'selectivity 1%: almost always "no", the predictor is right almost always',
      'selectivity 50%: the outcome looks random, the predictor is wrong half the time',
      'each wrong guess flushes the pipeline: about 15 wasted cycles (illustrative)',
      'branch-free: compute a mask for every row and compact, with no jump to guess',
    ] },
    stage: DB.stage({
      footer: 'Simplified: predictor repeats the previous outcome. Illustrative.',
      header: s => ({ left: 'wrong guesses ' + (s.wrong == null ? '-' : s.wrong) + ' of 15', right: s.right || '' }),
      draw(P, s) {
        const seq = s.seq;
        if (seq) {
          P.text('l1', { x: 30, y: 92, t: 'actual outcome', cls: 'mut sm' });
          P.text('l2', { x: 30, y: 164, t: 'predicted from the last row', cls: 'mut sm' });
          seq.forEach((v, i) => {
            P.box('a' + i, { x: 30 + i * (BW + 2), y: 100, w: BW, h: 30, tone: v ? 'ok' : 'mut', label: v ? 'pass' : 'fail', cls: 'xs' });
            if (s.guess && i > 0) {
              const bad = seq[i - 1] !== v;
              P.box('p' + i, { x: 30 + i * (BW + 2), y: 172, w: BW, h: 30, tone: bad ? 'bad' : 'info', label: seq[i - 1] ? 'pass' : 'fail', cls: 'xs' });
              P.text('x' + i, { x: 30 + i * (BW + 2) + BW / 2, y: 222, t: bad ? 'x' : 'ok', cls: 'sm b tone-' + (bad ? 'bad' : 'ok'), anchor: 'middle' });
            }
          });
        }
        if (s.flush) P.chip('fl', { x: 30, y: 246, w: 360, h: 40, label: s.flush, sub: '', tone: s.flushTone || 'bad' });
        if (s.free) {
          P.text('l3', { x: 30, y: 92, t: 'branch-free: every row computes a mask bit', cls: 'mut sm' });
          MID.forEach((v, i) => P.box('f' + i, { x: 30 + i * (BW + 2), y: 100, w: BW, h: 30, tone: v ? 'ok' : 'mut', label: v ? '1' : '0', cls: 'xs' }));
          P.chip('fr', { x: 30, y: 160, w: 560, h: 40, label: 'cmp, mask, compact: the same instructions for every row', tone: 'ok', small: true });
          P.chip('fr2', { x: 30, y: 212, w: 560, h: 40, label: 'no jump to guess, so no flush at any selectivity', tone: 'ok', small: true });
        }
      }
    }),
    bug: [
      { log: 'The row-at-a-time loop has a branch per row: if the amount passes, copy the row, otherwise skip it. At selectivity 1% almost every row fails.', callout: 'Selectivity 1%: almost every row fails', code: 1,
        state: { seq: LOW, right: 'selectivity 1%' }, stats: [{ l: 'selectivity', v: '1%' }] },
      { log: 'The CPU guesses each outcome from the one before. With a long run of fails the guess is almost always right: only the two passes upset it.', callout: 'The guess is right almost every time', code: 1,
        state: { seq: LOW, guess: 1, wrong: miss(LOW), right: 'selectivity 1%', flush: 'few flushes: loop stays fast', flushTone: 'ok' }, stats: [{ l: 'wrong guesses', v: String(miss(LOW)) + ' of 15', cls: 'ok' }] },
      { log: 'Now selectivity 50%. Which rows pass looks random, so the previous outcome says little about the next.', callout: 'Selectivity 50%: the pattern is random', code: 2,
        state: { seq: MID, right: 'selectivity 50%' }, stats: [{ l: 'selectivity', v: '50%', cls: 'warn' }] },
      { log: 'The guess is wrong whenever the outcome changes. Here that is most rows, and each wrong guess makes the CPU throw away work already started.', callout: 'The CPU guesses wrong again and again', moment: true, code: 2,
        state: { seq: MID, guess: 1, wrong: miss(MID), right: 'selectivity 50%' }, stats: [{ l: 'wrong guesses', v: String(miss(MID)) + ' of 15', cls: 'bad' }] },
      { log: 'Each wrong guess flushes the pipeline, about 15 cycles. Eleven flushes cost about 165 cycles on 16 rows, which is more than the comparisons themselves.', callout: '~15 cycles lost per wrong guess', code: 3,
        state: { seq: MID, guess: 1, wrong: miss(MID), right: 'selectivity 50%', flush: String(miss(MID)) + ' flushes x 15 = ' + miss(MID) * 15 + ' cycles lost', flushTone: 'bad' }, stats: [{ l: 'cycles lost', v: String(miss(MID) * 15), cls: 'bad' }] },
      { log: 'Vectorized code computes a mask for every row and compacts the survivors. There is no jump to guess, so the cost does not depend on selectivity.', callout: 'Branch-free: no guess, no flush', code: 4,
        state: { free: 1, right: 'vectorized, any selectivity' }, stats: [{ l: 'wrong guesses', v: '0', cls: 'ok' }, { l: 'cost vs selectivity', v: 'flat', cls: 'ok' }],
        takeaway: 'A branch per row is cheap only if it is predictable. Masks and selection vectors remove the guess, which is why vectorized code is steady at 50%.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "An analytics team keeps a large fact table fully in memory on a 16-core server, and a simple filter-and-sum dashboard query still runs at about 5 million rows per second (illustrative). Disk reads are zero. Adding cores barely helps, and a CPU profile shows most time in function calls, branch mispredictions and scheduler overhead rather than in the comparison itself.",
    "predict": {
      "q": "The engine passes one row per operator call. What change should it make first?",
      "opts": [
        "Buy faster disks",
        "Add more cores and more worker threads",
        "Pass batches of about 1,000 rows per call and process each batch in a tight loop",
        "Pass batches as large as possible, such as one million rows per call"
      ],
      "ans": 2,
      "why": "Each call has a fixed cost, and a batch spreads it over its rows. About 1,000 rows keeps the vectors in cache; much larger batches overflow it and the cost per row rises again."
    },
    "diagnose": [
      {
        "t": "Batches too small",
        "sym": "The overhead per row is about 600 cycles at batch size 1, far more than the work itself.",
        "ctx": "A vectorized engine is slower than expected, and the profile shows most time in operator calls.",
        "why": "Each operator call has a fixed cost: the call, the loop setup and the type checks. A batch spreads that cost over its rows. With one row per batch, the fixed cost is the whole cost.",
        "log": "representative, illustrative\n4,096 rows, batch size 1: 12,288 operator calls\noverhead: 600 cycles per row",
        "note": "Operator calls equal to rows times operators means the batch size is 1.",
        "fix": [
          "Measure: count operator calls and cycles per row in the engine profile.",
          "Use batches of about 1,000 rows, which keep the working vectors in L1 or L2 cache, and make the batch size a setting you test on your own hardware.",
          "Do not go to very large batches. When the vectors overflow the cache, the cost per row rises again.",
          "Verify: operator calls per row and cycles per row in the profile drop after the change."
        ]
      },
      {
        "t": "Divergent predicates",
        "sym": "Lanes that already failed a predicate still run the next one.",
        "ctx": "A query with several predicates, where the first removes most rows, gains little from SIMD.",
        "why": "A SIMD instruction runs on every lane, even when a lane holds a row that an earlier predicate removed. When most rows fail early, most lanes do wasted work.",
        "log": "representative, illustrative\npredicate 2 over 4 vectors: 32 lane operations, 8 useful\nlane utilization: 25 percent",
        "fix": [
          "Measure: lane utilization in the profile, useful lanes over lane operations.",
          "Keep a selection vector, and compress the survivors into full vectors before the next predicate.",
          "Refill partly empty vectors from the next batch (buffered or partial refill), and run the most selective predicate first, so that fewer lanes reach the others.",
          "Verify: lane utilization in the profile should rise toward 100 percent."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-721 L06 Vectorized Query Execution (notes in output/pdf/database-system)', href: '../../output/pdf/database-system/notes/06-vectorization.pdf' };

  /* ---- 3. Vector refill: after a filter most lanes are empty, so refill them before the next operator ---- */
  const LN = i => 40 + i * 72;
  const V1 = [1, 0, 0, 1, 0, 0, 1, 0], V2 = [0, 1, 0, 0, 0, 1, 0, 0], V3 = [1, 0, 1, 0, 1, 0, 0, 0];
  const lanes = (P, id, y, arr, tone, label) => { P.text('lb' + id, { x: 40, y: y - 8, t: label, cls: 'mut xs' }); arr.forEach((v, i) => P.chip(id + i, { x: LN(i), y, w: 62, h: 34, label: v == null ? '' : (v === 0 ? 'x' : String(v)), sub: '', tone: v == null ? 'mut' : v === 0 ? 'bad' : tone, small: true })); };
  const refill = {
    id: 'vector-refill', label: 'Lane refill', desc: 'A filter leaves only a few lanes of an 8-lane vector valid. Running the next operator on it wastes the rest. Buffering the survivors of several batches and refilling one vector keeps every lane busy (lane counts illustrative).',
    codeLabel: 'Idea',
    code: { bug: [
      'batch 1: filter keeps lanes 0, 3, 6 -> 3 of 8 lanes valid',
      'next operator on all 8 lanes: 5 lanes compute on dead data',
      'batch 2 keeps 2 lanes, batch 3 keeps 3 lanes',
      'refill: compress survivors into a buffer, fuse the batches',
      'buffer holds 8 valid values: the next operator runs at full utilization',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 lanes, three batches. Illustrative.',
      header: s => ({ left: s.hl || 'lane utilization', right: s.rt || '' }),
      draw(P, s) {
        lanes(P, 'a', 108, s.a || V1.map(() => null), 'ok', s.la || 'vector after the filter');
        if (s.buf) lanes(P, 'b', 196, s.buf, 'cursor', 'refill buffer (survivors packed left)');
        if (s.op) lanes(P, 'c', 284, s.op, 'ok', 'input of the next operator');
        if (s.util) P.chip('u', { x: 40, y: 332, w: 300, h: 30, label: s.util, sub: '', tone: s.utilTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'A filter ran on a vector of 8 values. Lanes marked with a value passed, x marks failed lanes: only 3 of 8 are still valid.', callout: '3 of 8 lanes survive the filter', code: 0, state: { a: [11, 0, 0, 24, 0, 0, 31, 0] }, stats: [{ l: 'valid lanes', v: '3 of 8', cls: 'warn' }] },
      { log: 'If the next operator takes this vector as it is, the SIMD instruction still runs on all 8 lanes. Five lanes do work that is thrown away.', callout: 'Dead lanes still cost the same', moment: true, code: 1, state: { a: [11, 0, 0, 24, 0, 0, 31, 0], op: [11, 0, 0, 24, 0, 0, 31, 0], util: 'utilization 3/8 = 37%', utilTone: 'bad' }, stats: [{ l: 'lane utilization', v: '37%', cls: 'bad' }] },
      { log: 'Two more batches arrive with 2 and 3 valid lanes. Without refill each runs at 25% and 37%.', callout: 'The next batches are just as sparse', code: 2, state: { a: [0, 42, 0, 0, 0, 57, 0, 0], la: 'batch 2', util: 'utilization 2/8 = 25%', utilTone: 'bad' }, stats: [{ l: 'lane utilization', v: '25%', cls: 'bad' }] },
      { log: 'Refill: the valid values of every batch are compressed into a buffer, packed to the left. After batch 1 the buffer holds 3 values, after batch 2 it holds 5.', callout: 'Pack survivors into a buffer', code: 3, state: { a: [0, 42, 0, 0, 0, 57, 0, 0], la: 'batch 2', buf: [11, 24, 31, 42, 57, null, null, null], util: 'buffer: 5 of 8 lanes full', utilTone: 'warn' }, stats: [{ l: 'buffered', v: '5' }] },
      { log: 'Batch 3 adds 3 more values, so the buffer is full. Only now does the next operator run, on a vector with every lane valid.', callout: 'Run the next operator on a full vector', moment: true, code: 4, state: { a: [63, 0, 71, 0, 88, 0, 0, 0], la: 'batch 3', buf: [11, 24, 31, 42, 57, 63, 71, 88], op: [11, 24, 31, 42, 57, 63, 71, 88], util: 'utilization 8/8 = 100%', utilTone: 'ok' }, stats: [{ l: 'lane utilization', v: '100%', cls: 'ok' }],
        takeaway: 'SIMD only pays on valid lanes. Buffer between operators, in cache, and run the next stage on full vectors.' },
    ],
  };

  /* ---- 4. Vector size: too small pays call overhead, too large spills the cache ---- */
  const VX0 = 80, VX1 = 590, VY0 = 288, VY1 = 108;
  const VP = [[1, 600], [4, 170], [16, 56], [64, 30], [256, 21], [1024, 19], [4096, 24], [16384, 38], [65536, 70], [1048576, 120]];
  const vxp = b => VX0 + Math.log2(b) / 20 * (VX1 - VX0);
  const vyp = c => VY0 - (Math.log10(c) - 1) / 2 * (VY0 - VY1);
  const vsize = {
    id: 'vector-size', label: 'Vector size', desc: 'Cost per row against rows per batch. A batch of one pays a function call per row. A very large batch no longer fits in the CPU cache, so every pass reads from memory. The best size sits between (cycles per row illustrative).',
    codeLabel: 'Reading',
    code: { bug: [
      'x: rows per batch (log scale), y: CPU cycles per row (log scale), illustrative',
      'batch 1: about 600 cycles per row, mostly call and bookkeeping overhead',
      'batch 64 to 4,096: the overhead is shared and the vector stays in L1 or L2 cache',
      'batch 1,000,000: each operator reads and writes memory instead of cache',
      'typical engines choose about 1,000 to 2,000 rows per vector',
    ] },
    stage: DB.stage({
      footer: 'Illustrative curve, not a benchmark. The sweet spot depends on cache size and row width.',
      header: s => ({ left: s.hl || 'cost per row against batch size', right: '' }),
      draw(P, s) {
        P.line('ax', VX0, VY0 + 4, VX1, VY0 + 4, { tone: 'mut' }); P.line('ay', VX0, VY0 + 4, VX0, VY1 - 10, { tone: 'mut' });
        [1, 16, 256, 4096, 65536, 1048576].forEach((b, i) => P.text('tx' + i, { x: vxp(b), y: VY0 + 22, t: b >= 1000 ? (b >= 1e6 ? '1M' : Math.round(b / 1024) + 'K') : String(b), cls: 'mut xs', anchor: 'middle' }));
        [10, 100, 600].forEach((c, i) => P.text('ty' + i, { x: VX0 - 8, y: vyp(c) + 4, t: String(c), cls: 'mut xs', anchor: 'end' }));
        P.text('xl', { x: VX1, y: VY0 + 40, t: 'rows per batch (log)', cls: 'mut xs', anchor: 'end' }); P.text('yl', { x: VX0 + 6, y: VY1 - 14, t: 'cycles per row (log)', cls: 'mut xs' });
        VP.forEach(([b, c], k) => { if (!k || k > (s.upto == null ? 9 : s.upto)) return; const [pb, pc] = VP[k - 1]; P.line('s' + k, vxp(pb), vyp(pc), vxp(b), vyp(c), { tone: k <= 5 ? 'cursor' : 'warn', sw: 2.8 }); });
        if (s.zoneL) P.chip('zl', { x: 90, y: 118, w: 190, h: 28, label: 'call overhead dominates', sub: '', tone: 'bad', small: true });
        if (s.zoneR) P.chip('zr', { x: 410, y: 118, w: 180, h: 28, label: 'cache spill dominates', sub: '', tone: 'bad', small: true });
        if (s.best) P.chip('bs', { x: vxp(1024) - 62, y: vyp(19) + 12, w: 124, h: 28, label: 'about 1,000 rows', sub: '', tone: 'ok', small: true, hl: true });
      }
    }),
    bug: [
      { log: 'One row per call: the cost per row is about 600 cycles. The comparison itself takes a few cycles. The rest is calling the operator and bookkeeping.', callout: 'Batch of 1: about 600 cycles per row', code: 1, state: { upto: 0, zoneL: 1 }, stats: [{ l: 'batch 1', v: '600 cycles/row', cls: 'bad' }] },
      { log: 'Bigger batches share the overhead. At 64 rows the cost is about 30 cycles per row, and a vector of 1,000 rows is down near 19.', callout: 'Share the call cost over a batch', code: 2, state: { upto: 5, zoneL: 1 }, stats: [{ l: 'batch 1,024', v: '19 cycles/row', cls: 'ok' }] },
      { log: 'Beyond a few thousand rows the vector no longer fits in the CPU cache. Each operator reads its input from memory and writes its output back, so the cost rises again.', callout: 'A huge batch spills the cache', moment: true, code: 3, state: { upto: 9, zoneL: 1, zoneR: 1 }, stats: [{ l: 'batch 1M', v: '120 cycles/row', cls: 'bad' }] },
      { log: 'The sweet spot is a batch that fits in L1 or L2 cache, a thousand rows or so. This is why engines ship a default vector size near 1,000 to 2,000.', callout: 'The sweet spot: about 1,000 rows', code: 4, state: { upto: 9, zoneL: 1, zoneR: 1, best: 1 }, stats: [{ l: 'best batch', v: '~1,000', cls: 'ok' }],
        takeaway: 'A batch amortizes call overhead until it outgrows the cache. Pick a vector that stays cache resident.' },
    ],
  };

  const EXPLAIN = `
<h3>1. What vectorization is</h3>
<p>Vectorization converts an algorithm that handles one pair of operands at a time into one that handles several pairs at once. The mechanism is <b>SIMD</b>: Single Instruction, Multiple Data. One CPU instruction operates on a wide register, say eight 32-bit values, so one comparison tests eight rows. With 32 cores and 4 lanes the theoretical speedup is 128 times. In a real query the gain is smaller, since only part of the query is vectorizable, but SIMD is still central to every analytical engine. The idea is to keep data in SIMD registers as long as possible and write it out only when needed.</p>
<figure class="mm" aria-label="Flowchart of a vectorized filter: load, compare, bitmask, compress valid lanes, next operator" style="--diagram-width:198px">
  <img src="diagrams/ch13-vector-ops.svg" alt="Flowchart: load 8 values into a SIMD register, compare them with a constant in one instruction for 8 lanes, get a bitmask with one bit per lane, decide which lanes are valid, pack the valid lanes together with a selection vector or compress, and run the next operator on full lanes only.">
  <figcaption>Flowchart: one vectorized filter step.</figcaption>
</figure>

<h3>2. Direction and how to get SIMD code</h3>
<p><b>Vertical</b> vectorization applies one operation across elements, lane by lane: a comparison of eight values with a constant. It is widely used. <b>Horizontal</b> vectorization operates on the elements of one vector, such as a sum across lanes, and is less common. There are three ways to produce SIMD code. <b>Automatic</b> vectorization lets the compiler do it, but the compiler is conservative and works only for simple loops, which is rare for database operators. <b>Compiler hints</b> such as <code>restrict</code>, which says two pointers do not overlap, let it vectorize more. <b>Explicit</b> vectorization uses CPU intrinsics and gives the best speed, but is tied to a CPU family, so a portability layer such as Google Highway is often used. A hybrid of hints plus hand-tuned hot spots is often the best balance of effort and speed.</p>
<figure class="mm" aria-label="Flowchart of three ways to produce SIMD code" style="--diagram-width:552px">
  <img src="diagrams/ch13-simd-approaches.svg" alt="Flowchart: to make a loop use SIMD, either rely on the compiler, which is safe only for simple loops, give the compiler hints such as restrict and no-dependency pragmas, or write explicit intrinsics, which are fastest but tied to the CPU, with a portable layer such as Highway to keep one source for many CPUs.">
  <figcaption>Flowchart: three routes to SIMD, from least to most effort.</figcaption>
</figure>

<h3>3. Fundamental operations</h3>
<p>Modern instruction sets such as AVX-512 offer the building blocks. <b>Masking</b> lets an instruction work only on lanes selected by a bitmask. <b>Permute</b> rearranges lanes within a register. <b>Selective load</b> and <b>selective store</b> move only the masked lanes to or from memory. <b>Compress</b> packs the selected lanes contiguously, and <b>expand</b> does the opposite. <b>Gather</b> and <b>scatter</b> load from or store to scattered memory addresses given by an index vector. AVX-512 is split into groups that a CPU may provide partly, so an engine must detect the exact support and pick an algorithm. Some CPUs lower their clock when running wide instructions, so some engines stay with AVX2.</p>

<h3>4. Vectorized algorithms</h3>
<p>The principles: favour vertical vectorization with different data per lane, and <b>keep lanes busy</b>, avoiding work on data known to be invalid. A <b>selection scan</b> loads values, compares in parallel, and uses the bitmask to store or compress the survivors. Measured gains over scalar code for single operators are 10% to 130%, and end to end only about 10% in the cited study, because only part of a query vectorizes and materialization costs remain. <b>Relaxed operator fusion</b> splits a pipeline into stages joined by cache-resident buffers: a stage runs until its buffer is full, so the next stage always sees full vectors, and prefetching hides cache misses. <b>Vector refill</b> keeps lanes full with extra registers, either buffered or partial, at the cost of complicated bookkeeping, so few systems do it. A <b>hash table</b> is hard to vectorize because of random access. The horizontal method stores several keys per slot and compares one probe key with all of them. The vertical method puts one probe key per lane and uses a gather, and generally wins, but both fall back to scalar speed when the table is larger than the cache. Partitioning for joins can build its histogram with SIMD as well.</p>

<h3>5. Branches and the CPU</h3>
<p>The other side of the problem is branches. A loop with <code>if (value &gt; limit)</code> makes the CPU guess the outcome to keep its pipeline full. A rare match is easy to guess, a 50% match is not, and each wrong guess costs about a dozen cycles. Branch-free code, which computes a mask or an index instead of branching, avoids the cost. This is one reason selection vectors beat per-row branching.</p>

<h3>6. The trade-off</h3>
<p>SIMD multiplies throughput on regular data and gains little on irregular access. Vector size trades call overhead for cache use. Explicit SIMD costs portability and engineering time. Refill and fusion keep lanes full at the price of buffers and complexity.</p>

<h3>7. Syntax</h3>
<pre>-- DuckDB: vector size is fixed at compile time (2048 rows by default)
SELECT sum(amount) FROM orders WHERE amount &gt; 900;

-- ClickHouse: block size for processing
SET max_block_size = 65505;

-- check what your CPU offers (Linux)
-- lscpu | grep -o 'avx[0-9a-z_]*' | sort -u

-- a profile that spends its time in one tight loop is a good sign
-- perf stat -e branch-misses,instructions ./query</pre>
<p>Read the profile before the code: if time goes to function calls and branch misses and not to the comparison, batching is the first fix.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: [
      OLD.diagnose[0],
      OLD.diagnose[1],
      {
        t: 'SIMD not used at all',
        sym: '<b>A tight filter loop</b> runs at scalar speed, and the profile shows no vector instructions.',
        ctx: 'The scan loop reads through pointers that might overlap, and the predicate has a branch with a function call inside. The compiler plays safe and emits scalar code.',
        why: 'Automatic vectorization is conservative. If two pointers could alias, or a loop has an early exit or a call it cannot see through, the compiler does not vectorize, because it could change the result.',
        log: `-- representative compiler report, illustrative
loop at filter.cc:84 not vectorized: possible aliasing between 'in' and 'out'
loop at filter.cc:84 not vectorized: call to non-inlined function`,
        note: 'The compiler report names the reason. It is usually an aliasing or a call, and both are fixable.',
        fix: [
          'Measure first: build with the compiler\'s vectorization report enabled and read why the hot loop was not vectorized.',
          'Add <code>restrict</code> to pointers that do not overlap, and move calls and branches out of the inner loop.',
          'Produce a mask or a selection vector instead of branching on each row.',
          'For the hottest operators, write explicit intrinsics or use a portability layer such as Highway.',
          'Verify: the report should say the loop is vectorized, and rows per second should rise.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[13] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [simd, branch, refill, vsize] };
})();
