# Feature 02: Heap pages and buffer pool

## Outcome

Store rows on durable slotted pages addressed by stable row IDs.

## Ý tưởng chính

A buffer pool pins pages, tracks dirty state and chooses victims under a fixed frame budget.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| heap page | slotted fixed-size page | custom format |
| buffer manager | pin/dirty/evict frames | fixed budget |

## Dependency

Feature 01.

## Strength, cost, and next question

Pages bound disk I/O; scans read many pages and a finite cache can thrash.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: slotted-page layout

Encode rows with slots and detect invalid pages.

### UC-02 — TBU: page allocation and row IDs

Allocate pages with stable row identifiers.

### UC-03 — TBU: pin/unpin and eviction

Keep pinned frames resident and flush dirty frames safely.

## Feature boundary

No PostgreSQL page-format compatibility, compression or concurrent buffer replacement.

## Hoàn thành khi

- restart reads committed page format;
- pinned pages are never evicted;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/storage-page-layout.html).
