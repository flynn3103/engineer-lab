/* Curriculum layout for the Finance professional skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "finance",
  "name": "Finance",
  "role": "Finance professional",
  "root": "../../",
  "plugin": {
    "name": "finance-analyst",
    "agent": "finance-analyst"
  },
  "related": []
};
SkillData.spec = {
  "title": "Finance: model the business, protect the cash, and review an agent's numbers",
  "navTitle": "Finance",
  "lead": "Learn the accounting foundations, management reporting, budgeting and forecasting, unit economics, cash, business cases and controls, and how to review financial models and reports an agent produced for errors and unsupported assumptions.",
  "overview": [
    "<b>What the role does.</b> Finance records what happened, explains why, plans what comes next, and protects the company's cash and integrity. The work is accuracy, clear assumptions and judgment about what the numbers do and do not show.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a forecast model or a business case that the agent produces and you review. It is educational and is not financial, accounting or tax advice."
  ],
  "audience": [
    "You work in finance or run a budget and want models you can defend.",
    "You will use the <b>finance-analyst</b> agent and must find errors in its models and reports.",
    "You review budgets, forecasts and business cases."
  ],
  "outcomes": [
    "Read the three statements and connect them.",
    "Build a driver-based forecast with scenarios and sensitivities.",
    "Compute unit economics and cash runway correctly.",
    "Review a model for formula errors, double counting and weak assumptions."
  ],
  "prerequisites": [
    "Basic spreadsheet skills. The course builds the accounting it needs."
  ],
  "mindset": [
    [
      "Cash is a fact, profit is an opinion",
      "Accounting choices change profit. Cash movements are harder to argue with.",
      "What does cash say about this?"
    ],
    [
      "State every assumption",
      "A model is its assumptions. Hidden ones are the dangerous ones.",
      "What are the key assumptions, and which one matters most?"
    ],
    [
      "Reconcile",
      "Two sources that should agree must be checked against each other.",
      "What does this tie to, and does it tie?"
    ],
    [
      "Materiality",
      "Focus on what can change a decision.",
      "Would this difference change what we decide?"
    ],
    [
      "Controls protect the numbers",
      "Separate who requests, who approves and who records.",
      "Who can change this, and who checks them?"
    ],
    [
      "Scenario over point estimate",
      "The future is a range, so show the range.",
      "What happens in the downside, base and upside cases?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is the finance of launching a paid product line on the marketplace: pricing, costs, cash and whether it pays back."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for a financial model or report: assumptions, ties, risks.",
      "Attaches its assumptions and reconciliations to every model."
    ],
    [
      "02 to 04 Accounting, reporting, forecasting",
      "A statement walk-through, a variance report and a driver-based forecast.",
      "Builds them and shows the ties between statements."
    ],
    [
      "05 to 07 Unit economics, cash, business cases",
      "A unit-economics model, a cash forecast and a business case.",
      "Produces them with scenarios and sensitivities."
    ],
    [
      "08 to 11 Controls, funding, agent review, capstone",
      "A controls checklist and a model review record.",
      "Checks formulas, signs and units, and flags what needs a human."
    ]
  ],
  "verify": [
    "<b>Not financial, accounting or tax advice.</b> Standards and tax rules differ by country and change. Confirm accounting treatment and tax with a qualified professional for your jurisdiction.",
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
    "summary": "The habits and a review protocol for models and reports.",
    "outline": [
      "Cash is a fact, profit is an opinion",
      "State every assumption",
      "Reconcile",
      "Scenario over point estimate",
      "Reviewing an agent's financial model"
    ],
    "artifact": "A review record for one model"
  },
  {
    "id": "accounting",
    "tag": "ACCOUNTING",
    "name": "Accounting foundations",
    "status": "planned",
    "summary": "Read and connect the statements.",
    "outline": [
      "Double-entry and the ledger",
      "Income statement",
      "Balance sheet",
      "Cash flow statement",
      "Accruals and revenue recognition basics"
    ],
    "artifact": "A walk-through of the three statements"
  },
  {
    "id": "reporting",
    "tag": "REPORTING",
    "name": "Management reporting and KPIs",
    "status": "planned",
    "summary": "Explain what happened and why.",
    "outline": [
      "The monthly close",
      "Variance analysis",
      "KPI design",
      "Segment and product reporting",
      "Reports that drive decisions"
    ],
    "artifact": "A variance report"
  },
  {
    "id": "forecasting",
    "tag": "FORECASTING",
    "name": "Budgeting and forecasting",
    "status": "planned",
    "summary": "Plan with drivers and scenarios.",
    "outline": [
      "Driver-based models",
      "Scenarios and sensitivities",
      "Rolling forecasts",
      "Headcount and cost planning",
      "Forecast accuracy"
    ],
    "artifact": "A driver-based forecast model"
  },
  {
    "id": "unit-economics",
    "tag": "UNIT ECONOMICS",
    "name": "Unit economics and pricing",
    "status": "planned",
    "summary": "Know what a customer or an order is worth.",
    "outline": [
      "Contribution margin",
      "Customer acquisition cost and lifetime value",
      "Break-even",
      "Pricing and its financial effect",
      "Cohort economics"
    ],
    "artifact": "A unit-economics model"
  },
  {
    "id": "cash",
    "tag": "CASH",
    "name": "Cash and working capital",
    "status": "planned",
    "summary": "Stay solvent and use cash well.",
    "outline": [
      "Cash forecasting",
      "Runway",
      "Receivables and payables",
      "Liquidity and buffers",
      "Treasury basics"
    ],
    "artifact": "A cash forecast with runway"
  },
  {
    "id": "business-case",
    "tag": "BUSINESS CASE",
    "name": "Investment and business cases",
    "status": "planned",
    "summary": "Decide whether to do something.",
    "outline": [
      "Costs, benefits and timing",
      "Payback, net present value and return",
      "Build versus buy",
      "Risk and sensitivity",
      "Presenting a business case"
    ],
    "artifact": "A business case with sensitivities"
  },
  {
    "id": "controls",
    "tag": "CONTROLS",
    "name": "Controls, audit and compliance",
    "status": "planned",
    "summary": "Protect the integrity of the numbers.",
    "outline": [
      "Internal controls and segregation of duties",
      "Reconciliations",
      "Audit trails",
      "Tax and statutory awareness",
      "Working with auditors and counsel"
    ],
    "artifact": "A controls checklist"
  },
  {
    "id": "funding",
    "tag": "FUNDING",
    "name": "Funding and valuation basics",
    "status": "planned",
    "summary": "Understand how a company is financed and valued.",
    "outline": [
      "Debt and equity",
      "Cap table basics",
      "Valuation approaches",
      "Investor reporting",
      "Fundraising readiness"
    ],
    "artifact": "An investor reporting pack outline"
  },
  {
    "id": "agent-finance",
    "tag": "AGENT FINANCE",
    "name": "Reviewing agent-made financial work",
    "status": "planned",
    "summary": "Catch the ways generated models and reports mislead.",
    "outline": [
      "Formula and reference errors",
      "Double counting",
      "Sign, unit and currency mistakes",
      "Unsupported assumptions",
      "Asking for the ties"
    ],
    "artifact": "A model review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: a paid product line",
    "status": "planned",
    "summary": "Model a new paid product from price to cash, then review an agent-made model.",
    "outline": [
      "Assumptions and drivers",
      "Unit economics and forecast",
      "Cash and business case",
      "Controls and reporting",
      "Review with the five lenses"
    ],
    "artifact": "A model, a business case and a review record"
  }
];
