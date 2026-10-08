# Distributed Systems Course Chapter Plan

## Objective

Turn `techstack/distributed/01-distributed-systems-end-to-end.html` into a problem-based course. Keep chapters 1 and 2 as written. Rewrite everything after them around the distributed-data path from replication to batch and stream processing.

Each new chapter follows one rule: **show the naive setup failing, then the fix**. The chapter's playground is the problem, animated. A reader should see the bad outcome before they read the explanation.

## Source coverage

The curriculum follows the chapter plan supplied with this request, which covers the replication, partitioning, distributed-faults, consistency, consensus, batch and stream material of *Designing Data-Intensive Applications*. The course uses those ideas and writes its own problems, simulations and wording. It does not reproduce the book's text or figures.

Chapters 1 and 2 are kept from the existing page. Their playgrounds are still placeholders and remain so for now.

Scope decisions:

- **Transactions (DDIA chapter 7) is not a chapter here.** Isolation levels, lost updates, write skew, two-phase locking and serializable snapshot isolation are covered by the database course's chapter 11. Chapter 11 here covers only atomic commit across machines. Add a transactions chapter if the course should stand alone.
- **CRDTs and the Spanner case study** from the old chapter 9 were removed. CRDT material already exists in the OS course page.
- **Invented examples are labelled "Typical case".** Only documented incidents, papers and documented behaviour keep the "Seen in" label.

## Design constraints

- One flat list of 13 chapters. Each chapter depends only on earlier chapters.
- Every chapter owns one primary mechanism, and no two chapters teach the same mechanism.
- Every new chapter has exactly one animated playground. The playground shows the naive failure and then the fix, with a toggle between them.
- Every chapter has three or four real-world failures. Only incidents we are confident about are used. Invented numbers are labelled illustrative.
- One renderer and one data schema for every chapter. New fields are optional and must not change how chapters 1 and 2 render.
- Use simple `ex / why / fix` common-problem entries, not the rich `viz / log / ctx` mode.
- Prose uses template literals or double quotes, so a stray apostrophe cannot break the page.
- Animations run through `player()` so `route()` can stop them. All randomness is seeded with `rng()`.
- Styling uses the page's own `<style>` block and the `--p0..7`, `--mut` and `--line` tokens. It does not touch `assets/lab.css` or `assets/lab.js`, which have uncommitted changes.

## Ownership boundaries

These boundaries keep each mechanism in one place.

- **Ch 2 owns** timeouts, retries and idempotence. No later chapter re-teaches them.
- **Ch 3 owns** single-leader replication: the replication log, synchronous versus asynchronous followers, and failover.
- **Ch 4 owns** the anomalies a user sees when followers lag: read-your-writes, monotonic reads, consistent prefix.
- **Ch 5 owns** writes to several nodes: multi-leader conflicts, leaderless quorums (W + R > N), sloppy quorums and hinted handoff.
- **Ch 6 owns** partitioning: key-range and hash partitioning, hot spots, secondary indexes, rebalancing and request routing.
- **Ch 7 owns** process pauses, leases, fencing tokens, the majority rule and Byzantine faults. It does not revisit timeouts.
- **Ch 8 owns** time: physical clock skew, last-write-wins, Lamport clocks and vector clocks.
- **Ch 9 owns** the definition of linearizability, what it costs, and CAP.
- **Ch 10 owns** consensus: terms, majority-committed logs and leader election, which yields total order broadcast.
- **Ch 11 owns** atomic commit across machines: two-phase commit and its blocking failure. Isolation levels belong to the database course (chapter 11). Sharded transaction routing belongs to the database course (chapter 14).
- **Ch 12 owns** batch dataflow: MapReduce, the shuffle, joins over partitioned data, and recovery by recomputation.
- **Ch 13 owns** the log as the unit of data flow: offsets, change data capture, event sourcing, and windows with late events.

## Proposed chapters

### 1. When one machine is not enough (kept)

Chapter 1 stays as written. Its playground is still a placeholder.

### 2. Remote calls and partial failure (kept)

Chapter 2 stays as written. Its playground is still a placeholder.

### 3. Leaders, followers, and failover

**Problem it solves:** The primary database dies. A follower is promoted. A customer's order, which was confirmed, is missing.

**Core idea:** Copies are made by shipping the leader's log. Whether the leader waits for a follower before confirming a write decides what a failover can lose.

**Mechanism:** Single-leader replication, the replication log, synchronous versus asynchronous followers, setting up a new follower from a snapshot plus log position, failover, and the lost-write window.

**Playground:** A leader and two followers exchange log entries over time. Toggle between asynchronous and synchronous replication, kill the leader, and promote a follower. The acknowledged write either survives or disappears.

**Common real-world problems:**

1. Asynchronous failover loses writes the leader had already acknowledged. MongoDB's default write concern of `w:1` was documented by Jepsen in 2013 as able to roll back acknowledged writes after a failover.
2. A promoted follower lags behind, so the new leader is missing committed entries.
3. Two nodes both think they are the leader after a failover, and the old leader keeps accepting writes.
4. A new follower is created from a live copy without a consistent snapshot, so it starts with a corrupted state.

### 4. Replication lag: what a user can see

**Problem it solves:** A user posts a comment, refreshes, and the comment is gone. The page feels broken, though no data was lost.

**Core idea:** Followers are behind by a variable amount. Three guarantees make the lag tolerable: read-your-writes, monotonic reads, and consistent prefix reads.

**Mechanism:** Reading from a lagging follower, read-your-writes through a leader or a version check, monotonic reads through session affinity, consistent prefix reads for causally related writes, and how each fix costs latency or availability.

**Playground:** A user's writes and reads are routed to two followers with different lag. Toggle the three guarantees on and off and watch which anomaly appears: a missing own write, a value going backwards, or an answer before its question.

**Common real-world problems:**

1. A user updates a profile and the old value shows on the next page load because the read went to a lagging replica.
2. A list of comments goes backwards on refresh because each request lands on a different replica.
3. A reply appears before the question because the two writes went to different partitions and replicas.
4. Read-your-writes is enforced for the wrong writer, so a second device still sees stale data.

### 5. Writes everywhere: conflicts and quorums

**Problem it solves:** A datacenter goes down. Writes must still succeed. Two clients change the same record in two places, and one change silently disappears.

**Core idea:** Accepting writes on several nodes is a trade-off. Multi-leader systems must detect and resolve conflicts. Leaderless systems use quorums, so that the read set overlaps the write set.

**Mechanism:** Multi-leader conflicts and resolution strategies, leaderless replication, quorum arithmetic (W + R > N), read repair, sloppy quorums and hinted handoff, and concurrent-write detection with version vectors.

**Playground:** Five replicas and a write. Set N, W and R, take nodes down, and see whether a read is guaranteed to include the latest write. Switch to sloppy quorum and watch hinted handoff repair the data later.

**Common real-world problems:**

1. Two multi-leader datacenters update the same row, and last-write-wins keeps only one edit.
2. W + R is not greater than N, so a read can miss the latest write even with a healthy majority.
3. A sloppy quorum accepts writes on nodes outside the home replicas, so reads that expect the home replicas see nothing.
4. A shopping cart loses an item when two concurrent writes overwrite each other. Amazon's Dynamo paper described keeping both versions as siblings for the application to merge.

### 6. Splitting data: partitioning and hot spots

**Problem it solves:** One table is too large for one machine. Splitting it by key sends most of the traffic to one partition, and adding a node moves almost every key.

**Core idea:** Partition by a function of the key. Choose the function so that data and load spread evenly, and so that adding nodes moves only a small fraction of keys.

**Mechanism:** Partitioning by key range and by hash, skewed workloads and hot keys, secondary indexes (document-partitioned and term-partitioned), rebalancing with fixed partitions, and request routing.

**Playground:** Keys are placed on N nodes. Compare hash-mod-N with fixed partitions. Add a node and count the keys that move. Then change the key distribution to a hot key and watch one node take the load.

**Common real-world problems:**

1. Hash-mod-N partitioning moves nearly all keys when a node is added, so the rebalance takes hours.
2. A time-ordered key on range partitioning sends every new write to the last partition.
3. A celebrity account concentrates the reads and writes of one key on a single partition.
4. A secondary index is partitioned by term, so a single write touches several partitions.

### 7. Pauses, leases, and fencing: the zombie leader

**Problem it solves:** A leader holds a lease and pauses for 40 seconds during garbage collection. The lease expires, another node becomes leader, and then the old leader wakes up and writes.

**Core idea:** A node cannot know it has been paused. Protect shared resources with fencing tokens that increase with each leader, and rely on a majority to decide who is leader.

**Mechanism:** Process pauses, leases and their expiry, fencing tokens, the majority (quorum) rule for leadership, and the Byzantine fault model, where nodes may lie.

**Playground:** Two clients hold a lease. Pause the leader and watch it write after its lease has expired. Toggle fencing tokens on and off. Without them the storage accepts a stale write. With them the storage rejects the older token.

**Common real-world problems:**

1. A stop-the-world GC pause longer than a lease lets an old leader keep writing. Kleppmann's distributed-locking analysis uses exactly this case.
2. A distributed lock with no fencing token lets two workers update the same file.
3. A split network leads to two masters. Elasticsearch before 7.0 had this with a bad `minimum_master_nodes` setting.
4. Byzantine-style corruption, such as a flipped bit or a bug that spreads through gossip, can outlast any crash-only assumption. Amazon S3's July 2008 outage had this shape.

### 8. Clocks and order: when time lies

**Problem it solves:** Two servers stamp their writes with the clock. The write that really happened later is discarded because its clock was behind. Nobody gets an error.

**Core idea:** Physical clocks are never perfectly synchronised. To say which event came first, count events and messages instead of trusting the wall clock. Lamport clocks give a consistent order. Vector clocks tell causal order from concurrency.

**Mechanism:** Time-of-day versus monotonic clocks, clock skew and NTP, last-write-wins and its failure, Lamport clocks, vector clocks, and sequence numbers as a source of order.

**Playground:** Two writers with skewed clocks write the same key. Last-write-wins keeps the wrong value. Switch to Lamport and then to vector clocks. Watch which events are ordered and which are reported as concurrent.

**Common real-world problems:**

1. Last-write-wins with client timestamps discards a newer write from a client whose clock is behind.
2. A timestamp-based ID generator goes backwards when the clock steps back.
3. Elapsed time is measured with the wall clock, so a timeout fires too early or never fires after an NTP step.
4. Lamport timestamps say A is before B, but A and B were actually concurrent, so a real conflict is hidden.

### 9. Linearizability: one current value

**Problem it solves:** A user sees a new balance, refreshes, and sees the old balance again. The system promised a single register, and it broke the promise.

**Core idea:** Linearizability means every operation appears to take effect at one instant between its start and end, and the order of those instants agrees with real time. It is the strongest single-object guarantee, and it is expensive.

**Mechanism:** The definition of linearizability, checking a history of overlapping operations, where linearizability is needed (leader election, unique constraints, locks), and the cost of guaranteeing it, which is the CAP trade-off.

**Playground:** A history of reads and writes on one register, with overlapping operations and a timeline. Toggle the replication mode and see whether the history can be ordered so that every read returns the latest completed write.

**Common real-world problems:**

1. A read from a lagging follower returns an older value after a newer read already returned the newer one.
2. A unique-username check passes on two replicas at once, so two users get the same name.
3. A lock service that is not linearizable gives the same lock to two clients.
4. Teams assume that a single leader is linearizable, but a read that skips the leader is not.

### 10. Agreeing on a leader: consensus and Raft

**Problem it solves:** The leader dies. The surviving nodes must agree on a new one, and they must never end up with two leaders, even when messages are lost and nodes restart.

**Core idea:** A value is committed only when a majority has stored it. Each leader has a term number, and a vote needs a majority. Two majorities always overlap, so two leaders cannot be elected in the same term.

**Mechanism:** Terms, leader election with randomised timeouts, log replication with a majority commit, the safety rule that only up-to-date candidates can win, and total order broadcast as a consequence.

**Playground:** Five nodes elect a leader. Kill the leader, watch the election, and see that the new leader carries every committed entry. Split the vote and watch the randomised timeouts resolve it. Partition the network and see that the minority side cannot commit.

**Common real-world problems:**

1. A cluster with an even number of nodes loses availability to a single failure at no benefit over one fewer node.
2. A node with a stale log wins the election and rolls back committed data. Raft prevents this with the up-to-date rule.
3. A consensus group is spread across two datacenters, so a network split leaves the smaller side unable to elect a leader.
4. ZooKeeper, etcd and similar coordination services are used for locks or leader election but only as a small, dedicated cluster, not as a general data store.

### 11. Atomic commit across machines: two-phase commit

**Problem it solves:** A transfer touches two databases. One commits, the coordinator crashes, and the other is left holding its locks, not knowing whether to commit or abort.

**Core idea:** Two-phase commit makes every participant promise before the coordinator decides. The promise is a commitment that cannot be undone, which is also why a crashed coordinator can leave everyone waiting.

**Mechanism:** The prepare and commit phases, the coordinator's decision log, the in-doubt state, the blocking failure, coordinator recovery, and the difference between two-phase commit and consensus-based commit.

**Playground:** A transfer across two shards. Pick the step where the coordinator crashes: before prepare, after prepare but before the decision, or after commit. See which participants are left in doubt and whether the money is created or lost.

**Common real-world problems:**

1. A coordinator crashes after prepare, so participants hold locks until an operator intervenes.
2. Participants that do not log their prepare decision durably can commit on restart after the coordinator has aborted.
3. Naive dual writes to two databases, with no coordinator, give partial commits that no retry can fix.
4. Long lock hold times during a slow prepare reduce throughput for every other transaction on those rows.

### 12. Batch processing: MapReduce as dataflow

**Problem it solves:** A job must process a petabyte of logs and join them with a table. One machine cannot do it, and one slow machine stretches the whole job.

**Core idea:** Describe the computation as map, shuffle and reduce over partitioned files. Failures are handled by re-running a deterministic task, not by restoring state.

**Mechanism:** Map, shuffle by key, reduce, reduce-side and map-side joins, the output of a batch as an immutable file, recovery by re-running tasks, and stragglers with backup tasks.

**Playground:** A word-count-style job runs on partitioned input. Watch map tasks emit key-value pairs, the shuffle route them, and reducers produce output. Kill a map task and see it re-run. Add a slow straggler and toggle backup tasks.

**Common real-world problems:**

1. A skewed key sends most of the shuffle to one reducer, which runs for hours while others finish.
2. A map-side join reads a small table on every mapper without a broadcast, so it causes network traffic.
3. A non-deterministic task produces different output on retry, so the job's output depends on which attempt won.
4. Intermediate output is materialised to disk between stages, which makes the job slow even when each stage is fast.

### 13. Stream processing: logs, change capture, and events

**Problem it solves:** A search index, a cache and a warehouse must all reflect the same orders database. Keeping them in sync with separate writes gives them different answers.

**Core idea:** Write every change to an append-only log, and let each consumer read it in order and keep its own offset. Derived views are then rebuilt from the same stream.

**Mechanism:** Partitioned logs and offsets, consumer groups, change data capture, event sourcing, stream joins, windows, and late events with watermarks.

**Playground:** A producer writes events to a partitioned log. Two consumers read at their own pace. Crash one consumer, and watch it resume from its committed offset. Toggle "commit before process" and see duplicate or lost events. Send a late event past the window and see the result change.

**Common real-world problems:**

1. A consumer commits its offset before processing, so a crash loses events.
2. A consumer commits after processing, so a crash causes duplicates unless the processing is idempotent.
3. Dual writes to a database and a queue diverge when one write fails.
4. A window closes before late events arrive, so the aggregate is wrong and nothing reports it.

## Coverage audit

| Mechanism | Chapter |
|---|---:|
| Scale-out limits | 1 |
| Partial failure, RPC, timeouts | 2 |
| Single-leader replication and failover | 3 |
| Replication lag and session guarantees | 4 |
| Multi-leader, leaderless, quorums | 5 |
| Partitioning and rebalancing | 6 |
| Pauses, leases, fencing, Byzantine | 7 |
| Clocks, Lamport, vector clocks | 8 |
| Linearizability and CAP | 9 |
| Consensus and total order | 10 |
| Two-phase commit | 11 |
| Batch dataflow | 12 |
| Logs, CDC, event sourcing, streams | 13 |

## Proposed output

- Course page: `techstack/distributed/01-distributed-systems-end-to-end.html` (same file, rewritten after chapter 2).
- Site entries: update `data/systems.js` (chapter count and URL) and the distributed entries in `data/tech-index.js`.
- Chapter 3 is built first, end to end, and verified in the browser before the rest follow.
