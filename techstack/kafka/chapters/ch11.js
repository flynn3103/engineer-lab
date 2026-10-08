/* Chapter 11 "KRaft Control Plane": scenes and Explain override (index 11, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Four scenes: a quorum that loses its majority, voter-count arithmetic, a 2 | 3 network split with epochs, and broker fencing.
   Epochs, counts and timings are illustrative. Defaults are for Kafka 3.9: broker.session.timeout.ms 9000, broker.heartbeat.interval.ms 2000. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Two of three voters are lost: a minority cannot elect or commit ---- */
  const VX = i => 28 + 200 * i;
  const major = {
    id: 'majority', label: 'Quorum majority lost', desc: 'With one of three voters alive there is no majority. No leader is elected and no metadata record commits (illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        '# controller voters 1, 2 and 3 are in one rack',
        '# a power event takes down voters 2 and 3',
        'kafka-metadata-quorum.sh --bootstrap-server b1:9092 describe --status',
        '# no active controller: ActiveControllerCount = 0 on every node',
        '# 1 of 3 is a minority: it cannot elect a leader and it cannot commit',
      ],
      fix: [
        '# bring one more voter back: 2 of 3 is a majority again',
        '# the majority elects a leader with a higher epoch',
        'kafka-metadata-quorum.sh --bootstrap-server b1:9092 describe --status',
        '# ActiveControllerCount = 1; metadata commits resume',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: 3 voters, 3 brokers. Epochs illustrative.', panels: [
      { id: 'vt', x: 16, y: 58, w: 614, h: 110, title: 'Controller quorum, 3 voters', tone: 'info' },
      { id: 'bk', x: 16, y: 180, w: 614, h: 168, title: 'Brokers and clients', tone: 'info' },
    ], tokens: {
      v1: { label: 'voter 1', sub: '', tone: 'info', w: 160, h: 54 }, v2: { label: 'voter 2', sub: '', tone: 'info', w: 160, h: 54 }, v3: { label: 'voter 3', sub: '', tone: 'info', w: 160, h: 54 },
      b1: { label: 'broker 1', sub: 'leads partitions', tone: 'ok', w: 160 }, b2: { label: 'broker 2', sub: 'leads partitions', tone: 'ok', w: 160 }, b3: { label: 'broker 3', sub: 'leads partitions', tone: 'ok', w: 160 },
      w1: { label: 'producers on healthy leaders', sub: 'still write', tone: 'ok', w: 270 },
      w2: { label: 'create topic, restart a broker', sub: 'stall: no active controller', tone: 'bad', w: 290 },
      w3: { label: 'metadata works again', sub: 'create, register, elect', tone: 'ok', w: 290 },
    } },
    bug: [
      { log: 'Three voters form the controller quorum. Voter 1 is the active controller in epoch 7. Brokers register with it and send heartbeats.', callout: 'Three voters, voter 1 leads in epoch 7', code: 0,
        at: { v1: { x: VX(0), y: 104, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: VX(1), y: 104, tone: 'ok', sub: 'follower' }, v3: { x: VX(2), y: 104, tone: 'ok', sub: 'follower' }, b1: { x: VX(0), y: 222 }, b2: { x: VX(1), y: 222 }, b3: { x: VX(2), y: 222 } }, stats: [{ l: 'voters alive', v: '3 of 3', cls: 'ok' }, { l: 'ActiveControllerCount', v: '1', cls: 'ok' }] },
      { log: 'A power event takes down voters 2 and 3, which are in the same rack. Voter 1 is alive, but it is alone.', callout: 'Voters 2 and 3 go down together', moment: true, code: 1,
        at: { v1: { x: VX(0), y: 104, tone: 'live', sub: 'alone' }, v2: { x: VX(1), y: 104, tone: 'bad', sub: 'down' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 222 }, b2: { x: VX(1), y: 222 }, b3: { x: VX(2), y: 222 } }, stats: [{ l: 'voters alive', v: '1 of 3', cls: 'bad' }] },
      { log: 'A majority of three voters is two. Voter 1 cannot reach it, so it cannot commit a metadata record, and it cannot win a new election after it steps down.', callout: '1 of 3 is a minority', code: 4,
        at: { v1: { x: VX(0), y: 104, tone: 'warn', sub: 'no majority' }, v2: { x: VX(1), y: 104, tone: 'bad', sub: 'down' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 222 }, b2: { x: VX(1), y: 222 }, b3: { x: VX(2), y: 222 } }, stats: [{ l: 'commit', v: 'impossible', cls: 'bad' }, { l: 'election', v: 'impossible', cls: 'bad' }] },
      { log: 'The brokers keep running, and producers that write to healthy leaders still succeed. But every operation that needs the controller stalls.', callout: 'The data plane runs, the control plane does not', moment: true, code: 3,
        at: { v1: { x: VX(0), y: 104, tone: 'warn', sub: 'no majority' }, v2: { x: VX(1), y: 104, tone: 'bad', sub: 'down' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 214 }, b2: { x: VX(1), y: 214 }, b3: { x: VX(2), y: 214 }, w1: { x: 28, y: 272 }, w2: { x: 322, y: 272 } }, stats: [{ l: 'ActiveControllerCount', v: '0', cls: 'bad' }, { l: 'topic creation', v: 'hangs', cls: 'bad' }],
        takeaway: 'Without a majority of voters the metadata log is frozen, but the partitions that already have leaders keep serving.' },
    ],
    fix: [
      { log: 'One more voter is brought back. Voter 2 starts, catches up with the metadata log of voter 1 and rejoins.', callout: 'Voter 2 comes back', code: 0,
        at: { v1: { x: VX(0), y: 104, tone: 'warn', sub: 'no majority yet' }, v2: { x: VX(1), y: 104, tone: 'warn', sub: 'catching up' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 222 }, b2: { x: VX(1), y: 222 }, b3: { x: VX(2), y: 222 } }, stats: [{ l: 'voters alive', v: '2 of 3', cls: 'warn' }] },
      { log: 'Two of three is a majority again. The voters hold an election, and the winner takes a higher epoch, here 8.', callout: 'A majority elects a leader in epoch 8', moment: true, code: 1,
        at: { v1: { x: VX(0), y: 104, tone: 'live', sub: 'leader, epoch 8' }, v2: { x: VX(1), y: 104, tone: 'ok', sub: 'follower' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 222 }, b2: { x: VX(1), y: 222 }, b3: { x: VX(2), y: 222 } }, stats: [{ l: 'epoch', v: '8', cls: 'ok' }, { l: 'ActiveControllerCount', v: '1', cls: 'ok' }] },
      { log: 'Metadata records commit again, because a majority holds each one. The brokers reach the active controller and the stalled operations go through.', callout: 'Metadata commits resume', code: 3,
        at: { v1: { x: VX(0), y: 104, tone: 'live', sub: 'leader, epoch 8' }, v2: { x: VX(1), y: 104, tone: 'ok', sub: 'follower' }, v3: { x: VX(2), y: 104, tone: 'bad', sub: 'down' }, b1: { x: VX(0), y: 214 }, b2: { x: VX(1), y: 214 }, b3: { x: VX(2), y: 214 }, w3: { x: 322, y: 272 } }, stats: [{ l: 'topic creation', v: 'works', cls: 'ok' }] },
      { log: 'The third voter is repaired and rejoins. The next time, the voters sit in different racks, so one power event cannot take two of them.', callout: 'Voters in separate failure domains', code: 3,
        at: { v1: { x: VX(0), y: 104, tone: 'live', sub: 'leader, epoch 8' }, v2: { x: VX(1), y: 104, tone: 'ok', sub: 'follower' }, v3: { x: VX(2), y: 104, tone: 'ok', sub: 'follower' }, b1: { x: VX(0), y: 214 }, b2: { x: VX(1), y: 214 }, b3: { x: VX(2), y: 214 }, w3: { x: 322, y: 272 } }, stats: [{ l: 'voters alive', v: '3 of 3', cls: 'ok' }],
        takeaway: 'Spread the voters over separate racks or zones, because the quorum fails when a majority fails together.' },
    ],
  };

  /* ---- 2. Quorum arithmetic: more voters do not always tolerate more failures ---- */
  const arith = {
    id: 'arithmetic', label: 'Voter count arithmetic', desc: 'A majority is half plus one, rounded down. Two voters tolerate no failure, four tolerate the same as three, and five tolerate two (exact arithmetic).',
    codeLabel: 'Rule',
    code: { bug: [
      'majority(n) = floor(n / 2) + 1',
      'failures tolerated(n) = n - majority(n)',
      '# n = 3: majority 2, tolerates 1      n = 4: majority 3, tolerates 1',
      '# n = 5: majority 3, tolerates 2      n = 2: majority 2, tolerates 0',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Exact arithmetic. Commit latency grows with the size of the majority.',
      header: s => ({ left: 'failures tolerated before metadata updates stop', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 150, rowH: 34, max: 3, unit: '', title: 'Failures a quorum tolerates', items: [
          { id: 'n2', label: '2 voters' }, { id: 'n3', label: '3 voters' }, { id: 'n4', label: '4 voters' }, { id: 'n5', label: '5 voters' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 250, w: 592, h: 44, label: '', sub: '', tone: 'info', show: false });
        return { bars, chip };
      },
      frame(s, kit, R) {
        const t = { n2: 0, n3: 1, n4: 1, n5: 2 }, show = s.show || [];
        ['n2', 'n3', 'n4', 'n5'].forEach(k => R.bars.set(k, show.includes(k) ? t[k] + 0.04 : 0, show.includes(k) ? (t[k] === 0 ? 'bad' : k === 'n4' ? 'warn' : 'ok') : 'ok', show.includes(k) ? t[k] + ' failure' + (t[k] === 1 ? '' : 's') : ''));
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
      },
    },
    bug: [
      { log: 'Three voters need a majority of two, so they tolerate one failure. This is the common minimum for a quorum that survives a node loss.', callout: 'Three voters tolerate one failure', code: 2,
        state: { show: ['n3'], say: 'majority of 3 = 2', sub: '3 - 2 = 1 failure tolerated', tone: 'ok', r: '3 voters' }, stats: [{ l: 'majority', v: '2 of 3', cls: 'ok' }] },
      { log: 'Two voters need both of them. Losing either one stops the quorum, so two voters tolerate no failure and are worse than one in terms of availability.', callout: 'Two voters tolerate no failure', code: 3,
        state: { show: ['n3', 'n2'], say: 'majority of 2 = 2', sub: '2 - 2 = 0 failures tolerated', tone: 'bad', r: '2 voters' }, stats: [{ l: 'majority', v: '2 of 2', cls: 'bad' }] },
      { log: 'Four voters need a majority of three, because two of four is only half. Losing two stops the quorum, so four tolerate one failure, exactly like three.', callout: 'Four voters tolerate one failure', moment: true, code: 2,
        state: { show: ['n3', 'n2', 'n4'], say: 'majority of 4 = 3', sub: '4 - 3 = 1: the extra voter adds cost, not tolerance', tone: 'warn', r: '4 voters' }, stats: [{ l: 'majority', v: '3 of 4', cls: 'warn' }] },
      { log: 'Five voters need three. They tolerate two failures. This is the next step that buys real fault tolerance, at the price of a larger majority for every commit.', callout: 'Five voters tolerate two failures', code: 3,
        state: { show: ['n3', 'n2', 'n4', 'n5'], say: 'majority of 5 = 3', sub: '5 - 3 = 2 failures tolerated', tone: 'ok', r: '5 voters' }, stats: [{ l: 'majority', v: '3 of 5', cls: 'ok' }],
        takeaway: 'Keep the voter count odd. An even count adds cost without more tolerance, so go from 3 to 5, not to 4.' },
    ],
  };

  /* ---- 3. A 2 | 3 network split: the majority side elects a higher epoch ---- */
  const split = {
    id: 'split', label: 'Split vote and old leader', desc: 'A network fault splits five voters 2 | 3. Only the three-voter side can commit, and the old leader’s entries stay uncommitted until the heal (epochs illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        '# five voters are split 2 | 3 by a network fault',
        '# the old active controller (voter 1, epoch 7) is on the 2-voter side',
        '# old side: its metadata writes never reach a majority and never commit',
        '# majority side: elects voter 3 with epoch 8; ActiveControllerCount = 1 there',
        '# brokers reject requests that carry the older epoch',
      ],
      fix: [
        'kafka-metadata-quorum.sh --bootstrap-server b3:9092 describe --status   # from each side',
        '# restore the network between the two sides',
        '# the old leader sees epoch 8, steps down and truncates its uncommitted entries',
        '# resend any change that did not commit',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: five voters, one network fault. Epochs illustrative.', panels: [
      { id: 'sa', x: 16, y: 58, w: 250, h: 290, title: 'Side A: 2 voters', tone: 'info' },
      { id: 'sb', x: 276, y: 58, w: 354, h: 290, title: 'Side B: 3 voters', tone: 'info' },
    ], tokens: {
      v1: { label: 'voter 1', sub: '', tone: 'info', w: 110, h: 48 }, v2: { label: 'voter 2', sub: '', tone: 'info', w: 110, h: 48 },
      v3: { label: 'voter 3', sub: '', tone: 'info', w: 100, h: 48 }, v4: { label: 'voter 4', sub: '', tone: 'info', w: 100, h: 48 }, v5: { label: 'voter 5', sub: '', tone: 'info', w: 100, h: 48 },
      ua: { label: 'change A', sub: 'epoch 7: uncommitted', tone: 'warn', w: 200 },
      cb: { label: 'change B', sub: 'epoch 8: committed', tone: 'ok', w: 320 },
      rj: { label: 'brokers reject epoch 7', sub: 'a higher epoch exists', tone: 'bad', w: 320 },
      tr: { label: 'change A truncated', sub: 'it never committed', tone: 'delete', w: 200 },
      rs: { label: 'change A sent again', sub: 'now committed in epoch 8', tone: 'ok', w: 320 },
    } },
    bug: [
      { log: 'Five voters, with voter 1 as the active controller in epoch 7. A network fault splits them: voters 1 and 2 on one side, voters 3, 4 and 5 on the other.', callout: 'A network fault splits the quorum 2 | 3', code: 0,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'ok', sub: 'follower' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' } }, stats: [{ l: 'voters', v: '2 | 3', cls: 'warn' }] },
      { log: 'Voter 1 still believes it is the leader. It appends a metadata change, but only voter 2 can see it. Two of five is not a majority, so the change never commits.', callout: 'The old side cannot commit', moment: true, code: 2,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'ok', sub: 'follower' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 } }, stats: [{ l: 'side A entries', v: 'uncommitted', cls: 'bad' }] },
      { log: 'Voters 3, 4 and 5 stop hearing from the leader. They hold an election, and voter 3 wins in a higher epoch, 8, with a majority of three.', callout: 'The 3-voter side elects epoch 8', code: 3,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'leader, epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 } }, stats: [{ l: 'active controllers', v: '1 on side B', cls: 'ok' }, { l: 'epoch', v: '8', cls: 'ok' }] },
      { log: 'Side B commits metadata changes, because three of five hold each one. Brokers that can reach side B follow epoch 8.', callout: 'Side B commits changes', code: 3,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'leader, epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 }, cb: { x: 290, y: 180 } }, stats: [{ l: 'side B history', v: 'committed', cls: 'ok' }] },
      { log: 'A request that still carries epoch 7 is rejected by the brokers, so the two sides never both accept writes. There is one committed history.', callout: 'The older epoch is rejected', moment: true, code: 4,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'leader, epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'leader, epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 }, cb: { x: 290, y: 180 }, rj: { x: 290, y: 240 } }, stats: [{ l: 'split brain', v: 'prevented', cls: 'ok' }],
        takeaway: 'A higher epoch wins, and only a majority can commit, so a stale leader cannot make changes that count.' },
    ],
    fix: [
      { log: 'Measure first: the quorum status from both sides shows which leader and epoch each side sees. Side B holds the higher epoch.', callout: 'Compare the epoch on both sides', code: 0,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 }, cb: { x: 290, y: 180 } }, stats: [{ l: 'higher epoch', v: 'side B (8)', cls: 'ok' }] },
      { log: 'The network between the two sides is restored. Voters 1 and 2 can talk to the others again.', callout: 'The network heals', moment: true, code: 1,
        at: { v1: { x: 30, y: 100, tone: 'live', sub: 'epoch 7' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, ua: { x: 30, y: 180 }, cb: { x: 290, y: 180 } }, stats: [{ l: 'voters', v: '5 reachable', cls: 'ok' }] },
      { log: 'Voter 1 sees epoch 8 and steps down. It truncates the entries that never committed, and fetches the committed log from the new leader.', callout: 'The old leader steps down and truncates', code: 2,
        at: { v1: { x: 30, y: 100, tone: 'ok', sub: 'follower, epoch 8' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'leader, epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, tr: { x: 30, y: 180 }, cb: { x: 290, y: 180 } }, stats: [{ l: 'uncommitted entries', v: 'truncated', cls: 'ok' }] },
      { log: 'The change that was lost in side A is sent again by whoever made it. This time it commits in epoch 8, so the log holds one committed history.', callout: 'Resend the change that never committed', code: 3,
        at: { v1: { x: 30, y: 100, tone: 'ok', sub: 'follower, epoch 8' }, v2: { x: 150, y: 100, tone: 'ok', sub: 'follower' }, v3: { x: 290, y: 100, tone: 'live', sub: 'leader, epoch 8' }, v4: { x: 396, y: 100, tone: 'ok', sub: 'follower' }, v5: { x: 502, y: 100, tone: 'ok', sub: 'follower' }, tr: { x: 30, y: 180 }, cb: { x: 290, y: 180 }, rs: { x: 290, y: 240 } }, stats: [{ l: 'committed history', v: 'one copy', cls: 'ok' }],
        takeaway: 'After a heal, the old leader loses only what never committed. Resend any change that an operator made on the old side.' },
    ],
  };

  /* ---- 4. Broker heartbeats: a silent broker is fenced and loses its leaderships ---- */
  const fence = {
    id: 'fencing', label: 'Broker heartbeat and fencing', desc: 'A broker that cannot reach the active controller for longer than broker.session.timeout.ms is fenced and its leaderships move (times illustrative).',
    codeLabel: 'Broker config',
    code: { bug: [
      'broker.heartbeat.interval.ms=2000    # default: heartbeat to the active controller',
      'broker.session.timeout.ms=9000       # default: the controller fences a silent broker',
      '# broker 2 stops for a long garbage collection pause or loses its network',
      '# no heartbeat for 9 s: the controller fences it',
      '# the partitions broker 2 led get new leaders from their in-sync replicas',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one broker, one partition leadership. Times illustrative.',
      header: s => ({ left: 'broker 2 · broker.session.timeout.ms = 9000', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 200, rowH: 30, max: 12, unit: '', title: 'Broker 2 against the active controller', items: [
          { id: 'hb', label: 'time since last heartbeat (s)' }, { id: 'led', label: 'partitions led (of 20)' }, { id: 'urp', label: 'under-replicated (of 20)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Active controller', cols: [{ label: 'event', w: 240 }, { label: 'effect', w: 352 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const hb = s.hb || 0, led = s.led == null ? 20 : s.led, urp = s.urp || 0;
        R.bars.set('hb', hb, hb >= 9 ? 'bad' : hb > 4 ? 'warn' : 'ok', hb + ' s');
        R.bars.set('led', (led / 20) * 12, led === 0 ? 'bad' : 'ok', led + '');
        R.bars.set('urp', (urp / 20) * 12, urp > 0 ? 'warn' : 'ok', urp + '');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'Broker 2 sends a heartbeat to the active controller every 2 seconds. It leads 20 partitions.', callout: 'Heartbeat every 2 s', code: 0,
        state: { hb: 1, led: 20, r: 'healthy' }, stats: [{ l: 'partitions led', v: '20', cls: 'ok' }] },
      { log: 'The broker stops responding, for example in a long garbage collection pause. Heartbeats stop, and the controller starts a clock.', callout: 'Heartbeats stop', code: 2,
        state: { hb: 6, led: 20, say: 'no heartbeat for 6 s', sub: 'the controller is still waiting', tone: 'warn', r: 'silent' }, stats: [{ l: 'silence', v: '6 s', cls: 'warn' }] },
      { log: 'After broker.session.timeout.ms, 9 seconds by default, the controller fences the broker. A fenced broker is no longer eligible to lead or to be in a new ISR.', callout: 'After 9 s the broker is fenced', moment: true, code: 3,
        state: { hb: 9, led: 20, rows: [['broker 2', 'fenced'], ['its leaderships', 'to be moved']], rt: 'bad', say: 'broker 2 fenced', sub: 'it loses all its leaderships', tone: 'bad', r: 'fenced' }, stats: [{ l: 'silence', v: '9 s', cls: 'bad' }] },
      { log: 'The controller moves the partitions that broker 2 led to other in-sync replicas. Producers and consumers refresh their metadata and find the new leaders.', callout: 'Leaders move to other replicas', code: 4,
        state: { hb: 9, led: 0, urp: 20, rows: [['partition leaders', 'moved to in-sync replicas'], ['broker 2 replicas', 'out of the ISR: under-replicated']], rt: 'warn', r: 'leaders moved' }, stats: [{ l: 'partitions led by broker 2', v: '0', cls: 'warn' }, { l: 'under-replicated', v: '20', cls: 'warn' }] },
      { log: 'When broker 2 comes back it registers again, catches up and rejoins the ISRs. The preferred-leader election can then give it its leaderships back.', callout: 'The broker returns and re-registers', moment: true, code: 4,
        state: { hb: 1, led: 20, urp: 0, say: 'registered, caught up, back in the ISRs', sub: 'leadership comes back through the preferred election', tone: 'ok', r: 'recovered' }, stats: [{ l: 'under-replicated', v: '0', cls: 'ok' }],
        takeaway: 'The controller fences a silent broker after broker.session.timeout.ms. Long pauses cost leaderships, not data.' },
    ],
  };

  window.CHAPTER_OVERRIDES[11] = { explain: `
<h3>1. Cluster metadata needs one authority</h3>
<p>Topics, partitions, leaders, configs and the list of brokers are the <b>metadata</b> of a cluster. Every broker needs the same view of it, and changes must be ordered. In KRaft mode Kafka stores this metadata as a log, the internal topic <code>__cluster_metadata</code>, and replicates it with a Raft-based protocol (KIP-500 and KIP-595). There is no ZooKeeper. A small set of nodes, the <b>controller voters</b>, holds the log. One of them is the <b>active controller</b>, and the others are followers.</p>

<h3>2. Roles and setup</h3>
<p><code>process.roles</code> chooses what a node does: <code>broker</code>, <code>controller</code>, or <code>broker,controller</code> for a combined node. Production clusters normally use dedicated controller nodes. The voters are found through <code>controller.quorum.bootstrap.servers</code> or the static <code>controller.quorum.voters</code>. Since Kafka 3.9 the voter set can also be changed on a running cluster (KIP-853), with <code>kafka-metadata-quorum.sh add-controller</code> and <code>remove-controller</code>. Each node needs a unique <code>node.id</code>, and the cluster has one cluster ID that you generate with <code>kafka-storage.sh random-uuid</code> and use to format every node.</p>

<h3>3. Elections, epochs and majorities</h3>
<p>The voters elect one leader. Each leadership has a number, the <b>epoch</b>, and a higher epoch always beats a lower one. The active controller appends a metadata record to its log, and the followers fetch it, like consumers do. A record is <b>committed</b> when a majority of the voters holds it. Only then do the brokers act on it. A stale leader that is cut off from the majority cannot commit anything, and the brokers reject requests that carry an older epoch, so two controllers can never both make changes that count.</p>

<h3>4. The quorum arithmetic</h3>
<p>A majority of n voters is <code>floor(n/2) + 1</code>. The cluster tolerates <code>n - majority</code> failures. Three voters tolerate one failure, five tolerate two. Two voters tolerate none, and four tolerate one, the same as three, so the fourth voter adds cost and commit latency without adding protection. Keep the number odd. Also place the voters in separate racks or zones, because a quorum fails whenever a majority fails together, whatever the count.</p>

<h3>5. Brokers and the controller</h3>
<p>Each broker registers with the active controller and sends a heartbeat every <code>broker.heartbeat.interval.ms</code> (default 2 s). If the controller hears nothing for <code>broker.session.timeout.ms</code> (default 9 s), it fences the broker. A fenced broker loses its leaderships, and the controller picks new leaders from the in-sync replicas. Brokers also keep a copy of the metadata log, so when the quorum has no majority, the brokers keep serving the leaders they already have. What stalls are the changes that need the controller: creating a topic, moving a leader, registering a restarted broker.</p>

<h3>6. Snapshots, and what to watch</h3>
<p>The metadata log would grow for ever, so the controllers take <b>snapshots</b> of the state and delete the log before them. A node that is far behind, or new, loads a snapshot and then fetches the rest. Watch <code>ActiveControllerCount</code> (it must be exactly 1 across the voters), the quorum lag of each voter, <code>LastAppliedRecordLagMs</code> on the brokers, and the leader election rate. An <code>ActiveControllerCount</code> of 0 means no majority or no leader, and 2 or more should never be seen for the same epoch.</p>

<h3>7. Syntax</h3>
<pre># controller node: server.properties
process.roles=controller
node.id=1
controller.quorum.bootstrap.servers=c1:9093,c2:9093,c3:9093
controller.listener.names=CONTROLLER

# format a node once, with the cluster id
kafka-storage.sh random-uuid
kafka-storage.sh format --cluster-id &lt;uuid&gt; --config server.properties

# the leader, the epoch, the voters and the lag of each
kafka-metadata-quorum.sh --bootstrap-server b1:9092 describe --status
kafka-metadata-quorum.sh --bootstrap-server b1:9092 describe --replication</pre>
<p>More: ${KL(KDOC + 'kraft', 'KRaft')}, ${KL(KIP + 'KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum', 'KIP-500: replace ZooKeeper')} and ${KL(KIP + 'KIP-853%3A+KRaft+Controller+Membership+Changes', 'KIP-853: controller membership changes')}.</p>`, scenarios: [major, arith, split, fence] };
})();
