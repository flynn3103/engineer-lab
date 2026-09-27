# Feature 05: Transactions and MVCC

## Outcome

Provide atomic transaction boundaries and snapshot-visible row versions.

## Ý tưởng chính

Keep old and new row versions; visibility depends on transaction state and snapshot. Define one isolation level and explicit write-conflict rules.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| MVCC | row versions and snapshots | one isolation level |
| transaction state | commit/abort visibility | single node |

## Dependency

Features 02–04.

## Strength, cost, and next question

Readers can avoid blocking writers; dead versions and long transactions consume space.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: BEGIN/COMMIT/ROLLBACK

Define transaction states and visibility transitions.

### UC-02 — TBU: snapshot visibility

Test snapshots against concurrent insert, update and delete.

### UC-03 — TBU: write conflicts and anomalies

Specify wait/abort behavior for conflicting writes.

## Feature boundary

No serializable isolation, SSI or PostgreSQL tuple-format parity.

## Hoàn thành khi

- uncommitted changes are invisible to others;
- concurrent histories match declared isolation;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/mvcc-intro.html).
