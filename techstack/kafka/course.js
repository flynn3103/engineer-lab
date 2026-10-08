/* Problem-based course data for Apache Kafka. Written from the original CHAPTERS in techstack/kafka/01-kafka-internals-end-to-end.html. */
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  window.COURSE = {
    name: 'Apache Kafka',
    kick: '12 chapters · problem-based · Apache Kafka 3.9 (KRaft)',
    lead: `An order platform emits 50,000 events per second (illustrative), and each event must be stored once, read by twelve teams at their own pace, and never lost once acknowledged. Its production failures come from a few places: a partition key that sends one seller’s events to the wrong place, an acknowledgement that promised fewer copies than it needed, a consumer that commits progress before work is finished, and a controller quorum that loses its majority. Each chapter starts from one of these incidents, asks you to predict the outcome, then walks the mechanism step by step.`,
    chapters: [
{
  title: 'Log Segments and Offsets',
  problem: `The billing replay tool must restart from offset 9,000,000 of <code>orders-3</code>, a partition of about 1 TB (illustrative). Reading from the start and dropping records until it gets there takes 40 minutes (illustrative) and keeps the disk at 100% read. Nobody can even say which offset means “everything after 14:00”.`,
  predict: {
    q: `To find offset 1,234,567 in a partition with many segments, which file does the broker open first?`,
    opts: [
      `The first segment, then it reads forward until it meets the offset`,
      `The segment whose base offset is the greatest one at or below the target, and its <code>.index</code> file`,
      `One global index file for the whole partition`
    ],
    ans: 1,
    why: `Segment files are named by their base offset, so the broker picks the right file from the names alone, then binary-searches that segment’s sparse index and scans a few KB.`
  },
  explain: `<h3>The idea</h3>
<p>A partition is an append-only log. Kafka splits it into segment files and keeps a small index beside them, so a reader can jump to any offset without scanning from the start. Records are never rewritten in place, which keeps both writes and lookups cheap.</p>
<h3>How it works, step by step</h3>
<p><b>Segment files.</b> A partition is a directory of <code>.log</code> files, each named by the base offset of its first record. Only the newest (active) segment is written. It rolls when it reaches <code>segment.bytes</code> or <code>segment.ms</code>.</p>
<p><b>Sparse offset index.</b> The <code>.index</code> file holds one entry per <code>index.interval.bytes</code> of data, which keeps it small enough to memory-map.</p>
<p><b>Time index.</b> The <code>.timeindex</code> file maps timestamps to offsets. <code>offsetsForTimes</code> uses it, so the answer depends on <code>message.timestamp.type</code>.</p>
<p><b>Framed batches.</b> Each batch carries its length and a CRC, so a reader can skip by length and detect damage.</p>
<p><b>Lookup.</b> The broker picks the segment by base offset, binary-searches the index for the closest entry at or below the target, then scans forward a few KB.</p>
<h3>The trade-off</h3>
<p>A sparse index keeps memory use low, but each lookup then scans a short range. Many small segments mean many files and memory maps. Large segments mean coarser retention, because only closed segments can be deleted.</p>`,
  diagnose: [
    {
      t: 'Open files and mmaps',
      sym: 'After adding topics, a broker fails to start or to roll a segment although the disks are nearly empty.',
      ctx: 'A team keeps adding partitions “for parallelism”. Each partition replica is a directory with a <code>.log</code>, <code>.index</code> and <code>.timeindex</code> file per segment, and the index files are memory-mapped.',
      why: 'Every segment of every replica holds file descriptors and mmaps. Partitions per broker × segments per partition × 3 files grows past the OS limits long before disk space runs out.',
      log: `-- representative output, values illustrative
java.io.IOException: Too many open files
java.io.IOException: Map failed (vm.max_map_count)`,
      note: 'Typical OS-level errors from the broker log. The limits are the process <code>nofile</code> ulimit and <code>vm.max_map_count</code>. Source: ' + KL(KDOC + 'design_filesystem', 'Kafka docs · Filesystem and persistence'),
      fix: [
        'Measure first: compare the broker’s open file descriptors and mapped regions with the ulimit and <code>vm.max_map_count</code>, and count replicas per broker.',
        'Fix: raise the broker’s open-file ulimit and <code>vm.max_map_count</code> to the documented production values.',
        'Fix: cut partitions per broker by right-sizing partition counts, deleting unused topics or adding brokers.',
        'Fix: use larger segments (<code>segment.bytes</code>) so each partition has fewer files.',
        'Trade-off: fewer, larger partitions limit consumer parallelism, and larger segments make retention coarser because only closed segments are deleted.',
        'Verify: open file descriptors and mmap counts stay well below the limits after a restart and a segment roll.'
      ]
    },
    {
      t: 'RecordTooLarge',
      sym: 'A producer fails one send with RecordTooLargeException while smaller records keep flowing.',
      ctx: 'An order carries an embedded PDF invoice of 1.4 MB (illustrative). Producers use the default <code>max.request.size</code> (1 MiB), and the topic uses the default <code>max.message.bytes</code>.',
      why: 'There are two limits on the path. The producer checks the serialized size against <code>max.request.size</code> before sending. The broker checks each batch against the topic’s <code>max.message.bytes</code> (default from <code>message.max.bytes</code>) and answers <code>MESSAGE_TOO_LARGE</code>. Raising only one side just moves the error.',
      log: `-- representative output, wording varies by version
org.apache.kafka.common.errors.RecordTooLargeException: The message is 1469441 bytes when serialized which is larger than 1048576, which is the value of the max.request.size configuration.
broker: MESSAGE_TOO_LARGE: The request included a message larger than the max message size the server will accept.`,
      note: 'The first line is the client-side check; the second is the broker error text. Source: ' + KL(KDOC + 'topicconfigs', 'Topic configs'),
      fix: [
        'Measure first: log the serialized size of the failing records and compare it with <code>max.request.size</code> and the topic’s <code>max.message.bytes</code>.',
        'Fix: prefer storing the large payload in object storage and sending a reference in the event.',
        'Fix: if the size is legitimate, raise <code>max.message.bytes</code> on the topic and <code>max.request.size</code> on producers together, and check <code>replica.fetch.max.bytes</code> and the consumers’ <code>max.partition.fetch.bytes</code>.',
        'Trade-off: big records inflate batches, memory use and replication latency, and slow every other record on the same partition.',
        'Verify: the same record is accepted, and the producer’s <code>record-size-max</code> metric stays under the configured limits.'
      ]
    },
    {
      t: 'Wrong timestamps',
      sym: 'A replay “from 14:00” starts hours too late or too early, and some old segments are never deleted.',
      ctx: 'The topic uses the default <code>message.timestamp.type=CreateTime</code>. One producer host has a clock that is 6 hours ahead (illustrative), and its records carry future timestamps.',
      why: 'With <code>CreateTime</code> the broker stores whatever timestamp the producer sets. The time index keeps the largest timestamp seen so far, and time-based retention looks at the largest timestamp in a segment. One skewed clock therefore corrupts <code>offsetsForTimes</code> answers and can keep segments alive past <code>retention.ms</code>.',
      log: `-- representative output, values illustrative
consumer.offsetsForTimes({orders-3: 1760018400000})
  -> orders-3: offset=9412077 timestamp=1760040000000   (record is 6 h newer than asked)`,
      note: 'The API returns the earliest offset whose timestamp is at or after the requested time; skewed producer timestamps make that offset wrong. Source: ' + KL(KDOC + 'topicconfigs', 'Topic configs'),
      fix: [
        'Measure first: compare record timestamps with the broker append time for a sample (for example by dumping a segment with <code>kafka-dump-log.sh</code>).',
        'Fix: set <code>message.timestamp.type=LogAppendTime</code> on topics where lookup and retention must follow the broker’s clock.',
        'Fix: otherwise fix the clock source (NTP or chrony) on producer hosts.',
        'Trade-off: <code>LogAppendTime</code> loses the event time of the producer; carry the business time in the payload if consumers need it.',
        'Verify: <code>offsetsForTimes</code> for a known wall-clock time returns a record whose timestamp is within seconds of it.'
      ]
    }
  ],
  source: { label: 'Original: Log Segments and Offsets', href: '01-kafka-internals-end-to-end.html#ch0' },
  scenarios: [
    {
      id: 'lookup',
      label: 'Scan vs index lookup',
      desc: 'The replay tool either reads every segment from 0, or jumps to the segment named for offset 9,000,000 and uses its index.',
      codeLabel: 'Replay',
      code: {
        bug: [
          '# replay tool: orders-3, target offset 9000000',
          '# no index use: read segment 0 first',
          '# read each segment in order, dropping records below the target',
          '# the target segment is reached after about 40 min (illustrative)'
        ],
        fix: [
          '# broker picks the segment whose base offset is ≤ 9000000',
          '# binary search .index: one entry per index.interval.bytes',
          '# scan a few KB in .log: offset 9000000 found'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'cons', x: 10, y: 115, w: 150, h: 60, t: 'Consumer', s: 'seek 9,000,000' },
          { id: 's0', x: 230, y: 20, w: 170, h: 50, t: 'Segment 0', s: 'base offset 0' },
          { id: 's9', x: 230, y: 200, w: 170, h: 50, t: 'Segment 9', s: 'base offset 9M' },
          { id: 'idx', x: 450, y: 200, w: 170, h: 50, t: '.index (sparse)', s: 'binary search' },
          { id: 'log', x: 450, y: 20, w: 170, h: 50, t: '.log', s: 'scan a few KB' }
        ],
        edges: [
          { id: 'e1', a: 'cons', b: 's0', label: 'scan from 0' },
          { id: 'e2', a: 'cons', b: 's9', label: 'by base offset' },
          { id: 'e3', a: 's9', b: 'idx', label: 'open' },
          { id: 'e4', a: 'idx', b: 'log', label: 'position' }
        ]
      },
      bug: [
        { log: 'Without an index rule the consumer seeks to offset 9,000,000 by reading from the first segment.', code: 1, hl: { nodes: { cons: 'on', s0: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'first segment read', v: 'segment 0', cls: 'bad' }] },
        { log: 'It reads every record in order and drops those below the target. The data read is about 1 TB (illustrative).', code: 2, hl: { nodes: { s0: 'bad' } }, stats: [{ l: 'data read', v: '~1 TB (illustrative)', cls: 'bad' }] },
        { log: 'The disk stays at 100% read for the whole scan, so the replay is slow and other readers suffer too.', code: 3, hl: { nodes: { s0: 'warn' } }, stats: [{ l: 'time to target', v: '40 min (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The broker reads the file names and picks the one whose base offset is the greatest at or below the target. Only that file is opened.', code: 0, hl: { nodes: { cons: 'on', s9: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'segments opened', v: '1', cls: 'ok' }] },
        { log: 'The sparse index narrows the search to one nearby entry, found by binary search.', code: 1, hl: { nodes: { s9: 'ok', idx: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'index lookup', v: 'binary search', cls: 'ok' }] },
        { log: 'A short scan in .log reaches offset 9,000,000. The replay starts at once.', code: 2, hl: { nodes: { log: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'time to target', v: 'milliseconds (illustrative)', cls: 'ok' }] }
      ]
    },
    {
      id: 'clock',
      label: 'Time lookup skew',
      desc: 'A producer clock six hours ahead makes a time lookup land in the wrong place, and LogAppendTime fixes it.',
      codeLabel: 'Config',
      code: {
        bug: [
          'message.timestamp.type=CreateTime  # default',
          '# producer host clock is 6 h ahead (illustrative)',
          '# time index keeps the largest timestamp seen so far',
          '# offsetsForTimes(orders-3, 14:00) -> record stamped 20:00'
        ],
        fix: [
          'message.timestamp.type=LogAppendTime',
          '# broker stamps every record with its own clock',
          '# offsetsForTimes(orders-3, 14:00) -> record at 14:00'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'prod', x: 10, y: 20, w: 150, h: 60, t: 'Producer host', s: 'clock 6 h ahead' },
          { id: 'brk', x: 230, y: 115, w: 170, h: 60, t: 'Broker log', s: 'CreateTime kept' },
          { id: 'tix', x: 450, y: 20, w: 170, h: 60, t: 'Time index', s: 'largest timestamp' },
          { id: 'q', x: 450, y: 210, w: 170, h: 60, t: 'Lookup 14:00', s: 'lands at 20:00' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'brk', label: 'future timestamps' },
          { id: 'e2', a: 'brk', b: 'tix', label: 'index update' },
          { id: 'e3', a: 'tix', b: 'q', label: 'query 14:00' }
        ]
      },
      bug: [
        { log: 'The producer host’s clock is six hours ahead (illustrative), so its records carry future timestamps.', code: 0, hl: { nodes: { prod: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'record timestamp', v: '+6 h', cls: 'bad' }] },
        { log: 'With CreateTime the broker keeps that timestamp. The time index keeps the largest one it has seen.', code: 2, hl: { nodes: { brk: 'warn', tix: 'bad' }, edges: { e2: 'on' } } },
        { log: 'A lookup for 14:00 jumps to an offset whose record is stamped 20:00 (illustrative), so replay starts hours late.', code: 3, hl: { nodes: { q: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'lookup result', v: '20:00 record', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With LogAppendTime the broker writes its own clock into every record, whatever the producer sent.', code: 0, hl: { nodes: { brk: 'ok' } }, stats: [{ l: 'timestamp source', v: 'broker clock', cls: 'ok' }] },
        { log: 'The time index now follows arrival time, so timestamps grow with offsets.', code: 1, hl: { nodes: { tix: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'The lookup for 14:00 lands on the record that arrived at 14:00.', code: 2, hl: { nodes: { q: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'lookup result', v: '14:00 record', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Log Crash Recovery',
  problem: `A node-pool upgrade stops a Kafka pod that hosts 3,000 partition replicas (illustrative). The grace period expires and the process gets SIGKILL. On restart the broker loads logs for 40 minutes (illustrative), and <code>acks=all</code> producers see errors for partitions where it was the second replica.`,
  predict: {
    q: `After an unclean shutdown, which segments does the broker re-validate?`,
    opts: [
      `Every segment of every partition`,
      `None, because the filesystem journal guarantees consistent files`,
      `Only the segments past each partition’s recovery point`
    ],
    ans: 2,
    why: `The broker checkpoints a recovery point per partition. Everything before it was flushed; only the unflushed tail has to be checked frame by frame.`
  },
  explain: `<h3>The idea</h3>
<p>After a crash the tail of each log may hold half-written batches that the broker cannot trust. Kafka does not fsync every write. Instead it trusts a checkpoint for what was already flushed, and it checks only what came after that checkpoint.</p>
<h3>How it works, step by step</h3>
<p><b>Clean shutdown marker.</b> A clean stop flushes the logs and leaves a marker, so the next start skips recovery. A controlled shutdown also moves leadership off the broker first.</p>
<p><b>Recovery point.</b> A <code>recovery-point-offset-checkpoint</code> file per log directory records how far each partition was flushed.</p>
<p><b>Validate and truncate.</b> Past that point the broker walks each batch, checks its length and CRC, truncates at the first bad frame, and rebuilds missing or invalid index files.</p>
<p><b>Parallelism.</b> <code>num.recovery.threads.per.data.dir</code> sets how many partitions recover at once in each data directory.</p>
<p><b>Durability from replicas.</b> Kafka does not fsync each message by default (<code>log.flush.interval.messages</code> is effectively unlimited). The OS flushes pages, and truncated records are fetched again from the leader.</p>
<h3>The trade-off</h3>
<p>Skipping a flush per message makes writes fast, so durability comes from having several replicas, not from one disk. A single-site setup with no replicas can lose the unflushed tail. More recovery threads speed up startup, but they add disk I/O while the broker is coming back.</p>`,
  diagnose: [
    {
      t: 'Slow restart',
      sym: 'The broker takes many minutes to rejoin; its partitions stay offline or under-replicated while it loads logs.',
      ctx: 'A broker holding thousands of partitions is killed with SIGKILL (or loses power). On restart it cannot trust the tail of its logs.',
      why: 'A clean shutdown writes a marker and skips recovery. After an unclean one the broker re-validates every segment past each partition’s recovery point (frame length and checksum) and rebuilds missing or invalid index files, using only <code>num.recovery.threads.per.data.dir</code> threads.',
      log: `-- representative output, values illustrative
INFO Recovering unflushed segment 4200 in log orders-0
UnderReplicatedPartitions > 0 until the broker is back`,
      note: 'Representative startup log line plus a documented broker metric; wording and numbering vary by version. Source: ' + KL(KDOC + 'brokerconfigs', 'Broker configs'),
      fix: [
        'Measure first: read the startup log for the recovery time per partition and watch <code>UnderReplicatedPartitions</code> on the other brokers.',
        'Fix: stop brokers with a controlled shutdown (SIGTERM with <code>controlled.shutdown.enable=true</code>) and give them enough time before escalating.',
        'Fix: raise <code>num.recovery.threads.per.data.dir</code> so several partitions recover in parallel.',
        'Fix: keep segments a sensible size so less unflushed data has to be re-validated, and rely on replication to re-fetch whatever is truncated.',
        'Trade-off: more recovery threads mean more disk I/O during startup. Kafka does not fsync every message by default, so durability comes from replication, not from the flush.',
        'Verify: restart time falls, and <code>UnderReplicatedPartitions</code> returns to 0 soon after the broker is up.'
      ]
    },
    {
      t: 'Corruption',
      sym: 'Fetches from one partition fail repeatedly; a follower or a consumer cannot get past one offset.',
      ctx: 'A failing disk or filesystem writes a bad block into a closed segment, or an index file no longer matches its log.',
      why: 'Every record batch carries a CRC. A mismatch makes the read fail rather than serve bad bytes. Indexes are only hints: Kafka rebuilds a bad one from the log at startup, but a bad log segment must be replaced from a healthy copy.',
      log: `-- representative output, values illustrative
CorruptRecordException: Record is corrupt (stored crc = 3053437206, computed crc = 1190349371)
kafka-dump-log.sh --files 00000000000000004200.log`,
      note: 'Representative exception text and a documented dump tool; the checksums are placeholders. Source: ' + KL(KDOC + 'design_ha', 'Replication design'),
      fix: [
        'Measure first: check disk and filesystem health (SMART, kernel logs) and use <code>kafka-dump-log.sh</code> on the segment to find the first bad batch.',
        'Fix: let the broker rebuild corrupt index files when it restarts.',
        'Fix: if log data is bad on a follower, remove that replica’s partition data and let it re-replicate from the leader; if the leader copy is bad, fail over to an in-sync follower first.',
        'Trade-off: re-replicating a large partition costs network and disk on the leader, so do it throttled and one partition at a time.',
        'Verify: the replica rejoins the ISR, <code>UnderReplicatedPartitions</code> returns to 0 and the CRC error stops.'
      ]
    },
    {
      t: 'Power loss',
      sym: 'Producers saw acks=all for the last few seconds of data, yet after a rack power event those offsets are gone from every replica.',
      ctx: 'All three replicas of a partition sit in one rack behind one power feed. The brokers rely on the OS page cache and do not fsync each message.',
      why: '<code>acks=all</code> means every in-sync replica has appended the record, not that every disk has flushed it. Safety comes from independent failures. When all replicas lose power together, the unflushed tail is lost on all of them.',
      log: `-- representative output, values illustrative
producer: ack received for offsets 9100001-9100040 (acks=all)
after power loss on the whole rack: log end offset of every replica = 9100000`,
      note: 'Illustrative comparison; Kafka does not log a lost-record line. Source: ' + KL(KDOC + 'design_ha', 'Replication design'),
      fix: [
        'Measure first: compare the highest acknowledged offsets in the producers with the log end offset of the replicas after the event.',
        'Fix: spread replicas over racks or power domains with <code>broker.rack</code>, keep <code>replication.factor=3</code> and <code>min.insync.replicas=2</code>.',
        'Fix: if a single-site design is unavoidable, set <code>flush.messages</code> or <code>flush.ms</code> on that topic and accept the throughput cost.',
        'Trade-off: forcing flushes lowers throughput, and independent failure domains cost extra racks and cross-zone traffic.',
        'Verify: kill a whole failure domain in a test cluster and check that every acknowledged offset is still present.'
      ]
    }
  ],
  source: { label: 'Original: Log Crash Recovery', href: '01-kafka-internals-end-to-end.html#ch1' },
  scenarios: [
    {
      id: 'restart',
      label: 'Clean stop vs kill -9',
      desc: 'A clean stop writes a marker and skips recovery. A kill -9 forces a re-check of every frame past the recovery point.',
      codeLabel: 'Log',
      code: {
        bug: [
          '# kill -9 on a pod with 3,000 replicas',
          '# no clean shutdown marker is written',
          '# recovery-point-offset-checkpoint: orders-0 = 4200',
          '# re-validate every frame from 4200 onward',
          'INFO Recovering unflushed segment 4200 in log orders-0'
        ],
        fix: [
          '# controlled shutdown: SIGTERM with controlled.shutdown.enable=true',
          '# leadership moves to other replicas first',
          '# log flushed and clean marker written',
          '# next start: recovery skipped, nothing scanned'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'stop', x: 10, y: 115, w: 150, h: 60, t: 'Broker stop', s: 'kill -9 or SIGTERM' },
          { id: 'cp', x: 230, y: 20, w: 170, h: 60, t: 'Recovery point', s: 'checkpoint file' },
          { id: 'scan', x: 230, y: 200, w: 170, h: 60, t: 'Validate frames', s: 'length + CRC' },
          { id: 'trunc', x: 450, y: 20, w: 170, h: 60, t: 'Truncate', s: 'torn tail' },
          { id: 'idx', x: 450, y: 200, w: 170, h: 60, t: 'Rebuild indexes', s: 'if invalid' }
        ],
        edges: [
          { id: 'e1', a: 'stop', b: 'cp', label: 'no marker' },
          { id: 'e2', a: 'cp', b: 'scan', label: 'from here' },
          { id: 'e3', a: 'scan', b: 'trunc', label: 'bad frame' },
          { id: 'e4', a: 'scan', b: 'idx', label: 'rebuild' }
        ]
      },
      bug: [
        { log: 'kill -9 gives the broker no chance to write a clean shutdown marker.', code: 1, hl: { nodes: { stop: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'clean marker', v: 'absent', cls: 'bad' }] },
        { log: 'The broker reads the recovery point for orders-0 (offset 4200, illustrative). Everything after it is unverified.', code: 2, hl: { nodes: { cp: 'warn' }, edges: { e2: 'on' } } },
        { log: 'Each frame after the recovery point is checked for length and CRC. On a few threads this takes 40 minutes (illustrative).', code: 3, hl: { nodes: { scan: 'bad' } }, stats: [{ l: 'restart time', v: '40 min (illustrative)', cls: 'bad' }] },
        { log: 'Until recovery finishes the partitions on this broker are not in sync, so the count stays above zero.', code: 4, hl: { nodes: { idx: 'warn' } }, stats: [{ l: 'UnderReplicatedPartitions', v: '> 0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The broker stops cleanly. Leadership moves to other replicas before it goes down.', code: 0, hl: { nodes: { stop: 'ok' }, edges: { e1: 'dim' } }, stats: [{ l: 'clean marker', v: 'written', cls: 'ok' }] },
        { log: 'The logs are flushed and the marker is written, so the checkpoint is current.', code: 2, hl: { nodes: { cp: 'ok' } } },
        { log: 'The next start sees the marker and skips recovery entirely.', code: 3, hl: { nodes: { scan: 'dim' }, edges: { e2: 'dim' } }, stats: [{ l: 'restart time', v: 'seconds (illustrative)', cls: 'ok' }] }
      ]
    },
    {
      id: 'crc',
      label: 'Bad batch and CRC',
      desc: 'A bad disk block fails the CRC check. The replica cannot read past that offset until it copies the data again from the leader.',
      codeLabel: 'Log',
      code: {
        bug: [
          '# disk writes a bad block into closed segment 4200 (illustrative)',
          '# follower reads offset 4210: CRC mismatch',
          'CorruptRecordException: Record is corrupt (stored crc = 3053437206, computed crc = 1190349371)',
          '# replica stays out of the ISR'
        ],
        fix: [
          '# measure: check disk health, then dump the segment',
          'kafka-dump-log.sh --files 00000000000000004200.log',
          '# drop the bad copy and re-replicate from the leader',
          '# replica catches up and rejoins the ISR'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'disk', x: 10, y: 115, w: 150, h: 60, t: 'Disk block', s: 'bad write' },
          { id: 'fol', x: 230, y: 115, w: 170, h: 60, t: 'Follower replica', s: 'reads offset 4210' },
          { id: 'err', x: 430, y: 20, w: 200, h: 60, t: 'CorruptRecordException', s: 'CRC mismatch' },
          { id: 'ldr', x: 430, y: 210, w: 200, h: 60, t: 'Leader', s: 'clean copy' }
        ],
        edges: [
          { id: 'e1', a: 'disk', b: 'fol', label: 'bad bytes' },
          { id: 'e2', a: 'fol', b: 'err', label: 'checks CRC' },
          { id: 'e3', a: 'ldr', b: 'fol', label: 'copy again' }
        ]
      },
      bug: [
        { log: 'A failing disk writes a bad block into a closed segment. Nothing reports it yet.', code: 0, hl: { nodes: { disk: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'bad batch', v: '1', cls: 'bad' }] },
        { log: 'The follower reads offset 4210. The stored CRC does not match the one computed from the bytes.', code: 1, hl: { nodes: { fol: 'warn' }, edges: { e2: 'on' } } },
        { log: 'The read fails instead of serving bad bytes, and the replica cannot move past this offset.', code: 2, hl: { nodes: { err: 'bad' } }, stats: [{ l: 'replica state', v: 'out of ISR', cls: 'bad' }] },
        { log: 'Readers of that replica stay blocked, and the partition runs with one fewer healthy copy.', code: 3, stats: [{ l: 'healthy copies', v: 'one fewer', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Disk health and the dump show the first bad batch is at offset 4210 (illustrative).', code: 1, hl: { nodes: { disk: 'warn' } }, stats: [{ l: 'first bad batch', v: 'offset 4210', cls: 'warn' }] },
        { log: 'The damaged copy on the follower is removed, and the follower fetches the partition again from the leader.', code: 2, hl: { nodes: { ldr: 'ok' }, edges: { e3: 'ok' } } },
        { log: 'The clean copy arrives, the replica catches up and rejoins the ISR.', code: 3, hl: { nodes: { fol: 'ok' } }, stats: [{ l: 'UnderReplicatedPartitions', v: '0', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Partitioning and Keys',
  problem: `Orders are keyed by <code>seller_id</code>. During a sale someone runs <code>kafka-topics.sh --alter --partitions 12</code> on a topic with 6 partitions. An hour later fulfilment tickets show “shipped” before “paid” for some sellers (illustrative), while others look fine.`,
  predict: {
    q: `After growing the topic from 6 to 12 partitions, do the old and the new events for key K always land in the same partition?`,
    opts: [
      `Not necessarily: the key hash is taken modulo the partition count`,
      `Yes, the hash of K does not change`,
      `Yes, Kafka moves the existing records to the new layout`
    ],
    ans: 0,
    why: `The partition is <code>hash(key) % numPartitions</code>. A different N maps many keys elsewhere, and existing records are never moved.`
  },
  explain: `<h3>The idea</h3>
<p>The key decides the partition. Kafka promises order only inside one partition, so the producer hashes each record’s key to choose where it goes. Every event with the same key then lands in the same log, in the order it was sent.</p>
<h3>How it works, step by step</h3>
<p><b>Default partitioner.</b> With a key, the partition is <code>toPositive(murmur2(keyBytes)) % numPartitions</code>. For a fixed partition count the same key always maps to the same partition.</p>
<p><b>Order is per partition.</b> Consumers in a group read partitions in parallel, so there is no global order across partitions.</p>
<p><b>Changing N changes the modulo.</b> Old records stay where they are. One key’s history can then end up in two partitions.</p>
<p><b>Null keys.</b> The uniform sticky partitioner (KIP-794, Kafka 3.3 and later) fills one batch for a partition before it switches, which keeps batches large while spreading load. <code>partitioner.ignore.keys=true</code> applies the same logic to keyed records.</p>
<p><b>Hot keys.</b> Every record of one key goes to one partition. Adding partitions cannot split the traffic of a single key.</p>
<h3>The trade-off</h3>
<p>One partition gives order, and many partitions give throughput. The partition count is part of the data contract. It can be raised later but never lowered without recreating the topic, and raising it reroutes keys, so plan the count for the consumer parallelism you need.</p>`,
  diagnose: [
    {
      t: 'Hot key',
      sym: 'One partition has far higher bytes-in and consumer lag; one consumer is pegged while the others idle.',
      ctx: 'An orders topic is keyed by <code>seller_id</code>. One marketplace seller produces a large share of all events.',
      why: '<code>partition = hash(key) mod N</code>. Equal keys always map to one partition, so adding brokers or partitions cannot split the traffic of a single key.',
      log: `-- representative output, values illustrative
Bytes-in per partition: P0 48 MB/s, P1 4, P2 5, P3 3, P4 4, P5 4
kafka-consumer-groups.sh --describe: LAG concentrated on partition 0`,
      note: 'Metric pattern and a documented CLI; the values are illustrative. Source: ' + KL(KDOC + 'producerconfigs', 'Producer configs'),
      fix: [
        'Measure first: compare per-partition bytes-in and consumer lag to confirm the skew.',
        'Fix: use a finer key (for example seller_id plus order_id), or salt the hot key into a few buckets.',
        'Fix: optionally use a custom partitioner for known hot keys, then re-check balance.',
        'Trade-off: order is guaranteed only per key within one partition, so a salted or finer key gives up ordering across the buckets for that seller.',
        'Verify: per-partition throughput and lag are within a small factor of each other.'
      ]
    },
    {
      t: 'Order breaks',
      sym: 'A consumer sees an order’s “paid” event before its “created” event, or a stateful job loses state for some keys.',
      ctx: 'To get more consumer parallelism the topic grows from 3 to 4 partitions while orders are in flight.',
      why: 'The partitioner is <code>hash(key) mod numPartitions</code>. Changing N moves most keys to a new partition, while existing records never move, so one key’s history is now split over two logs.',
      log: `-- representative output, values illustrative
kafka-topics.sh --bootstrap-server broker:9092 --alter --topic orders --partitions 4
key order-7: created @ partition 1, paid @ partition 3`,
      note: 'The command is documented; the key placement illustrates <code>hash(key) mod N</code> changing. Source: ' + KL(KDOC + 'topicconfigs', 'Topic configs'),
      fix: [
        'Measure first: sample keys and check whether their events sit in more than one partition.',
        'Fix: treat the partition count as part of the data contract and size it up front for the target consumer parallelism.',
        'Fix: if it must grow, create a new topic with the final count and migrate by dual-writing or replaying the old data; drain the old topic before switching key-dependent consumers.',
        'Trade-off: a migration costs a full copy and a coordinated cut-over, and the partition count can never be lowered without recreating the topic.',
        'Verify: for sampled keys every event lands in one partition of the new topic and consumers see them in order.'
      ]
    },
    {
      t: 'Null keys',
      sym: 'A topic with null keys shows one partition (on a slow broker) with much more data than the others.',
      ctx: 'Records have no key, so the producer picks the partition. One broker is slow, and clients run a version older than 3.3 with the KIP-480 sticky partitioner.',
      why: 'The old sticky partitioner switched partitions after a batch’s worth of data. A slow broker drains batches slowly, so records waiting for it kept sticking to its partition, which sent even more data to the broker that was already behind. KIP-794 replaced it with a uniform sticky partitioner with adaptive partitioning.',
      log: `-- representative output, values illustrative
Bytes-in per partition (null-key topic): P0 31 MB/s, P1 9, P2 10, P3 9
P0 leader: broker-3 (high request queue time)`,
      note: 'Illustrative skew pattern; the design problem is described in KIP-794. Source: ' + KL(KIP + 'KIP-794%3A+Strictly+Uniform+Sticky+Partitioner', 'KIP-794 · uniform sticky partitioner'),
      fix: [
        'Measure first: compare bytes-in and request queue time per partition leader to find the slow broker.',
        'Fix: upgrade clients to 3.3 or later, which use the uniform sticky partitioner; keep <code>partitioner.adaptive.partitioning.enable</code> at its default <code>true</code>.',
        'Fix: remove the real cause of the slow broker (disk, network, noisy neighbour).',
        'Trade-off: adaptive partitioning deliberately sends unequal amounts to partitions, so do not read partition-level balance as a health metric.',
        'Verify: the slow partition’s share of bytes-in falls and produce latency on that broker recovers.'
      ]
    }
  ],
  source: { label: 'Original: Partitioning and Keys', href: '01-kafka-internals-end-to-end.html#ch2' },
  scenarios: [
    {
      id: 'hash',
      label: 'Hash key, grow N',
      desc: 'A key maps to one partition while N stays fixed. Growing N to 12 routes new events for the same seller to a different partition.',
      codeLabel: 'Command',
      code: {
        bug: [
          '# topic orders: 6 partitions, key = seller_id',
          'kafka-topics.sh --bootstrap-server broker:9092 --alter --topic orders --partitions 12',
          '# partition = toPositive(murmur2(key)) % 12',
          '# seller 42: old events in partition 3, new events in partition 9',
          '# existing records are not moved'
        ],
        fix: [
          '# create the topic with its final partition count first',
          'kafka-topics.sh --bootstrap-server broker:9092 --create --topic orders-v2 --partitions 12',
          '# partition = toPositive(murmur2(key)) % 12 for every event',
          '# seller 42 keeps one partition, so its order holds'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'prod', x: 10, y: 115, w: 150, h: 60, t: 'Producer', s: 'key seller-42' },
          { id: 'hash', x: 230, y: 115, w: 170, h: 60, t: 'murmur2(key)', s: 'mod N' },
          { id: 'p3', x: 450, y: 20, w: 170, h: 50, t: 'Partition 3', s: 'mod 6 gives 3' },
          { id: 'p9', x: 450, y: 210, w: 170, h: 50, t: 'Partition 9', s: 'mod 12 gives 9' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'hash', label: 'key bytes' },
          { id: 'e2', a: 'hash', b: 'p3', label: 'old events' },
          { id: 'e3', a: 'hash', b: 'p9', label: 'new events' }
        ]
      },
      bug: [
        { log: 'Seller 42’s events were written while the topic had 6 partitions. Their hash mod 6 gave partition 3.', code: 2, hl: { nodes: { prod: 'on', hash: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'partitions', v: '6', cls: 'ok' }] },
        { log: 'The topic grows to 12 partitions. New events use hash mod 12, which gives partition 9 for the same key.', code: 2, hl: { nodes: { hash: 'warn', p9: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'new partition', v: '9', cls: 'bad' }] },
        { log: 'Old events stay in partition 3. The same seller now has history in two partitions.', code: 3, hl: { nodes: { p3: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'partitions for seller 42', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The topic is created with 12 partitions before the first event is written.', code: 1, hl: { nodes: { prod: 'ok' } } },
        { log: 'Every event for the key goes through the same hash mod 12.', code: 2, hl: { nodes: { hash: 'ok', p9: 'ok' }, edges: { e3: 'ok' } } },
        { log: 'The partition never changes for seller 42, so its events stay in order.', code: 3, hl: { nodes: { p9: 'ok' } }, stats: [{ l: 'partitions for seller 42', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'hot',
      label: 'Hot key on one partition',
      desc: 'All traffic of one busy seller lands on one partition. Its consumer falls behind while the others have little to read.',
      codeLabel: 'Metric',
      code: {
        bug: [
          '# bytes-in per partition (illustrative)',
          'P0 48 MB/s, P1 4, P2 5, P3 3, P4 4, P5 4',
          '# seller_id is the key: one seller owns most events',
          'kafka-consumer-groups.sh --describe: LAG concentrated on partition 0'
        ],
        fix: [
          '# finer key: seller_id plus order_id, or a salted bucket',
          '# partitioner spreads the seller across partitions',
          'P0 11 MB/s, P1 9, P2 10, P3 9, P4 10, P5 9 (illustrative)'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'prod', x: 10, y: 115, w: 150, h: 60, t: 'Producer', s: 'hot seller 42' },
          { id: 'hash', x: 230, y: 115, w: 170, h: 60, t: 'Partitioner', s: 'hash(key) mod N' },
          { id: 'p0', x: 450, y: 10, w: 180, h: 60, t: 'Partition 0', s: 'hot key lands here' },
          { id: 'po', x: 450, y: 115, w: 180, h: 60, t: 'Partitions 1 to 5', s: 'about 4 MB/s each' },
          { id: 'c0', x: 450, y: 220, w: 180, h: 60, t: 'Consumer of P0', s: 'lag grows' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'hash', label: 'key' },
          { id: 'e2', a: 'hash', b: 'p0', label: 'hot key' },
          { id: 'e3', a: 'hash', b: 'po', label: 'other keys' },
          { id: 'e4', a: 'p0', b: 'c0', label: 'one consumer' }
        ]
      },
      bug: [
        { log: 'Seller 42 sends most of the events, and all of them carry the same key.', code: 2, hl: { nodes: { prod: 'warn' } }, stats: [{ l: 'share of events', v: 'most (illustrative)', cls: 'warn' }] },
        { log: 'The partitioner maps that key to partition 0 every time, so partition 0 takes almost all the bytes.', code: 1, hl: { nodes: { hash: 'bad', p0: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'P0 bytes-in', v: '48 MB/s', cls: 'bad' }] },
        { log: 'One consumer owns partition 0 and falls behind. The other partitions have little to read.', code: 3, hl: { nodes: { c0: 'bad' }, edges: { e4: 'on' } }, stats: [{ l: 'LAG', v: 'concentrated on P0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The key is refined, so one seller’s events no longer share a single key.', code: 0, hl: { nodes: { prod: 'ok' } } },
        { log: 'The partitioner now spreads the seller’s events over several partitions.', code: 1, hl: { nodes: { hash: 'ok', po: 'ok' }, edges: { e3: 'ok' } } },
        { log: 'Each partition sees a similar load, and every consumer has work.', code: 2, hl: { nodes: { p0: 'ok', c0: 'ok' } }, stats: [{ l: 'P0 bytes-in', v: '11 MB/s (illustrative)', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Producer Batching and Buffering',
  problem: `Twenty producer instances send about 50,000 events/s in total (illustrative), each with <code>linger.ms=0</code> and a small <code>batch.size</code>. Broker request threads sit near 90% CPU (illustrative) while bandwidth stays low, and during a broker slowdown some HTTP threads block inside <code>send()</code>.`,
  predict: {
    q: `You raise <code>linger.ms</code> from 0 to 10 at a steady 5,000 events/s per producer. What happens to requests per second and to latency?`,
    opts: [
      `Requests/s stay the same and latency rises by 10 ms`,
      `Requests/s drop sharply and latency rises by at most about 10 ms`,
      `Requests/s drop, but latency rises by seconds`
    ],
    ans: 1,
    why: `In 10 ms the producer accumulates about 50 records (illustrative), which share one request. A record waits at most <code>linger.ms</code> for its batch to close.`
  },
  explain: `<h3>The idea</h3>
<p>Each produce request costs a fixed amount of work on the broker, however small it is. Batching sends many records in one request, so that fixed cost is shared. Buffering then bounds how much memory unsent records may use.</p>
<h3>How it works, step by step</h3>
<p><b>RecordAccumulator.</b> It keeps a queue of batches per partition and appends each record to the open batch for its partition.</p>
<p><b>Batch close.</b> A batch is sent when it holds <code>batch.size</code> bytes or when <code>linger.ms</code> has passed since its first record, whichever comes first.</p>
<p><b>Sender thread.</b> It drains the ready batches for each broker, so one request carries one batch for each partition that broker leads.</p>
<p><b>Compression.</b> <code>compression.type</code> is applied per batch. A larger batch compresses better.</p>
<p><b>Bounded buffer.</b> <code>buffer.memory</code> limits unsent data. When it is full, <code>send()</code> blocks for up to <code>max.block.ms</code> and then throws.</p>
<h3>The trade-off</h3>
<p><code>linger.ms</code> adds up to that much latency to each record while its batch fills. Under heavy load, though, fewer and fuller requests can lower end-to-end latency. A bigger buffer hides a slow broker for longer, and it loses more unsent data if the process dies.</p>`,
  diagnose: [
    {
      t: 'Tiny batches',
      sym: 'Broker request-handler CPU and the produce request rate are high while bytes-in is modest; produce latency rises with load.',
      ctx: 'Many producers send each record immediately: <code>linger.ms=0</code> and a small <code>batch.size</code>, at tens of thousands of records per second.',
      why: 'Each request costs a round trip and broker work no matter how small it is. With no linger the producer closes a batch after one record, so throughput is bounded by request rate, not bandwidth.',
      log: `-- representative output, values illustrative
Producer: batch-size-avg = 310, records-per-request-avg = 1.1
Broker: kafka.network:type=RequestMetrics,name=RequestsPerSec,request=Produce  -> very high`,
      note: 'Documented producer and broker metrics; the pattern is illustrative. Source: ' + KL(KDOC + 'monitoring', 'Monitoring'),
      fix: [
        'Measure first: check <code>batch-size-avg</code> and <code>records-per-request-avg</code> on the producers.',
        'Fix: raise <code>linger.ms</code> (for example 5 to 20 ms) and <code>batch.size</code> (for example 64 KB) so records share a request.',
        'Fix: enable compression with <code>compression.type</code> to shrink whole batches.',
        'Trade-off: <code>linger.ms</code> adds up to that much latency to a record while its batch fills; under heavy load fewer requests can even lower end-to-end latency.',
        'Verify: the produce request rate drops sharply for the same bytes-in, and p99 produce latency does not rise.'
      ]
    },
    {
      t: 'Buffer full',
      sym: 'Request threads hang inside send(), then fail with a TimeoutException about allocating memory.',
      ctx: 'A broker slows down. The producer keeps accepting events from the application faster than it can ship them.',
      why: 'Unsent batches live in <code>buffer.memory</code> (default 32 MiB). When it is full, <code>send()</code> blocks for up to <code>max.block.ms</code> (default 60 s). After that it throws <code>BufferExhaustedException</code>, a <code>TimeoutException</code>. Blocking is back-pressure, but here it propagates into HTTP threads.',
      log: `-- representative output, values illustrative
org.apache.kafka.common.errors.TimeoutException: Failed to allocate 16384 bytes within the configured max blocking time 60000 ms. Total memory: 33554432 bytes. Available memory: 0 bytes. Poolable size: 16384 bytes`,
      note: 'The text follows the exception built by the producer’s buffer pool. Watch <code>buffer-available-bytes</code> and <code>buffer-exhausted-records</code> in the producer metrics. Source: ' + KL(KDOC + 'producerconfigs', 'Producer configs'),
      fix: [
        'Measure first: check <code>buffer-available-bytes</code>, <code>buffer-exhausted-records</code> and request latency to find the slow broker.',
        'Fix: remove the cause of the slow broker; raise <code>buffer.memory</code> only to absorb a known burst.',
        'Fix: lower <code>max.block.ms</code> for request threads, or hand events to the producer from a bounded queue so overload is shed deliberately.',
        'Trade-off: a bigger buffer hides a slow broker for longer and loses more unsent data if the process dies; a small <code>max.block.ms</code> fails requests sooner.',
        'Verify: <code>buffer-available-bytes</code> stays well above zero and no TimeoutException appears during the next broker slowdown.'
      ]
    },
    {
      t: 'Compression',
      sym: 'Compression is enabled, yet network bytes and broker disk barely drop.',
      ctx: 'A team turned on <code>compression.type=lz4</code> and expected much less traffic, but left <code>linger.ms=0</code>.',
      why: 'Compression works on a whole batch. A batch of one or two records has little redundancy to remove and still pays the header cost, so the ratio stays close to 1.',
      log: `-- representative output, values illustrative
Producer: compression-rate-avg = 0.94, batch-size-avg = 420
Broker network in ≈ uncompressed volume`,
      note: '<code>compression-rate-avg</code> is the compressed-to-uncompressed ratio reported by the producer; values near 1.0 mean little saving. Source: ' + KL(KDOC + 'producerconfigs', 'Producer configs'),
      fix: [
        'Measure first: read <code>compression-rate-avg</code> and <code>batch-size-avg</code>.',
        'Fix: raise <code>linger.ms</code> and <code>batch.size</code> so batches fill before they are compressed.',
        'Fix: choose <code>compression.type</code> for the workload (lz4 or zstd for text and JSON) and compare ratios on real data.',
        'Trade-off: compression costs producer and consumer CPU, and a longer linger adds latency.',
        'Verify: <code>compression-rate-avg</code> falls and broker network-in drops for the same event rate.'
      ]
    }
  ],
  source: { label: 'Original: Producer Batching and Buffering', href: '01-kafka-internals-end-to-end.html#ch3' },
  scenarios: [
    {
      id: 'batch',
      label: 'linger and batch size',
      desc: 'Closing a batch on time or size turns many single-record requests into a few full ones.',
      codeLabel: 'Config',
      code: {
        bug: [
          'linger.ms=0',
          'batch.size=1024  # small (illustrative)',
          '# each send() closes a batch after one record',
          '# about 38k produce requests/s per producer (illustrative)'
        ],
        fix: [
          'linger.ms=10',
          'batch.size=65536',
          '# about 50 records share one request in 10 ms (illustrative)',
          '# produce requests fall to about 4k/s (illustrative)'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'app', x: 10, y: 115, w: 150, h: 60, t: 'App threads', s: 'send() 50k/s' },
          { id: 'acc', x: 230, y: 115, w: 170, h: 60, t: 'RecordAccumulator', s: 'batch per partition' },
          { id: 'snd', x: 450, y: 20, w: 170, h: 60, t: 'Sender thread', s: 'one request per broker' },
          { id: 'brk', x: 450, y: 210, w: 170, h: 60, t: 'Broker', s: 'request handler' }
        ],
        edges: [
          { id: 'e1', a: 'app', b: 'acc', label: 'append' },
          { id: 'e2', a: 'acc', b: 'snd', label: 'batch ready' },
          { id: 'e3', a: 'snd', b: 'brk', label: 'one request' }
        ]
      },
      bug: [
        { log: 'linger.ms=0 means a batch closes as soon as one record is in it.', code: 0, hl: { nodes: { app: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'records per request', v: '1.1', cls: 'bad' }] },
        { log: 'Each record becomes its own produce request, so the event rate turns into about the same number of requests.', code: 2, hl: { nodes: { snd: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'requests per second', v: '~38k per producer', cls: 'bad' }] },
        { log: 'The broker spends its time on per-request work, so its CPU reaches about 90% while bandwidth stays low.', code: 2, hl: { nodes: { brk: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'broker CPU', v: 'about 90% (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'linger.ms=10 holds a batch open for up to 10 ms, so records share one request.', code: 0, hl: { nodes: { acc: 'ok' } } },
        { log: 'batch.size=65536 closes a batch early when it is full, so big batches go out at once.', code: 1, hl: { nodes: { snd: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'Requests fall sharply for the same bytes, and the broker CPU drops.', code: 3, hl: { nodes: { brk: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'produce requests', v: 'about 4k/s (illustrative)', cls: 'ok' }] }
      ]
    },
    {
      id: 'buffer',
      label: 'Full buffer blocks send()',
      desc: 'A slow broker fills buffer.memory. send() blocks the calling thread, then throws after max.block.ms.',
      codeLabel: 'Error',
      code: {
        bug: [
          '# buffer.memory = 32 MiB (default)',
          '# broker slow: unsent batches pile up in the buffer',
          '# send() waits up to max.block.ms = 60000',
          'org.apache.kafka.common.errors.TimeoutException: Failed to allocate 16384 bytes within the configured max blocking time 60000 ms.'
        ],
        fix: [
          '# fix the slow broker first',
          '# raise buffer.memory only for a known burst',
          '# lower max.block.ms on request threads',
          '# buffer-available-bytes stays above zero'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'app', x: 10, y: 115, w: 150, h: 60, t: 'HTTP threads', s: 'call send()' },
          { id: 'buf', x: 230, y: 115, w: 170, h: 60, t: 'buffer.memory', s: '32 MiB, filling' },
          { id: 'snd', x: 450, y: 20, w: 170, h: 60, t: 'Sender thread', s: 'batches in flight' },
          { id: 'brk', x: 450, y: 210, w: 170, h: 60, t: 'Slow broker', s: 'high queue time' }
        ],
        edges: [
          { id: 'e1', a: 'app', b: 'buf', label: 'send()' },
          { id: 'e2', a: 'buf', b: 'snd', label: 'drain' },
          { id: 'e3', a: 'snd', b: 'brk', label: 'slow ack' }
        ]
      },
      bug: [
        { log: 'The application adds events faster than the slow broker drains them.', code: 0, hl: { nodes: { buf: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'buffer used', v: '32 of 32 MiB', cls: 'bad' }] },
        { log: 'Because the buffer is full, send() blocks the calling thread for up to max.block.ms.', code: 2, hl: { nodes: { app: 'warn' }, edges: { e3: 'dim' } } },
        { log: 'After 60 s the producer throws a TimeoutException, so the HTTP request fails.', code: 3, hl: { nodes: { app: 'bad' } }, stats: [{ l: 'threads waiting', v: 'up to 60 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The slow broker is fixed first. Its queue time drops, and the sender drains the buffer.', code: 0, hl: { nodes: { brk: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'buffer used', v: '8 of 32 MiB (illustrative)', cls: 'ok' }] },
        { log: 'With max.block.ms lowered on request threads, a full buffer makes callers fail fast instead of hanging.', code: 2, hl: { nodes: { app: 'ok' } }, stats: [{ l: 'send() blocked', v: 'milliseconds (illustrative)', cls: 'ok' }] },
        { log: 'buffer-available-bytes stays above zero, so send() returns at once.', code: 3, hl: { nodes: { buf: 'ok' }, edges: { e2: 'ok' } } }
      ]
    }
  ]
},
{
  title: 'Idempotent Producer and Retries',
  problem: `A payments producer still runs an old configuration: <code>enable.idempotence=false</code>, <code>retries=2147483647</code> and <code>max.in.flight.requests.per.connection=5</code>. A broker restart makes some produce responses time out. Finance finds order 7731 booked twice, and for seller 42 the event “paid” appears before “created” (illustrative).`,
  predict: {
    q: `With idempotence on and 5 requests in flight, can a retry reorder records within a partition?`,
    opts: [
      `Yes, more than one request in flight can always reorder on retry`,
      `Only when acks=1`,
      `No: the leader accepts a batch only if its sequence is the next expected one`
    ],
    ans: 2,
    why: `A batch with a gap in its sequence is rejected with OutOfOrderSequenceException and retried after its predecessor, so order is preserved for up to 5 in-flight requests.`
  },
  explain: `<h3>The idea</h3>
<p>A timeout does not tell the producer whether its write landed. A blind retry can therefore duplicate a record or move it after a later one. Idempotence gives every batch an identity, so the leader can recognise a repeat and ignore it.</p>
<h3>How it works, step by step</h3>
<p><b>Producer ID and epoch.</b> With <code>enable.idempotence=true</code>, which has been the default since Kafka 3.0 (KIP-679), the broker assigns the producer an ID.</p>
<p><b>Sequence numbers.</b> Each batch carries a sequence number per partition. The leader appends only the next expected one, ignores a duplicate, and rejects a gap with <code>OutOfOrderSequenceException</code>.</p>
<p><b>In-flight window.</b> Up to 5 in-flight requests per connection keep their order when idempotence is on. Without it, more than one in-flight request can reorder on retry.</p>
<p><b>Bounded retries.</b> <code>delivery.timeout.ms</code> (default 120000) caps the total time to deliver a record, retries included. Idempotence needs <code>acks=all</code>.</p>
<p><b>Scope.</b> Deduplication works within one producer session and per partition. A restarted producer gets a new ID, which the <code>transactional.id</code> in the transactions chapter addresses.</p>
<h3>The trade-off</h3>
<p>Idempotence is cheap, but it only protects one producer session. Across restarts, and in the systems a consumer writes to, you still need an idempotent consumer, for example a dedupe key or an upsert.</p>`,
  diagnose: [
    {
      t: 'Dupes and reorder',
      sym: 'Downstream sees the same event twice, or events of one key in a different order than they were sent.',
      ctx: 'A producer without idempotence times out waiting for an ack and retries, with several batches in flight per connection.',
      why: 'A timeout is ambiguous: the write may already have landed. A blind retry appends it again, and with <code>max.in.flight.requests.per.connection</code> above 1 a retried batch can land after a later batch. Idempotence adds (producer ID, sequence) so the leader can recognise a retry.',
      log: `-- representative output, values illustrative
Producer metric: record-retry-rate > 0, request timeouts
Consumer: business id order-7731 appears twice`,
      note: 'Documented producer metric; the duplicate is observed by the application, not logged by Kafka. Source: ' + KL(KDOC + 'semantics', 'Delivery semantics'),
      fix: [
        'Measure first: check <code>record-retry-rate</code> and request timeouts on the producer, and look for duplicate business ids downstream.',
        'Fix: set <code>enable.idempotence=true</code> (the default in current clients) with <code>acks=all</code>.',
        'Fix: keep <code>max.in.flight.requests.per.connection</code> at 5 or less (with idempotence that still preserves order) and bound retries with <code>delivery.timeout.ms</code>.',
        'Trade-off: idempotence is per producer session and partition. A restarted producer gets a new producer ID, so it does not dedupe across restarts; that needs a <code>transactional.id</code>. For effects outside Kafka, make the consumer idempotent too.',
        'Verify: after injecting a lost ack, the log holds each batch once and in order.'
      ]
    },
    {
      t: 'Expired records',
      sym: 'Callbacks report a TimeoutException about expiring records, and the application cannot tell whether they were written.',
      ctx: 'The leader of several partitions is unreachable for more than two minutes (illustrative). The producer keeps the batches and retries.',
      why: '<code>delivery.timeout.ms</code> (default 120000 ms) bounds the whole delivery attempt from <code>send()</code> to success or failure. After it passes, the batch is expired with a <code>TimeoutException</code>. If the request was already in flight the outcome can be unknown, so the application has to treat it as maybe written.',
      log: `-- representative output, wording varies by version
org.apache.kafka.common.errors.TimeoutException: Expiring 25 record(s) for orders-3:120000 ms has passed since batch creation`,
      note: 'The exception is delivered to the send callback or future. Check <code>request-latency-avg</code> and <code>record-error-rate</code> in the producer metrics. Source: ' + KL(KDOC + 'producerconfigs', 'Producer configs'),
      fix: [
        'Measure first: find which partitions and brokers were unavailable and for how long, from broker logs and <code>request-latency-avg</code>.',
        'Fix: fix the unavailable leader; keep <code>delivery.timeout.ms</code> at least <code>linger.ms</code> plus <code>request.timeout.ms</code>.',
        'Fix: handle the callback error by re-sending from an outbox or durable queue, with idempotence enabled so a maybe-written record is not duplicated.',
        'Trade-off: a long window keeps the application waiting and holds buffer memory; a short one fails over sooner but surfaces more ambiguous outcomes.',
        'Verify: during a leader failover test no callback reports an expiry, or every expired record is re-sent exactly once.'
      ]
    },
    {
      t: 'Silently off',
      sym: 'Duplicates appear again after someone tuned producer settings, although nobody turned idempotence off.',
      ctx: 'A tuning change sets <code>acks=1</code> “for speed” (or <code>retries=0</code>) on a producer that relied on the idempotence default.',
      why: 'Since Kafka 3.0 idempotence is on by default, but only if the settings allow it. When <code>enable.idempotence</code> is not set explicitly and another setting conflicts (<code>acks</code> other than <code>all</code>, <code>retries=0</code>, or too many in-flight requests), the producer disables idempotence and only logs it. An explicit <code>enable.idempotence=true</code> with a conflicting setting fails with a <code>ConfigException</code>.',
      log: `-- representative output, wording varies by version
INFO [Producer clientId=producer-1] Idempotence will be disabled because acks is set to 1, not set to 'all'.`,
      note: 'Look for this line and for <code>enable.idempotence = false</code> in the “ProducerConfig values” block printed at startup. Source: ' + KL(KIP + 'KIP-679%3A+Producer+will+enable+the+strongest+delivery+guarantee+by+default', 'KIP-679 · idempotence on by default'),
      fix: [
        'Measure first: read the producer startup log for the effective <code>enable.idempotence</code>, <code>acks</code>, <code>retries</code> and <code>max.in.flight.requests.per.connection</code>.',
        'Fix: remove the conflicting setting, or set <code>acks=all</code>.',
        'Fix: set <code>enable.idempotence=true</code> explicitly so a conflicting configuration fails fast instead of silently weakening delivery.',
        'Trade-off: <code>acks=all</code> waits for the in-sync replicas, so latency rises compared with <code>acks=1</code>.',
        'Verify: the startup log shows idempotence enabled, and the lost-ack test no longer produces duplicates.'
      ]
    }
  ],
  source: { label: 'Original: Idempotent Producer and Retries', href: '01-kafka-internals-end-to-end.html#ch4' },
  scenarios: [
    {
      id: 'seq',
      label: 'Retry with sequence check',
      desc: 'Batch 1 is retried after its ack is lost. Without a sequence number the leader appends it again; with one, the leader sees it already has sequence 1.',
      codeLabel: 'Config',
      code: {
        bug: [
          'enable.idempotence=false',
          'retries=2147483647',
          'max.in.flight.requests.per.connection=5',
          '# ack for batch #1 lost; #1 retried after #2 is already in flight',
          '# log now reads: 1 2 1 (batch #1 appended twice, out of order)'
        ],
        fix: [
          'enable.idempotence=true',
          'acks=all',
          'max.in.flight.requests.per.connection=5',
          '# retry of #1 carries the same PID 7 and sequence 1',
          '# leader already holds sequence 1: retry is a no-op'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'prod', x: 10, y: 115, w: 150, h: 60, t: 'Producer', s: 'PID 7 · seq 1' },
          { id: 'ldr', x: 230, y: 115, w: 170, h: 60, t: 'Leader', s: 'tracks PID + seq' },
          { id: 'log', x: 450, y: 20, w: 170, h: 60, t: 'Partition log', s: 'offsets 0 and 1' },
          { id: 'retry', x: 450, y: 210, w: 170, h: 60, t: 'Retry of batch 1', s: 'same PID + seq' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'ldr', label: 'send 1 and 2' },
          { id: 'e2', a: 'ldr', b: 'log', label: 'append' },
          { id: 'e3', a: 'retry', b: 'ldr', label: 'resend 1' }
        ]
      },
      bug: [
        { log: 'The producer sends batch 1, then batch 2, while batch 1 is still in flight.', code: 2, hl: { nodes: { prod: 'on' }, edges: { e1: 'on' } } },
        { log: 'The ack for batch 1 is lost, so the producer times out and retries batch 1 with no sequence check on the leader.', code: 3, hl: { nodes: { prod: 'warn', retry: 'bad' }, edges: { e3: 'on' } } },
        { log: 'The leader appends the retry as a new record. The log reads 1 2 1, and the consumer sees order 7731 twice.', code: 4, hl: { nodes: { log: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'order 7731', v: 'booked twice (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With idempotence on, the producer gets a producer ID and numbers each batch per partition.', code: 0, hl: { nodes: { prod: 'ok' } }, stats: [{ l: 'producer ID', v: '7', cls: 'ok' }] },
        { log: 'The retry of batch 1 carries the same producer ID and sequence, so the leader already knows it.', code: 3, hl: { nodes: { retry: 'ok' }, edges: { e3: 'ok' } } },
        { log: 'The leader appends nothing, and the log stays in order: 1 2.', code: 4, hl: { nodes: { log: 'ok', ldr: 'ok' } }, stats: [{ l: 'duplicates', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'expire',
      label: 'Delivery timeout expires',
      desc: 'A leader outage longer than delivery.timeout.ms expires the batch. The caller must then treat the write as maybe landed.',
      codeLabel: 'Config',
      code: {
        bug: [
          'delivery.timeout.ms=120000  # default',
          '# leader of orders-3 unreachable for more than 2 min (illustrative)',
          'org.apache.kafka.common.errors.TimeoutException: Expiring 25 record(s) for orders-3:120000 ms has passed since batch creation',
          '# callback reports failure; the write may or may not have landed'
        ],
        fix: [
          '# fix the unavailable leader within the window',
          'delivery.timeout.ms >= linger.ms + request.timeout.ms',
          '# on failure: re-send from an outbox, with idempotence on',
          '# no callback reports expiry in the failover test'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'rec', x: 10, y: 115, w: 150, h: 60, t: 'Record', s: 'created at 0 s' },
          { id: 'ldr', x: 230, y: 115, w: 170, h: 60, t: 'Leader', s: 'unreachable' },
          { id: 'exp', x: 450, y: 20, w: 170, h: 60, t: 'Batch expired', s: 'after 120 s' },
          { id: 'ack', x: 450, y: 210, w: 170, h: 60, t: 'Leader back', s: 'acked at 9 s' }
        ],
        edges: [
          { id: 'e1', a: 'rec', b: 'ldr', label: 'send' },
          { id: 'e2', a: 'ldr', b: 'exp', label: 'waits past the window' },
          { id: 'e3', a: 'ldr', b: 'ack', label: 'recovers in time' }
        ]
      },
      bug: [
        { log: 'The record is handed to the producer at 0 s, and its batch waits for the leader.', code: 0, hl: { nodes: { rec: 'on' }, edges: { e1: 'on' } } },
        { log: 'The leader stays unreachable for longer than the window (illustrative: 2 minutes or more), so the batch keeps retrying.', code: 1, hl: { nodes: { ldr: 'bad' } } },
        { log: 'At delivery.timeout.ms the batch expires and the callback gets a TimeoutException.', code: 2, hl: { nodes: { exp: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'outcome', v: 'unknown', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The leader recovers after about 9 s (illustrative), which is inside the delivery window.', code: 0, hl: { nodes: { ldr: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'leader back after', v: '9 s (illustrative)', cls: 'ok' }] },
        { log: 'The batch is acknowledged, so the callback reports success.', code: 2, hl: { nodes: { ack: 'ok' } }, stats: [{ l: 'callback', v: 'success', cls: 'ok' }] },
        { log: 'Any batch that does expire is re-sent from an outbox, with idempotence on, so it is not duplicated.', code: 2, hl: { nodes: { rec: 'ok' } } }
      ]
    }
  ]
},
{
  title: 'Replication, ISR and High Watermark',
  problem: `The checkout service writes orders with <code>replication.factor=3</code> and <code>acks=1</code>, chosen because a benchmark showed it 30% faster (illustrative). At 02:14 broker 1, the leader, loses its host. Every producer saw success, and after failover five paid orders are missing downstream (illustrative).`,
  predict: {
    q: `With <code>acks=1</code>, the leader dies before the followers fetch the newest records. Is an acknowledged record safe?`,
    opts: [
      `Yes, the leader wrote it to disk before replying`,
      `No: only the leader had it, and a follower without it may become leader`,
      `Yes, the producer retries automatically so it is never lost`
    ],
    ans: 1,
    why: `With <code>acks=1</code> the leader replies after its own append. Records above the log end of the follower that takes over are gone, even though the producer saw success.`
  },
  explain: `<h3>The idea</h3>
<p>An acknowledgement is only as strong as the number of copies that exist when it is sent. Replication goes through one leader per partition. The high watermark marks the records that every in-sync replica already holds, and only those are safe to show to readers.</p>
<h3>How it works, step by step</h3>
<p><b>Leader and followers.</b> Producers write to the partition leader. Followers fetch from it, the way consumers do, and append to their own logs.</p>
<p><b>ISR.</b> The in-sync replica set is the leader plus the followers that caught up within <code>replica.lag.time.max.ms</code> (default 30 s). A follower that lags longer leaves the ISR and returns once it catches up.</p>
<p><b>High watermark.</b> It is the smallest log end offset in the ISR. Consumers read only below it, and an <code>acks=all</code> write is acknowledged once the high watermark passes it.</p>
<p><b>Guard rails.</b> With <code>acks=all</code>, the leader rejects writes when the ISR is smaller than <code>min.insync.replicas</code>. <code>unclean.leader.election.enable=false</code> (the default) keeps an out-of-sync replica from becoming leader.</p>
<p><b>Leader epoch (KIP-101).</b> After a leader change, followers truncate to the end of the previous epoch instead of trusting the high watermark.</p>
<h3>The trade-off</h3>
<p><code>acks=all</code> waits for the slowest in-sync replica, so latency rises. <code>min.insync.replicas=2</code> adds durability, but then a partition stops accepting writes as soon as only one replica is in sync.</p>`,
  diagnose: [
    {
      t: 'acks=1 loss',
      sym: 'Producers saw success for every record, but after a failover some of those records are gone from the topic.',
      ctx: 'A producer uses <code>acks=1</code> for speed. The leader acknowledges after its own append and then crashes before followers fetch the newest records.',
      why: 'With <code>acks=1</code> the leader replies before any follower has the record. An in-sync follower with a shorter log is elected, so records above its log end are lost. The high watermark only counts replicas that have the data.',
      log: `-- representative output, values illustrative
Producer: ack for offsets 4-5 received
New leader (follower): log end offset = 4`,
      note: 'Illustrative trace of the failover; Kafka does not log a lost-record line. Source: ' + KL(KDOC + 'design_ha', 'Replication design'),
      fix: [
        'Measure first: compare the offsets the producers saw acknowledged with the new leader’s log end offset after a failover.',
        'Fix: use <code>acks=all</code> with <code>replication.factor=3</code> and <code>min.insync.replicas=2</code> for data that must not be lost.',
        'Fix: keep <code>unclean.leader.election.enable=false</code> so an out-of-sync replica cannot become leader, and retry on failure with idempotence on.',
        'Trade-off: <code>acks=all</code> waits for the slowest in-sync replica, so latency rises; with <code>min.insync.replicas=2</code> the partition rejects writes when only one replica is in sync.',
        'Verify: kill the leader mid-stream and check that every acknowledged offset is present on the new leader.'
      ]
    },
    {
      t: 'NOT_ENOUGH_REPLICAS',
      sym: 'Produce requests fail even though the leader is healthy; consumers can still read.',
      ctx: 'A topic uses <code>replication.factor=3</code>, <code>min.insync.replicas=2</code> and <code>acks=all</code>. Two of the three replicas fall out of sync during a rolling restart.',
      why: 'With <code>acks=all</code> the leader refuses writes when the ISR has fewer than <code>min.insync.replicas</code> members. That is the guard that stops an acknowledged record from existing on a single copy.',
      log: `-- representative output, wording varies by version
NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required.
kafka.server:type=ReplicaManager,name=UnderMinIsrPartitionCount > 0`,
      note: 'Documented exception and broker metric; message wording can vary by version. Source: ' + KL(KDOC + 'monitoring', 'Monitoring'),
      fix: [
        'Measure first: list the under-min-ISR partitions and find which replicas are out of sync and why (down broker, slow disk, network).',
        'Fix: restore or replace the missing replica so the ISR grows back to at least <code>min.insync.replicas</code>.',
        'Fix: restart brokers one at a time and wait for <code>UnderReplicatedPartitions</code> to reach 0 before the next one; do not lower <code>min.insync.replicas</code> as a quick fix unless losing that guarantee is acceptable.',
        'Trade-off: a higher <code>min.insync.replicas</code> trades availability for durability, because the partition stops accepting writes sooner; <code>min.insync.replicas=1</code> keeps writing on one copy.',
        'Verify: <code>UnderMinIsrPartitionCount</code> returns to 0 and produce errors stop.'
      ]
    },
    {
      t: 'ISR flapping',
      sym: 'Under-replicated partitions blink on and off; acks=all latency spikes whenever the follower is in the ISR.',
      ctx: 'One follower sits on a busy disk or a congested link and can barely keep up with the leader.',
      why: 'A follower that has not caught up to the leader’s log end within <code>replica.lag.time.max.ms</code> is removed from the ISR, then re-added when it catches up. Every shrink and expand is a metadata update, and <code>acks=all</code> waits for the slow member while it is in.',
      log: `-- representative output, values illustrative
kafka.server:type=ReplicaManager,name=IsrShrinksPerSec  non-zero
kafka.server:type=ReplicaManager,name=IsrExpandsPerSec  non-zero
UnderReplicatedPartitions oscillating`,
      note: 'Documented broker metrics; the oscillation pattern is illustrative. Source: ' + KL(KDOC + 'monitoring', 'Monitoring'),
      fix: [
        'Measure first: find the slow broker from fetcher lag, disk latency, network and GC metrics.',
        'Fix: fix or move the underlying bottleneck rather than raising the timeout, and spread replicas so no broker carries a disproportionate share.',
        'Fix: tune <code>replica.lag.time.max.ms</code> only to match a known, bounded stall.',
        'Trade-off: a larger <code>replica.lag.time.max.ms</code> keeps a slow follower in the ISR longer, so there are fewer flaps but higher <code>acks=all</code> latency and a longer wait before the ISR reflects reality.',
        'Verify: <code>IsrShrinksPerSec</code> and <code>IsrExpandsPerSec</code> return to about 0 and <code>UnderReplicatedPartitions</code> stays at 0.'
      ]
    },
    {
      t: 'Unclean election',
      sym: 'After all in-sync replicas were down, the partition came back, but some acknowledged records are missing and consumers see offsets rewind.',
      ctx: 'A topic was set to <code>unclean.leader.election.enable=true</code> “so the partition never stays offline”. The leader and the other in-sync replica both fail, and only an out-of-sync follower returns.',
      why: 'With unclean election the controller may pick a replica that is not in the ISR. It becomes leader with a shorter log. Records acknowledged by the old leader but not present on it are lost, and when the old replicas return they truncate to the new leader’s log.',
      log: `-- representative output, values illustrative
kafka.controller:type=ControllerStats,name=UncleanLeaderElectionsPerSec  > 0
old leader returns: truncating to offset 8120 (new leader log end), 74 records dropped`,
      note: 'The metric is documented; the truncation line is paraphrased. Source: ' + KL(KDOC + 'design_ha', 'Replication design'),
      fix: [
        'Measure first: check <code>UncleanLeaderElectionsPerSec</code> and the topic’s <code>unclean.leader.election.enable</code> setting.',
        'Fix: keep <code>unclean.leader.election.enable=false</code> for any data that must not be lost, and restore an in-sync replica to bring the partition back.',
        'Fix: if some topics really prefer availability (for example disposable metrics), enable it per topic only.',
        'Trade-off: with it off, the partition is unavailable until an in-sync replica returns; with it on you choose availability over consistency.',
        'Verify: after a multi-broker failure test, the leader is always an ex-ISR member and no acknowledged offset disappears.'
      ]
    }
  ],
  source: { label: 'Original: Replication, ISR and High Watermark', href: '01-kafka-internals-end-to-end.html#ch5' },
  scenarios: [
    {
      id: 'acks',
      label: 'acks=1 vs acks=all',
      desc: 'The same leader crash. With acks=1 an acknowledged record exists only on the leader. With acks=all it is copied to every in-sync replica before the ack.',
      codeLabel: 'Config',
      code: {
        bug: [
          'acks=1',
          'replication.factor=3',
          '# leader appends offsets 4-5 and acknowledges at once',
          '# leader crashes before followers fetch offsets 4-5',
          '# new leader log end offset = 4: offsets 4-5 are gone'
        ],
        fix: [
          'acks=all',
          'min.insync.replicas=2',
          'unclean.leader.election.enable=false',
          '# ack only after the high watermark passes offsets 4-5',
          '# leader crash: an in-sync follower already has them'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'prod', x: 10, y: 115, w: 150, h: 60, t: 'Producer', s: 'sends offsets 4-5' },
          { id: 'ldr', x: 230, y: 115, w: 170, h: 60, t: 'Leader', s: 'broker 1' },
          { id: 'f2', x: 450, y: 20, w: 170, h: 60, t: 'Follower broker 2', s: 'log end 4 (behind)' },
          { id: 'f3', x: 450, y: 210, w: 170, h: 60, t: 'Follower broker 3', s: 'log end 4 (behind)' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'ldr', label: 'produce' },
          { id: 'e2', a: 'f2', b: 'ldr', label: 'fetch' },
          { id: 'e3', a: 'f3', b: 'ldr', label: 'fetch' }
        ]
      },
      bug: [
        { log: 'The producer sends offsets 4 and 5 to the leader, which appends them.', code: 0, hl: { nodes: { prod: 'on' }, edges: { e1: 'on' } } },
        { log: 'With acks=1 the leader acknowledges at once. The followers have not fetched offsets 4-5 yet.', code: 2, hl: { nodes: { ldr: 'warn', f2: 'dim', f3: 'dim' } }, stats: [{ l: 'acked', v: 'offsets 4-5', cls: 'warn' }] },
        { log: 'The leader crashes. Follower broker 2 takes over, and its log ends at offset 4.', code: 3, hl: { nodes: { ldr: 'bad', f2: 'bad' } } },
        { log: 'Offsets 4 and 5 were acknowledged to the producer and are now gone.', code: 4, hl: { nodes: { prod: 'bad' } }, stats: [{ l: 'acked records lost', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With acks=all the leader does not reply until the high watermark passes the records.', code: 0, hl: { nodes: { prod: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'The in-sync followers fetch offsets 4-5 and report their new log ends to the leader.', code: 3, hl: { nodes: { f2: 'ok', f3: 'ok' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'in-sync copies', v: '3 of 3 (illustrative)', cls: 'ok' }] },
        { log: 'If the leader crashes now, an in-sync follower already has offsets 4-5. Nothing acknowledged is lost.', code: 4, hl: { nodes: { f2: 'ok' } }, stats: [{ l: 'acked records lost', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'minisr',
      label: 'Min ISR rejects writes',
      desc: 'When only one replica is in sync, acks=all refuses the write instead of storing it on a single copy.',
      codeLabel: 'Config',
      code: {
        bug: [
          'replication.factor=3',
          'min.insync.replicas=2',
          'acks=all',
          '# broker 3 down, broker 2 out of sync: ISR = {1}',
          'NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required.'
        ],
        fix: [
          '# restart broker 2 and let it catch up',
          '# ISR = {1, 2}, which meets min.insync.replicas=2',
          '# produce with acks=all succeeds again',
          '# UnderMinIsrPartitionCount back to 0'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'ldr', x: 10, y: 115, w: 160, h: 60, t: 'Broker 1', s: 'leader, in ISR' },
          { id: 'f2', x: 230, y: 20, w: 170, h: 60, t: 'Broker 2', s: 'out of sync' },
          { id: 'f3', x: 230, y: 210, w: 170, h: 60, t: 'Broker 3', s: 'down' },
          { id: 'prod', x: 450, y: 115, w: 170, h: 60, t: 'Producer', s: 'acks=all' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'ldr', label: 'produce' },
          { id: 'e2', a: 'f2', b: 'ldr', label: 'fetch stalled' },
          { id: 'e3', a: 'f3', b: 'ldr', label: 'no fetch' }
        ]
      },
      bug: [
        { log: 'Two of three replicas drop out of sync during a rolling restart.', code: 3, hl: { nodes: { f2: 'bad', f3: 'bad' }, edges: { e2: 'dim', e3: 'dim' } }, stats: [{ l: 'ISR size', v: '1', cls: 'bad' }] },
        { log: 'The producer sends with acks=all. The leader checks the ISR against min.insync.replicas=2.', code: 2, hl: { nodes: { prod: 'warn' }, edges: { e1: 'on' } } },
        { log: 'The ISR has one member, so the leader rejects the write and returns the error.', code: 4, hl: { nodes: { ldr: 'bad' } }, stats: [{ l: 'produce', v: 'rejected', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Broker 2 is restored, so it catches up and rejoins the ISR.', code: 0, hl: { nodes: { f2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'ISR size', v: '2', cls: 'ok' }] },
        { log: 'With two in-sync replicas the leader accepts acks=all writes again.', code: 2, hl: { nodes: { prod: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'produce', v: 'accepted', cls: 'ok' }] },
        { log: 'Brokers are restarted one at a time, and the under-minimum count returns to zero.', code: 3, stats: [{ l: 'UnderMinIsrPartitionCount', v: '0', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Partition Reassignment and Placement',
  problem: `Three new brokers join a three-broker cluster that runs at 70% network at peak (illustrative). A 3 TB move (illustrative) runs at 14:00 with no throttle, so produce p99 goes from 8 ms to 900 ms (illustrative) and some producers time out. Afterwards the new brokers hold data, but leaders stay on brokers 1 and 2.`,
  predict: {
    q: `During a reassignment, when does the new replica start to serve as leader?`,
    opts: [
      `Only after it has joined the ISR and leadership has moved to it`,
      `As soon as the plan is submitted`,
      `After the old replica is deleted, without a catch-up`
    ],
    ans: 0,
    why: `A new replica first fetches the log like any follower. It can lead only once it is in the ISR and a leader election (or the preferred-replica order) selects it.`
  },
  explain: `<h3>The idea</h3>
<p>Moving a partition is just replication. The new replica copies the whole log from the leader, so it competes with client traffic for the same network and disks. A safe move adds the new replica, lets it catch up under a bandwidth cap, and only then removes the old one.</p>
<h3>How it works, step by step</h3>
<p><b>Add, catch up, remove.</b> <code>kafka-reassign-partitions.sh --execute</code> adds the target replicas. They fetch the log, join the ISR, and then the old replicas are dropped.</p>
<p><b>Throttle.</b> <code>--throttle</code> caps replication traffic in bytes per second through <code>leader.replication.throttled.rate</code> and <code>follower.replication.throttled.rate</code>. <code>--verify</code> removes the throttle when the move finishes.</p>
<p><b>Preferred leader.</b> The first replica in the list is the preferred leader. <code>auto.leader.rebalance.enable</code> lets the controller move leadership back, and <code>kafka-leader-election.sh --election-type PREFERRED</code> does it on demand.</p>
<p><b>Rack awareness.</b> <code>broker.rack</code> lets Kafka place the replicas of a partition in different racks or zones.</p>
<p><b>The limit.</b> A throttle set too low can leave a new replica unable to catch up while producers keep writing.</p>
<h3>The trade-off</h3>
<p>A throttled move takes longer, and old replicas stay around longer. Preferred-leader elections briefly interrupt each partition, so on very large clusters run them off-peak.</p>`,
  diagnose: [
    {
      t: 'Saturated cluster',
      sym: 'Produce and fetch latency rise and followers drop out of the ISR while data is being copied.',
      ctx: 'To use new brokers, an operator reassigns hundreds of partitions at once during peak traffic.',
      why: 'A move is just replication: the new replica fetches the full committed log from the leader. Unthrottled, that copy competes with client traffic and with normal follower fetches for the same network and disk.',
      log: `-- representative output, values illustrative
kafka-reassign-partitions.sh --bootstrap-server broker:9092 --reassignment-json-file plan.json --execute   (no --throttle)
Network and disk saturated; UnderReplicatedPartitions climbing`,
      note: 'Documented command; saturation figures are illustrative. Source: ' + KL(KDOC + 'basic_ops_cluster_expansion', 'Expanding your cluster'),
      fix: [
        'Measure first: check network and disk utilisation per broker, and the client p99 latency, while the reassignment runs.',
        'Fix: re-run with <code>--throttle</code> (inter-broker bytes/s) so clients keep their bandwidth.',
        'Fix: move a few partitions at a time, preferably off-peak, and watch the ISR and latency during the move.',
        'Trade-off: a throttle makes the move slower and keeps old replicas around longer; a throttle that is too low can leave a new replica unable to catch up while producers keep writing.',
        'Verify: client latency stays flat during the move, and the throttle is removed after <code>--verify</code> reports completion.'
      ]
    },
    {
      t: 'Leader skew',
      sym: 'One or two brokers carry most of the traffic and CPU, although partitions are evenly spread.',
      ctx: 'After rolling restarts, each partition’s leadership moved to a surviving replica and never moved back.',
      why: 'Replica placement and leadership are separate. After a restart the leader is whichever replica is in the ISR, not the preferred (first) replica. Until leadership is rebalanced, the brokers that stayed up keep leading.',
      log: `-- representative output, values illustrative
kafka-topics.sh --bootstrap-server broker:9092 --describe --topic orders
Topic: orders  Partition: 0  Leader: 1  Replicas: 3,1,2  Isr: 3,1,2
Topic: orders  Partition: 1  Leader: 1  Replicas: 2,3,1  Isr: 2,3,1`,
      note: 'The preferred leader is the first broker in <code>Replicas</code>; here the actual leader differs. Source: ' + KL(KDOC + 'basic_ops_cluster_expansion', 'Expanding your cluster'),
      fix: [
        'Measure first: count leaders per broker with <code>kafka-topics.sh --describe</code>, and compare Leader with the first entry of Replicas.',
        'Fix: keep <code>auto.leader.rebalance.enable=true</code> (the default), or run <code>kafka-leader-election.sh --election-type PREFERRED --all-topic-partitions</code> after the restarts.',
        'Fix: restart brokers one at a time and wait for the ISR to recover before the next, so leadership moves are small.',
        'Trade-off: each leader election briefly interrupts the partition, so run it off-peak on very large clusters.',
        'Verify: leaders per broker are within a few percent of each other and the busiest broker’s CPU drops.'
      ]
    },
    {
      t: 'Single rack',
      sym: 'A zone outage takes entire partitions offline although each partition has three replicas.',
      ctx: 'Brokers run in three zones, but <code>broker.rack</code> was never set, so the placement algorithm treats all brokers as equal.',
      why: 'Rack-aware placement needs to know each broker’s rack. Without it, the three replicas of a partition may all land on brokers of the same zone, and one zone failure removes every copy.',
      log: `-- representative output, values illustrative
partition orders-5: Replicas 1,2,3 (all in zone-a)
zone-a outage -> kafka.controller:type=KafkaController,name=OfflinePartitionsCount = 12`,
      note: '<code>OfflinePartitionsCount</code> is a documented controller metric; the placement is an illustration. Source: ' + KL(KDOC + 'basic_ops_cluster_expansion', 'Expanding your cluster'),
      fix: [
        'Measure first: compare each partition’s replica list with the rack of each broker (<code>broker.rack</code>) to find partitions with all replicas in one rack.',
        'Fix: set <code>broker.rack</code> on every broker to its zone and restart them in a rolling fashion.',
        'Fix: new topics follow rack-aware placement automatically; move existing partitions with a throttled reassignment.',
        'Trade-off: cross-zone replication costs network and adds follower latency; consumers may fetch across zones unless rack-aware fetching is configured.',
        'Verify: no partition has all replicas in one rack, and a zone-failure test keeps every partition online.'
      ]
    }
  ],
  source: { label: 'Original: Partition Reassignment and Placement', href: '01-kafka-internals-end-to-end.html#ch6' },
  scenarios: [
    {
      id: 'throttle',
      label: 'Unthrottled vs throttled',
      desc: 'The same move with and without --throttle. The throttle leaves bandwidth for producers while the copy runs.',
      codeLabel: 'Command',
      code: {
        bug: [
          'kafka-reassign-partitions.sh --bootstrap-server broker:9092 --reassignment-json-file plan.json --execute',
          '# no --throttle: the copy takes all the bandwidth it can',
          '# 3 TB copied to brokers 4-6 at full speed',
          '# produce p99: 8 ms to 900 ms (illustrative)'
        ],
        fix: [
          'kafka-reassign-partitions.sh --bootstrap-server broker:9092 --reassignment-json-file plan.json --execute --throttle 50000000',
          '# --throttle caps replication in bytes/s (value illustrative)',
          '# clients keep their bandwidth; p99 stays flat',
          'kafka-reassign-partitions.sh --bootstrap-server broker:9092 --reassignment-json-file plan.json --verify'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'plan', x: 10, y: 115, w: 150, h: 60, t: 'Reassign plan', s: 'plan.json' },
          { id: 'ctl', x: 230, y: 115, w: 170, h: 60, t: 'Controller', s: 'replica set' },
          { id: 'new', x: 450, y: 20, w: 170, h: 60, t: 'New brokers 4-6', s: 'fetch the full log' },
          { id: 'old', x: 450, y: 210, w: 170, h: 60, t: 'Old replicas', s: 'dropped last' }
        ],
        edges: [
          { id: 'e1', a: 'plan', b: 'ctl', label: 'execute' },
          { id: 'e2', a: 'ctl', b: 'new', label: 'copy' },
          { id: 'e3', a: 'ctl', b: 'old', label: 'drop last' }
        ]
      },
      bug: [
        { log: 'The operator runs the plan with --execute and no throttle.', code: 0, hl: { nodes: { plan: 'on' }, edges: { e1: 'on' } } },
        { log: 'The new replicas fetch the full log at full speed, on the same network as the producers.', code: 1, hl: { nodes: { new: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'broker 1 NIC', v: '95% (illustrative)', cls: 'bad' }] },
        { log: 'Followers fall out of the ISR, and producers see timeouts while the copy runs.', code: 2, hl: { nodes: { ctl: 'warn' } } },
        { log: 'When the move ends, the new brokers hold data, but the copy has cost the cluster its latency budget.', code: 3, stats: [{ l: 'produce p99', v: '900 ms (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The same plan runs with --throttle, which caps the copy in bytes per second.', code: 0, hl: { nodes: { plan: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'The new replica catches up within the cap, and the old replica is dropped after it.', code: 2, hl: { nodes: { new: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'Client p99 stays flat. Running --verify reports completion and removes the throttle.', code: 3, hl: { nodes: { old: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'produce p99', v: '8 ms (illustrative)', cls: 'ok' }] }
      ]
    },
    {
      id: 'skew',
      label: 'Leaders after restarts',
      desc: 'Leadership does not return to the preferred replica after restarts, so brokers 1 and 2 carry most of the leaders.',
      codeLabel: 'Command',
      code: {
        bug: [
          'kafka-topics.sh --bootstrap-server broker:9092 --describe --topic orders',
          'Topic: orders  Partition: 0  Leader: 1  Replicas: 3,1,2  Isr: 3,1,2',
          '# preferred leader is 3, but broker 1 leads',
          '# leaders on broker 1: 45 of 60 (illustrative)'
        ],
        fix: [
          'kafka-leader-election.sh --bootstrap-server broker:9092 --election-type PREFERRED --all-topic-partitions',
          '# each partition moves back to its first replica',
          '# leaders per broker: about 20 each (illustrative)',
          '# auto.leader.rebalance.enable=true keeps it that way'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'b1', x: 230, y: 20, w: 170, h: 60, t: 'Broker 1', s: 'leads 45 of 60' },
          { id: 'b2', x: 230, y: 115, w: 170, h: 60, t: 'Broker 2', s: 'leads 10 of 60' },
          { id: 'b3', x: 230, y: 210, w: 170, h: 60, t: 'Broker 3', s: 'leads 5 of 60' },
          { id: 'el', x: 450, y: 115, w: 170, h: 60, t: 'Preferred election', s: 'first replica wins' }
        ],
        edges: [
          { id: 'e1', a: 'el', b: 'b1', label: 'move back' },
          { id: 'e2', a: 'el', b: 'b2', label: 'move back' },
          { id: 'e3', a: 'el', b: 'b3', label: 'move back' }
        ]
      },
      bug: [
        { log: 'After rolling restarts, each partition’s leader is whichever replica is in the ISR, so broker 1 keeps most leaders.', code: 2, hl: { nodes: { b1: 'bad' } }, stats: [{ l: 'leaders on broker 1', v: '45 of 60', cls: 'bad' }] },
        { log: 'The describe output shows Leader 1, although the first entry of Replicas is 3.', code: 1, hl: { nodes: { b3: 'warn' } } },
        { log: 'Broker 3 leads only a few partitions and sits mostly idle, while broker 1 carries the load.', code: 3, hl: { nodes: { b3: 'dim' } }, stats: [{ l: 'leaders on broker 3', v: '5 of 60', cls: 'warn' }] }
      ],
      fix: [
        { log: 'A preferred leader election runs for all partitions, off-peak on large clusters.', code: 0, hl: { nodes: { el: 'ok' }, edges: { e1: 'ok', e2: 'ok', e3: 'ok' } } },
        { log: 'Each partition moves back to its first replica, which spreads leaders across the brokers.', code: 1, hl: { nodes: { b1: 'ok', b2: 'ok', b3: 'ok' } } },
        { log: 'Leaders per broker are about equal, and the busiest broker’s CPU drops.', code: 2, hl: { nodes: { b1: 'ok' } }, stats: [{ l: 'leaders per broker', v: 'about 20 each (illustrative)', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Consumer Offsets and Commits',
  problem: `Twelve teams read <code>orders</code>, each in its own consumer group. Billing polls batches of 500 records, writes invoices to a database, and runs with defaults, so <code>enable.auto.commit=true</code> with a 5-second interval. A pod is OOM-killed in the middle of a batch. After the restart some orders have no invoice, while another service produced duplicates.`,
  predict: {
    q: `A consumer commits the offset of a batch before processing it and then crashes halfway through the batch. After the restart, the unprocessed records are:`,
    opts: [
      `Reprocessed, because the group replays the batch`,
      `Delivered to another group instead`,
      `Skipped, because the committed offset is already past them`
    ],
    ans: 2,
    why: `A restart resumes from the committed offset. Committing first moves it past records that were never processed, which is at-most-once.`
  },
  explain: `<h3>The idea</h3>
<p>Reading does not delete records. Each consumer group keeps its own committed position for each partition, so twelve teams can read the same topic independently. After a crash, a restart resumes from the committed position, and that one number decides what is repeated and what is skipped.</p>
<h3>How it works, step by step</h3>
<p><b>Reading does not delete.</b> Every group has its own committed offset per partition.</p>
<p><b>Position and commit.</b> The fetch position moves forward as <code>poll()</code> returns records. The committed offset is the value a restart resumes from.</p>
<p><b>Where it lives.</b> Commits are stored as records in the internal compacted topic <code>__consumer_offsets</code>, keyed by group, topic and partition.</p>
<p><b>Commit placement.</b> Committing before processing gives at-most-once delivery. Committing after processing gives at-least-once. <code>enable.auto.commit</code> with <code>auto.commit.interval.ms</code> commits on a timer inside <code>poll()</code>, whatever has finished.</p>
<p><b>No committed offset.</b> <code>auto.offset.reset</code> (<code>latest</code> by default, or <code>earliest</code> or <code>none</code>) decides where a new group starts.</p>
<h3>The trade-off</h3>
<p>Committing after processing means a crash repeats recent work, so the processing has to be idempotent. Committing more often reduces repeats, but it sends more commit requests.</p>`,
  diagnose: [
    {
      t: 'Commit placement',
      sym: 'After a restart, either some records were never processed, or the last few are processed twice.',
      ctx: 'A consumer crashes in the middle of a batch. Whether work is lost or repeated depends on when it committed offsets.',
      why: 'A restart resumes from the committed offset. Committing before processing gives at-most-once (a crash skips records); committing after gives at-least-once (a crash repeats everything since the last commit). Auto-commit can commit offsets of records that have not finished processing.',
      log: `-- representative output, values illustrative
enable.auto.commit=true, auto.commit.interval.ms=5000
kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group billing
  CURRENT-OFFSET ahead of or behind the real progress`,
      note: 'Documented configs and CLI; the exact offsets depend on timing. Source: ' + KL(KDOC + 'consumerconfigs', 'Consumer configs'),
      fix: [
        'Measure first: compare <code>CURRENT-OFFSET</code> from <code>kafka-consumer-groups.sh --describe</code> with the application’s real progress after a crash.',
        'Fix: disable auto-commit for work with side effects and commit after processing succeeds.',
        'Fix: make processing idempotent (a dedupe key or an upsert) so a replay is harmless; for Kafka-to-Kafka pipelines commit the offset inside a transaction with the output.',
        'Trade-off: committing more often reduces duplicates but costs more commit requests; at-least-once always needs an idempotent consumer.',
        'Verify: crash a consumer mid-batch, then check that no offset is skipped and any repeat is absorbed by idempotent processing.'
      ]
    },
    {
      t: 'Async + auto-commit',
      sym: 'The group shows zero lag, yet after a crash a few hundred records were never processed.',
      ctx: 'The consumer hands each polled record to a worker pool and returns to <code>poll()</code> quickly. Auto-commit is on.',
      why: 'Auto-commit commits the offsets returned by earlier <code>poll()</code> calls, not the work that finished. When processing is asynchronous, the committed offset runs ahead of completed work, and a crash loses whatever was still queued.',
      log: `-- representative output, values illustrative
kafka-consumer-groups.sh --describe --group billing
  CURRENT-OFFSET 1500  LOG-END-OFFSET 1500  LAG 0
application: 412 records still in the worker queue`,
      note: 'The tool reports committed progress; it cannot see the application queue. Source: ' + KL(KDOC + 'consumerconfigs', 'Consumer configs'),
      fix: [
        'Measure first: compare the group’s committed offset with the number of records the application has fully processed.',
        'Fix: set <code>enable.auto.commit=false</code> and call <code>commitSync</code> or <code>commitAsync</code> with the offsets of work that has completed.',
        'Fix: track completed offsets per partition, and use <code>pause()</code> and <code>resume()</code> to bound the queue while still calling <code>poll()</code>.',
        'Trade-off: a manual commit path is more code, and out-of-order completion means you can commit only the contiguous prefix.',
        'Verify: after a forced crash, no record is missing and any replays are handled by idempotent processing.'
      ]
    },
    {
      t: 'Reset = latest',
      sym: 'A new consumer group starts, shows no errors, and processes none of the 4 million historical events.',
      ctx: 'A team creates group <code>invoice-v2</code> to rebuild a table from <code>orders</code>. The client keeps the default <code>auto.offset.reset=latest</code>.',
      why: 'A group with no committed offset starts at the position given by <code>auto.offset.reset</code>. <code>latest</code> means the log end at the time of the first fetch, so everything before it is ignored without any error. <code>earliest</code> replays from the start, and <code>none</code> throws an exception.',
      log: `-- representative output, wording varies by version
kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group invoice-v2
Consumer group 'invoice-v2' has no active members.
(auto.offset.reset=none) NoOffsetForPartitionException: Undefined offset with no reset policy for partitions: [orders-0]`,
      note: 'The second line is what a client with <code>auto.offset.reset=none</code> reports for a group without a committed offset. Source: ' + KL(KDOC + 'consumerconfigs', 'Consumer configs'),
      fix: [
        'Measure first: check whether the group has committed offsets (<code>kafka-consumer-groups.sh --describe</code>) and what <code>auto.offset.reset</code> the client uses.',
        'Fix: set <code>auto.offset.reset=earliest</code> for groups that must read history, or set <code>none</code> to fail fast and decide explicitly.',
        'Fix: to start from a chosen point, reset offsets with <code>kafka-consumer-groups.sh --reset-offsets</code> while the group is inactive.',
        'Trade-off: <code>earliest</code> can cause a large replay load and duplicates in downstream systems; <code>latest</code> is right for groups that only care about new events.',
        'Verify: lag for the new group starts at the backlog size and falls as it catches up.'
      ]
    }
  ],
  source: { label: 'Original: Consumer Offsets and Commits', href: '01-kafka-internals-end-to-end.html#ch7' },
  scenarios: [
    {
      id: 'commit',
      label: 'Commit before or after',
      desc: 'Committing before processing skips the records after a crash. Committing after processing repeats them, which an idempotent write absorbs.',
      codeLabel: 'Config',
      code: {
        bug: [
          'enable.auto.commit=true',
          'auto.commit.interval.ms=5000',
          '# batch of 500 polled; offsets 3-5 not yet written to the database',
          '# the timer commits past them before the batch finishes',
          '# crash after offset 2: restart resumes at committed 6, offsets 3-5 skipped'
        ],
        fix: [
          'enable.auto.commit=false',
          '# process the batch and write the invoices first',
          'consumer.commitSync()  # only after processing succeeds',
          '# crash before commit: offsets 3-5 replay, an idempotent upsert absorbs them'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'log', x: 10, y: 115, w: 150, h: 60, t: 'Partition log', s: 'offsets 0 to N' },
          { id: 'cons', x: 230, y: 115, w: 170, h: 60, t: 'Consumer', s: 'fetch position' },
          { id: 'proc', x: 450, y: 20, w: 170, h: 60, t: 'Process batch', s: 'write invoices' },
          { id: 'off', x: 450, y: 210, w: 170, h: 60, t: '__consumer_offsets', s: 'committed offset' }
        ],
        edges: [
          { id: 'e1', a: 'log', b: 'cons', label: 'poll' },
          { id: 'e2', a: 'cons', b: 'proc', label: 'process' },
          { id: 'e3', a: 'cons', b: 'off', label: 'commit' }
        ]
      },
      bug: [
        { log: 'The consumer polls a batch of 500 records. Its position moves to the end of that batch.', code: 2, hl: { nodes: { log: 'on', cons: 'on' }, edges: { e1: 'on' } } },
        { log: 'The auto-commit timer runs every 5 s and commits the offset of the batch it has polled.', code: 3, hl: { nodes: { off: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'committed', v: 'before processing', cls: 'bad' }] },
        { log: 'The process crashes after offset 2. Invoices for offsets 3 to 5 were never written.', code: 4, hl: { nodes: { proc: 'bad' }, edges: { e2: 'dim' } }, stats: [{ l: 'restart resumes at', v: 'committed offset 6', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Auto-commit is off, so the offset does not move on a timer.', code: 0, hl: { nodes: { cons: 'ok' } }, stats: [{ l: 'enable.auto.commit', v: 'false', cls: 'ok' }] },
        { log: 'The batch is processed first, and its invoices are written.', code: 1, hl: { nodes: { proc: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'Only then is the offset committed. A crash before that replays offsets 3 to 5, which an idempotent write absorbs.', code: 2, hl: { nodes: { off: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'duplicate invoices', v: '0 (idempotent upsert)', cls: 'ok' }] }
      ]
    },
    {
      id: 'reset',
      label: 'New group, latest reset',
      desc: 'A new group with auto.offset.reset=latest starts at the log end, so the 4 million historical events are never read.',
      codeLabel: 'Command',
      code: {
        bug: [
          'kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group invoice-v2',
          "Consumer group 'invoice-v2' has no active members.",
          'auto.offset.reset=latest  # default in this client',
          '# no committed offset: start at the log end',
          '# 4,000,000 historical events are never read'
        ],
        fix: [
          'auto.offset.reset=earliest  # for a rebuild from history',
          '# or auto.offset.reset=none to fail fast instead',
          'kafka-consumer-groups.sh --bootstrap-server broker:9092 --group invoice-v2 --reset-offsets --to-earliest --all-topics --execute',
          '# lag starts at the backlog size and falls'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'grp', x: 10, y: 115, w: 170, h: 60, t: 'Group invoice-v2', s: 'no committed offset' },
          { id: 'end', x: 300, y: 20, w: 170, h: 60, t: 'Log end', s: 'latest: skip backlog' },
          { id: 'start', x: 300, y: 210, w: 170, h: 60, t: 'Log start', s: 'earliest: replay' },
          { id: 'res', x: 500, y: 115, w: 130, h: 60, t: 'Records read', s: '0 or 4M' }
        ],
        edges: [
          { id: 'e1', a: 'grp', b: 'end', label: 'latest' },
          { id: 'e2', a: 'grp', b: 'start', label: 'earliest' },
          { id: 'e3', a: 'start', b: 'res', label: 'replay 4M' }
        ]
      },
      bug: [
        { log: 'The new group has no committed offset, so the client falls back to auto.offset.reset=latest.', code: 2, hl: { nodes: { grp: 'warn' }, edges: { e1: 'bad' } } },
        { log: 'The group starts at the log end, which is the position after the newest event.', code: 3, hl: { nodes: { end: 'bad' } }, stats: [{ l: 'start offset', v: 'log end', cls: 'bad' }] },
        { log: 'The 4 million historical events are never fetched. There is no error, only a quiet gap.', code: 4, hl: { nodes: { res: 'bad' } }, stats: [{ l: 'backlog read', v: '0 of 4M', cls: 'bad' }] }
      ],
      fix: [
        { log: 'For a rebuild, the client sets auto.offset.reset=earliest, so the group starts at the log start.', code: 0, hl: { nodes: { start: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'Or the offsets of the inactive group are reset to the earliest offset before it starts.', code: 2, hl: { nodes: { grp: 'ok' } } },
        { log: 'The group replays the backlog. Lag starts at its size and falls as the group catches up.', code: 3, hl: { nodes: { res: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'backlog read', v: '4M of 4M (illustrative)', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Consumer Groups and Rebalance',
  problem: `Group <code>fulfilment</code> has six consumers on a six-partition topic. Each consumer calls a slow partner API for every record, and a few batches take several minutes (illustrative). Consumption stops for about 30 s every few minutes and lag keeps climbing, while the brokers are healthy and the consumer logs say the member left after its poll timeout expired.`,
  predict: {
    q: `Processing one polled batch takes longer than <code>max.poll.interval.ms</code>. What happens?`,
    opts: [
      `Nothing, because heartbeats keep the member alive`,
      `The member is removed from the group and a rebalance starts`,
      `The broker closes the connection and commits the batch`
    ],
    ans: 1,
    why: `Heartbeats run on a background thread, but the group also requires <code>poll()</code> to be called within <code>max.poll.interval.ms</code>. If not, the member leaves the group and its partitions are reassigned.`
  },
  explain: `<h3>The idea</h3>
<p>Each partition must be owned by exactly one live member, so any change in membership forces a new assignment. Kafka detects liveness with two clocks, one for heartbeats and one for <code>poll()</code> calls. The design goal is to keep each reassignment small and rare.</p>
<h3>How it works, step by step</h3>
<p><b>Group coordinator.</b> One broker per group tracks its members, runs <code>JoinGroup</code> and <code>SyncGroup</code>, and increments the generation on every membership change.</p>
<p><b>Two liveness clocks.</b> Heartbeats must reach the coordinator within <code>session.timeout.ms</code> (45 s by default). <code>poll()</code> must be called within <code>max.poll.interval.ms</code> (5 minutes by default). <code>max.poll.records</code> bounds how much work fits between polls.</p>
<p><b>Eager versus cooperative.</b> An eager rebalance revokes every partition first. <code>CooperativeStickyAssignor</code> (KIP-429) moves only the partitions that change owner.</p>
<p><b>Static membership.</b> <code>group.instance.id</code> (KIP-345) lets a restarted member reclaim its partitions without a rebalance, if it returns within <code>session.timeout.ms</code>.</p>
<p><b>Parallelism limit.</b> A partition belongs to one member at a time, so members beyond the partition count sit idle.</p>
<h3>The trade-off</h3>
<p>A longer <code>max.poll.interval.ms</code> means a truly stuck consumer is detected later. Static membership keeps a member’s partitions unread until <code>session.timeout.ms</code> expires if the member really is gone.</p>`,
  diagnose: [
    {
      t: 'Rebalance storm',
      sym: 'Group members repeatedly leave and rejoin; throughput collapses and lag climbs.',
      ctx: 'Consumers process each polled batch with slow downstream calls. One batch occasionally takes longer than <code>max.poll.interval.ms</code>.',
      why: 'If <code>poll()</code> is not called again within <code>max.poll.interval.ms</code>, the member is removed and its partitions are reassigned. It rejoins, receives the same slow work, times out again, and the group never settles. Heartbeats run on a separate thread and do not prevent this.',
      log: `-- representative output, wording varies by client version
Member consumer-fulfilment-1 sending LeaveGroup request to coordinator ... due to consumer poll timeout has expired.
CommitFailedException: ... the group has already rebalanced and assigned the partitions to another member.
consumer-coordinator-metrics: rebalance-total increasing`,
      note: 'Representative client messages and a documented coordinator metric; exact wording varies by client version. Source: ' + KL(KIP + 'KIP-429%3A+Kafka+Consumer+Incremental+Rebalance+Protocol', 'KIP-429 · incremental rebalance'),
      fix: [
        'Measure first: watch <code>rebalance-total</code> and the time between <code>poll()</code> calls against <code>max.poll.interval.ms</code>.',
        'Fix: lower <code>max.poll.records</code> so a batch finishes comfortably inside the interval, or raise <code>max.poll.interval.ms</code>.',
        'Fix: move slow work to a worker pool and use <code>pause()</code> and <code>resume()</code> while keeping <code>poll()</code> running; use <code>CooperativeStickyAssignor</code> so only moved partitions pause.',
        'Trade-off: a longer <code>max.poll.interval.ms</code> also delays detection of a genuinely stuck consumer; static membership delays reassignment until <code>session.timeout.ms</code> expires.',
        'Verify: <code>rebalance-total</code> stays flat while lag drains, and no poll-timeout lines appear.'
      ]
    },
    {
      t: 'Idle consumers',
      sym: 'Adding consumers does not reduce lag; two of the six instances sit idle.',
      ctx: 'Lag is growing, so the team scales the consumer group from 4 to 6 instances. The topic has 4 partitions.',
      why: 'Within a group a partition is read by one member at a time. Parallelism is capped by the partition count, so extra members get nothing.',
      log: `-- representative output, values illustrative
kafka-consumer-groups.sh --describe --group fulfilment
  partitions p0-p3 each owned by one member; two members with no assignment`,
      note: 'Documented CLI; the assignment shown is an illustration. Source: ' + KL(KDOC + 'consumerconfigs', 'Consumer configs'),
      fix: [
        'Measure first: check that members do not outnumber partitions and that the per-partition consumer is the bottleneck.',
        'Fix: if more parallelism is needed, create a topic with more partitions (see the key-order trade-off in Partitioning and Keys) and migrate.',
        'Fix: otherwise make each consumer faster by batching downstream calls or parallelising inside the member while keeping order by key.',
        'Trade-off: more partitions raise open files, replication work and recovery time, and can break per-key order if added later.',
        'Verify: every group member owns at least one partition and total lag falls.'
      ]
    },
    {
      t: 'Rolling deploys',
      sym: 'Every deployment causes a series of short consumption stalls and a lag spike.',
      ctx: 'The service runs six consumers on Kubernetes. A rolling update replaces one pod at a time, and each pod stops and starts again within about 10 s (illustrative).',
      why: 'Without static membership, a stopping member leaves the group and the new pod joins as a new member, so each pod causes two rebalances. With the eager assignor every rebalance revokes every partition of every member.',
      log: `-- representative output, wording varies by version
INFO [GroupCoordinator 2]: Preparing to rebalance group fulfilment in state PreparingRebalance with old generation 41 (reason: Removing member consumer-1 on LeaveGroup)
INFO [GroupCoordinator 2]: Preparing to rebalance group fulfilment in state PreparingRebalance with old generation 42 (reason: Adding new member consumer-1 with group instance id None)`,
      note: 'Broker-side coordinator log; the wording and generation numbers are illustrative. Source: ' + KL(KIP + 'KIP-345%3A+Introduce+static+membership+protocol+to+reduce+consumer+rebalances', 'KIP-345 · static membership'),
      fix: [
        'Measure first: count rebalances per deployment with <code>rebalance-total</code> and the coordinator logs.',
        'Fix: set a stable <code>group.instance.id</code> per pod (for example from a StatefulSet ordinal) so a quick restart keeps its partitions.',
        'Fix: use <code>CooperativeStickyAssignor</code>, and keep the restart time well below <code>session.timeout.ms</code>.',
        'Trade-off: with static membership a member that is really gone keeps its partitions until <code>session.timeout.ms</code> expires, so they stay unread for that long.',
        'Verify: a rolling deployment produces no rebalances, and lag stays flat.'
      ]
    }
  ],
  source: { label: 'Original: Consumer Groups and Rebalance', href: '01-kafka-internals-end-to-end.html#ch8' },
  scenarios: [
    {
      id: 'poll',
      label: 'Slow batch past poll limit',
      desc: 'A batch that runs past max.poll.interval.ms removes the member. The group reassigns its partitions, and the same slow batch comes back.',
      codeLabel: 'Config',
      code: {
        bug: [
          'max.poll.interval.ms=300000  # default 5 minutes',
          '# one poll() batch takes 6 min (illustrative)',
          '# no poll() within the interval: the member is removed',
          'Member consumer-fulfilment-1 sending LeaveGroup request to coordinator ... due to consumer poll timeout has expired.',
          '# rejoin, the same slow batch, and the timeout again'
        ],
        fix: [
          'max.poll.records=100  # illustrative value',
          'partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor',
          '# poll() every ~20 s, inside the interval',
          '# rebalance-total stays flat; lag drains'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'cons', x: 10, y: 115, w: 150, h: 60, t: 'Consumer', s: 'one slow batch' },
          { id: 'coord', x: 230, y: 115, w: 170, h: 60, t: 'Group coordinator', s: 'generation N' },
          { id: 'reb', x: 450, y: 20, w: 170, h: 60, t: 'Rebalance', s: 'revoke and reassign' },
          { id: 'back', x: 450, y: 210, w: 170, h: 60, t: 'Rejoin', s: 'same slow batch' }
        ],
        edges: [
          { id: 'e1', a: 'cons', b: 'coord', label: 'poll timeout' },
          { id: 'e2', a: 'coord', b: 'reb', label: 'new generation' },
          { id: 'e3', a: 'reb', b: 'back', label: 'rejoin' }
        ]
      },
      bug: [
        { log: 'One polled batch takes about 6 minutes (illustrative) inside a slow partner call.', code: 1, hl: { nodes: { cons: 'bad' } } },
        { log: 'poll() is not called within max.poll.interval.ms, so the coordinator removes the member.', code: 2, hl: { nodes: { coord: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'poll gap', v: '> 5 min', cls: 'bad' }] },
        { log: 'A rebalance starts and the partitions are reassigned. The member rejoins and receives the same slow batch.', code: 3, hl: { nodes: { reb: 'warn', back: 'bad' }, edges: { e2: 'on', e3: 'on' } }, stats: [{ l: 'rebalances', v: 'repeating', cls: 'bad' }] },
        { log: 'The group never settles, and lag keeps climbing.', code: 4, stats: [{ l: 'lag', v: 'climbing', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Smaller polls mean each batch finishes well inside the interval.', code: 0, hl: { nodes: { cons: 'ok' } }, stats: [{ l: 'poll gap', v: 'about 20 s (illustrative)', cls: 'ok' }] },
        { log: 'Cooperative assignment moves only the partitions that change owner.', code: 1, hl: { nodes: { reb: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'The group settles, no rebalance starts, and lag drains.', code: 3, hl: { nodes: { coord: 'ok' } }, stats: [{ l: 'rebalance-total', v: 'flat', cls: 'ok' }] }
      ]
    },
    {
      id: 'idle',
      label: 'More members than partitions',
      desc: 'A six-member group on a four-partition topic leaves two members with no work, and lag keeps growing.',
      codeLabel: 'Command',
      code: {
        bug: [
          'kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group fulfilment',
          '# 4 partitions p0 to p3, one owner each',
          '# 6 members: C5 and C6 have no assignment',
          '# lag still grows: 4 members do all the work'
        ],
        fix: [
          '# create a topic with more partitions (migrate with the key-order rules)',
          '# 12 partitions: 6 members own 2 each',
          '# every member has work and total lag falls'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'topic', x: 10, y: 115, w: 150, h: 60, t: 'Topic', s: '4 partitions' },
          { id: 'c14', x: 230, y: 20, w: 170, h: 60, t: 'Members C1 to C4', s: 'one partition each' },
          { id: 'c56', x: 230, y: 210, w: 170, h: 60, t: 'Members C5 and C6', s: 'no assignment' },
          { id: 'lag', x: 450, y: 115, w: 170, h: 60, t: 'Lag', s: 'still growing' }
        ],
        edges: [
          { id: 'e1', a: 'topic', b: 'c14', label: 'owns' },
          { id: 'e2', a: 'topic', b: 'c56', label: 'none' },
          { id: 'e3', a: 'c14', b: 'lag', label: 'backlog' }
        ]
      },
      bug: [
        { log: 'Four partitions are assigned to members C1 to C4, one partition each.', code: 1, hl: { nodes: { c14: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'C5 and C6 get no partition, so they poll an empty assignment.', code: 2, hl: { nodes: { c56: 'bad' }, edges: { e2: 'dim' } } },
        { log: 'Adding members did not add parallelism, and lag keeps growing.', code: 3, hl: { nodes: { lag: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'busy members', v: '4 of 6', cls: 'warn' }] }
      ],
      fix: [
        { log: 'A topic is created with more partitions, and the data is migrated with the key-order rules in mind.', code: 0, hl: { nodes: { topic: 'ok' } } },
        { log: 'Twelve partitions give each of the six members two partitions.', code: 1, hl: { nodes: { c14: 'ok', c56: 'ok' }, edges: { e1: 'ok', e2: 'ok' } } },
        { log: 'Every member has work, and the total lag falls.', code: 2, hl: { nodes: { lag: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'busy members', v: '6 of 6', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Retention, Tiered Storage and Compaction',
  problem: `The <code>orders</code> topic keeps <code>retention.ms</code> at 3 days (illustrative), and a latest-price topic uses <code>cleanup.policy=compact</code>. On Monday the disks of three brokers are at 95% (illustrative). A consumer group stopped over the weekend fails with an out-of-range error on restart, and a downstream table still shows a product deleted last week.`,
  predict: {
    q: `<code>retention.ms</code> is 1 day, but the active segment has been open for 5 days. Is the data in it deleted?`,
    opts: [
      `No: only closed segments are deleted, and the active one is not closed yet`,
      `Yes, anything older than a day is removed`,
      `Yes, but only after every consumer has read it`
    ],
    ans: 0,
    why: `The broker deletes whole segments, and never the active one. A quiet partition can keep old data until <code>segment.ms</code> or <code>segment.bytes</code> rolls the segment.`
  },
  explain: `<h3>The idea</h3>
<p>Storage is finite, but readers arrive at their own pace. The log therefore needs a forgetting rule that works in whole segments and does not wait for readers. Kafka either deletes data by age or size, or it compacts a topic down to the latest value for each key.</p>
<h3>How it works, step by step</h3>
<p><b>Delete policy.</b> The broker deletes closed segments whose newest record is older than <code>retention.ms</code>, or the oldest segments when a partition exceeds <code>retention.bytes</code>. That limit applies per partition.</p>
<p><b>Segment roll decides eligibility.</b> <code>segment.ms</code> and <code>segment.bytes</code> decide when the active segment closes, and only closed segments can be deleted.</p>
<p><b>Compaction.</b> With <code>cleanup.policy=compact</code>, the log cleaner keeps the last value for each key. <code>min.cleanable.dirty.ratio</code> and <code>min.compaction.lag.ms</code> control when it runs. A null value is a tombstone, kept for <code>delete.retention.ms</code>.</p>
<p><b>Readers are not consulted.</b> A consumer whose offset is below the log start offset gets <code>OFFSET_OUT_OF_RANGE</code>, and <code>auto.offset.reset</code> then applies.</p>
<p><b>Tiered storage (KIP-405).</b> With <code>remote.log.storage.system.enable=true</code> on the brokers and <code>remote.storage.enable=true</code> on a topic, closed segments are copied to remote storage. <code>local.retention.ms</code> limits what stays on local disks.</p>
<h3>The trade-off</h3>
<p>Longer retention costs disk, or remote storage, and it makes recovery and replay slower. Tiered storage keeps history readable, but old data is read at higher latency.</p>`,
  diagnose: [
    {
      t: 'Behind retention',
      sym: 'On restart the consumer fails to fetch, then either skips a large range of events or reprocesses the whole topic.',
      ctx: 'A consumer group is stopped for a weekend while the topic keeps <code>retention.ms</code> at 3 days.',
      why: 'Retention deletes whole closed segments by time or size and ignores consumers. The log start offset moves forward past the group’s committed offset, so that offset no longer exists. The client then applies <code>auto.offset.reset</code>.',
      log: `-- representative output, wording varies by client version
OffsetOutOfRangeException: Fetch position FetchPosition{offset=3, ...} is out of range for partition orders-0
auto.offset.reset = latest | earliest`,
      note: 'Representative client message; the broker-side error is OFFSET_OUT_OF_RANGE. Source: ' + KL(KDOC + 'topicconfigs', 'Topic configs'),
      fix: [
        'Measure first: compare each group’s committed offset with the partition’s log start offset, and compare lag with retention.',
        'Fix: alert on consumer lag measured against retention, not just absolute lag, and scale or fix the slow consumer so it keeps up.',
        'Fix: raise <code>retention.ms</code> or <code>retention.bytes</code>, or use tiered storage so older history stays readable.',
        'Fix: choose <code>auto.offset.reset</code> deliberately: <code>latest</code> skips data, <code>earliest</code> reprocesses it.',
        'Trade-off: longer retention costs disk (or remote storage) and recovery time; tiered storage reads old data at higher latency.',
        'Verify: committed offsets stay above the log start offset and no OffsetOutOfRangeException occurs after a long pause.'
      ]
    },
    {
      t: 'Tombstone purged',
      sym: 'A deleted customer is still present in one downstream table that never saw the delete.',
      ctx: 'A compacted changelog holds one row per customer. A consumer rebuilding its table pauses for hours, and customer k1 is deleted meanwhile.',
      why: 'Compaction keeps the latest value per key and writes a delete as a tombstone (null value). The cleaner removes the tombstone itself after <code>delete.retention.ms</code>. A consumer that read the old value but not the tombstone keeps the key forever.',
      log: `-- representative output, values illustrative
cleanup.policy=compact, delete.retention.ms=86400000 (24 h)
consumer position is older than the purge time of the tombstone for key k1`,
      note: 'Documented topic configs; the scenario is a timing pattern, not a log line. Source: ' + KL(KDOC + 'compaction', 'Log compaction'),
      fix: [
        'Measure first: compare the consumer’s position age with <code>delete.retention.ms</code>.',
        'Fix: set <code>delete.retention.ms</code> longer than the worst-case time a consumer takes to read the log from start to end.',
        'Fix: alert on consumers whose position is older than <code>delete.retention.ms</code>; if a table is already wrong, rebuild it by re-reading the compacted topic from the beginning.',
        'Trade-off: longer tombstone retention keeps deleted keys’ markers (and any personal data in the key) in the log for longer and delays space reclaim slightly.',
        'Verify: a consumer paused longer than the old value still ends with the deleted key removed.'
      ]
    },
    {
      t: 'Disk fills',
      sym: 'Broker disks approach 100% and log directories go offline even though retention is configured.',
      ctx: 'A topic sets <code>retention.bytes=100 GiB</code>, thinking of it as a cap for the topic, on 24 partitions with replication factor 3.',
      why: '<code>retention.bytes</code> applies per partition, not per topic: the cap is 100 GiB × 24 partitions × 3 replicas. Retention also only deletes closed segments, so a slow partition can hold old data until its active segment rolls (<code>segment.ms</code> or <code>segment.bytes</code>).',
      log: `-- representative output, values illustrative
df: data volume > 90%
kafka.log:type=LogManager,name=OfflineLogDirectoryCount > 0`,
      note: 'An OS command and a documented broker metric; the numbers are illustrative. Source: ' + KL(KDOC + 'topicconfigs', 'Topic configs'),
      fix: [
        'Measure first: compute capacity as partitions × replicas × per-partition limit and compare it with real disk.',
        'Fix: lower <code>retention.bytes</code> or <code>retention.ms</code> to match the disk budget, or add brokers or disks.',
        'Fix: set <code>segment.ms</code> so quiet partitions roll and become deletable; alert early (for example at 70 to 80%) and consider tiered storage for long history.',
        'Trade-off: shorter retention shrinks the replay window for slow or new consumers; more disks or tiered storage cost money and add operational surface.',
        'Verify: disk usage per broker settles below the alert threshold and no log directory goes offline.'
      ]
    }
  ],
  source: { label: 'Original: Retention, Tiered Storage and Compaction', href: '01-kafka-internals-end-to-end.html#ch9' },
  scenarios: [
    {
      id: 'retain',
      label: 'Retention vs slow reader',
      desc: 'Retention deletes closed segments on time. A stopped group whose committed offset is now below the log start fails when it restarts.',
      codeLabel: 'Config',
      code: {
        bug: [
          'retention.ms=259200000  # 3 days (illustrative)',
          '# group stopped over the weekend, committed offset = 3',
          '# segments 0-5 deleted by retention; log start offset = 6',
          'OffsetOutOfRangeException: Fetch position FetchPosition{offset=3, ...} is out of range for partition orders-0'
        ],
        fix: [
          'retention.ms=604800000  # longer window (illustrative)',
          '# or tiered storage: remote.storage.enable=true on the topic',
          'auto.offset.reset=earliest  # reprocess from the log start',
          '# committed offsets stay above the log start offset'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'old', x: 10, y: 20, w: 180, h: 60, t: 'Segments 0 to 5', s: 'deleted by retention' },
          { id: 'new', x: 10, y: 210, w: 180, h: 60, t: 'Segments 6 on', s: 'kept, log start = 6' },
          { id: 'grp', x: 250, y: 115, w: 170, h: 60, t: 'Stopped group', s: 'committed offset 3' },
          { id: 'err', x: 460, y: 115, w: 170, h: 60, t: 'OffsetOutOfRange', s: 'offset 3 is gone' }
        ],
        edges: [
          { id: 'e1', a: 'grp', b: 'err', label: 'fetch at 3' },
          { id: 'e2', a: 'new', b: 'grp', label: 'log start 6' },
          { id: 'e3', a: 'old', b: 'new', label: 'retention' }
        ]
      },
      bug: [
        { log: 'Retention deletes segments 0 to 5 because they are older than the window. The log start offset moves to 6.', code: 0, hl: { nodes: { old: 'bad', new: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'log start', v: '6', cls: 'warn' }] },
        { log: 'The stopped group still points at committed offset 3, which no longer exists.', code: 2, hl: { nodes: { grp: 'warn' } } },
        { log: 'The client fetches offset 3 and receives OFFSET_OUT_OF_RANGE, so the group cannot resume.', code: 3, hl: { nodes: { err: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'fetch at', v: 'offset 3 (gone)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A longer retention window keeps segment 3 on disk, so the committed offset stays inside the log.', code: 0, hl: { nodes: { new: 'ok' } }, stats: [{ l: 'retention.ms', v: '7 days (illustrative)', cls: 'ok' }] },
        { log: 'The group resumes at its committed offset, because that offset is still above the log start.', code: 3, hl: { nodes: { grp: 'ok' }, edges: { e2: 'ok' } } },
        { log: 'Older history stays readable from the remote tier when tiered storage is on.', code: 1, stats: [{ l: 'older history', v: 'read from remote tier', cls: 'ok' }] }
      ]
    },
    {
      id: 'tomb',
      label: 'Tombstone outlives reader',
      desc: 'A delete marker is removed by the cleaner before a paused consumer reads it, so the deleted key survives in that consumer’s table.',
      codeLabel: 'Config',
      code: {
        bug: [
          'cleanup.policy=compact',
          'delete.retention.ms=86400000  # 24 h (illustrative)',
          '# k1 = A, later k1 = null (tombstone) for the deleted customer',
          '# the cleaner removes the tombstone after 24 h',
          '# consumer paused for 2 days: never sees the delete, keeps k1'
        ],
        fix: [
          'delete.retention.ms=604800000  # longer than the worst-case read time',
          '# alert when a consumer position is older than delete.retention.ms',
          '# consumer reads the tombstone and removes k1',
          '# or rebuild the table from the compacted topic'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'log', x: 10, y: 115, w: 170, h: 60, t: 'Compacted topic', s: 'k1, k2, k3 ...' },
          { id: 'cl', x: 240, y: 20, w: 170, h: 60, t: 'Log cleaner', s: 'removes tombstone' },
          { id: 'slow', x: 240, y: 210, w: 170, h: 60, t: 'Slow consumer', s: 'paused for 2 days' },
          { id: 'tbl', x: 460, y: 210, w: 170, h: 60, t: 'Downstream table', s: 'still has k1' }
        ],
        edges: [
          { id: 'e1', a: 'log', b: 'cl', label: 'compact' },
          { id: 'e2', a: 'log', b: 'slow', label: 'read later' },
          { id: 'e3', a: 'slow', b: 'tbl', label: 'keeps k1' }
        ]
      },
      bug: [
        { log: 'Customer k1 is deleted, so a tombstone (a null value) is written to the log.', code: 2, hl: { nodes: { log: 'warn' } } },
        { log: 'The cleaner removes the tombstone after delete.retention.ms (24 h, illustrative).', code: 3, hl: { nodes: { cl: 'bad' }, edges: { e1: 'on' } } },
        { log: 'The consumer, paused for 2 days, reads from its old position and never sees the delete.', code: 4, hl: { nodes: { slow: 'bad' }, edges: { e2: 'on' } } },
        { log: 'It keeps k1 forever, so the downstream table is wrong.', code: 4, hl: { nodes: { tbl: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'k1 in table', v: 'present (wrong)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'delete.retention.ms is longer than the worst-case time to read the log, so the tombstone outlives the slow reader.', code: 0, hl: { nodes: { cl: 'ok' } }, stats: [{ l: 'tombstone kept for', v: '7 days (illustrative)', cls: 'ok' }] },
        { log: 'The paused consumer reads the tombstone and removes k1 from its table.', code: 2, hl: { nodes: { slow: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'k1 in table', v: 'removed', cls: 'ok' }] },
        { log: 'An alert on consumer position age shows when a rebuild is needed, so drift is caught early.', code: 1, hl: { nodes: { tbl: 'ok' } } }
      ]
    }
  ]
},
{
  title: 'Transactions and Exactly-Once',
  problem: `A Kafka-to-Kafka job reads <code>orders</code>, writes an invoice to <code>invoices</code> and then commits the input offset, so it is at-least-once. A node crash lands between the invoice write and the offset commit, and finance receives the same invoice twice. Later a paused pod wakes up and writes yet another one.`,
  predict: {
    q: `A transactional job crashes after writing the invoice but before <code>commitTransaction()</code>. What does a <code>read_committed</code> reader see from that attempt?`,
    opts: [
      `The invoice, because it is in the log`,
      `The invoice, marked as pending`,
      `Nothing: the transaction is aborted and its records are filtered out`
    ],
    ans: 2,
    why: `The records are in the log, but an open or aborted transaction is hidden from <code>read_committed</code> readers. They stop at the last stable offset and skip aborted records.`
  },
  explain: `<h3>The idea</h3>
<p>Reading, writing and committing touch different logs, so a crash between them leaves the job half done. A transaction groups the output writes and the input offset commit into one unit that either commits or aborts together. Fencing then stops an older instance from writing into the same unit.</p>
<h3>How it works, step by step</h3>
<p><b>transactional.id.</b> <code>initTransactions()</code> registers the id with the transaction coordinator, which returns a producer ID and bumps the epoch. An older producer with the same id is fenced with <code>ProducerFencedException</code>.</p>
<p><b>Atomic unit.</b> The job calls <code>beginTransaction()</code>, produces its output, calls <code>sendOffsetsToTransaction()</code> for the input offsets, and then calls <code>commitTransaction()</code>. The coordinator records the partitions involved in the internal <code>__transaction_state</code> topic.</p>
<p><b>Markers.</b> On commit or abort, the coordinator writes a control marker to every partition in the transaction.</p>
<p><b>Isolation.</b> Consumers with <code>isolation.level=read_committed</code> deliver only committed records, up to the last stable offset (LSO). The default <code>read_uncommitted</code> also returns aborted records.</p>
<p><b>Timeouts.</b> <code>transaction.timeout.ms</code> bounds an open transaction, and the broker caps it with <code>transaction.max.timeout.ms</code>.</p>
<h3>The trade-off</h3>
<p>Exactly-once holds inside the Kafka read-process-write loop. Side effects outside Kafka still need idempotent writes. A <code>read_committed</code> reader also lags the log end by the length of the longest open transaction.</p>`,
  diagnose: [
    {
      t: 'Shared id',
      sym: 'Producers crash with a fencing error and restart in a loop; throughput is near zero.',
      ctx: 'An app deploys several pods that all configure the same <code>transactional.id</code> (for example copied from a template).',
      why: '<code>initTransactions()</code> maps a <code>transactional.id</code> to one producer ID and bumps its epoch, fencing any older producer with the same id. Two live instances keep fencing each other, so neither can commit.',
      log: `-- representative output, values illustrative
ProducerFencedException: There is a newer producer with the same transactionalId which fences the current one.`,
      note: 'Documented exception; the sequence in the diagram is an illustration. Source: ' + KL(KIP + 'KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging', 'KIP-98 · exactly-once and transactions'),
      fix: [
        'Measure first: list the <code>transactional.id</code> values configured across pods and look for duplicates.',
        'Fix: give every producer instance (or every input partition, depending on your design) its own stable <code>transactional.id</code>.',
        'Fix: treat <code>ProducerFencedException</code> as fatal for that instance: close it and do not retry the same transaction; prefer a framework that derives the id for you, for example Kafka Streams with exactly-once processing.',
        'Trade-off: a stable per-instance id is what makes zombie fencing and cross-restart dedupe work, but it must be unique, so it needs a deployment story.',
        'Verify: each instance keeps one epoch and transactions commit without fencing errors.'
      ]
    },
    {
      t: 'Hanging txn',
      sym: 'read_committed consumers stop advancing and lag grows, while read_uncommitted consumers keep going.',
      ctx: 'A transactional producer crashes after writing records but before commit or abort, and the coordinator’s timeout is long.',
      why: 'A <code>read_committed</code> consumer may read only up to the last stable offset, which is the first offset of the earliest still-open transaction. One open transaction pins the LSO for the partition until it is committed or aborted.',
      log: `-- representative output, values illustrative
read_committed consumer lag grows; last stable offset (LSO) frozen
kafka-transactions.sh --bootstrap-server broker:9092 find-hanging --broker-id 1`,
      note: 'The tool was added with KIP-664; the offsets and lag shown are illustrative. Source: ' + KL(KIP + 'KIP-664%3A+Provide+tooling+to+detect+and+abort+hanging+transactions', 'KIP-664 · hanging transactions'),
      fix: [
        'Measure first: compare the LSO with the log end offset and run <code>kafka-transactions.sh find-hanging</code> to locate old open transactions.',
        'Fix: restart the stuck producer so it ends the transaction, or let the coordinator abort it at <code>transaction.timeout.ms</code>.',
        'Fix: use <code>kafka-transactions.sh abort</code> for a transaction that will never finish, and keep <code>transaction.timeout.ms</code> short (bounded by <code>transaction.max.timeout.ms</code> on the broker).',
        'Trade-off: a short timeout aborts slow but healthy transactions; a long one lets a dead producer block readers for that long.',
        'Verify: the LSO advances to the log end and <code>read_committed</code> lag drains.'
      ]
    },
    {
      t: 'Dirty reads',
      sym: 'A report counts invoices that finance says never existed, though the producer side uses transactions.',
      ctx: 'The invoicing job writes inside transactions, and some attempts abort. A reporting consumer uses the default <code>isolation.level=read_uncommitted</code>.',
      why: 'Transactions only hide data from consumers that ask for it. A <code>read_uncommitted</code> consumer returns every record in offset order, including records of open and aborted transactions.',
      log: `-- representative output, values illustrative
consumer config: isolation.level = read_uncommitted (default)
read invoice id=88 from a transaction that was later aborted`,
      note: 'The default is documented in the consumer configs; the record is illustrative. Source: ' + KL(KDOC + 'consumerconfigs', 'Consumer configs'),
      fix: [
        'Measure first: check the <code>isolation.level</code> of every consumer group on the transactional topic.',
        'Fix: set <code>isolation.level=read_committed</code> on every consumer that must not see aborted or open transactions.',
        'Fix: document that the exactly-once guarantee applies only inside the Kafka read-process-write loop, and keep external systems idempotent.',
        'Trade-off: <code>read_committed</code> readers lag behind the log end by the length of the longest open transaction.',
        'Verify: a test that aborts a transaction produces no visible record in the downstream consumer.'
      ]
    }
  ],
  source: { label: 'Original: Transactions and Exactly-Once', href: '01-kafka-internals-end-to-end.html#ch10' },
  scenarios: [
    {
      id: 'txn',
      label: 'Commit or abort atomically',
      desc: 'Without a transaction the invoice and the offset commit are separate. With one, a crash before commitTransaction() leaves records that read_committed readers never see.',
      codeLabel: 'Code',
      code: {
        bug: [
          '# no transaction: at-least-once',
          'producer.send(invoice)',
          '# crash here, before the offset is committed',
          'consumer.commitSync()  # the offset commit happens last',
          '# restart: order replayed, second invoice written'
        ],
        fix: [
          'producer.initTransactions()  # transactional.id = invoice-job-0',
          'producer.beginTransaction()',
          'producer.send(invoice)',
          'producer.sendOffsetsToTransaction(offsets, group)',
          '# crash before commitTransaction(): the attempt is aborted and hidden'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'app', x: 10, y: 115, w: 150, h: 60, t: 'Job', s: 'read, then write' },
          { id: 'tc', x: 230, y: 115, w: 170, h: 60, t: 'Coordinator', s: 'PID + epoch' },
          { id: 'out', x: 450, y: 20, w: 170, h: 60, t: 'Output partition', s: 'invoice + marker' },
          { id: 'inoff', x: 450, y: 210, w: 170, h: 60, t: '__consumer_offsets', s: 'input offset' }
        ],
        edges: [
          { id: 'e1', a: 'app', b: 'tc', label: 'begin' },
          { id: 'e2', a: 'tc', b: 'out', label: 'markers' },
          { id: 'e3', a: 'tc', b: 'inoff', label: 'offsets' }
        ]
      },
      bug: [
        { log: 'The job writes the invoice to the output topic, and the record is visible at once.', code: 1, hl: { nodes: { app: 'on', out: 'warn' } } },
        { log: 'The job crashes before the input offset is committed.', code: 2, hl: { nodes: { app: 'bad' } } },
        { log: 'On restart the order is read again and a second invoice is written. Finance sees two.', code: 4, hl: { nodes: { out: 'bad', inoff: 'warn' } }, stats: [{ l: 'invoices for order', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'initTransactions() registers the transactional.id and gets a producer ID and epoch.', code: 0, hl: { nodes: { app: 'ok', tc: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'The invoice and the input offset are written inside one transaction.', code: 3, hl: { nodes: { out: 'ok', inoff: 'ok' }, edges: { e2: 'ok', e3: 'ok' } } },
        { log: 'A crash before commitTransaction() leaves an open transaction, which the coordinator aborts. Its invoice stays hidden.', code: 4, hl: { nodes: { tc: 'warn' } }, stats: [{ l: 'visible to read_committed', v: 'no', cls: 'ok' }] }
      ]
    },
    {
      id: 'lso',
      label: 'Hanging txn pins LSO',
      desc: 'One open transaction stops read_committed readers at the last stable offset, while committed records behind it wait.',
      codeLabel: 'Command',
      code: {
        bug: [
          '# producer crashed inside an open transaction at offset 4',
          '# read_committed lag grows; last stable offset (LSO) frozen at 4',
          'kafka-transactions.sh --bootstrap-server broker:9092 find-hanging --broker-id 1',
          '# transaction.timeout.ms is long, so the transaction stays open'
        ],
        fix: [
          '# restart the stuck producer so it ends the transaction',
          'transaction.timeout.ms=60000  # shorter timeout (illustrative)',
          '# abort marker written at offset 4: LSO jumps to the log end',
          '# read_committed lag drains'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'tx', x: 10, y: 20, w: 170, h: 60, t: 'Open transaction', s: 'offsets 4 and 5' },
          { id: 'lso', x: 240, y: 115, w: 170, h: 60, t: 'Last stable offset', s: 'LSO = 4' },
          { id: 'reader', x: 460, y: 20, w: 170, h: 60, t: 'read_committed', s: 'stops at the LSO' },
          { id: 'commit', x: 460, y: 210, w: 170, h: 60, t: 'Committed data', s: 'offsets 6 to 9' },
          { id: 'mark', x: 240, y: 210, w: 170, h: 60, t: 'Abort marker', s: 'written by coordinator' }
        ],
        edges: [
          { id: 'e1', a: 'tx', b: 'lso', label: 'pins LSO' },
          { id: 'e2', a: 'lso', b: 'reader', label: 'reads up to' },
          { id: 'e3', a: 'commit', b: 'reader', label: 'hidden' },
          { id: 'e4', a: 'mark', b: 'tx', label: 'ends it' }
        ]
      },
      bug: [
        { log: 'A producer writes offsets 4 and 5 in a transaction, then crashes before the commit or abort.', code: 0, hl: { nodes: { tx: 'bad' } } },
        { log: 'The transaction stays open. The LSO is pinned at 4, the first offset of the open transaction.', code: 1, hl: { nodes: { lso: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'LSO', v: '4 (frozen)', cls: 'bad' }] },
        { log: 'Committed offsets 6 to 9 exist, but read_committed readers cannot go past the LSO.', code: 3, hl: { nodes: { commit: 'warn', reader: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'read_committed lag', v: 'growing', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Restarting the stuck producer ends the transaction, or the coordinator aborts it when the timeout passes.', code: 0, hl: { nodes: { tx: 'ok' } } },
        { log: 'An abort marker closes the transaction, and the LSO jumps to the log end.', code: 2, hl: { nodes: { mark: 'ok', lso: 'ok' }, edges: { e4: 'ok' } } },
        { log: 'read_committed readers now see the committed records, and their lag drains.', code: 3, hl: { nodes: { reader: 'ok' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'LSO', v: 'equal to log end', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'KRaft Control Plane',
  problem: `A three-node controller quorum runs in one rack. A power fault takes two of the three nodes down (illustrative). Brokers keep running, and producers on healthy leaders still write, but topic creation hangs, a broker that restarts cannot register, and nobody can change a leader. The on-call engineer sees no active controller.`,
  predict: {
    q: `A cluster has 4 controller voters. How many can fail before metadata updates stop?`,
    opts: [
      `2, because half of them remain`,
      `1, the same as with 3 voters`,
      `0, because an even number cannot form a quorum`
    ],
    ans: 1,
    why: `A majority of 4 is 3 voters, so losing 2 leaves only half. Four voters tolerate one failure, exactly like three, at a higher cost.`
  },
  explain: `<h3>The idea</h3>
<p>Cluster metadata needs one authority, and that authority must survive failures without splitting into two. KRaft stores the metadata as a log, replicated by a majority of controller voters. Epochs make sure a stale leader cannot keep acting after a newer one has been elected.</p>
<h3>How it works, step by step</h3>
<p><b>Metadata is a log.</b> The <code>__cluster_metadata</code> topic holds every change (topics, partition leaders, configs). It is replicated with a Raft-based protocol (KIP-500, KIP-595).</p>
<p><b>One active controller per epoch.</b> The voters elect a leader that appends records. A record commits when a majority of voters holds it. A higher epoch wins, so a stale leader is rejected.</p>
<p><b>Quorum arithmetic.</b> A majority is ⌊n/2⌋ + 1. Three voters tolerate one failure, four tolerate one, and five tolerate two.</p>
<p><b>Brokers.</b> Brokers register with the active controller and send heartbeats to it. A broker that stays silent longer than <code>broker.session.timeout.ms</code> is fenced and loses its leaderships.</p>
<p><b>Setup.</b> <code>process.roles</code> chooses broker, controller or both. The quorum is found through <code>controller.quorum.bootstrap.servers</code> or the static <code>controller.quorum.voters</code>. <code>kafka-metadata-quorum.sh describe --status</code> shows the leader, the epoch and the voters.</p>
<h3>The trade-off</h3>
<p>More voters tolerate more failures, but every commit waits for a larger majority. Two voters tolerate no failure at all. Keep the voter count odd and spread the voters across separate failure domains.</p>`,
  diagnose: [
    {
      t: 'Majority lost',
      sym: 'No active controller: topic creation, leader election and broker registration stall, while data traffic on healthy leaders may continue for a while.',
      ctx: 'Three controller voters run in one rack. A power event takes two of them down.',
      why: 'The metadata log is replicated with a Raft-style protocol: an entry commits, and a leader is elected, only with a majority of voters. One of three voters alive is a minority and can neither elect nor commit.',
      log: `-- representative output, fields abbreviated
kafka-metadata-quorum.sh --bootstrap-server broker:9092 describe --status
ActiveControllerCount = 0 on every node`,
      note: 'Documented tool and controller metric; the output fields shown are abbreviated. Source: ' + KL(KIP + 'KIP-595%3A+A+Raft+Protocol+for+the+Metadata+Quorum', 'KIP-595 · Raft for the metadata quorum'),
      fix: [
        'Measure first: run <code>kafka-metadata-quorum.sh describe --status</code> and check <code>ActiveControllerCount</code> to see which voters are alive.',
        'Fix: bring a majority of voters back (here 2 of 3); do not force a minority to act, and wait for the majority to elect a leader with a higher epoch.',
        'Fix: place controller voters in separate failure domains, use an odd number (3 or 5), and alert on <code>ActiveControllerCount</code> and quorum lag.',
        'Trade-off: more voters tolerate more failures but each commit waits for a larger majority; two voters tolerate none.',
        'Verify: one voter reports itself leader with an epoch, <code>ActiveControllerCount</code> is 1 and the high watermark advances.'
      ]
    },
    {
      t: 'Network split',
      sym: 'Changes sent to the old active controller hang, while the other side elects a new active controller.',
      ctx: 'Five controller voters are split 2 | 3 by a network fault, and the old active controller is on the two-voter side.',
      why: 'Committing needs 3 of 5 voters. The two-voter side cannot reach a majority, so its entries stay uncommitted. The three-voter side elects a leader with a higher epoch, and brokers reject requests from the older epoch.',
      log: `-- representative output, values illustrative
old side: metadata writes never commit; LeaderEpoch unchanged
majority side: new LeaderEpoch, ActiveControllerCount = 1`,
      note: 'Behaviour pattern; the epoch values are illustrative. Source: ' + KL(KDOC + 'kraft', 'KRaft'),
      fix: [
        'Measure first: query the quorum status from both sides to see who holds the higher epoch.',
        'Fix: treat the majority side as authoritative and restore the network between the sides.',
        'Fix: when the network heals, the old leader steps down and truncates its uncommitted entries; resend any change that did not commit.',
        'Trade-off: a split-safe design stops the minority side instead of accepting writes on both, so metadata changes there are unavailable to avoid two authorities.',
        'Verify: all voters report the same leader and epoch and the same committed high watermark.'
      ]
    },
    {
      t: 'Even voters',
      sym: 'The team added a fourth controller for safety, yet losing two nodes still stops all metadata changes.',
      ctx: 'A quorum of 3 controllers was grown to 4 “to be safer”, and the extra node costs a machine and a rack slot.',
      why: 'A majority of 4 voters is 3, so only 1 voter can fail, exactly as with 3 voters. The extra voter adds commit latency and cost without adding fault tolerance. 5 voters are the next step that tolerates 2.',
      log: `-- representative output, fields abbreviated
kafka-metadata-quorum.sh --bootstrap-server broker:9092 describe --status
CurrentVoters: [1,2,3,4]   (majority = 3, tolerates 1 failure)`,
      note: '<code>CurrentVoters</code> is a field of the quorum status output; the arithmetic is the quorum rule. Source: ' + KL(KDOC + 'kraft', 'KRaft'),
      fix: [
        'Measure first: count the controller voters in the quorum status and the failure domains they sit in.',
        'Fix: use 3 voters for most clusters and 5 where two simultaneous failures must be tolerated; avoid even counts.',
        'Fix: spread voters across independent racks or zones, so that one domain failing removes at most one voter.',
        'Trade-off: five voters tolerate more failures, but every commit waits for 3 acknowledgements and each node must be operated and monitored.',
        'Verify: a game day that kills the maximum tolerated number of voters keeps metadata changes working.'
      ]
    }
  ],
  source: { label: 'Original: KRaft Control Plane', href: '01-kafka-internals-end-to-end.html#ch11' },
  scenarios: [
    {
      id: 'major',
      label: 'Quorum majority lost',
      desc: 'With one of three voters alive there is no majority. No leader is elected and no metadata record commits.',
      codeLabel: 'Command',
      code: {
        bug: [
          '# controller voters 1, 2 and 3 in one rack',
          '# power event: voters 2 and 3 are down',
          'kafka-metadata-quorum.sh --bootstrap-server broker:9092 describe --status',
          'ActiveControllerCount = 0 on every node',
          '# 1 of 3 is a minority: no election, no commit'
        ],
        fix: [
          '# bring a second voter back: 2 of 3 is a majority',
          '# the majority elects a leader with a higher epoch',
          'kafka-metadata-quorum.sh --bootstrap-server broker:9092 describe --status',
          '# ActiveControllerCount = 1; metadata commits resume'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'v1', x: 10, y: 20, w: 170, h: 60, t: 'Voter 1', s: 'alive, minority' },
          { id: 'v2', x: 10, y: 115, w: 170, h: 60, t: 'Voter 2', s: 'down' },
          { id: 'v3', x: 10, y: 210, w: 170, h: 60, t: 'Voter 3', s: 'down' },
          { id: 'q', x: 250, y: 115, w: 170, h: 60, t: 'Metadata log', s: 'no majority' },
          { id: 'br', x: 460, y: 115, w: 170, h: 60, t: 'Brokers', s: 'no active controller' }
        ],
        edges: [
          { id: 'e1', a: 'v1', b: 'q', label: 'no quorum' },
          { id: 'e2', a: 'v2', b: 'q', label: 'down' },
          { id: 'e3', a: 'q', b: 'br', label: 'no leader' }
        ]
      },
      bug: [
        { log: 'Two of three controller voters go down in the same power event.', code: 1, hl: { nodes: { v2: 'off', v3: 'off' }, edges: { e2: 'dim' } }, stats: [{ l: 'voters alive', v: '1 of 3', cls: 'bad' }] },
        { log: 'Voter 1 cannot form a majority, so it cannot elect a leader or commit a metadata record.', code: 0, hl: { nodes: { v1: 'bad', q: 'bad' }, edges: { e1: 'on' } } },
        { log: 'Brokers have no active controller, so topic creation and leader elections stall.', code: 3, hl: { nodes: { br: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'ActiveControllerCount', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'One more voter comes back. Two of three is a majority again.', code: 0, hl: { nodes: { v2: 'ok' } }, stats: [{ l: 'voters alive', v: '2 of 3', cls: 'ok' }] },
        { log: 'The majority elects one leader with a higher epoch, and metadata records can commit.', code: 2, hl: { nodes: { v1: 'ok', q: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'Brokers reach the active controller again, and the cluster resumes.', code: 3, hl: { nodes: { br: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'ActiveControllerCount', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'split',
      label: 'Split vote and old leader',
      desc: 'A 2 | 3 network split. Only the 3-voter side can commit, and the old leader’s entries stay uncommitted until the heal.',
      codeLabel: 'Log',
      code: {
        bug: [
          '# five voters split 2 | 3 by a network fault',
          '# the old active controller is on the 2-voter side',
          '# old side: metadata writes never commit; LeaderEpoch unchanged',
          '# majority side: new LeaderEpoch, ActiveControllerCount = 1',
          '# brokers reject requests from the older epoch'
        ],
        fix: [
          '# query the quorum status from both sides',
          '# restore the network between the two sides',
          '# old leader steps down and truncates uncommitted entries',
          '# resend any change that did not commit'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'sa', x: 10, y: 115, w: 170, h: 60, t: 'Side A', s: '2 voters, old leader' },
          { id: 'sb', x: 250, y: 20, w: 170, h: 60, t: 'Side B', s: 'majority, new epoch' },
          { id: 'old', x: 460, y: 210, w: 170, h: 60, t: 'Old requests', s: 'stale epoch rejected' }
        ],
        edges: [
          { id: 'e1', a: 'sa', b: 'sb', label: 'network split' },
          { id: 'e2', a: 'sb', b: 'old', label: 'new epoch wins' },
          { id: 'e3', a: 'sa', b: 'old', label: 'uncommitted' }
        ]
      },
      bug: [
        { log: 'A network fault splits five voters 2 | 3. The old active controller is on the 2-voter side.', code: 1, hl: { nodes: { sa: 'bad' }, edges: { e1: 'on' } }, stats: [{ l: 'voters', v: '2 | 3', cls: 'warn' }] },
        { log: 'The 2-voter side cannot reach a majority, so its metadata writes never commit.', code: 2, hl: { nodes: { sa: 'bad' }, edges: { e3: 'on' } } },
        { log: 'The 3-voter side elects a leader with a higher epoch and keeps committing.', code: 3, hl: { nodes: { sb: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'active controllers', v: '1 on majority side', cls: 'ok' }] },
        { log: 'Requests with the older epoch are rejected, so the two sides never both accept writes.', code: 4, hl: { nodes: { old: 'bad' } } }
      ],
      fix: [
        { log: 'The quorum status from both sides shows which one holds the higher epoch.', code: 0, hl: { nodes: { sb: 'ok' } } },
        { log: 'The network is restored between the two sides.', code: 1, hl: { nodes: { sa: 'ok' }, edges: { e1: 'ok' } } },
        { log: 'The old leader steps down and truncates its uncommitted entries.', code: 2, hl: { nodes: { old: 'ok' } }, stats: [{ l: 'uncommitted entries', v: 'truncated', cls: 'ok' }] },
        { log: 'Any change that never committed is sent again, so the log holds one committed history.', code: 3, stats: [{ l: 'committed history', v: 'one copy', cls: 'ok' }] }
      ]
    }
  ]
}
    ]
  };
})();
