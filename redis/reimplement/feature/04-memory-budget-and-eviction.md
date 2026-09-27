# Feature 04: Memory budget and eviction

## Outcome

Enforce a memory budget with noeviction and approximate LRU/LFU.

## Ý tưởng chính

Account for key, value and metadata bytes; evict live keys only when admission needs space.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| maxmemory | explicit byte budget | approximate accounting |
| eviction policy | noeviction and sampled LRU/LFU | no full policy matrix |

## Dependency

Features 02–03.

## Strength, cost, and next question

Capacity stays bounded; evictions lower hit rate and noeviction rejects writes.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: byte accounting

Count key, value and metadata bytes under a stated approximation.

### UC-02 — TBU: victim selection

Compare noeviction with sampled LRU and LFU victims.

### UC-03 — TBU: hit/miss/eviction metrics

Separate evictions, expirations, misses and rejected writes.

## Feature boundary

No allocator-exact accounting or every Redis policy.

## Hoàn thành khi

- policy decisions are reproducible;
- expiry and eviction are distinct;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/develop/reference/eviction/).
