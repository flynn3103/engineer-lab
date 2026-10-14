Object.assign(SkillData.modules.find(m => m.id === 'capstone'), {
  status: 'ready',
  goal: `Be able to design a small public service end to end and then review someone else's version of it: you state the problem with numbers, choose identifiers and a data model, make the hot path fast and safe, plan for failure and abuse, and judge an agent's submission with the five lenses and evidence.`,
  competencies: [
    `Write a problem statement with estimates and find the dominant path.`,
    `Choose identifier generation and let the database enforce uniqueness.`,
    `Design a cached redirect path that survives misses, hot keys and invalidation.`,
    `Produce a failure table, abuse controls and an observability plan with an SLO.`,
    `Review an agent-made service with five lenses and rank evidence requests.`
  ],
  artifact: `A <b>complete design and a review record</b> for a URL shortener: problem statement and estimates, identifier decision and data model, redirect and caching design, failure, abuse and observability plan, and the five-lens review record of the agent-made version.`,
  agent: `The agent, using this skill, writes the four design sections and a five-lens review record with evidence attached, reusing the checklists of the other modules. You review its reasoning and decide whether to accept, accept with follow-ups, or reject, and you own the decisions it reserves for a human.`,
  
});
delete SkillData.modules.find(m => m.id === 'capstone').outline;
SkillData.modules.find(m => m.id === 'capstone').skillDescription = "End-to-end exercise and checklist: design a small service (a URL shortener) from problem statement to data model, redirect path, failure and abuse handling, then review an agent-made version with the five lenses. Use to practice or to run a full design plus review of a small backend service.";
