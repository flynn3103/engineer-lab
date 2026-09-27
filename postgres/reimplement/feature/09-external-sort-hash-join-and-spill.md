# Feature 09: External sort, hash join and spill

## Outcome

Run large joins and sorts within an explicit memory budget.

## Ý tưởng chính

Sort runs spill to temporary files; hash join partitions or spills its build side rather than assuming all rows fit in RAM.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| external sort | spill runs and merge | local files |
| hash join | bounded build/probe | inner equijoin only |

## Dependency

Features 03 and 08.

## Strength, cost, and next question

Better algorithms reduce repeated scans; spill consumes disk and complicates cleanup.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: bounded sort runs

Sort bounded runs and merge under a memory cap.

### UC-02 — TBU: hash join

Build/probe an equijoin with bounded hash state.

### UC-03 — TBU: temporary-file lifecycle

Clean temporary files after success or interruption.

## Feature boundary

No parallel operators, columnar execution or production temp-file format.

## Hoàn thành khi

- output is equivalent with and without spill;
- failed work leaves no visible partial result;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://15445.courses.cs.cmu.edu/fall2025/schedule.html).
