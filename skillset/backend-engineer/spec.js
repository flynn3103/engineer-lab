/* Spec for the Backend Engineer skill-set course: the role, the competency map and the gate for the backend-engineer plugin.
 * Only the Data Modeling module is written so far. The other modules are listed as planned so the map is honest. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  id: 'backend-engineer', name: 'Backend Engineer', role: 'Backend engineer', root: '../../',
  plugin: { name: 'backend-engineer', agent: 'backend-engineer', persona: 'a senior backend engineer who starts from the problem, states the trade-off, thinks in failure, enforces invariants, and attaches evidence and a review record to every change.' },
  related: []
};
SkillData.spec = {
  title: 'Backend engineer: build it right, and review what an agent builds',
  navTitle: 'Backend engineer',
  lead: `The skill set and the mindset of a backend engineer who can review the work of an AI agent. Each module teaches a technique, the questions to ask, and the red flags to look for, and ends in an artifact that the backend-engineer plugin produces and you check.`,
  overview: [
    `<b>What the role does.</b> A backend engineer turns a business need into a system that works, can change, and can be run by other people. The thinking comes before the code: what must it do, what are the parts, what data does it keep, how do other systems talk to it.`,
    `<b>How this course works.</b> Each module is a skill with 5 to 9 lessons. A lesson has the idea, a worked example on one running scenario, a short technique, common mistakes, a practice exercise and a checklist. The module ends in an artifact (for example a data model document) that you keep and that the plugin agent reviews.`
  ],
  audience: [
    `You write code and can read SQL, but design decisions still feel like guesses.`,
    `You will use the <b>backend-engineer</b> plugin and must judge what its agent produces with those skills, line by line, with evidence.`,
    `You review designs and want a shared vocabulary and checklist.`
  ],
  outcomes: [
    `Turn a request into functional requirements you can test.`,
    `Draw and defend an architecture and a data model for it.`,
    `Produce the artifacts the plugin asks for, and spot when its output is wrong, unsafe or unproven.`,
    `Ask the question that exposes a weak design: what problem, what trade-off, how does it fail, show me the evidence.`
  ],
  prerequisites: [`You can read basic SQL and a simple diagram.`, `You do not need to know any one database. Where a choice depends on the engine, the lessons point to the Postgres, ScyllaDB and Redis internals courses on this site.`],
  mindset: [
    [`Start from the problem`, `Reason from numbers and facts, not from tools other people use.`, `What is the problem, in numbers, and when does the simple design fail?`],
    [`Every choice is a trade-off`, `Each decision buys something and pays for it. Write both down.`, `What did you give up, and what would make you choose differently?`],
    [`Think in failure`, `Slow, down, wrong, duplicated and partial are normal states of every dependency.`, `What happens when this call is slow, and when it is repeated?`],
    [`Defend with invariants`, `State what must always be true and enforce it where the data lives.`, `Which constraint or test stops this from ever being false?`],
    [`Trust evidence, not tone`, `A claim is a hypothesis until a test, plan or measurement supports it.`, `Show me the measurement, on realistic load, at p99.`],
    [`Keep it reversible and small`, `Prefer changes that are cheap to undo, and take irreversible ones slowly.`, `How do we roll this back, and what is the blast radius if it is wrong?`],
    [`Think like an attacker`, `Anything the client sends is untrusted. Access checks happen on every object.`, `Who may do this, and where is that checked for this exact record?`]
  ],
  scenario: {
    title: `One scenario for every lesson: a classifieds marketplace`,
    body: `<b>Meet the marketplace.</b> Members post ads in categories. Buyers search and filter ads, save the ones they like, and chat with sellers. Moderators handle reports. Numbers used in the lessons (ads, members, messages per day) are invented examples so the arithmetic is easy to follow, not measurements of any real system. Each lesson adds one piece to the same model.`
  },
  gate: [
    [`01 Mindset and review`, `A review record for each change: requirement, risk size, finding per lens, evidence requested and received.`, `Attaches its own lens findings and evidence to every change, so your review checks its reasoning.`],
    [`02 Functional spec`, `A requirements list with acceptance criteria, a glossary and out-of-scope.`, `The <code>functional-spec</code> skill flags vague or untestable lines and names the entities for the data model.`],
    [`03 Architecture`, `A problem statement, estimates, a component diagram and decision records.`, `The <code>system-design</code> skill checks that each requirement lands on a component and each decision states its trade-off.`],
    [`04 Data modeling`, `A data model document: ER diagram, table spec, keys, indexes, access patterns and a migration plan.`, `The <code>data-modeling</code> skill reviews it against the lesson checklists and drafts the DDL and migrations.`],
    [`05 API`, `An API contract (OpenAPI, and protobuf with a gRPC service definition for internal calls) and an error model.`, `The <code>api-design</code> skill checks the contract against the data model and flags breaking changes.`],
    [`06 Security`, `A threat list and a security review record.`, `The <code>security-review</code> skill runs the object-level and function-level authorization checks and the injection checks.`],
    [`07 Performance`, `A performance report with p95 and p99 evidence.`, `The <code>performance-review</code> skill asks for plans and percentiles and rejects claims without them.`],
    [`08 Async and messaging`, `A messaging design: queues or topics, delivery rules, failure handling.`, `The <code>messaging-design</code> skill checks idempotency, ordering and dead-letter handling.`],
    [`09 Reliability`, `A failure table and an observability plan.`, `The <code>reliability-ops</code> skill checks timeouts, health checks, shutdown and alerts.`],
    [`10 Scaling`, `A scaling plan tied to measured bottlenecks.`, `The <code>scaling-review</code> skill refuses a scaling step that no measurement justifies.`],
    [`11 Testing`, `A test plan mapped to the requirements.`, `The <code>testing</code> skill writes tests from the requirements and checks that they can fail.`],
    [`12 Delivery`, `A delivery pipeline definition with a rollback plan.`, `The <code>delivery</code> skill checks rollout order, rollback and secrets handling.`],
    [`13 Capstone`, `A complete design and a review record for it.`, `All skills together, reviewed with the five lenses.`]
  ],
  verify: [
    `<b>Research.</b> The module map and the reviewer habits draw on the topic list and chapter outlines of the open reference Backend from First Principles (DsThakurRawat on GitHub: HTTP, routing, serialization, auth, validation, layers, REST, databases, caching, queues, search, fault tolerance, gRPC, configuration, observability, graceful shutdown, security, scaling, concurrency, delivery, testing, Kafka, WebSockets, OpenAPI, agents, URL shortener). Only chapter headings were read. The wording and every example here are original, and no code from that repository is reused.`,
    `<b>Sources.</b> Concepts follow E. F. Codd (1970), P. Chen (1976), W. Kent (1983), R. Kimball and M. Ross (The Data Warehouse Toolkit, 3rd ed.), M. Kleppmann (Designing Data-Intensive Applications) and the PostgreSQL manual. Each lesson names what it relied on.`,
    `<b>SQL.</b> The statements in the lessons use standard SQL and PostgreSQL syntax. They were read against the PostgreSQL documentation for the features named, not run against a live database in this pass.`,
    `<b>Examples.</b> Every number and every table of data is an invented example. The marketplace is not any real company.`,
    `<b>How modules 02 to 12 were written.</b> They were drafted in one pass by parallel writers following one brief, then run through the validator and the browser check. Each writer listed the claims it was least sure of (for example Kubernetes defaults, Kafka and SQS settings, RFC and book citations). Those lists are the first things to check before relying on a lesson, and no lesson has had a line-by-line fact check yet.`,
    `<b>Not yet verified.</b> The plugin, its agent and its skills do not exist yet, so the "what the skill does" boxes describe the intended behavior.`
  ]
};
SkillData.modules = [
  {
    id: 'mindset', skillDescription: "Review a design, change or document from an AI agent or a colleague with a repeatable protocol: a problem statement with numbers, trade-offs, failure behavior, invariants and evidence, then five lenses (fit, correctness, failure, security, operability) and a red-flag scan. Use when asked to review, approve, critique or sanity-check backend work, or before accepting an agent's output.", tag: 'MINDSET', name: 'Mindset and review method', status: 'ready', skillName: 'review-method',
    summary: `The habits and the review protocol that let you judge an agent's work: problem first, trade-offs, failure, invariants, evidence.`,
    goal: `Be able to review a design or a change you did not write, and say with evidence whether to accept it. You ask the questions that expose a weak design, and you can tell a measured claim from a confident one.`,
    competencies: [
      `State a problem with numbers and find where the simple design fails.`,
      `Name the trade-off in every decision and record it with its alternatives.`,
      `Walk every dependency through slow, down, wrong, duplicated and partial.`,
      `Write invariants, find where each is enforced, and ask for evidence.`,
      `Review agent output with five lenses and a list of red flags.`
    ],
    artifact: `A <b>review record</b> for one change: the requirement, the risk size, one finding (or "checked, none") per lens, the red flags found, and the evidence requested and received.`,
    agent: `The agent ships a review record with every output, whatever skill it used: its lens findings, its failure table and its evidence. You review that record and the change, and approve or reject with it in front of you.`
  },
  { id: 'requirements', tag: 'REQUIREMENTS', name: `Collect the functional spec`, status: 'planned', summary: `Turn a request into testable requirements, acceptance criteria and a glossary.`,
    outline: [`Turn a request into a problem statement`, `Functional and non-functional requirements`, `Acceptance criteria you can test`, `Glossary and out-of-scope`, `Reviewing an agent-written spec`],
    artifact: `A functional spec with acceptance criteria and a glossary` },
  { id: 'architecture', tag: 'ARCHITECTURE', name: `Architecture and system design`, status: 'planned', summary: `Estimate, choose components and boundaries, and weigh monolith, services, queues and scale.`,
    outline: [`Back-of-the-envelope estimation`, `From problem to components (high-level design)`, `Monolith, services or serverless: the real costs`, `Statelessness, queues and where state lives`, `Decision records and diagrams that survive review`],
    artifact: `A design document: problem, estimates, component diagram, decision records` },
  {
    id: 'data-modeling', skillDescription: "Model data from requirements through conceptual, logical and physical levels: entities and cardinality, keys, normalization, access-pattern indexes, dimensional models and safe migrations. Use when designing or reviewing a schema, an ER diagram, indexes, migrations or analytics tables.", tag: 'DATA MODEL', name: 'Data modeling', status: 'ready', skillName: 'data-modeling',
    summary: `Go from requirements to a conceptual, logical and physical model, then keep it healthy as it changes.`,
    goal: `Be able to take the nouns and verbs of a requirement list and produce a data model that is correct (no anomalies), fast for the queries that matter, and safe to change. You can explain each choice and the one it traded away.`,
    competencies: [
      `Separate conceptual, logical and physical models and say which question each answers.`,
      `Find entities, relationships and cardinality, including the many-to-many that hide in a sentence.`,
      `Choose keys and identifiers on purpose.`,
      `Normalize to third normal form and denormalize only with a stated reason.`,
      `Model for the access patterns of the engine you will use.`,
      `Design a star schema for analytics and handle changing dimensions.`,
      `Change a live schema without downtime.`
    ],
    artifact: `A <b>data model document</b> for one feature: a conceptual ER diagram, the logical model with keys and constraints, the physical table spec with indexes, the list of access patterns it serves, and a migration plan for the first change.`,
    agent: `The agent, using the <code>data-modeling</code> skill, asks for this document, checks it against the lesson checklists (every entity has a key, no repeating groups, every access pattern has an index or a reason, every migration is reversible), and drafts the DDL and the migration files from it.`
  },
  { id: 'api', tag: 'API', name: `API and request lifecycle`, status: 'planned', summary: `HTTP, routing, REST, serialization, validation, OpenAPI, and the controller, service, repository layers.`,
    outline: [`HTTP, status codes, caching and CORS`, `Routing and the request lifecycle`, `REST resources, errors and pagination`, `Serialization and validation at the boundary`, `Controllers, services, repositories and middleware`, `OpenAPI as the contract`],
    artifact: `An API contract (OpenAPI) and an error model` },
  { id: 'security', tag: 'SECURITY', name: `Identity and security`, status: 'planned', summary: `Authentication, authorization, injection, sessions and tokens, rate limiting, and the attacker mindset.`,
    outline: [`The attacker mindset`, `Authentication: passwords, sessions, tokens`, `Authorization: object-level and function-level checks`, `Injection, XSS and CSRF`, `Rate limiting and secrets`, `Security headers and misconfiguration`],
    artifact: `A threat list and a security review record` },
  { id: 'performance', tag: 'PERFORMANCE', name: `Performance, caching and concurrency`, status: 'planned', summary: `Latency percentiles, bottlenecks, indexes and plans, caching strategies, IO versus CPU bound work.`,
    outline: [`Latency, percentiles and throughput`, `Finding bottlenecks with profiles and plans`, `Indexes, N+1 queries and connection pools`, `Caching strategies and invalidation`, `IO-bound and CPU-bound work, threads and event loops`],
    artifact: `A performance report with p95 and p99 evidence` },
  { id: 'async', tag: 'ASYNC', name: `Async work and messaging`, status: 'planned', summary: `Task queues, message brokers and event streaming, WebSockets, and gRPC between services.`,
    outline: [`Task queues and background jobs`, `Retries, idempotency and dead letters`, `Message brokers and event streaming`, `Delivery semantics, ordering and the outbox pattern`, `WebSockets and real-time updates`, `gRPC and service-to-service calls`],
    artifact: `A messaging design: topics or queues, delivery rules, failure handling` },
  { id: 'reliability', tag: 'RELIABILITY', name: `Reliability and operations`, status: 'planned', summary: `Error handling, configuration, graceful shutdown, logs, metrics and traces.`,
    outline: [`Error classes and a global error handler`, `Configuration validated at startup`, `Health checks and graceful shutdown`, `Structured logs, metrics and traces`, `Alerts that mean something`],
    artifact: `A failure table and an observability plan` },
  { id: 'scaling', tag: 'SCALING', name: `Scaling out`, status: 'planned', summary: `Statelessness, load balancing, read replicas, sharding, CDNs and the cost of services.`,
    outline: [`Stateless services and load balancing`, `Read replicas and replication lag`, `Sharding and partitioning`, `CDNs and edge computing`, `Scaling mental models: measure first`],
    artifact: `A scaling plan tied to measured bottlenecks` },
  { id: 'quality', tag: 'QUALITY', name: `Testing and quality`, status: 'planned', summary: `Unit, integration and end-to-end tests that prove the requirements.`,
    outline: [`Test pyramid and what each level proves`, `Unit and integration tests`, `End-to-end tests and test data`, `Reviewing agent-written tests`, `Quality gates in the pipeline`],
    artifact: `A test plan mapped to the requirements` },
  { id: 'delivery', tag: 'DELIVERY', name: `Delivery`, status: 'planned', summary: `Containers, orchestration and CI/CD that ship safely and roll back.`,
    outline: [`Containers and images`, `Orchestration basics`, `CI/CD pipelines`, `Deployment strategies and rollback`, `Environments, config and secrets`],
    artifact: `A delivery pipeline definition with a rollback plan` },
  { id: 'capstone', tag: 'CAPSTONE', name: `Capstone: design and review a service`, status: 'planned', summary: `Design a URL shortener end to end, then review an agent-made version of it.`,
    outline: [`Problem statement and estimates for a URL shortener`, `Identifier generation and the data model`, `Redirect path: caching and hot keys`, `Failure, abuse and observability`, `Review an agent-made version with the five lenses`],
    artifact: `A complete design and a review record for it` }
];
