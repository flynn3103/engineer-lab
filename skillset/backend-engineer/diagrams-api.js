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
SkillData.diagrams['api:7'] = [
  { kind: 'Flow', title: 'Changing a protobuf message: safe or breaking', src: `flowchart TD
  A["Proposed schema change"] --> B{"What kind of change?"}
  B -- "add a field with a new number" --> S1["Safe: old readers ignore it"]
  B -- "add an enum value" --> S2["Safe, but callers must handle unknown values"]
  B -- "remove a field" --> R["Stop using it, then reserve its number and name"]
  B -- "rename a field" --> W["Wire safe, breaks generated code and JSON"]
  B -- "reuse a number or change a type" --> X["Breaking: new field and new number instead"]
  R --> L["Lint and breaking-change check in CI"]
  S1 --> L
  S2 --> L
  W --> L
  X --> L` }
];
SkillData.diagrams['api:8'] = [
  { kind: 'Flow', title: 'Which protocol for which caller', src: `flowchart TD
  C["A caller of the Ad service"] --> Q{"Who is the caller?"}
  Q -- "internal service" --> G["gRPC with generated clients"]
  Q -- "browser or mobile app" --> E["REST and JSON at the edge, or gRPC-Web through a proxy"]
  Q -- "partner or public" --> O["REST and JSON with an OpenAPI contract"]
  E --> G
  O --> G
  G --> OP["Deadline, retry rules, versioned package, health service"]` },
  { kind: 'Sequence', title: 'A unary call with a deadline and an error status', src: `sequenceDiagram
  participant S as Search service
  participant A as Ad service
  S->>A: GetAd(ad_id) with a 200 ms deadline
  A-->>S: NOT_FOUND with details
  Note over S: Do not retry, the ad does not exist
  S->>A: GetAd(ad_id) with a 200 ms deadline
  A--xS: no answer before the deadline
  Note over S: DEADLINE_EXCEEDED, retry once if idempotent` }
];
