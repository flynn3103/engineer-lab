/* Mermaid diagrams for the Capstone module. Key 'capstone:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['capstone:1'] = [
  { kind: 'Flow', title: 'From problem to estimates', src: `flowchart TD
  P["Problem statement with numbers"] --> R["Functional and non-functional requirements"]
  R --> E["Assumptions: links per month, ratio, retention, size"]
  E --> L["Load: writes about 4 per s, redirects about 400 per s"]
  E --> S["Storage about 180 GB, key space 3.5 trillion"]
  L --> D["Dominant path: the redirect"]
  S --> K["Hard to reverse: code format and length"]` }
];
SkillData.diagrams['capstone:2'] = [
  { kind: 'Sequence', title: 'Create a link with a unique code and bounded retry', src: `sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as Database
  C->>A: POST /links with target url
  A->>A: validate scheme and domain
  A->>A: random 7 character code
  A->>DB: INSERT short_link
  DB-->>A: unique violation
  A->>A: new random code
  A->>DB: INSERT short_link
  DB-->>A: ok
  A-->>C: 201 with short url` },
  { kind: 'ER', title: 'Short link in the marketplace model', src: `erDiagram
  member ||--o{ short_link : "creates"
  ad ||--o{ short_link : "is shared by"
  short_link ||--o{ link_click : "records"
  short_link {
    text code PK
    text target_url
    bigint member_id FK
    bigint ad_id FK
    timestamptz expires_at
    timestamptz disabled_at
  }` }
];
SkillData.diagrams['capstone:3'] = [
  { kind: 'Flow', title: 'The redirect path', src: `flowchart TD
  R["GET /s/code"] --> L{"Local cache"}
  L -- "hit" --> X["302 redirect"]
  L -- "miss" --> S{"Shared cache"}
  S -- "hit" --> X
  S -- "miss" --> F["Single-flight to database"]
  F --> D{"Row found and active?"}
  D -- "yes" --> W["Fill caches with TTL and jitter"]
  W --> X
  D -- "no" --> N["Negative cache, 404 or 410"]
  X --> E["Click event sent after the response"]` }
];
SkillData.diagrams['capstone:4'] = [
  { kind: 'Flow', title: 'Abuse controls from creation to takedown', src: `flowchart TD
  A["Create request"] --> B["Rate limit and login check"]
  B --> C["Validate http or https target, not own domain"]
  C --> D["Link saved as pending"]
  D --> E["Background reputation check"]
  E -->|"clean"| F["Active"]
  E -->|"harmful"| G["Disabled, 410 on redirect"]
  F --> H["Report received"]
  H --> I["Moderator disables, audit record, cache key deleted"]
  I --> G` }
];
SkillData.diagrams['capstone:5'] = [
  { kind: 'Flow', title: 'Review protocol for the agent-made shortener', src: `flowchart TD
  R["Restate requirements and numbers"] --> Z["Size the risk"]
  Z --> L1["Fit"]
  L1 --> L2["Correctness and data"]
  L2 --> L3["Failure behavior"]
  L3 --> L4["Security"]
  L4 --> L5["Operability"]
  L5 --> Q["Rank findings and send evidence requests"]
  Q --> D{"Decision"}
  D --> A1["Accept"]
  D --> A2["Accept with follow-ups"]
  D --> A3["Reject"]` }
];
