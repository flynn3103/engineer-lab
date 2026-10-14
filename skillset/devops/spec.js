/* Curriculum layout for the DevOps engineer skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "devops",
  "name": "DevOps Engineer",
  "role": "DevOps engineer",
  "root": "../../",
  "plugin": {
    "name": "platform-engineer",
    "agent": "devops-engineer"
  },
  "related": []
};
SkillData.spec = {
  "title": "DevOps engineer: ship safely, run reliably, review what an agent changes",
  "navTitle": "DevOps engineer",
  "lead": "Learn to package, deploy, observe and operate software, and to review infrastructure and pipeline changes made by an agent, where one wrong line can take down production.",
  "overview": [
    "<b>What the role does.</b> A DevOps engineer builds the paths that take code to production and keeps what runs there healthy: containers, pipelines, infrastructure as code, observability, reliability, security and cost.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a pipeline definition or a runbook that the agent produces and you review."
  ],
  "audience": [
    "You run or build delivery and infrastructure and want a reliable method.",
    "You will use the <b>devops-engineer</b> agent and must judge its changes before they reach production.",
    "You review infrastructure plans and pipeline changes."
  ],
  "outcomes": [
    "Build a delivery pipeline with safe deployment and rollback.",
    "Read an infrastructure plan and spot the dangerous change.",
    "Define service levels and alerts that mean something.",
    "Review agent-made infrastructure changes for blast radius, secrets and recoverability."
  ],
  "prerequisites": [
    "You can use a Linux shell and read basic YAML. The course links to the Kubernetes and Kafka courses on this site."
  ],
  "mindset": [
    [
      "Reduce the blast radius",
      "Change a little, in a place that can fail safely.",
      "What breaks if this is wrong, and how many users see it?"
    ],
    [
      "Everything is code and reviewed",
      "Infrastructure that is not in version control cannot be reviewed or recovered.",
      "Where is this defined, and who approved the change?"
    ],
    [
      "Automate the repeatable",
      "A manual step will be skipped or done wrong.",
      "Which step here is still manual, and why?"
    ],
    [
      "Assume failure",
      "Disks fill, nodes die, regions fail, secrets leak.",
      "How do we recover, and when did we last practice?"
    ],
    [
      "You cannot fix what you cannot see",
      "Logs, metrics and traces decide how fast you recover.",
      "How would on-call know this broke, and where would they look?"
    ],
    [
      "Least privilege",
      "Every identity gets the minimum access for its job.",
      "Why does this role need this permission?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is shipping the ad service and its database migration to production during business hours without downtime."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A change review record: blast radius, rollback, evidence.",
      "Attaches blast radius and rollback to every change."
    ],
    [
      "02 to 06 Foundations, containers, orchestration, CI/CD, IaC",
      "An image definition, a pipeline and an infrastructure plan.",
      "Drafts them and explains each plan diff before applying."
    ],
    [
      "07 to 09 Observability, reliability, security",
      "Service levels, alerts, runbooks and a secrets design.",
      "Produces them and tests the alert and the restore path."
    ],
    [
      "10 to 12 Data ops, releases, capstone",
      "A backup and restore plan, a release plan and a cost view.",
      "Runs a drill and reports what it found."
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
    "summary": "The habits and a review protocol for infrastructure and pipeline changes.",
    "outline": [
      "Reduce the blast radius",
      "Everything is code and reviewed",
      "Assume failure",
      "Evidence: plans, diffs and drills",
      "Reviewing an agent's infrastructure change"
    ],
    "artifact": "A change review record"
  },
  {
    "id": "foundations",
    "tag": "FOUNDATIONS",
    "name": "Linux, networking and cloud basics",
    "status": "planned",
    "summary": "The layers that every other tool sits on.",
    "outline": [
      "Processes, files and permissions",
      "Networking: DNS, TCP, TLS, load balancers",
      "Cloud building blocks and their limits",
      "Identity and access",
      "Cost basics"
    ],
    "artifact": "A system map of the marketplace"
  },
  {
    "id": "containers",
    "tag": "CONTAINERS",
    "name": "Containers",
    "status": "planned",
    "summary": "Package software so it runs the same everywhere.",
    "outline": [
      "Images and layers",
      "Writing a small, safe Dockerfile",
      "Registries and tags",
      "Runtime limits and isolation",
      "Image scanning"
    ],
    "artifact": "An image definition and a scan report"
  },
  {
    "id": "orchestration",
    "tag": "ORCHESTRATION",
    "name": "Orchestration",
    "status": "planned",
    "summary": "Run containers at scale with a scheduler.",
    "outline": [
      "Kubernetes objects",
      "Scheduling, requests and limits",
      "Config and secrets",
      "Service networking and ingress",
      "Autoscaling"
    ],
    "artifact": "A deployment manifest set with limits and probes"
  },
  {
    "id": "cicd",
    "tag": "CI/CD",
    "name": "CI/CD",
    "status": "planned",
    "summary": "Turn a commit into a safe release.",
    "outline": [
      "Pipeline stages and caching",
      "Building once and promoting artifacts",
      "Deployment strategies: rolling, blue-green, canary",
      "Rollback",
      "Pipeline security"
    ],
    "artifact": "A pipeline definition with a rollback step"
  },
  {
    "id": "iac",
    "tag": "IaC",
    "name": "Infrastructure as code",
    "status": "planned",
    "summary": "Define infrastructure in reviewed files.",
    "outline": [
      "Declarative infrastructure and state",
      "Modules and environments",
      "Reading a plan: the dangerous diff",
      "Drift and imports",
      "Reviewing an agent's plan"
    ],
    "artifact": "An infrastructure module and an annotated plan"
  },
  {
    "id": "observability",
    "tag": "OBSERVABILITY",
    "name": "Observability",
    "status": "planned",
    "summary": "See what the system is doing.",
    "outline": [
      "Logs, metrics and traces",
      "Service level indicators and objectives",
      "Alerts that mean something",
      "Dashboards for decisions",
      "Cost of telemetry"
    ],
    "artifact": "Service levels, alert rules and a dashboard spec"
  },
  {
    "id": "reliability",
    "tag": "RELIABILITY",
    "name": "Reliability and incident response",
    "status": "planned",
    "summary": "Stay up, and recover well.",
    "outline": [
      "Error budgets",
      "Capacity and load testing",
      "Incident roles and communication",
      "Postmortems without blame",
      "Failure drills and game days"
    ],
    "artifact": "A runbook and a postmortem template"
  },
  {
    "id": "security",
    "tag": "SECURITY",
    "name": "Security and secrets",
    "status": "planned",
    "summary": "Protect the platform and the pipeline.",
    "outline": [
      "Least privilege and identity",
      "Secrets management",
      "Supply-chain security",
      "Network policy and segmentation",
      "Audit and compliance evidence"
    ],
    "artifact": "A secrets and access design"
  },
  {
    "id": "dataops",
    "tag": "DATA OPS",
    "name": "Data and platform operations",
    "status": "planned",
    "summary": "Run stateful systems safely.",
    "outline": [
      "Backups and restores that are tested",
      "Database operations and migrations",
      "Queues and brokers in production",
      "Storage and retention",
      "Cost and capacity planning"
    ],
    "artifact": "A backup and restore plan with a drill result"
  },
  {
    "id": "release",
    "tag": "RELEASE",
    "name": "Release engineering",
    "status": "planned",
    "summary": "Coordinate code, data and config changes.",
    "outline": [
      "Environments and promotion",
      "Migrations and deploy order",
      "Feature flags",
      "Canary analysis",
      "Release communication"
    ],
    "artifact": "A release plan"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: ship the ad service",
    "status": "planned",
    "summary": "Take a service from commit to production, then review an agent-made pipeline.",
    "outline": [
      "Containerize and test",
      "Pipeline and deployment strategy",
      "Observe and set alerts",
      "Break it and recover",
      "Review with the five lenses"
    ],
    "artifact": "A running pipeline, a runbook and a review record"
  }
];
