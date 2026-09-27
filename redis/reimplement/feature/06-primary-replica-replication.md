# Feature 06: Primary–replica replication and offsets

## Outcome

Replicas follow an ordered primary mutation stream with observable lag.

## Ý tưởng chính

Use replication offsets; reconnect with backlog catch-up or full snapshot sync.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| replication stream | ordered mutation records | one primary |
| partial resync | bounded backlog | no cascading replicas |

## Dependency

Feature 05.

## Strength, cost, and next question

Copies improve availability and reads; async lag can lose acknowledged writes after failover.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: ordered apply

Assign offsets and apply mutations in primary order.

### UC-02 — TBU: reconnect

Use backlog catch-up or a fresh snapshot after reconnect.

### UC-03 — TBU: lag metrics

Report replica offset and elapsed-time lag.

## Feature boundary

No automatic failover or zero-loss guarantees.

## Hoàn thành khi

- replicas converge after catch-up;
- duplicate delivery is safe;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/manual/replication/).
