# Feature 11: Isolation levels and deadlock handling

## Outcome

Make concurrency anomalies and lock waits visible under more than one isolation policy.

## Ý tưởng chính

Compare Read Committed and repeatable snapshots; add lock waits, timeout/deadlock handling and histories that expose anomalies.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| isolation levels | Read Committed and repeatable snapshot | no SSI |
| deadlock handling | wait graph or timeout | reduced lock modes |

## Dependency

Feature 05.

## Strength, cost, and next question

Stronger isolation reduces anomalies but can add aborts, waits or deadlocks.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: isolation contracts

Define snapshot refresh and conflict rules per level.

### UC-02 — TBU: anomaly histories

Exercise nonrepeatable-read, phantom and write-skew histories.

### UC-03 — TBU: deadlock detection

Resolve wait cycles or timeouts and release victim locks.

## Feature boundary

No PostgreSQL SSI parity or distributed transactions.

## Hoàn thành khi

- each level exhibits only its documented anomalies;
- deadlock victims release resources;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/transaction-iso.html).
