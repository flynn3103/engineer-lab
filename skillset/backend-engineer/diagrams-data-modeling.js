/* Mermaid diagrams for the Data Modeling module. Key '<moduleId>:<lesson number>'. Labels avoid semicolons and hash signs. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.diagrams['data-modeling:1'] = [
  { kind: 'Flow', title: 'Three levels, each adds decisions', src: `flowchart LR
  R["Requirement<br/>sentences"] --> C["Conceptual<br/>things and links"]
  C --> L["Logical<br/>attributes, keys,<br/>references"]
  L --> P["Physical<br/>types, indexes,<br/>partitions"]
  C -. "asks: is this what we mean?" .-> Q1["Product owner"]
  L -. "asks: is it correct?" .-> Q2["Any engineer"]
  P -. "asks: is it fast and safe?" .-> Q3["Database and on-call"]` },
  { kind: 'ER', title: 'Conceptual model of the marketplace', src: `erDiagram
  MEMBER ||--o{ AD : posts
  CATEGORY ||--o{ AD : contains
  AD ||--o{ CONVERSATION : "is discussed in"
  CONVERSATION ||--o{ MESSAGE : holds` }
];
SkillData.diagrams['data-modeling:2'] = [
  { kind: 'ER', title: 'Entities, cardinality and optionality', src: `erDiagram
  MEMBER ||--o{ AD : posts
  CATEGORY ||--o{ AD : contains
  AD ||--o{ AD_IMAGE : "shown by"
  MEMBER ||--o{ SAVED_AD : saves
  AD ||--o{ SAVED_AD : "is saved as"
  AD ||--o{ CONVERSATION : "is discussed in"
  MEMBER ||--o{ CONVERSATION : "starts as buyer"
  CONVERSATION ||--o{ MESSAGE : holds
  MEMBER ||--o{ MESSAGE : sends` }
];
SkillData.diagrams['data-modeling:3'] = [
  { kind: 'Flow', title: 'Choosing a primary key', src: `flowchart TD
  A["Candidate keys listed"] --> B{"Can the value<br/>change or be absent?"}
  B -- "yes" --> S["Use a generated surrogate key"]
  B -- "no" --> C{"Is the entity weak<br/>or an association?"}
  C -- "yes" --> K["Use a composite key<br/>from its owners"]
  C -- "no" --> N["Natural key is acceptable,<br/>still add a surrogate if unsure"]
  S --> U["Keep other candidates<br/>as unique constraints"]
  K --> U
  N --> U
  U --> F["Declare every foreign key<br/>and its delete rule"]` },
  { kind: 'ER', title: 'Keys on four tables', src: `erDiagram
  MEMBER ||--o{ AD : posts
  AD ||--o{ AD_IMAGE : "shown by"
  MEMBER ||--o{ SAVED_AD : saves
  AD ||--o{ SAVED_AD : "is saved as"
  MEMBER {
    bigint member_id PK
    text email UK
    text phone UK
  }
  AD {
    bigint ad_id PK
    bigint member_id FK
    int category_id FK
  }
  AD_IMAGE {
    bigint ad_id PK
    int position PK
    text url
  }
  SAVED_AD {
    bigint member_id PK
    bigint ad_id PK
    timestamptz saved_at
  }` }
];
SkillData.diagrams['data-modeling:4'] = [
  { kind: 'Flow', title: 'From one wide row to third normal form', src: `flowchart LR
  U["ad(ad_id, title, price,<br/>seller_name, seller_phone,<br/>category_name, image_urls)"] --> N1["1NF<br/>image_urls to its own table"]
  N1 --> N2["2NF<br/>check composite keys,<br/>none here"]
  N2 --> N3["3NF<br/>seller facts to member,<br/>category name to category"]
  N3 --> D["Deliberate copies only,<br/>each with one owner"]` },
  { kind: 'ER', title: 'After normalizing', src: `erDiagram
  MEMBER ||--o{ AD : posts
  CATEGORY ||--o{ AD : contains
  AD ||--o{ AD_IMAGE : "shown by"
  MEMBER {
    bigint member_id PK
    text name
    text phone
  }
  CATEGORY {
    int category_id PK
    text name
  }
  AD {
    bigint ad_id PK
    bigint member_id FK
    int category_id FK
    text title
    bigint price_vnd
    int reply_count "deliberate copy"
  }` }
];
SkillData.diagrams['data-modeling:5'] = [
  { kind: 'Flow', title: 'Patterns decide the structure and the store', src: `flowchart LR
  P["Access pattern list<br/>rate, target, freshness"] --> R{"Needs joins, filters,<br/>constraints?"}
  R -- "yes" --> PG["Relational table<br/>plus an index per pattern"]
  R -- "no" --> W{"Append heavy,<br/>read by one key range?"}
  W -- "yes" --> WC["Wide-column table<br/>per query"]
  W -- "no" --> KV["Key-value<br/>key and expiry"]
  PG --> SOR["One system of record"]
  WC --> SOR
  KV --> SOR
  SOR --> V["Other stores are<br/>rebuildable views"]` }
];
SkillData.diagrams['data-modeling:6'] = [
  { kind: 'ER', title: 'Star schema for leads', src: `erDiagram
  FACT_LEAD }o--|| DIM_DATE : "happened on"
  FACT_LEAD }o--|| DIM_AD : "about"
  FACT_LEAD }o--|| DIM_CATEGORY : "in"
  FACT_LEAD }o--|| DIM_REGION : "from"
  FACT_LEAD {
    bigint lead_id PK
    int date_key FK
    bigint ad_key FK
    int category_key FK
    int region_key FK
    int lead_count "always 1"
    int first_response_seconds
  }
  DIM_AD {
    bigint ad_key PK
    bigint ad_id "business id"
    int category_id
    date valid_from
    date valid_to
    boolean is_current
  }` }
];
SkillData.diagrams['data-modeling:7'] = [
  { kind: 'Sequence', title: 'Expand, migrate, contract for ad.price', src: `sequenceDiagram
  participant V1 as App v1 (old)
  participant DB as Database
  participant V2 as App v2 (dual write)
  participant J as Backfill job
  participant V3 as App v3 (new only)
  Note over DB: Expand
  DB->>DB: add price_amount and currency as nullable
  V1->>DB: still writes price text, still works
  Note over V2,J: Migrate
  V2->>DB: writes text and new columns
  J->>DB: backfill in small batches, log failures
  V2->>DB: reads move to new columns behind a flag
  Note over V3,DB: Contract
  V3->>DB: stops writing the old column
  DB->>DB: later release drops price text` }
];
