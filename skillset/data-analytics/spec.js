/* Curriculum layout for the Data analyst skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "data-analytics",
  "name": "Data Analyst",
  "role": "Data analyst",
  "root": "../../",
  "plugin": {
    "name": "data-analyst",
    "agent": "data-analyst"
  },
  "related": []
};
SkillData.spec = {
  "title": "Data analyst: ask the right question, and judge the numbers an agent gives you",
  "navTitle": "Data analyst",
  "lead": "Learn to turn a business question into a metric, query and analysis you can defend, tell the story with honest charts, and review analyses an agent produced for wrong joins, shaky statistics and numbers nobody can reproduce.",
  "overview": [
    "<b>What the role does.</b> A data analyst answers questions with data so that people can decide. The work is definitions, queries, checks, analysis, and a clear recommendation with its caveats.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as an analysis brief or a metric definition that the agent produces and you review."
  ],
  "audience": [
    "You analyse data to support decisions and want your numbers to stand up.",
    "You will use the <b>data-analyst</b> agent and must verify its queries and claims.",
    "You review dashboards, reports and A/B results."
  ],
  "outcomes": [
    "Define metrics precisely, with a grain and a source.",
    "Write and check SQL that does not double count.",
    "Choose the right statistic and say what it does and does not show.",
    "Review an analysis for reproducibility and for unsupported claims."
  ],
  "prerequisites": [
    "You can read and write basic SQL. The course builds the statistics it needs."
  ],
  "mindset": [
    [
      "Question first",
      "A good analysis starts with the decision it will change.",
      "What decision does this inform, and who makes it?"
    ],
    [
      "Define before you count",
      "The same word means different numbers to different people.",
      "What exactly is counted, per what, over which period?"
    ],
    [
      "Distrust a surprising number",
      "A surprise is more often a data or query error than a discovery.",
      "How did you check this? What does a simple cross-check show?"
    ],
    [
      "Correlation is not cause",
      "Patterns in observational data have many explanations.",
      "What else could explain this, and how would we test the cause?"
    ],
    [
      "Uncertainty is part of the answer",
      "A point estimate without a range is false precision.",
      "How big is the error, and could this be noise?"
    ],
    [
      "Reproducible or it did not happen",
      "If someone cannot rerun it, they cannot trust it.",
      "Where is the query, the data snapshot and the date?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is why the share of ads with a reply within one day changed last month."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for an analysis: question, definitions, checks, caveats.",
      "Attaches its definitions, cross-checks and caveats to every analysis."
    ],
    [
      "02 to 04 Questions, SQL, cleaning",
      "A metric definition, a profiled dataset and validated queries.",
      "Drafts them and shows its reconciliation checks."
    ],
    [
      "05 to 07 Exploration, statistics, experiments",
      "Segment and funnel analysis, intervals and an experiment readout.",
      "Computes them and states sample size and uncertainty."
    ],
    [
      "08 to 11 Visualization, storytelling, agent review, capstone",
      "A dashboard spec and a recommendation memo.",
      "Writes them with caveats and the code to reproduce them."
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
    "summary": "The habits and a review protocol for analyses and numbers.",
    "outline": [
      "Question first",
      "Define before you count",
      "Distrust a surprising number",
      "Correlation is not cause",
      "Reviewing an agent's analysis"
    ],
    "artifact": "A review record for one analysis"
  },
  {
    "id": "questions",
    "tag": "QUESTIONS",
    "name": "Framing questions and metrics",
    "status": "planned",
    "summary": "Turn a business question into precise metrics.",
    "outline": [
      "From decision to question",
      "Metric definitions and grain",
      "Metric trees",
      "Leading and lagging indicators",
      "Guardrail metrics"
    ],
    "artifact": "An analysis brief and metric definitions"
  },
  {
    "id": "sql",
    "tag": "SQL",
    "name": "Data understanding and SQL",
    "status": "planned",
    "summary": "Query correctly and know your tables.",
    "outline": [
      "Profiling a table",
      "Joins and fan-out",
      "Window functions",
      "Time zones and dates",
      "Reviewing SQL for double counting"
    ],
    "artifact": "A validated query set"
  },
  {
    "id": "cleaning",
    "tag": "CLEANING",
    "name": "Cleaning and validating data",
    "status": "planned",
    "summary": "Find what is wrong before it misleads you.",
    "outline": [
      "Missing values",
      "Duplicates and keys",
      "Outliers",
      "Bot and test traffic",
      "Reconciling against a second source"
    ],
    "artifact": "A data validation note"
  },
  {
    "id": "exploration",
    "tag": "EXPLORATION",
    "name": "Exploratory analysis",
    "status": "planned",
    "summary": "Find patterns and test where they hold.",
    "outline": [
      "Distributions",
      "Segmentation",
      "Funnels and cohorts",
      "Time series basics",
      "Seasonality and trends"
    ],
    "artifact": "An exploration notebook with findings"
  },
  {
    "id": "statistics",
    "tag": "STATISTICS",
    "name": "Statistics for analysts",
    "status": "planned",
    "summary": "Know how sure you can be.",
    "outline": [
      "Sampling and bias",
      "Confidence intervals",
      "Significance and effect size",
      "Multiple comparisons",
      "Choosing and reading a test"
    ],
    "artifact": "A note on uncertainty for each claim"
  },
  {
    "id": "experiments",
    "tag": "EXPERIMENTS",
    "name": "Experiments and causal thinking",
    "status": "planned",
    "summary": "Measure the effect of a change.",
    "outline": [
      "A/B test readouts",
      "Sample ratio mismatch",
      "Guardrails and novelty effects",
      "Observational pitfalls",
      "Simpson's paradox"
    ],
    "artifact": "An experiment readout with a recommendation"
  },
  {
    "id": "visualization",
    "tag": "VISUALIZATION",
    "name": "Dashboards and visualization",
    "status": "planned",
    "summary": "Show data honestly and usefully.",
    "outline": [
      "Choosing a chart",
      "Honest axes and scales",
      "Dashboards for decisions",
      "Color and accessibility",
      "Reviewing a dashboard"
    ],
    "artifact": "A dashboard specification"
  },
  {
    "id": "storytelling",
    "tag": "STORYTELLING",
    "name": "Storytelling and recommendations",
    "status": "planned",
    "summary": "Turn findings into decisions.",
    "outline": [
      "Structure of a memo",
      "Executive summary",
      "Caveats and confidence",
      "Recommending an action",
      "Following up"
    ],
    "artifact": "A recommendation memo"
  },
  {
    "id": "agent-analysis",
    "tag": "AGENT ANALYSIS",
    "name": "Reviewing agent-made analysis",
    "status": "planned",
    "summary": "Catch the ways generated analysis misleads.",
    "outline": [
      "Plausible but wrong SQL",
      "Numbers with no source",
      "Unsupported causal claims",
      "Cherry-picked periods",
      "Asking for the query and the check"
    ],
    "artifact": "An analysis review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: why did first-reply rate move?",
    "status": "planned",
    "summary": "Analyze a change in the reply rate end to end, then review an agent-made version.",
    "outline": [
      "Question and definitions",
      "Query and validate",
      "Explore and test",
      "Explain and recommend",
      "Review with the five lenses"
    ],
    "artifact": "A memo, its queries and a review record"
  }
];
