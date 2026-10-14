Object.assign(SkillData.modules.find(m => m.id === 'reliability'), {
  status: 'ready',
  goal: `Be able to review how a service fails and how it tells you. You check that errors are classified and safe, that bad configuration stops the deploy, that the platform can start and stop instances without dropping requests, and that logs, metrics, traces and alerts let a stranger find and fix an incident.`,
  competencies: [
    `Define error classes and a single global handler with safe bodies.`,
    `Validate configuration at startup and protect secrets.`,
    `Separate liveness from readiness and implement graceful shutdown.`,
    `Specify structured logs, metrics, traces and the golden signals.`,
    `Write SLIs, SLOs and burn-rate alerts with runbooks.`
  ],
  artifact: `A failure table (error classes, configuration schema, health and shutdown behavior, alerts) and an observability plan.`,
  agent: `The agent, using this skill, drafts the error handler, the configuration schema, the health endpoints and shutdown sequence, the instrumentation and the alert rules, and attaches a drill that breaks a dependency and shows the result.`,
  skillName: 'reliability-ops'
});
delete SkillData.modules.find(m => m.id === 'reliability').outline;
SkillData.modules.find(m => m.id === 'reliability').skillDescription = "Make a service reliable and operable: error handling, validated configuration, health checks, graceful shutdown, structured logs, metrics and traces, SLOs and alerts. Use when hardening a service, reviewing failure behavior, or designing observability and on-call readiness.";
