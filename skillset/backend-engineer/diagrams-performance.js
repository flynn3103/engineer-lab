/* Mermaid diagrams for the Performance, caching and concurrency module. Key 'performance:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['performance:1'] = [
  { kind: 'Flow', title: 'Check a performance claim', src: `flowchart TD
  A["Agent: it is faster"] --> B{"SLO stated:<br/>percentile, threshold, load?"}
  B -- "no" --> C["Ask for the SLO"]
  B -- "yes" --> D{"p50, p95, p99<br/>on the same load?"}
  D -- "no" --> E["Ask for a histogram"]
  D -- "yes" --> F{"Open load model,<br/>realistic data?"}
  F -- "no" --> G["Rerun the test"]
  F -- "yes" --> H{"Percentile in the SLO<br/>improved?"}
  H -- "yes" --> I["Accept, record in report"]
  H -- "no" --> J["Reject the claim"]` }
];
SkillData.diagrams['performance:2'] = [
  { kind: 'Flow', title: 'Locate the bottleneck before fixing', src: `flowchart TD
  A["Slow endpoint"] --> B["Baseline p99 under known load"]
  B --> C{"CPU busy<br/>during slow requests?"}
  C -- "yes" --> D["CPU profile, flame graph"]
  C -- "no" --> E["Trace: which span waits?"]
  E --> F{"A database span?"}
  F -- "yes" --> G["EXPLAIN ANALYZE, BUFFERS"]
  F -- "no" --> H["Check pools, locks, remote calls"]
  D --> I["Change one thing, re-measure"]
  G --> I
  H --> I` }
];
SkillData.diagrams['performance:3'] = [
  { kind: 'Sequence', title: 'N+1 queries versus a batched read', src: `sequenceDiagram
  participant H as Handler
  participant D as Database
  Note over H,D: N+1: 1 + 20 + 20 queries
  H->>D: SELECT ads LIMIT 20
  D-->>H: 20 ads
  loop for each ad
    H->>D: SELECT member WHERE id = ?
    H->>D: SELECT first image WHERE ad_id = ?
  end
  Note over H,D: Batched: 3 queries
  H->>D: SELECT ads LIMIT 20
  H->>D: SELECT members WHERE id IN (...)
  H->>D: SELECT images WHERE ad_id IN (...)
  D-->>H: three result sets` }
];
SkillData.diagrams['performance:4'] = [
  { kind: 'Sequence', title: 'Cache-aside read and delete-on-write', src: `sequenceDiagram
  participant C as Client
  participant A as App
  participant R as Cache
  participant D as Database
  C->>A: GET ad 42
  A->>R: get ad:42
  R-->>A: miss
  A->>D: SELECT ad 42
  D-->>A: row
  A->>R: set ad:42 with TTL and jitter
  A-->>C: ad
  C->>A: PUT ad 42 new price
  A->>D: UPDATE ad and commit
  A->>R: delete ad:42
  A-->>C: 200` },
  { kind: 'Flow', title: 'What happens on a miss of a hot key', src: `flowchart TD
  A["Request for hot key"] --> B{"In cache?"}
  B -- "yes" --> C["Return value"]
  B -- "no" --> D{"Another request<br/>already rebuilding?"}
  D -- "yes" --> E["Wait for its result"]
  D -- "no" --> F["Take single-flight lock"]
  F --> G["Read database, fill cache"]
  G --> C
  E --> C` }
];
SkillData.diagrams['performance:5'] = [
  { kind: 'Flow', title: 'Choose a concurrency model', src: `flowchart TD
  A["Step in the request"] --> B{"Mostly waiting<br/>or computing?"}
  B -- "waiting (IO)" --> C["Event loop or threads<br/>bounded by a pool"]
  B -- "computing (CPU)" --> D{"Needs an answer<br/>in the request?"}
  D -- "yes, short" --> E["Worker pool near core count"]
  D -- "no, long" --> F["Background job queue"]
  C --> G["Timeout and cap on every call"]
  E --> G
  F --> G` }
];
SkillData.diagrams['performance:6'] = [
  { kind: 'Sequence', title: 'Reserve an ad: racy check versus atomic update', src: `sequenceDiagram
  participant B1 as Buyer 1
  participant B2 as Buyer 2
  participant D as Database
  Note over B1,D: Racy: read then write
  B1->>D: SELECT reserved_by
  B2->>D: SELECT reserved_by
  D-->>B1: NULL
  D-->>B2: NULL
  B1->>D: UPDATE reserved_by = 1
  B2->>D: UPDATE reserved_by = 2
  Note over B1,D: Both think they won
  Note over B1,D: Atomic: condition inside the UPDATE
  B1->>D: UPDATE ... WHERE reserved_by IS NULL
  D-->>B1: 1 row changed
  B2->>D: UPDATE ... WHERE reserved_by IS NULL
  D-->>B2: 0 rows changed` }
];
