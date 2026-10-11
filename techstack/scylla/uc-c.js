/* Use cases for features 7 to 9: deletes and repair, tablets, Raft metadata.
 * Step shape: S(title, text, state, statLine). The state is the whole scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  const P = k => ({ op: 'put', k }), D = k => ({ op: 'del', k }), G = k => ({ op: 'get', k });
  const FILL1 = [P('a'), P('b'), P('c')], DEL = [D('a'), P('d'), P('e')], FILL3 = [P('f'), P('g'), P('h')];

  CourseData.uc.tomb = [
    {
      title: 'A delete is a tombstone, not an erase', short: 'tombstone', animation: {
        kind: 'lsm', memCap: 3, threshold: 3, key: 'a',
        presets: [
          { label: 'A delete is a new cell', ops: FILL1.concat(DEL, [G('a')]) },
          { label: 'Compaction keeps the tombstone', ops: FILL1.concat(DEL, FILL3, [{ op: 'compact', purge: false }, G('a')]) },
          { label: 'Purge after gc_grace_seconds', ops: FILL1.concat(DEL, FILL3, [{ op: 'compact', purge: true }, G('a')]) }
        ]
      },
      intro: 'Deleting key a writes a new cell with a timestamp. The old value stays in an older file, hidden. See the read return "deleted", and watch when compaction is allowed to forget the tombstone.',
      trigger: 'An order is deleted. The old row sits in an SSTable written a week ago, and the delete lands in the memtable (illustrative).',
      run: "DELETE FROM orders WHERE id = 42;\nSELECT * FROM orders WHERE id = 42;   -- empty, but the value is still on disk\nALTER TABLE orders WITH gc_grace_seconds = 864000;   -- 10 days, the default",
      expect: 'The read returns nothing because the newest cell is a tombstone. The old value is removed only when a compaction sees both and the tombstone is old enough to purge.',
      edges: [
        E('Purging too early', 'If the tombstone is dropped before every replica has it, a replica that missed the delete still holds the old value and brings it back.', 'Run repair within gc_grace_seconds; in repair mode, the tombstone is only purged after a repair.'),
        E('TTL is a delete in disguise', 'An expired cell is treated as a tombstone, so a table with a short TTL generates tombstones on its own.', 'Pair TTL with a time-window strategy so whole expired files are dropped, and keep TTL tables from being read as queues.')
      ],
      invariant: 'A delete is a cell with a timestamp; it shadows older cells and can be purged only when every older copy is also gone and the grace period has passed.',
      src: 'ScyllaDB docs: Tombstones, <code>gc_grace_seconds</code> and tombstone GC (DDL table options), Compaction, TTL.'
    },
    {
      title: 'A queue table that gets slower every hour', short: 'tombstone scan', kind: 'tombscan',
      intro: 'A read has to step over tombstones to find live rows. A table used as a queue deletes from the head and reads from the head, so every read walks the pile of deletes.',
      trigger: 'Workers read the first 10 rows of the partition <code>jobs</code> and then delete them. The table is nearly empty, yet reads get slower hour by hour (example numbers).',
      run: "SELECT * FROM queue WHERE name = 'jobs' LIMIT 10;   -- reads from the head of the partition\nDELETE FROM queue WHERE name = 'jobs' AND id = ?;    -- after processing",
      expect: 'Each read scans every tombstone at the head before it reaches 10 live rows, so cost grows with the number of processed jobs, not with the live data.',
      steps: [
        S('A fresh queue', 'The partition holds 100 live jobs. A read of 10 rows scans 10 rows.', { dead: 0, live: 100, scanned: 10, ms: 1 }, 'scanned 10 · returned 10'),
        S('After an hour', '50,000 jobs have been processed and deleted. Each delete is a tombstone at the head of the partition. The live jobs are still only 100.', { dead: 50000, live: 100, scanned: 50010, ms: 400 }, 'tombstones: 50,000'),
        S('Reading walks the pile', 'To return 10 live rows the read must scan and merge all 50,000 tombstones first, since they sort before the live rows. 50,010 cells scanned for 10 results.', { dead: 50000, live: 100, scanned: 50010, ms: 400, hot: true }, 'scanned 50,010 · returned 10'),
        S('Compaction does not clear them yet', 'Compaction cannot drop the tombstones until gc_grace_seconds (10 days by default) has passed and they are safe to purge. The pile keeps growing.', { dead: 200000, live: 100, scanned: 200010, ms: 1600, hot: true }, 'tombstones: 200,000'),
        S('Start the read after the pile', 'Remember the last id processed and read <code>WHERE id &gt; last LIMIT 10</code>. The scan starts after the deleted rows and touches 10 cells, whatever the pile size.', { dead: 200000, live: 100, scanned: 10, ms: 1, fix: 'cursor' }, 'scanned 10 · returned 10'),
        S('Or change the model', 'Put a time bucket in the partition key so each bucket is written, read, and finally left alone, and let TTL with a time-window strategy drop whole files. For real queue semantics, use a queue system.', { dead: 200000, live: 100, scanned: 10, ms: 1, fix: 'bucket' }, 'old buckets are never read')
      ],
      edges: [
        E('Range tombstones help one delete, not the pile', 'A single range delete is one marker, but the rows it shadows still sit in older files until compaction.', 'Delete a bucket or a range at once rather than row by row, then stop reading it.'),
        E('Warnings in the logs', 'The server logs slow queries that scan many tombstones and, past a limit, can abort the query.', 'Treat these as a data-model alarm; check the slow query log and the table\'s tombstone metrics.')
      ],
      invariant: 'A read must scan every tombstone in its range before it can return the live rows after them.',
      src: 'ScyllaDB docs: Tombstones, Large partitions and troubleshooting, CQL SELECT paging. Row counts and latencies are examples.'
    },
    {
      title: 'The deleted order that came back', short: 'resurrection', kind: 'resurrect',
      intro: 'A replica that misses a delete and is not repaired in time can bring the row back after the tombstone has been forgotten.',
      trigger: 'A delete is acknowledged at QUORUM by replicas A and B while C is down. C returns 5 days later. No repair runs (example timeline in days).',
      run: "nodetool repair -pr shop orders      -- run on every node, within gc_grace_seconds\nALTER TABLE orders WITH tombstone_gc = {'mode': 'repair'};   -- purge only after a repair",
      expect: 'After day 10 the tombstone is purged on A and B. C still holds the old row, so a read that touches C returns it, and repair then copies it back everywhere.',
      steps: [
        S('Day 0: C misses the delete', 'The delete reaches A and B and is acknowledged at QUORUM. C is down, so it keeps the old row.', { k: 1 }, 'tombstone on A, B · C has the row'),
        S('The hint window ends', 'The coordinator stored a hint for C, but only while C was down for less than <code>max_hint_window_in_ms</code> (3 hours by default). C is still down after hour 3, so hints stop. Nothing will deliver the delete to C.', { k: 2 }, 'hints expired after 3 hours'),
        S('Day 5: C is back, unrepaired', 'C starts again with the old row. No repair has run, and no read happened to contact C for this key, so C still has the row and no tombstone.', { k: 3 }, 'C: old row, no tombstone'),
        S('Day 10: the grace period ends', 'After gc_grace_seconds (864,000 s, 10 days) compaction on A and B is allowed to purge the tombstone, together with the row it covered. A and B now know nothing about this order.', { k: 4 }, 'tombstone purged on A and B'),
        S('Day 12: the order reappears', 'A read at QUORUM contacts A and C. C returns the old row, A returns nothing, and with no tombstone left the row wins. The deleted order is back, and read repair copies it to A and B.', { k: 5 }, 'deleted row resurrected'),
        S('The fix is a repair duty', 'Run repair on every table at least once within gc_grace_seconds (weekly is a common margin). In repair mode a tombstone is purged only after a repair, so elapsed time alone cannot cause this.', { k: 6 }, 'repair before day 10')
      ],
      edges: [
        E('Repair is skipped for one table', 'A single table left out of the repair schedule is enough: its tombstones expire without having been spread.', 'Drive repair from a scheduler that covers every table and alerts when one is overdue.'),
        E('Decommissioned replica returns', 'A node that was offline longer than gc_grace_seconds and rejoins brings back deleted data.', 'Do not re-add a node that was down longer than the grace period with its old data; replace it with a clean one.')
      ],
      invariant: 'A tombstone may be purged only after every replica holds it, which repair guarantees and elapsed time alone does not.',
      src: 'ScyllaDB docs: Hinted handoff (<code>max_hint_window_in_ms</code> 3 hours), Repair, Tombstone GC and <code>gc_grace_seconds</code> (864000), table option <code>tombstone_gc</code>.'
    }
  ];

  CourseData.uc.tablets = [
    {
      title: 'The tablet map and adding a node', short: 'tablet map', kind: 'tabletmap',
      intro: 'With tablets each table is cut into many small token ranges, each with its own replica set listed in a map. Adding a node moves a few tablets, not whole ranges.',
      trigger: 'The team adds a fifth node during peak traffic. The cluster has 4 nodes, RF=3 and 6 tablets for one table (example tiny numbers).',
      run: "CREATE KEYSPACE shop WITH replication = {'class': 'NetworkTopologyStrategy', 'dc1': 3} AND tablets = {'enabled': true};\nSELECT * FROM system.tablets;   -- the tablet map (names vary by version)",
      expect: 'The new node starts empty, the balancer moves tablets to it one at a time, and the rest of the cluster keeps serving.',
      steps: [
        S('A map of tablets', 'The table is split into 6 tablets. Each has a token range and a replica set. The map is cluster metadata, kept by Raft. Node loads are 4, 5, 5 and 4 tablet replicas.', { epoch: 1, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'B, C, D', 'stable'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, A, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, C, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'] }, 'tablet replicas: A 4 · B 5 · C 5 · D 4'),
        S('Node E joins empty', 'E joins the cluster with no tablets. Nothing moves yet, and no traffic is sent to E, because nothing in the map names it.', { epoch: 1, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'B, C, D', 'stable'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, A, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, C, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'] }, 'E holds 0 tablets'),
        S('The balancer picks a tablet', 'The load balancer sees E is emptier than B and starts moving T2\'s replica from B to E. The tablet is marked migrating; only T2 is affected.', { epoch: 2, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'B to E, C, D', 'migrating'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, A, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, C, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'] }, 'T2 migrating B to E'),
        S('The move completes', 'When the data is copied and the switch is agreed through Raft, T2\'s replica set becomes C, D, E. B drops its copy.', { epoch: 3, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'C, D, E', 'stable'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, A, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, C, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'] }, 'E holds 1 tablet'),
        S('More moves, one at a time', 'The balancer repeats: T6 moves from C to E and T4 from A to E. A few tablets move at once at most, so the extra load stays small.', { epoch: 5, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'C, D, E', 'stable'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, E, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, E, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'] }, 'A 3 · B 4 · C 4 · D 4 · E 3'),
        S('Traffic never stopped', 'Only the tablets being moved were involved, and each stayed readable and writable throughout. With vnodes the same scale-out streams large ranges and is usually run one node at a time.', { epoch: 5, rows: [['T1', 'A, B, C', 'stable'], ['T2', 'C, D, E', 'stable'], ['T3', 'C, D, A', 'stable'], ['T4', 'D, E, B', 'stable'], ['T5', 'A, B, C', 'stable'], ['T6', 'B, E, D', 'stable']], nodes: ['A', 'B', 'C', 'D', 'E'], done: true }, 'cluster balanced · no pause')
      ],
      edges: [
        E('The balancer is not instant', 'It moves a limited number of tablets at once, so a large cluster takes a while to even out.', 'Add nodes ahead of the peak, not during it, even though the move is safe at peak.'),
        E('Not every table uses tablets', 'Tables created in a vnode keyspace do not have a tablet map and scale the old way.', 'Check the keyspace with <code>DESCRIBE KEYSPACE</code> to see which model it uses before planning a scale-out.')
      ],
      invariant: 'The tablet map names the replica set of every token range, and a node holds a tablet only if the map says so.',
      src: 'ScyllaDB docs: Tablets (<code>architecture/tablets</code>), Raft, <code>CREATE KEYSPACE</code> with tablets. The six-tablet map is a teaching example.'
    },
    {
      title: 'How a tablet moves without losing a write', short: 'migration', kind: 'handover',
      intro: 'Moving a replica means writes keep arriving while data is copied. See the order that makes the move safe, and what happens if it fails.',
      trigger: 'Tablet T2 moves its replica from node B to node E while clients write to it (example).',
      run: "nodetool status                     -- see the node and its load\n-- progress is visible in logs and in the tablet map (names vary by version)",
      expect: 'The new replica receives writes before and during the copy, reads switch only when it is complete, and the old replica is removed last.',
      steps: [
        S('The plan', 'T2\'s replica set is B, C, D. The balancer decides B should be replaced by E. At this moment only B, C and D hold or receive T2.', { at: -1, note: 'B, C, D hold T2' }, 'replicas: B, C, D'),
        S('Double-write', 'First, writes for T2 are sent to both the old replica set and E. E starts accumulating new writes before it has any old data, so nothing written from now on can be missed.', { at: 0, note: 'writes go to B, C, D and E' }, 'writes reach E'),
        S('Stream the existing data', 'E copies T2\'s existing data from the other replicas. New writes and the copy are merged by timestamp, so duplicates are harmless.', { at: 1, note: 'E copies the old data' }, 'streaming T2 to E'),
        S('Switch reads', 'When streaming is complete, the cluster switches reads to the new set C, D, E through Raft. A coordinator holding older metadata is told to refresh (it is fenced), so it cannot act on the old map.', { at: 2, note: 'reads use C, D, E' }, 'reads moved · stale coordinators fenced'),
        S('Clean up', 'B no longer holds T2 in the map and deletes its copy. The move is complete.', { at: 3, note: 'B frees its copy' }, 'move complete'),
        S('If E fails halfway', 'If E dies during streaming, the move is rolled back: reads never switched, B still has everything, and the balancer can try another target.', { at: 1, note: 'rolled back, B untouched', failed: true }, 'rolled back · no data lost')
      ],
      edges: [
        E('Writes during the copy cost extra', 'Double-writing and streaming add network and disk load on the sources and target for the length of the move.', 'Limit concurrent moves and avoid starting large moves in the middle of a traffic peak you cannot absorb.'),
        E('Lost nodes block moves', 'A move needs the replicas involved and a Raft majority to switch. With a node down, a move may wait.', 'Repair the failed node first, or remove it, before scaling.')
      ],
      invariant: 'The new replica receives every write from before streaming starts until reads switch, so no acknowledged write is missed.',
      src: 'ScyllaDB docs: Tablets (migration, load balancing), Raft (fencing of stale topology). Stage names and timings vary by version; this shows the order only.'
    },
    {
      title: 'Splitting and merging tablets by size', short: 'split and merge', kind: 'tabletsize',
      intro: 'Tablets grow with their data. A tablet that gets too big is split in two, a pair that gets too small is merged, but one partition can never be split.',
      trigger: 'A tablet\'s data grows past the target while another table\'s data expires. The size target here is 5 GB (example; the real target is set by the release and options).',
      run: "SELECT * FROM system.tablets;          -- sizes and ranges (names vary by version)\nALTER TABLE orders WITH tablets = {'min_tablet_count': 8};   -- option names vary by version",
      expect: 'The big tablet is split at a token boundary into two halves. A tablet made of one huge partition stays whole.',
      steps: [
        S('Tablets under the target', 'Four tablets of 3, 2, 4 and 3 GB, all under the 5 GB example target.', { sizes: [3, 2, 4, 3], target: 5 }, 'largest tablet: 4 GB'),
        S('One tablet grows', 'Writes grow the third tablet to 8 GB, over the target. The balancer notices it is too big.', { sizes: [3, 2, 8, 3], target: 5, over: [2] }, 'tablet 3: 8 GB over target'),
        S('Split at a token boundary', 'The tablet is split into two tablets that each cover half of its token range, about 4 GB each. The map gets one more entry; no data is rewritten up front.', { sizes: [3, 2, 4, 4, 3], target: 5 }, 'tablets: 5 · largest 4 GB'),
        S('One partition cannot be split', 'If the 8 GB is a single partition, every row has the same token, so there is no boundary inside it. The tablet stays over target, and the fix is a better partition key (feature 1).', { sizes: [3, 2, 8, 3], target: 5, over: [2], single: 2 }, 'one 8 GB partition: no split possible'),
        S('Data expires and tablets merge', 'A TTL empties most of two neighbouring tablets, leaving 1 GB each. They are merged into one tablet of about 2 GB, and the map shrinks.', { sizes: [3, 2, 4, 2], target: 5, merged: true }, 'tablets: 4 · smallest merged'),
        S('Sizes stay near the target', 'Together, split and merge keep tablet sizes near the target, so a move always involves a similar, manageable amount of data.', { sizes: [3, 3, 4, 3], target: 5 }, 'tablet sizes stay in range')
      ],
      edges: [
        E('Too few tablets for a big table', 'A table that starts with few tablets has few moves available, so a new node takes load slowly.', 'Set a minimum tablet count for large tables so the balancer has enough pieces to place.'),
        E('Hot tablet versus big tablet', 'A tablet can be small but receive most of the traffic.', 'Look at request rates per tablet, not only sizes, and fix hot keys in the data model.')
      ],
      invariant: 'A split divides a token range at a token boundary, so one partition always stays in one tablet.',
      src: 'ScyllaDB docs: Tablets (split and merge, size-based balancing). The 5 GB target and sizes are examples.'
    }
  ];

  CourseData.uc.raft = [
    {
      title: 'Electing a leader', short: 'leader election', animation: {
        kind: 'raft', n: 5, split: [[0, 1], [2, 3, 4]], cmd: 'ADD COLUMN',
        presets: [
          { label: 'A node times out and wins', ops: [{ op: 'timeout', n: 0 }] },
          { label: 'The leader crashes: a new term', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'CREATE TABLE' }, { op: 'crash', n: 0 }, { op: 'timeout', n: 1 }, { op: 'restart', n: 0 }] },
          { label: 'A minority cannot elect', ops: [{ op: 'partition', sides: [[0, 1], [2, 3, 4]] }, { op: 'timeout', n: 0 }, { op: 'timeout', n: 2 }] },
          { label: 'Two nodes time out at once', ops: [{ op: 'timeout', n: 0 }, { op: 'crash', n: 0 }, { op: 'timeout', n: 1 }, { op: 'timeout', n: 2 }] }
        ]
      },
      intro: 'Metadata changes need one leader. Start an election yourself, crash the leader, or split the network, and watch terms, votes and the majority rule decide who may lead.',
      trigger: 'The node that led the metadata group stops. The other nodes notice missing heartbeats and one of them must take over without two leaders ever existing in one term (5 voters shown).',
      run: "SELECT * FROM system.raft_state;           -- group 0 state (name varies by version)\nnodetool status                              -- which nodes are up\n-- the group 0 leader coordinates schema and topology changes",
      expect: 'A node that gets votes from a majority becomes leader of a new term. A side with fewer than a majority can never elect one.',
      edges: [
        E('Split votes', 'Two candidates in the same term can split the votes so neither reaches a majority.', 'Real Raft uses random election timeouts so one usually times out first and wins; the next term retries.'),
        E('A needlessly high term', 'A node cut off from the others keeps raising its term. When it returns, its higher term can force the current leader to step down.', 'Production Raft uses pre-vote to avoid it; the animation omits pre-vote to keep the rules visible.')
      ],
      invariant: 'There is at most one leader per term, and a leader needs votes from a majority of the voters.',
      src: 'ScyllaDB docs: Raft consistent metadata (<code>architecture/raft</code>), group 0. The animation is simplified: no timers, no pre-vote, five voters.'
    },
    {
      title: 'Committing an entry with a majority', short: 'log replication', animation: {
        kind: 'raft', n: 5, split: [[0, 1], [2, 3, 4]], cmd: 'ADD COLUMN',
        presets: [
          { label: 'Commit with a majority', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'CREATE TABLE' }, { op: 'client', cmd: 'ADD COLUMN' }] },
          { label: 'A minority leader cannot commit', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'A' }, { op: 'partition', sides: [[0, 1], [2, 3, 4]] }, { op: 'client', cmd: 'B', to: 0 }, { op: 'timeout', n: 2 }, { op: 'client', cmd: 'C' }, { op: 'heal' }] },
          { label: 'A follower catches up after a crash', ops: [{ op: 'timeout', n: 0 }, { op: 'client', cmd: 'A' }, { op: 'crash', n: 4 }, { op: 'client', cmd: 'B' }, { op: 'restart', n: 4 }, { op: 'client', cmd: 'C' }] }
        ]
      },
      intro: 'Send commands to the leader and see when an entry becomes committed. Split the network and watch the side without a majority accept entries it can never commit, then lose them when the network heals.',
      trigger: 'The schema change <code>ADD COLUMN</code> goes to the leader while the network between the nodes splits (5 voters, majority 3).',
      run: "ALTER TABLE shop.orders ADD notes text;   -- a schema change is a group 0 command\n-- committed once a majority of voters has stored it, then applied on every node",
      expect: 'An entry is committed once 3 of 5 nodes store it. A leader with only 2 reachable nodes cannot commit, and its entry is overwritten after the heal.',
      edges: [
        E('A client sees success only after commit', 'A schema change returns after the entry is committed and applied, not when the leader merely wrote it.', 'Treat a timeout on a schema change as unknown, check the schema, and retry if needed.'),
        E('Old leader serving stale reads', 'A leader cut off from the majority does not know it has been replaced.', 'Raft reads that must be current go through the leader with a check that it still has a majority.')
      ],
      invariant: 'A committed entry is stored on a majority and is never lost or changed: any later leader must hold it.',
      src: 'ScyllaDB docs: Raft consistent metadata, schema and topology changes through group 0. The five-node model is simplified.'
    },
    {
      title: 'What needs the Raft majority and what does not', short: 'what goes through Raft', kind: 'scope',
      intro: 'Only cluster metadata goes through Raft. Reads and writes of your data take the coordinator and consistency level path, so they do not need the metadata majority.',
      trigger: 'A network split leaves 7 of 12 nodes on one side and 5 on the other (example). Both sides keep getting traffic.',
      run: "-- metadata (needs group 0 majority): CREATE TABLE, ALTER, nodetool decommission, adding a node, moving a tablet\n-- data (does not): INSERT, SELECT at a level the replicas can meet",
      expect: 'The 7-node side can still change schema and topology; the 5-node side cannot. Row traffic on both sides depends only on whether its own level can be met.',
      steps: [
        S('What group 0 holds', 'One Raft group holds schema, topology and the tablet map. Everything else, your rows, is outside it.', { upto: 3, maj: true }, 'metadata: group 0 · rows: not'),
        S('With a majority', 'With 7 of 12 voters reachable the leader commits metadata changes: new tables, a node joining, a tablet moving. All succeed.', { upto: 3, maj: true }, 'metadata changes: allowed'),
        S('The 5-node side', 'The minority side cannot reach 7 voters. It cannot elect a leader or commit, so a schema change or a new node there waits or fails.', { upto: 3, maj: false }, 'metadata changes: blocked'),
        S('Row traffic carries on', 'Writes and reads do not use group 0. On the 5-node side a LOCAL_QUORUM write works if 2 of its 3 replicas are on that side, so data keeps flowing.', { upto: 5, maj: false }, 'rows: depends on own level'),
        S('Losing the majority everywhere', 'If more than half of the nodes are lost, nobody can commit metadata: no schema change, no node added, no tablet moved. Data traffic can still be served by the replicas that are up.', { upto: 5, maj: false, lost: true }, 'topology frozen · rows served'),
        S('Why this design', 'Before Raft, schema and topology spread by gossip and could disagree between nodes. A single committed history means every node sees the same changes in the same order, at the price of needing a majority to change them.', { upto: 5, maj: true, why: true }, 'one agreed history')
      ],
      edges: [
        E('Operations during a partial outage', 'Adding or removing a node when many nodes are down can be impossible.', 'Restore the failed nodes first; do topology changes only with a healthy majority.'),
        E('All writes through Raft?', 'It would give strong consistency for rows too, but every write would need a majority round trip and a leader.', 'Use lightweight transactions (SERIAL) for the few rows that need it, and the consistency-level path for the rest.')
      ],
      invariant: 'Cluster metadata changes need a Raft majority; row reads and writes do not use Raft at all.',
      src: 'ScyllaDB docs: Raft consistent metadata and topology (<code>architecture/raft</code>), schema mismatch troubleshooting. Cluster sizes are examples.'
    }
  ];
})();
