/* Curriculum layout for the Data scientist skill-set course. Modules are planned: lesson titles and artifacts are listed, lessons come later.
 * Generated once from a layout draft, now maintained by hand. See .claude/skills/learn-from-scratch/references/skillset-template.md. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.config = {
  "id": "data-science",
  "name": "Data Scientist",
  "role": "Data scientist",
  "root": "../../",
  "plugin": {
    "name": "data-scientist",
    "agent": "data-scientist"
  },
  "related": []
};
SkillData.spec = {
  "title": "Data scientist: build models that hold up, and review what an agent models",
  "navTitle": "Data scientist",
  "lead": "Learn to frame a prediction or decision problem, prepare data without leakage, train and evaluate models honestly, ship them with monitoring, and review a model an agent built for leakage, weak baselines and overclaimed results.",
  "overview": [
    "<b>What the role does.</b> A data scientist uses statistics and machine learning to predict, rank, group or explain, and to measure the effect of changes. The hard part is not fitting a model. It is framing the problem and not fooling yourself about how well it works.",
    "<b>How this course works.</b> Each module has lessons with a worked example on the marketplace, practice and a checklist, and ends in an artifact such as a problem framing or an evaluation report that the agent produces and you review."
  ],
  "audience": [
    "You build models or analyses and want results that survive contact with production.",
    "You will use the <b>data-scientist</b> agent and must find leakage and weak evaluation in its work.",
    "You review model proposals and experiment results."
  ],
  "outcomes": [
    "Frame a problem, choose a metric and set a baseline.",
    "Split and prepare data without leakage.",
    "Evaluate a model honestly, including error analysis and calibration.",
    "Review an agent-made model and decide whether to ship it."
  ],
  "prerequisites": [
    "You can read Python and have met basic statistics. The course rebuilds the statistics it uses."
  ],
  "mindset": [
    [
      "Baseline first",
      "If a simple rule is nearly as good, the complex model is a cost.",
      "What is the baseline, and how much better is the model?"
    ],
    [
      "Suspect leakage",
      "A result that is too good usually means the model saw the answer.",
      "What features could not exist at prediction time?"
    ],
    [
      "Evaluate on what matters",
      "A metric that ignores the cost of errors hides the failure.",
      "What does a false positive cost versus a false negative?"
    ],
    [
      "Uncertainty is a result",
      "A score with no range is not a result.",
      "How much would the score move with different data?"
    ],
    [
      "Models decay",
      "Data and behavior change after launch.",
      "How will we detect drift, and when do we retrain?"
    ],
    [
      "Responsible by default",
      "Bias, privacy and misuse are design questions.",
      "Who could this harm, and how would we know?"
    ]
  ],
  "scenario": {
    "title": "One scenario for every lesson: a classifieds marketplace",
    "body": "<b>Meet the marketplace.</b> Members post ads in categories. Buyers search, save ads and chat with sellers. Moderators handle reports. Every course on this site uses the same scenario, so the roles can be seen working on the same product. The lens here is ranking ads in search and predicting which new ads will get a reply, without unfairly burying small sellers."
  },
  "gate": [
    [
      "01 Mindset and review",
      "A model review record: framing, baseline, leakage check, evaluation, risks.",
      "Attaches its baseline, leakage check and uncertainty to every model."
    ],
    [
      "02 to 05 Framing, data, statistics, supervised learning",
      "A problem framing, a leakage-safe split and a trained baseline.",
      "Builds them and documents each choice."
    ],
    [
      "06 to 09 Evaluation, unsupervised, time series, deep learning",
      "An evaluation report, error analysis and forecast backtests.",
      "Runs them and shows where the model fails."
    ],
    [
      "10 to 13 Experiments, MLOps, responsibility, capstone",
      "An experiment plan, a monitoring plan and a risk note.",
      "Produces them and flags anything that needs human sign-off."
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
    "summary": "The habits and a review protocol for models and results.",
    "outline": [
      "Baseline first",
      "Suspect leakage",
      "Evaluate on what matters",
      "Uncertainty is a result",
      "Reviewing an agent's model"
    ],
    "artifact": "A review record for one model"
  },
  {
    "id": "framing",
    "tag": "FRAMING",
    "name": "Problem framing and baselines",
    "status": "planned",
    "summary": "Decide what to predict and what good looks like.",
    "outline": [
      "Prediction, inference or decision",
      "Targets and labels",
      "Success metric and cost of errors",
      "Rules and simple baselines",
      "Feasibility check"
    ],
    "artifact": "A problem framing and a baseline result"
  },
  {
    "id": "data",
    "tag": "DATA PREP",
    "name": "Data preparation and features",
    "status": "planned",
    "summary": "Prepare data the model can learn from without cheating.",
    "outline": [
      "Train, validation and test splits",
      "Time-aware splits and leakage",
      "Feature engineering",
      "Missing values and encoding",
      "Feature stores and reuse"
    ],
    "artifact": "A leakage-safe dataset and feature list"
  },
  {
    "id": "statistics",
    "tag": "STATISTICS",
    "name": "Statistics and probability",
    "status": "planned",
    "summary": "The foundations under every model.",
    "outline": [
      "Distributions and estimation",
      "Hypothesis tests and intervals",
      "Bayesian thinking",
      "Bias and variance",
      "Sampling and weighting"
    ],
    "artifact": "A statistics notebook for the problem"
  },
  {
    "id": "supervised",
    "tag": "SUPERVISED",
    "name": "Supervised learning",
    "status": "planned",
    "summary": "The core model families and how to choose.",
    "outline": [
      "Linear and logistic models",
      "Trees and ensembles",
      "Regularization",
      "Hyperparameters and search",
      "Interpretability"
    ],
    "artifact": "A trained model with a comparison to the baseline"
  },
  {
    "id": "evaluation",
    "tag": "EVALUATION",
    "name": "Evaluation",
    "status": "planned",
    "summary": "Judge a model honestly.",
    "outline": [
      "Metrics by problem type",
      "Cross-validation",
      "Calibration and thresholds",
      "Imbalanced data",
      "Error analysis and slices"
    ],
    "artifact": "An evaluation report with error analysis"
  },
  {
    "id": "unsupervised",
    "tag": "UNSUPERVISED",
    "name": "Unsupervised learning and ranking",
    "status": "planned",
    "summary": "Find structure, similarity and order.",
    "outline": [
      "Clustering",
      "Dimensionality reduction",
      "Embeddings and similarity",
      "Ranking and recommendation",
      "Evaluating search relevance"
    ],
    "artifact": "A ranking or clustering report"
  },
  {
    "id": "timeseries",
    "tag": "TIME SERIES",
    "name": "Time series and forecasting",
    "status": "planned",
    "summary": "Predict quantities over time.",
    "outline": [
      "Decomposition",
      "Baselines and backtesting",
      "Models and intervals",
      "Scenarios",
      "Monitoring a forecast"
    ],
    "artifact": "A forecast with backtest evidence"
  },
  {
    "id": "deep",
    "tag": "DEEP LEARNING",
    "name": "Deep learning and language models",
    "status": "planned",
    "summary": "Use neural models where they earn their cost.",
    "outline": [
      "Neural network essentials",
      "Embeddings and transformers",
      "Fine-tuning and prompting",
      "Retrieval-augmented generation",
      "Evaluating language model output"
    ],
    "artifact": "A model choice record with evaluation"
  },
  {
    "id": "causal",
    "tag": "CAUSAL",
    "name": "Experimentation and causal inference",
    "status": "planned",
    "summary": "Measure the effect of a change.",
    "outline": [
      "A/B tests and power",
      "Uplift modeling",
      "Difference-in-differences",
      "Limits of observational data",
      "Reading and reporting results"
    ],
    "artifact": "An experiment or causal analysis plan"
  },
  {
    "id": "mlops",
    "tag": "MLOPS",
    "name": "MLOps",
    "status": "planned",
    "summary": "Ship, watch and retrain.",
    "outline": [
      "Reproducibility and versioning",
      "Packaging and serving",
      "Monitoring and drift",
      "Retraining",
      "Rollback and shadow mode"
    ],
    "artifact": "A deployment and monitoring plan"
  },
  {
    "id": "responsible",
    "tag": "RESPONSIBLE",
    "name": "Responsible machine learning",
    "status": "planned",
    "summary": "Anticipate harm and explain decisions.",
    "outline": [
      "Fairness and bias checks",
      "Privacy",
      "Explainability",
      "Failure modes and misuse",
      "Documentation: model cards"
    ],
    "artifact": "A model card and a risk note"
  },
  {
    "id": "capstone",
    "tag": "CAPSTONE",
    "name": "Capstone: predict first replies",
    "status": "planned",
    "summary": "Build and evaluate a model for ad replies, then review an agent-made version.",
    "outline": [
      "Frame and baseline",
      "Prepare and split",
      "Train and evaluate",
      "Plan deployment and monitoring",
      "Review with the five lenses"
    ],
    "artifact": "A model, an evaluation report and a review record"
  }
];
