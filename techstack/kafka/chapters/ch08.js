/* Chapter 8 "Consumer Groups and Rebalance": scenes and Explain override (index 8, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: a slow batch past max.poll.interval.ms, more members than partitions, and a rolling deploy with eager,
   cooperative and static membership. Times and counts are illustrative.
   Defaults are for Kafka 3.9: session.timeout.ms 45000, heartbeat.interval.ms 3000, max.poll.interval.ms 300000, max.poll.records 500. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. A slow batch: heartbeats are fine, but poll() is late, so the member is removed ---- */
  const pollScene = {
    id: 'poll-timeout', label: 'Slow batch past poll limit', desc: 'A batch that runs past max.poll.interval.ms removes the member. The group reassigns its partitions, and the same slow batch comes back (times illustrative).',
    codeLabel: 'Consumer log',
    code: {
      bug: [
        'max.poll.interval.ms=300000   # default: 5 minutes   max.poll.records=500',
        '# one poll() returns 500 records; each needs a slow partner call: the batch takes 6 min',
        '# no poll() within the interval, although heartbeats still arrive',
        'Member consumer-fulfilment-1 sending LeaveGroup ... consumer poll timeout has expired.',
        '# the member rejoins, gets the same partition, polls the same slow batch, and times out again',
      ],
      fix: [
        'max.poll.records=100   # illustrative: a smaller batch per poll',
        'partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor',
        '# a batch now takes about 20 s: poll() is called well inside the interval',
        '# rebalance-total stays flat; lag drains',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one member of six. Times illustrative.',
      header: s => ({ left: 'group fulfilment · max.poll.interval.ms = 300 s', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 200, rowH: 30, max: 360, unit: '', title: 'One member of the group', items: [
          { id: 'gap', label: 'time since last poll (s)' }, { id: 'hb', label: 'heartbeat age (s, of 45)' }, { id: 'stop', label: 'group stopped (s)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Coordinator and group', cols: [{ label: 'signal', w: 220 }, { label: 'value', w: 372 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const gap = s.gap || 0, hb = s.hb || 0, stop = s.stop || 0;
        R.bars.set('gap', gap, gap > 300 ? 'bad' : gap > 150 ? 'warn' : 'ok', gap + ' s');
        R.bars.set('hb', (hb / 45) * 360, 'ok', hb + ' s');
        R.bars.set('stop', (stop / 60) * 360, stop > 0 ? 'bad' : 'ok', stop + ' s');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The member calls poll() and gets 500 records. Each record needs a call to a slow partner API, so the batch will take minutes.', callout: 'poll() returns 500 records', code: 1,
        state: { gap: 0, hb: 2, say: '500 records, each with a slow API call', sub: 'max.poll.records = 500 (default)', tone: 'info', r: 'batch starts' }, stats: [{ l: 'batch', v: '500 records' }] },
      { log: 'The heartbeat thread keeps sending heartbeats to the coordinator. The member looks alive, and the session timeout is not close.', callout: 'Heartbeats keep arriving', code: 2,
        state: { gap: 150, hb: 2, rows: [['heartbeat', 'every 3 s, on a background thread'], ['session.timeout.ms', '45 s: not exceeded']], rt: 'ok', r: 'working' }, stats: [{ l: 'time since poll', v: '150 s', cls: 'warn' }, { l: 'heartbeat', v: 'alive', cls: 'ok' }] },
      { log: 'The batch is still running at 300 s. The group also requires poll() to be called within max.poll.interval.ms, and no poll() came.', callout: 'No poll() in 300 s', moment: true, code: 2,
        state: { gap: 320, hb: 2, say: 'max.poll.interval.ms exceeded', sub: 'heartbeats do not count for this clock', tone: 'bad', r: 'poll timeout' }, stats: [{ l: 'time since poll', v: '> 300 s', cls: 'bad' }] },
      { log: 'The consumer sends LeaveGroup. The coordinator starts a rebalance, and with the eager assignor every member stops reading while it runs.', callout: 'LeaveGroup, then a rebalance', code: 3,
        state: { gap: 320, hb: 2, stop: 30, rows: [['log', 'consumer poll timeout has expired'], ['coordinator', 'rebalance: generation +1']], rt: 'bad', r: 'rebalancing' }, stats: [{ l: 'group stopped', v: '~30 s', cls: 'bad' }] },
      { log: 'The member rejoins and receives its partition again, with the same unfinished records. It starts the same slow batch, and the cycle repeats.', callout: 'Same partition, same slow batch', moment: true, code: 4,
        state: { gap: 40, hb: 2, stop: 0, say: 'rejoined, polls the same records', sub: 'a rebalance every few minutes', tone: 'bad', rows: [['rebalance-total', 'grows every few minutes'], ['lag', 'climbs']], rt: 'bad', r: 'storm' }, stats: [{ l: 'rebalances', v: 'repeating', cls: 'bad' }, { l: 'lag', v: 'climbing', cls: 'bad' }],
        takeaway: 'Two clocks decide liveness. Heartbeats do not save a member whose poll() is too late.' },
    ],
    fix: [
      { log: 'Measure first: the time between poll() calls and the processing time of a batch. A batch takes 6 minutes, and the limit is 5.', callout: 'Measure: poll gap against the limit', code: 0,
        state: { gap: 320, hb: 2, rows: [['batch time', '6 min (500 records)'], ['max.poll.interval.ms', '5 min']], rt: 'bad', r: 'measure' }, stats: [{ l: 'batch', v: '6 min > 5 min', cls: 'bad' }] },
      { log: 'max.poll.records is lowered to 100 (illustrative), so a poll returns less work. The batch now takes about 20 s.', callout: 'Smaller polls: 100 records', moment: true, code: 0,
        state: { gap: 20, hb: 2, say: 'max.poll.records = 100', sub: 'a batch fits well inside the interval', tone: 'ok', r: 'smaller batch' }, stats: [{ l: 'batch', v: 'about 20 s', cls: 'ok' }] },
      { log: 'poll() is called every 20 seconds or so, far inside max.poll.interval.ms. The coordinator never sees a poll timeout.', callout: 'poll() runs every ~20 s', code: 2,
        state: { gap: 20, hb: 2, rows: [['poll gap', 'about 20 s'], ['rebalance-total', 'flat']], rt: 'ok', r: 'steady' }, stats: [{ l: 'poll gap', v: '~20 s', cls: 'ok' }] },
      { log: 'The group stays stable. With the cooperative assignor a rare membership change moves only the partitions that change owner. The lag drains.', callout: 'No rebalance, the lag drains', code: 3,
        state: { gap: 20, hb: 2, say: 'stable group', sub: 'CooperativeStickyAssignor limits the cost of a rare change', tone: 'ok', rows: [['rebalance-total', 'flat'], ['lag', 'drains']], rt: 'ok', r: 'stable' }, stats: [{ l: 'rebalances', v: '0 new', cls: 'ok' }, { l: 'lag', v: 'draining', cls: 'ok' }],
        takeaway: 'Size max.poll.records so a batch finishes well inside max.poll.interval.ms. Do not just raise the interval.' },
    ],
  };

  /* ---- 2. More members than partitions: the extra members have no work ---- */
  const PX = i => 32 + 74 * (i % 4);
  const PY = i => 98 + 48 * Math.floor(i / 4);
  const CXX = i => 342 + 140 * (i % 2);
  const CYY = i => 98 + 52 * Math.floor(i / 2);
  const TK = {};
  for (let i = 0; i < 12; i++) TK['p' + i] = { label: 'P' + i, sub: '', tone: 'info', w: 62, h: 36 };
  for (let i = 0; i < 6; i++) TK['c' + i] = { label: 'C' + (i + 1), sub: '', tone: 'info', w: 128, h: 40 };
  const idle = {
    id: 'idle', label: 'More members than partitions', desc: 'A six-member group on a four-partition topic leaves two members with no work, and lag keeps growing (counts illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        'kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group fulfilment',
        '# 4 partitions, P0 to P3: one owner each',
        '# 6 members: C5 and C6 have no assignment',
        '# lag still grows: 4 members do all the work',
      ],
      fix: [
        '# create a topic with more partitions and migrate to it, keeping the key-order rules in mind',
        '# 12 partitions: 6 members own 2 each',
        '# every member has work and the total lag falls',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: one topic, one group. Counts illustrative.', panels: [
      { id: 'pt', x: 16, y: 58, w: 310, h: 200, title: 'Partitions of the topic', tone: 'info' },
      { id: 'cm', x: 334, y: 58, w: 296, h: 200, title: 'Members of the group', tone: 'info' },
    ], tokens: TK },
    bug: [
      { log: 'The topic has four partitions, P0 to P3. The group fulfilment has six members, C1 to C6, but each partition is read by only one member.', callout: '4 partitions, 6 members', code: 0,
        at: { ...Object.fromEntries([0, 1, 2, 3].map(i => ['p' + i, { x: PX(i), y: PY(i) }])), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['c' + i, { x: CXX(i), y: CYY(i) }])) }, stats: [{ l: 'partitions', v: '4' }, { l: 'members', v: '6' }] },
      { log: 'The assignor gives one partition to each of C1 to C4. A partition can belong to only one member of a group at a time.', callout: 'One owner for each partition', code: 1,
        at: { ...Object.fromEntries([0, 1, 2, 3].map(i => ['p' + i, { x: PX(i), y: PY(i), tone: 'ok' }])), ...Object.fromEntries([0, 1, 2, 3].map(i => ['c' + i, { x: CXX(i), y: CYY(i), tone: 'ok', sub: 'owns P' + i }])), c4: { x: CXX(4), y: CYY(4) }, c5: { x: CXX(5), y: CYY(5) } }, arrows: [['p0', 'c0', ''], ['p3', 'c3', '']], stats: [{ l: 'busy members', v: '4 of 6', cls: 'warn' }] },
      { log: 'C5 and C6 get nothing. They poll an empty assignment, and they only wait as hot standbys in case another member leaves.', callout: 'C5 and C6 have no partition', moment: true, code: 2,
        at: { ...Object.fromEntries([0, 1, 2, 3].map(i => ['p' + i, { x: PX(i), y: PY(i), tone: 'ok' }])), ...Object.fromEntries([0, 1, 2, 3].map(i => ['c' + i, { x: CXX(i), y: CYY(i), tone: 'ok', sub: 'owns P' + i }])), c4: { x: CXX(4), y: CYY(4), tone: 'warn', sub: 'idle' }, c5: { x: CXX(5), y: CYY(5), tone: 'warn', sub: 'idle' } }, stats: [{ l: 'idle members', v: '2', cls: 'warn' }] },
      { log: 'Adding members did not add parallelism. The four busy members still do all the work, so the lag keeps growing.', callout: 'More members do not help', code: 3,
        at: { ...Object.fromEntries([0, 1, 2, 3].map(i => ['p' + i, { x: PX(i), y: PY(i), tone: 'warn' }])), ...Object.fromEntries([0, 1, 2, 3].map(i => ['c' + i, { x: CXX(i), y: CYY(i), tone: 'warn', sub: 'lag grows' }])), c4: { x: CXX(4), y: CYY(4), tone: 'warn', sub: 'idle' }, c5: { x: CXX(5), y: CYY(5), tone: 'warn', sub: 'idle' } }, stats: [{ l: 'busy members', v: '4 of 6', cls: 'warn' }, { l: 'lag', v: 'growing', cls: 'bad' }],
        takeaway: 'The partition count caps the parallelism of a group. Members beyond it only wait as standbys.' },
    ],
    fix: [
      { log: 'A new topic is created with 12 partitions, and the data is migrated to it with the key-order rules in mind: the key mapping changes with the count.', callout: 'Create a topic with 12 partitions', code: 0,
        at: { ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['p' + i, { x: PX(i), y: PY(i) }])), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['c' + i, { x: CXX(i), y: CYY(i) }])) }, stats: [{ l: 'partitions', v: '12', cls: 'ok' }] },
      { log: 'Twelve partitions are shared between six members. The assignor gives each member two partitions.', callout: 'Two partitions for each member', moment: true, code: 1,
        at: { ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['p' + i, { x: PX(i), y: PY(i), tone: 'ok' }])), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['c' + i, { x: CXX(i), y: CYY(i), tone: 'ok', sub: 'owns 2 partitions' }])) }, stats: [{ l: 'busy members', v: '6 of 6', cls: 'ok' }] },
      { log: 'Every member has work, and the total lag falls. The group can grow up to twelve members before more are idle.', callout: 'Every member has work', code: 2,
        at: { ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['p' + i, { x: PX(i), y: PY(i), tone: 'ok' }])), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['c' + i, { x: CXX(i), y: CYY(i), tone: 'ok', sub: 'lag falls' }])) }, stats: [{ l: 'lag', v: 'falling', cls: 'ok' }, { l: 'room to grow', v: 'up to 12 members', cls: 'ok' }],
        takeaway: 'Plan the partition count for the largest group you will need, because raising it later moves keys.' },
    ],
  };

  /* ---- 3. A rolling deploy: eager rebalances against cooperative and static membership ---- */
  const deploy = {
    id: 'deploy', label: 'Rolling deploy rebalances', desc: 'Restarting one of three pods during a deploy. Eager rebalances stop the whole group twice; cooperative plus static membership moves almost nothing (times illustrative).',
    codeLabel: 'Consumer config',
    code: {
      bug: [
        '# default for a group that still uses the eager RangeAssignor only',
        '# the stopping pod sends LeaveGroup: rebalance 1; every member revokes every partition',
        '# the new pod joins as a new member: rebalance 2; every member revokes again',
        '# each rebalance stops reading for about 30 s (illustrative)',
      ],
      fix: [
        'partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor',
        'group.instance.id=fulfilment-pod-2   # stable per pod (a StatefulSet name)',
        'session.timeout.ms=45000             # the restart must finish inside this',
        '# the pod restarts and reclaims its partitions: no rebalance for a pod that returns in time',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 3 pods, 6 partitions, one rolling restart. Times illustrative.',
      header: s => ({ left: 'group fulfilment · 3 pods · 6 partitions', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 200, rowH: 30, max: 6, unit: '', title: 'The group during the restart', items: [
          { id: 'own', label: 'partitions being read (of 6)' }, { id: 'reb', label: 'rebalances so far' }, { id: 'stop', label: 'reading stopped (s)' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'Coordinator', cols: [{ label: 'event', w: 250 }, { label: 'effect', w: 342 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const own = s.own == null ? 6 : s.own, reb = s.reb || 0, stop = s.stop || 0;
        R.bars.set('own', own, own === 6 ? 'ok' : own === 0 ? 'bad' : 'warn', own + '');
        R.bars.set('reb', reb, reb > 1 ? 'bad' : reb > 0 ? 'warn' : 'ok', reb + '');
        R.bars.set('stop', (stop / 60) * 6, stop > 0 ? 'bad' : 'ok', stop + ' s');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'Three pods read six partitions, two each. All partitions are being read. A deploy is about to replace pod 2.', callout: 'Three pods, six partitions', code: 0,
        state: { own: 6, reb: 0, stop: 0, r: 'before the deploy' }, stats: [{ l: 'partitions read', v: '6 of 6', cls: 'ok' }] },
      { log: 'Pod 2 stops. Without static membership it sends LeaveGroup, so the coordinator starts a rebalance for the whole group.', callout: 'Pod 2 leaves: rebalance 1', code: 1,
        state: { own: 6, reb: 1, say: 'LeaveGroup from pod 2', sub: 'membership changed', tone: 'warn', rows: [['LeaveGroup', 'generation + 1']], rt: 'warn', r: 'rebalance 1' }, stats: [{ l: 'rebalances', v: '1', cls: 'warn' }] },
      { log: 'With an eager assignor every member first revokes all of its partitions, then rejoins and gets a new assignment. Nothing is read meanwhile.', callout: 'Eager: every partition is revoked', moment: true, code: 1,
        state: { own: 0, reb: 1, stop: 30, say: 'stop the world: all partitions revoked', sub: 'no reading anywhere in the group', tone: 'bad', rows: [['revoke', 'all 6 partitions'], ['reading', 'stopped']], rt: 'bad', r: 'revoked' }, stats: [{ l: 'partitions read', v: '0 of 6', cls: 'bad' }, { l: 'stopped', v: '~30 s', cls: 'bad' }] },
      { log: 'The new pod 2 starts and joins as a new member, because it has no stable identity. That is a second membership change.', callout: 'The new pod joins: rebalance 2', code: 2,
        state: { own: 4, reb: 2, stop: 30, say: 'a new member joins', sub: 'the eager round repeats', tone: 'warn', rows: [['JoinGroup', 'generation + 1']], rt: 'warn', r: 'rebalance 2' }, stats: [{ l: 'rebalances', v: '2', cls: 'bad' }] },
      { log: 'Every member revokes everything again. The group has stopped twice for one pod, and a deploy of three pods would stop it six times.', callout: 'Stopped again, twice per pod', moment: true, code: 3,
        state: { own: 0, reb: 2, stop: 60, say: 'second stop-the-world', sub: 'about 60 s without reading for one pod', tone: 'bad', rows: [['revoke', 'all 6 partitions, again'], ['lag', 'builds up during each stop']], rt: 'bad', r: 'stopped twice' }, stats: [{ l: 'stopped in total', v: '~60 s', cls: 'bad' }, { l: 'for 3 pods', v: '6 stops', cls: 'bad' }],
        takeaway: 'Without static membership, a restart is two rebalances, and an eager rebalance stops every partition of every member.' },
    ],
    fix: [
      { log: 'The group uses CooperativeStickyAssignor (KIP-429) and each pod has a stable group.instance.id (KIP-345), for example its StatefulSet name.', callout: 'Cooperative assignor, static members', code: 0,
        state: { own: 6, reb: 0, say: 'group.instance.id = fulfilment-pod-2', sub: 'the pod keeps its identity across restarts', tone: 'ok', r: 'configured' }, stats: [{ l: 'partitions read', v: '6 of 6', cls: 'ok' }] },
      { log: 'Pod 2 stops. A static member does not send LeaveGroup, so the coordinator does not rebalance. It waits for session.timeout.ms.', callout: 'A static member leaves quietly', code: 1,
        state: { own: 4, reb: 0, rows: [['pod 2 stopped', 'no LeaveGroup, no rebalance'], ['its 2 partitions', 'wait for the pod to return']], rt: 'ok', r: 'restart' }, stats: [{ l: 'partitions read', v: '4 of 6', cls: 'warn' }, { l: 'rebalances', v: '0', cls: 'ok' }] },
      { log: 'The new pod starts with the same group.instance.id, within session.timeout.ms. The coordinator hands it the partitions it had before.', callout: 'The pod returns and reclaims its partitions', moment: true, code: 3,
        state: { own: 6, reb: 0, say: 'same instance id, same partitions', sub: 'only the two partitions of the pod paused', tone: 'ok', rows: [['pod 2 rejoined', 'same group.instance.id'], ['assignment', 'unchanged']], rt: 'ok', r: 'reclaimed' }, stats: [{ l: 'partitions read', v: '6 of 6', cls: 'ok' }, { l: 'rebalances', v: '0', cls: 'ok' }] },
      { log: 'The other two pods never stopped reading. Only the partitions of the restarting pod paused, for as long as its restart took.', callout: 'Other pods never stopped', code: 3,
        state: { own: 6, reb: 0, rows: [['pods 1 and 3', 'read without a break'], ['total pause', 'one pod restart, not a group stop']], rt: 'ok', r: 'smooth deploy' }, stats: [{ l: 'group stops', v: '0', cls: 'ok' }],
        takeaway: 'Use static membership with restarts shorter than session.timeout.ms, and the cooperative assignor for the rest.' },
    ],
  };

  window.CHAPTER_OVERRIDES[8] = { explain: `
<h3>1. One owner for each partition</h3>
<p>Inside a consumer group, each partition is read by exactly one member at a time. That is how Kafka lets a group share the work and still keep the order inside each partition. Any change in who is in the group, or in what the group reads, forces a new assignment. That change is a <b>rebalance</b>. The goal of the protocol is to keep each reassignment small and rare.</p>

<h3>2. The group coordinator and the generation</h3>
<p>For each group, one broker is the <b>group coordinator</b>. It keeps the list of members and the commits. When a member joins or leaves, the coordinator asks all members to send a <code>JoinGroup</code>. One member, the group leader, computes the assignment with the configured assignor. The members then call <code>SyncGroup</code> to receive their partitions. The <b>generation</b> number goes up on every membership change, and a member with an old generation cannot commit.</p>

<h3>3. Two clocks decide that a member is alive</h3>
<p>A background thread sends <b>heartbeats</b> every <code>heartbeat.interval.ms</code> (default 3 s). If the coordinator hears nothing within <code>session.timeout.ms</code> (default 45 s), the member is dead. A second clock is on your code: <code>poll()</code> must be called again within <code>max.poll.interval.ms</code> (default 5 minutes). If the processing of one batch takes longer, the member leaves the group even though its heartbeats are fine, because a consumer that does not poll cannot make progress. <code>max.poll.records</code> (default 500) bounds how much work one poll returns.</p>

<h3>4. Eager and cooperative rebalancing</h3>
<p>With an <b>eager</b> assignor (<code>RangeAssignor</code>, <code>RoundRobinAssignor</code>, <code>StickyAssignor</code>), every member gives up all of its partitions at the start of every rebalance. Nobody reads until the new assignment arrives. That is the stop-the-world pause. The <b>cooperative</b> protocol (KIP-429, <code>CooperativeStickyAssignor</code>) is incremental. Members keep the partitions that do not move, and only the partitions that change owner are revoked and reassigned, in two rounds. To move a running group from eager to cooperative you need two rolling restarts: first add the cooperative assignor to the list next to the old one, then remove the old one.</p>

<h3>5. Static membership</h3>
<p>Normally a stopping member sends <code>LeaveGroup</code> and the new pod joins as a new member, so a restart is two rebalances. With <code>group.instance.id</code> (KIP-345) the member keeps its identity. A restart that finishes within <code>session.timeout.ms</code> causes no rebalance at all, and the member gets its old partitions back. The price is that if a static member is really gone, its partitions stay unread until the session times out.</p>

<h3>6. The parallelism limit and what to measure</h3>
<p>A group can use at most as many members as the topic has partitions. Extra members sit idle as standbys. Watch the consumer metric <code>rebalance-total</code> and <code>rebalance-latency-avg</code>, the time between polls (<code>poll-idle-ratio-avg</code>, <code>time-between-poll-avg</code>) and the lag per partition. A <code>rebalance-total</code> that keeps growing without any deploy points at poll timeouts or flapping members. A newer protocol, KIP-848, moves the assignment work to the broker, and it is production-ready in Kafka 4.0.</p>

<h3>7. Syntax</h3>
<pre># consumer.properties
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
group.instance.id=fulfilment-pod-2
session.timeout.ms=45000
heartbeat.interval.ms=3000
max.poll.interval.ms=300000
max.poll.records=100

# who owns what, and the state of the group
kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group fulfilment --members --verbose
kafka-consumer-groups.sh --bootstrap-server b1:9092 --describe --group fulfilment --state</pre>
<p>More: ${KL(KDOC + 'consumerconfigs_max.poll.interval.ms', 'max.poll.interval.ms')}, ${KL(KIP + 'KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol', 'KIP-429: incremental rebalance')} and ${KL(KIP + 'KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances', 'KIP-345: static membership')}.</p>`, scenarios: [pollScene, idle, deploy] };
})();
