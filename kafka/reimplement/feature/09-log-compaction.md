# Feature 09: Log compaction

## Outcome

A keyed log can retain the latest known value per key while reclaiming
superseded records in older closed segments.

## Ý tưởng chính

Compaction removes selected records without renumbering surviving offsets.
A null value is a tombstone for a key; deleting tombstones too soon can make
a rebuilding consumer miss a deletion.

```mermaid
flowchart LR
    S[Closed segments] --> K[Latest offset per key]
    K --> C[Rewrite survivors]
    C --> V[Validate new segments]
    V --> P[Atomic publish]
```

## Mapping với Kafka

| Kafka | Project | Deliberate limit |
| --- | --- | --- |
| compact cleanup policy | latest keyed record survives | local cleaner |
| tombstone | delete marker and grace period | one key format |
| offset stability | gaps after compaction | no offset renumbering |

## Dependency

- Feature 01 supplies segment format and offsets.
- Feature 05 supplies cleanup lifecycle and log start bounds.

## Strength, cost, and next question

Compaction supports state reconstruction with less storage, but old event
history disappears and cleaning consumes I/O. Feature 14 explores longer
history retention through a remote tier.

## Use cases và roadmap

`TBU` means planned, without a detailed use-case document or implementation.

### UC-01 — TBU: Key and tombstone contract

Require keys, define null-value deletion and minimum tombstone visibility.

### UC-02 — TBU: Segment cleaner

Select closed segments, retain latest eligible values, validate output and
publish replacement atomically.

### UC-03 — TBU: Offset gap behavior

Fetch from a removed offset returns the next surviving record without
reusing the removed offset.

### UC-04 — TBU: Rebuild experiment

Restore latest state from a compacted log and compare it with full-history
replay for supported keys.

## Feature boundary

No complete event-history guarantee, infinite tombstone retention or
compaction of the active segment.

## Hoàn thành khi

- surviving records keep original order and offsets;
- rebuilding within the tombstone window observes deletes;
- interrupted cleaning leaves an intact readable log;
- all use cases remain `TBU` until specified and implemented.
