# Feature 07: Optimistic transactions and pipelining

## Outcome

Distinguish network batching from atomic multi-command execution.

## Ý tưởng chính

Pipelines save round trips; WATCH checks key versions and EXEC runs queued commands without interleaving.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| pipelining | batched RESP requests | not atomic |
| WATCH/MULTI/EXEC | version check and queued batch | reduced errors |

## Dependency

Features 01–02.

## Strength, cost, and next question

Batching helps throughput but not read-modify-write races; optimistic transactions may abort.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: pipeline framing

Batch requests while preserving reply order.

### UC-02 — TBU: queued execution

Execute queued effects without another client interleaving.

### UC-03 — TBU: version-conflict tests

Abort when a watched key changes, expires or is deleted.

## Feature boundary

No Lua or full transaction parity.

## Hoàn thành khi

- pipeline does not imply atomicity;
- conflicted transactions change no keys;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/develop/using-commands/transactions/).
