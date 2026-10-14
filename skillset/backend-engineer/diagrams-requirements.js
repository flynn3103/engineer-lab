/* Mermaid diagrams for the Collect the functional spec module. Key 'requirements:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['requirements:1'] = [
  { kind: 'Flow', title: 'From a request to a problem statement', src: `flowchart TD
  R["Request:<br/>add a favorites button"] --> W{"Does the answer name<br/>a person's goal?"}
  W -- "no, a screen or a table" --> Y["Ask why again"]
  Y --> W
  W -- "yes" --> N["Need:<br/>return to chosen ads"]
  N --> P["Problem statement:<br/>actor, situation, pain,<br/>outcome, measure"]
  P --> A["Assumptions and<br/>open questions list"]
  A --> S["Ready for requirements"]` }
];
SkillData.diagrams['requirements:2'] = [
  { kind: 'Flow', title: 'Functional and non-functional requirements', src: `flowchart TD
  F["Functional requirement<br/>what happens"] --> Q["Quality of that behavior"]
  Q --> P["Performance<br/>p95 latency, throughput"]
  Q --> A["Availability<br/>and durability"]
  Q --> C["Consistency<br/>and freshness"]
  Q --> S["Security<br/>and privacy"]
  Q --> K["Capacity, operability, cost"]
  P --> M["Metric, target, conditions,<br/>owner, priority"]
  A --> M
  C --> M
  S --> M
  K --> M` }
];
SkillData.diagrams['requirements:3'] = [
  { kind: 'Sequence', title: 'One criterion read as a test: save an ad twice', src: `sequenceDiagram
  participant T as Test or reviewer
  participant API as Saved ads API
  participant DB as Database
  Note over T,DB: Given a signed-in buyer and an active ad
  T->>API: save ad 42
  API->>DB: insert row for member and ad
  DB-->>API: ok
  API-->>T: 201 and the ad is in the list
  Note over T,DB: When the buyer saves the same ad again
  T->>API: save ad 42
  API->>DB: insert, unique constraint hit
  DB-->>API: duplicate
  API-->>T: 200 and still one entry` }
];
SkillData.diagrams['requirements:4'] = [
  { kind: 'State', title: 'Glossary term with states: the ad lifecycle', src: `stateDiagram-v2
  [*] --> draft
  draft --> pending: seller submits
  pending --> active: moderation passes
  pending --> removed: moderation fails
  active --> sold: seller marks sold
  active --> expired: time runs out
  active --> removed: report upheld
  expired --> active: seller renews
  sold --> [*]
  removed --> [*]` }
];
SkillData.diagrams['requirements:5'] = [
  { kind: 'Flow', title: 'Reviewing an agent-written spec', src: `flowchart TD
  S["Agent spec"] --> A["1 Source:<br/>request, owner or assumption?"]
  A --> B["2 Testability:<br/>can a criterion fail?"]
  B --> C["3 Completeness:<br/>boundary, invalid, conflict, permission"]
  C --> D["4 Consistency:<br/>glossary, requirements, criteria"]
  D --> E{"Findings?"}
  E -- "yes" --> Q["Send back as questions"]
  Q --> S
  E -- "no" --> OK["Approve spec as design input"]` }
];
