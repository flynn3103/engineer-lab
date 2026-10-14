/* Mermaid diagrams for the Delivery module. Key 'delivery:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['delivery:1'] = [
  { kind: 'Flow', title: 'Multi-stage image build', src: `flowchart TD
  L["Lock file and source"] --> B["Build stage<br/>compilers and dev tools"]
  B --> O["Built output only"]
  O --> F["Final stage<br/>small runtime base, non-root user"]
  F --> R["Registry: image tagged with the commit"]
  I[".dockerignore keeps .env and .git out"] -.-> B` }
];
SkillData.diagrams['delivery:2'] = [
  { kind: 'Flow', title: 'Kubernetes objects around the ad service', src: `flowchart TD
  IN["Ingress or gateway"] --> SV["Service<br/>stable name and port"]
  SV --> P1["Pod 1"]
  SV --> P2["Pod 2"]
  SV --> P3["Pod 3"]
  D["Deployment<br/>replicas and rolling update"] --> P1
  D --> P2
  D --> P3
  CM["ConfigMap and Secret"] -.-> P1` }
];
SkillData.diagrams['delivery:3'] = [
  { kind: 'Flow', title: 'Build once, promote the same image', src: `flowchart TD
  PR["Pull request: gates"] --> M["Merge to main"]
  M --> B["Build image once, tag with commit"]
  B --> S["Staging deploy, smoke test, journeys"]
  S --> P["Production deploy, same image"]
  P --> V{"Post-deploy checks pass?"}
  V -- "yes" --> D["Done, version recorded"]
  V -- "no" --> R["Automatic rollback"]` }
];
SkillData.diagrams['delivery:4'] = [
  { kind: 'Sequence', title: 'Safe release in three steps with expand and contract', src: `sequenceDiagram
  participant Dev as Team
  participant DB as Database
  participant App as Service versions
  Dev->>DB: Release 1: add nullable columns
  Dev->>App: deploy code that writes old and new
  Dev->>DB: backfill in batches
  Dev->>App: Release 2: read new columns behind a flag, canary
  App-->>Dev: error and latency signals vs baseline
  Note over Dev,App: Abort or flip the flag off if signals breach
  Dev->>DB: Release 3 weeks later: drop the old column` }
];
SkillData.diagrams['delivery:5'] = [
  { kind: 'Flow', title: 'Secrets reach only the process that needs them', src: `flowchart TD
  SM["Secret manager<br/>per environment and service"] --> CI["Deploy job with scoped credential"]
  CI --> POD["Running service at start"]
  POD --> V["Startup validation: present, never logged"]
  SM -. "rotate and revoke" .-> SM
  REPO["Repository and image"] -. "never contain secrets" .-> SM` }
];
