# Feature 03: Iterator query execution

## Outcome

Execute relational plans through streaming operators.

## Ý tưởng chính

Each operator opens child iterators and emits rows; implement sequential scan, filter, projection, nested-loop join and small aggregation.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| executor nodes | streaming row iterators | no vectorization |
| EXPLAIN | operator tree and counters | reduced metrics |

## Dependency

Features 01–02.

## Strength, cost, and next question

Streaming limits memory, but repeated scans make joins expensive.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: scan/filter/project

Stream rows through scan, filter and projection.

### UC-02 — TBU: nested-loop join

Define bag semantics and null handling for inner join.

### UC-03 — TBU: aggregate and operator metrics

Count input/output rows and memory per operator.

## Feature boundary

No parallel execution, vectorization or full SQL semantics.

## Hoàn thành khi

- operators return correct bag semantics;
- row counts and page reads are visible;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://15445.courses.cs.cmu.edu/fall2025/schedule.html).
