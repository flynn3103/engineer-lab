/* Mermaid diagrams for the Testing and quality module. Key 'quality:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['quality:1'] = [
  { kind: 'Flow', title: 'Test pyramid: cost rises, count falls', src: `flowchart TD
  E["End-to-end: few journeys<br/>slow, proves the wiring"]
  I["Integration: real database and HTTP<br/>proves data rules and contracts"]
  U["Unit: many small tests<br/>fast, proves logic"]
  E --> I
  I --> U` }
];
SkillData.diagrams['quality:2'] = [
  { kind: 'Sequence', title: 'An integration test with a real database', src: `sequenceDiagram
  participant T as Test
  participant A as API under test
  participant D as PostgreSQL from production migrations
  T->>D: reset to known state
  T->>A: POST save ad
  A->>D: insert saved_ad
  A-->>T: 201
  T->>A: POST save the same ad again
  A->>D: insert saved_ad
  D-->>A: unique violation
  A-->>T: 409
  T->>D: count rows, expect 1` }
];
SkillData.diagrams['quality:3'] = [
  { kind: 'Flow', title: 'Wait for a condition instead of sleeping', src: `flowchart TD
  P["Post ad"] --> Q["Query search for the ad"]
  Q --> F{"Found?"}
  F -- "yes" --> N["Next step of the journey"]
  F -- "no" --> W{"Deadline passed?"}
  W -- "no" --> D["Wait 500 ms"]
  D --> Q
  W -- "yes" --> X["Fail with the last response"]` }
];
SkillData.diagrams['quality:4'] = [
  { kind: 'Flow', title: 'Does this test fail when the code is broken?', src: `flowchart TD
  T["Agent-written test"] --> A{"Has a real assertion<br/>on a result or state?"}
  A -- "no" --> R["Reject: tautological"]
  A -- "yes" --> B["Break the code by hand<br/>flip an operator or boundary"]
  B --> C{"Does a test go red?"}
  C -- "no" --> S["Surviving mutant: add a boundary test"]
  C -- "yes" --> K["Keep the test"]` }
];
SkillData.diagrams['quality:5'] = [
  { kind: 'Flow', title: 'Pipeline stages ordered by cost', src: `flowchart LR
  S1["Static: lint and types"] --> S2["Unit tests and scans"]
  S2 --> S3["Integration and migration check"]
  S3 --> M["Merge"]
  M --> S4["Staging E2E journeys"]
  S4 --> P["Promote to production"]` }
];
