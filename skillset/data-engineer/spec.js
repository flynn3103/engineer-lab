/* Curriculum layout for the Data engineer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "data-engineer",
  "name": "Data Engineer",
  "role": "Data engineer",
  "root": "../../",
  "plugin": {
    "name": "data-engineer",
    "agent": "data-engineer"
  },
  "related": []
};
SkillData.spec = {
  "title": "Data engineer: build data people can trust, and review what an agent builds",
  "navTitle": "Data engineer",
  "lead": "Learn to move, model, test and operate data: ingestion, batch and streaming pipelines, warehouse modeling, quality and governance, and how to review pipeline code and SQL an agent wrote.",
  "overview": [
    "<b>What the role does.</b> A data engineer builds the systems that collect data from products and sources, shape it into reliable tables and streams, and keep it fresh, correct, secure and affordable for everyone downstream.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace's event and database data, practice and a checklist, and ends in an artifact such as a pipeline design or a data contract that the agent produces and you review."
  ],
  "audience": [
    "You build or own data pipelines and want a method that holds up in production.",
    "You will use the <b>data-engineer</b> agent and must judge pipelines and SQL with evidence.",
    "You review data changes where a silent error spreads to every report."
  ],
  "outcomes": [
    "Design idempotent, backfillable pipelines.",
    "Model data in layers with a clear grain.",
    "Define and test data contracts and quality rules.",
    "Review agent-made pipelines for correctness, cost, and blast radius."
  ],
  "prerequisites": [
    "You can read and write SQL and basic Python. The course points to the Kafka and Spark courses on this site."
  ],
  "mindset": [
    [
      "Data is a product",
      "Tables have users, owners, contracts and a quality bar.",
      "Who uses this table, and what is promised to them?"
    ],
    [
      "Idempotent by design",
      "A rerun must not change the result or duplicate rows.",
      "What happens if this job runs twice, or half runs?"
    ],
    [
      "Grain first",
      "Most wrong numbers come from a table whose row meaning is unclear.",
      "What does one row mean, and is it unique?"
    ],
    [
      "Trust but verify",
      "Sources lie, change and arrive late. Check them at the border.",
      "Where do we test this input, and what do we do when it fails?"
    ],
    [
      "Cost is a requirement",
      "Scanning and storing data costs real money.",
      "What does this query or job cost per run, and per month?"
    ],
    [
      "Lineage and ownership",
      "When a number is wrong, you must trace it to its source fast.",
      "Where does this column come from, and who owns each step?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is the ads, messages and tracking events, turned into trustworthy tables for leads, replies and moderation."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A change review record: grain, idempotency, cost, blast radius.",
      "Attaches grain, cost and a rerun plan to every pipeline change."
    ],
    [
      "02 to 04 Foundations, modeling, ingestion",
      "A source inventory, a layered model and an ingestion design.",
      "Drafts them and asks for the grain and the schema-change rule."
    ],
    [
      "05 to 07 Batch, SQL, streaming",
      "DAGs, incremental SQL models and a streaming job design.",
      "Builds them with backfill and late-data handling, and shows the cost."
    ],
    [
      "08 to 12 Quality, operations, governance, serving, capstone",
      "Data contracts, tests, runbooks, access rules and serving tables.",
      "Runs the tests, reports freshness and flags PII and access risks."
    ]
  ],
  "verify": [
    "<b>Layout only.</b> This page is the curriculum layout. Every module is planned: lesson titles and artifacts are listed, and the lessons are written later.",
    "<b>Basis.</b> The module list follows the usual practice of the role and is meant to be checked against sources as each module is written. Nothing here has been verified against a cited source yet.",
    "<b>Scenario.</b> The classifieds marketplace is invented. Any number used later will be labelled an example.",
    "<b>Not yet verified.</b> The plugin and its agent do not exist yet, so the plugin gate describes intended behavior."
  ]
};
SkillData.modules = [
  {
    "id": "mindset",
    "tag": "MINDSET",
    "name": "Mindset and review method",
    "status": "planned",
    "summary": "The habits and a review protocol for data pipelines and SQL changes.",
    "outline": [
      "Data is a product",
      "Idempotent by design",
      "Grain first",
      "Cost and blast radius",
      "Reviewing an agent's pipeline and SQL"
    ],
    "artifact": "A review record for one data change"
  },
  {
    "id": "foundations",
    "tag": "FOUNDATIONS",
    "name": "Data foundations",
    "status": "planned",
    "summary": "The storage, formats and processing styles every pipeline sits on.",
    "outline": [
      "OLTP and OLAP",
      "File formats: CSV, JSON, Avro, Parquet",
      "Warehouse, lake and lakehouse",
      "Batch and streaming",
      "Partitioning and clustering"
    ],
    "artifact": "A source and storage inventory"
  },
  {
    "id": "modeling",
    "tag": "MODELING",
    "name": "Modeling for analytics",
    "status": "planned",
    "summary": "Shape raw data into layers people can use.",
    "outline": [
      "Raw, staging and mart layers",
      "Dimensional modeling and grain",
      "Slowly changing dimensions",
      "Naming and conventions",
      "Documenting a model"
    ],
    "artifact": "A layered model with grain per table"
  },
  {
    "id": "ingestion",
    "tag": "INGESTION",
    "name": "Ingestion",
    "status": "planned",
    "summary": "Bring data in safely from databases, events and APIs.",
    "outline": [
      "Batch extracts",
      "Change data capture",
      "Event tracking and schemas",
      "APIs and rate limits",
      "Schema evolution"
    ],
    "artifact": "An ingestion design with schema-change rules"
  },
  {
    "id": "batch",
    "tag": "BATCH",
    "name": "Batch pipelines and orchestration",
    "status": "planned",
    "summary": "Schedule and run pipelines that can be rerun.",
    "outline": [
      "DAGs and dependencies",
      "Idempotent loads and merges",
      "Backfills",
      "Retries, timeouts and sensors",
      "Orchestrator operations"
    ],
    "artifact": "A DAG design with a backfill plan"
  },
  {
    "id": "sql",
    "tag": "SQL",
    "name": "SQL transformations and warehouses",
    "status": "planned",
    "summary": "Write transformations that are correct, incremental and cheap.",
    "outline": [
      "Joins, windows and double counting",
      "Incremental models",
      "Partition pruning and cost",
      "Testing SQL",
      "Reviewing an agent's SQL"
    ],
    "artifact": "Transformation SQL with tests and a cost estimate"
  },
  {
    "id": "streaming",
    "tag": "STREAMING",
    "name": "Streaming",
    "status": "planned",
    "summary": "Process events as they arrive.",
    "outline": [
      "Logs, topics and partitions",
      "Delivery semantics",
      "Windows and late data",
      "Stream and table joins",
      "Streaming sinks and replays"
    ],
    "artifact": "A streaming job design with late-data rules"
  },
  {
    "id": "quality",
    "tag": "QUALITY",
    "name": "Data quality and contracts",
    "status": "planned",
    "summary": "Define what good data is and test for it.",
    "outline": [
      "Data contracts",
      "Tests: freshness, volume, uniqueness, validity",
      "Anomaly detection",
      "Quarantine and repair",
      "SLAs and ownership"
    ],
    "artifact": "Data contracts and a test suite"
  },
  {
    "id": "operations",
    "tag": "OPERATIONS",
    "name": "Observability and operations",
    "status": "planned",
    "summary": "Run pipelines like production services.",
    "outline": [
      "Lineage",
      "Freshness and failure monitoring",
      "Incidents and backfill runbooks",
      "Cost monitoring",
      "On-call for data"
    ],
    "artifact": "A runbook and a monitoring plan"
  },
  {
    "id": "governance",
    "tag": "GOVERNANCE",
    "name": "Governance and security",
    "status": "planned",
    "summary": "Protect people and the business.",
    "outline": [
      "Classifying PII",
      "Access control and masking",
      "Retention and deletion",
      "Catalog and discovery",
      "Audit evidence"
    ],
    "artifact": "An access and retention policy"
  },
  {
    "id": "serving",
    "tag": "SERVING",
    "name": "Serving data",
    "status": "planned",
    "summary": "Get data to the people and systems that use it.",
    "outline": [
      "Marts and wide tables",
      "Feature tables",
      "Reverse ETL",
      "Serving APIs",
      "Materialization trade-offs"
    ],
    "artifact": "A serving design with freshness targets"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: the lead funnel pipeline",
    "status": "planned",
    "summary": "Build tables for ads, replies and moderation, then review an agent-made version.",
    "outline": [
      "Sources and contracts",
      "Ingest and model",
      "Orchestrate and test",
      "Operate and backfill",
      "Review with the five lenses"
    ],
    "artifact": "Running pipelines, contracts, a runbook and a review record"
  }
];
