/* Use cases for features 4 to 6: persistence, replication, Sentinel. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const P16 = n => Array.from({ length: 16 }, (_, i) => (n.includes(i) ? 1 : 0));

  RD.uc.persist = [
    {
      title: 'A snapshot by fork and copy-on-write', short: 'RDB fork', kind: 'pages',
      intro: 'BGSAVE forks a child that sees the data as of that instant while the parent keeps taking writes.',
      trigger: 'The save rule <code>300 100</code> fires: 100 changes in 300 s. Redis starts a background save while traffic continues.',
      run: 'redis-cli BGSAVE\nredis-cli INFO persistence   # latest_fork_usec, rdb_last_cow_size\n# 7.2 default: save 3600 1 300 100 60 10000',
      expect: 'A consistent <code>dump.rdb</code>, at the cost of extra memory equal to the pages the parent changed meanwhile.',
      steps: [
        S('Before the fork', 'The parent holds the dataset in 16 memory pages (a toy number). No child exists.', { pages: P16([]), child: 0, prog: 0 }, 'memory: 16 pages'),
        S('fork()', 'The child is created. It shares every page with the parent; only page tables are copied. Fork time grows with resident memory (<code>latest_fork_usec</code>), and the parent is paused for it.', { pages: P16([]), child: 1, prog: 0 }, 'memory: 16 pages · both share them'),
        S('Parent writes pages 3 and 9', 'The first write to a shared page makes the kernel copy it. The parent changes its copy; the child still sees the old one. That is the point-in-time view.', { pages: P16([3, 9]), child: 1, prog: 5 }, 'memory: 18 pages · cow 2'),
        S('More writes while the child works', 'Three more pages are touched, so five are now duplicated. The child is a bit over a third done.', { pages: P16([3, 9, 4, 5, 11]), child: 1, prog: 6 }, 'memory: 21 pages · cow 5'),
        S('Child finishes', 'The child writes a temporary file, renames it over <code>dump.rdb</code> and exits. The duplicated pages are released. <code>rdb_last_cow_size</code> reports the peak copy.', { pages: P16([]), child: 2, prog: 16 }, 'memory: 16 pages · snapshot saved'),
        S('Worst case', 'If every page is written during the save, every page is duplicated: memory is about double. Plan headroom for it.', { pages: P16(Array.from({ length: 16 }, (_, i) => i)), child: 1, prog: 10 }, 'memory: 32 pages · cow 16')
      ],
      edges: [
        E('Transparent huge pages', 'With 2 MB huge pages one small write copies 2 MB, so copy-on-write grows fast and latency spikes.', 'Disable THP on the host (Redis warns about it at startup).'),
        E('Fork fails', 'If the OS refuses to reserve memory for the child, <code>BGSAVE</code> fails with a fork error.', 'Set <code>vm.overcommit_memory = 1</code> and keep real headroom.')
      ],
      invariant: 'The snapshot reflects the dataset exactly as of the fork, no matter what the parent writes after.',
      src: 'redis.conf 7.2 (save 3600 1 300 100 60 10000). Page counts are a toy example; fork-time and THP behaviour are from general knowledge, not re-read in docs.'
    },
    {
      title: 'AOF everysec: the loss window', short: 'AOF everysec', kind: 'window',
      intro: 'With the default policy a write is acknowledged before it reaches the disk. A crash can lose the writes since the last fsync.',
      trigger: 'The server runs with <code>appendonly yes</code> and <code>appendfsync everysec</code>. It loses power 2.6 s after start.',
      run: 'redis-cli CONFIG SET appendonly yes\nredis-cli CONFIG GET appendfsync   # everysec is the default',
      expect: 'Writes up to the last whole-second fsync survive; later acknowledged writes are lost.',
      steps: [
        S('Writes are acknowledged', 'Each write is appended to the AOF buffer and written to the file with <code>write()</code> (into the OS cache), then the client gets <code>+OK</code>. fsync has not run yet.', { t: 0.9, crash: null }, 'acknowledged: 3 · on disk: 0'),
        S('fsync at 1.0 s', 'A background thread calls fsync. The three earlier writes are now on disk.', { t: 1.0, crash: null }, 'acknowledged: 3 · on disk: 3'),
        S('fsync at 2.0 s', 'Two more writes (1.3 s, 1.8 s) are made durable.', { t: 2.0, crash: null }, 'acknowledged: 5 · on disk: 5'),
        S('Writes after the fsync', 'Two more writes arrive at 2.2 s and 2.5 s. They are acknowledged but the next fsync is at 3.0 s.', { t: 2.5, crash: null }, 'acknowledged: 7 · on disk: 5'),
        S('Crash at 2.6 s', 'Power fails. The two writes since the 2.0 s fsync were in the OS cache only and are gone.', { t: 2.6, crash: 2.6 }, 'lost: 2 acknowledged writes'),
        S('appendfsync always', 'The server fsyncs before replying. Nothing acknowledged is lost, but each write waits for the disk, so throughput drops.', { t: 2.6, crash: 2.6, always: true }, 'lost: 0 · slower writes')
      ],
      edges: [
        E('A slow disk', 'If an fsync takes longer than a second, Redis delays the next write up to about 2 s and logs "Asynchronous AOF fsync is taking too long". The window grows beyond 1 s.', 'Put the AOF on a disk with steady fsync latency and watch <code>aof_delayed_fsync</code>.'),
        E('During a rewrite', '<code>no-appendfsync-on-rewrite</code> (default <code>no</code>) controls whether fsync is skipped while a child rewrites.', 'Leave it <code>no</code> unless fsync stalls hurt more than the extra loss window.')
      ],
      invariant: 'Under everysec, only writes newer than the last completed fsync can be lost.',
      src: 'redis.conf 7.2 (appendfsync everysec, no-appendfsync-on-rewrite no); <code>beforeSleep</code> in <code>src/server.c</code> flushes the AOF before writing client replies. The "about 2 s" figure is the documented behaviour, not re-read. Times are examples.'
    },
    {
      title: 'AOF rewrite with multi-part files', short: 'AOF rewrite', kind: 'ledger',
      intro: 'The log grows forever. A rewrite compacts it into a new base file while writes continue into a fresh incremental file.',
      trigger: 'The AOF is over <code>auto-aof-rewrite-min-size</code> (64mb) and has grown 100% since the last rewrite.',
      run: 'redis-cli BGREWRITEAOF\nls appendonlydir/\n# appendonly.aof.1.base.rdb  appendonly.aof.1.incr.aof  appendonly.aof.manifest',
      expect: 'A new base and incremental pair replaces the old files, and the manifest changes at the end.',
      steps: [
        S('Steady state', 'The directory <code>appendonlydir</code> holds a base file (RDB format), an incremental file taking writes, and a manifest that names them.', { files: [['appendonly.aof.1.base.rdb', 'live', 'base'], ['appendonly.aof.1.incr.aof', 'live', 'taking writes'], ['appendonly.aof.manifest', 'live', 'lists the set']] }, 'writes go to incr.1'),
        S('Rewrite triggers', 'Size is over 64mb and 100% larger than after the last rewrite (<code>auto-aof-rewrite-percentage 100</code>). Redis forks a child.', { files: [['appendonly.aof.1.base.rdb', 'live', 'base'], ['appendonly.aof.1.incr.aof', 'live', 'taking writes'], ['appendonly.aof.manifest', 'live', 'lists the set']] }, 'child forked'),
        S('Writes switch files', 'The parent opens a new incremental file, so new writes no longer go to incr.1. The child writes the new base from its snapshot (<code>aof-use-rdb-preamble yes</code>).', { files: [['appendonly.aof.1.base.rdb', 'live', 'base'], ['appendonly.aof.1.incr.aof', 'live', 'frozen'], ['appendonly.aof.2.incr.aof', 'new', 'taking writes'], ['appendonly.aof.2.base.rdb', 'new', 'child writing'], ['appendonly.aof.manifest', 'live', 'still the old set']] }, 'a crash now still loads the old set'),
        S('Manifest swap', 'When the child is done, the parent rewrites the manifest to name base.2 and incr.2 and marks the old files as history.', { files: [['appendonly.aof.1.base.rdb', 'old', 'history'], ['appendonly.aof.1.incr.aof', 'old', 'history'], ['appendonly.aof.2.incr.aof', 'live', 'taking writes'], ['appendonly.aof.2.base.rdb', 'live', 'base'], ['appendonly.aof.manifest', 'live', 'new set']] }, 'switched atomically'),
        S('Cleanup', 'The history files are deleted. The set is now smaller, and a restart loads base.2 then replays incr.2.', { files: [['appendonly.aof.1.base.rdb', 'gone', 'deleted'], ['appendonly.aof.1.incr.aof', 'gone', 'deleted'], ['appendonly.aof.2.incr.aof', 'live', 'taking writes'], ['appendonly.aof.2.base.rdb', 'live', 'base'], ['appendonly.aof.manifest', 'live', 'new set']] }, 'smaller AOF')
      ],
      edges: [
        E('Crash mid-rewrite', 'The new base is still being written and the manifest still names the old set.', 'On restart Redis loads what the manifest lists and discards the half-built files.'),
        E('Older versions', 'Before 7.0 there was one AOF file and the parent buffered writes in memory during the rewrite.', 'Multi-part files removed that extra memory and file copy; this use case describes 7.x.')
      ],
      invariant: 'The manifest always names a complete set, so a crash at any moment leaves a loadable AOF.',
      src: 'redis.conf 7.2 (appenddirname appendonlydir, auto-aof-rewrite-percentage 100, min-size 64mb, aof-use-rdb-preamble yes). File names follow the 7.0 multi-part scheme; the order of manifest update is from knowledge.'
    }
  ];

  RD.uc.repl = [
    {
      title: 'Partial resync from the backlog', short: 'PSYNC backlog', kind: 'ring',
      intro: 'A replica that reconnects sends its last offset. If the primary still has that part of the stream, only the gap is sent.',
      trigger: 'A replica loses its link for a short time, then reconnects. Later it is away for much longer.',
      run: 'redis-cli INFO replication   # master_repl_offset, repl_backlog_*\n# repl-backlog-size 1mb and repl-backlog-ttl 3600 are the defaults',
      expect: 'Short gap: <code>+CONTINUE</code>. Gap older than the backlog: <code>+FULLRESYNC</code> with a new RDB.',
      steps: [
        S('In sync', 'Replica offset equals the primary\'s (4800, in KB of stream, an example). The backlog holds the most recent 1024 KB of writes.', { lo: 3776, hi: 4800, rep: 4800, max: 9500 }, 'replica offset 4800'),
        S('Link drops, writes continue', 'The primary keeps writing and keeps the last 1024 KB in the backlog: now 4176 to 5200. The replica\'s offset 4800 is still inside it.', { lo: 4176, hi: 5200, rep: 4800, max: 9500 }, 'gap: 400 KB · inside the backlog'),
        S('Reconnect: PSYNC', 'The replica sends its replication id and offset 4800. The offset is in range, so the primary answers <code>+CONTINUE</code> and sends just the 400 KB.', { lo: 4176, hi: 5200, rep: 4800, max: 9500, res: 'CONTINUE' }, 'partial resync · 400 KB'),
        S('A long outage', 'Much later the primary is at 9000 and the backlog covers 7976 to 9000. The replica is still at 5200, far behind the window.', { lo: 7976, hi: 9000, rep: 5200, max: 9500 }, 'gap: 3800 KB · outside'),
        S('Reconnect: PSYNC fails', 'The needed bytes are gone, so the primary answers <code>+FULLRESYNC</code>: a new RDB (sent over the socket with <code>repl-diskless-sync yes</code>) followed by the live stream.', { lo: 7976, hi: 9000, rep: 5200, max: 9500, res: 'FULLRESYNC' }, 'full resync · whole dataset')
      ],
      edges: [
        E('Sizing the backlog', 'The default 1 MB covers a tiny gap. At 5 MB/s of writes, a 60 s outage is 300 MB.', 'Set <code>repl-backlog-size</code> to write rate × the longest outage you want to survive (here 300mb), within memory headroom.'),
        E('After a failover', 'A promoted replica remembers the old primary\'s replication id and offset.', 'Other replicas can still do a partial resync against the new primary, so a failover often avoids full resyncs.')
      ],
      invariant: 'A partial resync is only granted when every missing byte is still in the backlog.',
      src: 'redis.conf 7.2 (repl-backlog-size 1mb, repl-backlog-ttl 3600, repl-diskless-sync yes, repl-diskless-sync-delay 5). Offsets are examples.'
    },
    {
      title: 'An acknowledged write is lost on failover', short: 'async ack loss', kind: 'ack',
      intro: 'Replication is asynchronous. The primary replies before the replica has the write.',
      trigger: 'A client stores a paid order, gets <code>+OK</code>, and then the primary crashes before the replication packet is delivered.',
      run: 'redis-cli CONFIG SET min-replicas-to-write 1\nredis-cli CONFIG SET min-replicas-max-lag 10   # min-replicas-to-write defaults to 0 (off)',
      expect: 'After promotion the order key is missing, even though the client was told it was saved.',
      steps: [
        S('Client writes', 'The client sends <code>SET order:77 paid</code> to the primary.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }] }, 'primary has the write'),
        S('Reply goes out first', 'The primary applies it and replies <code>+OK</code> without waiting for the replica.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }, { f: 1, t: 0, m: '+OK' }] }, 'client believes it is saved'),
        S('Replication is in flight', 'The command is queued to the replica stream but has not been delivered.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }, { f: 1, t: 0, m: '+OK' }, { f: 1, t: 2, m: 'stream: SET order:77', lost: true }] }, 'replica offset behind the primary'),
        S('Primary dies', 'The primary crashes. The queued message never reaches the replica.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }, { f: 1, t: 0, m: '+OK' }, { f: 1, t: 2, m: 'stream: SET order:77', lost: true }, { f: 1, t: 1, m: 'primary crashes', crash: true }] }, 'write exists nowhere'),
        S('Replica is promoted', 'A replica without the write becomes primary. A read for <code>order:77</code> returns nil.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }, { f: 1, t: 0, m: '+OK' }, { f: 1, t: 2, m: 'stream: SET order:77', lost: true }, { f: 1, t: 1, m: 'primary crashes', crash: true }, { f: 0, t: 2, m: 'GET order:77 → (nil)' }] }, 'acknowledged write lost'),
        S('Reduce the window', '<code>min-replicas-to-write 1</code> makes the primary refuse writes when no replica is within <code>min-replicas-max-lag</code> seconds. It narrows the window but does not close it.', { rows: [{ f: 0, t: 1, m: 'SET order:77 paid' }, { f: 1, t: 0, m: '-NOREPLICAS (no replica in lag)', lost: true }] }, 'bounded loss, not zero')
      ],
      edges: [
        E('WAIT is not consensus', '<code>WAIT 1 100</code> blocks until one replica acknowledges the client\'s writes. It still does not guarantee that replica is the one promoted.', 'Treat it as a smaller window, and make writes idempotent so a lost one can be retried.'),
        E('Where it matters', 'An order, a payment or a counter that must never go backwards.', 'Keep the system of record in a store with synchronous replication and use Redis for derived or recreatable state.')
      ],
      invariant: 'With asynchronous replication, a write can be acknowledged and still absent from the replica that becomes primary.',
      src: '<code>src/config.c</code> 7.2: min-replicas-to-write default 0; redis.conf documents min-replicas-max-lag 10. The failover timeline is a worked example.'
    },
    {
      title: 'Replica lag and WAIT', short: 'offsets and WAIT', kind: 'offsets',
      intro: 'Each replica reports the offset it has applied. Comparing offsets shows lag, and WAIT lets one client wait for them.',
      trigger: 'A burst of writes raises the primary\'s offset. Replicas confirm progress on a heartbeat.',
      run: 'redis-cli INFO replication   # master_repl_offset, slaveN: offset=..,lag=..\nredis-cli WAIT 1 100',
      expect: '<code>WAIT 1 100</code> returns 1 once one replica reaches the client\'s offset, or after 100 ms with the count it has.',
      steps: [
        S('In sync', 'Primary and both replicas are at offset 1000 (an example).', { p: 1000, r: [1000, 1000], wait: null }, 'lag: 0 and 0'),
        S('A burst of writes', 'The primary is at 1600. Replicas send <code>REPLCONF ACK</code> about once a second, so their reported offsets trail: 1400 and 900.', { p: 1600, r: [1400, 900], wait: null }, 'lag: 200 and 700'),
        S('WAIT 1 100', 'The client asks for one replica to reach 1600 within 100 ms. The first replica gets there, so WAIT returns 1.', { p: 1600, r: [1600, 1100], wait: 'WAIT 1 100 → 1' }, 'one replica caught up'),
        S('WAIT 2 100', 'The client asks for two. The second is still at 1100 when 100 ms is up, so WAIT returns 1, less than asked.', { p: 1600, r: [1600, 1250], wait: 'WAIT 2 100 → 1 (timed out)' }, 'caller must handle 1 < 2'),
        S('The slow replica', 'A replica that stays behind is where an old read or a failover loses data. Watch its offset, not just whether it is connected.', { p: 1600, r: [1600, 1250], wait: null, alert: 1 }, 'investigate replica 2')
      ],
      edges: [
        E('WAIT does not mean on disk', 'It counts replicas that applied the write, not that they fsynced it. Redis 7.2 added <code>WAITAOF</code> for that.', 'Use <code>WAITAOF</code> when you need a local or replica fsync before continuing.'),
        E('Stale reads', 'A replica keeps serving reads while it is behind or syncing (<code>replica-serve-stale-data yes</code>).', 'Send reads that must see a recent write to the primary, or check the offset first.')
      ],
      invariant: 'A replica\'s offset never passes the primary\'s; lag is the difference between them.',
      src: '<code>src/commands/waitaof.json</code> 7.2 (since 7.2.0), <code>src/replication.c</code> (REPLCONF ACK), redis.conf (replica-serve-stale-data yes). Offsets are examples.'
    }
  ];

  RD.uc.ha = [
    {
      title: 'From SDOWN to ODOWN by quorum', short: 'SDOWN to ODOWN', kind: 'votes',
      intro: 'One Sentinel thinking the primary is down is just an opinion. A quorum of opinions makes it official.',
      trigger: 'The primary stops answering PING. Three Sentinels watch it with quorum 2.',
      run: 'sentinel monitor mymaster 10.0.0.5 6379 2\nsentinel down-after-milliseconds mymaster 30000   # the default',
      expect: 'After 30 s each Sentinel marks the primary SDOWN. Two agreeing reports make it ODOWN and start a failover.',
      steps: [
        S('All healthy', 'Three Sentinels ping the primary. Each sees it up.', { v: [0, 0, 0], q: 2 }, 'SDOWN reports: 0 of 2'),
        S('Sentinel 1 decides alone', 'No valid reply for 30000 ms (<code>down-after-milliseconds</code>). Sentinel 1 marks the primary SDOWN ("subjectively down").', { v: [1, 0, 0], q: 2 }, 'SDOWN reports: 1 of 2'),
        S('It asks the others', 'Sentinel 1 sends <code>SENTINEL is-master-down-by-addr</code>. Sentinels 2 and 3 still see the primary, so they answer no.', { v: [1, 0, 0], q: 2, ask: true }, 'SDOWN reports: 1 of 2 · not enough'),
        S('A second Sentinel agrees', 'Sentinel 2 also passes 30 s without a reply and marks SDOWN. Sentinel 1 learns of it.', { v: [1, 1, 0], q: 2 }, 'SDOWN reports: 2 of 2'),
        S('ODOWN', 'Two reports reach the quorum, so the primary is "objectively down". A Sentinel can now ask to lead a failover.', { v: [1, 1, 0], q: 2, odown: true }, 'ODOWN · failover may start')
      ],
      edges: [
        E('The 30 s delay', 'With defaults a dead primary is detected only after 30 s.', 'Lower <code>down-after-milliseconds</code> (for example 5000), accepting more false alarms on pauses and network blips.'),
        E('Quorum is only for detection', 'The quorum decides ODOWN. Authorising the failover needs a vote from a majority of all Sentinels.', 'Run an odd number (3 or 5) in separate failure domains; a quorum of 2 of 2 would be a single point.')
      ],
      invariant: 'One Sentinel\'s view alone never triggers a failover.',
      src: '<code>sentinel.conf</code> 7.2 (sentinel monitor ... 2, down-after-milliseconds 30000, and the note on quorum vs majority).'
    },
    {
      title: 'Elect a leader, promote the best replica', short: 'election', kind: 'roles',
      intro: 'Sentinels vote for one leader per epoch. The leader picks the replica to promote and re-points the rest.',
      trigger: 'The primary is ODOWN. There are three replicas with different priorities and offsets.',
      run: 'redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster\nredis-cli -p 26379 SENTINEL failover mymaster   # manual',
      expect: 'The replica with the best (priority, offset, run id) becomes primary; others replicate from it.',
      steps: [
        S('Primary is down', 'ODOWN is reached. Candidates: R1 (priority 100, offset 1990), R2 (priority 100, offset 2000), R3 (priority 0, offset 2000).', { nodes: [['P', 'down', 'ODOWN'], ['R1', 'replica', 'prio 100 · off 1990'], ['R2', 'replica', 'prio 100 · off 2000'], ['R3', 'replica', 'prio 0 · off 2000']] }, 'epoch 6'),
        S('A leader is elected', 'Sentinel A raises the epoch to 7 and asks for votes. Each Sentinel grants one vote per epoch. Two of three is a majority, so A leads.', { nodes: [['P', 'down', 'ODOWN'], ['R1', 'replica', 'prio 100 · off 1990'], ['R2', 'replica', 'prio 100 · off 2000'], ['R3', 'replica', 'prio 0 · off 2000']], leader: 'Sentinel A · epoch 7' }, 'majority 2 of 3'),
        S('Choose the replica', 'R3 has priority 0, which means never promote. R1 and R2 tie on priority; R2 has the larger replication offset, so it has the most data.', { nodes: [['P', 'down', 'ODOWN'], ['R1', 'replica', 'prio 100 · off 1990'], ['R2', 'candidate', 'chosen · off 2000'], ['R3', 'replica', 'prio 0 · skipped']], leader: 'Sentinel A · epoch 7' }, 'R2 chosen'),
        S('Promote', 'A sends <code>REPLICAOF NO ONE</code> to R2 and waits until R2 reports role master.', { nodes: [['P', 'down', 'ODOWN'], ['R1', 'replica', 'prio 100 · off 1990'], ['R2', 'primary', 'new primary'], ['R3', 'replica', 'prio 0']], leader: 'Sentinel A · epoch 7' }, 'R2 is primary'),
        S('Re-point the others', 'R1 and R3 get <code>REPLICAOF R2</code>. With <code>parallel-syncs 1</code> they resync one at a time so some replica stays available for reads.', { nodes: [['P', 'down', 'ODOWN'], ['R1', 'replica', 'now follows R2'], ['R2', 'primary', 'new primary'], ['R3', 'replica', 'now follows R2']], leader: 'Sentinel A · epoch 7' }, 'parallel-syncs = 1'),
        S('The old primary returns', 'When P comes back, Sentinels turn it into a replica of R2. Any writes it took but never replicated are discarded when it resyncs.', { nodes: [['P', 'replica', 'follows R2 · old writes dropped'], ['R1', 'replica', 'follows R2'], ['R2', 'primary', 'new primary'], ['R3', 'replica', 'follows R2']], leader: 'Sentinel A · epoch 7' }, 'failover complete')
      ],
      edges: [
        E('Failover keeps failing', 'If a failover does not finish within <code>failover-timeout</code> (180000 ms default), it is abandoned and may be retried later by another leader.', 'Check that replicas are reachable and that a majority of Sentinels are alive.'),
        E('Clients must follow', 'The address of the primary changes.', 'Ask Sentinel with <code>SENTINEL get-master-addr-by-name</code>, or use a Sentinel-aware client that reconnects on the switch event.')
      ],
      invariant: 'At most one Sentinel leads a given epoch, and a higher epoch overrides a lower one.',
      src: '<code>sentinel.conf</code> 7.2 (failover-timeout 180000, parallel-syncs 1). Replica selection order (priority, offset, run id) is from knowledge of Sentinel, not re-read in source.'
    },
    {
      title: 'Split brain and min-replicas', short: 'split brain', kind: 'split',
      intro: 'If the old primary is cut off but alive, clients on its side keep writing to it while a new primary is chosen elsewhere.',
      trigger: 'A network partition isolates the old primary and one client from the Sentinels and the replicas.',
      run: 'sentinel failover-timeout mymaster 180000\nredis-cli CONFIG SET min-replicas-to-write 1\nredis-cli CONFIG SET min-replicas-max-lag 10',
      expect: 'Without a limit, writes on the isolated side are lost at heal; with it, the old primary refuses writes after 10 s.',
      steps: [
        S('Healthy', 'One primary, replicas, three Sentinels, and clients on both sides of what will become the cut.', { left: { name: 'old primary + client A', w: 0 }, right: { name: 'Sentinels + replica + client B', w: 0 }, part: false }, 'one primary'),
        S('The partition', 'The old primary and client A can reach each other but nothing else.', { left: { name: 'old primary + client A', w: 0 }, right: { name: 'Sentinels + replica + client B', w: 0 }, part: true }, 'link cut'),
        S('A new primary on the other side', 'The Sentinels reach ODOWN and promote the replica. Client B writes to it normally.', { left: { name: 'old primary + client A', w: 0 }, right: { name: 'Sentinels + NEW primary + client B', w: 2 }, part: true }, 'two primaries exist'),
        S('Client A is still writing', 'Client A has no way to know, and its writes are acknowledged by the old primary.', { left: { name: 'old primary + client A', w: 3 }, right: { name: 'Sentinels + NEW primary + client B', w: 5 }, part: true }, 'divergent writes: 3 and 5'),
        S('The partition heals', 'Sentinels demote the old primary to a replica. It resyncs from the new primary and its 3 writes are discarded.', { left: { name: 'old primary becomes a replica', w: 0 }, right: { name: 'new primary', w: 5 }, part: false, lost: 3 }, 'lost: 3 acknowledged writes'),
        S('With min-replicas set', 'With <code>min-replicas-to-write 1</code> and <code>max-lag 10</code>, the isolated primary has no replica within 10 s, so after that it answers <code>-NOREPLICAS</code>. Client A\'s loss is limited to roughly the first 10 s.', { left: { name: 'old primary + client A', w: 3, refuse: true }, right: { name: 'Sentinels + NEW primary + client B', w: 5 }, part: true, bounded: true }, 'loss bounded by max-lag')
      ],
      edges: [
        E('Not zero loss', 'The limit applies only after the lag threshold passes; writes inside the window are still lost.', 'If that is not acceptable, lower max-lag and accept more refused writes, or choose a store that writes with consensus.'),
        E('Clients stuck on the old primary', 'A client with a long-lived connection keeps talking to the old primary.', 'Use short timeouts and have clients re-ask Sentinel when writes fail.')
      ],
      invariant: 'Two nodes may both believe they are primary during a partition; only one history survives the heal.',
      src: 'redis.conf 7.2 documents <code>min-replicas-to-write</code> (default 0 in <code>src/config.c</code>) and <code>min-replicas-max-lag</code> (10). The scenario counts are an example.'
    }
  ];
})();
