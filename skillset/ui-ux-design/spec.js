/* Curriculum layout for the UI/UX designer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "ui-ux-design",
  "name": "UI/UX Designer",
  "role": "UI/UX designer",
  "root": "../../",
  "plugin": {
    "name": "ui-ux-designer",
    "agent": "ui-ux-designer"
  },
  "related": []
};
SkillData.spec = {
  "title": "UI/UX designer: from a user problem to a design contract",
  "navTitle": "UI/UX designer",
  "lead": "Learn to define a user problem, shape flows and screens, build a visual system, and hand engineers a design contract they can build and test against. The course also teaches how to review what a design agent produces.",
  "overview": [
    "<b>What the role does.</b> A UI/UX designer decides what to build and how it should feel and work, then proves it works for real people. The output is decisions a human can approve: briefs, flows, states, tokens, component specs, accessibility rules.",
    "<b>How this course works.</b> Each module is a skill with lessons, a worked example on the marketplace, practice and a checklist. It ends in an artifact (a brief, a flow set, a token file) that the plugin agent produces and you review."
  ],
  "audience": [
    "You design or direct UI and want to be precise, not only attractive.",
    "You will use the <b>ui-ux-designer</b> agent and must judge its output with evidence.",
    "You work with engineers and want handoffs that do not drift."
  ],
  "outcomes": [
    "Frame a design problem with users, goals and success measures.",
    "Specify every state of a screen, not just the happy one.",
    "Produce a token file and component specs that engineers can test.",
    "Review a design (human or agent) for usability, accessibility and fit."
  ],
  "prerequisites": [
    "No tools are required. You should know basic layout and be willing to test designs with users."
  ],
  "mindset": [
    [
      "Start from the user's problem",
      "A screen is an answer. Find the question and who asks it.",
      "Which user, doing what task, and how will we know it worked?"
    ],
    [
      "Decisions under constraints",
      "Design is choosing among trade-offs of time, platform, and effort.",
      "What did you give up for this layout, and for whom?"
    ],
    [
      "Evidence over taste",
      "Opinions are hypotheses until users or data support them.",
      "What did you observe, with how many people?"
    ],
    [
      "Every state is designed",
      "Empty, loading, error, partial, offline and long text are normal.",
      "Show me the empty, error and slow states."
    ],
    [
      "Accessible by default",
      "Contrast, focus, targets and semantics are part of the design, not a later fix.",
      "How does this work with a keyboard and a screen reader?"
    ],
    [
      "Make it testable",
      "A rule an engineer cannot check is a wish.",
      "What is the acceptance check for this component?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is the buyer's journey: find an ad on a phone, judge it quickly, and contact the seller."
  },
  "gate": [
    [
      "01 Mindset and critique",
      "A critique record: problem, evidence, trade-offs, findings.",
      "Attaches its reasoning and evidence to every design."
    ],
    [
      "02 to 04 Discovery, IA, flows",
      "A design brief, a sitemap, flows and a state table.",
      "Drafts them from the request and asks for missing users, goals and states."
    ],
    [
      "05 to 07 Visual system, tokens, accessibility",
      "A token file, component specs and an accessibility spec.",
      "Generates and checks them against contrast and focus rules."
    ],
    [
      "08 to 11 Platforms, testing, content, handoff",
      "Breakpoint and platform notes, a test report, a content guide and the design contract.",
      "Produces the design contract and checks the built result against it."
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
    "name": "Mindset and critique method",
    "status": "planned",
    "summary": "The habits and a critique protocol for judging a design or an agent's design.",
    "outline": [
      "Start from the user's problem",
      "Design is decisions under constraints",
      "Evidence over taste",
      "Accessible by default",
      "Critiquing a design and an agent's design"
    ],
    "artifact": "A critique record for one design"
  },
  {
    "id": "discovery",
    "tag": "DISCOVERY",
    "name": "Research and discovery",
    "status": "planned",
    "summary": "Frame the problem, understand users and set measurable goals.",
    "outline": [
      "Define the problem and the goal",
      "Users and jobs to be done",
      "Lightweight research methods",
      "Synthesize findings into insights",
      "Success measures"
    ],
    "artifact": "A design brief with measurable goals"
  },
  {
    "id": "ia",
    "tag": "IA",
    "name": "Information architecture",
    "status": "planned",
    "summary": "Organize content so people can find it and know where they are.",
    "outline": [
      "Content inventory and hierarchy",
      "Navigation models",
      "Labels and naming",
      "Sitemaps and card sorting",
      "Search and findability"
    ],
    "artifact": "A sitemap and a navigation spec"
  },
  {
    "id": "flows",
    "tag": "FLOWS",
    "name": "Flows and interaction",
    "status": "planned",
    "summary": "Design tasks end to end, including every state and every error.",
    "outline": [
      "Task flows",
      "Screen states: empty, loading, error, partial",
      "Forms and validation",
      "Feedback, motion and timing",
      "Error recovery"
    ],
    "artifact": "A flow set and a state table per screen"
  },
  {
    "id": "visual",
    "tag": "VISUAL",
    "name": "Visual design foundations",
    "status": "planned",
    "summary": "Layout, type, color and spacing that communicate clearly.",
    "outline": [
      "Layout and grids",
      "Type scale and hierarchy",
      "Color, contrast and meaning",
      "Spacing and rhythm",
      "Imagery and iconography"
    ],
    "artifact": "A visual specification"
  },
  {
    "id": "system",
    "tag": "SYSTEM",
    "name": "Design systems and tokens",
    "status": "planned",
    "summary": "Tokens, components and themes that engineers can build from.",
    "outline": [
      "Design tokens",
      "Components, variants and states",
      "Theming: light and dark",
      "Documentation and governance",
      "The design contract"
    ],
    "artifact": "A token file and component specs"
  },
  {
    "id": "a11y",
    "tag": "ACCESSIBILITY",
    "name": "Accessibility",
    "status": "planned",
    "summary": "Make the design usable with keyboards, screen readers and different abilities.",
    "outline": [
      "WCAG principles in practice",
      "Keyboard and focus order",
      "Semantics for screen readers",
      "Color, motion and cognitive load",
      "Testing for accessibility"
    ],
    "artifact": "An accessibility spec and an audit"
  },
  {
    "id": "platform",
    "tag": "PLATFORMS",
    "name": "Responsive and platform design",
    "status": "planned",
    "summary": "Design for phone, tablet and desktop, and for iOS and Android conventions.",
    "outline": [
      "Responsive layout and breakpoints",
      "Touch targets and gestures",
      "Platform conventions",
      "Offline and permission states",
      "Cross-platform trade-offs"
    ],
    "artifact": "Breakpoint and platform notes"
  },
  {
    "id": "testing",
    "tag": "TESTING",
    "name": "Prototyping and usability testing",
    "status": "planned",
    "summary": "Test ideas cheaply and learn from real users.",
    "outline": [
      "Prototype fidelity",
      "Test plans and tasks",
      "Moderated and unmoderated tests",
      "Analyze and report",
      "Iterate on findings"
    ],
    "artifact": "A usability test report"
  },
  {
    "id": "content",
    "tag": "CONTENT",
    "name": "Content and microcopy",
    "status": "planned",
    "summary": "Words that guide people: labels, errors, empty states, tone.",
    "outline": [
      "Voice and tone",
      "Clear error messages",
      "Empty and onboarding states",
      "Localization, including Vietnamese",
      "Content review"
    ],
    "artifact": "A content guide"
  },
  {
    "id": "handoff",
    "tag": "HANDOFF",
    "name": "Handoff and design QA",
    "status": "planned",
    "summary": "Hand engineers a contract and check what they built.",
    "outline": [
      "What goes into a design contract",
      "Reviewing built UI against the design",
      "Design QA and tolerances",
      "Change requests both ways",
      "Working with the frontend-engineer agent"
    ],
    "artifact": "A handoff package and a design QA record"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: design a feature",
    "status": "planned",
    "summary": "Design a marketplace feature from brief to contract, then review an agent-made version.",
    "outline": [
      "Brief and flows",
      "Visual system and states",
      "Accessibility and platforms",
      "Test with users",
      "Hand off and review"
    ],
    "artifact": "A complete design contract and a review record"
  }
];
