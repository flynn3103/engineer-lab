Object.assign(SkillData.modules.find(m => m.id === 'quality'), {
  status: 'ready',
  goal: `Be able to judge whether the tests of a change prove its requirements. You map requirements to the right test level, check data rules against a real database, keep end-to-end tests thin and stable, prove that tests can fail, and confirm the checks are wired as gates.`,
  competencies: [
    `Map requirements and failure cases to test levels.`,
    `Distinguish unit from integration tests and choose doubles well.`,
    `Design stable end-to-end journeys and safe test data.`,
    `Detect tautological tests and use mutation thinking.`,
    `Define quality gates and their order in the pipeline.`
  ],
  artifact: `A test plan mapped to the requirements: the requirement to test map, unit and integration tests, E2E journeys, the review record and the gate table.`,
  agent: `The agent, using this skill, builds the requirement to test map, writes the tests at the cheapest sufficient level, shows each test failing against a deliberate break, and wires the gates with an evidence summary on each change.`,
  skillName: 'testing'
});
delete SkillData.modules.find(m => m.id === 'quality').outline;
SkillData.modules.find(m => m.id === 'quality').skillDescription = "Design and review tests that prove the requirements: the test pyramid, unit and integration tests, end-to-end tests and test data, spotting tautological tests, mutation thinking and quality gates. Use when writing a test plan, reviewing tests (especially agent-written ones), or deciding what to automate.";
