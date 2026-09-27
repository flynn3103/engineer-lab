# Feature 03: Key expiration and TTL

## Outcome

Make expired keys logically invisible even before cleanup.

## Ý tưởng chính

Store absolute deadlines, check on access, and reclaim untouched keys with a bounded active cycle.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| key TTL | absolute deadlines | key level only |
| active expiration | bounded cleanup cycle | no exact callback time |

## Dependency

Features 01–02.

## Strength, cost, and next question

TTL simplifies cache lifecycles; expired keys can still consume memory until cleanup.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: EXPIRE/TTL/PERSIST contract

Define deadlines, TTL responses and PERSIST behavior.

### UC-02 — TBU: access-time checks

Check deadlines before reads and mutations.

### UC-03 — TBU: fake-clock cleanup tests

Reclaim untouched expired keys under a fixed time budget.

## Feature boundary

No field TTL or exact-time callbacks.

## Hoàn thành khi

- no expired value is returned;
- cleanup work stays bounded;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/develop/use/keyspace/).
