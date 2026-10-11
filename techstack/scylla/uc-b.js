/* Use cases for features 4 to 6: replica write path, read path, compaction.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const P = k => ({ op: 'put', k }), D = k => ({ op: 'del', k }), G = k => ({ op: 'get', k });
  const FILL1 = [P('a'), P('b'), P('c')], FILL2 = [P('a'), P('d'), P('e')], FILL3 = [P('f'), P('g'), P('h')];

  CourseData.uc.write = [
    {
      title: 'Commitlog, memtable and flush', short: 'write path', animation: {
        kind: 'lsm', memCap: 3, threshold: 3, key: 'a',
        presets: [
          { label: 'Three writes fill the memtable', ops: FILL1 },
          { label: 'An update goes to a new file', ops: FILL1.concat(FILL2) },
          { label: 'Nothing is edited in place', ops: FILL1.concat([P('a'), P('b')]) }
        ]
      },
      intro: 'A write never touches an existing file. See the commitlog and the memtable fill, the flush that makes an immutable SSTable, and why an update lands in a newer file.',
      trigger: 'A replica receives 7,500 writes a second. The power fails right after the client got OK, and the question is what survives (example rate).',
      run: "nodetool flush shop orders         -- force a memtable flush\nnodetool cfstats shop.orders       -- memtable and SSTable counts\n-- scylla.yaml: commitlog_sync, commitlog_segment_size_in_mb",
      expect: 'The write is in the commitlog and the memtable when the replica acknowledges. Only a flush creates an SSTable, and a later update to the same key goes to a newer file.',
      edges: [
        E('Replay after a crash', 'Memtables are lost in a crash, but the commitlog segments that were not yet flushed are replayed at start, rebuilding them.', 'Keep the commitlog on a fast disk and never delete segments by hand.'),
        E('Many small flushes', 'Frequent small flushes create many small SSTables that compaction must merge, so reads touch more files meanwhile.', 'Give memtables enough memory and avoid thousands of tables per node.')
      ],
      invariant: 'A write is acknowledged after the commitlog append and memtable insert; SSTables are only created by flush and compaction, never edited.',
      src: 'ScyllaDB docs: Write path (commitlog, memtable, SSTable), <code>nodetool flush</code>. The three-cell memtable is a teaching model; real memtables are megabytes.'
    },
    {
      title: 'Commitlog sync: the loss window on one node', short: 'commitlog sync', kind: 'sync',
      intro: 'Acknowledging a write is not the same as having it on disk. See the window a single node can lose, and why replication usually covers it.',
      trigger: 'A node runs the commitlog in periodic mode with a sync every 10 seconds (example period; check <code>commitlog_sync_period_in_ms</code>). It crashes 4 seconds after a sync.',
      run: "# scylla.yaml\ncommitlog_sync: periodic\ncommitlog_sync_period_in_ms: 10000   # example\n# alternative: commitlog_sync: batch, with commitlog_sync_batch_window_in_ms",
      expect: 'Writes acknowledged since the last sync are lost on that node. At QUORUM with RF=3 the other two replicas still hold them.',
      steps: [
        S('Periodic mode', 'The replica appends to the commitlog and acknowledges at once. A sync (fsync) happens on a timer, here every 10 seconds, so acknowledged writes can sit in the OS cache for a while.', { t: 9, mode: 'periodic' }, 'ack first, fsync later'),
        S('A sync makes them durable', 'At 10 s the sync completes. Every write before it is now on disk.', { t: 11, mode: 'periodic' }, 'synced at 10 s'),
        S('A crash between syncs', 'Writes keep arriving. The node crashes at 14 s. Writes after the 10 s sync were acknowledged but only in the OS cache, so they are lost on this node.', { t: 14, mode: 'periodic', crash: 14 }, 'lost on this node: writes after 10 s'),
        S('The other replicas have them', 'With RF=3 and QUORUM each of those writes was acknowledged by at least 2 replicas. The other two nodes still hold them in memory, and the crashed node catches up by hints or repair.', { t: 14, mode: 'periodic', crash: 14, rep: true }, 'kept on the other replicas'),
        S('Batch mode', 'In batch mode a write is acknowledged only after the commitlog is synced, in small groups. No acknowledged write is lost on this node, at the price of a sync in the latency of every write.', { t: 14, mode: 'batch', crash: 14 }, 'ack after fsync · no loss window'),
        S('Correlated failure', 'If all three replicas lose power in the same instant (one rack, one power feed), nobody has the writes since the last sync. Spread replicas across racks and zones so one fault cannot take them all.', { t: 14, mode: 'periodic', crash: 14, all: true }, 'lost on every replica at once')
      ],
      edges: [
        E('Replicas stored on one rack', 'RF=3 on three nodes of one rack puts all copies behind one switch and one power feed.', 'Use <code>NetworkTopologyStrategy</code> with racks or zones so each replica is in a different failure domain.'),
        E('Latency versus safety', 'Batch mode raises write latency by the fsync time.', 'Keep periodic for most tables and use stronger levels or racks for the safety you need.')
      ],
      invariant: 'In periodic mode, a single node can lose the writes since its last commitlog sync; replication, not the node, covers that window.',
      src: 'ScyllaDB docs: <code>commitlog_sync</code> modes (periodic and batch) in the configuration reference. The 10 s period is an example; confirm the default for your version.'
    },
    {
      title: 'Memory pressure: flushing falls behind', short: 'dirty memory', kind: 'dirty',
      intro: 'Memtables live in memory until flushed. If the disk cannot absorb flushes as fast as writes arrive, the node has to slow writers down before memory runs out.',
      trigger: 'A bulk load runs while the disks are busy with compaction. Memtable memory is a fixed budget per shard (example percentages).',
      run: "# Prometheus metrics, names vary by version: memtable dirty bytes, flush backlog, write timeouts\nnodetool compactionstats    -- pending compactions competing for disk",
      expect: 'Dirty memory grows until it reaches the limit, then writes are throttled or time out until a flush frees memory.',
      steps: [
        S('Steady state', 'Memtables fill at about the rate flushes drain them. Dirty memory sits well under its budget.', { dirty: 30, note: 'in balance' }, 'dirty memory 30% of budget'),
        S('A burst of writes', 'A bulk load triples the write rate. Memtables fill faster and dirty memory climbs to 70%.', { dirty: 70, note: 'filling faster' }, 'dirty memory 70%'),
        S('Flushes start in time', 'Flushing begins early enough and the disk keeps up. Memory stabilises and no write notices.', { dirty: 55, note: 'flushing keeps up' }, 'dirty memory 55%'),
        S('The disk is busy', 'Compaction is using the disk, so flushes are slow. They cannot free memory as fast as writes use it, and dirty memory reaches 95%.', { dirty: 95, note: 'flush behind' }, 'dirty memory 95%'),
        S('At the limit writers wait', 'When memory is at its limit a write has to wait for a flush to free space. Latency rises, and some writes time out at the coordinator.', { dirty: 100, note: 'writers blocked', blocked: true }, 'writes throttled · timeouts'),
        S('Fix the cause', 'Reduce the write rate, give flush and compaction their share of disk (the node balances them), or add nodes so each handles less. Raising timeouts only hides it.', { dirty: 45, note: 'recovered' }, 'dirty memory 45%')
      ],
      edges: [
        E('Too many tables', 'Every table has its own memtables, so thousands of tables each hold a little memory and flush as many tiny files.', 'Keep the table count modest per node and share a table across tenants with a tenant column.'),
        E('Bulk loads at full speed', 'A loader that writes as fast as the network allows ignores the node\'s limits.', 'Use bounded concurrency in the loader and watch write timeouts and pending flushes.')
      ],
      invariant: 'A node slows writers down when memtable memory is full, instead of running out of memory.',
      src: 'ScyllaDB docs: Write path, Compaction and flush scheduling (Seastar I/O scheduling), Monitoring metrics. Percentages are illustrative.'
    }
  ];

  CourseData.uc.read = [
    {
      title: 'A read merges files and skips the rest', short: 'read path', animation: {
        kind: 'lsm', memCap: 3, threshold: 3, key: 'a',
        presets: [
          { label: 'Key a is spread over three files', ops: FILL1.concat(FILL2, FILL3, [G('a')]) },
          { label: 'Bloom filters skip files', ops: FILL1.concat(FILL2, FILL3, [G('d'), G('z')]) },
          { label: 'The memtable answers first', ops: FILL1.concat([P('a'), G('a')]) }
        ]
      },
      intro: 'Each SSTable has a Bloom filter that answers "definitely absent" or "maybe present". See which files a read opens, how the cells are merged by timestamp, and what a missing key costs.',
      trigger: 'A point read takes 40 ms and the replica checked 11 SSTables (illustrative). The question is why it did not check fewer.',
      run: "TRACING ON;\nSELECT * FROM orders WHERE id = 42;   -- trace lists the SSTables consulted\nnodetool cfhistograms shop orders       -- SSTables per read",
      expect: 'The replica reads only SSTables whose filter says "maybe" and merges the cells by timestamp. A key in no file costs no data-file read.',
      edges: [
        E('A key spread over many files', 'A row updated every day for months can have a cell in every SSTable that has not been compacted.', 'Choose a compaction strategy that keeps few files per read (feature 6), and avoid updating the same key forever.'),
        E('False positives', 'A filter sometimes says "maybe" for a key that is not there, which costs one wasted read of that file.', 'Lower <code>bloom_filter_fp_chance</code> if misses are common, and pay for it in memory.')
      ],
      invariant: 'A read returns the cell with the newest timestamp among the memtable and every SSTable it consults.',
      src: 'ScyllaDB docs: Read path (Bloom filter, partition index, summary, merge), tracing. The three-cell memtable is a teaching model.'
    },
    {
      title: 'Bloom filter size against false positives', short: 'bloom filter', kind: 'fp',
      intro: 'A Bloom filter spends memory to avoid reads. See how many bits per key a false-positive target costs, and what it saves.',
      trigger: 'The table has 1 billion partitions on a node and many reads for keys that are not there (example).',
      run: "ALTER TABLE orders WITH bloom_filter_fp_chance = 0.01;\n-- then rewrite the SSTables so the new filters are built: nodetool upgradesstables -a shop orders",
      expect: 'About 1.44 × log₂(1/p) bits per key: roughly 9.6 bits at p = 0.01, so about 1.2 GB for 1 billion keys.',
      steps: [
        S('What a filter promises', 'For each SSTable the filter says "definitely absent" or "maybe present". "Definitely" is always right; "maybe" is wrong with probability p (the false-positive chance).', { upto: 0 }, 'false positive = a wasted file read'),
        S('p = 0.1', 'About 4.8 bits per key. For 1 billion keys that is 0.6 GB. On a miss across 10 files, about 1 file is read for nothing.', { upto: 1 }, '4.8 bits/key · 0.60 GB'),
        S('p = 0.01', 'About 9.6 bits per key and 1.2 GB. A miss across 10 files reads 0.1 files for nothing on average.', { upto: 2 }, '9.6 bits/key · 1.2 GB'),
        S('p = 0.001', 'About 14.4 bits per key and 1.8 GB. 0.01 wasted file reads per miss.', { upto: 3 }, '14.4 bits/key · 1.8 GB'),
        S('Diminishing returns', 'Each 10× fewer false positives costs about 4.8 more bits per key. At some point the memory is better spent on cache. Choose p by the share of misses and the cost of a disk read.', { upto: 4 }, 'cost per 10×: +4.8 bits/key'),
        S('Where the memory goes', 'Filters are held in memory per SSTable, so more SSTables per node mean more filter memory. Compaction merges filters as it merges files.', { upto: 4, mem: true }, 'filters are resident')
      ],
      edges: [
        E('Existing files keep the old filter', 'Changing the option does not rebuild filters of existing SSTables.', 'Rewrite the SSTables (upgrade SSTables or let compaction rewrite them) for the new value to apply.'),
        E('Mostly-hit workloads', 'If almost every read finds its key, the filter rarely saves a read, and its memory buys little.', 'Use a looser p (a smaller filter) for tables where most reads are hits.')
      ],
      invariant: 'A Bloom filter never says "absent" for a key that is present; it says "maybe" for an absent key with probability p.',
      src: 'ScyllaDB docs: Bloom filters (<code>bloom_filter_fp_chance</code>), Read path. Bits per key = 1.44 × log2(1/p); 1 billion keys is an example.'
    },
    {
      title: 'The row cache and the wash-out of a scan', short: 'row cache', kind: 'cachefill',
      intro: 'Hot rows are served from a cache without touching any SSTable. A big scan can fill the cache with rows nobody will read again.',
      trigger: 'A dashboard reads the same 8 hot sellers all day. Every night a report scans millions of cold rows (example).',
      run: "SELECT * FROM orders WHERE seller_id = 'seller-17';          -- hot point read, cacheable\nSELECT * FROM orders BYPASS CACHE;                            -- a scan that must not fill the cache",
      expect: 'A cache hit reads no SSTable. A scan without BYPASS CACHE evicts the hot rows; with it, the hot rows stay.',
      steps: [
        S('A warm cache', 'The cache holds the 8 hot rows, with room for more. 90% of reads hit it and need no SSTable.', { cells: 'hhhhhhhh........', hit: 90 }, 'hit rate 90%'),
        S('A cache hit', 'A read for a hot seller finds its row in the cache and returns. No bloom filter, no index, no data-file read.', { cells: 'hhhhhhhh........', hit: 90, hitRow: true }, 'SSTables read: 0'),
        S('A scan starts', 'The report scans cold rows. Each row it reads is also put in the cache, because the cache is filled on read.', { cells: 'hhhhhhhhcccccccc', hit: 90 }, 'cache filling with cold rows'),
        S('Hot rows are evicted', 'The cache is full, so new cold rows push out the least recently used rows, including hot ones that were idle for a moment. The hit rate collapses and every dashboard read goes to disk.', { cells: 'cccccccccccccccc', hit: 15 }, 'hit rate 15%'),
        S('BYPASS CACHE', 'Running the scan with <code>BYPASS CACHE</code> tells the replica not to use or fill the cache for that query. The hot rows are left alone.', { cells: 'hhhhhhhh........', hit: 90, bypass: true }, 'hit rate stays 90%'),
        S('Write the cold work to be cache-free', 'Make analytical scans use BYPASS CACHE by default, or run them on a separate datacenter or replica so they cannot compete with the serving traffic.', { cells: 'hhhhhhhh........', hit: 90, bypass: true, sep: true }, 'scans isolated from serving')
      ],
      edges: [
        E('Rows that change constantly', 'Cached rows are invalidated by writes, so a hot-and-written key benefits less.', 'Look at the hit rate per table, not only globally, and cache what is read far more than written.'),
        E('Large rows', 'Big partitions are not kept whole in the cache, and a wide row may be cached in parts.', 'Keep partitions bounded (feature 1) so cache entries and reads stay small.')
      ],
      invariant: 'Rows read normally are put in the cache; a query run with BYPASS CACHE neither uses nor fills it.',
      src: 'ScyllaDB docs: Read path (row cache), CQL SELECT (<code>BYPASS CACHE</code>), performance tips. Hit rates are examples.'
    }
  ];

  CourseData.uc.compact = [
    {
      title: 'Compaction merges files and drops overwritten cells', short: 'merge', animation: {
        kind: 'lsm', memCap: 3, threshold: 3, key: 'a',
        presets: [
          { label: 'Merge three SSTables', ops: FILL1.concat(FILL2, FILL3, [{ op: 'compact' }]) },
          { label: 'Reads before and after', ops: FILL1.concat(FILL2, FILL3, [G('a'), { op: 'compact' }, G('a')]) },
          { label: 'Too few files to merge', ops: FILL1.concat(FILL2, [{ op: 'compact' }]) }
        ]
      },
      intro: 'Size-tiered compaction waits for several SSTables of similar size and merges them into one. See what the merge drops, and what a read costs before and after.',
      trigger: 'After a week of writes, read p99 doubled and the disk alarm fired. The key <code>a</code> has been updated in every flush (illustrative).',
      run: "nodetool compactionstats      -- pending and running compactions\nnodetool compact shop orders   -- force a major compaction (use with care)",
      expect: 'The merge writes one new SSTable containing the newest cell of each key and then deletes the inputs. Reads then touch one file instead of three.',
      edges: [
        E('Compaction competes with reads and writes', 'Merging reads and writes a lot of data on the same disks as foreground traffic.', 'The node schedules compaction against foreground I/O, but a node near its limits still slows down. Size for it.'),
        E('A forced major compaction', 'A manual full compaction makes one huge SSTable, which then waits a long time to be merged again under size-tiered compaction.', 'Avoid it routinely, and do it only with free disk for the full output.')
      ],
      invariant: 'A compaction output holds the newest cell of every key from its inputs, and the inputs are deleted only after the output is complete.',
      src: 'ScyllaDB docs: Compaction (<code>architecture/compaction</code>), Compaction strategies. The demo threshold of 3 is smaller than the real default min_threshold of 4.'
    },
    {
      title: 'Choosing a compaction strategy', short: 'strategies', kind: 'strategies',
      intro: 'Each strategy trades write work, read work and disk space differently. Match it to how the table is written and read.',
      trigger: 'Three tables: orders written once and kept 7 days, sessions updated often and read a lot, and a bulk ingest table (example workloads).',
      run: "ALTER TABLE orders WITH compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1};\nALTER TABLE sessions WITH compaction = {'class': 'LeveledCompactionStrategy'};",
      expect: 'Orders (time series with TTL) fit time-window; sessions (read-heavy, overwritten) fit leveled; bulk ingest fits size-tiered.',
      steps: [
        S('Three costs', 'Every strategy pays in <b>write amplification</b> (how many times data is rewritten), <b>read amplification</b> (files per read) and <b>space amplification</b> (disk beyond live data).', { upto: 0 }, 'three costs to trade'),
        S('Size-tiered (STCS)', 'Merge files of similar size once enough exist. Data is rewritten few times, so writes are cheap. But reads may touch many files, and a big merge needs up to as much free space as its inputs.', { upto: 1 }, 'cheap writes · more files per read · more space'),
        S('Leveled (LCS)', 'Small non-overlapping files in levels. A read touches about one file per level and little space is wasted, but data is rewritten many times as it moves down the levels.', { upto: 2 }, 'cheap reads · costly writes'),
        S('Time-window (TWCS)', 'Group files by write time. Old windows are not merged again and a whole expired window is dropped as a file. Ideal for append-only data with a TTL; poor if old data is updated.', { upto: 3 }, 'time series with TTL'),
        S('Pick by workload', 'Orders written once and expired after 7 days: time-window. Sessions read often and rewritten: leveled. A bulk-ingest table that is mostly written: size-tiered.', { upto: 4 }, 'orders: TWCS · sessions: LCS · ingest: STCS'),
        S('Changing later costs a rewrite', 'Changing the strategy does not rewrite files at once, but the new rules apply as compactions run, and the transition itself is heavy I/O. Test on a copy of the traffic.', { upto: 4, change: true }, 'plan the transition')
      ],
      edges: [
        E('Updating old rows under TWCS', 'An update to a row in an old window writes a new cell in a new window, so the old and new versions are in different files that never merge.', 'Use TWCS only for data that is not updated after its window closes.'),
        E('LCS write cost on a write-heavy table', 'Rewriting through levels makes the disk the bottleneck for sustained writes.', 'Keep LCS for read-heavy tables and give a write-heavy table STCS or TWCS.')
      ],
      invariant: 'No strategy is best on all three amplifications; the right one is the one that is cheap where your workload is heavy.',
      src: 'ScyllaDB docs: Compaction strategies (size-tiered, leveled, time-window) and their trade-offs. Qualitative ratings, not measurements.'
    },
    {
      title: 'Headroom: compaction needs space to write first', short: 'disk headroom', kind: 'headroom',
      intro: 'A merge writes its output before it deletes its inputs. See how much free disk that takes, and what happens when flushes outrun compaction.',
      trigger: 'A node has a 10 TB disk at 50% full (example). Four SSTables of 1 TB each are due for a merge.',
      run: "df -h /var/lib/scylla/data\nnodetool compactionstats\n-- troubleshooting: critical disk utilization (the node protects itself before the disk is full)",
      expect: 'The merge briefly needs about 4 TB of extra space. Plan steady-state use well under the point where the largest merge fits.',
      steps: [
        S('A node at 50%', 'The disk is half full. All SSTables are live; nothing is merging.', { used: 50, label: 'steady state' }, 'disk used 50%'),
        S('A merge starts', 'Compaction reads four 1 TB files and writes their merged output. The output grows while the inputs still exist.', { used: 70, label: 'merging: output growing' }, 'disk used 70%'),
        S('The peak', 'At the end of the merge the output is complete (about 4 TB if little was overwritten) and the inputs are still on disk. Usage peaks at 90%.', { used: 90, label: 'peak: inputs and output together' }, 'disk used 90%'),
        S('Inputs are deleted', 'Only now are the four inputs removed. If many cells were overwritten the output is smaller than the sum of the inputs, and usage settles lower.', { used: 45, label: 'after the merge' }, 'disk used 45%'),
        S('Flushes outrun compaction', 'If writes are faster than merges, SSTables pile up and compaction falls behind. Space of overwritten data is not reclaimed, and usage creeps up.', { used: 95, label: 'compaction behind', behind: true }, 'disk used 95% · pending grows'),
        S('The node protects itself', 'Near full the node refuses new writes rather than risk running out of space for compaction itself. Recovery needs free space and a shed load (see the critical disk utilization page).', { used: 98, label: 'writes refused', behind: true, refuse: true }, 'writes refused near full')
      ],
      edges: [
        E('A big last tier under STCS', 'The largest tier needs the most space to merge, so one huge SSTable makes the next major merge impossible on a nearly full disk.', 'Keep disks at about half used (or less) for size-tiered tables, and add nodes before that point.'),
        E('Snapshots eat space too', 'A snapshot is hard links to SSTables, and the files stay on disk after compaction deletes them from the live set.', 'Delete old snapshots and watch <code>nodetool listsnapshots</code>.')
      ],
      invariant: 'A compaction output is complete before its inputs are deleted, so free space must cover the largest merge.',
      src: 'ScyllaDB docs: Compaction (space amplification), troubleshooting critical disk utilization, system requirements. Disk size and percentages are examples.'
    }
  ];
})();
