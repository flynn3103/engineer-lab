Object.assign(SkillData.modules.find(m => m.id === 'requirements'), {
  status: 'ready',
  goal: `Be able to take a vague request and produce a functional spec that can be built and tested: a problem statement, numbered requirements with numbers on every quality, acceptance criteria that can fail, and a glossary with a clear scope. You can also review a spec an agent wrote and find the invented, vague and missing parts.`,
  competencies: [
    `Separate the need from the proposed solution and write a problem statement with a measure.`,
    `Write functional requirements as behavior and non-functional requirements with metric, target and conditions.`,
    `Write acceptance criteria that cover boundaries, invalid input, conflicts and permissions.`,
    `Keep a glossary, a scope and an out-of-scope list, and a visible list of open questions.`,
    `Review an agent-written spec for invented facts, smell words and gaps.`
  ],
  artifact: `A <b>functional spec</b> for one feature: the quoted request and problem statement, numbered functional and non-functional requirements, acceptance criteria with a traceability table, a glossary with states, scope and out-of-scope with reasons, assumptions and open questions.`,
  agent: `The agent, using the <code>functional-spec</code> skill, restates each request as a problem statement, turns quality words into measurable targets (marked as assumptions until a person confirms them), drafts criteria and the glossary, labels the source of every requirement, and lists the nouns that become entities for the data model. It never adds scope without a change request.`,
  skillName: 'functional-spec'
});
delete SkillData.modules.find(m => m.id === 'requirements').outline;
SkillData.modules.find(m => m.id === 'requirements').skillDescription = "Turn a backend request into a testable functional spec: problem statement, functional and non-functional requirements with measurable targets, acceptance criteria, glossary and out-of-scope. Use when asked to write, clarify or review requirements or acceptance criteria, or when a request is vague.";
