/* Chapter 6 "Partition Reassignment and Placement": scenes and Explain override (index 6, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Four scenes: a move without and with a throttle, add-catch-up-remove for one partition, leader skew after restarts, and rack placement.
   Rates, sizes and counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. Throttle: the copy competes with clients for the same network ---- */
  const throttle = {
    id: 'throttle', label: 'Unthrottled vs throttled', desc: 'The same 3 TB move with and without --throttle. The throttle leaves bandwidth for producers while the copy runs (rates illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        'kafka-reassign-partitions.sh --reassignment-json-file plan.json --execute',
        '# no --throttle: the copy takes all the bandwidth it can get',
        '# 3 TB is copied to brokers 4-6 at full speed',
        '# produce p99 goes from 8 ms to 900 ms (illustrative)',
      ],
      fix: [
        'kafka-reassign-partitions.sh ... --execute --throttle 50000000   # bytes/s',
        '# the copy is capped; clients keep their bandwidth',
        '# produce p99 stays flat',
        'kafka-reassign-partitions.sh ... --verify    # reports completion, removes the throttle',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one broker, 1 Gbit/s NIC (about 125 MB/s). Rates illustrative.',
      header: s => ({ left: 'broker 1 · leader of the partitions being copied', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 100, w: 592, labelW: 200, rowH: 28, max: 125, unit: '', title: 'Network of broker 1 (MB/s)', items: [
          { id: 'cl', label: 'client traffic' }, { id: 'cp', label: 'reassignment copy' }, { id: 'tot', label: 'NIC total (of 125)' },
        ] });
        const p99 = kit.bars(null, { x: 24, y: 214, w: 592, labelW: 200, rowH: 28, max: 1000, unit: '', title: 'What the producers see', items: [
          { id: 'p99', label: 'produce p99 (ms)' }, { id: 'isr', label: 'followers out of ISR' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 284, w: 592, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { bars, p99, chip };
      },
      frame(s, kit, R) {
        const cl = s.cl || 0, cp = s.cp || 0, tot = cl + cp, p = s.p99 || 8, isr = s.isr || 0;
        R.bars.set('cl', cl, 'info', cl + ''); R.bars.set('cp', cp, cp > 80 ? 'bad' : cp > 0 ? 'warn' : 'ok', cp + '');
        R.bars.set('tot', tot, tot > 110 ? 'bad' : tot > 90 ? 'warn' : 'ok', tot + '');
        R.p99.set('p99', p, p > 100 ? 'bad' : 'ok', p + ' ms'); R.p99.set('isr', (isr / 4) * 1000, isr > 0 ? 'bad' : 'ok', isr + '');
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
      },
    },
    bug: [
      { log: 'The cluster runs at about 70% of its network at peak. Clients send 60 MB/s through broker 1, and the produce p99 is 8 ms.', callout: 'Before the move: 70% network', code: 0,
        state: { cl: 60, cp: 0, p99: 8, r: 'before the move' }, stats: [{ l: 'produce p99', v: '8 ms', cls: 'ok' }] },
      { log: 'The operator starts the move at 14:00 with --execute and no --throttle. The new replicas begin to fetch the full log from the leaders.', callout: '--execute with no throttle', code: 1,
        state: { cl: 60, cp: 50, p99: 40, say: 'new replicas fetch the full log', sub: 'the copy is ordinary replication traffic', tone: 'warn', r: 'copy starts' }, stats: [{ l: 'copy', v: '50 MB/s', cls: 'warn' }] },
      { log: 'Nothing limits the copy. It takes all the network it can get, on the same NIC that carries the producers and the normal follower fetches.', callout: 'The copy takes all the bandwidth', moment: true, code: 2,
        state: { cl: 55, cp: 70, p99: 300, say: 'the NIC is saturated', sub: 'clients and followers queue behind the copy', tone: 'bad', r: 'saturated' }, stats: [{ l: 'NIC total', v: '125 MB/s', cls: 'bad' }, { l: 'client share', v: 'shrinks', cls: 'bad' }] },
      { log: 'Normal followers cannot fetch in time, so some leave the ISR. Producers with acks=all wait, and some time out.', callout: 'Followers drop out, producers time out', code: 3,
        state: { cl: 45, cp: 80, p99: 900, isr: 3, say: 'acks=all waits on slow followers', sub: 'timeouts reach the application', tone: 'bad', r: 'p99 900 ms' }, stats: [{ l: 'produce p99', v: '900 ms (illustrative)', cls: 'bad' }, { l: 'followers out of ISR', v: '3', cls: 'bad' }],
        takeaway: 'A move is replication traffic. Unthrottled, it competes with clients for the same network and disks.' },
    ],
    fix: [
      { log: 'The same plan runs with --throttle 50000000. That sets leader.replication.throttled.rate and follower.replication.throttled.rate to 50 MB/s for the moving replicas.', callout: '--throttle caps the copy at 50 MB/s', code: 0,
        state: { cl: 60, cp: 25, p99: 9, say: 'rate cap on the moving replicas', sub: 'throttled.rate limits bytes per second', tone: 'ok', r: 'throttled' }, stats: [{ l: 'copy', v: '25 MB/s', cls: 'ok' }] },
      { log: 'The copy uses the part of the bandwidth that the clients leave free. The NIC stays below saturation.', callout: 'The copy stays inside its cap', moment: true, code: 1,
        state: { cl: 60, cp: 48, p99: 9, r: 'steady copy' }, stats: [{ l: 'NIC total', v: '108 MB/s', cls: 'warn' }, { l: 'client share', v: 'kept', cls: 'ok' }] },
      { log: 'The producers’ p99 stays flat while the data moves. The cost is time: the move takes longer than the unthrottled one.', callout: 'Latency stays flat, the move is slower', code: 2,
        state: { cl: 60, cp: 48, p99: 9, r: 'p99 flat' }, stats: [{ l: 'produce p99', v: '9 ms (illustrative)', cls: 'ok' }, { l: 'followers out of ISR', v: '0', cls: 'ok' }] },
      { log: 'When the move is done, --verify reports completion and removes the throttle. A throttle left behind would slow the next recovery.', callout: '--verify removes the throttle', code: 3,
        state: { cl: 60, cp: 0, p99: 8, say: 'move complete, throttle removed', sub: 'otherwise it would limit normal replication later', tone: 'ok', r: 'done' }, stats: [{ l: 'copy', v: '0', cls: 'ok' }, { l: 'produce p99', v: '8 ms', cls: 'ok' }],
        takeaway: 'Throttle every move, size it from the free bandwidth, and always run --verify to clear it.' },
    ],
  };

  /* ---- 2. Add, catch up, remove: how one partition moves from brokers 1-3 to 4-6 ---- */
  const BRK = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  const move = {
    id: 'add-remove', label: 'Add, catch up, remove', desc: 'One partition moves from brokers 1-3 to brokers 4-6. The new replicas are added first, join the ISR, and only then are the old ones dropped (illustrative).',
    codeLabel: 'CLI',
    code: { bug: [
      '{"version":1,"partitions":[{"topic":"orders","partition":0,"replicas":[4,5,6]}]}   # plan.json',
      'kafka-reassign-partitions.sh --reassignment-json-file plan.json --execute --throttle 50000000',
      '# the replica set grows to 1,2,3,4,5,6; 4-6 are "adding"',
      '# 4-6 fetch the log and join the ISR',
      '# 1-3 are removed; the leader moves to a new replica; the plan is complete',
    ] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one partition, orders-0. Percentages illustrative.',
      header: s => ({ left: 'orders-0 · replicas move from 1,2,3 to 4,5,6', right: s.r || '' }),
      setup(kit) {
        const chips = BRK.map((b, i) => kit.chip(null, { x: 24 + (i % 3) * 200, y: 72 + Math.floor(i / 3) * 64, w: 190, h: 56, label: b, sub: '', tone: 'info' }));
        const led = kit.ledger(null, { x: 24, y: 204, w: 592, title: 'Partition state (kafka-topics.sh --describe)', cols: [{ label: 'field', w: 150 }, { label: 'value', w: 442 }], rows: 4, rowH: 17 });
        return { chips, led };
      },
      frame(s, kit, R) {
        const c = s.c || [];
        BRK.forEach((b, i) => { const v = c[i] || ['info', '']; R.chips[i].set({ label: b + (v[2] ? ' (leader)' : ''), tone: v[0], sub: v[1], hl: !!v[2] }); });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The partition orders-0 has its replicas on brokers 1, 2 and 3. Broker 1 leads, and all three are in the ISR.', callout: 'Three replicas on brokers 1-3', code: 0,
        state: { c: [['ok', 'in ISR', true], ['ok', 'in ISR'], ['ok', 'in ISR'], ['info', 'no replica'], ['info', 'no replica'], ['info', 'no replica']], rows: [['Replicas', '1,2,3'], ['Isr', '1,2,3'], ['Leader', '1']], r: 'before' }, stats: [{ l: 'replicas', v: '3', cls: 'ok' }] },
      { log: 'The plan lists the target replicas 4, 5 and 6. With --execute the controller first adds them to the replica set, so the set grows to six.', callout: 'The replica set grows to six', moment: true, code: 2,
        state: { c: [['ok', 'in ISR', true], ['ok', 'in ISR'], ['ok', 'in ISR'], ['warn', 'adding'], ['warn', 'adding'], ['warn', 'adding']], rows: [['Replicas', '1,2,3,4,5,6'], ['Adding', '4,5,6'], ['Isr', '1,2,3'], ['Leader', '1']], r: 'adding' }, stats: [{ l: 'replicas', v: '6', cls: 'warn' }] },
      { log: 'Brokers 4, 5 and 6 fetch the whole log from the leader under the throttle. They are not in the ISR, so they do not count for acks=all and they cannot lead.', callout: 'New replicas fetch under the throttle', code: 3,
        state: { c: [['ok', 'in ISR', true], ['ok', 'in ISR'], ['ok', 'in ISR'], ['warn', '40% copied'], ['warn', '35% copied'], ['warn', '28% copied']], rows: [['Replicas', '1,2,3,4,5,6'], ['Adding', '4,5,6'], ['Isr', '1,2,3'], ['Leader', '1']], r: 'copying' }, stats: [{ l: 'copied', v: '~35% (illustrative)', cls: 'warn' }] },
      { log: 'Each new replica reaches the leader’s log end and joins the ISR. Now six replicas are in sync.', callout: 'The new replicas join the ISR', code: 3,
        state: { c: [['ok', 'in ISR', true], ['ok', 'in ISR'], ['ok', 'in ISR'], ['ok', 'in ISR'], ['ok', 'in ISR'], ['ok', 'in ISR']], rows: [['Replicas', '1,2,3,4,5,6'], ['Adding', '4,5,6'], ['Isr', '1,2,3,4,5,6'], ['Leader', '1']], r: 'caught up' }, stats: [{ l: 'ISR', v: '6 of 6', cls: 'ok' }] },
      { log: 'Only now are the old replicas removed. Broker 1 was the leader, so leadership moves to one of the new replicas, broker 4.', callout: 'Old replicas are removed, a new leader', moment: true, code: 4,
        state: { c: [['info', 'removed'], ['info', 'removed'], ['info', 'removed'], ['ok', 'in ISR', true], ['ok', 'in ISR'], ['ok', 'in ISR']], rows: [['Replicas', '4,5,6'], ['Removing', 'none left'], ['Isr', '4,5,6'], ['Leader', '4']], rt: 'ok', r: 'done' }, stats: [{ l: 'replicas', v: '4,5,6', cls: 'ok' }, { l: 'leader', v: '4', cls: 'ok' }],
        takeaway: 'A move adds, copies, then removes. The old replicas keep serving until the new ones are in the ISR.' },
    ],
  };

  /* ---- 3. Leader skew: the preferred replica is not the current leader ---- */
  const skew = {
    id: 'skew', label: 'Leaders after restarts', desc: 'Leadership does not return to the preferred replica after restarts, so brokers 1 and 2 carry most of the leaders (counts illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        'kafka-topics.sh --bootstrap-server b1:9092 --describe --topic orders',
        'Topic: orders  Partition: 0  Leader: 1  Replicas: 3,1,2  Isr: 3,1,2',
        '# the preferred leader is 3 (first in Replicas), but broker 1 leads',
        '# leaders on broker 1: 45 of 60 (illustrative)',
      ],
      fix: [
        'kafka-leader-election.sh --election-type PREFERRED --all-topic-partitions',
        '# each partition moves back to the first replica of its list',
        '# leaders per broker: about 20 each (illustrative)',
        'auto.leader.rebalance.enable=true   # default: keeps it that way',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 60 partitions, balanced replica lists. Counts illustrative.',
      header: s => ({ left: 'orders · 60 partitions · 3 brokers', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 24, y: 104, w: 592, labelW: 170, rowH: 30, max: 60, unit: '', title: 'Leaders per broker', items: [
          { id: 'b1', label: 'broker 1' }, { id: 'b2', label: 'broker 2' }, { id: 'b3', label: 'broker 3' },
        ] });
        const chip = kit.chip(null, { x: 24, y: 200, w: 592, h: 36, label: '', sub: '', tone: 'info', show: false });
        const led = kit.ledger(null, { x: 24, y: 244, w: 592, title: 'kafka-topics.sh --describe (one partition)', cols: [{ label: 'Replicas (preferred first)', w: 220 }, { label: 'Leader', w: 100 }, { label: 'note', w: 272 }], rows: 2, rowH: 16 });
        return { bars, chip, led };
      },
      frame(s, kit, R) {
        const l = s.l || {};
        ['b1', 'b2', 'b3'].forEach(k => R.bars.set(k, l[k] || 0, (l[k] || 0) > 30 ? 'bad' : (l[k] || 0) < 12 ? 'warn' : 'ok', (l[k] || 0) + ''));
        R.chip.set({ show: !!s.say, label: s.say || '', sub: s.sub || '', tone: s.tone || 'info' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'The topic is created with balanced replica lists, so each broker is the preferred (first) replica of 20 partitions and leads them.', callout: 'Balanced at creation: 20 leaders each', code: 0,
        state: { l: { b1: 20, b2: 20, b3: 20 }, rows: [['3,1,2', '3', 'preferred leader leads']], rt: 'ok', r: 'start' }, stats: [{ l: 'leaders per broker', v: '20 / 20 / 20', cls: 'ok' }] },
      { log: 'Rolling restarts stop each broker in turn. While broker 3 is down, its partitions elect the next in-sync replica as the leader.', callout: 'A restart moves leaders elsewhere', code: 1,
        state: { l: { b1: 30, b2: 30, b3: 0 }, say: 'broker 3 is down', sub: 'its partitions are led by brokers 1 and 2', tone: 'warn', r: 'broker 3 restart' }, stats: [{ l: 'leaders on broker 3', v: '0', cls: 'warn' }] },
      { log: 'Broker 3 returns and rejoins the ISR, but leadership does not move back by itself at once. Whoever led keeps leading.', callout: 'The leader stays where it is', moment: true, code: 2,
        state: { l: { b1: 45, b2: 10, b3: 5 }, rows: [['3,1,2', '1', 'preferred is 3, but broker 1 leads']], rt: 'bad', r: 'after restarts' }, stats: [{ l: 'leaders on broker 1', v: '45 of 60', cls: 'bad' }, { l: 'leaders on broker 3', v: '5 of 60', cls: 'warn' }] },
      { log: 'Broker 1 now handles most produce and fetch traffic, so its CPU and network are high while broker 3 is mostly idle.', callout: 'One broker carries the load', code: 3,
        state: { l: { b1: 45, b2: 10, b3: 5 }, say: 'broker 1 is hot, broker 3 is idle', sub: 'replica placement is balanced, leadership is not', tone: 'bad', rows: [['3,1,2', '1', 'preferred is 3, but broker 1 leads']], rt: 'bad', r: 'skew' }, stats: [{ l: 'busiest broker', v: 'broker 1', cls: 'bad' }],
        takeaway: 'Placement and leadership are separate. A balanced replica list does not keep leadership balanced after restarts.' },
    ],
    fix: [
      { log: 'A preferred leader election is run for all partitions. It asks each partition to move its leadership back to the first replica in its list.', callout: 'Run a preferred leader election', moment: true, code: 0,
        state: { l: { b1: 45, b2: 10, b3: 5 }, say: 'election-type PREFERRED', sub: 'run it off-peak on a large cluster', tone: 'warn', r: 'election' }, stats: [{ l: 'partitions to move', v: 'about 25', cls: 'warn' }] },
      { log: 'Each partition makes a short leader change. The leader goes back to the first replica, which spreads the leaders over the brokers.', callout: 'Leaders return to the preferred replicas', code: 1,
        state: { l: { b1: 20, b2: 20, b3: 20 }, rows: [['3,1,2', '3', 'preferred leader leads']], rt: 'ok', r: 'rebalanced' }, stats: [{ l: 'leaders per broker', v: '20 / 20 / 20', cls: 'ok' }] },
      { log: 'The busiest broker’s CPU and network drop. The load is shared again.', callout: 'The load is shared again', code: 2,
        state: { l: { b1: 20, b2: 20, b3: 20 }, r: 'balanced' }, stats: [{ l: 'busiest broker CPU', v: 'drops (illustrative)', cls: 'ok' }] },
      { log: 'With auto.leader.rebalance.enable=true, which is the default, the controller checks the imbalance every few minutes and runs the election itself.', callout: 'The controller keeps it balanced', code: 3,
        state: { l: { b1: 20, b2: 20, b3: 20 }, say: 'auto.leader.rebalance.enable = true', sub: 'leader.imbalance.check.interval.seconds = 300 (default)', tone: 'ok', r: 'automatic' }, stats: [{ l: 'imbalance threshold', v: '10% per broker (default)', cls: 'ok' }],
        takeaway: 'Check the leader count per broker after restarts, and leave automatic leader rebalancing on unless you have a reason.' },
    ],
  };

  /* ---- 4. Rack awareness: replicas in different zones survive a zone failure ---- */
  const RK = [['B1', 'az-a'], ['B2', 'az-a'], ['B3', 'az-b'], ['B4', 'az-b'], ['B5', 'az-c'], ['B6', 'az-c']];
  const rack = {
    id: 'rack', label: 'Rack-aware placement', desc: 'Without broker.rack, the replicas of a partition can all land in one zone, and one zone failure removes every copy (illustrative).',
    codeLabel: 'Broker config',
    code: {
      bug: [
        '# broker.rack is not set on any broker',
        '# the replicas of orders-0 land on brokers 1, 2 and 3 (illustrative: 1 and 2 share az-a)',
        '# availability zone az-a fails',
        '# fewer in-sync replicas than min.insync.replicas, or none at all: the partition is down',
      ],
      fix: [
        'broker.rack=az-a   # on brokers 1 and 2; az-b on 3 and 4; az-c on 5 and 6',
        '# the replicas of orders-0 are placed on three different zones: 1, 3 and 5',
        '# az-a fails: brokers 3 and 5 still hold the partition',
        '# ISR = {3, 5} meets min.insync.replicas=2: the partition stays available',
      ],
    },
    stage: {
      w: 640, h: 420, footer: 'Simplified: three zones, six brokers, one partition. Illustrative.',
      header: s => ({ left: 'orders-0 · replication.factor = 3 · min.insync.replicas = 2', right: s.r || '' }),
      setup(kit) {
        const chips = RK.map((b, i) => kit.chip(null, { x: 24 + (i % 2) * 150 + Math.floor(i / 2) * 0, y: 0, w: 140, h: 56, label: b[0], sub: b[1], tone: 'info' }));
        const led = kit.ledger(null, { x: 24, y: 200, w: 592, title: 'Partition state', cols: [{ label: 'field', w: 170 }, { label: 'value', w: 422 }], rows: 3, rowH: 18 });
        return { chips, led };
      },
      frame(s, kit, R) {
        const c = s.c || [];
        RK.forEach((b, i) => {
          const v = c[i] || ['info', b[1]];
          R.chips[i].set({ x: 24 + Math.floor(i / 2) * 200, y: 72 + (i % 2) * 62, w: 190, h: 54, label: b[0] + (v[2] ? ' (leader)' : ''), sub: v[1], tone: v[0], hl: !!v[2] });
        });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { tones: [null, s.rt || null] }));
      },
    },
    bug: [
      { log: 'No broker has broker.rack set, so Kafka cannot see the zones. Each broker is just a number, and the placement is only balanced by count.', callout: 'Without broker.rack, zones are invisible', code: 0,
        state: { c: [['info', 'az-a'], ['info', 'az-a'], ['info', 'az-b'], ['info', 'az-b'], ['info', 'az-c'], ['info', 'az-c']], rows: [['broker.rack', 'not set'], ['placement', 'balanced by count']], rt: 'warn', r: 'no racks' }, stats: [{ l: 'zone aware', v: 'no', cls: 'warn' }] },
      { log: 'The replicas of orders-0 are placed on brokers 1, 2 and 3 (illustrative). Brokers 1 and 2 are in the same zone, az-a.', callout: 'Two replicas share az-a', code: 1,
        state: { c: [['ok', 'replica, az-a', true], ['ok', 'replica, az-a'], ['ok', 'replica, az-b'], ['info', 'az-b'], ['info', 'az-c'], ['info', 'az-c']], rows: [['Replicas', '1,2,3'], ['zones', 'az-a, az-a, az-b']], r: 'placed' }, stats: [{ l: 'zones with a copy', v: '2 of 3', cls: 'warn' }] },
      { log: 'The zone az-a fails. Brokers 1 and 2 go down together, and the leader is one of them.', callout: 'Zone az-a fails', moment: true, code: 2,
        state: { c: [['bad', 'down'], ['bad', 'down'], ['ok', 'replica, az-b'], ['info', 'az-b'], ['info', 'az-c'], ['info', 'az-c']], rows: [['Replicas', '1,2,3'], ['Isr', '3'], ['Leader', 'none until broker 3 is elected']], rt: 'bad', r: 'zone down' }, stats: [{ l: 'ISR', v: '1 of 3', cls: 'bad' }] },
      { log: 'One replica is left, and min.insync.replicas is 2. The partition rejects acks=all writes. If all three had been in az-a, no copy would be left at all.', callout: 'Under min ISR: writes are rejected', code: 3,
        state: { c: [['bad', 'down'], ['bad', 'down'], ['warn', 'only copy'], ['info', 'az-b'], ['info', 'az-c'], ['info', 'az-c']], rows: [['Isr', '3'], ['produce acks=all', 'NotEnoughReplicasException']], rt: 'bad', r: 'unavailable' }, stats: [{ l: 'produce', v: 'rejected', cls: 'bad' }],
        takeaway: 'Without rack information, one zone failure can take out most or all replicas of a partition.' },
    ],
    fix: [
      { log: 'Every broker sets broker.rack to its zone. Kafka’s replica placement now spreads the replicas of a partition across racks.', callout: 'broker.rack tells Kafka the zones', code: 0,
        state: { c: [['info', 'rack az-a'], ['info', 'rack az-a'], ['info', 'rack az-b'], ['info', 'rack az-b'], ['info', 'rack az-c'], ['info', 'rack az-c']], rows: [['broker.rack', 'az-a, az-b, az-c'], ['placement', 'one replica per rack, as far as possible']], rt: 'ok', r: 'racks set' }, stats: [{ l: 'zone aware', v: 'yes', cls: 'ok' }] },
      { log: 'The replicas of orders-0 are placed on brokers 1, 3 and 5, one in each zone.', callout: 'One replica in each zone', moment: true, code: 1,
        state: { c: [['ok', 'replica, az-a', true], ['info', 'az-a'], ['ok', 'replica, az-b'], ['info', 'az-b'], ['ok', 'replica, az-c'], ['info', 'az-c']], rows: [['Replicas', '1,3,5'], ['zones', 'az-a, az-b, az-c']], rt: 'ok', r: 'placed' }, stats: [{ l: 'zones with a copy', v: '3 of 3', cls: 'ok' }] },
      { log: 'The zone az-a fails. The leader on broker 1 is lost, but brokers 3 and 5 hold the partition and are in the ISR.', callout: 'Zone az-a fails, two copies remain', code: 2,
        state: { c: [['bad', 'down'], ['bad', 'down'], ['ok', 'replica, az-b', true], ['info', 'az-b'], ['ok', 'replica, az-c'], ['info', 'az-c']], rows: [['Isr', '3,5'], ['Leader', '3']], rt: 'ok', r: 'zone down' }, stats: [{ l: 'ISR', v: '2 of 3', cls: 'warn' }] },
      { log: 'Two in-sync replicas meet min.insync.replicas=2, so the partition stays available and no acknowledged record is lost.', callout: 'ISR of two: still available', moment: true, code: 3,
        state: { c: [['bad', 'down'], ['bad', 'down'], ['ok', 'replica, az-b', true], ['info', 'az-b'], ['ok', 'replica, az-c'], ['info', 'az-c']], rows: [['Isr', '3,5'], ['produce acks=all', 'accepted']], rt: 'ok', r: 'available' }, stats: [{ l: 'produce', v: 'accepted', cls: 'ok' }],
        takeaway: 'Set broker.rack on every broker before creating topics. Existing partitions need a reassignment to use it.' },
    ],
  };

  window.CHAPTER_OVERRIDES[6] = { explain: `
<h3>1. A move is replication, and placement is not leadership</h3>
<p>Kafka keeps two separate facts about a partition. The <b>replica list</b> says which brokers hold a copy. The <b>leader</b> says which of those serves the clients. Moving a partition changes the replica list. It works the same way as normal replication: the new replica fetches the whole log from the leader. That copy uses the same network and disks as the producers, the consumers and the other followers.</p>

<h3>2. Add, catch up, remove</h3>
<p><code>kafka-reassign-partitions.sh --execute</code> takes a JSON plan with the target replicas of each partition. The controller first <b>adds</b> the new replicas, so the set temporarily holds both old and new. The new replicas fetch the log. When one has caught up to the leader’s log end, it joins the ISR. Only after that are the replicas that are not in the plan <b>removed</b>. If the old leader is removed, a new leader is elected from the ISR. The old replicas keep serving until the new ones are ready, so a move does not reduce the number of copies.</p>

<h3>3. Throttle the copy</h3>
<p>Without a limit the copy takes all the bandwidth it can get. <code>--throttle</code> sets a rate in bytes per second through <code>leader.replication.throttled.rate</code> and <code>follower.replication.throttled.rate</code>, and marks the moving replicas with <code>leader.replication.throttled.replicas</code> and <code>follower.replication.throttled.replicas</code>. Only those replicas are limited. The normal followers are not. <code>--verify</code> reports the state and removes the throttle when the move is done. If you forget it, the throttle stays, and a later recovery will be slow.</p>
<p>Choose the rate from the free bandwidth, not from a guess. A rate that is too low can mean that the new replica never catches up while producers keep writing.</p>

<h3>4. Preferred leaders</h3>
<p>The first broker in a partition’s replica list is its <b>preferred leader</b>. When a broker restarts, its partitions elect another in-sync replica as leader, and when it returns, the leadership does not move back by itself at once. After several rolling restarts one broker can lead most partitions, even if the replica lists are perfectly balanced. <code>auto.leader.rebalance.enable</code> (default <code>true</code>) lets the controller check the imbalance every <code>leader.imbalance.check.interval.seconds</code> (default 300) and move leaders when a broker is over <code>leader.imbalance.per.broker.percentage</code> (default 10). You can also run <code>kafka-leader-election.sh --election-type PREFERRED</code> yourself. Each election is a short interruption of that partition, so on a very large cluster do it off-peak.</p>

<h3>5. Rack awareness</h3>
<p>Kafka does not know your zones unless you tell it. <code>broker.rack</code> names the rack or availability zone of each broker. When it creates a topic or a plan, Kafka then spreads the replicas of a partition over different racks as far as it can. Without it, replicas can all sit in one zone, and that zone’s failure removes every copy. The setting applies to new placements. Partitions that exist already keep their replicas until you reassign them.</p>

<h3>6. The trade-offs and what to measure</h3>
<p>A throttled move takes longer, and the old replicas stay for longer. More concurrent moves multiply the traffic. Watch the network and disk of the source brokers, the produce p99, <code>UnderReplicatedPartitions</code> and the leader count per broker while a move runs. Moves are best done in small batches, with each batch finished and verified before the next.</p>

<h3>7. Syntax</h3>
<pre># 1. generate a plan for the topics to move to brokers 4,5,6 (you review it)
kafka-reassign-partitions.sh --bootstrap-server b1:9092 --topics-to-move-json-file topics.json \\
  --broker-list 4,5,6 --generate

# 2. run it, with a throttle of 50 MB/s
kafka-reassign-partitions.sh --bootstrap-server b1:9092 --reassignment-json-file plan.json --execute --throttle 50000000

# 3. check, and remove the throttle when it is done
kafka-reassign-partitions.sh --bootstrap-server b1:9092 --reassignment-json-file plan.json --verify

# leadership back to the preferred replicas
kafka-leader-election.sh --bootstrap-server b1:9092 --election-type PREFERRED --all-topic-partitions

# broker.properties
broker.rack=az-a
auto.leader.rebalance.enable=true</pre>
<p>More: ${KL(KDOC + 'basic_ops_cluster_expansion', 'Expanding your cluster')} and ${KL(KDOC + 'brokerconfigs_broker.rack', 'broker.rack')}.</p>`, scenarios: [throttle, move, skew, rack] };
})();
