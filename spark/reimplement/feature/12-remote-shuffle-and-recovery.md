# Feature 12: Remote shuffle và executor-loss recovery

## Outcome

Feature 12 makes shuffle output usable across executors. It tracks committed map outputs, fetches remote blocks with validation, reacts to executor loss, and selectively recomputes only invalid shuffle producers before releasing dependent reduce tasks.

## Ý tưởng chính

A reduce task never reads a filename guessed from a map task. It asks the driver-owned map-output tracker for committed block locations and validates every fetched block before consumption.

```mermaid
flowchart LR
    M[Map attempt] --> C[Commit block manifest]
    C --> T[Map-output tracker]
    T --> R[Reduce task fetch plan]
    R --> V[Fetch and validate blocks]
    V --> O[Reduce execution]
```

## Mapping với Spark

| Spark Core | Project | Giới hạn có chủ đích |
| --- | --- | --- |
| MapOutputTracker | driver map-output registry | no RPC endpoint hierarchy |
| shuffle block fetch | executor HTTP/RPC transfer | no external shuffle service |
| fetch failure | invalidate map output and rerun producer | bounded local policy |
| executor loss | lost-output detection | no decommission migration |

## Dependency với Feature 04–11

- Feature 04 defines shard layout and reduce barrier.
- Feature 05 defines attempt-safe publication and retries.
- Feature 11 provides executor identity and remote task execution.

## Use cases và roadmap

`TBU` nghĩa là planned nhưng chưa có tài liệu chi tiết hoặc implementation.

### UC-01 — TBU: Committed map-output registry
Track map partition, attempt, reduce block metadata, executor location and checksum.

### UC-02 — TBU: Remote block protocol
Define authenticated-later MVP requests, backpressure-free small transfer protocol and checksum validation.

### UC-03 — TBU: Reduce fetch planning
Build a deterministic list of committed blocks for one reduce partition.

### UC-04 — TBU: Fetch failure classification
Distinguish unavailable executor, missing block, checksum mismatch and consumer cancellation.

### UC-05 — TBU: Selective invalidation
On executor loss, invalidate only outputs hosted by that executor and identify required producer tasks.

### UC-06 — TBU: Stage recovery barrier
Rerun invalid producers, wait for replacement committed outputs, then reopen dependent reduce work.

### UC-07 — TBU: Shuffle observability
Record remote bytes, fetch latency, retries, invalidations and recovered stages.

## Feature boundary

No external shuffle service, block replication, encryption, push-based shuffle, remote disk management, or full cluster failover.

## Hoàn thành khi

- reduce tasks consume only tracker-approved committed blocks;
- a lost executor invalidates affected map outputs but not unrelated stages;
- checksum failures cannot produce a successful reduce result;
- recovery progress is visible in events and summary;
- toàn bộ UC vẫn `TBU` cho tới khi có detailed spec và implementation.
