# Redis, rebuilt for learning

Build a small Go data server to learn command atomicity, memory cost,
durability trade-offs, and asynchronous replication. This is not a
Redis-compatible server.

## Core roadmap

1. [RESP, event loop and atomic commands](feature/01-resp-event-loop-and-atomic-commands.md)
2. [Typed in-memory keyspace](feature/02-typed-in-memory-keyspace.md)
3. [Key expiration and TTL](feature/03-key-expiration.md)
4. [Memory budget and eviction](feature/04-memory-budget-and-eviction.md)
5. [Snapshots, append-only log and crash recovery](feature/05-persistence-and-crash-recovery.md)
6. [Primary–replica replication and offsets](feature/06-primary-replica-replication.md)

## Advanced roadmap

7. [Optimistic transactions and pipelining](feature/07-transactions-and-pipelining.md)
8. [Failover and Sentinel-like coordination](feature/08-failover-and-coordination.md)
9. [Cluster hash slots and online resharding](feature/09-cluster-hash-slots-and-resharding.md)
10. [Streams and consumer groups](feature/10-streams-and-consumer-groups.md)

The 80/20 idea is to serialize effects over a typed in-memory keyspace,
then make TTL, memory pressure, persistence and replication observable.
Each later feature addresses a cost or failure mode exposed earlier.
All use cases are `TBU`; no engine or detailed use-case document is added.
