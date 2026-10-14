Object.assign(SkillData.modules.find(m => m.id === 'performance'), {
  status: 'ready',
  goal: `Review performance work on evidence: a target stated as a percentile, a measured bottleneck, indexes and queries proven by plans, caches with a stated staleness rule, concurrency matched to the kind of work, and races closed in the database.`,
  competencies: [
    `State a latency target as an SLO and read p50, p95 and p99 instead of averages.`,
    `Use Little's law and utilization to size pools and workers and to see where queues form.`,
    `Locate a bottleneck with a trace, profile or query plan before accepting an optimization.`,
    `Spot missing indexes, N+1 queries and oversized or misused connection pools.`,
    `Judge a caching design: pattern, invalidation, TTL, stampede and outage behavior.`,
    `Match IO-bound and CPU-bound work to threads, event loops or workers with bounded concurrency.`,
    `Find check-then-act races and demand constraints, atomic statements or correct locks with a parallel test.`
  ],
  artifact: `A performance report: SLO and load model with baseline percentiles, bottleneck evidence with plans before and after, an index and query-count table, a cache table, a concurrency table and a concurrency-hazard list with parallel test results.`,
  agent: `The agent, using this skill (intended behavior: the plugin does not exist yet), profiles before optimizing, attaches percentile tables and query plans to each change, justifies caches and indexes, and adds parallel tests for races.`,
  skillName: 'performance-review'
});
delete SkillData.modules.find(m => m.id === 'performance').outline;
SkillData.modules.find(m => m.id === 'performance').skillDescription = "Diagnose and review performance with evidence: latency percentiles and queuing, profiles and query plans, indexes, N+1 and pools, caching and invalidation, IO versus CPU bound concurrency and races. Use when something is slow, when a performance claim needs checking, or when adding a cache or concurrency.";
