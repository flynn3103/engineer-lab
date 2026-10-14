/* Mermaid diagrams for the Identity and security module. Key 'security:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['security:1'] = [
  { kind: 'Flow', title: 'Trust boundaries of the marketplace', src: `flowchart LR
  U["Browser or app: untrusted"] -->|"boundary 1"| A["API"]
  A -->|"boundary 2"| D[("Database")]
  A -->|"boundary 3"| M["Moderation service"]
  A -->|"boundary 4"| S["Image storage"]
  F["Uploaded file: untrusted"] --> A` }
];
SkillData.diagrams['security:2'] = [
  { kind: 'Sequence', title: 'Login, session and logout', src: `sequenceDiagram
  participant B as Browser
  participant A as API
  participant S as Session store
  B->>A: POST /login with credentials
  A->>A: verify password hash, generic error on failure
  A->>S: create new random session id with expiry
  A-->>B: Set-Cookie sid, HttpOnly, Secure, SameSite
  B->>A: request with cookie sid
  A->>S: look up sid
  S-->>A: member 42
  B->>A: POST /logout
  A->>S: delete sid
  A-->>B: clear cookie` }
];
SkillData.diagrams['security:3'] = [
  { kind: 'Flow', title: 'Short access token with a revocable refresh token', src: `flowchart TD
  A["Login"] --> B["Access token: 10 minutes"]
  A --> C["Refresh token: stored server-side, rotated"]
  B --> D["API verifies signature, exp, iss, aud"]
  D -->|"expired"| E["Client sends refresh token"]
  E --> F{"Refresh token still valid?"}
  F -- "yes" --> G["New access token and new refresh token"]
  F -- "revoked" --> H["Login again"]
  G --> B` }
];
SkillData.diagrams['security:4'] = [
  { kind: 'Sequence', title: 'Scoped query stops object-level access', src: `sequenceDiagram
  participant A as Member A
  participant B as Member B
  participant API as API
  participant DB as Database
  A->>API: GET /conversations/9001/messages
  API->>DB: messages where conversation 9001 and A is a participant
  DB-->>API: rows
  API-->>A: 200
  B->>API: GET /conversations/9001/messages
  API->>DB: messages where conversation 9001 and B is a participant
  DB-->>API: no rows
  API-->>B: 404` }
];
SkillData.diagrams['security:5'] = [
  { kind: 'Flow', title: 'Where data meets code, and the defense', src: `flowchart TD
  I["User input"] --> Q["Query text"]
  I --> H["HTML page"]
  I --> U["URL the server fetches"]
  I --> C["Cookie-authenticated write"]
  Q --> Q2["Parameterized query and allow-list"]
  H --> H2["Output encoding and CSP"]
  U --> U2["Host allow-list, block private ranges"]
  C --> C2["SameSite, CSRF token, Origin check"]` }
];
SkillData.diagrams['security:6'] = [
  { kind: 'State', title: 'Token bucket for one member', src: `stateDiagram-v2
  [*] --> Full
  Full --> Partial: request spends a token
  Partial --> Partial: request spends a token
  Partial --> Full: refill over time
  Partial --> Empty: last token spent
  Empty --> Partial: one token refilled
  Empty --> Empty: request gets 429 with Retry-After` }
];
SkillData.diagrams['security:7'] = [
  { kind: 'Flow', title: 'Configuration review loop', src: `flowchart TD
  A["Deploy to staging"] --> B["Fetch headers and force an error"]
  B --> C["Check roles, buckets, network"]
  C --> D["Diff routes against the contract"]
  D --> E{"Any finding?"}
  E -- "yes" --> F["Fix, then repeat"]
  F --> A
  E -- "no" --> G["Record evidence and owner"]` }
];
