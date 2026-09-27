# Feature 04: B-tree index and index scan

## Outcome

Add ordered point/range access paths into heap rows.

## Ý tưởng chính

A B-tree-like structure maps keys to row IDs; index scans must recheck row visibility and remain correct through page splits.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| B-tree | ordered key-to-row-ID pages | one key type |
| index scan | lookup plus heap visibility | no covering scan |

## Dependency

Features 02–03.

## Strength, cost, and next question

Indexes accelerate selective reads but add writes, space and random I/O.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: insert/lookup/range

Keep leaf keys ordered across insert and split.

### UC-02 — TBU: split and delete

Return row IDs for equality and range predicates.

### UC-03 — TBU: index versus sequential scan

Compare index results and I/O against heap scans.

## Feature boundary

No every PostgreSQL index type or concurrent index build.

## Hoàn thành khi

- index and scan return identical visible rows;
- page-I/O trade-off is measurable;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/indexes-types.html).
