/* Curriculum layout for the Frontend engineer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "frontend-engineer",
  "name": "Frontend Engineer",
  "role": "Frontend engineer",
  "root": "../../",
  "plugin": {
    "name": "frontend-engineer",
    "agent": "frontend-engineer"
  },
  "related": []
};
SkillData.spec = {
  "title": "Frontend engineer: from a design contract to a fast, accessible app",
  "navTitle": "Frontend engineer",
  "lead": "Learn to build, test and ship a web front end from a design contract, and to review what a front-end agent builds: structure, state, accessibility, performance, security and tests, each with evidence.",
  "overview": [
    "<b>What the role does.</b> A frontend engineer turns a design into working software that is accessible, fast, secure and maintainable, and connects it to the backend. The thinking comes before the components: where state lives, how data loads, what happens on failure.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a component architecture or a performance report that the agent produces and you review."
  ],
  "audience": [
    "You write UI code and want sound structure, not only working screens.",
    "You will use the <b>frontend-engineer</b> agent and must judge its code with evidence.",
    "You review front-end changes and need a shared checklist."
  ],
  "outcomes": [
    "Structure components and state so the app stays maintainable.",
    "Load and cache data with correct loading, error and empty states.",
    "Measure and improve performance and accessibility with numbers.",
    "Review agent-written front-end code with five lenses and red flags."
  ],
  "prerequisites": [
    "You can read JavaScript or TypeScript and basic HTML and CSS."
  ],
  "mindset": [
    [
      "Start from the problem",
      "A component or library is an answer to a user need and a constraint.",
      "What user problem does this solve, and what is the simplest thing that works?"
    ],
    [
      "Every choice is a trade-off",
      "Frameworks, state tools and render modes each buy something and cost something.",
      "What did this choice cost in bundle size, complexity or flexibility?"
    ],
    [
      "State has one owner",
      "Duplicated state drifts. Decide who owns each piece.",
      "Where does this state live, and who may change it?"
    ],
    [
      "The network is unreliable",
      "Requests are slow, fail, repeat and return in any order.",
      "What does the user see when this call is slow, fails or arrives twice?"
    ],
    [
      "Accessibility is correctness",
      "A button that a keyboard cannot reach is a bug.",
      "Can I do this with a keyboard and a screen reader?"
    ],
    [
      "Measure, do not guess",
      "Performance and quality claims need numbers on real devices.",
      "Show the metric before and after, on a slow phone profile."
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is the ad list and ad detail pages, which must be fast on a mid-range phone and a poor connection."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record per change: requirement, findings per lens, evidence.",
      "Attaches its findings and evidence to every change."
    ],
    [
      "02 to 05 Platform, components, state, rendering",
      "A component architecture and a data-flow description.",
      "Builds from the design contract and records deviations."
    ],
    [
      "06 to 08 Accessibility, performance, testing",
      "An accessibility audit, a performance report and a test plan.",
      "Runs the checks and reports the measurements."
    ],
    [
      "09 to 12 Security, integration, delivery",
      "A client security checklist, an API integration note and a release pipeline.",
      "Produces them and flags anything that needs a human decision."
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
    "summary": "The habits and a review protocol for front-end changes and agent-written code.",
    "outline": [
      "Start from the problem, not the library",
      "Every choice is a trade-off",
      "Think in failure: the network and the user",
      "Evidence over claims",
      "Reviewing an agent's front-end output"
    ],
    "artifact": "A review record for one change"
  },
  {
    "id": "platform",
    "tag": "PLATFORM",
    "name": "Web platform fundamentals",
    "status": "planned",
    "summary": "What the browser does, so you can predict and debug it.",
    "outline": [
      "Semantic HTML",
      "CSS layout and the cascade",
      "The JavaScript event loop",
      "How the browser renders",
      "HTTP caching and the network"
    ],
    "artifact": "A notes page: how this app renders and loads"
  },
  {
    "id": "components",
    "tag": "COMPONENTS",
    "name": "Component architecture",
    "status": "planned",
    "summary": "Structure the UI so it can grow and be tested.",
    "outline": [
      "Component model and composition",
      "State ownership and data flow",
      "Styling systems and design tokens",
      "Folder structure and boundaries",
      "Building from a design contract"
    ],
    "artifact": "A component architecture document"
  },
  {
    "id": "data",
    "tag": "DATA",
    "name": "State and data fetching",
    "status": "planned",
    "summary": "Load, cache and update data correctly.",
    "outline": [
      "Local state versus server state",
      "Fetching, caching and revalidation",
      "Forms and validation",
      "Optimistic updates and rollback",
      "Loading, error and empty states"
    ],
    "artifact": "A data-flow description with failure behavior"
  },
  {
    "id": "rendering",
    "tag": "RENDERING",
    "name": "Routing and rendering strategies",
    "status": "planned",
    "summary": "Choose where and when pages are rendered.",
    "outline": [
      "Client, server and static rendering",
      "Routing and navigation",
      "Code splitting and lazy loading",
      "Hydration and its costs",
      "Choosing a strategy for the marketplace"
    ],
    "artifact": "A rendering decision record"
  },
  {
    "id": "a11y",
    "tag": "ACCESSIBILITY",
    "name": "Accessibility in code",
    "status": "planned",
    "summary": "Build what the design specified, and prove it works.",
    "outline": [
      "Semantics and ARIA, used sparingly",
      "Keyboard and focus management",
      "Forms, labels and errors",
      "Motion, contrast and zoom",
      "Automated and manual testing"
    ],
    "artifact": "An accessibility audit"
  },
  {
    "id": "performance",
    "tag": "PERFORMANCE",
    "name": "Performance",
    "status": "planned",
    "summary": "Make it fast on real devices, and prove it.",
    "outline": [
      "Core Web Vitals and field data",
      "Bundle size and dependencies",
      "Rendering cost and re-renders",
      "Images, fonts and third parties",
      "Measuring on a slow phone profile"
    ],
    "artifact": "A performance report with before and after"
  },
  {
    "id": "testing",
    "tag": "TESTING",
    "name": "Testing",
    "status": "planned",
    "summary": "Choose tests that prove behavior and survive refactors.",
    "outline": [
      "The testing trophy: what each level proves",
      "Component and interaction tests",
      "End-to-end tests and test data",
      "Visual regression",
      "Reviewing agent-written tests"
    ],
    "artifact": "A test plan mapped to the design contract"
  },
  {
    "id": "security",
    "tag": "SECURITY",
    "name": "Client-side security",
    "status": "planned",
    "summary": "Keep the browser side safe.",
    "outline": [
      "XSS and output encoding",
      "Content Security Policy",
      "Where to store tokens",
      "CSRF and cross-origin rules",
      "Dependency and supply-chain risk"
    ],
    "artifact": "A client security checklist"
  },
  {
    "id": "integration",
    "tag": "INTEGRATION",
    "name": "Integration with the backend",
    "status": "planned",
    "summary": "Use an API contract well and fail gracefully.",
    "outline": [
      "Reading an OpenAPI contract",
      "Errors, retries and timeouts",
      "Auth flow on the client",
      "Real-time updates",
      "Contract tests with the backend"
    ],
    "artifact": "An API integration note"
  },
  {
    "id": "delivery",
    "tag": "DELIVERY",
    "name": "Build and delivery",
    "status": "planned",
    "summary": "Ship safely and watch what users experience.",
    "outline": [
      "Bundling and build output",
      "CI checks for a front end",
      "Feature flags and rollouts",
      "Real-user monitoring and errors",
      "Rollback"
    ],
    "artifact": "A release pipeline and a monitoring plan"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: build from a design contract",
    "status": "planned",
    "summary": "Build a marketplace feature from the design contract, then review an agent-made version.",
    "outline": [
      "Read the contract and plan",
      "Build components and states",
      "Integrate and test",
      "Measure and fix",
      "Review with the five lenses"
    ],
    "artifact": "A working feature, its evidence and a review record"
  }
];
