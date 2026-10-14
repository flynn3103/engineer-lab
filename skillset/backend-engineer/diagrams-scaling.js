/* Mermaid diagrams for the Scaling out module. Key 'scaling:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['scaling:1'] = [
  { kind: 'Flow', title: 'Stateless tier behind a load balancer, with the downstream limit', src: `flowchart TD
  C["Clients"] --> LB["Load balancer<br/>least connections<br/>health checks, draining"]
  LB --> S1["App server 1"]
  LB --> S2["App server 2"]
  LB --> S3["App server N+1"]
  S1 --> P["Connection pooler"]
  S2 --> P
  S3 --> P
  P --> DB[("Database<br/>connection limit")]
  S1 --> SS[("Session store<br/>object storage")]` }
];
SkillData.diagrams['scaling:2'] = [
  { kind: 'Sequence', title: 'Read-your-writes anomaly and the post-write window fix', src: `sequenceDiagram
  participant M as Member
  participant A as App
  participant P as Primary
  participant R as Replica
  M->>A: post ad
  A->>P: insert ad
  P-->>A: committed
  P--)R: ship change (lag 400 ms)
  A-->>M: redirect to my ads
  M->>A: open my ads
  Note over A: member wrote 1 s ago, strict read
  A->>P: read my ads from primary
  P-->>A: includes the new ad
  A-->>M: list is correct
  M->>A: browse public ads
  A->>R: tolerant read from replica
  R-->>A: slightly stale is allowed` }
];
SkillData.diagrams['scaling:3'] = [
  { kind: 'Flow', title: 'Routing a message write to a shard by hashed conversation id', src: `flowchart TD
  W["Send message<br/>conversation 7f3a"] --> H["Hash of conversation id<br/>maps to logical partition 91"]
  H --> M["Partition map:<br/>91 lives on node B"]
  M --> N["Node B writes the message"]
  N --> I["Update member_conversation<br/>index on the member shard"]
  Q["List my conversations"] --> J["Hash of member id<br/>one shard"]
  J --> I
  Z["Query without a shard key"] --> X["Scatter to all shards,<br/>gather and merge"]` }
];
SkillData.diagrams['scaling:4'] = [
  { kind: 'Sequence', title: 'CDN hit and miss for a versioned image', src: `sequenceDiagram
  participant B as Browser
  participant E as CDN edge
  participant O as Object storage origin
  B->>E: GET image with hashed name
  E->>O: miss, fetch
  O-->>E: image, Cache-Control public max-age one year immutable
  E-->>B: image, stored at the edge
  B->>E: GET same image later
  E-->>B: hit, no origin request
  Note over B,O: Photo replaced means a new hashed URL, no purge` }
];
SkillData.diagrams['scaling:5'] = [
  { kind: 'Flow', title: 'Measure, find the bottleneck, take the cheapest step', src: `flowchart TD
  P["Problem with numbers:<br/>p99 against target at peak"] --> U["Check each resource:<br/>utilization, saturation, errors"]
  U --> B{"Which resource<br/>is saturated?"}
  B --> Q["Slow query or index"]
  B --> A["App CPU"]
  B --> R["Database reads"]
  B --> W["Database writes or size"]
  Q --> F["Fix query, re-measure"]
  A --> G["Add servers, re-measure"]
  R --> H["Replicas, cache, CDN"]
  W --> S["Sharding, last resort"]` }
];
