# Feature 08: Statistics and cost-based planner

## Outcome

Choose among valid scans and join plans using measured table statistics.

## Ý tưởng chính

Collect row/page counts and selectivity summaries; estimate operator cost and compare estimates with actual metrics.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| ANALYZE | row/page/selectivity summaries | small sample |
| planner | deterministic cost comparison | limited alternatives |

## Dependency

Features 03–04 and 07.

## Strength, cost, and next question

A fixed plan is predictable but often slow; estimates can fail on skew or stale statistics.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: ANALYZE-like statistics

Collect page, row and selectivity estimates.

### UC-02 — TBU: scan and join cost

Compare scan and limited join alternatives.

### UC-03 — TBU: EXPLAIN estimated versus actual

Explain estimated versus actual rows and stale statistics.

## Feature boundary

No full PostgreSQL optimizer, GEQO or exhaustive join search.

## Hoàn thành khi

- chosen plan preserves query semantics;
- misestimation is diagnosable;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/using-explain.html).
