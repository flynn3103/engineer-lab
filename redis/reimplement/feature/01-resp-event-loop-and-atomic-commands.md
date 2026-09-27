# Feature 01: RESP, event loop and atomic commands

## Outcome

Serialize state-changing commands from concurrent clients.

## Ý tưởng chính

Decode bounded RESP requests, queue commands, execute one at a time, and encode ordered replies.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| RESP framing | bounded RESP2 parser | no RESP3 |
| command execution | single serialized state owner | no Lua |

## Dependency

none.

## Strength, cost, and next question

Atomic command effects avoid locks; slow commands delay other clients.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: binary-safe framing

Accept fragmented, pipelined and binary-safe frames within size limits.

### UC-02 — TBU: command dispatch

Validate command name and arity before serialized execution.

### UC-03 — TBU: slow-command metrics

Measure queue wait separately from command duration.

## Feature boundary

No RESP3, Lua or full protocol compatibility.

## Hoàn thành khi

- concurrent increments lose no updates;
- malformed frames cannot corrupt subsequent requests;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/reference/protocol-spec/).
