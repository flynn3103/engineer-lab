# Feature 09: Cluster hash slots and online resharding

## Outcome

Partition keys across nodes and migrate stored keys when slot ownership changes.

## Ý tưởng chính

Redis Cluster uses 16,384 hash slots, not consistent hashing; redirects alone do not move data.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| hash slots | CRC16 key-to-slot map | 16,384 slots |
| resharding | copy keys then switch owner | one slot at a time |

## Dependency

Features 02 and 06–08.

## Strength, cost, and next question

More capacity costs cross-slot restrictions and migration coordination.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: slot and hash-tag routing

Compute CRC16 slots and hash-tag behavior.

### UC-02 — TBU: redirects

Redirect requests when ownership differs or is migrating.

### UC-03 — TBU: one-slot migration

Copy keys and TTLs, catch writes up, then commit the new owner.

## Feature boundary

No full Cluster bus, gossip or config epochs.

## Hoàn thành khi

- stable placement has one serving owner;
- key values and TTL survive migration;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/).
