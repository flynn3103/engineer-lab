/* Curriculum layout for the Sales professional skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "sales",
  "name": "Sales",
  "role": "Sales professional",
  "root": "../../",
  "plugin": {
    "name": "sales-manager",
    "agent": "sales-manager"
  },
  "related": []
};
SkillData.spec = {
  "title": "Sales: win the right customers, forecast honestly, and review an agent's sales work",
  "navTitle": "Sales",
  "lead": "Learn to find and qualify the right customers, run discovery and demos, price and negotiate, keep an honest pipeline and forecast, and grow accounts, including how to review outreach and forecasts an agent produced.",
  "overview": [
    "<b>What the role does.</b> A sales professional turns a market into paying customers and keeps them. The work is finding the customers who have the problem, proving value, agreeing terms, and telling the business the truth about what will close.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a qualified account plan or a forecast that the agent produces and you review."
  ],
  "audience": [
    "You sell or lead sellers and want a method, not folklore.",
    "You will use the <b>sales-manager</b> agent and must judge its outreach, plans and forecasts with evidence.",
    "You review pipeline, forecasts and win/loss reports."
  ],
  "outcomes": [
    "Define the customers worth pursuing and disqualify the rest.",
    "Run discovery and demos that connect to a measured outcome.",
    "Price and negotiate with stated trade-offs and a discount discipline.",
    "Review an agent's outreach and forecast for invented facts and wishful thinking."
  ],
  "prerequisites": [
    "No prerequisites. Basic spreadsheet skills help for the pipeline and metrics modules."
  ],
  "mindset": [
    [
      "Customer problem first",
      "People buy an outcome, not a feature.",
      "What problem does this customer have, and how do you know?"
    ],
    [
      "Qualify hard",
      "Time spent on poor-fit deals is the largest hidden cost.",
      "Why is this a real opportunity, and what would disqualify it?"
    ],
    [
      "Evidence in the pipeline",
      "A stage means something the customer did, not something you hoped.",
      "What did the customer do that moved this deal to this stage?"
    ],
    [
      "Honest forecasts",
      "A forecast is a probability statement, not a promise.",
      "What is the range, and what is it based on historically?"
    ],
    [
      "Trade-offs in every discount",
      "A concession buys something or it is a giveaway.",
      "What did we get in exchange for this discount?"
    ],
    [
      "Truth and compliance",
      "Never invent facts about a prospect or the product, and respect consent.",
      "Where did this claim or contact data come from?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is selling promoted-listing and subscription packages to professional sellers (dealers and agencies) on the marketplace."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for sales work: claims, evidence, risks.",
      "Attaches sources for every claim about a prospect or the product."
    ],
    [
      "02 to 05 Market, prospecting, discovery, solution",
      "An ideal-customer profile, an outreach plan, discovery notes and a demo outline.",
      "Drafts them and flags assumptions and missing facts."
    ],
    [
      "06 to 08 Negotiation, pipeline, accounts",
      "A pricing and concession plan, a pipeline review and an account plan.",
      "Produces them and tests the forecast against historical conversion."
    ],
    [
      "09 to 12 Metrics, agent review, capstone",
      "A sales metrics view and a win/loss report.",
      "Builds them and states data quality caveats."
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
    "summary": "The habits and a review protocol for outreach, plans and forecasts.",
    "outline": [
      "Customer problem first",
      "Qualify hard",
      "Evidence in the pipeline",
      "Honest forecasts",
      "Reviewing an agent's sales work"
    ],
    "artifact": "A review record for one piece of sales work"
  },
  {
    "id": "market",
    "tag": "MARKET",
    "name": "Market and ideal customer",
    "status": "planned",
    "summary": "Decide who to sell to, and who not to.",
    "outline": [
      "Segmentation",
      "Ideal customer profile",
      "Personas and buying roles",
      "Sizing a segment",
      "Positioning for sales"
    ],
    "artifact": "An ideal-customer profile and segment sizing"
  },
  {
    "id": "prospecting",
    "tag": "PROSPECTING",
    "name": "Prospecting and outreach",
    "status": "planned",
    "summary": "Reach the right people with a message worth reading.",
    "outline": [
      "Lead sources",
      "Outbound sequences",
      "Inbound handling and speed to lead",
      "Messaging that is true and specific",
      "Consent and outreach rules"
    ],
    "artifact": "An outreach plan and message set"
  },
  {
    "id": "discovery",
    "tag": "DISCOVERY",
    "name": "Discovery and qualification",
    "status": "planned",
    "summary": "Find the real problem and decide whether to pursue.",
    "outline": [
      "Discovery questions",
      "Pain, impact and urgency",
      "Budget, authority and process",
      "Qualification frameworks and their limits",
      "Disqualifying honestly"
    ],
    "artifact": "Discovery notes and a qualification score"
  },
  {
    "id": "solution",
    "tag": "SOLUTION",
    "name": "Solution selling and demos",
    "status": "planned",
    "summary": "Connect what you offer to the outcome the customer wants.",
    "outline": [
      "Mapping value to the customer's measure",
      "Demo structure",
      "Proposals",
      "Proof: references and pilots",
      "Handling objections"
    ],
    "artifact": "A demo outline and a proposal"
  },
  {
    "id": "negotiation",
    "tag": "NEGOTIATION",
    "name": "Pricing and negotiation",
    "status": "planned",
    "summary": "Agree terms without giving away the deal.",
    "outline": [
      "Pricing models",
      "Discount discipline",
      "Trading concessions",
      "Negotiation preparation",
      "Handoff to legal and finance"
    ],
    "artifact": "A pricing and concession plan"
  },
  {
    "id": "pipeline",
    "tag": "PIPELINE",
    "name": "Pipeline and forecasting",
    "status": "planned",
    "summary": "See the pipeline as it is and forecast with honesty.",
    "outline": [
      "Stages defined by customer actions",
      "Conversion rates and coverage",
      "Forecast methods",
      "Pipeline hygiene and CRM data quality",
      "Forecast reviews"
    ],
    "artifact": "A pipeline review and a forecast with a range"
  },
  {
    "id": "accounts",
    "tag": "ACCOUNTS",
    "name": "Account management and expansion",
    "status": "planned",
    "summary": "Keep customers and grow them.",
    "outline": [
      "Onboarding",
      "Health and churn signals",
      "Renewals",
      "Expansion and upsell",
      "Handoff with customer success"
    ],
    "artifact": "An account plan"
  },
  {
    "id": "metrics",
    "tag": "METRICS",
    "name": "Sales metrics and operations",
    "status": "planned",
    "summary": "Measure the sales engine.",
    "outline": [
      "Funnel metrics",
      "Quota and compensation basics",
      "Customer acquisition cost and payback",
      "Win and loss analysis",
      "Sales operations and tooling"
    ],
    "artifact": "A metrics view and a win/loss report"
  },
  {
    "id": "agent-sales",
    "tag": "AGENT SALES",
    "name": "Reviewing agent-made sales work",
    "status": "planned",
    "summary": "Catch the ways generated sales content misleads.",
    "outline": [
      "Invented facts about a prospect",
      "Overclaiming the product",
      "Wishful forecasts",
      "Spam and consent problems",
      "Asking for sources"
    ],
    "artifact": "A sales review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: sell to dealers",
    "status": "planned",
    "summary": "Plan and run a dealer package sale from segment to forecast, then review an agent-made plan.",
    "outline": [
      "Segment and profile",
      "Outreach and discovery",
      "Proposal and negotiation",
      "Pipeline and forecast",
      "Review with the five lenses"
    ],
    "artifact": "An account plan, a forecast and a review record"
  }
];
