/* Curriculum layout for the QA/QC engineer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "qa-qc",
  "name": "QA/QC Engineer",
  "role": "QA/QC engineer",
  "root": "../../",
  "plugin": {
    "name": "qa-engineer",
    "agent": "qa-engineer"
  },
  "related": []
};
SkillData.spec = {
  "title": "QA and QC engineer: prove it works, and review the proof an agent gives you",
  "navTitle": "QA/QC engineer",
  "lead": "Learn to turn requirements into tests, plan testing by risk, automate what pays off, measure quality honestly and decide when a release is ready, including how to review tests an agent wrote.",
  "overview": [
    "<b>What the role does.</b> QA builds quality in by catching misunderstandings early and shaping how a team tests. QC checks the product and its evidence before release. Together they answer: does it do what was asked, and what is the risk if we ship?",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a test plan or a release report that the agent produces and you review."
  ],
  "audience": [
    "You test software or own quality for a team and want a method, not a checklist of habits.",
    "You will use the <b>qa-engineer</b> agent and must judge its tests and reports.",
    "You review test suites and release decisions."
  ],
  "outcomes": [
    "Derive test conditions from requirements with proven techniques.",
    "Plan testing by risk and choose the right level for each check.",
    "Spot weak tests: tautologies, flakiness, coverage that proves nothing.",
    "Decide release readiness from evidence."
  ],
  "prerequisites": [
    "You can read a requirement and use a browser's developer tools. Basic SQL helps."
  ],
  "mindset": [
    [
      "Test the requirement, not the code",
      "A test that restates the implementation proves nothing.",
      "Which requirement does this test protect?"
    ],
    [
      "Risk decides effort",
      "You cannot test everything, so test what could hurt most.",
      "What is the damage if this fails, and how likely is it?"
    ],
    [
      "Try to break it",
      "The goal of testing is to find what is wrong, not to confirm what is right.",
      "What input or sequence did you not try?"
    ],
    [
      "A pass means little alone",
      "A passing suite is only as good as what it checks.",
      "Would this test fail if the feature were broken?"
    ],
    [
      "Flaky is a defect",
      "A test that sometimes fails teaches people to ignore failures.",
      "Why does it fail intermittently, and what is the cost?"
    ],
    [
      "Evidence for the decision",
      "A release decision needs facts and a stated risk, not a feeling.",
      "What do we know, what do we not know, and who accepts the risk?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is testing the flow where a seller posts an ad with photos, and a buyer finds and messages them."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for a test suite: what it proves and what it misses.",
      "Attaches coverage of requirements and gaps to every test set."
    ],
    [
      "02 to 04 Requirements, strategy, functional",
      "Test conditions, a risk-based test plan and test cases.",
      "Derives them from requirements and shows the technique used."
    ],
    [
      "05 to 07 API, automation, non-functional",
      "API and data checks, an automation design, performance, security and accessibility checks.",
      "Writes and runs them, and reports flaky or weak tests."
    ],
    [
      "08 to 11 Metrics, release, agent tests, capstone",
      "A quality report and a release readiness record.",
      "Summarizes evidence and the residual risk for a human decision."
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
    "summary": "The habits and a review protocol for tests and quality evidence.",
    "outline": [
      "Test the requirement, not the code",
      "Risk decides effort",
      "Try to break it",
      "Evidence for the decision",
      "Reviewing an agent's tests"
    ],
    "artifact": "A review record for a test suite"
  },
  {
    "id": "requirements",
    "tag": "REQUIREMENTS",
    "name": "From requirements to test conditions",
    "status": "planned",
    "summary": "Find what must be tested, and find the ambiguity first.",
    "outline": [
      "Testability and acceptance criteria",
      "Equivalence classes and boundaries",
      "Decision tables",
      "State transition testing",
      "Reviewing a requirement for gaps"
    ],
    "artifact": "A set of test conditions traced to requirements"
  },
  {
    "id": "strategy",
    "tag": "STRATEGY",
    "name": "Test strategy and planning",
    "status": "planned",
    "summary": "Decide what to test, at which level, with what evidence.",
    "outline": [
      "The test pyramid and its cost",
      "Risk assessment",
      "Scope, environments and data",
      "Entry and exit criteria",
      "Test plan review"
    ],
    "artifact": "A risk-based test plan"
  },
  {
    "id": "functional",
    "tag": "FUNCTIONAL",
    "name": "Functional and exploratory testing",
    "status": "planned",
    "summary": "Design tests, explore, and report defects well.",
    "outline": [
      "Writing test cases that survive change",
      "Exploratory testing and charters",
      "Session notes and coverage",
      "Defect reports that get fixed",
      "Regression sets"
    ],
    "artifact": "Test cases, session notes and defect reports"
  },
  {
    "id": "api-data",
    "tag": "API AND DATA",
    "name": "API and data testing",
    "status": "planned",
    "summary": "Check the layers under the screen.",
    "outline": [
      "Contract testing against OpenAPI",
      "Status codes, errors and idempotency",
      "SQL checks and data quality",
      "Race conditions and duplicates",
      "Test data management"
    ],
    "artifact": "An API and data test suite"
  },
  {
    "id": "automation",
    "tag": "AUTOMATION",
    "name": "Test automation",
    "status": "planned",
    "summary": "Automate what pays back, and keep it healthy.",
    "outline": [
      "What to automate and what not to",
      "Framework design",
      "Unit, integration and end-to-end layers",
      "Flaky tests: causes and cures",
      "Tests in CI"
    ],
    "artifact": "An automation design and a flaky-test log"
  },
  {
    "id": "nonfunctional",
    "tag": "NON-FUNCTIONAL",
    "name": "Non-functional testing",
    "status": "planned",
    "summary": "Performance, security, accessibility, compatibility.",
    "outline": [
      "Load and performance testing",
      "Security testing basics",
      "Accessibility checks",
      "Compatibility and localization",
      "Reliability and failure testing"
    ],
    "artifact": "A non-functional test report"
  },
  {
    "id": "metrics",
    "tag": "METRICS",
    "name": "Quality metrics and reporting",
    "status": "planned",
    "summary": "Measure quality without fooling yourself.",
    "outline": [
      "What coverage does and does not prove",
      "Defect metrics and escaped defects",
      "Mutation testing",
      "Dashboards for decisions",
      "Honest reporting"
    ],
    "artifact": "A quality report"
  },
  {
    "id": "release",
    "tag": "RELEASE",
    "name": "Release and production quality",
    "status": "planned",
    "summary": "Decide readiness and learn from production.",
    "outline": [
      "Release gates and readiness",
      "Smoke tests and canaries",
      "Monitoring as testing",
      "Rollback verification",
      "Post-release defect review"
    ],
    "artifact": "A release readiness record"
  },
  {
    "id": "agent-tests",
    "tag": "AGENT TESTS",
    "name": "Reviewing agent-written tests",
    "status": "planned",
    "summary": "Catch the ways generated tests mislead.",
    "outline": [
      "Tautological tests",
      "Tests that cannot fail",
      "Invented APIs and fixtures",
      "Coverage theater",
      "Asking for a test that fails first"
    ],
    "artifact": "A test review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: test a feature end to end",
    "status": "planned",
    "summary": "Plan, test and release-assess the post-ad flow, then review an agent-made suite.",
    "outline": [
      "Conditions and risks",
      "Cases, API and data checks",
      "Automate and run",
      "Report and decide",
      "Review with the five lenses"
    ],
    "artifact": "A test plan, evidence and a release record"
  }
];
