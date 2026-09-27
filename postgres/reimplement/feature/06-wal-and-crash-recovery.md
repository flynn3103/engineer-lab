# Feature 06: WAL and crash recovery

## Outcome

Preserve committed effects across a crash without flushing every dirty page at commit.

## Ý tưởng chính

Log changes before dirty pages reach disk; flush commit evidence before acknowledgment; replay committed work and reject torn log tails.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| WAL | log-before-data ordering | custom records |
| crash recovery | validated replay | no ARIES parity |

## Dependency

Features 02 and 05.

## Strength, cost, and next question

WAL improves durability but adds logging I/O and can grow without checkpoints.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: LSN and WAL ordering

Assign LSNs and enforce log-before-page ordering.

### UC-02 — TBU: commit flush

Flush required WAL before acknowledging COMMIT.

### UC-03 — TBU: fault-injected replay

Crash at write boundaries and validate replay.

## Feature boundary

No full ARIES, PostgreSQL WAL format or replication.

## Hoàn thành khi

- acknowledged commits survive declared crash cases;
- uncommitted work is not visible;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://www.postgresql.org/docs/current/wal-intro.html).
