# Feature 02: Typed in-memory keyspace

## Outcome

Represent keys with explicit value types and deterministic errors.

## Ý tưởng chính

Implement a small string, hash, list, set and sorted-set command subset; preserve type invariants.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| Redis value types | small string and collection subset | limited commands |
| WRONGTYPE | deterministic type validation | no modules |

## Dependency

Feature 01.

## Strength, cost, and next question

Purpose-built structures are fast; large values and command complexity consume CPU and RAM.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: string mutations

Specify byte-string identity and numeric conversion errors.

### UC-02 — TBU: collection operations

Preserve ordering or uniqueness in each supported collection.

### UC-03 — TBU: type errors and byte accounting

Reject mismatched types before mutation and count value bytes.

## Feature boundary

No full command parity, modules or JSON.

## Hoàn thành khi

- wrong-type operations leave values unchanged;
- per-command cost is measurable;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/develop/use/keyspace/).
