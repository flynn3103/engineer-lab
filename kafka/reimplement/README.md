# Kafka, rebuilt for learning

Build a small Go event-log broker to understand the decisions that dominate
Kafka operations: partition ordering, consumer progress, batching, retention,
and replicated durability. The implementation uses a deliberately small local
protocol; Kafka wire compatibility and production cluster parity are outside
this roadmap.

## Learning rule

For each feature, implement the mechanism, measure its benefit, then inject a
failure or overload that reveals its cost. A feature is understood when its
invariants and operational signals can explain the observed result.

| Core idea | Benefit | Cost that motivates later features |
| --- | --- | --- |
| Partitioned append-only log | sequential I/O, replay, per-partition order | no topic-wide order; hot partitions |
| Consumer-owned offset and pull | independent readers and replay | lag, duplicate processing, rebalance pauses |
| Batches | high throughput | latency, memory pressure, retry ambiguity |
| Replicated leader log | failover for committed data | write latency, reduced availability below ISR threshold |
| Retention | bounded storage | replay window can expire before a consumer catches up |

## Core roadmap

1. [Partition log and recovery](feature/01-partition-log-and-recovery.md)
2. [Topic partitions and key routing](feature/02-topic-partitions-and-key-routing.md)
3. [Produce, Fetch and batching](feature/03-produce-fetch-and-batching.md)
4. [Consumer offsets and groups](feature/04-consumer-offsets-and-groups.md)
5. [Retention and consumer lag](feature/05-retention-and-consumer-lag.md)
6. [Replication and durability](feature/06-replication-and-durability.md)

## Advanced roadmap

7. [Compression and backpressure](feature/07-compression-and-backpressure.md)
8. [Idempotent producer](feature/08-idempotent-producer.md)
9. [Log compaction](feature/09-log-compaction.md)
10. [Cooperative rebalance](feature/10-cooperative-rebalance.md)
11. [Partition reassignment and skew](feature/11-partition-reassignment-and-skew.md)
12. [Transactions and exactly-once processing](feature/12-transactions-and-exactly-once.md)
13. [Metadata quorum](feature/13-metadata-quorum.md)
14. [Tiered storage](feature/14-tiered-storage.md)

The advanced features are ordered for learning, not presented as one mandatory
implementation chain. Feature 12 depends on Features 04, 06 and 08; Features
07, 09, 10 and 14 can be studied independently once their listed core
dependencies are complete.

## Scope

These are roadmap documents. Each use case marked `TBU` still needs its own
design and implementation. Kafka Connect, Kafka Streams, Schema Registry,
multi-region replication, full security, and production compatibility remain
outside this learning track.

Background: [Apache Kafka design](https://kafka.apache.org/design/),
[KRaft operations](https://kafka.apache.org/43/operations/kraft/), and
[tiered storage](https://kafka.apache.org/43/operations/tiered-storage/).
