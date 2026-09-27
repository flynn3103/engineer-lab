# Feature 14: Logical plan, analyzer và rule-based optimizer

## Outcome

Feature 14 turns unresolved DataFrame plans into analyzed, optimized logical plans. It resolves attributes against schemas, validates types, applies safe rewrite rules to a fixed point, and preserves SQL-style null semantics within the supported expression subset.

## Ý tưởng chính

Analysis establishes meaning; optimization changes plan shape without changing meaning. Rules are isolated, deterministic and observable: each rule receives an immutable plan and may return a replacement plan plus diagnostics.

```mermaid
flowchart LR
    U[Unresolved plan] --> A[Analyzer]
    A --> R[Resolved plan]
    R --> O[Rule batches]
    O --> X[Optimized logical plan]
```

## Mapping với Spark

| Spark SQL | Project | Giới hạn có chủ đích |
| --- | --- | --- |
| Analyzer | attribute/type resolver | reduced catalog-free scope |
| Catalyst rules | batch rewrite framework | no Scala tree patterns |
| optimizer | projection/filter simplification | rule set intentionally small |
| null semantics | three-valued boolean subset | no full SQL dialect |

## Dependency với Feature 13

- Feature 13 provides schema, expression AST and unresolved logical nodes.
- Feature 06 provides deterministic explain and diagnostic events.

## Use cases và roadmap

`TBU` nghĩa là planned nhưng chưa có tài liệu chi tiết hoặc implementation.

### UC-01 — TBU: Attribute resolution
Resolve column names to stable field IDs; diagnose missing and ambiguous references.

### UC-02 — TBU: Type checking and coercion
Validate operator input types and define a minimal safe coercion matrix.

### UC-03 — TBU: Alias and schema propagation
Propagate output schema through project, filter, union and limit.

### UC-04 — TBU: Rule framework
Run named rule batches to convergence with iteration caps and plan-change records.

### UC-05 — TBU: Predicate simplification
Fold literals, simplify boolean expressions and respect null semantics.

### UC-06 — TBU: Projection and filter rewrites
Collapse compatible projects and push filters through safe logical operators.

### UC-07 — TBU: Optimizer explain
Show analyzed and optimized plans plus applied rules without exposing record data.

## Feature boundary

No SQL parser, catalog resolution, cost-based optimizer, aggregate/window rewrites, subqueries, join reordering, or user-defined functions.

## Hoàn thành khi

- unresolved attributes never reach physical planning;
- optimized plans are semantically equivalent for supported expressions;
- rule order, convergence cap and applied changes are observable;
- null-sensitive rewrites are covered by tests;
- toàn bộ UC vẫn `TBU` cho tới khi có detailed spec và implementation.
