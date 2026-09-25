---
name: engineering-feature-specs
description: "Use when an engineer needs a product PRD decomposed into implementation-ready feature specifications, capacity estimates, Mermaid diagrams, or a high-level deployment design."
---

# Engineering Feature Specs

Turn an approved product scope into concise engineering specifications. Preserve
the chosen deployment boundary and make capacity assumptions explicit; do not
turn a learning MVP into a production platform.

## When to use

Use for a new system or subsystem when the user asks for a PRD, feature specs,
functional/non-functional requirements, back-of-the-envelope sizing, Mermaid
diagrams, or a deployable-component design. Do not use for a code-only task or
to reverse-engineer an existing implementation without a product scope.

## Workflow

1. Read the existing PRD, README, and architecture documents. Extract the
   agreed users, deployment boundary, feature inventory, non-goals, and target
   environment. If a scope decision is missing and materially changes the
   architecture (for example, local versus multi-node or goroutines versus
   child worker processes), ask one focused question before creating documents.
2. Create an index at `docs/features/README.md` and one feature file per
   agreed capability. Use ordered filenames when delivery dependencies matter.
3. Create `docs/features/CAPACITY-ASSUMPTIONS.md` when more than one feature
   shares sizing assumptions. Put common host, CPU, RAM, disk, concurrency,
   input-shape, and safety-margin assumptions there.
4. For each feature, use this output shape:

   ```markdown
   # Feature: <name>
   ## Outcome
   ## Functional requirements
   ## Non-functional requirements
   ## Capacity estimate
   ## Design
   ## Acceptance tests
   ```

   Add an explicit feature boundary or non-goals only when it prevents likely
   scope expansion. State dependencies in the index rather than repeating them
   in every file.
5. Capacity estimates are back-of-the-envelope product limits, **not delivery
   timelines**. For a batch engine, prefer input GiB/records per job,
   partitions, concurrent workers, MB/s or records/s, RAM, temporary disk,
   and active jobs. Use TPS/QPS only for a request-facing control plane. If
   hardware or input shape is unknown, establish a clearly marked provisional
   reference environment; do not describe its figures as measured maxima.
6. Use Mermaid diagrams that answer a distinct design question: a flowchart
   for data/control flow, a sequence diagram for interactions across
   components, and a state diagram only when an entity has meaningful lifecycle
   transitions (for example job, task, or file publication).
7. If asked for an HLD, create `docs/HIGH-LEVEL-DESIGN.md`. Draw only
   deployable units and durable dependencies: client/CLI, service processes,
   worker pools, databases, queues, and storage. Label the deployment boundary
   and exclude internal classes, algorithms, and future components.

## Capacity recipe

State the assumptions first, then calculate a conservative envelope. Example:

```text
Input: 10 GiB; one redistribution: 10 GiB; one retry: 10 GiB;
final output: 10 GiB; overhead: 2 GiB
Peak disk = 42 GiB × 1.20 safety margin = 51 GiB free disk required
```

Mark all figures as targets or operating limits until measured. Require a
benchmark or preflight check for any limit that controls admission.

## Scope guardrails

| Situation | Required response |
| --- | --- |
| Existing PRD says single machine | Keep workers, storage, and recovery local; do not introduce Kubernetes, remote services, or distributed metadata. |
| “Single machine” does not define worker isolation | Ask whether workers are goroutines or child processes, or record one as a clearly marked design assumption. |
| User asks for capacity | Replace engineer-days with inputs, throughput, concurrency, memory, and disk calculations. |
| Feature is a pure API/model | Omit a state diagram unless it has a genuine lifecycle. |
| HLD requested | Show deployable components only; keep implementation internals in feature specs. |
| A capability is absent from the approved scope | List it as a non-goal or future opportunity; do not create a feature spec for it. |

## Common mistakes

- Calling implementation effort an “estimate” when the request asks for
  traffic, throughput, or storage capacity.
- Giving throughput without machine, record-size, worker-count, and I/O
  assumptions.
- Showing worker internals, package names, or algorithms in a high-level
  deployment diagram.
- Adding unapproved features such as checkpoints, streaming, SQL, or a
  multi-node runtime merely because they are common in mature data systems.
- Repeating the entire PRD in every feature instead of giving each feature a
  testable outcome and boundary.
