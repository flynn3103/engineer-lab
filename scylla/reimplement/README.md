# Scylla, rebuilt for learning

Build a small Go wide-column store to study the decisions that dominate
ScyllaDB operations: key-based data placement, LSM read/write cost,
tombstones, shard ownership, and leaderless replication with tunable
consistency. This is a learning model, not a CQL-compatible ScyllaDB clone.

## Learning rule

Each feature explains one invariant, then asks what becomes expensive or
unsafe under skew, overload, crash, or replica failure.

| Core principle | Benefit | Cost that motivates later work |
| --- | --- | --- |
| Partition and clustering keys | fast colocated reads and range order | hot/wide partitions and limited alternate queries |
| Commitlog, memtable, SSTable | sequential durable writes | read, write, and space amplification |
| Tombstones and TTL | distributed delete semantics | read cost and unsafe early garbage collection |
| Shard ownership and async work | less shared-state contention | hot shards and queueing latency |
| Leaderless replicas and consistency levels | flexible availability/latency | divergent replicas and conditional-write complexity |

## Core roadmap

1. [Partition and token routing](feature/01-partition-and-token-routing.md)
2. [Commitlog, memtable and SSTable](feature/02-commitlog-memtable-and-sstable.md)
3. [Read merge and basic compaction](feature/03-read-merge-and-basic-compaction.md)
4. [TTL, tombstones and delete safety](feature/04-ttl-tombstones-and-delete-safety.md)
5. [Shard ownership and async scheduling](feature/05-shard-ownership-and-async-scheduling.md)
6. [Leaderless replication and consistency](feature/06-leaderless-replication-and-consistency.md)

## Advanced roadmap

7. [Bloom filters, indexes and cache](feature/07-bloom-filters-indexes-and-cache.md)
8. [Compaction strategies](feature/08-compaction-strategies.md)

Feature 07 depends on the read path in Feature 03. Feature 08 depends on
Features 03–04 and uses Feature 07's read-cost measurements.

## Scope

These are roadmap documents. All use cases are marked `TBU` until detailed
design and implementation exist. The Go model does not reproduce Seastar's
CPU pinning, ScyllaDB's storage formats, or its full CQL protocol.

Background: [partition and clustering keys](https://docs.scylladb.com/manual/stable/cql/ddl.html),
[compaction](https://docs.scylladb.com/manual/stable/kb/compaction.html),
[fault tolerance](https://docs.scylladb.com/manual/stable/architecture/architecture-fault-tolerance.html).
