# Feature 10: Streams and consumer groups

## Outcome

Add ordered per-key event history and recoverable group progress.

## Ý tưởng chính

Stream entries have IDs; consumer groups track pending delivery separately from retention.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| Streams | ordered entry IDs | small append/read subset |
| consumer groups | pending and ack state | no exactly once |

## Dependency

Features 02, 05 and 07.

## Strength, cost, and next question

Worker coordination gains history; pending state and trimming add memory and recovery costs.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: entry IDs

Generate monotonic IDs and support reads after an ID.

### UC-02 — TBU: delivery and acknowledgment

Track pending delivery separately from stream entries.

### UC-03 — TBU: retention

Reassign unacked work and apply explicit trimming.

## Feature boundary

No full Streams API or exactly-once processing.

## Hoàn thành khi

- unacked work can be redelivered;
- trimmed history is explicit;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/develop/data-types/streams/).
