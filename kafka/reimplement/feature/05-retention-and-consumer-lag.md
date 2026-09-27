# Feature 05: Retention and consumer lag

## Outcome

The broker bounds local log storage by time or bytes and exposes when a
consumer's committed offset falls behind the retained log start.

## Ý tưởng chính

Retention acts on log segments regardless of whether consumers have read
them. Consumer offsets describe progress; they do not pin old records.
Deleting an eligible closed segment advances the log start offset.

```mermaid
flowchart LR
    S[Closed segments] --> P[Time or byte policy]
    P --> D[Delete eligible segment]
    D --> L[Advance log start]
    L --> E[Offset out of range if consumer is behind]
```

## Mapping với Kafka

| Kafka | Project | Deliberate limit |
| --- | --- | --- |
| delete retention | time/size segment policy | local disk |
| log start offset | first retained position | no remote tier yet |
| consumer lag | high watermark minus committed next offset | per-partition report |

## Dependency

- Feature 01 supplies closed segments and offsets.
- Feature 04 supplies committed consumer positions.

## Strength, cost, and next question

Retention makes storage predictable, but replay eventually expires. Feature
09 retains latest keyed state through compaction; Feature 14 explores a
remote tier for older segments. Neither removes the need to reason about
consumer progress and recovery.

## Use cases và roadmap

`TBU` means planned, without a detailed use-case document or implementation.

### UC-01 — TBU: Time and byte retention

Choose eligible closed segments and delete atomically with metadata updates.

### UC-02 — TBU: Out-of-range behavior

Return a clear error and available start/end offsets instead of silently
resetting a lagging consumer.

### UC-03 — TBU: Lag and replay window

Report committed offset, log start, readable end and distance to expiry.

### UC-04 — TBU: Retention failure test

Interrupt deletion and restart without exposing a missing or half-deleted
segment as valid data.

## Feature boundary

No compaction, tiered storage or per-consumer retention pinning.

## Hoàn thành khi

- time/byte limits remove only eligible closed segments;
- old offsets fail explicitly once their data is gone;
- a slow consumer experiment shows lag crossing the retention boundary;
- all use cases remain `TBU` until specified and implemented.
