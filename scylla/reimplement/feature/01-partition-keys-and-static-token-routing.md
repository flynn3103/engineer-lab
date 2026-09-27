# Feature 01: Partition keys and static token routing

## Outcome

A table accepts a partition key and optional clustering key. The partition
key hashes to a token and a fixed owner; clustering keys order rows inside
one partition. This feature routes requests but does not migrate stored data.

## Ý tưởng chính

Key choice determines both data placement and efficient query shape. Equal
partition keys stay together. Static token ranges make ownership visible.

```mermaid
flowchart LR
    K[Partition key] --> T[Hash to token]
    T --> O[Static owner]
    O --> P[Partition]
    C[Clustering key] --> P
    P --> R[Ordered rows]
```

## Mapping với ScyllaDB

| ScyllaDB | Project | Deliberate limit |
| --- | --- | --- |
| partition key | deterministic token input | one hash function |
| clustering key | row order within partition | small comparable type set |
| token ownership | fixed range map | no ownership changes |

## Dependency

This is the foundation; it has no earlier feature dependency.

## Strength, cost, and next question

Colocated keyed reads are cheap, but a wide or hot partition concentrates
work. The fixed routing model cannot spread one partition's load across
multiple owners.

## Use cases và roadmap

`TBU` means planned, without a detailed use-case document or implementation.

### UC-01 — TBU: Key and row contract

Define canonical key bytes, null rejection, clustering comparison and
deterministic row identity.

### UC-02 — TBU: Token routing

Hash partition keys and map every token to one fixed owner.

### UC-03 — TBU: Bounded partition query

Read one partition or a clustering-key range; reject unsupported global
scans explicitly.

### UC-04 — TBU: Skew experiment

Compare evenly distributed keys with one hot/wide partition using
per-partition bytes and request counts.

## Feature boundary

No CQL parser, mutable topology, existing-data migration or global sort.

## Hoàn thành khi

- equal partition keys route together;
- clustering order is deterministic within a partition;
- skew is visible per partition and owner;
- all use cases remain `TBU` until specified and implemented.
