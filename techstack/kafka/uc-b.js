/* Use cases for features 4 to 6: replication, consumer offsets and fetching, consumer groups.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const PA = { op: 'produce', acks: 'all' }, P1 = { op: 'produce', acks: 1 };
  const F = f => ({ op: 'fetch', f }), SH = f => ({ op: 'shrink', f }), CR = id => ({ op: 'crash', id }), RS = id => ({ op: 'restart', id });

  CourseData.uc.repl = [
    {
      title: 'ISR, high watermark and what survives a leader crash', short: 'ISR', animation: {
        kind: 'isr', rf: 3, minIsr: 2,
        presets: [
          { label: 'acks=all: acknowledged records survive', ops: [PA, F(1), F(2), PA, F(1), CR(0)] },
          { label: 'acks=1: an acknowledged record is lost', ops: [P1, F(1), F(2), P1, CR(0)] },
          { label: 'A slow follower leaves the ISR', ops: [PA, SH(2), F(1), PA, F(1)] },
          { label: 'min.insync.replicas refuses writes', ops: [SH(1), SH(2), PA] },
          { label: 'Unclean election loses data', ops: [SH(1), SH(2), P1, CR(0), { op: 'unclean', id: 1 }] }
        ]
      },
      intro: 'Produce with acks=all or acks=1, let followers fetch, drop one from the ISR, crash the leader, and see which acknowledged records survive. The high watermark is the line between committed and not yet committed.',
      trigger: 'A broker acknowledged an order and died a moment later. Are the acknowledged events gone? Three replicas, <code>min.insync.replicas=2</code> (example).',
      run: "kafka-topics.sh --bootstrap-server b:9092 --describe --topic orders   # Leader, Replicas, Isr\nkafka-configs.sh --bootstrap-server b:9092 --entity-type topics --entity-name orders --alter --add-config min.insync.replicas=2",
      expect: 'With acks=all a record is acknowledged only when every ISR member has it, so any ISR member can lead without losing it. With acks=1 an acknowledged record can be lost.',
      edges: [
        E('A dead follower still blocks acks=all', 'A follower that stops fetching stays in the ISR for <code>replica.lag.time.max.ms</code> (30 s by default), and acks=all waits for it until then.', 'Expect a pause of up to that long on a broker failure, and keep the setting low enough for your latency budget.'),
        E('Unclean leader election', 'If every ISR member is down, <code>unclean.leader.election.enable=true</code> lets an out-of-sync replica lead and silently discards committed records.', 'Leave it off for data you cannot lose; accept an offline partition rather than wrong data.')
      ],
      invariant: 'A record is committed when every ISR member has it, and a new leader is chosen only from the ISR, so committed records are never lost by a failover.',
      src: 'Apache Kafka docs: Replication (ISR, high watermark, leader election), <code>replica.lag.time.max.ms</code> 30000, <code>min.insync.replicas</code>, <code>unclean.leader.election.enable</code> false. The model is a simplified three-replica partition.'
    },
    {
      title: 'min.insync.replicas: availability against durability', short: 'min.insync.replicas', kind: 'minisr',
      intro: 'With acks=all, the replication factor and min.insync.replicas together decide how many broker failures a topic survives and how many it can still write through.',
      trigger: 'The team must pick RF and min.insync.replicas for the orders topic (example choices).',
      run: "kafka-topics.sh --bootstrap-server b:9092 --create --topic orders --partitions 24 --replication-factor 3 --config min.insync.replicas=2",
      expect: 'RF 3 with min.insync.replicas 2 keeps writing through one broker failure and does not lose an acknowledged record to one failure.',
      steps: [
        S('Two numbers, two promises', 'Writes keep working while the ISR holds at least <code>min.insync.replicas</code> (min) brokers, so they tolerate RF − min failures. An acknowledged record is on at least min brokers, so it survives min − 1 failures.', { upto: 0 }, 'write availability: RF − min · durability: min − 1'),
        S('RF 3, min 1', 'Writes tolerate 2 failures, but an acknowledged record may exist on a single broker (the ISR may have shrunk to one). It survives 0 failures. Available, but not safe.', { upto: 1 }, 'available · not durable'),
        S('RF 3, min 2', 'Writes tolerate 1 failure, and every acknowledged record is on at least 2 brokers, so it survives 1 failure. The common choice.', { upto: 2 }, 'balanced · the usual choice'),
        S('RF 3, min 3', 'An acknowledged record is on all 3, surviving 2 failures, but a single broker failure stops all writes (ISR 2 is below 3). Safe, but not available.', { upto: 3 }, 'durable · any failure blocks writes'),
        S('RF 2, min 2', 'Same trade-off with fewer machines: any failure blocks writes, and only one failure is survivable.', { upto: 4 }, 'any failure blocks writes'),
        S('What the producer sees', 'When the ISR is below min, a produce request with acks=all fails with NOT_ENOUGH_REPLICAS. The write is refused, not lost, and the service must retry or queue.', { upto: 4, err: true }, 'NOT_ENOUGH_REPLICAS')
      ],
      edges: [
        E('min.insync.replicas with acks=1', 'The setting is only enforced for producers using acks=all.', 'Set acks=all on producers for topics where the setting matters.'),
        E('Rolling restarts and min ISR', 'With RF 3 and min 2, restarting a second broker while the first is still catching up drops the ISR to 1 and blocks writes.', 'Restart one broker at a time and wait until under-replicated partitions are zero.')
      ],
      invariant: 'With acks=all, a write is accepted only while the ISR has at least min.insync.replicas brokers, and an acknowledged record is on at least that many.',
      src: 'Apache Kafka docs: Topic configs (<code>min.insync.replicas</code>), Producer <code>acks</code>, Operations (rolling restart, under-replicated partitions).'
    },
    {
      title: 'Moving partitions without saturating the network', short: 'reassignment', kind: 'moves',
      intro: 'Reassigning a partition copies its whole log to a new broker. Unthrottled, that copy can take all the network and starve producers.',
      trigger: 'Three brokers were added, and moving partitions onto them saturated the network so producers timed out (example sizes).',
      run: "kafka-reassign-partitions.sh --bootstrap-server b:9092 --reassignment-json-file plan.json --execute --throttle 200000000\nkafka-reassign-partitions.sh --bootstrap-server b:9092 --reassignment-json-file plan.json --verify",
      expect: 'The move runs at the throttle rate, producers keep their bandwidth, and the throttle is removed when the move is verified complete.',
      steps: [
        S('Normal load', 'The brokers use 45% of their network for producers, followers and consumers.', { used: 45, label: 'normal traffic' }, 'network 45%'),
        S('Start a move with no limit', 'The new replicas fetch the existing 2 TB of logs from the leaders as fast as they can. Replica fetches take all the spare bandwidth and more, and the network reaches 100%.', { used: 100, label: 'unthrottled move', sat: true }, 'network 100% · producers time out'),
        S('Throttle it', 'The move is started with a replication throttle, for example 200 MB/s per broker. That is about 16% of a 10 Gbit NIC, so total use is about 61%. Producers and consumers keep their share.', { used: 61, label: 'throttled move: 200 MB/s' }, 'network 61%'),
        S('It takes time', 'Moving 2 TB at 200 MB/s takes about 2.8 hours. The new replicas catch up and join the ISR. Only after that are the old replicas removed.', { used: 61, label: 'throttled move, 2.8 hours', time: true }, '2 TB ÷ 200 MB/s ≈ 2.8 h'),
        S('A throttle that is too low', 'If the throttle is below the rate at which new data arrives, the new replica never catches up and never joins the ISR. The move stalls.', { used: 50, label: 'throttle below the produce rate', stall: true }, 'new replica never catches up'),
        S('Verify, then remove the throttle', 'Run <code>--verify</code> when the move completes. It reports completion and removes the throttle settings, which otherwise stay and slow later replication.', { used: 45, label: 'move complete, throttle removed' }, 'verified · throttle removed')
      ],
      edges: [
        E('Throttle left on', 'A throttle that stays after the move slows followers recovering from a later failure.', 'Always finish with <code>--verify</code>, which cleans up the throttle.'),
        E('Moving too much at once', 'A plan with hundreds of partitions makes every broker busy at once.', 'Move in batches and watch under-replicated partitions and request latency between batches.')
      ],
      invariant: 'A reassigned partition adds the new replicas, waits until they are in the ISR, and only then drops the old ones, so the replication factor never dips.',
      src: 'Apache Kafka docs: Operations, Expanding your cluster (<code>kafka-reassign-partitions.sh</code> <code>--throttle</code>, <code>--verify</code>), replication throttling configs.'
    }
  ];

  CourseData.uc.cons = [
    {
      title: 'When to commit decides duplicates or loss', short: 'commits', kind: 'commit',
      intro: 'A group\'s restart position is its committed offset. Committing after processing risks duplicates, and committing before risks loss.',
      trigger: 'After a crash, billing skipped some orders and replayed others (example offsets).',
      run: "kafka-consumer-groups.sh --bootstrap-server b:9092 --describe --group billing   # CURRENT-OFFSET, LOG-END-OFFSET, LAG\n# consumer config\nenable.auto.commit=true   # default: commits in the background every 5 s",
      expect: 'Commit after processing and a crash replays the uncommitted records. Commit before processing and a crash skips records that were committed but not processed.',
      steps: [
        S('Poll returns a batch', 'The consumer fetches offsets 0 to 4. Its position is 5, the next offset to fetch. The committed offset is still 0.', { pos: 5, done: 0, committed: 0, mode: 'after' }, 'position 5 · committed 0'),
        S('Process some', 'The application processes offsets 0, 1 and 2. Nothing is committed yet.', { pos: 5, done: 3, committed: 0, mode: 'after' }, 'processed 3 · committed 0'),
        S('Commit after processing', 'It commits 3, the next offset to process. The group record in Kafka now says: resume at 3.', { pos: 5, done: 3, committed: 3, mode: 'after' }, 'committed 3'),
        S('Process more, no commit yet', 'Offsets 3 and 4 are processed, but the next commit has not happened.', { pos: 5, done: 5, committed: 3, mode: 'after' }, 'processed 5 · committed 3'),
        S('A crash replays', 'The consumer crashes here. On restart it resumes from the committed 3, so offsets 3 and 4 are processed a second time: at-least-once, with duplicates. Make processing idempotent.', { pos: 3, done: 3, committed: 3, mode: 'after', crash: true }, 'resume at 3 · 3 and 4 repeat'),
        S('Commit before processing', 'The opposite order commits 5 right after the poll. A crash while processing 3 leaves committed 5, so offsets 3 and 4 are skipped for ever: at-most-once, with loss.', { pos: 5, done: 3, committed: 5, mode: 'before', crash: true }, 'resume at 5 · 3 and 4 lost')
      ],
      edges: [
        E('Auto-commit hides the problem', 'With enable.auto.commit a background commit can mark records committed before the application has finished them.', 'Commit manually after processing, or process synchronously inside the poll loop before the next poll.'),
        E('Commits are not atomic with side effects', 'Writing to a database and then committing leaves a window where the write happened but the offset did not.', 'Make the write idempotent, store the offset with the result, or use Kafka transactions (feature 8).')
      ],
      invariant: 'A consumer group resumes from its committed offset, so committing after processing gives at-least-once and committing before gives at-most-once.',
      src: 'Apache Kafka docs: Consumer configs (<code>enable.auto.commit</code>, <code>auto.commit.interval.ms</code> 5000), Message delivery semantics, <code>kafka-consumer-groups.sh</code>.'
    },
    {
      title: 'Lag that outruns retention', short: 'offset out of range', kind: 'lag',
      intro: 'A slow consumer falls behind the end of the log. If the log\'s start moves past its position, the data it wanted is gone.',
      trigger: 'A report job pauses for days. Meanwhile retention deletes old segments of a topic (example offsets in millions).',
      run: "kafka-consumer-groups.sh --bootstrap-server b:9092 --describe --group reports   # LAG per partition\n# consumer config\nauto.offset.reset=latest   # earliest | latest | none",
      expect: 'When the committed offset falls below the log start, the consumer gets an offset-out-of-range error and auto.offset.reset decides what it does.',
      steps: [
        S('A healthy group', 'The log holds offsets 0 to 100 (millions), and the group has committed 90. Lag is 10, close to the end.', { start: 0, committed: 90, end: 100 }, 'lag 10 · headroom 90'),
        S('The consumer slows', 'Processing slows down and the committed offset moves less than the log grows. Lag climbs to 40.', { start: 0, committed: 60, end: 100 }, 'lag 40'),
        S('Retention deletes the oldest segments', 'Producers keep writing and the log end moves on. Retention deletes the oldest closed segments, so the start of the log moves up to 30. The committed offset is still above it, so nothing is lost yet.', { start: 30, committed: 60, end: 130 }, 'log start 30 · committed 60'),
        S('The start passes the committed offset', 'Retention removes more, and the log start reaches 70, beyond the committed 60. Offsets 60 to 69 no longer exist anywhere.', { start: 70, committed: 60, end: 160, oor: true }, 'committed 60 < log start 70'),
        S('Offset out of range', 'The next fetch fails with an out-of-range error. <code>auto.offset.reset</code> decides: <code>earliest</code> jumps to 70, <code>latest</code> jumps to the end (skipping more), <code>none</code> raises an error to the application.', { start: 70, committed: 70, end: 160, reset: 'earliest' }, 'earliest: resume at 70 · 10 records lost'),
        S('Alert on headroom, not only on lag', 'Lag in records says how far behind the group is. Headroom, committed minus log start (or time to deletion), says how long before data is lost. Alert when headroom drops below what an outage could use.', { start: 0, committed: 60, end: 100, alert: true }, 'watch committed − log start')
      ],
      edges: [
        E('The default reset policy is latest', 'A new group, or one whose offset is gone, starts at the end and skips everything older.', 'Set <code>earliest</code> for pipelines that must not skip data, and <code>none</code> when you want to handle it yourself.'),
        E('Group offsets expire', 'A group with no members and no commits loses its stored offsets after <code>offsets.retention.minutes</code> (7 days).', 'Keep inactive groups committing, or extend the setting for batch jobs that run rarely.')
      ],
      invariant: 'A consumer can resume only at an offset that still exists; once retention moves the log start past its committed offset, those records are gone.',
      src: 'Apache Kafka docs: Consumer configs (<code>auto.offset.reset</code>), Topic configs (<code>retention.ms</code>), Broker configs (<code>offsets.retention.minutes</code> 10080).'
    },
    {
      title: 'Fetch sizing: wait for data or take what is there', short: 'fetch requests', kind: 'fetchwait',
      intro: 'A consumer fetch can wait at the broker until enough data exists. See how that long poll trades latency against requests.',
      trigger: 'Twelve consumers poll a quiet topic, and the brokers see a constant stream of tiny fetch requests (example).',
      run: "# consumer config\nfetch.min.bytes=1         # default\nfetch.max.wait.ms=500     # default\nmax.partition.fetch.bytes=1048576   # 1 MiB",
      expect: 'With defaults the broker answers a fetch as soon as one byte exists, or empty after 500 ms. Raising fetch.min.bytes trades latency for fewer, larger responses.',
      steps: [
        S('A fetch with defaults', 'The consumer asks for records after its position, with <code>fetch.min.bytes</code> 1 and <code>fetch.max.wait.ms</code> 500.', { rows: [[0, 1, 'fetch: min 1 B, wait up to 500 ms']] }, 'request sent'),
        S('The broker parks the request', 'There is no new data. The broker does not answer yet: the request waits, holding no thread, until data arrives or 500 ms pass.', { rows: [[0, 1, 'fetch: min 1 B, wait up to 500 ms'], [1, 1, 'no data: request parked']] }, 'long poll'),
        S('Data arrives', 'A producer writes at 120 ms. The broker completes the parked request with the new records at once.', { rows: [[0, 1, 'fetch: min 1 B, wait up to 500 ms'], [1, 1, 'no data: request parked'], [1, 0, 'response at 120 ms: 3 records']] }, 'latency 120 ms'),
        S('A quiet topic', 'If nothing arrives for 500 ms the broker returns an empty response, and the consumer fetches again. A quiet topic costs two requests a second per partition-fetch, not a flood.', { rows: [[0, 1, 'fetch again'], [1, 1, 'still no data'], [1, 0, 'empty response after 500 ms'], [0, 1, 'fetch again']] }, '2 requests/s when idle'),
        S('Raise fetch.min.bytes', 'With <code>fetch.min.bytes=65536</code> the broker waits until 64 KiB is ready or 500 ms pass. Responses are larger and fewer, which is cheaper for the broker and better for throughput, at the price of up to 500 ms added latency.', { rows: [[0, 1, 'fetch: min 64 KiB, wait up to 500 ms'], [1, 1, 'collecting records'], [1, 0, 'response: 64 KiB of records']] }, 'fewer, larger responses'),
        S('Size limits protect memory', '<code>max.partition.fetch.bytes</code> (1 MiB) and <code>fetch.max.bytes</code> (50 MiB) cap a response. A single batch bigger than the limit is still returned so a consumer cannot get stuck. <code>max.poll.records</code> (500) caps what one poll() gives the application.', { rows: [[0, 1, 'fetch: up to 50 MiB, 1 MiB per partition'], [1, 0, 'response within the limits']] }, 'limits bound memory per fetch')
      ],
      edges: [
        E('Huge fetch.max.wait with a small timeout', 'If the broker\'s wait exceeds the client request timeout, fetches time out for no reason.', 'Keep <code>fetch.max.wait.ms</code> well below <code>request.timeout.ms</code> (30 s by default).'),
        E('Consumers far from the brokers', 'Across a WAN each fetch has a round trip of tens of milliseconds, so tiny responses waste it.', 'Raise <code>fetch.min.bytes</code> and use a consumer in the same region where possible.')
      ],
      invariant: 'A fetch is answered when fetch.min.bytes of data exist or fetch.max.wait.ms has passed, whichever comes first.',
      src: 'Apache Kafka docs: Consumer configs (<code>fetch.min.bytes</code> 1, <code>fetch.max.wait.ms</code> 500, <code>fetch.max.bytes</code> 52428800, <code>max.partition.fetch.bytes</code> 1048576, <code>max.poll.records</code> 500).'
    }
  ];

  CourseData.uc.group = [
    {
      title: 'A rebalance: who stops, who moves', short: 'rebalance', animation: {
        kind: 'kgroup', partitions: 6, consumers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], start: ['A', 'B'],
        presets: [
          { label: 'A consumer joins: eager', ops: [{ op: 'mode', mode: 'eager' }, { op: 'join', c: 'C' }] },
          { label: 'The same join: cooperative', ops: [{ op: 'mode', mode: 'cooperative' }, { op: 'join', c: 'C' }] },
          { label: 'A consumer misses its session', start: ['A', 'B', 'C'], ops: [{ op: 'mode', mode: 'eager' }, { op: 'leave', c: 'C', crash: true }] },
          { label: 'More consumers than partitions', start: ['A', 'B', 'C', 'D', 'E', 'F'], ops: [{ op: 'mode', mode: 'cooperative' }, { op: 'join', c: 'G' }] }
        ]
      },
      intro: 'Add and remove consumers and compare the two rebalance protocols. See which partitions stop, which move, and how a seventh consumer on six partitions does nothing.',
      trigger: 'Every few minutes all consumers stop for 30 seconds and lag climbs. A deploy adds and removes consumers (example).',
      run: "kafka-consumer-groups.sh --bootstrap-server b:9092 --describe --group billing --state   # state, generation\n# consumer config\npartition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor",
      expect: 'The eager protocol stops every partition on every membership change. The cooperative protocol stops only the partitions that change owner.',
      edges: [
        E('Frequent membership changes', 'Pods that restart, autoscale or lose heartbeats cause rebalance after rebalance, and each one costs a pause.', 'Use static membership and cooperative assignment, and fix the cause of flapping (use cases 2 and 3 of this feature).'),
        E('Stateful consumers', 'A consumer that keeps local state per partition must rebuild it when a partition moves.', 'Use the sticky assignor to keep partitions where they are, and prefer standby state in stream processors.')
      ],
      invariant: 'Within a group a partition is owned by exactly one member at a time, and a rebalance reassigns ownership through the group coordinator.',
      src: 'Apache Kafka docs: Consumer group rebalancing, <code>partition.assignment.strategy</code> (Range, CooperativeSticky), KIP-429, KIP-848 (new protocol, GA in 4.0). The model assigns whole partitions only.'
    },
    {
      title: 'Two clocks decide who is still in the group', short: 'liveness', kind: 'liveness',
      intro: 'A consumer must keep two promises: heartbeat to the coordinator, and call poll() often enough. Breaking either removes it from the group.',
      trigger: 'A consumer processes a batch of 500 records for 6 minutes while its heartbeats keep flowing (example).',
      run: "# consumer config\nsession.timeout.ms=45000        # default since 3.0: no heartbeat for 45 s means dead\nheartbeat.interval.ms=3000      # heartbeats from a background thread\nmax.poll.interval.ms=300000     # 5 min between poll() calls\nmax.poll.records=500",
      expect: 'Heartbeats show the process is alive, but a poll() gap over 5 minutes makes the consumer leave the group, and its commit then fails.',
      steps: [
        S('Two separate clocks', 'A background thread heartbeats every 3 s, so the coordinator can tell a dead process in 45 s (<code>session.timeout.ms</code>). The application thread must call <code>poll()</code> at least every 5 minutes (<code>max.poll.interval.ms</code>), which proves it is making progress.', { t: 0 }, 'heartbeat clock · poll clock'),
        S('A normal loop', 'poll() returns up to 500 records (<code>max.poll.records</code>), the application processes them in seconds and calls poll() again. Both clocks are healthy.', { t: 20 }, 'poll every few seconds'),
        S('A slow batch', 'Processing one batch now takes 6 minutes because a database is slow. The heartbeat thread keeps sending, so the session clock is fine. But no poll() is called.', { t: 240 }, 'heartbeats ok · no poll for 240 s'),
        S('The poll clock expires', 'At 300 s without poll() the consumer leaves the group on its own. The coordinator starts a rebalance and gives its partitions to others, who start reading from the last committed offset.', { t: 300, left: true }, 'left the group at 300 s'),
        S('The late commit fails', 'At 360 s the slow batch finishes and the consumer tries to commit. It is no longer a member, so the commit is rejected. The new owners already re-read those records: duplicate processing.', { t: 360, left: true, fail: true }, 'commit rejected · records reprocessed'),
        S('Fix the cause', 'Lower <code>max.poll.records</code> so a batch fits in the interval, raise <code>max.poll.interval.ms</code> if slow work is expected, or hand work to a pool while polling continues (pausing partitions). Do not just raise the session timeout.', { t: 360, left: true, fail: true, fix: true }, 'smaller batches · longer interval')
      ],
      edges: [
        E('Dead process detected slowly', 'A crashed process is only noticed after <code>session.timeout.ms</code>, so its partitions are idle for up to 45 s.', 'Lower the session timeout if faster failover matters, with a heartbeat interval of about a third of it.'),
        E('GC pauses and heartbeats', 'A long garbage collection can pause the heartbeat thread and cost the member its place.', 'Tune the heap, and keep the session timeout comfortably above the worst pause.')
      ],
      invariant: 'A consumer stays in its group only while it heartbeats within session.timeout.ms and calls poll() within max.poll.interval.ms.',
      src: 'Apache Kafka docs: Consumer configs (<code>session.timeout.ms</code> 45000 since 3.0, <code>heartbeat.interval.ms</code> 3000, <code>max.poll.interval.ms</code> 300000, <code>max.poll.records</code> 500), KIP-62, KIP-735.'
    },
    {
      title: 'Static membership and rolling restarts', short: 'static membership', kind: 'static',
      intro: 'A restarted consumer normally leaves and rejoins, causing two rebalances. A stable instance id lets a quick restart reclaim its partitions with no rebalance at all.',
      trigger: 'A deploy restarts all 12 consumers of a group one by one (example).',
      run: "# consumer config, one unique value per instance (for example the pod name)\ngroup.instance.id=billing-3\nsession.timeout.ms=45000   # how long the broker waits for it to return",
      expect: 'A static member that returns within the session timeout keeps its partitions with no rebalance.',
      steps: [
        S('A dynamic member restarts', 'Without an instance id the member is anonymous. A restart is a leave followed by a join with a new member id, and each triggers a rebalance.', { upto: 1 }, '2 rebalances per restart'),
        S('Eager makes each one costly', 'With the eager protocol every rebalance stops all partitions. A rolling restart of 12 consumers can mean up to 24 rebalances, each a pause for the whole group.', { upto: 1, note: 'up to 24 stops of the whole group' }, 'up to 24 group-wide pauses'),
        S('Cooperative shrinks each pause', 'With the cooperative protocol each rebalance stops only the partitions that move. There are still up to 24 rebalances, but each is small.', { upto: 2 }, 'up to 24 small rebalances'),
        S('Static membership', 'With <code>group.instance.id</code> the coordinator remembers the member and its assignment. If it returns within the session timeout with the same id, it simply gets its partitions back: no rebalance.', { upto: 3 }, 'no rebalance on a quick restart'),
        S('A late return', 'If the restart takes longer than the session timeout, the coordinator gives the partitions away and a rebalance happens after all. Size the timeout to your restart time.', { upto: 4 }, 'rebalance after the timeout'),
        S('The trade-off', 'A real failure is also only noticed after the session timeout, so partitions of a dead static member stay idle that long. Static plus cooperative is the usual choice for stateful consumers.', { upto: 4, plan: true }, 'slower to notice real failures')
      ],
      edges: [
        E('Duplicate instance ids', 'Two live consumers with the same group.instance.id fence each other: the newer one wins and the older is shut out.', 'Make the id unique per instance, such as a stable pod name from a StatefulSet.'),
        E('The new consumer protocol', 'The KIP-848 protocol (<code>group.protocol=consumer</code>, generally available in 4.0) moves most assignment logic to the broker and avoids group-wide pauses.', 'Consider it for new deployments, and check client library support first.')
      ],
      invariant: 'A static member keeps its assignment while it is absent for less than the session timeout, so its restart causes no rebalance.',
      src: 'Apache Kafka docs: Consumer configs (<code>group.instance.id</code>), KIP-345 (static membership), KIP-429, KIP-848.'
    }
  ];
})();
