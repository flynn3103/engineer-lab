# Feature 06: Replication and durability

## Outcome

A static multi-broker cluster replicates each partition from one leader to
followers. ISR, high watermark, leader epochs and acknowledgements make
durability and availability tradeoffs observable.

## Ý tưởng chính

Followers fetch the leader log. Only the committed prefix up to the high
watermark is readable to ordinary consumers. The leader waits for the
configured in-sync replicas for `acks=all`; if `min.insync.replicas` is
not met, it rejects such writes. An epoch fences an old leader after
failover.

```mermaid
flowchart LR
    P[Producer] --> L[Leader append]
    L --> F[Follower fetch]
    F --> I[ISR progress]
    I --> H[Advance high watermark]
    H --> A[Acknowledge acks all]
```

## Mapping với Kafka

| Kafka | Project | Deliberate limit |
| --- | --- | --- |
| partition leader/follower | fixed broker set and pull replication | no dynamic cluster manager |
| ISR and high watermark | committed-prefix tracker | reduced liveness policy |
| `acks=1` / `acks=all` | leader-local / ISR-based response | no transaction semantics |
| leader epoch | stale-leader fencing | manually selected controller |

## Dependency

- Feature 01 supplies append/recovery.
- Features 02–03 supply partition identity and acknowledgements.

## Strength, cost, and next question

Replication protects committed data from a broker failure. Waiting for ISR
raises write latency and may reduce availability; electing an out-of-sync
replica risks data loss and is disabled. Feature 13 later replicates
controller metadata rather than the data log.

## Use cases và roadmap

`TBU` means planned, without a detailed use-case document or implementation.

### UC-01 — TBU: Replica fetch and divergence repair

Copy ordered records and truncate only an uncommitted divergent suffix after
a leader change.

### UC-02 — TBU: ISR, high watermark and acknowledgements

Track caught-up replicas, advance the committed prefix and enforce
`min.insync.replicas` for `acks=all`.

### UC-03 — TBU: Leader election and fencing

Elect only an eligible in-sync replica; reject writes from stale epochs.

### UC-04 — TBU: Broker-loss experiment

Compare acknowledged records under `acks=1` and `acks=all`; report ISR
shrink, under-replicated partitions and rejected writes.

## Feature boundary

No KRaft quorum, automatic reassignment, unclean election or production
network security.

## Hoàn thành khi

- consumers see only the committed prefix;
- an in-sync failover preserves records acknowledged with `acks=all`;
- the `acks=1` experiment identifies records that can be lost after failover;
- stale leaders cannot publish after the epoch changes;
- all use cases remain `TBU` until specified and implemented.
