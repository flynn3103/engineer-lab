/* Mermaid diagrams for the Async work and messaging module. Key 'async:<lesson number>'. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['async:1'] = [
  { kind: 'Sequence', title: 'Accept, queue, work, report status', src: `sequenceDiagram
  participant S as Seller
  participant A as API
  participant D as Database
  participant Q as Queue
  participant W as Worker
  S->>A: POST /ads with photos
  A->>D: insert ad status processing
  A->>Q: enqueue job with ad_id
  A-->>S: 202 Accepted with status URL
  W->>Q: take job
  W->>D: load ad, resize, moderate
  W->>D: set status active or rejected
  S->>A: GET status
  A-->>S: active` }
];
SkillData.diagrams['async:2'] = [
  { kind: 'Flow', title: 'Failure handling for one message', src: `flowchart TD
  A["Receive message"] --> B{"Already processed?<br/>idempotency key"}
  B -- "yes" --> C["Acknowledge, skip"]
  B -- "no" --> D["Do the work"]
  D --> E{"Result"}
  E -- "success" --> F["Record key and acknowledge"]
  E -- "transient error" --> G["Backoff with jitter, retry"]
  E -- "permanent error" --> H["Dead-letter queue and alert"]
  G --> I{"Attempts left?"}
  I -- "yes" --> A
  I -- "no" --> H` },
  { kind: 'State', title: 'Message life with a visibility timeout', src: `stateDiagram-v2
  [*] --> Visible
  Visible --> InFlight: worker receives
  InFlight --> Deleted: ack before timeout
  InFlight --> Visible: timeout expires or nack
  Visible --> DeadLetter: receive count over max
  Deleted --> [*]` }
];
SkillData.diagrams['async:3'] = [
  { kind: 'Flow', title: 'A keyed topic with two consumer groups', src: `flowchart TD
  P["Producer<br/>key = ad_id"] --> T0["Partition 0"]
  P --> T1["Partition 1"]
  P --> T2["Partition 2"]
  T0 --> S1["Search group<br/>consumer A"]
  T1 --> S2["Search group<br/>consumer B"]
  T2 --> S2
  T0 --> N1["Notify group<br/>consumer C"]
  T1 --> N1
  T2 --> N1` }
];
SkillData.diagrams['async:4'] = [
  { kind: 'Sequence', title: 'Process then commit: a crash causes a repeat, not a loss', src: `sequenceDiagram
  participant K as Broker
  participant C as Consumer
  participant I as Index
  K->>C: records 100 to 109
  C->>I: upsert by ad_id and version
  Note over C: crash before commit
  K->>C: records 100 to 109 again
  C->>I: same upserts, no change
  C->>K: commit offset 110` }
];
SkillData.diagrams['async:5'] = [
  { kind: 'Sequence', title: 'Transactional outbox with a relay', src: `sequenceDiagram
  participant A as Service
  participant D as Database
  participant R as Relay or CDC
  participant B as Broker
  participant C as Consumer
  A->>D: BEGIN
  A->>D: UPDATE ad SET status sold
  A->>D: INSERT outbox row
  A->>D: COMMIT
  R->>D: read unsent rows
  R->>B: publish ad.sold with event id
  R->>D: mark sent
  B->>C: ad.sold
  C->>C: skip if event id already seen` }
];
SkillData.diagrams['async:6'] = [
  { kind: 'Sequence', title: 'Chat across two instances with persistence and resume', src: `sequenceDiagram
  participant B as Buyer on instance 1
  participant I1 as Instance 1
  participant DB as Database
  participant PS as Pub/sub
  participant I4 as Instance 4
  participant S as Seller
  B->>I1: send message
  I1->>DB: save with sequence 119
  I1->>PS: publish to conversation channel
  PS->>I4: message 119
  I4->>S: push message 119
  Note over S: connection drops
  S->>I4: reconnect with last_seen 119
  I4->>DB: messages after 119
  DB-->>S: missed messages` }
];
SkillData.diagrams['async:7'] = [
  { kind: 'Sequence', title: 'Deadline propagated through a call chain', src: `sequenceDiagram
  participant U as User request
  participant G as Page service
  participant A as Ads service
  participant R as Reviews service
  U->>G: GET ad page, budget 400 ms
  par concurrent calls
    G->>A: GetAd with deadline 400 ms
    G->>R: GetReviews with deadline 150 ms
  end
  A-->>G: ad
  R--xG: DEADLINE_EXCEEDED
  G-->>U: page without reviews` }
];
