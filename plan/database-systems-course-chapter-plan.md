# Database Systems Course Chapter Plan

## Objective

Build one flat, 16-chapter Database Systems course page that progresses from relational foundations to modern analytical architectures. The page will follow the structure of `techstack/concurrency/01-concurrency-end-to-end.html`: every chapter contains a concrete problem, the core idea, the mechanism, one deterministic playground, and three or four non-overlapping real-world problems.

## Source coverage

The curriculum combines:

- CMU 15-445/645, Introduction to Database Systems, Fall 2024.
- CMU 15-721, Advanced Database Systems, Spring 2024.

CMU 15-445 lectures 00 and 25 and CMU 15-721 lecture 00 are course logistics or review, so they do not require dedicated chapters.

## Design constraints

- Use one flat list of 16 chapters.
- Order chapters so that each chapter depends only on earlier chapters.
- Give every chapter ownership of one primary mechanism.
- Give every chapter exactly one playground.
- Give every chapter three or four real-world failure scenarios.
- Do not repeat a core idea, playground, or full problem treatment across chapters.
- Label invented measurements as illustrative when writing the final content.
- Use representative, verifiable logs and real database APIs in the finished course.

## Proposed chapters

### 1. Relational Model and SQL

**Course coverage:** CMU 15-445 #01-02; no direct CMU 15-721 lecture.

**Problem it solves:** An application stores customers, orders, and payments, but duplicate records and incorrect joins produce inconsistent revenue totals.

**Core idea:** Describe what data you want using relations and SQL; let the database decide how to retrieve it.

**Mechanism:** Relations, tuples, primary and foreign keys, constraints, relational algebra, joins, aggregation, bags versus sets, and SQL three-valued logic.

**Playground:** Construct a query over customers and orders. Toggle missing/correct constraints and join predicates. Track row count and total revenue.

**Common real-world problems:**

1. `NOT IN` unexpectedly returns no rows because of `NULL`.
2. A missing join condition creates a Cartesian product.
3. Missing unique constraints allow duplicate logical records.
4. Floating-point or incompatible data types corrupt comparisons and money calculations.

### 2. Pages, Records, and the Buffer Pool

**Course coverage:** CMU 15-445 #03-04 and #06.

**Problem it solves:** A 200 GB table cannot fit in RAM, and random record access turns a millisecond request into seconds.

**Core idea:** Databases move fixed-size pages between durable storage and a limited in-memory buffer pool.

**Mechanism:** Slotted pages, record identifiers, free-space tracking, buffer frames, page tables, pin counts, dirty pages, eviction, prefetching, and replacement policies.

**Playground:** Replay an access sequence while changing buffer size and eviction policy. Compare disk reads, hit rate, and dirty-page writes.

**Common real-world problems:**

1. The working set exceeds the buffer pool and causes thrashing.
2. A leaked page pin prevents frames from being evicted.
3. A large sequential scan evicts frequently used pages.
4. Dirty-page eviction produces latency spikes.

### 3. Storage Models, File Formats, and Compression

**Course coverage:** CMU 15-445 #05; CMU 15-721 #02-03.

**Problem it solves:** An analytical query needs three columns from a 100-column table but reads the entire dataset.

**Core idea:** Arrange and encode data according to how the workload reads it.

**Mechanism:** Row and column stores, Parquet-style row groups and pages, dictionary encoding, run-length encoding, bit packing, delta encoding, zone maps, and late materialization.

**Playground:** Run transactional and analytical workloads against row, column, and compressed layouts. Show bytes read, compression ratio, and decoding work.

**Common real-world problems:**

1. A row layout makes analytical scans read unnecessary columns.
2. High-cardinality data makes dictionary encoding larger or slower.
3. Schema evolution produces incompatible files or missing values.
4. Poor sort order or oversized row groups defeats data pruning.

### 4. Hash Tables, Indexes, and Filters

**Course coverage:** CMU 15-445 #07-10.

**Problem it solves:** Looking up one customer requires scanning 100 million rows.

**Core idea:** Maintain auxiliary structures that quickly eliminate rows which cannot match.

**Mechanism:** Hash tables, open addressing, extendible hashing, B+ trees, page splits, composite keys, Bloom filters, index latches, and concurrent tree traversal.

**Playground:** Compare a full scan, hash lookup, B+ tree traversal, and Bloom-filter-assisted lookup while inserts modify the structures.

**Common real-world problems:**

1. A composite index uses the wrong leading-column order.
2. Excessive indexes multiply write and storage costs.
3. Sequential keys create contention on the rightmost B+ tree leaf.
4. An undersized Bloom filter produces too many false positives.

### 5. Query Execution Engine

**Course coverage:** CMU 15-445 #13-14; CMU 15-721 #04-05.

**Problem it solves:** A query returns only 100 rows but constructs a multi-gigabyte intermediate result.

**Core idea:** Execute physical operators as a pipeline and avoid moving or materializing unnecessary data.

**Mechanism:** Volcano iterators, pull and push execution, operator state, pipeline breakers, materialization, predicate pushdown, projection pushdown, and query cancellation.

**Playground:** Step rows through a physical plan. Toggle materialized/pipelined execution and disabled/enabled pushdown. Measure processed rows and peak memory.

**Common real-world problems:**

1. A filter is applied after reading all rows from storage.
2. `SELECT *` prevents column pruning.
3. A pipeline breaker materializes an oversized intermediate result.
4. Client cancellation fails to stop work inside the execution engine.

### 6. Sorting, Aggregation, and Join Algorithms

**Course coverage:** CMU 15-445 #11-12; CMU 15-721 #09-10.

**Problem it solves:** A join that works for 10,000 rows takes hours for 100 million rows and exhausts memory.

**Core idea:** Select physical algorithms based on input size, ordering, memory, and data distribution.

**Mechanism:** External merge sort, hash aggregation, nested-loop join, hash join, sort-merge join, partitioning, spilling, and multiway joins.

**Playground:** Change table sizes, memory, ordering, and key skew. Compare algorithm cost, comparisons, temporary I/O, and intermediate-result size.

**Common real-world problems:**

1. A nested-loop join is used for two large inputs.
2. A hash table or sort spills repeatedly to disk.
3. A skewed key sends most work to one partition.
4. A binary join order creates a huge intermediate relation.

### 7. Server-Side Logic and UDFs

**Course coverage:** CMU 15-721 #11.

**Problem it solves:** A scalar UDF called once per row turns a two-second analytical query into several minutes.

**Core idea:** Database logic performs well when the optimizer can inspect, inline, and batch it.

**Mechanism:** SQL and procedural UDFs, cursor loops, function inlining, imperative-to-relational transformation, vectorized UDFs, and batched execution.

**Playground:** Execute the same transformation as a scalar UDF, an inlined relational expression, and a batched UDF. Count calls and elapsed work.

**Common real-world problems:**

1. A scalar UDF runs once for every row.
2. Cursor-based logic replaces one set-oriented operation.
3. Side effects prevent inlining and query reordering.
4. An unsafe extension can crash or block the database process.

### 8. Database Networking and Data Transfer

**Course coverage:** CMU 15-721 #12.

**Problem it solves:** The query finishes in 200 ms, but transferring and converting its result takes 12 seconds.

**Core idea:** Fetch data in large, efficient batches and minimize round trips, copies, and format conversions.

**Mechanism:** Database wire protocols, fetch size, row and column serialization, compression, connection pooling, Arrow-style interchange, and zero-copy transfer.

**Playground:** Transfer one million rows using row-at-a-time, batched, compressed, and columnar modes. Show round trips, bytes, copies, and client memory.

**Common real-world problems:**

1. N+1 queries create thousands of network round trips.
2. A tiny fetch size makes a large result excessively chatty.
3. The client materializes the entire result and runs out of memory.
4. Row conversion dominates ingestion into pandas or another analytical tool.

### 9. Query Optimization and Cost Models

**Course coverage:** CMU 15-445 #15; CMU 15-721 #13-16.

**Problem it solves:** Two equivalent plans differ by 1,000 times because one joins selective tables first and the other creates a massive intermediate result.

**Core idea:** Search equivalent plans and estimate which one will consume the least resources.

**Mechanism:** Rewrite rules, logical and physical operators, memo structures, Cascades-style optimization, dynamic-programming join enumeration, statistics, cardinality estimation, and cost models.

**Playground:** Optimize a four-table query using estimated statistics. Change correlation or stale statistics and compare the selected plan with the actual best plan.

**Common real-world problems:**

1. Stale statistics produce an incorrect join strategy.
2. Correlated predicates are treated as independent.
3. A cached plan performs poorly for different parameter values.
4. A many-table query exceeds the optimizer's search budget.

### 10. Vectorized, Compiled, and Parallel Execution

**Course coverage:** CMU 15-721 #06-08.

**Problem it solves:** All data is in memory, but the CPU spends most of its time on function calls, branches, and scheduling overhead.

**Core idea:** Process batches in tight CPU loops and distribute small units of work across cores.

**Mechanism:** Vector batches, selection vectors, SIMD, code generation, compilation, branch handling, morsel-driven scheduling, work stealing, and NUMA-aware placement.

**Playground:** Change batch size, branch selectivity, core count, and data placement. Compare scalar, vectorized, compiled, and parallel throughput.

**Common real-world problems:**

1. Batches are too small to amortize operator overhead.
2. Divergent predicates waste SIMD lanes.
3. Too many workers cause scheduling and NUMA traffic.
4. JIT compilation costs more than it saves for short queries.

### 11. Transactions and Isolation

**Course coverage:** CMU 15-445 #16.

**Problem it solves:** Two individually correct requests interleave and violate the business invariant that at least one doctor remains on call.

**Core idea:** Isolation defines which intermediate transaction states other transactions may observe.

**Mechanism:** ACID, schedules, operation conflicts, conflict graphs, serializability, Read Committed, Repeatable Read, Snapshot Isolation, and Serializable isolation.

**Playground:** Interleave two banking or on-call transactions. Change isolation level and observe whether the invariant survives.

**Common real-world problems:**

1. Concurrent updates overwrite each other.
2. Snapshot Isolation permits write skew.
3. A check-then-insert sequence double-books a resource.
4. Phantom rows invalidate a repeated range query.

### 12. Concurrency Control and MVCC

**Course coverage:** CMU 15-445 #17-19.

**Problem it solves:** The database must preserve isolation while thousands of transactions compete for the same records.

**Core idea:** Concurrency-control protocols choose whether conflicting work waits, aborts, or reads another version.

**Mechanism:** Two-phase locking, lock compatibility, deadlock detection, timestamp ordering, optimistic validation, MVCC snapshots, version visibility, and garbage collection.

**Playground:** Run the same workload under 2PL, timestamp ordering, OCC, and MVCC. Adjust contention and compare throughput, waits, aborts, and retained versions.

**Common real-world problems:**

1. Transactions acquire locks in opposite orders and deadlock.
2. Applications fail to retry serialization errors.
3. Long-lived snapshots prevent old versions from being reclaimed.
4. A hot row causes lock queues or repeated OCC aborts.

### 13. Logging and Crash Recovery

**Course coverage:** CMU 15-445 #20-21.

**Problem it solves:** Power fails after debiting one account but before the corresponding credit reaches its data page.

**Core idea:** The log becomes durable before the data page, allowing recovery to reconstruct a consistent state.

**Mechanism:** Write-ahead logging, log sequence numbers, commit records, force/no-force, steal/no-steal, checkpoints, redo, undo, and ARIES-style recovery.

**Playground:** Inject a crash before and after log flush, data-page write, commit, and checkpoint. Replay recovery and verify total money.

**Common real-world problems:**

1. A transaction is acknowledged before its WAL is durable.
2. A crash leaves a partially written page.
3. A checkpoint produces a large I/O latency spike.
4. A stalled consumer or replication slot prevents WAL deletion.

### 14. Distributed OLTP Databases

**Course coverage:** CMU 15-445 #22-23.

**Problem it solves:** A transfer spans two shards, and the coordinator crashes after one shard commits.

**Core idea:** Partition transactional state while coordinating operations that cross partition boundaries.

**Mechanism:** Sharding, partition routing, replication, distributed concurrency control, two-phase commit, transaction coordinators, idempotency, and online rebalancing.

**Playground:** Transfer money across two shards while failing a participant or coordinator. Compare unsafe dual writes with coordinated commit.

**Common real-world problems:**

1. A popular tenant or key creates a hot shard.
2. A coordinator failure leaves a transaction in doubt.
3. Replica lag violates read-your-writes expectations.
4. Rebalancing without fencing loses or duplicates writes.

### 15. Cloud Data Warehouses

**Course coverage:** CMU 15-445 #24; CMU 15-721 #01, #17, #19, and #21-22.

**Systems represented:** BigQuery/Dremel, Snowflake, Yellowbrick, and Redshift.

**Problem it solves:** Thousands of users need elastic analytical capacity over petabytes without each team managing a dedicated cluster.

**Core idea:** Separate durable storage, elastic compute, and query coordination while executing columnar work across many workers.

**Mechanism:** Disaggregated storage and compute, distributed scans, shuffle, result caching, local caches, execution slots, workload management, and elastic warehouses.

**Playground:** Run the same workload across architectural models inspired by BigQuery, Snowflake, Redshift, and Yellowbrick. Adjust concurrency, cache warmth, and scan size.

**Common real-world problems:**

1. Cold workers repeatedly fetch data from remote storage.
2. Skew makes one shuffle partition delay the entire query.
3. Too many queries saturate slots or warehouse queues.
4. Unbounded scans create unexpected cost and latency.

### 16. Lakehouse and Embedded Analytics

**Course coverage:** CMU 15-445 #24; CMU 15-721 #01, #18, and #20.

**Systems represented:** Databricks/Spark and DuckDB.

**Problem it solves:** One team needs distributed analytics over an object-store lake, while another needs fast local analytics inside a laptop application.

**Core idea:** Place the analytical engine and transaction boundary where the data and users need them.

**Mechanism:** Lakehouse table metadata, object files, transaction logs, snapshot commits, distributed Spark execution, embedded in-process execution, and local vectorized processing.

**Playground:** Change dataset size, update frequency, concurrency, and deployment constraints. Compare lakehouse and embedded execution for latency, coordination, and resource use.

**Common real-world problems:**

1. Thousands of small files create planning and I/O overhead.
2. Transaction-log or catalog metadata grows without maintenance.
3. An embedded workload exceeds the machine's memory and spill capacity.
4. An embedded engine is incorrectly exposed as a highly concurrent remote service.

## Coverage audit

| Course area | Chapters |
|---|---:|
| 15-445 relational model and SQL | 1 |
| 15-445 storage and memory management | 2-4 |
| 15-445 query processing and optimization | 5-6, 9 |
| 15-445 transactions, concurrency, and recovery | 11-13 |
| 15-445 distributed OLTP and OLAP | 14-16 |
| 15-721 formats and execution | 3, 5-6 |
| 15-721 UDFs and networking | 7-8 |
| 15-721 vectorization, compilation, and scheduling | 10 |
| 15-721 optimizer and cost models | 9 |
| 15-721 analytical-system case studies | 15-16 |

## Chapter ownership boundaries

- Chapter 3 owns physical data representation; Chapter 4 owns access paths built over that data.
- Chapter 5 owns the operator pipeline; Chapter 6 owns algorithms used by blocking relational operators.
- Chapter 7 owns server-side computation; Chapter 8 owns communication between database and client.
- Chapter 9 owns plan selection; Chapter 10 owns efficient execution of the selected plan.
- Chapter 11 owns isolation guarantees and anomalies; Chapter 12 owns the protocols that enforce those guarantees.
- Chapter 13 owns single-database durability; Chapter 14 owns cross-node transactional coordination.
- Chapter 15 owns distributed cloud-warehouse architecture; Chapter 16 owns lakehouse and embedded deployment boundaries.

## Proposed output

- Course source: `courses/database-systems/`
- Generated page: `techstack/database-systems/01-database-systems-end-to-end.html`
- Site entry: add a 16-chapter Database Systems course to `data/systems.js`.

Implementation should begin only after this chapter plan is approved.
