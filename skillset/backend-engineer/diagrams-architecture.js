/* Mermaid diagrams for the Architecture and system design module. Key 'architecture:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['architecture:1'] = [
  { kind: 'Flow', title: 'From inputs to design decisions', src: `flowchart TD
  I["Inputs, labelled:<br/>members, actions, record size"] --> R["Rates per day<br/>then per second"]
  R --> P["Apply peak factor"]
  P --> RW["Reads and writes<br/>separately"]
  I --> S["Storage: rows, indexes,<br/>images, replicas"]
  RW --> L["Little's law:<br/>requests in flight"]
  L --> D["Which design decision<br/>does each number drive?"]
  S --> D` }
];
SkillData.diagrams['architecture:2'] = [
  { kind: 'Flow', title: 'Marketplace high-level design grown from the simplest start', src: `flowchart TD
  C["Client"] --> CDN["CDN for images"]
  C --> LB["Load balancer"]
  LB --> APP["Stateless app servers"]
  APP --> DB[("PostgreSQL<br/>source of truth")]
  APP --> OBJ[("Object storage<br/>image bytes")]
  CDN --> OBJ
  APP --> Q["Queue: change events"]
  Q --> IDX[("Search index<br/>derived, rebuildable")]
  APP --> IDX` }
];
SkillData.diagrams['architecture:3'] = [
  { kind: 'Flow', title: 'Choosing a deployment shape', src: `flowchart TD
  P{"Is there a measured problem<br/>a split would solve?"} -- "no" --> M["Modular monolith"]
  P -- "yes" --> K{"Which kind?"}
  K --> A["Independent deploys<br/>for several teams"]
  K --> B["One workload scales<br/>or fails differently"]
  K --> C["Spiky, short,<br/>event-driven jobs"]
  A --> S["Extract a service<br/>behind a module boundary"]
  B --> S
  C --> F["Serverless function<br/>with pooled connections"]
  S --> T["Record extraction trigger"]
  F --> T` }
];
SkillData.diagrams['architecture:4'] = [
  { kind: 'Sequence', title: 'Post an ad: stateless request, queue and idempotent worker', src: `sequenceDiagram
  participant U as Member
  participant A as App server
  participant D as PostgreSQL
  participant Q as Queue
  participant W as Resize worker
  participant O as Object storage
  U->>A: post ad with photos
  A->>O: store original images
  A->>D: save ad as pending and write outbox row, one transaction
  A-->>U: 202 processing
  D->>Q: relay publishes resize job
  Q->>W: deliver job (may repeat)
  W->>O: write resized variants to same keys
  W->>D: mark images ready
  Note over Q,W: retry limit, then dead-letter queue and alarm` }
];
SkillData.diagrams['architecture:5'] = [
  { kind: 'Flow', title: 'Documents that make a design reviewable', src: `flowchart TD
  REQ["Requirements<br/>and estimates"] --> ADR["Decision records<br/>options, trigger"]
  REQ --> DIA["Diagrams: context,<br/>container, sequence"]
  ADR --> DOC["Design document"]
  DIA --> DOC
  DOC --> RISK["Risks, assumptions,<br/>invented numbers"]
  RISK --> REV{"Reviewer can trace<br/>each requirement to a component?"}
  REV -- "no" --> REQ
  REV -- "yes" --> OK["Approve"]` }
];
