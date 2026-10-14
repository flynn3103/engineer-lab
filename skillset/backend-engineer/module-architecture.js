Object.assign(SkillData.modules.find(m => m.id === 'architecture'), {
  status: 'ready',
  goal: `Be able to go from a functional spec to a design you can defend: estimates that show the real size of the problem, the fewest components that meet it, a deployment shape chosen for stated reasons, an explicit home for every piece of state, and decision records and diagrams that a reviewer can check. You can also take an agent's architecture and ask which requirement and which number justify each box.`,
  competencies: [
    `Estimate traffic, storage and bandwidth with labelled inputs and a peak factor.`,
    `Derive components from requirements, starting from the simplest design.`,
    `Compare monolith, services and serverless by what each costs, and set an extraction trigger.`,
    `Keep servers stateless, make a state inventory and design queues with a failure model.`,
    `Write decision records and draw one-level diagrams with a legend.`
  ],
  artifact: `A <b>design document</b> for one system: the problem statement, an estimation table, a component diagram with the requirement and number behind each component, the state inventory, the deployment shape with extraction triggers, numbered decision records, and a list of risks and invented numbers.`,
  agent: `The agent, using the <code>system-design</code> skill, builds the estimation table from your spec first, starts from the minimum design, adds each component only with a requirement and a number, produces the state inventory and the decision records with rejected options and revisit triggers, and marks hard-to-reverse choices for your approval.`,
  skillName: 'system-design'
});
delete SkillData.modules.find(m => m.id === 'architecture').outline;
SkillData.modules.find(m => m.id === 'architecture').skillDescription = "Design a backend system top-down: estimates, components, the real costs of monolith versus services versus serverless, where state lives, and decision records with diagrams. Use for 'design X', high-level design, architecture review or capacity estimation.";
