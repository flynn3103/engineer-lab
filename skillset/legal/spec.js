/* Curriculum layout for the Legal professional skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "legal",
  "name": "Legal",
  "role": "Legal professional",
  "root": "../../",
  "plugin": {
    "name": "legal-counsel",
    "agent": "legal-counsel"
  },
  "related": []
};
SkillData.spec = {
  "title": "Legal: spot the risk, know when to escalate, and review an agent's legal work",
  "navTitle": "Legal",
  "lead": "Learn the legal foundations a product company needs: contracts, platform terms and liability, privacy, intellectual property, consumer and advertising rules, employment and corporate basics, regulatory risk and incidents, and how to review legal drafts and summaries an agent produced. It is educational and is not legal advice.",
  "overview": [
    "<b>What the role does.</b> Legal protects the company by identifying risk, shaping agreements and policies, keeping the business within the law, and managing disputes. The work is judgment: how likely, how bad, and what to do.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a contract review memo or a privacy assessment that the agent produces and you review. Laws differ by country, so every rule must be confirmed with qualified counsel in your jurisdiction."
  ],
  "audience": [
    "You work with or in legal and want to understand risk concretely.",
    "You will use the <b>legal-counsel</b> agent and must catch its mistakes, which can be severe.",
    "You review contracts, policies and compliance summaries."
  ],
  "outcomes": [
    "Read a contract for the clauses that carry risk.",
    "Map what a marketplace platform must handle: user content, privacy, consumer rules.",
    "Escalate to qualified counsel at the right time with the right facts.",
    "Review an agent's legal output for invented citations and jurisdiction errors."
  ],
  "prerequisites": [
    "No legal background required. You must be willing to verify every rule against local law."
  ],
  "mindset": [
    [
      "Risk, not yes or no",
      "Legal questions are usually about likelihood and consequence.",
      "How likely is this, how bad is it, and what reduces it?"
    ],
    [
      "Jurisdiction decides",
      "The same facts can be lawful in one place and not in another.",
      "Which country's law applies, and who confirmed it?"
    ],
    [
      "Cite or do not claim",
      "A legal statement without a source is a guess.",
      "What is the source, and is it current and real?"
    ],
    [
      "Document the facts",
      "Decisions are judged on records made at the time.",
      "Where is this recorded, and by whom?"
    ],
    [
      "Protect confidentiality",
      "Privileged and personal information needs strict handling.",
      "Who sees this, and is it allowed to leave this system?"
    ],
    [
      "Know when to escalate",
      "Some matters need a qualified lawyer, now.",
      "Is this one of those, and who owns the decision?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is launching a buyer protection program on the marketplace: new terms, money held in escrow, personal data and consumer rules."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A review record for legal work: sources, jurisdiction, risk, escalation.",
      "Attaches a verifiable source and the jurisdiction to every statement."
    ],
    [
      "02 to 05 Contracts, platform terms, privacy, IP",
      "A contract review memo, a terms and policy draft, a privacy assessment and an IP checklist.",
      "Drafts them, marks unverified points and flags what needs counsel."
    ],
    [
      "06 to 09 Consumer, corporate, regulatory, disputes",
      "A compliance checklist, a corporate records list and an incident response plan.",
      "Produces them and escalates anything high risk."
    ],
    [
      "10 to 11 Agent review, capstone",
      "A legal review checklist and a launch review.",
      "Checks citations and jurisdiction and states its limits."
    ]
  ],
  "verify": [
    "<b>Not legal advice.</b> Laws differ by country and change. Every rule, citation and obligation in a lesson must be confirmed with qualified counsel in your jurisdiction before it is relied on. Names of laws are examples to look up, not conclusions.",
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
    "summary": "The habits and a review protocol for legal drafts and summaries.",
    "outline": [
      "Risk, not yes or no",
      "Jurisdiction decides",
      "Cite or do not claim",
      "Know when to escalate",
      "Reviewing an agent's legal output"
    ],
    "artifact": "A review record for one legal document or summary"
  },
  {
    "id": "contracts",
    "tag": "CONTRACTS",
    "name": "Contract fundamentals",
    "status": "planned",
    "summary": "Read and shape agreements.",
    "outline": [
      "Formation and key terms",
      "Liability, indemnity and limits",
      "Term, termination and renewal",
      "Confidentiality and data clauses",
      "A contract review checklist"
    ],
    "artifact": "A contract review memo"
  },
  {
    "id": "platform",
    "tag": "PLATFORM",
    "name": "Terms of service and platform liability",
    "status": "planned",
    "summary": "What a marketplace must set rules for.",
    "outline": [
      "User content and responsibility",
      "Notice and takedown processes",
      "Prohibited items and enforcement",
      "Disputes between users",
      "Escrow and payments terms"
    ],
    "artifact": "A terms of service outline and an enforcement policy"
  },
  {
    "id": "privacy",
    "tag": "PRIVACY",
    "name": "Privacy and data protection",
    "status": "planned",
    "summary": "Handle personal data lawfully.",
    "outline": [
      "Personal data and lawful grounds",
      "Consent and purpose limits",
      "Data subject rights",
      "Cross-border transfers",
      "Breach response"
    ],
    "artifact": "A privacy assessment"
  },
  {
    "id": "ip",
    "tag": "IP",
    "name": "Intellectual property and content",
    "status": "planned",
    "summary": "Own and use content correctly.",
    "outline": [
      "Copyright and user content licences",
      "Trademarks",
      "Open source licences",
      "Employee and contractor IP",
      "Takedown claims"
    ],
    "artifact": "An IP checklist"
  },
  {
    "id": "consumer",
    "tag": "CONSUMER",
    "name": "Advertising and consumer protection",
    "status": "planned",
    "summary": "Be fair with customers.",
    "outline": [
      "Advertising claims",
      "Price and fee transparency",
      "Reviews and ratings",
      "Promotions and terms",
      "Complaint handling"
    ],
    "artifact": "A consumer compliance checklist"
  },
  {
    "id": "corporate",
    "tag": "CORPORATE",
    "name": "Employment and corporate basics",
    "status": "planned",
    "summary": "The records and relationships of the company.",
    "outline": [
      "Employment and contractor agreements",
      "Equity and option basics",
      "Board and shareholder records",
      "Policies and codes of conduct",
      "Records and retention"
    ],
    "artifact": "A corporate records list"
  },
  {
    "id": "regulatory",
    "tag": "REGULATORY",
    "name": "Regulatory and risk management",
    "status": "planned",
    "summary": "Know which rules apply and how to stay within them.",
    "outline": [
      "Licences and registrations",
      "Anti-money-laundering and identity checks",
      "Sanctions and export awareness",
      "Compliance programs",
      "Incident escalation"
    ],
    "artifact": "A regulatory map and a compliance program outline"
  },
  {
    "id": "disputes",
    "tag": "DISPUTES",
    "name": "Disputes and incident response",
    "status": "planned",
    "summary": "Respond when something goes wrong.",
    "outline": [
      "Preserving evidence and legal hold",
      "Investigations",
      "Communications under pressure",
      "Settlement basics",
      "Working with outside counsel"
    ],
    "artifact": "An incident response plan"
  },
  {
    "id": "agent-legal",
    "tag": "AGENT LEGAL",
    "name": "Reviewing agent-made legal work",
    "status": "planned",
    "summary": "Catch the ways generated legal content misleads.",
    "outline": [
      "Invented cases and statutes",
      "Wrong or mixed jurisdictions",
      "Overconfident conclusions",
      "Confidentiality leaks",
      "What always goes to a lawyer"
    ],
    "artifact": "A legal review checklist"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: buyer protection program",
    "status": "planned",
    "summary": "Review the legal side of a buyer protection launch, then review an agent-made memo.",
    "outline": [
      "Facts and jurisdiction",
      "Terms and escrow",
      "Privacy and consumer rules",
      "Risks and escalation",
      "Review with the five lenses"
    ],
    "artifact": "A launch review memo and a review record"
  }
];
