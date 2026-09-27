# Feature 10: Checkpoint and WAL lifecycle

## Outcome

Bound recovery work and retire WAL only after its effects are safely reflected in pages.

## Ý tưởng chính

A checkpoint records a durable recovery position; WAL truncation follows page-flush and snapshot-retention rules.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| checkpoint | durable recovery position | single node |
| WAL recycling | safe segment retirement | no archive/PITR |

## Dependency

Features 02 and 06.

## Strength, cost, and next question

Frequent checkpoints shorten recovery but increase write I/O; rare ones grow replay time.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: checkpoint record

Record a durable redo starting position.

### UC-02 — TBU: dirty-page flush

Flush eligible dirty pages after required WAL.

### UC-03 — TBU: safe WAL retention

Retain only WAL still needed for recovery.

## Feature boundary

No PostgreSQL checkpoint tuning, archiving or PITR.

## Hoàn thành khi

- restart works across a checkpoint boundary;
- no required WAL is removed;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/wal-intro.html).
