/* Mermaid diagrams for the Mindset and review module. Key 'mindset:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['mindset:1'] = [
  { kind: 'Flow', title: 'Judge a design by its problem statement', src: `flowchart TD
  A["Agent proposes a design"] --> B{"Is there a problem<br/>statement with numbers?"}
  B -- "no" --> C["Ask for it, pause the review"]
  C --> B
  B -- "yes" --> D{"Is the failure point<br/>of the naive design stated?"}
  D -- "no" --> E["Measure where it fails"]
  E --> D
  D -- "yes" --> F["Trace each component<br/>to the principle"]
  F --> G{"Any component<br/>without a reason?"}
  G -- "yes" --> H["Remove it or name its goal"]
  G -- "no" --> I["Go on to the trade-off review"]` }
];
SkillData.diagrams['mindset:2'] = [
  { kind: 'Flow', title: 'From options to a recorded decision', src: `flowchart LR
  O["Two or more<br/>real options"] --> T["Gain and cost<br/>of each, in our numbers"]
  T --> R["Reversibility and<br/>blast radius"]
  R --> D["Decision record:<br/>context, decision,<br/>status, consequences"]
  D --> V["Revisit trigger"]
  R -. "hard to undo" .-> H["Human review"]
  H --> D` }
];
SkillData.diagrams['mindset:3'] = [
  { kind: 'Sequence', title: 'Slow dependency: no timeout versus a bounded call', src: `sequenceDiagram
  participant U as User
  participant A as Post ad service
  participant M as Moderation
  Note over A,M: Before: no timeout, instant retries
  U->>A: post ad
  A->>M: check
  M--xA: slow, no answer in 20 s
  A->>M: retry 1
  A->>M: retry 2
  Note over A: workers and connections run out
  Note over A,M: After: 500 ms timeout, one jittered retry, breaker
  U->>A: post ad
  A->>M: check (timeout 500 ms)
  M--xA: no answer
  A->>M: one retry after backoff
  M--xA: no answer
  A->>U: saved as pending review` }
];
SkillData.diagrams['mindset:4'] = [
  { kind: 'Flow', title: 'Strongest enforcement first, then ask for evidence', src: `flowchart TD
  I["Invariant in plain words"] --> E{"Where is it enforced?"}
  E --> C1["Database constraint<br/>strongest"]
  E --> C2["Type or boundary validation"]
  E --> C3["Test"]
  E --> C4["Convention in a document<br/>weakest"]
  C4 --> W["Worry: ask for a stronger form"]
  C1 --> V["Claim becomes a question:<br/>show the evidence"]
  C2 --> V
  C3 --> V
  V --> P["Percentiles p95 p99, plans,<br/>a test that could fail"]` }
];
SkillData.diagrams['mindset:5'] = [
  { kind: 'Flow', title: 'The five review lenses', src: `flowchart TD
  R["Restate the<br/>requirement"] --> F["1 Fit"]
  F --> C["2 Correctness<br/>and data"]
  C --> L["3 Failure<br/>behavior"]
  L --> S["4 Security"]
  S --> O["5 Operability"]
  O --> X["Scan red flags"]
  X --> Q["Ask for evidence"]
  Q --> D{"All lenses answered<br/>with evidence?"}
  D -- "no" --> R
  D -- "yes" --> A["Approve with the review record"]` }
];
