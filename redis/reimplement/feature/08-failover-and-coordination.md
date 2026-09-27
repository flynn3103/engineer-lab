# Feature 08: Failover and Sentinel-like coordination

## Outcome

Promote a replica and redirect clients when the primary fails.

## Ý tưởng chính

Use failure evidence and observed offsets; fence the old primary and expose possible loss.

## Mapping với Redis

| Redis | Project | Deliberate limit |
| --- | --- | --- |
| Sentinel | small failure monitor | no quorum parity |
| promotion | offset-aware replica choice | bounded local topology |

## Dependency

Feature 06.

## Strength, cost, and next question

Availability improves; stale replicas and split views make promotion risky.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: failure detection

Require a configurable failure threshold before suspicion.

### UC-02 — TBU: promotion

Promote an offset-aware replica and fence former-primary writes.

### UC-03 — TBU: client discovery

Publish versioned primary identity for client refresh.

## Feature boundary

No production Sentinel quorum or partition guarantees.

## Hoàn thành khi

- one primary is writable in a stable view;
- possible lost writes are reported;
- all use cases remain `TBU` until specified and implemented.

Background: [Redis documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/).
