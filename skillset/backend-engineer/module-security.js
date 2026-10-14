Object.assign(SkillData.modules.find(m => m.id === 'security'), {
  status: 'ready',
  goal: `Be able to review a backend for the failures that cause real breaches: you think like an attacker, check who may do what on every object, keep passwords, sessions and tokens sound, close injection, XSS and CSRF, limit abuse, protect secrets and verify configuration with evidence.`,
  competencies: [
    `Draw trust boundaries and write abuse cases and a STRIDE threat table.`,
    `Review password storage, sessions and cookie flags.`,
    `Judge tokens and JWT against sessions, with a revocation plan.`,
    `Check object-level and function-level authorization with two-user tests.`,
    `Spot injection, XSS, CSRF and SSRF sinks and the control for each.`,
    `Set rate limits by cost and manage secrets with rotation.`,
    `Verify security headers, privileges and the route inventory on a deployed environment.`
  ],
  artifact: `A <b>security review record</b>: the threat table with abuse cases, the authentication design, the authorization matrix, the input-to-sink table, the rate limit table and secrets inventory, and the configuration checklist with evidence and an owner per row.`,
  agent: `The agent, using the <code>security-review</code> skill, builds the threat table and authorization matrix from the route table, runs attacking tests (two members, forged requests, forced errors), scans dependencies and secrets, and assembles the record. You review its evidence and sign off on accepted risks.`,
  skillName: 'security-review'
});
delete SkillData.modules.find(m => m.id === 'security').outline;
SkillData.modules.find(m => m.id === 'security').skillDescription = "Review backend code and designs for security: attacker mindset, authentication, sessions and tokens, object- and function-level authorization, injection, XSS, CSRF, rate limiting, secrets and headers. Use for security review, threat modelling, auth design, or before merging an agent-written endpoint.";
