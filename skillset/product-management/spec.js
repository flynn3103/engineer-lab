/* Curriculum layout for the Product manager skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "product-management",
  "name": "Product Manager",
  "role": "Product manager",
  "root": "../../",
  "plugin": {
    "name": "product-manager",
    "agent": "product-manager"
  },
  "related": []
};
SkillData.spec = {
  "title": "Product manager: choose the right problem, prove it, and review an agent's product work",
  "navTitle": "Product manager",
  "lead": "Learn to find problems worth solving, set direction, write specs, prioritize, measure and run experiments, and ship with engineering and design, including how to review a PRD or an analysis an agent produced.",
  "overview": [
    "<b>What the role does.</b> A product manager decides which problems to solve and why, aligns people around that, and checks with evidence that what was shipped worked. The job is judgment under uncertainty.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a PRD or an experiment design that the agent produces and you review."
  ],
  "audience": [
    "You manage a product or aspire to, and want a rigorous method.",
    "You will use the <b>product-manager</b> agent and must judge its specs and analysis with evidence.",
    "You review PRDs, roadmaps and experiment results."
  ],
  "outcomes": [
    "Frame a problem with users, evidence and a measurable outcome.",
    "Write a spec engineers and designers can build from, with non-goals.",
    "Prioritize with stated trade-offs and say no with reasons.",
    "Design and read an experiment correctly, and spot weak analysis."
  ],
  "prerequisites": [
    "No prerequisites. Comfort with basic statistics helps for the metrics and experiment modules."
  ],
  "mindset": [
    [
      "Outcomes over outputs",
      "Shipping a feature is not success. A changed user behavior or result is.",
      "What outcome will change, by how much, and how will we know?"
    ],
    [
      "Problem before solution",
      "A feature request is a guess about a problem.",
      "What problem is behind this, and who has it?"
    ],
    [
      "Every priority is a trade-off",
      "Choosing one thing means not choosing others.",
      "What are we not doing, and what is the cost of that?"
    ],
    [
      "Evidence beats opinion",
      "Customer quotes, data and tests beat the loudest voice.",
      "What evidence supports this, and how strong is it?"
    ],
    [
      "Small, reversible bets",
      "Learn cheaply before committing a lot.",
      "What is the cheapest test of the riskiest assumption?"
    ],
    [
      "Make decisions legible",
      "A decision that nobody can find or understand will be repeated.",
      "Where is this decision recorded, with its reasons?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is increasing the share of posted ads that get a first reply within a day."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for a product document: assumptions, evidence, trade-offs.",
      "Attaches its assumptions and evidence to every product document."
    ],
    [
      "02 to 04 Discovery, strategy, PRDs",
      "A problem brief, a strategy note and a PRD with non-goals.",
      "Drafts them and lists the open questions and assumptions."
    ],
    [
      "05 to 07 Prioritization, metrics, experiments",
      "A prioritization table, a metric tree and an experiment design.",
      "Produces them and states sample size and guardrails."
    ],
    [
      "08 to 12 Delivery, launch, stakeholders, economics, capstone",
      "A delivery agreement, a launch plan, a decision log and a unit-economics view.",
      "Keeps them current and flags decisions that need a human."
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
    "summary": "The habits and a review protocol for product documents and analysis.",
    "outline": [
      "Outcomes over outputs",
      "Problem before solution",
      "Evidence beats opinion",
      "Small, reversible bets",
      "Reviewing an agent's PRD and analysis"
    ],
    "artifact": "A review record for a product document"
  },
  {
    "id": "discovery",
    "tag": "DISCOVERY",
    "name": "Discovery",
    "status": "planned",
    "summary": "Find problems worth solving.",
    "outline": [
      "Frame the problem",
      "Jobs to be done and user research",
      "Opportunity assessment",
      "Assumption mapping",
      "Cheap tests of the riskiest assumption"
    ],
    "artifact": "A problem brief with an assumption map"
  },
  {
    "id": "strategy",
    "tag": "STRATEGY",
    "name": "Strategy and vision",
    "status": "planned",
    "summary": "Choose direction and say what you will not do.",
    "outline": [
      "Vision and goals",
      "Objectives and key results done well",
      "Market and competitor analysis",
      "Positioning",
      "Roadmap as themes and bets"
    ],
    "artifact": "A strategy note and a themed roadmap"
  },
  {
    "id": "prd",
    "tag": "PRD",
    "name": "Requirements and PRDs",
    "status": "planned",
    "summary": "Write what to build and what not to build.",
    "outline": [
      "PRD structure",
      "User stories and acceptance criteria",
      "Non-goals and scope",
      "Edge cases and rollout",
      "Spec review with design and engineering"
    ],
    "artifact": "A PRD with acceptance criteria and non-goals"
  },
  {
    "id": "prioritization",
    "tag": "PRIORITIZATION",
    "name": "Prioritization",
    "status": "planned",
    "summary": "Choose among good options, with reasons.",
    "outline": [
      "Value, effort and risk",
      "Scoring models and their limits",
      "Dependencies and sequencing",
      "Saying no",
      "Explaining a trade-off"
    ],
    "artifact": "A prioritization table with stated trade-offs"
  },
  {
    "id": "metrics",
    "tag": "METRICS",
    "name": "Metrics and analytics",
    "status": "planned",
    "summary": "Measure what matters.",
    "outline": [
      "Outcome metrics and a north star",
      "Funnels and cohorts",
      "Tracking plans and instrumentation",
      "Metric traps and guardrails",
      "Dashboards for decisions"
    ],
    "artifact": "A metric tree and a tracking plan"
  },
  {
    "id": "experiments",
    "tag": "EXPERIMENTS",
    "name": "Experimentation",
    "status": "planned",
    "summary": "Test ideas and read results correctly.",
    "outline": [
      "Hypotheses",
      "A/B test design and sample size",
      "Guardrail metrics",
      "Reading results and significance",
      "Shipping, extending or stopping"
    ],
    "artifact": "An experiment design and a result review"
  },
  {
    "id": "delivery",
    "tag": "DELIVERY",
    "name": "Delivery with engineering and design",
    "status": "planned",
    "summary": "Work with the team to ship the right thing.",
    "outline": [
      "Working agreements and rituals",
      "Controlling scope",
      "Definition of done",
      "Rollout and rollback",
      "Handling surprises"
    ],
    "artifact": "A delivery plan and a definition of done"
  },
  {
    "id": "launch",
    "tag": "LAUNCH",
    "name": "Go-to-market and lifecycle",
    "status": "planned",
    "summary": "Launch, adopt, and retire.",
    "outline": [
      "Launch plans",
      "Messaging",
      "Adoption and retention",
      "Deprecation",
      "Learning after launch"
    ],
    "artifact": "A launch plan and a post-launch review"
  },
  {
    "id": "stakeholders",
    "tag": "STAKEHOLDERS",
    "name": "Stakeholders and communication",
    "status": "planned",
    "summary": "Align people and keep decisions visible.",
    "outline": [
      "Mapping stakeholders",
      "Status that informs",
      "Decision records",
      "Managing disagreement",
      "Writing for executives"
    ],
    "artifact": "A decision log and a status format"
  },
  {
    "id": "economics",
    "tag": "ECONOMICS",
    "name": "Business and unit economics",
    "status": "planned",
    "summary": "Understand how the product makes and spends money.",
    "outline": [
      "Revenue models",
      "Unit economics",
      "Pricing basics",
      "Cost and benefit of a feature",
      "Reading a business case"
    ],
    "artifact": "A unit-economics view for a feature"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: improve first-reply rate",
    "status": "planned",
    "summary": "Run a feature from problem to launch and measurement, then review an agent-made PRD.",
    "outline": [
      "Frame and discover",
      "Spec and prioritize",
      "Design the experiment",
      "Ship and measure",
      "Review with the five lenses"
    ],
    "artifact": "A PRD, an experiment result and a review record"
  }
];
