/* Mermaid diagrams for the Reliability and operations module. Key 'reliability:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['reliability:1'] = [
  { kind: 'Flow', title: 'One handler turns typed errors into responses', src: `flowchart TD
  A["Route code throws a typed error"] --> H["Global error handler"]
  H --> C{"Error class"}
  C -- "validation" --> V["422 with code and field"]
  C -- "not found or conflict" --> N["404 or 409 with code"]
  C -- "dependency failure" --> D["503 and Retry-After"]
  C -- "bug" --> B["500 with generic body"]
  H --> L["Log with request id<br/>and full cause"]` }
];
SkillData.diagrams['reliability:2'] = [
  { kind: 'Flow', title: 'Startup validation gates the rollout', src: `flowchart TD
  S["Process starts"] --> R["Read environment"]
  R --> V{"All settings valid?"}
  V -- "no" --> X["Print every problem<br/>exit with non-zero code"]
  X --> K["Rollout stops, old instances keep serving"]
  V -- "yes" --> T["Build typed config object"]
  T --> L["Listen and report ready"]` }
];
SkillData.diagrams['reliability:3'] = [
  { kind: 'Sequence', title: 'Graceful shutdown during a rolling deploy', src: `sequenceDiagram
  participant P as Platform
  participant S as Service instance
  participant LB as Load balancer
  participant C as In-flight request
  P->>S: SIGTERM
  S->>S: readiness returns 503
  LB->>S: readiness probe
  S-->>LB: 503, stop routing here
  S->>S: stop accepting connections
  C-->>S: request still running
  S-->>C: response sent
  S->>S: close pools and flush logs
  S-->>P: exit 0 before the grace period ends` }
];
SkillData.diagrams['reliability:4'] = [
  { kind: 'Flow', title: 'From an alert to a cause with three signals', src: `flowchart TD
  A["Alert: latency SLI burning"] --> M["Metrics: p99 high, pool saturated"]
  M --> T["Trace of a slow request"]
  T --> S["Span: moderation call 3.9 s"]
  S --> L["Logs filtered by the request id"]
  L --> F["Cause found: slow dependency"]` }
];
SkillData.diagrams['reliability:5'] = [
  { kind: 'Flow', title: 'Which alerts page a human', src: `flowchart TD
  E["Signal or metric"] --> Q1{"Users affected<br/>or budget burning?"}
  Q1 -- "no" --> D["Dashboard only"]
  Q1 -- "yes" --> Q2{"Fast burn?"}
  Q2 -- "yes" --> P["Page with runbook link"]
  Q2 -- "no" --> K["Ticket for working hours"]` }
];
