/* Mermaid diagrams for the API and request lifecycle module. Key 'api:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['api:1'] = [
  { kind: 'Sequence', title: 'Conditional GET with an ETag', src: `sequenceDiagram
  participant B as Browser
  participant C as Cache or API
  B->>C: GET /ads/42
  C-->>B: 200 with ETag v7 and max-age 30
  Note over B: within 30 s the browser reuses it
  B->>C: GET /ads/42 with If-None-Match v7
  C-->>B: 304 Not Modified, no body
  B->>C: GET /ads/42 with If-None-Match v7
  C-->>B: 200 with new body and ETag v8` }
];
SkillData.diagrams['api:2'] = [
  { kind: 'Flow', title: 'One request, stage by stage', src: `flowchart TD
  A["Connection and parse"] --> B["Request id and log"]
  B --> C["Rate limit"]
  C --> D["Authentication"]
  D --> E["Router matches method and path"]
  E --> F["Authorization and validation"]
  F --> G["Handler calls service"]
  G --> H["Serialize response"]
  C -. "429" .-> X["Error handler"]
  D -. "401" .-> X
  F -. "403 or 422" .-> X
  G -. "exception" .-> X
  X --> H` }
];
SkillData.diagrams['api:3'] = [
  { kind: 'Flow', title: 'Cursor pagination loop', src: `flowchart TD
  A["Client asks for first page, limit 20"] --> B["Server runs query ordered by created_at and ad_id, limit 20 plus 1"]
  B --> C{"More than 20 rows?"}
  C -- "yes" --> D["Return 20 items and next_cursor from the last row"]
  C -- "no" --> E["Return items and no next_cursor"]
  D --> F["Client sends cursor"]
  F --> G["Server asks for rows after the cursor key"]
  G --> B` }
];
SkillData.diagrams['api:4'] = [
  { kind: 'Flow', title: 'The boundary gate', src: `flowchart LR
  A["Raw bytes"] --> B["Parse and size limit"]
  B --> C["Schema validation"]
  C --> D["Request DTO"]
  D --> E["Service sets owner and status"]
  E --> F["Stored record"]
  F --> G["Response DTO with allowed fields only"]
  B -. "400" .-> X["Problem Details"]
  C -. "422" .-> X` }
];
SkillData.diagrams['api:5'] = [
  { kind: 'Flow', title: 'Layers and the direction of dependency', src: `flowchart TD
  M["Middleware: id, auth, rate limit, logs"] --> C["Controller: HTTP in, HTTP out"]
  C --> S["Service: rules and transactions"]
  S --> R["Repository: queries"]
  R --> D[("Database")]
  S --> X["External clients: moderation, mail"]` }
];
SkillData.diagrams['api:6'] = [
  { kind: 'Flow', title: 'Contract first, checked on every change', src: `flowchart TD
  A["Write OpenAPI document"] --> B["Review the contract"]
  B --> C["Implement"]
  C --> D["Lint the document"]
  D --> E["Diff against last release"]
  E --> F{"Breaking change?"}
  F -- "yes" --> G["Deprecation plan and approval"]
  F -- "no" --> H["Contract tests on real responses"]
  G --> H
  H --> I["Publish docs and clients"]` }
];
