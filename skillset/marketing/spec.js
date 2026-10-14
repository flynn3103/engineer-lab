/* Curriculum layout for the Marketer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "marketing",
  "name": "Marketing",
  "role": "Marketer",
  "root": "../../",
  "plugin": {
    "name": "marketing-manager",
    "agent": "marketing-manager"
  },
  "related": []
};
SkillData.spec = {
  "title": "Marketing: grow the right audience, measure honestly, and review an agent's marketing work",
  "navTitle": "Marketing",
  "lead": "Learn to understand a market, position and message a product, choose channels, run campaigns and lifecycle programs, measure with care, and keep claims true, including how to review content and reports an agent produced.",
  "overview": [
    "<b>What the role does.</b> A marketer finds and shapes demand: who the product is for, what to say, where to say it, and whether it worked. The work blends insight, creativity, analytics and discipline about claims and consent.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a positioning brief or a campaign plan that the agent produces and you review."
  ],
  "audience": [
    "You plan or run marketing and want results you can defend with numbers.",
    "You will use the <b>marketing-manager</b> agent and must judge its content and reports.",
    "You review campaigns, content and attribution reports."
  ],
  "outcomes": [
    "Position a product for a defined audience with evidence.",
    "Plan channels and budgets with explicit assumptions.",
    "Measure with the right attribution and know its limits.",
    "Review agent-made content for false claims, spam and misread data."
  ],
  "prerequisites": [
    "No prerequisites. Basic spreadsheet skills help for the analytics and budget modules."
  ],
  "mindset": [
    [
      "Audience before channel",
      "Know who you want to reach and what they need before picking a platform.",
      "Who is this for, and what do they want to do?"
    ],
    [
      "One clear message",
      "A message that tries to say everything says nothing.",
      "What single idea should the reader take away?"
    ],
    [
      "True claims only",
      "Every claim needs support, and consent needs to be real.",
      "What supports this claim, and did people opt in?"
    ],
    [
      "Measure causes, not credit",
      "Attribution assigns credit, it does not prove cause.",
      "Would this have happened without the campaign?"
    ],
    [
      "Unit economics rule",
      "Growth that costs more than it returns is not growth.",
      "What does a customer cost to win, and what do they return?"
    ],
    [
      "Test small, learn fast",
      "Run cheap tests before scaling spend.",
      "What is the cheapest test that could change our mind?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is growing seller supply in a new city: finding sellers, getting them to post, and keeping them posting."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for marketing work: claims, evidence, measurement.",
      "Attaches support for every claim and the data behind every number."
    ],
    [
      "02 to 05 Research, brand, channels, content",
      "A positioning brief, a message hierarchy, a channel plan and a content plan.",
      "Drafts them and lists assumptions and open questions."
    ],
    [
      "06 to 09 Lifecycle, analytics, experiments, budget",
      "A lifecycle plan, a tracking plan, test designs and a budget model.",
      "Produces them and states sample size, attribution caveats and payback."
    ],
    [
      "10 to 12 Compliance, agent review, capstone",
      "A claims and consent checklist and a campaign report.",
      "Checks claims and flags privacy or advertising-rule risks for a human."
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
    "summary": "The habits and a review protocol for campaigns, content and reports.",
    "outline": [
      "Audience before channel",
      "One clear message",
      "True claims only",
      "Measure causes, not credit",
      "Reviewing an agent's marketing work"
    ],
    "artifact": "A review record for one piece of marketing work"
  },
  {
    "id": "research",
    "tag": "RESEARCH",
    "name": "Market research and positioning",
    "status": "planned",
    "summary": "Understand the audience and choose where to stand.",
    "outline": [
      "Customer insight methods",
      "Segmentation and jobs to be done",
      "Competitive analysis",
      "Positioning statements",
      "Validating a position"
    ],
    "artifact": "A positioning brief"
  },
  {
    "id": "messaging",
    "tag": "MESSAGING",
    "name": "Brand and messaging",
    "status": "planned",
    "summary": "Say one clear thing in a consistent voice.",
    "outline": [
      "Value proposition",
      "Message hierarchy",
      "Voice and tone",
      "Creative briefs",
      "Message testing"
    ],
    "artifact": "A message hierarchy and a creative brief"
  },
  {
    "id": "channels",
    "tag": "CHANNELS",
    "name": "Channels and campaigns",
    "status": "planned",
    "summary": "Choose where to reach people and how to run it.",
    "outline": [
      "Channel selection",
      "Paid acquisition basics",
      "Social, partnerships and referral",
      "Campaign planning",
      "Launch plans"
    ],
    "artifact": "A channel plan and a campaign brief"
  },
  {
    "id": "content",
    "tag": "CONTENT",
    "name": "Content and SEO",
    "status": "planned",
    "summary": "Earn attention that lasts.",
    "outline": [
      "Content strategy",
      "Keyword and intent research",
      "On-page and technical SEO basics",
      "Quality and spam avoidance",
      "Measuring content"
    ],
    "artifact": "A content plan with a search-intent map"
  },
  {
    "id": "lifecycle",
    "tag": "LIFECYCLE",
    "name": "Funnels, lifecycle and CRM",
    "status": "planned",
    "summary": "Move people from first visit to loyal user.",
    "outline": [
      "Acquisition, activation, retention",
      "Email and push programs",
      "Segmentation and triggers",
      "Consent and preferences",
      "Win-back and churn"
    ],
    "artifact": "A lifecycle plan"
  },
  {
    "id": "analytics",
    "tag": "ANALYTICS",
    "name": "Analytics and attribution",
    "status": "planned",
    "summary": "Measure what happened and what it means.",
    "outline": [
      "Tracking plans and tagging",
      "Attribution models and their limits",
      "Incrementality and holdouts",
      "Dashboards for decisions",
      "Data quality"
    ],
    "artifact": "A tracking plan and a measurement note"
  },
  {
    "id": "experiments",
    "tag": "EXPERIMENTS",
    "name": "Experimentation and conversion",
    "status": "planned",
    "summary": "Test ideas and improve conversion.",
    "outline": [
      "Landing page and copy tests",
      "Sample size and duration",
      "Reading results",
      "Guardrails",
      "Scaling a winner"
    ],
    "artifact": "A test design and a result review"
  },
  {
    "id": "budget",
    "tag": "BUDGET",
    "name": "Budgeting and performance",
    "status": "planned",
    "summary": "Spend where it pays back.",
    "outline": [
      "Acquisition cost and lifetime value",
      "Return on ad spend and payback",
      "Budget allocation",
      "Forecasting results",
      "Reporting to finance"
    ],
    "artifact": "A budget model with payback"
  },
  {
    "id": "compliance",
    "tag": "COMPLIANCE",
    "name": "Claims, privacy and compliance",
    "status": "planned",
    "summary": "Stay honest and lawful.",
    "outline": [
      "Substantiating claims",
      "Advertising and disclosure rules",
      "Consent and data use",
      "Reviews and testimonials",
      "Escalating to legal"
    ],
    "artifact": "A claims and consent checklist"
  },
  {
    "id": "agent-marketing",
    "tag": "AGENT MARKETING",
    "name": "Reviewing agent-made marketing",
    "status": "planned",
    "summary": "Catch the ways generated marketing misleads.",
    "outline": [
      "Invented statistics",
      "False or unsupported claims",
      "Spammy search content",
      "Tone and brand drift",
      "Misread attribution"
    ],
    "artifact": "A marketing review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: grow seller supply in a new city",
    "status": "planned",
    "summary": "Plan and measure a city launch, then review an agent-made plan.",
    "outline": [
      "Position and message",
      "Channels and budget",
      "Lifecycle and measurement",
      "Test and learn",
      "Review with the five lenses"
    ],
    "artifact": "A plan, a tracking plan and a review record"
  }
];
