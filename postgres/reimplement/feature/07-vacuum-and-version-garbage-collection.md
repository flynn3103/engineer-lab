# Feature 07: VACUUM and version garbage collection

## Outcome

Reclaim dead MVCC versions only when no active snapshot needs them.

## Ý tưởng chính

Track the oldest needed snapshot horizon; remove safe versions and update free-space metadata.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| VACUUM | safe dead-version removal | manual first |
| snapshot horizon | oldest active reader | no XID wraparound |

## Dependency

Features 05–06.

## Strength, cost, and next question

MVCC gives concurrency but update/delete bloat affects storage and scans.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: visibility horizon

Compute the oldest still-needed snapshot horizon.

### UC-02 — TBU: safe version pruning

Prune only versions invisible to every active snapshot.

### UC-03 — TBU: bloat metrics

Measure dead bytes and reusable slots.

## Feature boundary

No PostgreSQL autovacuum parity or transaction-ID wraparound handling.

## Hoàn thành khi

- active readers keep needed versions;
- space becomes reusable after the horizon moves;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/routine-vacuuming.html).
