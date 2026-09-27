# Feature 05: Snapshots, append-only log and crash recovery

## Outcome

Recover standalone state under a declared durability policy.

## Ý tưởng chính

Compare point-in-time snapshots with append-only mutation replay; validate records and make fsync policy explicit.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| RDB | checksummed point-in-time snapshot | custom format |
| AOF | append-only mutation records | custom format |

## Dependency

Features 01–04.

## Strength, cost, and next question

Persistence survives restart; snapshots have loss windows and AOF adds latency and size.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: checksummed snapshots

Validate a temporary snapshot before publication.

### UC-02 — TBU: complete-record replay

Replay complete records and reject a torn log tail.

### UC-03 — TBU: crashes around fsync

Crash around append and fsync to measure the loss window.

## Feature boundary

No Redis file-format compatibility or production backup tooling.

## Hoàn thành khi

- recovery never applies partial records;
- restored TTL uses absolute deadlines;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
