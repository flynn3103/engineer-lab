# Feature 01: Schema, catalog and relational algebra

## Outcome

Represent tables, columns, types and relational query meaning.

## Ý tưởng chính

Bind a deliberately small SQL subset to scan, filter, project and join nodes; separate parsing from execution.

## Mapping với PostgreSQL and CMU

| Reference concept | Learning model | Deliberate limit |
| --- | --- | --- |
| catalog and schema | table and field metadata | limited types |
| relational algebra | scan/filter/project/join tree | small SQL subset |

## Dependency

none.

## Strength, cost, and next question

Schemas give meaning and type safety; unsupported SQL and ambiguous names need explicit errors.

## Use cases và roadmap

`TBU` means planned, without implementation or a detailed use-case document.

### UC-01 — TBU: table/type catalog

Define table/field IDs, types, nullability and name rules.

### UC-02 — TBU: SQL subset and binder

Bind a narrow SQL subset to typed logical nodes.

### UC-03 — TBU: logical plan explain

Render a logical tree without reading row data.

## Feature boundary

No full SQL grammar, views or PostgreSQL catalog compatibility.

## Hoàn thành khi

- unknown or ambiguous columns fail before execution;
- equivalent logical plans return equal rows;
- all use cases remain `TBU` until specified and implemented.

Background: [primary reference](https://15445.courses.cs.cmu.edu/fall2025/schedule.html).
