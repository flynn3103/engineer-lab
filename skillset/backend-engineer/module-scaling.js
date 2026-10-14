Object.assign(SkillData.modules.find(m => m.id === 'scaling'), {
  status: 'ready',
  goal: `Be able to scale a backend from measurements and not from habit: size a stateless tier behind a load balancer, add read replicas without creating stale-read bugs, decide whether sharding is justified and choose a key, cache content at a CDN without leaking private data, and write a scaling plan as a ladder of steps with measured triggers. You can also review an agent's scaling proposal and ask for the bottleneck evidence behind it.`,
  competencies: [
    `Size an application tier and choose a load balancing algorithm and health and drain settings.`,
    `Classify reads by tolerable staleness and handle replication lag and read-your-writes.`,
    `Decide when to shard, choose a shard key against access patterns and plan resharding.`,
    `Set cache headers and invalidation for a CDN and keep personal data out of shared caches.`,
    `Find the bottleneck with the USE method and a realistic load test, and write triggers for each next step.`
  ],
  artifact: `A <b>scaling plan</b> for one system: the measured bottleneck, application tier sizing and balancing, a read classification table for replicas, the sharding decision record (or the evidence that it is not needed), the content cache policy, and a ladder of steps each with a measured trigger, an owner and a cost.`,
  agent: `The agent, using the <code>scaling-review</code> skill, measures before it recommends, shows before and after numbers for each change, writes the plan as a table of triggers, classifies reads by staleness, tests that private responses are never shared-cached, and refuses to propose sharding or new infrastructure without evidence that the cheaper steps were exhausted.`,
  skillName: 'scaling-review'
});
delete SkillData.modules.find(m => m.id === 'scaling').outline;
SkillData.modules.find(m => m.id === 'scaling').skillDescription = "Plan and review scaling: stateless services, load balancing, read replicas and lag, sharding, CDNs, and the rule to measure first. Use when someone proposes sharding, replicas, microservices or caching to scale, or asks how to handle 10x traffic.";
