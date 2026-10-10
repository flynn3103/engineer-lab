/* Chapter 12: visuals selected for the new learning journey. */
(function () {
  const W = 640, H = 420;

  /* ---------- 1. tally meters ---------- */
  const SIDE = [{ x: 28 }, { x: 352 }];
  const tally = {
    id: 'evensplit', label: 'An even split stalls',
    desc: 'Four nodes split two and two, so neither side reaches the majority of three. Five nodes split 3 and 2 keep a leader (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['link fails: split 2 | 2', 'vote me leader: 2 of 4, no majority', 'write shard 7 -> B: refused, no leader', 'whole cluster down, 4 machines healthy'],
      fix: ['link fails: split 3 | 2 (five nodes)', 'three-node side: votes 3 of 5, keeps leader A1', 'write shard 7 -> B: committed by 3 nodes', 'two-node side: refuses writes']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative. A majority of 4 is 3, and a majority of 5 is 3.',
      header: s => ({ left: (s.N || 4) + ' nodes, split ' + (s.sizes || [2, 2]).join(' | '), right: 'majority = 3' }),
      setup(kit) {
        const R = { node: [[], []], slot: [[], []], thr: [], lab: [], res: [] };
        R.fence = DK.line(kit, { x1: 320, y1: 100, x2: 320, y2: 300, tone: 'bad', w: 3, dash: '8 6' });
        SIDE.forEach((sd, k) => {
          for (let i = 0; i < 3; i++) R.node[k].push(DK.box(kit, { x: sd.x + i * 100, y: 112, w: 88, h: 44, tone: 'soft', label: '', op: 0 }));
          for (let j = 0; j < 5; j++) R.slot[k].push(DK.box(kit, { x: sd.x + j * 54, y: 190, w: 46, h: 24, r: 6, tone: 'soft', op: 0 }));
          R.thr.push(DK.line(kit, { x1: sd.x + 2 * 54 + 50, y1: 182, x2: sd.x + 2 * 54 + 50, y2: 224, tone: 'ink', w: 2.6 }));
          R.lab.push(DK.txt(kit, { x: sd.x, y: 246, t: '', cls: 'sm b' }));
          R.res.push(DK.box(kit, { x: sd.x, y: 262, w: 270, h: 40, r: 8, tone: 'none', label: '', sub: '', op: 0 }));
        });
        DK.cap(kit, 28, 178, 'votes for the candidate', 'xs mut');
        return R;
      },
      frame(s, kit, R) {
        const sizes = s.sizes || [2, 2], N = s.N || 4, votes = s.votes || [0, 0], leaders = s.leader || [false, false];
        [0, 1].forEach(k => {
          R.node[k].forEach((b, i) => b.set({ op: i < sizes[k] ? 1 : 0, tone: leaders[k] && i === 0 ? 'ok' : 'none', label: (k ? 'B' : 'A') + (i + 1), sub: leaders[k] && i === 0 ? 'leader' : (votes[k] && i === 0 ? 'candidate' : ''), hl: leaders[k] && i === 0 }));
          R.slot[k].forEach((b, j) => b.set({ op: j < N ? 1 : 0, tone: j < votes[k] ? (votes[k] >= 3 ? 'ok' : 'warn') : 'soft', label: j < votes[k] ? 'yes' : '' }));
          R.lab[k].set(votes[k] ? votes[k] + ' of ' + N + (votes[k] >= 3 ? ': majority' : ': no majority') : '', { tone: votes[k] >= 3 ? 'ok' : 'bad' });
          const r = (s.out || [])[k];
          R.res[k].set({ op: r ? 1 : 0, label: r ? r[0] : '', sub: r ? r[1] : '', tone: r ? r[2] : 'none' });
        });
      }
    },
    bug: [
      { log: 'Four nodes split by a failed link: two on each side. Each side can reach only two nodes.', code: 0, callout: 'Split 2 | 2', state: { N: 4, sizes: [2, 2] }, stats: [{ l: 'nodes', v: '4', cls: 'ok' }, { l: 'majority', v: '3', cls: 'ok' }] },
      { log: 'Each side holds an election. A candidate gets two votes, its own and one more, which is 2 of 4. That is not a majority of 3.', code: 1, callout: '2 of 4 on both sides: no majority', state: { N: 4, sizes: [2, 2], votes: [2, 2] }, stats: [{ l: 'votes', v: '2 of 4', cls: 'bad' }] },
      { log: 'No leader means no committed writes. A write of shard 7 to server B is refused on both sides.', code: 2, callout: 'No leader: writes refused', moment: true, state: { N: 4, sizes: [2, 2], votes: [2, 2], out: [['write refused', 'no leader', 'bad'], ['write refused', 'no leader', 'bad']] }, stats: [{ l: 'leaders', v: '0', cls: 'bad' }],
        takeaway: 'Four machines tolerate one failure, not two, so the fourth node adds cost without adding tolerance.' }
    ],
    fix: [
      { log: 'Five nodes split into three on one side and two on the other.', code: 0, callout: 'Split 3 | 2', state: { N: 5, sizes: [3, 2] }, stats: [{ l: 'nodes', v: '5', cls: 'ok' }] },
      { log: 'The three-node side votes 3 of 5, a majority, and keeps leader A1. The two-node side can gather only 2 votes.', code: 1, callout: 'A side has 3 of 5: leader stays', state: { N: 5, sizes: [3, 2], votes: [3, 2], leader: [true, false] }, stats: [{ l: 'leaders', v: '1', cls: 'ok' }] },
      { log: 'Write shard 7 → B is committed by 3 nodes on the majority side. The two-node side refuses writes.', code: 2, callout: 'Committed by 3 of 5', state: { N: 5, sizes: [3, 2], votes: [3, 2], leader: [true, false], out: [['write committed', 'by 3 nodes', 'ok'], ['write refused', 'no majority', 'warn']] }, stats: [{ l: 'committed', v: '3 nodes', cls: 'ok' }],
        takeaway: 'In this two-way 3–2 split, only the three-node side has a majority. Other partitions can leave no majority.' }
    ]
  };

  /* ---------- 2. log matrix ---------- */
  const MX = i => 78 + i * 50, MY = r => 118 + r * 52;
  const TT = { 1: 'acc', 2: 'warn', 3: 'ok', 4: 'acc2', 5: 'bad' };
  const matrix = {
    id: 'stale', label: 'The old log is not enough',
    desc: 'Node S was offline and has an old log. Without the up-to-date rule X and Y vote for it, and the committed entries 6 and 7 are lost (illustrative terms).',
    codeLabel: 'Trace',
    code: {
      bug: ['S: vote for me, term 4 (no log check)', 'Y: votes for S too', 'S becomes leader with log 1..5', 'leader replicates: X drops entries 6 and 7'],
      fix: ['S: vote for me, term 4, last entry 5 at term 3', 'X: refused, my last entry is 7 at term 3', 'Y: refused, same reason', 'X: vote for me, term 5, last 7 at term 3 -> leader']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: a cell shows the term in which the entry was written.',
      header: s => ({ left: s.rule ? 'a vote requires an up-to-date log' : 'a vote needs no log check', right: s.term ? 'term ' + s.term : '' }),
      setup(kit) {
        const R = { cell: [[], [], []], lab: [], say: [] };
        ['node X', 'node Y', 'node S'].forEach((l, r) => R.lab.push(DK.box(kit, { x: 6, y: MY(r) - 2, w: 66, h: 34, r: 6, label: l, tone: 'none' })));
        for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) R.cell[r].push(DK.box(kit, { x: MX(i), y: MY(r), w: 44, h: 30, r: 5, label: '', tone: 'soft', op: 0.3, dash: '3 3' }));
        DK.cap(kit, MX(0), 108, 'entries 1 to 7, in log order', 'xs mut');
        R.commit = DK.line(kit, { x1: MX(6) + 48, y1: 104, x2: MX(6) + 48, y2: 268, tone: 'ok', w: 2.4, dash: '6 4' });
        DK.cap(kit, MX(6) + 52, 100, 'committed', 'xs b');
        R.vote = [0, 1].map(() => DK.dot(kit, { r: 7, tone: 'acc2', op: 0 }));
        for (let i = 0; i < 3; i++) R.say.push(DK.box(kit, { x: 430, y: 130 + i * 44, w: 196, h: 36, r: 8, tone: 'none', label: '', sub: '', op: 0 }));
        R.res = DK.box(kit, { x: 100, y: 290, w: 440, h: 44, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const rows = s.rows || [[1, 1, 2, 2, 3, 3, 3], [1, 1, 2, 2, 3, 3, 3], [1, 1, 2, 2, 3]];
        for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
          const v = rows[r][i], lost = (s.lost || {})[r] && (s.lost[r].includes(i));
          R.cell[r][i].set({ op: v ? (lost ? 0.45 : 1) : 0.3, label: v ? 'T' + v : '', tone: lost ? 'bad' : v ? TT[v] : 'soft', dash: v && !lost ? '' : '3 3' });
        }
        R.lab.forEach((l, r) => l.set({ tone: (s.leader === r) ? 'ok' : 'none', hl: s.leader === r }));
        const say = s.say || [];
        R.say.forEach((b, i) => { const t = say[i]; b.set({ op: t ? 1 : 0, label: t ? t[0] : '', sub: t ? t[1] : '', tone: t ? t[2] : 'none' }); });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'Entries 6 and 7 were committed on X and Y, a majority. Node S was offline and its log ends at entry 5.', code: 0, callout: 'S is behind: entries 6, 7 are committed without it', state: { term: 3 }, stats: [{ l: 'S log ends', v: 'entry 5', cls: 'warn' }] },
      { log: 'S asks for votes for term 4. In this broken version a node votes for anyone who asks first, without looking at the log. Y votes yes, which with S’s own vote is 2 of 3.', code: 1, callout: 'S: vote me, term 4. Y votes yes', state: { term: 4, say: [['S: vote for me, term 4', 'no log check', 'warn'], ['Y: yes', 'did not compare logs', 'bad']] }, stats: [{ l: 'votes for S', v: '2 of 3', cls: 'bad' }] },
      { log: 'S becomes leader with a log that stops at 5. It tells the followers to make their logs match its own.', code: 2, callout: 'S leads with the short log', state: { term: 4, leader: 2, say: [['S is leader', 'log 1..5', 'bad']] }, stats: [{ l: 'leader log', v: '1..5', cls: 'bad' }] },
      { log: 'X and Y drop entries 6 and 7 to match. Two committed entries, which clients were told were safe, are gone.', code: 3, callout: 'Committed entries 6 and 7 are lost', moment: true, state: { term: 4, leader: 2, lost: { 0: [5, 6], 1: [5, 6] }, res: 'entries 6 and 7 erased', resSub: 'they were committed', resTone: 'bad' }, stats: [{ l: 'committed entries lost', v: '2', cls: 'bad' }],
        takeaway: 'A leader must hold every committed entry. A vote that ignores the log cannot guarantee that.' }
    ],
    fix: [
      { log: 'The same state: S is offline during entries 6 and 7. This time the vote rule says a node refuses a candidate whose log is less up to date than its own.', code: 0, callout: 'Rule: refuse a candidate with an older log', state: { rule: 1, term: 3 }, stats: [{ l: 'S log ends', v: 'entry 5', cls: 'warn' }] },
      { log: 'S asks for votes for term 4 with its last entry, 5 at term 3. X holds entry 7 at term 3 and refuses. Y refuses for the same reason.', code: 1, callout: 'X and Y refuse S: their logs are newer', state: { rule: 1, term: 4, say: [['S: vote me, last 5 at T3', '', 'warn'], ['X: no', 'my last is 7 at T3', 'ok'], ['Y: no', 'my last is 7 at T3', 'ok']] }, stats: [{ l: 'votes for S', v: '1 of 3', cls: 'ok' }] },
      { log: 'X asks for term 5 with last entry 7 at term 3. Y votes yes, since X’s log is at least as new, and X becomes leader. Every committed entry is on its log.', code: 3, callout: 'X wins term 5 with log 1..7', state: { rule: 1, term: 5, leader: 0, say: [['X: vote me, term 5', 'last 7 at T3', 'acc'], ['Y: yes', 'X is as new as me', 'ok'], ['X is leader', 'holds 1..7', 'ok']] }, stats: [{ l: 'leader log', v: '1..7', cls: 'ok' }] },
      { log: 'X copies entries 6 and 7 to S, which catches up. Nothing committed was lost.', code: 3, callout: 'S catches up from X', state: { rule: 1, term: 5, leader: 0, rows: [[1, 1, 2, 2, 3, 3, 3], [1, 1, 2, 2, 3, 3, 3], [1, 1, 2, 2, 3, 3, 3]], res: 'all three logs equal', resSub: 'no committed entry lost', resTone: 'ok' }, stats: [{ l: 'committed entries lost', v: '0', cls: 'ok' }],
        takeaway: 'Only a candidate with an up-to-date log can win, so a new leader always has every committed entry.' }
    ]
  };

  /* ---------- 3. term bands ---------- */
  const BX = t => 112 + t * 50, BYO = 130, BYM = 210;
  const bands = {
    id: 'minority', label: 'Confirmed early, then undone',
    desc: 'The old leader sees only two of five nodes. It confirms a write with its own copy, then the majority overwrites it when the partition heals (illustrative).',
    codeLabel: 'Trace',
    code: {
      bug: ['partition: old leader sees 2 of 5 nodes', 'client: write shard 8 -> A to old leader', 'old leader: stores locally, replies OK', 'majority: new leader in term 3, shard 8 -> C', 'heal: term 3 seen, shard 8 -> A removed'],
      fix: ['partition: old leader sees 2 of 5 nodes', 'client: write shard 8 -> A', 'old leader: stored, not committed (2 of 5)', 'client: timeout, unknown, will retry', 'new leader: commits with 3 nodes']
    },
    stage: {
      w: W, h: H, footer: 'Illustrative: partition at time 4, heal at time 9. A band is a leader’s term.',
      header: s => ({ left: s.safe ? 'commit only with a majority' : 'confirm on the local copy', right: '' }),
      setup(kit) {
        const R = {};
        DK.box(kit, { x: 6, y: BYO - 18, w: 96, h: 36, r: 6, label: 'old leader', sub: '2 of 5 nodes', tone: 'warn' });
        DK.box(kit, { x: 6, y: BYM - 18, w: 96, h: 36, r: 6, label: 'majority', sub: '3 of 5 nodes', tone: 'ok' });
        [BYO, BYM].forEach(y => DK.rule(kit, BX(0), y, BX(10), y, { dash: '3 4' }));
        R.o2 = DK.line(kit, { x1: BX(0), y1: BYO, x2: BX(0), y2: BYO, tone: 'warn', w: 22 });
        R.o2T = DK.txt(kit, { x: BX(0) + 4, y: BYO - 18, t: 'term 2', cls: 'xs b', anchor: 'start' });
        R.m2 = DK.line(kit, { x1: BX(0), y1: BYM, x2: BX(0), y2: BYM, tone: 'warn', w: 22 });
        R.m3 = DK.line(kit, { x1: BX(5), y1: BYM, x2: BX(5), y2: BYM, tone: 'ok', w: 22, op: 0 });
        R.m3T = DK.txt(kit, { x: BX(5) + 4, y: BYM - 18, t: '', cls: 'xs b', anchor: 'start' });
        R.fp = DK.line(kit, { x1: BX(4), y1: 94, x2: BX(4), y2: 258, tone: 'bad', w: 2.4, dash: '6 4', op: 0 });
        R.fpT = DK.txt(kit, { x: BX(4), y: 88, t: '', cls: 'xs b', anchor: 'middle' });
        R.fh = DK.line(kit, { x1: BX(9), y1: 94, x2: BX(9), y2: 258, tone: 'ok', w: 2.4, dash: '6 4', op: 0 });
        R.fhT = DK.txt(kit, { x: BX(9), y: 88, t: '', cls: 'xs b', anchor: 'middle' });
        R.wa = DK.box(kit, { x: BX(6) - 46, y: BYO - 15, w: 92, h: 30, r: 6, label: 'shard 8 → A', tone: 'warn', op: 0 });
        R.ok = DK.txt(kit, { x: BX(6), y: BYO + 36, t: '', cls: 'sm b', anchor: 'middle' });
        R.wc = DK.box(kit, { x: BX(7) - 46, y: BYM - 15, w: 92, h: 30, r: 6, label: 'shard 8 → C', tone: 'ok', op: 0 });
        R.res = DK.box(kit, { x: 120, y: 290, w: 400, h: 44, tone: 'none', label: '', sub: '', op: 0 });
        return R;
      },
      frame(s, kit, R) {
        const t = s.t || 0, m = (a, b) => Math.max(a, Math.min(b, t));
        R.o2.set({ x2: BX(m(0, 10)) }); R.m2.set({ x2: BX(m(0, 5)) });
        R.m3.set({ x2: BX(m(5, 10)), op: t > 5 ? 1 : 0 }); R.m3T.set(t > 5 ? 'term 3' : '', { tone: 'ok' });
        R.fp.set({ op: t >= 4 ? 1 : 0 }); R.fpT.set(t >= 4 ? 'partition' : '', { tone: 'bad' });
        R.fh.set({ op: t >= 9 ? 1 : 0 }); R.fhT.set(t >= 9 ? 'heal' : '', { tone: 'ok' });
        const erased = !!s.erase;
        R.wa.set({ op: s.wa ? 1 : 0, tone: erased ? 'bad' : s.safe ? 'soft' : 'warn', dash: erased || s.safe ? '4 3' : '', label: erased ? 'removed' : 'shard 8 → A', sub: !erased && s.safe ? 'not committed' : '' });
        R.ok.set(s.okSent ? 'client told OK' : (s.timeout ? 'client: timeout' : ''), { tone: erased ? 'bad' : s.timeout ? 'warn' : 'ink' });
        R.wc.set({ op: s.wc ? 1 : 0 });
        R.res.set({ op: s.res ? 1 : 0, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'none' });
      }
    },
    bug: [
      { log: 'A partition leaves the old leader with 2 of 5 nodes. It does not know the others can still talk to each other.', code: 0, callout: 'Old leader sees 2 of 5', state: { t: 4 }, stats: [{ l: 'old leader sees', v: '2 of 5', cls: 'warn' }] },
      { log: 'A client writes shard 8 → A to the old leader. It stores the entry locally and replies OK without waiting for anyone.', code: 2, callout: 'Stored locally, replied OK', state: { t: 6, wa: 1, okSent: 1 }, stats: [{ l: 'client told', v: 'OK', cls: 'ok' }] },
      { log: 'The majority elects a new leader in term 3 and commits shard 8 → C. Two histories now exist.', code: 3, callout: 'Majority: term 3, shard 8 → C', state: { t: 7, wa: 1, okSent: 1, wc: 1 }, stats: [{ l: 'histories', v: '2', cls: 'warn' }] },
      { log: 'The partition heals. The old leader sees term 3 and steps down, and its entry is replaced with the majority’s. The client’s OK was a promise that is now broken.', code: 4, callout: 'Heal: shard 8 → A is removed', moment: true, state: { t: 9, wa: 1, okSent: 1, wc: 1, erase: 1, res: 'client told OK, entry erased', resSub: 'the OK was never backed by a majority', resTone: 'bad' }, stats: [{ l: 'confirmed writes lost', v: '1', cls: 'bad' }],
        takeaway: 'Confirming before a majority has the entry makes a promise that a higher term can break.' }
    ],
    fix: [
      { log: 'Same partition, 2 of 5 nodes on the old leader’s side.', code: 0, callout: 'Old leader sees 2 of 5', state: { safe: 1, t: 4 }, stats: [{ l: 'old leader sees', v: '2 of 5', cls: 'warn' }] },
      { log: 'A client writes shard 8 → A. The old leader stores it but cannot reach a majority, so it does not commit and does not reply OK.', code: 2, callout: 'Stored, not committed: 2 of 5', state: { safe: 1, t: 6, wa: 1 }, stats: [{ l: 'copies', v: '2 of 5', cls: 'warn' }] },
      { log: 'The client times out and does not know whether the write happened. A retry needs the same operation identity: lack of a success reply alone does not make replay safe.', code: 3, callout: 'No OK: the client retries', state: { safe: 1, t: 7, wa: 1, timeout: 1, wc: 1 }, stats: [{ l: 'client told', v: 'nothing', cls: 'ok' }] },
      { log: 'The new leader commits with 3 nodes in term 3. After the heal, the uncommitted entry on the old leader is removed, and no client was told it succeeded.', code: 4, callout: 'Heal: only committed entries survive', state: { safe: 1, t: 9, wa: 1, erase: 1, timeout: 1, wc: 1, res: 'no confirmed write was lost', resSub: 'the removed entry was never confirmed', resTone: 'ok' }, stats: [{ l: 'confirmed writes lost', v: '0', cls: 'ok' }],
        takeaway: 'Return committed success under the current-term rules. Uncommitted entries may be replaced; timeouts remain uncertain.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[11] = { scenarios: [tally, matrix, bands] };
})();
